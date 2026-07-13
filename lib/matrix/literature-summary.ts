/**
 * 文献综述段落生成器
 *
 * 根据机制矩阵数据，纯算法生成可直接用于论文 Discussion 的文献综述段落。
 * 不调用 LLM，不引入新依赖。
 */

import type { MatrixData } from "@/lib/matrix/generator";

/**
 * 根据机制矩阵数据生成指定 pathway 的文献综述段落
 *
 * 返回一个结构化的中文段落，包含：
 * - 研究覆盖情况
 * - 方向分布（上调/下调/无变化）
 * - 冲突或一致性分析
 * - 证据强度评估
 * - 结论提示
 *
 * @param matrixData - 完整的机制矩阵数据
 * @param pathwayName - 通路名称（如 "NF-κB"、"PI3K/AKT"）
 * @returns 综述段落字符串
 */
export function generateLiteratureSummary(
  matrixData: MatrixData,
  pathwayName: string,
): string {
  // 1. 收集该 pathway 的所有数据
  const pathwayColumn = matrixData.columns.find(
    (c) => c.id === `pathway:${pathwayName}`,
  );
  if (!pathwayColumn) {
    return `关于 ${pathwayName} 通路的研究数据不足。`;
  }

  // 2. 统计方向分布
  const ups: string[] = [];
  const downs: string[] = [];
  const noChanges: string[] = [];
  let totalStrength = 0;
  let strengthCount = 0;

  for (const row of matrixData.rows) {
    const cell = row.cells[`pathway:${pathwayName}`];
    if (!cell || !cell.direction) continue;

    const citation = `(${row.paperTitle}, ${row.year ?? "n.d."})`;

    if (cell.direction === "up") {
      ups.push(citation);
    } else if (cell.direction === "down") {
      downs.push(citation);
    } else {
      noChanges.push(citation);
    }

    totalStrength += cell.evidenceStrength;
    strengthCount++;
  }

  const avgStrength =
    strengthCount > 0 ? Math.round(totalStrength / strengthCount) : 0;

  // 3. 组装段落
  const parts: string[] = [];

  // 开头句：研究覆盖情况
  const total = ups.length + downs.length + noChanges.length;
  parts.push(
    `在已纳入分析的 ${matrixData.totalPapers} 篇文献中，${total} 篇研究了 ${pathwayName} 通路的变化。`,
  );

  // 主要趋势：上调
  if (ups.length > 0) {
    const shown = ups.slice(0, 3).join("、");
    const suffix = ups.length > 3 ? `等${ups.length}篇` : "";
    parts.push(
      `其中 ${ups.length} 篇报道 ${pathwayName} 活性上调，包括${shown}${suffix}。`,
    );
  }

  // 主要趋势：下调
  if (downs.length > 0) {
    const shown = downs.slice(0, 3).join("、");
    const suffix = downs.length > 3 ? `等${downs.length}篇` : "";
    parts.push(
      `${downs.length} 篇报道 ${pathwayName} 活性下调，包括${shown}${suffix}。`,
    );
  }

  // 冲突或一致性分析
  if (ups.length > 0 && downs.length > 0) {
    const upPct = Math.round((ups.length / (ups.length + downs.length)) * 100);
    parts.push(
      `值得注意的是，关于 ${pathwayName} 的方向存在不一致（上调 ${upPct}% vs 下调 ${100 - upPct}%），可能与实验条件差异有关。`,
    );
  } else if (ups.length > 0 || downs.length > 0) {
    const trend = ups.length > 0 ? "上调" : "下调";
    parts.push(`多数文献一致报道 ${pathwayName} ${trend}，证据较为一致。`);
  }

  // 证据强度
  parts.push(`整体证据强度平均为 ${avgStrength}/100。`);

  // 结尾
  parts.push(
    `上述结果提示 ${pathwayName} 通路在相关生物学过程中发挥重要作用，值得进一步实验验证。`,
  );

  return parts.join("");
}

/**
 * 为所有研究数量 ≥ 3 的 pathway 生成综述段落
 *
 * @param matrixData - 完整的机制矩阵数据
 * @returns pathway name → 综述段落的映射
 */
export function generateAllPathwaySummaries(
  matrixData: MatrixData,
): Map<string, string> {
  const summaries = new Map<string, string>();

  const pathwayColumns = matrixData.columns.filter(
    (c) => c.type === "pathway" && c.count >= 3,
  );

  for (const col of pathwayColumns) {
    const summary = generateLiteratureSummary(matrixData, col.label);
    summaries.set(col.label, summary);
  }

  return summaries;
}
