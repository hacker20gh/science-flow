import { type Message, type ProjectContext } from "@/lib/chat/chat-utils";
import { MessageBubble } from "./message-bubble";
import { QuickQuestions } from "./quick-questions";

interface MessageListProps {
  messages: Message[];
  filteredMessages: Message[];
  searchQuery: string;
  isStreaming: boolean;
  isLoadingHistory: boolean;
  toolStatus: string | null;
  projectContext?: ProjectContext;
  messagesContainerRef: React.RefObject<HTMLDivElement | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  showScrollBtn: boolean;
  onScroll: () => void;
  onScrollToBottom: () => void;
  onSendMessage: (text: string) => void;
}

export function MessageList({
  messages,
  filteredMessages,
  searchQuery,
  isStreaming,
  isLoadingHistory,
  toolStatus,
  projectContext,
  messagesContainerRef,
  messagesEndRef,
  showScrollBtn,
  onScroll,
  onScrollToBottom,
  onSendMessage,
}: MessageListProps) {
  const displayMessages = searchQuery ? filteredMessages : messages;

  return (
    <>
      <div
        ref={messagesContainerRef}
        onScroll={onScroll}
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
          <QuickQuestions projectContext={projectContext} onSelect={onSendMessage} />
        )}

        {/* 消息列表 */}
        {displayMessages.map((msg, i) => (
          <MessageBubble
            key={i}
            message={msg}
            index={i}
            isLast={i === messages.length - 1}
            isStreaming={isStreaming}
            searchQuery={searchQuery}
          />
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
            onClick={onScrollToBottom}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded-full text-xs text-gray-600 shadow-md hover:shadow-lg transition-shadow"
          >
            ↓ 回到最新
          </button>
        </div>
      )}
    </>
  );
}
