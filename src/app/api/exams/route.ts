import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MAX_EXAMS = 3;

// GET /api/exams — all exam countdowns (sorted by exam date)
export async function GET() {
  try {
    const exams = await db.examCountdown.findMany({
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ exams });
  } catch (error) {
    console.error("GET /api/exams error:", error);
    return NextResponse.json({ error: "পরীক্ষার তালিকা লোড করা যায়নি" }, { status: 500 });
  }
}

// POST /api/exams — add one (cap: 3, server-enforced)
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: string;
      date?: string;
      note?: string;
    };

    const title = (body.title ?? "").trim();
    const date = (body.date ?? "").trim();

    if (!title) {
      return NextResponse.json({ error: "পরীক্ষার নাম লিখুন" }, { status: 400 });
    }
    if (!DATE_RE.test(date)) {
      return NextResponse.json({ error: "সঠিক তারিখ দিন (YYYY-MM-DD)" }, { status: 400 });
    }

    const count = await db.examCountdown.count();
    if (count >= MAX_EXAMS) {
      return NextResponse.json(
        { error: "সর্বোচ্চ ৩টি পরীক্ষার কাউন্টডাউন সেট করা যায় — আগে একটি মুছুন" },
        { status: 400 }
      );
    }

    const exam = await db.examCountdown.create({
      data: {
        title: title.slice(0, 160),
        date,
        note: (body.note ?? "").trim().slice(0, 300),
      },
    });

    return NextResponse.json({ exam }, { status: 201 });
  } catch (error) {
    console.error("POST /api/exams error:", error);
    return NextResponse.json({ error: "পরীক্ষা যোগ করা যায়নি" }, { status: 500 });
  }
}
