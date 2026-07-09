"use client";

import { useState } from "react";

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
}

export function SearchResults({ papers, onSelect }: SearchResultsProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

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
                      <span className="text-xs px-1.5 py-0.5 bg-gray-50 text-gray-600 rounded">
                        {paper.year}
                      </span>
                    )}

                    {/* 文献类型 */}
                    {paper.articleType && paper.articleType !== "研究论文" && (
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
                              ? "bg-gray-100 text-gray-700"
                              : "text-gray-400"
                        }`}
                      >
                        引用 {paper.citationCount}
                      </span>
                    )}

                    {/* OA 状态 */}
                    {paper.isOpenAccess && paper.oaPdfUrl ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                        OA 全文
                      </span>
                    ) : paper.isOpenAccess ? (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-600 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
                        OA（待获取）
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300 inline-block" />
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
