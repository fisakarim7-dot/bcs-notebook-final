import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeTags } from "@/lib/bcs-tags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Incoming {
  question?: string;
  options?: unknown;
  correctIndex?: number;
  explanation?: string;
  tags?: unknown;
  studyNodeId?: string | null;
  studyNodePath?: string | null;
}

// POST /api/mcqs/import  { items: Incoming[], tag?: string }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { items?: Incoming[]; tag?: string };
    const items = Array.isArray(body.items) ? body.items : [];
    if (items.length === 0) {
      return NextResponse.json({ error: "ইমপোর্ট করার মতো প্রশ্ন নেই" }, { status: 400 });
    }
    if (items.length > 500) {
      return NextResponse.json({ error: "একবারে সর্বোচ্চ ৫০০টি" }, { status: 400 });
    }
    const extraTag = (body.tag ?? "").trim();
    let created = 0;
    let skipped = 0;
    for (const raw of items) {
      const question = String(raw.question ?? "").trim();
      const options = Array.isArray(raw.options)
        ? raw.options.map((o) => String(o ?? "").trim()).filter((o) => o.length > 0)
        : [];
      if (!question || options.length < 2) {
        skipped += 1;
        continue;
      }
      let ci = Number(raw.correctIndex);
      if (!Number.isInteger(ci) || ci < 0 || ci >= options.length) ci = 0;
      const tags = normalizeTags(raw.tags);
      if (extraTag && !tags.map((t) => t.toLowerCase()).includes(extraTag.toLowerCase())) {
        tags.push(extraTag);
      }
      await db.mcq.create({
        data: {
          question: question.slice(0, 1200),
          options: JSON.stringify(options.slice(0, 6)),
          correctIndex: ci,
          explanation: String(raw.explanation ?? "").slice(0, 8000),
          studyNodeId: raw.studyNodeId || null,
          studyNodePath: raw.studyNodePath || null,
          source: "manual",
          tags: JSON.stringify(tags),
        },
      });
      created += 1;
    }
    return NextResponse.json({ ok: true, created, skipped });
  } catch (error) {
    console.error("POST /api/mcqs/import", error);
    return NextResponse.json({ error: "ইমপোর্ট ব্যর্থ" }, { status: 500 });
  }
}
