import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "数据库未配置", experiments: [] }, { status: 503 });
  }

  const { projectId } = await params;

  try {
    const experiments = await prisma.experiment.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ experiments });
  } catch (error) {
    console.error("Failed to list experiments:", error);
    return Response.json({ error: "获取实验列表失败" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;
  const body = await req.json();

  try {
    const experiment = await prisma.experiment.create({
      data: {
        projectId,
        hypothesisId: body.hypothesisId || null,
        name: body.name,
        type: body.type || "custom",
        status: "designed",
        protocol: body.protocol || {},
        variables: body.variables || {},
      },
    });

    // 记录时间线
    await prisma.timelineEvent.create({
      data: {
        projectId,
        type: "experiment_design",
        title: `设计实验：${body.name}`,
        content: { experimentId: experiment.id, type: body.type },
      },
    });

    return Response.json({ experiment }, { status: 201 });
  } catch (error) {
    console.error("Failed to create experiment:", error);
    return Response.json({ error: "创建实验失败" }, { status: 500 });
  }
}
