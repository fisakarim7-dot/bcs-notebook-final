import { db } from "@/lib/db";
import type { CrossLinkKind, CrossLinkTarget } from "@/lib/bcs-types";

/**
 * Cross Linking (#33) server engine.
 *
 * - Canonical kind-rank normalization (a→b and b→a are the same row).
 * - Live content index (nodes / noteItems / documents / links / questions)
 *   used both to enrich targets (title/path/nodeId) and to compute
 *   keyword-based AUTO-MATCH suggestions.
 * - Bengali-aware tokenizer: unicode-letter tokens, stopword filter and
 *   prefix matching (≥4 shared chars) so সংবিধান / সংবিধানে / সংবিধানের
 *   all match each other.
 */

export const CROSS_LINK_KINDS: readonly CrossLinkKind[] = [
  "node",
  "noteItem",
  "document",
  "link",
  "question",
] as const;

// lower rank first → canonical storage direction
const KIND_RANK: Record<string, number> = {
  node: 0,
  question: 1,
  noteItem: 2,
  document: 3,
  link: 4,
};

export function isCrossLinkKind(k: string): k is CrossLinkKind {
  return (CROSS_LINK_KINDS as readonly string[]).includes(k);
}

/** Canonical (source,target) pair — makes a→b / b→a dedupe to one row. */
export function normalizePair(
  a: { kind: string; id: string },
  b: { kind: string; id: string }
): { sourceKind: string; sourceId: string; targetKind: string; targetId: string } {
  const ra = KIND_RANK[a.kind] ?? 99;
  const rb = KIND_RANK[b.kind] ?? 99;
  const aFirst = ra < rb || (ra === rb && a.id <= b.id);
  const s = aFirst ? a : b;
  const t = aFirst ? b : a;
  return {
    sourceKind: s.kind,
    sourceId: s.id,
    targetKind: t.kind,
    targetId: t.id,
  };
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// ---------- tokenizer ----------

/** Core Bengali + English function words — never used as match keywords. */
const STOPWORDS = new Set([
  // Bengali
  "এবং", "ও", "অথবা", "বা", "কিন্তু", "তাই", "যদি", "ময়", "না", "নয়", "নেই",
  "আছে", "ছিল", "হয়", "হবে", "হয়েছে", "হয়েছিল", "হচ্ছে", "করা", "করে", "করুন",
  "করেন", "করি", "হয়তো", "যে", "যা", "যেহেতু", "যদিও", "তবে", "তথ্য",
  "এই", "সেই", "ঐ", "এ", "তা", "তার", "তাহার", "তাদের", "এর", "এদের", "এটি",
  "এটা", "সেটি", "সেটা", "আমি", "আমার", "আমরা", "তুমি", "তোমার", "আপনি",
  "সে", "তুলে", "মধ্যে", "ভিতরে", "বাইরে", "উপর", "উপরে", "নিচে", "আগে",
  "পরে", "সাথে", "সঙ্গে", "জন্য", "দ্বারা", "থেকে", "পর্যন্ত", "সহ", "কোন",
  "কোনো", "কত", "কতগুলো", "কয়টি", "কখন", "কোথায়", "কেন", "কী", "কি", "কে",
  "কাকে", "কার", "কীভাবে", "কেমন", "একটি", "একটা", "একটির", "দুটি", "টি", "টা",
  "গুলো", "গুলি", "সব", "সবাই", "অনেক", "কম", "বেশি", "আরও", "আবার", "শুধু",
  "মাত্র", "প্রতি", "প্রতিটি", "প্রত্যেক", "সমস্ত", "এমন", "যেমন", "তেমন",
  "যত", "যতটা", "যার", "যাদের", "হিসাবে", "হিসেবে", "মতো", "নিয়ে", "দিয়ে",
  "রয়েছে", "রইল", "চলে", "দেয়া", "দেওয়া", "পাওয়া", "জানা", "বলা", "লিখা",
  "লেখা", "পড়া", "নতুন", "পুরোনো",
  // English
  "the", "a", "an", "and", "or", "but", "if", "of", "in", "on", "at", "to",
  "for", "with", "by", "from", "as", "is", "are", "was", "were", "be", "been",
  "being", "it", "its", "this", "that", "these", "those", "what", "which",
  "who", "whom", "when", "where", "why", "how", "not", "no", "do", "does",
  "did", "has", "have", "had", "will", "would", "can", "could", "about",
  "into", "over", "under", "than", "then", "so", "such", "there", "their",
  "them", "they", "we", "you", "your", "our", "his", "her", "all", "any",
  "some", "more", "most", "other", "also", "just",
]);

/** Unicode letters/numbers → tokens (covers Bengali block), lowercased, ≥2 chars. */
export function tokenize(text: string): string[] {
  const raw = (text || "")
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu);
  if (!raw) return [];
  return raw.filter((t) => t.length >= 2 && !/^[0-9]+$/.test(t) && !STOPWORDS.has(t));
}

/** exact OR shared-prefix (≥4 chars) match — handles Bengali inflections. */
export function tokensMatch(a: string, b: string): boolean {
  if (a === b) return true;
  const min = Math.min(a.length, b.length);
  return min >= 4 && (a.startsWith(b) || b.startsWith(a));
}

/** Does a token match any token in the set? */
function setHasMatch(set: Set<string>, tok: string): boolean {
  if (set.has(tok)) return true;
  for (const t of set) if (tokensMatch(t, tok)) return true;
  return false;
}

// ---------- content index ----------

interface IndexNode {
  id: string;
  name: string;
  parentId: string | null;
}
interface IndexItem {
  id: string;
  title: string;
  content: string;
  nodeId: string | null;
}
interface IndexDoc {
  id: string;
  name: string;
  ext: string;
  nodeId: string | null;
}
interface IndexLink {
  id: string;
  title: string;
  url: string;
  nodeId: string | null;
}
interface IndexQuestion {
  id: string;
  title: string;
  contentPlain: string;
  notePlain: string;
  nodeId: string | null;
  nodePath: string | null;
}

export interface ContentIndex {
  nodes: IndexNode[];
  noteItems: IndexItem[];
  documents: IndexDoc[];
  links: IndexLink[];
  questions: IndexQuestion[];
  nodeById: Map<string, IndexNode>;
  pathOf(nodeId: string | null | undefined): string;
}

export async function buildContentIndex(): Promise<ContentIndex> {
  const [nodes, noteItems, documents, links, questions] = await Promise.all([
    db.treeNode.findMany({ select: { id: true, name: true, parentId: true } }),
    db.noteItem.findMany({
      select: { id: true, title: true, content: true, nodeId: true },
    }),
    db.document.findMany({
      select: { id: true, name: true, ext: true, note: { select: { nodeId: true } } },
    }),
    db.link.findMany({
      select: {
        id: true,
        title: true,
        url: true,
        note: { select: { nodeId: true } },
      },
    }),
    db.question.findMany({
      select: {
        id: true,
        title: true,
        contentPlain: true,
        notePlain: true,
        nodeId: true,
        nodePath: true,
      },
    }),
  ]);

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  return {
    nodes,
    noteItems,
    documents: documents.map((d) => ({ ...d, nodeId: d.note.nodeId })),
    links: links.map((l) => ({ ...l, nodeId: l.note.nodeId })),
    questions,
    nodeById,
    pathOf(nodeId) {
      if (!nodeId) return "";
      const parts: string[] = [];
      let cur = nodeById.get(nodeId);
      while (cur) {
        parts.unshift(cur.name);
        cur = cur.parentId ? nodeById.get(cur.parentId) : undefined;
      }
      return parts.join(" / ");
    },
  };
}

// ---------- enrichment ----------

const TITLE_FALLBACK = {
  noteItem: "শিরোনামহীন নোট",
  question: "শিরোনামহীন প্রশ্ন",
  document: "শিরোনামহীন ফাইল",
  link: "শিরোনামহীন লিংক",
  node: "শিরোনামহীন টপিক",
};

/** Resolve one (kind,id) against the index → display target, or null if gone. */
export function enrichTarget(
  kind: string,
  id: string,
  idx: ContentIndex
): CrossLinkTarget | null {
  switch (kind) {
    case "node": {
      const n = idx.nodeById.get(id);
      if (!n) return null;
      return { kind, id, title: n.name, path: idx.pathOf(n.parentId), nodeId: n.id };
    }
    case "noteItem": {
      const it = idx.noteItems.find((x) => x.id === id);
      if (!it) return null;
      const fallback = stripHtml(it.content).slice(0, 60);
      return {
        kind,
        id,
        title: it.title.trim() || fallback || TITLE_FALLBACK.noteItem,
        path: idx.pathOf(it.nodeId),
        nodeId: it.nodeId,
      };
    }
    case "document": {
      const d = idx.documents.find((x) => x.id === id);
      if (!d) return null;
      return {
        kind,
        id,
        title: d.name.trim() || TITLE_FALLBACK.document,
        path: idx.pathOf(d.nodeId),
        nodeId: d.nodeId,
        ext: d.ext,
      };
    }
    case "link": {
      const l = idx.links.find((x) => x.id === id);
      if (!l) return null;
      return {
        kind,
        id,
        title: l.title.trim() || l.url || TITLE_FALLBACK.link,
        path: idx.pathOf(l.nodeId),
        nodeId: l.nodeId,
        url: l.url,
      };
    }
    case "question": {
      const q = idx.questions.find((x) => x.id === id);
      if (!q) return null;
      const fallback = stripHtml(q.contentPlain).slice(0, 90);
      return {
        kind,
        id,
        title: q.title.trim() || fallback || TITLE_FALLBACK.question,
        path: q.nodePath || idx.pathOf(q.nodeId),
        nodeId: q.nodeId,
      };
    }
    default:
      return null;
  }
}

/** The tree node a source item belongs to (excluded from node-kind suggestions). */
export function selfNodeIdOf(kind: string, id: string, idx: ContentIndex): string | null {
  if (kind === "node") return id;
  if (kind === "noteItem") return idx.noteItems.find((x) => x.id === id)?.nodeId ?? null;
  if (kind === "document") return idx.documents.find((x) => x.id === id)?.nodeId ?? null;
  if (kind === "link") return idx.links.find((x) => x.id === id)?.nodeId ?? null;
  if (kind === "question") return idx.questions.find((x) => x.id === id)?.nodeId ?? null;
  return null;
}

// ---------- auto-match ----------

const MAX_SRC_TOKENS = 80;
const MAX_BODY_CHARS = 4000;
const MAX_PER_GROUP = 5;

interface Scored extends CrossLinkTarget {
  score: number;
}

/** Keyword frequency map of the SOURCE content (top tokens only). */
function sourceTokens(text: string): [string, number][] {
  const freq = new Map<string, number>();
  for (const t of tokenize(text)) freq.set(t, (freq.get(t) ?? 0) + 1);
  // dedupe near-identical tokens (prefix collisions) keeping the shorter stem
  const merged = new Map<string, number>();
  for (const [t, f] of freq) {
    let hit: string | null = null;
    for (const m of merged.keys()) {
      if (tokensMatch(m, t)) {
        hit = m;
        break;
      }
    }
    if (hit) merged.set(hit, (merged.get(hit) ?? 0) + f);
    else merged.set(t, f);
  }
  return [...merged.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SRC_TOKENS);
}

interface CandText {
  name: string;
  body: string;
}

function candidateText(kind: string, idx: ContentIndex): (CandText | null)[] {
  switch (kind) {
    case "node":
      return idx.nodes.map((n) => ({ name: n.name, body: "" }));
    case "noteItem":
      return idx.noteItems.map((it) => ({
        name: it.title,
        body: stripHtml(it.content).slice(0, MAX_BODY_CHARS),
      }));
    case "document":
      return idx.documents.map((d) => ({ name: d.name, body: "" }));
    case "link":
      return idx.links.map((l) => ({ name: l.title, body: l.url }));
    case "question":
      return idx.questions.map((q) => ({
        name: q.title,
        body: `${q.contentPlain.slice(0, MAX_BODY_CHARS)}\n${q.notePlain.slice(0, MAX_BODY_CHARS)}`,
      }));
    default:
      return [];
  }
}

function idsOf(kind: string, idx: ContentIndex): { id: string; nodeId: string | null }[] {
  switch (kind) {
    case "node":
      return idx.nodes.map((n) => ({ id: n.id, nodeId: n.id }));
    case "noteItem":
      return idx.noteItems.map((x) => ({ id: x.id, nodeId: x.nodeId }));
    case "document":
      return idx.documents.map((x) => ({ id: x.id, nodeId: x.nodeId }));
    case "link":
      return idx.links.map((x) => ({ id: x.id, nodeId: x.nodeId }));
    case "question":
      return idx.questions.map((x) => ({ id: x.id, nodeId: x.nodeId }));
    default:
      return [];
  }
}

export interface SuggestOptions {
  /** already manually linked "kind:id" keys — excluded from suggestions */
  linkedKeys: Set<string>;
}

/**
 * Compute auto-match suggestions for one source across all target kinds.
 * Acceptance rules keep precision high:
 * - node (short name): matched name tokens must cover ≥ half of the name.
 * - long-form items: ≥2 distinct matched keywords, or ≥1 if in the title.
 */
export function suggestFor(
  kind: string,
  id: string,
  idx: ContentIndex,
  opts: SuggestOptions
): { kind: string; items: Scored[] }[] {
  const sourceText = sourceTextOf(kind, id, idx);
  if (!sourceText) return [];
  const src = sourceTokens(sourceText);
  if (src.length === 0) return [];
  const selfNodeId = selfNodeIdOf(kind, id, idx);

  const groups: { kind: string; items: Scored[] }[] = [];

  for (const targetKind of CROSS_LINK_KINDS) {
    const texts = candidateText(targetKind, idx);
    const ids = idsOf(targetKind, idx);
    const scored: Scored[] = [];

    for (let i = 0; i < texts.length; i++) {
      const meta = ids[i];
      if (!meta || !meta.id) continue;
      if (targetKind === kind && meta.id === id) continue; // never suggest self
      if (targetKind === "node" && selfNodeId && meta.id === selfNodeId) continue;
      if (opts.linkedKeys.has(`${targetKind}:${meta.id}`)) continue;

      const cand = texts[i];
      if (!cand) continue;
      const nameTokens = new Set(tokenize(cand.name));
      if (targetKind === "node" && nameTokens.size === 0) continue;
      const bodyTokens = new Set(tokenize(cand.body));

      let weight = 0;
      let distinct = 0;
      let matchedName = 0;
      for (const [tok, f] of src) {
        const inName = nameTokens.size > 0 && setHasMatch(nameTokens, tok);
        const inBody = !inName && bodyTokens.size > 0 && setHasMatch(bodyTokens, tok);
        if (!inName && !inBody) continue;
        distinct++;
        weight += f * (inName ? 2 : 1);
        if (inName) matchedName++;
      }

      let ok: boolean;
      if (targetKind === "node") {
        ok = matchedName >= 1 && matchedName >= Math.ceil(nameTokens.size / 2);
      } else {
        ok = distinct >= 2 || matchedName >= 1;
      }
      if (!ok) continue;

      const target = enrichTarget(targetKind, meta.id, idx);
      if (!target) continue;
      if (targetKind !== "node" && !target.nodeId) continue; // need a place to navigate
      scored.push({ ...target, score: weight });
    }

    scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "bn"));
    groups.push({ kind: targetKind, items: scored.slice(0, MAX_PER_GROUP) });
  }

  return groups;
}

/** Full text of a source item (title repeated for extra weight). */
function sourceTextOf(kind: string, id: string, idx: ContentIndex): string {
  switch (kind) {
    case "node": {
      const n = idx.nodeById.get(id);
      return n ? `${n.name}\n${n.name}` : "";
    }
    case "noteItem": {
      const it = idx.noteItems.find((x) => x.id === id);
      return it ? `${it.title}\n${it.title}\n${stripHtml(it.content).slice(0, MAX_BODY_CHARS)}` : "";
    }
    case "document": {
      const d = idx.documents.find((x) => x.id === id);
      return d ? `${d.name}\n${d.name}` : "";
    }
    case "link": {
      const l = idx.links.find((x) => x.id === id);
      return l ? `${l.title}\n${l.title}\n${l.url}` : "";
    }
    case "question": {
      const q = idx.questions.find((x) => x.id === id);
      return q
        ? `${q.title}\n${q.title}\n${q.contentPlain.slice(0, MAX_BODY_CHARS)}\n${q.notePlain.slice(0, MAX_BODY_CHARS)}`
        : "";
    }
    default:
      return "";
  }
}

/** "kind:id" keys of every existing manual link attached to a source. */
export async function linkedKeysFor(kind: string, id: string): Promise<Set<string>> {
  const rows = await db.crossLink.findMany({
    where: {
      OR: [
        { sourceKind: kind, sourceId: id },
        { targetKind: kind, targetId: id },
      ],
    },
    select: { sourceKind: true, sourceId: true, targetKind: true, targetId: true },
  });
  const set = new Set<string>();
  for (const r of rows) {
    if (r.sourceKind === kind && r.sourceId === id) set.add(`${r.targetKind}:${r.targetId}`);
    else set.add(`${r.sourceKind}:${r.sourceId}`);
  }
  return set;
}
