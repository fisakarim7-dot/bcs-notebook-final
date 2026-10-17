"use client";

import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check,
  ChevronRight,
  FolderOpen,
  GraduationCap,
  Layers,
  Loader2,
  MoreVertical,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import {
  createStudyNode,
  deleteStudyNode,
  fetchStudyTree,
  fetchTree,
  renameStudyNode,
} from "@/lib/bcs-api";
import { toBn, type StudyNodeDTO, type TreeNodeDTO } from "@/lib/bcs-types";
import type { TreeNodeWithChildren } from "@/lib/bcs-tree-utils";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface BadgeItem {
  id: string;
  nodeId: string | null;
}

/** Which hierarchy the badges browse — the dashboard tree, or the
 *  INDEPENDENT study tree (ফ্ল্যাশকার্ড ও MCQ ব্যাংকের নিজস্ব লেভেল). */
export type BadgeSource = "tree" | "study";

export const ALL = "__all__";
export const UNATTACHED = "__none__";

/* ------------------------------------------------------------------ */
/*  Colorful hue palette — 8 families, NO blue/indigo.                 */
/*  Every class string is written literally so Tailwind can see it.    */
/* ------------------------------------------------------------------ */

export interface Hue {
  /** strong identity gradient (level-1 subject cards) */
  grad: string;
  /** slightly lighter gradient (level-2 cards) */
  grad2: string;
  /** tinted card, strong (level-2) */
  card2: string;
  /** tinted card, soft (level 3+) */
  card3: string;
  /** solid color dot / stripe */
  dot: string;
  /** colored text (icons, chevrons) */
  text: string;
  /** selection ring */
  ring: string;
  /** small count chip on tinted cards */
  chip: string;
  /** soft row hover */
  hover: string;
}

export const HUES: Hue[] = [
  {
    grad: "bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700",
    grad2: "bg-gradient-to-br from-emerald-400 via-emerald-500 to-teal-600",
    card2: "border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200",
    card3: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    ring: "ring-emerald-500/40",
    chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    hover: "hover:bg-emerald-500/10",
  },
  {
    grad: "bg-gradient-to-br from-violet-500 via-purple-600 to-purple-700",
    grad2: "bg-gradient-to-br from-violet-400 via-purple-500 to-purple-600",
    card2: "border-violet-500/50 bg-violet-500/15 text-violet-800 dark:text-violet-200",
    card3: "border-violet-500/30 bg-violet-500/10 text-violet-800 dark:text-violet-200",
    dot: "bg-violet-500",
    text: "text-violet-600 dark:text-violet-400",
    ring: "ring-violet-500/40",
    chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
    hover: "hover:bg-violet-500/10",
  },
  {
    grad: "bg-gradient-to-br from-amber-500 via-orange-500 to-orange-600",
    grad2: "bg-gradient-to-br from-amber-400 via-orange-400 to-orange-500",
    card2: "border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200",
    card3: "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/40",
    chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    hover: "hover:bg-amber-500/10",
  },
  {
    grad: "bg-gradient-to-br from-rose-500 via-rose-600 to-red-600",
    grad2: "bg-gradient-to-br from-rose-400 via-rose-500 to-red-500",
    card2: "border-rose-500/50 bg-rose-500/15 text-rose-800 dark:text-rose-200",
    card3: "border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200",
    dot: "bg-rose-500",
    text: "text-rose-600 dark:text-rose-400",
    ring: "ring-rose-500/40",
    chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    hover: "hover:bg-rose-500/10",
  },
  {
    grad: "bg-gradient-to-br from-teal-500 via-teal-600 to-cyan-700",
    grad2: "bg-gradient-to-br from-teal-400 via-teal-500 to-cyan-600",
    card2: "border-teal-500/50 bg-teal-500/15 text-teal-800 dark:text-teal-200",
    card3: "border-teal-500/30 bg-teal-500/10 text-teal-800 dark:text-teal-200",
    dot: "bg-teal-500",
    text: "text-teal-600 dark:text-teal-400",
    ring: "ring-teal-500/40",
    chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
    hover: "hover:bg-teal-500/10",
  },
  {
    grad: "bg-gradient-to-br from-fuchsia-500 via-fuchsia-600 to-pink-600",
    grad2: "bg-gradient-to-br from-fuchsia-400 via-fuchsia-500 to-pink-500",
    card2: "border-fuchsia-500/50 bg-fuchsia-500/15 text-fuchsia-800 dark:text-fuchsia-200",
    card3: "border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-800 dark:text-fuchsia-200",
    dot: "bg-fuchsia-500",
    text: "text-fuchsia-600 dark:text-fuchsia-400",
    ring: "ring-fuchsia-500/40",
    chip: "bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300",
    hover: "hover:bg-fuchsia-500/10",
  },
  {
    grad: "bg-gradient-to-br from-orange-500 via-amber-600 to-yellow-600",
    grad2: "bg-gradient-to-br from-orange-400 via-amber-500 to-yellow-500",
    card2: "border-orange-500/50 bg-orange-500/15 text-orange-800 dark:text-orange-200",
    card3: "border-orange-500/30 bg-orange-500/10 text-orange-800 dark:text-orange-200",
    dot: "bg-orange-500",
    text: "text-orange-600 dark:text-orange-400",
    ring: "ring-orange-500/40",
    chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
    hover: "hover:bg-orange-500/10",
  },
  {
    grad: "bg-gradient-to-br from-lime-500 via-lime-600 to-green-700",
    grad2: "bg-gradient-to-br from-lime-400 via-lime-500 to-green-600",
    card2: "border-lime-500/50 bg-lime-500/15 text-lime-800 dark:text-lime-200",
    card3: "border-lime-500/30 bg-lime-500/10 text-lime-800 dark:text-lime-200",
    dot: "bg-lime-500",
    text: "text-lime-600 dark:text-lime-400",
    ring: "ring-lime-500/40",
    chip: "bg-lime-500/15 text-lime-700 dark:text-lime-300",
    hover: "hover:bg-lime-500/10",
  },
];

export const hueOf = (i: number) => HUES[((i % HUES.length) + HUES.length) % HUES.length];

/* ------------------------------------------------------------------ */
/*  Filter logic — mirrors the tree, aggregates counts per subtree,    */
/*  and maps every node to its root subject hue.                       */
/* ------------------------------------------------------------------ */

export function useBadgeFilter<T extends BadgeItem>(
  items: T[],
  opts?: {
    /** "tree" (default) = dashboard tree; "study" = independent study tree */
    source?: BadgeSource;
    /** which item field holds the node id (default: "nodeId"; study banks pass "studyNodeId") */
    idField?: string;
  }
) {
  const source = opts?.source ?? "tree";

  // string field name → stable identity across renders (function props would
  // break React-Compiler memoization)
  const idField = opts?.idField ?? "nodeId";
  const getId = useCallback(
    (it: T) => ((it as unknown as Record<string, string | null>)[idField] ?? null),
    [idField]
  );

  const { data: rawNodes = [] } = useQuery<TreeNodeDTO[] | StudyNodeDTO[]>({
    queryKey: source === "study" ? ["study-tree"] : ["tree"],
    queryFn: source === "study" ? fetchStudyTree : fetchTree,
  });

  // StudyNodeDTO lacks `type` — give it a synthetic "folder" type so the
  // shared tree-shape utilities keep working unchanged.
  const nodes = useMemo<TreeNodeDTO[]>(() => {
    if (source === "study") {
      return (rawNodes as StudyNodeDTO[]).map((n) => ({
        ...n,
        type: "folder" as const,
      }));
    }
    return rawNodes as TreeNodeDTO[];
  }, [rawNodes, source]);

  const [selected, setSelected] = useState<string>(ALL);

  const tree = useMemo(() => {
    const byId = new Map<string, TreeNodeWithChildren>();
    nodes.forEach((n) => byId.set(n.id, { ...n, children: [], depth: 1 }));
    const roots: TreeNodeWithChildren[] = [];
    byId.forEach((node) => {
      if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
      else roots.push(node);
    });
    const depth = (list: TreeNodeWithChildren[], d: number) =>
      list.forEach((n) => {
        n.depth = d;
        depth(n.children, d + 1);
      });
    depth(roots, 1);
    return { roots, byId };
  }, [nodes]);

  /** subtree-aggregated counts for every node + total + unattached */
  const counts = useMemo(() => {
    const direct = new Map<string, number>();
    let unattached = 0;
    for (const it of items) {
      const id = getId(it);
      if (!id) unattached += 1;
      else direct.set(id, (direct.get(id) ?? 0) + 1);
    }
    const agg = new Map<string, number>();
    const walk = (n: TreeNodeWithChildren): number => {
      let sum = direct.get(n.id) ?? 0;
      for (const c of n.children) sum += walk(c);
      agg.set(n.id, sum);
      return sum;
    };
    tree.roots.forEach(walk);
    return { agg, unattached };
  }, [items, tree, getId]);

  /** nodeId → root subject index (for hue-tinted item boxes) */
  const rootHue = useMemo(() => {
    const map = new Map<string, number>();
    tree.roots.forEach((root, i) => {
      const stack = [root];
      while (stack.length) {
        const n = stack.pop()!;
        map.set(n.id, i);
        n.children.forEach((c) => stack.push(c));
      }
    });
    return map;
  }, [tree]);

  const subtreeIds = useMemo(() => {
    const ids = new Set<string>();
    const stack: TreeNodeWithChildren[] = [];
    const start =
      selected !== ALL && selected !== UNATTACHED ? (tree.byId.get(selected) ?? null) : null;
    if (start) stack.push(start);
    while (stack.length) {
      const n = stack.pop()!;
      ids.add(n.id);
      n.children.forEach((c) => stack.push(c));
    }
    return ids;
  }, [selected, tree]);

  const filtered = useMemo(() => {
    if (selected === ALL) return items;
    if (selected === UNATTACHED) return items.filter((it) => !getId(it));
    return items.filter((it) => {
      const id = getId(it);
      return id != null && subtreeIds.has(id);
    });
  }, [items, selected, subtreeIds, getId]);

  const selectedPath = useMemo(() => {
    const n = selected !== ALL && selected !== UNATTACHED ? tree.byId.get(selected) : null;
    if (!n) return null;
    const names: string[] = [];
    let cur: TreeNodeWithChildren | undefined = n;
    while (cur) {
      names.unshift(cur.name);
      cur = cur.parentId ? tree.byId.get(cur.parentId) : undefined;
    }
    return names.join(" / ");
  }, [selected, tree]);

  return {
    nodes,
    roots: tree.roots,
    byId: tree.byId,
    selected,
    setSelected: setSelected as (id: string) => void,
    filtered,
    counts: counts.agg,
    unattached: counts.unattached,
    total: items.length,
    selectedPath,
    hueIndexOf: (nodeId: string | null) => (nodeId ? (rootHue.get(nodeId) ?? null) : null),
  };
}

export type BadgeFilterBag<T extends BadgeItem> = ReturnType<typeof useBadgeFilter<T>>;

/**
 * A badge bag controlled by an external value — used by node pickers where
 * the selection lives in a form field, not in the navigator itself.
 */
export function useControlledBadgeBag<T extends BadgeItem>(
  value: string | null,
  onChange: (id: string | null) => void,
  opts?: { source?: BadgeSource }
): BadgeFilterBag<T> {
  const base = useBadgeFilter<T>([], opts);
  return useMemo(
    () => ({
      ...base,
      selected: value ?? ALL,
      setSelected: (id: string) => onChange(id === ALL || id === UNATTACHED ? null : id),
    }),
    [base, base.nodes, value, onChange]
  );
}

/* ------------------------------------------------------------------ */
/*  BadgeDrill — the colorful drill-down badge navigator.              */
/*  Subject gradient cards (like the revision launcher) → level-2      */
/*  gradient cards → soft tinted cards … down to level 6.              */
/*                                                                     */
/*  mode="filter": clicking a card filters AND drills deeper.          */
/*  mode="picker" : clicking a card only drills; the small ✓ button    */
/*                  picks that node (used by create/edit forms).       */
/* ------------------------------------------------------------------ */

export function BadgeDrill({
  badge,
  allLabel,
  emptyLabel,
  mode = "filter",
  onPickNode,
  className,
  compact = false,
  source = "tree",
  addLabel = "নতুন সাবজেক্ট যোগ করুন",
  addChildLabel = "এই লেভেলের নিচে যোগ করুন",
}: {
  badge: BadgeFilterBag<BadgeItem>;
  allLabel: string;
  emptyLabel?: string;
  mode?: "filter" | "picker";
  onPickNode?: (id: string) => void;
  className?: string;
  compact?: boolean;
  /** "study" enables the self-managed level system (add / rename / delete) */
  source?: BadgeSource;
  addLabel?: string;
  addChildLabel?: string;
}) {
  const canManage = source === "study";
  const qc = useQueryClient();

  // ---- study-tree management state (only active when canManage) ----
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [renaming, setRenaming] = useState<TreeNodeWithChildren | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TreeNodeWithChildren | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  // filter mode: path derived from selection (always in sync).
  const derivedPath = useMemo(() => {
    if (!badge.selected || badge.selected === ALL || badge.selected === UNATTACHED) return [];
    const ids: string[] = [];
    let cur = badge.byId.get(badge.selected);
    while (cur) {
      ids.unshift(cur.id);
      cur = cur.parentId ? badge.byId.get(cur.parentId) : undefined;
    }
    return ids;
  }, [badge.selected, badge.byId]);

  // picker mode: local drill path (selection happens via ✓, so the drill
  // position is independent of the chosen node).
  const [localPath, setLocalPath] = useState<string[] | null>(null);
  const path = mode === "picker" && localPath ? localPath : derivedPath;

  const tail = path.length ? (badge.byId.get(path[path.length - 1]) ?? null) : null;
  const levelNodes: TreeNodeWithChildren[] = tail ? tail.children : badge.roots;
  const showCounts = badge.total > 0;

  // ---- study-tree manage mutations (after `tail` so they can read it) ----
  const invalidateStudy = () => {
    qc.invalidateQueries({ queryKey: ["study-tree"] });
    qc.invalidateQueries({ queryKey: ["flashcards"] });
    qc.invalidateQueries({ queryKey: ["mcqs"] });
  };

  const addLevel = useMutation({
    mutationFn: (name: string) =>
      createStudyNode({ name, parentId: tail?.id ?? null }),
    onSuccess: (n) => {
      toast.success(`যোগ হয়েছে: ${n.name}`);
      setAddName("");
      setAddOpen(false);
      invalidateStudy();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameLevel = useMutation({
    mutationFn: (input: { id: string; name: string }) =>
      renameStudyNode(input.id, input.name),
    onSuccess: () => {
      toast.success("নাম বদলানো হয়েছে");
      setRenaming(null);
      invalidateStudy();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteLevel = useMutation({
    mutationFn: (id: string) => deleteStudyNode(id),
    onSuccess: () => {
      toast.success("লেভেল মুছে ফেলা হয়েছে — কার্ড/MCQ অক্ষত (লেভেল ছাড়া বাকেটে)");
      setDeleteTarget(null);
      invalidateStudy();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clickCard = (node: TreeNodeWithChildren) => {
    if (mode === "picker") {
      setLocalPath((p) => {
        const base = p ?? derivedPath;
        return node.children.length > 0 ? [...base, node.id] : base;
      });
    } else {
      badge.setSelected(node.id);
    }
  };

  const jump = (idx: number) => {
    const next = idx < 0 ? [] : path.slice(0, idx + 1);
    if (mode === "picker") {
      setLocalPath(next);
      onPickNode?.(next.length ? next[next.length - 1] : "");
      return;
    }
    badge.setSelected(next.length ? next[next.length - 1] : ALL);
  };

  const breadcrumb: { id: string | null; name: string }[] = [
    { id: null, name: allLabel },
    ...path.map((id) => ({ id, name: badge.byId.get(id)?.name ?? "…" })),
  ];

  return (
    <>
    <div className={cn("flex flex-col gap-2", className)}>
      {/* breadcrumb trail */}
      <div className="flex flex-wrap items-center gap-1" role="navigation" aria-label="ব্যাজ লেভেল">
        {breadcrumb.map((b, i) => (
          <span key={b.id ?? "root"} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground/60" />}
            <button
              onClick={() => jump(i - 1)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-medium font-bengali transition-all",
                i === breadcrumb.length - 1
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {b.name}
            </button>
          </span>
        ))}
      </div>

      {/* the colorful badge grid */}
      {levelNodes.length === 0 ? (
        <>
          <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-[11px] text-muted-foreground font-bengali">
            {mode === "picker"
              ? "এখানে আর কোনো সাব-নোড নেই — উপরের লেভেলের ✓ দিয়ে বাছুন।"
              : canManage
                ? badge.roots.length === 0
                  ? "এখনো কোনো লেভেল নেই — আপনার নিজের সাবজেক্ট বানান (ড্যাশবোর্ডের ট্রি থেকে সম্পূর্ণ আলাদা)।"
                  : "এই লেভেলে আর কোনো সাব-লেভেল নেই — নিচের বাটনে যোগ করুন।"
                : "এই লেভেলে আর কোনো সাব-নোড নেই।"}
          </p>
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setAddName("");
                setAddOpen(true);
              }}
              className="flex w-full min-h-[52px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-primary/40 bg-primary/[0.04] p-3 text-[12px] font-semibold text-primary transition-all hover:bg-primary/10 font-bengali"
            >
              <Plus className="h-4 w-4" />
              {tail ? addChildLabel : addLabel}
            </button>
          )}
        </>
      ) : (
        <div className={cn("grid gap-2", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-4")}>
          {levelNodes.map((node) => {
            const rootIdx = badge.hueIndexOf(node.id) ?? 0;
            const hue = hueOf(rootIdx);
            const depth = node.depth || pathDepth(badge.byId, node);
            const count = badge.counts.get(node.id) ?? 0;
            const Icon =
              node.type === "note" ? StickyNote : depth <= 1 ? GraduationCap : depth === 2 ? Layers : FolderOpen;
            const active = badge.selected === node.id;
            const hasKids = node.children.length > 0;
            return (
              <div
                key={node.id}
                className={cn(
                  "group relative flex items-center gap-2 overflow-hidden rounded-xl border p-2.5 transition-all duration-200",
                  "hover:-translate-y-0.5 hover:shadow-md",
                  depth === 1
                    ? cn(hue.grad, "border-transparent text-white shadow-sm", active && "ring-2 ring-white/70 ring-offset-1 ring-offset-transparent")
                    : depth === 2
                      ? cn(hue.card2, "shadow-sm", active && cn("ring-2", hue.ring))
                      : cn(hue.card3, active && cn("ring-2", hue.ring)),
                  count === 0 && depth > 1 && !active && "opacity-70"
                )}
              >
                <button
                  onClick={() => clickCard(node)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-start"
                  title={hasKids ? `${node.name} — ভেতরে যান` : node.name}
                  aria-label={node.name}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
                      depth === 1 ? "bg-white/20" : hue.chip
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-semibold font-bengali leading-5">
                      {node.name}
                    </span>
                    <span
                      className={cn(
                        "block text-[10px] font-medium",
                        depth === 1 ? "text-white/80" : "opacity-70"
                      )}
                    >
                      {hasKids ? `${toBn(node.children.length)} শাখা` : ""}
                      {hasKids && showCounts ? " · " : ""}
                      {showCounts ? `${toBn(count)} টি` : ""}
                      {!hasKids && !showCounts ? "নোড" : ""}
                    </span>
                  </span>
                  {hasKids && (
                    <ChevronRight
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5",
                        depth === 1 ? "text-white/80" : "opacity-60"
                      )}
                    />
                  )}
                </button>
                {mode === "picker" && (
                  <span
                    role="button"
                    tabIndex={0}
                    aria-label={`${node.name} বাছুন`}
                    title={`${node.name} বাছুন`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPickNode?.(node.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        onPickNode?.(node.id);
                      }
                    }}
                    className={cn(
                      "flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all",
                      depth === 1
                        ? "bg-white/25 text-white hover:bg-white/40"
                        : cn(hue.chip, "hover:brightness-95"),
                      active && "bg-white text-white!"
                    )}
                  >
                    <Check className="h-3.5 w-3.5" />
                  </span>
                )}
                {canManage && mode === "filter" && (
                  <Popover open={menuOpenId === node.id} onOpenChange={(o) => setMenuOpenId(o ? node.id : null)}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        aria-label={`${node.name} ম্যানেজ করুন`}
                        title="নাম বদল বা মুছে ফেলুন"
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-all",
                          depth === 1
                            ? "text-white/80 hover:bg-white/25 hover:text-white"
                            : "text-muted-foreground/70 hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-44 p-1" side="bottom" align="end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-2 font-bengali"
                        onClick={() => {
                          setMenuOpenId(null);
                          setRenameName(node.name);
                          setRenaming(node);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> নাম বদলান
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-2 font-bengali text-destructive hover:text-destructive"
                        onClick={() => {
                          setMenuOpenId(null);
                          setDeleteTarget(node);
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> লেভেল মুছুন
                      </Button>
                    </PopoverContent>
                  </Popover>
                )}
              </div>
            );
          })}
          {/* self-managed study tree: add a new subject / sub-level right here */}
          {canManage && (
            <button
              type="button"
              onClick={() => {
                setAddName("");
                setAddOpen(true);
              }}
              className="flex min-h-[46px] items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/70 p-2.5 text-[11.5px] font-medium text-muted-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary font-bengali"
            >
              <Plus className="h-3.5 w-3.5" />
              {tail ? addChildLabel : addLabel}
            </button>
          )}
        </div>
      )}

      {/* নোড ছাড়া bucket */}
      {emptyLabel && badge.unattached > 0 && mode === "filter" && (
        <button
          onClick={() => badge.setSelected(UNATTACHED)}
          aria-pressed={badge.selected === UNATTACHED}
          className={cn(
            "flex w-fit items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium font-bengali transition-all",
            badge.selected === UNATTACHED
              ? "border-primary/50 bg-primary/10 text-primary"
              : "border-border/60 text-muted-foreground hover:bg-accent"
          )}
        >
          <X className="h-3 w-3" /> {emptyLabel}
          <span className="rounded-full bg-muted px-1.5 text-[10px] font-bold">{toBn(badge.unattached)}</span>
        </button>
      )}
    </div>

    {/* ---- self-managed study tree dialogs ---- */}

    {/* add a level (subject at root, sub-level under the current tail) */}
    <Dialog open={addOpen} onOpenChange={setAddOpen}>
      <DialogContent className="glass-strong sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-bengali">
            {tail ? "নতুন সাব-লেভেল যোগ করুন" : "নতুন সাবজেক্ট যোগ করুন"}
          </DialogTitle>
          <DialogDescription className="font-bengali">
            {tail
              ? `যোগ হবে: "${tail.name}"-এর নিচে। এটি স্টাডি সেকশনের নিজস্ব লেভেল — ড্যাশবোর্ডের নোড থেকে সম্পূর্ণ স্বাধীন।`
              : "এটি স্টাডি ট্রির মূল স্তরে (সাবজেক্ট) যুক্ত হবে — শুধু এই স্টাডি সেকশনের নিজস্ব লেভেল, ড্যাশবোর্ডের ট্রি থেকে সম্পূর্ণ আলাদা।"}
          </DialogDescription>
        </DialogHeader>
        <Input
          value={addName}
          onChange={(e) => setAddName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && addName.trim() && !addLevel.isPending) {
              addLevel.mutate(addName.trim());
            }
          }}
          placeholder="লেভেলের নাম লিখুন…"
          aria-label="লেভেলের নাম"
          autoFocus
          maxLength={200}
          className="font-bengali"
        />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setAddOpen(false)} className="font-bengali">
            বাতিল
          </Button>
          <Button
            onClick={() => addName.trim() && addLevel.mutate(addName.trim())}
            disabled={!addName.trim() || addLevel.isPending}
            className="gap-1.5 font-bengali"
          >
            {addLevel.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            যোগ করুন
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* rename a level */}
    <Dialog open={!!renaming} onOpenChange={(o) => !o && setRenaming(null)}>
      <DialogContent className="glass-strong sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-bengali">লেভেলের নাম বদলান</DialogTitle>
          <DialogDescription className="font-bengali">
            নাম বদলালে এই লেভেলে সংযুক্ত কার্ড/MCQ অপরিবর্তিত থাকবে।
          </DialogDescription>
        </DialogHeader>
        <Input
          value={renameName}
          onChange={(e) => setRenameName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && renameName.trim() && !renameLevel.isPending && renaming) {
              renameLevel.mutate({ id: renaming.id, name: renameName.trim() });
            }
          }}
          aria-label="নতুন নাম"
          autoFocus
          maxLength={200}
          className="font-bengali"
        />
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setRenaming(null)} className="font-bengali">
            বাতিল
          </Button>
          <Button
            onClick={() => renaming && renameName.trim() && renameLevel.mutate({ id: renaming.id, name: renameName.trim() })}
            disabled={!renameName.trim() || renameLevel.isPending}
            className="gap-1.5 font-bengali"
          >
            {renameLevel.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            সংরক্ষণ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* delete a level (whole sub-tree; cards/MCQs get detached, not deleted) */}
    <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
      <AlertDialogContent className="glass-strong">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-bengali">লেভেলটি মুছে যাবে!</AlertDialogTitle>
          <AlertDialogDescription className="font-bengali">
            "{deleteTarget?.name}" এবং এর নিচের সব সাব-লেভেল ({toBn(deleteTarget?.children.length ?? 0)} টি সরাসরি শাখা)
            মুছে যাবে — এটি ফেরানো যাবে না। এই লেভেলে সংযুক্ত ফ্ল্যাশকার্ড/MCQ মুছবে না;
            তারা "লেভেল ছাড়া" বাকেটে চলে যাবে।
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="font-bengali">বাতিল</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive font-bengali text-white hover:bg-destructive/90"
            onClick={() => deleteTarget && deleteLevel.mutate(deleteTarget.id)}
          >
            মুছে ফেলুন
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}

function pathDepth(byId: Map<string, TreeNodeWithChildren>, node: TreeNodeWithChildren) {
  let d = 1;
  let cur: TreeNodeWithChildren | undefined = node;
  while (cur?.parentId) {
    cur = byId.get(cur.parentId);
    d += 1;
  }
  return d;
}

export type { TreeNodeDTO };
