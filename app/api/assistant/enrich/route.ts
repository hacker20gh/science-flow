import { NextRequest, NextResponse } from "next/server";
import type { AssistantCard } from "@/lib/assistant/process-assistant";
import { getLLMClient, MODELS, withLLMRetry } from "@/lib/llm/client";
import { prisma } from "@/lib/db-server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, cards } = body;

    if (!projectId || !cards || !Array.isArray(cards)) {
      return NextResponse.json({ error: "projectId and cards required" }, { status: 400 });
    }

    if (!prisma) {
      return NextResponse.json({ cards });
    }

    // 获取项目上下文
    const [project, extractions, experiments] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      }),
      prisma.extraction.findMany({
        where: { paper: { projectId } },
        select: {
          pathway: true,
          pathwayDir: true,
          paper: { select: { title: true } },
        },
        take: 20,
      }),
      prisma.experiment.findMany({
        where: { projectId },
        select: { name: true, status: true },
        take: 5,
      }),
    ]);

    // 检测冲突
    const pathwayDirs = new Map<string, Set<string>>();
    for (const e of extractions) {
      if (e.pathway) {
        if (!pathwayDirs.has(e.pathway)) pathwayDirs.set(e.pathway, new Set());
        if (e.pathwayDir) pathwayDirs.get(e.pathway)!.add(e.pathwayDir);
      }
    }
    const conflicts: string[] = [];
    for (const [pathway, dirs] of pathwayDirs) {
      if (dirs.has("up") && dirs.has("down")) {
        conflicts.push(`${pathway} 上调/下调矛盾`);
      }
    }

    const paperMap = new Map<string, number>();
    for (const e of extractions) {
      const title = e.paper.title;
      paperMap.set(title, (paperMap.get(title) || 0) + 1);
    }

    // LLM 增强（服务端专属，安全导入 llm/client）
    const enrichedCards = cards as AssistantCard[];
    if (enrichedCards.length === 0) {
      return NextResponse.json({ cards: enrichedCards });
    }

    const enriched = await withLLMRetry(
      async () => {
        const client = getLLMClient();
        const papersSummary = Array.from(paperMap.entries())
          .map(([title, count]) => `${title}（${count} 条提取）`)
          .join("；");

        const prompt = `你是 SciFlow AI 的过程助手。根据项目状态，为以下建议卡片生成个性化的中文消息。

项目：${project?.name || "当前项目"}
文献：${papersSummary || "暂无"}
冲突：${conflicts.join("；") || "无"}
实验：${experiments.map((e: { name: string; status: string }) => `${e.name}[${e.status}]`).join("；") || "无"}

当前卡片：
${enrichedCards.map((c, i) => `${i + 1}. [${c.priority}] ${c.title}: ${c.message}`).join("\n")}

规则：
- 用中文回答
- 引用具体的文献名称和数据
- 建议要具体可执行
- 每条消息不超过 100 字
- 返回 JSON 数组，每个元素 { "id": 对应卡片 id, "message": "个性化消息" }`;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await client.messages.create({
          model: MODELS.extraction, // Haiku — 便宜快速
          max_tokens: 1024,
          messages: [{ role: "user", content: prompt }],
          _sciflowFeature: "preprocess",
        } as any) as import("@anthropic-ai/sdk/resources/messages").Message;

        const text = response.content
          .filter((b) => b.type === "text")
          .map((b: { text: string }) => b.text)
          .join("");

        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return null;
        return JSON.parse(jsonMatch[0]) as Array<{ id: string; message: string }>;
      },
      { label: "assistant-enrichment", maxRetries: 1 }
    ).catch(() => null);

    if (!enriched) {
      return NextResponse.json({ cards: enrichedCards });
    }

    const enrichedMap = new Map(enriched.map((e) => [e.id, e.message]));
    const result = enrichedCards.map((card) => {
      const aiMessage = enrichedMap.get(card.id);
      return aiMessage ? { ...card, message: aiMessage, enriched: true } : card;
    });

    return NextResponse.json({ cards: result });
  } catch (error) {
    console.error("Assistant enrichment error:", error);
    return NextResponse.json({ cards: [] });
  }
}
