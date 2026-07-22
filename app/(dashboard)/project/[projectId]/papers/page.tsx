"use client";

import Link from "next/link";
import { useState, useEffect, useMemo, memo } from "react";
import { useParams } from "next/navigation";
import {
  Search, Upload, BookOpen, FileText, Check, ChevronDown, ChevronUp,
  ExternalLink, Trash2, RefreshCw, Loader2, Download, Filter, ArrowUpDown, X,
} from "lucide-react";
import { PapersSkeleton } from "@/components/skeletons";
import { useExtractionStore } from "@/stores/extraction-store";
import { consumeSSEStream } from "@/lib/llm/sse-consumer";
import { toast } from "sonner";
import { exportToBibtex, exportToRis, downloadFile } from "@/lib/export";
import { cachedFetch } from "@/lib/api-cache";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useProjectStore } from "@/store/project-store";
import ZoteroImport from "@/components/papers/zotero-import";
import SciteBadge from "@/components/papers/scite-badge";

interface Extraction {
  id: string;
  experiments: unknown;
  drugName?: string;
  pathway?: string;
  conclusion?: string;
  conclusionClaim?: string | null;
}

interface Paper {
  id: string;
  title: string;
  authors: string[];
  journal: string | null;
  year: number | null;
  abstract: string | null;
  doi: string | null;
  pmid: string | null;
  source: string | null;
  oaUrl: string | null;
  fullText: string | null;
  articleType: string | null;
  createdAt: string;
  extractions: Extraction[];
}

type FilterType = "all" | "extracted" | "unextracted" | "oa" | "abstract_only";
type SortType = "date_desc" | "date_asc" | "year_desc" | "year_asc";
type GroupType = "none" | "source" | "status";

const SOURCE_LABELS: Record<string, string> = {
  pubmed: "PubMed",
  semantic_scholar: "Semantic Scholar",
  openalex: "OpenAlex",
  local_upload: "本地上传",
  biorxiv: "bioRxiv",
};

export default function PapersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { removePaper } = useProjectStore();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortType>("date_desc");
  const [group, setGroup] = useState<GroupType>("none");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);
  const [extractProgress, setExtractProgress] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'single' | 'batch'; id?: string } | null>(null);
  const [showZoteroImport, setShowZoteroImport] = useState(false);
  const [dismissedUnextracted, setDismissedUnextracted] = useState(false);

  // 期刊指标
  const [journalMetrics, setJournalMetrics] = useState<Record<string, { impactFactor: number | null; jcrQuartile: string | null; casZone: string | null; isWarning: boolean }>>({});

  useEffect(() => {
    cachedFetch<{ papers: Paper[] }>(`/api/projects/${projectId}/papers`)
      .then((d) => setPapers(d.papers || []))
      .catch(() => setPapers([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  // 获取期刊指标（IF、分区等）
  useEffect(() => {
    const journals = [...new Set(papers.map(p => p.journal).filter(Boolean))] as string[];
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

  // 请求浏览器通知权限
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // 统计
  const stats = useMemo(() => {
    const extracted = papers.filter((p) => p.extractions.length > 0);
    const withAbstract = papers.filter((p) => p.abstract);
    return {
      total: papers.length,
      extracted: extracted.length,
      unextracted: papers.length - extracted.length,
      withAbstract: withAbstract.length,
      withFullText: papers.filter((p) => p.fullText).length,
    };
  }, [papers]);

  // 未提取论文数（用于提示条）
  const unextractedCount = useMemo(
    () => papers.filter((p) => p.extractions.length === 0).length,
    [papers]
  );

  // 筛选 + 搜索 + 排序
  const filteredPapers = useMemo(() => {
    let result = papers;

    // 搜索
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.authors.join(" ").toLowerCase().includes(q) ||
          (p.journal || "").toLowerCase().includes(q)
      );
    }

    // 筛选
    switch (filter) {
      case "extracted":
        result = result.filter((p) => p.extractions.length > 0);
        break;
      case "unextracted":
        result = result.filter((p) => p.extractions.length === 0);
        break;
      case "oa":
        result = result.filter((p) => p.oaUrl || p.fullText);
        break;
      case "abstract_only":
        result = result.filter((p) => !p.oaUrl && !p.fullText);
        break;
    }

    // 排序
    switch (sort) {
      case "date_desc":
        result = [...result].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        break;
      case "date_asc":
        result = [...result].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        break;
      case "year_desc":
        result = [...result].sort((a, b) => (b.year || 0) - (a.year || 0));
        break;
      case "year_asc":
        result = [...result].sort((a, b) => (a.year || 0) - (b.year || 0));
        break;
    }

    return result;
  }, [papers, searchQuery, filter, sort]);

  // 分组
  const groupedPapers = useMemo(() => {
    if (group === "none") return { "全部文献": filteredPapers };

    const groups: Record<string, Paper[]> = {};
    for (const paper of filteredPapers) {
      let key: string;
      if (group === "source") {
        key = SOURCE_LABELS[paper.source || ""] || paper.source || "未知";
      } else {
        key = paper.extractions.length > 0 ? "已提取" : "未提取";
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(paper);
    }
    return groups;
  }, [filteredPapers, group]);

  // 批量操作
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(filteredPapers.map((p) => p.id)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function exportSelectedBibtex() {
    const selectedPapers = papers.filter((p) => selected.has(p.id));
    if (selectedPapers.length === 0) return;
    const bibtex = exportToBibtex(selectedPapers);
    downloadFile(bibtex, "references.bib", "application/x-bibtex");
    toast.success(`已导出 ${selectedPapers.length} 篇文献的 BibTeX`);
  }

  function exportAllBibtex() {
    if (filteredPapers.length === 0) return;
    const bibtex = exportToBibtex(filteredPapers);
    downloadFile(bibtex, "references.bib", "application/x-bibtex");
    toast.success(`已导出 ${filteredPapers.length} 篇文献的 BibTeX`);
  }

  function exportSelectedRis() {
    const selectedPapers = papers.filter((p) => selected.has(p.id));
    if (selectedPapers.length === 0) return;
    const ris = exportToRis(selectedPapers);
    downloadFile(ris, "references.ris", "application/x-research-info-systems");
    toast.success(`已导出 ${selectedPapers.length} 篇文献的 RIS`);
  }

  async function batchExtract() {
    const selectedPapers = papers.filter((p) => selected.has(p.id));
    if (selectedPapers.length === 0) return;

    setBatchLoading(true);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < selectedPapers.length; i++) {
      const paper = selectedPapers[i];
      setExtractProgress(`正在提取 ${i + 1}/${selectedPapers.length}：${paper.title.slice(0, 40)}...`);

      try {
        const res = await fetch("/api/papers/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            papers: [{ paperId: paper.id, title: paper.title, abstract: paper.abstract, fullText: paper.fullText || undefined }],
          }),
        });

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        let hasResult = false;
        await consumeSSEStream(res, {
          onProgress: () => {},
          onResult: (data) => {
            const d = data as { final?: boolean; results?: Array<{ extraction?: { experiments?: unknown[]; conclusions?: Array<{ evidenceChain: unknown[] }> }; error?: string }>; summary?: { success?: number } };
            if (d.final) {
              const first = d.results?.[0];
              const experiments = first?.extraction?.experiments
                || first?.extraction?.conclusions?.flatMap((c) => c.evidenceChain)
                || [];
              if (experiments.length > 0 || (d.summary?.success && d.summary.success > 0)) {
                hasResult = true;
              }
            }
          },
          onError: () => {},
        });

        if (hasResult) {
          successCount++;
          // Update this paper's status in local state
          const refreshRes = await fetch(`/api/projects/${projectId}/papers`);
          if (refreshRes.ok) {
            const d = await refreshRes.json();
            setPapers(d.papers || []);
          }
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    clearSelection();
    setBatchLoading(false);
    setExtractProgress("");

    toast.success("批量提取完成", {
      description: `成功 ${successCount} 篇${errorCount > 0 ? `，失败 ${errorCount} 篇` : ""}（共 ${selectedPapers.length} 篇）`,
    });
    // 浏览器通知（页面不可见时）
    if (document.hidden && "Notification" in window && Notification.permission === "granted") {
      const body = `成功 ${successCount} 篇${errorCount > 0 ? `，失败 ${errorCount} 篇` : ""}（共 ${selectedPapers.length} 篇）`;
      new Notification("SciFlow 批量提取完成", { body });
    }
  }

  async function performBatchDelete() {
    setBatchLoading(true);
    try {
      await Promise.all(
        [...selected].map((id) =>
          fetch(`/api/projects/${projectId}/papers?id=${id}`, { method: "DELETE" })
        )
      );
      [...selected].forEach((id) => removePaper(id));
      setPapers((prev) => prev.filter((p) => !selected.has(p.id)));
      clearSelection();
    } catch {
      toast.error("批量删除失败", { description: "请稍后重试" });
    } finally {
      setBatchLoading(false);
    }
  }

  function batchDelete() {
    setDeleteConfirm({ type: 'batch' });
  }

  async function performDelete(paperId: string) {
    try {
      await fetch(`/api/projects/${projectId}/papers?id=${paperId}`, { method: "DELETE" });
      setPapers((prev) => prev.filter((p) => p.id !== paperId));
      removePaper(paperId);
    } catch {
      toast.error("删除失败", { description: "请稍后重试" });
    }
  }

  function handleDelete(paperId: string) {
    setDeleteConfirm({ type: 'single', id: paperId });
  }

  const filterOptions: { key: FilterType; label: string; count: number }[] = [
    { key: "all", label: "全部", count: papers.length },
    { key: "extracted", label: "已提取", count: stats.extracted },
    { key: "unextracted", label: "未提取", count: stats.unextracted },
    { key: "oa", label: "有全文", count: papers.filter((p) => p.oaUrl || p.fullText).length },
  ];

  return (
    <main className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen size={24} />
            文献管理
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <DoiQuickImport projectId={projectId as string} onImported={() => {
            fetch(`/api/projects/${projectId}/papers`).then((r) => r.json()).then((d) => setPapers(d.papers || [])).catch(() => {});
          }} />
          <button
            onClick={() => setShowZoteroImport(true)}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-all text-sm font-medium flex items-center gap-2"
          >
            📥 从 Zotero 导入
          </button>
          <Link
            href={`/project/${projectId}/papers/search`}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all text-sm font-medium flex items-center gap-2"
          >
            <Search size={16} />
            搜索文献
          </Link>
        </div>
      </div>

      {/* 统计概览 */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-gray-800">{stats.total}</div>
          <div className="text-xs text-gray-500">总文献</div>
        </div>
        <div className="bg-white border border-green-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{stats.extracted}</div>
          <div className="text-xs text-gray-500">已提取</div>
        </div>
        <div className="bg-white border border-blue-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.withAbstract}</div>
          <div className="text-xs text-gray-500">有摘要</div>
        </div>
        <div className="bg-white border border-purple-200 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-purple-600">{stats.withFullText}</div>
          <div className="text-xs text-gray-500">有全文</div>
        </div>
      </div>

      {/* 搜索 + 筛选 + 排序 + 分组 */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4 space-y-3">
        {/* 搜索框 */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索标题、作者、期刊..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* 筛选 + 排序 + 分组 */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <Filter size={14} className="text-gray-400" />
            {filterOptions.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setFilter(opt.key)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  filter === opt.key
                    ? "bg-blue-50 border-blue-300 text-blue-700 font-medium"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {opt.label} ({opt.count})
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 ml-auto">
            <ArrowUpDown size={14} className="text-gray-400" />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortType)}
              className="text-xs border border-gray-200 rounded px-2 py-1"
            >
              <option value="date_desc">添加时间 ↓</option>
              <option value="date_asc">添加时间 ↑</option>
              <option value="year_desc">发表年份 ↓</option>
              <option value="year_asc">发表年份 ↑</option>
            </select>

            <select
              value={group}
              onChange={(e) => setGroup(e.target.value as GroupType)}
              className="text-xs border border-gray-200 rounded px-2 py-1"
            >
              <option value="none">不分组</option>
              <option value="source">按来源分组</option>
              <option value="status">按状态分组</option>
            </select>
          </div>
        </div>
      </div>

      {/* 批量操作栏 */}
      {selected.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-center gap-3">
          <span className="text-sm text-blue-700 font-medium">已选 {selected.size} 篇</span>
          <button
            onClick={batchExtract}
            disabled={batchLoading}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
          >
            {batchLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            批量提取
          </button>
          {extractProgress && (
            <span className="text-xs text-blue-600 animate-pulse">{extractProgress}</span>
          )}
          <button
            onClick={batchDelete}
            disabled={batchLoading}
            className="px-3 py-1.5 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50 disabled:opacity-50 flex items-center gap-1"
          >
            <Trash2 size={12} />
            批量删除
          </button>
          <button onClick={selectAll} className="px-3 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">全选</button>
          <button onClick={clearSelection} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">取消</button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={exportSelectedBibtex}
              className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50 flex items-center gap-1"
            >
              <Download size={12} />
              导出 BibTeX
            </button>
            <button
              onClick={exportSelectedRis}
              className="px-3 py-1.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50 flex items-center gap-1"
            >
              <Download size={12} />
              导出 RIS
            </button>
          </div>
        </div>
      )}

      {/* 未提取论文提示条 */}
      {!loading && unextractedCount > 0 && !dismissedUnextracted && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4 flex items-center justify-between">
          <span className="text-sm text-blue-700">
            💡 还有 {unextractedCount} 篇论文未提取，建议继续提取以完善机制矩阵
          </span>
          <button
            onClick={() => setDismissedUnextracted(true)}
            className="p-1 text-blue-400 hover:text-blue-600 rounded"
            aria-label="关闭提示"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 加载 / 空状态 */}
      {loading && (
        <div className="p-8"><PapersSkeleton /></div>
      )}

      {!loading && papers.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <BookOpen size={48} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">还没有添加文献</p>
          <Link href={`/project/${projectId}/papers/search`} className="text-blue-600 text-sm mt-2 inline-block hover:underline">
            去搜索文献 →
          </Link>
        </div>
      )}

      {/* 分组视图 */}
      {!loading && papers.length > 0 && (
        <div className="space-y-6">
          {Object.entries(groupedPapers).map(([groupName, groupPapers]) => (
            <div key={groupName}>
              {group !== "none" && (
                <h2 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-2">
                  {groupName}
                  <span className="text-xs font-normal text-gray-400">({groupPapers.length})</span>
                </h2>
              )}
              <div className="space-y-2">
                {groupPapers.map((paper) => (
                  <PaperCard
                    key={paper.id}
                    paper={paper}
                    expanded={expandedId === paper.id}
                    onToggle={() => setExpandedId(expandedId === paper.id ? null : paper.id)}
                    selected={selected.has(paper.id)}
                    onSelect={() => toggleSelect(paper.id)}
                    onDelete={() => handleDelete(paper.id)}
                    projectId={projectId}
                    onExtractionDone={setPapers}
                    journalMetrics={journalMetrics}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 底部操作 */}
      {!loading && papers.length > 0 && selected.size === 0 && (
        <div className="mt-6 flex justify-center items-center gap-4">
          <button
            onClick={selectAll}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            全选 {filteredPapers.length} 篇文献
          </button>
          <span className="text-gray-300">|</span>
          <button
            onClick={exportAllBibtex}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <Download size={14} />
            导出全部 BibTeX
          </button>
        </div>
      )}

      {/* 删除确认对话框 */}
      {deleteConfirm && (
        <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {deleteConfirm.type === 'batch'
                  ? `确定删除 ${selected.size} 篇文献？`
                  : "确定删除这篇文献？"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                此操作不可撤销，相关的提取数据也将被删除。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteConfirm(null)}>取消</AlertDialogCancel>
              <AlertDialogAction onClick={() => {
                if (deleteConfirm.type === 'batch') {
                  performBatchDelete();
                } else if (deleteConfirm.id) {
                  performDelete(deleteConfirm.id);
                }
                setDeleteConfirm(null);
              }}>确定删除</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {showZoteroImport && (
        <ZoteroImport
          projectId={projectId as string}
          onClose={() => setShowZoteroImport(false)}
          onImported={() => {
            setShowZoteroImport(false);
            // 重新加载论文列表
            fetch(`/api/projects/${projectId}/papers`)
              .then((r) => r.json())
              .then((d) => setPapers(d.papers || []))
              .catch(() => {});
          }}
        />
      )}
    </main>
  );
}

// ===== DOI 快速导入 =====

function DoiQuickImport({ projectId, onImported }: { projectId: string; onImported: () => void }) {
  const [doi, setDoi] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    const cleanDoi = doi.trim().replace(/^https?:\/\/doi\.org\//i, "").replace(/^doi:/i, "");
    if (!cleanDoi) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Crossref 解析
      const resp = await fetch(`/api/crossref?doi=${encodeURIComponent(cleanDoi)}`);
      const data = await resp.json();
      if (!data.metadata) {
        setError("未找到该 DOI");
        return;
      }

      // 2. 保存到项目
      const m = data.metadata;
      const authors = m.authors.map((a: { family?: string; given?: string; name?: string }) =>
        a.name || [a.family, a.given].filter(Boolean).join(", ")
      );

      const saveResp = await fetch(`/api/projects/${projectId}/papers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: m.title,
          authors,
          doi: m.doi,
          journal: m.journal,
          year: m.year,
          abstract: m.abstract,
          oaUrl: m.url,
          source: "crossref",
        }),
      });

      if (saveResp.ok) {
        setDoi("");
        onImported();
        toast.success("文献已添加");
      } else {
        const err = await saveResp.json();
        setError(err.error || "保存失败");
      }
    } catch (err) {
      setError((err as Error)?.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={doi}
          onChange={(e) => { setDoi(e.target.value); setError(null); }}
          onKeyDown={(e) => e.key === "Enter" && handleImport()}
          placeholder="输入 DOI 快速导入..."
          className="w-48 px-3 py-2 border border-gray-300 rounded-lg text-xs focus:outline-none focus:border-blue-400"
          disabled={loading}
        />
        {loading && <Loader2 size={14} className="text-blue-500 animate-spin" />}
      </div>
      {error && (
        <div className="absolute top-full left-0 mt-1 text-[10px] text-red-500 bg-white px-2 py-1 rounded shadow-sm border">
          {error}
        </div>
      )}
    </div>
  );
}

// ===== 论文卡片组件 =====

const PaperCard = memo(function PaperCard({
  paper, expanded, onToggle, selected, onSelect, onDelete, projectId, onExtractionDone, onExtractionNotify, journalMetrics,
}: {
  paper: Paper;
  expanded: boolean;
  onToggle: () => void;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  projectId: string;
  onExtractionDone: React.Dispatch<React.SetStateAction<Paper[]>>;
  onExtractionNotify?: (title: string, body: string, isError?: boolean) => void;
  journalMetrics?: Record<string, { impactFactor: number | null; jcrQuartile: string | null; casZone: string | null; isWarning: boolean }>;
}) {
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractProgress, setExtractProgress] = useState<string | null>(null);
  const { updatePaperExtraction } = useProjectStore();
  const extractionStore = useExtractionStore();

  async function handleExtract() {
    setExtracting(true);
    extractionStore.startExtraction([{ paperId: paper.id, title: paper.title }]);
    extractionStore.updateProgress(paper.id, { status: "extracting", step: "准备提取..." });
    try {
      const res = await fetch("/api/papers/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          papers: [{ paperId: paper.id, title: paper.title, abstract: paper.abstract, fullText: paper.fullText || undefined }],
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: "未知错误" }));
        throw new Error(errBody.error || `HTTP ${res.status}`);
      }

      let exps: import("@/lib/llm/extraction").ExperimentResult[] = [];
      let extractionError: string | null = null;
      let rawExtraction: Record<string, unknown> | null = null;
      await consumeSSEStream(res, {
        onProgress: (step, current, total) => {
          setExtractProgress(`${step} (${current}/${total})`);
          extractionStore.updateProgress(paper.id, { step, current, total });
        },
        onResult: (data) => {
          const d = data as { final?: boolean; results?: Array<{ extraction?: { experiments?: import("@/lib/llm/extraction").ExperimentResult[]; conclusions?: Array<{ claim?: string; evidenceChain: import("@/lib/llm/extraction").ExperimentResult[] }> }; error?: string; title?: string }> };
          if (d.final && d.results?.[0]) {
            const first = d.results[0];
            rawExtraction = (first.extraction || null) as Record<string, unknown> | null;
            // 兼容两种格式
            const experiments = first.extraction?.experiments
              || first.extraction?.conclusions?.flatMap(c => c.evidenceChain)
              || [];
            if (experiments.length > 0) {
              exps = experiments;
            } else if (first.error) {
              extractionError = first.error;
            } else {
              extractionError = "未提取到实验数据";
            }
          }
        },
        onError: (msg) => {
          extractionError = msg;
        },
      });

      if (exps.length === 0) {
        const reason = extractionError || "未提取到实验数据";
        setExtractError(reason);
        setExtractProgress(null);
        extractionStore.markError(paper.id, reason);
        toast.error("提取失败", { description: reason, duration: 8000 });
      } else {
        setExtractError(null);
        setExtractProgress(null);
        extractionStore.updateProgress(paper.id, { status: "saving" });
        // 保存提取结果到 DB
        try {
          const saveRes = await fetch(`/api/projects/${projectId}/extractions/batch`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paperId: paper.id, extractions: exps }),
          });
          if (!saveRes.ok) {
            console.error("Failed to save extractions:", await saveRes.text());
          }
        } catch (saveErr) {
          console.error("Failed to save extractions:", saveErr);
        }
        // 计算提取质量指标
        const extData = rawExtraction as Record<string, unknown> | null;
        const conclusions = extData?.conclusions as Array<{ claim?: string; evidenceChain: Record<string, unknown>[] }> | undefined;
        let qualitySummary = `提取到 ${exps.length} 个实验数据`;
        if (conclusions && conclusions.length > 0) {
          const conclusionCount = conclusions.length;
          const completeCount = conclusions.filter(c =>
            c.evidenceChain.some(e => e.role === "main")
          ).length;
          const completeness = Math.round((completeCount / conclusionCount) * 100);
          qualitySummary = `提取完成：${exps.length} 个实验 | ${conclusionCount} 个结论 | 证据链完整度 ${completeness}%`;
        }
        extractionStore.markDone(paper.id, { experiments: exps.length, conclusions: conclusions?.length || 0 });
        toast.success("提取完成", {
          description: qualitySummary,
          action: {
            label: "查看结果",
            onClick: () => { window.location.href = `/project/${projectId}/brain`; },
          },
          duration: 10000,
        });
        // 通知 Brain 页面有新的提取结果
        window.dispatchEvent(new CustomEvent("extraction-done", { detail: { projectId } }));
        localStorage.setItem(`extraction-done-${projectId}`, String(Date.now()));
        // 浏览器通知（页面不可见时）
        if (document.hidden && "Notification" in window && Notification.permission === "granted") {
          new Notification("SciFlow 提取完成", {
            body: `提取到 ${exps.length} 个实验 — ${paper.title}`,
          });
        }
        const updatedRes = await fetch(`/api/projects/${projectId}/papers`);
        if (updatedRes.ok) {
          const updatedData = await updatedRes.json();
          onExtractionDone(updatedData.papers);
          updatePaperExtraction(paper.id, "done", exps);
          // 提示还有未提取的论文
          const remaining = (updatedData.papers as Paper[]).filter((p: Paper) => p.extractions.length === 0).length;
          if (remaining > 0) {
            toast.info(`还有 ${remaining} 篇论文未提取`, {
              description: "继续提取以完善机制矩阵",
              duration: 6000,
            });
          }
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "未知错误";
      setExtractError(msg);
      setExtractProgress(null);
      extractionStore.markError(paper.id, msg);
      toast.error("提取失败", { description: msg, duration: 8000 });
      // 浏览器通知（页面不可见时）
      if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        new Notification("SciFlow 提取失败", { body: msg });
      }
    } finally {
      setExtracting(false);
    }
  }

  return (
    <div
      className={`bg-white border rounded-xl transition-all ${
        selected ? "border-blue-400 ring-1 ring-blue-200" : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {/* 主行 */}
      <div className="flex items-start gap-3 p-4">
        <input
          type="checkbox"
          checked={selected}
          onChange={onSelect}
          onClick={(e) => e.stopPropagation()}
          className="mt-1 shrink-0"
        />

        <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
          <Link
            href={`/project/${projectId}/papers/${paper.id}`}
            className="font-medium text-sm leading-snug hover:text-blue-600 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {paper.title}
          </Link>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-500">
            {paper.authors.length > 0 && (
              <span>{paper.authors.slice(0, 3).join(", ")}{paper.authors.length > 3 ? " et al." : ""}</span>
            )}
            {paper.journal && <span className="text-gray-400">{paper.journal}</span>}
            {paper.year && <span className="text-gray-400">({paper.year})</span>}
          </div>

          {/* 标签 */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {paper.source && (
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                paper.source === "local_upload" ? "bg-purple-50 text-purple-600" : "bg-gray-100 text-gray-500"
              }`}>
                {SOURCE_LABELS[paper.source] || paper.source}
              </span>
            )}
            {/* 期刊指标（IF、分区、预警） */}
            {paper.journal && journalMetrics?.[paper.journal] && (
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
            {/* 文献类型 */}
            {paper.articleType && (
              <span className="text-xs px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded">
                {paper.articleType}
              </span>
            )}
            {paper.extractions.length > 0 && (
              <>
                <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-600 rounded flex items-center gap-0.5">
                  <Check size={10} /> {paper.extractions.length} 条提取
                </span>
                <Link
                  href={`/project/${projectId}/brain`}
                  className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded hover:bg-purple-100 transition-colors"
                >
                  📊 查看知识面板
                </Link>
              </>
            )}
            {paper.extractions.length === 0 && (
              <span className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded">未提取</span>
            )}
            {(paper.oaUrl || paper.fullText) && (
              <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded">
                {paper.fullText ? "📄 全文" : "🟢 OA"}
              </span>
            )}
          </div>

          {/* 结论摘要 */}
          {paper.extractions.length > 0 && (() => {
            const claims = [...new Set(
              paper.extractions
                .map((e) => e.conclusionClaim)
                .filter((c): c is string => !!c && c.trim().length > 0)
            )];
            if (claims.length === 0) return null;
            return (
              <div className="mt-1.5 space-y-0.5">
                {claims.slice(0, 2).map((claim, idx) => (
                  <div key={idx} className="text-xs text-blue-600 truncate">
                    💡 {claim}
                  </div>
                ))}
                {claims.length > 2 && (
                  <div className="text-xs text-gray-400">+{claims.length - 2} 个结论</div>
                )}
              </div>
            );
          })()}
        </div>

        <button
          onClick={onToggle}
          className="shrink-0 p-1 text-gray-400 hover:text-gray-600"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* 展开详情 */}
      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 space-y-3 text-xs">
          {/* 摘要 */}
          {paper.abstract && (
            <div>
              <span className="font-medium text-gray-600">摘要：</span>
              <p className="text-gray-500 mt-1 leading-relaxed">{paper.abstract}</p>
            </div>
          )}

          {/* 提取结果预览 */}
          {paper.extractions.length > 0 && (
            <div>
              <span className="font-medium text-gray-600">提取结果 ({paper.extractions.length} 条)：</span>
              <div className="mt-1 space-y-1">
                {paper.extractions.slice(0, 5).map((ext) => (
                  <div key={ext.id} className="flex items-start gap-2 text-gray-500">
                    <span className="text-blue-500">•</span>
                    <span className="truncate">
                      {ext.drugName || ext.pathway || ext.conclusion || "提取记录"}
                    </span>
                  </div>
                ))}
                {paper.extractions.length > 5 && (
                  <span className="text-gray-400">还有 {paper.extractions.length - 5} 条...</span>
                )}
              </div>
            </div>
          )}

          {/* 链接 */}
          <div className="flex items-center gap-3 text-gray-400">
            {paper.doi && (
              <a
                href={`https://doi.org/${paper.doi}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 hover:text-blue-600"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={10} /> DOI
              </a>
            )}
            <SciteBadge doi={paper.doi || undefined} />
            {paper.pmid && (
              <a
                href={`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 hover:text-blue-600"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink size={10} /> PubMed
              </a>
            )}
            {paper.oaUrl && (
              <a
                href={paper.oaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-0.5 hover:text-blue-600"
                onClick={(e) => e.stopPropagation()}
              >
                <Download size={10} /> 全文
              </a>
            )}
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => { setExtractError(null); setExtractProgress(null); handleExtract(); }}
              disabled={extracting}
              className={`px-3 py-1.5 text-xs rounded disabled:opacity-50 flex items-center gap-1 ${
                extractError
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {extracting ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              {extracting ? "提取中..." : paper.extractions.length > 0 ? "重新提取" : "提取信息"}
            </button>
            <button
              onClick={onDelete}
              className="px-3 py-1.5 text-xs border border-red-200 text-red-500 rounded hover:bg-red-50 flex items-center gap-1"
            >
              <Trash2 size={12} />
              删除
            </button>
          </div>

          {/* 提取进度 */}
          {extracting && extractProgress && (
            <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-center gap-2">
              <Loader2 size={12} className="animate-spin shrink-0" />
              <span className="truncate">{extractProgress}</span>
            </div>
          )}

          {/* 提取失败信息 */}
          {extractError && !extracting && (
            <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-start gap-2">
              <span className="shrink-0">❌</span>
              <span className="flex-1">提取失败：{extractError}</span>
              <button
                onClick={() => { setExtractError(null); handleExtract(); }}
                className="shrink-0 px-2 py-0.5 bg-red-100 text-red-700 rounded hover:bg-red-200"
              >
                重试
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});
