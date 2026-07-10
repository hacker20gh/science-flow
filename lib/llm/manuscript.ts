/**
 * 论文组装引擎
 */

import { z } from "zod";
import { getLLMClient, MODELS, withLLMRetry } from "./client";
import { extractStructuredOutput, createRetryFunction } from "./json-extractor";

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

const MANUSCRIPT_SYSTEM_SUFFIX = `\n\nCRITICAL: You MUST return ONLY a valid JSON object. No thinking, no explanation, no markdown code blocks. The JSON MUST have this exact structure:\n{"abstract":{"section":"Abstract","content":"string","word_count":250,"citations":["string"],"notes":["string"]},"introduction":{"section":"Introduction","content":"string","word_count":500,"citations":["string"],"notes":["string"]},"methods":{"section":"Methods","content":"string","word_count":800,"citations":["string"],"notes":["string"]},"results":{"section":"Results","content":"string","word_count":600,"citations":["string"],"notes":["string"]},"discussion":{"section":"Discussion","content":"string","word_count":500,"citations":["string"],"notes":["string"]}}`;

export async function generateManuscript(params: {
  projectName: string;
  hypothesis: string;
  matrixSummary: string;
  papers: Array<{ title: string; authors: string[]; year: number; journal: string }>;
  experiments: Array<{ name: string; protocol: string; result: string }>;
  section: string;
}): Promise<ManuscriptDraft> {
  return withLLMRetry(async () => {
    const client = getLLMClient();
    const context = `课题: ${params.projectName}\n假设: ${params.hypothesis}\n矩阵: ${params.matrixSummary}\n\n文献:\n${params.papers.map((p) => `- ${p.authors[0]} et al. (${p.year}) "${p.title}" ${p.journal}`).join("\n")}\n\n实验:\n${params.experiments.map((e) => `${e.name}: ${e.result}`).join("\n")}\n\n需要生成: ${params.section === "all" ? "全部章节" : params.section}`;

    const userMessage = `Generate the manuscript draft:\n\n${context}`;
    const systemPrompt = `You are an expert academic writer specializing in biomedical research papers. Generate manuscript sections in formal academic English. Use (Author, Year) citation format. Follow standard biomedical paper structure: Abstract (structured), Introduction (inverted triangle), Methods (reproducible detail), Results (logical order), Discussion (interpret + limitations). Flag gaps with [TODO: ...].${MANUSCRIPT_SYSTEM_SUFFIX}`;

    const response = await client.messages.create({
      model: MODELS.analysis,
      max_tokens: 16384,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    return await extractStructuredOutput(response, ManuscriptDraftSchema, {
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
  }, { label: "manuscript" });
}
