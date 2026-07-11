import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!prisma) {
    return Response.json({ error: "数据库未配置", hypotheses: [] }, { status: 503 });
  }

  const { projectId } = await params;

  try {
    const hypotheses = await prisma.hypothesis.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ hypotheses });
  } catch (error) {
    console.error("Failed to list hypotheses:", error);
    return Response.json({ error: "获取假设列表失败" }, { status: 500 });
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

    if (!body.statement || typeof body.statement !== "string") {
      return Response.json({ error: "statement 必填" }, { status: 400 });
    }

    const hypothesis = await prisma.$transaction(async (tx: any) => {
      const h = await tx.hypothesis.create({
        data: {
          projectId,
          statement: body.statement,
          status: body.status || "pending",
          evidence: body.evidence || null,
          basedOn: body.basedOn || [],
        },
      });

      const title = body.statement.length > 50
        ? `提出假设：${body.statement.slice(0, 50)}...`
        : `提出假设：${body.statement}`;

      await tx.timelineEvent.create({
        data: {
          projectId,
          type: "hypothesis",
          title,
          content: { hypothesisId: h.id, statement: body.statement },
        },
      });

      return h;
    });

    return Response.json({ hypothesis }, { status: 201 });
  } catch (error) {
    console.error("Failed to create hypothesis:", error);
    return Response.json({ error: "创建假设失败" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;

  try {
    const body = await req.json();

    if (!body.id || typeof body.id !== "string") {
      return Response.json({ error: "id 必填" }, { status: 400 });
    }

    const updateData: Record<string, any> = {};
    if (body.status !== undefined) updateData.status = body.status;
    if (body.statement !== undefined) updateData.statement = body.statement;
    if (body.evidence !== undefined) updateData.evidence = body.evidence;
    if (body.basedOn !== undefined) updateData.basedOn = body.basedOn;

    const hypothesis = await prisma.$transaction(async (tx: any) => {
      const existing = await tx.hypothesis.findFirst({
        where: { id: body.id, projectId },
      });
      if (!existing) {
        throw new Error("NOT_FOUND");
      }

      const updated = await tx.hypothesis.update({
        where: { id: body.id },
        data: updateData,
      });

      if (body.status && body.status !== existing.status) {
        await tx.timelineEvent.create({
          data: {
            projectId,
            type: "hypothesis",
            title: `假设状态变更：${existing.statement.slice(0, 50)}`,
            content: {
              hypothesisId: updated.id,
              oldStatus: existing.status,
              newStatus: body.status,
            },
          },
        });
      }

      return updated;
    });

    return Response.json({ hypothesis });
  } catch (error: any) {
    if (error.message === "NOT_FOUND") {
      return Response.json({ error: "假设不存在" }, { status: 404 });
    }
    console.error("Failed to update hypothesis:", error);
    return Response.json({ error: "更新假设失败" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;
  const id = req.nextUrl.searchParams.get("id");

  if (!id) {
    return Response.json({ error: "id 参数必填" }, { status: 400 });
  }

  try {
    const existing = await prisma.hypothesis.findFirst({
      where: { id, projectId },
    });
    if (!existing) {
      return Response.json({ error: "假设不存在" }, { status: 404 });
    }

    await prisma.hypothesis.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete hypothesis:", error);
    return Response.json({ error: "删除假设失败" }, { status: 500 });
  }
}
