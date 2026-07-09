/**
 * 学术搜索聚合器
 *
 * 并行搜索多个学术数据库，合并去重，按相关性排序
 */

import { searchPubMed, type PubMedPaper } from "./pubmed";
import { searchSemanticScholar, type S2Paper } from "./semantic-scholar";
import { findOaPdf, type OaResult } from "./unpaywall";

// 统一的论文格式
export interface UnifiedPaper {
  // 标识
  pmid: string | null;
  doi: string | null;
  s2Id: string | null;

  // 基本信息
  title: string;
  authors: string[];
  journal: string;
  year: number;
  abstract: string;

  // 影响力
  citationCount: number;
  influenceScore: number | null;
  impactFactor: number | null; // TODO: 需要期刊 IF 数据库

  // OA 信息
  isOpenAccess: boolean;
  oaUrl: string | null;
  oaPdfUrl: string | null;
  oaStatus: string;

  // Semantic Scholar 独有
  tldr: string | null;

  // 来源标记
  sources: string[]; // ["pubmed", "semantic_scholar"]
}

interface SearchOptions {
  query: string;
  maxResults?: number; // 每个来源返回的最大结果数
  minYear?: number;
  maxYear?: number;
  minCitationCount?: number;
}

/**
 * 聚合搜索：并行搜索 PubMed + Semantic Scholar
 */
export async function aggregateSearch(
  options: SearchOptions
): Promise<UnifiedPaper[]> {
  const { query, maxResults = 20, minYear, maxYear, minCitationCount } = options;

  // 并行搜索两个来源
  const [pubmedResults, s2Results] = await Promise.allSettled([
    searchPubMed({ query, maxResults, minYear, maxYear }),
    searchSemanticScholar({
      query,
      maxResults,
      minYear,
      maxYear,
      minCitationCount,
    }),
  ]);

  const pubmedPapers =
    pubmedResults.status === "fulfilled" ? pubmedResults.value : [];
  const s2Papers =
    s2Results.status === "fulfilled" ? s2Results.value : [];

  // 转为统一格式
  const unified: UnifiedPaper[] = [
    ...pubmedPapers.map((p) => fromPubmed(p)),
    ...s2Papers.map((p) => fromS2(p)),
  ];

  // 合并去重（按 DOI > PMID > 标题相似度）
  const deduped = deduplicate(unified);

  // 按引用量排序（影响力优先）
  deduped.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));

  return deduped;
}

/**
 * 为论文补充 OA 信息
 */
export async function enrichWithOa(
  papers: UnifiedPaper[]
): Promise<UnifiedPaper[]> {
  // 只查有 DOI 且没有 OA 链接的论文
  const needOa = papers.filter((p) => p.doi && !p.oaPdfUrl);

  // 逐个查 Unpaywall（有速率限制，不做全量）
  for (const paper of needOa.slice(0, 10)) {
    try {
      const oa = await findOaPdf(paper.doi!);
      paper.isOpenAccess = oa.isOpenAccess;
      paper.oaUrl = oa.bestOaUrl;
      paper.oaPdfUrl = oa.bestOaPdfUrl;
      paper.oaStatus = oa.oaStatus;
    } catch {
      // 单个失败不影响整体
    }
  }

  return papers;
}

// ---- 内部函数 ----

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
    sources: ["semantic_scholar"],
  };
}

/**
 * 去重：按 DOI 优先，其次 PMID，最后标题模糊匹配
 */
function deduplicate(papers: UnifiedPaper[]): UnifiedPaper[] {
  const byDoi = new Map<string, UnifiedPaper>();
  const byPmid = new Map<string, UnifiedPaper>();
  const byTitle = new Map<string, UnifiedPaper>();
  const result: UnifiedPaper[] = [];
  const seen = new Set<string>();

  for (const paper of papers) {
    // 1. 按 DOI 去重
    if (paper.doi) {
      const key = paper.doi.toLowerCase();
      if (byDoi.has(key)) {
        // 合并信息
        mergePaper(byDoi.get(key)!, paper);
        continue;
      }
      byDoi.set(key, paper);
    }

    // 2. 按 PMID 去重
    if (paper.pmid) {
      if (byPmid.has(paper.pmid)) {
        mergePaper(byPmid.get(paper.pmid)!, paper);
        continue;
      }
      byPmid.set(paper.pmid, paper);
    }

    // 3. 按标题去重（归一化后比较）
    const titleKey = normalizeTitle(paper.title);
    if (byTitle.has(titleKey)) {
      mergePaper(byTitle.get(titleKey)!, paper);
      continue;
    }
    byTitle.set(titleKey, paper);

    if (!seen.has(titleKey)) {
      seen.add(titleKey);
      result.push(paper);
    }
  }

  return result;
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 100);
}

/**
 * 合并两个同一篇论文的信息（补充缺失字段）
 */
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
  if (!target.sources.includes(source.sources[0])) {
    target.sources.push(...source.sources);
  }
}
