/**
 * LLM 文献信息提取
 *
 * 通过 CCS 调用 Anthropic Messages API + tool_use
 * 强制 Claude 输出符合 Zod Schema 的结构化 JSON
 */

import { z } from "zod";
import { getLLMClient, MODELS, getModelForFeature, withLLMRetry, getIsRetryMode } from "./client";
import { extractStructuredOutput, createRetryFunction, createToolFromSchema } from "./json-extractor";
import { streamLLMWithToolUse, type SSEEvent } from "./streaming";
import { trackTokenUsage } from "@/lib/token-tracker";
import { sleep } from "@/lib/utils/sleep";

// ===== Zod Schema =====

export const ExperimentSchema = z.object({
  intervention: z.object({
    type: z.enum(["drug", "knockdown", "overexpression", "knockout", "stimulation", "inhibition"]).describe(
      "干预类型: drug(药物), knockdown(基因敲低:siRNA/shRNA), overexpression(过表达:plasmid/转染), " +
      "knockout(基因敲除:CRISPR), stimulation(刺激因子:LPS/TNF-α), inhibition(抑制剂)"
    ),
    target: z.string().describe("干预靶点：药物名或基因名（如 cisplatin, TP53, EGFR）"),
    concentration: z.string().nullable().describe("浓度，如 2 μM 或 50 nM siRNA"),
    duration: z.string().nullable().describe("处理时间，如 24h"),
    method: z.string().nullable().describe("干预方法（仅 knockdown/overexpression/knockout 时填写）: siRNA, shRNA, CRISPR/Cas9, plasmid 等"),
    co_treatment: z.string().nullable().describe("联合处理"),
  }),
  model: z.object({
    cell_line: z.string().nullable().describe("细胞系"),
    species: z.string().nullable().describe("物种"),
    passage: z.string().nullable().describe("传代范围"),
  }),
  experiment_type: z.enum([
    "cell_line", "primary_cell", "organoid", "tissue_slice",
    "animal_model", "xenograft", "patient_sample",
    "clinical_trial", "clinical_obs", "case_report",
    "bioinformatics", "omics", "meta_analysis", "review", "unknown",
  ]).describe(
    "实验系统: cell_line(细胞系), primary_cell(原代细胞), organoid(类器官/3D培养), " +
    "tissue_slice(组织切片), animal_model(动物模型), xenograft(异种移植/PDX), " +
    "patient_sample(患者样本), clinical_trial(临床试验RCT), clinical_obs(队列/病例对照), " +
    "case_report(病例报告), bioinformatics(生信分析), omics(组学), " +
    "meta_analysis(系统综述/meta分析), review(综述), unknown(不确定)"
  ),
  experiment_methods: z.array(z.string()).describe(
    "实验方法（可多个）: 如 Western blot, qPCR, RNA-seq, flow cytometry, " +
    "immunohistochemistry, ELISA, CRISPR screen, ChIP-seq, mass spectrometry 等"
  ),
  ic50: z.string().nullable().describe("IC50/EC50 值（如 5.2 μM），仅在有明确数值时填写"),
  dose_response: z.array(z.object({
    concentration: z.string().describe("浓度，如 1 μM"),
    effect_size: z.string().describe("效应大小，如 1.2-fold 或 35%"),
    direction: z.enum(["up", "down", "no_change"]),
  })).nullable().describe("剂量-反应数据（论文测试多个浓度时填写）"),
  pathway_effects: z.array(z.object({
    pathway: z.string(),
    direction: z.enum(["up", "down", "no_change"]),
    significance: z.string().nullable(),
    method: z.string().nullable(),
    fold_change: z.string().nullable().describe("通路变化倍数，如 2.3-fold"),
    downstream_of: z.string().nullable().describe("如果此通路是另一个通路的下游，填写上游通路名"),
  })),
  phenotype_effects: z.array(z.object({
    phenotype: z.string(),
    direction: z.enum(["up", "down", "no_change"]),
    fold_change: z.string().nullable(),
    caused_by: z.string().nullable().describe("哪个通路导致此表型变化"),
  })),
  mechanistic_chain: z.array(z.object({
    from: z.string().describe("上游通路/分子"),
    to: z.string().describe("下游通路/分子"),
    relation: z.string().describe("关系: activates, inhibits, phosphorylates 等"),
  })).nullable().describe("因果链：通路之间的上下游关系"),
  validated_by: z.array(z.string()).nullable().describe(
    "此实验被哪些其他实验验证/支持。填写验证实验的关键描述。"
  ),
  validates: z.string().nullable().describe(
    "此实验验证/支持哪个假设或发现。"
  ),
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

MULTILINGUAL SUPPORT:
- This paper may be in Chinese, Japanese, or other non-English language.
- Extract ALL information regardless of the paper's language.
- Always output in English (translate pathway/phenotype names to standard English).
- Chinese papers often have: 目的(Objective), 方法(Methods), 结果(Results), 结论(Conclusion)
- For Chinese papers, look for: 上调/表达增加 = up, 下调/表达降低 = down, 无显著变化 = no_change

EXTRACTION RULES:
- A single paper may contain MULTIPLE independent experiments. Extract each separately.
- Only extract findings EXPLICITLY stated in the text. Do NOT infer or hallucinate.
- If information is not available, use null.

NEGATIVE RESULTS ARE IMPORTANT:
- "not affected", "no significant change", "unchanged", "no effect" = direction "no_change"
- ALWAYS extract these as experiments with direction "no_change". Do NOT skip them.
- Negative results are as scientifically valuable as positive results.
- If a paper states "p53 expression was not affected by treatment X", extract it as:
  pathway_effects: [{ pathway: "p53", direction: "no_change", ... }]

TABLE HANDLING RULES:
- When you see a Markdown table, each ROW with numeric data is potentially a SEPARATE experiment.
- Column headers define what is being measured (e.g., p-AKT, p-mTOR, Apoptosis rate).
- Each row with different concentration/dose/cell line = separate experiment entry.
- Extract ALL rows, not just the one with the most significant result.
- For table data, set evidence_quote to include the table reference (e.g., "Table 1, row 3").
- If a table shows dose-response data across multiple concentrations, fill the dose_response array AND create a separate experiment for the highest/most significant concentration.

TABLE EXAMPLE:
| Concentration | p53 (WB) | Apoptosis (%) |
| 1 μM         | 1.2-fold  | 15%           |
| 5 μM         | 2.3-fold  | 35%           |
| 10 μM        | 3.1-fold  | 60%           |

-> Extract 3 experiments (one per concentration), plus fill dose_response array for the concentration series.

ANTI-HALLUCINATION (hard rules):
- Each field MUST have an evidence_quote from the original text.
- If you cannot find evidence for a field, set it to null. NEVER guess.
- Concentrations/doses MUST include units (e.g. "2 μM", "10 mg/kg").
- Statistical methods must be explicitly mentioned in the text, not inferred.
- Sample size: set to null if not explicitly stated.

NAMING CONVENTIONS:
STANDARD PATHWAY NAMES (you MUST use one of these exact names):
NF-κB, PI3K/AKT, MAPK/ERK, JAK/STAT, Wnt/β-catenin, Notch, TGF-β/SMAD, p53, mTOR, AMPK, HIF-1α, PD-1/PD-L1, EGFR, VEGF, ROS, ER Stress, Autophagy, Ferroptosis, Pyroptosis, Necroptosis, DNA Damage, DNA Repair, Cell Cycle, Apoptosis, AKT, ERK, JNK, p38 MAPK, STAT3, JAK2, PI3K, SMAD, β-catenin, Hedgehog, TME

If the paper uses a variant name (e.g. "NF-kappaB", "PI3K-Akt pathway"), output the standard name above.

STANDARD PHENOTYPE NAMES (you MUST use one of these exact names):
Apoptosis, Cell Viability, Cell Proliferation, Cell Migration, Cell Invasion, Metastasis, EMT, Drug Resistance, Drug Sensitivity, Colony Formation, Cell Growth, Tumor Growth, Cytotoxicity, Cell Death, Necrosis, Angiogenesis, Tube Formation, Wound Healing, Immune Response, Inflammation, Inflammatory Response, T Cell Activation, T Cell Exhaustion, Macrophage Polarization, PD-L1 Expression, IC50

If the paper uses a variant (e.g. "programmed cell death", "cell survival"), output the standard name.

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

// ===== 摘要专用 Prompt =====

const ABSTRACT_PROMPT = `You are analyzing a paper ABSTRACT (not full text).
Many experimental details will be unavailable - this is expected and OK.

MULTILINGUAL SUPPORT:
- This paper may be in Chinese, Japanese, or other non-English language.
- Extract ALL information regardless of the paper's language.
- Always output in English (translate pathway/phenotype names to standard English).
- For Chinese papers, look for: 上调/表达增加 = up, 下调/表达降低 = down, 无显著变化 = no_change

RELAXED RULES:
- intervention.concentration/duration/co_treatment/method: use null if not explicitly stated
- model.passage: almost always unavailable in abstracts, use null
- experiment_type: infer from context (cell_line for cell experiments, bioinformatics for data mining, etc.)
- experiment_methods: list from context, empty array if unknown
- statistical_test/sample_size: often not in abstract, use null
- controls: empty array if not mentioned
- confidence: cap at 0.6
- Focus on what IS available: intervention target, cell line, pathway direction, phenotype direction
- For evidence_quote: use the EXACT sentence from the abstract

NEGATIVE RESULTS: "no_change" direction is important. Extract "not affected", "no significant change", "unchanged" as experiments with direction "no_change". Do NOT skip them.

TABLE HANDLING: When you see table data, each row with different concentration/dose/cell line = separate experiment entry. Extract ALL rows.

NAMING CONVENTIONS (same as standard - use exact names):
Pathways: NF-κB, PI3K/AKT, MAPK/ERK, JAK/STAT, Wnt/β-catenin, Notch, TGF-β/SMAD, p53, mTOR, AMPK, HIF-1α, PD-1/PD-L1, EGFR, VEGF, ROS, ER Stress, Autophagy, Ferroptosis, Pyroptosis, Necroptosis, DNA Damage, DNA Repair, Cell Cycle, Apoptosis, AKT, ERK, JNK, p38 MAPK, STAT3, JAK2, PI3K, SMAD, β-catenin, Hedgehog, TME
Phenotypes: Apoptosis, Cell Viability, Cell Proliferation, Cell Migration, Cell Invasion, Metastasis, EMT, Drug Resistance, Drug Sensitivity, Colony Formation, Cell Growth, Tumor Growth, Cytotoxicity, Cell Death, Necrosis, Angiogenesis, Tube Formation, Wound Healing, Immune Response, Inflammation, Inflammatory Response, T Cell Activation, T Cell Exhaustion, Macrophage Polarization, PD-L1 Expression, IC50

Keep all anti-hallucination rules. Only extract what is explicitly stated.`;

// ===== 空结果重试 Prompts =====

/**
 * 宽松 Prompt：首次提取为空时的重试
 * 降低提取门槛，允许不完整字段
 */
const RELAXED_PROMPT = `You are extracting experimental data from a biomedical paper.
This is a RETRY because the previous extraction returned no results.

MULTILINGUAL SUPPORT:
- This paper may be in Chinese, Japanese, or other non-English language.
- Extract ALL information regardless of the paper's language.
- Always output in English (translate pathway/phenotype names to standard English).
- For Chinese papers, look for: 上调/表达增加 = up, 下调/表达降低 = down, 无显著变化 = no_change

Be MORE LENIENT in extraction:
- Extract even when fields are incomplete (set missing fields to null)
- Focus on identifying ANY pathway direction changes (up/down/no_change)
- Focus on identifying ANY phenotype effects
- Drug name and cell line are the MOST important fields
- If the paper mentions results but lacks specific numbers, still extract them with null for numeric fields
- confidence can be 0.4-0.7 (acknowledging this is less certain)

NEGATIVE RESULTS: "no_change" direction is important. Extract "not affected", "no significant change", "unchanged" as experiments with direction "no_change". Do NOT skip them.

TABLE HANDLING: When you see table data, each row with different concentration/dose/cell line = separate experiment entry. Extract ALL rows.

Keep: anti-hallucination rules (evidence_quote required), naming conventions

NAMING CONVENTIONS (use exact names):
Pathways: NF-κB, PI3K/AKT, MAPK/ERK, JAK/STAT, Wnt/β-catenin, Notch, TGF-β/SMAD, p53, mTOR, AMPK, HIF-1α, PD-1/PD-L1, EGFR, VEGF, ROS, ER Stress, Autophagy, Ferroptosis, Pyroptosis, Necroptosis, DNA Damage, DNA Repair, Cell Cycle, Apoptosis, AKT, ERK, JNK, p38 MAPK, STAT3, JAK2, PI3K, SMAD, β-catenin, Hedgehog, TME
Phenotypes: Apoptosis, Cell Viability, Cell Proliferation, Cell Migration, Cell Invasion, Metastasis, EMT, Drug Resistance, Drug Sensitivity, Colony Formation, Cell Growth, Tumor Growth, Cytotoxicity, Cell Death, Necrosis, Angiogenesis, Tube Formation, Wound Healing, Immune Response, Inflammation, Inflammatory Response, T Cell Activation, T Cell Exhaustion, Macrophage Polarization, PD-L1 Expression, IC50`;

/**
 * 最小 Prompt：最后一次尝试，仅提取最关键信息
 */
const MINIMAL_PROMPT = `You are extracting MINIMAL experimental data from a paper abstract.
Focus ONLY on:
- Drug/intervention name (REQUIRED)
- Pathway names and their direction (up/down) (REQUIRED)
- Phenotype names and their direction (up/down) (REQUIRED)
Everything else can be null. Set confidence to 0.4.
Keep: evidence_quote required, naming conventions.

STANDARD NAMES (use exact names):
Pathways: NF-κB, PI3K/AKT, MAPK/ERK, JAK/STAT, Wnt/β-catenin, Notch, TGF-β/SMAD, p53, mTOR, AMPK, HIF-1α, PD-1/PD-L1, EGFR, VEGF, ROS, ER Stress, Autophagy, Ferroptosis, Pyroptosis, Necroptosis, DNA Damage, DNA Repair, Cell Cycle, Apoptosis, AKT, ERK, JNK, p38 MAPK, STAT3, JAK2, PI3K, SMAD, β-catenin, Hedgehog, TME
Phenotypes: Apoptosis, Cell Viability, Cell Proliferation, Cell Migration, Cell Invasion, Metastasis, EMT, Drug Resistance, Drug Sensitivity, Colony Formation, Cell Growth, Tumor Growth, Cytotoxicity, Cell Death, Necrosis, Angiogenesis, Tube Formation, Wound Healing, Immune Response, Inflammation, Inflammatory Response, T Cell Activation, T Cell Exhaustion, Macrophage Polarization, PD-L1 Expression, IC50`;

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
  options?: { maxTokens?: number; onToken?: (event: SSEEvent) => void }
): Promise<ExtractionResult> {
  return withLLMRetry(async () => {
    const client = getLLMClient();
    const maxTokens = options?.maxTokens || 8192;
    const extractionModel = await getModelForFeature("extraction");

    const userMessage = `Extract all experimental findings from this paper:\n\nTitle: ${title}\n\nContent:\n${text}`;

    const llmParams = {
      model: extractionModel,
      max_tokens: maxTokens,
      system: CORE_PROMPT,
      messages: [{ role: "user" as const, content: userMessage }],
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool" as const, name: "extract_paper_data" },
    };

    if (options?.onToken) {
      // 流式路径：手动追踪 token
      const streamStart = Date.now();
      const { toolUseBlocks, usage } = await streamLLMWithToolUse(client, llmParams, options.onToken);
      trackTokenUsage({
        feature: "extraction",
        model: extractionModel,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
        durationMs: Date.now() - streamStart,
        isRetry: getIsRetryMode(),
      });
      const toolResult = toolUseBlocks.find((t) => t.name === "extract_paper_data");
      if (toolResult) {
        return ExtractionResultSchema.parse(toolResult.input);
      }
      throw new Error("No tool_use block in streaming response");
    }

    // 阻塞式路径：monkey-patch 自动追踪
     
    const response = await client.messages.create({
      ...llmParams,
      _sciflowFeature: "extraction",
    } as any) as import("@anthropic-ai/sdk/resources/messages").Message;

    return await extractStructuredOutput(response, ExtractionResultSchema, {
      label: "extraction",
      retryFn: createRetryFunction(client, {
        model: MODELS.extraction,
        maxTokens,
        system: CORE_PROMPT,
        userMessage,
        originalContent: userMessage,
        schema: ExtractionResultSchema,
        feature: "extraction",
      }),
    });
  }, { label: "extraction" });
}

/**
 * 从全文中提取 Abstract 段落
 * 复用 extractSections 的逻辑，返回 null 如果没找到
 */
function extractAbstract(text: string): string | null {
  const sections = extractSections(text);
  const abstract = sections.find((s) => s.name === "abstract");
  return abstract?.text || null;
}

/**
 * 通用提取函数：接受自定义 system prompt
 * 核心逻辑与 extractFromText 相同，但 system prompt 可定制
 */
export async function extractWithPrompt(
  text: string,
  title: string,
  systemPrompt: string,
  options?: { maxTokens?: number; onToken?: (event: SSEEvent) => void }
): Promise<ExtractionResult> {
  return withLLMRetry(async () => {
    const client = getLLMClient();
    const maxTokens = options?.maxTokens || 8192;
    const extractionModel = await getModelForFeature("extraction");

    const userMessage = `Extract all experimental findings from this paper:\n\nTitle: ${title}\n\nContent:\n${text}`;

    const llmParams = {
      model: extractionModel,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: "user" as const, content: userMessage }],
      tools: [EXTRACTION_TOOL],
      tool_choice: { type: "tool" as const, name: "extract_paper_data" },
    };

    if (options?.onToken) {
      const streamStart = Date.now();
      const { toolUseBlocks, usage } = await streamLLMWithToolUse(client, llmParams, options.onToken);
      trackTokenUsage({
        feature: "extraction",
        model: extractionModel,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
        durationMs: Date.now() - streamStart,
        isRetry: getIsRetryMode(),
      });
      const toolResult = toolUseBlocks.find((t) => t.name === "extract_paper_data");
      if (toolResult) {
        return ExtractionResultSchema.parse(toolResult.input);
      }
      throw new Error("No tool_use block in streaming response");
    }

    const response = await client.messages.create({
      ...llmParams,
      _sciflowFeature: "extraction",
    } as any) as import("@anthropic-ai/sdk/resources/messages").Message;

    return await extractStructuredOutput(response, ExtractionResultSchema, {
      label: "extraction",
      retryFn: createRetryFunction(client, {
        model: MODELS.extraction,
        maxTokens,
        system: systemPrompt,
        userMessage,
        originalContent: userMessage,
        schema: ExtractionResultSchema,
        feature: "extraction",
      }),
    });
  }, { label: "extraction" });
}

/**
 * 带智能重试的提取函数
 *
 * - 短文本（<800 字符，通常为摘要）：用 ABSTRACT_PROMPT → MINIMAL_PROMPT
 * - 长文本（全文）：标准提取 → RELAXED_PROMPT 重试 → MINIMAL_PROMPT + 摘要重试
 * - 每次重试都有 console.log 日志，方便排查
 */
export async function extractWithFallback(
  text: string,
  title: string,
  options?: { maxTokens?: number; onToken?: (event: SSEEvent) => void }
): Promise<ExtractionResult> {
  // 短文本（通常为摘要）：用摘要专用 prompt，然后最小 prompt
  if (text.length < 800) {
    const result = await extractWithPrompt(text, title, ABSTRACT_PROMPT, options);
    if (result.experiments.length > 0) return result;

    console.log(`[Extraction] 摘要提取为空，使用最小 prompt 重试: ${title}`);
    return extractWithPrompt(text, title, MINIMAL_PROMPT, options);
  }

  // 长文本（全文）：标准 → 宽松 → 最小
  const result1 = await extractFromText(text, title, options);
  if (result1.experiments.length > 0) return result1;

  console.log(`[Extraction] 空结果，使用宽松 prompt 重试: ${title}`);
  const result2 = await extractWithPrompt(text, title, RELAXED_PROMPT, options);
  if (result2.experiments.length > 0) return result2;

  const abstractText = extractAbstract(text) || text.slice(0, 2000);
  console.log(`[Extraction] 二次空结果，使用最小 prompt + 摘要重试: ${title}`);
  return extractWithPrompt(abstractText, title, MINIMAL_PROMPT, options);
}

// ===== 长文档分段提取 =====

/**
 * 将 sections 按优先级组装为多个 chunk，每个 chunk ≤ MAX_CHARS
 *
 * - 单个 section 超过 MAX_CHARS 时，按段落边界拆分
 * - 每个 chunk 前附加 context_prefix（标题 + 摘要片段）
 */
function buildChunks(sections: SectionInfo[], title: string, abstractSnippet: string): string[] {
  const chunks: string[] = [];
  const contextPrefix = `[CONTEXT: Paper "${title}"\nAbstract snippet: ${abstractSnippet}]\n\n`;

  for (const section of sections) {
    const sectionText = `\n\n=== ${section.label} ===\n${section.text}`;
    const fullText = contextPrefix + sectionText;

    if (fullText.length <= MAX_CHARS) {
      chunks.push(fullText);
    } else {
      // 按段落拆分，但使用"滑动窗口"保持上下文，避免实验描述被截断
      const paragraphs = section.text.split(/\n\n+/);

      let currentChunk = contextPrefix + `\n\n=== ${section.label} ===\n`;
      let prevParagraphTail = ""; // 保留上一段的最后部分作为上下文

      for (const para of paragraphs) {
        const paraWithOverlap = prevParagraphTail
          ? `[...continued from above]\n${para}`
          : para;

        if (currentChunk.length + paraWithOverlap.length + 2 > MAX_CHARS) {
          if (currentChunk.length > contextPrefix.length + 100) {
            chunks.push(currentChunk);
          }
          // 新 chunk 开始时，带上一段的最后 200 字符作为重叠上下文
          currentChunk = contextPrefix + `\n\n=== ${section.label} (continued) ===\n`;
          if (prevParagraphTail) {
            currentChunk += `[...continued from above]\n${prevParagraphTail}\n\n`;
          }
        }

        currentChunk += para + "\n\n";

        // 保留段落的最后 200 字符作为下一段的上下文
        prevParagraphTail = para.length > 200 ? para.slice(-200) : para;
      }

      if (currentChunk.length > contextPrefix.length + 100) {
        chunks.push(currentChunk);
      }
    }
  }

  return chunks;
}

/**
 * 合并多个分段提取结果，按 drug_name + cell_line + primary_pathway 去重
 * 重复的实验取 evidence_quote 更长或 confidence 更高的版本
 */
function mergeExtractionResults(results: ExtractionResult[]): ExtractionResult {
  const allExperiments: ExperimentResult[] = [];
  const seen = new Set<string>();

  for (const result of results) {
    for (const exp of result.experiments) {
      // 去重 key：drug_name + cell_line + first pathway
      const drugName = exp.intervention.target.toLowerCase().trim();
      const cellLine = (exp.model.cell_line || "").toLowerCase().trim();
      const primaryPathway = exp.pathway_effects[0]?.pathway?.toLowerCase().trim() || "";
      const key = `${drugName}|${cellLine}|${primaryPathway}`;

      if (seen.has(key)) {
        // 已存在：取 evidence_quote 更长、confidence 更高的版本
        const existingIdx = allExperiments.findIndex(e => {
          const eKey = `${e.intervention.target.toLowerCase().trim()}|${(e.model.cell_line || "").toLowerCase().trim()}|${e.pathway_effects[0]?.pathway?.toLowerCase().trim() || ""}`;
          return eKey === key;
        });
        if (existingIdx >= 0) {
          const existing = allExperiments[existingIdx];
          // 保留更完整的版本
          if (exp.evidence_quote.length > existing.evidence_quote.length ||
              (exp.confidence || 0) > (existing.confidence || 0)) {
            allExperiments[existingIdx] = exp;
          }
        }
      } else {
        seen.add(key);
        allExperiments.push(exp);
      }
    }
  }

  return { experiments: allExperiments };
}

/**
 * 长文档分段提取：对超过 MAX_CHARS 的文档按章节拆分后分别提取再合并
 *
 * 策略：
 * 1. extractSections() 拆分为 sections
 * 2. 短文本直接调用 extractFromText
 * 3. 长文本按 sections 构建 chunks（每个 ≤ MAX_CHARS），附加上下文前缀
 * 4. 并发提取所有 chunks（最多 3 个并发）
 * 5. 合并所有 chunk 的 experiments，去重
 */
export async function extractFromLongText(
  text: string,
  title: string,
  options?: { maxTokens?: number; onToken?: (event: SSEEvent) => void }
): Promise<ExtractionResult> {
  // 短文本直接用标准提取
  if (text.length <= MAX_CHARS) {
    return extractFromText(text, title, options);
  }

  console.log(`[Extraction] 长文档分段提取: ${title} (${text.length} 字符)`);

  // 拆分 sections
  const sections = extractSections(text);

  if (sections.length === 0) {
    // 无法识别章节结构，回退到 smartTruncate + 标准提取
    return extractFromText(text, title, options);
  }

  // 获取摘要片段作为上下文
  const abstractSection = sections.find(s => s.name === "abstract");
  const abstractSnippet = (abstractSection?.text || "").slice(0, 500);

  // 构建 chunks
  const chunks = buildChunks(sections, title, abstractSnippet);

  console.log(`[Extraction] 拆分为 ${chunks.length} 个 chunk`);

  // 并发提取所有 chunks（最多 3 个并发）
  const CONCURRENCY = 3;
  const results: ExtractionResult[] = [];
  const queue = [...chunks];

  async function worker() {
    while (queue.length > 0) {
      const chunk = queue.shift()!;
      try {
        const result = await extractFromText(chunk, title);
        results.push(result);
      } catch (error) {
        console.warn(`[Extraction] Chunk 提取失败:`, (error as Error)?.message);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  // 合并结果
  const merged = mergeExtractionResults(results);

  console.log(`[Extraction] 分段提取完成: ${merged.experiments.length} 个实验 (来自 ${chunks.length} 个 chunk)`);

  return merged;
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
