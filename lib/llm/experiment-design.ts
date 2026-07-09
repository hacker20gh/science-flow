/**
 * 实验设计 LLM 引擎
 *
 * 基于机制矩阵和假设，生成实验方案
 */

import { z } from "zod";
import { getLLMClient, MODELS } from "./client";
import { zodResponseFormat } from "openai/helpers/zod";

// ===== Schema =====

export const ExperimentDesignSchema = z.object({
  name: z.string().describe("实验名称"),
  hypothesis: z.string().describe("验证的假设"),
  rationale: z.string().describe("为什么设计这个实验（基于哪些文献证据）"),

  variables: z.object({
    independent: z.array(z.string()).describe("自变量，如 sorafenib 浓度梯度"),
    dependent: z.array(z.string()).describe("因变量，如 PD-L1 蛋白表达量"),
    controlled: z.array(z.string()).describe("控制变量，如细胞代次、培养条件"),
  }),

  groups: z.array(
    z.object({
      name: z.string().describe("分组名称"),
      description: z.string().describe("处理条件"),
      purpose: z.string().describe("这个分组的目的（实验/对照/阳性/阴性）"),
    })
  ),

  protocol: z.object({
    cellLine: z.string().describe("推荐的细胞系"),
    passage: z.string().nullable().describe("建议的传代范围"),
    reagents: z.array(
      z.object({
        name: z.string().describe("试剂名称"),
        concentration: z.string().describe("工作浓度"),
        source: z.string().nullable().describe("推荐供应商/货号"),
      })
    ),
    steps: z.array(
      z.object({
        day: z.string().describe("时间点，如 Day 0, Day 1"),
        action: z.string().describe("操作步骤"),
        details: z.string().describe("具体细节"),
      })
    ),
    readouts: z.array(z.string()).describe("检测指标"),
    duration: z.string().describe("实验总时长"),
  }),

  controls_check: z.object({
    has_vehicle: z.boolean(),
    has_positive: z.boolean(),
    has_negative: z.boolean(),
    missing: z.array(z.string()).describe("缺少的对照组"),
    suggestions: z.array(z.string()).describe("补全建议"),
  }),

  sample_size: z.object({
    recommended: z.number().describe("推荐的生物学重复数"),
    rationale: z.string().describe("样本量推荐理由"),
  }),

  expected_outcomes: z.array(
    z.object({
      scenario: z.string().describe("可能发生的结果"),
      interpretation: z.string().describe("结果的解释"),
      nextStep: z.string().describe("下一步建议"),
    })
  ).describe("预期结果及解读"),

  references: z.array(z.string()).describe("建议引用的文献（来自机制矩阵）"),
});

export type ExperimentDesign = z.infer<typeof ExperimentDesignSchema>;

// ===== Prompt =====

const DESIGN_PROMPT = `You are an expert biomedical researcher designing experiments.

Given a research context (mechanism matrix, current hypothesis, existing experiments), design a rigorous experiment to test the hypothesis.

Design principles:
1. Every experiment needs proper controls: vehicle, positive, and negative controls
2. Recommend sample sizes based on expected effect size and variance
3. Consider dose-response relationships - include multiple concentrations
4. Anticipate possible outcomes and suggest follow-up experiments
5. Be specific about reagents, cell lines, concentrations, and timing
6. Cite specific papers from the context as rationale
7. Check for common pitfalls: confounding variables, batch effects, passage effects

IMPORTANT:
- Do NOT invent reagents or cell lines not mentioned in the context
- Be conservative with concentrations - reference literature values
- Always include troubleshooting tips for common failure modes`;

// ===== 生成实验方案 =====

export async function designExperiment(params: {
  hypothesis: string;
  matrixSummary: string;
  existingExperiments: string[];
  gapOrConflict?: string;
}): Promise<ExperimentDesign> {
  const client = getLLMClient();

  const context = `## 假设
${params.hypothesis}

## 机制矩阵摘要
${params.matrixSummary}

## 已完成的实验
${params.existingExperiments.map((e, i) => `${i + 1}. ${e}`).join("\n")}

${params.gapOrConflict ? `## 触发原因\n${params.gapOrConflict}` : ""}`;

  const response = await client.chat.completions.parse({
    model: MODELS.analysis, // 用强模型做实验设计
    max_tokens: 8192,
    messages: [
      { role: "system", content: DESIGN_PROMPT },
      { role: "user", content: `Design an experiment based on this context:\n\n${context}` },
    ],
    response_format: zodResponseFormat(ExperimentDesignSchema, "experiment_design"),
  });

  const parsed = response.choices[0]?.message?.parsed;
  if (!parsed) {
    throw new Error("Failed to generate experiment design");
  }

  return parsed;
}
