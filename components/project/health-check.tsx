"use client";

import { useMemo } from "react";
import { useProjectStore } from "@/store/project-store";
import {
  Check,
  AlertTriangle,
  X,
  BookOpen,
  FlaskConical,
  Brain,
  FileText,
  Lightbulb,
  Target,
} from "lucide-react";

interface HealthCheckItem {
  category: string;
  status: "good" | "warning" | "critical";
  message: string;
  suggestion: string;
  icon: React.ReactNode;
}

export function ProjectHealthCheck() {
  const { papers, matrix } = useProjectStore();

  const extractedPapers = papers.filter(
    (p) => p.extractionStatus === "done" && p.experiments.length > 0
  );

  const healthChecks = useMemo<HealthCheckItem[]>(() => {
    const checks: HealthCheckItem[] = [];

    // 文献数量
    if (papers.length === 0) {
      checks.push({
        category: "文献覆盖",
        status: "critical",
        message: "还没有添加任何文献",
        suggestion: "点击「文献管理」搜索并添加相关论文",
        icon: <BookOpen size={16} />,
      });
    } else if (papers.length < 5) {
      checks.push({
        category: "文献覆盖",
        status: "warning",
        message: `只有 ${papers.length} 篇文献，可能不够全面`,
        suggestion: "建议至少搜索 10-20 篇相关文献",
        icon: <BookOpen size={16} />,
      });
    } else {
      checks.push({
        category: "文献覆盖",
        status: "good",
        message: `已有 ${papers.length} 篇文献`,
        suggestion: "文献数量充足",
        icon: <BookOpen size={16} />,
      });
    }

    // 提取完成度
    const extracted = extractedPapers.length;
    const total = papers.length;
    if (total > 0 && extracted === 0) {
      checks.push({
        category: "数据提取",
        status: "critical",
        message: "没有任何文献完成信息提取",
        suggestion: "选择文献点击「提取信息」，AI 会自动结构化数据",
        icon: <FileText size={16} />,
      });
    } else if (total > 0 && extracted < total * 0.5) {
      checks.push({
        category: "数据提取",
        status: "warning",
        message: `仅 ${extracted}/${total} 篇文献已提取`,
        suggestion: "更多文献提取后，机制矩阵会更完整",
        icon: <FileText size={16} />,
      });
    } else if (total > 0) {
      checks.push({
        category: "数据提取",
        status: "good",
        message: `${extracted}/${total} 篇文献已提取`,
        suggestion: "提取完成度良好",
        icon: <FileText size={16} />,
      });
    }

    // 机制矩阵
    if (extracted === 0) {
      checks.push({
        category: "机制矩阵",
        status: "critical",
        message: "矩阵无数据（需要先提取文献）",
        suggestion: "提取文献后矩阵自动生成",
        icon: <Brain size={16} />,
      });
    } else if (matrix) {
      const conflicts = matrix.conflicts.length;
      const gaps = matrix.gaps.length;

      if (conflicts > 0) {
        checks.push({
          category: "机制矩阵",
          status: "warning",
          message: `发现 ${conflicts} 个矛盾点需要验证`,
          suggestion: "矛盾点是好的研究方向——设计实验验证谁对",
          icon: <Brain size={16} />,
        });
      }

      if (gaps > 0) {
        checks.push({
          category: "研究空白",
          status: "warning",
          message: `发现 ${gaps} 个数据空白`,
          suggestion: "空白领域可能是创新点——考虑设计新实验填补",
          icon: <Target size={16} />,
        });
      }

      if (conflicts === 0 && gaps === 0) {
        checks.push({
          category: "机制矩阵",
          status: "good",
          message: `矩阵完整，${matrix.columns.length} 个维度`,
          suggestion: "数据一致性良好",
          icon: <Brain size={16} />,
        });
      }
    }

    // 实验设计
    const hasExperiments = extractedPapers.some((p) =>
      p.experiments.some((e) => e.conclusion)
    );
    if (extracted > 0 && !hasExperiments) {
      checks.push({
        category: "实验设计",
        status: "warning",
        message: "还没有设计实验验证假设",
        suggestion: "点击「设计实验」让 AI 帮你设计验证方案",
        icon: <FlaskConical size={16} />,
      });
    } else if (hasExperiments) {
      checks.push({
        category: "实验设计",
        status: "good",
        message: "已有实验设计",
        suggestion: "可以查看实验方案并开始执行",
        icon: <FlaskConical size={16} />,
      });
    }

    // 研究空白识别
    if (matrix?.gaps && matrix.gaps.length > 0) {
      checks.push({
        category: "创新机会",
        status: "warning",
        message: `发现 ${matrix.gaps.length} 个潜在研究空白`,
        suggestion: "这些空白可能是你论文的创新点",
        icon: <Lightbulb size={16} />,
      });
    }

    return checks;
  }, [papers, extractedPapers, matrix]);

  const goodCount = healthChecks.filter((c) => c.status === "good").length;
  const warningCount = healthChecks.filter((c) => c.status === "warning").length;
  const criticalCount = healthChecks.filter((c) => c.status === "critical").length;

  const overallScore = healthChecks.length > 0
    ? Math.round((goodCount / healthChecks.length) * 100)
    : 0;

  return (
    <div className="space-y-4">
      {/* 总评分 */}
      <div className="flex items-center gap-4 p-4 bg-white border border-gray-200 rounded-xl">
        <div className="relative w-16 h-16">
          <svg className="w-16 h-16 -rotate-90" viewBox="0 0 36 36">
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#e5e7eb"
              strokeWidth="3"
            />
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke={overallScore >= 70 ? "#22c55e" : overallScore >= 40 ? "#f59e0b" : "#ef4444"}
              strokeWidth="3"
              strokeDasharray={`${overallScore}, 100`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-sm font-bold">{overallScore}%</span>
          </div>
        </div>
        <div>
          <h3 className="font-medium text-sm">项目健康度</h3>
          <div className="flex gap-3 text-xs text-gray-500 mt-1">
            {goodCount > 0 && <span className="text-green-600">✅ {goodCount} 项正常</span>}
            {warningCount > 0 && <span className="text-amber-600">⚠️ {warningCount} 项待改进</span>}
            {criticalCount > 0 && <span className="text-red-600">❌ {criticalCount} 项缺失</span>}
          </div>
        </div>
      </div>

      {/* 检查项列表 */}
      <div className="space-y-2">
        {healthChecks.map((check, i) => (
          <div
            key={i}
            className={`flex items-start gap-3 p-3 rounded-lg border ${
              check.status === "good"
                ? "bg-green-50 border-green-100"
                : check.status === "warning"
                  ? "bg-amber-50 border-amber-100"
                  : "bg-red-50 border-red-100"
            }`}
          >
            <div className="mt-0.5">
              {check.status === "good" ? (
                <Check size={16} className="text-green-500" />
              ) : check.status === "warning" ? (
                <AlertTriangle size={16} className="text-amber-500" />
              ) : (
                <X size={16} className="text-red-500" />
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {check.icon}
                <span className="text-xs font-medium text-gray-700">{check.category}</span>
              </div>
              <p className="text-xs text-gray-600 mt-0.5">{check.message}</p>
              {check.status !== "good" && (
                <p className="text-xs text-gray-500 mt-1">💡 {check.suggestion}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
