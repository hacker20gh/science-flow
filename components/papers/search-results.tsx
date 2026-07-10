"use client";

import { useState } from "react";
import { Download, Loader2, Check } from "lucide-react";

export interface Paper {
  pmid: string | null;
  doi: string | null;
  title: string;
  authors: string[];
  journal: string;
  year: number;
  abstract: string;
  citationCount: number;
  isOpenAccess: boolean;
  oaPdfUrl: string | null;
  tldr: string | null;
  articleType: string;
  sources: string[];
}

interface SearchResultsProps {
  papers: Paper[];
  onSelect: (papers: Paper[]) => void;
  projectId?: string;
}

export function SearchResults({ papers, onSelect, projectId }: SearchResultsProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());

  function toggle(paper: Paper) {
    const key = paperKey(paper);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(papers.map(paperKey)));
  }

  function handleConfirm() {
    onSelect(papers.filter((p) => selected.has(paperKey(p))));
  }

  async function handleDownloadPdf(paper: Paper, e: React.MouseEvent) {
    e.stopPropagation();
    if (!projectId || !paper.oaPdfUrl) return;

    const key = paperKey(paper);
    setDownloading((prev) => new Set(prev).add(key));

    try {
      const res = await fetch(`/api/projects/${projectId}/download-pdf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          pdfUrl: paper.oaPdfUrl,
          title: paper.title,
        }),
      });

      if (res.ok) {
        setDownloaded((prev) => new Set(prev).add(key));
      }
    } catch {
      // 下载失败静默处理
    } finally {
      setDownloading((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  if (papers.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          找到 {papers.length} 篇文献，已选 {selected.size} 篇
        </div>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            全选
          </button>
          <button
            onClick={handleConfirm}
            disabled={selected.size === 0}
            className="px-4 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            纳入所选文献 → 提取信息
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {papers.map((paper) => {
          const key = paperKey(paper);
          const isSelected = selected.has(key);

          return (
            <div
              key={key}
              onClick={() => toggle(paper)}
              className={`p-4 border rounded-lg cursor-pointer transition-all ${
                isSelected
                  ? "border-blue-500 bg-blue-50 ring-1 ring-blue-200"
                  : "border-gray-200 hover:border-gray-300 bg-white"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(paper)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm leading-5">
                    {paper.title}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {paper.authors.slice(0, 3).join(", ")}
                    {paper.authors.length > 3
                      ? ` 等 ${paper.authors.length} 位`
                      : ""}
                    {" · "}
                    {paper.journal}
                  </p>

                  {paper.tldr && (
                    <p className="text-xs text-blue-600 mt-2">
                      💡 {paper.tldr}
                    </p>
                  )}

                  {paper.abstract && (
                    <p className="text-xs text-gray-400 mt-1 line-clamp-2">
                      {paper.abstract}
                    </p>
                  )}

                  {/* 标签栏 */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {/* 年份 */}
                    {paper.year > 0 && (
                      <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                        {paper.year}
                      </span>
                    )}

                    {/* 文献类型 */}
                    {paper.articleType && (
                      <span className="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded">
                        {paper.articleType}
                      </span>
                    )}

                    {/* 引用量 */}
                    {paper.citationCount > 0 && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          paper.citationCount >= 100
                            ? "bg-amber-100 text-amber-800"
                            : paper.citationCount >= 20
                              ? "bg-blue-50 text-blue-600"
                              : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        引用 {paper.citationCount}
                      </span>
                    )}

                    {/* OA 状态 + 下载按钮 */}
                    {paper.isOpenAccess && paper.oaPdfUrl ? (
                      <div className="flex items-center gap-1">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                          OA 全文
                        </span>
                        {projectId && (
                          <button
                            onClick={(e) => handleDownloadPdf(paper, e)}
                            disabled={downloading.has(paperKey(paper)) || downloaded.has(paperKey(paper))}
                            className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1 transition-colors"
                          >
                            {downloading.has(paperKey(paper)) ? (
                              <Loader2 size={10} className="animate-spin" />
                            ) : downloaded.has(paperKey(paper)) ? (
                              <Check size={10} />
                            ) : (
                              <Download size={10} />
                            )}
                            {downloaded.has(paperKey(paper)) ? "已下载" : "下载 PDF"}
                          </button>
                        )}
                      </div>
                    ) : paper.isOpenAccess ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-600 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                        OA（待获取）
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
                        仅摘要
                      </span>
                    )}

                    {/* 来源 */}
                    {paper.pmid && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-400">
                        PubMed
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function paperKey(paper: Paper): string {
  return paper.doi || paper.pmid || paper.title;
}
