import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db-server";
import { mapExtractionToDB } from "@/lib/extraction-mapper";

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
    const { paperId, extractions } = body;

    if (!paperId || typeof paperId !== "string") {
      return Response.json({ error: "paperId 必填" }, { status: 400 });
    }
    if (!Array.isArray(extractions) || extractions.length === 0) {
      return Response.json({ error: "extractions 必填且不能为空" }, { status: 400 });
    }

    // 验证 paper 属于当前项目
    const paper = await prisma.paper.findFirst({
      where: { id: paperId, projectId },
    });
    if (!paper) {
      return Response.json({ error: "文献不存在或不属于此项目" }, { status: 404 });
    }

    const created = await prisma.$transaction(async (tx: any) => {
      const results: any[] = [];

      for (const ext of extractions) {
        const record = await tx.extraction.create({
          data: mapExtractionToDB(ext, paperId),
        });
        results.push(record);
      }

      await tx.timelineEvent.create({
        data: {
          projectId,
          type: "literature",
          title: `提取了 ${extractions.length} 条实验数据`,
          content: { paperId, count: extractions.length },
        },
      });

      return results;
    });

    return Response.json({ saved: created.length, extractions: created }, { status: 201 });
  } catch (error) {
    console.error("Failed to batch save extractions:", error);
    return Response.json({ error: "批量保存提取结果失败" }, { status: 500 });
  }
}
