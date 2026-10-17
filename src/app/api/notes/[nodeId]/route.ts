import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/notes/[nodeId] — note with documents & links (creates if missing)
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ nodeId: string }> }
) {
  try {
    const { nodeId } = await params;
    const node = await db.treeNode.findUnique({ where: { id: nodeId } });
    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    const note = await db.note.upsert({
      where: { nodeId },
      create: { nodeId },
      update: {},
      include: {
        documents: { orderBy: { createdAt: "desc" } },
        links: { orderBy: { createdAt: "desc" } },
      },
    });

    return NextResponse.json({ note });
  } catch (error) {
    console.error("GET /api/notes/[nodeId] error:", error);
    return NextResponse.json({ error: "Failed to load note" }, { status: 500 });
  }
}

// PUT /api/notes/[nodeId] — save content / font / completion
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ nodeId: string }> }
) {
  try {
    const { nodeId } = await params;
    const node = await db.treeNode.findUnique({ where: { id: nodeId } });
    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    const body = (await request.json()) as {
      content?: string;
      font?: string;
      completed?: boolean;
    };

    const data: { content?: string; font?: string; completed?: boolean } = {};
    if (typeof body.content === "string") {
      if (body.content.length > 2_000_000) {
        return NextResponse.json({ error: "Note content too large" }, { status: 413 });
      }
      data.content = body.content;
    }
    if (body.font === "kalpurush" || body.font === "times") data.font = body.font;
    if (typeof body.completed === "boolean") data.completed = body.completed;

    const note = await db.note.upsert({
      where: { nodeId },
      create: { nodeId, ...data },
      update: data,
      include: {
        documents: { orderBy: { createdAt: "desc" } },
        links: { orderBy: { createdAt: "desc" } },
      },
    });

    return NextResponse.json({ note, savedAt: new Date().toISOString() });
  } catch (error) {
    console.error("PUT /api/notes/[nodeId] error:", error);
    return NextResponse.json({ error: "Failed to save note" }, { status: 500 });
  }
}
