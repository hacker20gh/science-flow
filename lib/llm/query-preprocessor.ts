/**
 * LLM 搜索查询预处理（MIMO 兼容版）
 *
 * 为每个搜索后端生成独立的优化查询：
 * - PubMed：MeSH 词 + 字段标签
 * - Semantic Scholar：关键词语义搜索
 * - OpenAlex：概念过滤 + 全文搜索
 */

import { callExtractionLLM, MODELS, withLLMRetry } from "./client";
import { extractStructuredOutput } from "./json-extractor";
import { z } from "zod";
import { SearchCache } from "@/lib/cache";

export interface ProcessedQuery {
  optimizedQuery: string;
  pubmedQuery: string;
  s2Query: string;
  openAlexQuery: string;
  meshTerms: string[];
  searchIntent: string;
  suggestedRefinements: string[];
  /** 长文本拆分后的子查询（每个子查询覆盖一个独立的研究方面） */
  subQueries?: SubQuery[];
}

export interface SubQuery {
  /** 子查询的简短标签，如 "耐药机制"、"PD-1 联合治疗" */
  label: string;
  pubmedQuery: string;
  s2Query: string;
  openAlexQuery: string;
}

const SubQuerySchema = z.object({
  label: z.string(),
  pubmedQuery: z.string(),
  s2Query: z.string(),
  openAlexQuery: z.string(),
});

const ProcessedQuerySchema = z.object({
  optimizedQuery: z.string().optional().default(""),
  pubmedQuery: z.string(),
  s2Query: z.string(),
  openAlexQuery: z.string(),
  meshTerms: z.array(z.string()).default([]),
  searchIntent: z.string().default(""),
  suggestedRefinements: z.union([z.array(z.string()), z.string()]).default([]),
  subQueries: z.array(SubQuerySchema).optional(),
}).transform((data) => ({
  ...data,
  // 兼容：如果 suggestedRefinements 是字符串，转为数组
  suggestedRefinements: Array.isArray(data.suggestedRefinements)
    ? data.suggestedRefinements
    : data.suggestedRefinements ? [data.suggestedRefinements as string] : [],
  // 兼容：如果缺少 optimizedQuery，用 pubmedQuery 兜底
  optimizedQuery: data.optimizedQuery || data.pubmedQuery,
}));

const CACHE_TTL = 10 * 60 * 1000;
const queryCache = new SearchCache<ProcessedQuery>();

const PREPROCESS_PROMPT = `You are a biomedical literature search expert. Convert the user's research query into optimized search strategies for PubMed, Semantic Scholar, and OpenAlex.

RULES:
- If input is Chinese, translate all concepts to English for queries.
- pubmedQuery: use MeSH terms with field tags like [tiab], [MeSH], [Title]. Example: "hepatocellular carcinoma"[MeSH] AND "sorafenib"[tiab]
- s2Query: simple keyword search (no MeSH syntax).
- openAlexQuery: natural language terms with concepts.
- meshTerms: relevant MeSH descriptors in English.
- searchIntent / suggestedRefinements: use the same language as the input.

SUB-QUERY SPLITTING (IMPORTANT):
- If the input is a long paragraph, passage, or contains MULTIPLE distinct research aspects/questions, split it into 2-3 focused sub-queries.
- Each sub-query should cover ONE distinct aspect (e.g., "drug resistance mechanism", "PD-1 combination therapy", "immune cell infiltration").
- Each sub-query has its own label (short Chinese description), pubmedQuery, s2Query, openAlexQuery.
- If the input is short or focused on a single topic, subQueries should be an empty array [].
- The top-level pubmedQuery/s2Query/openAlexQuery should still be a COMBINED query covering the main theme.

Example: Input about "sorafenib resistance in HCC via tumor microenvironment and immune infiltration, also PD-1 combination"
→ subQueries: [
    { label: "sorafenib 耐药机制", pubmedQuery: "...", s2Query: "...", openAlexQuery: "..." },
    { label: "肿瘤微环境与免疫浸润", pubmedQuery: "...", s2Query: "...", openAlexQuery: "..." },
    { label: "PD-1 联合治疗", pubmedQuery: "...", s2Query: "...", openAlexQuery: "..." }
  ]

Return ONLY a valid JSON object. No markdown, no explanation.`;

export async function preprocessQuery(userInput: string): Promise<ProcessedQuery> {
  // 缓存命中直接返回
  const cacheKey = userInput.trim().toLowerCase();
  const cached = queryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const result = await withLLMRetry(async () => {
      const response = await callExtractionLLM({
        model: MODELS.extraction,
        maxTokens: 2048,
        system: PREPROCESS_PROMPT,
        messages: [{ role: "user", content: userInput }],
        feature: "preprocess",
      });

      return await extractStructuredOutput(response, ProcessedQuerySchema, {
        label: "query-preprocess",
        retryFn: async () => {
          // Debug: log raw response
          console.log("[query-preprocess] Raw response content:", JSON.stringify(response.content).slice(0, 500));
          return response;
        },
      });
    }, { label: "query-preprocess", maxRetries: 1 });

    // 写入缓存
    queryCache.set(cacheKey, result, CACHE_TTL);
    return result;
  } catch (error) {
    console.error("Query preprocessing failed:", error);
    return fallbackProcess(userInput);
  }
}

function fallbackProcess(userInput: string): ProcessedQuery {
  const isChinese = /[一-龥]/.test(userInput);

  if (isChinese) {
    // 简单中英关键词映射
    const translated = simpleChineseTranslate(userInput);
    return {
      optimizedQuery: translated,
      pubmedQuery: translated,
      s2Query: translated,
      openAlexQuery: translated,
      meshTerms: [],
      searchIntent: userInput,
      suggestedRefinements: ["建议使用英文关键词以获得更好的搜索结果"],
    };
  }

  return {
    optimizedQuery: userInput,
    pubmedQuery: userInput,
    s2Query: userInput,
    openAlexQuery: userInput,
    meshTerms: [],
    searchIntent: userInput,
    suggestedRefinements: [],
  };
}

/**
 * 快速模式：跳过 LLM 预处理，直接用原始查询
 * 中文输入走字典翻译，英文直接透传
 * 为每个搜索引擎生成略有不同的查询以提高精度
 */
export function fastPreprocess(userInput: string): ProcessedQuery {
  const isChinese = /[一-龥]/.test(userInput);
  const translated = isChinese ? simpleChineseTranslate(userInput) : userInput;

  // PubMed: add [tiab] field tags for better precision
  const terms = translated.split(/\s+AND\s+/i);
  const pubmedQuery = terms.length > 1
    ? terms.map(t => `(${t.trim()}[tiab])`).join(" AND ")
    : `${translated}[tiab]`;

  return {
    optimizedQuery: translated,
    pubmedQuery,
    s2Query: translated,
    openAlexQuery: translated,
    meshTerms: [],
    searchIntent: userInput,
    suggestedRefinements: isChinese ? ["⚡ 快速模式：使用智能搜索可获得更精准的 MeSH 词查询"] : [],
  };
}

/** 简单中英词典映射（常见生物医学术语） */
function simpleChineseTranslate(input: string): string {
  const dict: Record<string, string> = {
    "肝癌": "hepatocellular carcinoma",
    "肺癌": "lung cancer",
    "胃癌": "gastric cancer",
    "乳腺癌": "breast cancer",
    "结直肠癌": "colorectal cancer",
    "肿瘤": "tumor cancer",
    "免疫": "immune immunity",
    "微环境": "microenvironment",
    "耐药": "drug resistance",
    "机制": "mechanism",
    "信号通路": "signaling pathway",
    "转录因子": "transcription factor",
    "表观遗传": "epigenetic",
    "凋亡": "apoptosis",
    "增殖": "proliferation",
    "迁移": "migration",
    "侵袭": "invasion",
    "转移": "metastasis",
    // Cell death pathways
    "自噬": "autophagy",
    "铁死亡": "ferroptosis",
    "焦亡": "pyroptosis",
    "坏死性凋亡": "necroptosis",
    "细胞死亡": "cell death",
    // Metabolism & stress
    "糖酵解": "glycolysis",
    "氧化应激": "oxidative stress",
    "内质网应激": "endoplasmic reticulum stress",
    "线粒体": "mitochondria",
    // Stem cells & gene editing
    "血管生成": "angiogenesis",
    "干细胞": "stem cell",
    "肿瘤干细胞": "cancer stem cell",
    "CAR-T": "CAR-T",
    "CRISPR": "CRISPR",
    "基因编辑": "gene editing",
    "类器官": "organoid",
    // Omics & sequencing
    "单细胞测序": "single-cell sequencing",
    "单细胞": "single-cell",
    "RNA测序": "RNA sequencing",
    "转录组": "transcriptome",
    "蛋白质组": "proteomics",
    "代谢组": "metabolomics",
    // Microbiome
    "肠道菌群": "gut microbiota",
    "肠道微生物": "gut microbiome",
    // Immune checkpoints & cells
    "免疫检查点": "immune checkpoint",
    "PD-1": "PD-1",
    "PD-L1": "PD-L1",
    "CTLA-4": "CTLA-4",
    "T细胞": "T cell",
    "巨噬细胞": "macrophage",
    "Treg": "regulatory T cell",
    "NK细胞": "natural killer cell",
    // Clinical
    "生物标志物": "biomarker",
    "预后": "prognosis",
    "诊断": "diagnosis",
    "治疗": "therapy",
    "化疗": "chemotherapy",
    "放疗": "radiotherapy",
    "靶向治疗": "targeted therapy",
    "免疫治疗": "immunotherapy",
    "联合治疗": "combination therapy",
    // Drug delivery & biomaterials
    "药物递送": "drug delivery",
    "纳米粒子": "nanoparticle",
    "水凝胶": "hydrogel",
    "支架": "scaffold",
    "组织工程": "tissue engineering",
    // Animal models
    "动物模型": "animal model",
    "小鼠模型": "mouse model",
    "PDX": "patient-derived xenograft",
    // Diseases
    "类风湿关节炎": "rheumatoid arthritis",
    "阿尔茨海默病": "Alzheimer disease",
    "帕金森病": "Parkinson disease",
    "糖尿病": "diabetes",
    "动脉粥样硬化": "atherosclerosis",
    "心肌梗死": "myocardial infarction",
    "心力衰竭": "heart failure",
    "炎症": "inflammation",
    "纤维化": "fibrosis",
    "肝纤维化": "liver fibrosis",
    "肝硬化": "cirrhosis",
    "肾损伤": "kidney injury",
    "急性肺损伤": "acute lung injury",
    "败血症": "sepsis",
    "COVID-19": "COVID-19",
    "长新冠": "long COVID",
    // Molecular biology
    "蛋白质": "protein",
    "受体": "receptor",
    "配体": "ligand",
    "激酶": "kinase",
    "磷酸化": "phosphorylation",
    "泛素化": "ubiquitination",
    "乙酰化": "acetylation",
    // Signaling molecules & pathways
    "mTOR": "mTOR",
    "NF-κB": "NF-kB",
    "PI3K": "PI3K",
    "MAPK": "MAPK",
    "JAK-STAT": "JAK-STAT",
    "Wnt": "Wnt",
    "Notch": "Notch",
    "Hedgehog": "Hedgehog",
    "TGF-β": "TGF-beta",
    "VEGF": "VEGF",
    "EGFR": "EGFR",
    "HER2": "HER2",
    "BRCA": "BRCA",
    "TP53": "TP53",
    "KRAS": "KRAS",
    // Liquid biopsy & epigenetics
    "液体活检": "liquid biopsy",
    "循环肿瘤DNA": "circulating tumor DNA ctDNA",
    "外泌体": "exosome",
    "环状RNA": "circular RNA circRNA",
    "长链非编码RNA": "lncRNA",
    "微小RNA": "microRNA miRNA",
    "甲基化": "methylation",
    // Experimental methods
    "细胞系": "cell line",
    "体内实验": "in vivo",
    "体外实验": "in vitro",
  };

  let result = input;
  for (const [zh, en] of Object.entries(dict)) {
    result = result.replace(new RegExp(zh, "g"), en);
  }
  return result;
}
