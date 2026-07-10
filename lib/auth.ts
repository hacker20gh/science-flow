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

        // 有数据库时，尝试查 User 表
        if (process.env.DATABASE_URL) {
          try {
            const { getPrisma } = await import("@/lib/db");
            const prisma = getPrisma();
            if (prisma) {
              const user = await prisma.user.findUnique({
                where: { email: credentials.email as string },
              });
              if (user) {
                return { id: user.id, email: user.email, name: user.name };
              }
            }
          } catch {
            // 数据库连接失败，fallback 到 demo 账号
          }
        }

        // Demo 账号（无需数据库）
        if (
          credentials.email === "demo@sciflow.ai" &&
          credentials.password === "demo123"
        ) {
          return { id: "demo-user", email: "demo@sciflow.ai", name: "演示用户" };
        }

        return null;
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
