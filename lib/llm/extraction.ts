/**
 * LLM 文献信息提取
 *
 * 通过 CCS 调用 Anthropic Messages API + tool_use
 * 强制 Claude 输出符合 Zod Schema 的结构化 JSON
 */

import { z } from "zod";
import { getLLMClient, MODELS } from "./client";

// ===== Zod Schema =====

export const ExperimentSchema = z.object({
  drug_intervention: z.object({
    name: z.string().describe("药物或干预名称"),
    concentration: z.string().nullable().describe("浓度，如 2 μM"),
    duration: z.string().nullable().describe("处理时间，如 24h"),
    co_treatment: z.string().nullable().describe("联合处理"),
  }),
  model: z.object({
    cell_line: z.string().nullable().describe("细胞系"),
    species: z.string().nullable().describe("物种"),
    passage: z.string().nullable().describe("传代范围"),
  }),
  pathway_effects: z.array(z.object({
    pathway: z.string(),
    direction: z.enum(["up", "down", "no_change"]),
    significance: z.string().nullable(),
    method: z.string().nullable(),
  })),
  phenotype_effects: z.array(z.object({
    phenotype: z.string(),
    direction: z.enum(["up", "down", "no_change"]),
    fold_change: z.string().nullable(),
  })),
  controls: z.array(z.string()),
  statistical_test: z.string().nullable(),
  sample_size: z.number().nullable(),
  conclusion: z.string(),
  evidence_quote: z.string(),
});

export const ExtractionResultSchema = z.object({
  experiments: z.array(ExperimentSchema),
});

export type ExperimentResult = z.infer<typeof ExperimentSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

// ===== Tool 定义 =====

const EXTRACTION_TOOL = {
  name: "extract_experiments",
  description: "Extract structured experimental findings from a biomedical paper. Return one JSON object with an 'experiments' array.",
  input_schema: {
    type: "object" as const,
    properties: {
      experiments: {
        type: "array" as const,
        description: "Array of experiment entries extracted from the paper",
        items: {
          type: "object" as const,
          properties: {
            drug_intervention: {
              type: "object" as const,
              properties: {
                name: { type: "string" as const, description: "Drug name" },
                concentration: { type: ["string" as const, "null" as const], description: "e.g. 2 μM" },
                duration: { type: ["string" as const, "null" as const], description: "e.g. 24h" },
                co_treatment: { type: ["string" as const, "null" as const] },
              },
              required: ["name", "concentration", "duration", "co_treatment"],
            },
            model: {
              type: "object" as const,
              properties: {
                cell_line: { type: ["string" as const, "null" as const] },
                species: { type: ["string" as const, "null" as const] },
                passage: { type: ["string" as const, "null" as const] },
              },
              required: ["cell_line", "species", "passage"],
            },
            pathway_effects: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  pathway: { type: "string" as const },
                  direction: { type: "string" as const, enum: ["up", "down", "no_change"] },
                  significance: { type: ["string" as const, "null" as const] },
                  method: { type: ["string" as const, "null" as const] },
                },
                required: ["pathway", "direction", "significance", "method"],
              },
            },
            phenotype_effects: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  phenotype: { type: "string" as const },
                  direction: { type: "string" as const, enum: ["up", "down", "no_change"] },
                  fold_change: { type: ["string" as const, "null" as const] },
                },
                required: ["phenotype", "direction", "fold_change"],
              },
            },
            controls: { type: "array" as const, items: { type: "string" as const } },
            statistical_test: { type: ["string" as const, "null" as const] },
            sample_size: { type: ["number" as const, "null" as const] },
            conclusion: { type: "string" as const },
            evidence_quote: { type: "string" as const },
          },
          required: ["drug_intervention", "model", "pathway_effects", "phenotype_effects", "controls", "conclusion", "evidence_quote"],
        },
      },
    },
    required: ["experiments"],
  },
};

// ===== Prompt =====

const CORE_PROMPT = `You are a biomedical literature analysis expert extracting experimental findings.

IMPORTANT RULES:
1. A single paper may contain MULTIPLE independent experiments. Extract each as a separate entry.
2. Only extract findings EXPLICITLY stated in the paper. Do NOT infer or hallucinate.
3. If information is not available, use null.
4. For each finding, include the EXACT quote from the text as evidence.
5. Be precise about quantitative values.`;

// ===== 提取函数 =====

export async function extractFromText(
  text: string,
  title: string,
  options?: { maxTokens?: number }
): Promise<ExtractionResult> {
  const client = getLLMClient();
  const maxTokens = options?.maxTokens || 8192;

  const response = await client.messages.create({
    model: MODELS.extraction,
    max_tokens: maxTokens,
    system: CORE_PROMPT,
    tools: [EXTRACTION_TOOL as any],
    tool_choice: { type: "tool", name: "extract_experiments" },
    messages: [
      {
        role: "user",
        content: `Extract all experimental findings from this paper:\n\nTitle: ${title}\n\nContent:\n${text}`,
      },
    ],
  });

  // 从 tool_use 块中提取结果
  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "extract_experiments") {
      const data = ExtractionResultSchema.parse(block.input);
      return data;
    }
  }

  throw new Error("No extraction result found in response");
}

// ===== 批量提取 =====

interface PaperForExtraction {
  title: string;
  text: string;
  paperId: string;
}

export async function batchExtract(
  papers: PaperForExtraction[],
  onProgress?: (progress: { total: number; completed: number; current: string }) => void
): Promise<Map<string, ExtractionResult>> {
  const results = new Map<string, ExtractionResult>();
  let completed = 0;

  const concurrency = 3;
  const queue = [...papers];

  async function worker() {
    while (queue.length > 0) {
      const paper = queue.shift()!;
      onProgress?.({ total: papers.length, completed, current: paper.title });

      try {
        const result = await extractFromText(paper.text, paper.title);
        results.set(paper.paperId, result);
      } catch (error) {
        console.error(`Failed to extract ${paper.title}:`, error);
      }

      completed++;
      await sleep(500);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
