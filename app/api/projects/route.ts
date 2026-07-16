import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";
import { requireAuth } from "@/lib/api-auth";

export async function GET() {
  if (!prisma) {
    return Response.json({ error: "数据库未配置", projects: [] }, { status: 503 });
  }

  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const projects = await prisma.project.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { papers: true, experiments: true, timeline: true } },
      },
    });

    return Response.json({ projects });
  } catch (error) {
    console.error("Failed to list projects:", error);
    return Response.json({ error: "获取项目列表失败" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const body = await req.json();

    if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
      return Response.json({ error: "项目名称不能为空" }, { status: 400 });
    }

    const project = await prisma.project.create({
      data: {
        name: body.name.trim(),
        description: body.description || null,
        userId,
      },
      include: {
        _count: { select: { papers: true, experiments: true, timeline: true } },
      },
    });

    return Response.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return Response.json({ error: "创建项目失败" }, { status: 500 });
  }
}
