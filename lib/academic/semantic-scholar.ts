/**
 * Semantic Scholar API 客户端
 *
 * 文档：https://api.semanticscholar.org/api-docs/
 * 免费，无需 API Key（注册可提高速率限制：100 req/5min）
 */

const BASE_URL = "https://api.semanticscholar.org/graph/v1";

export interface S2Paper {
  paperId: string;
  title: string;
  authors: string[];
  journal: string;
  year: number;
  abstract: string;
  doi: string | null;
  citationCount: number;
  influenceScore: number | null;
  isOpenAccess: boolean;
  oaUrl: string | null;
  tldr: string | null;
}

interface SearchOptions {
  query: string;
  maxResults?: number;
  minYear?: number;
  maxYear?: number;
  minCitationCount?: number;
}

const FIELDS = [
  "title",
  "authors",
  "year",
  "abstract",
  "venue",
  "citationCount",
  "influentialCitationCount",
  "isOpenAccess",
  "openAccessPdf",
  "externalIds",
  "tldr",
].join(",");

/**
 * 搜索 Semantic Scholar
 */
export async function searchSemanticScholar(
  options: SearchOptions
): Promise<S2Paper[]> {
  const {
    query,
    maxResults = 20,
    minYear,
    maxYear,
    minCitationCount,
  } = options;

  const params = new URLSearchParams({
    query,
    limit: String(maxResults),
    fields: FIELDS,
  });

  if (minYear) params.set("year", `${minYear}-${maxYear || new Date().getFullYear()}`);
  if (minCitationCount) params.set("minCitationCount", String(minCitationCount));

  const res = await fetch(`${BASE_URL}/paper/search?${params}`);
  if (!res.ok) {
    if (res.status === 429) {
      // 限流，等待后重试
      await sleep(5000);
      const retry = await fetch(`${BASE_URL}/paper/search?${params}`);
      if (!retry.ok) throw new Error(`S2 search failed after retry: ${retry.status}`);
      const retryData = await retry.json();
      return (retryData.data || []).map(mapS2Paper);
    }
    throw new Error(`S2 search failed: ${res.status}`);
  }

  const data = await res.json();
  return (data.data || []).map(mapS2Paper);
}

/**
 * 通过 DOI 或 PaperId 获取单篇论文详情
 */
export async function getPaperById(
  id: string,
  idType: "paperId" | "DOI" | "PMID" = "DOI"
): Promise<S2Paper | null> {
  const identifier = idType === "DOI" ? `DOI:${id}` :
                     idType === "PMID" ? `PMID:${id}` : id;

  const res = await fetch(`${BASE_URL}/paper/${identifier}?fields=${FIELDS}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`S2 getPaper failed: ${res.status}`);

  const data = await res.json();
  return mapS2Paper(data);
}

/**
 * 获取论文的引用列表（用于找相关文献）
 */
export async function getCitations(
  paperId: string,
  maxResults: number = 10
): Promise<S2Paper[]> {
  const res = await fetch(
    `${BASE_URL}/paper/${paperId}/citations?fields=${FIELDS}&limit=${maxResults}`
  );
  if (!res.ok) throw new Error(`S2 citations failed: ${res.status}`);

  const data = await res.json();
  return (data.data || []).map((item: { citedPaper: Record<string, unknown> }) =>
    mapS2Paper(item.citedPaper)
  );
}

/**
 * 获取论文的参考文献列表
 */
export async function getReferences(
  paperId: string,
  maxResults: number = 10
): Promise<S2Paper[]> {
  const res = await fetch(
    `${BASE_URL}/paper/${paperId}/references?fields=${FIELDS}&limit=${maxResults}`
  );
  if (!res.ok) throw new Error(`S2 references failed: ${res.status}`);

  const data = await res.json();
  return (data.data || []).map((item: { citedPaper: Record<string, unknown> }) =>
    mapS2Paper(item.citedPaper)
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapS2Paper(raw: any): S2Paper {
  return {
    paperId: raw.paperId || "",
    title: raw.title || "",
    authors: (raw.authors || []).map((a: { name: string }) => a.name),
    journal: raw.venue || "",
    year: raw.year || 0,
    abstract: raw.abstract || "",
    doi: raw.externalIds?.DOI || null,
    citationCount: raw.citationCount || 0,
    influenceScore: raw.influentialCitationCount ?? null,
    isOpenAccess: raw.isOpenAccess || false,
    oaUrl: raw.openAccessPdf?.url || null,
    tldr: raw.tldr?.text || null,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
