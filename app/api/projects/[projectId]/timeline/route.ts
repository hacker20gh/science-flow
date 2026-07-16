import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";
import { requireAuth, requireProjectAccess } from "@/lib/api-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;
  if (!prisma) {
    return Response.json({ error: "数据库未配置", events: [] }, { status: 503 });
  }

  const { projectId } = await params;
  const accessResult = await requireProjectAccess(projectId, authResult.userId);
  if ("error" in accessResult) return accessResult.error;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(10, parseInt(searchParams.get("pageSize") || "50")));
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const search = searchParams.get("search");

  // 构建查询条件
  const where: Record<string, unknown> = { projectId };

  // 时间范围过滤
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as Record<string, Date>).gte = new Date(from);
    if (to) (where.createdAt as Record<string, Date>).lte = new Date(to);
  }

  // 文本搜索（匹配 title）
  if (search) {
    where.title = { contains: search, mode: "insensitive" };
  }

  try {
    const [events, total] = await Promise.all([
      prisma.timelineEvent.findMany({
        where,
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.timelineEvent.count({ where }),
    ]);

    return Response.json({
      events,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error) {
    console.error("Failed to list timeline:", error);
    return Response.json({ error: "获取时间线失败" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;
  if (!prisma) {
    return Response.json({ error: "数据库未配置" }, { status: 503 });
  }

  const { projectId } = await params;
  const accessResult = await requireProjectAccess(projectId, authResult.userId);
  if ("error" in accessResult) return accessResult.error;

  try {
    const body = await req.json();

    if (!body.type || !body.title) {
      return Response.json({ error: "type 和 title 必填" }, { status: 400 });
    }

    const event = await prisma.timelineEvent.create({
      data: {
        projectId,
        type: body.type,
        title: body.title,
        content: body.content || {},
        metadata: body.metadata || null,
        sortOrder: body.sortOrder || 0,
        weekNumber: body.weekNumber || null,
      },
    });

    return Response.json({ event }, { status: 201 });
  } catch (error) {
    console.error("Failed to create timeline event:", error);
    return Response.json({ error: "添加时间线事件失败" }, { status: 500 });
  }
}
