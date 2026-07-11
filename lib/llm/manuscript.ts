/**
 * 论文组装引擎
 */

import { z } from "zod";
import { getLLMClient, MODELS, withLLMRetry, getIsRetryMode } from "./client";
import { extractStructuredOutput, createRetryFunction, createToolFromSchema } from "./json-extractor";
import { streamLLMWithToolUse, type SSEEvent } from "./streaming";
import { trackTokenUsage } from "@/lib/token-tracker";

export interface ManuscriptSection {
  section: string;
  content: string;
  word_count: number;
  citations: string[];
  notes: string[];
}

export interface ManuscriptDraft {
  abstract: ManuscriptSection;
  introduction: ManuscriptSection;
  methods: ManuscriptSection;
  results: ManuscriptSection;
  discussion: ManuscriptSection;
}

const ManuscriptSectionSchema = z.object({
  section: z.string(),
  content: z.string(),
  word_count: z.number(),
  citations: z.array(z.string()),
  notes: z.array(z.string()),
});

const ManuscriptDraftSchema = z.object({
  abstract: ManuscriptSectionSchema,
  introduction: ManuscriptSectionSchema,
  methods: ManuscriptSectionSchema,
  results: ManuscriptSectionSchema,
  discussion: ManuscriptSectionSchema,
});

const MANUSCRIPT_TOOL = createToolFromSchema(
  "generate_manuscript",
  "Generate structured academic manuscript sections with IMRAD format",
  ManuscriptDraftSchema,
);

export async function generateManuscript(
  params: {
    projectName: string;
    hypothesis: string;
    matrixSummary: string;
    papers: Array<{ title: string; authors: string[]; year: number; journal: string }>;
    experiments: Array<{ name: string; protocol: string; result: string }>;
    section: string;
  },
  onToken?: (event: SSEEvent) => void,
): Promise<ManuscriptDraft> {
  return withLLMRetry(async () => {
    const client = getLLMClient();
    const context = `课题: ${params.projectName}\n假设: ${params.hypothesis}\n矩阵: ${params.matrixSummary}\n\n文献:\n${params.papers.map((p) => `- ${p.authors[0]} et al. (${p.year}) "${p.title}" ${p.journal}`).join("\n")}\n\n实验:\n${params.experiments.map((e) => `${e.name}: ${e.result}`).join("\n")}\n\n需要生成: ${params.section === "all" ? "全部章节" : params.section}`;

    const userMessage = `Generate the manuscript draft:\n\n${context}`;
    const systemPrompt = `You are an expert academic writer specializing in biomedical research papers.

Writing rules:
- Use formal academic English
- Follow IMRAD structure: Abstract (structured), Introduction (inverted triangle), Methods (reproducible detail), Results (logical order), Discussion (interpret + limitations)
- Use (Author, Year) citation format
- Flag gaps with [TODO: ...]`;

    const llmParams = {
      model: MODELS.analysis,
      max_tokens: 16384,
      system: systemPrompt,
      messages: [{ role: "user" as const, content: userMessage }],
      tools: [MANUSCRIPT_TOOL],
      tool_choice: { type: "tool" as const, name: "generate_manuscript" },
    };

    let draft: ManuscriptDraft;

    if (onToken) {
      // 真流式：逐 token 发送
      const streamStart = Date.now();
      const { toolUseBlocks, usage } = await streamLLMWithToolUse(client, llmParams, onToken);
      trackTokenUsage({
        feature: "manuscript",
        model: MODELS.analysis,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
        durationMs: Date.now() - streamStart,
        isRetry: getIsRetryMode(),
      });
      const toolResult = toolUseBlocks.find((t) => t.name === "generate_manuscript");
      if (toolResult) {
        draft = ManuscriptDraftSchema.parse(toolResult.input);
      } else {
        throw new Error("No tool_use block in streaming response");
      }
    } else {
      // 阻塞式
      const response = await client.messages.create(llmParams);
      draft = await extractStructuredOutput(response, ManuscriptDraftSchema, {
        label: "manuscript",
        retryFn: createRetryFunction(client, {
          model: MODELS.analysis,
          maxTokens: 16384,
          system: systemPrompt,
          userMessage,
          originalContent: userMessage,
          schema: ManuscriptDraftSchema,
        }),
      });
    }

    return draft;
  }, { label: "manuscript" });
}
