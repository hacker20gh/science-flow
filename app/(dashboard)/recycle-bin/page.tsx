"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { RotateCcw, Trash2, BookOpen, FlaskConical, Calendar } from "lucide-react";

interface TrashProject {
  id: string;
  name: string;
  description: string | null;
  deletedAt: string;
  _count: { papers: number; experiments: number; timeline: number };
}

export default function RecycleBinPage() {
  const [projects, setProjects] = useState<TrashProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [permanentDeleteTarget, setPermanentDeleteTarget] = useState<TrashProject | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    fetchTrash();
  }, []);

  async function fetchTrash() {
    try {
      const res = await fetch("/api/projects/trash");
      const data = await res.json();
      setProjects(data.projects || []);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2500);
  }

  async function handleRestore(project: TrashProject) {
    try {
      const res = await fetch(`/api/projects/${project.id}/restore`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== project.id));
        showToast("success", `「${project.name}」已恢复`);
      } else {
        showToast("error", data.error || "恢复失败");
      }
    } catch {
      showToast("error", "恢复失败，请重试");
    }
  }

  async function handlePermanentDelete() {
    if (!permanentDeleteTarget) return;
    try {
      const res = await fetch(`/api/projects/${permanentDeleteTarget.id}/permanent-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const data = await res.json();
      if (data.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== permanentDeleteTarget.id));
        setPermanentDeleteTarget(null);
        showToast("success", "已永久删除");
      } else {
        showToast("error", data.error || "删除失败");
      }
    } catch {
      showToast("error", "删除失败，请重试");
    }
  }

  function formatDeletedAt(dateStr: string) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return "今天";
    if (diffDays === 1) return "昨天";
    if (diffDays < 30) return `${diffDays} 天前`;
    return date.toLocaleDateString("zh-CN");
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-8 max-w-6xl mx-auto">
          {/* Toast */}
          {toast && (
            <div
              className={`fixed top-6 right-6 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all ${
                toast.type === "success"
                  ? "bg-green-600 text-white"
                  : "bg-red-600 text-white"
              }`}
            >
              {toast.message}
            </div>
          )}

          <div className="mb-8">
            <h1 className="text-2xl font-bold">回收站</h1>
            <p className="text-gray-500 mt-1">已删除的项目会在这里保留 30 天</p>
          </div>

          {loading && (
            <div className="text-center py-12 text-gray-400">加载中...</div>
          )}

          {!loading && projects.length === 0 && (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} className="text-gray-400" />
              </div>
              <h3 className="text-lg font-medium text-gray-600 mb-2">回收站是空的</h3>
              <p className="text-sm text-gray-400">删除的项目会出现在这里</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                className="p-6 bg-white rounded-xl border border-gray-200 hover:border-gray-300 transition-all"
              >
                <h2 className="font-semibold text-lg mb-2 line-clamp-1 text-gray-600">
                  {project.name}
                </h2>
                {project.description && (
                  <p className="text-sm text-gray-400 mb-4 line-clamp-2">{project.description}</p>
                )}

                <div className="flex gap-4 text-xs text-gray-400 mb-4">
                  <span className="flex items-center gap-1">
                    <BookOpen size={12} /> {project._count?.papers ?? 0} 篇文献
                  </span>
                  <span className="flex items-center gap-1">
                    <FlaskConical size={12} /> {project._count?.experiments ?? 0} 个实验
                  </span>
                  <span className="flex items-center gap-1">
                    <Calendar size={12} /> {project._count?.timeline ?? 0} 条记录
                  </span>
                </div>

                <div className="text-xs text-gray-400 mb-4">
                  删除于 {formatDeletedAt(project.deletedAt)}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => handleRestore(project)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                  >
                    <RotateCcw size={14} />
                    恢复
                  </button>
                  <button
                    onClick={() => setPermanentDeleteTarget(project)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <Trash2 size={14} />
                    永久删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* 永久删除确认弹窗 */}
      {permanentDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPermanentDeleteTarget(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold mb-2">
              永久删除「{permanentDeleteTarget.name}」？
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              此操作不可撤销，项目中的所有文献、实验、假设都将被永久删除。
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPermanentDeleteTarget(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handlePermanentDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
              >
                确认永久删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
