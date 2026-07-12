/**
 * Scite.ai API 客户端
 *
 * 提供论文的引用上下文：被多少论文"支持"（supporting）、"反对"（contrasting）、"提及"（mentioning）。
 * 需要 API Key（从 scite.ai 获取）。
 *
 * API 文档：https://scite.ai/api
 * 降级保护：未配置时所有函数返回 null。
 */

const SCITE_API_BASE = "https://api.scite.ai";

export interface SciteTallies {
  doi: string;
  supporting: number;
  contrasting: number;
  mentioning: number;
  total: number;
  /** 支持率 = supporting / (supporting + contrasting) */
  supportRatio: number;
}

/**
 * 获取论文的引用分类统计
 *
 * @param doi - 论文 DOI
 * @param apiKey - Scite API Key
 * @returns 引用统计，未配置时返回 null
 */
export async function getSciteTallies(doi: string, apiKey?: string): Promise<SciteTallies | null> {
  if (!apiKey) return null;

  const cleanDoi = doi.replace(/^https?:\/\/doi\.org\//i, "").replace(/^doi:/i, "").trim();
  if (!cleanDoi) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const resp = await fetch(`${SCITE_API_BASE}/tallies/${encodeURIComponent(cleanDoi)}`, {
      headers: { "x-api-key": apiKey },
      signal: controller.signal,
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    const supporting = data.supporting || 0;
    const contrasting = data.contrasting || 0;
    const mentioning = data.mentioning || 0;

    return {
      doi: cleanDoi,
      supporting,
      contrasting,
      mentioning,
      total: supporting + contrasting + mentioning,
      supportRatio: supporting + contrasting > 0
        ? supporting / (supporting + contrasting)
        : 1,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * 格式化引用统计为可读文本
 */
export function formatSciteSummary(tallies: SciteTallies): string {
  if (tallies.total === 0) return "暂无引用数据";

  const parts: string[] = [];
  if (tallies.supporting > 0) parts.push(`${tallies.supporting} 篇支持`);
  if (tallies.contrasting > 0) parts.push(`${tallies.contrasting} 篇反对`);
  if (tallies.mentioning > 0) parts.push(`${tallies.mentioning} 篇提及`);

  return parts.join(" · ");
}
