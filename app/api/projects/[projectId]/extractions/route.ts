import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";
import { saveExtractionsToDB } from "@/lib/extraction-mapper";
import { requireAuth, requireProjectAccess } from "@/lib/api-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!prisma) {
    return Response.json({ extractions: [] }, { status: 503 });
  }

  const { projectId } = await params;

  const take = Math.min(Number(req.nextUrl.searchParams.get("take")) || 50, 200);
  const skip = Number(req.nextUrl.searchParams.get("skip")) || 0;

  try {
    const extractions = await prisma.extraction.findMany({
      where: { paper: { projectId } },
      include: {
        paper: { select: { title: true, year: true } },
        pathwayEffectsRelational: true,
        phenotypeEffectsRelational: true,
      },
      orderBy: { createdAt: "desc" },
      take,
      skip,
    });
    return Response.json({ extractions, take, skip });
  } catch (error) {
    console.error("Failed to list extractions:", error);
    return Response.json({ extractions: [] }, { status: 500 });
  }
}

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

    if (!paperId || !extractions?.length) {
      return Response.json({ error: "paperId 和 extractions 必填" }, { status: 400 });
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

    return Response.json({ count: savedCount }, { status: 201 });
  } catch (error) {
    console.error("Failed to save extractions:", error);
    return Response.json({ error: "保存提取结果失败" }, { status: 500 });
  }
}

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
  try {
    const body = await req.json();
    const { extractionId, verified } = body;
    if (!extractionId || typeof verified !== "boolean") {
      return Response.json({ error: "extractionId 和 verified 必填" }, { status: 400 });
    }
    const updated = await prisma.extraction.updateMany({
      where: { id: extractionId, paper: { projectId } },
      data: { verified },
    });
    if (updated.count === 0) {
      return Response.json({ error: "提取记录不存在" }, { status: 404 });
    }
    return Response.json({ updated: updated.count });
  } catch (error) {
    console.error("Failed to update verified:", error);
    return Response.json({ error: "更新失败" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;

  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;
  const { searchParams } = new URL(req.url);
  const extractionId = searchParams.get("id");

  if (!extractionId) {
    return Response.json({ error: "id 必填" }, { status: 400 });
  }

  try {
    // 验证 extraction 属于当前项目
    const extraction = await prisma.extraction.findFirst({
      where: { id: extractionId, paper: { projectId } },
      select: { id: true },
    });
    if (!extraction) {
      return Response.json({ error: "实验记录不存在" }, { status: 404 });
    }

    // 关联删除 pathway/phenotype effects
    await prisma.pathwayEffect.deleteMany({ where: { extractionId } });
    await prisma.phenotypeEffect.deleteMany({ where: { extractionId } });
    await prisma.extraction.delete({ where: { id: extractionId } });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Failed to delete extraction:", error);
    return Response.json({ error: "删除失败" }, { status: 500 });
  }
}
