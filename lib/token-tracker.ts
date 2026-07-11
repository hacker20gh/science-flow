/**
 * Token 消耗追踪器
 *
 * 内存存储 + 持久化到 localStorage（前端）。
 * 每次 LLM 调用后记录 input/output tokens。
 */

export interface TokenUsageRecord {
  id: string;
  timestamp: number;
  feature: string; // extraction, chat, design, troubleshoot, analysis, manuscript, review, preprocess
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number; // cache_read_input_tokens
  durationMs: number;
}

// 服务端内存存储
const usageHistory: TokenUsageRecord[] = [];
const MAX_RECORDS = 1000;

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
  const pricing = MODEL_PRICING[model] || { input: 3, output: 15 }; // 默认 sonnet 价格
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

/**
 * 记录一次 LLM 调用的 token 用量
 */
export function trackTokenUsage(params: {
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  durationMs?: number;
}): void {
  const record: TokenUsageRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: Date.now(),
    feature: params.feature,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    cachedTokens: params.cachedTokens || 0,
    durationMs: params.durationMs || 0,
  };

  usageHistory.push(record);
  if (usageHistory.length > MAX_RECORDS) {
    usageHistory.shift();
  }
}

/**
 * 获取 token 用量统计
 */
export function getTokenUsageStats(timeRange?: { start: number; end: number }) {
  const filtered = timeRange
    ? usageHistory.filter((r) => r.timestamp >= timeRange.start && r.timestamp <= timeRange.end)
    : usageHistory;

  // 总计
  const totals = filtered.reduce(
    (acc, r) => ({
      inputTokens: acc.inputTokens + r.inputTokens,
      outputTokens: acc.outputTokens + r.outputTokens,
      cachedTokens: acc.cachedTokens + r.cachedTokens,
      calls: acc.calls + 1,
      costUSD: acc.costUSD + estimateCost(r.model, r.inputTokens, r.outputTokens),
    }),
    { inputTokens: 0, outputTokens: 0, cachedTokens: 0, calls: 0, costUSD: 0 },
  );

  // 按功能分组
  const byFeature = new Map<string, { inputTokens: number; outputTokens: number; calls: number; costUSD: number }>();
  for (const r of filtered) {
    const existing = byFeature.get(r.feature) || { inputTokens: 0, outputTokens: 0, calls: 0, costUSD: 0 };
    existing.inputTokens += r.inputTokens;
    existing.outputTokens += r.outputTokens;
    existing.calls += 1;
    existing.costUSD += estimateCost(r.model, r.inputTokens, r.outputTokens);
    byFeature.set(r.feature, existing);
  }

  // 按模型分组
  const byModel = new Map<string, { inputTokens: number; outputTokens: number; calls: number; costUSD: number }>();
  for (const r of filtered) {
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
  const last24h = filtered.filter((r) => now - r.timestamp < 24 * 60 * 60 * 1000);
  for (const r of last24h) {
    const hour = new Date(r.timestamp).toISOString().slice(0, 13); // "2026-07-11T13"
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
  const recentRecords = filtered.slice(-20).reverse().map((r) => ({
    ...r,
    costUSD: estimateCost(r.model, r.inputTokens, r.outputTokens),
  }));

  return {
    totals: {
      ...totals,
      costCNY: totals.costUSD * 7.2, // 粗略汇率
    },
    byFeature: Object.fromEntries(byFeature),
    byModel: Object.fromEntries(byModel),
    hourly,
    featureRanking,
    recentRecords,
  };
}
