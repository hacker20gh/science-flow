/**
 * 数据分析 LLM 引擎
 */

import { z } from "zod";
import { getLLMClient, MODELS, withLLMRetry } from "./client";
import { extractStructuredOutput, createRetryFunction } from "./json-extractor";

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

const ANALYSIS_SYSTEM_SUFFIX = `\n\nCRITICAL: You MUST return ONLY a valid JSON object. No thinking, no explanation, no markdown code blocks. The JSON MUST have this exact structure:\n{"data_type":"string","description":"string","statistical_analysis":{"recommended_test":"string","rationale":"string","assumptions":["string"],"post_hoc":"string or null"},"results":{"summary_stats":"string","test_results":"string","p_values":[{"comparison":"string","p_value":"string","significance":"string"}],"effect_size":"string"},"interpretation":{"conclusion":"string","biological_meaning":"string","caveats":["string"]},"figure_config":{"type":"string","title":"string","x_axis":"string","y_axis":"string","annotations":["string"]}}`;

export async function analyzeData(params: {
  dataDescription: string;
  rawData: string;
  experimentContext?: string;
}): Promise<AnalysisResult> {
  return withLLMRetry(async () => {
    const client = getLLMClient();
    const context = `实验数据: ${params.dataDescription}\n\n原始数据(CSV):\n${params.rawData}${params.experimentContext ? `\n\n实验背景: ${params.experimentContext}` : ""}`;

    const userMessage = `Analyze this data:\n\n${context}`;
    const systemPrompt = `You are a biostatistician. Identify the data type, recommend appropriate statistical tests with rationale, perform analysis, interpret results, and suggest figure type. Always report exact p-values, calculate effect sizes, and flag if sample size is insufficient.${ANALYSIS_SYSTEM_SUFFIX}`;

    const response = await client.messages.create({
      model: MODELS.analysis,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    return await extractStructuredOutput(response, AnalysisResultSchema, {
      label: "analysis",
      retryFn: createRetryFunction(client, {
        model: MODELS.analysis,
        maxTokens: 4096,
        system: systemPrompt,
        userMessage,
        originalContent: userMessage,
        schema: AnalysisResultSchema,
      }),
    });
  }, { label: "analysis" });
}

export function parseCSV(text: string): { headers: string[]; rows: string[][]; summary: string } {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [], summary: "空数据" };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => line.split(",").map((c) => c.trim()));
  return { headers, rows, summary: `${headers.length} 列 × ${rows.length} 行数据。列名：${headers.join("、")}` };
}
