// Server-only notification engine (#29 🔔 Notifications).
// Computes smart notifications from LIVE app data — nothing is stored except
// which fingerprints the user has already read (NotificationRead).
//
// Types:
//  1. due-revision    — flashcards due + MCQs not attempted for ≥ N days
//  2. weekly-progress — topics (notes) completed + plan items done this week
//  3. stale-subject   — root subjects not revised for ≥ N days (top 3)
//  4. exam-soon       — exam countdowns within N days
//  5. backup-due      — last backup older than N days
//  6. trash-pending   — items waiting in the Trash (Safe Delete #21)
//
// The whole system is CONFIGURABLE (AppSetting.notifSettings JSON).
import { db } from "@/lib/db";
import * as storage from "@/lib/storage";
import { toBn } from "@/lib/bcs-types";

// ---------- settings ----------

export interface NotifSettings {
  enabled: boolean;
  dueRevision: { on: boolean; mcqDays: number }; // MCQ stale window (days)
  weeklyProgress: { on: boolean };
  staleSubject: { on: boolean; days: number }; // notify when not revised ≥ days
  examSoon: { on: boolean; withinDays: number };
  backup: { on: boolean; days: number };
  trash: { on: boolean };
}

export const DEFAULT_NOTIF_SETTINGS: NotifSettings = {
  enabled: true,
  dueRevision: { on: true, mcqDays: 7 },
  weeklyProgress: { on: true },
  staleSubject: { on: true, days: 5 },
  examSoon: { on: true, withinDays: 30 },
  backup: { on: true, days: 7 },
  trash: { on: true },
};

export function parseNotifSettings(raw: string | null | undefined): NotifSettings {
  const def = DEFAULT_NOTIF_SETTINGS;
  if (!raw) return def;
  try {
    const p = JSON.parse(raw) as Partial<NotifSettings>;
    return {
      enabled: typeof p.enabled === "boolean" ? p.enabled : def.enabled,
      dueRevision: {
        on: p.dueRevision?.on ?? def.dueRevision.on,
        mcqDays:
          typeof p.dueRevision?.mcqDays === "number" && p.dueRevision.mcqDays >= 1
            ? Math.min(90, Math.round(p.dueRevision.mcqDays))
            : def.dueRevision.mcqDays,
      },
      weeklyProgress: { on: p.weeklyProgress?.on ?? def.weeklyProgress.on },
      staleSubject: {
        on: p.staleSubject?.on ?? def.staleSubject.on,
        days:
          typeof p.staleSubject?.days === "number" && p.staleSubject.days >= 1
            ? Math.min(90, Math.round(p.staleSubject.days))
            : def.staleSubject.days,
      },
      examSoon: {
        on: p.examSoon?.on ?? def.examSoon.on,
        withinDays:
          typeof p.examSoon?.withinDays === "number" && p.examSoon.withinDays >= 1
            ? Math.min(365, Math.round(p.examSoon.withinDays))
            : def.examSoon.withinDays,
      },
      backup: {
        on: p.backup?.on ?? def.backup.on,
        days:
          typeof p.backup?.days === "number" && p.backup.days >= 1
            ? Math.min(90, Math.round(p.backup.days))
            : def.backup.days,
      },
      trash: { on: p.trash?.on ?? def.trash.on },
    };
  } catch {
    return def;
  }
}

// ---------- item shape ----------

export type NotifType =
  | "due-revision"
  | "weekly-progress"
  | "stale-subject"
  | "exam-soon"
  | "backup-due"
  | "trash-pending";

export interface NotifAction {
  kind: "view" | "dialog";
  view?: "study" | "calendar" | "dashboard" | "favorites";
  nodeId?: string;
  dialog?: "backup" | "trash";
}

export interface NotificationItem {
  id: string; // stable fingerprint (read-state key)
  type: NotifType;
  level: "info" | "success" | "warning";
  icon: string; // lucide icon name — mapped client-side
  title: string; // Bengali message
  count: number;
  action?: NotifAction;
}

// ---------- date helpers ----------

/** Saturday-anchored week start (Bangladesh study week, matches the calendar). */
export function weekStart(from: Date = new Date()): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const offset = (d.getDay() + 1) % 7; // Sat → 0 … Fri → 6
  d.setDate(d.getDate() - offset);
  return d;
}

const dateOnly = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const DAY = 86_400_000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// ---------- backup meta (same convention as /api/backup/status) ----------

async function backupDaysSince(): Promise<number | null> {
  try {
    const meta = await storage.readBackupMeta();
    if (!meta?.lastBackupAt) return null;
    return Math.floor((Date.now() - new Date(meta.lastBackupAt).getTime()) / DAY);
  } catch {
    return null; // never backed up
  }
}

// ---------- computation ----------

async function collectRootActivity(rootIds: string[]): Promise<Map<string, number>> {
  // latest read-activity timestamp per root subject (days ago)
  const result = new Map<string, number>();
  if (!rootIds.length) return result;

  // map every descendant node to its root
  const all = await db.treeNode.findMany({
    select: { id: true, parentId: true },
  });
  const parentOf = new Map(all.map((n) => [n.id, n.parentId]));
  const rootOf = (id: string): string | null => {
    let cur: string | null = id;
    const seen = new Set<string>();
    while (cur) {
      if (seen.has(cur)) return null;
      seen.add(cur);
      if (rootIds.includes(cur)) return cur;
      cur = parentOf.get(cur) ?? null;
    }
    return null;
  };

  const nodeRoot = new Map<string, string>();
  for (const n of all) {
    const r = rootOf(n.id);
    if (r) nodeRoot.set(n.id, r);
  }
  if (!nodeRoot.size) return result;

  const nodeIds = [...nodeRoot.keys()];
  const [notes, noteItems, docRows, linkRows] = await Promise.all([
    db.note.findMany({ where: { nodeId: { in: nodeIds }, lastReadAt: { not: null } }, select: { nodeId: true, lastReadAt: true } }),
    db.noteItem.findMany({ where: { nodeId: { in: nodeIds }, lastReadAt: { not: null } }, select: { nodeId: true, lastReadAt: true } }),
    db.document.findMany({
      where: { note: { nodeId: { in: nodeIds } }, lastReadAt: { not: null } },
      select: { lastReadAt: true, note: { select: { nodeId: true } } },
    }),
    db.link.findMany({
      where: { note: { nodeId: { in: nodeIds } }, lastReadAt: { not: null } },
      select: { lastReadAt: true, note: { select: { nodeId: true } } },
    }),
  ]);

  const latest = new Map<string, number>();
  const touch = (rootId: string, ts: number) => {
    const cur = latest.get(rootId) ?? 0;
    if (ts > cur) latest.set(rootId, ts);
  };
  for (const n of notes) {
    const r = nodeRoot.get(n.nodeId);
    if (r && n.lastReadAt) touch(r, n.lastReadAt.getTime());
  }
  for (const n of noteItems) {
    const r = nodeRoot.get(n.nodeId);
    if (r && n.lastReadAt) touch(r, n.lastReadAt.getTime());
  }
  for (const d of docRows) {
    const r = nodeRoot.get(d.note.nodeId);
    if (r && d.lastReadAt) touch(r, d.lastReadAt.getTime());
  }
  for (const l of linkRows) {
    const r = nodeRoot.get(l.note.nodeId);
    if (r && l.lastReadAt) touch(r, l.lastReadAt.getTime());
  }

  const now = Date.now();
  for (const [rootId, ts] of latest) {
    result.set(rootId, Math.floor((now - ts) / DAY));
  }
  return result;
}

export async function computeNotifications(settings: NotifSettings): Promise<NotificationItem[]> {
  if (!settings.enabled) return [];
  const items: NotificationItem[] = [];
  const now = new Date();

  // 1. exam-soon (highest priority)
  if (settings.examSoon.on) {
    const exams = await db.examCountdown.findMany({ orderBy: { date: "asc" } });
    const today0 = startOfDay(now).getTime();
    for (const e of exams) {
      const target = new Date(`${e.date}T00:00:00`).getTime();
      if (Number.isNaN(target)) continue;
      const daysUntil = Math.round((target - today0) / DAY);
      if (daysUntil >= 0 && daysUntil <= settings.examSoon.withinDays) {
        items.push({
          id: `exam-soon:${e.id}`,
          type: "exam-soon",
          level: "warning",
          icon: "CalendarClock",
          title:
            daysUntil === 0
              ? `«${e.title}» পরীক্ষা আজ!`
              : `«${e.title}» পরীক্ষা আর ${toBn(daysUntil)} দিন বাকি`,
          count: daysUntil,
          action: { kind: "view", view: "calendar" },
        });
      }
    }
  }

  // 2. due-revision
  if (settings.dueRevision.on) {
    const [dueCards, staleMcqs] = await Promise.all([
      db.flashcard.count({ where: { dueDate: { lte: now }, suspended: false } }),
      db.mcq.count({
        where: {
          suspended: false,
          attempts: { gt: 0 },
          lastAttemptAt: { lte: new Date(now.getTime() - settings.dueRevision.mcqDays * DAY) },
        },
      }),
    ]);
    const total = dueCards + staleMcqs;
    if (total > 0) {
      items.push({
        id: `due-revision:${dateOnly(now)}`,
        type: "due-revision",
        level: "info",
        icon: "RefreshCw",
        title: `${toBn(total)}টি প্রশ্ন রিভিশনের জন্য বাকি আছে`,
        count: total,
        action: { kind: "view", view: "study" },
      });
    }
  }

  // 3. stale-subject (top 3)
  if (settings.staleSubject.on) {
    const roots = await db.treeNode.findMany({
      where: { parentId: null },
      select: { id: true, name: true },
    });
    const activity = await collectRootActivity(roots.map((r) => r.id));
    const nameOf = new Map(roots.map((r) => [r.id, r.name]));
    const stale = [...activity.entries()]
      .filter(([, days]) => days >= settings.staleSubject.days)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    for (const [rootId, days] of stale) {
      items.push({
        id: `stale-subject:${rootId}:${days}`,
        type: "stale-subject",
        level: "warning",
        icon: "History",
        title: `আপনি “${nameOf.get(rootId) ?? "বিষয়"}” ${toBn(days)} দিন ধরে রিভিশন করেননি`,
        count: days,
        action: { kind: "view", view: "dashboard", nodeId: rootId },
      });
    }
  }

  // 4. weekly-progress (only when there IS progress)
  if (settings.weeklyProgress.on) {
    const ws = weekStart(now);
    const [notesDone, planDone] = await Promise.all([
      db.note.count({ where: { completed: true, updatedAt: { gte: ws } } }),
      db.planItem.count({ where: { done: true, date: { gte: dateOnly(ws) } } }),
    ]);
    const total = notesDone + planDone;
    if (total > 0) {
      items.push({
        id: `weekly-progress:${dateOnly(ws)}`,
        type: "weekly-progress",
        level: "success",
        icon: "PartyPopper",
        title: `এই সপ্তাহে ${toBn(total)}টি টপিক সম্পন্ন হয়েছে`,
        count: total,
        action: { kind: "view", view: "dashboard" },
      });
    }
  }

  // 5. backup-due (local-only — cloud storage is backed by Vercel Blob/Neon)
  if (settings.backup.on && !storage.isCloud) {
    const days = await backupDaysSince();
    if (days == null || days >= settings.backup.days) {
      items.push({
        id: `backup-due:${dateOnly(now)}`,
        type: "backup-due",
        level: "warning",
        icon: "DatabaseBackup",
        title:
          days == null
            ? "এখনো কোনো ব্যাকআপ নেওয়া হয়নি"
            : `${toBn(days)} দিন ধরে ব্যাকআপ নেওয়া হয়নি`,
        count: days ?? 999,
        action: { kind: "dialog", dialog: "backup" },
      });
    }
  }

  // 6. trash-pending
  if (settings.trash.on) {
    const count = await db.trashItem.count();
    if (count > 0) {
      items.push({
        id: `trash-pending:${dateOnly(now)}`,
        type: "trash-pending",
        level: "info",
        icon: "Trash2",
        title: `ট্র্যাশে ${toBn(count)}টি আইটেম অপেক্ষা করছে — দরকার হলে ফেরান`,
        count,
        action: { kind: "dialog", dialog: "trash" },
      });
    }
  }

  return items;
}
