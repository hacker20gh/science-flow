"use client";

import { useState, useRef, useMemo, useEffect } from "react";
import { Download, Loader2, Check, Upload, ExternalLink, ChevronDown, ChevronUp, Search, Filter } from "lucide-react";
import { toast } from "sonner";

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  pubmed: { label: "PubMed", color: "bg-green-50 text-green-600" },
  semantic_scholar: { label: "S2", color: "bg-purple-50 text-purple-600" },
  openalex: { label: "OpenAlex", color: "bg-orange-50 text-orange-600" },
  biorxiv: { label: "bioRxiv", color: "bg-cyan-50 text-cyan-600" },
};

export interface Paper {
  pmid: string | null;
  doi: string | null;
  s2Id?: string | null;
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
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  refinements?: string[];
  onRefinementClick?: (refinement: string) => void;
  onDiscoverRelated?: (selectedKeys: Set<string>) => void;
  isDiscovering?: boolean;
  /** Enable client-side pagination (default: show all) */
  pageSize?: number;
}

export function SearchResults({ papers, onSelect, projectId, onLoadMore, hasMore, isLoadingMore, refinements, onRefinementClick, onDiscoverRelated, isDiscovering, pageSize }: SearchResultsProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  const [uploaded, setUploaded] = useState<Set<string>>(new Set());
  const [expandedAbstract, setExpandedAbstract] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingUploadPaper, setPendingUploadPaper] = useState<Paper | null>(null);

  // 客户端筛选状态
  const [showFilters, setShowFilters] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [filterSource, setFilterSource] = useState<string | null>(null);
  const [filterOaOnly, setFilterOaOnly] = useState(false);
  const [filterMinCitations, setFilterMinCitations] = useState<number>(0);
  const [filterMinYear, setFilterMinYear] = useState<string>("");
  const [filterMaxYear, setFilterMaxYear] = useState<string>("");
  const [filterJournal, setFilterJournal] = useState("");
  const [filterArticleType, setFilterArticleType] = useState<string | null>(null);

  // 快捷筛选预设
  const QUICK_FILTERS = [
    { label: "高引用 ≥100", action: () => { setFilterMinCitations(100); setShowFilters(true); } },
    { label: "近3年", action: () => { const y = new Date().getFullYear(); setFilterMinYear(String(y - 3)); setFilterMaxYear(""); setShowFilters(true); } },
    { label: "Q1 期刊", action: () => { setFilterJournal("Q1"); setShowFilters(true); } },
    { label: "仅 OA", action: () => { setFilterOaOnly(true); setShowFilters(true); } },
  ];

  // 文献类型选项
  const ARTICLE_TYPES = [
    { value: "研究论文", label: "研究论文" },
    { value: "综述", label: "综述" },
    { value: "Meta 分析", label: "Meta 分析" },
    { value: "系统综述", label: "系统综述" },
    { value: "临床试验", label: "临床试验" },
    { value: "RCT", label: "RCT" },
  ];

  // 客户端排序
  const [sortBy, setSortBy] = useState<"relevance" | "citation" | "date">("relevance");

  // 期刊指标
  const [journalMetrics, setJournalMetrics] = useState<Record<string, { impactFactor: number | null; jcrQuartile: string | null; casZone: string | null; isWarning: boolean }>>({});

  // 获取期刊指标
  useEffect(() => {
    const journals = [...new Set(papers.map(p => p.journal).filter(Boolean))];
    if (journals.length === 0) return;

    fetch("/api/journal-metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ journals }),
    })
      .then(r => r.json())
      .then(data => { if (data.metrics) setJournalMetrics(data.metrics); })
      .catch(() => {});
  }, [papers]);

  // 客户端分页
  const [currentPage, setCurrentPage] = useState(0);
  const PAGE_SIZE = pageSize ?? 20;

  // 客户端过滤
  useEffect(() => { setCurrentPage(0); setSelected(new Set()); }, [filterText, filterSource, filterOaOnly, filterMinCitations, sortBy, filterMinYear, filterMaxYear, filterJournal, filterArticleType]);

  const filteredPapers = useMemo(() => {
    const filtered = papers.filter((p) => {
      if (filterText) {
        const q = filterText.toLowerCase();
        const matchTitle = p.title.toLowerCase().includes(q);
        const matchAbstract = p.abstract?.toLowerCase().includes(q);
        const matchAuthors = p.authors?.some((a) => a.toLowerCase().includes(q));
        if (!matchTitle && !matchAbstract && !matchAuthors) return false;
      }
      if (filterSource && !p.sources?.includes(filterSource)) return false;
      if (filterOaOnly && !p.isOpenAccess) return false;
      if (filterMinCitations > 0 && (p.citationCount || 0) < filterMinCitations) return false;
      if (filterMinYear && p.year < parseInt(filterMinYear)) return false;
      if (filterMaxYear && p.year > parseInt(filterMaxYear)) return false;
      if (filterJournal) {
        const fq = filterJournal.toLowerCase();
        if (fq === "q1" || fq === "q2" || fq === "q3" || fq === "q4") {
          const m = journalMetrics[p.journal];
          if (!m || m.jcrQuartile?.toLowerCase() !== fq) return false;
        } else {
          if (!p.journal?.toLowerCase().includes(fq)) return false;
        }
      }
      if (filterArticleType && p.articleType !== filterArticleType) return false;
      return true;
    });

    // Apply client-side sort
    if (sortBy === "citation") {
      filtered.sort((a, b) => (b.citationCount || 0) - (a.citationCount || 0));
    } else if (sortBy === "date") {
      filtered.sort((a, b) => (b.year || 0) - (a.year || 0));
    }
    // "relevance" = keep original order

    return filtered;
  }, [papers, filterText, filterSource, filterOaOnly, filterMinCitations, sortBy, filterMinYear, filterMaxYear, filterJournal, filterArticleType, journalMetrics]);

  // Paginated papers
  const totalPages = Math.ceil(filteredPapers.length / PAGE_SIZE);
  const paginatedPapers = filteredPapers.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

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
    const allKeys = new Set(filteredPapers.map(paperKey));
    // If all are already selected, deselect all; otherwise select all
    const allSelected = filteredPapers.every(p => allKeys.has(paperKey(p)) && selected.has(paperKey(p)));
    setSelected(allSelected ? new Set() : allKeys);
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
      toast.error('PDF 下载失败，请稍后重试');
    } finally {
      setDownloading((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  function handleUploadClick(paper: Paper, e: React.MouseEvent) {
    e.stopPropagation();
    setPendingUploadPaper(paper);
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !pendingUploadPaper || !projectId) return;

    const key = paperKey(pendingUploadPaper);
    setUploading((prev) => new Set(prev).add(key));

    try {
      const formData = new FormData();
      formData.append("paperId", key);
      if (pendingUploadPaper.doi) formData.append("doi", pendingUploadPaper.doi);
      if (pendingUploadPaper.pmid) formData.append("pmid", pendingUploadPaper.pmid);
      formData.append("file", file);

      const res = await fetch(`/api/papers/upload-pdf`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        setUploaded((prev) => new Set(prev).add(key));
      }
    } catch {
      toast.error('PDF 上传失败，请稍后重试');
    } finally {
      setUploading((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      setPendingUploadPaper(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (papers.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg">📭 未找到相关文献</p>
        <p className="text-sm mt-2">尝试调整搜索关键词或筛选条件</p>
      </div>
    );
  }

  const activeFilterCount = [filterText, filterSource, filterOaOnly, filterMinCitations > 0, filterMinYear, filterMaxYear, filterJournal, filterArticleType].filter(Boolean).length;

  return (
    <div className="space-y-4">
      {/* 隐藏的文件选择器 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 搜索建议 pills */}
      {refinements && refinements.length > 0 && onRefinementClick && (
        <div className="flex flex-wrap gap-2">
          <span className="text-xs text-gray-500 self-center">💡 建议：</span>
          {refinements.map((ref, i) => (
            <button
              key={i}
              onClick={() => onRefinementClick(ref)}
              className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 transition-colors"
            >
              {ref}
            </button>
          ))}
        </div>
      )}

      {/* 筛选工具栏 */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
        {/* 第一行：搜索框 + 筛选按钮 + 排序 */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="在结果中筛选（标题、作者、摘要）..."
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs border rounded transition-colors ${
              showFilters || activeFilterCount > 0
                ? "bg-blue-50 border-blue-300 text-blue-700"
                : "border-gray-200 text-gray-600 hover:bg-gray-100"
            }`}
          >
            <Filter size={12} />
            筛选{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
          </button>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-xs border border-gray-200 rounded px-2 py-1.5 bg-white hover:bg-gray-50"
          >
            <option value="relevance">按相关性</option>
            <option value="citation">按引用量</option>
            <option value="date">按发表时间</option>
          </select>
        </div>

        {/* 快捷筛选按钮 */}
        {!showFilters && activeFilterCount === 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-400">快捷：</span>
            {QUICK_FILTERS.map((qf, i) => (
              <button
                key={i}
                onClick={qf.action}
                className="text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 transition-colors"
              >
                {qf.label}
              </button>
            ))}
          </div>
        )}

        {/* 激活的筛选条件 pills */}
        {activeFilterCount > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs text-gray-400">当前筛选：</span>
            {filterText && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                搜索: {filterText.length > 15 ? filterText.slice(0, 15) + "..." : filterText}
                <button onClick={() => setFilterText("")} className="hover:text-blue-900">×</button>
              </span>
            )}
            {filterSource && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                {SOURCE_LABELS[filterSource]?.label || filterSource}
                <button onClick={() => setFilterSource(null)} className="hover:text-purple-900">×</button>
              </span>
            )}
            {filterOaOnly && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                仅 OA
                <button onClick={() => setFilterOaOnly(false)} className="hover:text-green-900">×</button>
              </span>
            )}
            {filterMinCitations > 0 && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                引用 ≥{filterMinCitations}
                <button onClick={() => setFilterMinCitations(0)} className="hover:text-amber-900">×</button>
              </span>
            )}
            {filterMinYear && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-cyan-50 text-cyan-700 border border-cyan-200">
                {filterMinYear}{filterMaxYear ? `-${filterMaxYear}` : "至今"}
                <button onClick={() => { setFilterMinYear(""); setFilterMaxYear(""); }} className="hover:text-cyan-900">×</button>
              </span>
            )}
            {filterJournal && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                期刊: {filterJournal}
                <button onClick={() => setFilterJournal("")} className="hover:text-indigo-900">×</button>
              </span>
            )}
            {filterArticleType && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                {filterArticleType}
                <button onClick={() => setFilterArticleType(null)} className="hover:text-rose-900">×</button>
              </span>
            )}
            <button
              onClick={() => { setFilterText(""); setFilterSource(null); setFilterOaOnly(false); setFilterMinCitations(0); setFilterMinYear(""); setFilterMaxYear(""); setFilterJournal(""); setFilterArticleType(null); }}
              className="text-xs text-red-500 hover:text-red-700 ml-1"
            >
              清除全部
            </button>
          </div>
        )}

        {/* 展开的筛选面板 */}
        {showFilters && (
          <div className="pt-2 border-t border-gray-200 space-y-3">
            {/* 来源 + OA */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 font-medium">来源：</span>
                {Object.entries(SOURCE_LABELS).map(([key, info]) => (
                  <button
                    key={key}
                    onClick={() => setFilterSource(filterSource === key ? null : key)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      filterSource === key
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {info.label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={filterOaOnly} onChange={(e) => setFilterOaOnly(e.target.checked)} className="rounded w-3 h-3" />
                仅 OA
              </label>
            </div>

            {/* 引用 + 年份 */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 font-medium">引用：</span>
                <select value={filterMinCitations} onChange={(e) => setFilterMinCitations(Number(e.target.value))} className="text-xs border border-gray-200 rounded px-1.5 py-0.5">
                  <option value={0}>不限</option>
                  <option value={10}>≥10</option>
                  <option value={50}>≥50</option>
                  <option value={100}>≥100</option>
                </select>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 font-medium">年份：</span>
                <input type="number" value={filterMinYear} onChange={(e) => setFilterMinYear(e.target.value)} placeholder="起" min={1900} max={2030} className="w-14 text-xs border border-gray-200 rounded px-1.5 py-0.5" />
                <span className="text-xs text-gray-400">-</span>
                <input type="number" value={filterMaxYear} onChange={(e) => setFilterMaxYear(e.target.value)} placeholder="止" min={1900} max={2030} className="w-14 text-xs border border-gray-200 rounded px-1.5 py-0.5" />
              </div>
            </div>

            {/* 期刊 + 文献类型 */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 font-medium">期刊：</span>
                <input
                  type="text"
                  value={filterJournal === "Q1" || filterJournal === "Q2" || filterJournal === "Q3" || filterJournal === "Q4" ? "" : filterJournal}
                  onChange={(e) => setFilterJournal(e.target.value)}
                  placeholder="期刊名或 Q1-Q4"
                  className="w-36 text-xs border border-gray-200 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <div className="flex gap-0.5">
                  {["Q1", "Q2", "Q3", "Q4"].map((q) => (
                    <button
                      key={q}
                      onClick={() => setFilterJournal(filterJournal === q ? "" : q)}
                      className={`text-xs px-1.5 py-0.5 rounded border transition-colors ${
                        filterJournal === q
                          ? "bg-amber-50 border-amber-300 text-amber-700"
                          : "border-gray-200 text-gray-500 hover:border-gray-300"
                      }`}
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500 font-medium">类型：</span>
                {ARTICLE_TYPES.map((t) => (
                  <button
                    key={t.value}
                    onClick={() => setFilterArticleType(filterArticleType === t.value ? null : t.value)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      filterArticleType === t.value
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">
          找到 {papers.length} 篇文献
          {filteredPapers.length !== papers.length && ` (筛选后 ${filteredPapers.length} 篇)`}
          ，已选 {selected.size} 篇
        </div>
        <div className="flex gap-2">
          <button
            onClick={selectAll}
            className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
          >
            全选
          </button>
          {onDiscoverRelated && (
            <button
              onClick={() => onDiscoverRelated(selected)}
              disabled={selected.size === 0 || isDiscovering}
              className="px-3 py-1 text-sm border border-purple-300 text-purple-700 rounded hover:bg-purple-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {isDiscovering ? (
                <Loader2 size={12} className="animate-spin" />
              ) : null}
              🔗 发现相关论文
            </button>
          )}
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
        {paginatedPapers.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            筛选后无匹配结果，请调整筛选条件
          </div>
        ) : (
          paginatedPapers.map((paper) => {
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
                    <div className="mt-1">
                      <p className={`text-xs text-gray-400 ${expandedAbstract.has(key) ? "" : "line-clamp-2"}`}>
                        {paper.abstract}
                      </p>
                      {paper.abstract.length > 200 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedAbstract((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            });
                          }}
                          className="text-xs text-blue-500 hover:text-blue-700 mt-0.5 flex items-center gap-0.5"
                        >
                          {expandedAbstract.has(key) ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          {expandedAbstract.has(key) ? "收起" : "展开"}
                        </button>
                      )}
                    </div>
                  )}

                  {/* 标签栏 */}
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {/* 期刊指标 */}
                    {journalMetrics[paper.journal] && (
                      <>
                        {journalMetrics[paper.journal].jcrQuartile && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                            journalMetrics[paper.journal].jcrQuartile === "Q1"
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : journalMetrics[paper.journal].jcrQuartile === "Q2"
                                ? "bg-blue-50 text-blue-600 border border-blue-200"
                                : "bg-gray-100 text-gray-500 border border-gray-200"
                          }`}>
                            {journalMetrics[paper.journal].jcrQuartile}
                          </span>
                        )}
                        {journalMetrics[paper.journal].casZone && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            journalMetrics[paper.journal].casZone === "1区"
                              ? "bg-red-50 text-red-600"
                              : journalMetrics[paper.journal].casZone === "2区"
                                ? "bg-orange-50 text-orange-600"
                                : "bg-gray-100 text-gray-500"
                          }`}>
                            中科院{journalMetrics[paper.journal].casZone}
                          </span>
                        )}
                        {journalMetrics[paper.journal].impactFactor && journalMetrics[paper.journal].impactFactor! > 0 && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-purple-50 text-purple-600">
                            IF {journalMetrics[paper.journal].impactFactor}
                          </span>
                        )}
                        {journalMetrics[paper.journal].isWarning && (
                          <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium">
                            ⚠ 预警
                          </span>
                        )}
                      </>
                    )}

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
                      <div className="flex items-center gap-1">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
                          仅摘要
                        </span>
                        {projectId && (
                          <button
                            onClick={(e) => handleUploadClick(paper, e)}
                            disabled={uploading.has(paperKey(paper)) || uploaded.has(paperKey(paper))}
                            className="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 hover:bg-amber-100 disabled:opacity-50 flex items-center gap-1 transition-colors"
                          >
                            {uploading.has(paperKey(paper)) ? (
                              <Loader2 size={10} className="animate-spin" />
                            ) : uploaded.has(paperKey(paper)) ? (
                              <Check size={10} />
                            ) : (
                              <Upload size={10} />
                            )}
                            {uploaded.has(paperKey(paper)) ? "已上传" : "上传 PDF"}
                          </button>
                        )}
                      </div>
                    )}

                    {/* 来源标签（多源） */}
                    {paper.sources?.map((src) => {
                      const info = SOURCE_LABELS[src];
                      if (!info) return null;
                      return (
                        <span key={src} className={`text-xs px-1.5 py-0.5 rounded ${info.color}`}>
                          {info.label}
                        </span>
                      );
                    })}

                    {/* DOI 链接 */}
                    {paper.doi && (
                      <a
                        href={`https://doi.org/${paper.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 hover:text-blue-600 hover:bg-blue-50 flex items-center gap-0.5 transition-colors"
                      >
                        <ExternalLink size={10} />
                        DOI
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })
        )}
      </div>

      {/* 客户端分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0}
            className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← 上一页
          </button>
          <span className="text-xs text-gray-500">
            {currentPage + 1} / {totalPages} 页
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={currentPage >= totalPages - 1}
            className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            下一页 →
          </button>
        </div>
      )}

      {/* 加载更多 */}
      {hasMore && onLoadMore && (
        <div className="flex justify-center pt-2">
          <button
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className="px-6 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {isLoadingMore ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                加载中...
              </>
            ) : (
              "加载更多文献"
            )}
          </button>
        </div>
      )}
    </div>
  );
}

function paperKey(paper: Paper): string {
  return paper.doi || paper.pmid || `${paper.title}|${paper.authors?.[0] || ""}`;
}
