"use client";

import { useState } from "react";

interface SearchFormProps {
  onSearch: (query: string, options: SearchOptions) => void;
  isLoading: boolean;
}

interface SearchOptions {
  maxResults: number;
  minYear: number | null;
  minCitationCount: number | null;
}

export function SearchForm({ onSearch, isLoading }: SearchFormProps) {
  const [query, setQuery] = useState("");
  const [maxResults, setMaxResults] = useState(20);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [minYear, setMinYear] = useState<string>("");
  const [minCitation, setMinCitation] = useState<string>("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    onSearch(query, {
      maxResults,
      minYear: minYear ? parseInt(minYear) : null,
      minCitationCount: minCitation ? parseInt(minCitation) : null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 主搜索框 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="输入研究问题，如：sorafenib 联合 PD-1 在肝癌中的耐药机制"
          className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        >
          {isLoading ? "搜索中..." : "🔍 搜索文献"}
        </button>
      </div>

      {/* 高级筛选 */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          {showAdvanced ? "收起筛选" : "高级筛选 ▾"}
        </button>

        {showAdvanced && (
          <div className="mt-3 flex gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">最大结果数</span>
              <select
                value={maxResults}
                onChange={(e) => setMaxResults(parseInt(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 text-sm"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">最近</span>
              <input
                type="number"
                value={minYear}
                onChange={(e) => setMinYear(e.target.value)}
                placeholder="2020"
                min={1900}
                max={2026}
                className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
              />
              <span className="text-gray-600">年至今</span>
            </label>

            <label className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">最低引用</span>
              <input
                type="number"
                value={minCitation}
                onChange={(e) => setMinCitation(e.target.value)}
                placeholder="5"
                min={0}
                className="w-20 border border-gray-300 rounded px-2 py-1 text-sm"
              />
            </label>
          </div>
        )}
      </div>
    </form>
  );
}
