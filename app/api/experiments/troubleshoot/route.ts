import { NextRequest, NextResponse } from "next/server";
import { troubleshootExperiment } from "@/lib/llm/troubleshoot";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { experiment, failure, literatureContext } = body;

    if (!experiment || !failure) {
      return NextResponse.json(
        { error: "experiment and failure are required" },
        { status: 400 }
      );
    }

    const result = await troubleshootExperiment({
      experiment,
      failure,
      literatureContext,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Troubleshoot error:", error);
    return NextResponse.json(
      { error: "Diagnosis failed. Please try again." },
      { status: 500 }
    );
  }
}
