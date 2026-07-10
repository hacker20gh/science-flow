/**
 * Prisma 数据库客户端
 *
 * Prisma 7 需要 adapter（如 PrismaPg）来连接数据库。
 * 当前数据库未配置，所有 API 路由返回 503，前端继续使用 Zustand 内存数据。
 * 配好 Supabase 后，安装 @prisma/adapter-pg 并初始化即可。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const prisma: any = null;
