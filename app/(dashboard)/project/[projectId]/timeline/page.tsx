"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Plus } from "lucide-react";
import { Timeline } from "@/components/timeline/timeline";
import { TimelineSkeleton } from "@/components/skeletons";
import type { TimelineEvent, TimelineEventType } from "@/lib/timeline/events";
import { cachedFetch } from "@/lib/api-cache";

// 本地 demo 数据 — 仅当 DB 为空时显示，不影响其他项目
const DEMO_EVENTS: TimelineEvent[] = [
  {
    id: "demo-1",
    type: "literature",
    title: "搜索文献",
    description: "这是示例数据 — 真实项目中搜索文献后会自动生成事件",
    timestamp: Date.now(),
  },
];

export default function TimelinePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const [dbEvents, setDbEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDemo, setShowDemo] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newEvent, setNewEvent] = useState({ type: "pivot" as TimelineEventType, title: "", description: "" });

  // 加载事件列表（使用缓存，sidebar 预取后秒级返回）
  const loadEvents = useCallback(async () => {
    try {
      const d = await cachedFetch<{ events: Record<string, unknown>[] }>(
        `/api/projects/${projectId}/timeline?pageSize=50`
      );
      if (d.events && d.events.length > 0) {
        setDbEvents(
          d.events.map((e) => ({
            id: e.id as string,
            type: e.type as TimelineEvent["type"],
            title: e.title as string,
            description: ((e.content as Record<string, unknown>)?.description as string) || "",
            timestamp: new Date(e.createdAt as string).getTime(),
            content: e.content as Record<string, unknown> | undefined,
            metadata: e.metadata as Record<string, unknown> | undefined,
          }))
        );
        setShowDemo(false);
      } else {
        setShowDemo(true);
      }
    } catch {
      setShowDemo(true);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // 提交新事件
  const handleAddEvent = async () => {
    if (!newEvent.title.trim()) return;
    try {
      await fetch(`/api/projects/${projectId}/timeline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: newEvent.type,
          title: newEvent.title,
          content: { description: newEvent.description },
        }),
      });
      setShowAddDialog(false);
      setNewEvent({ type: "pivot", title: "", description: "" });
      // 重新加载事件列表
      setLoading(true);
      await loadEvents();
    } catch {
      // 静默处理错误
    }
  };

  const events = dbEvents.length > 0 ? dbEvents : (showDemo ? DEMO_EVENTS : []);

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">📅 时间线</h1>
          <p className="text-gray-500 text-sm">
            项目的所有事件——搜索、提取、实验、转向，包括失败
          </p>
        </div>
        <button
          onClick={() => setShowAddDialog(true)}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-1"
        >
          <Plus size={14} /> 记录事件
        </button>
      </div>

      {showDemo && dbEvents.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-700">
          📋 当前显示的是示例数据。项目中的真实事件会替换这里。
        </div>
      )}

      {loading && (
        <div className="p-8"><TimelineSkeleton /></div>
      )}

      {!loading && <Timeline events={events} projectId={projectId} />}

      {/* 新建事件对话框 */}
      {showAddDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="font-semibold mb-4">记录事件</h3>
            <select
              value={newEvent.type}
              onChange={(e) => setNewEvent(prev => ({ ...prev, type: e.target.value as TimelineEventType }))}
              className="w-full px-3 py-2 border rounded-lg mb-3 text-sm"
            >
              <option value="pivot">🔀 方向调整</option>
              <option value="hypothesis">💡 假设提出</option>
              <option value="experiment_design">🧪 实验设计</option>
              <option value="experiment_completed">✅ 实验完成</option>
              <option value="experiment_failed">⚠️ 实验失败</option>
              <option value="literature">📖 文献操作</option>
              <option value="extraction">🔬 信息提取</option>
              <option value="data_upload">📊 数据上传</option>
              <option value="matrix_updated">📊 矩阵更新</option>
              <option value="manuscript">📝 论文操作</option>
              <option value="ai_chat">🤖 AI 对话</option>
              <option value="note">📋 笔记</option>
            </select>
            <input
              type="text"
              placeholder="事件标题"
              value={newEvent.title}
              onChange={(e) => setNewEvent(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg mb-3 text-sm"
            />
            <textarea
              placeholder="详细描述（可选）"
              value={newEvent.description}
              onChange={(e) => setNewEvent(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg mb-4 text-sm h-20"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddDialog(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={handleAddEvent}
                disabled={!newEvent.title.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                添加
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
