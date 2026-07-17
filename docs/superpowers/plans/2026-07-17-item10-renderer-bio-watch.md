# Item 10 — Renderer Biology-Watch Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the seven still-open renderer defects that are latent on the committed corpus but fire at biology/organic/physics onboarding (RV-3 incl. P0-2, P0-3, P0-4, P0-5, #20, #22), provably without changing a byte of chemistry or biology output.

**Architecture:** A shared `scanBlocks` scanner unifies all six numbering/extraction pre-scans on the proven E7 pattern (attrs-anywhere capture → `hasUnnumberedClass` flag → id extract), with callers deciding numbering-vs-registry so the unconditional `addId` semantics survive. Three one-site hardenings (null-info guard, roman list styles, verbatim emphasis-class carry) and two link-path fixes (appendix fragment on the documentId branch; key-terms fallback routes appendix links through the resolver) complete the sweep. Safety = all-books render-hash sweep: chemistry+biology 0-diff hard, organic/physics diffs classified into four enumerated improvement classes.

**Tech Stack:** Node 22 ESM, Vitest, existing `renderCnxmlToHtml`/`_setBooksDirForTest` seams.

**Spec:** `docs/superpowers/specs/2026-07-17-item10-renderer-bio-watch-design.md` (all sites verified on main 2026-07-17; spec carries the scanBlocks flag-not-filter contract and the #20 single-branch scope).

## Global Constraints

- `npm test` from the **repo root** is the authoritative gate.
- **Corpus safety split (spec § Safety proof):** render-hash sweep over ALL books' committed `03-translated` modules — `efnafraedi-2e` and `liffraedi-2e` **0 diffs, hard requirement**; other books' diffs must EACH classify into: (1) figure-numbering shifts from unnumbered-skip/class-first adoption, (2) `<em>/<strong>/<u>` now carrying a `class`, (3) roman `list-style-type` appearing, (4) exercise numbering/answer-key changes from `type=`-first registration. Anything unclassifiable = STOP.
- **`addId` registry semantics must not change:** every id registered today stays registered (incl. unnumbered/skipped elements). `scanBlocks` returns an `unnumbered` FLAG; callers decide.
- **Behavior-preserving refactor rows** (tables both passes; equations single-class; id-first corpus shapes): identical numbering proven by equivalence-pin tests + the corpus sweep.
- **#20 touches ONLY the documentId-keyed appendix branch** (`cnxml-elements.js:109-112`); the no-owner branch's fragment drop is a documented A1 decision — untouched.
- **#22 non-appendix links keep byte-identical hrefs** (today's section-URL construction is the fallback); only appendix-document links change, to `/vidauki/{letter}` (+ fragment when `target-id` present).
- No extractor changes; no `books/` changes; no new dependencies; vanilla ESM.
- Branch **`fix/item10-renderer-bio-watch`** already exists with the spec commit — do NOT create a new branch. Commit prefixes: `fix(item10):` / `test(item10):` / `docs(item10):`.
- Line numbers below are verified on main @ 2026-07-17 (post-#290/#291-independent); re-locate by content if drifted.

## Reference: verified interfaces

| Fact | Where |
|------|-------|
| `hasUnnumberedClass(attrs)` word-match helper (exported) | `tools/cnxml-render.js:463`; stale JSDoc note `:452-459` says equation pass "deliberately left alone… future task" — this item |
| Per-module pre-scans: figures id-first `:516-522`; tables E7-pattern `:531-543` (the template); equations exact-string `:544-559` | `renderCnxmlToHtml` |
| Chapter-wide (in `main()`): figures id-first `:3206-3213`; tables E7 `:3221-3240` (w/ appendix per-letter labels + unconditional `addId`); examples `:3242-3251`; equations exact-string `:3254-3271` (registers ALL ids, numbers non-unnumbered); example-title pass `:3287-3293` (first-`<title>`-after-tag semantics); exercises `:3304-3313` | all in one per-module loop over `modCnxml` |
| Answer-key extraction: `/<exercise\s+id="([^"]+)">([\s\S]*?)<\/exercise>/g` — requires id as sole attr | `:2943` inside a function with `modules/track/chapterDir/moduleSections/chapter` in scope |
| `renderList` number-style map (alpha only) | `:1703-1707` |
| `filterOutlineEntries` | `:445-449` |
| Emphasis handler: `emphasis-one`-only class carry | `tools/lib/cnxml-elements.js:763-782` (`classAttr` at `:774`) |
| `resolveCrossModuleHref` documentId appendix branch (comment claims "no fragment") | `tools/lib/cnxml-elements.js:106-116`; no-owner A1 branch `:119-134` (do not touch) |
| Key-terms fallback (fires when `chapterGlossary.length === 0`) | `tools/cnxml-render.js:3570-3620`; `appendixResolution = {bookSlug, appendixIdMap, appendixModuleLetters}` in scope from `:3147` |
| Test seams: `_setBooksDirForTest`, `_loadBookConfigForTest`, `renderCnxmlToHtml(cnxml, options)`, export block `:3990+` | item-9 precedents; corpus harness pattern `docs/superpowers/plans/2026-07-16-item8-pr2-handled-tags.md` Task 5 |

---

### Task 0: Verify branch state

- [ ] **Step 1:**
```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git branch --show-current   # expect: fix/item10-renderer-bio-watch
git status --short          # expect: clean
git log --oneline -1        # expect: docs(item10): design spec — renderer biology-watch sweep
```

---

### Task 1: `scanBlocks` helper

**Files:**
- Modify: `tools/cnxml-render.js` (new function after `hasUnnumberedClass`, ~`:475`; add to export block `:3990+`)
- Test: `tools/__tests__/cnxml-render-scanblocks.test.js` (new)

**Interfaces:**
- Consumes: `hasUnnumberedClass` (same file).
- Produces: `export function scanBlocks(cnxml, tagName) → [{id, attrs, index, unnumbered}]` — document order; id-less matches dropped; `unnumbered = hasUnnumberedClass(attrs)`; `index` = match start offset in `cnxml`. Tasks 2–3 call exactly this.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/cnxml-render-scanblocks.test.js`:

```js
/**
 * cnxml-render-scanblocks.test.js — item 10 (RV-3): the shared numbering
 * pre-scan. One scanner, E7 semantics (attrs-anywhere capture →
 * hasUnnumberedClass WORD match → id extract), flag-not-filter so callers
 * can keep feeding the id registry unconditionally.
 */

import { describe, it, expect } from 'vitest';
import { scanBlocks } from '../cnxml-render.js';

describe('scanBlocks', () => {
  it('captures ids regardless of attribute order (attrs-anywhere)', () => {
    const cnxml =
      '<exercise type="conceptual" id="ex1"><para id="p">x</para></exercise>' +
      '<exercise id="ex2">y</exercise>';
    expect(scanBlocks(cnxml, 'exercise').map((b) => b.id)).toEqual(['ex1', 'ex2']);
  });

  it('flags multi-class unnumbered via word-match, does NOT filter', () => {
    const cnxml =
      '<figure id="f1" class="unnumbered scaled-down"/>' +
      '<figure id="f2" class="unnumbered-foo"/>' +
      '<figure id="f3"/>';
    const out = scanBlocks(cnxml, 'figure');
    expect(out.map((b) => [b.id, b.unnumbered])).toEqual([
      ['f1', true],
      ['f2', false], // near-miss substring is NOT unnumbered (word match)
      ['f3', false],
    ]);
  });

  it('drops id-less matches', () => {
    expect(scanBlocks('<equation class="unnumbered"/><equation id="e1"/>', 'equation')
      .map((b) => b.id)).toEqual(['e1']);
  });

  it('returns document-order match indexes usable for forward slicing', () => {
    const cnxml = 'AAA<example id="x"><title>T</title></example>';
    const [ex] = scanBlocks(cnxml, 'example');
    expect(ex.index).toBe(3);
    expect(cnxml.slice(ex.index)).toMatch(/^<example/);
  });

  it('does not cross tag-name word boundaries (figure vs figcaption-like)', () => {
    // \b guard: scanning "exercise" must not match "exercises" (hypothetical tag)
    const cnxml = '<exercises id="nope"/><exercise id="yes"/>';
    expect(scanBlocks(cnxml, 'exercise').map((b) => b.id)).toEqual(['yes']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/cnxml-render-scanblocks.test.js`
Expected: FAIL — `scanBlocks` is not exported.

- [ ] **Step 3: Implement**

Insert after `hasUnnumberedClass` (~`:475`):

```js
/**
 * Shared numbering/extraction pre-scan (item 10 / RV-3): find every <tagName …>
 * opening tag, capture its full attr string wherever the id sits (the old
 * per-pass regexes required id-first and silently missed organic's class-first
 * figures and physics' type=-first exercises), and flag class="unnumbered" via
 * the word-match. Flag, not filter: chapter-wide callers must keep registering
 * EVERY id in the link registry (addId) even when numbering skips it — a
 * filtering helper would silently break link resolution for skipped elements.
 * Id-less matches are dropped (numbering and the registry are both id-keyed).
 *
 * @param {string} cnxml
 * @param {string} tagName - element localName, e.g. 'figure'
 * @returns {{id: string, attrs: string, index: number, unnumbered: boolean}[]}
 */
function scanBlocks(cnxml, tagName) {
  const out = [];
  const re = new RegExp(`<${tagName}\\b([^>]*)>`, 'g');
  let m;
  while ((m = re.exec(cnxml)) !== null) {
    const attrs = m[1];
    const idMatch = attrs.match(/id="([^"]+)"/);
    if (!idMatch) continue;
    out.push({ id: idMatch[1], attrs, index: m.index, unnumbered: hasUnnumberedClass(attrs) });
  }
  return out;
}
```

Add `scanBlocks,` to the export block (`:3990+`, after `hasUnnumberedClass,`).

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tools/__tests__/cnxml-render-scanblocks.test.js`
Expected: PASS (5 tests). Note: self-closing `<figure id="f1" …/>` matches because `[^>]*` captures up to the final `>` including the `/` — the trailing `/` lands in `attrs`, harmless to both the id extract and the class word-match (the tests above pin this).

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render-scanblocks.test.js
git commit -m "feat(item10): shared scanBlocks pre-scan helper (attrs-anywhere, flag-not-filter)"
```

---

### Task 2: Per-module pre-scans adopt scanBlocks (P0-2 + figures skip; tables refactor row)

**Files:**
- Modify: `tools/cnxml-render.js:452-459` (JSDoc), `:516-522` (figures), `:531-543` (tables), `:544-559` (equations)
- Test: `tools/__tests__/cnxml-render-prescan-unify.test.js` (new)

**Interfaces:**
- Consumes: `scanBlocks` (Task 1).
- Produces: no new exports; per-module `figureNumbers`/`tableNumbers`/`equationNumbers` maps built via scanBlocks with identical numbering for the committed corpus.

- [ ] **Step 1: Write the failing tests**

Create `tools/__tests__/cnxml-render-prescan-unify.test.js`:

```js
/**
 * cnxml-render-prescan-unify.test.js — item 10: per-module pre-scans on the
 * shared scanner. Gated shapes activate (multi-class unnumbered equations and
 * figures skipped from numbering; class-first figures numbered); id-first
 * corpus shapes number identically (equivalence pins).
 */

import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml, _loadBookConfigForTest } from '../cnxml-render.js';

_loadBookConfigForTest('efnafraedi-2e');

const MATHML = '<m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mi>x</m:mi></m:math>';

function doc(inner) {
  return (
    '<document xmlns="http://cnx.rice.edu/cnxml" xmlns:m="http://www.w3.org/1998/Math/MathML">' +
    '<title>T</title><content>' + inner + '</content></document>'
  );
}
const render = (inner) =>
  renderCnxmlToHtml(doc(inner), { lang: 'is', chapter: 3, moduleId: 'mT', moduleSections: {} }).html;

describe('P0-2 — equation numbering skips multi-class unnumbered', () => {
  it('class="foo unnumbered" equation consumes no number slot', () => {
    const html = render(
      `<equation id="e1" class="foo unnumbered">${MATHML}</equation>` +
      `<equation id="e2">${MATHML}</equation>`
    );
    // e2 is the FIRST numbered equation → 3.1 (pre-fix it was 3.2)
    expect(html).toContain('(3.1)');
    expect(html).not.toContain('(3.2)');
  });

  it('equivalence pin: exact-string single-class unnumbered behaves as before', () => {
    const html = render(
      `<equation id="e1" class="unnumbered">${MATHML}</equation>` +
      `<equation id="e2">${MATHML}</equation>`
    );
    expect(html).toContain('(3.1)');
    expect(html).not.toContain('(3.2)');
  });
});

describe('RV-3 — figure numbering: class-first ids found, unnumbered skipped', () => {
  const FIG = (attrs) =>
    `<figure ${attrs}><media id="${Math.random().toString(36).slice(2)}" alt="a">` +
    `<image src="x.jpg" mime-type="image/jpeg"/></media></figure>`;

  it('class-first figure gets numbered (old id-first regex missed it)', () => {
    const html = render(FIG('class="scaled-down" id="f1"') + FIG('id="f2"'));
    expect(html).toContain('Mynd 3.1');
    expect(html).toContain('Mynd 3.2');
  });

  it('unnumbered figure consumes no slot', () => {
    const html = render(FIG('id="f1" class="unnumbered scaled-down"') + FIG('id="f2"'));
    expect(html).toContain('Mynd 3.1'); // f2 gets 3.1
    expect(html).not.toContain('Mynd 3.2');
  });

  it('equivalence pin: plain id-first figures number 3.1, 3.2 as before', () => {
    const html = render(FIG('id="f1"') + FIG('id="f2"'));
    expect(html).toContain('Mynd 3.1');
    expect(html).toContain('Mynd 3.2');
  });
});
```

(If the figure label text differs from `Mynd {n}` in the rendered output — check one existing figure test under `tools/__tests__/` for the exact label shape and adjust the assertions to the real caption/label markup; the NUMBERING is the invariant under test, not the label wording.)

- [ ] **Step 2: Run to verify the right failures**

Run: `npx vitest run tools/__tests__/cnxml-render-prescan-unify.test.js`
Expected: the two multi-class/class-first cases FAIL against current code (equation numbered 3.2; class-first figure unnumbered); the equivalence pins PASS. If an equivalence pin fails, the fixture is wrong — fix the test, not the code.

- [ ] **Step 3: Implement**

3a. Figures (`:516-522`) — replace with:

```js
  // Pre-scan: collect all figure IDs and assign numbers (item 10/RV-3: shared
  // scanner — attrs-anywhere so class-first figures are found; unnumbered
  // figures no longer consume a slot).
  const figureNumbers = new Map();
  let figCounter = 0;
  for (const fig of scanBlocks(cnxml, 'figure')) {
    if (fig.unnumbered) continue;
    figCounter++;
    figureNumbers.set(fig.id, `${chapter}.${figCounter}`);
  }
```

3b. Tables (`:531-543`) — replace the `while` loop with (behavior-identical refactor row):

```js
  const tableNumbers = new Map();
  let tableCounter = 0;
  for (const tbl of scanBlocks(cnxml, 'table')) {
    if (tbl.unnumbered) continue;
    tableCounter++;
    tableNumbers.set(tbl.id, `${chapter}.${tableCounter}`);
  }
```

(Keep the existing comment block above it, trimming the "mirrors the equation pre-scan below" sentence — the equation pass now shares the same semantics.)

3c. Equations (`:544-559`) — replace with:

```js
  // Pre-scan: collect numbered equation IDs (item 10/P0-2: word-match skip via
  // the shared scanner — multi-class forms like class="foo unnumbered" are now
  // skipped, closing the fragility E7 fixed for tables).
  const equationNumbers = new Map();
  let eqCounter = 0;
  for (const eq of scanBlocks(cnxml, 'equation')) {
    if (eq.unnumbered) continue;
    eqCounter++;
    equationNumbers.set(eq.id, `${chapter}.${eqCounter}`);
  }
```

3d. `hasUnnumberedClass` JSDoc (`:452-459`): delete the NOTE sentence block ("the equation pre-scan (below) still uses its own exact-string check … logged out-of-scope for a future task") and replace with one line: `Every numbering pre-scan routes through scanBlocks() below, which applies this word-match uniformly (item 10/RV-3).`

- [ ] **Step 4: Run to verify pass + renderer blast radius**

Run: `npx vitest run tools/__tests__/cnxml-render-prescan-unify.test.js tools/__tests__/cnxml-render-scanblocks.test.js && npx vitest run tools/`
Expected: all green (existing golden/render suites prove the refactor rows).

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render-prescan-unify.test.js
git commit -m "fix(item10): per-module pre-scans on scanBlocks — P0-2 multi-class equations, figure unnumbered skip + class-first ids"
```

---

### Task 3: Chapter-wide passes + answer-key adopt scanBlocks (addId semantics preserved)

**Files:**
- Modify: `tools/cnxml-render.js` `:3206-3213` (figures), `:3221-3240` (tables), `:3242-3251` (examples), `:3254-3271` (equations), `:3287-3293` (example titles), `:3304-3313` (exercises), `:2943-2963` (answer-key)
- Test: `tools/__tests__/cnxml-render-chapterscan-unify.test.js` (new)

**Interfaces:**
- Consumes: `scanBlocks` (Task 1).
- Produces: no new exports. Invariant relied on by the corpus sweep: **`addId` runs for exactly the same set of ids as today** — figures/tables ALL ids; equations ALL ids; examples/exercises ALL ids (they had no skip and keep none).

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/cnxml-render-chapterscan-unify.test.js`. The chapter-wide passes live in `main()`'s loop and are not directly callable — test them through the seams that ARE exported: this test drives the ANSWER-KEY path (exported per the reference table check below) and pins the exercise-registration shape at the unit level. First check what is exported for the answer-key/chapter passes:

```bash
grep -n "extractAnswers\|renderAnswerKey\|answerKey" tools/cnxml-render.js | head
```

If the answer-key extraction function (the one at `:2930-2980`) is exported, test it directly; if not, export it alongside the other test seams (established pattern: `renderExercise`, `_loadBookConfigForTest` etc. are exported for tests). The test:

```js
/**
 * cnxml-render-chapterscan-unify.test.js — item 10 (RV-3): chapter-wide and
 * answer-key exercise scans find attrs-first exercises (physics
 * m42606/m42665/m42440 shape: <exercise type="…" id="…">), which the old
 * id-first / id-only regexes silently dropped from numbering and the answer key.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
// import the answer-key extraction function by its real exported name (Step 1 grep):
import { collectChapterAnswers /* ← adjust to the actual name */ } from '../cnxml-render.js';

function makeModule(dir, chapterDir, moduleId, cnxml) {
  const p = path.join(dir, '03-translated', 'mt-preview', chapterDir);
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(path.join(p, `${moduleId}.cnxml`), cnxml);
}

it('answer-key extraction includes a type=-first exercise with a solution', () => {
  // Arrange a minimal book tree; drive the extraction via its real signature
  // (modules/track/chapterDir/moduleSections/chapter — confirm exact params from
  // the function definition at :2930 before wiring).
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'item10-ak-'));
  makeModule(dir, 'ch03', 'm1',
    '<document xmlns="http://cnx.rice.edu/cnxml"><content>' +
    '<exercise type="conceptual" id="exA"><problem id="pA"><para id="ppA">Q?</para></problem>' +
    '<solution id="sA"><para id="spA">A.</para></solution></exercise>' +
    '</content></document>');
  // …invoke with the real signature; assert:
  // expect(answers[0].answers.map(a => a.id)).toContain('exA');
});
```

**Implementation note:** the exact invocation depends on the function's real name/signature and its `translatedCnxmlPath` path resolution (it may resolve against `BOOKS_DIR` — use `_setBooksDirForTest` from item 9 if so). Resolve these from the code at `:2930-2980` FIRST, then complete the test with real assertions: a `type=`-first exercise with a `<solution>` MUST appear in the returned answers (RED today — the current regex requires `<exercise id="…">` exactly), and an id-first exercise must keep its number (equivalence pin).

- [ ] **Step 2: Run to verify RED for the right reason**

The `type=`-first case fails against current code (regex misses it); the id-first pin passes.

- [ ] **Step 3: Implement the seven scan replacements**

3a. Chapter-wide figures (`:3206-3213`):

```js
      for (const fig of scanBlocks(modCnxml, 'figure')) {
        // Register EVERY figure id (link resolution must not change); number
        // only the non-unnumbered ones (item 10/RV-3 — organic's class-first
        // and unnumbered figures).
        addId(fig.id, modId);
        if (fig.unnumbered) continue;
        chapterFigCounter++;
        chapterFigureNumbers.set(`${modId}:${fig.id}`, `${args.chapter}.${chapterFigCounter}`);
      }
```

3b. Chapter-wide tables (`:3221-3240`) — keep the appendix-letter logic verbatim, swap the loop mechanics:

```js
      const isAppendixChapter = args.chapter === 'appendices';
      const appendixLetter = isAppendixChapter ? appendixModuleLetters.get(modId) : null;
      let appendixTableCounter = 0; // reset every modId iteration
      for (const tbl of scanBlocks(modCnxml, 'table')) {
        if (!tbl.unnumbered) {
          let num;
          if (isAppendixChapter && appendixLetter) {
            appendixTableCounter++;
            num = formatTableNumber('appendices', appendixLetter, appendixTableCounter);
          } else {
            chapterTableCounter++;
            num = formatTableNumber(args.chapter, null, chapterTableCounter);
          }
          chapterTableNumbers.set(`${modId}:${tbl.id}`, num);
        }
        addId(tbl.id, modId);
      }
```

3c. Chapter-wide examples (`:3242-3251`):

```js
      for (const ex of scanBlocks(modCnxml, 'example')) {
        chapterExampleCounter++;
        chapterExampleNumbers.set(`${modId}:${ex.id}`, `${args.chapter}.${chapterExampleCounter}`);
        addId(ex.id, modId);
      }
```

3d. Chapter-wide equations (`:3254-3271`):

```js
      for (const eq of scanBlocks(modCnxml, 'equation')) {
        // Register every equation id (numbered or not) so cross-page links to
        // unnumbered equations also resolve.
        addId(eq.id, modId);
        if (eq.unnumbered) continue;
        chapterEquationCounter++;
        chapterEquationNumbers.set(`${modId}:${eq.id}`, `${args.chapter}.${chapterEquationCounter}`);
      }
```

3e. Example-title pass (`:3287-3293`) — same first-`<title>`-after-tag semantics, attrs-anywhere:

```js
      for (const ex of scanBlocks(modCnxml, 'example')) {
        const tail = modCnxml.slice(ex.index);
        const tm2 = tail.match(/<title>([\s\S]*?)<\/title>/);
        if (!tm2) continue;
        const titleText = tm2[1].replace(/<[^>]+>/g, '').trim();
        chapterSectionTitles.set(ex.id, titleText);
        // (id already registered by the example loop above)
      }
```

(Deliberately preserves today's latent "first title anywhere after the tag" semantics — tightening it is out of scope; the corpus sweep enforces no-change.)

3f. Chapter-wide exercises (`:3304-3313`):

```js
      for (const exr of scanBlocks(modCnxml, 'exercise')) {
        chapterExerciseCounter++;
        chapterExerciseNumbers.set(`${modId}:${exr.id}`, `${args.chapter}.${chapterExerciseCounter}`);
        addId(exr.id, modId);
      }
```

3g. Answer-key extraction (`:2943-2963`) — attrs-anywhere + body slice with today's first-`</exercise>` semantics:

```js
    for (const exr of scanBlocks(cnxml, 'exercise')) {
      exerciseNumber++;
      const openEnd = cnxml.indexOf('>', exr.index) + 1;
      const closeIdx = cnxml.indexOf('</exercise>', openEnd);
      if (closeIdx === -1) continue;
      const exerciseContent = cnxml.slice(openEnd, closeIdx);

      const solutionMatch = exerciseContent.match(/<solution\s+id="[^"]*">([\s\S]*?)<\/solution>/);
      if (solutionMatch) {
        moduleAnswers.push({ id: exr.id, number: exerciseNumber, content: solutionMatch[1] });
      }
    }
```

**Numbering-semantics caution (verify while editing):** today's answer-key counter increments per REGEX MATCH (id-only exercises). With scanBlocks it increments per id-bearing exercise — for physics this ADDS the `type=`-first exercises into the count, which is expected-diff class 4 and must match the chapter-wide exercise numbering (`:3304` sees the same set). Confirm both passes count the same population (they both use scanBlocks now → same set by construction).

- [ ] **Step 4: Run tests + blast radius**

Run: `npx vitest run tools/__tests__/cnxml-render-chapterscan-unify.test.js && npx vitest run tools/`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render-chapterscan-unify.test.js
git commit -m "fix(item10): chapter-wide + answer-key scans on scanBlocks — addId semantics preserved, type=-first exercises register"
```

---

### Task 4: Hardenings — P0-3 null-info, P0-4 roman lists, P0-5 emphasis classes

**Files:**
- Modify: `tools/cnxml-render.js:445-449` (P0-3), `:1703-1707` (P0-4)
- Modify: `tools/lib/cnxml-elements.js:770-775` (P0-5)
- Test: `tools/__tests__/cnxml-render-item10-hardenings.test.js` (new)

**Interfaces:** none new; `filterOutlineEntries` and `renderCnxmlToHtml` already exported; emphasis via `processInlineContent` (exported from cnxml-elements.js).

- [ ] **Step 1: Write the failing tests**

Create `tools/__tests__/cnxml-render-item10-hardenings.test.js`:

```js
/**
 * cnxml-render-item10-hardenings.test.js — item 10: P0-3 (null-info outline
 * entry excluded, not thrown), P0-4 (roman number-styles), P0-5 (emphasis
 * classes preserved verbatim, not just emphasis-one).
 */

import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml, filterOutlineEntries, _loadBookConfigForTest } from '../cnxml-render.js';

_loadBookConfigForTest('efnafraedi-2e');

function doc(inner) {
  return (
    '<document xmlns="http://cnx.rice.edu/cnxml"><title>T</title><content>' +
    inner + '</content></document>'
  );
}
const render = (inner) =>
  renderCnxmlToHtml(doc(inner), { lang: 'is', chapter: 3, moduleId: 'mT', moduleSections: {} }).html;

describe('P0-3 — filterOutlineEntries', () => {
  it('excludes a null-info entry instead of throwing', () => {
    expect(filterOutlineEntries({ a: { section: '1' }, broken: null, _meta: { section: 'x' } }))
      .toEqual([['a', { section: '1' }]]);
  });
});

describe('P0-4 — roman number-styles', () => {
  it('lower-roman enumerated list emits list-style-type: lower-roman', () => {
    const html = render(
      '<list id="l1" list-type="enumerated" number-style="lower-roman"><item>a</item></list>'
    );
    expect(html).toContain('list-style-type: lower-roman');
  });
  it('upper-roman emits upper-roman', () => {
    const html = render(
      '<list id="l1" list-type="enumerated" number-style="upper-roman"><item>a</item></list>'
    );
    expect(html).toContain('list-style-type: upper-roman');
  });
  it('equivalence pin: lower-alpha unchanged', () => {
    const html = render(
      '<list id="l1" list-type="enumerated" number-style="lower-alpha"><item>a</item></list>'
    );
    expect(html).toContain('list-style-type: lower-alpha');
  });
});

describe('P0-5 — emphasis class preservation', () => {
  it('effect-less emphasis keeps an arbitrary class', () => {
    const html = render('<para id="p1"><emphasis class="centered-text">c</emphasis></para>');
    expect(html).toContain('<em class="centered-text">c</em>');
  });
  it('bold emphasis keeps a multi-class attribute verbatim', () => {
    const html = render(
      '<para id="p1"><emphasis effect="bold" class="a b-c">t</emphasis></para>'
    );
    expect(html).toContain('<strong class="a b-c">t</strong>');
  });
  it('equivalence pin: emphasis-one still carried', () => {
    const html = render('<para id="p1"><emphasis class="emphasis-one">t</emphasis></para>');
    expect(html).toContain('<em class="emphasis-one">t</em>');
  });
  it('class attr value is escaped', () => {
    const html = render('<para id="p1"><emphasis class="a&quot;b">t</emphasis></para>');
    expect(html).not.toContain('class="a"b"'); // must not break out of the attribute
  });
});
```

- [ ] **Step 2: Run to verify the right failures**

P0-3 case throws today; roman cases show decimal (no style attr); `centered-text`/multi-class cases render bare `<em>`/`<strong>`; the pins pass.

- [ ] **Step 3: Implement**

3a. P0-3 (`:445-449`):

```js
function filterOutlineEntries(moduleSections) {
  return Object.entries(moduleSections).filter(
    // item 10/P0-3: tolerate a null info value (excluded, not thrown) — the
    // call site only populates section objects today; this is defense.
    ([key, info]) => !key.startsWith('_') && info && info.section !== '0'
  );
}
```

3b. P0-4 (`:1703-1707`):

```js
  const numberStyle = list.attributes['number-style'];
  if (listType === 'enumerated') {
    if (numberStyle === 'lower-alpha') styleAttr = ' style="list-style-type: lower-alpha"';
    else if (numberStyle === 'upper-alpha') styleAttr = ' style="list-style-type: upper-alpha"';
    else if (numberStyle === 'lower-roman') styleAttr = ' style="list-style-type: lower-roman"';
    else if (numberStyle === 'upper-roman') styleAttr = ' style="list-style-type: upper-roman"';
  }
```

3c. P0-5 (`cnxml-elements.js:770-775`) — replace the `classAttr` line and its comment:

```js
        // item 10/P0-5: preserve the class attribute VERBATIM (any classes) —
        // the old emphasis-one-only carry dropped organic's centered-text etc.
        // Unknown classes are inert until vefur CSS styles them ([VEFUR] note
        // in the campaign register).
        const classAttr = cls ? ` class="${escapeAttr(cls)}"` : '';
```

(`escapeAttr` is defined in this file — verify it is in scope at that line; it is exported from this module.)

- [ ] **Step 4: Run tests + blast radius**

Run: `npx vitest run tools/__tests__/cnxml-render-item10-hardenings.test.js && npx vitest run tools/`
Expected: all green (goldens contain no non-`emphasis-one` classed emphasis — chem is class-clean; if any golden diff appears here, STOP: that contradicts the register and must be understood).

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-render.js tools/lib/cnxml-elements.js tools/__tests__/cnxml-render-item10-hardenings.test.js
git commit -m "fix(item10): P0-3 null-info guard, P0-4 roman list styles, P0-5 verbatim emphasis-class carry"
```

---

### Task 5: Link-path fixes — #20 appendix fragment, #22 key-terms fallback routing

**Files:**
- Modify: `tools/lib/cnxml-elements.js:106-116` (#20)
- Modify: `tools/cnxml-render.js:3586-3601` (#22 — the link-handling section of the key-terms fallback)
- Test: `tools/__tests__/cnxml-elements-appendix-fragment.test.js` (new), `tools/__tests__/cnxml-render-keyterms-fallback.test.js` (new)

**Interfaces:**
- Consumes: `resolveCrossModuleHref` (exported from cnxml-elements.js), `appendixResolution` context (`cnxml-render.js:3147`, in scope at the fallback).
- Produces: documentId-keyed appendix hrefs now carry `#targetId` when present. Key-terms fallback: appendix-document links → `/vidauki/{letter}[#target]`; all other links → byte-identical to today's construction.

- [ ] **Step 1: Write the failing tests**

`tools/__tests__/cnxml-elements-appendix-fragment.test.js`:

```js
/**
 * cnxml-elements-appendix-fragment.test.js — item 10 (#20): a
 * document=<appendix>+target-id link keeps its fragment. The no-owner A1
 * branch's fragment drop is a DOCUMENTED decision and stays (pinned here).
 */

import { describe, it, expect } from 'vitest';
import { resolveCrossModuleHref } from '../lib/cnxml-elements.js';

const ctx = {
  moduleId: 'm1',
  bookSlug: 'liffraedi-2e',
  appendixModuleLetters: new Map([['m9001', 'B']]),
  appendixIdMap: new Map([['deep-id', { letter: 'C' }]]),
};

describe('#20 — documentId-keyed appendix branch', () => {
  it('appends #targetId when present', () => {
    const r = resolveCrossModuleHref('m9001', 'tbl-5', ctx);
    expect(r.href).toBe('/liffraedi-2e/vidauki/B#tbl-5');
  });
  it('no fragment when target-id absent (today’s document-only shape)', () => {
    const r = resolveCrossModuleHref('m9001', null, ctx);
    expect(r.href).toBe('/liffraedi-2e/vidauki/B');
  });
});

describe('A1 no-owner branch — fragment drop is deliberate (pin)', () => {
  it('still drops the fragment (documented A1 decision)', () => {
    const r = resolveCrossModuleHref(null, 'deep-id', ctx);
    expect(r.href).toBe('/liffraedi-2e/vidauki/C');
  });
});
```

`tools/__tests__/cnxml-render-keyterms-fallback.test.js` — the fallback lives in `main()`; test it via a small extracted helper (Step 3 extracts one). Characterization pair:

```js
/**
 * cnxml-render-keyterms-fallback.test.js — item 10 (#22): the key-terms
 * fallback (organic-format books, zero <glossary>) routes appendix-document
 * links to /vidauki/{letter}; every other link keeps today's section URL
 * byte-identical (characterization).
 */

import { describe, it, expect } from 'vitest';
import { buildKeyTermsItems } from '../cnxml-render.js'; // extracted in Step 3

const itemsCnxml = [
  '<item><link document="m00032" target-id="term-00006">alcohol</link></item>',
  '<item><link document="m9001" target-id="term-00007">appendix term</link></item>',
  '<item>plain text term</item>',
].join('');

const args = {
  sectionSlugFor: (moduleId) => `3-2-nafn`, // stand-in for the getOutputFilename wiring
  bookSlug: 'lifraen-efnafraedi',
  chapterStr: 'ch03',
  appendixResolution: {
    bookSlug: 'lifraen-efnafraedi',
    appendixModuleLetters: new Map([['m9001', 'D']]),
    appendixIdMap: new Map(),
  },
};

describe('#22 — key-terms fallback link routing', () => {
  it('ordinary module link keeps the exact section URL shape (characterization)', () => {
    const lines = buildKeyTermsItems(itemsCnxml, args);
    expect(lines[0]).toBe(
      '<li><a href="/content/lifraen-efnafraedi/chapters/ch03/3-2-nafn.html">alcohol</a></li>'
    );
  });
  it('appendix-document link resolves to /vidauki/{letter}#target', () => {
    const lines = buildKeyTermsItems(itemsCnxml, args);
    expect(lines[1]).toBe(
      '<li><a href="/lifraen-efnafraedi/vidauki/D#term-00007">appendix term</a></li>'
    );
  });
  it('plain-text item unchanged', () => {
    const lines = buildKeyTermsItems(itemsCnxml, args);
    expect(lines[2]).toBe('<li>plain text term</li>');
  });
});
```

- [ ] **Step 2: Run to verify failures**

Fragment test: FAIL (`/liffraedi-2e/vidauki/B` — no fragment). Key-terms: FAIL (`buildKeyTermsItems` not exported). A1 pin + document-only case: PASS.

- [ ] **Step 3: Implement**

3a. #20 (`cnxml-elements.js:106-116`) — replace the branch + comment:

```js
  // document="<appendix module>" → the appendix landing page. Fires for any arm
  // that passes documentId. Must run before the lookupModuleFilename() path, which
  // cannot resolve appendix modules (they render in a separate pass) → href:null.
  // item 10/#20: a document+target-id link keeps its fragment so the reader
  // lands on the referenced element (0 such links in chem today; biology watch).
  if (documentId && context.bookSlug && context.appendixModuleLetters?.has(documentId)) {
    const base = appendixLandingHref(context.bookSlug, context.appendixModuleLetters.get(documentId));
    return {
      href: targetId ? `${base}#${targetId}` : base,
      ownerModule: documentId,
      sameModule: false,
    };
  }
```

(`targetId` values come from CNXML id attributes — same charset as every other fragment emitted by this module; no additional escaping is applied elsewhere, match that.)

3b. #22 — extract the fallback's per-item loop into a module-level helper `buildKeyTermsItems(sectionInner, opts)` in `cnxml-render.js` (exported for tests), used by `main()`:

```js
/**
 * Key-terms fallback items (item 10/#22): newer-OpenStax books (organic) have
 * no per-module <glossary>; the chapter key-terms page is built from
 * <section class="key-terms"> link items. Appendix-document links route
 * through resolveCrossModuleHref (→ /vidauki/{letter}[#target]); every other
 * link keeps the pre-existing section-URL construction byte-identical
 * (characterized by test — the resolver's general path is NOT adopted here to
 * avoid changing organic's working URLs).
 * @param {string} sectionInner - inner content of the key-terms <section>
 * @param {{sectionSlugFor: (moduleId: string) => string, bookSlug: string,
 *          chapterStr: string, appendixResolution: object}} opts
 * @returns {string[]} rendered <li> lines
 */
function buildKeyTermsItems(sectionInner, opts) {
  const items = extractNestedElements(sectionInner, 'item');
  const termLines = [];
  for (const item of items) {
    const linkMatch = item.content.match(
      /<link\s+document="([^"]+)"(?:\s+target-id="([^"]+)")?[^>]*>([^<]+)<\/link>/
    );
    if (linkMatch) {
      const termText = linkMatch[3].trim();
      const linkModuleId = linkMatch[1];
      const linkTargetId = linkMatch[2] || null;
      const resolved = resolveCrossModuleHref(linkModuleId, linkTargetId, {
        ...opts.appendixResolution,
        moduleId: linkModuleId,
      });
      if (resolved.href && resolved.href.includes('/vidauki/')) {
        termLines.push(`<li><a href="${resolved.href}">${escapeHtml(termText)}</a></li>`);
      } else {
        const sectionSlug = opts.sectionSlugFor(linkModuleId);
        termLines.push(
          `<li><a href="/content/${opts.bookSlug}/chapters/${opts.chapterStr}/${sectionSlug}.html">${escapeHtml(termText)}</a></li>`
        );
      }
    } else {
      const plainText = item.content.replace(/<[^>]+>/g, '').trim();
      if (plainText) termLines.push(`<li>${escapeHtml(plainText)}</li>`);
    }
  }
  return termLines;
}
```

**Resolver-call caution:** `resolveCrossModuleHref` with a minimal context reaches the documentId-appendix branch deterministically (needs only `bookSlug` + `appendixModuleLetters`); for non-appendix documents it falls through toward `lookupModuleFilename`, whose href (if any) is DISCARDED here — the `includes('/vidauki/')` guard keeps every non-appendix link on the characterized legacy construction. Verify `resolveCrossModuleHref` cannot throw on the minimal context for a non-appendix module (read its fall-through path once; if a missing map access can throw, wrap the call: `let resolved; try { resolved = … } catch { resolved = { href: null }; }` — the fallback construction is always available).

In `main()` (`:3586-3601`), replace the inlined loop with:

```js
            const termLines = buildKeyTermsItems(keyTermsMatch[1], {
              sectionSlugFor: (linkModuleId) => {
                const sectionInfo = moduleSections[linkModuleId];
                return sectionInfo
                  ? getOutputFilename(linkModuleId, args.chapter, moduleSections).replace('.html', '')
                  : linkModuleId;
              },
              bookSlug: BOOK_SLUG,
              chapterStr,
              appendixResolution,
            });
```

Export `buildKeyTermsItems` in the export block.

- [ ] **Step 4: Run tests + blast radius**

Run: `npx vitest run tools/__tests__/cnxml-elements-appendix-fragment.test.js tools/__tests__/cnxml-render-keyterms-fallback.test.js && npx vitest run tools/`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/cnxml-elements.js tools/cnxml-render.js \
        tools/__tests__/cnxml-elements-appendix-fragment.test.js tools/__tests__/cnxml-render-keyterms-fallback.test.js
git commit -m "fix(item10): #20 appendix fragment on documentId branch; #22 key-terms fallback routes appendix links through resolver"
```

---

### Task 6: All-books corpus sweep, full gate, register, PR prep

**Files:**
- Create (scratchpad, NOT committed): `render-corpus-hash-allbooks.mjs`
- Modify: `docs/plans/2026-07-11-pre-semester-coding-campaign.md` (item 10 line)

- [ ] **Step 1: Build the all-books harness**

Adapt the item-8 harness (`docs/superpowers/plans/2026-07-16-item8-pr2-handled-tags.md` Task 5 — same structure) with two changes: iterate EVERY book under `books/*/03-translated` (skip `__e2e-fixture__` and `testbook`), and emit `book/track/chNN/module hash` lines. Same determinism rules: `resetMathJaxIds()` per module, sorted file order, `_loadBookConfigForTest(book)` per book, ERROR:<msg> hashes allowed if identical across trees.

- [ ] **Step 2: Run branch vs main worktree, diff, CLASSIFY**

```bash
SCRATCH=<session scratchpad>
node "$SCRATCH/render-corpus-hash-allbooks.mjs" /home/siggi/dev/repos/namsbokasafn-efni "$SCRATCH/h-branch.txt"
git worktree add "$SCRATCH/main-tree" main
ln -s /home/siggi/dev/repos/namsbokasafn-efni/node_modules "$SCRATCH/main-tree/node_modules"
node "$SCRATCH/render-corpus-hash-allbooks.mjs" "$SCRATCH/main-tree" "$SCRATCH/h-main.txt"
diff "$SCRATCH/h-main.txt" "$SCRATCH/h-branch.txt" > "$SCRATCH/corpus-diff.txt"; wc -l "$SCRATCH/corpus-diff.txt"
rm "$SCRATCH/main-tree/node_modules"; git worktree remove "$SCRATCH/main-tree"
```

Then classify: **any `efnafraedi-2e` or `liffraedi-2e` line in the diff = STOP** (find the leak; do not rationalize). For every other diffed module, render it in both trees, textual-diff the HTML, and bin the change into classes 1–4 (spec § Safety proof); record per-module classifications. **An unclassifiable diff = STOP.**

- [ ] **Step 3: Full authoritative gate**

Run from repo root: `npm test` — entire suite green. `git status --porcelain books/` → empty.

- [ ] **Step 4: Update the campaign register**

Edit item 10's line (`docs/plans/2026-07-11-pre-semester-coding-campaign.md:53`) in the document's shipped-item style: the 7 fixes shipped (scanBlocks unification subsuming P0-2; P0-3/4/5; #20 documentId-branch; #22 fallback routing), **RV-4 annotated "closed by P0-1 2026-07-13, confirmed item 10"**, the corpus-sweep result (chem+bio 0-diff; per-class counts for organic/physics), and the **[VEFUR] note**: newly-preserved emphasis classes (e.g. `centered-text`) reach published HTML unstyled until vefur CSS covers them.

- [ ] **Step 5: Commit register**

```bash
git add docs/plans/2026-07-11-pre-semester-coding-campaign.md
git commit -m "docs(item10): campaign register — sweep shipped, RV-4 confirmed closed, [VEFUR] emphasis-class note"
```

- [ ] **Step 6: PR** (controller's finishing flow — push, PR body carries the fix table, corpus classification counts, the chem+bio 0-diff proof, and the [VEFUR] note).

---

## Self-review (performed at plan-writing time)

- **Spec coverage:** scanBlocks contract incl. flag-not-filter + addId preservation ✓ (T1/T3); all six pre-scans + answer-key ✓ (T2/T3, exact sites); JSDoc note redemption ✓ (T2); P0-3/4/5 ✓ (T4, with escape test for P0-5); #20 single-branch + A1 pin ✓ (T5); #22 resolver-routing with characterized legacy fallback ✓ (T5); RV-4 register-only ✓ (T6); safety split + classification ✓ (T6); [VEFUR] note ✓ (T6). Out-of-scope list respected (no extractor, no example/exercise skip widening — T3 keeps their numbering unconditional).
- **Placeholder scan:** T3's test has two verify-then-write points (the answer-key function's real exported name/signature and its path resolution) — the decision is made (test the real function through real seams; assertions fixed), only the symbol names are discovered on site. No TBDs.
- **Type consistency:** `scanBlocks` return `{id, attrs, index, unnumbered}` used identically in T2/T3; `buildKeyTermsItems(sectionInner, opts)` signature matches its test; `filterOutlineEntries` unchanged shape.
- **Known risks for the executor:** figure-caption label wording in T2's assertions is checked against an existing test before writing; `resolveCrossModuleHref` minimal-context fall-through is read once before wiring (#22), with a sanctioned try/catch if it can throw; the answer-key population change (physics `type=`-first) is expected-diff class 4 and must be consistent between the two exercise passes (same scanner → same set by construction).
