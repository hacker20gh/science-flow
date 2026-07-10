import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "数据库未配置", events: [] }, { status: 503 });
  }

  const { projectId } = await params;

  try {
    const events = await prisma.timelineEvent.findMany({
      where: { projectId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    return Response.json({ events });
  } catch (error) {
    console.error("Failed to list timeline:", error);
    return Response.json({ error: "获取时间线失败" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;
  const body = await req.json();

  try {
    const event = await prisma.timelineEvent.create({
      data: {
        projectId,
        type: body.type,
        title: body.title,
        content: body.content || {},
        metadata: body.metadata || null,
        sortOrder: body.sortOrder || 0,
        weekNumber: body.weekNumber || null,
      },
    });

    return Response.json({ event }, { status: 201 });
  } catch (error) {
    console.error("Failed to create timeline event:", error);
    return Response.json({ error: "添加时间线事件失败" }, { status: 500 });
  }
}
