# Deferred items from the vefur fix list (2026-06-17)

Actionable backlog for work **not** done in PR #133 (`claude/sharp-lovelace-e3xmqz`).
Disposition of the whole list is in
[`docs/handoffs/2026-06-17-vefur-fixlist-response.md`](../handoffs/2026-06-17-vefur-fixlist-response.md);
this doc is the implementation guide for the leftovers, with the specifics already
dug up so a future session can start coding.

Ordered roughly by value/effort. Items A–B are pipeline code; C is content; D–F are
cross-repo coordination.

---

## A. Remaining cross-reference anchors (#3 tail — 3 of the original 14)

PR #133 fixed the exercise-relocation cases (page-based resolution +
`relocatedIds` in `tools/lib/cnxml-elements.js` / `tools/cnxml-render.js`). Three
dead same-page anchors remained across all published HTML (113,553 refs total):

| Target id | Referenced on | Real location | Kind | Status |
|-----------|---------------|---------------|------|--------|
| `fs-idm379479808` | efnafraedi-2e `2-3-bygging-atoms…` | Appendix A (`m68859`) | cross-chapter → appendix | ✅ **FIXED 2026-06-22** (A1) — spec: [`2026-06-22-a1-appendix-crossref-design.md`](2026-06-22-a1-appendix-crossref-design.md) |
| `fs-idp7089072` | efnafraedi-2e `7-exercises` | `<footnote>` in `m68741` | footnote | ✅ **FIXED 2026-06-22** (A2) |
| `fs-idm12821888` | efnafraedi-2e `12-exercises` | `<footnote>` in `m68794` | footnote | ✅ **FIXED 2026-06-22** (A2) |

**A2 (footnotes) — DONE 2026-06-22.** Root cause was *not* the dropped-source-id
the section below describes; it was `renderCompiledExercises`
(`tools/cnxml-render.js`) slicing only the first `<section>` from each per-section
render and discarding the trailing `<section class="footnotes">`. Fix: salvage the
footnote bodies and re-emit them once before `</article>`. Tests in
`tools/__tests__/cnxml-render.test.js` ("footnotes on the compiled exercises
page"); ch7 + ch12 re-rendered; dead-anchor audit total 3 → **1** (only A1 left).

**Known limitation (currently inert).** Per-section renders restart footnote
numbering at 1, so if a *single* compiled exercises page ever gathered ≥2
footnote-bearing exercise sections, the display number / `fnref-N` backref would
repeat across them (forward links stay correct — each `<li>` uses its CNXML
source id). A full-corpus scan on 2026-06-22 (all books, both tracks) found this
never occurs: only efnafraedi-2e ch7 and ch12 have footnote-bearing exercise
sections, one each. A lock test (`keeps both footnote bodies when two exercise
sections each carry one`) guards the body-collection behavior. **If future
content adds a second footnote-bearing exercise section to one chapter,**
renumber `fnref-N`/`fn-N` page-globally while collecting (rewrite the marker in
the sliced section HTML and the `<li>` together).

### A1. Cross-chapter → appendix reference (book-wide id map)
> **✅ DONE 2026-06-22 — minimal fix shipped.** The "book-wide id map" framing
> below is superseded (over-built for the single anchor). Implemented as a small
> per-render appendix-id → `{ letter, basename }` lookup (`buildAppendixIdMap`)
> consulted as a last resort in `resolveCrossModuleHref`; `fs-idm379479808` now
> resolves to `/efnafraedi-2e/vidauki/A` (fragment dropped — Appendix A is the
> interactive periodic table). No persisted index / no `build-id-index.js`. ch2
> re-rendered, diff href-only, dead-anchor audit **1 → 0**. Tests in
> `cnxml-render.test.js` (`buildAppendixIdMap`) + `cnxml-link-resolution.test.js`
> (`appendix cross-references (A1)`). Spec:
> [`2026-06-22-a1-appendix-crossref-design.md`](2026-06-22-a1-appendix-crossref-design.md).

**Root cause.** `chapterIdToModule` (built in `cnxml-render.js` main) is *chapter-
scoped* — it only registers ids from the chapter currently rendering. Appendices
render in a separate pass, so a chapter-2 link to an Appendix-A id can't resolve
and falls back to a dead `#anchor`. This is the genuine "book-wide id map" gap the
vefur handoff referenced.

**Approach.** Build a persisted, book-wide id→{chapter/appendix, module, page
basename} index once per book and consult it in `resolveCrossModuleHref` after the
chapter-local lookup misses. Sketch:
- New step (or new tool `tools/build-id-index.js`) that scans every
  `03-translated/<track>/**/<module>.cnxml` for id-bearing elements and writes
  `books/<book>/05-publication/<track>/id-index.json` (id → `{ basename }`, using
  the same filename logic as `resolveModuleHref` / appendix naming).
- `cnxml-render.js` loads it and passes it into the render context as e.g.
  `bookIdIndex`; `resolveCrossModuleHref` uses it as the last resort before the
  same-page fallback, producing a cross-page `buildCrossModuleHref` href.
- Mind the appendix URL shape: `buildCrossModuleHref` currently keeps
  `appendices-*` links relative on purpose (letter-mapping lives in vefur's
  `toc.json`). Decide whether the index emits the relative form or a resolved
  `/kafli/…` URL; coordinate with vefur if absolute.

**Risk.** Medium — touches the core link resolver and adds a build artifact.
Re-render all books afterward; assert the diff is href-only.
**Acceptance.** `fs-idm379479808` resolves to the Appendix-A page; dead-anchor
audit (see below) stays ≤2 (the footnotes).

### A2. Footnote cross-references
**Root cause.** The renderer renumbers footnotes to `fn-N` / `fnref-N` and drops
the source CNXML id, so `<link target-id="fs-idp7089072"/>` (a ref to a footnote)
has no anchor to land on.

**Approach.** Preserve the footnote's source id as an anchor on the rendered
footnote (e.g. emit `id="fs-idp7089072"` alongside the `fn-N` id, or map
source-id→`fn-N` in the id index from A1 so the link resolves to `#fn-N`). The
footnote-rendering code is in `tools/lib/cnxml-elements.js` (search `footnote` /
`fnref`).
**Risk.** Low–medium. **Acceptance.** Both footnote refs resolve; audit → 0.

### Dead-anchor audit (re-usable)
```bash
node -e '
const fs=require("fs"),path=require("path");
function walk(d){let r=[];for(const e of fs.readdirSync(d,{withFileTypes:true})){const p=path.join(d,e.name);if(e.isDirectory())r=r.concat(walk(p));else if(e.name.endsWith(".html"))r.push(p);}return r;}
let dead=0;
for(const f of walk("books")){if(!f.includes("05-publication"))continue;
  const h=fs.readFileSync(f,"utf8");
  const refs=[...h.matchAll(/href="#([^"]+)"/g)].map(m=>m[1]);
  const ids=new Set([...h.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]));
  const d=[...new Set(refs)].filter(r=>!ids.has(r));
  if(d.length){dead+=d.length;console.log(d.length,f.replace("books/",""),"→",d.slice(0,4).join(", "));}}
console.log("total dead:",dead);'
```

---

## B. Translate image `alt` text (#7 — pipeline gap)

**Root cause (confirmed).** `tools/cnxml-extract.js` `processFigure()` (~line 1019)
`addSegment()`s figure **captions** but only *stores* `media.alt` in the structure
(~lines 1005, 1045) — it never segments it. So `alt` is never sent to the Málstaður
API and is restored verbatim (English) on inject, even on faithful pages. ~207
`img-alt-still-english` audit hits trace to this.

**Why it was deferred.** Not a drop-in: it changes the extracted segment set (new
segment ids), so it requires a **re-extraction + a fresh MT pass** (needs
`MALSTADUR_API_KEY`) and re-inject/re-render. Re-extraction perturbs segment ids
that the editorial DB (`sessions.db`) keys on, so it must be sequenced as a
deliberate pipeline operation, not a content hotfix. Best folded into the
**editorial-throughput roadmap**.

**Approach.**
1. `cnxml-extract.js`: in `processFigure` (and the standalone `media` handler near
   line 995), if `alt` is non-empty, `addSegment('alt', altText, '<id>-alt')` and
   store the returned `segmentId` on `figStructure.media.altSegmentId`.
2. `cnxml-inject.js`: when rebuilding `<image>`/`<media>`, look up the translated
   alt segment by id and write it into the `alt=` attribute (fall back to source
   alt if absent). Add a test in `tools/__tests__/cnxml-inject.test.js`.
3. Operational runbook: re-extract → `api-translate` → inject → render, per book.
   Coordinate with any in-flight editorial review (segment-id churn).

**Risk.** Medium-high (segment-id churn, MT cost, editorial-state coupling).
**Acceptance.** Faithful pages have Icelandic `alt`; `img-alt-still-english` drops
to near-zero on faithful (mt-preview stays MT-quality by definition).

> The `stray-english-in-prose` half of #7 is **editorial Pass-1 work**, not a
> pipeline change — and many hits are proper names/citations (false positives).
> Out of scope for code; track on the editorial side.

---

## C. Table-as-image (#6 — manual content authoring)

efnafraedi-2e ch21 ships two "Tafla" figures as **JPGs** (`m68852` §21-2
`CNX_Chem_21_02_Nuclearrxs`; `m68854` §21-3). The source CNXML has no structured
`<table>` — the data lives in the image plus an English `alt` description, and the
"Representation" column is visual (nuclear sphere diagrams) that cannot be
textualized.

**This is not automatable.** Reconstructing it means a domain expert hand-authoring
CNXML/HTML tables with correct nuclear notation (sup/sub or MathML) and deciding
what to do with the diagram column (keep as small inline images or drop). Per the
project's human-review rule for chemistry content, do **not** auto-generate from
the `alt` text.

**Decision needed from the lead:** (a) leave as image (the `alt` already gives
accessibility — lowest effort, acceptable), or (b) schedule manual transcription.
If (b), the unit of work is per-figure CNXML editing in `01-source` is read-only,
so author the table in the faithful segment/inject path or as a render-time
override — design TBD.

---

## D. (#4) Cross-repo: update vefur `toc.json` for renamed slugs — **REQUIRED**

PR #133 corrected 3 mid-word-cut slugs. efni's `toc.json` is only a track manifest;
the **section→route map is vefur's `static/content/<book>/toc.json`**. Until it's
updated, these 3 routes 404:

| Book / ch | Old slug | New slug |
|-----------|----------|----------|
| edlisfraedi-2e ch4 | `…-samhverfa-i-kr` | `…-samhverfa-i` |
| efnafraedi-2e ch9 | `…-blanda-og-efn` | `…-blanda-og` |
| efnafraedi-2e ch19 | `…-hlidarmalma-og-` | `…-hlidarmalma-og` |

(Full slugs in the handoff doc.) Do this in lockstep with merging #133.

---

## E. (#8) Cross-repo: suppress empty glossary TOC entries — vefur

`lifraen-efnafraedi` and `orverufraedi` have **no `<glossary>` content** in source
(they came via the JSON-generation path), so no `glossary.json` was generated.
Their TOC references an Orðabók page that would be empty. Either generate real
glossary content upstream or (preferred) suppress the glossary TOC entry vefur-side
until terms exist. `stjornufraedi` has no translated content at all.

---

## F. (#1/#2) Cross-repo confirmations — vefur

- **#1** Confirm vefur **PR #144** detects `books/<book>/05-publication/faithful/
  rollups-complete` and serves faithful rollups on partially-reviewed chapters
  (banner stays until fully reviewed). Marker is now written by `cnxml-render` on
  every full faithful render.
- **#2** Trailing-slash self-links are **not** an efni bug (zero such internal
  links in rendered HTML). Fix the trailing slash in vefur's reader routing.

---

## Quick reference — what PR #133 changed
- `tools/cnxml-render.js` — artifact sweep/prune (#9); `relocatedIds` +
  `currentPageBasename` plumbing and compiled-page basenames (#3); faithful
  rollup union + mt-preview fallback + `rollups-complete` marker (#1); media
  fallback to `books/<book>/media` (#5).
- `tools/lib/cnxml-elements.js` — page-based `resolveCrossModuleHref` (#3).
- `tools/lib/module-sections.js` — word-boundary `slugify` (#4).
- `tools/__tests__/cnxml-link-resolution.test.js` — +4 relocation tests.
- Generated glossaries (#8); re-rendered affected publication HTML.
