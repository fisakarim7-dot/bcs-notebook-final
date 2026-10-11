"use client";

/**
 * Full-page note editor for a level/node — now powered by the SHARED Tiptap
 * toolkit (src/components/bcs/editor/rich-toolbar.tsx) so notes, explanations
 * and the question bank all offer the IDENTICAL feature-rich toolbar:
 * alignment, code blocks, H1-H3, tables, image upload/paste/resize, etc.
 */

import { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { Loader2, CloudUpload, Check } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  buildRichExtensions,
  useTiptapImageUpload,
  useTiptapExternalHtml,
  RichToolbar,
  type EditorSaveState,
} from "@/components/bcs/editor/rich-toolbar";

export type { EditorSaveState } from "@/components/bcs/editor/rich-toolbar";

interface RichEditorProps {
  /** HTML content (controlled — persistence lives in the parent via debounce) */
  value: string;
  onChange: (content: string) => void;
  font: "kalpurush" | "times";
  onFontChange: (font: "kalpurush" | "times") => void;
  /** Save indicator driven by the parent's autosave loop */
  saveState: EditorSaveState;
  placeholder?: string;
}

export function RichEditor({
  value,
  onChange,
  font,
  onFontChange,
  saveState,
  placeholder,
}: RichEditorProps) {
  const editorRef = useRef<Editor | null>(null);
  const { pendingUploads, queueFiles, openPicker, fileInputRef, handleFilePick } =
    useTiptapImageUpload(editorRef);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: buildRichExtensions(placeholder ?? "এখানে নোট লিখুন…"),
    content: value,
    editorProps: {
      attributes: {
        class: "focus:outline-none",
        spellcheck: "false",
      },
      // Pasted screenshots / copied images → upload + embed at cursor
      handlePaste: (_view, event) => {
        const files = Array.from(event.clipboardData?.files ?? []).filter((f) =>
          f.type.startsWith("image/")
        );
        if (files.length === 0) return false;
        event.preventDefault();
        queueFiles(files);
        return true;
      },
      // Dragged image files → upload + embed at drop position
      handleDrop: (_view, event, _slice, moved) => {
        if (moved) return false; // internal node drag, not a file
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith("image/")
        );
        if (files.length === 0) return false;
        event.preventDefault();
        queueFiles(files);
        return true;
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Keep external value changes (OCR insert / history restore / AI fill) in
  // sync with the mounted editor — otherwise they'd be silently lost.
  useTiptapExternalHtml(editor, value);

  // Keep the shared upload hook pointed at the live editor instance
  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor]);

  if (!editor) {
    return <div className="h-64 animate-pulse rounded-xl bg-muted/50" />;
  }

  return (
    <div className="tiptap-wrap flex min-h-[300px] flex-1 flex-col">
      {/* Toolbar */}
      <div className="glass sticky top-0 z-10 shrink-0 rounded-xl px-2 py-1.5">
        <RichToolbar
          editor={editor}
          onPickImage={openPicker}
          afterColors={
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="ফন্ট"
                  className="flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground transition-all hover:bg-primary/12 hover:text-primary"
                >
                  {font === "kalpurush" ? "কালপুরুষ" : "Times"}
                </button>
              </PopoverTrigger>
              <PopoverContent className="glass-strong w-52 p-1.5" side="bottom" align="start">
                <p className="px-2 pb-1 pt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  পুরো নোটের ফন্ট
                </p>
                <button
                  onClick={() => onFontChange("kalpurush")}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm font-bengali transition-colors hover:bg-accent",
                    font === "kalpurush" && "bg-primary/10 text-primary"
                  )}
                >
                  কালপুরুষ (বাংলা) {font === "kalpurush" && <Check className="h-3.5 w-3.5" />}
                </button>
                <button
                  onClick={() => onFontChange("times")}
                  className={cn(
                    "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                    font === "times" && "bg-primary/10 text-primary"
                  )}
                  style={{ fontFamily: "'Times New Roman', serif" }}
                >
                  Times New Roman (ইংরেজি) {font === "times" && <Check className="h-3.5 w-3.5" />}
                </button>
              </PopoverContent>
            </Popover>
          }
          trailing={
            <div className="ml-auto flex items-center gap-1.5 pr-1 text-[10px] text-muted-foreground">
              {saveState === "saving" ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />{" "}
                  <span className="font-bengali">সেভ হচ্ছে…</span>
                </>
              ) : saveState === "saved" ? (
                <>
                  <CloudUpload className="h-3 w-3 text-primary" />{" "}
                  <span className="font-bengali">সংরক্ষিত</span>
                </>
              ) : (
                <span className="font-bengali">লিখলেই স্বয়ংক্রিয় সেভ</span>
              )}
            </div>
          }
        />
      </div>

      {/* Editing surface — min-h guarantees a real, always-visible typing area
          (flex-1+min-h-0 let the Cross Links box below crush it to 0px) */}
      <div className="relative mt-3 min-h-[240px] flex-1">
        <div className="scroll-slim h-full overflow-y-auto rounded-xl">
          <EditorContent
            editor={editor}
            className={cn(
              "glass min-h-full rounded-xl p-4 sm:p-6",
              font === "kalpurush" ? "editor-font-kalpurush" : "editor-font-times"
            )}
          />
        </div>

        {/* Floating upload indicator while images are in-flight */}
        {pendingUploads > 0 && (
          <div
            role="status"
            aria-live="polite"
            className="glass-strong pointer-events-none absolute bottom-3 right-3 z-20 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs shadow-lg"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            <span className="font-bengali text-primary">
              ছবি আপলোড হচ্ছে{pendingUploads > 1 ? ` (${pendingUploads})` : ""}…
            </span>
          </div>
        )}

        {/* Hidden picker for the ছবি যোগ করুন toolbar button */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          hidden
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleFilePick}
        />
      </div>
    </div>
  );
}
