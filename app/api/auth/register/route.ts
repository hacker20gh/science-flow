import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return Response.json({ error: "邮箱和密码必填" }, { status: 400 });
  }

  if (password.length < 6) {
    return Response.json({ error: "密码至少 6 位" }, { status: 400 });
  }

  // 数据库未配置时返回成功（demo 模式）
  if (!process.env.DATABASE_URL) {
    return Response.json({ ok: true });
  }

  try {
    // 检查邮箱是否已注册
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return Response.json({ error: "该邮箱已注册" }, { status: 409 });
    }

    // 创建用户（生产环境应使用 bcrypt 哈希密码）
    await prisma.user.create({
      data: {
        email,
        name: email.split("@")[0],
      },
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Register error:", error);
    return Response.json({ error: "注册失败" }, { status: 500 });
  }
}
