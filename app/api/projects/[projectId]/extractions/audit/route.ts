import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db-server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;

  try {
    const body = await req.json();
    const { extractionId, action, field, oldValue, newValue, note } = body;

    if (!extractionId || !action) {
      return Response.json({ error: "extractionId 和 action 必填" }, { status: 400 });
    }

    // 验证 extraction 属于当前项目的 paper
    const extraction = await prisma.extraction.findFirst({
      where: {
        id: extractionId,
        paper: { projectId },
      },
    });
    if (!extraction) {
      return Response.json({ error: "提取记录不存在或不属于此项目" }, { status: 404 });
    }

    const audit = await prisma.extractionAudit.create({
      data: {
        extractionId,
        action,
        field: field || null,
        oldValue: oldValue || null,
        newValue: newValue || null,
        note: note || null,
        userId: session.user.id || null,
      },
    });

    // 如果是 verify 操作，同时更新 extraction 的 verified 字段
    if (action === "verify") {
      await prisma.extraction.update({
        where: { id: extractionId },
        data: { verified: true },
      });
    }

    return Response.json({ audit }, { status: 201 });
  } catch (error) {
    console.error("Failed to create audit record:", error);
    return Response.json({ error: "记录审核操作失败" }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }
  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;
  const { searchParams } = new URL(req.url);
  const extractionId = searchParams.get("extractionId");

  if (!extractionId) {
    return Response.json({ error: "extractionId 参数必填" }, { status: 400 });
  }

  try {
    // 验证权限
    const extraction = await prisma.extraction.findFirst({
      where: {
        id: extractionId,
        paper: { projectId },
      },
    });
    if (!extraction) {
      return Response.json({ error: "提取记录不存在" }, { status: 404 });
    }

    const audits = await prisma.extractionAudit.findMany({
      where: { extractionId },
      orderBy: { createdAt: "desc" },
    });

    return Response.json({ audits });
  } catch (error) {
    console.error("Failed to fetch audit records:", error);
    return Response.json({ error: "获取审核记录失败" }, { status: 500 });
  }
}
