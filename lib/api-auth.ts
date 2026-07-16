/**
 * API Route 认证 + 授权工具函数
 *
 * 所有 API Route 必须调用 requireAuth() 获取当前用户。
 * 涉及项目数据的 Route 必须调用 requireProjectAccess() 验证所有权。
 *
 * 用法：
 *   const authResult = await requireAuth();
 *   if ("error" in authResult) return authResult.error;
 *   const { userId } = authResult;
 *
 *   const accessResult = await requireProjectAccess(projectId, userId);
 *   if ("error" in accessResult) return accessResult.error;
 */

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db-server";

type AuthSuccess = { userId: string };
type AuthError = { error: NextResponse };
type AuthResult = AuthSuccess | AuthError;

type AccessSuccess = { project: { id: string; userId: string } };
type AccessError = { error: NextResponse };
type AccessResult = AccessSuccess | AccessError;

/**
 * 要求请求必须已登录。
 * 返回 userId 或 401 Response。
 */
export async function requireAuth(): Promise<AuthResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      error: NextResponse.json({ error: "未登录" }, { status: 401 }),
    };
  }
  return { userId: session.user.id };
}

/**
 * 要求项目存在且属于当前用户。
 * 返回 project 或 404/403 Response。
 */
export async function requireProjectAccess(
  projectId: string,
  userId: string
): Promise<AccessResult> {
  if (!prisma) {
    return {
      error: NextResponse.json(
        { error: "数据库未配置" },
        { status: 503 }
      ),
    };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, userId: true },
  });

  if (!project) {
    return {
      error: NextResponse.json(
        { error: "项目不存在" },
        { status: 404 }
      ),
    };
  }

  if (project.userId !== userId) {
    return {
      error: NextResponse.json(
        { error: "无权访问该项目" },
        { status: 403 }
      ),
    };
  }

  return { project };
}
