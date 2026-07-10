import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

// 演示用户 ID（未接入 Auth 前使用）
const DEMO_USER_ID = "demo-user";

export async function GET() {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "数据库未配置", projects: [] }, { status: 503 });
  }

  try {
    // 确保演示用户存在
    await prisma.user.upsert({
      where: { id: DEMO_USER_ID },
      create: { id: DEMO_USER_ID, email: "demo@sciflow.ai", name: "演示用户" },
      update: {},
    });

    const projects = await prisma.project.findMany({
      where: { userId: DEMO_USER_ID },
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
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const { name, description } = body;

    if (!name) {
      return Response.json({ error: "项目名称不能为空" }, { status: 400 });
    }

    await prisma.user.upsert({
      where: { id: DEMO_USER_ID },
      create: { id: DEMO_USER_ID, email: "demo@sciflow.ai", name: "演示用户" },
      update: {},
    });

    const project = await prisma.project.create({
      data: {
        name,
        description: description || null,
        userId: DEMO_USER_ID,
      },
    });

    return Response.json({ project }, { status: 201 });
  } catch (error) {
    console.error("Failed to create project:", error);
    return Response.json({ error: "创建项目失败" }, { status: 500 });
  }
}
