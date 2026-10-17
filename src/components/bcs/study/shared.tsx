"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Eye, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  fetchStudyTree,
  fetchTree,
} from "@/lib/bcs-api";
import { namePathOf, studyNodePathOf } from "@/lib/bcs-tree-utils";
import type { StudyNodeDTO, TreeNodeDTO } from "@/lib/bcs-types";
import { cn } from "@/lib/utils";
import { BadgeDrill, hueOf, useControlledBadgeBag } from "./node-badge-browser";

export interface NodeOption {
  id: string;
  label: string;
}

/** Flatten the tree into "Subject / Part / … / Node" options. */
export function useNodeOptions(): NodeOption[] {
  const { data: nodes = [] } = useQuery({ queryKey: ["tree"], queryFn: fetchTree });
  return nodes.map((n) => ({
    id: n.id,
    label: namePathOf(nodes, n.id).join(" / "),
  }));
}

const NONE = "__none__";

/**
 * Node picker — browse the live tree as COLORFUL BADGES (subject → level 6,
 * exactly like the flashcard/MCQ badge browser). Whatever node is picked
 * here automatically appears inside those badges in the banks.
 * Search remains as a fast shortcut for huge trees.
 */
export function NodePicker({
  value,
  onChange,
  placeholder,
  className,
  allowNone = true,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  className?: string;
  allowNone?: boolean;
}) {
  const { data: nodes = [] } = useQuery({ queryKey: ["tree"], queryFn: fetchTree });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedPath = useMemo(
    () => (value ? namePathOf(nodes, value).join(" / ") : null),
    [nodes, value]
  );

  const pick = (id: string | null) => {
    onChange(id);
    setSearch("");
    setOpen(false);
  };

  const badge = useControlledBadgeBag(value, (id) => {
    // BadgeDrill picker-mode ✓ — select and close
    onChange(id);
    setSearch("");
    setOpen(false);
  });

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return nodes.filter((n) => namePathOf(nodes, n.id).join(" / ").toLowerCase().includes(q));
  }, [nodes, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("h-10 w-full justify-between gap-2 px-3 font-bengali", className)}
        >
          <span className="min-w-0 flex-1 truncate text-start">
            {selectedPath ?? <span className="text-muted-foreground">{placeholder ?? "নোড বাছাই করুন"}</span>}
          </span>
          {value ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="নোড সরান"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                pick(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  pick(null);
                }
              }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="glass-strong w-[21rem] max-w-[94vw] p-2.5 sm:w-[24rem]"
      >
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="দ্রুত খুঁজুন (ঐচ্ছিক)…"
            className="h-8 pl-8 text-[13px] font-bengali"
          />
        </div>

        <div className="scroll-slim max-h-80 overflow-y-auto pr-0.5">
          {allowNone && !matches && (
            <button
              type="button"
              onClick={() => pick(null)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-accent font-bengali",
                !value && "bg-primary/10 font-semibold text-primary"
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
              সাধারণ (কোনো নোড নেই)
            </button>
          )}

          {matches ? (
            matches.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground font-bengali">
                মেলেনি — অন্য শব্দে খুঁজুন
              </p>
            ) : (
              matches.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => pick(n.id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-accent",
                    value === n.id && "bg-primary/10"
                  )}
                >
                  <span className="max-w-full truncate text-[13px] font-medium font-bengali">
                    {n.name}
                  </span>
                  <span className="max-w-full truncate text-[10px] text-muted-foreground font-bengali">
                    {namePathOf(nodes, n.id).join(" / ")}
                  </span>
                </button>
              ))
            )
          ) : (
            <BadgeDrill
              badge={badge}
              allLabel="সব লেভেল"
              mode="picker"
              compact
              onPickNode={(id) => id && pick(id)}
            />
          )}
        </div>
        {!matches && (
          <p className="mt-1.5 px-1 text-[10px] leading-4 text-muted-foreground/80 font-bengali">
            কার্ডে ক্লিক করে লেভেলের ভেতরে যান, ✓ চেপে সেই নোডে সেভ করুন — নতুন নোডগুলোও এখানেই ফুটে উঠবে।
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * StudyNodePicker — same colorful badge browsing as NodePicker, but over the
 * INDEPENDENT study tree (ফ্ল্যাশকার্ড ও MCQ ব্যাংকের নিজস্ব লেভেল). Users
 * can also create a new study level right inside the picker.
 */
export function StudyNodePicker({
  value,
  onChange,
  placeholder,
  className,
  allowNone = true,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  className?: string;
  allowNone?: boolean;
}) {
  const { data: nodes = [] } = useQuery({
    queryKey: ["study-tree"],
    queryFn: fetchStudyTree,
  });
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedPath = useMemo(
    () => (value ? studyNodePathOf(nodes, value) : null),
    [nodes, value]
  );

  const pick = (id: string | null) => {
    onChange(id);
    setSearch("");
    setOpen(false);
  };

  const badge = useControlledBadgeBag(value, (id) => {
    onChange(id);
    setSearch("");
    setOpen(false);
  }, { source: "study" });

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return nodes.filter((n) => (studyNodePathOf(nodes, n.id) ?? "").toLowerCase().includes(q));
  }, [nodes, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("h-10 w-full justify-between gap-2 px-3 font-bengali", className)}
        >
          <span className="min-w-0 flex-1 truncate text-start">
            {selectedPath ?? <span className="text-muted-foreground">{placeholder ?? "লেভেল বাছাই করুন"}</span>}
          </span>
          {value ? (
            <span
              role="button"
              tabIndex={0}
              aria-label="লেভেল সরান"
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                pick(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  pick(null);
                }
              }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="glass-strong w-[21rem] max-w-[94vw] p-2.5 sm:w-[24rem]"
      >
        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="দ্রুত খুঁজুন (ঐচ্ছিক)…"
            className="h-8 pl-8 text-[13px] font-bengali"
          />
        </div>

        <div className="scroll-slim max-h-80 overflow-y-auto pr-0.5">
          {allowNone && !matches && (
            <button
              type="button"
              onClick={() => pick(null)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-accent font-bengali",
                !value && "bg-primary/10 font-semibold text-primary"
              )}
            >
              <span className="flex h-5 w-5 items-center justify-center">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </span>
              লেভেল ছাড়া রাখুন
            </button>
          )}

          {matches ? (
            matches.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground font-bengali">
                মেলেনি — অন্য শব্দে খুঁজুন
              </p>
            ) : (
              matches.map((n: StudyNodeDTO) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => pick(n.id)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-accent",
                    value === n.id && "bg-primary/10"
                  )}
                >
                  <span className="max-w-full truncate text-[13px] font-medium font-bengali">
                    {n.name}
                  </span>
                  <span className="max-w-full truncate text-[10px] text-muted-foreground font-bengali">
                    {studyNodePathOf(nodes, n.id)}
                  </span>
                </button>
              ))
            )
          ) : (
            <BadgeDrill
              badge={badge}
              allLabel="সব লেভেল"
              mode="picker"
              compact
              source="study"
              addLabel="নতুন সাবজেক্ট যোগ করুন"
              addChildLabel="এই লেভেলের নিচে যোগ করুন"
              onPickNode={(id) => id && pick(id)}
            />
          )}
        </div>
        {!matches && (
          <p className="mt-1.5 px-1 text-[10px] leading-4 text-muted-foreground/80 font-bengali">
            এটি আপনার স্টাডির নিজস্ব লেভেল সিস্টেম — কার্ডে ক্লিক করে ভেতরে যান, ✓ চেপে বাছুন, বা
            &quot;যোগ করুন&quot; দিয়ে নতুন লেভেল বানান। ড্যাশবোর্ডের নোড থেকে সম্পূর্ণ আলাদা।
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Leitner box → short Bengali label + color */
export function boxBadgeClass(box: number): string {
  switch (box) {
    case 5:
      return "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    case 4:
      return "bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/30";
    case 3:
      return "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30";
    case 2:
      return "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30";
    default:
      return "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30";
  }
}

export function formatDueDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays <= 0) return "আজ";
  if (diffDays === 1) return "আগামীকাল";
  const fmt = new Intl.DateTimeFormat("bn-BD", { day: "numeric", month: "short" });
  return fmt.format(d);
}

/* ------------------------------------------------------------------ */
/*  Mini action boxes — the 4 small boxes under every flashcard/MCQ    */
/*  (উত্তর · ব্যাখ্যা · 💜 প্রিয় · পরবর্তীতে পড়ুন)                     */
/*  Colorful 3D chips: icon-badge + label + gradient bottom bar,       */
/*  glow-ring when active, lift on hover.                              */
/* ------------------------------------------------------------------ */

const MINI_TONES = {
  emerald: {
    idle: "border-emerald-500/30 bg-gradient-to-b from-emerald-500/10 to-emerald-500/[0.04] text-emerald-700/85 dark:text-emerald-300/85",
    active:
      "border-emerald-500/60 bg-gradient-to-b from-emerald-500/25 to-teal-500/10 text-emerald-700 dark:text-emerald-200 ring-2 ring-emerald-500/40 shadow-[0_6px_18px_-6px_rgb(16_185_129/0.55)]",
    chip: "bg-emerald-500/20 text-emerald-600 dark:text-emerald-300",
    bar: "from-emerald-500 via-teal-400 to-emerald-500",
  },
  amber: {
    idle: "border-amber-500/30 bg-gradient-to-b from-amber-500/10 to-amber-500/[0.04] text-amber-700/85 dark:text-amber-300/85",
    active:
      "border-amber-500/60 bg-gradient-to-b from-amber-500/25 to-orange-500/10 text-amber-700 dark:text-amber-200 ring-2 ring-amber-500/40 shadow-[0_6px_18px_-6px_rgb(245_158_11/0.55)]",
    chip: "bg-amber-500/20 text-amber-600 dark:text-amber-300",
    bar: "from-amber-500 via-orange-400 to-amber-500",
  },
  violet: {
    idle: "border-violet-500/30 bg-gradient-to-b from-violet-500/10 to-violet-500/[0.04] text-violet-700/85 dark:text-violet-300/85",
    active:
      "border-violet-500/60 bg-gradient-to-b from-violet-500/25 to-fuchsia-500/10 text-violet-700 dark:text-violet-200 ring-2 ring-violet-500/40 shadow-[0_6px_18px_-6px_rgb(139_92_246/0.55)]",
    chip: "bg-violet-500/20 text-violet-600 dark:text-violet-300",
    bar: "from-violet-500 via-fuchsia-400 to-violet-500",
  },
  rose: {
    idle: "border-rose-500/30 bg-gradient-to-b from-rose-500/10 to-rose-500/[0.04] text-rose-700/85 dark:text-rose-300/85",
    active:
      "border-rose-500/60 bg-gradient-to-b from-rose-500/25 to-pink-500/10 text-rose-700 dark:text-rose-200 ring-2 ring-rose-500/40 shadow-[0_6px_18px_-6px_rgb(244_63_94/0.55)]",
    chip: "bg-rose-500/20 text-rose-600 dark:text-rose-300",
    bar: "from-rose-500 via-pink-400 to-rose-500",
  },
} as const;

export function MiniActionBox({
  label,
  icon,
  tone,
  active,
  disabled,
  onClick,
  ariaLabel,
}: {
  label: string;
  icon: React.ReactNode;
  tone: keyof typeof MINI_TONES;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  ariaLabel?: string;
}) {
  const t = MINI_TONES[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={ariaLabel ?? label}
      title={disabled ? `${label} নেই` : label}
      className={cn(
        "group relative flex min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border px-1 pb-2 pt-1.5 text-[10px] font-bold font-bengali transition-all duration-200",
        disabled
          ? "cursor-not-allowed border-dashed border-border/40 bg-transparent text-muted-foreground/35"
          : cn(
              "hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-[0.97]",
              active ? t.active : t.idle
            )
      )}
    >
      <span
        className={cn(
          "flex h-6 w-6 items-center justify-center rounded-lg transition-transform duration-200",
          !disabled && "group-hover:scale-110",
          disabled ? "bg-muted/50 text-muted-foreground/40" : t.chip
        )}
      >
        {icon}
      </span>
      <span className="w-full truncate text-center leading-none">{label}</span>
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-2.5 bottom-0 h-[3px] rounded-full bg-gradient-to-r transition-all duration-200",
          disabled ? "bg-muted/60" : t.bar,
          disabled ? "opacity-60" : active ? "opacity-100 shadow-[0_0_8px_rgb(0_0_0/0.15)]" : "opacity-35 group-hover:opacity-90"
        )}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  RevealAllButton — "এই নোডের সকল … দেখুন" (per-node reveal; the     */
/*  bank never auto-shows everything).                                 */
/* ------------------------------------------------------------------ */

export function RevealAllButton({
  label,
  sub,
  count,
  hueIndex,
  revealed,
  onToggle,
}: {
  label: string;
  sub: string;
  count: number;
  /** subject hue index for the gradient; null → neutral */
  hueIndex: number | null;
  revealed: boolean;
  onToggle: () => void;
}) {
  const hue = hueIndex !== null ? hueOf(hueIndex) : null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={revealed}
      className={cn(
        "group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl p-4 text-start text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl",
        hue ? hue.grad : "bg-gradient-to-r from-zinc-500 via-zinc-600 to-zinc-700"
      )}
    >
      <span className="pointer-events-none absolute -bottom-6 -right-4 h-24 w-24 rotate-12 rounded-full bg-white/10" />
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
        <Eye className="h-5 w-5" />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold font-bengali">{label}</span>
        <span className="block truncate text-[11px] text-white/85 font-bengali">{sub}</span>
      </span>
      <span className="relative flex shrink-0 items-center gap-1.5">
        <span className="rounded-full bg-white/25 px-2.5 py-1 text-xs font-bold font-bengali backdrop-blur-sm">
          {count} টি
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 backdrop-blur-sm transition-transform duration-300 group-hover:scale-105">
          <ChevronDown className={cn("h-4 w-4 transition-transform duration-300", revealed && "rotate-180")} />
        </span>
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  FlagChip — "💜 প্রিয়" / "পরবর্তীতে পড়ুন" filters above the banks   */
/* ------------------------------------------------------------------ */

export function FlagChip({
  icon,
  label,
  count,
  active,
  onClick,
  activeClass,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  activeClass: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-6 items-center gap-1 rounded-full border px-2 text-[11px] font-medium font-bengali transition-all",
        active
          ? activeClass
          : "border-border/60 text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {icon}
      {label}
      <span
        className={cn(
          "rounded-full px-1.5 text-[10px] font-bold",
          active ? "bg-white/25" : "bg-muted"
        )}
      >
        {count}
      </span>
    </button>
  );
}

export type { TreeNodeDTO };
