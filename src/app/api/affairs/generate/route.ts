import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callLlm, extractJsonObject } from "@/lib/bcs-ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { text?: string; date?: string };
    const text = (body.text ?? "").trim();
    if (text.length < 20) {
      return NextResponse.json({ error: "কমপক্ষে কয়েক লাইন খবর/নোট দিন" }, { status: 400 });
    }
    const { content } = await callLlm(
      [
        {
          role: "system",
          content: `You are a BCS current-affairs coach for Bangladesh. From the news text, produce ONLY JSON:
{"title":"...","summary":"3-5 sentences","category":"bangladesh|international|economy|science","factLines":["fact1","fact2","fact3"],"mcqQuestion":"...","mcqOptions":["a","b","c","d"],"mcqCorrect":0}
Write in Bengali. Facts must be exam-relevant (dates, numbers, names, institutions).`,
        },
        { role: "user", content: text.slice(0, 8000) },
      ],
      90_000
    );
    const parsed = extractJsonObject(content) as {
      title?: string;
      summary?: string;
      category?: string;
      factLines?: unknown;
      mcqQuestion?: string;
      mcqOptions?: unknown;
      mcqCorrect?: number;
    };
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "")
      ? body.date!
      : new Date().toISOString().slice(0, 10);
    const facts = Array.isArray(parsed.factLines) ? parsed.factLines.map(String).slice(0, 5) : [];
    const opts = Array.isArray(parsed.mcqOptions) ? parsed.mcqOptions.map(String).slice(0, 4) : [];
    const row = await db.currentAffair.create({
      data: {
        date,
        title: String(parsed.title ?? "কারেন্ট অ্যাফেয়ার্স").slice(0, 240),
        summary: String(parsed.summary ?? "").slice(0, 4000),
        category: String(parsed.category ?? "bangladesh").slice(0, 40),
        factLines: JSON.stringify(facts),
        mcqQuestion: String(parsed.mcqQuestion ?? "").slice(0, 800),
        mcqOptions: JSON.stringify(opts),
        mcqCorrect: Number.isInteger(parsed.mcqCorrect) ? (parsed.mcqCorrect as number) : 0,
        source: "ai",
      },
    });
    return NextResponse.json({
      item: {
        ...row,
        factLines: facts,
        mcqOptions: opts,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("POST /api/affairs/generate", error);
    const message = error instanceof Error ? error.message : "জেনারেশন ব্যর্থ";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
