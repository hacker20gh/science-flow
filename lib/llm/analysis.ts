/**
 * 数据分析 LLM 引擎
 */

import { getLLMClient, MODELS } from "./client";

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

const ANALYSIS_TOOL = {
  name: "analyze_data",
  description: "Analyze experimental data and provide statistical analysis with figure recommendations",
  input_schema: {
    type: "object" as const,
    properties: {
      data_type: { type: "string" as const, enum: ["dose_response", "time_course", "group_comparison", "correlation"] },
      description: { type: "string" as const },
      statistical_analysis: {
        type: "object" as const,
        properties: {
          recommended_test: { type: "string" as const },
          rationale: { type: "string" as const },
          assumptions: { type: "array" as const, items: { type: "string" as const } },
          post_hoc: { type: ["string" as const, "null" as const] },
        },
        required: ["recommended_test", "rationale", "assumptions", "post_hoc"],
      },
      results: {
        type: "object" as const,
        properties: {
          summary_stats: { type: "string" as const },
          test_results: { type: "string" as const },
          p_values: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                comparison: { type: "string" as const },
                p_value: { type: "string" as const },
                significance: { type: "string" as const },
              },
              required: ["comparison", "p_value", "significance"],
            },
          },
          effect_size: { type: ["string" as const, "null" as const] },
        },
        required: ["summary_stats", "test_results", "p_values", "effect_size"],
      },
      interpretation: {
        type: "object" as const,
        properties: {
          conclusion: { type: "string" as const },
          biological_meaning: { type: "string" as const },
          caveats: { type: "array" as const, items: { type: "string" as const } },
        },
        required: ["conclusion", "biological_meaning", "caveats"],
      },
      figure_config: {
        type: "object" as const,
        properties: {
          type: { type: "string" as const, enum: ["bar_chart", "box_plot", "line_chart", "scatter_plot", "heatmap"] },
          title: { type: "string" as const },
          x_axis: { type: "string" as const },
          y_axis: { type: "string" as const },
          annotations: { type: "array" as const, items: { type: "string" as const } },
        },
        required: ["type", "title", "x_axis", "y_axis", "annotations"],
      },
    },
    required: ["data_type", "description", "statistical_analysis", "results", "interpretation", "figure_config"],
  },
};

export async function analyzeData(params: {
  dataDescription: string;
  rawData: string;
  experimentContext?: string;
}): Promise<AnalysisResult> {
  const client = getLLMClient();
  const context = `实验数据: ${params.dataDescription}\n\n原始数据(CSV):\n${params.rawData}${params.experimentContext ? `\n\n实验背景: ${params.experimentContext}` : ""}`;

  const response = await client.messages.create({
    model: MODELS.analysis,
    max_tokens: 4096,
    system: "You are a biostatistician. Identify the data type, recommend appropriate statistical tests with rationale, perform analysis, interpret results, and suggest figure type. Always report exact p-values, calculate effect sizes, and flag if sample size is insufficient.",
    tools: [ANALYSIS_TOOL as any],
    tool_choice: { type: "tool", name: "analyze_data" },
    messages: [{ role: "user", content: `Analyze this data:\n\n${context}` }],
  });

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "analyze_data") {
      return block.input as AnalysisResult;
    }
  }
  throw new Error("Failed to analyze data");
}

export function parseCSV(text: string): { headers: string[]; rows: string[][]; summary: string } {
  const lines = text.trim().split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], rows: [], summary: "空数据" };
  const headers = lines[0].split(",").map((h) => h.trim());
  const rows = lines.slice(1).map((line) => line.split(",").map((c) => c.trim()));
  return { headers, rows, summary: `${headers.length} 列 × ${rows.length} 行数据。列名：${headers.join("、")}` };
}
