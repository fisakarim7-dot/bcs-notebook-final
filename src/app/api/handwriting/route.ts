import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKGROUNDS = ["blank", "ruled", "grid", "dotted"];

function toDTO(r: {
  id: string;
  title: string;
  background: string;
  pagesJson: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  let pages: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(r.pagesJson || "[]");
    if (Array.isArray(parsed)) pages = parsed;
  } catch {
    pages = [];
  }
  return {
    id: r.id,
    title: r.title,
    background: r.background,
    pages,
    pageCount: pages.length,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function GET() {
  try {
    const rows = await db.handwritingNotebook.findMany({
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
    return NextResponse.json({ notebooks: rows.map(toDTO) });
  } catch (error) {
    console.error("GET /api/handwriting", error);
    return NextResponse.json({ error: "হাতের লেখার খাতা লোড হয়নি" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { title?: string; background?: string };
    const title = (body.title ?? "").trim().slice(0, 200) || "হাতের লেখা";
    const background = BACKGROUNDS.includes(body.background ?? "")
      ? body.background!
      : "ruled";
    const row = await db.handwritingNotebook.create({
      data: { title, background, pagesJson: "[]" },
    });
    return NextResponse.json({ notebook: toDTO(row) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/handwriting", error);
    return NextResponse.json({ error: "নতুন খাতা তৈরি হয়নি" }, { status: 500 });
  }
}
