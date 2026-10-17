import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { snapshotSubtree, moveToTrash, nodeBreadcrumbPath } from "@/lib/bcs-trash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// PATCH /api/tree/[id] — rename / toggle note completion
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      completed?: boolean;
      order?: number;
      parentId?: string | null;
    };

    const node = await db.treeNode.findUnique({ where: { id } });
    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json({ error: "Name cannot be empty" }, { status: 400 });
      }
      if (name.length > 200) {
        return NextResponse.json({ error: "Name is too long (max 200)" }, { status: 400 });
      }
      await db.treeNode.update({ where: { id }, data: { name } });
    }

    if (typeof body.order === "number" && Number.isFinite(body.order)) {
      await db.treeNode.update({ where: { id }, data: { order: Math.round(body.order) } });
    }
    if (body.parentId !== undefined) {
      await db.treeNode.update({
        where: { id },
        data: { parentId: body.parentId || null },
      });
    }

    if (typeof body.completed === "boolean" && node.type === "note") {
      const note = await db.note.upsert({
        where: { nodeId: id },
        create: { nodeId: id, completed: body.completed },
        update: { completed: body.completed },
      });
      return NextResponse.json({ ok: true, completed: note.completed });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/tree/[id] error:", error);
    return NextResponse.json({ error: "Failed to update node" }, { status: 500 });
  }
}

// DELETE /api/tree/[id] — Safe Delete (#21): snapshot the subtree into Trash
// (nodes + notes + note-items + documents + links + questions), then remove it.
// Uploaded files stay on disk — Permanent Delete (from Trash) removes them.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const node = await db.treeNode.findUnique({ where: { id } });
    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    // cached breadcrumb "Subject / Part / …" for the trash list
    const path = await nodeBreadcrumbPath(id);

    // 1. Snapshot BEFORE the cascade delete removes the rows
    const { payload, sizeBytes, summary } = await snapshotSubtree(id);

    // 2. Trash it (upsert — re-deleting the same id replaces the old snapshot)
    await moveToTrash({
      kind: "node",
      refId: id,
      title: node.name,
      path,
      summary,
      payload,
      sizeBytes,
    });

    // 3. Remove from live tables (cascade handles children; files stay on disk)
    await db.treeNode.delete({ where: { id } });

    const removedDocs = payload.documents?.length ?? 0;
    return NextResponse.json({ ok: true, removedNodes: payload.nodes?.length ?? 1, removedFiles: removedDocs });
  } catch (error) {
    console.error("DELETE /api/tree/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete node" }, { status: 500 });
  }
}
