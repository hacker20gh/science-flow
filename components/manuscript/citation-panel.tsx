"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { CitationMatch, ParsedCitation, PaperForMatch } from "@/lib/manuscript/citation-parser";

interface CitationPanelProps {
  projectId: string;
  text: string; // 当前章节的文本内容
  onInsertCitation?: (paper: PaperForMatch) => void;
}

interface ValidationResult {
  matches: CitationMatch[];
  unmatched: ParsedCitation[];
  uncited: PaperForMatch[];
  stats: {
    total: number;
    verified: number;
    fuzzy: number;
    unmatched: number;
  };
}

export default function CitationPanel({ projectId, text, onInsertCitation }: CitationPanelProps) {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<"verified" | "unmatched" | "uncited" | null>("unmatched");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const validate = useCallback(async () => {
    if (!text.trim()) {
      setResult(null);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/manuscript/validate-citations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, text }),
      });
      if (res.ok) {
        const data = await res.json();
        setResult(data);
        // 自动展开有警告的分类
        if (data.unmatched.length > 0) setExpanded("unmatched");
        else if (data.uncited.length > 0) setExpanded("uncited");
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [projectId, text]);

  // debounce 文本变化
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(validate, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [validate]);

  const { stats } = result || { stats: { total: 0, verified: 0, fuzzy: 0, unmatched: 0 } };

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* 标题栏 */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">📚 引用验证</span>
          {loading && (
            <span className="inline-block w-3 h-3 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
          )}
        </div>
        {result && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-green-600">✅ {stats.verified}</span>
            {stats.fuzzy > 0 && <span className="text-amber-600">🔶 {stats.fuzzy}</span>}
            {stats.unmatched > 0 && <span className="text-red-600">⚠️ {stats.unmatched}</span>}
          </div>
        )}
      </div>

      {/* 无数据 */}
      {!result && !loading && (
        <div className="px-4 py-6 text-center text-xs text-gray-400">
          {text.trim() ? "正在分析..." : "编辑论文内容后自动验证引用"}
        </div>
      )}

      {/* 验证结果 */}
      {result && (
        <div className="divide-y divide-gray-100">
          {/* 统计概览 */}
          <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500">
            共 {stats.total} 处引用 · {stats.verified} 已验证 · {stats.fuzzy} 模糊匹配 · {stats.unmatched} 未匹配
          </div>

          {/* ⚠️ 未匹配引用 */}
          <Section
            title={`⚠️ 未匹配 (${result.unmatched.length})`}
            isOpen={expanded === "unmatched"}
            onToggle={() => setExpanded(expanded === "unmatched" ? null : "unmatched")}
            count={result.unmatched.length}
            variant="warning"
          >
            {result.unmatched.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">所有引用均已匹配 🎉</p>
            ) : (
              <div className="space-y-1.5">
                {result.unmatched.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-amber-600">⚠️</span>
                    <span className="font-mono text-gray-700 bg-amber-50 px-1.5 py-0.5 rounded">
                      ({c.raw})
                    </span>
                    <span className="text-gray-400">未在文献库中找到</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ✅ 已验证引用 */}
          <Section
            title={`✅ 已验证 (${stats.verified + stats.fuzzy})`}
            isOpen={expanded === "verified"}
            onToggle={() => setExpanded(expanded === "verified" ? null : "verified")}
            count={stats.verified + stats.fuzzy}
            variant="success"
          >
            <div className="space-y-1.5">
              {result.matches
                .filter((m) => m.matchType !== "none")
                .map((m, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={m.matchType === "exact" ? "text-green-600" : "text-amber-600"}>
                      {m.matchType === "exact" ? "✅" : "🔶"}
                    </span>
                    <span className="font-mono text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded">
                      ({m.citation.authors[0]}, {m.citation.year})
                    </span>
                    <span className="text-gray-500 truncate flex-1" title={m.paper?.title}>
                      → {m.paper?.title}
                    </span>
                    {m.matchType === "fuzzy" && (
                      <span className="text-amber-500 text-[10px]">
                        {Math.round(m.confidence * 100)}%
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </Section>

          {/* 📭 未引用文献 */}
          <Section
            title={`📭 未引用 (${result.uncited.length})`}
            isOpen={expanded === "uncited"}
            onToggle={() => setExpanded(expanded === "uncited" ? null : "uncited")}
            count={result.uncited.length}
            variant="info"
          >
            {result.uncited.length === 0 ? (
              <p className="text-xs text-gray-400 py-2">所有文献均已引用</p>
            ) : (
              <div className="space-y-2">
                {result.uncited.map((paper) => (
                  <div key={paper.id} className="flex items-start gap-2 text-xs">
                    <span className="text-blue-400 mt-0.5">📭</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-700 truncate" title={paper.title}>
                        {paper.title}
                      </p>
                      <p className="text-gray-400">
                        {paper.authors[0]?.split(" ").pop()}, {paper.year || "n.d."}
                      </p>
                    </div>
                    {onInsertCitation && (
                      <button
                        onClick={() => onInsertCitation(paper)}
                        className="shrink-0 px-2 py-0.5 text-[10px] text-blue-600 bg-blue-50 rounded hover:bg-blue-100"
                      >
                        插入引用
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      )}
    </div>
  );
}

// ─── 可折叠 Section 子组件 ───────────────────────────────────

function Section({
  title,
  isOpen,
  onToggle,
  count,
  variant,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  count: number;
  variant: "warning" | "success" | "info";
  children: React.ReactNode;
}) {
  const borderColor =
    variant === "warning"
      ? "border-l-amber-400"
      : variant === "success"
        ? "border-l-green-400"
        : "border-l-blue-400";

  return (
    <div className={`border-l-2 ${borderColor}`}>
      <button
        onClick={onToggle}
        className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 text-xs"
      >
        <span className="font-medium text-gray-700">{title}</span>
        <span className="text-gray-400">{isOpen ? "▲" : "▼"}</span>
      </button>
      {isOpen && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}
