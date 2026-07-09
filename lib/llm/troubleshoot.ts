/**
 * 实验排障诊断引擎
 */

import { getLLMClient, MODELS } from "./client";

export interface TroubleshootResult {
  severity: "critical" | "moderate" | "minor";
  likely_causes: Array<{
    cause: string;
    likelihood: "high" | "medium" | "low";
    explanation: string;
    evidence: string | null;
  }>;
  troubleshooting_steps: Array<{
    step: string;
    what_to_look_for: string;
    if_positive: string;
    if_negative: string;
  }>;
  quick_fix: {
    description: string;
    new_parameters: Record<string, string>;
    risks: string | null;
  } | null;
  references: string[];
}

const TROUBLESHOOT_TOOL = {
  name: "troubleshoot_experiment",
  description: "Diagnose why an experiment failed and provide troubleshooting steps",
  input_schema: {
    type: "object" as const,
    properties: {
      severity: { type: "string" as const, enum: ["critical", "moderate", "minor"] },
      likely_causes: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            cause: { type: "string" as const },
            likelihood: { type: "string" as const, enum: ["high", "medium", "low"] },
            explanation: { type: "string" as const },
            evidence: { type: ["string" as const, "null" as const] },
          },
          required: ["cause", "likelihood", "explanation", "evidence"],
        },
      },
      troubleshooting_steps: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            step: { type: "string" as const },
            what_to_look_for: { type: "string" as const },
            if_positive: { type: "string" as const },
            if_negative: { type: "string" as const },
          },
          required: ["step", "what_to_look_for", "if_positive", "if_negative"],
        },
      },
      quick_fix: {
        type: ["object" as const, "null" as const],
        properties: {
          description: { type: "string" as const },
          new_parameters: { type: "object" as const },
          risks: { type: ["string" as const, "null" as const] },
        },
        required: ["description", "new_parameters", "risks"],
      },
      references: { type: "array" as const, items: { type: "string" as const } },
    },
    required: ["severity", "likely_causes", "troubleshooting_steps", "quick_fix", "references"],
  },
};

export async function troubleshootExperiment(params: {
  experiment: { name: string; drug: string; concentration: string; cellLine: string; passage?: string; duration: string; readouts: string[] };
  failure: { phenomenon: string; details?: string };
  literatureContext?: string;
}): Promise<TroubleshootResult> {
  const client = getLLMClient();
  const context = `实验: ${params.experiment.name} | ${params.experiment.drug} ${params.experiment.concentration} | ${params.experiment.cellLine} | ${params.experiment.duration} | 检测: ${params.experiment.readouts.join("、")}\n\n失败: ${params.failure.phenomenon}${params.failure.details ? `\n细节: ${params.failure.details}` : ""}${params.literatureContext ? `\n\n文献: ${params.literatureContext}` : ""}`;

  const response = await client.messages.create({
    model: MODELS.analysis,
    max_tokens: 4096,
    system: "You are an expert biomedical researcher specializing in experiment troubleshooting. Consider ALL possible causes ranked by likelihood, provide actionable troubleshooting steps with clear next steps for both positive and negative outcomes, and suggest quick fixes when available.",
    tools: [TROUBLESHOOT_TOOL as any],
    tool_choice: { type: "tool", name: "troubleshoot_experiment" },
    messages: [{ role: "user", content: `Diagnose this experiment failure:\n\n${context}` }],
  });

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "troubleshoot_experiment") {
      return block.input as TroubleshootResult;
    }
  }
  throw new Error("Failed to generate diagnosis");
}
