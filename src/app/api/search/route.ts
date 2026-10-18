import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { SearchResult, SearchResultTab } from "@/lib/bcs-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, "\\$&");
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function buildSnippet(content: string, q: string): string {
  const text = stripHtml(content);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text.slice(0, 140);
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + q.length + 80);
  return `${start > 0 ? "…" : ""}${text.slice(start, end)}${end < text.length ? "…" : ""}`;
}

function titleFromItem(title: string, content: string): string {
  return title.trim() || stripHtml(content).slice(0, 60).trim() || "(শিরোনামহীন)";
}

/** Extract nodeId from a cached meta JSON string (PlanItem.meta / Favorite.meta). */
function nodeIdFromMeta(meta: string | null | undefined): string | null {
  if (!meta) return null;
  try {
    const parsed = JSON.parse(meta) as { nodeId?: string | null };
    return typeof parsed.nodeId === "string" && parsed.nodeId ? parsed.nodeId : null;
  } catch {
    return null;
  }
}

/** Which workspace tab to open for a plan item / favorite of the given kind. */
function tabForKind(kind: string): SearchResultTab {
  if (kind === "document") return "docs";
  if (kind === "link") return "links";
  if (kind === "question") return "questions";
  return "notes";
}

// GET /api/search?q= — প্রিমিয়াম সার্চ: EVERY user text in the app.
// Sources: tree nodes, note content, note items, documents, links,
// question bank (stem/notes), MCQ bank, flashcards, study-calendar plans
// and favorites — with per-kind deep-link tabs.
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (!q) return NextResponse.json({ results: [] });

    const like = `%${escapeLike(q)}%`;
    const eq = escapeLike(q);
    const [
      nameMatches,
      contentMatches,
      itemMatches,
      docMatches,
      linkMatches,
      questionMatches,
      mcqMatches,
      flashcardMatches,
      planMatches,
      favoriteMatches,
    ] = await Promise.all([
      db.treeNode.findMany({
        where: { name: { contains: eq } },
        include: { note: { select: { completed: true } } },
        take: 30,
        orderBy: { updatedAt: "desc" },
      }),
      db.note.findMany({
        where: { content: { contains: eq } },
        include: { node: { select: { id: true, name: true, parentId: true } } },
        take: 30,
        orderBy: { updatedAt: "desc" },
      }),
      db.noteItem.findMany({
        where: {
          OR: [{ content: { contains: eq } }, { title: { contains: eq } }],
        },
        take: 30,
        orderBy: { updatedAt: "desc" },
      }),
      db.document.findMany({
        where: { name: { contains: eq } },
        include: { note: { select: { nodeId: true } } },
        take: 30,
        orderBy: { createdAt: "desc" },
      }),
      db.link.findMany({
        where: {
          OR: [{ title: { contains: eq } }, { url: { contains: eq } }],
        },
        include: { note: { select: { nodeId: true } } },
        take: 30,
        orderBy: { createdAt: "desc" },
      }),
      // প্রশ্নব্যাংক — stem (plain), title + per-question rich notes
      db.question.findMany({
        where: {
          OR: [
            { title: { contains: eq } },
            { contentPlain: { contains: eq } },
            { notePlain: { contains: eq } },
            { contentHtml: { contains: eq } },
          ],
        },
        take: 20,
        orderBy: { updatedAt: "desc" },
      }),
      // MCQ ব্যাংক — question, options (JSON string), explanations
      db.mcq.findMany({
        where: {
          OR: [
            { question: { contains: eq } },
            { options: { contains: eq } },
            { explanation: { contains: eq } },
            { explanationHtml: { contains: eq } },
          ],
        },
        take: 20,
        orderBy: { updatedAt: "desc" },
      }),
      // ফ্ল্যাশকার্ড — front/back/explanations
      db.flashcard.findMany({
        where: {
          OR: [
            { front: { contains: eq } },
            { back: { contains: eq } },
            { explanation: { contains: eq } },
            { explanationHtml: { contains: eq } },
          ],
        },
        take: 20,
        orderBy: { updatedAt: "desc" },
      }),
      // স্টাডি ক্যালেন্ডার — plan titles + cached paths
      db.planItem.findMany({
        where: {
          OR: [{ title: { contains: eq } }, { path: { contains: eq } }],
        },
        take: 20,
        orderBy: { updatedAt: "desc" },
      }),
      // প্রিয় — cached titles + paths
      db.favorite.findMany({
        where: {
          OR: [{ title: { contains: eq } }, { path: { contains: eq } }],
        },
        take: 20,
        orderBy: { updatedAt: "desc" },
      }),
    ]);

    const all = await db.treeNode.findMany({ select: { id: true, name: true, parentId: true } });
    const byId = new Map(all.map((n) => [n.id, n]));

    const pathOf = (id: string | null | undefined): string => {
      const parts: string[] = [];
      let cur = id ? byId.get(id) : undefined;
      while (cur) {
        parts.unshift(cur.name);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
      }
      return parts.join(" / ");
    };

    const seen = new Set<string>();
    const results: SearchResult[] = [];

    for (const n of nameMatches) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      results.push({
        kind: "node",
        nodeId: n.id,
        path: pathOf(n.parentId),
        name: n.name,
        completed: n.type === "note" ? (n.note?.completed ?? false) : undefined,
        targetId: n.id,
      });
    }

    for (const note of contentMatches) {
      if (seen.has(note.node.id)) continue;
      seen.add(note.node.id);
      results.push({
        kind: "content",
        nodeId: note.node.id,
        path: pathOf(note.node.parentId),
        name: note.node.name,
        snippet: buildSnippet(note.content, q),
        targetId: note.node.id,
      });
    }

    for (const item of itemMatches) {
      const key = `noteItem:${item.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const title = titleFromItem(item.title, item.content);
      results.push({
        kind: "noteItem",
        nodeId: item.nodeId,
        path: pathOf(item.nodeId),
        title,
        name: title,
        snippet: buildSnippet(item.content, q),
        tab: "notes",
        targetId: item.id,
      });
    }

    for (const doc of docMatches) {
      const key = `document:${doc.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        kind: "document",
        nodeId: doc.note.nodeId,
        path: pathOf(doc.note.nodeId),
        title: doc.name,
        name: doc.name,
        tab: "docs",
        targetId: doc.id,
      });
    }

    for (const link of linkMatches) {
      const key = `link:${link.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({
        kind: "link",
        nodeId: link.note.nodeId,
        path: pathOf(link.note.nodeId),
        title: link.title,
        name: link.title,
        snippet: link.url,
        tab: "links",
        targetId: link.id,
      });
    }

    for (const question of questionMatches) {
      const key = `question:${question.id}`;
      if (seen.has(key) || !question.nodeId) continue;
      seen.add(key);
      const title = titleFromItem(question.title, question.contentPlain);
      const snippet =
        question.contentPlain.toLowerCase().includes(q.toLowerCase())
          ? buildSnippet(question.contentPlain, q)
          : buildSnippet(question.notePlain, q);
      results.push({
        kind: "question",
        nodeId: question.nodeId,
        path: question.nodePath || pathOf(question.nodeId),
        title,
        name: title,
        snippet,
        tab: "questions",
        targetId: question.id,
      });
    }

    for (const mcq of mcqMatches) {
      const key = `mcq:${mcq.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let options: string[] = [];
      try {
        options = JSON.parse(mcq.options) as string[];
      } catch {
        options = [];
      }
      const title = titleFromItem(mcq.question, "");
      const snippet = mcq.explanation
        ? buildSnippet(mcq.explanation, q)
        : buildSnippet(mcq.explanationHtml, q);
      results.push({
        kind: "mcq",
        nodeId: mcq.nodeId ?? "",
        path: mcq.nodePath || (mcq.nodeId ? pathOf(mcq.nodeId) : "রিভিশন হাব"),
        title,
        name: title,
        snippet,
        tab: undefined, // MCQ lives in the revision hub
      });
      void options;
    }

    for (const card of flashcardMatches) {
      const key = `flashcard:${card.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const title = titleFromItem(card.front, "");
      const snippet = card.explanation
        ? buildSnippet(card.explanation, q)
        : buildSnippet(`${card.front}\n${card.back}`, q);
      results.push({
        kind: "flashcard",
        nodeId: card.nodeId ?? "",
        path: card.nodePath || (card.nodeId ? pathOf(card.nodeId) : "রিভিশন হাব"),
        title,
        name: title,
        snippet,
      });
    }

    for (const plan of planMatches) {
      const key = `plan:${plan.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const metaNodeId = nodeIdFromMeta(plan.meta);
      results.push({
        kind: "plan",
        nodeId: metaNodeId ?? "",
        path: plan.path || "স্টাডি ক্যালেন্ডার",
        title: plan.title,
        name: plan.title,
        tab: metaNodeId ? tabForKind(plan.kind) : undefined,
      });
    }

    for (const fav of favoriteMatches) {
      const key = `favorite:${fav.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const metaNodeId = nodeIdFromMeta(fav.meta);
      results.push({
        kind: "favorite",
        nodeId: metaNodeId ?? "",
        path: fav.path || "প্রিয়",
        title: fav.title,
        name: fav.title,
        tab: metaNodeId ? tabForKind(fav.kind) : undefined,
      });
    }

    // light client-style fuzzy ordering: exact prefix > contains
    const lower = q.toLowerCase();
    results.sort((a, b) => {
      const nameA = a.name ?? a.title ?? "";
      const nameB = b.name ?? b.title ?? "";
      const score = (s: string) =>
        s.toLowerCase().startsWith(lower) ? 0 : s.toLowerCase().includes(lower) ? 1 : 2;
      return score(nameA) - score(nameB);
    });

    return NextResponse.json({ results: results.slice(0, 40) });
  } catch (error) {
    console.error("GET /api/search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}
