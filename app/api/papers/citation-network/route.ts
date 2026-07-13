import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getCitations, getReferences, type S2Paper } from "@/lib/academic/semantic-scholar";

/**
 * 引用网络发现 API
 *
 * 给定一批种子论文（通过 S2 paperId），发现它们的引用和被引论文，
 * 按"被种子论文提及的频次"排序，返回最相关的扩展论文。
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { paperIds, maxResults = 30 } = body;

    if (!paperIds || !Array.isArray(paperIds) || paperIds.length === 0) {
      return NextResponse.json(
        { error: "paperIds array is required" },
        { status: 400 }
      );
    }

    // 限制种子论文数量
    const seedIds = paperIds.slice(0, 5);
    const perSeedLimit = 15;

    // 并行获取每篇种子论文的引用和被引
    const allResults = await Promise.allSettled(
      seedIds.flatMap((id: string) => [
        getCitations(id, perSeedLimit),
        getReferences(id, perSeedLimit),
      ])
    );

    // 统计每篇论文被提及的频次
    const mentionCount = new Map<string, { paper: S2Paper; count: number }>();

    for (const result of allResults) {
      if (result.status !== "fulfilled") continue;
      for (const paper of result.value) {
        // 用 DOI 优先，其次 paperId；跳过两者都为空的情况
        const key = paper.doi || (paper.paperId ? paper.paperId : null);
        if (!key) continue;
        // 排除种子论文本身
        if (paper.paperId && seedIds.includes(paper.paperId)) continue;

        const existing = mentionCount.get(key);
        if (existing) {
          existing.count++;
        } else {
          mentionCount.set(key, { paper, count: 1 });
        }
      }
    }

    // 按提及频次排序，取 top N
    const sorted = [...mentionCount.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, maxResults);

    const papers = sorted.map((item) => ({
      paperId: item.paper.paperId,
      title: item.paper.title,
      authors: item.paper.authors,
      journal: item.paper.journal,
      year: item.paper.year,
      abstract: item.paper.abstract,
      doi: item.paper.doi,
      citationCount: item.paper.citationCount,
      influenceScore: item.paper.influenceScore,
      isOpenAccess: item.paper.isOpenAccess,
      oaPdfUrl: item.paper.oaPdfUrl,
      tldr: item.paper.tldr,
      mentionCount: item.count,
      sources: ["semantic_scholar"],
    }));

    return NextResponse.json({
      total: papers.length,
      papers,
      seedCount: seedIds.length,
    });
  } catch (error) {
    console.error("Citation network error:", error);
    return NextResponse.json(
      { error: "Failed to discover related papers" },
      { status: 500 }
    );
  }
}
