import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";
import { requireAuth, requireProjectAccess } from "@/lib/api-auth";

export async function POST(
  _req: NextRequest,
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
    const project = await prisma.project.update({
      where: { id: projectId },
      data: { deletedAt: null },
    });
    return Response.json({ ok: true, project });
  } catch (error) {
    console.error("Failed to restore project:", error);
    return Response.json({ error: "恢复项目失败" }, { status: 500 });
  }
}
