import { NextRequest, NextResponse } from "next/server";
import https from "https";
import http from "http";
import { requireAuth } from "@/lib/api-auth";

// SSRF 防护：禁止内网/本地地址
function isAllowedUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const hostname = url.hostname;
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return false;
    if (hostname.startsWith("10.") || hostname.startsWith("172.") || hostname.startsWith("192.168.")) return false;
    if (hostname.startsWith("169.254.")) return false;
    if (hostname === "0.0.0.0") return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * POST /api/settings/models
 * 获取供应商可用模型列表
 * 使用 Node.js 原生 http/https 模块（避免 Next.js fetch 代理问题）
 */
export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;

  try {
    const body = await req.json();
    const { baseUrl, apiKey } = body;

    if (!baseUrl || !apiKey) {
      return NextResponse.json({ error: "baseUrl and apiKey required" }, { status: 400 });
    }

    if (!isAllowedUrl(baseUrl)) {
      return NextResponse.json({ error: "不允许的地址" }, { status: 400 });
    }

    const modelsUrl = `${baseUrl.replace(/\/+$/, "")}/models`;
    console.log("[Models] Fetching:", modelsUrl);

    const data = await httpGet(modelsUrl, {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    });

    console.log("[Models] Got response, keys:", Object.keys(data));

    // 兼容不同供应商的响应格式
    let models: Array<{ id: string; name?: string }> = [];

    if (Array.isArray(data)) {
      models = data.map((m: { id?: string; name?: string }) => ({
        id: m.id || m.name || "",
        name: m.name,
      }));
    } else if (Array.isArray(data.data)) {
      models = data.data.map((m: { id?: string; name?: string }) => ({
        id: m.id || m.name || "",
        name: m.name,
      }));
    } else if (Array.isArray(data.models)) {
      models = data.models.map((m: { id?: string; name?: string }) => ({
        id: m.id || m.name || "",
        name: m.name,
      }));
    }

    models = models.filter((m) => m.id).sort((a, b) => a.id.localeCompare(b.id));
    console.log("[Models] Returning", models.length, "models");

    return NextResponse.json({ models });
  } catch (error) {
    console.error("[Models] Error:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function httpGet(url: string, headers: Record<string, string>): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const lib = parsedUrl.protocol === "https:" ? https : http;

    const req = lib.get(url, { headers, timeout: 15000 }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
          return;
        }
        try {
          resolve(JSON.parse(data));
        } catch {
          reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.on("timeout", () => { req.destroy(); reject(new Error("Request timeout")); });
  });
}
