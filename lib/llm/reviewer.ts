/**
 * 审稿人模拟器
 */

import { z } from "zod";
import { getLLMClient, MODELS, withLLMRetry } from "./client";
import { extractStructuredOutput, createRetryFunction } from "./json-extractor";

export interface ReviewerComment {
  section: string;
  severity: "major" | "minor" | "suggestion";
  category: string;
  comment: string;
  suggested_fix: string;
}

export interface Reviewer {
  reviewer_id: string;
  persona: string;
  overall_assessment: "accept" | "minor_revision" | "major_revision" | "reject";
  summary: string;
  comments: ReviewerComment[];
  score: number;
}

export interface ReviewSimulation {
  reviewers: Reviewer[];
  overall_verdict: string;
  priority_fixes: string[];
}

const ReviewerCommentSchema = z.object({
  section: z.string(),
  severity: z.enum(["major", "minor", "suggestion"]),
  category: z.string(),
  comment: z.string(),
  suggested_fix: z.string(),
});

const ReviewerSchema = z.object({
  reviewer_id: z.string(),
  persona: z.string(),
  overall_assessment: z.enum(["accept", "minor_revision", "major_revision", "reject"]),
  summary: z.string(),
  comments: z.array(ReviewerCommentSchema),
  score: z.number(),
});

const ReviewSimulationSchema = z.object({
  reviewers: z.array(ReviewerSchema),
  overall_verdict: z.string(),
  priority_fixes: z.array(z.string()),
});

const REVIEW_SYSTEM_SUFFIX = `\n\nCRITICAL: You MUST return ONLY a valid JSON object. No thinking, no explanation, no markdown code blocks. The JSON MUST have this exact structure:\n{"reviewers":[{"reviewer_id":"1","persona":"methods expert","overall_assessment":"string","summary":"string","comments":[{"section":"string","severity":"critical|major|minor|suggestion","category":"string","comment":"string","suggested_fix":"string"}],"score":7}],"overall_verdict":"accept|minor_revision|major_revision|reject","priority_fixes":["string"]}`;

export async function simulateReview(params: {
  manuscript: { abstract?: string; introduction?: string; methods?: string; results?: string; discussion?: string };
  journal?: string;
}): Promise<ReviewSimulation> {
  return withLLMRetry(async () => {
    const client = getLLMClient();
    const sections = Object.entries(params.manuscript)
      .filter(([, v]) => v)
      .map(([k, v]) => `## ${k}\n${v}`)
      .join("\n\n");

    const context = `目标期刊: ${params.journal || "一般性生物医学期刊"}\n\n${sections}`;

    const userMessage = `Review this manuscript:\n\n${context}`;
    const systemPrompt = `Simulate 3 peer reviewers for a biomedical paper: Reviewer 1 (methods expert), Reviewer 2 (domain expert), Reviewer 3 (writing expert). Be critical but fair. Focus on real issues that would affect acceptance.${REVIEW_SYSTEM_SUFFIX}`;

    const response = await client.messages.create({
      model: MODELS.analysis,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    return await extractStructuredOutput(response, ReviewSimulationSchema, {
      label: "reviewer",
      retryFn: createRetryFunction(client, {
        model: MODELS.analysis,
        maxTokens: 8192,
        system: systemPrompt,
        userMessage,
        originalContent: userMessage,
        schema: ReviewSimulationSchema,
      }),
    });
  }, { label: "reviewer" });
}
