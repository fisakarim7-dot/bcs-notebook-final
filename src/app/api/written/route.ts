import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toDTO(r: {
  id: string;
  questionId: string | null;
  title: string;
  kind: string;
  promptHtml: string;
  answerHtml: string;
  marks: number;
  minutes: number;
  secondsUsed: number;
  aiFeedback: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function GET() {
  try {
    const rows = await db.writtenAttempt.findMany({ orderBy: { createdAt: "desc" }, take: 80 });
    return NextResponse.json({ attempts: rows.map(toDTO) });
  } catch (error) {
    console.error("GET /api/written", error);
    return NextResponse.json({ error: "লিখিত অনুশীলন লোড হয়নি" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      title?: string;
      kind?: string;
      promptHtml?: string;
      answerHtml?: string;
      marks?: number;
      minutes?: number;
      questionId?: string | null;
    };
    const title = (body.title ?? "").trim() || "লিখিত অনুশীলন";
    const kind = ["essay", "precis", "translation", "report", "custom"].includes(body.kind ?? "")
      ? body.kind!
      : "essay";
    const marks = Math.min(200, Math.max(5, Math.round(Number(body.marks) || 10)));
    const minutes = Math.min(240, Math.max(5, Math.round(Number(body.minutes) || 20)));
    const row = await db.writtenAttempt.create({
      data: {
        title: title.slice(0, 200),
        kind,
        promptHtml: (body.promptHtml ?? "").slice(0, 200_000),
        answerHtml: (body.answerHtml ?? "").slice(0, 500_000),
        marks,
        minutes,
        questionId: body.questionId || null,
        status: "draft",
      },
    });
    return NextResponse.json({ attempt: toDTO(row) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/written", error);
    return NextResponse.json({ error: "লিখিত অনুশীলন তৈরি হয়নি" }, { status: 500 });
  }
}
