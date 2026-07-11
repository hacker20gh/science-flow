/**
 * 数据库访问层 — Edge Runtime 安全版本
 *
 * 此文件不 import 任何 Node.js 专属模块
 * middleware 和 auth.ts 通过此文件访问数据库
 * API Routes 直接使用 lib/db-server.ts
 */

import type { PrismaClient } from "@prisma/client";

let _prisma: PrismaClient | null = null;
let _loading: Promise<PrismaClient | null> | null = null;

/**
 * 获取 Prisma 客户端（异步，Edge Runtime 兼容）
 * 在 Edge Runtime 中调用会返回 null
 */
export async function getPrisma(): Promise<PrismaClient | null> {
  if (_prisma) return _prisma;
  if (!process.env.DATABASE_URL) return null;

  // 确保只加载一次，并发调用等待同一个 Promise
  if (!_loading) {
    _loading = (async () => {
      try {
        const mod = await import("@/lib/db-server");
        _prisma = mod.prisma;
        return _prisma;
      } catch {
        return null;
      }
    })();
  }

  return _loading;
}
