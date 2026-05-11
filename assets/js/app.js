/* Interactive features for the BG site: bookmarks, highlights, pen, section-collapse,
   sidebar-collapse, expand-all/collapse-all. Loaded with defer; safe to run after parse. */
(function () {
    "use strict";

    var S = window.FC_STATE || {};
    var html = document.documentElement;
    var toRoot = window.FC_TO_ROOT || "";

    function save(key, data) {
        try { localStorage.setItem(key, JSON.stringify(data)); } catch (e) {}
    }
    function load(key) {
        try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; }
        catch (e) { return {}; }
    }

    // -------------------------------------------------------------------------
    // Section visibility (Display panel checkboxes) — wires up controls; the
    // early-apply pass in toggle.js already set the data-hide-* attributes.
    // -------------------------------------------------------------------------
    function wireSectionVisibility() {
        var cbs = document.querySelectorAll(".fc-sb-grid input[type='checkbox'][data-section]");
        cbs.forEach(function (cb) {
            var s = cb.dataset.section;
            cb.checked = !S.isHidden(s);
            cb.addEventListener("change", function () {
                if (cb.checked) {
                    if (S.DEFAULT_HIDDEN[s]) S.hidden[s] = 0;
                    else delete S.hidden[s];
                    html.removeAttribute("data-hide-" + s);
                } else {
                    S.hidden[s] = 1;
                    html.setAttribute("data-hide-" + s, "1");
                }
                save(S.HIDDEN_KEY, S.hidden);
            });
        });
    }

    // -------------------------------------------------------------------------
    // Per-section expand/collapse (click section label or its chevron).
    // Stored per-section name in localStorage; applies across pages.
    // -------------------------------------------------------------------------
    function setSectionCollapsed(secName, collapsed) {
        if (collapsed) {
            S.collapsed[secName] = 1;
            html.setAttribute("data-collapsed-" + secName, "1");
        } else {
            delete S.collapsed[secName];
            html.removeAttribute("data-collapsed-" + secName);
        }
        save(S.COLLAPSED_KEY, S.collapsed);
    }

    function wireSectionCollapse() {
        // Section labels become click targets for collapse/expand.
        document.addEventListener("click", function (e) {
            var label = e.target.closest(".fc-section-label");
            if (!label) return;
            var sec = label.closest("[data-sec]");
            if (!sec) return;
            var name = sec.dataset.sec;
            if (!name) return;
            e.preventDefault();
            setSectionCollapsed(name, !S.collapsed[name]);
        });

        // Expand all / Collapse all buttons in the Display panel.
        document.querySelectorAll(".fc-sb-actions button[data-action]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var act = btn.dataset.action;
                if (act === "collapse-all") {
                    S.SECTIONS.forEach(function (s) { setSectionCollapsed(s, true); });
                } else if (act === "expand-all") {
                    S.SECTIONS.forEach(function (s) { setSectionCollapsed(s, false); });
                }
            });
        });
    }

    // -------------------------------------------------------------------------
    // Sidebar collapse (left + right). State persisted per side.
    // -------------------------------------------------------------------------
    function wireSidebarCollapse() {
        document.querySelectorAll(".fc-sb-collapse[data-sb]").forEach(function (btn) {
            var side = btn.dataset.sb; // "left" | "right"
            btn.addEventListener("click", function () {
                var key = side;
                if (S.sidebars[key]) {
                    delete S.sidebars[key];
                    html.removeAttribute("data-" + key + "-collapsed");
                } else {
                    S.sidebars[key] = 1;
                    html.setAttribute("data-" + key + "-collapsed", "1");
                }
                save(S.SIDEBAR_KEY, S.sidebars);
            });
        });
    }

    // -------------------------------------------------------------------------
    // Bookmarks: star button on each verse block. Persist a flat map keyed by
    // the verse anchor id (e.g., "bg-1-23") with label + chapter + vlabel so we
    // can rebuild the sidebar list without re-parsing.
    // -------------------------------------------------------------------------
    var BOOKMARKS_KEY = "fc-bookmarks";
    function loadBookmarks() { return load(BOOKMARKS_KEY); }
    function saveBookmarks(b) { save(BOOKMARKS_KEY, b); }

    function bookmarkUrl(entry) {
        return toRoot + "bg/" + entry.chapter + "/" + entry.vlabel + "/";
    }

    function renderBookmarks() {
        var list = document.getElementById("fc-bookmarks-list");
        var count = document.getElementById("fc-bookmarks-count");
        if (!list || !count) return;
        var data = loadBookmarks();
        var keys = Object.keys(data).sort(function (a, b) {
            return (data[a].ts || 0) - (data[b].ts || 0);
        });
        count.textContent = String(keys.length);
        if (!keys.length) {
            list.innerHTML = '<li class="fc-sb-empty">No bookmarks yet — click ☆ on any verse.</li>';
        } else {
            list.innerHTML = keys.map(function (id) {
                var e = data[id];
                return '<li><a href="' + bookmarkUrl(e) + '">' + e.label + '</a>'
                    + ' <button type="button" class="fc-bm-remove" data-bm-remove="' + id + '" title="Remove">×</button></li>';
            }).join("");
        }

        // Reflect bookmark state on verse buttons currently on the page
        document.querySelectorAll(".fc-bookmark-btn[data-bookmark-id]").forEach(function (btn) {
            var id = btn.dataset.bookmarkId;
            var active = !!data[id];
            btn.classList.toggle("active", active);
            btn.textContent = active ? "★" : "☆";
            btn.setAttribute("aria-pressed", active ? "true" : "false");
        });
    }

    function wireBookmarks() {
        document.addEventListener("click", function (e) {
            var btn = e.target.closest(".fc-bookmark-btn[data-bookmark-id]");
            if (btn) {
                var id = btn.dataset.bookmarkId;
                var data = loadBookmarks();
                if (data[id]) {
                    delete data[id];
                } else {
                    data[id] = {
                        ts: Date.now(),
                        label: btn.dataset.bookmarkLabel || id,
                        chapter: parseInt(btn.dataset.bookmarkChapter || "0", 10),
                        vlabel: btn.dataset.bookmarkVlabel || "",
                    };
                }
                saveBookmarks(data);
                renderBookmarks();
                return;
            }
            var rm = e.target.closest("[data-bm-remove]");
            if (rm) {
                var rid = rm.dataset.bmRemove;
                var d2 = loadBookmarks();
                delete d2[rid];
                saveBookmarks(d2);
                renderBookmarks();
            }
        });
        renderBookmarks();
    }

    // -------------------------------------------------------------------------
    // Text highlighting: floating pill near selection with 6 colors. Stored
    // per-page with surrounding context so we can re-find the text on reload.
    // -------------------------------------------------------------------------
    var HL_KEY = "fc-highlights";
    var HL_COLORS = ["yellow", "green", "blue", "pink", "orange", "purple"];

    function loadHighlights() { return load(HL_KEY); }
    function saveHighlights(d) { save(HL_KEY, d); }
    function pageHighlights() {
        var all = loadHighlights();
        return all[location.pathname] || [];
    }
    function setPageHighlights(list) {
        var all = loadHighlights();
        if (list.length) all[location.pathname] = list;
        else delete all[location.pathname];
        saveHighlights(all);
    }

    function ensurePill() {
        var p = document.getElementById("fc-hl-pill");
        if (p) return p;
        p = document.createElement("div");
        p.id = "fc-hl-pill";
        p.innerHTML = HL_COLORS.map(function (c) {
            return '<span class="hl-btn hl-' + c + '" data-hl-color="' + c + '" title="' + c + '"></span>';
        }).join("") + '<span class="hl-btn hl-cancel" data-hl-cancel title="Cancel">×</span>';
        document.body.appendChild(p);
        p.addEventListener("mousedown", function (e) { e.preventDefault(); });
        return p;
    }
    function ensureEraser() {
        var e = document.getElementById("fc-hl-eraser");
        if (e) return e;
        e = document.createElement("div");
        e.id = "fc-hl-eraser";
        e.textContent = "🗑 Remove highlight";
        document.body.appendChild(e);
        e.addEventListener("mousedown", function (ev) { ev.preventDefault(); });
        return e;
    }

    function hidePill() {
        var p = document.getElementById("fc-hl-pill");
        if (p) p.style.display = "none";
    }
    function hideEraser() {
        var e = document.getElementById("fc-hl-eraser");
        if (e) e.style.display = "none";
    }

    var pendingRange = null;

    function showPillAtSelection(sel) {
        var range = sel.getRangeAt(0);
        var rect = range.getBoundingClientRect();
        var pill = ensurePill();
        pill.style.display = "inline-flex";
        var top = window.scrollY + rect.top - pill.offsetHeight - 8;
        if (top < window.scrollY + 6) top = window.scrollY + rect.bottom + 6;
        var left = window.scrollX + rect.left + rect.width / 2 - pill.offsetWidth / 2;
        pill.style.top = top + "px";
        pill.style.left = Math.max(8, left) + "px";
        pendingRange = range.cloneRange();
    }

    // Capture text + surrounding context for re-finding on reload.
    function snapshotForRange(range) {
        var node = range.startContainer;
        if (node.nodeType !== Node.TEXT_NODE) return null;
        if (range.endContainer !== node) return null; // multi-node — skip
        var full = node.textContent;
        var s = range.startOffset;
        var e = range.endOffset;
        if (e <= s) return null;
        return {
            text: full.slice(s, e),
            prefix: full.slice(Math.max(0, s - 40), s),
            suffix: full.slice(e, Math.min(full.length, e + 40)),
        };
    }

    function applyHighlight(range, color, hlId) {
        var span = document.createElement("span");
        span.className = "cr-highlight cr-highlight-" + color;
        span.dataset.hlId = hlId;
        try {
            range.surroundContents(span);
            return true;
        } catch (err) {
            return false;
        }
    }

    function commitHighlight(color) {
        if (!pendingRange) return;
        var snap = snapshotForRange(pendingRange);
        if (!snap) { hidePill(); pendingRange = null; return; }
        var entry = {
            id: "h" + Date.now() + "-" + Math.floor(Math.random() * 1e6),
            color: color, text: snap.text, prefix: snap.prefix, suffix: snap.suffix,
        };
        if (applyHighlight(pendingRange, color, entry.id)) {
            var cur = pageHighlights();
            cur.push(entry);
            setPageHighlights(cur);
        }
        pendingRange = null;
        hidePill();
        var sel = window.getSelection();
        if (sel) sel.removeAllRanges();
    }

    function removeHighlight(span) {
        var id = span.dataset.hlId;
        // Unwrap the span: move children back to parent
        var parent = span.parentNode;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
        parent.normalize();
        if (id) {
            var cur = pageHighlights().filter(function (h) { return h.id !== id; });
            setPageHighlights(cur);
        }
    }

    function reapplyHighlights() {
        var list = pageHighlights();
        if (!list.length) return;
        var main = document.querySelector("main");
        if (!main) return;
        var remaining = [];
        list.forEach(function (h) {
            if (findAndWrap(main, h)) {
                remaining.push(h);
            } else {
                remaining.push(h); // keep in storage even if not found — content may load later
            }
        });
        setPageHighlights(remaining);
    }

    function findAndWrap(root, h) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        var node;
        while ((node = walker.nextNode())) {
            var t = node.textContent;
            var idx = t.indexOf(h.text);
            while (idx !== -1) {
                var before = t.slice(Math.max(0, idx - h.prefix.length), idx);
                var after = t.slice(idx + h.text.length, idx + h.text.length + h.suffix.length);
                var beforeOk = h.prefix.length === 0 || before.endsWith(h.prefix.slice(-before.length || -1));
                var afterOk = h.suffix.length === 0 || after.startsWith(h.suffix.slice(0, after.length || 1));
                if (beforeOk && afterOk) {
                    var range = document.createRange();
                    range.setStart(node, idx);
                    range.setEnd(node, idx + h.text.length);
                    if (applyHighlight(range, h.color, h.id)) return true;
                    break; // span insertion split the text node — restart walker
                }
                idx = t.indexOf(h.text, idx + 1);
            }
        }
        return false;
    }

    function wireHighlights() {
        // Reapply persisted highlights first
        reapplyHighlights();

        // Selection → show pill
        document.addEventListener("mouseup", function (e) {
            // Ignore clicks inside the sidebars/header — only main content
            var main = document.querySelector("main");
            if (!main) return;
            if (!main.contains(e.target)) return;
            setTimeout(function () {
                var sel = window.getSelection();
                if (!sel || sel.isCollapsed) { hidePill(); return; }
                var range = sel.getRangeAt(0);
                if (range.collapsed) { hidePill(); return; }
                // Only allow single text-node selections (simpler & more robust)
                if (range.startContainer.nodeType !== Node.TEXT_NODE
                    || range.endContainer !== range.startContainer) {
                    hidePill();
                    return;
                }
                showPillAtSelection(sel);
            }, 0);
        });

        // Click outside pill → hide
        document.addEventListener("mousedown", function (e) {
            var pill = document.getElementById("fc-hl-pill");
            if (pill && pill.style.display !== "none" && !pill.contains(e.target)) {
                hidePill();
            }
            var eraser = document.getElementById("fc-hl-eraser");
            if (eraser && eraser.style.display !== "none"
                && !eraser.contains(e.target)
                && !(e.target.classList && e.target.classList.contains("cr-highlight"))) {
                hideEraser();
            }
        });

        // Click on pill color
        document.addEventListener("click", function (e) {
            var color = e.target.closest("[data-hl-color]");
            if (color) {
                e.preventDefault();
                commitHighlight(color.dataset.hlColor);
                return;
            }
            if (e.target.closest("[data-hl-cancel]")) {
                hidePill();
                pendingRange = null;
                return;
            }
            // Click on existing highlight → show eraser pill nearby
            var hl = e.target.closest(".cr-highlight");
            if (hl) {
                var er = ensureEraser();
                var r = hl.getBoundingClientRect();
                er.style.display = "block";
                er.style.top = (window.scrollY + r.bottom + 6) + "px";
                er.style.left = (window.scrollX + r.left) + "px";
                er.onclick = function () {
                    removeHighlight(hl);
                    hideEraser();
                };
                return;
            }
        });

        // "Clear highlights (page)" button
        var clearBtn = document.getElementById("fc-clear-highlights");
        if (clearBtn) {
            clearBtn.addEventListener("click", function () {
                document.querySelectorAll(".cr-highlight").forEach(function (sp) {
                    var p = sp.parentNode;
                    while (sp.firstChild) p.insertBefore(sp.firstChild, sp);
                    p.removeChild(sp);
                    p.normalize();
                });
                setPageHighlights([]);
            });
        }
    }

    // -------------------------------------------------------------------------
    // Pen tool: canvas overlay for freehand annotation. Session-only (no save).
    // Strokes use page coordinates; canvas is fixed to viewport; redraw on scroll.
    // -------------------------------------------------------------------------
    var penActive = false;
    var penCanvas = null;
    var penCtx = null;
    var strokes = [];
    var current = null;
    var penColor = "#E53935";

    function ensurePenCanvas() {
        if (penCanvas) return penCanvas;
        penCanvas = document.createElement("canvas");
        penCanvas.id = "fc-pen-canvas";
        document.body.appendChild(penCanvas);
        penCtx = penCanvas.getContext("2d");
        resizePen();
        window.addEventListener("resize", function () { resizePen(); redrawPen(); });
        window.addEventListener("scroll", redrawPen, { passive: true });
        penCanvas.addEventListener("pointerdown", penDown);
        penCanvas.addEventListener("pointermove", penMove);
        window.addEventListener("pointerup", penUp);
        return penCanvas;
    }

    function resizePen() {
        if (!penCanvas) return;
        var dpr = window.devicePixelRatio || 1;
        penCanvas.width = window.innerWidth * dpr;
        penCanvas.height = window.innerHeight * dpr;
        penCanvas.style.width = window.innerWidth + "px";
        penCanvas.style.height = window.innerHeight + "px";
        penCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        penCtx.lineCap = "round";
        penCtx.lineJoin = "round";
    }

    function penDown(e) {
        if (!penActive) return;
        e.preventDefault();
        penCanvas.setPointerCapture(e.pointerId);
        current = {
            color: penColor,
            width: 3,
            points: [{ x: e.clientX, y: e.clientY + window.scrollY }],
        };
    }
    function penMove(e) {
        if (!penActive || !current) return;
        current.points.push({ x: e.clientX, y: e.clientY + window.scrollY });
        redrawPen();
    }
    function penUp(e) {
        if (!penActive || !current) return;
        if (current.points.length > 1) strokes.push(current);
        current = null;
        redrawPen();
    }

    function drawStroke(s) {
        if (s.points.length < 2) return;
        penCtx.strokeStyle = s.color;
        penCtx.lineWidth = s.width;
        penCtx.beginPath();
        for (var i = 0; i < s.points.length; i++) {
            var p = s.points[i];
            var vy = p.y - window.scrollY;
            if (i === 0) penCtx.moveTo(p.x, vy);
            else penCtx.lineTo(p.x, vy);
        }
        penCtx.stroke();
    }

    function redrawPen() {
        if (!penCtx) return;
        penCtx.clearRect(0, 0, penCanvas.width, penCanvas.height);
        for (var i = 0; i < strokes.length; i++) drawStroke(strokes[i]);
        if (current) drawStroke(current);
    }

    function setPenActive(active) {
        penActive = active;
        document.body.classList.toggle("pen-active", active);
        var btn = document.getElementById("fc-pen-toggle");
        var pal = document.getElementById("fc-pen-palette");
        if (btn) btn.classList.toggle("active", active);
        if (pal) pal.hidden = !active;
        if (active) {
            ensurePenCanvas();
            penCanvas.style.display = "block";
            redrawPen();
        } else {
            if (penCanvas) penCanvas.style.display = "none";
        }
    }

    function wirePen() {
        var btn = document.getElementById("fc-pen-toggle");
        var fab = document.getElementById("fc-pen-fab");
        function toggle() { setPenActive(!penActive); }
        if (btn) btn.addEventListener("click", toggle);
        if (fab) fab.addEventListener("click", toggle);
        document.querySelectorAll(".fc-pen-swatch[data-pen-color]").forEach(function (sw) {
            sw.addEventListener("click", function () {
                penColor = sw.dataset.penColor;
                document.querySelectorAll(".fc-pen-swatch").forEach(function (x) {
                    x.classList.toggle("active", x === sw);
                });
            });
        });
        var clear = document.getElementById("fc-pen-clear");
        if (clear) clear.addEventListener("click", function () {
            strokes = []; current = null; redrawPen();
        });
        // Keyboard: Esc to exit; P to toggle (when not typing in a field)
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && penActive) {
                setPenActive(false);
                return;
            }
            if ((e.key === "p" || e.key === "P") && !e.ctrlKey && !e.metaKey && !e.altKey) {
                var t = e.target;
                if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
                e.preventDefault();
                toggle();
            }
        });
    }

    // -------------------------------------------------------------------------
    // Reading preferences: theme / font / size segmented controls.
    // Early-apply (data-theme/font/size on <html>) already happened in toggle.js.
    // -------------------------------------------------------------------------
    function wireReading() {
        var key = (S.READ_KEY) || "fc-reading";
        var defaults = (S.READ_DEFAULTS) || { theme: "light", font: "serif", size: "normal" };
        var state = S.reading || {};
        function getR(k) { return state[k] || defaults[k]; }
        function setR(k, v) {
            if (v === defaults[k]) delete state[k];
            else state[k] = v;
            html.setAttribute("data-" + k, v);
            save(key, state);
            render();
        }
        function render() {
            document.querySelectorAll(".fc-segmented[data-setting]").forEach(function (g) {
                var k = g.dataset.setting;
                var cur = getR(k);
                g.querySelectorAll("button[data-val]").forEach(function (b) {
                    b.classList.toggle("active", b.dataset.val === cur);
                });
            });
        }
        document.querySelectorAll(".fc-segmented[data-setting]").forEach(function (g) {
            var k = g.dataset.setting;
            g.querySelectorAll("button[data-val]").forEach(function (b) {
                b.addEventListener("click", function () { setR(k, b.dataset.val); });
            });
        });
        render();
    }

    // -------------------------------------------------------------------------
    // Boot
    // -------------------------------------------------------------------------
    wireReading();
    wireSectionVisibility();
    wireSectionCollapse();
    wireSidebarCollapse();
    wireBookmarks();
    wireHighlights();
    wirePen();
})();
