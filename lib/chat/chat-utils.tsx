// ===== Shared types =====

export interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
  toolResults?: ToolResultData[];
}

export interface ToolResultData {
  tool: string;
  result: Record<string, unknown>;
}

export interface ProjectContext {
  name: string;
  papers: string[];
  hypotheses: string[];
}

// ===== 工具标签映射 =====

export const TOOL_LABELS: Record<string, { icon: string; name: string; executing: string }> = {
  search_literature: { icon: "🔍", name: "文献搜索", executing: "正在搜索文献..." },
  list_papers: { icon: "📚", name: "文献列表", executing: "正在获取文献列表..." },
  view_extractions: { icon: "🧪", name: "提取数据", executing: "正在查看提取数据..." },
  create_hypothesis: { icon: "💡", name: "创建假设", executing: "正在创建假设..." },
  view_matrix: { icon: "📊", name: "机制矩阵", executing: "正在查看机制矩阵..." },
  get_project_status: { icon: "📋", name: "项目状态", executing: "正在获取项目状态..." },
};

// ===== 时间格式化 =====

export function formatTime(ts?: number): string {
  if (!ts) return "";
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return new Date(ts).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

// ===== 复制消息 =====

export function copyMessage(content: string) {
  navigator.clipboard.writeText(content).then(() => {});
}

// ===== 导出对话 =====

export function exportChat(messages: Message[], projectName?: string) {
  const lines = messages.map((m) => {
    const time = m.timestamp ? new Date(m.timestamp).toLocaleString("zh-CN") : "";
    return `### ${m.role === "user" ? "👤 用户" : "🤖 AI"} ${time}\n\n${m.content}\n`;
  });
  const md = `# SciFlow AI 对话记录\n\n**项目**: ${projectName || "未知"}\n**导出时间**: ${new Date().toLocaleString("zh-CN")}\n\n---\n\n${lines.join("\n---\n\n")}`;
  const blob = new Blob([md], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `sciflow-chat-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== 消息搜索高亮 =====

export function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={i} className="bg-yellow-200 px-0.5 rounded">{part}</mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

// ===== 快捷问题模板 =====

export function getQuickQuestions(projectContext?: ProjectContext): string[] {
  const questions = ["帮我总结一下当前课题的研究进展"];
  if (projectContext?.papers && projectContext.papers.length > 0) {
    questions.push("这些文献中有哪些矛盾的发现？");
    questions.push("基于现有数据，建议我下一步做什么实验？");
  }
  questions.push("帮我解释 p 值和统计功效的概念");
  return questions.slice(0, 4);
}
