"use client";

import { useState, useEffect, useRef } from "react";
import { X, FileText, Loader2 } from "lucide-react";

interface EvidenceViewerProps {
  paperId: string;
  paperTitle: string;
  evidenceQuote: string;
  onClose: () => void;
}

/**
 * 原文证据查看器
 *
 * 点击原文证据后弹出，显示论文全文并高亮证据所在段落
 */
export function EvidenceViewer({ paperId, paperTitle, evidenceQuote, onClose }: EvidenceViewerProps) {
  const [fullText, setFullText] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // 获取论文全文
  useEffect(() => {
    let cancelled = false;
    async function fetchText() {
      try {
        const res = await fetch(`/api/papers/${paperId}/fulltext`);
        if (!res.ok) throw new Error("获取全文失败");
        const data = await res.json();
        if (!cancelled) {
          // 优先用全文，没有则用摘要
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

  // 滚动到高亮位置
  useEffect(() => {
    if (fullText && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [fullText]);

  // 将文本按段落渲染
  function renderParagraphs(text: string, className = "text-gray-700") {
    // 按换行符或双空格分段
    const paragraphs = text.split(/\n\n|\n/).filter(p => p.trim().length > 0);
    if (paragraphs.length <= 1) {
      // 没有段落结构，按句子分段（每3-5句一段）
      const sentences = text.split(/(?<=[.!?。！？])\s+/);
      const chunks: string[] = [];
      for (let i = 0; i < sentences.length; i += 4) {
        chunks.push(sentences.slice(i, i + 4).join(" "));
      }
      return chunks.map((chunk, i) => (
        <p key={i} className={`text-sm leading-relaxed mb-3 ${className}`}>{chunk}</p>
      ));
    }
    return paragraphs.map((p, i) => (
      <p key={i} className={`text-sm leading-relaxed mb-3 ${className}`}>{p.trim()}</p>
    ));
  }

  // 在全文中定位并高亮证据
  function renderFullText() {
    if (!fullText) return null;

    const quote = evidenceQuote?.trim();
    if (!quote) return <div>{renderParagraphs(fullText)}</div>;

    // 尝试在全文中找到证据段落
    const quoteLower = quote.toLowerCase();
    const textLower = fullText.toLowerCase();
    const matchIndex = textLower.indexOf(quoteLower.substring(0, Math.min(50, quoteLower.length)));

    if (matchIndex === -1) {
      // 没找到精确匹配，显示全文 + 证据片段
      return (
        <div>
          <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <span className="text-xs font-medium text-yellow-700">证据片段：</span>
            <p className="text-sm text-yellow-800 mt-1">{evidenceQuote}</p>
          </div>
          {renderParagraphs(fullText)}
        </div>
      );
    }

    // 找到匹配位置，提取上下文（前后各 500 字符）
    const contextStart = Math.max(0, matchIndex - 500);
    const contextEnd = Math.min(fullText.length, matchIndex + quote.length + 500);
    const before = fullText.slice(contextStart, matchIndex);
    const match = fullText.slice(matchIndex, matchIndex + quote.length);
    const after = fullText.slice(matchIndex + quote.length, contextEnd);

    return (
      <div>
        {/* 上下文导航提示 */}
        <div className="text-xs text-gray-400 mb-2">
          显示证据前后各 500 字符上下文
        </div>

        {/* 上文 */}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-500">
          {contextStart > 0 && "..."}
          {before}
        </p>

        {/* 高亮的证据 */}
        <div ref={highlightRef} className="my-2 p-3 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-lg">
          <span className="text-xs font-medium text-yellow-700 block mb-1">📍 原文证据</span>
          <p className="text-sm text-yellow-900 font-medium leading-relaxed">{match}</p>
        </div>

        {/* 下文 */}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-500">
          {after}
          {contextEnd < fullText.length && "..."}
        </p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[800px] max-h-[80vh] flex flex-col"
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
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={16} className="text-gray-400" />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-blue-500 mr-2" />
              <span className="text-sm text-gray-400">加载全文中...</span>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400">{error}</p>
              {evidenceQuote && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg text-left max-w-lg mx-auto">
                  <span className="text-xs font-medium text-gray-500">可用证据片段：</span>
                  <p className="text-sm text-gray-700 mt-1">{evidenceQuote}</p>
                </div>
              )}
            </div>
          ) : (
            renderFullText()
          )}
        </div>

        {/* 底部 */}
        <div className="px-5 py-2 border-t border-gray-100 text-xs text-gray-400">
          💡 黄色高亮部分为 AI 提取的原文证据
        </div>
      </div>
    </div>
  );
}
