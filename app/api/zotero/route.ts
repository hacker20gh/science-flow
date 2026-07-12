/**
 * Zotero 文献库 API
 *
 * GET  /api/zotero                              → 获取用户的 Zotero 文献库
 * GET  /api/zotero?mode=collections             → 获取用户的 Collections 列表
 * GET  /api/zotero?collectionKey=xxx&limit=25   → 获取指定 Collection 下的文献
 * POST /api/zotero                              → 批量导入文献到项目
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db-server";
import { getLibraryItems, getCollections } from "@/lib/academic/zotero";

// ===== 读取用户的 Zotero API Key =====
async function getZoteroApiKey(): Promise<string | null> {
  if (!prisma) return null;
  const setting = await prisma.userSetting.findUnique({
    where: { key: "zoteroApiKey" },
  });
  return (setting?.value as string) || null;
}

/**
 * GET /api/zotero
 * - ?mode=collections → 返回 Collections 列表
 * - ?collectionKey=xxx → 返回指定 Collection 的文献
 * - 无参数 → 返回全部文献
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const apiKey = await getZoteroApiKey();
  if (!apiKey) {
    return NextResponse.json({ configured: false, items: [], total: 0, collections: [] });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("mode");

  try {
    // 获取 Collections 列表
    if (mode === "collections") {
      const collections = await getCollections(apiKey);
      return NextResponse.json({ configured: true, collections });
    }

    // 获取文献列表（支持按 Collection 过滤）
    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const start = parseInt(searchParams.get("start") || "0", 10);
    const q = searchParams.get("q") || undefined;
    const collectionKey = searchParams.get("collectionKey") || undefined;

    const result = await getLibraryItems(apiKey, { limit, start, q, collectionKey });
    return NextResponse.json({ configured: true, ...result });
  } catch (err) {
    console.error("[zotero] Error:", (err as Error)?.message);
    return NextResponse.json(
      { configured: true, items: [], total: 0, collections: [], error: (err as Error)?.message },
      { status: 502 }
    );
  }
}

/**
 * POST /api/zotero — 批量导入文献到项目
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  if (!prisma) {
    return NextResponse.json({ error: "数据库不可用" }, { status: 500 });
  }

  const body = await request.json();
  const { projectId, items } = body as {
    projectId: string;
    items: Array<{
      title: string;
      authors: string[];
      doi?: string;
      journal?: string;
      year?: number;
      abstract?: string;
      oaUrl?: string;
      zoteroKey: string;
    }>;
  };

  if (!projectId || !items?.length) {
    return NextResponse.json({ error: "projectId 和 items 必填" }, { status: 400 });
  }

  // 验证项目属于当前用户
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId: session.user.id },
  });
  if (!project) {
    return NextResponse.json({ error: "项目不存在" }, { status: 404 });
  }

  let imported = 0;
  let skipped = 0;

  for (const item of items) {
    try {
      // 按 DOI 去重
      if (item.doi) {
        const existing = await prisma.paper.findUnique({
          where: { doi: item.doi },
        });
        if (existing) {
          skipped++;
          continue;
        }
      }

      await prisma.paper.create({
        data: {
          projectId,
          title: item.title,
          authors: item.authors,
          doi: item.doi || null,
          journal: item.journal || null,
          year: item.year || null,
          abstract: item.abstract || null,
          oaUrl: item.oaUrl || null,
          source: `zotero:${item.zoteroKey}`,
        },
      });
      imported++;
    } catch (err) {
      // DOI unique constraint 冲突 → 跳过
      if ((err as { code?: string })?.code === "P2002") {
        skipped++;
      } else {
        console.error(`[zotero] Import error for "${item.title}":`, (err as Error)?.message);
      }
    }
  }

  // 创建时间线事件
  if (imported > 0) {
    await prisma.timelineEvent.create({
      data: {
        projectId,
        type: "literature",
        title: `从 Zotero 导入 ${imported} 篇文献`,
        content: { imported, skipped, source: "zotero" },
      },
    });
  }

  return NextResponse.json({ imported, skipped });
}
