import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// PATCH /api/exams/[id] — rename / reschedule / edit note
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      title?: string;
      date?: string;
      note?: string;
    };

    const data: { title?: string; date?: string; note?: string } = {};
    if (body.title !== undefined) {
      const title = body.title.trim();
      if (!title) {
        return NextResponse.json({ error: "পরীক্ষার নাম লিখুন" }, { status: 400 });
      }
      data.title = title.slice(0, 160);
    }
    if (body.date !== undefined) {
      if (!DATE_RE.test(body.date)) {
        return NextResponse.json({ error: "সঠিক তারিখ দিন (YYYY-MM-DD)" }, { status: 400 });
      }
      data.date = body.date;
    }
    if (body.note !== undefined) {
      data.note = body.note.trim().slice(0, 300);
    }

    const exam = await db.examCountdown.update({ where: { id }, data });
    return NextResponse.json({ exam });
  } catch (error) {
    console.error("PATCH /api/exams/[id] error:", error);
    return NextResponse.json({ error: "পরীক্ষা আপডেট করা যায়নি" }, { status: 500 });
  }
}

// DELETE /api/exams/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.examCountdown.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/exams/[id] error:", error);
    return NextResponse.json({ error: "পরীক্ষা মুছে ফেলা যায়নি" }, { status: 500 });
  }
}
