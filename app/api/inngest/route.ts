/**
 * Inngest API Route
 *
 * Inngest 通过此端点与 SciFlow 通信。
 * 所有 Inngest function 在服务端注册并执行。
 */

import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { batchExtractFunction } from "@/lib/inngest/functions/batch-extract";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    batchExtractFunction,
  ],
});
