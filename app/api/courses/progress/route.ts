import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db-server";

// GET /api/courses/progress?courseId=xxx — 获取课程进度
export async function GET(req: NextRequest) {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!prisma) {
    return Response.json({ progress: [] }, { status: 503 });
  }

  const courseId = req.nextUrl.searchParams.get("courseId");

  try {
    const where: { userId: string; courseId?: string } = { userId: session.user.id };
    if (courseId) where.courseId = courseId;

    const progress = await prisma.courseProgress.findMany({
      where,
      orderBy: { completedAt: "desc" },
    });

    return Response.json({ progress });
  } catch (error) {
    console.error("Failed to get course progress:", error);
    return Response.json({ progress: [] }, { status: 500 });
  }
}

// PATCH /api/courses/progress — 更新课程进度
export async function PATCH(req: NextRequest) {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  try {
    const body = await req.json();
    const { courseId, lessonId, status } = body;

    if (!courseId || !lessonId || !status) {
      return Response.json({ error: "courseId, lessonId, status 必填" }, { status: 400 });
    }

    const validStatuses = ["not_started", "in_progress", "completed"];
    if (!validStatuses.includes(status)) {
      return Response.json({ error: `无效状态，可选：${validStatuses.join(", ")}` }, { status: 400 });
    }

    const now = new Date();
    const progress = await prisma.courseProgress.upsert({
      where: {
        userId_courseId_lessonId: {
          userId: session.user.id,
          courseId,
          lessonId,
        },
      },
      update: {
        status,
        ...(status === "in_progress" && { startedAt: now }),
        ...(status === "completed" && { completedAt: now }),
        ...(status === "not_started" && { startedAt: null, completedAt: null }),
      },
      create: {
        userId: session.user.id,
        courseId,
        lessonId,
        status,
        ...(status === "in_progress" && { startedAt: now }),
        ...(status === "completed" && { completedAt: now }),
      },
    });

    return Response.json({ progress });
  } catch (error) {
    console.error("Failed to update course progress:", error);
    return Response.json({ error: "更新进度失败" }, { status: 500 });
  }
}
