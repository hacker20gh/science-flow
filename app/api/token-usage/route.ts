import { NextResponse } from "next/server";
import { getTokenUsageStats } from "@/lib/token-tracker";

export async function GET() {
  try {
    const stats = getTokenUsageStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Token usage error:", error);
    return NextResponse.json({ error: "Failed to get token usage" }, { status: 500 });
  }
}
