import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

/**
 * GET: 返回当前项目的机制矩阵（从 DB 读取），如无则返回 null
 * POST: 保存/更新机制矩阵到 DB（upsert，每个项目只保留一份）
 * DELETE: 清空当前项目的机制矩阵
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;

  try {
    const matrix = await prisma.mechanismMatrix.findUnique({
      where: { projectId },
      select: { data: true, updatedAt: true },
    });

    return Response.json({ matrix: matrix ?? null });
  } catch (error) {
    console.error("Failed to read matrix:", error);
    return Response.json({ error: "获取矩阵失败" }, { status: 500 });
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
    const body = await req.json();
    const { data } = body;

    if (!data || typeof data !== "object") {
      return Response.json({ error: "矩阵数据无效" }, { status: 400 });
    }

    const record = await prisma.mechanismMatrix.upsert({
      where: { projectId },
      update: { data },
      create: { projectId, data },
      select: { id: true, updatedAt: true },
    });

    // 矩阵保存成功后，创建时间线事件
    try {
      // 从 data 中提取行数和列数（如果存在）
      const totalPapers = Array.isArray(data?.rows) ? data.rows.length : undefined;
      const totalExperiments = Array.isArray(data?.columns) ? data.columns.length : undefined;
      await prisma.timelineEvent.create({
        data: {
          projectId,
          type: "matrix_updated",
          title: "机制矩阵已更新",
          content: { totalExperiments, totalPapers },
        },
      });
    } catch (e) {
      // 时间线写入失败不阻断主流程
      console.error("Failed to create timeline event:", e);
    }

    return Response.json({ matrix: record });
  } catch (error) {
    console.error("Failed to save matrix:", error);
    return Response.json({ error: "保存矩阵失败" }, { status: 500 });
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
    // 删除旧矩阵，然后插入一个空的标记记录（防止自动重新生成）
    await prisma.mechanismMatrix.deleteMany({
      where: { projectId },
    });
    await prisma.mechanismMatrix.create({
      data: {
        projectId,
        data: { rows: [], columns: [], conflicts: [], gaps: [], stats: {} },
        analysisReport: { cleared: true, clearedAt: new Date().toISOString() },
      },
    });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete matrix:", error);
    return Response.json({ error: "清空矩阵失败" }, { status: 500 });
  }
}
