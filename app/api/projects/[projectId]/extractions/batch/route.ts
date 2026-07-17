import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";
import { saveExtractionsToDB } from "@/lib/extraction-mapper";
import { requireAuth, requireProjectAccess } from "@/lib/api-auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;

  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;

  // 验证项目所有权
  const accessResult = await requireProjectAccess(projectId, authResult.userId);
  if ("error" in accessResult) return accessResult.error;

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

    const shortTitle = paper.title.length > 30 ? paper.title.slice(0, 30) + "…" : paper.title;

    const savedCount = await prisma.$transaction(async (tx: any) => {
      return saveExtractionsToDB({
        tx,
        paperId,
        projectId,
        experiments: extractions,
        sourceLabel: `${extractions.length} 条数据：${shortTitle}`,
      });
    });

    return Response.json({ saved: savedCount }, { status: 201 });
  } catch (error) {
    console.error("Failed to batch save extractions:", error);
    return Response.json({ error: "批量保存提取结果失败" }, { status: 500 });
  }
}
