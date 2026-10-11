import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import type { NoteItemDTO } from "@/lib/bcs-types";
import { moveToTrash, nodeBreadcrumbPath, type TrashNoteItemRow } from "@/lib/bcs-trash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CONTENT = 2_000_000; // 2 MB

function toDTO(item: {
  id: string;
  title: string;
  content: string;
  font: string;
  nodeId: string;
  readCount: number;
  lastReadAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): NoteItemDTO {
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    font: item.font,
    nodeId: item.nodeId,
    readCount: item.readCount,
    lastReadAt: item.lastReadAt ? item.lastReadAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

const patchSchema = z.object({
  title: z.string().max(300).optional(),
  content: z.string().max(MAX_CONTENT, "content exceeds 2MB").optional(),
  font: z.string().max(60).optional(),
});

// PATCH /api/note-items/[id] — update title / content / font
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      const reason =
        parsed.error.issues.find((i) => i.code === "too_big")?.message ??
        "title/content/font এর মান সঠিক নয়";
      return NextResponse.json({ error: reason }, { status: 413 });
    }

    const existing = await db.noteItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Note item not found" },
        { status: 404 }
      );
    }

    const data: { title?: string; content?: string; font?: string } = {};
    if (typeof parsed.data.title === "string") data.title = parsed.data.title.slice(0, 300);
    if (typeof parsed.data.content === "string") data.content = parsed.data.content;
    if (typeof parsed.data.font === "string") data.font = parsed.data.font.slice(0, 60);

    // Version history: snapshot previous content at most every 2 minutes, keep last 20.
    if (data.content !== undefined && data.content !== existing.content) {
      const latest = await db.noteVersion.findFirst({
        where: { noteItemId: id },
        orderBy: { createdAt: "desc" },
      });
      const stale = !latest || Date.now() - latest.createdAt.getTime() > 2 * 60_000;
      if (stale) {
        await db.noteVersion.create({
          data: { noteItemId: id, title: existing.title, content: existing.content },
        });
        const extras = await db.noteVersion.findMany({
          where: { noteItemId: id },
          orderBy: { createdAt: "desc" },
          skip: 20,
          select: { id: true },
        });
        if (extras.length) {
          await db.noteVersion.deleteMany({ where: { id: { in: extras.map((e) => e.id) } } });
        }
      }
    }

    const item = await db.noteItem.update({ where: { id }, data });

    return NextResponse.json({ item: toDTO(item), savedAt: new Date().toISOString() });
  } catch (error) {
    console.error("PATCH /api/note-items/[id] error:", error);
    return NextResponse.json(
      { error: "নোট আইটেম সেভ করা যায়নি" },
      { status: 500 }
    );
  }
}

// DELETE /api/note-items/[id] — Safe Delete (#21): snapshot → Trash, then remove
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const existing = await db.noteItem.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json(
        { error: "Note item not found" },
        { status: 404 }
      );
    }
    const row: TrashNoteItemRow = {
      id: existing.id,
      nodeId: existing.nodeId,
      title: existing.title,
      content: existing.content,
      font: existing.font,
      readCount: existing.readCount,
      lastReadAt: existing.lastReadAt ? existing.lastReadAt.toISOString() : null,
    };
    const path = await nodeBreadcrumbPath(existing.nodeId);
    await moveToTrash({
      kind: "noteItem",
      refId: existing.id,
      title: existing.title.trim() || existing.content.slice(0, 60).trim() || "শিরোনামহীন নোট",
      path,
      summary: existing.content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 80),
      payload: { version: 1, kind: "noteItem", noteItem: row },
    });
    await db.noteItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/note-items/[id] error:", error);
    return NextResponse.json(
      { error: "নোট আইটেম মোছা যায়নি" },
      { status: 500 }
    );
  }
}
