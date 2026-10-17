import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { MasteryDTO, MasteryItem, MasterySubject } from "@/lib/bcs-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function bucketIndex(readCount: number): number {
  return Math.min(readCount, 5);
}

// GET /api/mastery?target=5 — per-subject read-mastery aggregation
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawTarget = Number(url.searchParams.get("target") ?? "5");
    const target = [3, 5, 10].includes(rawTarget) ? rawTarget : 5;

    const [nodes, noteItems, documents, links] = await Promise.all([
      db.treeNode.findMany({
        select: { id: true, name: true, parentId: true, order: true, createdAt: true },
        orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      }),
      db.noteItem.findMany({
        select: {
          id: true, title: true, content: true, nodeId: true,
          readCount: true, lastReadAt: true,
        },
      }),
      db.document.findMany({
        select: {
          id: true, name: true, readCount: true, lastReadAt: true,
          note: { select: { nodeId: true } },
        },
      }),
      db.link.findMany({
        select: {
          id: true, title: true, readCount: true, lastReadAt: true,
          note: { select: { nodeId: true } },
        },
      }),
    ]);

    const nodeById = new Map(nodes.map((n) => [n.id, n]));

    const pathParts = (id: string): string[] => {
      const parts: string[] = [];
      let cur = nodeById.get(id);
      let guard = 0;
      while (cur && guard++ < 12) {
        parts.unshift(cur.name);
        cur = cur.parentId ? nodeById.get(cur.parentId) : undefined;
      }
      return parts;
    };

    const rootIdOf = (id: string): string => {
      let cur = nodeById.get(id);
      let guard = 0;
      while (cur?.parentId && guard++ < 12) {
        cur = nodeById.get(cur.parentId);
      }
      return cur?.id ?? id;
    };

    type Acc = {
      subject: (typeof nodes)[number];
      items: MasteryItem[];
    };
    const accs = new Map<string, Acc>();
    for (const n of nodes) {
      if (n.parentId === null) accs.set(n.id, { subject: n, items: [] });
    }

    const push = (nodeId: string, item: MasteryItem) => {
      const rootId = rootIdOf(nodeId);
      accs.get(rootId)?.items.push(item);
    };

    for (const ni of noteItems) {
      const title =
        ni.title.trim() || stripHtml(ni.content).slice(0, 60).trim() || "(শিরোনামহীন)";
      push(ni.nodeId, {
        id: ni.id,
        kind: "noteItem",
        title,
        path: pathParts(ni.nodeId).join(" › "),
        readCount: ni.readCount,
        lastReadAt: ni.lastReadAt ? ni.lastReadAt.toISOString() : null,
      });
    }

    for (const doc of documents) {
      push(doc.note.nodeId, {
        id: doc.id,
        kind: "document",
        title: doc.name,
        path: pathParts(doc.note.nodeId).join(" › "),
        readCount: doc.readCount,
        lastReadAt: doc.lastReadAt ? doc.lastReadAt.toISOString() : null,
      });
    }

    for (const link of links) {
      push(link.note.nodeId, {
        id: link.id,
        kind: "link",
        title: link.title,
        path: pathParts(link.note.nodeId).join(" › "),
        readCount: link.readCount,
        lastReadAt: link.lastReadAt ? link.lastReadAt.toISOString() : null,
      });
    }

    let overallItems = 0;
    let overallReads = 0;
    let overallMastered = 0;
    let overallProgress = 0; // Σ min(readCount, target)

    const subjects: MasterySubject[] = [];
    for (const [rootId, acc] of accs) {
      const items = [...acc.items].sort((a, b) => a.readCount - b.readCount);
      const byKind = { note: 0, document: 0, link: 0 };
      const distribution = [0, 0, 0, 0, 0, 0];
      let totalReads = 0;
      let mastered = 0;
      let progress = 0;

      for (const item of items) {
        byKind[item.kind === "noteItem" ? "note" : item.kind]++;
        distribution[bucketIndex(item.readCount)]++;
        totalReads += item.readCount;
        if (item.readCount >= target) mastered++;
        progress += Math.min(item.readCount, target);
      }

      const totalItems = items.length;
      overallItems += totalItems;
      overallReads += totalReads;
      overallMastered += mastered;
      overallProgress += progress;

      subjects.push({
        id: rootId,
        name: acc.subject.name,
        totalItems,
        byKind,
        totalReads,
        masteredItems: mastered,
        distribution,
        masteryPct: totalItems ? Math.round((progress / (totalItems * target)) * 100) : 0,
        items,
      });
    }

    const payload: MasteryDTO = {
      target,
      overall: {
        totalItems: overallItems,
        totalReads: overallReads,
        masteredItems: overallMastered,
        masteryPct: overallItems
          ? Math.round((overallProgress / (overallItems * target)) * 100)
          : 0,
      },
      subjects,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("GET /api/mastery error:", error);
    return NextResponse.json(
      { error: "মাস্টারি ডেটা হিসাব করা যায়নি" },
      { status: 500 }
    );
  }
}
