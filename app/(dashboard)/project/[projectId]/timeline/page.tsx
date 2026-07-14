"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Timeline } from "@/components/timeline/timeline";
import { TimelineSkeleton } from "@/components/skeletons";
import type { TimelineEvent } from "@/lib/timeline/events";

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

  useEffect(() => {
    fetch(`/api/projects/${projectId}/timeline`)
      .then((r) => r.json())
      .then((d) => {
        if (d.events && d.events.length > 0) {
          setDbEvents(
            d.events.map((e: Record<string, unknown>) => ({
              id: e.id as string,
              type: e.type as TimelineEvent["type"],
              title: e.title as string,
              description: ((e.content as Record<string, unknown>)?.description as string) || "",
              timestamp: new Date(e.createdAt as string),
              metadata: e.metadata as Record<string, unknown> | undefined,
            }))
          );
        } else {
          setShowDemo(true);
        }
      })
      .catch(() => setShowDemo(true))
      .finally(() => setLoading(false));
  }, [projectId]);

  const events = dbEvents.length > 0 ? dbEvents : (showDemo ? DEMO_EVENTS : []);

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">📅 时间线</h1>
        <p className="text-gray-500 text-sm">
          项目的所有事件——搜索、提取、实验、转向，包括失败
        </p>
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
    </main>
  );
}
