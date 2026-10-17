import { NextResponse } from "next/server";
import * as storage from "@/lib/storage";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Images embedded inside rich-text notes — small compared to documents
const MAX_SIZE = 10 * 1024 * 1024; // 10 MB per image

const ALLOWED_EXT = ["png", "jpg", "jpeg", "webp", "gif"];

const MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * POST /api/note-images?ext=png — raw stream upload of an image that is
 * embedded INSIDE rich-text note content (toolbar insert / paste / drop).
 *
 * Stored FLAT in db/uploads as noteimg-<uuid>.<ext> so that:
 *  - the backup ZIP picks it up automatically (flat file listing)
 *  - restore puts it back automatically
 *  - no database table is needed (URL is embedded in the note HTML itself)
 *
 * Returns { url: "/api/note-images/noteimg-<uuid>.<ext>" } to insert as <img src>.
 */
export async function POST(request: Request) {
  try {
    const url = new URL(request.url);
    const ext = (url.searchParams.get("ext") ?? "").toLowerCase();

    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json(
        { error: "Unsupported image type. Allowed: PNG, JPG, WEBP, GIF" },
        { status: 415 }
      );
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_SIZE) {
      return NextResponse.json(
        { error: "ছবিটি 10MB-এর বেশি" },
        { status: 413 }
      );
    }

    if (!request.body) {
      return NextResponse.json({ error: "Empty request body" }, { status: 400 });
    }

    const name = `noteimg-${randomUUID()}.${ext}`;
    let bytesWritten = 0;
    try {
      bytesWritten = await storage.saveFromRequest(name, request, MAX_SIZE);
    } catch (err) {
      await storage.deleteFile(name).catch(() => undefined);
      const msg = err instanceof Error ? err.message : "";
      const isTooBig = msg.includes("size limit");
      return NextResponse.json(
        { error: isTooBig ? "ছবিটি 10MB-এর বেশি" : "ছবি আপলোড করা যায়নি" },
        { status: isTooBig ? 413 : 500 }
      );
    }

    return NextResponse.json({
      url: `/api/note-images/${name}`,
      mime: MIME_MAP[ext],
      size: bytesWritten,
    });
  } catch (error) {
    console.error("POST /api/note-images error:", error);
    return NextResponse.json({ error: "ছবি আপলোড করা যায়নি" }, { status: 500 });
  }
}
