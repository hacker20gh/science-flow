/**
 * 通用 SSE 流式工具
 *
 * 封装 ReadableStream + SSE 格式，统一事件类型。
 * 供实验设计、论文组装、审稿模拟等重型 LLM 任务使用。
 */

// ===== SSE 事件类型 =====

export type SSEEvent =
  | { type: "text"; text: string }                    // 文本增量
  | { type: "progress"; step: string; current: number; total: number } // 步骤进度
  | { type: "result"; data: unknown }                 // 结构化结果
  | { type: "error"; message: string }                // 错误
  | { type: "done" };                                 // 完成

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
      try {
        await handler((event) => emitEvent(controller, event));
        emitEvent(controller, { type: "done" });
      } catch (error) {
        console.error("[SSE] Stream error:", error);
        emitEvent(controller, {
          type: "error",
          message: error instanceof Error ? error.message : "处理失败，请重试",
        });
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

/**
 * 流式调用 LLM（Anthropic Messages API streaming）
 *
 * 将 LLM 的文本增量通过 emit 实时发送。
 * 返回完整的文本。
 */
export async function streamLLMResponse(
  client: Awaited<ReturnType<typeof import("./client").getLLMClient>>,
  params: Parameters<ReturnType<typeof import("./client").getLLMClient>["messages"]["create"]>[0],
  emit: (event: SSEEvent) => void
): Promise<string> {
  const response = await client.messages.create({ ...params, stream: true });

  let fullText = "";
  for await (const event of response) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      fullText += event.delta.text;
      emit({ type: "text", text: event.delta.text });
    }
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
  const response = await client.messages.create({ ...params, stream: true });

  let fullText = "";
  const toolUseBlocks: Array<{ name: string; input: unknown }> = [];
  let currentToolName = "";
  let currentToolInput = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;

  for await (const event of response) {
    if (event.type === "message_start") {
      // message_start 包含 input_tokens 和 cache_read_input_tokens
      const usage = event.message?.usage;
      if (usage) {
        inputTokens = usage.input_tokens || 0;
        cachedTokens = usage.cache_read_input_tokens || 0;
      }
    } else if (event.type === "message_delta") {
      // message_delta 包含 output_tokens
      const usage = event.usage;
      if (usage) {
        outputTokens = usage.output_tokens || 0;
      }
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

  return { fullText, toolUseBlocks, usage: { inputTokens, outputTokens, cachedTokens } };
}

// ===== 前端 SSE 消费者工具 =====

export interface SSEConsumerOptions {
  onText?: (text: string) => void;
  onProgress?: (step: string, current: number, total: number) => void;
  onResult?: (data: unknown) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
  signal?: AbortSignal;
}

/**
 * 消费 SSE 流（前端使用）
 *
 * 自动处理 chunk 边界问题（buffer 累积模式）。
 */
export async function consumeSSEStream(
  response: Response,
  options: SSEConsumerOptions
): Promise<void> {
  if (!response.body) throw new Error("Response body is null");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event: SSEEvent = JSON.parse(line.slice(6));
          switch (event.type) {
            case "text":
              options.onText?.(event.text);
              break;
            case "progress":
              options.onProgress?.(event.step, event.current, event.total);
              break;
            case "result":
              options.onResult?.(event.data);
              break;
            case "error":
              options.onError?.(event.message);
              break;
            case "done":
              options.onDone?.();
              break;
          }
        } catch {
          // 忽略畸形 JSON
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
