import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// PATCH /api/plan/[id] — toggle done / move to another day
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as { done?: boolean; date?: string };

    const data: { done?: boolean; date?: string } = {};
    if (body.done !== undefined) data.done = !!body.done;
    if (body.date !== undefined) {
      if (!DATE_RE.test(body.date)) {
        return NextResponse.json({ error: "সঠিক তারিখ দিন (YYYY-MM-DD)" }, { status: 400 });
      }
      data.date = body.date;
    }

    await db.planItem.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/plan/[id] error:", error);
    return NextResponse.json({ error: "প্ল্যান আইটেম আপডেট করা যায়নি" }, { status: 500 });
  }
}

// DELETE /api/plan/[id]
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.planItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/plan/[id] error:", error);
    return NextResponse.json({ error: "প্ল্যান আইটেম মুছে ফেলা যায়নি" }, { status: 500 });
  }
}
