/**
 * 文献分析报告 LLM 调用层
 *
 * 将机制矩阵数据转化为结构化的科研分析报告：
 * 全景摘要 + 矛盾分析 + 行动建议
 */

import { z } from "zod";
import { getLLMClient, MODELS, getModelForFeature, withLLMRetry, getIsRetryMode } from "./client";
import { createToolFromSchema, extractStructuredOutput, createRetryFunction } from "./json-extractor";
import { streamLLMWithToolUse, type SSEEvent } from "./streaming";
import { trackTokenUsage } from "@/lib/token-tracker";
import type { MatrixData } from "@/lib/matrix/generator";

// ===== Zod Schema =====

export const AnalysisReportSchema = z.object({
  summary: z.string().describe(
    "全景摘要：概述整体研究格局，包括研究热点、证据一致性、主要空白领域。" +
    "引用具体论文标题。2-3段，自然流畅的中文学术写作。"
  ),
  contradictions: z.array(z.object({
    pathway: z.string().describe("涉及的通路或表型名称"),
    description: z.string().describe(
      "矛盾原因分析：基于实验条件差异（细胞系、浓度、物种、处理时间）" +
      "解释为什么不同论文结论相反。一句话概括核心原因。"
    ),
    severity: z.enum(["high", "medium", "low"]).describe(
      "严重程度：high=真冲突（相同条件下矛盾），medium=可解释差异，low=轻微不一致"
    ),
  })),
  suggestions: z.array(z.object({
    priority: z.number().min(1).max(5).describe("优先级 1=最高 5=最低"),
    action: z.string().describe("具体的、可执行的行动建议"),
    rationale: z.string().describe("为什么建议这样做，基于什么证据"),
  })),
});

export type AnalysisReport = z.infer<typeof AnalysisReportSchema>;

// ===== Tool 定义 =====

const ANALYSIS_TOOL = createToolFromSchema(
  "generate_literature_report",
  "Generate a structured literature analysis report from matrix data",
  AnalysisReportSchema,
);

// ===== Prompt =====

const ANALYSIS_PROMPT = `你是一位资深的生物医学科研顾问，擅长文献综述分析。

你的任务是基于机制矩阵数据，生成一份结构化的文献分析报告。

## 输入数据说明

你将收到一份"矩阵摘要"，包含：
- 各通路/表型的研究论文数和方向分布
- 冲突信息（哪些通路存在矛盾）
- 空白信息（哪些通路缺少研究）
- 实验条件概况

## 输出要求

### 全景摘要（summary）
- 用中文学术写作风格
- 2-3段，覆盖：研究格局、热点方向、空白领域
- 必须引用具体论文标题（用括号引用）
- 指出哪些通路证据充分、哪些需要更多研究

### 矛盾分析（contradictions）
- 对每个检测到的冲突，分析原因
- 基于实验条件差异（细胞系、药物浓度、物种、处理时间）解释
- 判断是"真冲突"还是"可解释差异"

### 行动建议（suggestions）
- 3-5条具体可执行的建议
- 按优先级排序
- 每条建议必须有明确的rationale
- 建议类型：验证实验、补充文献、创建假设等

## 规则
- 所有内容使用中文
- 不要编造矩阵中不存在的信息
- 如果某个通路只有1-2篇文献，说明证据不足而非下结论`;

// ===== 数据预处理：MatrixData -> 简洁文本 =====

function matrixToPromptInput(matrixData: MatrixData): string {
  const parts: string[] = [];

  // 总体概况
  parts.push(`## 总体概况`);
  parts.push(`共分析 ${matrixData.totalPapers} 篇论文的 ${matrixData.totalExperiments} 个实验数据。\n`);

  // 通路研究统计
  parts.push(`## 通路研究统计`);
  const pathwayCols = matrixData.columns.filter(c => c.type === "pathway");
  for (const col of pathwayCols) {
    const ups = matrixData.rows.filter(r => r.cells[col.id]?.direction === "up").length;
    const downs = matrixData.rows.filter(r => r.cells[col.id]?.direction === "down").length;
    const noChange = matrixData.rows.filter(r => r.cells[col.id]?.direction === "no_change").length;
    const avgStrength = Math.round(
      matrixData.rows.filter(r => r.cells[col.id])
        .reduce((sum, r) => sum + (r.cells[col.id]?.evidenceStrength || 0), 0) /
      Math.max(col.count, 1)
    );
    parts.push(`- ${col.label}: ${col.count}篇研究 (↑${ups} ↓${downs} —${noChange}) 平均证据强度${avgStrength}/100`);
  }

  // 表型研究统计
  const phenoCols = matrixData.columns.filter(c => c.type === "phenotype");
  if (phenoCols.length > 0) {
    parts.push(`\n## 表型研究统计`);
    for (const col of phenoCols) {
      const ups = matrixData.rows.filter(r => r.cells[col.id]?.direction === "up").length;
      const downs = matrixData.rows.filter(r => r.cells[col.id]?.direction === "down").length;
      parts.push(`- ${col.label}: ${col.count}篇 (↑${ups} ↓${downs})`);
    }
  }

  // 冲突信息
  if (matrixData.conflicts.length > 0) {
    parts.push(`\n## 检测到的冲突`);
    for (const conflict of matrixData.conflicts) {
      const col = pathwayCols.find(c => c.id === conflict.columnId) || phenoCols.find(c => c.id === conflict.columnId);
      const label = col?.label || conflict.columnId;
      parts.push(`- ${label}: ${conflict.description}`);
      // 列出冲突涉及的实验条件
      for (const row of conflict.conflictingRows) {
        const cell = row.cells[conflict.columnId];
        if (cell) {
          parts.push(`  - ${row.paperTitle.slice(0, 50)}... | ${row.drugConc || "N/A"} | ${row.cellLine} | ${row.species} | ${cell.direction === "up" ? "↑" : "↓"}`);
        }
      }
    }
  }

  // 空白信息
  if (matrixData.gaps.length > 0) {
    const gapByCol = new Map<string, number>();
    for (const gap of matrixData.gaps) {
      gapByCol.set(gap.columnId, (gapByCol.get(gap.columnId) || 0) + 1);
    }
    parts.push(`\n## 研究空白`);
    for (const [colId, count] of gapByCol) {
      const col = matrixData.columns.find(c => c.id === colId);
      parts.push(`- ${col?.label || colId}: ${count}篇文献未涉及`);
    }
  }

  // 年份分布
  const years = matrixData.rows.map(r => r.year).filter(Boolean).sort();
  if (years.length > 0) {
    parts.push(`\n## 文献年份范围: ${years[0]} - ${years[years.length - 1]}`);
  }

  return parts.join("\n");
}

// ===== 核心函数 =====

/**
 * 非流式文献分析：返回完整 AnalysisReport
 */
export async function analyzeLiterature(
  matrixData: MatrixData
): Promise<AnalysisReport> {
  return withLLMRetry(async () => {
    const client = getLLMClient();
    const maxTokens = 4096;
    const model = await getModelForFeature("analysis");

    const promptInput = matrixToPromptInput(matrixData);
    const userMessage = `请基于以下矩阵数据，生成文献分析报告：\n\n${promptInput}`;

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: ANALYSIS_PROMPT,
      messages: [{ role: "user", content: userMessage }],
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "tool", name: "generate_literature_report" },
      _sciflowFeature: "literature-analysis",
    } as never);

    return extractStructuredOutput(response, AnalysisReportSchema, {
      label: "literature-analysis",
      retryFn: createRetryFunction(client, {
        model: MODELS.analysis,
        maxTokens,
        system: ANALYSIS_PROMPT,
        userMessage,
        originalContent: userMessage,
        schema: AnalysisReportSchema,
        feature: "literature-analysis",
      }),
    });
  }, { label: "literature-analysis" });
}

/**
 * 流式版本：summary 流式输出，contradictions/suggestions 等结构化结果返回后一次性给出
 */
export async function analyzeLiteratureStream(
  matrixData: MatrixData,
  onToken?: (event: SSEEvent) => void
): Promise<AnalysisReport> {
  return withLLMRetry(async () => {
    const client = getLLMClient();
    const maxTokens = 4096;
    const model = await getModelForFeature("analysis");

    const promptInput = matrixToPromptInput(matrixData);
    const userMessage = `请基于以下矩阵数据，生成文献分析报告：\n\n${promptInput}`;

    const llmParams = {
      model,
      max_tokens: maxTokens,
      system: ANALYSIS_PROMPT,
      messages: [{ role: "user" as const, content: userMessage }],
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "tool" as const, name: "generate_literature_report" },
    };

    if (onToken) {
      // 流式路径：手动追踪 token
      const streamStart = Date.now();
      const { toolUseBlocks, usage } = await streamLLMWithToolUse(client, llmParams, onToken);
      trackTokenUsage({
        feature: "literature-analysis",
        model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
        durationMs: Date.now() - streamStart,
        isRetry: getIsRetryMode(),
      });
      const toolResult = toolUseBlocks.find((t) => t.name === "generate_literature_report");
      if (toolResult) {
        return AnalysisReportSchema.parse(toolResult.input);
      }
      throw new Error("No tool_use block in streaming response");
    }

    // 无流式，走阻塞路径（monkey-patch 自动追踪 token）
    const response = await client.messages.create({
      ...llmParams,
      _sciflowFeature: "literature-analysis",
    } as never);

    return extractStructuredOutput(response, AnalysisReportSchema, {
      label: "literature-analysis",
      retryFn: createRetryFunction(client, {
        model: MODELS.analysis,
        maxTokens,
        system: ANALYSIS_PROMPT,
        userMessage,
        originalContent: userMessage,
        schema: AnalysisReportSchema,
        feature: "literature-analysis",
      }),
    });
  }, { label: "literature-analysis" });
}
