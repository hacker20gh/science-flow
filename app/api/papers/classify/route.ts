import { NextRequest, NextResponse } from "next/server";
import { classifyPaperTypes } from "@/lib/llm/extraction";

export async function POST(req: NextRequest) {
  try {
    const { papers } = await req.json();
    if (!Array.isArray(papers) || papers.length === 0) {
      return NextResponse.json({ classifications: {} });
    }

    const classifications = await classifyPaperTypes(
      papers.map((p: { title: string; abstract?: string }) => ({ title: p.title, abstract: p.abstract }))
    );

    // Convert Map to object for JSON
    const result: Record<number, string> = {};
    for (const [idx, type] of classifications) {
      result[idx] = type;
    }

    return NextResponse.json({ classifications: result });
  } catch (error) {
    console.error("[Classify API] 错误:", (error as Error)?.message);
    return NextResponse.json({ classifications: {} });
  }
}
