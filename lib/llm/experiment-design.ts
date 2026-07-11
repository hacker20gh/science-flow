/**
 * 实验设计 LLM 引擎
 */

import { z } from "zod";
import { getLLMClient, MODELS, withLLMRetry } from "./client";
import { calculateSampleSize } from "@/lib/power-analysis";
import { extractStructuredOutput, createRetryFunction, createToolFromSchema } from "./json-extractor";
import { streamLLMWithToolUse, type SSEEvent } from "./streaming";
import { trackTokenUsage } from "@/lib/token-tracker";

export interface ExperimentDesign {
  name: string;
  hypothesis: string;
  rationale: string;
  variables: { independent: string[]; dependent: string[]; controlled: string[] };
  groups: Array<{ name: string; description: string; purpose: string }>;
  protocol: {
    cellLine: string;
    passage: string | null;
    reagents: Array<{ name: string; concentration: string; source: string | null }>;
    steps: Array<{ day: string; action: string; details: string }>;
    readouts: string[];
    duration: string;
  };
  controls_check: {
    has_vehicle: boolean;
    has_positive: boolean;
    has_negative: boolean;
    missing: string[];
    suggestions: string[];
  };
  sample_size: { recommended: number; rationale: string };
  expected_outcomes: Array<{ scenario: string; interpretation: string; nextStep: string }>;
  references: string[];
}

const ExperimentDesignSchema = z.object({
  name: z.string(),
  hypothesis: z.string(),
  rationale: z.string(),
  variables: z.object({
    independent: z.array(z.string()),
    dependent: z.array(z.string()),
    controlled: z.array(z.string()),
  }),
  groups: z.array(z.object({
    name: z.string(),
    description: z.string(),
    purpose: z.string(),
  })),
  protocol: z.object({
    cellLine: z.string(),
    passage: z.string().nullable(),
    reagents: z.array(z.object({
      name: z.string(),
      concentration: z.string(),
      source: z.string().nullable(),
    })),
    steps: z.array(z.object({
      day: z.string(),
      action: z.string(),
      details: z.string(),
    })),
    readouts: z.array(z.string()),
    duration: z.string(),
  }),
  controls_check: z.object({
    has_vehicle: z.boolean(),
    has_positive: z.boolean(),
    has_negative: z.boolean(),
    missing: z.array(z.string()),
    suggestions: z.array(z.string()),
  }),
  sample_size: z.object({
    recommended: z.number(),
    rationale: z.string(),
  }),
  expected_outcomes: z.array(z.object({
    scenario: z.string(),
    interpretation: z.string(),
    nextStep: z.string(),
  })),
  references: z.array(z.string()),
});

const DESIGN_TOOL = createToolFromSchema(
  "design_experiment",
  "Design a biomedical experiment based on the research context. Return a complete experimental design.",
  ExperimentDesignSchema,
);

export async function designExperiment(
  params: {
    hypothesis: string;
    matrixSummary: string;
    existingExperiments: string[];
    gapOrConflict?: string;
  },
  onToken?: (event: SSEEvent) => void,
): Promise<ExperimentDesign> {
  return withLLMRetry(async () => {
    const client = getLLMClient();
    const context = `假设: ${params.hypothesis}\n\n机制矩阵摘要: ${params.matrixSummary}\n\n已完成实验: ${params.existingExperiments.join("; ")}${params.gapOrConflict ? `\n\n触发原因: ${params.gapOrConflict}` : ""}`;

    const userMessage = `Design an experiment based on this context:\n\n${context}`;

    const systemPrompt = `You are an expert biomedical researcher designing experiments.
Rules:
- Include vehicle, positive, and negative controls; flag any missing
- Specify exact reagent names, concentrations, and suppliers
- Define timing for each step; cite literature as rationale
- Recommend sample size with statistical justification
- Predict 2-3 expected outcomes with interpretations and next steps

EXAMPLE:
Input: Hypothesis: "Drug X inhibits NF-κB signaling in macrophages"
Output: {"name":"NF-κB inhibition by Drug X in RAW264.7","hypothesis":"...","rationale":"...","variables":{"independent":["Drug X concentration"],"dependent":["NF-κB p65 nuclear translocation","TNF-α secretion"],"controlled":["cell density","passage number","LPS stimulation time"]},"groups":[{"name":"Vehicle","description":"DMSO 0.1%","purpose":"negative control"},{"name":"LPS only","description":"LPS 100ng/mL","purpose":"positive control"},{"name":"Drug X + LPS","description":"Drug X 10μM + LPS","purpose":"treatment"}],"protocol":{"cellLine":"RAW264.7","passage":"<15","reagents":[{"name":"LPS","concentration":"100 ng/mL","source":"Sigma L2630"},{"name":"Drug X","concentration":"10 μM","source":"MedChemExpress HY-12345"}],"steps":[{"day":"Day 0","action":"Seed cells","details":"1×10⁵/well in 24-well plate"},{"day":"Day 1","action":"Treat","details":"Add Drug X or DMSO, incubate 1h, then LPS 6h"}],"readouts":["Western blot p65","ELISA TNF-α"],"duration":"2 days"},"controls_check":{"has_vehicle":true,"has_positive":true,"has_negative":false,"missing":["untreated (no LPS, no DMSO)"],"suggestions":["Add naive control: cells with media only"]},"sample_size":{"recommended":3,"rationale":"3 biological replicates × 3 technical replicates"},"expected_outcomes":[{"scenario":"Drug X reduces p65 nuclear translocation by >50%","interpretation":"Confirms NF-κB pathway inhibition","nextStep":"Dose-response curve (0.1-100 μM)"}],"references":["Author et al., Journal, Year"]}`;

    const llmParams = {
      model: MODELS.analysis,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user" as const, content: userMessage }],
      tools: [DESIGN_TOOL],
      tool_choice: { type: "tool" as const, name: "design_experiment" },
    };

    let design: ExperimentDesign;

    if (onToken) {
      // 真流式：逐 token 发送
      const { toolUseBlocks, usage } = await streamLLMWithToolUse(client, llmParams, onToken);
      trackTokenUsage({
        feature: "design",
        model: MODELS.analysis,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
      });
      const toolResult = toolUseBlocks.find((t) => t.name === "design_experiment");
      if (toolResult) {
        design = ExperimentDesignSchema.parse(toolResult.input);
      } else {
        throw new Error("No tool_use block in streaming response");
      }
    } else {
      // 阻塞式
      const response = await client.messages.create(llmParams);
      design = await extractStructuredOutput(response, ExperimentDesignSchema, {
        label: "experiment-design",
        retryFn: createRetryFunction(client, {
          model: MODELS.analysis,
          maxTokens: 8192,
          system: "You are an expert biomedical researcher designing experiments.",
          userMessage,
          originalContent: userMessage,
        }),
      });
    }

    // 基于 power analysis 增强样本量推荐
    try {
      const powerResult = calculateSampleSize({
        effectSize: 0.5, // 中等效应量（Cohen's d），生物医学实验常用默认值
        alpha: 0.05,
        power: 0.80,
      });
      design.sample_size.recommended = powerResult.totalSampleSize;
      design.sample_size.rationale =
        `${design.sample_size.rationale}\n\n${powerResult.rationale}`;
    } catch {
      // power analysis 失败时不覆盖 LLM 原始推荐
    }

    return design;
  }, { label: "experiment-design" });
}
