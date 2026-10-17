import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { moveToTrash, type TrashQuestionAttachmentRow } from "@/lib/bcs-trash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/question-attachments/[id] — rename an attachment
// (kind="note" | "data" may also patch { contentHtml, font } — rich-text autosave)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as
      | { name?: string; contentHtml?: string; font?: string }
      | null;
    const data: { name?: string; contentHtml?: string; font?: string } = {};
    if (typeof body?.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ error: "নাম প্রয়োজন" }, { status: 400 });
      }
      data.name = name.slice(0, 300);
    }
    if (typeof body?.contentHtml === "string") data.contentHtml = body.contentHtml;
    if (body?.font === "kalpurush" || body?.font === "times") data.font = body.font;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "নাম প্রয়োজন" }, { status: 400 });
    }
    const att = await db.questionAttachment.findUnique({ where: { id }, select: { id: true, kind: true } });
    if (!att) {
      return NextResponse.json({ error: "সংযুক্তি পাওয়া যায়নি" }, { status: 404 });
    }
    if ((data.contentHtml !== undefined || data.font !== undefined) && att.kind !== "note" && att.kind !== "data") {
      return NextResponse.json({ error: "এই সোর্সে লেখা যোগ করা যায় না" }, { status: 400 });
    }
    await db.questionAttachment.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/question-attachments/[id] error:", error);
    return NextResponse.json({ error: "সংযুক্তি আপডেট করা যায়নি" }, { status: 500 });
  }
}

// DELETE /api/question-attachments/[id] — Safe Delete (#21): snapshot → Trash.
// The file STAYS on disk until Permanent Delete from Trash.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const att = await db.questionAttachment.findUnique({ where: { id } });
    if (!att) {
      return NextResponse.json({ error: "সংযুক্তি পাওয়া যায়নি" }, { status: 404 });
    }
    const row: TrashQuestionAttachmentRow = {
      id: att.id,
      questionId: att.questionId,
      kind: att.kind,
      name: att.name,
      ext: att.ext,
      mime: att.mime,
      size: att.size,
      path: att.path,
      url: att.url,
      provider: att.provider,
      contentHtml: att.contentHtml,
      font: att.font,
    };
    await moveToTrash({
      kind: "questionAttachment",
      refId: att.id,
      title: att.name,
      summary:
        att.kind === "link"
          ? "উত্তর-সোর্স লিংক"
          : att.kind === "note"
            ? "উত্তর-সোর্স নোট"
            : att.kind === "data"
              ? "উত্তর-সোর্স তথ্য-উপাত্ত"
              : `উত্তর-সোর্স ${att.ext.toUpperCase()} ফাইল`,
      payload: { version: 1, kind: "questionAttachment", questionAttachment: row },
      sizeBytes: att.size,
    });
    await db.questionAttachment.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/question-attachments/[id] error:", error);
    return NextResponse.json({ error: "সংযুক্তি মুছে ফেলা যায়নি" }, { status: 500 });
  }
}
