/**
 * 学术搜索聚合器
 */

import { searchPubMed, type PubMedPaper } from "./pubmed";
import { searchSemanticScholar, type S2Paper } from "./semantic-scholar";
import { searchOpenAlex, type OpenAlexPaper } from "./openalex";
import { findOaPdf } from "./unpaywall";
import { checkBioRxiv } from "./biorxiv";
import { getCachedOA, setCachedOA } from "@/lib/cache";

/** 聚合搜索全局超时（毫秒） */
const AGGREGATOR_TIMEOUT = 15_000;

export interface UnifiedPaper {
  pmid: string | null;
  doi: string | null;
  s2Id: string | null;
  title: string;
  authors: string[];
  journal: string;
  year: number;
  abstract: string;
  citationCount: number;
  influenceScore: number | null;
  impactFactor: number | null;
  isOpenAccess: boolean;
  oaUrl: string | null;
  oaPdfUrl: string | null;
  oaStatus: string;
  tldr: string | null;
  articleType: string;
  sources: string[];
}

interface SearchOptions {
  query: string;
  pubmedQuery?: string;
  s2Query?: string;
  openAlexQuery?: string;
  maxResults?: number;
  minYear?: number;
  maxYear?: number;
  minCitationCount?: number;
  articleTypes?: string[];
  sortBy?: "relevance" | "citation" | "date" | "impact";
}

/**
 * 聚合搜索
 */
export async function aggregateSearch(
  options: SearchOptions
): Promise<UnifiedPaper[]> {
  const {
    query,
    pubmedQuery,
    s2Query,
    openAlexQuery,
    maxResults = 20,
    minYear,
    maxYear,
    minCitationCount,
    sortBy = "relevance",
    articleTypes,
  } = options;

  // 并行搜索 3 个数据库，每个用最适合的查询
  // 全局 15 秒超时：超时后返回已完成源的 partial results
  const pubmedPromise = searchPubMed({ query: pubmedQuery || query, maxResults, minYear, maxYear, articleTypes });
  const s2Promise = searchSemanticScholar({
    query: s2Query || query,
    maxResults,
    minYear,
    maxYear,
    minCitationCount,
    articleTypes,
  });
  const openalexPromise = searchOpenAlex({ query: openAlexQuery || query, maxResults, minYear, maxYear, articleTypes, minCitationCount });

  // 独立追踪每个 promise 的结果
  const results: Array<PromiseSettledResult<PubMedPaper[] | S2Paper[] | OpenAlexPaper[]> | null> = [null, null, null];
  const tracked = [
    pubmedPromise.then((v) => { results[0] = { status: "fulfilled", value: v }; return v; }),
    s2Promise.then((v) => { results[1] = { status: "fulfilled", value: v }; return v; }),
    openalexPromise.then((v) => { results[2] = { status: "fulfilled", value: v }; return v; }),
  ];

  // 等全部完成或超时
  await Promise.race([
    Promise.allSettled(tracked),
    new Promise<void>((resolve) => setTimeout(resolve, AGGREGATOR_TIMEOUT)),
  ]);

  // 将未完成的 promise 标记为 rejected（后续取值时会 fallback 到空数组）
  for (let i = 0; i < results.length; i++) {
    if (!results[i]) {
      results[i] = { status: "rejected", reason: new Error("timeout") };
    }
  }

  const [pubmedResults, s2Results, openalexResults] = results as [
    PromiseSettledResult<PubMedPaper[]>,
    PromiseSettledResult<S2Paper[]>,
    PromiseSettledResult<OpenAlexPaper[]>,
  ];

  const pubmedPapers =
    pubmedResults.status === "fulfilled" ? pubmedResults.value : [];
  const s2Papers =
    s2Results.status === "fulfilled" ? s2Results.value : [];
  const openalexPapers =
    openalexResults.status === "fulfilled" ? openalexResults.value : [];

  const unified: UnifiedPaper[] = [
    ...pubmedPapers.map((p) => fromPubmed(p)),
    ...s2Papers.map((p) => fromS2(p)),
    ...openalexPapers.map((p) => fromOpenAlex(p)),
  ];

  const deduped = deduplicate(unified);

  // 关键词推断：对类型为"研究论文"的论文，从标题/摘要检测更具体的类型
  for (const paper of deduped) {
    paper.articleType = inferArticleType(paper.title, paper.abstract, paper.articleType);
  }

  // 排序：如果有引用数过滤，满足条件的排前面，其余排后面（不删除）
  sortPapers(deduped, sortBy, minCitationCount);

  return deduped;
}

/**
 * 并发控制辅助函数
 */
async function parallelLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  const executing: Promise<void>[] = [];
  for (const item of items) {
    const p = fn(item).then(() => {
      executing.splice(executing.indexOf(p), 1);
    });
    executing.push(p);
    if (executing.length >= limit) await Promise.race(executing);
  }
  await Promise.all(executing);
}

/**
 * 为论文补充 OA 信息（并发 5 路）
 */
export async function enrichWithOa(
  papers: UnifiedPaper[]
): Promise<UnifiedPaper[]> {
  const needOa = papers.filter((p) => p.doi && !p.oaPdfUrl);

  await parallelLimit(needOa.slice(0, 50), 5, async (paper) => {
    try {
      // 检查 OA 缓存
      const cached = getCachedOA(paper.doi!);
      if (cached) {
        paper.isOpenAccess = cached.isOpenAccess;
        paper.oaPdfUrl = cached.oaPdfUrl;
        return;
      }
      const oa = await findOaPdf(paper.doi!);
      paper.isOpenAccess = oa.isOpenAccess;
      paper.oaUrl = oa.bestOaUrl;
      paper.oaPdfUrl = oa.bestOaPdfUrl;
      paper.oaStatus = oa.oaStatus;
      setCachedOA(paper.doi!, { isOpenAccess: oa.isOpenAccess, oaPdfUrl: oa.bestOaPdfUrl });
    } catch {
      // ignore
    }
  });

  return papers;
}

/**
 * 用 bioRxiv 补充预印本的 PDF 下载链接
 *
 * 对于没有 OA PDF 的论文，检查其 DOI 是否在 bioRxiv 上有预印本版本，
 * 如果有则补充 PDF URL。bioRxiv API 免费无需 key。
 */
export async function enrichWithBioRxiv(
  papers: UnifiedPaper[]
): Promise<UnifiedPaper[]> {
  // 只处理有 DOI 但没有 PDF 链接的论文
  const candidates = papers.filter((p) => p.doi && !p.oaPdfUrl);

  // 批量检查（限制数量避免请求过多）
  const doisToCheck = candidates.slice(0, 50).map((p) => p.doi!);
  if (doisToCheck.length === 0) return papers;

  let biorxivMap: Map<string, { pdfUrl: string; category: string }>;
  try {
    const fullMap = await checkBioRxiv(doisToCheck);
    biorxivMap = new Map();
    for (const [doi, paper] of fullMap) {
      biorxivMap.set(doi, { pdfUrl: paper.pdfUrl, category: paper.category });
    }
  } catch {
    // bioRxiv 查询失败不影响主流程
    return papers;
  }

  // 补充 bioRxiv PDF 链接
  for (const paper of candidates.slice(0, 50)) {
    const info = biorxivMap.get(paper.doi!);
    if (info) {
      paper.oaPdfUrl = info.pdfUrl;
      paper.isOpenAccess = true;
      paper.oaStatus = "green";
      if (!paper.sources.includes("biorxiv")) {
        paper.sources.push("biorxiv");
      }
      // 如果期刊字段为空，填入分类信息
      if (!paper.journal) {
        paper.journal = `bioRxiv (${info.category})`;
      }
    }
  }

  return papers;
}

function sortPapers(
  papers: UnifiedPaper[],
  sortBy: SearchOptions["sortBy"],
  minCitationCount?: number
): void {
  // 如果有引用数过滤，先按"是否满足阈值"分组（满足的排前面）
  // 再在每组内按 sortBy 排序
  if (minCitationCount && minCitationCount > 0) {
    const meetsThreshold = papers.filter((p) => (p.citationCount || 0) >= minCitationCount);
    const belowThreshold = papers.filter((p) => (p.citationCount || 0) < minCitationCount);
    sortGroup(meetsThreshold, sortBy);
    sortGroup(belowThreshold, sortBy);
    papers.length = 0;
    papers.push(...meetsThreshold, ...belowThreshold);
  } else {
    sortGroup(papers, sortBy);
  }
}

function sortGroup(
  papers: UnifiedPaper[],
  sortBy: SearchOptions["sortBy"]
): void {
  switch (sortBy) {
    case "citation":
      papers.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));
      break;
    case "date":
      papers.sort((a, b) => (b.year || 0) - (a.year || 0));
      break;
    case "impact":
      papers.sort(
        (a, b) =>
          (b.influenceScore ?? b.citationCount ?? 0) -
          (a.influenceScore ?? a.citationCount ?? 0)
      );
      break;
    case "relevance":
    default:
      // 多源论文加权：被多个数据库收录的论文更可靠
      papers.sort((a, b) => {
        const aScore = (a.sources?.length || 1) * 10 + (a.citationCount || 0) * 0.1;
        const bScore = (b.sources?.length || 1) * 10 + (b.citationCount || 0) * 0.1;
        return bScore - aScore;
      });
      break;
  }
}

// ---- Internal ----

/**
 * MeSH 描述词 → 文献类型（最可靠的分类信号）
 *
 * MeSH 是 NLM 人工标引的受控词表，准确率远高于关键词匹配。
 * 只匹配明确指示文献类型的 MeSH 词。
 */
const MESH_TYPE_MAP: Record<string, string> = {
  "Review": "综述",
  "Systematic Review": "系统综述",
  "Meta-Analysis": "Meta 分析",
  "Randomized Controlled Trial": "RCT",
  "Clinical Trial": "临床试验",
  "Clinical Trial, Phase I": "临床试验",
  "Clinical Trial, Phase II": "临床试验",
  "Clinical Trial, Phase III": "临床试验",
  "Clinical Trial, Phase IV": "临床试验",
  "Pragmatic Clinical Trial": "临床试验",
  "Adaptive Clinical Trial": "临床试验",
  "Case Reports": "病例报告",
  "Observational Study": "观察性研究",
  "Cohort Studies": "观察性研究",
  "Cross-Sectional Studies": "观察性研究",
  "Case-Control Studies": "观察性研究",
  "Practice Guideline": "临床指南",
  "Guideline": "临床指南",
  "Consensus": "临床指南",
  "Editorial": "社论",
  "Comment": "评论",
  "Letter": "通信",
  "Retraction of Publication": "撤稿论文",
  "Published Erratum": "勘误",
};

/** MeSH 类型优先级（越具体越优先） */
const MESH_PRIORITY: Record<string, number> = {
  "系统综述": 100,
  "Meta 分析": 95,
  "RCT": 90,
  "临床试验": 85,
  "病例报告": 80,
  "观察性研究": 75,
  "临床指南": 70,
  "综述": 65,
};

/**
 * 从 MeSH 术语中推断文献类型
 * 返回 null 表示 MeSH 中没有类型相关信息
 */
function classifyFromMesh(meshTerms: string[]): string | null {
  let bestType: string | null = null;
  let bestPriority = 0;
  for (const term of meshTerms) {
    const type = MESH_TYPE_MAP[term];
    if (type) {
      const priority = MESH_PRIORITY[type] ?? 0;
      if (priority > bestPriority) {
        bestType = type;
        bestPriority = priority;
      }
    }
  }
  return bestType;
}

function fromPubmed(p: PubMedPaper): UnifiedPaper {
  // 优先用 MeSH 分类（最可靠），其次用 PublicationType，最后兜底"研究论文"
  const meshType = classifyFromMesh(p.meshTerms);
  const pubType = normalizeArticleType(p.publicationTypes);
  // MeSH 有具体类型 → 用 MeSH；否则用 PublicationType
  const articleType = meshType || pubType;

  return {
    pmid: p.pmid,
    doi: p.doi,
    s2Id: null,
    title: p.title,
    authors: p.authors,
    journal: p.journal,
    year: p.year,
    abstract: p.abstract,
    citationCount: 0,
    influenceScore: null,
    impactFactor: null,
    isOpenAccess: false,
    oaUrl: null,
    oaPdfUrl: null,
    oaStatus: "unknown",
    tldr: null,
    articleType,
    sources: ["pubmed"],
  };
}

function fromS2(p: S2Paper): UnifiedPaper {
  return {
    pmid: null,
    doi: p.doi,
    s2Id: p.paperId,
    title: p.title,
    authors: p.authors,
    journal: p.journal,
    year: p.year,
    abstract: p.abstract,
    citationCount: p.citationCount,
    influenceScore: p.influenceScore,
    impactFactor: null,
    isOpenAccess: p.isOpenAccess,
    oaUrl: p.oaUrl,
    oaPdfUrl: p.oaPdfUrl || null,
    oaStatus: p.isOpenAccess ? "gold" : "closed",
    tldr: p.tldr,
    articleType: normalizeS2ArticleType(p.publicationTypes),
    sources: ["semantic_scholar"],
  };
}

function fromOpenAlex(p: OpenAlexPaper): UnifiedPaper {
  return {
    pmid: null,
    doi: p.doi,
    s2Id: null,
    title: p.title,
    authors: p.authors,
    journal: p.journal,
    year: p.year,
    abstract: p.abstract,
    citationCount: p.citationCount,
    influenceScore: null,
    impactFactor: null,
    isOpenAccess: p.isOpenAccess,
    oaUrl: p.oaUrl,
    oaPdfUrl: p.oaPdfUrl,
    oaStatus: p.openAccessStatus,
    tldr: null,
    articleType: normalizeOpenAlexType(p.type),
    sources: ["openalex"],
  };
}

/** 去重 + 合并（基于 DOI → PMID → 标题三级 key） */
export function deduplicate(papers: UnifiedPaper[]): UnifiedPaper[] {
  const byKey = new Map<string, UnifiedPaper>();
  const result: UnifiedPaper[] = [];

  for (const paper of papers) {
    // 1. Collect all keys this paper could match on
    const doiKey = paper.doi ? `doi:${paper.doi.toLowerCase()}` : null;
    const pmidKey = paper.pmid ? `pmid:${paper.pmid}` : null;
    const titleKey = `title:${normalizeTitle(paper.title)}`;

    // 2. Find the first existing entry that matches on any key
    const existing =
      (doiKey && byKey.get(doiKey)) ||
      (pmidKey && byKey.get(pmidKey)) ||
      byKey.get(titleKey);

    if (existing) {
      // Merge new data into the existing entry
      mergePaper(existing, paper);
      // Register any NEW keys so future papers can match via those keys
      if (doiKey && !byKey.has(doiKey)) byKey.set(doiKey, existing);
      if (pmidKey && !byKey.has(pmidKey)) byKey.set(pmidKey, existing);
      if (!byKey.has(titleKey)) byKey.set(titleKey, existing);
    } else {
      // New unique paper — register all keys and add to result
      if (doiKey) byKey.set(doiKey, paper);
      if (pmidKey) byKey.set(pmidKey, paper);
      byKey.set(titleKey, paper);
      result.push(paper);
    }
  }

  return result;
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 100);
}

function mergePaper(target: UnifiedPaper, source: UnifiedPaper): void {
  if (!target.doi && source.doi) target.doi = source.doi;
  if (!target.pmid && source.pmid) target.pmid = source.pmid;
  if (!target.s2Id && source.s2Id) target.s2Id = source.s2Id;
  if (!target.abstract && source.abstract) target.abstract = source.abstract;
  if (!target.tldr && source.tldr) target.tldr = source.tldr;
  if (!target.oaPdfUrl && source.oaPdfUrl) target.oaPdfUrl = source.oaPdfUrl;
  if (!target.oaUrl && source.oaUrl) target.oaUrl = source.oaUrl;

  // 文献类型合并：保留更具体的类型
  if (source.articleType && target.articleType !== source.articleType) {
    const targetPriority = TYPE_PRIORITY[target.articleType] ?? 0;
    const sourcePriority = TYPE_PRIORITY[source.articleType] ?? 0;
    if (sourcePriority > targetPriority) {
      target.articleType = source.articleType;
    }
  }

  // 引用数回填：取两者中较大值（忽略 0，避免 PubMed 的 0 覆盖 S2 的真实值）
  const effectiveSource = source.citationCount || 0;
  const effectiveTarget = target.citationCount || 0;
  if (effectiveSource > effectiveTarget) {
    target.citationCount = source.citationCount;
  }

  if (source.influenceScore && source.influenceScore > (target.influenceScore ?? 0)) {
    target.influenceScore = source.influenceScore;
  }

  // OA 状态合并：优先保留非 unknown 的值
  if (
    target.oaStatus === "unknown" &&
    source.oaStatus &&
    source.oaStatus !== "unknown"
  ) {
    target.oaStatus = source.oaStatus;
  }

  if (source.isOpenAccess) target.isOpenAccess = true;

  if (!target.sources.includes(source.sources[0])) {
    target.sources.push(...source.sources);
  }
}

/**
 * 文献类型优先级（越具体越优先）
 * RCT > 临床试验 > 病例报告 > 观察性研究 > 研究论文
 * 系统综述 > Meta 分析 > 综述 > 研究论文
 */
const TYPE_PRIORITY: Record<string, number> = {
  "RCT": 100,
  "系统综述": 95,
  "Meta 分析": 90,
  "临床试验": 85,
  "病例报告": 80,
  "观察性研究": 75,
  "综述": 70,
  "研究论文": 50,
  "预印本": 40,
  "会议论文": 30,
  "学位论文": 25,
  "专著": 20,
  "书章": 15,
  "社论": 10,
  "评论": 10,
  "通信": 10,
  "勘误": 5,
  "数据集": 5,
  "参考文献": 5,
  "其他": 0,
};

/**
 * PubMed 文献类型 → 科研人员易懂的中文标签
 */
const ARTICLE_TYPE_MAP: Record<string, string> = {
  "Journal Article": "研究论文",
  "Review": "综述",
  "Systematic Review": "系统综述",
  "Meta-Analysis": "Meta 分析",
  "Clinical Trial": "临床试验",
  "Randomized Controlled Trial": "RCT",
  "Observational Study": "观察性研究",
  "Case Reports": "病例报告",
  "Case Report": "病例报告",
  "Preprint": "预印本",
  "Editorial": "社论",
  "Comment": "评论",
  "Letter": "通信",
  "Practice Guideline": "临床指南",
  "Comparative Study": "比较研究",
  "Multicenter Study": "多中心研究",
  "Validation Study": "验证研究",
  "Evaluation Study": "评估研究",
  "Historical Article": "历史综述",
  "Twin Study": "双胞胎研究",
  "Retracted Publication": "撤稿论文",
  "Erratum": "勘误",
  "Dataset": "数据集",
  "Review Literature": "文献综述",
  "Research Support, N.I.H., Extramural": "研究论文",
  "Research Support, U.S. Gov't, P.H.S.": "研究论文",
};

function normalizeArticleType(pubmedTypes: string[]): string {
  if (pubmedTypes.length === 0) return "研究论文";
  let best = "研究论文";
  let bestPriority = 0;
  for (const pt of pubmedTypes) {
    const mapped = ARTICLE_TYPE_MAP[pt];
    if (mapped) {
      const priority = TYPE_PRIORITY[mapped] ?? 0;
      if (priority > bestPriority) {
        best = mapped;
        bestPriority = priority;
      }
    }
  }
  return best;
}

/**
 * S2 publicationTypes → 中文标签
 */
const S2_TYPE_MAP: Record<string, string> = {
  "JournalArticle": "研究论文",
  "Review": "综述",
  "MetaAnalysis": "Meta 分析",
  "SystematicReview": "系统综述",
  "ClinicalTrial": "临床试验",
  "CaseReport": "病例报告",
  "Editorial": "社论",
  "Letter": "通信",
  "Conference": "会议论文",
  "Dataset": "数据集",
  "EditorialContent": "社论",
  "Study": "研究论文",
  "Book": "专著",
  "BookSection": "书章",
  "Reference": "参考文献",
  "Retraction": "撤稿论文",
  "JournalArticle,Review": "综述",  // S2 sometimes concatenates
};

function normalizeS2ArticleType(types: string[]): string {
  if (!types || types.length === 0) return "研究论文";
  let best = "研究论文";
  let bestPriority = 0;
  for (const t of types) {
    const mapped = S2_TYPE_MAP[t];
    if (mapped) {
      const priority = TYPE_PRIORITY[mapped] ?? 0;
      if (priority > bestPriority) {
        best = mapped;
        bestPriority = priority;
      }
    }
  }
  return best;
}

/**
 * OpenAlex type → 中文标签
 */
const OPENALEX_TYPE_MAP: Record<string, string> = {
  "article": "研究论文",
  "review": "综述",
  "editorial": "社论",
  "letter": "通信",
  "erratum": "勘误",
  "dataset": "数据集",
  "book": "专著",
  "book-chapter": "书章",
  "proceedings-article": "会议论文",
  "reference-entry": "参考文献",
  "dissertation": "学位论文",
  "grant": "其他",
  "report": "报告",
  "standard": "其他",
  "paratext": "其他",
  "other": "其他",
  "monograph": "专著",
  "reference": "参考文献",
  "posted-content": "预印本",
  "journal-article": "研究论文",
  "peer-review": "同行评审",
  "component": "其他",
};

function normalizeOpenAlexType(type: string): string {
  return OPENALEX_TYPE_MAP[type] || "研究论文";
}

/**
 * 泛化类型集合 — 这些类型不够具体，可以被推断结果覆盖
 */
const GENERIC_TYPES = new Set(["研究论文", "Journal Article", "article", "其他", "Study"]);

/**
 * 基于标题/摘要关键词推断文献类型（增强版）
 *
 * 策略：
 * 1. API 已给出具体类型（如 S2 的 "Review"、PubMed 的 "Meta-Analysis"）→ 直接保留
 * 2. API 只给出泛化类型（"Journal Article"/"研究论文"）→ 尝试推断
 * 3. 推断采用"标题强命中优先"策略，避免摘要中的泛化描述导致误判
 */
/**
 * 基于标题关键词推断文献类型（极保守兜底）
 *
 * 仅在标题中有明确标识时才推断，不做摘要分析。
 * 主要分类由 LLM 在提取阶段完成（更准确），此函数仅处理搜索结果的初始展示。
 *
 * 规则：只匹配标题中的明确标识词，宁可漏判也不误判。
 */
export function inferArticleType(title: string, _abstract: string, currentType: string): string {
  if (!GENERIC_TYPES.has(currentType)) return currentType;

  // 标题明确命中 → 直接采纳（标题是作者自己写的，不会误判）
  if (/systematic\s+review/i.test(title)) return "系统综述";
  if (/meta[\s-]?analysis|metaanalysis|荟萃分析/i.test(title)) return "Meta 分析";
  if (/randomized\s+controlled\s+trial|randomised\s+controlled\s+trial/i.test(title)) return "RCT";
  if (/case\s+report|case\s+series/i.test(title)) return "病例报告";
  if (/practice\s+guideline|clinical\s+guideline|consensus\s+(?:statement|guideline)/i.test(title)) return "临床指南";
  if (/erratum|corrigendum|retraction/i.test(title)) return "勘误";
  // 中文标题
  if (/荟萃分析|Meta分析/.test(title)) return "Meta 分析";
  if (/系统综述/.test(title)) return "系统综述";
  if (/病例报告|病例系列/.test(title)) return "病例报告";

  // 综述：需要 "review of/on" 模式，且不含实验相关词
  if (/narrative\s+review|literature\s+review|scoping\s+review|mini[\s-]review/i.test(title)) return "综述";
  if (/^review\s*[:\-]/i.test(title)) return "综述";
  if (/研究进展|综述|最新进展|展望/.test(title)) return "综述";

  // 不做摘要推断 — 交给 LLM
  return currentType;
}
