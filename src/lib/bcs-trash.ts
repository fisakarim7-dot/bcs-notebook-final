// Server-only Safe Delete engine (#21 ট্র্যাশ / Safe Delete System).
//
// Flow: Delete → Trash → Restore → Permanent Delete
//  - Every destructive route first serializes the victim row(s) into a JSON
//    payload stored in TrashItem, THEN removes them from the live tables.
//  - Restore re-inserts rows with the SAME ids → Favorites / CrossLinks /
//    PlanItems referencing them revive automatically.
//  - Uploaded files are NEVER removed at trash time. They are removed only on
//    Permanent Delete (single item / empty trash / auto-purge).
//  - Restoring a subtree whose original parent no longer exists re-attaches it
//    at the root (top-level) so restore NEVER fails.
import { db } from "@/lib/db";
import * as storage from "@/lib/storage";

export type TrashKind =
  | "node"
  | "noteItem"
  | "document"
  | "link"
  | "question"
  | "questionAttachment"
  | "flashcard"
  | "mcq";

// ---------- payload shapes (dates serialized as ISO strings) ----------

export interface TrashNodeRow {
  id: string;
  name: string;
  type: string;
  order: number;
  parentId: string | null;
}
export interface TrashNoteRow {
  id: string;
  nodeId: string;
  content: string;
  font: string;
  completed: boolean;
  readCount: number;
  lastReadAt: string | null;
}
export interface TrashNoteItemRow {
  id: string;
  nodeId: string;
  title: string;
  content: string;
  font: string;
  readCount: number;
  lastReadAt: string | null;
}
export interface TrashDocumentRow {
  id: string;
  noteId: string;
  name: string;
  ext: string;
  mime: string;
  size: number;
  path: string;
  readCount: number;
  lastReadAt: string | null;
}
export interface TrashLinkRow {
  id: string;
  noteId: string;
  title: string;
  url: string;
  provider: string;
  readCount: number;
  lastReadAt: string | null;
}
export interface TrashQuestionRow {
  id: string;
  nodeId: string | null;
  nodePath: string | null;
  title: string;
  contentHtml: string;
  contentPlain: string;
  favorite: boolean;
  noteHtml: string;
  notePlain: string;
}
export interface TrashQuestionAttachmentRow {
  id: string;
  questionId: string;
  kind: string;
  name: string;
  ext: string;
  mime: string;
  size: number;
  path: string;
  url: string;
  provider: string;
  /** kind="note" | "data" only (older trash rows may not have these) */
  contentHtml?: string;
  font?: string;
}
export interface TrashFlashcardRow {
  id: string;
  nodeId: string | null;
  nodePath: string | null;
  studyNodeId: string | null;
  studyNodePath: string | null;
  front: string;
  back: string;
  explanation: string;
  explanationHtml: string;
  favorite: boolean;
  readLater: boolean;
  box: number;
  dueDate: string;
  lastResult: string | null;
  lastReviewedAt: string | null;
  reviewCount: number;
  wrongCount: number;
  suspended: boolean;
  source: string;
}
export interface TrashMcqRow {
  id: string;
  nodeId: string | null;
  nodePath: string | null;
  studyNodeId: string | null;
  studyNodePath: string | null;
  question: string;
  options: string;
  correctIndex: number;
  explanation: string;
  explanationHtml: string;
  favorite: boolean;
  readLater: boolean;
  attempts: number;
  correctCount: number;
  wrongCount: number;
  lastResult: string | null;
  lastAttemptAt: string | null;
  inWrongBook: boolean;
  suspended: boolean;
  source: string;
  tags?: string; // Tag System (#14) — JSON string array
}

export interface TrashPayload {
  version: 1;
  kind: TrashKind;
  nodes?: TrashNodeRow[]; // parent-first order (kind="node")
  notes?: TrashNoteRow[];
  noteItems?: TrashNoteItemRow[];
  documents?: TrashDocumentRow[];
  links?: TrashLinkRow[];
  questions?: TrashQuestionRow[];
  questionAttachments?: TrashQuestionAttachmentRow[];
  noteItem?: TrashNoteItemRow;
  document?: TrashDocumentRow;
  link?: TrashLinkRow;
  question?: TrashQuestionRow;
  questionAttachment?: TrashQuestionAttachmentRow;
  flashcard?: TrashFlashcardRow;
  mcq?: TrashMcqRow;
}

// ---------- helpers ----------

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** Cached breadcrumb "Subject / Part / … / name" for a node (empty when missing). */
export async function nodeBreadcrumbPath(nodeId: string, nodeName?: string): Promise<string> {
  const node = await db.treeNode.findUnique({
    where: { id: nodeId },
    select: { name: true, parentId: true },
  });
  if (!node) return "";
  const parts: string[] = [];
  let cur = node.parentId;
  let guard = 0;
  while (cur && guard++ < 12) {
    const p = await db.treeNode.findUnique({
      where: { id: cur },
      select: { name: true, parentId: true },
    });
    if (!p) break;
    parts.unshift(p.name);
    cur = p.parentId;
  }
  parts.push(nodeName ?? node.name);
  return parts.join(" / ");
}

async function collectSubtree(rootId: string): Promise<{ nodes: TrashNodeRow[] }> {
  const rows: TrashNodeRow[] = [];
  const byId = new Map<string, TrashNodeRow>();
  let frontier = [rootId];
  const root = await db.treeNode.findUnique({ where: { id: rootId } });
  if (!root) return { nodes: [] };
  const rootRow: TrashNodeRow = {
    id: root.id,
    name: root.name,
    type: root.type,
    order: root.order,
    parentId: root.parentId,
  };
  rows.push(rootRow);
  byId.set(root.id, rootRow);
  // BFS, then emit parent-first (parents always appear before children because
  // a child is only visited after its parent was discovered).
  while (frontier.length) {
    const children = await db.treeNode.findMany({
      where: { parentId: { in: frontier } },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
    frontier = [];
    for (const c of children) {
      frontier.push(c.id);
      const row: TrashNodeRow = {
        id: c.id,
        name: c.name,
        type: c.type,
        order: c.order,
        parentId: c.parentId,
      };
      rows.push(row);
      byId.set(c.id, row);
    }
  }
  return { nodes: rows };
}

/** Snapshot a whole node subtree (nodes + notes + noteItems + docs + links + questions). */
export async function snapshotSubtree(rootId: string): Promise<{
  payload: TrashPayload;
  sizeBytes: number;
  summary: string;
}> {
  const { nodes } = await collectSubtree(rootId);
  const ids = nodes.map((n) => n.id);
  const [notes, noteItems, documents, links, questions] = await Promise.all([
    db.note.findMany({ where: { nodeId: { in: ids } } }),
    db.noteItem.findMany({ where: { nodeId: { in: ids } } }),
    db.document.findMany({ where: { note: { nodeId: { in: ids } } } }),
    db.link.findMany({ where: { note: { nodeId: { in: ids } } } }),
    db.question.findMany({ where: { nodeId: { in: ids } } }),
  ]);
  const questionIds = questions.map((q) => q.id);
  const questionAttachments = questionIds.length
    ? await db.questionAttachment.findMany({ where: { questionId: { in: questionIds } } })
    : [];

  const payload: TrashPayload = {
    version: 1,
    kind: "node",
    nodes,
    notes: notes.map((n) => ({
      id: n.id,
      nodeId: n.nodeId,
      content: n.content,
      font: n.font,
      completed: n.completed,
      readCount: n.readCount,
      lastReadAt: iso(n.lastReadAt),
    })),
    noteItems: noteItems.map((n) => ({
      id: n.id,
      nodeId: n.nodeId,
      title: n.title,
      content: n.content,
      font: n.font,
      readCount: n.readCount,
      lastReadAt: iso(n.lastReadAt),
    })),
    documents: documents.map((d) => ({
      id: d.id,
      noteId: d.noteId,
      name: d.name,
      ext: d.ext,
      mime: d.mime,
      size: d.size,
      path: d.path,
      readCount: d.readCount,
      lastReadAt: iso(d.lastReadAt),
    })),
    links: links.map((l) => ({
      id: l.id,
      noteId: l.noteId,
      title: l.title,
      url: l.url,
      provider: l.provider,
      readCount: l.readCount,
      lastReadAt: iso(l.lastReadAt),
    })),
    questions: questions.map((q) => ({
      id: q.id,
      nodeId: q.nodeId,
      nodePath: q.nodePath,
      title: q.title,
      contentHtml: q.contentHtml,
      contentPlain: q.contentPlain,
      favorite: q.favorite,
      noteHtml: q.noteHtml,
      notePlain: q.notePlain,
    })),
    questionAttachments: questionAttachments.map((a) => ({
      id: a.id,
      questionId: a.questionId,
      kind: a.kind,
      name: a.name,
      ext: a.ext,
      mime: a.mime,
      size: a.size,
      path: a.path,
      url: a.url,
      provider: a.provider,
      contentHtml: a.contentHtml ?? "",
      font: a.font ?? "kalpurush",
    })),
  };

  const sizeBytes = documents.reduce((acc, d) => acc + d.size, 0);
  const summary = [
    nodes.length > 1 ? `${nodes.length}টি সেকশন/নোড` : "",
    noteItems.length ? `${noteItems.length}টি নোট-আইটেম` : "",
    documents.length ? `${documents.length}টি ফাইল` : "",
    links.length ? `${links.length}টি লিংক` : "",
    questions.length ? `${questions.length}টি প্রশ্ন` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  return { payload, sizeBytes, summary };
}

/** Upsert a trash row (re-deleting the same item replaces the old snapshot). */
export async function moveToTrash(input: {
  kind: TrashKind;
  refId: string;
  title: string;
  path?: string;
  summary?: string;
  payload: TrashPayload;
  sizeBytes?: number;
}): Promise<void> {
  const data = {
    title: input.title.slice(0, 300) || "শিরোনামহীন",
    path: (input.path ?? "").slice(0, 500),
    summary: (input.summary ?? "").slice(0, 500),
    payload: JSON.stringify(input.payload),
    sizeBytes: Math.max(0, Math.round(input.sizeBytes ?? 0)),
    deletedAt: new Date(),
  };
  await db.trashItem.upsert({
    where: { kind_refId: { kind: input.kind, refId: input.refId } },
    update: data,
    create: { kind: input.kind, refId: input.refId, ...data },
  });
}

/** All on-disk files referenced by a payload (documents + question attachments). */
async function payloadFiles(payload: TrashPayload): Promise<string[]> {
  const paths: string[] = [];
  for (const d of payload.documents ?? []) {
    if (d.path) paths.push(d.path);
  }
  if (payload.document?.path) paths.push(payload.document.path);
  for (const a of payload.questionAttachments ?? []) {
    if (a.path && a.path !== "pending") paths.push(a.path);
  }
  if (payload.questionAttachment?.path && payload.questionAttachment.path !== "pending") {
    paths.push(payload.questionAttachment.path);
  }
  return paths;
}

async function removePayloadFiles(payload: TrashPayload): Promise<void> {
  const paths = await payloadFiles(payload);
  await Promise.all(paths.map((p) => storage.deleteFile(p).catch(() => undefined)));
}

/** Permanent delete of one trash row (removes referenced files, then the row). */
export async function permanentDeleteTrashItem(trashId: string): Promise<void> {
  const item = await db.trashItem.findUnique({ where: { id: trashId } });
  if (!item) return;
  try {
    const payload = JSON.parse(item.payload) as TrashPayload;
    await removePayloadFiles(payload);
  } catch {
    // corrupt payload — still remove the trash row
  }
  await db.trashItem.delete({ where: { id: trashId } });
}

/** Empty the whole trash (returns how many items were purged). */
export async function emptyTrash(): Promise<number> {
  const items = await db.trashItem.findMany({ select: { id: true, payload: true } });
  for (const item of items) {
    try {
      await removePayloadFiles(JSON.parse(item.payload) as TrashPayload);
    } catch {
      // ignore — row removal proceeds
    }
  }
  await db.trashItem.deleteMany({});
  return items.length;
}

/** Auto-purge items older than N days (N > 0). Called before listing. */
export async function autoPurgeTrash(days: number): Promise<number> {
  if (!days || days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * 86_400_000);
  const expired = await db.trashItem.findMany({
    where: { deletedAt: { lt: cutoff } },
    select: { id: true, payload: true },
  });
  for (const item of expired) {
    try {
      await removePayloadFiles(JSON.parse(item.payload) as TrashPayload);
    } catch {
      // ignore
    }
  }
  if (expired.length) {
    await db.trashItem.deleteMany({ where: { id: { in: expired.map((e) => e.id) } } });
  }
  return expired.length;
}

// ---------- restore ----------

export interface RestoreResult {
  restoredNodes: number;
  restoredNotes: number;
  restoredNoteItems: number;
  restoredDocuments: number;
  restoredLinks: number;
  restoredQuestions: number;
  restoredFlashcards: number;
  restoredMcqs: number;
}

async function restoreNodePayload(payload: TrashPayload): Promise<RestoreResult> {
  const res: RestoreResult = {
    restoredNodes: 0,
    restoredNotes: 0,
    restoredNoteItems: 0,
    restoredDocuments: 0,
    restoredLinks: 0,
    restoredQuestions: 0,
    restoredFlashcards: 0,
    restoredMcqs: 0,
  };
  const nodes = payload.nodes ?? [];
  if (!nodes.length) return res;

  // Original parent of the subtree root — re-attach there when it still exists.
  const originalParentId = nodes[0].parentId;
  const parentStillExists = originalParentId
    ? !!(await db.treeNode.findUnique({ where: { id: originalParentId }, select: { id: true } }))
    : true; // null → was already a root

  const snapshotIds = new Set(nodes.map((n) => n.id));
  for (const n of nodes) {
    if (await db.treeNode.findUnique({ where: { id: n.id }, select: { id: true } })) continue; // already restored
    let parentId: string | null;
    if (n.parentId && snapshotIds.has(n.parentId)) {
      parentId = n.parentId; // parent restored within this batch (parent-first order)
    } else if (n.id === nodes[0].id) {
      parentId = parentStillExists ? originalParentId : null;
    } else {
      parentId = null; // dangling external parent → re-attach at top level
    }
    await db.treeNode.create({
      data: { id: n.id, name: n.name, type: n.type, order: n.order, parentId },
    });
    res.restoredNodes++;
  }

  for (const note of payload.notes ?? []) {
    if (!(await db.treeNode.findUnique({ where: { id: note.nodeId }, select: { id: true } }))) continue;
    if (await db.note.findUnique({ where: { id: note.id }, select: { id: true } })) continue;
    await db.note.create({
      data: {
        id: note.id,
        nodeId: note.nodeId,
        content: note.content,
        font: note.font,
        completed: note.completed,
        readCount: note.readCount,
        lastReadAt: note.lastReadAt ? new Date(note.lastReadAt) : null,
      },
    });
    res.restoredNotes++;
  }

  for (const it of payload.noteItems ?? []) {
    if (!(await db.treeNode.findUnique({ where: { id: it.nodeId }, select: { id: true } }))) continue;
    if (await db.noteItem.findUnique({ where: { id: it.id }, select: { id: true } })) continue;
    await db.noteItem.create({
      data: {
        id: it.id,
        nodeId: it.nodeId,
        title: it.title,
        content: it.content,
        font: it.font,
        readCount: it.readCount,
        lastReadAt: it.lastReadAt ? new Date(it.lastReadAt) : null,
      },
    });
    res.restoredNoteItems++;
  }

  for (const d of payload.documents ?? []) {
    if (!(await db.note.findUnique({ where: { id: d.noteId }, select: { id: true } }))) continue;
    if (await db.document.findUnique({ where: { id: d.id }, select: { id: true } })) continue;
    await db.document.create({
      data: {
        id: d.id,
        noteId: d.noteId,
        name: d.name,
        ext: d.ext,
        mime: d.mime,
        size: d.size,
        path: d.path,
        readCount: d.readCount,
        lastReadAt: d.lastReadAt ? new Date(d.lastReadAt) : null,
      },
    });
    res.restoredDocuments++;
  }

  for (const l of payload.links ?? []) {
    if (!(await db.note.findUnique({ where: { id: l.noteId }, select: { id: true } }))) continue;
    if (await db.link.findUnique({ where: { id: l.id }, select: { id: true } })) continue;
    await db.link.create({
      data: {
        id: l.id,
        noteId: l.noteId,
        title: l.title,
        url: l.url,
        provider: l.provider,
        readCount: l.readCount,
        lastReadAt: l.lastReadAt ? new Date(l.lastReadAt) : null,
      },
    });
    res.restoredLinks++;
  }

  for (const q of payload.questions ?? []) {
    let nodeId: string | null = null;
    if (q.nodeId) {
      const node = await db.treeNode.findUnique({ where: { id: q.nodeId }, select: { id: true } });
      nodeId = node ? q.nodeId : null; // external parent vanished → detach
    }
    if (await db.question.findUnique({ where: { id: q.id }, select: { id: true } })) continue;
    await db.question.create({
      data: {
        id: q.id,
        nodeId,
        nodePath: q.nodePath,
        title: q.title,
        contentHtml: q.contentHtml,
        contentPlain: q.contentPlain,
        favorite: q.favorite,
        noteHtml: q.noteHtml,
        notePlain: q.notePlain,
      },
    });
    res.restoredQuestions++;
  }

  for (const a of payload.questionAttachments ?? []) {
    if (!(await db.question.findUnique({ where: { id: a.questionId }, select: { id: true } }))) continue;
    if (await db.questionAttachment.findUnique({ where: { id: a.id }, select: { id: true } })) continue;
    await db.questionAttachment.create({
      data: {
        id: a.id,
        questionId: a.questionId,
        kind: a.kind,
        name: a.name,
        ext: a.ext,
        mime: a.mime,
        size: a.size,
        path: a.path,
        url: a.url,
        provider: a.provider,
      contentHtml: a.contentHtml ?? "",
      font: a.font ?? "kalpurush",
      },
    });
  }

  return res;
}

/** Restore a trash row back into the live tables (same ids). */
export async function restoreTrashItem(trashId: string): Promise<RestoreResult> {
  const item = await db.trashItem.findUnique({ where: { id: trashId } });
  if (!item) throw new Error("ট্র্যাশ আইটেম খুঁজে পাওয়া যায়নি");
  let payload: TrashPayload;
  try {
    payload = JSON.parse(item.payload) as TrashPayload;
  } catch {
    throw new Error("ট্র্যাশ স্ন্যাপশটটি পড়া যায়নি");
  }

  const res: RestoreResult = {
    restoredNodes: 0,
    restoredNotes: 0,
    restoredNoteItems: 0,
    restoredDocuments: 0,
    restoredLinks: 0,
    restoredQuestions: 0,
    restoredFlashcards: 0,
    restoredMcqs: 0,
  };

  switch (payload.kind) {
    case "node": {
      Object.assign(res, await restoreNodePayload(payload));
      break;
    }
    case "noteItem": {
      const it = payload.noteItem;
      if (it && (await db.treeNode.findUnique({ where: { id: it.nodeId }, select: { id: true } }))) {
        if (!(await db.noteItem.findUnique({ where: { id: it.id }, select: { id: true } }))) {
          await db.noteItem.create({
            data: {
              id: it.id,
              nodeId: it.nodeId,
              title: it.title,
              content: it.content,
              font: it.font,
              readCount: it.readCount,
              lastReadAt: it.lastReadAt ? new Date(it.lastReadAt) : null,
            },
          });
          res.restoredNoteItems = 1;
        }
      } else if (it) {
        throw new Error("মূল টপিকটি আর নেই — নোটটি ফেরানো যাচ্ছে না");
      }
      break;
    }
    case "document": {
      const d = payload.document;
      if (d && (await db.note.findUnique({ where: { id: d.noteId }, select: { id: true } }))) {
        if (!(await db.document.findUnique({ where: { id: d.id }, select: { id: true } }))) {
          await db.document.create({
            data: {
              id: d.id,
              noteId: d.noteId,
              name: d.name,
              ext: d.ext,
              mime: d.mime,
              size: d.size,
              path: d.path,
              readCount: d.readCount,
              lastReadAt: d.lastReadAt ? new Date(d.lastReadAt) : null,
            },
          });
          res.restoredDocuments = 1;
        }
      } else if (d) {
        throw new Error("মূল নোটটি আর নেই — ফাইলটি ফেরানো যাচ্ছে না");
      }
      break;
    }
    case "link": {
      const l = payload.link;
      if (l && (await db.note.findUnique({ where: { id: l.noteId }, select: { id: true } }))) {
        if (!(await db.link.findUnique({ where: { id: l.id }, select: { id: true } }))) {
          await db.link.create({
            data: {
              id: l.id,
              noteId: l.noteId,
              title: l.title,
              url: l.url,
              provider: l.provider,
              readCount: l.readCount,
              lastReadAt: l.lastReadAt ? new Date(l.lastReadAt) : null,
            },
          });
          res.restoredLinks = 1;
        }
      } else if (l) {
        throw new Error("মূল নোটটি আর নেই — লিংকটি ফেরানো যাচ্ছে না");
      }
      break;
    }
    case "question": {
      const q = payload.question;
      if (q) {
        let nodeId: string | null = null;
        if (q.nodeId) {
          const node = await db.treeNode.findUnique({ where: { id: q.nodeId }, select: { id: true } });
          nodeId = node ? q.nodeId : null;
        }
        if (!(await db.question.findUnique({ where: { id: q.id }, select: { id: true } }))) {
          await db.question.create({
            data: {
              id: q.id,
              nodeId,
              nodePath: q.nodePath,
              title: q.title,
              contentHtml: q.contentHtml,
              contentPlain: q.contentPlain,
              favorite: q.favorite,
              noteHtml: q.noteHtml,
              notePlain: q.notePlain,
            },
          });
          res.restoredQuestions = 1;
        }
        for (const a of payload.questionAttachments ?? []) {
          if (await db.questionAttachment.findUnique({ where: { id: a.id }, select: { id: true } })) continue;
          await db.questionAttachment.create({
            data: {
              id: a.id,
              questionId: q.id,
              kind: a.kind,
              name: a.name,
              ext: a.ext,
              mime: a.mime,
              size: a.size,
              path: a.path,
              url: a.url,
              provider: a.provider,
      contentHtml: a.contentHtml ?? "",
      font: a.font ?? "kalpurush",
            },
          });
        }
      }
      break;
    }
    case "questionAttachment": {
      const a = payload.questionAttachment;
      if (a && (await db.question.findUnique({ where: { id: a.questionId }, select: { id: true } }))) {
        if (!(await db.questionAttachment.findUnique({ where: { id: a.id }, select: { id: true } }))) {
          await db.questionAttachment.create({
            data: {
              id: a.id,
              questionId: a.questionId,
              kind: a.kind,
              name: a.name,
              ext: a.ext,
              mime: a.mime,
              size: a.size,
              path: a.path,
              url: a.url,
              provider: a.provider,
      contentHtml: a.contentHtml ?? "",
      font: a.font ?? "kalpurush",
            },
          });
        }
      } else if (a) {
        throw new Error("মূল প্রশ্নটি আর নেই — সোর্সটি ফেরানো যাচ্ছে না");
      }
      break;
    }
    case "flashcard": {
      const c = payload.flashcard;
      if (c && !(await db.flashcard.findUnique({ where: { id: c.id }, select: { id: true } }))) {
        await db.flashcard.create({
          data: {
            id: c.id,
            nodeId: c.nodeId,
            nodePath: c.nodePath,
            studyNodeId: c.studyNodeId,
            studyNodePath: c.studyNodePath,
            front: c.front,
            back: c.back,
            explanation: c.explanation,
            explanationHtml: c.explanationHtml,
            favorite: c.favorite,
            readLater: c.readLater,
            box: c.box,
            dueDate: new Date(c.dueDate),
            lastResult: c.lastResult,
            lastReviewedAt: c.lastReviewedAt ? new Date(c.lastReviewedAt) : null,
            reviewCount: c.reviewCount,
            wrongCount: c.wrongCount,
            suspended: c.suspended,
            source: c.source,
          },
        });
        res.restoredFlashcards = 1;
      }
      break;
    }
    case "mcq": {
      const m = payload.mcq;
      if (m && !(await db.mcq.findUnique({ where: { id: m.id }, select: { id: true } }))) {
        await db.mcq.create({
          data: {
            id: m.id,
            nodeId: m.nodeId,
            nodePath: m.nodePath,
            studyNodeId: m.studyNodeId,
            studyNodePath: m.studyNodePath,
            question: m.question,
            options: m.options,
            correctIndex: m.correctIndex,
            explanation: m.explanation,
            explanationHtml: m.explanationHtml,
            favorite: m.favorite,
            readLater: m.readLater,
            attempts: m.attempts,
            correctCount: m.correctCount,
            wrongCount: m.wrongCount,
            lastResult: m.lastResult,
            lastAttemptAt: m.lastAttemptAt ? new Date(m.lastAttemptAt) : null,
            inWrongBook: m.inWrongBook,
            suspended: m.suspended,
            source: m.source,
            tags: m.tags ?? "[]",
          },
        });
        res.restoredMcqs = 1;
      }
      break;
    }
  }

  await db.trashItem.delete({ where: { id: trashId } });
  return res;
}

/** Human one-line summary of what a restore brought back (Bengali). */
export function restoreSummary(res: RestoreResult): string {
  const parts = [
    res.restoredNodes ? `${res.restoredNodes}টি নোড` : "",
    res.restoredNoteItems ? `${res.restoredNoteItems}টি নোট-আইটেম` : "",
    res.restoredDocuments ? `${res.restoredDocuments}টি ফাইল` : "",
    res.restoredLinks ? `${res.restoredLinks}টি লিংক` : "",
    res.restoredQuestions ? `${res.restoredQuestions}টি প্রশ্ন` : "",
    res.restoredFlashcards ? `${res.restoredFlashcards}টি কার্ড` : "",
    res.restoredMcqs ? `${res.restoredMcqs}টি MCQ` : "",
  ].filter(Boolean);
  return parts.length ? `ফেরত এসেছে: ${parts.join(" · ")}` : "ইতোমধ্যেই ফেরত এসেছিল";
}
