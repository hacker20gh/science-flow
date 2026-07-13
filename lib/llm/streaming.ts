/**
 * 通用 SSE 流式工具（服务端专用）
 *
 * 封装 ReadableStream + SSE 格式，统一事件类型。
 * 供实验设计、论文组装、审稿模拟等重型 LLM 任务使用。
 *
 * 客户端 SSE 消费函数（consumeSSEStream）在 sse-consumer.ts 中。
 */

import OpenAI from "openai";
import { trackTokenUsage } from "@/lib/token-tracker";
import { getIsRetryMode, getOpenAIClient } from "./client";
import { startLLMGeneration, finishLLMGeneration, failLLMGeneration } from "./langfuse";
import type { SSEEvent } from "./sse-consumer";

export type { SSEEvent };

// ===== 创建 SSE Response =====

const encoder = new TextEncoder();

function emitEvent(controller: ReadableStreamDefaultController, event: SSEEvent) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
}

/**
 * 创建标准 SSE 流式 Response
 *
 * handler 函数接收 emit 回调，用于发送各种事件。
 * handler 完成后自动发送 done 事件。
 * handler 抛错时自动发送 error 事件。
 */
export function createSSEStream(
  handler: (emit: (event: SSEEvent) => void) => Promise<void>
): Response {
  const stream = new ReadableStream({
    async start(controller) {
      // 心跳保活：每 15 秒发送一次，防止代理超时
      const heartbeat = setInterval(() => {
        try {
          emitEvent(controller, { type: "heartbeat" });
        } catch {
          // controller 已关闭，忽略
        }
      }, 15_000);

      try {
        await handler((event) => emitEvent(controller, event));
        emitEvent(controller, { type: "done" });
      } catch (error) {
        console.error("[SSE] Stream error:", error);
        emitEvent(controller, {
          type: "error",
          message: error instanceof Error ? error.message : "处理失败，请重试",
        });
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
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

// ===== Anthropic → OpenAI 参数转换 =====

/** 将 Anthropic tool 定义转换为 OpenAI function 定义 */
function convertAnthropicToolsToOpenAI(
  tools: Array<{ name: string; description?: string; input_schema: Record<string, unknown> }>
): OpenAI.ChatCompletionCreateParams["tools"] {
  return tools.map((tool) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description || "",
      parameters: tool.input_schema,
    },
  }));
}

/** 将 Anthropic messages 转换为 OpenAI messages 格式 */
function convertAnthropicMessagesToOpenAI(
  messages: Array<Record<string, unknown>>
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const result: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  for (const msg of messages) {
    const role = msg.role as string;

    if (role === "user" || role === "assistant") {
      // 简单文本消息
      if (typeof msg.content === "string") {
        result.push({ role: role as "user" | "assistant", content: msg.content });
        continue;
      }

      // Anthropic content block 数组
      if (Array.isArray(msg.content)) {
        const textParts: string[] = [];
        for (const block of msg.content) {
          if (block.type === "text") {
            textParts.push(block.text);
          }
        }
        if (textParts.length > 0) {
          result.push({ role: role as "user" | "assistant", content: textParts.join("\n") });
        }
      }
    }
  }

  return result;
}

/**
 * 使用 OpenAI 兼容 API 进行流式调用（支持 tool_use）
 *
 * 将 Anthropic 格式的参数转换为 OpenAI 格式，
 * 将 OpenAI 的流式 chunk 转换为与 Anthropic 路径相同的 SSEEvent 和返回格式。
 */
async function streamOpenAI(
  openai: OpenAI,
  params: Record<string, unknown>,
  emit: (event: SSEEvent) => void
): Promise<{
  fullText: string;
  toolUseBlocks: Array<{ name: string; input: unknown }>;
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number };
}> {
  const model = (params.model as string) || "unknown";
  const maxTokens = (params.max_tokens as number) || 4096;
  const system = params.system as string | undefined;
  const anthropicMessages = (params.messages as Array<Record<string, unknown>>) || [];
  const anthropicTools = params.tools as Array<{ name: string; description?: string; input_schema: Record<string, unknown> }> | undefined;

  // 转换参数
  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (system) {
    openaiMessages.push({ role: "system", content: system });
  }
  openaiMessages.push(...convertAnthropicMessagesToOpenAI(anthropicMessages));

  const openaiTools = anthropicTools ? convertAnthropicToolsToOpenAI(anthropicTools) : undefined;

  // 发起流式请求
  const stream = await openai.chat.completions.create({
    model,
    max_tokens: maxTokens,
    messages: openaiMessages,
    ...(openaiTools ? { tools: openaiTools } : {}),
    stream: true,
  });

  let fullText = "";
  const toolUseBlocks: Array<{ name: string; input: unknown }> = [];

  // OpenAI tool_calls 累积缓冲（按 index）
  const toolCallBuffers: Map<number, { name: string; arguments: string }> = new Map();

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (!delta) continue;

    // 文本增量
    if (delta.content) {
      fullText += delta.content;
      emit({ type: "text", text: delta.content });
    }

    // 工具调用增量
    if (delta.tool_calls) {
      for (const toolCall of delta.tool_calls) {
        const idx = toolCall.index;
        const existing = toolCallBuffers.get(idx);

        if (toolCall.function?.name && !existing) {
          // 新工具调用开始
          toolCallBuffers.set(idx, {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments || "",
          });
        } else if (existing && toolCall.function?.arguments) {
          // 追加 JSON 片段
          existing.arguments += toolCall.function.arguments;
        }
      }
    }

    // 完成原因（可用于提前检测结束）
    if (chunk.choices[0]?.finish_reason === "tool_calls" || chunk.choices[0]?.finish_reason === "stop") {
      // 流结束，处理累积的 tool calls
      if (chunk.choices[0].finish_reason === "tool_calls") {
        for (const [, buffer] of toolCallBuffers) {
          try {
            const input = JSON.parse(buffer.arguments || "{}");
            toolUseBlocks.push({ name: buffer.name, input });
          } catch {
            // malformed tool input, skip
          }
        }
        toolCallBuffers.clear();
      }
    }
  }

  // 如果流结束但 tool_calls 未在 finish_reason 中处理（某些 API 不返回 finish_reason）
  if (toolCallBuffers.size > 0) {
    for (const [, buffer] of toolCallBuffers) {
      try {
        const input = JSON.parse(buffer.arguments || "{}");
        toolUseBlocks.push({ name: buffer.name, input });
      } catch {
        // malformed tool input, skip
      }
    }
    toolCallBuffers.clear();
  }

  return {
    fullText,
    toolUseBlocks,
    // OpenAI 流式模式不返回 usage（需要 stream_options），填 0 由上层追踪
    usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
  };
}

/**
 * 流式调用 LLM（Anthropic Messages API streaming）
 *
 * 将 LLM 的文本增量通过 emit 实时发送。
 * 返回完整的文本。
 * 自动追踪 token 用量。
 */
export async function streamLLMResponse(
  client: Awaited<ReturnType<typeof import("./client").getLLMClient>>,
  params: Parameters<ReturnType<typeof import("./client").getLLMClient>["messages"]["create"]>[0],
  emit: (event: SSEEvent) => void,
  feature?: string
): Promise<string> {
  // Langfuse generation（调用前）
  const langfuseGen = startLLMGeneration({
    name: feature || "streaming",
    model: (params?.model as string) || "unknown",
    input: params?.messages,
    metadata: { feature, streaming: true },
  });

  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;

  try {
    const response = await client.messages.create({ ...params, stream: true });

    for await (const event of response) {
      if (event.type === "message_start") {
        const usage = event.message?.usage;
        if (usage) {
          inputTokens = usage.input_tokens || 0;
          cachedTokens = usage.cache_read_input_tokens || 0;
        }
      } else if (event.type === "message_delta") {
        const usage = event.usage;
        if (usage) outputTokens = usage.output_tokens || 0;
      } else if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        fullText += event.delta.text;
        emit({ type: "text", text: event.delta.text });
      }
    }
  } catch (error) {
    failLLMGeneration(langfuseGen, error);
    throw error;
  }

  // 追踪 token 用量（现有 + Langfuse）
  if (feature && (inputTokens > 0 || outputTokens > 0)) {
    trackTokenUsage({
      feature,
      model: (params?.model as string) || "unknown",
      inputTokens,
      outputTokens,
      cachedTokens,
      isRetry: getIsRetryMode(),
    });

    finishLLMGeneration(langfuseGen, fullText, { inputTokens, outputTokens, cachedTokens });
  } else {
    finishLLMGeneration(langfuseGen, fullText);
  }

  return fullText;
}

/**
 * 流式调用 LLM，支持 tool_use
 *
 * 实时发送文本增量，同时捕获 tool_use block。
 * 返回完整文本 + 工具调用列表。
 */
export async function streamLLMWithToolUse(
  client: Awaited<ReturnType<typeof import("./client").getLLMClient>>,
  params: Parameters<ReturnType<typeof import("./client").getLLMClient>["messages"]["create"]>[0],
  emit: (event: SSEEvent) => void
): Promise<{
  fullText: string;
  toolUseBlocks: Array<{ name: string; input: unknown }>;
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number };
}> {
  // 从 DB 配置解析模型名（如果调用方传的是默认值）
  const { getModelForFeature } = await import("./client");
  const rawModel = (params?.model as string) || "";
  let resolvedModel = rawModel;
  if (rawModel.startsWith("claude-") || rawModel.startsWith("gpt-")) {
    // 看起来是旧的默认值，尝试从 DB 读取
    const feature = rawModel.includes("haiku") || rawModel.includes("mini") ? "extraction"
      : rawModel.includes("opus") || rawModel.includes("o1") ? "analysis"
      : "chat";
    resolvedModel = await getModelForFeature(feature);
    if (resolvedModel !== rawModel) {
      params = { ...params, model: resolvedModel } as typeof params;
    }
  }

  // 优先使用 OpenAI 兼容 API（如果可用）
  const openai = getOpenAIClient();
  if (openai) {
    try {
      const langfuseGen = startLLMGeneration({
        name: "tool-use-stream",
        model: (params?.model as string) || "unknown",
        input: params?.messages,
        metadata: { streaming: true, hasTools: true, provider: "openai" },
      });

      try {
        const result = await streamOpenAI(openai, params as unknown as Record<string, unknown>, emit);
        finishLLMGeneration(langfuseGen, { fullText: result.fullText, toolUseBlocks: result.toolUseBlocks }, result.usage);
        return result;
      } catch (error) {
        failLLMGeneration(langfuseGen, error);
        console.error("[SSE] OpenAI streaming 失败，降级到 Anthropic:", (error as Error)?.message);
        // 降级到 Anthropic 路径（不 throw，继续执行下面的 Anthropic 代码）
      }
    } catch {
      // Langfuse 初始化失败不应阻塞降级
    }
  }

  // ===== Anthropic CCS 降级路径（保持原有行为） =====

  // Langfuse generation（调用前）
  const langfuseGen = startLLMGeneration({
    name: "tool-use-stream",
    model: (params?.model as string) || "unknown",
    input: params?.messages,
    metadata: { streaming: true, hasTools: true, provider: "anthropic" },
  });

  let fullText = "";
  const toolUseBlocks: Array<{ name: string; input: unknown }> = [];
  let currentToolName = "";
  let currentToolInput = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;

  try {
    const response = await client.messages.create({ ...params, stream: true });

    for await (const event of response) {
      if (event.type === "message_start") {
        const usage = event.message?.usage;
        if (usage) {
          inputTokens = usage.input_tokens || 0;
          cachedTokens = usage.cache_read_input_tokens || 0;
        }
      } else if (event.type === "message_delta") {
        const usage = event.usage;
        if (usage) outputTokens = usage.output_tokens || 0;
      } else if (event.type === "content_block_start") {
        if (event.content_block.type === "tool_use") {
          currentToolName = event.content_block.name;
          currentToolInput = "";
        }
      } else if (event.type === "content_block_delta") {
        if (event.delta.type === "text_delta") {
          fullText += event.delta.text;
          emit({ type: "text", text: event.delta.text });
        } else if (event.delta.type === "input_json_delta") {
          currentToolInput += event.delta.partial_json;
        }
      } else if (event.type === "content_block_stop") {
        if (currentToolName) {
          try {
            const input = JSON.parse(currentToolInput || "{}");
            toolUseBlocks.push({ name: currentToolName, input });
          } catch {
            // malformed tool input, skip
          }
          currentToolName = "";
          currentToolInput = "";
        }
      }
    }
  } catch (error) {
    failLLMGeneration(langfuseGen, error);
    throw error;
  }

  // Langfuse generation（调用后）
  finishLLMGeneration(langfuseGen, { fullText, toolUseBlocks }, { inputTokens, outputTokens, cachedTokens });

  return { fullText, toolUseBlocks, usage: { inputTokens, outputTokens, cachedTokens } };
}
