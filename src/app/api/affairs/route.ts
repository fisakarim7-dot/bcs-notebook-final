import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseArr(raw: string): string[] {
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.map(String) : [];
  } catch {
    return [];
  }
}

function toDTO(r: {
  id: string;
  date: string;
  title: string;
  summary: string;
  category: string;
  factLines: string;
  mcqQuestion: string;
  mcqOptions: string;
  mcqCorrect: number;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    date: r.date,
    title: r.title,
    summary: r.summary,
    category: r.category,
    factLines: parseArr(r.factLines),
    mcqQuestion: r.mcqQuestion,
    mcqOptions: parseArr(r.mcqOptions),
    mcqCorrect: r.mcqCorrect,
    source: r.source,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function GET(req: Request) {
  try {
    const month = new URL(req.url).searchParams.get("month"); // YYYY-MM
    const where = month ? { date: { startsWith: month } } : {};
    const rows = await db.currentAffair.findMany({
      where,
      orderBy: { date: "desc" },
      take: 200,
    });
    return NextResponse.json({ items: rows.map(toDTO) });
  } catch (error) {
    console.error("GET /api/affairs", error);
    return NextResponse.json({ error: "কারেন্ট অ্যাফেয়ার্স লোড হয়নি" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      date?: string;
      title?: string;
      summary?: string;
      category?: string;
      factLines?: unknown;
      mcqQuestion?: string;
      mcqOptions?: unknown;
      mcqCorrect?: number;
      source?: string;
    };
    const title = (body.title ?? "").trim();
    if (!title) return NextResponse.json({ error: "শিরোনাম দিন" }, { status: 400 });
    const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date ?? "")
      ? body.date!
      : new Date().toISOString().slice(0, 10);
    const facts = Array.isArray(body.factLines) ? body.factLines.map(String).slice(0, 6) : [];
    const opts = Array.isArray(body.mcqOptions) ? body.mcqOptions.map(String).slice(0, 6) : [];
    const row = await db.currentAffair.create({
      data: {
        date,
        title: title.slice(0, 240),
        summary: (body.summary ?? "").slice(0, 4000),
        category: (body.category ?? "bangladesh").slice(0, 40),
        factLines: JSON.stringify(facts),
        mcqQuestion: (body.mcqQuestion ?? "").slice(0, 800),
        mcqOptions: JSON.stringify(opts),
        mcqCorrect: Number.isInteger(body.mcqCorrect) ? (body.mcqCorrect as number) : 0,
        source: body.source === "ai" ? "ai" : "manual",
      },
    });
    return NextResponse.json({ item: toDTO(row) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/affairs", error);
    return NextResponse.json({ error: "এন্ট্রি সেভ হয়নি" }, { status: 500 });
  }
}
