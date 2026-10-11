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

const dateFmt = new Intl.DateTimeFormat("bn-BD", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

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

// GET /api/note-items/[id]/print — clean print page; browser "Save as PDF" keeps Bengali shaping perfect
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const item = await db.noteItem.findUnique({ where: { id } });

  if (!item) {
    const html = `<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"><title>পাওয়া যায়নি</title><style>${FONT_FACE}</style></head><body style="font-family:'Kalpurush',system-ui,sans-serif;padding:40px;text-align:center"><h2>নোটটি পাওয়া যায়নি</h2><p>হয়তো এটি মুছে ফেলা হয়েছে।</p><a href="/">← মূল অ্যাপে ফিরুন</a></body></html>`;
    return new Response(html, {
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
<title>${esc(title)} — প্রিন্ট</title>
<style>
${FONT_FACE}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font-family:${bodyFont};color:#1a1a1a;background:#f2f1ed;font-size:15px}
.toolbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:10px;padding:10px 16px;background:#ffffff;border-bottom:1px solid #e2e0da;box-shadow:0 1px 6px rgba(0,0,0,.05)}
.toolbar .spacer{flex:1}
.tbtn{display:inline-flex;align-items:center;gap:7px;border:none;border-radius:8px;padding:9px 16px;font-family:'Kalpurush',system-ui,sans-serif;font-size:13.5px;font-weight:700;cursor:pointer;text-decoration:none}
.tbtn.print{background:#0f766e;color:#fff}
.tbtn.print:hover{background:#0d5f59}
.tbtn.back{background:#f1efe9;color:#1f2937;border:1px solid #e2e0da}
.tbtn.back:hover{background:#e7e4dc}
.sheet{max-width:800px;margin:22px auto 40px;background:#ffffff;border:1px solid #e2e0da;border-radius:12px;padding:44px 52px;box-shadow:0 4px 22px rgba(0,0,0,.07)}
h1.doc-title{font-size:26px;line-height:1.4;margin:0 0 6px;font-weight:700}
.doc-path{font-size:12.5px;color:#6b7280;margin:0 0 4px;line-height:1.7}
.doc-meta{font-size:12px;color:#9ca3af;margin:0;line-height:1.7}
hr.rule{border:none;border-top:2px solid #0f766e;opacity:.85;margin:16px 0 22px}
.content{font-size:15.5px;line-height:2.0;word-wrap:break-word}
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
@media print{
  @page{size:A4;margin:16mm 15mm}
  body{background:#ffffff;font-size:13.5px}
  .toolbar{display:none!important}
  .sheet{box-shadow:none;border:none;border-radius:0;margin:0;max-width:100%;padding:0}
  .content{font-size:13.5px;line-height:1.95}
  *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
}
</style>
</head>
<body>
<div class="toolbar">
  <a class="tbtn back" href="/">← মূল অ্যাপে ফিরুন</a>
  <span class="spacer"></span>
  <button class="tbtn print" type="button" onclick="window.print()">🖨️ প্রিন্ট করুন / PDF সেভ করুন</button>
</div>
<article class="sheet">
  <h1 class="doc-title">${esc(title)}</h1>
  ${path ? `<p class="doc-path">📚 ${esc(path)}</p>` : ""}
  <p class="doc-meta">সর্বশেষ সম্পাদনা: ${dateFmt.format(new Date(item.updatedAt))} · পঠন সংখ্যা: ${toBn(item.readCount)} বার</p>
  <hr class="rule">
  <div class="content">${item.content || "<p><em>খালি নোট।</em></p>"}</div>
</article>
<script>
window.addEventListener('load',function(){setTimeout(function(){window.print();},450);});
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
