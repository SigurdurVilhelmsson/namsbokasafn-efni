# Response to the `namsbokasafn-vefur` content-fixes handoff (2026-06-15)

**Generated:** 2026-06-16, from a `namsbokasafn-efni` (content repo) session.
**Responds to:** the handoff brief "Content fixes for `namsbokasafn-efni`" produced
from the green `vefur` `main` CI build (run `27541844265`, prerender warnings).
**Purpose:** correct the brief's assumptions against the *actual current state* of
`namsbokasafn-efni` so the vefur session doesn't chase fixes that don't belong here.

---

## TL;DR

Most of the brief's items are **stale-sync or vefur-side**, not missing content here.
Verified against `main` in `namsbokasafn-efni` (HEAD content re-rendered 2026-04-19,
commit `0a9558f1` "re-render all chapters with cross-module link fix"):

- **A (Physics ch4 sections 4-3…4-8): NOT missing.** All six section HTML files
  exist and are git-tracked.
- **B (`Figure_04_05_15.jpg`): NOT missing.** Exists and is committed.
- **C (exercises trailing-slash self-link): NOT an efni/`tools/` bug.** The static
  rendered HTML contains no such links, and the `…-exercises` pages are
  vefur-synthesized aggregators that don't exist as files here at all.
- **D (appendices empty): partly true, but the population happens vefur-side.**
  efnafraedi-2e *does* ship 13 rendered appendices; the publication `toc.json` is
  only a version manifest.
- **E (no book-wide id map): confirmed real**, and already tracked here in
  [`docs/2026-05-02-cross-chapter-id-resolution.md`](2026-05-02-cross-chapter-id-resolution.md).

**The single most useful next action is on the vefur side, not here:** re-run
`node scripts/sync-content.js --source ../namsbokasafn-efni`, then
`node scripts/generate-toc.js`, then `npm run build`. That should make A, B, and the
Physics half of D evaporate, because the content the prerender crawl reported missing
is present and committed on `main`.

---

## Item-by-item

### A — Physics (`edlisfraedi-2e`) chapter 4 sections 4-3…4-8 — **NOT MISSING**

All six files exist and are tracked in git
(`git ls-files books/edlisfraedi-2e/05-publication/mt-preview/chapters/04/`):

```
4-0-introduction.html
4-1-throun-krafthugtaksins.html
4-2-fyrsta-logmal-newtons-um-hreyfingu-tregda.html
4-3-annad-logmal-newtons-um-hreyfingu-hugtakid-kerfi.html
4-4-thridja-logmal-newtons-um-hreyfingu-samhverfa-i-kr.html   ← truncated slug, see A′
4-5-thverkraftur-spenna-og-onnur-daemi-um-krafta.html
4-6-lausn-vandamala.html
4-7-frekari-notkun-a-logmalum-newtons-um-hreyfingu.html
4-8-itarefni-inngangur-ad-grunnkroftunum-fjorum.html
```

Last touched by commit `0a9558f1` (2026-04-19). **Conclusion:** the run-`27541844265`
prerender crawled a checkout synced *before* this re-render. **Fix = re-sync on vefur**,
no content work here.

### A′ — the truncated `4-4…-kr` slug — **real but cosmetic, not a 404 cause**

`slugify()` in `tools/lib/module-sections.js` hard-truncates to 50 characters:

```js
// tools/lib/module-sections.js
export function slugify(title) {
  return transliterateIcelandic(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);   // ← cuts "…samhverfa-i-kroftum" → "…samhverfa-i-kr"
}
```

Source title: *"Þriðja lögmál Newtons um hreyfingu: Samhverfa í kröftum"*
(`books/edlisfraedi-2e/02-mt-output/ch04/m42074-segments.is.md`).

Important: the **filename and the TOC slug are both produced by this same function**,
so they still match — this does **not** by itself produce a 404. It's an ugly URL with
a small collision risk for long titles. Fixing it is optional and **renames a published
URL**, so it must be paired with a vefur re-sync. Not urgent.

### B — `Figure_04_05_15.jpg` — **NOT MISSING**

Exists and is committed:
`books/edlisfraedi-2e/05-publication/mt-preview/chapters/04/images/media/Figure_04_05_15.jpg`.
Same stale-sync explanation as A. No action here.

### C — exercises self-link with trailing slash — **NOT a `tools/` bug; vefur routing**

The brief labels this a "PIPELINE BUG … fix the root cause in `tools/`." It isn't here:

1. The rendered exercises HTML contains **no self-referential trailing-slash links**.
   The renderer's link builders never append a trailing `/`
   (`buildCrossModuleHref` in `tools/lib/cnxml-elements.js`; intro-outline links in
   `tools/cnxml-render.js`).
2. The affected routes don't even correspond to files here. For the two non-chemistry
   books, **there is no `…-exercises.html` at all**:
   - `orverufraedi` ch01 ships `1-multiple-choice.html`, `1-fill-in-the-blank.html`,
     `1-short-answer.html`, `1-critical-thinking.html`, `1-answer-key.html` — no
     `1-exercises.html`.
   - `edlisfraedi-2e` ch04 ships `4-problems-exercises.html` — no `4-exercises.html`.
   - (Only `efnafraedi-2e` emits real `N-exercises.html` files.)

   So `/orverufraedi/kafli/01/1-exercises` and `/edlisfraedi-2e/kafli/04/4-exercises`
   are **routes the reader synthesizes**, and the self-referential trailing-slash href
   is generated there. **Fix belongs in `namsbokasafn-vefur`** (the exercises
   aggregator route / link normalization), not in this repo.

### D — appendices (`vidauki`) — **partly true; population is vefur-side**

- `efnafraedi-2e` **does** ship rendered appendices, committed under
  `books/efnafraedi-2e/05-publication/mt-preview/chapters/appendices/`
  (`appendices-1-lotukerfid.html`, `appendices-3-einingar-og-umreiknistudlar.html`,
  `appendices-11-myndunarfastar-fyrir-flokajonir.html`, …). So the brief's "empty
  across all books" and "Efnafræði's only appendix is the interactive periodic table"
  are both inaccurate.
- The publication `toc.json` in this repo
  (`books/efnafraedi-2e/05-publication/toc.json`) is only a **version manifest**
  (`faithful` / `mt-preview`); it has no chapter/appendix tree. The appendix list the
  reader routes from (`toc.json.appendices[]`) is built **vefur-side** (its
  `generate-toc.js`) and/or from `server/data/{slug}.json` (which *does* carry a full
  `appendices[]`, e.g. `chemistry-2e.json` has 13 entries).
- Appendix **source** exists for most books but is **only rendered for efnafraedi-2e**:

  | Book | appendix source modules | rendered to publication? |
  |---|---|---|
  | efnafraedi-2e | 13 | ✅ yes |
  | orverufraedi | 5 | ❌ no |
  | edlisfraedi-2e | 4 | ❌ no |
  | lifraen-efnafraedi | 4 | ❌ no |
  | liffraedi-2e | 3 | ❌ no |

  `cnxml-render.js` supports `--chapter appendices`, so rendering them for the other
  books is a one-command-per-book job **if** appendices are meant to ship in preview.

**Action: verify intent on the vefur side first** (why is efnafraedi's `appendices[]`
not surfacing even though the files exist?). Only if preview books are supposed to
expose textual appendices does anything need rendering here.

### E — book-wide id map for cross-chapter/appendix anchors — **confirmed, already tracked**

Resolution is intentionally chapter-scoped: `chapterIdToModule` is built per-chapter in
`tools/cnxml-render.js` (~line 3047/3080) and consumed by `resolveCrossModuleHref` in
`tools/lib/cnxml-elements.js`. Cross-chapter / appendix targets miss and fall back to a
same-module anchor, which is what trips `handleMissingId`.

This is **already documented as an open follow-up** here:
[`docs/2026-05-02-cross-chapter-id-resolution.md`](2026-05-02-cross-chapter-id-resolution.md)
— it has the design (build a book-wide `bookIdToModule` index, fall through to it, map
appendix URLs) and a verification recipe. No new ticket needed; that's the plan of
record. Lowest priority of the set.

---

## Corrected suggested order

1. **Vefur first (clears A, B, and the Physics part of D as stale-sync):**
   ```bash
   # in namsbokasafn-vefur
   node scripts/sync-content.js --source ../namsbokasafn-efni
   node scripts/generate-toc.js
   npm run build 2>&1 | grep -E '\[404\]|not found while crawling'
   ```
   Expect the Physics ch4 section/figure 404s to disappear.
2. **C — fix in `namsbokasafn-vefur`,** not here: the synthesized `…-exercises`
   aggregator route emits a self-link with a trailing slash. (If, after investigation,
   it turns out the reader expects per-book `N-exercises.html` and is falling back to a
   synthesized page, that's still a vefur routing decision.)
3. **D — verify intent on vefur:** confirm whether `toc.json.appendices[]` should be
   populated (it can be, from `server/data/*.json`), and whether preview books beyond
   efnafraedi should render appendices. If yes, render them here with
   `node tools/cnxml-render.js <book> --chapter appendices` and re-sync.
4. **A′ (slug truncation) and E (book-wide id map):** optional efni-side improvements,
   both low priority, both URL/anchor-affecting → coordinate a vefur re-sync when done.
   E is already specced in `docs/2026-05-02-cross-chapter-id-resolution.md`.

## What is genuinely actionable *in this repo*

Only two things, both optional and non-blocking:

- **A′** — make `slugify()` truncate on a word boundary (avoid mid-word `-kr`).
  Renames published URLs → needs coordinated vefur re-sync.
- **E** — implement the book-wide id map per the existing design doc.

Everything else in the brief is either already satisfied here (A, B, efnafraedi's D) or
belongs in `namsbokasafn-vefur` (C, the `appendices[]` toc population, prerender
warning posture).
