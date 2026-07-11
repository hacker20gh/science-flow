"use client";

import { useState, useRef, useEffect } from "react";
import type { MatrixCell, MatrixRow, MatrixColumn } from "@/lib/matrix/generator";

interface CellEditorProps {
  cell: MatrixCell;
  row: MatrixRow;
  column: MatrixColumn;
  anchorRect: DOMRect | null;
  onSave: (updatedCell: Partial<MatrixCell>) => void;
  onClose: () => void;
}

const DIRECTION_OPTIONS = [
  { value: "up" as const, label: "↑ 上调", color: "bg-green-100 text-green-700 border-green-300 hover:bg-green-200" },
  { value: "down" as const, label: "↓ 下调", color: "bg-red-100 text-red-700 border-red-300 hover:bg-red-200" },
  { value: "no_change" as const, label: "— 无变化", color: "bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200" },
];

export function CellEditor({ cell, row, column, anchorRect, onSave, onClose }: CellEditorProps) {
  const [direction, setDirection] = useState<MatrixCell["direction"]>(cell.direction);
  const [significance, setSignificance] = useState(cell.significance ?? "");
  const [note, setNote] = useState(cell.detail ?? "");
  const [saving, setSaving] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    // Delay listener to avoid immediate close on the triggering click
    const timer = setTimeout(() => {
      document.addEventListener("mousedown", handleClick);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Compute popover position
  let style: React.CSSProperties = {};
  if (anchorRect) {
    const POPOVER_WIDTH = 320;
    const POPOVER_HEIGHT = 360;
    const MARGIN = 8;
    let left = anchorRect.left + anchorRect.width / 2 - POPOVER_WIDTH / 2;
    let top = anchorRect.bottom + MARGIN;

    // Keep within viewport
    if (left < MARGIN) left = MARGIN;
    if (left + POPOVER_WIDTH > window.innerWidth - MARGIN) {
      left = window.innerWidth - MARGIN - POPOVER_WIDTH;
    }
    // If no room below, show above
    if (top + POPOVER_HEIGHT > window.innerHeight - MARGIN) {
      top = anchorRect.top - POPOVER_HEIGHT - MARGIN;
    }
    if (top < MARGIN) top = MARGIN;

    style = { position: "fixed", left, top, zIndex: 50, width: POPOVER_WIDTH };
  }

  async function handleSave() {
    setSaving(true);
    try {
      onSave({
        direction,
        significance: significance || null,
        detail: note,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Popover */}
      <div
        ref={editorRef}
        className="bg-white rounded-xl shadow-xl border border-gray-200 p-4"
        style={style}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-gray-800 truncate">
            {column.label}
          </h4>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-lg leading-none p-1"
          >
            ×
          </button>
        </div>

        {/* Direction selector */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            变化方向
          </label>
          <div className="flex gap-1.5">
            {DIRECTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDirection(opt.value)}
                className={`flex-1 px-2 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  direction === opt.value
                    ? `${opt.color} ring-2 ring-offset-1 ring-blue-300`
                    : "bg-white text-gray-400 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Significance */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            显著性
          </label>
          <input
            type="text"
            value={significance}
            onChange={(e) => setSignificance(e.target.value)}
            placeholder="例：p&lt;0.05, p&lt;0.01, ns"
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300"
          />
        </div>

        {/* Note */}
        <div className="mb-3">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">
            备注
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="补充说明..."
            className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-300 resize-none"
          />
        </div>

        {/* Read-only context: paper & evidence */}
        <div className="bg-gray-50 rounded-lg p-3 mb-3 text-xs space-y-2">
          <div>
            <span className="text-gray-400">文献：</span>
            <span className="text-gray-700">{row.paperTitle}</span>
          </div>
          <div>
            <span className="text-gray-400">条件：</span>
            <span className="text-gray-700">{row.drugConc} · {row.cellLine}</span>
          </div>
          {cell.method && (
            <div>
              <span className="text-gray-400">方法：</span>
              <span className="text-gray-700">{cell.method}</span>
            </div>
          )}
          {cell.evidenceQuote && (
            <div>
              <span className="text-gray-400">原文引用：</span>
              <blockquote className="mt-0.5 pl-2 border-l-2 border-gray-200 text-gray-500 italic">
                &ldquo;{cell.evidenceQuote}&rdquo;
              </blockquote>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </>
  );
}
