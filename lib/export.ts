/**
 * 数据导出工具
 */

import type { MatrixData } from "@/lib/matrix/generator";

// ===== CSV 导出 =====

export function exportMatrixToCsv(matrix: MatrixData): string {
  const headers = ["文献", "年份", ...matrix.columns.map((c) => c.label)];
  const rows = matrix.rows.map((row) => {
    return [
      row.paperTitle,
      row.year?.toString() || "",
      ...matrix.columns.map((col) => {
        const cell = row.cells[col.id];
        if (!cell) return "";
        const parts: string[] = [];
        if (cell.direction === "up") parts.push("↑");
        else if (cell.direction === "down") parts.push("↓");
        else if (cell.direction === "no_change") parts.push("—");
        if (cell.significance) parts.push(cell.significance);
        return parts.join(" ");
      }),
    ];
  });

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");

  return csvContent;
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== LaTeX 导出 =====

export function exportManuscriptToLatex(sections: Record<string, string | undefined>): string {
  const sectionOrder = ["abstract", "introduction", "methods", "results", "discussion"];
  const sectionTitles: Record<string, string> = {
    abstract: "Abstract",
    introduction: "Introduction",
    methods: "Methods",
    results: "Results",
    discussion: "Discussion",
  };

  let latex = `\\documentclass[12pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{amsmath,amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}
\\usepackage[margin=1in]{geometry}

\\title{Research Article}
\\author{Author Name}
\\date{\\today}

\\begin{document}
\\maketitle

`;

  for (const section of sectionOrder) {
    const content = sections[section];
    if (content) {
      latex += `\\section{${sectionTitles[section]}}\n\n`;
      latex += content.replace(/&/g, "\\&").replace(/%/g, "\\%").replace(/\$/g, "\\$") + "\n\n";
    }
  }

  latex += `\\end{document}\n`;
  return latex;
}
