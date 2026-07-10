/**
 * Prisma 数据库客户端
 *
 * 完全懒加载，避免 Edge Runtime / 浏览器端报错
 * 只在 Node.js 服务端 API Routes 中使用
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _prisma: any = null;

export function getPrisma() {
  if (_prisma) return _prisma;
  if (!process.env.DATABASE_URL) return null;

  // 只在 Node.js 环境中运行（非 Edge Runtime、非浏览器）
  if (typeof globalThis.process === "undefined" || !globalThis.process.versions?.node) {
    return null;
  }

  try {
    // 使用 eval 避免打包工具在编译时解析这个路径
    // eslint-disable-next-line no-eval
    const mod = eval('require("@prisma/client")');
    const { PrismaClient } = mod;
    // eslint-disable-next-line no-eval
    const adapterMod = eval('require("@prisma/adapter-pg")');
    const { PrismaPg } = adapterMod;

    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    _prisma = new PrismaClient({ adapter });
    return _prisma;
  } catch (error) {
    console.error("Failed to create Prisma client:", error);
    return null;
  }
}

// 兼容导出
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma: any = new Proxy({} as Record<string, unknown>, {
  get(_target, prop) {
    const instance = getPrisma();
    if (!instance || typeof prop !== "string") return undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (instance as any)[prop];
  },
});
