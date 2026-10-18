"use client";

// ---------- Smart Revision (#19) ----------
// Spaced repetition for the MCQ bank. For every question we track:
//   Last reviewed · Next review · Review count · Confidence
// User feedback after recall: 😰 Again · 😕 Hard · 🙂 Good · 😎 Easy —
// which schedules the future review date (SM-2-lite intervals).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlarmClock,
  Brain,
  CheckCircle2,
  ChevronDown,
  Flame,
  Lightbulb,
  Loader2,
  Play,
  RefreshCcw,
  SkipForward,
  Sparkles,
  Square,
  TrendingUp,
} from "lucide-react";
import { fetchSmartReview, postSmartFeedback } from "@/lib/bcs-api";
import {
  toBn,
  type McqReviewDTO,
  type SmartFeedback,
} from "@/lib/bcs-types";
import { cn } from "@/lib/utils";
import { ExplanationRichView, isRichEmpty, resolveExplanationHtml } from "./explanation-editor";

const INTERVALS_DAYS = [1, 2, 4, 8, 16, 32, 64];
const MAX_LEVEL = INTERVALS_DAYS.length - 1;
const OPTION_LABELS = ["ক", "খ", "গ", "ঘ", "ঙ", "চ"];

const FEEDBACK_META: Record<
  SmartFeedback,
  { emoji: string; label: string; next: string; cls: string; toast: string }
> = {
  again: {
    emoji: "😰",
    label: "আবার",
    next: "১০ মিনিট পরে",
    cls: "border-rose-500/50 bg-rose-500/10 text-rose-700 hover:bg-rose-500/20 dark:text-rose-300",
    toast: "নির্দ্বিধায় — ১০ মিনিট পরে আবার ফিরবে",
  },
  hard: {
    emoji: "😕",
    label: "কঠিন",
    next: "আগামীকাল",
    cls: "border-amber-500/50 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 dark:text-amber-300",
    toast: "আগামীকাল আবার দেখা হবে",
  },
  good: {
    emoji: "🙂",
    label: "ভালো",
    next: "",
    cls: "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300",
    toast: "দারুণ — পরের সময়ে ফিরবে",
  },
  easy: {
    emoji: "😎",
    label: "সহজ",
    next: "",
    cls: "border-teal-500/50 bg-teal-500/10 text-teal-700 hover:bg-teal-500/20 dark:text-teal-300",
    toast: "অসাধারণ! দীর্ঘ বিরতিতে ফিরবে",
  },
};

function goodDays(level: number): number {
  const nl = Math.min(level + 1, MAX_LEVEL);
  return INTERVALS_DAYS[nl];
}
function easyDays(level: number): number {
  const nl = Math.min(level + 2, MAX_LEVEL);
  return Math.round(INTERVALS_DAYS[nl] * 1.5);
}
function nextPreview(review: McqReviewDTO | null, fb: SmartFeedback): string {
  if (fb === "again") return FEEDBACK_META.again.next;
  if (fb === "hard") return FEEDBACK_META.hard.next;
  const lvl = review?.level ?? 0;
  return `${toBn(fb === "good" ? goodDays(lvl) : easyDays(lvl))} দিন পরে`;
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const past = diff >= 0;
  const s = Math.abs(diff) / 1000;
  let out: string;
  if (s < 60) out = "এইমাত্র";
  else if (s < 3600) out = `${toBn(Math.floor(s / 60))} মিনিট`;
  else if (s < 86400) out = `${toBn(Math.floor(s / 3600))} ঘণ্টা`;
  else out = `${toBn(Math.floor(s / 86400))} দিন`;
  return past ? `${out} আগে` : `${out} পরে`;
}

/** one premium review row: Last reviewed · Next · Count · Confidence */
function ReviewMeta({ review }: { review: McqReviewDTO | null }) {
  const rows: { label: string; value: string; icon: React.ReactNode }[] = [
    {
      label: "শেষ রিভিউ",
      value: review?.lastReviewedAt ? relTime(review.lastReviewedAt) : "এখনো হয়নি",
      icon: <AlarmClock className="h-3 w-3" />,
    },
    {
      label: "পরবর্তী রিভিউ",
      value: review ? relTime(review.nextReviewAt) : "এখনই",
      icon: <RefreshCcw className="h-3 w-3" />,
    },
    {
      label: "রিভিউ সংখ্যা",
      value: `${toBn(review?.reviewCount ?? 0)} বার`,
      icon: <TrendingUp className="h-3 w-3" />,
    },
    {
      label: "আত্মবিশ্বাস",
      value: `${toBn(review?.confidence ?? 0)}%`,
      icon: <Flame className="h-3 w-3" />,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border/60 bg-muted/30 p-2.5 sm:grid-cols-4">
      {rows.map((r) => (
        <div key={r.label} className="flex min-w-0 flex-col gap-0.5">
          <span className="flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-wide text-muted-foreground font-bengali">
            {r.icon} {r.label}
          </span>
          <span className="truncate text-xs font-bold text-foreground/90 font-bengali">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function SmartRevision() {
  const qc = useQueryClient();
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [lastRatedId, setLastRatedId] = useState<string | null>(null);
  const [showExpl, setShowExpl] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["smart-review"],
    queryFn: fetchSmartReview,
  });
  const due = data?.due ?? [];
  const stats = data?.stats;
  // current = first item not just-rated (covers the refetch window)
  const current = due.find((d) => d.mcq.id !== lastRatedId) ?? null;

  const rate = useMutation({
    mutationFn: ({ mcqId, fb }: { mcqId: string; fb: SmartFeedback }) =>
      postSmartFeedback(mcqId, fb),
    onSuccess: (_r, vars) => {
      toast.success(FEEDBACK_META[vars.fb].toast);
      qc.invalidateQueries({ queryKey: ["smart-review"] });
      qc.invalidateQueries({ queryKey: ["mcqs"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      setDone((d) => d + 1);
      setRevealed(false);
      setShowExpl(false);
      setLastRatedId(vars.mcqId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stop = () => {
    setStarted(false);
    setRevealed(false);
    setShowExpl(false);
    setLastRatedId(null);
  };

  const progressPct =
    stats && stats.due > 0 ? Math.min(100, Math.round((done / (done + stats.due)) * 100)) : 100;

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- gradient stats header ---------- */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-500 via-emerald-500 to-green-600 p-4 text-white shadow-lg sm:p-5">
        <Brain className="pointer-events-none absolute -bottom-6 -right-4 h-32 w-32 rotate-12 text-white/15" />
        <div className="relative flex flex-wrap items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm">
            <Brain className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold font-bengali sm:text-lg">
              {stats ? `${toBn(stats.due)}টি প্রশ্ন আজ রিভিউ করা দরকার` : "স্মার্ট রিভিশন"}
            </p>
            <p className="text-[11px] text-white/85 font-bengali sm:text-xs">
              ফিডব্যাক অনুযায়ী প্রতিটি প্রশ্ন ঠিক সময়েই ফিরে আসবে
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold font-bengali backdrop-blur-sm">
              ট্র্যাকড {toBn(stats?.tracked ?? 0)}
            </span>
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold font-bengali backdrop-blur-sm">
              গড় আত্মবিশ্বাস {toBn(stats?.avgConfidence ?? 0)}%
            </span>
            <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold font-bengali backdrop-blur-sm">
              আজ {toBn(stats?.reviewedToday ?? 0)} বার
            </span>
            {!started && stats && stats.due > 0 && (
              <button
                onClick={() => setStarted(true)}
                className="flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-bold text-emerald-700 shadow transition-transform duration-200 hover:scale-105 font-bengali"
              >
                <Play className="h-3.5 w-3.5" /> শুরু করুন
              </button>
            )}
            {started && (
              <button
                onClick={stop}
                className="flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-xs font-bold text-rose-600 shadow transition-transform duration-200 hover:scale-105 font-bengali"
              >
                <Square className="h-3 w-3" /> থামুন
              </button>
            )}
          </div>
        </div>
        {started && (
          <div className="relative mt-3 flex items-center gap-2">
            <Progress value={progressPct} className="h-1.5 bg-white/25" />
            <span className="shrink-0 text-[11px] font-bold font-bengali">
              {toBn(done)} সম্পন্ন
            </span>
          </div>
        )}
      </div>

      {/* ---------- session ---------- */}
      {started && isLoading && (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> <span className="font-bengali">লোড হচ্ছে…</span>
        </div>
      )}

      {started && !current && (
        <div className="glass flex flex-col items-center gap-2 rounded-2xl px-6 py-10 text-center">
          <Sparkles className="h-8 w-8 text-emerald-500" />
          <p className="text-sm font-bold font-bengali">
            {done > 0 ? "সেশন সম্পন্ন! 🎉" : "এই মুহূর্তে কিছু রিভিউ করার নেই"}
          </p>
          <p className="max-w-sm text-xs leading-5 text-muted-foreground font-bengali">
            {done > 0
              ? `${toBn(done)}টি প্রশ্ন রিভিউ হয়েছে — প্রতিটি ঠিক সময়ে ফিরে আসবে।`
              : stats?.nextDueAt
                ? `পরবর্তী রিভিউ: ${relTime(stats.nextDueAt)}`
                : "MCQ প্র্যাকটিস করুন — প্রশ্নগুলো এখানে এসে জমা হবে।"}
          </p>
        </div>
      )}

      <AnimatePresence mode="wait">
        {started && current && (
          <motion.div
            key={current.mcq.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-col gap-3"
          >
            <ReviewMeta review={current.review} />

            {/* 3D question box (consistent with the MCQ bank) */}
            <div className="[perspective:1200px]">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-rose-500/10 p-4 shadow-[0_18px_40px_-18px_rgb(0_0_0/0.45)] ring-1 ring-amber-500/30 [transform:rotateX(1.2deg)] sm:p-5">
                <Brain className="pointer-events-none absolute -bottom-6 -right-4 h-24 w-24 rotate-12 text-amber-500/10" />
                <span className="relative mb-2 flex w-fit items-center rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 font-bengali">
                  মনে করার চেষ্টা করুন
                </span>
                <p className="relative whitespace-pre-wrap text-[15px] font-semibold leading-relaxed font-bengali">
                  {current.mcq.question}
                </p>
              </div>
            </div>

            {/* options — visible but muted; correct lights up on reveal */}
            <div className="flex flex-col gap-2" role="group" aria-label="অপশন">
              {current.mcq.options.map((opt, i) => {
                const isCorrect = revealed && i === current.mcq.correctIndex;
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm font-bengali transition-all duration-300",
                      isCorrect
                        ? "border-emerald-500/70 bg-gradient-to-r from-emerald-500/15 to-teal-500/10 font-semibold text-emerald-700 ring-1 ring-emerald-500/40 dark:text-emerald-300"
                        : "border-border/60 text-foreground/70"
                    )}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold">
                      {OPTION_LABELS[i] ?? toBn(i + 1)}
                    </span>
                    <span className="min-w-0 flex-1">{opt}</span>
                    {isCorrect && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                  </div>
                );
              })}
            </div>

            {/* reveal toggle */}
            {!revealed ? (
              <Button
                size="lg"
                className="h-12 gap-2 font-bengali"
                onClick={() => setRevealed(true)}
              >
                <CheckCircle2 className="h-5 w-5" /> উত্তর দেখুন
                <ChevronDown className="h-4 w-4" />
              </Button>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-3"
              >
                {/* how well did you know this? (#19 user feedback) */}
                <div className="rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-3.5">
                  <p className="mb-2.5 flex items-center justify-center gap-1.5 text-center text-sm font-bold font-bengali">
                    <Flame className="h-4 w-4 text-primary" />
                    এটি কতটা জানতেন?
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {(Object.keys(FEEDBACK_META) as SmartFeedback[]).map((fb) => (
                      <button
                        key={fb}
                        disabled={rate.isPending}
                        onClick={() => rate.mutate({ mcqId: current.mcq.id, fb })}
                        aria-label={`ফিডব্যাক: ${FEEDBACK_META[fb].label} — ${nextPreview(current.review, fb)}`}
                        className={cn(
                          "flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl border px-2 py-2 text-sm font-bold transition-all duration-200 hover:-translate-y-0.5 disabled:opacity-50 font-bengali",
                          FEEDBACK_META[fb].cls
                        )}
                      >
                        <span className="text-base leading-none">{FEEDBACK_META[fb].emoji}</span>
                        <span>{FEEDBACK_META[fb].label}</span>
                        <span className="text-[9.5px] font-medium opacity-75 font-bengali">
                          {nextPreview(current.review, fb)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* explanation after reveal */}
                {!isRichEmpty(resolveExplanationHtml(current.mcq)) && (
                  <div className="flex justify-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 font-bengali text-muted-foreground"
                      onClick={() => setShowExpl((s) => !s)}
                    >
                      <Lightbulb className="h-4 w-4 text-amber-500" />
                      {showExpl ? "ব্যাখ্যা লুকান" : "ব্যাখ্যা দেখুন"}
                    </Button>
                  </div>
                )}
                <AnimatePresence>
                  {showExpl && !isRichEmpty(resolveExplanationHtml(current.mcq)) && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <ExplanationRichView
                        html={resolveExplanationHtml(current.mcq)}
                        tone="amber"
                        label="ব্যাখ্যা"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* skip today */}
                <div className="flex justify-center">
                  <button
                    onClick={() => {
                      setRevealed(false);
                      setShowExpl(false);
                      setLastRatedId(current.mcq.id);
                    }}
                    className="flex items-center gap-1 rounded-full border border-border/60 px-3 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground font-bengali"
                  >
                    <SkipForward className="h-3 w-3" /> এটি পরে দেখব
                  </button>
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------- how it works ---------- */}
      {!started && (
        <div className="glass rounded-2xl p-5">
          <p className="mb-3 flex items-center gap-1.5 text-sm font-bold font-bengali">
            <Brain className="h-4 w-4 text-primary" /> কীভাবে কাজ করে
          </p>
          <ul className="grid gap-2 text-xs leading-6 text-muted-foreground font-bengali sm:grid-cols-2">
            <li>😰 <b className="text-foreground/80">আবার</b> — ১০ মিনিট পরেই ফিরবে, ভুল নোটবুকেও যাবে</li>
            <li>😕 <b className="text-foreground/80">কঠিন</b> — কাল আবার দেখা হবে</li>
            <li>🙂 <b className="text-foreground/80">ভালো</b> — ধাপে ধাপে ২ → ৪ → ৮ → ১৬ দিন পরে</li>
            <li>😎 <b className="text-foreground/80">সহজ</b> — দ্বিগুণ বিরতিতে, দীর্ঘদিন পরে</li>
          </ul>
        </div>
      )}
    </div>
  );
}
