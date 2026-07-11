"use client";

import { useState, useMemo } from "react";
import { TOOL_LABELS } from "@/lib/chat/chat-utils";

interface ToolResultCardProps {
  tool: string;
  result: Record<string, unknown>;
}

export function ToolResultCard({ tool, result }: ToolResultCardProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = TOOL_LABELS[tool] || { icon: "🔧", name: tool, executing: `执行 ${tool}...` };

  const preview = useMemo(() => {
    if (tool === "search_literature" && Array.isArray(result.papers)) {
      return `找到 ${result.total} 篇文献`;
    }
    if (tool === "list_papers" && typeof result.count === "number") {
      return `项目中有 ${result.count} 篇文献`;
    }
    if (tool === "view_extractions" && typeof result.count === "number") {
      return `${result.count} 条提取数据`;
    }
    if (tool === "create_hypothesis" && result.success) {
      return `假设已创建`;
    }
    if (tool === "view_matrix" && typeof result.pathways_studied === "number") {
      return `${result.pathways_studied} 个通路${result.conflicts ? `，${(result.conflicts as string[]).length} 个冲突` : ""}`;
    }
    if (tool === "get_project_status" && typeof result.papers === "number") {
      return `${result.papers} 篇文献，${result.extractions} 条数据`;
    }
    return meta.name;
  }, [tool, result, meta.name]);

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-blue-100 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <span>{meta.icon}</span>
          <span className="font-medium text-blue-900">{meta.name}</span>
          <span className="text-blue-600">— {preview}</span>
        </span>
        <span className="text-blue-400">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 border-t border-blue-100">
          <pre className="text-xs text-blue-800 whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto mt-1">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
