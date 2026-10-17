import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { StatsDTO } from "@/lib/bcs-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// GET /api/stats — dashboard analytics
export async function GET() {
  try {
    const [nodes, notes, documents, linkRows, noteItemRows, sessions] =
      await Promise.all([
        db.treeNode.findMany({ select: { id: true, name: true, type: true, parentId: true } }),
        db.note.findMany({
          select: { id: true, nodeId: true, completed: true, updatedAt: true },
          orderBy: { updatedAt: "desc" },
        }),
        db.document.findMany({ select: { noteId: true, size: true } }),
        db.link.findMany({ select: { noteId: true } }),
        db.noteItem.findMany({ select: { nodeId: true } }),
        db.studySession.findMany({
          where: {
            mode: { in: ["focus", "stopwatch"] },
            createdAt: { gte: new Date(Date.now() - 7 * 86400_000) },
          },
          select: { duration: true, createdAt: true },
        }),
      ]);

    const nodeById = new Map(nodes.map((n) => [n.id, n]));
    const noteByNodeId = new Map(notes.map((n) => [n.nodeId, n]));
    const noteIdToNodeId = new Map(notes.map((n) => [n.id, n.nodeId]));

    const descendantsOf = (rootId: string): string[] => {
      const out: string[] = [];
      let frontier = [rootId];
      while (frontier.length) {
        const kids = nodes.filter((n) => n.parentId && frontier.includes(n.parentId)).map((n) => n.id);
        out.push(...kids);
        frontier = kids;
      }
      return out;
    };

    const subjects = nodes
      .filter((n) => n.parentId === null)
      .map((subject) => {
        const ids = [subject.id, ...descendantsOf(subject.id)];
        const idSet = new Set(ids);
        const subjectNotes = ids.filter((id) => nodeById.get(id)?.type === "note");
        const completed = subjectNotes.filter((id) => noteByNodeId.get(id)?.completed).length;
        const subjectNoteSet = new Set(subjectNotes);
        const docs = documents.filter((d) => {
          const nodeId = noteIdToNodeId.get(d.noteId);
          return nodeId ? idSet.has(nodeId) : false;
        }).length;
        const links = linkRows.filter((l) => {
          const nodeId = noteIdToNodeId.get(l.noteId);
          return nodeId ? idSet.has(nodeId) : false;
        }).length;
        const items = noteItemRows.filter((ni) => idSet.has(ni.nodeId)).length;
        return {
          id: subject.id,
          name: subject.name,
          totalNotes: subjectNotes.length,
          completedNotes: completed,
          percent: subjectNotes.length ? Math.round((completed / subjectNotes.length) * 100) : 0,
          notes: subjectNotes.length,
          documents: docs,
          links,
          noteItems: items,
          totalItems: items + docs + links,
        };
      });

    const noteNodeIds = new Set(nodes.filter((n) => n.type === "note").map((n) => n.id));
    const existingNoteIds = new Set(notes.map((n) => n.id));

    const recent = notes
      .filter((n) => noteNodeIds.has(n.nodeId))
      .slice(0, 6)
      .map((n) => ({
        id: n.nodeId,
        name: nodeById.get(n.nodeId)?.name ?? "Untitled",
        completed: n.completed,
        updatedAt: n.updatedAt.toISOString(),
      }));

    const today = startOfToday();
    const totalFocusSeconds = sessions.reduce((acc, s) => acc + s.duration, 0);
    const todayFocusSeconds = sessions
      .filter((s) => s.createdAt >= today)
      .reduce((acc, s) => acc + s.duration, 0);

    const weekFocus: { date: string; minutes: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date();
      day.setHours(0, 0, 0, 0);
      day.setDate(day.getDate() - i);
      const next = new Date(day.getTime() + 86400_000);
      const minutes = Math.round(
        sessions
          .filter((s) => s.createdAt >= day && s.createdAt < next)
          .reduce((acc, s) => acc + s.duration, 0) / 60
      );
      weekFocus.push({ date: day.toISOString().slice(0, 10), minutes });
    }

    const payload: StatsDTO = {
      totals: {
        subjects: subjects.length,
        folders: nodes.filter((n) => n.type === "folder").length,
        notes: noteNodeIds.size,
        completedNotes: notes.filter((n) => noteNodeIds.has(n.nodeId) && n.completed).length,
        documents: documents.filter((d) => existingNoteIds.has(d.noteId)).length,
        links: linkRows.length,
        storageBytes: documents.reduce((acc, d) => acc + d.size, 0),
        focusMinutes: Math.round(totalFocusSeconds / 60),
        todayFocusMinutes: Math.round(todayFocusSeconds / 60),
      },
      subjects,
      recent,
      weekFocus,
    };

    return NextResponse.json(payload);
  } catch (error) {
    console.error("GET /api/stats error:", error);
    return NextResponse.json({ error: "Failed to compute stats" }, { status: 500 });
  }
}
