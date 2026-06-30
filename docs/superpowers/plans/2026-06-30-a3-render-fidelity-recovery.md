# A3 Render-Fidelity Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is a **bug-fix** plan: each fix task's RED step is a characterization test that reproduces a real drop; use `superpowers:systematic-debugging` to confirm the exact line before fixing.

**Goal:** Recover the 22 dropped equations + 2 dropped images in efnafraedi-2e's rendered HTML by fixing three render-path gaps, and harden the fidelity-check tool so it can no longer mask such losses.

**Architecture:** First build the honest oracle — fold a MathML tag-skeleton **identity diff** into `tools/cnxml-render-fidelity-check.js` (per-equation loss, deduped against rollup re-presentation). Then fix three `tools/cnxml-render.js` gaps, each driven to zero against that oracle and locked by a characterization test mirroring the C2/C3 DOM suites: (A) `renderList` drops block `<equation>`/`<media>` siblings of `<para>` inside list items; (B) `renderGlossary` can't render inline math in `<term>`; (C) one appendices image.

**Tech Stack:** Node 22, ES modules, `@xmldom/xmldom`, MathJax 4.1.2, Vitest.

**Design spec:** `docs/superpowers/specs/2026-06-30-a3-render-fidelity-recovery-design.md`.

## Global Constraints

- **Robustness over expedience** (lead directive): one real code path; fail loud (extend the C3 loud-seam where a fix touches it) rather than silently drop; no speculative edits — confirm each mechanism with a failing test first. (`feedback-robustness-over-expedience`)
- **Verification oracle is the identity diff** (Task 1), not raw counts: a genuine loss = a CNXML `<m:math>` (by MathML tag-skeleton, localization-invariant) absent from **all** of a chapter's HTML pages (sections + rollups). Acceptance = efnafraedi-2e genuine math losses **22 → 0**, image losses **2 → 0**.
- **No committed `05-publication` churn in this PR.** Verify by rendering a chapter to disk, running the oracle, then `git checkout` to revert. Reader delivery is the separate re-render+sync wave, not this PR.
- **efnafraedi-2e only.** Other books are out of scope (they benefit from the same code later).
- Local gate authoritative: `npm test` + `npm run validate` (CI credits out until ~Jul 1; no branch protection).
- Branch: `fix/a3-render-fidelity-recovery` (already created; the design doc is committed on it).
- Node 22 / `nvm use` before any lockfile change (none expected — no new deps).

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `tools/cnxml-render-fidelity-check.js` | fidelity check; add identity-diff measure + hard-gate (the oracle) | Modify |
| `tools/__tests__/cnxml-render-fidelity-check.test.js` | test the identity-diff path | Modify |
| `tools/cnxml-render.js` | render CNXML→HTML; the three gaps (`renderList` ~1827, `renderGlossary` ~1973, key-terms compile ~3719, `renderMedia` ~1273) | Modify |
| `tools/__tests__/cnxml-render-list-dom.test.js` | characterization: block children of list items render in order | Create |
| `tools/__tests__/cnxml-render-glossary-dom.test.js` | characterization: inline math in `<term>`/`<meaning>` renders | Create |
| `tools/__tests__/cnxml-render-media-dom.test.js` | characterization: the appendices image case | Create (or fold into list-dom if same root cause) |
| `books/efnafraedi-2e/render-fidelity-baseline.json` | check baseline | Regenerate after fixes (post clean render) |
| `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` | backlog/register | Mark A3 done; record stale-description correction + detector hardening; log OOS finds |

**Verified mechanisms (from diagnosis 2026-06-30 — confirm in each RED step, do not pre-edit):**
- **A:** `renderList` (`:1827`). The nested-paras branch (`:1862-1867`) renders only `<para>` children of an `<item>` and drops sibling block `<equation>`/`<media>`; the nested-list branch (`:1847`) likewise. Only the no-paras branch (`:1874`) handles equations. Worked-solution `<list class="stepwise">` items inside `<example>` interleave para+equation+media → the non-para blocks drop. Covers ~17 equations + the ch13 image (`CNX_Chem_13_04_ICETable3_img_IS.svg`, ancestry `media.scaled-down < item < list.stepwise < example`).
- **B:** `renderGlossary` (`:1982`) `const termMatch = def.content.match(/<term>([^<]*)<\/term>/)` — `[^<]*` cannot span a `<m:math>` child, and `:1991` `escapeHtml(term)` would escape math to literal text anyway. ch21 math is in `<meaning>` (processed via `processInlineContent` at `:1987`) — confirm whether the loss there is in this inline path or the compiled key-terms path (`:3719`).
- **C:** one appendices image; localize its container in RED (likely the same list-item-in-example pattern as A, or a media path in `renderMedia` `:1273`).

---

### Task 1: Identity-diff in the fidelity-check tool (build the oracle first)

**Files:**
- Modify: `tools/cnxml-render-fidelity-check.js`
- Test: `tools/__tests__/cnxml-render-fidelity-check.test.js`

**Interfaces:**
- Produces: `identityDiffChapter({ cnxml, html }) → { lostSkeletons: Array<[string, number]>, lostCount: number }` — exported pure function. For a chapter, the multiset of CNXML `<m:math>` tag-skeletons minus the multiset of all-chapter-HTML `<math class="assistive-mathml">` tag-skeletons; `lostCount = Σ max(0, C[skel] − H[skel])`. Skeleton = comma-joined sequence of element localNames inside the math (drop `m:` prefix, attrs, text — localization-invariant).
- Consumes: the chapter `{ cnxml, html }` arrays already produced by `readChapterFromDisk`.

- [ ] **Step 1: Write the failing tests**

Add to `tools/__tests__/cnxml-render-fidelity-check.test.js`:

```js
import { identityDiffChapter } from '../cnxml-render-fidelity-check.js';

const M = '<m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mi>x</m:mi></m:math>';
const ASSIST = '<math class="assistive-mathml"><mi>x</mi></math>';

describe('fidelity check — identity diff (rollup-masking immune)', () => {
  it('flags an equation present in CNXML but absent from every HTML page', () => {
    const cnxml = [`<content><equation>${M}</equation><equation>${M}</equation></content>`];
    const html = [`<mjx-container></mjx-container>${ASSIST}`]; // only 1 of 2 rendered
    expect(identityDiffChapter({ cnxml, html }).lostCount).toBe(1);
  });

  it('does NOT flag an equation re-presented in a rollup page (no false drop)', () => {
    const cnxml = [`<content><equation>${M}</equation></content>`];
    const html = [`<mjx-container></mjx-container>${ASSIST}`, `<mjx-container></mjx-container>${ASSIST}`];
    expect(identityDiffChapter({ cnxml, html }).lostCount).toBe(0);
  });

  it('reports 0 when every equation is present', () => {
    const cnxml = [`<content><equation>${M}</equation></content>`];
    expect(identityDiffChapter({ cnxml, html: [`${ASSIST}`] }).lostCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run to confirm RED**

Run: `npx vitest run tools/__tests__/cnxml-render-fidelity-check.test.js`
Expected: FAIL — `identityDiffChapter` is not exported.

- [ ] **Step 3: Implement `identityDiffChapter` + wire into the check**

Add a `mathSkeletons(text, opening)` helper and `identityDiffChapter`. Skeleton extraction (port from the diagnosis script): for each `<m:math …>…</m:math>` (CNXML) or `<math …class="assistive-mathml"…>…</math>` (HTML), take the inner content, collect `(inner.match(/<\/?[a-zA-Z][\w:.-]*/g) || []).map(t => t.replace(/^<\/?(?:m:)?/, '').toLowerCase())`, join with `,`. Build multisets, compute `lostCount`. Export it. Then add a per-chapter check in `main()` that calls it and emits `{ type: 'genuine-math-drop', lostCount, lostSkeletons }` findings, counted into `totalFindings` so a non-zero result makes the tool exit non-zero (hard-gate). Keep the existing cross-stage/control-char/shape checks unchanged.

- [ ] **Step 4: Run to confirm GREEN**

Run: `npx vitest run tools/__tests__/cnxml-render-fidelity-check.test.js`
Expected: PASS.

- [ ] **Step 5: Snapshot current genuine losses (the starting point: 22)**

Run: `node tools/cnxml-render-fidelity-check.js --book efnafraedi-2e 2>&1 | grep -E "genuine-math-drop|Total"`
Expected: genuine-math-drop findings totalling ~22 against the *committed* (pre-fix) HTML. (This is the number the fixes will drive to 0.)

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-render-fidelity-check.js tools/__tests__/cnxml-render-fidelity-check.test.js
git commit -m "feat(a3): identity-diff in fidelity check (rollup-masking immune)

The chapter-aggregate count masked real drops because rollup pages re-present
equations and inflate the HTML side. Add identityDiffChapter: per-equation
MathML tag-skeleton multiset diff (CNXML vs all chapter HTML assistive-MathML),
deduped against re-presentation; emits genuine-math-drop findings and hard-gates.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Recover block children (equation + media) inside list items

**Files:**
- Modify: `tools/cnxml-render.js` `renderList` (`:1827-1899`)
- Test: `tools/__tests__/cnxml-render-list-dom.test.js` (create)

**Interfaces:**
- Consumes: existing `renderEquation(eq, context)`, `renderMedia(media, context)`, `processInlineContent`, `extractElements`, `extractNestedElements`; the Task 1 oracle for verification.
- Produces: `renderList` renders **all** block children of an `<item>` (`<para>`, `<equation>`, `<media>`, nested `<list>`) in source order; no behavior change for items containing only text or only paras.

- [ ] **Step 1: Write the failing characterization tests**

Create `tools/__tests__/cnxml-render-list-dom.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml } from '../cnxml-render.js';

const MATH = '<m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:mi>x</m:mi></m:math>';
function render(cnxml) {
  return renderCnxmlToHtml(cnxml, {
    lang: 'is', chapter: 13, bookSlug: 'efnafraedi-2e', moduleId: 'mTEST', moduleSections: {},
  }).html;
}

describe('renderList — block children inside list items', () => {
  it('renders an <equation> that is a sibling of <para> inside an item (was dropped)', () => {
    const html = render(
      '<document xmlns="http://cnx.rice.edu/cnxml"><content>' +
      '<example id="ex1"><list list-type="enumerated" class="stepwise">' +
      '<item><para id="p1">Skref eitt</para>' +
      `<equation id="eqLOST" class="unnumbered">${MATH}</equation></item>` +
      '</list></example></content></document>'
    );
    expect(html.split('<mjx-container').length - 1).toBe(1);
    expect(html).toContain('Skref eitt');
  });

  it('renders a <media> image that is a sibling of <para> inside an item (was dropped)', () => {
    const html = render(
      '<document xmlns="http://cnx.rice.edu/cnxml"><content>' +
      '<example id="ex2"><list class="stepwise">' +
      '<item><para id="p2">Sjá töflu</para>' +
      '<media id="m1" class="scaled-down" alt="ICE tafla"><image src="ICETableX_img_IS.svg" mime-type="image/svg+xml"/></media>' +
      '</item></list></example></content></document>'
    );
    expect(html).toContain('ICETableX_img_IS.svg');
    expect(html).toContain('Sjá töflu');
  });

  it('preserves source order: para before equation', () => {
    const html = render(
      '<document xmlns="http://cnx.rice.edu/cnxml"><content>' +
      '<list class="stepwise"><item><para id="pA">Fyrst</para>' +
      `<equation id="eqA" class="unnumbered">${MATH}</equation></item></list>` +
      '</content></document>'
    );
    expect(html.indexOf('Fyrst')).toBeLessThan(html.indexOf('<mjx-container'));
  });

  it('still renders a plain text-only item unchanged (no regression)', () => {
    const html = render(
      '<document xmlns="http://cnx.rice.edu/cnxml"><content>' +
      '<list><item>Bara texti</item></list></content></document>'
    );
    expect(html).toContain('Bara texti');
    expect(html.split('<li').length - 1).toBe(1);
  });
});
```

- [ ] **Step 2: Run to confirm RED**

Run: `npx vitest run tools/__tests__/cnxml-render-list-dom.test.js`
Expected: the equation and media tests FAIL (0 mjx-container / missing src); the order + text-only tests may already pass.

- [ ] **Step 3: Diagnose + fix `renderList`**

Confirm via `superpowers:systematic-debugging` that the drop is the `:1862-1867` (and `:1847`) para-only branches. Fix: render an item's block children in **source order** — for each item, walk `item.content` and emit `<para>` via `processInlineContent`, `<equation>` via `renderEquation`, `<media>` via `renderMedia`, nested `<list>` via `renderList`, in appearance order, instead of rendering only paras. Reuse the existing renderers. Preserve the text-only path and the existing equation-in-para placeholder path for items with no block siblings. Extend the C3 loud-seam notion: record any unhandled block child type rather than dropping it silently.

> Implementer: show the exact diff. Do NOT change output for items containing only text or only `<para>` (golden + the "no regression" test guard this).

- [ ] **Step 4: Run to confirm GREEN**

Run: `npx vitest run tools/__tests__/cnxml-render-list-dom.test.js`
Expected: all 4 PASS.

- [ ] **Step 5: Oracle check for ch13 (render → measure → revert)**

Run:
```bash
node tools/cnxml-render.js --book efnafraedi-2e --chapter 13 >/dev/null 2>&1
node tools/cnxml-render-fidelity-check.js --book efnafraedi-2e --chapter 13 2>&1 | grep -E "genuine-math-drop|lostCount|Total"
git checkout -- books/efnafraedi-2e/05-publication/mt-preview/chapters/13/
```
Expected: ch13 genuine-math-drop falls from 16 toward 0 (the ~16 equations recovered; the ch13 image also recovers if media handling landed). Tree clean after checkout (verify with `git status --short`).

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render-list-dom.test.js
git commit -m "fix(a3): render block equation/media children inside list items

renderList rendered only <para> children of an <item>, dropping sibling
block <equation>/<media> (worked-solution stepwise lists in <example>).
Now renders all block children in source order. Recovers ~16 equations +
the ch13 ICE-table image.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Recover inline math in glossary definitions

**Files:**
- Modify: `tools/cnxml-render.js` `renderGlossary` (`:1973-1999`) and, if RED shows the loss is there, the compiled key-terms path (`:3719`)
- Test: `tools/__tests__/cnxml-render-glossary-dom.test.js` (create)

**Interfaces:**
- Consumes: `processInlineContent`, `stripTags`, `escapeHtml`; the Task 1 oracle.
- Produces: a `<definition>` whose `<term>` or `<meaning>` contains `<m:math>` renders the math (mjx-container); `context.terms[...]` still keyed by plain text.

- [ ] **Step 1: Write the failing characterization tests**

Create `tools/__tests__/cnxml-render-glossary-dom.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml } from '../cnxml-render.js';

const MATH = '<m:math xmlns:m="http://www.w3.org/1998/Math/MathML"><m:msubsup><m:mi>E</m:mi><m:mi>k</m:mi><m:mo>°</m:mo></m:msubsup></m:math>';
function render(cnxml) {
  return renderCnxmlToHtml(cnxml, {
    lang: 'is', chapter: 17, bookSlug: 'efnafraedi-2e', moduleId: 'mTEST', moduleSections: {},
  }).html;
}

describe('renderGlossary — inline math in definitions', () => {
  it('renders math embedded in a <term> (was dropped)', () => {
    const html = render(
      '<document xmlns="http://cnx.rice.edu/cnxml"><glossary>' +
      `<definition id="d1"><term>staðalkerspenna (${MATH})</term>` +
      '<meaning id="me1">Spennan við staðalskilyrði.</meaning></definition>' +
      '</glossary></document>'
    );
    expect(html).toContain('<mjx-container');
    expect(html).toContain('staðalkerspenna');
  });

  it('renders math embedded in a <meaning> (ch21 case)', () => {
    const html = render(
      '<document xmlns="http://cnx.rice.edu/cnxml"><glossary>' +
      '<definition id="d2"><term>jáeind</term>' +
      `<meaning id="me2">Ögn táknuð ${MATH} sem ...</meaning></definition>` +
      '</glossary></document>'
    );
    expect(html.split('<mjx-container').length - 1).toBeGreaterThanOrEqual(1);
  });

  it('a plain text-only definition still renders (no regression)', () => {
    const html = render(
      '<document xmlns="http://cnx.rice.edu/cnxml"><glossary>' +
      '<definition id="d3"><term>hvati</term><meaning id="me3">Efni sem flýtir efnahvarfi.</meaning></definition>' +
      '</glossary></document>'
    );
    expect(html).toContain('hvati');
    expect(html).toContain('Efni sem flýtir');
  });
});
```

- [ ] **Step 2: Run to confirm RED**

Run: `npx vitest run tools/__tests__/cnxml-render-glossary-dom.test.js`
Expected: the term-math test FAILS (the `<term>([^<]*)</term>` regex won't match a term containing `<m:math>`, so the definition is skipped). Note whether the meaning-math test also fails (pins whether `:1987` or the `:3719` path is the gap).

- [ ] **Step 3: Diagnose + fix**

Confirm via `superpowers:systematic-debugging`. Fix `renderGlossary`: capture the full `<term>…</term>` inner content (not `[^<]*`) and render it via `processInlineContent` (embedded `<m:math>` renders) instead of `escapeHtml(term)`; keep a plain-text term for `context.terms` (`stripTags` on the captured inner). Confirm `<meaning>` already renders math via `processInlineContent`; if the ch21 loss is in the compiled key-terms page (`:3719`), apply the same inline-processing fix there. Show the exact diff and which path(s) changed.

- [ ] **Step 4: Run to confirm GREEN**

Run: `npx vitest run tools/__tests__/cnxml-render-glossary-dom.test.js`
Expected: all 3 PASS.

- [ ] **Step 5: Oracle check for ch16/ch17/ch21**

Run:
```bash
for c in 16 17 21; do node tools/cnxml-render.js --book efnafraedi-2e --chapter $c >/dev/null 2>&1; done
node tools/cnxml-render-fidelity-check.js --book efnafraedi-2e 2>&1 | grep -E "ch1[67]|ch21|genuine-math-drop|Total"
git checkout -- books/efnafraedi-2e/05-publication/mt-preview/chapters/16/ books/efnafraedi-2e/05-publication/mt-preview/chapters/17/ books/efnafraedi-2e/05-publication/mt-preview/chapters/21/
```
Expected: ch16/17/21 genuine-math-drop → 0. Tree clean after checkout.

- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render-glossary-dom.test.js
git commit -m "fix(a3): render inline math inside glossary term/meaning

renderGlossary captured <term> via <term>([^<]*)</term> (can't span a
<m:math> child) and escapeHtml'd it, dropping math symbols in term names
(ΔG°f, E°kerfis). Now renders term inner content through processInlineContent;
plain-text term key preserved. Recovers 5 definition equations.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Recover the appendices image drop

**Files:**
- Modify: `tools/cnxml-render.js` (locus per RED — likely `renderList`/`renderMedia` if same class, else the appendix render path)
- Test: `tools/__tests__/cnxml-render-media-dom.test.js` (create), OR add a case to the Task 2 list-dom suite if the cause is identical

**Interfaces:**
- Consumes: `renderMedia`, `renderCnxmlToHtml`; the Task 1 oracle.
- Produces: the dropped appendices image renders.

- [ ] **Step 1: Localize the dropped image + its container**

Run:
```bash
cn=$(grep -rhoE '<image[^>]+src="[^"]+"' books/efnafraedi-2e/03-translated/mt-preview/appendices/*.cnxml | grep -oE 'src="[^"]+"' | sed 's/.*\///;s/"//' | sort -u)
ht=$(grep -rhoE '<img[^>]+src="[^"]+"' books/efnafraedi-2e/05-publication/mt-preview/chapters/appendices/*.html | grep -oE 'src="[^"]+"' | sed 's/.*\///;s/"//' | sort -u)
comm -23 <(echo "$cn") <(echo "$ht")
```
Then find the missing image's container ancestry with an `@xmldom/xmldom` parent-chain walk (same pattern used in diagnosis: parse the owning module, find the `<image>` whose `src` matches, walk `parentNode` collecting `localName`+`class`).

- [ ] **Step 2: Write the failing characterization test**

Create `tools/__tests__/cnxml-render-media-dom.test.js` with minimal inline CNXML reproducing the dropped image's exact container (from Step 1). Assert the image `src` appears in the rendered HTML. If the container is the list-item-in-example pattern, it's already covered by Task 2 — in that case add a focused appendix-context case here and note the shared root cause.

```js
import { describe, it, expect } from 'vitest';
import { renderCnxmlToHtml } from '../cnxml-render.js';
// Fill the CNXML structure from Step 1's ancestry result, and the real basename, before running.
describe('renderMedia — appendices image (was dropped)', () => {
  it('renders the image in its appendix container', () => {
    const html = renderCnxmlToHtml(
      /* minimal CNXML matching the Step-1 container, with the dropped <image src=...> */ '',
      { lang: 'is', chapter: 'appendices', bookSlug: 'efnafraedi-2e', moduleId: 'mTEST', moduleSections: {} }
    ).html;
    expect(html).toContain('SRC_FROM_STEP_1.svg'); // replace with the real basename
  });
});
```

- [ ] **Step 3: Confirm RED, diagnose, fix, confirm GREEN**

Run: `npx vitest run tools/__tests__/cnxml-render-media-dom.test.js` → RED. Fix the locus via `superpowers:systematic-debugging`. Run again → GREEN.

- [ ] **Step 4: Oracle/image check for appendices (render → measure → revert)**

Run:
```bash
node tools/cnxml-render.js --book efnafraedi-2e --chapter appendices >/dev/null 2>&1
echo "images missing from html:"; comm -23 <(grep -rhoE '<image[^>]+src="[^"]+"' books/efnafraedi-2e/03-translated/mt-preview/appendices/*.cnxml | grep -oE 'src="[^"]+"' | sed 's/.*\///;s/"//' | sort -u) <(grep -rhoE '<img[^>]+src="[^"]+"' books/efnafraedi-2e/05-publication/mt-preview/chapters/appendices/*.html | grep -oE 'src="[^"]+"' | sed 's/.*\///;s/"//' | sort -u)
git checkout -- books/efnafraedi-2e/05-publication/mt-preview/chapters/appendices/
```
Expected: no image missing. Tree clean after checkout.

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render-media-dom.test.js
git commit -m "fix(a3): recover dropped appendices image

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Whole-book verification, golden + baseline regen, register update

**Files:**
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`; regenerate `tools/__tests__/fixtures/render-golden/` if affected; regenerate `books/efnafraedi-2e/render-fidelity-baseline.json`

- [ ] **Step 1: Whole-book oracle run → expect 0 genuine drops**

Run:
```bash
node tools/cnxml-render.js --book efnafraedi-2e >/dev/null 2>&1
node tools/cnxml-render-fidelity-check.js --book efnafraedi-2e 2>&1 | grep -E "genuine-math-drop|Total findings"
# also confirm 0 image drops across all chapters (loop the comm check or eyeball the check output)
git checkout -- books/efnafraedi-2e/05-publication/
```
Expected: 0 `genuine-math-drop`; 0 image drops. Tree clean after checkout (`git status --short`).

- [ ] **Step 2: Golden regen (ch12 m68789 is in the golden set and may gain a recovered equation)**

Run: `npx vitest run tools/__tests__/cnxml-render-golden.test.js`
If it fails (m68789 or others), inspect the diff is ONLY recovered equations/media (additive/intended), then:
Run: `UPDATE_GOLDEN=1 npx vitest run tools/__tests__/cnxml-render-golden.test.js`
Run: `git --no-pager diff tools/__tests__/fixtures/render-golden/ | head -50` — confirm the diff is only recovered content.

- [ ] **Step 3: Regenerate the fidelity baseline (post-fix clean state)**

Run:
```bash
node tools/cnxml-render.js --book efnafraedi-2e >/dev/null 2>&1
node tools/cnxml-render-fidelity-check.js --book efnafraedi-2e --update-baseline
git checkout -- books/efnafraedi-2e/05-publication/
```
(Keeps the regenerated `render-fidelity-baseline.json`; reverts the 05-publication render.)

- [ ] **Step 4: Full suite + validate**

Run: `npm test` → all green. Run: `npm run validate` → 24/24.

- [ ] **Step 5: Update the register + commit**

In `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`: mark A3 done; record that the "~30 ch15-21 / ch21=15/ch17=9" description was stale (real: 22 math + 2 image, 2 render-path root causes + 1 image, ch13-dominated); note the fidelity check now identity-diffs and hard-gates; note reader delivery rides the separate re-render. Log any out-of-scope finds.

```bash
git add docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md books/efnafraedi-2e/render-fidelity-baseline.json tools/__tests__/fixtures/render-golden/
git commit -m "docs(a3): mark done; identity-diff gate + stale-description correction; regen baseline/golden

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

- **Spec coverage:** §Verification-oracle / detector hardening → Task 1; §Diagnosis context A → Task 2; context B → Task 3; context C → Task 4; §Acceptance (22→0, golden, full suite, no 05-pub churn) → Task 5. All covered.
- **Placeholder scan:** Task 4's test body is intentionally parameterized on its Step-1 localization (a debugging task whose fixture derives from a real ancestry probe) — flagged, not a vague requirement. All other steps carry real code/commands/expected output.
- **Type consistency:** `identityDiffChapter({ cnxml, html }) → { lostSkeletons, lostCount }` used identically in Task 1 Steps 1/3 and as the oracle in Tasks 2-5. `renderEquation(eq, context)` / `renderMedia(media, context)` match existing signatures.
- **Risk note:** `renderList` is used by every list book-wide → Task 2's "no regression" test + the golden suite guard against collateral output change; the fix must not alter text-only/para-only item output. The oracle reads committed 05-publication, so every fix task renders→measures→reverts to keep the tree clean and produce no PR churn.
