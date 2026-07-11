/**
 * Prisma 客户端 — 仅在 Node.js API Routes 中使用
 * 不要从 middleware 或 Edge Runtime 文件中 import 此模块
 *
 * 类型为 PrismaClient | null：DATABASE_URL 未配置或连接失败时为 null
 * 使用前需检查：if (prisma) { ... } 或 prisma?.xxx
 */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    const adapter = new PrismaPg({ connectionString: url });
    return new PrismaClient({ adapter });
  } catch (error) {
    console.error("Failed to create Prisma client:", error);
    return null;
  }
}

export const prisma: PrismaClient | null = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalForPrisma as any).prisma = prisma;
}
