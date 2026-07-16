import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db-server";
import { requireAuth, requireProjectAccess } from "@/lib/api-auth";
import {
  parseCitations,
  matchCitations,
  type PaperForMatch,
  type ValidationResult,
} from "@/lib/manuscript/citation-parser";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;

  if (!prisma) {
    return NextResponse.json({ error: "Database not available" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const { projectId, text } = body;

    if (!projectId || typeof text !== "string") {
      return NextResponse.json(
        { error: "projectId and text are required" },
        { status: 400 },
      );
    }

    // 验证项目所有权
    const accessResult = await requireProjectAccess(projectId, authResult.userId);
    if ("error" in accessResult) return accessResult.error;

    // 查询项目文献库
    const papers = await prisma.paper.findMany({
      where: { projectId },
      select: {
        id: true,
        title: true,
        authors: true,
        year: true,
        doi: true,
      },
    });

    const papersForMatch: PaperForMatch[] = papers.map((p: { id: string; title: string; authors: string[]; year: number | null; doi: string | null }) => ({
      id: p.id,
      title: p.title,
      authors: p.authors,
      year: p.year,
      doi: p.doi,
    }));

    // 解析引用
    const citations = parseCitations(text);

    // 匹配
    const matches = matchCitations(citations, papersForMatch);

    // 找未引用文献
    const matchedPaperIds = new Set(
      matches.filter((m) => m.paper).map((m) => m.paper!.id),
    );
    const uncited = papersForMatch.filter((p) => !matchedPaperIds.has(p.id));

    // 未匹配引用
    const unmatched = matches
      .filter((m) => m.matchType === "none")
      .map((m) => m.citation);

    const result: ValidationResult = {
      matches,
      unmatched,
      uncited,
      stats: {
        total: citations.length,
        verified: matches.filter((m) => m.matchType === "exact").length,
        fuzzy: matches.filter((m) => m.matchType === "fuzzy").length,
        unmatched: unmatched.length,
      },
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Citation validation error:", error);
    return NextResponse.json(
      { error: "Failed to validate citations" },
      { status: 500 },
    );
  }
}
