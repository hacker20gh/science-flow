"use client";

import Link from "next/link";
import { useState, useEffect } from "react";

interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  papers: { id: string }[];
  experiments: { id: string }[];
  hypotheses: { id: string }[];
  manuscripts: { id: string }[];
  timeline: { id: string }[];
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const [projectId, setProjectId] = useState<string>("");
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then((p) => {
      setProjectId(p.projectId);
      fetchProject(p.projectId);
    });
  }, [params]);

  async function fetchProject(id: string) {
    try {
      const res = await fetch(`/api/projects/${id}`);
      const data = await res.json();
      if (data.project) {
        setProject(data.project);
      } else {
        // 数据库未配置，使用 demo 数据
        setProject({
          id,
          name: "PD-1 耐药机制在肝癌中的研究",
          description: "探索 sorafenib 联合 PD-1 抗体在肝癌中的耐药机制",
          papers: Array.from({ length: 15 }, (_, i) => ({ id: `p${i}` })),
          experiments: Array.from({ length: 3 }, (_, i) => ({ id: `e${i}` })),
          hypotheses: Array.from({ length: 2 }, (_, i) => ({ id: `h${i}` })),
          manuscripts: [{ id: "m1" }],
          timeline: Array.from({ length: 8 }, (_, i) => ({ id: `t${i}` })),
        });
      }
    } catch {
      setProject({
        id,
        name: "PD-1 耐药机制在肝癌中的研究",
        description: "探索 sorafenib 联合 PD-1 抗体在肝癌中的耐药机制",
        papers: Array.from({ length: 15 }, (_, i) => ({ id: `p${i}` })),
        experiments: Array.from({ length: 3 }, (_, i) => ({ id: `e${i}` })),
        hypotheses: Array.from({ length: 2 }, (_, i) => ({ id: `h${i}` })),
        manuscripts: [{ id: "m1" }],
        timeline: Array.from({ length: 8 }, (_, i) => ({ id: `t${i}` })),
      });
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <main className="p-8 max-w-6xl mx-auto">
        <div className="text-gray-400">加载中...</div>
      </main>
    );
  }

  if (!project) {
    return (
      <main className="p-8 max-w-6xl mx-auto">
        <div className="text-center py-16">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="text-lg font-medium text-gray-600 mb-2">项目不存在</h3>
          <Link href="/" className="text-sm text-blue-600 hover:underline">返回项目列表</Link>
        </div>
      </main>
    );
  }

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        {project.description && (
          <p className="text-gray-500 mt-1">{project.description}</p>
        )}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <div className="text-2xl font-bold text-blue-600">{project.papers.length}</div>
          <div className="text-sm text-gray-500">篇文献</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <div className="text-2xl font-bold text-green-600">{project.experiments.length}</div>
          <div className="text-sm text-gray-500">个实验</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <div className="text-2xl font-bold text-amber-600">{project.hypotheses.length}</div>
          <div className="text-sm text-gray-500">个假设</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200">
          <div className="text-2xl font-bold text-purple-600">{project.manuscripts.length}</div>
          <div className="text-sm text-gray-500">篇草稿</div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href={`/project/${projectId}/papers`}
          className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
        >
          <div className="text-2xl mb-2">📖</div>
          <h3 className="font-semibold">文献管理</h3>
          <p className="text-sm text-gray-500 mt-1">搜索、添加和提取文献信息</p>
        </Link>

        <Link
          href={`/project/${projectId}/brain`}
          className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
        >
          <div className="text-2xl mb-2">🧠</div>
          <h3 className="font-semibold">知识面板</h3>
          <p className="text-sm text-gray-500 mt-1">查看机制矩阵、假设状态、待办清单</p>
        </Link>

        <Link
          href={`/project/${projectId}/experiments`}
          className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
        >
          <div className="text-2xl mb-2">🧪</div>
          <h3 className="font-semibold">设计实验</h3>
          <p className="text-sm text-gray-500 mt-1">基于文献发现设计验证实验</p>
        </Link>
      </div>
    </main>
  );
}
