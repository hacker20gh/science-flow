import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { auth } from "@/lib/auth";
import { extractFromText, smartTruncate } from "@/lib/llm/extraction";
import { prisma } from "@/lib/db-server";
import { mapExtractionToDB, extractRelationalEffects } from "@/lib/extraction-mapper";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse-new");

async function parsePdf(buffer: Buffer) {
  return pdfParse(buffer);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const { projectId, paperId, fileName } = await req.json();

    if (!projectId || !fileName) {
      return Response.json({ error: "projectId 和 fileName 必填" }, { status: 400 });
    }

    const safeFileName = path.basename(fileName);
    const filePath = path.join(UPLOAD_DIR, projectId, safeFileName);
    const buffer = await readFile(filePath);
    const pdfData = await parsePdf(buffer);
    const fullText = pdfData.text;

    if (!fullText || fullText.length < 100) {
      return Response.json({ error: "PDF 文本内容过少，无法提取" }, { status: 400 });
    }

    const title = safeFileName.replace(/\.pdf$/i, "").replace(/_/g, " ");
    const truncatedText = smartTruncate(fullText);
    const extraction = await extractFromText(truncatedText, title);

    if (prisma && paperId && !paperId.startsWith("local-")) {
      try {
        // 验证 paper 属于当前项目
        const paper = await prisma.paper.findFirst({
          where: { id: paperId, projectId },
        });

        if (paper) {
          await prisma.$transaction(async (tx: any) => {
            for (const exp of extraction.experiments) {
              const record = await tx.extraction.create({
                data: mapExtractionToDB(exp, paperId),
              });

              // 创建关联的关系型通路/表型效果
              const { pathwayEffects, phenotypeEffects } = extractRelationalEffects(exp);

              if (pathwayEffects.length > 0) {
                await tx.pathwayEffect.createMany({
                  data: pathwayEffects.map(pe => ({
                    extractionId: record.id,
                    pathway: pe.pathway,
                    direction: pe.direction,
                    significance: pe.significance,
                    method: pe.method,
                  })),
                });
              }

              if (phenotypeEffects.length > 0) {
                await tx.phenotypeEffect.createMany({
                  data: phenotypeEffects.map(ph => ({
                    extractionId: record.id,
                    phenotype: ph.phenotype,
                    direction: ph.direction,
                    foldChange: ph.foldChange,
                  })),
                });
              }
            }

            await tx.timelineEvent.create({
              data: {
                projectId,
                type: "literature",
                title: `从本地 PDF 提取了 ${extraction.experiments.length} 条实验数据`,
                content: { paperId, fileName: safeFileName, count: extraction.experiments.length },
              },
            });
          });
        }
      } catch {
        // 数据库不可用时继续
      }
    }

    return Response.json({
      paperId,
      title,
      experiments: extraction.experiments,
      count: extraction.experiments.length,
    });
  } catch (error) {
    console.error("Extract from local PDF error:", error);
    return Response.json({ error: "提取失败" }, { status: 500 });
  }
}
