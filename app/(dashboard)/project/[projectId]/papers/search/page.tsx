"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { consumeSSEStream } from "@/lib/llm/sse-consumer";
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
  fastMode?: boolean;
  subQueries?: string[];
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

  // Ctrl+K keyboard shortcut to focus search input
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        const input = document.querySelector('input[data-search-input]') as HTMLInputElement | null
          || document.querySelector('input[placeholder*="研究"]') as HTMLInputElement | null;
        input?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const [view, setView] = useState<"search" | "extracting" | "review">("search");
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [extractionData, setExtractionData] = useState<ExtractionResult[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPapers, setSelectedPapers] = useState<Paper[]>([]);
  const [saveStatus, setSaveStatus] = useState<Record<string, "saving" | "saved" | "error">>({});
  const [isFromCache, setIsFromCache] = useState(false);
  const [cachedQuery, setCachedQuery] = useState<string | null>(null);
  const [cachedParams, setCachedParams] = useState<SearchOptions | null>(null);
  const [showQueryDetails, setShowQueryDetails] = useState(false);
  const [historySearchQuery, setHistorySearchQuery] = useState("");

  // Last search params for retry
  const [lastSearchQuery, setLastSearchQuery] = useState<string | null>(null);
  const [lastSearchOptions, setLastSearchOptions] = useState<SearchOptions | null>(null);

  // 搜索历史
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);

  // 引用网络发现
  const [citationNetworkResults, setCitationNetworkResults] = useState<{ total: number; papers: Paper[] } | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);

  // 提取进度详情
  const [extractionDetails, setExtractionDetails] = useState<Array<{
    title: string;
    status: "pending" | "running" | "done" | "error";
    experiments: number;
    error?: string;
  }>>([]);

  const abortControllerRef = useRef<AbortController | null>(null);

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
      setCachedQuery(item.query);
      setCachedParams(item.searchParams as SearchOptions | null);
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
        fastMode: false,
      });
    }
  }

  async function handleSearch(query: string, options: SearchOptions) {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    setResults(null);
    setIsFromCache(false);
    setCachedQuery(null);
    setCachedParams(null);
    setLastSearchQuery(query);
    setLastSearchOptions(options);
    setView("search");

    try {
      const res = await fetch("/api/papers/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, projectId, ...options }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text();
        try { throw new Error(JSON.parse(text).error || `HTTP ${res.status}`); }
        catch (e) { if (e instanceof SyntaxError) throw new Error(`HTTP ${res.status}: ${text.slice(0, 100)}`); else throw e; }
      }
      const data = await res.json();
      setResults(data);
      loadHistory();

      // Partial source failure notification — distinguish real failures from no-results
      const failedSources: string[] = [];
      const allSourcesZero = data.sources?.pubmed === 0 && data.sources?.semanticScholar === 0 && data.sources?.openAlex === 0;
      if (!allSourcesZero) {
        if (data.sources?.pubmed === 0 && data.total > 0) failedSources.push('PubMed');
        if (data.sources?.semanticScholar === 0 && data.total > 0) failedSources.push('Semantic Scholar');
        if (data.sources?.openAlex === 0 && data.total > 0) failedSources.push('OpenAlex');
      }
      if (failedSources.length > 0) {
        toast.warning(
          `${failedSources.join('、')} 暂时不可用`,
          { description: '显示的结果来自其他数据源，部分论文可能未收录' }
        );
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setIsLoading(false);
    }
  }

  function handleRefinementClick(refinement: string) {
    const lastParams = lastSearchOptions || searchHistory[0]?.searchParams as SearchOptions | undefined;
    handleSearch(refinement, lastParams || {
      maxResults: 20,
      minYear: null,
      maxYear: null,
      minCitationCount: null,
      sortBy: "relevance",
      articleTypes: ["journal-article", "review"],
      onlyOpenAccess: false,
      fastMode: false,
    });
  }

  async function handleDiscoverRelated(selectedKeys: Set<string>) {
    if (!results) return;
    const selectedPapersList = results.papers.filter((p) => {
      const key = p.doi || p.pmid || p.title;
      return selectedKeys.has(key);
    });

    // 收集 S2 IDs 和 DOI（DOI 作为 fallback）
    const paperIds = selectedPapersList
      .map((p) => p.s2Id)
      .filter((id): id is string => !!id);

    const dois = selectedPapersList
      .filter((p) => !p.s2Id && p.doi)
      .map((p) => p.doi!)
      .filter(Boolean);

    if (paperIds.length === 0 && dois.length === 0) {
      setError("选中的论文没有 S2 ID 或 DOI，无法查询引用网络。请尝试用英文关键词搜索。");
      return;
    }

    setIsDiscovering(true);
    setError(null);

    try {
      const res = await fetch("/api/papers/citation-network", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paperIds, dois, maxResults: 30 }),
      });
      if (!res.ok) throw new Error("引用网络查询失败");
      const data = await res.json();
      setCitationNetworkResults(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "引用网络查询失败");
    } finally {
      setIsDiscovering(false);
    }
  }

  async function handleSelect(papers: Paper[]) {
    // Extraction limit warning
    if (papers.length > 10) {
      const dropped = papers.length - 10;
      toast.warning(`每次最多提取 10 篇，将跳过最后 ${dropped} 篇`, {
        description: papers.slice(10, 13).map(p => p.title.slice(0, 40)).join("; ") + (dropped > 3 ? "..." : ""),
      });
    }
    const papersToExtract = papers.slice(0, 10);
    setSelectedPapers(papersToExtract);

    // 1. 保存论文到 DB（批量）
    const dbIdMap = new Map<string, string>();
    try {
      const res = await fetch(`/api/projects/${projectId}/papers/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          papers: papersToExtract.map((p) => ({
            title: p.title,
            doi: p.doi || null,
            pmid: p.pmid || null,
            authors: p.authors,
            journal: p.journal,
            year: p.year,
            abstract: p.abstract,
            source: p.sources?.[0] || "semantic_scholar",
            oaUrl: p.oaPdfUrl || null,
          })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // Map created papers by DOI
        for (const created of (data.papers || []) as Array<{ id: string; doi?: string | null; pmid?: string | null }>) {
          if (created.doi) dbIdMap.set(created.doi, created.id);
        }
        // Map skipped (existing) papers by DOI
        const skippedIds = (data.skippedPaperIds || {}) as Record<string, string>;
        for (const [doi, id] of Object.entries(skippedIds)) {
          dbIdMap.set(doi, id);
        }
      }
    } catch { /* fallback: papers will use searchId as paperId */ }

    // 1b. 加入 store
    const stored: StoredPaper[] = papersToExtract.map((p) => {
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
    setExtractionDetails(papersToExtract.map((p) => ({
      title: p.title, status: "pending" as const, experiments: 0,
    })));

    // 3. 触发提取
    try {
      const res = await fetch("/api/papers/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          papers: papersToExtract.map((p) => {
            const searchId = p.doi || p.pmid || p.title;
            return { paperId: dbIdMap.get(searchId) || searchId, title: p.title, abstract: p.abstract };
          }),
        }),
      });

      if (!res.ok) throw new Error("提取失败");

      // SSE 流式消费
      let results: unknown[] = [];
      await consumeSSEStream(res, {
        onProgress: (step, current, total) => {
          setExtractionDetails((prev) => prev.map((d, i) => {
            if (i < current) return { ...d, status: i === current - 1 ? "running" as const : d.status };
            return d;
          }));
        },
        onResult: (data) => {
          const d = data as { final?: boolean; results?: unknown[]; single?: unknown; completed?: number };
          if (d.single && d.completed !== undefined) {
            // 单篇完成，更新进度
            setExtractionDetails((prev) => prev.map((item, i) => {
              if (i === d.completed! - 1) {
                const single = d.single as { extraction?: { experiments?: unknown[] } };
                return { ...item, status: single.extraction ? "done" as const : "error" as const, experiments: single.extraction?.experiments?.length || 0 };
              }
              return item;
            }));
          }
          if (d.final) {
            results = d.results || [];
          }
        },
        onError: (msg) => {
          throw new Error(msg);
        },
      });

      setExtractionData(results as ExtractionResult[]);

      // 更新进度详情
      setExtractionDetails((prev) => prev.map((d, i) => {
        const result = (results as Array<{ extraction?: { experiments?: unknown[] }; error?: string }>)?.[i];
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
      for (const result of results as Array<{ paperId: string; extraction?: { experiments: import("@/lib/llm/extraction").ExperimentResult[] }; error?: string }>) {
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
    // 通知 Brain 页面有新的提取结果
    window.dispatchEvent(new CustomEvent("extraction-done", { detail: { projectId } }));
    localStorage.setItem(`extraction-done-${projectId}`, String(Date.now()));
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

      {/* 搜索表单（始终可见，搜索中禁用输入） */}
      <SearchForm onSearch={handleSearch} isLoading={isLoading} />

      {/* 错误提示 */}
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} />
            {error}
          </div>
          {lastSearchQuery && lastSearchOptions && (
            <button
              onClick={() => handleSearch(lastSearchQuery, lastSearchOptions)}
              className="shrink-0 px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
            >
              重试
            </button>
          )}
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
              {results.queryInfo.fastMode && (
                <span className="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded">⚡ 快速</span>
              )}
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

              {/* 子查询拆分 */}
              {results.queryInfo.subQueries && results.queryInfo.subQueries.length > 0 && (
                <div>
                  <span className="text-xs font-medium text-gray-500">🔍 拆分为 {results.queryInfo.subQueries.length} 个子查询</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {results.queryInfo.subQueries.map((label, i) => (
                      <span key={i} className="text-xs px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full border border-purple-200">
                        {i + 1}. {label}
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
            共 {results.total} 篇（已去重）
            {results.total > 20 && <span className="ml-1">· 显示前 20 篇，可通过筛选缩小范围</span>}
            {isFromCache && cachedQuery && (
              <button
                onClick={() => {
                  handleSearch(cachedQuery, cachedParams || {
                    maxResults: 20, minYear: null, maxYear: null, minCitationCount: null,
                    sortBy: "relevance", articleTypes: ["journal-article", "review"],
                    onlyOpenAccess: false, fastMode: false,
                  });
                }}
                className="ml-3 text-blue-500 hover:text-blue-700"
              >
                ↻ 刷新结果
              </button>
            )}
          </div>
          <SearchResults
            papers={results.papers}
            onSelect={handleSelect}
            projectId={projectId}
            refinements={results.queryInfo?.refinements}
            onRefinementClick={handleRefinementClick}
            onDiscoverRelated={handleDiscoverRelated}
            isDiscovering={isDiscovering}
          />
        </div>
      )}

      {/* 引用网络发现结果 */}
      {citationNetworkResults && view === "search" && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm text-gray-600">
              🔗 引用网络发现 — 从选中论文的引用关系中找到 {citationNetworkResults.total} 篇相关论文
            </div>
            <button
              onClick={() => setCitationNetworkResults(null)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              关闭
            </button>
          </div>
          <SearchResults
            papers={citationNetworkResults.papers}
            onSelect={handleSelect}
            projectId={projectId}
          />
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
