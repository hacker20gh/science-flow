import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";
import { requireAuth, requireProjectAccess } from "@/lib/api-auth";

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
    const body = await req.json();
    if (!body.confirm) {
      return Response.json({ error: "请确认永久删除操作" }, { status: 400 });
    }

    await prisma.project.delete({ where: { id: projectId } });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to permanently delete project:", error);
    return Response.json({ error: "永久删除失败" }, { status: 500 });
  }
}
