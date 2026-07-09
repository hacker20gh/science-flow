/**
 * 学术搜索聚合器
 */

import { searchPubMed, type PubMedPaper } from "./pubmed";
import { searchSemanticScholar, type S2Paper } from "./semantic-scholar";
import { searchOpenAlex, type OpenAlexPaper } from "./openalex";
import { findOaPdf } from "./unpaywall";

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
    maxResults = 20,
    minYear,
    maxYear,
    minCitationCount,
    sortBy = "relevance",
    articleTypes,
  } = options;

  // 并行搜索 3 个数据库
  const [pubmedResults, s2Results, openalexResults] = await Promise.allSettled([
    searchPubMed({ query, maxResults, minYear, maxYear, articleTypes }),
    searchSemanticScholar({
      query,
      maxResults,
      minYear,
      maxYear,
      minCitationCount,
    }),
    searchOpenAlex({ query, maxResults, minYear, maxYear }),
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
 * 为论文补充 OA 信息
 */
export async function enrichWithOa(
  papers: UnifiedPaper[]
): Promise<UnifiedPaper[]> {
  const needOa = papers.filter((p) => p.doi && !p.oaPdfUrl);

  for (const paper of needOa.slice(0, 10)) {
    try {
      const oa = await findOaPdf(paper.doi!);
      paper.isOpenAccess = oa.isOpenAccess;
      paper.oaUrl = oa.bestOaUrl;
      paper.oaPdfUrl = oa.bestOaPdfUrl;
      paper.oaStatus = oa.oaStatus;
    } catch {
      // ignore
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
    oaPdfUrl: null,
    oaStatus: p.isOpenAccess ? "gold" : "closed",
    tldr: p.tldr,
    articleType: "journal-article",
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
    articleType: "研究论文",
    sources: ["openalex"],
  };
}

function deduplicate(papers: UnifiedPaper[]): UnifiedPaper[] {
  const byKey = new Map<string, UnifiedPaper>();
  const result: UnifiedPaper[] = [];

  for (const paper of papers) {
    // 1. DOI 去重（最可靠）
    if (paper.doi) {
      const doiKey = `doi:${paper.doi.toLowerCase()}`;
      if (byKey.has(doiKey)) {
        mergePaper(byKey.get(doiKey)!, paper);
        continue;
      }
      byKey.set(doiKey, paper);
    }

    // 2. PMID 去重
    if (paper.pmid) {
      const pmidKey = `pmid:${paper.pmid}`;
      if (byKey.has(pmidKey)) {
        mergePaper(byKey.get(pmidKey)!, paper);
        continue;
      }
      byKey.set(pmidKey, paper);
    }

    // 3. 标题去重（归一化）
    const titleKey = `title:${normalizeTitle(paper.title)}`;
    if (byKey.has(titleKey)) {
      mergePaper(byKey.get(titleKey)!, paper);
      continue;
    }
    byKey.set(titleKey, paper);

    result.push(paper);
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
  if (source.citationCount > target.citationCount) {
    target.citationCount = source.citationCount;
  }
  if (source.influenceScore && source.influenceScore > (target.influenceScore ?? 0)) {
    target.influenceScore = source.influenceScore;
  }
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
  // 取第一个匹配的类型（PubMed 通常把最主要的类型放第一个）
  for (const pt of pubmedTypes) {
    const mapped = ARTICLE_TYPE_MAP[pt];
    if (mapped) return mapped;
  }
  return "研究论文"; // 默认
}
