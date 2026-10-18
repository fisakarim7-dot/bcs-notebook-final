"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { logSession } from "@/lib/bcs-api";
import { toBn } from "@/lib/bcs-types";
import { useBcsStore } from "@/lib/bcs-store";
import { CountdownRing } from "./progress-ring";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Brain, Coffee, Flag, Pause, Play, RotateCcw, Timer, Watch } from "lucide-react";

const MODES = {
  focus: { label: "Focus", minutes: 25, icon: Brain },
  short: { label: "Short Break", minutes: 5, icon: Coffee },
  long: { label: "Long Break", minutes: 15, icon: Coffee },
} as const;

type Mode = keyof typeof MODES;

// ---------- Stopwatch ----------

type TopTab = "pomodoro" | "stopwatch";

const TOP_TABS: { id: TopTab; label: string; icon: typeof Timer }[] = [
  { id: "pomodoro", label: "পোমোডোরো", icon: Timer },
  { id: "stopwatch", label: "স্টপওয়াচ", icon: Watch },
];

const MAX_LAPS = 20;
const MIN_LOG_SECONDS = 30;

type Lap = { n: number; total: number; split: number };

/** mm:ss, becomes hh:mm:ss at/over one hour — western digits, matches the pomodoro countdown */
function fmtStopwatch(total: number): string {
  const t = Math.max(0, Math.floor(total));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${String(h).padStart(2, "0")}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Calm low-fi chime — soft sine arpeggio, no harsh alarms */
function playChime() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const notes = [523.25, 659.25, 783.99]; // C5 · E5 · G5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t0 = ctx.currentTime + i * 0.28;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.14, t0 + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + 1.5);
    });
    setTimeout(() => ctx.close().catch(() => undefined), 3000);
  } catch {
    /* audio unavailable — silent fallback */
  }
}

function fmt(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function PomodoroTimer() {
  const [mode, setMode] = useState<Mode>("focus");
  const [secondsLeft, setSecondsLeft] = useState(MODES.focus.minutes * 60);
  const [running, setRunning] = useState(false);
  const [cycles, setCycles] = useState(0);
  const qc = useQueryClient();

  // ----- stopwatch state (independent of the pomodoro) -----
  const [topTab, setTopTab] = useState<TopTab>("pomodoro");
  const [swElapsed, setSwElapsed] = useState(0); // float seconds
  const [swRunning, setSwRunning] = useState(false);
  const [laps, setLaps] = useState<Lap[]>([]);
  const swStartRef = useRef(0); // Date.now() anchor of the current run (0 = paused)
  const swAccumRef = useRef(0); // seconds frozen from previous runs

  const { selectedId } = useBcsStore();

  const sessionMutation = useMutation({
    mutationFn: logSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  const stopwatchMutation = useMutation({
    mutationFn: logSession,
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["stats"] });
      toast.success(`স্টাডি টাইম সেভ হলো: ${toBn(Math.round(vars.duration / 60))} মিনিট`);
    },
    onError: () => {
      toast.error("সময় সেভ করা যায়নি — পরে আবার চেষ্টা করুন");
    },
  });

  const notifyDone = useCallback(
    (finished: Mode) => {
      playChime();
      if (finished === "focus") {
        toast.success("Focus session complete — take a mindful break 🌿", {
          description: "25 minutes logged to your study stats.",
        });
        setCycles((c) => c + 1);
      } else {
        toast("Break finished — ready for another deep dive?", {
          description: "Your notebook is waiting.",
        });
      }
    },
    []
  );

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(id);
          setRunning(false);
          notifyDone(mode);
          if (mode === "focus") {
            sessionMutation.mutate({
              mode: "focus",
              duration: MODES.focus.minutes * 60,
              nodeId: useBcsStore.getState().selectedId,
            });
            setMode("short");
            setSecondsLeft(MODES.short.minutes * 60);
          } else {
            setMode("focus");
            setSecondsLeft(MODES.focus.minutes * 60);
          }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, mode, notifyDone]);

  // ----- stopwatch interval: single effect + cleanup, anchor-based (StrictMode-safe, no drift) -----
  useEffect(() => {
    if (!swRunning) return;
    swStartRef.current = Date.now();
    const id = window.setInterval(() => {
      if (!swStartRef.current) return; // guard: never tick against a cleared anchor (reset race)
      setSwElapsed(swAccumRef.current + (Date.now() - swStartRef.current) / 1000);
    }, 200);
    return () => window.clearInterval(id);
  }, [swRunning]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setSecondsLeft(MODES[m].minutes * 60);
    setRunning(false);
  };

  // ----- stopwatch actions -----

  const toggleStopwatch = () => {
    if (swRunning) {
      // freeze exactly at pause time, so resume never jumps
      const total = swAccumRef.current + (Date.now() - swStartRef.current) / 1000;
      swAccumRef.current = total;
      swStartRef.current = 0;
      setSwElapsed(total);
    }
    setSwRunning((r) => !r);
  };

  const addLap = () => {
    if (!swRunning || laps.length >= MAX_LAPS) return;
    setLaps((ls) => {
      const total = Math.floor(swElapsed);
      const prevTotal = ls.length > 0 ? ls[ls.length - 1].total : 0;
      return [...ls, { n: ls.length + 1, total, split: Math.max(0, total - prevTotal) }];
    });
  };

  const resetStopwatch = () => {
    const elapsed = swAccumRef.current + (swRunning ? (Date.now() - swStartRef.current) / 1000 : 0);
    const duration = Math.floor(elapsed);
    if (duration >= MIN_LOG_SECONDS) {
      stopwatchMutation.mutate({ mode: "stopwatch", duration });
    }
    setSwRunning(false);
    setSwElapsed(0);
    setLaps([]);
    swAccumRef.current = 0;
    swStartRef.current = 0;
  };

  const total = MODES[mode].minutes * 60;
  const Icon = MODES[mode].icon;

  const hourLapPct = ((swElapsed % 3600) / 3600) * 100; // one hour per lap of the line
  const lapsNewestFirst = [...laps].reverse();

  return (
    <div className="flex h-full flex-col items-center gap-4">
      <div className="flex w-full items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
          <Timer className="h-4 w-4 text-primary" /> Study Timer
        </h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {cycles} session{cycles === 1 ? "" : "s"} today
        </span>
      </div>

      {/* segmented mini-tabs: pomodoro | stopwatch */}
      <div
        role="tablist"
        aria-label="টাইমার মোড নির্বাচন"
        className="flex w-full gap-1 rounded-full bg-muted/70 p-1"
      >
        {TOP_TABS.map((t) => {
          const TabIcon = t.icon;
          const active = topTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTopTab(t.id)}
              className={cn(
                "flex h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <TabIcon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {topTab === "pomodoro" && (
        <>
          <div className="flex gap-1 rounded-xl bg-muted/70 p-1">
            {(Object.keys(MODES) as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all duration-200",
                  mode === m
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {MODES[m].label}
              </button>
            ))}
          </div>

          <CountdownRing secondsLeft={secondsLeft} totalSeconds={total} running={running} size={186}>
            <Icon className={cn("mb-1 h-4 w-4", running ? "text-primary" : "text-muted-foreground")} />
            <span
              className={cn(
                "font-mono text-4xl font-bold tabular-nums tracking-tight transition-colors",
                running && "text-primary"
              )}
            >
              {fmt(secondsLeft)}
            </span>
            <span className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {MODES[mode].label}
            </span>
          </CountdownRing>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setRunning((r) => !r)}
              className={cn(
                "w-28 gap-1.5 rounded-xl transition-all",
                running && "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {running ? "Pause" : "Start"}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="rounded-xl"
              aria-label="Reset timer"
              onClick={() => {
                setRunning(false);
                setSecondsLeft(total);
              }}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            Calm chime on completion · focus time feeds your dashboard stats
          </p>
        </>
      )}

      {topTab === "stopwatch" && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="flex w-full flex-1 flex-col items-center gap-4"
        >
          {/* big elapsed display */}
          <div className="flex flex-col items-center gap-1.5 pt-1">
            <span
              className={cn(
                "font-mono text-5xl font-bold tabular-nums tracking-tight transition-colors",
                swRunning && "text-primary"
              )}
            >
              {fmtStopwatch(swElapsed)}
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {swRunning ? "চলছে…" : swElapsed > 0 ? "বিরতিতে" : "প্রস্তুত"}
            </span>
          </div>

          {/* thin hour-lap progress line */}
          <div
            role="progressbar"
            aria-label="ঘণ্টা চক্র প্রগ্রেস"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(hourLapPct)}
            className="h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-muted"
          >
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary/60 via-primary to-primary shadow-[0_0_8px_var(--glow)] transition-[width] duration-200 ease-linear"
              style={{ width: `${hourLapPct}%` }}
            />
          </div>

          {/* controls */}
          <div className="flex items-center gap-2">
            <Button
              onClick={toggleStopwatch}
              className={cn(
                "h-11 w-28 gap-1.5 rounded-xl transition-all",
                swRunning && "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              )}
            >
              {swRunning ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {swRunning ? "বিরতি" : "শুরু"}
            </Button>
            <Button
              variant="outline"
              onClick={addLap}
              disabled={!swRunning || laps.length >= MAX_LAPS}
              title={laps.length >= MAX_LAPS ? `সর্বোচ্চ ${toBn(MAX_LAPS)}টি ল্যাপ` : undefined}
              className="h-11 gap-1.5 rounded-xl px-4"
            >
              <Flag className="h-4 w-4" />
              ল্যাপ
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="স্টপওয়াচ রিসেট"
              title="রিসেট"
              onClick={resetStopwatch}
              className="h-11 w-11 rounded-xl text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          {/* lap list — newest first */}
          <div className="w-full min-h-0 flex-1">
            <p className="mb-1.5 px-1 text-[11px] font-semibold text-muted-foreground">
              ল্যাপ {toBn(laps.length)}/{toBn(MAX_LAPS)}
            </p>
            <div className="scroll-slim max-h-40 overflow-y-auto pr-1">
              {laps.length === 0 ? (
                <p className="rounded-xl bg-muted/40 px-3 py-4 text-center text-[11px] leading-relaxed text-muted-foreground">
                  চলমান অবস্থায় &quot;ল্যাপ&quot; চাপলে স্প্লিট সময় এখানে জমা হবে
                </p>
              ) : (
                <ul className="flex flex-col gap-1" aria-label="ল্যাপ তালিকা">
                  {lapsNewestFirst.map((lap) => (
                    <motion.li
                      key={lap.n}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2"
                    >
                      <span className="font-bengali text-xs font-semibold">ল্যাপ {toBn(lap.n)}</span>
                      <span className="flex items-center gap-3 font-mono text-xs tabular-nums">
                        <span className="font-semibold text-primary">+{fmtStopwatch(lap.split)}</span>
                        <span className="text-muted-foreground">{fmtStopwatch(lap.total)}</span>
                      </span>
                    </motion.li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
            ৩০ সেকেন্ডের বেশি সময় রিসেট করলে ড্যাশবোর্ড স্ট্যাটাসে সেভ হবে
          </p>
        </motion.div>
      )}
    </div>
  );
}
