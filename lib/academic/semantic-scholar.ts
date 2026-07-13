/**
 * Semantic Scholar API 客户端
 *
 * 文档：https://api.semanticscholar.org/api-docs/
 * 免费，无需 API Key（注册可提高速率限制：100 req/5min → 1 req/sec）
 * 注册地址：https://www.semanticscholar.org/product/api#api-key
 */

import { sleep } from "@/lib/utils/sleep";
import { withRetry, type RetryOptions } from "@/lib/utils/retry";

const BASE_URL = "https://api.semanticscholar.org/graph/v1";
const S2_API_KEY = process.env.S2_API_KEY;

function s2Headers(): HeadersInit {
  const headers: HeadersInit = {};
  if (S2_API_KEY) headers["x-api-key"] = S2_API_KEY;
  return headers;
}

/**
 * Semantic Scholar 专用重试策略：
 * - 429 限流 → 强制 5 秒延迟后重试（S2 限流窗口较长）
 * - 5xx / 网络错误 → 指数退避重试
 */
const S2_RETRY_OPTS: RetryOptions = {
  maxRetries: 2,
  baseDelay: 1000,
  retryOn: (error: unknown) => {
    if (!error || typeof error !== "object") return false;
    const err = error as Record<string, unknown>;
    const msg = typeof err.message === "string" ? err.message : "";
    // 429 / 5xx / 网络错误 → 重试
    if (msg.includes(": 429") || msg.includes(": 5")) return true;
    if (err.name === "AbortError" || err.name === "TimeoutError") return true;
    if (err.code === "ECONNRESET" || err.code === "ETIMEDOUT" || err.code === "ENOTFOUND") return true;
    if (msg.includes("fetch failed") || msg.includes("network")) return true;
    return false;
  },
};

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
  oaPdfUrl: string | null;
  tldr: string | null;
  publicationTypes: string[];
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
  "publicationTypes",
].join(",");

/**
 * 搜索 Semantic Scholar
 * 包含 10s 请求超时 + 自动重试（429 用 5s 延迟，其他用指数退避）
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

  return withRetry(async () => {
    const params = new URLSearchParams({
      query,
      limit: String(maxResults),
      fields: FIELDS,
    });

    if (minYear) params.set("year", `${minYear}-${maxYear || new Date().getFullYear()}`);
    if (minCitationCount) params.set("minCitationCount", String(minCitationCount));

    // 429 特殊处理：S2 限流窗口较长，强制等 5 秒
    const res = await fetch(`${BASE_URL}/paper/search?${params}`, {
      headers: s2Headers(),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 429) {
      await sleep(5000);
      const retry = await fetch(`${BASE_URL}/paper/search?${params}`, {
        headers: s2Headers(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!retry.ok) throw new Error(`S2 search failed after retry: ${retry.status}`);
      const retryData = await retry.json();
      return (retryData.data || []).map(mapS2Paper);
    }
    if (!res.ok) throw new Error(`S2 search failed: ${res.status}`);

    const data = await res.json();
    return (data.data || []).map(mapS2Paper);
  }, S2_RETRY_OPTS);
}

/**
 * 通过 DOI 或 PaperId 获取单篇论文详情
 */
export async function getPaperById(
  id: string,
  idType: "paperId" | "DOI" | "PMID" = "DOI"
): Promise<S2Paper | null> {
  return withRetry(async () => {
    const identifier = idType === "DOI" ? `DOI:${id}` :
                       idType === "PMID" ? `PMID:${id}` : id;

    const res = await fetch(`${BASE_URL}/paper/${identifier}?fields=${FIELDS}`, {
      headers: s2Headers(),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`S2 getPaper failed: ${res.status}`);

    const data = await res.json();
    return mapS2Paper(data);
  }, { ...S2_RETRY_OPTS, retryOn: (error: unknown) => {
    // 不重试 404（null 是正常返回值，已在上方处理）
    if (!error || typeof error !== "object") return false;
    const msg = (error as Record<string, unknown>).message;
    if (typeof msg === "string" && msg.includes(": 404")) return false;
    return S2_RETRY_OPTS.retryOn?.(error) ?? false;
  }});
}

/**
 * 获取论文的引用列表（用于找相关文献）
 */
export async function getCitations(
  paperId: string,
  maxResults: number = 10
): Promise<S2Paper[]> {
  return withRetry(async () => {
    const res = await fetch(
      `${BASE_URL}/paper/${paperId}/citations?fields=${FIELDS}&limit=${maxResults}`,
      { headers: s2Headers(), signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) throw new Error(`S2 citations failed: ${res.status}`);

    const data = await res.json();
    return (data.data || []).map((item: { citedPaper: Record<string, unknown> }) =>
      mapS2Paper(item.citedPaper)
    );
  }, S2_RETRY_OPTS);
}

/**
 * 获取论文的参考文献列表
 */
export async function getReferences(
  paperId: string,
  maxResults: number = 10
): Promise<S2Paper[]> {
  return withRetry(async () => {
    const res = await fetch(
      `${BASE_URL}/paper/${paperId}/references?fields=${FIELDS}&limit=${maxResults}`,
      { headers: s2Headers(), signal: AbortSignal.timeout(10_000) }
    );
    if (!res.ok) throw new Error(`S2 references failed: ${res.status}`);

    const data = await res.json();
    return (data.data || []).map((item: { citedPaper: Record<string, unknown> }) =>
      mapS2Paper(item.citedPaper)
    );
  }, S2_RETRY_OPTS);
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
    oaUrl: raw.openAccessPdf?.url ?? null,
    oaPdfUrl: raw.openAccessPdf?.url || null,
    tldr: raw.tldr?.text || null,
    publicationTypes: raw.publicationTypes || [],
  };
}
