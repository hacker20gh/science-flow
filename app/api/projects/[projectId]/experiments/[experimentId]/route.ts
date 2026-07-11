import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

const VALID_STATUSES = ["designed", "running", "completed", "failed"] as const;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; experimentId: string }> }
) {
  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId, experimentId } = await params;

  try {
    const experiment = await prisma.experiment.findFirst({
      where: { id: experimentId, projectId },
    });
    if (!experiment) {
      return Response.json({ error: "实验不存在" }, { status: 404 });
    }
    return Response.json({ experiment });
  } catch (error) {
    console.error("Failed to get experiment:", error);
    return Response.json({ error: "获取实验失败" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; experimentId: string }> }
) {
  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId, experimentId } = await params;

  try {
    const body = await req.json();
    const { status } = body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return Response.json(
        { error: `无效的状态，可选值：${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // Verify experiment exists and belongs to project
    const existing = await prisma.experiment.findFirst({
      where: { id: experimentId, projectId },
    });
    if (!existing) {
      return Response.json({ error: "实验不存在" }, { status: 404 });
    }

    const experiment = await prisma.experiment.update({
      where: { id: experimentId },
      data: { status },
    });

    return Response.json({ experiment });
  } catch (error) {
    console.error("Failed to update experiment status:", error);
    return Response.json({ error: "更新实验状态失败" }, { status: 500 });
  }
}
