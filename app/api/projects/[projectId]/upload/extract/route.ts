import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { extractFromText, smartTruncate } from "@/lib/llm/extraction";
import { prisma } from "@/lib/db-server";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

async function parsePdf(buffer: Buffer) {
  return pdfParse(buffer);
}

export async function POST(req: NextRequest) {
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
              await tx.extraction.create({
                data: {
                  paperId,
                  drugName: exp.drug_intervention?.name || null,
                  drugConc: exp.drug_intervention?.concentration || null,
                  duration: exp.drug_intervention?.duration || null,
                  coTreatment: exp.drug_intervention?.co_treatment || null,
                  cellLine: exp.model?.cell_line || null,
                  species: exp.model?.species || null,
                  passage: exp.model?.passage || null,
                  pathway: exp.pathway_effects?.[0]?.pathway || null,
                  pathwayDir: exp.pathway_effects?.[0]?.direction || null,
                  phenotype: exp.phenotype_effects?.[0]?.phenotype || null,
                  phenotypeDir: exp.phenotype_effects?.[0]?.direction || null,
                  method: exp.statistical_test || null,
                  expMethod: exp.pathway_effects?.[0]?.method || null,
                  conclusion: exp.conclusion || null,
                  rawText: exp.evidence_quote || null,
                  pathwayEffects: exp.pathway_effects || undefined,
                  phenotypeEffects: exp.phenotype_effects || undefined,
                  controls: exp.controls || undefined,
                  sampleSize: exp.sample_size || null,
                },
              });
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
