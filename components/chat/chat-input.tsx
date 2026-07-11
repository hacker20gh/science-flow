import { useRef, useState } from "react";
import { toast } from "sonner";

interface ChatInputProps {
  input: string;
  isStreaming: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  attachedFile?: File | null;
  onFileSelect?: (file: File | null) => void;
}

export function ChatInput({ input, isStreaming, onInputChange, onSend, onStop, attachedFile, onFileSelect }: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (file) {
      if (file.type !== "application/pdf") {
        toast.error("只支持 PDF 文件");
        return;
      }
      onFileSelect?.(file);
    }
    // Reset input so re-selecting the same file triggers change
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0] ?? null;
    if (file && file.type === "application/pdf") {
      onFileSelect?.(file);
    } else if (file) {
      toast.error("只支持 PDF 文件");
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
  }

  return (
    <div className="p-3 border-t border-gray-200 bg-white shrink-0">
      {/* 附件预览 */}
      {attachedFile && (
        <div className="flex items-center gap-2 mb-2 px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
          <span>📎</span>
          <span className="truncate flex-1">{attachedFile.name}</span>
          <button
            onClick={() => onFileSelect?.(null)}
            className="text-blue-400 hover:text-blue-600 shrink-0"
            title="移除文件"
          >
            ✕
          </button>
        </div>
      )}

      <div className={`flex gap-2 ${isDragOver ? "opacity-70" : ""}`}>
        {/* 隐藏的文件输入 */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />

        {/* 附件按钮 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-2 py-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors shrink-0 self-end"
          title="上传 PDF"
          disabled={isStreaming}
        >
          📎
        </button>

        <textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (!isStreaming) onSend();
            }
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          placeholder={isStreaming ? "AI 正在回复中..." : "问任何关于你课题的问题... (Enter 发送，Shift+Enter 换行)"}
          disabled={isStreaming}
          rows={1}
          className={`flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400 resize-none min-h-[38px] max-h-[120px] ${
            isDragOver ? "border-blue-400 bg-blue-50" : "border-gray-300"
          }`}
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
