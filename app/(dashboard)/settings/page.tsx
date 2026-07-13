"use client";

import { useState, useEffect, useCallback } from "react";

const PROVIDER_PRESETS: Record<string, { baseUrl: string; name: string; group: string }> = {
  // China
  deepseek: { baseUrl: "https://api.deepseek.com/v1", name: "DeepSeek", group: "China" },
  qwen: { baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", name: "Qwen (Alibaba)", group: "China" },
  moonshot: { baseUrl: "https://api.moonshot.cn/v1", name: "Moonshot (Kimi)", group: "China" },
  zhipu: { baseUrl: "https://open.bigmodel.cn/api/paas/v4", name: "Zhipu GLM", group: "China" },
  baichuan: { baseUrl: "https://api.baichuan-ai.com/v1", name: "Baichuan", group: "China" },
  yi: { baseUrl: "https://api.lingyiwanwu.com/v1", name: "Yi (01.AI)", group: "China" },
  minimax: { baseUrl: "https://api.minimax.chat/v1", name: "MiniMax", group: "China" },
  stepfun: { baseUrl: "https://api.stepfun.com/v1", name: "StepFun", group: "China" },
  spark: { baseUrl: "https://spark-api-open.xf-yun.com/v1", name: "Spark (iFlytek)", group: "China" },
  doubao: { baseUrl: "https://ark.cn-beijing.volces.com/api/v3", name: "Doubao (ByteDance)", group: "China" },
  siliconflow: { baseUrl: "https://api.siliconflow.cn/v1", name: "SiliconFlow", group: "China" },
  hunyuan: { baseUrl: "https://api.hunyuan.cloud.tencent.com/v1", name: "Hunyuan (Tencent)", group: "China" },
  mimo: { baseUrl: "https://api.xiaomimimo.com/v1", name: "MIMO (Pay-as-you-go)", group: "China" },
  mimo_tp: { baseUrl: "https://token-plan-cn.xiaomimimo.com/v1", name: "MIMO (Token Plan)", group: "China" },
  // International
  openai: { baseUrl: "https://api.openai.com/v1", name: "OpenAI", group: "International" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", name: "Anthropic", group: "International" },
  google: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", name: "Google Gemini", group: "International" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", name: "Groq", group: "International" },
  together: { baseUrl: "https://api.together.xyz/v1", name: "Together AI", group: "International" },
  fireworks: { baseUrl: "https://api.fireworks.ai/inference/v1", name: "Fireworks AI", group: "International" },
  mistral: { baseUrl: "https://api.mistral.ai/v1", name: "Mistral", group: "International" },
  perplexity: { baseUrl: "https://api.perplexity.ai", name: "Perplexity", group: "International" },
  cohere: { baseUrl: "https://api.cohere.com/v2", name: "Cohere", group: "International" },
  xai: { baseUrl: "https://api.x.ai/v1", name: "xAI (Grok)", group: "International" },
  cerebras: { baseUrl: "https://api.cerebras.ai/v1", name: "Cerebras", group: "International" },
  sambanova: { baseUrl: "https://api.sambanova.ai/v1", name: "SambaNova", group: "International" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", name: "OpenRouter", group: "Aggregator" },
  // Local
  ollama: { baseUrl: "http://localhost:11434/v1", name: "Ollama", group: "Local" },
  lmstudio: { baseUrl: "http://localhost:1234/v1", name: "LM Studio", group: "Local" },
  vllm: { baseUrl: "http://localhost:8000/v1", name: "vLLM", group: "Local" },
  custom: { baseUrl: "", name: "Custom", group: "Other" },
};

const DEFAULT_MODELS = {
  extraction: "deepseek-chat",
  chat: "deepseek-chat",
  analysis: "deepseek-reasoner",
};

// 常见模型预设（按供应商分组）
const COMMON_MODELS: Record<string, string[]> = {
  deepseek: ["deepseek-chat", "deepseek-reasoner", "deepseek-coder"],
  qwen: ["qwen-plus", "qwen-turbo", "qwen-max", "qwen-long"],
  moonshot: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
  zhipu: ["glm-4", "glm-4-flash", "glm-4-long", "glm-4-air"],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-mini", "o3-mini"],
  anthropic: ["claude-sonnet-5", "claude-haiku-4-5", "claude-opus-4-8"],
  google: ["gemini-2.0-flash", "gemini-2.5-pro", "gemini-1.5-flash"],
  mimo: ["mimo-v2.5", "mimo-v2.5-pro", "mimo-v2.5-pro-ultraspeed"],
  mimo_tp: ["mimo-v2.5", "mimo-v2.5-pro", "mimo-v2.5-pro-ultraspeed"],
  groq: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"],
  ollama: ["llama3.1", "qwen2.5", "deepseek-r1", "mistral", "phi3"],
};

interface ModelInfo {
  id: string;
  name?: string;
}

export default function SettingsPage() {
  const [provider, setProvider] = useState("deepseek");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState(DEFAULT_MODELS);
  const [zoteroApiKey, setZoteroApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  // 模型列表自动获取
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [modelsFetched, setModelsFetched] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings");
        const data = await res.json();
        if (data.config) {
          const cfg = data.config;
          if (cfg.provider) setProvider(cfg.provider);
          if (cfg.apiBaseUrl) setApiBaseUrl(cfg.apiBaseUrl);
          if (cfg.apiKey) setApiKey(cfg.apiKey);
          if (cfg.models) {
            const p = cfg.provider || "deepseek";
            const presets = COMMON_MODELS[p] || [];
            // 如果保存的模型不在预设列表中，重置为供应商默认值
            const isValid = (m: string) => presets.length === 0 || presets.includes(m);
            if (isValid(cfg.models.extraction || "") && isValid(cfg.models.chat || "") && isValid(cfg.models.analysis || "")) {
              setModels({
                extraction: cfg.models.extraction || DEFAULT_MODELS.extraction,
                chat: cfg.models.chat || DEFAULT_MODELS.chat,
                analysis: cfg.models.analysis || DEFAULT_MODELS.analysis,
              });
            } else if (presets.length) {
              setModels({
                extraction: presets[0],
                chat: presets[0],
                analysis: presets[presets.length > 1 ? 1 : 0],
              });
            }
          }
        }
        if (data.zoteroApiKey) setZoteroApiKey(data.zoteroApiKey);
      } catch { /* keep defaults */ } finally { setLoading(false); }
    }
    load();
  }, []);

  const fetchModels = useCallback(async (url: string, key: string) => {
    if (!url || !key) {
      setFetchError("请先填写 API 地址和 API Key");
      return;
    }
    setFetchingModels(true);
    setModelsFetched(false);
    setFetchError(null);
    try {
      const res = await fetch("/api/settings/models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: url, apiKey: key }),
      });
      const data = await res.json();
      if (res.ok) {
        setAvailableModels(data.models || []);
        setModelsFetched(true);
        if (!data.models?.length) setFetchError("该供应商未返回模型列表，请手动输入");
      } else {
        setFetchError(data.error || `获取失败 (${res.status})`);
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setFetchingModels(false);
    }
  }, []);

  function showToast(type: "success" | "error", message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2500);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const config = { provider, apiBaseUrl, apiKey, models };
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config, zoteroApiKey }),
      });
      if (res.ok) showToast("success", "设置已保存");
      else showToast("error", "保存失败");
    } catch { showToast("error", "网络错误"); } finally { setSaving(false); }
  }

  function handleProviderChange(p: string) {
    setProvider(p);
    const preset = PROVIDER_PRESETS[p];
    if (preset?.baseUrl) setApiBaseUrl(preset.baseUrl);
    // 切换供应商时重置模型为该供应商的默认值
    const presets = COMMON_MODELS[p];
    if (presets?.length) {
      setModels({
        extraction: presets[0],
        chat: presets[0],
        analysis: presets[presets.length > 1 ? 1 : 0],
      });
    }
    setAvailableModels([]);
    setModelsFetched(false);
  }

  function handleUrlChange(url: string) {
    setApiBaseUrl(url);
    setAvailableModels([]);
    setModelsFetched(false);
  }

  if (loading) {
    return (
      <main className="p-8 max-w-2xl mx-auto">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-blue-600" />
          <span className="ml-3 text-sm text-gray-500">加载中...</span>
        </div>
      </main>
    );
  }

  const hasModels = availableModels.length > 0;
  const presetModels = COMMON_MODELS[provider] || [];
  const allModels = hasModels
    ? availableModels.map((m) => m.id)
    : presetModels;
  const showDropdown = allModels.length > 0;

  // 按分组整理供应商
  const groupedProviders = Object.entries(PROVIDER_PRESETS).reduce(
    (acc, [key, p]) => {
      const group = p.group || "Other";
      if (!acc[group]) acc[group] = [];
      acc[group].push({ key, ...p });
      return acc;
    },
    {} as Record<string, Array<{ key: string; name: string; baseUrl: string }>>
  );

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-1">⚙️ 设置</h1>
      <p className="text-gray-500 text-sm mb-8">配置 LLM API 连接</p>

      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-4 py-2 rounded-lg text-sm font-medium shadow-lg ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.message}
        </div>
      )}

      {/* 供应商选择 */}
      <section className="mb-6">
        <h2 className="text-sm font-medium text-gray-700 mb-2">API 供应商</h2>
        <select
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {Object.entries(groupedProviders).map(([group, providers]) => (
            <optgroup key={group} label={group}>
              {providers.map((p) => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </section>

      {/* API 地址 */}
      <section className="mb-6">
        <h2 className="text-sm font-medium text-gray-700 mb-2">API 地址</h2>
        <input
          value={apiBaseUrl}
          onChange={(e) => handleUrlChange(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          placeholder="https://api.deepseek.com/v1"
        />
      </section>

      {/* API Key + 获取模型 */}
      <section className="mb-6">
        <h2 className="text-sm font-medium text-gray-700 mb-2">API Key</h2>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full px-4 py-2 pr-16 border border-gray-300 rounded-lg text-sm font-mono"
              placeholder="sk-..."
            />
            <button
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
            >
              {showApiKey ? "隐藏" : "显示"}
            </button>
          </div>
          <button
            onClick={() => fetchModels(apiBaseUrl, apiKey)}
            disabled={fetchingModels}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-1.5"
          >
            {fetchingModels ? (
              <>
                <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full" />
                获取中...
              </>
            ) : (
              <>🔄 获取模型</>
            )}
          </button>
        </div>
        {modelsFetched && !fetchError && (
          <p className="text-xs text-green-600 mt-1">✓ 已获取 {availableModels.length} 个可用模型</p>
        )}
        {fetchError && (
          <p className="text-xs text-red-500 mt-1">⚠ {fetchError}</p>
        )}
      </section>

      {/* 模型名称 */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-gray-700 mb-3">模型名称</h2>
        <p className="text-xs text-gray-500 mb-3">
          {hasModels
            ? "已从 API 获取可用模型，点击「获取模型」刷新"
            : presetModels.length > 0
              ? `${PROVIDER_PRESETS[provider]?.name || provider} 常见模型，也可点击「获取模型」拉取完整列表`
              : "点击「获取模型」自动拉取，或手动输入模型 ID"}
        </p>
        <div className="space-y-3">
          {[
            { key: "extraction" as const, label: "提取 / 预处理", desc: "批量处理，速度快" },
            { key: "chat" as const, label: "对话 / 聊天", desc: "日常对话，质量速度均衡" },
            { key: "analysis" as const, label: "深度分析", desc: "实验设计、排障、论文" },
          ].map((role) => (
            <div key={role.key} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
              <div className="shrink-0">
                <div className="text-sm font-medium">{role.label}</div>
                <div className="text-xs text-gray-400">{role.desc}</div>
              </div>
              {showDropdown ? (
                <div className="ml-4 flex-1 max-w-xs">
                  <select
                    value={models[role.key]}
                    onChange={(e) => setModels((prev) => ({ ...prev, [role.key]: e.target.value }))}
                    className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    {allModels.map((id) => (
                      <option key={id} value={id}>{id}</option>
                    ))}
                    {!allModels.includes(models[role.key]) && (
                      <option value={models[role.key]}>{models[role.key]} (当前)</option>
                    )}
                  </select>
                </div>
              ) : (
                <input
                  value={models[role.key]}
                  onChange={(e) => setModels((prev) => ({ ...prev, [role.key]: e.target.value }))}
                  className="ml-4 flex-1 max-w-xs px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={DEFAULT_MODELS[role.key]}
                />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Zotero */}
      <section className="mb-8">
        <h2 className="text-sm font-medium text-gray-700 mb-3">📥 Zotero 集成</h2>
        <input
          type="password"
          value={zoteroApiKey}
          onChange={(e) => setZoteroApiKey(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          placeholder="留空表示不使用 Zotero"
        />
        <p className="text-xs text-gray-400 mt-1">
          前往 <a href="https://www.zotero.org/settings/keys" target="_blank" rel="noopener" className="text-blue-600 hover:underline">zotero.org/settings/keys</a> 生成
        </p>
      </section>

      {/* 保存按钮 */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "保存中..." : "保存设置"}
        </button>
      </div>

      {/* 说明 */}
      <section className="mt-8 p-4 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
        <p className="font-medium text-gray-600">配置说明：</p>
        <p>• 支持所有 OpenAI 兼容的 API（DeepSeek、Qwen、GPT、Moonshot、Ollama 等）</p>
        <p>• 填入 URL 和 Key 后点击「获取模型」自动拉取可用模型列表</p>
        <p>• API Key 仅存储在你的数据库中，不会泄露</p>
        <p>• 本地模型（Ollama / LM Studio / vLLM）API Key 留空即可</p>
      </section>
    </main>
  );
}
