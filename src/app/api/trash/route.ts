import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emptyTrash, autoPurgeTrash } from "@/lib/bcs-trash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/trash — list trashed items (newest first) + settings + counts.
// Applies the configured auto-purge (trashAutoPurgeDays > 0) before listing.
export async function GET() {
  try {
    const settings = await db.appSetting.findUnique({ where: { id: "app" } });
    const autoPurgeDays = settings?.trashAutoPurgeDays ?? 0;
    const purged = await autoPurgeTrash(autoPurgeDays);

    const items = await db.trashItem.findMany({
      orderBy: { deletedAt: "desc" },
      select: {
        id: true,
        kind: true,
        refId: true,
        title: true,
        path: true,
        summary: true,
        sizeBytes: true,
        deletedAt: true,
      },
    });

    const byKind: Record<string, number> = {};
    let totalBytes = 0;
    for (const it of items) {
      byKind[it.kind] = (byKind[it.kind] ?? 0) + 1;
      totalBytes += it.sizeBytes;
    }

    return NextResponse.json(
      {
        items: items.map((i) => ({ ...i, deletedAt: i.deletedAt.toISOString() })),
        count: items.length,
        byKind,
        totalBytes,
        autoPurgeDays,
        purgedNow: purged,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("GET /api/trash error:", error);
    return NextResponse.json({ error: "ট্র্যাশ লোড করা যায়নি" }, { status: 500 });
  }
}

// DELETE /api/trash — empty the whole trash permanently.
export async function DELETE() {
  try {
    const removed = await emptyTrash();
    return NextResponse.json({ ok: true, removed });
  } catch (error) {
    console.error("DELETE /api/trash error:", error);
    return NextResponse.json({ error: "ট্র্যাশ খালি করা যায়নি" }, { status: 500 });
  }
}

// PATCH /api/trash — configure auto-purge (0 = keep forever)
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { autoPurgeDays?: number };
    let days = Number(body.autoPurgeDays);
    if (!Number.isFinite(days)) days = 0;
    days = Math.max(0, Math.min(365, Math.round(days)));
    await db.appSetting.upsert({
      where: { id: "app" },
      update: { trashAutoPurgeDays: days },
      create: { id: "app", trashAutoPurgeDays: days },
    });
    return NextResponse.json({ ok: true, autoPurgeDays: days });
  } catch (error) {
    console.error("PATCH /api/trash error:", error);
    return NextResponse.json({ error: "সেটিংস সংরক্ষণ করা যায়নি" }, { status: 500 });
  }
}
