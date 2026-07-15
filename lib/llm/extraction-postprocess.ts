/**
 * 提取后处理器
 *
 * 在 LLM 提取完成后、保存到 DB 前执行：
 * 1. 过滤非实验条目（方法描述、纯观察）
 * 2. 智能合并相关实验（同靶点+同通路+同细胞系）
 * 3. 干预类型自动修正
 * 4. 实验分层标签（in_vitro / in_vivo / clinical / computational）
 */

import type { ExperimentResult } from "./extraction";

export type ExperimentTier = "in_vitro" | "in_vivo" | "clinical" | "computational";

// 常见基因名（用于判断干预类型）
const GENE_NAMES = new Set([
  "TP53", "EGFR", "KRAS", "BRAF", "PIK3CA", "PTEN", "RB1", "APC", "BRCA1", "BRCA2",
  "MYC", "AKT1", "MTOR", "VEGFA", "HIF1A", "HIF-1α", "STAT3", "NF-κB", "NFKB1",
  "TGF-β", "TGFB1", "WNT", "NOTCH", "SHH", "SMO", "TP63", "TCAF2", "TRPM8",
  "DSG2", "TCF21", "TCF3", "CXCR4", "PI3K", "ERK", "JNK", "MAPK", "AMPK",
]);

// 刺激因子关键词
const STIMULATION_KEYWORDS = [
  "LPS", "TNF", "IL-1", "IL-6", "IFN", "TGF", "EGF", "FGF", "PDGF", "VEGF",
  "Hypoxia", "hypoxia", "glucose", "insulin", "menthol", "icilin", "capsaicin",
  "AMG333", "AMG-333",
];

/**
 * 主处理函数：过滤 → 修正 → 合并 → 排序
 */
export function postProcessExtractions(result: { experiments: ExperimentResult[] }): { experiments: ExperimentResult[] } {
  let experiments = [...result.experiments];

  // 1. 过滤非实验条目
  experiments = filterNonExperiments(experiments);

  // 2. 干预类型自动修正
  experiments = experiments.map(fixInterventionType);

  // 3. 智能合并
  experiments = mergeRelatedExperiments(experiments);

  // 4. 按 role 排序（main → supporting → control）
  const roleOrder: Record<string, number> = { main: 0, supporting: 1, control: 2 };
  experiments.sort((a, b) => (roleOrder[a.role || "supporting"] || 1) - (roleOrder[b.role || "supporting"] || 1));

  return { experiments };
}

/**
 * 过滤非实验条目
 *
 * 移除：
 * - 纯方法描述（没有 pathway/phenotype 效果）
 * - 纯观察性结论（没有干预操作）
 * - 过于模糊的条目
 */
function filterNonExperiments(experiments: ExperimentResult[]): ExperimentResult[] {
  return experiments.filter(exp => {
    // 有 pathway 或 phenotype 效果的保留
    const hasEffects = (exp.pathway_effects || []).length > 0 || (exp.phenotype_effects || []).length > 0;

    // 有干预操作的保留
    const hasIntervention = !!exp.intervention?.target;

    // 有结论的保留
    const hasConclusion = !!exp.conclusion && exp.conclusion.length > 20;

    // 有实验方法的保留
    const hasMethods = (exp.experiment_methods || []).length > 0;

    // 规则1：有效果 → 保留
    if (hasEffects) return true;

    // 规则2：有干预 + 有结论 → 保留（即使没有明确的效果数据）
    if (hasIntervention && hasConclusion) return true;

    // 规则3：有实验方法 + 有结论 → 保留（可能是方法学实验）
    if (hasMethods && hasConclusion) return true;

    // 其他：过滤掉
    return false;
  });
}

/**
 * 干预类型自动修正
 *
 * 根据 drugName 和 conclusion 关键词修正 intervention.type
 */
function fixInterventionType(exp: ExperimentResult): ExperimentResult {
  if (!exp.intervention) return exp;

  const target = exp.intervention.target || "";
  const conclusion = (exp.conclusion || "").toLowerCase();
  const currentType = exp.intervention.type;

  // 如果已经是 knockdown/overexpression/knockout/stimulation，不修改
  if (currentType && currentType !== "drug") return exp;

  // 判断是否是基因名
  const isGene = GENE_NAMES.has(target.toUpperCase()) ||
    GENE_NAMES.has(target) ||
    /^[A-Z][A-Z0-9-]{1,10}$/.test(target); // 大写字母开头的短名称

  // 判断是否是刺激因子
  const isStimulation = STIMULATION_KEYWORDS.some(kw =>
    target.toLowerCase().includes(kw.toLowerCase())
  );

  // 根据 conclusion 关键词判断
  if (isGene) {
    if (/knockdown|siRNA|shRNA|silencing|depletion/i.test(conclusion)) {
      return { ...exp, intervention: { ...exp.intervention, type: "knockdown" } };
    }
    if (/overexpress|transfect|plasmid|ectopic/i.test(conclusion)) {
      return { ...exp, intervention: { ...exp.intervention, type: "overexpression" } };
    }
    if (/knockout|CRISPR|KO|gene.*delet/i.test(conclusion)) {
      return { ...exp, intervention: { ...exp.intervention, type: "knockout" } };
    }
    // 基因名但没有明确操作 → 可能是观察性，设为 knockdown（最常见的实验操作）
    if (currentType === "drug") {
      return { ...exp, intervention: { ...exp.intervention, type: "knockdown" } };
    }
  }

  if (isStimulation) {
    return { ...exp, intervention: { ...exp.intervention, type: "stimulation" } };
  }

  return exp;
}

/**
 * 智能合并相关实验
 *
 * 合并条件：intervention.target + primary_pathway + model.cell_line
 * 合并后：
 * - 多个 pathway_effects 合并（去重）
 * - 多个 phenotype_effects 合并（去重）
 * - dose_response 合并
 * - evidence_quote 取最长
 * - confidence 取最高
 */
function mergeRelatedExperiments(experiments: ExperimentResult[]): ExperimentResult[] {
  const groups = new Map<string, ExperimentResult[]>();

  for (const exp of experiments) {
    const target = (exp.intervention?.target || "unknown").toLowerCase().trim();
    const cellLine = (exp.model?.cell_line || "").toLowerCase().trim();
    const primaryPathway = (exp.pathway_effects || [])[0]?.pathway?.toLowerCase().trim() || "";
    const key = `${target}|${cellLine}|${primaryPathway}`;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(exp);
  }

  const merged: ExperimentResult[] = [];

  for (const [, group] of groups) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }

    // 合并同组实验
    const base = group[0];
    const allPathways = group.flatMap(e => e.pathway_effects || []);
    const allPhenotypes = group.flatMap(e => e.phenotype_effects || []);
    const allDoseResponse = group.flatMap(e => e.dose_response || []);
    const allMethods = [...new Set(group.flatMap(e => e.experiment_methods || []))];
    const allControls = [...new Set(group.flatMap(e => e.controls || []))];

    // 去重 pathway_effects（同 pathway + 同 direction 只保留一条）
    const uniquePathways = dedupBy(allPathways, p => `${p.pathway}|${p.direction}`);
    const uniquePhenotypes = dedupBy(allPhenotypes, p => `${p.phenotype}|${p.direction}`);

    // 取最长 evidence_quote
    const bestQuote = group.reduce((best, e) =>
      (e.evidence_quote || "").length > (best.evidence_quote || "").length ? e : best
    ).evidence_quote;

    // 取最高 confidence
    const bestConfidence = Math.max(...group.map(e => e.confidence || 0));

    // 合并 conclusion
    const conclusions = [...new Set(group.map(e => e.conclusion).filter(Boolean))];
    const mergedConclusion = conclusions.length === 1
      ? conclusions[0]
      : conclusions.join("; ");

    merged.push({
      ...base,
      intervention: base.intervention,
      model: base.model,
      experiment_type: base.experiment_type,
      experiment_methods: allMethods.length > 0 ? allMethods : base.experiment_methods,
      pathway_effects: uniquePathways,
      phenotype_effects: uniquePhenotypes,
      dose_response: allDoseResponse.length > 0 ? allDoseResponse : null,
      controls: allControls.length > 0 ? allControls : base.controls,
      conclusion: mergedConclusion,
      evidence_quote: bestQuote || base.evidence_quote,
      confidence: bestConfidence || base.confidence,
    });
  }

  return merged;
}

/**
 * 按 key 函数去重
 */
function dedupBy<T>(arr: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set<string>();
  return arr.filter(item => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * 获取实验分层标签
 */
export function getExperimentTier(experimentType?: string | null): ExperimentTier {
  switch (experimentType) {
    case "cell_line":
    case "primary_cell":
    case "organoid":
    case "tissue_slice":
      return "in_vitro";
    case "animal_model":
    case "xenograft":
      return "in_vivo";
    case "patient_sample":
    case "clinical_trial":
    case "clinical_obs":
    case "case_report":
      return "clinical";
    case "bioinformatics":
    case "omics":
    case "meta_analysis":
    case "review":
      return "computational";
    default:
      return "in_vitro";
  }
}

/**
 * 获取分层标签中文名
 */
export function getExperimentTierLabel(tier: ExperimentTier): string {
  const labels: Record<ExperimentTier, string> = {
    in_vitro: "体外实验",
    in_vivo: "体内实验",
    clinical: "临床/患者",
    computational: "生信/组学",
  };
  return labels[tier];
}

/**
 * 获取分层标签图标
 */
export function getExperimentTierIcon(tier: ExperimentTier): string {
  const icons: Record<ExperimentTier, string> = {
    in_vitro: "🧫",
    in_vivo: "🐁",
    clinical: "🏥",
    computational: "💻",
  };
  return icons[tier];
}
