/**
 * 学术搜索聚合器
 */

import { searchPubMed, type PubMedPaper } from "./pubmed";
import { searchSemanticScholar, type S2Paper } from "./semantic-scholar";
import { searchOpenAlex, type OpenAlexPaper } from "./openalex";
import { findOaPdf } from "./unpaywall";
import { checkBioRxiv } from "./biorxiv";

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
  const [pubmedResults, s2Results, openalexResults] = await Promise.allSettled([
    searchPubMed({ query: pubmedQuery || query, maxResults, minYear, maxYear, articleTypes }),
    searchSemanticScholar({
      query: s2Query || query,
      maxResults,
      minYear,
      maxYear,
      minCitationCount,
    }),
    searchOpenAlex({ query: openAlexQuery || query, maxResults, minYear, maxYear }),
  ]);

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

  // 排序
  sortPapers(deduped, sortBy);

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
      const oa = await findOaPdf(paper.doi!);
      paper.isOpenAccess = oa.isOpenAccess;
      paper.oaUrl = oa.bestOaUrl;
      paper.oaPdfUrl = oa.bestOaPdfUrl;
      paper.oaStatus = oa.oaStatus;
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
      // Semantic Scholar 默认按相关性，PubMed 默认按 relevance
      // 保持默认顺序（搜索结果已按相关性排列）
      break;
  }
}

// ---- Internal ----

function fromPubmed(p: PubMedPaper): UnifiedPaper {
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
    articleType: normalizeArticleType(p.publicationTypes),
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
 * PubMed 文献类型 → 科研人员易懂的中文标签
 */
const ARTICLE_TYPE_MAP: Record<string, string> = {
  "Journal Article": "研究论文",
  Review: "综述",
  "Meta-Analysis": "Meta 分析",
  "Systematic Review": "系统综述",
  "Clinical Trial": "临床试验",
  "Randomized Controlled Trial": "RCT",
  "Observational Study": "观察性研究",
  "Case Reports": "病例报告",
  "Preprint": "预印本",
  "Editorial": "社论",
  "Comment": "评论",
  Letter: "通信",
};

function normalizeArticleType(pubmedTypes: string[]): string {
  if (pubmedTypes.length === 0) return "研究论文";
  for (const pt of pubmedTypes) {
    const mapped = ARTICLE_TYPE_MAP[pt];
    if (mapped) return mapped;
  }
  return "研究论文";
}

/**
 * S2 publicationTypes → 中文标签
 */
const S2_TYPE_MAP: Record<string, string> = {
  "JournalArticle": "研究论文",
  "Review": "综述",
  "MetaAnalysis": "Meta 分析",
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
};

function normalizeS2ArticleType(types: string[]): string {
  if (!types || types.length === 0) return "研究论文";
  for (const t of types) {
    const mapped = S2_TYPE_MAP[t];
    if (mapped) return mapped;
  }
  return "研究论文";
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
  "grant": "基金",
  "report": "报告",
  "standard": "标准",
  "paratext": "辅助文本",
  "other": "其他",
};

function normalizeOpenAlexType(type: string): string {
  return OPENALEX_TYPE_MAP[type] || "研究论文";
}
