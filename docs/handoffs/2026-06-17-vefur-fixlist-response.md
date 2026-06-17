# Response to namsbokasafn-vefur fix list (2026-06-17)

Disposition of the consolidated fix list handed off from the vefur work sessions
(`namsbokasafnefnifixes.md`). Worked in branch `claude/sharp-lovelace-e3xmqz`.

| # | Item | Status | Where |
|---|------|--------|-------|
| 1 | Complete faithful rollups + `rollups-complete` marker | ✅ Fixed | `cnxml-render.js` |
| 2 | Trailing-slash self-links | ⛔ Not an efni issue | — |
| 3 | Unresolved cross-reference anchors | ✅ Mostly fixed (14→3) | `cnxml-elements.js`, `cnxml-render.js` |
| 4 | Physics ch4 truncated slug + missing figure | ✅ Slug fixed / 🔎 figure already present | `module-sections.js` |
| 5 | Missing localized `_is` figures (liffraedi ch03) | ✅ Fixed | `cnxml-render.js` |
| 6 | Table rendered as image (efnafraedi ch21) | 📝 Manual content task | — |
| 7 | Translation completeness (alt/prose English) | 🔎 Root cause found / roadmap | — |

---

## ✅ Fixed in this branch

### #1 — Complete faithful rollups (+ marker) — pairs with vefur PR #144
Faithful is now treated as an overlay over the complete mt-preview baseline. The
chapter-wide module set that drives rollups is the **union** of reviewed modules
+ mt-preview; `translatedCnxmlPath` falls back faithful→mt-preview for unreviewed
modules. A `05-publication/faithful/rollups-complete` marker is written after each
full faithful render. Verified on efnafraedi-2e ch1/ch3 (1-exercises 1→6 sections,
key-terms → full 52-def parity). **vefur PR #144 should detect the marker.**

### #3 — Cross-reference anchors (14 → 3)
Exercise sections are stripped from their source section page and compiled onto
`N-exercises`; references to that content (and figures referenced *from* the
exercises page) were resolving to dead same-page anchors. `resolveCrossModuleHref`
now compares target/current **page** (not module), driven by a chapter-wide
`relocatedIds` map and an explicit `currentPageBasename` on compiled renders.
Re-rendered all chapters with published content (href-only diff, no drift).

**3 anchors remain (distinct, harder — left as follow-up):**
- 1× cross-chapter→appendix ref (`fs-idm379479808`, efnafraedi 2-3 → Appendix A).
  Appendices render in a separate pass, so this needs a genuine **book-wide** id
  map across chapter renders.
- 2× `<footnote>` refs (`fs-idp7089072` ch7, `fs-idm12821888` ch12). The renderer
  renumbers footnotes (`fn-N`) and drops the source id, so `target-id` links to a
  footnote can't resolve. Needs footnote source-id preservation.

### #4 — Truncated slug (+ figure note)
`slugify` cut titles mid-word at 50 chars. It now backs off to the last word
boundary (keeping the clean cut when a word ends exactly at 50). Only **3** slugs
across all books were genuinely mid-word-cut and were re-rendered:

> ⚠️ **CROSS-REPO FOLLOW-UP:** vefur's section-level `toc.json` (the routing
> source — efni's `toc.json` is only a track manifest) must be updated in lockstep
> or these routes 404:
> - `edlisfraedi-2e` ch4 : `…-samhverfa-i-kr` → `…-samhverfa-i`
> - `efnafraedi-2e` ch9 : `…-blanda-og-efn` → `…-blanda-og`
> - `efnafraedi-2e` ch19: `…-hlidarmalma-og-` → `…-hlidarmalma-og`

**#4b figure** `Figure_04_05_15.jpg`: not reproducible — the image is present at
the referenced path and the `<img src>` matches. Stale audit or vefur-side serving.

### #5 — Localized `_is` figures
`copyChapterImages` only copied from `01-source/media`; the localized `*_is.*`
variants live in `books/<book>/media/`. It now searches both. liffraedi-2e ch03:
34 `_is` figures published, every referenced image resolves.

### #9 — Editor artifacts in publication output (also from the list)
`cnxml-render` now sweeps `*.backup.*` / `*.pre-fix-*` / `*.bak` / leftover
`*.tmp.*` in the pre-render clean **and** prunes the `safeWrite` `.backup.*` it
creates on single-module renders. Removed the one stray `.pre-fix-*` already
committed.

### #8 — Glossaries for preview books (also from the list)
Generated `glossary.json` for `edlisfraedi-2e` (22 terms) and `liffraedi-2e` (42)
— the two preview books with `<glossary>` content. `lifraen-efnafraedi` and
`orverufraedi` have **no** glossary terms in source (JSON-generation path); their
TOC glossary entry should be suppressed **vefur-side** rather than shipping an
empty Orðabók page.

---

## ⛔ #2 — Trailing-slash self-links: NOT an efni issue

There are **zero** trailing-slash internal links in any rendered HTML across all
books (the only two `href="…/"` are legitimate external URLs — loc.gov,
gemsociety.org). `buildCrossModuleHref` emits clean `/{slug}/kafli/NN/{basename}`
URLs with no trailing slash, and the TOC/section links are relative without one.
**The trailing slash is added vefur-side (reader routing). The fix belongs in
vefur, not here.**

---

## 📝 / 🔎 Deferred (not safe/appropriate as autonomous changes)

### #6 — Table-as-image (efnafraedi ch21) — manual content task
The source CNXML ships these "tables" (m68852 §21-2, m68854 §21-3) as **JPGs**
inside `<figure>`, not structured `<table>`s. There is no table data to re-emit;
the content lives in the image plus an English `alt` description, and the
"Representation" column is visual (sphere diagrams) that can't be textualized.
Accurate reconstruction requires manual transcription of nuclear notation by a
domain expert — exactly the chemistry content the project requires humans to
verify. **Recommend manual authoring or leaving as image (alt already provides
accessibility).**

### #7 — Translation completeness — partly editorial, partly roadmap
- **`stray-english-in-prose`**: editorial Pass-1 work; many hits are proper
  names/citations (false positives). Not a pipeline change.
- **`img-alt-still-english`**: real pipeline gap found — `cnxml-extract`
  `addSegment`s figure **captions** but **not** image `alt` text
  (`processFigure` stores `media.alt` in structure and never segments it). So alt
  is never sent to MT and stays English even in faithful. Fixing it properly
  needs extract + inject changes **and** a re-extraction + fresh MT pass (requires
  `MALSTADUR_API_KEY`, changes segment IDs / editorial state). This is a
  **editorial-throughput-roadmap** item, not a drop-in content fix.

---

## Notes
- All tool changes covered by the Vitest tools suite (763 passing; 4 new tests
  for the #3 relocation logic in `cnxml-link-resolution.test.js`).
- Re-renders were verified to be **href/asset-only** with no content drift.
- Render side-effects to `02-structure/*-manifest.json` and `translation-errors.json`
  were reverted to keep commits focused (both are auto-regenerated on every render).
