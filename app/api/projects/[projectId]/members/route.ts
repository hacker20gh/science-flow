import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

// 获取项目成员列表
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ members: [], owner: null });
  }

  const { projectId } = await params;

  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!project) {
      return Response.json({ error: "项目不存在" }, { status: 404 });
    }

    return Response.json({
      owner: project.user,
      members: [project.user],
    });
  } catch {
    return Response.json({ members: [], owner: null });
  }
}

// 邀请成员（通过邮箱）
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;
  const { email } = await req.json();

  if (!email) {
    return Response.json({ error: "邮箱不能为空" }, { status: 400 });
  }

  try {
    // 查找用户
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return Response.json({ error: "该用户未注册 SciFlow AI" }, { status: 404 });
    }

    // 检查是否已是成员（目前简化为同一个 userId 的项目）
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return Response.json({ error: "项目不存在" }, { status: 404 });
    }

    if (project.userId === user.id) {
      return Response.json({ error: "这是你自己的项目" }, { status: 400 });
    }

    // 简单方案：把项目的 userId 改为共享（或创建第二个 Project 记录）
    // 这里采用"复制项目"的方式：为被邀请者创建一个项目副本
    const newProject = await prisma.project.create({
      data: {
        name: `${project.name}（来自 ${project.userId} 的分享）`,
        description: project.description,
        userId: user.id,
      },
    });

    return Response.json({
      ok: true,
      message: `已为 ${email} 创建项目副本`,
      projectId: newProject.id,
    });
  } catch (error) {
    console.error("Invite error:", error);
    return Response.json({ error: "邀请失败" }, { status: 500 });
  }
}
