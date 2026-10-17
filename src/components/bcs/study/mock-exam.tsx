"use client";

// ---------- Mock Test Engine (#18) ----------
// Setup: Subject → Topic (study-tree chain) · প্রশ্ন সংখ্যা · Difficulty
//        · সময় · পূর্বে-দেখা-প্রশ্ন only · Random order
// Run:   আদর্শ exam interface — timer, negative marking, navigator, mark-later
// Result: Score · Time used · Attempted/Skipped · Topic performance bars

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlarmClock,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileWarning,
  GraduationCap,
  History,
  Loader2,
  Shuffle,
  SkipForward,
  Timer,
  Trophy,
  XCircle,
} from "lucide-react";
import {
  fetchAttempts,
  fetchMcqs,
  fetchStudyTree,
  submitMcqAttempt,
  type McqAttemptResultItem,
} from "@/lib/bcs-api";
import {
  toBn,
  type McqDTO,
  type MockTestConfig,
  type QuizAttemptDTO,
  type StudyNodeDTO,
} from "@/lib/bcs-types";
import { studyNodePathOf } from "@/lib/bcs-tree-utils";
import { PRELIM_MINUTES, PRELIM_TOTAL, pickPrelimDistribution } from "@/lib/bcs-prelim";
import { cn } from "@/lib/utils";
import { ExplanationRichView, isRichEmpty, resolveExplanationHtml } from "./explanation-editor";

type Phase = "setup" | "run" | "result";
type Difficulty = "all" | "new" | "easy" | "medium" | "hard";

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  all: "সব কাঠামো",
  new: "নতুন (চেষ্টা হয়নি)",
  easy: "সহজ — সঠিকতা ≥ ৮০%",
  medium: "মাঝারি — ৪০–৭৯%",
  hard: "কঠিন — সঠিকতা < ৪০%",
};

/** data-driven difficulty from the question's own attempt history */
function difficultyOf(m: McqDTO): Exclude<Difficulty, "all"> {
  if (m.attempts === 0) return "new";
  const acc = m.correctCount / m.attempts;
  if (acc >= 0.8) return "easy";
  if (acc >= 0.4) return "medium";
  return "hard";
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fmtClock(sec: number): string {
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export function MockExam() {
  const qc = useQueryClient();
  const [phase, setPhase] = useState<Phase>("setup");
  const [countInput, setCountInput] = useState<string>("50");
  const [minutesInput, setMinutesInput] = useState<string>("30");
  // #18 options
  const [subjectId, setSubjectId] = useState<string>("all");
  const [topicId, setTopicId] = useState<string>("all");
  const [difficulty, setDifficulty] = useState<Difficulty>("all");
  const [previousOnly, setPreviousOnly] = useState(false);
  const [randomOrder, setRandomOrder] = useState(true);

  const [run, setRun] = useState<McqDTO[]>([]);
  const [runConfig, setRunConfig] = useState<MockTestConfig>({});
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [marked, setMarked] = useState<Set<string>>(new Set());
  const [qi, setQi] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ attempt: QuizAttemptDTO; run: McqDTO[] } | null>(null);
  const startRef = useRef(0);
  const submitLock = useRef(false);

  const { data: bankData, isLoading: bankLoading } = useQuery({
    queryKey: ["mcqs", "all"],
    queryFn: () => fetchMcqs(),
  });
  const { data: attempts = [] } = useQuery({
    queryKey: ["attempts"],
    queryFn: fetchAttempts,
  });
  const { data: studyNodes = [] } = useQuery({
    queryKey: ["study-tree"],
    queryFn: fetchStudyTree,
  });
  const bank = bankData?.mcqs ?? [];
  const nodes = studyNodes as StudyNodeDTO[];

  // subject = root-level study nodes; topic = any descendant of the subject
  const subjects = useMemo(() => nodes.filter((n) => !n.parentId), [nodes]);
  const topicsOfSubject = useMemo(() => {
    if (subjectId === "all") return [];
    const byParent = new Map<string, StudyNodeDTO[]>();
    for (const n of nodes) {
      const p = n.parentId ?? "__root__";
      const arr = byParent.get(p) ?? [];
      arr.push(n);
      byParent.set(p, arr);
    }
    // BFS descendants of subjectId (excluding the subject itself)
    const out: { node: StudyNodeDTO; depth: number }[] = [];
    const queue: { id: string; depth: number }[] =
      byParent.get(subjectId)?.map((n) => ({ id: n.id, depth: 1 })) ?? [];
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      const node = nodes.find((n) => n.id === id);
      if (!node) continue;
      out.push({ node, depth });
      for (const c of byParent.get(id) ?? []) queue.push({ id: c.id, depth: depth + 1 });
    }
    return out;
  }, [nodes, subjectId]);

  // all ids inside the chosen scope (subject or topic subtree)
  const scopeIds = useMemo(() => {
    const root = topicId !== "all" ? topicId : subjectId !== "all" ? subjectId : null;
    if (!root) return null;
    const byParent = new Map<string, string[]>();
    for (const n of nodes) {
      if (!n.parentId) continue;
      const arr = byParent.get(n.parentId) ?? [];
      arr.push(n.id);
      byParent.set(n.parentId, arr);
    }
    const ids = new Set<string>([root]);
    const queue = [root];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      for (const c of byParent.get(cur) ?? []) {
        if (!ids.has(c)) {
          ids.add(c);
          queue.push(c);
        }
      }
    }
    return ids;
  }, [nodes, subjectId, topicId]);

  const doSubmit = useMutation({
    mutationFn: submitMcqAttempt,
    onSuccess: (attempt) => {
      setResult({ attempt, run });
      setPhase("result");
      qc.invalidateQueries({ queryKey: ["mcqs"] });
      qc.invalidateQueries({ queryKey: ["attempts"] });
    },
    onError: (e: Error) => {
      toast.error(e.message);
      submitLock.current = false;
    },
  });

  const count = Math.max(1, Math.min(bank.length || 1, parseInt(countInput, 10) || 50));
  const minutes = Math.max(1, parseInt(minutesInput, 10) || Math.ceil((count * 36) / 60));

  // live pool after all #18 filters — shown on the setup screen
  const pool = useMemo(() => {
    let list = bank.filter((m) => !m.suspended);
    if (scopeIds) list = list.filter((m) => m.studyNodeId && scopeIds.has(m.studyNodeId));
    if (difficulty !== "all") list = list.filter((m) => difficultyOf(m) === difficulty);
    if (previousOnly) list = list.filter((m) => m.lastAttemptAt != null);
    return list;
  }, [bank, scopeIds, difficulty, previousOnly]);

  const startExam = (preset?: "full" | "mini") => {
    if (pool.length === 0) return;
    const targetCount = preset === "full" ? PRELIM_TOTAL : preset === "mini" ? 50 : count;
    const targetMinutes = preset === "full" ? PRELIM_MINUTES : preset === "mini" ? 30 : minutes;
    const cfg: MockTestConfig = {
      subject: subjectId !== "all" ? (subjects.find((s) => s.id === subjectId)?.name ?? undefined) : undefined,
      topic: topicId !== "all" ? (topicsOfSubject.find((t) => t.node.id === topicId)?.node.name ?? undefined) : undefined,
      difficulty,
      previousOnly,
      random: randomOrder,
    };
    let picked: McqDTO[];
    if (preset === "full" || preset === "mini") {
      const dist = pickPrelimDistribution(pool, targetCount);
      picked = randomOrder ? shuffle(dist) : dist;
    } else {
      const base = randomOrder ? shuffle(pool) : pool;
      picked = base.slice(0, Math.min(targetCount, pool.length));
    }
    if (picked.length === 0) return;
    setRun(picked);
    setRunConfig(cfg);
    setAnswers({});
    setMarked(new Set());
    setQi(0);
    setRemaining(targetMinutes * 60);
    startRef.current = Date.now();
    submitLock.current = false;
    setPhase("run");
  };

  const buildResults = (ans: Record<string, number>, qs: McqDTO[]): McqAttemptResultItem[] =>
    qs.map((q) => {
      const chosen = ans[q.id];
      if (chosen === undefined) return { id: q.id, chosen: null, correct: false, skipped: true };
      return { id: q.id, chosen, correct: chosen === q.correctIndex };
    });

  const submitExam = (ans: Record<string, number>, qs: McqDTO[]) => {
    if (submitLock.current) return;
    submitLock.current = true;
    doSubmit.mutate({
      mode: "mock",
      seconds: Math.round((Date.now() - startRef.current) / 1000),
      results: buildResults(ans, qs),
      config: runConfig,
    });
  };

  // countdown
  useEffect(() => {
    if (phase !== "run") return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          submitExam(answers, run);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [phase, run, answers]);

  const q = run[qi] ?? null;
  const answeredCount = Object.keys(answers).length;
  const unanswered = run.length - answeredCount;

  // ---------- setup ----------
  if (phase === "setup") {
    const mockHistory = attempts.filter((a) => a.mode === "mock").slice(0, 6);
    const hardCount = pool.filter((m) => difficultyOf(m) === "hard").length;
    return (
      <div className="flex flex-col gap-4">
        <div className="glass flex flex-col items-center gap-4 rounded-2xl p-6 text-center sm:p-8">
          <GraduationCap className="h-10 w-10 text-primary" />
          <div>
            <p className="text-lg font-bold font-bengali">মক পরীক্ষা ইঞ্জিন</p>
            <p className="mt-1 text-xs leading-6 text-muted-foreground font-bengali">
              বিষয় · টপিক · কাঠামো · সময় — নিজের মতো সাজানো আসল প্রিলি: টাইমার, নেগেটিভ
              মার্কিং (ভুলে −০.২৫), শেষে বিস্তারিত রিভিউ ও টপিক-ভিত্তিক পারফরম্যান্স।
            </p>
          </div>

          {bankLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : bank.length === 0 ? (
            <p className="max-w-sm rounded-xl bg-amber-500/10 p-3 text-xs leading-6 text-amber-700 dark:text-amber-400 font-bengali">
              প্রশ্নব্যাংক খালি — আগে MCQ যোগ করুন বা AI দিয়ে বানান।
            </p>
          ) : (
            <div className="flex w-full max-w-2xl flex-col gap-4 text-start">
              {/* ---- #18 option grid ---- */}
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-border/60 bg-muted/20 p-3.5 sm:grid-cols-2">
                {/* Subject */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-bengali">বিষয় (Subject)</Label>
                  <Select
                    value={subjectId}
                    onValueChange={(v) => {
                      setSubjectId(v);
                      setTopicId("all");
                    }}
                  >
                    <SelectTrigger className="h-9 font-bengali" aria-label="বিষয় নির্বাচন">
                      <SelectValue placeholder="সব বিষয়" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="font-bengali">সব বিষয়</SelectItem>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={s.id} className="font-bengali">
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Topic (chained) */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-bengali">টপিক (Topic)</Label>
                  <Select
                    value={topicId}
                    onValueChange={setTopicId}
                    disabled={subjectId === "all" || topicsOfSubject.length === 0}
                  >
                    <SelectTrigger className="h-9 font-bengali" aria-label="টপিক নির্বাচন">
                      <SelectValue
                        placeholder={
                          subjectId === "all" ? "আগে বিষয় বাছুন" : "সব টপিক"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="font-bengali">সব টপিক</SelectItem>
                      {topicsOfSubject.map(({ node, depth }) => (
                        <SelectItem key={node.id} value={node.id} className="font-bengali">
                          {" ".repeat(Math.min(depth - 1, 4))}{depth > 1 ? "↳ " : ""}{node.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Difficulty */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-bengali">কাঠামো (Difficulty)</Label>
                  <Select value={difficulty} onValueChange={(v) => setDifficulty(v as Difficulty)}>
                    <SelectTrigger className="h-9 font-bengali" aria-label="কাঠামো নির্বাচন">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(DIFFICULTY_LABEL) as Difficulty[]).map((d) => (
                        <SelectItem key={d} value={d} className="font-bengali">
                          {DIFFICULTY_LABEL[d]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Number of questions */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-bengali">
                    প্রশ্ন সংখ্যা <span className="text-muted-foreground">(মিলবে {toBn(pool.length)}টি)</span>
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={Math.max(1, pool.length)}
                    value={countInput}
                    onChange={(e) => setCountInput(e.target.value)}
                    className="h-9 font-bengali"
                    aria-label="প্রশ্ন সংখ্যা"
                  />
                </div>

                {/* Time */}
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs font-bengali">সময় (মিনিট)</Label>
                  <Input
                    type="number"
                    min={1}
                    value={minutesInput}
                    onChange={(e) => setMinutesInput(e.target.value)}
                    placeholder={`প্রিলি রেটে: ${Math.ceil((count * 36) / 60)}`}
                    className="h-9 font-bengali"
                    aria-label="সময় মিনিট"
                  />
                </div>

                {/* Toggles */}
                <div className="flex flex-col justify-center gap-2.5">
                  <label className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium font-bengali">
                      <History className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                      শুধু পূর্বে দেখা প্রশ্ন
                    </span>
                    <Switch checked={previousOnly} onCheckedChange={setPreviousOnly} aria-label="শুধু পূর্বে দেখা প্রশ্ন" />
                  </label>
                  <label className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-background/40 px-3 py-2">
                    <span className="flex items-center gap-1.5 text-xs font-medium font-bengali">
                      <Shuffle className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                      র‍্যান্ডম ক্রম
                    </span>
                    <Switch checked={randomOrder} onCheckedChange={setRandomOrder} aria-label="র‍্যান্ডম ক্রম" />
                  </label>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground font-bengali">
                টিপ: বাস্তব প্রিলি রেট = প্রতি প্রশ্নে ৩৬ সেকেন্ড (২০০ প্রশ্ন / ১২০ মিনিট)।
                {pool.length > 0 && difficulty === "all" && !previousOnly && hardCount > 0 && (
                  <> এই পুলে {toBn(hardCount)}টি কঠিন প্রশ্ন আছে।</>
                )}
              </p>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  className="h-11 gap-2 font-bengali"
                  onClick={() => startExam("full")}
                  disabled={pool.length === 0}
                >
                  প্রিলি ফুল · ২০০ / ১২০ মি
                </Button>
                <Button
                  variant="outline"
                  className="h-11 gap-2 font-bengali"
                  onClick={() => startExam("mini")}
                  disabled={pool.length === 0}
                >
                  মিনি-মক · ৫০ / ৩০ মি
                </Button>
              </div>
              <Button
                size="lg"
                className="mt-1 h-12 gap-2 font-bengali"
                onClick={() => startExam()}
                disabled={pool.length === 0}
              >
                <Timer className="h-5 w-5" /> পরীক্ষা শুরু করুন (কাস্টম)
                <span className="text-xs opacity-80 font-bengali">
                  ({toBn(Math.min(count, pool.length))}/{toBn(pool.length)} প্রশ্ন)
                </span>
              </Button>
            </div>
          )}
        </div>

        {mockHistory.length > 0 && (
          <div className="glass rounded-2xl p-5">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-bold font-bengali">
              <History className="h-4 w-4 text-primary" /> সাম্প্রতিক মক রেজাল্ট
            </p>
            <ul className="flex flex-col gap-2">
              {mockHistory.map((a) => {
                const cfg = (a.config ?? {}) as MockTestConfig;
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border/60 px-3 py-2 text-xs font-bengali"
                  >
                    <Badge variant="outline" className="border font-bengali text-[10px]">
                      {new Date(a.createdAt).toLocaleDateString("bn-BD", {
                        day: "numeric",
                        month: "short",
                      })}
                    </Badge>
                    {(cfg.subject || cfg.topic) && (
                      <span className="max-w-[24ch] truncate text-muted-foreground">
                        {cfg.subject ?? ""}{cfg.topic ? ` › ${cfg.topic}` : ""}
                      </span>
                    )}
                    {cfg.difficulty && cfg.difficulty !== "all" && (
                      <Badge variant="secondary" className="h-5 px-1.5 font-bengali text-[10px]">
                        {DIFFICULTY_LABEL[cfg.difficulty as Difficulty]?.split(" ")[0] ?? cfg.difficulty}
                      </Badge>
                    )}
                    {cfg.previousOnly && (
                      <Badge variant="secondary" className="h-5 px-1.5 font-bengali text-[10px]">
                        পূর্বে-দেখা
                      </Badge>
                    )}
                    {!cfg.random && (
                      <Badge variant="secondary" className="h-5 px-1.5 font-bengali text-[10px]">
                        ক্রম অনুযায়ী
                      </Badge>
                    )}
                    <span className="text-muted-foreground">
                      প্রশ্ন: {toBn(a.total)} · সময়: {toBn(Math.round(a.seconds / 60))} মি
                    </span>
                    <span className="ml-auto flex items-center gap-2.5">
                      <span className="text-emerald-600 dark:text-emerald-400">সঠিক {toBn(a.correct)}</span>
                      <span className="text-red-500">ভুল {toBn(a.wrong)}</span>
                      <span className="font-bold text-primary">স্কোর {toBn(a.score)}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    );
  }

  // ---------- result ----------
  if (phase === "result" && result) {
    const { attempt } = result;
    const pctScore =
      attempt.total > 0 ? Math.round((attempt.score / attempt.total) * 100) : 0;

    // Topic performance (#18) — group the run by its study-tree path
    const topics = new Map<
      string,
      { total: number; correct: number; attempted: number }
    >();
    for (const q of result.run) {
      const label =
        studyNodePathOf(nodes, q.studyNodeId) ?? q.studyNodePath ?? q.nodePath ?? "লেভেল ছাড়া";
      const chosen = answers[q.id];
      const t = topics.get(label) ?? { total: 0, correct: 0, attempted: 0 };
      t.total += 1;
      if (chosen !== undefined) {
        t.attempted += 1;
        if (chosen === q.correctIndex) t.correct += 1;
      }
      topics.set(label, t);
    }
    const topicRows = [...topics.entries()]
      .map(([label, s]) => ({
        label,
        ...s,
        acc: s.attempted > 0 ? Math.round((s.correct / s.attempted) * 100) : null,
      }))
      .sort((a, b) => (a.acc ?? -1) - (b.acc ?? -1));

    return (
      <div className="flex flex-col gap-4">
        <div className="glass flex flex-col items-center gap-3 rounded-2xl p-8 text-center">
          <Trophy className={cn("h-10 w-10", pctScore >= 50 ? "text-amber-500" : "text-muted-foreground")} />
          <p className="text-lg font-bold font-bengali">ফলাফল</p>
          <p className="text-4xl font-black tracking-tight text-primary">
            {toBn(attempt.score)}
            <span className="text-lg font-semibold text-muted-foreground"> / {toBn(attempt.total)}</span>
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 text-sm font-bengali">
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> সঠিক {toBn(attempt.correct)}
            </span>
            <span className="flex items-center gap-1.5 text-red-500">
              <XCircle className="h-4 w-4" /> ভুল {toBn(attempt.wrong)}
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <SkipForward className="h-4 w-4" /> বাদ {toBn(attempt.skipped)}
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <AlarmClock className="h-4 w-4" /> {toBn(fmtClock(attempt.seconds))}
            </span>
          </div>
          {/* attempted vs skipped summary (#18) */}
          <p className="text-xs text-muted-foreground font-bengali">
            উত্তর দেওয়া হয়েছে {toBn(attempt.correct + attempt.wrong)}টি · বাদ পড়েছে {toBn(attempt.skipped)}টি
          </p>
          <div className="flex gap-2">
            <Button className="gap-1.5 font-bengali" onClick={() => setPhase("setup")}>
              নতুন মক পরীক্ষা
            </Button>
          </div>
        </div>

        {/* topic performance (#18) */}
        {topicRows.length > 0 && (
          <div className="glass rounded-2xl p-5">
            <p className="mb-3 flex items-center gap-1.5 text-sm font-bold font-bengali">
              <BarChart3 className="h-4 w-4 text-primary" /> টপিক পারফরম্যান্স
              <span className="text-[11px] font-normal text-muted-foreground font-bengali">
                (দুর্বল টপিক আগে)
              </span>
            </p>
            <ul className="flex flex-col gap-2.5">
              {topicRows.map((t) => (
                <li key={t.label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-xs font-bengali">
                    <span className="min-w-0 truncate font-medium">{t.label}</span>
                    <span className="shrink-0 text-muted-foreground">
                      {t.acc === null ? (
                        "উত্তর দেওয়া হয়নি"
                      ) : (
                        <>
                          {toBn(t.correct)}/{toBn(t.attempted)} · <span className={cn("font-bold", t.acc >= 70 ? "text-emerald-600 dark:text-emerald-400" : t.acc >= 40 ? "text-amber-600 dark:text-amber-400" : "text-red-500")}>{toBn(t.acc)}%</span>
                        </>
                      )}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        t.acc === null
                          ? "bg-zinc-400/60"
                          : t.acc >= 70
                            ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                            : t.acc >= 40
                              ? "bg-gradient-to-r from-amber-500 to-orange-500"
                              : "bg-gradient-to-r from-rose-500 to-red-600"
                      )}
                      style={{ width: `${t.acc ?? 4}%` }}
                      role="progressbar"
                      aria-valuenow={t.acc ?? 0}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${t.label}: ${t.acc ?? 0}%`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* answer review */}
        <div className="glass rounded-2xl p-5">
          <p className="mb-3 text-sm font-bold font-bengali">উত্তরপত্র রিভিউ</p>
          <ul className="flex flex-col gap-3">
            {result.run.map((q, n) => {
              const chosen = answers[q.id];
              const skipped = chosen === undefined;
              const ok = !skipped && chosen === q.correctIndex;
              return (
                <li
                  key={q.id}
                  className={cn(
                    "rounded-xl border p-3.5 font-bengali",
                    ok ? "border-emerald-500/40" : skipped ? "border-border/60" : "border-red-500/40"
                  )}
                >
                  <p className="text-[13px] font-semibold leading-6">
                    {toBn(n + 1)}. {q.question}
                  </p>
                  <div className="mt-1.5 flex flex-col gap-1 text-xs">
                    {skipped ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <SkipForward className="h-3.5 w-3.5" /> আপনি উত্তর দেননি
                      </span>
                    ) : (
                      <span className={cn("flex items-center gap-1.5", ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
                        {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                        আপনার উত্তর: {q.options[chosen]}
                      </span>
                    )}
                    {!ok && (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        ✔ সঠিক উত্তর: {q.options[q.correctIndex]}
                      </span>
                    )}
                    {!isRichEmpty(resolveExplanationHtml(q)) && (
                      <ExplanationRichView
                        html={resolveExplanationHtml(q)}
                        tone="emerald"
                        label="ব্যাখ্যা"
                        className="mt-1"
                      />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    );
  }

  // ---------- run ----------
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* exam header */}
      <div className="glass flex flex-wrap items-center gap-2.5 rounded-xl px-3 py-2">
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-sm font-bold tabular-nums",
            remaining <= 300 ? "animate-pulse bg-red-500/15 text-red-500" : "bg-primary/10 text-primary"
          )}
          aria-live="polite"
        >
          <AlarmClock className="h-4 w-4" /> {fmtClock(remaining)}
        </span>
        <Badge variant="secondary" className="h-6 font-bengali text-xs">
          উত্তর: {toBn(answeredCount)}/{toBn(run.length)}
        </Badge>
        {unanswered > 0 && (
          <Badge variant="outline" className="h-6 gap-1 border-amber-500/40 font-bengali text-xs text-amber-600 dark:text-amber-400">
            <FileWarning className="h-3 w-3" /> বাকি {toBn(unanswered)}
          </Badge>
        )}
        <Button
          size="sm"
          className="ml-auto h-8 gap-1.5 font-bengali"
          onClick={() => setConfirmOpen(true)}
        >
          জমা দিন
        </Button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 lg:flex-row">
        {/* question area */}
        <div className="flex min-h-0 flex-1 flex-col">
          <AnimatePresence mode="wait">
            {q && (
              <motion.div
                key={q.id}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                className="glass flex flex-1 flex-col rounded-2xl p-5"
              >
                <p className="text-[15px] font-semibold leading-relaxed font-bengali sm:text-base">
                  {toBn(qi + 1)}. {q.question}
                </p>
                <div className="mt-4 flex flex-col gap-2" role="radiogroup" aria-label="উত্তর">
                  {q.options.map((opt, i) => {
                    const picked = answers[q.id] === i;
                    return (
                      <button
                        key={i}
                        onClick={() => setAnswers((a) => ({ ...a, [q.id]: i }))}
                        aria-pressed={picked}
                        className={cn(
                          "flex items-center gap-3 rounded-xl border px-4 py-3 text-start text-sm font-bengali transition-all duration-150",
                          picked
                            ? "border-primary/60 bg-primary/10"
                            : "hover:border-primary/40 hover:bg-primary/5"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold font-bengali",
                            picked && "border-primary/60 bg-primary/20"
                          )}
                        >
                          {["ক", "খ", "গ", "ঘ", "ঙ", "চ"][i] ?? toBn(i + 1)}
                        </span>
                        <span className="min-w-0 flex-1">{opt}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-auto flex items-center justify-between pt-4">
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
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 font-bengali text-muted-foreground"
                    onClick={() =>
                      setMarked((s) => {
                        const n = new Set(s);
                        if (n.has(q.id)) n.delete(q.id);
                        else n.add(q.id);
                        return n;
                      })
                    }
                  >
                    <FileWarning className={cn("h-4 w-4", marked.has(q.id) && "text-amber-500")} />
                    {marked.has(q.id) ? "মার্ক সরান" : "পরে দেখব"}
                  </Button>
                  <Button
                    size="sm"
                    disabled={qi >= run.length - 1}
                    onClick={() => setQi((i) => Math.min(run.length - 1, i + 1))}
                    className="gap-1 font-bengali"
                  >
                    পরের <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* navigator */}
        <div className="glass shrink-0 rounded-2xl p-4 lg:w-56">
          <p className="mb-2 text-xs font-bold font-bengali">প্রশ্ন নেভিগেটর</p>
          <div className="grid max-h-40 grid-cols-8 gap-1.5 overflow-y-auto scroll-slim lg:max-h-none lg:grid-cols-5">
            {run.map((qq, i) => {
              const answered = answers[qq.id] !== undefined;
              const isMarked = marked.has(qq.id);
              return (
                <button
                  key={qq.id}
                  onClick={() => setQi(i)}
                  aria-label={`প্রশ্ন ${toBn(i + 1)}`}
                  className={cn(
                    "flex h-8 items-center justify-center rounded-lg border text-[11px] font-bold font-bengali transition-all",
                    i === qi && "ring-2 ring-primary",
                    isMarked
                      ? "border-amber-500/50 bg-amber-500/20 text-amber-700 dark:text-amber-400"
                      : answered
                        ? "border-primary/50 bg-primary text-primary-foreground"
                        : "text-muted-foreground"
                  )}
                >
                  {toBn(i + 1)}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-col gap-1 text-[10px] text-muted-foreground font-bengali">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-primary" /> উত্তর দেওয়া
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded bg-amber-500/40" /> পরে দেখব
            </span>
          </div>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bengali">পরীক্ষা জমা দেবেন?</AlertDialogTitle>
            <AlertDialogDescription className="font-bengali">
              {unanswered > 0
                ? `${toBn(unanswered)}টি প্রশ্নের উত্তর এখনো দেওয়া হয়নি। বাকিগুলো ০ হিসেবে গণনা হবে (নেগেটিভ মার্কিং নেই)।`
                : "সব প্রশ্নের উত্তর দেওয়া হয়েছে। জমা দিলে ফলাফল দেখাবে।"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-bengali">ফিরে যান</AlertDialogCancel>
            <AlertDialogAction
              className="font-bengali"
              onClick={() => {
                setConfirmOpen(false);
                submitExam(answers, run);
              }}
            >
              জমা দিন
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {doSubmit.isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="glass-strong flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bengali">
            <Loader2 className="h-4 w-4 animate-spin" /> ফলাফল গণনা হচ্ছে…
          </div>
        </div>
      )}
    </div>
  );
}
