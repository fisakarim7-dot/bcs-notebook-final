import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveDocPath } from "@/lib/uploads";
import * as storage from "@/lib/storage";
import fs from "fs";
import { Readable } from "stream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/question-attachments/[id]/file?download=1
//   kind="link" → 302 redirect to the stored URL
//   file/image  → stream from db/uploads (inline preview or attachment download)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const att = await db.questionAttachment.findUnique({ where: { id } });
    if (!att) {
      return NextResponse.json({ error: "সংযুক্তি পাওয়া যায়নি" }, { status: 404 });
    }

    if (att.kind === "link") {
      return NextResponse.redirect(att.url, 302);
    }

    // rich-text নোট / তথ্য-উপাত্ত → clean print page (Save as PDF)
    if (att.kind === "note" || att.kind === "data") {
      return NextResponse.redirect(new URL(`/api/question-attachments/${att.id}/print`, request.url), 302);
    }

    const url = new URL(request.url);
    const isDownload = url.searchParams.get("download") === "1";
    // Keep the extension in the download name: prefer row.name if it already
    // carries the ext, else append it.
    const lower = att.name.toLowerCase();
    const extLower = att.ext.toLowerCase();
    const displayName =
      att.ext && lower.endsWith(`.${extLower}`) ? att.name : `${att.name}.${att.ext}`;
    const filename = displayName.replace(/[\\/:*?"<>|\r\n]/g, "_");
    const headers = {
      "Content-Type": att.mime || "application/octet-stream",
      "Content-Disposition": `${isDownload ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "private, max-age=0, must-revalidate",
    };

    if (storage.isCloud) {
      const buf = await storage.readFile(att.path);
      if (!buf) return NextResponse.json({ error: "ফাইলটি স্টোরেজে পাওয়া যায়নি" }, { status: 410 });
      return new Response(new Uint8Array(buf), { headers: { ...headers, "Content-Length": String(buf.byteLength) } });
    }

    const filePath = resolveDocPath(att.path);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: "ফাইলটি ডিস্কে পাওয়া যায়নি" }, { status: 410 });
    }

    const stream = Readable.toWeb(
      fs.createReadStream(filePath)
    ) as unknown as ReadableStream<Uint8Array>;

    return new Response(stream, {
      headers: { ...headers, "Content-Length": String(att.size) },
    });
  } catch (error) {
    console.error("GET /api/question-attachments/[id]/file error:", error);
    return NextResponse.json({ error: "ফাইল সার্ভ করা যায়নি" }, { status: 500 });
  }
}
