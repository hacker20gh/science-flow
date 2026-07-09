/**
 * 实验设计 LLM 引擎
 */

import { getLLMClient, MODELS } from "./client";

export interface ExperimentDesign {
  name: string;
  hypothesis: string;
  rationale: string;
  variables: { independent: string[]; dependent: string[]; controlled: string[] };
  groups: Array<{ name: string; description: string; purpose: string }>;
  protocol: {
    cellLine: string;
    passage: string | null;
    reagents: Array<{ name: string; concentration: string; source: string | null }>;
    steps: Array<{ day: string; action: string; details: string }>;
    readouts: string[];
    duration: string;
  };
  controls_check: {
    has_vehicle: boolean;
    has_positive: boolean;
    has_negative: boolean;
    missing: string[];
    suggestions: string[];
  };
  sample_size: { recommended: number; rationale: string };
  expected_outcomes: Array<{ scenario: string; interpretation: string; nextStep: string }>;
  references: string[];
}

const DESIGN_TOOL = {
  name: "design_experiment",
  description: "Design a biomedical experiment based on the research context. Return a complete experimental design.",
  input_schema: {
    type: "object" as const,
    properties: {
      name: { type: "string" as const },
      hypothesis: { type: "string" as const },
      rationale: { type: "string" as const },
      variables: {
        type: "object" as const,
        properties: {
          independent: { type: "array" as const, items: { type: "string" as const } },
          dependent: { type: "array" as const, items: { type: "string" as const } },
          controlled: { type: "array" as const, items: { type: "string" as const } },
        },
        required: ["independent", "dependent", "controlled"],
      },
      groups: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            name: { type: "string" as const },
            description: { type: "string" as const },
            purpose: { type: "string" as const },
          },
          required: ["name", "description", "purpose"],
        },
      },
      protocol: {
        type: "object" as const,
        properties: {
          cellLine: { type: "string" as const },
          passage: { type: ["string" as const, "null" as const] },
          reagents: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                name: { type: "string" as const },
                concentration: { type: "string" as const },
                source: { type: ["string" as const, "null" as const] },
              },
              required: ["name", "concentration", "source"],
            },
          },
          steps: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                day: { type: "string" as const },
                action: { type: "string" as const },
                details: { type: "string" as const },
              },
              required: ["day", "action", "details"],
            },
          },
          readouts: { type: "array" as const, items: { type: "string" as const } },
          duration: { type: "string" as const },
        },
        required: ["cellLine", "steps", "readouts", "duration"],
      },
      controls_check: {
        type: "object" as const,
        properties: {
          has_vehicle: { type: "boolean" as const },
          has_positive: { type: "boolean" as const },
          has_negative: { type: "boolean" as const },
          missing: { type: "array" as const, items: { type: "string" as const } },
          suggestions: { type: "array" as const, items: { type: "string" as const } },
        },
        required: ["has_vehicle", "has_positive", "has_negative", "missing", "suggestions"],
      },
      sample_size: {
        type: "object" as const,
        properties: {
          recommended: { type: "number" as const },
          rationale: { type: "string" as const },
        },
        required: ["recommended", "rationale"],
      },
      expected_outcomes: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            scenario: { type: "string" as const },
            interpretation: { type: "string" as const },
            nextStep: { type: "string" as const },
          },
          required: ["scenario", "interpretation", "nextStep"],
        },
      },
      references: { type: "array" as const, items: { type: "string" as const } },
    },
    required: ["name", "hypothesis", "rationale", "variables", "groups", "protocol", "controls_check", "sample_size", "expected_outcomes", "references"],
  },
};

export async function designExperiment(params: {
  hypothesis: string;
  matrixSummary: string;
  existingExperiments: string[];
  gapOrConflict?: string;
}): Promise<ExperimentDesign> {
  const client = getLLMClient();
  const context = `假设: ${params.hypothesis}\n\n机制矩阵摘要: ${params.matrixSummary}\n\n已完成实验: ${params.existingExperiments.join("; ")}${params.gapOrConflict ? `\n\n触发原因: ${params.gapOrConflict}` : ""}`;

  const response = await client.messages.create({
    model: MODELS.analysis,
    max_tokens: 8192,
    system: "You are an expert biomedical researcher designing experiments. Design a rigorous experiment with proper controls, adequate sample size, and clear expected outcomes. Be specific about reagents, cell lines, concentrations, and timing. Cite specific papers as rationale.",
    tools: [DESIGN_TOOL as any],
    tool_choice: { type: "tool", name: "design_experiment" },
    messages: [{ role: "user", content: `Design an experiment based on this context:\n\n${context}` }],
  });

  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "design_experiment") {
      return block.input as ExperimentDesign;
    }
  }
  throw new Error("Failed to generate experiment design");
}
