/**
 * Langfuse Traces API 代理
 *
 * 前端调用此路由获取 Langfuse trace 数据，避免 CORS + 隐藏 API keys。
 * 内存缓存 30 秒，避免每次请求都打 Langfuse Cloud（国内访问延迟高）。
 * 降级保护：LANGFUSE 未配置时返回空数据。
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";

const LANGFUSE_HOST = process.env.LANGFUSE_HOST || "https://cloud.langfuse.com";
const LANGFUSE_PUBLIC_KEY = process.env.LANGFUSE_PUBLIC_KEY;
const LANGFUSE_SECRET_KEY = process.env.LANGFUSE_SECRET_KEY;

// ===== 服务端内存缓存（30 秒 TTL） =====
interface CacheEntry {
  data: unknown;
  cachedAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 30_000; // 30 秒

function getCached(key: string): unknown | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.cachedAt < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, cachedAt: Date.now() });
  // 防止内存泄漏：最多缓存 50 条
  if (cache.size > 50) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

function getAuthHeader(): string {
  return "Basic " + Buffer.from(`${LANGFUSE_PUBLIC_KEY}:${LANGFUSE_SECRET_KEY}`).toString("base64");
}

async function langfuseFetch(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000); // 8 秒超时
  try {
    const resp = await fetch(`${LANGFUSE_HOST}${path}`, {
      headers: { Authorization: getAuthHeader() },
      signal: controller.signal,
    });
    if (!resp.ok) throw new Error(`Langfuse API ${resp.status}: ${resp.statusText}`);
    return resp.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function langfuseFetchCached(path: string): Promise<unknown> {
  const cached = getCached(path);
  if (cached) return cached;
  const data = await langfuseFetch(path);
  setCache(path, data);
  return data;
}

/**
 * GET /api/langfuse/traces
 * ?limit=20         → 返回最近 N 条 traces
 * ?traceId=xxx      → 返回指定 trace 的 observations（generations）
 */
export async function GET(request: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;

  // 降级：未配置时返回空
  if (!LANGFUSE_PUBLIC_KEY || !LANGFUSE_SECRET_KEY) {
    return NextResponse.json({ traces: [], observations: [], enabled: false });
  }

  const { searchParams } = new URL(request.url);
  const traceId = searchParams.get("traceId");
  const limit = searchParams.get("limit") || "20";

  try {
    if (traceId) {
      const data = await langfuseFetchCached(`/api/public/observations?traceId=${traceId}`) as { data?: unknown[] };
      return NextResponse.json({ observations: data.data || [], enabled: true });
    }

    const data = await langfuseFetchCached(`/api/public/traces?limit=${limit}&orderBy=timestamp.desc`) as { data?: unknown[] };
    return NextResponse.json({ traces: data.data || [], enabled: true });
  } catch (err) {
    console.error("[langfuse-api] Error:", (err as Error)?.message);
    return NextResponse.json({ traces: [], observations: [], enabled: true, error: (err as Error)?.message });
  }
}
