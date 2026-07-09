/**
 * 数据分析引擎
 *
 * 从上传的数据中自动：
 * 1. 识别数据类型（剂量-效应、时间序列、组间比较）
 * 2. 推荐统计方法
 * 3. 生成分析结果和图表配置
 */

import { z } from "zod";
import { getLLMClient, MODELS } from "./client";
import { zodResponseFormat } from "openai/helpers/zod";

// ===== Schema =====

export const AnalysisSchema = z.object({
  data_type: z.enum(["dose_response", "time_course", "group_comparison", "correlation"]),
  description: z.string().describe("数据特征的简要描述"),

  statistical_analysis: z.object({
    recommended_test: z.string().describe("推荐的统计检验方法"),
    rationale: z.string().describe("为什么推荐这个方法"),
    assumptions: z.array(z.string()).describe("统计假设"),
    post_hoc: z.string().nullable().describe("事后检验方法（如 ANOVA 后的 Tukey）"),
  }),

  results: z.object({
    summary_stats: z.string().describe("描述性统计结果的文本报告"),
    test_results: z.string().describe("统计检验结果"),
    p_values: z.array(z.object({
      comparison: z.string().describe("比较的组"),
      p_value: z.string().describe("p 值"),
      significance: z.string().describe("显著性水平"),
    })),
    effect_size: z.string().nullable().describe("效应量"),
  }),

  interpretation: z.object({
    conclusion: z.string().describe("统计学结论"),
    biological_meaning: z.string().describe("生物学意义"),
    caveats: z.array(z.string()).describe("注意事项和局限"),
  }),

  figure_config: z.object({
    type: z.enum(["bar_chart", "box_plot", "line_chart", "scatter_plot", "heatmap"]),
    title: z.string().describe("图表标题"),
    x_axis: z.string().describe("X 轴标签"),
    y_axis: z.string().describe("Y 轴标签"),
    annotations: z.array(z.string()).describe("显著性标注"),
  }),
});

export type AnalysisResult = z.infer<typeof AnalysisSchema>;

// ===== Prompt =====

const ANALYSIS_PROMPT = `You are a biostatistician specializing in experimental data analysis for biomedical research.

Given experimental data, perform the following:
1. Identify the data type (dose-response, time-course, group comparison, correlation)
2. Recommend the appropriate statistical test with rationale
3. Perform the analysis and report results
4. Interpret findings in biological context
5. Suggest a figure type and configuration

Statistical guidelines:
- For 2 groups: t-test (parametric) or Mann-Whitney (non-parametric)
- For ≥3 groups: One-way ANOVA + post-hoc (Tukey/Dunnett) or Kruskal-Wallis
- For dose-response: nonlinear regression, IC50 calculation
- For time-course: repeated measures ANOVA or mixed-effects model
- Always check assumptions (normality, equal variance)
- Report exact p-values, not just "significant"
- Calculate effect sizes (Cohen's d, eta-squared)
- Flag if sample size is insufficient for the chosen test

IMPORTANT:
- Be conservative with significance claims
- If n < 3, warn that results are preliminary
- Always suggest biological replicates verification`;

// ===== 分析函数 =====

export async function analyzeData(params: {
  dataDescription: string;
  rawData: string; // CSV 格式的原始数据
  experimentContext?: string;
}): Promise<AnalysisResult> {
  const client = getLLMClient();

  const context = `## 实验数据
${params.dataDescription}

## 原始数据（CSV 格式）
\`\`\`csv
${params.rawData}
\`\`\`

${params.experimentContext ? `## 实验背景\n${params.experimentContext}` : ""}

请分析这些数据并提供完整的统计分析报告。`;

  const response = await client.chat.completions.parse({
    model: MODELS.analysis,
    max_tokens: 4096,
    messages: [
      { role: "system", content: ANALYSIS_PROMPT },
      { role: "user", content: context },
    ],
    response_format: zodResponseFormat(AnalysisSchema, "analysis"),
  });

  const parsed = response.choices[0]?.message?.parsed;
  if (!parsed) throw new Error("Failed to analyze data");

  return parsed;
}

// ===== CSV 解析辅助 =====

/**
 * 解析 CSV 文本为表格数据
 */
export function parseCSV(text: string): {
  headers: string[];
  rows: string[][];
  summary: string;
} {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [], summary: "空数据" };

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) =>
    line.split(",").map((cell) => cell.trim())
  );

  const summary = `${headers.length} 列 × ${rows.length} 行数据。列名：${headers.join("、")}`;

  return { headers, rows, summary };
}
