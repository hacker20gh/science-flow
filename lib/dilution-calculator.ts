/**
 * 浓度稀释计算器
 *
 * 功能：
 * - 支持 μM, mM, nM, μg/mL, mg/mL, ng/mL 等浓度单位
 * - 自动换算单位
 * - 计算多步稀释方案
 * - 检测是否需要中间稀释（储液量 < 1 μL 时）
 * - 可导出供实验设计模块使用
 */

// ========== 类型定义 ==========

/** 浓度单位（统一用 "浓度单位 / 体积单位" 表示） */
export type ConcentrationUnit =
  | "μM" | "mM" | "nM" | "pM"  // 摩尔浓度
  | "μg/mL" | "mg/mL" | "ng/mL" | "pg/mL";  // 质量浓度

/** 体积单位 */
export type VolumeUnit = "μL" | "mL" | "L";

/** 单次稀释步骤 */
export interface DilutionStep {
  step: number;
  fromConc: number;        // 稀释前浓度（μM 或 μg/mL，归一化后）
  toConc: number;          // 稀释后浓度
  dilutionFactor: number;  // 稀释倍数
  stockVolume: number;     // 取储液体积（μL）
  bufferVolume: number;    // 加缓冲液体积（μL）
  totalVolume: number;     // 总体积（μL）
  /** 如果需要中间稀释，提示信息 */
  warning?: string;
}

/** 稀释计算结果 */
export interface DilutionResult {
  /** 是否需要多步稀释 */
  isMultiStep: boolean;
  /** 稀释步骤 */
  steps: DilutionStep[];
  /** 最终浓度 */
  finalConc: number;
  /** 最终浓度单位 */
  finalUnit: string;
  /** 总共需要的储液量（μL） */
  totalStockNeeded: number;
  /** 总共需要的缓冲液量（μL） */
  totalBufferNeeded: number;
  /** 警告信息 */
  warnings: string[];
}

// ========== 单位换算 ==========

/** 摩尔浓度归一化因子（统一换算到 μM） */
const MOLAR_TO_UM: Record<string, number> = {
  pM: 0.001,
  nM: 0.001,
  μM: 1,
  mM: 1000,
};

/** 质量浓度归一化因子（统一换算到 μg/mL） */
const MASS_TO_UGML: Record<string, number> = {
  "pg/mL": 0.001,
  "ng/mL": 0.001,
  "μg/mL": 1,
  "mg/mL": 1000,
};

/** 体积归一化因子（统一换算到 μL） */
const VOLUME_TO_UL: Record<string, number> = {
  μL: 1,
  mL: 1000,
  L: 1_000_000,
};

/**
 * 将任意摩尔浓度转换为 μM
 */
export function toMicroMolar(value: number, unit: string): number {
  const factor = MOLAR_TO_UM[unit];
  if (factor === undefined) throw new Error(`未知摩尔浓度单位: ${unit}`);
  return value * factor;
}

/**
 * 将任意质量浓度转换为 μg/mL
 */
export function toMicroGramMl(value: number, unit: string): number {
  const factor = MASS_TO_UGML[unit];
  if (factor === undefined) throw new Error(`未知质量浓度单位: ${unit}`);
  return value * factor;
}

/**
 * 将任意体积转换为 μL
 */
export function toMicroLiter(value: number, unit: VolumeUnit): number {
  return value * VOLUME_TO_UL[unit];
}

/**
 * 判断单位是否为摩尔浓度系列
 */
export function isMolarUnit(unit: string): boolean {
  return unit in MOLAR_TO_UM;
}

/**
 * 判断单位是否为质量浓度系列
 */
export function isMassUnit(unit: string): boolean {
  return unit in MASS_TO_UGML;
}

// ========== 核心计算 ==========

/**
 * 计算稀释方案
 *
 * @param stockConc - 储液浓度
 * @param stockUnit - 储液浓度单位（如 "mM"）
 * @param targetConc - 目标浓度
 * @param targetUnit - 目标浓度单位
 * @param desiredVolume - 所需最终体积（μL）
 * @param maxDilutionFactor - 单步最大稀释倍数（默认 100）
 * @returns 稀释方案
 */
export function calculateDilution(params: {
  stockConc: number;
  stockUnit: string;
  targetConc: number;
  targetUnit: string;
  desiredVolume: number; // μL
  maxDilutionFactor?: number;
}): DilutionResult {
  const {
    stockConc,
    stockUnit,
    targetConc,
    targetUnit,
    desiredVolume,
    maxDilutionFactor = 100,
  } = params;

  const warnings: string[] = [];
  const steps: DilutionStep[] = [];

  // 1. 统一单位
  let stockNorm: number;
  let targetNorm: number;
  let unitLabel: string;

  if (isMolarUnit(stockUnit) && isMolarUnit(targetUnit)) {
    stockNorm = toMicroMolar(stockConc, stockUnit);
    targetNorm = toMicroMolar(targetConc, targetUnit);
    unitLabel = "μM";
  } else if (isMassUnit(stockUnit) && isMassUnit(targetUnit)) {
    stockNorm = toMicroGramMl(stockConc, stockUnit);
    targetNorm = toMicroGramMl(targetConc, targetUnit);
    unitLabel = "μg/mL";
  } else {
    throw new Error(`单位类型不匹配：储液 ${stockUnit} 与目标 ${targetUnit} 不属于同一类别`);
  }

  // 2. 检查浓度合理性
  if (stockNorm <= 0 || targetNorm <= 0) {
    throw new Error("浓度必须大于 0");
  }
  if (stockNorm < targetNorm) {
    throw new Error(
      `储液浓度 (${stockConc} ${stockUnit}) 低于目标浓度 (${targetConc} ${targetUnit})，无法稀释`
    );
  }

  const overallDilution = stockNorm / targetNorm;

  // 3. 判断是否需要多步稀释
  if (overallDilution <= maxDilutionFactor) {
    // 单步稀释
    const result = singleStepDilution(
      stockNorm,
      targetNorm,
      desiredVolume,
      unitLabel,
      1
    );
    steps.push(result);

    // 检查储液量是否太少
    if (result.stockVolume < 1) {
      result.warning =
        `储液仅需 ${result.stockVolume.toFixed(3)} μL（< 1 μL），移液误差大，建议使用中间稀释`;
      warnings.push(result.warning);
      // 生成中间稀释建议
      const intermediate = suggestIntermediateDilution(
        stockNorm,
        targetNorm,
        desiredVolume,
        unitLabel
      );
      steps.push(...intermediate);
    }
  } else {
    // 多步稀释
    let currentConc = stockNorm;
    let stepNum = 1;
    let remainingDilution = overallDilution;

    while (remainingDilution > maxDilutionFactor) {
      const stepDilution = Math.min(
        maxDilutionFactor,
        Math.sqrt(remainingDilution)
      );
      const intermediateConc = currentConc / stepDilution;

      // 第一步需要的体积至少 10 μL（足够移液）
      const firstStepVol = Math.max(desiredVolume, 50);
      const stepResult = singleStepDilution(
        currentConc,
        intermediateConc,
        firstStepVol,
        unitLabel,
        stepNum
      );
      steps.push(stepResult);

      currentConc = intermediateConc;
      remainingDilution = currentConc / targetNorm;
      stepNum++;

      if (stepNum > 10) {
        warnings.push("稀释步数过多（>10），请检查输入参数");
        break;
      }
    }

    // 最后一步
    if (currentConc > targetNorm) {
      const finalStep = singleStepDilution(
        currentConc,
        targetNorm,
        desiredVolume,
        unitLabel,
        stepNum
      );
      steps.push(finalStep);

      if (finalStep.stockVolume < 1) {
        finalStep.warning =
          `最后一步储液仅需 ${finalStep.stockVolume.toFixed(3)} μL（< 1 μL），建议增大配制量`;
        warnings.push(finalStep.warning);
      }
    }
  }

  // 4. 计算总用量
  const totalStockNeeded = steps.reduce((sum, s) => sum + s.stockVolume, 0);
  const totalBufferNeeded = steps.reduce((sum, s) => sum + s.bufferVolume, 0);

  return {
    isMultiStep: steps.length > 1,
    steps,
    finalConc: targetConc,
    finalUnit: targetUnit,
    totalStockNeeded,
    totalBufferNeeded,
    warnings,
  };
}

/**
 * 单步稀释计算
 */
function singleStepDilution(
  fromConc: number,
  toConc: number,
  totalVolume: number,
  unitLabel: string,
  step: number
): DilutionStep {
  const dilutionFactor = fromConc / toConc;
  const stockVolume = totalVolume / dilutionFactor;
  const bufferVolume = totalVolume - stockVolume;

  return {
    step,
    fromConc,
    toConc,
    dilutionFactor,
    stockVolume: roundTo(stockVolume, 3),
    bufferVolume: roundTo(bufferVolume, 3),
    totalVolume: roundTo(totalVolume, 3),
  };
}

/**
 * 当储液量 < 1 μL 时，建议先做中间稀释
 *
 * 例如：从 10 mM 稀释到 100 nM（100000倍），直接取 0.1 μL 不现实
 * 建议先从 10 mM → 100 μM（100倍，取 10 μL），再从 100 μM → 100 nM（1000倍）
 */
function suggestIntermediateDilution(
  stockConc: number,
  targetConc: number,
  desiredVolume: number,
  unitLabel: string
): DilutionStep[] {
  const steps: DilutionStep[] = [];
  const overallDilution = stockConc / targetConc;

  // 选择中间浓度，使得每次稀释约 100 倍，且取液量 >= 10 μL
  // 第一步：stock → intermediate，取至少 10 μL
  const intermediateConc =
    overallDilution > 10000
      ? stockConc / 100  // 极高稀释：先稀 100 倍
      : stockConc / Math.sqrt(overallDilution); // 一般情况：平分稀释倍数

  // 第一步稀释体积：取至少 50 μL 的 intermediate stock
  const step1Vol = 50;
  const step1 = singleStepDilution(
    stockConc,
    intermediateConc,
    step1Vol,
    unitLabel,
    1
  );
  step1.warning = `中间稀释：先从 ${formatConc(stockConc, unitLabel)} 稀释到 ${formatConc(intermediateConc, unitLabel)}`;
  steps.push(step1);

  // 第二步：intermediate → target
  const step2 = singleStepDilution(
    intermediateConc,
    targetConc,
    desiredVolume,
    unitLabel,
    2
  );
  steps.push(step2);

  return steps;
}

// ========== 辅助函数 ==========

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function formatConc(value: number, unitLabel: string): string {
  if (value >= 1000) return `${roundTo(value / 1000, 2)} mM`;
  if (value >= 1) return `${roundTo(value, 2)} μM`;
  if (value >= 0.001) return `${roundTo(value * 1000, 2)} nM`;
  return `${roundTo(value * 1_000_000, 2)} pM`;
}

/**
 * 格式化稀释方案为可读文本
 */
export function formatDilutionPlan(result: DilutionResult): string {
  const lines: string[] = [];
  lines.push(`稀释方案（${result.isMultiStep ? "多步" : "单步"}）`);
  lines.push(`最终目标：${result.finalConc} ${result.finalUnit}`);
  lines.push(`总共需要储液：${roundTo(result.totalStockNeeded, 2)} μL`);
  lines.push(`总共需要缓冲液：${roundTo(result.totalBufferNeeded, 2)} μL`);
  lines.push("");

  for (const step of result.steps) {
    lines.push(
      `步骤 ${step.step}：取 ${step.stockVolume} μL 储液 + ${step.bufferVolume} μL 缓冲液`
    );
    lines.push(
      `  → ${step.fromConc} → ${step.toConc}（${step.dilutionFactor}倍稀释，总体积 ${step.totalVolume} μL）`
    );
    if (step.warning) {
      lines.push(`  ⚠ ${step.warning}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push("");
    lines.push("注意事项：");
    for (const w of result.warnings) {
      lines.push(`  • ${w}`);
    }
  }

  return lines.join("\n");
}

/**
 * 常用试剂的推荐储液浓度（供参考）
 * 用于实验设计模块快速选择
 */
export const COMMON_STOCK_CONCENTRATIONS: Record<string, { conc: number; unit: string; notes: string }[]> = {
  "DMSO 储液": [
    { conc: 100, unit: "mM", notes: "大多数小分子药物的常用储液浓度" },
    { conc: 10, unit: "mM", notes: "细胞毒性较低的保守浓度" },
  ],
  "蛋白酶抑制剂": [
    { conc: 100, unit: "×", notes: "使用前按 1:100 稀释到工作液" },
  ],
  "BSA 标准曲线": [
    { conc: 2, unit: "mg/mL", notes: "Bradford 法标准品最高点" },
  ],
};
