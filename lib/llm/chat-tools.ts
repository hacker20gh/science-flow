/**
 * AI 对话工具集
 *
 * 让 AI 助手能够执行实际操作（搜索文献、查看数据、创建假设等）
 * 而非仅限于文本回复。
 */

import { prisma } from "@/lib/db-server";
import { invalidateContextCache } from "@/lib/llm/context-builder";

// ===== 工具定义（Anthropic tool_use 格式） =====

export const CHAT_TOOLS = [
  {
    name: "search_literature",
    description: "Search academic databases for papers. Returns a list of relevant papers with titles, authors, year, journal, and abstract preview.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" as const, description: "Search query (natural language or keywords)" },
        max_results: { type: "number" as const, description: "Maximum results to return (default 5)", default: 5 },
      },
      required: ["query"],
    },
  },
  {
    name: "list_papers",
    description: "List papers already in the current project. Returns paper titles, authors, year, journal, and extraction status.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string" as const, description: "Project ID" },
        limit: { type: "number" as const, description: "Max papers to return (default 10)", default: 10 },
      },
      required: ["project_id"],
    },
  },
  {
    name: "view_extractions",
    description: "View extracted experimental data from project papers. Returns drug interventions, pathways, phenotypes, and conclusions.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string" as const, description: "Project ID" },
        pathway: { type: "string" as const, description: "Filter by pathway name (optional)" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "create_hypothesis",
    description: "Create a new research hypothesis for the project.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string" as const, description: "Project ID" },
        statement: { type: "string" as const, description: "The hypothesis statement" },
        based_on: { type: "array" as const, items: { type: "string" as const }, description: "Literature/experiments this is based on" },
      },
      required: ["project_id", "statement"],
    },
  },
  {
    name: "view_matrix",
    description: "View the mechanism matrix showing how different pathways/phenotypes are affected across papers. Shows conflicts and gaps.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string" as const, description: "Project ID" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "get_project_status",
    description: "Get project health status: literature coverage, extraction completeness, matrix status, experiment progress.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string" as const, description: "Project ID" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "update_hypothesis",
    description: "Update an existing hypothesis's status, statement, or evidence.",
    input_schema: {
      type: "object" as const,
      properties: {
        hypothesis_id: { type: "string" as const, description: "Hypothesis ID to update" },
        status: { type: "string" as const, description: "New status: pending, testing, supported, refused, revised" },
        statement: { type: "string" as const, description: "Updated statement" },
        evidence: { type: "object" as const, description: "Updated evidence (supporting/contradicting)" },
      },
      required: ["hypothesis_id"],
    },
  },
  {
    name: "edit_matrix_cell",
    description: "Edit a cell in the mechanism matrix (update direction, significance, method, or note).",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string" as const, description: "Project ID" },
        row_index: { type: "number" as const, description: "Row index in the matrix" },
        column_name: { type: "string" as const, description: "Column/dimension name" },
        direction: { type: "string" as const, description: "New direction: up, down, no_change" },
        significance: { type: "string" as const, description: "Significance level" },
        note: { type: "string" as const, description: "Note for this cell" },
      },
      required: ["project_id", "row_index", "column_name"],
    },
  },
  {
    name: "search_knowledge",
    description: "Search the SciFlow knowledge base for articles on statistics, experiment design, lab methods, and paper writing.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string" as const, description: "Search query (keywords or topic)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_workflow_status",
    description: "Get the current workflow status of the project: what's done, what's pending, what's the next recommended step.",
    input_schema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string" as const, description: "Project ID" },
      },
      required: ["project_id"],
    },
  },
];

// ===== 工具执行器 =====

export interface ToolResult {
  tool_name: string;
  result: string; // JSON string
}

/**
 * 执行单个工具调用
 */
export async function executeTool(
  toolName: string,
  input: Record<string, unknown>,
  userId: string
): Promise<ToolResult> {
  try {
    let result: ToolResult;
    switch (toolName) {
      case "search_literature":
        result = await executeSearchLiterature(input);
        break;
      case "list_papers":
        result = await executeListPapers(input);
        break;
      case "view_extractions":
        result = await executeViewExtractions(input);
        break;
      case "create_hypothesis":
        result = await executeCreateHypothesis(input, userId);
        break;
      case "view_matrix":
        result = await executeViewMatrix(input);
        break;
      case "get_project_status":
        result = await executeGetProjectStatus(input);
        break;
      case "update_hypothesis":
        result = await executeUpdateHypothesis(input);
        break;
      case "edit_matrix_cell":
        result = await executeEditMatrixCell(input);
        break;
      case "search_knowledge":
        result = await executeSearchKnowledge(input);
        break;
      case "get_workflow_status":
        result = await executeGetWorkflowStatus(input);
        break;
      default:
        result = { tool_name: toolName, result: JSON.stringify({ error: `Unknown tool: ${toolName}` }) };
    }
    maybeInvalidateCache(toolName, input);
    return result;
  } catch (error) {
    console.error(`[chat-tools] Error executing ${toolName}:`, error);
    return {
      tool_name: toolName,
      result: JSON.stringify({ error: `工具执行失败: ${error instanceof Error ? error.message : "未知错误"}` }),
    };
  }
}

/**
 * 执行工具后，如果涉及写操作，失效上下文缓存
 */
function maybeInvalidateCache(toolName: string, input: Record<string, unknown>) {
  const WRITE_TOOLS = ["create_hypothesis", "update_hypothesis", "edit_matrix_cell"];
  if (WRITE_TOOLS.includes(toolName)) {
    const projectId = input.projectId as string;
    if (projectId) invalidateContextCache(projectId);
  }
}

// ===== 工具实现 =====

async function executeSearchLiterature(input: Record<string, unknown>): Promise<ToolResult> {
  const query = input.query as string;
  const maxResults = (input.max_results as number) || 5;

  try {
    // 动态导入学术搜索模块
    const { aggregateSearch } = await import("@/lib/academic/aggregator");
    const results = await aggregateSearch({ query, maxResults });

    const papers = results.slice(0, maxResults).map((p) => ({
      title: p.title,
      authors: p.authors?.slice(0, 3).join(", ") || "Unknown",
      year: p.year,
      journal: p.journal,
      abstract_preview: p.abstract?.slice(0, 200) || "",
      pmid: p.pmid,
      doi: p.doi,
    }));

    return {
      tool_name: "search_literature",
      result: JSON.stringify({ query, total: results.length, papers }),
    };
  } catch (error) {
    return {
      tool_name: "search_literature",
      result: JSON.stringify({ error: "文献搜索服务暂时不可用", query }),
    };
  }
}

async function executeListPapers(input: Record<string, unknown>): Promise<ToolResult> {
  const projectId = input.project_id as string;
  const limit = (input.limit as number) || 10;

  if (!prisma) {
    return { tool_name: "list_papers", result: JSON.stringify({ error: "数据库不可用" }) };
  }

  const papers = await prisma.paper.findMany({
    where: { projectId },
    select: {
      title: true,
      authors: true,
      journal: true,
      year: true,
      extractions: { select: { id: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return {
    tool_name: "list_papers",
    result: JSON.stringify({
      count: papers.length,
      papers: papers.map((p: { title: string; authors: string[]; journal: string | null; year: number | null; extractions: { id: string }[] }) => ({
        title: p.title,
        authors: p.authors.slice(0, 3).join(", "),
        journal: p.journal,
        year: p.year,
        extraction_count: p.extractions.length,
      })),
    }),
  };
}

async function executeViewExtractions(input: Record<string, unknown>): Promise<ToolResult> {
  const projectId = input.project_id as string;
  const pathwayFilter = input.pathway as string | undefined;

  if (!prisma) {
    return { tool_name: "view_extractions", result: JSON.stringify({ error: "数据库不可用" }) };
  }

  const where: Record<string, unknown> = { paper: { projectId } };
  if (pathwayFilter) {
    where.pathway = { contains: pathwayFilter, mode: "insensitive" };
  }

  const extractions = await prisma.extraction.findMany({
    where,
    select: {
      drugName: true,
      drugConc: true,
      cellLine: true,
      pathway: true,
      pathwayDir: true,
      phenotype: true,
      phenotypeDir: true,
      conclusion: true,
      paper: { select: { title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return {
    tool_name: "view_extractions",
    result: JSON.stringify({
      count: extractions.length,
      extractions: extractions.map((e: { drugName: string | null; drugConc: string | null; cellLine: string | null; pathway: string | null; pathwayDir: string | null; phenotype: string | null; phenotypeDir: string | null; conclusion: string | null; paper: { title: string } }) => ({
        drug: `${e.drugName || "N/A"} ${e.drugConc || ""}`.trim(),
        cell_line: e.cellLine,
        pathway: e.pathway ? `${e.pathway} ${e.pathwayDir}` : null,
        phenotype: e.phenotype ? `${e.phenotype} ${e.phenotypeDir}` : null,
        conclusion: e.conclusion,
        paper: e.paper.title,
      })),
    }),
  };
}

async function executeCreateHypothesis(
  input: Record<string, unknown>,
  userId: string
): Promise<ToolResult> {
  const projectId = input.project_id as string;
  const statement = input.statement as string;
  const basedOn = (input.based_on as string[]) || [];

  if (!prisma) {
    return { tool_name: "create_hypothesis", result: JSON.stringify({ error: "数据库不可用" }) };
  }

  const hypothesis = await prisma.hypothesis.create({
    data: {
      projectId,
      statement,
      status: "pending",
      basedOn,
    },
  });

  // 创建时间线事件
  await prisma.timelineEvent.create({
    data: {
      projectId,
      type: "hypothesis",
      title: "提出新假设",
      content: { hypothesisId: hypothesis.id, statement },
    },
  });

  return {
    tool_name: "create_hypothesis",
    result: JSON.stringify({
      success: true,
      hypothesis_id: hypothesis.id,
      statement: hypothesis.statement,
      status: hypothesis.status,
    }),
  };
}

async function executeViewMatrix(input: Record<string, unknown>): Promise<ToolResult> {
  const projectId = input.project_id as string;

  if (!prisma) {
    return { tool_name: "view_matrix", result: JSON.stringify({ error: "数据库不可用" }) };
  }

  // 获取所有提取数据来构建矩阵摘要
  const extractions = await prisma.extraction.findMany({
    where: { paper: { projectId } },
    select: {
      pathway: true,
      pathwayDir: true,
      phenotype: true,
      phenotypeDir: true,
      paper: { select: { title: true } },
    },
  });

  // 检测冲突
  const pathwayDirections = new Map<string, Set<string>>();
  const pathwayPapers = new Map<string, Set<string>>();

  for (const e of extractions) {
    if (e.pathway) {
      if (!pathwayDirections.has(e.pathway)) pathwayDirections.set(e.pathway, new Set());
      if (!pathwayPapers.has(e.pathway)) pathwayPapers.set(e.pathway, new Set());
      if (e.pathwayDir) pathwayDirections.get(e.pathway)!.add(e.pathwayDir);
      pathwayPapers.get(e.pathway)!.add(e.paper.title);
    }
  }

  const conflicts: string[] = [];
  for (const [pathway, dirs] of pathwayDirections) {
    if (dirs.has("up") && dirs.has("down")) {
      conflicts.push(`${pathway}: conflicting directions (up vs down) across ${pathwayPapers.get(pathway)?.size} papers`);
    }
  }

  return {
    tool_name: "view_matrix",
    result: JSON.stringify({
      total_extractions: extractions.length,
      pathways_studied: pathwayDirections.size,
      conflicts,
      pathway_summary: Object.fromEntries(
        Array.from(pathwayDirections.entries()).map(([k, v]) => [k, Array.from(v)])
      ),
    }),
  };
}

async function executeGetProjectStatus(input: Record<string, unknown>): Promise<ToolResult> {
  const projectId = input.project_id as string;

  if (!prisma) {
    return { tool_name: "get_project_status", result: JSON.stringify({ error: "数据库不可用" }) };
  }

  const [paperCount, extractionCount, hypothesisCount, experimentCount] = await Promise.all([
    prisma.paper.count({ where: { projectId } }),
    prisma.extraction.count({ where: { paper: { projectId } } }),
    prisma.hypothesis.count({ where: { projectId } }),
    prisma.experiment.count({ where: { projectId } }),
  ]);

  const hypotheses = await prisma.hypothesis.findMany({
    where: { projectId },
    select: { status: true },
  });

  return {
    tool_name: "get_project_status",
    result: JSON.stringify({
      papers: paperCount,
      extractions: extractionCount,
      hypotheses: hypothesisCount,
      experiments: experimentCount,
      hypothesis_breakdown: {
        pending: hypotheses.filter((h: { status: string }) => h.status === "pending").length,
        testing: hypotheses.filter((h: { status: string }) => h.status === "testing").length,
        supported: hypotheses.filter((h: { status: string }) => h.status === "supported").length,
        refused: hypotheses.filter((h: { status: string }) => h.status === "refused").length,
      },
    }),
  };
}

async function executeUpdateHypothesis(input: Record<string, unknown>): Promise<ToolResult> {
  const hypothesisId = input.hypothesis_id as string;
  const status = input.status as string | undefined;
  const statement = input.statement as string | undefined;
  const evidence = input.evidence as Record<string, unknown> | undefined;

  if (!prisma) {
    return { tool_name: "update_hypothesis", result: JSON.stringify({ error: "数据库不可用" }) };
  }

  const updateData: Record<string, unknown> = {};
  if (status !== undefined) updateData.status = status;
  if (statement !== undefined) updateData.statement = statement;
  if (evidence !== undefined) updateData.evidence = evidence;

  if (Object.keys(updateData).length === 0) {
    return { tool_name: "update_hypothesis", result: JSON.stringify({ error: "No fields to update" }) };
  }

  const hypothesis = await prisma.hypothesis.update({
    where: { id: hypothesisId },
    data: updateData,
  });

  return {
    tool_name: "update_hypothesis",
    result: JSON.stringify({
      success: true,
      hypothesis_id: hypothesis.id,
      statement: hypothesis.statement,
      status: hypothesis.status,
      evidence: hypothesis.evidence,
    }),
  };
}

async function executeEditMatrixCell(input: Record<string, unknown>): Promise<ToolResult> {
  const projectId = input.project_id as string;
  const rowIndex = input.row_index as number;
  const columnName = input.column_name as string;
  const direction = input.direction as string | undefined;
  const significance = input.significance as string | undefined;
  const note = input.note as string | undefined;

  if (!prisma) {
    return { tool_name: "edit_matrix_cell", result: JSON.stringify({ error: "数据库不可用" }) };
  }

  const matrix = await prisma.mechanismMatrix.findUnique({ where: { projectId } });
  if (!matrix) {
    return { tool_name: "edit_matrix_cell", result: JSON.stringify({ error: "机制矩阵不存在，请先创建" }) };
  }

  // Parse the matrix data (expected format: { rows: [...], columns: [...] })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const matrixData = matrix.data as any;
  if (!matrixData?.rows || !Array.isArray(matrixData.rows)) {
    return { tool_name: "edit_matrix_cell", result: JSON.stringify({ error: "矩阵数据格式无效" }) };
  }

  if (rowIndex < 0 || rowIndex >= matrixData.rows.length) {
    return { tool_name: "edit_matrix_cell", result: JSON.stringify({ error: `行索引越界: ${rowIndex}，矩阵共 ${matrixData.rows.length} 行` }) };
  }

  const row = matrixData.rows[rowIndex];
  if (!row.cells) row.cells = {};
  if (!row.cells[columnName]) row.cells[columnName] = {};

  if (direction !== undefined) row.cells[columnName].direction = direction;
  if (significance !== undefined) row.cells[columnName].significance = significance;
  if (note !== undefined) row.cells[columnName].note = note;

  await prisma.mechanismMatrix.update({
    where: { projectId },
    data: { data: matrixData },
  });

  return {
    tool_name: "edit_matrix_cell",
    result: JSON.stringify({
      success: true,
      row_index: rowIndex,
      column_name: columnName,
      updated_cell: row.cells[columnName],
    }),
  };
}

// 内置知识库文章（关键词索引）
const KNOWLEDGE_ARTICLES = [
  { title: "P 值与统计显著性", keywords: ["p值", "p-value", "统计显著", "显著性", "statistical significance"], category: "统计学", description: "如何正确理解和使用 P 值，避免常见的统计陷阱" },
  { title: "样本量计算与统计功效", keywords: ["样本量", "sample size", "统计功效", "power", "功效分析"], category: "实验设计", description: "确定合适样本量的方法，以及统计功效的概念" },
  { title: "Western Blot 实验设计", keywords: ["western blot", "WB", "蛋白", "protein", "电泳"], category: "实验方法", description: "Western Blot 的标准流程、常见问题和排障指南" },
  { title: "qPCR 实验指南", keywords: ["qPCR", "PCR", "定量", "基因表达", "gene expression"], category: "实验方法", description: "qPCR 实验设计、引物设计和数据分析方法" },
  { title: "流式细胞术基础", keywords: ["流式", "flow cytometry", "细胞分选", "FACS"], category: "实验方法", description: "流式细胞术的原理、样品制备和数据分析" },
  { title: "实验对照组设计", keywords: ["对照", "control", "阴性对照", "阳性对照", "实验组"], category: "实验设计", description: "如何正确设置实验对照，避免常见设计错误" },
  { title: "T 检验与方差分析", keywords: ["t检验", "t-test", "ANOVA", "方差分析", "组间比较"], category: "统计学", description: "参数检验方法的选择和使用条件" },
  { title: "非参数检验方法", keywords: ["非参数", "non-parametric", "Mann-Whitney", "Wilcoxon"], category: "统计学", description: "当数据不满足正态分布时的替代检验方法" },
  { title: "线性回归与相关分析", keywords: ["回归", "regression", "相关", "correlation", "线性"], category: "统计学", description: "线性回归模型和相关性分析的方法与注意事项" },
  { title: "生存分析方法", keywords: ["生存分析", "survival", "Kaplan-Meier", "Cox"], category: "统计学", description: "生存曲线绘制和 Cox 回归分析" },
  { title: "学术论文写作结构", keywords: ["论文", "写作", "writing", "manuscript", "IMRAD"], category: "论文写作", description: "SCI 论文的标准结构和各部分写作要点" },
  { title: "文献综述写作", keywords: ["综述", "review", "文献回顾", "literature review"], category: "论文写作", description: "如何撰写系统性的文献综述" },
  { title: "图表设计与数据可视化", keywords: ["图表", "figure", "可视化", "visualization", "作图"], category: "论文写作", description: "科研论文中图表的规范设计和可视化最佳实践" },
  { title: "细胞培养操作规范", keywords: ["细胞培养", "cell culture", "传代", "冻存", "污染"], category: "实验方法", description: "细胞培养的基本操作、无菌技术和常见问题处理" },
  { title: "动物实验伦理与设计", keywords: ["动物实验", "animal", "伦理", "IACUC", "体内"], category: "实验设计", description: "动物实验的伦理要求、分组设计和统计考量" },
];

async function executeSearchKnowledge(input: Record<string, unknown>): Promise<ToolResult> {
  const query = (input.query as string).toLowerCase();
  const queryWords = query.split(/\s+/).filter((w) => w.length > 1);

  const matches = KNOWLEDGE_ARTICLES.filter((article) => {
    const articleText = [article.title, article.description, article.category, ...article.keywords].join(" ").toLowerCase();
    return queryWords.some((word) => articleText.includes(word));
  });

  return {
    tool_name: "search_knowledge",
    result: JSON.stringify({
      query: input.query,
      count: matches.length,
      articles: matches.map((a) => ({
        title: a.title,
        category: a.category,
        description: a.description,
      })),
    }),
  };
}

async function executeGetWorkflowStatus(input: Record<string, unknown>): Promise<ToolResult> {
  const projectId = input.project_id as string;

  if (!prisma) {
    return { tool_name: "get_workflow_status", result: JSON.stringify({ error: "数据库不可用" }) };
  }

  const [paperCount, extractionCount, todoCount] = await Promise.all([
    prisma.paper.count({ where: { projectId } }),
    prisma.extraction.count({ where: { paper: { projectId } } }),
    prisma.todoItem.count({ where: { projectId, status: "pending" } }),
  ]);

  const hypotheses = await prisma.hypothesis.findMany({
    where: { projectId },
    select: { status: true },
  });

  const experiments = await prisma.experiment.findMany({
    where: { projectId },
    select: { status: true },
  });

  const matrix = await prisma.mechanismMatrix.findUnique({
    where: { projectId },
    select: { id: true },
  });

  const hBreakdown = {
    pending: hypotheses.filter((h: { status: string }) => h.status === "pending").length,
    testing: hypotheses.filter((h: { status: string }) => h.status === "testing").length,
    supported: hypotheses.filter((h: { status: string }) => h.status === "supported").length,
    refused: hypotheses.filter((h: { status: string }) => h.status === "refused").length,
    revised: hypotheses.filter((h: { status: string }) => h.status === "revised").length,
  };

  const eBreakdown = {
    planned: experiments.filter((e: { status: string }) => e.status === "planned").length,
    in_progress: experiments.filter((e: { status: string }) => e.status === "in_progress").length,
    completed: experiments.filter((e: { status: string }) => e.status === "completed").length,
    failed: experiments.filter((e: { status: string }) => e.status === "failed").length,
  };

  // Determine workflow stage and next steps
  const stage: string[] = [];
  const nextSteps: string[] = [];

  if (paperCount === 0) {
    stage.push("exploration");
    nextSteps.push("添加第一篇文献开始项目");
  } else if (extractionCount === 0) {
    stage.push("extraction");
    nextSteps.push("对已有文献进行信息提取");
  } else if (!matrix) {
    stage.push("matrix_building");
    nextSteps.push("构建机制矩阵");
  } else if (hBreakdown.pending > 0 && hBreakdown.testing === 0) {
    stage.push("hypothesis_formation");
    nextSteps.push("开始验证假设");
  } else if (eBreakdown.completed === 0 && (hBreakdown.testing > 0 || hBreakdown.supported > 0)) {
    stage.push("experimentation");
    nextSteps.push("设计并执行实验验证假设");
  } else {
    stage.push("analysis");
    if (hBreakdown.supported === 0) nextSteps.push("寻找支持假设的新证据");
    if (todoCount > 0) nextSteps.push(`完成 ${todoCount} 个待办事项`);
  }

  return {
    tool_name: "get_workflow_status",
    result: JSON.stringify({
      project_id: projectId,
      current_stage: stage,
      summary: {
        papers: paperCount,
        extractions: extractionCount,
        hypotheses: hBreakdown,
        experiments: eBreakdown,
        pending_todos: todoCount,
        has_matrix: !!matrix,
      },
      next_steps: nextSteps.length > 0 ? nextSteps : ["项目进展良好，继续当前工作"],
    }),
  };
}
