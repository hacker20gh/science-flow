/**
 * Prisma 数据库客户端
 *
 * Prisma 7 + PrismaPg adapter 连接 Supabase PostgreSQL
 * 完全懒加载，避免浏览器端导入 node:path 报错
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _prisma: any = null;

export function getPrisma() {
  if (_prisma) return _prisma;
  if (!process.env.DATABASE_URL) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require("@prisma/client");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaPg } = require("@prisma/adapter-pg");

    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
    _prisma = new PrismaClient({ adapter });
    return _prisma;
  } catch (error) {
    console.error("Failed to create Prisma client:", error);
    return null;
  }
}

// 为了兼容所有 API 路由中直接使用 prisma.xxx 的写法
export const prisma = {
  get user() { return getPrisma()?.user; },
  get project() { return getPrisma()?.project; },
  get paper() { return getPrisma()?.paper; },
  get extraction() { return getPrisma()?.extraction; },
  get hypothesis() { return getPrisma()?.hypothesis; },
  get experiment() { return getPrisma()?.experiment; },
  get timelineEvent() { return getPrisma()?.timelineEvent; },
  get manuscript() { return getPrisma()?.manuscript; },
};
