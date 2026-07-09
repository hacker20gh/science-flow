"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "sciflow-llm-config";

interface LLMConfig {
  baseUrl: string;
  models: {
    extraction: string;
    chat: string;
    analysis: string;
  };
}

const DEFAULT_CONFIG: LLMConfig = {
  baseUrl: "http://127.0.0.1:15721/v1",
  models: {
    extraction: "claude-haiku-4-5",
    chat: "claude-sonnet-5",
    analysis: "claude-opus-4-8",
  },
};

const PRESET_OPTIONS = [
  { label: "Claude Haiku", value: "claude-haiku-4-5" },
  { label: "Claude Sonnet 5", value: "claude-sonnet-5" },
  { label: "Claude Opus 4.8", value: "claude-opus-4-8" },
  { label: "DeepSeek Chat", value: "deepseek-chat" },
  { label: "DeepSeek Reasoner", value: "deepseek-reasoner" },
  { label: "MiMo V2", value: "mimo-v2.5" },
  { label: "Qwen Plus", value: "qwen-plus" },
  { label: "GPT-4o", value: "gpt-4o" },
  { label: "GPT-4o Mini", value: "gpt-4o-mini" },
];

function loadConfig(): LLMConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_CONFIG;
}

function saveConfig(config: LLMConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export default function SettingsPage() {
  const [config, setConfig] = useState<LLMConfig>(DEFAULT_CONFIG);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setConfig(loadConfig());
  }, []);

  function handleSave() {
    saveConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function updateModel(key: keyof LLMConfig["models"], value: string) {
    setConfig((prev) => ({
      ...prev,
      models: { ...prev.models, [key]: value },
    }));
  }

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">⚙️ 设置</h1>
      <p className="text-gray-500 text-sm mb-8">配置 CCS 网关和模型映射</p>

      {/* CCS 地址 */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-gray-700 mb-3">CCS 网关地址</h2>
        <input
          value={config.baseUrl}
          onChange={(e) => setConfig((prev) => ({ ...prev, baseUrl: e.target.value }))}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          placeholder="http://127.0.0.1:15721/v1"
        />
        <p className="text-xs text-gray-400 mt-1">
          CC Switch 本地代理地址，通常为 http://127.0.0.1:{":15721/v1"}
        </p>
      </section>

      {/* 模型映射 */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-gray-700 mb-3">模型映射</h2>
        <p className="text-xs text-gray-500 mb-4">
          每次在 CC Switch 切换供应商后，来这里更新模型名。模型名需要与 CCS 的映射配置一致。
        </p>

        <div className="space-y-4">
          {/* 文献提取 */}
          <ModelSelector
            label="文献提取"
            description="处理速度优先，用于批量提取论文信息"
            value={config.models.extraction}
            onChange={(v) => updateModel("extraction", v)}
          />

          {/* AI 对话 */}
          <ModelSelector
            label="AI 对话"
            description="质量与速度平衡，用于日常对话"
            value={config.models.chat}
            onChange={(v) => updateModel("chat", v)}
          />

          {/* 深度分析 */}
          <ModelSelector
            label="深度分析"
            description="最强推理能力，用于实验设计、排障、论文组装"
            value={config.models.analysis}
            onChange={(v) => updateModel("analysis", v)}
          />
        </div>
      </section>

      {/* 保存 */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700"
        >
          {saved ? "✅ 已保存" : "保存设置"}
        </button>
        {saved && (
          <span className="text-xs text-green-600">设置已保存，重启后生效</span>
        )}
      </div>

      {/* 说明 */}
      <section className="mt-8 p-4 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
        <p className="font-medium text-gray-600">使用说明：</p>
        <p>1. 在 CC Switch 中选择要使用的供应商（如 MiMo、DeepSeek、Claude 等）</p>
        <p>2. 回到这里，更新对应的模型名（确保与 CCS 的映射配置一致）</p>
        <p>3. 点击保存，重启 SciFlow AI 的 dev server</p>
        <p>4. SciFlow AI 会使用更新后的模型调用 CCS</p>
      </section>
    </main>
  );
}

// ===== 模型选择器组件 =====

function ModelSelector({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [isCustom, setIsCustom] = useState(false);
  const isPreset = PRESET_OPTIONS.some((o) => o.value === value);

  return (
    <div className="p-4 border border-gray-200 rounded-lg">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs text-gray-400">{description}</span>
      </div>

      <div className="flex gap-2">
        {!isCustom && (
          <select
            value={isPreset ? value : ""}
            onChange={(e) => {
              if (e.target.value) {
                onChange(e.target.value);
              }
            }}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            {PRESET_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} ({opt.value})
              </option>
            ))}
            <option value="" disabled>
              自定义...
            </option>
          </select>
        )}

        {isCustom && (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
            placeholder="输入模型名"
          />
        )}

        <button
          onClick={() => {
            if (!isCustom) setIsCustom(true);
          }}
          className="px-3 py-2 text-xs border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          {isCustom ? "选预设" : "自定义"}
        </button>
      </div>
    </div>
  );
}
