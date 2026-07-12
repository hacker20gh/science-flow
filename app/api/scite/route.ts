/**
 * Scite.ai 引用上下文 API
 *
 * GET /api/scite?doi=10.xxxx/xxxxx → 返回论文的引用分类统计
 * 降级保护：SCITE_API_KEY 未配置时返回 enabled: false
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSciteTallies } from "@/lib/academic/scite";

const SCITE_API_KEY = process.env.SCITE_API_KEY;

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!SCITE_API_KEY) {
    return NextResponse.json({ enabled: false, tallies: null });
  }

  const { searchParams } = new URL(request.url);
  const doi = searchParams.get("doi");

  if (!doi) {
    return NextResponse.json({ error: "doi 参数必填" }, { status: 400 });
  }

  try {
    const tallies = await getSciteTallies(doi, SCITE_API_KEY);
    return NextResponse.json({ enabled: true, tallies });
  } catch (err) {
    console.error("[scite] Error:", (err as Error)?.message);
    return NextResponse.json({ enabled: true, tallies: null, error: (err as Error)?.message });
  }
}
