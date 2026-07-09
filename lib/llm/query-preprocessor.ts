/**
 * LLM 搜索查询预处理
 */

import { getLLMClient, MODELS } from "./client";

export interface ProcessedQuery {
  optimizedQuery: string;
  meshTerms: string[];
  searchIntent: string;
  suggestedRefinements: string[];
}

const PREPROCESS_TOOL = {
  name: "preprocess_query",
  description: "Convert a user research query into an optimized PubMed/Semantic Scholar search strategy",
  input_schema: {
    type: "object" as const,
    properties: {
      optimizedQuery: { type: "string" as const, description: "English search query with AND/OR operators" },
      meshTerms: { type: "array" as const, items: { type: "string" as const }, description: "MeSH terms" },
      searchIntent: { type: "string" as const, description: "Summary of what the user wants (same language as input)" },
      suggestedRefinements: { type: "array" as const, items: { type: "string" as const }, description: "Suggestions to improve the search (same language as input)" },
    },
    required: ["optimizedQuery", "meshTerms", "searchIntent", "suggestedRefinements"],
  },
};

const PREPROCESS_PROMPT = `You are a biomedical literature search expert.
Convert the user's research query into an optimized search strategy.
If input is Chinese, translate concepts to English for optimizedQuery.
Keep meshTerms in standard PubMed MeV vocabulary.
searchIntent and suggestedRefinements should be in the same language as the user's input.
Only suggest refinements if the query is too broad or ambiguous.`;

export async function preprocessQuery(userInput: string): Promise<ProcessedQuery> {
  const client = getLLMClient();

  try {
    const response = await client.messages.create({
      model: MODELS.extraction,
      max_tokens: 512,
      system: PREPROCESS_PROMPT,
      tools: [PREPROCESS_TOOL as any],
      tool_choice: { type: "tool", name: "preprocess_query" },
      messages: [{ role: "user", content: userInput }],
    });

    for (const block of response.content) {
      if (block.type === "tool_use" && block.name === "preprocess_query") {
        const data = block.input as Record<string, unknown>;
        return {
          optimizedQuery: (data.optimizedQuery as string) || userInput,
          meshTerms: (data.meshTerms as string[]) || [],
          searchIntent: (data.searchIntent as string) || userInput,
          suggestedRefinements: (data.suggestedRefinements as string[]) || [],
        };
      }
    }
  } catch (error) {
    console.error("Query preprocessing failed:", error);
  }

  return fallbackProcess(userInput);
}

function fallbackProcess(userInput: string): ProcessedQuery {
  const isChinese = /[一-龥]/.test(userInput);
  if (isChinese) {
    return {
      optimizedQuery: userInput,
      meshTerms: [],
      searchIntent: userInput,
      suggestedRefinements: ["建议使用英文关键词以获得更好的搜索结果"],
    };
  }
  return {
    optimizedQuery: userInput,
    meshTerms: [],
    searchIntent: userInput,
    suggestedRefinements: [],
  };
}
