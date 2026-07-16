/**
 * Next.js 中间件 — 框架级路由保护
 *
 * 职责：
 * 1. 保护 /dashboard 等需登录的页面路由（未登录 → 重定向到 /login）
 * 2. 拦截对 /api/projects/* 等敏感 API 的未认证请求
 *
 * 注意：
 * - 此中间件是"安全网"，各 API Route 仍需自行调用 requireAuth() 验证
 * - middleware 运行在 Edge Runtime，不使用 Node.js 专属模块
 * - 仅检查 session cookie 是否存在，不验证 JWT 签名（由 API Route 负责）
 */

import { NextRequest, NextResponse } from "next/server";

// 需要登录才能访问的页面路径前缀
const PROTECTED_PAGE_PREFIXES = ["/dashboard", "/project"];

// 需要登录才能访问的 API 路径前缀
const PROTECTED_API_PREFIXES = [
  "/api/projects",
  "/api/settings",
  "/api/zotero",
  "/api/courses",
];

// 完全公开的路径（不需要登录）
const PUBLIC_PATHS = [
  "/login",
  "/signup",
  "/api/auth",
  "/api/health",
  "/api/papers/search",
  "/api/papers/citation-network",
  "/api/crossref",
  "/api/scite",
  "/api/journal-metrics",
  "/knowledge",
  "/courses",
];

/**
 * 检查请求是否携带 NextAuth session cookie
 * NextAuth v5 JWT 模式使用 authjs.session-token 或 __Secure-authjs.session-token
 */
function hasSessionCookie(request: NextRequest): boolean {
  return !!(
    request.cookies.get("authjs.session-token") ||
    request.cookies.get("__Secure-authjs.session-token") ||
    request.cookies.get("next-auth.session-token") ||
    request.cookies.get("__Secure-next-auth.session-token")
  );
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 跳过公开路径和静态资源
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 检查是否是需要保护的路径
  const isProtectedPage = PROTECTED_PAGE_PREFIXES.some((p) =>
    pathname.startsWith(p)
  );
  const isProtectedApi = PROTECTED_API_PREFIXES.some((p) =>
    pathname.startsWith(p)
  );

  if (!isProtectedPage && !isProtectedApi) {
    return NextResponse.next();
  }

  // 检查 session cookie（不验证签名，仅做门禁检查）
  if (!hasSessionCookie(request)) {
    // API 请求返回 401 JSON
    if (isProtectedApi) {
      return NextResponse.json(
        { error: "未登录" },
        { status: 401 }
      );
    }
    // 页面请求重定向到登录页
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 匹配所有路径，除了：
     * - _next/static（静态文件）
     * - _next/image（图片优化）
     * - favicon.ico（网站图标）
     * - 公共文件夹中的静态资源
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
