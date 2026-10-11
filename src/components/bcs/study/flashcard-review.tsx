"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  CheckCircle2,
  Eye,
  Layers,
  Loader2,
  PartyPopper,
  Play,
  RotateCcw,
  Sparkles,
  XCircle,
} from "lucide-react";
import { fetchAiSettings, fetchFlashcards, reviewFlashcard, reviewFsrs } from "@/lib/bcs-api";
import { toBn, type FlashcardDTO } from "@/lib/bcs-types";
import { cn } from "@/lib/utils";
import { boxBadgeClass } from "./shared";
import { interleaveByPath, speakBn, stopSpeak } from "@/lib/bcs-prefs";
import { clozePrompt, clozeReveal, hasCloze } from "@/lib/bcs-cloze";
import { Volume2 } from "lucide-react";

type Phase = "loading" | "ready" | "active" | "done";

/**
 * "আজকের রিভিশন" — Leitner review session for all cards due today.
 * Wrong cards are re-queued at the end of the same session.
 * Fully event-driven: no setState inside effects (React hooks rules).
 */
export function FlashcardReview() {
  const qc = useQueryClient();
  const [queue, setQueue] = useState<FlashcardDTO[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [tally, setTally] = useState({ correct: 0, wrong: 0 });
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [hasSession, setHasSession] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["flashcards", "due"],
    queryFn: () => fetchFlashcards("due"),
  });
  const { data: settings } = useQuery({ queryKey: ["ai-settings"], queryFn: fetchAiSettings });
  const useFsrs = settings?.studyPrefs?.srs === "fsrs";
  const doInterleave = settings?.studyPrefs?.interleave === true;
  const doTts = settings?.studyPrefs?.tts === true;

  const dueCards = useMemo(() => data?.cards ?? [], [data]);
  const totalDue = dueCards.length;

  const phase: Phase = isLoading
    ? "loading"
    : queue === null
      ? totalDue === 0
        ? "done"
        : "ready"
      : idx >= queue.length
        ? "done"
        : "active";

  const current = queue !== null ? (queue[idx] ?? null) : null;
  const uniqueDone = answeredIds.size;
  const progressPct =
    totalDue === 0 || queue === null ? 0 : Math.round((uniqueDone / totalDue) * 100);

  const startSession = useCallback(() => {
    setQueue(doInterleave ? interleaveByPath(dueCards) : dueCards);
    setIdx(0);
    setRevealed(false);
    setTally({ correct: 0, wrong: 0 });
    setAnsweredIds(new Set());
    setHasSession(true);
  }, [dueCards, doInterleave]);

  const review = useMutation({
    mutationFn: ({ id, result }: { id: string; result: "correct" | "wrong" }) =>
      useFsrs
        ? reviewFsrs(id, result === "wrong" ? "again" : "good").then(() => ({
            card: current!,
            nextDays: 1,
          }))
        : reviewFlashcard(id, result),
    onError: (e: Error) => toast.error(e.message),
  });
  const fsrsRate = useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: "again" | "hard" | "good" | "easy" }) =>
      reviewFsrs(id, rating),
    onError: (e: Error) => toast.error(e.message),
  });

  const answer = useCallback(
    (result: "correct" | "wrong") => {
      if (!current || queue === null || review.isPending) return;
      const card = current;
      const answeredQueueLen = queue.length;
      review.mutate(
        { id: card.id, result },
        {
          onSuccess: (d) => {
            const nextQueue =
              result === "wrong" ? [...queue, d.card] : queue;
            const nextIdx = idx + 1;
            setTally((t) => ({
              correct: t.correct + (result === "correct" ? 1 : 0),
              wrong: t.wrong + (result === "wrong" ? 1 : 0),
            }));
            setAnsweredIds((s) => new Set(s).add(card.id));
            setRevealed(false);
            setQueue(nextQueue);
            setIdx(nextIdx);
            // session finished with this answer?
            if (nextIdx >= answeredQueueLen) {
              qc.invalidateQueries({ queryKey: ["flashcards"] });
            }
          },
        }
      );
    },
    [current, queue, idx, review, qc]
  );

  const restart = useCallback(async () => {
    setQueue(null);
    const d = await refetch();
    if (d.data && d.data.count === 0) {
      // nothing due anymore — done screen will show (queue stays null)
      return;
    }
    setQueue(d.data?.cards ?? []);
    setIdx(0);
    setRevealed(false);
    setTally({ correct: 0, wrong: 0 });
    setAnsweredIds(new Set());
    setHasSession(true);
  }, [refetch]);

  // keyboard: Space reveal, 1 wrong, 2 correct
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      if (e.code === "Space" || e.key === " ") {
        e.preventDefault();
        setRevealed(true);
      } else if (e.key === "1") {
        answer("wrong");
      } else if (e.key === "2") {
        answer("correct");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [answer]);

  // ---------- render ----------

  if (phase === "loading") {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="font-bengali">রিভিশন লোড হচ্ছে…</span>
      </div>
    );
  }

  if (phase === "ready") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass flex flex-col items-center gap-4 rounded-2xl p-10 text-center"
      >
        <Layers className="h-12 w-12 text-primary" />
        <p className="text-xl font-bold font-bengali">
          আজকের রিভিশন: {toBn(totalDue)}টি কার্ড
        </p>
        <p className="max-w-md text-xs leading-6 text-muted-foreground font-bengali">
          Leitner পদ্ধতিতে প্রতিদিন যেগুলো মনে রাখা দরকার সেগুলোই সামনে আসবে।
          সঠিক উত্তর দিলে কার্ড পরের বেশি দিন পরে ফিরবে (১ → ২ → ৪ → ৮ → ১৬ দিন),
          ভুল হলে কাল আবার আসবে।
        </p>
        <Button size="lg" className="h-12 gap-2 font-bengali" onClick={startSession}>
          <Play className="h-5 w-5" /> রিভিশন শুরু করুন
        </Button>
      </motion.div>
    );
  }

  if (phase === "done") {
    const hadSession = queue !== null && hasSession && tally.correct + tally.wrong > 0;
    const hadWork = queue !== null && totalDue + tally.correct + tally.wrong > 0;
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass flex flex-col items-center gap-4 rounded-2xl p-10 text-center"
      >
        {hadWork && hadSession ? (
          <>
            <PartyPopper className="h-12 w-12 text-primary" />
            <p className="text-xl font-bold font-bengali">আজকের রিভিশন শেষ! 🎉</p>
            <div className="flex items-center gap-3 text-sm font-bengali">
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> সঠিক: {toBn(tally.correct)}
              </span>
              <span className="flex items-center gap-1.5 text-red-500">
                <XCircle className="h-4 w-4" /> ভুল: {toBn(tally.wrong)}
              </span>
            </div>
            <p className="max-w-md text-xs leading-6 text-muted-foreground font-bengali">
              ভুল হওয়া কার্ডগুলো কাল আবার আসবে, আর সঠিকগুলো পরের বেশি দিন পরে
              ফিরবে (Leitner পদ্ধতি: ১ → ২ → ৪ → ৮ → ১৬ দিন)।
            </p>
          </>
        ) : (
          <>
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="text-xl font-bold font-bengali">আজকের কোনো রিভিশন বাকি নেই!</p>
            <p className="max-w-md text-xs leading-6 text-muted-foreground font-bengali">
              নতুন কার্ড বানান বা AI দিয়ে জেনারেট করে আপনার স্মরণশক্তির ভাণ্ডার
              বাড়ান।
            </p>
          </>
        )}
        <Button onClick={restart} variant="outline" disabled={isFetching} className="gap-1.5 font-bengali">
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          রিফ্রেশ করুন
        </Button>
      </motion.div>
    );
  }

  // ---- active ----
  return (
    <div className="flex flex-col gap-4">
      {/* progress header */}
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="h-6 gap-1 px-2 font-bengali text-xs">
          <Layers className="h-3 w-3" />
          {toBn(Math.min(idx + 1, queue?.length ?? 0))} / {toBn(queue?.length ?? 0)}
        </Badge>
        <Badge variant="outline" className="h-6 px-2 font-bengali text-xs">
          ইউনিক: {toBn(uniqueDone)}/{toBn(totalDue)}
        </Badge>
        <div className="flex-1">
          <Progress value={progressPct} className="h-2" />
        </div>
        <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
          <kbd className="rounded border px-1">Space</kbd>
          <span className="font-bengali">উল্টান</span>
          <kbd className="ml-1 rounded border px-1">1</kbd>
          <span className="font-bengali">ভুল</span>
          <kbd className="ml-1 rounded border px-1">2</kbd>
          <span className="font-bengali">সঠিক</span>
        </span>
      </div>

      {/* card */}
      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={`${current.id}-${idx}`}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="flex flex-col"
          >
            <button
              onClick={() => !revealed && setRevealed(true)}
              aria-label={revealed ? "উত্তর কার্ড" : "উত্তর দেখতে ক্লিক করুন"}
              className={cn(
                "relative flex min-h-[240px] w-full flex-col items-center justify-center gap-4 overflow-hidden rounded-2xl p-6 text-center transition-all duration-300 sm:min-h-[300px] sm:p-10",
                !revealed
                  ? "cursor-pointer bg-gradient-to-br from-violet-500/15 via-transparent to-fuchsia-500/15 ring-1 ring-violet-500/40 hover:shadow-[0_0_24px_var(--glow)]"
                  : "bg-gradient-to-br from-emerald-500/15 via-transparent to-teal-500/15 ring-1 ring-emerald-500/40"
              )}
            >
              {revealed ? (
                <Sparkles className="pointer-events-none absolute -bottom-8 -right-6 h-32 w-32 -rotate-12 text-emerald-500/10" />
              ) : (
                <Layers className="pointer-events-none absolute -bottom-8 -right-6 h-32 w-32 rotate-12 text-violet-500/10" />
              )}
              <span
                className={cn(
                  "absolute left-4 top-4 flex w-fit items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold font-bengali",
                  revealed
                    ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                    : "bg-violet-500/20 text-violet-700 dark:text-violet-300"
                )}
              >
                {revealed ? "উত্তর" : "প্রশ্ন"}
              </span>
              {current.nodePath && (
                <span className="max-w-full truncate text-[11px] text-muted-foreground font-bengali">
                  {current.nodePath}
                </span>
              )}
              <p className="max-w-2xl whitespace-pre-wrap text-lg font-semibold leading-relaxed font-bengali sm:text-xl">
                {current.front}
              </p>

              <AnimatePresence mode="wait">
                {revealed ? (
                  <motion.div
                    key="back"
                    initial={{ opacity: 0, rotateY: 90 }}
                    animate={{ opacity: 1, rotateY: 0 }}
                    transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
                    className="flex w-full flex-col items-center gap-3"
                  >
                    <div className="h-px w-24 bg-border" />
                    <p className="max-w-2xl whitespace-pre-wrap text-base leading-relaxed text-primary font-bengali sm:text-lg">
                      {hasCloze(current.clozeText || current.front)
                        ? clozeReveal(current.clozeText || current.front)
                        : current.back}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      <Badge variant="outline" className={cn("gap-1 border font-bengali text-[10px]", boxBadgeClass(current.box))}>
                        বাক্স {toBn(current.box)}
                      </Badge>
                      {current.source === "ai" && (
                        <Badge variant="outline" className="gap-1 border font-bengali text-[10px]">
                          <Sparkles className="h-3 w-3" /> AI
                        </Badge>
                      )}
                      <Badge variant="outline" className="border font-bengali text-[10px]">
                        রিভিউ: {toBn(current.reviewCount)} বার
                      </Badge>
                    </div>
                  </motion.div>
                ) : (
                  <motion.span
                    key="hint"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground font-bengali"
                  >
                    <Eye className="h-3.5 w-3.5" /> উত্তর দেখতে ক্লিক করুন বা Space চাপুন
                  </motion.span>
                )}
              </AnimatePresence>
            </button>

            {revealed && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 flex items-center justify-center gap-3"
              >
                <Button
                  variant="outline"
                  size="lg"
                  disabled={review.isPending}
                  onClick={() => answer("wrong")}
                  className="h-12 min-w-36 gap-2 border-red-500/40 font-bengali text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
                >
                  <XCircle className="h-5 w-5" />
                  ভুল হয়েছে (1)
                </Button>
                <Button
                  size="lg"
                  disabled={review.isPending}
                  onClick={() => answer("correct")}
                  className="h-12 min-w-36 gap-2 font-bengali"
                >
                  <CheckCircle2 className="h-5 w-5" />
                  সঠিক হয়েছে (2)
                </Button>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
