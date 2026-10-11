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
import { Mark, Extension, mergeAttributes } from "@tiptap/core";
import type { Editor } from "@tiptap/react";
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
          লেখা সিলেক্ট করে “লেখায় দিন”, অথবা প্যারায় কার্সর রেখে “পুরো প্যারায়
          দিন” — Word-এর Borders-এর মতো।
        </p>
      </PopoverContent>
    </Popover>
  );
}
