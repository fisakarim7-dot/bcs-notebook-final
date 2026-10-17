import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { SYLLABUS_SEED } from "@/lib/bcs-syllabus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["unread", "reading", "noted", "mcq", "weak", "mastered"];
const STRENGTHS = ["very_weak", "weak", "medium", "strong", "very_strong"];

async function seedIfEmpty() {
  const n = await db.syllabusItem.count();
  if (n > 0) return false;
  await db.syllabusItem.createMany({ data: SYLLABUS_SEED });
  return true;
}

export async function GET() {
  try {
    await seedIfEmpty();
    const items = await db.syllabusItem.findMany({ orderBy: [{ paper: "asc" }, { order: "asc" }] });
    return NextResponse.json({
      items: items.map((r) => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("GET /api/syllabus", error);
    return NextResponse.json({ error: "সিলেবাস লোড হয়নি" }, { status: 500 });
  }
}

/**
 * POST /api/syllabus — tree-checklist status upsert.
 * Every study-tree node (level 1–6) can be marked from the syllabus checklist;
 * the row is keyed by nodeId (paper: "tree") so it survives renames and the
 * checklist itself always mirrors the live tree.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      nodeId?: string;
      status?: string;
      strength?: string;
      subject?: string;
      topic?: string;
    } | null;
    const nodeId = (body?.nodeId ?? "").trim();
    const status = body?.status ?? null;
    const strength = body?.strength ?? null;
    if (!nodeId) {
      return NextResponse.json({ error: "nodeId দরকার" }, { status: 400 });
    }
    if (status !== null && !STATUSES.includes(status)) {
      return NextResponse.json({ error: "সঠিক status দরকার" }, { status: 400 });
    }
    // strength: one of the 5 levels, or "" to clear
    if (strength !== null && strength !== "" && !STRENGTHS.includes(strength)) {
      return NextResponse.json({ error: "সঠিক strength দরকার" }, { status: 400 });
    }
    const node = await db.treeNode.findUnique({ where: { id: nodeId } });
    if (!node) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }
    const subject = (body?.subject ?? "").slice(0, 200);
    const topic = (body?.topic ?? node.name).slice(0, 300);

    const existing = await db.syllabusItem.findFirst({ where: { nodeId } });
    const row = existing
      ? await db.syllabusItem.update({
          where: { id: existing.id },
          data: {
            ...(status !== null ? { status } : {}),
            ...(strength !== null ? { strength } : {}),
            // keep subject/topic in sync when the status chips are used
            ...(status !== null ? { subject: subject || existing.subject, topic } : {}),
          },
        })
      : await db.syllabusItem.create({
          data: {
            paper: "tree",
            subject,
            topic,
            status: status ?? "unread",
            strength: strength ?? "",
            nodeId,
            order: 0,
          },
        });

    return NextResponse.json({
      item: { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() },
    });
  } catch (error) {
    console.error("POST /api/syllabus", error);
    return NextResponse.json({ error: "স্ট্যাটাস সেভ হয়নি" }, { status: 500 });
  }
}
