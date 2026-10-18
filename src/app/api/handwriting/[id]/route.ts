import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKGROUNDS = ["blank", "ruled", "grid", "dotted"];
const MAX_PAGES = 200;
const MAX_STROKES_PER_PAGE = 2000;
const MAX_POINTS_PER_STROKE = 5000;

/** Strokes payload যাচাই — ভাঙা/দূষিত ডেটা DB-তে ঢুকতে দেব না */
function sanitizePages(input: unknown): string | null {
  if (!Array.isArray(input) || input.length > MAX_PAGES) return null;
  const pages: Array<Array<Record<string, unknown>>> = [];
  for (const page of input) {
    if (!Array.isArray(page) || page.length > MAX_STROKES_PER_PAGE) return null;
    const strokes: Array<Record<string, unknown>> = [];
    for (const s of page) {
      if (typeof s !== "object" || s === null) return null;
      const st = s as Record<string, unknown>;
      const tool = st.tool === "highlighter" ? "highlighter" : "pen";
      const color = typeof st.color === "string" && /^#[0-9a-fA-F]{6}$/.test(st.color) ? st.color : "#1e293b";
      const size = Math.min(40, Math.max(1, Number(st.size) || 4));
      if (!Array.isArray(st.points) || st.points.length > MAX_POINTS_PER_STROKE || st.points.length === 0) return null;
      const points: Array<[number, number, number]> = [];
      for (const p of st.points) {
        if (!Array.isArray(p) || p.length < 2) return null;
        const x = Number(p[0]);
        const y = Number(p[1]);
        const pr = p.length > 2 ? Number(p[2]) : 0.5;
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(pr)) return null;
        if (Math.abs(x) > 10000 || Math.abs(y) > 10000) return null;
        points.push([x, y, Math.min(1, Math.max(0, pr))]);
      }
      strokes.push({ tool, color, size, points });
    }
    pages.push(strokes);
  }
  return JSON.stringify(pages);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      title?: string;
      background?: string;
      pages?: unknown;
    };
    const data: Record<string, unknown> = {};
    if (typeof body.title === "string") data.title = body.title.trim().slice(0, 200) || "হাতের লেখা";
    if (typeof body.background === "string" && BACKGROUNDS.includes(body.background)) {
      data.background = body.background;
    }
    if (body.pages !== undefined) {
      const clean = sanitizePages(body.pages);
      if (clean === null) {
        return NextResponse.json({ error: "পেজের ডেটা সঠিক নয়" }, { status: 400 });
      }
      data.pagesJson = clean;
    }
    const row = await db.handwritingNotebook.update({ where: { id }, data });
    return NextResponse.json({ ok: true, updatedAt: row.updatedAt.toISOString() });
  } catch (error) {
    console.error("PATCH /api/handwriting/[id]", error);
    return NextResponse.json({ error: "সেভ হয়নি" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await db.handwritingNotebook.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/handwriting/[id]", error);
    return NextResponse.json({ error: "মুছা যায়নি" }, { status: 500 });
  }
}
