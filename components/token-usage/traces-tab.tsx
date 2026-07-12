"use client";

import { useState, useEffect, useCallback } from "react";

interface LangfuseTrace {
  id: string;
  name: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
  tags?: string[];
}

interface LangfuseObservation {
  id: string;
  type: string;
  name: string;
  model?: string;
  input?: unknown;
  output?: unknown;
  usageDetails?: { input?: number; output?: number; total?: number };
  metadata?: Record<string, unknown>;
  startTime: string;
  endTime?: string;
  level?: string;
}

interface TracesResponse {
  traces: LangfuseTrace[];
  enabled: boolean;
  error?: string;
}

interface ObservationsResponse {
  observations: LangfuseObservation[];
  enabled: boolean;
}

const FEATURE_EMOJI: Record<string, string> = {
  extraction: "🔬", chat: "💬", design: "🧪", troubleshoot: "🔧",
  analysis: "📊", manuscript: "📝", review: "🎭", preprocess: "🔍",
  "tool-use-stream": "🛠️", streaming: "📡",
};

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function TracesTab() {
  const [traces, setTraces] = useState<LangfuseTrace[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<string | null>(null);
  const [observations, setObservations] = useState<LangfuseObservation[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // 加载 traces 列表
  const loadTraces = useCallback(async () => {
    try {
      const resp = await fetch("/api/langfuse/traces?limit=20");
      const data: TracesResponse = await resp.json();
      setEnabled(data.enabled);
      setTraces(data.traces);
      setError(data.error || null);
    } catch (err) {
      setError((err as Error)?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTraces();
    const interval = setInterval(loadTraces, 15_000);
    return () => clearInterval(interval);
  }, [loadTraces]);

  // 加载 trace 详情
  const loadDetail = async (traceId: string) => {
    setSelectedTrace(traceId);
    setLoadingDetail(true);
    try {
      const resp = await fetch(`/api/langfuse/traces?traceId=${traceId}`);
      const data: ObservationsResponse = await resp.json();
      setObservations(data.observations);
    } catch {
      setObservations([]);
    } finally {
      setLoadingDetail(false);
    }
  };

  // 未配置
  if (!enabled) {
    return (
      <div className="text-center py-8">
        <div className="text-gray-300 text-2xl mb-2">📊</div>
        <div className="text-xs text-gray-500">Langfuse 未配置</div>
        <div className="text-[10px] text-gray-400 mt-1">配置 API Key 后可查看 LLM 调用详情</div>
      </div>
    );
  }

  // 加载中
  if (loading) {
    return <div className="text-center text-gray-400 text-xs py-8">加载 traces...</div>;
  }

  // 错误
  if (error && !traces.length) {
    return (
      <div className="text-center py-6">
        <div className="text-xs text-red-400">加载失败: {error}</div>
        <button onClick={loadTraces} className="text-xs text-blue-500 mt-2 hover:underline">重试</button>
      </div>
    );
  }

  // 详情视图
  if (selectedTrace) {
    const trace = traces.find((t) => t.id === selectedTrace);
    return (
      <div className="space-y-2">
        <button
          onClick={() => { setSelectedTrace(null); setObservations([]); }}
          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
        >
          ← 返回列表
        </button>

        <div className="text-xs font-medium text-gray-800 truncate">
          {FEATURE_EMOJI[trace?.name || ""] || "📊"} {trace?.name || selectedTrace}
        </div>

        {loadingDetail ? (
          <div className="text-center text-gray-400 text-xs py-4">加载详情...</div>
        ) : observations.length === 0 ? (
          <div className="text-center text-gray-400 text-xs py-4">无 observations</div>
        ) : (
          observations.filter((o) => o.type === "GENERATION").map((obs) => (
            <div key={obs.id} className="space-y-2">
              {/* 元信息 */}
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-gray-500">
                {obs.model && <span>🤖 {obs.model}</span>}
                {obs.usageDetails && (
                  <span>
                    📥 {(obs.usageDetails.input || 0).toLocaleString()} / 📤 {(obs.usageDetails.output || 0).toLocaleString()}
                  </span>
                )}
                {obs.startTime && obs.endTime && (
                  <span>⏱ {formatMs(new Date(obs.endTime).getTime() - new Date(obs.startTime).getTime())}</span>
                )}
                {obs.level === "ERROR" && <span className="text-red-500">❌ ERROR</span>}
              </div>

              {/* Input */}
              <CollapsibleBlock
                label="📥 Input"
                content={formatJSON(obs.input)}
                color="blue"
              />

              {/* Output */}
              <CollapsibleBlock
                label="📤 Output"
                content={formatJSON(obs.output)}
                color="green"
              />
            </div>
          ))
        )}
      </div>
    );
  }

  // 列表视图
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-600">最近 LLM 调用</span>
        <button onClick={loadTraces} className="text-[10px] text-gray-400 hover:text-gray-600">
          ↻ 刷新
        </button>
      </div>

      {traces.length === 0 ? (
        <div className="text-center text-gray-400 text-xs py-6">暂无 traces</div>
      ) : (
        traces.map((trace) => (
          <button
            key={trace.id}
            onClick={() => loadDetail(trace.id)}
            className="w-full text-left text-xs p-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-gray-800 truncate">
                {FEATURE_EMOJI[trace.name] || "📊"} {trace.name}
              </span>
              <span className="text-gray-400 text-[10px] shrink-0">{timeAgo(trace.timestamp)}</span>
            </div>
            <div className="text-[10px] text-gray-400 mt-0.5 truncate">
              {trace.id.slice(0, 8)}...
            </div>
          </button>
        ))
      )}
    </div>
  );
}

// ===== 折叠块（显示 prompt/output） =====

function CollapsibleBlock({ label, content, color }: { label: string; content: string; color: "blue" | "green" }) {
  const [expanded, setExpanded] = useState(false);
  const preview = content.length > 120 ? content.slice(0, 120) + "..." : content;

  const borderColor = color === "blue" ? "border-blue-200" : "border-green-200";
  const bgColor = color === "blue" ? "bg-blue-50" : "bg-green-50";

  return (
    <div className={`border ${borderColor} rounded-lg overflow-hidden`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full text-left text-[10px] px-2 py-1.5 ${bgColor} flex items-center justify-between`}
      >
        <span className="font-medium">{label}</span>
        <span className="text-gray-400">{expanded ? "▲" : "▼"}</span>
      </button>
      <div className="px-2 py-1.5 text-[10px] text-gray-600 font-mono whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
        {expanded ? content : preview}
      </div>
    </div>
  );
}

// ===== JSON 格式化 =====

function formatJSON(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
