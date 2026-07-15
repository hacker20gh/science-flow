"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { X, FileText, Loader2, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from "lucide-react";

// 配置 pdf.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface PDFEvidenceViewerProps {
  pdfUrl: string;
  paperTitle: string;
  evidenceQuote: string;
  onClose: () => void;
}

/**
 * PDF 原文证据查看器
 *
 * 渲染 PDF + 搜索证据文本 + 高亮定位
 */
export function PDFEvidenceViewer({ pdfUrl, paperTitle, evidenceQuote, onClose }: PDFEvidenceViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matchPage, setMatchPage] = useState<number | null>(null);
  const [searchDone, setSearchDone] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // PDF 加载成功
  const onDocumentLoadSuccess = useCallback(({ numPages: total }: { numPages: number }) => {
    setNumPages(total);
    setLoading(false);
  }, []);

  // PDF 加载失败
  const onDocumentLoadError = useCallback((err: Error) => {
    console.error("PDF load error:", err);
    setError("PDF 加载失败：" + err.message);
    setLoading(false);
  }, []);

  // 搜索证据文本所在页面
  useEffect(() => {
    if (!numPages || !evidenceQuote || searchDone) return;

    async function searchText() {
      try {
        const pdf = await pdfjs.getDocument(pdfUrl).promise;
        const searchText = evidenceQuote.substring(0, Math.min(80, evidenceQuote.length)).trim();

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items
            .map((item) => ("str" in item ? item.str : ""))
            .join(" ");

          if (pageText.toLowerCase().includes(searchText.toLowerCase())) {
            setMatchPage(i);
            setCurrentPage(i);
            setSearchDone(true);
            return;
          }
        }
        // 没找到，停在第一页
        setSearchDone(true);
      } catch {
        setSearchDone(true);
      }
    }
    searchText();
  }, [numPages, evidenceQuote, pdfUrl, searchDone]);

  // 在当前页面高亮证据文本
  useEffect(() => {
    if (!searchDone || currentPage !== matchPage) return;

    const timer = setTimeout(() => {
      const textLayer = containerRef.current?.querySelector(".react-pdf__Page__textContent");
      if (!textLayer) return;

      // 查找包含证据关键词的 span
      const spans = textLayer.querySelectorAll("span");
      const keywords = evidenceQuote
        .split(/[.,;:!?]/)
        .map(s => s.trim())
        .filter(s => s.length > 10)
        .slice(0, 3);

      spans.forEach((span) => {
        const text = span.textContent || "";
        for (const keyword of keywords) {
          if (text.toLowerCase().includes(keyword.toLowerCase().substring(0, 20))) {
            span.style.backgroundColor = "rgba(255, 235, 59, 0.6)";
            span.style.borderRadius = "2px";
            span.style.padding = "1px 2px";
          }
        }
      });
    }, 1000); // 等待文本层渲染

    return () => clearTimeout(timer);
  }, [currentPage, matchPage, searchDone, evidenceQuote]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-[900px] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-blue-500" />
            <div>
              <h3 className="text-sm font-semibold text-gray-800">PDF 原文证据</h3>
              <p className="text-xs text-gray-400 max-w-[500px] truncate">{paperTitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {matchPage && (
              <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                📍 定位到第 {matchPage} 页
              </span>
            )}
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X size={16} className="text-gray-400" />
            </button>
          </div>
        </div>

        {/* 证据片段 */}
        <div className="px-5 py-2 bg-yellow-50 border-b border-yellow-200 max-h-20 overflow-y-auto">
          <span className="text-[10px] font-medium text-yellow-700">📍 证据关键词：</span>
          <p className="text-xs text-yellow-800 mt-0.5 leading-relaxed">{evidenceQuote}</p>
        </div>

        {/* PDF 内容 */}
        <div ref={containerRef} className="flex-1 overflow-auto bg-gray-100 flex justify-center py-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 size={20} className="animate-spin text-blue-500 mr-2" />
              <span className="text-sm text-gray-400">加载 PDF 中...</span>
            </div>
          )}
          {error && (
            <div className="text-center py-12">
              <p className="text-sm text-gray-400">{error}</p>
            </div>
          )}
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading=""
          >
            <Page
              pageNumber={currentPage}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={false}
            />
          </Document>
        </div>

        {/* 底部控制栏 */}
        <div className="flex items-center justify-between px-5 py-2 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1}
              className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-gray-600">
              {currentPage} / {numPages || "?"}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(numPages, currentPage + 1))}
              disabled={currentPage >= numPages}
              className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setScale(Math.max(0.5, scale - 0.2))}
              className="p-1 hover:bg-gray-200 rounded"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-xs text-gray-500">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale(Math.min(3, scale + 0.2))}
              className="p-1 hover:bg-gray-200 rounded"
            >
              <ZoomIn size={14} />
            </button>
          </div>

          <div className="text-[10px] text-gray-400">
            💡 黄色高亮为 AI 匹配的证据位置
          </div>
        </div>
      </div>
    </div>
  );
}
