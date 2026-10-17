"use client";

/**
 * 🗓 ইন্টারেক্টিভ স্টাডি ক্যালেন্ডার — প্রিমিয়াম এডিশন
 * - প্রতিদিন আগের রাতে টপিক / ফাইল / প্রশ্ন / লিংক / নিজের আইটেম প্ল্যান করুন
 * - পড়া শেষ হলে দিনটি ✓ সফল, না পারলে ✕ ব্যর্থ — সব DB-তে সেভ
 * - সাপ্তাহিক ড্যাশবোর্ড: স্ট্রিক, সাফল্যের হার, ৮-সপ্তাহের বার-চার্ট
 * - ৯১-দিনের হিটম্যাপ নিজের আলাদা প্রিমিয়াম বক্সে
 * - ⏳ পরীক্ষার কাউন্টডাউন — সর্বোচ্চ ৩টি, মাস+দিন হিসেবে
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  fetchAllDocuments,
  fetchAllLinks,
  fetchPlanMonth,
  fetchQuestions,
  fetchTree,
  fetchExams,
  addExam,
  updateExam,
  deleteExam,
  addPlanItem,
  updatePlanItem,
  deletePlanItem,
  setDayStatus,
} from "@/lib/bcs-api";
import { NodePicker } from "@/components/bcs/study/shared";
import { useBcsStore, type WorkspaceTab } from "@/lib/bcs-store";
import { namePathOf } from "@/lib/bcs-tree-utils";
import type { ExamCountdownDTO, PlanItemDTO, PlanStatsDTO } from "@/lib/bcs-types";
import { toBn } from "@/lib/bcs-types";
import { cn } from "@/lib/utils";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Flame,
  GraduationCap,
  HelpCircle,
  Hourglass,
  Link2,
  ListChecks,
  NotebookPen,
  Pencil,
  Plus,
  RotateCcw,
  Target,
  Trash2,
  TrendingUp,
  Trophy,
  X,
} from "lucide-react";

// ---------- date helpers (local device time) ----------

const pad2 = (n: number) => String(n).padStart(2, "0");
const localDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayStr = () => localDateStr(new Date());

function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

const bnMonthYear = new Intl.DateTimeFormat("bn-BD", { month: "long", year: "numeric" });
const bnFullDate = new Intl.DateTimeFormat("bn-BD", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const bnShortDate = new Intl.DateTimeFormat("bn-BD", { day: "numeric", month: "short" });
const bnMonthOnly = new Intl.DateTimeFormat("bn-BD", { month: "short" });

function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return bnMonthYear.format(new Date(y, m - 1, 1));
}

function fullDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return bnFullDate.format(new Date(y, m - 1, d));
}

const WEEKDAYS = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহঃ", "শুক্র", "শনি"];

/** rainbow weekday chips — ক্যালেন্ডার বক্সের কালারফুল হেডার-সারি */
const WEEKDAY_CHIP = [
  "bg-rose-500/15 text-rose-700 ring-rose-500/30 dark:text-rose-300",
  "bg-orange-500/15 text-orange-700 ring-orange-500/30 dark:text-orange-300",
  "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
  "bg-teal-500/15 text-teal-700 ring-teal-500/30 dark:text-teal-300",
  "bg-violet-500/15 text-violet-700 ring-violet-500/30 dark:text-violet-300",
  "bg-fuchsia-500/15 text-fuchsia-700 ring-fuchsia-500/30 dark:text-fuchsia-300",
];

// ---------- countdown math (মাস + দিন) ----------

/** UTC day-diff between two YYYY-MM-DD strings. */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/**
 * Calendar-aware month+day difference: "৩ মাস ৭ দিন" style.
 * Counts real month boundaries (Jan 31 → Mar 1 = ১ মাস ১ দিন).
 */
function diffMonthsDays(from: string, to: string): { months: number; days: number } {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const clampDay = (y: number, m: number, d: number) =>
    Math.min(d, new Date(Date.UTC(y, m, 0)).getUTCDate());
  const anchor = (months: number) => {
    const y = fy + Math.floor((fm - 1 + months) / 12);
    const mo = ((fm - 1 + months) % 12) + 1;
    return `${y}-${pad2(mo)}-${pad2(clampDay(y, mo, fd))}`;
  };
  let months = (ty - fy) * 12 + (tm - fm);
  while (months > 0 && anchor(months) > to) months--;
  const [ay, am, ad] = anchor(months).split("-").map(Number);
  const days = Math.max(0, Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(ay, am - 1, ad)) / 86_400_000));
  return { months, days };
}

// ---------- item kind visuals ----------

type ItemKind = string;

function KindIcon({ kind, className }: { kind: ItemKind; className?: string }) {
  switch (kind) {
    case "node":
      return <NotebookPen className={className} />;
    case "noteItem":
      return <NotebookPen className={className} />;
    case "document":
      return <FileText className={className} />;
    case "link":
      return <Link2 className={className} />;
    case "question":
      return <HelpCircle className={className} />;
    default:
      return <Target className={className} />;
  }
}

const KIND_DOT: Record<string, string> = {
  node: "bg-violet-500",
  noteItem: "bg-violet-500",
  document: "bg-amber-500",
  link: "bg-emerald-500",
  question: "bg-fuchsia-500",
  custom: "bg-sky-500",
};

const KIND_LABEL: Record<string, string> = {
  node: "টপিক",
  noteItem: "নোট",
  document: "ফাইল",
  link: "লিংক",
  question: "প্রশ্ন",
  custom: "নিজের আইটেম",
};

const KIND_OPEN_TAB: Record<string, WorkspaceTab> = {
  node: "notes",
  noteItem: "notes",
  document: "docs",
  link: "links",
  question: "questions",
};

function metaOf(item: PlanItemDTO): { nodeId?: string; ext?: string; url?: string } {
  try {
    return JSON.parse(item.meta || "{}");
  } catch {
    return {};
  }
}

// ---------- premium panel shell (themed gradient border box) ----------

type PanelTone = "emerald" | "violet" | "cyan" | "amber";

const TONE: Record<PanelTone, { border: string; chip: string; glow: string }> = {
  emerald: {
    border:
      "from-emerald-500/70 via-teal-500/30 to-teal-600/60 dark:from-emerald-400/45 dark:via-teal-400/20 dark:to-teal-400/40",
    chip: "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
    glow: "shadow-emerald-500/10",
  },
  violet: {
    border:
      "from-violet-500/70 via-purple-500/30 to-fuchsia-500/60 dark:from-violet-400/45 dark:via-purple-400/20 dark:to-fuchsia-400/40",
    chip: "bg-violet-500/12 text-violet-700 ring-violet-500/25 dark:text-violet-300",
    glow: "shadow-violet-500/10",
  },
  cyan: {
    border:
      "from-cyan-500/70 via-sky-500/30 to-teal-500/60 dark:from-cyan-400/45 dark:via-sky-400/20 dark:to-teal-400/40",
    chip: "bg-cyan-500/12 text-cyan-700 ring-cyan-500/25 dark:text-cyan-300",
    glow: "shadow-cyan-500/10",
  },
  amber: {
    border:
      "from-amber-500/70 via-orange-500/30 to-rose-500/60 dark:from-amber-400/45 dark:via-orange-400/20 dark:to-rose-400/40",
    chip: "bg-amber-500/12 text-amber-700 ring-amber-500/25 dark:text-amber-300",
    glow: "shadow-amber-500/10",
  },
};

/** Themed premium panel: gradient border + inner highlight + icon-chip header. */
function PanelBox({
  tone,
  icon,
  title,
  subtitle,
  actions,
  children,
  className,
  ariaLabel,
}: {
  tone: PanelTone;
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  const t = TONE[tone];
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        "rounded-[1.15rem] bg-gradient-to-br p-[1.5px] shadow-lg transition-shadow hover:shadow-xl",
        t.border,
        t.glow,
        className
      )}
    >
      <div className="flex h-full flex-col rounded-[calc(1.15rem-1.5px)] bg-card/95 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.45)] backdrop-blur-sm dark:bg-card/90 dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.07)]">
        <header className="flex flex-wrap items-center gap-2.5 px-4 pb-2.5 pt-3.5">
          <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1", t.chip)}>
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-bold leading-tight font-bengali">{title}</h2>
            {subtitle && (
              <p className="truncate text-[11px] text-muted-foreground font-bengali">{subtitle}</p>
            )}
          </div>
          {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
        </header>
        <div aria-hidden className="mx-4 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        <div className="flex-1 px-4 pb-4 pt-3">{children}</div>
      </div>
    </section>
  );
}

// ---------- root ----------

export function CalendarHub() {
  const qc = useQueryClient();
  const today = todayStr();
  const [month, setMonth] = useState(() => monthOf(today));
  const [selected, setSelected] = useState(today);

  const { data, isLoading } = useQuery({
    queryKey: ["plan", month],
    queryFn: () => fetchPlanMonth(month),
  });

  // মধ্যরাত্রির দিন-পরিবর্তনে স্বয়ংক্রিয় রিফ্রেশ — হিটম্যাপের ৯১-দিনের রোলিং উইন্ডো
  // প্রতিদিন একদিন করে এগিয়ে যায় (ট্যাব খোলা থাকলেও)
  useEffect(() => {
    let lastDay = new Date().toDateString();
    const id = setInterval(() => {
      const now = new Date().toDateString();
      if (now !== lastDay) {
        lastDay = now;
        qc.invalidateQueries({ queryKey: ["plan"] });
      }
    }, 30_000);
    return () => clearInterval(id);
  }, [qc]);

  const itemsByDate = useMemo(() => {
    const map: Record<string, PlanItemDTO[]> = {};
    for (const it of data?.items ?? []) {
      (map[it.date] ??= []).push(it);
    }
    return map;
  }, [data]);

  const statusMap = data?.statusMap ?? {};
  const stats = data?.stats;

  // select day + follow into its month if needed
  const selectDay = (dateStr: string) => {
    setSelected(dateStr);
    if (monthOf(dateStr) !== month) setMonth(monthOf(dateStr));
  };

  return (
    <div className="flex flex-col gap-5 pb-6">
      {/* hero */}
      <HeroBanner stats={stats} />

      {/* ⏳ পরীক্ষার কাউন্টডাউন — নিজস্ব প্রিমিয়াম বক্স */}
      <ExamCountdownBox />

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        {/* month grid */}
        <MonthGrid
          month={month}
          selected={selected}
          today={today}
          itemsByDate={itemsByDate}
          statusMap={statusMap}
          isLoading={isLoading}
          onPrev={() => setMonth(addMonths(month, -1))}
          onNext={() => setMonth(addMonths(month, 1))}
          onToday={() => {
            setMonth(monthOf(today));
            setSelected(today);
          }}
          onSelect={selectDay}
        />

        {/* day planner */}
        <DayPanel
          date={selected}
          today={today}
          status={statusMap[selected] ?? null}
          items={itemsByDate[selected] ?? []}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]">
        {/* dashboard */}
        <PlanDashboard stats={stats} />

        {/* heatmap — আলাদা প্রিমিয়াম বক্স */}
        <HeatmapBox days={stats?.heatmap ?? []} />
      </div>
    </div>
  );
}

// ---------- hero banner ----------

function HeroBanner({ stats }: { stats?: PlanStatsDTO }) {
  return (
    <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-700 via-teal-700 to-cyan-800 p-5 text-white shadow-lg shadow-emerald-900/25">
      {/* dot texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.95) 1px, transparent 1px)",
          backgroundSize: "18px 18px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 -top-12 select-none text-[130px] leading-none opacity-15"
      >
        🗓
      </div>
      <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold tracking-[0.28em] text-emerald-100/80 uppercase font-bengali">
            স্টাডি প্ল্যানার
          </p>
          <h1 className="mt-0.5 flex items-center gap-2 text-xl font-bold tracking-tight font-bengali">
            স্টাডি ক্যালেন্ডার
          </h1>
          <p className="mt-1 max-w-xl text-xs text-emerald-50/85 font-bengali">
            আগের রাতে পরের দিনের টপিক ও ফাইল ঠিক করে রাখুন — পড়া শেষ হলে দিনটি সফল ✓ করুন
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <HeroStat label={`স্ট্রিক ${toBn(stats?.currentStreak ?? 0)} দিন`} icon="🔥" />
          <HeroStat label={`সেরা ${toBn(stats?.bestStreak ?? 0)}`} icon="🏆" />
          <HeroStat label={`এই সপ্তাহে সফল ${toBn(stats?.thisWeekSuccess ?? 0)} দিন`} icon="📅" />
          <HeroStat label={`সাফল্য ${toBn(stats?.successRate ?? 0)}%`} icon="📈" />
        </div>
      </div>
    </header>
  );
}

function HeroStat({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="flex h-7 items-center gap-1.5 rounded-full bg-white/12 px-3 text-xs font-medium text-white ring-1 ring-white/25 backdrop-blur-sm font-bengali">
      <span aria-hidden>{icon}</span>
      {label}
    </span>
  );
}

// ---------- exam countdown (⏳ সর্বোচ্চ ৩টি) ----------

const MAX_EXAMS = 3;

const EXAM_HUES = [
  {
    chip: "bg-violet-500/20 text-violet-200 ring-violet-400/40",
    glow: "shadow-[0_0_28px_-10px_rgba(139,92,246,0.65)]",
    bar: "from-violet-400 to-fuchsia-400",
  },
  {
    chip: "bg-cyan-500/20 text-cyan-200 ring-cyan-400/40",
    glow: "shadow-[0_0_28px_-10px_rgba(34,211,238,0.65)]",
    bar: "from-cyan-400 to-sky-400",
  },
  {
    chip: "bg-amber-500/20 text-amber-200 ring-amber-400/40",
    glow: "shadow-[0_0_28px_-10px_rgba(245,158,11,0.6)]",
    bar: "from-amber-400 to-orange-400",
  },
];

function ExamCountdownBox() {
  const qc = useQueryClient();
  const { data: exams = [] } = useQuery({ queryKey: ["exams"], queryFn: fetchExams });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExamCountdownDTO | null>(null);

  // re-render every 30s so the countdown never goes stale across midnight
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const remove = useMutation({
    mutationFn: deleteExam,
    onSuccess: () => {
      toast.success("পরীক্ষা মুছে ফেলা হয়েছে");
      qc.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const today = todayStr();
  const full = exams.length >= MAX_EXAMS;

  return (
    <section
      aria-label="পরীক্ষার কাউন্টডাউন"
      className="relative overflow-hidden rounded-[1.15rem] bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-4 shadow-xl shadow-slate-950/30 sm:p-5"
    >
      {/* ambient glows + dot texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      <div aria-hidden className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full bg-violet-600/20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 right-10 h-52 w-52 rounded-full bg-cyan-500/15 blur-3xl" />

      <div className="relative">
        <header className="mb-3.5 flex flex-wrap items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/30">
            <GraduationCap className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-[15px] font-bold leading-tight text-white font-bengali">
              পরীক্ষার কাউন্টডাউন
            </h2>
            <p className="text-[11px] text-slate-400 font-bengali">
              সর্বোচ্চ ৩টি পরীক্ষা — মাস ও দিনে হিসেব
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="rounded-full bg-white/8 px-2.5 py-0.5 text-[10px] font-semibold text-slate-300 ring-1 ring-white/15 font-bengali">
              {toBn(exams.length)}/{toBn(MAX_EXAMS)}
            </span>
            {!full && (
              <Button
                size="sm"
                className="h-7 gap-1 rounded-full bg-emerald-500 px-3 text-[11px] font-bold text-white shadow-[0_0_16px_-4px_rgba(16,185,129,0.8)] hover:bg-emerald-400 font-bengali"
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" /> যোগ করুন
              </Button>
            )}
          </div>
        </header>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {exams.map((exam, i) => (
            <ExamCard
              key={exam.id}
              exam={exam}
              idx={i}
              hue={EXAM_HUES[i % EXAM_HUES.length]}
              today={today}
              onEdit={() => {
                setEditing(exam);
                setFormOpen(true);
              }}
              onDelete={() => remove.mutate(exam.id)}
            />
          ))}
          {!full && <AddExamTile onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }} />}
        </div>
      </div>

      <ExamFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} />
    </section>
  );
}

function ExamCard({
  exam,
  idx,
  hue,
  today,
  onEdit,
  onDelete,
}: {
  exam: ExamCountdownDTO;
  idx: number;
  hue: (typeof EXAM_HUES)[number];
  today: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const past = exam.date < today;
  const isToday = exam.date === today;
  const cd = past || isToday ? null : diffMonthsDays(today, exam.date);

  // time-elapsed gauge: from the day it was created → exam day
  const createdDate = exam.createdAt.slice(0, 10);
  const total = Math.max(daysBetween(createdDate, exam.date), 1);
  const elapsed = Math.max(0, Math.min(daysBetween(createdDate, today), total));
  const pct = past ? 100 : Math.round((elapsed / total) * 100);

  return (
    <div
      className={cn(
        "relative flex flex-col gap-2.5 rounded-xl border border-white/10 bg-white/[0.05] p-3.5 backdrop-blur-sm transition-colors hover:border-white/20",
        hue.glow
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 font-bengali", hue.chip)}>
          পরীক্ষা {toBn(idx + 1)}
        </span>
        <div className="ml-auto flex gap-0.5">
          <button
            onClick={onEdit}
            aria-label="পরীক্ষা এডিট করুন"
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
          >
            <Pencil className="h-3 w-3" />
          </button>
          <button
            onClick={onDelete}
            aria-label="পরীক্ষা মুছে ফেলুন"
            className="flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-500/20 hover:text-rose-300"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      <h3 className="truncate text-sm font-bold text-white font-bengali" title={exam.title}>
        {exam.title}
      </h3>

      {isToday ? (
        <p className="animate-pulse text-2xl font-extrabold text-emerald-300 font-bengali" style={{ textShadow: "0 0 20px rgba(52,211,153,0.45)" }}>
          আজই পরীক্ষা! 🎯
        </p>
      ) : past ? (
        <p className="text-lg font-extrabold text-slate-500 font-bengali">অতীত হয়ে গেছে</p>
      ) : (
        <div className="flex items-stretch gap-2">
          {cd!.months > 0 && (
            <div className="flex-1 rounded-lg bg-white/[0.05] px-3 py-2 text-center ring-1 ring-white/10">
              <p
                className="text-2xl font-extrabold leading-none text-white tabular-nums"
                style={{ textShadow: "0 0 18px rgba(255,255,255,0.28)" }}
              >
                {toBn(cd!.months)}
              </p>
              <p className="mt-1 text-[10px] text-slate-400 font-bengali">মাস</p>
            </div>
          )}
          <div className="flex-1 rounded-lg bg-white/[0.05] px-3 py-2 text-center ring-1 ring-white/10">
            <p
              className="text-2xl font-extrabold leading-none text-white tabular-nums"
              style={{ textShadow: "0 0 18px rgba(255,255,255,0.28)" }}
            >
              {toBn(cd!.days)}
            </p>
            <p className="mt-1 text-[10px] text-slate-400 font-bengali">দিন</p>
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-300 font-bengali">📅 {fullDateLabel(exam.date)}</p>
      {exam.note && (
        <p className="truncate text-[10px] text-slate-400 font-bengali" title={exam.note}>
          {exam.note}
        </p>
      )}

      <div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className={cn("h-full rounded-full bg-gradient-to-r transition-[width] duration-700", hue.bar)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[9px] text-slate-500 font-bengali">
          <span>সময় অগ্রগতি</span>
          <span>{toBn(pct)}%</span>
        </div>
      </div>
    </div>
  );
}

function AddExamTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-32 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-4 text-center transition-all hover:border-emerald-400/40 hover:bg-emerald-400/[0.06]"
    >
      <Hourglass className="h-5 w-5 text-slate-500" />
      <p className="text-xs font-semibold text-slate-300 font-bengali">নতুন পরীক্ষা যোগ করুন</p>
      <p className="text-[10px] text-slate-500 font-bengali">নাম ও তারিখ দিন — কাউন্টডাউন শুরু হবে</p>
    </button>
  );
}

function ExamFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ExamCountdownDTO | null;
}) {
  const qc = useQueryClient();

  const save = useMutation({
    mutationFn: (v: { title: string; date: string; note: string }) =>
      editing ? updateExam(editing.id, v) : addExam(v),
    onSuccess: () => {
      toast.success(editing ? "পরীক্ষা আপডেট হয়েছে" : "পরীক্ষা যোগ হয়েছে");
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["exams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-bengali">
            {editing ? "পরীক্ষা এডিট করুন" : "নতুন পরীক্ষা যোগ করুন"}
          </DialogTitle>
          <DialogDescription className="text-xs font-bengali">
            সর্বোচ্চ ৩টি পরীক্ষার কাউন্টডাউন রাখা যায়। কাউন্টডাউন মাস ও দিনে দেখানো হবে।
          </DialogDescription>
        </DialogHeader>
        {/* key remounts the fields with fresh initial values whenever the target changes */}
        <ExamFormFields
          key={editing?.id ?? "new"}
          editing={editing}
          pending={save.isPending}
          onSave={(v) => save.mutate(v)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ExamFormFields({
  editing,
  pending,
  onSave,
  onCancel,
}: {
  editing: ExamCountdownDTO | null;
  pending: boolean;
  onSave: (v: { title: string; date: string; note: string }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(editing?.title ?? "");
  const [date, setDate] = useState(editing?.date ?? "");
  const [note, setNote] = useState(editing?.note ?? "");

  const canSave = title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-muted-foreground font-bengali" htmlFor="exam-title">
          পরীক্ষার নাম
        </label>
        <Input
          id="exam-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="যেমন: ৪৭তম বিসিএস প্রিলিমিনারি"
          className="h-9 font-bengali text-sm"
          autoFocus
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-muted-foreground font-bengali" htmlFor="exam-date">
          পরীক্ষার তারিখ
        </label>
        <Input
          id="exam-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-9 font-bengali text-sm"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-muted-foreground font-bengali" htmlFor="exam-note">
          ছোট নোট (ঐচ্ছিক)
        </label>
        <Input
          id="exam-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="যেমন: কেন্দ্র — ঢাকা"
          className="h-9 font-bengali text-sm"
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" size="sm" className="font-bengali" onClick={onCancel}>
          বাতিল
        </Button>
        <Button
          size="sm"
          className="font-bengali"
          disabled={!canSave || pending}
          onClick={() => onSave({ title: title.trim(), date, note: note.trim() })}
        >
          {editing ? "সংরক্ষণ করুন" : "যোগ করুন"}
        </Button>
      </div>
    </div>
  );
}

// ---------- month grid ----------

function MonthGrid({
  month,
  selected,
  today,
  itemsByDate,
  statusMap,
  isLoading,
  onPrev,
  onNext,
  onToday,
  onSelect,
}: {
  month: string;
  selected: string;
  today: string;
  itemsByDate: Record<string, PlanItemDTO[]>;
  statusMap: Record<string, string>;
  isLoading: boolean;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onSelect: (date: string) => void;
}) {
  const [y, m] = month.split("-").map(Number);
  const firstDow = new Date(y, m - 1, 1).getDay(); // 0=Sunday
  const total = daysInMonth(month);

  const cells: { date: string | null; muted: boolean }[] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ date: null, muted: true });
  for (let d = 1; d <= total; d++) cells.push({ date: `${month}-${pad2(d)}`, muted: false });
  while (cells.length % 7 !== 0) cells.push({ date: null, muted: true });

  return (
    <section
      aria-label="মাসিক ক্যালেন্ডার"
      className="relative rounded-[1.25rem] bg-gradient-to-br from-emerald-500/80 via-teal-500/40 to-cyan-600/75 p-[2.5px] shadow-xl shadow-emerald-500/15 transition-shadow hover:shadow-2xl hover:shadow-teal-500/20 dark:from-emerald-400/50 dark:via-teal-400/25 dark:to-cyan-500/45"
    >
      <div className="relative flex h-full flex-col overflow-hidden rounded-[calc(1.25rem-2.5px)] bg-gradient-to-br from-emerald-50/95 via-teal-50/75 to-cyan-50/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.5)] backdrop-blur-sm dark:from-emerald-950/65 dark:via-teal-950/50 dark:to-cyan-950/60 dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]">
        {/* কালারফুল ডেকোরেটিভ লেয়ার — ডট-টেক্সচার + নরম রঙিন ব্লব */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.4] dark:opacity-[0.1]"
          style={{
            backgroundImage: "radial-gradient(rgba(13,148,136,0.4) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute -left-12 -top-14 h-44 w-44 rounded-full bg-emerald-400/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-16 -right-12 h-48 w-48 rounded-full bg-cyan-400/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -top-20 right-1/4 h-36 w-36 rounded-full bg-violet-400/20 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-5 -top-9 select-none text-[96px] leading-none opacity-[0.09]">
          🗓
        </div>

        {/* header — গ্রেডিয়েন্ট টাইটেল + রঙিন নেভিগেশন */}
        <header className="relative flex flex-wrap items-center gap-2.5 px-4 pb-2.5 pt-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/35 ring-1 ring-emerald-400/50">
            <CalendarDays className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate bg-gradient-to-r from-emerald-700 via-teal-600 to-cyan-700 bg-clip-text text-base font-bold leading-tight text-transparent font-bengali dark:from-emerald-300 dark:via-teal-200 dark:to-cyan-300">
              {monthLabel(month)}
            </h2>
            <p className="truncate text-[11px] text-teal-800/75 font-bengali dark:text-teal-200/60">
              দিনে ক্লিক করুন — প্ল্যান ও ফলাফল দেখুন
            </p>
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-emerald-500/40 bg-white/70 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-800 dark:bg-white/10 dark:text-emerald-300"
              onClick={onPrev}
              aria-label="আগের মাস"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 px-3.5 font-bengali text-white shadow-md shadow-emerald-500/35 hover:from-emerald-600 hover:to-teal-700"
              onClick={onToday}
            >
              আজ
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-emerald-500/40 bg-white/70 text-emerald-700 hover:bg-emerald-500/15 hover:text-emerald-800 dark:bg-white/10 dark:text-emerald-300"
              onClick={onNext}
              aria-label="পরের মাস"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <div aria-hidden className="mx-4 h-px bg-gradient-to-r from-transparent via-emerald-500/45 to-transparent" />

        <div className="flex-1 px-4 pb-4 pt-3">
          {/* রংধনু weekday চিপ সারি */}
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w, i) => (
              <div key={w} className="pb-1.5 text-center">
                <span
                  className={cn(
                    "inline-flex h-6 items-center justify-center rounded-lg px-1 text-[10px] font-bold ring-1 font-bengali",
                    WEEKDAY_CHIP[i]
                  )}
                >
                  {w}
                </span>
              </div>
            ))}

            {isLoading &&
              cells.slice(0, 7).map((_, i) => (
                <div
                  key={`sk-${i}`}
                  className="h-16 animate-pulse rounded-xl bg-gradient-to-br from-emerald-500/15 to-teal-500/10"
                />
              ))}

            {!isLoading &&
              cells.map((c, i) => {
                if (!c.date) return <div key={`empty-${i}`} className="h-16" />;
                const dateStr = c.date;
                const dayNum = Number(dateStr.slice(8));
                const st = statusMap[dateStr];
                const items = itemsByDate[dateStr] ?? [];
                const doneCount = items.filter((it) => it.done).length;
                const isToday = dateStr === today;
                const isSelected = dateStr === selected;

                return (
                  <button
                    key={dateStr}
                    onClick={() => onSelect(dateStr)}
                    aria-label={`${fullDateLabel(dateStr)} — ${items.length} টি আইটেম`}
                    aria-pressed={isSelected}
                    className={cn(
                      "group relative flex h-16 flex-col items-center justify-start rounded-xl border p-1 pt-1.5 transition-all duration-150 hover:-translate-y-0.5",
                      st === "success" &&
                        "border-emerald-500/50 bg-gradient-to-br from-emerald-400/30 to-teal-400/15 dark:border-emerald-400/40 dark:from-emerald-500/25 dark:to-teal-500/10",
                      st === "fail" &&
                        "border-rose-500/50 bg-gradient-to-br from-rose-400/30 to-orange-400/15 dark:border-rose-400/40 dark:from-rose-500/25 dark:to-orange-500/10",
                      !st && "border-border/70 bg-white/65 hover:border-emerald-500/50 dark:bg-white/5",
                      isSelected
                        ? "ring-2 ring-primary shadow-[0_0_10px_var(--glow)]"
                        : "hover:shadow-md",
                      isToday &&
                        !isSelected &&
                        "border-2 border-amber-500/70 shadow-[0_0_10px_rgba(245,158,11,0.35)]"
                    )}
                  >
                    <span className="flex w-full items-center justify-center gap-1">
                      <span
                        className={cn(
                          "text-[12px] font-bold font-bengali",
                          isToday && "rounded-full bg-primary px-1.5 text-primary-foreground shadow-md"
                        )}
                      >
                        {toBn(dayNum)}
                      </span>
                      {st === "success" && (
                        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.65)]">
                          <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
                        </span>
                      )}
                      {st === "fail" && (
                        <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-white shadow-[0_0_8px_rgba(244,63,94,0.65)]">
                          <X className="h-2.5 w-2.5" strokeWidth={3.5} />
                        </span>
                      )}
                    </span>
                    {items.length > 0 && (
                      <span className="mt-1 flex items-center gap-0.5">
                        {items.slice(0, 4).map((it) => (
                          <span
                            key={it.id}
                            className={cn("h-1.5 w-1.5 rounded-full", KIND_DOT[it.kind] ?? KIND_DOT.custom)}
                          />
                        ))}
                        {items.length > 4 && (
                          <span className="text-[8px] font-bold text-muted-foreground">
                            +{toBn(items.length - 4)}
                          </span>
                        )}
                      </span>
                    )}
                    {items.length > 0 && doneCount === items.length && (
                      <span className="mt-0.5 rounded-full bg-emerald-500/15 px-1.5 py-px text-[8px] font-bold text-emerald-700 ring-1 ring-emerald-500/30 font-bengali dark:text-emerald-300">
                        সম্পন্ন
                      </span>
                    )}
                  </button>
                );
              })}
          </div>

          {/* গ্লাস লেজেন্ড */}
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-500/25 bg-white/60 px-3 py-2 text-[10px] text-muted-foreground font-bengali shadow-sm backdrop-blur-sm dark:bg-white/5">
            <span className="flex items-center gap-1">
              <span className="h-3.5 w-3.5 rounded-sm border border-emerald-500/40 bg-emerald-500/15" /> সফল দিন
            </span>
            <span className="flex items-center gap-1">
              <span className="h-3.5 w-3.5 rounded-sm border border-rose-500/40 bg-rose-500/15" /> ব্যর্থ দিন
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-500" /> টপিক/নোট
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" /> ফাইল
            </span>
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-500" /> প্রশ্ন
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- day planner panel ----------

function DayPanel({
  date,
  today,
  status,
  items,
}: {
  date: string;
  today: string;
  status: string | null;
  items: PlanItemDTO[];
}) {
  const qc = useQueryClient();
  const openNodeTab = useBcsStore((s) => s.openNodeTab);
  const selectNode = useBcsStore((s) => s.selectNode);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["plan"] });

  const setStatus = useMutation({
    mutationFn: (s: "success" | "fail" | null) => setDayStatus(date, s),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleItem = useMutation({
    mutationFn: (p: { id: string; done: boolean }) => updatePlanItem(p.id, { done: p.done }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const removeItem = useMutation({
    mutationFn: (id: string) => deletePlanItem(id),
    onSuccess: () => {
      toast.success("আইটেম সরানো হয়েছে");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addItem = useMutation({
    mutationFn: (input: {
      kind: string;
      targetId?: string | null;
      title: string;
      path?: string;
      meta?: Record<string, unknown>;
    }) => addPlanItem({ date, ...input }),
    onSuccess: () => {
      toast.success("প্ল্যানে যোগ হয়েছে");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doneCount = items.filter((it) => it.done).length;
  const allDone = items.length > 0 && doneCount === items.length;

  const openItem = (it: PlanItemDTO) => {
    const m = metaOf(it);
    const tab = KIND_OPEN_TAB[it.kind];
    const nodeId = m.nodeId ?? (it.kind === "node" ? it.targetId : null);
    if (!nodeId || !tab) {
      toast.info("এটি নিজের লেখা আইটেম — খোলার লিংক নেই");
      return;
    }
    if (it.kind === "node") selectNode(nodeId);
    else openNodeTab(nodeId, tab);
  };

  const dateLabel = date === today ? "আজ" : fullDateLabel(date);

  return (
    <PanelBox
      tone="violet"
      ariaLabel="দিনের টার্গেট"
      icon={<Target className="h-4 w-4" />}
      title={dateLabel}
      subtitle={date === today ? "আজকের প্রতিদিনের টার্গেট" : "এই দিনের টার্গেট"}
      actions={
        <Badge variant="outline" className="text-[10px] font-bengali">
          {toBn(items.length)} টি আইটেম
        </Badge>
      }
    >
      {/* success / fail toggle */}
      <div className="mb-3 grid grid-cols-3 gap-1.5">
        <button
          onClick={() => setStatus.mutate(status === "success" ? null : "success")}
          aria-pressed={status === "success"}
          className={cn(
            "flex h-10 items-center justify-center gap-1.5 rounded-xl border text-xs font-bold font-bengali transition-all",
            status === "success"
              ? "border-emerald-500 bg-emerald-500 text-white shadow-sm"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300"
          )}
        >
          <Check className="h-4 w-4" strokeWidth={3} /> সফল
        </button>
        <button
          onClick={() => setStatus.mutate(status === "fail" ? null : "fail")}
          aria-pressed={status === "fail"}
          className={cn(
            "flex h-10 items-center justify-center gap-1.5 rounded-xl border text-xs font-bold font-bengali transition-all",
            status === "fail"
              ? "border-rose-500 bg-rose-500 text-white shadow-sm"
              : "border-rose-500/40 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300"
          )}
        >
          <X className="h-4 w-4" strokeWidth={3} /> ব্যর্থ
        </button>
        <button
          onClick={() => setStatus.mutate(null)}
          aria-pressed={!status}
          className={cn(
            "flex h-10 items-center justify-center gap-1.5 rounded-xl border text-xs font-bold font-bengali transition-all",
            !status
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border bg-background/40 text-muted-foreground hover:text-foreground"
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" /> রিসেট
        </button>
      </div>

      {items.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground font-bengali">
            <span>
              {toBn(doneCount)}/{toBn(items.length)} সম্পন্ন
            </span>
            {allDone && status !== "success" && (
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                সব শেষ! ✓ সফল করুন
              </span>
            )}
          </div>
          <Progress value={(doneCount / items.length) * 100} className="h-1.5" />
        </div>
      )}

      {/* items */}
      <div className="scroll-slim mb-3 max-h-72 min-h-24 flex-1 overflow-y-auto pr-1">
        {items.length === 0 ? (
          <div className="flex h-24 flex-col items-center justify-center gap-1 rounded-xl border border-dashed text-center">
            <p className="text-xs font-medium text-muted-foreground font-bengali">
              এই দিনের জন্য কিছু প্ল্যান করা নেই
            </p>
            <p className="text-[10px] text-muted-foreground font-bengali">
              নিচের কম্পোজার থেকে টপিক/ফাইল/প্রশ্ন যোগ করুন
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {items.map((it) => {
              const m = metaOf(it);
              return (
                <li
                  key={it.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-xl border p-2 transition-all",
                    it.done ? "border-emerald-500/30 bg-emerald-500/8" : "border-border/70 bg-background/40"
                  )}
                >
                  <button
                    onClick={() => toggleItem.mutate({ id: it.id, done: !it.done })}
                    aria-label={it.done ? "অসম্পন্ন করুন" : "সম্পন্ন করুন"}
                    aria-pressed={it.done}
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-all",
                      it.done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : "border-border bg-background hover:border-emerald-500/60"
                    )}
                  >
                    {it.done && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
                  </button>
                  <KindIcon kind={it.kind} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <button onClick={() => openItem(it)} className="min-w-0 flex-1 text-start">
                    <p className={cn("truncate text-xs font-medium font-bengali", it.done && "line-through opacity-60")}>
                      {it.title}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground font-bengali">
                      {KIND_LABEL[it.kind] ?? "আইটেম"}
                      {it.path ? ` · ${it.path}` : ""}
                    </p>
                  </button>
                  {it.kind === "link" && m.url && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <a
                          href={m.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="লিংক খুলুন"
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-primary"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                        </a>
                      </TooltipTrigger>
                      <TooltipContent className="font-bengali">লিংক খুলুন</TooltipContent>
                    </Tooltip>
                  )}
                  <button
                    onClick={() => removeItem.mutate(it.id)}
                    aria-label="প্ল্যান থেকে সরান"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/15 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* composer */}
      <AddComposer date={date} onAdd={(input) => addItem.mutate(input)} pending={addItem.isPending} />
    </PanelBox>
  );
}

// ---------- add composer ----------

function AddComposer({
  date,
  onAdd,
  pending,
}: {
  date: string;
  onAdd: (input: {
    kind: string;
    targetId?: string | null;
    title: string;
    path?: string;
    meta?: Record<string, unknown>;
  }) => void;
  pending: boolean;
}) {
  const { data: nodes = [] } = useQuery({ queryKey: ["tree"], queryFn: fetchTree, staleTime: 60_000 });
  const { data: docs = [] } = useQuery({
    queryKey: ["documents"],
    queryFn: fetchAllDocuments,
    staleTime: 60_000,
  });
  const { data: questions = [] } = useQuery({
    queryKey: ["questions"],
    queryFn: () => fetchQuestions(),
    staleTime: 60_000,
  });
  const { data: links = [] } = useQuery({
    queryKey: ["all-links"],
    queryFn: fetchAllLinks,
    staleTime: 60_000,
  });

  const [fileSearch, setFileSearch] = useState("");
  const [customTitle, setCustomTitle] = useState("");

  const addNode = (id: string | null) => {
    if (!id) return;
    const path = namePathOf(nodes, id).join(" › ");
    onAdd({
      kind: "node",
      targetId: id,
      title: nodes.find((n) => n.id === id)?.name ?? "টপিক",
      path,
      meta: { nodeId: id },
    });
  };

  const filteredDocs = useMemo(() => {
    const q = fileSearch.trim().toLowerCase();
    if (!q) return docs.slice(0, 30);
    return docs.filter((d) => d.name.toLowerCase().includes(q)).slice(0, 30);
  }, [docs, fileSearch]);

  return (
    <div className="rounded-xl border border-border/70 bg-background/30 p-2.5">
      <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold text-muted-foreground font-bengali">
        <Plus className="h-3 w-3" /> এই দিনে যোগ করুন
      </p>
      <Tabs defaultValue="topic">
        <TabsList className="mb-2 h-8 w-full justify-start gap-0.5 overflow-x-auto bg-muted/50 p-0.5">
          <TabsTrigger value="topic" className="h-7 gap-1 rounded-md px-2.5 text-[11px] font-bengali">
            <NotebookPen className="h-3 w-3" /> টপিক
          </TabsTrigger>
          <TabsTrigger value="file" className="h-7 gap-1 rounded-md px-2.5 text-[11px] font-bengali">
            <FileText className="h-3 w-3" /> ফাইল
          </TabsTrigger>
          <TabsTrigger value="question" className="h-7 gap-1 rounded-md px-2.5 text-[11px] font-bengali">
            <HelpCircle className="h-3 w-3" /> প্রশ্ন
          </TabsTrigger>
          <TabsTrigger value="link" className="h-7 gap-1 rounded-md px-2.5 text-[11px] font-bengali">
            <Link2 className="h-3 w-3" /> লিংক
          </TabsTrigger>
          <TabsTrigger value="custom" className="h-7 gap-1 rounded-md px-2.5 text-[11px] font-bengali">
            <Target className="h-3 w-3" /> নিজে
          </TabsTrigger>
        </TabsList>

        <TabsContent value="topic" className="mt-0">
          <NodePicker
            value={null}
            onChange={addNode}
            placeholder="টপিক ব্রাউজ করে বাছুন…"
            allowNone={false}
          />
        </TabsContent>

        <TabsContent value="file" className="mt-0 flex flex-col gap-1.5">
          <Input
            value={fileSearch}
            onChange={(e) => setFileSearch(e.target.value)}
            placeholder="ফাইল খুঁজুন…"
            className="h-8 font-bengali text-xs"
            aria-label="ফাইল সার্চ"
          />
          <ul className="scroll-slim max-h-40 overflow-y-auto pr-1">
            {filteredDocs.length === 0 ? (
              <li className="py-3 text-center text-[11px] text-muted-foreground font-bengali">
                কোনো ফাইল নেই
              </li>
            ) : (
              filteredDocs.map((d) => (
                <li key={d.id}>
                  <button
                    onClick={() =>
                      onAdd({
                        kind: "document",
                        targetId: d.id,
                        title: d.name,
                        path: d.nodePath ?? "",
                        meta: { nodeId: d.nodeId, ext: d.ext },
                      })
                    }
                    disabled={pending}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-primary/10 disabled:opacity-50"
                  >
                    <FileText className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium font-bengali">{d.name}</span>
                    <span className="shrink-0 text-[9px] text-muted-foreground font-bengali">{d.nodePath?.split(" › ")[0] ?? ""}</span>
                    <Plus className="h-3 w-3 shrink-0 text-primary" />
                  </button>
                </li>
              ))
            )}
          </ul>
        </TabsContent>

        <TabsContent value="question" className="mt-0">
          <ul className="scroll-slim max-h-40 overflow-y-auto pr-1">
            {questions.length === 0 ? (
              <li className="py-3 text-center text-[11px] text-muted-foreground font-bengali">
                প্রশ্নব্যাংকে এখনো কোনো প্রশ্ন নেই
              </li>
            ) : (
              questions.map((q) => (
                <li key={q.id}>
                  <button
                    onClick={() =>
                      onAdd({
                        kind: "question",
                        targetId: q.id,
                        title: q.title || (q.contentPlain.slice(0, 60) || "প্রশ্ন"),
                        path: q.nodePath ?? "",
                        meta: { nodeId: q.nodeId },
                      })
                    }
                    disabled={pending}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-primary/10 disabled:opacity-50"
                  >
                    <HelpCircle className="h-3.5 w-3.5 shrink-0 text-fuchsia-500" />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium font-bengali">
                      {q.title || q.contentPlain.slice(0, 50) || "শিরোনামহীন প্রশ্ন"}
                    </span>
                    <span className="shrink-0 text-[9px] text-muted-foreground font-bengali">{q.nodePath?.split(" › ")[0] ?? ""}</span>
                    <Plus className="h-3 w-3 shrink-0 text-primary" />
                  </button>
                </li>
              ))
            )}
          </ul>
        </TabsContent>

        <TabsContent value="link" className="mt-0">
          <ul className="scroll-slim max-h-40 overflow-y-auto pr-1">
            {links.length === 0 ? (
              <li className="py-3 text-center text-[11px] text-muted-foreground font-bengali">
                কোনো স্মার্ট লিংক নেই
              </li>
            ) : (
              links.map((l) => (
                <li key={l.id}>
                  <button
                    onClick={() =>
                      onAdd({
                        kind: "link",
                        targetId: l.id,
                        title: l.title,
                        path: "",
                        meta: { nodeId: l.nodeId, url: l.url },
                      })
                    }
                    disabled={pending}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-primary/10 disabled:opacity-50"
                  >
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium font-bengali">{l.title}</span>
                    <Plus className="h-3 w-3 shrink-0 text-primary" />
                  </button>
                </li>
              ))
            )}
          </ul>
        </TabsContent>

        <TabsContent value="custom" className="mt-0">
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const t = customTitle.trim();
              if (!t) {
                toast.error("আইটেমের নাম লিখুন");
                return;
              }
              onAdd({ kind: "custom", title: t });
              setCustomTitle("");
            }}
          >
            <Input
              value={customTitle}
              onChange={(e) => setCustomTitle(e.target.value)}
              placeholder="যেমন: বিগত সালের প্রশ্ন ঝালাই…"
              className="h-8 flex-1 font-bengali text-xs"
              aria-label="নিজের আইটেম"
            />
            <Button type="submit" size="sm" className="h-8 gap-1 font-bengali" disabled={pending}>
              <Plus className="h-3 w-3" /> যোগ
            </Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------- weekly dashboard ----------

function PlanDashboard({ stats }: { stats?: PlanStatsDTO }) {
  // রোলিং ৮ সপ্তাহ — প্রতিটি বার আজ দিয়ে শেষ হওয়া ৭ দিন; প্রতিদিন উইন্ডো একদিন এগিয়ে যায়
  const rolls = stats?.rollingWeeks ?? [];
  const firstRoll = rolls.length > 0 ? rolls[0] : null;
  const lastRoll = rolls.length > 0 ? rolls[rolls.length - 1] : null;
  const endsToday = lastRoll ? lastRoll.end === todayStr() : false;

  const weekData = useMemo(
    () =>
      rolls.map((w) => ({
        label: bnShortDate.format(new Date(w.end + "T00:00:00")),
        range: `${bnShortDate.format(new Date(w.start + "T00:00:00"))}–${bnShortDate.format(new Date(w.end + "T00:00:00"))}`,
        সফল: w.success,
        ব্যর্থ: w.fail,
      })),
    [rolls]
  );
  const lastIdx = weekData.length - 1;

  return (
    <PanelBox
      tone="cyan"
      ariaLabel="সাপ্তাহিক প্রগ্রেস ড্যাশবোর্ড"
      icon={<TrendingUp className="h-4 w-4" />}
      title="প্রগ্রেস ড্যাশবোর্ড"
      subtitle="স্ট্রিক · সাফল্যের হার · রোলিং ৮ সপ্তাহ"
    >
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={<Flame className="h-4 w-4" />} tone="orange" label="বর্তমান স্ট্রিক" value={`${toBn(stats?.currentStreak ?? 0)} দিন`} />
        <StatCard icon={<Trophy className="h-4 w-4" />} tone="amber" label="সেরা স্ট্রিক" value={`${toBn(stats?.bestStreak ?? 0)} দিন`} />
        <StatCard
          icon={<ListChecks className="h-4 w-4" />}
          tone="emerald"
          label="প্ল্যান সম্পন্ন"
          value={`${toBn(stats?.doneItems ?? 0)}/${toBn(stats?.totalItems ?? 0)} আইটেম`}
        />
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          tone="teal"
          label="সাফল্যের হার"
          value={`${toBn(stats?.successRate ?? 0)}% (${toBn(stats?.successDays ?? 0)}/${toBn(stats?.markedDays ?? 0)} দিন)`}
        />
      </div>

      <div className="mt-4 rounded-xl border border-border/60 bg-background/40 p-3">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <p className="text-[11px] font-semibold text-muted-foreground font-bengali">
            ৮ সপ্তাহের সাফল্য-ব্যর্থতা
          </p>
          <span className="ml-auto flex items-center gap-1 rounded-full bg-cyan-500/12 px-2 py-0.5 text-[9px] font-bold text-cyan-700 ring-1 ring-cyan-500/30 dark:text-cyan-300 font-bengali">
            <TrendingUp className="h-2.5 w-2.5" /> রোলিং ৮ সপ্তাহ
          </span>
        </div>
        {firstRoll && lastRoll && (
          <p className="mb-1.5 flex flex-wrap items-center gap-1 text-[10px] text-muted-foreground font-bengali">
            <CalendarDays className="h-3 w-3 shrink-0 text-cyan-600 dark:text-cyan-400" />
            <span>
              {bnShortDate.format(new Date(firstRoll.start + "T00:00:00"))} →{" "}
              {bnShortDate.format(new Date(lastRoll.end + "T00:00:00"))}
              {endsToday ? " (আজ)" : ""} — প্রতিদিন একদিন করে এগিয়ে যায়
            </span>
          </p>
        )}
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekData} margin={{ top: 4, right: 4, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" opacity={0.12} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <RTooltip
                contentStyle={{ borderRadius: 12, fontSize: 12, border: "1px solid rgba(120,120,120,.3)" }}
                formatter={(v: number | string) => [`${toBn(Number(v))} দিন`]}
                labelFormatter={(l) => {
                  const w = weekData.find((d) => d.label === l);
                  return w ? `${w.range} সপ্তাহ` : l;
                }}
              />
              <Bar dataKey="সফল" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={26}>
                {weekData.map((_, i) => (
                  <Cell key={`s-${i}`} fill={i === lastIdx ? "#059669" : "#10b981"} />
                ))}
              </Bar>
              <Bar dataKey="ব্যর্থ" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={26}>
                {weekData.map((_, i) => (
                  <Cell key={`f-${i}`} fill={i === lastIdx ? "#e11d48" : "#f43f5e"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </PanelBox>
  );
}

function StatCard({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode;
  tone: "orange" | "amber" | "emerald" | "teal";
  label: string;
  value: string;
}) {
  const tones: Record<string, string> = {
    orange: "bg-orange-500/15 text-orange-700 dark:text-orange-300 ring-orange-500/30",
    amber: "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30",
    emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30",
    teal: "bg-teal-500/15 text-teal-700 dark:text-teal-300 ring-teal-500/30",
  };
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-background/50 p-3 shadow-sm transition-shadow hover:shadow-md">
      <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1", tones[tone])}>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground font-bengali">{label}</p>
        <p className="truncate text-sm font-bold font-bengali">{value}</p>
      </div>
    </div>
  );
}

// ---------- heatmap (নিজস্ব প্রিমিয়াম বক্স) ----------

function HeatmapBox({ days }: { days: { date: string; status: string | null }[] }) {
  const successCount = days.filter((d) => d.status === "success").length;
  const failCount = days.filter((d) => d.status === "fail").length;
  const firstDate = days.length > 0 ? days[0].date : null;
  const lastDate = days.length > 0 ? days[days.length - 1].date : null;
  const deviceToday = todayStr();
  const endsToday = lastDate === deviceToday;

  return (
    <PanelBox
      tone="amber"
      ariaLabel="৯১ দিনের অ্যাক্টিভিটি হিটম্যাপ"
      icon={<Flame className="h-4 w-4" />}
      title="৯১ দিনের অ্যাক্টিভিটি হিটম্যাপ"
      subtitle="শেষ ৯১ দিনের সাফল্য-ব্যর্থতার নকশা — প্রতিদিন নিজে থেকেই একদিন এগিয়ে যায়"
    >
      {/* রোলিং উইন্ডো রেঞ্জ — প্রথম তারিখ → আজ, প্রতিদিন স্বয়ংক্রিয়ভাবে আপডেট হয় */}
      {firstDate && lastDate && (
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5 rounded-xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/8 to-transparent px-2.5 py-1.5">
          <CalendarDays className="h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-200 font-bengali">
            {bnShortDate.format(new Date(firstDate + "T00:00:00"))} → {" "}
            {bnShortDate.format(new Date(lastDate + "T00:00:00"))}
            {endsToday ? " (আজ)" : ""}
          </p>
          <span className="ml-auto flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold text-amber-700 ring-1 ring-amber-500/30 dark:text-amber-300 font-bengali">
            <TrendingUp className="h-2.5 w-2.5" /> রোলিং ৯১ দিন
          </span>
        </div>
      )}

      <div className="mb-2.5 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-emerald-500/12 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-500/25 font-bengali dark:text-emerald-300">
          সফল {toBn(successCount)}
        </span>
        <span className="rounded-full bg-rose-500/12 px-2.5 py-0.5 text-[10px] font-semibold text-rose-700 ring-1 ring-rose-500/25 font-bengali dark:text-rose-300">
          ব্যর্থ {toBn(failCount)}
        </span>
        <span className="rounded-full bg-muted/60 px-2.5 py-0.5 text-[10px] font-semibold text-muted-foreground ring-1 ring-border font-bengali">
          মার্ক নেই {toBn(Math.max(days.filter((d) => !d.status).length, 0))}
        </span>
      </div>

      <Heatmap days={days} />

      <p className="mt-2 text-[10px] text-muted-foreground font-bengali">
        <span className="font-semibold text-emerald-600 dark:text-emerald-400">সবুজ</span> = সফল ✓ ·{" "}
        <span className="font-semibold text-rose-600 dark:text-rose-400">লাল</span> = ব্যর্থ ✕ · ফাঁকা = মার্ক নেই ·{" "}
        <span className="font-semibold text-amber-600 dark:text-amber-400">হলুদ রিং</span> = আজ
      </p>
    </PanelBox>
  );
}

/**
 * GitHub-style rolling 13×7 contribution grid — columns are weeks, rows Sat…Fri (BD week).
 * সময়ের সাথে আপডেট হয়: প্রতিদিন শেষে আজকের ডেট যুক্ত হয় আর প্রথম ডেট একদিন এগিয়ে যায়।
 * সেটা চোখে দেখা যায় — মাস-লেবেল, বারের দিন-লেবেল আর আজকের সেল-হাইলাইটসহ।
 */
function Heatmap({ days }: { days: { date: string; status: string | null }[] }) {
  const deviceToday = todayStr();
  // pad the front so the first column starts on Saturday
  const firstDow = days.length > 0 ? (new Date(days[0].date + "T00:00:00").getDay() + 1) % 7 : 0;
  const cells: (typeof days)[number][] = [];
  for (let i = 0; i < firstDow; i++) cells.push({ date: `pad-${i}`, status: null });
  cells.push(...days);

  const columns: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) columns.push(cells.slice(i, i + 7));

  // month labels — above the column where a new month begins (overlap-guarded);
  // শেষ মাসটি গ্রিডের শেষ প্রান্তে right-aligned বসে যেন কাটা না পড়ে
  const monthLabels: Record<number, string> = {};
  const rightAligned = new Set<number>();
  let prevMonth = "";
  let prevLabelCol = -99;
  columns.forEach((col, ci) => {
    const real = col.find((d) => !d.date.startsWith("pad-"));
    if (!real) return;
    const m = real.date.slice(0, 7);
    if (m !== prevMonth) {
      const label = bnMonthOnly.format(new Date(real.date + "T00:00:00"));
      if (ci - prevLabelCol >= 3) {
        if (ci <= columns.length - 3) {
          monthLabels[ci] = label;
          prevLabelCol = ci;
        } else if (columns.length - 1 > prevLabelCol && !monthLabels[columns.length - 1]) {
          monthLabels[columns.length - 1] = label;
          rightAligned.add(columns.length - 1);
          prevLabelCol = columns.length - 1;
        }
      }
      prevMonth = m;
    }
  });

  const cellTone = (d: (typeof days)[number]) =>
    cn(
      "h-3 w-3 rounded-[3px] border",
      d.status === "success" && "border-emerald-600/60 bg-emerald-500",
      d.status === "fail" && "border-rose-600/60 bg-rose-500",
      !d.status && !d.date.startsWith("pad-") && "border-border/60 bg-muted/50",
      d.date.startsWith("pad-") && "border-transparent bg-transparent",
      d.date === deviceToday &&
        "border-amber-600/70 bg-amber-400/70 ring-2 ring-amber-500/80 ring-offset-1 ring-offset-card"
    );

  const tooltipOf = (d: (typeof days)[number]) =>
    d.date === deviceToday
      ? `আজ, ${bnShortDate.format(new Date(d.date + "T00:00:00"))}`
      : bnShortDate.format(new Date(d.date + "T00:00:00"));

  return (
    <div className="scroll-slim overflow-x-auto pb-1">
      <div className="flex gap-[3px]">
        {/* বারের দিন-লেবেল (শনি…শুক্র) */}
        <div aria-hidden className="flex flex-col gap-[3px]">
          {["শনি", "", "সোম", "", "বুধ", "", ""].map((w, ri) => (
            <span
              key={ri}
              className="flex h-3 w-7 items-center text-[8px] leading-none text-muted-foreground font-bengali"
            >
              {w}
            </span>
          ))}
        </div>
        <div className="flex flex-col">
          {/* মাস-লেবেল সারি — উইন্ডো এগোলে লেবেলগুলোও সরে */}
          <div aria-hidden className="mb-1 flex h-3.5 gap-[3px]">
            {columns.map((_, ci) => {
              const label = monthLabels[ci];
              if (!label) return <span key={ci} className="w-3 shrink-0" />;
              const rightEdge = rightAligned.has(ci);
              return (
                <span
                  key={ci}
                  className={cn(
                    "w-3 shrink-0 whitespace-nowrap text-[8px] leading-none text-muted-foreground font-bengali",
                    rightEdge && "relative"
                  )}
                >
                  {rightEdge ? <span className="absolute right-0">{label}</span> : label}
                </span>
              );
            })}
          </div>
          <div className="flex gap-[3px]">
            {columns.map((col, ci) => (
              <div key={ci} className="flex flex-col gap-[3px]">
                {col.map((d) => (
                  <Tooltip key={d.date}>
                    <TooltipTrigger asChild>
                      <span aria-hidden className={cellTone(d)} />
                    </TooltipTrigger>
                    {!d.date.startsWith("pad-") && (
                      <TooltipContent className="font-bengali text-[10px]">
                        {tooltipOf(d)}
                        {d.status === "success"
                          ? " — সফল ✓"
                          : d.status === "fail"
                            ? " — ব্যর্থ ✕"
                            : " — মার্ক নেই"}
                      </TooltipContent>
                    )}
                  </Tooltip>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
