import Link from "next/link";
import { BookOpen, FlaskConical, Lightbulb, TestTubeDiagonal, Upload, FileText, Check, ArrowRight, ChevronRight } from "lucide-react";

interface WorkflowStep {
  id: string;
  label: string;
  icon: React.ReactNode;
  href?: string;
  done: boolean;
}

interface WorkflowProgressProps {
  paperCount: number;
  extractionCount: number;
  hasHypothesis: boolean;
  experimentCount: number;
  manuscriptCount: number;
  projectId: string;
}

export function WorkflowProgress({
  paperCount,
  extractionCount,
  hasHypothesis,
  experimentCount,
  manuscriptCount,
  projectId,
}: WorkflowProgressProps) {
  const steps: WorkflowStep[] = [
    {
      id: "literature",
      label: "文献搜索",
      icon: <BookOpen size={16} />,
      href: `/project/${projectId}/papers/search`,
      done: paperCount > 0,
    },
    {
      id: "extraction",
      label: "信息提取",
      icon: <FlaskConical size={16} />,
      href: `/project/${projectId}/papers`,
      done: extractionCount > 0,
    },
    {
      id: "matrix",
      label: "机制矩阵",
      icon: <Lightbulb size={16} />,
      href: `/project/${projectId}/brain`,
      done: extractionCount >= 3,
    },
    {
      id: "hypothesis",
      label: "提出假设",
      icon: <Lightbulb size={16} />,
      href: `/project/${projectId}/brain`,
      done: hasHypothesis,
    },
    {
      id: "experiment",
      label: "设计实验",
      icon: <TestTubeDiagonal size={16} />,
      href: `/project/${projectId}/experiments`,
      done: experimentCount > 0,
    },
    {
      id: "manuscript",
      label: "论文组装",
      icon: <FileText size={16} />,
      href: `/project/${projectId}/manuscript`,
      done: manuscriptCount > 0,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const progressPercent = Math.round((completedCount / steps.length) * 100);

  // 找到第一个未完成的步骤作为"下一步"
  const nextStep = steps.find((s) => !s.done);

  // 全部完成
  if (completedCount === steps.length) {
    return (
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center">
            <Check size={20} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-green-800">科研工作流已完成</p>
            <p className="text-xs text-green-600">所有步骤均已实现，可以导出最终成果</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      {/* 标题 + 进度条 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">科研工作流</span>
          <span className="text-xs text-gray-400">{completedCount}/{steps.length} 步</span>
        </div>
        <div className="text-xs text-gray-400">{progressPercent}%</div>
      </div>

      <div className="w-full bg-gray-100 rounded-full h-1.5 mb-4">
        <div
          className="bg-gradient-to-r from-blue-500 to-purple-500 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* 步骤列表 */}
      <div className="grid grid-cols-6 gap-1.5 mb-3">
        {steps.map((step, i) => {
          const isNext = step.id === nextStep?.id;
          return (
            <Link
              key={step.id}
              href={step.href || "#"}
              className={`flex flex-col items-center gap-1.5 p-2 rounded-lg transition-all text-center ${
                step.done
                  ? "bg-green-50 text-green-700"
                  : isNext
                    ? "bg-blue-50 text-blue-700 ring-2 ring-blue-300 ring-offset-1"
                    : "text-gray-400 hover:bg-gray-50"
              }`}
            >
              <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                step.done
                  ? "bg-green-500 text-white"
                  : isNext
                    ? "bg-blue-500 text-white animate-pulse"
                    : "bg-gray-200"
              }`}>
                {step.done ? <Check size={14} /> : <span className="text-xs font-medium">{i + 1}</span>}
              </div>
              <span className="text-[10px] font-medium leading-tight">{step.label}</span>
            </Link>
          );
        })}
      </div>

      {/* 下一步行动 */}
      {nextStep && (
        <Link
          href={nextStep.href || "#"}
          className="flex items-center justify-between p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors group"
        >
          <div className="flex items-center gap-2">
            <ArrowRight size={14} className="text-blue-600" />
            <span className="text-xs font-medium text-blue-700">
              下一步：{nextStep.label}
            </span>
          </div>
          <ChevronRight size={14} className="text-blue-400 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      )}
    </div>
  );
}
