/**
 * Prisma 数据库客户端
 *
 * Prisma 7 + PrismaPg adapter 连接 Supabase PostgreSQL
 * DATABASE_URL 未配置时 prisma 为 null，API 路由返回 503
 */

import { PrismaClient } from "@/app/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient | null {
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

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
