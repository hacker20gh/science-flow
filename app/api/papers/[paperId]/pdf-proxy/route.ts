import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

/**
 * GET /api/papers/{paperId}/pdf-proxy
 *
 * 代理下载论文 PDF（解决 PMC/Publisher CORS 问题）
 * 服务端下载 PDF 后流式返回给浏览器
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ paperId: string }> }
) {
  if (!prisma) {
    return new Response("数据库未配置", { status: 503 });
  }

  const { paperId } = await params;

  try {
    const paper = await prisma.paper.findUnique({
      where: { id: paperId },
      select: { id: true, pmid: true, doi: true, oaUrl: true, title: true },
    });

    if (!paper) {
      return new Response("论文不存在", { status: 404 });
    }

    // 尝试多个 PDF 来源
    const urls: string[] = [];

    // 1. PMC PDF
    if (paper.pmid) {
      try {
        const pmcRes = await fetch(
          `https://pmc.ncbi.nlm.nih.gov/tools/idconv/api/v1/articles/?ids=${paper.pmid}&format=json`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (pmcRes.ok) {
          const pmcData = await pmcRes.json();
          const pmcid = pmcData?.records?.[0]?.pmcid;
          if (pmcid) {
            // Europe PMC 直接 PDF（最可靠）
            urls.push(`https://europepmc.org/backend/ptpmcrender.fcgi?accid=${pmcid}&blobtype=pdf`);
            // PMC OA API 的 PDF（可能需要重定向）
            urls.push(`https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/pdf/`);
          }
        }
      } catch { /* ignore */ }
    }

    // 2. Unpaywall
    if (paper.doi) {
      try {
        const uwRes = await fetch(
          `https://api.unpaywall.org/v2/${encodeURIComponent(paper.doi)}?email=sciflow@research.ai`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (uwRes.ok) {
          const uwData = await uwRes.json();
          const pdfUrl = uwData?.best_oa_location?.url_for_pdf;
          if (pdfUrl) urls.unshift(pdfUrl);
        }
      } catch { /* ignore */ }
    }

    // 3. 原始 OA URL
    if (paper.oaUrl) {
      urls.push(paper.oaUrl);
    }

    // 逐个尝试下载
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            "Accept": "application/pdf,*/*",
          },
          signal: AbortSignal.timeout(30000),
          redirect: "follow",
        });

        if (!res.ok) continue;

        const contentType = res.headers.get("content-type") || "";
        if (contentType.includes("html")) continue; // Landing page, skip

        const buffer = await res.arrayBuffer();
        if (buffer.byteLength < 1000) continue;

        // 检查 PDF magic bytes
        const header = new Uint8Array(buffer.slice(0, 5));
        const isPdf = header[0] === 0x25 && header[1] === 0x50; // %P
        if (!isPdf) continue;

        return new Response(buffer, {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="${encodeURIComponent(paper.title || "paper")}.pdf"`,
            "Cache-Control": "public, max-age=86400",
          },
        });
      } catch {
        continue;
      }
    }

    return new Response("PDF 不可用", { status: 404 });
  } catch (error) {
    console.error("PDF proxy error:", error);
    return new Response("PDF 代理失败", { status: 500 });
  }
}
