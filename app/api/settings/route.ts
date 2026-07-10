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

    // Try UserSetting table first
    const setting = await prisma.userSetting.findUnique({
      where: { key: "llmConfig" },
    });

    if (setting?.value) {
      return NextResponse.json({ config: setting.value });
    }

    // Fallback: check user's llmConfig field
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { llmConfig: true },
    });

    return NextResponse.json({ config: user?.llmConfig || null });
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
    const { baseUrl, models } = body;

    if (!baseUrl || typeof baseUrl !== "string") {
      return NextResponse.json({ error: "baseUrl is required" }, { status: 400 });
    }

    // Validate models if provided
    const validModels: Record<string, string> = {};
    if (models && typeof models === "object") {
      for (const key of ["extraction", "chat", "analysis"]) {
        if (typeof models[key] === "string" && models[key].trim()) {
          validModels[key] = models[key].trim();
        }
      }
    }

    const config = { baseUrl, ...Object.keys(validModels).length ? { models: validModels } : {} };

    // Save to UserSetting (upsert)
    await prisma.userSetting.upsert({
      where: { key: "llmConfig" },
      create: { key: "llmConfig", value: config },
      update: { value: config },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save settings:", error);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
