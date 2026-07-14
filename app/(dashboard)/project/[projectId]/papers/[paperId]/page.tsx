"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, ExternalLink, FileText, Database, ChevronDown, ChevronUp,
  Pencil, Save, X, Download,
} from "lucide-react";
import { toast } from "sonner";

interface Extraction {
  id: string;
  drugName?: string | null;
  drugConc?: string | null;
  cellLine?: string | null;
  pathway?: string | null;
  pathwayDir?: string | null;
  phenotype?: string | null;
  phenotypeDir?: string | null;
  method?: string | null;
  conclusion?: string | null;
  rawText?: string | null;
  expMethod?: string | null;
  sampleSize?: number | null;
  confidence?: number | null;
  verified?: boolean;
}

interface Paper {
  id: string;
  title: string;
  authors: string[];
  journal: string | null;
  year: number | null;
  abstract: string | null;
  fullText: string | null;
  doi: string | null;
  pmid: string | null;
  source: string | null;
  oaUrl: string | null;
  impactFactor: number | null;
  createdAt: string;
  extractions: Extraction[];
}

async function exportPaperPdf(paper: Paper) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  let y = 20;

  // Title
  doc.setFontSize(16);
  const titleLines = doc.splitTextToSize(paper.title, 170);
  doc.text(titleLines, 20, y);
  y += titleLines.length * 8 + 5;

  // Authors
  if (paper.authors.length > 0) {
    doc.setFontSize(10);
    const authorLines = doc.splitTextToSize(paper.authors.join(", "), 170);
    doc.text(authorLines, 20, y);
    y += authorLines.length * 5 + 3;
  }

  // Journal, Year
  doc.setFontSize(10);
  doc.text(`${paper.journal || "Unknown"} (${paper.year || "n.d."})`, 20, y);
  y += 8;

  // DOI
  if (paper.doi) {
    doc.text(`DOI: ${paper.doi}`, 20, y);
    y += 8;
  }

  // Impact Factor
  if (paper.impactFactor) {
    doc.text(`Impact Factor: ${paper.impactFactor}`, 20, y);
    y += 8;
  }

  // Abstract
  if (paper.abstract) {
    y += 5;
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Abstract", 20, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const abstractLines = doc.splitTextToSize(paper.abstract, 170);
    doc.text(abstractLines, 20, y);
    y += abstractLines.length * 4.5 + 5;
  }

  // Extractions
  if (paper.extractions.length > 0) {
    y += 5;
    if (y > 260) { doc.addPage(); y = 20; }
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text("Extracted Data", 20, y);
    y += 8;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    for (const ext of paper.extractions) {
      if (y > 270) { doc.addPage(); y = 20; }
      const parts = [
        ext.drugName,
        ext.drugConc,
        ext.cellLine,
        ext.pathway ? `${ext.pathway}${ext.pathwayDir ? ` (${ext.pathwayDir})` : ""}` : null,
        ext.phenotype ? `${ext.phenotype}${ext.phenotypeDir ? ` (${ext.phenotypeDir})` : ""}` : null,
        ext.conclusion,
      ].filter(Boolean);
      const line = parts.join(" | ");
      const lines = doc.splitTextToSize(line, 170);
      doc.text(lines, 20, y);
      y += lines.length * 4 + 2;
    }
  }

  const filename = paper.title.slice(0, 50).replace(/[^a-zA-Z0-9一-鿿]/g, "_") + ".pdf";
  doc.save(filename);
}

const SOURCE_LABELS: Record<string, string> = {
  pubmed: "PubMed",
  semantic_scholar: "Semantic Scholar",
  openalex: "OpenAlex",
  local_upload: "本地上传",
  biorxiv: "bioRxiv",
};

const DIR_LABELS: Record<string, string> = {
  up: "上调",
  down: "下调",
  no_change: "无变化",
};

export default function PaperDetailPage() {
  const { projectId, paperId } = useParams<{ projectId: string; paperId: string }>();
  const [paper, setPaper] = useState<Paper | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    title: "",
    journal: "",
    year: "",
    doi: "",
    pmid: "",
  });
  const [expandedExtraction, setExpandedExtraction] = useState<string | null>(null);

  // NOTE: This fetches ALL papers then finds the one we need (N+1 pattern).
  // Should be optimized with a single-paper API endpoint (e.g., GET /api/projects/:id/papers/:paperId).
  // Not changing the data fetching pattern now as it requires a new API route.
  const fetchPaper = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/projects/${projectId}/papers`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        const found = (d.papers || []).find((p: Paper) => p.id === paperId);
        if (found) {
          setPaper(found);
          setEditForm({
            title: found.title,
            journal: found.journal || "",
            year: found.year?.toString() || "",
            doi: found.doi || "",
            pmid: found.pmid || "",
          });
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "加载文献失败");
        toast.error("加载文献失败");
      })
      .finally(() => setLoading(false));
  }, [projectId, paperId]);

  useEffect(() => {
    fetchPaper();
  }, [fetchPaper]);

  async function handleSaveMetadata() {
    try {
      const res = await fetch(`/api/projects/${projectId}/papers?id=${paperId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editForm.title,
          journal: editForm.journal || null,
          year: editForm.year ? parseInt(editForm.year) : null,
          doi: editForm.doi || null,
          pmid: editForm.pmid || null,
        }),
      });
      if (res.ok) {
        setPaper((prev) =>
          prev
            ? {
                ...prev,
                title: editForm.title,
                journal: editForm.journal || null,
                year: editForm.year ? parseInt(editForm.year) : null,
                doi: editForm.doi || null,
                pmid: editForm.pmid || null,
              }
            : prev
        );
        setEditing(false);
        toast.success("元数据已更新");
      } else {
        toast.error("更新失败");
      }
    } catch {
      toast.error("更新失败，请稍后重试");
    }
  }

  if (loading) {
    return (
      <main className="p-8 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-100 rounded w-2/3" />
          <div className="h-32 bg-gray-100 rounded" />
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="p-8 max-w-4xl mx-auto text-center py-20">
        <p className="text-red-500 text-lg mb-4">加载文献失败</p>
        <p className="text-gray-400 text-sm mb-4">{error}</p>
        <button
          onClick={fetchPaper}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          重试
        </button>
      </main>
    );
  }

  if (!paper) {
    return (
      <main className="p-8 max-w-4xl mx-auto text-center py-20">
        <p className="text-gray-500 text-lg mb-4">文献不存在</p>
        <Link
          href={`/project/${projectId}/papers`}
          className="text-blue-600 hover:underline text-sm"
        >
          返回文献列表
        </Link>
      </main>
    );
  }

  return (
    <main className="p-8 max-w-4xl mx-auto">
      {/* Breadcrumb */}
      <Link
        href={`/project/${projectId}/papers`}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        <ArrowLeft size={14} />
        返回文献列表
      </Link>

      {/* Title + Metadata */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          {editing ? (
            <div className="flex-1 space-y-3">
              <input
                type="text"
                value={editForm.title}
                onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">期刊</label>
                  <input
                    type="text"
                    value={editForm.journal}
                    onChange={(e) => setEditForm((f) => ({ ...f, journal: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">年份</label>
                  <input
                    type="number"
                    value={editForm.year}
                    onChange={(e) => setEditForm((f) => ({ ...f, year: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">DOI</label>
                  <input
                    type="text"
                    value={editForm.doi}
                    onChange={(e) => setEditForm((f) => ({ ...f, doi: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">PMID</label>
                  <input
                    type="text"
                    value={editForm.pmid}
                    onChange={(e) => setEditForm((f) => ({ ...f, pmid: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1">
              <h1 className="text-xl font-bold text-gray-900 leading-snug mb-3">
                {paper.title}
              </h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-gray-600">
                {paper.authors.length > 0 && (
                  <span>{paper.authors.join(", ")}</span>
                )}
                {paper.journal && (
                  <span className="italic text-gray-500">{paper.journal}</span>
                )}
                {paper.year && <span className="text-gray-400">({paper.year})</span>}
                {paper.impactFactor && (
                  <span className="text-xs px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded">
                    IF {paper.impactFactor}
                  </span>
                )}
              </div>
            </div>
          )}

          {editing ? (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleSaveMetadata}
                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Save size={16} />
              </button>
              <button
                onClick={() => setEditing(false)}
                className="p-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <>
            <button
              onClick={() => setEditing(true)}
              className="shrink-0 p-2 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors"
              title="编辑元数据"
            >
              <Pencil size={16} />
            </button>
            <button
              onClick={() => exportPaperPdf(paper)}
              className="shrink-0 p-2 border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors"
              title="导出 PDF"
            >
              <Download size={16} />
            </button>
            </>
          )}
        </div>

        {/* Tags row */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {paper.source && (
            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded">
              {SOURCE_LABELS[paper.source] || paper.source}
            </span>
          )}
          {paper.doi && (
            <a
              href={`https://doi.org/${paper.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1 bg-blue-50 text-blue-600 rounded flex items-center gap-1 hover:bg-blue-100 transition-colors"
            >
              <ExternalLink size={10} /> DOI
            </a>
          )}
          {paper.pmid && (
            <a
              href={`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1 bg-blue-50 text-blue-600 rounded flex items-center gap-1 hover:bg-blue-100 transition-colors"
            >
              <ExternalLink size={10} /> PubMed
            </a>
          )}
          {paper.oaUrl && (
            <a
              href={paper.oaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2 py-1 bg-green-50 text-green-600 rounded flex items-center gap-1 hover:bg-green-100 transition-colors"
            >
              <ExternalLink size={10} /> Open Access 全文
            </a>
          )}
        </div>
      </div>

      {/* Abstract */}
      {paper.abstract && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <FileText size={14} />
            摘要
          </h2>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
            {paper.abstract}
          </p>
        </div>
      )}

      {/* Full Text */}
      {paper.fullText && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <FileText size={14} />
            全文
          </h2>
          <div className="max-h-96 overflow-y-auto text-sm text-gray-600 leading-relaxed whitespace-pre-line border border-gray-100 rounded-lg p-4 bg-gray-50">
            {paper.fullText}
          </div>
        </div>
      )}

      {/* Extractions */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <Database size={14} />
          提取数据
          {paper.extractions.length > 0 && (
            <span className="text-xs font-normal text-gray-400">
              ({paper.extractions.length} 条)
            </span>
          )}
        </h2>

        {paper.extractions.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            尚无提取数据
          </div>
        ) : (
          <div className="space-y-2">
            {paper.extractions.map((ext) => {
              const isExpanded = expandedExtraction === ext.id;
              return (
                <div
                  key={ext.id}
                  className="border border-gray-100 rounded-lg overflow-hidden"
                >
                  {/* Extraction header */}
                  <button
                    onClick={() =>
                      setExpandedExtraction(isExpanded ? null : ext.id)
                    }
                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {ext.drugName && (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">
                          {ext.drugName}
                        </span>
                      )}
                      {ext.drugConc && (
                        <span className="text-gray-400">{ext.drugConc}</span>
                      )}
                      {ext.cellLine && (
                        <span className="px-2 py-0.5 bg-purple-50 text-purple-600 rounded">
                          {ext.cellLine}
                        </span>
                      )}
                      {ext.pathway && (
                        <span className="text-gray-500">
                          {ext.pathway}
                          {ext.pathwayDir && (
                            <span className="ml-1">
                              ({DIR_LABELS[ext.pathwayDir] || ext.pathwayDir})
                            </span>
                          )}
                        </span>
                      )}
                      {ext.phenotype && (
                        <span className="text-gray-500">
                          {ext.phenotype}
                          {ext.phenotypeDir && (
                            <span className="ml-1">
                              ({DIR_LABELS[ext.phenotypeDir] || ext.phenotypeDir})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                    {isExpanded ? (
                      <ChevronUp size={14} className="text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDown size={14} className="text-gray-400 shrink-0" />
                    )}
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-3 text-xs">
                      <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                        {ext.drugName && (
                          <div>
                            <span className="text-gray-400">药物/干预：</span>
                            <span className="text-gray-700">{ext.drugName}</span>
                          </div>
                        )}
                        {ext.drugConc && (
                          <div>
                            <span className="text-gray-400">浓度：</span>
                            <span className="text-gray-700">{ext.drugConc}</span>
                          </div>
                        )}
                        {ext.cellLine && (
                          <div>
                            <span className="text-gray-400">细胞系：</span>
                            <span className="text-gray-700">{ext.cellLine}</span>
                          </div>
                        )}
                        {ext.method && (
                          <div>
                            <span className="text-gray-400">统计方法：</span>
                            <span className="text-gray-700">{ext.method}</span>
                          </div>
                        )}
                        {ext.expMethod && (
                          <div>
                            <span className="text-gray-400">实验方法：</span>
                            <span className="text-gray-700">{ext.expMethod}</span>
                          </div>
                        )}
                        {ext.sampleSize != null && (
                          <div>
                            <span className="text-gray-400">样本量：</span>
                            <span className="text-gray-700">{ext.sampleSize}</span>
                          </div>
                        )}
                        {ext.confidence != null && (
                          <div>
                            <span className="text-gray-400">置信度：</span>
                            <span className="text-gray-700">
                              {Math.round(ext.confidence * 100)}%
                            </span>
                          </div>
                        )}
                      </div>

                      {ext.conclusion && (
                        <div>
                          <span className="text-gray-400">结论：</span>
                          <p className="text-gray-700 mt-1">{ext.conclusion}</p>
                        </div>
                      )}

                      {ext.rawText && (
                        <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                          <span className="text-gray-400 text-[10px] uppercase tracking-wider">
                            原文片段
                          </span>
                          <p className="text-gray-600 mt-1 italic">
                            &ldquo;{ext.rawText}&rdquo;
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
