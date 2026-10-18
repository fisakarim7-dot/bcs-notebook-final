import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  computeNotifications,
  parseNotifSettings,
} from "@/lib/bcs-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/notifications — computed notifications + unread state + settings
export async function GET() {
  try {
    const row = await db.appSetting.findUnique({ where: { id: "app" } });
    const settings = parseNotifSettings(row?.notifSettings);
    const items = await computeNotifications(settings);
    const readRows = await db.notificationRead.findMany({ select: { fingerprint: true } });
    const readSet = new Set(readRows.map((r) => r.fingerprint));
    const unreadCount = items.filter((i) => !readSet.has(i.id)).length;
    return NextResponse.json(
      {
        items,
        unreadCount,
        settings,
        generatedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("GET /api/notifications error:", error);
    return NextResponse.json({ error: "নোটিফিকেশন লোড করা যায়নি" }, { status: 500 });
  }
}

// PUT /api/notifications — save the notification settings (configurable system)
export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { settings?: unknown };
    // validate through the parser (round-trip: serialize → parse → normalize)
    const raw = JSON.stringify(body.settings ?? {});
    const normalized = parseNotifSettings(raw);
    await db.appSetting.upsert({
      where: { id: "app" },
      update: { notifSettings: JSON.stringify(normalized) },
      create: { id: "app", notifSettings: JSON.stringify(normalized) },
    });
    const items = await computeNotifications(normalized);
    const readRows = await db.notificationRead.findMany({ select: { fingerprint: true } });
    const readSet = new Set(readRows.map((r) => r.fingerprint));
    return NextResponse.json({
      ok: true,
      settings: normalized,
      items,
      unreadCount: items.filter((i) => !readSet.has(i.id)).length,
    });
  } catch (error) {
    console.error("PUT /api/notifications error:", error);
    return NextResponse.json({ error: "সেটিংস সংরক্ষণ করা যায়নি" }, { status: 500 });
  }
}
