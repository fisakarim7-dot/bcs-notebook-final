import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["unread", "reading", "noted", "mcq", "weak", "mastered"];
const STRENGTHS = ["very_weak", "weak", "medium", "strong", "very_strong"];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      status?: string;
      strength?: string;
      notes?: string;
      nodeId?: string | null;
    };
    const data: Record<string, unknown> = {};
    if (typeof body.status === "string" && STATUSES.includes(body.status)) data.status = body.status;
    // strength: one of the 5 levels, or "" to clear
    if (typeof body.strength === "string" && (body.strength === "" || STRENGTHS.includes(body.strength)))
      data.strength = body.strength;
    if (typeof body.notes === "string") data.notes = body.notes.slice(0, 4000);
    if (body.nodeId !== undefined) data.nodeId = body.nodeId || null;
    const row = await db.syllabusItem.update({ where: { id }, data });
    return NextResponse.json({
      item: { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() },
    });
  } catch (error) {
    console.error("PATCH /api/syllabus/[id]", error);
    return NextResponse.json({ error: "সিলেবাস আপডেট হয়নি" }, { status: 500 });
  }
}
