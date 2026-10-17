/* v47: শেয়ার্ড ফরম্যাট CSS — print ও /view রুট দুটোতেই ব্যবহার হয়।
 * এডিটরের globals.css-এর .bcs-fmt/.bcs-ico/[data-vline]/.bcs-shape/[data-textbox]
 * রুলগুলোর print/view সংস্করণ (literal রং, .content স্কোপ)। */
export const FORMAT_STATIC_CSS = `
/* ---- BCS formats (print): mirrors the editor/reader .bcs-fmt CSS ---- */
.content .bcs-fmt-content>:first-child{margin-top:0}
.content .bcs-fmt-content>:last-child{margin-bottom:0}
.content .bcs-fmt[data-format="section-card"],.content .bcs-fmt[data-format="key-point"],.content .bcs-fmt[data-format="outline-card"]{border:1px solid #d6d3cb;border-radius:10px;padding:.7rem .9rem;background:#faf9f7}
.content .bcs-fmt[data-format="section-card"] .bcs-fmt-content>:first-child,.content .bcs-fmt[data-format="key-point"] .bcs-fmt-content>:first-child,.content .bcs-fmt[data-format="example"] .bcs-fmt-content>:first-child{font-weight:700}
.content .bcs-fmt[data-format="key-point"] .bcs-fmt-content>:last-child{font-size:.82em;color:#6b7280;border-top:1px dashed #d6d3cb;padding-top:.4em;margin-top:.5em}
.content .bcs-fmt[data-format="icon-list"] .bcs-fmt-content>*+*,.content .bcs-fmt[data-format="check-list"] .bcs-fmt-content>*+*,.content .bcs-fmt[data-format="outline-card"] .bcs-fmt-content>*+*{border-top:1px solid #d6d3cb;padding-top:.55em;margin-top:.55em}
.content .bcs-fmt[data-format="example"]{border-left:3px solid #0f766e;padding-left:.85rem}
.content .bcs-fmt[data-format="check-list"] .bcs-fmt-content>*{position:relative;padding-left:1.7em}
.content .bcs-fmt[data-format="check-list"] .bcs-fmt-content>*::before{content:"✓";position:absolute;left:0;top:.15em;width:1.25em;height:1.25em;border-radius:9999px;background:#16a34a;color:#fff;font-size:.8em;font-weight:700;display:inline-flex;align-items:center;justify-content:center;line-height:1}
.content .bcs-fmt[data-format="flowchart"] .bcs-fmt-content>*{position:relative;border:1px solid #d6d3cb;border-radius:10px;padding:.55em .8em;text-align:center;margin:0 0 1.9em}
.content .bcs-fmt[data-format="flowchart"] .bcs-fmt-content>*:not(:last-child)::after{content:"";position:absolute;left:50%;bottom:-1.45em;transform:translateX(-50%);width:3px;height:1.05em;background:#0f766e;border-radius:2px}
.content .bcs-fmt[data-format="flowchart"] .bcs-fmt-content>*:not(:last-child)::before{content:"";position:absolute;left:50%;bottom:-1.45em;transform:translateX(-50%) translateY(100%);width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-top:11px solid #0f766e}
.content .bcs-fmt[data-format="flowchart"] .bcs-fmt-content>:last-child{margin-bottom:0;background:#f0fdfa;border-color:#5eead4}
.content .bcs-fmt[data-format="outline-card"] .bcs-fmt-content{counter-reset:bcsbn}
.content .bcs-fmt[data-format="outline-card"] .bcs-fmt-content>p:has(>strong:first-child){counter-increment:bcsbn;position:relative;padding-left:2em}
.content .bcs-fmt[data-format="outline-card"] .bcs-fmt-content>p:has(>strong:first-child)::before{content:counter(bcsbn,bengali);position:absolute;left:0;top:.1em;font-weight:700;color:#0f766e}
.content .bcs-fmt[data-format="timeline"] .bcs-fmt-content>*{position:relative;margin-left:.3em;padding-left:1em;border-left:2px solid #d6d3cb}
.content .bcs-fmt[data-format="timeline"] .bcs-fmt-content>p:has(strong)::before,.content .bcs-fmt[data-format="timeline"] .bcs-fmt-content>p:nth-child(odd)::before{content:"";position:absolute;left:-5px;top:.55em;width:9px;height:9px;border-radius:9999px;background:#0f766e}
.content .bcs-fmt[data-format="timeline"] .bcs-fmt-content>*>strong:first-child{display:inline-block;background:#0d9488;color:#fff;border-radius:6px;padding:.05em .5em;margin-right:.4em;font-size:.92em}
.content .bcs-fmt[data-format="note-header"]{border-bottom:3px solid #0d9488;padding-bottom:.45em}
.content .bcs-fmt[data-format="note-header"] .bcs-fmt-content>:first-child{font-size:1.22em;font-weight:700;line-height:1.4}
.content .bcs-fmt[data-format="note-header"] .bcs-fmt-content>:last-child{font-size:.85em;color:#6b7280}
/* inline icon */
.content .bcs-ico{display:inline-flex;vertical-align:-.18em;color:#0f766e}
.content .bcs-ico svg{width:1.05em;height:1.05em}
/* divider lines */
.content div[data-vline]{display:flex;justify-content:center;padding:.5em 0}
.content div[data-vline]>span{display:block;width:0;height:45px;border-left:2px solid #0f766e}
.content div[data-vline][data-thickness="thin"]>span{border-left-width:1px}
.content div[data-vline][data-thickness="thick"]>span{border-left-width:3px}
.content div[data-vline][data-style="dotted"]>span{border-left-style:dotted}
.content div[data-vline][data-style="dashed"]>span{border-left-style:dashed}
.content div[data-vline][data-color="red"]>span{border-left-color:#ef4444}
.content div[data-vline][data-color="green"]>span{border-left-color:#22c55e}
.content div[data-vline][data-color="orange"]>span{border-left-color:#f97316}
.content div[data-vline][data-color="purple"]>span{border-left-color:#a855f7}
.content div[data-vline][data-orientation="horizontal"]>span{width:100%;height:0;border-left-width:0;border-top:2px solid #0f766e}
.content div[data-vline][data-orientation="horizontal"][data-thickness="thin"]>span{border-top-width:1px}
.content div[data-vline][data-orientation="horizontal"][data-thickness="thick"]>span{border-top-width:3px}
.content div[data-vline][data-orientation="horizontal"][data-style="dotted"]>span{border-top-style:dotted}
.content div[data-vline][data-orientation="horizontal"][data-style="dashed"]>span{border-top-style:dashed}
.content div[data-vline][data-orientation="horizontal"][data-color="red"]>span{border-top-color:#ef4444}
.content div[data-vline][data-orientation="horizontal"][data-color="green"]>span{border-top-color:#22c55e}
.content div[data-vline][data-orientation="horizontal"][data-color="orange"]>span{border-top-color:#f97316}
.content div[data-vline][data-orientation="horizontal"][data-color="purple"]>span{border-top-color:#a855f7}
/* inline shapes */
.content .bcs-shape-dot{display:inline-block;width:.55em;height:.55em;border-radius:9999px;background:#2563eb;vertical-align:baseline}
.content .bcs-shape-arrow{display:inline-flex;vertical-align:-.12em;color:#2563eb}
.content .bcs-shape-arrow svg{width:1.35em;height:.68em}
.content .bcs-arrow-down svg{transform:rotate(90deg)}
.content .bcs-arrow-left svg{transform:rotate(180deg)}
.content .bcs-arrow-up svg{transform:rotate(270deg)}
/* text box */
.content div[data-textbox]{border:1.5px solid #d6d3cb;border-radius:10px;padding:14px 16px;margin:.8em 0;background:#fff}
.content div[data-textbox][data-border="dashed"]{border-style:dashed}
.content div[data-textbox][data-border="none"]{border-color:transparent}
.content div[data-textbox][data-bg="slate"]{background:#f1f5f9}
.content div[data-textbox][data-bg="blue"]{background:#eff6ff}
.content div[data-textbox][data-bg="amber"]{background:#fffbeb}
.content div[data-textbox][data-bg="green"]{background:#f0fdf4}
.content div[data-textbox]>.textbox-content>:first-child{margin-top:0}
.content div[data-textbox]>.textbox-content>:last-child{margin-bottom:0}
/* border box (inline style already carries border; keep radius/padding) */
.content div[data-border-box]{border-radius:8px}
`;
