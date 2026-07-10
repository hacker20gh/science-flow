/**
 * 实验设计 LLM 引擎
 */

import { z } from "zod";
import { getLLMClient, MODELS, withLLMRetry } from "./client";
import { calculateSampleSize } from "@/lib/power-analysis";
import { extractStructuredOutput, createRetryFunction } from "./json-extractor";

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

const DESIGN_TOOL = {
  name: "design_experiment",
  description: "Design a biomedical experiment based on the research context. Return a complete experimental design.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: { type: "string" as const },
      hypothesis: { type: "string" as const },
      rationale: { type: "string" as const },
      variables: {
        type: "object" as const,
        properties: {
          independent: { type: "array" as const, items: { type: "string" as const } },
          dependent: { type: "array" as const, items: { type: "string" as const } },
          controlled: { type: "array" as const, items: { type: "string" as const } },
        },
        required: ["independent", "dependent", "controlled"],
      },
      groups: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            name: { type: "string" as const },
            description: { type: "string" as const },
            purpose: { type: "string" as const },
          },
          required: ["name", "description", "purpose"],
        },
      },
      protocol: {
        type: "object" as const,
        properties: {
          cellLine: { type: "string" as const },
          passage: { type: ["string" as const, "null" as const] },
          reagents: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                name: { type: "string" as const },
                concentration: { type: "string" as const },
                source: { type: ["string" as const, "null" as const] },
              },
              required: ["name", "concentration", "source"],
            },
          },
          steps: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                day: { type: "string" as const },
                action: { type: "string" as const },
                details: { type: "string" as const },
              },
              required: ["day", "action", "details"],
            },
          },
          readouts: { type: "array" as const, items: { type: "string" as const } },
          duration: { type: "string" as const },
        },
        required: ["cellLine", "steps", "readouts", "duration"],
      },
      controls_check: {
        type: "object" as const,
        properties: {
          has_vehicle: { type: "boolean" as const },
          has_positive: { type: "boolean" as const },
          has_negative: { type: "boolean" as const },
          missing: { type: "array" as const, items: { type: "string" as const } },
          suggestions: { type: "array" as const, items: { type: "string" as const } },
        },
        required: ["has_vehicle", "has_positive", "has_negative", "missing", "suggestions"],
      },
      sample_size: {
        type: "object" as const,
        properties: {
          recommended: { type: "number" as const },
          rationale: { type: "string" as const },
        },
        required: ["recommended", "rationale"],
      },
      expected_outcomes: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            scenario: { type: "string" as const },
            interpretation: { type: "string" as const },
            nextStep: { type: "string" as const },
          },
          required: ["scenario", "interpretation", "nextStep"],
        },
      },
      references: { type: "array" as const, items: { type: "string" as const } },
    },
    required: ["name", "hypothesis", "rationale", "variables", "groups", "protocol", "controls_check", "sample_size", "expected_outcomes", "references"],
  },
};

export async function designExperiment(params: {
  hypothesis: string;
  matrixSummary: string;
  existingExperiments: string[];
  gapOrConflict?: string;
}): Promise<ExperimentDesign> {
  return withLLMRetry(async () => {
    const client = getLLMClient();
    const context = `假设: ${params.hypothesis}\n\n机制矩阵摘要: ${params.matrixSummary}\n\n已完成实验: ${params.existingExperiments.join("; ")}${params.gapOrConflict ? `\n\n触发原因: ${params.gapOrConflict}` : ""}`;

    const userMessage = `Design an experiment based on this context:\n\n${context}`;

    const systemPrompt = "You are an expert biomedical researcher designing experiments. Design a rigorous experiment with proper controls, adequate sample size, and clear expected outcomes. Be specific about reagents, cell lines, concentrations, and timing. Cite specific papers as rationale.\n\nCRITICAL: You MUST return ONLY a JSON object with this exact structure:\n{\"name\":\"string\",\"hypothesis\":\"string\",\"rationale\":\"string\",\"variables\":{\"independent\":[\"string\"],\"dependent\":[\"string\"],\"controlled\":[\"string\"]},\"groups\":[{\"name\":\"string\",\"description\":\"string\",\"purpose\":\"string\"}],\"protocol\":{\"cellLine\":\"string\",\"passage\":\"string or null\",\"reagents\":[{\"name\":\"string\",\"concentration\":\"string\",\"source\":\"string or null\"}],\"steps\":[{\"day\":\"string\",\"action\":\"string\",\"details\":\"string\"}],\"readouts\":[\"string\"],\"duration\":\"string\"},\"controls_check\":{\"has_vehicle\":true,\"has_positive\":true,\"has_negative\":true,\"missing\":[\"string\"],\"suggestions\":[\"string\"]},\"sample_size\":{\"recommended\":20,\"rationale\":\"string\"},\"expected_outcomes\":[{\"scenario\":\"string\",\"interpretation\":\"string\",\"nextStep\":\"string\"}],\"references\":[\"string\"]}\nDo NOT wrap in markdown code blocks.";

    const response = await client.messages.create({
      model: MODELS.analysis,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    const design = await extractStructuredOutput(response, ExperimentDesignSchema, {
      label: "experiment-design",
      retryFn: createRetryFunction(client, {
        model: MODELS.analysis,
        maxTokens: 8192,
        system: "You are an expert biomedical researcher designing experiments. Design a rigorous experiment with proper controls, adequate sample size, and clear expected outcomes. Be specific about reagents, cell lines, concentrations, and timing. Cite specific papers as rationale.",
        userMessage,
        originalContent: userMessage,
      }),
    });

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
