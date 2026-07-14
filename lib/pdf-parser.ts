/**
 * PDF 解析客户端
 *
 * 优先使用 Docling 微服务（结构化 Markdown 输出）
 * 降级到 pdf-parse-new（纯文本输出）
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
let pdfParseFallback: ((buffer: Buffer) => Promise<{ text: string; numpages: number }>) | null = null;

const DOCLING_SERVICE_URL = process.env.DOCLING_SERVICE_URL || "http://localhost:8099";
const PARSE_TIMEOUT_MS = 60_000; // 60 秒

export interface ParseResult {
  text: string;
  pageCount: number;
  parser: "docling" | "pdf-parse";
  parseTimeMs: number;
}

/**
 * 解析 PDF 文件为结构化文本
 * 优先 Docling（保留表格/公式/多栏），降级到 pdf-parse-new
 */
export async function parsePDF(buffer: Buffer, filename?: string): Promise<ParseResult> {
  // 尝试 Docling 微服务
  try {
    return await parseWithDocling(buffer, filename);
  } catch (doclingError) {
    console.warn(
      `[PDF Parser] Docling 服务不可用，降级到 pdf-parse:`,
      (doclingError as Error)?.message
    );
  }

  // 降级：pdf-parse-new
  return parseWithPdfParse(buffer);
}

/**
 * 通过 Docling 微服务解析（保留表格结构）
 */
async function parseWithDocling(buffer: Buffer, filename?: string): Promise<ParseResult> {
  const start = Date.now();

  // 构建 FormData
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], { type: "application/pdf" });
  formData.append("file", blob, filename || "paper.pdf");

  const response = await fetch(`${DOCLING_SERVICE_URL}/parse`, {
    method: "POST",
    body: formData,
    signal: AbortSignal.timeout(PARSE_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Docling 服务返回 ${response.status}: ${errorBody}`);
  }

  const data = (await response.json()) as {
    success: boolean;
    text: string;
    textLength: number;
    parseTimeMs: number;
    error?: string;
  };

  if (!data.success) {
    throw new Error(data.error || "Docling 解析失败");
  }

  return {
    text: data.text,
    pageCount: 0, // Docling 不直接返回页数
    parser: "docling",
    parseTimeMs: Date.now() - start,
  };
}

/**
 * 通过 pdf-parse-new 解析（纯文本，降级方案）
 */
async function parseWithPdfParse(buffer: Buffer): Promise<ParseResult> {
  const start = Date.now();

  if (!pdfParseFallback) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    pdfParseFallback = (await import("pdf-parse-new")).default;
  }

  const pdfData = await pdfParseFallback(buffer);

  return {
    text: pdfData.text || "",
    pageCount: pdfData.numpages || 0,
    parser: "pdf-parse",
    parseTimeMs: Date.now() - start,
  };
}

/**
 * 检查 Docling 服务是否可用
 */
export async function checkDoclingHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${DOCLING_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}
