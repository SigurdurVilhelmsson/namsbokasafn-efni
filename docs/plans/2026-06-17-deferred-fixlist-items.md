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

## D. (#4) Cross-repo: renamed slugs — **resolves on next content sync, no code**

> **Verified 2026-06-22 — no manual edit needed.** vefur's
> `static/content/<book>/toc.json` is **gitignored and generated** by
> `scripts/generate-toc.js`, which `sync-content.js` runs on every sync
> (lines 238/379). It derives section slugs from efni's *published filenames*.
> Those filenames are **already corrected and committed** in efni (PR #133); no
> stale old-slug files linger. So the live 404s persist **only because corrected
> content hasn't been re-synced** — the next `node scripts/sync-content.js
> --source ../namsbokasafn-efni` (the lead's normal deploy step) regenerates
> toc.json and fixes all three automatically. **Do NOT hand-edit toc.json**
> (forbidden by CLAUDE.md; it'd be overwritten). Item D = a deploy checklist
> line, not a fix.

PR #133 corrected 3 mid-word-cut slugs. The 3 routes 404 on the live site until
the corrected content is re-synced:

| Book / ch | Old slug (stale on live) | New slug (in efni now) |
|-----------|----------|----------|
| edlisfraedi-2e ch4 | `…-samhverfa-i-kr` | `…-samhverfa-i` |
| efnafraedi-2e ch9 | `…-blanda-og-efn` | `…-blanda-og` |
| efnafraedi-2e ch19 | `…-hlidarmalma-og-` | `…-hlidarmalma-og` |

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

## G. (A1 follow-up) Interactive appendix — one-click — vefur

Live QA (2026-06-23) confirmed A1 works: "viðauka A" → `/efnafraedi-2e/vidauki/A`.
But `/vidauki/A` is a **landing page** that links to the interactive periodic
table at `/efnafraedi-2e/lotukerfi/` — so the table is **two clicks** deep. Make
it one: either (a) redirect `/vidauki/A` → `/lotukerfi/` for the interactive
appendix (matches the A1 spec's original model), or (b) render the component at
`/vidauki/A`. (a) is smaller. **efni needs no change** — it emits the correct
semantic `/vidauki/{letter}`; this is purely vefur appendix-route behavior and
fixes the hop for every Appendix-A reference. Spec:
[`2026-06-22-a1-appendix-crossref-design.md`](2026-06-22-a1-appendix-crossref-design.md)
§ "Deployed behavior + UX follow-up". Low priority / low effort.

---

## H. (anchor occlusion) Sticky banner hides in-page anchor targets — vefur

Live QA (2026-06-23): jumping to an in-page `#anchor` (footnote back-ref,
cross-reference, section jump) scrolls the target to viewport-top, where it's
**obscured by the sticky/semi-transparent top banner** (search/settings). Affects
**all** anchor navigation, not just footnotes. One-line CSS fix in vefur's shared
stylesheet: `scroll-padding-top: <banner-height>` on the scroll root (`html`/main
scroll container), or `scroll-margin-top` on anchor targets (`[id]` / content
headings + `.footnote-item` + `.preserved-anchor`). **efni needs no change** —
anchors are correct; this is reader-layout CSS. Low effort, site-wide benefit.

## I. ⚠️ (regression) Duplicate learning-objectives block — vefur

Live QA (2026-06-23): section pages show the objectives **twice** — efni's static
`<div class="learning-objectives">` block AND vefur's interactive block. **efni is
correct**: PR #140 emits objectives both as the visible block (graceful baseline)
*and* in page-data `objectives:[]` (to feed tracking) — by design, same source.
The intent was vefur #151 would *replace/upgrade* the static block; instead it
renders its block **without hiding** the static one. **Fix in vefur:** hide or
remove `.learning-objectives` from the injected content when rendering the
interactive objectives UI. No efni change (dual emission is the contract; it must
keep degrading gracefully when tracking is off). Visible on most section pages →
higher priority than G/H.

## J. ⚠️ (regression) `/{book}/markmid` redirects to front page — vefur

Live QA (2026-06-23): `/efnafraedi-2e/markmid` redirects to the front page and no
UI links to it, despite vefur #151 shipping the markmið page. Data is present
(page-data carries objectives; toc.json regenerated — Group-1 verified), so this
is a **vefur route/guard or empty-state fallback** issue, not missing data.
Investigate in a vefur session: the `[bookSlug]/markmid` route + whatever
condition makes it bounce, and surface a nav link once it works.

> Items G–J were all surfaced by the 2026-06-23 live QA and are **vefur-side**.
> Per the cross-repo protocol, record/fix them in a namsbokasafn-vefur session
> (read its CLAUDE.md + memory first); this list is the interim tracker.

## K. (UX gap) No logout in the editorial-server UI — **efni**

Live QA (2026-06-23): the editorial server has **no logout affordance** in the
UI, though the endpoint exists (`POST /api/auth/logout`, clears `auth_token` —
`server/routes/auth.js:191`). Add a logout control (e.g. in the topbar/profile
menu in `server/public/js/layout.js`) that POSTs it and redirects to `/login`.
Small **efni** frontend change (editorial server lives in this repo). Minor
security/usability gap (no way to drop a session on a shared machine).

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
