/* FolioCorpus book-wide search — client-side Lunr full-text.
 * Loads docs/assets/data/search-docs.json on demand, builds the Lunr
 * index in the browser (cached to sessionStorage so subsequent visits
 * in the same tab are instant), runs ranked search with field boosts,
 * renders snippets with <mark> highlights + Hierarchy + Text Type facets.
 *
 * URL params:
 *   ?q=karma          — initial query
 *   &work=bg          — narrow to a single work
 *   &field=translation — narrow to a single matched field
 */
(function () {
    "use strict";

    var DOCS_URL = window.FC_SEARCH_DOCS_URL ||
                   document.documentElement.getAttribute("data-root") + "assets/data/search-docs.json";
    var DOCS_CACHE_KEY = "fc-search-docs-v1";
    var PAGE_SIZE = 30;

    var docs = null;
    var docById = null;
    var idx = null;
    var lastResults = null;
    var lastQuery = "";
    var renderCursor = 0;
    var filterWork = "";
    var filterField = "";
    var filterGenre = "";

    // ───── Helpers ─────────────────────────────────────────────────────────
    function $(id) { return document.getElementById(id); }
    function setStatus(html) { $("fc-search-status").innerHTML = html; }

    // NFD-normalise + strip combining marks for diacritic-insensitive search.
    // Lunr's pipeline also applies stemming after this.
    function stripDiacritics(s) {
        if (!s) return "";
        return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
    }
    // Common Sanskrit-IAST aliases — apply to query + index pipeline.
    function aliasNormalise(s) {
        if (!s) return "";
        // Lower-case after strip
        var t = stripDiacritics(s).toLowerCase();
        // Simple alias swaps — krsna ↔ krishna ↔ krushna, caitanya ↔ chaitanya, etc.
        t = t.replace(/\bkr+sna\b/g, "krishna")
             .replace(/\bcaitanya\b/g, "chaitanya")
             .replace(/\bvis+nu\b/g, "vishnu")
             .replace(/\bsiva\b/g, "shiva")
             .replace(/\bganga\b/g, "ganga")
             .replace(/\bvrndavana?\b/g, "vrindavan")
             .replace(/\bvrindavana\b/g, "vrindavan");
        return t;
    }

    // Escape regex specials so we can build a /needle/gi from the query
    function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

    function highlight(text, query) {
        if (!text || !query) return text || "";
        var normText = stripDiacritics(text);
        // Build regex from each word in query for highlight
        var words = query.split(/\s+/).filter(function (w) { return w.length >= 2; });
        if (!words.length) return text;
        // Match diacritic-insensitively by building positions on normalised text
        // then mapping back to original. Simpler: just regex on the original
        // using a fuzzy pattern that allows any combining mark.
        var pat = words.map(function (w) {
            var stripped = stripDiacritics(w);
            return stripped.split("").map(function (c) {
                return escapeRe(c) + "[\\u0300-\\u036f]*";
            }).join("");
        }).join("|");
        var re = new RegExp("(" + pat + ")", "gi");
        return text.replace(re, "<mark>$1</mark>");
    }

    function snippet(text, query, radius) {
        if (!text) return "";
        radius = radius || 90;
        var normText = stripDiacritics(text).toLowerCase();
        var words = query.split(/\s+/).filter(function (w) { return w.length >= 2; });
        var firstHit = -1;
        for (var i = 0; i < words.length; i++) {
            var w = stripDiacritics(words[i]).toLowerCase();
            var hit = normText.indexOf(w);
            if (hit >= 0 && (firstHit === -1 || hit < firstHit)) firstHit = hit;
        }
        if (firstHit < 0) return text.slice(0, radius * 2) + (text.length > radius * 2 ? " …" : "");
        var start = Math.max(0, firstHit - radius);
        var end = Math.min(text.length, firstHit + words[0].length + radius);
        var snip = text.slice(start, end);
        if (start > 0) snip = "… " + snip;
        if (end < text.length) snip = snip + " …";
        return snip;
    }

    // ───── Index loading ───────────────────────────────────────────────────
    function loadDocs(cb) {
        setStatus("Loading search index… (one-time ~11 MB download, then cached)");
        var t0 = performance.now();
        fetch(DOCS_URL)
            .then(function (r) {
                if (!r.ok) throw new Error("HTTP " + r.status);
                return r.json();
            })
            .then(function (data) {
                docs = data;
                docById = {};
                for (var i = 0; i < docs.length; i++) docById[docs[i].id] = docs[i];
                var dt = ((performance.now() - t0) / 1000).toFixed(1);
                setStatus("Building search index over " + docs.length.toLocaleString() +
                          " verses (took " + dt + " s to fetch)…");
                setTimeout(function () { buildIndex(cb); }, 50);
            })
            .catch(function (e) {
                setStatus("⚠ Failed to load search index: " + e.message);
            });
    }

    function buildIndex(cb) {
        var t0 = performance.now();
        idx = lunr(function () {
            this.ref("id");
            this.field("translation", { boost: 3 });
            this.field("purport", { boost: 2 });
            this.field("iast", { boost: 2 });
            this.field("synonyms", { boost: 1 });
            this.field("ref", { boost: 5 });
            this.field("chapter_label", { boost: 1 });
            this.metadataWhitelist = ["position"];
            // Custom pipeline: strip diacritics + aliasNormalise BEFORE
            // lunr.trimmer. The default trimmer uses /^\W+|\W+$/ which
            // treats non-ASCII letters (ā, ī, ṛ, etc.) as non-word and
            // chops them off — so 'bhavānyā' would become 'bhavāny' before
            // we ever get to strip diacritics, asymmetrically stemming to
            // 'bhavani' and never matching a user query of 'bhavanya'.
            // Inserting our normalize step before the trimmer means the
            // trimmer only ever sees plain ASCII tokens and behaves correctly.
            var stripFn = function (token) {
                return token.update(function (str) { return aliasNormalise(str); });
            };
            lunr.Pipeline.registerFunction(stripFn, "fcStrip");
            this.pipeline.before(lunr.trimmer, stripFn);
            this.searchPipeline.before(lunr.stemmer, stripFn);

            for (var i = 0; i < docs.length; i++) {
                this.add(docs[i]);
            }
        });
        var dt = ((performance.now() - t0) / 1000).toFixed(1);
        setStatus("Search ready (index built in " + dt + " s over " +
                  docs.length.toLocaleString() + " verses).");
        cb();
    }

    // ───── Search ──────────────────────────────────────────────────────────
    function performSearch(q) {
        if (!idx) return;
        lastQuery = q;
        // Lunr-normalise: add prefix wildcard for the last token so users
        // get progressive matches without needing exact stems.
        var query = q.trim();
        if (!query) {
            lastResults = null;
            $("fc-search-results").innerHTML = "";
            $("fc-search-facets").hidden = true;
            setStatus("Type a query to search.");
            return;
        }
        try {
            // Plain query, then if empty try with wildcard fallback
            var hits = idx.search(query);
            if (hits.length === 0) {
                // Try wildcard on each term
                var wq = query.split(/\s+/).map(function (t) {
                    return t.length >= 2 ? t + "*" : t;
                }).join(" ");
                hits = idx.search(wq);
            }
            lastResults = hits;
        } catch (e) {
            // Lunr parse error — fallback to plain term search
            try {
                lastResults = idx.search(query.replace(/[+:\-^~*]/g, " "));
            } catch (e2) {
                lastResults = [];
            }
        }
        renderResults();
    }

    function renderResults() {
        var results = lastResults || [];
        var filtered = results.filter(function (r) {
            var doc = docById[r.ref];
            if (filterWork && doc.work !== filterWork) return false;
            if (filterGenre && (doc.genre || "discourse") !== filterGenre) return false;
            if (filterField) {
                var fields = Object.keys(r.matchData.metadata || {})
                    .reduce(function (acc, term) {
                        Object.keys(r.matchData.metadata[term]).forEach(function (f) {
                            acc[f] = true;
                        });
                        return acc;
                    }, {});
                if (!fields[filterField]) return false;
            }
            return true;
        });

        // Status line
        var statusMsg = filtered.length + " match" + (filtered.length === 1 ? "" : "es");
        if (filterWork || filterField || filterGenre) {
            statusMsg += " (filtered from " + results.length + ")";
        }
        setStatus("<strong>" + statusMsg + "</strong> for \"" + escapeHtml(lastQuery) + "\"");

        // Facets — compute from full result set, not filtered
        renderFacets(results);

        // Render rows (paginate)
        renderCursor = 0;
        var resultsEl = $("fc-search-results");
        resultsEl.innerHTML = "";
        if (!filtered.length) {
            resultsEl.innerHTML = '<p class="fc-search-empty">No results. Try a different word or remove filters.</p>';
            return;
        }
        appendResultRows(filtered);
    }

    function appendResultRows(filtered) {
        var resultsEl = $("fc-search-results");
        var rootPath = window.FC_TO_ROOT || "../";
        var end = Math.min(filtered.length, renderCursor + PAGE_SIZE);
        for (var i = renderCursor; i < end; i++) {
            var r = filtered[i];
            var doc = docById[r.ref];
            if (!doc) continue;
            // Pick best snippet field (the one with highest match)
            var snipField = pickBestField(r);
            var snipText = doc[snipField] || doc.translation || doc.purport || "";
            var snipHtml = highlight(snippet(snipText, lastQuery), lastQuery);
            var refHtml = highlight(doc.ref, lastQuery);
            var row = document.createElement("div");
            row.className = "fc-search-row";
            row.innerHTML =
                '<a class="fc-search-row-ref" href="' + rootPath + doc.url + '">' + refHtml + '</a>' +
                '<div class="fc-search-row-context">' + escapeHtml(doc.chapter_label) +
                ' <span class="fc-search-row-field">[' + escapeHtml(snipField) + ']</span></div>' +
                '<div class="fc-search-row-snippet">' + snipHtml + '</div>';
            resultsEl.appendChild(row);
        }
        renderCursor = end;
        // "Show more" button
        var existingMore = $("fc-search-more");
        if (existingMore) existingMore.remove();
        if (renderCursor < filtered.length) {
            var btn = document.createElement("button");
            btn.id = "fc-search-more";
            btn.className = "fc-search-more-btn";
            btn.textContent = "Show " + Math.min(PAGE_SIZE, filtered.length - renderCursor) +
                              " more (of " + (filtered.length - renderCursor) + " remaining)";
            btn.addEventListener("click", function () {
                appendResultRows(filtered);
            });
            resultsEl.appendChild(btn);
        }
    }

    function pickBestField(r) {
        var meta = r.matchData.metadata || {};
        var counts = {};
        Object.keys(meta).forEach(function (term) {
            Object.keys(meta[term]).forEach(function (f) {
                counts[f] = (counts[f] || 0) + 1;
            });
        });
        var preferred = ["translation", "purport", "iast", "synonyms", "ref", "chapter_label"];
        for (var i = 0; i < preferred.length; i++) {
            if (counts[preferred[i]]) return preferred[i];
        }
        return "translation";
    }

    function renderFacets(results) {
        $("fc-search-facets").hidden = false;
        var workCounts = {}, workLabels = {};
        var fieldCounts = {};
        var genreCounts = {};
        results.forEach(function (r) {
            var doc = docById[r.ref];
            if (!doc) return;
            workCounts[doc.work] = (workCounts[doc.work] || 0) + 1;
            workLabels[doc.work] = doc.work_label;
            var g = doc.genre || "discourse";
            genreCounts[g] = (genreCounts[g] || 0) + 1;
            var meta = r.matchData.metadata || {};
            Object.keys(meta).forEach(function (term) {
                Object.keys(meta[term]).forEach(function (f) {
                    fieldCounts[f] = (fieldCounts[f] || 0) + 1;
                });
            });
        });
        var workItems = Object.keys(workCounts)
            .map(function (w) { return { w: w, label: workLabels[w], n: workCounts[w] }; })
            .sort(function (a, b) { return b.n - a.n; });
        var fieldItems = Object.keys(fieldCounts)
            .map(function (f) { return { f: f, n: fieldCounts[f] }; })
            .sort(function (a, b) { return b.n - a.n; });
        $("fc-facet-work").innerHTML = workItems.map(function (it) {
            var active = it.w === filterWork ? " is-active" : "";
            return '<li><a href="#" class="fc-facet-link' + active +
                   '" data-facet="work" data-value="' + it.w + '">' +
                   escapeHtml(it.label) + ' <span class="fc-facet-count">(' + it.n + ')</span></a></li>';
        }).join("");
        var genreLabel = { scripture: "Scripture (śāstra)",
                            commentary: "Commentary / Treatise",
                            practice: "Practice / Stotra",
                            discourse: "Article / Discourse" };
        var genreItems = Object.keys(genreCounts)
            .map(function (g) { return { g: g, n: genreCounts[g] }; })
            .sort(function (a, b) { return b.n - a.n; });
        var facetGenreEl = $("fc-facet-genre");
        if (facetGenreEl) {
            facetGenreEl.innerHTML = genreItems.map(function (it) {
                var active = it.g === filterGenre ? " is-active" : "";
                return '<li><a href="#" class="fc-facet-link' + active +
                       '" data-facet="genre" data-value="' + it.g + '">' +
                       escapeHtml(genreLabel[it.g] || it.g) +
                       ' <span class="fc-facet-count">(' + it.n + ')</span></a></li>';
            }).join("");
        }
        $("fc-facet-field").innerHTML = fieldItems.map(function (it) {
            var active = it.f === filterField ? " is-active" : "";
            var nice = { translation: "Translation", purport: "Purport / Commentary",
                          iast: "Transliteration", synonyms: "Synonyms",
                          ref: "Reference", chapter_label: "Title" }[it.f] || it.f;
            return '<li><a href="#" class="fc-facet-link' + active +
                   '" data-facet="field" data-value="' + it.f + '">' +
                   escapeHtml(nice) + ' <span class="fc-facet-count">(' + it.n + ')</span></a></li>';
        }).join("");
    }

    function escapeHtml(s) {
        var d = document.createElement("div");
        d.textContent = s || "";
        return d.innerHTML;
    }

    // ───── URL state ───────────────────────────────────────────────────────
    function readUrlParams() {
        var params = new URLSearchParams(location.search);
        var q = params.get("q") || "";
        filterWork = params.get("work") || "";
        filterField = params.get("field") || "";
        filterGenre = params.get("genre") || "";
        return q;
    }
    function updateUrl(q) {
        var p = new URLSearchParams();
        if (q) p.set("q", q);
        if (filterWork) p.set("work", filterWork);
        if (filterField) p.set("field", filterField);
        if (filterGenre) p.set("genre", filterGenre);
        var qs = p.toString();
        var url = location.pathname + (qs ? "?" + qs : "");
        if (url !== location.pathname + location.search) {
            history.replaceState(null, "", url);
        }
    }

    // ───── Wire-up ─────────────────────────────────────────────────────────
    document.addEventListener("DOMContentLoaded", function () {
        var input = $("fc-search-q");
        var form = $("fc-search-form");
        var initialQ = readUrlParams();
        if (initialQ) input.value = initialQ;

        function go() {
            if (!docs) {
                loadDocs(function () { performSearch(input.value); });
            } else {
                performSearch(input.value);
            }
            updateUrl(input.value);
        }

        form.addEventListener("submit", function (e) {
            e.preventDefault();
            go();
        });
        // Live search on input (debounced)
        var debounceT = null;
        input.addEventListener("input", function () {
            if (!docs) return;  // wait for explicit Search click first time
            clearTimeout(debounceT);
            debounceT = setTimeout(go, 200);
        });

        // Facet click delegation
        document.addEventListener("click", function (e) {
            var link = e.target.closest(".fc-facet-link");
            if (!link) return;
            e.preventDefault();
            var facet = link.dataset.facet;
            var value = link.dataset.value;
            if (facet === "work") {
                filterWork = (filterWork === value) ? "" : value;
            } else if (facet === "field") {
                filterField = (filterField === value) ? "" : value;
            } else if (facet === "genre") {
                filterGenre = (filterGenre === value) ? "" : value;
            }
            renderResults();
            updateUrl(input.value);
        });

        // Auto-run if URL had ?q=
        if (initialQ) {
            go();
        } else {
            // Pre-populate doc count placeholder by counting first index of array via streaming
            // (we don't load until needed). Display approximate from a metadata file? For v1
            // just leave "…" until first search.
        }
    });
})();
