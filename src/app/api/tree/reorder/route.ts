import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/tree/reorder { items: [{id, order}] } — sibling order only, no parent change. */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { items?: { id?: string; order?: number }[] };
    const items = Array.isArray(body.items) ? body.items : [];
    for (const it of items) {
      if (!it.id || typeof it.order !== "number") continue;
      await db.treeNode.update({
        where: { id: it.id },
        data: { order: Math.round(it.order) },
      }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/tree/reorder", error);
    return NextResponse.json({ error: "ক্রম সেভ হয়নি" }, { status: 500 });
  }
}
