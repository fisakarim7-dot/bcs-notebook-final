import { db } from "@/lib/db";

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

async function nodePath(nodeId: string): Promise<string> {
  const parts: string[] = [];
  let cur = await db.treeNode.findUnique({ where: { id: nodeId } });
  let guard = 0;
  while (cur && guard < 12) {
    parts.unshift(cur.name);
    if (!cur.parentId) break;
    cur = await db.treeNode.findUnique({ where: { id: cur.parentId } });
    guard++;
  }
  return parts.join(" › ");
}

const FONT_FACE = `@font-face{font-family:'Kalpurush';src:url('/fonts/kalpurush.ttf') format('truetype');font-display:swap;}`;

// GET /api/note-items/[id]/view — full-window annotated reader for a note item
// Marks (highlight/bold/italic/color) live in the DB, never inside the note —
// the note HTML below is rendered untouched.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await db.noteItem.findUnique({ where: { id } });

  const notFound = `<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"><title>পাওয়া যায়নি</title><style>${FONT_FACE}</style></head><body style="font-family:'Kalpurush',system-ui,sans-serif;padding:40px;text-align:center"><h2>নোটটি পাওয়া যায়নি</h2><p>হয়তো এটি মুছে ফেলা হয়েছে।</p><a href="/">← মূল অ্যাপে ফিরুন</a></body></html>`;
  if (!item) {
    return new Response(notFound, {
      status: 404,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }

  const path = await nodePath(item.nodeId);
  const isTimes = item.font === "times";
  const bodyFont = isTimes
    ? "'Times New Roman', Times, 'Kalpurush', serif"
    : "'Kalpurush', system-ui, sans-serif";
  const title = item.title.trim() || "শিরোনামহীন নোট";

  const html = `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — পাঠক</title>
<style>
${FONT_FACE}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:${bodyFont};color:#1f2937;background:#f4f3ef;font-size:16px}
.topbar{position:fixed;top:0;left:0;right:0;height:56px;background:#fff;border-bottom:1px solid #e2e0da;display:flex;align-items:center;gap:12px;padding:0 16px;z-index:50;box-shadow:0 1px 6px rgba(0,0,0,.05)}
.back{color:#0f766e;text-decoration:none;font-weight:600;font-size:14px;white-space:nowrap;padding:8px 10px;border-radius:8px}
.back:hover{background:#e6f4f1}
.title-wrap{flex:1;display:flex;align-items:center;justify-content:center;min-width:0}
.doc-name{font-weight:700;font-size:15px;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:52vw}
.actions{display:flex;align-items:center;gap:8px;white-space:nowrap}
.chip{font-size:12px;color:#57534e;background:#f1efe9;border:1px solid #e2e0da;border-radius:999px;padding:4px 10px;font-family:'Kalpurush',system-ui,sans-serif}
.btn{display:inline-flex;align-items:center;gap:6px;background:#0f766e;color:#fff;text-decoration:none;font-size:13px;font-weight:600;border:none;border-radius:8px;padding:8px 14px;cursor:pointer;font-family:'Kalpurush',system-ui,sans-serif}
.btn:hover{background:#0d5f59}
.btn.done{background:#15803d;animation:pop .45s ease}
@keyframes pop{0%{transform:scale(1)}40%{transform:scale(1.1)}100%{transform:scale(1)}}
.hintchip{font-size:11.5px;color:#57534e;background:#fef3c7;border:1px solid #fcd34d;border-radius:999px;padding:4px 10px;font-family:'Kalpurush',system-ui,sans-serif;white-space:nowrap}
.reader{margin-top:56px;padding:26px 16px 60px}
.sheet{max-width:860px;margin:0 auto;background:#fff;border:1px solid #e2e0da;border-radius:14px;padding:36px 44px;box-shadow:0 4px 22px rgba(0,0,0,.06)}
h1.doc-title{font-size:24px;line-height:1.45;margin:0 0 4px;font-weight:700}
.doc-path{font-size:12.5px;color:#6b7280;margin:0 0 4px;line-height:1.7;font-family:'Kalpurush',system-ui,sans-serif}
hr.rule{border:none;border-top:2px solid #0f766e;opacity:.85;margin:14px 0 20px}
.content{font-size:16px;line-height:2.0;word-wrap:break-word}
.content p{margin:.55em 0}
.content h1,.content h2,.content h3{line-height:1.45;margin:1.15em 0 .45em}
.content h1{font-size:22px}.content h2{font-size:19px}.content h3{font-size:17px}
.content ul,.content ol{padding-left:1.6em;margin:.5em 0}
.content li{margin:.22em 0}
.content blockquote{border-left:4px solid #0f766e;margin:1em 0;padding:.25em 1.1em;color:#44403c;background:#f8f7f4;border-radius:0 8px 8px 0}
.content pre{background:#f5f4f0;border:1px solid #e2e0da;border-radius:8px;padding:12px 14px;overflow:auto;font-size:.9em;white-space:pre-wrap}
.content code{background:#f5f4f0;border-radius:5px;padding:2px 6px;font-size:.9em}
.content a{color:#0f766e}
.content img{max-width:100%;height:auto;border-radius:6px}
.content img[style*="text-align: center"],.content img[style*="text-align:center"]{display:block;margin:8px auto}
.content img[style*="text-align: right"],.content img[style*="text-align:right"]{display:block;margin:8px 0 8px auto}
.content table{border-collapse:collapse;width:100%;margin:14px 0;font-size:.95em}
.content th,.content td{border:1px solid #d6d3cb;padding:7px 11px;text-align:left;vertical-align:top}
.content th{background:#f1efe9;font-weight:700}
.content ul[data-type="taskList"]{list-style:none;padding-left:.2em}
.content ul[data-type="taskList"] li{display:flex;gap:9px;align-items:flex-start}
.content ul[data-type="taskList"] li>label{margin-top:.45em;flex-shrink:0}
.content hr{border:none;border-top:1px solid #d6d3cb;margin:1.4em 0}
.content mark{border-radius:3px;padding:0 3px}
.bcs-ann{box-decoration-break:clone;-webkit-box-decoration-break:clone}
@media (max-width:720px){
  .sheet{padding:24px 18px}
  .doc-name{max-width:38vw}
  .hintchip,.chip{display:none}
}
</style>
</head>
<body>
<header class="topbar">
  <a class="back" href="/">← মূল অ্যাপে ফিরুন</a>
  <div class="title-wrap"><span class="doc-name">${esc(title)}</span></div>
  <div class="actions">
    <span class="hintchip">লেখা সিলেক্ট করে হাইলাইট · B · I · রং</span>
    <span class="bcs-ann-status" id="ann-status" hidden></span>
    <span class="chip">পড়া হয়েছে: <b id="read-num">${toBn(item.readCount)}</b> বার</span>
    <button class="btn" id="read-btn" type="button" onclick="markRead()">+১ পড়া হয়েছে</button>
  </div>
</header>
<main class="reader">
  <article class="sheet">
    <h1 class="doc-title">${esc(title)}</h1>
    ${path ? `<p class="doc-path">📚 ${esc(path)}</p>` : ""}
    <hr class="rule">
    <div class="content" id="noteroot">${item.content || "<p><em>খালি নোট।</em></p>"}</div>
  </article>
</main>
<script src="/annotator.js"><\/script>
<script>
function toBn(n){var d=['০','১','২','৩','৪','৫','৬','৭','৮','৯'];return String(n).replace(/[0-9]/g,function(c){return d[+c];});}
function markRead(){
  var btn=document.getElementById('read-btn');
  if(!btn||btn.disabled)return;
  btn.disabled=true;
  fetch('/api/reads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'noteItem',id:'${esc(id)}'})})
  .then(function(r){if(!r.ok)throw new Error('failed');return r.json();})
  .then(function(d){
    btn.textContent=toBn(d.readCount)+' বার পড়া হয়েছে';
    btn.classList.add('done');
    var num=document.getElementById('read-num');
    if(num)num.textContent=toBn(d.readCount);
  })
  .catch(function(){btn.disabled=false;});
}
BCSAnnotator.attach({
  doc: document,
  root: document.getElementById('noteroot'),
  kind: 'note-item',
  targetId: '${esc(id)}',
  hostDoc: document,
  statusEl: document.getElementById('ann-status'),
  styleMarks: true
});
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
