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
          data: {
            paperId,
            drugName: ext.drug_intervention?.name || null,
            drugConc: ext.drug_intervention?.concentration || null,
            duration: ext.drug_intervention?.duration || null,
            coTreatment: ext.drug_intervention?.co_treatment || null,
            cellLine: ext.model?.cell_line || null,
            species: ext.model?.species || null,
            passage: ext.model?.passage || null,
            pathway: ext.pathway_effects?.[0]?.pathway || null,
            pathwayDir: ext.pathway_effects?.[0]?.direction || null,
            phenotype: ext.phenotype_effects?.[0]?.phenotype || null,
            phenotypeDir: ext.phenotype_effects?.[0]?.direction || null,
            method: ext.statistical_test || null,
            expMethod: ext.pathway_effects?.[0]?.method || null,
            conclusion: ext.conclusion || null,
            rawText: ext.evidence_quote || null,
            pathwayEffects: ext.pathway_effects || undefined,
            phenotypeEffects: ext.phenotype_effects || undefined,
            controls: ext.controls || undefined,
            sampleSize: ext.sample_size || null,
            confidence: ext.confidence || null,
          },
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
