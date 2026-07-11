"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Lightbulb,
  AlertTriangle,
  FlaskConical,
  Search,
  ChevronDown,
  ChevronUp,
  ArrowRight,
} from "lucide-react";
import type { MatrixData } from "@/lib/matrix/generator";

interface AIInsightsProps {
  matrixData: MatrixData;
  projectId: string;
  onAction?: (action: { type: string; data: unknown }) => void;
}

interface Insight {
  id: string;
  type: "conflict" | "hypothesis" | "gap" | "evidence_upgrade";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  actionLabel: string;
  actionHref?: string;
  actionType?: string;
}

// ---- Insight generation logic ----

function generateInsights(matrixData: MatrixData, projectId: string): Insight[] {
  const insights: Insight[] = [];

  // 1. Conflict insights
  for (const conflict of matrixData.conflicts) {
    const col = matrixData.columns.find((c) => c.id === conflict.columnId);
    const label = col?.label ?? conflict.columnId;
    const ups = conflict.conflictingRows.filter(
      (r) => r.cells[conflict.columnId]?.direction === "up"
    );
    const downs = conflict.conflictingRows.filter(
      (r) => r.cells[conflict.columnId]?.direction === "down"
    );

    // Check if same conditions exist in both directions (true conflict)
    const concSet = new Set(conflict.conflictingRows.map((r) => r.drugConc).filter(Boolean));
    const cellSet = new Set(
      conflict.conflictingRows.map((r) => r.cellLine).filter(Boolean)
    );

    const isTrueConflict =
      conflict.description.startsWith("真冲突") ||
      (concSet.size === 1 && cellSet.size === 1 && ups.length > 0 && downs.length > 0);

    let title: string;
    let description: string;
    let severity: Insight["severity"];

    if (isTrueConflict) {
      title = `${label} 存在真冲突`;
      description = `相同实验条件下，${ups.length} 篇报道上调，${downs.length} 篇报道下调。建议设计验证实验。`;
      severity = "high";
    } else {
      // Dose-dependent or cell-line difference
      title = `${label} 存在条件差异`;
      description = conflict.description;
      severity = "medium";
    }

    insights.push({
      id: `conflict-${conflict.columnId}`,
      type: "conflict",
      severity,
      title,
      description,
      actionLabel: "设计验证实验",
      actionHref: `/project/${projectId}/experiments`,
      actionType: "navigate",
    });
  }

  // 2. Hypothesis candidate insights: pathway with >=3 consistent rows
  const pathwayDirections = new Map<string, Map<string, number>>();
  for (const row of matrixData.rows) {
    for (const [cellId, cell] of Object.entries(row.cells)) {
      if (!cell.direction || cell.direction === "no_change") continue;
      if (!cellId.startsWith("pathway:")) continue;
      const name = cellId.replace("pathway:", "");
      if (!pathwayDirections.has(name)) pathwayDirections.set(name, new Map());
      const dirMap = pathwayDirections.get(name)!;
      dirMap.set(cell.direction, (dirMap.get(cell.direction) || 0) + 1);
    }
  }

  for (const [pathway, dirMap] of pathwayDirections) {
    const upCount = dirMap.get("up") || 0;
    const downCount = dirMap.get("down") || 0;
    const dominantDir = upCount > downCount ? "up" : downCount > upCount ? "down" : null;
    const dominantCount = dominantDir === "up" ? upCount : downCount;

    if (dominantDir && dominantCount >= 3 && dominantCount >= upCount + downCount - dominantCount) {
      // Consensus direction
      const dirLabel = dominantDir === "up" ? "上调" : "下调";
      insights.push({
        id: `hypothesis-${pathway}`,
        type: "hypothesis",
        severity: "medium",
        title: `${pathway} ${dirLabel}趋势一致`,
        description: `${dominantCount} 篇文献一致支持 ${pathway} ${dirLabel}，建议创建假设进行验证。`,
        actionLabel: "创建假设",
        actionHref: `/project/${projectId}/brain`,
        actionType: "create_hypothesis",
      });
    }
  }

  // 3. Gap insights: group gaps by column, highlight columns with >=2 gaps
  const gapsByColumn = new Map<string, number>();
  for (const gap of matrixData.gaps) {
    gapsByColumn.set(gap.columnId, (gapsByColumn.get(gap.columnId) || 0) + 1);
  }

  for (const [colId, gapCount] of gapsByColumn) {
    if (gapCount < 2) continue;
    const col = matrixData.columns.find((c) => c.id === colId);
    const label = col?.label ?? colId;

    insights.push({
      id: `gap-${colId}`,
      type: "gap",
      severity: gapCount >= 4 ? "medium" : "low",
      title: `${label} 研究空白`,
      description: `${label} 在 ${gapCount} 篇文献中未被研究，可能是创新机会。`,
      actionLabel: "搜索相关文献",
      actionHref: `/project/${projectId}/papers/search`,
      actionType: "navigate",
    });
  }

  // 4. Evidence upgrade insights: cells with evidenceStrength < 40
  const lowEvidenceCells: Array<{
    colId: string;
    colLabel: string;
    score: number;
    paper: string;
  }> = [];

  for (const row of matrixData.rows) {
    for (const [cellId, cell] of Object.entries(row.cells)) {
      if (cell.evidenceStrength < 40) {
        const col = matrixData.columns.find((c) => c.id === cellId);
        lowEvidenceCells.push({
          colId: cellId,
          colLabel: col?.label ?? cellId,
          score: cell.evidenceStrength,
          paper: row.paperTitle,
        });
      }
    }
  }

  // Group by column for a consolidated message
  const lowEvidenceByCol = new Map<string, { count: number; minScore: number; papers: Set<string> }>();
  for (const item of lowEvidenceCells) {
    const existing = lowEvidenceByCol.get(item.colLabel);
    if (existing) {
      existing.count++;
      existing.minScore = Math.min(existing.minScore, item.score);
      existing.papers.add(item.paper);
    } else {
      lowEvidenceByCol.set(item.colLabel, {
        count: 1,
        minScore: item.score,
        papers: new Set([item.paper]),
      });
    }
  }

  for (const [colLabel, info] of lowEvidenceByCol) {
    insights.push({
      id: `evidence-${colLabel}`,
      type: "evidence_upgrade",
      severity: info.minScore < 20 ? "high" : "low",
      title: `${colLabel} 证据薄弱`,
      description: `${colLabel} 在 ${info.count} 处证据强度较低（最低 ${info.minScore}/100），建议补充实验数据。`,
      actionLabel: "补充实验",
      actionHref: `/project/${projectId}/experiments`,
      actionType: "navigate",
    });
  }

  return insights;
}

// ---- InsightCard component ----

function InsightCard({
  insight,
  projectId,
}: {
  insight: Insight;
  projectId: string;
}) {
  const iconMap = {
    conflict: <AlertTriangle size={16} className="text-red-500 shrink-0" />,
    hypothesis: <FlaskConical size={16} className="text-purple-500 shrink-0" />,
    gap: <Search size={16} className="text-blue-500 shrink-0" />,
    evidence_upgrade: <Lightbulb size={16} className="text-amber-500 shrink-0" />,
  };

  const borderColorMap = {
    high: "border-l-red-400",
    medium: "border-l-amber-400",
    low: "border-l-blue-300",
  };

  return (
    <div
      className={`flex items-start gap-3 bg-white/70 rounded-lg p-3 border-l-4 ${borderColorMap[insight.severity]} transition-colors hover:bg-white`}
    >
      <div className="mt-0.5">{iconMap[insight.type]}</div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800">{insight.title}</p>
        <p className="text-xs text-gray-500 mt-0.5">{insight.description}</p>
      </div>
      {insight.actionHref && (
        <a
          href={insight.actionHref}
          className="shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
        >
          {insight.actionLabel}
          <ArrowRight size={12} />
        </a>
      )}
    </div>
  );
}

// ---- Main component ----

export function AIInsights({ matrixData, projectId }: AIInsightsProps) {
  const [expanded, setExpanded] = useState(true);

  const insights = useMemo(() => generateInsights(matrixData, projectId), [matrixData, projectId]);

  if (insights.length === 0) return null;

  const highPriority = insights.filter((i) => i.severity === "high");
  const mediumPriority = insights.filter((i) => i.severity === "medium");
  const lowPriority = insights.filter((i) => i.severity === "low");

  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-blue-100/30 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-blue-800">
          <Lightbulb size={16} className="text-blue-600" />
          AI 洞察 — {insights.length} 条建议
          {highPriority.length > 0 && (
            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
              {highPriority.length} 条高优先
            </span>
          )}
        </span>
        {expanded ? (
          <ChevronUp size={14} className="text-blue-500" />
        ) : (
          <ChevronDown size={14} className="text-blue-500" />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-2">
          {[...highPriority, ...mediumPriority, ...lowPriority].map((insight) => (
            <InsightCard key={insight.id} insight={insight} projectId={projectId} />
          ))}
        </div>
      )}
    </div>
  );
}
