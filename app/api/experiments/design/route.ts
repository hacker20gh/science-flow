import { NextRequest } from "next/server";
import { designExperiment } from "@/lib/llm/experiment-design";
import { createSSEStream } from "@/lib/llm/streaming";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { hypothesis, matrixSummary, existingExperiments, gapOrConflict } = body;

    if (!hypothesis) {
      return new Response(JSON.stringify({ error: "hypothesis is required" }), { status: 400 });
    }

    return createSSEStream(async (emit) => {
      emit({ type: "progress", step: "正在分析研究背景...", current: 0, total: 1 });

      const design = await designExperiment({
        hypothesis,
        matrixSummary: matrixSummary || "暂无矩阵数据",
        existingExperiments: existingExperiments || [],
        gapOrConflict,
      }, emit); // 传入 emit 实现真流式

      emit({ type: "progress", step: "实验设计完成", current: 1, total: 1 });
      emit({ type: "result", data: design });
    });
  } catch (error) {
    console.error("Experiment design error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate experiment design" }),
      { status: 500 }
    );
  }
}
