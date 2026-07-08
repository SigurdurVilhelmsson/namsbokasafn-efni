# efnafraedi-2e Tier-3 tech-debt sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land four small, independent, mechanical tech-debt fixes (#8 `--chapter 0` guard, #9 MATH-resolve dedup, #13 section-order golden, #14 MJX id-counter reset) in one batched PR, each TDD'd.

**Architecture:** Each task is self-contained and touches a different tool. #8 makes an inline CLI guard testable via a tiny pure predicate. #9 deduplicates a load-bearing marker-strip tail into one module-local helper, byte-identical via a `{ trim }` option. #13 adds one render-golden fixture. #14 exposes a MathJax id-counter reset and calls it at the one safe per-output-file boundary (the per-module content loop).

**Tech Stack:** Node.js 22 (ESM), Vitest, `@mathjax/src` v4.

## Global Constraints

- **Run `npm test` from the repo ROOT** — it is the authoritative gate (no branch protection). The vitest workspace runs tools tests in parallel.
- **No re-render of `05-publication/`** in this PR (lead's Phase-6 sync/deploy op). Goldens already normalize MJX ids, so they stay green.
- **Never touch `books/*/01-source/`** (READ-ONLY OpenStax originals). None of these tasks do.
- **Refactor stays byte-identical** where a task is labelled a refactor (#9): behavior changes (#16/#17) are logged, never smuggled in.
- Branch: `fix/chem-techdebt-sweep` (already created off `main`).
- Commit message trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: #8 — `cnxml-extract.js --chapter 0` guard

The guard `if (!args.input && !args.chapter)` at `tools/cnxml-extract.js:1951` rejects a valid `--chapter 0` because `!0 === true` (`parseArgs` coerces `--chapter 0` to the number `0`). `inject`/`render` already use `== null`. We extract the guard predicate into a tiny pure, exported helper so it is unit-testable, then use it.

**Files:**
- Modify: `tools/cnxml-extract.js` (guard at `:1951`; export block at `:2054`)
- Test: `tools/__tests__/cnxml-extract.test.js` (existing suite)

**Interfaces:**
- Produces: `hasExtractTarget(args) → boolean` — true iff `args.input` or `args.chapter` is present (present = not `null`/`undefined`; the number `0` counts as present).

- [ ] **Step 1: Write the failing test**

Add to `tools/__tests__/cnxml-extract.test.js` (import `hasExtractTarget` alongside the existing `extractInlineText` import from `../cnxml-extract.js`):

```js
import { hasExtractTarget } from '../cnxml-extract.js';

describe('hasExtractTarget (--chapter 0 guard)', () => {
  it('treats chapter 0 (the ch00 preface) as a present target', () => {
    expect(hasExtractTarget({ chapter: 0 })).toBe(true);
  });
  it('treats a chapter number as present', () => {
    expect(hasExtractTarget({ chapter: 5 })).toBe(true);
  });
  it('treats --input as present', () => {
    expect(hasExtractTarget({ input: 'books/x/01-source/ch00/m1.cnxml' })).toBe(true);
  });
  it('reports no target when neither input nor chapter is given', () => {
    expect(hasExtractTarget({})).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-extract.test.js -t "hasExtractTarget"`
Expected: FAIL — `hasExtractTarget is not a function` (not exported yet).

- [ ] **Step 3: Add the predicate and use it in the guard**

In `tools/cnxml-extract.js`, define the helper above `main()` (near the top of the file's function definitions, e.g. just before `async function main()` at `:1941`):

```js
/**
 * True iff an extraction target was supplied. `--input` or `--chapter` is
 * required. NB: `== null` (not `!args.chapter`) so chapter 0 (the ch00 preface)
 * is a valid target — mirrors cnxml-inject.js:3841 / cnxml-render.js:3187.
 * @param {{input?: string, chapter?: number|string}} args
 * @returns {boolean}
 */
function hasExtractTarget(args) {
  return args.input != null || args.chapter != null;
}
```

Replace the guard at `:1951`:

```js
  if (!hasExtractTarget(args)) {
    console.error('Error: Either --input or --chapter is required');
    printHelp();
    process.exit(1);
  }
```

Add `hasExtractTarget` to the export block at `:2054`:

```js
export {
  generateSegmentId,
  extractInlineText,
  extractSegments,
  formatSegmentsMarkdown,
  elementIdPosition,
  assertNoDroppedListBlocks,
  hasExtractTarget,
};
```

Leave lines 1983 (`if (args.chapter)` moduleOrderMap) and 2019 (`if (args.chapter && …)` chapter-title) UNCHANGED — verified no-op for chapter 0: `getChapterModules(0)` → `[]` (no ch0 in collection-order), and there is no collection ch0 title. `findChapterFiles(0)` globs `01-source/ch00/*.cnxml` and finds the preface module, so the run proceeds correctly.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/cnxml-extract.test.js -t "hasExtractTarget"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-extract.js tools/__tests__/cnxml-extract.test.js
git commit -m "fix(cnxml-extract): accept --chapter 0 (ch00 preface) via hasExtractTarget [#8]

Guard used !args.chapter, which is truthy-false for the number 0 that
parseArgs coerces --chapter 0 into, so ch00 needed an --input workaround.
Extract a pure, exported hasExtractTarget(args) predicate (== null, mirrors
inject/render) and unit-test it. Lines 1983/2019 left unchanged (verified
no-op for ch0). Sibling !args.chapter class logged as roadmap #16.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: #9 — dedup the marker-strip tail into `stripTermMarkersToText`

Two near-identical blocks in `tools/cnxml-inject.js` strip an EN term to plain, lowercased text and resolve `[[math:N]]` to visible notation AFTER lowercasing (the load-bearing m68852 invariant: `ΔHf°` must not become `δhf°`). Site A (`annotateInlineTerms`, ~`:829`) has no trim; site B (glossary annotator, ~`:1834`) pre-strips `__term__`/`{{term}}` and trims mid-chain. We extract the shared tail into one helper, with a `{ trim }` option so each caller's current output is reproduced byte-for-byte. This single-sources the invariant that previously caused the m68852 divergent-fix misdiagnosis.

**Files:**
- Modify: `tools/cnxml-inject.js` (new helper; site A `:829-847`; site B `:1834-1856`)
- Test: `tools/__tests__/cnxml-inject.test.js` (existing suite)

**Interfaces:**
- Produces: `stripTermMarkersToText(text, equations, opts?) → string` where `opts = { trim?: boolean }` (default `false`). Strips `[[sup]]/[[sub]]/[[i]]/[[b]]` + `{{i}}`/`{{b}}` + other non-MATH placeholders, optionally trims, lowercases, then resolves `[[math:N]]` from `equations['math-'+N].mathml` (tags stripped, whitespace collapsed).
- Consumes: nothing from other tasks.

- [ ] **Step 1: Write the failing characterization test**

Add to `tools/__tests__/cnxml-inject.test.js` (import `stripTermMarkersToText` in the existing import block from `../cnxml-inject.js`). These pin the exact current behavior BEFORE refactor:

```js
describe('stripTermMarkersToText', () => {
  const eqs = { 'math-3': { mathml: '<math><mi>x</mi></math>' } };
  // NB: extraction emits UPPERCASE [[MATH:N]]. drop-other's (?!MATH:) is
  // case-sensitive, so it preserves [[MATH:N]] and only toLowerCase() (which
  // runs after drop-other) turns it into [[math:N]] for the resolve step. A
  // lowercase [[math:N]] passed in directly would be DROPPED — so tests use
  // uppercase, matching real inputs.

  it('strips sub/sup/i/b bracket markers and lowercases (site-A default: no trim)', () => {
    expect(stripTermMarkersToText('H[[sub:2]]O [[i:Solid]]', eqs)).toBe('h2o solid');
  });
  it('resolves [[MATH:N]] AFTER lowercasing (notation keeps its own content)', () => {
    expect(stripTermMarkersToText('value [[MATH:3]]', eqs)).toBe('value x');
  });
  it('drops non-MATH placeholders (MEDIA etc.) but keeps resolved MATH', () => {
    expect(stripTermMarkersToText('a [[MEDIA:1]] [[MATH:3]]', eqs)).toBe('a  x');
  });
  it('default does NOT trim (site-A behavior) — padded input keeps edges', () => {
    expect(stripTermMarkersToText('  Foo  ', eqs)).toBe('  foo  ');
  });
  it('with { trim: true } (site-B behavior) trims after strip, before lowercase', () => {
    expect(stripTermMarkersToText('  Foo  ', eqs, { trim: true })).toBe('foo');
  });
  it('drops an unresolved MATH marker (rare)', () => {
    expect(stripTermMarkersToText('a [[MATH:9]]', eqs)).toBe('a ');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js -t "stripTermMarkersToText"`
Expected: FAIL — `stripTermMarkersToText is not a function`.

- [ ] **Step 3: Add the helper**

In `tools/cnxml-inject.js`, add above `annotateInlineTerms` (near `:786`):

```js
/**
 * Strip inline API/CNXML markers from an EN term string down to plain,
 * lowercased text for "(e. …)" reference annotations. Resolves [[math:N]] to
 * its visible notation AFTER lowercasing so the notation keeps its case
 * (ΔHf° must not become δhf° — the m68852 invariant). Shared by
 * annotateInlineTerms() and the glossary annotator; single-sourcing this
 * prevents divergent fixes (the m68852 misdiagnosis).
 *
 * Callers do their own leading pre-strip (e.g. the glossary strips __term__/
 * {{term}} first). `trim` reproduces the glossary site's mid-chain trim; the
 * inline-term site does NOT trim (see roadmap #17).
 *
 * @param {string} text  EN term text after the caller's own pre-strip
 * @param {Object} equations  math-N → { mathml }
 * @param {{trim?: boolean}} [opts]
 * @returns {string}
 */
function stripTermMarkersToText(text, equations, { trim = false } = {}) {
  let out = text
    .replace(/\[\[sup:([^\]]+)\]\]/g, '$1')
    .replace(/\[\[sub:([^\]]+)\]\]/g, '$1')
    .replace(/\[\[i:([^\]]+)\]\]/g, '$1')
    .replace(/\[\[b:([^\]]+)\]\]/g, '$1')
    .replace(/\{\{i\}\}([\s\S]*?)\{\{\/i\}\}/g, '$1')
    .replace(/\{\{b\}\}([\s\S]*?)\{\{\/b\}\}/g, '$1')
    .replace(/\[\[(?!MATH:)[A-Za-z][\w]*:[^\]]*\]\]/g, ''); // drop MEDIA/other, NOT MATH
  if (trim) out = out.trim();
  return out.toLowerCase().replace(/\[\[math:(\d+)\]\]/g, (m, n) => {
    const eq = equations[`math-${n}`];
    if (!eq || !eq.mathml) return ''; // unresolved → drop (old behaviour, rare)
    return eq.mathml
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  });
}
```

- [ ] **Step 4: Run test to verify the helper passes**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js -t "stripTermMarkersToText"`
Expected: PASS (6 tests).

- [ ] **Step 5: Replace site A with a helper call**

In `annotateInlineTerms`, keep the `const enTermRaw = enTermTexts[termIndex];` line (`:828`) and the comment block above it. Replace ONLY the `const enTerm = enTermRaw` chain (lines ~`829-847`, from `.replace(/\[\[sup:...` down through the closing `});` of the math-resolve) with a single line:

```js
      const enTerm = stripTermMarkersToText(enTermRaw, equations); // trim:false — site A's current behavior (#17)
```

- [ ] **Step 6: Replace site B with a helper call**

In the glossary annotator, replace the `const enTerm = enTermRaw.replace(...)...` chain (lines ~`1834-1856`) so it reads:

```js
            // Glossary pre-strips its paired term markers, then shares the tail.
            const enTerm = stripTermMarkersToText(
              enTermRaw.replace(/__([^_]+)__/g, '$1').replace(/\{\{term\}\}([\s\S]*?)\{\{\/term\}\}/g, '$1'),
              equations,
              { trim: true }
            );
```

The separate IS-side `isTermClean.toLowerCase()` compare below (line ~`1862`) is UNCHANGED.

- [ ] **Step 7: Run the full inject suite to prove byte-identical behavior**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js`
Expected: PASS — every existing `annotateInlineTerms` / `buildCnxml` glossary test still green (proves the refactor changed no output).

- [ ] **Step 8: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject.test.js
git commit -m "refactor(cnxml-inject): single-source term marker-strip tail [#9]

annotateInlineTerms and the glossary annotator carried near-identical
strip+lowercase+resolve-MATH tails; a divergent fix once caused the m68852
misdiagnosis. Extract stripTermMarkersToText(text, equations, { trim });
byte-identical (the { trim } option reproduces each site's current output;
site A's missing trim preserved and logged as roadmap #17). Not widened to
generate-tm.stripMarkers (keeps MATH verbatim, no lowercase) — different op.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: #13 — add a section-ordering render golden (m68742 / 7-6)

No `render-golden/` fixture has the "loose-content-around-nested-subsection" shape, so the golden gate structurally could not have caught the F2 regression. m68742 (ch07, "7-6") has that shape (`para → figure → section[ intro paras/figures → nested section → nested section ]`) and is complete/stable (not in the 15-incomplete list). Promoting it locks section ordering byte-exact and also guards the F1 fix.

**Files:**
- Modify: `tools/__tests__/cnxml-render-golden.test.js` (`GOLDEN_MODULES` array, `:24-34`)
- Create: `tools/__tests__/fixtures/render-golden/ch07/m68742.html` (generated fixture)

**Interfaces:**
- Consumes: `renderTranslatedModule({ chapter, moduleId })` (existing helper).

- [ ] **Step 1: Add the module to the golden list (test fails: no fixture)**

In `tools/__tests__/cnxml-render-golden.test.js`, add to `GOLDEN_MODULES` (keep it grouped with ch07):

```js
  { chapter: 'ch07', moduleId: 'm68742' },
```

- [ ] **Step 2: Run to verify it fails (missing fixture)**

Run: `npx vitest run tools/__tests__/cnxml-render-golden.test.js -t "m68742"`
Expected: FAIL — `missing golden: run UPDATE_GOLDEN=1 (...ch07/m68742.html)`.

- [ ] **Step 3: Generate the fixture from the current (post-F2, correct) render**

Run: `UPDATE_GOLDEN=1 npx vitest run tools/__tests__/cnxml-render-golden.test.js -t "m68742"`
This writes `tools/__tests__/fixtures/render-golden/ch07/m68742.html` (MathJax-normalized).

- [ ] **Step 4: Verify the golden now matches**

Run: `npx vitest run tools/__tests__/cnxml-render-golden.test.js -t "m68742"`
Expected: PASS.

- [ ] **Step 5: Sanity-check the golden witnesses section ordering (throwaway, not committed)**

Confirm the fixture contains the parent section's intro content BEFORE its nested subsections' headings (grep the fixture: the first `<section` intro `<p>`/`<figure>` appears before the first nested `<h.>` subsection heading). This is a manual read to confirm the golden would fail on an F2-style reorder; make no code change.

- [ ] **Step 6: Commit**

```bash
git add tools/__tests__/cnxml-render-golden.test.js tools/__tests__/fixtures/render-golden/ch07/m68742.html
git commit -m "test(render-golden): lock section ordering with m68742 (7-6) [#13]

Existing goldens had no loose-content-around-nested-subsection shape, so the
golden gate could not witness an F2/section-order regression. m68742 has that
shape and is complete/stable; its byte-exact golden now guards section
ordering (and the F1 fix).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: #14 — reset the MathJax `MJX-N` id counter per content page

`doc.outputJax.fontCache.nextID` (in `@mathjax/src`) increments per `convert()` because `SVG.OPTIONS.localID` is `null`; `doc` is a module-level singleton, so the counter climbs across every page in a `--chapter` render — editing module 1 shifts the `MJX-N` ids on every later module's page (observed: 4 ch12 content pages churned in the F1b re-render). `doc.reset()` does NOT reset this counter (verified). We expose `resetMathJaxIds()` and call it once per **content page** — the top of the per-module render loop in `main()`, which is the one safe per-output-file boundary (`renderCnxmlToHtml` and `buildHtmlDocument` both fire multiple times per rollup page, so resetting there would collide glyph `<defs>` ids within a page).

**Scope note (bounded residual, logged):** this fixes the per-module content pages — the cascading churn. The single-per-chapter rollup pages (glossary, key-equations, summary, exercises, answers) still take ids downstream of the content loop; they are always regenerated on any chapter re-render and do not cascade across unrelated pages. Full per-rollup-page reset is logged as roadmap #14-residual (needs a reset at each of ~7 builder orchestration points).

**Files:**
- Modify: `tools/lib/mathjax-render.js` (add export)
- Modify: `tools/cnxml-render.js` (import at `:28`; per-module loop at `:3406`)
- Test: `tools/__tests__/mathjax-render.test.js` (EXISTS — append a describe block; add `resetMathJaxIds` to its import on line 2)

**Interfaces:**
- Produces: `resetMathJaxIds() → void` — resets the per-container glyph-id counter so the next page's `MJX-N` ids start at 1.

- [ ] **Step 1: Write the failing test**

`tools/__tests__/mathjax-render.test.js` already exists and imports `{ renderMathML, buildAssistiveMml }` on line 2 with a top-level `MML` const. Extend the import to `{ renderMathML, buildAssistiveMml, resetMathJaxIds }`, and APPEND this describe block (use a locally-scoped `mml` to avoid colliding with the file's top-level `MML`):

```js
describe('resetMathJaxIds', () => {
  const mml = '<math xmlns="http://www.w3.org/1998/Math/MathML"><mi>x</mi></math>';
  const firstId = (s) => (s.match(/id="(MJX-\d+)-/) || [])[1];

  it('makes two independent pages produce identical MJX-N id ranges', () => {
    resetMathJaxIds();
    const page1 = [renderMathML(mml), renderMathML(mml)].map(firstId);
    resetMathJaxIds();
    const page2 = [renderMathML(mml), renderMathML(mml)].map(firstId);
    expect(page2).toEqual(page1); // deterministic per page
    expect(new Set(page1).size).toBe(page1.length); // unique within a page
  });

  it('without a reset the counter keeps climbing (proves the reset does work)', () => {
    resetMathJaxIds();
    const a = firstId(renderMathML(mml));
    const b = firstId(renderMathML(mml));
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/mathjax-render.test.js`
Expected: FAIL — `resetMathJaxIds is not a function`.

- [ ] **Step 3: Add the export**

In `tools/lib/mathjax-render.js`, after the `const doc = ...` line (`:23`):

```js
/**
 * Reset the per-container glyph-id counter so each page's MJX-N ids start at 1.
 * Call once per output PAGE (not per equation — that would collide the glyph
 * <defs> ids of multiple equations on the same page). The counter is a
 * process-global on the singleton MathJax document; without this it climbs
 * across every page in a --chapter render, churning later pages' ids.
 */
export function resetMathJaxIds() {
  doc.outputJax.fontCache.nextID = 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/mathjax-render.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Call the reset once per content page in `main()`**

In `tools/cnxml-render.js`, extend the import at `:28`:

```js
import { renderMathML, resetMathJaxIds } from './lib/mathjax-render.js';
```

At the top of the per-module loop body (`:3406`, immediately after `for (const moduleId of modules) {`), before the `if (args.verbose)` block:

```js
      for (const moduleId of modules) {
        // Fresh MJX-N id space per page so an edit to one module doesn't churn
        // the equation ids on every later page in the chapter (#14).
        resetMathJaxIds();
        if (args.verbose) {
```

- [ ] **Step 6: Run the render + golden suites to confirm nothing breaks**

Run: `npx vitest run tools/__tests__/cnxml-render-golden.test.js tools/__tests__/mathjax-render.test.js`
Expected: PASS — goldens stay green (MJX ids are normalized out of goldens), reset tests pass.

- [ ] **Step 7: Commit**

```bash
git add tools/lib/mathjax-render.js tools/cnxml-render.js tools/__tests__/mathjax-render.test.js
git commit -m "fix(cnxml-render): reset MJX id counter per content page [#14]

The MJX-N counter (fontCache.nextID) is a process-global on the singleton
MathJax document, so it climbed across a --chapter render and an edit to one
module churned the equation ids on every later module's page. Expose
resetMathJaxIds() and call it at the per-module loop — the one safe
per-output-file boundary (renderCnxmlToHtml/buildHtmlDocument fire multiple
times per rollup page). Rollup-page determinism logged as roadmap #14-residual.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Full-suite gate + PR

- [ ] **Step 1: Run the whole suite from the repo root**

Run: `npm test`
Expected: PASS — full Vitest workspace green (tools + server).

- [ ] **Step 2: Confirm no `05-publication/` bytes changed**

Run: `git status --porcelain books/` (expect empty) and `git diff --stat main -- books/` (expect empty — this PR renders nothing).

- [ ] **Step 3: Request a whole-branch review, then open the PR**

Use `superpowers:requesting-code-review` (or the project's review flow) for the whole branch, address findings, then open the PR against `main`.

## Success criteria (definition of done)

- `hasExtractTarget({ chapter: 0 })` is `true`; `--chapter 0` no longer hits the "required" error path; lines 1983/2019 unchanged.
- One `stripTermMarkersToText`; both former inject sites call it; the full inject suite proves byte-identical annotation output.
- `render-golden/ch07/m68742.html` committed + wired; it witnesses section ordering.
- `resetMathJaxIds()` exported + called per content page; test proves per-page-deterministic, within-page-unique ids; golden suite green.
- `npm test` green from repo root; zero `05-publication/` byte changes.
- Roadmap #16 (guard-class), #17 (site-A trim), #14-residual (rollup pages) logged, not swept.
