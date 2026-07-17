import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { extractWithFallback, extractTwoPhase, verifyExtractionCompleteness, flattenConclusions, getExperimentCount, type ExtractionResult } from "@/lib/llm/extraction";
import { validateExtraction } from "@/lib/llm/extraction-validator";
import { postProcessExtractions } from "@/lib/llm/extraction-postprocess";
import { createSSEStream, type SSEEvent } from "@/lib/llm/streaming";
import { sleep } from "@/lib/utils/sleep";
import { fetchFullText } from "@/lib/fulltext-fetcher";

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
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

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
    // 同时验证论文属于当前用户的项目（安全检查）
    const dbFullTexts: Record<string, string> = {};
    const paperIds = papers.filter(p => p.paperId && !p.fullText).map(p => p.paperId);
    if (paperIds.length > 0) {
      try {
        const { prisma } = await import("@/lib/db-server");
        if (prisma) {
          // 用局部变量收窄类型，确保 async 闭包中不会丢失 null 收窄
          const db = prisma;
          const dbPapers = await db.paper.findMany({
            where: {
              id: { in: paperIds },
              project: { userId: session.user.id! },  // 只查询属于当前用户的项目
            },
            select: { id: true, title: true, fullText: true, oaUrl: true, doi: true, pmid: true },
          });

          // 收集已有 fullText 的
          for (const dbPaper of dbPapers) {
            if (dbPaper.fullText) {
              dbFullTexts[dbPaper.id] = dbPaper.fullText;
            }
          }
          console.log(`[Extract] 从 DB 获取了 ${Object.keys(dbFullTexts).length} 篇论文的全文`);

          // 对没有 fullText 的论文，从多个 OA 来源尝试获取全文
          const papersNeedingDownload = dbPapers.filter(
            (p: { id: string; fullText: string | null; oaUrl: string | null; doi: string | null; pmid: string | null }) =>
              !dbFullTexts[p.id]
          );
          console.log(`[Extract] 需要获取全文: ${papersNeedingDownload.length} 篇`);

          // 并发获取全文（3 个并发）
          const CONCURRENT_DOWNLOADS = 3;
          const downloadQueue = [...papersNeedingDownload];

          async function downloadWorker() {
            while (downloadQueue.length > 0) {
              const dbPaper = downloadQueue.shift()!;
              try {
                const result = await fetchFullText(dbPaper);
                if (result) {
                  dbFullTexts[dbPaper.id] = result.text;
                  console.log(`[FullText] 全文获取成功: ${dbPaper.id.slice(0, 10)} via ${result.source} (${result.text.length} 字符)`);
                  try {
                    await db.paper.update({
                      where: { id: dbPaper.id },
                      data: { fullText: result.text },
                    });
                    console.log(`[FullText] 全文已保存到 DB: ${dbPaper.id.slice(0, 10)}`);
                  } catch (saveErr) {
                    console.error(`[FullText] 保存全文失败 ${dbPaper.id}:`, saveErr);
                  }
                }
              } catch (err) {
                console.warn(`[FullText] 获取失败 ${dbPaper.id}: ${(err as Error)?.message}`);
              }
            }
          }

          await Promise.all(Array.from({ length: CONCURRENT_DOWNLOADS }, () => downloadWorker()));
        }
      } catch (dbError) {
        console.error("[Extract] DB query failed, continuing without fullText:", dbError);
      }
    }

    // 逐篇提取（流式返回每篇结果）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const results: Array<{
      paperId: string;
      title: string;
      extraction: any;
      error?: string;
      suggestModelSwitch?: boolean;
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
            // 全文用两阶段提取（更精准），摘要用单次提取（更快）
            const isFullText = text.length > 800;
            let rawExtraction = isFullText
              ? await extractTwoPhase(text, paper.title)
              : await extractWithFallback(text, paper.title);

            // 完整性验证（全文才验证，摘要跳过）
            if (isFullText && getExperimentCount(rawExtraction) >= 3) {
              rawExtraction = await verifyExtractionCompleteness(text, paper.title, rawExtraction);
            }

            // 质量校验 + 自动修正
            const validation = validateExtraction(rawExtraction);
            const extraction = validation.cleaned;
            if (validation.autoFixedCount > 0) {
              console.log(`[Extract] ${paper.title}: 自动修正 ${validation.autoFixedCount} 处 (${validation.overallQuality}, ${validation.averageScore}分)`);
            }

            // 保留原始结论结构，逐个结论做后处理
            const originalConclusions = extraction.conclusions || [];
            const processedConclusions = originalConclusions.map(conc => {
              const processed = postProcessExtractions({ experiments: conc.evidenceChain });
              return { claim: conc.claim, evidenceChain: processed.experiments };
            }).filter(c => c.evidenceChain.length > 0);

            // 扁平化用于 DB 存储（带 conclusionIndex + conclusionClaim）
            const finalExperiments = processedConclusions.flatMap((conc, i) =>
              conc.evidenceChain.map(exp => ({ ...exp, conclusionIndex: i, conclusionClaim: conc.claim }))
            );

            if (finalExperiments.length === 0) {
              const warning = text.length < 500
                ? "文本过短（仅摘要），缺少实验细节"
                : "LLM 未提取到实验数据（已尝试3种不同策略）";
              const result = {
                paperId: paper.paperId,
                title: paper.title,
                extraction: null,
                error: `提取结果为空：${warning}`,
                suggestModelSwitch: true,
              };
              results.push(result);
              emit({ type: "result", data: { single: result, completed: results.length, total: papers.length } });
            } else {
              // 同时返回两种格式，兼容新旧前端
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const result: any = {
                paperId: paper.paperId,
                title: paper.title,
                extraction: {
                  claim: extraction.claim,
                  experiments: finalExperiments,  // 旧格式：扁平数组（兼容 search/page.tsx）
                  conclusions: processedConclusions,  // 新格式：结论 + 证据链
                },
              };
              results.push(result);
              emit({ type: "result", data: { single: result, completed: results.length, total: papers.length } });
            }
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
      const successCount = results.filter((r) => r.extraction && getExperimentCount(r.extraction) > 0).length;
      const emptyCount = results.filter((r) => r.extraction && getExperimentCount(r.extraction) === 0).length;
      const errorCount = results.filter((r) => !r.extraction).length;
      const totalExperiments = results.reduce((sum, r) => sum + (r.extraction ? getExperimentCount(r.extraction) : 0), 0);
      emit({
        type: "result",
        data: {
          final: true,
          results,
          summary: { total: papers.length, success: successCount, empty: emptyCount, errors: errorCount, totalExperiments },
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
