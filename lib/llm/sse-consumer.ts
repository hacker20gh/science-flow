/**
 * SSE 消费者工具（客户端安全）
 *
 * 仅包含浏览器端可用的 SSE 消费函数，
 * 不依赖任何 Node.js 模块（prisma, async_hooks, Anthropic SDK 等）。
 *
 * 服务端 SSE 创建函数（createSSEStream, streamLLMResponse 等）保留在 streaming.ts。
 */

// ===== SSE 事件类型 =====

export type SSEEvent =
  | { type: "text"; text: string }                    // 文本增量
  | { type: "progress"; step: string; current: number; total: number } // 步骤进度
  | { type: "result"; data: unknown }                 // 结构化结果
  | { type: "error"; message: string }                // 错误
  | { type: "heartbeat" }                             // 心跳保活
  | { type: "done" };                                 // 完成

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
            case "heartbeat":
              // 心跳保活，忽略
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
