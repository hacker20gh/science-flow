import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { extractFromText } from "@/lib/llm/extraction";
import { prisma } from "@/lib/db";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse");

async function parsePdf(buffer: Buffer) {
  return pdfParse(buffer);
}

export async function POST(req: NextRequest) {
  const { projectId, paperId, fileName } = await req.json();

  if (!projectId || !fileName) {
    return Response.json({ error: "projectId 和 fileName 必填" }, { status: 400 });
  }

  try {
    // 读取本地 PDF
    const filePath = path.join(UPLOAD_DIR, projectId, fileName);
    const buffer = await readFile(filePath);
    const pdfData = await parsePdf(buffer);
    const fullText = pdfData.text;

    if (!fullText || fullText.length < 100) {
      return Response.json({ error: "PDF 文本内容过少，无法提取" }, { status: 400 });
    }

    // 调用 LLM 提取
    const title = fileName.replace(/\.pdf$/i, "").replace(/_/g, " ");
    const extraction = await extractFromText(fullText.slice(0, 15000), title);

    // 保存提取结果到数据库
    if (process.env.DATABASE_URL && prisma && paperId && !paperId.startsWith("local-")) {
      try {
        for (const exp of extraction.experiments) {
          await prisma.extraction.create({
            data: {
              paperId,
              drugName: exp.drug_intervention.name,
              drugConc: exp.drug_intervention.concentration,
              cellLine: exp.model.cell_line,
              pathway: exp.pathway_effects[0]?.pathway,
              pathwayDir: exp.pathway_effects[0]?.direction,
              phenotype: exp.phenotype_effects[0]?.phenotype,
              phenotypeDir: exp.phenotype_effects[0]?.direction,
              method: exp.statistical_test,
              conclusion: exp.conclusion,
              rawText: exp.evidence_quote,
            },
          });
        }

        // 记录时间线
        await prisma.timelineEvent.create({
          data: {
            projectId,
            type: "literature",
            title: `从本地 PDF 提取了 ${extraction.experiments.length} 条实验数据`,
            content: { paperId, fileName, count: extraction.experiments.length },
          },
        });
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
