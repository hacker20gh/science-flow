/**
 * 机制矩阵数据生成器
 *
 * 从 LLM 提取结果或 DB 直接读取生成矩阵数据结构
 */

import type { ExperimentResult } from "@/lib/llm/extraction";
import { normalizePathway, normalizePhenotype } from "./normalize";

// ===== 矩阵数据结构 =====

export interface MatrixCell {
  direction: "up" | "down" | "no_change" | null;
  significance: string | null;
  method: string | null;
  detail: string;
  paperTitle: string;
  evidenceQuote: string;
  experimentIndex: number; // 该论文的第几个实验
  evidenceStrength: number; // 0-100 证据强度评分
}

export interface MatrixColumn {
  id: string;
  label: string;
  type: "pathway" | "phenotype";
  count: number; // 有多少行在这个维度有数据
}

export interface MatrixRow {
  id: string;
  paperTitle: string;
  paperId: string;
  drugConc: string; // 药物+浓度
  cellLine: string;
  species: string;
  year?: number;
  cells: Record<string, MatrixCell>;
}

export interface MatrixConflict {
  columnId: string;
  conflictingRows: MatrixRow[];
  description: string;
}

export interface MatrixGap {
  columnId: string;
  rowId: string;
  suggestion: string;
}

export interface MatrixData {
  rows: MatrixRow[];
  columns: MatrixColumn[];
  conflicts: MatrixConflict[];
  gaps: MatrixGap[];
  totalExperiments: number;
  totalPapers: number;
}

// ===== 证据强度评分 =====

/**
 * 计算单条证据的强度评分 (0-100)
 *
 * 评分维度：
 * - 实验方法：金标准方法（Western blot, qPCR, 流式）得高分
 * - 样本量：≥3 生物学重复得高分
 * - 统计方法：有明确统计检验得高分
 * - 显著性标记：有 p 值得高分
 */
export function calculateEvidenceStrength(opts: {
  expMethod?: string | null;
  sampleSize?: number | null;
  statisticalMethod?: string | null;
  significance?: string | null;
}): number {
  let score = 30; // 基础分

  // 实验方法评分 (0-25)
  if (opts.expMethod) {
    const method = opts.expMethod.toLowerCase();
    const goldStandard = ["western blot", "wb", "qpcr", "rt-pcr", "flow cytometry", "facs", "elisa", "immunofluorescence", "if", "confocal"];
    const goodMethod = ["luciferase", "co-ip", "coimmunoprecipitation", "chip", "pull-down", "mass spec", "sequencing", "rna-seq"];
    if (goldStandard.some(m => method.includes(m))) score += 25;
    else if (goodMethod.some(m => method.includes(m))) score += 20;
    else score += 10;
  }

  // 样本量评分 (0-25)
  if (opts.sampleSize != null) {
    if (opts.sampleSize >= 5) score += 25;
    else if (opts.sampleSize >= 3) score += 20;
    else if (opts.sampleSize >= 2) score += 10;
    else score += 5;
  }

  // 统计方法评分 (0-15)
  if (opts.statisticalMethod) {
    score += 15;
  }

  // 显著性标记评分 (0-5)
  if (opts.significance) {
    const sig = opts.significance.toLowerCase();
    if (sig.includes("0.001") || sig.includes("<0.001")) score += 5;
    else if (sig.includes("0.01") || sig.includes("<0.01")) score += 4;
    else if (sig.includes("0.05") || sig.includes("<0.05")) score += 3;
    else if (sig !== "ns" && sig !== "n.s." && sig !== "not significant") score += 2;
  }

  return Math.min(100, Math.max(0, score));
}

/**
 * 获取证据强度等级
 */
export function getStrengthLevel(score: number): {
  label: string;
  color: string;
  bgColor: string;
} {
  if (score >= 80) return { label: "强证据", color: "text-green-800", bgColor: "bg-green-100" };
  if (score >= 60) return { label: "中等证据", color: "text-green-700", bgColor: "bg-green-50" };
  if (score >= 40) return { label: "弱证据", color: "text-amber-700", bgColor: "bg-amber-50" };
  return { label: "极弱证据", color: "text-gray-500", bgColor: "bg-gray-50" };
}

// ===== 生成矩阵 =====

interface ExtractionInput {
  paperId: string;
  paperTitle: string;
  year?: number;
  experiments: ExperimentResult[];
}

export function generateMatrix(inputs: ExtractionInput[]): MatrixData {
  const rows: MatrixRow[] = [];
  const columnCounts = new Map<string, number>();
  const allColumns = new Map<string, MatrixColumn>();

  for (const input of inputs) {
    for (let i = 0; i < input.experiments.length; i++) {
      const exp = input.experiments[i];

      // 构造行
      const drugConc = [
        exp.drug_intervention.name,
        exp.drug_intervention.concentration,
      ]
        .filter(Boolean)
        .join(" ");

      const cellLine = exp.model.cell_line || "未知";

      const rowId = `${input.paperId}-${i}`;
      const cells: Record<string, MatrixCell> = {};

      // 通路变化 → 列
      for (const pe of exp.pathway_effects) {
        const colId = `pathway:${pe.pathway}`;
        ensureColumn(allColumns, colId, pe.pathway, "pathway", columnCounts);

        cells[colId] = {
          direction: pe.direction,
          significance: pe.significance,
          method: pe.method,
          detail: `${pe.method || ""} ${pe.significance || ""}`.trim(),
          paperTitle: input.paperTitle,
          evidenceQuote: exp.evidence_quote,
          experimentIndex: i,
          evidenceStrength: calculateEvidenceStrength({
            expMethod: pe.method,
            sampleSize: exp.sample_size,
            statisticalMethod: exp.statistical_test,
            significance: pe.significance,
          }),
        };
        incrementCount(columnCounts, colId);
      }

      // 表型变化 → 列
      for (const ph of exp.phenotype_effects) {
        const colId = `phenotype:${ph.phenotype}`;
        ensureColumn(allColumns, colId, ph.phenotype, "phenotype", columnCounts);

        cells[colId] = {
          direction: ph.direction,
          significance: null,
          method: null,
          detail: ph.fold_change || "",
          paperTitle: input.paperTitle,
          evidenceQuote: exp.evidence_quote,
          experimentIndex: i,
          evidenceStrength: calculateEvidenceStrength({
            expMethod: null,
            sampleSize: exp.sample_size,
            statisticalMethod: exp.statistical_test,
            significance: null,
          }),
        };
        incrementCount(columnCounts, colId);
      }

      rows.push({
        id: rowId,
        paperTitle: input.paperTitle,
        paperId: input.paperId,
        drugConc,
        cellLine,
        species: exp.model.species || "",
        year: input.year,
        cells,
      });
    }
  }

  // 按数据覆盖率排序列（有数据多的排前面）
  const columns = Array.from(allColumns.values()).sort(
    (a, b) => b.count - a.count
  );

  // 检测冲突
  const conflicts = detectConflicts(rows, columns);

  // 检测空白
  const gaps = detectGaps(rows, columns);

  return {
    rows,
    columns,
    conflicts,
    gaps,
    totalExperiments: rows.length,
    totalPapers: inputs.length,
  };
}

// ===== 冲突检测 =====

function detectConflicts(
  rows: MatrixRow[],
  columns: MatrixColumn[]
): MatrixConflict[] {
  const conflicts: MatrixConflict[] = [];

  for (const col of columns) {
    const directions = new Map<string, MatrixRow[]>();

    for (const row of rows) {
      const cell = row.cells[col.id];
      if (cell && cell.direction && cell.direction !== "no_change") {
        const existing = directions.get(cell.direction) || [];
        existing.push(row);
        directions.set(cell.direction, existing);
      }
    }

    // 如果同时有 up 和 down，就是冲突
    const ups = directions.get("up") || [];
    const downs = directions.get("down") || [];

    if (ups.length > 0 && downs.length > 0) {
      conflicts.push({
        columnId: col.id,
        conflictingRows: [...ups, ...downs],
        description: `${ups.length} 篇报道上调，${downs.length} 篇报道下调`,
      });
    }
  }

  return conflicts;
}

// ===== 空白检测 =====

function detectGaps(
  rows: MatrixRow[],
  columns: MatrixColumn[]
): MatrixGap[] {
  const gaps: MatrixGap[] = [];

  for (const row of rows) {
    for (const col of columns) {
      if (!row.cells[col.id]) {
        gaps.push({
          columnId: col.id,
          rowId: row.id,
          suggestion: `${row.paperTitle} 未研究 ${col.label}`,
        });
      }
    }
  }

  return gaps;
}

// ===== 辅助函数 =====

function ensureColumn(
  columns: Map<string, MatrixColumn>,
  id: string,
  label: string,
  type: "pathway" | "phenotype",
  counts: Map<string, number>
) {
  if (!columns.has(id)) {
    columns.set(id, {
      id,
      label,
      type,
      count: counts.get(id) || 0,
    });
  }
}

function incrementCount(counts: Map<string, number>, id: string) {
  counts.set(id, (counts.get(id) || 0) + 1);
}

// ===== DB-based 矩阵生成 =====

export interface DBExtraction {
  id: string;
  paperId: string;
  paper: { title: string; year: number | null };
  drugName: string | null;
  drugConc: string | null;
  cellLine: string | null;
  species: string | null;
  duration: string | null;
  pathwayEffects: Array<{
    pathway: string;
    direction: string;
    significance?: string | null;
    method?: string | null;
  }> | null;
  phenotypeEffects: Array<{
    phenotype: string;
    direction: string;
    fold_change?: string | null;
  }> | null;
  method: string | null;
  expMethod: string | null;
  sampleSize: number | null;
  conclusion: string | null;
  rawText: string | null;
}

/**
 * 从数据库提取结果直接生成矩阵
 *
 * 与 generateMatrix() 的区别：
 * - 直接读取 DB 中的 extraction 结构（非 LLM 内存输出）
 * - 使用 normalize.ts 归一化名称，避免同列异名
 * - 使用智能冲突检测（区分真冲突与可解释差异）
 * - 使用智能空白检测（仅标记有意义的空白）
 */
export function generateMatrixFromDB(extractions: DBExtraction[]): MatrixData {
  const rows: MatrixRow[] = [];
  const allColumns = new Map<string, MatrixColumn>();
  const columnCounts = new Map<string, number>();

  for (const ext of extractions) {
    const drugConc = [ext.drugName, ext.drugConc].filter(Boolean).join(" ");
    const cellLine = ext.cellLine || "未知";

    const cells: Record<string, MatrixCell> = {};

    // 通路效果 → 列（使用 normalize 归一化名称）
    if (ext.pathwayEffects) {
      for (const pe of ext.pathwayEffects) {
        const normalizedName = normalizePathway(pe.pathway);
        const colId = `pathway:${normalizedName}`;
        ensureColumn(allColumns, colId, normalizedName, "pathway", columnCounts);

        cells[colId] = {
          direction: pe.direction as "up" | "down" | "no_change" | null,
          significance: pe.significance || null,
          method: pe.method || ext.expMethod || null,
          detail: [pe.method || ext.expMethod, pe.significance]
            .filter(Boolean)
            .join(" ")
            .trim(),
          paperTitle: ext.paper.title,
          evidenceQuote: ext.rawText || ext.conclusion || "",
          experimentIndex: 0,
          evidenceStrength: calculateEvidenceStrength({
            expMethod: ext.expMethod,
            sampleSize: ext.sampleSize,
            statisticalMethod: ext.method,
            significance: pe.significance,
          }),
        };
        incrementCount(columnCounts, colId);
      }
    }

    // 表型效果 → 列（使用 normalize 归一化名称）
    if (ext.phenotypeEffects) {
      for (const ph of ext.phenotypeEffects) {
        const normalizedName = normalizePhenotype(ph.phenotype);
        const colId = `phenotype:${normalizedName}`;
        ensureColumn(allColumns, colId, normalizedName, "phenotype", columnCounts);

        cells[colId] = {
          direction: ph.direction as "up" | "down" | "no_change" | null,
          significance: null,
          method: null,
          detail: ph.fold_change || "",
          paperTitle: ext.paper.title,
          evidenceQuote: ext.rawText || ext.conclusion || "",
          experimentIndex: 0,
          evidenceStrength: calculateEvidenceStrength({
            expMethod: ext.expMethod,
            sampleSize: ext.sampleSize,
            statisticalMethod: ext.method,
            significance: null,
          }),
        };
        incrementCount(columnCounts, colId);
      }
    }

    rows.push({
      id: ext.id,
      paperTitle: ext.paper.title,
      paperId: ext.paperId,
      drugConc,
      cellLine,
      species: ext.species || "",
      year: ext.paper.year ?? undefined,
      cells,
    });
  }

  // 更新列的 count 值
  for (const [id, count] of columnCounts) {
    const col = allColumns.get(id);
    if (col) col.count = count;
  }

  // 按数据覆盖率排序列
  const columns = Array.from(allColumns.values()).sort(
    (a, b) => b.count - a.count
  );

  // 智能冲突检测
  const conflicts = detectSmartConflicts(rows, columns);

  // 智能空白检测
  const gaps = detectSmartGaps(rows, columns);

  const paperIds = new Set(extractions.map((e) => e.paperId));

  return {
    rows,
    columns,
    conflicts,
    gaps,
    totalExperiments: rows.length,
    totalPapers: paperIds.size,
  };
}

// ===== 智能冲突检测 =====

/**
 * 智能冲突检测 — 区分「真冲突」与「可解释差异」
 *
 * 真冲突：相同实验条件（药物浓度 + 细胞系）下，不同文献报道相反方向
 * 可解释差异：不同剂量/不同细胞系导致的差异（如剂量依赖关系）
 */
function detectSmartConflicts(
  rows: MatrixRow[],
  columns: MatrixColumn[]
): MatrixConflict[] {
  const conflicts: MatrixConflict[] = [];

  for (const col of columns) {
    const cellGroups = new Map<string, MatrixRow[]>();

    for (const row of rows) {
      const cell = row.cells[col.id];
      if (!cell || !cell.direction || cell.direction === "no_change") continue;
      const existing = cellGroups.get(cell.direction) || [];
      existing.push(row);
      cellGroups.set(cell.direction, existing);
    }

    const ups = cellGroups.get("up") || [];
    const downs = cellGroups.get("down") || [];

    if (ups.length === 0 || downs.length === 0) continue;

    // 按 (drugConc, cellLine) 分组，检查是否有真冲突
    const conditions = new Map<string, { ups: number; downs: number }>();
    for (const row of [...ups, ...downs]) {
      const key = `${row.drugConc}|||${row.cellLine}`;
      const dir = ups.includes(row) ? "up" : "down";
      const existing = conditions.get(key) || { ups: 0, downs: 0 };
      if (dir === "up") existing.ups++;
      else existing.downs++;
      conditions.set(key, existing);
    }

    // 判断是否有真冲突（相同条件下方向相反）
    let hasRealConflict = false;
    const conditionDetails: string[] = [];

    for (const [key, counts] of conditions) {
      if (counts.ups > 0 && counts.downs > 0) {
        hasRealConflict = true;
        const [conc, cell] = key.split("|||");
        conditionDetails.push(
          `${conc || "未知浓度"} ${cell || ""} 中 ${counts.ups}↑ vs ${counts.downs}↓`
        );
      }
    }

    if (hasRealConflict) {
      conflicts.push({
        columnId: col.id,
        conflictingRows: [...ups, ...downs],
        description: `真冲突：${conditionDetails.join("；")}`,
      });
    } else if (ups.length > 0 && downs.length > 0) {
      // 可解释差异：不同剂量或不同细胞系
      const uniqueConcs = new Set(
        [...ups, ...downs].map((r) => r.drugConc).filter(Boolean)
      );
      const uniqueCells = new Set(
        [...ups, ...downs].map((r) => r.cellLine).filter(Boolean)
      );

      let reason = "";
      if (uniqueConcs.size > 1)
        reason = `剂量依赖关系（${[...uniqueConcs].join(" vs ")}）`;
      else if (uniqueCells.size > 1)
        reason = `细胞系差异（${[...uniqueCells].join(" vs ")}）`;
      else
        reason = `${ups.length} 篇上调 vs ${downs.length} 篇下调`;

      conflicts.push({
        columnId: col.id,
        conflictingRows: [...ups, ...downs],
        description: reason,
      });
    }
  }

  return conflicts;
}

// ===== 智能空白检测 =====

/**
 * 智能空白检测 — 只标记有意义的空白
 *
 * 仅当：
 * 1. 行（论文）至少有 2 列数据（是活跃实验）
 * 2. 列至少有 1 行数据（是已研究的维度）
 */
function detectSmartGaps(
  rows: MatrixRow[],
  columns: MatrixColumn[]
): MatrixGap[] {
  const gaps: MatrixGap[] = [];

  // 活跃行：至少 2 列有数据
  const activeRows = rows.filter(
    (r) => Object.keys(r.cells).length >= 2
  );
  // 已研究列：至少 1 行有数据
  const studiedColumns = columns.filter((c) => c.count >= 1);

  for (const row of activeRows) {
    for (const col of studiedColumns) {
      if (!row.cells[col.id]) {
        gaps.push({
          columnId: col.id,
          rowId: row.id,
          suggestion: `${row.paperTitle} 未研究 ${col.label}`,
        });
      }
    }
  }

  return gaps;
}
