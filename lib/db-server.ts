/**
 * Prisma 客户端 — 仅在 Node.js API Routes 中使用
 * 不要从 middleware 或 Edge Runtime 文件中 import 此模块
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma: any = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalForPrisma as any).prisma = prisma;
}
