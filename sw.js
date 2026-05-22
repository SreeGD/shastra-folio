/* Service worker for shastra-folio — offline-capable, version-cached.
   Strategy:
     - network-first for HTML navigations (so updates appear immediately when online)
     - cache-first for static assets (CSS / JS / JSON / SVG / fonts)
     - precache the app shell on install so first offline visit still works */

const VERSION = "v20260522133627";
const CACHE = "foliocorpus-" + VERSION;
const SHELL = [
    "./",
    "./assets/css/site.css",
    "./assets/js/toggle.js",
    "./assets/js/app.js",
    "./assets/data/verses.json",
    "./manifest.webmanifest",
    "./assets/icons/icon.svg",
    "./assets/icons/icon-maskable.svg",
];

self.addEventListener("install", function (e) {
    e.waitUntil(
        caches.open(CACHE).then(function (c) {
            // Use individual puts so one missing asset doesn't fail the whole cache.
            return Promise.all(SHELL.map(function (u) {
                return fetch(u, { cache: "no-cache" })
                    .then(function (r) { if (r.ok) return c.put(u, r); })
                    .catch(function () {});
            }));
        }).then(function () { return self.skipWaiting(); })
    );
});

self.addEventListener("activate", function (e) {
    e.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) {
                if (k !== CACHE) return caches.delete(k);
            }));
        }).then(function () { return self.clients.claim(); })
    );
});

self.addEventListener("fetch", function (e) {
    if (e.request.method !== "GET") return;
    var url = new URL(e.request.url);
    if (url.origin !== self.location.origin) return; // ignore cross-origin

    var accept = e.request.headers.get("accept") || "";
    var isHtml = e.request.mode === "navigate" || accept.indexOf("text/html") !== -1;

    if (isHtml) {
        // Network-first, fall back to cache, then to root index on offline.
        e.respondWith(
            fetch(e.request).then(function (r) {
                var copy = r.clone();
                caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {});
                return r;
            }).catch(function () {
                return caches.match(e.request).then(function (r) {
                    return r || caches.match("./");
                });
            })
        );
        return;
    }

    // Static assets: cache-first
    e.respondWith(
        caches.match(e.request).then(function (cached) {
            if (cached) return cached;
            return fetch(e.request).then(function (resp) {
                var copy = resp.clone();
                caches.open(CACHE).then(function (c) { c.put(e.request, copy); }).catch(function () {});
                return resp;
            });
        })
    );
});
