"use client";

import { useExtractionStore } from "@/stores/extraction-store";
import { X, CheckCircle2, AlertCircle, Loader2, Beaker } from "lucide-react";

export function ExtractionProgressPanel() {
  const { items, isExtracting, clearCompleted } = useExtractionStore();

  if (items.length === 0) return null;

  const doneCount = items.filter((i) => i.status === "done").length;
  const errorCount = items.filter((i) => i.status === "error").length;
  const totalCount = items.length;
  const progress = totalCount > 0 ? Math.round(((doneCount + errorCount) / totalCount) * 100) : 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-h-[60vh] bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950 dark:to-indigo-950 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          {isExtracting ? (
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
          ) : (
            <Beaker className="w-4 h-4 text-indigo-500" />
          )}
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
            {isExtracting ? "正在提取..." : "提取完成"}
          </span>
          <span className="text-xs text-gray-500">
            {doneCount}/{totalCount}
            {errorCount > 0 && <span className="text-red-500 ml-1">({errorCount} 失败)</span>}
          </span>
        </div>
        {!isExtracting && (
          <button
            onClick={clearCompleted}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100 dark:bg-gray-800">
        <div
          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Items */}
      <div className="overflow-y-auto max-h-[40vh] divide-y divide-gray-100 dark:divide-gray-800">
        {items.map((item) => (
          <div
            key={item.paperId}
            className="px-4 py-2.5 flex items-start gap-3"
          >
            {/* Status icon */}
            <div className="mt-0.5 flex-shrink-0">
              {item.status === "done" && (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              )}
              {item.status === "error" && (
                <AlertCircle className="w-4 h-4 text-red-500" />
              )}
              {(item.status === "extracting" || item.status === "saving") && (
                <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
              )}
              {item.status === "pending" && (
                <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                {item.title.length > 40 ? item.title.slice(0, 40) + "..." : item.title}
              </p>

              {item.status === "extracting" && item.step && (
                <p className="text-xs text-blue-500 mt-0.5">{item.step}</p>
              )}

              {item.status === "saving" && (
                <p className="text-xs text-amber-500 mt-0.5">保存中...</p>
              )}

              {item.status === "done" && item.result && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                  {item.result.conclusions} 个结论 · {item.result.experiments} 个实验
                </p>
              )}

              {item.status === "error" && item.error && (
                <p className="text-xs text-red-500 mt-0.5 truncate">
                  {item.error}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
