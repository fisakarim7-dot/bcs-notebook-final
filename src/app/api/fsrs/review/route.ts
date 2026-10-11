import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fsrsSchedule, newFsrsCard, ratingFromLabel, type FsrsCard } from "@/lib/bcs-fsrs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rowToCard(row: {
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: string;
  lastReview: Date | null;
  due: Date;
}): FsrsCard {
  return {
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsedDays,
    scheduledDays: row.scheduledDays,
    reps: row.reps,
    lapses: row.lapses,
    state: (row.state as FsrsCard["state"]) || "new",
    lastReview: row.lastReview,
    due: row.due,
  };
}

// POST /api/fsrs/review { id, rating: again|hard|good|easy }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { id?: string; rating?: string };
    const id = typeof body.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "id দরকার" }, { status: 400 });
    const card = await db.flashcard.findUnique({ where: { id } });
    if (!card) return NextResponse.json({ error: "কার্ড পাওয়া যায়নি" }, { status: 404 });

    const rating = ratingFromLabel(body.rating ?? "good");
    const prev = await db.fsrsState.findUnique({ where: { flashcardId: id } });
    const next = fsrsSchedule(prev ? rowToCard(prev) : newFsrsCard(), rating);
    const now = new Date();

    await db.fsrsState.upsert({
      where: { flashcardId: id },
      create: {
        flashcardId: id,
        stability: next.stability,
        difficulty: next.difficulty,
        elapsedDays: next.elapsedDays,
        scheduledDays: next.scheduledDays,
        reps: next.reps,
        lapses: next.lapses,
        state: next.state,
        lastReview: next.lastReview,
        due: next.due,
      },
      update: {
        stability: next.stability,
        difficulty: next.difficulty,
        elapsedDays: next.elapsedDays,
        scheduledDays: next.scheduledDays,
        reps: next.reps,
        lapses: next.lapses,
        state: next.state,
        lastReview: next.lastReview,
        due: next.due,
      },
    });

    // Mirror dueDate so existing "today's due" badges keep working; Leitner box stays.
    const updated = await db.flashcard.update({
      where: { id },
      data: {
        dueDate: next.due,
        lastResult: rating === 1 ? "wrong" : "correct",
        lastReviewedAt: now,
        reviewCount: { increment: 1 },
        ...(rating === 1 ? { wrongCount: { increment: 1 } } : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      nextDays: Math.max(0, Math.round(next.scheduledDays)),
      fsrs: {
        stability: next.stability,
        difficulty: next.difficulty,
        state: next.state,
        due: next.due.toISOString(),
      },
      card: {
        id: updated.id,
        dueDate: updated.dueDate.toISOString(),
        box: updated.box,
      },
    });
  } catch (error) {
    console.error("POST /api/fsrs/review", error);
    return NextResponse.json({ error: "FSRS রিভিউ সেভ হয়নি" }, { status: 500 });
  }
}
