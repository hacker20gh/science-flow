/**
 * 实验排障诊断引擎
 *
 * 用户描述实验失败的现象 → AI 分析可能原因 → 给出排查建议
 */

import { z } from "zod";
import { getLLMClient, MODELS } from "./client";
import { zodResponseFormat } from "openai/helpers/zod";

// ===== Schema =====

export const TroubleshootSchema = z.object({
  severity: z.enum(["critical", "moderate", "minor"]).describe("问题严重程度"),
  likely_causes: z.array(
    z.object({
      cause: z.string().describe("可能的原因"),
      likelihood: z.enum(["high", "medium", "low"]),
      explanation: z.string().describe("为什么这个原因可能导致当前现象"),
      evidence: z.string().nullable().describe("来自文献或常见知识的证据"),
    })
  ).describe("可能的原因，按可能性排序"),
  troubleshooting_steps: z.array(
    z.object({
      step: z.string().describe("排查步骤"),
      what_to_look_for: z.string().describe("预期看到什么"),
      if_positive: z.string().describe("如果确认了这个原因，下一步怎么做"),
      if_negative: z.string().describe("如果排除了这个原因，下一步怎么做"),
    })
  ).describe("逐步排查方案"),
  quick_fix: z.object({
    description: z.string().describe("快速修复方案"),
    new_parameters: z.record(z.string(), z.string()).describe("新的实验参数"),
    risks: z.string().nullable().describe("快速修复的风险"),
  }).nullable().describe("如果有明确的快速修复方案"),
  references: z.array(z.string()).describe("相关参考文献或方法"),
});

export type TroubleshootResult = z.infer<typeof TroubleshootSchema>;

// ===== Prompt =====

const TROUBLESHOOT_PROMPT = `You are an expert biomedical researcher specializing in experiment troubleshooting.

A researcher's experiment has failed. Analyze the failure and provide a systematic diagnosis.

Guidelines:
1. Consider ALL possible causes, ranked by likelihood
2. For each cause, explain the mechanism (WHY it happened)
3. Reference known failure modes from literature when applicable
4. Provide actionable troubleshooting steps (not vague advice)
5. If a quick fix is available, suggest it with specific parameters
6. Consider the specific reagents, cell lines, and conditions mentioned

Common failure modes to consider:
- Cytotoxicity (drug concentration too high)
- Cell passage effects (high passage = altered phenotype)
- Reagent degradation (old antibodies, expired drugs)
- Contamination (mycoplasma, bacterial)
- Technical errors (pipetting, timing, temperature)
- Biological variability (cell line drift)
- Missing controls
- Wrong detection method sensitivity`;

// ===== 排障函数 =====

export async function troubleshootExperiment(params: {
  experiment: {
    name: string;
    drug: string;
    concentration: string;
    cellLine: string;
    passage?: string;
    duration: string;
    readouts: string[];
  };
  failure: {
    phenomenon: string;
    details?: string;
  };
  literatureContext?: string;
}): Promise<TroubleshootResult> {
  const client = getLLMClient();

  const context = `## 实验信息
- 名称：${params.experiment.name}
- 药物：${params.experiment.drug} ${params.experiment.concentration}
- 细胞系：${params.experiment.cellLine}
${params.experiment.passage ? `- 传代数：${params.experiment.passage}` : ""}
- 处理时间：${params.experiment.duration}
- 检测指标：${params.experiment.readouts.join("、")}

## 失败现象
- 表现：${params.failure.phenomenon}
${params.failure.details ? `- 细节：${params.failure.details}` : ""}

${params.literatureContext ? `## 文献参考\n${params.literatureContext}` : ""}`;

  const response = await client.chat.completions.parse({
    model: MODELS.analysis,
    max_tokens: 4096,
    messages: [
      { role: "system", content: TROUBLESHOOT_PROMPT },
      { role: "user", content: `Diagnose this experiment failure:\n\n${context}` },
    ],
    response_format: zodResponseFormat(TroubleshootSchema, "troubleshoot"),
  });

  const parsed = response.choices[0]?.message?.parsed;
  if (!parsed) throw new Error("Failed to generate diagnosis");

  return parsed;
}
