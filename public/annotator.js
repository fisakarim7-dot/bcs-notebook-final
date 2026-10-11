/*
 * BCS Tree Notebook — Annotated Reader runtime (non-destructive)
 * ------------------------------------------------------------------
 * Marks (highlight / bold / italic / font color) are stored in the database,
 * never in the file. At view time each mark is re-applied by wrapping the
 * matching text in <span class="bcs-ann" data-ann="ID"> elements. Wrapping
 * adds NO text characters, so the flattened document text stays identical —
 * marks can overlap, be erased and re-applied without ever touching the
 * original HTML/TXT content or its formatting.
 *
 * Usage (parent page):
 *   BCSAnnotator.attach({
 *     doc: iframeEl.contentDocument,  // document owning the content
 *     root: contentElement,           // element holding annotatable text
 *     kind: "document" | "note-item",
 *     targetId: "…",
 *     frameEl: iframeEl | null,       // for coordinate mapping into host page
 *     statusEl: HTMLElement | null,   // small chip that shows status
 *     styleMarks: true                // false → highlight-only toolbar
 *   });
 */
(function () {
  "use strict";

  var HIGHLIGHTS = ["#fde68a", "#bbf7d0", "#fbcfe8", "#fed7aa", "#a5f3fc"];
  var TEXT_COLORS = ["#b91c1c", "#15803d", "#7c3aed", "#c2410c", "#0f766e"];
  var CTX = 60; // context chars kept around a mark

  var CSS = [
    ".bcs-ann{box-decoration-break:clone;-webkit-box-decoration-break:clone}",
    ".bcs-ann-tb{position:fixed;z-index:2147483000;display:flex;align-items:center;gap:4px;background:#fff;border:1px solid #e2e0da;border-radius:10px;padding:5px 7px;box-shadow:0 8px 30px rgba(0,0,0,.18);font-family:'Kalpurush',system-ui,sans-serif;font-size:13px;user-select:none;-webkit-user-select:none}",
    ".bcs-ann-tb .bcs-sep{width:1px;height:18px;background:#e2e0da;margin:0 2px}",
    ".bcs-ann-tb button{border:1px solid transparent;background:none;cursor:pointer;border-radius:7px;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;padding:0;font-family:inherit}",
    ".bcs-ann-tb button:hover{background:#f1efe9}",
    ".bcs-ann-tb .sw{width:20px;height:20px;border-radius:6px;border:1px solid rgba(0,0,0,.15)}",
    ".bcs-ann-tb .sw:hover{transform:scale(1.12)}",
    ".bcs-ann-tb .b{font-weight:800;font-size:13px;color:#1f2937}",
    ".bcs-ann-tb .i{font-style:italic;font-family:Georgia,serif;font-size:14px;color:#1f2937}",
    ".bcs-ann-tb .er{width:auto;padding:0 8px;font-weight:700;font-size:12px;color:#b91c1c}",
    ".bcs-ann-tb .er:hover{background:#fee2e2}",
    ".bcs-ann-tb .lbl{font-size:10.5px;color:#78716c;padding:0 2px;white-space:nowrap}",
    ".bcs-ann-pop{position:fixed;z-index:2147483000;display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e2e0da;border-radius:10px;padding:7px 10px;box-shadow:0 8px 30px rgba(0,0,0,.18);font-family:'Kalpurush',system-ui,sans-serif;font-size:12.5px;white-space:nowrap}",
    ".bcs-ann-pop .dot{width:13px;height:13px;border-radius:4px;border:1px solid rgba(0,0,0,.2);flex:none}",
    ".bcs-ann-pop .lbl{color:#44403c;font-weight:600}",
    ".bcs-ann-pop button{border:none;border-radius:7px;padding:5px 10px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:700}",
    ".bcs-ann-pop .rm{background:#fee2e2;color:#b91c1c}",
    ".bcs-ann-pop .rm:hover{background:#fecaca}",
    ".bcs-ann-pop .cl{background:#f1efe9;color:#44403c}",
    ".bcs-ann-status{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:#57534e;background:#f1efe9;border:1px solid #e2e0da;border-radius:999px;padding:4px 10px;white-space:nowrap;font-family:'Kalpurush',system-ui,sans-serif}",
    ".bcs-ann-status.warn{background:#fef3c7;border-color:#fcd34d;color:#92400e}",
    ".bcs-ann-status.err{background:#fee2e2;border-color:#fca5a5;color:#b91c1c}"
  ].join("\n");

  /* ------------------------------------------------------------------ */
  /* helpers                                                             */
  /* ------------------------------------------------------------------ */

  function genId() {
    return (
      Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
    );
  }

  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEMPLATE: 1, TEXTAREA: 1 };

  /** Flatten all text of `root` into one string + segment index + node map. */
  function flatten(root) {
    var full = "";
    var segs = [];
    var map = new Map();
    var w = root.ownerDocument.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (t) {
          var p = t.parentElement;
          if (!p) return NodeFilter.FILTER_REJECT;
          if (SKIP_TAGS[p.tagName]) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );
    var n;
    while ((n = w.nextNode())) {
      var s = full.length;
      full += n.nodeValue;
      segs.push({ node: n, start: s, end: full.length });
      map.set(n, segs.length - 1);
    }
    return { full: full, segs: segs, map: map };
  }

  function textFilter(t) {
    var p = t.parentElement;
    if (!p || SKIP_TAGS[p.tagName]) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  }

  function firstTextIn(el) {
    if (el.nodeType === 3) return el;
    var w = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: textFilter,
    });
    return w.nextNode();
  }

  function lastTextIn(el) {
    if (el.nodeType === 3) return el;
    var w = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: textFilter,
    });
    var last = null, n;
    while ((n = w.nextNode())) last = n;
    return last;
  }

  /** Map a selection boundary (node, offset) to an offset in the flattened string. */
  function boundaryToOffset(fl, node, offset, isStart) {
    if (node.nodeType === 3) {
      var idx = fl.map.get(node);
      if (idx == null) return -1;
      return fl.segs[idx].start + Math.min(offset, node.nodeValue.length);
    }
    if (node.nodeType !== 1) return -1;
    var child = isStart ? node.childNodes[offset] : node.childNodes[offset - 1];
    if (child) {
      var t = isStart ? firstTextIn(child) : lastTextIn(child);
      if (t) {
        var ti = fl.map.get(t);
        if (ti != null) return isStart ? fl.segs[ti].start : fl.segs[ti].end;
      }
      // child has no text (e.g. <img>) → nudge to nearest text sibling
      var kids = node.childNodes;
      if (isStart) {
        for (var j = offset - 1; j >= 0; j--) {
          var pt = lastTextIn(kids[j]);
          if (pt) { var pi = fl.map.get(pt); if (pi != null) return fl.segs[pi].end; }
        }
      } else {
        for (var k2 = offset; k2 < kids.length; k2++) {
          var nt = firstTextIn(kids[k2]);
          if (nt) { var ni = fl.map.get(nt); if (ni != null) return fl.segs[ni].start; }
        }
      }
    }
    var ct = isStart ? firstTextIn(node) : lastTextIn(node);
    if (ct) {
      var ci = fl.map.get(ct);
      if (ci != null) return isStart ? fl.segs[ci].start : fl.segs[ci].end;
    }
    return -1;
  }

  /** Split + wrap the given [start,end) offsets of the current DOM. */
  function wrapRange(root, start, end, ann) {
    var fl = flatten(root);
    var slices = [];
    for (var i = 0; i < fl.segs.length; i++) {
      var seg = fl.segs[i];
      if (seg.end <= start) continue;
      if (seg.start >= end) break;
      slices.push({
        node: seg.node,
        from: Math.max(seg.start, start),
        to: Math.min(seg.end, end),
        segStart: seg.start,
        segEnd: seg.end,
      });
    }
    var doc = root.ownerDocument;
    var first = null;
    for (var k = 0; k < slices.length; k++) {
      var sl = slices[k];
      var node = sl.node;
      if (sl.to < sl.segEnd) node.splitText(sl.to - sl.segStart);
      if (sl.from > sl.segStart) node = node.splitText(sl.from - sl.segStart);
      var span = doc.createElement("span");
      span.className = "bcs-ann";
      span.setAttribute("data-ann", ann.id);
      applyStyle(span, ann);
      node.parentNode.insertBefore(span, node);
      span.appendChild(node);
      if (!first) first = span;
    }
    return first;
  }

  function applyStyle(span, ann) {
    if (ann.type === "highlight") {
      span.style.backgroundColor = ann.color || "#fde68a";
      span.style.borderRadius = "2px";
      span.style.padding = "0 1px";
      span.style.color = "inherit";
    } else if (ann.type === "bold") {
      span.style.fontWeight = "700";
    } else if (ann.type === "italic") {
      span.style.fontStyle = "italic";
    } else if (ann.type === "color") {
      span.style.color = ann.color || "#b91c1c";
    }
  }

  /** Remove all wrappers of one annotation id (merge text back). */
  function unwrapById(root, annId) {
    var doc = root.ownerDocument;
    var list = root.querySelectorAll('[data-ann="' + annId + '"]');
    for (var i = 0; i < list.length; i++) {
      var span = list[i];
      var parent = span.parentNode;
      if (!parent) continue;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      if (parent.normalize) parent.normalize();
    }
    void doc;
  }

  /**
   * Find the best [start,end) for a stored mark.
   * Prefers matches whose prefix+suffix context matches, then falls back.
   */
  function findMark(fl, ann) {
    var text = ann.text;
    if (!text) return null;
    var full = fl.full;
    var matches = [];
    var idx = full.indexOf(text);
    var guard = 0;
    while (idx !== -1 && guard < 50000) {
      matches.push(idx);
      idx = full.indexOf(text, idx + 1);
      guard++;
    }
    if (!matches.length) return null;

    function score(pos) {
      var s = 0;
      if (
        ann.prefix && pos >= ann.prefix.length &&
        full.startsWith(ann.prefix, pos - ann.prefix.length)
      ) s++;
      if (ann.suffix && full.startsWith(ann.suffix, pos + text.length)) s++;
      return s;
    }

    var best = null;
    for (var lvl = 2; lvl >= 0; lvl--) {
      var group = [];
      for (var i = 0; i < matches.length; i++) {
        if (score(matches[i]) === lvl) group.push(matches[i]);
      }
      if (group.length) {
        best = group[Math.min(ann.occurrence || 0, group.length - 1)];
        break;
      }
    }
    if (best == null) return null;
    return { start: best, end: best + text.length };
  }

  /* ------------------------------------------------------------------ */
  /* attach                                                              */
  /* ------------------------------------------------------------------ */

  function injectCss(doc) {
    if (doc.getElementById("bcs-ann-style")) return;
    var st = doc.createElement("style");
    st.id = "bcs-ann-style";
    st.textContent = CSS;
    doc.head.appendChild(st);
  }

  function attach(opts) {
    var doc = opts.doc;
    var root = opts.root;
    var kind = opts.kind;
    var targetId = opts.targetId;
    var hostDoc = opts.hostDoc || doc;
    var frameEl = opts.frameEl || null; // iframe element in hostDoc, if any
    var statusEl = opts.statusEl || null;
    var styleMarks = opts.styleMarks !== false;
    var api = "/api/annotations";

    injectCss(hostDoc);
    if (doc !== hostDoc) injectCss(doc); // sandboxed content iframes need the span CSS too

    var payload = [];
    var dirty = false;
    var saveTimer = null;
    var missed = 0;
    var applied = 0;

    /* ---------------- status chip ---------------- */
    function setStatus(text, cls) {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.className = "bcs-ann-status" + (cls ? " " + cls : "");
      statusEl.style.display = text ? "inline-flex" : "none";
    }
    function refreshStatus(msg, cls) {
      if (msg) {
        setStatus(msg, cls);
        clearTimeout(refreshStatus._t);
        refreshStatus._t = setTimeout(function () {
          setStatus(
            "🖍️ " + toBn(applied) + " টি দাগ" + (missed ? " · ⚠️ " + toBn(missed) + " টি মেলেনি" : ""),
            missed ? "warn" : ""
          );
        }, 1600);
      } else {
        setStatus(
          "🖍️ " + toBn(applied) + " টি দাগ" + (missed ? " · ⚠️ " + toBn(missed) + " টি মেলেনি" : ""),
          missed ? "warn" : ""
        );
      }
    }
    function toBn(n) {
      var d = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];
      return String(n).replace(/[0-9]/g, function (c) { return d[+c]; });
    }

    /* ---------------- persistence ---------------- */
    function scheduleSave() {
      dirty = true;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNow, 700);
    }
    function saveNow() {
      if (!dirty) return;
      dirty = false;
      refreshStatus("💾 সেভ হচ্ছে…");
      fetch(api, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: kind, targetId: targetId, payload: payload }),
      })
        .then(function (r) {
          if (!r.ok) throw new Error("save failed");
          refreshStatus("✓ সংরক্ষিত");
        })
        .catch(function () {
          dirty = true;
          refreshStatus("⚠️ সেভ করা যায়নি", "err");
        });
    }
    function flushBeacon() {
      if (!dirty) return;
      dirty = false;
      try {
        var blob = new Blob(
          [JSON.stringify({ kind: kind, targetId: targetId, payload: payload })],
          { type: "application/json" }
        );
        navigator.sendBeacon(api, blob);
      } catch (e) { /* best effort */ }
    }
    window.addEventListener("pagehide", flushBeacon);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flushBeacon();
    });

    /* ---------------- applying ---------------- */
    function applyAll() {
      missed = 0;
      applied = 0;
      var fl = flatten(root);
      for (var i = 0; i < payload.length; i++) {
        var ann = payload[i];
        var range = findMark(fl, ann);
        if (!range) { missed++; continue; }
        wrapRange(root, range.start, range.end, ann);
        applied++;
      }
      refreshStatus();
    }

    /* ---------------- creating from selection ---------------- */
    function currentOffsets() {
      var sel = doc.getSelection();
      if (!sel || sel.rangeCount === 0) return null;
      var r = sel.getRangeAt(0);
      if (r.collapsed) return null;
      if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
      var fl = flatten(root);
      var s = boundaryToOffset(fl, r.startContainer, r.startOffset, true);
      var e = boundaryToOffset(fl, r.endContainer, r.endOffset, false);
      if (s == null || e == null || s < 0 || e < 0 || e <= s) return null;
      return { start: s, end: e, full: fl.full };
    }

    function makeAnn(type, color) {
      var cur = currentOffsets();
      if (!cur) return;
      var text = cur.full.slice(cur.start, cur.end);
      if (!text.trim()) { hideToolbar(); return; }
      if (text.length > 5000) {
        refreshStatus("⚠️ অংশটি খুব বড় — ৫০০০ অক্ষরের কম দাগ দিন", "err");
        return;
      }
      var ann = {
        id: genId(),
        type: type,
        color: color,
        text: text,
        prefix: cur.full.slice(Math.max(0, cur.start - CTX), cur.start),
        suffix: cur.full.slice(cur.end, Math.min(cur.full.length, cur.end + CTX)),
        occurrence: 0,
      };
      // occurrence = index of this match among matches of the same text
      var from = 0, occ = 0, p;
      while ((p = cur.full.indexOf(text, from)) !== -1 && p < cur.start) {
        occ++; from = p + 1;
        if (occ > 100000) break;
      }
      ann.occurrence = occ;
      payload.push(ann);
      var fl = flatten(root);
      wrapRange(root, cur.start, cur.end, ann);
      applied++;
      refreshStatus();
      scheduleSave();
      hideToolbar();
      try { doc.getSelection().removeAllRanges(); } catch (e) { /* ignore */ }
    }

    /* ---------------- erasing ---------------- */
    function eraseSelection() {
      var cur = currentOffsets();
      hideToolbar();
      if (!cur) return;
      var fl = flatten(root);
      var removed = 0;
      for (var i = payload.length - 1; i >= 0; i--) {
        var range = findMark(fl, payload[i]);
        if (range && range.start < cur.end && range.end > cur.start) {
          unwrapById(root, payload[i].id);
          payload.splice(i, 1);
          removed++;
        }
      }
      if (removed) {
        applied = Math.max(0, applied - removed);
        refreshStatus();
        scheduleSave();
      } else {
        refreshStatus("এই অংশে কোনো দাগ নেই", "warn");
      }
      try { doc.getSelection().removeAllRanges(); } catch (e) { /* ignore */ }
    }

    /* ---------------- toolbar ---------------- */
    var tb = hostDoc.createElement("div");
    tb.className = "bcs-ann-tb";
    tb.setAttribute("role", "toolbar");
    tb.setAttribute("aria-label", "দাগ দেওয়ার টুলবার");
    tb.style.display = "none";
    var html = '<span class="lbl">দাগ</span>';
    for (var h = 0; h < HIGHLIGHTS.length; h++) {
      html += '<button type="button" class="sw" data-h="' + HIGHLIGHTS[h] + '" style="background:' + HIGHLIGHTS[h] + '" title="হাইলাইট" aria-label="হাইলাইট"></button>';
    }
    if (styleMarks) {
      html += '<span class="bcs-sep"></span>';
      html += '<button type="button" class="b" data-s="bold" title="বোল্ড" aria-label="বোল্ড">B</button>';
      html += '<button type="button" class="i" data-s="italic" title="ইটালিক" aria-label="ইটালিক">I</button>';
      html += '<span class="bcs-sep"></span>';
      for (var c = 0; c < TEXT_COLORS.length; c++) {
        html += '<button type="button" class="sw" data-c="' + TEXT_COLORS[c] + '" style="background:' + TEXT_COLORS[c] + '" title="লেখার রং" aria-label="লেখার রং"></button>';
      }
    }
    html += '<span class="bcs-sep"></span>';
    html += '<button type="button" class="er" data-act="erase" title="নির্বাচিত অংশের দাগ মুছুন">মুছুন</button>';
    tb.innerHTML = html;
    hostDoc.body.appendChild(tb);

    tb.addEventListener("mousedown", function (e) { e.preventDefault(); }); // keep selection
    tb.addEventListener("click", function (e) {
      var b = e.target.closest ? e.target.closest("button") : null;
      if (!b) return;
      if (b.dataset.h) makeAnn("highlight", b.dataset.h);
      else if (b.dataset.s) makeAnn(b.dataset.s, undefined);
      else if (b.dataset.c) makeAnn("color", b.dataset.c);
      else if (b.dataset.act === "erase") eraseSelection();
    });

    function positionToolbar() {
      var sel = doc.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      var r = sel.getRangeAt(0).getBoundingClientRect();
      var host = hostDoc.defaultView;
      var top = r.top, left = r.left + r.width / 2;
      if (frameEl) {
        var fr = frameEl.getBoundingClientRect();
        top += fr.top;
        left += fr.left;
      }
      tb.style.display = "flex";
      var tw = tb.offsetWidth, th = tb.offsetHeight;
      var t = top - th - 8;
      if (t < 8) t = top + r.height + 8;
      var l = Math.min(Math.max(8, left - tw / 2), (host.innerWidth || 800) - tw - 8);
      tb.style.top = t + "px";
      tb.style.left = l + "px";
    }
    function hideToolbar() {
      tb.style.display = "none";
    }
    function maybeShowToolbar() {
      var cur = currentOffsets();
      if (!cur || !cur.full.slice(cur.start, cur.end).trim()) {
        hideToolbar();
        return;
      }
      positionToolbar();
    }

    var selTimer = null;
    doc.addEventListener("selectionchange", function () {
      clearTimeout(selTimer);
      selTimer = setTimeout(maybeShowToolbar, 120);
    });
    doc.addEventListener("mouseup", function () { setTimeout(maybeShowToolbar, 10); });
    doc.addEventListener("touchend", function () { setTimeout(maybeShowToolbar, 10); });
    doc.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { hideToolbar(); hidePop(); }
    });
    (hostDoc.defaultView || window).addEventListener("scroll", hideToolbar, true);
    doc.addEventListener("scroll", hideToolbar, true);

    /* ---------------- click popup (remove single mark) ---------------- */
    var pop = null;
    var popAnn = null;
    function hidePop() {
      if (pop) { pop.remove(); pop = null; popAnn = null; }
    }
    doc.addEventListener("click", function (e) {
      if (pop) { hidePop(); return; }
      var t = e.target;
      if (!t || !t.closest) return;
      if (doc.getSelection() && !doc.getSelection().isCollapsed) return;
      var span = t.closest("[data-ann]");
      if (!span || !root.contains(span)) return;
      var id = span.getAttribute("data-ann");
      var ann = null;
      for (var i = 0; i < payload.length; i++) if (payload[i].id === id) ann = payload[i];
      if (!ann) return;
      popAnn = ann;
      pop = hostDoc.createElement("div");
      pop.className = "bcs-ann-pop";
      var typeName = ann.type === "highlight" ? "হাইলাইট" : ann.type === "bold" ? "বোল্ড" : ann.type === "italic" ? "ইটালিক" : "রং";
      pop.innerHTML =
        '<span class="dot" style="background:' + (ann.color || (ann.type === "bold" ? "#1f2937" : "#a8a29e")) + '"></span>' +
        '<span class="lbl">' + typeName + "</span>" +
        '<button type="button" class="rm">মুছে ফেলুন</button>' +
        '<button type="button" class="cl">বাতিল</button>';
      hostDoc.body.appendChild(pop);
      var top = e.clientY, left = e.clientX;
      if (frameEl) {
        var fr = frameEl.getBoundingClientRect();
        top += fr.top; left += fr.left;
      }
      var pw = pop.offsetWidth, ph = pop.offsetHeight;
      var host = hostDoc.defaultView;
      pop.style.top = Math.min(Math.max(8, top + 10), (host.innerHeight || 800) - ph - 8) + "px";
      pop.style.left = Math.min(Math.max(8, left - pw / 2), (host.innerWidth || 800) - pw - 8) + "px";
      pop.querySelector(".rm").addEventListener("click", function () {
        unwrapById(root, popAnn.id);
        payload = payload.filter(function (p) { return p.id !== popAnn.id; });
        applied = Math.max(0, applied - 1);
        refreshStatus();
        scheduleSave();
        hidePop();
      });
      pop.querySelector(".cl").addEventListener("click", hidePop);
    });

    /* ---------------- boot ---------------- */
    setStatus("⏳ দাগ লোড হচ্ছে…");
    fetch(api + "?kind=" + encodeURIComponent(kind) + "&targetId=" + encodeURIComponent(targetId))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        payload = Array.isArray(d && d.payload) ? d.payload : [];
        applyAll();
      })
      .catch(function () {
        setStatus("⚠️ দাগ লোড করা যায়নি", "err");
      });

    return {
      hideToolbar: hideToolbar,
      hidePop: hidePop,
      saveNow: saveNow,
    };
  }

  window.BCSAnnotator = {
    attach: attach,
    // Exposed so the PDF reader (which never calls attach()) can inject the
    // toolbar/status CSS itself — without this the floating highlight
    // toolbar rendered UNSTYLED (position:static) and was effectively
    // invisible on PDF pages.
    ensureCss: injectCss,
    flatten: flatten,
    findMark: findMark,
    boundaryToOffset: boundaryToOffset,
    firstTextIn: firstTextIn,
    lastTextIn: lastTextIn,
  };
})();
