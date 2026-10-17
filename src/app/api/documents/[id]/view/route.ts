import { db } from "@/lib/db";
import * as storage from "@/lib/storage";
import mammoth from "mammoth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 123 -> ১২৩ */
function toBn(n: number | string): string {
  const digits = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
  return String(n).replace(/[0-9]/g, (d) => digits[Number(d)]);
}

const FONT_FACE = `@font-face{font-family:'Kalpurush';src:url('/fonts/kalpurush.ttf') format('truetype');font-display:swap;}`;

const READER_CSS = `
${FONT_FACE}
*{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Kalpurush',sans-serif;background:#f4f3ef;color:#1f2937;display:flex;flex-direction:column;min-height:100dvh;overflow:hidden}
.topbar{position:sticky;top:0;flex:0 0 auto;width:100%;min-height:56px;height:auto;background:#ffffff;border-bottom:1px solid #e2e0da;display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;row-gap:6px;padding:8px 14px;z-index:50;box-shadow:0 1px 6px rgba(0,0,0,.05)}
.back{color:#0f766e;text-decoration:none;font-weight:600;font-size:14px;white-space:nowrap;padding:8px 10px;border-radius:8px}
.back:hover{background:#e6f4f1}
.title-wrap{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;min-width:0}
.doc-name{font-weight:700;font-size:15px;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:52vw}
.badge{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;background:#fef3c7;color:#92400e;border-radius:999px;padding:2px 10px;white-space:nowrap}
.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-left:auto}
.chip{font-size:12px;color:#57534e;background:#f1efe9;border:1px solid #e2e0da;border-radius:999px;padding:4px 10px}
.btn{display:inline-flex;align-items:center;gap:6px;background:#0f766e;color:#fff;text-decoration:none;font-size:13px;font-weight:600;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;font-family:inherit}
.btn:hover{background:#0d5f59}
.btn.secondary{background:#f1efe9;color:#1f2937;border:1px solid #e2e0da}
.btn.secondary:hover{background:#e7e4dc}
.btn.done{background:#15803d;animation:pop .45s ease}
@keyframes pop{0%{transform:scale(1)}40%{transform:scale(1.1)}100%{transform:scale(1)}}
.viewer{flex:1 1 auto;min-height:0;margin-top:0;width:100%;overflow:auto}
.viewer.frame{border:none;width:100%;display:block;flex:1 1 auto;min-height:0}
.viewer.imgfull{display:flex;align-items:center;justify-content:center;padding:18px;background:#e9e7e1}
.imgview{max-width:100%;max-height:calc(100vh - 92px);object-fit:contain;border-radius:10px;box-shadow:0 6px 28px rgba(0,0,0,.16);background:#fff}
.txt{white-space:pre-wrap;word-break:break-word;max-width:900px;margin:0 auto;padding:28px 24px;font-family:'Kalpurush',system-ui,sans-serif;font-size:16px;line-height:1.9;background:transparent}
.notice{max-width:900px;margin:48px auto;padding:24px;background:#fff;border:1px solid #e2e0da;border-radius:12px;text-align:center;color:#57534e;line-height:1.9}
/* ---------- উপরের বার লুকানো/দেখানো (collapsible) ---------- */
.bar-collapse{flex:0 0 auto}
body.bar-hidden .topbar{display:none}
.bar-fab{position:fixed;top:8px;right:8px;z-index:60;display:none;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.55);background:rgba(15,118,110,.88);color:#fff;font-size:18px;line-height:1;cursor:pointer;align-items:center;justify-content:center;padding:0;box-shadow:0 2px 10px rgba(0,0,0,.35);-webkit-tap-highlight-color:transparent}
.bar-fab:hover{background:rgba(13,95,89,.95)}
body.bar-hidden .bar-fab{display:inline-flex}
/* ---------- annotated PDF viewer (pdf.js) ---------- */
.pdfctl{display:flex;align-items:center;gap:6px}
.ibtn{min-width:30px;height:30px;border-radius:8px;border:1px solid #e2e0da;background:#f1efe9;color:#1f2937;font-size:15px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0 7px;font-family:inherit}
.ibtn:hover{background:#e7e4dc}
.zoomval{font-size:12px;color:#57534e;min-width:44px;text-align:center;font-variant-numeric:tabular-nums}
#pdfwrap{flex:1 1 auto;min-height:0;margin-top:0;height:auto;overflow:auto;background:#525659;-webkit-overflow-scrolling:touch}
#pdfwrap.native{display:none}
#pdfwrap.plain .ann-overlays{display:none}
/* জুমে পেজ স্ক্রিনের চেয়ে চওড়া হলে align-items:center বাম দিক স্ক্রলের বাইরে কেটে ফেলত।
   এখন flex-start + margin auto: জায়গা থাকলে মাঝখানে, না থাকলে বাম থেকে শুরু হয়ে ডানে স্ক্রল হয়। */
#pdfpages{display:flex;flex-direction:column;align-items:flex-start;gap:14px;padding:16px 0 40px;min-width:0}
.pdfpage{position:relative;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.35);overflow:hidden;flex:0 0 auto;margin-left:auto;margin-right:auto}
.pdfpage canvas{display:block}
.pdfpage-err{padding:40px 24px;color:#fecaca;font-family:'Kalpurush',sans-serif;font-size:14px}
.pdfload-err{max-width:520px;margin:80px auto;padding:26px;background:#fff;border-radius:12px;text-align:center;color:#57534e;font-family:'Kalpurush',sans-serif;line-height:1.9;box-shadow:0 6px 24px rgba(0,0,0,.25)}
.bcs-loadbtn{margin-top:6px;border:none;background:#0f766e;color:#fff;border-radius:8px;padding:9px 16px;font-family:inherit;font-weight:700;cursor:pointer;font-size:13.5px}
.ann-overlays{position:absolute;inset:0;pointer-events:none}
.pdf-ann-ov{position:absolute;pointer-events:none;border-radius:2px;mix-blend-mode:multiply}.pdf-ann-ov.ul{mix-blend-mode:normal}
.textLayer{--min-font-size:1;--text-scale-factor:calc(var(--total-scale-factor) * var(--min-font-size));--min-font-size-inv:calc(1 / var(--min-font-size));position:absolute;inset:0;overflow:clip;line-height:1;letter-spacing:normal;word-spacing:normal;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0;z-index:3}
.textLayer span,.textLayer br{color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0 0;user-select:text;-webkit-user-select:text}
.textLayer .markedContent{display:contents}
.textLayer > :not(.markedContent),.textLayer .markedContent span:not(.markedContent){z-index:1;--font-height:0;font-size:calc(var(--text-scale-factor) * var(--font-height));--scale-x:1;--rotate:0deg;transform:rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv))}
.textLayer ::selection{background:transparent;color:transparent}.sel-overlays{position:absolute;inset:0;pointer-events:none}.pdf-sel-ghost{position:absolute;border-radius:2px;mix-blend-mode:multiply;background:#fde68a}.bcs-ann-tb{flex-wrap:wrap;max-width:94vw}
@media (max-width:720px){
.topbar{padding:8px 10px;gap:6px 8px}
.back{font-size:13px;padding:6px 8px}
.title-wrap{order:3;flex:1 1 100%;justify-content:flex-start}
.doc-name{max-width:100%;font-size:13px}
.actions{order:2;margin-left:auto;gap:6px}
.btn{padding:7px 10px;font-size:12px}
.ibtn{min-width:30px;height:30px}
#pdfpages{padding:8px 0 32px;gap:10px}
}
`;

const INNER_CSS = `
@font-face{font-family:'Kalpurush';src:url('/fonts/kalpurush.ttf') format('truetype');font-display:swap;}
body{font-family:'Kalpurush',system-ui,-apple-system,sans-serif;max-width:900px;margin:0 auto;padding:28px 24px;line-height:1.9;font-size:16px;color:#1f2937;background:#ffffff;}
img{max-width:100%;height:auto;border-radius:4px}
table{border-collapse:collapse;width:100%;margin:14px 0}
th,td{border:1px solid #d6d3cb;padding:6px 10px;text-align:left}
th{background:#f1efe9}
h1,h2,h3,h4{line-height:1.45;margin:1.2em 0 .5em}
a{color:#0f766e}
blockquote{border-left:4px solid #0f766e;margin:1em 0;padding:.2em 1em;color:#57534e;background:#f8f7f4}
pre,code{background:#f1efe9;border-radius:6px;padding:2px 6px;font-size:.92em}
.bcs-ann{box-decoration-break:clone;-webkit-box-decoration-break:clone}
`;

function errorPage(status: number, title: string, message: string): Response {
  const html = `<!DOCTYPE html>
<html lang="bn"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${READER_CSS}</style></head>
<body><div class="notice"><h2 style="margin:0 0 8px">${esc(title)}</h2><p style="margin:0">${esc(message)}</p><p style="margin:16px 0 0"><a class="btn secondary" href="/">← মূল অ্যাপে ফিরুন</a></p></div></body></html>`;
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

// GET /api/documents/[id]/view — standalone annotated reader page (open in new tab)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const startPlain = new URL(request.url).searchParams.get("plain") === "1";
    const doc = await db.document.findUnique({ where: { id } });
    if (!doc) {
      return errorPage(404, "ডকুমেন্ট পাওয়া যায়নি", "অনুরোধ করা ডকুমেন্টটি খুঁজে পাওয়া যায়নি — হয়তো এটি মুছে ফেলা হয়েছে।");
    }

    let bodyHtml = "";

    const isPdf = doc.ext === "pdf";
    const isImage = ["png", "jpg", "jpeg", "webp", "gif"].includes(
      doc.ext.toLowerCase()
    );

    if (isPdf) {
      bodyHtml = `
<div id="pdfwrap">
  <div id="pdfpages"></div>
</div>
<script src="/annotator.js"><\/script>
<script src="/pdf-reader.js"><\/script>
<script type="module">
import * as pdfjsLib from '/pdfjs/pdf.min.mjs';
window.BCSPdfLib = pdfjsLib;
BCSPdfReader.start({
  docId: '${esc(id)}',
  fileUrl: '/api/documents/${esc(id)}/file',
  plain: ${startPlain ? "true" : "false"},
  statusEl: document.getElementById('ann-status')
});
<\/script>`;
    } else if (doc.ext === "docx" || doc.ext === "html") {
      let inner = "";
      const docBuf = await storage.readFile(doc.path);
      if (doc.ext === "docx") {
        try {
          const result = await mammoth.convertToHtml({ buffer: docBuf ?? Buffer.alloc(0) }, { convertImage: undefined });
          inner = result.value;
        } catch {
          bodyHtml = `<div class="viewer"><div class="notice">এই DOCX ফাইলটি রূপান্তর করা সম্ভব হয়নি। ডাউনলোড করে Word-এ খুলুন।</div></div>`;
          inner = "";
        }
      } else {
        inner = docBuf ? docBuf.toString("utf-8") : "";
      }
      if (inner) {
        const srcDoc = `<style>${INNER_CSS}</style>${inner}`;
        bodyHtml = `<iframe class="viewer frame" id="docframe" sandbox="allow-same-origin" srcdoc="${esc(srcDoc)}" title="${esc(doc.name)}"></iframe>
<script src="/annotator.js"><\/script>
<script>
(function(){
  var frame = document.getElementById('docframe');
  function boot(){
    try{
      var d = frame.contentDocument;
      if(!d || !d.body){ setTimeout(boot, 120); return; }
      BCSAnnotator.attach({
        doc: d,
        root: d.body,
        kind: 'document',
        targetId: '${esc(id)}',
        hostDoc: document,
        frameEl: frame,
        statusEl: document.getElementById('ann-status'),
        styleMarks: true
      });
    }catch(e){ console.error('annotator boot failed', e); }
  }
  if(frame.contentDocument && frame.contentDocument.readyState === 'complete') setTimeout(boot, 60);
  else frame.addEventListener('load', function(){ setTimeout(boot, 60); });
})();
<\/script>`;
      }
    } else if (doc.ext === "txt") {
      const tbuf = await storage.readFile(doc.path);
      const raw = tbuf ? tbuf.toString("utf-8") : "";
      bodyHtml = `<div class="viewer"><pre class="txt" id="txtroot">${esc(raw)}</pre></div>
<script src="/annotator.js"><\/script>
<script>
BCSAnnotator.attach({
  doc: document,
  root: document.getElementById('txtroot'),
  kind: 'document',
  targetId: '${esc(id)}',
  hostDoc: document,
  statusEl: document.getElementById('ann-status'),
  styleMarks: true
});
<\/script>`;
    } else if (isImage) {
      bodyHtml = `<div class="viewer imgfull"><img class="imgview" src="/api/documents/${esc(id)}/file" alt="${esc(doc.name)}"></div>`;
    } else {
      bodyHtml = `<div class="viewer"><div class="notice">এই ফরম্যাটের (<b>${esc(doc.ext)}</b>) ফাইল ব্রাউজারে দেখানো সমর্থিত নয়। ডাউনলোড বোতামে ক্লিক করে ফাইলটি নামিয়ে নিন।</div></div>`;
    }

    const pdfCtl = isPdf
      ? `<div class="pdfctl">
          <button class="ibtn" id="pdf-zoom-out" type="button" title="ছোট করুন" aria-label="ছোট করুন">−</button>
          <span class="zoomval" id="pdf-zoomval">১০০%</span>
          <button class="ibtn" id="pdf-zoom-in" type="button" title="বড় করুন" aria-label="বড় করুন">+</button>
          <span class="chip" id="pdf-pageinfo"></span>
          <button class="ibtn" id="pdf-native-btn" type="button" title="সাধারণ ভিউ (হাইলাইট ছাড়া) — এই পেজেই খোলে, ডাউনলোড হয় না" aria-label="সাধারণ ভিউ">📄</button>
          <button class="ibtn" id="pdf-annotated-btn" type="button" title="হাইলাইট ভিউ" aria-label="হাইলাইট ভিউ" style="display:none">🖍️</button>
          <button class="ibtn" id="pdf-newtab-btn" type="button" title="নতুন ট্যাবে PDF রিডারে খুলুন (ডাউনলোড হয় না)" aria-label="নতুন ট্যাবে খুলুন">⧉</button>
        </div>`
      : "";

    const hint = isPdf
      ? `<span class="chip" id="hl-hint">লেখা সিলেক্ট করে হাইলাইট করুন</span>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.name)} — BCS Notebook</title>
<style>${READER_CSS}</style>
</head>
<body>
<script>
/* আগের পছন্দ (লুকানো/দেখানো) সঙ্গে সঙ্গে প্রয়োগ — যাতে পেজ খোলার সময় বার ঝলকে না ওঠে */
try{if(localStorage.getItem('bcs-reader-bar-hidden')==='1')document.body.classList.add('bar-hidden');}catch(e){}
<\/script>
<button class="bar-fab" id="bar-fab" type="button" title="উপরের বার দেখান" aria-label="উপরের বার দেখান">☰</button>
<header class="topbar">
  <button class="ibtn bar-collapse" id="bar-collapse" type="button" title="উপরের বার লুকান — পড়ার জায়গা বাড়বে" aria-label="উপরের বার লুকান">▲</button>
  <a class="back" href="/">← মূল অ্যাপে ফিরুন</a>
  <div class="title-wrap"><span class="doc-name">${esc(doc.name)}</span><span class="badge">${esc(doc.ext)}</span></div>
  <div class="actions">
    ${hint}
    <span class="bcs-ann-status" id="ann-status" hidden></span>
    ${pdfCtl}
    <span class="chip" id="read-chip">পড়া হয়েছে: <b id="read-num">${toBn(doc.readCount)}</b> বার</span>
    <a class="btn secondary" href="/api/documents/${esc(id)}/file?download=1">ডাউনলোড</a>
    <button class="btn" id="read-btn" type="button" onclick="markRead()">+১ পড়া হয়েছে</button>
  </div>
</header>
${bodyHtml}
<script>
function toBn(n){var d=['০','১','২','৩','৪','৫','৬','৭','৮','৯'];return String(n).replace(/[0-9]/g,function(c){return d[+c];});}
(function(){
  function setBarHidden(h){
    document.body.classList.toggle('bar-hidden',h);
    try{localStorage.setItem('bcs-reader-bar-hidden',h?'1':'0');}catch(e){}
  }
  var c=document.getElementById('bar-collapse'),f=document.getElementById('bar-fab');
  if(c)c.addEventListener('click',function(){setBarHidden(true);});
  if(f)f.addEventListener('click',function(){setBarHidden(false);});
})();
function markRead(){
  var btn=document.getElementById('read-btn');
  if(!btn||btn.disabled)return;
  btn.disabled=true;
  fetch('/api/reads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'document',id:'${esc(id)}'})})
  .then(function(r){if(!r.ok)throw new Error('failed');return r.json();})
  .then(function(d){
    btn.textContent=toBn(d.readCount)+' বার পড়া হয়েছে';
    btn.classList.add('done');
    var num=document.getElementById('read-num');
    if(num)num.textContent=toBn(d.readCount);
  })
  .catch(function(){btn.disabled=false;});
}
</script>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("GET /api/documents/[id]/view error:", error);
    return errorPage(500, "সমস্যা হয়েছে", "ডকুমেন্ট পাতাটি তৈরি করা যায়নি — আবার চেষ্টা করুন।");
  }
}
