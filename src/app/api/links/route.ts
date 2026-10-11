import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function detectProvider(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("drive.google.com") || u.includes("docs.google.com")) return "drive";
  if (u.includes("onedrive.live.com") || u.includes("1drv.ms") || u.includes("sharepoint.com"))
    return "onedrive";
  if (u.includes("dropbox.com")) return "dropbox";
  return "other";
}

// GET /api/links — every smart link in the app, with its node id (for the calendar planner)
export async function GET() {
  try {
    const links = await db.link.findMany({
      orderBy: { createdAt: "desc" },
      include: { note: { select: { nodeId: true } } },
    });
    return NextResponse.json({
      links: links.map((l) => ({
        id: l.id,
        title: l.title,
        url: l.url,
        provider: l.provider,
        nodeId: l.note.nodeId,
        createdAt: l.createdAt,
      })),
      count: links.length,
    });
  } catch (error) {
    console.error("GET /api/links error:", error);
    return NextResponse.json({ error: "লিংক লোড করা যায়নি" }, { status: 500 });
  }
}

// POST /api/links — attach a smart link
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { noteId?: string; title?: string; url?: string };
    const noteId = body.noteId;
    const url = (body.url ?? "").trim();
    const title = (body.title ?? "").trim() || url;

    if (!noteId || !url) {
      return NextResponse.json({ error: "noteId and url are required" }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ error: "Only http(s) URLs are allowed" }, { status: 400 });
    }

    const node = await db.treeNode.findUnique({ where: { id: noteId } });
    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    await db.note.upsert({ where: { nodeId: noteId }, create: { nodeId: noteId }, update: {} });
    const note = await db.note.findUnique({ where: { nodeId: noteId }, select: { id: true } });
    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }

    const link = await db.link.create({
      data: {
        noteId: note.id,
        title: title.slice(0, 200),
        url: url.slice(0, 2048),
        provider: detectProvider(url),
      },
    });
    return NextResponse.json({ link });
  } catch (error) {
    console.error("POST /api/links error:", error);
    return NextResponse.json({ error: "Failed to add link" }, { status: 500 });
  }
}
