import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!prisma) {
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
  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;

  try {
    const body = await req.json();

    if (!body.title || typeof body.title !== "string") {
      return Response.json({ error: "title 必填" }, { status: 400 });
    }

    const paper = await prisma.$transaction(async (tx: any) => {
      const p = await tx.paper.create({
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

      await tx.timelineEvent.create({
        data: {
          projectId,
          type: "literature",
          title: `添加文献：${body.title.slice(0, 50)}`,
          content: { paperId: p.id, source: body.source },
        },
      });

      return p;
    });

    return Response.json({ paper }, { status: 201 });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return Response.json({ error: "该文献已存在（DOI 重复）" }, { status: 409 });
    }
    console.error("Failed to create paper:", error);
    return Response.json({ error: "添加文献失败" }, { status: 500 });
  }
}
