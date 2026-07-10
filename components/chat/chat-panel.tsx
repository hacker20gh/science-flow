"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// ===== 类型 =====

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
  toolResults?: ToolResultData[];
}

interface ToolResultData {
  tool: string;
  result: Record<string, unknown>;
}

interface ChatPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  projectId?: string;
  projectContext?: {
    name: string;
    papers: string[];
    hypotheses: string[];
  };
}

// ===== 工具标签映射 =====

const TOOL_LABELS: Record<string, { icon: string; name: string; executing: string }> = {
  search_literature: { icon: "🔍", name: "文献搜索", executing: "正在搜索文献..." },
  list_papers: { icon: "📚", name: "文献列表", executing: "正在获取文献列表..." },
  view_extractions: { icon: "🧪", name: "提取数据", executing: "正在查看提取数据..." },
  create_hypothesis: { icon: "💡", name: "创建假设", executing: "正在创建假设..." },
  view_matrix: { icon: "📊", name: "机制矩阵", executing: "正在查看机制矩阵..." },
  get_project_status: { icon: "📋", name: "项目状态", executing: "正在获取项目状态..." },
};

// ===== 快捷问题模板 =====

function getQuickQuestions(projectContext?: ChatPanelProps["projectContext"]): string[] {
  const questions = ["帮我总结一下当前课题的研究进展"];
  if (projectContext?.papers && projectContext.papers.length > 0) {
    questions.push("这些文献中有哪些矛盾的发现？");
    questions.push("基于现有数据，建议我下一步做什么实验？");
  }
  questions.push("帮我解释 p 值和统计功效的概念");
  return questions.slice(0, 4);
}

// ===== 工具结果渲染 =====

function ToolResultCard({ tool, result }: { tool: string; result: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false);
  const meta = TOOL_LABELS[tool] || { icon: "🔧", name: tool, executing: `执行 ${tool}...` };

  const preview = useMemo(() => {
    if (tool === "search_literature" && Array.isArray(result.papers)) {
      return `找到 ${result.total} 篇文献`;
    }
    if (tool === "list_papers" && typeof result.count === "number") {
      return `项目中有 ${result.count} 篇文献`;
    }
    if (tool === "view_extractions" && typeof result.count === "number") {
      return `${result.count} 条提取数据`;
    }
    if (tool === "create_hypothesis" && result.success) {
      return `假设已创建`;
    }
    if (tool === "view_matrix" && typeof result.pathways_studied === "number") {
      return `${result.pathways_studied} 个通路${result.conflicts ? `，${(result.conflicts as string[]).length} 个冲突` : ""}`;
    }
    if (tool === "get_project_status" && typeof result.papers === "number") {
      return `${result.papers} 篇文献，${result.extractions} 条数据`;
    }
    return meta.name;
  }, [tool, result, meta.name]);

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg overflow-hidden text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-blue-100 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <span>{meta.icon}</span>
          <span className="font-medium text-blue-900">{meta.name}</span>
          <span className="text-blue-600">— {preview}</span>
        </span>
        <span className="text-blue-400">{expanded ? "▲" : "▼"}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-2 border-t border-blue-100">
          <pre className="text-xs text-blue-800 whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto mt-1">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ===== Markdown 消息渲染 =====

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="prose-chat">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // 代码块带复制按钮
          pre: ({ children }) => (
            <div className="relative group my-2">
              <pre className="bg-gray-900 text-gray-100 rounded-md p-3 text-xs overflow-x-auto">
                {children}
              </pre>
              <button
                onClick={() => {
                  const text = (children as { props?: { children?: string } })?.props?.children || "";
                  navigator.clipboard.writeText(typeof text === "string" ? text : "");
                }}
                className="absolute top-1 right-1 px-2 py-0.5 text-xs bg-gray-700 text-gray-300 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-600"
              >
                复制
              </button>
            </div>
          ),
          // 行内代码
          code: ({ children, className }) => {
            if (className) return <code className={className}>{children}</code>;
            return <code className="bg-gray-100 px-1 py-0.5 rounded text-xs text-red-600">{children}</code>;
          },
          // 链接可点击
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              {children}
            </a>
          ),
          // 表格样式
          table: ({ children }) => (
            <div className="overflow-x-auto my-2">
              <table className="text-xs border-collapse border border-gray-300">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-gray-300 px-2 py-1 bg-gray-50 font-medium">{children}</th>,
          td: ({ children }) => <td className="border border-gray-300 px-2 py-1">{children}</td>,
          // 列表
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-0.5 my-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-0.5 my-1">{children}</ol>,
          li: ({ children }) => <li className="text-sm">{children}</li>,
          // 段落
          p: ({ children }) => <p className="my-1 leading-relaxed">{children}</p>,
          // 标题
          h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold mt-2 mb-1">{children}</h3>,
          // 强调
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          // 引用块
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-blue-300 pl-3 py-1 my-2 bg-blue-50 text-sm text-gray-700 italic">
              {children}
            </blockquote>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ===== 时间格式化 =====

function formatTime(ts?: number): string {
  if (!ts) return "";
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  return new Date(ts).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

// ===== 复制消息 =====

function copyMessage(content: string) {
  navigator.clipboard.writeText(content).then(() => {});
}

// ===== 导出对话 =====

function exportChat(messages: Message[], projectName?: string) {
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

// ===== 消息搜索 =====

function highlightMatch(text: string, query: string): React.ReactNode {
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

// ===== 主组件 =====

export function ChatPanel({ isOpen, onToggle, projectId, projectContext }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [panelWidth, setPanelWidth] = useState(380);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [pendingToolResults, setPendingToolResults] = useState<ToolResultData[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const historyLoadedRef = useRef(false);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // 自动滚动到底部
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 检测是否需要显示"回到最新"按钮
  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollBtn(!isNearBottom);
  }, []);

  // 加载对话历史
  const loadHistory = useCallback(async () => {
    if (!projectId || historyLoadedRef.current) return;
    historyLoadedRef.current = true;
    setIsLoadingHistory(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/chat`);
      if (res.ok) {
        const data = await res.json();
        if (data.messages?.length > 0) {
          setMessages(
            data.messages.map((m: { role: string; content: string; createdAt?: string }) => ({
              role: m.role as "user" | "assistant",
              content: m.content,
              timestamp: m.createdAt ? new Date(m.createdAt).getTime() : undefined,
            }))
          );
        }
      }
    } catch {
      // 静默
    } finally {
      setIsLoadingHistory(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isOpen && projectId) loadHistory();
  }, [isOpen, projectId, loadHistory]);

  // 拖拽调整宽度
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: panelWidth };
    const handleMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const diff = dragRef.current.startX - ev.clientX;
      const newWidth = Math.max(320, Math.min(800, dragRef.current.startWidth + diff));
      setPanelWidth(newWidth);
    };
    const handleUp = () => {
      dragRef.current = null;
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [panelWidth]);

  // 发送消息
  async function sendMessage(text?: string) {
    const content = (text || input).trim();
    if (!content || isStreaming) return;

    const userMsg: Message = { role: "user", content, timestamp: Date.now() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsStreaming(true);
    setPendingToolResults([]);

    const abortController = new AbortController();
    abortRef.current = abortController;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, projectContext, projectId }),
        signal: abortController.signal,
      });

      if (!res.ok) throw new Error("请求失败");

      setMessages((prev) => [...prev, { role: "assistant", content: "", timestamp: Date.now(), toolResults: [] }]);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      let buffer = "";
      const toolResults: ToolResultData[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "text") {
              assistantText += data.text;
              const snapshot = assistantText;
              const tools = [...toolResults];
              setMessages((prev) => {
                const updated = [...prev];
                const lastIdx = updated.length - 1;
                if (updated[lastIdx]?.role === "assistant") {
                  updated[lastIdx] = { ...updated[lastIdx], content: snapshot, toolResults: tools };
                }
                return updated;
              });
            } else if (data.type === "tool_use") {
              const meta = TOOL_LABELS[data.tool];
              setToolStatus(meta?.executing || `🔧 ${data.tool}...`);
            } else if (data.type === "tool_result") {
              setToolStatus(null);
              if (data.result && !data.result.error) {
                toolResults.push({ tool: data.tool, result: data.result });
                setPendingToolResults([...toolResults]);
              }
            } else if (data.type === "error") {
              assistantText += `\n\n⚠️ ${data.message}`;
            }
          } catch { /* 忽略畸形 JSON */ }
        }
      }

      setMessages((prev) => {
        const updated = [...prev];
        const lastIdx = updated.length - 1;
        if (updated[lastIdx]?.role === "assistant") {
          updated[lastIdx] = { ...updated[lastIdx], content: assistantText || "（无回复内容）", toolResults: [...toolResults] };
        }
        return updated;
      });
    } catch (err: unknown) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (updated[lastIdx]?.role === "assistant") {
            const existing = updated[lastIdx].content;
            updated[lastIdx] = {
              ...updated[lastIdx],
              content: existing ? existing + "\n\n⚠️ 连接中断，请重试" : "⚠️ 连接中断，请重试",
            };
          }
          return updated;
        });
      }
    } finally {
      setIsStreaming(false);
      setToolStatus(null);
      setPendingToolResults([]);
      abortRef.current = null;
    }
  }

  function stopStreaming() { abortRef.current?.abort(); }

  async function clearChat() {
    setMessages([]);
    historyLoadedRef.current = false;
    if (projectId) {
      try { await fetch(`/api/projects/${projectId}/chat`, { method: "DELETE" }); } catch { /* */ }
    }
  }

  // 搜索过滤
  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    return messages.filter((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [messages, searchQuery]);

  // 浮动按钮（关闭状态）
  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-full shadow-xl hover:shadow-2xl hover:scale-105 flex items-center justify-center text-xl z-50 transition-all"
        title="AI 助手"
      >
        🤖
      </button>
    );
  }

  const panelStyle = isFullscreen
    ? { width: "100vw", height: "100vh", position: "fixed" as const, top: 0, right: 0, zIndex: 100 }
    : { width: panelWidth };

  return (
    <div
      className={`h-full border-l border-gray-200 bg-white flex flex-col shrink-0 relative ${isFullscreen ? "" : ""}`}
      style={panelStyle}
    >
      {/* 拖拽调整手柄 */}
      {!isFullscreen && (
        <div
          onMouseDown={handleDragStart}
          className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 transition-colors z-10"
        />
      )}

      {/* Header */}
      <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between bg-white shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-base">🤖</span>
          <span className="text-sm font-semibold text-gray-800">AI 助手</span>
          {messages.length > 0 && (
            <span className="text-xs text-gray-400">({messages.filter((m) => m.role === "user").length} 轮)</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {/* 搜索 */}
          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`p-1.5 text-xs rounded ${showSearch ? "text-blue-600 bg-blue-50" : "text-gray-400 hover:text-gray-600"}`}
            title="搜索消息"
          >
            🔍
          </button>
          {/* 导出 */}
          {messages.length > 0 && (
            <button
              onClick={() => exportChat(messages, projectContext?.name)}
              className="p-1.5 text-gray-400 hover:text-gray-600 text-xs"
              title="导出对话"
            >
              📥
            </button>
          )}
          {/* 清空 */}
          {messages.length > 0 && (
            <button onClick={clearChat} className="p-1.5 text-gray-400 hover:text-gray-600 text-xs" title="清空对话">
              🗑
            </button>
          )}
          {/* 全屏 */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-gray-400 hover:text-gray-600 text-xs"
            title={isFullscreen ? "退出全屏" : "全屏"}
          >
            {isFullscreen ? "🗗" : "🗖"}
          </button>
          {/* 关闭 */}
          <button onClick={onToggle} className="p-1.5 text-gray-400 hover:text-gray-600 text-xs">
            ✕
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      {showSearch && (
        <div className="px-3 py-2 border-b border-gray-100 bg-gray-50 shrink-0">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索消息..."
            autoFocus
            className="w-full px-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {searchQuery && (
            <p className="text-xs text-gray-400 mt-1">
              {filteredMessages.length} / {messages.length} 条匹配
            </p>
          )}
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
      >
        {isLoadingHistory && (
          <div className="text-center text-gray-400 py-4">
            <div className="inline-block w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
            <p className="text-xs mt-2">加载历史消息...</p>
          </div>
        )}

        {/* 空状态 + 快捷问题 */}
        {!isLoadingHistory && messages.length === 0 && (
          <div className="text-center py-6">
            <p className="text-3xl mb-3">🤖</p>
            <p className="text-sm font-medium text-gray-700">SciFlow AI 助手</p>
            <p className="text-xs text-gray-400 mt-1 mb-4">我可以帮你分析文献、解释矛盾、建议实验设计</p>
            <div className="space-y-1.5">
              {getQuickQuestions(projectContext).map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="w-full text-left px-3 py-2 text-xs text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  💬 {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 消息列表 */}
        {(searchQuery ? filteredMessages : messages).map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[90%] group ${msg.role === "user" ? "" : ""}`}>
              {/* 工具结果卡片 */}
              {msg.role === "assistant" && msg.toolResults && msg.toolResults.length > 0 && (
                <div className="mb-1.5 space-y-1">
                  {msg.toolResults.map((tr, j) => (
                    <ToolResultCard key={j} tool={tr.tool} result={tr.result} />
                  ))}
                </div>
              )}

              {/* 消息气泡 */}
              <div
                className={`px-3.5 py-2.5 rounded-2xl text-sm ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white rounded-br-md"
                    : "bg-gray-100 text-gray-800 rounded-bl-md"
                }`}
              >
                {msg.role === "user" ? (
                  <div className="whitespace-pre-wrap break-words">
                    {searchQuery ? highlightMatch(msg.content, searchQuery) : msg.content}
                  </div>
                ) : (
                  <MarkdownMessage content={msg.content} />
                )}

                {/* 流式光标 */}
                {isStreaming && i === messages.length - 1 && msg.role === "assistant" && (
                  <span className="inline-block w-1.5 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle" />
                )}
              </div>

              {/* 消息元信息 */}
              <div className={`flex items-center gap-2 mt-0.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <span className="text-[10px] text-gray-400">{formatTime(msg.timestamp)}</span>
                <button
                  onClick={() => copyMessage(msg.content)}
                  className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-gray-600"
                  title="复制"
                >
                  📋
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* 工具执行状态 */}
        {toolStatus && (
          <div className="flex justify-start">
            <div className="bg-blue-50 border border-blue-200 px-3.5 py-2.5 rounded-2xl rounded-bl-md text-sm text-blue-700 flex items-center gap-2">
              <div className="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              {toolStatus}
            </div>
          </div>
        )}

        {/* 思考中状态 */}
        {isStreaming && messages[messages.length - 1]?.role !== "assistant" && !toolStatus && (
          <div className="flex justify-start">
            <div className="bg-gray-100 px-3.5 py-2.5 rounded-2xl rounded-bl-md text-sm text-gray-400 flex items-center gap-2">
              <span className="animate-pulse">💭</span> 思考中...
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 回到最新按钮 */}
      {showScrollBtn && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10">
          <button
            onClick={scrollToBottom}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-600 shadow-md hover:shadow-lg transition-shadow"
          >
            ↓ 回到最新
          </button>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-gray-200 bg-white shrink-0">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!isStreaming) sendMessage();
              }
            }}
            placeholder={isStreaming ? "AI 正在回复中..." : "问任何关于你课题的问题... (Enter 发送，Shift+Enter 换行)"}
            disabled={isStreaming}
            rows={1}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 resize-none min-h-[38px] max-h-[120px]"
            style={{ height: "auto" }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "auto";
              el.style.height = Math.min(el.scrollHeight, 120) + "px";
            }}
          />
          {isStreaming ? (
            <button
              onClick={stopStreaming}
              className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 shrink-0 self-end"
            >
              ⏹
            </button>
          ) : (
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim()}
              className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed shrink-0 self-end"
            >
              发送
            </button>
          )}
        </div>
      </div>

      {/* Markdown 样式 */}
      <style jsx global>{`
        .prose-chat { font-size: 0.875rem; line-height: 1.6; }
        .prose-chat p { margin: 0.25rem 0; }
        .prose-chat ul, .prose-chat ol { margin: 0.25rem 0; padding-left: 1.25rem; }
        .prose-chat li { margin: 0.125rem 0; }
        .prose-chat pre { margin: 0.5rem 0; }
        .prose-chat code { font-size: 0.75rem; }
        .prose-chat h1, .prose-chat h2, .prose-chat h3 { margin-top: 0.75rem; margin-bottom: 0.25rem; }
        .prose-chat blockquote { margin: 0.5rem 0; }
        .prose-chat table { font-size: 0.75rem; }
        .prose-chat img { max-width: 100%; border-radius: 0.5rem; }
      `}</style>
    </div>
  );
}
