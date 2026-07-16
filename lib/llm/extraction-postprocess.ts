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
  // 肿瘤高频基因
  "TP53", "EGFR", "KRAS", "BRAF", "PIK3CA", "PTEN", "RB1", "APC", "BRCA1", "BRCA2",
  "MYC", "AKT1", "MTOR", "VEGFA", "HIF1A", "HIF-1α", "STAT3", "NF-κB", "NFKB1",
  "TGF-β", "TGFB1", "WNT", "NOTCH", "SHH", "SMO", "TP63",
  // 本次项目涉及的基因
  "TCAF2", "TRPM8", "DSG2", "TCF21", "TCF3", "CXCR4",
  // 信号通路核心分子
  "PI3K", "AKT", "ERK", "JNK", "MAPK", "AMPK", "mTOR", "JAK2", "JAK1",
  "STAT1", "STAT5", "SMAD2", "SMAD3", "SMAD4", "β-catenin", "CTNNB1",
  "CDK4", "CDK6", "CDK2", "Rb", "E2F", "MDM2", "BAX", "BAK", "BCL2", "BCLXL",
  "CASP3", "CASP8", "CASP9", "PARP", "LC3", "Beclin1", "ATG5", "ATG7",
  "GPX4", "ACSL4", "SLC7A11", "FTH1", "NRF2", "KEAP1",
  // ECM / 周细胞相关
  "P4HA1", "COL1A1", "COL1A2", "COL3A1", "LOX", "LOXL2",
  // miRNA / circRNA
  "miR-1290", "miR-21", "miR-155", "miR-34a", "circSCN8A",
]);

// 刺激因子 / 药物关键词
const STIMULATION_KEYWORDS = [
  "LPS", "TNF", "TNF-α", "IL-1", "IL-6", "IL-1β", "IFN", "IFN-γ",
  "TGF", "EGF", "FGF", "PDGF", "VEGF", "HGF", "SCF", "NGF",
  "Hypoxia", "hypoxia", "glucose", "insulin", "menthol", "icilin", "capsaicin",
  "AMG333", "AMG-333",
];

// 化合物 / 药物名
const DRUG_KEYWORDS = [
  "cisplatin", "doxorubicin", "paclitaxel", "5-FU", "5-fluorouracil",
  "gemcitabine", "erlotinib", "gefitinib", "sorafenib", "regorafenib",
  "anti-PD-1", "anti-PD-L1", "anti-CTLA4", "pembrolizumab", "nivolumab",
  "LY294002", "wortmannin", "rapamycin", "everolimus",
  "curcumin", "resveratrol", "emetine",
];

// 肽类干预关键词
const PEPTIDE_KEYWORDS = [
  "peptide", "DT2", "DT1", "derived peptide", "TCF21-derived",
  "MRVLSKAFSRLK", "truncation",
];

// 非实验关键词（方法描述、技术名称）
const NON_EXPERIMENT_KEYWORDS = [
  "isolation", "purification", "extraction", "sample preparation",
  "scoring", "analysis pipeline", "sequencing library",
  "proteomic analysis", "proteomics", "mass spectrometry analysis",
  "RNA sequencing analysis", "scRNA-seq analysis",
];

// 标准通路名映射
const PATHWAY_ALIASES: Record<string, string> = {
  "collagen hydroxylation": "ECM",
  "collagen deposition": "ECM",
  "collagen ecm": "ECM",
  "ecm organization": "ECM",
  "ecm remodeling": "ECM",
  "ecm remodeled": "ECM",
  "collagen fiber": "ECM",
  "extracellular matrix": "ECM",
  "transcriptional regulation": "TGF-β/SMAD",
  "dna binding": "DNA Repair",
  "dna damage": "DNA Damage",
  "cell cycle": "Cell Cycle",
  "apoptosis": "Apoptosis",
  "autophagy": "Autophagy",
  "ferroptosis": "Ferroptosis",
  "pyroptosis": "Pyroptosis",
  "necroptosis": "Necroptosis",
  "ros": "ROS",
  "er stress": "ER Stress",
  "nf-κb": "NF-κB",
  "nfkb": "NF-κB",
  "pi3k/akt": "PI3K/AKT",
  "pi3k-akt": "PI3K/AKT",
  "akt": "AKT",
  "mapk/erk": "MAPK/ERK",
  "mapk-erk": "MAPK/ERK",
  "erk": "ERK",
  "jnk": "JNK",
  "p38 mapk": "p38 MAPK",
  "p38": "p38 MAPK",
  "jak/stat": "JAK/STAT",
  "jak2": "JAK2",
  "stat3": "STAT3",
  "mTOR": "mTOR",
  "mtor": "mTOR",
  "ampk": "AMPK",
  "hif-1α": "HIF-1α",
  "hif1a": "HIF-1α",
  "wnt/β-catenin": "Wnt/β-catenin",
  "wnt": "Wnt/β-catenin",
  "β-catenin": "Wnt/β-catenin",
  "notch": "Notch",
  "tgf-β": "TGF-β/SMAD",
  "tgfb": "TGF-β/SMAD",
  "smad": "TGF-β/SMAD",
  "p53": "p53",
  "pd-1/pd-l1": "PD-1/PD-L1",
  "pd-l1": "PD-1/PD-L1",
  "egfr": "EGFR",
  "vegf": "VEGF",
  "hedgehog": "Hedgehog",
  "tme": "TME",
  "tumor microenvironment": "TME",
  "pericyte vessel coverage": "TME",
  "vascular integrity": "TME",
  "pericyte function": "TME",
  "pericyte gatekeeper": "TME",
  "collagen ecm deposition": "ECM",
};

// 标准表型名映射
const PHENOTYPE_ALIASES: Record<string, string> = {
  "hematogenous metastasis": "Metastasis",
  "liver metastasis": "Metastasis",
  "lung metastasis": "Metastasis",
  "metastatic spread": "Metastasis",
  "metastasis suppressed": "Metastasis",
  "metastasis decreased": "Metastasis",
  "metastasis inhibited": "Metastasis",
  "metastasis increased": "Metastasis",
  "metastasis promoted": "Metastasis",
  "tumor growth": "Tumor Growth",
  "cell invasion": "Cell Invasion",
  "cell migration": "Cell Migration",
  "cell proliferation": "Cell Proliferation",
  "cell viability": "Cell Viability",
  "apoptosis": "Apoptosis",
  "drug resistance": "Drug Resistance",
  "drug sensitivity": "Drug Sensitivity",
  "colony formation": "Colony Formation",
  "emt": "EMT",
  "angiogenesis": "Angiogenesis",
  "tube formation": "Tube Formation",
  "wound healing": "Wound Healing",
  "immune response": "Immune Response",
  "inflammation": "Inflammation",
  "inflammatory response": "Inflammatory Response",
  "t cell activation": "T Cell Activation",
  "t cell exhaustion": "T Cell Exhaustion",
  "macrophage polarization": "Macrophage Polarization",
  "pd-l1 expression": "PD-L1 Expression",
  "ic50": "IC50",
  "cytotoxicity": "Cytotoxicity",
  "cell death": "Cell Death",
  "necrosis": "Necrosis",
  "protein-protein interaction": "Cell Proliferation", // PPI 不是表型，降级处理
  "protein interaction": "Cell Proliferation",
  "overall survival": "Metastasis", // 生存归入转移相关
  "collagen deposition": "ECM Remodeling",
  "collagen hydroxylation": "ECM Remodeling",
  "ecm remodeled": "ECM Remodeling",
  "vascular leakiness": "Angiogenesis",
  "vascular integrity": "Angiogenesis",
};

/**
 * 主处理函数：过滤 → 修正干预类型 → 标准化命名 → 合并 → 排序
 */
export function postProcessExtractions(result: { experiments: ExperimentResult[] }): { experiments: ExperimentResult[] } {
  let experiments = [...result.experiments];

  // 1. 过滤非实验条目
  experiments = filterNonExperiments(experiments);

  // 2. 干预类型自动修正
  experiments = experiments.map(fixInterventionType);

  // 3. 实验类型自动修正（从方法名推断正确的 experiment_type）
  experiments = experiments.map(fixExperimentType);

  // 4. 标准化通路名和表型名
  experiments = experiments.map(standardizeNames);

  // 5. 智能合并
  experiments = mergeRelatedExperiments(experiments);

  // 6. 按 role 排序（main → supporting → control）
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
 * - 方法学描述（isolation, purification, analysis pipeline）
 */
function filterNonExperiments(experiments: ExperimentResult[]): ExperimentResult[] {
  return experiments.filter(exp => {
    const target = (exp.intervention?.target || "").toLowerCase();
    const conclusion = (exp.conclusion || "").toLowerCase();
    const methods = (exp.experiment_methods || []).map(m => m.toLowerCase()).join(" ");

    // 过滤：intervention.target 是方法描述而非真正的干预
    // 只检查 target，不检查 conclusion（conclusion 中出现 "analysis" 等词是正常的）
    const isNonExperimentTarget = NON_EXPERIMENT_KEYWORDS.some(kw =>
      target.includes(kw)
    );
    if (isNonExperimentTarget) return false;

    // 过滤：target 为空且没有 pathway/phenotype 效果
    const hasEffects = (exp.pathway_effects || []).length > 0 || (exp.phenotype_effects || []).length > 0;
    if (!exp.intervention?.target && !hasEffects) return false;

    // 有效果 → 保留
    if (hasEffects) return true;

    // 有干预 + 有结论 → 保留
    if (exp.intervention?.target && exp.conclusion && exp.conclusion.length > 20) return true;

    // 有实验方法 + 有结论 → 保留
    if (methods && exp.conclusion && exp.conclusion.length > 20) return true;

    return false;
  });
}

/**
 * 干预类型自动修正
 *
 * 综合判断：target 名 + conclusion + experiment_methods + evidence_quote
 * 多字段交叉验证，提高准确性
 */
function fixInterventionType(exp: ExperimentResult): ExperimentResult {
  if (!exp.intervention) return exp;

  const target = (exp.intervention.target || "").toLowerCase();
  const currentType = exp.intervention.type;

  // 合并所有文本线索
  const allText = [
    exp.intervention.target || "",
    exp.conclusion || "",
    exp.evidence_quote || "",
    ...(exp.experiment_methods || []),
  ].join(" ").toLowerCase();

  // 判断是否是基因名
  const targetUpper = (exp.intervention.target || "").toUpperCase();
  const isGene = GENE_NAMES.has(targetUpper) ||
    GENE_NAMES.has(exp.intervention.target || "") ||
    /^[A-Z][A-Z0-9-]{2,10}$/.test(exp.intervention.target || "");

  // 判断是否是肽类
  const isPeptide = PEPTIDE_KEYWORDS.some(kw => target.includes(kw) || allText.includes(kw));

  // 判断是否是化合物/药物
  const isDrug = DRUG_KEYWORDS.some(kw => target.includes(kw) || allText.includes(kw));

  // 判断是否是刺激因子
  const isStimulation = STIMULATION_KEYWORDS.some(kw =>
    target.includes(kw.toLowerCase()) || allText.includes(kw.toLowerCase())
  );

  // 检查实验方法中的操作线索
  const hasKnockdownMethod = /siRNA|shRNA|silencing|depletion|knockdown|antisense/i.test(allText);
  const hasOverexpressionMethod = /overexpress|transfect|plasmid|ectopic|lentiviral.*overexpress/i.test(allText);
  const hasKnockoutMethod = /knockout|CRISPR|KO|gene.*delet|CRISPR\/Cas9/i.test(allText);
  const hasInhibitionMethod = /inhibit|antagonist|block|suppress|attenuat/i.test(allText);
  const hasStimulationMethod = /stimulat|agonist|activat|treat.*with.*factor|induc/i.test(allText);

  // 多字段交叉判断
  if (isGene) {
    // 基因名 → 根据操作方法判断类型
    if (hasKnockoutMethod) return { ...exp, intervention: { ...exp.intervention, type: "knockout" } };
    if (hasKnockdownMethod) return { ...exp, intervention: { ...exp.intervention, type: "knockdown" } };
    if (hasOverexpressionMethod) return { ...exp, intervention: { ...exp.intervention, type: "overexpression" } };
    // 基因名但无明确操作 → 如果当前是 drug，改为 knockdown（最常见实验操作）
    if (currentType === "drug") return { ...exp, intervention: { ...exp.intervention, type: "knockdown" } };
    return exp;
  }

  if (isPeptide) {
    // 肽类 → drug（肽类药物）
    if (hasInhibitionMethod) return { ...exp, intervention: { ...exp.intervention, type: "inhibition" } };
    return { ...exp, intervention: { ...exp.intervention, type: "drug" } };
  }

  if (isDrug) {
    return { ...exp, intervention: { ...exp.intervention, type: "drug" } };
  }

  if (isStimulation) {
    return { ...exp, intervention: { ...exp.intervention, type: "stimulation" } };
  }

  // 复合描述（如 "TCF21-TCF3 heterodimer", "Tumor microenvironment"）→ 根据操作判断
  if (hasKnockoutMethod) return { ...exp, intervention: { ...exp.intervention, type: "knockout" } };
  if (hasKnockdownMethod) return { ...exp, intervention: { ...exp.intervention, type: "knockdown" } };
  if (hasOverexpressionMethod) return { ...exp, intervention: { ...exp.intervention, type: "overexpression" } };
  if (hasInhibitionMethod) return { ...exp, intervention: { ...exp.intervention, type: "inhibition" } };
  if (hasStimulationMethod) return { ...exp, intervention: { ...exp.intervention, type: "stimulation" } };

  return exp;
}

/**
 * 实验类型自动修正
 *
 * experiment_type 描述的是生物系统（在哪做的实验），不是检测方法（怎么做的）。
 * - cell_line: 用细胞系做的（HeLa, HCT116 等）
 * - animal_model: 用动物做的（小鼠、大鼠）
 * - patient_sample: 用患者样本做的
 * - omics: 纯计算/生信分析（没有湿实验）
 *
 * LLM 经常把方法名（如 "CoIP/MS"）填入 experiment_type，
 * 此函数根据细胞系、物种、上下文推断正确的生物系统类型。
 */
function fixExperimentType(exp: ExperimentResult): ExperimentResult {
  const currentType = (exp.experiment_type || "").toLowerCase();
  const validTypes = new Set([
    "cell_line", "primary_cell", "organoid", "tissue_slice",
    "animal_model", "xenograft", "patient_sample",
    "clinical_trial", "clinical_obs", "case_report",
    "bioinformatics", "omics", "meta_analysis", "review", "unknown",
  ]);

  // 如果已经是合法枚举值，不修改
  if (validTypes.has(currentType)) return exp;

  // 合并所有文本线索
  const allText = [
    exp.experiment_type || "",
    exp.conclusion || "",
    exp.evidence_quote || "",
    ...(exp.experiment_methods || []),
  ].join(" ").toLowerCase();

  const cellLine = (exp.model?.cell_line || "").toLowerCase();
  const species = (exp.model?.species || "").toLowerCase();

  // 优先级1：看物种 → 动物模型
  if (species && !["human", "homo sapiens"].includes(species)) {
    if (/mouse|mice|rat|rabbit|monkey|marmoset|zebrafish/.test(species)) {
      return { ...exp, experiment_type: "animal_model" };
    }
  }

  // 优先级2：看文本中的动物线索
  if (/murine|mouse model|mice model|in vivo.*mouse|rat model|xenograft.*mice|orthotopic|intraperitoneal|tail vein|intramedullary|intravenous injection/i.test(allText)) {
    if (/xenograft|patient.*derived|PDX/i.test(allText)) {
      return { ...exp, experiment_type: "xenograft" };
    }
    return { ...exp, experiment_type: "animal_model" };
  }

  // 优先级3：看临床/患者线索
  if (/patient.*sample|tumor.*tissue.*from.*patient|clinical.*trial|randomized|cohort|case.*report|survival.*analysis|kaplan.*meier|prognosi|human.*specimen|clinical.*data/i.test(allText)) {
    if (/randomized|RCT|clinical trial/i.test(allText)) return { ...exp, experiment_type: "clinical_trial" };
    if (/case report/i.test(allText)) return { ...exp, experiment_type: "case_report" };
    if (/cohort|case.control|observational/i.test(allText)) return { ...exp, experiment_type: "clinical_obs" };
    return { ...exp, experiment_type: "patient_sample" };
  }

  // 优先级4：纯计算/生信（没有细胞系、没有物种、没有具体实验方法）
  if (/bioinformatic|AlphaFold|molecular dynamics|docking|NMR.*predict|HSQC.*predict|in silico|computational/i.test(allText) && !cellLine) {
    return { ...exp, experiment_type: "bioinformatics" };
  }

  // 优先级5：组学（scRNA-seq, ChIP-seq 等高通量方法，但可能有生物系统）
  // 注意：组学方法可以在细胞系/动物/患者上做，这里只处理纯生信分析的情况
  if (/scRNA.seq.*analysis|single.cell.*analysis|RNA.seq.*analysis|ChIP.seq.*analysis|proteom.*analysis|metabolom.*analysis/i.test(allText) && !cellLine && !species) {
    return { ...exp, experiment_type: "omics" };
  }

  // 优先级6：类器官
  if (/organoid|3D.*culture|spheroid/i.test(allText)) return { ...exp, experiment_type: "organoid" };

  // 优先级7：原代细胞
  if (/primary.*cell|patient.*derived.*cell|PBMC|peripheral blood|bone marrow|fibroblast.*from|tumor.*pericyte|TPC|CAF/i.test(allText)) {
    return { ...exp, experiment_type: "primary_cell" };
  }

  // 优先级8：组织切片
  if (/tissue.*slice|tissue.*section|histolog|IHC|immunohistochem|H.&.E|hematoxylin|Masson.*stain/i.test(allText)) {
    return { ...exp, experiment_type: "tissue_slice" };
  }

  // 优先级9：细胞系（有明确细胞系名）
  if (cellLine || /HeLa|MCF7|A549|HCT116|SW480|HEK293|U87|U251|K562|Jurkat|THP1|RAW|B16|4T1|MDA|SKOV|OVCAR|PC3|DU145|LNCaP|143B|SaOS|MG63|HepG2|SGC|BGC|MKN|AGS|NCI/i.test(allText)) {
    return { ...exp, experiment_type: "cell_line" };
  }

  // 兜底：有实验方法但没匹配到上面 → 默认 cell_line（体外实验最常见）
  if ((exp.experiment_methods || []).length > 0) {
    return { ...exp, experiment_type: "cell_line" };
  }

  // 最终兜底
  if (!validTypes.has(currentType) && currentType !== "") {
    return { ...exp, experiment_type: "unknown" };
  }

  return exp;
}

/**
 * 标准化通路名和表型名
 *
 * 将 LLM 输出的描述性名称映射到标准名称
 */
function standardizeNames(exp: ExperimentResult): ExperimentResult {
  const pathwayEffects = (exp.pathway_effects || []).map(p => ({
    ...p,
    pathway: PATHWAY_ALIASES[p.pathway.toLowerCase()] || p.pathway,
  }));

  const phenotypeEffects = (exp.phenotype_effects || []).map(p => ({
    ...p,
    phenotype: PHENOTYPE_ALIASES[p.phenotype.toLowerCase()] || p.phenotype,
  }));

  return {
    ...exp,
    pathway_effects: pathwayEffects.length > 0 ? pathwayEffects : exp.pathway_effects,
    phenotype_effects: phenotypeEffects.length > 0 ? phenotypeEffects : exp.phenotype_effects,
  };
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
      evidence_figure: base.evidence_figure || group.find(e => e.evidence_figure)?.evidence_figure || null,
      evidence_table: base.evidence_table || group.find(e => e.evidence_table)?.evidence_table || null,
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
