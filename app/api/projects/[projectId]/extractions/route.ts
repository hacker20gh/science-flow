import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!process.env.DATABASE_URL) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;
  const body = await req.json();
  const { paperId, extractions } = body;

  if (!paperId || !extractions?.length) {
    return Response.json({ error: "paperId 和 extractions 必填" }, { status: 400 });
  }

  try {
    // 批量创建提取结果
    const results = await Promise.all(
      extractions.map((ext: Record<string, unknown>) =>
        prisma.extraction.create({
          data: {
            paperId,
            drugName: (ext.drug_intervention as Record<string, unknown>)?.name as string || null,
            drugConc: (ext.drug_intervention as Record<string, unknown>)?.concentration as string || null,
            cellLine: (ext.model as Record<string, unknown>)?.cell_line as string || null,
            pathway: (ext.pathway_effects as Array<Record<string, unknown>>)?.[0]?.pathway as string || null,
            pathwayDir: (ext.pathway_effects as Array<Record<string, unknown>>)?.[0]?.direction as string || null,
            phenotype: (ext.phenotype_effects as Array<Record<string, unknown>>)?.[0]?.phenotype as string || null,
            phenotypeDir: (ext.phenotype_effects as Array<Record<string, unknown>>)?.[0]?.direction as string || null,
            method: ext.statistical_test as string || null,
            conclusion: ext.conclusion as string || null,
            rawText: ext.evidence_quote as string || null,
          },
        })
      )
    );

    // 记录时间线
    await prisma.timelineEvent.create({
      data: {
        projectId,
        type: "literature",
        title: `提取了 ${results.length} 条实验数据`,
        content: { paperId, count: results.length },
      },
    });

    return Response.json({ extractions: results }, { status: 201 });
  } catch (error) {
    console.error("Failed to save extractions:", error);
    return Response.json({ error: "保存提取结果失败" }, { status: 500 });
  }
}
