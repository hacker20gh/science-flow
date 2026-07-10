import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

export async function POST(req: NextRequest) {
  const { projectId, paperId, pdfUrl, title } = await req.json();

  if (!projectId || !pdfUrl) {
    return Response.json({ error: "projectId 和 pdfUrl 必填" }, { status: 400 });
  }

  try {
    // 下载 PDF
    const response = await fetch(pdfUrl, {
      headers: { "User-Agent": "SciFlow-AI/1.0 (research tool)" },
    });

    if (!response.ok) {
      return Response.json({ error: `下载失败: ${response.status}` }, { status: 400 });
    }

    const contentType = response.headers.get("content-type");
    if (contentType && !contentType.includes("pdf")) {
      return Response.json({ error: "下载的文件不是 PDF 格式" }, { status: 400 });
    }

    const bytes = await response.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 确保目录存在
    const projectDir = path.join(UPLOAD_DIR, projectId);
    if (!existsSync(projectDir)) {
      await mkdir(projectDir, { recursive: true });
    }

    // 生成文件名
    const safeTitle = (title || "paper").replace(/[^a-zA-Z0-9._一-龥-]/g, "_").slice(0, 80);
    const fileName = `${safeTitle}.pdf`;
    const filePath = path.join(projectDir, fileName);

    // 保存文件
    await writeFile(filePath, buffer);

    // 提取文本
    let fullText = "";
    let pageCount = 0;
    try {
      const pdfData = await pdfParse(buffer);
      fullText = pdfData.text;
      pageCount = pdfData.numpages;
    } catch {
      // PDF 解析失败不阻断
    }

    // 更新数据库中的 Paper 记录
    if (process.env.DATABASE_URL && prisma && paperId) {
      try {
        await prisma.paper.update({
          where: { id: paperId },
          data: { fullText: fullText || null },
        });
      } catch {
        // Paper 可能不存在，忽略
      }
    }

    return Response.json({
      fileName,
      pageCount,
      textLength: fullText.length,
      localPath: `uploads/${projectId}/${fileName}`,
    });
  } catch (error) {
    console.error("Download PDF error:", error);
    return Response.json({ error: "下载失败" }, { status: 500 });
  }
}
