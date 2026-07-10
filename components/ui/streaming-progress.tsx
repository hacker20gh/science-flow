"use client";

/**
 * 流式进度组件
 *
 * 用于显示重型 LLM 任务的实时进度（论文组装、实验设计等）
 */

interface StreamingProgressProps {
  /** 任务标题，如 "正在生成论文..." */
  title: string;
  /** 当前步骤名称 */
  currentStep?: string;
  /** 当前完成的步骤数 */
  current: number;
  /** 总步骤数 */
  total: number;
  /** 各步骤名称列表（可选，用于显示详细进度） */
  steps?: string[];
  /** 停止回调 */
  onStop?: () => void;
  /** 是否正在生成 */
  isStreaming: boolean;
}

export function StreamingProgress({
  title,
  currentStep,
  current,
  total,
  steps,
  onStop,
  isStreaming,
}: StreamingProgressProps) {
  const progress = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 space-y-3">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isStreaming && (
            <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
          <span className="text-sm font-medium text-blue-900">{title}</span>
        </div>
        <span className="text-xs text-blue-600">
          {current}/{total}
        </span>
      </div>

      {/* 进度条 */}
      <div className="w-full bg-blue-100 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 当前步骤 */}
      {currentStep && (
        <p className="text-xs text-blue-700">
          {isStreaming ? "⏳" : "✅"} {currentStep}
        </p>
      )}

      {/* 详细步骤列表（如果提供了 steps） */}
      {steps && steps.length > 0 && (
        <div className="grid grid-cols-2 gap-1">
          {steps.map((step, i) => {
            const isDone = i < current;
            const isActive = i === current && isStreaming;
            return (
              <div
                key={step}
                className={`text-xs px-2 py-1 rounded ${
                  isDone
                    ? "text-green-700 bg-green-50"
                    : isActive
                      ? "text-blue-700 bg-blue-100 font-medium"
                      : "text-gray-400"
                }`}
              >
                {isDone ? "✓" : isActive ? "⏳" : "○"} {step}
              </div>
            );
          })}
        </div>
      )}

      {/* 停止按钮 */}
      {isStreaming && onStop && (
        <button
          onClick={onStop}
          className="text-xs text-red-600 hover:text-red-700 underline"
        >
          ⏹ 停止生成
        </button>
      )}
    </div>
  );
}
