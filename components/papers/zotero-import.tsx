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

interface ZoteroCollection {
  key: string;
  name: string;
  parentCollection?: string;
  numItems: number;
}

interface ZoteroImportProps {
  projectId: string;
  onClose: () => void;
  onImported: () => void;
}

export default function ZoteroImport({ projectId, onClose, onImported }: ZoteroImportProps) {
  const [configured, setConfigured] = useState(true);
  const [collections, setCollections] = useState<ZoteroCollection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null); // null = 全部
  const [items, setItems] = useState<ZoteroPaper[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingCollections, setLoadingCollections] = useState(true);
  const [loadingItems, setLoadingItems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 25;

  // 加载 Collections
  useEffect(() => {
    setLoadingCollections(true);
    fetch("/api/zotero?mode=collections")
      .then((r) => r.json())
      .then((data) => {
        if (!data.configured) { setConfigured(false); return; }
        setCollections(data.collections || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingCollections(false));
  }, []);

  // 加载文献列表
  const loadItems = useCallback(async (opts?: { q?: string; start?: number; collectionKey?: string }) => {
    setLoadingItems(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        start: String(opts?.start || 0),
      });
      if (opts?.q) params.set("q", opts.q);
      if (opts?.collectionKey) params.set("collectionKey", opts.collectionKey);

      const resp = await fetch(`/api/zotero?${params}`);
      const data = await resp.json();
      if (data.error) { setError(data.error); return; }
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError((err as Error)?.message);
    } finally {
      setLoadingItems(false);
    }
  }, []);

  // 切换 Collection 时重新加载
  useEffect(() => {
    setPage(0);
    setSelected(new Set());
    loadItems({ collectionKey: selectedCollection || undefined });
  }, [selectedCollection, loadItems]);

  const handleSearch = () => {
    setPage(0);
    loadItems({ q: search, start: 0, collectionKey: selectedCollection || undefined });
  };

  const toggleSelect = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map((i) => i.zoteroKey)));
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

  // 构建树形结构（顶级 + 子库）
  const topLevel = collections.filter((c) => !c.parentCollection);
  const childrenOf = (parentKey: string) => collections.filter((c) => c.parentCollection === parentKey);
  const totalPages = Math.ceil(total / pageSize);

  const getCollectionLabel = () => {
    if (!selectedCollection) return "全部文献";
    const c = collections.find((c) => c.key === selectedCollection);
    return c?.name || "未知库";
  };

  // ===== 未配置 =====
  if (!configured) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()} role="dialog" aria-modal="true" tabIndex={-1}>
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
          <h3 className="text-lg font-semibold mb-4">📥 从 Zotero 导入</h3>
          <div className="text-center py-8">
            <div className="text-gray-300 text-3xl mb-3">🔑</div>
            <p className="text-sm text-gray-600 mb-2">请先在设置页面配置 Zotero API Key</p>
            <p className="text-xs text-gray-400">
              前往 <a href="/settings" className="text-blue-600 hover:underline">设置页面</a> → Zotero 集成
            </p>
          </div>
          <button onClick={onClose} className="w-full py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200">关闭</button>
        </div>
      </div>
    );
  }

  // ===== 导入成功 =====
  if (importResult) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()} role="dialog" aria-modal="true" tabIndex={-1}>
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
          <button onClick={onClose} className="w-full py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">完成</button>
        </div>
      </div>
    );
  }

  // ===== 主界面：左侧库列表 + 右侧文献列表 =====
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()} role="dialog" aria-modal="true" tabIndex={-1}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="text-lg font-semibold">📥 从 Zotero 导入</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex flex-1 overflow-hidden">

          {/* 左侧：库列表 */}
          <div className="w-56 border-r border-gray-100 overflow-y-auto shrink-0 bg-gray-50">
            <div className="p-3">
              <div className="text-[10px] font-medium text-gray-400 uppercase tracking-wider mb-2">文献库</div>

              {/* 全部文献 */}
              <button
                onClick={() => setSelectedCollection(null)}
                className={`w-full text-left px-3 py-2 rounded-lg text-xs mb-1 transition-colors ${
                  selectedCollection === null
                    ? "bg-blue-100 text-blue-700 font-medium"
                    : "text-gray-600 hover:bg-gray-100"
                }`}
              >
                📚 全部文献
              </button>

              {/* Collections 树 */}
              {loadingCollections ? (
                <div className="text-xs text-gray-400 py-4 text-center">加载中...</div>
              ) : (
                topLevel.map((col) => (
                  <div key={col.key}>
                    <button
                      onClick={() => setSelectedCollection(col.key)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                        selectedCollection === col.key
                          ? "bg-blue-100 text-blue-700 font-medium"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      <span className="truncate">📁 {col.name}</span>
                    </button>
                    {/* 子库 */}
                    {childrenOf(col.key).map((child) => (
                      <button
                        key={child.key}
                        onClick={() => setSelectedCollection(child.key)}
                        className={`w-full text-left pl-7 pr-3 py-1.5 rounded-lg text-[11px] transition-colors ${
                          selectedCollection === child.key
                            ? "bg-blue-50 text-blue-600 font-medium"
                            : "text-gray-500 hover:bg-gray-100"
                        }`}
                      >
                        <span className="truncate">↳ {child.name}</span>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* 右侧：文献列表 */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* 搜索 + 当前库名 */}
            <div className="px-4 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-gray-500">{getCollectionLabel()}</span>
                <span className="text-[10px] text-gray-400">· {total} 篇</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  placeholder="搜索标题、作者..."
                  className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs focus:outline-none focus:border-blue-400"
                />
                <button onClick={handleSearch} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs hover:bg-blue-700">
                  搜索
                </button>
              </div>
            </div>

            {/* 文献列表 */}
            <div className="flex-1 overflow-y-auto px-4 py-3">
              {loadingItems ? (
                <div className="text-center py-12 text-gray-400 text-xs">加载文献...</div>
              ) : error ? (
                <div className="text-center py-12">
                  <p className="text-xs text-red-500 mb-2">{error}</p>
                  <button onClick={() => loadItems()} className="text-xs text-blue-600 hover:underline">重试</button>
                </div>
              ) : items.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-xs">此库中没有文献</div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer">
                      <input type="checkbox" checked={selected.size === items.length && items.length > 0} onChange={toggleAll} className="rounded" />
                      全选 ({selected.size}/{items.length})
                    </label>
                  </div>

                  <div className="space-y-1.5">
                    {items.map((item) => (
                      <label
                        key={item.zoteroKey}
                        className={`block p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          selected.has(item.zoteroKey) ? "border-blue-300 bg-blue-50" : "border-gray-100 hover:border-gray-200"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <input type="checkbox" checked={selected.has(item.zoteroKey)} onChange={() => toggleSelect(item.zoteroKey)} className="mt-0.5 rounded" />
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-medium text-gray-800 line-clamp-2">{item.title}</div>
                            <div className="text-[10px] text-gray-500 mt-0.5">
                              {item.authors.slice(0, 3).join(", ")}{item.authors.length > 3 && ` 等 ${item.authors.length} 人`}
                            </div>
                            <div className="text-[10px] text-gray-400 mt-0.5">
                              {item.journal && <span>{item.journal}</span>}{item.year && <span> · {item.year}</span>}
                              {item.doi && <span className="ml-1 text-blue-400">DOI</span>}
                            </div>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* 分页 */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-4 pt-3 border-t border-gray-100">
                      <button disabled={page === 0} onClick={() => { setPage(page - 1); loadItems({ start: (page - 1) * pageSize, collectionKey: selectedCollection || undefined, q: search || undefined }); }} className="px-3 py-1 text-xs rounded border disabled:opacity-40">上一页</button>
                      <span className="text-xs text-gray-400">{page + 1} / {totalPages}</span>
                      <button disabled={page >= totalPages - 1} onClick={() => { setPage(page + 1); loadItems({ start: (page + 1) * pageSize, collectionKey: selectedCollection || undefined, q: search || undefined }); }} className="px-3 py-1 text-xs rounded border disabled:opacity-40">下一页</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">取消</button>
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
