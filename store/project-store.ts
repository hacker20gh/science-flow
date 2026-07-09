/**
 * 项目状态管理（Zustand）
 *
 * 管理当前项目的文献、提取结果、机制矩阵、时间线等状态
 */

import { create } from "zustand";
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
  // 文献
  papers: StoredPaper[];

  // 机制矩阵
  matrix: MatrixData | null;

  // 时间线
  timeline: TimelineEvent[];

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

export const useProjectStore = create<ProjectState>((set, get) => ({
  papers: [],
  matrix: null,
  timeline: [],

  // ===== 文献操作 =====

  addPapers: (newPapers) => {
    set((state) => {
      const existingIds = new Set(state.papers.map((p) => p.paperId));
      const unique = newPapers.filter((p) => !existingIds.has(p.paperId));
      return { papers: [...state.papers, ...unique] };
    });

    // 自动记录时间线事件
    get().addEvent(
      "literature_search",
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
        "literature_extract",
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
    const { papers } = get();
    const extracted = papers.filter(
      (p) => p.extractionStatus === "done" && p.experiments.length > 0
    );

    if (extracted.length === 0) {
      set({ matrix: null });
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
}));
