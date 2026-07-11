import { useState, useRef, useEffect } from "react";
import { type Message, formatTime, copyMessage, highlightMatch } from "@/lib/chat/chat-utils";
import { ToolResultCard } from "./tool-result-card";
import { MarkdownRenderer } from "./markdown-renderer";

interface MessageBubbleProps {
  message: Message;
  index: number;
  isLast: boolean;
  isStreaming: boolean;
  searchQuery: string;
  onRegenerate?: () => void;
  onEdit?: (index: number, newContent: string) => void;
}

export function MessageBubble({ message, index, isLast, isStreaming, searchQuery, onRegenerate, onEdit }: MessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const msg = message;

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(editContent.length, editContent.length);
    }
  }, [isEditing, editContent.length]);

  function handleSaveEdit() {
    if (!editContent.trim() || editContent === message.content) {
      setIsEditing(false);
      setEditContent(message.content);
      return;
    }
    setIsEditing(false);
    onEdit?.(index, editContent.trim());
  }

  function handleCancelEdit() {
    setIsEditing(false);
    setEditContent(message.content);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  }

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
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={Math.min(editContent.split("\n").length + 1, 8)}
              className="w-full bg-white text-gray-800 border border-blue-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            />
          ) : msg.role === "user" ? (
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

        {/* 编辑状态下的操作按钮 */}
        {isEditing && (
          <div className="flex items-center gap-1.5 mt-1">
            <button
              onClick={handleSaveEdit}
              className="px-2 py-0.5 bg-blue-600 text-white text-[10px] rounded hover:bg-blue-700 transition-colors"
            >
              保存
            </button>
            <button
              onClick={handleCancelEdit}
              className="px-2 py-0.5 bg-gray-200 text-gray-600 text-[10px] rounded hover:bg-gray-300 transition-colors"
            >
              取消
            </button>
            <span className="text-[10px] text-gray-400">Enter 保存 / Esc 取消</span>
          </div>
        )}

        {/* 消息元信息 */}
        {!isEditing && (
          <div className={`flex items-center gap-2 mt-0.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <span className="text-[10px] text-gray-400">{formatTime(msg.timestamp)}</span>
            <button
              onClick={() => copyMessage(msg.content)}
              className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-gray-600"
              title="复制"
            >
              📋
            </button>

            {/* 重新生成按钮 - 最后一条助手消息 */}
            {msg.role === "assistant" && isLast && !isStreaming && onRegenerate && (
              <button
                onClick={onRegenerate}
                className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-blue-600"
                title="重新生成"
              >
                🔄 重新生成
              </button>
            )}

            {/* 编辑按钮 - 用户消息 */}
            {msg.role === "user" && onEdit && !isStreaming && (
              <button
                onClick={() => {
                  setEditContent(msg.content);
                  setIsEditing(true);
                }}
                className="text-[10px] text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity hover:text-gray-600"
                title="编辑"
              >
                ✏️
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
