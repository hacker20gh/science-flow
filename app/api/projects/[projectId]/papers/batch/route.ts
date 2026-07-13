import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

const MAX_BATCH_SIZE = 50;

interface BatchPaperInput {
  title: string;
  authors?: string[];
  journal?: string;
  year?: number;
  doi?: string | null;
  pmid?: string | null;
  abstract?: string | null;
  source?: string | null;
  oaUrl?: string | null;
  impactFactor?: number | null;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;

  try {
    const body = await req.json();
    const papers = body.papers as BatchPaperInput[] | undefined;

    if (!Array.isArray(papers) || papers.length === 0) {
      return Response.json({ error: "papers 数组必填且不能为空" }, { status: 400 });
    }

    if (papers.length > MAX_BATCH_SIZE) {
      return Response.json(
        { error: `单次最多保存 ${MAX_BATCH_SIZE} 篇文献` },
        { status: 400 }
      );
    }

    // Validate each paper has a title
    for (let i = 0; i < papers.length; i++) {
      if (!papers[i].title || typeof papers[i].title !== "string") {
        return Response.json(
          { error: `第 ${i + 1} 篇文献缺少 title` },
          { status: 400 }
        );
      }
    }

    // Collect DOIs to check for duplicates
    const doisToCheck = papers
      .map((p) => p.doi)
      .filter((doi): doi is string => !!doi);

    // Find existing papers with these DOIs in this project
    const existingByDoi = new Map<string, string>();
    if (doisToCheck.length > 0) {
      const existing = await prisma.paper.findMany({
        where: {
          projectId,
          doi: { in: doisToCheck },
        },
        select: { id: true, doi: true },
      });
      for (const p of existing) {
        if (p.doi) existingByDoi.set(p.doi, p.id);
      }
    }

    const created: Awaited<ReturnType<typeof prisma.paper.create>>[] = [];
    const skipped: BatchPaperInput[] = [];
    const toCreate: BatchPaperInput[] = [];

    for (const paper of papers) {
      if (paper.doi && existingByDoi.has(paper.doi)) {
        skipped.push(paper);
      } else {
        toCreate.push(paper);
      }
    }

    if (toCreate.length > 0) {
      await prisma.$transaction(async (tx: any) => {
        for (const paper of toCreate) {
          const p = await tx.paper.create({
            data: {
              projectId,
              title: paper.title,
              doi: paper.doi || null,
              pmid: paper.pmid || null,
              authors: paper.authors || [],
              journal: paper.journal || null,
              year: paper.year || null,
              impactFactor: paper.impactFactor || null,
              abstract: paper.abstract || null,
              source: paper.source || null,
              oaUrl: paper.oaUrl || null,
            },
          });
          created.push(p);
        }

        // Single timeline event for the batch
        await tx.timelineEvent.create({
          data: {
            projectId,
            type: "literature",
            title: `批量添加 ${created.length} 篇文献`,
            content: {
              count: created.length,
              skipped: skipped.length,
              source: toCreate[0]?.source || "batch",
            },
          },
        });
      });
    }

    return Response.json({
      created: created.length,
      skipped: skipped.length,
      papers: created,
      skippedPaperIds: Object.fromEntries(existingByDoi),
    });
  } catch (error: any) {
    if (error?.code === "P2002") {
      return Response.json({ error: "存在 DOI 重复的文献" }, { status: 409 });
    }
    console.error("Failed to batch create papers:", error);
    return Response.json({ error: "批量添加文献失败" }, { status: 500 });
  }
}
