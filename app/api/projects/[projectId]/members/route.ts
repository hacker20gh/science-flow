import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!prisma) {
    return Response.json({ error: "数据库未配置", members: [], owner: null });
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
  } catch (error) {
    console.error("Failed to get members:", error);
    return Response.json({ error: "获取成员失败" }, { status: 500 });
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
    const { email } = await req.json();

    if (!email || typeof email !== "string") {
      return Response.json({ error: "邮箱不能为空" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return Response.json({ error: "该用户未注册 SciFlow AI" }, { status: 404 });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return Response.json({ error: "项目不存在" }, { status: 404 });
    }

    if (project.userId === user.id) {
      return Response.json({ error: "这是你自己的项目" }, { status: 400 });
    }

    return Response.json({
      message: "协作功能开发中，请等待后续版本",
    });
  } catch (error) {
    console.error("Invite error:", error);
    return Response.json({ error: "邀请失败" }, { status: 500 });
  }
}
