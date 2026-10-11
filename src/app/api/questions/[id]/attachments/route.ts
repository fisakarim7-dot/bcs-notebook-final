import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import * as storage from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 512 * 1024 * 1024; // 512 MB
const ALLOWED_EXT = [
  "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx",
  "html", "txt", "md", "csv",
  "png", "jpg", "jpeg", "webp", "gif",
];
const IMAGE_EXTS = ["png", "jpg", "jpeg", "webp", "gif"];

const MIME_MAP: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  html: "text/html; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

function normalizeExt(filename: string): string | null {
  const m = /\.([a-z0-9]+)$/i.exec(filename.trim());
  if (!m) return null;
  let ext = m[1].toLowerCase();
  if (ext === "htm") ext = "html"; // normalize htm → html
  return ALLOWED_EXT.includes(ext) ? ext : null;
}

function detectProvider(hostname: string): string {
  const h = hostname.toLowerCase();
  if (h.includes("drive.google")) return "drive";
  if (h.includes("onedrive") || h.includes("sharepoint")) return "onedrive";
  if (h.includes("dropbox")) return "dropbox";
  return "other";
}

// GET /api/questions/[id]/attachments — every answer-source of one question
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const question = await db.question.findUnique({ where: { id }, select: { id: true } });
    if (!question) {
      return NextResponse.json({ error: "প্রশ্নটি পাওয়া যায়নি" }, { status: 404 });
    }
    const attachments = await db.questionAttachment.findMany({
      where: { questionId: id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({ attachments });
  } catch (error) {
    console.error("GET /api/questions/[id]/attachments error:", error);
    return NextResponse.json({ error: "সংযুক্তি লোড করা যায়নি" }, { status: 500 });
  }
}

// POST /api/questions/[id]/attachments
//  a) JSON  { name?, url }          → kind="link"
//     JSON  { kind:"note"|"data", name? } → rich-text নোট / তথ্য-উপাত্ত
//  b) raw octet-stream ?name=&mime= → kind="file" | "image" (streams up to 512MB)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const question = await db.question.findUnique({ where: { id }, select: { id: true } });
    if (!question) {
      return NextResponse.json({ error: "প্রশ্নটি পাওয়া যায়নি" }, { status: 404 });
    }

    const contentType = request.headers.get("content-type") ?? "";

    // ---------- (a) JSON → link attachment ----------
    if (contentType.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as
        | { name?: string; url?: string; kind?: string; contentHtml?: string }
        | null;

      // ---------- rich-text answer-source: নোট / তথ্য-উপাত্ত ----------
      if (body?.kind === "note" || body?.kind === "data") {
        const fallback = body.kind === "note" ? "নোট" : "তথ্য-উপাত্ত";
        const attachment = await db.questionAttachment.create({
          data: {
            questionId: id,
            kind: body.kind,
            name: ((body.name ?? "").trim() || fallback).slice(0, 300),
            contentHtml: typeof body.contentHtml === "string" ? body.contentHtml : "",
          },
        });
        return NextResponse.json({ attachment }, { status: 201 });
      }
      const urlRaw = (body?.url ?? "").trim();

      let parsed: URL;
      try {
        parsed = new URL(urlRaw);
      } catch {
        return NextResponse.json({ error: "সঠিক লিংক দিন" }, { status: 400 });
      }
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return NextResponse.json({ error: "সঠিক লিংক দিন" }, { status: 400 });
      }

      const name = ((body?.name ?? "").trim() || parsed.hostname).slice(0, 300);
      const provider = detectProvider(parsed.hostname);

      const attachment = await db.questionAttachment.create({
        data: {
          questionId: id,
          kind: "link",
          name,
          url: urlRaw.slice(0, 4000),
          provider,
        },
      });
      return NextResponse.json({ attachment }, { status: 201 });
    }

    // ---------- (b) raw stream upload → file / image ----------
    const url = new URL(request.url);
    const rawName = (url.searchParams.get("name") ?? "").trim();
    const mimeHint = url.searchParams.get("mime") ?? "";

    if (!rawName) {
      return NextResponse.json({ error: "ফাইলের নাম প্রয়োজন" }, { status: 400 });
    }
    const ext = normalizeExt(rawName);
    if (!ext) {
      return NextResponse.json({ error: "এই ফাইল টাইপ সমর্থিত নয়" }, { status: 415 });
    }

    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_SIZE) {
      return NextResponse.json({ error: "ফাইলটি 512MB সীমা ছাড়িয়ে গেছে" }, { status: 413 });
    }

    const kind = IMAGE_EXTS.includes(ext) ? "image" : "file";
    const att = await db.questionAttachment.create({
      data: {
        questionId: id,
        kind,
        name: rawName.slice(0, 300),
        ext,
        mime: MIME_MAP[ext] || mimeHint || "application/octet-stream",
        size: contentLength,
        path: "pending",
      },
    });

    if (!request.body) {
      await db.questionAttachment.delete({ where: { id: att.id } }).catch(() => undefined);
      return NextResponse.json({ error: "খালি রিকোয়েস্ট বডি" }, { status: 400 });
    }

    const targetName = `${att.id}.${ext}`;
    let bytesWritten = 0;
    try {
      bytesWritten = await storage.saveFromRequest(targetName, request, MAX_SIZE);
    } catch (err) {
      await storage.deleteFile(targetName).catch(() => undefined);
      await db.questionAttachment.delete({ where: { id: att.id } }).catch(() => undefined);
      const msg = err instanceof Error ? err.message : "আপলোড ব্যর্থ হয়েছে";
      return NextResponse.json(
        { error: msg },
        { status: msg.includes("size limit") ? 413 : 500 }
      );
    }

    const saved = await db.questionAttachment.update({
      where: { id: att.id },
      // Store only the bare file name so the app folder stays portable
      data: { path: targetName, size: bytesWritten },
    });

    return NextResponse.json({ attachment: saved }, { status: 201 });
  } catch (error) {
    console.error("POST /api/questions/[id]/attachments error:", error);
    return NextResponse.json({ error: "সংযুক্তি সেভ করা যায়নি" }, { status: 500 });
  }
}
