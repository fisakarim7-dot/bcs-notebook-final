import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveDocPath } from "@/lib/uploads";
import * as storage from "@/lib/storage";
import fs from "fs";
import { Readable } from "stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KNOWN_MIME: Record<string, string> = {
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

function wantsHtml(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes("text/html");
}

/** Friendly 410 page for a top-level browser open; API callers still get JSON. */
function missingFilePage(docName: string, isCloud: boolean): Response {
  const where = isCloud
    ? "ক্লাউড স্টোরেজে (Vercel Blob) ফাইলটির কপি নেই। <b>JSON ইমপোর্টে ফাইল আসে না</b> — ল্যাপটপ থেকে <b>সম্পূর্ণ এক্সপোর্ট (ZIP)</b> ইমপোর্ট করে ফাইলগুলো ক্লাউডে আনুন, অথবা ফাইলটি আবার আপলোড করুন।"
    : "লোকাল ডিস্কে ফাইলটি নেই — ফাইলটি আবার সংযুক্ত করুন।";
  const html = `<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ফাইল পাওয়া যায়নি</title></head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#f4f3ef;display:flex;align-items:center;justify-content:center;min-height:100vh">
<div style="max-width:560px;margin:24px;padding:28px;background:#fff;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.15);line-height:1.9;color:#374151">
<h2 style="margin:0 0 10px;color:#111827">ফাইলটি পাওয়া যায়নি</h2>
<p style="margin:0 0 6px"><b>${docName}</b></p>
<p>${where}</p>
<p style="margin:16px 0 0"><a href="/" style="color:#0f766e;font-weight:600;text-decoration:none">← মূল অ্যাপে ফিরুন</a></p>
</div></body></html>`;
  return new Response(html, {
    status: 410,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// GET /api/documents/[id]/file?download=1 — serve file (inline preview or attachment).
// LOCAL streams from disk; CLOUD buffers from Vercel Blob.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const doc = await db.document.findUnique({ where: { id } });
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    const url = new URL(request.url);
    const isDownload = url.searchParams.get("download") === "1";
    const filename = doc.name.replace(/[\\/:*?"<>|\r\n]/g, "_");
    // ASCII-only fallback name (বাংলা নামে কিছু ব্রাউজার filename* বোঝে না)
    const asciiName = filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "'") || "file";
    // Content-Type সবসময় এক্সটেনশন থেকে ঠিক করা হয় — ডাটাবেসে ভুল/খালি/
    // octet-stream MIME থাকলে ব্রাউজার PDF না খুলে ডাউনলোড করে ফেলত।
    const ext = (doc.ext || "").toLowerCase();
    const contentType = KNOWN_MIME[ext] ?? (doc.mime || "application/octet-stream");
    const headers = {
      "Content-Type": contentType,
      "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=0, must-revalidate",
    };

    if (storage.isCloud) {
      const buf = await storage.readFile(doc.path);
      if (!buf) {
        return wantsHtml(request)
          ? missingFilePage(filename, true)
          : NextResponse.json({ error: "File missing in storage" }, { status: 410 });
      }
      return new Response(new Uint8Array(buf), { headers: { ...headers, "Content-Length": String(buf.byteLength) } });
    }

    const docPath = resolveDocPath(doc.path);
    if (!fs.existsSync(docPath)) {
      return wantsHtml(request)
        ? missingFilePage(filename, false)
        : NextResponse.json({ error: "File missing on disk" }, { status: 410 });
    }
    const stream = Readable.toWeb(
      fs.createReadStream(docPath)
    ) as unknown as ReadableStream<Uint8Array>;

    return new Response(stream, {
      headers: { ...headers, "Content-Length": String(doc.size) },
    });
  } catch (error) {
    console.error("GET /api/documents/[id]/file error:", error);
    return NextResponse.json({ error: "Failed to serve file" }, { status: 500 });
  }
}
