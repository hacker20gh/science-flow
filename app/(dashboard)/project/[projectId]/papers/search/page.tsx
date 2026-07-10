"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { SearchForm, type SearchOptions } from "@/components/papers/search-form";
import { SearchResults, type Paper } from "@/components/papers/search-results";
import { ExtractionReview } from "@/components/papers/extraction-review";
import { useProjectStore, type StoredPaper } from "@/store/project-store";

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

interface SearchHistoryItem {
  id: string;
  query: string;
  optimizedQuery: string | null;
  sources: string[];
  maxResults: number;
  resultCount: number;
  createdAt: string;
}

export default function ProjectPaperSearchPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { papers: storedPapers, addPapers, updatePaperExtraction, loadProject } = useProjectStore();

  // 注册 projectId 到 store（确保 refreshMatrix 能持久化矩阵到 DB）
  useEffect(() => {
    if (projectId) loadProject(projectId);
  }, [projectId, loadProject]);

  const [view, setView] = useState<"search" | "extracting" | "review">("search");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [extractionData, setExtractionData] = useState<ExtractionResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPapers, setSelectedPapers] = useState<Paper[]>([]);
  const [extractionProgress, setExtractionProgress] = useState({ done: 0, total: 0 });

  // 搜索历史
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Record<string, "saving" | "saved" | "error">>({});
  const [dbPapers, setDbPapers] = useState<Array<{ id: string; title: string; authors: string[]; journal: string | null; year: number | null; extractions: { id: string }[] }>>([]);

  // 加载已保存的文献（从 DB）
  const loadDbPapers = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/papers`);
      if (res.ok) {
        const data = await res.json();
        setDbPapers(data.papers || []);
      }
    } catch {
      // 静默
    }
  }, [projectId]);

  // 加载搜索历史
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/search-history`);
      if (res.ok) {
        const data = await res.json();
        setSearchHistory(data.history || []);
      }
    } catch {
      // 静默失败，不影响搜索功能
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadHistory();
    loadDbPapers();
  }, [loadHistory, loadDbPapers]);

  // 清空搜索历史
  async function handleClearHistory() {
    try {
      await fetch(`/api/projects/${projectId}/search-history`, { method: "DELETE" });
      setSearchHistory([]);
    } catch {
      // 静默失败
    }
  }

  async function handleSearch(query: string, options: SearchOptions) {
    setIsLoading(true);
    setError(null);
    setResults(null);
    setView("search");

    try {
      const res = await fetch("/api/papers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, projectId, ...options }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "搜索失败");
      setResults(await res.json());
      // 搜索完成后刷新历史记录
      loadHistory();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setIsLoading(false);
    }
  }

  // 点击历史记录快速搜索
  function handleHistoryClick(item: SearchHistoryItem) {
    handleSearch(item.query, {
      maxResults: item.maxResults,
      minYear: null,
      maxYear: null,
      minCitationCount: null,
      sortBy: "relevance",
      articleTypes: ["journal-article", "review"],
      onlyOpenAccess: false,
    });
  }

  async function handleSelect(papers: Paper[]) {
    setSelectedPapers(papers);

    // 1. 同步保存论文到 DB，获取 DB ID（处理 DOI 重复）
    const dbIdMap = new Map<string, string>(); // searchId -> dbId
    for (const p of papers) {
      const searchId = p.doi || p.pmid || p.title;
      try {
        const res = await fetch(`/api/projects/${projectId}/papers`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: p.title,
            doi: p.doi || null,
            pmid: p.pmid || null,
            authors: p.authors,
            journal: p.journal,
            year: p.year,
            abstract: p.abstract,
            source: p.sources?.[0] || "semantic_scholar",
            oaUrl: p.oaPdfUrl || null,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.paper?.id) dbIdMap.set(searchId, data.paper.id);
        } else if (res.status === 409) {
          // DOI 重复 — 用 DOI 从 DB 查找已有论文 ID
          const listRes = await fetch(`/api/projects/${projectId}/papers`);
          if (listRes.ok) {
            const listData = await listRes.json();
            const existing = listData.papers?.find(
              (pp: { doi?: string; pmid?: string; id: string }) =>
                pp.doi === p.doi || pp.pmid === p.pmid
            );
            if (existing) dbIdMap.set(searchId, existing.id);
          }
        }
      } catch {
        // 保存失败时用 searchId 作为 fallback
      }
    }

    // 1b. 同时加入 store（用 DB ID 作为 paperId）
    const stored: StoredPaper[] = papers.map((p) => {
      const searchId = p.doi || p.pmid || p.title;
      const dbId = dbIdMap.get(searchId) || searchId;
      return {
        paperId: dbId,
        title: p.title,
        authors: p.authors,
        journal: p.journal,
        year: p.year,
        abstract: p.abstract,
        doi: p.doi,
        pmid: p.pmid,
        citationCount: p.citationCount,
        isOpenAccess: p.isOpenAccess,
        oaPdfUrl: p.oaPdfUrl,
        articleType: "研究论文",
        extractionStatus: "extracting" as const,
        experiments: [],
      };
    });
    addPapers(stored);

    // 2. 触发提取
    setView("extracting");
    setExtractionProgress({ done: 0, total: papers.length });

    try {
      const res = await fetch("/api/papers/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          papers: papers.map((p) => {
        const searchId = p.doi || p.pmid || p.title;
        return {
          paperId: dbIdMap.get(searchId) || searchId,
          title: p.title,
          abstract: p.abstract,
        };
      }),
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || "提取失败");

      const data = await res.json();
      setExtractionData(data.results);

      // 3. 把提取结果写回 store + 批量持久化到数据库
      const saveStatuses: Record<string, "saving" | "saved" | "error"> = {};
      for (const result of data.results) {
        if (result.extraction?.experiments) {
          updatePaperExtraction(
            result.paperId,
            "done",
            result.extraction.experiments
          );
          // 批量持久化提取结果
          saveStatuses[result.paperId] = "saving";
          setSaveStatus({ ...saveStatuses });
          fetch(`/api/projects/${projectId}/extractions/batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              paperId: result.paperId,
              extractions: result.extraction.experiments,
            }),
          })
            .then((r) => {
              saveStatuses[result.paperId] = r.ok ? "saved" : "error";
              setSaveStatus({ ...saveStatuses });
            })
            .catch(() => {
              saveStatuses[result.paperId] = "error";
              setSaveStatus({ ...saveStatuses });
            });
        } else {
          updatePaperExtraction(
            result.paperId,
            "error",
            undefined,
            result.error || "No experiments found"
          );
        }
      }

      setView("review");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "提取失败");
      // 标记所有为失败
      for (const p of storedPapers) {
        updatePaperExtraction(p.paperId, "error", undefined, "Extraction failed");
      }
      setView("search");
    }
  }

  function handleExtractionConfirm() {
    alert("提取结果已保存！前往知识面板查看机制矩阵");
  }

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">搜索文献</h1>
      <p className="text-gray-500 mb-6 text-sm">
        搜索 PubMed + Semantic Scholar + OpenAlex
      </p>

      {/* 搜索表单 */}
      {view === "search" && (
        <SearchForm onSearch={handleSearch} isLoading={isLoading} />
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* 提取进度 */}
      {view === "extracting" && (
        <div className="mt-8 text-center text-gray-500 space-y-3">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600" />
          <p className="text-sm">正在提取 {selectedPapers.length} 篇文献的信息...</p>
          <p className="text-xs text-gray-400">
            这可能需要 1-2 分钟，请耐心等待
          </p>
        </div>
      )}

      {/* 查询优化信息 */}
      {results?.queryInfo && view === "search" && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
          <div className="flex items-start gap-2">
            <span className="mt-0.5">搜索意图：</span>
            <div className="space-y-1">
              <p><span className="font-medium">搜索意图：</span>{results.queryInfo.intent}</p>
              {results.queryInfo.optimized !== results.queryInfo.original && (
                <p>
                  <span className="font-medium">优化查询：</span>
                  <code className="bg-blue-100 px-1 rounded text-xs">{results.queryInfo.optimized}</code>
                </p>
              )}
              {results.queryInfo.refinements.length > 0 && (
                <p className="text-blue-600">{results.queryInfo.refinements.join(" ")}</p>
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
            {results.sources.openAlex} · 合计 {results.total} 篇（已去重）
          </div>
          <SearchResults papers={results.papers} onSelect={handleSelect} projectId={projectId} />
        </div>
      )}

      {/* 提取结果审核 */}
      {extractionData && view === "review" && (
        <div className="mt-4">
          <ExtractionReview
            extractions={extractionData.map((r) => ({
              paperId: r.paperId,
              title: r.title,
              extraction: r.extraction,
              error: r.error,
            }))}
            onConfirm={handleExtractionConfirm}
          />

          {/* 保存状态提示 */}
          {Object.keys(saveStatus).length > 0 && (
            <div className="mt-3 text-xs space-y-1">
              {Object.entries(saveStatus).map(([paperId, status]) => (
                <div key={paperId} className="flex items-center gap-2">
                  <span
                    className={
                      status === "saved"
                        ? "text-green-600"
                        : status === "saving"
                          ? "text-blue-500"
                          : "text-red-500"
                    }
                  >
                    {status === "saved"
                      ? "已保存"
                      : status === "saving"
                        ? "保存中..."
                        : "保存失败"}
                  </span>
                  <span className="text-gray-400 truncate max-w-xs">{paperId}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <a
              href="brain"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
            >
              查看机制矩阵
            </a>
            <button
              onClick={() => setView("search")}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              继续搜索
            </button>
          </div>
        </div>
      )}

      {/* 搜索历史面板 */}
      {view === "search" && !results && (
        <div className="mt-8">
          {/* 已入库文献统计 */}
          {storedPapers.length > 0 && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-100 rounded-xl">
              <p className="text-sm text-blue-700">
                项目中已有 <span className="font-medium">{storedPapers.length}</span> 篇文献，
                其中 <span className="font-medium">
                  {storedPapers.filter((p) => p.extractionStatus === "done").length}
                </span> 篇已完成提取
              </p>
              <a href="brain" className="text-xs text-blue-600 hover:underline mt-1 inline-block">
                查看知识面板
              </a>
            </div>
          )}

          {/* 搜索历史 */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-medium text-gray-700">搜索历史</h2>
              <div className="flex items-center gap-2">
                {searchHistory.length > 0 && (
                  <button
                    onClick={handleClearHistory}
                    className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                  >
                    清空
                  </button>
                )}
              </div>
            </div>
            {historyLoading ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">加载中...</div>
            ) : searchHistory.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                暂无搜索记录
              </div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {searchHistory.slice(0, 10).map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => handleHistoryClick(item)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors group"
                      disabled={isLoading}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-gray-800 group-hover:text-blue-700 truncate">
                            {item.query}
                          </p>
                          {item.optimizedQuery && item.optimizedQuery !== item.query && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">
                              优化为: {item.optimizedQuery}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-gray-500">
                            {item.resultCount} 篇
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {new Date(item.createdAt).toLocaleDateString("zh-CN", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
