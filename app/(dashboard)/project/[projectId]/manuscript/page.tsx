"use client";

import { useState } from "react";
import { useProjectStore } from "@/store/project-store";
import type { ManuscriptDraft } from "@/lib/llm/manuscript";

const SECTIONS = [
  { id: "abstract", label: "Abstract", icon: "📋", desc: "背景 + 方法 + 结果 + 结论" },
  { id: "introduction", label: "Introduction", icon: "📖", desc: "从宽到窄，引出你的假设" },
  { id: "methods", label: "Methods", icon: "🔬", desc: "可重复的实验细节" },
  { id: "results", label: "Results", icon: "📊", desc: "按逻辑顺序展示发现" },
  { id: "discussion", label: "Discussion", icon: "💬", desc: "解读结果，联系文献" },
] as const;

export default function ManuscriptPage() {
  const { papers, matrix } = useProjectStore();

  const [isGenerating, setIsGenerating] = useState(false);
  const [draft, setDraft] = useState<ManuscriptDraft | null>(null);
  const [activeSection, setActiveSection] = useState<string>("abstract");
  const [error, setError] = useState<string | null>(null);

  const extractedPapers = papers.filter(
    (p) => p.extractionStatus === "done" && p.experiments.length > 0
  );

  async function handleGenerate(section: string) {
    setIsGenerating(true);
    setError(null);

    try {
      const res = await fetch("/api/manuscript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: "PD-1 耐药机制在肝癌中的研究",
          hypothesis: "sorafenib 通过 NF-κB 上调 HCC 中的 PD-L1 表达",
          matrixSummary: matrix
            ? `${matrix.totalPapers} 篇文献，${matrix.totalExperiments} 个实验`
            : "",
          papers: extractedPapers.map((p) => ({
            title: p.title,
            authors: p.authors,
            year: p.year,
            journal: p.journal,
          })),
          experiments: extractedPapers.flatMap((p) =>
            p.experiments.map((e) => ({
              name: `${e.drug_intervention.name} ${e.drug_intervention.concentration || ""}`,
              protocol: `细胞系：${e.model.cell_line}，处理：${e.drug_intervention.duration || "24h"}`,
              result: e.conclusion,
            }))
          ),
          section,
        }),
      });

      if (!res.ok) throw new Error((await res.json()).error || "生成失败");

      const data = await res.json();
      setDraft(data);
      setActiveSection(section === "all" ? "abstract" : section);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "生成失败");
    } finally {
      setIsGenerating(false);
    }
  }

  const currentSection = draft
    ? draft[activeSection as keyof ManuscriptDraft]
    : null;

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-1">📝 论文组装</h1>
          <p className="text-gray-500 text-sm">
            从文献和实验数据自动组装论文草稿
          </p>
        </div>
        <div className="flex gap-2">
          {draft && (
            <>
              <button className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
                下载 LaTeX
              </button>
              <button className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50">
                下载 Word
              </button>
            </>
          )}
        </div>
      </div>

      {/* 上下文预览 */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 text-xs text-gray-500">
        <p className="font-medium text-gray-600 mb-1">AI 将使用以下数据组装论文：</p>
        <p>📚 {extractedPapers.length} 篇已提取文献</p>
        <p>🧪 {extractedPapers.flatMap((p) => p.experiments).length} 个实验数据</p>
        <p>📊 机制矩阵：{matrix ? `${matrix.columns.length} 个维度` : "暂无"}</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          ⚠️ {error}
        </div>
      )}

      {/* 生成按钮 */}
      {!draft && !isGenerating && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => handleGenerate(s.id)}
                className="p-4 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all text-left"
              >
                <span className="text-lg">{s.icon}</span>
                <h3 className="font-medium text-sm mt-2">{s.label}</h3>
                <p className="text-xs text-gray-500 mt-1">{s.desc}</p>
              </button>
            ))}
          </div>
          <button
            onClick={() => handleGenerate("all")}
            className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            🚀 一键组装全部章节
          </button>
        </div>
      )}

      {/* 生成中 */}
      {isGenerating && (
        <div className="text-center py-12 space-y-3">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-600" />
          <p className="text-sm text-gray-500">正在组装论文草稿...</p>
          <p className="text-xs text-gray-400">这可能需要 1-2 分钟</p>
        </div>
      )}

      {/* 草稿展示 */}
      {draft && (
        <div className="flex gap-6">
          {/* 侧边导航 */}
          <nav className="w-48 shrink-0 space-y-1">
            {SECTIONS.map((s) => {
              const sectionData = draft[s.id as keyof ManuscriptDraft];
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveSection(s.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
                    activeSection === s.id
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <span>{s.icon} </span>
                  <span>{s.label}</span>
                  {sectionData && (
                    <span className="text-xs text-gray-400 ml-1">
                      {sectionData.word_count} 词
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* 内容区 */}
          <div className="flex-1 space-y-4">
            {currentSection && (
              <>
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                  <div className="prose prose-sm max-w-none">
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {currentSection.content}
                    </div>
                  </div>
                </div>

                {/* 元信息 */}
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>📝 {currentSection.word_count} 词</span>
                  <span>📚 引用 {currentSection.citations.length} 篇</span>
                </div>

                {/* 修改建议 */}
                {currentSection.notes.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                    <p className="font-medium text-amber-700 mb-1">💡 修改建议：</p>
                    {currentSection.notes.map((note, i) => (
                      <p key={i} className="text-amber-600">• {note}</p>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* 重新生成 */}
            <button
              onClick={() => handleGenerate(activeSection)}
              disabled={isGenerating}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50"
            >
              重新生成当前章节
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
