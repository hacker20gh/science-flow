"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { type Message, type ToolResultData, type ProjectContext, TOOL_LABELS, exportChat } from "@/lib/chat/chat-utils";
import { ChatHeader } from "./chat-header";
import { MessageList } from "./message-list";
import { ChatInput } from "./chat-input";

interface ChatPanelProps {
  isOpen: boolean;
  onToggle: () => void;
  projectId?: string;
  projectContext?: ProjectContext;
}

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
      <ChatHeader
        messageCount={messages.length}
        showSearch={showSearch}
        isFullscreen={isFullscreen}
        projectName={projectContext?.name}
        messages={messages}
        onToggleSearch={() => setShowSearch(!showSearch)}
        onExport={() => exportChat(messages, projectContext?.name)}
        onClear={clearChat}
        onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        onClose={onToggle}
      />

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
      <MessageList
        messages={messages}
        filteredMessages={filteredMessages}
        searchQuery={searchQuery}
        isStreaming={isStreaming}
        isLoadingHistory={isLoadingHistory}
        toolStatus={toolStatus}
        projectContext={projectContext}
        messagesContainerRef={messagesContainerRef}
        messagesEndRef={messagesEndRef}
        showScrollBtn={showScrollBtn}
        onScroll={handleScroll}
        onScrollToBottom={scrollToBottom}
        onSendMessage={(text) => sendMessage(text)}
      />

      {/* Input */}
      <ChatInput
        input={input}
        isStreaming={isStreaming}
        onInputChange={setInput}
        onSend={() => sendMessage()}
        onStop={stopStreaming}
      />

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
