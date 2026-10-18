import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { McqDTO } from "@/lib/bcs-types";
import { normalizeTags, parseTags } from "@/lib/bcs-tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toMcqDTO(m: {
  id: string;
  nodeId: string | null;
  nodePath: string | null;
  studyNodeId: string | null;
  studyNodePath: string | null;
  question: string;
  options: string;
  correctIndex: number;
  explanation: string;
  explanationHtml: string;
  favorite: boolean;
  readLater: boolean;
  attempts: number;
  correctCount: number;
  wrongCount: number;
  lastResult: string | null;
  lastAttemptAt: Date | null;
  inWrongBook: boolean;
  suspended: boolean;
  source: string;
  tags: string;
  createdAt: Date;
  updatedAt: Date;
}): McqDTO {
  let options: string[] = [];
  try {
    const parsed: unknown = JSON.parse(m.options);
    if (Array.isArray(parsed)) {
      options = parsed.map(String).filter((s) => s.trim().length > 0);
    }
  } catch {
    options = [];
  }
  return {
    id: m.id,
    nodeId: m.nodeId,
    nodePath: m.nodePath,
    studyNodeId: m.studyNodeId,
    studyNodePath: m.studyNodePath,
    question: m.question,
    options,
    correctIndex: m.correctIndex,
    explanation: m.explanation,
    explanationHtml: m.explanationHtml,
    favorite: m.favorite,
    readLater: m.readLater,
    attempts: m.attempts,
    correctCount: m.correctCount,
    wrongCount: m.wrongCount,
    lastResult: m.lastResult,
    lastAttemptAt: m.lastAttemptAt ? m.lastAttemptAt.toISOString() : null,
    inWrongBook: m.inWrongBook,
    suspended: m.suspended,
    source: m.source,
    tags: parseTags(m.tags),
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

function validateOptions(raw: unknown): { options: string[] } | { error: string } {
  if (!Array.isArray(raw)) return { error: "options একটি তালিকা হতে হবে" };
  const options = raw.map((o) => String(o ?? "").trim()).filter((o) => o.length > 0);
  if (options.length < 2 || options.length > 6) {
    return { error: "২টি থেকে ৬টি অপশন দিন" };
  }
  return { options };
}

// GET /api/mcqs                 → all questions (bank)
// GET /api/mcqs?mode=wrongbook  → only questions currently in the wrong book
export async function GET(req: Request) {
  try {
    const mode = new URL(req.url).searchParams.get("mode");
    const where =
      mode === "wrongbook" ? { inWrongBook: true, suspended: false } : {};
    const mcqs = await db.mcq.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ mcqs: mcqs.map(toMcqDTO), count: mcqs.length });
  } catch (error) {
    console.error("GET /api/mcqs error:", error);
    return NextResponse.json({ error: "MCQ লোড করা যায়নি" }, { status: 500 });
  }
}

// POST /api/mcqs — create one question
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      question?: string;
      options?: unknown;
      correctIndex?: number;
      explanation?: string;
      explanationHtml?: string;
      nodeId?: string | null;
      nodePath?: string | null;
      studyNodeId?: string | null;
      studyNodePath?: string | null;
      source?: string;
      tags?: unknown;
    };
    const question = (body.question ?? "").trim();
    if (!question) {
      return NextResponse.json({ error: "প্রশ্ন লিখুন" }, { status: 400 });
    }
    const v = validateOptions(body.options);
    if ("error" in v) {
      return NextResponse.json({ error: v.error }, { status: 400 });
    }
    let correctIndex = Number.isInteger(body.correctIndex) ? (body.correctIndex as number) : 0;
    if (correctIndex < 0 || correctIndex >= v.options.length) correctIndex = 0;

    const mcq = await db.mcq.create({
      data: {
        question: question.slice(0, 1200),
        options: JSON.stringify(v.options),
        correctIndex,
        explanation: (body.explanation ?? "").trim().slice(0, 8000),
        explanationHtml: (body.explanationHtml ?? "").slice(0, 200_000),
        nodeId: body.nodeId || null,
        nodePath: body.nodePath || null,
        studyNodeId: body.studyNodeId || null,
        studyNodePath: body.studyNodePath || null,
        source: body.source === "ai" ? "ai" : "manual",
        tags: JSON.stringify(normalizeTags(body.tags)),
      },
    });
    return NextResponse.json({ mcq: toMcqDTO(mcq) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/mcqs error:", error);
    return NextResponse.json({ error: "MCQ তৈরি করা যায়নি" }, { status: 500 });
  }
}
