"use client";

import { useState, useEffect, useCallback } from "react";
import {
  FileText,
  RefreshCw,
  AlertTriangle,
  Target,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
} from "lucide-react";
import type { AnalysisReport } from "@/lib/llm/literature-analyzer";
import type { MatrixData } from "@/lib/matrix/generator";

interface AnalysisReportPanelProps {
  matrixData: MatrixData;
  projectId: string;
}

export function AnalysisReportPanel({
  matrixData,
  projectId,
}: AnalysisReportPanelProps) {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [streamingSummary, setStreamingSummary] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 组件挂载时尝试从 DB 加载缓存的报告
  useEffect(() => {
    async function loadCached() {
      try {
        const res = await fetch(
          `/api/projects/${projectId}/matrix/analyze`
        );
        if (res.ok) {
          const data = await res.json();
          if (data.report) setReport(data.report);
        }
      } catch {
        /* 无缓存，忽略 */
      }
    }
    loadCached();
  }, [projectId]);

  const handleGenerate = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStreamingSummary("");

    try {
      const res = await fetch(
        `/api/projects/${projectId}/matrix/analyze`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ matrixData }),
        }
      );

      if (!res.ok) throw new Error("生成失败");

      // SSE 流式消费
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);

          // 解析 SSE 事件
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const event = JSON.parse(line.slice(6));
                if (event.type === "text") {
                  fullText += event.text;
                  setStreamingSummary(fullText);
                } else if (event.type === "result") {
                  setReport(event.data);
                  setStreamingSummary("");
                }
              } catch {
                /* 跳过解析错误 */
              }
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setLoading(false);
    }
  }, [matrixData, projectId]);

  // 如果没有报告也没有在加载，显示"生成"按钮
  if (!report && !loading) {
    return (
      <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Sparkles size={20} className="text-indigo-600" />
            <div>
              <h3 className="text-sm font-semibold text-indigo-800">
                文献分析报告
              </h3>
              <p className="text-xs text-indigo-600 mt-0.5">
                基于 {matrixData.totalPapers} 篇论文自动生成全景摘要、矛盾分析和行动建议
              </p>
            </div>
          </div>
          <button
            onClick={handleGenerate}
            className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
          >
            <Sparkles size={14} />
            生成报告
          </button>
        </div>
      </div>
    );
  }

  // 渲染报告
  return (
    <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-xl overflow-hidden">
      {/* 标题栏 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded(!expanded)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setExpanded(!expanded); }}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-indigo-100/30 transition-colors cursor-pointer"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-indigo-800">
          <FileText size={16} className="text-indigo-600" />
          文献分析报告
          {loading && (
            <Loader2
              size={14}
              className="animate-spin text-indigo-500"
            />
          )}
        </span>
        <div className="flex items-center gap-2">
          {!loading && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleGenerate();
              }}
              className="text-xs text-indigo-500 hover:text-indigo-700 flex items-center gap-1"
            >
              <RefreshCw size={12} /> 重新生成
            </button>
          )}
          {expanded ? (
            <ChevronUp size={14} />
          ) : (
            <ChevronDown size={14} />
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 space-y-4">
          {/* 错误提示 */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {/* 全景摘要 */}
          <div>
            <h4 className="text-xs font-semibold text-indigo-700 mb-2 flex items-center gap-1">
              全景摘要
            </h4>
            {loading && streamingSummary ? (
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {streamingSummary}
                <span className="inline-block w-1.5 h-4 bg-indigo-400 animate-pulse ml-0.5" />
              </div>
            ) : report?.summary ? (
              <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {report.summary}
              </div>
            ) : loading ? (
              <div className="text-sm text-gray-400">正在分析中...</div>
            ) : null}
          </div>

          {/* 矛盾分析 */}
          {report?.contradictions &&
            report.contradictions.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-indigo-700 mb-2 flex items-center gap-1">
                  <AlertTriangle
                    size={12}
                    className="text-amber-500"
                  />
                  矛盾分析
                </h4>
                <div className="space-y-2">
                  {report.contradictions.map((c, i) => (
                    <div
                      key={i}
                      className={`p-3 rounded-lg border-l-4 text-sm ${
                        c.severity === "high"
                          ? "bg-red-50 border-red-400"
                          : c.severity === "medium"
                            ? "bg-amber-50 border-amber-400"
                            : "bg-blue-50 border-blue-300"
                      }`}
                    >
                      <span className="font-medium">{c.pathway}</span>
                      <span
                        className={`ml-2 text-xs px-1.5 py-0.5 rounded ${
                          c.severity === "high"
                            ? "bg-red-100 text-red-700"
                            : c.severity === "medium"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {c.severity === "high"
                          ? "高"
                          : c.severity === "medium"
                            ? "中"
                            : "低"}
                      </span>
                      <p className="text-gray-600 mt-1">
                        {c.description}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {/* 行动建议 */}
          {report?.suggestions &&
            report.suggestions.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-indigo-700 mb-2 flex items-center gap-1">
                  <Target size={12} className="text-indigo-500" />
                  行动建议
                </h4>
                <div className="space-y-2">
                  {report.suggestions
                    .sort((a, b) => a.priority - b.priority)
                    .map((s, i) => (
                      <div
                        key={i}
                        className="flex items-start gap-3 p-3 bg-white/70 rounded-lg border border-indigo-100"
                      >
                        <span className="shrink-0 w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center mt-0.5">
                          {s.priority}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800">
                            {s.action}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {s.rationale}
                          </p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
        </div>
      )}
    </div>
  );
}
