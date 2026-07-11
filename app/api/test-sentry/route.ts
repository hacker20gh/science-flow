import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";

export async function GET() {
  Sentry.captureMessage("SciFlow Sentry 测试成功！", "info");
  return NextResponse.json({
    status: "ok",
    message: "Sentry 已配置，检查 Sentry 仪表板查看消息",
  });
}
