/**
 * Crossref API 客户端
 *
 * 免费、无需 API key、无速率限制（礼貌模式 50 req/s）。
 * 输入 DOI → 返回完整论文元数据。
 *
 * API 文档：https://api.crossref.org/swagger-files/index.html
 */

const CROSSREF_API_BASE = "https://api.crossref.org";

export interface CrossrefMetadata {
  doi: string;
  title: string;
  authors: Array<{ given?: string; family?: string; name?: string }>;
  journal?: string;
  year?: number;
  volume?: string;
  issue?: string;
  pages?: string;
  abstract?: string;
  url?: string;
  issn?: string;
  type?: string;
  isReferencedByCount?: number;
}

/**
 * 通过 DOI 解析论文元数据
 */
export async function resolveDOI(doi: string): Promise<CrossrefMetadata | null> {
  // 清理 DOI（去掉前缀）
  const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//i, "").replace(/^doi:/i, "").trim();
  if (!cleanDoi) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const resp = await fetch(
      `${CROSSREF_API_BASE}/works/${encodeURIComponent(cleanDoi)}`,
      {
        headers: {
          // 礼貌模式：提供邮箱让 Crossref 联系你（而非封 IP）
          "User-Agent": "SciFlow/1.0 (mailto:sciflow@example.com)",
        },
        signal: controller.signal,
      }
    );

    if (!resp.ok) return null;

    const data = await resp.json();
    const work = data.message;
    if (!work) return null;

    const title = Array.isArray(work.title) ? work.title[0] : work.title;
    const year = work.published?.["date-parts"]?.[0]?.[0]
      || work.issued?.["date-parts"]?.[0]?.[0]
      || undefined;

    return {
      doi: work.DOI || cleanDoi,
      title: title || "",
      authors: (work.author || []).map((a: { given?: string; family?: string; name?: string }) => ({
        given: a.given,
        family: a.family,
        name: a.name,
      })),
      journal: work["container-title"]?.[0] || undefined,
      year,
      volume: work.volume || undefined,
      issue: work.issue || undefined,
      pages: work.page || undefined,
      abstract: work.abstract
        ? work.abstract.replace(/<[^>]*>/g, "") // 去掉 HTML 标签
        : undefined,
      url: work.URL || undefined,
      issn: work.ISSN?.[0] || undefined,
      type: work.type || undefined,
      isReferencedByCount: work["is-referenced-by-count"] || undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 批量解析 DOI（带并发控制）
 */
export async function batchResolveDOIs(
  dois: string[],
  concurrency: number = 5
): Promise<Map<string, CrossrefMetadata>> {
  const results = new Map<string, CrossrefMetadata>();

  // 简单并发控制
  const queue = [...dois];
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const doi = queue.shift()!;
      const metadata = await resolveDOI(doi);
      if (metadata) results.set(doi, metadata);
      // 礼貌延迟（200ms，远低于 50 req/s 限制）
      await new Promise((r) => setTimeout(r, 200));
    }
  });

  await Promise.all(workers);
  return results;
}
