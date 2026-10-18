import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/notifications/read — mark fingerprints as read.
// Body: { all: true } marks everything; or { fingerprints: string[] }.
// NOTE: SQLite createMany does NOT support skipDuplicates — dedupe manually.
async function markReadMany(fingerprints: string[]): Promise<number> {
  if (!fingerprints.length) return 0;
  const existing = await db.notificationRead.findMany({
    where: { fingerprint: { in: fingerprints } },
    select: { fingerprint: true },
  });
  const have = new Set(existing.map((e) => e.fingerprint));
  const fresh = fingerprints.filter((f) => !have.has(f));
  if (!fresh.length) return 0;
  await db.notificationRead.createMany({ data: fresh.map((f) => ({ fingerprint: f })) });
  return fresh.length;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      all?: boolean;
      fingerprints?: string[];
    };

    if (body.all) {
      // nothing to compute — the client marks the whole current list as read
      const { computeNotifications, parseNotifSettings } = await import("@/lib/bcs-notifications");
      const row = await db.appSetting.findUnique({ where: { id: "app" } });
      const settings = parseNotifSettings(row?.notifSettings);
      const items = await computeNotifications(settings);
      const marked = await markReadMany(items.map((i) => i.id));
      return NextResponse.json({ ok: true, marked });
    }

    const fingerprints = (body.fingerprints ?? []).filter((f) => typeof f === "string").slice(0, 200);
    const marked = await markReadMany(fingerprints);
    return NextResponse.json({ ok: true, marked });
  } catch (error) {
    console.error("POST /api/notifications/read error:", error);
    return NextResponse.json({ error: "পড়া হিসেবে চিহ্নিত করা যায়নি" }, { status: 500 });
  }
}
