import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Max depth of the independent study tree (mirrors the dashboard tree).
const MAX_DEPTH = 6;

async function getDepth(id: string): Promise<number> {
  let depth = 1;
  let current = await db.studyNode.findUnique({ where: { id }, select: { parentId: true } });
  while (current?.parentId) {
    depth++;
    current = await db.studyNode.findUnique({
      where: { id: current.parentId },
      select: { parentId: true },
    });
  }
  return depth;
}

// GET /api/study-tree — full flat study-node list (client assembles hierarchy)
export async function GET() {
  try {
    const nodes = await db.studyNode.findMany({
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({
      nodes: nodes.map((n) => ({
        id: n.id,
        name: n.name,
        order: n.order,
        parentId: n.parentId,
        createdAt: n.createdAt.toISOString(),
        updatedAt: n.updatedAt.toISOString(),
      })),
    });
  } catch (error) {
    console.error("GET /api/study-tree error:", error);
    return NextResponse.json(
      { error: "স্টাডি লেভেল লোড করা যায়নি" },
      { status: 500 }
    );
  }
}

// POST /api/study-tree — create a study level node
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      parentId?: string | null;
    };
    const name = (body.name ?? "").trim();
    const parentId = body.parentId ?? null;

    if (!name) {
      return NextResponse.json({ error: "লেভেলের নাম দিন" }, { status: 400 });
    }
    if (name.length > 200) {
      return NextResponse.json(
        { error: "নাম অত্যধিক বড় (সর্বোচ্চ ২০০ অক্ষর)" },
        { status: 400 }
      );
    }

    if (parentId) {
      const parent = await db.studyNode.findUnique({ where: { id: parentId } });
      if (!parent) {
        return NextResponse.json({ error: "প্যারেন্ট লেভেল পাওয়া যায়নি" }, { status: 404 });
      }
      const depth = await getDepth(parentId);
      if (depth + 1 > MAX_DEPTH) {
        return NextResponse.json(
          { error: `সর্বোচ্চ ${MAX_DEPTH} স্তর পর্যন্ত যুক্ত করা যায়` },
          { status: 400 }
        );
      }
    }

    const siblingCount = await db.studyNode.count({ where: { parentId } });
    const node = await db.studyNode.create({
      data: { name, parentId, order: siblingCount },
    });

    return NextResponse.json(
      {
        node: {
          id: node.id,
          name: node.name,
          order: node.order,
          parentId: node.parentId,
          createdAt: node.createdAt.toISOString(),
          updatedAt: node.updatedAt.toISOString(),
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/study-tree error:", error);
    return NextResponse.json({ error: "লেভেল তৈরি করা যায়নি" }, { status: 500 });
  }
}
