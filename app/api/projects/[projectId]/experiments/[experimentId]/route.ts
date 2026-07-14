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

    // 实验完成或失败时，自动创建时间线事件
    if (status === "completed" || status === "failed") {
      const eventTitle =
        status === "completed"
          ? `实验完成：${existing.name}`
          : `实验失败：${existing.name}`;
      const eventType =
        status === "completed" ? "experiment_completed" : "experiment_failed";
      try {
        await prisma.timelineEvent.create({
          data: {
            projectId,
            type: eventType,
            title: eventTitle,
            content: { experimentId, status, experimentName: existing.name },
          },
        });
      } catch (e) {
        // 时间线写入失败不阻断主流程
        console.error("Failed to create timeline event:", e);
      }
    }

    return Response.json({ experiment });
  } catch (error) {
    console.error("Failed to update experiment status:", error);
    return Response.json({ error: "更新实验状态失败" }, { status: 500 });
  }
}
