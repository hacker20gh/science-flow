/**
 * 机制矩阵数据生成器
 *
 * 从 LLM 提取结果生成矩阵数据结构
 */

import type { ExperimentResult } from "@/lib/llm/extraction";

// ===== 矩阵数据结构 =====

export interface MatrixCell {
  direction: "up" | "down" | "no_change" | null;
  significance: string | null;
  method: string | null;
  detail: string;
  paperTitle: string;
  evidenceQuote: string;
  experimentIndex: number; // 该论文的第几个实验
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
        };
        incrementCount(columnCounts, colId);
      }

      rows.push({
        id: rowId,
        paperTitle: input.paperTitle,
        paperId: input.paperId,
        drugConc,
        cellLine,
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
