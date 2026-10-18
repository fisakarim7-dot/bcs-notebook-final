import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { McqDTO } from "@/lib/bcs-types";
import { parseTags } from "@/lib/bcs-tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------- Smart Revision (#19): spaced repetition for the MCQ bank ----------
// Every MCQ is implicitly tracked: a question without a McqReview row is
// "new" and therefore due immediately. Feedback schedules the next review:
//   😰 again → level 0, next in 10 minutes (counts as wrong)
//   😕 hard  → level stays, next tomorrow (counts as correct, low confidence)
//   🙂 good  → level+1, INTERVALS[level] days
//   😎 easy  → level+2 (capped), 1.5× INTERVALS[level] days
const INTERVALS_DAYS = [1, 2, 4, 8, 16, 32, 64];
const MAX_LEVEL = INTERVALS_DAYS.length - 1;
const FEEDBACK_SCORE: Record<string, number> = { again: 0, hard: 45, good: 75, easy: 100 };
// due list cap — payload stays sane, the session UI walks the queue
const DUE_CAP = 300;

function toMcqLite(m: {
  id: string;
  nodeId: string | null;
  nodePath: string | null;
  studyNodeId: string | null;
  studyNodePath: string | null;
  question: string;
  options: string;
  correctIndex: number;
  explanation: string;
  explanationHtml: string;
  favorite: boolean;
  readLater: boolean;
  attempts: number;
  correctCount: number;
  wrongCount: number;
  lastResult: string | null;
  lastAttemptAt: Date | null;
  inWrongBook: boolean;
  suspended: boolean;
  source: string;
  tags: string;
  createdAt: Date;
  updatedAt: Date;
}): McqDTO {
  let options: string[] = [];
  try {
    const parsed: unknown = JSON.parse(m.options);
    if (Array.isArray(parsed)) options = parsed.map(String).filter((s) => s.trim().length > 0);
  } catch {
    options = [];
  }
  return {
    id: m.id,
    nodeId: m.nodeId,
    nodePath: m.nodePath,
    studyNodeId: m.studyNodeId,
    studyNodePath: m.studyNodePath,
    question: m.question,
    options,
    correctIndex: m.correctIndex,
    explanation: m.explanation,
    explanationHtml: m.explanationHtml,
    favorite: m.favorite,
    readLater: m.readLater,
    attempts: m.attempts,
    correctCount: m.correctCount,
    wrongCount: m.wrongCount,
    lastResult: m.lastResult,
    lastAttemptAt: m.lastAttemptAt ? m.lastAttemptAt.toISOString() : null,
    inWrongBook: m.inWrongBook,
    suspended: m.suspended,
    source: m.source,
    tags: parseTags(m.tags),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

// GET /api/mcqs/smart-review
// → { due: [{ mcq, review|null }], stats: { due, tracked, untracked, avgConfidence, reviewedToday, total, nextDueAt } }
export async function GET() {
  try {
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const [reviews, totalMcqs, reviewedToday] = await Promise.all([
      db.mcqReview.findMany({
        where: { mcq: { suspended: false } },
        orderBy: { nextReviewAt: "asc" },
      }),
      db.mcq.count({ where: { suspended: false } }),
      db.mcqReview.count({ where: { lastReviewedAt: { gte: todayStart } } }),
    ]);

    // untracked (never reviewed) questions are due first — oldest created first
    const untracked = await db.mcq.findMany({
      where: { suspended: false, review: null },
      orderBy: { createdAt: "asc" },
      take: DUE_CAP,
    });

    // scheduled due (overdue or due now)
    const dueRows = reviews.filter((r) => r.nextReviewAt <= now);
    const dueMcqIds = dueRows.map((r) => r.mcqId);
    const dueMcqs =
      dueMcqIds.length > 0
        ? await db.mcq.findMany({
            where: { id: { in: dueMcqIds }, suspended: false },
            take: DUE_CAP,
          })
        : [];
    const dueMcqMap = new Map(dueMcqs.map((m) => [m.id, m]));

    const dueItems = [
      ...untracked.map((m) => ({ mcq: toMcqLite(m), review: null })),
      ...dueRows
        .filter((r) => dueMcqMap.has(r.mcqId))
        .map((r) => {
          const m = dueMcqMap.get(r.mcqId)!;
          return {
            mcq: toMcqLite(m),
            review: {
              mcqId: r.mcqId,
              lastReviewedAt: r.lastReviewedAt ? r.lastReviewedAt.toISOString() : null,
              nextReviewAt: r.nextReviewAt.toISOString(),
              reviewCount: r.reviewCount,
              confidence: r.confidence,
              level: r.level,
              lapses: r.lapses,
            },
          };
        }),
    ].slice(0, DUE_CAP);

    const tracked = reviews.length;
    const avgConfidence =
      tracked > 0
        ? Math.round(reviews.reduce((s, r) => s + r.confidence, 0) / tracked)
        : 0;
    const nextDue = reviews
      .filter((r) => r.nextReviewAt > now)
      .reduce<string | null>(
        (min, r) =>
          min === null || r.nextReviewAt.toISOString() < min ? r.nextReviewAt.toISOString() : min,
        null
      );

    return NextResponse.json({
      due: dueItems,
      stats: {
        due: untracked.length + dueMcqIds.length,
        tracked,
        untracked: Math.max(0, totalMcqs - tracked),
        avgConfidence,
        reviewedToday,
        total: totalMcqs,
        nextDueAt: nextDue,
      },
    });
  } catch (error) {
    console.error("GET /api/mcqs/smart-review error:", error);
    return NextResponse.json({ error: "স্মার্ট রিভিশন লোড করা যায়নি" }, { status: 500 });
  }
}

// POST /api/mcqs/smart-review — record feedback for one question
// Body: { mcqId, feedback: "again" | "hard" | "good" | "easy" }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { mcqId?: string; feedback?: string };
    const mcqId = typeof body.mcqId === "string" ? body.mcqId : "";
    const feedback = body.feedback ?? "";
    if (!mcqId || !(feedback in FEEDBACK_SCORE)) {
      return NextResponse.json(
        { error: "mcqId ও feedback (again|hard|good|easy) দিন" },
        { status: 400 }
      );
    }
    const mcq = await db.mcq.findUnique({ where: { id: mcqId } });
    if (!mcq) {
      return NextResponse.json({ error: "প্রশ্ন খুঁজে পাওয়া যায়নি" }, { status: 404 });
    }

    const now = new Date();
    const prev = await db.mcqReview.findUnique({ where: { mcqId } });

    let level: number;
    let nextReviewAt: Date;
    let lapses = prev?.lapses ?? 0;

    if (feedback === "again") {
      level = 0;
      lapses += 1;
      nextReviewAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes
    } else if (feedback === "hard") {
      level = prev?.level ?? 0;
      nextReviewAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // tomorrow
    } else if (feedback === "good") {
      level = Math.min((prev?.level ?? 0) + 1, MAX_LEVEL);
      nextReviewAt = new Date(now.getTime() + INTERVALS_DAYS[level] * 24 * 60 * 60 * 1000);
    } else {
      // easy
      level = Math.min((prev?.level ?? 0) + 2, MAX_LEVEL);
      nextReviewAt = new Date(
        now.getTime() + Math.round(INTERVALS_DAYS[level] * 1.5) * 24 * 60 * 60 * 1000
      );
    }

    const reviewCount = (prev?.reviewCount ?? 0) + 1;
    const prevConf = prev?.confidence ?? 0;
    const confidence = Math.round(
      (prevConf * (reviewCount - 1) + FEEDBACK_SCORE[feedback]) / reviewCount
    );

    const review = await db.mcqReview.upsert({
      where: { mcqId },
      create: {
        mcqId,
        lastReviewedAt: now,
        nextReviewAt,
        reviewCount,
        confidence,
        level,
        lapses,
      },
      update: {
        lastReviewedAt: now,
        nextReviewAt,
        reviewCount,
        confidence,
        level,
        lapses,
      },
    });

    // mirror into the question's own stats (integrates with wrong book + accuracy)
    const isWrong = feedback === "again";
    await db.mcq
      .update({
        where: { id: mcqId },
        data: isWrong
          ? {
              attempts: { increment: 1 },
              wrongCount: { increment: 1 },
              lastResult: "wrong",
              lastAttemptAt: now,
              inWrongBook: true,
            }
          : {
              attempts: { increment: 1 },
              correctCount: { increment: 1 },
              lastResult: "correct",
              lastAttemptAt: now,
              inWrongBook: false,
            },
      })
      .catch(() => undefined);

    return NextResponse.json({
      ok: true,
      review: {
        mcqId: review.mcqId,
        lastReviewedAt: review.lastReviewedAt ? review.lastReviewedAt.toISOString() : null,
        nextReviewAt: review.nextReviewAt.toISOString(),
        reviewCount: review.reviewCount,
        confidence: review.confidence,
        level: review.level,
        lapses: review.lapses,
      },
    });
  } catch (error) {
    console.error("POST /api/mcqs/smart-review error:", error);
    return NextResponse.json({ error: "ফিডব্যাক সংরক্ষণ করা যায়নি" }, { status: 500 });
  }
}
