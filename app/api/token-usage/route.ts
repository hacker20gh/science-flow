import { NextResponse } from "next/server";
import { getTokenUsageStats } from "@/lib/token-tracker";
import { requireAuth } from "@/lib/api-auth";

export async function GET() {
  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;

  try {
    const stats = await getTokenUsageStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Token usage error:", error);
    return NextResponse.json({ error: "Failed to get token usage" }, { status: 500 });
  }
}
