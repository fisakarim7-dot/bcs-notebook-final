"use client";

/**
 * 💜 প্রিয় হাব — every favorited item of the app in one place.
 * Notes, files, links, questions, topics (universal Favorite store) plus
 * flashcards/MCQs flagged 💜 in the revision banks. One click opens the item
 * in its workspace tab; links can also open directly in a new tab.
 */

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  fetchFavorites,
  fetchFlashcards,
  fetchMcqs,
} from "@/lib/bcs-api";
import { useBcsStore, type WorkspaceTab } from "@/lib/bcs-store";
import type { FavoriteDTO } from "@/lib/bcs-types";
import { toBn } from "@/lib/bcs-types";
import { cn } from "@/lib/utils";
import { FavButton } from "@/components/bcs/shared/fav-button";
import {
  ExternalLink,
  FileText,
  FolderOpen,
  Heart,
  HelpCircle,
  Layers,
  Link2,
  ListChecks,
  NotebookPen,
} from "lucide-react";

type FilterKey = "all" | "noteItem" | "document" | "link" | "question" | "node" | "card" | "mcq";

const KIND_META: Record<
  string,
  { label: string; tab: WorkspaceTab; icon: typeof FileText; chip: string }
> = {
  noteItem: { label: "নোট", tab: "notes", icon: NotebookPen, chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300 ring-violet-500/30" },
  document: { label: "ফাইল", tab: "docs", icon: FileText, chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300 ring-amber-500/30" },
  link: { label: "লিংক", tab: "links", icon: Link2, chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ring-emerald-500/30" },
  question: { label: "প্রশ্ন", tab: "questions", icon: HelpCircle, chip: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 ring-fuchsia-500/30" },
  node: { label: "টপিক", tab: "notes", icon: FolderOpen, chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300 ring-teal-500/30" },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "সব" },
  { key: "noteItem", label: "নোট" },
  { key: "document", label: "ফাইল" },
  { key: "link", label: "লিংক" },
  { key: "question", label: "প্রশ্ন" },
  { key: "node", label: "টপিক" },
  { key: "card", label: "কার্ড" },
  { key: "mcq", label: "MCQ" },
];

function metaOf(f: FavoriteDTO): { nodeId?: string; ext?: string; url?: string } {
  try {
    return JSON.parse(f.meta || "{}") as { nodeId?: string; ext?: string; url?: string };
  } catch {
    return {};
  }
}

export function FavoritesHub() {
  const openNodeTab = useBcsStore((s) => s.openNodeTab);
  const goStudy = useBcsStore((s) => s.goStudy);
  const [filter, setFilter] = useState<FilterKey>("all");

  const { data: favorites = [], isLoading } = useQuery({
    queryKey: ["favorites"],
    queryFn: fetchFavorites,
  });
  const { data: fcData } = useQuery({
    queryKey: ["flashcards"],
    queryFn: () => fetchFlashcards(),
    staleTime: 30_000,
  });
  const { data: mcqData } = useQuery({
    queryKey: ["mcqs"],
    queryFn: () => fetchMcqs(),
    staleTime: 30_000,
  });

  const favCards = useMemo(
    () => (fcData?.cards ?? []).filter((c) => c.favorite),
    [fcData]
  );
  const favMcqs = useMemo(
    () => (mcqData?.mcqs ?? []).filter((m) => m.favorite),
    [mcqData]
  );

  const filtered = useMemo(() => {
    if (filter === "all") return favorites;
    if (filter === "card" || filter === "mcq") return [];
    return favorites.filter((f) => f.kind === filter);
  }, [favorites, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: favorites.length };
    for (const f of favorites) c[f.kind] = (c[f.kind] ?? 0) + 1;
    c.card = favCards.length;
    c.mcq = favMcqs.length;
    return c;
  }, [favorites, favCards, favMcqs]);

  const openFav = (f: FavoriteDTO) => {
    const meta = metaOf(f);
    const kindMeta = KIND_META[f.kind];
    const nodeId = meta.nodeId ?? (f.kind === "node" ? f.targetId : null);
    if (nodeId) {
      openNodeTab(nodeId, kindMeta?.tab ?? "notes");
      return;
    }
    // no node linkage → best effort
    goStudy();
  };

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* hero header */}
      <div className="glass relative overflow-hidden rounded-2xl bg-gradient-to-r from-fuchsia-500/12 via-purple-500/10 to-violet-500/12 p-5">
        <div className="pointer-events-none absolute -right-6 -top-8 text-[120px] leading-none opacity-10">💜</div>
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight font-bengali">
          <Heart className="h-5 w-5 text-fuchsia-500" fill="currentColor" />
          প্রিয় সংগ্রহ
        </h1>
        <p className="mt-1 text-xs text-muted-foreground font-bengali">
          সব নোট, ফাইল, লিংক, প্রশ্ন ও টপিক যেগুলোতে আপনি 💜 চেপেছেন — এক জায়গায়
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Chip label={`সব ${toBn(counts.all ?? 0)}`} active={filter === "all"} onClick={() => setFilter("all")} />
          {(["noteItem", "document", "link", "question", "node"] as const).map((k) => (
            <Chip
              key={k}
              label={`${KIND_META[k].label} ${toBn(counts[k] ?? 0)}`}
              active={filter === k}
              onClick={() => setFilter(k)}
            />
          ))}
          <Chip label={`কার্ড ${toBn(counts.card ?? 0)}`} active={filter === "card"} onClick={() => setFilter("card")} />
          <Chip label={`MCQ ${toBn(counts.mcq ?? 0)}`} active={filter === "mcq"} onClick={() => setFilter("mcq")} />
        </div>
      </div>

      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground font-bengali">লোড হচ্ছে…</p>
      ) : filter === "card" || filter === "mcq" ? (
        <BankList
          kind={filter}
          cards={favCards.map((c) => ({ id: c.id, title: c.front, sub: c.back, path: c.nodePath ?? "" }))}
          mcqs={favMcqs.map((m) => ({ id: m.id, title: m.question, sub: `${m.options.length} অপশন`, path: m.nodePath ?? "" }))}
          onOpen={goStudy}
        />
      ) : filtered.length === 0 ? (
        <div className="glass flex flex-col items-center gap-2 rounded-2xl p-12 text-center">
          <Heart className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium font-bengali">এই ফিল্টারে কোনো প্রিয় নেই</p>
          <p className="text-xs text-muted-foreground font-bengali">
            যেকোনো নোট, ফাইল, লিংক, প্রশ্ন বা টপিকের পাশের 💜 বোতামে চাপ দিন — সেগুলো এখানে জমা হবে
          </p>
        </div>
      ) : (
        <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((f) => {
            const meta = KIND_META[f.kind] ?? KIND_META.nodeItem;
            const Icon = meta.icon;
            const m = metaOf(f);
            return (
              <li key={f.id} className="min-w-0">
                <div className="glass group flex h-full items-start gap-2.5 rounded-xl p-3 transition-all duration-200 hover:border-fuchsia-400/40 hover:shadow-[0_0_14px_var(--glow)]">
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1", meta.chip)}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <button onClick={() => openFav(f)} className="min-w-0 flex-1 text-start" aria-label={`খুলুন: ${f.title}`}>
                    <p className="truncate text-[13px] font-semibold font-bengali">{f.title || "শিরোনামহীন"}</p>
                    <p className="truncate text-[11px] text-muted-foreground font-bengali" title={f.path}>
                      {f.path || meta.label}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-center gap-0.5">
                    {f.kind === "link" && m.url && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <a
                            href={m.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="লিংক নতুন ট্যাবে খুলুন"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </TooltipTrigger>
                        <TooltipContent className="font-bengali">নতুন ট্যাবে খুলুন</TooltipContent>
                      </Tooltip>
                    )}
                    <FavButton
                      kind={f.kind}
                      targetId={f.targetId}
                      title={f.title}
                      path={f.path}
                      meta={m}
                      label={meta.label}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-7 items-center gap-1 rounded-full px-3 text-xs font-medium font-bengali transition-all",
        active
          ? "bg-fuchsia-500 text-white shadow-sm"
          : "glass text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}

function BankList({
  kind,
  cards,
  mcqs,
  onOpen,
}: {
  kind: "card" | "mcq";
  cards: { id: string; title: string; sub: string; path: string }[];
  mcqs: { id: string; title: string; sub: string; path: string }[];
  onOpen: () => void;
}) {
  const items = kind === "card" ? cards : mcqs;
  if (items.length === 0) {
    return (
      <div className="glass flex flex-col items-center gap-2 rounded-2xl p-12 text-center">
        {kind === "card" ? (
          <Layers className="h-10 w-10 text-muted-foreground/40" />
        ) : (
          <ListChecks className="h-10 w-10 text-muted-foreground/40" />
        )}
        <p className="text-sm font-medium font-bengali">কোনো প্রিয় {kind === "card" ? "ফ্ল্যাশকার্ড" : "MCQ"} নেই</p>
        <p className="text-xs text-muted-foreground font-bengali">রিভিশন ব্যাংকে কার্ডের 💜 বাক্স ব্যবহার করুন</p>
      </div>
    );
  }
  return (
    <div>
      <Button variant="outline" size="sm" className="mb-3 gap-1.5 font-bengali" onClick={onOpen}>
        {kind === "card" ? "ফ্ল্যাশকার্ড ব্যাংকে খুলুন" : "MCQ ব্যাংকে খুলুন"}
      </Button>
      <ul className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {items.map((it) => (
          <li key={it.id}>
            <div className="glass flex h-full items-start gap-2.5 rounded-xl p-3">
              <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1", kind === "card" ? KIND_META.noteItem.chip : "bg-rose-500/15 text-rose-700 dark:text-rose-300 ring-rose-500/30")}>
                {kind === "card" ? <Layers className="h-4 w-4" /> : <ListChecks className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold font-bengali">{it.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">{it.sub}</p>
                {it.path && <Badge variant="outline" className="mt-1 max-w-full truncate text-[9px] font-bengali">{it.path}</Badge>}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
