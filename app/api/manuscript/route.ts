import { NextRequest, NextResponse } from "next/server";
import { generateManuscript } from "@/lib/llm/manuscript";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectName, hypothesis, matrixSummary, papers, experiments, section } = body;

    if (!projectName || !hypothesis) {
      return NextResponse.json(
        { error: "projectName and hypothesis are required" },
        { status: 400 }
      );
    }

    const manuscript = await generateManuscript({
      projectName,
      hypothesis,
      matrixSummary: matrixSummary || "",
      papers: papers || [],
      experiments: experiments || [],
      section: section || "all",
    });

    return NextResponse.json(manuscript);
  } catch (error) {
    console.error("Manuscript generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate manuscript" },
      { status: 500 }
    );
  }
}
