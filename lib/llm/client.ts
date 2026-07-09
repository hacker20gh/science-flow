import OpenAI from "openai";

let client: OpenAI | null = null;

export function getLLMClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      baseURL: process.env.CCS_BASE_URL,
      apiKey: process.env.CCS_API_KEY,
    });
  }
  return client;
}

export const MODELS = {
  extraction: process.env.CCS_MODEL_EXTRACTION || "sciflow-extraction",
  chat: process.env.CCS_MODEL_CHAT || "sciflow-chat",
  analysis: process.env.CCS_MODEL_ANALYSIS || "sciflow-analysis",
} as const;
