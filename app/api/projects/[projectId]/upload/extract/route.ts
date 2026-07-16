import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { auth } from "@/lib/auth";
import { extractFromText, smartTruncate, flattenConclusions } from "@/lib/llm/extraction";
import { validateExtraction } from "@/lib/llm/extraction-validator";
import { postProcessExtractions } from "@/lib/llm/extraction-postprocess";
import { prisma } from "@/lib/db-server";
import { mapExtractionToDB, extractRelationalEffects } from "@/lib/extraction-mapper";
import { requireProjectAccess } from "@/lib/api-auth";

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

    // 验证项目所有权
    const accessResult = await requireProjectAccess(projectId, session.user.id!);
    if ("error" in accessResult) return accessResult.error;

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
    const rawExtraction = await extractFromText(truncatedText, title);

    // 质量校验 + 后处理
    const validation = validateExtraction(rawExtraction);
    const extraction = validation.cleaned;

    if (prisma && paperId && !paperId.startsWith("local-")) {
      try {
        // 验证 paper 属于当前项目
        const paper = await prisma.paper.findFirst({
          where: { id: paperId, projectId },
        });

        if (paper) {
          // 按结论分组做后处理
          const processedConclusions = (extraction.conclusions || []).map(conc => {
            const processed = postProcessExtractions({ experiments: conc.evidenceChain });
            return { claim: conc.claim, evidenceChain: processed.experiments };
          }).filter(c => c.evidenceChain.length > 0);

          const flatExps = processedConclusions.flatMap((conc, i) =>
            conc.evidenceChain.map(exp => ({ ...exp, conclusionIndex: i, conclusionClaim: conc.claim }))
          );
          await prisma.$transaction(async (tx: any) => {
            for (const exp of flatExps) {
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

            const shortName = safeFileName.length > 25 ? safeFileName.slice(0, 25) + "…" : safeFileName;
            await tx.timelineEvent.create({
              data: {
                projectId,
                type: "literature",
                title: `从 PDF 提取了 ${flatExps.length} 条数据：${shortName}`,
                content: { paperId, fileName: safeFileName, count: flatExps.length },
              },
            });
          });
        }
      } catch {
        // 数据库不可用时继续
      }
    }

    const flatExperiments = flattenConclusions(extraction);
    return Response.json({
      paperId,
      title,
      experiments: flatExperiments,
      count: flatExperiments.length,
    });
  } catch (error) {
    console.error("Extract from local PDF error:", error);
    return Response.json({ error: "提取失败" }, { status: 500 });
  }
}
