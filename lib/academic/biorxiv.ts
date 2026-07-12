/**
 * bioRxiv API 客户端
 *
 * 文档: https://www.biorxiv.org/content/biorxiv/developing
 * 免费，无需 API Key
 * 生物学/医学预印本，比正式发表快 3-6 个月
 *
 * bioRxiv API 限制：
 * - 搜索能力有限（不支持复杂查询）
 * - 更适合按分类浏览或获取特定 DOI 的详情
 * - 搜索用 Semantic Scholar 替代更好（S2 也收录 bioRxiv）
 *
 * 这里主要提供：通过 DOI 获取 bioRxiv 论文详情 + OA PDF 下载
 */

import { sleep } from "@/lib/utils/sleep";

const BASE_URL = "https://api.biorxiv.org/details/biorxiv";

export interface BioRxivPaper {
  doi: string;
  title: string;
  authors: string[];
  journal: string;
  year: number;
  abstract: string;
  category: string;
  pdfUrl: string;
  version: string;
}

/**
 * 通过 DOI 获取 bioRxiv 论文详情
 */
export async function getBioRxivByDoi(doi: string): Promise<BioRxivPaper | null> {
  const res = await fetch(`${BASE_URL}/${doi}`);

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`bioRxiv API failed: ${res.status}`);
  }

  const data = await res.json();
  const collection = data.collection;

  if (!collection || collection.length === 0) return null;

  const paper = collection[0];

  return {
    doi: paper.doi || "",
    title: paper.title || "",
    authors: (paper.authors || "").split(";").map((a: string) => a.trim()).filter(Boolean),
    journal: "bioRxiv",
    year: paper.date ? new Date(paper.date).getFullYear() : 0,
    abstract: paper.abstract || "",
    category: paper.category || "",
    pdfUrl: `https://www.biorxiv.org/content/${paper.doi}v${paper.version}.full.pdf`,
    version: paper.version || "1",
  };
}

/**
 * 批量检查 DOI 列表中哪些在 bioRxiv 上（并发 3 路，带间隔限速）
 */
export async function checkBioRxiv(
  dois: string[]
): Promise<Map<string, BioRxivPaper>> {
  const results = new Map<string, BioRxivPaper>();
  const CONCURRENCY = 3;
  const DELAY_BETWEEN = 200; // ms，防止突发请求触发限流
  let idx = 0;

  async function worker() {
    while (idx < dois.length) {
      const i = idx++;
      try {
        const paper = await getBioRxivByDoi(dois[i]);
        if (paper) results.set(dois[i], paper);
      } catch {
        // 单个失败不影响整体
      }
      // 请求间隔限速（最后一项无需等待）
      if (idx < dois.length) await sleep(DELAY_BETWEEN);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, dois.length) }, () => worker()));
  return results;
}
