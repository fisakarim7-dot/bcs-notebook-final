"use client";

// ---------- Tag System (#14) UI ----------
// Colored hashtag chips + editor (dialog / inline field) + filter row.
// Tags normalize on save (server): strip "#", dedupe, cap 12×24 chars.

import { useMemo, useState } from "react";
import { Hash, Plus, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DEFAULT_TAG_SUGGESTIONS, tagHueIndex } from "@/lib/bcs-tags";
import type { McqDTO } from "@/lib/bcs-types";
import { cn } from "@/lib/utils";

/* pastel tone pool — stable color per tag name */
const TAG_TONES = [
  "border-emerald-500/45 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  "border-amber-500/45 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  "border-rose-500/45 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  "border-violet-500/45 bg-violet-500/10 text-violet-700 dark:text-violet-300",
  "border-teal-500/45 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  "border-fuchsia-500/45 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300",
  "border-orange-500/45 bg-orange-500/10 text-orange-700 dark:text-orange-300",
  "border-lime-500/45 bg-lime-500/10 text-lime-700 dark:text-lime-300",
];

export function tagTone(tag: string): string {
  return TAG_TONES[tagHueIndex(tag, TAG_TONES.length)];
}

/** one small colored hashtag chip */
export function TagChip({
  tag,
  active = false,
  onClick,
  onRemove,
  size = "sm",
}: {
  tag: string;
  active?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  size?: "sm" | "xs";
}) {
  const base = cn(
    "inline-flex max-w-full items-center gap-0.5 rounded-full border font-medium transition-all",
    size === "sm" ? "px-2 py-0.5 text-[10.5px]" : "px-1.5 py-px text-[10px]",
    tagTone(tag),
    active && "ring-2 ring-offset-1 ring-offset-background ring-current",
    onClick && "hover:brightness-105 hover:shadow-sm cursor-pointer",
  );
  const inner = (
    <>
      <Hash className={size === "sm" ? "h-2.5 w-2.5 shrink-0" : "h-2 w-2 shrink-0"} />
      <span className="truncate">{tag}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`ট্যাগ ${tag} সরান`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 shrink-0 rounded-full p-px transition-colors hover:bg-foreground/10"
        >
          <X className="h-2.5 w-2.5" />
        </button>
      )}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={base}>
        {inner}
      </button>
    );
  }
  return <span className={base}>{inner}</span>;
}

/** frequency-sorted unique tags from the bank + built-in suggestions */
export function useTagSuggestions(mcqs: McqDTO[]): string[] {
  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of mcqs) {
      for (const t of m.tags ?? []) {
        const key = t.toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const display = new Map<string, string>();
    for (const m of mcqs) for (const t of m.tags ?? []) display.set(t.toLowerCase(), t);
    const sorted = [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k]) => display.get(k) ?? k);
    const have = new Set(sorted.map((s) => s.toLowerCase()));
    for (const d of DEFAULT_TAG_SUGGESTIONS) {
      if (!have.has(d.toLowerCase())) sorted.push(d);
    }
    return sorted;
  }, [mcqs]);
}

/** add a tag to a local list (normalize + dedupe, client-side soft cap) */
export function addTagLocal(list: string[], raw: string): { list: string[]; error?: string } {
  const t = raw
    .replace(/^#+/, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);
  if (!t) return { list, error: "ট্যাগ খালি রাখা যাবে না" };
  if (list.some((x) => x.toLowerCase() === t.toLowerCase())) return { list };
  if (list.length >= 12) return { list, error: "সর্বোচ্চ ১২টি ট্যাগ" };
  return { list: [...list, t] };
}

/* ---------- inline editor (used inside the create/edit form) ---------- */

export function TagEditorField({
  value,
  onChange,
  suggestions,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions: string[];
}) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    if (!draft.trim()) return;
    const res = addTagLocal(value, draft);
    if (res.error) setError(res.error);
    else {
      onChange(res.list);
      setDraft("");
      setError(null);
    }
  };

  const remaining = suggestions.filter(
    (s) => !value.some((v) => v.toLowerCase() === s.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/70 bg-muted/30 p-3">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((t) => (
            <TagChip
              key={t}
              tag={t}
              onRemove={() => onChange(value.filter((v) => v !== t))}
            />
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="ট্যাগ লিখুন — যেমন Economy"
          aria-label="নতুন ট্যাগ"
          className="h-8 text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1 px-2.5 text-xs"
          onClick={commit}
        >
          <Plus className="h-3.5 w-3.5" /> যোগ
        </Button>
      </div>
      {error && <p className="text-[11px] font-medium text-red-500">{error}</p>}
      {remaining.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {remaining.slice(0, 10).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                const res = addTagLocal(value, s);
                if (!res.error) onChange(res.list);
              }}
              className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-border/80 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <Plus className="h-2.5 w-2.5" /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- per-question editor dialog (from card / viewer) ---------- */

export function TagEditDialog({
  open,
  onOpenChange,
  mcq,
  suggestions,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  mcq: McqDTO | null;
  suggestions: string[];
  onSaved: (tags: string[]) => void;
}) {
  const [tags, setTags] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = tags ?? mcq?.tags ?? [];
  // reset local draft each time a different question opens
  const [prevId, setPrevId] = useState<string | null>(mcq?.id ?? null);
  if (prevId !== (mcq?.id ?? null)) {
    setPrevId(mcq?.id ?? null);
    setTags(null);
    setError(null);
  }

  const commit = async () => {
    if (!mcq) return;
    setSaving(true);
    setError(null);
    try {
      await onSaved(current);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "সংরক্ষণ করা যায়নি");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass-strong sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bengali">
            <Tag className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> ট্যাগ সম্পাদনা
          </DialogTitle>
          <DialogDescription className="line-clamp-2 font-bengali">
            {mcq?.question.slice(0, 110) ?? ""}
          </DialogDescription>
        </DialogHeader>
        <TagEditorField value={current} onChange={setTags} suggestions={suggestions} />
        {error && <p className="text-xs font-medium text-red-500">{error}</p>}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="font-bengali">
            বাতিল
          </Button>
          <Button onClick={commit} disabled={saving} className="gap-1.5 font-bengali">
            {saving && (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
            )}
            সংরক্ষণ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------- bank-level filter row ---------- */

export function TagFilterRow({
  counts,
  selected,
  onSelect,
}: {
  counts: { tag: string; count: number }[];
  selected: string | null;
  onSelect: (tag: string | null) => void;
}) {
  if (counts.length === 0) return null;
  return (
    <div
      className="flex items-center gap-1.5 overflow-x-auto scroll-slim rounded-xl border border-border/60 bg-muted/30 px-2.5 py-2"
      role="group"
      aria-label="ট্যাগ ফিল্টার"
    >
      <span className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-muted-foreground font-bengali">
        <Tag className="h-3 w-3" /> ট্যাগ:
      </span>
      {counts.map(({ tag, count }) => (
        <TagChip
          key={tag}
          tag={`${tag} ${count}`}
          active={selected === tag}
          onClick={() => onSelect(selected === tag ? null : tag)}
          size="xs"
        />
      ))}
      {selected && (
        <button
          onClick={() => onSelect(null)}
          className="ml-1 shrink-0 rounded-full border border-border/70 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground font-bengali"
        >
          ✕ সব
        </button>
      )}
    </div>
  );
}
