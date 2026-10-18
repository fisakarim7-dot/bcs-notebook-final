import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as storage from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 512 * 1024 * 1024; // 512 MB (same as single-upload)
const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
};

/**
 * POST /api/documents/chunk?uploadId=<id>&index=<n>&total=<t>&noteId=<y>&name=<z>&mime=<m>
 * Receives ONE chunk (<= 4MB, under Vercel's 4.5MB serverless body cap).
 * Chunks are stored as `chunks/<uploadId>/part-NNNNN`.
 * When the LAST chunk arrives, all parts are reassembled in order and saved
 * as a Document (same as the single-shot /api/documents flow).
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const uploadId = (url.searchParams.get("uploadId") ?? "").replace(/[^a-zA-Z0-9-]/g, "");
    const index = Number(url.searchParams.get("index"));
    const total = Number(url.searchParams.get("total"));
    const noteId = url.searchParams.get("noteId") ?? "";
    const rawName = (url.searchParams.get("name") ?? "file").slice(0, 120);
    const mimeHint = url.searchParams.get("mime") ?? "";

    if (!uploadId || !Number.isInteger(index) || index < 0 || !Number.isInteger(total) || total <= 0 || index >= total) {
      return NextResponse.json({ error: "uploadId, index ও total প্রয়োজন" }, { status: 400 });
    }
    const node = await db.treeNode.findUnique({ where: { id: noteId }, select: { id: true } });
    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    const buf = Buffer.from(await request.arrayBuffer());
    if (buf.byteLength === 0) {
      return NextResponse.json({ error: "খালি chunk" }, { status: 400 });
    }

    // Save this chunk
    const partName = `chunks/${uploadId}/part-${String(index).padStart(5, "0")}`;
    await storage.saveFile(partName, buf);

    // Not the last chunk yet — acknowledge
    if (index < total - 1) {
      return NextResponse.json({ ok: true, received: index + 1, total });
    }

    // Last chunk: reassemble in order
    const parts: Buffer[] = [];
    let totalBytes = 0;
    for (let i = 0; i < total; i++) {
      const p = await storage.readFile(`chunks/${uploadId}/part-${String(i).padStart(5, "0")}`);
      if (!p) {
        await storage.deletePrefix(`chunks/${uploadId}/`).catch(() => undefined);
        return NextResponse.json({ error: `chunk ${i} পাওয়া যায়নি — আবার চেষ্টা করুন` }, { status: 400 });
      }
      parts.push(p);
      totalBytes += p.byteLength;
    }
    if (totalBytes > MAX_SIZE) {
      await storage.deletePrefix(`chunks/${uploadId}/`).catch(() => undefined);
      return NextResponse.json({ error: "File exceeds the 512MB limit" }, { status: 413 });
    }
    const full = Buffer.concat(parts);

    // Create the document record (same as single-shot flow)
    const safeBase = rawName.replace(/[^\p{L}\p{M}\p{N}._-]+/gu, "_").slice(0, 80) || "file";
    const ext = (safeBase.split(".").pop() || "").toLowerCase();
    await db.note.upsert({ where: { nodeId: noteId }, create: { nodeId: noteId }, update: {} });
    const note = await db.note.findUnique({ where: { nodeId: noteId }, select: { id: true } });
    if (!note) {
      await storage.deletePrefix(`chunks/${uploadId}/`).catch(() => undefined);
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
    const doc = await db.document.create({
      data: {
        name: safeBase,
        ext,
        mime: MIME_MAP[ext] || mimeHint || "application/octet-stream",
        size: totalBytes,
        path: "pending",
        noteId: note.id,
      },
    });
    const targetName = `${doc.id}.${ext}`;
    try {
      await storage.saveFile(targetName, full);
    } catch (err) {
      await storage.deleteFile(targetName).catch(() => undefined);
      await db.document.delete({ where: { id: doc.id } }).catch(() => undefined);
      await storage.deletePrefix(`chunks/${uploadId}/`).catch(() => undefined);
      const msg = err instanceof Error ? err.message : "Upload failed";
      return NextResponse.json({ error: msg }, { status: msg.includes("size limit") ? 413 : 500 });
    }
    // Cleanup chunks
    await storage.deletePrefix(`chunks/${uploadId}/`).catch(() => undefined);

    const saved = await db.document.update({
      where: { id: doc.id },
      data: { path: targetName, size: totalBytes },
    });
    return NextResponse.json({
      document: {
        id: saved.id,
        name: saved.name,
        mime: saved.mime,
        size: saved.size,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
