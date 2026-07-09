import { NextRequest } from "next/server";
import { getLLMClient, MODELS } from "@/lib/llm/client";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  projectContext?: {
    name: string;
    papers: string[];
    hypotheses: string[];
  };
}

export async function POST(req: NextRequest) {
  const body: ChatRequest = await req.json();
  const { messages, projectContext } = body;

  if (!messages || messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages required" }), {
      status: 400,
    });
  }

  const systemPrompt = buildSystemPrompt(projectContext);
  const client = getLLMClient();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const response = await client.messages.create({
          model: MODELS.chat,
          max_tokens: 4096,
          stream: true,
          system: systemPrompt,
          messages,
        });

        for await (const event of response) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "text", text: event.delta.text })}\n\n`)
            );
          }
        }

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
        );
      } catch (error) {
        console.error("Chat error:", error);
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", message: "AI 服务暂时不可用" })}\n\n`)
        );
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function buildSystemPrompt(ctx?: ChatRequest["projectContext"]): string {
  let prompt = `你是 SciFlow AI，一个嵌入在科研工作流中的 AI 研究助手。

你的角色：
- 帮助用户理解文献中的机制和结论
- 分析矛盾结果的可能原因
- 建议下一步实验设计
- 帮助撰写学术英语
- 解释统计方法和实验设计概念

规则：
- 用用户的语言回答
- 回答要准确、简洁
- 不确定的内容明确说"不确定"
- 引用用户项目中的文献作为依据
- 保持科研严谨性`;

  if (ctx) {
    prompt += `\n\n## 当前项目：${ctx.name}`;
    if (ctx.papers?.length > 0) {
      prompt += `\n\n项目中的文献：\n${ctx.papers.map((p) => `- ${p}`).join("\n")}`;
    }
    if (ctx.hypotheses?.length > 0) {
      prompt += `\n\n当前假设：\n${ctx.hypotheses.map((h) => `- ${h}`).join("\n")}`;
    }
  }

  return prompt;
}
