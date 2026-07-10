import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db-server";
import { auth } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

function sanitizeProjectId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50);
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "未登录" }, { status: 401 });
    }

    const formData = await req.formData();
    const rawProjectId = formData.get("projectId") as string;
    const file = formData.get("file") as File;

    if (!rawProjectId || !file) {
      return Response.json({ error: "projectId 和 file 必填" }, { status: 400 });
    }

    const projectId = sanitizeProjectId(rawProjectId);
    if (!projectId) {
      return Response.json({ error: "无效的 projectId" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return Response.json({ error: "只支持 PDF 文件" }, { status: 400 });
    }

    // 限制文件大小 50MB
    if (file.size > 50 * 1024 * 1024) {
      return Response.json({ error: "文件过大（最大 50MB）" }, { status: 400 });
    }

    const projectDir = path.join(UPLOAD_DIR, projectId);
    if (!existsSync(projectDir)) {
      await mkdir(projectDir, { recursive: true });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = path.join(projectDir, safeName);
    await writeFile(filePath, buffer);

    let fullText = "";
    let pageCount = 0;
    try {
      const pdfData = await pdfParse(buffer);
      fullText = pdfData.text;
      pageCount = pdfData.numpages;
    } catch {
      // PDF 解析失败不阻断
    }

    const title = safeName.replace(/\.pdf$/i, "").replace(/_/g, " ");

    let paperId = `local-${Date.now()}`;
    if (prisma) {
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
