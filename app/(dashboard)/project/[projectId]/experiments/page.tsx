"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useParams } from "next/navigation";
import { ExperimentDesignCard } from "@/components/experiment/design-card";
import { ProcessAssistant } from "@/components/assistant/process-assistant";
import { analyzeProjectState } from "@/lib/assistant/process-assistant";
import { useProjectStore } from "@/store/project-store";
import { consumeSSEStream } from "@/lib/llm/streaming";
import type { ExperimentDesign } from "@/lib/llm/experiment-design";

export default function ExperimentsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { papers, matrix } = useProjectStore();

  const [view, setView] = useState<"input" | "generating" | "result">("input");
  const [hypothesis, setHypothesis] = useState("");
  const [gapOrConflict, setGapOrConflict] = useState("");
  const [design, setDesign] = useState<ExperimentDesign | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState("");

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

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">🧪 实验设计</h1>
          <p className="text-gray-500 text-sm">
            基于机制矩阵和假设，AI 帮你设计实验方案
          </p>
        </div>
        <a
          href="experiments/troubleshoot"
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
            onSave={() => {
              // 持久化到数据库
              fetch(`/api/projects/${projectId}/experiments`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: design.name,
                  type: "custom",
                  protocol: design.protocol,
                  variables: design.variables,
                }),
              }).catch(() => {});
              toast.success("实验方案已保存", { description: "可在实验列表中查看" });
            }}
          />
        </div>
      )}
    </main>
  );
}
