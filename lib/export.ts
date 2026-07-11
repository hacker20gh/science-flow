/**
 * 数据导出工具
 */

import type { MatrixData } from "@/lib/matrix/generator";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } from "docx";

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

// ===== 机制矩阵 LaTeX 导出 =====

export function exportMatrixToLatex(matrix: MatrixData): string {
  const colCount = matrix.columns.length + 2; // +2 for 文献 and 年份
  const colSpec = "l l " + matrix.columns.map(() => "c").join(" ");

  let latex = `\\documentclass[10pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{booktabs}
\\usepackage{multirow}
\\usepackage[margin=0.5in]{geometry}
\\usepackage{longtable}

\\begin{document}

\\begin{longtable}{${colSpec}}
\\toprule
\\textbf{文献} & \\textbf{年份} & ${matrix.columns.map((c) => `\\textbf{${c.label.replace(/&/g, "\\&")}}`).join(" & ")} \\\\
\\midrule
\\endhead
`;

  for (const row of matrix.rows) {
    const cells = [
      row.paperTitle.replace(/&/g, "\\&").replace(/_/g, "\\_").slice(0, 40),
      row.year?.toString() || "",
      ...matrix.columns.map((col) => {
        const cell = row.cells[col.id];
        if (!cell) return "—";
        const dir = cell.direction === "up" ? "↑" : cell.direction === "down" ? "↓" : "—";
        return dir;
      }),
    ];
    latex += cells.join(" & ") + " \\\\\n";
  }

  latex += `\\bottomrule
\\end{longtable}

\\end{document}\n`;

  return latex;
}

// ===== BibTeX 导出 =====

interface BibTexPaper {
  title: string;
  authors: string[];
  journal?: string | null;
  year?: number | null;
  doi?: string | null;
  pmid?: string | null;
}

function makeBibtexKey(paper: BibTexPaper): string {
  const firstAuthor = paper.authors[0] || "unknown";
  // Extract last name: handle "Last, First", "First Last", or single name
  const lastName = firstAuthor.includes(",")
    ? firstAuthor.split(",")[0].trim().replace(/\s+/g, "")
    : firstAuthor.trim().split(/\s+/).pop()?.replace(/[^a-zA-Z]/g, "") || "unknown";
  const year = paper.year || "0000";
  return `${lastName.toLowerCase()}${year}`;
}

export function exportToBibtex(papers: BibTexPaper[]): string {
  const entries = papers.map((paper) => {
    const key = makeBibtexKey(paper);
    const authorStr = paper.authors.join(" and ");
    const fields: string[] = [];

    fields.push(`  title = {${paper.title}}`);
    fields.push(`  author = {${authorStr}}`);
    if (paper.journal) fields.push(`  journal = {${paper.journal}}`);
    if (paper.year) fields.push(`  year = {${paper.year}}`);
    if (paper.doi) fields.push(`  doi = {${paper.doi}}`);
    if (paper.pmid) fields.push(`  pmid = {${paper.pmid}}`);

    return `@article{${key},\n${fields.join(",\n")}\n}`;
  });

  return entries.join("\n\n") + "\n";
}

// ===== RIS 导出 =====

export function exportToRis(papers: BibTexPaper[]): string {
  const entries = papers.map((paper) => {
    const lines: string[] = ["TY  - JOUR"];

    lines.push(`TI  - ${paper.title}`);
    for (const author of paper.authors) {
      lines.push(`AU  - ${author}`);
    }
    if (paper.journal) lines.push(`JO  - ${paper.journal}`);
    if (paper.year) lines.push(`PY  - ${paper.year}`);
    if (paper.doi) lines.push(`DO  - ${paper.doi}`);
    if (paper.pmid) lines.push(`AN  - ${paper.pmid}`);

    lines.push("ER  - ");
    return lines.join("\n");
  });

  return entries.join("\n\n") + "\n";
}

// ===== Word 导出 =====

export async function exportManuscriptToWord(sections: Record<string, string | undefined>): Promise<Blob> {
  const sectionOrder = ["abstract", "introduction", "methods", "results", "discussion"];
  const sectionTitles: Record<string, string> = {
    abstract: "Abstract",
    introduction: "Introduction",
    methods: "Methods",
    results: "Results",
    discussion: "Discussion",
  };

  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      text: "Research Article",
      heading: HeadingLevel.TITLE,
      alignment: "center",
    })
  );

  // Author placeholder
  children.push(
    new Paragraph({
      text: "Author Name",
      alignment: "center",
      spacing: { after: 400 },
    })
  );

  // Sections
  for (const section of sectionOrder) {
    const content = sections[section];
    if (content) {
      children.push(
        new Paragraph({
          text: sectionTitles[section],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 300, after: 150 },
        })
      );

      // Split content into paragraphs
      const paragraphs = content.split("\n\n").filter((p) => p.trim());
      for (const para of paragraphs) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: para.trim(), size: 24 })], // 12pt = 24 half-points
            spacing: { after: 120 },
          })
        );
      }
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBlob(doc);
}
