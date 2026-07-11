"use client";

import { useState, useCallback } from "react";
import {
  GitBranch,
  Activity,
  AlertTriangle,
  Plus,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
} from "lucide-react";
import type {
  MatrixData,
  MatrixRow,
  MatrixColumn,
  MatrixCell,
} from "@/lib/matrix/generator";
import { CellEditor } from "./cell-editor";

interface MechanismMatrixProps {
  projectId: string;
  data: MatrixData;
  onCellClick?: (row: MatrixRow, column: MatrixColumn, cell: MatrixCell) => void;
  onMatrixUpdate?: (data: MatrixData) => void;
}

type Density = "compact" | "comfortable" | "spacious";

const DENSITY_STYLES: Record<Density, { cell: string; header: string; row: string }> = {
  compact: { cell: "px-2 py-1", header: "px-2 py-1.5", row: "h-8" },
  comfortable: { cell: "px-3 py-2", header: "px-3 py-2", row: "h-auto" },
  spacious: { cell: "px-4 py-3", header: "px-4 py-3", row: "h-auto" },
};

export function MechanismMatrix({
  projectId,
  data: initialData,
  onCellClick,
  onMatrixUpdate,
}: MechanismMatrixProps) {
  const [editingCell, setEditingCell] = useState<{
    row: MatrixRow;
    col: MatrixColumn;
    cell: MatrixCell | null;
    anchorRect: DOMRect | null;
  } | null>(null);

  const [filterType, setFilterType] = useState<"all" | "pathway" | "phenotype">("all");
  const [density, setDensity] = useState<Density>("comfortable");
  const [showConflicts, setShowConflicts] = useState(true);
  const [data, setData] = useState<MatrixData>(initialData);
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const ds = DENSITY_STYLES[density];

  const handleSaveCell = useCallback(
    async (updatedProps: Partial<MatrixCell>) => {
      if (!editingCell) return;
      const { row, col } = editingCell;

      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/matrix/cells`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rowId: row.id,
            columnId: col.id,
            direction: updatedProps.direction,
            significance: updatedProps.significance,
            note: updatedProps.detail,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "保存失败" }));
          throw new Error(err.error ?? "保存失败");
        }

        const { cell: savedCell } = await res.json();

        setData((prev) => {
          const updated = { ...prev };
          updated.rows = prev.rows.map((r) => {
            if (r.id !== row.id) return r;
            return { ...r, cells: { ...r.cells, [col.id]: savedCell } };
          });
          onMatrixUpdate?.(updated);
          return updated;
        });
      } catch (err) {
        console.error("Cell save failed:", err);
      } finally {
        setEditingCell(null);
      }
    },
    [editingCell, projectId, onMatrixUpdate]
  );

  const visibleColumns =
    filterType === "all"
      ? data.columns
      : data.columns.filter((c) => c.type === filterType);

  function handleCellClick(
    row: MatrixRow,
    col: MatrixColumn,
    tdEl: HTMLTableCellElement,
    existingCell?: MatrixCell
  ) {
    const rect = tdEl.getBoundingClientRect();
    setEditingCell({
      row,
      col,
      cell: existingCell ?? null,
      anchorRect: rect,
    });
    if (existingCell) onCellClick?.(row, col, existingCell);
  }

  // Check if a column has a conflict
  function isConflictColumn(colId: string) {
    return data.conflicts.some((c) => c.columnId === colId);
  }

  if (data.rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
        <div className="text-4xl mb-3">📊</div>
        <p className="text-lg font-medium text-gray-500">暂无数据</p>
        <p className="text-sm mt-2">完成文献提取后，机制矩阵会自动生成</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          {/* 维度筛选 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500">维度：</span>
            {(["all", "pathway", "phenotype"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={`px-2.5 py-1 text-xs rounded-full font-medium transition-all ${
                  filterType === t
                    ? "bg-blue-100 text-blue-700 ring-1 ring-blue-200"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                }`}
              >
                {t === "all" ? "全部" : t === "pathway" ? "🧬 通路" : "🔬 表型"}
              </button>
            ))}
          </div>

          {/* 密度切换 */}
          <div className="flex items-center gap-1 border-l border-gray-200 pl-3">
            <span className="text-xs text-gray-500">密度：</span>
            {(["compact", "comfortable", "spacious"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setDensity(d)}
                className={`p-1 rounded transition-colors ${
                  density === d
                    ? "bg-blue-100 text-blue-600"
                    : "text-gray-400 hover:text-gray-600"
                }`}
                title={d === "compact" ? "紧凑" : d === "comfortable" ? "舒适" : "宽松"}
              >
                {d === "compact" ? (
                  <Minimize2 size={14} />
                ) : d === "comfortable" ? (
                  <Activity size={14} />
                ) : (
                  <Maximize2 size={14} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* 统计 */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="inline-flex items-center gap-1">
            📄 {data.totalPapers} 篇文献
          </span>
          <span className="inline-flex items-center gap-1">
            🧪 {data.totalExperiments} 个实验
          </span>
          <span className="inline-flex items-center gap-1">
            📐 {visibleColumns.length} 个维度
          </span>
          {data.conflicts.length > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-600 font-medium">
              <AlertTriangle size={12} />
              {data.conflicts.length} 个冲突
            </span>
          )}
        </div>
      </div>

      {/* 冲突摘要（可折叠） */}
      {data.conflicts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg overflow-hidden">
          <button
            onClick={() => setShowConflicts(!showConflicts)}
            className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-amber-100/50 transition-colors"
          >
            <span className="text-xs text-amber-800 font-medium inline-flex items-center gap-1.5">
              <AlertTriangle size={14} />
              发现 {data.conflicts.length} 个通路冲突 — 需要实验验证
            </span>
            {showConflicts ? (
              <ChevronUp size={14} className="text-amber-600" />
            ) : (
              <ChevronDown size={14} className="text-amber-600" />
            )}
          </button>
          {showConflicts && (
            <div className="px-4 pb-3 space-y-1.5 border-t border-amber-200/60">
              {data.conflicts.map((c) => {
                const pathway = c.columnId.split(":")[1] || c.columnId;
                return (
                  <div key={c.columnId} className="flex items-start gap-2 mt-2">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full shrink-0">
                      <GitBranch size={10} />
                      {pathway}
                    </span>
                    <p className="text-xs text-amber-700">{c.description}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 矩阵表格 */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl shadow-sm">
        <table className="min-w-full text-xs border-collapse">
          {/* 表头 */}
          <thead>
            <tr>
              {/* 左上角固定列头 */}
              <th
                className={`${ds.header} text-left font-semibold text-gray-700 sticky left-0 z-20 min-w-[200px] border-r border-gray-200 bg-gradient-to-b from-gray-50 to-gray-100`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">📋</span>
                  <span>文献 · 实验条件</span>
                </div>
                <div className="text-[10px] text-gray-400 font-normal mt-0.5">
                  {data.rows.length} 行数据
                </div>
              </th>

              {/* 维度列头 */}
              {visibleColumns.map((col) => {
                const hasConflict = isConflictColumn(col.id);
                return (
                  <th
                    key={col.id}
                    className={`${ds.header} text-center font-semibold min-w-[110px] border-b-2 ${
                      hasConflict
                        ? "border-b-amber-400 bg-amber-50/80"
                        : "border-b-gray-200 bg-gradient-to-b from-gray-50 to-gray-100"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      {col.type === "pathway" ? (
                        <GitBranch
                          size={14}
                          className={hasConflict ? "text-amber-600" : "text-purple-500"}
                        />
                      ) : (
                        <Activity size={14} className="text-teal-500" />
                      )}
                      <span className={hasConflict ? "text-amber-800" : "text-gray-700"}>
                        {col.label}
                      </span>
                      {hasConflict && (
                        <AlertTriangle size={11} className="text-amber-500 animate-pulse" />
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400 font-normal">
                      {col.type === "pathway" ? "通路" : "表型"} · {col.count} 篇
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* 表体 */}
          <tbody>
            {data.rows.map((row, rowIdx) => {
              const isHovered = hoveredRow === row.id;
              return (
                <tr
                  key={row.id}
                  onMouseEnter={() => setHoveredRow(row.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  className={`
                    border-t border-gray-100 transition-colors
                    ${rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                    ${isHovered ? "bg-blue-50/40 !important" : ""}
                  `}
                >
                  {/* 文献+实验条件（固定列） */}
                  <td
                    className={`
                      ${ds.cell} sticky left-0 z-10 border-r border-gray-200 transition-colors
                      ${rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                      ${isHovered ? "bg-blue-50/40 !important" : ""}
                    `}
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <div
                          className="font-medium text-gray-800 truncate max-w-[180px]"
                          title={row.paperTitle}
                        >
                          {row.drugConc || row.paperTitle}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-gray-500 truncate max-w-[120px]" title={row.cellLine}>
                            {row.cellLine}
                          </span>
                          {row.year && (
                            <span className="text-gray-400 shrink-0">· {row.year}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* 数据单元格 */}
                  {visibleColumns.map((col) => {
                    const cell = row.cells[col.id];
                    const hasConflict = isConflictColumn(col.id);
                    const isUp = cell?.direction === "up";
                    const isDown = cell?.direction === "down";
                    const isEmpty = !cell || (!cell.direction && !cell.significance);

                    return (
                      <td
                        key={col.id}
                        onClick={(e) => handleCellClick(row, col, e.currentTarget, cell || undefined)}
                        className={`
                          ${ds.cell} text-center cursor-pointer transition-all relative group
                          ${isEmpty
                            ? "hover:bg-blue-50"
                            : isUp
                              ? "text-green-700 hover:bg-green-50"
                              : isDown
                                ? "text-red-700 hover:bg-red-50"
                                : "text-gray-500 hover:bg-gray-100"
                          }
                          ${hasConflict && cell ? "ring-1 ring-inset ring-amber-300 animate-pulse-subtle" : ""}
                        `}
                      >
                        {cell && cell.direction ? (
                          <span className="inline-flex flex-col items-center gap-0.5">
                            <span
                              className={`text-lg font-bold leading-none ${
                                isUp ? "text-green-600" : isDown ? "text-red-600" : "text-gray-400"
                              }`}
                            >
                              {isUp ? "↑" : isDown ? "↓" : "—"}
                            </span>
                            {cell.significance && (
                              <span
                                className={`text-[10px] font-medium px-1 rounded ${
                                  isUp
                                    ? "text-green-600 bg-green-50"
                                    : isDown
                                      ? "text-red-600 bg-red-50"
                                      : "text-gray-500 bg-gray-100"
                                }`}
                              >
                                {cell.significance}
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded border border-dashed border-gray-300 text-gray-300 group-hover:border-blue-400 group-hover:text-blue-400 transition-colors">
                            <Plus size={12} />
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 底部提示 */}
      <div className="flex items-center justify-between text-[11px] text-gray-400 px-1">
        <span>点击任意单元格编辑数据</span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-500" /> 上调
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-500" /> 下调
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-400" /> 无变化
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-4 h-4 rounded border border-dashed border-gray-300 inline-flex items-center justify-center">
              <Plus size={8} className="text-gray-400" />
            </span>
            可填充
          </span>
        </div>
      </div>

      {/* 单元格内联编辑器 */}
      {editingCell && (
        <CellEditor
          cell={
            editingCell.cell ?? {
              direction: "no_change",
              significance: null,
              method: null,
              detail: "",
              paperTitle: editingCell.row.paperTitle,
              evidenceQuote: "",
              experimentIndex: 0,
            }
          }
          row={editingCell.row}
          column={editingCell.col}
          anchorRect={editingCell.anchorRect}
          onSave={handleSaveCell}
          onClose={() => setEditingCell(null)}
        />
      )}

      {/* 冲突列脉冲动画 */}
      <style jsx>{`
        @keyframes pulse-subtle {
          0%, 100% { box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.3); }
          50% { box-shadow: inset 0 0 0 2px rgba(245, 158, 11, 0.6); }
        }
        .animate-pulse-subtle {
          animation: pulse-subtle 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
