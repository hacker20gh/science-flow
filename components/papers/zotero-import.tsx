"use client";

import { useState, useEffect, useCallback } from "react";

interface ZoteroPaper {
  zoteroKey: string;
  title: string;
  authors: string[];
  journal?: string;
  year?: number;
  doi?: string;
  abstract?: string;
}

interface ZoteroImportProps {
  projectId: string;
  onClose: () => void;
  onImported: () => void;
}

export default function ZoteroImport({ projectId, onClose, onImported }: ZoteroImportProps) {
  const [configured, setConfigured] = useState(true);
  const [items, setItems] = useState<ZoteroPaper[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  const loadItems = useCallback(async (q?: string, start?: number) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(pageSize), start: String(start || 0) });
      if (q) params.set("q", q);
      const resp = await fetch(`/api/zotero?${params}`);
      const data = await resp.json();
      if (!data.configured) {
        setConfigured(false);
        return;
      }
      if (data.error) {
        setError(data.error);
        return;
      }
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError((err as Error)?.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleSearch = () => {
    setPage(0);
    loadItems(search, 0);
  };

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(items.map((i) => i.zoteroKey)));
    }
  };

  const handleImport = async () => {
    const selectedItems = items.filter((i) => selected.has(i.zoteroKey));
    if (!selectedItems.length) return;

    setImporting(true);
    try {
      const resp = await fetch("/api/zotero", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, items: selectedItems }),
      });
      const data = await resp.json();
      setImportResult(data);
      if (data.imported > 0) onImported();
    } catch (err) {
      setError((err as Error)?.message);
    } finally {
      setImporting(false);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  // 未配置 API Key
  if (!configured) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-semibold mb-4">📥 从 Zotero 导入</h3>
          <div className="text-center py-8">
            <div className="text-gray-300 text-3xl mb-3">🔑</div>
            <p className="text-sm text-gray-600 mb-2">请先在设置页面配置 Zotero API Key</p>
            <p className="text-xs text-gray-400">
              前往 <a href="/settings" className="text-blue-600 hover:underline">设置页面</a> → Zotero 集成 → 输入 API Key
            </p>
          </div>
          <button onClick={onClose} className="w-full py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">
            关闭
          </button>
        </div>
      </div>
    );
  }

  // 导入成功
  if (importResult) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-semibold mb-4">📥 导入完成</h3>
          <div className="text-center py-6">
            <div className="text-3xl mb-2">✅</div>
            <p className="text-sm">
              成功导入 <span className="font-bold text-green-600">{importResult.imported}</span> 篇
              {importResult.skipped > 0 && (
                <span className="text-gray-400 ml-2">（跳过 {importResult.skipped} 篇重复）</span>
              )}
            </p>
          </div>
          <button onClick={onClose} className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
            完成
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-lg font-semibold">📥 从 Zotero 导入</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100 flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="搜索文献..."
            className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-blue-400"
          />
          <button
            onClick={handleSearch}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            搜索
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-6 py-3">
          {loading ? (
            <div className="text-center py-12 text-gray-400 text-sm">加载 Zotero 文献库...</div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-sm text-red-500 mb-2">{error}</p>
              <button onClick={() => loadItems()} className="text-xs text-blue-600 hover:underline">重试</button>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">未找到文献</div>
          ) : (
            <>
              {/* Select all */}
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.size === items.length && items.length > 0}
                    onChange={toggleAll}
                    className="rounded"
                  />
                  全选 ({selected.size}/{items.length})
                </label>
                <span className="text-xs text-gray-400">共 {total} 篇</span>
              </div>

              {/* Items */}
              <div className="space-y-2">
                {items.map((item) => (
                  <label
                    key={item.zoteroKey}
                    className={`block p-3 rounded-lg border cursor-pointer transition-colors ${
                      selected.has(item.zoteroKey)
                        ? "border-blue-300 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selected.has(item.zoteroKey)}
                        onChange={() => toggleSelect(item.zoteroKey)}
                        className="mt-1 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-800 line-clamp-2">{item.title}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {item.authors.slice(0, 3).join(", ")}
                          {item.authors.length > 3 && ` 等 ${item.authors.length} 人`}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {item.journal && <span>{item.journal}</span>}
                          {item.year && <span> · {item.year}</span>}
                          {item.doi && <span className="ml-1 text-blue-400">DOI</span>}
                        </div>
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-gray-100">
                  <button
                    disabled={page === 0}
                    onClick={() => { setPage(page - 1); loadItems(search, (page - 1) * pageSize); }}
                    className="px-3 py-1 text-xs rounded border disabled:opacity-40"
                  >
                    上一页
                  </button>
                  <span className="text-xs text-gray-400">{page + 1} / {totalPages}</span>
                  <button
                    disabled={page >= totalPages - 1}
                    onClick={() => { setPage(page + 1); loadItems(search, (page + 1) * pageSize); }}
                    className="px-3 py-1 text-xs rounded border disabled:opacity-40"
                  >
                    下一页
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            取消
          </button>
          <button
            onClick={handleImport}
            disabled={selected.size === 0 || importing}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing ? "导入中..." : `导入选中的 ${selected.size} 篇`}
          </button>
        </div>
      </div>
    </div>
  );
}
