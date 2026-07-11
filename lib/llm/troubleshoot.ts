/**
 * 实验排障诊断引擎
 */

import { z } from "zod";
import { getLLMClient, MODELS, withLLMRetry, getIsRetryMode } from "./client";
import { extractStructuredOutput, createRetryFunction, createToolFromSchema } from "./json-extractor";
import { streamLLMWithToolUse, type SSEEvent } from "./streaming";
import { trackTokenUsage } from "@/lib/token-tracker";

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

const TROUBLESHOOT_TOOL = createToolFromSchema(
  "diagnose_experiment",
  "Diagnose an experiment failure. Return severity, likely causes ranked by likelihood, troubleshooting steps with branching outcomes, and optional quick fix.",
  TroubleshootResultSchema,
);

export async function troubleshootExperiment(
  params: {
    experiment: { name: string; drug: string; concentration: string; cellLine: string; passage?: string; duration: string; readouts: string[] };
    failure: { phenomenon: string; details?: string };
    literatureContext?: string;
  },
  onToken?: (event: SSEEvent) => void,
): Promise<TroubleshootResult> {
  return withLLMRetry(async () => {
    const client = getLLMClient();
    const context = `实验: ${params.experiment.name} | ${params.experiment.drug} ${params.experiment.concentration} | ${params.experiment.cellLine} | ${params.experiment.duration} | 检测: ${params.experiment.readouts.join("、")}\n\n失败: ${params.failure.phenomenon}${params.failure.details ? `\n细节: ${params.failure.details}` : ""}${params.literatureContext ? `\n\n文献: ${params.literatureContext}` : ""}`;

    const userMessage = `Diagnose this experiment failure:\n\n${context}`;
    const systemPrompt = `You are an expert biomedical researcher specializing in experiment troubleshooting.
Rules:
- Rank ALL possible causes by likelihood (high/medium/low)
- Each cause needs a mechanistic explanation and supporting evidence
- Provide decision-tree steps: each step has a test, positive branch, and negative branch
- Suggest quick fixes with new parameters and risk assessment
- Assign severity: critical (data unusable), moderate (needs repeat), minor (cosmetic)
- Cite troubleshooting literature

EXAMPLE:
Input: MTT assay on HeLa cells, cisplatin 50μM, 48h, viability unexpectedly 110% in treated wells
Output: {"severity":"moderate","likely_causes":[{"cause":"Background interference from cisplatin","likelihood":"high","explanation":"Cisplatin absorbs at 570nm, same as MTT formazan","evidence":"Cisplatin has d-d electronic transitions in visible range"}],"troubleshooting_steps":[{"step":"Run cell-free MTT with cisplatin alone","what_to_look_for":"Absorbance >0.2 at 570nm","if_positive":"Confirm interference, switch to CellTiter-Glo","if_negative":"Interference not the cause, check cell contamination"}],"quick_fix":{"description":"Switch to luminescence-based viability assay","new_parameters":{"assay":"CellTiter-Glo","dilution":"1:5","incubation":"30 min"},"risks":"CellTiter-Glo measures ATP, not metabolic activity"},"references":["Manufacturer interference guide"]}`;

    const llmParams = {
      model: MODELS.analysis,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user" as const, content: userMessage }],
      tools: [TROUBLESHOOT_TOOL],
      tool_choice: { type: "tool" as const, name: "diagnose_experiment" },
    };

    let result: TroubleshootResult;

    if (onToken) {
      // 真流式：逐 token 发送
      const streamStart = Date.now();
      const { toolUseBlocks, usage } = await streamLLMWithToolUse(client, llmParams, onToken);
      trackTokenUsage({
        feature: "troubleshoot",
        model: MODELS.analysis,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
        durationMs: Date.now() - streamStart,
        isRetry: getIsRetryMode(),
      });
      const toolResult = toolUseBlocks.find((t) => t.name === "diagnose_experiment");
      if (toolResult) {
        result = TroubleshootResultSchema.parse(toolResult.input);
      } else {
        throw new Error("No tool_use block in streaming response");
      }
    } else {
      // 阻塞式
      const response = await client.messages.create(llmParams);
      result = await extractStructuredOutput(response, TroubleshootResultSchema, {
        label: "troubleshoot",
        retryFn: createRetryFunction(client, {
          model: MODELS.analysis,
          maxTokens: 4096,
          system: "You are an expert biomedical researcher specializing in experiment troubleshooting. Consider ALL possible causes ranked by likelihood, provide actionable troubleshooting steps, and suggest quick fixes when available.",
          userMessage,
          originalContent: userMessage,
          schema: TroubleshootResultSchema,
        }),
      });
    }

    return result;
  }, { label: "troubleshoot" });
}
