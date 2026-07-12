/**
 * Crossref DOI 解析 API
 *
 * GET /api/crossref?doi=10.xxxx/xxxxx → 解析 DOI 返回论文元数据
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveDOI } from "@/lib/academic/crossref";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const doi = searchParams.get("doi");

  if (!doi) {
    return NextResponse.json({ error: "doi 参数必填" }, { status: 400 });
  }

  try {
    const metadata = await resolveDOI(doi);
    if (!metadata) {
      return NextResponse.json({ error: "未找到该 DOI" }, { status: 404 });
    }
    return NextResponse.json({ metadata });
  } catch (err) {
    console.error("[crossref] Error:", (err as Error)?.message);
    return NextResponse.json({ error: "解析失败" }, { status: 502 });
  }
}
