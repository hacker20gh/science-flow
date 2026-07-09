"use client";

import { useState } from "react";
import type { ExperimentDesign } from "@/lib/llm/experiment-design";

interface ExperimentDesignCardProps {
  design: ExperimentDesign;
  onSave?: () => void;
}

export function ExperimentDesignCard({ design, onSave }: ExperimentDesignCardProps) {
  const [expanded, setExpanded] = useState<string | null>("overview");

  function toggleSection(id: string) {
    setExpanded(expanded === id ? null : id);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* 标题 */}
      <div className="px-6 py-4 border-b border-gray-100">
        <h3 className="font-semibold text-lg">{design.name}</h3>
        <p className="text-sm text-gray-500 mt-1">{design.protocol.duration}</p>
      </div>

      {/* 概览 */}
      <Section
        title="📋 概览"
        id="overview"
        expanded={expanded === "overview"}
        onToggle={() => toggleSection("overview")}
      >
        <div className="space-y-3 text-sm">
          <div>
            <span className="font-medium text-gray-600">假设：</span>
            <p className="mt-1 text-gray-800">{design.hypothesis}</p>
          </div>
          <div>
            <span className="font-medium text-gray-600">设计依据：</span>
            <p className="mt-1 text-gray-800">{design.rationale}</p>
          </div>
          <div>
            <span className="font-medium text-gray-600">推荐样本量：</span>
            <span className="ml-1">
              n={design.sample_size.recommended}（{design.sample_size.rationale}）
            </span>
          </div>
        </div>
      </Section>

      {/* 实验分组 */}
      <Section
        title="🧪 实验分组"
        id="groups"
        expanded={expanded === "groups"}
        onToggle={() => toggleSection("groups")}
      >
        <div className="space-y-2">
          {design.groups.map((group, i) => (
            <div key={i} className="flex items-start gap-3 p-2 bg-gray-50 rounded">
              <span className="text-xs text-gray-400 font-mono shrink-0 mt-0.5">
                {i + 1}
              </span>
              <div>
                <span className="text-sm font-medium">{group.name}</span>
                <span className="text-xs text-gray-500 ml-2">({group.purpose})</span>
                <p className="text-xs text-gray-600 mt-0.5">{group.description}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Protocol */}
      <Section
        title="📝 Protocol"
        id="protocol"
        expanded={expanded === "protocol"}
        onToggle={() => toggleSection("protocol")}
      >
        <div className="space-y-3 text-sm">
          <div>
            <span className="font-medium text-gray-600">细胞系：</span>
            <span>{design.protocol.cellLine}</span>
            {design.protocol.passage && (
              <span className="text-gray-500 ml-1">({design.protocol.passage})</span>
            )}
          </div>

          {/* 试剂 */}
          <div>
            <span className="font-medium text-gray-600 block mb-1">试剂：</span>
            <div className="space-y-1">
              {design.protocol.reagents.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-xs pl-2">
                  <span>•</span>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-gray-500">{r.concentration}</span>
                  {r.source && (
                    <span className="text-gray-400">[{r.source}]</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 步骤 */}
          <div>
            <span className="font-medium text-gray-600 block mb-2">步骤：</span>
            <div className="space-y-2">
              {design.protocol.steps.map((step, i) => (
                <div key={i} className="flex gap-3">
                  <span className="text-xs font-mono text-blue-600 shrink-0 w-16">
                    {step.day}
                  </span>
                  <div>
                    <span className="text-sm font-medium">{step.action}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{step.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 检测指标 */}
          <div>
            <span className="font-medium text-gray-600">检测指标：</span>
            <span>{design.protocol.readouts.join("、")}</span>
          </div>
        </div>
      </Section>

      {/* 对照组检查 */}
      <Section
        title="✅ 对照组检查"
        id="controls"
        expanded={expanded === "controls"}
        onToggle={() => toggleSection("controls")}
      >
        <div className="space-y-2 text-sm">
          <div className="grid grid-cols-3 gap-2">
            <div className={`text-center p-2 rounded ${design.controls_check.has_vehicle ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {design.controls_check.has_vehicle ? "✅" : "❌"} Vehicle
            </div>
            <div className={`text-center p-2 rounded ${design.controls_check.has_positive ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {design.controls_check.has_positive ? "✅" : "❌"} 阳性对照
            </div>
            <div className={`text-center p-2 rounded ${design.controls_check.has_negative ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
              {design.controls_check.has_negative ? "✅" : "❌"} 阴性对照
            </div>
          </div>
          {design.controls_check.missing.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700">
              ⚠️ 缺少：{design.controls_check.missing.join("、")}
              <br />
              💡 {design.controls_check.suggestions.join("；")}
            </div>
          )}
        </div>
      </Section>

      {/* 预期结果 */}
      <Section
        title="🔮 预期结果"
        id="outcomes"
        expanded={expanded === "outcomes"}
        onToggle={() => toggleSection("outcomes")}
      >
        <div className="space-y-3">
          {design.expected_outcomes.map((outcome, i) => (
            <div key={i} className="p-3 bg-gray-50 rounded text-sm">
              <p className="font-medium">场景 {i + 1}：{outcome.scenario}</p>
              <p className="text-gray-600 mt-1">解释：{outcome.interpretation}</p>
              <p className="text-blue-600 mt-1">→ {outcome.nextStep}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 参考文献 */}
      {design.references.length > 0 && (
        <div className="px-6 py-3 border-t border-gray-100 text-xs text-gray-500">
          参考文献：{design.references.join("；")}
        </div>
      )}

      {/* 操作栏 */}
      <div className="px-6 py-3 border-t border-gray-100 flex gap-2">
        <button
          onClick={onSave}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          保存到项目
        </button>
        <button className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50">
          下载 PDF
        </button>
      </div>
    </div>
  );
}

// Section 折叠组件
function Section({
  title,
  id,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  id: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-gray-100">
      <button
        onClick={onToggle}
        className="w-full px-6 py-3 flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        <span>{title}</span>
        <span className="text-gray-400 text-xs">{expanded ? "▾" : "▸"}</span>
      </button>
      {expanded && <div className="px-6 pb-4">{children}</div>}
    </div>
  );
}
