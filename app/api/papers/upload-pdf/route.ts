import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";
import { auth } from "@/lib/auth";
import { parsePDF } from "@/lib/pdf-parser";

/**
 * POST /api/papers/upload-pdf
 *
 * 手动上传 PDF，提取全文并保存到 Paper.fullText
 * 同时将 PDF 文件保存到 Supabase Storage，供原文查看器使用
 * Body: FormData { paperId: string, file: File }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "未登录" }, { status: 401 });
    }

    const formData = await req.formData();
    const paperId = formData.get("paperId") as string;
    const doi = formData.get("doi") as string | null;
    const pmid = formData.get("pmid") as string | null;
    const file = formData.get("file") as File;

    if (!file) {
      return Response.json({ error: "file 必填" }, { status: 400 });
    }

    if (!paperId) {
      return Response.json({ error: "paperId 必填" }, { status: 400 });
    }

    if (!file.name.endsWith(".pdf")) {
      return Response.json({ error: "只支持 PDF 文件" }, { status: 400 });
    }

    // 限制 50MB
    if (file.size > 50 * 1024 * 1024) {
      return Response.json({ error: "文件过大（最大 50MB）" }, { status: 400 });
    }

    // 读取文件为 Buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 用 Docling（优先）或 pdf-parse-new 提取文本
    let fullText = "";
    let pageCount = 0;
    let parser = "pdf-parse";
    try {
      const parseResult = await parsePDF(buffer, file.name);
      fullText = parseResult.text;
      pageCount = parseResult.pageCount;
      parser = parseResult.parser;
      console.log(`[UploadPDF] 解析完成: ${parser}, ${fullText.length} 字符, ${parseResult.parseTimeMs}ms`);
    } catch (parseError) {
      console.error("[UploadPDF] PDF 解析失败:", parseError);
      return Response.json({ error: "PDF 解析失败，文件可能已损坏" }, { status: 400 });
    }

    if (!fullText.trim()) {
      return Response.json({ error: "PDF 中未提取到文字（可能是扫描件）" }, { status: 400 });
    }

    // 保存全文到 DB（支持用 paperId 或 DOI/PMID 查找论文）
    if (prisma) {
      try {
        // 先尝试直接用 paperId 查找
        let paper = null;
        try {
          paper = await prisma.paper.findUnique({ where: { id: paperId } });
        } catch {
          // paperId 可能不是 CUID，是 DOI/PMID 等
        }

        // 如果找不到，用 DOI 或 PMID 查找
        if (!paper && doi) {
          paper = await prisma.paper.findFirst({ where: { doi } });
        }
        if (!paper && pmid) {
          paper = await prisma.paper.findFirst({ where: { pmid } });
        }

        if (!paper) {
          return Response.json({ error: "论文记录不存在，请先保存文献" }, { status: 404 });
        }

        // 验证论文属于当前用户的项目
        const project = await prisma.project.findUnique({
          where: { id: paper.projectId },
          select: { userId: true },
        });
        if (!project || project.userId !== session.user.id) {
          return Response.json({ error: "无权修改该论文" }, { status: 403 });
        }

        // 上传 PDF 到 Supabase Storage
        let pdfUrl: string | null = null;
        try {
          const { getServerClient } = await import("@/lib/supabase");
          const supabase = getServerClient();
          const storagePath = `papers/${paper.id}/full-text.pdf`;
          const { error: uploadError } = await supabase.storage
            .from("sciflow")
            .upload(storagePath, buffer, {
              contentType: "application/pdf",
              upsert: true,
            });
          if (!uploadError) {
            const { data: urlData } = supabase.storage.from("sciflow").getPublicUrl(storagePath);
            pdfUrl = urlData?.publicUrl || null;
          } else {
            console.warn("[UploadPDF] Storage 上传失败（不影响全文保存）:", uploadError.message);
          }
        } catch (storageErr) {
          console.warn("[UploadPDF] Storage 错误（不影响全文保存）:", storageErr);
        }

        await prisma.paper.update({
          where: { id: paper.id },
          data: {
            fullText,
            // 如果有 pdfUrl，保存到 oaUrl（仅当 oaUrl 为空时）
            ...(pdfUrl && !paper.oaUrl ? { oaUrl: pdfUrl } : {}),
          },
        });

        return Response.json({
          success: true,
          paperId: paper.id,
          pageCount,
          textLength: fullText.length,
          parser,
          pdfUrl,
          preview: fullText.slice(0, 200) + "...",
        });
      } catch (dbError) {
        console.error("[UploadPDF] DB 保存失败:", dbError);
        return Response.json({ error: "保存全文失败" }, { status: 500 });
      }
    }

    return Response.json({
      success: true,
      pageCount,
      textLength: fullText.length,
      preview: fullText.slice(0, 200) + "...",
    });
  } catch (error) {
    console.error("[UploadPDF] 错误:", error);
    return Response.json({ error: "上传失败" }, { status: 500 });
  }
}
