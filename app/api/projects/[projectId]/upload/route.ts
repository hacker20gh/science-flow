import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db-server";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

async function parsePdf(buffer: Buffer) {
  return pdfParse(buffer);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const projectId = formData.get("projectId") as string;
    const file = formData.get("file") as File;

    if (!projectId || !file) {
      return Response.json({ error: "projectId 和 file 必填" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return Response.json({ error: "只支持 PDF 文件" }, { status: 400 });
    }

    // 确保上传目录存在
    const projectDir = path.join(UPLOAD_DIR, projectId);
    if (!existsSync(projectDir)) {
      await mkdir(projectDir, { recursive: true });
    }

    // 保存 PDF 到本地
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = path.join(projectDir, safeName);
    await writeFile(filePath, buffer);

    // 提取 PDF 文本
    let fullText = "";
    let pageCount = 0;
    try {
      const pdfData = await parsePdf(buffer);
      fullText = pdfData.text;
      pageCount = pdfData.numpages;
    } catch {
      // PDF 解析失败不阻断流程
    }

    // 从文件名和 PDF 元数据推断标题
    const title = safeName.replace(/\.pdf$/i, "").replace(/_/g, " ");

    // 保存到数据库（如果可用）
    let paperId = `local-${Date.now()}`;
    if (process.env.DATABASE_URL && prisma) {
      try {
        const paper = await prisma.paper.create({
          data: {
            projectId,
            title,
            abstract: fullText.slice(0, 2000) || null,
            source: "local_upload",
            fullText: fullText || null,
          },
        });
        paperId = paper.id;
      } catch {
        // 数据库不可用时继续
      }
    }

    return Response.json({
      paperId,
      title,
      fileName: safeName,
      pageCount,
      textLength: fullText.length,
      preview: fullText.slice(0, 500),
    }, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return Response.json({ error: "上传失败" }, { status: 500 });
  }
}
