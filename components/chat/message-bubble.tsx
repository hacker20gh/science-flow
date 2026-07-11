import { type Message, formatTime, copyMessage, highlightMatch } from "@/lib/chat/chat-utils";
import { ToolResultCard } from "./tool-result-card";
import { MarkdownRenderer } from "./markdown-renderer";

interface MessageBubbleProps {
  message: Message;
  index: number;
  isLast: boolean;
  isStreaming: boolean;
  searchQuery: string;
}

export function MessageBubble({ message, index, isLast, isStreaming, searchQuery }: MessageBubbleProps) {
  const msg = message;

  return (
    <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
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
            <MarkdownRenderer content={msg.content} />
          )}

          {/* 流式光标 */}
          {isStreaming && isLast && msg.role === "assistant" && (
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
  );
}
