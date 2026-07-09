"use client";

import { useEffect } from "react";
import { Timeline } from "@/components/timeline/timeline";
import { useProjectStore } from "@/store/project-store";

export default function TimelinePage() {
  const { timeline, loadDemoTimeline } = useProjectStore();

  // 如果没有事件，加载 demo 数据
  useEffect(() => {
    if (timeline.length === 0) {
      loadDemoTimeline();
    }
  }, [timeline.length, loadDemoTimeline]);

  return (
    <main className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">📅 时间线</h1>
        <p className="text-gray-500 text-sm">
          项目的所有事件——搜索、提取、实验、转向，包括失败
        </p>
      </div>

      <Timeline events={timeline} />
    </main>
  );
}
