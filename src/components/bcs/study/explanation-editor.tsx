"use client";

/**
 * Premium rich-text EXPLANATION editor + preview for Flashcards, MCQs and the
 * Question Bank — now powered by the SHARED Tiptap toolkit
 * (src/components/bcs/editor/rich-toolbar.tsx), guaranteeing the IDENTICAL
 * feature-rich toolbar as the note editor: alignment, H1-H3, inline code +
 * code block, full table management, image upload/paste/drop with caret-fix.
 *
 * - ExplanationEditor : full Tiptap editor (same engine + toolbar as notes)
 * - ExplanationRichView : beautiful static rendering (read-only)
 */

import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildRichExtensions,
  useTiptapImageUpload,
  useTiptapExternalHtml,
  RichToolbar,
} from "@/components/bcs/editor/rich-toolbar";

/* ------------------------------------------------------------------ */
/*  HTML helpers — legacy plain ↔ rich HTML interop                    */
/* ------------------------------------------------------------------ */

/** True when the HTML holds no visible content ("<p></p>", "<p><br></p>", "" …). */
export function isRichEmpty(html: string | null | undefined): boolean {
  if (!html) return true;
  const text = html
    .replace(/<(br|img|hr)[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
  return text.length === 0;
}

/** Convert legacy plain-text explanation into simple rich HTML paragraphs. */
export function plainToHtml(text: string): string {
  const esc = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Strip rich HTML down to plain text (used for search / list snippets). */
export function htmlToPlain(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Resolve the display HTML for any flashcard/MCQ explanation:
 * rich HTML wins; legacy plain text is upgraded to paragraphs.
 */
export function resolveExplanationHtml(item: {
  explanationHtml?: string | null;
  explanation?: string | null;
}): string {
  if (!isRichEmpty(item.explanationHtml)) return item.explanationHtml ?? "";
  if (item.explanation && item.explanation.trim().length > 0) return plainToHtml(item.explanation);
  return "";
}

/* ------------------------------------------------------------------ */
/*  ExplanationEditor                                                  */
/* ------------------------------------------------------------------ */

export function ExplanationEditor({
  value,
  onChange,
  placeholder = "বিস্তারিত লিখুন — হেডিং, লিস্ট, হাইলাইট, ছবি, টেবিল, অ্যালাইনমেন্ট সবই যাবে…",
  minHeight = 180,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}) {
  const editorRef = useRef<Editor | null>(null);
  const { pendingUploads, queueFiles, openPicker, fileInputRef, handleFilePick } =
    useTiptapImageUpload(editorRef);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: buildRichExtensions(placeholder),
    content: value,
    editorProps: {
      attributes: {
        class: "focus:outline-none",
        spellcheck: "false",
      },
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith("image/")
        );
        if (files.length === 0) return false;
        event.preventDefault();
        queueFiles(files);
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith("image/")
        );
        if (files.length === 0) return false;
        event.preventDefault();
        queueFiles(files);
        return true;
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML());
    },
  });

  // Keep external value changes (dialog reloads / AI fills) in sync with the
  // mounted editor — otherwise they'd be silently lost on the next keystroke.
  useTiptapExternalHtml(editor, value);

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor]);

  if (!editor) {
    return <div className="h-40 animate-pulse rounded-xl bg-muted/50" />;
  }

  return (
    <div
      className="expl-edit tiptap-wrap overflow-hidden rounded-xl border bg-background/95 shadow-inner"
      style={{ borderColor: "color-mix(in oklab, var(--border) 80%, transparent)" }}
    >
      {/* premium gradient toolbar — SAME shared controls as the note editor */}
      <div className="border-b bg-gradient-to-r from-primary/8 via-transparent to-fuchsia-500/8 px-2 py-1.5">
        <RichToolbar
          editor={editor}
          onPickImage={openPicker}
          trailing={
            pendingUploads > 0 ? (
              <span className="ml-auto flex items-center gap-1 pr-1 text-[10px] text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> আপলোড হচ্ছে…
              </span>
            ) : undefined
          }
        />
      </div>

      <div className="scroll-slim overflow-y-auto" style={{ maxHeight: 420, minHeight }}>
        <EditorContent editor={editor} className="font-bengali" />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="hidden"
        onChange={handleFilePick}
        aria-hidden="true"
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  ExplanationRichView — beautiful read-only rendering                */
/* ------------------------------------------------------------------ */

export function ExplanationRichView({
  html,
  tone = "amber",
  className,
  label = "ব্যাখ্যা",
}: {
  html: string;
  /** color family of the frame */
  tone?: "amber" | "violet" | "emerald" | "rose" | "teal";
  className?: string;
  label?: string;
}) {
  const TONES: Record<string, { ring: string; chip: string; icon: string }> = {
    amber: {
      ring: "ring-amber-500/45",
      chip: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
      icon: "text-amber-600 dark:text-amber-400",
    },
    violet: {
      ring: "ring-violet-500/45",
      chip: "bg-violet-500/20 text-violet-700 dark:text-violet-300",
      icon: "text-violet-600 dark:text-violet-400",
    },
    emerald: {
      ring: "ring-emerald-500/45",
      chip: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
      icon: "text-emerald-600 dark:text-emerald-400",
    },
    rose: {
      ring: "ring-rose-500/45",
      chip: "bg-rose-500/20 text-rose-700 dark:text-rose-300",
      icon: "text-rose-600 dark:text-rose-400",
    },
    teal: {
      ring: "ring-teal-500/45",
      chip: "bg-teal-500/20 text-teal-700 dark:text-teal-300",
      icon: "text-teal-600 dark:text-teal-400",
    },
  };
  const t = TONES[tone] ?? TONES.amber;

  return (
    <div
      className={cn(
        /* Pure WHITE interior — black text always reads comfortably.
           Color lives on the ring (margin), chip and watermark instead.
           Soft 3D: elevated drop shadow + 1px top highlight. */
        "relative overflow-hidden rounded-xl bg-white p-3.5 ring-1 sm:p-4",
        "shadow-[0_14px_34px_-20px_rgb(0_0_0/0.4),inset_0_1px_0_rgb(255_255_255/0.9)]",
        "dark:bg-white/[0.05] dark:shadow-none",
        t.ring,
        className
      )}
    >
      <Sparkles
        className={cn(
          "pointer-events-none absolute -bottom-5 -right-4 h-20 w-20 rotate-12 opacity-[0.07]",
          t.icon
        )}
      />
      <span
        className={cn(
          "relative mb-2 flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold font-bengali",
          t.chip
        )}
      >
        <Sparkles className="h-3 w-3" /> {label}
      </span>
      {/*
        Static rendering: Tiptap HTML comes from the local editor (trusted),
        typography reuses the note-editor CSS via .tiptap-wrap .ProseMirror.
      */}
      <div className="tiptap-wrap expl-view">
        <div
          className="ProseMirror font-bengali"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}
