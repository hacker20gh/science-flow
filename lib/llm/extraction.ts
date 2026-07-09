/**
 * LLM 文献信息提取
 *
 * 从论文摘要或全文中提取结构化的机制信息
 * 支持单篇提取和批量提取
 */

import { z } from "zod";
import { getLLMClient, MODELS } from "./client";

// ===== Zod Schema =====

export const ExperimentSchema = z.object({
  drug_intervention: z.object({
    name: z.string().describe("药物或干预名称，如 sorafenib"),
    concentration: z.string().nullable().describe("浓度，如 2 μM"),
    duration: z.string().nullable().describe("处理时间，如 24h"),
    co_treatment: z.string().nullable().describe("联合处理，如 with anti-PD-1"),
  }),
  model: z.object({
    cell_line: z.string().nullable().describe("细胞系，如 Huh7"),
    species: z.string().nullable().describe("物种，如 Human"),
    passage: z.string().nullable().describe("传代范围，如 P5-P10"),
  }),
  pathway_effects: z.array(
    z.object({
      pathway: z.string().describe("信号通路名称，如 NF-κB"),
      direction: z.enum(["up", "down", "no_change"]).describe("变化方向"),
      significance: z.string().nullable().describe("显著性，如 p<0.05"),
      method: z.string().nullable().describe("检测方法，如 Western blot"),
    })
  ),
  phenotype_effects: z.array(
    z.object({
      phenotype: z.string().describe("表型，如 PD-L1 expression"),
      direction: z.enum(["up", "down", "no_change"]).describe("变化方向"),
      fold_change: z.string().nullable().describe("变化倍数，如 2.3x"),
    })
  ),
  controls: z.array(z.string()).describe("对照组列表，如 DMSO vehicle"),
  statistical_test: z.string().nullable().describe("统计方法"),
  sample_size: z.number().nullable().describe("样本量 n"),
  conclusion: z.string().describe("该实验的一句话结论"),
  evidence_quote: z.string().describe("支持该结论的原文片段"),
});

export const ExtractionResultSchema = z.object({
  experiments: z.array(ExperimentSchema),
});

export type ExperimentResult = z.infer<typeof ExperimentSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// ===== Prompt =====

const CORE_PROMPT = `You are a biomedical literature analysis expert extracting experimental findings.

IMPORTANT RULES:
1. A single paper may contain MULTIPLE independent experiments.
   Each experiment is defined by a unique combination of drug, concentration, duration, and cell line.
   For EACH distinct experiment, extract a separate entry.
2. Only extract findings EXPLICITLY stated in the paper. Do NOT infer or hallucinate.
3. If information is not available, use null.
4. For each finding, include the EXACT quote from the text as evidence.
5. If the paper reports no significant change for a measurement, report it as "no_change".
6. Be precise about quantitative values: exact concentrations, exact fold changes, exact p-values.

For EACH experiment, extract:
- drug_intervention: name, concentration, duration, co_treatment
- model: cell_line, species, passage
- pathway_effects: for each pathway measured, direction and significance
- phenotype_effects: for each phenotype measured, direction and fold change
- controls: list of control conditions used
- statistical_test: statistical method used
- sample_size: number of biological replicates (n)
- conclusion: one-sentence summary for this specific experiment
- evidence_quote: exact quote from the text supporting the conclusion`;

// ===== 单篇提取 =====

export async function extractFromText(
  text: string,
  title: string,
  options?: { maxTokens?: number }
): Promise<ExtractionResult> {
  const client = getLLMClient();
  const maxTokens = options?.maxTokens || 8192;

  const response = await client.chat.completions.parse({
    model: MODELS.extraction,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: CORE_PROMPT },
      {
        role: "user",
        content: `Extract all experimental findings from this paper:\n\nTitle: ${title}\n\nContent:\n${text}`,
      },
    ],
    response_format: zodResponseFormat(ExtractionResultSchema, "extraction"),
  });

  const parsed = response.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new Error("Failed to parse extraction result");
  }

  return parsed;
}

// ===== 批量提取 =====

interface PaperForExtraction {
  title: string;
  text: string; // 摘要或全文
  paperId: string;
}

interface ExtractionProgress {
  total: number;
  completed: number;
  current: string; // 正在处理的论文标题
  errors: Array<{ paperId: string; error: string }>;
}

export async function batchExtract(
  papers: PaperForExtraction[],
  onProgress?: (progress: ExtractionProgress) => void
): Promise<Map<string, ExtractionResult>> {
  const results = new Map<string, ExtractionResult>();
  const errors: Array<{ paperId: string; error: string }> = [];
  let completed = 0;

  // 并发控制：3 个并发 worker
  const concurrency = 3;
  const queue = [...papers];

  async function worker() {
    while (queue.length > 0) {
      const paper = queue.shift()!;
      onProgress?.({
        total: papers.length,
        completed,
        current: paper.title,
        errors,
      });

      try {
        const result = await extractFromText(paper.text, paper.title);
        results.set(paper.paperId, result);
      } catch (error) {
        errors.push({
          paperId: paper.paperId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }

      completed++;
      onProgress?.({
        total: papers.length,
        completed,
        current: "",
        errors,
      });

      // 速率控制：避免打爆 CCS
      await sleep(500);
    }
  }

  await Promise.all(
    Array.from({ length: concurrency }, () => worker())
  );

  return results;
}

// ===== 辅助 =====

import { zodResponseFormat } from "openai/helpers/zod";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
