"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  FilePlus2,
  Hand,
  Highlighter,
  NotebookPen,
  Pen,
  Plus,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  createHandwritingNotebook,
  deleteHandwritingNotebook,
  fetchHandwritingNotebooks,
  updateHandwritingNotebook,
} from "@/lib/bcs-api";
import type { HandwritingNotebookDTO, HwPage, HwStroke } from "@/lib/bcs-types";
import {
  HandwritingCanvas,
  type HandwritingCanvasHandle,
  type HandwritingStats,
  type HwTool,
} from "./handwriting-canvas";
import { renderPageToDataURL } from "./handwriting-render";

const PEN_COLORS = ["#1e293b", "#1d4ed8", "#dc2626", "#15803d", "#7c3aed"];
const HL_COLORS = ["#fde047", "#f9a8d4", "#86efac", "#93c5fd"];
const PEN_SIZES = [3, 5, 8];
const HL_SIZES = [16, 24];
const BACKGROUNDS = [
  { id: "ruled", label: "লাইনটানা" },
  { id: "blank", label: "সাদা" },
  { id: "grid", label: "গ্রিড" },
  { id: "dotted", label: "ডট" },
];

function bgStyle(background: string): React.CSSProperties {
  const paper = background === "blank" ? "#ffffff" : "#fffdf5";
  if (background === "ruled") {
    return {
      backgroundColor: paper,
      backgroundImage:
        "repeating-linear-gradient(transparent, transparent 39px, rgba(120,140,170,0.35) 40px)",
    };
  }
  if (background === "grid") {
    return {
      backgroundColor: paper,
      backgroundImage:
        "linear-gradient(rgba(120,140,170,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(120,140,170,0.18) 1px, transparent 1px)",
      backgroundSize: "40px 40px",
    };
  }
  if (background === "dotted") {
    return {
      backgroundColor: paper,
      backgroundImage: "radial-gradient(rgba(120,140,170,0.5) 1.3px, transparent 1.4px)",
      backgroundSize: "28px 28px",
    };
  }
  return { backgroundColor: paper };
}

export function HandwritingHub() {
  const qc = useQueryClient();
  const { data: notebooks = [], isLoading } = useQuery({
    queryKey: ["handwriting"],
    queryFn: fetchHandwritingNotebooks,
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = notebooks.find((n) => n.id === activeId) ?? null;

  const create = useMutation({
    mutationFn: createHandwritingNotebook,
    onSuccess: (nb) => {
      qc.invalidateQueries({ queryKey: ["handwriting"] });
      setActiveId(nb.id);
      toast.success("নতুন খাতা তৈরি");
    },
    onError: () => toast.error("খাতা তৈরি হয়নি"),
  });

  if (!active) {
    return (
      <NotebookList
        notebooks={notebooks}
        isLoading={isLoading}
        onOpen={setActiveId}
        onCreate={(title) => create.mutate({ title })}
        creating={create.isPending}
        onDelete={async (id) => {
          if (!window.confirm("এই খাতাটা মুছে ফেলবেন? দাগগুলোও মুছে যাবে।")) return;
          try {
            await deleteHandwritingNotebook(id);
            qc.invalidateQueries({ queryKey: ["handwriting"] });
            toast.success("খাতা মুছা হয়েছে");
          } catch {
            toast.error("মুছা যায়নি");
          }
        }}
      />
    );
  }
  return (
    <NotebookEditor
      key={active.id}
      notebook={active}
      onBack={() => setActiveId(null)}
      onDeleted={() => {
        setActiveId(null);
        qc.invalidateQueries({ queryKey: ["handwriting"] });
      }}
    />
  );
}

/* ------------------------------ তালিকা ------------------------------ */

function NotebookList({
  notebooks,
  isLoading,
  onOpen,
  onCreate,
  creating,
  onDelete,
}: {
  notebooks: HandwritingNotebookDTO[];
  isLoading: boolean;
  onOpen: (id: string) => void;
  onCreate: (title: string) => void;
  creating: boolean;
  onDelete: (id: string) => void;
}) {
  const [title, setTitle] = useState("");
  return (
    <div className="mx-auto w-full max-w-4xl p-4 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <NotebookPen className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">হাতের লেখার খাতা</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        iPad-এ Apple Pencil (বা ল্যাপটপে মাউস) দিয়ে লিখুন — চাপ দিলে দাগ মোটা হবে।
        আঙুলে লিখতে চাইলে ভেতরে "আঙুলে আঁকা" চালু করুন।
      </p>
      <div className="mb-6 flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="খাতার নাম — যেমন: সংবিধান নোট"
          className="h-9"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onCreate(title.trim() || "হাতের লেখা");
              setTitle("");
            }
          }}
        />
        <Button
          className="h-9 shrink-0"
          disabled={creating}
          onClick={() => {
            onCreate(title.trim() || "হাতের লেখা");
            setTitle("");
          }}
        >
          <FilePlus2 className="mr-1.5 h-4 w-4" /> নতুন খাতা
        </Button>
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">লোড হচ্ছে…</p>
      ) : notebooks.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          এখনো কোনো খাতা নেই — উপরে নাম লিখে "নতুন খাতা" চাপুন।
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {notebooks.map((nb) => (
            <div
              key={nb.id}
              className="group relative flex cursor-pointer flex-col gap-1 rounded-2xl border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-md"
              onClick={() => onOpen(nb.id)}
            >
              <NotebookPen className="h-6 w-6 text-primary" />
              <p className="truncate text-sm font-semibold">{nb.title}</p>
              <p className="text-xs text-muted-foreground">
                {nb.pageCount} পেজ · {new Date(nb.updatedAt).toLocaleDateString("bn-BD")}
              </p>
              <button
                className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                aria-label="খাতা মুছুন"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(nb.id);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------ এডিটর ------------------------------ */

function NotebookEditor({
  notebook,
  onBack,
  onDeleted,
}: {
  notebook: HandwritingNotebookDTO;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const qc = useQueryClient();
  const canvasRef = useRef<HandwritingCanvasHandle>(null);
  const [title, setTitle] = useState(notebook.title);
  const [background, setBackground] = useState(notebook.background);
  const [pages, setPages] = useState<HwPage[]>(
    notebook.pages.length > 0 ? notebook.pages : [[]]
  );
  const [pageIndex, setPageIndex] = useState(0);
  const [tool, setTool] = useState<HwTool>("pen");
  const [color, setColor] = useState(PEN_COLORS[0]);
  const [size, setSize] = useState(PEN_SIZES[1]);
  const [fingerDraw, setFingerDraw] = useState(false);
  const [stats, setStats] = useState<HandwritingStats>({ canUndo: false, canRedo: false, strokeCount: 0 });
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving">("saved");
  const idRef = useRef(notebook.id);
  const dirtyRef = useRef(false);
  const stateRef = useRef({ title, background, pages });
  stateRef.current = { title, background, pages };

  const colors = tool === "highlighter" ? HL_COLORS : PEN_COLORS;
  const sizes = tool === "highlighter" ? HL_SIZES : PEN_SIZES;

  const pickTool = (t: HwTool) => {
    setTool(t);
    if (t === "pen") {
      setColor(PEN_COLORS[0]);
      setSize(PEN_SIZES[1]);
    } else if (t === "highlighter") {
      setColor(HL_COLORS[0]);
      setSize(HL_SIZES[0]);
    }
  };

  const handleStrokes = (idx: number, strokes: HwStroke[]) => {
    dirtyRef.current = true;
    setPages((prev) => {
      const next = [...prev];
      next[idx] = strokes;
      return next;
    });
  };

  // অটো-সেভ (debounced)
  useEffect(() => {
    if (!dirtyRef.current) return;
    setSaveState("dirty");
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        await updateHandwritingNotebook(idRef.current, {
          title: title.trim() || "হাতের লেখা",
          background,
          pages,
        });
        dirtyRef.current = false;
        setSaveState("saved");
        qc.invalidateQueries({ queryKey: ["handwriting"] });
      } catch {
        setSaveState("dirty");
        toast.error("সেভ হয়নি — আবার চেষ্টা করছি");
      }
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pages, title, background]);

  // ভিউ বদলে unmount হলে বাকি থাকা সেভ জোর করে পাঠাও (best-effort)
  useEffect(() => {
    const id = idRef.current;
    return () => {
      if (!dirtyRef.current) return;
      const s = stateRef.current;
      fetch(`/api/handwriting/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: (s.title || "").trim() || "হাতের লেখা",
          background: s.background,
          pages: s.pages,
        }),
        keepalive: true,
      }).catch(() => {});
    };
  }, []);

  const addPage = () => {
    dirtyRef.current = true;
    setPages((prev) => [...prev, []]);
    setPageIndex(pages.length);
  };

  const deletePage = () => {
    if (pages.length <= 1) {
      toast.error("একটাই পেজ আছে");
      return;
    }
    if (!window.confirm(`পেজ ${pageIndex + 1} মুছে ফেলবেন?`)) return;
    dirtyRef.current = true;
    const next = pages.filter((_, i) => i !== pageIndex);
    setPages(next);
    setPageIndex(Math.max(0, pageIndex - 1));
  };

  const exportPng = () => {
    const url = renderPageToDataURL(pages[pageIndex] ?? [], background);
    if (!url) {
      toast.error("এক্সপোর্ট হয়নি");
      return;
    }
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.trim() || "handwriting"}-p${pageIndex + 1}.png`;
    a.click();
    toast.success("PNG ডাউনলোড হচ্ছে");
  };

  const deleteNotebook = async () => {
    if (!window.confirm("পুরো খাতাটা মুছে ফেলবেন?")) return;
    try {
      await deleteHandwritingNotebook(idRef.current);
      toast.success("খাতা মুছা হয়েছে");
      onDeleted();
    } catch {
      toast.error("মুছা যায়নি");
    }
  };

  const toolBtn = (t: HwTool, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => pickTool(t)}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
        tool === t
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      )}
    >
      {icon}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* হেডার */}
      <div className="flex shrink-0 items-center gap-2 px-3 py-2 sm:px-4">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onBack} aria-label="ফিরে যান">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input
          value={title}
          onChange={(e) => {
            dirtyRef.current = true;
            setTitle(e.target.value);
          }}
          className="h-8 max-w-[220px] border-transparent bg-transparent px-1 text-sm font-bold hover:border-input focus:border-input"
          aria-label="খাতার নাম"
        />
        <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
          {saveState === "saved" ? "✓ সেভ হয়েছে" : saveState === "saving" ? "সেভ হচ্ছে…" : "• সেভ বাকি"}
        </span>
      </div>

      {/* টুলবার */}
      <div className="shrink-0 space-y-1.5 border-y bg-card/60 px-3 py-2 backdrop-blur sm:px-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {toolBtn("pen", <Pen className="h-4 w-4" />, "কলম")}
          {toolBtn("highlighter", <Highlighter className="h-4 w-4" />, "হাইলাইটার")}
          {toolBtn("eraser", <Eraser className="h-4 w-4" />, "ইরেজার")}
          <span className="mx-1 h-6 w-px bg-border" />
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`রং ${c}`}
              onClick={() => setColor(c)}
              className={cn(
                "h-7 w-7 rounded-full border border-black/10 shadow-sm transition-transform hover:scale-110",
                color === c && tool !== "eraser" && "ring-2 ring-primary ring-offset-2"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
          <span className="mx-1 h-6 w-px bg-border" />
          {sizes.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSize(s)}
              className={cn(
                "flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 text-[11px] transition-all hover:bg-accent",
                size === s && tool !== "eraser"
                  ? "bg-primary/15 font-bold text-primary"
                  : "text-muted-foreground"
              )}
            >
              {tool === "highlighter" ? (s === HL_SIZES[0] ? "চিকন" : "মোটা") : s === 3 ? "চিকন" : s === 5 ? "মাঝারি" : "মোটা"}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            title="আনডু"
            disabled={!stats.canUndo}
            onClick={() => canvasRef.current?.undo()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-accent disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="রিডু"
            disabled={!stats.canRedo}
            onClick={() => canvasRef.current?.redo()}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-accent disabled:opacity-30"
          >
            <Redo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title={fingerDraw ? "আঙুলে আঁকা বন্ধ" : "আঙুলে আঁকা চালু"}
            onClick={() => setFingerDraw((v) => !v)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs transition-all",
              fingerDraw ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground hover:bg-accent"
            )}
          >
            <Hand className="h-4 w-4" /> আঙুলে আঁকা
          </button>
          <span className="mx-1 h-6 w-px bg-border" />
          {BACKGROUNDS.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => {
                dirtyRef.current = true;
                setBackground(b.id);
              }}
              className={cn(
                "h-8 rounded-lg px-2 text-xs transition-all hover:bg-accent",
                background === b.id ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground"
              )}
            >
              {b.label}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-border" />
          <button
            type="button"
            title="পেজ PNG হিসেবে ডাউনলোড"
            onClick={exportPng}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-accent"
          >
            <Download className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="পেজের সব দাগ মুছুন"
            onClick={() => {
              if (window.confirm("এই পেজের সব দাগ মুছে ফেলবেন?")) canvasRef.current?.clearAll();
            }}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="খাতা মুছুন"
            onClick={deleteNotebook}
            className="ml-auto flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> খাতা মুছুন
          </button>
        </div>
      </div>

      {/* পেজ */}
      <div className="scroll-slim min-h-0 flex-1 overflow-y-auto bg-muted/40 p-3 sm:p-5">
        <div className="mx-auto w-full max-w-[820px]">
          <div
            className="relative overflow-hidden rounded-lg shadow-lg ring-1 ring-black/10"
            style={bgStyle(background)}
          >
            <HandwritingCanvas
              key={`${notebook.id}:${pageIndex}`}
              ref={canvasRef}
              initialStrokes={pages[pageIndex] ?? []}
              tool={tool}
              color={color}
              size={size}
              fingerDraw={fingerDraw}
              onChange={(strokes) => handleStrokes(pageIndex, strokes)}
              onStats={setStats}
            />
          </div>
          {/* পেজ নেভিগেশন */}
          <div className="flex items-center justify-center gap-2 py-3">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={pageIndex === 0}
              onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
              aria-label="আগের পেজ"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-16 text-center text-xs text-muted-foreground">
              পেজ {pageIndex + 1} / {pages.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={pageIndex >= pages.length - 1}
              onClick={() => setPageIndex((i) => Math.min(pages.length - 1, i + 1))}
              aria-label="পরের পেজ"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <span className="mx-1 h-5 w-px bg-border" />
            <Button variant="secondary" size="sm" className="h-8 text-xs" onClick={addPage}>
              <Plus className="mr-1 h-3.5 w-3.5" /> পেজ যোগ
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-destructive"
              onClick={deletePage}
            >
              পেজ মুছুন
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
