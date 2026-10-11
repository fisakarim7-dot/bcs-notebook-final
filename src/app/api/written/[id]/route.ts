import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      title?: string;
      promptHtml?: string;
      answerHtml?: string;
      secondsUsed?: number;
      status?: string;
    };
    const data: Record<string, unknown> = {};
    if (typeof body.title === "string") data.title = body.title.trim().slice(0, 200);
    if (typeof body.promptHtml === "string") data.promptHtml = body.promptHtml.slice(0, 200_000);
    if (typeof body.answerHtml === "string") data.answerHtml = body.answerHtml.slice(0, 500_000);
    if (typeof body.secondsUsed === "number") data.secondsUsed = Math.max(0, Math.round(body.secondsUsed));
    if (typeof body.status === "string" && ["draft", "submitted", "evaluated"].includes(body.status)) {
      data.status = body.status;
    }
    const row = await db.writtenAttempt.update({ where: { id }, data });
    return NextResponse.json({
      attempt: { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() },
    });
  } catch (error) {
    console.error("PATCH /api/written/[id]", error);
    return NextResponse.json({ error: "সেভ হয়নি" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.writtenAttempt.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/written/[id]", error);
    return NextResponse.json({ error: "মুছা যায়নি" }, { status: 500 });
  }
}
