/**
 * LLM 搜索查询预处理（MIMO 兼容版）
 *
 * 为每个搜索后端生成独立的优化查询：
 * - PubMed：MeSH 词 + 字段标签
 * - Semantic Scholar：关键词语义搜索
 * - OpenAlex：概念过滤 + 全文搜索
 */

import { getLLMClient, MODELS, withLLMRetry } from "./client";
import { extractStructuredOutput, createRetryFunction } from "./json-extractor";
import { z } from "zod";

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
  optimizedQuery: z.string(),
  pubmedQuery: z.string(),
  s2Query: z.string(),
  openAlexQuery: z.string(),
  meshTerms: z.array(z.string()),
  searchIntent: z.string(),
  suggestedRefinements: z.array(z.string()),
  subQueries: z.array(SubQuerySchema).optional(),
});

// 10 分钟 TTL 缓存，带自动清理
const queryCache = new Map<string, { result: ProcessedQuery; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

// 每 5 分钟清理过期缓存（HMR-safe 防止重复注册）
const gQuery = globalThis as unknown as { __queryCacheCleanup?: ReturnType<typeof setInterval> };
if (!gQuery.__queryCacheCleanup) {
  gQuery.__queryCacheCleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of queryCache) {
      if (now - entry.ts >= CACHE_TTL) queryCache.delete(key);
    }
  }, 5 * 60 * 1000);
}

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
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.result;
  }

  try {
    const result = await withLLMRetry(async () => {
      const client = getLLMClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await client.messages.create({
        model: MODELS.extraction,
        max_tokens: 2048,
        system: PREPROCESS_PROMPT,
        messages: [{ role: "user", content: userInput }],
        _sciflowFeature: "preprocess",
      } as any) as import("@anthropic-ai/sdk/resources/messages").Message;

      return await extractStructuredOutput(response, ProcessedQuerySchema, {
        label: "query-preprocess",
        retryFn: createRetryFunction(client, {
          model: MODELS.extraction,
          maxTokens: 1024,
          system: PREPROCESS_PROMPT,
          userMessage: userInput,
          originalContent: userInput,
          schema: ProcessedQuerySchema,
          feature: "preprocess",
        }),
      });
    }, { label: "query-preprocess", maxRetries: 1 });

    // 写入缓存
    queryCache.set(cacheKey, { result, ts: Date.now() });
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
 */
export function fastPreprocess(userInput: string): ProcessedQuery {
  const isChinese = /[一-龥]/.test(userInput);
  const translated = isChinese ? simpleChineseTranslate(userInput) : userInput;

  return {
    optimizedQuery: translated,
    pubmedQuery: translated,
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
    "外泌体": "exosome",
    "环状RNA": "circular RNA circRNA",
    "长链非编码RNA": "lncRNA",
    "微小RNA": "microRNA miRNA",
    "甲基化": "methylation",
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
