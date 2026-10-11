import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { FlashcardDTO } from "@/lib/bcs-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toCardDTO(c: {
  id: string;
  nodeId: string | null;
  nodePath: string | null;
  studyNodeId: string | null;
  studyNodePath: string | null;
  front: string;
  back: string;
  explanation: string;
  explanationHtml: string;
  favorite: boolean;
  readLater: boolean;
  box: number;
  dueDate: Date;
  lastResult: string | null;
  lastReviewedAt: Date | null;
  reviewCount: number;
  wrongCount: number;
  suspended: boolean;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}): FlashcardDTO {
  return {
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
    cardType: (c as { cardType?: string }).cardType || "basic",
    clozeText: (c as { clozeText?: string }).clozeText || "",
    occlusionJson: (c as { occlusionJson?: string }).occlusionJson || "",
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

// GET /api/flashcards            → all cards (bank)
// GET /api/flashcards?mode=due   → today's due queue (suspended excluded)
export async function GET(req: Request) {
  try {
    const mode = new URL(req.url).searchParams.get("mode");
    if (mode === "due") {
      const cards = await db.flashcard.findMany({
        where: { suspended: false, dueDate: { lte: endOfToday() } },
        orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }],
      });
      return NextResponse.json({
        cards: cards.map(toCardDTO),
        count: cards.length,
      });
    }
    const cards = await db.flashcard.findMany({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({
      cards: cards.map(toCardDTO),
      count: cards.length,
    });
  } catch (error) {
    console.error("GET /api/flashcards error:", error);
    return NextResponse.json({ error: "ফ্ল্যাশকার্ড লোড করা যায়নি" }, { status: 500 });
  }
}

// POST /api/flashcards — create one card
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      front?: string;
      back?: string;
      explanation?: string;
      explanationHtml?: string;
      nodeId?: string | null;
      nodePath?: string | null;
      studyNodeId?: string | null;
      studyNodePath?: string | null;
      source?: string;
      cardType?: string;
      clozeText?: string;
      occlusionJson?: string;
    };
    const front = (body.front ?? "").trim();
    const isCloze = body.cardType === "cloze";
    const back = (body.back ?? "").trim() || (isCloze ? front : "");
    if (!front || !back) {
      return NextResponse.json(
        { error: "সামনের ও পেছনের লেখা দুটোই দরকার" },
        { status: 400 }
      );
    }
    if (front.length > 600 || back.length > 4000) {
      return NextResponse.json({ error: "লেখা অত্যধিক বড়" }, { status: 400 });
    }
    const card = await db.flashcard.create({
      data: {
        front,
        back,
        explanation: (body.explanation ?? "").slice(0, 8000),
        explanationHtml: (body.explanationHtml ?? "").slice(0, 200_000),
        nodeId: body.nodeId || null,
        nodePath: body.nodePath || null,
        studyNodeId: body.studyNodeId || null,
        studyNodePath: body.studyNodePath || null,
        source: body.source === "ai" ? "ai" : "manual",
        cardType: ["cloze", "occlusion"].includes(body.cardType ?? "") ? body.cardType! : "basic",
        clozeText: (body.clozeText ?? "").slice(0, 8000),
        occlusionJson: (body.occlusionJson ?? "").slice(0, 50_000),
      },
    });
    return NextResponse.json({ card: toCardDTO(card) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/flashcards error:", error);
    return NextResponse.json({ error: "ফ্ল্যাশকার্ড তৈরি করা যায়নি" }, { status: 500 });
  }
}
