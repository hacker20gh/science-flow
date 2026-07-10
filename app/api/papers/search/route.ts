import { NextRequest, NextResponse } from "next/server";
import { aggregateSearch, enrichWithOa, enrichWithBioRxiv } from "@/lib/academic/aggregator";
import { preprocessQuery } from "@/lib/llm/query-preprocessor";
import { prisma } from "@/lib/db-server";

// 5 分钟结果缓存
const resultCache = new Map<string, { data: unknown; ts: number }>();
const RESULT_CACHE_TTL = 5 * 60 * 1000;

function getCacheKey(body: Record<string, unknown>): string {
  return JSON.stringify({ q: body.query, m: body.maxResults, mi: body.minYear, ma: body.maxYear, c: body.minCitationCount, s: body.sortBy, t: body.articleTypes, o: body.onlyOpenAccess });
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

    // 1. LLM 预处理：自然语言 → 优化的英文搜索查询
    const processed = await preprocessQuery(query);

    // 2. 用优化后的查询搜学术数据库（每个后端用最适合的查询）
    const papers = await aggregateSearch({
      query: processed.optimizedQuery,
      pubmedQuery: processed.pubmedQuery,
      s2Query: processed.s2Query,
      openAlexQuery: processed.openAlexQuery,
      maxResults,
      minYear: minYear ? Number(minYear) : undefined,
      maxYear: maxYear ? Number(maxYear) : undefined,
      minCitationCount: minCitationCount ? Number(minCitationCount) : undefined,
      articleTypes,
      sortBy,
    });

    // 3. 补充 OA 信息（并行 5 路） + bioRxiv（免费预印本 PDF）
    const enriched = await enrichWithOa(papers);
    await enrichWithBioRxiv(enriched);

    // 4. OA 偏好排序（稳定排序：先按 OA 分组，组内保持原顺序）
    if (onlyOpenAccess) {
      const withOa = enriched.filter((p) => p.oaPdfUrl);
      const withoutOa = enriched.filter((p) => !p.oaPdfUrl);
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
            prisma.searchHistory.create({
              data: {
                projectId,
                query,
                optimizedQuery: processed.optimizedQuery,
                sources: allSources,
                maxResults,
                resultCount: enriched.length,
              },
            }).catch(() => {});
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
