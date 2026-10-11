import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callLlm, extractJsonObject, stripHtml } from "@/lib/bcs-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const row = await db.writtenAttempt.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ error: "অনুশীলন পাওয়া যায়নি" }, { status: 404 });
    const prompt = stripHtml(row.promptHtml).slice(0, 4000);
    const answer = stripHtml(row.answerHtml).slice(0, 8000);
    if (!answer) return NextResponse.json({ error: "আগে উত্তর লিখুন" }, { status: 400 });

    const { content } = await callLlm(
      [
        {
          role: "system",
          content: `You are a BCS written-exam examiner in Bangladesh. Score the answer out of the given marks.
Respond ONLY JSON:
{"band":"A+|A|B+|B|C|D","score":0,"structure":0,"facts":0,"language":0,"comments":["..."],"improvements":["..."]}
- score is 0..marks (number). structure/facts/language are 0..10.
- Write comments and improvements in the SAME language as the answer (usually Bengali).
- Be strict but fair, like BPSC.`,
        },
        {
          role: "user",
          content: `Kind: ${row.kind}\nMarks: ${row.marks}\nQuestion:\n${prompt || row.title}\n\nAnswer:\n${answer}`,
        },
      ],
      120_000
    );
    const parsed = extractJsonObject(content);
    const feedback = JSON.stringify(parsed);
    const updated = await db.writtenAttempt.update({
      where: { id },
      data: { aiFeedback: feedback.slice(0, 20_000), status: "evaluated" },
    });
    return NextResponse.json({
      attempt: {
        ...updated,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
      feedback: parsed,
    });
  } catch (error) {
    console.error("POST /api/written/[id]/evaluate", error);
    const message = error instanceof Error ? error.message : "মূল্যায়ন ব্যর্থ";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
