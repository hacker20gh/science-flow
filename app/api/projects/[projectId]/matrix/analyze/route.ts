import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db-server";
import { analyzeLiteratureStream, type AnalysisReport } from "@/lib/llm/literature-analyzer";
import { createSSEStream, type SSEEvent } from "@/lib/llm/streaming";
import type { MatrixData } from "@/lib/matrix/generator";

/**
 * GET /api/projects/{projectId}/matrix/analyze
 * 返回缓存的分析报告（如有）
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const { projectId } = await params;
    const matrix = await prisma?.mechanismMatrix.findUnique({
      where: { projectId },
      select: { analysisReport: true },
    });

    return NextResponse.json({ report: matrix?.analysisReport || null });
  } catch (error) {
    console.error("Failed to load analysis report:", error);
    return NextResponse.json({ report: null });
  }
}

/**
 * POST /api/projects/{projectId}/matrix/analyze
 * 基于矩阵数据生成文献分析报告（SSE 流式返回）
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const { projectId } = await params;
    const body = await req.json();
    const { matrixData } = body as { matrixData: MatrixData };

    if (!matrixData || !matrixData.rows || !matrixData.columns) {
      return NextResponse.json({ error: "matrixData 必填" }, { status: 400 });
    }

    return createSSEStream(async (emit) => {
      emit({ type: "text", text: "" }); // 触发连接

      try {
        const report = await analyzeLiteratureStream(matrixData, (event: SSEEvent) => {
          // 流式转发 LLM 文本
          if (event.type === "text") {
            emit(event);
          }
        });

        // 持久化到 DB
        if (prisma) {
          try {
            const reportJson = JSON.parse(JSON.stringify(report));
            const matrixJson = JSON.parse(JSON.stringify(matrixData));
            await prisma.mechanismMatrix.upsert({
              where: { projectId },
              update: { analysisReport: reportJson },
              create: {
                projectId,
                data: matrixJson,
                analysisReport: reportJson,
              },
            });
          } catch (dbErr) {
            console.error("Failed to persist analysis report:", dbErr);
          }
        }

        // 发送结构化结果
        emit({ type: "result", data: report });
      } catch (error) {
        emit({ type: "error", message: error instanceof Error ? error.message : "分析失败" });
      }
    });
  } catch (error) {
    console.error("Analysis error:", error);
    return createSSEStream(async (emit) => {
      emit({ type: "error", message: "分析失败，请稍后重试" });
    });
  }
}
