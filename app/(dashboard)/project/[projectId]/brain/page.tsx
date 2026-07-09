"use client";

import { useMemo } from "react";
import { MechanismMatrix } from "@/components/matrix/mechanism-matrix";
import { generateMatrix } from "@/lib/matrix/generator";
import { DEMO_EXTRATIONS } from "@/lib/matrix/demo-data";

export default function BrainPage() {
  const matrixData = useMemo(() => {
    return generateMatrix(
      DEMO_EXTRATIONS.map((e) => ({
        paperId: e.paperId,
        paperTitle: e.paperTitle,
        year: e.year,
        experiments: [...e.experiments],
      }))
    );
  }, []);

  return (
    <main className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">🧠 知识面板</h1>
        <p className="text-gray-500 text-sm">
          课题的实时知识汇总——机制矩阵、假设追踪、待办清单
        </p>
      </div>

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
        <h2 className="text-lg font-semibold mb-4">假设追踪器</h2>
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

              {/* 证据强度 */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-500">证据强度</span>
                  <span className="font-medium text-green-600">80%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-green-500 h-2 rounded-full"
                    style={{ width: "80%" }}
                  />
                </div>
              </div>

              {/* 支持/反对 */}
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
            <span className="text-amber-500">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-medium">未做溶剂毒性基线检测</p>
              <p className="text-xs text-gray-500">DMSO 对 Huh7 细胞活力的影响</p>
            </div>
            <button className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100">
              补全
            </button>
          </div>
          <div className="px-6 py-3 flex items-center gap-3">
            <span className="text-amber-500">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-medium">建议：增加生物学重复至 n=5</p>
              <p className="text-xs text-gray-500">当前 n=3，功效仅 62%</p>
            </div>
            <button className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100">
              优化
            </button>
          </div>
          <div className="px-6 py-3 flex items-center gap-3">
            <span className="text-green-500">✅</span>
            <div className="flex-1 text-gray-400 text-sm">
              Vehicle 对照已设置
            </div>
          </div>
          <div className="px-6 py-3 flex items-center gap-3">
            <span className="text-green-500">✅</span>
            <div className="flex-1 text-gray-400 text-sm">
              生物学重复 ≥ 3
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
