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
                    {" · "}
                    {paper.year}
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

                  <div className="flex gap-2 mt-2 flex-wrap">
                    {paper.citationCount > 0 && (
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          paper.citationCount >= 100
                            ? "bg-amber-100 text-amber-800 font-medium"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        引用 {paper.citationCount}
                      </span>
                    )}
                    {paper.isOpenAccess && paper.oaPdfUrl && (
                      <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded font-medium">
                        ✅ OA 全文可提取
                      </span>
                    )}
                    {paper.isOpenAccess && !paper.oaPdfUrl && (
                      <span className="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded">
                        Open Access（链接待获取）
                      </span>
                    )}
                    {!paper.isOpenAccess && (
                      <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-700 rounded">
                        📎 仅摘要（可上传 PDF 补充）
                      </span>
                    )}
                    {paper.pmid && (
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded">
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
