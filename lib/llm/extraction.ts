/**
 * LLM 文献信息提取
 *
 * 通过 CCS 调用 Anthropic Messages API + tool_use
 * 强制 Claude 输出符合 Zod Schema 的结构化 JSON
 */

import { z } from "zod";
import { getLLMClient, MODELS, withLLMRetry } from "./client";
import { extractStructuredOutput, createRetryFunction } from "./json-extractor";

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
  confidence: z.number().min(0).max(1).optional(),
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
5. Be precise about quantitative values.
6. Use CANONICAL pathway names: NF-κB (not NF-kB or NF-kappaB), PI3K/AKT, MAPK/ERK, JAK/STAT, mTOR, Wnt, Notch, TGF-β, p53, HIF-1α, AMPK. For PD-L1 immune checkpoint, use "PD-1/PD-L1" or "PD-L1".
7. Use CANONICAL phenotype names: Apoptosis (not cell apoptosis), Cell Viability (not cell survival), Cell Proliferation (not cell growth), Cell Migration (not cell motility), Metastasis, Drug Resistance.
8. For pathway_effects[].method, use the experimental technique (e.g., "Western blot", "qPCR", "flow cytometry", "luciferase reporter assay"), NOT the statistical method.
9. For each experiment, assess your extraction confidence (0-1):
   1.0 = explicitly stated in text, 0.8 = strongly implied, 0.5 = inferred from context, 0.3 = uncertain.
   Include this as "confidence" in your output.`;

// ===== 智能截断 =====

const MAX_CHARS = 15000;

/**
 * 智能截断论文文本
 *
 * 优先保留关键章节：Abstract + Methods + Results
 * 如果无法识别结构，回退到前 15000 字符
 */
export function smartTruncate(text: string): string {
  if (text.length <= MAX_CHARS) return text;

  const sections = extractSections(text);

  if (sections.length === 0) {
    return text.slice(0, MAX_CHARS);
  }

  // 按优先级组装：Abstract 全保留 > Methods > Results > Introduction/Discussion
  const priority = ["abstract", "introduction", "methods", "results", "discussion"];
  let result = "";
  let remaining = MAX_CHARS;

  for (const sectionName of priority) {
    const section = sections.find((s) => s.name === sectionName);
    if (!section) continue;

    const allocation =
      sectionName === "abstract"
        ? Math.min(section.text.length, remaining)
        : sectionName === "methods" || sectionName === "results"
          ? Math.min(section.text.length, Math.floor(remaining * 0.4))
          : Math.min(section.text.length, Math.floor(remaining * 0.2));

    if (allocation <= 0) break;

    result += `\n\n=== ${section.label} ===\n${section.text.slice(0, allocation)}`;
    remaining -= allocation;
  }

  return result.trim() || text.slice(0, MAX_CHARS);
}

interface SectionInfo {
  name: string;
  label: string;
  text: string;
}

function extractSections(text: string): SectionInfo[] {
  const sections: SectionInfo[] = [];

  const patterns: Array<{ name: string; label: string; regex: RegExp }> = [
    { name: "abstract", label: "Abstract", regex: /(?:^|\n)\s*(?:ABSTRACT|Abstract)\s*[\n:]/ },
    { name: "introduction", label: "Introduction", regex: /(?:^|\n)\s*(?:INTRODUCTION|Introduction|1\.?\s+Introduction)\s*[\n:]/ },
    { name: "methods", label: "Methods", regex: /(?:^|\n)\s*(?:METHODS?|MATERIALS?\s+AND\s+METHODS?|METHODOLOGY|EXPERIMENTAL(?:\s+SECTION)?|2\.?\s+Methods?)\s*[\n:]/i },
    { name: "results", label: "Results", regex: /(?:^|\n)\s*(?:RESULTS?|3\.?\s+Results?)\s*[\n:]/ },
    { name: "discussion", label: "Discussion", regex: /(?:^|\n)\s*(?:DISCUSSION|4\.?\s+Discussion)\s*[\n:]/ },
  ];

  const found: Array<{ name: string; label: string; start: number }> = [];

  for (const p of patterns) {
    const match = text.match(p.regex);
    if (match && match.index !== undefined) {
      found.push({ name: p.name, label: p.label, start: match.index + match[0].length });
    }
  }

  found.sort((a, b) => a.start - b.start);

  for (let i = 0; i < found.length; i++) {
    const end = i + 1 < found.length ? found[i + 1].start : text.length;
    const sectionText = text.slice(found[i].start, end).trim();
    if (sectionText.length > 50) {
      sections.push({ name: found[i].name, label: found[i].label, text: sectionText });
    }
  }

  return sections;
}

// ===== 提取函数 =====

export async function extractFromText(
  text: string,
  title: string,
  options?: { maxTokens?: number }
): Promise<ExtractionResult> {
  return withLLMRetry(async () => {
    const client = getLLMClient();
    const maxTokens = options?.maxTokens || 8192;

    const userMessage = `Extract all experimental findings from this paper:\n\nTitle: ${title}\n\nContent:\n${text}`;

    // MIMO 不支持 response_format，靠 system prompt 强制 JSON 输出
    const systemPrompt = CORE_PROMPT + "\n\nCRITICAL: You MUST return ONLY a JSON object. No thinking, no explanation, no markdown. The JSON MUST have this exact structure:\n" + JSON.stringify({"experiments":[{"drug_intervention":{"name":"string","concentration":"string or null","duration":"string or null","co_treatment":"string or null"},"model":{"cell_line":"string or null","species":"string or null","passage":"string or null"},"pathway_effects":[{"pathway":"string","direction":"up|down|no_change","significance":"string or null","method":"string or null"}],"phenotype_effects":[{"phenotype":"string","direction":"up|down|no_change","fold_change":"string or null"}],"controls":["string"],"statistical_test":"string or null","sample_size":0,"conclusion":"string","evidence_quote":"string"}]}, null, 2) + "\n\nIf no experiments are found, return {\"experiments\":[]}. Do NOT wrap in markdown code blocks.";

    const response = await client.messages.create({
      model: MODELS.extraction,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    return await extractStructuredOutput(response, ExtractionResultSchema, {
      label: "extraction",
      retryFn: createRetryFunction(client, {
        model: MODELS.extraction,
        maxTokens,
        system: CORE_PROMPT,
        userMessage,
        originalContent: userMessage,
        schema: ExtractionResultSchema,
      }),
    });
  }, { label: "extraction" });
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
