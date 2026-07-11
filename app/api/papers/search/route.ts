import { NextRequest, NextResponse } from "next/server";
import { aggregateSearch, enrichWithOa, enrichWithBioRxiv, deduplicate, type UnifiedPaper } from "@/lib/academic/aggregator";
import { preprocessQuery, fastPreprocess } from "@/lib/llm/query-preprocessor";
import { prisma } from "@/lib/db-server";

// 30 分钟结果缓存，带自动清理
const resultCache = new Map<string, { data: unknown; ts: number }>();
const RESULT_CACHE_TTL = 30 * 60 * 1000;

// 每 5 分钟清理过期缓存（HMR-safe 防止重复注册）
const gSearch = globalThis as unknown as { __searchCacheCleanup?: ReturnType<typeof setInterval> };
if (!gSearch.__searchCacheCleanup) {
  gSearch.__searchCacheCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of resultCache) {
      if (now - entry.ts >= RESULT_CACHE_TTL) resultCache.delete(key);
    }
  }, 5 * 60 * 1000);
}

function getCacheKey(body: Record<string, unknown>): string {
  return JSON.stringify({ q: body.query, m: body.maxResults, mi: body.minYear, ma: body.maxYear, c: body.minCitationCount, s: body.sortBy, t: body.articleTypes, o: body.onlyOpenAccess, f: body.fastMode });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      query,
      projectId,
      maxResults = 20,
      minYear,
      maxYear,
      minCitationCount,
      sortBy = "relevance",
      articleTypes = ["journal-article"],
      onlyOpenAccess = false,
      fastMode = false,
    } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "query is required" },
        { status: 400 }
      );
    }

    // 缓存命中检查
    const cacheKey = getCacheKey(body);
    const cached = resultCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < RESULT_CACHE_TTL) {
      console.log("[Search] 缓存命中");
      return NextResponse.json(cached.data);
    }

    // 1. LLM 预处理：自然语言 → 优化的英文搜索查询（快速模式跳过 LLM）
    const processed = fastMode ? fastPreprocess(query) : await preprocessQuery(query);

    // 2. 用优化后的查询搜学术数据库
    // 如果有子查询（长文本拆分），并行搜索所有子查询后合并
    const hasSubQueries = processed.subQueries && processed.subQueries.length > 0;
    const filters = {
      maxResults,
      minYear: minYear ? Number(minYear) : undefined,
      maxYear: maxYear ? Number(maxYear) : undefined,
      minCitationCount: minCitationCount ? Number(minCitationCount) : undefined,
      articleTypes,
      sortBy: sortBy as "relevance" | "citation" | "date" | "impact",
    };

    let papers: UnifiedPaper[];

    if (hasSubQueries) {
      // 只搜索子查询（主查询的意图已被子查询覆盖，避免重复 API 调用）
      const subQueryList = processed.subQueries!.map((sq) => ({
        query: sq.s2Query, pubmedQuery: sq.pubmedQuery, s2Query: sq.s2Query, openAlexQuery: sq.openAlexQuery,
      }));

      // 简单并发控制：最多 2 个 aggregateSearch 同时运行
      const subResults: PromiseSettledResult<UnifiedPaper[]>[] = [];
      const CONCURRENT = 2;
      for (let i = 0; i < subQueryList.length; i += CONCURRENT) {
        const batch = subQueryList.slice(i, i + CONCURRENT);
        const batchResults = await Promise.allSettled(
          batch.map((q) => aggregateSearch({ ...q, ...filters }))
        );
        subResults.push(...batchResults);
      }

      // 合并所有子查询结果，用共享的 deduplicate 函数去重
      const allPapers: UnifiedPaper[] = [];
      for (const result of subResults) {
        if (result.status === "fulfilled") {
          allPapers.push(...result.value);
        }
      }

      papers = deduplicate(allPapers);

      // 排序
      if (sortBy === "citation") papers.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));
      else if (sortBy === "date") papers.sort((a, b) => (b.year || 0) - (a.year || 0));
      else if (sortBy === "impact") papers.sort((a, b) => ((b.influenceScore ?? b.citationCount ?? 0) - (a.influenceScore ?? a.citationCount ?? 0)));

      // 截断到 maxResults
      papers = papers.slice(0, maxResults);
    } else {
      papers = await aggregateSearch({
        query: processed.optimizedQuery,
        pubmedQuery: processed.pubmedQuery,
        s2Query: processed.s2Query,
        openAlexQuery: processed.openAlexQuery,
        ...filters,
      });
    }

    // 3. 补充 OA 信息（并行 5 路） + bioRxiv（免费预印本 PDF）
    const enriched = await enrichWithOa(papers);
    await enrichWithBioRxiv(enriched);

    // 4. OA 偏好排序：有 OA PDF 的排前面（"优先显示" = 排序，不是过滤）
    if (onlyOpenAccess) {
      const withOa = enriched.filter((p) => p.oaPdfUrl);
      const withoutOa = enriched.filter((p) => !p.oaPdfUrl);
      // 有 OA 的排前面，无 OA 的排后面（不删除，保留完整结果）
      enriched.length = 0;
      enriched.push(...withOa, ...withoutOa);
    }

    // 5. 记录搜索历史（fire-and-forget，保存完整参数和结果快照）
    if (projectId && typeof projectId === "string" && prisma) {
      const allSources = [...new Set(enriched.flatMap((p) => p.sources || []))];
      const searchParams = {
        maxResults,
        minYear: minYear ? Number(minYear) : null,
        maxYear: maxYear ? Number(maxYear) : null,
        minCitationCount: minCitationCount ? Number(minCitationCount) : null,
        sortBy,
        articleTypes,
        onlyOpenAccess,
      };
      // 保存结果快照（轻量版）
      const resultSnapshot = enriched.slice(0, 50).map((p) => ({
        pmid: p.pmid,
        doi: p.doi,
        title: p.title,
        authors: p.authors,
        journal: p.journal,
        year: p.year,
        abstract: p.abstract?.slice(0, 500) || "",
        citationCount: p.citationCount,
        isOpenAccess: p.isOpenAccess,
        oaPdfUrl: p.oaPdfUrl,
        tldr: p.tldr,
        articleType: p.articleType,
        sources: p.sources,
      }));

      prisma.searchHistory
        .create({
          data: {
            projectId,
            query,
            optimizedQuery: processed.optimizedQuery,
            sources: allSources,
            maxResults,
            resultCount: enriched.length,
            ...(searchParams && { searchParams }),
            ...(resultSnapshot && { resultSnapshot }),
          } as any,
        })
        .catch((err: unknown) => {
          // 字段不存在时静默降级（DB 未迁移）
          if (err instanceof Error && err.message.includes("column")) {
            console.warn("[Search] 新字段未在 DB 中，跳过快照保存");
            // 降级：不保存新字段
            if (prisma) {
              prisma.searchHistory.create({
                data: {
                  projectId,
                  query,
                  optimizedQuery: processed.optimizedQuery,
                  sources: allSources,
                  maxResults,
                  resultCount: enriched.length,
                },
              }).catch((err: unknown) => {
                console.error("[Search] Failed to save search history (fallback):", err);
              });
            }
          } else {
            console.error("Failed to record search history:", err);
          }
        });
    }

    const responseData = {
      total: enriched.length,
      papers: enriched,
      queryInfo: {
        original: query,
        optimized: processed.optimizedQuery,
        meshTerms: processed.meshTerms,
        intent: processed.searchIntent,
        refinements: processed.suggestedRefinements,
        fastMode,
        subQueries: processed.subQueries?.map((sq) => sq.label) || [],
      },
      sources: {
        pubmed: enriched.filter((p) => p.sources.includes("pubmed")).length,
        semanticScholar: enriched.filter((p) =>
          p.sources.includes("semantic_scholar")
        ).length,
        openAlex: enriched.filter((p) =>
          p.sources.includes("openalex")
        ).length,
      },
    };

    // 写入结果缓存
    resultCache.set(cacheKey, { data: responseData, ts: Date.now() });

    return NextResponse.json(responseData);
  } catch (error) {
    console.error("Literature search error:", error);
    return NextResponse.json(
      { error: "Search failed. Please try again." },
      { status: 500 }
    );
  }
}
