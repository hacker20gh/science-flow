import { NextRequest } from "next/server";
import { getLLMClient, MODELS, withLLMRetry } from "@/lib/llm/client";
import { buildRichContext, manageMessageBudget } from "@/lib/llm/context-builder";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db-server";
import { CHAT_TOOLS, executeTool } from "@/lib/llm/chat-tools";
import { trackTokenUsage } from "@/lib/token-tracker";

interface ChatMessage {
  role: "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image?: { data: string; type: string } }>;
}

interface ChatRequest {
  messages: ChatMessage[];
  projectContext?: {
    name: string;
    papers: string[];
    hypotheses: string[];
  };
  projectId?: string;
  conversationId?: string;
  attachment?: {
    name: string;
    data: string; // base64
    type: string; // MIME type
  };
  imageData?: {
    data: string; // base64
    type: string; // MIME type
  };
}

// 最多执行 N 轮工具调用，防止无限循环
const MAX_TOOL_ROUNDS = 5;

export async function POST(req: NextRequest) {
  const body: ChatRequest = await req.json();
  const { messages, projectContext, projectId, conversationId, attachment, imageData } = body;

  if (!messages || messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages required" }), { status: 400 });
  }

  // Parse PDF attachment if present
  let attachmentContext = "";
  if (attachment?.data && attachment?.type === "application/pdf") {
    try {
      const pdfParse = (await import("pdf-parse-new")).default;
      const buffer = Buffer.from(attachment.data, "base64");
      const pdfData = await pdfParse(buffer);
      attachmentContext = `\n\n## 用户上传的PDF文件: ${attachment.name}\n\n${pdfData.text.slice(0, 10000)}`;
    } catch (e) {
      console.warn("[chat] PDF parse failed:", e);
      attachmentContext = `\n\n## 用户上传了文件: ${attachment.name}（PDF 解析失败）`;
    }
  }

  const session = await auth().catch(() => null);
  const userId = session?.user?.id;

  // 构建系统提示
  let richContext = "";
  if (projectId) {
    try {
      const ctx = await buildRichContext(projectId);
      richContext = ctx.context;
    } catch (e) {
      console.warn("[chat] buildRichContext failed:", e);
    }
  }

  const systemPrompt = buildSystemPrompt(richContext || undefined, projectContext) + attachmentContext;

  // Token 预算管理
  const MESSAGE_BUDGET = 50_000;
  // Normalize content to string for manageMessageBudget
  const normalizedForBudget = messages.map((m) => ({
    role: m.role,
    content: typeof m.content === "string"
      ? m.content
      : Array.isArray(m.content)
        ? m.content.filter((b): b is { type: string; text: string } => b.type === "text").map((b) => b.text).join("\n")
        : String(m.content),
  }));
  const managed = manageMessageBudget(normalizedForBudget, MESSAGE_BUDGET);

  const client = getLLMClient();
  const encoder = new TextEncoder();
  let fullAssistantText = "";

  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        // 构建 Anthropic messages 格式
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let apiMessages: any[] = managed.messages.map((m, idx) => {
          // Last user message may include image data
          if (idx === managed.messages.length - 1 && m.role === "user" && imageData?.data) {
            return {
              role: m.role,
              content: [
                { type: "image", source: { type: "base64", media_type: imageData.type, data: imageData.data } },
                ...(typeof m.content === "string" ? [{ type: "text", text: m.content }] : []),
              ],
            };
          }
          return {
            role: m.role,
            content: m.content,
          };
        });

        let toolRound = 0;
        // Collect all tool calls across rounds for persistence
        const collectedToolCalls: Array<{ name: string; input: Record<string, unknown>; output: string }> = [];

        // 工具调用循环
        while (toolRound < MAX_TOOL_ROUNDS) {
          // 流式调用 LLM（同时处理 text 和 thinking 事件，兼容不同模型）
          const streamResponse = await client.messages.create({
            model: MODELS.chat,
            max_tokens: 4096,
            stream: true,
            system: systemPrompt,
            messages: apiMessages,
            tools: projectId ? CHAT_TOOLS : undefined,
          });

          let textContent = "";
          let thinkingContent = "";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const toolUseBlocks: any[] = [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let currentBlock: any = null;
          let chatInputTokens = 0;
          let chatOutputTokens = 0;
          let chatCachedTokens = 0;

          for await (const event of streamResponse) {
            if (event.type === "message_start") {
              const usage = event.message?.usage;
              if (usage) {
                chatInputTokens = usage.input_tokens || 0;
                chatCachedTokens = usage.cache_read_input_tokens || 0;
              }
            } else if (event.type === "message_delta") {
              const usage = event.usage;
              if (usage) chatOutputTokens = usage.output_tokens || 0;
            } else if (event.type === "content_block_start") {
              currentBlock = event.content_block;
            } else if (event.type === "content_block_delta") {
              if (event.delta.type === "text_delta") {
                textContent += event.delta.text;
                fullAssistantText += event.delta.text;
                emit({ type: "text", text: event.delta.text });
              } else if (event.delta.type === "thinking_delta") {
                thinkingContent += event.delta.thinking;
              }
            } else if (event.type === "content_block_stop") {
              if (currentBlock?.type === "tool_use") {
                toolUseBlocks.push(currentBlock);
              }
              currentBlock = null;
            }
          }

          // 记录 token 用量
          if (chatInputTokens > 0 || chatOutputTokens > 0) {
            trackTokenUsage({
              feature: "chat",
              model: MODELS.chat,
              inputTokens: chatInputTokens,
              outputTokens: chatOutputTokens,
              cachedTokens: chatCachedTokens,
            });
          }

          // 如果没有 text 但有 thinking（MIMO 等模型），用 thinking 作为可见回复
          if (!textContent && thinkingContent) {
            // 提取 thinking 中的最终回复（跳过推理过程）
            const reply = extractReplyFromThinking(thinkingContent);
            if (reply) {
              textContent = reply;
              fullAssistantText += reply;
              emit({ type: "text", text: reply });
            }
          }

          // 处理工具调用
          if (toolUseBlocks.length > 0) {
            const toolCalls = toolUseBlocks.map((b) => ({
              id: b.id,
              name: b.name,
              input: b.input as Record<string, unknown>,
            }));

            for (const tool of toolCalls) {
              emit({ type: "tool_use", tool: tool.name, input: tool.input, status: "executing" });
            }

            const toolResults = await Promise.all(
              toolCalls.map((tc) => executeTool(tc.name, tc.input, userId || "anonymous"))
            );

            for (let i = 0; i < toolCalls.length; i++) {
              emit({ type: "tool_result", tool: toolCalls[i].name, result: JSON.parse(toolResults[i].result), status: "done" });
              collectedToolCalls.push({
                name: toolCalls[i].name,
                input: toolCalls[i].input,
                output: toolResults[i].result,
              });
            }

            const assistantMessage = { role: "assistant" as const, content: [
              ...(textContent ? [{ type: "text" as const, text: textContent }] : []),
              ...toolUseBlocks,
            ] };
            const toolResultMessage = {
              role: "user" as const,
              content: toolCalls.map((tc, i) => ({
                type: "tool_result" as const,
                tool_use_id: tc.id,
                content: toolResults[i].result,
              })),
            };

            apiMessages = [...apiMessages, assistantMessage, toolResultMessage];
            toolRound++;
            continue;
          }

          // 没有工具调用，结束循环
          break;
        }

        emit({ type: "done" });

        // 保存消息到 DB
        if (projectId && userId && fullAssistantText) {
          const lastMsg = messages[messages.length - 1];
          const userText = lastMsg
            ? typeof lastMsg.content === "string"
              ? lastMsg.content
              : Array.isArray(lastMsg.content)
                ? lastMsg.content.filter((b): b is { type: string; text: string } => b.type === "text").map((b) => b.text).join("\n")
                : ""
            : undefined;
          saveMessages(
            projectId,
            userId,
            userText,
            fullAssistantText,
            collectedToolCalls.length > 0 ? collectedToolCalls : undefined,
            MODELS.chat,
            conversationId
          ).catch((e) => console.warn("[chat] Failed to save messages:", e));
        }
      } catch (error) {
        console.error("Chat error:", error);
        emit({ type: "error", message: "AI 服务暂时不可用，请稍后重试" });
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

async function saveMessages(
  projectId: string,
  userId: string,
  userContent: string | undefined,
  assistantContent: string,
  toolCalls?: Array<{ name: string; input: Record<string, unknown>; output: string }>,
  modelName?: string,
  conversationId?: string
) {
  if (!prisma) return;
  try {
    const baseData: Record<string, unknown> = {
      projectId,
      userId,
      ...(conversationId ? { conversationId } : {}),
    };
    const userData = userContent
      ? { ...baseData, role: "user" as string, content: userContent }
      : null;
    const assistantData: Record<string, unknown> = {
      ...baseData,
      role: "assistant",
      content: assistantContent,
    };
    if (toolCalls && toolCalls.length > 0) {
      assistantData.metadata = {
        tools: toolCalls,
        model: modelName,
      };
    }
    const data = userData ? [userData, assistantData] : [assistantData];
    await prisma.chatMessage.createMany({ data });
  } catch (e) {
    console.error("[chat] saveMessages error:", e);
  }
}

function buildSystemPrompt(
  richContext?: string,
  simpleContext?: ChatRequest["projectContext"]
): string {
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
- 保持科研严谨性
- 如果用户问到项目中的具体数据，引用提供的上下文中的信息
- 你可以使用工具来执行操作（搜索文献、查看数据等），主动帮用户完成任务`;

  if (richContext) {
    prompt += `\n\n${richContext}`;
  } else if (simpleContext) {
    prompt += `\n\n## 当前项目：${simpleContext.name}`;
    if (simpleContext.papers?.length > 0) {
      prompt += `\n\n项目中的文献：\n${simpleContext.papers.map((p) => `- ${p}`).join("\n")}`;
    }
    if (simpleContext.hypotheses?.length > 0) {
      prompt += `\n\n当前假设：\n${simpleContext.hypotheses.map((h) => `- ${h}`).join("\n")}`;
    }
  }

  return prompt;
}

/**
 * 从 thinking 内容中提取用户可见的回复
 *
 * MIMO 等模型有时只返回 thinking 块，没有 text 块。
 * 当 text 块为空时，从 thinking 中提取最终回复。
 */
function extractReplyFromThinking(thinking: string): string {
  if (!thinking || thinking.length < 20) return "";

  // 方法 1：找明确的回复标记
  const markers = [
    /(?:回复用户|回答用户|我的回复|以下是回复|我的回答)[：:\s]*([\s\S]+)$/i,
    /(?:reply|response|answer)[：:\s]*([\s\S]+)$/i,
  ];
  for (const marker of markers) {
    const match = thinking.match(marker);
    if (match && match[1].trim().length > 10) return match[1].trim();
  }

  // 方法 2：取最后一段（通常包含结论/回复）
  const paragraphs = thinking.split(/\n\s*\n/).filter((p) => p.trim());
  if (paragraphs.length > 0) {
    const last = paragraphs[paragraphs.length - 1].trim();
    // 如果最后一段够长（>30 字符），很可能是回复
    if (last.length > 30) return last;
  }

  // 方法 3：取最后 500 字符
  return thinking.slice(-500).trim();
}
