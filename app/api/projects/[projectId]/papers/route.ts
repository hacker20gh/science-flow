import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  if (!prisma) {
    return Response.json({ error: "数据库未配置", papers: [] }, { status: 503 });
  }

  const { projectId } = await params;

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.userId !== session.user.id) {
      return Response.json({ error: "无权访问该项目" }, { status: 403 });
    }

    const papers = await prisma.paper.findMany({
      where: { projectId },
      select: {
        id: true,
        title: true,
        authors: true,
        year: true,
        journal: true,
        doi: true,
        pmid: true,
        abstract: true,
        source: true,
        oaUrl: true,
        fullText: true,
        createdAt: true,
        extractions: {
          select: { id: true, drugName: true, pathway: true, conclusion: true },
        },
      },
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
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;

  try {
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project || project.userId !== session.user.id) {
      return Response.json({ error: "无权访问该项目" }, { status: 403 });
    }

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

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== session.user.id) {
    return Response.json({ error: "无权访问该项目" }, { status: 403 });
  }

  const paperId = req.nextUrl.searchParams.get("id");

  if (!paperId) {
    return Response.json({ error: "id 必填" }, { status: 400 });
  }

  try {
    const body = await req.json();

    // 确认论文属于该项目
    const existing = await prisma.paper.findFirst({
      where: { id: paperId, projectId },
    });

    if (!existing) {
      return Response.json({ error: "论文不存在" }, { status: 404 });
    }

    const paper = await prisma.paper.update({
      where: { id: paperId },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.journal !== undefined && { journal: body.journal }),
        ...(body.year !== undefined && { year: body.year }),
        ...(body.doi !== undefined && { doi: body.doi }),
        ...(body.pmid !== undefined && { pmid: body.pmid }),
        ...(body.abstract !== undefined && { abstract: body.abstract }),
      },
    });

    return Response.json({ paper });
  } catch (error) {
    console.error("Failed to update paper:", error);
    return Response.json({ error: "更新论文失败" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project || project.userId !== session.user.id) {
    return Response.json({ error: "无权访问该项目" }, { status: 403 });
  }

  const paperId = req.nextUrl.searchParams.get("id");

  if (!paperId) {
    return Response.json({ error: "id 必填" }, { status: 400 });
  }

  try {
    // 确认论文属于该项目
    const paper = await prisma.paper.findFirst({
      where: { id: paperId, projectId },
    });

    if (!paper) {
      return Response.json({ error: "论文不存在" }, { status: 404 });
    }

    // 删除论文及其关联数据
    await prisma.$transaction(async (tx: any) => {
      await tx.extraction.deleteMany({ where: { paperId } });
      await tx.paper.delete({ where: { id: paperId } });
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete paper:", error);
    return Response.json({ error: "删除失败" }, { status: 500 });
  }
}
