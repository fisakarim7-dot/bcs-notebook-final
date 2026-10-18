"use client";

/**
 * v35 — BCS exam-style format blocks + icon palette + multi-paragraph border grouping.
 *
 *   1. BorderBox node      — 2+ paragraph-কে Word-এর মতো ONE shared border-এর
 *      ভেতরে wrap করে (আগে প্রতিটা প্যারায় আলাদা বর্ডার হতো)।
 *   2. FormatBox node      — পরীক্ষার খাতার ৯টা ফরম্যাট (সেকশন কার্ড, মূল ধারণা
 *      বক্স, আইকন তালিকা, উদাহরণ ব্লক, চেকমার্ক তালিকা, ফ্লোচার্ট,
 *      নম্বরযুক্ত আউটলাইন কার্ড, টাইমলাইন, নোট হেডার)। টুলবারের "ফরম্যাট"
 *      মেনু থেকে placeholder-সহ বসে; ভেতরের লেখা মুছে নিজেরটা লেখা যায়।
 *      নোট-লেভেল কালপুরুষ/Times ফন্ট-টগল স্বয়ংক্রিয়ভাবে প্রযোজ্য হয়
 *      (ফরম্যাট-CSS-এ কোনো font-family বসানো নেই)।
 *   3. BcsIcon inline node — লেখার মাঝে Lucide আইকন (প্যালেট থেকে বাছাই)।
 *
 * সবকিছু HTML-এ data-attribute হিসেবে সেভ হয়, তাই save → reload →
 * reader — সব জায়গায় একইভাবে দেখায় (reader আলাদা renderer ব্যবহার করে না;
 * একই shared extension set সব editor-এ মাউন্ট হয়)।
 */

import { useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import type { CommandProps } from "@tiptap/core";
import { DOMParser } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";
import {
  ReactNodeViewRenderer,
  NodeViewWrapper,
  NodeViewContent,
} from "@tiptap/react";
import type { NodeViewProps } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import {
  Globe,
  Landmark,
  Scale,
  Cpu,
  Banknote,
  BookOpen,
  GraduationCap,
  Target,
  Shield,
  ShieldCheck,
  Users,
  Flag,
  Lightbulb,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Map,
  MapPin,
  Clock,
  Calendar,
  Building2,
  Factory,
  Ship,
  Zap,
  Droplets,
  Flame,
  Leaf,
  Star,
  Award,
  Briefcase,
  Gavel,
  Handshake,
  Brain,
  Rocket,
  Compass,
  Hourglass,
  Wallet,
  PiggyBank,
  Newspaper,
  Eye,
  Info,
  Sparkles,
  Anchor,
  Vote,
  Languages,
  Network,
  Milestone,
  ScrollText,
  LayoutTemplate,
  Shapes,
  SeparatorVertical,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

/* ------------------------------------------------------------------ */
/* TypeScript: custom commands                                         */
/* ------------------------------------------------------------------ */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    borderBox: {
      wrapInBorderBox: (border: string) => ReturnType;
      unwrapBorderBox: () => ReturnType;
    };
    formatBox: {
      insertFormatBox: (format: FormatKind) => ReturnType;
    };
    bcsIcon: {
      insertIcon: (name: string) => ReturnType;
    };
    bcsShape: {
      insertBcsShape: (shape?: BcsShapeKind) => ReturnType;
    };
    vLine: {
      insertVLine: (
        style?: VLineStyle,
        orientation?: VLineOrientation,
        thickness?: VLineThickness,
        color?: VLineColor
      ) => ReturnType;
    };
  }
}

/* ------------------------------------------------------------------ */
/* Icon registry (Lucide — app-এ আগে থেকেই আছে)                        */
/* ------------------------------------------------------------------ */

export const FORMAT_ICONS: Record<string, LucideIcon> = {
  globe: Globe,
  landmark: Landmark,
  scale: Scale,
  cpu: Cpu,
  banknote: Banknote,
  book: BookOpen,
  cap: GraduationCap,
  target: Target,
  shield: Shield,
  shieldcheck: ShieldCheck,
  users: Users,
  flag: Flag,
  bulb: Lightbulb,
  alert: AlertTriangle,
  check: CheckCircle2,
  up: TrendingUp,
  down: TrendingDown,
  chart: BarChart3,
  map: Map,
  pin: MapPin,
  clock: Clock,
  calendar: Calendar,
  building: Building2,
  factory: Factory,
  ship: Ship,
  zap: Zap,
  drop: Droplets,
  flame: Flame,
  leaf: Leaf,
  star: Star,
  award: Award,
  briefcase: Briefcase,
  gavel: Gavel,
  handshake: Handshake,
  brain: Brain,
  rocket: Rocket,
  compass: Compass,
  hourglass: Hourglass,
  wallet: Wallet,
  piggy: PiggyBank,
  news: Newspaper,
  eye: Eye,
  info: Info,
  sparkles: Sparkles,
  anchor: Anchor,
  vote: Vote,
  lang: Languages,
  network: Network,
  milestone: Milestone,
  scroll: ScrollText,
};

export const ICON_PALETTE: Array<{ name: string; label: string }> = [
  { name: "globe", label: "বিশ্বায়ন" },
  { name: "landmark", label: "রাষ্ট্র/প্রতিষ্ঠান" },
  { name: "scale", label: "ন্যায়বিচার" },
  { name: "cpu", label: "প্রযুক্তি" },
  { name: "banknote", label: "অর্থ" },
  { name: "book", label: "বই" },
  { name: "cap", label: "শিক্ষা" },
  { name: "target", label: "লক্ষ্য" },
  { name: "shield", label: "নিরাপত্তা" },
  { name: "shieldcheck", label: "সুরক্ষা" },
  { name: "users", label: "জনগণ" },
  { name: "flag", label: "পতাকা" },
  { name: "bulb", label: "ধারণা" },
  { name: "alert", label: "সতর্কতা" },
  { name: "check", label: "সঠিক" },
  { name: "up", label: "উর্ধ্বগতি" },
  { name: "down", label: "নিম্নগতি" },
  { name: "chart", label: "পরিসংখ্যান" },
  { name: "map", label: "মানচিত্র" },
  { name: "pin", label: "অবস্থান" },
  { name: "clock", label: "সময়" },
  { name: "calendar", label: "তারিখ" },
  { name: "building", label: "ভবন" },
  { name: "factory", label: "শিল্প" },
  { name: "ship", label: "জাহাজ" },
  { name: "zap", label: "শক্তি" },
  { name: "drop", label: "পানি" },
  { name: "flame", label: "আগুন/জ্বালানি" },
  { name: "leaf", label: "পরিবেশ" },
  { name: "star", label: "তারা" },
  { name: "award", label: "পুরস্কার" },
  { name: "briefcase", label: "চাকরি" },
  { name: "gavel", label: "আদালত" },
  { name: "handshake", label: "চুক্তি" },
  { name: "brain", label: "বুদ্ধিমত্তা" },
  { name: "rocket", label: "অগ্রগতি" },
  { name: "compass", label: "দিকনির্দেশনা" },
  { name: "hourglass", label: "ইতিহাস" },
  { name: "wallet", label: "বাজেট" },
  { name: "piggy", label: "সঞ্চয়" },
  { name: "news", label: "সংবাদ" },
  { name: "eye", label: "পর্যবেক্ষণ" },
  { name: "info", label: "তথ্য" },
  { name: "sparkles", label: "বিশেষ" },
  { name: "anchor", label: "নোঙর" },
  { name: "vote", label: "ভোট" },
  { name: "lang", label: "ভাষা" },
  { name: "network", label: "নেটওয়ার্ক" },
  { name: "milestone", label: "মাইলফলক" },
  { name: "scroll", label: "দলিল" },
];

/* ------------------------------------------------------------------ */
/* Shared Enter behavior for wrapper boxes (formatBox + borderBox):      */
/*  - Enter ভেতরে নতুন আইটেম/প্যারা বানায় (বক্সের ভেতরেই থাকে)          */
/*  - খালি শেষ প্যারায় Enter চাপলে বক্স থেকে বেরিয়ে নিচে নতুন প্যারা    */
/* ------------------------------------------------------------------ */

function boxEnterHandler(boxName: "formatBox" | "borderBox") {
  return ({ editor }: { editor: Editor }) => {
    const { $from } = editor.state.selection;
    let boxDepth = -1;
    for (let d = $from.depth; d >= 0; d -= 1) {
      if ($from.node(d).type.name === boxName) {
        boxDepth = d;
        break;
      }
    }
    if (boxDepth < 0) return false; // বক্সের ভেতরে না — ডিফল্ট আচরণ
    const boxNode = $from.node(boxDepth);
    const childIndex = $from.index(boxDepth);
    if (childIndex >= boxNode.childCount) return false;
    const childNode = boxNode.child(childIndex);
    const isLast = childIndex === boxNode.childCount - 1;
    const isEmpty =
      childNode.isTextblock && childNode.textContent.trim() === "";
    if (isEmpty && isLast) {
      // বক্স থেকে বের হও: ঠিক নিচে নতুন প্যারা, কার্সর সেখানে
      const boxEnd = $from.after(boxDepth);
      const p = editor.state.schema.nodes.paragraph.create();
      const tr = editor.state.tr.insert(boxEnd, p);
      tr.setSelection(TextSelection.create(tr.doc, boxEnd + 1));
      editor.view.dispatch(tr);
      editor.view.focus();
      return true;
    }
    return false; // ডিফল্ট splitBlock — নতুন আইটেম বক্সের ভেতরেই
  };
}

/* formatBox-এর Enter: প্যারার শেষে চাপলে ওই ফরম্যাটের নতুন আইটেম বসে */
function formatBoxEnter({ editor }: { editor: Editor }) {
  const { state } = editor;
  if (!state.selection.empty) return false;
  const { $from } = state.selection;
  let boxDepth = -1;
  for (let d = $from.depth; d >= 0; d -= 1) {
    if ($from.node(d).type.name === "formatBox") {
      boxDepth = d;
      break;
    }
  }
  if (boxDepth < 0) return false;
  const boxNode = $from.node(boxDepth);
  const childIndex = $from.index(boxDepth);
  if (childIndex >= boxNode.childCount) return false;
  const para = $from.parent;
  if (!para.isTextblock) return false;
  const atEnd = $from.parentOffset === para.content.size;
  const isEmpty = para.textContent.trim() === "";
  const isLast = childIndex === boxNode.childCount - 1;

  if (isEmpty && isLast) {
    // খালি শেষ প্যারায় Enter → বক্স থেকে বের হও
    const boxEnd = $from.after(boxDepth);
    const p = state.schema.nodes.paragraph.create();
    const tr = state.tr.insert(boxEnd, p);
    tr.setSelection(TextSelection.create(tr.doc, boxEnd + 1));
    editor.view.dispatch(tr);
    editor.view.focus();
    return true;
  }
  if (atEnd && !isEmpty) {
    // প্যারার শেষে Enter → নতুন টেমপ্লেট আইটেম
    const format = boxNode.attrs.format as FormatKind;
    const itemHtml = FORMAT_ITEMS[format];
    if (!itemHtml) return false;
    const wrap = document.createElement("div");
    wrap.innerHTML = itemHtml;
    const slice = DOMParser.fromSchema(state.schema).parseSlice(wrap);
    const insertPos = $from.after();
    const tr = state.tr.insert(insertPos, slice.content);
    tr.setSelection(TextSelection.create(tr.doc, insertPos + 1));
    editor.view.dispatch(tr);
    editor.view.focus();
    return true;
  }
  return false; // মাঝখানে Enter → ডিফল্ট split
}

/* ------------------------------------------------------------------ */
/* 1. BorderBox — একাধিক প্যারাগ্রাফ, একটাই বর্ডার                      */
/* ------------------------------------------------------------------ */

export const BorderBox = Node.create({
  name: "borderBox",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      border: {
        default: "2px solid #111827",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-border-box"),
        renderHTML: (attributes: { border?: string | null }) => {
          if (!attributes.border) return {};
          return {
            "data-border-box": attributes.border,
            style: `border: ${attributes.border}; padding: 8px 12px; border-radius: 8px;`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-border-box]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes), 0];
  },

  addKeyboardShortcuts() {
    return { Enter: boxEnterHandler("borderBox") };
  },

  addCommands() {
    return {
      wrapInBorderBox:
        (border: string) =>
        ({ commands }: CommandProps) =>
          commands.wrapIn("borderBox", { border }),
      unwrapBorderBox:
        () =>
        ({ state, dispatch }: CommandProps) => {
          const { $from } = state.selection;
          let depth = -1;
          for (let d = $from.depth; d >= 0; d -= 1) {
            if ($from.node(d).type.name === "borderBox") {
              depth = d;
              break;
            }
          }
          if (depth < 0) return false;
          if (dispatch) {
            const node = $from.node(depth);
            const from = $from.before(depth);
            const to = from + node.nodeSize;
            dispatch(state.tr.replaceWith(from, to, node.content));
          }
          return true;
        },
    };
  },
});

import { ICON_SVG_ATTRS, ICON_SVG_INNER } from "./icon-svg";
import type { DOMOutputSpec } from "prosemirror-model";

/* lucide আইকনের static SVG spec — রিডার/PDF-এর HTML-এ বসে।
 * (NodeView শুধু এডিটরে চলে; getHTML()/renderHTML-এর string-এ SVG থাকতে হবে।) */
function iconSvgSpec(name: string): DOMOutputSpec {
  const inner = ICON_SVG_INNER[name] || ICON_SVG_INNER.sparkles;
  return [
    "svg",
    { ...ICON_SVG_ATTRS },
    ...inner.map(([t, a]): DOMOutputSpec => [t, { ...a }]),
  ];
}

/* ------------------------------------------------------------------ */
/* 2. FormatBox — পরীক্ষার খাতার ৯টা ফরম্যাট ব্লক                       */
/* ------------------------------------------------------------------ */

export type FormatKind =
  | "section-card"
  | "key-point"
  | "icon-list"
  | "example"
  | "check-list"
  | "flowchart"
  | "outline-card"
  | "timeline"
  | "note-header";

export interface FormatTemplate {
  label: string;
  hint: string;
  icon: string | null;
  body: string;
}

export const FORMAT_TEMPLATES: Record<FormatKind, FormatTemplate> = {
  "section-card": {
    label: "সেকশন কার্ড",
    hint: "৫.১, ৫.২… নম্বরসহ শিরোনাম + বর্ণনা",
    icon: "globe",
    body:
      "<p><strong>৫.১ শিরোনাম লিখুন</strong></p>" +
      "<p>বর্ণনা লিখুন…</p>",
  },
  "key-point": {
    label: "মূল ধারণা বক্স",
    hint: "এক বাক্যে মূল ধারণা + Key concepts",
    icon: null,
    body:
      "<p><strong>মূল ধারণা এক বাক্যে</strong></p>" +
      "<p>এক বাক্যে মূল ধারণা লিখুন…</p>" +
      "<p>Key concepts: ধারণা ১ · ধারণা ২ · ধারণা ৩</p>",
  },
  "icon-list": {
    label: "আইকন তালিকা",
    hint: "প্রতিটি পয়েন্টের আগে আইকন",
    icon: null,
    body:
      '<p><span class="bcs-ico" data-icon-inline="globe"></span> <strong>১. শিরোনাম</strong></p>' +
      "<p>বর্ণনা লিখুন…</p>" +
      '<p><span class="bcs-ico" data-icon-inline="target"></span> <strong>২. শিরোনাম</strong></p>' +
      "<p>বর্ণনা লিখুন…</p>",
  },
  example: {
    label: "উদাহরণ ব্লক",
    hint: "ছবি পাশে, নোট পাশে — ব্লকের শুরুতে ছবি বাটন চাপুন",
    icon: null,
    body:
      "<p><strong>উদাহরণ ১: শিরোনাম</strong></p>" +
      "<p>প্রেক্ষাপট বা ট্যাগলাইন</p>" +
      "<p>বর্ণনা লিখুন…</p>" +
      "<p><strong>বিশ্লেষণ:</strong> বিশ্লেষণ লিখুন…</p>",
  },
  "check-list": {
    label: "চেকমার্ক তালিকা",
    hint: "ভূমিকা, কাঠামো, মূল্যায়ন…",
    icon: null,
    body:
      "<p><strong>ভূমিকা</strong></p>" +
      "<p>নির্দেশনা লিখুন…</p>" +
      "<p><strong>তাত্ত্বিক কাঠামো</strong></p>" +
      "<p>নির্দেশনা লিখুন…</p>" +
      "<p><strong>মূল্যায়ন ও উপসংহার</strong></p>" +
      "<p>নির্দেশনা লিখুন…</p>",
  },
  flowchart: {
    label: "ফ্লোচার্ট",
    hint: "Enter চাপলেই নতুন ধাপ — যত খুশি",
    icon: null,
    body:
      "<p><strong>প্রথম ধাপ</strong><br/>বর্ণনা…</p>" +
      "<p><strong>দ্বিতীয় ধাপ</strong><br/>বর্ণনা…</p>" +
      "<p><strong>তৃতীয় ধাপ</strong><br/>বর্ণনা…</p>",
  },
  "outline-card": {
    label: "নম্বরযুক্ত কার্ড",
    hint: "শিরোনাম বোল্ড করলেই বাংলা নম্বর (১২৩)",
    icon: null,
    body:
      "<p><strong>ধারণা ও তাত্ত্বিক ভিত্তি</strong></p>" +
      "<p>ব্যাখ্যা লিখুন…</p>" +
      "<p><strong>বিশ্লেষণের প্রয়োগ</strong></p>" +
      "<p>ব্যাখ্যা লিখুন…</p>",
  },
  timeline: {
    label: "টাইমলাইন",
    hint: "সাল বোল্ড রাখলেই ব্যাজ + নীল ডট",
    icon: null,
    body:
      "<p><strong>১৯৫১</strong> — <strong>শিরোনাম</strong></p>" +
      "<p>বর্ণনা লিখুন…</p>" +
      "<p><strong>১৯৫৭</strong> — <strong>শিরোনাম</strong></p>" +
      "<p>বর্ণনা লিখুন…</p>",
  },
  "note-header": {
    label: "নোট হেডার",
    hint: "শিরোনাম + ট্যাগ লাইন",
    icon: null,
    body:
      "<p><strong>নোটের শিরোনাম</strong></p>" +
      "<p>ট্যাগ ১ · ট্যাগ ২ · BCS Written</p>",
  },
};

/* প্রতিটি ফরম্যাটের "নতুন আইটেম" — প্যারার শেষে Enter চাপলে এটাই বসবে */
export const FORMAT_ITEMS: Record<FormatKind, string> = {
  "section-card": "<p>নতুন প্যারা…</p>",
  "key-point": "<p>নতুন পয়েন্ট…</p>",
  "icon-list": "<p>• নতুন পয়েন্ট…</p>",
  "example": "<p>নতুন উদাহরণ…</p>",
  "check-list": "<p>☐ নতুন আইটেম…</p>",
  "flowchart": "<p><strong>নতুন ধাপ</strong><br/>বর্ণনা…</p>",
  "outline-card":
    "<p><strong>নতুন শিরোনাম</strong></p><p>ব্যাখ্যা লিখুন…</p>",
  "timeline":
    "<p><strong>২০২৬</strong> — <strong>শিরোনাম</strong></p><p>বর্ণনা লিখুন…</p>",
  "note-header": "<p>নতুন নোট…</p>",
};

export const FORMAT_ORDER: FormatKind[] = [
  "section-card",
  "key-point",
  "icon-list",
  "example",
  "check-list",
  "flowchart",
  "outline-card",
  "timeline",
  "note-header",
];

function FormatBoxView({ node }: NodeViewProps) {
  const IconComp =
    typeof node.attrs.icon === "string"
      ? FORMAT_ICONS[node.attrs.icon]
      : null;
  return (
    <NodeViewWrapper
      className="bcs-fmt"
      data-format={node.attrs.format as string}
      {...(typeof node.attrs.icon === "string"
        ? { "data-icon": node.attrs.icon as string }
        : {})}
    >
      {IconComp ? (
        <span
          className="bcs-fmt-icon"
          contentEditable={false}
          suppressContentEditableWarning
        >
          <IconComp />
        </span>
      ) : null}
      <NodeViewContent className="bcs-fmt-content" />
    </NodeViewWrapper>
  );
}

export const FormatBox = Node.create({
  name: "formatBox",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      format: {
        default: "section-card",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-format") || "section-card",
        renderHTML: (attributes: { format?: string }) => ({
          "data-format": attributes.format || "section-card",
        }),
      },
      icon: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-icon"),
        renderHTML: (attributes: { icon?: string | null }) =>
          attributes.icon ? { "data-icon": attributes.icon } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-format]" }];
  },

  renderHTML({ HTMLAttributes }) {
    /* রিডার/PDF-এর static HTML-এ .bcs-fmt-content wrapper থাকতেই হবে —
     * সব ফরম্যাট CSS এই wrapper-কে টার্গেট করে। */
    return [
      "div",
      mergeAttributes({ class: "bcs-fmt" }, HTMLAttributes),
      ["div", { class: "bcs-fmt-content" }, 0],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FormatBoxView);
  },

  addKeyboardShortcuts() {
    return { Enter: formatBoxEnter };
  },

  addCommands() {
    return {
      insertFormatBox:
        (format: FormatKind) =>
        ({ commands }: CommandProps) => {
          const tpl = FORMAT_TEMPLATES[format];
          if (!tpl) return false;
          const iconAttr = tpl.icon ? ` data-icon="${tpl.icon}"` : "";
          return commands.insertContent(
            `<div class="bcs-fmt" data-format="${format}"${iconAttr}>${tpl.body}</div>`
          );
        },
    };
  },
});

/* Insert-এর পর (toolbar handler থেকে ডাকতে হবে — command-এর ভেতরে নয়):
 *  - বক্সই শেষ নোড হলে নিচে খালি প্যারা (বাইরে ক্লিক করে সহজে বের হওয়া যায়)
 *  - কার্সর বক্সের প্রথম প্যারার ভেতরে (প্রথম Enter-ই ভেতরে নতুন আইটেম বানাবে) */
export function afterFormatBoxInsert(editor: Editor) {
  let boxPos = -1;
  const { $from } = editor.state.selection;
  editor.state.doc.nodesBetween(0, $from.pos, (node, pos) => {
    if (node.type.name === "formatBox") boxPos = pos;
  });
  if (boxPos < 0) return;
  const boxNode = editor.state.doc.nodeAt(boxPos);
  if (!boxNode) return;
  const tr = editor.state.tr;
  const boxEnd = boxPos + boxNode.nodeSize;
  if (!tr.doc.nodeAt(boxEnd)) {
    tr.insert(boxEnd, editor.state.schema.nodes.paragraph.create());
  }
  tr.setSelection(TextSelection.create(tr.doc, boxPos + 2));
  editor.view.dispatch(tr);
  editor.view.focus();
}

/* ------------------------------------------------------------------ */
/* 4. VLine — লম্বালম্বি ডিভাইডার লাইন (সলিড / ডটেড / ড্যাশড)           */
/*    ব্লক নোড বলে ফরম্যাট বক্সের ভেতরেও বসে।                           */
/* ------------------------------------------------------------------ */

export type VLineStyle = "solid" | "dotted" | "dashed";
export type VLineOrientation = "vertical" | "horizontal";
export type VLineThickness = "thin" | "medium" | "thick";
export type VLineColor = "primary" | "red" | "green" | "orange" | "purple";

export const VLINE_COLORS: Record<VLineColor, string> = {
  primary: "var(--primary)",
  red: "#ef4444",
  green: "#22c55e",
  orange: "#f97316",
  purple: "#a855f7",
};

export const VLine = Node.create({
  name: "vLine",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      lineStyle: {
        default: "solid",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-style") || "solid",
      },
      orientation: {
        default: "vertical",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-orientation") || "vertical",
      },
      thickness: {
        default: "medium",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-thickness") || "medium",
      },
      color: {
        default: "primary",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-color") || "primary",
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-vline]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      {
        "data-vline": "",
        "data-style": (HTMLAttributes.lineStyle as string) || "solid",
        "data-orientation":
          (HTMLAttributes.orientation as string) || "vertical",
        "data-thickness":
          (HTMLAttributes.thickness as string) || "medium",
        "data-color": (HTMLAttributes.color as string) || "primary",
      },
      ["span"],
    ];
  },

  addCommands() {
    return {
      insertVLine:
        (
          style: VLineStyle = "solid",
          orientation: VLineOrientation = "vertical",
          thickness: VLineThickness = "medium",
          color: VLineColor = "primary"
        ) =>
        ({ commands }: CommandProps) => {
          return commands.insertContent(
            `<div data-vline data-style="${style}" data-orientation="${orientation}" data-thickness="${thickness}" data-color="${color}"><span></span></div>`
          );
        },
    };
  },
});

/* ------------------------------------------------------------------ */
/* 3. BcsIcon — লেখার মাঝে ইনলাইন আইকন                                 */
/* ------------------------------------------------------------------ */

function BcsIconView({ node }: NodeViewProps) {
  const IconComp =
    FORMAT_ICONS[node.attrs.name as string] || FORMAT_ICONS.sparkles;
  return (
    <NodeViewWrapper as="span" className="bcs-ico" contentEditable={false}>
      <IconComp />
    </NodeViewWrapper>
  );
}

export const BcsIcon = Node.create({
  name: "bcsIcon",
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      name: {
        default: "sparkles",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-icon-inline") || "sparkles",
        renderHTML: (attributes: { name?: string }) => ({
          "data-icon-inline": attributes.name || "sparkles",
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-icon-inline]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    /* SVG-সহ সেভ হয় — রিডার/PDF-এ (NodeView ছাড়া) আইকন দেখা যায়।
     * NB: HTMLAttributes-এ নাম data-icon-inline কী-তে থাকে (attribute-এর
     * renderHTML থেকে), .name-এ নয় — তাই node.attrs থেকে নিই। */
    const name = (node.attrs.name as string) || "sparkles";
    return [
      "span",
      mergeAttributes({ class: "bcs-ico" }, HTMLAttributes),
      iconSvgSpec(name),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(BcsIconView);
  },

  addCommands() {
    return {
      insertIcon:
        (name: string) =>
        ({ commands }: CommandProps) =>
          commands.insertContent(
            `<span class="bcs-ico" data-icon-inline="${name}"></span>&nbsp;`
          ),
    };
  },
});

/* ------------------------------------------------------------------ */
/* Toolbar UI — Format menu + Icon palette                              */
/* ------------------------------------------------------------------ */

export function ToolButton({
  label,
  title,
  onClick,
  active,
  children,
  ref,
}: {
  label: string;
  title: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
  /** Radix PopoverTrigger (asChild) anchor হিসেবে ref চায় — React 19-এ ref prop হিসেবে আসে */
  ref?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      ref={ref}
      aria-label={label}
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-primary/12 hover:text-primary",
        active && "bg-primary/15 text-primary"
      )}
    >
      {children}
    </button>
  );
}

export function FormatMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ToolButton
          label="ফরম্যাট ব্লক"
          title="পরীক্ষার ফরম্যাট ব্লক বসান (সেকশন কার্ড, টাইমলাইন…)"
          onClick={() => setOpen(true)}
        >
          <LayoutTemplate className="h-3.5 w-3.5" />
        </ToolButton>
      </PopoverTrigger>
      <PopoverContent
        className="glass-strong max-h-[70vh] w-72 overflow-y-auto p-1.5"
        side="bottom"
        align="start"
      >
        <p className="px-2 pb-1 pt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          ফরম্যাট ব্লক
        </p>
        {FORMAT_ORDER.map((key) => {
          const tpl = FORMAT_TEMPLATES[key];
          const IconComp = tpl.icon ? FORMAT_ICONS[tpl.icon] : LayoutTemplate;
          return (
            <button
              key={key}
              type="button"
              onClick={() => {
                editor.chain().focus().insertFormatBox(key).run();
                afterFormatBoxInsert(editor);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
            >
              <span className="flex h-7 w-7 flex-none items-center justify-center rounded-md bg-primary/10 text-primary">
                <IconComp className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">
                  {tpl.label}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {tpl.hint}
                </span>
              </span>
            </button>
          );
        })}
        <p className="px-2 pb-0.5 pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          ব্লক বসানোর পর ভেতরের নমুনা লেখা মুছে নিজেরটা লিখুন। প্যারার শেষে
          Enter চাপলে ওই ফরম্যাটের নতুন আইটেম আসবে (যত খুশি); খালি লাইনে
          Enter চাপলে বক্স থেকে বেরিয়ে যাবেন। টাইমলাইনে সালটা বোল্ড রাখলেই
          ব্যাজ আকারে দেখাবে।
        </p>
      </PopoverContent>
    </Popover>
  );
}

export function IconPalette({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ToolButton
          label="আইকন প্যালেট"
          title="নোটে আইকন বসান"
          onClick={() => setOpen(true)}
        >
          <Shapes className="h-3.5 w-3.5" />
        </ToolButton>
      </PopoverTrigger>
      <PopoverContent
        className="glass-strong max-h-[70vh] w-80 overflow-y-auto p-2"
        side="bottom"
        align="start"
      >
        <p className="px-1 pb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          আইকন প্যালেট — ক্লিক করলেই কার্সরে বসবে
        </p>
        <div className="grid grid-cols-6 gap-1">
          {ICON_PALETTE.map(({ name, label }) => {
            const IconComp = FORMAT_ICONS[name];
            if (!IconComp) return null;
            return (
              <button
                key={name}
                type="button"
                title={label}
                aria-label={label}
                onClick={() => {
                  editor.chain().focus().insertIcon(name).run();
                }}
                className="flex aspect-square items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-primary/12 hover:text-primary"
              >
                <IconComp className="h-4 w-4" />
              </button>
            );
          })}
        </div>
        <p className="px-1 pb-0.5 pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
          বসানো আইকনে ক্লিক করে সিলেক্ট করা যায়; Delete চাপলে মুছে যাবে।
        </p>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* 5. BcsShape — ইনলাইন ছোট শেপ: নীল বৃত্ত + ৪ দিকের তীর (SVG)          */
/*    টেক্সটের মাঝে যেকোনো জায়গায় বসে।                                */
/* ------------------------------------------------------------------ */

export type BcsShapeKind =
  | "dot"
  | "arrow-right"
  | "arrow-down"
  | "arrow-left"
  | "arrow-up";

export const BcsShape = Node.create({
  name: "bcsShape",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      shape: {
        default: "dot" as BcsShapeKind,
        parseHTML: (element: HTMLElement) =>
          (element.getAttribute("data-bcs-shape") as BcsShapeKind) || "dot",
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-bcs-shape]" }];
  },

  /* SVG renderHTML-array দিয়ে বানালে document.createElement("svg") হয় —
   * ভুল namespace-এ, ব্রাউজারে রেন্ডার হয় না। তাই NodeView-এ innerHTML
   * (পার্সার namespace ঠিক রাখে)। */
  addNodeView() {
    return ({ node }) => {
      const shape = (node.attrs.shape as BcsShapeKind) || "dot";
      const wrap = document.createElement("span");
      if (shape === "dot") {
        wrap.setAttribute("data-bcs-shape", "dot");
        wrap.className = "bcs-shape-dot";
      } else {
        const dir = shape.replace("arrow-", "");
        wrap.setAttribute("data-bcs-shape", shape);
        wrap.className = `bcs-shape-arrow bcs-arrow-${dir}`;
        wrap.innerHTML =
          '<svg viewBox="0 0 24 12" width="24" height="12" fill="none" aria-hidden="true"><path d="M2 6 H20 M16 2 L21 6 L16 10" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      }
      return { dom: wrap };
    };
  },

  renderHTML({ HTMLAttributes }) {
    const shape = (HTMLAttributes.shape as BcsShapeKind) || "dot";
    if (shape === "dot") {
      return ["span", { "data-bcs-shape": "dot", class: "bcs-shape-dot" }];
    }
    const dir = shape.replace("arrow-", "");
    return [
      "span",
      {
        "data-bcs-shape": shape,
        class: `bcs-shape-arrow bcs-arrow-${dir}`,
      },
      [
        "svg",
        {
          /* viewBox বাদ: ProseMirror setAttribute-এ lower-case করে "viewbox"
           * বানায় (invalid); width/height থাকায় রেন্ডার একই থাকে। */
          width: "24",
          height: "12",
          fill: "none",
          "aria-hidden": "true",
        },
        [
          "path",
          {
            d: "M2 6 H20 M16 2 L21 6 L16 10",
            stroke: "currentColor",
            "stroke-width": "2.4",
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
          },
        ],
      ],
    ];
  },

  addCommands() {
    return {
      insertBcsShape:
        (shape: BcsShapeKind = "dot") =>
        ({ commands }: CommandProps) => {
          return commands.insertContent(
            `<span data-bcs-shape="${shape}"></span>`
          );
        },
    };
  },
});

/* ------------------------------------------------------------------ */
/* 6. ShapeMenu — লাইন (আড়াআড়ি/লম্বা, সলিড/ডটেড/ড্যাশড, thickness)    */
/*    + ইনলাইন শেপ (নীল বৃত্ত, ৪ দিকের তীর)                            */
/* ------------------------------------------------------------------ */

const SHAPE_DOT_ARROWS: Array<{ kind: BcsShapeKind; label: string }> = [
  { kind: "dot", label: "নীল বৃত্ত" },
  { kind: "arrow-right", label: "ডান তীর" },
  { kind: "arrow-down", label: "নিচের তীর" },
  { kind: "arrow-left", label: "বাম তীর" },
  { kind: "arrow-up", label: "উপরের তীর" },
];

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md px-2 py-1 text-[12px] transition-colors " +
        (active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

export function ShapeMenu({ editor }: { editor: Editor }) {
  const [open, setOpen] = useState(false);
  const [orientation, setOrientation] = useState<VLineOrientation>("horizontal");
  const [lineStyle, setLineStyle] = useState<VLineStyle>("solid");
  const [thickness, setThickness] = useState<VLineThickness>("medium");
  const [color, setColor] = useState<VLineColor>("primary");

  const px = thickness === "thin" ? 1 : thickness === "thick" ? 3 : 2;
  const colorCss = VLINE_COLORS[color];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ToolButton
          label="শেপ মেনু"
          title="লাইন ও শেপ বসান (আড়াআড়ি / লম্বা / বৃত্ত / তীর)"
          onClick={() => setOpen(true)}
        >
          <SeparatorVertical className="h-3.5 w-3.5" />
        </ToolButton>
      </PopoverTrigger>
      <PopoverContent
        className="glass-strong max-h-[70vh] w-72 overflow-y-auto p-3"
        side="bottom"
        align="start"
      >
        <p className="pb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          শেপ — লাইন
        </p>
        <div className="flex flex-wrap gap-1 pb-1.5">
          <SegButton active={orientation === "horizontal"} onClick={() => setOrientation("horizontal")}>
            আড়াআড়ি
          </SegButton>
          <SegButton active={orientation === "vertical"} onClick={() => setOrientation("vertical")}>
            লম্বা
          </SegButton>
        </div>
        <div className="flex flex-wrap gap-1 pb-1.5">
          <SegButton active={lineStyle === "solid"} onClick={() => setLineStyle("solid")}>
            সলিড
          </SegButton>
          <SegButton active={lineStyle === "dotted"} onClick={() => setLineStyle("dotted")}>
            ডটেড
          </SegButton>
          <SegButton active={lineStyle === "dashed"} onClick={() => setLineStyle("dashed")}>
            ড্যাশড
          </SegButton>
        </div>
        <div className="flex flex-wrap gap-1 pb-1.5">
          <SegButton active={thickness === "thin"} onClick={() => setThickness("thin")}>
            1px
          </SegButton>
          <SegButton active={thickness === "medium"} onClick={() => setThickness("medium")}>
            2px
          </SegButton>
          <SegButton active={thickness === "thick"} onClick={() => setThickness("thick")}>
            3px
          </SegButton>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pb-2">
          {(Object.keys(VLINE_COLORS) as VLineColor[]).map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              aria-label={`রং: ${c}`}
              onClick={() => setColor(c)}
              className={
                "flex h-7 w-7 items-center justify-center rounded-full transition-all " +
                (color === c ? "ring-2 ring-offset-2 ring-primary" : "hover:scale-110")
              }
            >
              <span
                style={{
                  display: "block",
                  width: 16,
                  height: 16,
                  borderRadius: 9999,
                  background: VLINE_COLORS[c],
                }}
              />
            </button>
          ))}
        </div>
        <div className="mb-2 flex h-14 items-center justify-center rounded-md bg-muted/60 px-4">
          {orientation === "vertical" ? (
            <span style={{ display: "block", width: 0, height: 40, borderLeft: `${px}px ${lineStyle} ${colorCss}` }} />
          ) : (
            <span style={{ display: "block", width: "100%", height: 0, borderTop: `${px}px ${lineStyle} ${colorCss}` }} />
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            editor.chain().focus().insertVLine(lineStyle, orientation, thickness, color).run();
            setOpen(false);
          }}
          className="mb-1 w-full rounded-md bg-primary py-1.5 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          লাইন বসান
        </button>
        <p className="px-1 pb-2 text-[10px] leading-relaxed text-muted-foreground">
          নোটের যেকোনো জায়গায়, ফরম্যাট বক্সের ভেতরেও বসে।
        </p>

        <p className="pb-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          শেপ — বৃত্ত ও তীর
        </p>
        <div className="flex flex-wrap gap-1 pb-1">
          {SHAPE_DOT_ARROWS.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              title={label}
              aria-label={label}
              onClick={() => {
                editor.chain().focus().insertBcsShape(kind).run();
              }}
              className="flex h-9 w-9 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/12"
            >
              {kind === "dot" ? (
                <span
                  style={{
                    display: "block",
                    width: 12,
                    height: 12,
                    borderRadius: 9999,
                    background: "var(--primary)",
                  }}
                />
              ) : (
                <svg
                  viewBox="0 0 24 12"
                  width="22"
                  height="11"
                  fill="none"
                  aria-hidden="true"
                  style={{
                    transform:
                      kind === "arrow-down"
                        ? "rotate(90deg)"
                        : kind === "arrow-up"
                          ? "rotate(-90deg)"
                          : kind === "arrow-left"
                            ? "rotate(180deg)"
                            : undefined,
                  }}
                >
                  <path
                    d="M2 6 H20 M16 2 L21 6 L16 10"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          ))}
        </div>
        <p className="px-1 pb-0.5 text-[10px] leading-relaxed text-muted-foreground">
          টেক্সটের মাঝে যেকোনো জায়গায় বসে; ক্লিকে সিলেক্ট, Delete-এ মুছে যায়।
        </p>
      </PopoverContent>
    </Popover>
  );
}
