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

export default function FloatingTokenPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"overview" | "trend" | "ranking" | "recent" | "traces">("overview");
  const [stats, setStats] = useState<TokenStats | null>(null);

  // ===== 可调尺寸 =====
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const [sizeLoaded, setSizeLoaded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startX: number; startY: number; startW: number; startH: number } | null>(null);

  // 从 localStorage 加载尺寸（仅客户端）
  useEffect(() => {
    setSize(loadSize());
    setSizeLoaded(true);
  }, []);

  // 保存尺寸到 localStorage
  const saveSize = useCallback((w: number, h: number) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ w, h })); } catch { /* ignore */ }
  }, []);

  // 拖拽调整大小
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      e.preventDefault();
      const { startX, startY, startW, startH } = dragRef.current;
      const newW = Math.min(MAX_W, Math.max(MIN_W, startW + (e.clientX - startX)));
      const newH = Math.min(MAX_H, Math.max(MIN_H, startH + (e.clientY - startY)));
      setSize({ w: newW, h: newH });
    };
    const onMouseUp = () => {
      if (dragRef.current) {
        dragRef.current = null;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        // 保存最终尺寸
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
    dragRef.current = { startX: e.clientX, startY: e.clientY, startW: size.w, startH: size.h };
    document.body.style.cursor = "nwse-resize";
    document.body.style.userSelect = "none";
  }, [size]);

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
    <div className="fixed bottom-4 left-4 z-40 font-sans md:left-[calc(240px+1rem)]">
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
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between bg-gray-50 shrink-0">
            <span className="text-sm font-semibold text-gray-800">⚡ Token 消耗</span>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400">{size.w}×{size.h}</span>
              <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
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
            : tab === "overview" ? <OverviewTab stats={stats!} />
            : tab === "trend" ? <TrendTab stats={stats!} />
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

function OverviewTab({ stats }: { stats: TokenStats }) {
  const t = stats.totals;
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
          ${t.costUSD.toFixed(4)} <span className="text-sm font-normal text-amber-600">≈ ¥{t.costCNY.toFixed(3)}</span>
        </div>
      </div>
    </div>
  );
}

function TrendTab({ stats }: { stats: TokenStats }) {
  const maxTok = Math.max(...stats.hourly.map((h) => h.inputTokens + h.outputTokens), 1);
  if (!stats.hourly.length) return <div className="text-center text-gray-400 text-xs py-4">暂无数据</div>;
  return (
    <div className="space-y-1">
      {stats.hourly.map((h) => {
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
      })}
    </div>
  );
}

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

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-2">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="text-sm font-semibold text-gray-800">{value}</div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  );
}
