/**
 * LLM 客户端
 *
 * 通过 CCS 代理接入模型
 * 配置可由前端设置页传入，不依赖 .env
 *
 * 包含：
 * - 客户端单例管理
 * - 模型名解析（env → DB fallback → 默认值）
 * - 通用重试 + 指数退避
 */

import Anthropic from "@anthropic-ai/sdk";
import { trackTokenUsage } from "@/lib/token-tracker";
import { startLLMGeneration, finishLLMGeneration, failLLMGeneration } from "./langfuse";
import { AsyncLocalStorage } from "async_hooks";
import { sleep } from "@/lib/utils/sleep";

// 默认配置
const DEFAULT_BASE_URL = "http://127.0.0.1:15721";
const DEFAULT_MODELS = {
  extraction: "claude-sonnet-5",
  chat: "claude-sonnet-5",
  analysis: "claude-opus-4-8",
};

// ===== 重试状态追踪（AsyncLocalStorage，避免并发竞态） =====
const retryStorage = new AsyncLocalStorage<{ isRetry: boolean }>();

/** 获取当前异步上下文的重试状态 */
export function getIsRetryMode(): boolean {
  return retryStorage.getStore()?.isRetry ?? false;
}

// 服务器端单例客户端
let client: Anthropic | null = null;
let currentBaseUrl: string = "";

// ===== DB 配置缓存（避免每次请求查 DB） =====

interface CachedConfig {
  baseUrl: string;
  models: Record<string, string>;
  cachedAt: number;
}

let cachedDBConfig: CachedConfig | null = null;
const CONFIG_CACHE_TTL = 60_000; // 60 秒缓存

async function getDBConfig(): Promise<{ baseUrl: string; models: Record<string, string> } | null> {
  // 缓存有效期内直接返回
  if (cachedDBConfig && Date.now() - cachedDBConfig.cachedAt < CONFIG_CACHE_TTL) {
    return cachedDBConfig;
  }

  try {
    const { prisma } = await import("@/lib/db-server");
    if (!prisma) return null;

    const settings = await prisma.userSetting?.findFirst?.({
      where: { key: "llmConfig" },
      orderBy: { updatedAt: "desc" },
    });

    if (settings?.value) {
      const config = settings.value as { baseUrl?: string; models?: Record<string, string> };
      cachedDBConfig = {
        baseUrl: config.baseUrl || DEFAULT_BASE_URL,
        models: config.models || {},
        cachedAt: Date.now(),
      };
      return cachedDBConfig;
    }
  } catch {
    // DB 不可用时静默降级
  }
  return null;
}

export function getLLMClient(baseUrl?: string): Anthropic {
  const url = baseUrl || process.env.CCS_BASE_URL || DEFAULT_BASE_URL;

  // 如果地址变了，重建客户端
  if (!client || currentBaseUrl !== url) {
    client = new Anthropic({
      baseURL: url,
      apiKey: process.env.CCS_API_KEY || "placeholder",
    });
    currentBaseUrl = url;

    // 包装 messages.create，自动追踪 token 用量 + Langfuse generation
    const originalCreate = client.messages.create.bind(client.messages);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client.messages as any).create = async (params: Record<string, unknown>, _options?: unknown) => {
      const start = Date.now();
      try {
        const result = await originalCreate(params as unknown as Parameters<typeof originalCreate>[0]);
        const duration = Date.now() - start;

        // 非流式响应有 usage 字段
        if (result && typeof result === "object" && "usage" in result) {
          const usage = (result as { usage?: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number } }).usage;
          if (usage) {
            const feature = (params?._sciflowFeature as string) || detectFeature(params?.system);
            const model = (params?.model as string) || "unknown";

            // 现有 token tracker
            trackTokenUsage({
              feature,
              model,
              inputTokens: usage.input_tokens,
              outputTokens: usage.output_tokens,
              cachedTokens: usage.cache_read_input_tokens || 0,
              durationMs: duration,
              isRetry: getIsRetryMode(),
            });

            // Langfuse generation（仅非流式调用，流式调用由 streaming.ts 处理）
            if (!params?.stream) {
              const langfuseGen = startLLMGeneration({
                name: feature,
                model,
                input: params?.messages,
                metadata: { feature, isRetry: getIsRetryMode() },
              });
              finishLLMGeneration(langfuseGen, result.content, {
                inputTokens: usage.input_tokens,
                outputTokens: usage.output_tokens,
                cachedTokens: usage.cache_read_input_tokens || 0,
              });
            }
          }
        }

        return result;
      } catch (error) {
        // Langfuse 记录失败（仅非流式调用）
        if (!params?.stream) {
          const feature = (params?._sciflowFeature as string) || detectFeature(params?.system);
          const langfuseGen = startLLMGeneration({
            name: feature,
            model: (params?.model as string) || "unknown",
            input: params?.messages,
          });
          failLLMGeneration(langfuseGen, error);
        }
        throw error;
      }
    };
  }

  return client;
}

/**
 * 从 system prompt 推断功能类型
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectFeature(system: any): string {
  const sysText = typeof system === "string" ? system : "";
  if (sysText.includes("extract") || sysText.includes("biomedical literature analysis")) return "extraction";
  if (sysText.includes("manuscript") || sysText.includes("academic writer")) return "manuscript";
  if (sysText.includes("review") || sysText.includes("peer reviewer")) return "review";
  if (sysText.includes("experiment") || sysText.includes("designing experiments")) return "design";
  if (sysText.includes("troubleshoot")) return "troubleshoot";
  if (sysText.includes("biostatistician") || sysText.includes("analyze")) return "analysis";
  if (sysText.includes("search") || sysText.includes("query")) return "preprocess";
  return "chat";
}

export type ModelType = "extraction" | "chat" | "analysis";

/**
 * 获取模型名（优先级：传入 config > env > DB > 默认值）
 */
export function getModelName(
  type: ModelType,
  config?: { baseUrl?: string; models?: Record<string, string> }
): string {
  if (config?.models?.[type]) return config.models[type];
  if (type === "extraction") return process.env.CCS_MODEL_EXTRACTION || DEFAULT_MODELS.extraction;
  if (type === "chat") return process.env.CCS_MODEL_CHAT || DEFAULT_MODELS.chat;
  return process.env.CCS_MODEL_ANALYSIS || DEFAULT_MODELS.analysis;
}

export { DEFAULT_BASE_URL, DEFAULT_MODELS };

// 兼容导出（供各 LLM 引擎使用 .env 中的模型名）
export const MODELS = {
  extraction: process.env.CCS_MODEL_EXTRACTION || DEFAULT_MODELS.extraction,
  chat: process.env.CCS_MODEL_CHAT || DEFAULT_MODELS.chat,
  analysis: process.env.CCS_MODEL_ANALYSIS || DEFAULT_MODELS.analysis,
} as const;

// ===== 重试 + 指数退避 =====

/**
 * 判断错误是否值得重试
 * - 429 限流 → 重试
 * - 502/503/504 网关错误 → 重试
 * - 网络超时 → 重试
 * - 400/401/403 客户端错误 → 不重试
 */
export function isRetryableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const err = error as Record<string, unknown>;

  // Anthropic SDK 错误
  if (typeof err.status === "number") {
    const status = err.status;
    if (status === 429 || status === 502 || status === 503 || status === 504) return true;
    if (status >= 400 && status < 500) return false; // 其他 4xx 不重试
    if (status >= 500) return true;
  }

  // 网络错误
  if (err.code === "ECONNRESET" || err.code === "ETIMEDOUT" || err.code === "ENOTFOUND") return true;
  if (err.name === "AbortError" || err.name === "TimeoutError") return true;

  // fetch 网络错误
  if (err.message && typeof err.message === "string") {
    const msg = err.message.toLowerCase();
    if (msg.includes("fetch failed") || msg.includes("network") || msg.includes("econnrefused")) return true;
  }

  return false;
}

/**
 * 通用 LLM 重试包装器
 *
 * 指数退避：baseDelay → baseDelay×2 → baseDelay×4
 * 默认 3 次尝试（1 次原始 + 2 次重试）
 */
export async function withLLMRetry<T>(
  fn: () => Promise<T>,
  opts?: { maxRetries?: number; baseDelay?: number; label?: string }
): Promise<T> {
  const maxRetries = opts?.maxRetries ?? 2;
  const baseDelay = opts?.baseDelay ?? 1000;
  const label = opts?.label ?? "LLM";

  let lastError: unknown;
  // 确保当前异步上下文有 retryStorage
  const existingStore = retryStorage.getStore();
  if (!existingStore) {
    return retryStorage.run({ isRetry: false }, () => withLLMRetry(fn, opts));
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 每个 attempt 更新当前异步上下文的重试状态
    existingStore.isRetry = attempt > 0;
    const attemptStart = Date.now();
    try {
      return await fn();
    } catch (error) {
      const attemptDuration = Date.now() - attemptStart;
      lastError = error;

      // 记录失败调用（token 为 0，但记录耗时和失败事实）
      trackTokenUsage({
        feature: label,
        model: "unknown",
        inputTokens: 0,
        outputTokens: 0,
        durationMs: attemptDuration,
        isRetry: attempt > 0,
      });

      // 不可重试的错误，直接抛
      if (!isRetryableError(error)) {
        throw error;
      }

      // 最后一次尝试也失败了
      if (attempt === maxRetries) {
        console.error(`[${label}] 所有 ${maxRetries + 1} 次尝试均失败`);
        throw error;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`[${label}] 第 ${attempt + 1} 次失败，${delay}ms 后重试...`, (error as Error)?.message || error);
      await sleep(delay);
    }
  }

  throw lastError;
}
