"use client";

import { useMemo } from "react";
import { MechanismMatrix } from "@/components/matrix/mechanism-matrix";
import { generateMatrix } from "@/lib/matrix/generator";
import { useProjectStore } from "@/store/project-store";
import { DEMO_EXTRATIONS } from "@/lib/matrix/demo-data";

export default function BrainPage() {
  const { papers, matrix: storeMatrix } = useProjectStore();

  // 从 store 读取真实数据，如果没有则用 demo 数据
  const extractedPapers = papers.filter(
    (p) => p.extractionStatus === "done" && p.experiments.length > 0
  );

  const useDemo = extractedPapers.length === 0;

  const matrixData = useMemo(() => {
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
  }, [useDemo, storeMatrix, extractedPapers]);

  return (
    <main className="p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">🧠 知识面板</h1>
          <p className="text-gray-500 text-sm">
            {useDemo
              ? "展示数据 — 搜索文献并提取后，真实数据会替代这里"
              : `${extractedPapers.length} 篇文献 · ${matrixData.totalExperiments} 个实验`}
          </p>
        </div>
        {useDemo && (
          <a
            href="papers/search"
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
          >
            🔍 搜索文献
          </a>
        )}
      </div>

      {/* Demo 提示 */}
      {useDemo && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
          📋 当前显示的是示例数据。搜索文献并提取后，真实数据会自动替换。
        </div>
      )}

      {/* 机制矩阵 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">机制矩阵</h2>
          <div className="flex gap-2">
            <button className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
              导出 CSV
            </button>
            <button className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
              导出 LaTeX
            </button>
          </div>
        </div>
        <MechanismMatrix data={matrixData} />
      </section>

      {/* 假设追踪器 */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">假设追踪器</h2>
          <button className="px-3 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100">
            + 提出新假设
          </button>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded">
                  🔄 验证中
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
                  <p className="text-green-600 font-medium mb-1">✅ 支持证据 (3)</p>
                  <ul className="space-y-1 text-gray-600">
                    <li>• Liu 2024：NF-κB 与 PD-L1 正相关</li>
                    <li>• Exp#2：sorafenib 2-3μM 上调 PD-L1</li>
                    <li>• Exp#3：NF-κB 抑制剂减弱上调</li>
                  </ul>
                </div>
                <div>
                  <p className="text-amber-600 font-medium mb-1">⚠️ 反对证据 (1)</p>
                  <ul className="space-y-1 text-gray-600">
                    <li>• Chen 2023：10μM 下调（浓度差异）</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 待办清单 */}
      <section>
        <h2 className="text-lg font-semibold mb-4">待办清单</h2>
        <div className="bg-white border border-gray-200 rounded-xl divide-y divide-gray-100">
          {matrixData.conflicts.length > 0 && (
            <div className="px-6 py-3 flex items-center gap-3">
              <span className="text-amber-500">⚠️</span>
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
            <span className="text-amber-500">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-medium">Exp#3 缺少阳性对照（TNF-α）</p>
              <p className="text-xs text-gray-500">NF-κB 激活的阳性参照</p>
            </div>
            <button className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100">
              补全
            </button>
          </div>
          <div className="px-6 py-3 flex items-center gap-3">
            <span className="text-green-500">✅</span>
            <div className="flex-1 text-gray-400 text-sm">Vehicle 对照已设置</div>
          </div>
          <div className="px-6 py-3 flex items-center gap-3">
            <span className="text-green-500">✅</span>
            <div className="flex-1 text-gray-400 text-sm">生物学重复 ≥ 3</div>
          </div>
        </div>
      </section>
    </main>
  );
}
