/**
 * 数据分析 LLM 引擎
 */

import { z } from "zod";
import { getLLMClient, MODELS, withLLMRetry } from "./client";
import { extractStructuredOutput, createRetryFunction, createToolFromSchema } from "./json-extractor";
import { streamLLMWithToolUse, type SSEEvent } from "./streaming";

export interface AnalysisResult {
  data_type: "dose_response" | "time_course" | "group_comparison" | "correlation";
  description: string;
  statistical_analysis: {
    recommended_test: string;
    rationale: string;
    assumptions: string[];
    post_hoc: string | null;
  };
  results: {
    summary_stats: string;
    test_results: string;
    p_values: Array<{ comparison: string; p_value: string; significance: string }>;
    effect_size: string | null;
  };
  interpretation: {
    conclusion: string;
    biological_meaning: string;
    caveats: string[];
  };
  figure_config: {
    type: "bar_chart" | "box_plot" | "line_chart" | "scatter_plot" | "heatmap";
    title: string;
    x_axis: string;
    y_axis: string;
    annotations: string[];
  };
}

const AnalysisResultSchema = z.object({
  data_type: z.enum(["dose_response", "time_course", "group_comparison", "correlation"]),
  description: z.string(),
  statistical_analysis: z.object({
    recommended_test: z.string(),
    rationale: z.string(),
    assumptions: z.array(z.string()),
    post_hoc: z.string().nullable(),
  }),
  results: z.object({
    summary_stats: z.string(),
    test_results: z.string(),
    p_values: z.array(z.object({
      comparison: z.string(),
      p_value: z.string(),
      significance: z.string(),
    })),
    effect_size: z.string().nullable(),
  }),
  interpretation: z.object({
    conclusion: z.string(),
    biological_meaning: z.string(),
    caveats: z.array(z.string()),
  }),
  figure_config: z.object({
    type: z.enum(["bar_chart", "box_plot", "line_chart", "scatter_plot", "heatmap"]),
    title: z.string(),
    x_axis: z.string(),
    y_axis: z.string(),
    annotations: z.array(z.string()),
  }),
});

const ANALYSIS_TOOL = createToolFromSchema(
  "analyze_data",
  "Analyze experimental data. Return statistical test recommendations, results, interpretation, and figure configuration.",
  AnalysisResultSchema,
);

export async function analyzeData(
  params: {
    dataDescription: string;
    rawData: string;
    experimentContext?: string;
  },
  onToken?: (event: SSEEvent) => void,
): Promise<AnalysisResult> {
  return withLLMRetry(async () => {
    const client = getLLMClient();
    const context = `实验数据: ${params.dataDescription}\n\n原始数据(CSV):\n${params.rawData}${params.experimentContext ? `\n\n实验背景: ${params.experimentContext}` : ""}`;

    const userMessage = `Analyze this data:\n\n${context}`;
    const systemPrompt = `You are a biostatistician analyzing experimental data.
Rules:
- Classify data type (dose_response / time_course / group_comparison / correlation)
- Recommend statistical test with rationale and assumption checks
- Report exact p-values and effect sizes (Cohen's d, eta-squared, etc.)
- Flag insufficient sample size (n<3 per group)
- Interpret results biologically; list caveats
- Suggest appropriate figure type with axis labels and annotations

EXAMPLE:
Input: 3 groups of cell viability measurements (Control, Drug A, Drug B)
Output: {"data_type":"group_comparison","description":"...","statistical_analysis":{"recommended_test":"One-way ANOVA with Tukey post-hoc","rationale":"3 independent groups, continuous DV","assumptions":["Normality (Shapiro-Wilk)","Homogeneity of variance (Levene's)"],"post_hoc":"Tukey HSD"},"results":{"summary_stats":"Control: 95±3%, Drug A: 72±5%, Drug B: 45±4%","test_results":"F(2,12)=45.2, p<0.001","p_values":[{"comparison":"Control vs Drug A","p_value":"0.003","significance":"**"},{"comparison":"Control vs Drug B","p_value":"<0.001","significance":"***"}],"effect_size":"eta-squared=0.88"},"interpretation":{"conclusion":"Both drugs reduce viability significantly","biological_meaning":"Drug B is more cytotoxic","caveats":["Single time point only","In vitro may not reflect in vivo"]},"figure_config":{"type":"box_plot","title":"Cell Viability by Treatment","x_axis":"Treatment Group","y_axis":"Viability (%)","annotations":["***p<0.001"]}}`;

    const llmParams = {
      model: MODELS.analysis,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user" as const, content: userMessage }],
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "tool" as const, name: "analyze_data" },
    };

    let result: AnalysisResult;

    if (onToken) {
      // 真流式：逐 token 发送
      const { toolUseBlocks } = await streamLLMWithToolUse(client, llmParams, onToken);
      const toolResult = toolUseBlocks.find((t) => t.name === "analyze_data");
      if (toolResult) {
        result = AnalysisResultSchema.parse(toolResult.input);
      } else {
        throw new Error("No tool_use block in streaming response");
      }
    } else {
      // 阻塞式
      const response = await client.messages.create(llmParams);
      result = await extractStructuredOutput(response, AnalysisResultSchema, {
        label: "analysis",
        retryFn: createRetryFunction(client, {
          model: MODELS.analysis,
          maxTokens: 4096,
          system: "You are a biostatistician. Identify the data type, recommend appropriate statistical tests, perform analysis, interpret results, and suggest figure type.",
          userMessage,
          originalContent: userMessage,
          schema: AnalysisResultSchema,
        }),
      });
    }

    return result;
  }, { label: "analysis" });
}

export function parseCSV(text: string): { headers: string[]; rows: string[][]; summary: string } {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [], summary: "空数据" };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => line.split(",").map((c) => c.trim()));
  return { headers, rows, summary: `${headers.length} 列 × ${rows.length} 行数据。列名：${headers.join("、")}` };
}
