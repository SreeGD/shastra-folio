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
    function setSectionCollapsed(secName, wantCollapsed) {
        var isDefault = !!(S.DEFAULT_COLLAPSED && S.DEFAULT_COLLAPSED[secName]);
        if (wantCollapsed) {
            // Matches the default? Drop the explicit override so we follow the
            // default in future. Otherwise persist an explicit "1".
            if (isDefault) delete S.collapsed[secName];
            else S.collapsed[secName] = 1;
            html.setAttribute("data-collapsed-" + secName, "1");
        } else {
            // Override default-collapsed sections with explicit "expanded".
            if (isDefault) S.collapsed[secName] = 0;
            else delete S.collapsed[secName];
            html.removeAttribute("data-collapsed-" + secName);
        }
        save(S.COLLAPSED_KEY, S.collapsed);
    }

    function isCollapsedNow(secName) {
        return typeof S.isSectionCollapsed === "function"
            ? S.isSectionCollapsed(secName)
            : !!S.collapsed[secName];
    }

    function wireSectionCollapse() {
        // Section labels become click targets for collapse/expand.
        document.addEventListener("click", function (e) {
            // Ignore clicks on inner controls (read-aloud button, etc.).
            if (e.target.closest(".fc-readout-btn")) return;
            var label = e.target.closest(".fc-section-label");
            if (!label) return;
            var sec = label.closest("[data-sec]");
            if (!sec) return;
            var name = sec.dataset.sec;
            if (!name) return;
            e.preventDefault();
            setSectionCollapsed(name, !isCollapsedNow(name));
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
    // Mobile sidebar drawers — header ⚙ / 📚 buttons open the left/right
    // sidebars as overlays; backdrop click or Esc dismisses.
    // -------------------------------------------------------------------------
    function wireMobileDrawers() {
        var body = document.body;
        function close() {
            body.removeAttribute("data-overlay-left");
            body.removeAttribute("data-overlay-right");
        }
        document.querySelectorAll(".fc-mobile-trigger[data-overlay]").forEach(function (t) {
            t.addEventListener("click", function () {
                var side = t.dataset.overlay;
                var attr = "data-overlay-" + side;
                var open = body.getAttribute(attr);
                close();
                if (!open) body.setAttribute(attr, "1");
            });
        });
        var backdrop = document.querySelector(".fc-overlay-backdrop");
        if (backdrop) backdrop.addEventListener("click", close);
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" &&
                (body.getAttribute("data-overlay-left") || body.getAttribute("data-overlay-right"))) {
                close();
            }
        });
        // Close after navigating within a drawer (clicking a link)
        document.querySelectorAll(".fc-left-sidebar a, .fc-sidebar a").forEach(function (a) {
            a.addEventListener("click", function () {
                if (window.matchMedia("(max-width: 1100px)").matches) close();
            });
        });
    }

    // -------------------------------------------------------------------------
    // Personal-guidance age filter (All / Youth / Householder / Senior).
    // One global state; all age-filter button groups stay in sync.
    // -------------------------------------------------------------------------
    function wireAgeFilter() {
        var groups = document.querySelectorAll(".fc-pg-age-filter");
        if (!groups.length) return;
        var key = (S.PG_FILTER_KEY) || "fc-pg-filter";
        var current = (S.pgFilter) || "all";
        function render() {
            groups.forEach(function (g) {
                g.querySelectorAll("button[data-pg-age]").forEach(function (b) {
                    b.classList.toggle("active", b.dataset.pgAge === current);
                });
            });
            html.setAttribute("data-pg-filter", current);
        }
        render();
        document.addEventListener("click", function (e) {
            var b = e.target.closest(".fc-pg-age-filter button[data-pg-age]");
            if (!b) return;
            current = b.dataset.pgAge;
            try { localStorage.setItem(key, current); } catch (err) {}
            render();
        });
    }

    // -------------------------------------------------------------------------
    // Presentation mode — fullscreen, one verse at a time. Session-only.
    // F to toggle, ← / → to advance (on chapter pages: between verse anchors;
    // on verse pages: prev/next page navigation). Esc exits.
    // -------------------------------------------------------------------------
    function wirePresentation() {
        var body = document.body;
        var btn = document.getElementById("fc-presentation-toggle");
        var blocks = Array.prototype.slice.call(document.querySelectorAll("article.fc-verse-block"));
        var isChapter = blocks.length > 1;
        var currentIdx = 0;

        function updateCounter() {
            if (!isChapter) {
                body.setAttribute("data-presentation-counter", "");
                return;
            }
            body.setAttribute(
                "data-presentation-counter",
                (currentIdx + 1) + " / " + blocks.length
            );
        }

        function showCurrent() {
            blocks.forEach(function (b, i) {
                b.classList.toggle("fc-presentation-current", i === currentIdx);
            });
            updateCounter();
            window.scrollTo({ top: 0, behavior: "auto" });
        }

        function findNearestVerseIdx() {
            // Locate the verse closest to the current scroll position so
            // entering presentation lands on what the reader was just looking at.
            if (!blocks.length) return 0;
            var y = window.scrollY + 180;
            var best = 0;
            for (var i = 0; i < blocks.length; i++) {
                if (blocks[i].offsetTop <= y) best = i;
                else break;
            }
            return best;
        }

        function enter() {
            if (isChapter) currentIdx = findNearestVerseIdx();
            body.classList.add("presentation");
            if (isChapter) showCurrent();
            else updateCounter();
            if (btn) btn.classList.add("active");
        }
        function exit() {
            body.classList.remove("presentation");
            blocks.forEach(function (b) { b.classList.remove("fc-presentation-current"); });
            body.removeAttribute("data-presentation-counter");
            if (btn) btn.classList.remove("active");
        }
        function toggle() {
            if (body.classList.contains("presentation")) exit();
            else enter();
        }
        function go(delta) {
            if (!body.classList.contains("presentation")) return;
            if (isChapter) {
                var n = currentIdx + delta;
                if (n < 0) n = 0;
                if (n >= blocks.length) n = blocks.length - 1;
                if (n !== currentIdx) { currentIdx = n; showCurrent(); }
            } else {
                var link = document.querySelector(
                    ".fc-prevnext a." + (delta > 0 ? "next" : "prev")
                );
                if (link) window.location.href = link.href;
            }
        }

        if (btn) btn.addEventListener("click", toggle);
        document.addEventListener("keydown", function (e) {
            // Don't intercept while typing
            var t = e.target;
            if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
            if ((e.key === "f" || e.key === "F") && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                toggle();
                return;
            }
            if (!body.classList.contains("presentation")) return;
            if (e.key === "Escape") { e.preventDefault(); exit(); }
            else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
                e.preventDefault(); go(1);
            } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
                e.preventDefault(); go(-1);
            }
        });
    }

    // -------------------------------------------------------------------------
    // Read-aloud (Web Speech API): inject ▶ buttons next to Translation and
    // commentary section labels. Click to speak, click again to stop. Only
    // one utterance plays at a time.
    // -------------------------------------------------------------------------
    function wireReadout() {
        var synth = window.speechSynthesis;
        if (!synth) return;
        // Warm-up: getVoices() is async on Chrome/Safari; this kicks off voice load
        // so the first speak() call doesn't fall into a silent state.
        try { synth.getVoices(); } catch (e) {}
        if (typeof synth.addEventListener === "function") {
            synth.addEventListener("voiceschanged", function () { try { synth.getVoices(); } catch (e) {} });
        }
        var currentBtn = null;

        function makeBtn() {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "fc-readout-btn";
            b.textContent = "▶";
            b.setAttribute("aria-label", "Read aloud");
            return b;
        }

        function resetBtn(b) {
            if (!b) return;
            b.classList.remove("playing");
            b.textContent = "▶";
        }

        function speak(text, btn) {
            // Toggle off: same button clicked while playing → stop.
            if (currentBtn === btn) {
                synth.cancel();
                resetBtn(btn);
                currentBtn = null;
                return;
            }
            // Different section: stop the previous utterance first.
            if (currentBtn) {
                synth.cancel();
                resetBtn(currentBtn);
                currentBtn = null;
            }
            text = (text || "").replace(/\s+/g, " ").trim();
            if (!text) return;

            var u = new SpeechSynthesisUtterance(text);
            u.lang = "en-US";
            u.rate = 1.0;
            u.pitch = 1.0;
            u.volume = 1.0;
            u.onstart = function () {
                btn.classList.add("playing");
                btn.textContent = "■";
            };
            u.onend = function () {
                resetBtn(btn);
                if (currentBtn === btn) currentBtn = null;
            };
            u.onerror = function (e) {
                console.warn("[fc] TTS error:", e && (e.error || e.message || e));
                resetBtn(btn);
                if (currentBtn === btn) currentBtn = null;
            };
            currentBtn = btn;
            // Mark as playing immediately for responsive UI (some engines never fire onstart).
            btn.classList.add("playing");
            btn.textContent = "■";
            synth.speak(u);
            // Chrome quirk: paused state after cancel may persist; resume to actually start.
            if (synth.paused) try { synth.resume(); } catch (e) {}
        }

        function stopSpeaking() {
            try { synth.cancel(); } catch (e) {}
            if (currentBtn) { resetBtn(currentBtn); currentBtn = null; }
        }

        // Translation: button at top-right of the call-out block.
        document.querySelectorAll(".fc-translation").forEach(function (t) {
            // Skip if a button is already there (defensive)
            if (t.querySelector(".fc-readout-btn")) return;
            var btn = makeBtn();
            t.appendChild(btn);
            btn.addEventListener("click", function (e) {
                e.stopPropagation();
                // The text of the translation block is just the verse text;
                // ::before adds the "Translation" label visually but isn't in DOM.
                speak(t.textContent.trim(), btn);
            });
        });

        // Section-labelled blocks: button appended inside the label.
        var SECTIONS_TO_READ = ["purport", "gaudiya", "classical", "personal_guidance"];
        SECTIONS_TO_READ.forEach(function (sec) {
            document.querySelectorAll('section[data-sec="' + sec + '"]').forEach(function (s) {
                var label = s.querySelector(".fc-section-label");
                if (!label || label.querySelector(".fc-readout-btn")) return;
                var btn = makeBtn();
                label.appendChild(btn);
                btn.addEventListener("click", function (e) {
                    e.stopPropagation(); // don't trigger section collapse
                    // Concatenate the meaningful text — skip the label itself.
                    var parts = [];
                    s.querySelectorAll(
                        ".cr-purport-body, .cr-acarya-trans, .cr-acarya-purp, " +
                        ".fc-pg-essence, .fc-pg-list, .cr-acarya-name"
                    ).forEach(function (el) {
                        var t = el.textContent.trim();
                        if (t) parts.push(t);
                    });
                    speak(parts.join(". "), btn);
                });
            });
        });

        // Stop on page-leave / pen-mode change (pen overlay may capture pointers)
        window.addEventListener("beforeunload", stopSpeaking);
    }

    // -------------------------------------------------------------------------
    // Search within chapter — live-filter verse blocks by text match.
    // -------------------------------------------------------------------------
    function wireChapterSearch() {
        var input = document.getElementById("fc-search");
        if (!input) return;
        var blocks = Array.prototype.slice.call(document.querySelectorAll("article.fc-verse-block"));
        var dividers = Array.prototype.slice.call(document.querySelectorAll(".fc-verse-divider"));
        var pillByVerse = {};
        document.querySelectorAll(".fc-jump-pill[href^='#bg-']").forEach(function (p) {
            pillByVerse[p.getAttribute("href").slice(1)] = p;
        });
        var currentEl = document.getElementById("fc-ribbon-current");
        var body = document.body;
        // Pre-compute lowercase text per block so filter() stays fast on /bg/18/ (78 verses).
        var blockText = blocks.map(function (b) { return b.textContent.toLowerCase(); });

        function filter() {
            var q = input.value.trim().toLowerCase();
            body.dataset.searching = q ? "1" : "";
            var matches = 0;
            blocks.forEach(function (b, i) {
                var hit = !q || blockText[i].indexOf(q) !== -1;
                b.classList.toggle("fc-hidden-by-search", !hit);
                var pill = pillByVerse[b.id];
                if (pill) pill.classList.toggle("fc-search-dim", !hit && !!q);
                if (hit) matches++;
            });
            // Hide the dividers between hidden verses
            dividers.forEach(function (d) {
                var prev = d.previousElementSibling;
                var hidePrev = prev && prev.classList.contains("fc-hidden-by-search");
                d.classList.toggle("fc-hidden-by-search", hidePrev);
            });
            if (currentEl) currentEl.textContent = q ? (matches + " / " + blocks.length) : "";
        }

        input.addEventListener("input", filter);
        input.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                input.value = "";
                filter();
                input.blur();
            }
        });
    }

    // -------------------------------------------------------------------------
    // Sticky chapter ribbon — track which verse is in view, highlight its pill,
    // and update the ribbon's "Current" label. No-op on non-chapter pages.
    // -------------------------------------------------------------------------
    function wireRibbon() {
        var ribbon = document.querySelector(".fc-ribbon");
        if (!ribbon) return;
        var strip = ribbon.querySelector(".fc-jump-strip");
        var currentEl = document.getElementById("fc-ribbon-current");
        var pillByVerse = {};
        ribbon.querySelectorAll(".fc-jump-pill[href^='#bg-']").forEach(function (p) {
            pillByVerse[p.getAttribute("href").slice(1)] = p;
        });
        if (!Object.keys(pillByVerse).length) return;

        function setActive(id) {
            Object.keys(pillByVerse).forEach(function (k) {
                pillByVerse[k].classList.toggle("active", k === id);
            });
            // Don't overwrite the ribbon caption while the search input is active.
            if (currentEl && !document.body.dataset.searching) {
                var m = id.match(/^bg-(\d+)-(.+)$/);
                currentEl.textContent = m ? ("BG " + m[1] + "." + m[2]) : "";
            }
            // Scroll the active pill into view inside the horizontal strip
            var pill = pillByVerse[id];
            if (pill && strip) {
                var pillRect = pill.getBoundingClientRect();
                var stripRect = strip.getBoundingClientRect();
                if (pillRect.left < stripRect.left + 20 || pillRect.right > stripRect.right - 20) {
                    pill.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
                }
            }
        }

        // Track the most-recently-entered verse near the top of the viewport.
        var activeId = null;
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                if (e.isIntersecting) {
                    activeId = e.target.id;
                    setActive(activeId);
                }
            });
        }, { rootMargin: "-15% 0px -75% 0px", threshold: 0 });
        document.querySelectorAll("article.fc-verse-block").forEach(function (v) {
            io.observe(v);
        });
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
    wireRibbon();
    wireChapterSearch();
    wireReadout();
    wireAgeFilter();
    wireMobileDrawers();
    wirePresentation();
})();
