/**
 * Inngest Function: 批量论文提取
 *
 * 在后台运行批量 LLM 提取，替代 SSE 流式方案。
 * 用户提交任务后可以离开页面，完成后通过 DB 查询结果。
 *
 * 支持从 DB 查询 fullText + 自动下载 OA PDF 作为 fallback。
 */

import { inngest } from "../client";
import { extractFromText, flattenConclusions } from "@/lib/llm/extraction";
import { mapExtractionToDB, extractRelationalEffects } from "@/lib/extraction-mapper";

/** 从 DB 获取论文全文，对有 oaUrl 的尝试自动下载 PDF */
async function ensureFullTexts(
  papers: Array<{ paperId: string; title: string; abstract?: string; fullText?: string }>
): Promise<Map<string, string>> {
  const fullTexts = new Map<string, string>();

  // 已有 fullText 的直接用
  for (const p of papers) {
    if (p.fullText && p.fullText.trim().length > 100) {
      fullTexts.set(p.paperId, p.fullText);
    }
  }

  // 需要从 DB 查的 paperId
  const needDB = papers.filter(p => !fullTexts.has(p.paperId));
  if (needDB.length === 0) return fullTexts;

  try {
    const { prisma } = await import("@/lib/db-server");
    if (!prisma) return fullTexts;

    const ids = needDB.map(p => p.paperId);
    const dbPapers = await prisma.paper.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullText: true, oaUrl: true },
    });

    for (const db of dbPapers) {
      if (db.fullText && db.fullText.trim().length > 100) {
        fullTexts.set(db.id, db.fullText);
      }
    }

    // 对没有 fullText 但有 oaUrl 的，自动下载 PDF
    const needDownload = dbPapers.filter(db => !fullTexts.has(db.id) && db.oaUrl);
    for (const db of needDownload) {
      try {
        const res = await fetch(db.oaUrl!, {
          headers: { "User-Agent": "SciFlow-AI/1.0 (research tool)" },
          signal: AbortSignal.timeout(30000),
        });
        if (!res.ok) continue;
        const ct = res.headers.get("content-type");
        if (ct && !ct.includes("pdf")) continue;

        const buffer = Buffer.from(await res.arrayBuffer());
        if (buffer.length > 50 * 1024 * 1024) continue;

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require("pdf-parse-new");
        const pdfData = await pdfParse(buffer);
        if (pdfData.text && pdfData.text.trim().length > 100) {
          fullTexts.set(db.id, pdfData.text);
          // fire-and-forget 保存到 DB
          prisma.paper.update({
            where: { id: db.id },
            data: { fullText: pdfData.text },
          }).catch(() => {});
        }
      } catch {
        // PDF 下载失败，跳过
      }
    }
  } catch {
    // DB 查询失败，继续用已有的 fullText
  }

  return fullTexts;
}

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

    // 确保每篇论文都有文本（DB 查询 + PDF 下载）
    const fullTextMap = await step.run("ensure-texts", async () => {
      const map = await ensureFullTexts(papers);
      return Object.fromEntries(map);
    });

    const results: Array<{ paperId: string; success: boolean; error?: string }> = [];

    for (const paper of papers) {
      const result = await step.run(
        `extract-${paper.paperId}`,
        async () => {
          try {
            const text = fullTextMap[paper.paperId] || paper.fullText || paper.abstract || "";
            if (!text) {
              return { paperId: paper.paperId, success: false, error: "无论文文本（无全文、无摘要、PDF 下载失败）" };
            }

            const extraction = await extractFromText(text, paper.title);

            const { prisma } = await import("@/lib/db-server");
            if (!prisma) {
              return { paperId: paper.paperId, success: false, error: "数据库不可用" };
            }

            const flatExperiments = flattenConclusions(extraction);

            if (flatExperiments.length === 0) {
              return {
                paperId: paper.paperId,
                success: false,
                error: "提取结果为空：论文可能缺少详细实验数据（仅摘要不足以提取）",
              };
            }

            for (const exp of flatExperiments) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const record = await prisma.extraction.create({
                data: mapExtractionToDB(exp as any, paper.paperId) as any,
              });

              // 创建关联的关系型通路/表型效果
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { pathwayEffects, phenotypeEffects } = extractRelationalEffects(exp as any);

              if (pathwayEffects.length > 0) {
                await prisma.pathwayEffect.createMany({
                  data: pathwayEffects.map(pe => ({
                    extractionId: record.id,
                    pathway: pe.pathway,
                    direction: pe.direction,
                    significance: pe.significance,
                    method: pe.method,
                    foldChange: pe.foldChange,
                  })),
                });
              }

              if (phenotypeEffects.length > 0) {
                await prisma.phenotypeEffect.createMany({
                  data: phenotypeEffects.map(ph => ({
                    extractionId: record.id,
                    phenotype: ph.phenotype,
                    direction: ph.direction,
                    foldChange: ph.foldChange,
                  })),
                });
              }
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
