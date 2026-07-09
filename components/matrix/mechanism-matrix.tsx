"use client";

import { useState } from "react";
import type {
  MatrixData,
  MatrixRow,
  MatrixColumn,
  MatrixCell,
} from "@/lib/matrix/generator";

interface MechanismMatrixProps {
  data: MatrixData;
  onCellClick?: (row: MatrixRow, column: MatrixColumn, cell: MatrixCell) => void;
}

export function MechanismMatrix({ data, onCellClick }: MechanismMatrixProps) {
  const [selectedCell, setSelectedCell] = useState<{
    row: MatrixRow;
    col: MatrixColumn;
    cell: MatrixCell;
  } | null>(null);

  const [filterType, setFilterType] = useState<"all" | "pathway" | "phenotype">("all");

  const visibleColumns =
    filterType === "all"
      ? data.columns
      : data.columns.filter((c) => c.type === filterType);

  function handleCellClick(row: MatrixRow, col: MatrixColumn) {
    const cell = row.cells[col.id];
    if (!cell) return;
    setSelectedCell({ row, col, cell });
    onCellClick?.(row, col, cell);
  }

  if (data.rows.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
        <p className="text-lg">暂无数据</p>
        <p className="text-sm mt-2">完成文献提取后，机制矩阵会自动生成</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 工具栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">维度筛选：</span>
          {(["all", "pathway", "phenotype"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-2 py-1 text-xs rounded ${
                filterType === t
                  ? "bg-blue-100 text-blue-700"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {t === "all" ? "全部" : t === "pathway" ? "通路" : "表型"}
            </button>
          ))}
        </div>
        <div className="text-xs text-gray-400">
          {data.totalPapers} 篇文献 · {data.totalExperiments} 个实验 ·{" "}
          {visibleColumns.length} 个维度
          {data.conflicts.length > 0 && (
            <span className="ml-2 text-amber-600">
              ⚠️ {data.conflicts.length} 个冲突
            </span>
          )}
        </div>
      </div>

      {/* 冲突摘要 */}
      {data.conflicts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs text-amber-800 font-medium mb-1">
            ⚠️ 发现 {data.conflicts.length} 个冲突
          </p>
          {data.conflicts.map((c) => (
            <p key={c.columnId} className="text-xs text-amber-700">
              • <span className="font-medium">{c.columnId.split(":")[1]}</span>：{c.description}
            </p>
          ))}
        </div>
      )}

      {/* 矩阵表格 */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="min-w-full text-xs">
          {/* 表头 */}
          <thead>
            <tr className="bg-gray-50">
              <th className="px-3 py-2 text-left font-medium text-gray-600 sticky left-0 bg-gray-50 min-w-[180px] border-r border-gray-200">
                文献 · 实验条件
              </th>
              {visibleColumns.map((col) => (
                <th
                  key={col.id}
                  className="px-3 py-2 text-center font-medium text-gray-600 min-w-[100px]"
                >
                  <div>{col.label}</div>
                  <div className="text-[10px] text-gray-400 font-normal">
                    {col.type === "pathway" ? "通路" : "表型"} · {col.count} 篇
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* 表体 */}
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                {/* 文献+实验条件 */}
                <td className="px-3 py-2 sticky left-0 bg-white border-r border-gray-200">
                  <div className="font-medium text-gray-800 truncate max-w-[180px]">
                    {row.drugConc}
                  </div>
                  <div className="text-gray-500">
                    {row.cellLine}
                    {row.year ? ` · ${row.year}` : ""}
                  </div>
                </td>

                {/* 数据单元格 */}
                {visibleColumns.map((col) => {
                  const cell = row.cells[col.id];
                  return (
                    <td
                      key={col.id}
                      onClick={() => cell && handleCellClick(row, col)}
                      className={`px-3 py-2 text-center ${
                        cell
                          ? "cursor-pointer hover:bg-blue-50"
                          : "bg-gray-50"
                      } ${
                        cell?.direction === "up"
                          ? "text-green-700"
                          : cell?.direction === "down"
                            ? "text-red-700"
                            : "text-gray-400"
                      }`}
                    >
                      {cell ? (
                        <span className="inline-flex items-center gap-0.5">
                          <span className="text-base font-bold">
                            {cell.direction === "up"
                              ? "↑"
                              : cell.direction === "down"
                                ? "↓"
                                : "—"}
                          </span>
                          {cell.significance && (
                            <span className="text-[10px] text-gray-400">
                              {cell.significance}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-200">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 单元格详情弹窗 */}
      {selectedCell && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
          onClick={() => setSelectedCell(null)}
        >
          <div
            className="bg-white rounded-xl shadow-lg max-w-lg w-full mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">
                {selectedCell.col.label}
              </h3>
              <button
                onClick={() => setSelectedCell(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ×
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">文献：</span>
                <span className="font-medium">{selectedCell.row.paperTitle}</span>
              </div>
              <div>
                <span className="text-gray-500">实验条件：</span>
                <span>
                  {selectedCell.row.drugConc} · {selectedCell.row.cellLine}
                </span>
              </div>
              <div>
                <span className="text-gray-500">变化方向：</span>
                <span
                  className={
                    selectedCell.cell.direction === "up"
                      ? "text-green-600 font-medium"
                      : selectedCell.cell.direction === "down"
                        ? "text-red-600 font-medium"
                        : "text-gray-500"
                  }
                >
                  {selectedCell.cell.direction === "up"
                    ? "↑ 上调"
                    : selectedCell.cell.direction === "down"
                      ? "↓ 下调"
                      : "— 无显著变化"}
                </span>
              </div>
              {selectedCell.cell.detail && (
                <div>
                  <span className="text-gray-500">详情：</span>
                  <span>{selectedCell.cell.detail}</span>
                </div>
              )}
              <div className="border-t border-gray-100 pt-3">
                <span className="text-gray-500">原文引用：</span>
                <blockquote className="mt-1 pl-3 border-l-2 border-gray-200 text-gray-600 italic text-xs">
                  &ldquo;{selectedCell.cell.evidenceQuote}&rdquo;
                </blockquote>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
