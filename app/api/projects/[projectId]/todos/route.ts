import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!prisma) {
    return Response.json({ error: "数据库未配置", todos: [] }, { status: 503 });
  }

  const { projectId } = await params;
  const status = req.nextUrl.searchParams.get("status");

  try {
    const where: Record<string, any> = { projectId };
    if (status === "pending" || status === "completed") {
      where.status = status;
    }

    const todos = await prisma.todoItem.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return Response.json({ todos });
  } catch (error) {
    console.error("Failed to list todos:", error);
    return Response.json({ error: "获取任务列表失败" }, { status: 500 });
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

    if (!body.title || typeof body.title !== "string") {
      return Response.json({ error: "title 必填" }, { status: 400 });
    }

    const validTypes = ["conflict", "gap", "suggestion", "experiment_check"];
    if (!body.type || !validTypes.includes(body.type)) {
      return Response.json(
        { error: `type 必填，可选值: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const todo = await prisma.todoItem.create({
      data: {
        projectId,
        type: body.type,
        title: body.title,
        detail: body.detail || null,
        metadata: body.metadata || undefined,
      },
    });

    return Response.json({ todo }, { status: 201 });
  } catch (error) {
    console.error("Failed to create todo:", error);
    return Response.json({ error: "创建任务失败" }, { status: 500 });
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

    const existing = await prisma.todoItem.findFirst({
      where: { id: body.id, projectId },
    });
    if (!existing) {
      return Response.json({ error: "任务不存在" }, { status: 404 });
    }

    const updateData: Record<string, any> = {};
    if (body.title !== undefined) updateData.title = body.title;
    if (body.detail !== undefined) updateData.detail = body.detail;
    if (body.status !== undefined) {
      updateData.status = body.status;
      // Set completedAt based on status change
      if (body.status === "completed") {
        updateData.completedAt = new Date();
      } else if (body.status === "pending") {
        updateData.completedAt = null;
      }
    }

    const todo = await prisma.todoItem.update({
      where: { id: body.id },
      data: updateData,
    });

    return Response.json({ todo });
  } catch (error) {
    console.error("Failed to update todo:", error);
    return Response.json({ error: "更新任务失败" }, { status: 500 });
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
    const existing = await prisma.todoItem.findFirst({
      where: { id, projectId },
    });
    if (!existing) {
      return Response.json({ error: "任务不存在" }, { status: 404 });
    }

    await prisma.todoItem.delete({ where: { id } });
    return Response.json({ success: true });
  } catch (error) {
    console.error("Failed to delete todo:", error);
    return Response.json({ error: "删除任务失败" }, { status: 500 });
  }
}
