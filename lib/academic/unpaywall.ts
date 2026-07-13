/**
 * Unpaywall API 客户端
 *
 * 文档：https://unpaywall.org/products/api
 * 免费，需要 email 作为参数
 * 通过 DOI 查找论文的 Open Access PDF 链接
 */

import { sleep } from "@/lib/utils/sleep";

const BASE_URL = "https://api.unpaywall.org/v2";

export interface OaResult {
  doi: string;
  isOpenAccess: boolean;
  bestOaUrl: string | null;
  bestOaPdfUrl: string | null;
  oaStatus: string; // gold, green, hybrid, bronze, closed
}

/**
 * 通过 DOI 查询 Open Access PDF
 */
export async function findOaPdf(doi: string): Promise<OaResult> {
  const email = process.env.NCBI_EMAIL || "sciflow@example.com";

  const res = await fetch(`${BASE_URL}/${encodeURIComponent(doi)}?email=${email}`);

  if (res.status === 404) {
    return {
      doi,
      isOpenAccess: false,
      bestOaUrl: null,
      bestOaPdfUrl: null,
      oaStatus: "closed",
    };
  }

  if (!res.ok) {
    throw new Error(`Unpaywall failed: ${res.status}`);
  }

  const data = await res.json();

  return {
    doi,
    isOpenAccess: data.is_oa || false,
    bestOaUrl: data.best_oa_location?.url_for_landing_page || null,
    bestOaPdfUrl: data.best_oa_location?.url_for_pdf || null,
    oaStatus: data.oa_status || "closed",
  };
}

/**
 * 批量查询 DOI 的 OA 状态（并发 5 通道，200ms 延迟避免限流）
 */
export async function batchFindOa(
  dois: string[]
): Promise<Map<string, OaResult>> {
  const results = new Map<string, OaResult>();
  const CONCURRENCY = 5;
  let idx = 0;

  async function worker() {
    while (idx < dois.length) {
      const i = idx++;
      try {
        const result = await findOaPdf(dois[i]);
        results.set(dois[i], result);
      } catch {
        results.set(dois[i], {
          doi: dois[i],
          isOpenAccess: false,
          bestOaUrl: null,
          bestOaPdfUrl: null,
          oaStatus: "unknown",
        });
      }
      if (idx < dois.length) await sleep(200);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, dois.length) }, () => worker())
  );
  return results;
}
