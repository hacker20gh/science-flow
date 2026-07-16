"use client";

import { useState, useMemo, useCallback, Fragment, memo } from "react";
import { Search, Filter, Download, ChevronDown, ChevronUp, ChevronRight, Eye, GitCompare, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { DBExtraction } from "@/lib/matrix/generator";
import { getExperimentTier, getExperimentTierLabel, getExperimentTierIcon } from "@/lib/llm/extraction-postprocess";
import type { ExperimentTier } from "@/lib/llm/extraction-postprocess";
import { EvidenceViewer } from "./evidence-viewer";
import { PDFEvidenceViewer } from "./pdf-evidence-viewer";

interface ExperimentCollectionProps {
  extractions: DBExtraction[];
  projectId: string;
  onDelete?: () => void;
}

// ===== 实验类型中文映射 =====
const EXPERIMENT_TYPE_MAP: Record<string, string> = {
  cell_line: "细胞系", primary_cell: "原代细胞", organoid: "类器官",
  tissue_slice: "组织切片", animal_model: "动物模型", xenograft: "PDX",
  patient_sample: "患者样本", clinical_trial: "临床试验", clinical_obs: "观察性研究",
  case_report: "病例报告", bioinformatics: "生信分析", omics: "组学",
  meta_analysis: "Meta分析", review: "综述", unknown: "未知",
};

function formatType(type: string | null | undefined): string {
  return type ? (EXPERIMENT_TYPE_MAP[type] || type) : "未知";
}

// ===== 干预类型样式 =====
const INTERVENTION_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  drug: { bg: "bg-blue-50", text: "text-blue-700", label: "💊 药物" },
  knockdown: { bg: "bg-orange-50", text: "text-orange-700", label: "🔇 敲低" },
  overexpression: { bg: "bg-purple-50", text: "text-purple-700", label: "📢 过表达" },
  knockout: { bg: "bg-red-50", text: "text-red-700", label: "🧬 敲除" },
  stimulation: { bg: "bg-green-50", text: "text-green-700", label: "⚡ 刺激" },
  inhibition: { bg: "bg-gray-50", text: "text-gray-700", label: "🚫 抑制" },
};

function getInterventionStyle(type: string | null | undefined) {
  return INTERVENTION_STYLES[type || "drug"] || INTERVENTION_STYLES.drug;
}

// ===== 实验角色样式 =====
const ROLE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  main: { bg: "bg-red-50", text: "text-red-700", label: "⭐ 核心" },
  supporting: { bg: "bg-blue-50", text: "text-blue-700", label: "📎 支撑" },
  control: { bg: "bg-gray-50", text: "text-gray-600", label: "🔬 对照" },
};

function getRoleStyle(role: string | null | undefined) {
  return ROLE_STYLES[role || "supporting"] || ROLE_STYLES.supporting;
}

// ===== 证据强度 =====
function getStrength(ext: DBExtraction): number {
  let score = 30;
  if (ext.sampleSize != null) {
    if (ext.sampleSize >= 5) score += 25;
    else if (ext.sampleSize >= 3) score += 20;
    else if (ext.sampleSize >= 2) score += 10;
    else score += 5;
  }
  const pw = ext.pathwayEffectsRelational?.length ? ext.pathwayEffectsRelational : ext.pathwayEffects;
  if (pw && pw.length > 0) score += 15;
  const ph = ext.phenotypeEffectsRelational?.length ? ext.phenotypeEffectsRelational : ext.phenotypeEffects;
  if (ph && ph.length > 0) score += 10;
  if (ext.expMethod) score += 10;
  if (ext.paper.impactFactor != null && ext.paper.impactFactor > 0) {
    if (ext.paper.impactFactor >= 10) score += 10;
    else if (ext.paper.impactFactor >= 5) score += 7;
    else score += 4;
  }
  return Math.min(100, score);
}

function StrengthBar({ score }: { score: number }) {
  const color = score >= 80 ? "bg-green-500" : score >= 60 ? "bg-green-400" : score >= 40 ? "bg-amber-400" : "bg-red-400";
  const label = score >= 80 ? "强" : score >= 60 ? "中" : score >= 40 ? "弱" : "极弱";
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-[10px] font-medium ${score >= 60 ? "text-green-600" : score >= 40 ? "text-amber-600" : "text-red-500"}`}>
        {score} {label}
      </span>
    </div>
  );
}

// ===== 方向箭头 =====
function directionArrow(d: string): string {
  return d === "up" ? "↑" : d === "down" ? "↓" : "—";
}
function directionClass(d: string): string {
  return d === "up" ? "text-green-600" : d === "down" ? "text-red-600" : "text-gray-400";
}

// ===== 排序 =====
type SortDir = "asc" | "desc" | null;
interface SortState { key: string; dir: SortDir; }

// ===== CSV 导出 =====
function exportCSV(extractions: DBExtraction[]) {
  const headers = ["论文", "干预", "干预类型", "浓度", "细胞系", "物种", "实验方法", "通路", "表型", "样本量", "证据强度", "结论"];
  const rows = extractions.map((ext) => {
    const pw = ext.pathwayEffectsRelational?.length ? ext.pathwayEffectsRelational : ext.pathwayEffects;
    const ph = ext.phenotypeEffectsRelational?.length ? ext.phenotypeEffectsRelational : ext.phenotypeEffects;
    return [
      `"${(ext.paper.title || "").replace(/"/g, '""')}"`, ext.drugName || "",
      (ext as unknown as Record<string, unknown>).interventionType as string || "",
      ext.drugConc || "", ext.cellLine || "", ext.species || "", ext.expMethod || "",
      (pw || []).map(p => `${p.pathway}:${p.direction}`).join(";"),
      (ph || []).map(p => `${p.phenotype}:${p.direction}`).join(";"),
      ext.sampleSize != null ? String(ext.sampleSize) : "", String(getStrength(ext)),
      `"${(ext.conclusion || "").replace(/"/g, '""')}"`,
    ].join(",");
  });
  const csv = "﻿" + [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = "experiments.csv"; a.click();
  URL.revokeObjectURL(url);
}

// ===== 对比面板 =====
function ComparePanel({ items, onClose }: { items: DBExtraction[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-[95vw] max-h-[85vh] overflow-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">🔬 实验对比（{items.length} 项）</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left p-2 border font-medium text-gray-600 w-24">维度</th>
              {items.map((ext, i) => (
                <th key={i} className="text-left p-2 border font-medium text-gray-600">{ext.drugName || `实验${i + 1}`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "论文", fn: (e: DBExtraction) => e.paper.title?.slice(0, 40) || "—" },
              { label: "干预类型", fn: (e: DBExtraction) => getInterventionStyle((e as unknown as Record<string, unknown>).interventionType as string).label },
              { label: "系统", fn: (e: DBExtraction) => `${e.cellLine || "—"} ${e.species || ""}` },
              { label: "方法", fn: (e: DBExtraction) => e.expMethod || "—" },
              { label: "通路", fn: (e: DBExtraction) => {
                const pw = e.pathwayEffectsRelational?.length ? e.pathwayEffectsRelational : e.pathwayEffects;
                return (pw || []).map(p => `${p.pathway} ${directionArrow(p.direction)}`).join(", ") || "—";
              }},
              { label: "表型", fn: (e: DBExtraction) => {
                const ph = e.phenotypeEffectsRelational?.length ? e.phenotypeEffectsRelational : e.phenotypeEffects;
                return (ph || []).map(p => `${p.phenotype} ${directionArrow(p.direction)}`).join(", ") || "—";
              }},
              { label: "样本量", fn: (e: DBExtraction) => e.sampleSize != null ? String(e.sampleSize) : "—" },
              { label: "证据强度", fn: (e: DBExtraction) => String(getStrength(e)) },
              { label: "结论", fn: (e: DBExtraction) => e.conclusion?.slice(0, 80) || "—" },
            ].map(row => (
              <tr key={row.label}>
                <td className="p-2 border font-medium text-gray-500 bg-gray-50">{row.label}</td>
                {items.map((ext, i) => (
                  <td key={i} className="p-2 border text-gray-700">{row.fn(ext)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ===== 主组件 =====

export const ExperimentCollection = memo(function ExperimentCollection({ extractions, projectId, onDelete }: ExperimentCollectionProps) {
  const [search, setSearch] = useState("");
  const [filterExpMethod, setFilterExpMethod] = useState<string>("all");
  const [filterTier, setFilterTier] = useState<string>("all");
  const [sort, setSort] = useState<SortState>({ key: "", dir: null });
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [viewingEvidence, setViewingEvidence] = useState<{ paperId: string; paperTitle: string; quote: string; pdfUrl?: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showCompare, setShowCompare] = useState(false);
  const [showSelectMenu, setShowSelectMenu] = useState(false);
  const [groupBy, setGroupBy] = useState<"claim" | "role" | "tier" | "paper" | "none">("claim");

  // ===== 收集所有实验方法选项 =====
  const allExpMethods = useMemo(() => {
    const methods = new Set<string>();
    for (const ext of extractions) { if (ext.expMethod) methods.add(ext.expMethod); }
    return Array.from(methods).sort();
  }, [extractions]);

  // ===== 摘要统计 =====
  const stats = useMemo(() => {
    const tierCounts: Record<string, number> = { in_vitro: 0, in_vivo: 0, clinical: 0, computational: 0 };
    const pathways = new Set<string>();
    const drugs = new Set<string>();
    for (const ext of extractions) {
      const tier = ((ext as unknown as Record<string, unknown>).experimentTier as string) || getExperimentTier(ext.experimentType);
      tierCounts[tier] = (tierCounts[tier] || 0) + 1;
      const pw = ext.pathwayEffectsRelational?.length ? ext.pathwayEffectsRelational : ext.pathwayEffects;
      pw?.forEach(p => pathways.add(p.pathway));
      if (ext.drugName) drugs.add(ext.drugName);
    }
    return { total: extractions.length, in_vitro: tierCounts.in_vitro, in_vivo: tierCounts.in_vivo,
      clinical: tierCounts.clinical, computational: tierCounts.computational,
      pathways: pathways.size, drugs: drugs.size };
  }, [extractions]);

  // ===== 筛选 + 排序 =====
  const filteredExtractions = useMemo(() => {
    let result = [...extractions];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(ext => {
        const pw = ext.pathwayEffectsRelational?.length ? ext.pathwayEffectsRelational : ext.pathwayEffects;
        const ph = ext.phenotypeEffectsRelational?.length ? ext.phenotypeEffectsRelational : ext.phenotypeEffects;
        return [ext.paper.title, ext.drugName, ext.drugConc, ext.cellLine, ext.species, ext.expMethod, ext.conclusion,
          ...(pw || []).map(p => p.pathway), ...(ph || []).map(p => p.phenotype)]
          .filter(Boolean).join(" ").toLowerCase().includes(q);
      });
    }
    if (filterExpMethod !== "all") result = result.filter(ext => ext.expMethod === filterExpMethod);
    if (filterTier !== "all") {
      result = result.filter(ext => {
        const tier = ((ext as unknown as Record<string, unknown>).experimentTier as string) || getExperimentTier(ext.experimentType);
        return tier === filterTier;
      });
    }
    if (sort.key && sort.dir) {
      result.sort((a, b) => {
        let cmp = 0;
        switch (sort.key) {
          case "paper": cmp = (a.paper.title || "").localeCompare(b.paper.title || ""); break;
          case "drug": cmp = (a.drugName || "").localeCompare(b.drugName || ""); break;
          case "cellLine": cmp = (a.cellLine || "").localeCompare(b.cellLine || ""); break;
          case "expMethod": cmp = (a.expMethod || "").localeCompare(b.expMethod || ""); break;
          case "sampleSize": cmp = (a.sampleSize || 0) - (b.sampleSize || 0); break;
          case "strength": cmp = getStrength(a) - getStrength(b); break;
          case "year": cmp = (a.paper.year || 0) - (b.paper.year || 0); break;
        }
        return sort.dir === "desc" ? -cmp : cmp;
      });
    }
    return result;
  }, [extractions, search, filterExpMethod, filterTier, sort]);

  // ===== 分组逻辑 =====
  type GroupedData = Map<string, DBExtraction[]>;
  const groupedData = useMemo((): GroupedData | null => {
    if (groupBy === "none") return null;
    const groups = new Map<string, DBExtraction[]>();
    for (const ext of filteredExtractions) {
      let key: string;
      if (groupBy === "claim") {
        // 论文标题 + 结论 → 确保结论对应论文
        const paperTitle = ext.paper.title?.slice(0, 30) || "未知论文";
        const claim = ((ext as unknown as Record<string, unknown>).conclusionClaim as string) || null;
        // 有 conclusionClaim → 按结论分组；没有 → 按论文分组（旧数据）
        key = claim ? `${paperTitle}|||${claim}` : paperTitle;
      } else if (groupBy === "tier") {
        const tier = ((ext as unknown as Record<string, unknown>).experimentTier as string) || getExperimentTier(ext.experimentType);
        key = tier;
      } else if (groupBy === "paper") {
        key = ext.paper.title || "未知论文";
      } else if (groupBy === "role") {
        const role = ((ext as unknown as Record<string, unknown>).experimentRole as string) || "supporting";
        key = role;
      } else {
        key = "";
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ext);
    }
    return groups;
  }, [filteredExtractions, groupBy]);

  // tier 分组时的子分组（按论文）
  const tierSubGroups = useMemo(() => {
    if (groupBy !== "tier" || !groupedData) return null;
    const result = new Map<string, Map<string, DBExtraction[]>>();
    for (const [tier, exts] of groupedData) {
      const paperMap = new Map<string, DBExtraction[]>();
      for (const ext of exts) {
        const title = ext.paper.title || "未知论文";
        if (!paperMap.has(title)) paperMap.set(title, []);
        paperMap.get(title)!.push(ext);
      }
      result.set(tier, paperMap);
    }
    return result;
  }, [groupedData, groupBy]);

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = useCallback((tier: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(tier) ? next.delete(tier) : next.add(tier);
      return next;
    });
  }, []);

  // ===== 交互 =====
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }, []);

  const toggleSort = useCallback((key: string) => {
    setSort(prev => {
      if (prev.key !== key) return { key, dir: "desc" };
      if (prev.dir === "desc") return { key, dir: "asc" };
      return { key: "", dir: null };
    });
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }, []);

  function getSortIcon(key: string) {
    if (sort.key !== key) return <ChevronDown size={10} className="text-gray-300" />;
    return sort.dir === "desc" ? <ChevronDown size={10} className="text-blue-500" /> : <ChevronUp size={10} className="text-blue-500" />;
  }

  // ===== 表头已内联到 JSX 中 =====

  // ===== 单行渲染 =====
  function renderRow(ext: DBExtraction) {
    const isExpanded = expandedIds.has(ext.id);
    const strength = getStrength(ext);
    const pw = ext.pathwayEffectsRelational?.length ? ext.pathwayEffectsRelational : ext.pathwayEffects;
    const ph = ext.phenotypeEffectsRelational?.length ? ext.phenotypeEffectsRelational : ext.phenotypeEffects;
    const ivType = ((ext as unknown as Record<string, unknown>).interventionType as string) || "drug";
    const ivStyle = getInterventionStyle(ivType);
    const role = ((ext as unknown as Record<string, unknown>).experimentRole as string) || "supporting";
    const roleStyle = getRoleStyle(role);
    const tier = ((ext as unknown as Record<string, unknown>).experimentTier as string) || getExperimentTier(ext.experimentType);
    const tierColors: Record<string, string> = {
      in_vitro: "bg-blue-50 text-blue-600", in_vivo: "bg-green-50 text-green-600",
      clinical: "bg-purple-50 text-purple-600", computational: "bg-amber-50 text-amber-600",
    };

    return (
      <Fragment key={ext.id}>
        <tr className="border-b border-gray-100 hover:bg-blue-50/50 cursor-pointer transition-colors" onClick={() => toggleExpand(ext.id)}>
          <td className="px-1 py-2 text-center text-gray-400">
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </td>
          <td className="px-1 py-2 text-center" onClick={e => e.stopPropagation()}>
            <input type="checkbox" checked={selectedIds.has(ext.id)} onChange={() => toggleSelect(ext.id)} className="w-3.5 h-3.5 rounded" />
          </td>
          <td className="px-2 py-2 max-w-[200px]">
            <span className="text-gray-800 truncate block" title={ext.paper.title || ""}>{ext.paper.title || "—"}</span>
            <span className={`inline-block mt-0.5 px-1 py-0 rounded text-[9px] ${tierColors[tier] || "bg-gray-50 text-gray-500"}`}>
              {getExperimentTierIcon(tier as ExperimentTier)} {getExperimentTierLabel(tier as ExperimentTier)}
            </span>
          </td>
          <td className="px-2 py-2">
            <div className="flex items-center gap-1">
              <span className="text-gray-800 font-medium">{ext.drugName || "—"}</span>
              {ext.drugConc && <span className="text-gray-400 ml-0.5">{ext.drugConc}</span>}
            </div>
            <span className={`inline-block mt-0.5 px-1 py-0 rounded text-[9px] ${ivStyle.bg} ${ivStyle.text}`}>
              {ivStyle.label}
            </span>
            <span className={`inline-block mt-0.5 ml-0.5 px-1 py-0 rounded text-[9px] ${roleStyle.bg} ${roleStyle.text}`}>
              {roleStyle.label}
            </span>
          </td>
          <td className="px-2 py-2">
            <span>{ext.cellLine || "—"}</span>
            {ext.species && <span className="text-gray-400 ml-1">({ext.species})</span>}
          </td>
          <td className="px-2 py-2">
            {ext.expMethod
              ? <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]">{ext.expMethod}</span>
              : <span className="text-gray-300">—</span>}
          </td>
          <td className="px-2 py-2 max-w-[180px]">
            {pw && pw.length > 0 ? (
              <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                {pw.slice(0, 3).map((p, i) => (
                  <span key={i} className={`inline-flex items-center text-[10px] ${directionClass(p.direction)}`}>
                    <span className="max-w-[80px] truncate" title={p.pathway}>{p.pathway}</span>
                    <span className="ml-0.5 font-bold">{directionArrow(p.direction)}</span>
                  </span>
                ))}
                {pw.length > 3 && <span className="text-gray-400 text-[10px]">+{pw.length - 3}</span>}
              </div>
            ) : <span className="text-gray-300">—</span>}
          </td>
          <td className="px-2 py-2 max-w-[150px]">
            {ph && ph.length > 0 ? (
              <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                {ph.slice(0, 2).map((p, i) => (
                  <span key={i} className={`inline-flex items-center text-[10px] ${directionClass(p.direction)}`}>
                    <span className="max-w-[70px] truncate" title={p.phenotype}>{p.phenotype}</span>
                    <span className="ml-0.5 font-bold">{directionArrow(p.direction)}</span>
                  </span>
                ))}
                {ph.length > 2 && <span className="text-gray-400 text-[10px]">+{ph.length - 2}</span>}
              </div>
            ) : <span className="text-gray-300">—</span>}
          </td>
          <td className="px-2 py-2 text-gray-600">{ext.sampleSize != null ? ext.sampleSize : "—"}</td>
          <td className="px-2 py-2"><StrengthBar score={strength} /></td>
          <td className="px-2 py-2 text-gray-500">{ext.paper.year || "—"}</td>
          <td className="px-1 py-2 text-center" onClick={e => e.stopPropagation()}>
            <button
              onClick={async () => {
                if (!confirm("确定删除这条实验记录？")) return;
                try {
                  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/extractions?id=${ext.id}`, { method: "DELETE" });
                  if (res.ok) {
                    toast.success("已删除");
                    setSelectedIds(prev => { const next = new Set(prev); next.delete(ext.id); return next; });
                    onDelete?.();
                  } else toast.error("删除失败");
                } catch { toast.error("删除失败"); }
              }}
              className="p-1 hover:bg-red-100 rounded text-gray-400 hover:text-red-500 transition-colors"
              title="删除"
            >
              ✕
            </button>
          </td>
        </tr>

        {isExpanded && (
          <tr className="bg-gray-50">
            <td colSpan={12} className="px-6 py-3">
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="font-medium text-gray-600 block mb-1">原文证据</span>
                  {(ext.rawText || ext.conclusion) ? (
                    <button
                      onClick={async e => {
                        e.stopPropagation();
                        const quote = ext.rawText || ext.conclusion || "";
                        try {
                          const res = await fetch(`/api/papers/${ext.paperId}/fulltext`);
                          if (res.ok) {
                            const data = await res.json();
                            const pdfUrl = data.pdfUrl || data.oaUrl;
                            if (pdfUrl) {
                              // 先检查 PDF 是否可用
                              try {
                                const pdfCheck = await fetch(pdfUrl, { method: "HEAD" });
                                if (pdfCheck.ok && (pdfCheck.headers.get("content-type") || "").includes("pdf")) {
                                  setViewingEvidence({ paperId: ext.paperId, paperTitle: ext.paper.title || "", quote, pdfUrl });
                                  return;
                                }
                              } catch { /* PDF 不可用，降级到文本 */ }
                            }
                          }
                        } catch { /* fallback */}
                        setViewingEvidence({ paperId: ext.paperId, paperTitle: ext.paper.title || "", quote });
                      }}
                      className="text-left w-full group"
                    >
                      <p className="text-gray-500 leading-relaxed max-h-24 overflow-y-auto group-hover:text-blue-600 transition-colors">
                        {ext.rawText || ext.conclusion}
                      </p>
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-500 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Eye size={10} /> 点击查看原文
                      </span>
                    </button>
                  ) : <p className="text-gray-400">暂无原文</p>}
                </div>
                <div>
                  <span className="font-medium text-gray-600 block mb-1">结论</span>
                  <p className="text-gray-500 leading-relaxed">{ext.conclusion || "暂无结论"}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-600 block mb-1">详细信息</span>
                  <div className="space-y-1 text-gray-500">
                    {ext.method && <p>统计：{ext.method}</p>}
                    {ext.sampleSize != null && <p>样本量：{ext.sampleSize}</p>}
                    {(() => { const conf = (ext as unknown as Record<string, unknown>).confidence as number | null; return conf != null ? <p>置信度：{(conf * 100).toFixed(0)}%</p> : null; })()}
                    <p>证据强度：<StrengthBar score={strength} /></p>
                  </div>
                </div>
              </div>
            </td>
          </tr>
        )}
      </Fragment>
    );
  }

  // ===== 渲染 =====
  const selectedExtractions = extractions.filter(ext => selectedIds.has(ext.id));

  return (
    <div>
      {/* 摘要统计卡片 */}
      <div className="grid grid-cols-6 gap-3 mb-4">
        {[
          { label: "总实验", value: stats.total, color: "text-gray-800", icon: "🧪" },
          { label: "体外实验", value: stats.in_vitro, color: "text-blue-600", icon: "🧫" },
          { label: "体内实验", value: stats.in_vivo, color: "text-green-600", icon: "🐁" },
          { label: "临床/患者", value: stats.clinical, color: "text-purple-600", icon: "🏥" },
          { label: "覆盖通路", value: stats.pathways, color: "text-amber-600", icon: "🔗" },
          { label: "干预靶点", value: stats.drugs, color: "text-red-600", icon: "💊" },
        ].map(s => (
          <div key={s.label} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-center">
            <div className="text-lg font-bold text-gray-800">{s.value}</div>
            <div className="text-[10px] text-gray-500">{s.icon} {s.label}</div>
          </div>
        ))}
      </div>

      {/* 工具栏 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="搜索论文、药物、通路..."
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg w-56 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={`px-2.5 py-1.5 text-xs border rounded-lg flex items-center gap-1 transition-colors ${showFilters ? "border-blue-300 bg-blue-50 text-blue-600" : "border-gray-200 hover:bg-gray-50"}`}>
            <Filter size={12} /> 筛选
          </button>
          <div className="flex items-center gap-1 border border-gray-200 rounded-lg px-1 py-0.5">
            <span className="text-[10px] text-gray-400 px-1">分组</span>
            {[
              { key: "claim" as const, label: "结论" },
              { key: "role" as const, label: "角色" },
              { key: "tier" as const, label: "层级" },
              { key: "paper" as const, label: "论文" },
              { key: "none" as const, label: "无" },
            ].map(opt => (
              <button key={opt.key} onClick={() => setGroupBy(opt.key)}
                className={`px-2 py-0.5 text-[11px] rounded transition-colors ${groupBy === opt.key ? "bg-blue-100 text-blue-700 font-medium" : "text-gray-500 hover:bg-gray-100"}`}>
                {opt.label}
              </button>
            ))}
          </div>
          {/* 全选下拉菜单 */}
          <div className="relative">
            <button onClick={() => setShowSelectMenu(!showSelectMenu)}
              className={`px-2.5 py-1.5 text-xs border rounded-lg flex items-center gap-1 transition-colors ${
                selectedIds.size > 0
                  ? "border-blue-300 bg-blue-50 text-blue-600"
                  : "border-gray-200 text-gray-500 hover:bg-gray-50"
              }`}>
              {selectedIds.size > 0 ? `已选 ${selectedIds.size}` : "全选"}
              <ChevronDown size={10} />
            </button>
            {showSelectMenu && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
                <button onClick={() => {
                  setSelectedIds(new Set(filteredExtractions.map(ext => ext.id)));
                  setShowSelectMenu(false);
                }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50">
                  全选当前筛选结果 ({filteredExtractions.length})
                </button>
                <button onClick={() => {
                  setSelectedIds(new Set());
                  setShowSelectMenu(false);
                }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 text-gray-400">
                  取消全选
                </button>
                <div className="border-t border-gray-100 my-1" />
                {/* 按论文选择 */}
                {[...new Set(filteredExtractions.map(e => e.paper.title))].map(title => {
                  const count = filteredExtractions.filter(e => e.paper.title === title).length;
                  return (
                    <button key={title} onClick={() => {
                      const ids = filteredExtractions.filter(e => e.paper.title === title).map(e => e.id);
                      setSelectedIds(prev => { const next = new Set(prev); ids.forEach(id => next.add(id)); return next; });
                      setShowSelectMenu(false);
                    }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 truncate">
                      📄 {title.slice(0, 30)}... ({count})
                    </button>
                  );
                })}
                <div className="border-t border-gray-100 my-1" />
                {/* 按实验类型选择 */}
                {[...new Set(filteredExtractions.map(e => (e as unknown as Record<string, unknown>).experimentTier as string || "in_vitro"))].map(tier => {
                  const count = filteredExtractions.filter(e => ((e as unknown as Record<string, unknown>).experimentTier as string || "in_vitro") === tier).length;
                  const labels: Record<string, string> = { in_vitro: "🧫 体外实验", in_vivo: "🐁 体内实验", clinical: "🏥 临床/患者", computational: "💻 生信/组学" };
                  return (
                    <button key={tier} onClick={() => {
                      const ids = filteredExtractions.filter(e => ((e as unknown as Record<string, unknown>).experimentTier as string || "in_vitro") === tier).map(e => e.id);
                      setSelectedIds(prev => { const next = new Set(prev); ids.forEach(id => next.add(id)); return next; });
                      setShowSelectMenu(false);
                    }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50">
                      {labels[tier] || tier} ({count})
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {selectedIds.size > 0 && (
            <>
              <button onClick={() => setShowCompare(true)}
                className="px-2.5 py-1.5 text-xs border border-purple-300 bg-purple-50 text-purple-600 rounded-lg flex items-center gap-1 hover:bg-purple-100">
                <GitCompare size={12} /> 对比 ({selectedIds.size})
              </button>
              <button onClick={async () => {
                if (!confirm(`确定删除选中的 ${selectedIds.size} 条实验记录？此操作不可撤销。`)) return;
                const ids = Array.from(selectedIds);
                const results = await Promise.allSettled(
                  ids.map(id => fetch(`/api/projects/${encodeURIComponent(projectId)}/extractions?id=${id}`, { method: "DELETE" }))
                );
                const successCount = results.filter(r => r.status === "fulfilled" && (r as PromiseFulfilledResult<Response>).value.ok).length;
                const failCount = ids.length - successCount;
                if (successCount > 0) {
                  toast.success(`已删除 ${successCount} 条记录`);
                  onDelete?.();
                  setSelectedIds(new Set());
                }
                if (failCount > 0) {
                  toast.error(`${failCount} 条删除失败`);
                }
              }}
                className="px-2.5 py-1.5 text-xs border border-red-300 bg-red-50 text-red-600 rounded-lg flex items-center gap-1 hover:bg-red-100">
                <Trash2 size={12} /> 删除 ({selectedIds.size})
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{filteredExtractions.length} 条</span>
          <button onClick={() => exportCSV(filteredExtractions)}
            className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1">
            <Download size={12} /> CSV
          </button>
        </div>
      </div>

      {/* 筛选面板 */}
      {showFilters && (
        <div className="flex items-center gap-4 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-xs mb-3">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-medium">实验方法：</span>
            <select value={filterExpMethod} onChange={e => setFilterExpMethod(e.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="all">全部</option>
              {allExpMethods.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-medium">实验层级：</span>
            <select value={filterTier} onChange={e => setFilterTier(e.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
              <option value="all">全部</option>
              <option value="in_vitro">🧫 体外实验</option>
              <option value="in_vivo">🐁 体内实验</option>
              <option value="clinical">🏥 临床/患者</option>
              <option value="computational">💻 生信/组学</option>
            </select>
          </div>
          <button onClick={() => { setFilterExpMethod("all"); setFilterTier("all"); setSearch(""); }}
            className="text-xs text-gray-400 hover:text-gray-600">重置筛选</button>
        </div>
      )}

      {/* 表格 */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="w-6 px-1 py-2" />
              <th className="w-10 px-2 py-2">
                <input type="checkbox"
                  checked={filteredExtractions.length > 0 && filteredExtractions.every(ext => selectedIds.has(ext.id))}
                  onChange={() => {
                    const allSelected = filteredExtractions.every(ext => selectedIds.has(ext.id));
                    if (allSelected) {
                      setSelectedIds(new Set());
                    } else {
                      setSelectedIds(new Set(filteredExtractions.map(ext => ext.id)));
                    }
                  }}
                  className="w-4 h-4 rounded cursor-pointer accent-blue-600"
                  title="全选/取消全选"
                />
              </th>
              <th className="text-left px-2 py-2 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100" onClick={() => toggleSort("paper")}>
                <span className="inline-flex items-center">论文{getSortIcon("paper")}</span>
              </th>
              <th className="text-left px-2 py-2 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100" onClick={() => toggleSort("drug")}>
                <span className="inline-flex items-center">干预{getSortIcon("drug")}</span>
              </th>
              <th className="text-left px-2 py-2 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100" onClick={() => toggleSort("cellLine")}>
                <span className="inline-flex items-center">系统{getSortIcon("cellLine")}</span>
              </th>
              <th className="text-left px-2 py-2 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100" onClick={() => toggleSort("expMethod")}>
                <span className="inline-flex items-center">方法{getSortIcon("expMethod")}</span>
              </th>
              <th className="text-left px-2 py-2 font-medium text-gray-600">通路</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600">表型</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100" onClick={() => toggleSort("sampleSize")}>
                <span className="inline-flex items-center">样本{getSortIcon("sampleSize")}</span>
              </th>
              <th className="text-left px-2 py-2 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100" onClick={() => toggleSort("strength")}>
                <span className="inline-flex items-center">证据{getSortIcon("strength")}</span>
              </th>
              <th className="text-left px-2 py-2 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100" onClick={() => toggleSort("year")}>
                <span className="inline-flex items-center">年份{getSortIcon("year")}</span>
              </th>
              <th className="w-8 px-1 py-2" />
            </tr>
          </thead>
          <tbody>
            {filteredExtractions.length === 0 ? (
              <tr><td colSpan={12} className="text-center py-8 text-gray-400">{extractions.length === 0 ? "暂无实验数据" : "没有匹配的结果"}</td></tr>
            ) : !groupedData ? (
              // 无分组
              filteredExtractions.map(ext => renderRow(ext))
            ) : groupBy === "claim" ? (
              // 按论文 + 结论分组 — 证据链可视化
              (() => {
                // 先按论文分组，再按结论子分组
                const paperMap = new Map<string, Map<string, DBExtraction[]>>();
                for (const [compositeKey, exts] of groupedData) {
                  const separatorIndex = compositeKey.indexOf("|||");
                  const paperTitle = separatorIndex >= 0 ? compositeKey.slice(0, separatorIndex) : compositeKey;
                  const claim = separatorIndex >= 0 ? compositeKey.slice(separatorIndex + 3) : null;
                  if (!paperMap.has(paperTitle)) paperMap.set(paperTitle, new Map());
                  paperMap.get(paperTitle)!.set(claim || "__all__", exts);
                }
                return Array.from(paperMap.entries()).map(([paperTitle, claims]) => (
                  <Fragment key={paperTitle}>
                    {/* 论文标题 */}
                    <tr className="bg-gray-100">
                      <td colSpan={12} className="px-4 py-2">
                        <span className="text-sm font-semibold text-gray-700">📄 {paperTitle}</span>
                        <span className="text-xs text-gray-400 ml-2">({Array.from(claims.values()).reduce((s, e) => s + e.length, 0)} 实验)</span>
                      </td>
                    </tr>
                    {/* 该论文下的每个结论 */}
                    {Array.from(claims.entries()).map(([claim, exts]) => {
                      const compositeKey = `${paperTitle}|||${claim}`;
                      const isCollapsed = collapsedGroups.has(compositeKey);
                      const isUngrouped = claim === "__all__";
                      return (
                        <Fragment key={compositeKey}>
                          {!isUngrouped && (
                            <tr className="bg-blue-50/50 cursor-pointer" onClick={() => toggleGroup(compositeKey)}>
                              <td colSpan={12} className="px-6 py-2">
                                <div className="flex items-start gap-2">
                                  {isCollapsed ? <ChevronRight size={14} className="text-blue-500 mt-0.5 shrink-0" /> : <ChevronDown size={14} className="text-blue-500 mt-0.5 shrink-0" />}
                                  <div>
                                    <span className="text-sm font-medium text-blue-800">💡 {claim}</span>
                                    <span className="text-xs text-gray-400 ml-2">({exts.length})</span>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                          {(isUngrouped || !isCollapsed) && (
                            <>
                              {/* 证据链箭头 */}
                              {!isUngrouped && exts.length > 1 && (
                                <tr>
                                  <td colSpan={12} className="px-10 py-1">
                                    <div className="flex items-center gap-1 text-[10px] text-gray-400 flex-wrap">
                                      {exts.map((ext, i) => {
                                        const role = ((ext as unknown as Record<string, unknown>).experimentRole as string) || "supporting";
                                        const icon = role === "main" ? "⭐" : role === "control" ? "🔬" : "📎";
                                        return (
                                          <Fragment key={ext.id}>
                                            {i > 0 && <span className="mx-0.5">→</span>}
                                            <span className={`px-1.5 py-0.5 rounded ${role === "main" ? "bg-red-50 text-red-600 font-medium" : "bg-gray-50 text-gray-500"}`}>
                                              {icon} {ext.drugName || ext.expMethod || `实验${i + 1}`}
                                            </span>
                                          </Fragment>
                                        );
                                      })}
                                    </div>
                                  </td>
                                </tr>
                              )}
                              {exts.map(ext => renderRow(ext))}
                            </>
                          )}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                ));
              })()
            ) : groupBy === "role" ? (
              // 按角色分组
              (["main", "supporting", "control"] as const).map(role => {
                const exts = groupedData.get(role);
                if (!exts || exts.length === 0) return null;
                const isCollapsed = collapsedGroups.has(role);
                const style = ROLE_STYLES[role];
                return (
                  <Fragment key={role}>
                    <tr className="bg-gray-100 cursor-pointer" onClick={() => toggleGroup(role)}>
                      <td colSpan={12} className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700">
                          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          {style.label}
                          <span className="text-xs font-normal text-gray-400 ml-1">({exts.length})</span>
                        </span>
                      </td>
                    </tr>
                    {!isCollapsed && exts.map(ext => renderRow(ext))}
                  </Fragment>
                );
              })
            ) : groupBy === "tier" ? (
              // 按层级分组（带论文子分组）
              (["in_vitro", "in_vivo", "clinical", "computational"] as const).map(tier => {
                const exts = groupedData.get(tier);
                if (!exts || exts.length === 0) return null;
                const isCollapsed = collapsedGroups.has(tier);
                const subMap = tierSubGroups?.get(tier);
                const paperCount = subMap?.size || 1;
                const showPaperSub = subMap && subMap.size > 1;

                return (
                  <Fragment key={tier}>
                    <tr className="bg-gray-100 cursor-pointer" onClick={() => toggleGroup(tier)}>
                      <td colSpan={12} className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700">
                          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          {getExperimentTierIcon(tier)} {getExperimentTierLabel(tier)}
                          <span className="text-xs font-normal text-gray-400 ml-1">
                            ({exts.length} 实验 · {paperCount} 篇论文)
                          </span>
                        </span>
                      </td>
                    </tr>
                    {!isCollapsed && (showPaperSub ? (
                      Array.from(subMap!.entries()).map(([title, paperExts]) => (
                        <Fragment key={title}>
                          <tr className="bg-gray-50">
                            <td colSpan={12} className="px-6 py-1.5 text-xs text-gray-500 font-medium truncate">
                              📄 {title}
                              <span className="text-gray-400 ml-1">({paperExts.length})</span>
                            </td>
                          </tr>
                          {paperExts.map(ext => renderRow(ext))}
                        </Fragment>
                      ))
                    ) : exts.map(ext => renderRow(ext)))}
                  </Fragment>
                );
              })
            ) : (
              // 按论文分组
              Array.from(groupedData.entries()).map(([title, exts]) => {
                const isCollapsed = collapsedGroups.has(title);
                return (
                  <Fragment key={title}>
                    <tr className="bg-blue-50 cursor-pointer" onClick={() => toggleGroup(title)}>
                      <td colSpan={12} className="px-3 py-2">
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-700">
                          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                          📄 {title}
                          <span className="text-xs font-normal text-gray-400 ml-1">({exts.length})</span>
                        </span>
                      </td>
                    </tr>
                    {!isCollapsed && exts.map(ext => renderRow(ext))}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 原文证据查看器 */}
      {viewingEvidence && viewingEvidence.pdfUrl && (
        <PDFEvidenceViewer pdfUrl={viewingEvidence.pdfUrl} paperTitle={viewingEvidence.paperTitle}
          evidenceQuote={viewingEvidence.quote} onClose={() => setViewingEvidence(null)} />
      )}
      {viewingEvidence && !viewingEvidence.pdfUrl && (
        <EvidenceViewer paperId={viewingEvidence.paperId} paperTitle={viewingEvidence.paperTitle}
          evidenceQuote={viewingEvidence.quote} onClose={() => setViewingEvidence(null)} />
      )}

      {/* 对比面板 */}
      {showCompare && selectedExtractions.length >= 2 && (
        <ComparePanel items={selectedExtractions} onClose={() => setShowCompare(false)} />
      )}
    </div>
  );
});
