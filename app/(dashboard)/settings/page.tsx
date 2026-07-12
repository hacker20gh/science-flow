"use client";

import { useState, useEffect } from "react";

const DEFAULT_BASE_URL = "http://127.0.0.1:15721";

const DEFAULT_MODELS = {
  extraction: "claude-haiku-4-5",
  chat: "claude-sonnet-5",
  analysis: "claude-opus-4-8",
};

// CCS 角色选项 —— 只有这三个，CCS 自动映射到当前供应商
const ROLE_OPTIONS = [
  { label: "快速 (Haiku)", value: "extraction" as const, desc: "批量处理，速度快" },
  { label: "平衡 (Sonnet)", value: "chat" as const, desc: "日常对话，质量速度均衡" },
  { label: "最强 (Opus)", value: "analysis" as const, desc: "深度推理，实验设计/排障/论文" },
];

export default function SettingsPage() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_BASE_URL);
  const [models, setModels] = useState(DEFAULT_MODELS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [zoteroApiKey, setZoteroApiKey] = useState("");

  // Load saved settings on mount
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        if (data.config?.baseUrl) {
          setBaseUrl(data.config.baseUrl);
        }
        if (data.config?.models && typeof data.config.models === "object") {
          setModels((prev) => ({
            extraction: data.config.models.extraction || prev.extraction,
            chat: data.config.models.chat || prev.chat,
            analysis: data.config.models.analysis || prev.analysis,
          }));
        }
        if (data.zoteroApiKey) {
          setZoteroApiKey(data.zoteroApiKey);
        }
      } catch {
        // Keep default
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2500);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, models, zoteroApiKey }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("success", "设置已保存到数据库");
      } else {
        showToast("error", data.error || "保存失败");
      }
    } catch {
      showToast("error", "网络错误，请重试");
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setBaseUrl(DEFAULT_BASE_URL);
    setModels(DEFAULT_MODELS);
    showToast("success", "已重置为默认值，点击「保存设置」生效");
  }

  if (loading) {
    return (
      <main className="p-8 max-w-2xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-blue-600" />
          <span className="ml-3 text-sm text-gray-500">加载设置中...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">⚙️ 设置</h1>
      <p className="text-gray-500 text-sm mb-8">配置 CCS 网关和模型角色</p>

      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-6 right-6 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg transition-all ${
            toast.type === "success"
              ? "bg-green-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* CCS 地址 */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-gray-700 mb-3">CCS 网关地址</h2>
        <input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
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
              <div className="shrink-0">
                <div className="text-sm font-medium">{role.label}</div>
                <div className="text-xs text-gray-400 mt-0.5">{role.desc}</div>
              </div>
              <input
                value={models[role.value]}
                onChange={(e) =>
                  setModels((prev) => ({ ...prev, [role.value]: e.target.value }))
                }
                className="ml-4 flex-1 max-w-xs px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder={DEFAULT_MODELS[role.value]}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Zotero 集成 */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-gray-700 mb-3">📥 Zotero 集成</h2>
        <p className="text-xs text-gray-500 mb-4">
          连接你的 Zotero 文献库，一键导入文献到项目中。
        </p>
        <input
          type="password"
          value={zoteroApiKey}
          onChange={(e) => setZoteroApiKey(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="留空表示不使用 Zotero"
        />
        <p className="text-xs text-gray-400 mt-1">
          前往 <a href="https://www.zotero.org/settings/keys" target="_blank" rel="noopener" className="text-blue-600 hover:underline">zotero.org/settings/keys</a> 生成 API Key
        </p>
      </section>

      {/* 保存 */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "保存中..." : "保存设置"}
        </button>
        <button
          onClick={handleReset}
          className="px-4 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
        >
          重置为默认
        </button>
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
