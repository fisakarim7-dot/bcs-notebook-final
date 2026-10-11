"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { fetchStats } from "@/lib/bcs-api";
import { useBcsStore } from "@/lib/bcs-store";
import { formatBytes, formatMinutes, toBn } from "@/lib/bcs-types";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ProgressRing } from "./progress-ring";
import { PomodoroTimer } from "./pomodoro";
import { MasteryDashboard } from "./mastery";
import {
  StickyNote,
  CheckCircle2,
  FileStack,
  Link2,
  HardDrive,
  Flame,
  GraduationCap,
  History,
  Sparkles,
  LayoutDashboard,
  Target,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as ReTooltip,
  CartesianGrid,
} from "recharts";

const RING_COLORS = ["#149d8c", "#d9a13c", "#dd7a5c", "#5f9e7f", "#b48ad9", "#8bc34a"];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as const } },
};

export function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <motion.div
      variants={item}
      className="glass group rounded-2xl p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_8px_24px_var(--glow)]"
    >
      <div className="flex items-center gap-2 text-muted-foreground">
        <span className="glass-strong flex h-8 w-8 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110">
          {icon}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </motion.div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Late-night focus";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function OverviewDashboard() {
  const { data: stats, isLoading } = useQuery({ queryKey: ["stats"], queryFn: fetchStats });
  const { selectNode } = useBcsStore();

  const bengaliDate = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("bn-BD", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date());
    } catch {
      return new Date().toDateString();
    }
  }, []);

  const weekData = useMemo(
    () =>
      (stats?.weekFocus ?? []).map((d) => ({
        ...d,
        day: new Date(d.date + "T00:00:00").toLocaleDateString("en", { weekday: "short" }),
      })),
    [stats?.weekFocus]
  );

  if (isLoading || !stats) {
    return (
      <div className="grid flex-1 place-items-center">
        <div className="flex flex-col items-center gap-3">
          <Sparkles className="h-8 w-8 animate-pulse text-primary" />
          <p className="text-sm text-muted-foreground font-bengali">ড্যাশবোর্ড লোড হচ্ছে…</p>
        </div>
      </div>
    );
  }

  const overall =
    stats.totals.notes > 0
      ? Math.round((stats.totals.completedNotes / stats.totals.notes) * 100)
      : 0;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col gap-5">
      {/* Hero */}
      <motion.section variants={item} className="glass relative overflow-hidden rounded-2xl p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-primary/10 blur-3xl" />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              {greeting()}, future cadre
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-[28px]">
              <span className="text-gradient">BCS Written</span> Command Center
            </h1>
            <p className="mt-1 text-xs text-muted-foreground font-bengali">{bengaliDate}</p>
          </div>
          <div className="flex items-center gap-4">
            <ProgressRing
              percent={overall}
              size={96}
              color={RING_COLORS[0]}
              label="done"
              sublabel="Overall completion"
            />
          </div>
        </div>
      </motion.section>

      {/* Stat cards */}
      <motion.section variants={item} className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        <StatCard
          icon={<StickyNote className="h-4 w-4 text-primary" />}
          label="Leaf Notes"
          value={String(stats.totals.notes)}
          hint={`${stats.totals.completedNotes} completed`}
        />
        <StatCard
          icon={<CheckCircle2 className="h-4 w-4 text-chart-4" />}
          label="Subjects"
          value={String(stats.totals.subjects)}
          hint={`${stats.totals.folders} sections`}
        />
        <StatCard
          icon={<FileStack className="h-4 w-4 text-chart-2" />}
          label="Documents"
          value={String(stats.totals.documents)}
          hint="in your vault"
        />
        <StatCard
          icon={<Link2 className="h-4 w-4 text-chart-3" />}
          label="Smart Links"
          value={String(stats.totals.links)}
          hint="cloud attached"
        />
        <StatCard
          icon={<Flame className="h-4 w-4 text-chart-3" />}
          label="Focus Today"
          value={formatMinutes(stats.totals.todayFocusMinutes)}
          hint={`${formatMinutes(stats.totals.focusMinutes)} all-time`}
        />
      </motion.section>

      <div className="grid gap-5 xl:grid-cols-3">
        {/* Left 2/3: rings + chart */}
        <motion.section variants={item} className="flex flex-col gap-5 xl:col-span-2">
          <div className="glass rounded-2xl p-5">
            <h2 className="mb-1 flex items-center gap-2 text-sm font-bold tracking-tight font-bengali">
              <GraduationCap className="h-4 w-4 text-primary" /> বিষয়ভিত্তিক অগ্রগতি
            </h2>
            <p className="mb-4 text-xs text-muted-foreground font-bengali">
              রিং = সম্পন্ন নোট ÷ মোট লিফ নোট · ক্লিক করলে বিষয়টি খুলবে
            </p>
            {stats.subjects.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground font-bengali">
                এখনো কোনো বিষয় নেই — সাইডবার থেকে যোগ করুন।
              </p>
            ) : (
              <div className="grid grid-cols-3 justify-items-center gap-4 py-2 sm:grid-cols-4 lg:grid-cols-6">
                {stats.subjects.map((s, i) => (
                  <Tooltip key={s.id}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => selectNode(s.id)}
                        className="flex flex-col items-center rounded-xl p-1.5 transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent/50 hover:shadow-[0_6px_18px_var(--glow)]"
                        aria-label={`${s.name} খুলুন`}
                      >
                        <ProgressRing
                          percent={s.percent}
                          color={RING_COLORS[i % RING_COLORS.length]}
                          size={86}
                          label={`${s.completedNotes}/${s.totalNotes}`}
                          sublabel={s.name}
                        />
                        <span className="mt-0.5 text-[10px] text-muted-foreground font-bengali">
                          মোট: {toBn(s.totalItems)}টি
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="font-bengali">
                      নোট {toBn(s.noteItems)} · ফাইল {toBn(s.documents)} · লিংক {toBn(s.links)}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </div>
            )}
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight">
                <History className="h-4 w-4 text-primary" /> Focus — Last 7 Days
              </h2>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <HardDrive className="h-3 w-3" /> Vault: {formatBytes(stats.totals.storageBytes)}
              </span>
            </div>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekData} margin={{ top: 4, right: 8, left: -22, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="var(--border)" />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    width={40}
                  />
                  <ReTooltip
                    cursor={{ fill: "var(--accent)", opacity: 0.5 }}
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      fontSize: 12,
                      color: "var(--popover-foreground)",
                    }}
                    formatter={(v) => [`${v} min`, "Focus"]}
                  />
                  <Bar
                    dataKey="minutes"
                    radius={[7, 7, 7, 7]}
                    fill="#149d8c"
                    maxBarSize={26}
                    style={{ filter: "drop-shadow(0 0 6px rgba(20,157,140,0.35))" }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </motion.section>

        {/* Right 1/3: pomodoro + recent */}
        <motion.section variants={item} className="flex flex-col gap-5">
          <div className="glass rounded-2xl p-5">
            <PomodoroTimer />
          </div>

          <div className="glass min-h-0 rounded-2xl p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold tracking-tight">
              <History className="h-4 w-4 text-primary" /> Recently Edited
            </h2>
            {stats.recent.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                Notes you edit will appear here.
              </p>
            ) : (
              <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1 scroll-slim">
                {stats.recent.map((r) => (
                  <li key={r.id}>
                    <button
                      onClick={() => selectNode(r.id)}
                      className="group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start transition-colors hover:bg-accent/60"
                    >
                      <StickyNote
                        className={
                          r.completed
                            ? "h-4 w-4 shrink-0 text-primary"
                            : "h-4 w-4 shrink-0 text-muted-foreground"
                        }
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium font-bengali">
                        {r.name}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {new Date(r.updatedAt).toLocaleDateString("en", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </motion.section>
      </div>
    </motion.div>
  );
}

type DashboardTab = "overview" | "mastery";

export function Dashboard() {
  const [tab, setTab] = useState<DashboardTab>("overview");

  return (
    <div className="flex flex-col gap-5">
      {/* Top-level segmented view switch (matches topbar tablist styling) */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] as const }}
        className="flex items-center"
      >
        <div
          className="glass inline-flex items-center rounded-xl p-0.5"
          role="tablist"
          aria-label="ড্যাশবোর্ড ভিউ নির্বাচন"
        >
          <button
            role="tab"
            aria-selected={tab === "overview"}
            onClick={() => setTab("overview")}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium font-bengali transition-all duration-300",
              tab === "overview"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            সার্বিক
          </button>
          <button
            role="tab"
            aria-selected={tab === "mastery"}
            onClick={() => setTab("mastery")}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium font-bengali transition-all duration-300",
              tab === "mastery"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Target className="h-3.5 w-3.5" />
            মাস্টারি
          </button>
        </div>
      </motion.div>

      {tab === "overview" ? <OverviewDashboard /> : <MasteryDashboard />}
    </div>
  );
}
