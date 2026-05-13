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
    // Flashcards page — runs only on /study/flashcards/.
    // Loads assets/data/flashcards.json; deck = whole Gītā | bookmarks |
    // selected chapter. Tap or Space flips; ← → step; Shuffle re-orders.
    // -------------------------------------------------------------------------
    function wireFlashcards() {
        var card = document.getElementById("fc-fc-card");
        if (!card) return;
        var deckSel = document.getElementById("fc-fc-deck");
        var chapWrap = document.querySelector(".fc-deck-chapter-wrap");
        var chapSel = document.getElementById("fc-fc-chapter");
        var modeSel = document.getElementById("fc-fc-mode");
        var shuffleBtn = document.getElementById("fc-fc-shuffle");
        var restartBtn = document.getElementById("fc-fc-restart");
        var prevBtn = document.getElementById("fc-fc-prev");
        var nextBtn = document.getElementById("fc-fc-next");
        var progressEl = document.getElementById("fc-fc-progress");
        var emptyEl = document.getElementById("fc-fc-empty");
        var fullVerseLink = document.getElementById("fc-fc-fullverse");

        var refFront = card.querySelector(".fc-card-front .fc-card-ref");
        var refBack = card.querySelector(".fc-card-back .fc-card-ref");
        var devEl = card.querySelector(".fc-card-devanagari");
        var iastEl = card.querySelector(".fc-card-iast");
        var transEl = card.querySelector(".fc-card-translation");
        var hintEl = card.querySelector(".fc-card-front .fc-card-hint");

        var allCards = null;
        var deck = [];
        var clozeForCard = [];  // hidden word index per deck position
        var idx = 0;
        var flipped = false;

        function escapeHtmlCard(s) {
            return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }
        function regenerateClozeIndices() {
            clozeForCard = deck.map(function (v) {
                var words = (v.transliteration || "").split(/\s+/).filter(Boolean);
                if (!words.length) return -1;
                // Prefer words longer than 2 letters (skip "ca", "na", "tu", etc.).
                var candidates = [];
                for (var i = 0; i < words.length; i++) {
                    if (words[i].replace(/[.,;:!?'’\-]/g, "").length > 2) candidates.push(i);
                }
                if (!candidates.length) {
                    candidates = words.map(function (_, i) { return i; });
                }
                return candidates[Math.floor(Math.random() * candidates.length)];
            });
        }

        function applyChapterVisibility() {
            if (!chapWrap) return;
            chapWrap.hidden = deckSel.value !== "chapter";
        }
        function readBookmarks() {
            try { return JSON.parse(localStorage.getItem("fc-bookmarks") || "{}") || {}; }
            catch (e) { return {}; }
        }
        function buildDeck() {
            if (!allCards) return [];
            var kind = deckSel ? deckSel.value : "all";
            if (kind === "bookmarks") {
                var bm = readBookmarks();
                return allCards.filter(function (v) {
                    // Each card now carries its own anchor id (works for BG + SB).
                    return bm[v.id || ("bg-" + v.chapter + "-" + v.label)];
                });
            }
            if (kind === "bg") {
                return allCards.filter(function (v) { return v.work === "BG"; });
            }
            if (kind === "sb") {
                return allCards.filter(function (v) { return v.work === "SB"; });
            }
            if (kind === "chapter" && chapSel) {
                var selVal = chapSel.value;
                // Chapter selector value can be "bg:1" / "sb:10:1" / plain "1" (legacy)
                if (selVal.indexOf("bg:") === 0) {
                    var bch = parseInt(selVal.slice(3), 10);
                    return allCards.filter(function (v) { return v.work === "BG" && v.chapter === bch; });
                }
                if (selVal.indexOf("sb:") === 0) {
                    var parts = selVal.slice(3).split(":");
                    var sca = parseInt(parts[0], 10);
                    var sch = parseInt(parts[1], 10);
                    return allCards.filter(function (v) {
                        return v.work === "SB" && v.canto === sca && v.chapter === sch;
                    });
                }
                var ch = parseInt(selVal, 10);
                return allCards.filter(function (v) { return v.chapter === ch; });
            }
            return allCards.slice();
        }
        function shuffleDeck(arr) {
            for (var i = arr.length - 1; i > 0; i--) {
                var j = Math.floor(Math.random() * (i + 1));
                var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
            }
        }

        function render() {
            if (!deck.length) {
                card.style.display = "none";
                if (emptyEl) emptyEl.hidden = false;
                if (progressEl) progressEl.textContent = "0 / 0";
                return;
            }
            if (emptyEl) emptyEl.hidden = true;
            card.style.display = "";
            var v = deck[idx];
            var mode = modeSel ? modeSel.value : "translation";

            if (refFront) refFront.textContent = v.ref;
            if (refBack) refBack.textContent = v.ref;
            if (fullVerseLink) fullVerseLink.href = toRoot + v.url;

            if (mode === "cloze") {
                var words = (v.transliteration || "").split(/\s+/).filter(Boolean);
                var hiddenIdx = clozeForCard[idx];
                if (hiddenIdx === undefined || hiddenIdx < 0 || hiddenIdx >= words.length) {
                    hiddenIdx = 0;
                }
                var hiddenWord = words[hiddenIdx] || "";
                // Front: Devanāgarī + IAST with one word blanked
                if (devEl) devEl.textContent = v.devanagari || "—";
                if (iastEl) {
                    var blanked = words.slice();
                    blanked[hiddenIdx] = "____";
                    iastEl.textContent = blanked.join(" ");
                }
                if (hintEl) hintEl.textContent = "Recall the missing IAST word — Tap or Space to reveal";
                // Back: highlighted IAST + Translation
                if (transEl) {
                    var highlighted = words.map(function (w, i) {
                        var safe = escapeHtmlCard(w);
                        return i === hiddenIdx ? '<span class="fc-cloze-revealed">' + safe + '</span>' : safe;
                    }).join(" ");
                    transEl.innerHTML =
                        '<div class="fc-cloze-answer">Missing word: <strong>' +
                            escapeHtmlCard(hiddenWord) + '</strong></div>' +
                        '<div style="font-style:italic; font-family:\'Noto Serif\',Georgia,serif; color:#5a4a2a; margin-bottom:0.8rem;">' +
                            highlighted + '</div>' +
                        '<div>' + escapeHtmlCard(v.translation || "") + '</div>';
                }
            } else {
                if (devEl) devEl.textContent = v.devanagari || "—";
                if (iastEl) iastEl.textContent = v.transliteration || "";
                if (transEl) transEl.textContent = v.translation || "";
                if (hintEl) hintEl.textContent = "Tap or press Space to reveal the translation";
            }

            card.classList.toggle("flipped", flipped);
            if (progressEl) progressEl.textContent = (idx + 1) + " / " + deck.length;
        }

        function flip() { flipped = !flipped; render(); }
        function next() { if (idx < deck.length - 1) { idx++; flipped = false; render(); } }
        function prev() { if (idx > 0) { idx--; flipped = false; render(); } }
        function restart() { idx = 0; flipped = false; render(); }
        function changeDeck() {
            applyChapterVisibility();
            deck = buildDeck();
            regenerateClozeIndices();
            idx = 0; flipped = false;
            render();
        }

        if (deckSel) deckSel.addEventListener("change", changeDeck);
        if (chapSel) chapSel.addEventListener("change", changeDeck);
        if (modeSel) modeSel.addEventListener("change", function () {
            regenerateClozeIndices();
            flipped = false;
            render();
        });
        if (shuffleBtn) shuffleBtn.addEventListener("click", function () {
            shuffleDeck(deck);
            regenerateClozeIndices();
            idx = 0; flipped = false; render();
        });
        if (restartBtn) restartBtn.addEventListener("click", function () {
            regenerateClozeIndices();
            restart();
        });
        if (prevBtn) prevBtn.addEventListener("click", prev);
        if (nextBtn) nextBtn.addEventListener("click", next);
        card.addEventListener("click", flip);
        card.addEventListener("keydown", function (e) {
            if (e.key === " " || e.key === "Enter") { e.preventDefault(); flip(); }
        });
        document.addEventListener("keydown", function (e) {
            var t = e.target;
            if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA"
                      || t.tagName === "SELECT" || t.isContentEditable)) return;
            if (e.key === " ") { e.preventDefault(); flip(); }
            else if (e.key === "ArrowRight") { e.preventDefault(); next(); }
            else if (e.key === "ArrowLeft") { e.preventDefault(); prev(); }
        });

        fetch(toRoot + "assets/data/flashcards.json")
            .then(function (r) { return r.json(); })
            .then(function (data) { allCards = data; changeDeck(); })
            .catch(function (e) {
                console.warn("[fc] flashcards load failed:", e);
                if (emptyEl) {
                    emptyEl.hidden = false;
                    emptyEl.innerHTML = "<p>Failed to load flashcards.</p>";
                }
            });
    }

    // -------------------------------------------------------------------------
    // Reading progress + streak
    //   - A verse counts as read once it's been visible (≥50% in viewport) for
    //     3 seconds, on any page that contains the article block.
    //   - Daily streak tracks consecutive calendar days with at least one read.
    // -------------------------------------------------------------------------
    var READ_KEY = "fc-read-log";
    var STREAK_KEY = "fc-streak";
    var READ_DWELL_MS = 3000;

    function loadReadLog() {
        try { return JSON.parse(localStorage.getItem(READ_KEY) || "{}") || {}; }
        catch (e) { return {}; }
    }
    function saveReadLog(d) {
        try { localStorage.setItem(READ_KEY, JSON.stringify(d)); } catch (e) {}
    }
    function loadStreak() {
        try { return JSON.parse(localStorage.getItem(STREAK_KEY) || "{}") || {}; }
        catch (e) { return {}; }
    }
    function saveStreak(d) {
        try { localStorage.setItem(STREAK_KEY, JSON.stringify(d)); } catch (e) {}
    }
    function todayStamp() {
        var d = new Date();
        var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }
    function daysBetween(a, b) {
        var pa = a.split("-").map(Number);
        var pb = b.split("-").map(Number);
        var da = Date.UTC(pa[0], pa[1] - 1, pa[2]);
        var db = Date.UTC(pb[0], pb[1] - 1, pb[2]);
        return Math.round((db - da) / 86400000);
    }

    function bumpStreak() {
        var st = loadStreak();
        var today = todayStamp();
        if (st.last === today) return st;
        if (!st.last) {
            st.count = 1;
        } else {
            var gap = daysBetween(st.last, today);
            if (gap === 1) st.count = (st.count || 0) + 1;
            else if (gap > 1) st.count = 1;
            // gap === 0 shouldn't happen due to early return; gap < 0 (clock drift) → keep.
        }
        st.last = today;
        if ((st.best || 0) < (st.count || 0)) st.best = st.count;
        saveStreak(st);
        return st;
    }

    // Cached total verse count (populated by verses.json or other index fetches).
    var _cachedTotal = null;
    function setCachedTotal(n) {
        if (typeof n === "number" && n > 0) {
            _cachedTotal = n;
            renderProgress();
        }
    }

    function renderProgress() {
        var section = document.getElementById("fc-progress-section");
        if (!section) return;
        var log = loadReadLog();
        var n = Object.keys(log).length;
        // Total: prefer cached count from verses.json; fall back to BG+SB sum.
        var total = _cachedTotal || 4229;
        var numEl = document.getElementById("fc-progress-num");
        var totEl = document.getElementById("fc-progress-total");
        var barEl = document.getElementById("fc-progress-bar-fill");
        var stEl = document.getElementById("fc-streak");
        if (numEl) numEl.textContent = String(n);
        if (totEl) totEl.textContent = String(total);
        if (barEl) barEl.style.width = Math.min(100, (n / total) * 100).toFixed(2) + "%";
        var st = loadStreak();
        if (stEl) {
            var today = todayStamp();
            var active = (st.last === today) || (st.last && daysBetween(st.last, today) === 1);
            stEl.textContent = (active ? "🔥 " : "🕯 ") + (st.count || 0) + "-day streak";
            stEl.title = st.best ? ("Best: " + st.best + " days") : "";
        }
    }

    function markVerseRead(verseId) {
        if (!verseId) return;
        var log = loadReadLog();
        if (log[verseId]) return; // already counted
        log[verseId] = Date.now();
        saveReadLog(log);
        bumpStreak();
        renderProgress();
    }

    function wireReadingProgress() {
        renderProgress();
        var resetBtn = document.getElementById("fc-progress-reset");
        if (resetBtn) resetBtn.addEventListener("click", function () {
            if (confirm("Reset your reading progress and streak? This can't be undone.")) {
                try { localStorage.removeItem(READ_KEY); localStorage.removeItem(STREAK_KEY); } catch (e) {}
                renderProgress();
            }
        });

        var blocks = document.querySelectorAll("article.fc-verse-block[id^='bg-']");
        if (!blocks.length) return;
        // Track verses currently in view + dwell timers
        var timers = {};
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
                var id = e.target.id;
                if (!id) return;
                if (e.isIntersecting && e.intersectionRatio >= 0.5) {
                    if (!timers[id]) {
                        timers[id] = setTimeout(function () {
                            markVerseRead(id);
                            timers[id] = null;
                        }, READ_DWELL_MS);
                    }
                } else {
                    if (timers[id]) { clearTimeout(timers[id]); timers[id] = null; }
                }
            });
        }, { threshold: [0, 0.5, 1] });
        blocks.forEach(function (b) { io.observe(b); });
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
    // Share-as-image — render a verse to a 1080×1080 PNG via Canvas, with a
    // Download and Copy-to-clipboard action. Fonts are awaited via the FontFace
    // API so Devanāgarī and Lora render correctly the first time.
    // -------------------------------------------------------------------------
    function wireShareImage() {
        var modal = document.getElementById("fc-share-modal");
        if (!modal) return;
        var canvas = modal.querySelector(".fc-share-canvas");
        var downloadBtn = modal.querySelector(".fc-share-download");
        var copyBtn = modal.querySelector(".fc-share-copy");
        var closeBtn = modal.querySelector(".fc-share-close");
        var backdrop = modal.querySelector(".fc-share-backdrop");
        var status = modal.querySelector(".fc-share-status");
        var currentRef = "";

        function open() {
            modal.removeAttribute("hidden");
            document.body.dataset.shareOpen = "1";
        }
        function close() {
            modal.setAttribute("hidden", "");
            delete document.body.dataset.shareOpen;
            if (status) status.textContent = "";
        }

        function gatherVerse(verseBlockId, ref) {
            var block = document.getElementById(verseBlockId);
            if (!block) return null;
            var dev = block.querySelector(".cr-devanagari");
            var devText = dev ? dev.textContent.trim() : "";
            var iastLines = [];
            block.querySelectorAll(".cr-iast-line").forEach(function (el) {
                var t = el.textContent.trim();
                if (t) iastLines.push(t);
            });
            if (!iastLines.length) {
                var iast = block.querySelector(".cr-iast");
                if (iast) iastLines = iast.textContent.trim().split(/\n+/).filter(Boolean);
            }
            var translation = "";
            var trans = block.querySelector(".fc-translation");
            if (trans) {
                var clone = trans.cloneNode(true);
                clone.querySelectorAll(".fc-readout-btn").forEach(function (b) { b.remove(); });
                translation = clone.textContent.trim();
            }
            return { ref: ref, devanagari: devText, iast: iastLines, translation: translation };
        }

        function wrapText(ctx, text, maxWidth) {
            var paragraphs = text.split(/\n+/);
            var out = [];
            for (var p = 0; p < paragraphs.length; p++) {
                var words = paragraphs[p].split(/\s+/);
                var cur = "";
                for (var i = 0; i < words.length; i++) {
                    var test = cur ? cur + " " + words[i] : words[i];
                    if (ctx.measureText(test).width > maxWidth && cur) {
                        out.push(cur);
                        cur = words[i];
                    } else {
                        cur = test;
                    }
                }
                if (cur) out.push(cur);
            }
            return out;
        }

        function fitFontSize(ctx, text, fontFamily, maxFontSize, minFontSize, maxWidth, maxLines, lineHeightRatio) {
            // Try progressively smaller font until the text fits in maxLines lines.
            for (var size = maxFontSize; size >= minFontSize; size -= 2) {
                ctx.font = size + 'px ' + fontFamily;
                var lines = wrapText(ctx, text, maxWidth);
                if (lines.length <= maxLines) {
                    return { size: size, lines: lines };
                }
            }
            ctx.font = minFontSize + "px " + fontFamily;
            return { size: minFontSize, lines: wrapText(ctx, text, maxWidth) };
        }

        function renderToCanvas(verse) {
            var ctx = canvas.getContext("2d");
            canvas.width = 1080; canvas.height = 1080;
            // Background
            ctx.fillStyle = "#FAF6E8";
            ctx.fillRect(0, 0, 1080, 1080);
            // Top gradient stripe
            var grad = ctx.createLinearGradient(0, 0, 1080, 0);
            grad.addColorStop(0, "#6B1D2A");
            grad.addColorStop(0.5, "#8B3A4A");
            grad.addColorStop(1, "#B8860B");
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 1080, 10);
            // Bottom gradient stripe (mirrored)
            ctx.fillRect(0, 1070, 1080, 10);

            ctx.textAlign = "center";
            ctx.textBaseline = "alphabetic";

            // Reference
            ctx.fillStyle = "#6B1D2A";
            ctx.font = "italic bold 46px Lora, Georgia, serif";
            ctx.fillText(verse.ref, 540, 95);

            var y = 175;

            // Devanāgarī (centered, multi-line)
            ctx.fillStyle = "#3a2f1a";
            var devLines = (verse.devanagari || "").split(/\n+/).filter(Boolean);
            if (devLines.length) {
                var devSize = devLines.length > 4 ? 34 : 40;
                ctx.font = devSize + 'px "Noto Sans Devanagari", serif';
                for (var i = 0; i < devLines.length; i++) {
                    ctx.fillText(devLines[i], 540, y);
                    y += Math.round(devSize * 1.6);
                }
                y += 18;
            }

            // IAST
            ctx.fillStyle = "#5a4a2a";
            if (verse.iast && verse.iast.length) {
                ctx.font = 'italic 30px "Noto Serif", Georgia, serif';
                for (var j = 0; j < verse.iast.length; j++) {
                    ctx.fillText(verse.iast[j], 540, y);
                    y += 44;
                }
                y += 25;
            }

            // Translation (auto-fit)
            if (verse.translation) {
                var remaining = 1010 - y;          // leave space for footer
                var maxLines = Math.max(2, Math.floor(remaining / 40));
                ctx.fillStyle = "#3a2f1a";
                var fit = fitFontSize(ctx, verse.translation, "Lora, Georgia, serif", 30, 18, 940, maxLines, 1.4);
                ctx.font = fit.size + "px Lora, Georgia, serif";
                var lh = Math.round(fit.size * 1.5);
                for (var k = 0; k < fit.lines.length; k++) {
                    ctx.fillText(fit.lines[k], 540, y);
                    y += lh;
                }
            }

            // Footer
            ctx.fillStyle = "#8B7D6B";
            ctx.font = "20px Lora, Georgia, serif";
            ctx.fillText("FolioCorpus · " + location.host + "/shastra-folio", 540, 1045);
        }

        function openFor(btn) {
            var ref = btn.dataset.shareRef;
            var id = btn.dataset.shareId;
            currentRef = ref;
            modal.dataset.ref = ref;
            var verse = gatherVerse(id, ref);
            if (!verse) return;

            open();
            if (status) status.textContent = "Rendering…";
            var doRender = function () {
                renderToCanvas(verse);
                if (status) status.textContent = "Ready — Download or Copy to share.";
            };
            // Wait for fonts so Devanāgarī + Lora render correctly the first time.
            if (document.fonts && document.fonts.ready) {
                document.fonts.ready.then(doRender);
            } else {
                doRender();
            }
        }

        document.addEventListener("click", function (e) {
            var btn = e.target.closest(".fc-share-btn[data-share-id]");
            if (btn) { e.preventDefault(); openFor(btn); return; }
        });
        if (closeBtn) closeBtn.addEventListener("click", close);
        if (backdrop) backdrop.addEventListener("click", close);
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && document.body.dataset.shareOpen === "1") {
                e.preventDefault();
                close();
            }
        });

        if (downloadBtn) downloadBtn.addEventListener("click", function () {
            canvas.toBlob(function (blob) {
                if (!blob) return;
                var url = URL.createObjectURL(blob);
                var a = document.createElement("a");
                a.href = url;
                a.download = "foliocorpus-" + (currentRef || "verse").replace(/[^A-Za-z0-9.-]/g, "_") + ".png";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
                if (status) status.textContent = "Downloaded.";
            }, "image/png");
        });

        if (copyBtn) {
            if (!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem)) {
                copyBtn.hidden = true;
            } else {
                copyBtn.addEventListener("click", function () {
                    canvas.toBlob(function (blob) {
                        if (!blob) return;
                        var item = new ClipboardItem({ "image/png": blob });
                        navigator.clipboard.write([item]).then(function () {
                            if (status) status.textContent = "Copied to clipboard.";
                        }).catch(function (err) {
                            if (status) status.textContent = "Copy failed: " + (err.message || err);
                        });
                    }, "image/png");
                });
            }
        }
    }

    // -------------------------------------------------------------------------
    // Permalink highlight: ?h=phrase pre-highlights matching text on load.
    // Uses CSS Custom Highlight API; scrolls to the first match.
    // -------------------------------------------------------------------------
    function wirePermalinkHighlight() {
        if (!(window.CSS && CSS.highlights && window.Highlight && typeof Range !== "undefined")) return;
        var params = new URLSearchParams(location.search);
        var raw = params.get("h");
        if (!raw) return;
        var needle = raw.trim();
        if (!needle) return;
        var main = document.querySelector("main");
        if (!main) return;
        var lower = needle.toLowerCase();
        var hl = new Highlight();
        var firstRange = null;
        var walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT, null);
        var node;
        while ((node = walker.nextNode())) {
            var p = node.parentElement;
            if (!p) continue;
            if (p.closest(".fc-note-block, .fc-readout-btn, .fc-pg-age-filter, " +
                          ".fc-bookmark-btn, .fc-verse-permalink, .fc-share-btn, " +
                          ".fc-ribbon, .fc-section-label")) continue;
            var t = node.textContent.toLowerCase();
            var idx = t.indexOf(lower);
            while (idx !== -1) {
                var r = new Range();
                r.setStart(node, idx);
                r.setEnd(node, idx + needle.length);
                hl.add(r);
                if (!firstRange) firstRange = r;
                idx = t.indexOf(lower, idx + needle.length);
            }
        }
        try { CSS.highlights.set("fc-search", hl); } catch (e) { return; }
        if (firstRange) {
            // Scroll the first match into view.
            try {
                var rect = firstRange.getBoundingClientRect();
                window.scrollTo({
                    top: window.scrollY + rect.top - 160,
                    behavior: "smooth",
                });
            } catch (e) {}
        }
    }

    // -------------------------------------------------------------------------
    // Margin notes modal — opens from the Tools panel and shows the user's
    // bookmarks / notes / highlights, scoped to the current chapter when
    // available (else all). Pure read view, lets the user click through to
    // any annotation's verse.
    // -------------------------------------------------------------------------
    function wireNotesModal() {
        var openBtn = document.getElementById("fc-notes-modal-open");
        var modal = document.getElementById("fc-notes-modal");
        if (!openBtn || !modal) return;
        var body = document.body;
        var scopeEl = document.getElementById("fc-notes-modal-scope");
        var bodyEl = document.getElementById("fc-notes-modal-body");
        var tabs = modal.querySelectorAll(".fc-notes-tab[data-tab]");
        var current = "bookmarks";

        function escapeHtmlN(s) {
            return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }
        function currentChapter() {
            var c = body.dataset.chapter;
            return c ? parseInt(c, 10) : null;
        }
        function loadJSON(key) {
            try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; }
            catch (e) { return {}; }
        }

        function getBookmarks() {
            var ch = currentChapter();
            var all = loadJSON("fc-bookmarks");
            return Object.keys(all)
                .map(function (id) { return Object.assign({ _id: id }, all[id]); })
                .filter(function (b) { return ch == null || b.chapter === ch; })
                .sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
        }
        function getNotes() {
            var ch = currentChapter();
            var all = loadJSON("fc-notes");
            return Object.keys(all)
                .map(function (id) { return Object.assign({ _id: id }, all[id]); })
                .filter(function (n) { return n.text && (ch == null || n.chapter === ch); })
                .sort(function (a, b) { return (a.updatedAt || 0) - (b.updatedAt || 0); });
        }
        function getHighlights() {
            // Highlights are keyed by URL path. Match the current page first,
            // fall back to scanning all pages for this chapter when there isn't one.
            var ch = currentChapter();
            var all = loadJSON("fc-highlights");
            var entries = [];
            Object.keys(all).forEach(function (path) {
                var inChapter = !ch || path.indexOf("/bg/" + ch + "/") !== -1;
                if (!inChapter) return;
                (all[path] || []).forEach(function (h) {
                    entries.push({ path: path, text: h.text, color: h.color });
                });
            });
            return entries;
        }

        function renderBookmarks() {
            var bms = getBookmarks();
            updateCount("bookmarks", bms.length);
            if (!bms.length) { bodyEl.innerHTML = empty("bookmarks"); return; }
            bodyEl.innerHTML = bms.map(function (b) {
                var url = toRoot + "bg/" + b.chapter + "/" + b.vlabel + "/";
                return '<div class="fc-notes-item">' +
                    '<a class="fc-notes-ref" href="' + url + '">☆ ' + escapeHtmlN(b.label || b._id) + "</a>" +
                "</div>";
            }).join("");
        }
        function renderNotes() {
            var notes = getNotes();
            updateCount("notes", notes.length);
            if (!notes.length) { bodyEl.innerHTML = empty("notes"); return; }
            bodyEl.innerHTML = notes.map(function (n) {
                var url = toRoot + "bg/" + n.chapter + "/" + n.vlabel + "/";
                return '<div class="fc-notes-item">' +
                    '<a class="fc-notes-ref" href="' + url + '">📝 ' + escapeHtmlN(n.label || n._id) + "</a>" +
                    '<div class="fc-notes-item-text">' + escapeHtmlN(n.text) + "</div>" +
                "</div>";
            }).join("");
        }
        function renderHighlights() {
            var hls = getHighlights();
            updateCount("highlights", hls.length);
            if (!hls.length) { bodyEl.innerHTML = empty("highlights"); return; }
            bodyEl.innerHTML = hls.map(function (h) {
                var pathLabel = h.path.replace(/^.*\/bg\//, "BG ").replace(/\/$/, "").replace(/\//g, ".");
                return '<div class="fc-notes-item">' +
                    '<a class="fc-notes-ref" href="' + h.path + '">' + escapeHtmlN(pathLabel) + "</a>" +
                    '<div class="fc-notes-item-text"><span class="fc-notes-item-hl">' +
                        escapeHtmlN(h.text) +
                    "</span></div>" +
                "</div>";
            }).join("");
        }
        function empty(kind) {
            return '<p class="fc-notes-modal-empty">No ' + kind + " yet" +
                (currentChapter() ? " in this chapter" : "") + ".</p>";
        }
        function updateCount(kind, n) {
            var el = modal.querySelector('.fc-notes-tab-count[data-count="' + kind + '"]');
            if (el) el.textContent = String(n);
        }
        function setTab(name) {
            current = name;
            tabs.forEach(function (t) {
                t.classList.toggle("active", t.dataset.tab === name);
            });
            if (name === "notes") renderNotes();
            else if (name === "highlights") renderHighlights();
            else renderBookmarks();
        }

        function open() {
            modal.removeAttribute("hidden");
            body.dataset.notesModal = "1";
            if (scopeEl) {
                var ch = currentChapter();
                scopeEl.textContent = ch
                    ? "Scoped to Chapter " + ch + ". Switch chapters to see annotations elsewhere."
                    : "All annotations across the Gītā.";
            }
            // Refresh counts then render the current tab
            updateCount("bookmarks", getBookmarks().length);
            updateCount("notes", getNotes().length);
            updateCount("highlights", getHighlights().length);
            setTab(current);
        }
        function close() {
            modal.setAttribute("hidden", "");
            delete body.dataset.notesModal;
        }

        openBtn.addEventListener("click", open);
        modal.querySelector(".fc-notes-modal-backdrop").addEventListener("click", close);
        document.getElementById("fc-notes-modal-close").addEventListener("click", close);
        tabs.forEach(function (t) {
            t.addEventListener("click", function () { setTab(t.dataset.tab); });
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && body.dataset.notesModal === "1") {
                e.preventDefault();
                close();
            }
        });
    }

    // -------------------------------------------------------------------------
    // Word-for-word index page — fetch words.json, render as collapsible list,
    // wire diacritic-insensitive filter input.
    // -------------------------------------------------------------------------
    function wireWordsIndex() {
        var listEl = document.getElementById("fc-words-list");
        if (!listEl) return;
        var searchEl = document.getElementById("fc-words-search");
        var metaEl = document.getElementById("fc-words-meta");
        var allWords = null;
        var visible = [];

        function normalize(s) {
            return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        }
        function escapeHtml(s) {
            return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }

        function renderEntry(w) {
            var verses = w.verses.map(function (v) {
                return '<li><a href="' + toRoot + v.url + '">' + escapeHtml(v.ref) + '</a>' +
                    '<span class="fc-word-verse-gloss">— ' + escapeHtml(v.gloss) + '</span></li>';
            }).join("");
            var otherGlosses = w.glosses.slice(1).map(escapeHtml).join(" · ");
            return '<details class="fc-word-entry" id="' + escapeHtml(w.slug) + '">' +
                '<summary class="fc-word-summary">' +
                    '<span class="fc-word-iast">' + escapeHtml(w.iast) + '</span>' +
                    '<span class="fc-word-gloss">' + escapeHtml(w.glosses[0] || "") + '</span>' +
                    '<span class="fc-word-count">' + w.verses.length + " ×</span>" +
                '</summary>' +
                '<div class="fc-word-detail">' +
                    (otherGlosses ? '<div class="fc-word-other-glosses">also: ' + otherGlosses + '</div>' : "") +
                    '<ul class="fc-word-verses">' + verses + "</ul>" +
                '</div>' +
            '</details>';
        }

        function applyFilter() {
            var q = (searchEl ? searchEl.value : "").trim();
            var qn = normalize(q);
            visible = qn
                ? allWords.filter(function (w) { return w.slug.indexOf(qn) !== -1; })
                : allWords;
            if (metaEl) {
                metaEl.textContent = qn
                    ? visible.length + " of " + allWords.length + " terms match \"" + q + "\""
                    : allWords.length + " unique terms across the Gītā";
            }
            // Render in chunks so the initial paint is fast (the full list is ~3k entries).
            var slice = visible.slice(0, 400);
            listEl.innerHTML = slice.map(renderEntry).join("") +
                (visible.length > 400
                    ? '<p style="color:#8B7D6B; padding:0.8rem 0;">Showing the first 400 — refine the filter to see more.</p>'
                    : "");
            // After paint, jump to anchor if the URL has one
            if (location.hash && location.hash.length > 1) {
                var target = document.getElementById(location.hash.slice(1));
                if (target) {
                    target.open = true;
                    setTimeout(function () {
                        target.scrollIntoView({ behavior: "smooth", block: "center" });
                    }, 80);
                }
            }
        }

        fetch(toRoot + "assets/data/words.json")
            .then(function (r) { return r.json(); })
            .then(function (data) {
                allWords = data;
                applyFilter();
                if (searchEl) searchEl.addEventListener("input", applyFilter);
            })
            .catch(function (err) {
                console.warn("[fc] words.json load failed:", err);
                listEl.innerHTML = '<p style="color:#8B7D6B;">Failed to load vocabulary.</p>';
            });
    }

    // -------------------------------------------------------------------------
    // Reading-path banner: when arriving via /paths/{slug}/ → verse, show a
    // small banner above the verse with step N of M + prev/next within the path.
    // -------------------------------------------------------------------------
    function wirePathBanner() {
        var params = new URLSearchParams(location.search);
        var slug = params.get("path");
        var step = parseInt(params.get("step") || "0", 10);
        if (!slug || step < 1) return;
        // Only render on verse pages — has-sidebar pages where breadcrumbs exist.
        var breadcrumbs = document.querySelector("main .fc-breadcrumbs");
        if (!breadcrumbs) return;

        fetch(toRoot + "assets/data/paths.json")
            .then(function (r) { return r.json(); })
            .then(function (paths) {
                var path = null;
                for (var i = 0; i < paths.length; i++) {
                    if (paths[i].slug === slug) { path = paths[i]; break; }
                }
                if (!path || !path.verses || !path.verses.length) return;
                var idx = step - 1;
                if (idx < 0 || idx >= path.verses.length) return;
                var prev = idx > 0 ? path.verses[idx - 1] : null;
                var next = idx < path.verses.length - 1 ? path.verses[idx + 1] : null;

                var banner = document.createElement("div");
                banner.className = "fc-path-banner";
                var left = '<div class="fc-path-banner-left">' +
                    '<a href="' + toRoot + "paths/" + path.slug + '/">' + escapeBanner(path.name) + '</a>' +
                    '<span class="fc-path-banner-step">step ' + (idx + 1) + ' of ' + path.verses.length + '</span>' +
                    '</div>';
                var right = '<div class="fc-path-banner-right">';
                if (prev) {
                    right += '<a href="' + toRoot + prev.url + '?path=' + path.slug + '&step=' + idx + '">← ' + escapeBanner(prev.ref) + '</a>';
                }
                if (next) {
                    right += '<a href="' + toRoot + next.url + '?path=' + path.slug + '&step=' + (idx + 2) + '">' + escapeBanner(next.ref) + ' →</a>';
                } else {
                    right += '<span class="fc-path-done">Path complete ✓</span>';
                }
                right += "</div>";
                banner.innerHTML = left + right;
                breadcrumbs.parentNode.insertBefore(banner, breadcrumbs.nextSibling);
            })
            .catch(function (e) { console.warn("[fc] path banner load failed:", e); });
    }
    function escapeBanner(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    // -------------------------------------------------------------------------
    // Compare two verses — runs only on /compare/. Loads search.json (full
    // translation + Purport excerpt), populates two verse pickers grouped by
    // chapter, renders side-by-side. URL ?a= / ?b= sync.
    // -------------------------------------------------------------------------
    function wireCompare() {
        var sideA = document.getElementById("fc-compare-side-a");
        if (!sideA) return;
        var sideB = document.getElementById("fc-compare-side-b");
        var selA = document.getElementById("fc-compare-a");
        var selB = document.getElementById("fc-compare-b");
        var swapBtn = document.getElementById("fc-compare-swap");

        function escapeHtmlC(s) {
            return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }
        function vKey(v) {
            // Prefer the precomputed anchor id (works for BG + SB); fall back to legacy BG-style key.
            return v.id || ("bg-" + v.chapter + "-" + v.label);
        }

        function populate(sel, data) {
            // Group: BG chapters, then SB canto.chapter
            var bg = {};        // chapter → verses
            var sb = {};        // "canto.chapter" → verses
            data.forEach(function (v) {
                if (v.work === "SB") {
                    var k = v.canto + "." + v.chapter;
                    (sb[k] = sb[k] || []).push(v);
                } else {
                    (bg[v.chapter] = bg[v.chapter] || []).push(v);
                }
            });
            var html = "";
            // Bhagavad-gītā
            var bgKeys = Object.keys(bg).map(Number).sort(function (a, b) { return a - b; });
            if (bgKeys.length) {
                html += '<optgroup label="Bhagavad-gītā">';
                bgKeys.forEach(function (ch) {
                    bg[ch].forEach(function (v) {
                        html += '<option value="' + vKey(v) + '">' +
                            escapeHtmlC(v.ref) + '</option>';
                    });
                });
                html += "</optgroup>";
            }
            // Śrīmad-Bhāgavatam, grouped by canto.chapter
            var sbKeys = Object.keys(sb).sort(function (a, b) {
                var pa = a.split(".").map(Number);
                var pb = b.split(".").map(Number);
                return (pa[0] - pb[0]) || (pa[1] - pb[1]);
            });
            if (sbKeys.length) {
                html += '<optgroup label="Śrīmad-Bhāgavatam">';
                sbKeys.forEach(function (k) {
                    sb[k].forEach(function (v) {
                        html += '<option value="' + vKey(v) + '">' +
                            escapeHtmlC(v.ref) + '</option>';
                    });
                });
                html += "</optgroup>";
            }
            sel.innerHTML = html;
        }

        function findVerse(key, data) {
            for (var i = 0; i < data.length; i++) {
                if (vKey(data[i]) === key) return data[i];
            }
            return null;
        }

        function renderSide(el, v) {
            if (!v) {
                el.innerHTML = '<p style="color:#8B7D6B;">Select a verse…</p>';
                return;
            }
            el.innerHTML =
                '<h2 class="fc-compare-ref">' + escapeHtmlC(v.ref) + "</h2>" +
                '<div class="fc-compare-translation">' + escapeHtmlC(v.translation || "") + "</div>" +
                (v.purport
                    ? '<div class="fc-compare-purport-label">Purport excerpt</div>' +
                      '<div class="fc-compare-purport">' + escapeHtmlC(v.purport) + "</div>"
                    : "") +
                '<a class="fc-compare-link" href="' + toRoot + v.url + '">Open full verse →</a>';
        }

        function update(data, pushUrl) {
            var a = findVerse(selA.value, data);
            var b = findVerse(selB.value, data);
            renderSide(sideA, a);
            renderSide(sideB, b);
            if (pushUrl) {
                var p = new URLSearchParams();
                if (a) p.set("a", selA.value);
                if (b) p.set("b", selB.value);
                history.replaceState(null, "", location.pathname + "?" + p.toString());
            }
        }

        fetch(toRoot + "assets/data/search.json")
            .then(function (r) { return r.json(); })
            .then(function (data) {
                populate(selA, data);
                populate(selB, data);
                var params = new URLSearchParams(location.search);
                var a = params.get("a") || "bg-2-47";
                var b = params.get("b") || "bg-18-66";
                if (selA.querySelector('[value="' + a + '"]')) selA.value = a;
                if (selB.querySelector('[value="' + b + '"]')) selB.value = b;
                update(data, false);

                selA.addEventListener("change", function () { update(data, true); });
                selB.addEventListener("change", function () { update(data, true); });
                swapBtn.addEventListener("click", function () {
                    var t = selA.value; selA.value = selB.value; selB.value = t;
                    update(data, true);
                });
            })
            .catch(function (e) {
                console.warn("[fc] compare load failed:", e);
                sideA.innerHTML = '<p style="color:#8B7D6B;">Failed to load verse index.</p>';
                sideB.innerHTML = "";
            });
    }

    // -------------------------------------------------------------------------
    // Random verse — header button fetches the verse index and navigates.
    // -------------------------------------------------------------------------
    function wireRandomVerse() {
        var btn = document.getElementById("fc-random-verse");
        if (!btn) return;
        var cached = null;
        btn.addEventListener("click", function () {
            btn.disabled = true;
            (cached ? Promise.resolve(cached) :
                fetch(toRoot + "assets/data/verses.json").then(function (r) { return r.json(); })
                    .then(function (v) { cached = v; setCachedTotal(v.length); return v; })
            ).then(function (verses) {
                var v = verses[Math.floor(Math.random() * verses.length)];
                location.href = toRoot + v.url;
            }).catch(function (e) {
                console.warn("[fc] random verse failed:", e);
                btn.disabled = false;
            });
        });
    }

    // -------------------------------------------------------------------------
    // Service worker — registered on production hosts so the site works
    // offline after the first visit. Skipped on localhost/127.0.0.1 to avoid
    // stale-cache surprises during local development.
    // -------------------------------------------------------------------------
    function wireServiceWorker() {
        if (!("serviceWorker" in navigator)) return;
        var host = location.hostname;
        if (host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0") return;
        var swUrl = toRoot + "sw.js";
        window.addEventListener("load", function () {
            navigator.serviceWorker.register(swUrl).catch(function (err) {
                console.warn("[fc] SW registration failed:", err);
            });
        });
    }

    // -------------------------------------------------------------------------
    // Shortcuts help modal — '?' to toggle, Esc / backdrop / close-button to dismiss.
    // -------------------------------------------------------------------------
    function wireShortcutsModal() {
        var body = document.body;
        var modal = document.getElementById("fc-shortcuts-modal");
        if (!modal) return;
        function show() { body.setAttribute("data-shortcuts", "1"); }
        function hide() { body.removeAttribute("data-shortcuts"); }
        function toggle() { (body.getAttribute("data-shortcuts") === "1" ? hide : show)(); }

        document.addEventListener("keydown", function (e) {
            // Accept both '?' (US layout) and '/' with shift on some keyboards.
            if ((e.key === "?" || (e.key === "/" && e.shiftKey))
                && !e.ctrlKey && !e.metaKey && !e.altKey) {
                var t = e.target;
                if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
                e.preventDefault();
                toggle();
                return;
            }
            if (e.key === "Escape" && body.getAttribute("data-shortcuts") === "1") {
                e.preventDefault();
                hide();
            }
        });
        var closeBtn = document.getElementById("fc-shortcuts-close");
        if (closeBtn) closeBtn.addEventListener("click", hide);
        var backdrop = modal.querySelector(".fc-shortcuts-backdrop");
        if (backdrop) backdrop.addEventListener("click", hide);
    }

    // -------------------------------------------------------------------------
    // Per-verse notes — textarea in each verse block, saved per-verse in
    // localStorage. Sidebar list mirrors bookmarks.
    // -------------------------------------------------------------------------
    var NOTES_KEY = "fc-notes";
    function loadNotes() { return load(NOTES_KEY); }
    function saveNotes(d) { save(NOTES_KEY, d); }

    function escapeHtml(s) {
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    }

    function renderNotesSidebar() {
        var list = document.getElementById("fc-notes-list");
        var count = document.getElementById("fc-notes-count");
        if (!list || !count) return;
        var data = loadNotes();
        var entries = Object.keys(data).filter(function (k) {
            return data[k] && data[k].text && data[k].text.trim();
        });
        entries.sort(function (a, b) { return (data[a].updatedAt || 0) - (data[b].updatedAt || 0); });
        count.textContent = String(entries.length);
        if (!entries.length) {
            list.innerHTML = '<li class="fc-sb-empty">No notes yet — open any verse and write in the 📝 block.</li>';
            return;
        }
        list.innerHTML = entries.map(function (id) {
            var n = data[id];
            var url = toRoot + "bg/" + n.chapter + "/" + n.vlabel + "/";
            var preview = (n.text.split("\n")[0] || "").trim();
            if (preview.length > 56) preview = preview.slice(0, 53) + "…";
            return '<li><a href="' + url + '">' + escapeHtml(n.label) +
                ' — <span style="color:#8B7D6B; font-style:italic;">' + escapeHtml(preview) + '</span></a>' +
                ' <button type="button" class="fc-bm-remove" data-note-remove="' + id +
                '" title="Delete note">×</button></li>';
        }).join("");
    }

    function wireNotes() {
        // Hydrate textareas + wire save-on-input
        document.querySelectorAll(".fc-note-block[data-note-verse]").forEach(function (b) {
            var id = b.dataset.noteVerse;
            var ta = b.querySelector(".fc-note-textarea");
            var status = b.querySelector(".fc-note-status");
            var del = b.querySelector(".fc-note-delete");
            if (!ta) return;
            var data = loadNotes();
            var entry = data[id];
            if (entry && entry.text) {
                ta.value = entry.text;
                b.classList.add("has-content");
                b.setAttribute("open", "");
            }
            var t = null;
            function persist() {
                clearTimeout(t);
                t = setTimeout(function () {
                    var d = loadNotes();
                    var v = ta.value;
                    if (v && v.trim()) {
                        d[id] = {
                            text: v,
                            label: b.dataset.noteLabel || id,
                            chapter: parseInt(b.dataset.noteChapter || "0", 10),
                            vlabel: b.dataset.noteVlabel || "",
                            updatedAt: Date.now(),
                        };
                        b.classList.add("has-content");
                    } else {
                        delete d[id];
                        b.classList.remove("has-content");
                    }
                    saveNotes(d);
                    if (status) {
                        status.textContent = v && v.trim() ? "Saved" : "";
                        setTimeout(function () {
                            if (status.textContent === "Saved") status.textContent = "";
                        }, 1400);
                    }
                    renderNotesSidebar();
                }, 220);
            }
            ta.addEventListener("input", persist);
            ta.addEventListener("blur", persist);
            if (del) del.addEventListener("click", function () {
                ta.value = "";
                persist();
            });
        });

        // Sidebar remove buttons
        document.addEventListener("click", function (e) {
            var rm = e.target.closest("[data-note-remove]");
            if (!rm) return;
            var id = rm.dataset.noteRemove;
            var d = loadNotes();
            delete d[id];
            saveNotes(d);
            var block = document.querySelector('.fc-note-block[data-note-verse="' + id + '"]');
            if (block) {
                var ta = block.querySelector(".fc-note-textarea");
                if (ta) ta.value = "";
                block.classList.remove("has-content");
            }
            renderNotesSidebar();
        });

        renderNotesSidebar();
    }

    // -------------------------------------------------------------------------
    // Export — Markdown (human-readable) and JSON (machine-readable backup).
    // -------------------------------------------------------------------------
    function wireExport() {
        var mdBtn = document.getElementById("fc-export-md");
        var jsonBtn = document.getElementById("fc-export-json");
        if (!mdBtn && !jsonBtn) return;

        function absUrl(rel) {
            try { return new URL(toRoot + rel, location.href).href; }
            catch (e) { return rel; }
        }
        function pageOriginUrl(path) {
            try { return new URL(path, location.href).href; }
            catch (e) { return path; }
        }
        function download(filename, content, mime) {
            var blob = new Blob([content], { type: mime });
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
        }
        function snapshot() {
            return {
                exportedAt: new Date().toISOString(),
                site: "FolioCorpus · Bhagavad-gītā (shastra-folio)",
                bookmarks: load("fc-bookmarks"),
                highlights: load("fc-highlights"),
                notes: loadNotes(),
            };
        }
        function buildMarkdown(data) {
            var COLOR_EMOJI = { yellow:"🟡", green:"🟢", blue:"🔵", pink:"🩷", orange:"🟠", purple:"🟣" };
            var out = [];
            out.push("# My FolioCorpus notes");
            out.push("");
            out.push("Exported " + new Date().toLocaleString());
            out.push("");

            var bmIds = Object.keys(data.bookmarks || {});
            if (bmIds.length) {
                out.push("## Bookmarks (" + bmIds.length + ")");
                out.push("");
                bmIds.sort(function (a, b) { return (data.bookmarks[a].ts || 0) - (data.bookmarks[b].ts || 0); });
                bmIds.forEach(function (id) {
                    var b = data.bookmarks[id];
                    out.push("- [" + b.label + "](" + absUrl("bg/" + b.chapter + "/" + b.vlabel + "/") + ")");
                });
                out.push("");
            }

            var hlPages = Object.keys(data.highlights || {}).filter(function (p) {
                return (data.highlights[p] || []).length;
            });
            if (hlPages.length) {
                out.push("## Highlights");
                out.push("");
                hlPages.sort();
                hlPages.forEach(function (pg) {
                    var list = data.highlights[pg] || [];
                    out.push("### " + pg);
                    list.forEach(function (h) {
                        var e = COLOR_EMOJI[h.color] || "•";
                        out.push("- " + e + " " + (h.text || "").replace(/\n+/g, " "));
                    });
                    out.push("");
                });
            }

            var noteIds = Object.keys(data.notes || {}).filter(function (k) {
                return data.notes[k] && data.notes[k].text && data.notes[k].text.trim();
            });
            if (noteIds.length) {
                out.push("## Notes (" + noteIds.length + ")");
                out.push("");
                noteIds.sort(function (a, b) { return (data.notes[a].updatedAt || 0) - (data.notes[b].updatedAt || 0); });
                noteIds.forEach(function (id) {
                    var n = data.notes[id];
                    out.push("### [" + n.label + "](" + absUrl("bg/" + n.chapter + "/" + n.vlabel + "/") + ")");
                    out.push("");
                    n.text.split("\n").forEach(function (l) { out.push("> " + l); });
                    out.push("");
                });
            }

            if (out.length <= 4) {
                out.push("_No bookmarks, highlights, or notes yet._");
            }
            return out.join("\n");
        }

        function ts() {
            var d = new Date();
            var pad = function (n) { return n < 10 ? "0" + n : "" + n; };
            return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
                "-" + pad(d.getHours()) + pad(d.getMinutes());
        }
        if (mdBtn) mdBtn.addEventListener("click", function () {
            var data = snapshot();
            download("foliocorpus-" + ts() + ".md", buildMarkdown(data), "text/markdown;charset=utf-8");
        });
        if (jsonBtn) jsonBtn.addEventListener("click", function () {
            var data = snapshot();
            download("foliocorpus-" + ts() + ".json", JSON.stringify(data, null, 2), "application/json");
        });
    }

    // -------------------------------------------------------------------------
    // Verse of the day — landing-page card; reads docs/assets/data/verses.json
    // -------------------------------------------------------------------------
    function wireVerseOfDay() {
        var card = document.getElementById("fc-votd");
        if (!card) return;
        var refEl = card.querySelector(".fc-votd-ref");
        var textEl = card.querySelector(".fc-votd-text");
        var linkEl = card.querySelector(".fc-votd-link");
        var reflectBlock = document.getElementById("fc-votd-reflect");
        var reflectQ = document.getElementById("fc-votd-reflect-q");
        var reflectA = document.getElementById("fc-votd-reflect-answer");
        var reflectStatus = document.getElementById("fc-votd-reflect-status");

        function loadNotesMap() {
            try { return JSON.parse(localStorage.getItem("fc-notes") || "{}") || {}; }
            catch (e) { return {}; }
        }
        function saveNotesMap(d) {
            try { localStorage.setItem("fc-notes", JSON.stringify(d)); } catch (e) {}
        }

        var url = toRoot + "assets/data/verses.json";
        fetch(url).then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
        }).then(function (verses) {
            if (!Array.isArray(verses) || !verses.length) throw new Error("empty index");
            setCachedTotal(verses.length);
            var today = new Date();
            var start = new Date(today.getFullYear(), 0, 0);
            var doy = Math.floor((today - start) / 86400000);
            var idx = ((doy - 1) % verses.length + verses.length) % verses.length;
            var v = verses[idx];
            if (refEl) refEl.textContent = v.ref;
            if (textEl) textEl.textContent = v.snippet || "";
            if (linkEl) linkEl.href = toRoot + v.url;
            card.removeAttribute("hidden");

            // Daily reflection prompt — bound to the same note storage as the verse page.
            if (v.reflection && reflectBlock && reflectQ && reflectA) {
                reflectQ.textContent = v.reflection;
                var noteId = "bg-" + v.chapter + "-" + v.label;
                var notes = loadNotesMap();
                var existing = notes[noteId];
                if (existing && existing.text) reflectA.value = existing.text;
                reflectBlock.removeAttribute("hidden");

                var t = null;
                function persist() {
                    clearTimeout(t);
                    t = setTimeout(function () {
                        var d = loadNotesMap();
                        var txt = reflectA.value;
                        if (txt && txt.trim()) {
                            d[noteId] = {
                                text: txt,
                                label: v.ref,
                                chapter: v.chapter,
                                vlabel: v.label,
                                updatedAt: Date.now(),
                            };
                        } else {
                            delete d[noteId];
                        }
                        saveNotesMap(d);
                        if (reflectStatus) {
                            reflectStatus.textContent = txt && txt.trim()
                                ? "Saved to your notes for " + v.ref
                                : "";
                            setTimeout(function () {
                                if (reflectStatus && reflectStatus.textContent.indexOf("Saved") === 0) {
                                    reflectStatus.textContent = "";
                                }
                            }, 1800);
                        }
                    }, 220);
                }
                reflectA.addEventListener("input", persist);
                reflectA.addEventListener("blur", persist);
            }
        }).catch(function (err) {
            console.warn("[fc] verse-of-day failed:", err);
            card.setAttribute("hidden", "");
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
            body.classList.add("presentation");
            if (isChapter) {
                currentIdx = findNearestVerseIdx();
                showCurrent();
            } else {
                // Single-verse page: the only block must be marked current,
                // otherwise the "hide non-current blocks" CSS blanks the page.
                if (blocks.length) blocks[0].classList.add("fc-presentation-current");
                updateCounter();
            }
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
    // TTS voice + rate controls — populate Voice <select> from speechSynthesis
    // and a Rate slider. Preferences persist in localStorage and are applied by
    // wireReadout() when speaking.
    // -------------------------------------------------------------------------
    var TTS_KEY = "fc-tts-prefs";
    function loadTtsPrefs() {
        try { return JSON.parse(localStorage.getItem(TTS_KEY) || "{}") || {}; }
        catch (e) { return {}; }
    }
    function saveTtsPrefs(p) {
        try { localStorage.setItem(TTS_KEY, JSON.stringify(p)); } catch (e) {}
    }

    // Pick the best available Samantha (macOS English voice) — Premium >
    // Enhanced > regular. Returns null on Windows/Linux/Android where she
    // isn't installed.
    function findPreferredVoice(voices) {
        if (!voices || !voices.length) return null;
        var orders = [
            /^Samantha.*Premium/i,
            /^Samantha.*Enhanced/i,
            /^Samantha\b/i,
        ];
        for (var i = 0; i < orders.length; i++) {
            for (var j = 0; j < voices.length; j++) {
                if (orders[i].test(voices[j].name)) return voices[j];
            }
        }
        return null;
    }

    function wireTtsControls() {
        var synth = window.speechSynthesis;
        var container = document.getElementById("fc-tts-controls");
        if (!synth || !container) return;
        var select = container.querySelector("#fc-tts-voice");
        var rate = container.querySelector("#fc-tts-rate");
        var rateVal = container.querySelector(".fc-tts-rate-val");
        var enabled = container.querySelector("#fc-tts-enabled");
        var enabledLabel = container.querySelector(".fc-tts-master-label");
        if (!select || !rate) return;
        container.hidden = false;
        var prefs = loadTtsPrefs();

        // Master on/off — controls visibility of ▶ buttons + voice/rate UI.
        function applyEnabled(on) {
            if (on) html.removeAttribute("data-tts-off");
            else html.setAttribute("data-tts-off", "1");
            if (enabledLabel) enabledLabel.textContent = on ? "On" : "Off";
            if (!on) {
                try { synth.cancel(); } catch (e) {}
            }
        }
        if (enabled) {
            enabled.checked = prefs.enabled !== false;
            applyEnabled(enabled.checked);
            enabled.addEventListener("change", function () {
                prefs.enabled = enabled.checked;
                saveTtsPrefs(prefs);
                window.FC_TTS_PREFS = prefs;
                applyEnabled(enabled.checked);
            });
        }

        function populate() {
            var voices = synth.getVoices();
            if (!voices || !voices.length) return;
            var prev = select.value;
            select.innerHTML = "";
            voices.slice().sort(function (a, b) {
                var ae = /^en/i.test(a.lang) ? 0 : 1;
                var be = /^en/i.test(b.lang) ? 0 : 1;
                if (ae !== be) return ae - be;
                return a.name.localeCompare(b.name);
            }).forEach(function (v) {
                var o = document.createElement("option");
                o.value = v.name;
                o.textContent = v.name + " (" + v.lang + ")";
                select.appendChild(o);
            });
            // Resolve which voice to select:
            //   1. Explicit user pref (if still installed)
            //   2. Samantha if available — preferred default on macOS
            //   3. Previously-shown value (during voiceschanged repopulates)
            if (prefs.voice && voices.some(function (v) { return v.name === prefs.voice; })) {
                select.value = prefs.voice;
            } else {
                var preferred = findPreferredVoice(voices);
                if (preferred) {
                    select.value = preferred.name;
                    if (!prefs.voice) {
                        // First-time visit on a Mac: bake Samantha in so future
                        // pages stop falling back to the browser default.
                        prefs.voice = preferred.name;
                        saveTtsPrefs(prefs);
                    }
                } else if (prev) {
                    select.value = prev;
                }
            }
            window.FC_TTS_VOICES = voices;
            window.FC_TTS_PREFS = prefs;
        }
        populate();
        if (typeof synth.addEventListener === "function") {
            synth.addEventListener("voiceschanged", populate);
        }

        select.addEventListener("change", function () {
            prefs.voice = select.value;
            saveTtsPrefs(prefs);
            window.FC_TTS_PREFS = prefs;
        });
        rate.value = prefs.rate || 1.0;
        if (rateVal) rateVal.textContent = parseFloat(rate.value).toFixed(1) + "×";
        rate.addEventListener("input", function () {
            var v = parseFloat(rate.value);
            prefs.rate = v;
            saveTtsPrefs(prefs);
            if (rateVal) rateVal.textContent = v.toFixed(1) + "×";
            window.FC_TTS_PREFS = prefs;
        });

        window.FC_TTS_PREFS = prefs;
    }

    // -------------------------------------------------------------------------
    // Read-aloud (Web Speech API): inject ▶ buttons next to Translation and
    // commentary section labels. Click to speak, click again to stop. Only
    // one utterance plays at a time.
    // -------------------------------------------------------------------------
    // ─────────────────────────────────────────────────────────────────────
    // TTS text cleanup: IAST diacritics → English-reader phonetic so voices
    // don't mangle Sanskrit names; strip badge / button text; normalise
    // quotes, dashes, whitespace, and bullet markers that some engines vocalise.
    // ─────────────────────────────────────────────────────────────────────
    var IAST_PAIRS = [
        ["ṝ", "ree"], ["ṛ", "ri"], ["ḹ", "lree"], ["ḷ", "lri"],
        ["ā", "aa"], ["ī", "ee"], ["ū", "oo"],
        ["ṣ", "sh"], ["ś", "sh"],
        ["ñ", "n"], ["ṅ", "n"],
        ["ṭ", "t"], ["ḍ", "d"], ["ṇ", "n"],
        ["ṁ", "m"], ["ḥ", "h"],
    ];
    function iastToPhonetic(text) {
        var out = text;
        for (var i = 0; i < IAST_PAIRS.length; i++) {
            var src = IAST_PAIRS[i][0], dst = IAST_PAIRS[i][1];
            out = out.split(src).join(dst);
            var SRC = src.toUpperCase();
            var DST = dst.charAt(0).toUpperCase() + dst.slice(1);
            out = out.split(SRC).join(DST);
        }
        // 'c' (palatal) → 'ch'; don't touch 'ch'.
        out = out.replace(/c(?!h)/g, "ch").replace(/C(?!h)/g, "Ch");
        return out;
    }
    function cleanForSpeech(text) {
        if (!text) return "";
        var t = text
            .replace(/‘|’/g, "'")
            .replace(/“|”/g, '"')
            .replace(/[—–]/g, " — ")              // em/en dash → spoken as a pause
            .replace(/[•·●▪►▶▸]/g, " ")           // bullets / markers
            .replace(/\s*\n\s*/g, ". ")           // newlines act as sentence breaks
            .replace(/\s+/g, " ")
            .replace(/\.{2,}/g, ".")
            .replace(/\s*\.\s*\./g, ". ");        // collapse stacked periods
        t = iastToPhonetic(t);
        return t.trim();
    }
    function extractTextForSpeech(rootEl) {
        // Clone so we can strip UI bits without affecting the live DOM.
        var clone = rootEl.cloneNode(true);
        clone.querySelectorAll(
            ".fc-section-label, .cr-samp-badge, .fc-readout-btn, " +
            ".cr-acarya-label, .fc-pg-age-filter, .fc-source-link, .fc-note-block"
        ).forEach(function (el) { el.remove(); });
        // Add a sentence break after each list item so the engine pauses.
        clone.querySelectorAll("li").forEach(function (li) {
            var t = (li.textContent || "").trim();
            if (t && !/[.!?]$/.test(t)) li.textContent = t + ".";
        });
        // Acarya names should be followed by a pause before their translation.
        clone.querySelectorAll(".cr-acarya-name").forEach(function (n) {
            var t = (n.textContent || "").trim();
            if (t && !/[.!?]$/.test(t)) n.textContent = t + ".";
        });
        return clone.textContent || "";
    }

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
            // Master switch off — no-op.
            var prefs = window.FC_TTS_PREFS || loadTtsPrefs();
            if (prefs.enabled === false) return;
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
            var prefs = window.FC_TTS_PREFS || loadTtsPrefs();
            u.rate = prefs.rate || 1.0;
            u.pitch = 1.0;
            u.volume = 1.0;
            // Voice lookup: explicit pref → Samantha fallback → browser default.
            var voices = window.FC_TTS_VOICES;
            if (!voices) { try { voices = synth.getVoices(); window.FC_TTS_VOICES = voices; } catch (e) {} }
            var chosen = null;
            if (prefs.voice && voices) {
                for (var i = 0; i < voices.length; i++) {
                    if (voices[i].name === prefs.voice) { chosen = voices[i]; break; }
                }
            }
            if (!chosen && voices) chosen = findPreferredVoice(voices);
            if (chosen) u.voice = chosen;
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
            if (t.querySelector(".fc-readout-btn")) return;
            var btn = makeBtn();
            t.appendChild(btn);
            btn.addEventListener("click", function (e) {
                e.stopPropagation();
                speak(cleanForSpeech(extractTextForSpeech(t)), btn);
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
                    speak(cleanForSpeech(extractTextForSpeech(s)), btn);
                });
            });
        });

        // Stop on page-leave / pen-mode change (pen overlay may capture pointers)
        window.addEventListener("beforeunload", stopSpeaking);
    }

    // -------------------------------------------------------------------------
    // Search within chapter + cross-chapter fallback. Features:
    //   - diacritic-insensitive matching (Krishna finds Kṛṣṇa)
    //   - inline highlight via CSS Custom Highlight API (graceful fallback)
    //   - "/" keyboard shortcut focuses the input
    //   - Esc clears and blurs
    //   - cross-chapter results panel from assets/data/search.json (lazy fetch)
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
        var globalPanel = document.getElementById("fc-search-global");
        var globalList = document.getElementById("fc-search-global-list");
        var globalHeader = document.getElementById("fc-search-global-header");
        var body = document.body;

        function normalize(s) {
            // NFD-decompose, drop combining diacritical marks (U+0300–U+036F), lowercase.
            return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        }
        function escapeHtmlFor(s) {
            return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
                .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
        }
        function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

        // Pre-compute normalised text per block so refilter stays fast.
        var blockNorm = blocks.map(function (b) { return normalize(b.textContent); });

        // Current chapter (derived from any verse-block id).
        var currentChapter = null;
        for (var bi = 0; bi < blocks.length; bi++) {
            var mm = blocks[bi].id.match(/^bg-(\d+)-/);
            if (mm) { currentChapter = parseInt(mm[1], 10); break; }
        }

        // Cross-chapter index — fetched on first non-trivial query.
        var globalIndex = null;
        var globalLoading = false;
        function ensureGlobalIndex() {
            if (globalIndex || globalLoading) return Promise.resolve(globalIndex);
            globalLoading = true;
            return fetch(toRoot + "assets/data/search.json")
                .then(function (r) { return r.json(); })
                .then(function (idx) {
                    globalIndex = idx.map(function (v) {
                        v._n = normalize(v.translation + " " + (v.purport || ""));
                        return v;
                    });
                    return globalIndex;
                })
                .catch(function (e) {
                    console.warn("[fc] search index load failed:", e);
                    globalLoading = false;
                    return null;
                });
        }

        // Inline match highlight via CSS Custom Highlight API.
        var hasHighlightAPI = !!(window.CSS && window.CSS.highlights && window.Highlight && typeof Range !== "undefined");
        function clearHighlight() {
            if (hasHighlightAPI) { try { CSS.highlights.delete("fc-search"); } catch (e) {} }
        }
        function highlightOnPage(needle) {
            if (!hasHighlightAPI) return;
            if (!needle) { clearHighlight(); return; }
            var nLower = needle.toLowerCase();
            var hl = new Highlight();
            blocks.forEach(function (b) {
                if (b.classList.contains("fc-hidden-by-search")) return;
                var walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT, null);
                var node;
                while ((node = walker.nextNode())) {
                    // Skip text inside note textareas / readout buttons / segmented controls.
                    var p = node.parentElement;
                    if (!p) continue;
                    if (p.closest(".fc-note-block, .fc-readout-btn, .fc-pg-age-filter, .fc-bookmark-btn, .fc-verse-permalink")) continue;
                    var lower = node.textContent.toLowerCase();
                    var idx = lower.indexOf(nLower);
                    while (idx !== -1) {
                        var r = new Range();
                        r.setStart(node, idx);
                        r.setEnd(node, idx + needle.length);
                        hl.add(r);
                        idx = lower.indexOf(nLower, idx + needle.length);
                    }
                }
            });
            try { CSS.highlights.set("fc-search", hl); } catch (e) {}
        }

        function renderGlobal(q, qNorm) {
            if (!globalPanel || !globalIndex) return;
            if (q.length < 2) { globalPanel.setAttribute("hidden", ""); return; }
            var matches = [];
            for (var k = 0; k < globalIndex.length; k++) {
                var entry = globalIndex[k];
                if (currentChapter != null && entry.chapter === currentChapter) continue;
                if (entry._n.indexOf(qNorm) !== -1) {
                    matches.push(entry);
                    if (matches.length >= 20) break;
                }
            }
            if (!matches.length) { globalPanel.setAttribute("hidden", ""); return; }
            globalHeader.textContent = "Also found in " + matches.length + " other verse" +
                (matches.length === 1 ? "" : "s") + " across the Gītā" +
                (matches.length >= 20 ? " (first 20 shown)" : "");
            var qSafeRe = new RegExp("(" + escapeRegex(q) + ")", "ig");
            globalList.innerHTML = matches.map(function (e) {
                var src = e.translation + (e.purport ? " — " + e.purport : "");
                var srcNorm = normalize(src);
                var idx = srcNorm.indexOf(qNorm);
                var preview;
                if (idx === -1) {
                    preview = src.slice(0, 160);
                } else {
                    var start = Math.max(0, idx - 40);
                    var end = Math.min(src.length, idx + qNorm.length + 100);
                    preview = (start > 0 ? "…" : "") + src.slice(start, end) + (end < src.length ? "…" : "");
                }
                var safePreview = escapeHtmlFor(preview);
                // Bold matches in preview (best-effort exact-substring; diacritic mismatches stay un-marked).
                safePreview = safePreview.replace(qSafeRe, "<mark>$1</mark>");
                return '<li><a href="' + toRoot + e.url + '">' +
                    '<div class="fc-search-ref">' + escapeHtmlFor(e.ref) + '</div>' +
                    '<div class="fc-search-preview">' + safePreview + '</div></a></li>';
            }).join("");
            globalPanel.removeAttribute("hidden");
        }

        function refilter() {
            var q = input.value.trim();
            var qNorm = normalize(q);
            body.dataset.searching = q ? "1" : "";

            var matches = 0;
            blocks.forEach(function (b, i) {
                var hit = !q || blockNorm[i].indexOf(qNorm) !== -1;
                b.classList.toggle("fc-hidden-by-search", !hit);
                var pill = pillByVerse[b.id];
                if (pill) pill.classList.toggle("fc-search-dim", !hit && !!q);
                if (hit) matches++;
            });
            dividers.forEach(function (d) {
                var prev = d.previousElementSibling;
                var hidePrev = prev && prev.classList.contains("fc-hidden-by-search");
                d.classList.toggle("fc-hidden-by-search", hidePrev);
            });
            if (currentEl) currentEl.textContent = q ? (matches + " / " + blocks.length) : "";
            highlightOnPage(q);

            if (q.length >= 2 && globalPanel) {
                ensureGlobalIndex().then(function () { renderGlobal(q, qNorm); });
            } else if (globalPanel) {
                globalPanel.setAttribute("hidden", "");
            }
        }

        input.addEventListener("input", refilter);
        input.addEventListener("keydown", function (e) {
            if (e.key === "Escape") {
                input.value = "";
                refilter();
                input.blur();
            }
        });

        // "/" focuses the search input from anywhere (when not typing in a field).
        document.addEventListener("keydown", function (e) {
            if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
            var t = e.target;
            if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
            e.preventDefault();
            input.focus();
            input.select();
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
    wireTtsControls();
    wireReadout();
    wireAgeFilter();
    wireMobileDrawers();
    wirePresentation();
    wireNotes();
    wireExport();
    wireVerseOfDay();
    wireShortcutsModal();
    wireServiceWorker();
    wireReadingProgress();
    wireFlashcards();
    wireRandomVerse();
    wireShareImage();
    wirePermalinkHighlight();
    wireCompare();
    wirePathBanner();
    wireWordsIndex();
    wireNotesModal();
})();
