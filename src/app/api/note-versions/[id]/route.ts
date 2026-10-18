import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const rows = await db.noteVersion.findMany({
      where: { noteItemId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return NextResponse.json({
      versions: rows.map((r) => ({
        id: r.id,
        noteItemId: r.noteItemId,
        title: r.title,
        content: r.content,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("GET /api/note-versions/[id]", error);
    return NextResponse.json({ error: "হিস্ট্রি লোড হয়নি" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { restoreId?: string };
    if (!body.restoreId) return NextResponse.json({ error: "restoreId দরকার" }, { status: 400 });
    const ver = await db.noteVersion.findUnique({ where: { id: body.restoreId } });
    if (!ver || ver.noteItemId !== id) {
      return NextResponse.json({ error: "ভার্সন পাওয়া যায়নি" }, { status: 404 });
    }
    const item = await db.noteItem.update({
      where: { id },
      data: { title: ver.title, content: ver.content },
    });
    return NextResponse.json({ ok: true, title: item.title, content: item.content });
  } catch (error) {
    console.error("POST /api/note-versions/[id]", error);
    return NextResponse.json({ error: "রিস্টোর হয়নি" }, { status: 500 });
  }
}
