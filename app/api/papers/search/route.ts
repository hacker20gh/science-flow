import { NextRequest, NextResponse } from "next/server";
import { aggregateSearch, enrichWithOa } from "@/lib/academic/aggregator";

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

    const papers = await aggregateSearch({
      query,
      maxResults,
      minYear: minYear ? Number(minYear) : undefined,
      maxYear: maxYear ? Number(maxYear) : undefined,
      minCitationCount: minCitationCount ? Number(minCitationCount) : undefined,
      articleTypes,
      sortBy,
    });

    const enriched = await enrichWithOa(papers);

    // OA 排序：如果有 onlyOpenAccess 偏好，把有 OA 的排前面
    if (onlyOpenAccess) {
      enriched.sort((a, b) => (b.oaPdfUrl ? 1 : 0) - (a.oaPdfUrl ? 1 : 0));
    }

    return NextResponse.json({
      total: enriched.length,
      papers: enriched,
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
