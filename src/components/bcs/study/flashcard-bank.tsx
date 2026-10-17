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
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Heart,
  Layers,
  Lightbulb,
  Loader2,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  PauseCircle,
  PlayCircle,
  X,
} from "lucide-react";
import {
  createFlashcard,
  deleteFlashcard,
  fetchFlashcards,
  fetchStudyTree,
  updateFlashcard,
} from "@/lib/bcs-api";
import { toBn, type FlashcardDTO, type StudyNodeDTO } from "@/lib/bcs-types";
import { studyNodePathOf } from "@/lib/bcs-tree-utils";
import { useBcsStore } from "@/lib/bcs-store";
import { cn } from "@/lib/utils";
import {
  FlagChip,
  MiniActionBox,
  RevealAllButton,
  StudyNodePicker,
  boxBadgeClass,
  formatDueDate,
} from "./shared";
import { BadgeDrill, ALL, UNATTACHED, hueOf, useBadgeFilter } from "./node-badge-browser";
import {
  ExplanationEditor,
  ExplanationRichView,
  htmlToPlain,
  isRichEmpty,
  plainToHtml,
} from "./explanation-editor";

/* ------------------------------------------------------------------ */
/*  explanation HTML resolver — rich HTML takes precedence, legacy     */
/*  plain text is upgraded on the fly                                  */
/* ------------------------------------------------------------------ */

function explanationHtmlOf(c: { explanationHtml?: string; explanation?: string }): string {
  if (!isRichEmpty(c.explanationHtml)) return c.explanationHtml!;
  if (c.explanation && c.explanation.trim().length > 0) return plainToHtml(c.explanation);
  return "";
}

/* ------------------------------------------------------------------ */
/*  3D box shell for list items                                        */
/* ------------------------------------------------------------------ */

const BOX3D =
  "group relative flex min-w-0 flex-col overflow-hidden rounded-xl border bg-card/80 shadow-[0_1px_2px_rgb(0_0_0/0.06),0_8px_24px_-14px_rgb(0_0_0/0.35)] transition-all duration-300 hover:-translate-y-1 hover:rotate-[0.35deg] hover:shadow-[0_2px_4px_rgb(0_0_0/0.08),0_18px_36px_-14px_rgb(0_0_0/0.4)]";

const PAGE_SIZE = 30; // এক পেজে ৩০টি কার্ড

/* ---------- form dialog (create / edit) ---------- */

function FlashcardFormDialog({
  open,
  onOpenChange,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initial?: FlashcardDTO | null;
  onSaved?: () => void;
}) {
  const qc = useQueryClient();
  const isEdit = !!initial;
  const [front, setFront] = useState(initial?.front ?? "");
  const [back, setBack] = useState(initial?.back ?? "");
  // INDEPENDENT study-tree level (NOT the dashboard tree node)
  const [studyNodeId, setStudyNodeId] = useState<string | null>(initial?.studyNodeId ?? null);
  // rich explanation — upgrade legacy plain text on first open
  const [explanationHtml, setExplanationHtml] = useState(
    initial ? explanationHtmlOf(initial) : ""
  );
  const [cardType, setCardType] = useState<"basic" | "cloze">(
    initial?.cardType === "cloze" ? "cloze" : "basic"
  );

  const { data: studyNodes = [] } = useQuery({
    queryKey: ["study-tree"],
    queryFn: fetchStudyTree,
  });

  const save = useMutation({
    mutationFn: async () => {
      const explanationPlain = htmlToPlain(explanationHtml);
      const studyNodePath = studyNodePathOf(studyNodes, studyNodeId);
      if (initial) {
        return updateFlashcard(initial.id, {
          front,
          back: back || front,
          explanationHtml,
          explanation: explanationPlain,
          studyNodeId,
          studyNodePath,
          cardType,
          clozeText: cardType === "cloze" ? front : "",
        });
      }
      return createFlashcard({
        front,
        back: back || front,
        explanation: explanationPlain,
        explanationHtml,
        studyNodeId,
        studyNodePath,
        cardType,
        clozeText: cardType === "cloze" ? front : "",
      });
    },
    onSuccess: () => {
      toast.success(initial ? "কার্ড আপডেট হয়েছে" : "নতুন কার্ড যোগ হয়েছে");
      qc.invalidateQueries({ queryKey: ["flashcards"] });
      onOpenChange(false);
      onSaved?.();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave =
    front.trim().length > 0 && (cardType === "cloze" || back.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-bengali">
            {initial ? "কার্ড সম্পাদনা" : "নতুন ফ্ল্যাশকার্ড"}
          </DialogTitle>
          <DialogDescription className="font-bengali">
            সামনে প্রশ্ন/টার্ম, পেছনে সংক্ষিপ্ত উত্তর — আর ব্যাখ্যায় রিচ টেক্সটে বিস্তারিত লিখুন।
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCardType("basic")}
              className={`h-8 rounded-lg px-3 text-xs font-bengali ${cardType === "basic" ? "bg-primary text-primary-foreground" : "border text-muted-foreground"}`}
            >
              সাধারণ
            </button>
            <button
              type="button"
              onClick={() => setCardType("cloze")}
              className={`h-8 rounded-lg px-3 text-xs font-bengali ${cardType === "cloze" ? "bg-primary text-primary-foreground" : "border text-muted-foreground"}`}
            >
              ক্লোজ {"{{c1::উত্তর}}"}
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="font-bengali">
              {cardType === "cloze"
                ? "ক্লোজ টেক্সট * — উত্তর {{c1::ঢাকা}} দিয়ে ঘিরুন"
                : "সামনের অংশ (প্রশ্ন / টার্ম) *"}
            </Label>
            <Textarea
              value={front}
              onChange={(e) => setFront(e.target.value)}
              placeholder={
                cardType === "cloze"
                  ? "বাংলাদেশের রাজধানী {{c1::ঢাকা}}।"
                  : "যেমন: ষষ্ঠ শিডিউল কী নিয়ে?"
              }
              className="min-h-[72px] font-bengali"
              maxLength={600}
            />
          </div>
          {cardType === "basic" && (
          <div className="flex flex-col gap-1.5">
            <Label className="font-bengali">পেছনের অংশ (উত্তর) *</Label>
            <Textarea
              value={back}
              onChange={(e) => setBack(e.target.value)}
              placeholder="যেমন: উপজাতি ও উপজাতির প্রশাসন সংক্রান্ত বিষয়…"
              className="min-h-[100px] font-bengali"
              maxLength={4000}
            />
          </div>
          )}

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
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-bengali">
            বাতিল
          </Button>
          <Button onClick={() => save.mutate()} disabled={!canSave || save.isPending} className="gap-1.5 font-bengali">
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {initial ? "সংরক্ষণ" : "যোগ করুন"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- 3D flip viewer (open & study any card) ---------- */

function FlipFace({
  variant,
  label,
  text,
  hint,
}: {
  variant: "front" | "back";
  label: string;
  text: string;
  hint: string;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 flex flex-col overflow-hidden rounded-2xl p-5 text-white shadow-lg [backface-visibility:hidden] sm:p-6",
        variant === "front"
          ? "bg-gradient-to-br from-violet-500 via-purple-600 to-fuchsia-700"
          : "bg-gradient-to-br from-emerald-500 via-teal-600 to-emerald-700 [transform:rotateY(180deg)]"
      )}
    >
      {variant === "front" ? (
        <Layers className="pointer-events-none absolute -bottom-8 -right-6 h-36 w-36 rotate-12 text-white/10" />
      ) : (
        <Sparkles className="pointer-events-none absolute -bottom-8 -right-6 h-36 w-36 -rotate-12 text-white/10" />
      )}
      <span className="relative flex w-fit items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold font-bengali backdrop-blur-sm">
        {variant === "front" ? <StickyNote className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
        {label}
      </span>
      <div className="scroll-slim relative my-3 flex-1 overflow-y-auto">
        <p className="whitespace-pre-wrap text-[15px] font-semibold leading-relaxed font-bengali sm:text-base">
          {text}
        </p>
      </div>
      <span className="relative flex items-center justify-center gap-1.5 text-[11px] text-white/80 font-bengali">
        <RotateCw className="h-3 w-3" /> {hint}
      </span>
    </div>
  );
}

function FlipViewerDialog({
  card,
  hueIndex,
  displayPath,
  onOpenChange,
  onEdit,
  onToggleFavorite,
  onToggleReadLater,
}: {
  card: FlashcardDTO | null;
  hueIndex: number;
  displayPath?: string | null;
  onOpenChange: (o: boolean) => void;
  onEdit: (c: FlashcardDTO) => void;
  onToggleFavorite: (c: FlashcardDTO) => void;
  onToggleReadLater: (c: FlashcardDTO) => void;
}) {
  const [flipped, setFlipped] = useState(false);
  const [showExpl, setShowExpl] = useState(false);
  const close = (o: boolean) => {
    if (!o) {
      setFlipped(false);
      setShowExpl(false);
    }
    onOpenChange(o);
  };
  const hue = hueOf(hueIndex);
  const explHtml = card ? explanationHtmlOf(card) : "";

  return (
    <Dialog open={!!card} onOpenChange={close}>
      <DialogContent className="glass-strong max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <div className={cn("absolute inset-x-0 top-0 h-1.5", hue.grad)} />
        <DialogHeader className="mt-1">
          <DialogTitle className="flex items-center gap-2 font-bengali">
            <Eye className="h-4 w-4 text-primary" /> কার্ড দেখুন
          </DialogTitle>
          <DialogDescription className="font-bengali">
            কার্ডে ক্লিক করলেই 3D-স্টাইলে উল্টে যাবে — যেকোনো সময় সম্পাদনাও করা যাবে।
          </DialogDescription>
        </DialogHeader>

        {card && (
          <div className="flex flex-col gap-3">
            {displayPath && (
              <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground font-bengali">
                <span className={cn("inline-block h-2 w-2 rounded-full", hue.dot)} />
                <span className="max-w-[42ch] truncate">{displayPath}</span>
              </p>
            )}

            <div className="[perspective:1400px]">
              <button
                onClick={() => setFlipped((f) => !f)}
                aria-label={flipped ? "সামনের অংশ দেখুন" : "উত্তর দেখুন"}
                className={cn(
                  "relative block h-[230px] w-full transition-transform duration-500 [transform-style:preserve-3d]",
                  flipped && "[transform:rotateY(180deg)]"
                )}
              >
                <FlipFace variant="front" label="প্রশ্ন" text={card.front} hint="উল্টাতে ক্লিক করুন" />
                <FlipFace variant="back" label="উত্তর" text={card.back} hint="সামনে ফিরতে ক্লিক করুন" />
              </button>
            </div>

            {/* the 4 small action boxes */}
            <div className="grid grid-cols-4 gap-1.5">
              <MiniActionBox
                label="উত্তর"
                tone="emerald"
                active={flipped}
                onClick={() => setFlipped((f) => !f)}
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
                active={card.favorite}
                onClick={() => onToggleFavorite(card)}
                icon={<Heart className={cn("h-3.5 w-3.5", card.favorite && "fill-current")} />}
              />
              <MiniActionBox
                label="পরে পড়ুন"
                tone="rose"
                active={card.readLater}
                onClick={() => onToggleReadLater(card)}
                icon={<Bookmark className={cn("h-3.5 w-3.5", card.readLater && "fill-current")} />}
              />
            </div>

            <AnimatePresence>
              {showExpl && !isRichEmpty(explHtml) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25 }}
                  className="overflow-hidden"
                >
                  <ExplanationRichView html={explHtml} tone="violet" />
                </motion.div>
              )}
            </AnimatePresence>

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <Badge variant="outline" className={cn("gap-1 border font-bengali text-[10px]", boxBadgeClass(card.box))}>
                বাক্স {toBn(card.box)}
              </Badge>
              <Badge variant="outline" className="border font-bengali text-[10px]">
                পরবর্তী: {formatDueDate(card.dueDate)}
              </Badge>
              <Badge variant="outline" className="border font-bengali text-[10px]">
                রিভিউ: {toBn(card.reviewCount)} বার
              </Badge>
              {card.source === "ai" && (
                <Badge variant="outline" className="gap-1 border font-bengali text-[10px]">
                  <Sparkles className="h-3 w-3" /> AI
                </Badge>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            className="gap-1.5 font-bengali"
            onClick={() => {
              if (card) onEdit(card);
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

export function FlashcardBank({ onAddNew }: { onAddNew?: () => void }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FlashcardDTO | null>(null);
  const [viewing, setViewing] = useState<FlashcardDTO | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FlashcardDTO | null>(null);
  const [showAll, setShowAll] = useState(false); // per-node reveal (never auto-show)
  const [favOnly, setFavOnly] = useState(false);
  const [rlOnly, setRlOnly] = useState(false);
  const [backShown, setBackShown] = useState<Record<string, boolean>>({});
  const [explShown, setExplShown] = useState<Record<string, boolean>>({});
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["flashcards", "all"],
    queryFn: () => fetchFlashcards(),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["flashcards"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const toggleSuspend = useMutation({
    mutationFn: (c: FlashcardDTO) => updateFlashcard(c.id, { suspended: !c.suspended }),
    onSuccess: () => {
      invalidate();
      toast.success("স্ট্যাটাস পরিবর্তন হয়েছে");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleFlag = useMutation({
    mutationFn: ({ c, field }: { c: FlashcardDTO; field: "favorite" | "readLater" }) =>
      updateFlashcard(c.id, { [field]: !c[field] }),
    onSuccess: (_d, vars) => {
      invalidate();
      toast.success(
        vars.field === "favorite"
          ? vars.c.favorite ? "প্রিয় থেকে সরানো হয়েছে" : "💜 প্রিয়তে সেভ হয়েছে"
          : vars.c.readLater ? "পরে-পড়া থেকে সরানো হয়েছে" : "🔖 পরবর্তীতে পড়ুন-এ সেভ হয়েছে"
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setTrashOpen = useBcsStore((s) => s.setTrashOpen);

  const doDelete = useMutation({
    mutationFn: (id: string) => deleteFlashcard(id),
    onSuccess: () => {
      invalidate();
      toast.success("কার্ড ট্র্যাশে সরানো হয়েছে", {
        action: { label: "ট্র্যাশ দেখুন", onClick: () => setTrashOpen(true) },
      });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cards = data?.cards ?? [];
  // INDEPENDENT study-tree filter — flashcards live in their own level system
  const badge = useBadgeFilter(cards, { source: "study", idField: "studyNodeId" });
  const { data: studyNodes = [] } = useQuery({
    queryKey: ["study-tree"],
    queryFn: fetchStudyTree,
  });
  const pathOf = (c: FlashcardDTO) =>
    studyNodePathOf(studyNodes as StudyNodeDTO[], c.studyNodeId) ?? c.nodePath;

  // viewing must track the LIVE card object (flags update after refetch)
  const viewingLive = useMemo(
    () => (viewing ? cards.find((c) => c.id === viewing.id) ?? viewing : null),
    [viewing, cards]
  );

  // reset per-node reveal whenever the badge selection changes
  // (setState-during-render pattern — no effect needed)
  const [prevSelected, setPrevSelected] = useState(badge.selected);
  if (prevSelected !== badge.selected) {
    setPrevSelected(badge.selected);
    setShowAll(false);
  }

  // any filter/search/reveal change → back to page 1 (setState-during-render pattern)
  const filterSig = `${badge.selected}|${search}|${favOnly ? 1 : 0}|${rlOnly ? 1 : 0}|${showAll ? 1 : 0}`;
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

  const favCount = cards.filter((c) => c.favorite).length;
  const rlCount = cards.filter((c) => c.readLater).length;

  const baseList = useMemo(() => {
    let list = badge.filtered;
    if (favOnly) list = list.filter((c) => c.favorite);
    if (rlOnly) list = list.filter((c) => c.readLater);
    return list;
  }, [badge.filtered, favOnly, rlOnly]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return baseList;
    return baseList.filter(
      (c) =>
        c.front.toLowerCase().includes(q) ||
        c.back.toLowerCase().includes(q) ||
        (c.explanation ?? "").toLowerCase().includes(q) ||
        (c.studyNodePath ?? "").toLowerCase().includes(q) ||
        (c.nodePath ?? "").toLowerCase().includes(q)
    );
  }, [baseList, search]);

  const searching = search.trim().length > 0;
  const revealed = searching || favOnly || rlOnly || (drilled && showAll);

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
          <Layers className="h-3 w-3" /> দেখানো হচ্ছে: {toBn(revealed ? filtered.length : 0)}/{toBn(cards.length)}
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
            placeholder="কার্ড খুঁজুন…"
            aria-label="কার্ড খুঁজুন"
            className="h-9 pl-8 font-bengali"
          />
        </div>
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
          <Plus className="h-4 w-4" /> নতুন কার্ড
        </Button>
      </div>

      {/* colorful drill-down badge navigator — নিজস্ব স্টাডি লেভেল (স্বাধীন) */}
      <BadgeDrill badge={badge} allLabel="সব কার্ড" emptyLabel="লেভেল ছাড়া" source="study" />

      <div className="flex flex-col gap-3">
        {/* per-node reveal — nothing auto-opens */}
        <div ref={listTopRef} aria-hidden className="scroll-mt-4" />
        {drilled && !searching && !favOnly && !rlOnly && (
          <RevealAllButton
            label={badge.selected === UNATTACHED ? "লেভেল ছাড়া সকল ফ্ল্যাশকার্ড দেখুন" : "এই লেভেলের সকল ফ্ল্যাশকার্ড দেখুন"}
            sub={badge.selectedPath ?? "সাবট্রির সব কার্ড একসাথে"}
            count={drillCount}
            hueIndex={drillHueIdx}
            revealed={showAll}
            onToggle={() => setShowAll((v) => !v)}
          />
        )}

        {!revealed ? (
          !drilled && (
            <div className="glass flex flex-col items-center gap-2 rounded-2xl px-6 py-10 text-center">
              <Layers className="h-8 w-8 text-muted-foreground/50" />
              <p className="text-sm font-medium font-bengali">
                ব্যাজ থেকে সাবজেক্ট / নোড বেছে নিন
              </p>
              <p className="max-w-sm text-xs leading-5 text-muted-foreground font-bengali">
                প্রতিটি লেভেলের কার্ড সেই লেভেলেই সাজানো — ব্যাজে ক্লিক করে ভেতরে ঢুকুন, তারপর
                &quot;এই লেভেলের সকল ফ্ল্যাশকার্ড দেখুন&quot; বোতামে সব খুলুন। চাইলে উপরে খুঁজেও নিতে পারেন।
              </p>
            </div>
          )
        ) : isLoading ? (
          <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> <span className="font-bengali">লোড হচ্ছে…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
            <Layers className="h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium font-bengali">
              {searching ? "কিছু পাওয়া যায়নি" : favOnly || rlOnly ? "এখানে কোনো কার্ড সেভ করা নেই" : "এখনো কোনো কার্ড নেই"}
            </p>
            <p className="text-xs text-muted-foreground font-bengali">
              {searching
                ? "অন্য শব্দে খুঁজুন"
                : favOnly || rlOnly
                  ? "কার্ডের নিচের 💜 বা পরে-পড়ুন বাক্সে চেপে সেভ করুন"
                  : "\"নতুন কার্ড\" বা AI দিয়ে কার্ড বানান"}
            </p>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {paged.map((c) => {
              const hueIdx = badge.hueIndexOf(c.studyNodeId);
              const hue = hueIdx !== null ? hueOf(hueIdx) : null;
              const displayPath = pathOf(c);
              const explHtml = explanationHtmlOf(c);
              const hasExpl = !isRichEmpty(explHtml);
              return (
                <li
                  key={c.id}
                  className={cn(
                    BOX3D,
                    "border-t-0",
                    c.suspended && "opacity-60"
                  )}
                >
                  <div className={cn("h-1.5 w-full shrink-0", hue ? hue.grad : "bg-gradient-to-r from-zinc-400/70 to-zinc-300/30")} />
                  <div className="flex flex-1 flex-col p-4">
                    <button
                      onClick={() => setViewing(c)}
                      className="flex flex-col gap-1.5 text-start"
                      aria-label={`কার্ড খুলুন: ${c.front.slice(0, 40)}`}
                    >
                      <span className="line-clamp-3 text-[14px] font-semibold leading-6 font-bengali">{c.front}</span>
                      {backShown[c.id] ? (
                        <span className="rounded-lg bg-emerald-500/10 px-2 py-1.5 text-xs leading-5 text-emerald-700 ring-1 ring-emerald-500/30 dark:text-emerald-300">
                          <span className="font-bold">উত্তর: </span>
                          <span className="whitespace-pre-wrap">{c.back}</span>
                        </span>
                      ) : (
                        <span className="line-clamp-2 text-xs leading-5 text-muted-foreground font-bengali">
                          {c.back}
                        </span>
                      )}
                    </button>

                    <AnimatePresence>
                      {explShown[c.id] && hasExpl && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.22 }}
                          className="overflow-hidden"
                        >
                          <ExplanationRichView html={explHtml} tone="violet" className="mt-2" />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {displayPath && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-muted-foreground/80 font-bengali">
                        <span className={cn("inline-block h-1.5 w-1.5 shrink-0 rounded-full", hue?.dot ?? "bg-zinc-400")} />
                        <span className="line-clamp-1">{displayPath}</span>
                      </p>
                    )}

                    {/* the 4 small beautiful boxes */}
                    <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                      <MiniActionBox
                        label="উত্তর"
                        tone="emerald"
                        active={backShown[c.id]}
                        onClick={() => setBackShown((s) => ({ ...s, [c.id]: !s[c.id] }))}
                        icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                      />
                      <MiniActionBox
                        label="ব্যাখ্যা"
                        tone="amber"
                        active={explShown[c.id]}
                        disabled={!hasExpl}
                        onClick={() => setExplShown((s) => ({ ...s, [c.id]: !s[c.id] }))}
                        icon={<Lightbulb className="h-3.5 w-3.5" />}
                      />
                      <MiniActionBox
                        label="💜 প্রিয়"
                        tone="violet"
                        active={c.favorite}
                        onClick={() => toggleFlag.mutate({ c, field: "favorite" })}
                        icon={<Heart className={cn("h-3.5 w-3.5", c.favorite && "fill-current")} />}
                      />
                      <MiniActionBox
                        label="পরে পড়ুন"
                        tone="rose"
                        active={c.readLater}
                        onClick={() => toggleFlag.mutate({ c, field: "readLater" })}
                        icon={<Bookmark className={cn("h-3.5 w-3.5", c.readLater && "fill-current")} />}
                      />
                    </div>

                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
                      <Badge variant="outline" className={cn("gap-1 border font-bengali text-[10px]", boxBadgeClass(c.box))}>
                        বাক্স {toBn(c.box)}
                      </Badge>
                      <Badge variant="outline" className="border font-bengali text-[10px]">
                        পরবর্তী: {formatDueDate(c.dueDate)}
                      </Badge>
                      {c.source === "ai" && (
                        <Badge variant="outline" className="gap-1 border font-bengali text-[10px]">
                          <Sparkles className="h-3 w-3" /> AI
                        </Badge>
                      )}
                      {c.suspended && (
                        <Badge variant="outline" className="border font-bengali text-[10px]">
                          বিরতিতে
                        </Badge>
                      )}
                    </div>
                    <div className="mt-2.5 flex items-center gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 flex-1 gap-1.5 font-bengali"
                        onClick={() => setViewing(c)}
                      >
                        <Eye className="h-3.5 w-3.5" /> খুলুন
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 sm:h-8 sm:w-8"
                        aria-label={c.suspended ? "রিভিশনে ফিরিয়ে আনুন" : "সাময়িক বিরতি দিন"}
                        onClick={() => toggleSuspend.mutate(c)}
                      >
                        {c.suspended ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 text-muted-foreground hover:bg-destructive/15 hover:text-destructive sm:h-8 sm:w-8"
                        aria-label="কার্ড মুছুন"
                        onClick={() => setDeleteTarget(c)}
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

        {/* পেজিনেশন — ৩০টির বেশি হলে পরের কার্ডগুলো পরের পেজে */}
        {revealed && !isLoading && filtered.length > PAGE_SIZE && (
          <nav
            aria-label="কার্ড পেজিনেশন"
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-3 py-2.5 shadow-sm"
          >
            <p className="text-[11px] font-medium text-muted-foreground font-bengali">
              {toBn(rangeStart)}–{toBn(rangeEnd)} / {toBn(filtered.length)}টি কার্ড দেখানো হচ্ছে
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
                aria-current="page"
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

      <FlipViewerDialog
        card={viewingLive}
        hueIndex={(viewingLive && badge.hueIndexOf(viewingLive.studyNodeId)) ?? 0}
        displayPath={viewingLive ? pathOf(viewingLive) : null}
        onOpenChange={(o) => !o && setViewing(null)}
        onEdit={(c) => {
          setEditing(c);
          setFormOpen(true);
        }}
        onToggleFavorite={(c) => toggleFlag.mutate({ c, field: "favorite" })}
        onToggleReadLater={(c) => toggleFlag.mutate({ c, field: "readLater" })}
      />

      <FlashcardFormDialog
        key={editing?.id ?? "new"}
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={editing}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bengali">কার্ডটি ট্র্যাশে সরানো হবে</AlertDialogTitle>
            <AlertDialogDescription className="font-bengali">
              &quot;{deleteTarget?.front.slice(0, 60)}…&quot; ট্র্যাশে যাবে — সেখান থেকে যেকোনো সময় ফেরানো যাবে। নিশ্চিত?
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
