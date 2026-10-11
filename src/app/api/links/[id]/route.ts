import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { moveToTrash, nodeBreadcrumbPath, type TrashLinkRow } from "@/lib/bcs-trash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/links/[id] — Safe Delete (#21): snapshot → Trash, then remove
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const link = await db.link.findUnique({ where: { id } });
    if (!link) {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }
    const row: TrashLinkRow = {
      id: link.id,
      noteId: link.noteId,
      title: link.title,
      url: link.url,
      provider: link.provider,
      readCount: link.readCount,
      lastReadAt: link.lastReadAt ? link.lastReadAt.toISOString() : null,
    };
    const note = await db.note.findUnique({
      where: { id: link.noteId },
      select: { nodeId: true },
    });
    const path = note ? await nodeBreadcrumbPath(note.nodeId) : "";
    await moveToTrash({
      kind: "link",
      refId: link.id,
      title: link.title,
      path,
      summary: "ওয়েব লিংক",
      payload: { version: 1, kind: "link", link: row },
    });
    await db.link.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/links/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete link" }, { status: 500 });
  }
}
