import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db-server";

// GET - load settings
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!prisma) {
      return NextResponse.json({ config: null });
    }

    const setting = await prisma.userSetting.findUnique({
      where: { key: "llmConfig" },
    });

    const zoteroSetting = await prisma.userSetting.findUnique({
      where: { key: "zoteroApiKey" },
    });

    return NextResponse.json({
      config: setting?.value || null,
      zoteroApiKey: (zoteroSetting?.value as string) || "",
    });
  } catch (error) {
    console.error("Failed to load settings:", error);
    return NextResponse.json({ config: null });
  }
}

// POST - save settings
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

    // Save LLM config
    await prisma.userSetting.upsert({
      where: { key: "llmConfig" },
      create: { key: "llmConfig", value: config },
      update: { value: config },
    });

    // Save Zotero API key
    if (zoteroApiKey !== undefined) {
      await prisma.userSetting.upsert({
        where: { key: "zoteroApiKey" },
        create: { key: "zoteroApiKey", value: zoteroApiKey || "" },
        update: { value: zoteroApiKey || "" },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
