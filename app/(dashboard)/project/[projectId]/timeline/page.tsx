"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Timeline } from "@/components/timeline/timeline";
import { useProjectStore } from "@/store/project-store";
import type { TimelineEvent } from "@/lib/timeline/events";

export default function TimelinePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { timeline, loadDemoTimeline } = useProjectStore();
  const [dbEvents, setDbEvents] = useState<TimelineEvent[] | null>(null);
  const [loading, setLoading] = useState(true);

  // 优先从数据库加载，失败则用 demo 数据
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
              description: (e.content as Record<string, unknown>)?.description as string || "",
              timestamp: new Date(e.createdAt as string),
              metadata: e.metadata as Record<string, unknown> | undefined,
            }))
          );
        } else {
          loadDemoTimeline();
        }
      })
      .catch(() => loadDemoTimeline())
      .finally(() => setLoading(false));
  }, [projectId, loadDemoTimeline]);

  const events = dbEvents || timeline;

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">📅 时间线</h1>
        <p className="text-gray-500 text-sm">
          项目的所有事件——搜索、提取、实验、转向，包括失败
        </p>
      </div>

      {loading && (
        <div className="text-gray-400 text-sm py-8 text-center">加载中...</div>
      )}

      {!loading && <Timeline events={events} />}
    </main>
  );
}
