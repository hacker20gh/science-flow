"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import TracesTab from "./traces-tab";

interface TokenStats {
  totals: {
    inputTokens: number;
    outputTokens: number;
    cachedTokens: number;
    calls: number;
    successfulCalls: number;
    retryCalls: number;
    costUSD: number;
    costCNY: number;
  };
  hourly: Array<{ hour: string; inputTokens: number; outputTokens: number; calls: number }>;
  featureRanking: Array<{ feature: string; inputTokens: number; outputTokens: number; calls: number; costUSD: number }>;
  recentRecords: Array<{
    id: string; timestamp: number; feature: string; model: string;
    inputTokens: number; outputTokens: number; costUSD: number; durationMs: number;
  }>;
}

const FEATURE_LABELS: Record<string, string> = {
  extraction: "🔬 文献提取",
  chat: "💬 AI 对话",
  design: "🧪 实验设计",
  troubleshoot: "🔧 排障诊断",
  analysis: "📊 数据分析",
  manuscript: "📝 论文组装",
  review: "🎭 审稿模拟",
  preprocess: "🔍 搜索优化",
};

// 面板尺寸限制
const MIN_W = 280, MAX_W = 600;
const MIN_H = 320, MAX_H = 800;
const DEFAULT_W = 320, DEFAULT_H = 480;
const STORAGE_KEY = "sciflow-panel-size";

function loadSize(): { w: number; h: number } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const { w, h } = JSON.parse(saved);
      return {
        w: Math.min(MAX_W, Math.max(MIN_W, w || DEFAULT_W)),
        h: Math.min(MAX_H, Math.max(MIN_H, h || DEFAULT_H)),
      };
    }
  } catch { /* ignore */ }
  return { w: DEFAULT_W, h: DEFAULT_H };
}

// 内置默认价格（与 token-tracker.ts 保持一致）
const DEFAULT_MODEL_PRICING: Record<string, { input: number; cachedInput: number; output: number }> = {
  "claude-opus-4-8": { input: 15, cachedInput: 1.5, output: 75 },
  "claude-sonnet-5": { input: 3, cachedInput: 0.3, output: 15 },
  "claude-haiku-4-5": { input: 0.8, cachedInput: 0.08, output: 4 },
  "deepseek-v4-pro": { input: 0.5, cachedInput: 0.05, output: 2 },
  "deepseek-v4": { input: 0.3, cachedInput: 0.03, output: 1 },
  "mimo-v2.5-pro": { input: 0.5, cachedInput: 0.05, output: 2 },
  "mimo-v2-flash": { input: 0.1, cachedInput: 0.01, output: 0.4 },
};
const DEFAULT_PRICES = { input: 3, cachedInput: 0.3, output: 15 };

function getDefaultPrice(tier: string): number {
  return DEFAULT_PRICES[tier as keyof typeof DEFAULT_PRICES] ?? 0;
}

/** 用自定义价格重新计算 token 费用 */
function recalcCost(
  inputTokens: number,
  outputTokens: number,
  cachedTokens: number,
  customPricing: { input: number; cachedInput: number; output: number },
): number {
  const nonCachedInput = Math.max(0, inputTokens - cachedTokens);
  return (
    (nonCachedInput * customPricing.input +
      cachedTokens * customPricing.cachedInput +
      outputTokens * customPricing.output) /
    1_000_000
  );
}

export default function FloatingTokenPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"overview" | "trend" | "ranking" | "recent" | "traces">("overview");
  const [stats, setStats] = useState<TokenStats | null>(null);

  // ===== 预算设置 =====
  const [dailyBudget, setDailyBudget] = useState(() => {
    if (typeof window === "undefined") return 5.0;
    const saved = localStorage.getItem("sciflow_daily_budget");
    return saved ? parseFloat(saved) : 5.0;
  });

  // ===== 自定义模型价格 =====
  const [showPricing, setShowPricing] = useState(false);
  const [modelPricing, setModelPricing] = useState(() => {
    if (typeof window === "undefined") return null;
    const saved = localStorage.getItem("sciflow_model_pricing");
    return saved ? JSON.parse(saved) : null;
  });

  // ===== 趋势时间范围 =====
  const [trendRange, setTrendRange] = useState<"24h" | "7d" | "30d">("24h");

  // ===== 可拖拽面板位置 =====
  const [position, setPosition] = useState({ x: 16, y: 600 });
  const [positionLoaded, setPositionLoaded] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const positionRef = useRef(position);

  // ===== 可调尺寸 =====
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const [sizeLoaded, setSizeLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  // 从 localStorage 加载面板位置和尺寸（仅客户端）
  useEffect(() => {
    try {
      const savedPos = localStorage.getItem("sciflow_token_panel_pos");
      let x = 16;
      let y = typeof window !== "undefined" ? window.innerHeight - 56 : 600;
      if (savedPos) {
        const parsed = JSON.parse(savedPos);
        x = parsed.x;
        y = parsed.y;
      }
      // clamp 到视口内（收起时 48px 高，展开时用 size.h）
      const maxW = typeof window !== "undefined" ? window.innerWidth - 60 : 1200;
      const maxH = typeof window !== "undefined" ? window.innerHeight - 56 : 600;
      setPosition({ x: Math.max(0, Math.min(x, maxW)), y: Math.max(0, Math.min(y, maxH)) });
    } catch {
      setPosition({ x: 16, y: typeof window !== "undefined" ? window.innerHeight - 56 : 600 });
    }
    setPositionLoaded(true);
    setSize(loadSize());
    setSizeLoaded(true);
  }, []);

  // 同步 position 到 ref（供拖拽 mouseup 回调读取最新值）
  useEffect(() => {
    positionRef.current = position;
  }, [position]);

  // 保存尺寸到 localStorage
  const saveSize = useCallback((w: number, h: number) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ w, h })); } catch { /* ignore */ }
  }, []);

  // 拖拽调整大小
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      e.preventDefault();
      const { startX, startY, startW, startH } = resizeRef.current;
      const newW = Math.min(MAX_W, Math.max(MIN_W, startW + (e.clientX - startX)));
      const newH = Math.min(MAX_H, Math.max(MIN_H, startH + (e.clientY - startY)));
      setSize({ w: newW, h: newH });
    };
    const onMouseUp = () => {
      if (resizeRef.current) {
        resizeRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setSize((s) => { saveSize(s.w, s.h); return s; });
      }
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [saveSize]);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";
  }, [size]);

  // ===== 面板拖拽移动 =====
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    // 只允许左键拖拽，且不拦截按钮点击
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("button")) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const newPos = { x: dragStartRef.current.posX + dx, y: dragStartRef.current.posY + dy };
      setPosition(newPos);
      positionRef.current = newPos;
    };
    const handleUp = () => {
      setIsDragging(false);
      const finalPos = positionRef.current;
      try {
        localStorage.setItem("sciflow_token_panel_pos", JSON.stringify(finalPos));
      } catch { /* ignore */ }
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging]);

  // 数据加载
  useEffect(() => {
    if (!open) return;
    const load = () => fetch("/api/token-usage").then((r) => r.json()).then(setStats).catch((err) => {
      console.error("[TokenPanel] Failed to load token stats:", err);
    });
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [open]);

  const t = stats?.totals;

  return (
    <div
      className="z-40 font-sans"
      style={positionLoaded
        ? { position: "fixed", left: position.x, top: position.y }
        : { position: "fixed", left: 16, bottom: 16 }
      }
    >
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="bg-gray-900 text-white rounded-full px-3 py-2 text-xs shadow-lg hover:bg-gray-800 transition-all flex items-center gap-1.5"
        >
          <span>⚡</span>
          <span>{t ? `${((t.inputTokens + t.outputTokens) / 1000).toFixed(1)}k tok` : "Token"}</span>
        </button>
      )}

      {open && (
        <div className="flex flex-col items-start gap-2">
          <div
            ref={panelRef}
            className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden flex flex-col relative"
            style={sizeLoaded ? { width: size.w, height: size.h } : { width: DEFAULT_W, maxHeight: DEFAULT_H }}
          >
            {/* 标题栏：可拖拽移动 */}
            <div
              className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between bg-gray-50 shrink-0 select-none"
              style={{ cursor: isDragging ? "grabbing" : "grab" }}
              onMouseDown={handleDragStart}
            >
              <span className="text-sm font-semibold text-gray-800">⚡ Token 消耗</span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400">{size.w}×{size.h}</span>
                <button
                  onClick={() => setOpen(false)}
                  className="text-gray-400 hover:text-gray-600 text-lg leading-none"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  ×
                </button>
              </div>
            </div>

            <div className="flex border-b border-gray-100 text-xs shrink-0">
              {([["overview","概览"],["trend","趋势"],["ranking","排行"],["recent","明细"],["traces","Traces"]] as const).map(([key,label]) => (
                <button key={key} onClick={() => setTab(key)}
                  className={`flex-1 py-2 ${tab === key ? "text-blue-600 border-b-2 border-blue-600 font-medium" : "text-gray-500 hover:text-gray-700"}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3">
              {!stats && tab !== "traces" ? <div className="text-center text-gray-400 text-xs py-8">加载中...</div>
              : tab === "overview" ? (
                <OverviewTab
                  stats={stats!}
                  dailyBudget={dailyBudget}
                  setDailyBudget={setDailyBudget}
                  showPricing={showPricing}
                  setShowPricing={setShowPricing}
                  modelPricing={modelPricing}
                  setModelPricing={setModelPricing}
                  customPricing={modelPricing}
                />
              )
              : tab === "trend" ? <TrendTab stats={stats!} range={trendRange} onRangeChange={setTrendRange} />
              : tab === "ranking" ? <RankingTab stats={stats!} />
              : tab === "recent" ? <RecentTab stats={stats!} />
              : <TracesTab />}
            </div>

            {/* 拖拽调整大小手柄（右下角） */}
            <div
              onMouseDown={onResizeStart}
              className="absolute bottom-0 right-0 w-5 h-5 cursor-nwse-resize group"
              title="拖拽调整大小"
            >
              <svg
                className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors absolute bottom-0.5 right-0.5"
                viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"
              >
                <path d="M14 2L2 14M14 8L8 14M14 14L14 14" strokeLinecap="round" />
              </svg>
            </div>
          </div>

          <button
            onClick={() => setOpen(false)}
            className="bg-gray-900 text-white rounded-full px-3 py-2 text-xs shadow-lg hover:bg-gray-800 transition-all flex items-center gap-1.5"
          >
            <span>⚡</span>
            <span>收起</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ==================== 概览 Tab ====================
function OverviewTab({
  stats,
  dailyBudget,
  setDailyBudget,
  showPricing,
  setShowPricing,
  modelPricing,
  setModelPricing,
  customPricing,
}: {
  stats: TokenStats;
  dailyBudget: number;
  setDailyBudget: (v: number) => void;
  showPricing: boolean;
  setShowPricing: (v: boolean) => void;
  modelPricing: { input: number; cachedInput: number; output: number } | null;
  setModelPricing: (v: { input: number; cachedInput: number; output: number } | null) => void;
  customPricing: { input: number; cachedInput: number; output: number } | null;
}) {
  const t = stats.totals;

  // 使用自定义价格重新计算今日费用
  const todayCost = stats.recentRecords
    .filter((r) => new Date(r.timestamp).toDateString() === new Date().toDateString())
    .reduce((sum, r) => {
      if (customPricing) {
        return sum + recalcCost(r.inputTokens, r.outputTokens, 0, customPricing);
      }
      return sum + (r.costUSD || 0);
    }, 0);

  // 使用自定义价格重新计算累计费用
  const adjustedCostUSD = customPricing
    ? stats.recentRecords.reduce(
        (sum, r) => sum + recalcCost(r.inputTokens, r.outputTokens, 0, customPricing),
        0,
      )
    : t.costUSD;

  const budgetPercent = Math.min(100, (todayCost / dailyBudget) * 100);
  const budgetExceeded = todayCost >= dailyBudget;
  const budgetWarning = todayCost >= dailyBudget * 0.8;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Card label="成功调用" value={`${t.successfulCalls} 次`} sub={t.retryCalls > 0 ? `含重试 ${t.retryCalls} 次` : undefined} />
        <Card label="总 Token" value={((t.inputTokens + t.outputTokens) / 1000).toFixed(1) + "k"} />
        <Card label="输入" value={(t.inputTokens / 1000).toFixed(1) + "k"} sub={`缓存 ${(t.cachedTokens / 1000).toFixed(1)}k`} />
        <Card label="输出" value={(t.outputTokens / 1000).toFixed(1) + "k"} />
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
        <div className="text-xs text-amber-700 font-medium">💰 费用估算</div>
        <div className="text-lg font-bold text-amber-800 mt-1">
          ${adjustedCostUSD.toFixed(4)} <span className="text-sm font-normal text-amber-600">≈ ¥{(adjustedCostUSD * 7.2).toFixed(3)}</span>
        </div>
      </div>

      {/* 预算进度条 */}
      <div className="mt-3 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-500">今日预算</span>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-medium ${budgetExceeded ? "text-red-600" : budgetWarning ? "text-amber-600" : "text-gray-700"}`}>
              ${todayCost.toFixed(2)} / ${dailyBudget.toFixed(2)}
            </span>
            <button
              onClick={() => {
                const input = prompt("设置每日预算（美元）：", dailyBudget.toString());
                if (input && !isNaN(parseFloat(input))) {
                  const val = parseFloat(input);
                  setDailyBudget(val);
                  localStorage.setItem("sciflow_daily_budget", val.toString());
                }
              }}
              className="text-[10px] text-gray-400 hover:text-gray-600"
              title="修改预算"
            >
              ✏️
            </button>
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-500 ${
              budgetExceeded ? "bg-red-500" : budgetWarning ? "bg-amber-400" : "bg-blue-500"
            }`}
            style={{ width: `${budgetPercent}%` }}
          />
        </div>
        {budgetExceeded && (
          <p className="text-[10px] text-red-500 mt-1.5">⚠️ 今日费用已超出预算上限</p>
        )}
      </div>

      {/* 模型价格设置 */}
      <div className="mt-2">
        <button
          onClick={() => setShowPricing(!showPricing)}
          className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1"
        >
          {showPricing ? "▼" : "▶"} 模型价格设置
          {modelPricing && <span className="text-green-500 ml-1">（已自定义）</span>}
        </button>
        {showPricing && (
          <div className="mt-2 p-2 bg-gray-50 rounded text-[10px] space-y-1.5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-gray-500">自定义每百万 token 价格（美元）</p>
              {modelPricing && (
                <button
                  onClick={() => {
                    setModelPricing(null);
                    localStorage.removeItem("sciflow_model_pricing");
                  }}
                  className="text-red-400 hover:text-red-600"
                >
                  重置
                </button>
              )}
            </div>
            {(["input", "cachedInput", "output"] as const).map((tier) => (
              <div key={tier} className="flex items-center gap-2">
                <span className="w-20 text-gray-500">{tier === "input" ? "输入" : tier === "cachedInput" ? "缓存输入" : "输出"}:</span>
                <input
                  type="number"
                  defaultValue={modelPricing?.[tier] ?? getDefaultPrice(tier)}
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val)) {
                      const updated = { ...(modelPricing || { ...DEFAULT_PRICES }), [tier]: val };
                      setModelPricing(updated);
                      localStorage.setItem("sciflow_model_pricing", JSON.stringify(updated));
                    }
                  }}
                  className="w-20 px-1.5 py-0.5 border rounded text-[10px]"
                />
                <span className="text-gray-400">$</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ==================== 趋势 Tab ====================
function TrendTab({
  stats,
  range,
  onRangeChange,
}: {
  stats: TokenStats;
  range: "24h" | "7d" | "30d";
  onRangeChange: (r: "24h" | "7d" | "30d") => void;
}) {
  const now = Date.now();
  // 根据选择的时间范围过滤小时数据
  const rangeMs = range === "24h" ? 24 * 60 * 60 * 1000 : range === "7d" ? 7 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
  const filteredHourly = stats.hourly.filter((h) => {
    const hourMs = new Date(h.hour).getTime();
    return now - hourMs <= rangeMs;
  });

  const maxTok = Math.max(...filteredHourly.map((h) => h.inputTokens + h.outputTokens), 1);

  return (
    <div className="space-y-1">
      {/* 时间范围选择器 */}
      <div className="flex items-center gap-1 mb-3">
        {(["24h", "7d", "30d"] as const).map((r) => (
          <button
            key={r}
            onClick={() => onRangeChange(r)}
            className={`px-2 py-0.5 text-[10px] rounded ${
              range === r ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            {r}
          </button>
        ))}
      </div>

      {!filteredHourly.length ? (
        <div className="text-center text-gray-400 text-xs py-4">暂无数据</div>
      ) : (
        filteredHourly.map((h) => {
          const total = h.inputTokens + h.outputTokens;
          return (
            <div key={h.hour} className="flex items-center gap-2 text-xs">
              <span className="text-gray-400 w-12 shrink-0">{h.hour.slice(11)}h</span>
              <div className="flex-1 bg-gray-100 rounded-full h-3.5 overflow-hidden">
                <div className="bg-blue-500 h-full rounded-full" style={{ width: `${(total / maxTok) * 100}%` }} />
              </div>
              <span className="text-gray-500 w-14 text-right shrink-0">{(total / 1000).toFixed(1)}k</span>
            </div>
          );
        })
      )}
    </div>
  );
}

// ==================== 排行 Tab ====================
function RankingTab({ stats }: { stats: TokenStats }) {
  if (!stats.featureRanking.length) return <div className="text-center text-gray-400 text-xs py-4">暂无数据</div>;
  return (
    <div className="space-y-1.5">
      {stats.featureRanking.map((f) => (
        <div key={f.feature} className="flex items-center justify-between text-xs p-2 bg-gray-50 rounded-lg">
          <div>
            <span className="font-medium">{FEATURE_LABELS[f.feature] || f.feature}</span>
            <span className="text-gray-400 ml-1.5">{f.calls}次</span>
          </div>
          <div className="text-right">
            <div className="font-medium">{((f.inputTokens + f.outputTokens) / 1000).toFixed(1)}k</div>
            <div className="text-gray-400">${f.costUSD.toFixed(4)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ==================== 明细 Tab ====================
function RecentTab({ stats }: { stats: TokenStats }) {
  if (!stats.recentRecords.length) return <div className="text-center text-gray-400 text-xs py-4">暂无记录</div>;
  return (
    <div className="space-y-1.5">
      {stats.recentRecords.map((r) => (
        <div key={r.id} className="text-xs p-2 bg-gray-50 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="font-medium">{FEATURE_LABELS[r.feature] || r.feature}</span>
            <span className="text-gray-400">{r.durationMs}ms</span>
          </div>
          <div className="text-gray-500 mt-0.5">
            {r.model} · in:{(r.inputTokens/1000).toFixed(1)}k out:{(r.outputTokens/1000).toFixed(1)}k · ${r.costUSD.toFixed(4)}
          </div>
        </div>
      ))}
    </div>
  );
}

// ==================== 通用卡片 ====================
function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="text-sm font-semibold text-gray-800">{value}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  );
}
