"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useParams, useRouter } from "next/navigation";
import { SearchForm, type SearchOptions } from "@/components/papers/search-form";
import { SearchResults, type Paper } from "@/components/papers/search-results";
import { ExtractionReview } from "@/components/papers/extraction-review";
import { useProjectStore, type StoredPaper } from "@/store/project-store";
import {
  ArrowLeft, Brain, Search, Loader2, CheckCircle, AlertCircle,
  ChevronDown, ChevronUp, Zap, Clock,
} from "lucide-react";

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
  searchParams: SearchOptions | null;
  resultSnapshot: Paper[] | null;
  createdAt: string;
}

export default function ProjectPaperSearchPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const { papers: storedPapers, addPapers, updatePaperExtraction, loadProject } = useProjectStore();

  useEffect(() => {
    if (projectId) loadProject(projectId);
  }, [projectId, loadProject]);

  const [view, setView] = useState<"search" | "extracting" | "review">("search");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [extractionData, setExtractionData] = useState<ExtractionResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPapers, setSelectedPapers] = useState<Paper[]>([]);
  const [saveStatus, setSaveStatus] = useState<Record<string, "saving" | "saved" | "error">>({});
  const [isFromCache, setIsFromCache] = useState(false);
  const [showQueryDetails, setShowQueryDetails] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState("");

  // 搜索历史
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  // 提取进度详情
  const [extractionDetails, setExtractionDetails] = useState<Array<{
    title: string;
    status: "pending" | "running" | "done" | "error";
    experiments: number;
    error?: string;
  }>>([]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/search-history`);
      if (res.ok) {
        const data = await res.json();
        setSearchHistory(data.history || []);
      }
    } catch {
      // 静默
    } finally {
      setHistoryLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function handleClearHistory() {
    try {
      await fetch(`/api/projects/${projectId}/search-history`, { method: "DELETE" });
      setSearchHistory([]);
    } catch { /* 静默 */ }
  }

  // 搜索历史过滤
  const filteredHistory = useMemo(() => {
    if (!historySearchQuery) return searchHistory;
    const q = historySearchQuery.toLowerCase();
    return searchHistory.filter((h) => h.query.toLowerCase().includes(q));
  }, [searchHistory, historySearchQuery]);

  const displayedHistory = showAllHistory ? filteredHistory : filteredHistory.slice(0, 5);

  // 点击历史记录 → 秒级回放
  function handleHistoryClick(item: SearchHistoryItem) {
    if (item.resultSnapshot && item.resultSnapshot.length > 0) {
      // 有快照 → 立即显示
      setResults({
        total: item.resultCount,
        papers: item.resultSnapshot,
        queryInfo: {
          original: item.query,
          optimized: item.optimizedQuery || item.query,
          meshTerms: [],
          intent: item.query,
          refinements: [],
        },
        sources: { pubmed: 0, semanticScholar: 0, openAlex: 0 },
      });
      setIsFromCache(true);
      setView("search");
    } else {
      // 无快照 → 正常搜索
      handleSearch(item.query, item.searchParams || {
        maxResults: item.maxResults,
        minYear: null,
        maxYear: null,
        minCitationCount: null,
        sortBy: "relevance",
        articleTypes: ["journal-article", "review"],
        onlyOpenAccess: false,
      });
    }
  }

  async function handleSearch(query: string, options: SearchOptions) {
    setIsLoading(true);
    setError(null);
    setResults(null);
    setIsFromCache(false);
    setView("search");

    try {
      const res = await fetch("/api/papers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, projectId, ...options }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "搜索失败");
      const data = await res.json();
      setResults(data);
      loadHistory();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSelect(papers: Paper[]) {
    setSelectedPapers(papers);

    // 1. 保存论文到 DB
    const dbIdMap = new Map<string, string>();
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
          const listRes = await fetch(`/api/projects/${projectId}/papers`);
          if (listRes.ok) {
            const listData = await listRes.json();
            const existing = listData.papers?.find(
              (pp: { doi?: string; pmid?: string; id: string }) => pp.doi === p.doi || pp.pmid === p.pmid
            );
            if (existing) dbIdMap.set(searchId, existing.id);
          }
        }
      } catch { /* fallback */ }
    }

    // 1b. 加入 store
    const stored: StoredPaper[] = papers.map((p) => {
      const searchId = p.doi || p.pmid || p.title;
      const dbId = dbIdMap.get(searchId) || searchId;
      return {
        paperId: dbId, title: p.title, authors: p.authors, journal: p.journal,
        year: p.year, abstract: p.abstract, doi: p.doi, pmid: p.pmid,
        citationCount: p.citationCount, isOpenAccess: p.isOpenAccess,
        oaPdfUrl: p.oaPdfUrl, articleType: "研究论文",
        extractionStatus: "extracting" as const, experiments: [],
      };
    });
    addPapers(stored);

    // 2. 初始化提取进度详情
    setView("extracting");
    setExtractionDetails(papers.map((p) => ({
      title: p.title, status: "pending" as const, experiments: 0,
    })));

    // 3. 触发提取
    try {
      const res = await fetch("/api/papers/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          papers: papers.map((p) => {
            const searchId = p.doi || p.pmid || p.title;
            return { paperId: dbIdMap.get(searchId) || searchId, title: p.title, abstract: p.abstract };
          }),
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || "提取失败");

      const data = await res.json();
      setExtractionData(data.results);

      // 更新进度详情
      setExtractionDetails((prev) => prev.map((d, i) => {
        const result = data.results?.[i];
        if (!result) return d;
        return {
          ...d,
          status: result.extraction ? "done" as const : "error" as const,
          experiments: result.extraction?.experiments?.length || 0,
          error: result.error,
        };
      }));

      // 持久化提取结果
      const saveStatuses: Record<string, "saving" | "saved" | "error"> = {};
      for (const result of data.results) {
        if (result.extraction?.experiments) {
          updatePaperExtraction(result.paperId, "done", result.extraction.experiments);
          saveStatuses[result.paperId] = "saving";
          setSaveStatus({ ...saveStatuses });
          fetch(`/api/projects/${projectId}/extractions/batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paperId: result.paperId, extractions: result.extraction.experiments }),
          })
            .then((r) => { saveStatuses[result.paperId] = r.ok ? "saved" : "error"; setSaveStatus({ ...saveStatuses }); })
            .catch(() => { saveStatuses[result.paperId] = "error"; setSaveStatus({ ...saveStatuses }); });
        } else {
          updatePaperExtraction(result.paperId, "error", undefined, result.error || "No experiments found");
        }
      }

      setView("review");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "提取失败");
      setExtractionDetails((prev) => prev.map((d) => ({ ...d, status: "error" as const, error: "提取失败" })));
      setView("search");
    }
  }

  function handleExtractionConfirm() {
    toast.success("提取结果已保存", {
      description: "前往知识面板查看机制矩阵",
    });
  }

  const totalExperiments = extractionDetails.reduce((sum, d) => sum + d.experiments, 0);
  const doneCount = extractionDetails.filter((d) => d.status === "done" || d.status === "error").length;

  return (
    <main className="p-8 max-w-4xl mx-auto">
      {/* 顶部导航栏 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/project/${projectId}/papers`)}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <ArrowLeft size={16} />
            返回文献管理
          </button>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/project/${projectId}/brain`}
            className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
          >
            <Brain size={14} />
            知识面板
          </a>
        </div>
      </div>

      {/* 页面标题 + 项目上下文 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Search size={24} />
          搜索文献
        </h1>
        <p className="text-gray-500 mt-1 text-sm">
          搜索 PubMed + Semantic Scholar + OpenAlex + bioRxiv
          {storedPapers.length > 0 && (
            <span className="ml-2 text-blue-600">
              · 已有 {storedPapers.length} 篇文献，
              {storedPapers.filter((p) => p.extractionStatus === "done").length} 篇已提取
            </span>
          )}
        </p>
      </div>

      {/* 搜索表单 */}
      {view === "search" && (
        <SearchForm onSearch={handleSearch} isLoading={isLoading} />
      )}

      {/* 错误提示 */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      {/* 提取进度（增强版） */}
      {view === "extracting" && (
        <div className="mt-8 bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 size={20} className="animate-spin text-blue-600" />
            <span className="font-medium text-sm">正在提取 {selectedPapers.length} 篇文献</span>
          </div>

          {/* 进度条 */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>{doneCount}/{extractionDetails.length} 篇完成</span>
              <span>{totalExperiments} 个实验</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${extractionDetails.length > 0 ? (doneCount / extractionDetails.length) * 100 : 0}%` }}
              />
            </div>
          </div>

          {/* 逐篇状态 */}
          <div className="space-y-2">
            {extractionDetails.map((d, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                {d.status === "done" ? (
                  <CheckCircle size={14} className="text-green-500 shrink-0" />
                ) : d.status === "error" ? (
                  <AlertCircle size={14} className="text-red-500 shrink-0" />
                ) : d.status === "running" ? (
                  <Loader2 size={14} className="animate-spin text-blue-500 shrink-0" />
                ) : (
                  <Clock size={14} className="text-gray-300 shrink-0" />
                )}
                <span className={`truncate ${d.status === "done" ? "text-gray-600" : d.status === "error" ? "text-red-500" : "text-gray-400"}`}>
                  {d.title.length > 60 ? d.title.slice(0, 60) + "..." : d.title}
                </span>
                {d.status === "done" && (
                  <span className="text-green-600 shrink-0 ml-auto">→ {d.experiments} 个实验</span>
                )}
                {d.status === "error" && (
                  <span className="text-red-400 shrink-0 ml-auto">{d.error || "失败"}</span>
                )}
              </div>
            ))}
          </div>

          <p className="text-xs text-gray-400">这可能需要 1-2 分钟，PDF 全文提取会更准确</p>
        </div>
      )}

      {/* 查询分析卡片（增强版） */}
      {results?.queryInfo && view === "search" && (
        <div className="mt-4 bg-white border border-gray-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowQueryDetails(!showQueryDetails)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-blue-600" />
              <span className="text-sm font-medium text-gray-700">搜索分析</span>
              <span className="text-xs text-gray-400">{results.queryInfo.intent}</span>
            </div>
            <div className="flex items-center gap-3">
              {isFromCache && (
                <span className="text-xs px-2 py-0.5 bg-amber-50 text-amber-600 rounded">缓存</span>
              )}
              <span className="text-xs text-gray-400">
                PubMed {results.sources.pubmed} · S2 {results.sources.semanticScholar} · OA {results.sources.openAlex}
              </span>
              {showQueryDetails ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
            </div>
          </button>

          {showQueryDetails && (
            <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
              {/* 搜索意图 */}
              <div>
                <span className="text-xs font-medium text-gray-500">搜索意图</span>
                <p className="text-sm text-gray-700 mt-0.5">{results.queryInfo.intent}</p>
              </div>

              {/* 优化查询 */}
              {results.queryInfo.optimized !== results.queryInfo.original && (
                <div>
                  <span className="text-xs font-medium text-gray-500">优化查询</span>
                  <code className="block text-xs bg-gray-50 px-2 py-1.5 rounded mt-1 text-gray-700 break-all">
                    {results.queryInfo.optimized}
                  </code>
                </div>
              )}

              {/* MeSH 术语 */}
              {results.queryInfo.meshTerms.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-gray-500">MeSH 术语</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {results.queryInfo.meshTerms.map((term) => (
                      <span key={term} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 优化建议 */}
              {results.queryInfo.refinements.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-gray-500">优化建议</span>
                  {results.queryInfo.refinements.map((ref, i) => (
                    <p key={i} className="text-xs text-blue-600 mt-0.5">{ref}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* 搜索结果 */}
      {results && view === "search" && (
        <div className="mt-4">
          <div className="text-xs text-gray-400 mb-3">
            合计 {results.total} 篇（已去重）
            {isFromCache && (
              <button
                onClick={() => {
                  const lastHistory = searchHistory[0];
                  if (lastHistory?.searchParams) {
                    handleSearch(lastHistory.query, lastHistory.searchParams as SearchOptions);
                  }
                }}
                className="ml-3 text-blue-500 hover:text-blue-700"
              >
                ↻ 刷新结果
              </button>
            )}
          </div>
          <SearchResults papers={results.papers} onSelect={handleSelect} projectId={projectId} />
        </div>
      )}

      {/* 提取结果审核（增强版） */}
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

          {/* 保存状态（内联） */}
          {Object.keys(saveStatus).length > 0 && (
            <div className="mt-2 text-xs text-gray-400 flex items-center gap-4">
              {Object.entries(saveStatus).filter(([, s]) => s === "saving").length > 0 && (
                <span className="text-blue-500">
                  {Object.values(saveStatus).filter((s) => s === "saving").length} 篇保存中...
                </span>
              )}
              {Object.entries(saveStatus).filter(([, s]) => s === "saved").length > 0 && (
                <span className="text-green-600">
                  {Object.values(saveStatus).filter((s) => s === "saved").length} 篇已保存
                </span>
              )}
              {Object.entries(saveStatus).filter(([, s]) => s === "error").length > 0 && (
                <span className="text-red-500">
                  {Object.values(saveStatus).filter((s) => s === "error").length} 篇保存失败
                </span>
              )}
            </div>
          )}

          <div className="mt-6 flex gap-3">
            <a
              href={`/project/${projectId}/brain`}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1.5"
            >
              <Brain size={16} />
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
        <div className="mt-8 space-y-4">
          {/* 搜索历史 */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
              <h2 className="text-sm font-medium text-gray-700">搜索历史 ({searchHistory.length})</h2>
              <div className="flex items-center gap-2">
                {searchHistory.length > 0 && (
                  <>
                    <input
                      type="text"
                      value={historySearchQuery}
                      onChange={(e) => setHistorySearchQuery(e.target.value)}
                      placeholder="搜索历史..."
                      className="w-32 px-2 py-1 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      onClick={handleClearHistory}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                    >
                      清空
                    </button>
                  </>
                )}
              </div>
            </div>

            {historyLoading ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">加载中...</div>
            ) : filteredHistory.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                {historySearchQuery ? "没有匹配的历史记录" : "暂无搜索记录"}
              </div>
            ) : (
              <>
                <ul className="divide-y divide-gray-100">
                  {displayedHistory.map((item) => (
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
                            {item.resultSnapshot && (
                              <span className="text-xs text-green-500 mt-0.5 inline-flex items-center gap-0.5">
                                <Zap size={10} /> 秒级回放
                              </span>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs text-gray-500">{item.resultCount} 篇</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(item.createdAt).toLocaleDateString("zh-CN", {
                                month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                              })}
                            </p>
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
                {filteredHistory.length > 5 && !showAllHistory && (
                  <button
                    onClick={() => setShowAllHistory(true)}
                    className="w-full text-center py-2 text-xs text-blue-600 hover:bg-blue-50 border-t border-gray-100"
                  >
                    显示全部 {filteredHistory.length} 条
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
