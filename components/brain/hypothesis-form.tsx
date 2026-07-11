"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { STATUS_CONFIG } from "./hypothesis-status-badge";

interface HypothesisFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: {
    statement: string;
    status: string;
    evidence?: { supporting?: string[]; contradicting?: string[] };
    basedOn?: string[];
  }) => void;
  initialData?: {
    statement: string;
    status: string;
    evidence?: { supporting?: string[]; contradicting?: string[] };
    basedOn?: string[];
  };
  mode: "create" | "edit";
}

export function HypothesisForm({
  isOpen,
  onClose,
  onSubmit,
  initialData,
  mode,
}: HypothesisFormProps) {
  const [statement, setStatement] = useState(initialData?.statement ?? "");
  const [status, setStatus] = useState(initialData?.status ?? "pending");
  const [supportingText, setSupportingText] = useState(
    initialData?.evidence?.supporting?.join("\n") ?? ""
  );
  const [contradictingText, setContradictingText] = useState(
    initialData?.evidence?.contradicting?.join("\n") ?? ""
  );
  const [basedOnText, setBasedOnText] = useState(
    initialData?.basedOn?.join("\n") ?? ""
  );

  // Reset form when initialData changes (e.g. switching between hypotheses)
  useEffect(() => {
    if (isOpen) {
      setStatement(initialData?.statement ?? "");
      setStatus(initialData?.status ?? "pending");
      setSupportingText(initialData?.evidence?.supporting?.join("\n") ?? "");
      setContradictingText(
        initialData?.evidence?.contradicting?.join("\n") ?? ""
      );
      setBasedOnText(initialData?.basedOn?.join("\n") ?? "");
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const parseList = (text: string): string[] =>
    text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!statement.trim()) return;

    const supporting = parseList(supportingText);
    const contradicting = parseList(contradictingText);

    onSubmit({
      statement: statement.trim(),
      status,
      evidence:
        supporting.length > 0 || contradicting.length > 0
          ? { supporting, contradicting }
          : undefined,
      basedOn: parseList(basedOnText),
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold text-sm">
            {mode === "create" ? "新建假设" : "编辑假设"}
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Statement */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              假设陈述 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              placeholder="例如：sorafenib 通过 NF-κB 上调 HCC 细胞中的 PD-L1 表达"
              required
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              状态
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>
                  {cfg.label}
                </option>
              ))}
            </select>
          </div>

          {/* Supporting evidence */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              支持证据（每行一条）
            </label>
            <textarea
              value={supportingText}
              onChange={(e) => setSupportingText(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              placeholder={"Liu 2024: NF-κB 与 PD-L1 正相关\n实验 #2: sorafenib 2-3μM 上调 PD-L1"}
            />
          </div>

          {/* Contradicting evidence */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              反对证据（每行一条）
            </label>
            <textarea
              value={contradictingText}
              onChange={(e) => setContradictingText(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={2}
              placeholder={"Chen 2023: 10μM 下调 PD-L1"}
            />
          </div>

          {/* Based on */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              基于来源（每行一条，可选）
            </label>
            <textarea
              value={basedOnText}
              onChange={(e) => setBasedOnText(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={2}
              placeholder={"Liu 2024\nChen 2023"}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={!statement.trim()}
            >
              {mode === "create" ? "创建" : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
