import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const { handlers, signIn, signOut, auth } = NextAuth({
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

        // 有数据库时，动态导入 Prisma 查 User 表
        try {
          const { getPrisma } = await import("@/lib/db");
          const prisma = getPrisma();
          if (!prisma) return null;

          const user = await prisma.user.findUnique({
            where: { email: credentials.email as string },
          });

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
