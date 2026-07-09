"use client";

import { useState } from "react";
import { SearchForm, type SearchOptions } from "@/components/papers/search-form";
import { SearchResults, type Paper } from "@/components/papers/search-results";

interface QueryInfo {
  original: string;
  optimized: string;
  meshTerms: string[];
  intent: string;
  refinements: string[];
}

interface SearchResponse {
  total: number;
  papers: Paper[];
  queryInfo: QueryInfo;
  sources: { pubmed: number; semanticScholar: number };
}

export default function ProjectPaperSearchPage() {
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch(query: string, options: SearchOptions) {
    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      const res = await fetch("/api/papers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, ...options }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "搜索失败");
      }

      const data = await res.json();
      setResults(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "搜索失败，请重试");
    } finally {
      setIsLoading(false);
    }
  }

  function handleSelect(papers: Paper[]) {
    console.log("Selected papers for project:", papers);
    alert(`已选择 ${papers.length} 篇文献，后续将接入 LLM 提取功能`);
  }

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">🔍 搜索文献</h1>
      <p className="text-gray-500 mb-6 text-sm">
        搜索 PubMed + Semantic Scholar，自动发现 Open Access 全文
      </p>

      <SearchForm onSearch={handleSearch} isLoading={isLoading} />

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {isLoading && (
        <div className="mt-8 text-center text-gray-500 space-y-2">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-blue-600" />
          <p className="text-sm">正在理解你的研究问题...</p>
        </div>
      )}

      {/* 查询优化信息 */}
      {results?.queryInfo && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
          <div className="flex items-start gap-2">
            <span className="mt-0.5">🤖</span>
            <div className="space-y-1">
              <p>
                <span className="font-medium">搜索意图：</span>
                {results.queryInfo.intent}
              </p>
              {results.queryInfo.optimized !== results.queryInfo.original && (
                <p>
                  <span className="font-medium">优化查询：</span>
                  <code className="bg-blue-100 px-1 rounded text-xs">
                    {results.queryInfo.optimized}
                  </code>
                </p>
              )}
              {results.queryInfo.refinements.length > 0 && (
                <p className="text-blue-600">
                  💡 {results.queryInfo.refinements.join(" ")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 搜索结果 */}
      {results && (
        <div className="mt-4">
          <div className="text-xs text-gray-400 mb-4">
            PubMed: {results.sources.pubmed} 篇 · Semantic Scholar:{" "}
            {results.sources.semanticScholar} 篇 · 合计 {results.total}{" "}
            篇（已去重）
          </div>
          <SearchResults papers={results.papers} onSelect={handleSelect} />
        </div>
      )}
    </main>
  );
}
