import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";
import { requireAuth } from "@/lib/api-auth";

/**
 * GET /api/papers/{paperId}/fulltext
 * 返回论文全文（用于原文证据查看）
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ paperId: string }> }
) {
  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;

  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { paperId } = await params;

  try {
    const paper = await prisma.paper.findUnique({
      where: { id: paperId },
      select: { id: true, title: true, fullText: true, abstract: true, oaUrl: true, pmid: true, doi: true, project: { select: { userId: true } } },
    });

    if (!paper || paper.project.userId !== authResult.userId) {
      return Response.json({ error: "论文不存在" }, { status: 404 });
    }

    // pdfUrl 优先级：PMC PDF > oaUrl
    let pdfUrl: string | null = null;
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
            // 使用代理 URL，服务端下载 PDF 再返回给浏览器
            pdfUrl = `/api/papers/${paperId}/pdf-proxy`;
          }
        }
      } catch { /* ignore */ }
    }
    if (!pdfUrl && paper.oaUrl) {
      pdfUrl = paper.oaUrl;
    }

    return Response.json({
      fullText: paper.fullText || null,
      abstract: paper.abstract || null,
      hasFullText: !!paper.fullText,
      oaUrl: paper.oaUrl,
      pdfUrl,
    });
  } catch (error) {
    console.error("Failed to get paper fulltext:", error);
    return Response.json({ error: "获取全文失败" }, { status: 500 });
  }
}
