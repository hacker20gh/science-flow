"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Lightbulb,
  FlaskConical,
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  Check,
  Sparkles,
} from "lucide-react";
import type { MatrixData } from "@/lib/matrix/generator";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Todo {
  id: string;
  projectId: string;
  type: string; // "conflict" | "gap" | "suggestion" | "experiment_check"
  title: string;
  detail: string | null;
  status: string; // "pending" | "completed"
  metadata: Record<string, unknown> | null;
  completedAt: string | null;
  createdAt: string;
}

interface TaskBoardProps {
  projectId: string;
  matrixData?: MatrixData;
}

type ColumnKey = "conflict" | "gap" | "suggestion";

interface ColumnDef {
  key: ColumnKey;
  label: string;
  icon: React.ReactNode;
  bgClass: string;
  borderClass: string;
  iconBgClass: string;
}

/* ------------------------------------------------------------------ */
/*  Column definitions                                                 */
/* ------------------------------------------------------------------ */

const COLUMNS: ColumnDef[] = [
  {
    key: "conflict",
    label: "冲突任务",
    icon: <AlertTriangle size={16} className="text-amber-600" />,
    bgClass: "bg-amber-50",
    borderClass: "border-amber-200",
    iconBgClass: "bg-amber-100",
  },
  {
    key: "gap",
    label: "数据缺口",
    icon: <Lightbulb size={16} className="text-blue-600" />,
    bgClass: "bg-blue-50",
    borderClass: "border-blue-200",
    iconBgClass: "bg-blue-100",
  },
  {
    key: "suggestion",
    label: "建议任务",
    icon: <FlaskConical size={16} className="text-purple-600" />,
    bgClass: "bg-purple-50",
    borderClass: "border-purple-200",
    iconBgClass: "bg-purple-100",
  },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function typeIcon(type: string) {
  switch (type) {
    case "conflict":
      return <AlertTriangle size={14} className="text-amber-500 shrink-0" />;
    case "gap":
      return <Lightbulb size={14} className="text-blue-500 shrink-0" />;
    case "suggestion":
      return <FlaskConical size={14} className="text-purple-500 shrink-0" />;
    default:
      return <FlaskConical size={14} className="text-gray-400 shrink-0" />;
  }
}

function typeToColumn(type: string): ColumnKey {
  if (type === "conflict") return "conflict";
  if (type === "gap") return "gap";
  return "suggestion";
}

/** Sort comparator: pending first (by creation asc), then completed (by completion desc). */
function taskSort(a: Todo, b: Todo) {
  if (a.status !== b.status) return a.status === "pending" ? -1 : 1;
  if (a.status === "pending") {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  }
  // completed: most recently completed first
  const aTime = a.completedAt ? new Date(a.completedAt).getTime() : 0;
  const bTime = b.completedAt ? new Date(b.completedAt).getTime() : 0;
  return bTime - aTime;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function TaskBoard({ projectId, matrixData }: TaskBoardProps) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDone, setExpandedDone] = useState<Record<ColumnKey, boolean>>({
    conflict: false,
    gap: false,
    suggestion: false,
  });

  // Inline "add task" state per column
  const [addingTo, setAddingTo] = useState<ColumnKey | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDetail, setNewDetail] = useState("");
  const [saving, setSaving] = useState(false);

  /* ---- Fetch todos ---- */
  const fetchTodos = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/todos`);
      const data = await res.json();
      if (data.todos) setTodos(data.todos);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchTodos();
  }, [fetchTodos]);

  /* ---- Toggle completion ---- */
  const toggleTodo = useCallback(
    async (todo: Todo) => {
      const newStatus = todo.status === "pending" ? "completed" : "pending";
      // Optimistic update
      setTodos((prev) =>
        prev.map((t) =>
          t.id === todo.id
            ? { ...t, status: newStatus, completedAt: newStatus === "completed" ? new Date().toISOString() : null }
            : t
        )
      );
      try {
        await fetch(`/api/projects/${projectId}/todos`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: todo.id, status: newStatus }),
        });
      } catch {
        // Revert on error
        setTodos((prev) =>
          prev.map((t) =>
            t.id === todo.id
              ? { ...t, status: todo.status, completedAt: todo.completedAt }
              : t
          )
        );
      }
    },
    [projectId]
  );

  /* ---- Create new todo ---- */
  const createTodo = useCallback(
    async (type: ColumnKey) => {
      if (!newTitle.trim()) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/projects/${projectId}/todos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            title: newTitle.trim(),
            detail: newDetail.trim() || undefined,
          }),
        });
        const data = await res.json();
        if (data.todo) {
          setTodos((prev) => [data.todo, ...prev]);
        }
        setNewTitle("");
        setNewDetail("");
        setAddingTo(null);
      } catch {
        // silently fail
      } finally {
        setSaving(false);
      }
    },
    [projectId, newTitle, newDetail]
  );

  /* ---- Generate tasks from matrix conflicts/gaps ---- */
  const generateFromMatrix = useCallback(async () => {
    if (!matrixData) return;
    const tasksToCreate: Array<{ type: ColumnKey; title: string; detail: string }> = [];

    for (const conflict of matrixData.conflicts) {
      const pathwayName = conflict.columnId.split(":")[1] || conflict.columnId;
      tasksToCreate.push({
        type: "conflict",
        title: `"${pathwayName}" 通路有文献冲突`,
        detail: `${conflict.description} — 不同研究结论不一致，建议设计实验验证`,
      });
    }

    // Aggregate gaps by dimension
    const uniqueGaps = new Map<string, number>();
    for (const gap of matrixData.gaps) {
      const dimName = gap.columnId.split(":")[1] || gap.columnId;
      uniqueGaps.set(dimName, (uniqueGaps.get(dimName) || 0) + 1);
    }
    for (const [dimName, count] of uniqueGaps) {
      if (count >= 2) {
        tasksToCreate.push({
          type: "gap",
          title: `"${dimName}" 维度数据空白`,
          detail: `${count} 篇文献未覆盖此维度，可能是潜在研究创新点`,
        });
      }
    }

    // Suggestion tasks
    if (matrixData.totalPapers >= 3) {
      tasksToCreate.push({
        type: "suggestion",
        title: "文献数据充足，可以提出假设",
        detail: `已有 ${matrixData.totalPapers} 篇文献、${matrixData.totalExperiments} 个实验数据，建议基于矩阵发现提出可验证假设`,
      });
    }
    if (matrixData.totalPapers >= 5 && matrixData.conflicts.length > 0) {
      tasksToCreate.push({
        type: "suggestion",
        title: "优先设计实验解决文献冲突",
        detail: `${matrixData.conflicts.length} 个冲突需要实验验证，解决冲突比探索新方向更有价值`,
      });
    }

    // Create all tasks
    for (const task of tasksToCreate) {
      try {
        const res = await fetch(`/api/projects/${projectId}/todos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(task),
        });
        const data = await res.json();
        if (data.todo) {
          setTodos((prev) => [data.todo, ...prev]);
        }
      } catch {
        // continue with next task
      }
    }
  }, [projectId, matrixData]);

  /* ---- Derive column data ---- */
  const columnTodos = (key: ColumnKey): Todo[] =>
    todos.filter((t) => typeToColumn(t.type) === key);

  const pendingTodos = (key: ColumnKey): Todo[] =>
    columnTodos(key)
      .filter((t) => t.status === "pending")
      .sort(taskSort);

  const completedTodos = (key: ColumnKey): Todo[] =>
    columnTodos(key)
      .filter((t) => t.status === "completed")
      .sort(taskSort);

  const totalPending = todos.filter((t) => t.status === "pending").length;

  /* ---- Render ---- */
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => (
          <div key={col.key} className={`${col.bgClass} border ${col.borderClass} rounded-xl p-4 min-h-[120px]`}>
            <div className="flex items-center gap-2 mb-3 opacity-60">
              {col.icon}
              <span className="text-sm font-medium">{col.label}</span>
            </div>
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-12 bg-white/60 rounded-lg animate-pulse" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Show "generate from matrix" button if DB is empty and matrix has data
  const showGenerateButton =
    todos.length === 0 && matrixData && (matrixData.conflicts.length > 0 || matrixData.gaps.length > 0);

  return (
    <div className="space-y-4">
      {/* Generate from matrix button */}
      {showGenerateButton && (
        <div className="flex items-center gap-2 bg-gradient-to-r from-amber-50 via-blue-50 to-purple-50 border border-gray-200 rounded-lg px-4 py-3">
          <Sparkles size={16} className="text-amber-500" />
          <span className="text-sm text-gray-600 flex-1">
            矩阵中检测到 {matrixData.conflicts.length} 个冲突和 {matrixData.gaps.length} 个数据缺口
          </span>
          <button
            onClick={generateFromMatrix}
            className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1 shrink-0"
          >
            <Sparkles size={12} />
            从矩阵生成任务
          </button>
        </div>
      )}

      {/* Three-column board */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map((col) => {
          const pending = pendingTodos(col.key);
          const completed = completedTodos(col.key);
          const isExpanded = expandedDone[col.key];

          return (
            <div
              key={col.key}
              className={`${col.bgClass} border ${col.borderClass} rounded-xl p-4 min-h-[160px] flex flex-col`}
            >
              {/* Column header */}
              <div className="flex items-center gap-2 mb-3">
                <div className={`${col.iconBgClass} rounded-md p-1`}>{col.icon}</div>
                <span className="text-sm font-semibold">{col.label}</span>
                {pending.length > 0 && (
                  <span className="text-xs bg-white/70 text-gray-500 px-1.5 py-0.5 rounded-full">
                    {pending.length}
                  </span>
                )}
              </div>

              {/* Pending tasks */}
              <div className="space-y-2 flex-1">
                {pending.length === 0 && !addingTo && (
                  <p className="text-xs text-gray-400 text-center py-4">暂无任务</p>
                )}
                {pending.map((todo) => (
                  <div
                    key={todo.id}
                    className="bg-white rounded-lg px-3 py-2.5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                  >
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={() => toggleTodo(todo)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {typeIcon(todo.type)}
                          <p className="text-sm font-medium text-gray-800 truncate">{todo.title}</p>
                        </div>
                        {todo.detail && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{todo.detail}</p>
                        )}
                      </div>
                    </label>
                  </div>
                ))}

                {/* Inline add form */}
                {addingTo === col.key ? (
                  <div className="bg-white rounded-lg p-3 shadow-sm border border-gray-200">
                    <input
                      autoFocus
                      type="text"
                      placeholder="任务标题..."
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          createTodo(col.key);
                        }
                        if (e.key === "Escape") {
                          setAddingTo(null);
                          setNewTitle("");
                          setNewDetail("");
                        }
                      }}
                      className="w-full text-sm border-0 border-b border-gray-200 pb-1 mb-2 focus:outline-none focus:border-blue-400"
                    />
                    <input
                      type="text"
                      placeholder="详情（可选）"
                      value={newDetail}
                      onChange={(e) => setNewDetail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          createTodo(col.key);
                        }
                        if (e.key === "Escape") {
                          setAddingTo(null);
                          setNewTitle("");
                          setNewDetail("");
                        }
                      }}
                      className="w-full text-xs border-0 border-b border-gray-200 pb-1 mb-2 focus:outline-none focus:border-blue-400 text-gray-500"
                    />
                    <div className="flex items-center justify-between mt-1">
                      <button
                        onClick={() => {
                          setAddingTo(null);
                          setNewTitle("");
                          setNewDetail("");
                        }}
                        className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                      >
                        <X size={12} />
                        取消
                      </button>
                      <button
                        onClick={() => createTodo(col.key)}
                        disabled={!newTitle.trim() || saving}
                        className="text-xs bg-blue-600 text-white px-2.5 py-1 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                      >
                        <Check size={12} />
                        {saving ? "保存中..." : "添加"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Completed section */}
              {completed.length > 0 && (
                <div className="mt-2 border-t border-gray-200/50 pt-2">
                  <button
                    onClick={() =>
                      setExpandedDone((prev) => ({ ...prev, [col.key]: !prev[col.key] }))
                    }
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 w-full"
                  >
                    {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span>已完成 ({completed.length})</span>
                  </button>
                  {isExpanded && (
                    <div className="mt-2 space-y-1.5">
                      {completed.map((todo) => (
                        <div
                          key={todo.id}
                          className="bg-white/50 rounded-lg px-3 py-2 flex items-start gap-2"
                        >
                          <label className="flex items-start gap-2 cursor-pointer flex-1">
                            <input
                              type="checkbox"
                              checked={true}
                              onChange={() => toggleTodo(todo)}
                              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-400 line-through truncate">
                                {todo.title}
                              </p>
                              {todo.detail && (
                                <p className="text-xs text-gray-300 line-clamp-1 mt-0.5">
                                  {todo.detail}
                                </p>
                              )}
                            </div>
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Add task button */}
              {!addingTo && (
                <button
                  onClick={() => setAddingTo(col.key)}
                  className="mt-3 flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 py-1.5 rounded-lg hover:bg-white/50 transition-colors w-full"
                >
                  <Plus size={12} />
                  添加任务
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
