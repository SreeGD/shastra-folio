# shastra-folio

A static reading site for the **Bhagavad-gītā** — 700 verses across 18 chapters, with:

- Devanāgarī + IAST + English-reading pronunciation guide
- Word-for-word synonyms and blended Sanskrit/English reading
- Prabhupāda's translation and purport
- Gauḍīya and classical ācārya commentaries
- Personal Guidance for each verse (essence, practical applications, reflections, age-group guidance)
- Related values & verses, related lectures
- Per-section toggle / collapse, theme + font + size controls, bookmarks, text highlighting, pen tool for teaching

Live: <https://shastra-folio.pages.dev>

## About this repo

This repository contains **only the built static site** — the pre-rendered HTML, CSS, and JS.

The source generator (templates, build script, raw data) lives in the private `foliocorpus` repo. Each build produces the contents of this repo via:

```sh
python scripts/build_bg_static_site.py --out docs/
```

…and the resulting `docs/` directory is what's published here.

## Hosting

Deployed via Cloudflare Pages with the build output served from the repo root. No build step on Cloudflare's side — every push to `main` publishes immediately.

## Credits

- Translations and purports © A.C. Bhaktivedanta Swami Prabhupāda — Bhaktivedanta Book Trust
- Sanskrit + commentary data sourced from vedabase.io and public domain ācārya texts
- Audio lectures linked from bhagavadgitaclass.com
