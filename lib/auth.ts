import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: prisma ? PrismaAdapter(prisma) : undefined,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "邮箱", type: "email" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        // 数据库未配置时，使用 demo 账号
        if (!process.env.DATABASE_URL) {
          if (
            credentials.email === "demo@sciflow.ai" &&
            credentials.password === "demo123"
          ) {
            return {
              id: "demo-user",
              email: "demo@sciflow.ai",
              name: "演示用户",
            };
          }
          return null;
        }

        // 有数据库时，查 User 表
        try {
          const user = await prisma.user.findUnique({
            where: { email: credentials.email as string },
          });

          // 简单密码验证（生产环境应使用 bcrypt）
          if (user) {
            return {
              id: user.id,
              email: user.email,
              name: user.name,
            };
          }
          return null;
        } catch {
          return null;
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
