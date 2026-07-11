/**
 * Token 消耗追踪器
 *
 * 双层存储：内存缓存 + DB 持久化。
 * 每次 LLM 调用后记录 input/output tokens。
 */

import { prisma } from "@/lib/db-server";

export interface TokenUsageRecord {
  id: string;
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  durationMs: number;
  isRetry: boolean;
  createdAt: Date;
}

// 内存缓存（最近 100 条，用于快速返回）
const memoryCache: TokenUsageRecord[] = [];
const MEMORY_MAX = 100;

// 模型单价（每 1M tokens，美元）
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-8": { input: 15, output: 75 },
  "claude-sonnet-5": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, output: 4 },
  "deepseek-v4-pro": { input: 0.5, output: 2 },
  "deepseek-v4": { input: 0.3, output: 1 },
  "mimo-v2.5-pro": { input: 0.5, output: 2 },
  "mimo-v2-flash": { input: 0.1, output: 0.4 },
};

function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING[model] || { input: 3, output: 15 };
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

/**
 * 记录一次 LLM 调用的 token 用量
 * 同时写入内存缓存和 DB（DB 异步，不阻塞）
 */
export function trackTokenUsage(params: {
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  durationMs?: number;
  isRetry?: boolean;
}): void {
  const record: TokenUsageRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    feature: params.feature,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    cachedTokens: params.cachedTokens || 0,
    durationMs: params.durationMs || 0,
    isRetry: params.isRetry || false,
    createdAt: new Date(),
  };

  // 内存缓存
  memoryCache.push(record);
  if (memoryCache.length > MEMORY_MAX) memoryCache.shift();

  // DB 持久化（异步，不阻塞调用方）
  if (prisma) {
    (prisma as { tokenUsage?: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> } }).tokenUsage?.create({
      data: {
        id: record.id,
        feature: record.feature,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        cachedTokens: record.cachedTokens,
        durationMs: record.durationMs,
        isRetry: record.isRetry,
      },
    }).catch((err: unknown) => {
      console.warn("[token-tracker] DB write failed:", (err as Error)?.message);
    });
  }
}

/**
 * 获取 token 用量统计（从 DB 读取，包含历史数据）
 */
export async function getTokenUsageStats(): Promise<ReturnType<typeof buildStats>> {
  if (!prisma) {
    return buildStats(memoryCache);
  }

  try {
    // 从 DB 读取最近 7 天的记录
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records = await (prisma as any).tokenUsage.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: 5000,
    });

    return buildStats(records as TokenUsageRecord[]);
  } catch (err) {
    console.warn("[token-tracker] DB read failed, using memory cache:", (err as Error)?.message);
    return buildStats(memoryCache);
  }
}

function buildStats(records: TokenUsageRecord[]) {
  // 总计
  const totals = records.reduce(
    (acc, r) => ({
      inputTokens: acc.inputTokens + r.inputTokens,
      outputTokens: acc.outputTokens + r.outputTokens,
      cachedTokens: acc.cachedTokens + r.cachedTokens,
      calls: acc.calls + 1,
      successfulCalls: acc.successfulCalls + (r.isRetry ? 0 : 1),
      costUSD: acc.costUSD + estimateCost(r.model, r.inputTokens, r.outputTokens),
    }),
    { inputTokens: 0, outputTokens: 0, cachedTokens: 0, calls: 0, successfulCalls: 0, costUSD: 0 },
  );

  // 按功能分组
  const byFeature = new Map<string, { inputTokens: number; outputTokens: number; calls: number; costUSD: number }>();
  for (const r of records) {
    const existing = byFeature.get(r.feature) || { inputTokens: 0, outputTokens: 0, calls: 0, costUSD: 0 };
    existing.inputTokens += r.inputTokens;
    existing.outputTokens += r.outputTokens;
    existing.calls += 1;
    existing.costUSD += estimateCost(r.model, r.inputTokens, r.outputTokens);
    byFeature.set(r.feature, existing);
  }

  // 按模型分组
  const byModel = new Map<string, { inputTokens: number; outputTokens: number; calls: number; costUSD: number }>();
  for (const r of records) {
    const existing = byModel.get(r.model) || { inputTokens: 0, outputTokens: 0, calls: 0, costUSD: 0 };
    existing.inputTokens += r.inputTokens;
    existing.outputTokens += r.outputTokens;
    existing.calls += 1;
    existing.costUSD += estimateCost(r.model, r.inputTokens, r.outputTokens);
    byModel.set(r.model, existing);
  }

  // 按小时分组（最近 24 小时）
  const hourlyMap = new Map<string, { inputTokens: number; outputTokens: number; calls: number }>();
  const now = Date.now();
  const last24h = records.filter((r) => now - new Date(r.createdAt).getTime() < 24 * 60 * 60 * 1000);
  for (const r of last24h) {
    const hour = new Date(r.createdAt).toISOString().slice(0, 13);
    const existing = hourlyMap.get(hour) || { inputTokens: 0, outputTokens: 0, calls: 0 };
    existing.inputTokens += r.inputTokens;
    existing.outputTokens += r.outputTokens;
    existing.calls += 1;
    hourlyMap.set(hour, existing);
  }
  const hourly = [...hourlyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, data]) => ({ hour, ...data }));

  // 功能排行（按 cost 降序）
  const featureRanking = [...byFeature.entries()]
    .map(([feature, data]) => ({ feature, ...data }))
    .sort((a, b) => b.costUSD - a.costUSD);

  // 最近记录
  const recentRecords = records.slice(0, 20).map((r) => ({
    ...r,
    timestamp: new Date(r.createdAt).getTime(),
    costUSD: estimateCost(r.model, r.inputTokens, r.outputTokens),
  }));

  return {
    totals: {
      ...totals,
      costCNY: totals.costUSD * 7.2,
    },
    byFeature: Object.fromEntries(byFeature),
    byModel: Object.fromEntries(byModel),
    hourly,
    featureRanking,
    recentRecords,
  };
}
