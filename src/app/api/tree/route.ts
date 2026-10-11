import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { seedIfEmpty } from "@/lib/bcs-seed";
import { backfillNoteItems } from "@/lib/bcs-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getDepth(id: string): Promise<number> {
  let depth = 1;
  let current = await db.treeNode.findUnique({ where: { id }, select: { parentId: true } });
  while (current?.parentId) {
    depth++;
    current = await db.treeNode.findUnique({
      where: { id: current.parentId },
      select: { parentId: true },
    });
  }
  return depth;
}

// GET /api/tree — full flat node list (client assembles hierarchy)
export async function GET() {
  try {
    const seeded = await seedIfEmpty();
    await backfillNoteItems();
    const nodes = await db.treeNode.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      include: {
        note: { select: { completed: true, updatedAt: true } },
        _count: { select: { children: true } },
      },
    });
    return NextResponse.json({
      nodes: nodes.map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        order: n.order,
        parentId: n.parentId,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        noteCompleted: n.type === "note" ? (n.note?.completed ?? false) : false,
        noteUpdatedAt: n.note?.updatedAt ?? null,
        childCount: n._count.children,
      })),
      seeded,
    });
  } catch (error) {
    console.error("GET /api/tree error:", error);
    return NextResponse.json({ error: "Failed to load tree" }, { status: 500 });
  }
}

// POST /api/tree — create node
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      type?: string;
      parentId?: string | null;
    };
    const name = (body.name ?? "").trim();
    const type = body.type === "note" ? "note" : "folder";
    const parentId = body.parentId ?? null;

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }
    if (name.length > 200) {
      return NextResponse.json({ error: "Name is too long (max 200)" }, { status: 400 });
    }

    if (parentId) {
      const parent = await db.treeNode.findUnique({ where: { id: parentId } });
      if (!parent) {
        return NextResponse.json({ error: "Parent not found" }, { status: 404 });
      }
      if (parent.type === "note") {
        return NextResponse.json(
          { error: "Cannot add children to a leaf note" },
          { status: 400 }
        );
      }
      const depth = await getDepth(parentId);
      if (depth + 1 > 6) {
        return NextResponse.json(
          { error: "Maximum 6 levels deep (Subject → Part → Topic → Sub-topic → Section → Leaf Note)" },
          { status: 400 }
        );
      }
    }

    const siblingCount = await db.treeNode.count({ where: { parentId } });
    const node = await db.treeNode.create({
      data: {
        name,
        type,
        parentId,
        order: siblingCount,
        ...(type === "note" ? { note: { create: {} } } : {}),
      },
      include: { note: { select: { completed: true, updatedAt: true } } },
    });

    return NextResponse.json({
      node: {
        id: node.id,
        name: node.name,
        type: node.type,
        order: node.order,
        parentId: node.parentId,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        noteCompleted: node.note?.completed ?? false,
        noteUpdatedAt: node.note?.updatedAt ?? null,
        childCount: 0,
      },
    });
  } catch (error) {
    console.error("POST /api/tree error:", error);
    return NextResponse.json({ error: "Failed to create node" }, { status: 500 });
  }
}
