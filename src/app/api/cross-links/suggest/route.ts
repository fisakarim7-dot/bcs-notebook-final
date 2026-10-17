import { NextResponse } from "next/server";
import {
  buildContentIndex,
  enrichTarget,
  isCrossLinkKind,
  linkedKeysFor,
  suggestFor,
} from "@/lib/bcs-crosslink";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cross Linking (#33) — AUTO-MATCH engine.
 *
 * GET /api/cross-links/suggest?kind=question&id=xxx
 *   → { groups: { kind, items: CrossLinkTarget[] }[] }
 *
 * Keyword-based relatedness over the live content index:
 * topic names, note cards, files, cloud links and other questions.
 * Bengali inflections are handled by shared-prefix (≥4 chars) matching.
 * Already-linked targets and the source's own topic are excluded.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind") ?? "";
    const id = url.searchParams.get("id") ?? "";
    if (!isCrossLinkKind(kind) || !id) {
      return NextResponse.json({ error: "kind ও id দরকার" }, { status: 400 });
    }

    const started = Date.now();
    const idx = await buildContentIndex();
    if (!enrichTarget(kind, id, idx)) {
      return NextResponse.json({ error: "কনটেন্ট খুঁজে পাওয়া যায়নি" }, { status: 404 });
    }

    const linkedKeys = await linkedKeysFor(kind, id);
    const groups = suggestFor(kind, id, idx, { linkedKeys });

    return NextResponse.json({
      groups: groups.filter((g) => g.items.length > 0),
      tookMs: Date.now() - started,
    });
  } catch (error) {
    console.error("GET /api/cross-links/suggest error:", error);
    return NextResponse.json({ error: "অটো-ম্যাচ ব্যর্থ হয়েছে" }, { status: 500 });
  }
}
