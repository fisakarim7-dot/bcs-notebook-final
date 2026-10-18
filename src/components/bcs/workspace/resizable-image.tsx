"use client";

import Image from "@tiptap/extension-image";
import { NodeSelection } from "@tiptap/pm/state";

const MIN_WIDTH_PX = 48;

/**
 * Image node with drag-to-resize corner handles.
 * The chosen size is stored as a PERCENT of the editor width (e.g. "37.5%"),
 * so it stays responsive, survives print/PDF export and never overflows.
 * The original note HTML is untouched otherwise — width is just an attribute
 * on the <img> tag (data-width + inline style).
 */
export const ResizableImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: null as string | null,
        parseHTML: (element: HTMLElement) =>
          element.getAttribute("data-width") || element.style.width || null,
        renderHTML: (attributes: { width?: string | null }) => {
          if (!attributes.width) return {};
          return {
            "data-width": attributes.width,
            style: `width: ${attributes.width}`,
          };
        },
      },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const wrap = document.createElement("div");
      wrap.className = "res-img-wrap";

      const img = document.createElement("img");
      img.setAttribute("loading", "lazy");
      img.draggable = false;
      wrap.appendChild(img);

      const handles: HTMLSpanElement[] = [];
      const corners: Array<{ dir: "nw" | "ne" | "sw" | "se"; cls: string }> = [
        { dir: "nw", cls: "res-h-nw" },
        { dir: "ne", cls: "res-h-ne" },
        { dir: "sw", cls: "res-h-sw" },
        { dir: "se", cls: "res-h-se" },
      ];
      for (const c of corners) {
        const h = document.createElement("span");
        h.className = `res-h ${c.cls}`;
        h.dataset.dir = c.dir;
        h.setAttribute("role", "slider");
        h.setAttribute("aria-label", "ছবির আকার পরিবর্তন");
        h.setAttribute("title", "টেনে ছবির আকার বদলান");
        wrap.appendChild(h);
        handles.push(h);
      }

      const applyFromNode = () => {
        const width = node.attrs.width as string | null;
        img.src = (node.attrs.src as string) || "";
        img.alt = (node.attrs.alt as string) || "";
        img.title = (node.attrs.title as string) || "";
        if (width) {
          img.style.width = width;
        } else {
          img.style.removeProperty("width");
        }
        const align = ((node.attrs.textAlign as string) || "left").toLowerCase();
        img.style.display = "block";
        if (align === "center") {
          img.style.marginInline = "auto";
        } else if (align === "right") {
          img.style.marginInline = "auto 0";
        } else {
          img.style.marginInline = "0";
        }
      };
      applyFromNode();

      const stopDrag = (ev: Event) => {
        ev.preventDefault();
        ev.stopPropagation();
      };

      handles.forEach((h) => {
        h.addEventListener("pointerdown", (ev) => {
          ev.preventDefault();
          ev.stopPropagation(); // ProseMirror must not see this as a node drag
          if (typeof getPos() !== "number") return;

          const dir = h.dataset.dir as "nw" | "ne" | "sw" | "se";
          const startX = ev.clientX;
          const startW = img.getBoundingClientRect().width;
          const contentW = Math.max(editor.view.dom.clientWidth, 200);
          const maxW = Math.max(MIN_WIDTH_PX, contentW - 8);
          wrap.classList.add("resizing");

          const onMove = (e: PointerEvent) => {
            e.preventDefault();
            const dx = e.clientX - startX;
            const signed = dir === "ne" || dir === "se" ? dx : -dx;
            const w = Math.min(maxW, Math.max(MIN_WIDTH_PX, startW + signed));
            img.style.width = `${Math.round(w)}px`;
            wrap.style.width = `${Math.round(w)}px`;
          };
          const onUp = (e: PointerEvent) => {
            window.removeEventListener("pointermove", onMove);
            window.removeEventListener("pointerup", onUp);
            window.removeEventListener("pointercancel", onUp);
            stopDrag(e);

            wrap.classList.remove("resizing");
            wrap.style.removeProperty("width");
            const finalW = img.getBoundingClientRect().width;
            const pct = Math.min(
              100,
              Math.max(2, Math.round((finalW / contentW) * 1000) / 10)
            );
            const width = `${pct}%`;
            const pos = getPos();
            if (typeof pos !== "number") return;
            const { state, dispatch } = editor.view;
            dispatch(
              state.tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                width,
              })
            );
          };
          window.addEventListener("pointermove", onMove);
          window.addEventListener("pointerup", onUp);
          window.addEventListener("pointercancel", onUp);
        });
        // a second click on the handle should never select/drag the node
        h.addEventListener("mousedown", stopDrag);
        h.addEventListener("dblclick", (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          const pos = getPos();
          if (typeof pos !== "number") return;
          const { state, dispatch } = editor.view;
          dispatch(
            state.tr.setNodeMarkup(pos, undefined, {
              ...node.attrs,
              width: null,
            })
          );
        });
      });

      // clicking the image selects the node (so align/delete buttons act on it)
      img.addEventListener("mousedown", () => {
        const pos = getPos();
        if (typeof pos !== "number" || editor.isDestroyed) return;
        const { state, dispatch } = editor.view;
        const next = NodeSelection.create(state.doc, pos);
        if (!state.selection.eq(next)) {
          dispatch(state.tr.setSelection(next));
        }
      });

      return {
        dom: wrap,
        update: (updated) => {
          if (updated.type.name !== "image") return false;
          if (updated.type !== node.type) return false;
          node = updated;
          applyFromNode();
          return true;
        },
        ignoreMutation: () => true,
      };
    };
  },
});
