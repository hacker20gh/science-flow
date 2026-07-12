import { NextResponse } from "next/server";
import { prisma } from "@/lib/db-server";

export async function GET() {
  try {
    if (!prisma) {
      return NextResponse.json(
        {
          status: "unhealthy",
          timestamp: new Date().toISOString(),
          error: "Database not configured",
          services: {
            database: "not_configured",
            application: "running",
          },
        },
        { status: 503 }
      );
    }

    // 检查数据库连接
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        status: "healthy",
        timestamp: new Date().toISOString(),
        services: {
          database: "connected",
          application: "running",
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : "Unknown error",
        services: {
          database: "disconnected",
          application: "running",
        },
      },
      { status: 503 }
    );
  }
}
