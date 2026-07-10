import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return Response.json({ error: "邮箱和密码必填" }, { status: 400 });
    }

    if (password.length < 6) {
      return Response.json({ error: "密码至少 6 位" }, { status: 400 });
    }

    if (!process.env.DATABASE_URL || !prisma) {
      return Response.json({ error: "数据库未配置" }, { status: 503 });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return Response.json({ error: "该邮箱已注册" }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    await prisma.user.create({
      data: {
        email,
        name: email.split("@")[0],
        password: hashedPassword,
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Register error:", error);
    return Response.json({ error: "注册失败" }, { status: 500 });
  }
}
