import { NextRequest, NextResponse } from "next/server";
import { aggregateSearch, enrichWithOa } from "@/lib/academic/aggregator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { query, maxResults, minYear, maxYear, minCitationCount } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "query is required" },
        { status: 400 }
      );
    }

    // 1. 聚合搜索（PubMed + Semantic Scholar 并行）
    const papers = await aggregateSearch({
      query,
      maxResults: maxResults || 20,
      minYear,
      maxYear,
      minCitationCount,
    });

    // 2. 补充 OA 信息（查前 10 篇的 Unpaywall）
    const enriched = await enrichWithOa(papers);

    return NextResponse.json({
      total: enriched.length,
      papers: enriched,
      sources: {
        pubmed: enriched.filter((p) => p.sources.includes("pubmed")).length,
        semanticScholar: enriched.filter((p) => p.sources.includes("semantic_scholar")).length,
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
