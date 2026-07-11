import posthog from "posthog-js";

/**
 * 识别登录用户（登录成功后调用）
 */
export function identifyUser(userId: string, properties?: Record<string, string>) {
  posthog.identify(userId, properties);
}

/**
 * 重置用户身份（登出时调用）
 */
export function resetUser() {
  posthog.reset();
}

/**
 * 追踪自定义事件
 */
export function trackEvent(eventName: string, properties?: Record<string, unknown>) {
  posthog.capture(eventName, properties);
}

// ---- SciFlow 常用事件封装 ----

export const sciflowEvents = {
  // 文献搜索
  paperSearched: (query: string, source: string) =>
    trackEvent("paper_searched", { query, source }),

  // 文献提取
  paperExtracted: (paperId: string) =>
    trackEvent("paper_extracted", { paper_id: paperId }),

  // 矩阵单元格更新
  matrixCellUpdated: (rowId: string, colId: string) =>
    trackEvent("matrix_cell_updated", { row_id: rowId, col_id: colId }),

  // 实验设计生成
  experimentDesigned: (hypothesisId: string) =>
    trackEvent("experiment_designed", { hypothesis_id: hypothesisId }),

  // 论文导出
  manuscriptExported: (format: string) =>
    trackEvent("manuscript_exported", { format }),

  // AI 对话
  chatMessageSent: () =>
    trackEvent("chat_message_sent"),

  // 知识库文章阅读
  knowledgeArticleRead: (articleId: string) =>
    trackEvent("knowledge_article_read", { article_id: articleId }),
};
