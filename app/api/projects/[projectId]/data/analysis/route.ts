import { NextRequest } from "next/server";
import { prisma } from "@/lib/db-server";
import { requireAuth, requireProjectAccess } from "@/lib/api-auth";

const EXPERIMENT_TYPE = "data_analysis";

/**
 * GET  — return the most recent analysis result for this project
 * POST — save a new analysis result (upserts the experiment + data record)
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;

  if (!prisma) {
    return Response.json({ error: "Database not available" }, { status: 503 });
  }

  const { projectId } = await params;

  const accessResult = await requireProjectAccess(projectId, authResult.userId);
  if ("error" in accessResult) return accessResult.error;

  try {
    // Find the latest ExperimentData.analysis for this project's data_analysis experiments
    const experiment = await prisma.experiment.findFirst({
      where: { projectId, type: EXPERIMENT_TYPE },
      orderBy: { updatedAt: "desc" },
      include: { rawData: { orderBy: { createdAt: "desc" }, take: 1 } },
    });

    const data = experiment?.rawData?.[0];
    if (!data?.analysis) {
      return Response.json({ analysis: null, fileName: null });
    }

    return Response.json({
      analysis: data.analysis,
      fileName: data.fileName,
    });
  } catch (err) {
    console.error("Failed to load analysis:", err);
    return Response.json({ error: "Failed to load analysis" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;

  if (!prisma) {
    return Response.json({ error: "Database not available" }, { status: 503 });
  }

  const { projectId } = await params;

  const accessResult = await requireProjectAccess(projectId, authResult.userId);
  if ("error" in accessResult) return accessResult.error;

  let body: { analysis: unknown; fileName?: string; csvData?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { analysis, fileName, csvData } = body;
  if (!analysis) {
    return Response.json({ error: "analysis is required" }, { status: 400 });
  }

  try {
    // Find or create the sentinel experiment for data analysis
    let experiment = await prisma.experiment.findFirst({
      where: { projectId, type: EXPERIMENT_TYPE },
    });

    if (!experiment) {
      experiment = await prisma.experiment.create({
        data: {
          projectId,
          name: "数据分析",
          type: EXPERIMENT_TYPE,
          status: "completed",
          protocol: {},
          variables: {},
        },
      });
    }

    // Create a new ExperimentData record with the analysis
    await prisma.experimentData.create({
      data: {
        experimentId: experiment.id,
        fileType: "csv",
        fileName: fileName || "analysis",
        fileUrl: "",
        parsedData: csvData ? csvData.slice(0, 10000) : undefined, // store a preview
        analysis: analysis as object,
      },
    });

    // Clean up old records — keep only the 5 most recent per experiment
    const allData = await prisma.experimentData.findMany({
      where: { experimentId: experiment.id },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (allData.length > 5) {
      const toDelete = allData.slice(5);
      await prisma.experimentData.deleteMany({
        where: { id: { in: toDelete.map((d: { id: string }) => d.id) } },
      });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error("Failed to save analysis:", err);
    return Response.json({ error: "Failed to save analysis" }, { status: 500 });
  }
}
