"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { Brain, Search, ClipboardList, RefreshCw, CheckCircle, AlertTriangle, Plus } from "lucide-react";
import { MechanismMatrix } from "@/components/matrix/mechanism-matrix";
import { ProcessAssistant } from "@/components/assistant/process-assistant";
import { analyzeProjectState } from "@/lib/assistant/process-assistant";
import { HypothesisCard } from "@/components/brain/hypothesis-card";
import { HypothesisForm } from "@/components/brain/hypothesis-form";
import { TaskBoard } from "@/components/brain/task-board";
import { generateMatrix, generateMatrixFromDB, type MatrixData, type DBExtraction } from "@/lib/matrix/generator";
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

export default function BrainPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { papers: storePapers, matrix: storeMatrix, loadProject } = useProjectStore();
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [dbMatrix, setDbMatrix] = useState<MatrixData | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(true);
  const [dbExtractions, setDbExtractions] = useState<DBExtraction[] | null>(null);

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

  // 从 DB 获取真实提取数据（直接用于矩阵生成）
  useEffect(() => {
    if (!projectId) return;
    fetch(`/api/projects/${projectId}/extractions`)
      .then((res) => res.json())
      .then((data) => {
        if (data.extractions) setDbExtractions(data.extractions);
      })
      .catch(() => {});
  }, [projectId]);

  // 从 DB 文献构建 extractedPapers（用于 fallback）
  const extractedPapers = useMemo(() => {
    // 如果有 DB 提取数据，直接从 DB extractions 生成（不再需要 papers 中转）
    if (dbExtractions && dbExtractions.length > 0) {
      return dbExtractions.map((e) => ({
        paperId: e.paperId,
        title: e.paper.title,
        year: e.paper.year ?? undefined,
        experiments: [],
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
  }, [dbExtractions, storePapers]);

  const useDemo = !dbExtractions || dbExtractions.length === 0;

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
        } else if (dbExtractions && dbExtractions.length > 0) {
          // DB 没有矩阵，从 DB 提取数据实时生成并保存
          const generated = generateMatrixFromDB(dbExtractions);
          setDbMatrix(generated);
          // fire-and-forget 保存
          fetch(`/api/projects/${projectId}/matrix`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: generated }),
          }).catch(() => {});
        } else if (extractedPapers.length > 0) {
          // 从 store 数据实时生成（fallback）
          const generated = generateMatrix(
            extractedPapers.map((p) => ({
              paperId: p.paperId,
              paperTitle: p.title,
              year: p.year,
              experiments: p.experiments,
            }))
          );
          setDbMatrix(generated);
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

    // 有 DB 提取数据时使用 DB-based 生成
    if (dbExtractions && dbExtractions.length > 0) {
      return generateMatrixFromDB(dbExtractions);
    }

    return generateMatrix(
      extractedPapers.map((p) => ({
        paperId: p.paperId,
        paperTitle: p.title,
        year: p.year,
        experiments: p.experiments,
      }))
    );
  }, [useDemo, dbMatrix, storeMatrix, extractedPapers, dbExtractions]);

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
        <MechanismMatrix projectId={projectId} data={matrixData} />
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
        </h2>
        <TaskBoard projectId={projectId} matrixData={useDemo ? undefined : matrixData} />
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
