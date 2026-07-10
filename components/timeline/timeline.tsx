"use client";

import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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

/** 合并后的事件组 */
interface MergedGroup {
  type: string;
  events: TimelineEvent[];
  title: string;
  description: string;
  timeRange: string;
  earliest: number;
  latest: number;
}

/** 获取事件配置（未知类型用 fallback） */
function getConfig(type: string) {
  return (
    EVENT_CONFIG[type as TimelineEventType] || {
      icon: "📌",
      label: type,
      color: "text-gray-600",
      bgColor: "bg-gray-100",
    }
  );
}

/** 合并连续同类型事件 */
function mergeEvents(events: TimelineEvent[]): MergedGroup[] {
  const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp);
  const groups: MergedGroup[] = [];

  for (const event of sorted) {
    const lastGroup = groups[groups.length - 1];

    // 同类型且时间在 5 分钟内 → 合并
    if (
      lastGroup &&
      lastGroup.type === event.type &&
      Math.abs(event.timestamp - lastGroup.latest) < 5 * 60 * 1000
    ) {
      lastGroup.events.push(event);
      lastGroup.earliest = Math.min(lastGroup.earliest, event.timestamp);
      lastGroup.title = `${getConfig(event.type).label} (${lastGroup.events.length} 条)`;
      lastGroup.description = lastGroup.events
        .slice(0, 3)
        .map((e) => e.title)
        .join("、");
      if (lastGroup.events.length > 3) {
        lastGroup.description += ` 等 ${lastGroup.events.length} 条`;
      }
    } else {
      groups.push({
        type: event.type,
        events: [event],
        title: event.title,
        description: event.description,
        timeRange: formatEventTime(event.timestamp),
        earliest: event.timestamp,
        latest: event.timestamp,
      });
    }
  }

  // 计算时间范围
  for (const group of groups) {
    if (group.events.length > 1) {
      group.timeRange = `${formatEventTime(group.latest)} ~ ${formatEventTime(group.earliest)}`;
    }
  }

  return groups;
}

export function Timeline({ events, onEventClick }: TimelineProps) {
  const [filter, setFilter] = useState<TimelineEventType | "all">("all");
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);

  const filteredEvents =
    filter === "all"
      ? events
      : events.filter((e) => e.type === filter);

  const groups = useMemo(() => mergeEvents(filteredEvents), [filteredEvents]);

  // 统计各类型事件数量
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      counts.set(event.type, (counts.get(event.type) || 0) + 1);
    }
    return counts;
  }, [events]);

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
          const config = getConfig(type);
          return (
            <button
              key={type}
              onClick={() => setFilter(filter === type ? "all" : type as TimelineEventType)}
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
      {groups.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <p className="text-sm">还没有记录</p>
          <p className="text-xs mt-1">
            搜索文献、设计实验、记录结果，所有事件会自动出现在时间线上
          </p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-gray-200" />

          <div className="space-y-1">
            {groups.map((group) => {
              const config = getConfig(group.type);
              const isExpanded = expandedGroupId === group.type + group.latest;
              const hasMulti = group.events.length > 1;

              return (
                <div key={group.type + group.latest}>
                  {/* 组头 */}
                  <div
                    className="relative flex gap-4 cursor-pointer group"
                    onClick={() => {
                      const id = group.type + group.latest;
                      setExpandedGroupId(isExpanded ? null : id);
                    }}
                  >
                    <div
                      className={`relative z-10 w-10 h-10 rounded-full ${config.bgColor} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform`}
                    >
                      <span className="text-sm">{config.icon}</span>
                    </div>

                    <div className="flex-1 pb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${config.bgColor} ${config.color}`}
                        >
                          {config.label}
                          {hasMulti && (
                            <span className="ml-1 font-medium">
                              ×{group.events.length}
                            </span>
                          )}
                        </span>
                        <span className="text-xs text-gray-400">
                          {group.timeRange}
                        </span>
                        {hasMulti && (
                          <span className="text-gray-300">
                            {isExpanded ? (
                              <ChevronDown size={14} />
                            ) : (
                              <ChevronRight size={14} />
                            )}
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm font-medium mt-1">
                        {hasMulti
                          ? `${config.label}（${group.events.length} 条事件）`
                          : group.title}
                      </h3>

                      {!isExpanded && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                          {group.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 展开的事件列表 */}
                  {isExpanded && hasMulti && (
                    <div className="ml-14 mb-3 space-y-1">
                      {group.events.map((event) => (
                        <div
                          key={event.id}
                          className="flex items-start gap-3 px-3 py-2 rounded-lg bg-white border border-gray-100 text-sm cursor-pointer hover:bg-gray-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEventClick?.(event);
                          }}
                        >
                          <span className="text-xs text-gray-400 shrink-0 mt-0.5">
                            {formatEventTime(event.timestamp)}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {event.title}
                            </p>
                            {event.description && (
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                                {event.description}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* 单条事件的详情 */}
                  {isExpanded && !hasMulti && group.events[0]?.metadata && (
                    <div className="ml-14 mb-3 p-3 bg-white border border-gray-100 rounded-lg text-xs space-y-1">
                      {Object.entries(group.events[0].metadata).map(
                        ([key, value]) => (
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
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
