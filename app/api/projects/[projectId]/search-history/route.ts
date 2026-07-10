import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!prisma) {
    return Response.json({ error: "数据库未配置", history: [] }, { status: 503 });
  }

  const { projectId } = await params;

  try {
    const history = await prisma.searchHistory.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return Response.json({ history });
  } catch (error) {
    console.error("Failed to list search history:", error);
    return Response.json({ error: "获取搜索历史失败", history: [] }, { status: 500 });
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
    const result = await prisma.searchHistory.deleteMany({
      where: { projectId },
    });
    return Response.json({ deleted: result.count });
  } catch (error) {
    console.error("Failed to clear search history:", error);
    return Response.json({ error: "清空搜索历史失败" }, { status: 500 });
  }
}
