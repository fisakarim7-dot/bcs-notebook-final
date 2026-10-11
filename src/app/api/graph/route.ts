import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [nodes, notes, docs, links, questions, xlinks] = await Promise.all([
      db.treeNode.findMany({ select: { id: true, name: true, parentId: true } }),
      db.noteItem.findMany({ select: { id: true, title: true, nodeId: true } }),
      db.document.findMany({ select: { id: true, name: true, noteId: true } }),
      db.link.findMany({ select: { id: true, title: true, noteId: true } }),
      db.question.findMany({ select: { id: true, title: true, nodeId: true, nodePath: true } }),
      db.crossLink.findMany(),
    ]);
    const nameOf = new Map(nodes.map((n) => [n.id, n.name]));
    const parentOf = new Map(nodes.map((n) => [n.id, n.parentId]));
    const pathOf = (id: string | null | undefined): string => {
      if (!id) return "";
      const names: string[] = [];
      let cur: string | null = id;
      const seen = new Set<string>();
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        names.unshift(nameOf.get(cur) ?? "");
        cur = parentOf.get(cur) ?? null;
      }
      return names.filter(Boolean).join(" / ");
    };

    const gNodes: { id: string; kind: string; title: string; path: string }[] = [];
    for (const n of nodes) gNodes.push({ id: `node:${n.id}`, kind: "node", title: n.name, path: pathOf(n.id) });
    for (const n of notes)
      gNodes.push({
        id: `noteItem:${n.id}`,
        kind: "noteItem",
        title: n.title.trim() || "নোট",
        path: pathOf(n.nodeId),
      });
    for (const d of docs) gNodes.push({ id: `document:${d.id}`, kind: "document", title: d.name, path: "" });
    for (const l of links) gNodes.push({ id: `link:${l.id}`, kind: "link", title: l.title, path: "" });
    for (const q of questions)
      gNodes.push({
        id: `question:${q.id}`,
        kind: "question",
        title: q.title.trim() || "প্রশ্ন",
        path: q.nodePath || pathOf(q.nodeId),
      });

    const live = new Set(gNodes.map((n) => n.id));
    const edges = xlinks
      .map((x) => ({
        id: x.id,
        source: `${x.sourceKind}:${x.sourceId}`,
        target: `${x.targetKind}:${x.targetId}`,
      }))
      .filter((e) => live.has(e.source) && live.has(e.target));

    // Only keep nodes that have at least one edge — graph stays readable
    const used = new Set<string>();
    for (const e of edges) {
      used.add(e.source);
      used.add(e.target);
    }
    const shown = gNodes.filter((n) => used.has(n.id));
    return NextResponse.json({ nodes: shown, edges, totalNodes: gNodes.length, totalEdges: edges.length });
  } catch (error) {
    console.error("GET /api/graph", error);
    return NextResponse.json({ error: "গ্রাফ লোড হয়নি" }, { status: 500 });
  }
}
