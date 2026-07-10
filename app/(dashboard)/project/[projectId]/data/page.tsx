"use client";

import { useState, useRef, useMemo } from "react";
import { useProjectStore } from "@/store/project-store";
import { ChartRenderer } from "@/components/charts/chart-renderer";
import type { AnalysisResult } from "@/lib/llm/analysis";

export default function DataPage() {
  const { addEvent } = useProjectStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function parseCsvForChart(csv: string): Array<Record<string, string | number>> {
    const lines = csv.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim());
    return lines.slice(1, 11).map((line) => {
      const values = line.split(",").map((v) => v.trim());
      const row: Record<string, string | number> = {};
      headers.forEach((h, i) => {
        const num = parseFloat(values[i]);
        row[h] = isNaN(num) ? values[i] || "" : num;
      });
      return row;
    });
  }

  const [csvData, setCsvData] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [experimentContext, setExperimentContext] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvData(text);
    };
    reader.readAsText(file);
  }

  async function handleAnalyze() {
    if (!csvData) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const res = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          csvData,
          experimentContext: experimentContext || undefined,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || "分析失败");

      const data = await res.json();
      setResult(data);

      addEvent(
        "experiment_completed",
        "数据分析完成",
        `完成 ${fileName} 的统计分析：${data.statistical_analysis.recommended_test}`
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "分析失败");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">📊 数据分析</h1>
      <p className="text-gray-500 mb-6 text-sm">
        上传实验数据，AI 自动推荐统计方法并生成分析报告
      </p>

      {/* 上传区域 */}
      {!result && (
        <div className="space-y-4">
          {/* 文件上传 */}
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
            {fileName ? (
              <>
                <p className="text-sm font-medium">📄 {fileName}</p>
                <p className="text-xs text-gray-500 mt-1">点击重新选择文件</p>
              </>
            ) : (
              <>
                <p className="text-3xl mb-2">📁</p>
                <p className="text-sm font-medium">拖拽或点击上传数据文件</p>
                <p className="text-xs text-gray-500 mt-1">
                  支持 CSV、TSV 格式
                </p>
              </>
            )}
          </div>

          {/* 数据预览 */}
          {csvData && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-xs font-medium text-gray-600 mb-2">数据预览：</p>
              <pre className="text-xs text-gray-700 overflow-x-auto max-h-32">
                {csvData.slice(0, 500)}
                {csvData.length > 500 && "\n..."}
              </pre>
            </div>
          )}

          {/* 实验背景（可选） */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">
              实验背景（可选）
            </label>
            <textarea
              value={experimentContext}
              onChange={(e) => setExperimentContext(e.target.value)}
              placeholder="例：sorafenib 处理 Huh7 细胞 24h 后检测 PD-L1 表达"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              ⚠️ {error}
            </div>
          )}

          <button
            onClick={handleAnalyze}
            disabled={!csvData || isAnalyzing}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
          >
            {isAnalyzing ? "正在分析..." : "📊 开始分析"}
          </button>
        </div>
      )}

      {/* 分析中 */}
      {isAnalyzing && !result && (
        <div className="text-center py-8 space-y-3">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600" />
          <p className="text-sm text-gray-500">正在分析数据...</p>
        </div>
      )}

      {/* 分析结果 */}
      {result && (
        <div className="space-y-4">
          {/* 数据类型 */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <span className="font-medium">数据类型：</span>
            <span>{result.description}</span>
          </div>

          {/* 统计分析 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="font-medium text-sm mb-2">📊 统计分析</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-500">推荐方法：</span>
                <span className="font-medium">{result.statistical_analysis.recommended_test}</span>
              </div>
              <p className="text-xs text-gray-600">{result.statistical_analysis.rationale}</p>
              {result.statistical_analysis.post_hoc && (
                <div>
                  <span className="text-gray-500">事后检验：</span>
                  <span>{result.statistical_analysis.post_hoc}</span>
                </div>
              )}
            </div>
          </div>

          {/* 结果 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="font-medium text-sm mb-2">📈 结果</h3>
            <div className="space-y-2 text-sm">
              <p className="text-gray-700">{result.results.summary_stats}</p>
              <p className="text-gray-700">{result.results.test_results}</p>
              {result.results.p_values.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-medium text-gray-500 mb-1">p 值：</p>
                  {result.results.p_values.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span>{p.comparison}</span>
                      <span className="font-mono">{p.p_value}</span>
                      <span className="text-gray-500">{p.significance}</span>
                    </div>
                  ))}
                </div>
              )}
              {result.results.effect_size && (
                <div className="text-xs text-gray-500">
                  效应量：{result.results.effect_size}
                </div>
              )}
            </div>
          </div>

          {/* 解读 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="font-medium text-sm mb-2">💡 解读</h3>
            <p className="text-sm text-gray-700 mb-2">{result.interpretation.conclusion}</p>
            <p className="text-sm text-blue-600">{result.interpretation.biological_meaning}</p>
            {result.interpretation.caveats.length > 0 && (
              <div className="mt-2 text-xs text-amber-600">
                ⚠️ {result.interpretation.caveats.join("；")}
              </div>
            )}
          </div>

          {/* 图表建议 */}
          <div className="bg-white border border-gray-200 rounded-xl p-4">
            <h3 className="font-medium text-sm mb-2">📊 建议图表</h3>
            <div className="text-sm space-y-1">
              <div><span className="text-gray-500">类型：</span>{result.figure_config.type}</div>
              <div><span className="text-gray-500">标题：</span>{result.figure_config.title}</div>
              <div><span className="text-gray-500">X 轴：</span>{result.figure_config.x_axis}</div>
              <div><span className="text-gray-500">Y 轴：</span>{result.figure_config.y_axis}</div>
              {result.figure_config.annotations.length > 0 && (
                <div className="text-xs text-gray-500">
                  标注：{result.figure_config.annotations.join("；")}
                </div>
              )}
            </div>

            {/* 渲染示例图表 */}
            {(result.figure_config.type === "bar_chart" || result.figure_config.type === "box_plot") && csvData && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <ChartRenderer
                  type="bar"
                  title={result.figure_config.title}
                  xLabel={result.figure_config.x_axis}
                  yLabel={result.figure_config.y_axis}
                  data={parseCsvForChart(csvData)}
                  series={["value"]}
                />
              </div>
            )}
            {(result.figure_config.type === "line_chart" || result.figure_config.type === "scatter_plot") && csvData && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <ChartRenderer
                  type="line"
                  title={result.figure_config.title}
                  xLabel={result.figure_config.x_axis}
                  yLabel={result.figure_config.y_axis}
                  data={parseCsvForChart(csvData)}
                  series={["value"]}
                />
              </div>
            )}
          </div>

          {/* 操作 */}
          <div className="flex gap-3">
            <button
              onClick={() => {
                setResult(null);
                setCsvData("");
                setFileName("");
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
            >
              分析新数据
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
