/**
 * AI 对话工具集
 *
 * 让 AI 助手能够执行实际操作（搜索文献、查看数据、创建假设等）
 * 而非仅限于文本回复。
 */

import { prisma } from "@/lib/db-server";

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
    switch (toolName) {
      case "search_literature":
        return await executeSearchLiterature(input);
      case "list_papers":
        return await executeListPapers(input);
      case "view_extractions":
        return await executeViewExtractions(input);
      case "create_hypothesis":
        return await executeCreateHypothesis(input, userId);
      case "view_matrix":
        return await executeViewMatrix(input);
      case "get_project_status":
        return await executeGetProjectStatus(input);
      default:
        return { tool_name: toolName, result: JSON.stringify({ error: `Unknown tool: ${toolName}` }) };
    }
  } catch (error) {
    console.error(`[chat-tools] Error executing ${toolName}:`, error);
    return {
      tool_name: toolName,
      result: JSON.stringify({ error: `工具执行失败: ${error instanceof Error ? error.message : "未知错误"}` }),
    };
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
