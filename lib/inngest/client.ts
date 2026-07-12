/**
 * Inngest 客户端
 *
 * Durable function 引擎，用于后台长时间运行的任务。
 * 替代 SSE 流式方案：任务在后台运行，用户可以离开页面。
 *
 * 文档：https://www.inngest.com/docs
 */

import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "sciflow-ai",
  name: "SciFlow AI",
});
