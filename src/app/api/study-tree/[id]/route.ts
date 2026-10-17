import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function collectSubtreeIds(rootId: string): Promise<string[]> {
  const ids: string[] = [rootId];
  let frontier = [rootId];
  while (frontier.length) {
    const children = await db.studyNode.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true },
    });
    frontier = children.map((c) => c.id);
    ids.push(...frontier);
  }
  return ids;
}

// PATCH /api/study-tree/[id] — rename a study level
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { name?: string };

    const node = await db.studyNode.findUnique({ where: { id } });
    if (!node) {
      return NextResponse.json({ error: "লেভেল পাওয়া যায়নি" }, { status: 404 });
    }

    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "নাম খালি রাখা যাবে না" }, { status: 400 });
    }
    if (name.length > 200) {
      return NextResponse.json(
        { error: "নাম অত্যধিক বড় (সর্বোচ্চ ২০০ অক্ষর)" },
        { status: 400 }
      );
    }
    await db.studyNode.update({ where: { id }, data: { name } });
    return NextResponse.json({ ok: true, id });
  } catch (error) {
    console.error("PATCH /api/study-tree/[id] error:", error);
    return NextResponse.json({ error: "লেভেল আপডেট করা যায়নি" }, { status: 500 });
  }
}

// DELETE /api/study-tree/[id] — delete the level AND its whole sub-tree.
// Cards / MCQs attached anywhere in the sub-tree are detached first so no
// dangling references remain (their studyNodeId/studyNodePath are cleared).
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const node = await db.studyNode.findUnique({ where: { id } });
    if (!node) {
      return NextResponse.json({ error: "লেভেল পাওয়া যায়নি" }, { status: 404 });
    }

    const ids = await collectSubtreeIds(id);
    await db.flashcard.updateMany({
      where: { studyNodeId: { in: ids } },
      data: { studyNodeId: null, studyNodePath: null },
    });
    await db.mcq.updateMany({
      where: { studyNodeId: { in: ids } },
      data: { studyNodeId: null, studyNodePath: null },
    });
    await db.studyNode.delete({ where: { id } }); // children cascade

    return NextResponse.json({ ok: true, deletedSubtree: ids.length });
  } catch (error) {
    console.error("DELETE /api/study-tree/[id] error:", error);
    return NextResponse.json({ error: "লেভেল মুছে ফেলা যায়নি" }, { status: 500 });
  }
}
