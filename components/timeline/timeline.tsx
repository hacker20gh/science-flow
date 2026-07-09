"use client";

import { useState } from "react";
import {
  EVENT_CONFIG,
  formatEventTime,
  type TimelineEvent,
  type TimelineEventType,
} from "@/lib/timeline/events";

interface TimelineProps {
  events: TimelineEvent[];
  onEventClick?: (event: TimelineEvent) => void;
}

export function Timeline({ events, onEventClick }: TimelineProps) {
  const [filter, setFilter] = useState<TimelineEventType | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredEvents =
    filter === "all"
      ? events
      : events.filter((e) => e.type === filter);

  const sortedEvents = [...filteredEvents].sort(
    (a, b) => b.timestamp - a.timestamp
  );

  // 统计各类型事件数量
  const typeCounts = new Map<TimelineEventType, number>();
  for (const event of events) {
    typeCounts.set(event.type, (typeCounts.get(event.type) || 0) + 1);
  }

  return (
    <div className="space-y-4">
      {/* 筛选栏 */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilter("all")}
          className={`px-2 py-1 text-xs rounded ${
            filter === "all"
              ? "bg-gray-800 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
          }`}
        >
          全部 ({events.length})
        </button>
        {Array.from(typeCounts.entries()).map(([type, count]) => {
          const config = EVENT_CONFIG[type];
          return (
            <button
              key={type}
              onClick={() => setFilter(filter === type ? "all" : type)}
              className={`px-2 py-1 text-xs rounded ${
                filter === type
                  ? `${config.bgColor} ${config.color} font-medium`
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {config.icon} {config.label} ({count})
            </button>
          );
        })}
      </div>

      {/* 时间线 */}
      {sortedEvents.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <p className="text-sm">还没有记录</p>
          <p className="text-xs mt-1">
            搜索文献、设计实验、记录结果，所有事件会自动出现在时间线上
          </p>
        </div>
      ) : (
        <div className="relative">
          {/* 时间线连线 */}
          <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-gray-200" />

          <div className="space-y-1">
            {sortedEvents.map((event) => {
              const config = EVENT_CONFIG[event.type];
              const isExpanded = expandedId === event.id;

              return (
                <div
                  key={event.id}
                  className="relative flex gap-4 cursor-pointer group"
                  onClick={() => {
                    setExpandedId(isExpanded ? null : event.id);
                    onEventClick?.(event);
                  }}
                >
                  {/* 时间点 */}
                  <div
                    className={`relative z-10 w-10 h-10 rounded-full ${config.bgColor} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}
                  >
                    <span className="text-sm">{config.icon}</span>
                  </div>

                  {/* 事件内容 */}
                  <div
                    className={`flex-1 pb-4 transition-colors rounded-lg -ml-1 px-3 py-2 ${
                      isExpanded ? "bg-white shadow-sm border border-gray-100" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${config.bgColor} ${config.color}`}
                        >
                          {config.label}
                        </span>
                        <h3 className="text-sm font-medium mt-1">
                          {event.title}
                        </h3>
                      </div>
                      <span className="text-xs text-gray-400 shrink-0 ml-2">
                        {formatEventTime(event.timestamp)}
                      </span>
                    </div>

                    <p className="text-xs text-gray-500 mt-1">
                      {event.description}
                    </p>

                    {/* 展开的详情 */}
                    {isExpanded && event.metadata && (
                      <div className="mt-3 p-2 bg-gray-50 rounded text-xs space-y-1">
                        {Object.entries(event.metadata).map(([key, value]) => (
                          <div key={key} className="flex gap-2">
                            <span className="text-gray-400 min-w-[80px]">
                              {key}：
                            </span>
                            <span className="text-gray-700">
                              {typeof value === "object"
                                ? JSON.stringify(value)
                                : String(value)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
