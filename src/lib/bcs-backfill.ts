import { db } from "@/lib/db";

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

let backfilled = false;

/**
 * One-time migration: give every legacy Note (the single rich editor per node)
 * a matching standalone NoteItem so the new multi-note-card feature starts
 * with the user's existing content. Idempotent — runs only while the
 * NoteItem table is empty, and only once per process.
 */
export async function backfillNoteItems(): Promise<void> {
  if (backfilled) return;
  try {
    const count = await db.noteItem.count();
    if (count === 0) {
      const notes = await db.note.findMany();
      const toCreate = notes.filter((n) => n.content.trim() !== "");
      for (const note of toCreate) {
        const plain = stripHtml(note.content);
        const title = plain.slice(0, 40).trim();
        await db.noteItem.create({
          data: {
            nodeId: note.nodeId,
            content: note.content,
            font: note.font,
            title,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
          },
        });
      }
      if (toCreate.length > 0) {
        console.log(`backfillNoteItems: created ${toCreate.length} NoteItem(s) from legacy notes`);
      }
    }
    backfilled = true;
  } catch (error) {
    console.error("backfillNoteItems error:", error);
  }
}
