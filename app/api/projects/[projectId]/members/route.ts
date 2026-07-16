import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";
import { requireAuth, requireProjectAccess } from "@/lib/api-auth";

/**
 * 获取项目成员列表
 *
 * 始终返回有效响应（members + owner），不会返回错误状态码。
 * 这样前端可以安全调用，失败时静默降级为空列表。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  // 数据库未配置时返回空列表，不报错
  if (!prisma) {
    return Response.json({ members: [], owner: null });
  }

  try {
    const authResult = await requireAuth();
    if ("error" in authResult) return authResult.error;
    const { userId } = authResult;

    const { projectId } = await params;

    const accessResult = await requireProjectAccess(projectId, userId);
    if ("error" in accessResult) return accessResult.error;

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });

    if (!project) {
      // 项目不存在时也返回空列表，不报错
      return Response.json({ members: [], owner: null });
    }

    return Response.json({
      owner: project.user,
      members: [project.user],
    });
  } catch {
    // 查询失败时静默降级，不返回错误状态码
    return Response.json({ members: [], owner: null });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;
  const { userId } = authResult;

  const { projectId } = await params;

  const accessResult = await requireProjectAccess(projectId, userId);
  if ("error" in accessResult) return accessResult.error;

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
