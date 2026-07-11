"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useProjectStore } from "@/store/project-store";
import { exportManuscriptToLatex, exportManuscriptToWord, downloadFile } from "@/lib/export";
import { consumeSSEStream } from "@/lib/llm/streaming";
import type { ManuscriptDraft } from "@/lib/llm/manuscript";
import type { ReviewSimulation } from "@/lib/llm/reviewer";

const SECTIONS = [
  { id: "abstract", label: "Abstract", desc: "背景 + 方法 + 结果 + 结论" },
  { id: "introduction", label: "Introduction", desc: "从宽到窄，引出你的假设" },
  { id: "methods", label: "Methods", desc: "可重复的实验细节" },
  { id: "results", label: "Results", desc: "按逻辑顺序展示发现" },
  { id: "discussion", label: "Discussion", desc: "解读结果，联系文献" },
] as const;

/** 转义 HTML 特殊字符，防止 XSS */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export default function ManuscriptPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const { papers, matrix } = useProjectStore();
  const [projectName, setProjectName] = useState("");
  const [hypothesis, setHypothesis] = useState("");

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.project) {
          setProjectName(d.project.name);
          setHypothesis(d.project.hypotheses?.[0]?.statement || "");
        }
      })
      .catch(() => {});
  }, [projectId]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [draft, setDraft] = useState<ManuscriptDraft | null>(null);
  const [activeSection, setActiveSection] = useState<string>("abstract");
  const [error, setError] = useState<string | null>(null);
  const [isReviewing, setIsReviewing] = useState(false);
  const [review, setReview] = useState<ReviewSimulation | null>(null);
  const [progressMessage, setProgressMessage] = useState("");
  const [reviewProgress, setReviewProgress] = useState("");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const extractedPapers = papers.filter(
    (p) => p.extractionStatus === "done" && p.experiments.length > 0
  );

  async function handleGenerate(section: string) {
    setIsGenerating(true);
    setError(null);

    setProgressMessage("");

    let res: Response;
    try {
      res = await fetch("/api/manuscript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: projectName || "科研项目",
          hypothesis: hypothesis || "待确定假设",
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

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "生成失败");
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "生成失败");
      setIsGenerating(false);
      return;
    }

    consumeSSEStream(res, {
      onProgress: (step) => {
        setProgressMessage(step || "正在组装论文...");
      },
      onResult: (data) => {
        const newDraft = data as ManuscriptDraft;
        if (section !== "all" && draft) {
          // Only update the target section, keep others unchanged
          setDraft({
            ...draft,
            [section]: newDraft[section as keyof ManuscriptDraft],
          });
        } else {
          setDraft(newDraft);
        }
        setActiveSection(section === "all" ? "abstract" : section);
        setIsGenerating(false);
      },
      onError: (message) => {
        setError(message);
        setIsGenerating(false);
      },
      onDone: () => {
        setIsGenerating(false);
      },
    });
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
              <button
                onClick={() => {
                  const sections: Record<string, string | undefined> = {};
                  for (const s of SECTIONS) {
                    const data = draft[s.id as keyof ManuscriptDraft];
                    sections[s.id] = data?.content;
                  }
                  const latex = exportManuscriptToLatex(sections);
                  downloadFile(latex, "manuscript.tex", "application/x-latex");
                }}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
              >
                下载 LaTeX
              </button>
              <button
                onClick={async () => {
                  const sections: Record<string, string | undefined> = {};
                  for (const s of SECTIONS) {
                    const data = draft[s.id as keyof ManuscriptDraft];
                    sections[s.id] = data?.content;
                  }
                  const blob = await exportManuscriptToWord(sections);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "manuscript.docx";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
              >
                下载 Word
              </button>
              <button
                onClick={() => {
                  const sectionOrder = ["abstract", "introduction", "methods", "results", "discussion"] as const;
                  const sectionTitles: Record<string, string> = {
                    abstract: "Abstract",
                    introduction: "Introduction",
                    methods: "Methods",
                    results: "Results",
                    discussion: "Discussion",
                  };

                  const contentHtml = sectionOrder
                    .filter((s) => draft[s]?.content)
                    .map(
                      (s) =>
                        `<h2>${sectionTitles[s]}</h2>` +
                        `<div style="white-space:pre-wrap;font-size:12pt;line-height:1.6;margin-bottom:1.5em">${escapeHtml(draft[s]!.content)}</div>`
                    )
                    .join("\n");

                  const printWindow = window.open("", "_blank");
                  if (printWindow) {
                    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Manuscript - PDF Export</title>
  <style>
    body { font-family: 'Times New Roman', serif; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #000; }
    h2 { font-size: 16pt; margin-top: 1.5em; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
    @media print { body { margin: 1in; } }
  </style>
</head>
<body>
  <h1 style="text-align:center;font-size:20pt">Research Article</h1>
  <div style="text-align:center;margin-bottom:2em;font-size:12pt;color:#555">Author Name</div>
  ${contentHtml}
</body>
</html>`);
                    printWindow.document.close();
                    printWindow.focus();
                    // 给浏览器一点时间渲染，再弹出打印对话框
                    setTimeout(() => printWindow.print(), 300);
                  }
                }}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50"
              >
                下载 PDF
              </button>
              <button
                onClick={async () => {
                  setIsReviewing(true);
                  setReviewProgress("");
                  try {
                    const res = await fetch("/api/manuscript/review", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        manuscript: Object.fromEntries(
                          Object.entries(draft).map(([k, v]) => [k, v.content])
                        ),
                      }),
                    });
                    if (!res.ok) {
                      const errorData = await res.json().catch(() => ({}));
                      throw new Error(errorData.error || "审稿失败");
                    }
                    consumeSSEStream(res, {
                      onProgress: (step) => {
                        setReviewProgress(step || "正在模拟审稿...");
                      },
                      onResult: (data) => {
                        setReview(data as ReviewSimulation);
                        setIsReviewing(false);
                      },
                      onError: (message) => {
                        setError(message);
                        setIsReviewing(false);
                      },
                      onDone: () => {
                        setIsReviewing(false);
                      },
                    });
                  } catch (err: unknown) {
                    setError(err instanceof Error ? err.message : "审稿人模拟失败");
                    setIsReviewing(false);
                  }
                }}
                disabled={isReviewing}
                className="px-3 py-1 text-xs bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
              >
                {isReviewing ? "模拟审稿中..." : "🎭 审稿人模拟"}
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
                <h3 className="font-medium text-sm">{s.label}</h3>
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
          <p className="text-sm text-gray-500">
            {progressMessage || "正在组装论文草稿..."}
          </p>
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
                  {editingSection === activeSection ? (
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onBlur={() => {
                        // Save edited content to draft state
                        setDraft((prev) =>
                          prev
                            ? {
                                ...prev,
                                [activeSection]: {
                                  ...prev[activeSection as keyof ManuscriptDraft],
                                  content: editContent,
                                },
                              }
                            : prev
                        );
                        setEditingSection(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") setEditingSection(null);
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.currentTarget.blur();
                        }
                      }}
                      className="w-full min-h-[300px] p-4 text-sm leading-relaxed border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                      autoFocus
                    />
                  ) : (
                    <div
                      onClick={() => {
                        setEditingSection(activeSection);
                        setEditContent(currentSection.content);
                      }}
                      className="cursor-text hover:bg-gray-50 rounded-lg p-4 -m-4 transition-colors"
                      title="点击编辑"
                    >
                      <div className="prose prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {currentSection.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
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

      {/* 审稿人模拟结果 */}
      {review && (
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold">🎭 审稿人模拟结果</h2>

          {/* 综合判断 */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 text-sm">
            <p className="font-medium text-purple-700 mb-1">综合判断</p>
            <p className="text-purple-600">{review.overall_verdict}</p>
          </div>

          {/* 优先修改 */}
          {review.priority_fixes.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
              <p className="font-medium text-amber-700 mb-1">🎯 优先修改</p>
              {review.priority_fixes.map((fix, i) => (
                <p key={i} className="text-amber-600 text-xs">• {fix}</p>
              ))}
            </div>
          )}

          {/* 三位审稿人 */}
          {review.reviewers.map((r) => (
            <div key={r.reviewer_id} className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-sm font-medium">{r.persona}</span>
                  <span className="text-xs text-gray-400 ml-2">评分：{r.score}/10</span>
                </div>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    r.overall_assessment === "accept"
                      ? "bg-green-100 text-green-700"
                      : r.overall_assessment === "minor_revision"
                        ? "bg-blue-100 text-blue-700"
                        : r.overall_assessment === "major_revision"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-red-100 text-red-700"
                  }`}
                >
                  {r.overall_assessment === "accept" ? "接收"
                    : r.overall_assessment === "minor_revision" ? "小修"
                    : r.overall_assessment === "major_revision" ? "大修" : "拒稿"}
                </span>
              </div>
              <p className="text-xs text-gray-600 mb-3">{r.summary}</p>
              <div className="space-y-2">
                {r.comments.map((c, i) => (
                  <div key={i} className="p-2 bg-gray-50 rounded text-xs">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`px-1.5 py-0.5 rounded ${
                          c.severity === "major"
                            ? "bg-red-100 text-red-700"
                            : c.severity === "minor"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {c.severity === "major" ? "主要" : c.severity === "minor" ? "次要" : "建议"}
                      </span>
                      <span className="text-gray-500">[{c.section}]</span>
                      <span className="text-gray-400">{c.category}</span>
                    </div>
                    <p className="text-gray-700">{c.comment}</p>
                    <p className="text-blue-600 mt-1">💡 {c.suggested_fix}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
