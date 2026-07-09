/**
 * 论文组装引擎
 *
 * 从项目的积累（文献矩阵 + 实验数据 + 假设）自动组装论文草稿
 * 支持生成 Introduction / Methods / Results / Discussion
 */

import { z } from "zod";
import { getLLMClient, MODELS } from "./client";
import { zodResponseFormat } from "openai/helpers/zod";

// ===== Schema =====

export const ManuscriptSectionSchema = z.object({
  section: z.enum(["abstract", "introduction", "methods", "results", "discussion"]),
  content: z.string().describe("该章节的学术英语内容"),
  word_count: z.number(),
  citations: z.array(z.string()).describe("引用的文献"),
  notes: z.array(z.string()).describe("给用户的修改建议"),
});

export const ManuscriptSchema = z.object({
  abstract: ManuscriptSectionSchema,
  introduction: ManuscriptSectionSchema,
  methods: ManuscriptSectionSchema,
  results: ManuscriptSectionSchema,
  discussion: ManuscriptSectionSchema,
});

export type ManuscriptDraft = z.infer<typeof ManuscriptSchema>;

// ===== Prompt =====

const MANUSCRIPT_PROMPT = `You are an expert academic writer specializing in biomedical research papers.

Given a research project's accumulated data (literature matrix, experiments, hypothesis), generate a manuscript draft in academic English.

Writing rules:
1. Use formal academic English suitable for peer-reviewed journals
2. Follow the standard biomedical paper structure
3. Cite literature using (Author, Year) format
4. Be precise with quantitative data - use exact numbers from experiments
5. Maintain logical flow within each section
6. DO NOT invent data or findings not provided in the context
7. Flag any gaps that need filling with [TODO: ...] markers

Section guidelines:
- ABSTRACT: 150-250 words, structured (Background/Methods/Results/Conclusion)
- INTRODUCTION: "Inverted triangle" - from broad context to specific hypothesis, 3-4 paragraphs
- METHODS: Reproducible detail - reagents, concentrations, cell lines, statistical tests
- RESULTS: Present findings in logical order, reference figures/tables
- DISCUSSION: Interpret results in context of existing literature, acknowledge limitations`;

// ===== 生成函数 =====

interface ManuscriptContext {
  projectName: string;
  hypothesis: string;
  matrixSummary: string;
  papers: Array<{
    title: string;
    authors: string[];
    year: number;
    journal: string;
  }>;
  experiments: Array<{
    name: string;
    protocol: string;
    result: string;
  }>;
  section: "abstract" | "introduction" | "methods" | "results" | "discussion" | "all";
}

export async function generateManuscript(
  context: ManuscriptContext
): Promise<ManuscriptDraft> {
  const client = getLLMClient();

  const contextText = `## 课题：${context.projectName}

## 假设
${context.hypothesis}

## 机制矩阵摘要
${context.matrixSummary}

## 文献（${context.papers.length} 篇）
${context.papers.map((p) => `- ${p.authors[0]} et al. (${p.year}) "${p.title}" ${p.journal}`).join("\n")}

## 实验（${context.experiments.length} 个）
${context.experiments.map((e) => `### ${e.name}\nProtocol: ${e.protocol}\nResult: ${e.result}`).join("\n\n")}

## 需要生成的章节
${context.section === "all" ? "所有章节（Abstract, Introduction, Methods, Results, Discussion）" : context.section}`;

  const response = await client.chat.completions.parse({
    model: MODELS.analysis,
    max_tokens: 16384,
    messages: [
      { role: "system", content: MANUSCRIPT_PROMPT },
      { role: "user", content: `Generate the manuscript draft:\n\n${contextText}` },
    ],
    response_format: zodResponseFormat(ManuscriptSchema, "manuscript"),
  });

  const parsed = response.choices[0]?.message?.parsed;
  if (!parsed) throw new Error("Failed to generate manuscript");

  return parsed;
}
