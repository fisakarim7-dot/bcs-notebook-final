"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Bookmark,
  BookX,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Eye,
  FileUp,
  Heart,
  Layers,
  Lightbulb,
  ListChecks,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Tag,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  createMcq,
  deleteMcq,
  fetchMcqs,
  fetchStudyTree,
  updateMcq,
} from "@/lib/bcs-api";
import { PyqImportDialog } from "./pyq-import-dialog";
import { toBn, type McqDTO, type StudyNodeDTO } from "@/lib/bcs-types";
import { studyNodePathOf } from "@/lib/bcs-tree-utils";
import { useBcsStore } from "@/lib/bcs-store";
import { cn } from "@/lib/utils";
import {
  FlagChip,
  MiniActionBox,
  RevealAllButton,
  StudyNodePicker,
} from "./shared";
import { BadgeDrill, ALL, UNATTACHED, hueOf, useBadgeFilter } from "./node-badge-browser";
import {
  TagChip,
  TagEditDialog,
  TagEditorField,
  TagFilterRow,
  useTagSuggestions,
} from "./mcq-tags";
import {
  ExplanationEditor,
  ExplanationRichView,
  htmlToPlain,
  isRichEmpty,
  plainToHtml,
} from "./explanation-editor";

const OPTION_LABELS = ["ক", "খ", "গ", "ঘ", "ঙ", "চ"];

/** প্রশ্ন ব্যাংক pagination — এক পেজে সর্বোচ্চ ৩০টি প্রশ্ন */
const PAGE_SIZE = 30;

function explanationHtmlOf(m: { explanationHtml?: string; explanation?: string }): string {
  if (!isRichEmpty(m.explanationHtml)) return m.explanationHtml!;
  if (m.explanation && m.explanation.trim().length > 0) return plainToHtml(m.explanation);
  return "";
}

/* 3D box shell — the colorful "থ্রি-ডি বক্স" every MCQ opens in */
const BOX3D =
  "group relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card/80 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_8px_24px_-14px_rgb(0_0_0/0.35)] transition-all duration-300 hover:-translate-y-1 hover:rotate-[0.35deg] hover:shadow-[0_2px_4px_rgb(0_0_0/0.08),0_18px_36px_-14px_rgb(0_0_0/0.4)]";

/* ---------- form dialog ---------- */

function McqFormDialog({
  open,
  onOpenChange,
  initial,
  suggestions = [],
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: McqDTO | null;
  suggestions?: string[];
}) {
  const qc = useQueryClient();
  const isEdit = !!initial;
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [opts, setOpts] = useState<string[]>(
    initial?.options?.length ? [...initial.options] : ["", "", "", ""]
  );
  const [correctIndex, setCorrectIndex] = useState<number>(initial?.correctIndex ?? 0);
  // INDEPENDENT study-tree level (NOT the dashboard tree node)
  const [studyNodeId, setStudyNodeId] = useState<string | null>(initial?.studyNodeId ?? null);
  const [explanationHtml, setExplanationHtml] = useState(
    initial ? explanationHtmlOf(initial) : ""
  );
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);

  const { data: studyNodes = [] } = useQuery({
    queryKey: ["study-tree"],
    queryFn: fetchStudyTree,
  });

  const save = useMutation({
    mutationFn: async () => {
      const explanationPlain = htmlToPlain(explanationHtml);
      const cleaned = opts.map((o) => o.trim()).filter((o) => o.length > 0);
      const studyNodePath = studyNodePathOf(studyNodes, studyNodeId);
      if (isEdit) {
        return updateMcq(initial!.id, {
          question,
          options: cleaned,
          correctIndex,
          explanationHtml,
          explanation: explanationPlain,
          studyNodeId,
          studyNodePath,
          tags,
        });
      }
      return createMcq({
        question,
        options: cleaned,
        correctIndex,
        explanation: explanationPlain,
        explanationHtml,
        studyNodeId,
        studyNodePath,
        tags,
      });
    },
    onSuccess: () => {
      toast.success(isEdit ? "প্রশ্ন আপডেট হয়েছে" : "নতুন প্রশ্ন যোগ হয়েছে");
      qc.invalidateQueries({ queryKey: ["mcqs"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cleanedCount = opts.filter((o) => o.trim().length > 0).length;
  const canSave =
    question.trim().length > 0 && cleanedCount >= 2 && correctIndex < cleanedCount;

  const setOpt = (i: number, v: string) =>
    setOpts((arr) => arr.map((o, idx) => (idx === i ? v : o)));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-bengali">
            {isEdit ? "প্রশ্ন সম্পাদনা" : "নতুন MCQ প্রশ্ন"}
          </DialogTitle>
          <DialogDescription className="font-bengali">
            BCS প্রিলি স্টাইল — ২ থেকে ৬টি অপশন, একটি সঠিক উত্তর।
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="font-bengali">প্রশ্ন *</Label>
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="যেমন: বাংলাদেশের সংবিধানের কোন অনুচ্ছেদে মৌলিক কর্তব্য বর্ণিত?"
              className="min-h-[64px] font-bengali"
              maxLength={1200}
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="font-bengali">অপশন (সঠিকটিতে ক্লিক করুন) *</Label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 font-bengali text-xs"
                  disabled={opts.length >= 6}
                  onClick={() => setOpts((a) => [...a, ""])}
                >
                  <Plus className="h-3 w-3" /> অপশন
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 font-bengali text-xs"
                  disabled={opts.length <= 2}
                  onClick={() => {
                    setOpts((a) => a.slice(0, -1));
                    setCorrectIndex((ci) => Math.min(ci, opts.length - 2));
                  }}
                >
                  কমান
                </Button>
              </div>
            </div>
            {opts.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`${OPTION_LABELS[i]} সঠিক উত্তর`}
                  onClick={() => setCorrectIndex(i)}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm font-bold font-bengali transition-all",
                    correctIndex === i
                      ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "text-muted-foreground hover:border-primary/40"
                  )}
                >
                  {OPTION_LABELS[i] ?? toBn(i + 1)}
                </button>
                <Input
                  value={o}
                  onChange={(e) => setOpt(i, e.target.value)}
                  placeholder={`অপশন ${OPTION_LABELS[i] ?? toBn(i + 1)}`}
                  className="h-9 font-bengali"
                />
              </div>
            ))}
          </div>

          {/* rich-text explanation — premium formatting */}
          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1.5 font-bengali">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
              ব্যাখ্যা — রিচ টেক্সট এডিটর (হেডিং · লিস্ট · হাইলাইট · ছবি · টেবিল)
            </Label>
            <ExplanationEditor
              value={explanationHtml}
              onChange={setExplanationHtml}
              placeholder="বিস্তারিত ব্যাখ্যা লিখুন — যত বড় চান, সব ফরম্যাটিং সহ…"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="font-bengali">সংযুক্ত লেভেল (স্টাডির নিজস্ব লেভেল — ড্যাশবোর্ডের নোড থেকে স্বাধীন)</Label>
            <StudyNodePicker value={studyNodeId} onChange={setStudyNodeId} />
          </div>

          {/* 🏷 Tag System (#14) — unlimited tags per question */}
          <div className="flex flex-col gap-1.5">
            <Label className="flex items-center gap-1.5 font-bengali">
              <Tag className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ট্যাগ — #Important, #Economy-র মতো যত খুশি
            </Label>
            <TagEditorField value={tags} onChange={setTags} suggestions={suggestions} />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-bengali">
            বাতিল
          </Button>
          <Button
            onClick={() => save.mutate()}
            disabled={!canSave || save.isPending}
            className="gap-1.5 font-bengali"
          >
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "সংরক্ষণ" : "যোগ করুন"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- premium explanation box (gradient border + glass) ---------- */

function ExplPremiumBox({
  html,
  onClose,
  className,
}: {
  html: string;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div
      className={cn(
        /* 3D: thick warm gradient MARGIN + darker bottom edge (thickness)
           + deep drop shadow — while the interior stays pure white. */
        "relative rounded-2xl bg-gradient-to-br from-amber-400 via-orange-400 to-rose-400 p-[2.5px]",
        "shadow-[0_22px_50px_-20px_rgb(0_0_0/0.5),0_6px_18px_-8px_rgb(251_146_60/0.45)]",
        "after:pointer-events-none after:absolute after:inset-x-1.5 after:bottom-0 after:h-[3px] after:rounded-b-2xl after:bg-gradient-to-r after:from-amber-700/55 after:via-orange-700/45 after:to-rose-700/45",
        className
      )}
    >
      <div className="relative overflow-hidden rounded-[calc(1rem-2.5px)] bg-white shadow-[inset_0_0_0_1px_rgb(0_0_0/0.05)] dark:bg-background/85 dark:shadow-none dark:backdrop-blur-sm">
        <ExplanationRichView html={html} tone="amber" className="rounded-none bg-transparent shadow-none ring-0" />
        <button
          type="button"
          onClick={onClose}
          aria-label="ব্যাখ্যা বন্ধ করুন"
          title="বন্ধ করুন"
          className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500/20 text-amber-700 transition-all hover:rotate-90 hover:bg-amber-500/40 dark:text-amber-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ---------- colorful 3D open-viewer (interactive tick-to-check) ---------- */

function McqViewerDialog({
  mcq,
  hueIndex,
  displayPath,
  onOpenChange,
  onEdit,
  onToggleFavorite,
  onToggleReadLater,
  onEditTags,
}: {
  mcq: McqDTO | null;
  hueIndex: number;
  displayPath?: string | null;
  onOpenChange: (o: boolean) => void;
  onEdit: (m: McqDTO) => void;
  onToggleFavorite: (m: McqDTO) => void;
  onToggleReadLater: (m: McqDTO) => void;
  onEditTags: (m: McqDTO) => void;
}) {
  // interactive tick-to-check state
  const [picked, setPicked] = useState<number | null>(null);
  const [wrongTried, setWrongTried] = useState<number[]>([]);
  const [solved, setSolved] = useState(false);
  const [answerShown, setAnswerShown] = useState(false);
  const [showExpl, setShowExpl] = useState(false);

  const close = (o: boolean) => {
    if (!o) {
      setPicked(null);
      setWrongTried([]);
      setSolved(false);
      setAnswerShown(false);
      setShowExpl(false);
    }
    onOpenChange(o);
  };

  const reset = () => {
    setPicked(null);
    setWrongTried([]);
    setSolved(false);
    setAnswerShown(false);
  };

  const tick = (i: number) => {
    if (solved) return; // সঠিক পাওয়ার পর টিক লক
    if (wrongTried.includes(i) && picked === i) {
      setPicked(null); // একই ভুল টিক আবার চাপলে টিক তুলে নেয়
      return;
    }
    setPicked(i);
    if (i === mcq?.correctIndex) setSolved(true);
    else setWrongTried((w) => (w.includes(i) ? w : [...w, i]));
  };

  const revealAnswer = () => {
    setAnswerShown((s) => !s);
    if (!solved) setSolved(true);
  };

  const hue = hueOf(hueIndex);
  const explHtml = mcq ? explanationHtmlOf(mcq) : "";
  const accuracy =
    mcq && mcq.attempts > 0 ? Math.round((mcq.correctCount / mcq.attempts) * 100) : null;
  const showCorrect = solved || answerShown;

  return (
    <Dialog open={!!mcq} onOpenChange={close}>
      <DialogContent className="glass-strong max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-amber-500 via-orange-500 to-orange-600" />
        <DialogHeader className="mt-1">
          <DialogTitle className="flex items-center gap-2 font-bengali">
            <ListChecks className="h-4 w-4 text-amber-600 dark:text-amber-400" /> প্রশ্ন দেখুন
          </DialogTitle>
          <DialogDescription className="font-bengali">
            অপশনে টিক দিন — ভুলে লেখা উঠবে <span className="font-semibold text-red-500">ভুল</span>,
            সঠিকে <span className="font-semibold text-emerald-600 dark:text-emerald-400">সঠিক</span> ও উত্তর বাটন।
          </DialogDescription>
        </DialogHeader>

        {mcq && (
          <div className="flex flex-col gap-3">
            {displayPath && (
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-bengali">
                <span className={cn("inline-block h-2 w-2 rounded-full", hue.dot)} />
                <span className="max-w-[44ch] truncate">{displayPath}</span>
              </p>
            )}

            {/* colorful 3D question box */}
            <div className="[perspective:1200px]">
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500/15 via-orange-500/10 to-rose-500/10 p-4 shadow-[0_18px_40px_-18px_rgb(0_0_0/0.45)] ring-1 ring-amber-500/30 [transform:rotateX(1.2deg)] sm:p-5">
                <ListChecks className="pointer-events-none absolute -bottom-6 -right-4 h-24 w-24 rotate-12 text-amber-500/10" />
                <span className="relative mb-2 flex w-fit items-center rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 font-bengali">
                  প্রশ্ন
                </span>
                <p className="relative whitespace-pre-wrap text-[15px] font-semibold leading-relaxed font-bengali">
                  {mcq.question}
                </p>
              </div>
            </div>

            {/* the 4 small premium action boxes */}
            <div className="grid grid-cols-4 gap-1.5">
              <MiniActionBox
                label="উত্তর"
                tone="emerald"
                active={answerShown}
                onClick={revealAnswer}
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
              />
              <MiniActionBox
                label="ব্যাখ্যা"
                tone="amber"
                active={showExpl}
                disabled={isRichEmpty(explHtml)}
                onClick={() => setShowExpl((s) => !s)}
                icon={<Lightbulb className="h-3.5 w-3.5" />}
              />
              <MiniActionBox
                label="💜 প্রিয়"
                tone="violet"
                active={mcq.favorite}
                onClick={() => onToggleFavorite(mcq)}
                icon={<Heart className={cn("h-3.5 w-3.5", mcq.favorite && "fill-current")} />}
              />
              <MiniActionBox
                label="পরে পড়ুন"
                tone="rose"
                active={mcq.readLater}
                onClick={() => onToggleReadLater(mcq)}
                icon={<Bookmark className={cn("h-3.5 w-3.5", mcq.readLater && "fill-current")} />}
              />
            </div>

            {/* 🏷 Tag System (#14) — chips + edit */}
            <div className="flex flex-wrap items-center gap-1.5">
              {mcq.tags.map((t) => (
                <TagChip key={t} tag={t} size="xs" />
              ))}
              <button
                type="button"
                onClick={() => onEditTags(mcq)}
                className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-emerald-500/50 bg-emerald-500/5 px-2 py-px text-[10px] font-medium text-emerald-700 transition-colors hover:bg-emerald-500/15 dark:text-emerald-300"
              >
                {mcq.tags.length === 0 ? (
                  <>
                    <Tag className="h-2.5 w-2.5" /> ট্যাগ যোগ করুন
                  </>
                ) : (
                  <>
                    <Pencil className="h-2.5 w-2.5" /> ট্যাগ সম্পাদনা
                  </>
                )}
              </button>
            </div>

            {/* options — সবসময় খোলা; টিক দিয়ে যাচাই */}
            <div className="flex flex-col gap-2" role="group" aria-label="অপশন — টিক দিয়ে মেলান">
              {mcq.options.map((opt, i) => {
                const isCorrect = i === mcq.correctIndex;
                const isPicked = picked === i;
                const isWrong = wrongTried.includes(i);
                const wrongNow = isWrong && isPicked && !solved;
                const correctNow = isCorrect && showCorrect;
                return (
                  <motion.button
                    key={i}
                    type="button"
                    onClick={() => tick(i)}
                    aria-pressed={isPicked || correctNow}
                    aria-label={`অপশন ${OPTION_LABELS[i] ?? toBn(i + 1)}: ${opt}`}
                    animate={wrongNow ? { x: [0, -7, 7, -4, 4, 0] } : { x: 0 }}
                    transition={{ duration: 0.35 }}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-start text-sm font-bengali transition-all duration-200",
                      correctNow
                        ? "border-emerald-500/70 bg-gradient-to-r from-emerald-500/15 to-teal-500/10 font-semibold text-emerald-700 shadow-[0_6px_20px_-8px_rgb(16_185_129/0.6)] ring-1 ring-emerald-500/40 dark:text-emerald-300"
                        : wrongNow
                          ? "border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-300"
                          : isWrong
                            ? "border-red-500/25 bg-red-500/[0.04] text-muted-foreground"
                            : "border-border/70 hover:-translate-y-px hover:border-amber-500/50 hover:bg-amber-500/5 hover:shadow-sm",
                      answerShown && !isCorrect && "opacity-55"
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border text-xs font-bold transition-colors",
                        correctNow
                          ? "border-emerald-500/60 bg-emerald-500/25 text-emerald-700 dark:text-emerald-300"
                          : wrongNow
                            ? "border-red-500/50 bg-red-500/20 text-red-600 dark:text-red-300"
                            : "text-muted-foreground"
                      )}
                    >
                      {OPTION_LABELS[i] ?? toBn(i + 1)}
                    </span>
                    <span className="min-w-0 flex-1">{opt}</span>
                    {/* tick zone */}
                    {correctNow ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" /> সঠিক
                      </span>
                    ) : wrongNow ? (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-300">
                        <XCircle className="h-3.5 w-3.5" /> ভুল
                      </span>
                    ) : isWrong ? (
                      <XCircle className="h-4 w-4 shrink-0 text-red-400/70" />
                    ) : (
                      <span
                        className={cn(
                          "h-4 w-4 shrink-0 rounded-full border-2 border-dashed transition-colors",
                          isPicked ? "border-amber-500 bg-amber-500/30" : "border-muted-foreground/30 group-hover:border-amber-500/60"
                        )}
                        aria-hidden
                      />
                    )}
                  </motion.button>
                );
              })}
            </div>

            {/* ভুল হলে হিন্ট */}
            <AnimatePresence>
              {picked !== null && !solved && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center justify-center gap-1.5 text-xs font-semibold text-red-500 font-bengali"
                >
                  <XCircle className="h-3.5 w-3.5" /> ভুল হয়েছে — আবার চেষ্টা করুন!
                </motion.p>
              )}
            </AnimatePresence>

            {/* সঠিক টিকের পরেই "উত্তর" বাটন ফুটে ওঠে */}
            <AnimatePresence>
              {solved && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.97 }}
                  transition={{ duration: 0.25 }}
                >
                  <button
                    type="button"
                    onClick={() => setAnswerShown((s) => !s)}
                    aria-expanded={answerShown}
                    className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-[0_10px_26px_-10px_rgb(16_185_129/0.8)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-10px_rgb(16_185_129/0.9)] active:translate-y-0"
                  >
                    <CheckCircle2 className="h-4.5 w-4.5 transition-transform group-hover:scale-110" />
                    <span className="font-bengali">{answerShown ? "উত্তর লুকান" : "উত্তর দেখুন"}</span>
                    <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", answerShown && "rotate-180")} />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* premium answer box */}
            <AnimatePresence>
              {answerShown && mcq.options[mcq.correctIndex] !== undefined && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/20 via-teal-500/12 to-emerald-500/8 p-4 shadow-[0_16px_36px_-16px_rgb(16_185_129/0.5)] ring-1 ring-emerald-500/40">
                    <CheckCircle2 className="pointer-events-none absolute -bottom-5 -right-4 h-20 w-20 rotate-12 text-emerald-500/10" />
                    <span className="relative mb-1.5 flex w-fit items-center gap-1 rounded-full bg-emerald-500/25 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 font-bengali">
                      <CheckCircle2 className="h-3 w-3" /> সঠিক উত্তর
                    </span>
                    <p className="relative flex items-start gap-2 text-[14px] font-semibold leading-relaxed font-bengali">
                      <span className="shrink-0 rounded-md bg-emerald-500/25 px-1.5 py-0.5 text-xs">
                        {OPTION_LABELS[mcq.correctIndex] ?? toBn(mcq.correctIndex + 1)}
                      </span>
                      <span>{mcq.options[mcq.correctIndex]}</span>
                    </p>
                    {wrongTried.length > 0 && (
                      <p className="relative mt-1.5 text-[11px] text-emerald-700/80 dark:text-emerald-300/80 font-bengali">
                        {toBn(wrongTried.length)} বার ভুল চেষ্টার পরে ঠিক হয়েছে {wrongTried.length === 0 && "— এক টিকেই সঠিক! 🎉"}
                      </p>
                    )}
                    {wrongTried.length === 0 && (
                      <p className="relative mt-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 font-bengali">
                        এক টিকেই সঠিক! 🎉
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* premium rich explanation */}
            <AnimatePresence>
              {showExpl && !isRichEmpty(explHtml) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <ExplPremiumBox html={explHtml} onClose={() => setShowExpl(false)} className="mt-0.5" />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <Badge variant="outline" className="gap-1 border font-bengali text-[10px]">
                <CircleDot className="h-3 w-3" /> চেষ্টা: {toBn(mcq.attempts)}
              </Badge>
              {accuracy !== null && (
                <Badge
                  variant="outline"
                  className={cn(
                    "border font-bengali text-[10px]",
                    accuracy >= 70
                      ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                      : "border-amber-500/30 text-amber-600 dark:text-amber-400"
                  )}
                >
                  সঠিকতা: {toBn(accuracy)}%
                </Badge>
              )}
              {mcq.inWrongBook && (
                <Badge variant="outline" className="gap-1 border border-red-500/30 font-bengali text-[10px] text-red-500">
                  <BookX className="h-3 w-3" /> ভুল নোটবুকে
                </Badge>
              )}
              {mcq.source === "ai" && (
                <Badge variant="outline" className="gap-1 border font-bengali text-[10px]">
                  <Sparkles className="h-3 w-3" /> AI
                </Badge>
              )}
              {(picked !== null || wrongTried.length > 0) && (
                <button
                  type="button"
                  onClick={reset}
                  className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground font-bengali"
                >
                  <RotateCcw className="h-3 w-3" /> আবার চেষ্টা
                </button>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="gap-1.5 font-bengali"
            onClick={() => {
              if (mcq) onEdit(mcq);
              close(false);
            }}
          >
            <Pencil className="h-4 w-4" /> সম্পাদনা
          </Button>
          <Button onClick={() => close(false)} className="font-bengali">
            বন্ধ করুন
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- bank ---------- */

export function McqBank({ onAddNew }: { onAddNew?: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<McqDTO | null>(null);
  const [viewing, setViewing] = useState<McqDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<McqDTO | null>(null);
  const [showAll, setShowAll] = useState(false); // per-node reveal (never auto-show)
  const [favOnly, setFavOnly] = useState(false);
  const [rlOnly, setRlOnly] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [explShown, setExplShown] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);
  // 🏷 Tag System (#14)
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [tagEditFor, setTagEditFor] = useState<McqDTO | null>(null);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [pyqOpen, setPyqOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["mcqs", "all"],
    queryFn: () => fetchMcqs(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["mcqs"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const setTrashOpen = useBcsStore((s) => s.setTrashOpen);

  const doDelete = useMutation({
    mutationFn: (id: string) => deleteMcq(id),
    onSuccess: () => {
      invalidate();
      toast.success("প্রশ্ন ট্র্যাশে সরানো হয়েছে", {
        action: { label: "ট্র্যাশ দেখুন", onClick: () => setTrashOpen(true) },
      });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleFlag = useMutation({
    mutationFn: ({ m, field }: { m: McqDTO; field: "favorite" | "readLater" }) =>
      updateMcq(m.id, { [field]: !m[field] }),
    onSuccess: (_d, vars) => {
      invalidate();
      toast.success(
        vars.field === "favorite"
          ? vars.m.favorite ? "প্রিয় থেকে সরানো হয়েছে" : "💜 প্রিয়তে সেভ হয়েছে"
          : vars.m.readLater ? "পরে-পড়া থেকে সরানো হয়েছে" : "🔖 পরবর্তীতে পড়ুন-এ সেভ হয়েছে"
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // 🏷 Tag System (#14) — save edited tag list for one question
  const saveTags = useMutation({
    mutationFn: ({ id, tags }: { id: string; tags: string[] }) => updateMcq(id, { tags }),
    onSuccess: () => {
      invalidate();
      toast.success("ট্যাগ সংরক্ষিত হয়েছে");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mcqs = data?.mcqs ?? [];
  const suggestions = useTagSuggestions(mcqs);
  // INDEPENDENT study-tree filter — MCQs live in their own level system
  const badge = useBadgeFilter(mcqs, { source: "study", idField: "studyNodeId" });
  const { data: studyNodes = [] } = useQuery({
    queryKey: ["study-tree"],
    queryFn: fetchStudyTree,
  });
  const pathOf = (m: McqDTO) =>
    studyNodePathOf(studyNodes as StudyNodeDTO[], m.studyNodeId) ?? m.nodePath;

  // viewing must track the LIVE mcq object (flags update after refetch)
  const viewingLive = useMemo(
    () => (viewing ? mcqs.find((m) => m.id === viewing.id) ?? viewing : null),
    [viewing, mcqs]
  );

  // reset per-node reveal whenever the badge selection changes
  // (setState-during-render pattern — no effect needed)
  const [prevSelected, setPrevSelected] = useState(badge.selected);
  if (prevSelected !== badge.selected) {
    setPrevSelected(badge.selected);
    setShowAll(false);
  }

  // any filter/search/reveal change → back to page 1 (setState-during-render pattern)
  const filterSig = `${badge.selected}|${search}|${favOnly ? 1 : 0}|${rlOnly ? 1 : 0}|${showAll ? 1 : 0}|${tagFilter ?? ""}`;
  const [prevSig, setPrevSig] = useState(filterSig);
  if (prevSig !== filterSig) {
    setPrevSig(filterSig);
    setPage(1);
  }

  const drilled = badge.selected !== ALL;
  const drillCount =
    badge.selected === UNATTACHED
      ? badge.unattached
      : badge.counts.get(badge.selected) ?? 0;
  const drillHueIdx = badge.hueIndexOf(badge.selected);

  const favCount = mcqs.filter((m) => m.favorite).length;
  const rlCount = mcqs.filter((m) => m.readLater).length;

  // 🏷 tag frequency within the current badge drill (before tag filter)
  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    const display = new Map<string, string>();
    for (const m of badge.filtered) {
      for (const t of m.tags ?? []) {
        const k = t.toLowerCase();
        map.set(k, (map.get(k) ?? 0) + 1);
        display.set(k, t);
      }
    }
    return [...map.entries()]
      .map(([k, count]) => ({ tag: display.get(k) ?? k, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [badge.filtered]);

  const baseList = useMemo(() => {
    let list = badge.filtered;
    if (favOnly) list = list.filter((m) => m.favorite);
    if (rlOnly) list = list.filter((m) => m.readLater);
    if (tagFilter) {
      const tf = tagFilter.toLowerCase();
      list = list.filter((m) => (m.tags ?? []).some((t) => t.toLowerCase() === tf));
    }
    return list;
  }, [badge.filtered, favOnly, rlOnly, tagFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return baseList;
    return baseList.filter(
      (m) =>
        m.question.toLowerCase().includes(q) ||
        m.options.some((o) => o.toLowerCase().includes(q)) ||
        (m.explanation ?? "").toLowerCase().includes(q) ||
        (m.studyNodePath ?? "").toLowerCase().includes(q) ||
        (m.nodePath ?? "").toLowerCase().includes(q) ||
        (m.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  }, [baseList, search]);

  const searching = search.trim().length > 0;
  const revealedAny = searching || favOnly || rlOnly || !!tagFilter || (drilled && showAll);

  // ---- pagination: এক পেজে ৩০টি ----
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage]
  );
  const rangeStart = (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(safePage * PAGE_SIZE, filtered.length);
  const listTopRef = useRef<HTMLDivElement | null>(null);
  const gotoPage = (p: number) => {
    setPage(p);
    listTopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="h-6 gap-1 px-2 font-bengali text-xs">
          <ListChecks className="h-3 w-3" /> দেখানো হচ্ছে: {toBn(revealedAny ? filtered.length : 0)}/{toBn(mcqs.length)}
        </Badge>
        {badge.selectedPath && (
          <Badge variant="outline" className="h-6 max-w-52 gap-1 border-primary/40 bg-primary/5 px-2 font-bengali text-[11px] text-primary">
            <span className="truncate">{badge.selectedPath}</span>
            <button onClick={() => badge.setSelected(ALL)} aria-label="ফিল্টার সরান">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        )}
        {/* 💜 / পরবর্তীতে পড়ুন — per-node saved shortlists */}
        <FlagChip
          icon={<Heart className={cn("h-3 w-3", favOnly && "fill-current")} />}
          label="প্রিয়"
          count={favCount}
          active={favOnly}
          onClick={() => setFavOnly((v) => !v)}
          activeClass="border-violet-500/50 bg-violet-500/15 text-violet-700 dark:text-violet-300"
        />
        <FlagChip
          icon={<Bookmark className={cn("h-3 w-3", rlOnly && "fill-current")} />}
          label="পরবর্তীতে পড়ুন"
          count={rlCount}
          active={rlOnly}
          onClick={() => setRlOnly((v) => !v)}
          activeClass="border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300"
        />
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="প্রশ্ন খুঁজুন…"
            aria-label="প্রশ্ন খুঁজুন"
            className="h-9 pl-8 font-bengali"
          />
        </div>
        <Button
          variant="outline"
          onClick={() => setPyqOpen(true)}
          className="h-9 gap-1.5 font-bengali"
        >
          <FileUp className="h-4 w-4" /> PYQ ইমপোর্ট
        </Button>
        <Button
          onClick={() => {
            if (onAddNew) {
              onAddNew();
              return;
            }
            setEditing(null);
            setFormOpen(true);
          }}
          className="h-9 gap-1.5 font-bengali"
        >
          <Plus className="h-4 w-4" /> নতুন প্রশ্ন
        </Button>
      </div>

      {/* colorful drill-down badge navigator — subject → level 6 */}
      <BadgeDrill badge={badge} allLabel="সব প্রশ্ন" emptyLabel="লেভেল ছাড়া" source="study" />

      {/* 🏷 Tag System (#14) — click a tag to filter the bank */}
      <TagFilterRow counts={tagCounts} selected={tagFilter} onSelect={setTagFilter} />

      <div className="flex flex-col gap-3">
        {/* per-node reveal — nothing auto-opens */}
        <div ref={listTopRef} aria-hidden className="scroll-mt-4" />
        {drilled && !searching && !favOnly && !rlOnly && !tagFilter && (
          <RevealAllButton
            label={badge.selected === UNATTACHED ? "নোড ছাড়া সকল প্রশ্ন দেখুন" : "এই নোডের সকল প্রশ্ন দেখুন"}
            sub={badge.selectedPath ?? "সাবট্রির সব প্রশ্ন একসাথে"}
            count={drillCount}
            hueIndex={drillHueIdx}
            revealed={showAll}
            onToggle={() => setShowAll((v) => !v)}
          />
        )}

        {!revealedAny ? (
          !drilled && (
            <div className="glass flex flex-col items-center gap-2 rounded-2xl px-6 py-10 text-center">
              <ListChecks className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium font-bengali">
                ব্যাজ থেকে সাবজেক্ট / নোড বেছে নিন
              </p>
              <p className="max-w-sm text-xs leading-5 text-muted-foreground font-bengali">
                প্রতিটি নোডের প্রশ্ন সেই নোডেই সাজানো — ব্যাজে ক্লিক করে ভেতরে ঢুকুন, তারপর
                &quot;এই নোডের সকল প্রশ্ন দেখুন&quot; বোতামে রঙিন থ্রি-ডি বক্সে সব খুলুন।
              </p>
            </div>
          )
        ) : isLoading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> <span className="font-bengali">লোড হচ্ছে…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
            <ListChecks className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium font-bengali">
              {searching ? "কিছু পাওয়া যায়নি" : favOnly || rlOnly ? "এখানে কোনো প্রশ্ন সেভ করা নেই" : "এখনো কোনো প্রশ্ন নেই"}
            </p>
            <p className="text-xs text-muted-foreground font-bengali">
              {searching
                ? "অন্য শব্দে খুঁজুন"
                : favOnly || rlOnly
                  ? "প্রশ্নের নিচের 💜 বা পরে-পড়ুন বাক্সে চেপে সেভ করুন"
                  : "\"নতুন প্রশ্ন\" বোতাম বা AI দিয়ে প্রশ্ন বানান"}
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 xl:grid-cols-2">
            {paged.map((m) => {
              const accuracy =
                m.attempts > 0 ? Math.round((m.correctCount / m.attempts) * 100) : null;
              const hueIdx = badge.hueIndexOf(m.studyNodeId);
              const hue = hueIdx !== null ? hueOf(hueIdx) : null;
              const explHtml = explanationHtmlOf(m);
              const hasExpl = !isRichEmpty(explHtml);
              return (
                <li key={m.id} className={cn(BOX3D, "border-t-0")}>
                  <div className={cn("h-1.5 w-full shrink-0", hue ? hue.grad : "bg-gradient-to-r from-zinc-400/70 to-zinc-300/30")} />
                  <div className="flex flex-1 flex-col p-4">
                    {/* premium amber question zone */}
                    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-500/12 via-orange-500/8 to-rose-500/8 p-3 ring-1 ring-amber-500/25">
                      <ListChecks className="pointer-events-none absolute -bottom-4 -right-3 h-16 w-16 rotate-12 text-amber-500/10" />
                      <div className="relative mb-1 flex items-center justify-between gap-2">
                        <span className="flex w-fit items-center rounded-full bg-amber-500/20 px-2 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300 font-bengali">
                          প্রশ্ন
                        </span>
                        {m.source === "ai" && (
                          <span className="flex items-center gap-0.5 rounded-full bg-violet-500/15 px-1.5 py-0.5 text-[9px] font-bold text-violet-600 dark:text-violet-300">
                            <Sparkles className="h-2.5 w-2.5" /> AI
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setViewing(m)}
                        className="relative min-w-0 text-start"
                        aria-label={`প্রশ্ন খুলুন: ${m.question.slice(0, 40)}`}
                      >
                        <p className="line-clamp-3 text-[14px] font-semibold leading-6 font-bengali">
                          {m.question}
                        </p>
                        <span className="mt-1 flex items-center gap-1 text-[10px] font-medium text-amber-700/70 transition-colors hover:text-amber-700 dark:text-amber-300/70 dark:hover:text-amber-300 font-bengali">
                          <Eye className="h-3 w-3" /> টিক-চেকে খুলুন
                        </span>
                      </button>
                    </div>

                    {/* 🏷 tags row — click chip = filter, + = edit */}
                    {(m.tags?.length ?? 0) > 0 && (
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        {m.tags.slice(0, 4).map((t) => (
                          <TagChip
                            key={t}
                            tag={t}
                            size="xs"
                            active={tagFilter?.toLowerCase() === t.toLowerCase()}
                            onClick={() =>
                              setTagFilter((cur) =>
                                cur?.toLowerCase() === t.toLowerCase() ? null : t
                              )
                            }
                          />
                        ))}
                        {m.tags.length > 4 && (
                          <span className="rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                            +{toBn(m.tags.length - 4)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setTagEditFor(m);
                            setTagDialogOpen(true);
                          }}
                          aria-label="ট্যাগ সম্পাদনা"
                          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-emerald-500/50 px-1.5 py-px text-[10px] text-emerald-700 transition-colors hover:bg-emerald-500/10 dark:text-emerald-300"
                        >
                          <Tag className="h-2.5 w-2.5" />
                          {m.tags.length === 0 ? "যোগ" : "সম্পাদনা"}
                        </button>
                      </div>
                    )}
                    {(m.tags?.length ?? 0) === 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setTagEditFor(m);
                          setTagDialogOpen(true);
                        }}
                        className="mt-2 inline-flex items-center gap-1 rounded-full border border-dashed border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-emerald-500/50 hover:text-emerald-700 dark:hover:text-emerald-300"
                      >
                        <Tag className="h-2.5 w-2.5" /> ট্যাগ যোগ করুন
                      </button>
                    )}

                    {revealed[m.id] ? (
                      /* premium revealed answer box */
                      <div className="relative mt-2 overflow-hidden rounded-xl bg-gradient-to-r from-emerald-500/15 to-teal-500/10 px-3 py-2 ring-1 ring-emerald-500/40">
                        <p className="relative flex items-start gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 font-bengali">
                          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span className="min-w-0">
                            <span className="mr-1 rounded bg-emerald-500/25 px-1.5 py-0.5">
                              {OPTION_LABELS[m.correctIndex] ?? toBn(m.correctIndex + 1)}
                            </span>
                            {m.options[m.correctIndex]}
                          </span>
                        </p>
                      </div>
                    ) : (
                      <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-dashed border-amber-500/40 bg-amber-500/5 px-2.5 py-1.5 text-[11px] text-amber-700/80 dark:text-amber-300/80 font-bengali">
                        <Eye className="h-3 w-3 shrink-0" /> উত্তর লুকানো — নিচের &quot;উত্তর&quot; বাক্সে চাপুন
                      </p>
                    )}

                    <AnimatePresence>
                      {explShown[m.id] && hasExpl && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22 }}
                          className="overflow-hidden"
                        >
                          <ExplPremiumBox
                            html={explHtml}
                            onClose={() => setExplShown((s) => ({ ...s, [m.id]: false }))}
                            className="mt-2"
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* the 4 small beautiful boxes */}
                    <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                      <MiniActionBox
                        label="উত্তর"
                        tone="emerald"
                        active={revealed[m.id]}
                        onClick={() => setRevealed((s) => ({ ...s, [m.id]: !s[m.id] }))}
                        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                      />
                      <MiniActionBox
                        label="ব্যাখ্যা"
                        tone="amber"
                        active={explShown[m.id]}
                        disabled={!hasExpl}
                        onClick={() => setExplShown((s) => ({ ...s, [m.id]: !s[m.id] }))}
                        icon={<Lightbulb className="h-3.5 w-3.5" />}
                      />
                      <MiniActionBox
                        label="💜 প্রিয়"
                        tone="violet"
                        active={m.favorite}
                        onClick={() => toggleFlag.mutate({ m, field: "favorite" })}
                        icon={<Heart className={cn("h-3.5 w-3.5", m.favorite && "fill-current")} />}
                      />
                      <MiniActionBox
                        label="পরে পড়ুন"
                        tone="rose"
                        active={m.readLater}
                        onClick={() => toggleFlag.mutate({ m, field: "readLater" })}
                        icon={<Bookmark className={cn("h-3.5 w-3.5", m.readLater && "fill-current")} />}
                      />
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
                      <Badge variant="outline" className="gap-1 border font-bengali text-[10px]">
                        <CircleDot className="h-3 w-3" /> চেষ্টা: {toBn(m.attempts)}
                      </Badge>
                      {accuracy !== null && (
                        <Badge
                          variant="outline"
                          className={cn(
                            "border font-bengali text-[10px]",
                            accuracy >= 70
                              ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                              : "border-amber-500/30 text-amber-600 dark:text-amber-400"
                          )}
                        >
                          সঠিকতা: {toBn(accuracy)}%
                        </Badge>
                      )}
                      {m.inWrongBook && (
                        <Badge variant="outline" className="gap-1 border border-red-500/30 font-bengali text-[10px] text-red-500">
                          <XCircle className="h-3 w-3" /> ভুল নোটবুকে
                        </Badge>
                      )}
                      {m.studyNodePath && (
                        <span className="ml-auto hidden max-w-[24ch] items-center gap-1.5 truncate text-[10px] text-muted-foreground sm:flex font-bengali">
                          <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", hue?.dot ?? "bg-zinc-400")} />
                          <span className="truncate">{m.studyNodePath}</span>
                        </span>
                      )}
                    </div>
                    <div className="mt-2 flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 sm:h-8 sm:w-8"
                        aria-label="প্রশ্ন সম্পাদনা"
                        onClick={() => {
                          setEditing(m);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 text-muted-foreground hover:bg-destructive/15 hover:text-destructive sm:h-8 sm:w-8"
                        aria-label="প্রশ্ন মুছুন"
                        onClick={() => setDeleteTarget(m)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* পেজিনেশন — ৩০টির বেশি হলে পরের প্রশ্নগুলো পরের পেজে */}
        {revealedAny && !isLoading && filtered.length > PAGE_SIZE && (
          <nav
            aria-label="প্রশ্ন পেজিনেশন"
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-3 py-2.5 shadow-sm"
          >
            <p className="text-[11px] font-medium text-muted-foreground font-bengali">
              {toBn(rangeStart)}–{toBn(rangeEnd)} / {toBn(filtered.length)}টি প্রশ্ন দেখানো হচ্ছে
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1 font-bengali"
                disabled={safePage <= 1}
                onClick={() => gotoPage(safePage - 1)}
              >
                <ChevronLeft className="h-4 w-4" /> পূর্ববর্তী
              </Button>
              <span
                aria-current={safePage}
                className="flex h-9 min-w-20 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 px-2.5 text-xs font-bold text-primary font-bengali"
              >
                পৃষ্ঠা {toBn(safePage)}/{toBn(pageCount)}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-9 gap-1 font-bengali"
                disabled={safePage >= pageCount}
                onClick={() => gotoPage(safePage + 1)}
              >
                পরবর্তী <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </nav>
        )}
      </div>

      <McqViewerDialog
        mcq={viewingLive}
        hueIndex={(viewingLive && badge.hueIndexOf(viewingLive.studyNodeId)) ?? 0}
        displayPath={viewingLive ? pathOf(viewingLive) : null}
        onOpenChange={(o) => !o && setViewing(null)}
        onEdit={(m) => {
          setEditing(m);
          setFormOpen(true);
        }}
        onToggleFavorite={(m) => toggleFlag.mutate({ m, field: "favorite" })}
        onToggleReadLater={(m) => toggleFlag.mutate({ m, field: "readLater" })}
        onEditTags={(m) => {
          setTagEditFor(m);
          setTagDialogOpen(true);
        }}
      />

      <McqFormDialog
        key={editing?.id ?? "new"}
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
        suggestions={suggestions}
      />

      <PyqImportDialog open={pyqOpen} onOpenChange={setPyqOpen} />

      {/* 🏷 Tag System (#14) — per-question editor */}
      <TagEditDialog
        open={tagDialogOpen}
        onOpenChange={setTagDialogOpen}
        mcq={tagEditFor ? (mcqs.find((m) => m.id === tagEditFor.id) ?? tagEditFor) : null}
        suggestions={suggestions}
        onSaved={async (tags) => {
          if (!tagEditFor) return;
          await new Promise<void>((resolve, reject) => {
            saveTags.mutate(
              { id: tagEditFor.id, tags },
              { onSuccess: () => resolve(), onError: (e) => reject(e) }
            );
          });
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bengali">প্রশ্নটি ট্র্যাশে সরানো হবে</AlertDialogTitle>
            <AlertDialogDescription className="font-bengali">
              মুছলে ট্র্যাশে যাবে — সেখান থেকে যেকোনো সময় ফেরানো যাবে। নিশ্চিত?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="font-bengali">বাতিল</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive font-bengali text-white hover:bg-destructive/90"
              onClick={() => deleteTarget && doDelete.mutate(deleteTarget.id)}
            >
              ট্র্যাশে পাঠান
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
