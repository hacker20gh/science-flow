/**
 * 通路/表型名称归一化
 *
 * 将 LLM 返回的原始名称映射到标准名称，
 * 避免 "NF-κB" / "NF-kB" / "NF-kappaB" 产生多列。
 *
 * 策略：精确匹配别名表 + 后缀剥离 + 模糊匹配（编辑距离）+ Title Case 兜底
 */

// ===== 通路名称归一化 =====

const PATHWAY_ALIASES: Record<string, string> = {
  // NF-κB 家族
  "nf-κb": "NF-κB",
  "nf-kb": "NF-κB",
  "nf-kappab": "NF-κB",
  "nf-kappa b": "NF-κB",
  "nf-κb signaling": "NF-κB",
  "nf-κb signaling pathway": "NF-κB",
  "nf-κb pathway": "NF-κB",
  "nf-kb signaling": "NF-κB",
  "nf-kb pathway": "NF-κB",
  "nf-κb activation": "NF-κB",
  "nf-kb activation": "NF-κB",
  "nuclear factor kappa b": "NF-κB",
  "nuclear factor-κb": "NF-κB",
  "nuclear factor-kappa b": "NF-κB",

  // PI3K/AKT 通路
  "pi3k/akt": "PI3K/AKT",
  "pi3k-akt": "PI3K/AKT",
  "pi3k/akt pathway": "PI3K/AKT",
  "pi3k/akt signaling": "PI3K/AKT",
  "pi3k/akt signaling pathway": "PI3K/AKT",
  "pi3k-akt signaling": "PI3K/AKT",
  "pi3k/akt/mtor": "PI3K/AKT/mTOR",
  "pi3k/akt/mtor pathway": "PI3K/AKT/mTOR",
  "pi3k-akt-mtor": "PI3K/AKT/mTOR",
  "pi3k-akt/mtor": "PI3K/AKT/mTOR",
  "akt": "AKT",
  "akt signaling": "AKT",
  "akt pathway": "AKT",
  "akt/mtor": "AKT/mTOR",
  "pi3k": "PI3K",
  "pi3k signaling": "PI3K",

  // MAPK/ERK 通路
  "mapk/erk": "MAPK/ERK",
  "mapk-erk": "MAPK/ERK",
  "mapk/erk pathway": "MAPK/ERK",
  "mapk/erk signaling": "MAPK/ERK",
  "erk": "ERK",
  "erk signaling": "ERK",
  "erk1/2": "ERK1/2",
  "mapk": "MAPK",
  "mapk signaling": "MAPK",
  "mapk pathway": "MAPK",
  "ras/mapk": "RAS/MAPK",
  "ras-mapk": "RAS/MAPK",
  "raf/mek/erk": "RAF/MEK/ERK",
  "mek/erk": "MEK/ERK",
  "p38 mapk": "p38 MAPK",
  "p38": "p38 MAPK",
  "jnk": "JNK",
  "jnk signaling": "JNK",

  // JAK/STAT 通路
  "jak/stat": "JAK/STAT",
  "jak-stat": "JAK/STAT",
  "jak/stat pathway": "JAK/STAT",
  "jak/stat signaling": "JAK/STAT",
  "jak/stat3": "JAK/STAT3",
  "jak2/stat3": "JAK2/STAT3",
  "stat3": "STAT3",
  "stat3 signaling": "STAT3",
  "jak2": "JAK2",
  "jak1": "JAK1",

  // Wnt 通路
  "wnt": "Wnt",
  "wnt signaling": "Wnt",
  "wnt pathway": "Wnt",
  "wnt/β-catenin": "Wnt/β-catenin",
  "wnt/beta-catenin": "Wnt/β-catenin",
  "wnt/β-catenin signaling": "Wnt/β-catenin",
  "β-catenin": "β-catenin",
  "beta-catenin": "β-catenin",

  // Notch 通路
  "notch": "Notch",
  "notch signaling": "Notch",
  "notch pathway": "Notch",

  // Hedgehog 通路
  "hedgehog": "Hedgehog",
  "hedgehog signaling": "Hedgehog",
  "shh": "Sonic Hedgehog",

  // TGF-β 通路
  "tgf-β": "TGF-β",
  "tgf-beta": "TGF-β",
  "tgf-β signaling": "TGF-β",
  "tgf-β/smad": "TGF-β/SMAD",
  "tgf-beta/smad": "TGF-β/SMAD",
  "smad": "SMAD",

  // HIF 通路
  "hif": "HIF",
  "hif-1α": "HIF-1α",
  "hif-1a": "HIF-1α",
  "hif-1": "HIF-1",
  "hif signaling": "HIF",

  // p53 通路
  "p53": "p53",
  "p53 signaling": "p53",
  "p53 pathway": "p53",
  "tp53": "p53",

  // mTOR 通路
  "mtor": "mTOR",
  "mtor signaling": "mTOR",
  "mtor pathway": "mTOR",
  "mtor signaling pathway": "mTOR",

  // 其他常见通路
  "ampk": "AMPK",
  "ampk signaling": "AMPK",
  "ampk pathway": "AMPK",
  "ros": "ROS",
  "reactive oxygen species": "ROS",
  "oxidative stress": "Oxidative Stress",
  "er stress": "ER Stress",
  "endoplasmic reticulum stress": "ER Stress",
  "unfolded protein response": "UPR",
  "upr": "UPR",
  "autophagy": "Autophagy",
  "necroptosis": "Necroptosis",
  "ferroptosis": "Ferroptosis",
  "pyroptosis": "Pyroptosis",
  "cell cycle": "Cell Cycle",
  "dna damage": "DNA Damage",
  "dna repair": "DNA Repair",
  "angiogenesis": "Angiogenesis",
  "vegf": "VEGF",
  "vegf signaling": "VEGF",
  "egfr": "EGFR",
  "egfr signaling": "EGFR",
  "her2": "HER2",
  "pd-1/pd-l1": "PD-1/PD-L1",
  "pd-1": "PD-1",
  "immune checkpoint": "Immune Checkpoint",
  "t cell": "T Cell",
  "t cell exhaustion": "T Cell Exhaustion",
  "tumor microenvironment": "TME",
  "tme": "TME",
};

// ===== 表型名称归一化 =====

const PHENOTYPE_ALIASES: Record<string, string> = {
  // 细胞存活/死亡
  "apoptosis": "Apoptosis",
  "cell apoptosis": "Apoptosis",
  "programmed cell death": "Apoptosis",
  "apoptotic cell death": "Apoptosis",
  "cell death": "Cell Death",
  "necrosis": "Necrosis",
  "viability": "Cell Viability",
  "cell viability": "Cell Viability",
  "cell survival": "Cell Viability",
  "cytotoxicity": "Cytotoxicity",
  "cell cytotoxicity": "Cytotoxicity",
  "toxicity": "Cytotoxicity",

  // 增殖
  "proliferation": "Cell Proliferation",
  "cell proliferation": "Cell Proliferation",
  "cell growth": "Cell Growth",
  "growth": "Cell Growth",
  "tumor growth": "Tumor Growth",
  "tumor proliferation": "Tumor Growth",
  "colony formation": "Colony Formation",
  "colony forming": "Colony Formation",
  "clonogenic": "Colony Formation",

  // 迁移/侵袭
  "migration": "Cell Migration",
  "cell migration": "Cell Migration",
  "cell motility": "Cell Migration",
  "wound healing": "Wound Healing",
  "scratch assay": "Wound Healing",
  "invasion": "Cell Invasion",
  "cell invasion": "Cell Invasion",
  "invasiveness": "Cell Invasion",
  "metastasis": "Metastasis",
  "tumor metastasis": "Metastasis",
  "epithelial-mesenchymal transition": "EMT",
  "emt": "EMT",

  // 表达/水平
  "pd-l1 expression": "PD-L1 Expression",
  "pd-l1 levels": "PD-L1 Expression",
  "pdl1 expression": "PD-L1 Expression",
  "protein expression": "Protein Expression",
  "gene expression": "Gene Expression",
  "mrna expression": "mRNA Expression",
  "mrna levels": "mRNA Expression",

  // 血管生成
  "angiogenesis": "Angiogenesis",
  "vascularization": "Angiogenesis",
  "tube formation": "Tube Formation",

  // 免疫
  "immune response": "Immune Response",
  "inflammation": "Inflammation",
  "inflammatory response": "Inflammation",
  "t cell activation": "T Cell Activation",
  "t cell exhaustion": "T Cell Exhaustion",
  "macrophage polarization": "Macrophage Polarization",
  "tumor immune": "Tumor Immune",

  // 药物相关
  "drug resistance": "Drug Resistance",
  "chemoresistance": "Drug Resistance",
  "sensitivity": "Drug Sensitivity",
  "drug sensitivity": "Drug Sensitivity",
  "ic50": "IC50",
  "ec50": "EC50",
};

// ===== Suffix patterns to strip =====

const PATHWAY_SUFFIXES = [
  " signaling pathway",
  " signaling",
  " pathway",
  " activation",
  " inhibition",
  " cascade",
];

const PHENOTYPE_SUFFIXES = [
  " level",
  " levels",
  " activity",
  " rate",
  " ability",
  " capacity",
];

// ===== 模糊匹配工具函数 =====

/**
 * 计算两个字符串的 Levenshtein 编辑距离
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

/**
 * 从别名表中找最接近的匹配
 * 返回匹配的标准名称，或 null 如果没有足够接近的
 *
 * @param input 输入名称（小写）
 * @param aliases 别名表
 * @param maxDistance 最大允许编辑距离（默认 3）
 */
function fuzzyMatch(input: string, aliases: Record<string, string>, maxDistance = 3): string | null {
  let bestMatch: string | null = null;
  let bestDistance = maxDistance + 1;

  for (const alias of Object.keys(aliases)) {
    const dist = levenshteinDistance(input, alias);
    if (dist < bestDistance) {
      bestDistance = dist;
      bestMatch = aliases[alias]; // 返回标准名称
    }
  }

  return bestDistance <= maxDistance ? bestMatch : null;
}

/**
 * 归一化通路名称
 *
 * 1. 精确匹配别名表
 * 2. 剥离常见后缀后重试
 * 3. 模糊匹配（编辑距离 ≤ 3）
 * 4. 兜底：Title Case
 */
export function normalizePathway(raw: string): string {
  if (!raw) return raw;
  const lower = raw.toLowerCase().trim();

  // 精确匹配
  if (PATHWAY_ALIASES[lower]) return PATHWAY_ALIASES[lower];

  // 剥离后缀重试
  for (const suffix of PATHWAY_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      const stripped = lower.slice(0, -suffix.length);
      if (PATHWAY_ALIASES[stripped]) return PATHWAY_ALIASES[stripped];
    }
  }

  // 3. 模糊匹配 — 编辑距离 ≤ 3
  const fuzzyPathwayResult = fuzzyMatch(lower, PATHWAY_ALIASES, 3);
  if (fuzzyPathwayResult) {
    console.log(`[Normalize] Fuzzy match pathway: "${raw}" → "${fuzzyPathwayResult}"`);
    return fuzzyPathwayResult;
  }

  // 4. 兜底：Title Case（保持原样但规范化大小写）
  return smartTitleCase(raw.trim());
}

/**
 * 归一化表型名称
 *
 * 1. 精确匹配别名表
 * 2. 剥离常见后缀后重试
 * 3. 模糊匹配（编辑距离 ≤ 3）
 * 4. 兜底：Title Case
 */
export function normalizePhenotype(raw: string): string {
  if (!raw) return raw;
  const lower = raw.toLowerCase().trim();

  // 精确匹配
  if (PHENOTYPE_ALIASES[lower]) return PHENOTYPE_ALIASES[lower];

  // 剥离后缀重试
  for (const suffix of PHENOTYPE_SUFFIXES) {
    if (lower.endsWith(suffix)) {
      const stripped = lower.slice(0, -suffix.length);
      if (PHENOTYPE_ALIASES[stripped]) return PHENOTYPE_ALIASES[stripped];
    }
  }

  // 3. 模糊匹配 — 编辑距离 ≤ 3
  const fuzzyPhenotypeResult = fuzzyMatch(lower, PHENOTYPE_ALIASES, 3);
  if (fuzzyPhenotypeResult) {
    console.log(`[Normalize] Fuzzy match phenotype: "${raw}" → "${fuzzyPhenotypeResult}"`);
    return fuzzyPhenotypeResult;
  }

  // 4. 兜底
  return smartTitleCase(raw.trim());
}

/**
 * 智能 Title Case — 保留全大写缩写（NF, PI3K, JAK 等）
 */
function smartTitleCase(s: string): string {
  // 如果已经是全大写或包含常见大写缩写，保持原样
  if (/^[A-Z]{2,}($|[^a-z])/.test(s)) return s;

  return s.replace(/\b([a-zA-Z])/g, (match, char, offset) => {
    // 2-3 个字母的全大写词保持大写（如 NF, PI, JAK）
    const word = s.slice(offset).match(/^([a-zA-Z]+)/)?.[1] || "";
    if (word.length <= 4 && word === word.toUpperCase()) return match;
    // 首字母大写
    return char.toUpperCase();
  });
}

/**
 * 批量归一化——收集所有唯一名称并返回映射
 * 用于调试和 UI 显示
 */
export function buildNormalizationMap(
  pathways: string[],
  phenotypes: string[]
): { pathwayMap: Map<string, string>; phenotypeMap: Map<string, string> } {
  const pathwayMap = new Map<string, string>();
  const phenotypeMap = new Map<string, string>();

  for (const p of pathways) {
    pathwayMap.set(p, normalizePathway(p));
  }
  for (const p of phenotypes) {
    phenotypeMap.set(p, normalizePhenotype(p));
  }

  return { pathwayMap, phenotypeMap };
}
