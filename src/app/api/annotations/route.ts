import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const annSchema = z.object({
  id: z.string().min(1).max(64),
  // "underline" is additive (PDF reader only) — widening this enum cannot
  // affect existing payloads or the HTML/Word annotator, which never emits it.
  type: z.enum(["highlight", "bold", "italic", "color", "underline"]),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{3,8}$/)
    .optional(),
  text: z.string().min(1).max(5000),
  prefix: z.string().max(300).default(""),
  suffix: z.string().max(300).default(""),
  occurrence: z.number().int().min(0).max(100000).default(0),
  page: z.number().int().min(1).max(100000).optional(),
});

const bodySchema = z.object({
  kind: z.enum(["document", "note-item"]),
  targetId: z.string().min(1).max(64),
  payload: z.array(annSchema).max(5000),
});

// GET /api/annotations?kind=document&targetId=xxx
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const targetId = url.searchParams.get("targetId");
    if (!targetId || (kind !== "document" && kind !== "note-item")) {
      return NextResponse.json(
        { error: "kind (document|note-item) এবং targetId দিতে হবে" },
        { status: 400 }
      );
    }
    const row = await db.annotation.findUnique({
      where: { kind_targetId: { kind, targetId } },
    });
    let payload: unknown[] = [];
    if (row) {
      try {
        const parsed = JSON.parse(row.payload);
        if (Array.isArray(parsed)) payload = parsed;
      } catch {
        payload = [];
      }
    }
    return NextResponse.json(
      { payload },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("GET /api/annotations error:", error);
    return NextResponse.json(
      { error: "অ্যানোটেশন লোড করা যায়নি" },
      { status: 500 }
    );
  }
}

// PUT /api/annotations — upsert the full annotation payload for one target
export async function PUT(request: Request) {
  try {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "ভুল অ্যানোটেশন ডেটা" },
        { status: 400 }
      );
    }
    const { kind, targetId, payload } = parsed.data;
    if (JSON.stringify(payload).length > 1_500_000) {
      return NextResponse.json({ error: "অ্যানোটেশন খুব বড়" }, { status: 413 });
    }
    const row = await db.annotation.upsert({
      where: { kind_targetId: { kind, targetId } },
      create: { kind, targetId, payload: JSON.stringify(payload) },
      update: { payload: JSON.stringify(payload) },
      select: { updatedAt: true },
    });
    return NextResponse.json({ ok: true, updatedAt: row.updatedAt.toISOString() });
  } catch (error) {
    console.error("PUT /api/annotations error:", error);
    return NextResponse.json(
      { error: "অ্যানোটেশন সংরক্ষণ করা যায়নি" },
      { status: 500 }
    );
  }
}
