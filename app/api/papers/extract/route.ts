import { NextRequest, NextResponse } from "next/server";
import { extractFromText, type ExtractionResult } from "@/lib/llm/extraction";
import { createSSEStream, type SSEEvent } from "@/lib/llm/streaming";

interface ExtractRequestBody {
  papers: Array<{
    paperId: string;
    title: string;
    abstract?: string;
    fullText?: string;
  }>;
}

/**
 * POST /api/papers/extract
 *
 * 从论文摘要中提取结构化机制信息
 * 支持批量处理（并发 3）
 * 如果提供了 paperId，会自动从 DB 查找已保存的全文
 */
export async function POST(req: NextRequest) {
  try {
    const body: ExtractRequestBody = await req.json();
    const { papers } = body;

    if (!papers || !Array.isArray(papers) || papers.length === 0) {
      return NextResponse.json(
        { error: "papers array is required" },
        { status: 400 }
      );
    }

    // 限制批量大小
    if (papers.length > 10) {
      return NextResponse.json(
        { error: "Maximum 10 papers per extraction request" },
        { status: 400 }
      );
    }

    // 如果有 paperId，批量从 DB 查询 fullText + oaUrl（一次查询，避免 N+1）
    let dbFullTexts: Record<string, string> = {};
    const paperIds = papers.filter(p => p.paperId && !p.fullText).map(p => p.paperId);
    if (paperIds.length > 0) {
      try {
        const { prisma } = await import("@/lib/db-server");
        if (prisma) {
          const dbPapers = await prisma.paper.findMany({
            where: { id: { in: paperIds } },
            select: { id: true, fullText: true, oaUrl: true },
          });

          // 收集已有 fullText 的
          for (const dbPaper of dbPapers) {
            if (dbPaper.fullText) {
              dbFullTexts[dbPaper.id] = dbPaper.fullText;
            }
          }
          console.log(`[Extract] 从 DB 获取了 ${Object.keys(dbFullTexts).length} 篇论文的全文`);

          // 对没有 fullText 但有 oaUrl 的论文，自动下载 PDF 并提取文本
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const pdfParse = require("pdf-parse-new");
          const papersNeedingDownload = dbPapers.filter(
            (p: { id: string; fullText: string | null; oaUrl: string | null }) => !dbFullTexts[p.id] && p.oaUrl
          );

          // 逐个下载（await 确保全部完成后再开始提取）
          for (const dbPaper of papersNeedingDownload) {
            try {
              console.log(`[Extract] 自动下载 OA PDF: ${dbPaper.oaUrl}`);
              const response = await fetch(dbPaper.oaUrl!, {
                headers: { "User-Agent": "SciFlow-AI/1.0 (research tool)" },
                signal: AbortSignal.timeout(30000),
              });
              if (!response.ok) {
                console.warn(`[Extract] 下载失败: HTTP ${response.status}`);
                continue;
              }

              const contentType = response.headers.get("content-type");
              if (contentType && !contentType.includes("pdf")) {
                console.warn(`[Extract] 非 PDF: ${contentType}`);
                continue;
              }

              const buffer = Buffer.from(await response.arrayBuffer());
              if (buffer.length > 50 * 1024 * 1024) {
                console.warn(`[Extract] 文件过大: ${buffer.length}`);
                continue;
              }

              const pdfData = await pdfParse(buffer);
              if (pdfData.text && pdfData.text.trim().length > 100) {
                dbFullTexts[dbPaper.id] = pdfData.text;
                console.log(`[Extract] 自动下载成功: ${dbPaper.id} → ${pdfData.numpages} 页, ${pdfData.text.length} 字符`);
                // 异步保存到 DB（不阻塞提取）
                prisma.paper.update({
                  where: { id: dbPaper.id },
                  data: { fullText: pdfData.text },
                }).catch((err: unknown) => {
                  console.error(`[Extract] Failed to save fullText for ${dbPaper.id}:`, err);
                });
              } else {
                console.warn(`[Extract] PDF 文本过短: ${pdfData.text?.length || 0} 字符`);
              }
            } catch (dlError) {
              console.warn(`[Extract] 自动下载失败: ${(dlError as Error)?.message}`);
            }
          }
        }
      } catch {
        // DB 不可用时静默降级
      }
    }

    // 逐篇提取（流式返回每篇结果）
    const results: Array<{
      paperId: string;
      title: string;
      extraction: ExtractionResult | null;
      error?: string;
    }> = [];

    const CONCURRENCY = 5;
    const queue = [...papers];

    return createSSEStream(async (emit) => {
      emit({ type: "progress", step: "正在准备提取...", current: 0, total: papers.length });

      async function worker() {
        while (queue.length > 0) {
          const paper = queue.shift()!;
          try {
            const text = paper.fullText || dbFullTexts[paper.paperId] || paper.abstract || "";
            if (!text) {
              const result = { paperId: paper.paperId, title: paper.title, extraction: null, error: "No text available" };
              results.push(result);
              emit({ type: "progress", step: `跳过: ${paper.title}（无文本）`, current: results.length, total: papers.length });
              continue;
            }

            emit({ type: "progress", step: `正在提取: ${paper.title}`, current: results.length, total: papers.length });
            const extraction = await extractFromText(text, paper.title);
            const result = { paperId: paper.paperId, title: paper.title, extraction };
            results.push(result);
            // 每篇完成立即发送结果
            emit({ type: "result", data: { single: result, completed: results.length, total: papers.length } });
          } catch (error) {
            const result = { paperId: paper.paperId, title: paper.title, extraction: null, error: error instanceof Error ? error.message : "Extraction failed" };
            results.push(result);
            emit({ type: "result", data: { single: result, completed: results.length, total: papers.length } });
          }
          await sleep(500);
        }
      }

      await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

      // 发送最终汇总
      const successCount = results.filter((r) => r.extraction).length;
      const totalExperiments = results.reduce((sum, r) => sum + (r.extraction?.experiments?.length || 0), 0);
      emit({
        type: "result",
        data: {
          final: true,
          results,
          summary: { total: papers.length, success: successCount, errors: results.length - successCount, totalExperiments },
        },
      });
    });
  } catch (error) {
    console.error("Extraction error:", error);
    return createSSEStream(async (emit) => {
      emit({ type: "error", message: "Extraction failed. Please try again." });
    });
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
