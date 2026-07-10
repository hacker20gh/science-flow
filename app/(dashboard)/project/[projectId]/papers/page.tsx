"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { PdfUploader } from "@/components/papers/pdf-uploader";
import { Search, Upload, BookOpen, FileText, Check } from "lucide-react";

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
  const [tab, setTab] = useState<"list" | "upload">("list");

  useEffect(() => {
    fetch(`/api/projects/${projectId}/papers`)
      .then((r) => r.json())
      .then((d) => setPapers(d.papers || []))
      .catch(() => setPapers([]))
      .finally(() => setLoading(false));
  }, [projectId]);

  return (
    <main className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BookOpen size={24} />
            文献管理
          </h1>
          <p className="text-gray-500 mt-1">
            {papers.length > 0 ? `共 ${papers.length} 篇文献` : "管理项目中的所有文献"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/project/${projectId}/papers/search`}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all text-sm font-medium flex items-center gap-2"
          >
            <Search size={16} />
            搜索文献
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button
          onClick={() => setTab("list")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "list"
              ? "border-primary text-primary"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <BookOpen size={14} className="inline mr-1.5" />
          文献列表
        </button>
        <button
          onClick={() => setTab("upload")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "upload"
              ? "border-primary text-primary"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <Upload size={14} className="inline mr-1.5" />
          上传 PDF
        </button>
      </div>

      {/* Tab: 文献列表 */}
      {tab === "list" && (
        <>
          {loading && (
            <div className="text-center py-12 text-gray-400">加载中...</div>
          )}

          {!loading && papers.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <div className="text-center text-gray-400 py-8">
                <BookOpen size={40} className="mx-auto mb-3 text-gray-300" />
                <p className="text-sm">还没有添加文献</p>
                <p className="text-xs mt-1">搜索文献或上传本地 PDF 开始</p>
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
                    <span className={`text-xs px-2 py-0.5 rounded ${
                      paper.source === "local_upload"
                        ? "bg-purple-50 text-purple-600"
                        : "bg-gray-100 text-gray-500"
                    }`}>
                      {paper.source === "local_upload" ? "📄 本地上传" : paper.source}
                    </span>
                  )}
                  {paper.extractions.length > 0 && (
                    <span className="text-xs px-2 py-0.5 bg-green-50 text-green-600 rounded flex items-center gap-1">
                      <Check size={10} /> {paper.extractions.length} 条提取
                    </span>
                  )}
                  <span className="text-xs text-gray-400 ml-auto">
                    {new Date(paper.createdAt).toLocaleDateString("zh-CN")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Tab: 上传 PDF */}
      {tab === "upload" && (
        <div>
          <div className="mb-4 p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700">
            <p className="font-medium mb-1">本地 PDF 存储说明：</p>
            <p>PDF 文件保存在你电脑的 <code className="bg-blue-100 px-1 rounded">uploads/{projectId}/</code> 目录下</p>
            <p>数据库只存储标题/摘要/提取结果等轻量元数据</p>
          </div>
          <PdfUploader />
        </div>
      )}
    </main>
  );
}
