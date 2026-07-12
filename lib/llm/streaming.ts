/**
 * 通用 SSE 流式工具（服务端专用）
 *
 * 封装 ReadableStream + SSE 格式，统一事件类型。
 * 供实验设计、论文组装、审稿模拟等重型 LLM 任务使用。
 *
 * 客户端 SSE 消费函数（consumeSSEStream）在 sse-consumer.ts 中。
 */

import { trackTokenUsage } from "@/lib/token-tracker";
import { getIsRetryMode } from "./client";
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
  // Langfuse generation（调用前）
  const langfuseGen = startLLMGeneration({
    name: "tool-use-stream",
    model: (params?.model as string) || "unknown",
    input: params?.messages,
    metadata: { streaming: true, hasTools: true },
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
