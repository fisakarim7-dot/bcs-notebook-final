"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  Award,
  BarChart3,
  BookOpen,
  FileCode2,
  FileText,
  FileType,
  History,
  Layers,
  Link2,
  Loader2,
  NotebookPen,
  RotateCcw,
  Target,
  Zap,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  Tooltip as ReTooltip,
} from "recharts";
import { Button } from "@/components/ui/button";
import { fetchMastery, markRead } from "@/lib/bcs-api";
import {
  toBn,
  type MasteryDTO,
  type MasteryItem,
  type MasterySubject,
} from "@/lib/bcs-types";
import { cn } from "@/lib/utils";
import { StatCard } from "./dashboard";

/* ─── Palette (mirrors dashboard RING_COLORS; never blue/indigo) ─── */
const RING_COLORS = ["#149d8c", "#d9a13c", "#dd7a5c", "#5f9e7f", "#b48ad9", "#8bc34a"];
const BUCKET_COLORS = ["#9ca3af", "#149d8c", "#5f9e7f", "#d9a13c", "#dd7a5c", "#b48ad9"];
const BUCKET_KEYS = ["b0", "b1", "b2", "b3", "b4", "b5"] as const;
const BUCKET_LEGEND = ["০ বার", "১ বার", "২ বার", "৩ বার", "৪ বার", "৫+ বার"];
const BUCKET_TOOLTIP = ["পড়া হয়নি", "১ বার পড়া", "২ বার পড়া", "৩ বার পড়া", "৪ বার পড়া", "৫+ বার পড়া"];

/* ─── Staggered reveal (same pattern as dashboard.tsx) ─── */
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};

/* ─── Helpers ─── */

/** Compact Bengali chart label, e.g. "বাংলা (Bangla)" → "বাংলা". */
function shortSubjectName(name: string): string {
  const bnWords = name.match(/[\u0980-\u09FF]+/g);
  if (!bnWords || bnWords.length === 0) {
    return name.length > 12 ? `${name.slice(0, 11)}…` : name;
  }
  const joined = bnWords.join(" ");
  return joined.length <= 14 ? joined : bnWords[0];
}

let relativeFmt: Intl.RelativeTimeFormat | null = null;
function relativeBn(iso: string): string {
  try {
    relativeFmt ??= new Intl.RelativeTimeFormat("bn-BD", { numeric: "auto" });
    const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (diffMin < 1) return "এইমাত্র";
    if (diffMin < 60) return relativeFmt.format(-diffMin, "minute");
    const hr = Math.round(diffMin / 60);
    if (hr < 24) return relativeFmt.format(-hr, "hour");
    const day = Math.round(hr / 24);
    if (day < 30) return relativeFmt.format(-day, "day");
    const mo = Math.round(day / 30);
    if (mo < 12) return relativeFmt.format(-mo, "month");
    return relativeFmt.format(-Math.round(mo / 12), "year");
  } catch {
    return new Date(iso).toLocaleDateString("bn-BD");
  }
}

function ItemIcon({ item, className }: { item: MasteryItem; className?: string }) {
  if (item.kind === "noteItem") return <NotebookPen className={className} />;
  if (item.kind === "link") return <Link2 className={className} />;
  // ext-aware document icon (ext inferred from the title's extension)
  const t = item.title.toLowerCase();
  if (t.endsWith(".docx") || t.endsWith(".doc")) return <FileType className={className} />;
  if (t.endsWith(".html") || t.endsWith(".htm")) return <FileCode2 className={className} />;
  return <FileText className={className} />;
}

/** Optimistic local patch of one "+১" read across the whole mastery DTO. */
function applyRead(old: MasteryDTO, kind: MasteryItem["kind"], id: string): MasteryDTO {
  const nowIso = new Date().toISOString();
  const target = old.target;
  const sumMin = (items: MasteryItem[]) =>
    items.reduce((acc, it) => acc + Math.min(it.readCount, target), 0);

  let crossed = 0;
  let found = false;
  const subjects = old.subjects.map((s) => {
    const idx = s.items.findIndex((it) => it.id === id && it.kind === kind);
    if (idx === -1) return s;
    found = true;
    const it = s.items[idx];
    const newCount = it.readCount + 1;
    if (it.readCount < target && newCount >= target) crossed = 1;

    const items = s.items.slice();
    items[idx] = { ...it, readCount: newCount, lastReadAt: nowIso };

    const dist = s.distribution.slice();
    dist[Math.min(it.readCount, 5)] = Math.max(0, (dist[Math.min(it.readCount, 5)] ?? 0) - 1);
    dist[Math.min(newCount, 5)] = (dist[Math.min(newCount, 5)] ?? 0) + 1;

    const totalReads = s.totalReads + 1;
    const masteryPct =
      s.totalItems > 0 ? Math.round((sumMin(items) / (s.totalItems * target)) * 100) : 0;

    return {
      ...s,
      items,
      distribution: dist,
      totalReads,
      masteredItems: s.masteredItems + crossed,
      masteryPct,
    };
  });

  if (!found) return old;

  const totalItems = subjects.reduce((a, s) => a + s.totalItems, 0);
  const totalReads = subjects.reduce((a, s) => a + s.totalReads, 0);
  const masteredItems = subjects.reduce((a, s) => a + s.masteredItems, 0);
  const masteryPct =
    totalItems > 0
      ? Math.round((subjects.reduce((a, s) => a + sumMin(s.items), 0) / (totalItems * target)) * 100)
      : 0;

  return { ...old, subjects, overall: { totalItems, totalReads, masteredItems, masteryPct } };
}

/* ─── Sub-components ─── */

/** ProgressRing look-alike that renders Bengali digits via toBn(). */
function MasteryRing({
  percent,
  size = 82,
  stroke = 8,
  color,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  color: string;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, percent));

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          stroke={color}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference * (1 - clamped / 100) }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: `drop-shadow(0 0 5px ${color}55)` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-bengali text-base font-bold leading-none">{toBn(clamped)}%</span>
      </div>
    </div>
  );
}

function SubjectChip({
  name,
  title,
  color,
  selected,
  onClick,
}: {
  name: string;
  title?: string;
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      title={title ?? name}
      className={cn(
        "flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-medium font-bengali transition-all duration-300",
        selected
          ? "glow-ring border-primary/60 bg-primary/10 text-foreground"
          : "border-border/70 bg-card/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
      )}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="max-w-[160px] truncate">{name}</span>
    </button>
  );
}

type ChartRow = {
  name: string;
  fullName: string;
  b0: number;
  b1: number;
  b2: number;
  b3: number;
  b4: number;
  b5: number;
};

function rowFor(s: MasterySubject): ChartRow {
  return {
    name: shortSubjectName(s.name),
    fullName: s.name,
    b0: s.distribution[0] ?? 0,
    b1: s.distribution[1] ?? 0,
    b2: s.distribution[2] ?? 0,
    b3: s.distribution[3] ?? 0,
    b4: s.distribution[4] ?? 0,
    b5: s.distribution[5] ?? 0,
  };
}

type TooltipEntry = {
  dataKey?: string | number;
  value?: number | string;
  payload?: ChartRow;
};

function BnDistributionTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const first = payload[0]?.payload;
  const rows = payload.filter((p) => Number(p.value ?? 0) > 0);

  return (
    <div className="glass-strong rounded-xl px-3 py-2 font-bengali text-xs shadow-lg">
      <p className="mb-1 font-bold">{first?.fullName ?? first?.name}</p>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">এই বিষয়ে কোনো আইটেম নেই</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {rows.map((p) => {
            const idx = Number(String(p.dataKey ?? "b0").replace("b", "")) || 0;
            return (
              <li key={String(p.dataKey)} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ background: BUCKET_COLORS[idx] }}
                />
                <span className="text-muted-foreground">{BUCKET_TOOLTIP[idx]}:</span>
                <span className="font-semibold">{toBn(Number(p.value ?? 0))}টি আইটেম</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ItemRow({
  item,
  pending,
  onRead,
}: {
  item: MasteryItem;
  pending: boolean;
  onRead: () => void;
}) {
  return (
    <li className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-accent/50">
      <span className="glass-strong flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
        <ItemIcon item={item} className="h-3.5 w-3.5 text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium font-bengali" title={item.title}>
          {item.title}
        </p>
        <p className="truncate text-[11px] text-muted-foreground font-bengali" title={item.path}>
          {item.path}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold font-bengali",
          item.readCount === 0 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
        )}
      >
        {item.readCount === 0 ? "পড়া হয়নি" : `${toBn(item.readCount)} বার`}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="h-7 w-7 shrink-0 rounded-lg"
        disabled={pending}
        onClick={onRead}
        aria-label={`+১ পড়া যোগ করুন — ${item.title}`}
        title="+১ পড়া যোগ করুন"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
      </Button>
    </li>
  );
}

function RecentRow({ item }: { item: MasteryItem }) {
  return (
    <li className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-accent/50">
      <span className="glass-strong flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
        <ItemIcon item={item} className="h-3.5 w-3.5 text-primary" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium font-bengali" title={item.title}>
          {item.title}
        </p>
        <p className="text-[10px] text-muted-foreground font-bengali" title={item.path}>
          {relativeBn(item.lastReadAt as string)}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold font-bengali text-primary">
        {toBn(item.readCount)} বার
      </span>
    </li>
  );
}

function MasterySkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true">
      <div className="glass rounded-2xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <div className="h-3 w-36 animate-pulse rounded-full bg-muted" />
            <div className="h-7 w-56 animate-pulse rounded-full bg-muted" />
            <div className="h-3 w-44 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="h-24 w-24 animate-pulse rounded-full bg-muted" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="glass rounded-2xl p-4">
            <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
            <div className="mt-3 h-6 w-20 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="glass h-[380px] rounded-2xl p-5 lg:col-span-2">
          <div className="h-full w-full animate-pulse rounded-xl bg-muted/70" />
        </div>
        <div className="glass h-[380px] rounded-2xl p-5">
          <div className="h-full w-full animate-pulse rounded-xl bg-muted/70" />
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ─── */

type Scope = "all" | string;

export function MasteryDashboard() {
  const [target, setTarget] = useState<3 | 5 | 10>(5);
  const [scope, setScope] = useState<Scope>("all");
  const qc = useQueryClient();

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ["mastery", target],
    queryFn: () => fetchMastery(target),
    placeholderData: (prev) => prev,
  });

  const readMutation = useMutation({
    mutationFn: (v: { kind: MasteryItem["kind"]; id: string }) => markRead(v.kind, v.id),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["mastery"] });
      const snapshots = qc.getQueriesData<MasteryDTO>({ queryKey: ["mastery"] });
      qc.setQueriesData<MasteryDTO>({ queryKey: ["mastery"] }, (old) =>
        old ? applyRead(old, v.kind, v.id) : old
      );
      return { snapshots };
    },
    onSuccess: (res) => toast.success(`${toBn(res.readCount)} বার পড়া হয়েছে`),
    onError: (e: Error, _v, ctx) => {
      ctx?.snapshots.forEach(([key, value]) => qc.setQueryData(key, value));
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["mastery"] }),
  });

  const subjects = useMemo(() => data?.subjects ?? [], [data]);

  const scoped = useMemo(() => {
    if (!data) return null;
    const sel = scope === "all" ? null : subjects.find((s) => s.id === scope) ?? null;

    if (sel) {
      const recent = sel.items
        .filter((it) => it.lastReadAt)
        .sort(
          (a, b) =>
            new Date(b.lastReadAt as string).getTime() -
            new Date(a.lastReadAt as string).getTime()
        )
        .slice(0, 6);
      return {
        totalItems: sel.totalItems,
        totalReads: sel.totalReads,
        masteredItems: sel.masteredItems,
        masteryPct: sel.masteryPct,
        needsReview: sel.items.slice(0, 8),
        recent,
        chartRows: [rowFor(sel)],
        hasItems: sel.totalItems > 0,
      };
    }

    const allItems = subjects.flatMap((s) => s.items);
    const recent = allItems
      .filter((it) => it.lastReadAt)
      .sort(
        (a, b) =>
          new Date(b.lastReadAt as string).getTime() - new Date(a.lastReadAt as string).getTime()
      )
      .slice(0, 6);
    return {
      totalItems: data.overall.totalItems,
      totalReads: data.overall.totalReads,
      masteredItems: data.overall.masteredItems,
      masteryPct: data.overall.masteryPct,
      needsReview: [...allItems].sort((a, b) => a.readCount - b.readCount).slice(0, 8),
      recent,
      chartRows: subjects.map(rowFor),
      hasItems: data.overall.totalItems > 0,
    };
  }, [data, scope, subjects]);

  if (isLoading || !data || !scoped) {
    return <MasterySkeleton />;
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-8 text-center backdrop-blur">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
        <h2 className="mt-3 text-base font-bold font-bengali">মাস্টারি ডেটা আনা যায়নি</h2>
        <p className="mt-1 text-xs text-muted-foreground font-bengali">
          সার্ভারের সঙ্গে সংযোগে সমস্যা হয়েছে — আবার চেষ্টা করুন।
        </p>
        <Button onClick={() => refetch()} variant="outline" className="mt-4 gap-2 font-bengali">
          <RotateCcw className="h-3.5 w-3.5" /> আবার চেষ্টা করুন
        </Button>
      </div>
    );
  }

  const isAll = scope === "all";
  const avgReads = scoped.totalItems > 0 ? (scoped.totalReads / scoped.totalItems).toFixed(1) : null;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col gap-5">
      {/* Hero */}
      <motion.section
        variants={item}
        className="glass relative overflow-hidden rounded-2xl p-5 sm:p-6"
      >
        <div className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="font-bengali text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              পড়া → পুনরাবৃত্তি → আয়ত্ত
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
              <span className="text-gradient font-bengali">মাস্টারি</span>{" "}
              <span className="font-bengali">ট্র্যাকার</span>
            </h1>
            <p className="mt-1 text-xs text-muted-foreground font-bengali">
              প্রতিটি নোট, ফাইল ও লিংক কতবার পড়েছেন — এক নজরে
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-medium text-muted-foreground font-bengali">
                লক্ষ্য: কতবার পড়া মানে আয়ত্ত
              </span>
              <div
                className="glass inline-flex items-center rounded-xl p-0.5"
                role="group"
                aria-label="মাস্টারি লক্ষ্য নির্বাচন"
              >
                {([3, 5, 10] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTarget(t)}
                    aria-pressed={target === t}
                    className={cn(
                      "flex h-8 w-10 items-center justify-center rounded-lg font-bengali text-xs font-bold transition-all duration-300",
                      target === t
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {toBn(t)}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <MasteryRing percent={scoped.masteryPct} size={96} color={RING_COLORS[0]} />
            <span className="text-[10px] text-muted-foreground font-bengali">
              {isAll ? "সার্বিক আয়ত্ত" : "এই বিষয়ের আয়ত্ত"}
            </span>
          </div>
        </div>
      </motion.section>

      {/* Subject selector chips */}
      <motion.section variants={item} className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1 text-xs font-medium text-muted-foreground font-bengali">
          <Layers className="h-3.5 w-3.5" /> বিষয়:
        </span>
        <SubjectChip
          name="সব বিষয়"
          color="linear-gradient(135deg, #149d8c, #d9a13c)"
          selected={isAll}
          onClick={() => setScope("all")}
        />
        {subjects.map((s, i) => (
          <SubjectChip
            key={s.id}
            name={shortSubjectName(s.name)}
            title={s.name}
            color={RING_COLORS[i % RING_COLORS.length]}
            selected={scope === s.id}
            onClick={() => setScope(s.id)}
          />
        ))}
      </motion.section>

      {!scoped.hasItems ? (
        /* Empty state */
        <motion.section variants={item} className="glass rounded-2xl p-10 text-center">
          <div className="glass-strong mx-auto flex h-14 w-14 items-center justify-center rounded-2xl">
            <BookOpen className="h-6 w-6 text-primary" />
          </div>
          <h2 className="mt-3 text-lg font-bold font-bengali">এখনো কোনো পঠন-উপাত্ত নেই</h2>
          <p className="mt-1 text-sm text-muted-foreground font-bengali">
            প্রথমে কোনো নোট/ফাইল/লিংক যোগ করুন এবং পড়ার পর '+১' চাপুন।
          </p>
        </motion.section>
      ) : (
        <div
          className={cn(
            "flex flex-col gap-5 transition-opacity duration-300",
            isFetching && "opacity-75"
          )}
        >
          {/* KPI row */}
          <motion.section variants={item} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard
              icon={<Layers className="h-4 w-4 text-primary" />}
              label="মোট আইটেম"
              value={toBn(scoped.totalItems)}
              hint="নোট · ফাইল · লিংক"
            />
            <StatCard
              icon={<BookOpen className="h-4 w-4 text-chart-4" />}
              label="মোট পঠন"
              value={toBn(scoped.totalReads)}
              hint="'+১' চেপে বাড়ান"
            />
            <StatCard
              icon={<Award className="h-4 w-4 text-chart-2" />}
              label="আয়ত্ত আইটেম"
              value={toBn(scoped.masteredItems)}
              hint={`লক্ষ্য ${toBn(target)} বার পড়া`}
            />
            <StatCard
              icon={<BarChart3 className="h-4 w-4 text-chart-3" />}
              label="গড় পাঠ"
              value={avgReads ? toBn(avgReads) : "০"}
              hint="প্রতি আইটেমে"
            />
          </motion.section>

          {/* Charts row */}
          <motion.section variants={item} className="grid gap-6 lg:grid-cols-3">
            <div className="glass rounded-2xl p-5 lg:col-span-2">
              <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight font-bengali">
                <BarChart3 className="h-4 w-4 text-primary" /> বিষয়ভিত্তিক পাঠ-বণ্টন
              </h2>
              <p className="mb-4 mt-1 text-xs text-muted-foreground font-bengali">
                প্রতিটি বার = কতবার পড়া অনুযায়ী আইটেমের সংখ্যা
              </p>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={scoped.chartRows} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--border)" />
                    <XAxis
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      interval={0}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      width={40}
                    />
                    <Legend
                      iconType="circle"
                      iconSize={8}
                      formatter={(value: string) => BUCKET_LEGEND[BUCKET_KEYS.indexOf(value as (typeof BUCKET_KEYS)[number])] ?? value}
                      wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                    />
                    <ReTooltip
                      cursor={{ fill: "var(--accent)", opacity: 0.4 }}
                      content={<BnDistributionTooltip />}
                    />
                    {BUCKET_KEYS.map((key, i) => (
                      <Bar
                        key={key}
                        dataKey={key}
                        stackId="reads"
                        fill={BUCKET_COLORS[i]}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={34}
                        style={{ filter: `drop-shadow(0 0 4px ${BUCKET_COLORS[i]}44)` }}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="glass rounded-2xl p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight font-bengali">
                <Target className="h-4 w-4 text-primary" /> আয়ত্তের রিং
              </h2>
              <p className="mb-4 mt-1 text-xs text-muted-foreground font-bengali">
                রিংয়ে ক্লিক করে বিষয় বাছুন
              </p>
              <div className="grid grid-cols-2 justify-items-center gap-4 py-2 sm:grid-cols-3 xl:grid-cols-2">
                {subjects.map((s, i) => (
                  <button
                    key={s.id}
                    onClick={() => setScope(s.id)}
                    aria-pressed={scope === s.id}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl p-1.5 transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent/50",
                      scope === s.id && "glow-ring bg-accent/40"
                    )}
                  >
                    <MasteryRing
                      percent={s.masteryPct}
                      color={RING_COLORS[i % RING_COLORS.length]}
                      size={78}
                    />
                    <span
                      className="max-w-[110px] truncate text-[11px] font-medium font-bengali"
                      title={s.name}
                    >
                      {s.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </motion.section>

          {/* Lists row */}
          <motion.section variants={item} className="grid gap-6 lg:grid-cols-2">
            {/* Needs review */}
            <div className="glass rounded-2xl p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight font-bengali">
                <Zap className="h-4 w-4 text-chart-3" /> মনোযোগ প্রয়োজন
              </h2>
              <p className="mb-3 mt-1 text-xs text-muted-foreground font-bengali">
                সবচেয়ে কম পড়া ৮টি আইটেম — '+১' চেপে অগ্রগতি নিশ্চিত করুন
              </p>
              {scoped.needsReview.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground font-bengali">
                  এই বিষয়ে কোনো আইটেম নেই।
                </p>
              ) : (
                <ul className="scroll-slim flex max-h-96 flex-col gap-1.5 overflow-y-auto pr-1">
                  {scoped.needsReview.map((it) => (
                    <ItemRow
                      key={`${it.kind}:${it.id}`}
                      item={it}
                      pending={
                        readMutation.isPending &&
                        readMutation.variables?.id === it.id &&
                        readMutation.variables?.kind === it.kind
                      }
                      onRead={() => readMutation.mutate({ kind: it.kind, id: it.id })}
                    />
                  ))}
                </ul>
              )}
            </div>

            {/* Recently read */}
            <div className="glass rounded-2xl p-5">
              <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight font-bengali">
                <History className="h-4 w-4 text-primary" /> সম্প্রতি পঠিত
              </h2>
              <p className="mb-3 mt-1 text-xs text-muted-foreground font-bengali">
                সর্বশেষ যেগুলো পড়েছেন
              </p>
              {scoped.recent.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground font-bengali">
                  এখনো কিছু পড়া হয়নি — '+১' চেপে শুরু করুন।
                </p>
              ) : (
                <ul className="scroll-slim flex max-h-96 flex-col gap-1.5 overflow-y-auto pr-1">
                  {scoped.recent.map((it) => (
                    <RecentRow key={`${it.kind}:${it.id}`} item={it} />
                  ))}
                </ul>
              )}
            </div>
          </motion.section>
        </div>
      )}
    </motion.div>
  );
}
