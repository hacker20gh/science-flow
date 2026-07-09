/**
 * LLM 搜索查询预处理器
 *
 * 用户输入任意语言/格式 → CCS 调 LLM → 输出优化的英文搜索查询
 */

import { getLLMClient, MODELS } from "./client";

export interface ProcessedQuery {
  optimizedQuery: string;
  meshTerms: string[];
  searchIntent: string;
  suggestedRefinements: string[];
}

const PREPROCESS_PROMPT = `You are a biomedical literature search expert.

Given a user's research query (which may be in any language, natural language, or informal), produce an optimized search strategy.

Return JSON with these fields:
- optimizedQuery: English search query optimized for PubMed and Semantic Scholar. Use AND/OR operators. Example: "sorafenib AND PD-1 AND hepatocellular carcinoma AND drug resistance"
- meshTerms: List of relevant MeSH (Medical Subject Headings) terms for PubMed search
- searchIntent: One-sentence summary of what the user is looking for (in the same language as the input)
- suggestedRefinements: 0-2 suggestions to narrow or improve the search (in the same language as the input). Only suggest if the original query is too broad or ambiguous.

Rules:
- If the input is in Chinese, translate concepts to English for optimizedQuery
- Keep meshTerms as the standard PubMed MeSH vocabulary
- searchIntent should be in the same language as the user's input
- If the query is already well-formed English keywords, still optimize it (add MeSH terms, improve boolean logic)
- Be concise. No explanations outside the JSON.`;

/**
 * 将用户输入转换为优化的搜索查询
 */
export async function preprocessQuery(userInput: string): Promise<ProcessedQuery> {
  const client = getLLMClient();

  try {
    const response = await client.chat.completions.create({
      model: MODELS.extraction, // 用便宜模型做预处理
      max_tokens: 512,
      messages: [
        { role: "system", content: PREPROCESS_PROMPT },
        { role: "user", content: userInput },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      return fallbackProcess(userInput);
    }

    const parsed = JSON.parse(content);

    return {
      optimizedQuery: parsed.optimizedQuery || userInput,
      meshTerms: parsed.meshTerms || [],
      searchIntent: parsed.searchIntent || userInput,
      suggestedRefinements: parsed.suggestedRefinements || [],
    };
  } catch (error) {
    console.error("Query preprocessing failed, using fallback:", error);
    return fallbackProcess(userInput);
  }
}

/**
 * LLM 调用失败时的降级处理
 * 简单的关键词提取
 */
function fallbackProcess(userInput: string): ProcessedQuery {
  // 如果是中文，用简单规则提取关键词
  const isChinese = /[一-龥]/.test(userInput);

  if (isChinese) {
    return {
      optimizedQuery: userInput, // 中文原样搜索，效果差但不会报错
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
