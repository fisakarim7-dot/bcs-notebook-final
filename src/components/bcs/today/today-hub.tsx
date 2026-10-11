"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Brain,
  CalendarClock,
  CheckCircle2,
  Flame,
  GraduationCap,
  Layers,
  ListChecks,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  fetchAttempts,
  fetchExams,
  fetchFlashcards,
  fetchMcqs,
  fetchPlanMonth,
  fetchSmartReview,
  fetchStats,
} from "@/lib/bcs-api";
import { toBn } from "@/lib/bcs-types";
import { useBcsStore } from "@/lib/bcs-store";
import { matchBucket } from "@/lib/bcs-prelim";
import { cn } from "@/lib/utils";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function monthISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function TodayHub() {
  const { goStudy, goCalendar } = useBcsStore();
  const today = todayISO();

  const { data: due } = useQuery({ queryKey: ["flashcards", "due"], queryFn: () => fetchFlashcards("due") });
  const { data: smart } = useQuery({ queryKey: ["smart-review"], queryFn: fetchSmartReview });
  const { data: plan } = useQuery({ queryKey: ["plan", monthISO()], queryFn: () => fetchPlanMonth(monthISO()) });
  const { data: exams = [] } = useQuery({ queryKey: ["exams"], queryFn: fetchExams });
  const { data: mcqsData } = useQuery({ queryKey: ["mcqs", "all"], queryFn: () => fetchMcqs() });
  const { data: stats } = useQuery({ queryKey: ["stats"], queryFn: fetchStats });
  const { data: attempts = [] } = useQuery({ queryKey: ["attempts"], queryFn: fetchAttempts });

  const todayItems = (plan?.items ?? []).filter((i) => i.date === today);
  const doneItems = todayItems.filter((i) => i.done).length;
  const dueCount = due?.count ?? 0;
  const smartDue = smart?.stats.due ?? 0;

  const weak = useMemo(() => {
    const map = new Map<string, { total: number; correct: number }>();
    for (const m of mcqsData?.mcqs ?? []) {
      if (m.attempts === 0) continue;
      const b = matchBucket(m.studyNodePath || m.nodePath);
      const key = b?.label ?? (m.studyNodePath || m.nodePath || "অন্যান্য").split("/")[0];
      const cur = map.get(key) ?? { total: 0, correct: 0 };
      cur.total += m.attempts;
      cur.correct += m.correctCount;
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([label, s]) => ({ label, acc: Math.round((s.correct / s.total) * 100), ...s }))
      .sort((a, b) => a.acc - b.acc)
      .slice(0, 3);
  }, [mcqsData]);

  const lastMock = attempts.filter((a) => a.mode === "mock")[0];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 pb-6">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold font-bengali">
          <Sparkles className="h-5 w-5 text-primary" /> আজকের কমান্ড সেন্টার
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground font-bengali">
          প্ল্যান · বাকি কার্ড · স্মার্ট কিউ · দুর্বল টপিক — এক পর্দায়
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={<Layers className="h-4 w-4" />} label="আজকের কার্ড" value={toBn(dueCount)} tone="emerald" onClick={goStudy} />
        <StatTile icon={<Brain className="h-4 w-4" />} label="স্মার্ট রিভিশন" value={toBn(smartDue)} tone="teal" onClick={goStudy} />
        <StatTile
          icon={<CheckCircle2 className="h-4 w-4" />}
          label="আজকের প্ল্যান"
          value={`${toBn(doneItems)}/${toBn(todayItems.length)}`}
          tone="violet"
          onClick={goCalendar}
        />
        <StatTile
          icon={<Flame className="h-4 w-4" />}
          label="আজকের ফোকাস"
          value={`${toBn(stats?.totals.todayFocusMinutes ?? 0)} মি`}
          tone="amber"
        />
      </div>

      {exams.length > 0 && (
        <div className="glass rounded-2xl p-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold font-bengali">
            <CalendarClock className="h-4 w-4 text-amber-500" /> পরীক্ষার কাউন্টডাউন
          </p>
          <ul className="flex flex-col gap-2">
            {exams.map((e) => {
              const days = Math.round((new Date(`${e.date}T00:00:00`).getTime() - Date.now()) / 86_400_000);
              return (
                <li key={e.id} className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2 text-sm font-bengali">
                  <span className="font-medium">{e.title}</span>
                  <Badge variant={days <= 7 ? "destructive" : "secondary"} className="font-bengali">
                    {days < 0 ? "শেষ" : days === 0 ? "আজই!" : `আর ${toBn(days)} দিন`}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="glass rounded-2xl p-4">
          <p className="mb-2 text-sm font-bold font-bengali">আজকের প্ল্যান</p>
          {todayItems.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground font-bengali">
              আজকের কোনো আইটেম নেই — ক্যালেন্ডার থেকে যোগ করুন।
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {todayItems.slice(0, 8).map((it) => (
                <li key={it.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-bengali">
                  <span className={cn("h-2 w-2 rounded-full", it.done ? "bg-emerald-500" : "bg-muted-foreground/40")} />
                  <span className={cn("truncate", it.done && "line-through opacity-60")}>{it.title}</span>
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" size="sm" className="mt-3 font-bengali" onClick={goCalendar}>
            ক্যালেন্ডার খুলুন
          </Button>
        </div>

        <div className="glass rounded-2xl p-4">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold font-bengali">
            <Target className="h-4 w-4 text-rose-500" /> দুর্বল ৩ টপিক
          </p>
          {weak.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground font-bengali">
              যথেষ্ট MCQ চেষ্টা নেই — প্র্যাকটিস করলে এখানে দেখাবে।
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {weak.map((w) => (
                <li key={w.label} className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs font-bengali">
                    <span className="truncate font-medium">{w.label}</span>
                    <span className={w.acc < 40 ? "text-red-500" : "text-amber-600"}>{toBn(w.acc)}%</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn("h-full rounded-full", w.acc < 40 ? "bg-rose-500" : "bg-amber-500")}
                      style={{ width: `${w.acc}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {lastMock && (
        <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-4 font-bengali">
          <GraduationCap className="h-5 w-5 text-fuchsia-500" />
          <span className="text-sm">শেষ মক: স্কোর {toBn(lastMock.score)}/{toBn(lastMock.total)}</span>
          <Button size="sm" className="ml-auto font-bengali" onClick={goStudy}>
            আবার মক দিন
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button className="font-bengali" onClick={goStudy}>রিভিশন শুরু</Button>
      </div>
    </motion.div>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "emerald" | "teal" | "violet" | "amber";
  onClick?: () => void;
}) {
  const tones = {
    emerald: "from-emerald-500 to-teal-600",
    teal: "from-teal-500 to-cyan-600",
    violet: "from-violet-500 to-fuchsia-600",
    amber: "from-amber-500 to-orange-600",
  };
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative overflow-hidden rounded-2xl p-4 text-start text-white shadow-lg",
        "bg-gradient-to-br",
        tones[tone]
      )}
    >
      <p className="flex items-center gap-1.5 text-[11px] text-white/85 font-bengali">{icon} {label}</p>
      <p className="mt-1 text-2xl font-black tabular-nums">{value}</p>
    </button>
  );
}
