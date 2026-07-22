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
  role: z.enum(["main", "supporting", "control"]).optional().describe(
    "实验在论文论证中的角色: " +
    "main(核心实验 — 直接证明论文的主要发现/结论), " +
    "supporting(支撑实验 — 验证或补充核心发现，如不同细胞系/时间点/浓度的验证), " +
    "control(对照实验 — 排除其他可能性，如阴性对照、vehicle control)"
  ),
  intervention: z.object({
    type: z.enum(["drug", "knockdown", "overexpression", "knockout", "stimulation", "inhibition"]).optional().describe(
      "干预类型: drug(药物), knockdown(基因敲低:siRNA/shRNA), overexpression(过表达:plasmid/转染), " +
      "knockout(基因敲除:CRISPR), stimulation(刺激因子:LPS/TNF-α), inhibition(抑制剂)"
    ),
    target: z.string().optional().describe("干预靶点：药物名或基因名（如 cisplatin, TP53, EGFR）"),
    concentration: z.string().nullable().optional().describe("浓度，如 2 μM 或 50 nM siRNA"),
    duration: z.string().nullable().optional().describe("处理时间，如 24h"),
    method: z.string().nullable().optional().describe("干预方法（仅 knockdown/overexpression/knockout 时填写）: siRNA, shRNA, CRISPR/Cas9, plasmid 等"),
    co_treatment: z.string().nullable().optional().describe("联合处理"),
  }).optional(),
  model: z.object({
    cell_line: z.string().nullable().optional().describe("细胞系"),
    species: z.string().nullable().optional().describe("物种"),
    passage: z.string().nullable().optional().describe("传代范围"),
  }).optional(),
  experiment_type: z.enum([
    "cell_line", "primary_cell", "organoid", "tissue_slice",
    "animal_model", "xenograft", "patient_sample",
    "clinical_trial", "clinical_obs", "case_report",
    "bioinformatics", "omics", "meta_analysis", "review", "unknown",
  ]).optional().describe(
    "实验系统: cell_line(细胞系), primary_cell(原代细胞), organoid(类器官/3D培养), " +
    "tissue_slice(组织切片), animal_model(动物模型), xenograft(异种移植/PDX), " +
    "patient_sample(患者样本), clinical_trial(临床试验RCT), clinical_obs(队列/病例对照), " +
    "case_report(病例报告), bioinformatics(生信分析), omics(组学), " +
    "meta_analysis(系统综述/meta分析), review(综述), unknown(不确定)"
  ),
  experiment_methods: z.array(z.string()).optional().describe(
    "实验方法（可多个）: 如 Western blot, qPCR, RNA-seq, flow cytometry, " +
    "immunohistochemistry, ELISA, CRISPR screen, ChIP-seq, mass spectrometry 等"
  ),
  ic50: z.string().nullable().optional().describe("IC50/EC50 值（如 5.2 μM），仅在有明确数值时填写"),
  dose_response: z.array(z.object({
    concentration: z.string().describe("浓度，如 1 μM"),
    effect_size: z.string().describe("效应大小，如 1.2-fold 或 35%"),
    direction: z.enum(["up", "down", "no_change"]),
  })).nullable().optional().describe("剂量-反应数据（论文测试多个浓度时填写）"),
  pathway_effects: z.array(z.object({
    pathway: z.string(),
    direction: z.enum(["up", "down", "no_change"]),
    significance: z.string().nullable().optional(),
    method: z.string().nullable().optional(),
    fold_change: z.string().nullable().optional().describe("通路变化倍数，如 2.3-fold"),
    downstream_of: z.string().nullable().optional().describe("如果此通路是另一个通路的下游，填写上游通路名"),
  })).optional(),
  phenotype_effects: z.array(z.object({
    phenotype: z.string(),
    direction: z.enum(["up", "down", "no_change"]),
    fold_change: z.string().nullable().optional(),
    caused_by: z.string().nullable().optional().describe("哪个通路导致此表型变化"),
  })).optional(),
  mechanistic_chain: z.array(z.object({
    from: z.string().describe("上游通路/分子"),
    to: z.string().describe("下游通路/分子"),
    relation: z.string().describe("关系: activates, inhibits, phosphorylates 等"),
  })).nullable().optional().describe("因果链：通路之间的上下游关系"),
  validated_by: z.array(z.string()).nullable().optional().describe(
    "此实验被哪些其他实验验证/支持。填写验证实验的关键描述。"
  ),
  validates: z.string().nullable().optional().describe(
    "此实验验证/支持哪个假设或发现。"
  ),
  controls: z.array(z.string()).optional(),
  statistical_test: z.string().nullable().optional(),
  sample_size: z.number().nullable().optional(),
  conclusion: z.string().optional(),
  evidence_quote: z.string().optional(),
  evidence_figure: z.string().nullable().optional().describe(
    "此实验来自哪个 Figure（如 'Fig 2c', 'Fig S3'）。如果论文中明确标注了 Figure 编号，填写。"
  ),
  evidence_table: z.string().nullable().optional().describe(
    "此实验来自哪个 Table（如 'Table 1', 'Supplementary Table 2'）。如果有，填写。"
  ),
  confidence: z.number().min(0).max(1).optional(),
});

export const ConclusionSchema = z.object({
  claim: z.string().describe(
    "论文的一个核心结论 — 这篇论文通过一系列实验证明了什么。" +
    "例如: 'TCAF2 在肿瘤周细胞中高表达' 或 'TCAF2 抑制 TRPM8 通道活性'。" +
    "一篇论文通常有 2-4 个核心结论。"
  ),
  evidenceChain: z.array(ExperimentSchema).describe(
    "支持此结论的实验证据链 — 按逻辑顺序排列。" +
    "第一个实验通常是初始发现，后续实验逐步验证。" +
    "例如: [患者样本分析 → 蛋白组学 → 免疫组化验证]"
  ),
});

export const ExtractionResultSchema = z.object({
  claim: z.string().optional().describe(
    "论文的总体核心主张 — 一句话概括这篇论文的主要贡献。"
  ),
  articleType: z.enum([
    "研究论文", "综述", "系统综述", "Meta 分析", "RCT", "临床试验",
    "病例报告", "观察性研究", "生信/组学", "临床指南", "其他",
  ]).optional().describe(
    "论文类型: " +
    "研究论文(原始实验研究，有自己采集的数据和结论), " +
    "综述(对已有文献的总结评述，无新实验数据), " +
    "系统综述(按PRISMA等规范系统检索和评价文献), " +
    "Meta 分析(用统计方法合并多项研究的结果), " +
    "RCT(随机对照试验), " +
    "临床试验(非随机的临床研究，如队列/前后对照), " +
    "病例报告(单个或多个病例的描述), " +
    "观察性研究(队列/病例对照/横断面研究), " +
    "生信/组学(纯计算分析：scRNA-seq/GWAS/分子对接/网络药理学等), " +
    "临床指南(诊疗规范/专家共识), " +
    "其他(社论/信件/勘误等)"
  ),
  conclusions: z.array(ConclusionSchema).optional().describe(
    "论文的核心结论列表（通常 2-4 个），每个结论下面挂一组实验证据链。" +
    "结论之间应该有逻辑递进关系。"
  ),
  // 兼容旧格式：LLM 可能直接返回 experiments 数组
  experiments: z.array(ExperimentSchema).optional(),
});

/**
 * 将 LLM 输出规范化为统一的 conclusions 格式
 * 处理旧格式 { experiments[] } → { conclusions[{ claim, evidenceChain }] }
 */
export function normalizeExtractionResult(data: unknown): ExtractionResult {
  const d = data as Record<string, unknown>;
  const articleType = d.articleType as ExtractionResult["articleType"];
  if (d.conclusions && Array.isArray(d.conclusions) && d.conclusions.length > 0) {
    return { claim: d.claim as string | undefined, articleType, conclusions: d.conclusions as ConclusionResult[] };
  }
  if (d.experiments && Array.isArray(d.experiments) && d.experiments.length > 0) {
    return {
      claim: d.claim as string | undefined,
      articleType,
      conclusions: [{ claim: (d.claim as string) || "论文的主要发现", evidenceChain: d.experiments as ExperimentResult[] }],
    };
  }
  return { claim: d.claim as string | undefined, articleType, conclusions: [] };
}

export type ConclusionResult = z.infer<typeof ConclusionSchema>;
export type ExperimentResult = z.infer<typeof ExperimentSchema>;
export type ExtractionResult = z.infer<typeof ExtractionResultSchema>;

/**
 * 将 conclusions 结构扁平化为 experiments 数组（用于 DB 存储）
 * 每个 experiment 附带 conclusionIndex 和 conclusionClaim 字段
 */
export function flattenConclusions(result: ExtractionResult): ExperimentResult[] {
  if (!result.conclusions || result.conclusions.length === 0) {
    // 兼容旧格式（直接 experiments 数组）
    return (result as unknown as { experiments?: ExperimentResult[] }).experiments || [];
  }
  const allExperiments: (ExperimentResult & { conclusionIndex?: number; conclusionClaim?: string })[] = [];
  for (let i = 0; i < result.conclusions.length; i++) {
    const conc = result.conclusions[i];
    for (const exp of conc.evidenceChain) {
      allExperiments.push({ ...exp, conclusionIndex: i, conclusionClaim: conc.claim });
    }
  }
  return allExperiments;
}

/**
 * 获取 ExtractionResult 中的总实验数
 */
export function getExperimentCount(result: ExtractionResult): number {
  if (result.conclusions && result.conclusions.length > 0) {
    return result.conclusions.reduce((sum, c) => sum + (c.evidenceChain?.length || 0), 0);
  }
  const exps = (result as unknown as { experiments?: unknown }).experiments;
  return Array.isArray(exps) ? exps.length : 0;
}

// ===== Tool 定义 =====

const EXTRACTION_TOOL = createToolFromSchema(
  "extract_paper_data",
  "Extract structured experimental data from a biomedical paper",
  ExtractionResultSchema,
);

// ===== Prompt =====

// ===== 模块化 Prompt =====

/** 核心 prompt（~50行）— 每次都用 */
const PROMPT_CORE = `You are a biomedical literature analysis expert. Extract structured experimental data.

STEP 0 — PAPER TYPE: Classify the paper type FIRST (before extraction).
- 研究论文: Original research with new experimental data and conclusions
- 综述: Narrative review, overview, or summary of existing literature (no new data)
- 系统综述: Systematic review following PRISMA/similar protocols
- Meta 分析: Statistical pooling of multiple studies' results
- RCT: Randomized controlled trial
- 临床试验: Non-randomized clinical study (cohort, before-after, single-arm)
- 病例报告: Case report or case series
- 观察性研究: Cohort, case-control, or cross-sectional study
- 生信/组学: Pure computational analysis (scRNA-seq, GWAS, docking, network pharmacology)
- 临床指南: Clinical practice guideline or expert consensus
- 其他: Editorial, letter, erratum, etc.

Key distinction: If the paper presents NEW experimental data → 研究论文. If it only summarizes OTHER papers' data → 综述/系统综述/Meta.

STEP 1 — CLAIM: Identify the paper's overall claim (Abstract conclusion or Discussion). One sentence.

STEP 2 — CONCLUSIONS (use the paper's own structure):
First, scan Results for SUB-HEADINGS. Use them directly as conclusion claims.
Patterns: numbered "3.1 X is Y", bold lead sentences, "We next examined...", "To determine if..."
Chinese: "结果" section sub-headings.

If NO sub-headings, fallback:
1. Group by main Figure (Fig 1→结论1, Fig 2→结论2). Supplementary figures: same question→supporting, new question→separate conclusion.
2. Topic sentences: "We next examined...", "Having established X, we investigated Y"
3. Logical flow: observation → mechanism → validation → in vivo/clinical

STEP 3 — EVIDENCE CHAINS per conclusion, in logical order. Roles: main (key experiment), supporting (validates), control (rules out alternatives).

QUALITY: 6-15 experiments total, 2-5 per conclusion. Only EXPLICITLY stated findings. Use null if unavailable.

LANGUAGE: Output claim and conclusions[].claim in Chinese (简体中文). Keep experiment details (intervention.target, model.cell_line, pathway names, phenotype names, evidence_quote) in English for data consistency.

RULES:
- Negative results: "not affected", "no change" → direction "no_change". ALWAYS extract.
- Anti-hallucination: every field needs evidence_quote. Never guess. Concentrations need units.
- Merging: same drug+cell+timepoint = ONE experiment. Separate only for different drugs/cells/timepoints/in vitro vs in vivo.
- NOT experiments: method descriptions, observational correlations, figure legends without data.
- Confidence: 1.0=explicit, 0.8=strongly implied, 0.5=inferred, 0.3=uncertain.
- experiment_type: describe the BIOLOGICAL SYSTEM (cell_line, animal_model, patient_sample, omics), NOT the method (CoIP, WB).
- intervention.type: drug(chemicals), knockdown(siRNA/shRNA), overexpression(plasmid), knockout(CRISPR), stimulation(agonists/factors), inhibition(antagonists). Gene names are NOT drugs.
- pathway_effects[].method: experimental technique (WB, qPCR), NOT statistical method.`;

/** 表格规则 — 文本含表格时加载 */
const PROMPT_TABLE_RULES = `
TABLE HANDLING:
- Each ROW with numeric data = potentially SEPARATE experiment.
- Column headers = what is measured (p-AKT, Apoptosis %).
- Different concentration/dose/cell per row = separate entry.
- Extract ALL rows. Set evidence_quote to "Table 1, row 3".
- Dose-response: fill dose_response array AND create separate experiment for highest concentration.`;

/** 多语言规则 — 文本含 CJK 字符时加载 */
const PROMPT_MULTILINGUAL = `
MULTILINGUAL: Extract ALL info regardless of language. Always output in English.
Chinese: 目的=Objective, 方法=Methods, 结果=Results, 结论=Conclusion.
Chinese terms: 上调/表达增加=up, 下调/表达降低=down, 无显著变化=no_change.`;

/** 命名规范 — 精简版，后处理器会二次标准化 */
const PROMPT_NAMING = `
NAMING: Use standard names. Pathways: NF-κB, PI3K/AKT, MAPK/ERK, JAK/STAT, Wnt/β-catenin, Notch, TGF-β/SMAD, p53, mTOR, AMPK, HIF-1α, PD-1/PD-L1, EGFR, VEGF, ROS, ER Stress, Autophagy, Ferroptosis, Apoptosis, ECM, TME.
Phenotypes: Apoptosis, Cell Viability, Cell Proliferation, Cell Migration, Cell Invasion, Metastasis, EMT, Drug Resistance, Colony Formation, Tumor Growth, Angiogenesis.
Variant names → use standard name above.`;

/** Few-shot 示例 */
const PROMPT_FEW_SHOT = `
EXAMPLE:
Input: "HeLa cells treated with 5 μM cisplatin for 24h showed upregulation of p53 (WB, p<0.01, n=3) and increased apoptosis (flow cytometry, 2.5-fold). DMSO vehicle control."
Output: { "claim": "顺铂上调p53并诱导细胞凋亡", "conclusions": [{ "claim": "顺铂在HeLa细胞中上调p53并诱导凋亡", "evidenceChain": [{ "role": "main", "intervention": {"type":"drug","target":"cisplatin","concentration":"5 μM","duration":"24h"}, "model": {"cell_line":"HeLa","species":"human"}, "pathway_effects": [{"pathway":"p53","direction":"up","significance":"p<0.01","method":"Western blot"}], "phenotype_effects": [{"phenotype":"Apoptosis","direction":"up","fold_change":"2.5-fold"}], "controls": ["DMSO vehicle control"], "sample_size": 3, "evidence_quote": "HeLa cells treated with 5 μM cisplatin for 24h showed upregulation of p53", "confidence": 0.95 }] }] }`;

/**
 * 智能组装 prompt：核心 + 条件模块
 */
function buildPrompt(text: string, mode: "standard" | "abstract" | "relaxed" | "minimal" = "standard"): string {
  const parts: string[] = [PROMPT_CORE];

  // 条件加载：表格规则
  if (/\|.*\|.*\|/.test(text) || /Table \d/i.test(text)) {
    parts.push(PROMPT_TABLE_RULES);
  }

  // 条件加载：多语言
  if (/[一-鿿぀-ゟ゠-ヿ]/.test(text)) {
    parts.push(PROMPT_MULTILINGUAL);
  }

  // 命名规范 + 示例（总是加载，但精简了）
  parts.push(PROMPT_NAMING);
  parts.push(PROMPT_FEW_SHOT);

  // 模式特定补充
  if (mode === "abstract") {
    parts.push(`
ABSTRACT MODE: Many details unavailable — this is OK.
- Relax: concentration/duration/co_treatment/method → null if not stated
- experiment_type: infer from context
- confidence: cap at 0.6
- Focus on: intervention target, cell line, pathway direction, phenotype direction`);
  } else if (mode === "relaxed") {
    parts.push(`
RETRY MODE: Previous extraction returned empty. Be MORE LENIENT.
- Extract even with incomplete fields (null for missing)
- Focus on ANY pathway direction changes and phenotype effects
- Drug name + cell line are MOST important
- confidence: 0.4-0.7`);
  } else if (mode === "minimal") {
    return `Extract MINIMAL data. Focus ONLY on: drug/intervention name, pathway names+direction, phenotype names+direction. Everything else null. confidence=0.4.\n${PROMPT_NAMING}`;
  }

  return parts.join("\n");
}

/** 检测文本是否包含表格 */
function hasTableContent(text: string): boolean {
  return /\|.*\|.*\|/.test(text) || /Table \d/i.test(text);
}

/** 检测文本是否包含 CJK 字符 */
function hasCJKContent(text: string): boolean {
  return /[一-鿿぀-ゟ゠-ヿ]/.test(text);
}

// ===== 向后兼容：旧代码引用 CORE_PROMPT =====
const CORE_PROMPT = buildPrompt("", "standard");

// ===== 向后兼容：旧 prompt 常量 =====
const ABSTRACT_PROMPT = buildPrompt("", "abstract");
const RELAXED_PROMPT = buildPrompt("", "relaxed");
const MINIMAL_PROMPT = buildPrompt("", "minimal");

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
      system: buildPrompt(text, "standard"),
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
        return normalizeExtractionResult(ExtractionResultSchema.parse(toolResult.input));
      }
      throw new Error("LLM 未返回结构化数据（可能模型不支持 tool_use 格式）");
    }

    // 阻塞式路径：monkey-patch 自动追踪
     
    const response = await client.messages.create({
      ...llmParams,
      _sciflowFeature: "extraction",
    } as any) as import("@anthropic-ai/sdk/resources/messages").Message;

    const raw = await extractStructuredOutput(response, ExtractionResultSchema, {
      label: "extraction",
      retryFn: createRetryFunction(client, {
        model: extractionModel,
        maxTokens,
        system: buildPrompt(text, "standard"),
        userMessage,
        originalContent: userMessage,
        schema: ExtractionResultSchema,
        feature: "extraction",
      }),
    });
    return normalizeExtractionResult(raw);
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
        return normalizeExtractionResult(ExtractionResultSchema.parse(toolResult.input));
      }
      throw new Error("LLM 未返回结构化数据（可能模型不支持 tool_use 格式）");
    }

    const response = await client.messages.create({
      ...llmParams,
      _sciflowFeature: "extraction",
    } as any) as import("@anthropic-ai/sdk/resources/messages").Message;

    const raw = await extractStructuredOutput(response, ExtractionResultSchema, {
      label: "extraction",
      retryFn: createRetryFunction(client, {
        model: extractionModel,
        maxTokens,
        system: systemPrompt,
        userMessage,
        originalContent: userMessage,
        schema: ExtractionResultSchema,
        feature: "extraction",
      }),
    });
    return normalizeExtractionResult(raw);
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
    if (getExperimentCount(result) > 0) return result;

    console.log(`[Extraction] 摘要提取为空，使用最小 prompt 重试: ${title}`);
    return extractWithPrompt(text, title, MINIMAL_PROMPT, options);
  }

  // 长文本（全文）：标准 → 最小（跳过宽松，省一次 LLM 调用）
  const result1 = await extractFromText(text, title, options);
  if (getExperimentCount(result1) > 0) return result1;

  console.log(`[Extraction] 空结果，使用最小 prompt 重试: ${title}`);
  const abstractText = extractAbstract(text) || text.slice(0, 3000);
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
    for (const exp of flattenConclusions(result)) {
      // 去重 key：drug_name + cell_line + first pathway
      const drugName = (exp.intervention?.target || "unknown").toLowerCase().trim();
      const cellLine = (exp.model?.cell_line || "").toLowerCase().trim();
      const primaryPathway = (exp.pathway_effects || [])[0]?.pathway?.toLowerCase().trim() || "";
      const key = `${drugName}|${cellLine}|${primaryPathway}`;

      if (seen.has(key)) {
        // 已存在：取 evidence_quote 更长、confidence 更高的版本
        const existingIdx = allExperiments.findIndex(e => {
          const eKey = `${(e.intervention?.target || "unknown").toLowerCase().trim()}|${(e.model?.cell_line || "").toLowerCase().trim()}|${(e.pathway_effects || [])[0]?.pathway?.toLowerCase().trim() || ""}`;
          return eKey === key;
        });
        if (existingIdx >= 0) {
          const existing = allExperiments[existingIdx];
          // 保留更完整的版本
          if ((exp.evidence_quote || "").length > (existing.evidence_quote || "").length ||
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

  return { claim: undefined, conclusions: allExperiments.map((exp, i) => ({
    claim: (exp as ExperimentResult & { conclusionClaim?: string }).conclusionClaim || `实验 ${i + 1}`,
    evidenceChain: [exp],
  })) };
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

  console.log(`[Extraction] 分段提取完成: ${getExperimentCount(merged)} 个实验 (来自 ${chunks.length} 个 chunk)`);

  return merged;
}

// ===== 两阶段提取 =====

/**
 * 阶段 1：识别结论框架
 *
 * 只提取 claim + conclusions 的标题，不提取实验细节。
 * 速度快，token 少，用于确定"论文证明了哪几个结论"。
 */
const ConclusionFrameworkSchema = z.object({
  claim: z.string().describe("论文的总体核心主张，一句话概括"),
  conclusions: z.array(z.object({
    claim: z.string().describe("结论标题，直接使用论文 Results 小标题或 Figure 描述"),
    sectionHint: z.string().nullable().optional().describe("该结论在论文中的位置提示，如 'Results section 3.1' 或 'Fig 2'"),
  })).describe("论文的核心结论列表（2-6个）"),
});

const FRAMEWORK_TOOL = createToolFromSchema(
  "identify_conclusions",
  "Identify the paper's main conclusions without extracting detailed experiments",
  ConclusionFrameworkSchema,
);

const FRAMEWORK_PROMPT = `You are a biomedical literature analyst. Read this paper and identify its MAIN CONCLUSIONS.

Rules:
- Scan the Results section for sub-headings. Use them as conclusion claims.
- If no sub-headings, group by main Figure (Fig 1=结论1, Fig 2=结论2).
- Supplementary figures: same question as main figure → skip (will be merged later). New question → add as separate conclusion.
- Output 2-6 conclusions. Each should be ONE specific finding, not a vague summary.
- Include section/figure hints (e.g. "Results 3.1", "Fig 2") for each conclusion.
- Output conclusion claims in Chinese (简体中文). Keep section/figure hints in English.`;

/**
 * 阶段 2：逐结论提取实验
 *
 * 对每个结论单独调用 LLM，提取该结论的 evidenceChain。
 * Context 更聚焦，提取更精准。
 */
const ConclusionDetailSchema = z.object({
  evidenceChain: z.array(ExperimentSchema).describe(
    "支持此结论的实验证据链，按逻辑顺序排列。2-5 个实验。"
  ),
});

const DETAIL_TOOL = createToolFromSchema(
  "extract_evidence_chain",
  "Extract the evidence chain supporting a specific conclusion",
  ConclusionDetailSchema,
);

/**
 * 两阶段提取主函数
 *
 * 阶段 1：识别结论框架（1 次 LLM 调用）
 * 阶段 2：逐结论提取证据链（N 次 LLM 调用，N = 结论数）
 *
 * 优势：每次 LLM 只关注一个结论，提取更精准，不容易漏实验。
 * 劣势：LLM 调用次数多，总耗时更长。
 */
export async function extractTwoPhase(
  text: string,
  title: string,
  options?: { maxTokens?: number; onToken?: (event: SSEEvent) => void }
): Promise<ExtractionResult> {
  const client = getLLMClient();
  const extractionModel = await getModelForFeature("extraction");
  const truncatedText = smartTruncate(text);

  // ===== 阶段 1：识别结论框架 =====
  options?.onToken?.({ type: "progress", step: "识别论文结论框架...", current: 0, total: 1 });

  const frameworkPrompt = buildPrompt(truncatedText, "standard")
    + "\n\nIMPORTANT: For this step, ONLY identify the conclusions. Do NOT extract detailed experiments.";

  const frameworkParams = {
    model: extractionModel,
    max_tokens: 2000,
    system: frameworkPrompt,
    messages: [{ role: "user" as const, content: `Identify the main conclusions of this paper:\n\nTitle: ${title}\n\nContent:\n${truncatedText}` }],
    tools: [FRAMEWORK_TOOL],
    tool_choice: { type: "tool" as const, name: "identify_conclusions" },
  };

  let framework: z.infer<typeof ConclusionFrameworkSchema>;
  try {
    const response = await client.messages.create({
      ...frameworkParams,
      _sciflowFeature: "extraction-phase1",
    } as any) as import("@anthropic-ai/sdk/resources/messages").Message;

    const raw = await extractStructuredOutput(response, ConclusionFrameworkSchema, {
      label: "extraction-phase1",
      retryFn: createRetryFunction(client, {
        model: extractionModel,
        maxTokens: 2000,
        system: frameworkPrompt,
        userMessage: `Identify the main conclusions of this paper:\n\nTitle: ${title}\n\nContent:\n${truncatedText}`,
        originalContent: truncatedText,
        schema: ConclusionFrameworkSchema,
        feature: "extraction-phase1",
      }),
    });
    framework = raw as z.infer<typeof ConclusionFrameworkSchema>;
  } catch (error) {
    console.warn("[TwoPhase] 阶段1失败，回退到单次提取:", (error as Error)?.message);
    return extractWithFallback(text, title, options);
  }

  if (!framework.conclusions || framework.conclusions.length === 0) {
    console.warn("[TwoPhase] 阶段1返回空结论，回退到单次提取");
    return extractWithFallback(text, title, options);
  }

  console.log(`[TwoPhase] 阶段1完成: ${framework.conclusions.length} 个结论`);

  // ===== 阶段 2：逐结论提取证据链 =====
  const conclusions: ConclusionResult[] = [];
  const CONCURRENCY = 2; // 并发度（避免 API 限流）

  const queue = [...framework.conclusions];
  let completedCount = 0;

  async function extractConclusionWorker() {
    while (queue.length > 0) {
      const conc = queue.shift()!;
      completedCount++;
      options?.onToken?.({
        type: "progress",
        step: `提取结论 ${completedCount}/${framework.conclusions.length}: ${conc.claim.slice(0, 50)}...`,
        current: completedCount,
        total: framework.conclusions.length,
      });

      const detailPrompt = buildPrompt(truncatedText, "standard")
        + `\n\nFOCUS: Extract experiments that support THIS specific conclusion: "${conc.claim}"
${conc.sectionHint ? `Look in: ${conc.sectionHint}` : ""}
Extract 2-5 experiments in logical order. Each needs evidence_quote from the original text.`;

      const detailParams = {
        model: extractionModel,
        max_tokens: 4000,
        system: detailPrompt,
        messages: [{ role: "user" as const, content: `Title: ${title}\n\nPaper content:\n${truncatedText}\n\nExtract experiments supporting: "${conc.claim}"` }],
        tools: [DETAIL_TOOL],
        tool_choice: { type: "tool" as const, name: "extract_evidence_chain" },
      };

      try {
        const response = await client.messages.create({
          ...detailParams,
          _sciflowFeature: "extraction-phase2",
        } as any) as import("@anthropic-ai/sdk/resources/messages").Message;

        const raw = await extractStructuredOutput(response, ConclusionDetailSchema, {
          label: `extraction-phase2-${completedCount}`,
        });

        const detail = raw as z.infer<typeof ConclusionDetailSchema>;
        if (detail.evidenceChain && detail.evidenceChain.length > 0) {
          conclusions.push({ claim: conc.claim, evidenceChain: detail.evidenceChain });
        }
      } catch (error) {
        console.warn(`[TwoPhase] 结论 "${conc.claim.slice(0, 40)}" 提取失败:`, (error as Error)?.message);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => extractConclusionWorker()));

  if (conclusions.length === 0) {
    console.warn("[TwoPhase] 阶段2全部失败，回退到单次提取");
    return extractWithFallback(text, title, options);
  }

  const totalExps = conclusions.reduce((sum, c) => sum + c.evidenceChain.length, 0);
  console.log(`[TwoPhase] 完成: ${conclusions.length} 个结论, ${totalExps} 个实验`);

  return { claim: framework.claim, conclusions };
}

// ===== 完整性验证 =====

/**
 * 提取后验证：检查是否有遗漏的实验
 *
 * 用 LLM 对比论文原文和已提取结果，找出遗漏的实验。
 * 比使用不同模型更便宜，但能显著减少遗漏。
 */
export async function verifyExtractionCompleteness(
  text: string,
  title: string,
  currentResult: ExtractionResult,
): Promise<ExtractionResult> {
  const client = getLLMClient();
  const extractionModel = await getModelForFeature("extraction");
  const truncatedText = smartTruncate(text);

  const currentExps = flattenConclusions(currentResult);
  if (currentExps.length < 3) return currentResult; // 太少就不验证了

  // 构建已提取摘要
  const extractedSummary = currentResult.conclusions?.map(c =>
    `结论: ${c.claim}\n  实验: ${c.evidenceChain.map(e =>
      `${e.intervention?.target || "?"} (${e.intervention?.type || "?"}) → ${e.pathway_effects?.[0]?.pathway || "?"} ${e.pathway_effects?.[0]?.direction || "?"}`
    ).join("; ")}`
  ).join("\n") || "";

  const MissingSchema = z.object({
    hasMissing: z.boolean().describe("是否有遗漏的实验"),
    missingExperiments: z.array(ExperimentSchema).describe("遗漏的实验列表，如果没有遗漏则为空数组"),
    missingConclusions: z.array(z.object({
      claim: z.string(),
      evidenceChain: z.array(ExperimentSchema),
    })).describe("遗漏的结论（如果论文有未覆盖的重要发现）"),
  });

  const verifyTool = createToolFromSchema(
    "check_completeness",
    "Check if any experiments were missed in the extraction",
    MissingSchema,
  );

  const verifyPrompt = `You are verifying the completeness of a paper extraction.
Compare the original paper text with the already-extracted results.
Find any IMPORTANT experiments that were MISSED.

Rules:
- Only flag genuinely important missing experiments, not minor variations
- Focus on: experiments with different cell lines, different drugs, in vivo vs in vitro, clinical data
- Do NOT flag: duplicate experiments, minor methodological variations
- If the extraction is reasonably complete, return hasMissing: false
- Be CONSERVATIVE: better to miss a minor experiment than to add a false one`;

  try {
    const response = await client.messages.create({
      model: extractionModel,
      max_tokens: 4000,
      system: verifyPrompt,
      messages: [{
        role: "user" as const,
        content: `Title: ${title}\n\nPaper:\n${truncatedText.slice(0, 10000)}\n\nAlready extracted (${currentExps.length} experiments):\n${extractedSummary}\n\nAre there any IMPORTANT missing experiments or conclusions?`
      }],
      tools: [verifyTool],
      tool_choice: { type: "tool" as const, name: "check_completeness" },
      _sciflowFeature: "extraction-verify",
    } as any) as import("@anthropic-ai/sdk/resources/messages").Message;

    const raw = await extractStructuredOutput(response, MissingSchema, {
      label: "extraction-verify",
    });

    const verification = raw as z.infer<typeof MissingSchema>;

    if (!verification.hasMissing) {
      console.log("[Verify] 提取完整性检查通过，无遗漏");
      return currentResult;
    }

    // 合并遗漏的实验
    const missingExps = verification.missingExperiments || [];
    const missingConcs = verification.missingConclusions || [];

    if (missingExps.length === 0 && missingConcs.length === 0) {
      return currentResult;
    }

    console.log(`[Verify] 发现遗漏: ${missingExps.length} 个实验, ${missingConcs.length} 个结论`);

    // 合并到现有结果
    const existingConclusions = currentResult.conclusions || [];

    // 遗漏的独立结论直接追加
    const newConclusions = [...existingConclusions, ...missingConcs];

    // 遗漏的实验追加到最后一个结论（如果没有指定归属）
    if (missingExps.length > 0 && newConclusions.length > 0) {
      const lastConc = newConclusions[newConclusions.length - 1];
      lastConc.evidenceChain.push(...missingExps);
    }

    return { claim: currentResult.claim, conclusions: newConclusions };
  } catch (error) {
    console.warn("[Verify] 验证失败，返回原结果:", (error as Error)?.message);
    return currentResult;
  }
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

// ===== 轻量级论文类型分类（搜索结果用） =====

const ARTICLE_TYPES = [
  "研究论文", "综述", "系统综述", "Meta 分析", "RCT", "临床试验",
  "病例报告", "观察性研究", "生信/组学", "临床指南", "其他",
] as const;

export type ArticleType = typeof ARTICLE_TYPES[number];

const ClassifyResultSchema = z.object({
  classifications: z.array(z.object({
    index: z.number().describe("论文在列表中的索引（0-based）"),
    type: z.enum(ARTICLE_TYPES).describe("论文类型"),
  })).describe("每篇论文的分类结果"),
});

const CLASSIFY_TOOL = createToolFromSchema(
  "classify_papers",
  "Classify academic papers by type",
  ClassifyResultSchema,
);

const CLASSIFY_PROMPT = `You are an academic paper classifier. Classify each paper into ONE type.

Types:
- 研究论文: Original research with NEW experimental data
- 综述: Narrative review, overview, summary of existing literature (no new data)
- 系统综述: Systematic review (PRISMA, structured search protocol)
- Meta 分析: Statistical pooling of multiple studies
- RCT: Randomized controlled trial
- 临床试验: Non-randomized clinical study
- 病例报告: Case report or case series
- 观察性研究: Cohort, case-control, cross-sectional
- 生信/组学: Pure computational (scRNA-seq, GWAS, docking, network pharmacology)
- 临床指南: Clinical guideline or expert consensus
- 其他: Editorial, letter, erratum, etc.

Rules:
- Title is the PRIMARY signal. Abstract confirms.
- "X: a review" or "Recent advances in X" → 综述
- "meta-analysis" in title → Meta 分析
- "systematic review" in title → 系统综述
- If title has "review" but also "randomized/trial/experiment" → 研究论文 (NOT 综述)
- Default to 研究论文 if uncertain`;

/**
 * 轻量级论文类型批量分类
 *
 * 只用标题+摘要，一次 LLM 调用分类所有论文。
 * 比 regex 准确率高得多，比全文提取便宜得多。
 *
 * @param papers 论文列表（需包含 title 和 abstract）
 * @returns Map<索引, 文章类型>
 */
export async function classifyPaperTypes(
  papers: Array<{ title: string; abstract?: string | null }>
): Promise<Map<number, ArticleType>> {
  const result = new Map<number, ArticleType>();

  if (papers.length === 0) return result;

  try {
    const { getOpenAIClient, MODELS } = await import("@/lib/llm/client");
    const openai = getOpenAIClient();
    if (!openai) {
      console.warn("[Classify] OpenAI 客户端未配置");
      return result;
    }

    const model = MODELS.extraction;

    // 分批分类（每批 10 篇，减少单次 LLM 调用时间）
    const BATCH_SIZE = 10;
    for (let start = 0; start < papers.length; start += BATCH_SIZE) {
      const batch = papers.slice(start, start + BATCH_SIZE);
      const paperList = batch.map((p, i) =>
        `[${start + i}] ${p.title}\n${(p.abstract || "").slice(0, 300)}`
      ).join("\n\n");

      const response = await openai.chat.completions.create({
        model,
        max_tokens: 16384,
        temperature: 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...({ extra_body: { enable_thinking: false, thinking: false } } as any),
        messages: [
          { role: "system", content: "Output ONLY a JSON array. Do not think. Do not explain." },
          { role: "user", content: `Classify each paper. Use BOTH title and abstract.

KEY RULE: If abstract says "this review", "we review", "we summarize", "recent advances", "an overview" → it IS a review, even if title doesn't say so.

${paperList}

Types: 研究论文(has new data),综述(summarizes others),系统综述,Meta分析,RCT,临床试验,病例报告,观察性研究,生信/组学,临床指南,其他

[{"index":0,"type":"研究论文"}]` },
        ],
      });

      const text = response.choices?.[0]?.message?.content || "";
      const reasoning = (response.choices?.[0]?.message as any)?.reasoning_content || "";
      const fullText = text || reasoning;
      console.log(`[Classify] 批次 ${start}-${start + batch.length}: ${fullText.length}字, ${fullText.slice(0, 100)}`);

      const jsonMatch = fullText.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Array<{ index: number; type: string }>;
        for (const item of parsed) {
          if (typeof item.index === "number" && item.type) {
            // 模糊匹配（处理空格差异，如 "Meta分析" vs "Meta 分析"）
            const normalized = item.type.replace(/\s+/g, "");
            const matched = ARTICLE_TYPES.find(t => t.replace(/\s+/g, "") === normalized);
            if (matched) {
              result.set(item.index, matched);
            }
          }
        }
      }
    }

    console.log(`[Classify] 成功分类 ${result.size}/${papers.length} 篇`);
  } catch (error) {
    console.error("[Classify] 分类失败:", (error as Error)?.message);
  }

  return result;
}
