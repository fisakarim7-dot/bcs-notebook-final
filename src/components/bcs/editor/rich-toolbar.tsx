"use client";

/**
 * Shared Tiptap toolkit — THE single feature-rich rich-text engine + toolbar.
 *
 * Used by EVERY rich text surface so they all offer identical features:
 *   - workspace/rich-editor.tsx   (level/node notes — full page editor)
 *   - study/explanation-editor.tsx (explanations, question bank, notes)
 *
 * Feature set (identical everywhere):
 *   undo/redo · bold/italic/underline/strike · multicolor highlight ·
 *   text colors · text shadow (Word-এর মতো) · text/paragraph border (Word-এর মতো) ·
 *   shading for text/paragraph/table with theme colors (Word-এর মতো) ·
 *   font size — presets, custom px, A+/A− stepping (Word-এর মতো) ·
 *   table design — visual style gallery like Word's Table Styles
 *     (10 colorful themes, one click) + table/cell borders ·
 *   H1/H2/H3 · bullet/ordered/task lists · quote ·
 *   inline code + code block · horizontal rule · link ·
 *   image (upload/paste/drop + resize + caret-fix) ·
 *   text alignment L/C/R/justify · table (insert 3×3, add row/col, delete) ·
 *   clear formatting
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type { Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import Placeholder from "@tiptap/extension-placeholder";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { NodeSelection } from "@tiptap/pm/state";
import { cn } from "@/lib/utils";
import { friendlyNetworkError } from "@/lib/bcs-api";
import { ResizableImage } from "@/components/bcs/workspace/resizable-image";
import {
  TextShadow,
  TextBorder,
  ParagraphBorder,
  ShadowPicker,
  BorderPicker,
  TextShading,
  ParagraphShading,
  ShadedTableCell,
  ShadedTableHeader,
  ShadingPicker,
  FontSize,
  FontSizePicker,
  TableDesign,
  TableDesignControls,
} from "@/components/bcs/editor/text-effects";
import {
  BorderBox,
  FormatBox,
  BcsIcon,
  FormatMenu,
  IconPalette,
  ShapeMenu,
  VLine,
  BcsShape,
} from "@/components/bcs/editor/format-blocks";
import { TextBox } from "@/components/bcs/editor/text-box";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Highlighter,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Code,
  SquareCode,
  SquareDashed,
  Minus,
  Undo2,
  Redo2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  ImagePlus,
  Table as TableIcon,
  BetweenHorizontalStart,
  BetweenVerticalStart,
  Trash2,
  Palette,
  Link2,
  RemoveFormatting,
  Eraser,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export type EditorSaveState = "idle" | "saving" | "saved";

export const HIGHLIGHTS = ["#fde68a", "#bbf7d0", "#fbcfe8", "#fed7aa", "#e9d5ff"];
export const TEXT_COLORS = ["#b91c1c", "#15803d", "#7c3aed", "#c2410c", "#0f766e"];

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB per embedded image

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/**
 * Upload an image for embedding inside any rich text and return its serving URL.
 * Throws Error("SIZE" | "TYPE") for client-side rejects, server message otherwise.
 */
export async function uploadNoteImage(file: File): Promise<string> {
  let ext = MIME_TO_EXT[file.type];
  if (!ext) {
    const m = /\.(png|jpe?g|webp|gif)$/i.exec(file.name);
    if (m) ext = m[1].toLowerCase() === "jpeg" ? "jpg" : m[1].toLowerCase();
  }
  if (!ext) throw new Error("TYPE");
  if (file.size > MAX_IMAGE_BYTES) throw new Error("SIZE");

  let res: Response;
  try {
    res = await fetch(`/api/note-images?ext=${ext}`, {
      method: "POST",
      body: file,
    });
  } catch (err) {
    if (err instanceof Error && (err.message === "SIZE" || err.message === "TYPE")) throw err;
    throw friendlyNetworkError(err);
  }
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !data?.url) {
    throw new Error(data?.error ?? "UPLOAD_FAILED");
  }
  return data.url;
}

/**
 * The ONE extension preset — every editor mounts exactly this set, so all
 * surfaces accept the exact same content (alignment, code blocks, H1, tables…).
 */
export function buildRichExtensions(placeholder: string) {
  return [
    StarterKit.configure({ heading: { levels: [1, 2, 3] } }), // codeBlock enabled (default)
    Underline,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ["heading", "paragraph", "image"] }),
    TextStyle,
    Color,
    FontFamily.configure({ types: ["textStyle"] }),
    Table.configure({ resizable: true }),
    TableRow,
    ShadedTableHeader,
    ShadedTableCell,
    Placeholder.configure({ placeholder }),
    Link.configure({ openOnClick: false, autolink: true }),
    TaskList,
    TaskItem.configure({ nested: true }),
    TextShadow,
    TextBorder,
    ParagraphBorder,
    TextShading,
    ParagraphShading,
    FontSize,
    TableDesign,
    BorderBox,
    FormatBox,
    BcsIcon,
    VLine,
    BcsShape,
    TextBox,
    ResizableImage.configure({
      inline: false,
      allowBase64: false,
      HTMLAttributes: { loading: "lazy" },
    }),
  ];
}

/**
 * Push EXTERNAL `value` changes (OCR insert, history restore, AI fill…) into a
 * mounted Tiptap editor. `useEditor({ content })` only reads its initial value —
 * without this sync the editor silently ignores later updates and the NEXT
 * keystroke would overwrite (and permanently lose) them.
 *
 * Returns the ref tracking the last HTML the editor/parent agreed on; callers
 * must set `lastHtml.current = editor.getHTML()` inside onUpdate BEFORE calling
 * their onChange, so typing never triggers a disruptive setContent round-trip.
 */
export function useTiptapExternalHtml(editor: Editor | null, value: string) {
  const lastHtml = useRef(value);
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    if (value === lastHtml.current) return; // typing flow — already in sync
    lastHtml.current = value;
    if (value !== editor.getHTML()) {
      // emitUpdate=false: don't loop back through onUpdate
      editor.commands.setContent(value, false);
    }
  }, [editor, value]);
  return lastHtml;
}

/** Toolbar icon button with tooltip — shared. */
export function TBtn({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all duration-150 hover:bg-primary/12 hover:text-primary disabled:cursor-not-allowed disabled:opacity-35",
            active && "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--primary)_35%,transparent)]"
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-[10px]">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Image upload/paste/drop plumbing shared by every editor.
 * Pass the editor's ref (the component owns syncing `editorRef.current = editor`).
 */
export function useTiptapImageUpload(editorRef: { current: Editor | null }) {
  const uploadRef = useRef<(files: File[]) => void>(() => {});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingUploads, setPendingUploads] = useState(0);

  const insertFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        setPendingUploads((n) => n + 1);
        try {
          const url = await uploadNoteImage(file);
          const ed = editorRef.current;
          if (ed && !ed.isDestroyed) {
            ed.chain().focus().setImage({ src: url, alt: file.name || "ছবি" }).run();

            // setImage leaves the new image NodeSelection-ed — typing/pasting again
            // would REPLACE it. Move the caret after the image so consecutive
            // pastes/inserts append in order.
            const { selection, doc } = ed.state;
            if (selection instanceof NodeSelection) {
              const after = selection.to;
              const $after = doc.resolve(after);
              const caretInsideText = $after.nodeAfter?.isTextblock || $after.parent.isTextblock;
              if (caretInsideText) {
                ed.chain().setTextSelection(after).run();
              } else {
                ed.chain()
                  .insertContentAt(after, { type: "paragraph" })
                  .setTextSelection(after + 1)
                  .run();
              }
            }
          }
        } catch (err) {
          const code = err instanceof Error ? err.message : "";
          if (code === "SIZE") {
            toast.error("ছবিটি ১০MB-এর বেশি — ছোট করে আবার দিন");
          } else if (code === "TYPE") {
            toast.error("শুধু PNG, JPG, WEBP বা GIF ছবি যোগ করা যায়");
          } else {
            toast.error("ছবি আপলোড করা যায়নি — আবার চেষ্টা করুন");
          }
        } finally {
          setPendingUploads((n) => Math.max(0, n - 1));
        }
      }
    },
    [editorRef]
  );

  // Stable bridge for editorProps handlers registered before the editor exists
  useEffect(() => {
    uploadRef.current = (files: File[]) => {
      void insertFiles(files);
    };
    return () => {
      uploadRef.current = () => {};
    };
  }, [insertFiles]);

  const queueFiles = useCallback((files: File[]) => {
    uploadRef.current(files);
  }, []);

  const openPicker = useCallback(() => fileInputRef.current?.click(), []);

  const handleFilePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = ""; // allow re-picking the same file
      if (files.length === 0) return;
      void insertFiles(files);
    },
    [insertFiles]
  );

  return { pendingUploads, queueFiles, openPicker, fileInputRef, handleFilePick };
}

/**
 * THE shared toolbar — identical buttons on every rich text surface.
 * Renders only the inner controls; the parent supplies the container chrome.
 */
export function RichToolbar({
  editor,
  onPickImage,
  afterColors,
  trailing,
  className,
}: {
  editor: Editor;
  /** opens the parent's hidden image file picker */
  onPickImage: () => void;
  /** optional slot right after the color popover (e.g. note font switcher) */
  afterColors?: React.ReactNode;
  /** optional right-aligned slot (save state / upload spinner) */
  trailing?: React.ReactNode;
  className?: string;
}) {
  const setLink = () => {
    const previous = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("লিংক পেস্ট করুন (https://…)", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-0.5", className)}>
      <TBtn label="আনডু" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
        <Undo2 className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn label="রিডু" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
        <Redo2 className="h-3.5 w-3.5" />
      </TBtn>
      <Separator orientation="vertical" className="mx-1 h-5" />

      <TBtn label="বোল্ড" onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
        <Bold className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn label="ইটালিক" onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
        <Italic className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn label="আন্ডারলাইন" onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")}>
        <UnderlineIcon className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn label="স্ট্রাইক" onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}>
        <Strikethrough className="h-3.5 w-3.5" />
      </TBtn>

      {/* Highlight swatches */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="হাইলাইট রং"
            className={cn(
              "flex h-7 items-center gap-0.5 rounded-md px-1 text-muted-foreground transition-all hover:bg-primary/12 hover:text-primary",
              editor.isActive("highlight") && "bg-primary/15 text-primary"
            )}
          >
            <Highlighter className="h-3.5 w-3.5" />
            <span className="h-2 w-2 rounded-sm bg-chart-2 ring-1 ring-black/10" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="glass-strong w-auto p-2" side="bottom" align="start">
          <div className="flex items-center gap-1.5">
            {HIGHLIGHTS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`হাইলাইট ${c}`}
                onClick={() => editor.chain().focus().toggleHighlight({ color: c }).run()}
                className={cn(
                  "h-6 w-6 rounded-md border border-black/10 shadow-sm transition-transform hover:scale-110",
                  editor.isActive("highlight", { color: c }) && "ring-2 ring-ring"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
            <Separator orientation="vertical" className="mx-0.5 h-5" />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => editor.chain().focus().unsetHighlight().run()}
            >
              <Eraser className="h-3 w-3" /> মুছুন
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {/* Text colors */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="লেখার রং"
            className="flex h-7 items-center gap-0.5 rounded-md px-1 text-muted-foreground transition-all hover:bg-primary/12 hover:text-primary"
          >
            <Palette className="h-3.5 w-3.5" />
            <span className="h-2 w-2 rounded-sm bg-destructive/70 ring-1 ring-black/10" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="glass-strong w-auto p-2" side="bottom" align="start">
          <div className="flex items-center gap-1.5">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`রং ${c}`}
                onClick={() => editor.chain().focus().setColor(c).run()}
                className={cn(
                  "h-6 w-6 rounded-md border border-black/10 shadow-sm transition-transform hover:scale-110",
                  editor.isActive("textStyle", { color: c }) && "ring-2 ring-ring"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
            <Separator orientation="vertical" className="mx-0.5 h-5" />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-2 text-xs"
              onClick={() => editor.chain().focus().unsetColor().run()}
            >
              <Eraser className="h-3 w-3" /> রিসেট
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {afterColors}

      {/* Font size — Word-এর মতো (ফন্ট ফ্যামিলির পাশে) */}
      <FontSizePicker editor={editor} />

      {/* MS Word-style text effects: shadow + border + shading */}
      <ShadowPicker editor={editor} />
      <BorderPicker editor={editor} />
      <ShadingPicker editor={editor} />

      {/* v35: exam format blocks + icon palette */}
      <FormatMenu editor={editor} />
      <IconPalette editor={editor} />
      {/* v39: shape toolbar — vertical lines */}
      <ShapeMenu editor={editor} />
      {/* v44: text box */}
      <TBtn label="টেক্সট বক্স" onClick={() => editor.chain().focus().insertTextBox().run()}>
        <SquareDashed className="h-3.5 w-3.5" />
      </TBtn>

      <Separator orientation="vertical" className="mx-1 h-5" />
      <TBtn label="শিরোনাম ১" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })}>
        <Heading1 className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn label="শিরোনাম ২" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })}>
        <Heading2 className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn label="শিরোনাম ৩" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })}>
        <Heading3 className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn label="বুলেট লিস্ট" onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>
        <List className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn label="নম্বর লিস্ট" onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>
        <ListOrdered className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn label="চেক লিস্ট" onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive("taskList")}>
        <ListTodo className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn label="উদ্ধৃতি" onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}>
        <Quote className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn label="ইনলাইন কোড" onClick={() => editor.chain().focus().toggleCode().run()} active={editor.isActive("code")}>
        <Code className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn label="কোড ব্লক" onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")}>
        <SquareCode className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn label="বিভাজক" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
        <Minus className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn label="লিংক" onClick={setLink} active={editor.isActive("link")}>
        <Link2 className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn
        label="ছবি যোগ করুন (পেস্ট/ড্রপ/রিসাইজ করা যায়)"
        onClick={onPickImage}
        active={editor.isActive("image")}
      >
        <ImagePlus className="h-3.5 w-3.5" />
      </TBtn>

      <Separator orientation="vertical" className="mx-1 h-5" />
      <TBtn label="বামে সাজান" onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })}>
        <AlignLeft className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn label="মাঝে সাজান" onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })}>
        <AlignCenter className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn label="ডানে সাজান" onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })}>
        <AlignRight className="h-3.5 w-3.5" />
      </TBtn>
      <TBtn label="জাস্টিফাই" onClick={() => editor.chain().focus().setTextAlign("justify").run()} active={editor.isActive({ textAlign: "justify" })}>
        <AlignJustify className="h-3.5 w-3.5" />
      </TBtn>

      <Separator orientation="vertical" className="mx-1 h-5" />
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="টেবিল"
            className={cn(
              "flex h-7 items-center gap-0.5 rounded-md px-1 text-muted-foreground transition-all hover:bg-primary/12 hover:text-primary",
              editor.isActive("table") && "bg-primary/15 text-primary"
            )}
          >
            <TableIcon className="h-3.5 w-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="glass-strong max-h-[70vh] w-72 overflow-y-auto p-2" side="bottom" align="start">
          <div className="flex flex-col gap-0.5 text-xs">
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2"
              onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
            >
              <TableIcon className="h-3.5 w-3.5" /> ৩×৩ টেবিল যোগ করুন
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2"
              onClick={() => editor.chain().focus().addRowAfter().run()}
            >
              <BetweenHorizontalStart className="h-3.5 w-3.5" /> নিচে সারি যোগ করুন
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
            >
              <BetweenVerticalStart className="h-3.5 w-3.5" /> ডানে কলাম যোগ করুন
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="justify-start gap-2 text-destructive hover:text-destructive"
              onClick={() => editor.chain().focus().deleteTable().run()}
            >
              <Trash2 className="h-3.5 w-3.5" /> টেবিল মুছুন
            </Button>
          </div>
          <Separator className="my-1.5" />
          <TableDesignControls editor={editor} />
        </PopoverContent>
      </Popover>

      <TBtn label="ফরম্যাটিং মুছুন" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
        <RemoveFormatting className="h-3.5 w-3.5" />
      </TBtn>

      {trailing}
    </div>
  );
}
