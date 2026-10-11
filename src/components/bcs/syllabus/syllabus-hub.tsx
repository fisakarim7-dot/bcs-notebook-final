"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  BookMarked,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  FolderOpen,
  Gauge,
  GraduationCap,
  ListTree,
  Sparkles,
  TreePine,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  fetchSyllabus,
  fetchTree,
  setSyllabusNodeStatus,
  setSyllabusNodeStrength,
  updateSyllabus,
} from "@/lib/bcs-api";
import { toBn, type SyllabusItemDTO, type TreeNodeDTO } from "@/lib/bcs-types";
import { buildTree, type TreeNodeWithChildren } from "@/lib/bcs-tree-utils";
import { useBcsStore } from "@/lib/bcs-store";
import { hueOf } from "@/components/bcs/study/node-badge-browser";
import { cn } from "@/lib/utils";

const STATUS: { id: SyllabusItemDTO["status"]; label: string; cls: string }[] = [
  { id: "unread", label: "পড়িনি", cls: "bg-muted text-muted-foreground" },
  { id: "reading", label: "পড়ছি", cls: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  { id: "noted", label: "নোট আছে", cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  { id: "mcq", label: "MCQ আছে", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  { id: "mastered", label: "আয়ত্ত", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
];

// প্রতিটি নোডের প্রস্তুতির স্তর — "দুর্বল" chip-এর বদলে ৫-স্তরের ড্রপডাউন
const STRENGTHS: { id: SyllabusItemDTO["strength"]; label: string; cls: string; dot: string }[] = [
  { id: "very_weak", label: "অনেক দুর্বল", cls: "bg-red-600/15 text-red-700 dark:text-red-300", dot: "bg-red-600" },
  { id: "weak", label: "দুর্বল", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300", dot: "bg-rose-500" },
  { id: "medium", label: "মধ্যম", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300", dot: "bg-amber-500" },
  { id: "strong", label: "শক্তিশালী", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
  { id: "very_strong", label: "অত্যন্ত শক্তিশালী", cls: "bg-green-600/15 text-green-700 dark:text-green-300", dot: "bg-green-600" },
];

type ViewMode = "tree" | "official";

export function SyllabusHub() {
  const [view, setView] = useState<ViewMode>("tree");

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-4 pb-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold font-bengali">
            <BookMarked className="h-5 w-5 text-primary" /> BCS সিলেবাস চেকলিস্ট
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground font-bengali">
            {view === "tree"
              ? "আপনার ট্রির প্রতিটি নোড (লেভেল ১–৬) সাবজেক্ট-ভিত্তিক ড্রপডাউনে — নতুন নোড যোগ করলেই অটো চলে আসে"
              : "অফিসিয়াল BCS কাঠামো — আপনার ট্রির সাথে ম্যাপিং রাখা যায়"}
          </p>
        </div>
        <div className="glass inline-flex rounded-xl p-0.5">
          <button
            onClick={() => setView("tree")}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bengali",
              view === "tree"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <TreePine className="h-3.5 w-3.5" /> আমার ট্রি-চেকলিস্ট
          </button>
          <button
            onClick={() => setView("official")}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bengali",
              view === "official"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <GraduationCap className="h-3.5 w-3.5" /> অফিসিয়াল সিলেবাস
          </button>
        </div>
      </div>

      {view === "tree" ? <TreeChecklist /> : <OfficialChecklist />}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  আমার ট্রি-চেকলিস্ট — live mirror of the study tree (levels 1–6)     */
/*  subject-wise dropdown: every folder is a collapsible ▸ row          */
/* ------------------------------------------------------------------ */

function collectFolderIds(nodes: TreeNodeWithChildren[], into = new Set<string>()) {
  for (const n of nodes) {
    if (n.children.length > 0) into.add(n.id);
    collectFolderIds(n.children, into);
  }
  return into;
}

function TreeChecklist() {
  const qc = useQueryClient();
  const selectNode = useBcsStore((s) => s.selectNode);

  // লাইভ ট্রি — নতুন নোড যোগ হলেই এই লিস্টে অটো চলে আসে
  const { data: nodes = [], isLoading } = useQuery({
    queryKey: ["tree"],
    queryFn: fetchTree,
  });
  const { data: items = [] } = useQuery({
    queryKey: ["syllabus"],
    queryFn: fetchSyllabus,
  });

  const statusByNode = useMemo(() => {
    const m = new Map<string, SyllabusItemDTO>();
    for (const it of items) if (it.nodeId) m.set(it.nodeId, it);
    return m;
  }, [items]);

  const tree = useMemo(() => buildTree(nodes), [nodes]);

  // ড্রপডাউন: ডিফল্টে সব বন্ধ — ▸ চাপলে এক লেভেল করে খোলে
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const allFolderIds = useMemo(() => collectFolderIds(tree), [tree]);
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const expandAll = () => setExpanded(new Set(allFolderIds));
  const collapseAll = () => setExpanded(new Set());
  const allOpen = allFolderIds.size > 0 && expanded.size === allFolderIds.size;

  const setStatus = useMutation({
    mutationFn: ({
      nodeId,
      status,
      subject,
      topic,
    }: {
      nodeId: string;
      status: string;
      subject: string;
      topic: string;
    }) => setSyllabusNodeStatus(nodeId, status, { subject, topic }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["syllabus"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const setStrength = useMutation({
    mutationFn: ({
      nodeId,
      strength,
      subject,
      topic,
    }: {
      nodeId: string;
      strength: string;
      subject: string;
      topic: string;
    }) => setSyllabusNodeStrength(nodeId, strength, { subject, topic }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["syllabus"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const total = nodes.length;
  const marked = nodes.filter((n) => (statusByNode.get(n.id)?.status ?? "unread") !== "unread").length;
  const mastered = nodes.filter((n) => statusByNode.get(n.id)?.status === "mastered").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs font-bengali text-muted-foreground">
        <Badge variant="secondary" className="gap-1 font-bengali">
          <TreePine className="h-3 w-3" /> মোট নোড: {toBn(total)}
        </Badge>
        <Badge variant="secondary" className="font-bengali">
          চিহ্নিত: {toBn(marked)}/{toBn(total)}
        </Badge>
        <Badge variant="secondary" className="font-bengali">
          আয়ত্ত: {toBn(mastered)}/{toBn(total)}
        </Badge>
        <button
          type="button"
          onClick={allOpen ? collapseAll : expandAll}
          className="ml-auto flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:bg-accent"
        >
          <ListTree className="h-3.5 w-3.5" />
          {allOpen ? "সব বন্ধ করুন" : "সব খুলুন"}
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-2xl bg-muted/50" />
          ))}
        </div>
      ) : tree.length === 0 ? (
        <div className="glass flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
          <Sparkles className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium font-bengali">
            ট্রিতে এখনো কোনো নোড নেই — সাইডবার থেকে যোগ করলেই এখানে দেখা যাবে
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tree.map((root, idx) => (
            <SubjectDropdown
              key={root.id}
              root={root}
              hueIndex={idx}
              statusByNode={statusByNode}
              expanded={expanded}
              onToggle={toggle}
              onSetStatus={(node, status) =>
                setStatus.mutate({
                  nodeId: node.id,
                  status,
                  subject: root.name,
                  topic: node.name,
                })
              }
              onSetStrength={(node, strength) =>
                setStrength.mutate({
                  nodeId: node.id,
                  strength,
                  subject: root.name,
                  topic: node.name,
                })
              }
              onOpen={selectNode}
              pendingNodeId={
                setStatus.isPending && setStatus.variables
                  ? setStatus.variables.nodeId
                  : null
              }
              pendingStrengthId={
                setStrength.isPending && setStrength.variables
                  ? setStrength.variables.nodeId
                  : null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SubjectDropdown({
  root,
  hueIndex,
  statusByNode,
  expanded,
  onToggle,
  onSetStatus,
  onSetStrength,
  onOpen,
  pendingNodeId,
  pendingStrengthId,
}: {
  root: TreeNodeWithChildren;
  hueIndex: number;
  statusByNode: Map<string, SyllabusItemDTO>;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSetStatus: (node: TreeNodeDTO, status: string) => void;
  onSetStrength: (node: TreeNodeDTO, strength: string) => void;
  onOpen: (id: string) => void;
  pendingNodeId: string | null;
  pendingStrengthId: string | null;
}) {
  const hue = hueOf(hueIndex);
  const open = expanded.has(root.id);

  // progress counts over the whole subtree (root included)
  let total = 0;
  let marked = 0;
  let mastered = 0;
  const walk = (n: TreeNodeWithChildren) => {
    total += 1;
    const st = statusByNode.get(n.id)?.status ?? "unread";
    if (st !== "unread") marked += 1;
    if (st === "mastered") mastered += 1;
    n.children.forEach(walk);
  };
  walk(root);

  return (
    <section className="glass rounded-2xl p-2 sm:p-3">
      {/* subject header = the root node row itself (dropdown) */}
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border/50 px-2 py-2 transition-colors hover:border-primary/30 hover:bg-accent/30",
          open && "border-primary/30 bg-primary/[0.04]"
        )}
      >
        <button
          type="button"
          onClick={() => onToggle(root.id)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-start"
          title={open ? "বন্ধ করুন" : "খুলুন"}
        >
          {open ? (
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm",
              hue.grad
            )}
          >
            <BookMarked className="h-3.5 w-3.5" />
          </span>
          <span
            className="min-w-0 flex-1 text-sm font-bold font-bengali"
            style={{ overflowWrap: "anywhere" }}
            title={root.name}
          >
            {root.name}
          </span>
        </button>
        <span
          className="shrink-0 rounded bg-muted px-1 py-px text-[9px] font-bold text-muted-foreground font-bengali"
          title="ট্রি লেভেল ১"
        >
          লেভেল ১
        </span>
        <StatusChips
          node={root}
          status={statusByNode.get(root.id)?.status ?? "unread"}
          strength={statusByNode.get(root.id)?.strength ?? ""}
          onSetStatus={onSetStatus}
          onSetStrength={onSetStrength}
          pending={pendingNodeId === root.id}
          strengthPending={pendingStrengthId === root.id}
        />
        <Badge variant="secondary" className="shrink-0 font-bengali text-[10px]">
          আয়ত্ত {toBn(mastered)} · চিহ্নিত {toBn(marked)}/{toBn(total)}
        </Badge>
      </div>

      {/* children — dropdown rows */}
      {open && root.children.length > 0 && (
        <ul className="relative ml-3 mt-1 flex flex-col gap-1 border-l border-dashed border-border/70 pl-2 sm:pl-3">
          {root.children.map((child) => (
            <NodeRow
              key={child.id}
              node={child}
              depth={2}
              statusByNode={statusByNode}
              expanded={expanded}
              onToggle={onToggle}
              onSetStatus={onSetStatus}
              onSetStrength={onSetStrength}
              onOpen={onOpen}
              pendingNodeId={pendingNodeId}
              pendingStrengthId={pendingStrengthId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function NodeRow({
  node,
  depth,
  statusByNode,
  expanded,
  onToggle,
  onSetStatus,
  onSetStrength,
  onOpen,
  pendingNodeId,
  pendingStrengthId,
}: {
  node: TreeNodeWithChildren;
  depth: number;
  statusByNode: Map<string, SyllabusItemDTO>;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSetStatus: (node: TreeNodeDTO, status: string) => void;
  onSetStrength: (node: TreeNodeDTO, strength: string) => void;
  onOpen: (id: string) => void;
  pendingNodeId: string | null;
  pendingStrengthId: string | null;
}) {
  const hasChildren = node.children.length > 0;
  const open = expanded.has(node.id);

  return (
    <li className="min-w-0">
      <div
        className={cn(
          "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-border/50 px-2 py-1.5 transition-colors hover:border-primary/30 hover:bg-accent/40",
          (statusByNode.get(node.id)?.status ?? "unread") === "mastered" &&
            "border-emerald-500/30 bg-emerald-500/5"
        )}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            aria-expanded={open}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
            title={open ? "বন্ধ করুন" : "খুলুন"}
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <button
          type="button"
          onClick={() => onOpen(node.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-start"
          title="এই নোডে যান"
        >
          {node.type === "folder" ? (
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-600/80 dark:text-chart-2" />
          ) : (
            <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
          )}
          <span
            className="min-w-0 flex-1 text-[13px] font-bengali leading-snug"
            style={{ overflowWrap: "anywhere" }}
            title={node.name}
          >
            {node.name}
          </span>
        </button>
        <span
          className="shrink-0 rounded bg-muted px-1 py-px text-[9px] font-bold text-muted-foreground font-bengali"
          title={`ট্রি লেভেল ${toBn(depth)}`}
        >
          লেভেল {toBn(depth)}
        </span>
        <StatusChips
          node={node}
          status={statusByNode.get(node.id)?.status ?? "unread"}
          strength={statusByNode.get(node.id)?.strength ?? ""}
          onSetStatus={onSetStatus}
          onSetStrength={onSetStrength}
          pending={pendingNodeId === node.id}
          strengthPending={pendingStrengthId === node.id}
        />
      </div>

      {open && hasChildren && (
        <ul className="relative ml-4 mt-1 flex flex-col gap-1 border-l border-dashed border-border/70 pl-2 sm:pl-3">
          {node.children.map((child) => (
            <NodeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              statusByNode={statusByNode}
              expanded={expanded}
              onToggle={onToggle}
              onSetStatus={onSetStatus}
              onSetStrength={onSetStrength}
              onOpen={onOpen}
              pendingNodeId={pendingNodeId}
              pendingStrengthId={pendingStrengthId}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function StatusChips({
  node,
  status,
  strength,
  onSetStatus,
  onSetStrength,
  pending,
  strengthPending,
}: {
  node: TreeNodeDTO;
  status: string;
  strength: string;
  onSetStatus: (node: TreeNodeDTO, status: string) => void;
  onSetStrength: (node: TreeNodeDTO, strength: string) => void;
  pending: boolean;
  strengthPending: boolean;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-1 transition-opacity",
        pending && "opacity-50"
      )}
    >
      {STATUS.slice(0, 4).map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSetStatus(node, s.id)}
          aria-pressed={status === s.id}
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-bengali transition-colors",
            status === s.id
              ? s.cls + " ring-1 ring-current"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          {status === s.id && <Check className="mr-0.5 inline h-2.5 w-2.5" />}
          {s.label}
        </button>
      ))}
      {/* দুর্বল chip-এর বদলে — প্রস্তুতির স্তরের ৫-স্তরের ড্রপডাউন */}
      <StrengthSelect
        strength={strength}
        pending={strengthPending}
        onChange={(next) => onSetStrength(node, next)}
      />
      {STATUS.slice(4).map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => onSetStatus(node, s.id)}
          aria-pressed={status === s.id}
          className={cn(
            "rounded-full px-1.5 py-0.5 text-[10px] font-bengali transition-colors",
            status === s.id
              ? s.cls + " ring-1 ring-current"
              : "text-muted-foreground hover:bg-accent"
          )}
        >
          {status === s.id && <Check className="mr-0.5 inline h-2.5 w-2.5" />}
          {s.label}
        </button>
      ))}
    </div>
  );
}

/** প্রস্তুতির স্তর — অনেক দুর্বল → অত্যন্ত শক্তিশালী (৫টি অপশন) */
function StrengthSelect({
  strength,
  pending,
  onChange,
}: {
  strength: string;
  pending: boolean;
  onChange: (strength: string) => void;
}) {
  const current = STRENGTHS.find((s) => s.id === strength) ?? null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          aria-label="প্রস্তুতির স্তর নির্বাচন করুন"
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bengali transition-colors",
            current
              ? current.cls + " ring-1 ring-current"
              : "bg-muted text-muted-foreground hover:bg-accent"
          )}
        >
          {current ? <Check className="h-2.5 w-2.5" /> : <Gauge className="h-2.5 w-2.5" />}
          {current ? current.label : "প্রস্তুতি"}
          <ChevronDown className="h-2.5 w-2.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-strong w-44">
        <DropdownMenuLabel className="font-bengali text-[10px] font-medium">
          প্রস্তুতির স্তর
        </DropdownMenuLabel>
        {STRENGTHS.map((s) => (
          <DropdownMenuItem key={s.id} onClick={() => onChange(s.id)} className="gap-2 font-bengali">
            <span className={cn("h-2 w-2 shrink-0 rounded-full", s.dot)} />
            <span className="flex-1">{s.label}</span>
            {strength === s.id && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
        {strength !== "" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onChange("")}
              className="gap-2 font-bengali text-muted-foreground focus:text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
              মুছে ফেলুন
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ------------------------------------------------------------------ */
/*  অফিসিয়াল সিলেবাস — official BCS skeleton (prelim/written papers)    */
/* ------------------------------------------------------------------ */

function OfficialChecklist() {
  const qc = useQueryClient();
  const [paper, setPaper] = useState<"prelim" | "written">("prelim");
  const { data: items = [] } = useQuery({ queryKey: ["syllabus"], queryFn: fetchSyllabus });
  const filtered = items.filter((i) => i.paper === paper);
  const subjects = useMemo(() => {
    const map = new Map<string, SyllabusItemDTO[]>();
    for (const it of filtered) {
      const arr = map.get(it.subject) ?? [];
      arr.push(it);
      map.set(it.subject, arr);
    }
    return [...map.entries()];
  }, [filtered]);

  const patch = useMutation({
    mutationFn: ({ id, status, strength }: { id: string; status?: string; strength?: string }) =>
      updateSyllabus(id, { status, strength }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["syllabus"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const mastered = filtered.filter((i) => i.status === "mastered").length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="glass inline-flex rounded-xl p-0.5">
          <button
            onClick={() => setPaper("prelim")}
            className={cn(
              "h-8 rounded-lg px-3 text-xs font-bengali",
              paper === "prelim" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            )}
          >
            প্রিলি ২০০
          </button>
          <button
            onClick={() => setPaper("written")}
            className={cn(
              "h-8 rounded-lg px-3 text-xs font-bengali",
              paper === "written" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            )}
          >
            লিখিত ৯০০
          </button>
        </div>
        <p className="text-xs font-bengali text-muted-foreground">
          আয়ত্ত {toBn(mastered)}/{toBn(filtered.length)} টপিক
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {subjects.map(([subject, topics]) => {
          const marks = topics.find((t) => t.marks > 0)?.marks ?? 0;
          const done = topics.filter(
            (t) => t.status === "mastered" || t.status === "noted" || t.status === "mcq"
          ).length;
          return (
            <section key={subject} className="glass rounded-2xl p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-sm font-bold font-bengali">{subject}</h2>
                <Badge variant="secondary" className="font-bengali text-[10px]">
                  {marks > 0 ? `${toBn(marks)} নম্বর · ` : ""}
                  {toBn(done)}/{toBn(topics.length)}
                </Badge>
              </div>
              <ul className="flex flex-col gap-1.5">
                {topics.map((t) => (
                  <li
                    key={t.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-border/50 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1 text-[13px] font-bengali">{t.topic}</span>
                    <div className="flex flex-wrap items-center gap-1">
                      {STATUS.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => patch.mutate({ id: t.id, status: s.id })}
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bengali transition-colors",
                            t.status === s.id
                              ? s.cls + " ring-1 ring-current"
                              : "text-muted-foreground hover:bg-accent"
                          )}
                        >
                          {t.status === s.id && <Check className="mr-0.5 inline h-2.5 w-2.5" />}
                          {s.label}
                        </button>
                      ))}
                      <StrengthSelect
                        strength={t.strength ?? ""}
                        pending={patch.isPending && patch.variables?.id === t.id}
                        onChange={(next) => patch.mutate({ id: t.id, strength: next })}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
