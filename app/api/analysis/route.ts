import { NextRequest } from "next/server";
import { createSSEStream } from "@/lib/llm/streaming";
import { analyzeData, parseCSV } from "@/lib/llm/analysis";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { csvData, experimentContext } = body;

  if (!csvData) {
    return new Response(
      JSON.stringify({ error: "csvData is required" }),
      { status: 400 }
    );
  }

  const { summary } = parseCSV(csvData);

  return createSSEStream(async (emit) => {
    emit({
      type: "progress",
      step: "正在解析数据结构...",
      current: 0,
      total: 2,
    });

    emit({
      type: "progress",
      step: "正在调用 AI 分析...",
      current: 1,
      total: 2,
    });

    const result = await analyzeData({
      dataDescription: summary,
      rawData: csvData,
      experimentContext,
    });

    emit({ type: "result", data: result });
  });
}
