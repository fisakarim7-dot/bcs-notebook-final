/* v46: পুরনো সেভ (v45-এর আগে) HTML-কে রিডার/PDF-উপযোগী করা।
 *
 * v45-এর আগে সেভ হওয়া নোটে:
 *  1. format box-এ .bcs-fmt-content wrapper নেই → ফরম্যাট CSS মরে যায়
 *  2. BcsIcon-এ <svg> নেই → আইকন অদৃশ্য
 *  3. textbox-এ .textbox-content wrapper নেই
 * এই normalizer দুটো কনটেক্সটে চলে:
 *  - normalizeReaderHtml: ব্রাউজার DOM দিয়ে (in-app reader)
 *  - normalizePrintHtml: string দিয়ে (server-side print route, DOM নেই)
 */

import { ICON_SVG_INNER } from "./icon-svg";

/** আইকনের static SVG string — reader/PDF-এ বসে। */
export function iconSvgHtml(name: string): string {
  const inner = ICON_SVG_INNER[name] || ICON_SVG_INNER["sparkles"];
  const innerHtml = inner
    .map(
      ([t, a]) =>
        `<${t}${Object.entries(a)
          .map(([k, v]) => ` ${k}="${v}"`)
          .join("")}></${t}>`
    )
    .join("");
  return (
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ` +
    `width="1.05em" height="1.05em" aria-hidden="true">${innerHtml}</svg>`
  );
}

/* ---------------- in-app reader (DOM) ---------------- */

export function normalizeReaderHtml(html: string): string {
  if (!html || typeof document === "undefined") return html;
  // ProseMirror সিরিয়ালাইজেশনে viewBox → viewbox (lowercase) হয়ে যায়;
  // পার্সার ঠিক করলেও validity-এর জন্য সোজা করে নিই
  const fixed = html.replace(/<svg([^<>]*?) viewbox=/g, "<svg$1 viewBox=");
  const tpl = document.createElement("template");
  tpl.innerHTML = fixed;
  const root = tpl.content;

  // 1. format boxes: .bcs-fmt-content wrapper
  root.querySelectorAll("div.bcs-fmt[data-format]").forEach((box) => {
    if (box.querySelector(":scope > .bcs-fmt-content")) return;
    const wrap = document.createElement("div");
    wrap.className = "bcs-fmt-content";
    Array.from(box.childNodes).forEach((n) => {
      if (n instanceof HTMLElement && n.classList.contains("bcs-fmt-icon"))
        return;
      wrap.appendChild(n);
    });
    box.appendChild(wrap);
  });

  // 2. textbox: .textbox-content wrapper
  root.querySelectorAll("div[data-textbox]").forEach((box) => {
    if (box.querySelector(":scope > .textbox-content")) return;
    const wrap = document.createElement("div");
    wrap.className = "textbox-content";
    Array.from(box.childNodes).forEach((n) => wrap.appendChild(n));
    box.appendChild(wrap);
  });

  // 3. icons: SVG না থাকলে বা ভুল থাকলে (v45-47 বাগে সব sparkles হয়েছিল)
  // সঠিক SVG বসাও — data-icon-inline-ই source of truth
  root.querySelectorAll("span.bcs-ico[data-icon-inline]").forEach((sp) => {
    const name = sp.getAttribute("data-icon-inline") || "sparkles";
    sp.innerHTML = iconSvgHtml(name);
  });

  const div = document.createElement("div");
  div.appendChild(root.cloneNode(true));
  return div.innerHTML;
}

/* ---------------- print route (string, no DOM) ---------------- */

/** <div MARKER ...> ... </div>-এর ভেতরে wrapper div বসাও (matching close খুঁজে)। */
function wrapInner(
  html: string,
  marker: string,
  wrapperClass: string
): string {
  let result = "";
  let i = 0;
  while (i < html.length) {
    const openIdx = html.indexOf("<div", i);
    if (openIdx === -1) {
      result += html.slice(i);
      break;
    }
    const tagEnd = html.indexOf(">", openIdx);
    if (tagEnd === -1) {
      result += html.slice(i);
      break;
    }
    const tag = html.slice(openIdx, tagEnd + 1);
    const afterOpen = html.slice(tagEnd + 1);
    if (
      !tag.includes(marker) ||
      afterOpen.startsWith(`<div class="${wrapperClass}">`)
    ) {
      result += html.slice(i, tagEnd + 1);
      i = tagEnd + 1;
      continue;
    }
    // matching </div> খুঁজি (nested div গুনে)
    let depth = 1;
    let j = tagEnd + 1;
    while (j < html.length && depth > 0) {
      const nextOpen = html.indexOf("<div", j);
      const nextClose = html.indexOf("</div>", j);
      if (nextClose === -1) break;
      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        j = nextOpen + 4;
      } else {
        depth--;
        j = nextClose + 6;
      }
    }
    const inner = html.slice(tagEnd + 1, j - 6);
    result +=
      html.slice(i, tagEnd + 1) +
      `<div class="${wrapperClass}">` +
      inner +
      `</div></div>`;
    i = j;
  }
  return result;
}

export function normalizePrintHtml(html: string): string {
  if (!html) return html;
  let out = html.replace(/<svg([^<>]*?) viewbox=/g, "<svg$1 viewBox=");
  // 1. icons: খালি span-এ বা ভুল SVG-তে (v45-47 বাগ) সঠিক SVG বসাও।
  //    data-icon-inline-ই source of truth — সবসময় overwrite করি।
  out = out.replace(
    /<span([^<>]*?)data-icon-inline="([a-z0-9-]+)"([^<>]*?)>(?:<svg[\s\S]*?<\/svg>)?<\/span>/g,
    (_m, pre: string, name: string, post: string) =>
      `<span${pre}data-icon-inline="${name}"${post}>${iconSvgHtml(name)}</span>`
  );
  // 2. format boxes: wrapper
  out = wrapInner(out, 'class="bcs-fmt"', "bcs-fmt-content");
  // 3. textbox: wrapper
  out = wrapInner(out, "data-textbox", "textbox-content");
  return out;
}
