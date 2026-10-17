import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { permanentDeleteTrashItem, restoreTrashItem, restoreSummary } from "@/lib/bcs-trash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/trash/[id] — restore the item (+ subtree / resources) with original ids
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const exists = await db.trashItem.findUnique({ where: { id }, select: { id: true } });
    if (!exists) {
      return NextResponse.json({ error: "ট্র্যাশ আইটেম খুঁজে পাওয়া যায়নি" }, { status: 404 });
    }
    const res = await restoreTrashItem(id);
    return NextResponse.json({ ok: true, ...res, message: restoreSummary(res) });
  } catch (error) {
    console.error("POST /api/trash/[id] error:", error);
    const msg = error instanceof Error ? error.message : "ফেরানো যায়নি";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

// DELETE /api/trash/[id] — permanent delete (files on disk are removed too)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await permanentDeleteTrashItem(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/trash/[id] error:", error);
    return NextResponse.json({ error: "চিরতরে মুছে ফেলা যায়নি" }, { status: 500 });
  }
}
