"use client";

import { useState, useMemo, useCallback, Fragment } from "react";
import { Search, Filter, Download, ChevronDown, ChevronUp, ChevronRight } from "lucide-react";
import type { DBExtraction } from "@/lib/matrix/generator";

interface ExperimentCollectionProps {
  extractions: DBExtraction[];
  projectId: string;
}

// ===== 实验类型中文映射 =====
const EXPERIMENT_TYPE_MAP: Record<string, string> = {
  cell_line: "细胞系",
  primary_cell: "原代细胞",
  organoid: "类器官",
  tissue_slice: "组织切片",
  animal_model: "动物模型",
  xenograft: "PDX",
  patient_sample: "患者样本",
  clinical_trial: "临床试验",
  clinical_obs: "观察性研究",
  case_report: "病例报告",
  bioinformatics: "生信分析",
  omics: "组学",
  meta_analysis: "Meta分析",
  review: "综述",
  unknown: "未知",
};

/** 格式化实验类型为中文 */
function formatType(type: string | null | undefined): string {
  if (!type) return "未知";
  return EXPERIMENT_TYPE_MAP[type] || type;
}

/** 简化的证据强度估算 (0-100) */
function getStrength(ext: DBExtraction): number {
  let score = 30;

  // 样本量评分
  if (ext.sampleSize != null) {
    if (ext.sampleSize >= 5) score += 25;
    else if (ext.sampleSize >= 3) score += 20;
    else if (ext.sampleSize >= 2) score += 10;
    else score += 5;
  }

  // 通路效果
  const pathwayData = ext.pathwayEffectsRelational?.length
    ? ext.pathwayEffectsRelational
    : ext.pathwayEffects;
  if (pathwayData && pathwayData.length > 0) score += 15;

  // 表型效果
  const phenotypeData = ext.phenotypeEffectsRelational?.length
    ? ext.phenotypeEffectsRelational
    : ext.phenotypeEffects;
  if (phenotypeData && phenotypeData.length > 0) score += 10;

  // 实验方法
  if (ext.expMethod) score += 10;

  // 期刊影响因子
  if (ext.paper.impactFactor != null && ext.paper.impactFactor > 0) {
    if (ext.paper.impactFactor >= 10) score += 10;
    else if (ext.paper.impactFactor >= 5) score += 7;
    else score += 4;
  }

  return Math.min(100, score);
}

/** 获取证据强度的颜色和标签 */
function getStrengthStyle(score: number): { barColor: string; label: string } {
  if (score >= 80) return { barColor: "bg-green-500", label: "强" };
  if (score >= 60) return { barColor: "bg-green-400", label: "中" };
  if (score >= 40) return { barColor: "bg-amber-400", label: "弱" };
  return { barColor: "bg-gray-400", label: "极弱" };
}

/** 获取方向箭头的样式类 */
function directionClass(direction: string): string {
  switch (direction) {
    case "up":
      return "text-green-600";
    case "down":
      return "text-red-600";
    default:
      return "text-gray-400";
  }
}

/** 获取方向箭头符号 */
function directionArrow(direction: string): string {
  switch (direction) {
    case "up":
      return "↑";
    case "down":
      return "↓";
    default:
      return "—";
  }
}

// ===== 排序方向 =====
type SortDir = "asc" | "desc" | null;
interface SortState {
  key: string;
  dir: SortDir;
}

// ===== 导出 CSV =====
function exportCSV(extractions: DBExtraction[]) {
  const headers = [
    "论文",
    "干预",
    "浓度",
    "细胞系",
    "物种",
    "实验方法",
    "统计方法",
    "通路",
    "表型",
    "样本量",
    "证据强度",
    "结论",
  ];

  const rows = extractions.map((ext) => {
    const pathwayData = ext.pathwayEffectsRelational?.length
      ? ext.pathwayEffectsRelational
      : ext.pathwayEffects;
    const phenotypeData = ext.phenotypeEffectsRelational?.length
      ? ext.phenotypeEffectsRelational
      : ext.phenotypeEffects;

    return [
      `"${(ext.paper.title || "").replace(/"/g, '""')}"`,
      ext.drugName || "",
      ext.drugConc || "",
      ext.cellLine || "",
      ext.species || "",
      ext.expMethod || "",
      ext.method || "",
      (pathwayData || []).map((pe) => `${pe.pathway}:${pe.direction}`).join(";"),
      (phenotypeData || []).map((ph) => `${ph.phenotype}:${ph.direction}`).join(";"),
      ext.sampleSize != null ? String(ext.sampleSize) : "",
      String(getStrength(ext)),
      `"${(ext.conclusion || "").replace(/"/g, '""')}"`,
    ].join(",");
  });

  const csv = "﻿" + [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "experiments.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ===== 主组件 =====

export function ExperimentCollection({ extractions, projectId: _projectId }: ExperimentCollectionProps) {
  // 搜索关键词
  const [search, setSearch] = useState("");
  // 筛选器
  const [filterExpMethod, setFilterExpMethod] = useState<string>("all");
  // 排序
  const [sort, setSort] = useState<SortState>({ key: "", dir: null });
  // 展开行
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // 筛选面板是否展开
  const [showFilters, setShowFilters] = useState(false);

  // ===== 收集所有实验方法选项 =====
  const allExpMethods = useMemo(() => {
    const methods = new Set<string>();
    for (const ext of extractions) {
      if (ext.expMethod) methods.add(ext.expMethod);
    }
    return Array.from(methods).sort();
  }, [extractions]);

  // ===== 筛选 + 搜索 + 排序 =====
  const filteredExtractions = useMemo(() => {
    let result = [...extractions];

    // 搜索过滤
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((ext) => {
        const pathwayData = ext.pathwayEffectsRelational?.length
          ? ext.pathwayEffectsRelational
          : ext.pathwayEffects;
        const phenotypeData = ext.phenotypeEffectsRelational?.length
          ? ext.phenotypeEffectsRelational
          : ext.phenotypeEffects;

        const searchableText = [
          ext.paper.title,
          ext.drugName,
          ext.drugConc,
          ext.cellLine,
          ext.species,
          ext.expMethod,
          ext.conclusion,
          ...(pathwayData || []).map((pe) => pe.pathway),
          ...(phenotypeData || []).map((ph) => ph.phenotype),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(q);
      });
    }

    // 实验方法筛选
    if (filterExpMethod !== "all") {
      result = result.filter((ext) => ext.expMethod === filterExpMethod);
    }

    // 排序
    if (sort.key && sort.dir) {
      result.sort((a, b) => {
        let cmp = 0;
        switch (sort.key) {
          case "paper":
            cmp = (a.paper.title || "").localeCompare(b.paper.title || "");
            break;
          case "drug":
            cmp = (a.drugName || "").localeCompare(b.drugName || "");
            break;
          case "cellLine":
            cmp = (a.cellLine || "").localeCompare(b.cellLine || "");
            break;
          case "expMethod":
            cmp = (a.expMethod || "").localeCompare(b.expMethod || "");
            break;
          case "sampleSize":
            cmp = (a.sampleSize || 0) - (b.sampleSize || 0);
            break;
          case "strength":
            cmp = getStrength(a) - getStrength(b);
            break;
          case "year":
            cmp = (a.paper.year || 0) - (b.paper.year || 0);
            break;
          default:
            cmp = 0;
        }
        return sort.dir === "desc" ? -cmp : cmp;
      });
    }

    return result;
  }, [extractions, search, filterExpMethod, sort]);

  // ===== 切换排序 =====
  const toggleSort = useCallback(
    (key: string) => {
      setSort((prev) => {
        if (prev.key !== key) return { key, dir: "asc" };
        if (prev.dir === "asc") return { key, dir: "desc" };
        return { key: "", dir: null };
      });
    },
    []
  );

  // ===== 切换展开行 =====
  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // ===== 排序图标 =====
  const getSortIcon = (columnKey: string) => {
    if (sort.key !== columnKey || !sort.dir) {
      return <ChevronDown size={10} className="text-gray-300 ml-0.5" />;
    }
    return sort.dir === "asc" ? (
      <ChevronUp size={10} className="text-blue-600 ml-0.5" />
    ) : (
      <ChevronDown size={10} className="text-blue-600 ml-0.5" />
    );
  };

  return (
    <div className="space-y-3">
      {/* 工具栏 */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* 搜索框 */}
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索论文、药物、通路、表型..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* 筛选按钮 */}
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`px-2.5 py-1.5 text-xs border rounded-lg flex items-center gap-1 transition-colors ${
            showFilters || filterExpMethod !== "all"
              ? "border-blue-300 bg-blue-50 text-blue-700"
              : "border-gray-200 hover:bg-gray-50"
          }`}
        >
          <Filter size={12} />
          筛选
          {filterExpMethod !== "all" && (
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          )}
        </button>

        {/* 导出 CSV */}
        <button
          onClick={() => exportCSV(filteredExtractions)}
          className="px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-1"
        >
          <Download size={12} />
          导出 CSV
        </button>

        {/* 计数 */}
        <span className="text-xs text-gray-400 ml-auto">
          {filteredExtractions.length} / {extractions.length} 条
        </span>
      </div>

      {/* 筛选面板 */}
      {showFilters && (
        <div className="flex items-center gap-4 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg text-xs">
          <div className="flex items-center gap-2">
            <span className="text-gray-500 font-medium">实验方法：</span>
            <select
              value={filterExpMethod}
              onChange={(e) => setFilterExpMethod(e.target.value)}
              className="border border-gray-200 rounded px-2 py-1 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">全部</option>
              {allExpMethods.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => {
              setFilterExpMethod("all");
              setSearch("");
            }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            重置筛选
          </button>
        </div>
      )}

      {/* 表格 */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {/* 展开箭头占位列 */}
              <th className="w-6 px-1 py-2" />
              <th
                className="text-left px-2 py-2 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100"
                onClick={() => toggleSort("paper")}
              >
                <span className="inline-flex items-center">
                  论文
                  {getSortIcon("paper")}
                </span>
              </th>
              <th
                className="text-left px-2 py-2 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100"
                onClick={() => toggleSort("drug")}
              >
                <span className="inline-flex items-center">
                  干预
                  {getSortIcon("drug")}
                </span>
              </th>
              <th
                className="text-left px-2 py-2 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100"
                onClick={() => toggleSort("cellLine")}
              >
                <span className="inline-flex items-center">
                  系统
                  {getSortIcon("cellLine")}
                </span>
              </th>
              <th
                className="text-left px-2 py-2 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100"
                onClick={() => toggleSort("expMethod")}
              >
                <span className="inline-flex items-center">
                  方法
                  {getSortIcon("expMethod")}
                </span>
              </th>
              <th className="text-left px-2 py-2 font-medium text-gray-600">通路</th>
              <th className="text-left px-2 py-2 font-medium text-gray-600">表型</th>
              <th
                className="text-left px-2 py-2 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100"
                onClick={() => toggleSort("sampleSize")}
              >
                <span className="inline-flex items-center">
                  样本量
                  {getSortIcon("sampleSize")}
                </span>
              </th>
              <th
                className="text-left px-2 py-2 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100"
                onClick={() => toggleSort("strength")}
              >
                <span className="inline-flex items-center">
                  证据
                  {getSortIcon("strength")}
                </span>
              </th>
              <th
                className="text-left px-2 py-2 font-medium text-gray-600 cursor-pointer select-none hover:bg-gray-100"
                onClick={() => toggleSort("year")}
              >
                <span className="inline-flex items-center">
                  年份
                  {getSortIcon("year")}
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredExtractions.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-8 text-gray-400">
                  {extractions.length === 0 ? "暂无实验数据" : "没有匹配的结果"}
                </td>
              </tr>
            ) : (
              filteredExtractions.map((ext) => {
                const isExpanded = expandedIds.has(ext.id);
                const strength = getStrength(ext);
                const strengthStyle = getStrengthStyle(strength);

                const pathwayData = ext.pathwayEffectsRelational?.length
                  ? ext.pathwayEffectsRelational
                  : ext.pathwayEffects;
                const phenotypeData = ext.phenotypeEffectsRelational?.length
                  ? ext.phenotypeEffectsRelational
                  : ext.phenotypeEffects;

                return (
                  <Fragment key={ext.id}>
                    {/* 主行 */}
                    <tr
                      className="border-b border-gray-100 hover:bg-blue-50/50 cursor-pointer transition-colors"
                      onClick={() => toggleExpand(ext.id)}
                    >
                      {/* 展开箭头 */}
                      <td className="px-1 py-2 text-center text-gray-400">
                        {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      </td>
                      {/* 论文标题 */}
                      <td
                        className="px-2 py-2 max-w-[200px] truncate text-gray-800"
                        title={ext.paper.title}
                      >
                        {ext.paper.title}
                      </td>
                      {/* 干预 */}
                      <td className="px-2 py-2">
                        <span className="text-gray-800">{ext.drugName || "—"}</span>
                        {ext.drugConc && (
                          <span className="text-gray-400 ml-1">{ext.drugConc}</span>
                        )}
                      </td>
                      {/* 系统（细胞系/物种） */}
                      <td className="px-2 py-2">
                        <span>{ext.cellLine || "—"}</span>
                        {ext.species && (
                          <span className="text-gray-400 ml-1">({ext.species})</span>
                        )}
                      </td>
                      {/* 实验方法 */}
                      <td className="px-2 py-2">
                        {ext.expMethod ? (
                          <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]">
                            {ext.expMethod}
                          </span>
                        ) : (
                          <span className="text-gray-400">{"—"}</span>
                        )}
                      </td>
                      {/* 通路效果 */}
                      <td className="px-2 py-2 max-w-[180px]">
                        {pathwayData && pathwayData.length > 0 ? (
                          <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                            {pathwayData.slice(0, 3).map((pe, i) => (
                              <span
                                key={i}
                                className={`inline-flex items-center text-[10px] ${directionClass(pe.direction)}`}
                              >
                                <span className="max-w-[80px] truncate" title={pe.pathway}>
                                  {pe.pathway}
                                </span>
                                <span className="ml-0.5 font-bold">{directionArrow(pe.direction)}</span>
                              </span>
                            ))}
                            {pathwayData.length > 3 && (
                              <span className="text-gray-400 text-[10px]">+{pathwayData.length - 3}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">{"—"}</span>
                        )}
                      </td>
                      {/* 表型效果 */}
                      <td className="px-2 py-2 max-w-[150px]">
                        {phenotypeData && phenotypeData.length > 0 ? (
                          <div className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                            {phenotypeData.slice(0, 2).map((ph, i) => (
                              <span
                                key={i}
                                className={`inline-flex items-center text-[10px] ${directionClass(ph.direction)}`}
                              >
                                <span className="max-w-[70px] truncate" title={ph.phenotype}>
                                  {ph.phenotype}
                                </span>
                                <span className="ml-0.5 font-bold">{directionArrow(ph.direction)}</span>
                              </span>
                            ))}
                            {phenotypeData.length > 2 && (
                              <span className="text-gray-400 text-[10px]">+{phenotypeData.length - 2}</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-300">{"—"}</span>
                        )}
                      </td>
                      {/* 样本量 */}
                      <td className="px-2 py-2 text-center">
                        {ext.sampleSize != null ? ext.sampleSize : "—"}
                      </td>
                      {/* 证据强度 */}
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-14 bg-gray-200 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${strengthStyle.barColor}`}
                              style={{ width: `${strength}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-gray-500">{strengthStyle.label}</span>
                        </div>
                      </td>
                      {/* 年份 */}
                      <td className="px-2 py-2 text-center text-gray-500">
                        {ext.paper.year || "—"}
                      </td>
                    </tr>

                    {/* 展开详情行 */}
                    {isExpanded && (
                      <tr className="bg-gray-50/80">
                        <td colSpan={10} className="px-6 py-3">
                          <div className="grid grid-cols-3 gap-4 text-xs">
                            {/* 证据引文 */}
                            <div>
                              <span className="font-medium text-gray-600 block mb-1">
                                原文证据
                              </span>
                              <p className="text-gray-500 leading-relaxed max-h-24 overflow-y-auto">
                                {ext.rawText || ext.conclusion || "暂无原文"}
                              </p>
                            </div>
                            {/* 结论 */}
                            <div>
                              <span className="font-medium text-gray-600 block mb-1">
                                结论
                              </span>
                              <p className="text-gray-500 leading-relaxed">
                                {ext.conclusion || "暂无结论"}
                              </p>
                            </div>
                            {/* 元数据 */}
                            <div className="space-y-1.5">
                              <span className="font-medium text-gray-600 block mb-1">
                                实验详情
                              </span>
                              <div className="text-gray-500 space-y-1">
                                {ext.method && (
                                  <div>
                                    <span className="text-gray-400">统计方法：</span>
                                    {ext.method}
                                  </div>
                                )}
                                {ext.duration && (
                                  <div>
                                    <span className="text-gray-400">处理时间：</span>
                                    {ext.duration}
                                  </div>
                                )}
                                {ext.sampleSize != null && (
                                  <div>
                                    <span className="text-gray-400">样本量：</span>
                                    {ext.sampleSize}
                                  </div>
                                )}
                                {ext.paper.impactFactor != null && (
                                  <div>
                                    <span className="text-gray-400">影响因子：</span>
                                    {ext.paper.impactFactor}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          {/* 通路效果详情 */}
                          {pathwayData && pathwayData.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-200">
                              <span className="font-medium text-gray-600 text-xs block mb-1.5">
                                通路效果详情
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {pathwayData.map((pe, i) => (
                                  <span
                                    key={i}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] ${
                                      pe.direction === "up"
                                        ? "bg-green-50 text-green-700"
                                        : pe.direction === "down"
                                        ? "bg-red-50 text-red-700"
                                        : "bg-gray-100 text-gray-500"
                                    }`}
                                  >
                                    {pe.pathway}
                                    <span className="font-bold">
                                      {directionArrow(pe.direction)}
                                    </span>
                                    {pe.significance && (
                                      <span className="text-gray-400 ml-1">
                                        {pe.significance}
                                      </span>
                                    )}
                                    {pe.method && (
                                      <span className="text-gray-400 ml-1">
                                        ({pe.method})
                                      </span>
                                    )}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                          {/* 表型效果详情 */}
                          {phenotypeData && phenotypeData.length > 0 && (
                            <div className="mt-2">
                              <span className="font-medium text-gray-600 text-xs block mb-1.5">
                                表型效果详情
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {phenotypeData.map((ph, i) => {
                                  // 兼容 relational (foldChange) 和 JSON (fold_change) 两种字段名
                                  const fc = String(
                                    (ph as Record<string, unknown>).foldChange ??
                                    (ph as Record<string, unknown>).fold_change ??
                                    ""
                                  );
                                  return (
                                  <span
                                    key={i}
                                    className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] ${
                                      ph.direction === "up"
                                        ? "bg-green-50 text-green-700"
                                        : ph.direction === "down"
                                        ? "bg-red-50 text-red-700"
                                        : "bg-gray-100 text-gray-500"
                                    }`}
                                  >
                                    {ph.phenotype}
                                    <span className="font-bold">
                                      {directionArrow(ph.direction)}
                                    </span>
                                    {fc && (
                                      <span className="text-gray-400 ml-1">
                                        FC: {fc}
                                      </span>
                                    )}
                                  </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
