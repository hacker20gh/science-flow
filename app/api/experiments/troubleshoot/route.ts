import { NextRequest } from "next/server";
import { troubleshootExperiment } from "@/lib/llm/troubleshoot";
import { createSSEStream } from "@/lib/llm/streaming";
import { requireAuth } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;

  try {
    const body = await req.json();
    const { experiment, failure, literatureContext } = body;

    if (!experiment || !failure) {
      return new Response(
        JSON.stringify({ error: "experiment and failure are required" }),
        { status: 400 }
      );
    }

    return createSSEStream(async (emit) => {
      emit({ type: "progress", step: "正在分析失败原因...", current: 0, total: 1 });

      const result = await troubleshootExperiment(
        { experiment, failure, literatureContext },
        emit,
      );

      emit({ type: "progress", step: "诊断完成", current: 1, total: 1 });
      emit({ type: "result", data: result });
    });
  } catch (error) {
    console.error("Troubleshoot error:", error);
    return new Response(
      JSON.stringify({ error: "Diagnosis failed. Please try again." }),
      { status: 500 }
    );
  }
}
