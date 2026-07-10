import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "数据库未配置", manuscripts: [] }, { status: 503 });
  }

  const { projectId } = await params;

  try {
    const manuscripts = await prisma.manuscript.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });

    return Response.json({ manuscripts });
  } catch (error) {
    console.error("Failed to list manuscripts:", error);
    return Response.json({ error: "获取论文草稿失败" }, { status: 500 });
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
    const manuscript = await prisma.manuscript.create({
      data: {
        projectId,
        journal: body.journal || null,
        language: body.language || "en",
        abstract: body.abstract || null,
        introduction: body.introduction || null,
        methods: body.methods || null,
        results: body.results || null,
        discussion: body.discussion || null,
      },
    });

    await prisma.timelineEvent.create({
      data: {
        projectId,
        type: "manuscript",
        title: "创建论文草稿",
        content: { manuscriptId: manuscript.id },
      },
    });

    return Response.json({ manuscript }, { status: 201 });
  } catch (error) {
    console.error("Failed to create manuscript:", error);
    return Response.json({ error: "创建论文草稿失败" }, { status: 500 });
  }
}
