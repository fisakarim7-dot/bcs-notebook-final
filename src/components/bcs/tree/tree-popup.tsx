"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  FilePlus2,
  FolderPlus,
  FolderOpen,
  FolderTree,
  GraduationCap,
  Layers,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createNode, deleteNode, setNodeCompleted } from "@/lib/bcs-api";
import { MAX_LEVEL } from "@/lib/bcs-types";
import type { TreeNodeDTO, TreeNodeWithChildren } from "@/lib/bcs-tree-utils";
import { countDescendants } from "@/lib/bcs-tree-utils";
import { useBcsStore } from "@/lib/bcs-store";
import { cn } from "@/lib/utils";

type AnyNode = TreeNodeWithChildren;

interface PanelEntry {
  node: AnyNode;
  /** vertical anchor (row top) */
  top: number;
  /** horizontal anchor (parent's right edge) */
  left: number;
}

interface PopupActions {
  createChild: (parentId: string, type: "folder" | "note") => void;
  toggleComplete: (node: AnyNode) => void;
  askRename: (node: AnyNode) => void;
  askDelete: (node: AnyNode) => void;
  creating: boolean;
}

const PANEL_W = 268;

function LevelIcon({ node, className }: { node: AnyNode; className?: string }) {
  if (node.type === "note") return <StickyNote className={className} />;
  if (node.depth <= 1) return <GraduationCap className={className} />;
  if (node.depth === 2) return <Layers className={className} />;
  if (node.depth === 3) return <FolderOpen className={className} />;
  return <FolderTree className={className} />;
}

/** Mutations shared by every popup row. */
function usePopupActions(
  onRenameAsk: (n: AnyNode) => void,
  onDeleteAsk: (n: AnyNode) => void
): PopupActions {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tree"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };

  const createChild = useMutation({
    mutationFn: (input: { parentId: string; type: "folder" | "note" }) =>
      createNode({
        name: input.type === "folder" ? "New Section" : "Untitled Note",
        type: input.type,
        parentId: input.parentId,
      }),
    onSuccess: (created) => {
      invalidate();
      toast.success(`"${created.name}" যোগ হয়েছে`);
      onRenameAsk(created as unknown as AnyNode);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleComplete = useMutation({
    mutationFn: (node: AnyNode) => setNodeCompleted(node.id, !node.noteCompleted),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["note"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    createChild: (parentId, type) => createChild.mutate({ parentId, type }),
    toggleComplete: (node) => toggleComplete.mutate(node),
    askRename: onRenameAsk,
    askDelete: onDeleteAsk,
    creating: createChild.isPending,
  };
}

/** Add-child + kebab controls shown on hover at the end of each popup row. */
function RowActions({ node, actions }: { node: AnyNode; actions: PopupActions }) {
  const canHaveChildren = node.type === "folder" && node.depth < MAX_LEVEL;
  return (
    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover:opacity-100">
      {canHaveChildren && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              onClick={(e) => e.stopPropagation()}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary"
              aria-label={`${node.name}-এর নিচে যোগ করুন`}
              title="নিচে যোগ করুন"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-strong w-44">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                actions.createChild(node.id, "folder");
              }}
              className="gap-2"
            >
              <FolderPlus className="h-4 w-4 text-amber-600/80 dark:text-chart-2" /> New Section
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                actions.createChild(node.id, "note");
              }}
              className="gap-2"
            >
              <FilePlus2 className="h-4 w-4 text-primary" /> New Leaf Note
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          actions.askRename(node);
        }}
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary"
        aria-label={`${node.name} রিনেম করুন`}
        title="রিনেম"
      >
        <Pencil className="h-3 w-3" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          actions.askDelete(node);
        }}
        className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
        aria-label={`${node.name} মুছুন`}
        title="মুছুন"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

/** A row inside a cascade panel (level ≥ 2 nodes). */
function PanelRow({
  node,
  level,
  isOpenHere,
  onPush,
  onSelect,
  actions,
}: {
  node: AnyNode;
  level: number; // panel level this row lives in
  isOpenHere: boolean; // its submenu is currently open
  onPush: (node: AnyNode, rowTop: number, level: number) => void;
  onSelect: (id: string) => void;
  actions: PopupActions;
}) {
  const { selectedId } = useBcsStore();
  const timer = useRef<number | null>(null);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const hasKids = node.type === "folder" && node.children.length > 0;
  const isSelected = selectedId === node.id;

  const rowTop = () => rowRef.current?.getBoundingClientRect().top ?? 0;

  const clearTimer = () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return (
    <div
      ref={rowRef}
      onMouseEnter={() => {
        if (!hasKids || isOpenHere) return;
        timer.current = window.setTimeout(() => onPush(node, rowTop(), level), 240);
      }}
      onMouseLeave={clearTimer}
      className={cn(
        "group/node flex items-center gap-1 rounded-lg py-1.5 pe-1.5 transition-colors",
        isSelected ? "bg-primary/10" : "hover:bg-accent/70"
      )}
    >
      {node.type === "note" ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            actions.toggleComplete(node);
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:scale-110"
          aria-label={node.noteCompleted ? "অসম্পূর্ণ করুন" : "সম্পূর্ণ করুন"}
          title={node.noteCompleted ? "অসম্পূর্ণ করুন" : "সম্পূর্ণ করুন"}
        >
          {node.noteCompleted ? (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          ) : (
            <Circle className="h-4 w-4 text-muted-foreground/50" />
          )}
        </button>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            clearTimer();
            if (hasKids) onPush(node, e.currentTarget.getBoundingClientRect().top, level);
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md hover:bg-primary/15"
          aria-label={hasKids ? "সাব-লেভেল খুলুন" : undefined}
        >
          {hasKids ? (
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                isOpenHere ? "rotate-90 text-primary" : "text-muted-foreground"
              )}
            />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
          )}
        </button>
      )}

      <button
        onClick={() => onSelect(node.id)}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5 text-start"
        title={node.name}
      >
        <LevelIcon
          node={node}
          className={cn(
            "h-4 w-4 shrink-0",
            node.type === "note"
              ? node.noteCompleted
                ? "text-primary"
                : "text-muted-foreground"
              : "text-amber-600/80 dark:text-chart-2"
          )}
        />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px] leading-snug font-bengali",
            node.type === "note" && node.noteCompleted && "line-through decoration-primary/40"
          )}
        >
          {node.name}
        </span>
      </button>

      <RowActions node={node} actions={actions} />
    </div>
  );
}

/** One floating cascade panel — children of one node. */
function CascadePanel({
  entry,
  level,
  isOpenHereId,
  onPush,
  onSelect,
  onClose,
  actions,
}: {
  entry: PanelEntry;
  level: number;
  isOpenHereId: string | null; // which child of THIS panel has its submenu open
  onPush: (node: AnyNode, rowTop: number, level: number) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
  actions: PopupActions;
}) {
  const { node, top, left } = entry;
  const panelRef = useRef<HTMLDivElement | null>(null);
  // client-only app — window exists at render time
  const width = typeof window !== "undefined" ? window.innerWidth : 1280;
  const height = typeof window !== "undefined" ? window.innerHeight : 800;

  // cascades step to the RIGHT of this panel (falls back inward when out of space)
  const pushFromPanel = (child: AnyNode, rowTop: number, lvl: number) => {
    const pr = panelRef.current?.getBoundingClientRect();
    onPush(child, rowTop, pr ? pr.right : left + PANEL_W, lvl);
  };

  const panelLeft = Math.max(8, Math.min(left + 6, width - PANEL_W - 8));
  const panelTop = Math.max(8, Math.min(top - 6, height - 340));
  const maxH = Math.min(height - panelTop - 12, 440);

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label={`${node.name} — সাব-লেভেল`}
      className="glass-strong fixed z-50 flex flex-col overflow-hidden rounded-xl shadow-2xl"
      style={{ left: panelLeft, top: panelTop, width: PANEL_W, maxHeight: maxH }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-2.5 py-2">
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold font-bengali" title={node.name}>
          {node.name}
        </span>
        <span className="shrink-0 rounded-full bg-muted px-1.5 text-[10px] font-bold text-muted-foreground">
          {node.children.length}
        </span>
        <button
          onClick={onClose}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
          aria-label="এই প্যানেল বন্ধ করুন"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="scroll-slim flex-1 overflow-y-auto p-1.5">
        {node.children.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-6 text-center">
            <p className="text-[11px] leading-5 text-muted-foreground font-bengali">
              এখানে এখনো কিছু নেই — নিচের লেভেল যোগ করুন
            </p>
            {node.type === "folder" && node.depth < MAX_LEVEL && (
              <div className="flex gap-1.5">
                <button
                  onClick={() => actions.createChild(node.id, "folder")}
                  className="flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-[11px] transition-colors hover:border-primary/40 hover:text-primary font-bengali"
                >
                  <FolderPlus className="h-3 w-3" /> Section
                </button>
                <button
                  onClick={() => actions.createChild(node.id, "note")}
                  className="flex items-center gap-1 rounded-lg border border-border/60 px-2 py-1 text-[11px] transition-colors hover:border-primary/40 hover:text-primary font-bengali"
                >
                  <FilePlus2 className="h-3 w-3" /> Note
                </button>
              </div>
            )}
          </div>
        ) : (
          node.children.map((child) => (
            <PanelRow
              key={child.id}
              node={child}
              level={level}
              isOpenHere={isOpenHereId === child.id}
              onPush={pushFromPanel}
              onSelect={onSelect}
              actions={actions}
            />
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Popup-mode tree: the sidebar lists only the subjects; every deeper level
 * (2 → 6) opens as cascading floating panels. Click a name to open it in the
 * workspace, chevron/hover to go deeper, + to add children anywhere.
 */
export function PopupTree({
  roots,
  flatNodes,
  onRenameAsk,
  onDeleteAsk,
}: {
  roots: AnyNode[];
  flatNodes: TreeNodeDTO[];
  onRenameAsk: (n: AnyNode) => void;
  onDeleteAsk: (n: AnyNode) => void;
}) {
  const { selectedId, selectNode } = useBcsStore();
  const actions = usePopupActions(onRenameAsk, onDeleteAsk);
  const [stack, setStack] = useState<PanelEntry[]>([]);
  const hoverTimer = useRef<number | null>(null);

  const closeAll = () => setStack([]);
  const closeFrom = (level: number) => setStack((s) => s.slice(0, level));

  const push = (node: AnyNode, rowTop: number, left: number, level: number) => {
    // `level` = index of the panel the row lives in → replace everything DEEPER
    // than it and append the new submenu (keeps the staircase intact)
    setStack((s) => [...s.slice(0, level + 1), { node, top: rowTop, left }]);
  };

  const openRoot = (node: AnyNode, row: HTMLElement) => {
    const r = row.getBoundingClientRect();
    setStack([{ node, top: r.top, left: r.right }]);
  };

  const select = (id: string) => {
    selectNode(id);
    closeAll();
  };

  // Escape closes the deepest panel one at a time
  useEffect(() => {
    if (stack.length === 0) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setStack((s) => s.slice(0, -1));
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [stack.length]);

  // subject subtree stats (for count chips + selected highlight)
  const subjectStats = useMemo(() => {
    const byId = new Map<string, string>(); // nodeId -> rootId
    const counts = new Map<string, { folders: number; notes: number }>();
    roots.forEach((root) => {
      counts.set(root.id, countDescendants(flatNodes, root.id));
      const walk = (n: AnyNode) => {
        byId.set(n.id, root.id);
        n.children.forEach(walk);
      };
      walk(root);
    });
    return { byId, counts };
  }, [roots, flatNodes]);

  return (
    <>
      <ul role="tree" aria-label="Subjects (popup mode)" className="space-y-1 pt-1">
        {roots.map((root) => {
          const stat = subjectStats.counts.get(root.id) ?? { folders: 0, notes: 0 };
          const total = stat.folders + stat.notes;
          const active = selectedId != null && subjectStats.byId.get(selectedId) === root.id;
          return (
            <li key={root.id}>
              <button
                onClick={(e) => {
                  if (hoverTimer.current) window.clearTimeout(hoverTimer.current);
                  openRoot(root, e.currentTarget as HTMLElement);
                }}
                aria-expanded={stack[0]?.node.id === root.id}
                className={cn(
                  "group flex w-full items-center gap-2 rounded-xl border px-2.5 py-2.5 text-start transition-all duration-200",
                  active
                    ? "border-primary/40 bg-primary/10 shadow-[0_0_14px_var(--glow)]"
                    : "border-border/50 bg-card/40 hover:border-primary/30 hover:bg-accent/50"
                )}
              >
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    active ? "bg-primary/15 text-primary" : "bg-primary/10 text-amber-600/80 dark:text-chart-2"
                  )}
                >
                  <LevelIcon node={root} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold font-bengali" title={root.name}>
                    {root.name}
                  </span>
                  <span className="block text-[10px] text-muted-foreground font-bengali">
                    {total > 0 ? `${total} আইটেম` : "খালি"}
                  </span>
                </span>
                <ChevronRight
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    stack[0]?.node.id === root.id && "rotate-90 text-primary"
                  )}
                />
              </button>
            </li>
          );
        })}
      </ul>

      {typeof document !== "undefined" &&
        createPortal(
          <>
            {stack.length > 0 && (
              <div className="fixed inset-0 z-40" onClick={closeAll} aria-hidden="true" />
            )}
            {stack.map((entry, level) => (
              <CascadePanel
                key={entry.node.id}
                entry={entry}
                level={level}
                isOpenHereId={stack[level + 1]?.node.id ?? null}
                onPush={push}
                onSelect={select}
                onClose={() => closeFrom(level)}
                actions={actions}
              />
            ))}
          </>,
          document.body
        )}
    </>
  );
}
