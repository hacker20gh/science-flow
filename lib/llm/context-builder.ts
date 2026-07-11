/**
 * 对话上下文构建器
 *
 * 从项目数据中构建丰富的上下文，注入到 AI 对话中。
 * 包含 token 预算管理：滑动窗口 + 自动摘要。
 */

import { prisma } from "@/lib/db-server";

// Token 估算：1 token ≈ 4 字符（英文），1 token ≈ 2 字符（中文）
// 用 3 作为保守平均值
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

// ===== 缓存 =====

const contextCache = new Map<string, { data: RichContext; ts: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

export function invalidateContextCache(projectId: string) {
  contextCache.delete(projectId);
}

// ===== 构建丰富的项目上下文 =====

interface RichContext {
  context: string;
  tokenCount: number;
}

/**
 * 从项目数据中构建 AI 对话上下文
 * Token 预算：总计不超过 8000 tokens（约 24000 字符）
 */
export async function buildRichContext(projectId: string): Promise<RichContext> {
  // 检查缓存
  const cached = contextCache.get(projectId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.data;
  }

  const TOKEN_BUDGET = 8000;
  let usedTokens = 0;
  const sections: string[] = [];

  if (!prisma) {
    return { context: "", tokenCount: 0 };
  }

  try {
    // 1. 项目基本信息
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, description: true },
    });

    if (project) {
      const section = `## 项目：${project.name}${project.description ? `\n${project.description}` : ""}`;
      usedTokens += estimateTokens(section);
      sections.push(section);
    }

    // 2. 假设列表 + 证据强度
    const hypotheses = await prisma.hypothesis.findMany({
      where: { projectId },
      select: { statement: true, status: true, evidence: true },
      orderBy: { updatedAt: "desc" },
      take: 5,
    });

    if (hypotheses.length > 0) {
      const lines = hypotheses.map((h: { statement: string; status: string; evidence: unknown }) => {
        let line = `- [${h.status}] ${h.statement}`;
        if (h.evidence && typeof h.evidence === "object") {
          const ev = h.evidence as { supporting?: unknown[]; contradicting?: unknown[] };
          const sup = Array.isArray(ev.supporting) ? ev.supporting.length : 0;
          const con = Array.isArray(ev.contradicting) ? ev.contradicting.length : 0;
          if (sup + con > 0) line += `（支持 ${sup} / 反对 ${con}）`;
        }
        return line;
      });
      const section = `## 假设\n${lines.join("\n")}`;
      const tokens = estimateTokens(section);
      if (usedTokens + tokens <= TOKEN_BUDGET) {
        usedTokens += tokens;
        sections.push(section);
      }
    }

    // 3. 最近提取结论（关键实验数据）
    const extractions = await prisma.extraction.findMany({
      where: { paper: { projectId } },
      select: {
        drugName: true,
        drugConc: true,
        pathway: true,
        pathwayDir: true,
        phenotype: true,
        phenotypeDir: true,
        conclusion: true,
        cellLine: true,
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (extractions.length > 0) {
      const lines = extractions.map((e: { drugName: string | null; drugConc: string | null; pathway: string | null; pathwayDir: string | null; phenotype: string | null; phenotypeDir: string | null; conclusion: string | null; cellLine: string | null }) => {
        const parts: string[] = [];
        if (e.drugName) parts.push(`${e.drugName}${e.drugConc ? ` ${e.drugConc}` : ""}`);
        if (e.cellLine) parts.push(e.cellLine);
        if (e.pathway) parts.push(`${e.pathway} ${e.pathwayDir || "?"}`);
        if (e.phenotype) parts.push(`${e.phenotype} ${e.phenotypeDir || "?"}`);
        if (e.conclusion) parts.push(`→ ${e.conclusion}`);
        return `- ${parts.join(" | ")}`;
      });
      const section = `## 关键实验数据\n${lines.join("\n")}`;
      const tokens = estimateTokens(section);
      if (usedTokens + tokens <= TOKEN_BUDGET) {
        usedTokens += tokens;
        sections.push(section);
      }
    }

    // 4. 实验列表摘要
    const experiments = await prisma.experiment.findMany({
      where: { projectId },
      select: { name: true, status: true, type: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    if (experiments.length > 0) {
      const lines = experiments.map((e: { name: string; status: string; type: string }) =>
        `- [${e.status}] ${e.name} (${e.type})`
      );
      const section = `## 实验\n${lines.join("\n")}`;
      const tokens = estimateTokens(section);
      if (usedTokens + tokens <= TOKEN_BUDGET) {
        usedTokens += tokens;
        sections.push(section);
      }
    }

    // 5. 矩阵冲突摘要（不传完整矩阵）
    // 注意：矩阵是客户端生成的，这里从 extraction 数据中检测冲突
    const pathwayConflicts = detectPathwayConflicts(extractions);
    if (pathwayConflicts.length > 0) {
      const section = `## ⚠️ 文献冲突\n${pathwayConflicts.map((c: string) => `- ${c}`).join("\n")}`;
      const tokens = estimateTokens(section);
      if (usedTokens + tokens <= TOKEN_BUDGET) {
        usedTokens += tokens;
        sections.push(section);
      }
    }

    // 6. 时间线最近事件
    const timeline = await prisma.timelineEvent.findMany({
      where: { projectId },
      select: { type: true, title: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    if (timeline.length > 0) {
      const lines = timeline.map((e: { type: string; title: string; createdAt: Date }) =>
        `- [${e.type}] ${e.title}`
      );
      const section = `## 最近事件\n${lines.join("\n")}`;
      const tokens = estimateTokens(section);
      if (usedTokens + tokens <= TOKEN_BUDGET) {
        usedTokens += tokens;
        sections.push(section);
      }
    }

    // 7. 失败实验记录（从时间线中提取 failure 类型）
    const failedEvents = timeline.filter((e: { type: string }) =>
      e.type === "failure" || e.type === "experiment_failed"
    );
    if (failedEvents.length > 0) {
      const section = `## ⚠️ 失败记录\n${failedEvents.map((e: { title: string }) => `- ${e.title}`).join("\n")}`;
      const tokens = estimateTokens(section);
      if (usedTokens + tokens <= TOKEN_BUDGET) {
        usedTokens += tokens;
        sections.push(section);
      }
    }

    // 8. 未解决问题（从 matrix gaps 推断）
    const missingPathways = new Set<string>();
    for (const e of extractions) {
      if (e.pathway && !e.pathwayDir) missingPathways.add(e.pathway);
    }
    if (missingPathways.size > 0) {
      const section = `## 🔍 待验证方向\n${[...missingPathways].map((p: string) => `- ${p}：方向未确认`).join("\n")}`;
      const tokens = estimateTokens(section);
      if (usedTokens + tokens <= TOKEN_BUDGET) {
        usedTokens += tokens;
        sections.push(section);
      }
    }

    const result: RichContext = {
      context: sections.join("\n\n"),
      tokenCount: usedTokens,
    };

    // 写入缓存
    contextCache.set(projectId, { data: result, ts: Date.now() });

    return result;
  } catch (error) {
    console.error("[context-builder] Failed to build context:", error);
    return { context: "", tokenCount: 0 };
  }
}

/**
 * 从提取数据中检测通路冲突
 */
function detectPathwayConflicts(
  extractions: Array<{ pathway: string | null; pathwayDir: string | null }>
): string[] {
  const pathwayDirections = new Map<string, Set<string>>();

  for (const e of extractions) {
    if (!e.pathway || !e.pathwayDir) continue;
    if (!pathwayDirections.has(e.pathway)) {
      pathwayDirections.set(e.pathway, new Set());
    }
    pathwayDirections.get(e.pathway)!.add(e.pathwayDir);
  }

  const conflicts: string[] = [];
  for (const [pathway, directions] of pathwayDirections) {
    if (directions.has("up") && directions.has("down")) {
      conflicts.push(`${pathway}：文献间变化方向矛盾（有的报道上调，有的下调）`);
    }
  }

  return conflicts;
}

// ===== Token 预算管理：消息滑动窗口 =====

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ManagedMessages {
  messages: Message[];
  wasTruncated: boolean;
  summary?: string;
}

/**
 * 管理消息历史的 token 预算
 *
 * 策略：
 * 1. 保留最近的消息（从最新往回数，直到预算用完）
 * 2. 超出部分如果少于 4 条，直接丢弃（太短不值得摘要）
 * 3. 超出部分如果 >= 4 条，生成摘要
 * 4. 单条消息超长（>2000 tokens）→ 截断 + "..."
 */
export function manageMessageBudget(
  messages: Message[],
  budgetTokens: number
): ManagedMessages {
  if (messages.length === 0) {
    return { messages: [], wasTruncated: false };
  }

  // 先处理超长消息
  const processed = messages.map((m) => {
    const tokens = estimateTokens(m.content);
    if (tokens > 2000) {
      const maxChars = 2000 * 3; // ~6000 字符
      return { ...m, content: m.content.slice(0, maxChars) + "\n\n[...内容过长已截断]" };
    }
    return m;
  });

  // 从最新消息往回数，直到预算用完
  let usedTokens = 0;
  let cutoffIndex = processed.length; // 不包含的索引

  for (let i = processed.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(processed[i].content) + 10; // +10 for role overhead
    if (usedTokens + msgTokens > budgetTokens) {
      cutoffIndex = i + 1;
      break;
    }
    usedTokens += msgTokens;
    cutoffIndex = i;
  }

  // 全部在预算内
  if (cutoffIndex === 0) {
    return { messages: processed, wasTruncated: false };
  }

  // 被截断的消息
  const kept = processed.slice(cutoffIndex);
  const dropped = processed.slice(0, cutoffIndex);

  // 如果丢弃的消息太少（<4 条），不生成摘要
  if (dropped.length < 4) {
    return { messages: kept, wasTruncated: true };
  }

  // 生成简单的对话摘要（不用 LLM，避免额外延迟）
  const summaryParts: string[] = [];
  const userMsgs = dropped.filter((m) => m.role === "user");
  if (userMsgs.length > 0) {
    summaryParts.push(`用户之前讨论了 ${userMsgs.length} 个话题`);
    // 取前 3 条用户消息的前 50 字符作为关键词
    const keywords = userMsgs
      .slice(0, 3)
      .map((m) => m.content.slice(0, 50).replace(/\n/g, " "))
      .join("；");
    summaryParts.push(`主要话题：${keywords}`);
  }

  const summary = `[对话摘要] ${summaryParts.join("。")}。（共省略 ${dropped.length} 条历史消息）`;

  return {
    messages: [{ role: "user" as const, content: summary }, ...kept],
    wasTruncated: true,
    summary,
  };
}
