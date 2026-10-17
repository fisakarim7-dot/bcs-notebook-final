"use client";

/* ─── v44: MS Word-style text box ───
 * ফ্লো টেক্সট বক্স: কার্সর অবস্থানে বসে, ভেতরে সব ফরম্যাটিং চলে।
 * - কোণার হ্যান্ডেল টেনে চওড়া (30–100%)
 * - গ্রিপ ধরে ড্র্যাগ করে প্যারাগ্রাফের মাঝে ওঠানো-নামানো
 * - হোভার বারে ব্যাকগ্রাউন্ড + বর্ডার স্টাইল
 */

import { Node } from "@tiptap/core";
import { TextSelection } from "prosemirror-state";

export type TextBoxBg = "none" | "slate" | "blue" | "amber" | "green";
export type TextBoxBorder = "solid" | "dashed" | "none";

export const TEXTBOX_BGS: Record<TextBoxBg, string> = {
  none: "transparent",
  slate: "#64748b",
  blue: "#3b82f6",
  amber: "#f59e0b",
  green: "#22c55e",
};

const GRIP_SVG =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>';

const RESIZE_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M4 20 L20 4"/><path d="M14 4 h6 v6"/><path d="M4 14 v6 h6"/></svg>';

const BORDER_LABEL: Record<TextBoxBorder, string> = {
  solid: "━━",
  dashed: "┄┄",
  none: "∅",
};
const BORDER_TITLE: Record<TextBoxBorder, string> = {
  solid: "সলিড বর্ডার",
  dashed: "ড্যাশড বর্ডার",
  none: "বর্ডার ছাড়া",
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    textBox: {
      insertTextBox: () => ReturnType;
    };
  }
}

export const TextBox = Node.create({
  name: "textBox",
  group: "block",
  content: "block+",
  defining: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      width: {
        default: 100,
        parseHTML: (element: HTMLElement) =>
          parseInt(element.getAttribute("data-width") || "100", 10) || 100,
      },
      bg: {
        default: "none",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-bg") || "none",
      },
      border: {
        default: "solid",
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-border") || "solid",
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-textbox]" }];
  },

  renderHTML({ HTMLAttributes }) {
    const width = Math.max(
      30,
      Math.min(100, Number(HTMLAttributes.width) || 100)
    );
    const bg = (HTMLAttributes.bg as string) || "none";
    const border = (HTMLAttributes.border as string) || "solid";
    return [
      "div",
      {
        "data-textbox": "",
        "data-width": String(width),
        "data-bg": bg,
        "data-border": border,
        style: `width: ${width}%;${width < 100 ? " margin-inline: auto;" : ""}`,
      },
      /* রিডার CSS (.textbox-content > :first-child) parity-এর জন্য wrapper */
      ["div", { class: "textbox-content" }, 0],
    ];
  },

  addNodeView() {
    return ({ node, getPos, editor }) => {
      let cur = node;

      const wrap = document.createElement("div");
      wrap.setAttribute("data-textbox", "");

      const apply = () => {
        const w = Math.max(
          30,
          Math.min(100, Number(cur.attrs.width) || 100)
        );
        wrap.setAttribute("data-width", String(w));
        wrap.setAttribute("data-bg", String(cur.attrs.bg || "none"));
        wrap.setAttribute("data-border", String(cur.attrs.border || "solid"));
        wrap.style.width = `${w}%`;
        wrap.style.marginInline = w < 100 ? "auto" : "";
      };
      apply();

      const setAttr = (patch: Record<string, unknown>) => {
        const pos = getPos();
        if (typeof pos !== "number") return;
        editor.view.dispatch(
          editor.view.state.tr.setNodeMarkup(pos, undefined, {
            ...cur.attrs,
            ...patch,
          })
        );
        if (!editor.view.hasFocus()) editor.view.focus();
      };

      /* ——— hover toolbar: grip + bg + border ——— */
      const bar = document.createElement("div");
      bar.className = "textbox-bar";
      bar.setAttribute("contenteditable", "false");

      const grip = document.createElement("span");
      grip.className = "textbox-grip";
      grip.setAttribute("draggable", "true");
      grip.title = "টেনে সরান";
      grip.innerHTML = GRIP_SVG;
      bar.appendChild(grip);

      const sep1 = document.createElement("span");
      sep1.className = "textbox-sep";
      bar.appendChild(sep1);

      (Object.keys(TEXTBOX_BGS) as TextBoxBg[]).forEach((b) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "textbox-dotbtn";
        btn.title =
          b === "none" ? "ব্যাকগ্রাউন্ড ছাড়া" : "ব্যাকগ্রাউন্ড রং";
        btn.setAttribute("aria-label", btn.title);
        const dot = document.createElement("span");
        dot.style.background = TEXTBOX_BGS[b];
        if (b === "none") dot.style.borderStyle = "dashed";
        if (cur.attrs.bg === b) btn.classList.add("is-active");
        btn.appendChild(dot);
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.addEventListener("click", () => {
          setAttr({ bg: b });
          bar
            .querySelectorAll(".textbox-dotbtn")
            .forEach((el) => el.classList.remove("is-active"));
          btn.classList.add("is-active");
        });
        bar.appendChild(btn);
      });

      const sep2 = document.createElement("span");
      sep2.className = "textbox-sep";
      bar.appendChild(sep2);

      (Object.keys(BORDER_LABEL) as TextBoxBorder[]).forEach((b) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "textbox-bbtn";
        btn.title = BORDER_TITLE[b];
        btn.setAttribute("aria-label", BORDER_TITLE[b]);
        btn.textContent = BORDER_LABEL[b];
        if (cur.attrs.border === b) btn.classList.add("is-active");
        btn.addEventListener("mousedown", (e) => e.preventDefault());
        btn.addEventListener("click", () => {
          setAttr({ border: b });
          bar
            .querySelectorAll(".textbox-bbtn")
            .forEach((el) => el.classList.remove("is-active"));
          btn.classList.add("is-active");
        });
        bar.appendChild(btn);
      });

      /* ——— editable content ——— */
      const content = document.createElement("div");
      content.className = "textbox-content";

      /* ——— resize handle ——— */
      const rz = document.createElement("div");
      rz.className = "textbox-resize";
      rz.setAttribute("contenteditable", "false");
      rz.title = "টেনে চওড়া বদলান";
      rz.innerHTML = RESIZE_SVG;
      rz.addEventListener("mousedown", (e) => e.preventDefault());
      rz.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startW = Number(cur.attrs.width) || 100;
        const edW =
          (editor.view.dom as HTMLElement).clientWidth || 600;
        const onMove = (ev: PointerEvent) => {
          const w = Math.max(
            30,
            Math.min(
              100,
              Math.round(startW + ((ev.clientX - startX) / edW) * 100)
            )
          );
          const pos = getPos();
          if (typeof pos === "number") {
            editor.view.dispatch(
              editor.view.state.tr.setNodeMarkup(pos, undefined, {
                ...cur.attrs,
                width: w,
              })
            );
          }
        };
        const onUp = () => {
          window.removeEventListener("pointermove", onMove);
          window.removeEventListener("pointerup", onUp);
        };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
      });

      wrap.appendChild(bar);
      wrap.appendChild(content);
      wrap.appendChild(rz);

      return {
        dom: wrap,
        contentDOM: content,
        update: (updated) => {
          if (updated.type.name !== "textBox") return false;
          cur = updated;
          apply();
          return true;
        },
      };
    };
  },

  addCommands() {
    return {
      insertTextBox:
        () =>
        ({ commands }) => {
          const ok = commands.insertContent({
            type: "textBox",
            attrs: { width: 100, bg: "none", border: "solid" },
            content: [{ type: "paragraph" }],
          });
          if (!ok) return false;
          /* কার্সর বক্সের ভেতরে */
          const { state } = this.editor;
          const $from = state.selection.$from;
          const before = $from.nodeBefore;
          if (before && before.type.name === "textBox") {
            const tr = state.tr.setSelection(
              TextSelection.create(
                state.doc,
                $from.pos - before.nodeSize + 2
              )
            );
            this.editor.view.dispatch(tr);
          }
          return true;
        },
    };
  },
});
