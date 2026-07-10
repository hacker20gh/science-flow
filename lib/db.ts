/**
 * 数据库访问层 — Edge Runtime 安全版本
 *
 * 此文件不 import 任何 Node.js 专属模块
 * middleware 和 auth.ts 通过此文件访问数据库
 * API Routes 直接使用 lib/db-server.ts
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _prisma: any = null;
let _loaded = false;

/**
 * 获取 Prisma 客户端（异步，Edge Runtime 兼容）
 * 在 Edge Runtime 中调用会返回 null
 */
export async function getPrisma() {
  if (_loaded) return _prisma;
  _loaded = true;

  if (!process.env.DATABASE_URL) return null;

  try {
    // 动态 import：Edge Runtime 中会失败并 catch
    const mod = await import("@/lib/db-server");
    _prisma = mod.prisma;
    return _prisma;
  } catch {
    return null;
  }
}
