import { NextRequest, NextResponse } from "next/server";
import { aggregateSearch, enrichWithOa } from "@/lib/academic/aggregator";
import { preprocessQuery } from "@/lib/llm/query-preprocessor";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      query,
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

    // 1. LLM 预处理：自然语言 → 优化的英文搜索查询
    const processed = await preprocessQuery(query);

    // 2. 用优化后的查询搜学术数据库
    const papers = await aggregateSearch({
      query: processed.optimizedQuery,
      maxResults,
      minYear: minYear ? Number(minYear) : undefined,
      maxYear: maxYear ? Number(maxYear) : undefined,
      minCitationCount: minCitationCount ? Number(minCitationCount) : undefined,
      articleTypes,
      sortBy,
    });

    // 3. 补充 OA 信息
    const enriched = await enrichWithOa(papers);

    // 4. OA 偏好排序
    if (onlyOpenAccess) {
      enriched.sort((a, b) => (b.oaPdfUrl ? 1 : 0) - (a.oaPdfUrl ? 1 : 0));
    }

    return NextResponse.json({
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
      },
    });
  } catch (error) {
    console.error("Literature search error:", error);
    return NextResponse.json(
      { error: "Search failed. Please try again." },
      { status: 500 }
    );
  }
}
