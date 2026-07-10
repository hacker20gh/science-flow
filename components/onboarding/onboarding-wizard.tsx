"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FlaskConical,
  Search,
  BookOpen,
  FileText,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Check,
  Loader2,
  Plus,
  Brain,
} from "lucide-react";

interface OnboardingWizardProps {
  onComplete: (projectId: string) => void;
}

export function OnboardingWizard({ onComplete }: OnboardingWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [seedPapers, setSeedPapers] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createdProject, setCreatedProject] = useState<string | null>(null);

  // Step 1: 命名 + 描述研究问题
  // Step 2: 可选的种子文献
  // Step 3: 系统自动处理

  async function handleStep3() {
    setIsCreating(true);
    try {
      // 创建项目
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: projectName, description }),
      });
      const data = await res.json();
      const projectId = data.project?.id;
      if (!projectId) throw new Error("创建失败");
      setCreatedProject(projectId);

      // 如果有种子文献，自动搜索相关文献
      if (description) {
        try {
          await fetch("/api/papers/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: description,
              sources: ["pubmed", "semantic_scholar"],
              maxResults: 10,
            }),
          });
        } catch {
          // 搜索失败不阻断
        }
      }

      onComplete(projectId);
    } catch {
      setIsCreating(false);
    }
  }

  const canProceed = step === 1 ? projectName.trim().length > 0 : true;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <FlaskConical size={32} className="text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {step === 3 && isCreating ? "正在设置你的项目..." : "开始你的科研之旅"}
          </h1>
          <p className="text-gray-500 mt-1">
            {step === 1
              ? "给你的课题起个名字"
              : step === 2
                ? "添加几篇种子文献，AI 会帮你拓展"
                : "系统正在为你准备项目"}
          </p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                  s < step
                    ? "bg-primary text-white"
                    : s === step
                      ? "bg-primary text-white ring-4 ring-primary/20"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {s < step ? <Check size={14} /> : s}
              </div>
              {s < 3 && (
                <div className={`w-12 h-0.5 ${s < step ? "bg-primary" : "bg-gray-200"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  项目名称 <span className="text-red-500">*</span>
                </label>
                <input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="例：PD-1 耐药机制在肝癌中的研究"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  研究问题 / 假设
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="例：sorafenib 通过 NF-κB 通路上调 HCC 细胞中的 PD-L1 表达"
                  rows={3}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <p className="text-xs text-gray-400 mt-1">
                  描述越具体，AI 搜索和提取越精准
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  种子文献（可选）
                </label>
                <textarea
                  value={seedPapers}
                  onChange={(e) => setSeedPapers(e.target.value)}
                  placeholder={`每行一个，支持以下格式：\n• DOI: 10.1038/s41586-024-07123-4\n• PubMed ID: 38901234\n• 关键词: sorafenib PD-L1 HCC\n\n也可以先跳过，稍后在文献管理中搜索`}
                  rows={6}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary font-mono"
                />
              </div>

              {/* 快捷种子文献（示例） */}
              <div>
                <p className="text-xs text-gray-500 mb-2">快速添加示例：</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    "sorafenib resistance HCC",
                    "PD-L1 NF-κB signaling",
                    "immunotherapy liver cancer",
                  ].map((query) => (
                    <button
                      key={query}
                      onClick={() => {
                        setSeedPapers((prev) =>
                          prev ? `${prev}\n关键词: ${query}` : `关键词: ${query}`
                        );
                      }}
                      className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-full hover:bg-blue-100 transition-colors"
                    >
                      + {query}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="text-center py-8 space-y-6">
              {isCreating ? (
                <>
                  <Loader2 size={48} className="animate-spin text-primary mx-auto" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">正在创建项目...</p>
                    <div className="space-y-1 text-xs text-gray-400">
                      <p className="flex items-center justify-center gap-2">
                        <Check size={12} className="text-green-500" /> 项目已创建
                      </p>
                      <p className="flex items-center justify-center gap-2">
                        <Loader2 size={12} className="animate-spin" /> 正在搜索相关文献...
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-3 text-sm text-gray-600">
                    <Sparkles size={20} className="text-amber-500" />
                    <span>准备好了！系统将自动：</span>
                  </div>
                  <div className="grid grid-cols-1 gap-3 text-left max-w-sm mx-auto">
                    {[
                      { icon: Search, text: "搜索 PubMed + Semantic Scholar 相关文献", color: "blue" },
                      { icon: FileText, text: "AI 提取结构化实验数据", color: "purple" },
                      { icon: Brain, text: "生成初始机制矩阵", color: "green" },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                        <item.icon size={16} className={`text-${item.color}-500`} />
                        <span className="text-xs">{item.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-gray-100">
            {step > 1 && !isCreating ? (
              <button
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                <ArrowLeft size={16} /> 上一步
              </button>
            ) : (
              <div />
            )}

            {!isCreating && (
              <button
                onClick={() => {
                  if (step < 3) setStep((s) => (s + 1) as 1 | 2 | 3);
                  else handleStep3();
                }}
                disabled={!canProceed}
                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {step === 3 ? (
                  <>
                    <Sparkles size={16} /> 开始项目
                  </>
                ) : step === 2 ? (
                  <>
                    跳过，直接开始 <ArrowRight size={16} />
                  </>
                ) : (
                  <>
                    下一步 <ArrowRight size={16} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
