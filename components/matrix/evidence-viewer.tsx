"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { X, FileText, Loader2, ChevronUp, ChevronDown, ChevronRight } from "lucide-react";

interface EvidenceViewerProps {
  paperId: string;
  paperTitle: string;
  evidenceQuote: string;
  onClose: () => void;
}

interface Section {
  name: string;
  label: string;
  content: string;
  startOffset: number;
}

/**
 * 解析全文为章节结构（通用模式）
 *
 * 支持多种论文格式：
 * - markdown: ## Introduction
 * - 编号: 1. Introduction, 3.1 Results
 * - 大写: INTRODUCTION, METHODS
 * - 中文: 目的, 方法, 结果, 结论
 * - PMC XML: === ABSTRACT ===
 */
function parseSections(text: string): Section[] {
  // 通用章节关键词（不区分大小写，匹配各种格式）
  // 只保留核心内容章节（致谢/文献/图表说明等合并为"其他"）
  const SECTION_KEYWORDS: Array<{ name: string; label: string; keywords: string[] }> = [
    { name: "abstract", label: "Abstract", keywords: ["abstract", "摘要"] },
    { name: "introduction", label: "Introduction", keywords: ["introduction", "背景", "引言"] },
    { name: "methods", label: "Methods", keywords: ["methods", "methodology", "star methods", "材料与方法", "方法"] },
    { name: "results", label: "Results", keywords: ["results", "结果"] },
    { name: "discussion", label: "Discussion", keywords: ["discussion", "讨论"] },
    { name: "conclusion", label: "Conclusion", keywords: ["conclusion", "conclusions", "结论", "总结"] },
  ];

  // 非核心章节关键词（遇到这些就截断正文内容）
  const STOP_KEYWORDS = ["references", "参考文献", "bibliography", "acknowledgments", "acknowledgements", "致谢", "figure legends", "图例", "supplementary", "=== figure", "=== table"];

  // 按行扫描，找章节标题
  const lines = text.split("\n");
  const found: Array<{ name: string; label: string; lineIdx: number; charOffset: number }> = [];

  let charOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineStart = charOffset;
    charOffset += lines[i].length + 1; // +1 for \n

    // 跳过太长或太短的行（章节标题通常 < 80 字符）
    if (line.length < 3 || line.length > 80) continue;

    // 去掉 markdown 标记和编号
    const cleaned = line
      .replace(/^#{1,4}\s*/, "")           // ## 标题
      .replace(/^\d+\.?\d*\s*/, "")        // 1. 标题 / 3.1 标题
      .replace(/[:：]\s*$/, "")             // 去掉末尾冒号
      .trim();

    if (cleaned.length < 3) continue;

    // 匹配章节关键词
    for (const section of SECTION_KEYWORDS) {
      const matched = section.keywords.some(kw => {
        const lower = cleaned.toLowerCase();
        // 精确匹配（标题就是关键词本身，或关键词在标题开头）
        return lower === kw || lower.startsWith(kw + " ") || lower.startsWith(kw + ":");
      });

      if (matched) {
        // 避免重复（同一个 section name 只保留第一个）
        if (!found.some(f => f.name === section.name)) {
          found.push({ name: section.name, label: section.label, lineIdx: i, charOffset: lineStart });
        }
        break;
      }
    }

    // 遇到非核心章节标题（致谢/文献等）→ 截断，不再继续扫描
    // 只匹配独立成行的标题（行长度 < 30），避免正文里提到 "references" 被误截
    if (line.length < 30) {
      const lowerLine = cleaned.toLowerCase();
      if (STOP_KEYWORDS.some(kw => lowerLine === kw || lowerLine.startsWith(kw + " ") || lowerLine.startsWith(kw + ":"))) {
        break;
      }
    }
  }

  // 构建 sections
  const sections: Section[] = [];
  for (let i = 0; i < found.length; i++) {
    const startLine = found[i].lineIdx + 1; // 标题行的下一行开始
    const endLine = i + 1 < found.length ? found[i + 1].lineIdx : lines.length;
    const content = lines.slice(startLine, endLine).join("\n").trim();

    if (content.length > 30) {
      sections.push({
        name: found[i].name,
        label: found[i].label,
        content,
        startOffset: found[i].charOffset,
      });
    }
  }

  // 如果没识别到章节，把整个文本当作一个 section
  if (sections.length === 0) {
    sections.push({ name: "full", label: "Full Text", content: text, startOffset: 0 });
  }

  return sections;
}

/**
 * 原文证据查看器（带章节结构 + 全文高亮）
 */
export function EvidenceViewer({ paperId, paperTitle, evidenceQuote, onClose }: EvidenceViewerProps) {
  const [fullText, setFullText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const highlightRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // 获取论文全文
  useEffect(() => {
    let cancelled = false;
    async function fetchText() {
      try {
        const res = await fetch(`/api/papers/${paperId}/fulltext`);
        if (!res.ok) throw new Error("获取全文失败");
        const data = await res.json();
        if (!cancelled) {
          const text = data.fullText || data.abstract || null;
          setFullText(text);
          if (!text) setError("暂无全文和摘要");
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchText();
    return () => { cancelled = true; };
  }, [paperId]);

  // 解析章节
  const sections = useMemo(() => fullText ? parseSections(fullText) : [], [fullText]);

  // 查找证据匹配
  const matches = useMemo(() => {
    if (!fullText || !evidenceQuote) return [];
    const results: { start: number; end: number; sectionIdx: number }[] = [];
    const normalizedQuote = evidenceQuote.replace(/\s+/g, " ").trim();
    const normalizedText = fullText.replace(/\s+/g, " ");

    let searchFrom = 0;
    while (searchFrom < normalizedText.length) {
      const idx = normalizedText.indexOf(normalizedQuote, searchFrom);
      if (idx === -1) break;
      const approxStart = fullText.indexOf(normalizedQuote.slice(0, 30), Math.max(0, idx - 50));
      if (approxStart !== -1) {
        // 找到匹配所在的 section
        const sectionIdx = sections.findIndex(s =>
          approxStart >= s.startOffset && approxStart < s.startOffset + s.content.length
        );
        results.push({ start: approxStart, end: approxStart + normalizedQuote.length, sectionIdx });
      }
      searchFrom = idx + 1;
    }

    // 模糊匹配
    if (results.length === 0) {
      const snippet = normalizedQuote.slice(0, 50).toLowerCase();
      const textLower = fullText.toLowerCase();
      let pos = textLower.indexOf(snippet);
      while (pos !== -1) {
        const sectionIdx = sections.findIndex(s =>
          pos >= s.startOffset && pos < s.startOffset + s.content.length
        );
        results.push({ start: pos, end: Math.min(pos + normalizedQuote.length, fullText.length), sectionIdx });
        pos = textLower.indexOf(snippet, pos + 1);
        if (results.length >= 10) break;
      }
    }

    return results;
  }, [fullText, evidenceQuote, sections]);

  // 自动滚动到当前匹配
  useEffect(() => {
    if (matches.length > 0 && highlightRefs.current[currentMatch]) {
      highlightRefs.current[currentMatch]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [currentMatch, matches.length]);

  // 自动展开包含证据的 section
  useEffect(() => {
    if (matches.length > 0) {
      const matchSectionIdx = matches[currentMatch]?.sectionIdx;
      if (matchSectionIdx !== undefined && matchSectionIdx >= 0) {
        const sectionName = sections[matchSectionIdx]?.name;
        if (sectionName) {
          setCollapsedSections(prev => { const next = new Set(prev); next.delete(sectionName); return next; });
        }
      }
    }
  }, [currentMatch, matches, sections]);

  const toggleSection = (name: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  // 渲染带高亮的文本片段
  function renderTextWithHighlights(text: string, sectionStartOffset: number) {
    const sectionMatches = matches.filter(m =>
      m.start >= sectionStartOffset && m.start < sectionStartOffset + text.length
    );

    if (sectionMatches.length === 0) {
      return <>{text}</>;
    }

    const segments: Array<{ text: string; isMatch: boolean; globalMatchIdx: number }> = [];
    let lastEnd = 0;

    for (const m of sectionMatches) {
      const localStart = Math.max(0, m.start - sectionStartOffset);
      // 截断到 section 边界（不跨章节高亮）
      const localEnd = Math.min(Math.max(localStart, m.end - sectionStartOffset), text.length);
      if (localStart >= text.length || localEnd <= localStart) continue;
      const globalIdx = matches.indexOf(m);

      if (localStart > lastEnd) {
        segments.push({ text: text.slice(lastEnd, localStart), isMatch: false, globalMatchIdx: -1 });
      }
      segments.push({ text: text.slice(localStart, localEnd), isMatch: true, globalMatchIdx: globalIdx });
      lastEnd = localEnd;
    }
    if (lastEnd < text.length) {
      segments.push({ text: text.slice(lastEnd), isMatch: false, globalMatchIdx: -1 });
    }

    return (
      <>
        {segments.map((seg, i) =>
          seg.isMatch ? (
            <span
              key={i}
              ref={el => { highlightRefs.current[seg.globalMatchIdx] = el; }}
              className={`bg-yellow-200 px-0.5 rounded cursor-pointer transition-all ${
                seg.globalMatchIdx === currentMatch ? "bg-yellow-400 ring-2 ring-yellow-500 font-medium" : "hover:bg-yellow-300"
              }`}
              onClick={() => setCurrentMatch(seg.globalMatchIdx)}
            >
              {seg.text}
            </span>
          ) : (
            <span key={i}>{seg.text}</span>
          )
        )}
      </>
    );
  }

  // 章节图标
  const sectionIcons: Record<string, string> = {
    abstract: "📋", introduction: "📖", methods: "🔬", results: "📊",
    discussion: "💬", conclusion: "✅", full: "📄",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[960px] max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-blue-500" />
            <div>
              <h3 className="text-sm font-semibold text-gray-800">原文证据</h3>
              <p className="text-xs text-gray-400 max-w-[500px] truncate">{paperTitle}</p>
            </div>
          </div>

          {matches.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">
                {currentMatch + 1} / {matches.length} 处匹配
              </span>
              <button onClick={() => setCurrentMatch((currentMatch - 1 + matches.length) % matches.length)} className="p-1 hover:bg-gray-100 rounded">
                <ChevronUp size={14} className="text-gray-500" />
              </button>
              <button onClick={() => setCurrentMatch((currentMatch + 1) % matches.length)} className="p-1 hover:bg-gray-100 rounded">
                <ChevronDown size={14} className="text-gray-500" />
              </button>
            </div>
          )}

          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-blue-500 mr-2" />
              <span className="text-sm text-gray-400">加载全文中...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12 px-5">
              <p className="text-sm text-gray-400">{error}</p>
              {evidenceQuote && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg text-left max-w-lg mx-auto">
                  <span className="text-xs font-medium text-gray-500">可用证据片段：</span>
                  <p className="text-sm text-gray-700 mt-1">{evidenceQuote}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="px-5 py-4 space-y-1">
              {sections.map((section, sectionIdx) => {
                const isCollapsed = collapsedSections.has(section.name);
                const hasMatch = matches.some(m => m.sectionIdx === sectionIdx);

                return (
                  <div key={`${section.name}-${sectionIdx}`} className="border border-gray-100 rounded-lg overflow-hidden">
                    {/* 章节标题 */}
                    <button
                      onClick={() => toggleSection(section.name)}
                      className={`w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                        hasMatch ? "bg-yellow-50 border-l-4 border-l-yellow-400" : "bg-gray-50/50"
                      }`}
                    >
                      <span className="text-sm">{isCollapsed ? <ChevronRight size={14} /> : "▼"}</span>
                      <span className="text-sm">{sectionIcons[section.name] || "📄"}</span>
                      <span className="text-sm font-medium text-gray-700">{section.label}</span>
                      {hasMatch && (
                        <span className="text-[10px] bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded-full ml-1">
                          含证据
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400 ml-auto">{section.content.length} 字</span>
                    </button>

                    {/* 章节内容 */}
                    {!isCollapsed && (
                      <div className="px-4 py-3 text-sm text-gray-700 leading-relaxed whitespace-pre-wrap max-h-[500px] overflow-y-auto">
                        {renderTextWithHighlights(section.content, section.startOffset)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部 */}
        <div className="px-5 py-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
          <span>💡 黄色高亮 = 原文证据 | 点击切换 ↑↓ 导航 | 章节可折叠</span>
          <span>{sections.length} 个章节</span>
        </div>
      </div>
    </div>
  );
}
