/* Early-apply: runs in <head> before paint so toggle/collapse state never flickers. */
(function () {
    "use strict";

    // --- Section show/hide (global, controlled by Display panel) ---
    var SECTIONS = [
        "devanagari", "iast", "pronunciation", "synonyms", "blended",
        "purport", "gaudiya", "classical", "personal_guidance",
        "related", "lectures",
    ];
    var DEFAULT_HIDDEN = { pronunciation: true };
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

    // Per-section collapse (per page-section)
    for (var k in collapsed) {
        if (collapsed[k]) html.setAttribute("data-collapsed-" + k, "1");
    }

    // Sidebar collapse (left/right)
    if (sidebars.left) html.setAttribute("data-left-collapsed", "1");
    if (sidebars.right) html.setAttribute("data-right-collapsed", "1");

    // Reading preferences (theme / font / size). Apply early to avoid flicker.
    var READ_KEY = "fc-reading";
    var DEFAULTS = { theme: "light", font: "serif", size: "normal" };
    var reading = load(READ_KEY);
    function getR(k) { return reading[k] || DEFAULTS[k]; }
    html.setAttribute("data-theme", getR("theme"));
    html.setAttribute("data-font", getR("font"));
    html.setAttribute("data-size", getR("size"));

    // Expose state + helpers for app.js
    window.FC_STATE = {
        READ_KEY: READ_KEY,
        READ_DEFAULTS: DEFAULTS,
        reading: reading,
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
