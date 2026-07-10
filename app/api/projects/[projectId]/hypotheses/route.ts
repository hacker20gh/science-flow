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
