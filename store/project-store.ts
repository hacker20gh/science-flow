/**
 * 项目状态管理（Zustand）
 *
 * 管理当前项目的文献、提取结果、机制矩阵等状态
 * 等 Supabase 接入后，这个 store 会变成后端数据的客户端缓存
 */

import { create } from "zustand";
import type { ExperimentResult } from "@/lib/llm/extraction";
import type { MatrixData } from "@/lib/matrix/generator";
import { generateMatrix } from "@/lib/matrix/generator";

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
  // 提取状态
  extractionStatus: "pending" | "extracting" | "done" | "error";
  experiments: ExperimentResult[];
  extractionError?: string;
}

interface ProjectState {
  // 文献
  papers: StoredPaper[];

  // 机制矩阵（自动从 papers 计算）
  matrix: MatrixData | null;

  // Actions
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
  getConfirmedPapers: () => StoredPaper[];
}

// ===== Store =====

export const useProjectStore = create<ProjectState>((set, get) => ({
  papers: [],
  matrix: null,

  addPapers: (newPapers) => {
    set((state) => {
      // 去重：按 paperId
      const existingIds = new Set(state.papers.map((p) => p.paperId));
      const unique = newPapers.filter((p) => !existingIds.has(p.paperId));
      return { papers: [...state.papers, ...unique] };
    });
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

    // 每次提取完成，自动刷新矩阵
    if (status === "done") {
      setTimeout(() => get().refreshMatrix(), 100);
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

  getConfirmedPapers: () => {
    return get().papers.filter((p) => p.extractionStatus === "done");
  },
}));
