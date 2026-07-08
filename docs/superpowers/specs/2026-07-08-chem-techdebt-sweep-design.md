# efnafraedi-2e Tier-3 tech-debt sweep (roadmap #8/#9/#13/#14)

**Date:** 2026-07-08 · **Branch:** `fix/chem-techdebt-sweep` · **One batched PR.**

Ranked source of truth: `docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md` (Tier 3).
Predecessor arc: roadmap #2 (table `<entry>`-leak) fully resolved + merged (PR #251 + #252).

## Scope

Four small, independent, mechanical code fixes, TDD'd, in one PR:

- **#8** — `cnxml-extract.js --chapter 0` falsy-guard bug
- **#9** — MATH-resolve/term-marker-strip duplication in `cnxml-inject.js`
- **#13** — render-golden coverage gap for section ordering (add one fixture)
- **#14** — MathJax `MJX-N` id counter not reset per page (cosmetic churn)

**Explicitly out of scope (own arcs / deferred):**

- **#10** (source↔output `<link target-id>`/`document` parity gate) — a net-new gate
  with unresolved design (reference side, parity vs resolvability, home) + an
  un-probed target case (which m68692 link is actually dead). Gets its own
  brainstorm→plan→PR **after** this sweep. Lead-confirmed split 2026-07-08.
- **#11/#12** — low-pri (glossary literal-symbol lowercasing; `verify-reextract`
  execSync template string). Deferred.
- **#15** — section-level para-nested `<table>` unguarded. 0 instances in
  efnafraedi (grep-clean); defer to biology characterization.

No re-render of published `05-publication/` HTML in this PR (lead's Phase-6
sync/deploy op). Goldens already normalize MJX ids, so they stay green; the #14
churn benefit lands on the next real re-render. Lead-confirmed 2026-07-08.

## Probe evidence (do not re-derive — these premises are verified)

The predecessor arc twice had plan premises falsified only by running the real
pipeline. Every design decision below is grounded in a probe already run:

- **#8**: `parseArgs` coerces `--chapter 0` → the *number* `0` (`parseArgs.js:65`,
  `parseInt('0',10)`). `cnxml-extract.js:1951` guards with
  `if (!args.input && !args.chapter)` → `!0 === true` → rejects a supplied
  `--chapter 0` as "missing". `inject`/`render` already dodge this with
  `args.chapter == null` (`cnxml-inject.js:3841`, `cnxml-render.js:3187`).
  `collection-order.json` has **no chapter-0 entry** (chapters 1–21); ch00 is
  front-matter (single module m68662). `getChapterModules(0)` → `[]`.
  `findChapterFiles(0)` globs `01-source/ch00/*.cnxml` and finds m68662.
  **Therefore:** the guard is the *only* blocker — once it accepts `--chapter 0`,
  the run works, and the two later `if (args.chapter)` sites (`:1983`
  moduleOrderMap, `:2019` chapter-title SEG) correctly no-op for chapter 0
  (empty order map for a 1-module front-matter; no collection title). They are
  **left unchanged** — changing them adds nothing for chapter 0 and risks touching
  the 1–21 path. Minimal fix = the one guard line.

- **#9**: two near-identical marker-strip-to-plain-text blocks in `cnxml-inject.js`:
  - Site A — `annotateInlineTerms` (~`828–850`): strips `[[sup]]/[[sub]]/[[i]]/[[b]]`
    + `{{i}}/{{b}}` + drop-other-placeholders (keep MATH) + `.toLowerCase()` +
    resolve `[[math:N]]` from `equations[math-N].mathml`.
  - Site B — glossary annotate (~`1834–1856`): a `__term__`/`{{term}}` **pre-strip**,
    then the identical sup/sub/i/b + drop-other + `.trim()` + `.toLowerCase()` +
    resolve-MATH tail.
  The shared, extractable part is the **common tail** (sup/sub/i/b/drop-other +
  lowercase + resolve-MATH). Site A has no leading `__term__`/`{{term}}` strip and
  no `.trim()`; site B has both. So each caller keeps its own pre-strip and trim;
  only the tail is deduped. The MATH-resolve-after-lowercase ordering is
  load-bearing (m68852: `ΔHf°` must not become `δhf°`; drop-instead-of-resolve
  garbled `positron (+10β or +10e)`) and must be preserved verbatim.

- **#13**: `render-golden/` fixtures live in `tools/__tests__/fixtures/render-golden/`
  (per-chapter dirs), compared byte-exact after `normalizeMathJax` (collapses
  `<mjx-container>`→`data-latex` placeholder and assistive `<math>`→marker) — so
  MJX ids are already normalized out of goldens. Test: `cnxml-render-golden.test.js`
  via `helpers/render-normalize.js` (`renderTranslatedModule`).
  **m68742 (ch07, "7-6")** structure = `para → figure → section[ intro paras/figures
  → nested section → nested section ]` — a parent section whose own intro content
  precedes its nested subsections. That IS the F2 shape (buggy `renderSection`
  emitted subsections before the parent intro), so a byte-exact golden of it locks
  section ordering. m68742 is **complete** (not in the 15-incomplete list) and post-F2
  its render is correct → the golden captures the correct order.

- **#14**: the `MJX-N` prefix number is `doc.outputJax.fontCache.nextID`, incremented
  by `FontCache.useLocalID(null)` per `convert()` (`@mathjax/src .../svg/FontCache.js:29`;
  `SVG.OPTIONS.localID` is `null`, `svg.js:377`). `doc` is a module-level MathJax v4
  singleton (`mathjax-render.js:23`), so the counter climbs across every page in a
  `--chapter` render → editing page 1 shifts every later page's ids (4 ch12 pages
  churned in the F1b re-render). **`doc.reset()` does NOT reset it** (empirically: a=MJX-1,
  b=MJX-2, c-after-reset=MJX-3). Setting `fontCache.nextID = 0` before a page DOES:
  page1 = `[MJX-1, MJX-2]`, page2-after-reset = `[MJX-1, MJX-2]` — deterministic per
  page, unique within a page (the number namespaces per-container glyph-path `<defs>`
  ids; resetting per page is safe because pages are separate HTML files). No document
  recreation, no font reload.

## Design per item

### #8 — `--chapter 0` guard (one line)

`cnxml-extract.js:1951`:

```js
// before
if (!args.input && !args.chapter) {
// after
if (args.input == null && args.chapter == null) {
```

Mirrors `cnxml-inject.js:3841` / `cnxml-render.js:3187`. Lines 1983 and 2019 stay
as-is (verified no-op for chapter 0). Removes the `--input` workaround front-matter
needed this run.

**Test:** a unit test that the arg-guard treats `--chapter 0` as present (not the
"required" error path). Prefer testing the guard predicate directly or the arg-parse
+ guard, without a full extraction run (extraction touches the filesystem). If the
guard is inline in `main()`, extract the predicate into a tiny pure helper
(`hasExtractTarget(args)`) so it is unit-testable — a minimal, justified refactor.

### #9 — `stripTermMarkersToText(text, equations)` dedup

Introduce one module-local helper in `cnxml-inject.js`:

```js
/**
 * Strip inline API/CNXML markers from an EN term string down to plain,
 * lowercased text for "(e. …)" reference annotations, resolving [[math:N]]
 * to its visible notation AFTER lowercasing (so notation keeps its case).
 * The common tail shared by annotateInlineTerms() and the glossary annotator.
 * @param {string} text  EN term text (callers do their own pre-strip/trim)
 * @param {Object} equations  math-N → { mathml } map
 * @returns {string}
 */
function stripTermMarkersToText(text, equations) { … }
```

Body = the exact current tail (sup/sub/i/b + `{{i}}`/`{{b}}` + drop-other + lowercase
+ resolve-MATH). Site A calls it on `enTermTexts[termIndex]`. Site B keeps its leading
`__term__`/`{{term}}` strip and `.trim()`, then calls the helper (helper's own
`.toLowerCase()` makes site B's trailing lowercase redundant — fold it in).

**Verification:** characterize BOTH sites' current output on representative inputs
(a term with sub/sup, one with `[[math:N]]` resolving to notation, one where EN==IS
so annotation is skipped, m68852-style positron notation) BEFORE refactor; assert the
refactored output is byte-identical. This is a pure refactor — no behavior change.

### #13 — promote m68742 into render-golden

Render m68742 via the golden harness's normalized path, commit the fixture at
`tools/__tests__/fixtures/render-golden/ch07/m68742.html`, and add `{ chapter: 'ch07',
moduleId: 'm68742' }` (matching the existing list's shape) to `cnxml-render-golden.test.js`.
Locks the "loose-content-around-nested-subsection" ordering byte-exact — the shape the
existing goldens structurally could not witness (why F2 slipped the golden gate).

**Verification:** the golden is generated FROM the current (post-F2, correct) render, so
it must match on first run; a deliberate re-introduction of the F2 reorder must fail it
(sanity-checked once locally, not committed).

### #14 — reset MJX id counter per page

Add to `mathjax-render.js`:

```js
/** Reset the per-container glyph-id counter so each page's MJX-N ids start at 1.
 *  Call once per page/module before rendering its equations. */
export function resetMathJaxIds() {
  doc.outputJax.fontCache.nextID = 0;
}
```

Call it in `cnxml-render.js` at the top of each module/page render (the per-module loop
in `main()`), before that page's equations are converted. Do not reset per-equation
(that would collide glyph `<defs>` ids within a page).

**Verification:** unit test — render two different modules/pages back-to-back, assert the
second page's `MJX-N` ids restart from the same base as the first (deterministic per page)
and are unique within each page. Golden suite must stay green (ids normalized out).

## Sequencing & PR

Roadmap-suggested order: **#8 → #9 → #13 → #14** (independent; batchable). TDD each,
one commit per item. `npm test` from repo ROOT is the authoritative gate (no branch
protection). One whole-branch review at the end, then PR.

Out-of-scope finds discovered mid-work → log to the roadmap register +
`chemistry-clean-slate` memory (batch triage), per project convention.

## Success criteria (definition of done)

- `--chapter 0` runs `cnxml-extract.js` without the "required" error (no `--input`
  workaround) — test proves it.
- One `stripTermMarkersToText` helper; both former sites call it; characterization
  proves byte-identical annotation output.
- `render-golden/ch07/m68742.html` committed + wired into the golden test; a
  re-introduced F2 reorder fails it.
- `resetMathJaxIds()` exported + called per page; test proves per-page-deterministic,
  within-page-unique ids; golden suite green.
- Full `npm test` green from repo root. No `05-publication/` re-render in this PR.
