import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!process.env.DATABASE_URL) {
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
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;
  const body = await req.json();

  try {
    const hypothesis = await prisma.hypothesis.create({
      data: {
        projectId,
        statement: body.statement,
        status: body.status || "pending",
        evidence: body.evidence || null,
        basedOn: body.basedOn || [],
      },
    });

    // 记录时间线
    await prisma.timelineEvent.create({
      data: {
        projectId,
        type: "hypothesis",
        title: `提出假设：${body.statement.slice(0, 50)}${body.statement.length > 50 ? "..." : ""}`,
        content: { hypothesisId: hypothesis.id, statement: body.statement },
      },
    });

    return Response.json({ hypothesis }, { status: 201 });
  } catch (error) {
    console.error("Failed to create hypothesis:", error);
    return Response.json({ error: "创建假设失败" }, { status: 500 });
  }
}
