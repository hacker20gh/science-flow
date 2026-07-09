"use client";

import { useState } from "react";
import { SearchForm, type SearchOptions } from "@/components/papers/search-form";
import { SearchResults, type Paper } from "@/components/papers/search-results";
import { ExtractionReview } from "@/components/papers/extraction-review";

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
  sources: { pubmed: number; semanticScholar: number; openAlex: number };
}

interface ExtractionResult {
  paperId: string;
  title: string;
  extraction: {
    experiments: Array<{
      drug_intervention: { name: string; concentration: string | null; duration: string | null; co_treatment: string | null };
      model: { cell_line: string | null; species: string | null; passage: string | null };
      pathway_effects: Array<{ pathway: string; direction: "up" | "down" | "no_change"; significance: string | null; method: string | null }>;
      phenotype_effects: Array<{ phenotype: string; direction: "up" | "down" | "no_change"; fold_change: string | null }>;
      controls: string[];
      statistical_test: string | null;
      sample_size: number | null;
      conclusion: string;
      evidence_quote: string;
    }>;
  } | null;
  error?: string;
}

interface ExtractionResponse {
  results: ExtractionResult[];
  summary: {
    total: number;
    success: number;
    errors: number;
    totalExperiments: number;
  };
}

export default function ProjectPaperSearchPage() {
  const [view, setView] = useState<"search" | "extracting" | "review">("search");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [extractionData, setExtractionData] = useState<ExtractionResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPapers, setSelectedPapers] = useState<Paper[]>([]);

  async function handleSearch(query: string, options: SearchOptions) {
    setIsLoading(true);
    setError(null);
    setResults(null);
    setView("search");

    try {
      const res = await fetch("/api/papers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, ...options }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "搜索失败");
      setResults(await res.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleExtract(papers: Paper[]) {
    setView("extracting");
    setSelectedPapers(papers);
    setError(null);

    try {
      const res = await fetch("/api/papers/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          papers: papers.map((p) => ({
            paperId: p.doi || p.pmid || p.title,
            title: p.title,
            abstract: p.abstract,
          })),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "提取失败");
      const data = await res.json();
      setExtractionData(data);
      setView("review");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "提取失败");
      setView("search");
    }
  }

  function handleExtractionConfirm(extractions: unknown[]) {
    console.log("Confirmed extractions:", extractions);
    alert(`已确认 ${extractions.length} 篇文献的提取结果，后续将接入机制矩阵`);
  }

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">🔍 搜索文献</h1>
      <p className="text-gray-500 mb-6 text-sm">
        搜索 PubMed + Semantic Scholar + OpenAlex，自动发现 Open Access 全文
      </p>

      {/* 搜索表单（提取阶段隐藏） */}
      {view === "search" && (
        <SearchForm onSearch={handleSearch} isLoading={isLoading} />
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* 加载状态 */}
      {view === "extracting" && (
        <div className="mt-8 text-center text-gray-500 space-y-2">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600" />
          <p className="text-sm">正在提取 {selectedPapers.length} 篇文献的信息...</p>
          <p className="text-xs text-gray-400">
            这可能需要一些时间，请耐心等待
          </p>
        </div>
      )}

      {/* 查询优化信息 */}
      {results?.queryInfo && view === "search" && (
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
      {results && view === "search" && (
        <div className="mt-4">
          <div className="text-xs text-gray-400 mb-4">
            PubMed: {results.sources.pubmed} · Semantic Scholar:{" "}
            {results.sources.semanticScholar} · OpenAlex:{" "}
            {results.sources.openAlex} · 合计 {results.total}{" "}
            篇（已去重）
          </div>
          <SearchResults papers={results.papers} onSelect={handleExtract} />
        </div>
      )}

      {/* 提取结果审核 */}
      {extractionData && view === "review" && (
        <div className="mt-4">
          <ExtractionReview
            extractions={extractionData.results}
            onConfirm={handleExtractionConfirm}
          />
        </div>
      )}

      {/* 返回搜索按钮 */}
      {view === "review" && (
        <button
          onClick={() => setView("search")}
          className="mt-6 text-sm text-blue-600 hover:text-blue-800"
        >
          ← 返回搜索结果
        </button>
      )}
    </main>
  );
}
