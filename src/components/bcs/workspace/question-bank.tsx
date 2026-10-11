"use client";

/**
 * প্রশ্নব্যাংক — PREMIUM per-node written question bank.
 *
 * Every question renders as its own tall COLORFUL card (6 rotating hue
 * themes), stacked vertically one below another. Inside each card the user
 * collects ANSWER SOURCES for that question — uploaded files, images and
 * cloud links — and keeps a personal rich-text note (debounced autosave).
 * The 💜 button saves to the universal favorites store.
 */

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  addQuestionLink,
  addQuestionRichSource,
  updateQuestionRichSource,
  createQuestion,
  deleteQuestion,
  deleteQuestionAttachment,
  fetchQuestions,
  fetchTree,
  updateQuestion,
  uploadQuestionAttachment,
} from "@/lib/bcs-api";
import { namePathOf } from "@/lib/bcs-tree-utils";
import { useBcsStore } from "@/lib/bcs-store";
import type {
  QuestionAttachmentDTO,
  QuestionDTO,
  TreeNodeDTO,
} from "@/lib/bcs-types";
import { toBn } from "@/lib/bcs-types";
import { cn } from "@/lib/utils";
import { FavButton } from "@/components/bcs/shared/fav-button";
import { CrossLinksBox } from "./cross-links";
import { ExplanationRichView, isRichEmpty } from "@/components/bcs/study/explanation-editor";
import {
  ArrowLeft,
  BarChart3,
  Cloud,
  CloudDrizzle,
  FileDown,
  NotebookPen,
  Download,
  ExternalLink,
  FilePlus2,
  FileText,
  Globe,
  HardDrive,
  HelpCircle,
  Image as ImageIcon,
  ImagePlus,
  Layers,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Printer,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";

const ExplanationEditor = dynamic(
  () =>
    import("@/components/bcs/study/explanation-editor").then(
      (m) => m.ExplanationEditor
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="font-bengali">এডিটর লোড হচ্ছে…</span>
      </div>
    ),
  }
);

// The SAME rich text editor used by every node's "নোট" button (font + full toolbar)
const RichEditor = dynamic(
  () => import("./rich-editor").then((m) => m.RichEditor),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="font-bengali">এডিটর লোড হচ্ছে…</span>
      </div>
    ),
  }
);

const createdFmt = new Intl.DateTimeFormat("bn-BD", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

/* ------------------------------------------------------------------ */
/*  helpers                                                            */
/* ------------------------------------------------------------------ */

function excerpt(q: QuestionDTO): string {
  const t = q.title.trim();
  if (t) return t;
  const plain = q.contentPlain.trim();
  return plain.length > 90 ? plain.slice(0, 90) + "…" : plain || "শিরোনামহীন প্রশ্ন";
}

/** B / KB / MB / GB — 1 decimal (except bytes). */
function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"] as const;
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/* ------------------------------------------------------------------ */
/*  hue themes — 6 rotating colorful card styles                       */
/* ------------------------------------------------------------------ */

const HUES = ["violet", "fuchsia", "emerald", "amber", "rose", "teal"] as const;
type CardHue = (typeof HUES)[number];

interface HueStyle {
  strip: string; // top gradient strip
  card: string; // tinted card background
  ring: string; // ring + hover ring
  chip: string; // number chip / accents
  addBtn: string; // hover accent for the small add-buttons
  label: string; // section label tone
  wm: string; // watermark icon tone
}

const HUE: Record<CardHue, HueStyle> = {
  violet: {
    strip: "bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500",
    card: "bg-violet-500/[0.05]",
    ring: "ring-violet-500/25 hover:ring-violet-500/45",
    chip: "bg-violet-500/20 text-violet-700 dark:text-violet-300",
    addBtn: "hover:border-violet-500/60 hover:bg-violet-500/10 hover:text-violet-700 dark:hover:text-violet-300",
    label: "text-violet-700/90 dark:text-violet-300/90",
    wm: "text-violet-500",
  },
  fuchsia: {
    strip: "bg-gradient-to-r from-fuchsia-500 via-pink-500 to-rose-500",
    card: "bg-fuchsia-500/[0.05]",
    ring: "ring-fuchsia-500/25 hover:ring-fuchsia-500/45",
    chip: "bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300",
    addBtn: "hover:border-fuchsia-500/60 hover:bg-fuchsia-500/10 hover:text-fuchsia-700 dark:hover:text-fuchsia-300",
    label: "text-fuchsia-700/90 dark:text-fuchsia-300/90",
    wm: "text-fuchsia-500",
  },
  emerald: {
    strip: "bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-500",
    card: "bg-emerald-500/[0.05]",
    ring: "ring-emerald-500/25 hover:ring-emerald-500/45",
    chip: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
    addBtn: "hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300",
    label: "text-emerald-700/90 dark:text-emerald-300/90",
    wm: "text-emerald-500",
  },
  amber: {
    strip: "bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500",
    card: "bg-amber-500/[0.05]",
    ring: "ring-amber-500/25 hover:ring-amber-500/45",
    chip: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    addBtn: "hover:border-amber-500/60 hover:bg-amber-500/10 hover:text-amber-700 dark:hover:text-amber-300",
    label: "text-amber-700/90 dark:text-amber-300/90",
    wm: "text-amber-500",
  },
  rose: {
    strip: "bg-gradient-to-r from-rose-500 via-pink-500 to-rose-500",
    card: "bg-rose-500/[0.05]",
    ring: "ring-rose-500/25 hover:ring-rose-500/45",
    chip: "bg-rose-500/20 text-rose-700 dark:text-rose-300",
    addBtn: "hover:border-rose-500/60 hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-300",
    label: "text-rose-700/90 dark:text-rose-300/90",
    wm: "text-rose-500",
  },
  teal: {
    strip: "bg-gradient-to-r from-teal-500 via-cyan-500 to-teal-500",
    card: "bg-teal-500/[0.05]",
    ring: "ring-teal-500/25 hover:ring-teal-500/45",
    chip: "bg-teal-500/20 text-teal-700 dark:text-teal-300",
    addBtn: "hover:border-teal-500/60 hover:bg-teal-500/10 hover:text-teal-700 dark:hover:text-teal-300",
    label: "text-teal-700/90 dark:text-teal-300/90",
    wm: "text-teal-500",
  },
};

const ADD_BTN_BASE =
  "flex h-7 items-center gap-1 rounded-lg border border-border/70 bg-background/80 px-2 text-[11px] font-semibold font-bengali transition-all";

/* ------------------------------------------------------------------ */
/*  attachment tones + provider icons                                  */
/* ------------------------------------------------------------------ */

function attachmentTone(a: QuestionAttachmentDTO): { box: string; chip: string } {
  if (a.kind === "note") {
    return {
      box: "border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-orange-500/[0.05]",
      chip: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
    };
  }
  if (a.kind === "data") {
    return {
      box: "border-rose-500/30 bg-gradient-to-r from-rose-500/10 to-pink-500/[0.05]",
      chip: "bg-rose-500/20 text-rose-700 dark:text-rose-300",
    };
  }
  if (a.kind === "link") {
    switch (a.provider) {
      case "drive":
        return {
          box: "border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 to-teal-500/[0.05]",
          chip: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
        };
      case "onedrive":
        return {
          box: "border-sky-500/30 bg-gradient-to-r from-sky-500/10 to-teal-500/[0.05]",
          chip: "bg-sky-500/20 text-sky-700 dark:text-sky-300",
        };
      case "dropbox":
        return {
          box: "border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/[0.05]",
          chip: "bg-violet-500/20 text-violet-700 dark:text-violet-300",
        };
      default:
        return {
          box: "border-teal-500/30 bg-gradient-to-r from-teal-500/10 to-cyan-500/[0.05]",
          chip: "bg-teal-500/20 text-teal-700 dark:text-teal-300",
        };
    }
  }
  if (a.kind === "image") {
    return {
      box: "border-violet-500/30 bg-gradient-to-r from-violet-500/10 to-fuchsia-500/[0.05]",
      chip: "bg-violet-500/20 text-violet-700 dark:text-violet-300",
    };
  }
  return {
    box: "border-sky-500/30 bg-gradient-to-r from-sky-500/10 to-teal-500/[0.05]",
    chip: "bg-sky-500/20 text-sky-700 dark:text-sky-300",
  };
}

const PROVIDER_LABEL: Record<string, string> = {
  drive: "Google Drive লিংক",
  onedrive: "OneDrive লিংক",
  dropbox: "Dropbox লিংক",
  other: "ওয়েব লিংক",
};

function providerIcon(provider: string): React.ReactNode {
  switch (provider) {
    case "drive":
      return <CloudDrizzle className="h-3.5 w-3.5" />;
    case "onedrive":
      return <Cloud className="h-3.5 w-3.5" />;
    case "dropbox":
      return <HardDrive className="h-3.5 w-3.5" />;
    default:
      return <Globe className="h-3.5 w-3.5" />;
  }
}

/* ------------------------------------------------------------------ */
/*  print (kept from the previous version)                             */
/* ------------------------------------------------------------------ */

/** Open a self-contained print window with all questions of this node. */
function printQuestions(nodeName: string, path: string, questions: QuestionDTO[]) {
  const win = window.open("", "_blank", "width=880,height=960");
  if (!win) {
    toast.error("প্রিন্ট উইন্ডো খোলা যায়নি — পপআপ ব্লকার দেখুন");
    return;
  }
  const rows = questions
    .map(
      (q, i) => `
      <div class="q">
        <div class="qt">${toBn(i + 1)}. ${escapeHtml(excerpt(q))}</div>
        <div class="qb">${q.contentHtml}</div>
      </div>`
    )
    .join("");
  win.document.write(`<!doctype html><html lang="bn"><head><meta charset="utf-8"/>
  <title>প্রশ্নব্যাংক — ${escapeHtml(nodeName)}</title>
  <style>
    @page { margin: 18mm 14mm; }
    @font-face { font-family:'Kalpurush'; src:url('${location.origin}/fonts/kalpurush.ttf') format('truetype'); }
    body { font-family: 'Kalpurush','Noto Sans Bengali',sans-serif; color:#111; line-height:1.7; }
    h1 { font-size: 20px; margin: 0 0 2px; }
    .path { color:#666; font-size: 12px; margin-bottom: 14px; }
    .q { border:1px solid #ddd; border-radius:8px; padding:12px 14px; margin-bottom:12px; page-break-inside: avoid; }
    .qt { font-weight:700; font-size:14.5px; margin-bottom:6px; }
    .qb { font-size:13.5px; }
    .qb table { border-collapse: collapse; } .qb td, .qb th { border:1px solid #999; padding:4px 8px; }
    .qb table, .qb td, .qb th, .qb td *, .qb th * { font-family: 'Kalpurush','Noto Sans Bengali',sans-serif !important; }
    .qb code, .qb pre { font-family: ui-monospace, Consolas, 'Courier New', 'Kalpurush','Noto Sans Bengali', monospace !important; }
    .qb img { max-width: 100%; }
    .qb blockquote { border-left:3px solid #bbb; margin:6px 0; padding-left:10px; color:#444; }
  </style></head><body>
  <h1>প্রশ্নব্যাংক — ${escapeHtml(nodeName)}</h1>
  <div class="path">${escapeHtml(path)} · মোট প্রশ্ন: ${toBn(questions.length)} টি</div>
  ${rows}
  <script>window.onload=function(){setTimeout(function(){window.print()},250)}</script>
  </body></html>`);
  win.document.close();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------------ */
/*  panel                                                              */
/* ------------------------------------------------------------------ */

export function QuestionBankPanel({ node }: { node: TreeNodeDTO }) {
  const qc = useQueryClient();
  const { data: nodes = [] } = useQuery({
    queryKey: ["tree"],
    queryFn: fetchTree,
    staleTime: 60_000,
  });

  const [editing, setEditing] = useState<QuestionDTO | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuestionDTO | null>(null);
  const [openNoteId, setOpenNoteId] = useState<string | null>(null);

  const { data: questions = [], isLoading } = useQuery({
    queryKey: ["questions", node.id],
    queryFn: () => fetchQuestions(node.id),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["questions", node.id] });
    qc.invalidateQueries({ queryKey: ["questions"] });
    qc.invalidateQueries({ queryKey: ["search"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  const setTrashOpen = useBcsStore((s) => s.setTrashOpen);

  const doDelete = useMutation({
    mutationFn: (id: string) => deleteQuestion(id),
    onSuccess: () => {
      toast.success("প্রশ্নটি ট্র্যাশে সরানো হয়েছে", {
        action: { label: "ট্র্যাশ দেখুন", onClick: () => setTrashOpen(true) },
      });
      setDeleteTarget(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nodePath = namePathOf(nodes, node.id).join(" › ");

  return (
    <div className="scroll-slim min-h-0 flex-1 overflow-y-auto pr-1">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant="secondary" className="h-6 gap-1 px-2 font-bengali text-xs">
          <HelpCircle className="h-3 w-3" />
          মোট প্রশ্ন: {toBn(questions.length)}
        </Badge>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 font-bengali"
              disabled={questions.length === 0}
              onClick={() => printQuestions(node.name, nodePath, questions)}
            >
              <Printer className="h-4 w-4" /> প্রিন্ট
            </Button>
          </TooltipTrigger>
          <TooltipContent className="font-bengali">সব প্রশ্ন প্রিন্ট/PDF</TooltipContent>
        </Tooltip>
        <Button
          onClick={() => setEditing("new")}
          className="ml-auto h-9 gap-1.5 font-bengali"
        >
          <Plus className="h-4 w-4" /> নতুন প্রশ্ন লিখুন
        </Button>
      </div>

      {editing ? (
        <QuestionEditor
          node={node}
          question={editing === "new" ? null : editing}
          onDone={() => {
            setEditing(null);
            invalidate();
          }}
        />
      ) : isLoading ? (
        <div className="flex h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />{" "}
          <span className="font-bengali">প্রশ্ন লোড হচ্ছে…</span>
        </div>
      ) : questions.length === 0 ? (
        <div className="glass flex flex-col items-center gap-2 rounded-2xl p-10 text-center">
          <HelpCircle className="h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm font-medium font-bengali">
            এখনো কোনো লিখিত প্রশ্ন নেই — প্রথম প্রশ্নটি লিখে ফেলুন!
          </p>
          <p className="text-xs text-muted-foreground font-bengali">
            প্রতিটি প্রশ্নের নিচে উত্তর-সোর্স (ফাইল, ছবি, লিংক) ও ব্যক্তিগত নোট জমা রাখা যাবে
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-4">
          {questions.map((q, i) => (
            <QuestionCard
              key={q.id}
              q={q}
              index={i}
              nodePath={nodePath}
              noteOpen={openNoteId === q.id}
              onToggleNote={() =>
                setOpenNoteId((cur) => (cur === q.id ? null : q.id))
              }
              onEdit={() => setEditing(q)}
              onAskDelete={() => setDeleteTarget(q)}
              invalidate={invalidate}
            />
          ))}
        </ul>
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent className="glass-strong">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-bengali">প্রশ্নটি ট্র্যাশে সরানো হবে</AlertDialogTitle>
            <AlertDialogDescription className="font-bengali">
              &quot;{deleteTarget ? excerpt(deleteTarget) : ""}&quot; মুছলে এর সব উত্তর-সোর্স
              (ফাইল, ছবি, লিংক) ও নোটও একসাথে ট্র্যাশে যাবে — ট্র্যাশ থেকে ফেরালে সবাই ফেরত আসবে। নিশ্চিত?
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

/* ------------------------------------------------------------------ */
/*  one premium question card                                          */
/* ------------------------------------------------------------------ */

function QuestionCard({
  q,
  index,
  nodePath,
  noteOpen,
  onToggleNote,
  onEdit,
  onAskDelete,
  invalidate,
}: {
  q: QuestionDTO;
  index: number;
  nodePath: string;
  noteOpen: boolean;
  onToggleNote: () => void;
  onEdit: () => void;
  onAskDelete: () => void;
  invalidate: () => void;
}) {
  const hue = HUES[index % HUES.length];
  const h = HUE[hue];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<{ id: string; name: string; pct: number }[]>([]);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkName, setLinkName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [hasNote, setHasNote] = useState(() => !isRichEmpty(q.noteHtml));
  // নোট / তথ্য-উপাত্ত — which rich-text source is open in the editor
  const [editingSourceId, setEditingSourceId] = useState<string | null>(null);
  const editingSource = editingSourceId
    ? q.attachments.find((a) => a.id === editingSourceId) ?? null
    : null;

  const addRichMut = useMutation({
    mutationFn: (kind: "note" | "data") => {
      const base = kind === "note" ? "নোট" : "তথ্য-উপাত্ত";
      const count = q.attachments.filter((a) => a.kind === kind).length;
      return addQuestionRichSource(q.id, {
        kind,
        name: count > 0 ? `${base} ${toBn(count + 1)}` : base,
      });
    },
    onSuccess: (att) => {
      toast.success(att.kind === "note" ? "নতুন নোট তৈরি হয়েছে" : "নতুন তথ্য-উপাত্ত তৈরি হয়েছে");
      invalidate();
      setEditingSourceId(att.id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addLinkMut = useMutation({
    mutationFn: () =>
      addQuestionLink(q.id, { name: linkName.trim() || undefined, url: linkUrl.trim() }),
    onSuccess: () => {
      toast.success("লিংক যোগ হয়েছে");
      setLinkName("");
      setLinkUrl("");
      setLinkOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setTrashOpen = useBcsStore((s) => s.setTrashOpen);

  const delAtt = useMutation({
    mutationFn: (id: string) => deleteQuestionAttachment(id),
    onSuccess: () => {
      toast.success("সোর্সটি ট্র্যাশে সরানো হয়েছে", {
        action: { label: "ট্র্যাশ দেখুন", onClick: () => setTrashOpen(true) },
      });
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const handleFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const uid = `${f.name}-${Date.now()}-${i}`;
      setUploads((u) => [...u, { id: uid, name: f.name, pct: 0 }]);
      try {
        await uploadQuestionAttachment(q.id, f, {
          onProgress: (pct) =>
            setUploads((u) => u.map((x) => (x.id === uid ? { ...x, pct } : x))),
        });
        toast.success(`যুক্ত হয়েছে: ${f.name}`);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "আপলোড ব্যর্থ হয়েছে");
      } finally {
        setUploads((u) => u.filter((x) => x.id !== uid));
        invalidate();
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const submitLink = () => {
    if (!linkUrl.trim()) {
      toast.error("আগে একটি লিংক পেস্ট করুন");
      return;
    }
    addLinkMut.mutate();
  };

  return (
    <li
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl shadow-[0_1px_2px_rgb(0_0_0/0.05),0_10px_28px_-16px_rgb(0_0_0/0.35)] ring-1 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_2px_4px_rgb(0_0_0/0.06),0_18px_40px_-18px_rgb(0_0_0/0.4)]",
        h.card,
        h.ring
      )}
    >
      <div className={cn("h-1 w-full", h.strip)} />
      <HelpCircle
        className={cn("pointer-events-none absolute -bottom-6 -right-4 h-24 w-24 rotate-12 opacity-[0.06]", h.wm)}
        aria-hidden
      />

      <div className="relative flex flex-col gap-3 p-4 sm:p-5">
        {/* header: number chip + excerpt + actions */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                "flex h-7 shrink-0 items-center rounded-full px-2.5 text-[11px] font-bold font-bengali",
                h.chip
              )}
            >
              প্রশ্ন {toBn(index + 1)}
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-bold font-bengali" title={excerpt(q)}>
              {excerpt(q)}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            <FavButton
              kind="question"
              targetId={q.id}
              title={excerpt(q)}
              path={q.nodePath ?? nodePath}
              meta={{ nodeId: q.nodeId ?? undefined }}
              label="প্রশ্ন"
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  aria-label="প্রশ্ন সম্পাদনা"
                  onClick={onEdit}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="font-bengali">সম্পাদনা</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                  aria-label="প্রশ্ন মুছুন"
                  onClick={onAskDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="font-bengali">মুছে ফেলুন</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* question body */}
        <ExplanationRichView html={q.contentHtml} tone="violet" label="প্রশ্ন" />

        {/* Cross Linking (#33) — সম্পর্কিত টপিকস / নোট / ফাইল / প্রশ্ন */}
        <CrossLinksBox source={{ kind: "question", id: q.id }} accent={hue} />

        {/* উত্তর ও সোর্স */}
        <div className="rounded-xl border border-border/60 bg-background/55 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <span className={cn("flex items-center gap-1 text-[11px] font-bold font-bengali", h.label)}>
              <Layers className="h-3.5 w-3.5" />
              উত্তর ও সোর্স
            </span>
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-bengali">
              {toBn(q.attachments.length)}
            </Badge>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-1">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={cn(ADD_BTN_BASE, h.addBtn)}
              >
                <FilePlus2 className="h-3.5 w-3.5" /> ফাইল
              </button>
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className={cn(ADD_BTN_BASE, h.addBtn)}
              >
                <ImagePlus className="h-3.5 w-3.5" /> ছবি
              </button>
              <button
                type="button"
                onClick={() => setLinkOpen((o) => !o)}
                aria-expanded={linkOpen}
                className={cn(ADD_BTN_BASE, h.addBtn)}
              >
                <Link2 className="h-3.5 w-3.5" /> লিংক
              </button>
              <button
                type="button"
                onClick={() => addRichMut.mutate("note")}
                disabled={addRichMut.isPending}
                className={cn(ADD_BTN_BASE, h.addBtn)}
              >
                <NotebookPen className="h-3.5 w-3.5" /> নোট
              </button>
              <button
                type="button"
                onClick={() => addRichMut.mutate("data")}
                disabled={addRichMut.isPending}
                className={cn(ADD_BTN_BASE, h.addBtn)}
              >
                <BarChart3 className="h-3.5 w-3.5" /> তথ্য-উপাত্ত
              </button>
            </div>
          </div>

          {/* inline link mini-form */}
          {linkOpen && (
            <div className="mb-2 flex flex-col gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.06] p-2 sm:flex-row sm:items-center">
              <Input
                value={linkName}
                onChange={(e) => setLinkName(e.target.value)}
                placeholder="নাম (ঐচ্ছিক)"
                className="h-8 text-[13px] font-bengali sm:w-44"
                aria-label="লিংকের নাম"
              />
              <Input
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitLink()}
                placeholder="https://…"
                type="url"
                inputMode="url"
                className="h-8 flex-1 font-mono text-xs"
                aria-label="লিংক URL"
              />
              <Button
                size="sm"
                className="h-8 gap-1 font-bengali"
                onClick={submitLink}
                disabled={addLinkMut.isPending}
              >
                {addLinkMut.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5" />
                )}
                যোগ করুন
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setLinkOpen(false)}
                aria-label="লিংক ফর্ম বন্ধ করুন"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* upload progress */}
          {uploads.map((u) => (
            <div
              key={u.id}
              className="mb-1.5 rounded-lg border border-dashed border-sky-500/40 bg-sky-500/[0.06] p-2"
            >
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bengali">
                <Loader2 className="h-3 w-3 shrink-0 animate-spin text-sky-600 dark:text-sky-300" />
                <span className="min-w-0 flex-1 truncate">{u.name}</span>
                <span className="shrink-0 font-bold text-sky-700 dark:text-sky-300">
                  আপলোড হচ্ছে… {toBn(u.pct)}%
                </span>
              </div>
              <Progress value={u.pct} className="h-1.5" aria-label={`${u.name} আপলোড প্রগ্রেস`} />
            </div>
          ))}

          {/* rich-text নোট / তথ্য-উপাত্ত editor */}
          {editingSource && (
            <div className="mb-2">
              <RichSourceEditor
                key={editingSource.id}
                source={editingSource}
                onClose={() => {
                  setEditingSourceId(null);
                  invalidate();
                }}
              />
            </div>
          )}

          {q.attachments.length === 0 ? (
            <p className="py-1.5 text-center text-[11px] text-muted-foreground font-bengali">
              এখনো কোনো উত্তর-সোর্স নেই — ফাইল, ছবি, লিংক, নোট বা তথ্য-উপাত্ত যোগ করুন
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {q.attachments.map((a) => (
                <AttachmentRow
                  key={a.id}
                  a={a}
                  deleting={delAtt.isPending && delAtt.variables === a.id}
                  onDelete={() => {
                    if (editingSourceId === a.id) setEditingSourceId(null);
                    delAtt.mutate(a.id);
                  }}
                  onEdit={() => setEditingSourceId(a.id)}
                  editing={editingSourceId === a.id}
                />
              ))}
            </ul>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.html,.htm,.txt,.md,.csv"
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
            aria-hidden="true"
          />
          <input
            ref={imageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(e) => void handleFiles(e.target.files)}
            aria-hidden="true"
          />
        </div>

        {/* আমার নোট */}
        <div className="rounded-xl border border-border/60 bg-background/55 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onToggleNote}
              aria-expanded={noteOpen}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold font-bengali transition-all",
                noteOpen
                  ? "border-amber-500/60 bg-amber-500/20 text-amber-700 shadow-[0_0_10px_rgb(245_158_11/0.35)] dark:text-amber-300"
                  : hasNote
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                    : "border-border/70 text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              <StickyNote className="h-3.5 w-3.5" /> আমার নোট
              {hasNote && (
                <span className="rounded-full bg-amber-500/25 px-1.5 py-px text-[9px] font-bold font-bengali">
                  নোট আছে
                </span>
              )}
            </button>
            <span className="text-[10px] text-muted-foreground font-bengali">
              {noteOpen ? "শুধু এই প্রশ্নের জন্য — অটো-সেভ হয়" : "এই প্রশ্নের জন্য নিজের নোট রাখুন"}
            </span>
          </div>
          {noteOpen && (
            <div className="mt-2">
              <QuestionNoteEditor
                questionId={q.id}
                initialHtml={q.noteHtml ?? ""}
                onHasNoteChange={setHasNote}
                onClose={onToggleNote}
              />
            </div>
          )}
        </div>

        <p className="text-[10px] text-muted-foreground font-bengali">
          সংযোজন: {createdFmt.format(new Date(q.createdAt))}
        </p>
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/*  attachment mini row-box                                            */
/* ------------------------------------------------------------------ */

function AttachmentRow({
  a,
  onDelete,
  deleting,
  onEdit,
  editing,
}: {
  a: QuestionAttachmentDTO;
  onDelete: () => void;
  deleting: boolean;
  onEdit?: () => void;
  editing?: boolean;
}) {
  if (a.kind === "note" || a.kind === "data") {
    return (
      <RichSourceRow a={a} onDelete={onDelete} deleting={deleting} onEdit={onEdit} editing={editing} />
    );
  }
  const tone = attachmentTone(a);
  const fileUrl = `/api/question-attachments/${a.id}/file`;
  const isLink = a.kind === "link";
  const isImage = a.kind === "image";

  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-all duration-200 hover:-translate-y-px hover:shadow-sm",
        tone.box
      )}
    >
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", tone.chip)}>
        {isLink ? (
          providerIcon(a.provider)
        ) : isImage ? (
          <ImageIcon className="h-3.5 w-3.5" />
        ) : (
          <FileText className="h-3.5 w-3.5" />
        )}
      </span>
      {isImage && (
        <img
          src={fileUrl}
          alt={a.name}
          loading="lazy"
          className="h-10 w-14 shrink-0 rounded object-cover ring-1 ring-violet-500/30"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-medium font-bengali" title={a.name}>
          {a.name}
        </p>
        <p className="truncate text-[10px] text-muted-foreground">
          {isLink ? (
            <span className="font-bengali">{PROVIDER_LABEL[a.provider] ?? PROVIDER_LABEL.other}</span>
          ) : (
            <>
              <Badge variant="outline" className="h-4 px-1 text-[9px] font-bold uppercase">
                {a.ext}
              </Badge>
              <span className="ml-1 font-bengali">{formatBytes(a.size)}</span>
            </>
          )}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="নতুন ট্যাবে খুলুন"
          aria-label={`খুলুন: ${a.name}`}
          className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground font-bengali"
        >
          <ExternalLink className="h-3.5 w-3.5" /> খুলুন
        </a>
        {!isLink && (
          <a
            href={`${fileUrl}?download=1`}
            target="_blank"
            rel="noopener noreferrer"
            title="ডাউনলোড করুন"
            aria-label={`ডাউনলোড: ${a.name}`}
            className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground font-bengali"
          >
            <Download className="h-3.5 w-3.5" /> ডাউনলোড
          </a>
        )}
        <ConfirmDeleteButton onDelete={onDelete} disabled={deleting} name={a.name} />
      </div>
    </li>
  );
}

/** Row for a rich-text answer-source (নোট / তথ্য-উপাত্ত). */
function RichSourceRow({
  a,
  onDelete,
  deleting,
  onEdit,
  editing,
}: {
  a: QuestionAttachmentDTO;
  onDelete: () => void;
  deleting: boolean;
  onEdit?: () => void;
  editing?: boolean;
}) {
  const tone = attachmentTone(a);
  const isNote = a.kind === "note";
  const plain = (a.contentHtml ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const btn =
    "flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground font-bengali";

  return (
    <li
      className={cn(
        "flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-all duration-200 hover:-translate-y-px hover:shadow-sm",
        tone.box,
        editing && "ring-2 ring-primary/40"
      )}
    >
      <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", tone.chip)}>
        {isNote ? <NotebookPen className="h-3.5 w-3.5" /> : <BarChart3 className="h-3.5 w-3.5" />}
      </span>
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left" title={a.name}>
        <p className="truncate text-[12.5px] font-medium font-bengali">{a.name}</p>
        <p className="truncate text-[10px] text-muted-foreground font-bengali">
          <span className={cn("mr-1 rounded px-1 py-px text-[9px] font-bold", tone.chip)}>
            {isNote ? "নোট" : "তথ্য-উপাত্ত"}
          </span>
          {plain ? (plain.length > 70 ? plain.slice(0, 70) + "…" : plain) : "খালি — লিখতে ক্লিক করুন"}
        </p>
      </button>
      <div className="flex shrink-0 items-center gap-0.5">
        <button type="button" onClick={onEdit} className={btn} title="রিচ টেক্সট এডিটরে খুলুন">
          <Pencil className="h-3.5 w-3.5" /> {editing ? "খোলা আছে" : "লিখুন"}
        </button>
        <a
          href={`/api/question-attachments/${a.id}/print`}
          target="_blank"
          rel="noopener noreferrer"
          title="প্রিন্ট পেজ খুলবে — সেখানে Save as PDF দিলে PDF হবে"
          aria-label={`PDF সেভ: ${a.name}`}
          className={btn}
        >
          <FileDown className="h-3.5 w-3.5" /> PDF
        </a>
        <ConfirmDeleteButton onDelete={onDelete} disabled={deleting} name={a.name} />
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ */
/*  নোট / তথ্য-উপাত্ত — full rich text editor (same as node "নোট")      */
/*  debounced autosave (800ms) + PDF সেভ                               */
/* ------------------------------------------------------------------ */

function RichSourceEditor({
  source,
  onClose,
}: {
  source: QuestionAttachmentDTO;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const isNote = source.kind === "note";
  const [title, setTitle] = useState(source.name);
  const [content, setContent] = useState(source.contentHtml ?? "");
  const [font, setFont] = useState<"kalpurush" | "times">(
    source.font === "times" ? "times" : "kalpurush"
  );
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const lastSaved = useRef({ title: source.name, content: source.contentHtml ?? "" });
  const latest = useRef({ title: source.name, content: source.contentHtml ?? "" });
  const firstRun = useRef(true);

  const saveMut = useMutation({
    mutationFn: (patch: { name?: string; contentHtml?: string; font?: string }) =>
      updateQuestionRichSource(source.id, patch),
    onSuccess: (_d, patch) => {
      if (patch.name !== undefined) lastSaved.current.title = patch.name;
      if (patch.contentHtml !== undefined) lastSaved.current.content = patch.contentHtml;
      setSaveState("saved");
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

  const buildPatch = () => {
    const patch: { name?: string; contentHtml?: string } = {};
    const t = latest.current.title.trim();
    if (t && latest.current.title !== lastSaved.current.title) patch.name = latest.current.title;
    if (latest.current.content !== lastSaved.current.content) patch.contentHtml = latest.current.content;
    return patch;
  };

  // debounced autosave (800ms)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const t = setTimeout(() => {
      const patch = buildPatch();
      if (Object.keys(patch).length === 0) {
        setSaveState("idle");
        return;
      }
      saveMutRef.current.mutate(patch);
    }, 800);
    return () => clearTimeout(t);
  }, [title, content]);

  // flush unsaved edits on unmount (tab / node switch)
  useEffect(() => {
    return () => {
      const patch = buildPatch();
      if (Object.keys(patch).length > 0) {
        void updateQuestionRichSource(source.id, patch)
          .then(() => qc.invalidateQueries({ queryKey: ["questions"] }))
          .catch(() => undefined);
      }
    };
  }, [source.id, qc]);

  const flushPending = async (): Promise<boolean> => {
    const patch = buildPatch();
    if (Object.keys(patch).length > 0) {
      try {
        await saveMutRef.current.mutateAsync(patch);
      } catch {
        return false;
      }
    }
    return true;
  };

  const handleClose = async () => {
    await flushPending();
    qc.invalidateQueries({ queryKey: ["questions"] });
    onClose();
  };

  const handleSavePdf = async () => {
    const ok = await flushPending();
    if (!ok) {
      toast.error("পেন্ডিং সেভ শেষ না হওয়ায় PDF খোলা যায়নি — আবার চেষ্টা করুন");
      return;
    }
    qc.invalidateQueries({ queryKey: ["questions"] });
    window.open(`/api/question-attachments/${source.id}/print`, "_blank", "noopener");
  };

  const changeFont = (f: "kalpurush" | "times") => {
    setFont(f);
    setSaveState("saving");
    saveMutRef.current.mutate({ font: f });
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border p-2.5",
        isNote ? "border-amber-500/30 bg-amber-500/[0.04]" : "border-rose-500/30 bg-rose-500/[0.04]"
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => void handleClose()} className="h-8 gap-1.5 font-bengali">
          <ArrowLeft className="h-4 w-4" /> বন্ধ করুন
        </Button>
        <span
          className={cn(
            "flex items-center gap-1 text-[11px] font-bold font-bengali",
            isNote ? "text-amber-700 dark:text-amber-300" : "text-rose-700 dark:text-rose-300"
          )}
        >
          {isNote ? <NotebookPen className="h-3.5 w-3.5" /> : <BarChart3 className="h-3.5 w-3.5" />}
          {isNote ? "নোট" : "তথ্য-উপাত্ত"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleSavePdf()}
                className="h-8 gap-1.5 font-bengali"
                aria-label="প্রিন্ট / PDF হিসেবে সেভ করুন"
              >
                <FileDown className="h-4 w-4 text-primary" />
                <span>PDF সেভ</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent className="font-bengali">
              প্রিন্ট পেজ খুলবে — সেখানে &quot;Save as PDF&quot; দিলে এটি PDF হবে
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <Input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          latest.current.title = e.target.value;
          setSaveState("saving");
        }}
        placeholder={isNote ? "নোটের শিরোনাম" : "তথ্য-উপাত্তের শিরোনাম"}
        aria-label="শিরোনাম"
        className="mb-2 h-10 border-none bg-transparent px-0 text-base font-bold font-bengali shadow-none focus-visible:ring-0"
      />

      <RichEditor
        value={content}
        onChange={(v) => {
          setContent(v);
          latest.current.content = v;
          setSaveState("saving");
        }}
        font={font}
        onFontChange={changeFont}
        saveState={saveState}
        placeholder={
          isNote
            ? "এই প্রশ্নের উত্তরের জন্য নোট লিখুন…"
            : "এই প্রশ্নের জন্য তথ্য-উপাত্ত লিখুন — পরিসংখ্যান, টেবিল, সূত্র, তারিখ…"
        }
      />
    </div>
  );
}

/** 2-click delete confirm — first click turns the button red for 3s. */
function ConfirmDeleteButton({
  onDelete,
  disabled,
  name,
}: {
  onDelete: () => void;
  disabled?: boolean;
  name: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const click = () => {
    if (confirming) {
      if (timer.current) clearTimeout(timer.current);
      setConfirming(false);
      onDelete();
      return;
    }
    setConfirming(true);
    timer.current = setTimeout(() => setConfirming(false), 3000);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={click}
      disabled={disabled}
      aria-label={confirming ? `নিশ্চিতভাবে মুছুন: ${name}` : `সোর্স মুছুন: ${name}`}
      className={cn(
        "h-7 gap-1 px-1.5 text-[11px] font-bold font-bengali",
        confirming
          ? "bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive"
          : "text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
      )}
    >
      <Trash2 className="h-3.5 w-3.5" />
      {confirming ? "নিশ্চিত?" : null}
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/*  personal note editor — debounced autosave (800ms)                  */
/* ------------------------------------------------------------------ */

function QuestionNoteEditor({
  questionId,
  initialHtml,
  onHasNoteChange,
  onClose,
}: {
  questionId: string;
  initialHtml: string;
  onHasNoteChange: (has: boolean) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [html, setHtml] = useState(initialHtml);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const lastSavedRef = useRef(initialHtml);
  const htmlRef = useRef(initialHtml);

  const saveMut = useMutation({
    mutationFn: (noteHtml: string) => updateQuestion(questionId, { noteHtml }),
    onSuccess: (_data, noteHtml) => {
      lastSavedRef.current = noteHtml;
      setSaveState("saved");
    },
    onError: (e: Error) => {
      setSaveState("idle");
      toast.error(`নোট সেভ করা যায়নি: ${e.message}`);
    },
  });
  const saveMutRef = useRef(saveMut);
  useEffect(() => {
    saveMutRef.current = saveMut;
  });

  // change handler marks the save state immediately (setState stays out of effects)
  const handleChange = (next: string) => {
    setHtml(next);
    htmlRef.current = next;
    onHasNoteChange(!isRichEmpty(next));
    setSaveState(next === lastSavedRef.current ? "idle" : "saving");
  };

  // debounced autosave (800ms) on content change
  useEffect(() => {
    if (html === lastSavedRef.current) return;
    const t = setTimeout(() => saveMutRef.current.mutate(html), 800);
    return () => clearTimeout(t);
  }, [html]);

  // flush any unsaved note when the editor unmounts (tab/node switch)
  useEffect(() => {
    return () => {
      if (htmlRef.current !== lastSavedRef.current) {
        void updateQuestion(questionId, { noteHtml: htmlRef.current })
          .then(() => {
            qc.invalidateQueries({ queryKey: ["questions"] });
            qc.invalidateQueries({ queryKey: ["search"] });
          })
          .catch(() => undefined);
      }
    };
  }, [questionId, qc]);

  const handleClose = async () => {
    if (htmlRef.current !== lastSavedRef.current) {
      try {
        await saveMutRef.current.mutateAsync(htmlRef.current);
      } catch {
        // error toast already shown by the mutation
      }
    }
    qc.invalidateQueries({ queryKey: ["questions"] });
    qc.invalidateQueries({ queryKey: ["search"] });
    onClose();
  };

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 dark:text-amber-300 font-bengali">
          <StickyNote className="h-3.5 w-3.5" /> ব্যক্তিগত নোট
        </span>
        <span
          className={cn(
            "text-[10px] font-bengali",
            saveState === "saved"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground/70"
          )}
        >
          {saveState === "saving" ? "সেভ হচ্ছে…" : saveState === "saved" ? "সংরক্ষিত ✓" : ""}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto h-7 w-7"
          onClick={() => void handleClose()}
          aria-label="নোট বন্ধ করুন"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <ExplanationEditor
        value={html}
        onChange={handleChange}
        placeholder="এই প্রশ্নের জন্য নিজের নোট লিখুন — শর্টকাট, ভুল-বিশ্লেষণ, মনে রাখার টিপস…"
        minHeight={160}
      />
    </div>
  );
}

// ---------- inline rich-text editor (create / edit question) ----------

function QuestionEditor({
  node,
  question,
  onDone,
}: {
  node: TreeNodeDTO;
  question: QuestionDTO | null;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(question?.title ?? "");
  const [html, setHtml] = useState(question?.contentHtml ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!html.trim() || html === "<p></p>") {
      toast.error("প্রশ্নের বিষয়বস্তু লিখুন");
      return;
    }
    setSaving(true);
    try {
      if (question) {
        await updateQuestion(question.id, { title, contentHtml: html });
        toast.success("প্রশ্ন আপডেট হয়েছে");
      } else {
        await createQuestion({ nodeId: node.id, title, contentHtml: html });
        toast.success("প্রশ্নব্যাংকে সেভ হয়েছে");
      }
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "সেভ করা যায়নি");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="glass mb-2 rounded-2xl p-4">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="শিরোনাম (ঐচ্ছিক) — যেমন: ২০১৯ সালের লিখিত প্রশ্ন"
        className="mb-3 h-10 font-bengali"
        aria-label="প্রশ্নের শিরোনাম"
      />
      <ExplanationEditor
        value={html}
        onChange={setHtml}
        placeholder="এখানে প্রশ্নটি লিখুন — হেডিং, রঙ, হাইলাইট, লিস্ট, ছবি, টেবিল সবই যাবে…"
        minHeight={220}
      />
      <div className="mt-3 flex items-center gap-2">
        <Button onClick={save} disabled={saving} className="h-9 gap-1.5 font-bengali">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {question ? "আপডেট করুন" : "সেভ করুন"}
        </Button>
        <Button variant="outline" onClick={onDone} className="h-9 font-bengali">
          বাতিল
        </Button>
        <span className={cn("ml-auto text-[11px] text-muted-foreground font-bengali")}>
          {question ? "মোড: সম্পাদনা" : "মোড: নতুন প্রশ্ন"}
        </span>
      </div>
    </div>
  );
}
