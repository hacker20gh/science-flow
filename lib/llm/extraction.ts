/**
 * LLM 文献信息提取
 *
 * 通过 CCS 调用 Anthropic Messages API + tool_use
 * 强制 Claude 输出符合 Zod Schema 的结构化 JSON
 */

import { z } from "zod";
import { getLLMClient, MODELS, withLLMRetry } from "./client";
import { extractStructuredOutput, createRetryFunction, createToolFromSchema } from "./json-extractor";

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

const EXTRACTION_TOOL = createToolFromSchema(
  "extract_paper_data",
  "Extract structured experimental data from a biomedical paper",
  ExtractionResultSchema,
);

// ===== Prompt =====

const CORE_PROMPT = `You are a biomedical literature analysis expert.

EXTRACTION RULES:
- A single paper may contain MULTIPLE independent experiments. Extract each separately.
- Only extract findings EXPLICITLY stated in the text. Do NOT infer or hallucinate.
- If information is not available, use null.

ANTI-HALLUCINATION (hard rules):
- Each field MUST have an evidence_quote from the original text.
- If you cannot find evidence for a field, set it to null. NEVER guess.
- Concentrations/doses MUST include units (e.g. "2 μM", "10 mg/kg").
- Statistical methods must be explicitly mentioned in the text, not inferred.
- Sample size: set to null if not explicitly stated.

NAMING CONVENTIONS:
- Pathways: NF-κB, PI3K/AKT, MAPK/ERK, JAK/STAT, mTOR, Wnt, Notch, TGF-β, p53, HIF-1α, AMPK, PD-1/PD-L1.
- Phenotypes: Apoptosis, Cell Viability, Cell Proliferation, Cell Migration, Metastasis, Drug Resistance.
- pathway_effects[].method: experimental technique (e.g. "Western blot", "qPCR"), NOT statistical method.
- Confidence (0-1): 1.0 = explicitly stated, 0.8 = strongly implied, 0.5 = inferred, 0.3 = uncertain.

FEW-SHOT EXAMPLE:
Input excerpt: "HeLa cells treated with 5 μM cisplatin for 24h showed significant upregulation of p53 (Western blot, p<0.01, n=3) and increased apoptosis (flow cytometry, 2.5-fold). DMSO was used as vehicle control."
Expected output:
{
  "experiments": [{
    "drug_intervention": {"name": "cisplatin", "concentration": "5 μM", "duration": "24h", "co_treatment": null},
    "model": {"cell_line": "HeLa", "species": "human", "passage": null},
    "pathway_effects": [{"pathway": "p53", "direction": "up", "significance": "p<0.01", "method": "Western blot"}],
    "phenotype_effects": [{"phenotype": "Apoptosis", "direction": "up", "fold_change": "2.5-fold"}],
    "controls": ["DMSO vehicle control"],
    "statistical_test": null,
    "sample_size": 3,
    "conclusion": "Cisplatin upregulates p53 and induces apoptosis in HeLa cells",
    "evidence_quote": "HeLa cells treated with 5 μM cisplatin for 24h showed significant upregulation of p53",
    "confidence": 0.95
  }]
}`;

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

    const response = await client.messages.create({
      model: MODELS.extraction,
      max_tokens: maxTokens,
      system: CORE_PROMPT,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool", name: "extract_paper_data" },
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

  const concurrency = 5;
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
