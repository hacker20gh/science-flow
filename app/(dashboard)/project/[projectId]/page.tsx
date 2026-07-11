"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";
import {
  BookOpen,
  FlaskConical,
  Lightbulb,
  FileText,
  Search,
  Brain,
  TestTube,
  Pencil,
  AlertTriangle,
  Info,
  Clock,
  ArrowRight,
  TrendingUp,
  Zap,
} from "lucide-react";
import { ProjectHealthCheck } from "@/components/project/health-check";
import { WorkflowProgress } from "@/components/project/workflow-progress";
import { generateInsights } from "@/lib/workflow/rules";
import type { ProactiveInsight } from "@/lib/workflow/event-bus";
import { toast } from "sonner";

interface ProjectData {
  id: string;
  name: string;
  description: string | null;
  papers: { id: string }[];
  experiments: { id: string }[];
  hypotheses: { id: string }[];
  manuscripts: { id: string }[];
  timeline: { id: string; createdAt: string }[];
}

export default function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const [projectId, setProjectId] = useState<string>("");
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [saving, setSaving] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<
    { id: string; type: string; title: string; createdAt: string }[]
  >([]);

  useEffect(() => {
    params.then((p) => {
      setProjectId(p.projectId);
      fetchProject(p.projectId);
    });
  }, [params]);

  // Fetch timeline events
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/timeline`)
      .then((res) => res.json())
      .then((data) => {
        if (data.events) setTimelineEvents(data.events.slice(0, 10));
      })
      .catch(() => {});
  }, [projectId]);

  // Compute insights from project data
  const insights = useMemo<ProactiveInsight[]>(() => {
    if (!project) return [];
    const totalExtractions = project.papers.reduce(
      (sum, p) => sum + ((p as { _count?: { extractions: number } })._count?.extractions || 0),
      0
    );
    const lastEvent = project.timeline?.[0];
    const lastActivityDays = lastEvent
      ? Math.floor(
          (Date.now() - new Date(lastEvent.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        )
      : null;
    return generateInsights({
      paperCount: project.papers.length,
      extractionCount: totalExtractions,
      conflictCount: 0,
      hypothesisCount: project.hypotheses.length,
      pendingHypotheses: project.hypotheses.length,
      experimentCount: project.experiments.length,
      todoCount: 0,
      pendingTodos: 0,
      lastActivityDays,
    });
  }, [project]);

  // Health metrics
  const healthMetrics = useMemo(() => {
    if (!project) return [];
    const paperCount = project.papers.length;
    const totalExtractions = project.papers.reduce(
      (sum, p) => sum + ((p as { _count?: { extractions: number } })._count?.extractions || 0),
      0
    );
    const coverage = Math.min(100, Math.round((paperCount / 10) * 100));
    const completeness = paperCount > 0 ? Math.min(100, Math.round((totalExtractions / paperCount) * 100)) : 0;
    const hypothesisVerified = project.hypotheses.length > 0 ? 100 : 0;
    const experimentDesign = project.experiments.length > 0 ? 100 : 0;
    return [
      { label: "文献覆盖", value: coverage, color: coverage >= 70 ? "blue" : coverage >= 30 ? "amber" : "red" },
      { label: "数据完整性", value: completeness, color: completeness >= 70 ? "green" : completeness >= 30 ? "amber" : "red" },
      { label: "假设验证", value: hypothesisVerified, color: hypothesisVerified >= 70 ? "purple" : "gray" },
      { label: "实验设计", value: experimentDesign, color: experimentDesign >= 70 ? "emerald" : "gray" },
    ];
  }, [project]);

  function relativeTime(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    return `${days} 天前`;
  }

  async function fetchProject(id: string) {
    try {
      const res = await fetch(`/api/projects/${id}`);
      const data = await res.json();
      if (data.project) {
        setProject(data.project);
      } else {
        setProject(null);
      }
    } catch {
      setProject(null);
    } finally {
      setLoading(false);
    }
  }

  function openEdit() {
    if (!project) return;
    setEditName(project.name);
    setEditDesc(project.description ?? "");
    setShowEdit(true);
  }

  async function handleSaveEdit() {
    if (!project || !editName.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim(), description: editDesc.trim() || null }),
      });
      const data = await res.json();
      if (data.project) {
        setProject((prev) => (prev ? { ...prev, name: data.project.name, description: data.project.description } : prev));
        setShowEdit(false);
      } else {
        toast.error("保存失败", { description: data.error || "无法保存项目信息" });
      }
    } catch {
      toast.error("保存失败", { description: "网络错误，请检查连接后重试" });
    } finally {
      setSaving(false);
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

  const extractionCount = project.papers.reduce(
    (sum, p) => sum + ((p as { _count?: { extractions: number } })._count?.extractions || 0),
    0
  );

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <div className="flex items-start gap-3">
          <h1 className="text-2xl font-bold">{project.name}</h1>
          <button
            onClick={openEdit}
            className="mt-1 p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
            title="编辑项目"
          >
            <Pencil size={16} />
          </button>
        </div>
        {project.description && (
          <p className="text-gray-500 mt-1">{project.description}</p>
        )}
      </div>

      {/* 工作流进度条 */}
      <div className="mb-8">
        <WorkflowProgress
          paperCount={project.papers.length}
          extractionCount={extractionCount}
          hasHypothesis={project.hypotheses.length > 0}
          experimentCount={project.experiments.length}
          manuscriptCount={project.manuscripts.length}
          projectId={projectId}
        />
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white p-4 rounded-xl border border-gray-200 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
            <BookOpen size={20} className="text-blue-600" />
          </div>
          <div>
            <div className="text-xl font-bold text-blue-600">{project.papers.length}</div>
            <div className="text-xs text-gray-500">篇文献</div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
            <FlaskConical size={20} className="text-green-600" />
          </div>
          <div>
            <div className="text-xl font-bold text-green-600">{project.experiments.length}</div>
            <div className="text-xs text-gray-500">个实验</div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
            <Lightbulb size={20} className="text-amber-600" />
          </div>
          <div>
            <div className="text-xl font-bold text-amber-600">{project.hypotheses.length}</div>
            <div className="text-xs text-gray-500">个假设</div>
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
            <FileText size={20} className="text-purple-600" />
          </div>
          <div>
            <div className="text-xl font-bold text-purple-600">{project.manuscripts.length}</div>
            <div className="text-xs text-gray-500">篇草稿</div>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href={`/project/${projectId}/papers`}
          className="group block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
            <Search size={20} className="text-blue-600" />
          </div>
          <h3 className="font-semibold">文献管理</h3>
          <p className="text-sm text-gray-500 mt-1">搜索、添加和提取文献信息</p>
        </Link>

        <Link
          href={`/project/${projectId}/brain`}
          className="group block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center mb-3 group-hover:bg-purple-100 transition-colors">
            <Brain size={20} className="text-purple-600" />
          </div>
          <h3 className="font-semibold">知识面板</h3>
          <p className="text-sm text-gray-500 mt-1">查看机制矩阵、假设状态、待办清单</p>
        </Link>

        <Link
          href={`/project/${projectId}/experiments`}
          className="group block p-6 bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center mb-3 group-hover:bg-green-100 transition-colors">
            <TestTube size={20} className="text-green-600" />
          </div>
          <h3 className="font-semibold">设计实验</h3>
          <p className="text-sm text-gray-500 mt-1">基于文献发现设计验证实验</p>
        </Link>
      </div>

      {/* Next Steps / Insights */}
      {insights.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={18} className="text-amber-500" />
            <h2 className="text-lg font-semibold">下一步建议</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {insights.map((insight) => (
              <div
                key={insight.id}
                className={`p-4 rounded-xl border ${
                  insight.type === "warning"
                    ? "bg-amber-50 border-amber-200"
                    : insight.type === "suggestion"
                      ? "bg-blue-50 border-blue-200"
                      : "bg-gray-50 border-gray-200"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    {insight.type === "warning" ? (
                      <AlertTriangle size={16} className="text-amber-500" />
                    ) : insight.type === "suggestion" ? (
                      <Lightbulb size={16} className="text-blue-500" />
                    ) : (
                      <Info size={16} className="text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-medium">{insight.title}</h3>
                    <p className="text-xs text-gray-600 mt-1">{insight.description}</p>
                    {insight.action && (
                      <Link
                        href={`/project/${projectId}/${insight.action.href}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 mt-2"
                      >
                        {insight.action.label}
                        <ArrowRight size={12} />
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent Activity */}
      {timelineEvents.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <Clock size={18} className="text-gray-400" />
            <h2 className="text-lg font-semibold">最近活动</h2>
          </div>
          <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
            {timelineEvents.map((event) => (
              <div key={event.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <span className="text-sm text-gray-700 truncate flex-1">{event.title}</span>
                <span className="text-xs text-gray-400 shrink-0">{relativeTime(event.createdAt)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Project Health Metrics */}
      {healthMetrics.length > 0 && (
        <section className="mt-8">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-green-500" />
            <h2 className="text-lg font-semibold">项目进度指标</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {healthMetrics.map((metric) => {
              const barColor =
                metric.color === "blue"
                  ? "bg-blue-500"
                  : metric.color === "green"
                    ? "bg-green-500"
                    : metric.color === "purple"
                      ? "bg-purple-500"
                      : metric.color === "emerald"
                        ? "bg-emerald-500"
                        : metric.color === "amber"
                          ? "bg-amber-500"
                          : metric.color === "red"
                            ? "bg-red-500"
                            : "bg-gray-300";
              return (
                <div key={metric.label} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700">{metric.label}</span>
                    <span className="text-xs font-semibold text-gray-500">{metric.value}%</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${metric.value}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* 健康度检查 */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold mb-4">项目健康度</h2>
        <ProjectHealthCheck />
      </section>

      {/* 编辑项目弹窗 */}
      {showEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowEdit(false)} />
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
                onClick={() => setShowEdit(false)}
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
    </main>
  );
}
