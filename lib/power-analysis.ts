/**
 * 统计功效分析（Power Analysis）
 *
 * 基于两独立样本 t-test 的样本量计算
 * 公式：n = 2 * ((z_{alpha/2} + z_beta) / d)^2
 *
 * 参考：Cohen, J. (1988). Statistical Power Analysis for the Behavioral Sciences.
 */

/** 标准正态分布的分位数表（常用值） */
const Z_TABLE: Record<number, number> = {
  0.1: 1.2816,
  0.15: 1.0364,
  0.2: 0.8416,
  0.25: 0.6745,
  0.3: 0.5244,
  0.5: 0.0,
  0.7: -0.5244,
  0.75: -0.6745,
  0.8: -0.8416,
  0.85: -1.0364,
  0.9: -1.2816,
  0.95: -1.6449,
  0.975: -1.9600,
  0.99: -2.3263,
  0.995: -2.5758,
};

/**
 * 查找最接近的 z 分位数
 * 对于不在表中的概率值，使用线性插值
 */
function zScore(probability: number): number {
  // 精确匹配
  if (probability in Z_TABLE) {
    return Z_TABLE[probability];
  }

  // 线性插值
  const keys = Object.keys(Z_TABLE)
    .map(Number)
    .sort((a, b) => a - b);

  if (probability <= keys[0]) return Z_TABLE[keys[0]];
  if (probability >= keys[keys.length - 1]) return Z_TABLE[keys[keys.length - 1]];

  for (let i = 0; i < keys.length - 1; i++) {
    if (probability >= keys[i] && probability <= keys[i + 1]) {
      const t = (probability - keys[i]) / (keys[i + 1] - keys[i]);
      return Z_TABLE[keys[i]] + t * (Z_TABLE[keys[i + 1]] - Z_TABLE[keys[i]]);
    }
  }

  return 0;
}

export interface PowerAnalysisInput {
  /** Cohen's d 效应量（小=0.2, 中=0.5, 大=0.8） */
  effectSize: number;
  /** 显著性水平（默认 0.05） */
  alpha?: number;
  /** 期望统计功效（默认 0.80） */
  power?: number;
}

export interface PowerAnalysisResult {
  /** 每组推荐样本量 */
  sampleSizePerGroup: number;
  /** 总样本量（两组） */
  totalSampleSize: number;
  /** 使用的效应量 */
  effectSize: number;
  /** 显著性水平 */
  alpha: number;
  /** 期望功效 */
  power: number;
  /** 效应量描述 */
  effectSizeLabel: string;
  /** 人类可读的结论 */
  rationale: string;
}

/**
 * 计算两独立样本 t-test 所需的样本量
 *
 * 公式：n = ceil(2 * ((z_{alpha/2} + z_{1-beta}) / d)^2)
 *
 * @returns 每组和总共需要的样本量
 */
export function calculateSampleSize(input: PowerAnalysisInput): PowerAnalysisResult {
  const { effectSize: d, alpha = 0.05, power = 0.80 } = input;

  if (d <= 0) {
    throw new Error("效应量 (Cohen's d) 必须大于 0");
  }
  if (alpha <= 0 || alpha >= 1) {
    throw new Error("显著性水平 (alpha) 必须在 (0, 1) 之间");
  }
  if (power <= 0 || power >= 1) {
    throw new Error("统计功效 (power) 必须在 (0, 1) 之间");
  }

  const zAlpha = zScore(1 - alpha / 2); // z_{alpha/2}
  const zBeta = zScore(power);           // z_{1-beta} = z_power

  const n = Math.ceil(2 * Math.pow((zAlpha + zBeta) / d, 2));

  // 确保每组至少 2 个样本
  const nPerGroup = Math.max(n, 2);
  const total = nPerGroup * 2;

  const effectSizeLabel =
    d <= 0.2 ? "小效应" :
    d <= 0.5 ? "中等效应" :
    d <= 0.8 ? "较大效应" :
    "大效应";

  const rationale =
    `基于 Power Analysis（两独立样本 t-test）：效应量 Cohen's d = ${d}（${effectSizeLabel}），` +
    `显著性水平 α = ${alpha}，期望功效 1-β = ${power}，` +
    `推荐每组 ${nPerGroup} 例，共需 ${total} 例样本。`;

  return {
    sampleSizePerGroup: nPerGroup,
    totalSampleSize: total,
    effectSize: d,
    alpha,
    power,
    effectSizeLabel,
    rationale,
  };
}

/**
 * 根据 sample_size 推荐值反算可检测的效应量
 * （在给定样本量下，power analysis 能检测到的最小效应量）
 */
export function detectableEffectSize(params: {
  sampleSizePerGroup: number;
  alpha?: number;
  power?: number;
}): { effectSize: number; label: string } {
  const { sampleSizePerGroup: n, alpha = 0.05, power = 0.80 } = params;

  if (n < 2) {
    return { effectSize: Infinity, label: "样本量不足" };
  }

  const zAlpha = zScore(1 - alpha / 2);
  const zBeta = zScore(power);

  // 反算：d = (z_{alpha/2} + z_{1-beta}) / sqrt(n/2)
  const d = (zAlpha + zBeta) / Math.sqrt(n / 2);

  const label =
    d <= 0.2 ? "可检测小效应（敏感度高）" :
    d <= 0.5 ? "可检测中等效应" :
    d <= 0.8 ? "可检测较大效应" :
    "仅能检测大效应（敏感度较低）";

  return { effectSize: Math.round(d * 1000) / 1000, label };
}
