"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useParams } from "next/navigation";
import { ExperimentDesignCard } from "@/components/experiment/design-card";
import { ProcessAssistant } from "@/components/assistant/process-assistant";
import { analyzeProjectState } from "@/lib/assistant/process-assistant";
import { useProjectStore } from "@/store/project-store";
import { consumeSSEStream } from "@/lib/llm/sse-consumer";
import type { ExperimentDesign } from "@/lib/llm/experiment-design";

type ExperimentStatus = "designed" | "running" | "completed" | "failed";

interface Experiment {
  id: string;
  name: string;
  type: string;
  status: ExperimentStatus;
  createdAt: string;
  protocol: Record<string, unknown>;
}

const STATUS_CONFIG: Record<ExperimentStatus, { label: string; color: string; bg: string }> = {
  designed:  { label: "已设计", color: "text-blue-700",   bg: "bg-blue-100" },
  running:   { label: "进行中", color: "text-amber-700",  bg: "bg-amber-100" },
  completed: { label: "已完成", color: "text-green-700",  bg: "bg-green-100" },
  failed:    { label: "已失败", color: "text-red-700",     bg: "bg-red-100" },
};

export default function ExperimentsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { papers, matrix } = useProjectStore();

  // Tab state
  const [activeTab, setActiveTab] = useState<"design" | "list">("design");

  // Design view state
  const [view, setView] = useState<"input" | "generating" | "result">("input");
  const [hypothesis, setHypothesis] = useState("");
  const [gapOrConflict, setGapOrConflict] = useState("");
  const [design, setDesign] = useState<ExperimentDesign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState("");

  // Experiment list state
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [listLoading, setListLoading] = useState(false);

  // 从 store 提取上下文
  const extractedPapers = papers.filter(
    (p) => p.extractionStatus === "done" && p.experiments.length > 0
  );

  const matrixSummary = matrix
    ? `${matrix.totalPapers} 篇文献，${matrix.totalExperiments} 个实验，${matrix.columns.length} 个维度。` +
      (matrix.conflicts.length > 0
        ? ` 冲突：${matrix.conflicts.map((c) => c.columnId.split(":")[1]).join("、")}。`
        : "")
    : "暂无机制矩阵数据";

  // 从待办清单和冲突中提取建议
  const suggestions: string[] = [];
  if (matrix?.conflicts) {
    for (const c of matrix.conflicts) {
      suggestions.push(
        `验证 ${c.columnId.split(":")[1]} 的矛盾：${c.description}`
      );
    }
  }
  if (matrix?.gaps && matrix.gaps.length > 0) {
    const uniqueGaps = [...new Set(matrix.gaps.map((g) => g.columnId.split(":")[1]))].slice(0, 3);
    suggestions.push(`探索空白领域：${uniqueGaps.join("、")}`);
  }

  // Fetch experiment list
  const fetchExperiments = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/experiments`);
      if (!res.ok) throw new Error("获取实验列表失败");
      const data = await res.json();
      setExperiments(data.experiments ?? []);
    } catch (err) {
      console.error("Failed to fetch experiments:", err);
      toast.error("获取实验列表失败");
    } finally {
      setListLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (activeTab === "list") {
      fetchExperiments();
    }
  }, [activeTab, fetchExperiments]);

  async function handleStatusChange(experimentId: string, newStatus: ExperimentStatus) {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/experiments/${experimentId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "状态更新失败");
      }
      setExperiments((prev) =>
        prev.map((e) => (e.id === experimentId ? { ...e, status: newStatus } : e))
      );
      toast.success("状态已更新");
    } catch (err) {
      toast.error("状态更新失败", {
        description: err instanceof Error ? err.message : "请稍后重试",
      });
    }
  }

  async function handleGenerate() {
    if (!hypothesis.trim()) return;

    setView("generating");
    setError(null);

    setProgressMessage("");

    let res: Response;
    try {
      res = await fetch("/api/experiments/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hypothesis,
          matrixSummary,
          existingExperiments: extractedPapers.flatMap((p) =>
            p.experiments.map((e) => e.conclusion)
          ),
          gapOrConflict: gapOrConflict || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "生成失败");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "生成失败");
      setView("input");
      return;
    }

    consumeSSEStream(res, {
      onProgress: (step) => {
        setProgressMessage(step || "正在生成...");
      },
      onResult: (data) => {
        setDesign(data as ExperimentDesign);
        setView("result");
      },
      onError: (message) => {
        setError(message);
        setView("input");
      },
      onDone: () => {},
    });
  }

  async function handleSave() {
    if (!design) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/experiments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: design.name,
          type: "custom",
          protocol: design.protocol,
          variables: design.variables,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "保存失败");
      }
      toast.success("实验方案已保存", { description: "可在实验列表中查看" });
    } catch (err) {
      toast.error("保存失败", {
        description: err instanceof Error ? err.message : "请稍后重试",
      });
    }
  }

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">🧪 实验管理</h1>
          <p className="text-gray-500 text-sm">
            设计实验方案、管理实验状态、追踪实验进展
          </p>
        </div>
        <a
          href={`/project/${projectId}/experiments/troubleshoot`}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
        >
          🔬 实验排障
        </a>
      </div>

      {/* 过程助手 */}
      <ProcessAssistant
        cards={analyzeProjectState({
          papers,
          matrix,
          hasExperiments: extractedPapers.length > 0,
          currentPath: `/project/${projectId}/experiments`,
        })}
        basePath={`/project/${projectId}`}
      />

      {/* Tab 系统 */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        <button
          onClick={() => setActiveTab("design")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "design"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          🤖 设计实验
        </button>
        <button
          onClick={() => setActiveTab("list")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "list"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          📋 实验列表
          {experiments.length > 0 && (
            <span className="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-gray-200 text-gray-600">
              {experiments.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab: 设计实验 */}
      {activeTab === "design" && (
        <>
          {/* 输入表单 */}
          {view === "input" && (
            <div className="space-y-6">
              {/* 假设输入 */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  你要验证什么假设？
                </label>
                <textarea
                  value={hypothesis}
                  onChange={(e) => setHypothesis(e.target.value)}
                  placeholder="例：sorafenib 通过 NF-κB 通路上调 HCC 细胞中的 PD-L1 表达"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
              </div>

              {/* 建议（来自矩阵分析） */}
              {suggestions.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">
                    💡 基于你的机制矩阵，这些建议值得考虑：
                  </label>
                  <div className="space-y-2">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => setGapOrConflict(s)}
                        className={`w-full text-left p-3 text-sm border rounded-lg transition-colors ${
                          gapOrConflict === s
                            ? "border-blue-500 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300 bg-white"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 上下文预览 */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-xs text-gray-500">
                <p className="font-medium text-gray-600 mb-1">AI 将参考以下上下文：</p>
                <p>📚 {extractedPapers.length} 篇已提取文献</p>
                <p>📊 机制矩阵：{matrixSummary}</p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  ⚠️ {error}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={!hypothesis.trim()}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
              >
                🤖 生成实验方案
              </button>
            </div>
          )}

          {/* 生成中 */}
          {view === "generating" && (
            <div className="text-center py-12 space-y-3">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600" />
              <p className="text-sm text-gray-500">
                {progressMessage || "正在设计实验方案..."}
              </p>
              <p className="text-xs text-gray-400">
                AI 正在分析你的机制矩阵和假设，通常需要 30-60 秒
              </p>
            </div>
          )}

          {/* 结果 */}
          {view === "result" && design && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  ✅ 实验方案已生成
                </p>
                <button
                  onClick={() => {
                    setView("input");
                    setDesign(null);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  重新设计
                </button>
              </div>
              <ExperimentDesignCard
                design={design}
                onSave={handleSave}
              />
            </div>
          )}
        </>
      )}

      {/* Tab: 实验列表 */}
      {activeTab === "list" && (
        <div className="space-y-4">
          {listLoading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600" />
              <p className="text-sm text-gray-500 mt-3">加载中...</p>
            </div>
          ) : experiments.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p className="text-3xl mb-2">🧪</p>
              <p className="text-sm">暂无实验</p>
              <p className="text-xs mt-1">切换到「设计实验」标签页开始设计</p>
            </div>
          ) : (
            experiments.map((exp) => {
              const statusCfg = STATUS_CONFIG[exp.status] ?? STATUS_CONFIG.designed;
              return (
                <div
                  key={exp.id}
                  className="border border-gray-200 rounded-xl p-4 bg-white hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-medium text-gray-900 truncate">
                          {exp.name}
                        </h3>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.color} ${statusCfg.bg}`}
                        >
                          {statusCfg.label}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 space-y-0.5">
                        <p>类型：{exp.type}</p>
                        <p>创建：{new Date(exp.createdAt).toLocaleDateString("zh-CN")}</p>
                      </div>
                    </div>
                    <select
                      value={exp.status}
                      onChange={(e) =>
                        handleStatusChange(exp.id, e.target.value as ExperimentStatus)
                      }
                      className="ml-4 text-xs border border-gray-300 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      {Object.entries(STATUS_CONFIG).map(([val, cfg]) => (
                        <option key={val} value={val}>
                          {cfg.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </main>
  );
}
