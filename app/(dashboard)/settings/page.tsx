"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "sciflow-llm-config";

interface LLMConfig {
  baseUrl: string;
}

const DEFAULT_CONFIG: LLMConfig = {
  baseUrl: "http://127.0.0.1:15721/v1",
};

// CCS 角色选项 —— 只有这三个，CCS 自动映射到当前供应商
const ROLE_OPTIONS = [
  { label: "快速 (Haiku)", value: "extraction", model: "claude-haiku-4-5", desc: "批量处理，速度快" },
  { label: "平衡 (Sonnet)", value: "chat", model: "claude-sonnet-5", desc: "日常对话，质量速度均衡" },
  { label: "最强 (Opus)", value: "analysis", model: "claude-opus-4-8", desc: "深度推理，实验设计/排障/论文" },
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

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">⚙️ 设置</h1>
      <p className="text-gray-500 text-sm mb-8">配置 CCS 网关和模型角色</p>

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

      {/* 模型角色 */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-gray-700 mb-3">模型角色</h2>
        <p className="text-xs text-gray-500 mb-4">
          CCS 根据角色自动映射到当前供应商的对应模型，切换供应商后无需手动改名。
        </p>

        <div className="space-y-3">
          {ROLE_OPTIONS.map((role) => (
            <div key={role.value} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
              <div>
                <div className="text-sm font-medium">{role.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{role.desc}</div>
              </div>
              <code className="text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded">{role.model}</code>
            </div>
          ))}
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
          <span className="text-xs text-green-600">设置已保存</span>
        )}
      </div>

      {/* 说明 */}
      <section className="mt-8 p-4 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
        <p className="font-medium text-gray-600">工作原理：</p>
        <p>1. SciFlow 根据任务类型发送对应角色名（Haiku / Sonnet / Opus）</p>
        <p>2. CC Switch 收到后，根据当前供应商的映射表，调用对应的模型</p>
        <p>3. 切换供应商时，只需在 CC Switch 里切换，SciFlow 无需改动</p>
      </section>
    </main>
  );
}
