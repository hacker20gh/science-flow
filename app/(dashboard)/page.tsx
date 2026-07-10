"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { Plus, BookOpen, FlaskConical, Calendar, Microscope, Pencil, Trash2 } from "lucide-react";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  _count: { papers: number; experiments: number; timeline: number };
}

export default function HomePage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteProject, setDeleteProject] = useState<Project | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      setProjects(data.projects || []);
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), description: newDesc.trim() || null }),
      });
      const data = await res.json();
      if (data.project) {
        setProjects((prev) => [data.project, ...prev]);
        setShowCreate(false);
        setNewName("");
        setNewDesc("");
      }
    } catch {
      toast.error("创建失败", { description: "无法创建项目，请稍后重试" });
    } finally {
      setCreating(false);
    }
  }

  function openEdit(project: Project) {
    setEditProject(project);
    setEditName(project.name);
    setEditDesc(project.description ?? "");
  }

  async function handleSaveEdit() {
    if (!editProject || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${editProject.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null }),
      });
      const data = await res.json();
      if (data.project) {
        setProjects((prev) =>
          prev.map((p) => (p.id === editProject.id ? { ...p, name: data.project.name, description: data.project.description } : p))
        );
        setEditProject(null);
      } else {
        toast.error("保存失败", { description: data.error || "无法保存项目信息" });
      }
    } catch {
      toast.error("保存失败", { description: "网络错误，请检查连接后重试" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProject() {
    if (!deleteProject) return;
    try {
      const res = await fetch(`/api/projects/${deleteProject.id}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        setProjects((prev) => prev.filter((p) => p.id !== deleteProject.id));
        setDeleteProject(null);
      } else {
        toast.error("删除失败", { description: data.error || "无法删除项目" });
      }
    } catch {
      toast.error("删除失败", { description: "网络错误，请检查连接后重试" });
    }
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto bg-gray-50">
        <div className="p-8 max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold">我的项目</h1>
              <p className="text-gray-500 mt-1">管理你的科研课题</p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-all text-sm font-medium flex items-center gap-2"
            >
              <Plus size={16} />
              新建项目
            </button>
          </div>

          {/* 新建项目表单 */}
          {showCreate && (
            <div className="mb-6 p-6 bg-white rounded-xl border border-blue-200 shadow-sm">
              <h3 className="font-medium mb-4">新建项目</h3>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="项目名称（如：PD-1 耐药机制研究）"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm mb-3"
                autoFocus
              />
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="简要描述（可选）"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm mb-4"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || creating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? "创建中..." : "创建"}
                </button>
                <button
                  onClick={() => { setShowCreate(false); setNewName(""); setNewDesc(""); }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {/* 加载状态 */}
          {loading && (
            <div className="text-center py-12 text-gray-400">加载中...</div>
          )}

          {/* 项目列表 */}
          {!loading && projects.length === 0 && !showOnboarding && (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Microscope size={32} className="text-primary" />
              </div>
              <h3 className="text-lg font-medium text-gray-600 mb-2">还没有项目</h3>
              <p className="text-sm text-gray-400 mb-6">创建你的第一个科研项目，开始探索</p>
              <button
                onClick={() => setShowOnboarding(true)}
                className="px-6 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/90 transition-all flex items-center gap-2 mx-auto"
              >
                <Plus size={16} />
                新建项目
              </button>
            </div>
          )}

          {/* Onboarding 向导 */}
          {!loading && showOnboarding && (
            <OnboardingWizard onComplete={(id) => router.push(`/project/${id}`)} />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <div
                key={project.id}
                onClick={() => router.push(`/project/${project.id}`)}
                className="relative block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer group"
              >
                {/* 操作按钮 */}
                <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => { e.stopPropagation(); openEdit(project); }}
                    className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    title="编辑项目"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteProject(project); }}
                    className="p-1.5 rounded-md text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    title="删除项目"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <h2 className="font-semibold text-lg mb-2 line-clamp-1 pr-12">{project.name}</h2>
                {project.description && (
                  <p className="text-sm text-gray-500 mb-4 line-clamp-2">{project.description}</p>
                )}
                <div className="flex gap-4 text-xs text-gray-400 mt-4">
                  <span className="flex items-center gap-1"><BookOpen size={12} /> {project._count?.papers ?? 0} 篇文献</span>
                  <span className="flex items-center gap-1"><FlaskConical size={12} /> {project._count?.experiments ?? 0} 个实验</span>
                  <span className="flex items-center gap-1"><Calendar size={12} /> {project._count?.timeline ?? 0} 条记录</span>
                </div>
                <div className="mt-3 text-xs text-gray-400">
                  创建于 {new Date(project.createdAt).toLocaleDateString("zh-CN")}
                </div>
              </div>
            ))}

            {/* 空状态占位 */}
            {projects.length > 0 && (
              <button
                onClick={() => setShowCreate(true)}
                className="p-6 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-primary/30 hover:text-primary cursor-pointer transition-all"
              >
                <Plus size={24} />
                <div className="text-sm font-medium mt-2">新建项目</div>
              </button>
            )}
          </div>
        </div>
      </main>

      {/* 编辑项目弹窗 */}
      {editProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditProject(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
            <h3 className="text-lg font-semibold mb-4">编辑项目</h3>
            <label className="block text-sm font-medium text-gray-700 mb-1">项目名称</label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm mb-3"
              autoFocus
            />
            <label className="block text-sm font-medium text-gray-700 mb-1">研究方向</label>
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm mb-4 resize-none"
              placeholder="简要描述（可选）"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditProject(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={!editName.trim() || saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteProject(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold mb-2">确定删除「{deleteProject.name}」？</h3>
            <p className="text-sm text-gray-500 mb-6">此操作不可撤销，项目中的所有文献、实验、假设都将被删除。</p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteProject(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleDeleteProject}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
