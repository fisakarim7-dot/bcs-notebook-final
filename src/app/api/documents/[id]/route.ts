import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { moveToTrash, nodeBreadcrumbPath, type TrashDocumentRow } from "@/lib/bcs-trash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/documents/[id] — Safe Delete (#21): snapshot → Trash, then remove
// the row. The uploaded file STAYS on disk until Permanent Delete from Trash.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const doc = await db.document.findUnique({ where: { id } });
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }
    const row: TrashDocumentRow = {
      id: doc.id,
      noteId: doc.noteId,
      name: doc.name,
      ext: doc.ext,
      mime: doc.mime,
      size: doc.size,
      path: doc.path,
      readCount: doc.readCount,
      lastReadAt: doc.lastReadAt ? doc.lastReadAt.toISOString() : null,
    };
    const note = await db.note.findUnique({
      where: { id: doc.noteId },
      select: { nodeId: true },
    });
    const path = note ? await nodeBreadcrumbPath(note.nodeId) : "";
    await moveToTrash({
      kind: "document",
      refId: doc.id,
      title: doc.name,
      path,
      summary: `${doc.ext.toUpperCase()} · ফাইল`,
      payload: { version: 1, kind: "document", document: row },
      sizeBytes: doc.size,
    });
    await db.document.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/documents/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}
