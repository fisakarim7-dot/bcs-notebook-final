/**
 * Export / Import (exim) — a full-fidelity, provider-agnostic data bundle.
 *
 * This powers BOTH:
 *   - the laptop → cloud migration tool, and
 *   - a cross-mode backup/restore that works on SQLite AND Postgres.
 *
 * The bundle is a ZIP containing `data.json` (every table as plain JSON,
 * DateTime fields as ISO strings — Prisma re-parses them on insert) plus the
 * uploaded files under `uploads/`. Because it is plain JSON + files, it can be
 * produced on one backend and applied on the other.
 */
import { db } from "./db";
import * as storage from "./storage";

// delegate key + whether rows form a self-referencing parent tree
interface TableSpec {
  key: keyof typeof db & string;
  selfRef?: boolean;
}

// CREATE order: parents before children.
const CREATE_ORDER: TableSpec[] = [
  { key: "appSetting" },
  { key: "treeNode", selfRef: true },
  { key: "studyNode", selfRef: true },
  { key: "note" },
  { key: "noteItem" },
  { key: "document" },
  { key: "link" },
  { key: "annotation" },
  { key: "studySession" },
  { key: "flashcard" },
  { key: "mcq" },
  { key: "mcqReview" },
  { key: "quizAttempt" },
  { key: "question" },
  { key: "questionAttachment" },
  { key: "favorite" },
  { key: "planItem" },
  { key: "dayStatus" },
  { key: "crossLink" },
  { key: "examCountdown" },
  { key: "currentAffair" },
  { key: "syllabusItem" },
  { key: "writtenAttempt" },
  { key: "noteVersion" },
  { key: "fsrsState" },
  { key: "trashItem" },
  { key: "notificationRead" },
];

// DELETE order: children first (reverse-ish of create).
const DELETE_ORDER: TableSpec[] = [
  { key: "noteVersion" },
  { key: "fsrsState" },
  { key: "mcqReview" },
  { key: "annotation" },
  { key: "studySession" },
  { key: "quizAttempt" },
  { key: "link" },
  { key: "document" },
  { key: "note" },
  { key: "noteItem" },
  { key: "questionAttachment" },
  { key: "question" },
  { key: "flashcard" },
  { key: "mcq" },
  { key: "favorite" },
  { key: "planItem" },
  { key: "dayStatus" },
  { key: "crossLink" },
  { key: "examCountdown" },
  { key: "currentAffair" },
  { key: "syllabusItem" },
  { key: "writtenAttempt" },
  { key: "trashItem" },
  { key: "notificationRead" },
  { key: "treeNode", selfRef: true },
  { key: "studyNode", selfRef: true },
  { key: "appSetting" },
];

type Row = Record<string, unknown>;

/** Serialise a table to plain JSON (Date -> ISO string). */
function ser(rows: unknown[]): Row[] {
  return JSON.parse(JSON.stringify(rows)) as Row[];
}

/** Group self-referencing rows into levels: a level only points at earlier
 *  levels, so every level can be inserted in ONE batched statement. */
function levels(rows: Row[]): Row[][] {
  const byId = new Map<string, Row>();
  for (const r of rows) if (typeof r.id === "string") byId.set(r.id, r);

  const depth = new Map<Row, number>();
  const depthOf = (r: Row, guard: Set<Row>): number => {
    const hit = depth.get(r);
    if (hit !== undefined) return hit;
    const pid = (r.parentId as string | null) ?? null;
    const parent = pid ? byId.get(pid) : undefined;
    // no parent, unknown parent, or a cycle → treat as a root
    if (!parent || guard.has(parent)) {
      depth.set(r, 0);
      return 0;
    }
    guard.add(parent);
    const d = depthOf(parent, guard) + 1;
    depth.set(r, d);
    return d;
  };

  const out: Row[][] = [];
  for (const r of rows) {
    const d = depthOf(r, new Set<Row>());
    (out[d] ??= []).push(r);
  }
  return out;
}

/** Split into batches of at most n rows (keeps each statement small). */
function batch<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out.length ? out : [];
}

/** Postgres table name for a delegate key (schema uses no @@map). */
function tableName(key: string): string {
  return `"${key.charAt(0).toUpperCase()}${key.slice(1)}"`;
}

function isPostgres(): boolean {
  return /^postgres(ql)?:(\/\/|[^/])/i.test((process.env.DATABASE_URL ?? "").trim());
}

export interface EximData {
  version: 1;
  exportedAt: string;
  tables: Record<string, Row[]>;
}

/** Read every table into a bundle. */
export async function collectData(): Promise<EximData> {
  const tables: Record<string, Row[]> = {};
  for (const spec of CREATE_ORDER) {
    const delegate = (db as unknown as Record<string, { findMany: (a?: object) => Promise<unknown[]> }>)[spec.key];
    tables[spec.key] = ser(await delegate.findMany());
  }
  return { version: 1, exportedAt: new Date().toISOString(), tables };
}

// Prisma's default interactive-transaction timeout is only 5s, which a Neon
// import easily exceeds → the tx is closed mid-flight and the next query dies
// with P2028 ("Transaction not found"). Match the serverless function limit.
const TX_OPTIONS = { maxWait: 10_000, timeout: 55_000 };
const ROWS_PER_STATEMENT = 200;

/** Wipe all tables and re-insert the bundle. */
export async function applyData(data: EximData): Promise<{ counts: Record<string, number> }> {
  const counts: Record<string, number> = {};

  await db.$transaction(async (tx) => {
    const t = tx as unknown as Record<
      string,
      {
        deleteMany: () => Promise<{ count: number }>;
        createMany: (a: { data: Row[] }) => Promise<{ count: number }>;
      }
    >;

    // 1) Wipe. On Postgres one TRUNCATE replaces ~27 round-trips — over a
    //    remote (Neon) connection that is the difference between seconds and
    //    a transaction timeout.
    if (isPostgres()) {
      const names = DELETE_ORDER.map((s) => tableName(s.key)).join(", ");
      const raw = tx as unknown as { $executeRawUnsafe: (q: string) => Promise<number> };
      await raw.$executeRawUnsafe(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
    } else {
      for (const spec of DELETE_ORDER) {
        await t[spec.key].deleteMany();
      }
    }

    // 2) Insert in batches (one statement per batch, not per row).
    for (const spec of CREATE_ORDER) {
      const rows = data.tables[spec.key] ?? [];
      // Self-referencing tables: insert level by level so a parent is always
      // committed before its children reference it.
      const groups = spec.selfRef ? levels(rows) : [rows];
      for (const group of groups) {
        for (const part of batch(group, ROWS_PER_STATEMENT)) {
          await t[spec.key].createMany({ data: part });
        }
      }
      counts[spec.key] = rows.length;
    }
  }, TX_OPTIONS);

  return { counts };
}

/** List upload file names present in the bundle source (current storage). */
export async function collectUploads(): Promise<{ name: string; data: Buffer }[]> {
  const names = await storage.listFiles();
  const out: { name: string; data: Buffer }[] = [];
  for (const name of names) {
    const buf = await storage.readFile(name);
    if (buf) out.push({ name, data: buf });
  }
  return out;
}
