"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { Brain, Search, ClipboardList, RefreshCw, CheckCircle, AlertTriangle, Lightbulb, FlaskConical, Plus } from "lucide-react";
import { MechanismMatrix } from "@/components/matrix/mechanism-matrix";
import { ProcessAssistant } from "@/components/assistant/process-assistant";
import { analyzeProjectState } from "@/lib/assistant/process-assistant";
import { HypothesisCard } from "@/components/brain/hypothesis-card";
import { HypothesisForm } from "@/components/brain/hypothesis-form";
import { generateMatrix, type MatrixData } from "@/lib/matrix/generator";
import { useProjectStore } from "@/store/project-store";
import { DEMO_EXTRATIONS } from "@/lib/matrix/demo-data";
import { useParams } from "next/navigation";
import { exportMatrixToCsv, exportMatrixToLatex, downloadFile } from "@/lib/export";

/** 假设数据结构（来自 Prisma Hypothesis 表） */
interface Hypothesis {
  id: string;
  statement: string;
  status: string; // pending | testing | supported | refused | revised
  evidence: unknown;
  basedOn: string[];
  createdAt: string;
}

interface TodoItem {
  id: string;
  type: "conflict" | "gap" | "suggestion" | "completed";
  icon: React.ReactNode;
  title: string;
  detail: string;
  actionLabel?: string;
  actionHref?: string;
}

export default function BrainPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { papers: storePapers, matrix: storeMatrix, loadProject } = useProjectStore();
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [dbMatrix, setDbMatrix] = useState<MatrixData | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(true);
  const [dbPapers, setDbPapers] = useState<Array<{
    id: string; title: string; year: number | null;
    extractions: Array<{ experiments: unknown }>;
  }> | null>(null);

  // Hypothesis CRUD state
  const [showForm, setShowForm] = useState(false);
  const [editingHypothesis, setEditingHypothesis] = useState<Hypothesis | null>(null);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");

  const refreshHypotheses = useCallback(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/hypotheses`)
      .then((res) => res.json())
      .then((data) => {
        if (data.hypotheses) setHypotheses(data.hypotheses);
      })
      .catch(() => {});
  }, [projectId]);

  const handleCreateHypothesis = useCallback(
    async (data: { statement: string; status: string; evidence?: unknown; basedOn?: string[] }) => {
      try {
        await fetch(`/api/projects/${projectId}/hypotheses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        refreshHypotheses();
      } catch {
        // silently fail
      }
    },
    [projectId, refreshHypotheses]
  );

  const handleUpdateHypothesis = useCallback(
    async (id: string, data: { status?: string; statement?: string }) => {
      try {
        await fetch(`/api/projects/${projectId}/hypotheses`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...data }),
        });
        refreshHypotheses();
      } catch {
        // silently fail
      }
    },
    [projectId, refreshHypotheses]
  );

  const handleDeleteHypothesis = useCallback(
    async (id: string) => {
      try {
        await fetch(`/api/projects/${projectId}/hypotheses?id=${id}`, {
          method: "DELETE",
        });
        refreshHypotheses();
      } catch {
        // silently fail
      }
    },
    [projectId, refreshHypotheses]
  );

  const handleEditHypothesis = useCallback((h: Hypothesis) => {
    setEditingHypothesis(h);
    setFormMode("edit");
    setShowForm(true);
  }, []);

  const handleOpenCreateForm = useCallback(() => {
    setEditingHypothesis(null);
    setFormMode("create");
    setShowForm(true);
  }, []);

  const handleFormSubmit = useCallback(
    (data: { statement: string; status: string; evidence?: unknown; basedOn?: string[] }) => {
      if (formMode === "create") {
        handleCreateHypothesis(data);
      } else if (editingHypothesis) {
        handleUpdateHypothesis(editingHypothesis.id, {
          statement: data.statement,
          status: data.status,
        });
      }
    },
    [formMode, editingHypothesis, handleCreateHypothesis, handleUpdateHypothesis]
  );

  // 从 DB 获取真实文献数据（包含提取结果）
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/papers`)
      .then((res) => res.json())
      .then((data) => {
        if (data.papers) setDbPapers(data.papers);
      })
      .catch(() => {});
  }, [projectId]);

  // 从 DB 文献构建 extractedPapers
  const extractedPapers = useMemo(() => {
    if (dbPapers) {
      return dbPapers
        .filter((p) => p.extractions.length > 0)
        .map((p) => ({
          paperId: p.id,
          title: p.title,
          year: p.year ?? undefined,
          experiments: p.extractions.flatMap((e) => {
            try {
              const data = typeof e.experiments === "string" ? JSON.parse(e.experiments as string) : e.experiments;
              return Array.isArray(data) ? data : [];
            } catch { return []; }
          }),
        }));
    }
    // fallback 到 store
    return storePapers
      .filter((p) => p.extractionStatus === "done" && p.experiments.length > 0)
      .map((p) => ({
        paperId: p.paperId,
        title: p.title,
        year: p.year,
        experiments: p.experiments,
      }));
  }, [dbPapers, storePapers]);

  const useDemo = extractedPapers.length === 0;

  // 从数据库获取假设
  useEffect(() => {
    if (useDemo || !projectId) return;
    fetch(`/api/projects/${projectId}/hypotheses`)
      .then((res) => res.json())
      .then((data) => {
        if (data.hypotheses) setHypotheses(data.hypotheses);
      })
      .catch(() => {});
  }, [projectId, useDemo]);

  // 注册当前项目 ID 到 store（fire-and-forget 持久化用）
  useEffect(() => {
    if (projectId) loadProject(projectId);
  }, [projectId, loadProject]);

  // 挂载时从 DB 加载持久化矩阵
  useEffect(() => {
    if (!projectId) return;
    setMatrixLoading(true);

    fetch(`/api/projects/${projectId}/matrix`)
      .then((res) => res.json())
      .then((data) => {
        if (data.matrix?.data) {
          // DB 有矩阵，直接使用
          setDbMatrix(data.matrix.data as MatrixData);
        } else if (extractedPapers.length > 0) {
          // DB 没有矩阵，从已提取文献实时生成并保存
          const generated = generateMatrix(
            extractedPapers.map((p) => ({
              paperId: p.paperId,
              paperTitle: p.title,
              year: p.year,
              experiments: p.experiments,
            }))
          );
          setDbMatrix(generated);
          // fire-and-forget 保存
          fetch(`/api/projects/${projectId}/matrix`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: generated }),
          }).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setMatrixLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const matrixData = useMemo(() => {
    // 优先级：DB 持久化 > Store 实时 > 实时生成 > Demo
    if (!useDemo && dbMatrix) {
      return dbMatrix;
    }

    if (!useDemo && storeMatrix) {
      return storeMatrix;
    }

    if (useDemo) {
      return generateMatrix(
        DEMO_EXTRATIONS.map((e) => ({
          paperId: e.paperId,
          paperTitle: e.paperTitle,
          year: e.year,
          experiments: [...e.experiments],
        }))
      );
    }

    return generateMatrix(
      extractedPapers.map((p) => ({
        paperId: p.paperId,
        paperTitle: p.title,
        year: p.year,
        experiments: p.experiments,
      }))
    );
  }, [useDemo, dbMatrix, storeMatrix, extractedPapers]);

  // 动态生成待办清单
  const todoItems: TodoItem[] = useMemo(() => {
    if (useDemo) return []; // demo 模式用原始硬编码数据

    const items: TodoItem[] = [];

    // 1. 从 matrix conflicts 生成待办
    for (const conflict of matrixData.conflicts) {
      const pathwayName = conflict.columnId.split(":")[1];
      items.push({
        id: `conflict-${conflict.columnId}`,
        type: "conflict",
        icon: <AlertTriangle size={16} className="text-amber-500 shrink-0" />,
        title: `"${pathwayName}" 通路有文献冲突（${conflict.description}）`,
        detail: "不同研究结论不一致，建议设计实验验证",
        actionLabel: "设计实验",
        actionHref: "experiments",
      });
    }

    // 2. 从 matrix gaps 生成待办（汇总每个缺失维度，不逐行）
    const uniqueGaps = new Map<string, string[]>();
    for (const gap of matrixData.gaps) {
      const dimName = gap.columnId.split(":")[1];
      if (!uniqueGaps.has(dimName)) uniqueGaps.set(dimName, []);
      uniqueGaps.get(dimName)!.push(gap.rowId);
    }
    for (const [dimName, rows] of uniqueGaps) {
      if (rows.length >= 2) {
        items.push({
          id: `gap-${dimName}`,
          type: "gap",
          icon: <Lightbulb size={16} className="text-blue-500 shrink-0" />,
          title: `"${dimName}" 维度数据空白（${rows.length} 处缺失）`,
          detail: "多篇文献未覆盖此维度，可能是潜在研究创新点",
          actionLabel: "查看矩阵",
          actionHref: "brain",
        });
      }
    }

    // 3. 基于项目状态给出下一步建议
    if (matrixData.totalPapers >= 3 && extractedPapers.length >= 3) {
      items.push({
        id: "next-hypothesis",
        type: "suggestion",
        icon: <FlaskConical size={16} className="text-purple-500 shrink-0" />,
        title: "文献数据充足，可以提出假设",
        detail: `已有 ${matrixData.totalPapers} 篇文献、${matrixData.totalExperiments} 个实验数据，建议基于矩阵发现提出可验证假设`,
      });
    }

    if (matrixData.totalPapers >= 5 && matrixData.conflicts.length > 0) {
      items.push({
        id: "next-experiment",
        type: "suggestion",
        icon: <FlaskConical size={16} className="text-purple-500 shrink-0" />,
        title: "建议优先设计实验解决文献冲突",
        detail: `${matrixData.conflicts.length} 个冲突需要实验验证，解决冲突比探索新方向更有价值`,
        actionLabel: "设计实验",
        actionHref: "experiments",
      });
    }

    return items;
  }, [useDemo, matrixData, extractedPapers]);

  return (
    <main className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <Brain size={24} className="text-purple-600" />
            知识面板
          </h1>
          <p className="text-gray-500 text-sm">
            {useDemo
              ? "展示数据 — 搜索文献并提取后，真实数据会替代这里"
              : `${extractedPapers.length} 篇文献 · ${matrixData.totalExperiments} 个实验`}
          </p>
        </div>
        {useDemo && (
          <a
            href="papers/search"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 flex items-center gap-1.5"
          >
            <Search size={14} />
            搜索文献
          </a>
        )}
      </div>

      {/* Demo 提示 */}
      {useDemo && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700 flex items-center gap-1.5">
          <ClipboardList size={14} />
          当前显示的是示例数据。搜索文献并提取后，真实数据会自动替换。
        </div>
      )}

      {/* 过程助手 */}
      {!useDemo && (
        <ProcessAssistant
          cards={analyzeProjectState({
            papers: storePapers,
            matrix: storeMatrix,
            hasExperiments: extractedPapers.length > 0,
            currentPath: `/project/${projectId}/brain`,
          })}
          basePath={`/project/${projectId}`}
        />
      )}

      {/* 机制矩阵 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">机制矩阵</h2>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const csv = exportMatrixToCsv(matrixData);
                downloadFile(csv, "mechanism-matrix.csv", "text/csv;charset=utf-8");
              }}
              className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              导出 CSV
            </button>
            <button
              onClick={() => {
                const latex = exportMatrixToLatex(matrixData);
                downloadFile(latex, "mechanism-matrix.tex", "application/x-latex");
              }}
              className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
            >
              导出 LaTeX
            </button>
          </div>
        </div>
        <MechanismMatrix data={matrixData} />
      </section>

      {/* 假设追踪器 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">
            假设追踪器
            {!useDemo && hypotheses.length > 0 && (
              <span className="ml-2 text-sm font-normal text-gray-400">
                {hypotheses.length} 个假设
              </span>
            )}
          </h2>
          {!useDemo && (
            <button
              onClick={handleOpenCreateForm}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"
            >
              <Plus size={14} />
              新建假设
            </button>
          )}
        </div>

        {useDemo ? (
          /* Demo 数据：展示硬编码样例 */
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded flex items-center gap-1">
                    <RefreshCw size={12} />
                    验证中
                  </span>
                  <h3 className="font-medium text-sm">
                    sorafenib 通过 NF-κB 上调 HCC 细胞中的 PD-L1 表达
                  </h3>
                </div>

                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-500">证据强度</span>
                    <span className="font-medium text-green-600">80%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: "80%" }} />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-4 text-xs">
                  <div>
                    <p className="text-green-600 font-medium mb-1 flex items-center gap-1">
                      <CheckCircle size={14} />
                      支持证据 (3)
                    </p>
                    <ul className="space-y-1 text-gray-600">
                      <li>• Liu 2024：NF-κB 与 PD-L1 正相关</li>
                      <li>• Exp#2：sorafenib 2-3μM 上调 PD-L1</li>
                      <li>• Exp#3：NF-κB 抑制剂减弱上调</li>
                    </ul>
                  </div>
                  <div>
                    <p className="text-amber-600 font-medium mb-1 flex items-center gap-1">
                      <AlertTriangle size={14} />
                      反对证据 (1)
                    </p>
                    <ul className="space-y-1 text-gray-600">
                      <li>• Chen 2023：10μM 下调（浓度差异）</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : hypotheses.length > 0 ? (
          /* 真实数据：渲染所有假设 */
          <div className="space-y-4">
            {hypotheses.map((h) => (
              <HypothesisCard
                key={h.id}
                hypothesis={h}
                projectId={projectId}
                onUpdate={handleUpdateHypothesis}
                onDelete={handleDeleteHypothesis}
                onEdit={handleEditHypothesis}
                totalExperiments={matrixData.totalExperiments}
              />
            ))}
          </div>
        ) : (
          /* 真实数据但无假设 */
          <div className="bg-white border border-gray-200 rounded-xl p-6 text-center text-gray-400 text-sm">
            搜索文献并提出假设后，假设追踪器会自动显示
          </div>
        )}
      </section>

      {/* 待办清单 */}
      <section>
        <h2 className="text-lg font-semibold mb-4">
          待办清单
          {!useDemo && todoItems.length > 0 && (
            <span className="ml-2 text-sm font-normal text-gray-400">
              {todoItems.length} 项
            </span>
          )}
        </h2>
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {useDemo ? (
            /* Demo 模式：硬编码样例数据 */
            <>
              {matrixData.conflicts.length > 0 && (
                <div className="px-6 py-3 flex items-center gap-3">
                  <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {matrixData.conflicts.length} 个通路/表型存在冲突
                    </p>
                    <p className="text-xs text-gray-500">
                      {matrixData.conflicts.map((c) => c.columnId.split(":")[1]).join("、")} 的变化方向不一致
                    </p>
                  </div>
                  <a href="brain" className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100">
                    查看
                  </a>
                </div>
              )}
              <div className="px-6 py-3 flex items-center gap-3">
                <AlertTriangle size={16} className="text-amber-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Exp#3 缺少阳性对照（TNF-α）</p>
                  <p className="text-xs text-gray-500">NF-κB 激活的阳性参照</p>
                </div>
                <button className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100">
                  补全
                </button>
              </div>
              <div className="px-6 py-3 flex items-center gap-3">
                <CheckCircle size={16} className="text-green-500 shrink-0" />
                <div className="flex-1 text-gray-400 text-sm">Vehicle 对照已设置</div>
              </div>
              <div className="px-6 py-3 flex items-center gap-3">
                <CheckCircle size={16} className="text-green-500 shrink-0" />
                <div className="flex-1 text-gray-400 text-sm">生物学重复 ≥ 3</div>
              </div>
            </>
          ) : todoItems.length > 0 ? (
            /* 真实数据：动态生成的待办 */
            todoItems.map((item) => (
              <div key={item.id} className="px-6 py-3 flex items-center gap-3">
                {item.icon}
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.detail}</p>
                </div>
                {item.actionLabel && item.actionHref && (
                  <a
                    href={item.actionHref}
                    className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 shrink-0"
                  >
                    {item.actionLabel}
                  </a>
                )}
              </div>
            ))
          ) : (
            /* 真实数据但无可操作项 */
            <div className="px-6 py-6 text-center text-gray-400 text-sm">
              当前没有待处理事项
            </div>
          )}
        </div>
      </section>
      {/* Hypothesis Form Dialog */}
      <HypothesisForm
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        onSubmit={handleFormSubmit}
        mode={formMode}
        initialData={
          editingHypothesis
            ? {
                statement: editingHypothesis.statement,
                status: editingHypothesis.status,
                evidence: editingHypothesis.evidence as { supporting?: string[]; contradicting?: string[] } | undefined,
                basedOn: editingHypothesis.basedOn,
              }
            : undefined
        }
      />
    </main>
  );
}
