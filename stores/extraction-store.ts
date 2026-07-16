"use client";

import { create } from "zustand";

export interface ExtractionProgressItem {
  paperId: string;
  title: string;
  status: "pending" | "extracting" | "saving" | "done" | "error";
  step?: string;
  current?: number;
  total?: number;
  error?: string;
  result?: {
    experiments: number;
    conclusions: number;
  };
}

interface ExtractionState {
  // 当前项目的提取进度
  items: ExtractionProgressItem[];
  isExtracting: boolean;

  // 刷新触发器（提取完成后通知其他组件刷新）
  refreshTrigger: number;

  // Actions
  startExtraction: (papers: Array<{ paperId: string; title: string }>) => void;
  updateProgress: (paperId: string, update: Partial<ExtractionProgressItem>) => void;
  markDone: (paperId: string, result: { experiments: number; conclusions: number }) => void;
  markError: (paperId: string, error: string) => void;
  clearCompleted: () => void;
  triggerRefresh: () => void;
}

export const useExtractionStore = create<ExtractionState>((set, get) => ({
  items: [],
  isExtracting: false,
  refreshTrigger: 0,

  startExtraction: (papers) => {
    set({
      isExtracting: true,
      items: papers.map((p) => ({
        paperId: p.paperId,
        title: p.title,
        status: "pending" as const,
      })),
    });
  },

  updateProgress: (paperId, update) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.paperId === paperId ? { ...item, ...update } : item
      ),
    }));
  },

  markDone: (paperId, result) => {
    set((state) => {
      const newItems = state.items.map((item) =>
        item.paperId === paperId
          ? { ...item, status: "done" as const, result }
          : item
      );
      const allDone = newItems.every(
        (item) => item.status === "done" || item.status === "error"
      );
      return {
        items: newItems,
        isExtracting: !allDone,
        refreshTrigger: allDone ? state.refreshTrigger + 1 : state.refreshTrigger,
      };
    });
  },

  markError: (paperId, error) => {
    set((state) => {
      const newItems = state.items.map((item) =>
        item.paperId === paperId
          ? { ...item, status: "error" as const, error }
          : item
      );
      const allDone = newItems.every(
        (item) => item.status === "done" || item.status === "error"
      );
      return {
        items: newItems,
        isExtracting: !allDone,
        refreshTrigger: allDone ? state.refreshTrigger + 1 : state.refreshTrigger,
      };
    });
  },

  clearCompleted: () => {
    set((state) => ({
      items: state.items.filter(
        (item) => item.status !== "done" && item.status !== "error"
      ),
    }));
  },

  triggerRefresh: () => {
    set((state) => ({ refreshTrigger: state.refreshTrigger + 1 }));
  },
}));
