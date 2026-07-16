import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db-server";

/**
 * GET - 加载当前用户的设置
 * 使用 User.llmConfig 字段存储（用户级隔离），不使用全局 UserSetting
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!prisma) {
      return NextResponse.json({ config: null });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { llmConfig: true },
    });

    const config = (user?.llmConfig as Record<string, unknown>) || null;

    return NextResponse.json({
      config: config?.config || null,
      zoteroApiKey: (config?.zoteroApiKey as string) || "",
    });
  } catch (error) {
    console.error("Failed to load settings:", error);
    return NextResponse.json({ config: null });
  }
}

/**
 * POST - 保存当前用户的设置
 * 使用 User.llmConfig 字段存储（用户级隔离），不使用全局 UserSetting
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!prisma) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const body = await req.json();
    const { config, zoteroApiKey } = body;

    if (!config || typeof config !== "object") {
      return NextResponse.json({ error: "config is required" }, { status: 400 });
    }

    // 读取现有配置，合并后保存到 User.llmConfig
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { llmConfig: true },
    });

    const existing = (user?.llmConfig as Record<string, unknown>) || {};

    const updatedConfig = {
      ...existing,
      config,
      ...(zoteroApiKey !== undefined ? { zoteroApiKey: zoteroApiKey || "" } : {}),
    };

    await prisma.user.update({
      where: { id: session.user.id },
      data: { llmConfig: updatedConfig },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
