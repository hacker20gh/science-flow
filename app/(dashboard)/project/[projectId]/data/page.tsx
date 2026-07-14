"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import Papa from "papaparse";
import dynamic from "next/dynamic";
import { useProjectStore } from "@/store/project-store";
import { consumeSSEStream } from "@/lib/llm/sse-consumer";
import type { AnalysisResult } from "@/lib/llm/analysis";

const ChartRenderer = dynamic(
  () => import("@/components/charts/chart-renderer").then((m) => m.ChartRenderer),
  {
    loading: () => <div className="h-64 animate-pulse bg-muted rounded" />,
    ssr: false,
  }
);

export default function DataPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { addEvent } = useProjectStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function parseCsvForChart(text: string): Array<Record<string, string | number>> {
    const result = Papa.parse(text, { skipEmptyLines: true });
    if (result.data.length < 2) return [];
    const headers = (result.data[0] as string[]).map((h) => h.trim());
    return result.data.slice(1, 21).map((row) => {
      const values = row as string[];
      const record: Record<string, string | number> = {};
      headers.forEach((h, i) => {
        const val = values[i]?.trim() ?? "";
        const num = parseFloat(val);
        record[h] = isNaN(num) || val === "" ? val : num;
      });
      return record;
    });
  }

  const [csvData, setCsvData] = useState<string>("");
  const [fileName, setFileName] = useState<string>("");
  const [experimentContext, setExperimentContext] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [progressMessage, setProgressMessage] = useState("");

  // Restore analysis results from DB on mount
  useEffect(() => {
    fetch(`/api/projects/${projectId}/data/analysis`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.analysis) {
          setResult(data.analysis as AnalysisResult);
          if (data.fileName) setFileName(data.fileName);
        }
      })
      .catch((err) => {
        console.error("[Data] Failed to restore analysis from DB:", err);
      }); // silent — no stored analysis is fine
  }, [projectId]);

  const processFile = useCallback((file: File) => {
    setFileName(file.name);
    setError(null);

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const XLSX = await import("xlsx");
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheetName = workbook.SheetNames[0];
          if (!sheetName) {
            setError("Excel 文件为空或无法解析");
            return;
          }
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet);
          if (!csv.trim()) {
            setError("Excel 文件为空或无法解析");
            return;
          }
          setCsvData(csv);
        } catch {
          setError("Excel 文件解析失败，请检查文件格式");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      // CSV / TSV / TXT — use papaparse via raw text
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setCsvData(text);
      };
      reader.readAsText(file);
    }
  }, []);

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  async function handleAnalyze() {
    if (!csvData) return;

    setIsAnalyzing(true);
    setError(null);
    setProgressMessage("");

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

      consumeSSEStream(res, {
        onProgress: (step) => {
          setProgressMessage(step);
        },
        onResult: (data) => {
          const analysisResult = data as AnalysisResult;
          setResult(analysisResult);
          addEvent(
            "experiment_completed",
            "数据分析完成",
            `完成 ${fileName} 的统计分析：${analysisResult.statistical_analysis.recommended_test}`
          );
          // Persist to DB (fire-and-forget)
          fetch(`/api/projects/${projectId}/data/analysis`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              analysis: analysisResult,
              fileName,
              csvData: csvData.slice(0, 10000),
            }),
          }).catch((err) => {
            console.error("[Data] Failed to persist analysis to DB:", err);
          }); // non-blocking
        },
        onError: (msg) => {
          setError(msg);
        },
        onDone: () => {
          setIsAnalyzing(false);
        },
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "分析失败");
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
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              isDragging
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-blue-400 hover:bg-blue-50/50"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.xlsx,.xls,.txt"
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
                  支持 CSV、TSV、Excel (xlsx/xls) 格式
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
          <p className="text-sm text-gray-500">{progressMessage || "正在分析数据..."}</p>
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
            {result.figure_config.type === "bar_chart" && csvData && (
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
            {result.figure_config.type === "box_plot" && csvData && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <ChartRenderer
                  type="box_plot"
                  title={result.figure_config.title}
                  xLabel={result.figure_config.x_axis}
                  yLabel={result.figure_config.y_axis}
                  data={parseCsvForChart(csvData)}
                  series={["value"]}
                />
              </div>
            )}
            {result.figure_config.type === "heatmap" && csvData && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <ChartRenderer
                  type="heatmap"
                  title={result.figure_config.title}
                  xLabel={result.figure_config.x_axis}
                  yLabel={result.figure_config.y_axis}
                  data={parseCsvForChart(csvData)}
                  series={["value"]}
                />
              </div>
            )}
            {result.figure_config.type === "line_chart" && csvData && (
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
            {result.figure_config.type === "scatter_plot" && csvData && (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <ChartRenderer
                  type="scatter"
                  title={result.figure_config.title}
                  xLabel={result.figure_config.x_axis}
                  yLabel={result.figure_config.y_axis}
                  data={parseCsvForChart(csvData)}
                  series={["value"]}
                />
              </div>
            )}
          </div>

          {/* 相关知识库文章 */}
          {result.statistical_analysis.recommended_test && (
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <h3 className="font-medium text-sm mb-3">📚 相关知识库文章</h3>
              <p className="text-xs text-gray-500 mb-3">
                根据推荐的统计方法「{result.statistical_analysis.recommended_test}」，以下文章可能对你有帮助：
              </p>
              <div className="flex flex-wrap gap-2">
                <KnowledgeArticleLink method={result.statistical_analysis.recommended_test} />
              </div>
            </div>
          )}

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

/**
 * Based on the recommended statistical method, suggest relevant knowledge articles.
 */
function KnowledgeArticleLink({ method }: { method: string }) {
  const methodLower = method.toLowerCase();
  const articles: { id: string; label: string; description: string }[] = [];

  if (methodLower.includes("t-test") || methodLower.includes("t test") || methodLower.includes("student")) {
    articles.push({ id: "p-value", label: "P 值是什么？", description: "理解 p 值的含义、常见误解和正确使用方法" });
  }
  if (methodLower.includes("anova") || methodLower.includes("方差分析") || methodLower.includes("f-test")) {
    articles.push({ id: "multiple-testing", label: "多重检验校正", description: "Bonferroni、FDR 和为什么不能反复做 t 检验" });
  }
  if (methodLower.includes("chi") || methodLower.includes("卡方") || methodLower.includes("chi-square")) {
    articles.push({ id: "effect-size", label: "效应量（Effect Size）", description: "统计显著 ≠ 生物学意义：如何衡量效应大小" });
  }

  // Always suggest statistical reporting as a general reference
  articles.push({ id: "statistical-reporting", label: "统计结果的规范报告", description: "APA 格式、t(F) 值怎么写、p 值的正确呈现" });

  return (
    <>
      {articles.map((article) => (
        <Link
          key={article.id}
          href={`/knowledge?article=${article.id}`}
          className="group block w-full sm:w-auto p-3 bg-blue-50 border border-blue-100 rounded-lg hover:border-blue-300 hover:bg-blue-100/50 transition-all text-left"
        >
          <div className="text-xs font-medium text-blue-700 group-hover:text-blue-800">{article.label}</div>
          <div className="text-[11px] text-blue-500/80 mt-0.5">{article.description}</div>
        </Link>
      ))}
    </>
  );
}
