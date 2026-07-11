"use client";

import { useState, useEffect, useRef } from "react";

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
}

interface ConversationManagerProps {
  projectId: string;
  isOpen: boolean;
  activeConversationId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onClose: () => void;
}

export function ConversationManager({
  projectId,
  isOpen,
  activeConversationId,
  onSelect,
  onCreate,
  onClose,
}: ConversationManagerProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Load conversations when opened
  useEffect(() => {
    if (!isOpen || !projectId) return;
    setLoading(true);
    fetch(`/api/projects/${projectId}/conversations`)
      .then((res) => res.json())
      .then((data) => setConversations(data.conversations || []))
      .catch(() => setConversations([]))
      .finally(() => setLoading(false));
  }, [isOpen, projectId]);

  // Focus edit input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose]);

  async function handleRename(id: string) {
    if (!editTitle.trim()) {
      setEditingId(null);
      return;
    }
    try {
      await fetch(`/api/projects/${projectId}/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle.trim() }),
      });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, title: editTitle.trim() } : c))
      );
    } catch {
      // silent
    }
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/projects/${projectId}/conversations/${id}`, {
        method: "DELETE",
      });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      // If the active conversation was deleted, parent will handle via onCreate
      if (id === activeConversationId) {
        onCreate();
      }
    } catch {
      // silent
    }
    setDeletingId(null);
  }

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className="absolute top-full right-0 mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg z-50 flex flex-col max-h-[400px]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-700">对话列表</span>
        <button
          onClick={onCreate}
          className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
        >
          + 新建
        </button>
      </div>

      {/* Conversation list */}
      <div className="overflow-y-auto flex-1">
        {loading && (
          <div className="px-3 py-6 text-center text-xs text-gray-400">加载中...</div>
        )}
        {!loading && conversations.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-gray-400">暂无对话</div>
        )}
        {conversations.map((conv) => (
          <div
            key={conv.id}
            className={`group flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors ${
              conv.id === activeConversationId ? "bg-blue-50 border-l-2 border-blue-500" : ""
            }`}
            onClick={() => {
              if (editingId !== conv.id && deletingId !== conv.id) {
                onSelect(conv.id);
                onClose();
              }
            }}
          >
            {editingId === conv.id ? (
              <input
                ref={editInputRef}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onBlur={() => handleRename(conv.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename(conv.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                className="flex-1 text-xs px-1 py-0.5 border border-blue-300 rounded focus:outline-none"
                onClick={(e) => e.stopPropagation()}
              />
            ) : deletingId === conv.id ? (
              <div className="flex items-center gap-1 flex-1" onClick={(e) => e.stopPropagation()}>
                <span className="text-xs text-red-600 flex-1">确认删除？</span>
                <button
                  onClick={() => handleDelete(conv.id)}
                  className="text-xs px-1.5 py-0.5 bg-red-500 text-white rounded hover:bg-red-600"
                >
                  删除
                </button>
                <button
                  onClick={() => setDeletingId(null)}
                  className="text-xs px-1.5 py-0.5 text-gray-500 hover:text-gray-700"
                >
                  取消
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-800 truncate">{conv.title}</p>
                  {conv._count && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {conv._count.messages} 条消息
                    </p>
                  )}
                </div>
                {/* Action buttons - visible on hover */}
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingId(conv.id);
                      setEditTitle(conv.title);
                    }}
                    className="p-1 text-gray-400 hover:text-blue-600 text-[10px]"
                    title="重命名"
                  >
                    ✏
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingId(conv.id);
                    }}
                    className="p-1 text-gray-400 hover:text-red-600 text-[10px]"
                    title="删除"
                  >
                    🗑
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
