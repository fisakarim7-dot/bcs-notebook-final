import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// All dates are "YYYY-MM-DD" strings. The user is UTC+6 (Asia/Dhaka) —
// shift the clock 6h so "today" never flips early in the evening.
function dhakaToday(): string {
  const d = new Date(Date.now() + 6 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// GET /api/plan?month=YYYY-MM — month items + statuses (incl. 91-day heatmap window) + stats
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const monthParam = url.searchParams.get("month");
    const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : dhakaToday().slice(0, 7);

    const [items, statuses] = await Promise.all([
      db.planItem.findMany({
        where: { date: { startsWith: month } },
        orderBy: [{ date: "asc" }, { createdAt: "asc" }],
      }),
      db.dayStatus.findMany(),
    ]);

    const statusMap: Record<string, string> = {};
    for (const s of statuses) statusMap[s.date] = s.status;

    // ---- stats ----
    const today = dhakaToday();
    const sortedSuccess = statuses
      .filter((s) => s.status === "success")
      .map((s) => s.date)
      .sort();

    // current streak: consecutive successes ending today (or yesterday if today unmarked)
    let currentStreak = 0;
    if (sortedSuccess.includes(today)) {
      currentStreak = 1;
      let cursor = today;
      for (;;) {
        const prev = addDays(cursor, -1);
        if (sortedSuccess.includes(prev)) {
          currentStreak += 1;
          cursor = prev;
        } else break;
      }
    } else if (sortedSuccess.includes(addDays(today, -1))) {
      currentStreak = 1;
      let cursor = addDays(today, -1);
      for (;;) {
        const prev = addDays(cursor, -1);
        if (sortedSuccess.includes(prev)) {
          currentStreak += 1;
          cursor = prev;
        } else break;
      }
    }

    // best streak: longest consecutive run
    let bestStreak = 0;
    let run = 0;
    let prevDate: string | null = null;
    for (const d of sortedSuccess) {
      run = prevDate && addDays(prevDate, 1) === d ? run + 1 : 1;
      bestStreak = Math.max(bestStreak, run);
      prevDate = d;
    }

    // Bangladesh-style week (starts Saturday). offset: Sat→0, Sun→1, … Fri→6
    function weekStart(dateStr: string): string {
      const d = new Date(dateStr + "T00:00:00Z");
      const offset = (d.getUTCDay() + 1) % 7;
      return addDays(dateStr, -offset);
    }

    // last 8 weeks bars
    const thisWeek = weekStart(today);
    const weeks: { start: string; success: number; fail: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const start = addDays(thisWeek, -7 * i);
      let success = 0;
      let fail = 0;
      for (let j = 0; j < 7; j++) {
        const st = statusMap[addDays(start, j)];
        if (st === "success") success += 1;
        else if (st === "fail") fail += 1;
      }
      weeks.push({ start, success, fail });
    }

    // rolling 8-week window — each bar is a 7-day bucket ENDING today;
    // the whole window slides one day every day (last bar always reaches "today",
    // tomorrow it reaches tomorrow — never goes stale). After 8 weeks the
    // entire window has shifted onto the next 8 weeks, and it keeps rolling.
    const rollingWeeks: { start: string; end: string; success: number; fail: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const end = addDays(today, -7 * i);
      const start = addDays(end, -6);
      let success = 0;
      let fail = 0;
      for (let j = 0; j < 7; j++) {
        const st = statusMap[addDays(start, j)];
        if (st === "success") success += 1;
        else if (st === "fail") fail += 1;
      }
      rollingWeeks.push({ start, end, success, fail });
    }

    // 91-day heatmap window
    const heatmapStart = addDays(today, -90);
    const heatmap: { date: string; status: string | null }[] = [];
    for (let i = 0; i <= 90; i++) {
      const d = addDays(heatmapStart, i);
      heatmap.push({ date: d, status: statusMap[d] ?? null });
    }

    const successDays = sortedSuccess.length;
    const failDays = statuses.filter((s) => s.status === "fail").length;
    const markedDays = successDays + failDays;

    // planned item totals (whole app)
    const [totalItems, doneItems] = await Promise.all([
      db.planItem.count(),
      db.planItem.count({ where: { done: true } }),
    ]);

    return NextResponse.json({
      month,
      items,
      statusMap,
      stats: {
        today,
        currentStreak,
        bestStreak,
        weeks,
        rollingWeeks,
        heatmap,
        successDays,
        failDays,
        markedDays,
        successRate: markedDays ? Math.round((successDays / markedDays) * 100) : 0,
        thisWeekSuccess: weeks[weeks.length - 1]?.success ?? 0,
        totalItems,
        doneItems,
      },
    });
  } catch (error) {
    console.error("GET /api/plan error:", error);
    return NextResponse.json({ error: "ক্যালেন্ডার ডেটা লোড করা যায়নি" }, { status: 500 });
  }
}

// POST /api/plan — add a planned item to a day
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      date?: string;
      kind?: string;
      targetId?: string | null;
      title?: string;
      path?: string;
      meta?: Record<string, unknown> | string;
    };

    const date = (body.date ?? "").trim();
    const title = (body.title ?? "").trim();
    const kind = (body.kind ?? "custom").trim();

    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: "সঠিক তারিখ দিন (YYYY-MM-DD)" }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ error: "আইটেমের নাম প্রয়োজন" }, { status: 400 });
    }

    const meta =
      typeof body.meta === "string"
        ? body.meta.slice(0, 2000)
        : JSON.stringify(body.meta ?? {}).slice(0, 2000);

    const item = await db.planItem.create({
      data: {
        date,
        kind: kind.slice(0, 32),
        targetId: body.targetId ? body.targetId.slice(0, 128) : null,
        title: title.slice(0, 300),
        path: (body.path ?? "").slice(0, 600),
        meta,
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("POST /api/plan error:", error);
    return NextResponse.json({ error: "প্ল্যান যোগ করা যায়নি" }, { status: 500 });
  }
}
