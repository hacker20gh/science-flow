import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "数据库未配置", papers: [] }, { status: 503 });
  }

  const { projectId } = await params;

  try {
    const papers = await prisma.paper.findMany({
      where: { projectId },
      include: { extractions: true },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ papers });
  } catch (error) {
    console.error("Failed to list papers:", error);
    return Response.json({ error: "获取文献列表失败" }, { status: 500 });
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
    const paper = await prisma.paper.create({
      data: {
        projectId,
        title: body.title,
        doi: body.doi || null,
        pmid: body.pmid || null,
        authors: body.authors || [],
        journal: body.journal || null,
        year: body.year || null,
        abstract: body.abstract || null,
        source: body.source || null,
        oaUrl: body.oaUrl || null,
      },
    });

    // 自动记录时间线事件
    await prisma.timelineEvent.create({
      data: {
        projectId,
        type: "literature",
        title: `添加文献：${body.title}`,
        content: { paperId: paper.id, source: body.source },
      },
    });

    return Response.json({ paper }, { status: 201 });
  } catch (error) {
    console.error("Failed to create paper:", error);
    return Response.json({ error: "添加文献失败" }, { status: 500 });
  }
}
