"use client";

/**
 * MS Word-style text effects for the shared Tiptap editor:
 *   1. TextShadow mark      — লেখায় ছায়া (Word-এর "Text Effects → Shadow"-এর মতো)
 *   2. TextBorder mark      — সিলেক্ট করা লেখার চারপাশে বর্ডার
 *   3. ParagraphBorder      — পুরো প্যারা/হেডিং-এর চারপাশে বর্ডার
 *      (Word-এর "Borders and Shading → Paragraph"-এর মতো)
 *
 * Everything is stored as inline style / data-attributes on the HTML, so it
 * survives save → reload → print/PDF export exactly like the existing
 * highlight / color marks.
 */

import { useState } from "react";
import { Mark, Extension, mergeAttributes, findParentNode } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
import { TableMap } from "@tiptap/pm/tables";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { PaintBucket, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { TableCell as BaseTableCell } from "@tiptap/extension-table-cell";
import { TableHeader as BaseTableHeader } from "@tiptap/extension-table-header";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

/* ------------------------------------------------------------------ */
/* TypeScript: teach the editor about our custom commands              */
/* ------------------------------------------------------------------ */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textShadow: {
      setTextShadow: (shadow: string) => ReturnType;
      unsetTextShadow: () => ReturnType;
    };
    textBorder: {
      setTextBorder: (border: string) => ReturnType;
      unsetTextBorder: () => ReturnType;
    };
    paragraphBorder: {
      setParagraphBorder: (border: string) => ReturnType;
      unsetParagraphBorder: () => ReturnType;
    };
    textShading: {
      setTextShading: (color: string) => ReturnType;
      unsetTextShading: () => ReturnType;
    };
    paragraphShading: {
      setParagraphShading: (color: string) => ReturnType;
      unsetParagraphShading: () => ReturnType;
    };
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
    tableDesign: {
      setTableBorder: (border: string) => ReturnType;
      unsetTableBorder: () => ReturnType;
    };
  }
}

/* ------------------------------------------------------------------ */
/* 1. Text shadow mark                                                 */
/* ------------------------------------------------------------------ */

export const TEXT_SHADOW_PRESETS: Array<{ label: string; value: string }> = [
  { label: "ছায়া নেই", value: "" },
  { label: "হালকা ছায়া", value: "1px 1px 2px rgba(0,0,0,0.35)" },
  { label: "মাঝারি ছায়া", value: "2px 2px 4px rgba(0,0,0,0.45)" },
  { label: "গাঢ় ছায়া", value: "3px 3px 6px rgba(0,0,0,0.6)" },
  { label: "নীল আভা", value: "0 0 8px rgba(37,99,235,0.75)" },
  { label: "লাল আভা", value: "0 0 8px rgba(220,38,38,0.7)" },
];

export const TextShadow = Mark.create({
  name: "textShadow",

  addAttributes() {
    return {
      shadow: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-text-shadow") ||
          element.style.textShadow ||
          null,
        renderHTML: (attributes: { shadow?: string | null }) => {
          if (!attributes.shadow) return {};
          return {
            "data-text-shadow": attributes.shadow,
            style: `text-shadow: ${attributes.shadow}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-text-shadow]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setTextShadow:
        (shadow: string) =>
        ({ chain }) =>
          chain().setMark("textShadow", { shadow }).run(),
      unsetTextShadow:
        () =>
        ({ chain }) =>
          chain().unsetMark("textShadow").run(),
    };
  },
});

/* ------------------------------------------------------------------ */
/* 2. Inline text border mark (border around the selected text)        */
/* ------------------------------------------------------------------ */

export const BORDER_STYLES: Array<{
  label: string;
  value: string;
  glyph: string;
}> = [
  { label: "সরল রেখা", value: "solid", glyph: "━━" },
  { label: "ড্যাশ", value: "dashed", glyph: "┄┄" },
  { label: "ডট", value: "dotted", glyph: "┈┈" },
  { label: "ডাবল লাইন", value: "double", glyph: "══" },
];

export const BORDER_WIDTHS = ["1px", "2px", "3px", "4px"];

export const BORDER_COLORS = [
  "#111827",
  "#b91c1c",
  "#15803d",
  "#1d4ed8",
  "#7c3aed",
  "#c2410c",
];

export const TextBorder = Mark.create({
  name: "textBorder",

  addAttributes() {
    return {
      border: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-text-border") || null,
        renderHTML: (attributes: { border?: string | null }) => {
          if (!attributes.border) return {};
          return {
            "data-text-border": attributes.border,
            style: `border: ${attributes.border}; padding: 0 3px; border-radius: 3px;`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-text-border]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setTextBorder:
        (border: string) =>
        ({ chain }) =>
          chain().setMark("textBorder", { border }).run(),
      unsetTextBorder:
        () =>
        ({ chain }) =>
          chain().unsetMark("textBorder").run(),
    };
  },
});

/* ------------------------------------------------------------------ */
/* 3. Paragraph / heading border (Word-এর paragraph border-এর মতো)     */
/* ------------------------------------------------------------------ */

export const ParagraphBorder = Extension.create({
  name: "paragraphBorder",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          pBorder: {
            default: null as string | null,
            parseHTML: (element: HTMLElement) =>
              element.getAttribute("data-p-border") || null,
            renderHTML: (attributes: { pBorder?: string | null }) => {
              if (!attributes.pBorder) return {};
              return {
                "data-p-border": attributes.pBorder,
                style: `border: ${attributes.pBorder}; padding: 6px 10px; border-radius: 6px;`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setParagraphBorder:
        (border: string) =>
        ({ commands, editor }) => {
          const type = editor.isActive("heading") ? "heading" : "paragraph";
          return commands.updateAttributes(type, { pBorder: border });
        },
      unsetParagraphBorder:
        () =>
        ({ commands, editor }) => {
          const type = editor.isActive("heading") ? "heading" : "paragraph";
          return commands.updateAttributes(type, { pBorder: null });
        },
    };
  },
});

/* ------------------------------------------------------------------ */
/* Toolbar UI — Shadow picker                                          */
/* ------------------------------------------------------------------ */

export function ShadowPicker({ editor }: { editor: Editor }) {
  const activeShadow = (editor.getAttributes("textShadow").shadow ??
    null) as string | null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="লেখায় ছায়া"
          title="লেখায় ছায়া (Word-এর মতো)"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-primary/12 hover:text-primary",
            activeShadow && "bg-primary/15 text-primary"
          )}
        >
          <span
            className="text-[15px] font-bold leading-none"
            style={{ textShadow: "1.5px 1.5px 2px rgba(0,0,0,0.6)" }}
          >
            A
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="glass-strong w-60 p-2"
        side="bottom"
        align="start"
      >
        <p className="px-1 pb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          লেখায় ছায়া
        </p>
        <div className="flex flex-col gap-0.5">
          {TEXT_SHADOW_PRESETS.map((p) => {
            const isActive = (activeShadow ?? "") === p.value;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() =>
                  p.value
                    ? editor.chain().focus().setTextShadow(p.value).run()
                    : editor.chain().focus().unsetTextShadow().run()
                }
                className={cn(
                  "flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent",
                  isActive && "bg-primary/10 text-primary"
                )}
              >
                <span
                  className="text-base font-bold"
                  style={p.value ? { textShadow: p.value } : undefined}
                >
                  অ
                </span>
                <span className="text-xs text-muted-foreground">{p.label}</span>
              </button>
            );
          })}
        </div>
        <p className="px-1 pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          লেখা সিলেক্ট করে ছায়া বেছে নিন — Word-এর Text Effects-এর মতো।
        </p>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Toolbar UI — Border picker (text + paragraph)                        */
/* ------------------------------------------------------------------ */

export function BorderPicker({ editor }: { editor: Editor }) {
  const [style, setStyle] = useState("solid");
  const [width, setWidth] = useState("2px");
  const [color, setColor] = useState("#111827");

  const textBorder = (editor.getAttributes("textBorder").border ??
    null) as string | null;
  const paraBorder = ((editor.getAttributes("paragraph").pBorder ??
    editor.getAttributes("heading").pBorder ??
    null) as string | null);

  const css = `${width} ${style} ${color}`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="বর্ডার"
          title="বর্ডার — লেখায় বা প্যারায় (Word-এর মতো)"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-primary/12 hover:text-primary",
            (textBorder || paraBorder) && "bg-primary/15 text-primary"
          )}
        >
          <span
            className="flex h-[18px] w-[18px] items-center justify-center text-[13px] font-bold leading-none"
            style={{ border: "2px solid currentColor", borderRadius: "3px" }}
          >
            A
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="glass-strong w-64 p-2.5"
        side="bottom"
        align="start"
      >
        <p className="px-0.5 pb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          বর্ডার
        </p>

        {/* Border style */}
        <p className="px-0.5 pb-1 text-[11px] text-muted-foreground">ধরন</p>
        <div className="grid grid-cols-4 gap-1 pb-2">
          {BORDER_STYLES.map((s) => (
            <button
              key={s.value}
              type="button"
              title={s.label}
              aria-label={s.label}
              onClick={() => setStyle(s.value)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-md border px-1 py-1.5 text-[10px] transition-all hover:bg-accent",
                style === s.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground"
              )}
            >
              <span className="text-sm leading-none">{s.glyph}</span>
              {s.label}
            </button>
          ))}
        </div>

        {/* Border width */}
        <p className="px-0.5 pb-1 text-[11px] text-muted-foreground">মোটা</p>
        <div className="flex gap-1 pb-2">
          {BORDER_WIDTHS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWidth(w)}
              className={cn(
                "flex-1 rounded-md border px-1 py-1 text-[11px] transition-all hover:bg-accent",
                width === w
                  ? "border-primary bg-primary/10 font-semibold text-primary"
                  : "border-transparent text-muted-foreground"
              )}
            >
              {w}
            </button>
          ))}
        </div>

        {/* Border color */}
        <p className="px-0.5 pb-1 text-[11px] text-muted-foreground">রং</p>
        <div className="flex items-center gap-1.5 pb-2">
          {BORDER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`বর্ডার রং ${c}`}
              onClick={() => setColor(c)}
              className={cn(
                "h-6 w-6 rounded-md border border-black/10 shadow-sm transition-transform hover:scale-110",
                color === c && "ring-2 ring-ring"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {/* Live preview */}
        <div className="mb-2 flex items-center justify-center rounded-md bg-muted/40 px-2 py-2.5">
          <span style={{ border: css, padding: "2px 8px", borderRadius: "4px" }}>
            প্রিভিউ
          </span>
        </div>

        <Separator className="my-1.5" />

        <div className="flex gap-1.5">
          <Button
            size="sm"
            className="h-7 flex-1 text-xs"
            onClick={() => editor.chain().focus().setTextBorder(css).run()}
          >
            সিলেক্ট করা লেখায় দিন
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 flex-1 text-xs"
            onClick={() => editor.chain().focus().setParagraphBorder(css).run()}
          >
            পুরো প্যারায় দিন
          </Button>
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="mt-1.5 h-7 w-full text-xs"
          onClick={() => editor.chain().focus().wrapInBorderBox(css).run()}
        >
          সিলেক্ট করা প্যারাগুলো এক বর্ডারে
        </Button>
        {editor.isActive("borderBox") && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-1.5 h-7 w-full text-xs text-destructive hover:text-destructive"
            onClick={() => editor.chain().focus().unwrapBorderBox().run()}
          >
            গ্রুপ-বর্ডার খুলে ফেলুন
          </Button>
        )}
        {(textBorder || paraBorder) && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-1.5 h-7 w-full text-xs text-destructive hover:text-destructive"
            onClick={() => {
              editor.chain().focus().unsetTextBorder().run();
              editor.chain().focus().unsetParagraphBorder().run();
            }}
          >
            বর্ডার মুছে ফেলুন
          </Button>
        )}
        <p className="px-0.5 pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          লেখা সিলেক্ট করে “লেখায় দিন”, প্যারায় কার্সর রেখে “পুরো প্যারায়
          দিন” — Word-এর Borders-এর মতো। দুই বা ততোধিক প্যারা সিলেক্ট করে
          “এক বর্ডারে” চাপলে সবগুলো একটাই বর্ডারের ভেতরে আসবে।
        </p>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Shading — MS Word-এর "Shading"-এর মতো                             */
/*    সিলেক্ট করা লেখা / প্যারা / টেবিল সেলের পেছনে রং                    */
/* ------------------------------------------------------------------ */

/** Word-এর Theme Colors গ্রিড (১০ কলাম × ৬ সারি) */
export const THEME_COLORS: string[][] = [
  ["#FFFFFF", "#000000", "#E7E6E6", "#44546A", "#4472C4", "#ED7D31", "#A5A5A5", "#FFC000", "#5B9BD5", "#70AD47"],
  ["#F2F2F2", "#7F7F7F", "#D0CECE", "#D6DCE4", "#D9E1F2", "#FCE4D6", "#EDEDED", "#FFF2CC", "#DDEBF7", "#E2EFDA"],
  ["#D9D9D9", "#595959", "#A6A6A6", "#ADB9CA", "#B4C6E7", "#F8CBAD", "#DBDBDB", "#FFE699", "#BDD7EE", "#C6EFCE"],
  ["#BFBFBF", "#404040", "#808080", "#8497B0", "#8EA9DB", "#F4B084", "#C9C9C9", "#FFD966", "#9BC2E6", "#A9D08E"],
  ["#A6A6A6", "#262626", "#595959", "#333F50", "#305496", "#C55A11", "#7B7B7B", "#BF8F00", "#2E75B6", "#548235"],
  ["#808080", "#0D0D0D", "#404040", "#222B35", "#1F3864", "#833C0B", "#525252", "#7F6000", "#1F4E79", "#375623"],
];

/** Word-এর Standard Colors সারি */
export const STANDARD_COLORS = [
  "#C00000", "#FF0000", "#FFC000", "#FFFF00", "#92D050",
  "#00B050", "#00B0F0", "#0070C0", "#002060", "#7030A0",
];

/** Inline text shading mark — সিলেক্ট করা লেখার পেছনে রং */
export const TextShading = Mark.create({
  name: "textShading",

  addAttributes() {
    return {
      color: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-text-shading") || null,
        renderHTML: (attributes: { color?: string | null }) => {
          if (!attributes.color) return {};
          return {
            "data-text-shading": attributes.color,
            style: `background-color: ${attributes.color}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-text-shading]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setTextShading:
        (color: string) =>
        ({ chain }) =>
          chain().setMark("textShading", { color }).run(),
      unsetTextShading:
        () =>
        ({ chain }) =>
          chain().unsetMark("textShading").run(),
    };
  },
});

/** Paragraph / heading shading — পুরো প্যারার পেছনে রং */
export const ParagraphShading = Extension.create({
  name: "paragraphShading",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          pShading: {
            default: null as string | null,
            parseHTML: (element: HTMLElement) =>
              element.getAttribute("data-p-shading") || null,
            renderHTML: (attributes: { pShading?: string | null }) => {
              if (!attributes.pShading) return {};
              return {
                "data-p-shading": attributes.pShading,
                style: `background-color: ${attributes.pShading}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setParagraphShading:
        (color: string) =>
        ({ commands, editor }) => {
          const type = editor.isActive("heading") ? "heading" : "paragraph";
          return commands.updateAttributes(type, { pShading: color });
        },
      unsetParagraphShading:
        () =>
        ({ commands, editor }) => {
          const type = editor.isActive("heading") ? "heading" : "paragraph";
          return commands.updateAttributes(type, { pShading: null });
        },
    };
  },
});

/** Table cell / header with background-color + border attributes (Word-এর table shading/border) */
const cellDesignAttrs = () => ({
  backgroundColor: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
    renderHTML: (attributes: { backgroundColor?: string | null }) =>
      attributes.backgroundColor
        ? { style: `background-color: ${attributes.backgroundColor}` }
        : {},
  },
  cellBorder: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) =>
      element.getAttribute("data-cell-border") || null,
    renderHTML: (attributes: { cellBorder?: string | null }) =>
      attributes.cellBorder
        ? {
            "data-cell-border": attributes.cellBorder,
            style: `border: ${attributes.cellBorder}`,
          }
        : {},
  },
});

export const ShadedTableCell = BaseTableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellDesignAttrs() };
  },
});

export const ShadedTableHeader = BaseTableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...cellDesignAttrs() };
  },
});

/* ------------------------------------------------------------------ */
/* Toolbar UI — Shading picker (theme colors)                           */
/* ------------------------------------------------------------------ */

export function ShadingPicker({ editor }: { editor: Editor }) {
  const [color, setColor] = useState("#FFF2CC");

  const textShading = (editor.getAttributes("textShading").color ??
    null) as string | null;
  const paraShading = ((editor.getAttributes("paragraph").pShading ??
    editor.getAttributes("heading").pShading ??
    null) as string | null);
  // টেবিল সেলের শেডিংও গুনতে হবে — না হলে শুধু টেবিলে শেডিং থাকলে
  // "মুছে ফেলুন" বাটন দেখা যায় না
  const cellShading = ((editor.getAttributes("tableCell").backgroundColor ??
    editor.getAttributes("tableHeader").backgroundColor ??
    null) as string | null);
  const hasShading = Boolean(textShading || paraShading || cellShading);
  const inTable = editor.isActive("table");

  const swatch = (c: string, label?: string) => (
    <button
      key={c + (label ?? "")}
      type="button"
      aria-label={label ?? `শেডিং রং ${c}`}
      title={c}
      onClick={() => setColor(c)}
      className={cn(
        "h-6 w-6 rounded-[4px] border border-black/15 shadow-sm transition-transform hover:scale-110",
        color === c && "ring-2 ring-ring ring-offset-1"
      )}
      style={{ backgroundColor: c }}
    />
  );

  const applyText = () => editor.chain().focus().setTextShading(color).run();
  const applyPara = () => editor.chain().focus().setParagraphShading(color).run();
  const applyTable = () => {
    if (!inTable) {
      toast.error("টেবিলে শেডিং দিতে কার্সর টেবিলের ভেতরে রাখুন");
      return;
    }
    editor.chain().focus().setCellAttribute("backgroundColor", color).run();
  };
  const clearAll = () => {
    editor.chain().focus().unsetTextShading().run();
    editor.chain().focus().unsetParagraphShading().run();
    if (inTable) {
      editor.chain().focus().setCellAttribute("backgroundColor", null).run();
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="শেডিং"
          title="শেডিং — লেখা/প্যারা/টেবিলের পেছনে রং (Word-এর মতো)"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-primary/12 hover:text-primary",
            hasShading && "bg-primary/15 text-primary"
          )}
        >
          <PaintBucket className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="glass-strong max-h-[70vh] w-[296px] overflow-y-auto p-2.5"
        side="bottom"
        align="start"
      >
        <p className="px-0.5 pb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          শেডিং — পেছনের রং
        </p>

        {/* Theme colors */}
        <p className="px-0.5 pb-1 text-[11px] text-muted-foreground">
          থিম কালার
        </p>
        <div className="grid grid-cols-10 gap-1 pb-2">
          {THEME_COLORS.flat().map((c) => swatch(c))}
        </div>

        {/* Standard colors */}
        <p className="px-0.5 pb-1 text-[11px] text-muted-foreground">
          স্ট্যান্ডার্ড কালার
        </p>
        <div className="grid grid-cols-10 gap-1 pb-2">
          {STANDARD_COLORS.map((c) => swatch(c))}
        </div>

        {/* Current pick preview */}
        <div className="mb-2 flex items-center gap-2 rounded-md bg-muted/40 px-2 py-1.5">
          <span
            className="h-6 w-10 rounded border border-black/15"
            style={{ backgroundColor: color }}
          />
          <span className="text-[11px] text-muted-foreground">
            বাছাই করা রং: {color}
          </span>
        </div>

        <Separator className="my-1.5" />

        <div className="grid grid-cols-3 gap-1.5">
          <Button size="sm" className="h-7 text-xs" onClick={applyText}>
            লেখায় দিন
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            onClick={applyPara}
          >
            প্যারায় দিন
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 text-xs"
            onClick={applyTable}
            disabled={!inTable}
            title={inTable ? "সিলেক্ট করা সেলে শেডিং" : "কার্সর টেবিলের ভেতরে রাখুন"}
          >
            টেবিলে দিন
          </Button>
        </div>
        {(textShading || paraShading || cellShading) && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-1.5 h-7 w-full text-xs text-destructive hover:text-destructive"
            onClick={clearAll}
          >
            শেডিং মুছে ফেলুন
          </Button>
        )}
        <p className="px-0.5 pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          লেখা সিলেক্ট করে “লেখায় দিন”, প্যারায় কার্সর রেখে “প্যারায় দিন”,
          টেবিলের সেল সিলেক্ট করে “টেবিলে দিন” — Word-এর Shading-এর মতো।
        </p>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* 5. Font size — ইচ্ছামতো ফন্ট বড়/ছোট (MS Word-এর মতো)                  */
/* ------------------------------------------------------------------ */

/** Word-এর মতো পরিচিত সাইজ ধাপ (A+ / A− বাটনের জন্য) */
export const FONT_SIZE_STEPS = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 26, 28, 32, 36, 48, 72,
];
const BASE_FONT_PX = 16;
const MIN_FONT_PX = 6;
const MAX_FONT_PX = 200;

export const FontSize = Extension.create({
  name: "fontSize",

  addOptions() {
    return { types: ["textStyle"] };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null as string | null,
            parseHTML: (element: HTMLElement) =>
              element.style.fontSize || null,
            renderHTML: (attributes: { fontSize?: string | null }) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }) =>
          chain().setMark("textStyle", { fontSize: null }).run(),
    };
  },
});

/** সিলেকশনের বর্তমান ফন্ট সাইজ (px সংখ্যা), না থাকলে null */
export function getFontSizePx(editor: Editor): number | null {
  const v = editor.getAttributes("textStyle").fontSize as string | undefined;
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ------------------------------------------------------------------ */
/* Toolbar UI — Font size picker (Word-এর মতো)                          */
/* ------------------------------------------------------------------ */

const FS_BTN =
  "flex h-7 min-w-7 items-center justify-center rounded-md px-1 text-muted-foreground transition-all hover:bg-primary/12 hover:text-primary";

export function FontSizePicker({ editor }: { editor: Editor }) {
  const [custom, setCustom] = useState("");
  const current = getFontSizePx(editor);

  const applyPx = (px: number) => {
    const v = Math.min(MAX_FONT_PX, Math.max(MIN_FONT_PX, Math.round(px)));
    editor.chain().focus().setFontSize(`${v}px`).run();
    setCustom("");
  };

  const step = (dir: 1 | -1) => {
    const base = current ?? BASE_FONT_PX;
    const ordered =
      dir === 1 ? FONT_SIZE_STEPS : [...FONT_SIZE_STEPS].reverse();
    const next = ordered.find((s) => (dir === 1 ? s > base : s < base));
    if (next) applyPx(next);
    else applyPx(dir === 1 ? Math.min(MAX_FONT_PX, base + 2) : Math.max(MIN_FONT_PX, base - 2));
  };

  const applyCustom = () => {
    const n = parseInt(custom, 10);
    if (Number.isFinite(n) && n >= MIN_FONT_PX && n <= MAX_FONT_PX) {
      applyPx(n);
    } else {
      toast.error(`৬ থেকে ২০০-এর মধ্যে সাইজ দিন`);
    }
  };

  return (
    <div className="flex items-center gap-0.5" aria-label="ফন্ট সাইজ">
      <button
        type="button"
        aria-label="ফন্ট ছোট করুন"
        title="ফন্ট ছোট করুন"
        onClick={() => step(-1)}
        className={FS_BTN}
      >
        <span className="text-[12px] font-bold leading-none">A−</span>
      </button>

      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label="ফন্ট সাইজ বেছে নিন"
            title="ফন্ট সাইজ"
            className={cn(
              FS_BTN,
              "min-w-[44px] gap-0.5 text-[12px] font-semibold",
              current && "bg-primary/15 text-primary"
            )}
          >
            {current ?? "—"}
            <ChevronDown className="h-3 w-3 opacity-70" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="glass-strong w-60 p-2.5"
          side="bottom"
          align="start"
        >
          <p className="px-0.5 pb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            ফন্ট সাইজ
          </p>
          <div className="grid grid-cols-4 gap-1 pb-2">
            {FONT_SIZE_STEPS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => applyPx(s)}
                className={cn(
                  "rounded-md border px-1 py-1.5 text-[12px] transition-all hover:bg-accent",
                  current === s
                    ? "border-primary bg-primary/10 font-bold text-primary"
                    : "border-transparent text-muted-foreground"
                )}
              >
                {s}
              </button>
            ))}
          </div>

          <Separator className="my-1.5" />

          {/* Custom size */}
          <p className="px-0.5 pb-1 text-[11px] text-muted-foreground">
            নিজের মতো সাইজ (px)
          </p>
          <div className="flex gap-1.5">
            <input
              type="number"
              min={MIN_FONT_PX}
              max={MAX_FONT_PX}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyCustom();
              }}
              placeholder="যেমন ২১"
              aria-label="কাস্টম ফন্ট সাইজ"
              className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-primary"
            />
            <Button size="sm" className="h-7 shrink-0 text-xs" onClick={applyCustom}>
              দিন
            </Button>
          </div>

          {current !== null && (
            <Button
              size="sm"
              variant="ghost"
              className="mt-1.5 h-7 w-full text-xs text-muted-foreground"
              onClick={() => editor.chain().focus().unsetFontSize().run()}
            >
              ডিফল্ট সাইজে ফেরত যান
            </Button>
          )}
          <p className="px-0.5 pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            লেখা সিলেক্ট করে সাইজ বেছে নিন, অথবা A+ / A− চাপুন — Word-এর মতো।
          </p>
        </PopoverContent>
      </Popover>

      <button
        type="button"
        aria-label="ফন্ট বড় করুন"
        title="ফন্ট বড় করুন"
        onClick={() => step(1)}
        className={FS_BTN}
      >
        <span className="text-[12px] font-bold leading-none">A+</span>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 6. Table design — MS Word-এর "Table Design" ট্যাবের মতো               */
/*    স্টাইল প্রিসেট (হেডার/ডোরাকাটা) + টেবিল বর্ডার                      */
/* ------------------------------------------------------------------ */

/** পুরো টেবিলের বাইরের বর্ডার (table element-এ) */
export const TableDesign = Extension.create({
  name: "tableDesign",

  addGlobalAttributes() {
    return [
      {
        types: ["table"],
        attributes: {
          tableBorder: {
            default: null as string | null,
            parseHTML: (element: HTMLElement) =>
              element.getAttribute("data-table-border") || null,
            renderHTML: (attributes: { tableBorder?: string | null }) => {
              if (!attributes.tableBorder) return {};
              return {
                "data-table-border": attributes.tableBorder,
                style: `border: ${attributes.tableBorder}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTableBorder:
        (border: string) =>
        ({ commands }) =>
          commands.updateAttributes("table", { tableBorder: border }),
      unsetTableBorder:
        () =>
        ({ commands }) =>
          commands.updateAttributes("table", { tableBorder: null }),
    };
  },
});

/** Word-এর "Table Styles" গ্যালারির মতো — এক ক্লিকে চমৎকার ফরম্যাটিং */
export interface TableStyleDef {
  id: string;
  label: string;
  headerBg: string | null;
  headerTextColor: string | null;
  headerBold: boolean;
  bandBg: string | null;
  gridWidth: string;
  gridColor: string;
  outerWidth: string;
  outerColor: string;
}

export const TABLE_STYLES: TableStyleDef[] = [
  {
    id: "plain-grid", label: "সাধারণ গ্রিড",
    headerBg: null, headerTextColor: null, headerBold: false, bandBg: null,
    gridWidth: "1px", gridColor: "#BFBFBF", outerWidth: "2px", outerColor: "#808080",
  },
  {
    id: "blue", label: "নীল",
    headerBg: "#4472C4", headerTextColor: "#FFFFFF", headerBold: true, bandBg: "#D9E1F2",
    gridWidth: "1px", gridColor: "#B4C6E7", outerWidth: "2px", outerColor: "#4472C4",
  },
  {
    id: "green", label: "সবুজ",
    headerBg: "#70AD47", headerTextColor: "#FFFFFF", headerBold: true, bandBg: "#E2EFDA",
    gridWidth: "1px", gridColor: "#A9D08E", outerWidth: "2px", outerColor: "#70AD47",
  },
  {
    id: "orange", label: "কমলা",
    headerBg: "#ED7D31", headerTextColor: "#FFFFFF", headerBold: true, bandBg: "#FCE4D6",
    gridWidth: "1px", gridColor: "#F8CBAD", outerWidth: "2px", outerColor: "#ED7D31",
  },
  {
    id: "dark-blue", label: "গাঢ় নীল",
    headerBg: "#1F4E79", headerTextColor: "#FFFFFF", headerBold: true, bandBg: "#D6DCE4",
    gridWidth: "1px", gridColor: "#8497B0", outerWidth: "2px", outerColor: "#1F4E79",
  },
  {
    id: "gray", label: "ধূসর",
    headerBg: "#595959", headerTextColor: "#FFFFFF", headerBold: true, bandBg: "#F2F2F2",
    gridWidth: "1px", gridColor: "#BFBFBF", outerWidth: "2px", outerColor: "#595959",
  },
  {
    id: "purple", label: "বেগুনি",
    headerBg: "#7030A0", headerTextColor: "#FFFFFF", headerBold: true, bandBg: "#EDE7F8",
    gridWidth: "1px", gridColor: "#C9BEE0", outerWidth: "2px", outerColor: "#7030A0",
  },
  {
    id: "maroon", label: "মেরুন",
    headerBg: "#C00000", headerTextColor: "#FFFFFF", headerBold: true, bandBg: "#F9DCDC",
    gridWidth: "1px", gridColor: "#E8AFAF", outerWidth: "2px", outerColor: "#C00000",
  },
  {
    id: "gold", label: "সোনালি",
    headerBg: "#BF8F00", headerTextColor: "#FFFFFF", headerBold: true, bandBg: "#FFF2CC",
    gridWidth: "1px", gridColor: "#E3C878", outerWidth: "2px", outerColor: "#BF8F00",
  },
  {
    id: "sky", label: "আকাশি",
    headerBg: "#BDD7EE", headerTextColor: null, headerBold: true, bandBg: "#DDEBF7",
    gridWidth: "1px", gridColor: "#9BC2E6", outerWidth: "2px", outerColor: "#2E75B6",
  },
];

/**
 * হেডার সেলের লেখার স্টাইল (Word-এর মতো সাদা বোল্ড হেডার)।
 * fontSize-এর মতো আগের ফরম্যাটিং অক্ষত রেখে শুধু রং/বোল্ড বদলায়।
 * textColor null হলে আগের জোর করা রং তুলে দেয়।
 */
function applyHeaderText(
  tr: Transaction,
  schema: PMNode["type"]["schema"],
  cellPos: number,
  node: PMNode,
  textColor: string | null,
  makeBold: boolean
) {
  const from = cellPos + 1;
  const to = cellPos + node.nodeSize - 1;
  if (from >= to) return;
  const textStyleType = schema.marks.textStyle;
  const boldType = schema.marks.bold;
  if (!textStyleType || !boldType) return;

  // আগের textStyle attr (যেমন fontSize) ধরে রাখতে প্রতি টেক্সট নোডের attr মনে রাখি
  const pending: Array<{ from: number; to: number; attrs: Record<string, unknown> }> = [];
  tr.doc.nodesBetween(from, to, (n, pos) => {
    if (n.isText) {
      const m = n.marks.find((mk) => mk.type === textStyleType);
      pending.push({ from: pos, to: pos + n.nodeSize, attrs: { ...(m ? m.attrs : {}) } });
    }
  });

  tr.removeMark(from, to, textStyleType);
  if (makeBold) tr.addMark(from, to, boldType.create());
  else tr.removeMark(from, to, boldType);

  for (const p of pending) {
    const attrs: Record<string, unknown> = { ...p.attrs, color: textColor };
    if (attrs.color || attrs.fontSize || attrs.fontFamily) {
      tr.addMark(p.from, p.to, textStyleType.create(attrs));
    }
  }
}

/** গ্যালারি থেকে স্টাইল প্রয়োগ — পুরো টেবিল এক ক্লিকে সাজে */
export function applyTableStyle(editor: Editor, style: TableStyleDef): boolean {
  const { state, view } = editor;
  const found = findParentNode((n) => n.type.name === "table")(state.selection);
  if (!found) {
    toast.error("কার্সর টেবিলের ভেতরে রাখুন");
    return false;
  }
  const schema = state.schema;
  const tableStart = found.start;
  const table = found.node;
  const map = TableMap.get(table);
  const tr = state.tr;
  const seen = new Set<number>();
  for (let i = 0; i < map.map.length; i++) {
    const off = map.map[i];
    if (seen.has(off)) continue;
    seen.add(off);
    const node = table.nodeAt(off);
    if (!node) continue;
    const row = Math.floor(i / map.width);
    const cellPos = tableStart + off;

    let bg: string | null = null;
    if (row === 0 && style.headerBg) bg = style.headerBg;
    else if (style.bandBg && row % 2 === 1) bg = style.bandBg;

    tr.setNodeMarkup(cellPos, undefined, {
      ...node.attrs,
      backgroundColor: bg,
      cellBorder: `${style.gridWidth} solid ${style.gridColor}`,
    });

    if (row === 0) {
      applyHeaderText(tr, schema, cellPos, node, style.headerTextColor, style.headerBold);
    }
  }
  tr.setNodeMarkup(found.pos, undefined, {
    ...table.attrs,
    tableBorder: `${style.outerWidth} solid ${style.outerColor}`,
  });
  view.dispatch(tr);
  return true;
}

/**
 * কার্সরের টেবিলের প্রতিটি সেলে fn চালায় (row/col সহ)।
 * rowspan/colspan-এ একই সেল একবারই আসে।
 */
export function withTableCells(
  editor: Editor,
  fn: (tr: Transaction, cellPos: number, node: PMNode, row: number, col: number) => void
): boolean {
  const { state, view } = editor;
  const found = findParentNode((n) => n.type.name === "table")(state.selection);
  if (!found) {
    toast.error("কার্সর টেবিলের ভেতরে রাখুন");
    return false;
  }
  const tableStart = found.start;
  const table = found.node;
  const map = TableMap.get(table);
  const tr = state.tr;
  const seen = new Set<number>();
  for (let i = 0; i < map.map.length; i++) {
    const off = map.map[i];
    if (seen.has(off)) continue;
    seen.add(off);
    const node = table.nodeAt(off);
    if (!node) continue;
    fn(tr, tableStart + off, node, Math.floor(i / map.width), i % map.width);
  }
  view.dispatch(tr);
  return true;
}

/** সব সেলে বর্ডার বসান / তুলুন */
export function setAllCellsBorder(
  editor: Editor,
  border: string | null
): boolean {
  return withTableCells(editor, (tr, cellPos, node) => {
    tr.setNodeMarkup(cellPos, undefined, { ...node.attrs, cellBorder: border });
  });
}

/* ------------------------------------------------------------------ */
/* Toolbar UI — Table design controls (টেবিল পপওভারের ভেতরে বসে)          */
/* ------------------------------------------------------------------ */

/** গ্যালারির প্রতিটি স্টাইলের ছোট প্রিভিউ (Word-এর style gallery-এর মতো) */
function TableStylePreview({ style }: { style: TableStyleDef }) {
  const rows = [0, 1, 2];
  const cellBg = (r: number) => {
    if (r === 0 && style.headerBg) return style.headerBg;
    if (style.bandBg && r % 2 === 1) return style.bandBg;
    return "#FFFFFF";
  };
  return (
    <div
      className="w-full overflow-hidden rounded-[3px] bg-white"
      style={{ border: `${style.outerWidth} solid ${style.outerColor}` }}
    >
      {rows.map((r) => (
        <div key={r} className="flex" style={{ backgroundColor: cellBg(r) }}>
          {[0, 1, 2].map((c) => (
            <div
              key={c}
              className="flex h-[10px] flex-1 items-center justify-center"
              style={{
                borderRight:
                  c < 2 ? `${style.gridWidth} solid ${style.gridColor}` : undefined,
                borderBottom:
                  r < 2 ? `${style.gridWidth} solid ${style.gridColor}` : undefined,
              }}
            >
              {r === 0 && (
                <div
                  className="h-[3px] w-3/5 rounded-full"
                  style={{ backgroundColor: style.headerTextColor ?? "#9CA3AF" }}
                />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Word-এর Table Styles গ্যালারি — ক্লিকেই পুরো টেবিল সাজে */
export function TableStylesGallery({ editor }: { editor: Editor }) {
  const inTable = editor.isActive("table");
  return (
    <div>
      <p className="px-0.5 pb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        টেবিল স্টাইল
      </p>
      <div className="grid grid-cols-2 gap-1 pb-1">
        {TABLE_STYLES.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={!inTable}
            onClick={() => applyTableStyle(editor, s)}
            className="flex flex-col gap-1 rounded-md border border-transparent p-1.5 transition-all hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
          >
            <TableStylePreview style={s} />
            <span className="text-[11px] font-medium leading-none">{s.label}</span>
          </button>
        ))}
      </div>
      {!inTable && (
        <p className="px-0.5 pt-1 text-[10px] leading-relaxed text-muted-foreground">
          স্টাইল দিতে কার্সর টেবিলের ভেতরে রাখুন।
        </p>
      )}
    </div>
  );
}

export function TableDesignControls({ editor }: { editor: Editor }) {
  const [bStyle, setBStyle] = useState("solid");
  const [bWidth, setBWidth] = useState("2px");
  const [bColor, setBColor] = useState("#111827");
  const borderCss = `${bWidth} ${bStyle} ${bColor}`;
  const inTable = editor.isActive("table");

  return (
    <div>
      <TableStylesGallery editor={editor} />

      <Separator className="my-1.5" />

      {/* Border controls */}
      <p className="px-0.5 pb-1 text-[11px] text-muted-foreground">
        কাস্টম বর্ডার
      </p>
      <div className="grid grid-cols-4 gap-1 pb-2">
        {BORDER_STYLES.map((s) => (
          <button
            key={s.value}
            type="button"
            title={s.label}
            disabled={!inTable}
            onClick={() => setBStyle(s.value)}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-md border px-1 py-1 text-[10px] transition-all hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40",
              bStyle === s.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-transparent text-muted-foreground"
            )}
          >
            <span className="text-xs leading-none">{s.glyph}</span>
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1 pb-2">
        {BORDER_WIDTHS.map((w) => (
          <button
            key={w}
            type="button"
            disabled={!inTable}
            onClick={() => setBWidth(w)}
            className={cn(
              "flex-1 rounded-md border px-1 py-1 text-[11px] transition-all hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40",
              bWidth === w
                ? "border-primary bg-primary/10 font-semibold text-primary"
                : "border-transparent text-muted-foreground"
            )}
          >
            {w}
          </button>
        ))}
        <div className="flex flex-1 items-center justify-center gap-1">
          {["#111827", "#b91c1c", "#1d4ed8", "#15803d"].map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`বর্ডার রং ${c}`}
              disabled={!inTable}
              onClick={() => setBColor(c)}
              className={cn(
                "h-5 w-5 rounded border border-black/10 shadow-sm transition-transform hover:scale-110 disabled:cursor-not-allowed",
                bColor === c && "ring-2 ring-ring"
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={!inTable}
          onClick={() => editor.chain().focus().setTableBorder(borderCss).run()}
        >
          পুরো টেবিলে
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 text-xs"
          disabled={!inTable}
          onClick={() => setAllCellsBorder(editor, borderCss)}
        >
          সব সেলে
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs text-destructive hover:text-destructive"
          disabled={!inTable}
          onClick={() => {
            editor.chain().focus().unsetTableBorder().run();
            setAllCellsBorder(editor, null);
          }}
        >
          বর্ডার তুলুন
        </Button>
      </div>
      {!inTable && (
        <p className="px-0.5 pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          টেবিল ডিজাইন ব্যবহার করতে কার্সর টেবিলের ভেতরে রাখুন।
        </p>
      )}
    </div>
  );
}
