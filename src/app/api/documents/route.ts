import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as storage from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 512 * 1024 * 1024; // 512 MB
const ALLOWED_EXT = ["pdf", "docx", "html", "txt", "png", "jpg", "jpeg", "webp", "gif"];

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  html: "text/html; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function getExt(filename: string): string | null {
  const m = /\.([a-z0-9]+)$/i.exec(filename.trim());
  if (!m) return null;
  const ext = m[1].toLowerCase();
  return ALLOWED_EXT.includes(ext) ? ext : null;
}

// GET /api/documents — every file in the vault with its node path
// (used by the AI "generate from file" browser; mirrors the tree badges)
export async function GET() {
  try {
    const docs = await db.document.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        ext: true,
        size: true,
        createdAt: true,
        note: { select: { nodeId: true } },
      },
    });
    const nodes = await db.treeNode.findMany({
      select: { id: true, name: true, parentId: true },
    });
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const pathOf = (id: string): string => {
      const names: string[] = [];
      let cur = byId.get(id);
      while (cur) {
        names.unshift(cur.name);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return names.join(" / ");
    };
    return NextResponse.json({
      documents: docs.map((d) => ({
        id: d.id,
        name: d.name,
        ext: d.ext,
        size: d.size,
        createdAt: d.createdAt,
        nodeId: d.note?.nodeId ?? null,
        nodePath: d.note?.nodeId ? pathOf(d.note.nodeId) : null,
      })),
    });
  } catch (error) {
    console.error("GET /api/documents error:", error);
    return NextResponse.json({ error: "Failed to list documents" }, { status: 500 });
  }
}

// POST /api/documents?noteId=...&name=... — raw stream upload (supports up to 512MB)
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const noteId = url.searchParams.get("noteId");
    const rawName = (url.searchParams.get("name") ?? "").trim();
    const mimeHint = url.searchParams.get("mime") ?? "";

    if (!noteId || !rawName) {
      return NextResponse.json(
        { error: "noteId and name are required" },
        { status: 400 }
      );
    }

    const ext = getExt(rawName);
    if (!ext) {
      return NextResponse.json(
        { error: "Unsupported file type. Allowed: PDF, DOCX, HTML, TXT, PNG, JPG, WEBP, GIF" },
        { status: 415 }
      );
    }

    const node = await db.treeNode.findUnique({ where: { id: noteId } });
    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }
    // NOTE: folders are allowed too — any node can hold documents (a Note row
    // is auto-created as the attachment bridge via note.upsert below).

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_SIZE) {
      return NextResponse.json(
        { error: "File exceeds the 512MB limit" },
        { status: 413 }
      );
    }

    await db.note.upsert({ where: { nodeId: noteId }, create: { nodeId: noteId }, update: {} });
    const note = await db.note.findUnique({ where: { nodeId: noteId }, select: { id: true } });
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const doc = await db.document.create({
      data: {
        name: rawName,
        ext,
        mime: MIME_MAP[ext] || mimeHint || "application/octet-stream",
        size: contentLength,
        path: "pending",
        noteId: note.id,
      },
    });

    const targetName = `${doc.id}.${ext}`;
    let bytesWritten = 0;
    try {
      bytesWritten = await storage.saveFromRequest(targetName, request, MAX_SIZE);
    } catch (err) {
      await storage.deleteFile(targetName).catch(() => undefined);
      await db.document.delete({ where: { id: doc.id } }).catch(() => undefined);
      const msg = err instanceof Error ? err.message : "Upload failed";
      return NextResponse.json({ error: msg }, { status: msg.includes("size limit") ? 413 : 500 });
    }

    const saved = await db.document.update({
      where: { id: doc.id },
      // Store only the bare file name so the app folder stays portable
      data: { path: targetName, size: bytesWritten },
    });

    return NextResponse.json({ document: saved });
  } catch (error) {
    console.error("POST /api/documents error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
