"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import type { TroubleshootResult } from "@/lib/llm/troubleshoot";

// ===== 排障表单 =====

interface TroubleshootFormProps {
  onSubmit: (data: {
    experiment: {
      name: string;
      drug: string;
      concentration: string;
      cellLine: string;
      passage?: string;
      duration: string;
      readouts: string[];
    };
    failure: {
      phenomenon: string;
      details?: string;
    };
  }) => void;
  isLoading: boolean;
}

export function TroubleshootForm({ onSubmit, isLoading }: TroubleshootFormProps) {
  const [experiment, setExperiment] = useState({
    name: "",
    drug: "",
    concentration: "",
    cellLine: "",
    passage: "",
    duration: "",
    readouts: [] as string[],
  });
  const [phenomenon, setPhenomenon] = useState("");
  const [details, setDetails] = useState("");
  const [readoutInput, setReadoutInput] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      experiment: {
        ...experiment,
        passage: experiment.passage || undefined,
      },
      failure: {
        phenomenon,
        details: details || undefined,
      },
    });
  }

  function addReadout() {
    if (readoutInput.trim() && !experiment.readouts.includes(readoutInput.trim())) {
      setExperiment((prev) => ({
        ...prev,
        readouts: [...prev.readouts, readoutInput.trim()],
      }));
      setReadoutInput("");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 实验基本信息 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            实验名称
          </label>
          <input
            value={experiment.name}
            onChange={(e) => setExperiment((p) => ({ ...p, name: e.target.value }))}
            placeholder="例：PD-L1 上调验证"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            药物/干预
          </label>
          <input
            value={experiment.drug}
            onChange={(e) => setExperiment((p) => ({ ...p, drug: e.target.value }))}
            placeholder="例：sorafenib"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            浓度
          </label>
          <input
            value={experiment.concentration}
            onChange={(e) => setExperiment((p) => ({ ...p, concentration: e.target.value }))}
            placeholder="例：5 μM"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            细胞系
          </label>
          <input
            value={experiment.cellLine}
            onChange={(e) => setExperiment((p) => ({ ...p, cellLine: e.target.value }))}
            placeholder="例：Huh7"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            传代数（可选）
          </label>
          <input
            value={experiment.passage}
            onChange={(e) => setExperiment((p) => ({ ...p, passage: e.target.value }))}
            placeholder="例：P10"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 block mb-1">
            处理时间
          </label>
          <input
            value={experiment.duration}
            onChange={(e) => setExperiment((p) => ({ ...p, duration: e.target.value }))}
            placeholder="例：24h"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* 检测指标 */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">
          检测指标
        </label>
        <div className="flex gap-2">
          <input
            value={readoutInput}
            onChange={(e) => setReadoutInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addReadout())}
            placeholder="例：Western blot PD-L1"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <button
            type="button"
            onClick={addReadout}
            className="px-3 py-2 bg-gray-100 rounded-lg text-sm hover:bg-gray-200"
          >
            添加
          </button>
        </div>
        {experiment.readouts.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {experiment.readouts.map((r) => (
              <span key={r} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded flex items-center gap-1">
                {r}
                <button
                  type="button"
                  onClick={() => setExperiment((p) => ({ ...p, readouts: p.readouts.filter((x) => x !== r) }))}
                  className="text-blue-400 hover:text-blue-600"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 失败现象 */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">
          失败现象 <span className="text-red-500">*</span>
        </label>
        <select
          value={phenomenon}
          onChange={(e) => setPhenomenon(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        >
          <option value="">选择失败现象...</option>
          <option value="细胞大面积死亡">细胞大面积死亡</option>
          <option value="没有看到预期效果">没有看到预期效果</option>
          <option value="结果不稳定/重复性差">结果不稳定/重复性差</option>
          <option value="阳性对照不工作">阳性对照不工作</option>
          <option value="背景信号过高">背景信号过高</option>
          <option value="实验污染">实验污染</option>
          <option value="其他">其他</option>
        </select>
      </div>

      {/* 详细描述 */}
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">
          详细描述（可选）
        </label>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="描述你看到的具体现象，越详细越好..."
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={isLoading || !phenomenon || !experiment.drug || !experiment.cellLine}
        className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
      >
        {isLoading ? "正在诊断..." : "🔍 开始诊断"}
      </button>
    </form>
  );
}

// ===== 诊断结果 =====

interface DiagnosisResultProps {
  result: TroubleshootResult;
  onRetry: () => void;
}

export function DiagnosisResult({ result, onRetry }: DiagnosisResultProps) {
  const severityConfig = {
    critical: { icon: "🔴", label: "严重", color: "bg-red-50 border-red-200" },
    moderate: { icon: "🟡", label: "中等", color: "bg-amber-50 border-amber-200" },
    minor: { icon: "🟢", label: "轻微", color: "bg-green-50 border-green-200" },
  };

  const sev = severityConfig[result.severity];

  return (
    <div className="space-y-4">
      {/* 严重程度 */}
      <div className={`p-3 rounded-lg border ${sev.color}`}>
        <span className="text-sm font-medium">
          {sev.icon} 问题严重程度：{sev.label}
        </span>
      </div>

      {/* 可能原因 */}
      <div>
        <h3 className="text-sm font-medium mb-2">🔍 可能的原因</h3>
        <div className="space-y-2">
          {result.likely_causes.map((cause, i) => (
            <div key={i} className="p-3 bg-white border border-gray-200 rounded-lg">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{cause.cause}</span>
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    cause.likelihood === "high"
                      ? "bg-red-100 text-red-700"
                      : cause.likelihood === "medium"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {cause.likelihood === "high" ? "高度可能" : cause.likelihood === "medium" ? "中等可能" : "低可能"}
                </span>
              </div>
              <p className="text-xs text-gray-600">{cause.explanation}</p>
              {cause.evidence && (
                <p className="text-xs text-blue-600 mt-1">📚 {cause.evidence}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 排查步骤 */}
      <div>
        <h3 className="text-sm font-medium mb-2">📋 排查步骤</h3>
        <div className="space-y-2">
          {result.troubleshooting_steps.map((step, i) => (
            <div key={i} className="p-3 bg-white border border-gray-200 rounded-lg">
              <p className="text-sm font-medium">Step {i + 1}：{step.step}</p>
              <p className="text-xs text-gray-500 mt-1">
                预期：{step.what_to_look_for}
              </p>
              <div className="flex gap-4 mt-2 text-xs">
                <div className="flex-1 p-2 bg-green-50 rounded">
                  <span className="text-green-700 font-medium">确认 →</span>{" "}
                  <span className="text-green-600">{step.if_positive}</span>
                </div>
                <div className="flex-1 p-2 bg-gray-50 rounded">
                  <span className="text-gray-700 font-medium">排除 →</span>{" "}
                  <span className="text-gray-600">{step.if_negative}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 快速修复 */}
      {result.quick_fix && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-sm font-medium text-blue-700 mb-2">
            ⚡ 快速修复方案
          </h3>
          <p className="text-sm text-blue-600">{result.quick_fix.description}</p>
          {Object.keys(result.quick_fix.new_parameters).length > 0 && (
            <div className="mt-2 p-2 bg-blue-100 rounded text-xs">
              <span className="font-medium">新参数：</span>
              {Object.entries(result.quick_fix.new_parameters).map(([k, v]) => (
                <span key={k} className="ml-2">
                  {k}={String(v)}
                </span>
              ))}
            </div>
          )}
          {result.quick_fix.risks && (
            <p className="text-xs text-amber-600 mt-2">⚠️ {result.quick_fix.risks}</p>
          )}
        </div>
      )}

      {/* 参考文献 */}
      {result.references.length > 0 && (
        <div className="text-xs text-gray-500">
          参考：{result.references.join("；")}
        </div>
      )}

      {/* 操作 */}
      <div className="flex gap-3">
        <button
          onClick={onRetry}
          className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50"
        >
          重新诊断
        </button>
      </div>
    </div>
  );
}
