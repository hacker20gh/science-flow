/**
 * 通用重试工具
 *
 * 指数退避 + 抖动，支持 Retry-After header
 * 用于学术 API 等外部 HTTP 调用
 */

import { sleep } from "@/lib/utils/sleep";

export interface RetryOptions {
  /** 最大重试次数（不含首次尝试）。默认 2 */
  maxRetries?: number;
  /** 基础延迟（毫秒）。默认 1000 */
  baseDelay?: number;
  /** 最大延迟（毫秒）。默认 10000 */
  maxDelay?: number;
  /** 判断错误是否值得重试。默认：429、5xx、网络错误 */
  retryOn?: (error: unknown) => boolean;
}

/**
 * 判断错误是否为可重试的 HTTP / 网络错误
 *
 * - 429 限流 → 重试
 * - 5xx 服务端错误 → 重试
 * - 网络 / 超时错误 → 重试
 * - 4xx 客户端错误 → 不重试
 */
function defaultRetryOn(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const err = error as Record<string, unknown>;

  // 带 status 字段的 HTTP 错误（fetch response 转成的 Error）
  if (typeof err.status === "number") {
    if (err.status === 429 || err.status >= 500) return true;
    if (err.status >= 400) return false;
  }

  // 标准 fetch 超时 / AbortError
  if (err.name === "AbortError" || err.name === "TimeoutError") return true;

  // Node.js 网络错误
  if (err.code === "ECONNRESET" || err.code === "ETIMEDOUT" || err.code === "ENOTFOUND" || err.code === "ECONNREFUSED") return true;

  // message 中包含网络错误关键字
  if (typeof err.message === "string") {
    const msg = err.message.toLowerCase();
    if (msg.includes("fetch failed") || msg.includes("network") || msg.includes("econnrefused")) return true;
    // 检查 HTTP 状态码消息（如 "429 Too Many Requests" 或 "OpenAlex search failed: 429"）
    const statusMatch = msg.match(/:\s*(\d{3})$/);
    if (statusMatch) {
      const status = parseInt(statusMatch[1], 10);
      if (status === 429 || status >= 500) return true;
      if (status >= 400) return false;
    }
  }

  return false;
}

/**
 * 从错误中提取 Retry-After 头的值（秒）
 */
function extractRetryAfter(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;

  const err = error as Record<string, unknown>;

  // 直接在 error 对象上（某些 fetch 封装会保留 headers）
  const headers = err.headers as Record<string, string> | undefined;
  if (headers) {
    const retryAfter = headers["retry-after"] || headers["Retry-After"];
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds) && seconds > 0 && seconds <= 60) return seconds * 1000;
    }
  }

  return null;
}

/**
 * 通用重试包装器
 *
 * - 指数退避 + 抖动（避免 thundering herd）
 * - 尊重 Retry-After header（429 响应）
 * - console.warn 记录重试尝试
 *
 * @example
 * ```ts
 * const data = await withRetry(
 *   () => fetch(url, { signal: AbortSignal.timeout(10_000) }).then(r => {
 *     if (!r.ok) { const e = new Error(`HTTP ${r.status}`); (e as any).status = r.status; throw e; }
 *     return r.json();
 *   }),
 *   { maxRetries: 2 }
 * );
 * ```
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 2;
  const baseDelay = options?.baseDelay ?? 1000;
  const maxDelay = options?.maxDelay ?? 10_000;
  const retryOn = options?.retryOn ?? defaultRetryOn;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // 不可重试的错误，直接抛
      if (!retryOn(error)) throw error;

      // 最后一次尝试也失败了
      if (attempt === maxRetries) {
        console.warn(`[withRetry] all ${maxRetries + 1} attempts failed`);
        throw error;
      }

      // 优先使用 Retry-After header（429 限流）
      const retryAfterMs = extractRetryAfter(error);
      // 指数退避 + 抖动
      const exponentialDelay = baseDelay * Math.pow(2, attempt);
      const jitter = exponentialDelay * (0.5 + Math.random() * 0.5); // 50%-100% of delay
      const computedDelay = Math.min(jitter, maxDelay);
      const delay = retryAfterMs ?? computedDelay;

      console.warn(
        `[withRetry] attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${Math.round(delay)}ms`,
        (error as Error)?.message ?? error
      );
      await sleep(delay);
    }
  }

  throw lastError;
}
