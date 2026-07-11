/**
 * 审稿人模拟器
 */

import { z } from "zod";
import { getLLMClient, MODELS, withLLMRetry } from "./client";
import { extractStructuredOutput, createRetryFunction, createToolFromSchema } from "./json-extractor";
import { streamLLMWithToolUse, type SSEEvent } from "./streaming";
import { trackTokenUsage } from "@/lib/token-tracker";

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

const REVIEW_TOOL = createToolFromSchema(
  "generate_review",
  "Generate peer review simulation with 3 distinct reviewer personas",
  ReviewSimulationSchema,
);

export async function simulateReview(
  params: {
    manuscript: { abstract?: string; introduction?: string; methods?: string; results?: string; discussion?: string };
    journal?: string;
  },
  onToken?: (event: SSEEvent) => void,
): Promise<ReviewSimulation> {
  return withLLMRetry(async () => {
    const client = getLLMClient();
    const sections = Object.entries(params.manuscript)
      .filter(([, v]) => v)
      .map(([k, v]) => `## ${k}\n${v}`)
      .join("\n\n");

    const context = `目标期刊: ${params.journal || "一般性生物医学期刊"}\n\n${sections}`;

    const userMessage = `Review this manuscript:\n\n${context}`;
    const systemPrompt = `Simulate 3 peer reviewers for a biomedical paper:
- Reviewer 1: Methods expert — focus on experimental design, controls, statistical validity
- Reviewer 2: Domain expert — focus on novelty, literature coverage, theoretical framework
- Reviewer 3: Writing expert — focus on clarity, structure, argumentation

Rules:
- Be critical but fair. Focus on real issues that would affect acceptance.
- When pointing out issues, you MUST quote specific paragraphs or sentences from the manuscript
- Do not give vague suggestions. Each suggestion must be concrete and actionable`;

    const llmParams = {
      model: MODELS.analysis,
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: "user" as const, content: userMessage }],
      tools: [REVIEW_TOOL],
      tool_choice: { type: "tool" as const, name: "generate_review" },
    };

    let review: ReviewSimulation;

    if (onToken) {
      // 真流式：逐 token 发送
      const { toolUseBlocks, usage } = await streamLLMWithToolUse(client, llmParams, onToken);
      trackTokenUsage({
        feature: "review",
        model: MODELS.analysis,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedTokens: usage.cachedTokens,
      });
      const toolResult = toolUseBlocks.find((t) => t.name === "generate_review");
      if (toolResult) {
        review = ReviewSimulationSchema.parse(toolResult.input);
      } else {
        throw new Error("No tool_use block in streaming response");
      }
    } else {
      // 阻塞式
      const response = await client.messages.create(llmParams);
      review = await extractStructuredOutput(response, ReviewSimulationSchema, {
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
    }

    return review;
  }, { label: "reviewer" });
}
