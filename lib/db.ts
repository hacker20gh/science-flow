import { PrismaClient } from "@/app/generated/prisma/client";

/**
 * Prisma 7 需要 adapter 来连接数据库。
 * 在没有配置数据库时，这个模块暂时用 mock 对象。
 * 等 Supabase 配好后替换为真实的 PrismaPg adapter。
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  // TODO: 等 Supabase 配好后启用
  // return new PrismaClient({
  //   adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  // });

  // 临时：返回空对象，避免运行时报错
  return {} as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
