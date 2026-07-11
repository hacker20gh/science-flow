import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db-server";

// GET /api/projects/[projectId]/chat?conversationId=xxx — 获取对话历史（可按 conversationId 过滤）
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    if (!prisma) {
      return NextResponse.json({ messages: [] });
    }

    const messages = await prisma.chatMessage.findMany({
      where: {
        projectId,
        userId: session.user.id,
        ...(conversationId ? { conversationId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        role: true,
        content: true,
        createdAt: true,
        metadata: true,
      },
    });

    // 反转为时间正序（从旧到新）
    messages.reverse();

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Failed to load chat history:", error);
    return NextResponse.json({ messages: [] });
  }
}

// POST /api/projects/[projectId]/chat — 手动保存消息（通常由 /api/chat 自动保存）
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;
    const body = await req.json();
    const { role, content, metadata } = body;

    if (!role || !content) {
      return NextResponse.json({ error: "role and content required" }, { status: 400 });
    }

    if (!prisma) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const message = await prisma.chatMessage.create({
      data: {
        projectId,
        userId: session.user.id,
        role,
        content,
        metadata: metadata || undefined,
      },
    });

    return NextResponse.json({ message });
  } catch (error) {
    console.error("Failed to save chat message:", error);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/chat?conversationId=xxx — 清空对话历史（可按 conversationId 过滤）
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { projectId } = await params;
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");

    if (!prisma) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    await prisma.chatMessage.deleteMany({
      where: {
        projectId,
        userId: session.user.id,
        ...(conversationId ? { conversationId } : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to clear chat history:", error);
    return NextResponse.json({ error: "Failed to clear" }, { status: 500 });
  }
}
