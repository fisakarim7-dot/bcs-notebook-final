import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// POST /api/plan/day — set or clear the ✅ সফল / ❌ ব্যর্থ mark of a day
// body: { date, status: "success" | "fail" | null }
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { date?: string; status?: string | null };
    const date = (body.date ?? "").trim();

    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: "সঠিক তারিখ দিন (YYYY-MM-DD)" }, { status: 400 });
    }

    if (body.status === null || body.status === "" || body.status === undefined) {
      await db.dayStatus.deleteMany({ where: { date } });
      return NextResponse.json({ ok: true, status: null });
    }

    const status = body.status === "success" ? "success" : body.status === "fail" ? "fail" : null;
    if (!status) {
      return NextResponse.json({ error: "status হতে হবে success | fail | null" }, { status: 400 });
    }

    await db.dayStatus.upsert({
      where: { date },
      create: { date, status },
      update: { status },
    });

    return NextResponse.json({ ok: true, status });
  } catch (error) {
    console.error("POST /api/plan/day error:", error);
    return NextResponse.json({ error: "দিনের স্ট্যাটাস সেভ করা যায়নি" }, { status: 500 });
  }
}
