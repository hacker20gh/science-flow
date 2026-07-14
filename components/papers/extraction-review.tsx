"use client";

import { useState } from "react";
import type { ExperimentResult } from "@/lib/llm/extraction";

interface PaperExtraction {
  paperId: string;
  title: string;
  extraction: {
    experiments: ExperimentResult[];
  } | null;
  error?: string;
}

interface ExtractionReviewProps {
  extractions: PaperExtraction[];
  onConfirm: (extractions: PaperExtraction[]) => void;
}

export function ExtractionReview({
  extractions,
  onConfirm,
}: ExtractionReviewProps) {
  const [confirmedMap, setConfirmedMap] = useState<Map<string, "confirmed" | "skipped" | "pending">>(
    new Map(extractions.map((e) => [e.paperId, "pending"]))
  );

  function toggleConfirm(paperId: string, status: "confirmed" | "skipped" | "pending") {
    setConfirmedMap((prev) => {
      const next = new Map(prev);
      next.set(paperId, status);
      return next;
    });
  }

  function confirmAll() {
    // 默认全部确认
    setConfirmedMap(new Map(extractions.map((e) => [e.paperId, "confirmed"])));
    onConfirm(extractions.map((e) => ({ ...e, status: "confirmed" })));
  }

  const confirmedCount = Array.from(confirmedMap.values()).filter(
    (v) => v === "confirmed"
  ).length;

  return (
    <div className="space-y-6">
      {/* 汇总 */}
      <div className="flex items-center justify-between bg-white border border-gray-200 rounded-xl p-4">
        <div className="text-sm">
          <span className="font-medium">提取完成</span>{" "}
          <span className="text-gray-500">
            {extractions.length} 篇文献 ·{" "}
            {extractions.filter((e) => e.extraction).length} 篇成功 ·{" "}
            {confirmedCount} 篇已确认
          </span>
        </div>
        <button
          onClick={confirmAll}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          全部确认 → 生成矩阵
        </button>
      </div>

      {/* 逐篇审核 */}
      {extractions.map((paper) => {
        const status = confirmedMap.get(paper.paperId) || "pending";

        if (paper.error) {
          return (
            <div
              key={paper.paperId}
              className="bg-white border border-red-200 rounded-xl p-4"
            >
              <h3 className="font-medium text-sm text-red-700">
                ❌ {paper.title}
              </h3>
              <p className="text-xs text-red-500 mt-1">{paper.error}</p>
            </div>
          );
        }

        if (!paper.extraction) return null;

        const experiments = paper.extraction.experiments;

        return (
          <div
            key={paper.paperId}
            className={`bg-white border rounded-xl overflow-hidden ${
              status === "confirmed"
                ? "border-green-200"
                : status === "skipped"
                  ? "border-gray-200 opacity-60"
                  : "border-gray-200"
            }`}
          >
            {/* 论文标题栏 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="font-medium text-sm truncate pr-4">
                {paper.title}
              </h3>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400">
                  {experiments.length} 个实验
                </span>
                <button
                  onClick={() =>
                    toggleConfirm(
                      paper.paperId,
                      status === "confirmed" ? "pending" : "confirmed"
                    )
                  }
                  className={`px-2 py-1 text-xs rounded ${
                    status === "confirmed"
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {status === "confirmed" ? "✅ 已确认" : "确认"}
                </button>
                <button
                  onClick={() =>
                    toggleConfirm(
                      paper.paperId,
                      status === "skipped" ? "pending" : "skipped"
                    )
                  }
                  className={`px-2 py-1 text-xs rounded ${
                    status === "skipped"
                      ? "bg-gray-200 text-gray-500"
                      : "text-gray-400 hover:bg-gray-100"
                  }`}
                >
                  {status === "skipped" ? "已跳过" : "跳过"}
                </button>
              </div>
            </div>

            {/* 实验列表 */}
            <div className="divide-y divide-gray-50">
              {experiments.map((exp, idx) => (
                <ExperimentCard key={idx} experiment={exp} index={idx + 1} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ExperimentCard({
  experiment,
  index,
}: {
  experiment: ExperimentResult;
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);

  const iv = experiment.intervention;
  const model = experiment.model;

  return (
    <div className="px-4 py-3 hover:bg-gray-50">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-xs text-gray-400 font-mono shrink-0">
            #{index}
          </span>
          <div className="min-w-0">
            <span className="text-sm font-medium">
              {iv.target}
              {iv.concentration && ` ${iv.concentration}`}
              {iv.duration && ` · ${iv.duration}`}
            </span>
            <span className="text-xs text-gray-400 ml-2">
              {model.cell_line}
              {model.species && ` · ${model.species}`}
            </span>
          </div>
        </div>
        <span className="text-xs text-gray-400 shrink-0">
          {experiment.pathway_effects.length + experiment.phenotype_effects.length} 项发现
        </span>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2 text-xs">
          {/* 通路变化 */}
          {experiment.pathway_effects.length > 0 && (
            <div>
              <span className="font-medium text-gray-600">通路变化：</span>
              {experiment.pathway_effects.map((p, i) => (
                <span key={i} className="ml-2">
                  {p.pathway}{" "}
                  <span className={p.direction === "up" ? "text-green-600" : p.direction === "down" ? "text-red-600" : "text-gray-500"}>
                    {p.direction === "up" ? "↑" : p.direction === "down" ? "↓" : "—"}
                  </span>
                  {p.significance && (
                    <span className="text-gray-400"> ({p.significance})</span>
                  )}
                  {p.method && (
                    <span className="text-gray-400"> [{p.method}]</span>
                  )}
                </span>
              ))}
            </div>
          )}

          {/* 表型变化 */}
          {experiment.phenotype_effects.length > 0 && (
            <div>
              <span className="font-medium text-gray-600">表型变化：</span>
              {experiment.phenotype_effects.map((p, i) => (
                <span key={i} className="ml-2">
                  {p.phenotype}{" "}
                  <span className={p.direction === "up" ? "text-green-600" : p.direction === "down" ? "text-red-600" : "text-gray-500"}>
                    {p.direction === "up" ? "↑" : p.direction === "down" ? "↓" : "—"}
                  </span>
                  {p.fold_change && (
                    <span className="text-gray-400"> ({p.fold_change})</span>
                  )}
                </span>
              ))}
            </div>
          )}

          {/* 统计信息 */}
          <div className="text-gray-500 space-x-3">
            {experiment.statistical_test && (
              <span>统计：{experiment.statistical_test}</span>
            )}
            {experiment.sample_size && (
              <span>n={experiment.sample_size}</span>
            )}
            {experiment.controls.length > 0 && (
              <span>对照：{experiment.controls.join(", ")}</span>
            )}
          </div>

          {/* 结论 */}
          <div className="p-2 bg-blue-50 rounded text-blue-700">
            💡 {experiment.conclusion}
          </div>

          {/* 原文引用 */}
          <div className="p-2 bg-gray-50 rounded text-gray-600 italic border-l-2 border-gray-200">
            &ldquo;{experiment.evidence_quote}&rdquo;
          </div>
        </div>
      )}
    </div>
  );
}
