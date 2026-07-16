"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import {
  ChevronDown,
  ChevronRight,
  X,
  ExternalLink,
  Search,
  Filter,
  Calendar,
  TrendingUp,
} from "lucide-react";
import {
  EVENT_CONFIG,
  formatEventTime,
  groupByDate,
  computeWeekStats,
  type TimelineEvent,
  type TimelineEventType,
} from "@/lib/timeline/events";

// ───────────────────── types ─────────────────────

interface TimelineProps {
  events: TimelineEvent[];
  projectId?: string;
  onEventClick?: (event: TimelineEvent) => void;
}

interface MergedGroup {
  type: string;
  events: TimelineEvent[];
  title: string;
  description: string;
  timeRange: string;
  earliest: number;
  latest: number;
}

// ───────────────────── helpers ─────────────────────

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

/** 事件类型 → 跳转页面 */
function getEventHref(event: TimelineEvent, projectId: string): string | null {
  const meta = event.metadata as Record<string, unknown> | undefined;
  void meta;
  switch (event.type) {
    case "literature":
    case "extraction":
      return `/project/${projectId}/papers`;
    case "hypothesis":
    case "matrix_updated":
      return `/project/${projectId}/brain`;
    case "experiment_design":
    case "experiment_completed":
    case "experiment_failed":
      return `/project/${projectId}/experiments`;
    case "manuscript":
      return `/project/${projectId}/manuscript`;
    case "data_upload":
      return `/project/${projectId}/data`;
    default:
      return null;
  }
}

/** 合并连续同类型事件（5 分钟窗口） */
function mergeEvents(events: TimelineEvent[]): MergedGroup[] {
  const sorted = [...events].sort((a, b) => b.timestamp - a.timestamp);
  const groups: MergedGroup[] = [];

  for (const event of sorted) {
    const lastGroup = groups[groups.length - 1];
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
      if (lastGroup.events.length > 3)
        lastGroup.description += ` 等 ${lastGroup.events.length} 条`;
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

  for (const group of groups) {
    if (group.events.length > 1) {
      group.timeRange = `${formatEventTime(group.latest)} ~ ${formatEventTime(group.earliest)}`;
    }
  }

  return groups;
}

// ───────────────────── StatsBar ─────────────────────

const STAT_HIGHLIGHTS: {
  type: TimelineEventType;
  emoji: string;
  label: string;
}[] = [
  { type: "literature", emoji: "📖", label: "文献" },
  { type: "extraction", emoji: "🔬", label: "提取" },
  { type: "experiment_completed", emoji: "✅", label: "实验成功" },
  { type: "experiment_failed", emoji: "⚠️", label: "实验失败" },
];

function StatsBar({ events }: { events: TimelineEvent[] }) {
  const stats = useMemo(() => computeWeekStats(events), [events]);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      {STAT_HIGHLIGHTS.map(({ type, emoji, label }) => {
        const count = stats.byType.get(type) || 0;
        const config = getConfig(type);
        return (
          <div
            key={type}
            className={`flex items-center gap-3 p-3 rounded-xl border border-gray-100 ${count > 0 ? "bg-white" : "bg-gray-50"}`}
          >
            <div
              className={`w-9 h-9 rounded-lg ${config.bgColor} flex items-center justify-center shrink-0`}
            >
              <span className="text-sm">{emoji}</span>
            </div>
            <div>
              <div className={`text-lg font-bold ${count > 0 ? config.color : "text-gray-300"}`}>
                {count}
              </div>
              <div className="text-[11px] text-gray-400">本周{label}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────────────────── EventGroupRow ─────────────────────

function EventGroupRow({
  group,
  isExpanded,
  onToggle,
  onSelectEvent,
}: {
  group: MergedGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectEvent: (event: TimelineEvent) => void;
}) {
  const config = getConfig(group.type);
  const hasMulti = group.events.length > 1;

  return (
    <div>
      {/* 组头 */}
      <div
        className="relative flex gap-4 cursor-pointer group/row"
        onClick={onToggle}
      >
        <div
          className={`relative z-10 w-10 h-10 rounded-full ${config.bgColor} flex items-center justify-center shrink-0 group-hover/row:scale-110 transition-transform`}
        >
          <span className="text-sm">{config.icon}</span>
        </div>

        <div className="flex-1 pb-3 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`text-xs px-1.5 py-0.5 rounded ${config.bgColor} ${config.color}`}
            >
              {config.label}
              {hasMulti && (
                <span className="ml-1 font-medium">×{group.events.length}</span>
              )}
            </span>
            <span className="text-xs text-gray-400">{group.timeRange}</span>
            {hasMulti && (
              <span className="text-gray-300">
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
            )}
          </div>

          <h3 className="text-sm font-medium mt-1 truncate">
            {hasMulti
              ? `${config.label}（${group.events.length} 条事件）`
              : group.title}
          </h3>

          {!isExpanded && group.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
              {group.description}
            </p>
          )}
        </div>
      </div>

      {/* 展开子事件列表 */}
      {isExpanded && hasMulti && (
        <div className="ml-14 mb-3 space-y-1">
          {group.events.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-3 px-3 py-2 rounded-lg bg-white border border-gray-100 text-sm cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onSelectEvent(event);
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

      {/* 单条事件展开 — 直接打开侧边栏 */}
      {isExpanded && !hasMulti && (
        <div className="ml-14 mb-3">
          <button
            className="w-full px-3 py-2 text-xs text-blue-600 hover:bg-blue-50 rounded-lg border border-blue-100 text-left transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onSelectEvent(group.events[0]);
            }}
          >
            查看详情 →
          </button>
        </div>
      )}
    </div>
  );
}

// ───────────────────── DetailSidebar ─────────────────────

/** 字段 key → 中文标签 */
const KEY_LABELS: Record<string, string> = {
  paperId: "文献",
  paperTitle: "文献标题",
  count: "数量",
  totalPapers: "文献数",
  totalExperiments: "实验数",
  fileName: "文件名",
  source: "来源",
  imported: "导入数",
  skipped: "跳过数",
  query: "搜索词",
  hypothesis: "假设",
  experiment: "实验",
  drug: "药物",
  conc: "浓度",
  cellLine: "细胞系",
  reason: "原因",
  cellDeath: "细胞死亡率",
  result: "结果",
  pathways: "通路数",
  phenotypes: "表型数",
  conflicts: "冲突数",
  papers: "文献数",
  experiments: "实验数",
};

/** 渲染单个字段值，paperId 特殊处理为可点击链接 */
function renderFieldValue(
  key: string,
  value: unknown,
  projectId?: string,
): React.ReactNode {
  const str = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
  if (key === "paperId" && projectId) {
    return (
      <a
        href={`/project/${projectId}/papers`}
        className="text-blue-600 hover:underline break-all"
      >
        {str}
      </a>
    );
  }
  return <span className="text-gray-700 break-all">{str}</span>;
}

function DetailSidebar({
  event,
  projectId,
  onClose,
}: {
  event: TimelineEvent;
  projectId?: string;
  onClose: () => void;
}) {
  const config = getConfig(event.type);
  const href = projectId ? getEventHref(event, projectId) : null;
  const meta = event.metadata as Record<string, unknown> | undefined;
  const content = event.content as Record<string, unknown> | undefined;
  const hasContent = content && Object.keys(content).length > 0;
  const hasMeta = meta && Object.keys(meta).length > 0;

  // ESC 关闭
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <>
      {/* 半透明遮罩（移动端） */}
      <div
        className="fixed inset-0 bg-black/20 z-40 md:hidden"
        onClick={onClose}
      />

      <aside
        className="fixed top-0 right-0 h-full w-full max-w-md bg-white border-l border-gray-200 shadow-xl z-50 flex flex-col"
        style={{ animation: "slideInRight 0.2s ease-out" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${config.bgColor} ${config.color} font-medium`}
            >
              {config.icon} {config.label}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Title + Description */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 leading-snug">
              {event.title}
            </h3>
            {event.description && (
              <p className="text-sm text-gray-600 mt-2 leading-relaxed whitespace-pre-wrap">
                {event.description}
              </p>
            )}
          </div>

          {/* Time */}
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Calendar size={12} />
            <span>
              {new Date(event.timestamp).toLocaleString("zh-CN", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-gray-300">·</span>
            <span>{formatEventTime(event.timestamp)}</span>
          </div>

          {/* Content 详情 */}
          {hasContent && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                事件详情
              </h4>
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                {Object.entries(content!).map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-xs">
                    <span className="text-gray-400 min-w-[80px] shrink-0 font-medium">
                      {KEY_LABELS[key] || key}
                    </span>
                    {renderFieldValue(key, value, projectId)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata 附加信息 */}
          {hasMeta && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                附加信息
              </h4>
              <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                {Object.entries(meta!).map(([key, value]) => (
                  <div key={key} className="flex gap-2 text-xs">
                    <span className="text-gray-400 min-w-[80px] shrink-0 font-medium">
                      {KEY_LABELS[key] || key}
                    </span>
                    {renderFieldValue(key, value, projectId)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 事件 ID（调试用） */}
          <div className="text-[11px] text-gray-300">
            ID: {event.id}
          </div>
        </div>

        {/* Footer — 跳转按钮 */}
        {href && (
          <div className="px-5 py-4 border-t border-gray-100">
            <a
              href={href}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              前往查看
              <ExternalLink size={14} />
            </a>
          </div>
        )}
      </aside>
    </>
  );
}

// ───────────────────── Timeline ─────────────────────

export function Timeline({ events, projectId, onEventClick }: TimelineProps) {
  const [filter, setFilter] = useState<TimelineEventType | "all">("all");
  const [expandedGroupId, setExpandedGroupId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState({ from: "", to: "" });
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);

  const handleSelectEvent = useCallback(
    (event: TimelineEvent) => {
      if (onEventClick) {
        onEventClick(event);
      } else {
        setSelectedEvent(event);
      }
    },
    [onEventClick]
  );

  // 客户端过滤
  const filteredEvents = useMemo(() => {
    let result = events;

    if (filter !== "all") {
      result = result.filter((e) => e.type === filter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q)
      );
    }

    if (dateRange.from) {
      const from = new Date(dateRange.from);
      result = result.filter((e) => new Date(e.timestamp) >= from);
    }
    if (dateRange.to) {
      const to = new Date(dateRange.to + "T23:59:59");
      result = result.filter((e) => new Date(e.timestamp) <= to);
    }

    return result;
  }, [events, filter, searchQuery, dateRange]);

  // 按日期分组
  const dateGroups = useMemo(() => groupByDate(filteredEvents), [filteredEvents]);

  // 每个日期组内做事件合并
  const dateGroupsWithMerged = useMemo(
    () =>
      dateGroups.map((dg) => ({
        ...dg,
        merged: mergeEvents(dg.events),
      })),
    [dateGroups]
  );

  // 类型计数（基于全量数据，不受筛选影响）
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const event of events) {
      counts.set(event.type, (counts.get(event.type) || 0) + 1);
    }
    return counts;
  }, [events]);

  const hasActiveFilter =
    filter !== "all" || searchQuery.trim() !== "" || dateRange.from !== "" || dateRange.to !== "";

  return (
    <div className="space-y-4">
      {/* ── 统计概览 ── */}
      <StatsBar events={events} />

      {/* ── 筛选栏 ── */}
      <div className="space-y-2">
        {/* 类型筛选按钮 */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={14} className="text-gray-400 shrink-0" />
          <button
            onClick={() => setFilter("all")}
            className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
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
                onClick={() =>
                  setFilter(filter === type ? "all" : (type as TimelineEventType))
                }
                className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                  filter === type
                    ? `${config.bgColor} ${config.color} font-medium`
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {config.icon} {config.label} ({count})
              </button>
            );
          })}
          <span className="text-xs text-gray-400 ml-auto">
            {filteredEvents.length} / {events.length} 条事件
          </span>
        </div>

        {/* 搜索 + 日期范围 */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="text"
              placeholder="搜索事件标题或描述..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) =>
              setDateRange((prev) => ({ ...prev, from: e.target.value }))
            }
            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
            title="起始日期"
          />
          <span className="text-gray-400 text-xs">~</span>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) =>
              setDateRange((prev) => ({ ...prev, to: e.target.value }))
            }
            className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
            title="结束日期"
          />
          {hasActiveFilter && (
            <button
              onClick={() => {
                setFilter("all");
                setSearchQuery("");
                setDateRange({ from: "", to: "" });
              }}
              className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1"
            >
              清除筛选
            </button>
          )}
        </div>
      </div>

      {/* ── 时间线内容 ── */}
      {dateGroupsWithMerged.length === 0 ? (
        <div className="text-center text-gray-400 py-16">
          {hasActiveFilter ? (
            <>
              <Search size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium">没有匹配的事件</p>
              <p className="text-xs mt-1">尝试调整搜索条件或筛选器</p>
            </>
          ) : (
            <>
              <TrendingUp size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm font-medium">还没有记录</p>
              <p className="text-xs mt-1 max-w-xs mx-auto">
                搜索文献、设计实验、记录结果，所有事件会自动出现在这里
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="relative">
          {/* 竖线 */}
          <div className="absolute left-[19px] top-0 bottom-0 w-0.5 bg-gray-200" />

          <div className="space-y-6">
            {dateGroupsWithMerged.map((dg) => (
              <div key={dg.date}>
                {/* 日期标题 */}
                <div className="relative flex items-center gap-3 mb-3">
                  <div className="w-10 flex justify-center">
                    <div className="w-2 h-2 rounded-full bg-gray-400 ring-2 ring-white" />
                  </div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {dg.label}
                    <span className="ml-2 text-gray-300 font-normal normal-case">
                      {dg.events.length} 条
                    </span>
                  </h3>
                </div>

                {/* 当天事件 */}
                <div className="space-y-1">
                  {dg.merged.map((group) => (
                    <EventGroupRow
                      key={group.type + group.latest}
                      group={group}
                      isExpanded={expandedGroupId === group.type + group.latest}
                      onToggle={() => {
                        const id = group.type + group.latest;
                        setExpandedGroupId((prev) => (prev === id ? null : id));
                      }}
                      onSelectEvent={handleSelectEvent}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 详情侧边栏 ── */}
      {selectedEvent && projectId && (
        <DetailSidebar
          event={selectedEvent}
          projectId={projectId}
          onClose={() => setSelectedEvent(null)}
        />
      )}
    </div>
  );
}
