/**
 * 审稿人模拟器
 */

import { getLLMClient, MODELS } from "./client";

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

const REVIEW_TOOL = {
  name: "review_manuscript",
  description: "Simulate 3 peer reviewers reviewing a biomedical manuscript",
  input_schema: {
    type: "object" as const,
    properties: {
      reviewers: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            reviewer_id: { type: "string" as const },
            persona: { type: "string" as const },
            overall_assessment: { type: "string" as const, enum: ["accept", "minor_revision", "major_revision", "reject"] },
            summary: { type: "string" as const },
            comments: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  section: { type: "string" as const },
                  severity: { type: "string" as const, enum: ["major", "minor", "suggestion"] },
                  category: { type: "string" as const },
                  comment: { type: "string" as const },
                  suggested_fix: { type: "string" as const },
                },
                required: ["section", "severity", "category", "comment", "suggested_fix"],
              },
            },
            score: { type: "number" as const },
          },
          required: ["reviewer_id", "persona", "overall_assessment", "summary", "comments", "score"],
        },
      },
      overall_verdict: { type: "string" as const },
      priority_fixes: { type: "array" as const, items: { type: "string" as const } },
    },
    required: ["reviewers", "overall_verdict", "priority_fixes"],
  },
};

export async function simulateReview(params: {
  manuscript: { abstract?: string; introduction?: string; methods?: string; results?: string; discussion?: string };
  journal?: string;
}): Promise<ReviewSimulation> {
  const client = getLLMClient();
  const sections = Object.entries(params.manuscript)
    .filter(([, v]) => v)
    .map(([k, v]) => `## ${k}\n${v}`)
    .join("\n\n");

  const context = `目标期刊: ${params.journal || "一般性生物医学期刊"}\n\n${sections}`;

  const response = await client.messages.create({
    model: MODELS.analysis,
    max_tokens: 8192,
    system: "Simulate 3 peer reviewers for a biomedical paper: Reviewer 1 (methods expert), Reviewer 2 (domain expert), Reviewer 3 (writing expert). Be critical but fair. Focus on real issues that would affect acceptance.",
    tools: [REVIEW_TOOL as any],
    tool_choice: { type: "tool", name: "review_manuscript" },
    messages: [{ role: "user", content: `Review this manuscript:\n\n${context}` }],
  });

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "review_manuscript") {
      return block.input as ReviewSimulation;
    }
  }
  throw new Error("Failed to simulate review");
}
