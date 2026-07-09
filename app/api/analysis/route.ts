import { NextRequest, NextResponse } from "next/server";
import { analyzeData, parseCSV } from "@/lib/llm/analysis";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { csvData, experimentContext } = body;

    if (!csvData) {
      return NextResponse.json(
        { error: "csvData is required" },
        { status: 400 }
      );
    }

    // 解析 CSV
    const { summary } = parseCSV(csvData);

    // 调 LLM 分析
    const result = await analyzeData({
      dataDescription: summary,
      rawData: csvData,
      experimentContext,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: "Analysis failed" },
      { status: 500 }
    );
  }
}
