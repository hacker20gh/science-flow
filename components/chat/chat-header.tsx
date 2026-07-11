import { type Message, exportChat } from "@/lib/chat/chat-utils";

interface ChatHeaderProps {
  messageCount: number;
  showSearch: boolean;
  isFullscreen: boolean;
  projectName?: string;
  messages: Message[];
  onToggleSearch: () => void;
  onExport: () => void;
  onClear: () => void;
  onToggleFullscreen: () => void;
  onClose: () => void;
}

export function ChatHeader({
  messageCount,
  showSearch,
  isFullscreen,
  projectName,
  messages,
  onToggleSearch,
  onExport,
  onClear,
  onToggleFullscreen,
  onClose,
}: ChatHeaderProps) {
  const userMsgCount = messages.filter((m) => m.role === "user").length;

  return (
    <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between bg-white shrink-0">
      <div className="flex items-center gap-2">
        <span className="text-base">🤖</span>
        <span className="text-sm font-semibold text-gray-800">AI 助手</span>
        {messageCount > 0 && (
          <span className="text-xs text-gray-400">({userMsgCount} 轮)</span>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        {/* 搜索 */}
        <button
          onClick={onToggleSearch}
          className={`p-1.5 text-xs rounded ${showSearch ? "text-blue-600 bg-blue-50" : "text-gray-400 hover:text-gray-600"}`}
          title="搜索消息"
        >
          🔍
        </button>
        {/* 导出 */}
        {messageCount > 0 && (
          <button
            onClick={onExport}
            className="p-1.5 text-gray-400 hover:text-gray-600 text-xs"
            title="导出对话"
          >
            📥
          </button>
        )}
        {/* 清空 */}
        {messageCount > 0 && (
          <button onClick={onClear} className="p-1.5 text-gray-400 hover:text-gray-600 text-xs" title="清空对话">
            🗑
          </button>
        )}
        {/* 全屏 */}
        <button
          onClick={onToggleFullscreen}
          className="p-1.5 text-gray-400 hover:text-gray-600 text-xs"
          title={isFullscreen ? "退出全屏" : "全屏"}
        >
          {isFullscreen ? "🗗" : "🗖"}
        </button>
        {/* 关闭 */}
        <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 text-xs">
          ✕
        </button>
      </div>
    </div>
  );
}
