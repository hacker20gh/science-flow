"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { toPng, toSvg } from "html-to-image";
import {
  GitBranch,
  Activity,
  AlertTriangle,
  Plus,
  ChevronDown,
  ChevronUp,
  Maximize2,
  Minimize2,
  GripVertical,
  ArrowUpDown,
} from "lucide-react";
import type {
  MatrixData,
  MatrixRow,
  MatrixColumn,
  MatrixCell,
} from "@/lib/matrix/generator";
import { getStrengthLevel } from "@/lib/matrix/generator";
import { CellEditor } from "./cell-editor";

/* ---------- Sortable Column Header ---------- */

function SortableColumnHeader({
  col,
  hasConflict,
  ds,
}: {
  col: MatrixColumn;
  hasConflict: boolean;
  ds: { header: string };
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: col.id,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative",
  };

  return (
    <th
      ref={setNodeRef}
      style={style}
      className={`${ds.header} text-center font-semibold min-w-[110px] border-b-2 group ${
        hasConflict
          ? "border-b-amber-400 bg-amber-50"
          : "border-b-gray-200 bg-gradient-to-b from-gray-50 to-gray-100"
      }`}
    >
      {/* Drag handle — visible on hover */}
      <button
        {...attributes}
        {...listeners}
        className="absolute left-0.5 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
        title="拖拽排序"
      >
        <GripVertical size={12} />
      </button>

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
}

interface MechanismMatrixProps {
  projectId: string;
  data: MatrixData;
  onCellClick?: (row: MatrixRow, column: MatrixColumn, cell: MatrixCell) => void;
  onMatrixUpdate?: (data: MatrixData) => void;
}

type Density = "compact" | "comfortable" | "spacious";
type SortKey = "paper" | "drug" | "cellLine" | "year" | "completeness";
type SortDir = "asc" | "desc";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "paper", label: "文献" },
  { key: "drug", label: "药物" },
  { key: "cellLine", label: "细胞系" },
  { key: "year", label: "年份" },
  { key: "completeness", label: "数据量" },
];

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
  const [hoveredCell, setHoveredCell] = useState<{
    row: MatrixRow;
    col: MatrixColumn;
    cell: MatrixCell;
    rect: DOMRect;
  } | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("completeness");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [visibleRowCount, setVisibleRowCount] = useState(50);
  const tableRef = useRef<HTMLDivElement>(null);

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

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

  // 排序后的行
  const sortedRows = useMemo(() => {
    const rows = [...data.rows];
    const mul = sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      switch (sortKey) {
        case "paper":
          return mul * a.paperTitle.localeCompare(b.paperTitle);
        case "drug":
          return mul * a.drugConc.localeCompare(b.drugConc);
        case "cellLine":
          return mul * a.cellLine.localeCompare(b.cellLine);
        case "year":
          return mul * ((a.year ?? 0) - (b.year ?? 0));
        case "completeness":
          return mul * (Object.keys(a.cells).length - Object.keys(b.cells).length);
        default:
          return 0;
      }
    });
    return rows;
  }, [data.rows, sortKey, sortDir]);

  // 汇总统计：每列的 ↑↓— 计数
  const summary = useMemo(() => {
    const map = new Map<string, { up: number; down: number; noChange: number }>();
    for (const col of data.columns) {
      map.set(col.id, { up: 0, down: 0, noChange: 0 });
    }
    for (const row of data.rows) {
      for (const [colId, cell] of Object.entries(row.cells)) {
        const s = map.get(colId);
        if (!s) continue;
        if (cell.direction === "up") s.up++;
        else if (cell.direction === "down") s.down++;
        else if (cell.direction === "no_change") s.noChange++;
      }
    }
    return map;
  }, [data.rows, data.columns]);

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

  /* ---------- Column Drag End ---------- */
  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = data.columns.findIndex((c) => c.id === active.id);
    const newIndex = data.columns.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(data.columns, oldIndex, newIndex);
    setData((prev) => {
      const updated = { ...prev, columns: reordered };
      // fire-and-forget: persist new column order
      fetch(`/api/projects/${encodeURIComponent(projectId)}/matrix`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns: reordered.map((c) => c.id) }),
      }).catch((err) => {
        console.error("[Matrix] Failed to save column order:", err);
        toast.error("列排序保存失败，刷新后可能恢复原状");
      });
      onMatrixUpdate?.(updated);
      return updated;
    });
  }

  /* ---------- PNG / SVG Export ---------- */
  async function exportPng() {
    if (!tableRef.current) return;
    try {
      const dataUrl = await toPng(tableRef.current, { backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = "mechanism-matrix.png";
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("PNG export failed:", err);
    }
  }

  async function exportSvg() {
    if (!tableRef.current) return;
    try {
      const dataUrl = await toSvg(tableRef.current, { backgroundColor: "#ffffff" });
      const link = document.createElement("a");
      link.download = "mechanism-matrix.svg";
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error("SVG export failed:", err);
    }
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

          {/* 排序 */}
          <div className="flex items-center gap-1.5 border-l border-gray-200 pl-3">
            <ArrowUpDown size={12} className="text-gray-400" />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="text-xs bg-gray-100 text-gray-600 rounded px-2 py-1 border-0 focus:ring-1 focus:ring-blue-300"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.key} value={o.key}>{o.label}</option>
              ))}
            </select>
            <button
              onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
              className="p-1 rounded hover:bg-gray-200 text-gray-500"
              title={sortDir === "asc" ? "升序" : "降序"}
            >
              <ChevronDown
                size={14}
                className={`transition-transform ${sortDir === "asc" ? "rotate-180" : ""}`}
              />
            </button>
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

        {/* 统计 + 导出 */}
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
          <div className="flex items-center gap-1 border-l border-gray-200 pl-3">
            <button
              onClick={exportPng}
              className="px-2 py-0.5 text-[11px] border border-gray-200 rounded hover:bg-gray-100 hover:text-gray-600 transition-colors"
              title="导出为 PNG"
            >
              导出 PNG
            </button>
            <button
              onClick={exportSvg}
              className="px-2 py-0.5 text-[11px] border border-gray-200 rounded hover:bg-gray-100 hover:text-gray-600 transition-colors"
              title="导出为 SVG"
            >
              导出 SVG
            </button>
          </div>
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
      <div ref={tableRef} className="overflow-auto border border-gray-200 rounded-xl shadow-sm max-h-[70vh]">
        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <table className="min-w-full text-xs border-collapse">
            {/* 表头 */}
            <thead className="sticky top-0 z-20">
              <tr>
                {/* 左上角固定列头 */}
                <th
                  className={`${ds.header} text-left font-semibold text-gray-700 sticky left-0 z-30 min-w-[260px] border-r border-gray-200 bg-gradient-to-b from-gray-50 to-gray-100`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">📋</span>
                    <span>文献 · 实验条件</span>
                  </div>
                  <div className="text-[10px] text-gray-400 font-normal mt-0.5">
                    {sortedRows.length} 行数据
                  </div>
                </th>

                {/* 维度列头 — draggable */}
                <SortableContext items={visibleColumns.map((c) => c.id)} strategy={horizontalListSortingStrategy}>
                  {visibleColumns.map((col) => (
                    <SortableColumnHeader
                      key={col.id}
                      col={col}
                      hasConflict={isConflictColumn(col.id)}
                      ds={ds}
                    />
                  ))}
                </SortableContext>
              </tr>
            </thead>

          {/* 表体 — paginated */}
          <tbody>
            {sortedRows.slice(0, visibleRowCount).map((row, rowIdx) => {
              const isHovered = hoveredRow === row.id;
              const prevRow = rowIdx > 0 ? sortedRows[rowIdx - 1] : null;
              const sameSource = prevRow?.paperId === row.paperId;
              return (
                <tr
                  key={row.id}
                  onMouseEnter={() => setHoveredRow(row.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  className={`
                    border-t transition-colors
                    ${sameSource ? "border-t-blue-100" : "border-t-gray-100"}
                    ${rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                    ${isHovered ? "bg-blue-50/40 !important" : ""}
                  `}
                >
                  {/* 文献+实验条件（固定列） */}
                  <td
                    className={`
                      ${ds.cell} sticky left-0 z-10 border-r transition-colors relative
                      ${sameSource ? "border-l-2 border-l-blue-400 border-r-gray-200" : "border-r-gray-200"}
                      ${rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                      ${isHovered ? "bg-blue-50/40 !important" : ""}
                    `}
                  >
                    <div className="space-y-0.5 min-w-0">
                      {/* 第一层：药物+浓度（主标识，粗体） */}
                      <div className="font-semibold text-gray-900 text-[13px] truncate" title={row.drugConc}>
                        {row.drugConc || "—"}
                      </div>
                      {/* 第二层：细胞系 · 物种 */}
                      <div className="flex items-center gap-1 text-xs">
                        <span className="text-gray-600 truncate">{row.cellLine}</span>
                        {row.species && (
                          <>
                            <span className="text-gray-300">·</span>
                            <span className="text-gray-500 truncate">{row.species}</span>
                          </>
                        )}
                      </div>
                      {/* 第三层：论文来源（2行截断） */}
                      <div className="text-[11px] text-gray-400 leading-tight line-clamp-2" title={row.paperTitle}>
                        {row.paperTitle}
                      </div>
                      {/* 年份标签 */}
                      {row.year && (
                        <span className="inline-block text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded mt-0.5">
                          {row.year}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* 数据单元格 */}
                  {visibleColumns.map((col) => {
                    const cell = row.cells[col.id];
                    const hasConflict = isConflictColumn(col.id);
                    const isUp = cell?.direction === "up";
                    const isDown = cell?.direction === "down";
                    const isEmpty = !cell || (!cell.direction && !cell.significance);
                    const strength = cell?.evidenceStrength != null
                      ? getStrengthLevel(cell.evidenceStrength)
                      : null;

                    return (
                      <td
                        key={col.id}
                        onClick={(e) => handleCellClick(row, col, e.currentTarget, cell || undefined)}
                        onMouseEnter={(e) => {
                          if (cell?.direction) {
                            setHoveredCell({ row, col, cell, rect: e.currentTarget.getBoundingClientRect() });
                          }
                        }}
                        onMouseLeave={() => setHoveredCell(null)}
                        title={undefined}
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
                          ${cell && cell.direction && (cell.evidenceStrength ?? 0) < 40 ? "border border-dashed border-amber-400" : ""}
                        `}
                      >
                        {/* 低置信度警告图标 */}
                        {cell && cell.direction && (cell.evidenceStrength ?? 0) < 40 && (
                          <AlertTriangle
                            size={10}
                            className="absolute bottom-0.5 right-0.5 text-amber-500"
                          />
                        )}
                        {/* 证据强度指示点 */}
                        {cell && cell.direction && strength && (
                          <span
                            className={`absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full ${
                              (cell.evidenceStrength ?? 0) >= 80
                                ? "bg-green-500"
                                : (cell.evidenceStrength ?? 0) >= 60
                                  ? "bg-green-300"
                                  : (cell.evidenceStrength ?? 0) >= 40
                                    ? "bg-amber-400"
                                    : "bg-gray-300"
                            }`}
                          />
                        )}
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

          {/* 汇总统计行 */}
          <tfoot className="sticky bottom-0 z-10">
            <tr className="bg-gray-100 border-t-2 border-gray-300">
              <td className={`${ds.cell} sticky left-0 z-20 font-semibold text-gray-600 bg-gray-100 border-r border-gray-200`}>
                汇总
              </td>
              {visibleColumns.map((col) => {
                const s = summary.get(col.id);
                if (!s) return <td key={col.id} className={`${ds.cell} text-center text-gray-400`}>—</td>;
                const total = s.up + s.down + s.noChange;
                if (total === 0) return <td key={col.id} className={`${ds.cell} text-center text-gray-400`}>—</td>;
                return (
                  <td key={col.id} className={`${ds.cell} text-center font-medium`}>
                    {s.up > 0 && <span className="text-green-600">{s.up}↑</span>}
                    {s.up > 0 && s.down > 0 && <span className="text-gray-300 mx-0.5"> </span>}
                    {s.down > 0 && <span className="text-red-600">{s.down}↓</span>}
                    {s.noChange > 0 && <span className="text-gray-400 ml-1">{s.noChange}—</span>}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
        </DndContext>
      </div>

      {/* 分页：超过50行时显示 */}
      {sortedRows.length > 50 && (
        <div className="flex items-center justify-between text-xs text-gray-500 px-1">
          <span>
            第 1–{Math.min(visibleRowCount, sortedRows.length)} 行，共 {sortedRows.length} 行
          </span>
          {visibleRowCount < sortedRows.length && (
            <button
              onClick={() => setVisibleRowCount((prev) => Math.min(prev + 50, sortedRows.length))}
              className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              加载更多（+50 行）
            </button>
          )}
        </div>
      )}

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

      {/* Hover Tooltip */}
      {hoveredCell && (() => {
        const { row, col, cell, rect } = hoveredCell;
        const strength = cell.evidenceStrength != null ? getStrengthLevel(cell.evidenceStrength) : null;
        const isUp = cell.direction === "up";
        const isDown = cell.direction === "down";
        const TOOLTIP_WIDTH = 280;
        const MARGIN = 8;
        let left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
        let top = rect.top - MARGIN;
        if (left < MARGIN) left = MARGIN;
        if (left + TOOLTIP_WIDTH > window.innerWidth - MARGIN) left = window.innerWidth - MARGIN - TOOLTIP_WIDTH;
        // 默认显示在上方，如果上方不够则显示在下方
        const showBelow = top < 160;
        if (showBelow) top = rect.bottom + MARGIN;
        else top = top - 120; // 估算 tooltip 高度

        return (
          <div
            className="fixed z-50 bg-gray-900 text-white rounded-lg shadow-xl p-3 pointer-events-none"
            style={{ left, top, width: TOOLTIP_WIDTH }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-base font-bold ${isUp ? "text-green-400" : isDown ? "text-red-400" : "text-gray-400"}`}>
                {isUp ? "↑" : isDown ? "↓" : "—"} {isUp ? "上调" : isDown ? "下调" : "无变化"}
              </span>
              {strength && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  (cell.evidenceStrength ?? 0) >= 80 ? "bg-green-800 text-green-200"
                  : (cell.evidenceStrength ?? 0) >= 60 ? "bg-green-900 text-green-300"
                  : (cell.evidenceStrength ?? 0) >= 40 ? "bg-amber-900 text-amber-200"
                  : "bg-gray-700 text-gray-300"
                }`}>
                  {cell.evidenceStrength}/100 · {strength.label}
                </span>
              )}
            </div>
            <div className="space-y-1 text-[11px] text-gray-300">
              {cell.significance && <div><span className="text-gray-500">显著性：</span>{cell.significance}</div>}
              {cell.method && <div><span className="text-gray-500">方法：</span>{cell.method}</div>}
              <div><span className="text-gray-500">条件：</span>{row.drugConc} · {row.cellLine}</div>
              {cell.evidenceQuote && (
                <div className="mt-1.5 pt-1.5 border-t border-gray-700">
                  <span className="text-gray-500">原文：</span>
                  <span className="italic text-gray-400 line-clamp-2">&ldquo;{cell.evidenceQuote}&rdquo;</span>
                </div>
              )}
              {/* 低置信度警告 */}
              {(cell.evidenceStrength ?? 0) < 40 && (
                <div className="mt-1.5 pt-1.5 border-t border-amber-700/50 text-amber-300">
                  ⚠️ 此证据需要验证 (强度: {cell.evidenceStrength}/100)
                </div>
              )}
            </div>
          </div>
        );
      })()}

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
              evidenceStrength: 0,
            }
          }
          row={editingCell.row}
          column={editingCell.col}
          anchorRect={editingCell.anchorRect}
          onSave={handleSaveCell}
          onClose={() => setEditingCell(null)}
          projectId={projectId}
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
