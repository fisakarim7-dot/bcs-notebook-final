"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  fetchNote,
  fetchQuestions,
  saveNote,
  fetchTree,
  fetchNoteItems,
  createNoteItem,
  updateNoteItem,
  deleteNoteItem,
  markRead,
} from "@/lib/bcs-api";
import { useBcsStore } from "@/lib/bcs-store";
import { ancestorsOf, namePathOf } from "@/lib/bcs-tree-utils";
import { toBn, type NoteItemDTO, type TreeNodeDTO } from "@/lib/bcs-types";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Circle,
  CloudUpload,
  FileDown,
  FileText,
  FolderOpen,
  HelpCircle,
  Link2,
  Loader2,
  NotebookPen,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { DocumentVault } from "./document-vault";
import { QuestionBankPanel } from "./question-bank";
import { CrossLinksBox } from "./cross-links";
import { FavButton } from "@/components/bcs/shared/fav-button";
import { Dashboard } from "@/components/bcs/dashboard/dashboard";
import { SmartLinks } from "./smart-links";
import { ReadBadge } from "@/components/bcs/shared/read-badge";
import { AiGenerateDialog } from "@/components/bcs/study/ai-generate-dialog";
import { SplitStudyRail } from "./split-study";
import { OcrDialog } from "./ocr-dialog";
import { fetchNoteVersions, restoreNoteVersion } from "@/lib/bcs-api";
import { History, Columns2, ScanText } from "lucide-react";

const RichEditor = dynamic(
  () => import("./rich-editor").then((m) => m.RichEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> <span className="font-bengali">এডিটর লোড হচ্ছে…</span>
      </div>
    ),
  }
);

// ---------- helpers ----------

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

const cardDateFmt = new Intl.DateTimeFormat("bn-BD", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

const savedTimeFmt = new Intl.DateTimeFormat("bn-BD", {
  hour: "2-digit",
  minute: "2-digit",
});

function Breadcrumb({ nodeId }: { nodeId: string }) {
  const { selectNode } = useBcsStore();
  const { data: nodes = [] } = useQuery({ queryKey: ["tree"], queryFn: fetchTree });
  const path = namePathOf(nodes, nodeId);
  const chain = ancestorsOf(nodes, nodeId);

  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-0.5 text-[11px] text-muted-foreground">
      {path.map((name, i) => {
        const isLast = i === path.length - 1;
        const targetId = i === 0 ? null : chain[i - 1];
        return (
          <span key={i} className="flex min-w-0 items-center gap-0.5">
            {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
            {isLast ? (
              <span className="truncate font-medium text-foreground font-bengali">{name}</span>
            ) : (
              <button
                onClick={() => targetId && selectNode(targetId)}
                className="truncate transition-colors hover:text-primary font-bengali"
              >
                {name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

// ---------- root ----------

export function Workspace() {
  const { selectedId, view } = useBcsStore();
  const nodeTab = useBcsStore((s) => s.nodeTab);
  const tabSeq = useBcsStore((s) => s.nodeTabSeq);
  const { data: nodes = [] } = useQuery({ queryKey: ["tree"], queryFn: fetchTree });
  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  // graceful fallback: selected node was deleted (or is unknown) → show dashboard
  if (view !== "node" || !selected) {
    return view === "node" ? <Dashboard /> : null;
  }

  // key resets list/editor/tab state whenever the node changes;
  // a deep-link (nodeTabSeq) re-mounts even for the same node to force the target tab
  return (
    <UniversalWorkspace
      key={selected.id + (nodeTab ? `:${tabSeq}` : "")}
      node={selected}
      initialTab={nodeTab ?? undefined}
    />
  );
}

// ---------- universal workspace (works for folders AND note nodes) ----------

function UniversalWorkspace({
  node,
  initialTab,
}: {
  node: TreeNodeDTO;
  initialTab?: string;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState(initialTab ?? "notes");
  const [editing, setEditing] = useState<NoteItemDTO | null>(null);
  const [split, setSplit] = useState(false);

  const { data: noteItems = [], isLoading: itemsLoading } = useQuery({
    queryKey: ["note-items", node.id],
    queryFn: () => fetchNoteItems(node.id),
  });

  // shared bridge note (documents/links) — works on folders too
  const { data: note } = useQuery({
    queryKey: ["note", node.id],
    queryFn: () => fetchNote(node.id),
  });

  // প্রশ্নব্যাংক count for the tab badge
  const { data: nodeQuestions = [] } = useQuery({
    queryKey: ["questions", node.id],
    queryFn: () => fetchQuestions(node.id),
  });
  const questionCount = nodeQuestions.length;

  const completed = node.noteCompleted ?? false;
  const toggleComplete = useMutation({
    mutationFn: (c: boolean) => saveNote(node.id, { completed: c }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tree"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["note", node.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <Breadcrumb nodeId={node.id} />
          <h1 className="flex items-center gap-2 truncate text-xl font-bold tracking-tight font-bengali">
            {node.type === "note" ? (
              <FileText className="h-5 w-5 shrink-0 text-primary" />
            ) : (
              <FolderOpen className="h-5 w-5 shrink-0 text-amber-600 dark:text-chart-2" />
            )}
            <span className="truncate">{node.name}</span>
          </h1>
        </div>
        {node.type === "note" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleComplete.mutate(!completed)}
                className={cn(
                  "gap-1.5 font-bengali transition-all",
                  completed && "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15"
                )}
              >
                {completed ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                {completed ? "সম্পন্ন হয়েছে" : "সম্পন্ন করুন"}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="font-bengali">ড্যাশবোর্ডে অগ্রগতি দেখায়</TooltipContent>
          </Tooltip>
        )}
        <FavButton
          kind="node"
          targetId={node.id}
          title={node.name}
          path={node.name}
          label="টপিক"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={split ? "default" : "outline"}
              size="sm"
              className="gap-1.5 font-bengali"
              onClick={() => setSplit((s) => !s)}
            >
              <Columns2 className="h-4 w-4" /> স্প্লিট
            </Button>
          </TooltipTrigger>
          <TooltipContent className="font-bengali">নোটের পাশে কার্ড/MCQ</TooltipContent>
        </Tooltip>
      </div>

      <div className={split ? "flex min-h-0 flex-1 gap-3" : "flex min-h-0 flex-1 flex-col"}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {editing ? (
            <NoteItemEditor node={node} item={editing} onBack={() => setEditing(null)} />
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col gap-0">
          <TabsList className="glass w-fit shrink-0 rounded-xl p-1">
            <TabsTrigger value="notes" className="gap-1.5 rounded-lg text-xs font-bengali">
              <NotebookPen className="h-3.5 w-3.5" /> নোট
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">
                {toBn(noteItems.length)}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="docs" className="gap-1.5 rounded-lg text-xs font-bengali">
              <FolderOpen className="h-3.5 w-3.5" /> ফাইল
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">
                {toBn(note?.documents.length ?? 0)}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="links" className="gap-1.5 rounded-lg text-xs font-bengali">
              <Link2 className="h-3.5 w-3.5" /> লিংক
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">
                {toBn(note?.links.length ?? 0)}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="questions" className="gap-1.5 rounded-lg text-xs font-bengali">
              <HelpCircle className="h-3.5 w-3.5" /> প্রশ্নব্যাংক
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[9px]">
                {toBn(questionCount)}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notes" className="mt-3 flex min-h-0 flex-1 flex-col">
            <NoteListPanel
              node={node}
              items={noteItems}
              isLoading={itemsLoading}
              onOpen={(item) => setEditing(item)}
            />
          </TabsContent>

          <TabsContent value="docs" className="scroll-slim mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            <DocumentVault nodeId={node.id} />
          </TabsContent>

          <TabsContent value="links" className="scroll-slim mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            <SmartLinks nodeId={node.id} />
          </TabsContent>

          <TabsContent value="questions" className="scroll-slim mt-3 min-h-0 flex-1 overflow-y-auto pr-1">
            <QuestionBankPanel node={node} />
          </TabsContent>
        </Tabs>
      )}
      </div>
      {split && (
        <div className="hidden w-80 shrink-0 lg:block">
          <SplitStudyRail onClose={() => setSplit(false)} />
        </div>
      )}
      </div>
    </motion.div>
  );
}

// ---------- note list panel ----------

function NoteListPanel({
  node,
  items,
  isLoading,
  onOpen,
}: {
  node: TreeNodeDTO;
  items: NoteItemDTO[];
  isLoading: boolean;
  onOpen: (item: NoteItemDTO) => void;
}) {
  const qc = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<NoteItemDTO | null>(null);
  const { data: nodes = [] } = useQuery({ queryKey: ["tree"], queryFn: fetchTree, staleTime: 60_000 });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["note-items", node.id] });
    qc.invalidateQueries({ queryKey: ["stats"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const create = useMutation({
    mutationFn: () => createNoteItem({ nodeId: node.id, title: "", content: "" }),
    onSuccess: (item) => {
      invalidate();
      onOpen(item);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setTrashOpen = useBcsStore((s) => s.setTrashOpen);

  const doDelete = useMutation({
    mutationFn: (id: string) => deleteNoteItem(id),
    onSuccess: () => {
      toast.success("নোটটি ট্র্যাশে সরানো হয়েছে", {
        action: { label: "ট্র্যাশ দেখুন", onClick: () => setTrashOpen(true) },
      });
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const doRead = useMutation({
    mutationFn: (id: string) => markRead("noteItem", id),
    onSuccess: (d) => {
      toast.success(`পঠন সংখ্যা: ${toBn(d.readCount)} বার`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="h-6 gap-1 px-2 font-bengali text-xs">
          <NotebookPen className="h-3 w-3" />
          মোট নোট: {toBn(items.length)}
        </Badge>
        <Button
          onClick={() => create.mutate()}
          disabled={create.isPending}
          className="ml-auto h-9 gap-1.5 font-bengali"
        >
          {create.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          নতুন নোট লিখুন
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> <span className="font-bengali">নোট লোড হচ্ছে…</span>
        </div>
      ) : items.length === 0 ? (
        <div className="glass flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
          <NotebookPen className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium font-bengali">
            এখনো কোনো নোট নেই — প্রথম নোটটি লিখে ফেলুন!
          </p>
          <p className="text-xs text-muted-foreground font-bengali">
            উপরের &quot;নতুন নোট লিখুন&quot; বোতামে চাপ দিন
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <NoteItemCard
              key={item.id}
              item={item}
              nodeId={node.id}
              nodePath={namePathOf(nodes, node.id).join(" › ")}
              onOpen={() => onOpen(item)}
              onRead={() => doRead.mutate(item.id)}
              readPending={doRead.isPending && doRead.variables === item.id}
              onAskDelete={() => setDeleteTarget(item)}
            />
          ))}
        </ul>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bengali">নোটটি ট্র্যাশে সরানো হবে</AlertDialogTitle>
            <AlertDialogDescription className="font-bengali">
              &quot;{deleteTarget?.title.trim() || "শিরোনামহীন নোট"}&quot; ট্র্যাশে যাবে — সেখান থেকে যেকোনো সময় ফেরানো যাবে। নিশ্চিত?
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

// ---------- note item card ----------

function NoteItemCard({
  item,
  nodeId,
  nodePath,
  onOpen,
  onRead,
  readPending,
  onAskDelete,
}: {
  item: NoteItemDTO;
  nodeId: string;
  nodePath: string;
  onOpen: () => void;
  onRead: () => void;
  readPending: boolean;
  onAskDelete: () => void;
}) {
  const plain = stripHtml(item.content);
  const preview = plain.length > 120 ? `${plain.slice(0, 120)}…` : plain;
  const untitled = !item.title.trim();

  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      className="min-w-0"
    >
      <div className="glass flex h-full flex-col rounded-xl p-4 transition-all duration-200 hover:border-primary/40 hover:shadow-[0_0_16px_var(--glow)]">
        <button
          onClick={onOpen}
          className="text-start"
          aria-label={`নোট খুলুন: ${untitled ? "শিরোনামহীন" : item.title}`}
        >
          <p
            className={cn(
              "truncate text-[14px] font-semibold font-bengali",
              untitled && "italic text-muted-foreground"
            )}
          >
            {untitled ? "শিরোনামহীন নোট" : item.title}
          </p>
          <p className="mt-1 line-clamp-2 min-h-[2rem] text-xs leading-5 text-muted-foreground">
            {preview || "খালি নোট — ক্লিক করে লিখুন…"}
          </p>
        </button>

        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2.5">
          <span className="text-[11px] text-muted-foreground font-bengali">
            {cardDateFmt.format(new Date(item.updatedAt))}
          </span>
          <ReadBadge count={item.readCount} className="ml-auto" />
        </div>

        <div className="mt-2 flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8 flex-1 gap-1.5 font-bengali" onClick={onOpen}>
            <Pencil className="h-3.5 w-3.5" /> খুলুন
          </Button>
          <FavButton
            kind="noteItem"
            targetId={item.id}
            title={item.title.trim() || "শিরোনামহীন নোট"}
            path={nodePath}
            meta={{ nodeId }}
            label="নোট"
          />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 sm:h-8 sm:w-8"
                onClick={onRead}
                disabled={readPending}
                aria-label="+১ পড়া হলো"
              >
                <BookOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="font-bengali">+১ পড়া হলো</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-11 w-11 text-muted-foreground hover:bg-destructive/15 hover:text-destructive sm:h-8 sm:w-8"
                onClick={onAskDelete}
                aria-label="নোট মুছুন"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="font-bengali">নোট মুছুন</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </motion.li>
  );
}

// ---------- note item editor ----------

type EditorSaveState = "idle" | "saving" | "saved";

function NoteItemEditor({
  node,
  item,
  onBack,
}: {
  node: TreeNodeDTO;
  item: NoteItemDTO;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content);
  const [font, setFont] = useState<"kalpurush" | "times">(
    item.font === "times" ? "times" : "kalpurush"
  );
  const [saveState, setSaveState] = useState<EditorSaveState>("idle");
  const [savedAtLabel, setSavedAtLabel] = useState<string | null>(null);
  const [readCount, setReadCount] = useState(item.readCount);
  const [aiOpen, setAiOpen] = useState(false);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [histOpen, setHistOpen] = useState(false);
  const lastSaved = useRef({ title: item.title, content: item.content });
  const firstRun = useRef(true);

  const saveMut = useMutation({
    mutationFn: (patch: { title?: string; content?: string; font?: string }) =>
      updateNoteItem(item.id, patch),
    onSuccess: (_data, patch) => {
      if (patch.title !== undefined) lastSaved.current.title = patch.title;
      if (patch.content !== undefined) lastSaved.current.content = patch.content;
      setSaveState("saved");
      setSavedAtLabel(savedTimeFmt.format(new Date()));
    },
    onError: (e: Error) => {
      setSaveState("idle");
      toast.error(`সেভ করা যায়নি: ${e.message}`);
    },
  });
  const saveMutRef = useRef(saveMut);
  useEffect(() => {
    saveMutRef.current = saveMut;
  });

  // debounced autosave (800ms) on title/content changes
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => {
      const patch: { title?: string; content?: string } = {};
      if (title !== lastSaved.current.title) patch.title = title;
      if (content !== lastSaved.current.content) patch.content = content;
      if (Object.keys(patch).length === 0) {
        setSaveState("idle");
        return;
      }
      saveMutRef.current.mutate(patch);
    }, 800);
    return () => clearTimeout(t);
  }, [title, content]);

  const handleTitleChange = (v: string) => {
    setTitle(v);
    setSaveState("saving");
  };

  const handleContentChange = (v: string) => {
    setContent(v);
    setSaveState("saving");
  };

  const changeFont = (f: "kalpurush" | "times") => {
    setFont(f);
    setSaveState("saving");
    saveMutRef.current.mutate({ font: f });
  };

  const doRead = useMutation({
    mutationFn: () => markRead("noteItem", item.id),
    onSuccess: (d) => {
      setReadCount(d.readCount);
      qc.invalidateQueries({ queryKey: ["note-items", node.id] });
      toast.success(`পঠন সংখ্যা: ${toBn(d.readCount)} বার`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // flush pending edits before returning to the list
  const flushPending = async (): Promise<boolean> => {
    const patch: { title?: string; content?: string } = {};
    if (title !== lastSaved.current.title) patch.title = title;
    if (content !== lastSaved.current.content) patch.content = content;
    if (Object.keys(patch).length > 0) {
      try {
        await saveMutRef.current.mutateAsync(patch);
      } catch {
        return false; // error toast already shown
      }
    }
    return true;
  };

  const handleBack = async () => {
    await flushPending();
    qc.invalidateQueries({ queryKey: ["note-items", node.id] });
    qc.invalidateQueries({ queryKey: ["stats"] });
    onBack();
  };

  // save any pending edit first, then open the print page (browser → Save as PDF)
  const handleSavePdf = async () => {
    const ok = await flushPending();
    if (!ok) {
      toast.error("পেন্ডিং সেভ শেষ না হওয়ায় PDF খোলা যায়নি — আবার চেষ্টা করুন");
      return;
    }
    qc.invalidateQueries({ queryKey: ["note-items", node.id] });
    window.open(`/api/note-items/${item.id}/print`, "_blank", "noopener");
  };

  // save any pending edit first, then open the full-window annotated reader
  const handleOpenReader = async () => {
    const ok = await flushPending();
    if (!ok) {
      toast.error("পেন্ডিং সেভ শেষ না হওয়ায় রিডার খোলা যায়নি — আবার চেষ্টা করুন");
      return;
    }
    qc.invalidateQueries({ queryKey: ["note-items", node.id] });
    window.open(`/api/note-items/${item.id}/view`, "_blank", "noopener");
  };

  // save any pending edit first, then open the AI generation dialog
  const handleAiCards = async () => {
    const ok = await flushPending();
    if (!ok) {
      toast.error("পেন্ডিং সেভ শেষ না হওয়ায় AI খোলা যায়নি — আবার চেষ্টা করুন");
      return;
    }
    qc.invalidateQueries({ queryKey: ["note-items", node.id] });
    setAiOpen(true);
  };

  return (
    <div className="scroll-slim flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleBack}
          className="gap-1.5 font-bengali"
        >
          <ArrowLeft className="h-4 w-4" /> তালিকায় ফিরুন
        </Button>
        <span
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          {saveState === "saving" ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="font-bengali">সেভ হচ্ছে…</span>
            </>
          ) : saveState === "saved" && savedAtLabel ? (
            <>
              <CloudUpload className="h-3 w-3 text-primary" />
              <span className="font-bengali">সংরক্ষিত {savedAtLabel}</span>
            </>
          ) : null}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => setHistOpen(true)} className="h-9 gap-1.5 font-bengali" aria-label="ভার্সন হিস্ট্রি">
                <History className="h-4 w-4" />
                <span className="hidden sm:inline">হিস্ট্রি</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="font-bengali">নোটের পুরনো ভার্সন</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={() => setOcrOpen(true)} className="h-9 gap-1.5 font-bengali" aria-label="OCR">
                <ScanText className="h-4 w-4" />
                <span className="hidden sm:inline">OCR</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="font-bengali">ছবি থেকে লেখা</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAiCards}
                className="h-9 gap-1.5 font-bengali"
                aria-label="AI দিয়ে ফ্ল্যাশকার্ড/MCQ বানান"
              >
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="hidden sm:inline">AI কার্ড</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="font-bengali">
              এই নোটের লেখা থেকে AI দিয়ে ফ্ল্যাশকার্ড বা MCQ বানান
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenReader}
                className="h-9 gap-1.5 font-bengali"
                aria-label="হাইলাইট রিডারে খুলুন"
              >
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="hidden sm:inline">রিডার</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="font-bengali">
              নতুন উইন্ডোতে পড়ুন — হাইলাইট, বোল্ড, ইটালিক ও রং দাগ দিতে পারবেন
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSavePdf}
                className="h-9 gap-1.5 font-bengali"
                aria-label="প্রিন্ট / PDF হিসেবে সেভ করুন"
              >
                <FileDown className="h-4 w-4 text-primary" />
                <span className="hidden sm:inline">PDF সেভ</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="font-bengali">
              প্রিন্ট পেজ খুলবে — সেখানে "Save as PDF" দিলে নোটটি PDF হবে
            </TooltipContent>
          </Tooltip>
          <ReadBadge count={readCount} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => doRead.mutate()}
                disabled={doRead.isPending}
                aria-label="+১ পড়া হলো"
              >
                <BookOpen className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent className="font-bengali">+১ পড়া হলো</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Input
        value={title}
        onChange={(e) => handleTitleChange(e.target.value)}
        placeholder="নোটের শিরোনাম"
        aria-label="নোটের শিরোনাম"
        className="mb-2 h-11 shrink-0 border-none bg-transparent px-0 text-lg font-bold font-bengali shadow-none focus-visible:ring-0 md:text-xl"
      />

      <RichEditor
        value={content}
        onChange={handleContentChange}
        font={font}
        onFontChange={changeFont}
        saveState={saveState}
      />

      {/* Cross Linking (#33) — সম্পর্কিত প্রশ্ন / টপিকস / আর্টিকেল */}
      <div className="mt-3 shrink-0 pb-1">
        <CrossLinksBox source={{ kind: "noteItem", id: item.id }} accent="cyan" />
      </div>

      <AiGenerateDialog
        open={aiOpen}
        onOpenChange={setAiOpen}
        defaultNodeId={node.id}
      />
      <OcrDialog
        open={ocrOpen}
        onOpenChange={setOcrOpen}
        onText={(t) => {
          const escaped = t
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          const html = escaped
            .split(/\n+/)
            .map((line) => `<p>${line}</p>`)
            .join("");
          setContent((c) => c + html);
          setSaveState("saving");
        }}
      />
      <NoteHistoryDialog
        open={histOpen}
        onOpenChange={setHistOpen}
        noteItemId={item.id}
        onRestore={(titleV, contentV) => {
          setTitle(titleV);
          setContent(contentV);
          setSaveState("saving");
        }}
      />
    </div>
  );
}

function NoteHistoryDialog({
  open,
  onOpenChange,
  noteItemId,
  onRestore,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  noteItemId: string;
  onRestore: (title: string, content: string) => void;
}) {
  const { data: versions = [] } = useQuery({
    queryKey: ["note-versions", noteItemId],
    queryFn: () => fetchNoteVersions(noteItemId),
    enabled: open,
  });
  const qc = useQueryClient();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="glass-strong max-h-[80vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-bengali">নোট হিস্ট্রি</AlertDialogTitle>
          <AlertDialogDescription className="font-bengali">
            প্রতি কয়েক মিনিটে স্ন্যাপশট — সর্বশেষ ২০টি। রিস্টোর করলে এডিটরে ফিরবে।
          </AlertDialogDescription>
        </AlertDialogHeader>
        {versions.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground font-bengali">
            এখনো কোনো ভার্সন নেই
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {versions.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between rounded-lg border px-3 py-2 text-xs font-bengali"
              >
                <span>{new Date(v.createdAt).toLocaleString("bn-BD")}</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 font-bengali"
                  onClick={async () => {
                    const r = await restoreNoteVersion(noteItemId, v.id);
                    onRestore(r.title, r.content);
                    qc.invalidateQueries({ queryKey: ["note-items"] });
                    onOpenChange(false);
                  }}
                >
                  ফেরান
                </Button>
              </li>
            ))}
          </ul>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel className="font-bengali">বন্ধ</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
