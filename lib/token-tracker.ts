/**
 * Token 消耗追踪器
 *
 * 双层存储：内存缓存 + DB 持久化。
 * 每次 LLM 调用后记录 input/output tokens。
 *
 * 注意：prisma 使用延迟加载，避免将服务端模块（pg, @prisma/adapter-pg）
 * 拉入客户端 bundle。在浏览器环境中 prisma 为 null，仅使用内存缓存。
 */

// 延迟加载 prisma（仅服务端可用）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prisma: any = null;
let prismaLoaded = false;

async function loadPrisma() {
  if (prismaLoaded) return;
  prismaLoaded = true;
  if (typeof window !== "undefined") return; // 浏览器端跳过
  try {
    const mod = await import("@/lib/db-server");
    prisma = mod.prisma;
  } catch {
    prisma = null;
  }
}

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

// 内存缓存（最近 200 条，用于快速返回 + DB 降级）
const memoryCache: TokenUsageRecord[] = [];
const MEMORY_MAX = 200;

// 模型单价（每 1M tokens，美元）
// input = 非缓存输入价格，cachedInput = 缓存输入价格（通常为 input 的 10%）
const MODEL_PRICING: Record<string, { input: number; cachedInput: number; output: number }> = {
  "claude-opus-4-8": { input: 15, cachedInput: 1.5, output: 75 },
  "claude-sonnet-5": { input: 3, cachedInput: 0.3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, cachedInput: 0.08, output: 4 },
  "deepseek-v4-pro": { input: 0.5, cachedInput: 0.05, output: 2 },
  "deepseek-v4": { input: 0.3, cachedInput: 0.03, output: 1 },
  "mimo-v2.5-pro": { input: 0.5, cachedInput: 0.05, output: 2 },
  "mimo-v2-flash": { input: 0.1, cachedInput: 0.01, output: 0.4 },
};

const DEFAULT_PRICING = { input: 3, cachedInput: 0.3, output: 15 };

/**
 * 精确费用计算：区分缓存 token 和非缓存 token
 *
 * Anthropic API 的 input_tokens 包含全部输入（缓存 + 非缓存），
 * cache_read_input_tokens 是其中的缓存部分（价格为原价的 10%）。
 * 非缓存部分 = inputTokens - cachedTokens。
 *
 * 支持自定义价格：传入 customPricing 可覆盖内置模型价格表。
 */
function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number = 0,
  customPricing?: { input: number; cachedInput: number; output: number },
): number {
  const pricing = customPricing || MODEL_PRICING[model] || DEFAULT_PRICING;
  const nonCachedInput = Math.max(0, inputTokens - cachedTokens);
  return (
    (nonCachedInput * pricing.input + cachedTokens * pricing.cachedInput + outputTokens * pricing.output) / 1_000_000
  );
}

// ===== DB 写入队列（带重试，防止数据丢失） =====

interface PendingWrite {
  record: TokenUsageRecord;
  retries: number;
}

const writeQueue: PendingWrite[] = [];
let isProcessingQueue = false;
const MAX_WRITE_RETRIES = 3;
const WRITE_RETRY_DELAY = 2000;
const MAX_QUEUE_SIZE = 100; // 防止 DB 持续不可用时内存泄漏

async function processWriteQueue(): Promise<void> {
  if (isProcessingQueue || writeQueue.length === 0 || !prisma) return;
  isProcessingQueue = true;

  while (writeQueue.length > 0) {
    const pending = writeQueue[0];
    try {
      await (prisma as { tokenUsage?: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> } }).tokenUsage?.create({
        data: {
          feature: pending.record.feature,
          model: pending.record.model,
          inputTokens: pending.record.inputTokens,
          outputTokens: pending.record.outputTokens,
          cachedTokens: pending.record.cachedTokens,
          durationMs: pending.record.durationMs,
          isRetry: pending.record.isRetry,
        },
      });
      writeQueue.shift(); // 成功，移除
    } catch (err) {
      if (pending.retries < MAX_WRITE_RETRIES) {
        pending.retries++;
        // 退回队尾重试
        writeQueue.shift();
        writeQueue.push(pending);
        await new Promise((r) => setTimeout(r, WRITE_RETRY_DELAY));
      } else {
        // 重试耗尽，丢弃但记录警告
        console.warn("[token-tracker] DB write failed after retries, record lost:", pending.record.id);
        writeQueue.shift();
      }
    }
  }

  isProcessingQueue = false;
}

/**
 * 记录一次 LLM 调用的 token 用量
 * 同时写入内存缓存和 DB（DB 走队列，带重试）
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

  // DB 持久化（写入队列，带重试；首次调用触发 prisma 延迟加载）
  loadPrisma().then(() => {
    if (prisma) {
      if (writeQueue.length >= MAX_QUEUE_SIZE) {
        // 队列已满，丢弃最旧的未写入记录（DB 持续不可用的兜底）
        writeQueue.shift();
      }
      writeQueue.push({ record, retries: 0 });
      processWriteQueue().catch((err: unknown) => {
        console.warn("[token-tracker] Write queue error:", (err as Error)?.message);
      });
    }
  });
}

/**
 * 获取 token 用量统计（从 DB 读取，包含历史数据）
 */
export async function getTokenUsageStats(): Promise<ReturnType<typeof buildStats>> {
  await loadPrisma();
  if (!prisma) {
    return buildStats(memoryCache);
  }

  try {
    // 从 DB 读取最近 30 天的记录（上限 50000）
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const records = await (prisma as any).tokenUsage.findMany({
      where: { createdAt: { gte: thirtyDaysAgo } },
      orderBy: { createdAt: "desc" },
      take: 50000,
    });

    return buildStats(records as TokenUsageRecord[]);
  } catch (err) {
    console.warn("[token-tracker] DB read failed, using memory cache:", (err as Error)?.message);
    return buildStats(memoryCache);
  }
}

function buildStats(records: TokenUsageRecord[], customPricing?: { input: number; cachedInput: number; output: number }) {
  // 总计（费用计算区分缓存 token）
  const totals = records.reduce(
    (acc, r) => ({
      inputTokens: acc.inputTokens + r.inputTokens,
      outputTokens: acc.outputTokens + r.outputTokens,
      cachedTokens: acc.cachedTokens + r.cachedTokens,
      calls: acc.calls + 1,
      successfulCalls: acc.successfulCalls + (r.isRetry ? 0 : 1),
      retryCalls: acc.retryCalls + (r.isRetry ? 1 : 0),
      costUSD: acc.costUSD + estimateCost(r.model, r.inputTokens, r.outputTokens, r.cachedTokens, customPricing),
    }),
    { inputTokens: 0, outputTokens: 0, cachedTokens: 0, calls: 0, successfulCalls: 0, retryCalls: 0, costUSD: 0 },
  );

  // 按功能分组
  const byFeature = new Map<string, { inputTokens: number; outputTokens: number; calls: number; costUSD: number }>();
  for (const r of records) {
    const existing = byFeature.get(r.feature) || { inputTokens: 0, outputTokens: 0, calls: 0, costUSD: 0 };
    existing.inputTokens += r.inputTokens;
    existing.outputTokens += r.outputTokens;
    existing.calls += 1;
    existing.costUSD += estimateCost(r.model, r.inputTokens, r.outputTokens, r.cachedTokens, customPricing);
    byFeature.set(r.feature, existing);
  }

  // 按模型分组
  const byModel = new Map<string, { inputTokens: number; outputTokens: number; calls: number; costUSD: number }>();
  for (const r of records) {
    const existing = byModel.get(r.model) || { inputTokens: 0, outputTokens: 0, calls: 0, costUSD: 0 };
    existing.inputTokens += r.inputTokens;
    existing.outputTokens += r.outputTokens;
    existing.calls += 1;
    existing.costUSD += estimateCost(r.model, r.inputTokens, r.outputTokens, r.cachedTokens, customPricing);
    byModel.set(r.model, existing);
  }

  // 按小时分组（最近 24 小时，使用本地时区）
  const hourlyMap = new Map<string, { inputTokens: number; outputTokens: number; calls: number }>();
  const now = Date.now();
  const last24h = records.filter((r) => now - new Date(r.createdAt).getTime() < 24 * 60 * 60 * 1000);
  for (const r of last24h) {
    const d = new Date(r.createdAt);
    const hour = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}`;
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
    costUSD: estimateCost(r.model, r.inputTokens, r.outputTokens, r.cachedTokens, customPricing),
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
