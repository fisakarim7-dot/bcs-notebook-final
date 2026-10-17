import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { moveToTrash, type TrashFlashcardRow } from "@/lib/bcs-trash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/flashcards/[id] — edit content, flags or suspend
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      front?: string;
      back?: string;
      explanation?: string;
      explanationHtml?: string;
      favorite?: boolean;
      readLater?: boolean;
      suspended?: boolean;
      studyNodeId?: string | null;
      studyNodePath?: string | null;
      cardType?: string;
      clozeText?: string;
      occlusionJson?: string;
    };
    const data: {
      front?: string;
      back?: string;
      explanation?: string;
      explanationHtml?: string;
      favorite?: boolean;
      readLater?: boolean;
      suspended?: boolean;
      studyNodeId?: string | null;
      studyNodePath?: string | null;
      cardType?: string;
      clozeText?: string;
      occlusionJson?: string;
    } = {};
    if (body.front !== undefined) {
      const front = body.front.trim();
      if (!front) return NextResponse.json({ error: "সামনের লেখা খালি রাখা যাবে না" }, { status: 400 });
      data.front = front;
    }
    if (body.back !== undefined) {
      const back = body.back.trim();
      if (!back) return NextResponse.json({ error: "পেছনের লেখা খালি রাখা যাবে না" }, { status: 400 });
      data.back = back;
    }
    if (body.explanation !== undefined) data.explanation = body.explanation.slice(0, 8000);
    if (body.explanationHtml !== undefined) data.explanationHtml = body.explanationHtml.slice(0, 200_000);
    if (body.favorite !== undefined) data.favorite = !!body.favorite;
    if (body.readLater !== undefined) data.readLater = !!body.readLater;
    if (body.suspended !== undefined) data.suspended = !!body.suspended;
    if (body.studyNodeId !== undefined) data.studyNodeId = body.studyNodeId || null;
    if (body.studyNodePath !== undefined) data.studyNodePath = body.studyNodePath || null;
    if (body.cardType !== undefined) {
      data.cardType = ["cloze", "occlusion"].includes(body.cardType) ? body.cardType : "basic";
    }
    if (body.clozeText !== undefined) data.clozeText = body.clozeText.slice(0, 8000);
    if (body.occlusionJson !== undefined) data.occlusionJson = body.occlusionJson.slice(0, 50_000);

    const card = await db.flashcard.update({ where: { id }, data });
    return NextResponse.json({ ok: true, id: card.id });
  } catch (error) {
    console.error("PATCH /api/flashcards/[id] error:", error);
    return NextResponse.json({ error: "ফ্ল্যাশকার্ড আপডেট করা যায়নি" }, { status: 500 });
  }
}

// DELETE /api/flashcards/[id] — Safe Delete (#21): snapshot → Trash, then remove
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const c = await db.flashcard.findUnique({ where: { id } });
    if (!c) {
      return NextResponse.json({ error: "কার্ড খুঁজে পাওয়া যায়নি" }, { status: 404 });
    }
    const row: TrashFlashcardRow = {
      id: c.id,
      nodeId: c.nodeId,
      nodePath: c.nodePath,
      studyNodeId: c.studyNodeId,
      studyNodePath: c.studyNodePath,
      front: c.front,
      back: c.back,
      explanation: c.explanation,
      explanationHtml: c.explanationHtml,
      favorite: c.favorite,
      readLater: c.readLater,
      box: c.box,
      dueDate: c.dueDate.toISOString(),
      lastResult: c.lastResult,
      lastReviewedAt: c.lastReviewedAt ? c.lastReviewedAt.toISOString() : null,
      reviewCount: c.reviewCount,
      wrongCount: c.wrongCount,
      suspended: c.suspended,
      source: c.source,
    };
    await moveToTrash({
      kind: "flashcard",
      refId: c.id,
      title: c.front.slice(0, 120),
      path: c.studyNodePath || c.nodePath || "",
      summary: c.studyNodePath || c.nodePath || "ফ্ল্যাশকার্ড",
      payload: { version: 1, kind: "flashcard", flashcard: row },
    });
    await db.flashcard.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/flashcards/[id] error:", error);
    return NextResponse.json({ error: "ফ্ল্যাশকার্ড মুছে ফেলা যায়নি" }, { status: 500 });
  }
}
