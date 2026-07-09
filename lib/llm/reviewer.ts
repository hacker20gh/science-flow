/**
 * 审稿人模拟器
 *
 * AI 模拟 3 位审稿人审阅论文草稿
 * 每位审稿人从不同角度审查
 */

import { z } from "zod";
import { getLLMClient, MODELS } from "./client";
import { zodResponseFormat } from "openai/helpers/zod";

// ===== Schema =====

export const ReviewerCommentSchema = z.object({
  section: z.string().describe("对应论文章节"),
  severity: z.enum(["major", "minor", "suggestion"]),
  category: z.string().describe("类别：statistical, logical, methodological, writing, clarity"),
  comment: z.string().describe("具体的审稿意见"),
  suggested_fix: z.string().describe("建议的修改方案"),
});

export const ReviewerSchema = z.object({
  reviewer_id: z.string(),
  persona: z.string().describe("审稿人身份描述"),
  overall_assessment: z.enum(["accept", "minor_revision", "major_revision", "reject"]),
  summary: z.string().describe("总体评价（2-3 句）"),
  comments: z.array(ReviewerCommentSchema),
  score: z.number().min(1).max(10).describe("1-10 分"),
});

export const ReviewSimulationSchema = z.object({
  reviewers: z.array(ReviewerSchema).length(3),
  overall_verdict: z.string().describe("综合三位审稿人的最终判断"),
  priority_fixes: z.array(z.string()).describe("优先修改建议（最影响接收的问题）"),
});

export type ReviewSimulation = z.infer<typeof ReviewSimulationSchema>;

// ===== Prompt =====

const REVIEW_PROMPT = `You are simulating 3 peer reviewers for a biomedical research paper.

Each reviewer has a different focus:
- Reviewer 1: Methods expert - focuses on experimental design, statistical rigor, reproducibility
- Reviewer 2: Domain expert - focuses on novelty, significance, biological interpretation
- Reviewer 3: Writing & clarity expert - focuses on logical flow, clarity, proper citations

For each reviewer, provide:
1. Overall assessment (accept/minor_revision/major_revision/reject)
2. Specific comments with severity (major/minor/suggestion)
3. Suggested fixes for each comment
4. Score (1-10)

Be critical but fair. Focus on issues that would actually affect acceptance.

Severity levels:
- major: Must fix before publication (wrong statistics, missing controls, logical errors)
- minor: Should fix (unclear writing, formatting, minor omissions)
- suggestion: Nice to have (additional experiments, alternative interpretations)`;

// ===== 审稿函数 =====

export async function simulateReview(params: {
  manuscript: {
    abstract?: string;
    introduction?: string;
    methods?: string;
    results?: string;
    discussion?: string;
  };
  journal?: string;
}): Promise<ReviewSimulation> {
  const client = getLLMClient();

  const sections = Object.entries(params.manuscript)
    .filter(([, v]) => v)
    .map(([k, v]) => `## ${k}\n${v}`)
    .join("\n\n");

  const context = `## 目标期刊
${params.journal || "一般性生物医学期刊（IF 5-10）"}

${sections}`;

  const response = await client.chat.completions.parse({
    model: MODELS.analysis,
    max_tokens: 8192,
    messages: [
      { role: "system", content: REVIEW_PROMPT },
      { role: "user", content: `Review this manuscript:\n\n${context}` },
    ],
    response_format: zodResponseFormat(ReviewSimulationSchema, "review"),
  });

  const parsed = response.choices[0]?.message?.parsed;
  if (!parsed) throw new Error("Failed to simulate review");

  return parsed;
}
