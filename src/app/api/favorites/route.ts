import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = ["noteItem", "document", "link", "question", "node"] as const;
type FavKind = (typeof KINDS)[number];

function isKind(v: unknown): v is FavKind {
  return typeof v === "string" && (KINDS as readonly string[]).includes(v);
}

// GET /api/favorites — every 💜 in the app (grouped client-side)
export async function GET() {
  try {
    const favorites = await db.favorite.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ favorites, count: favorites.length });
  } catch (error) {
    console.error("GET /api/favorites error:", error);
    return NextResponse.json({ error: "প্রিয় তালিকা লোড করা যায়নি" }, { status: 500 });
  }
}

// POST /api/favorites — toggle a 💜 for any content item
// body: { kind, targetId, title?, path?, meta? }
// returns { favorited: boolean }
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      kind?: string;
      targetId?: string;
      title?: string;
      path?: string;
      meta?: Record<string, unknown> | string;
    };

    if (!isKind(body.kind) || !body.targetId) {
      return NextResponse.json({ error: "kind ও targetId প্রয়োজন" }, { status: 400 });
    }
    const kind = body.kind;
    const targetId = body.targetId.slice(0, 128);

    const existing = await db.favorite.findUnique({
      where: { kind_targetId: { kind, targetId } },
    });

    if (existing) {
      await db.favorite.delete({ where: { id: existing.id } });
      return NextResponse.json({ favorited: false });
    }

    const meta =
      typeof body.meta === "string"
        ? body.meta.slice(0, 2000)
        : JSON.stringify(body.meta ?? {}).slice(0, 2000);

    await db.favorite.create({
      data: {
        kind,
        targetId,
        title: (body.title ?? "").slice(0, 300),
        path: (body.path ?? "").slice(0, 600),
        meta,
      },
    });
    return NextResponse.json({ favorited: true });
  } catch (error) {
    console.error("POST /api/favorites error:", error);
    return NextResponse.json({ error: "প্রিয় সেভ করা যায়নি" }, { status: 500 });
  }
}
