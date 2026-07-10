import { prisma } from "@/lib/db-server";
import { auth } from "@/lib/auth";

const DEMO_USER_ID = "demo-user";

export async function GET() {
  if (!prisma) {
    return Response.json({ error: "数据库未配置", projects: [] }, { status: 503 });
  }

  try {
    const session = await auth();
    const userId = session?.user?.id || DEMO_USER_ID;

    const projects = await prisma.project.findMany({
      where: { userId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      include: {
        _count: { select: { papers: true, experiments: true, timeline: true } },
      },
    });

    return Response.json({ projects });
  } catch (error) {
    console.error("Failed to list trash:", error);
    return Response.json({ error: "获取回收站失败" }, { status: 500 });
  }
}
