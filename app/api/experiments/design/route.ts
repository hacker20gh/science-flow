import { NextRequest, NextResponse } from "next/server";
import { designExperiment } from "@/lib/llm/experiment-design";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { hypothesis, matrixSummary, existingExperiments, gapOrConflict } = body;

    if (!hypothesis) {
      return NextResponse.json(
        { error: "hypothesis is required" },
        { status: 400 }
      );
    }

    const design = await designExperiment({
      hypothesis,
      matrixSummary: matrixSummary || "暂无矩阵数据",
      existingExperiments: existingExperiments || [],
      gapOrConflict,
    });

    return NextResponse.json(design);
  } catch (error) {
    console.error("Experiment design error:", error);
    return NextResponse.json(
      { error: "Failed to generate experiment design" },
      { status: 500 }
    );
  }
}
