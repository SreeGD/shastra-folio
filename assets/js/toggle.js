/* Early-apply: runs in <head> before paint so toggle/collapse state never flickers. */
(function () {
    "use strict";

    // --- Section show/hide (global, controlled by Display panel) ---
    var SECTIONS = [
        "devanagari", "iast", "pronunciation", "synonyms", "blended",
        "purport", "gaudiya", "classical", "personal_guidance",
        "related", "lectures",
        "analogy", "stories-full", "important_words", "note",
        "study", "study_qa", "study_essays",
        "chapter_overview", "breakdown", "section_banner",
        "gpd_all",
        "bb_view",
        "audio_player",
        "recitation_slokas",
        "quiz",
    ];
    var DEFAULT_HIDDEN = {
        pronunciation: true,
        analogy: true,
        "stories-full": true,
        important_words: true,
    };
    var HIDDEN_KEY = "fc-sections-hidden";
    var COLLAPSED_KEY = "fc-sections-collapsed";
    var SIDEBAR_KEY = "fc-sidebars";

    function load(key) {
        try { return JSON.parse(localStorage.getItem(key) || "{}") || {}; }
        catch (e) { return {}; }
    }

    var html = document.documentElement;
    var hidden = load(HIDDEN_KEY);
    var collapsed = load(COLLAPSED_KEY);
    var sidebars = load(SIDEBAR_KEY);

    function isHidden(s) {
        return Object.prototype.hasOwnProperty.call(hidden, s)
            ? !!hidden[s]
            : !!DEFAULT_HIDDEN[s];
    }

    // Visibility (controlled by Display panel)
    for (var i = 0; i < SECTIONS.length; i++) {
        if (isHidden(SECTIONS[i])) html.setAttribute("data-hide-" + SECTIONS[i], "1");
    }

    // Per-section collapse (per page-section). All "supporting" sections start
    // collapsed by default so a fresh reader sees just the verse (Devanāgarī +
    // IAST + Translation). User toggles persist as explicit overrides.
    // blended reading already starts collapsed via its native <details>, so
    // we don't need a default override for it here.
    var DEFAULT_COLLAPSED = {
        synonyms: true,
        // purport, gaudiya, classical — START EXPANDED so commentaries are
        // visible at a glance. Users can collapse via the chevron.
        personal_guidance: true,
        related: true,
        lectures: true,
        analogy: true,
        "stories-full": true,
        important_words: true,
        study: true,
        study_qa: true,
        study_essays: true,
        breakdown: true,         // breakdown card starts collapsed (it's long)
        // chapter_overview: starts expanded by default
    };
    function isSectionCollapsed(s) {
        return Object.prototype.hasOwnProperty.call(collapsed, s)
            ? !!collapsed[s]
            : !!DEFAULT_COLLAPSED[s];
    }
    Object.keys(DEFAULT_COLLAPSED).forEach(function (s) {
        if (isSectionCollapsed(s)) html.setAttribute("data-collapsed-" + s, "1");
    });
    // Honour any explicit user overrides that aren't in the defaults list.
    Object.keys(collapsed).forEach(function (s) {
        if (collapsed[s]) html.setAttribute("data-collapsed-" + s, "1");
    });

    // Sidebar collapse (left/right)
    if (sidebars.left) html.setAttribute("data-left-collapsed", "1");
    if (sidebars.right) html.setAttribute("data-right-collapsed", "1");

    // Reading preferences (theme / font / size). Apply early to avoid flicker.
    var READ_KEY = "fc-reading";
    var DEFAULTS = { theme: "light", font: "serif", size: "normal", layout: "single" };
    var reading = load(READ_KEY);
    function getR(k) { return reading[k] || DEFAULTS[k]; }
    html.setAttribute("data-theme", getR("theme"));
    html.setAttribute("data-font", getR("font"));
    html.setAttribute("data-size", getR("size"));
    html.setAttribute("data-layout", getR("layout"));

    // Personal-guidance age filter (all/youth/householder/senior)
    var PG_FILTER_KEY = "fc-pg-filter";
    var pgFilter = "all";
    try { pgFilter = localStorage.getItem(PG_FILTER_KEY) || "all"; } catch (e) {}
    html.setAttribute("data-pg-filter", pgFilter);

    // Global audience filter (all/primary/middle/senior/college)
    // Applies wherever an element carries data-level="<level>" — primarily
    // theme DevelopmentalSpec blocks and story cards.
    var AUDIENCE_KEY = "fc-audience";
    var audience = "all";
    try { audience = localStorage.getItem(AUDIENCE_KEY) || "all"; } catch (e) {}
    if (audience && audience !== "all") {
        html.setAttribute("data-audience-" + audience, "1");
    }

    // Read-aloud master toggle — default ON.
    var TTS_PREFS_KEY = "fc-tts-prefs";
    var ttsPrefs = {};
    try { ttsPrefs = JSON.parse(localStorage.getItem(TTS_PREFS_KEY) || "{}") || {}; } catch (e) {}
    if (ttsPrefs.enabled === false) html.setAttribute("data-tts-off", "1");

    // Presentation mode preload — when the previous verse navigated us here
    // while in presentation mode (sessionStorage flag), hide all page chrome
    // before paint so the next verse appears in presentation immediately.
    // app.js's wirePresentation() will then call enter() to apply the full
    // presentation state and remove this preload style.
    try {
        if (sessionStorage.getItem("fc-presentation") === "1") {
            var s = document.createElement("style");
            s.id = "fc-presentation-preload";
            s.textContent =
                ".fc-site-header,.fc-site-footer,.fc-left-sidebar,.fc-sidebar," +
                ".fc-ribbon,.fc-prevnext,.fc-source-link,.fc-breadcrumbs," +
                ".fc-back-to-chapter,.fc-overlay-backdrop,.fc-mobile-trigger" +
                "{display:none!important}" +
                ".fc-layout{grid-template-columns:1fr!important;display:block!important}";
            document.head.appendChild(s);
        }
    } catch (e) {}

    // Expose state + helpers for app.js
    window.FC_STATE = {
        READ_KEY: READ_KEY,
        READ_DEFAULTS: DEFAULTS,
        reading: reading,
        PG_FILTER_KEY: PG_FILTER_KEY,
        pgFilter: pgFilter,
        AUDIENCE_KEY: AUDIENCE_KEY,
        audience: audience,
        DEFAULT_COLLAPSED: DEFAULT_COLLAPSED,
        isSectionCollapsed: isSectionCollapsed,
        SECTIONS: SECTIONS,
        DEFAULT_HIDDEN: DEFAULT_HIDDEN,
        HIDDEN_KEY: HIDDEN_KEY,
        COLLAPSED_KEY: COLLAPSED_KEY,
        SIDEBAR_KEY: SIDEBAR_KEY,
        hidden: hidden,
        collapsed: collapsed,
        sidebars: sidebars,
        isHidden: isHidden,
    };
})();
