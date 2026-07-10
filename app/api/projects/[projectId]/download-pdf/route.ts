import { NextRequest } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { prisma } from "@/lib/db-server";
import { auth } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse-new");

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

/** 验证 URL 是否安全（防 SSRF） */
function isAllowedUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "https:") return false;
    // 阻止访问内网地址
    const host = url.hostname;
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.startsWith("169.254.") ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      host.startsWith("172.") ||
      host.endsWith(".internal")
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** 清理 projectId 防止路径穿越 */
function sanitizeProjectId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 50);
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "未登录" }, { status: 401 });
    }

    const { projectId, paperId, pdfUrl, title } = await req.json();

    if (!projectId || !pdfUrl) {
      return Response.json({ error: "projectId 和 pdfUrl 必填" }, { status: 400 });
    }

    if (!isAllowedUrl(pdfUrl)) {
      return Response.json({ error: "不允许的 URL" }, { status: 400 });
    }

    const safeProjectId = sanitizeProjectId(projectId);
    if (!safeProjectId) {
      return Response.json({ error: "无效的 projectId" }, { status: 400 });
    }

    const response = await fetch(pdfUrl, {
      headers: { "User-Agent": "SciFlow-AI/1.0 (research tool)" },
      signal: AbortSignal.timeout(30000),
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

    // 限制文件大小 50MB
    if (buffer.length > 50 * 1024 * 1024) {
      return Response.json({ error: "文件过大" }, { status: 400 });
    }

    const projectDir = path.join(UPLOAD_DIR, safeProjectId);
    if (!existsSync(projectDir)) {
      await mkdir(projectDir, { recursive: true });
    }

    const safeTitle = (title || "paper").replace(/[^a-zA-Z0-9._一-龥-]/g, "_").slice(0, 80);
    const fileName = `${safeTitle}.pdf`;
    const filePath = path.join(projectDir, fileName);

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

    if (prisma && paperId) {
      try {
        await prisma.paper.update({
          where: { id: paperId },
          data: { fullText: fullText || null },
        });
      } catch {
        // Paper 可能不存在
      }
    }

    return Response.json({
      fileName,
      pageCount,
      textLength: fullText.length,
      localPath: `uploads/${safeProjectId}/${fileName}`,
    });
  } catch (error) {
    console.error("Download PDF error:", error);
    return Response.json({ error: "下载失败" }, { status: 500 });
  }
}
