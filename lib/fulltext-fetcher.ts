/**
 * 全文获取服务
 *
 * 从多个 OA 来源尝试获取论文全文，优先级：
 * 1. PMC 全文 XML（最可靠，生物医学论文）
 * 2. Europe PMC 全文 XML
 * 3. CORE API（亿级 OA 论文库）
 * 4. Semantic Scholar openAccessPdf
 * 5. Unpaywall OA PDF
 * 6. arXiv（预印本）
 */

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export interface FullTextResult {
  text: string;
  source: string;
  url: string;
}

/**
 * 尝试从多个来源获取论文全文
 */
export async function fetchFullText(paper: {
  id: string;
  title?: string | null;
  doi?: string | null;
  pmid?: string | null;
  oaUrl?: string | null;
}): Promise<FullTextResult | null> {
  const sources: Array<{ name: string; fetch: () => Promise<FullTextResult | null> }> = [];

  // 1. PMC 全文（有 PMID 时）
  if (paper.pmid) {
    sources.push({
      name: "PMC",
      fetch: async () => {
        const pmcid = await getPMCID(paper.pmid!);
        if (!pmcid) return null;
        return fetchFromPMC(pmcid);
      },
    });
  }

  // 2. Europe PMC（有 PMID 或 DOI 时）
  if (paper.pmid || paper.doi) {
    sources.push({
      name: "EuropePMC",
      fetch: () => fetchFromEuropePMC(paper.pmid || null, paper.doi || null),
    });
  }

  // 3. CORE API（有 DOI 时）
  if (paper.doi) {
    sources.push({
      name: "CORE",
      fetch: () => fetchFromCORE(paper.doi!),
    });
  }

  // 4. Semantic Scholar（有 DOI 时）
  if (paper.doi) {
    sources.push({
      name: "SemanticScholar",
      fetch: () => fetchFromSemanticScholar(paper.doi!),
    });
  }

  // 5. Unpaywall（有 DOI 时）
  if (paper.doi) {
    sources.push({
      name: "Unpaywall",
      fetch: () => fetchFromUnpaywall(paper.doi!),
    });
  }

  // 6. 原始 OA URL
  if (paper.oaUrl) {
    sources.push({
      name: "oaUrl",
      fetch: () => fetchFromURL(paper.oaUrl!),
    });
  }

  for (const source of sources) {
    try {
      const result = await source.fetch();
      if (result && result.text.length > 500) {
        console.log(`[FullText] ✅ ${source.name}: ${result.text.length} 字符 (paper: ${paper.id.slice(0, 10)})`);
        return result;
      }
    } catch (err) {
      console.warn(`[FullText] ❌ ${source.name}: ${(err as Error).message}`);
    }
  }

  console.warn(`[FullText] 所有来源均失败: ${paper.id.slice(0, 10)} (${paper.title?.slice(0, 40)})`);
  return null;
}

// ===== 各来源实现 =====

/** 获取 PMC ID */
async function getPMCID(pmid: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?ids=${pmid}&format=json`,
      { signal: AbortSignal.timeout(10000), headers: { "User-Agent": USER_AGENT } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.records?.[0]?.pmcid || null;
  } catch {
    return null;
  }
}

/** 从 PMC 获取全文 */
async function fetchFromPMC(pmcid: string): Promise<FullTextResult | null> {
  // 尝试 PDF
  const pdfUrl = `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/pdf/`;
  const pdfResult = await fetchPDF(pdfUrl);
  if (pdfResult) return { ...pdfResult, source: "PMC-PDF" };

  // 尝试 XML
  const xmlUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`;
  const xmlResult = await fetchXML(xmlUrl);
  if (xmlResult) return { ...xmlResult, source: "PMC-XML" };

  return null;
}

/** 从 Europe PMC 获取全文 */
async function fetchFromEuropePMC(pmid: string | null, doi: string | null): Promise<FullTextResult | null> {
  // 先通过 Europe PMC 搜索获取 PMCID
  const query = pmid ? `EXT_ID:${pmid}` : `DOI:"${doi}"`;
  try {
    const searchRes = await fetch(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&resultType=core`,
      { signal: AbortSignal.timeout(15000), headers: { "User-Agent": USER_AGENT } }
    );
    if (!searchRes.ok) return null;
    const data = await searchRes.json();
    const result = data?.resultList?.result?.[0];
    const pmcid = result?.pmcid;
    if (!pmcid) return null;

    const xmlUrl = `https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`;
    return fetchXML(xmlUrl);
  } catch {
    return null;
  }
}

/** 从 CORE API 获取全文 */
async function fetchFromCORE(doi: string): Promise<FullTextResult | null> {
  try {
    // CORE API v3: 搜索 DOI 获取下载链接
    const searchRes = await fetch(
      `https://api.core.ac.uk/v3/search/works?q=doi:"${doi}"&limit=1`,
      {
        signal: AbortSignal.timeout(15000),
        headers: {
          "User-Agent": USER_AGENT,
        },
      }
    );
    if (!searchRes.ok) return null;
    const data = await searchRes.json();
    const work = data?.results?.[0];
    if (!work) return null;

    // 尝试下载 fullText
    const fullTextUrl = work.fullTextUrl || work.downloadUrl;
    if (fullTextUrl) {
      const result = await fetchFromURL(fullTextUrl);
      if (result) return { ...result, source: "CORE" };
    }

    // 如果有 links，尝试下载
    if (work.links?.length) {
      for (const link of work.links) {
        if (link.url) {
          const result = await fetchFromURL(link.url);
          if (result) return { ...result, source: "CORE" };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

/** 从 Semantic Scholar 获取全文 */
async function fetchFromSemanticScholar(doi: string): Promise<FullTextResult | null> {
  try {
    const res = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=openAccessPdf,externalIds`,
      { signal: AbortSignal.timeout(15000), headers: { "User-Agent": USER_AGENT } }
    );
    if (!res.ok) return null;
    const data = await res.json();

    const pdfUrl = data?.openAccessPdf?.url;
    if (pdfUrl) {
      const result = await fetchPDF(pdfUrl);
      if (result) return { ...result, source: "SemanticScholar" };
    }

    return null;
  } catch {
    return null;
  }
}

/** 从 Unpaywall 获取全文 */
async function fetchFromUnpaywall(doi: string): Promise<FullTextResult | null> {
  try {
    const res = await fetch(
      `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=sciflow@research.ai`,
      { signal: AbortSignal.timeout(10000), headers: { "User-Agent": USER_AGENT } }
    );
    if (!res.ok) return null;
    const data = await res.json();

    const pdfUrl = data?.best_oa_location?.url_for_pdf;
    if (pdfUrl) {
      const result = await fetchPDF(pdfUrl);
      if (result) return { ...result, source: "Unpaywall" };
    }

    const landingUrl = data?.best_oa_location?.url;
    if (landingUrl && landingUrl !== pdfUrl) {
      const result = await fetchFromURL(landingUrl);
      if (result) return { ...result, source: "Unpaywall" };
    }

    return null;
  } catch {
    return null;
  }
}

// ===== 底层工具函数 =====

/** 从 URL 获取 PDF */
async function fetchPDF(url: string): Promise<FullTextResult | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "application/pdf,*/*",
      },
      signal: AbortSignal.timeout(30000),
      redirect: "follow",
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("html")) return null; // Landing page, not PDF

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 1000) return null;

    // 检查 PDF magic bytes
    const header = buffer.slice(0, 5).toString();
    if (!header.startsWith("%PDF")) return null;

    const { parsePDF } = await import("@/lib/pdf-parser");
    const result = await parsePDF(buffer, "paper.pdf");
    if (result.text && result.text.trim().length > 500) {
      return { text: result.text, url, source: "PDF" };
    }
    return null;
  } catch {
    return null;
  }
}

/** 从 URL 获取任意内容（PDF 或 HTML） */
async function fetchFromURL(url: string): Promise<FullTextResult | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, "Accept": "application/pdf,*/*" },
      signal: AbortSignal.timeout(30000),
      redirect: "follow",
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 1000) return null;

    // PDF
    const header = buffer.slice(0, 5).toString();
    if (header.startsWith("%PDF")) {
      const { parsePDF } = await import("@/lib/pdf-parser");
      const result = await parsePDF(buffer, "paper.pdf");
      if (result.text && result.text.trim().length > 500) {
        return { text: result.text, url, source: "URL" };
      }
    }

    // HTML — 不处理（landing page）
    if (contentType.includes("html")) return null;

    return null;
  } catch {
    return null;
  }
}

/** 从 XML 提取纯文本 */
async function fetchXML(url: string): Promise<FullTextResult | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("xml") && !contentType.includes("text")) return null;

    const xml = await res.text();
    // XML → 纯文本：保留段落结构
    const text = xml
      // 段落/节标题 → 换行
      .replace(/<\/?(p|sec|body|abstract|title|h[1-6]|fig|table-wrap|list)[^>]*>/gi, "\n")
      // br → 换行
      .replace(/<br\s*\/?>/gi, "\n")
      // 其他标签 → 移除
      .replace(/<[^>]+>/g, " ")
      // 多个空行合并
      .replace(/\n{3,}/g, "\n\n")
      // 行内多余空格
      .replace(/[ \t]+/g, " ")
      // 每行 trim
      .split("\n")
      .map(line => line.trim())
      .join("\n")
      .trim();

    if (text.length > 500) {
      return { text, url, source: "XML" };
    }
    return null;
  } catch {
    return null;
  }
}
