/**
 * 实验排障诊断引擎
 */

import { z } from "zod";
import { getLLMClient, MODELS, withLLMRetry } from "./client";
import { extractStructuredOutput, createRetryFunction } from "./json-extractor";

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

const TroubleshootResultSchema = z.object({
  severity: z.enum(["critical", "moderate", "minor"]),
  likely_causes: z.array(z.object({
    cause: z.string(),
    likelihood: z.enum(["high", "medium", "low"]),
    explanation: z.string(),
    evidence: z.string().nullable(),
  })),
  troubleshooting_steps: z.array(z.object({
    step: z.string(),
    what_to_look_for: z.string(),
    if_positive: z.string(),
    if_negative: z.string(),
  })),
  quick_fix: z.object({
    description: z.string(),
    new_parameters: z.record(z.string(), z.string()),
    risks: z.string().nullable(),
  }).nullable(),
  references: z.array(z.string()),
});

const TROUBLESHOOT_SYSTEM_SUFFIX = `\n\nCRITICAL: You MUST return ONLY a valid JSON object. No thinking, no explanation, no markdown code blocks. The JSON MUST have this exact structure:\n{"severity":"critical|moderate|minor","likely_causes":[{"cause":"string","likelihood":"high|medium|low","explanation":"string","evidence":"string or null"}],"troubleshooting_steps":[{"step":"string","what_to_look_for":"string","if_positive":"string","if_negative":"string"}],"quick_fix":{"description":"string","new_parameters":"string","risks":"string"} or null,"references":["string"]}`;

export async function troubleshootExperiment(params: {
  experiment: { name: string; drug: string; concentration: string; cellLine: string; passage?: string; duration: string; readouts: string[] };
  failure: { phenomenon: string; details?: string };
  literatureContext?: string;
}): Promise<TroubleshootResult> {
  return withLLMRetry(async () => {
    const client = getLLMClient();
    const context = `实验: ${params.experiment.name} | ${params.experiment.drug} ${params.experiment.concentration} | ${params.experiment.cellLine} | ${params.experiment.duration} | 检测: ${params.experiment.readouts.join("、")}\n\n失败: ${params.failure.phenomenon}${params.failure.details ? `\n细节: ${params.failure.details}` : ""}${params.literatureContext ? `\n\n文献: ${params.literatureContext}` : ""}`;

    const userMessage = `Diagnose this experiment failure:\n\n${context}`;
    const systemPrompt = `You are an expert biomedical researcher specializing in experiment troubleshooting. Consider ALL possible causes ranked by likelihood, provide actionable troubleshooting steps with clear next steps for both positive and negative outcomes, and suggest quick fixes when available.${TROUBLESHOOT_SYSTEM_SUFFIX}`;

    const response = await client.messages.create({
      model: MODELS.analysis,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    return await extractStructuredOutput(response, TroubleshootResultSchema, {
      label: "troubleshoot",
      retryFn: createRetryFunction(client, {
        model: MODELS.analysis,
        maxTokens: 4096,
        system: systemPrompt,
        userMessage,
        originalContent: userMessage,
        schema: TroubleshootResultSchema,
      }),
    });
  }, { label: "troubleshoot" });
}
