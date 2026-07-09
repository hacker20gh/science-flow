/**
 * PubMed E-utilities API 客户端
 *
 * 文档：https://www.ncbi.nlm.nih.gov/books/NBK25497/
 * 免费，无需 API Key（注册 email 可提高速率限制）
 */

const BASE_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

export interface PubMedPaper {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  year: number;
  abstract: string;
  doi: string | null;
}

interface SearchOptions {
  query: string;
  maxResults?: number;
  minYear?: number;
  maxYear?: number;
}

/**
 * 搜索 PubMed
 * 返回 PMID 列表
 */
async function searchIds(
  query: string,
  maxResults: number,
  minYear?: number,
  maxYear?: number
): Promise<string[]> {
  let dateFilter = "";
  if (minYear || maxYear) {
    const from = minYear || "1900";
    const to = maxYear || new Date().getFullYear();
    dateFilter = ` AND ${from}:${to}[dp]`;
  }

  const params = new URLSearchParams({
    db: "pubmed",
    term: query + dateFilter,
    retmax: String(maxResults),
    retmode: "json",
    sort: "relevance",
  });

  const email = process.env.NCBI_EMAIL;
  if (email) params.set("email", email);

  const res = await fetch(`${BASE_URL}/esearch.fcgi?${params}`);
  if (!res.ok) throw new Error(`PubMed search failed: ${res.status}`);

  const data = await res.json();
  return data.esearchresult?.idlist ?? [];
}

/**
 * 通过 PMID 批量获取论文详情
 */
async function fetchDetails(pmids: string[]): Promise<PubMedPaper[]> {
  if (pmids.length === 0) return [];

  const params = new URLSearchParams({
    db: "pubmed",
    id: pmids.join(","),
    retmode: "xml",
    rettype: "abstract",
  });

  const email = process.env.NCBI_EMAIL;
  if (email) params.set("email", email);

  const res = await fetch(`${BASE_URL}/efetch.fcgi?${params}`);
  if (!res.ok) throw new Error(`PubMed fetch failed: ${res.status}`);

  const xml = await res.text();
  return parsePubmedXml(xml);
}

/**
 * 解析 PubMed XML 响应为结构化数据
 */
function parsePubmedXml(xml: string): PubMedPaper[] {
  const papers: PubMedPaper[] = [];

  // 简单 XML 解析（PubMed 的 XML 结构相对固定）
  const articleBlocks = xml.split("<PubmedArticle>").slice(1);

  for (const block of articleBlocks) {
    const pmid = extractTag(block, "PMID");
    const title = extractTag(block, "ArticleTitle");
    const abstract = extractTag(block, "AbstractText");
    const journal = extractTag(block, "Title") || extractTag(block, "MedlineTA");
    const yearStr = extractTag(block, "Year");
    const doi = extractDoi(block);

    const authors: string[] = [];
    const authorBlocks = block.split("<Author").slice(1);
    for (const ab of authorBlocks) {
      const lastName = extractTag(ab, "LastName");
      const initials = extractTag(ab, "Initials");
      if (lastName) {
        authors.push(initials ? `${lastName} ${initials}` : lastName);
      }
    }

    if (pmid && title) {
      papers.push({
        pmid,
        title: cleanXmlText(title),
        authors,
        journal: cleanXmlText(journal || ""),
        year: yearStr ? parseInt(yearStr) : 0,
        abstract: cleanXmlText(abstract || ""),
        doi,
      });
    }
  }

  return papers;
}

function extractTag(xml: string, tag: string): string | null {
  // 处理带属性的标签，如 <AbstractText Label="BACKGROUND">
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function extractDoi(xml: string): string | null {
  const idBlocks = xml.split("<ArticleId").slice(1);
  for (const block of idBlocks) {
    if (block.includes('IdType="doi"')) {
      const match = block.match(/>([^<]+)</);
      if (match) return match[1].trim();
    }
  }
  return null;
}

function cleanXmlText(text: string): string {
  return text
    .replace(/<[^>]+>/g, "") // 移除 XML 标签
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 主搜索函数：搜索 + 获取详情
 */
export async function searchPubMed(options: SearchOptions): Promise<PubMedPaper[]> {
  const { query, maxResults = 20, minYear, maxYear } = options;

  // 速率控制：PubMed 限制 3 req/s（无 API Key）
  const pmids = await searchIds(query, maxResults, minYear, maxYear);
  if (pmids.length === 0) return [];

  await sleep(350); // 速率限制

  return fetchDetails(pmids);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
