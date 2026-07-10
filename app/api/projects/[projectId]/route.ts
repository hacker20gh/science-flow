import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        papers: {
          orderBy: { createdAt: "desc" },
          include: { _count: { select: { extractions: true } } },
        },
        experiments: { orderBy: { createdAt: "desc" } },
        hypotheses: { orderBy: { createdAt: "desc" } },
        timeline: { orderBy: { sortOrder: "asc" } },
        manuscripts: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!project) {
      return Response.json({ error: "项目不存在" }, { status: 404 });
    }

    return Response.json({ project });
  } catch (error) {
    console.error("Failed to get project:", error);
    return Response.json({ error: "获取项目失败" }, { status: 500 });
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

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) {
      if (typeof body.name !== "string" || !body.name.trim()) {
        return Response.json({ error: "项目名称不能为空" }, { status: 400 });
      }
      updateData.name = body.name.trim();
    }
    if (body.description !== undefined) {
      updateData.description = body.description;
    }

    const project = await prisma.project.update({
      where: { id: projectId },
      data: updateData,
    });

    return Response.json({ project });
  } catch (error) {
    console.error("Failed to update project:", error);
    return Response.json({ error: "更新项目失败" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;

  try {
    await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: new Date() },
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete project:", error);
    return Response.json({ error: "删除项目失败" }, { status: 500 });
  }
}
