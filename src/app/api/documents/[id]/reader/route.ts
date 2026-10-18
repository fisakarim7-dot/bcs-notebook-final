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

const CSS = `
*{box-sizing:border-box}
html,body{margin:0;padding:0;height:100%}
body{background:#525659;color:#fff;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;flex-direction:column;min-height:100dvh}
.bar{position:sticky;top:0;z-index:10;flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:6px 10px;background:#323639;box-shadow:0 1px 6px rgba(0,0,0,.45)}
.name{flex:1;min-width:0;font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chip{font-size:12.5px;color:#e5e7eb;background:#4b4f52;border-radius:6px;padding:4px 9px;white-space:nowrap;font-variant-numeric:tabular-nums}
.btn{min-width:34px;height:32px;border:none;border-radius:6px;background:#4b4f52;color:#fff;font-size:17px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0 9px;text-decoration:none;font-family:inherit}
.btn:hover{background:#5d6266}
.btn.txt{font-size:13px;font-weight:600}
#pages{flex:1 1 auto;display:flex;flex-direction:column;align-items:flex-start;gap:12px;padding:14px 0 40px;min-width:0}
.page{position:relative;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.4);flex:0 0 auto;margin-left:auto;margin-right:auto}
.page canvas{display:block;width:100%;height:100%}
.msg{margin:80px 20px;text-align:center;line-height:1.9;font-size:15px;color:#e5e7eb}
.msg a{color:#7dd3fc}
@media (max-width:600px){.hide-sm{display:none}#pages{gap:8px;padding:8px 0 28px}}
`;

// GET /api/documents/[id]/reader — হাইলাইট/টুলবার ছাড়া ক্লিন ফুল-স্ক্রিন PDF রিডার।
// ব্রাউজারে নিজস্ব PDF ভিউয়ার না থাকলে (Android Chrome, "PDF ডাউনলোড করুন" সেটিং)
// ⧉ বাটন এই পেজ খোলে। ডাউনলোড হয় না, অ্যাপের হাইলাইট ভিউতেও ফেরে না।
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const doc = await db.document.findUnique({ where: { id } });
    if (!doc) {
      return new Response("Document not found", { status: 404 });
    }
    if ((doc.ext || "").toLowerCase() !== "pdf") {
      return Response.redirect(new URL(`/api/documents/${encodeURIComponent(id)}/file`, _request.url), 302);
    }

    const safeId = encodeURIComponent(id);
    const html = `<!DOCTYPE html>
<html lang="bn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(doc.name)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="bar">
  <span class="name">${esc(doc.name)}</span>
  <span class="chip" id="pginfo">…</span>
  <button class="btn" id="zout" type="button" aria-label="ছোট করুন">−</button>
  <span class="chip hide-sm" id="zval">১০০%</span>
  <button class="btn" id="zin" type="button" aria-label="বড় করুন">+</button>
  <a class="btn txt" href="/api/documents/${safeId}/file?download=1" aria-label="ডাউনলোড">ডাউনলোড</a>
</div>
<div id="pages"><div class="msg">⏳ পিডিএফ লোড হচ্ছে…</div></div>
<script type="module">
import * as pdfjsLib from '/pdfjs/pdf.min.mjs';
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';

var FILE_URL = '/api/documents/${safeId}/file';
var host = document.getElementById('pages');
var pginfo = document.getElementById('pginfo');
var zval = document.getElementById('zval');
var BN = ['০','১','২','৩','৪','৫','৬','৭','৮','৯'];
function bn(n){ return String(n).replace(/[0-9]/g, function(c){ return BN[+c]; }); }

var doc = null, w1 = 0, h1 = 0;
var zoomStep = 0;                       // 0 = প্রস্থ অনুযায়ী ফিট
var ZOOMS = [0.5, 0.65, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];
var zoomIdx = 3;
var epoch = 0, observer = null;

function baseScale() {
  var avail = document.documentElement.clientWidth - (window.innerWidth <= 600 ? 8 : 40);
  return Math.max(0.2, Math.min(avail / w1, 1.6));
}
function curScale() { return baseScale() * ZOOMS[zoomIdx]; }
function updateZoomLabel() { zval.textContent = bn(Math.round(ZOOMS[zoomIdx] * 100)) + '%'; }

function build(keepFraction) {
  epoch++;
  if (observer) observer.disconnect();
  var s = curScale();
  var frac = 0;
  if (keepFraction) {
    var total = document.documentElement.scrollHeight - window.innerHeight;
    frac = total > 0 ? window.scrollY / total : 0;
  }
  host.innerHTML = '';
  observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) renderPage(e.target, epoch); });
  }, { rootMargin: '700px 0px' });
  for (var i = 1; i <= doc.numPages; i++) {
    var d = document.createElement('div');
    d.className = 'page';
    d.setAttribute('data-n', i);
    d.style.width = Math.round(w1 * s) + 'px';
    d.style.height = Math.round(h1 * s) + 'px';
    host.appendChild(d);
    observer.observe(d);
  }
  updateZoomLabel();
  if (keepFraction) {
    var total2 = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo(0, Math.max(0, frac * total2));
  }
  updatePageInfo();
}

function renderPage(div, myEpoch) {
  if (div.getAttribute('data-done') === String(myEpoch)) return;
  div.setAttribute('data-done', String(myEpoch));
  var n = parseInt(div.getAttribute('data-n'), 10);
  doc.getPage(n).then(function (page) {
    if (myEpoch !== epoch) return;
    var vp = page.getViewport({ scale: curScale() });
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var canvas = document.createElement('canvas');
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    div.style.width = Math.round(vp.width) + 'px';
    div.style.height = Math.round(vp.height) + 'px';
    div.appendChild(canvas);
    var transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;
    return page.render({ canvasContext: canvas.getContext('2d'), viewport: vp, transform: transform }).promise;
  }).catch(function (err) {
    console.error('page render error', n, err);
    div.removeAttribute('data-done');
  });
}

function updatePageInfo() {
  if (!doc) return;
  var pages = host.querySelectorAll('.page');
  var mid = window.innerHeight / 2, cur = 1;
  for (var i = 0; i < pages.length; i++) {
    var r = pages[i].getBoundingClientRect();
    if (r.top <= mid) cur = i + 1; else break;
  }
  pginfo.textContent = bn(cur) + ' / ' + bn(doc.numPages);
}

function zoom(dir) {
  var next = zoomIdx + dir;
  if (next < 0 || next >= ZOOMS.length) return;
  zoomIdx = next;
  build(true);
}
document.getElementById('zin').addEventListener('click', function () { zoom(1); });
document.getElementById('zout').addEventListener('click', function () { zoom(-1); });

var tScroll = 0;
window.addEventListener('scroll', function () {
  if (tScroll) return;
  tScroll = setTimeout(function () { tScroll = 0; updatePageInfo(); }, 100);
}, { passive: true });

var lastW = document.documentElement.clientWidth, tResize = 0;
window.addEventListener('resize', function () {
  clearTimeout(tResize);
  tResize = setTimeout(function () {
    var w = document.documentElement.clientWidth;
    if (doc && w !== lastW) { lastW = w; build(true); }
  }, 250);
});

pdfjsLib.getDocument({ url: FILE_URL }).promise.then(function (d) {
  doc = d;
  return d.getPage(1);
}).then(function (p1) {
  var vp = p1.getViewport({ scale: 1 });
  w1 = vp.width; h1 = vp.height;
  build(false);
}).catch(function (err) {
  console.error('pdf load error', err);
  host.innerHTML = '<div class="msg">⚠️ পিডিএফটি খোলা যায়নি।<br><a href="/api/documents/${safeId}/file?download=1">ডাউনলোড করে দেখুন</a></div>';
  pginfo.textContent = '';
});
<\/script>
</body>
</html>`;

    return new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    console.error("GET /api/documents/[id]/reader error:", error);
    return new Response("Failed to open reader", { status: 500 });
  }
}
