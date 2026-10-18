import { NextResponse } from "next/server";
import { resolveDocPath } from "@/lib/uploads";
import * as storage from "@/lib/storage";
import fs from "fs";
import { Readable } from "stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIME_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

// noteimg-<uuid v4>.<ext> — uuid hex only, so no traversal / weird names possible
const NAME_RE =
  /^noteimg-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|gif)$/;

/**
 * GET /api/note-images/[file] — serve an image embedded in note content.
 * UUID file names never change → cache forever.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  try {
    const { file } = await params;

    if (!NAME_RE.test(file)) {
      return NextResponse.json({ error: "Invalid image name" }, { status: 400 });
    }

    const ext = file.split(".").pop()!.toLowerCase();
    const headers = {
      "Content-Type": MIME_MAP[ext] ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    };

    if (storage.isCloud) {
      const buf = await storage.readFile(file);
      if (!buf) return NextResponse.json({ error: "Image not found" }, { status: 404 });
      return new Response(new Uint8Array(buf), { headers: { ...headers, "Content-Length": String(buf.byteLength) } });
    }

    const filePath = resolveDocPath(file);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "Image not found" }, { status: 404 });
    }
    const stat = fs.statSync(filePath);
    const stream = Readable.toWeb(
      fs.createReadStream(filePath)
    ) as unknown as ReadableStream<Uint8Array>;

    return new Response(stream, {
      headers: { ...headers, "Content-Length": String(stat.size) },
    });
  } catch (error) {
    console.error("GET /api/note-images/[file] error:", error);
    return NextResponse.json({ error: "Failed to serve image" }, { status: 500 });
  }
}
