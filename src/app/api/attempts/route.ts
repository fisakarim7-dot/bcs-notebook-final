import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeParseConfig(json: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(json);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

// GET /api/attempts — last 50 finished quiz/mock sessions
export async function GET() {
  try {
    const attempts = await db.quizAttempt.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({
      attempts: attempts.map((a) => ({
        id: a.id,
        mode: a.mode,
        total: a.total,
        correct: a.correct,
        wrong: a.wrong,
        skipped: a.skipped,
        score: a.score,
        seconds: a.seconds,
        config: safeParseConfig(a.config),
        createdAt: a.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("GET /api/attempts error:", error);
    return NextResponse.json({ error: "ইতিহাস লোড করা যায়নি" }, { status: 500 });
  }
}
