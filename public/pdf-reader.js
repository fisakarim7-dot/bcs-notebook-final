/*
 * BCS Tree Notebook — Annotated PDF reader (pdf.js based)
 * ---------------------------------------------------------
 * Renders the PDF page-by-page (canvas + transparent text layer) and lets
 * the reader mark it up pdfgear-style:
 *   • Highlights are full-line bands painted with mix-blend-mode:multiply —
 *     canvas glyphs stay crisp black beneath the colour (real marker look,
 *     never washed out). Consecutive selected lines are vertically bridged
 *     so multi-line marks read as one continuous stroke.
 *   • Underlines are thin solid bars under each selected line.
 *   • While dragging a selection the patchy native selection painting is
 *     hidden and a smooth merged "ghost" band previews the coming mark.
 *   • Clicking an existing mark opens a popup to recolour or delete it;
 *     Alt+click deletes directly.
 * Marks live in the database keyed by text + context + occurrence per page,
 * so they survive zoom changes and app restarts WITHOUT ever modifying the
 * PDF file itself.
 *
 * Bold / italic / font-colour are not offered on PDF pages: a PDF is a
 * fixed-layout format and re-styling its glyphs would corrupt its look —
 * highlights + underlines + eraser are the safe, non-destructive tools here.
 *
 * Boot: pdf.min.mjs (module) sets window.BCSPdfLib then calls BCSPdfReader.start(cfg).
 */
(function () {
  "use strict";

  var HIGHLIGHTS = ["#fde68a", "#bbf7d0", "#fbcfe8", "#fed7aa", "#a5f3fc"];
  var UNDERLINES = ["#b91c1c", "#15803d", "#7c3aed", "#c2410c", "#0f766e"];
  var DEFAULT_HL = "#fde68a";
  var CTX = 60;
  var PDF_TO_CSS = 96 / 72; // match pdf.js viewer density

  var ZOOMS = [0.6, 0.8, 1, 1.25, 1.5, 1.75, 2, 2.5];

  var state = {
    lib: null,
    doc: null,
    docId: null,
    kind: "document",
    api: "/api/annotations",
    scale: PDF_TO_CSS, // 100% = 96/72
    autoFit: true, // shrink page to fit narrow screens until the user zooms
    page1Width: 0, // page-1 width in px at scale 1
    epoch: 0,
    numPages: 0,
    payload: [],
    dirty: false,
    saveTimer: null,
    rendered: {}, // pageNum -> true (text layer ready)
    annotateMode: true,
    tb: null,
    statusEl: null,
    observer: null,
    dragging: false,
    pop: null,
    popAnnId: null,
    lastColor: DEFAULT_HL,
  };

  function toBn(n) {
    var d = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
    return String(n).replace(/[0-9]/g, function (c) { return d[+c]; });
  }

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
  }

  /* ---------------- status ---------------- */
  function setStatus(text, cls) {
    if (!state.statusEl) return;
    state.statusEl.textContent = text;
    state.statusEl.className = "bcs-ann-status" + (cls ? " " + cls : "");
    state.statusEl.style.display = text ? "inline-flex" : "none";
  }
  function countMarks() {
    return state.payload.length;
  }
  function refreshStatus(msg, cls) {
    if (msg) {
      setStatus(msg, cls);
      clearTimeout(refreshStatus._t);
      refreshStatus._t = setTimeout(function () { refreshStatus(); }, 1600);
      return;
    }
    setStatus("🖍️ " + toBn(countMarks()) + " টি দাগ");
  }

  /* ---------------- persistence ---------------- */
  function scheduleSave() {
    state.dirty = true;
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(saveNow, 700);
  }
  function saveNow() {
    if (!state.dirty) return;
    state.dirty = false;
    refreshStatus("💾 সেভ হচ্ছে…");
    fetch(state.api, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: state.kind,
        targetId: state.docId,
        payload: state.payload,
      }),
    })
      .then(function (r) {
        if (!r.ok) throw new Error("fail");
        refreshStatus("✓ সংরক্ষিত");
      })
      .catch(function () {
        state.dirty = true;
        refreshStatus("⚠️ সেভ করা যায়নি", "err");
      });
  }
  function flushBeacon() {
    if (!state.dirty) return;
    state.dirty = false;
    try {
      navigator.sendBeacon(
        state.api,
        new Blob(
          [JSON.stringify({ kind: state.kind, targetId: state.docId, payload: state.payload })],
          { type: "application/json" }
        )
      );
    } catch (e) { /* best effort */ }
  }

  /* ---------------- geometry: pdfgear-style line bands ---------------- */
  /** Viewport client rects of a DOM range, tiny artifacts filtered. */
  function rectsOfRange(range) {
    var out = [];
    try {
      var list = range.getClientRects();
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        if (r.width < 0.5 || r.height < 0.5) continue;
        out.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
      }
    } catch (e) { /* stale range */ }
    return out;
  }

  /**
   * Merge raw client rects into smooth per-line bands:
   *  1. group rects sharing a visual line (>40% vertical overlap)
   *  2. each band spans the full horizontal extent of that line
   *  3. consecutive bands are bridged vertically (half gap each side) so a
   *     multi-line mark reads as ONE continuous stroke — highlights only.
   */
  function mergeLineRects(rects, bridge) {
    if (!rects.length) return [];
    var rs = rects.slice().sort(function (a, b) { return a.top - b.top || a.left - b.left; });
    var lines = [];
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i], placed = false;
      for (var j = lines.length - 1; j >= 0; j--) {
        var L = lines[j];
        var o = Math.min(r.bottom, L.bottom) - Math.max(r.top, L.top);
        if (o > 0.4 * Math.min(r.bottom - r.top, L.bottom - L.top)) {
          L.left = Math.min(L.left, r.left);
          L.right = Math.max(L.right, r.right);
          L.top = Math.min(L.top, r.top);
          L.bottom = Math.max(L.bottom, r.bottom);
          placed = true;
          break;
        }
      }
      if (!placed) lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    lines.sort(function (a, b) { return a.top - b.top; });
    if (bridge) {
      for (var k = 0; k < lines.length - 1; k++) {
        var a = lines[k], b = lines[k + 1];
        var gap = b.top - a.bottom;
        var ha = a.bottom - a.top, hb = b.bottom - b.top;
        if (gap > 0 && gap <= 0.75 * Math.min(ha, hb)) {
          var half = gap / 2;
          a.bottom += half;
          b.top -= half;
        }
      }
    }
    var out = [];
    for (var m = 0; m < lines.length; m++) {
      var t = lines[m];
      out.push({
        left: t.left - 1.5,
        top: t.top,
        width: t.right - t.left + 3,
        height: Math.max(1, t.bottom - t.top),
      });
    }
    return out;
  }

  /* ---------------- overlays ---------------- */
  function overlaysEl(pageDiv) {
    return pageDiv.querySelector(".ann-overlays");
  }
  function ghostsEl(pageDiv) {
    return pageDiv.querySelector(".sel-overlays");
  }

  /** Draw one mark's merged bands into the page overlay layer. */
  function drawMark(pageDiv, pr, bands, ann) {
    var ov = overlaysEl(pageDiv);
    var isUl = ann.type === "underline";
    for (var i = 0; i < bands.length; i++) {
      var B = bands[i];
      var el = document.createElement("div");
      el.className = "pdf-ann-ov" + (isUl ? " ul" : "");
      el.setAttribute("data-ann", ann.id);
      el.setAttribute("title", "ক্লিক = রং বদল · Alt+ক্লিক = মুছুন");
      if (isUl) {
        var th = Math.max(1.6, Math.min(3.2, B.height * 0.09));
        el.style.left = B.left - pr.left + "px";
        el.style.top = B.top - pr.top + B.height - th + "px";
        el.style.width = B.width + "px";
        el.style.height = th + "px";
      } else {
        el.style.left = B.left - pr.left + "px";
        el.style.top = B.top - pr.top + "px";
        el.style.width = B.width + "px";
        el.style.height = B.height + "px";
      }
      el.style.backgroundColor = ann.color || (isUl ? "#b91c1c" : DEFAULT_HL);
      ov.appendChild(el);
    }
  }

  /** Re-draw all marks stored for one page. */
  function applyMarksForPage(pageDiv, pageNum) {
    var layer = pageDiv.querySelector(".textLayer");
    if (!layer) return;
    var ov = overlaysEl(pageDiv);
    ov.innerHTML = "";
    if (!state.payload.length) { state.rendered[pageNum] = true; return; }
    var fl = window.BCSAnnotator.flatten(layer);
    var pr = pageDiv.getBoundingClientRect();
    for (var i = 0; i < state.payload.length; i++) {
      var ann = state.payload[i];
      if ((ann.page || 1) !== pageNum) continue;
      var m = window.BCSAnnotator.findMark(fl, ann);
      if (!m) continue;
      var segs = fl.segs;
      var sNode = null, sOff = 0, eNode = null, eOff = 0;
      for (var s = 0; s < segs.length; s++) {
        if (sNode === null && segs[s].start <= m.start && segs[s].end >= m.start) {
          sNode = segs[s].node; sOff = m.start - segs[s].start;
        }
        if (segs[s].start <= m.end && segs[s].end >= m.end) {
          eNode = segs[s].node; eOff = m.end - segs[s].start;
          break;
        }
      }
      if (sNode === null || eNode === null) continue;
      try {
        var rng = document.createRange();
        rng.setStart(sNode, Math.min(sOff, sNode.nodeValue.length));
        rng.setEnd(eNode, Math.min(eOff, eNode.nodeValue.length));
        var rects = rectsOfRange(rng);
        if (!rects.length) continue;
        drawMark(pageDiv, pr, mergeLineRects(rects, ann.type !== "underline"), ann);
      } catch (e) { /* stale offsets — skip */ }
    }
    state.rendered[pageNum] = true;
  }

  /* ---------------- selection ghost preview ---------------- */
  function clearSelGhosts() {
    var gs = document.querySelectorAll(".sel-overlays");
    for (var i = 0; i < gs.length; i++) gs[i].innerHTML = "";
  }
  function rangePages(range) {
    function pageOf(node) {
      var el = node.nodeType === 1 ? node : node.parentElement;
      return el && el.closest ? el.closest(".pdfpage") : null;
    }
    return { a: pageOf(range.startContainer), b: pageOf(range.endContainer) };
  }
  function updateSelGhosts() {
    clearSelGhosts();
    if (!state.annotateMode) return;
    var info = selPageInfo();
    if (!info) return;
    var pp = rangePages(info.range);
    if (!pp.b || pp.a !== pp.b) return; // cross-page selection: skip preview
    var rects = rectsOfRange(info.range);
    if (!rects.length) return;
    var bands = mergeLineRects(rects, true);
    var layer = ghostsEl(info.pageDiv);
    if (!layer) return;
    var pr = info.pageDiv.getBoundingClientRect();
    for (var i = 0; i < bands.length; i++) {
      var B = bands[i];
      var el = document.createElement("div");
      el.className = "pdf-sel-ghost";
      el.style.left = B.left - pr.left + "px";
      el.style.top = B.top - pr.top + "px";
      el.style.width = B.width + "px";
      el.style.height = B.height + "px";
      el.style.backgroundColor = state.lastColor || DEFAULT_HL;
      layer.appendChild(el);
    }
  }

  /* ---------------- toolbar ---------------- */
  function ensureToolbar() {
    if (state.tb) return;
    // The PDF page never calls BCSAnnotator.attach(), so the
    // .bcs-ann-tb / .bcs-ann-status CSS must be injected here explicitly.
    if (window.BCSAnnotator && window.BCSAnnotator.ensureCss) {
      window.BCSAnnotator.ensureCss(document);
    }
    var tb = document.createElement("div");
    tb.className = "bcs-ann-tb";
    tb.setAttribute("role", "toolbar");
    tb.setAttribute("aria-label", "পিডিএফ হাইলাইট টুলবার");
    tb.style.display = "none";
    var html = '<span class="lbl">হাইলাইট</span>';
    for (var h = 0; h < HIGHLIGHTS.length; h++) {
      html += '<button type="button" class="sw" data-h="' + HIGHLIGHTS[h] + '" style="background:' + HIGHLIGHTS[h] + '" title="হাইলাইট" aria-label="হাইলাইট"></button>';
    }
    html += '<span class="bcs-sep"></span><span class="lbl">আন্ডারলাইন</span>';
    for (var u = 0; u < UNDERLINES.length; u++) {
      html += '<button type="button" class="sw" data-u="' + UNDERLINES[u] + '" style="background:#fff;border-bottom:3px solid ' + UNDERLINES[u] + '" title="আন্ডারলাইন" aria-label="আন্ডারলাইন"></button>';
    }
    html += '<span class="bcs-sep"></span><button type="button" class="er" data-act="erase" title="নির্বাচিত অংশের দাগ মুছুন">মুছুন</button>';
    tb.innerHTML = html;
    document.body.appendChild(tb);
    tb.addEventListener("mousedown", function (e) { e.preventDefault(); });
    tb.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("button") : null;
      if (!b) return;
      if (b.dataset.h) makeMark("highlight", b.dataset.h);
      else if (b.dataset.u) makeMark("underline", b.dataset.u);
      else if (b.dataset.act === "erase") eraseSelection();
    });
    state.tb = tb;
  }

  function hideToolbar() {
    if (state.tb) state.tb.style.display = "none";
  }

  function selPageInfo() {
    var sel = document.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
    var r = sel.getRangeAt(0);
    var node = r.startContainer;
    var el = node.nodeType === 1 ? node : node.parentElement;
    if (!el) return null;
    var layer = el.closest ? el.closest(".textLayer") : null;
    if (!layer) return null;
    var pageDiv = layer.closest(".pdfpage");
    if (!pageDiv) return null;
    var num = parseInt(pageDiv.getAttribute("data-page"), 10);
    if (!num) return null;
    return { sel: sel, range: r, layer: layer, pageDiv: pageDiv, page: num };
  }

  function maybeShowToolbar() {
    if (!state.annotateMode) return;
    ensureToolbar();
    var info = selPageInfo();
    if (!info) { hideToolbar(); return; }
    var text = info.range.toString();
    if (!text || !text.trim()) { hideToolbar(); return; }
    var tb = state.tb;
    var r = info.range.getBoundingClientRect();
    tb.style.display = "flex";
    var tw = tb.offsetWidth, th = tb.offsetHeight;
    var t = r.top - th - 8;
    if (t < 8) t = r.top + r.height + 8;
    var l = Math.min(Math.max(8, r.left + r.width / 2 - tw / 2), window.innerWidth - tw - 8);
    tb.style.top = t + "px";
    tb.style.left = l + "px";
  }

  function crossPage(range) {
    var pp = rangePages(range);
    return !pp.b || pp.a !== pp.b;
  }

  function makeMark(type, color) {
    var info = selPageInfo();
    hideToolbar();
    if (!info) return;
    if (crossPage(info.range)) { refreshStatus("⚠️ এক পৃষ্ঠার মধ্যে দাগ দিন", "warn"); return; }
    var fl = window.BCSAnnotator.flatten(info.layer);
    var s = window.BCSAnnotator.boundaryToOffset(fl, info.range.startContainer, info.range.startOffset, true);
    var e = window.BCSAnnotator.boundaryToOffset(fl, info.range.endContainer, info.range.endOffset, false);
    if (s < 0 || e < 0 || e <= s) { refreshStatus("⚠️ এই অংশে দাগ দেওয়া যায় না", "err"); return; }
    var text = fl.full.slice(s, e);
    if (!text.trim() || text.length > 5000) {
      refreshStatus(text.length > 5000 ? "⚠️ অংশটি খুব বড়" : "⚠️ এই অংশে দাগ দেওয়া যায় না", "err");
      return;
    }
    var ann = {
      id: genId(),
      type: type,
      color: color,
      text: text,
      prefix: fl.full.slice(Math.max(0, s - CTX), s),
      suffix: fl.full.slice(e, Math.min(fl.full.length, e + CTX)),
      occurrence: 0,
      page: info.page,
    };
    var from = 0, occ = 0, p;
    while ((p = fl.full.indexOf(text, from)) !== -1 && p < s) { occ++; from = p + 1; }
    ann.occurrence = occ;
    state.payload.push(ann);
    state.lastColor = color;
    applyMarksForPage(info.pageDiv, info.page);
    refreshStatus();
    scheduleSave();
    clearSelGhosts();
    try { document.getSelection().removeAllRanges(); } catch (ex) { /* ignore */ }
  }

  function eraseSelection() {
    var info = selPageInfo();
    hideToolbar();
    if (!info) return;
    var fl = window.BCSAnnotator.flatten(info.layer);
    var s = window.BCSAnnotator.boundaryToOffset(fl, info.range.startContainer, info.range.startOffset, true);
    var e = window.BCSAnnotator.boundaryToOffset(fl, info.range.endContainer, info.range.endOffset, false);
    try { document.getSelection().removeAllRanges(); } catch (ex) { /* ignore */ }
    clearSelGhosts();
    if (s < 0 || e < 0 || e <= s) return;
    var removed = 0;
    var ov = overlaysEl(info.pageDiv);
    for (var i = state.payload.length - 1; i >= 0; i--) {
      var ann = state.payload[i];
      if ((ann.page || 1) !== info.page) continue;
      var m = window.BCSAnnotator.findMark(fl, ann);
      if (m && m.start < e && m.end > s) {
        ov.querySelectorAll('[data-ann="' + ann.id + '"]').forEach(function (el) { el.remove(); });
        state.payload.splice(i, 1);
        removed++;
      }
    }
    if (removed) { refreshStatus(); scheduleSave(); }
    else refreshStatus("এই অংশে কোনো দাগ নেই", "warn");
  }

  /* ---------------- mark popup (recolor / delete) ---------------- */
  function hidePop() {
    if (state.pop) { state.pop.remove(); state.pop = null; state.popAnnId = null; }
  }
  function hitOverlay(pageDiv, x, y) {
    var ov = overlaysEl(pageDiv);
    if (!ov) return null;
    var ovs = ov.querySelectorAll(".pdf-ann-ov");
    for (var i = 0; i < ovs.length; i++) {
      var r = ovs[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return ovs[i];
    }
    return null;
  }
  function findAnn(id) {
    for (var i = 0; i < state.payload.length; i++) if (state.payload[i].id === id) return state.payload[i];
    return null;
  }
  function showMarkPop(id, x, y) {
    hidePop();
    var ann = findAnn(id);
    if (!ann) return;
    state.popAnnId = id;
    var pal = ann.type === "underline" ? UNDERLINES : HIGHLIGHTS;
    var label = ann.type === "underline" ? "আন্ডারলাইন" : "হাইলাইট";
    var pop = document.createElement("div");
    pop.className = "bcs-ann-pop";
    var html = '<span class="lbl">' + label + '</span>';
    for (var c = 0; c < pal.length; c++) {
      var on = (ann.color || "").toLowerCase() === pal[c].toLowerCase();
      html += '<button type="button" class="dot" data-c="' + pal[c] + '" style="background:' + pal[c] + ';width:16px;height:16px;padding:0;' + (on ? "outline:2px solid #78716c;outline-offset:1px;" : "") + '" title="রং বদলান" aria-label="রং বদলান"></button>';
    }
    html += '<button type="button" class="rm">মুছুন</button><button type="button" class="cl">বন্ধ</button>';
    pop.innerHTML = html;
    document.body.appendChild(pop);
    state.pop = pop;
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    pop.style.top = Math.min(Math.max(8, y + 12), window.innerHeight - ph - 8) + "px";
    pop.style.left = Math.min(Math.max(8, x - pw / 2), window.innerWidth - pw - 8) + "px";
    var dots = pop.querySelectorAll(".dot");
    for (var d = 0; d < dots.length; d++) {
      dots[d].addEventListener("click", function (ev) {
        var col = ev.currentTarget.getAttribute("data-c");
        recolorMark(id, col);
        hidePop();
      });
    }
    pop.querySelector(".rm").addEventListener("click", function () { removeMark(id); hidePop(); });
    pop.querySelector(".cl").addEventListener("click", hidePop);
  }
  function recolorMark(id, color) {
    var ann = findAnn(id);
    if (!ann) return;
    ann.color = color;
    state.lastColor = color;
    var pg = ann.page || 1;
    var pageDiv = document.querySelector('.pdfpage[data-page="' + pg + '"]');
    if (pageDiv && state.rendered[pg]) applyMarksForPage(pageDiv, pg);
    scheduleSave();
    refreshStatus();
  }
  function removeMark(id) {
    var had = false;
    state.payload = state.payload.filter(function (p) {
      if (p.id === id) { had = true; return false; }
      return true;
    });
    if (!had) return;
    document.querySelectorAll('[data-ann="' + id + '"]').forEach(function (el) { el.remove(); });
    refreshStatus();
    scheduleSave();
  }

  /* Alt+click on a mark removes it; plain click on a mark opens the popup */
  function altClickRemove(e) {
    if (!e.altKey) return;
    var layer = e.target.closest ? e.target.closest(".textLayer") : null;
    if (!layer) return;
    var pageDiv = layer.closest(".pdfpage");
    if (!pageDiv) return;
    var hit = hitOverlay(pageDiv, e.clientX, e.clientY);
    if (!hit) return;
    removeMark(hit.getAttribute("data-ann"));
  }
  function overlayClick(e) {
    if (!state.annotateMode || e.altKey) return;
    var t = e.target;
    if (!t || !t.closest) return;
    if (t.closest(".bcs-ann-tb") || t.closest(".bcs-ann-pop")) return;
    var sel = document.getSelection();
    if (sel && !sel.isCollapsed) { hidePop(); return; }
    var layer = t.closest(".textLayer");
    if (!layer) { hidePop(); return; }
    var pageDiv = layer.closest(".pdfpage");
    if (!pageDiv) return;
    var hit = hitOverlay(pageDiv, e.clientX, e.clientY);
    if (!hit) { hidePop(); return; }
    showMarkPop(hit.getAttribute("data-ann"), e.clientX, e.clientY);
  }

  /* ---------------- pdf.js rendering ---------------- */
  function currentScale() {
    return state.scale;
  }
  function zoomLabel() {
    return toBn(Math.round((state.scale / PDF_TO_CSS) * 100)) + "%";
  }

  function renderPage(num, pageDiv, epoch) {
    state.doc.getPage(num).then(function (page) {
      if (epoch !== state.epoch) return;
      var scale = currentScale();
      var viewport = page.getViewport({ scale: scale });
      // Supersample: rasterise at >=1.5 backing pixels per CSS pixel (cap 2)
      // and let the browser downscale. On 1x screens this renders glyphs at
      // ~144dpi shown at 96dpi, so zoomed-in text stays crisp instead of
      // turning soft/blurry (the native viewer re-rasterises; we must too).
      var dpr = Math.min(Math.max(window.devicePixelRatio || 1, 1.5), 2);
      pageDiv.style.width = Math.floor(viewport.width) + "px";
      pageDiv.style.height = Math.floor(viewport.height) + "px";
      pageDiv.style.setProperty("--scale-factor", String(viewport.scale));
      pageDiv.style.setProperty("--user-unit", String(viewport.userUnit || 1));

      var canvas = document.createElement("canvas");
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      canvas.setAttribute("role", "presentation");
      pageDiv.appendChild(canvas);
      var ctx = canvas.getContext("2d");
      var transform = dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null;
      page
        .render({ canvasContext: ctx, viewport: viewport, transform: transform })
        .promise.then(function () {
          if (epoch !== state.epoch) return;
          var tl = new state.lib.TextLayer({
            textContentSource: page.streamTextContent({ includeMarkedContent: true }),
            container: pageDiv.querySelector(".textLayer"),
            viewport: viewport,
          });
          return tl.render();
        })
        .then(function () {
          if (epoch !== state.epoch) return;
          applyMarksForPage(pageDiv, num);
        })
        .catch(function (err) {
          if (epoch !== state.epoch) return;
          console.error("pdf page render error", num, err);
        });
    }).catch(function (err) {
      console.error("pdf getPage error", num, err);
      pageDiv.innerHTML = '<div class="pdfpage-err">পৃষ্ঠা ' + toBn(num) + ' দেখানো যায়নি</div>';
    });
  }

  function buildPages() {
    var host = document.getElementById("pdfpages");
    var epoch = state.epoch;
    state.doc.getPage(1).then(function (p1) {
      if (epoch !== state.epoch) return;
      var vp = p1.getViewport({ scale: currentScale() });
      for (var n = 1; n <= state.numPages; n++) {
        var div = document.createElement("div");
        div.className = "pdfpage";
        div.setAttribute("data-page", String(n));
        div.style.width = Math.floor(vp.width) + "px";
        div.style.height = Math.floor(vp.height) + "px";
        var ov = document.createElement("div");
        ov.className = "ann-overlays";
        var tl = document.createElement("div");
        tl.className = "textLayer";
        var so = document.createElement("div");
        so.className = "sel-overlays";
        div.appendChild(ov);
        div.appendChild(tl);
        div.appendChild(so);
        host.appendChild(div);
        state.observer.observe(div);
      }
      document.getElementById("pdf-pageinfo").textContent =
        toBn(state.numPages) + " পৃষ্ঠা";
    });
  }

  function makeObserver() {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var div = en.target;
          if (div.getAttribute("data-rendered") === "1") return;
          div.setAttribute("data-rendered", "1");
          io.unobserve(div);
          renderPage(parseInt(div.getAttribute("data-page"), 10), div, state.epoch);
        });
      },
      { root: document.getElementById("pdfwrap"), rootMargin: "900px 0px" }
    );
    return io;
  }

  function rebuild(zoomChanged) {
    state.epoch++;
    var host = document.getElementById("pdfpages");
    if (!host) return;
    host.innerHTML = "";
    state.rendered = {};
    state.observer.disconnect();
    state.observer = makeObserver();
    buildPages();
    if (zoomChanged) refreshStatus("🔍 জুম পরিবর্তন হচ্ছে…");
  }

  function zoom(delta) {
    var next = Math.min(Math.max(state.scale * (delta > 0 ? 1.25 : 0.8), 0.25), 3.5);
    if (Math.abs(next - state.scale) < 0.001) return;
    state.scale = next;
    state.autoFit = false;
    document.getElementById("pdf-zoomval").textContent = zoomLabel();
    rebuild(true);
  }

  /** On narrow screens shrink (never enlarge past 100%) so the page fits the
   *  available width instead of overflowing off-screen. Desktop keeps 100%. */
  function fitToWidth() {
    if (!state.page1Width) return;
    var wrap = document.getElementById("pdfwrap");
    var avail = (wrap ? wrap.clientWidth : window.innerWidth) - 20;
    if (avail <= 0) return;
    var fit = Math.min(avail / state.page1Width, PDF_TO_CSS);
    fit = Math.max(fit, 0.25);
    if (state.autoFit && Math.abs(fit - state.scale) > 0.01) {
      state.scale = fit;
      document.getElementById("pdf-zoomval").textContent = zoomLabel();
    }
  }

  /* ---------------- normal (plain) vs highlight view ----------------
   * "সাধারণ ভিউ" আগে ব্রাউজারের নিজস্ব রিডারে নতুন ট্যাবে খুলত — কিন্তু
   * মোবাইল ব্রাউজারে (বিশেষত Android Chrome) ইনলাইন PDF ভিউ নেই বলে ফাইলটি
   * ডাউনলোড হয়ে যেত। তাই এখন সাধারণ ভিউ = একই পেজে pdf.js রেন্ডার, শুধু
   * হাইলাইট ওভারলে/টুলবার বন্ধ। এতে সব প্ল্যাটফর্মে ফাইল "খোলে", ডাউনলোড নয়। */
  function setPlain(on) {
    state.annotateMode = !on;
    var wrap = document.getElementById("pdfwrap");
    if (wrap) wrap.classList.toggle("plain", on);
    var nb = document.getElementById("pdf-native-btn");
    var ab = document.getElementById("pdf-annotated-btn");
    if (nb) nb.style.display = on ? "none" : "inline-flex";
    if (ab) ab.style.display = on ? "inline-flex" : "none";
    var hint = document.getElementById("hl-hint");
    if (hint) hint.style.display = on ? "none" : "";
    if (on) {
      hideToolbar();
      clearSelGhosts();
      try { document.getSelection().removeAllRanges(); } catch (e) { /* ignore */ }
    }
  }

  /* ---------------- boot ---------------- */
  function start(cfg) {
    // The PDF reader page never calls BCSAnnotator.attach() — inject the
    // annotator CSS (floating toolbar, status chip, popup) right away.
    if (window.BCSAnnotator && window.BCSAnnotator.ensureCss) {
      window.BCSAnnotator.ensureCss(document);
    }
    state.lib = window.BCSPdfLib;
    state.docId = cfg.docId;
    state.fileUrl = cfg.fileUrl;
    state.statusEl = cfg.statusEl || null;
    state.lib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";

    document.addEventListener("mousedown", function (e) {
      state.dragging = true;
      var t = e.target;
      var onUi = t && t.closest && (t.closest(".bcs-ann-tb") || t.closest(".bcs-ann-pop"));
      if (!onUi) { hideToolbar(); hidePop(); }
    }, true);
    document.addEventListener("mouseup", function () {
      state.dragging = false;
      setTimeout(function () { updateSelGhosts(); maybeShowToolbar(); }, 10);
    });
    document.addEventListener("touchend", function () {
      state.dragging = false;
      setTimeout(function () { updateSelGhosts(); maybeShowToolbar(); }, 10);
    });
    document.addEventListener("selectionchange", function () {
      if (state.dragging) { updateSelGhosts(); return; }
      clearTimeout(state._selT);
      state._selT = setTimeout(function () { updateSelGhosts(); maybeShowToolbar(); }, 120);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { hideToolbar(); hidePop(); }
    });
    document.addEventListener("click", altClickRemove, true);
    document.addEventListener("click", overlayClick, true);
    document.addEventListener("scroll", hideToolbar, true);
    window.addEventListener("pagehide", flushBeacon);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flushBeacon();
    });
    document.getElementById("pdf-zoom-in").addEventListener("click", function () { zoom(1); });
    document.getElementById("pdf-zoom-out").addEventListener("click", function () { zoom(-1); });
    // 📄 = সাধারণ ভিউ (ইন-অ্যাপ, হাইলাইট ছাড়া) · 🖍️ = হাইলাইট ভিউ
    document.getElementById("pdf-native-btn").addEventListener("click", function () { setPlain(true); });
    document.getElementById("pdf-annotated-btn").addEventListener("click", function () { setPlain(false); });
    // ⧉ = নতুন ট্যাবে PDF খুলুন (ডাউনলোড নয়)।
    //   আগে কাঁচা ফাইল-লিংক (/file) খোলা হতো — ব্রাউজার সেটা ডাউনলোড করে ফেলত
    //   (ডেস্কটপে), আর মোবাইলে Google gview (ফাঁকা পেজ) খোলা হতো।
    //   এখন ব্রাউজারের ক্ষমতা দেখে সিদ্ধান্ত হয় (navigator.pdfViewerEnabled):
    //   • নিজস্ব PDF রিডার আছে (ডেস্কটপ Chrome/Edge/Firefox/Safari, iOS Safari):
    //     লোড হওয়া PDF-এর বাইট থেকেই application/pdf Blob বানিয়ে নতুন ট্যাবে খোলা
    //     হয় — সার্ভারের হেডারের উপর নির্ভরতা নেই, তাই ডাউনলোড হয় না।
    //   • নিজস্ব রিডার নেই (Android Chrome, বা ব্রাউজারে "PDF ডাউনলোড করুন"
    //     সেটিং চালু): অ্যাপের নিজস্ব pdf.js ফুল-স্ক্রিন রিডার নতুন ট্যাবে খোলে।
    var nt = document.getElementById("pdf-newtab-btn");
    if (nt) nt.addEventListener("click", function () {
      // হাইলাইট-ছাড়া ক্লিন রিডার (অ্যাপের হাইলাইট ভিউ নয়) — /reader রুট
      var plainUrl = "/api/documents/" + encodeURIComponent(state.docId) + "/reader";
      var canNative = typeof navigator.pdfViewerEnabled === "boolean"
        ? navigator.pdfViewerEnabled
        : !/Android|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (!canNative) {
        window.open(plainUrl, "_blank");
        return;
      }

      // ক্লিকের মুহূর্তেই ট্যাব খুলতে হয় (নইলে পপআপ-ব্লকার আটকায়), পরে সেটিতে PDF বসানো হয়।
      var w = window.open("", "_blank");
      if (!w) {
        refreshStatus("⚠️ নতুন ট্যাব ব্লক হয়েছে — ব্রাউজারের পপআপ অনুমতি দিন", "err");
        return;
      }
      try {
        w.document.title = "PDF লোড হচ্ছে…";
        w.document.body.style.cssText = "margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif;background:#525659;color:#fff";
        w.document.body.textContent = "⏳ পিডিএফ লোড হচ্ছে…";
      } catch (e) { /* ignore */ }

      function showBlob(bytes) {
        var blob = new Blob([bytes], { type: "application/pdf" });
        w.location.replace(URL.createObjectURL(blob));
      }
      function fallbackToReader() {
        try { w.location.replace(plainUrl); } catch (e) { /* ignore */ }
      }

      var pending = state.doc && state.doc.getData
        ? state.doc.getData()
        : fetch(state.fileUrl, { credentials: "same-origin" }).then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.arrayBuffer();
          });
      Promise.resolve(pending).then(showBlob).catch(function (err) {
        console.error("open in new tab failed", err);
        fallbackToReader();
      });
    });
    // URL-এ ?plain=1 থাকলে শুরু থেকেই সাধারণ ভিউ
    if (cfg.plain) setPlain(true);

    // Browser zoom (Ctrl+ / Ctrl−) changes devicePixelRatio AFTER the canvases
    // were rasterised — the old bitmaps then get upscaled and the text goes
    // blurry (the native iframe view re-rasterises, so it stays crisp).
    // Re-render the pages whenever the pixel density changes.
    var lastDpr = window.devicePixelRatio || 1;
    window.addEventListener("resize", function () {
      var d = window.devicePixelRatio || 1;
      var dprChanged = Math.abs(d - lastDpr) >= 0.01;
      lastDpr = d;
      clearTimeout(state._rzT);
      state._rzT = setTimeout(function () {
        if (!state.doc) return;
        if (state.autoFit) fitToWidth();
        rebuild(dprChanged);
      }, 250);
    });

    state.observer = makeObserver();
    refreshStatus("⏳ পিডিএফ লোড হচ্ছে…");

    state.lib
      .getDocument({ url: cfg.fileUrl, standardFontDataUrl: "/pdfjs/standard_fonts/" })
      .promise.then(function (doc) {
        state.doc = doc;
        state.numPages = doc.numPages;
        doc.getPage(1).then(function (p1) {
          state.page1Width = p1.getViewport({ scale: 1 }).width;
          fitToWidth();
          buildPages();
          refreshStatus();
        });
      })
      .catch(function (err) {
        console.error("pdf load error", err);
        refreshStatus("⚠️ পিডিএফ লোড করা যায়নি — সাধারণ ভিউতে দেখুন", "err");
        var wrap = document.getElementById("pdfwrap");
        if (wrap) {
          wrap.innerHTML = '<div class="pdfload-err">এই পিডিএফটি হাইলাইট ভিউতে খোলা যায়নি। <button type="button" class="bcs-loadbtn" onclick="document.getElementById(\'pdf-native-btn\').click()">সাধারণ ভিউতে খুলুন →</button></div>';
        }
      });

    // load stored marks
    fetch(state.api + "?kind=document&targetId=" + encodeURIComponent(cfg.docId))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (Array.isArray(d && d.payload)) state.payload = d.payload;
        refreshStatus();
        // pages that finished rendering before the marks arrived:
        var host = document.getElementById("pdfpages");
        if (!host) return;
        var pages = host.querySelectorAll(".pdfpage");
        for (var i = 0; i < pages.length; i++) {
          var n = parseInt(pages[i].getAttribute("data-page"), 10);
          if (state.rendered[n]) applyMarksForPage(pages[i], n);
        }
      })
      .catch(function () { /* marks simply unavailable */ });
  }

  window.BCSPdfReader = { start: start };
})();
