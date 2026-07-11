interface ChatInputProps {
  input: string;
  isStreaming: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
}

export function ChatInput({ input, isStreaming, onInputChange, onSend, onStop }: ChatInputProps) {
  return (
    <div className="p-3 border-t border-gray-200 bg-white shrink-0">
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!isStreaming) onSend();
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
            onClick={onStop}
            className="px-3 py-2 bg-red-500 text-white rounded-lg text-sm hover:bg-red-600 shrink-0 self-end"
          >
            ⏹
          </button>
        ) : (
          <button
            onClick={onSend}
            disabled={!input.trim()}
            className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed shrink-0 self-end"
          >
            发送
          </button>
        )}
      </div>
    </div>
  );
}
