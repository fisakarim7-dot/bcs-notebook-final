"use client";

/**
 * Cross Linking (#33) — সম্পর্কিত কনটেন্ট বক্স (signature feature).
 *
 * ANY content can be interconnected: Question ↔ Topic ↔ Note ↔ File ↔ Link.
 * নিজের ইচ্ছামতো সংযোগ করুন — "সংযোগ যোগ করুন" থেকে (খালি সার্চে সব নোডের তালিকা,
 * ২+ অক্ষরে গ্লোবাল সার্চ)। কোনো অটো-সাজেশন দেখানো হয় না।
 *
 * Rows render with tree-branch (├─) connectors like a knowledge map, each
 * kind with its own colored chip; clicking a row deep-links to that content.
 */

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  addCrossLink,
  deleteCrossLink,
  fetchCrossLinks,
  fetchTree,
  searchAll,
} from "@/lib/bcs-api";
import { ancestorsOf, buildTree, type TreeNodeWithChildren } from "@/lib/bcs-tree-utils";
import { useBcsStore } from "@/lib/bcs-store";
import type { CrossLinkKind, CrossLinkTarget, SearchResult } from "@/lib/bcs-types";
import { toBn } from "@/lib/bcs-types";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  HelpCircle,
  Link2,
  Loader2,
  NotebookPen,
  Plus,
  X,
  type LucideIcon,
} from "lucide-react";

// ---------- kind meta (icon + colors + section labels) ----------

interface KindMeta {
  label: string;
  section: string;
  icon: LucideIcon;
  chip: string;
}

const KIND_META: Record<string, KindMeta> = {
  node: {
    label: "টপিক",
    section: "সম্পর্কিত টপিকস",
    icon: FolderOpen,
    chip: "bg-emerald-500/15 text-emerald-700 ring-emerald-500/30 dark:text-emerald-300",
  },
  question: {
    label: "প্রশ্ন",
    section: "সম্পর্কিত প্রশ্ন",
    icon: HelpCircle,
    chip: "bg-amber-500/15 text-amber-700 ring-amber-500/30 dark:text-amber-300",
  },
  noteItem: {
    label: "নোট",
    section: "সম্পর্কিত নোট",
    icon: NotebookPen,
    chip: "bg-violet-500/15 text-violet-700 ring-violet-500/30 dark:text-violet-300",
  },
  document: {
    label: "ফাইল",
    section: "সম্পর্কিত ফাইল / আর্টিকেল",
    icon: FileText,
    chip: "bg-sky-500/15 text-sky-700 ring-sky-500/30 dark:text-sky-300",
  },
  link: {
    label: "লিংক",
    section: "সম্পর্কিত লিংক",
    icon: Link2,
    chip: "bg-teal-500/15 text-teal-700 ring-teal-500/30 dark:text-teal-300",
  },
};

const KIND_ORDER = ["node", "question", "noteItem", "document", "link"] as const;

function metaOf(kind: string): KindMeta {
  return (
    KIND_META[kind] ?? {
      label: kind,
      section: kind,
      icon: Link2,
      chip: "bg-muted text-muted-foreground ring-border",
    }
  );
}

// ---------- accent (matches the host card hue) ----------

export type CrossLinkAccent = "violet" | "fuchsia" | "emerald" | "amber" | "rose" | "teal" | "cyan";

const ACCENT: Record<CrossLinkAccent, { border: string; chip: string; rail: string; tick: string }> = {
  violet: {
    border: "from-violet-500/70 via-purple-500/40 to-fuchsia-500/60",
    chip: "bg-gradient-to-br from-violet-500 to-fuchsia-500",
    rail: "border-violet-400/40",
    tick: "bg-violet-400/50",
  },
  fuchsia: {
    border: "from-fuchsia-500/70 via-pink-500/40 to-rose-500/60",
    chip: "bg-gradient-to-br from-fuchsia-500 to-rose-500",
    rail: "border-fuchsia-400/40",
    tick: "bg-fuchsia-400/50",
  },
  emerald: {
    border: "from-emerald-500/70 via-teal-500/40 to-emerald-500/60",
    chip: "bg-gradient-to-br from-emerald-500 to-teal-500",
    rail: "border-emerald-400/40",
    tick: "bg-emerald-400/50",
  },
  amber: {
    border: "from-amber-500/70 via-orange-500/40 to-amber-500/60",
    chip: "bg-gradient-to-br from-amber-500 to-orange-500",
    rail: "border-amber-400/40",
    tick: "bg-amber-400/50",
  },
  rose: {
    border: "from-rose-500/70 via-pink-500/40 to-rose-500/60",
    chip: "bg-gradient-to-br from-rose-500 to-pink-500",
    rail: "border-rose-400/40",
    tick: "bg-rose-400/50",
  },
  teal: {
    border: "from-teal-500/70 via-cyan-500/40 to-teal-500/60",
    chip: "bg-gradient-to-br from-teal-500 to-cyan-500",
    rail: "border-teal-400/40",
    tick: "bg-teal-400/50",
  },
  cyan: {
    border: "from-cyan-500/70 via-teal-500/40 to-sky-500/60",
    chip: "bg-gradient-to-br from-cyan-500 to-sky-500",
    rail: "border-cyan-400/40",
    tick: "bg-cyan-400/50",
  },
};

// ---------- picker helpers ----------

const LINKABLE = new Set(["node", "content", "noteItem", "document", "link", "question"]);

function mapSearchKind(kind: string): CrossLinkKind {
  if (kind === "content") return "node"; // a node's note content → the topic itself
  return kind as CrossLinkKind;
}

function tabForKind(kind: string): "notes" | "docs" | "links" | "questions" {
  if (kind === "document") return "docs";
  if (kind === "link") return "links";
  if (kind === "question") return "questions";
  return "notes";
}

// ---------- component ----------

export function CrossLinksBox({
  source,
  accent = "cyan",
}: {
  source: { kind: CrossLinkKind; id: string };
  accent?: CrossLinkAccent;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");

  const a = ACCENT[accent] ?? ACCENT.cyan;

  // navigation context
  const { data: nodes = [] } = useQuery({
    queryKey: ["tree"],
    queryFn: fetchTree,
    staleTime: 60_000,
  });

  const linksQ = useQuery({
    queryKey: ["cross-links", source.kind, source.id],
    queryFn: () => fetchCrossLinks(source.kind, source.id),
    enabled: open,
  });


  // picker debounce (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const pickerQ = useQuery({
    queryKey: ["cross-links-picker", debouncedQ],
    queryFn: () => searchAll(debouncedQ.trim()),
    enabled: pickerOpen && debouncedQ.trim().length >= 2,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["cross-links", source.kind, source.id] });
  };

  const addMut = useMutation({
    mutationFn: (t: { kind: string; id: string }) =>
      addCrossLink({
        sourceKind: source.kind,
        sourceId: source.id,
        targetKind: t.kind as CrossLinkKind,
        targetId: t.id,
      }),
    onSuccess: () => {
      toast.success("সংযোগ যোগ হয়েছে — উল্টো দিক থেকেও দেখা যাবে");
      setPickerOpen(false);
      setQ("");
      setDebouncedQ("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (linkId: string) => deleteCrossLink(linkId),
    onSuccess: () => {
      toast.success("সংযোগ সরানো হয়েছে");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // group manual links by kind
  const links = linksQ.data ?? [];
  const grouped = useMemo(() => {
    const byKind = new Map<string, CrossLinkTarget[]>();
    for (const l of links) {
      const arr = byKind.get(l.kind) ?? [];
      arr.push(l);
      byKind.set(l.kind, arr);
    }
    return KIND_ORDER.filter((k) => byKind.has(k)).map((k) => ({
      kind: k as string,
      items: byKind.get(k)!,
    }));
  }, [links]);

  // picker — খালি সার্চে সব নোডের তালিকা (tree browse), ২+ অক্ষরে গ্লোবাল সার্চ
  const allNodeRows = useMemo(() => {
    const rows: { node: TreeNodeWithChildren; depth: number }[] = [];
    const walk = (ns: TreeNodeWithChildren[], depth: number) => {
      for (const n of ns) {
        if (!(source.kind === "node" && n.id === source.id)) {
          rows.push({ node: n, depth });
        }
        walk(n.children, depth + 1);
      }
    };
    walk(buildTree(nodes), 1);
    return rows;
  }, [nodes, source.kind, source.id]);
  const quickQ = debouncedQ.trim().toLowerCase();
  const browseRows =
    quickQ.length < 2
      ? quickQ.length === 0
        ? allNodeRows
        : allNodeRows.filter((r) => r.node.name.toLowerCase().includes(quickQ))
      : [];

  // picker results — linkable kinds only, exclude self
  const pickerResults: SearchResult[] = (pickerQ.data ?? [])
    .filter((r) => LINKABLE.has(r.kind))
    .filter((r) => {
      const kind = mapSearchKind(r.kind);
      const id = r.targetId ?? r.nodeId;
      return !(kind === source.kind && id === source.id);
    })
    .slice(0, 8);

  const navigate = (t: CrossLinkTarget) => {
    if (!t.nodeId) return;
    const { selectNode, openNodeTab } = useBcsStore.getState();
    if (t.kind === "node") {
      selectNode(t.nodeId, ancestorsOf(nodes, t.nodeId));
    } else {
      openNodeTab(t.nodeId, tabForKind(t.kind), ancestorsOf(nodes, t.nodeId));
    }
  };

  const isLoading = linksQ.isLoading;
  const totalCount = links.length;

  return (
    <div
      className={cn(
        "rounded-2xl bg-gradient-to-br p-[2px] transition-shadow duration-300",
        a.border,
        open && "shadow-[0_0_18px_rgb(139_92_246/0.12)]"
      )}
    >
      <div className="rounded-[calc(1rem-2px)] bg-background/85 backdrop-blur-sm dark:bg-background/80">
        {/* header */}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-start"
          aria-label="সম্পর্কিত কনটেন্ট টগল করুন"
        >
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm",
              a.chip
            )}
          >
            <Link2 className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-bold leading-tight font-bengali">
              সম্পর্কিত কনটেন্ট
            </span>
            <span className="block text-[10px] leading-tight text-muted-foreground">
              Cross Linking — সব কনটেন্ট পরস্পর সংযুক্ত
            </span>
          </span>
          {totalCount > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary font-bengali">
              {toBn(totalCount)} সংযোগ
            </span>
          )}
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          <span className="ml-auto flex items-center gap-1">
            <ChevronDown
              className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
            />
          </span>
        </button>

        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-3 border-t border-border/50 px-3 pb-3 pt-3"
          >
            {/* ---- manual links (আপনার সংযোগ) ---- */}
            {linksQ.isLoading ? (
              <p className="py-1 text-center text-[11px] text-muted-foreground font-bengali">
                সংযোগ লোড হচ্ছে…
              </p>
            ) : grouped.length === 0 ? (
              <p className="text-[11px] leading-relaxed text-muted-foreground font-bengali">
                এখনো কোনো সংযোগ নেই — নিচের <b>সংযোগ যোগ করুন</b> থেকে আপনার ইচ্ছামতো
                টপিক/নোটের সাথে জুড়ুন।
              </p>
            ) : (
              grouped.map((g) => {
                const meta = metaOf(g.kind);
                return (
                  <div key={g.kind}>
                    <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold font-bengali">
                      <span className={cn("flex h-5 w-5 items-center justify-center rounded-md ring-1", meta.chip)}>
                        <meta.icon className="h-3 w-3" />
                      </span>
                      {meta.section}
                      <span className="text-[10px] font-medium text-muted-foreground">
                        ({toBn(g.items.length)})
                      </span>
                    </p>
                    <ul className={cn("relative ml-1 space-y-1 border-l border-dashed pl-4", a.rail)}>
                      {g.items.map((t) => (
                        <TreeRow
                          key={`${t.kind}:${t.id}`}
                          t={t}
                          tick={a.tick}
                          onNavigate={() => navigate(t)}
                          onRemove={t.linkId ? () => removeMut.mutate(t.linkId!) : undefined}
                          removing={removeMut.isPending && removeMut.variables === t.linkId}
                        />
                      ))}
                    </ul>
                  </div>
                );
              })
            )}

            {/* ---- add picker ---- */}
            {pickerOpen ? (
              <div className="rounded-xl border border-primary/30 bg-primary/[0.04] p-2.5">
                <div className="mb-2 flex items-center gap-2">
                  <Input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="সার্চ করুন — টপিক, নোট, প্রশ্ন, ফাইল…"
                    aria-label="সংযোগের জন্য সার্চ"
                    autoFocus
                    className="h-8 text-[13px] font-bengali"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => {
                      setPickerOpen(false);
                      setQ("");
                      setDebouncedQ("");
                    }}
                    aria-label="সংযোগ পিকার বন্ধ করুন"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {debouncedQ.trim().length < 2 ? (
                  browseRows.length === 0 ? (
                    <p className="py-1 text-[11px] text-muted-foreground font-bengali">
                      কোনো নোড নেই
                    </p>
                  ) : (
                    <>
                      <p className="mb-1 text-[10px] text-muted-foreground font-bengali">
                        সব নোড — চাপ দিলে যুক্ত হবে (২+ অক্ষর লিখলে সব ধরনের কনটেন্ট খোঁজবে)
                      </p>
                      <ul className="scroll-slim flex max-h-64 flex-col gap-1 overflow-y-auto pr-1">
                        {browseRows.map(({ node, depth }) => {
                          const pending = addMut.isPending && addMut.variables?.id === node.id;
                          return (
                            <li key={node.id}>
                              <button
                                type="button"
                                onClick={() => addMut.mutate({ kind: "node", id: node.id })}
                                disabled={pending}
                                className="flex w-full items-center gap-2 rounded-lg border border-border/50 bg-background/60 px-2 py-1.5 text-start transition-all hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
                              >
                                {node.children.length > 0 ? (
                                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                                ) : (
                                  <span className="w-3 shrink-0" />
                                )}
                                {node.type === "folder" ? (
                                  <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-600/80 dark:text-chart-2" />
                                ) : (
                                  <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                                )}
                                <span
                                  className="min-w-0 flex-1 text-[12px] font-medium font-bengali"
                                  style={{
                                    overflowWrap: "anywhere",
                                    paddingLeft: Math.max(0, depth - 1) * 8,
                                  }}
                                >
                                  {node.name}
                                </span>
                                <span className="shrink-0 rounded bg-muted px-1 text-[9px] text-muted-foreground font-bengali">
                                  লেভেল {toBn(depth)}
                                </span>
                                {pending ? (
                                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                                ) : (
                                  <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )
                ) : pickerQ.isLoading ? (
                  <p className="flex items-center justify-center gap-1.5 py-2 text-[11px] text-muted-foreground font-bengali">
                    <Loader2 className="h-3 w-3 animate-spin" /> খোঁজা হচ্ছে…
                  </p>
                ) : pickerResults.length === 0 ? (
                  <p className="py-1 text-[11px] text-muted-foreground font-bengali">
                    কিছু পাওয়া যায়নি
                  </p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {pickerResults.map((r) => {
                      const kind = mapSearchKind(r.kind);
                      const meta = metaOf(kind);
                      const id = r.targetId ?? r.nodeId;
                      const pending = addMut.isPending && addMut.variables?.id === id;
                      return (
                        <li key={`${r.kind}:${id}`}>
                          <button
                            type="button"
                            onClick={() => id && addMut.mutate({ kind, id })}
                            disabled={!id || pending}
                            className="flex w-full items-center gap-2 rounded-lg border border-border/50 bg-background/60 px-2 py-1.5 text-start transition-all hover:border-primary/40 hover:bg-primary/5 disabled:opacity-60"
                          >
                            <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1", meta.chip)}>
                              <meta.icon className="h-3 w-3" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[12px] font-medium font-bengali">
                                {r.title || r.name}
                              </span>
                              <span className="block truncate text-[10px] text-muted-foreground">
                                {r.path}
                              </span>
                            </span>
                            {pending ? (
                              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                            ) : (
                              <Plus className="h-3.5 w-3.5 shrink-0 text-primary" />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPickerOpen(true);
                  setOpen(true);
                }}
                className="h-8 gap-1.5 self-start text-[12px] font-bengali"
                aria-label="নতুন সংযোগ যোগ করুন"
              >
                <Plus className="h-3.5 w-3.5" /> সংযোগ যোগ করুন
              </Button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ---------- tree-branch row (├─ knowledge-map style) ----------

function TreeRow({
  t,
  tick,
  score,
  onNavigate,
  onRemove,
  removing,
  onPin,
  pinning,
}: {
  t: CrossLinkTarget;
  tick: string;
  score?: number;
  onNavigate: () => void;
  onRemove?: () => void;
  removing?: boolean;
  onPin?: () => void;
  pinning?: boolean;
}) {
  const meta = metaOf(t.kind);
  return (
    <li className="group/row relative flex items-center gap-1.5">
      {/* ├─ horizontal tick */}
      <span aria-hidden className={cn("absolute -left-4 top-1/2 h-px w-3", tick)} />
      <button
        type="button"
        onClick={onNavigate}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-transparent px-1.5 py-1 text-start transition-all hover:border-border/60 hover:bg-accent/60"
        aria-label={`খুলুন: ${t.title}`}
      >
        <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1", meta.chip)}>
          <meta.icon className="h-3 w-3" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] font-medium leading-tight font-bengali">
            {t.title}
          </span>
          {t.path && (
            <span className="block truncate text-[10px] leading-tight text-muted-foreground">
              {t.path}
            </span>
          )}
        </span>
        {typeof score === "number" && score > 0 && (
          <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[9px] font-bold text-muted-foreground font-bengali">
            মিল {toBn(score)}
          </span>
        )}
      </button>
      {onPin && (
        <button
          type="button"
          onClick={onPin}
          disabled={pinning}
          aria-label={`পিন করুন: ${t.title}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary disabled:opacity-50"
        >
          {pinning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label={`সংযোগ সরান: ${t.title}`}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-destructive/15 hover:text-destructive disabled:opacity-50"
        >
          {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
        </button>
      )}
    </li>
  );
}
