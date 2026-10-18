import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import type { NoteItemDTO } from "@/lib/bcs-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CONTENT = 2_000_000; // 2 MB

function toDTO(item: {
  id: string;
  title: string;
  content: string;
  font: string;
  nodeId: string;
  readCount: number;
  lastReadAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): NoteItemDTO {
  return {
    id: item.id,
    title: item.title,
    content: item.content,
    font: item.font,
    nodeId: item.nodeId,
    readCount: item.readCount,
    lastReadAt: item.lastReadAt ? item.lastReadAt.toISOString() : null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

// GET /api/note-items?nodeId=... — all standalone note items of a node (createdAt asc)
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const nodeId = url.searchParams.get("nodeId");
    if (!nodeId) {
      return NextResponse.json(
        { error: "nodeId কোয়েরি প্যারামিটার দরকার" },
        { status: 400 }
      );
    }

    const node = await db.treeNode.findUnique({ where: { id: nodeId } });
    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    const items = await db.noteItem.findMany({
      where: { nodeId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ items: items.map(toDTO) });
  } catch (error) {
    console.error("GET /api/note-items error:", error);
    return NextResponse.json(
      { error: "নোট আইটেম লোড করা যায়নি" },
      { status: 500 }
    );
  }
}

const createSchema = z.object({
  nodeId: z.string().min(1, "nodeId is required"),
  title: z.string().max(300).optional(),
  content: z.string().max(MAX_CONTENT).optional(),
});

// POST /api/note-items — create a standalone note item under a node
export async function POST(request: Request) {
  try {
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "nodeId দিতে হবে (title/content ঐচ্ছিক)" },
        { status: 400 }
      );
    }

    const { nodeId, title, content } = parsed.data;
    const node = await db.treeNode.findUnique({ where: { id: nodeId } });
    if (!node) {
      return NextResponse.json(
        { error: "Node not found" },
        { status: 404 }
      );
    }

    const item = await db.noteItem.create({
      data: {
        nodeId,
        title: (title ?? "").slice(0, 300),
        content: content ?? "",
      },
    });

    return NextResponse.json({ item: toDTO(item) });
  } catch (error) {
    console.error("POST /api/note-items error:", error);
    return NextResponse.json(
      { error: "নোট আইটেম তৈরি করা যায়নি" },
      { status: 500 }
    );
  }
}
