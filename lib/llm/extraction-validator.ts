/**
 * 提取结果质量校验器
 *
 * 校验 LLM 提取结果的完整性和一致性，
 * 自动修正可修复的问题，标记需要人工审核的字段
 */

import type { ExperimentResult, ExtractionResult } from "./extraction";

// ===== 校验结果类型 =====

export interface FieldIssue {
  field: string;          // 问题字段路径，如 "pathway_effects[0].direction"
  issue: string;          // 问题描述
  severity: "error" | "warning";
  autoFixed: boolean;     // 是否已自动修正
}

export interface ExperimentValidation {
  quality: "good" | "partial" | "poor";
  score: number;          // 0-100
  issues: FieldIssue[];
  cleaned: ExperimentResult;  // 修正后的结果
}

export interface ExtractionValidation {
  overallQuality: "good" | "partial" | "poor";
  averageScore: number;
  experimentValidations: ExperimentValidation[];
  totalIssues: number;
  autoFixedCount: number;
  cleaned: ExtractionResult;  // 修正后的完整结果
}

// ===== Direction 归一化映射 =====

const DIRECTION_MAP: Record<string, "up" | "down" | "no_change"> = {
  // "up" variants
  "up": "up", "upregulated": "up", "upregulation": "up",
  "increased": "up", "increase": "up", "elevated": "up",
  "enhanced": "up", "promoted": "up", "induced": "up",
  "activated": "up", "stimulated": "up", "overexpressed": "up",
  "higher": "up", "greater": "up", "elevation": "up",
  "activation": "up", "induction": "up", "augmentation": "up",
  "↑": "up",

  // "down" variants
  "down": "down", "downregulated": "down", "downregulation": "down",
  "decreased": "down", "decrease": "down", "reduced": "down",
  "suppressed": "down", "inhibited": "down", "attenuated": "down",
  "diminished": "down", "lowered": "down", "repressed": "down",
  "inhibition": "down", "suppression": "down", "lower": "down",
  "↓": "down",

  // "no_change" variants
  "no_change": "no_change", "unchanged": "no_change",
  "no change": "no_change", "no significant change": "no_change",
  "not affected": "no_change", "stable": "no_change",
  "no effect": "no_change", "negligible": "no_change",
};

// ===== 单个实验校验 =====

function validateExperiment(exp: ExperimentResult, index: number): ExperimentValidation {
  const issues: FieldIssue[] = [];
  let score = 100;

  // 创建可修改的副本
  const cleaned: ExperimentResult = JSON.parse(JSON.stringify(exp));

  // 1. 校验 intervention
  if (!cleaned.intervention.target || cleaned.intervention.target.trim() === "") {
    issues.push({ field: "intervention.target", issue: "干预靶点为空", severity: "error", autoFixed: false });
    score -= 30;
  }

  // 2. 校验 model.cell_line
  if (!cleaned.model.cell_line || cleaned.model.cell_line.trim() === "") {
    issues.push({ field: "model.cell_line", issue: "细胞系为空", severity: "warning", autoFixed: false });
    score -= 10;
  }

  // 3. 校验 direction 归一化（自动修正）
  for (let i = 0; i < cleaned.pathway_effects.length; i++) {
    const pe = cleaned.pathway_effects[i];
    const normalized = normalizeDirection(pe.direction);
    if (normalized !== pe.direction) {
      issues.push({
        field: `pathway_effects[${i}].direction`,
        issue: `direction "${pe.direction}" 已自动修正为 "${normalized}"`,
        severity: "warning",
        autoFixed: true,
      });
      (pe as { direction: string }).direction = normalized;
      score -= 2; // 轻微扣分，因为已修正
    }

    // pathway 有值但 direction 为空
    if (pe.pathway && !pe.direction) {
      issues.push({
        field: `pathway_effects[${i}].direction`,
        issue: `通路 "${pe.pathway}" 缺少方向信息`,
        severity: "error",
        autoFixed: false,
      });
      score -= 15;
    }
  }

  // 4. 校验 phenotype_effects direction 归一化
  for (let i = 0; i < cleaned.phenotype_effects.length; i++) {
    const ph = cleaned.phenotype_effects[i];
    const normalized = normalizeDirection(ph.direction);
    if (normalized !== ph.direction) {
      issues.push({
        field: `phenotype_effects[${i}].direction`,
        issue: `direction "${ph.direction}" 已自动修正为 "${normalized}"`,
        severity: "warning",
        autoFixed: true,
      });
      (ph as { direction: string }).direction = normalized;
      score -= 2;
    }
  }

  // 5. 校验 evidence_quote
  if (!cleaned.evidence_quote || cleaned.evidence_quote.trim().length < 10) {
    issues.push({
      field: "evidence_quote",
      issue: "证据引用过短或为空",
      severity: "error",
      autoFixed: false,
    });
    score -= 20;
  }

  // 6. 校验空结果：conclusion 有方向暗示但 pathway/phenotype 为空
  if (cleaned.pathway_effects.length === 0 && cleaned.phenotype_effects.length === 0) {
    const conclusionLower = (cleaned.conclusion || "").toLowerCase();
    const hasDirectionHint = /upregul|downregul|increas|decreas|elevat|suppress|inhibit|activat|promot|induc/.test(conclusionLower);
    if (hasDirectionHint) {
      issues.push({
        field: "pathway_effects / phenotype_effects",
        issue: "结论中暗示了方向变化，但未提取出通路/表型",
        severity: "error",
        autoFixed: false,
      });
      score -= 25;
    } else {
      issues.push({
        field: "extraction",
        issue: "未提取到任何通路或表型数据",
        severity: "error",
        autoFixed: false,
      });
      score -= 40;
    }
  }

  // 7. 校验 confidence
  if (cleaned.confidence !== undefined && cleaned.confidence !== null) {
    if (cleaned.confidence < 0.3) {
      issues.push({
        field: "confidence",
        issue: `置信度过低 (${cleaned.confidence})`,
        severity: "warning",
        autoFixed: false,
      });
      score -= 5;
    }
  }

  // 计算质量等级
  const finalScore = Math.max(0, Math.min(100, score));
  const quality: ExperimentValidation["quality"] =
    finalScore >= 70 ? "good" : finalScore >= 40 ? "partial" : "poor";

  return { quality, score: finalScore, issues, cleaned };
}

// ===== direction 归一化函数 =====

function normalizeDirection(dir: string | null | undefined): string {
  if (!dir) return dir as string;
  const lower = dir.toLowerCase().trim();
  return DIRECTION_MAP[lower] || dir;
}

// ===== 整体校验入口 =====

/**
 * 校验并修正 LLM 提取结果
 *
 * @param result LLM 原始提取结果
 * @returns 校验报告 + 修正后的结果
 */
export function validateExtraction(result: ExtractionResult): ExtractionValidation {
  if (!result.experiments || result.experiments.length === 0) {
    return {
      overallQuality: "poor",
      averageScore: 0,
      experimentValidations: [],
      totalIssues: 1,
      autoFixedCount: 0,
      cleaned: { experiments: [] },
    };
  }

  const validations = result.experiments.map((exp, i) => validateExperiment(exp, i));

  const totalIssues = validations.reduce((sum, v) => sum + v.issues.length, 0);
  const autoFixedCount = validations.reduce(
    (sum, v) => sum + v.issues.filter(i => i.autoFixed).length, 0
  );
  const averageScore = Math.round(
    validations.reduce((sum, v) => sum + v.score, 0) / validations.length
  );

  const overallQuality: ExtractionValidation["overallQuality"] =
    averageScore >= 70 ? "good" : averageScore >= 40 ? "partial" : "poor";

  return {
    overallQuality,
    averageScore,
    experimentValidations: validations,
    totalIssues,
    autoFixedCount,
    cleaned: {
      experiments: validations.map(v => v.cleaned),
    },
  };
}
