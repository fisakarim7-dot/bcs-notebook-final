import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { FlashcardDTO } from "@/lib/bcs-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Leitner box 1..5 → review interval in days
const INTERVALS = [1, 2, 4, 8, 16];

// POST /api/flashcards/[id]/review — { result: "correct" | "wrong" }
// correct → box+1, due = now + INTERVALS[newBox] days
// wrong   → box 1, due tomorrow (the UI re-queues it inside the same session)
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { result?: string };
    const result = body.result === "correct" ? "correct" : body.result === "wrong" ? "wrong" : null;
    if (!result) {
      return NextResponse.json({ error: "result হতে হবে correct বা wrong" }, { status: 400 });
    }

    const card = await db.flashcard.findUnique({ where: { id } });
    if (!card) {
      return NextResponse.json({ error: "ফ্ল্যাশকার্ড পাওয়া যায়নি" }, { status: 404 });
    }

    const now = new Date();
    let box = card.box;
    let due: Date;
    if (result === "correct") {
      box = Math.min(5, card.box + 1);
      due = new Date(now.getTime() + INTERVALS[box - 1] * 86_400_000);
    } else {
      box = 1;
      due = new Date(now.getTime() + 86_400_000);
    }

    const updated = await db.flashcard.update({
      where: { id },
      data: {
        box,
        dueDate: due,
        lastResult: result,
        lastReviewedAt: now,
        reviewCount: { increment: 1 },
        ...(result === "wrong" ? { wrongCount: { increment: 1 } } : {}),
      },
    });

    const dto: FlashcardDTO = {
      id: updated.id,
      nodeId: updated.nodeId,
      nodePath: updated.nodePath,
      front: updated.front,
      back: updated.back,
      box: updated.box,
      dueDate: updated.dueDate.toISOString(),
      lastResult: updated.lastResult,
      lastReviewedAt: updated.lastReviewedAt ? updated.lastReviewedAt.toISOString() : null,
      reviewCount: updated.reviewCount,
      wrongCount: updated.wrongCount,
      suspended: updated.suspended,
      source: updated.source,
      studyNodeId: updated.studyNodeId,
      studyNodePath: updated.studyNodePath,
      explanation: updated.explanation,
      explanationHtml: updated.explanationHtml,
      favorite: updated.favorite,
      readLater: updated.readLater,
      cardType: (updated as { cardType?: string }).cardType || "basic",
      clozeText: (updated as { clozeText?: string }).clozeText || "",
      occlusionJson: (updated as { occlusionJson?: string }).occlusionJson || "",
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
    return NextResponse.json({ card: dto, nextDays: INTERVALS[box - 1] });
  } catch (error) {
    console.error("POST /api/flashcards/[id]/review error:", error);
    return NextResponse.json({ error: "রিভিশন সংরক্ষণ করা যায়নি" }, { status: 500 });
  }
}
