"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  ChevronRight,
  FolderPlus,
  FilePlus2,
  Plus,
  Pencil,
  Trash2,
  ChevronUp,
  ChevronDown,
  StickyNote,
  CheckCircle2,
  Circle,
  BookMarked,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { fetchTree, createNode, renameNode, deleteNode, setNodeCompleted, reorderTree } from "@/lib/bcs-api";
import type { TreeNodeDTO as Node } from "@/lib/bcs-types";
import { MAX_LEVEL } from "@/lib/bcs-types";
import {
  buildTree,
  countDescendants,
  type TreeNodeWithChildren,
} from "@/lib/bcs-tree-utils";
import { useBcsStore } from "@/lib/bcs-store";
import { cn } from "@/lib/utils";
import { hueOf } from "@/components/bcs/study/node-badge-browser";

interface TreeRowProps {
  node: TreeNodeWithChildren;
  hueIndex: number;
  subjectCount?: number;
  renamingId: string | null;
  setRenamingId: (id: string | null) => void;
  onDeleteAsk: (node: Node) => void;
  siblings: TreeNodeWithChildren[];
  index: number;
}

function TreeRow({ node, hueIndex, subjectCount, renamingId, setRenamingId, onDeleteAsk, siblings, index }: TreeRowProps) {
  const qc = useQueryClient();
  const { selectedId, selectNode, expanded, toggleExpanded } = useBcsStore();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tree"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };

  const createChild = useMutation({
    mutationFn: (type: "folder" | "note") =>
      createNode({
        name: type === "folder" ? "New Section" : "Untitled Note",
        type,
        parentId: node.id,
      }),
    onSuccess: (created) => {
      invalidate();
      if (!expanded[node.id]) toggleExpanded(node.id);
      setRenamingId(created.id);
      if (created.type === "note") selectNode(created.id);
      toast.success(`Added under "${node.name}"`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rename = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameNode(id, name),
    onSuccess: () => {
      invalidate();
      setRenamingId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleComplete = useMutation({
    mutationFn: (completed: boolean) => setNodeCompleted(node.id, completed),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["note", node.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isOpen = !!expanded[node.id];
  const hasChildren = node.children.length > 0;
  const canHaveChildren = node.type === "folder" && node.depth < MAX_LEVEL;
  const isSelected = selectedId === node.id;
  const isRenaming = renamingId === node.id;
  const hue = hueOf(hueIndex);
  const isSubject = node.depth <= 1;

  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renameMountedAt = useRef(0);

  // focus the inline rename input shortly after it mounts (dodges Radix menu
  // focus-return), and guard against instant programmatic blur right after mount
  useEffect(() => {
    if (!isRenaming) return;
    renameMountedAt.current = Date.now();
    const t = setTimeout(() => renameInputRef.current?.focus(), 120);
    return () => clearTimeout(t);
  }, [isRenaming]);

  const commitRename = (value: string) => {
    const name = value.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    if (name !== node.name) rename.mutate({ id: node.id, name });
    else setRenamingId(null);
  };

  return (
    <li className="relative min-w-0">
      <div
        role="treeitem"
        aria-expanded={node.type === "folder" ? isOpen : undefined}
        aria-selected={isSelected}
        tabIndex={0}
        onClick={() => selectNode(node.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            selectNode(node.id);
          } else if (e.key === "ArrowRight" && node.type === "folder" && !isOpen) {
            toggleExpanded(node.id);
          } else if (e.key === "ArrowLeft" && node.type === "folder" && isOpen) {
            toggleExpanded(node.id);
          }
        }}
        className={cn(
          "group/node relative flex cursor-pointer flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-lg py-[7px] pl-1.5 pr-1 transition-all duration-200",
          isSubject
            ? cn(
                "rounded-xl border py-2 pl-2",
                hue.card3,
                isSelected && cn("ring-2", hue.ring)
              )
            : isSelected
              ? cn("font-semibold", hue.card3, cn("ring-1", hue.ring))
              : hue.hover,
          node.type === "note" && node.noteCompleted && !isSelected && "opacity-75"
        )}
      >
        {node.type === "folder" ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleExpanded(node.id);
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-primary/15"
            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
          >
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-300",
                isSubject ? hue.text : "text-muted-foreground",
                isOpen && cn("rotate-90", hue.text)
              )}
            />
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              toggleComplete.mutate(!node.noteCompleted);
            }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-transform hover:scale-110"
            aria-label={node.noteCompleted ? "Mark as incomplete" : "Mark as complete"}
            title={node.noteCompleted ? "Mark as incomplete" : "Mark as complete"}
          >
            {node.noteCompleted ? (
              <CheckCircle2 className={cn("h-4 w-4", isSubject ? hue.text : "text-primary")} />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground/50" />
            )}
          </button>
        )}

        {isSubject ? (
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm",
              hue.grad
            )}
          >
            <BookMarked className="h-3.5 w-3.5" />
          </span>
        ) : (
          <span className={cn("h-4 w-1 shrink-0 rounded-full", hue.dot, node.depth >= 4 && "opacity-60")} />
        )}

        {isRenaming ? (
          <Input
            key={`rename-${node.id}`}
            ref={renameInputRef}
            defaultValue={node.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              // ignore the programmatic blur that happens right as the row mounts
              if (Date.now() - renameMountedAt.current < 350) {
                requestAnimationFrame(() => renameInputRef.current?.focus());
                return;
              }
              commitRename(e.target.value);
            }}
            onKeyDown={(e) => {
              // the surrounding treeitem robs Space/Enter via its own keydown
              // (selectNode + preventDefault) — swallow NOTHING while typing:
              // stop propagation so spaces between words survive renaming.
              e.stopPropagation();
              if (e.key === "Enter") commitRename((e.target as HTMLInputElement).value);
              if (e.key === "Escape") setRenamingId(null);
            }}
            className="h-6 rounded-md border-primary/50 bg-background/80 px-2 py-0 text-[13px] font-bengali"
          />
        ) : (
          <span
            className={cn(
              "min-w-[50%] flex-1 whitespace-pre-wrap break-words text-[13px] leading-snug",
              isSubject && "text-[13.5px] font-bold font-bengali",
              node.type === "note" && node.noteCompleted && "line-through decoration-primary/40"
            )}
            title={node.name}
          >
            {node.name}
          </span>
        )}

        {isSubject && typeof subjectCount === "number" && (
          <span className={cn("shrink-0 rounded-full px-1.5 text-[10px] font-bold", hue.chip)}>
            {subjectCount}
          </span>
        )}

        {!isRenaming && (
          <div
            className={cn(
              "ml-auto flex shrink-0 items-center gap-0.5",
              // প্রতিটি লেভেলে (১–৬) সব বাটন সবসময় স্পষ্টভাবে দৃশ্যমান
              !isSelected && "opacity-90 group-hover/node:opacity-100 focus-within:opacity-100"
            )}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (index === 0) return;
                const prev = siblings[index - 1];
                reorderTree([
                  { id: node.id, order: prev.order },
                  { id: prev.id, order: node.order },
                ]).then(() => {
                  qc.invalidateQueries({ queryKey: ["tree"] });
                });
              }}
              disabled={index === 0}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
              aria-label="Move up"
              title="Move up"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (index >= siblings.length - 1) return;
                const next = siblings[index + 1];
                reorderTree([
                  { id: node.id, order: next.order },
                  { id: next.id, order: node.order },
                ]).then(() => {
                  qc.invalidateQueries({ queryKey: ["tree"] });
                });
              }}
              disabled={index >= siblings.length - 1}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
              aria-label="Move down"
              title="Move down"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            {node.type === "folder" && canHaveChildren ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    onClick={(e) => e.stopPropagation()}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary"
                    aria-label={`Add node under ${node.name}`}
                    title="Add node"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="glass-strong w-44">
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      createChild.mutate("folder");
                    }}
                    className="gap-2"
                  >
                    <FolderPlus className="h-4 w-4 text-amber-600/80 dark:text-chart-2" /> New Section
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      createChild.mutate("note");
                    }}
                    className="gap-2"
                  >
                    <FilePlus2 className="h-4 w-4 text-primary" /> New Leaf Note
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button
                type="button"
                disabled
                className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground disabled:cursor-not-allowed disabled:opacity-30"
                aria-label={`Add node under ${node.name}`}
                title={
                  node.type === "note"
                    ? "Leaf notes cannot have children"
                    : "Max 6 levels reached — cannot add more"
                }
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setRenamingId(node.id);
              }}
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-primary/15 hover:text-primary"
              aria-label={`Rename ${node.name}`}
              title="Rename"
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeleteAsk(node);
              }}
              className="flex h-6 w-6 items-center justify-center rounded-md text-destructive/70 transition-colors hover:bg-destructive/15 hover:text-destructive"
              aria-label={`Delete ${node.name}`}
              title="Delete"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {node.type === "folder" && isOpen && node.children.length > 0 && (
          <motion.ul
            key="children"
            initial={{ height: 0, opacity: 0, x: -4 }}
            animate={{ height: "auto", opacity: 1, x: 0 }}
            exit={{ height: 0, opacity: 0, x: -4 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            className={cn(
              "relative ml-[13px] overflow-hidden border-l border-border/70 pl-2.5",
              isSubject && "border-l-2"
            )}
          >
            {node.children.map((child, ci) => (
              <TreeRow
                key={child.id}
                node={child}
                hueIndex={hueIndex}
                renamingId={renamingId}
                setRenamingId={setRenamingId}
                onDeleteAsk={onDeleteAsk}
                siblings={node.children}
                index={ci}
              />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
}

export function TreeSidebar() {
  const qc = useQueryClient();
  const { selectNode, setTrashOpen } = useBcsStore();
  const { data: nodes = [], isLoading } = useQuery({
    queryKey: ["tree"],
    queryFn: fetchTree,
  });

  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Node | null>(null);

  const tree = useMemo(() => buildTree(nodes), [nodes]);

  const subjectCounts = useMemo(() => {
    const map = new Map<string, number>();
    tree.forEach((root) => {
      const c = countDescendants(nodes, root.id);
      map.set(root.id, c.folders + c.notes);
    });
    return map;
  }, [tree, nodes]);

  const totalNotes = useMemo(() => nodes.filter((n) => n.type === "note").length, [nodes]);
  const doneNotes = useMemo(
    () => nodes.filter((n) => n.type === "note" && n.noteCompleted).length,
    [nodes]
  );
  const overallPct = totalNotes ? Math.round((doneNotes / totalNotes) * 100) : 0;

  const createSubject = useMutation({
    mutationFn: (type: "folder" | "note") =>
      createNode({
        name: type === "folder" ? "New Subject" : "Untitled Note",
        type,
        parentId: null,
      }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["tree"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      setRenamingId(created.id);
      if (created.type === "note") selectNode(created.id);
      toast.success("Subject created");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startSubject = (type: "folder" | "note") => {
    createSubject.mutate(type);
  };

  const doDelete = useMutation({
    mutationFn: (id: string) => deleteNode(id),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["tree"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      if (useBcsStore.getState().selectedId === id) selectNode(null);
      toast.success("Moved to Trash — restore anytime", {
        action: { label: "Open Trash", onClick: () => setTrashOpen(true) },
      });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteStats = deleteTarget
    ? countDescendants(nodes, deleteTarget.id)
    : { folders: 0, notes: 0 };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
        <div>
          <h2 className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
            <BookMarked className="h-4 w-4 text-primary" />
            Study Tree
          </h2>
          <p className="text-[11px] text-muted-foreground">
            {nodes.length} nodes · {totalNotes} leaf notes
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="h-8 gap-1 rounded-lg shadow-sm">
              <Plus className="h-3.5 w-3.5" /> Subject
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-strong w-44">
            <DropdownMenuItem onClick={() => startSubject("folder")} className="gap-2">
              <FolderPlus className="h-4 w-4 text-amber-600/80 dark:text-chart-2" /> Subject folder
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => startSubject("note")} className="gap-2">
              <FilePlus2 className="h-4 w-4 text-primary" /> Single note
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="px-4 pb-2">
        <div className="glass flex items-center gap-2 rounded-lg px-2.5 py-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Overall
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-chart-2"
              initial={{ width: 0 }}
              animate={{ width: `${overallPct}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>
          <span className="text-[10px] font-bold text-primary">{overallPct}%</span>
        </div>
      </div>

      <ScrollArea className="scroll-slim flex-1 overflow-y-auto px-3 pb-4">
        {isLoading ? (
          <div className="space-y-2 pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-lg bg-muted/60" />
            ))}
          </div>
        ) : tree.length === 0 ? (
          <div className="flex flex-col items-center gap-3 pt-14 text-center">
            <span className="glass-strong float-soft flex h-16 w-16 items-center justify-center rounded-2xl">
              <Sparkles className="h-7 w-7 text-primary" />
            </span>
            <p className="text-sm font-semibold">Your tree is empty</p>
            <p className="max-w-[220px] text-xs text-muted-foreground">
              Create your first subject — e.g. <span className="font-bengali">বাংলা</span>, English,
              Geography — up to 6 levels deep.
            </p>
            <Button size="sm" onClick={() => startSubject("folder")} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Subject
            </Button>
          </div>
        ) : (
          <ul role="tree" aria-label="Study tree" className="space-y-1.5 pt-1">
            {tree.map((root, i) => (
              <TreeRow
                key={root.id}
                node={root}
                hueIndex={i}
                subjectCount={subjectCounts.get(root.id)}
                renamingId={renamingId}
                setRenamingId={setRenamingId}
                onDeleteAsk={setDeleteTarget}
                siblings={tree}
                index={i}
              />
            ))}
          </ul>
        )}
      </ScrollArea>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle>Move “{deleteTarget?.name}” to Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              This moves{" "}
              <strong>
                {deleteStats.folders} section{deleteStats.folders === 1 ? "" : "s"} and{" "}
                {deleteStats.notes} note{deleteStats.notes === 1 ? "" : "s"}
              </strong>{" "}
              (including their documents &amp; links) to the Trash — you can restore them anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) doDelete.mutate(deleteTarget.id);
                setDeleteTarget(null);
              }}
            >
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}


