"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Dices,
  Eye,
  Info,
  Loader2,
  XCircle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { fetchMcqs, submitMcqAttempt, type McqAttemptResultItem } from "@/lib/bcs-api";
import { toBn, type McqDTO } from "@/lib/bcs-types";
import { cn } from "@/lib/utils";
import { ExplanationRichView, isRichEmpty, resolveExplanationHtml } from "./explanation-editor";

type Phase = "setup" | "run" | "done";
const COUNT_CHOICES = [10, 25, 50] as const;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Practice runner with immediate feedback. Used for both the normal
 * practice mode and the wrong-answer notebook (mode="wrongbook").
 */
export function McqPractice({ mode }: { mode: "practice" | "wrongbook" }) {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("setup");
  const [count, setCount] = useState<number>(10);
  const [run, setRun] = useState<McqDTO[]>([]);
  const [qi, setQi] = useState(0);
  const [chosen, setChosen] = useState<Record<string, number>>({});
  const [results, setResults] = useState<McqAttemptResultItem[]>([]);
  const [saved, setSaved] = useState(false);
  const [savedSummary, setSavedSummary] = useState<{ correct: number; wrong: number; skipped: number } | null>(null);
  // প্রশ্ন-প্রথম মোড: আগে শুধু প্রশ্ন দেখাবে — নিজে উত্তর ভেবে নিয়ে তারপর অপশন
  const [qFirstPref, setQFirstPref] = useState(true);
  const [qFirst, setQFirst] = useState(true);
  const [revealedQ, setRevealedQ] = useState<Set<number>>(new Set());
  const startRef = useRef<number>(0);

  const { data, isLoading } = useQuery({
    queryKey: ["mcqs", mode === "wrongbook" ? "wrongbook" : "all"],
    queryFn: () => fetchMcqs(mode === "wrongbook" ? "wrongbook" : undefined),
  });

  const bank = data?.mcqs ?? [];

  const submit = useMutation({
    mutationFn: submitMcqAttempt,
    onSuccess: (attempt) => {
      setSaved(true);
      setSavedSummary({
        correct: attempt.correct,
        wrong: attempt.wrong,
        skipped: attempt.skipped,
      });
      qc.invalidateQueries({ queryKey: ["mcqs"] });
      qc.invalidateQueries({ queryKey: ["attempts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startRun = () => {
    const picked = shuffle(bank).slice(0, Math.min(count, bank.length));
    setRun(picked);
    setQi(0);
    setChosen({});
    setResults([]);
    setSaved(false);
    setSavedSummary(null);
    setQFirst(qFirstPref);
    setRevealedQ(new Set());
    startRef.current = Date.now();
    setPhase("run");
  };

  const finish = (finalResults: McqAttemptResultItem[]) => {
    if (finalResults.length > 0) {
      submit.mutate({
        mode,
        seconds: Math.round((Date.now() - startRef.current) / 1000),
        results: finalResults,
      });
    }
    setPhase("done");
  };

  const q = run[qi] ?? null;
  const pickedForQ = q ? chosen[q.id] : undefined;
  const revealedForQ = pickedForQ !== undefined;
  const isLast = qi >= run.length - 1;

  const choose = (optIdx: number) => {
    if (!q || revealedForQ) return;
    const correct = optIdx === q.correctIndex;
    setChosen((c) => ({ ...c, [q.id]: optIdx }));
    setResults((r) => [
      ...r.filter((x) => x.id !== q.id),
      { id: q.id, chosen: optIdx, correct },
    ]);
  };

  const next = () => {
    if (isLast) {
      finish(results);
    } else {
      setQi((i) => i + 1);
    }
  };

  const quitEarly = () => {
    finish(results);
  };

  const pct = useMemo(
    () => (run.length === 0 ? 0 : Math.round(((qi + (revealedForQ ? 1 : 0)) / run.length) * 100)),
    [run.length, qi, revealedForQ]
  );

  // ---------- render ----------

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> <span className="font-bengali">লোড হচ্ছে…</span>
      </div>
    );
  }

  if (phase === "setup") {
    return (
      <div className="glass flex flex-col items-center gap-4 rounded-2xl p-8 text-center sm:p-10">
        <Dices className="h-10 w-10 text-primary" />
        <div>
          <p className="text-lg font-bold font-bengali">
            {mode === "wrongbook" ? "ভুল নোটবুক প্র্যাকটিস" : "MCQ প্র্যাকটিস"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground font-bengali">
            {mode === "wrongbook"
              ? "শুধু ভুল হওয়া প্রশ্নগুলো আবার মাথায় ঢুকবে। সঠিক উত্তর দিলে নোটবুক থেকে বাদ যাবে।"
              : "প্রতিটি উত্তরের সাথে সাথেই সঠিক-ভুল আর ব্যাখ্যা দেখা যাবে।"}
          </p>
        </div>

        {bank.length === 0 ? (
          <p className="max-w-sm rounded-xl bg-amber-500/10 p-3 text-xs leading-6 text-amber-700 dark:text-amber-400 font-bengali">
            {mode === "wrongbook"
              ? "ভুল নোটবুক এখন খালি — প্র্যাকটিসে ভুল হলে প্রশ্ন এখানে জমা হবে।"
              : "প্রথমে MCQ ট্যাব থেকে প্রশ্ন যোগ করুন বা AI দিয়ে বানান।"}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-muted-foreground font-bengali">কতগুলো প্রশ্ন:</span>
              {COUNT_CHOICES.filter((c) => c <= bank.length || c === COUNT_CHOICES[0]).map((c) => (
                <Button
                  key={c}
                  size="sm"
                  variant={count === c ? "default" : "outline"}
                  className="h-9 font-bengali"
                  disabled={c > bank.length}
                  onClick={() => setCount(c)}
                >
                  {toBn(c)}
                </Button>
              ))}
              <Button
                size="sm"
                variant={count === bank.length ? "default" : "outline"}
                className="h-9 font-bengali"
                onClick={() => setCount(bank.length)}
              >
                সব ({toBn(bank.length)})
              </Button>
            </div>
            <Button size="lg" className="h-12 gap-2 font-bengali" onClick={startRun}>
              <Dices className="h-5 w-5" /> শুরু করুন
            </Button>

            <label className="flex max-w-sm cursor-pointer items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-3">
              <span className="flex flex-col items-start gap-0.5">
                <span className="flex items-center gap-1.5 text-sm font-semibold font-bengali">
                  <Eye className="h-4 w-4 text-primary" /> প্রশ্ন-প্রথম মোড
                </span>
                <span className="text-[11px] leading-5 text-muted-foreground font-bengali">
                  আগে শুধু প্রশ্ন দেখাবে — উত্তর মনে মনে ভেবে নিয়ে তারপর অপশন খুলুন।
                </span>
              </span>
              <Switch checked={qFirstPref} onCheckedChange={setQFirstPref} aria-label="প্রশ্ন-প্রথম মোড" />
            </label>
          </>
        )}
      </div>
    );
  }

  if (phase === "done") {
    const r = savedSummary;
    const correct = r?.correct ?? results.filter((x) => x.correct).length;
    const wrong = r?.wrong ?? results.filter((x) => !x.correct).length;
    return (
      <div className="glass flex flex-col items-center gap-4 rounded-2xl p-8 text-center sm:p-10">
        {!saved && submit.isPending ? (
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        ) : (
          <CheckCircle2 className="h-10 w-10 text-primary" />
        )}
        <p className="text-lg font-bold font-bengali">সেশন শেষ!</p>
        <div className="flex flex-wrap items-center justify-center gap-3 text-sm font-bengali">
          <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" /> সঠিক: {toBn(correct)}
          </span>
          <span className="flex items-center gap-1.5 text-red-500">
            <XCircle className="h-4 w-4" /> ভুল: {toBn(wrong)}
          </span>
        </div>
        <p className="max-w-md text-xs leading-6 text-muted-foreground font-bengali">
          {mode === "wrongbook"
            ? "সঠিক উত্তর দেওয়া প্রশ্নগুলো ভুল নোটবুক থেকে বাদ গেছে।"
            : "ভুল হওয়া প্রশ্নগুলো \"ভুল নোটবুক\"-এ জমা হয়েছে — সেখান থেকে আবার প্র্যাকটিস করুন।"}
        </p>
        <Button className="gap-1.5 font-bengali" onClick={() => setPhase("setup")}>
          আবার শুরু করুন
        </Button>
      </div>
    );
  }

  // ---- running ----
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="h-6 px-2 font-bengali text-xs">
          {toBn(qi + 1)} / {toBn(run.length)}
        </Badge>
        <div className="flex-1">
          <Progress value={pct} className="h-2" />
        </div>
        <Button variant="ghost" size="sm" className="h-8 font-bengali text-muted-foreground" onClick={quitEarly}>
          শেষ করুন
        </Button>
      </div>

      {q && (
        <motion.div
          key={q.id}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="glass flex flex-1 flex-col rounded-2xl p-5 sm:p-6"
        >
          {q.nodePath && (
            <span className="mb-2 max-w-full truncate text-[11px] text-muted-foreground font-bengali">
              {q.nodePath}
            </span>
          )}
          <p className="text-[15px] font-semibold leading-relaxed font-bengali sm:text-base">
            {q.question}
          </p>

          {qFirst && !revealedQ.has(qi) ? (
            <button
              onClick={() => setRevealedQ((s) => new Set(s).add(qi))}
              className="mt-4 flex flex-col items-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/5 px-6 py-7 transition-all duration-200 hover:border-primary/60 hover:bg-primary/10"
              aria-label="অপশন দেখুন"
            >
              <Eye className="h-5 w-5 text-primary" />
              <span className="text-sm font-semibold font-bengali">অপশন দেখুন</span>
              <span className="text-[11px] text-muted-foreground font-bengali">
                আগে মনে মনে উত্তরটা ঠিক করে নিন — তারপর অপশন মিলিয়ে দেখুন
              </span>
            </button>
          ) : (
          <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label="উত্তর বাছাই">
            {q.options.map((opt, i) => {
              const isCorrect = i === q.correctIndex;
              const isPicked = pickedForQ === i;
              return (
                <button
                  key={i}
                  onClick={() => choose(i)}
                  disabled={revealedForQ}
                  aria-pressed={isPicked}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-4 py-3 text-start text-sm font-bengali transition-all duration-200",
                    !revealedForQ &&
                      "hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99]",
                    revealedForQ && isCorrect &&
                      "border-emerald-500/60 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                    revealedForQ && isPicked && !isCorrect &&
                      "border-red-500/60 bg-red-500/10 text-red-600 dark:text-red-400",
                    revealedForQ && !isCorrect && !isPicked && "opacity-55"
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold",
                      revealedForQ && isCorrect && "border-emerald-500/60 bg-emerald-500/20",
                      revealedForQ && isPicked && !isCorrect && "border-red-500/60 bg-red-500/20"
                    )}
                  >
                    {["ক", "খ", "গ", "ঘ", "ঙ", "চ"][i] ?? toBn(i + 1)}
                  </span>
                  <span className="min-w-0 flex-1">{opt}</span>
                  {revealedForQ && isCorrect && <CheckCircle2 className="h-5 w-5 shrink-0" />}
                  {revealedForQ && isPicked && !isCorrect && <XCircle className="h-5 w-5 shrink-0" />}
                </button>
              );
            })}
          </div>
          )}

          {revealedForQ && !isRichEmpty(resolveExplanationHtml(q)) && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4"
            >
              <ExplanationRichView html={resolveExplanationHtml(q)} tone="teal" label="ব্যাখ্যা" />
            </motion.div>
          )}

          <div className="mt-5 flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={qi === 0}
              onClick={() => setQi((i) => Math.max(0, i - 1))}
              className="gap-1 font-bengali"
            >
              <ChevronLeft className="h-4 w-4" /> আগের
            </Button>
            <Button
              size="sm"
              disabled={!revealedForQ || submit.isPending}
              onClick={next}
              className="gap-1 font-bengali"
            >
              {isLast ? "শেষ করুন" : "পরের প্রশ্ন"} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </motion.div>
      )}
    </div>
  );
}
