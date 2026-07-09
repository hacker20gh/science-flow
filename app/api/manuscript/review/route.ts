import { NextRequest, NextResponse } from "next/server";
import { simulateReview } from "@/lib/llm/reviewer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { manuscript, journal } = body;

    if (!manuscript || Object.keys(manuscript).length === 0) {
      return NextResponse.json(
        { error: "manuscript is required" },
        { status: 400 }
      );
    }

    const review = await simulateReview({ manuscript, journal });
    return NextResponse.json(review);
  } catch (error) {
    console.error("Review simulation error:", error);
    return NextResponse.json(
      { error: "Review simulation failed" },
      { status: 500 }
    );
  }
}
