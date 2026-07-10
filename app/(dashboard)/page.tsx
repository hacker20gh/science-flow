"use client";

import Link from "next/link";
import { useState, useEffect } from "react";
import { Sidebar } from "@/components/layout/sidebar";

interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  _count: { papers: number; experiments: number; timeline: number };
}

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    try {
      const res = await fetch("/api/projects");
      const data = await res.json();
      if (data.projects && data.projects.length > 0) {
        setProjects(data.projects);
      } else {
        // 数据库未配置或无项目时，展示 demo 数据
        setProjects([
          {
            id: "demo",
            name: "PD-1 耐药机制在肝癌中的研究",
            description: "探索 sorafenib 联合 PD-1 抗体在肝癌中的耐药机制",
            createdAt: new Date().toISOString(),
            _count: { papers: 15, experiments: 3, timeline: 8 },
          },
        ]);
      }
    } catch {
      // API 不可用（数据库未配置），展示 demo 数据
      setProjects([
        {
          id: "demo",
          name: "PD-1 耐药机制在肝癌中的研究",
          description: "探索 sorafenib 联合 PD-1 抗体在肝癌中的耐药机制",
          createdAt: new Date().toISOString(),
          _count: { papers: 15, experiments: 3, timeline: 8 },
        },
      ]);
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
      alert("创建失败");
    } finally {
      setCreating(false);
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
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              + 新建项目
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
          {!loading && projects.length === 0 && (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🔬</div>
              <h3 className="text-lg font-medium text-gray-600 mb-2">还没有项目</h3>
              <p className="text-sm text-gray-400 mb-6">创建你的第一个科研项目，开始探索</p>
              <button
                onClick={() => setShowCreate(true)}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
              >
                + 新建项目
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => (
              <Link
                key={project.id}
                href={`/project/${project.id}`}
                className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
              >
                <h2 className="font-semibold text-lg mb-2 line-clamp-1">{project.name}</h2>
                {project.description && (
                  <p className="text-sm text-gray-500 mb-4 line-clamp-2">{project.description}</p>
                )}
                <div className="flex gap-4 text-xs text-gray-400">
                  <span>📖 {project._count.papers} 篇文献</span>
                  <span>🧪 {project._count.experiments} 个实验</span>
                  <span>📅 {project._count.timeline} 条记录</span>
                </div>
                <div className="mt-3 text-xs text-gray-400">
                  创建于 {new Date(project.createdAt).toLocaleDateString("zh-CN")}
                </div>
              </Link>
            ))}

            {/* 空状态占位 */}
            {projects.length > 0 && (
              <button
                onClick={() => setShowCreate(true)}
                className="p-6 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center justify-center text-gray-400 hover:border-blue-300 hover:text-blue-500 cursor-pointer transition-colors"
              >
                <div className="text-3xl mb-2">+</div>
                <div className="text-sm font-medium">新建项目</div>
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
