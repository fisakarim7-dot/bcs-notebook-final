import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  moveToTrash,
  nodeBreadcrumbPath,
  type TrashQuestionRow,
  type TrashQuestionAttachmentRow,
} from "@/lib/bcs-trash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function htmlToPlain(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// PATCH /api/questions/[id] — edit title / content / favorite / personal note
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      title?: string;
      contentHtml?: string;
      favorite?: boolean;
      nodeId?: string | null;
      noteHtml?: string;
    };

    const data: {
      title?: string;
      contentHtml?: string;
      contentPlain?: string;
      favorite?: boolean;
      nodeId?: string | null;
      noteHtml?: string;
      notePlain?: string;
    } = {};

    if (body.title !== undefined) data.title = body.title.trim().slice(0, 300);
    if (body.contentHtml !== undefined) {
      const html = body.contentHtml.trim();
      if (!html || html === "<p></p>") {
        return NextResponse.json({ error: "প্রশ্নের বিষয়বস্তু লিখুন" }, { status: 400 });
      }
      data.contentHtml = html.slice(0, 200_000);
      data.contentPlain = htmlToPlain(html).slice(0, 20_000);
    }
    if (body.favorite !== undefined) data.favorite = !!body.favorite;
    if (body.noteHtml !== undefined) {
      if (body.noteHtml.length > 200_000) {
        return NextResponse.json({ error: "নোটটি খুব বড় (২ লক্ষ অক্ষর সীমা)" }, { status: 400 });
      }
      data.noteHtml = body.noteHtml;
      data.notePlain = htmlToPlain(body.noteHtml).slice(0, 20_000);
    }
    if (body.nodeId !== undefined) {
      if (body.nodeId === null) {
        data.nodeId = null;
      } else {
        const node = await db.treeNode.findUnique({ where: { id: body.nodeId } });
        if (!node) return NextResponse.json({ error: "Node not found" }, { status: 404 });
        data.nodeId = node.id;
      }
    }

    await db.question.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/questions/[id] error:", error);
    return NextResponse.json({ error: "প্রশ্ন আপডেট করা যায়নি" }, { status: 500 });
  }
}

// DELETE /api/questions/[id] — Safe Delete (#21): snapshot (question + answer
// sources) → Trash, then remove. Source files STAY on disk until Permanent
// Delete from Trash, so the question can always be fully restored.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const q = await db.question.findUnique({
      where: { id },
      include: { attachments: true },
    });
    if (!q) {
      return NextResponse.json({ error: "প্রশ্ন খুঁজে পাওয়া যায়নি" }, { status: 404 });
    }
    const row: TrashQuestionRow = {
      id: q.id,
      nodeId: q.nodeId,
      nodePath: q.nodePath,
      title: q.title,
      contentHtml: q.contentHtml,
      contentPlain: q.contentPlain,
      favorite: q.favorite,
      noteHtml: q.noteHtml,
      notePlain: q.notePlain,
    };
    const attachments: TrashQuestionAttachmentRow[] = q.attachments.map((a) => ({
      id: a.id,
      questionId: a.questionId,
      kind: a.kind,
      name: a.name,
      ext: a.ext,
      mime: a.mime,
      size: a.size,
      path: a.path,
      url: a.url,
      provider: a.provider,
      contentHtml: a.contentHtml,
      font: a.font,
    }));
    const path = q.nodePath || (q.nodeId ? await nodeBreadcrumbPath(q.nodeId) : "");
    const sizeBytes = q.attachments.reduce((acc, a) => acc + a.size, 0);
    await moveToTrash({
      kind: "question",
      refId: q.id,
      title: q.title.trim() || q.contentPlain.slice(0, 60) || "শিরোনামহীন প্রশ্ন",
      path,
      summary: attachments.length
        ? `${attachments.length}টি উত্তর-সোর্স সহ`
        : "সরাসরি প্রশ্ন",
      payload: { version: 1, kind: "question", question: row, questionAttachments: attachments },
      sizeBytes,
    });
    await db.question.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/questions/[id] error:", error);
    return NextResponse.json({ error: "প্রশ্ন মুছে ফেলা যায়নি" }, { status: 500 });
  }
}
