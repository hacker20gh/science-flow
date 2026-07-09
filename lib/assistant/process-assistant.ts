/**
 * 过程助手（Process Assistant）
 *
 * 根据项目状态，在关键决策点自动给出指导
 * 不是 LLM 调用，是基于规则的快速判断 + 固定建议模板
 * 只有需要深度分析时才调 LLM
 */

import type { StoredPaper } from "@/store/project-store";
import type { MatrixData } from "@/lib/matrix/generator";

export type AssistantPriority = "high" | "medium" | "low";

export interface AssistantCard {
  id: string;
  priority: AssistantPriority;
  icon: string;
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
  learnMoreSlug?: string;
  dismissible: boolean;
}

// ===== 触发规则 =====

/**
 * 分析项目状态，返回应该显示的过程助手卡片
 */
export function analyzeProjectState(params: {
  papers: StoredPaper[];
  matrix: MatrixData | null;
  hasExperiments: boolean;
  currentPath: string;
}): AssistantCard[] {
  const cards: AssistantCard[] = [];
  const { papers, matrix, hasExperiments, currentPath } = params;

  const extractedPapers = papers.filter(
    (p) => p.extractionStatus === "done" && p.experiments.length > 0
  );
  const failedPapers = papers.filter((p) => p.extractionStatus === "error");
  const abstractOnlyPapers = extractedPapers.filter(
    (p) => !p.oaPdfUrl
  );

  // ===== 文献搜索阶段 =====
  if (currentPath.includes("/papers/search")) {
    // 搜索后没有选文献
    if (papers.length > 0 && extractedPapers.length === 0) {
      cards.push({
        id: "search-no-extraction",
        priority: "medium",
        icon: "💡",
        title: "还没提取文献信息",
        message: `你已经搜索了 ${papers.length} 篇文献，但还没有提取结构化信息。选中文献后点击"提取信息"，系统会自动分析每篇论文的药物、通路和表型变化。`,
        dismissible: true,
      });
    }

    // 很多文献只有摘要
    if (abstractOnlyPapers.length >= 3) {
      cards.push({
        id: "search-many-abstracts",
        priority: "medium",
        icon: "📎",
        title: `${abstractOnlyPapers.length} 篇文献只有摘要`,
        message: "仅从摘要提取的信息有限（缺少精确浓度、统计方法、对照组详情）。如果你有这些论文的 PDF，上传后可以提取更完整的信息。",
        actionLabel: "上传 PDF 补充",
        dismissible: true,
      });
    }
  }

  // ===== 知识面板阶段 =====
  if (currentPath.includes("/brain")) {
    // 有矩阵，有冲突
    if (matrix && matrix.conflicts.length > 0) {
      const conflictNames = matrix.conflicts
        .map((c) => c.columnId.split(":")[1])
        .join("、");
      cards.push({
        id: "matrix-conflicts",
        priority: "high",
        icon: "⚠️",
        title: `${matrix.conflicts.length} 个通路/表型存在冲突`,
        message: `${conflictNames} 的变化方向不一致。这可能是关键发现——不同浓度、不同细胞系、不同处理时间都可能导致矛盾结果。建议设计实验来解决这些冲突。`,
        actionLabel: "设计实验解决冲突",
        actionHref: "experiments",
        dismissible: true,
      });
    }

    // 有矩阵，有空白
    if (matrix && matrix.gaps.length > 5) {
      const uniqueGaps = [...new Set(matrix.gaps.map((g) => g.columnId.split(":")[1]))];
      cards.push({
        id: "matrix-gaps",
        priority: "medium",
        icon: "🔍",
        title: `发现 ${uniqueGaps.length} 个未覆盖的维度`,
        message: `${uniqueGaps.slice(0, 3).join("、")} 等维度在多篇文献中没有被研究。这些空白可能是潜在的研究创新点。`,
        actionLabel: "探索这些空白",
        actionHref: "experiments",
        dismissible: true,
      });
    }

    // 没有假设
    if (matrix && extractedPapers.length >= 3) {
      cards.push({
        id: "brain-no-hypothesis",
        priority: "medium",
        icon: "💡",
        title: "可以开始提出假设了",
        message: "你已经有足够的文献数据。基于机制矩阵中的发现，提出一个可验证的假设，然后设计实验来验证它。",
        actionLabel: "设计实验",
        actionHref: "experiments",
        dismissible: true,
      });
    }
  }

  // ===== 实验设计阶段 =====
  if (currentPath.includes("/experiments")) {
    // 没有文献数据就做实验
    if (extractedPapers.length === 0) {
      cards.push({
        id: "exp-no-literature",
        priority: "high",
        icon: "📖",
        title: "建议先搜索文献",
        message: "实验设计应基于文献证据。先搜索相关论文，提取机制信息，然后基于矩阵中的发现来设计实验。",
        actionLabel: "去搜索文献",
        actionHref: "papers/search",
        dismissible: true,
      });
    }

    // 有冲突没解决
    if (matrix && matrix.conflicts.length > 0 && !hasExperiments) {
      cards.push({
        id: "exp-conflict-first",
        priority: "medium",
        icon: "🎯",
        title: "先解决文献中的冲突",
        message: "你的机制矩阵中有矛盾的发现。建议优先设计实验来解决这些冲突——这比探索新方向更有价值。",
        dismissible: true,
      });
    }
  }

  return cards;
}

// ===== 置信度计算（高级分析） =====

/**
 * 计算假设的证据强度
 * 简单规则：支持文献数 / (支持 + 反对)
 */
export function calculateHypothesisStrength(params: {
  supportingPapers: number;
  contradictingPapers: number;
  totalExperiments: number;
}): { score: number; label: string; color: string } {
  const { supportingPapers, contradictingPapers } = params;
  const total = supportingPapers + contradictingPapers;

  if (total === 0) {
    return { score: 0, label: "无证据", color: "text-gray-400" };
  }

  const score = Math.round((supportingPapers / total) * 100);

  if (score >= 80) return { score, label: "强证据支持", color: "text-green-600" };
  if (score >= 60) return { score, label: "中等支持", color: "text-amber-600" };
  if (score >= 40) return { score, label: "证据矛盾", color: "text-amber-600" };
  return { score, label: "证据不足", color: "text-red-600" };
}
