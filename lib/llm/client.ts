/**
 * LLM 客户端
 *
 * 通过 CCS (ccswitch) 代理接入模型
 * CCS 对外暴露 Anthropic Messages API 格式
 */

import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getLLMClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      baseURL: process.env.CCS_BASE_URL, // http://127.0.0.1:15721
      apiKey: process.env.CCS_API_KEY || "placeholder",
    });
  }
  return client;
}

// 模型名（CCS 会做模型映射，这里用 CCS 配置的映射名）
export const MODELS = {
  extraction: process.env.CCS_MODEL_EXTRACTION || "claude-haiku-4-5",
  chat: process.env.CCS_MODEL_CHAT || "claude-sonnet-5",
  analysis: process.env.CCS_MODEL_ANALYSIS || "claude-opus-4-8",
} as const;
