"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";

interface Paper {
  id: string;
  title: string;
  authors: string[];
  journal: string | null;
  year: number | null;
  source: string | null;
  createdAt: string;
  extractions: { id: string }[];
}

export default function PapersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/papers`)
      .then((r) => r.json())
      .then((d) => setPapers(d.papers || []))
      .catch(() => setPapers([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">📖 文献管理</h1>
          <p className="text-gray-500 mt-1">
            {papers.length > 0 ? `共 ${papers.length} 篇文献` : "管理项目中的所有文献"}
          </p>
        </div>
        <Link
          href={`/project/${projectId}/papers/search`}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          🔍 搜索新文献
        </Link>
      </div>

      {loading && (
        <div className="text-center py-12 text-gray-400">加载中...</div>
      )}

      {!loading && papers.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="text-center text-gray-400 py-8">
            <div className="text-3xl mb-2">📚</div>
            <p className="text-sm">还没有添加文献</p>
            <p className="text-xs mt-1">点击上方"搜索新文献"开始</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {papers.map((paper) => (
          <div
            key={paper.id}
            className="bg-white border border-gray-200 rounded-xl p-5 hover:border-blue-200 transition-colors"
          >
            <h3 className="font-medium text-sm leading-snug">{paper.title}</h3>
            <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
              {paper.authors.length > 0 && (
                <span>{paper.authors.slice(0, 3).join(", ")}{paper.authors.length > 3 ? " et al." : ""}</span>
              )}
              {paper.journal && <span className="text-gray-400">{paper.journal}</span>}
              {paper.year && <span className="text-gray-400">({paper.year})</span>}
            </div>
            <div className="flex items-center gap-4 mt-3">
              {paper.source && (
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">{paper.source}</span>
              )}
              {paper.extractions.length > 0 && (
                <span className="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded">
                  ✓ {paper.extractions.length} 条提取
                </span>
              )}
              <span className="text-xs text-gray-400 ml-auto">
                {new Date(paper.createdAt).toLocaleDateString("zh-CN")}
              </span>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
