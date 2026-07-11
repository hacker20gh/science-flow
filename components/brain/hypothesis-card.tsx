"use client";

import { useState, useRef, useEffect } from "react";
import { CheckCircle, AlertTriangle, Pencil, Trash2, ChevronDown } from "lucide-react";
import { HypothesisStatusBadge, STATUS_CONFIG } from "./hypothesis-status-badge";
import { calculateHypothesisStrength } from "@/lib/assistant/process-assistant";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface HypothesisCardProps {
  hypothesis: {
    id: string;
    statement: string;
    status: string;
    evidence: unknown;
    basedOn: string[];
    createdAt: string;
  };
  projectId: string;
  onUpdate: (id: string, data: { status?: string; statement?: string }) => void;
  onDelete: (id: string) => void;
  totalExperiments: number;
  onEdit: (hypothesis: HypothesisCardProps["hypothesis"]) => void;
}

export function HypothesisCard({
  hypothesis,
  onUpdate,
  onDelete,
  totalExperiments,
  onEdit,
}: HypothesisCardProps) {
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const evidence = (hypothesis.evidence as {
    supporting?: string[];
    contradicting?: string[];
  }) || {};
  const supporting = evidence.supporting ?? [];
  const contradicting = evidence.contradicting ?? [];

  const strength = calculateHypothesisStrength({
    supportingPapers: supporting.length || (hypothesis.status === "supported" ? 1 : 0),
    contradictingPapers: contradicting.length || (hypothesis.status === "refused" ? 1 : 0),
    totalExperiments,
  });

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowStatusDropdown(false);
      }
    };
    if (showStatusDropdown) {
      document.addEventListener("mousedown", handler);
    }
    return () => document.removeEventListener("mousedown", handler);
  }, [showStatusDropdown]);

  const handleStatusChange = (newStatus: string) => {
    setShowStatusDropdown(false);
    if (newStatus !== hypothesis.status) {
      onUpdate(hypothesis.id, { status: newStatus });
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    setShowDeleteConfirm(false);
    onDelete(hypothesis.id);
  };

  return (
    <>
    <div className="bg-white border border-gray-200 rounded-xl p-6">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          {/* Header: status badge + statement + actions */}
          <div className="flex items-center gap-2 mb-2">
            {/* Status dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setShowStatusDropdown(!showStatusDropdown)}
                className="flex items-center gap-0.5 hover:opacity-80 transition-opacity"
              >
                <HypothesisStatusBadge status={hypothesis.status} />
                <ChevronDown size={12} className="text-gray-400" />
              </button>

              {showStatusDropdown && (
                <div className="absolute top-full left-0 mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px]">
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => handleStatusChange(key)}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 ${
                        key === hypothesis.status ? "font-medium bg-gray-50" : ""
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${
                        key === "pending"
                          ? "bg-gray-400"
                          : key === "testing"
                            ? "bg-amber-500"
                            : key === "supported"
                              ? "bg-green-500"
                              : key === "refused"
                                ? "bg-red-500"
                                : "bg-blue-500"
                      }`} />
                      {cfg.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <h3 className="font-medium text-sm">{hypothesis.statement}</h3>
          </div>

          {/* Evidence strength progress bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-gray-500">证据强度</span>
              <span className={`font-medium ${strength.color}`}>
                {strength.score}% — {strength.label}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  strength.score >= 60
                    ? "bg-green-500"
                    : strength.score >= 40
                      ? "bg-amber-500"
                      : "bg-red-400"
                }`}
                style={{ width: `${strength.score}%` }}
              />
            </div>
          </div>

          {/* Supporting / Contradicting evidence */}
          {(supporting.length > 0 || contradicting.length > 0) && (
            <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
              {supporting.length > 0 && (
                <div>
                  <p className="text-green-600 font-medium mb-1 flex items-center gap-1">
                    <CheckCircle size={14} />
                    支持证据 ({supporting.length})
                  </p>
                  <ul className="space-y-1 text-gray-600">
                    {supporting.slice(0, 4).map((s, i) => (
                      <li key={i}>• {s}</li>
                    ))}
                    {supporting.length > 4 && (
                      <li className="text-gray-400">
                        …还有 {supporting.length - 4} 条
                      </li>
                    )}
                  </ul>
                </div>
              )}
              {contradicting.length > 0 && (
                <div>
                  <p className="text-amber-600 font-medium mb-1 flex items-center gap-1">
                    <AlertTriangle size={14} />
                    反对证据 ({contradicting.length})
                  </p>
                  <ul className="space-y-1 text-gray-600">
                    {contradicting.slice(0, 4).map((c, i) => (
                      <li key={i}>• {c}</li>
                    ))}
                    {contradicting.length > 4 && (
                      <li className="text-gray-400">
                        …还有 {contradicting.length - 4} 条
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Based on sources */}
          {hypothesis.basedOn.length > 0 && (
            <p className="mt-3 text-xs text-gray-400">
              基于：{hypothesis.basedOn.join("、")}
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 ml-3 shrink-0">
          <button
            onClick={() => onEdit(hypothesis)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600"
            title="编辑"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>

    <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除假设</AlertDialogTitle>
          <AlertDialogDescription>
            确定删除假设「{hypothesis.statement.slice(0, 40)}{hypothesis.statement.length > 40 ? "..." : ""}」？此操作不可撤销。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={confirmDelete} className="bg-red-600 hover:bg-red-700">
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
