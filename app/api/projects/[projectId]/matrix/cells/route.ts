import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";
import { requireAuth, requireProjectAccess } from "@/lib/api-auth";
import type { MatrixData } from "@/lib/matrix/generator";

/**
 * PATCH: 更新机制矩阵中单个单元格
 * Body: { rowId: string, columnId: string, direction?: string, significance?: string, note?: string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;

  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;

  const accessResult = await requireProjectAccess(projectId, authResult.userId);
  if ("error" in accessResult) return accessResult.error;

  try {
    const body = await req.json();
    const { rowId, columnId, direction, significance, note } = body;

    if (!rowId || !columnId) {
      return Response.json({ error: "缺少 rowId 或 columnId" }, { status: 400 });
    }

    // Load existing matrix
    const record = await prisma.mechanismMatrix.findUnique({
      where: { projectId },
      select: { data: true },
    });

    if (!record?.data) {
      return Response.json({ error: "矩阵不存在" }, { status: 404 });
    }

    const matrixData = record.data as unknown as MatrixData;

    // Find and update the cell
    let found = false;
    for (const row of matrixData.rows) {
      if (row.id === rowId && row.cells[columnId]) {
        const cell = row.cells[columnId];
        if (direction !== undefined) cell.direction = direction as MatrixData["rows"][0]["cells"][string]["direction"];
        if (significance !== undefined) cell.significance = significance;
        if (note !== undefined) cell.detail = note;
        found = true;
        break;
      }
    }

    if (!found) {
      return Response.json({ error: "单元格不存在" }, { status: 404 });
    }

    // Save back
    await prisma.mechanismMatrix.update({
      where: { projectId },
      data: { data: JSON.parse(JSON.stringify(matrixData)) },
    });

    // Return the updated cell
    const updatedRow = matrixData.rows.find((r) => r.id === rowId);
    const updatedCell = updatedRow?.cells[columnId];

    return Response.json({ cell: updatedCell });
  } catch (error) {
    console.error("Failed to update cell:", error);
    return Response.json({ error: "更新单元格失败" }, { status: 500 });
  }
}
