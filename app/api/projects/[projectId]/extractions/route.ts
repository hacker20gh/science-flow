import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

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

    await prisma.$transaction(async (tx: any) => {
      for (const ext of extractions) {
        await tx.extraction.create({
          data: {
            paperId,
            drugName: ext.drug_intervention?.name || null,
            drugConc: ext.drug_intervention?.concentration || null,
            cellLine: ext.model?.cell_line || null,
            pathway: ext.pathway_effects?.[0]?.pathway || null,
            pathwayDir: ext.pathway_effects?.[0]?.direction || null,
            phenotype: ext.phenotype_effects?.[0]?.phenotype || null,
            phenotypeDir: ext.phenotype_effects?.[0]?.direction || null,
            method: ext.statistical_test || null,
            conclusion: ext.conclusion || null,
            rawText: ext.evidence_quote || null,
            pathwayEffects: ext.pathway_effects || undefined,
            phenotypeEffects: ext.phenotype_effects || undefined,
          },
        });
      }

      await tx.timelineEvent.create({
        data: {
          projectId,
          type: "literature",
          title: `提取了 ${extractions.length} 条实验数据`,
          content: { paperId, count: extractions.length },
        },
      });
    });

    return Response.json({ count: extractions.length }, { status: 201 });
  } catch (error) {
    console.error("Failed to save extractions:", error);
    return Response.json({ error: "保存提取结果失败" }, { status: 500 });
  }
}
