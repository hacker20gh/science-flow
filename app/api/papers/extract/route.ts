import { NextRequest, NextResponse } from "next/server";
import { extractFromText, type ExtractionResult } from "@/lib/llm/extraction";

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

    // 逐篇提取（简单并发，不需要 progress callback）
    const results: Array<{
      paperId: string;
      title: string;
      extraction: ExtractionResult | null;
      error?: string;
    }> = [];

    const CONCURRENCY = 3;
    const queue = [...papers];

    async function worker() {
      while (queue.length > 0) {
        const paper = queue.shift()!;
        try {
          const text = paper.fullText || paper.abstract || "";
          if (!text) {
            results.push({
              paperId: paper.paperId,
              title: paper.title,
              extraction: null,
              error: "No text available for extraction",
            });
            continue;
          }

          const extraction = await extractFromText(text, paper.title);
          results.push({
            paperId: paper.paperId,
            title: paper.title,
            extraction,
          });
        } catch (error) {
          results.push({
            paperId: paper.paperId,
            title: paper.title,
            extraction: null,
            error: error instanceof Error ? error.message : "Extraction failed",
          });
        }

        await sleep(500); // 速率控制
      }
    }

    await Promise.all(
      Array.from({ length: CONCURRENCY }, () => worker())
    );

    // 汇总统计
    const successCount = results.filter((r) => r.extraction).length;
    const errorCount = results.filter((r) => r.error).length;
    const totalExperiments = results.reduce((sum, r) => {
      if (r.extraction?.experiments) {
        return sum + r.extraction.experiments.length;
      }
      return sum;
    }, 0);

    return NextResponse.json({
      results,
      summary: {
        total: papers.length,
        success: successCount,
        errors: errorCount,
        totalExperiments,
      },
    });
  } catch (error) {
    console.error("Extraction error:", error);
    return NextResponse.json(
      { error: "Extraction failed. Please try again." },
      { status: 500 }
    );
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
