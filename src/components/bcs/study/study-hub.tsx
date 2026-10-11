"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  BookX,
  Brain,
  CalendarClock,
  ChevronRight,
  GraduationCap,
  Layers,
  ListChecks,
  Settings2,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fetchAttempts, fetchFlashcards, fetchMcqs, fetchSmartReview } from "@/lib/bcs-api";
import { toBn } from "@/lib/bcs-types";
import { cn } from "@/lib/utils";
import { FlashcardReview } from "./flashcard-review";
import { FlashcardBank } from "./flashcard-bank";
import { McqBank } from "./mcq-bank";
import { McqPractice } from "./mcq-practice";
import { MockExam } from "./mock-exam";
import { SmartRevision } from "./smart-revision";
import { AiGenerateDialog } from "./ai-generate-dialog";
import { SettingsDialog } from "./settings-dialog";

type ModeId = "review" | "cards" | "mcq" | "wrong" | "mock" | "smart";

interface ModeDef {
  id: ModeId;
  title: string;
  subtitle: string;
  desc: string;
  unit: string;
  icon: LucideIcon;
  /** vivid identity gradient */
  gradient: string;
  /** soft tint for small accents inside the mode */
  tint: string;
}

const MODES: ModeDef[] = [
  {
    id: "review",
    title: "আজকের রিভিশন",
    subtitle: "Leitner SRS — আজ যা মনে রাখা দরকার ঠিক সেটাই",
    desc: "সঠিক উত্তরে কার্ড ১ → ২ → ৪ → ৮ → ১৬ দিন পরে ফিরবে, ভুল হলে কাল আবার আসবে",
    unit: "কার্ড বাকি",
    icon: CalendarClock,
    gradient: "bg-gradient-to-r from-emerald-500 via-emerald-600 to-teal-600",
    tint: "text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "cards",
    title: "ফ্ল্যাশকার্ড",
    subtitle: "সব কার্ড ব্রাউজ · খুলে দেখা · সম্পাদনা",
    desc: "নোড ব্যাজ অনুযায়ী সাজানো আপনার পুরো কার্ড ভাণ্ডার",
    unit: "মোট কার্ড",
    icon: Layers,
    gradient: "bg-gradient-to-br from-violet-500 via-purple-600 to-purple-700",
    tint: "text-violet-600 dark:text-violet-400",
  },
  {
    id: "mcq",
    title: "MCQ প্র্যাকটিস",
    subtitle: "প্রশ্ন-প্রথম মোড — আগে মনে রাখুন, তারপর অপশন",
    desc: "প্রতিটি উত্তরের সাথে সাথেই সঠিক-ভুল আর ব্যাখ্যা",
    unit: "মোট প্রশ্ন",
    icon: ListChecks,
    gradient: "bg-gradient-to-br from-amber-500 via-orange-500 to-orange-600",
    tint: "text-amber-600 dark:text-amber-400",
  },
  {
    id: "wrong",
    title: "ভুল নোটবুক",
    subtitle: "ভুল হওয়া প্রশ্নগুলোই এখানে ফিরে আসে",
    desc: "সঠিক উত্তর দিলে প্রশ্ন নোটবুক থেকে বাদ যাবে",
    unit: "ভুল প্রশ্ন",
    icon: BookX,
    gradient: "bg-gradient-to-br from-rose-500 via-rose-600 to-red-600",
    tint: "text-rose-600 dark:text-rose-400",
  },
  {
    id: "mock",
    title: "মক পরীক্ষা ইঞ্জিন",
    subtitle: "বিষয় · টপিক · কাঠামো · সময় — নিজের মতো সাজানো পরীক্ষা",
    desc: "আসল BCS প্রিলি স্টাইল — টাইমার + নেগেটিভ মার্কিং, শেষে টপিক-ভিত্তিক পারফরম্যান্স",
    unit: "পরীক্ষা দিয়েছেন",
    icon: GraduationCap,
    gradient: "bg-gradient-to-br from-fuchsia-500 via-fuchsia-600 to-pink-600",
    tint: "text-fuchsia-600 dark:text-fuchsia-400",
  },
  {
    id: "smart",
    title: "স্মার্ট রিভিশন",
    subtitle: "Spaced Repetition — মনে রাখার বিজ্ঞান",
    desc: "😰😕🙂😎 ফিডব্যাক অনুযায়ী প্রতিটি প্রশ্ন ঠিক সময়ে ফিরে আসবে",
    unit: "আজ বাকি",
    icon: Brain,
    gradient: "bg-gradient-to-br from-lime-500 via-green-500 to-teal-600",
    tint: "text-teal-600 dark:text-teal-400",
  },
];

const MODE_BY_ID = Object.fromEntries(MODES.map((m) => [m.id, m])) as Record<ModeId, ModeDef>;

/** MCQ section: practice runner + question bank as nested tabs. */
function McqSection() {
  return (
    <Tabs defaultValue="practice" className="flex flex-col gap-0">
      <TabsList className="glass w-fit shrink-0 rounded-xl p-1">
        <TabsTrigger value="practice" className="gap-1.5 rounded-lg text-xs font-bengali">
          <ListChecks className="h-3.5 w-3.5" /> প্র্যাকটিস
        </TabsTrigger>
        <TabsTrigger value="bank" className="gap-1.5 rounded-lg text-xs font-bengali">
          <Layers className="h-3.5 w-3.5" /> প্রশ্ন ব্যাংক
        </TabsTrigger>
      </TabsList>
      <TabsContent value="practice" className="mt-3 flex flex-col">
        <McqPractice mode="practice" />
      </TabsContent>
      <TabsContent value="bank" className="mt-3 flex flex-col">
        <McqBank />
      </TabsContent>
    </Tabs>
  );
}

/** Colorful gradient header shown at the top of every active mode. */
function ModeHeader({
  def,
  stat,
  onBack,
}: {
  def: ModeDef;
  stat: number;
  onBack: () => void;
}) {
  const Icon = def.icon;
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl p-4 text-white shadow-lg sm:p-5",
        def.gradient
      )}
    >
      <Icon className="pointer-events-none absolute -bottom-6 -right-4 h-32 w-32 rotate-12 text-white/15" />
      <div className="relative flex items-center gap-3">
        <button
          onClick={onBack}
          aria-label="সব মোডে ফিরুন"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition-all duration-200 hover:scale-105 hover:bg-white/30"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold font-bengali sm:text-xl">{def.title}</h2>
          <p className="truncate text-[11px] text-white/85 font-bengali sm:text-xs">{def.desc}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold font-bengali backdrop-blur-sm">
          <Icon className="h-3.5 w-3.5" />
          {toBn(stat)} {def.unit}
        </span>
      </div>
    </div>
  );
}

export function StudyHub() {
  const [mode, setMode] = useState<ModeId | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { data: dueData } = useQuery({
    queryKey: ["flashcards", "due"],
    queryFn: () => fetchFlashcards("due"),
  });
  const { data: allCards } = useQuery({
    queryKey: ["flashcards", "all"],
    queryFn: () => fetchFlashcards(),
  });
  const { data: allMcqs } = useQuery({
    queryKey: ["mcqs", "all"],
    queryFn: () => fetchMcqs(),
  });
  const { data: wrongData } = useQuery({
    queryKey: ["mcqs", "wrongbook"],
    queryFn: () => fetchMcqs("wrongbook"),
  });
  const { data: attempts } = useQuery({
    queryKey: ["attempts"],
    queryFn: fetchAttempts,
  });
  // #19 smart revision due count — same cache the SmartRevision component uses
  const { data: smartData } = useQuery({
    queryKey: ["smart-review"],
    queryFn: fetchSmartReview,
  });

  const dueCount = dueData?.count ?? 0;
  const wrongCount = wrongData?.count ?? 0;
  const smartDue = smartData?.stats.due ?? 0;
  const stats: Record<ModeId, number> = {
    review: dueCount,
    cards: allCards?.count ?? 0,
    mcq: allMcqs?.count ?? 0,
    wrong: wrongCount,
    mock: attempts?.length ?? 0,
    smart: smartDue,
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: [0.4, 0, 0.2, 1] }}
      className="flex min-h-0 flex-none flex-col pb-4"
    >
      {/* ---------- top header ---------- */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 truncate text-xl font-bold tracking-tight font-bengali">
            <GraduationCap className="h-5 w-5 shrink-0 text-primary" />
            রিভিশন হাব
          </h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground font-bengali">
            ফ্ল্যাশকার্ড · MCQ · ভুল নোটবুক · মক পরীক্ষা · স্মার্ট রিভিশন — সব এক জায়গায়
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {dueCount > 0 && (
            <Badge
              variant="outline"
              className="h-6 gap-1 border-emerald-500/40 bg-emerald-500/10 px-2 font-bengali text-xs text-emerald-600 dark:text-emerald-400"
            >
              <CalendarClock className="h-3 w-3" /> আজ: {toBn(dueCount)} কার্ড
            </Badge>
          )}
          {wrongCount > 0 && (
            <Badge
              variant="outline"
              className="h-6 gap-1 border-rose-500/40 bg-rose-500/10 px-2 font-bengali text-xs text-rose-600 dark:text-rose-400"
            >
              <BookX className="h-3 w-3" /> ভুল: {toBn(wrongCount)}
            </Badge>
          )}
          {smartDue > 0 && (
            <Badge
              variant="outline"
              className="h-6 gap-1 border-teal-500/40 bg-teal-500/10 px-2 font-bengali text-xs text-teal-700 dark:text-teal-300"
            >
              <Brain className="h-3 w-3" /> স্মার্ট: {toBn(smartDue)}
            </Badge>
          )}
          <Badge variant="secondary" className="h-6 px-2 font-bengali text-xs">
            {toBn(allCards?.count ?? 0)} কার্ড · {toBn(allMcqs?.count ?? 0)} MCQ
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button onClick={() => setAiOpen(true)} className="h-9 gap-1.5 font-bengali">
            <Sparkles className="h-4 w-4" /> AI দিয়ে বানান
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            aria-label="AI সেটিংস"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* ---------- launcher / mode ---------- */}
      <AnimatePresence mode="wait">
        {mode === null ? (
          <motion.div
            key="launcher"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
          >
            {/* hero card — আজকের রিভিশন */}
            <ModeCard
              def={MODE_BY_ID.review}
              stat={dueCount}
              hero
              onOpen={() => setMode("review")}
            />
            {(["cards", "mcq", "wrong", "mock", "smart"] as ModeId[]).map((id) => (
              <ModeCard key={id} def={MODE_BY_ID[id]} stat={stats[id]} onOpen={() => setMode(id)} />
            ))}
          </motion.div>
        ) : (
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className="flex min-h-0 flex-col"
          >
            <ModeHeader def={MODE_BY_ID[mode]} stat={stats[mode]} onBack={() => setMode(null)} />
            <div className="mt-4 flex flex-col">
              {mode === "review" && <FlashcardReview />}
              {mode === "cards" && <FlashcardBank />}
              {mode === "mcq" && <McqSection />}
              {mode === "wrong" && <McqPractice mode="wrongbook" />}
              {mode === "mock" && <MockExam />}
              {mode === "smart" && <SmartRevision />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AiGenerateDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </motion.div>
  );
}

/** Vivid gradient launcher card (hero variant spans full width). */
function ModeCard({
  def,
  stat,
  hero = false,
  onOpen,
}: {
  def: ModeDef;
  stat: number;
  hero?: boolean;
  onOpen: () => void;
}) {
  const Icon = def.icon;
  return (
    <button
      onClick={onOpen}
      aria-label={`${def.title} খুলুন`}
      className={cn(
        "group relative overflow-hidden rounded-2xl text-start text-white shadow-lg transition-all duration-300",
        "hover:-translate-y-0.5 hover:shadow-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70",
        def.gradient,
        hero ? "p-5 sm:col-span-2 sm:p-6 xl:col-span-3" : "p-4 sm:p-5"
      )}
    >
      <Icon className="pointer-events-none absolute -bottom-7 -right-5 h-32 w-32 rotate-12 text-white/15 transition-transform duration-500 group-hover:rotate-6 group-hover:scale-110" />
      <div className={cn("relative flex gap-4", hero ? "items-center" : "flex-col")}>
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm",
            hero ? "h-14 w-14" : "h-11 w-11"
          )}
        >
          <Icon className={hero ? "h-7 w-7" : "h-5.5 w-5.5"} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn("font-bold font-bengali", hero ? "text-xl sm:text-2xl" : "text-base")}>
            {def.title}
          </p>
          <p className={cn("mt-0.5 text-white/85 font-bengali", hero ? "text-xs sm:text-sm" : "text-[11px] leading-5")}>
            {def.subtitle}
          </p>
        </div>
        {hero && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold font-bengali backdrop-blur-sm">
              <Icon className="h-3.5 w-3.5" /> {toBn(stat)} {def.unit}
            </span>
            <span className="flex items-center gap-1 rounded-full bg-white px-4 py-1.5 text-xs font-bold text-gray-900 shadow transition-transform duration-200 group-hover:scale-105 font-bengali">
              শুরু করুন <ChevronRight className="h-3.5 w-3.5" />
            </span>
          </div>
        )}
      </div>
      {!hero && (
        <div className="relative mt-4 flex items-center justify-between">
          <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold font-bengali backdrop-blur-sm">
            {toBn(stat)} {def.unit}
          </span>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:bg-white/30">
            <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      )}
    </button>
  );
}
