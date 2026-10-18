import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { moveToTrash, type TrashMcqRow } from "@/lib/bcs-trash";
import { normalizeTags } from "@/lib/bcs-tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/mcqs/[id] — edit / suspend / wrong-book flag
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      question?: string;
      options?: unknown;
      correctIndex?: number;
      explanation?: string;
      explanationHtml?: string;
      favorite?: boolean;
      readLater?: boolean;
      suspended?: boolean;
      inWrongBook?: boolean;
      studyNodeId?: string | null;
      studyNodePath?: string | null;
      tags?: unknown;
    };

    const data: {
      question?: string;
      options?: string;
      correctIndex?: number;
      explanation?: string;
      explanationHtml?: string;
      favorite?: boolean;
      readLater?: boolean;
      suspended?: boolean;
      inWrongBook?: boolean;
      studyNodeId?: string | null;
      studyNodePath?: string | null;
      tags?: string;
    } = {};

    if (body.question !== undefined) {
      const q = body.question.trim();
      if (!q) return NextResponse.json({ error: "প্রশ্ন খালি রাখা যাবে না" }, { status: 400 });
      data.question = q.slice(0, 1200);
    }
    if (body.options !== undefined) {
      if (!Array.isArray(body.options)) {
        return NextResponse.json({ error: "options একটি তালিকা হতে হবে" }, { status: 400 });
      }
      const options = body.options.map((o) => String(o ?? "").trim()).filter((o) => o.length > 0);
      if (options.length < 2 || options.length > 6) {
        return NextResponse.json({ error: "২টি থেকে ৬টি অপশন দিন" }, { status: 400 });
      }
      data.options = JSON.stringify(options);
      if (body.correctIndex !== undefined) {
        let ci = Number.isInteger(body.correctIndex) ? body.correctIndex : 0;
        if (ci < 0 || ci >= options.length) ci = 0;
        data.correctIndex = ci;
      }
    } else if (body.correctIndex !== undefined && Number.isInteger(body.correctIndex)) {
      data.correctIndex = body.correctIndex;
    }
    if (body.explanation !== undefined) data.explanation = body.explanation.slice(0, 8000);
    if (body.explanationHtml !== undefined) data.explanationHtml = body.explanationHtml.slice(0, 200_000);
    if (body.favorite !== undefined) data.favorite = !!body.favorite;
    if (body.readLater !== undefined) data.readLater = !!body.readLater;
    if (body.suspended !== undefined) data.suspended = !!body.suspended;
    if (body.inWrongBook !== undefined) data.inWrongBook = !!body.inWrongBook;
    if (body.studyNodeId !== undefined) data.studyNodeId = body.studyNodeId || null;
    if (body.studyNodePath !== undefined) data.studyNodePath = body.studyNodePath || null;
    if (body.tags !== undefined) data.tags = JSON.stringify(normalizeTags(body.tags));

    await db.mcq.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/mcqs/[id] error:", error);
    return NextResponse.json({ error: "MCQ আপডেট করা যায়নি" }, { status: 500 });
  }
}

// DELETE /api/mcqs/[id] — Safe Delete (#21): snapshot → Trash, then remove
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const m = await db.mcq.findUnique({ where: { id } });
    if (!m) {
      return NextResponse.json({ error: "MCQ খুঁজে পাওয়া যায়নি" }, { status: 404 });
    }
    const row: TrashMcqRow = {
      id: m.id,
      nodeId: m.nodeId,
      nodePath: m.nodePath,
      studyNodeId: m.studyNodeId,
      studyNodePath: m.studyNodePath,
      question: m.question,
      options: m.options,
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
      tags: m.tags,
    };
    await moveToTrash({
      kind: "mcq",
      refId: m.id,
      title: m.question.slice(0, 120),
      path: m.studyNodePath || m.nodePath || "",
      summary: m.studyNodePath || m.nodePath || "MCQ প্রশ্ন",
      payload: { version: 1, kind: "mcq", mcq: row },
    });
    await db.mcq.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/mcqs/[id] error:", error);
    return NextResponse.json({ error: "MCQ মুছে ফেলা যায়নি" }, { status: 500 });
  }
}
