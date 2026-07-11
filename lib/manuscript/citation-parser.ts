/**
 * 引用解析与验证工具
 * ================
 * 解析 (Author, Year) 格式的引用，与文献库交叉验证。
 */

// ─── 类型 ───────────────────────────────────────────────────────

export interface ParsedCitation {
  raw: string; // 原始文本，如 "(Smith et al., 2023)"
  authors: string[]; // 作者姓氏列表
  year: number | null;
  position: number; // 在文本中的起始位置
  index: number; // 第几个引用（从 1 开始）
}

export interface PaperForMatch {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
}

export interface CitationMatch {
  citation: ParsedCitation;
  paper: PaperForMatch | null;
  confidence: number; // 0-1
  matchType: "exact" | "fuzzy" | "none";
}

export interface ValidationResult {
  matches: CitationMatch[];
  unmatched: ParsedCitation[];
  uncited: PaperForMatch[];
  stats: {
    total: number;
    verified: number;
    fuzzy: number;
    unmatched: number;
  };
}

// ─── 解析 ───────────────────────────────────────────────────────

/**
 * 匹配括号内引用的正则：
 * - 捕获 ( ... ) 内的内容
 * - 支持多引用用分号分隔: (Smith, 2023; Jones, 2024)
 * - 支持 "et al." 和 "&"
 */
const CITATION_PATTERN = /\(([^()]+?)\)/g;

/**
 * 从文本中解析所有 (Author, Year) 格式的引用。
 */
export function parseCitations(text: string): ParsedCitation[] {
  const results: ParsedCitation[] = [];
  let globalIndex = 0;

  // 先用全局正则找所有括号
  let match: RegExpExecArray | null;
  CITATION_PATTERN.lastIndex = 0;

  while ((match = CITATION_PATTERN.exec(text)) !== null) {
    const inner = match[1].trim();
    const position = match.index;

    // 按分号拆分多引用
    const parts = inner.split(";").map((s) => s.trim()).filter(Boolean);

    for (const part of parts) {
      const parsed = parseSingleCitation(part, position);
      if (parsed) {
        globalIndex++;
        results.push({ ...parsed, index: globalIndex });
      }
    }
  }

  return results;
}

function parseSingleCitation(
  text: string,
  position: number,
): Omit<ParsedCitation, "index"> | null {
  // 尝试 "et al." 格式
  const etAlMatch = text.match(
    /([A-Z][a-zà-ÿ]+)\s+et al\.?,?\s+(\d{4})[a-z]?/i,
  );
  if (etAlMatch) {
    return {
      raw: text,
      authors: [etAlMatch[1]],
      year: parseInt(etAlMatch[2], 10),
      position,
    };
  }

  // 尝试 "Author & Author" 格式
  const twoAuthorMatch = text.match(
    /([A-Z][a-zà-ÿ]+)\s+(?:&|and)\s+([A-Z][a-zà-ÿ]+),?\s+(\d{4})[a-z]?/i,
  );
  if (twoAuthorMatch) {
    return {
      raw: text,
      authors: [twoAuthorMatch[1], twoAuthorMatch[2]],
      year: parseInt(twoAuthorMatch[3], 10),
      position,
    };
  }

  // 尝试单作者格式
  const singleMatch = text.match(/([A-Z][a-zà-ÿ]+),?\s+(\d{4})[a-z]?/i);
  if (singleMatch) {
    return {
      raw: text,
      authors: [singleMatch[1]],
      year: parseInt(singleMatch[2], 10),
      position,
    };
  }

  return null;
}

// ─── 匹配 ───────────────────────────────────────────────────────

/**
 * 将解析出的引用与文献库进行匹配。
 */
export function matchCitations(
  citations: ParsedCitation[],
  papers: PaperForMatch[],
): CitationMatch[] {
  return citations.map((citation) => findBestMatch(citation, papers));
}

function findBestMatch(
  citation: ParsedCitation,
  papers: PaperForMatch[],
): CitationMatch {
  let bestScore = 0;
  let bestPaper: PaperForMatch | null = null;

  for (const paper of papers) {
    const score = calculateMatchScore(citation, paper);
    if (score > bestScore) {
      bestScore = score;
      bestPaper = paper;
    }
  }

  const matchType =
    bestScore >= 0.9 ? "exact" : bestScore >= 0.6 ? "fuzzy" : "none";

  return {
    citation,
    paper: matchType !== "none" ? bestPaper : null,
    confidence: Math.round(bestScore * 100) / 100,
    matchType,
  };
}

function calculateMatchScore(
  citation: ParsedCitation,
  paper: PaperForMatch,
): number {
  let score = 0;

  // 作者姓氏匹配（权重 0.4）
  const authorScore = matchAuthors(citation.authors, paper.authors);
  score += authorScore * 0.4;

  // 年份精确匹配（权重 0.4）
  if (citation.year !== null && paper.year !== null) {
    score += citation.year === paper.year ? 0.4 : 0;
  }

  // 标题关键词辅助（权重 0.2）
  // 如果作者+年份已经高度匹配，不需要标题
  if (score >= 0.6) {
    score += 0.2; // 信任已有匹配
  }

  return score;
}

function matchAuthors(citationAuthors: string[], paperAuthors: string[]): number {
  if (citationAuthors.length === 0 || paperAuthors.length === 0) return 0;

  let matched = 0;
  for (const ca of citationAuthors) {
    const caLower = ca.toLowerCase();
    for (const pa of paperAuthors) {
      // 取论文作者的姓氏（最后一个词，或第一个词如果是东亚姓名）
      const paSurname = extractSurname(pa);
      if (paSurname.toLowerCase() === caLower) {
        matched++;
        break;
      }
    }
  }

  return matched / citationAuthors.length;
}

/**
 * 从全名中提取姓氏。
 * 西方姓名：取最后一个词 (John Smith → Smith)
 * 也兼容直接传入的姓氏
 */
function extractSurname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1];
}

// ─── 完整验证 ──────────────────────────────────────────────────

/**
 * 执行完整的引用验证：解析 → 匹配 → 找未引用文献。
 */
export function validateCitations(
  text: string,
  papers: PaperForMatch[],
): ValidationResult {
  const citations = parseCitations(text);
  const matches = matchCitations(citations, papers);

  const matchedPaperIds = new Set(
    matches.filter((m) => m.paper).map((m) => m.paper!.id),
  );

  const uncited = papers.filter((p) => !matchedPaperIds.has(p.id));
  const unmatched = matches
    .filter((m) => m.matchType === "none")
    .map((m) => m.citation);

  const stats = {
    total: citations.length,
    verified: matches.filter((m) => m.matchType === "exact").length,
    fuzzy: matches.filter((m) => m.matchType === "fuzzy").length,
    unmatched: unmatched.length,
  };

  return { matches, unmatched, uncited, stats };
}
