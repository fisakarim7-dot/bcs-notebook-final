import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  buildContentIndex,
  enrichTarget,
  isCrossLinkKind,
  normalizePair,
} from "@/lib/bcs-crosslink";
import type { CrossLinkTarget } from "@/lib/bcs-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cross Linking (#33) — manual connections between ANY two content items.
 *
 * GET    /api/cross-links?kind=question&id=xxx   → { links: CrossLinkTarget[] }
 * POST   /api/cross-links { sourceKind, sourceId, targetKind, targetId }
 * DELETE /api/cross-links?id=linkId
 *
 * Links are bidirectional in the UI; storage direction is canonical, so both
 * directions dedupe to a single row. Dangling ends (deleted content) are
 * silently dropped from responses.
 */

/** GET — every manual link touching (kind,id), resolved to the other end. */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") ?? "";
    const id = url.searchParams.get("id") ?? "";
    if (!isCrossLinkKind(kind) || !id) {
      return NextResponse.json({ error: "kind ও id দরকার" }, { status: 400 });
    }

    const [rows, idx] = await Promise.all([
      db.crossLink.findMany({
        where: {
          OR: [
            { sourceKind: kind, sourceId: id },
            { targetKind: kind, targetId: id },
          ],
        },
        orderBy: { createdAt: "desc" },
      }),
      buildContentIndex(),
    ]);

    const seen = new Set<string>();
    const links: (CrossLinkTarget & { linkId: string })[] = [];
    for (const r of rows) {
      const other =
        r.sourceKind === kind && r.sourceId === id
          ? { kind: r.targetKind, id: r.targetId }
          : { kind: r.sourceKind, id: r.sourceId };
      const key = `${other.kind}:${other.id}`;
      if (seen.has(key)) continue;
      const target = enrichTarget(other.kind, other.id, idx);
      if (!target) continue; // dangling — target was deleted
      seen.add(key);
      links.push({ ...target, linkId: r.id });
    }

    // group order: node → question → noteItem → document → link
    const rank: Record<string, number> = {
      node: 0,
      question: 1,
      noteItem: 2,
      document: 3,
      link: 4,
    };
    links.sort(
      (a, b) =>
        (rank[a.kind] ?? 9) - (rank[b.kind] ?? 9) ||
        a.title.localeCompare(b.title, "bn")
    );

    return NextResponse.json({ links });
  } catch (error) {
    console.error("GET /api/cross-links error:", error);
    return NextResponse.json({ error: "সংযোগ লোড করা যায়নি" }, { status: 500 });
  }
}

/** POST — forge a connection (validated on both ends, direction-normalized). */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      sourceKind?: string;
      sourceId?: string;
      targetKind?: string;
      targetId?: string;
    };
    const { sourceKind, sourceId, targetKind, targetId } = body;
    if (
      !isCrossLinkKind(sourceKind ?? "") ||
      !isCrossLinkKind(targetKind ?? "") ||
      !sourceId ||
      !targetId
    ) {
      return NextResponse.json({ error: "সঠিক source/target দিন" }, { status: 400 });
    }
    if (sourceKind === targetKind && sourceId === targetId) {
      return NextResponse.json(
        { error: "নিজের সাথে নিজেকে সংযোগ করা যায় না" },
        { status: 400 }
      );
    }

    const idx = await buildContentIndex();
    const a = enrichTarget(sourceKind!, sourceId, idx);
    const b = enrichTarget(targetKind!, targetId, idx);
    if (!a || !b) {
      return NextResponse.json(
        { error: "একটি বা দুটি কনটেন্ট খুঁজে পাওয়া যায়নি" },
        { status: 404 }
      );
    }

    const pair = normalizePair(
      { kind: sourceKind!, id: sourceId },
      { kind: targetKind!, id: targetId }
    );
    await db.crossLink.upsert({
      where: {
        sourceKind_sourceId_targetKind_targetId: {
          sourceKind: pair.sourceKind,
          sourceId: pair.sourceId,
          targetKind: pair.targetKind,
          targetId: pair.targetId,
        },
      },
      create: pair,
      update: {}, // already linked — idempotent
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/cross-links error:", error);
    return NextResponse.json({ error: "সংযোগ যোগ করা যায়নি" }, { status: 500 });
  }
}

/** DELETE — remove one connection row. */
export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id") ?? "";
    if (!id) {
      return NextResponse.json({ error: "id দরকার" }, { status: 400 });
    }
    await db.crossLink.deleteMany({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/cross-links error:", error);
    return NextResponse.json({ error: "সংযোগ মুছে ফেলা যায়নি" }, { status: 500 });
  }
}
