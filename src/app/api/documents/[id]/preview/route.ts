import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as storage from "@/lib/storage";
import mammoth from "mammoth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PreviewPayload =
  | { kind: "pdf"; name: string; fileUrl: string }
  | { kind: "image"; name: string; fileUrl: string }
  | { kind: "html"; name: string; html: string }
  | { kind: "text"; name: string; text: string }
  | { kind: "unsupported"; name: string };

const cache = new Map<string, { stamp: string; payload: PreviewPayload }>();

// GET /api/documents/[id]/preview — server-rendered preview content
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const doc = await db.document.findUnique({ where: { id } });
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const stamp = doc.createdAt.toISOString() + doc.size;
    const hit = cache.get(id);
    if (hit && hit.stamp === stamp) {
      return NextResponse.json({ preview: hit.payload });
    }

    let payload: PreviewPayload;
    if (doc.ext === "pdf") {
      payload = { kind: "pdf", name: doc.name, fileUrl: `/api/documents/${id}/file` };
    } else if (["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"].includes(doc.ext)) {
      payload = { kind: "image", name: doc.name, fileUrl: `/api/documents/${id}/file` };
    } else if (doc.ext === "html") {
      const buf = await storage.readFile(doc.path);
      payload = { kind: "html", name: doc.name, html: buf ? buf.toString("utf-8") : "" };
    } else if (doc.ext === "txt") {
      const buf = await storage.readFile(doc.path);
      payload = { kind: "text", name: doc.name, text: buf ? buf.toString("utf-8") : "" };
    } else if (doc.ext === "docx") {
      const buf = await storage.readFile(doc.path);
      const result = await mammoth.convertToHtml(
        { buffer: buf ?? Buffer.alloc(0) },
        { convertImage: undefined }
      );
      payload = { kind: "html", name: doc.name, html: result.value };
    } else {
      payload = { kind: "unsupported", name: doc.name };
    }

    cache.set(id, { stamp, payload });
    return NextResponse.json({ preview: payload });
  } catch (error) {
    console.error("GET /api/documents/[id]/preview error:", error);
    return NextResponse.json({ error: "Failed to build preview" }, { status: 500 });
  }
}
