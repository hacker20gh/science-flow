/**
 * 项目状态管理（Zustand）
 *
 * 管理当前项目的文献、提取结果、机制矩阵、时间线等状态
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ExperimentResult } from "@/lib/llm/extraction";
import type { MatrixData } from "@/lib/matrix/generator";
import { generateMatrix } from "@/lib/matrix/generator";
import {
  createEvent,
  getDemoEvents,
  type TimelineEvent,
  type TimelineEventType,
} from "@/lib/timeline/events";

// ===== 类型 =====

export interface StoredPaper {
  paperId: string;
  title: string;
  authors: string[];
  journal: string;
  year: number;
  abstract: string;
  doi: string | null;
  pmid: string | null;
  citationCount: number;
  isOpenAccess: boolean;
  oaPdfUrl: string | null;
  articleType: string;
  extractionStatus: "pending" | "extracting" | "done" | "error";
  experiments: ExperimentResult[];
  extractionError?: string;
}

interface ProjectState {
  // 当前项目 ID（由页面挂载时设置，用于 API 调用）
  projectId: string | null;

  // 文献
  papers: StoredPaper[];

  // 机制矩阵
  matrix: MatrixData | null;

  // 时间线
  timeline: TimelineEvent[];

  // Actions — 项目
  loadProject: (projectId: string) => void;

  // Actions — 文献
  addPapers: (papers: StoredPaper[]) => void;
  updatePaperExtraction: (
    paperId: string,
    status: StoredPaper["extractionStatus"],
    experiments?: ExperimentResult[],
    error?: string
  ) => void;
  removePaper: (paperId: string) => void;
  refreshMatrix: () => void;
  getExtractedPapers: () => StoredPaper[];

  // Actions — 时间线
  addEvent: (
    type: TimelineEventType,
    title: string,
    description: string,
    metadata?: Record<string, unknown>
  ) => void;
  loadDemoTimeline: () => void;
}

// ===== Store =====

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      projectId: null,
      papers: [],
      matrix: null,
      timeline: [],

  // ===== 项目操作 =====

  loadProject: (projectId) => {
    set({ projectId });
  },

  // ===== 文献操作 =====

  addPapers: (newPapers) => {
    set((state) => {
      const existingIds = new Set(state.papers.map((p) => p.paperId));
      const unique = newPapers.filter((p) => !existingIds.has(p.paperId));
      return { papers: [...state.papers, ...unique] };
    });

    // 自动记录时间线事件
    get().addEvent(
      "literature",
      `添加了 ${newPapers.length} 篇文献`,
      `搜索并纳入 ${newPapers.length} 篇文献到项目`
    );
  },

  updatePaperExtraction: (paperId, status, experiments, error) => {
    set((state) => ({
      papers: state.papers.map((p) =>
        p.paperId === paperId
          ? {
              ...p,
              extractionStatus: status,
              experiments: experiments || p.experiments,
              extractionError: error,
            }
          : p
      ),
    }));

    if (status === "done") {
      const totalExps = experiments?.length || 0;
      get().addEvent(
        "literature",
        "完成文献信息提取",
        `从 1 篇文献中提取出 ${totalExps} 个实验数据`
      );
      setTimeout(() => {
        get().refreshMatrix();
        get().addEvent(
          "matrix_updated",
          "机制矩阵已更新",
          "新的提取数据已加入机制矩阵"
        );
      }, 100);
    }
  },

  removePaper: (paperId) => {
    set((state) => ({
      papers: state.papers.filter((p) => p.paperId !== paperId),
    }));
    get().refreshMatrix();
  },

  refreshMatrix: () => {
    const { papers, projectId } = get();
    const extracted = papers.filter(
      (p) => p.extractionStatus === "done" && p.experiments.length > 0
    );

    if (extracted.length === 0) {
      set({ matrix: null });
      // 有 projectId 时清空 DB 中的矩阵
      if (projectId) {
        fetch(`/api/projects/${projectId}/matrix`, { method: "DELETE" }).catch(
          (err) => {
            console.error("[ProjectStore] Failed to delete matrix from DB:", err);
          }
        );
      }
      return;
    }

    const matrix = generateMatrix(
      extracted.map((p) => ({
        paperId: p.paperId,
        paperTitle: p.title,
        year: p.year,
        experiments: p.experiments,
      }))
    );

    set({ matrix });

    // fire-and-forget: 持久化到 DB
    if (projectId) {
      fetch(`/api/projects/${projectId}/matrix`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: matrix }),
      }).catch((err) => {
        console.error("[ProjectStore] Failed to persist matrix:", err);
        // Note: cannot use toast here (outside React component). UI layer should handle.
      });
    }
  },

  getExtractedPapers: () => {
    return get().papers.filter(
      (p) => p.extractionStatus === "done" && p.experiments.length > 0
    );
  },

  // ===== 时间线操作 =====

  addEvent: (type, title, description, metadata) => {
    const event = createEvent(type, title, description, metadata);
    set((state) => ({
      timeline: [...state.timeline, event],
    }));
  },

  loadDemoTimeline: () => {
    set({ timeline: getDemoEvents() });
  },
}),
    {
      name: "sciflow-project-store",
      // 只持久化 papers、matrix、timeline，不持久化 projectId（来自 URL）
      partialize: (state) => ({
        papers: state.papers,
        matrix: state.matrix,
        timeline: state.timeline,
      }),
    }
  )
);
