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
    const key = paper.doi || paper.pmid || paper.title;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(papers.map((p) => p.doi || p.pmid || p.title)));
  }

  function handleConfirm() {
    const selectedPapers = papers.filter((p) => {
      const key = p.doi || p.pmid || p.title;
      return selected.has(key);
    });
    onSelect(selectedPapers);
  }

  if (papers.length === 0) return null;

  return (
    <div className="space-y-4">
      {/* 操作栏 */}
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

      {/* 文献列表 */}
      <div className="space-y-3">
        {papers.map((paper) => {
          const key = paper.doi || paper.pmid || paper.title;
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
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggle(paper)}
                  className="mt-1"
                />

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm leading-5">
                    {paper.title}
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">
                    {paper.authors.slice(0, 3).join(", ")}
                    {paper.authors.length > 3 ? ` 等 ${paper.authors.length} 位` : ""}
                    {" · "}
                    {paper.journal}
                    {" · "}
                    {paper.year}
                  </p>

                  {/* TLDR 或摘要截断 */}
                  {paper.tldr && (
                    <p className="text-xs text-blue-600 mt-2">
                      💡 {paper.tldr}
                    </p>
                  )}

                  {/* 标签 */}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {paper.citationCount > 0 && (
                      <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">
                        引用 {paper.citationCount}
                      </span>
                    )}
                    {paper.isOpenAccess && (
                      <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                        Open Access
                      </span>
                    )}
                    {!paper.isOpenAccess && !paper.oaPdfUrl && (
                      <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">
                        付费 · 仅摘要提取
                      </span>
                    )}
                    {paper.pmid && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
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
