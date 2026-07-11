import { NextRequest } from "next/server";
import { generateManuscript } from "@/lib/llm/manuscript";
import { createSSEStream } from "@/lib/llm/streaming";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectName, hypothesis, matrixSummary, papers, experiments, section } = body;

    if (!projectName || !hypothesis) {
      return new Response(
        JSON.stringify({ error: "projectName and hypothesis are required" }),
        { status: 400 }
      );
    }

    return createSSEStream(async (emit) => {
      emit({
        type: "progress",
        step: "正在分析项目数据...",
        current: 0,
        total: 5,
      });

      // 单次 LLM 调用生成全部章节
      // tool_use 强制输出结构化 JSON，通过 onToken 回调实现真流式
      const manuscript = await generateManuscript(
        {
          projectName,
          hypothesis,
          matrixSummary: matrixSummary || "",
          papers: papers || [],
          experiments: experiments || [],
          section: section || "all",
        },
        emit,
      );

      // 逐章节 emit 进度 + 结果
      const sectionNames = ["abstract", "introduction", "methods", "results", "discussion"] as const;
      for (let i = 0; i < sectionNames.length; i++) {
        const name = sectionNames[i];
        if (manuscript[name]) {
          emit({
            type: "progress",
            step: `✓ ${name.charAt(0).toUpperCase() + name.slice(1)} 完成`,
            current: i + 1,
            total: 5,
          });
        }
      }

      emit({ type: "result", data: manuscript });
    });
  } catch (error) {
    console.error("Manuscript generation error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate manuscript" }),
      { status: 500 }
    );
  }
}
