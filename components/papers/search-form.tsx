"use client";

import { useState } from "react";

interface SearchFormProps {
  onSearch: (query: string, options: SearchOptions) => void;
  isLoading: boolean;
}

export interface SearchOptions {
  maxResults: number;
  minYear: number | null;
  maxYear: number | null;
  minCitationCount: number | null;
  sortBy: "relevance" | "citation" | "date" | "impact";
  articleTypes: string[];
  onlyOpenAccess: boolean;
}

const ARTICLE_TYPES = [
  { id: "journal-article", label: "研究论文" },
  { id: "review", label: "综述" },
  { id: "case-reports", label: "病例报告" },
  { id: "editorial", label: "社论" },
];

const YEAR_OPTIONS = [
  { label: "最近 3 年", value: 3 },
  { label: "最近 5 年", value: 5 },
  { label: "最近 10 年", value: 10 },
  { label: "不限", value: 0 },
];

const CITATION_OPTIONS = [
  { label: "不限", value: null as number | null },
  { label: "≥10", value: 10 },
  { label: "≥50", value: 50 },
  { label: "≥100", value: 100 },
];

const SORT_OPTIONS = [
  { label: "相关性", value: "relevance" as const },
  { label: "引用量", value: "citation" as const },
  { label: "发表时间", value: "date" as const },
  { label: "影响因子", value: "impact" as const },
];

export function SearchForm({ onSearch, isLoading }: SearchFormProps) {
  const [query, setQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  // Filters
  const [yearOption, setYearOption] = useState<number>(5); // 默认最近5年
  const [customYear, setCustomYear] = useState<string>("5");
  const [useCustomYear, setUseCustomYear] = useState(false);
  const [citationOption, setCitationOption] = useState<number | null>(null);
  const [customCitation, setCustomCitation] = useState<string>("");
  const [useCustomCitation, setUseCustomCitation] = useState(false);
  const [articleTypes, setArticleTypes] = useState<Set<string>>(
    new Set(["journal-article", "review"])
  );
  const [sortBy, setSortBy] = useState<SearchOptions["sortBy"]>("relevance");
  const [maxResults, setMaxResults] = useState(20);
  const [onlyOpenAccess, setOnlyOpenAccess] = useState(false);

  function toggleArticleType(type: string) {
    setArticleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    const years = useCustomYear ? parseInt(customYear) || 0 : yearOption;
    const citations = useCustomCitation
      ? parseInt(customCitation) || null
      : citationOption;
    const minYear = years > 0 ? new Date().getFullYear() - years : null;

    onSearch(query, {
      maxResults,
      minYear,
      maxYear: null,
      minCitationCount: citations,
      sortBy,
      articleTypes: Array.from(articleTypes),
      onlyOpenAccess,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 搜索框 */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="描述你的研究问题，如：sorafenib 联合 PD-1 在肝癌中的耐药机制"
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium whitespace-nowrap"
          >
            {isLoading ? "搜索中..." : "🔍 搜索"}
          </button>
        </div>
        <p className="text-xs text-gray-400">
          💡 直接描述你的研究内容，系统会自动提取关键词并搜索多个数据库
        </p>
      </div>

      {/* 筛选开关 */}
      <button
        type="button"
        onClick={() => setShowFilters(!showFilters)}
        className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
      >
        {showFilters ? "收起筛选" : "高级筛选"}{" "}
        <span className="text-xs">{showFilters ? "▾" : "▸"}</span>
      </button>

      {/* 筛选面板 */}
      {showFilters && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-5">
          {/* 行1：文献类型 + 期刊水平 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 文献类型 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                文献类型
              </label>
              <div className="flex flex-wrap gap-2">
                {ARTICLE_TYPES.map((type) => (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => toggleArticleType(type.id)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      articleTypes.has(type.id)
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {type.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 排序方式 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                排序方式
              </label>
              <div className="flex flex-wrap gap-2">
                {SORT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSortBy(opt.value)}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      sortBy === opt.value
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 行2：时间范围 + 最低引用 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* 时间范围 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                时间范围
              </label>
              <div className="flex flex-wrap gap-2">
                {YEAR_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setYearOption(opt.value);
                      setUseCustomYear(false);
                    }}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      !useCustomYear && yearOption === opt.value
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">自定义</span>
                  <input
                    type="number"
                    value={customYear}
                    onChange={(e) => {
                      setCustomYear(e.target.value);
                      setUseCustomYear(true);
                    }}
                    onFocus={() => setUseCustomYear(true)}
                    min={1}
                    max={50}
                    className="w-16 px-2 py-1 text-xs border border-gray-300 rounded"
                    placeholder="N 年"
                  />
                  <span className="text-xs text-gray-500">年</span>
                </div>
              </div>
            </div>

            {/* 最低引用 */}
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                最低引用
              </label>
              <div className="flex flex-wrap gap-2">
                {CITATION_OPTIONS.map((opt) => (
                  <button
                    key={String(opt.value)}
                    type="button"
                    onClick={() => {
                      setCitationOption(opt.value);
                      setUseCustomCitation(false);
                    }}
                    className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${
                      !useCustomCitation && citationOption === opt.value
                        ? "bg-blue-50 border-blue-300 text-blue-700"
                        : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">自定义</span>
                  <input
                    type="number"
                    value={customCitation}
                    onChange={(e) => {
                      setCustomCitation(e.target.value);
                      setUseCustomCitation(true);
                    }}
                    onFocus={() => setUseCustomCitation(true)}
                    min={0}
                    className="w-16 px-2 py-1 text-xs border border-gray-300 rounded"
                    placeholder="N 次"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 行3：OA偏好 + 返回数量 */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyOpenAccess}
                onChange={(e) => setOnlyOpenAccess(e.target.checked)}
                className="rounded"
              />
              优先显示有 Open Access 全文的
            </label>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">返回数量</span>
              <select
                value={maxResults}
                onChange={(e) => setMaxResults(parseInt(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
