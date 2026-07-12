/**
 * Inngest Function: 批量论文提取
 *
 * 在后台运行批量 LLM 提取，替代 SSE 流式方案。
 * 用户提交任务后可以离开页面，完成后通过 DB 查询结果。
 */

import { inngest } from "../client";
import { extractFromText } from "@/lib/llm/extraction";

export const batchExtractFunction = inngest.createFunction(
  {
    id: "batch-extract",
    name: "批量论文提取",
    triggers: [{ event: "app/papers.extract" }],
  },
  async ({ event, step }) => {
    const { projectId, papers } = event.data as {
      projectId: string;
      papers: Array<{
        paperId: string;
        title: string;
        abstract?: string;
        fullText?: string;
      }>;
    };
    const results: Array<{ paperId: string; success: boolean; error?: string }> = [];

    for (const paper of papers) {
      const result = await step.run(
        `extract-${paper.paperId}`,
        async () => {
          try {
            const text = paper.fullText || paper.abstract || "";
            if (!text) {
              return { paperId: paper.paperId, success: false, error: "无论文文本" };
            }

            const extraction = await extractFromText(text, paper.title);

            const { prisma } = await import("@/lib/db-server");
            if (!prisma) {
              return { paperId: paper.paperId, success: false, error: "数据库不可用" };
            }

            for (const exp of extraction.experiments) {
              await prisma.extraction.create({
                data: {
                  paperId: paper.paperId,
                  drugName: exp.drug_intervention?.name || null,
                  drugConc: exp.drug_intervention?.concentration || null,
                  duration: exp.drug_intervention?.duration || null,
                  coTreatment: exp.drug_intervention?.co_treatment || null,
                  cellLine: exp.model?.cell_line || null,
                  species: exp.model?.species || null,
                  pathway: exp.pathway_effects?.[0]?.pathway || null,
                  phenotype: exp.phenotype_effects?.[0]?.phenotype || null,
                  method: exp.pathway_effects?.[0]?.method || null,
                  conclusion: exp.conclusion || null,
                  rawText: exp.evidence_quote || null,
                  pathwayEffects: exp.pathway_effects || [],
                  phenotypeEffects: exp.phenotype_effects || [],
                  controls: exp.controls || [],
                  sampleSize: exp.sample_size || null,
                  confidence: exp.confidence || null,
                },
              });
            }

            return { paperId: paper.paperId, success: true };
          } catch (err) {
            return {
              paperId: paper.paperId,
              success: false,
              error: (err as Error)?.message,
            };
          }
        }
      );

      results.push(result);
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    await step.run("timeline-event", async () => {
      const { prisma } = await import("@/lib/db-server");
      if (!prisma) return;

      await prisma.timelineEvent.create({
        data: {
          projectId,
          type: "literature",
          title: `批量提取完成：${successful} 成功${failed > 0 ? `，${failed} 失败` : ""}`,
          content: { results, source: "inngest" },
        },
      });
    });

    return { successful, failed, results };
  }
);
