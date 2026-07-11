import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!prisma) {
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
  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;

  try {
    const body = await req.json();

    const manuscript = await prisma.$transaction(async (tx: any) => {
      const m = await tx.manuscript.create({
        data: {
          projectId,
          journal: body.journal || null,
          language: body.language || "en",
          abstract: body.abstract || null,
          introduction: body.introduction || null,
          methods: body.methods || null,
          results: body.results || null,
          discussion: body.discussion || null,
          references: body.references || null,
        },
      });

      await tx.timelineEvent.create({
        data: {
          projectId,
          type: "manuscript",
          title: "创建论文草稿",
          content: { manuscriptId: m.id },
        },
      });

      return m;
    });

    return Response.json({ manuscript }, { status: 201 });
  } catch (error) {
    console.error("Failed to create manuscript:", error);
    return Response.json({ error: "创建论文草稿失败" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;

  try {
    const body = await req.json();

    if (!body.manuscriptId) {
      return Response.json({ error: "缺少 manuscriptId" }, { status: 400 });
    }

    const manuscript = await prisma.manuscript.update({
      where: {
        id: body.manuscriptId,
        projectId, // ensure ownership
      },
      data: {
        abstract: body.abstract ?? undefined,
        introduction: body.introduction ?? undefined,
        methods: body.methods ?? undefined,
        results: body.results ?? undefined,
        discussion: body.discussion ?? undefined,
        references: body.references ?? undefined,
      },
    });

    return Response.json({ manuscript });
  } catch (error) {
    console.error("Failed to update manuscript:", error);
    return Response.json({ error: "更新论文草稿失败" }, { status: 500 });
  }
}
