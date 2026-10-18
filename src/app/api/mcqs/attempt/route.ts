import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ResultItem {
  id: string;
  chosen: number | null; // null = skipped / unanswered
  correct: boolean;
  skipped?: boolean;
}

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

// POST /api/mcqs/attempt — finish a practice/wrongbook/mock run.
// Body: { mode, seconds, results: [{ id, chosen, correct, skipped? }] }
// Updates per-question stats + wrong book, then stores one QuizAttempt row.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      mode?: string;
      seconds?: number;
      results?: ResultItem[];
      config?: unknown; // Mock Test Engine (#18) config snapshot
    };
    const mode = ["practice", "wrongbook", "mock"].includes(body.mode ?? "")
      ? (body.mode as string)
      : "practice";
    const results = Array.isArray(body.results) ? body.results.slice(0, 400) : [];
    if (results.length === 0) {
      return NextResponse.json({ error: "কোনো ফলাফল পাওয়া যায়নি" }, { status: 400 });
    }
    const seconds = Math.max(0, Math.round(Number(body.seconds) || 0));

    let correct = 0;
    let wrong = 0;
    let skipped = 0;
    const now = new Date();

    for (const r of results) {
      if (!r || typeof r.id !== "string") continue;
      if (r.skipped || r.chosen === null || r.chosen === undefined) {
        skipped += 1;
        await db.mcq.update({
          where: { id: r.id },
          data: { lastResult: "skipped", lastAttemptAt: now },
        }).catch(() => undefined); // question may have been deleted mid-run
        continue;
      }
      if (r.correct) {
        correct += 1;
        await db.mcq.update({
          where: { id: r.id },
          data: {
            attempts: { increment: 1 },
            correctCount: { increment: 1 },
            lastResult: "correct",
            lastAttemptAt: now,
            inWrongBook: false,
          },
        }).catch(() => undefined);
      } else {
        wrong += 1;
        await db.mcq.update({
          where: { id: r.id },
          data: {
            attempts: { increment: 1 },
            wrongCount: { increment: 1 },
            lastResult: "wrong",
            lastAttemptAt: now,
            inWrongBook: true,
          },
        }).catch(() => undefined);
      }
    }

    const total = correct + wrong + skipped;
    const score = Math.round((correct - 0.25 * wrong) * 100) / 100;

    // Mock Test Engine (#18): persist a small config snapshot for history labels
    let configJson = "{}";
    if (body.config && typeof body.config === "object") {
      try {
        const c = body.config as Record<string, unknown>;
        const slim: Record<string, string | boolean> = {};
        if (typeof c.subject === "string" && c.subject) slim.subject = c.subject.slice(0, 80);
        if (typeof c.topic === "string" && c.topic) slim.topic = c.topic.slice(0, 80);
        if (typeof c.difficulty === "string" && c.difficulty) slim.difficulty = c.difficulty.slice(0, 16);
        if (typeof c.previousOnly === "boolean") slim.previousOnly = c.previousOnly;
        if (typeof c.random === "boolean") slim.random = c.random;
        configJson = JSON.stringify(slim).slice(0, 2000);
      } catch {
        configJson = "{}";
      }
    }

    const attempt = await db.quizAttempt.create({
      data: { mode, total, correct, wrong, skipped, score, seconds, config: configJson },
    });

    return NextResponse.json({
      ok: true,
      attempt: {
        id: attempt.id,
        mode: attempt.mode,
        total: attempt.total,
        correct: attempt.correct,
        wrong: attempt.wrong,
        skipped: attempt.skipped,
        score: attempt.score,
        seconds: attempt.seconds,
        config: safeParseConfig(attempt.config),
        createdAt: attempt.createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("POST /api/mcqs/attempt error:", error);
    return NextResponse.json({ error: "ফলাফল সংরক্ষণ করা যায়নি" }, { status: 500 });
  }
}
