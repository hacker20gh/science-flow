/**
 * OpenAlex API 客户端
 *
 * 文档: https://docs.openalex.org/
 * 免费、开放数据，无需 API Key
 * 覆盖全学科，元数据丰富（引用、机构、基金、OA 状态）
 */

const BASE_URL = "https://api.openalex.org";

export interface OpenAlexPaper {
  id: string;
  title: string;
  authors: string[];
  journal: string;
  year: number;
  abstract: string;
  doi: string | null;
  citationCount: number;
  isOpenAccess: boolean;
  oaUrl: string | null;
  oaPdfUrl: string | null;
  openAccessStatus: string;
  concept: string[];
  type: string; // article, review, etc.
}

interface SearchOptions {
  query: string;
  maxResults?: number;
  minYear?: number;
  maxYear?: number;
}

/**
 * 搜索 OpenAlex
 */
export async function searchOpenAlex(
  options: SearchOptions
): Promise<OpenAlexPaper[]> {
  const { query, maxResults = 20, minYear, maxYear } = options;

  const params = new URLSearchParams({
    search: query,
    per_page: String(maxResults),
    select: [
      "id",
      "title",
      "authorships",
      "primary_location",
      "publication_year",
      "abstract_inverted_index",
      "doi",
      "cited_by_count",
      "open_access",
      "best_oa_location",
      "concepts",
    ].join(","),
  });

  if (minYear || maxYear) {
    const from = minYear || 0;
    const to = maxYear || new Date().getFullYear();
    params.set("filter", `publication_year:${from}-${to}`);
  }

  const res = await fetch(`${BASE_URL}/works?${params}`);
  if (!res.ok) throw new Error(`OpenAlex search failed: ${res.status}`);

  const data = await res.json();
  return (data.results || []).map(mapOpenAlexPaper);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapOpenAlexPaper(raw: any): OpenAlexPaper {
  // OpenAlex 用 inverted index 存摘要，需要反向解析
  const abstract = reconstructAbstract(raw.abstract_inverted_index);

  // 作者提取
  const authors = (raw.authorships || [])
    .slice(0, 10) // 最多取 10 个作者
    .map((a: { author?: { display_name?: string } }) => a.author?.display_name)
    .filter(Boolean);

  // 期刊名
  const journal =
    raw.primary_location?.source?.display_name || "";

  // OA 信息 — 优先取 PDF URL，降级到落地页
  const oa = raw.open_access || {};
  const bestOaLocation = raw.best_oa_location || raw.primary_location || {};
  const oaPdfUrl = bestOaLocation.url_for_pdf || (oa.is_oa ? oa.oa_url : null);
  const oaUrl = bestOaLocation.landing_page_url || oa.oa_url || null;

  // 学科领域
  const concepts = (raw.concepts || [])
    .filter((c: { score?: number }) => (c.score || 0) > 0.3)
    .slice(0, 5)
    .map((c: { display_name?: string }) => c.display_name)
    .filter(Boolean);

  return {
    id: raw.id || "",
    title: raw.title || "",
    authors,
    journal,
    year: raw.publication_year || 0,
    abstract,
    doi: raw.doi?.replace("https://doi.org/", "") || null,
    citationCount: raw.cited_by_count || 0,
    isOpenAccess: oa.is_oa || false,
    oaUrl,
    oaPdfUrl,
    openAccessStatus: oa.oa_status || "closed",
    concept: concepts,
    type: raw.type || "article",
  };
}

/**
 * 从 OpenAlex inverted index 重建摘要
 * OpenAlex 用 inverted index 存摘要（词→位置列表），需要反向解析
 */
function reconstructAbstract(
  index: Record<string, number[]> | null | undefined
): string {
  if (!index || typeof index !== "object") return "";

  const wordPositions: Array<{ word: string; position: number }> = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) {
      wordPositions.push({ word, position: pos });
    }
  }

  wordPositions.sort((a, b) => a.position - b.position);
  return wordPositions.map((wp) => wp.word).join(" ");
}
