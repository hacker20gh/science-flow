import { NextRequest, NextResponse } from "next/server";
import { getJournalMetrics } from "@/lib/academic/journal-metrics";

/**
 * POST /api/journal-metrics
 * 批量查询期刊指标
 * Body: { journals: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    const { journals } = await req.json();
    if (!Array.isArray(journals) || journals.length === 0) {
      return NextResponse.json({ error: "journals array required" }, { status: 400 });
    }

    const metrics = await getJournalMetrics(journals.slice(0, 50)); // 最多 50 个
    const result: Record<string, unknown> = {};
    metrics.forEach((v, k) => { result[k] = v; });

    return NextResponse.json({ metrics: result });
  } catch (error) {
    console.error("[JournalMetrics] Error:", error);
    return NextResponse.json({ error: "查询失败" }, { status: 500 });
  }
}
