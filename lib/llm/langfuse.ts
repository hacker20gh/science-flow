/**
 * Langfuse LLM 可观测性层
 *
 * 为每次 LLM 调用创建 generation trace（input/output/tokens/latency/cost）。
 * 环境变量不存在时自动降级为 no-op，不影响现有逻辑。
 *
 * 同时提供 prompt management 接口（Phase 2 使用）。
 */

import Langfuse from "langfuse";
import type { LangfuseTraceClient, LangfuseGenerationClient } from "langfuse";
import { AsyncLocalStorage } from "async_hooks";

// ===== 客户端单例（惰性初始化） =====

let langfuse: Langfuse | null = null;
let initialized = false;

function getLangfuse(): Langfuse | null {
  if (initialized) return langfuse;
  initialized = true;

  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;

  if (!publicKey || !secretKey) {
    console.log("[langfuse] 未配置 LANGFUSE_PUBLIC_KEY/SECRET_KEY，可观测性已禁用");
    return null;
  }

  try {
    langfuse = new Langfuse({
      publicKey,
      secretKey,
      baseUrl: process.env.LANGFUSE_HOST || "https://cloud.langfuse.com",
      flushAt: 15,        // 批量发送阈值
      flushInterval: 10000, // 10 秒 flush 间隔
    });
    console.log("[langfuse] 已初始化，指向", process.env.LANGFUSE_HOST || "cloud.langfuse.com");
  } catch (err) {
    console.warn("[langfuse] 初始化失败，降级为 no-op:", (err as Error)?.message);
    langfuse = null;
  }

  return langfuse;
}

// ===== Request-scoped Trace（同一请求内的多次 LLM 调用归到同一 trace） =====

interface TraceContext {
  trace: LangfuseTraceClient;
}

export const traceStorage = new AsyncLocalStorage<TraceContext>();

/**
 * 获取当前请求的 trace（不存在则创建）
 */
function getCurrentTrace(name: string, metadata?: Record<string, unknown>): LangfuseTraceClient | null {
  const lf = getLangfuse();
  if (!lf) return null;

  // 如果已有 trace，直接返回
  const existing = traceStorage.getStore();
  if (existing) return existing.trace;

  // 创建新 trace
  const trace = lf.trace({
    name,
    metadata,
  });
  return trace;
}

/**
 * 为 API route 包装 trace 上下文
 *
 * 用法：在 API route handler 中调用
 *   const response = await withLangfuseTrace("extraction", async () => { ... });
 *
 * 同一请求内的所有 LLM 调用自动归到同一 trace。
 */
export async function withLangfuseTrace<T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const lf = getLangfuse();
  if (!lf) return fn();

  const trace = lf.trace({ name, metadata });
  try {
    return await traceStorage.run({ trace }, fn);
  } finally {
    // 确保数据发送
    await lf.flushAsync().catch(() => {});
  }
}

// ===== Generation Tracking =====

export interface LLMGenerationParams {
  /** 功能名称（extraction, analysis, design 等） */
  name: string;
  /** 模型名 */
  model: string;
  /** 输入（messages 数组或 system prompt） */
  input: unknown;
  /** 元数据（feature, isRetry 等） */
  metadata?: Record<string, unknown>;
}

export interface LLMGenerationResult {
  generation: LangfuseGenerationClient;
  startTime: number;
}

/**
 * 创建一个 LLM generation（调用前）
 */
export function startLLMGeneration(params: LLMGenerationParams): LLMGenerationResult | null {
  const lf = getLangfuse();
  if (!lf) return null;

  const startTime = Date.now();
  const trace = getCurrentTrace(params.name, params.metadata);

  let generation: LangfuseGenerationClient;
  if (trace) {
    // 挂到当前请求的 trace 下
    generation = trace.generation({
      name: params.name,
      model: params.model,
      input: params.input,
      metadata: params.metadata,
    });
  } else {
    // 无 trace 上下文（非 API route 调用），创建独立 generation
    generation = lf.generation({
      name: params.name,
      model: params.model,
      input: params.input,
      metadata: params.metadata,
    });
  }

  return { generation, startTime };
}

/**
 * 完成一个 LLM generation（调用后）
 */
export function finishLLMGeneration(
  result: LLMGenerationResult | null,
  output: unknown,
  usage?: { inputTokens: number; outputTokens: number; cachedTokens?: number }
): void {
  if (!result) return;

  try {
    result.generation.update({
      output,
      ...(usage
        ? {
            usageDetails: {
              input: usage.inputTokens,
              output: usage.outputTokens,
              ...(usage.cachedTokens ? { cacheRead: usage.cachedTokens } : {}),
            },
          }
        : {}),
      metadata: {
        durationMs: Date.now() - result.startTime,
      },
    });
  } catch (err) {
    // tracing 失败不影响业务
    console.warn("[langfuse] generation update failed:", (err as Error)?.message);
  }
}

/**
 * 标记 generation 失败
 */
export function failLLMGeneration(
  result: LLMGenerationResult | null,
  error: unknown
): void {
  if (!result) return;

  try {
    result.generation.update({
      output: { error: error instanceof Error ? error.message : String(error) },
      metadata: {
        durationMs: Date.now() - result.startTime,
        status: "error",
      },
      level: "ERROR",
    });
  } catch {
    // 静默忽略
  }
}

// ===== Prompt Management（预留 Phase 2） =====

/**
 * 从 Langfuse 获取管理的 prompt
 *
 * 如果 Langfuse 中不存在该 prompt，返回 null（调用方使用代码中的默认 prompt）。
 * 迁移步骤：
 * 1. 在 Langfuse UI 中创建 prompt（名称 + 文本）
 * 2. 给 prompt 打上 "production" label
 * 3. 代码中将硬编码 prompt 替换为 getManagedPrompt() ?? DEFAULT_PROMPT
 */
export async function getManagedPrompt(
  name: string,
  label: string = "production"
): Promise<string | null> {
  const lf = getLangfuse();
  if (!lf) return null;

  try {
    const prompt = await lf.getPrompt(name, undefined, { label });
    return prompt?.prompt ?? null;
  } catch {
    // prompt 不存在或网络错误
    return null;
  }
}

// ===== Flush =====

/**
 * 手动 flush（在 API route handler 结束时调用）
 * 如果使用 withLangfuseTrace()，会自动 flush，无需手动调用。
 */
export async function flushLangfuse(): Promise<void> {
  const lf = getLangfuse();
  if (!lf) return;
  try {
    await lf.flushAsync();
  } catch {
    // 静默忽略
  }
}
