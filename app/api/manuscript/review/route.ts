import { NextRequest } from "next/server";
import { simulateReview } from "@/lib/llm/reviewer";
import { createSSEStream } from "@/lib/llm/streaming";
import { requireAuth } from "@/lib/api-auth";

export async function POST(req: NextRequest) {
  const authResult = await requireAuth();
  if ("error" in authResult) return authResult.error;

  try {
    const body = await req.json();
    const { manuscript, journal } = body;

    if (!manuscript || Object.keys(manuscript).length === 0) {
      return new Response(
        JSON.stringify({ error: "manuscript is required" }),
        { status: 400 }
      );
    }

    return createSSEStream(async (emit) => {
      emit({ type: "progress", step: "正在模拟审稿人审阅...", current: 0, total: 3 });

      const review = await simulateReview({ manuscript, journal }, emit);

      // 逐个审稿人 emit 进度
      if (review.reviewers) {
        for (let i = 0; i < review.reviewers.length; i++) {
          emit({
            type: "progress",
            step: `✓ 审稿人 ${i + 1}（${review.reviewers[i].persona}）审阅完成`,
            current: i + 1,
            total: 3,
          });
        }
      }

      emit({ type: "result", data: review });
    });
  } catch (error) {
    console.error("Review simulation error:", error);
    return new Response(
      JSON.stringify({ error: "Review simulation failed" }),
      { status: 500 }
    );
  }
}
