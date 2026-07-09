/**
 * LLM 客户端
 *
 * 通过 CCS 代理接入模型
 * 配置可由前端设置页传入，不依赖 .env
 */

import Anthropic from "@anthropic-ai/sdk";

// 默认配置
const DEFAULT_BASE_URL = "http://127.0.0.1:15721/v1";
const DEFAULT_MODELS = {
  extraction: "claude-haiku-4-5",
  chat: "claude-sonnet-5",
  analysis: "claude-opus-4-8",
};

// 服务器端单例客户端
let client: Anthropic | null = null;
let currentBaseUrl: string = "";

export function getLLMClient(baseUrl?: string): Anthropic {
  const url = baseUrl || process.env.CCS_BASE_URL || DEFAULT_BASE_URL;

  // 如果地址变了，重建客户端
  if (!client || currentBaseUrl !== url) {
    client = new Anthropic({
      baseURL: url,
      apiKey: process.env.CCS_API_KEY || "placeholder",
    });
    currentBaseUrl = url;
  }

  return client;
}

export type ModelType = "extraction" | "chat" | "analysis";

/**
 * 获取模型名（优先用传入的 config，否则用 .env 或默认值）
 */
export function getModelName(
  type: ModelType,
  config?: { baseUrl?: string; models?: Record<string, string> }
): string {
  if (config?.models?.[type]) return config.models[type];
  if (type === "extraction") return process.env.CCS_MODEL_EXTRACTION || DEFAULT_MODELS.extraction;
  if (type === "chat") return process.env.CCS_MODEL_CHAT || DEFAULT_MODELS.chat;
  return process.env.CCS_MODEL_ANALYSIS || DEFAULT_MODELS.analysis;
}

export { DEFAULT_BASE_URL, DEFAULT_MODELS };

// 兼容导出（供各 LLM 引擎使用 .env 中的模型名）
export const MODELS = {
  extraction: process.env.CCS_MODEL_EXTRACTION || DEFAULT_MODELS.extraction,
  chat: process.env.CCS_MODEL_CHAT || DEFAULT_MODELS.chat,
  analysis: process.env.CCS_MODEL_ANALYSIS || DEFAULT_MODELS.analysis,
} as const;
