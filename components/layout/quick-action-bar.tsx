"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Search,
  FlaskConical,
  Upload,
  FileText,
  MessageCircle,
  BarChart3,
  X,
} from "lucide-react";

export function QuickActionBar() {
  const { projectId } = useParams<{ projectId: string }>();
  const [expanded, setExpanded] = useState(false);

  const actions = [
    { icon: Search, label: "搜文献", href: `/project/${projectId}/papers/search`, color: "blue" },
    { icon: Upload, label: "上传PDF", href: `/project/${projectId}/papers`, color: "purple" },
    { icon: FlaskConical, label: "设计实验", href: `/project/${projectId}/experiments`, color: "green" },
    { icon: BarChart3, label: "分析数据", href: `/project/${projectId}/data`, color: "amber" },
    { icon: FileText, label: "写论文", href: `/project/${projectId}/manuscript`, color: "rose" },
    { icon: MessageCircle, label: "AI 对话", href: "#chat", color: "cyan" },
  ];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden">
      {expanded && (
        <div className="bg-white/95 backdrop-blur border-t border-gray-200 px-4 py-3">
          <div className="grid grid-cols-3 gap-2">
            {actions.map((action) => (
              <Link
                key={action.label}
                href={action.href}
                onClick={() => setExpanded(false)}
                className="flex flex-col items-center gap-1 p-3 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <action.icon size={20} className={`text-${action.color}-500`} />
                <span className="text-xs text-gray-600">{action.label}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setExpanded(!expanded)}
        className={`w-full py-3 flex items-center justify-center transition-colors ${
          expanded
            ? "bg-gray-100 text-gray-600"
            : "bg-primary text-white"
        }`}
      >
        {expanded ? (
          <X size={20} />
        ) : (
          <span className="text-sm font-medium">⚡ 快捷操作</span>
        )}
      </button>
    </div>
  );
}
