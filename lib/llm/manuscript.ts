/**
 * 论文组装引擎
 */

import { getLLMClient, MODELS } from "./client";

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

const MANUSCRIPT_TOOL = {
  name: "generate_manuscript",
  description: "Generate a manuscript draft for a biomedical research paper",
  input_schema: {
    type: "object" as const,
    properties: {
      abstract: {
        type: "object" as const,
        properties: {
          section: { type: "string" as const },
          content: { type: "string" as const },
          word_count: { type: "number" as const },
          citations: { type: "array" as const, items: { type: "string" as const } },
          notes: { type: "array" as const, items: { type: "string" as const } },
        },
        required: ["section", "content", "word_count", "citations", "notes"],
      },
      introduction: {
        type: "object" as const,
        properties: {
          section: { type: "string" as const },
          content: { type: "string" as const },
          word_count: { type: "number" as const },
          citations: { type: "array" as const, items: { type: "string" as const } },
          notes: { type: "array" as const, items: { type: "string" as const } },
        },
        required: ["section", "content", "word_count", "citations", "notes"],
      },
      methods: {
        type: "object" as const,
        properties: {
          section: { type: "string" as const },
          content: { type: "string" as const },
          word_count: { type: "number" as const },
          citations: { type: "array" as const, items: { type: "string" as const } },
          notes: { type: "array" as const, items: { type: "string" as const } },
        },
        required: ["section", "content", "word_count", "citations", "notes"],
      },
      results: {
        type: "object" as const,
        properties: {
          section: { type: "string" as const },
          content: { type: "string" as const },
          word_count: { type: "number" as const },
          citations: { type: "array" as const, items: { type: "string" as const } },
          notes: { type: "array" as const, items: { type: "string" as const } },
        },
        required: ["section", "content", "word_count", "citations", "notes"],
      },
      discussion: {
        type: "object" as const,
        properties: {
          section: { type: "string" as const },
          content: { type: "string" as const },
          word_count: { type: "number" as const },
          citations: { type: "array" as const, items: { type: "string" as const } },
          notes: { type: "array" as const, items: { type: "string" as const } },
        },
        required: ["section", "content", "word_count", "citations", "notes"],
      },
    },
    required: ["abstract", "introduction", "methods", "results", "discussion"],
  },
};

export async function generateManuscript(params: {
  projectName: string;
  hypothesis: string;
  matrixSummary: string;
  papers: Array<{ title: string; authors: string[]; year: number; journal: string }>;
  experiments: Array<{ name: string; protocol: string; result: string }>;
  section: string;
}): Promise<ManuscriptDraft> {
  const client = getLLMClient();
  const context = `课题: ${params.projectName}\n假设: ${params.hypothesis}\n矩阵: ${params.matrixSummary}\n\n文献:\n${params.papers.map((p) => `- ${p.authors[0]} et al. (${p.year}) "${p.title}" ${p.journal}`).join("\n")}\n\n实验:\n${params.experiments.map((e) => `${e.name}: ${e.result}`).join("\n")}\n\n需要生成: ${params.section === "all" ? "全部章节" : params.section}`;

  const response = await client.messages.create({
    model: MODELS.analysis,
    max_tokens: 16384,
    system: "You are an expert academic writer specializing in biomedical research papers. Generate manuscript sections in formal academic English. Use (Author, Year) citation format. Follow standard biomedical paper structure: Abstract (structured), Introduction (inverted triangle), Methods (reproducible detail), Results (logical order), Discussion (interpret + limitations). Flag gaps with [TODO: ...].",
    tools: [MANUSCRIPT_TOOL as any],
    tool_choice: { type: "tool", name: "generate_manuscript" },
    messages: [{ role: "user", content: `Generate the manuscript draft:\n\n${context}` }],
  });

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "generate_manuscript") {
      return block.input as ManuscriptDraft;
    }
  }
  throw new Error("Failed to generate manuscript");
}
