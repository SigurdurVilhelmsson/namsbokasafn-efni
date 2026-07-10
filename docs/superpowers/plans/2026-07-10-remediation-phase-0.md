# Remediation Phase 0 (biology-blockers + legal) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land every fix that makes biology *wrong* or the site *legally misleading* the moment biology ships — the biology-onboarding gate — as code + tests, leaving re-render/deploy as a flagged lead gate.

**Architecture:** Point-fixes implemented in workstream idiom (fail-loud, config-as-data) so they seed the Phase-2 refactors. No pipeline fork — book differences live in data/config. efni section executes in THIS repo; vefur section executes in a **vefur session** (read `../namsbokasafn-vefur/CLAUDE.md` + its memory index first). One cross-repo atomic pair (R5-1) ships both sides together.

**Tech Stack:** Node 22.x LTS, Vitest (unit), Playwright (E2E), `@xmldom/xmldom`, better-sqlite3. Content pipeline = CNXML → extract → MT → inject → render → HTML.

## Global Constraints

- **Node 22.x / npm 10.x**; run `nvm use` before any `npm install`.
- **`npm test` is run from the repo root** — it is the authoritative gate (no branch protection).
- **No-fork:** never branch on `book.slug` in code for correctness behaviour; drive differences from per-book config/catalogue/characterization data.
- **Robustness > expedience:** one real code path; fail loud; land refactor-then-enforcement (warn-only before hard gate); no escape hatch that can reach prod.
- **`01-source/` and `02-mt-output/` are READ ONLY.** Never modify OpenStax CNXML.
- **lint-staged commit rule:** commit a data file in the SAME task that writes it; never leave a tracked data file dirty across other commits.
- **Done boundary:** a task is done at code + tests green. Re-render / sync / deploy is a **lead gate** — see the checklist at the end; do NOT run re-renders as part of a task.
- **Cross-repo atomic:** R5-1 (efni emit) + its vefur CSS rule must merge together; R4-6 renderer arms + fidelity gate ship together (prove gate RED first).
- **Every task's implementer reads the cited current source before editing** — audit line numbers are from a diff and may have drifted.

---

# EFNI SECTION (execute in this repo)

## Task E1: R5-2 — book-agnostic module-map resolver in generate-index (config-as-data + fail-loud)

**Files:**
- Modify: `tools/generate-index.js:139-155` (`loadModuleMap`)
- Test: `tools/__tests__/generate-index.moduleMap.test.js` (create)

**Interfaces:**
- Produces: `resolveBookDataFile(book): string` — absolute path to the `server/data/*.json` whose `.slug === book`; throws if none. (Reused by WS2 in Phase 2 for `openstax-fetch.cjs` + `docx-import.js`.)

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { loadModuleMap } from '../generate-index.js'; // export it in Step 3

describe('loadModuleMap book resolution', () => {
  it('resolves biology modules from the biology data file, not chemistry', () => {
    const map = loadModuleMap('liffraedi-2e');
    // a known biology module id (m66xxx) must resolve; chemistry map would return undefined
    expect(map).not.toBeNull();
    expect([...map.keys()].some((id) => id.startsWith('m66'))).toBe(true);
  });
  it('fails loud when no data file matches the book', () => {
    expect(() => loadModuleMap('no-such-book')).toThrow(/no server\/data.*slug/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/generate-index.moduleMap.test.js`
Expected: FAIL (`loadModuleMap` reads chemistry-2e.json regardless of arg / not exported).

- [ ] **Step 3: Implement — resolve data file by slug, fail loud, honor `_book`**

Replace `loadModuleMap` (currently hardcodes `path.join('server','data','chemistry-2e.json')` and ignores its arg) with:

```js
import { fileURLToPath } from 'url';
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function resolveBookDataFile(book) {
  const dir = path.join(REPO_ROOT, 'server', 'data');
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (j && j.slug === book) return path.join(dir, f);
    } catch { /* skip malformed catalogue file */ }
  }
  throw new Error(`generate-index: no server/data/*.json has slug === "${book}"`);
}

export function loadModuleMap(book) {
  const dataPath = resolveBookDataFile(book); // throws (fail loud) if none
  const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const map = new Map();
  for (const ch of data.chapters) {
    for (const mod of ch.modules) map.set(mod.id, { chapter: ch.chapter, section: mod.section });
  }
  return map;
}
```

Resolve resource paths against `import.meta.url`, never `process.cwd()` (server runs cwd=`server/`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/generate-index.moduleMap.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/generate-index.js tools/__tests__/generate-index.moduleMap.test.js
git commit -m "fix(index): resolve module map by book slug, fail loud (R5-2)"
```

## Task E2: R5-3 — fail-loud on unmapped note types

**Files:**
- Modify: `tools/lib/book-rendering-config.js:147` (`generateFallbackLabel`)
- Modify: `books/liffraedi-2e/book-config.json` (add `noteTypeLabels` for `everyday`, `scientific`, `scientific method`)
- Test: `tools/lib/__tests__/book-rendering-config.fallback.test.js` (create)

**Interfaces:**
- Consumes: existing `generateFallbackLabel(className)`.
- Produces: `generateFallbackLabel(className, { book } = {})` still returns the Title-Cased label but emits a `console.warn` naming the unmapped class + book on every fallback.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, vi } from 'vitest';
import { generateFallbackLabel } from '../book-rendering-config.js';

describe('generateFallbackLabel fail-loud', () => {
  it('warns (fail-loud) when it Title-Cases an unmapped class', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const label = generateFallbackLabel('everyday', { book: 'liffraedi-2e' });
    expect(label).toBe('Everyday');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/unmapped note.*everyday.*liffraedi-2e/i));
    warn.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/lib/__tests__/book-rendering-config.fallback.test.js`
Expected: FAIL (no warning emitted).

- [ ] **Step 3: Implement the warn + add biology labels**

In `generateFallbackLabel` add the warn before returning (keep the existing prefix-strip + Title-Case):

```js
function generateFallbackLabel(className, { book } = {}) {
  if (!className) return '';
  const words = className
    .replace(/^(chemistry|biology|microbiology)\s+/i, '')
    .split(/[-_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  const label = words.join(' ');
  console.warn(`book-rendering-config: unmapped note type "${className}"${book ? ` (book ${book})` : ''} → fell back to "${label}"`);
  return label;
}
```

Then thread `{ book }` from the caller `getNoteTypeLabel` in `tools/cnxml-render.js:104` (read it; pass the active book slug). Add the three biology labels to `books/liffraedi-2e/book-config.json` `noteTypeLabels` (Icelandic values — confirm wording with the glossary): `"everyday"`, `"scientific"`, `"scientific method"`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tools/lib/__tests__/book-rendering-config.fallback.test.js && npm run validate`
Expected: PASS; validate 24/24.

- [ ] **Step 5: Commit** (config + code together — lint-staged rule)

```bash
git add tools/lib/book-rendering-config.js tools/cnxml-render.js books/liffraedi-2e/book-config.json tools/lib/__tests__/book-rendering-config.fallback.test.js
git commit -m "fix(render): fail loud on unmapped note types + biology labels (R5-3)"
```

## Task E3: R4-6 — attribute-order-independent link matching (renderer arms + fidelity gate)

**Files:**
- Modify: `tools/cnxml-render-fidelity-check.js:59` (`RAW_CNXML_LEAK_PATTERNS` link entry)
- Modify: `tools/lib/cnxml-elements.js:736,771,814` (link arms; revive order-independent `renderLink()`)
- Test: `tools/__tests__/fidelity-check.linkLeak.test.js` (create) + `tools/lib/__tests__/cnxml-elements.link.test.js` (create)

**Interfaces:**
- Produces: gate regex that flags a `<link>` with `document`/`target-id`/`url` in **any** attribute position; renderer arms that convert `<link window="new" url=…>` to an `<a>` regardless of attribute order.

- [ ] **Step 1: Write the failing tests**

```js
// fidelity-check.linkLeak.test.js
import { describe, it, expect } from 'vitest';
import { findRawCnxmlLeaks } from '../cnxml-render-fidelity-check.js';
it('flags window-first link leaks (order-independent)', () => {
  const html = '<p>see <link window="new" url="http://x">x</link></p>';
  expect(findRawCnxmlLeaks(html).some((l) => l.pattern === 'link')).toBe(true);
});
it('does NOT flag a legitimate head stylesheet link', () => {
  const html = '<link rel="stylesheet" href="/styles/content.css">';
  expect(findRawCnxmlLeaks(html).some((l) => l.pattern === 'link')).toBe(false);
});
```

```js
// cnxml-elements.link.test.js — renderer arm converts window-first link to <a>
import { describe, it, expect } from 'vitest';
import { renderInlineMarkup } from '../cnxml-elements.js'; // confirm the exported inline renderer name when reading the file
it('renders window="new" url link as <a>, not raw <link>', () => {
  const out = renderInlineMarkup('<link window="new" url="http://x">x</link>');
  expect(out).toContain('<a ');
  expect(out).not.toContain('<link');
});
```

- [ ] **Step 2: Run to verify both fail**

Run: `npx vitest run tools/__tests__/fidelity-check.linkLeak.test.js tools/lib/__tests__/cnxml-elements.link.test.js`
Expected: FAIL — gate returns no link leak on window-first; renderer leaves raw `<link>`.

- [ ] **Step 3: Implement — order-independent regex + renderer arms**

Gate (`cnxml-render-fidelity-check.js:59`): change the link entry to
```js
['link', /<link\b[^>]*\s(?:document|target-id|url)=/g],
```
(`[^>]*` cannot cross `>`, so a head `<link rel=... href=...>` with no document/target-id/url attr stays clean.)

Renderer (`cnxml-elements.js`): read the three arms at :736/:771/:814 (each currently anchors `url=`/`target-id=`/`document=` to the first attribute). Replace with a single call to the dead order-independent `renderLink()` (revive it), matching attributes anywhere. Confirm the actual inline-renderer entry point name while reading the file and wire all three cases through it.

- [ ] **Step 4: Run tests + prove the gate goes RED on the committed leak**

Run: `npx vitest run tools/__tests__/fidelity-check.linkLeak.test.js tools/lib/__tests__/cnxml-elements.link.test.js`
Expected: PASS.
Then prove the real leak is now caught (the audit says 5 committed liffraedi-2e ch03 pages contain the raw tag):
Run: `node -e "const{findRawCnxmlLeaks}=require('./tools/cnxml-render-fidelity-check.js'); const fs=require('fs'); for(const f of require('child_process').execSync('ls books/liffraedi-2e/05-publication/*/ch03/*.html 2>/dev/null || ls books/liffraedi-2e/05-publication/**/03/*.html',{shell:'/bin/bash'}).toString().split('\n').filter(Boolean)){const L=findRawCnxmlLeaks(fs.readFileSync(f,'utf8')); if(L.some(x=>x.pattern==='link'))console.log('LEAK',f);}"`
Expected: prints at least one `LEAK …ch03…` line (gate now RED on the committed page). Record the file(s) in the re-render checklist.

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-render-fidelity-check.js tools/lib/cnxml-elements.js tools/__tests__/fidelity-check.linkLeak.test.js tools/lib/__tests__/cnxml-elements.link.test.js
git commit -m "fix(render): order-independent <link> match in renderer + fidelity gate (R4-6)"
```

## Task E4: R4-8 — reorder intro outline filter (no whole-chapter rollback on missing IS title)

**Files:**
- Modify: `tools/cnxml-render.js:563`
- Test: `tools/__tests__/cnxml-render.introFilter.test.js` (create)

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
// Confirm the exported helper that builds chapterOutline when reading the file;
// if buildModuleSections/chapterOutline is not directly exported, add a thin
// exported pure helper filterOutlineEntries(moduleSections) and test that.
import { filterOutlineEntries } from '../cnxml-render.js';
it('skips _-prefixed metadata keys with null info without throwing', () => {
  const sections = { _chapterTitle: null, '1': { section: '1', slug: 'a' }, '0': { section: '0', slug: 'intro' } };
  expect(() => filterOutlineEntries(sections)).not.toThrow();
  expect(filterOutlineEntries(sections).map(([k]) => k)).toEqual(['1']);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-render.introFilter.test.js`
Expected: FAIL — `info.section` throws on `['_chapterTitle', null]` (info is null, evaluated before the key guard).

- [ ] **Step 3: Implement — key guard first (short-circuit before touching info)**

At line 563 change
```js
.filter(([key, info]) => info.section !== '0' && !key.startsWith('_'))
```
to
```js
.filter(([key, info]) => !key.startsWith('_') && info.section !== '0')
```
Extract the filter predicate into an exported `filterOutlineEntries(moduleSections)` if needed to make it unit-testable.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tools/__tests__/cnxml-render.introFilter.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render.introFilter.test.js
git commit -m "fix(render): guard _-prefixed keys before info.section in intro filter (R4-8)"
```

## Task E5: R5-1 (efni emit) — renderList emits number-style  ⚠️ CROSS-REPO ATOMIC with Task V4

**Files:**
- Modify: `tools/cnxml-render.js:1679` (`renderList`)
- Test: `tools/__tests__/cnxml-render.numberStyle.test.js` (create)

**Interfaces:**
- Consumes: `number-style` captured at `cnxml-extract.js:1598`, preserved at `cnxml-inject.js:3416` (verify it reaches `renderList`'s node when reading the file).
- Produces: `<ol>` carrying `style="list-style-type: lower-alpha"` (or `type="a"`) for `number-style="lower-alpha"`/`upper-alpha`.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { renderList } from '../cnxml-render.js'; // confirm export when reading
it('emits lower-alpha list-style-type for number-style="lower-alpha"', () => {
  const node = /* build/parse a <list list-type="enumerated" number-style="lower-alpha"><item>…*/ makeList('lower-alpha');
  const html = renderList(node, {});
  expect(html).toMatch(/list-style-type:\s*lower-alpha|type="a"/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-render.numberStyle.test.js`
Expected: FAIL — bare `<ol>` emitted (renderList reads only `list-type`/`bullet-style`).

- [ ] **Step 3: Implement — read number-style, emit list-style-type**

In `renderList` read `number-style` off the list node and, for enumerated lists, emit `style="list-style-type: <lower-alpha|upper-alpha|decimal>"` (map `upper-alpha`→`upper-alpha`, `lower-alpha`→`lower-alpha`; default decimal → no change). Read the current emit to match its attribute-building style.

- [ ] **Step 4: Run tests + a real biology fixture check**

Run: `npx vitest run tools/__tests__/cnxml-render.numberStyle.test.js`
Expected: PASS. Cross-check against `books/liffraedi-2e/01-source/ch11/m66484.cnxml` (a 4-option `lower-alpha` list) once biology is rendered.

- [ ] **Step 5: Commit** — but ⚠️ **do NOT merge until Task V4 (vefur CSS) is ready**; the alpha list needs both the emitted style and the vefur `content.css` rule. Merge E5 + V4 together.

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render.numberStyle.test.js
git commit -m "fix(render): renderList emits number-style list-style-type (R5-1 efni)"
```

## Task E6: R4-1 — reading-order scramble (media-in-list indexOf(-1) → pos 0)

**Files:**
- Modify: `tools/cnxml-render.js:886` (`renderChildrenInDocumentOrder`)
- Test: `tools/__tests__/cnxml-render.documentOrder.test.js` (create)

- [ ] **Step 1: Read the current `renderChildrenInDocumentOrder`** (886) to confirm how `content.indexOf(fullMatch)` computes positions and where `<media>` is stripped from `simpleContent`.
- [ ] **Step 2: Write the failing test** — build a section whose enumerated list contains a `<media>`; assert the list renders *after* the preceding paragraph (not hoisted to position 0). Use the real m68739 shape (`<ol id="fs-idm8107808">` with media) as the fixture.

```js
it('keeps a media-bearing list in document order (not hoisted to top)', () => {
  const html = renderSection(fixtureWithMediaListAfterPara);
  expect(html.indexOf('id="fs-idm8107808"')).toBeGreaterThan(html.indexOf('FIRST_PARA_MARKER'));
});
```

- [ ] **Step 3: Run to verify it fails** — Run: `npx vitest run tools/__tests__/cnxml-render.documentOrder.test.js`; Expected: FAIL (list sorts to top).
- [ ] **Step 4: Implement** — on `content.indexOf(fullMatch) === -1`, fall back to `content.indexOf('id="' + lst.id + '"')` (apply to every hoisted element class), or compute positions against the original unstripped content. Add an order-aware assertion.
- [ ] **Step 5: Run tests** — Expected: PASS. This fix is inert until re-render (see checklist).
- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render.documentOrder.test.js
git commit -m "fix(render): document-order fallback for media-bearing lists (R4-1)"
```

## Task E7: R4-2 + R4-3 — table numbering skips unnumbered + per-letter appendix labels

**Files:**
- Modify: `tools/cnxml-render.js:3310` (chapter-wide numbering pass; mirror the eq-pass skip at :3335)
- Test: `tools/__tests__/cnxml-render.tableNumbering.test.js` (create)

- [ ] **Step 1: Read the numbering pass at :3310 and the equation-pass skip at :3335** to copy the exact `class~="unnumbered"` skip and the `appendixModuleLetters`/`moduleLetters` source (from `buildAppendixIdMap`, #255).
- [ ] **Step 2: Write failing tests** — (a) an `unnumbered` table does not consume a number (real: m68789 Table 12.1 must be "Tafla 12.1", the four `unnumbered` example tables get no number); (b) appendix tables label per-letter (`Tafla B1`, `G1`), not `Tafla appendices.N`.
- [ ] **Step 3: Run to verify fail** — Run: `npx vitest run tools/__tests__/cnxml-render.tableNumbering.test.js`; Expected: FAIL.
- [ ] **Step 4: Implement** — add the `class~="unnumbered"` skip to the table (and example) map builder; thread `appendixModuleLetters` into the numbering maps, reset per module, label `${letter}${counter}` when `args.chapter === 'appendices'`.
- [ ] **Step 5: Run tests** — Expected: PASS. Inert until re-render.
- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render.tableNumbering.test.js
git commit -m "fix(render): skip unnumbered tables + per-letter appendix table labels (R4-2, R4-3)"
```

## Task E8: R4-4 — emphasis innermost-first + effect-less default italics

**Files:**
- Modify: `tools/lib/cnxml-elements.js:718` (emphasis regex/handler)
- Test: `tools/lib/__tests__/cnxml-elements.emphasis.test.js` (create)

- [ ] **Step 1: Read the emphasis handler at :718** to confirm the current non-nesting regex and how `effect=` is required.
- [ ] **Step 2: Write failing tests** — (a) bold-wrapping-italics closes correctly (no truncated bold / raw tags); (b) `<emphasis class="emphasis-one">` (no `effect=`) renders (map to underline/italics per the 24× appendix m68866 case); (c) default `<emphasis>` with no `effect=` → italics.
- [ ] **Step 3: Run to verify fail** — Expected: FAIL (mispaired/raw tags).
- [ ] **Step 4: Implement** — iterative innermost-first replacement; handle missing `effect=` (default italics; map `class="emphasis-one"`). `renderEmphasis` is currently dead code — revive/replace as needed.
- [ ] **Step 5: Run tests** — Expected: PASS. Inert until re-render.
- [ ] **Step 6: Commit**

```bash
git add tools/lib/cnxml-elements.js tools/lib/__tests__/cnxml-elements.emphasis.test.js
git commit -m "fix(render): innermost-first emphasis + effect-less default (R4-4)"
```

## Task E9: R4-5 — dedup figure-in-para on compiled exercises page

**Files:**
- Modify: `tools/cnxml-render.js:836` (renderExercise `renderSectionContent`; mirror `renderExample` paraHandler at :1357-1364)
- Test: `tools/__tests__/cnxml-render.exerciseFigure.test.js` (create)

- [ ] **Step 1: Read `renderExample`'s paraHandler (:1357-1364) and `renderExercise`'s `renderSectionContent`** to see how the example path registers/hoists para-nested figure ids.
- [ ] **Step 2: Write the failing test** — a figure inside a `<para>` inside `<problem>` renders exactly once (real: `10-exercises.html`, `<figure id="CNX_Chem_10_02_Needlefloa">` must appear once, numbered).

```js
it('renders a para-nested exercise figure exactly once', () => {
  const html = renderCompiledExercises(fixtureWithFigureInProblemPara);
  expect((html.match(/id="CNX_Chem_10_02_Needlefloa"/g) || []).length).toBe(1);
});
```

- [ ] **Step 3: Run to verify fail** — Expected: FAIL (renders twice).
- [ ] **Step 4: Implement** — mirror `renderExample`'s paraHandler into `renderExercise` (register/hoist para-nested figures so the top-level pass dedups).
- [ ] **Step 5: Run tests** — Expected: PASS. Inert until re-render.
- [ ] **Step 6: Commit**

```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render.exerciseFigure.test.js
git commit -m "fix(render): dedup para-nested figure in renderExercise (R4-5)"
```

## EFNI section gate

- [x] Run the full suite from the repo root: `npm test`. Expected: all green (existing goldens unchanged for the pre-re-render fixes; new tests pass).
  - ✅ **PASSED 2026-07-10** on branch tip `9f694c1d`: **139 test files / 2036 tests / 0 failures** (tools + server, complete-deps env). NB: run via a **detached-HEAD checkout of the commit** in the main checkout (`git checkout 9f694c1d`) — a plain `git checkout <branch>` is refused because the branch is held by the worktree, and the worktree itself lacks the `better-sqlite3` native build so it can't run `server/*`. Two earlier "green" runs were on `docs/fable5-run4-audit` by mistake (129 files/2007 — missing the 10 branch-new specs); the file-count invariant (139 vs 129) is what proves the branch tree was exercised.

---

# VEFUR SECTION (execute in a vefur session — read `../namsbokasafn-vefur/CLAUDE.md` + its memory index FIRST)

> Each vefur task's first step is to **read the current file** (RUN 6 line numbers may have drifted) and follow vefur conventions (Svelte 5 runes, amber accent, Icelandic UI). Tests use Vitest/Playwright per vefur's setup.

> ✅ **STATUS 2026-07-10 — VEFUR SECTION COMPLETE (V1–V4 + P0-9).** Delivered in `namsbokasafn-vefur` **PR #187** (branch `fix/phase-0-remediation-vefur`, 5 commits). Each task TDD'd (failing test → fix) + browser/computed-style verified; `npm run check`/`test` (471)/`build` all green.
> - **V1** — footer names both licences; fail-loud gate in `licences.test.ts` scans landing/FAQ/`app.html`/**all print routes** (windowed: each "CC BY 4.0" must have "NC-SA" within 240 chars). Only aggregate blanket claim was the footer.
> - **V2** — `liffraedi-2e` `status: 'in-progress' → 'preview'`; all credit sites key off status. Side-effect (intended): biology moves to the landing "Sýnishorn" (samples) section. **Flip back to `in-progress` + restore the human credit when faithful biology lands.** Þórhallur stays in the contributor roster (correct). Durable per-page-credit refactor (Step 3) deferred (credit sites are book-level; no book-level reviewed signal).
> - **V3** — selectors corrected to hyphenated `note-visual-connection`/`-evolution`/`-career`; box now blue-tinted.
> - **V4** ⚠️ — scoped `article.cnx-module ol` decimal to `ol:not([style*="list-style-type"])` so E5's inline alpha wins. **Still merge together with efni Task E5** per the atomic directive (V4 is forward-safe alone, but coordinate the landings).
> - **P0-9** — added `em.emphasis-one` (bold/red, theme-aware var) for E8's acidic-H marker.
> All five are inert to end-users until efni re-renders the biology/appendix content and it is synced (lead-gate below).

## Task V1: R6-1 — per-book footer licence + fail-loud blanket-claim gate

**Files:**
- Modify: `src/routes/+page.svelte:450` (footer line)
- Test/gate: extend `src/lib/data/licences.test.ts` (or add `scripts/validate-content.js` grep gate)

- [ ] **Step 1:** Write a failing test/gate asserting no aggregate view (landing/FAQ/meta/print) contains a literal blanket `"CC BY 4.0"` string. Run it — it fails on `+page.svelte:450`.
- [ ] **Step 2:** Replace the footer `"Efni byggt á OpenStax · CC BY 4.0"` with per-book-accurate wording mirroring the corrected about-card (line ~396), e.g. `"leyfi er mismunandi eftir bók (CC BY 4.0 eða CC BY-NC-SA 4.0)"` linking a licence-overview.
- [ ] **Step 3:** Sweep print/`vidauki` templates for the same blanket string; fix any.
- [ ] **Step 4:** Run the gate + `npm run build`; Expected: PASS.
- [ ] **Step 5:** Commit: `fix(licence): per-book footer + blanket-claim gate (R6-1)`.

## Task V2: R6-2 — biology MT pages must not credit a named human translator

**Files:**
- Modify: `src/lib/types/book.ts:126` (liffraedi-2e `status`/`translators`)
- Modify (durable): `src/lib/data/bookCredits.ts` (`compactCreditPair`)
- Test: vefur bookCredits test

- [ ] **Step 1:** Write a failing test: for an MT-only book (0 faithful, MT banner shown), `compactCreditPair` must emit the machine credit, not a named human `Þýðandi`.
- [ ] **Step 2:** Immediate fix — set `liffraedi-2e` `status: 'preview'` (or drop `translators`) so `compactCreditPair` emits the machine credit like the other three MT-only books.
- [ ] **Step 3:** Durable fix — derive the credit from the same `reviewed`/track signal that drives the MT `PreviewBanner`, so credit and banner can never disagree; flip status back to `in-progress` only when faithful biology exists.
- [ ] **Step 4:** Run tests + `npm run build`; Expected: PASS.
- [ ] **Step 5:** Commit: `fix(credits): machine credit for MT-only biology (R6-2)`.

## Task V3: R6-5 — fix `.note.visual-connection` CSS selector typo

**Files:**
- Modify: `static/styles/content.css` (`.note.visual-connection`/`.evolution`/`.career` → `.note-visual-connection` etc.)
- Test: a rendered-fixture assertion or Playwright check that a biology `note-visual-connection` box gets the accent style.

- [ ] **Step 1:** Read the emitted class in efni output (`note-visual-connection`, single hyphenated) and the working sibling rule (`.note-interactive`) to copy its exact form.
- [ ] **Step 2:** Write a failing test/assertion that the `.note-visual-connection` box is styled (currently grey).
- [ ] **Step 3:** Correct the selectors (dotted `.note.visual-connection` → hyphenated `.note-visual-connection`; same for `evolution`, `career`).
- [ ] **Step 4:** Run tests + build; Expected: PASS (~214 biology boxes now styled).
- [ ] **Step 5:** Commit: `fix(css): correct note-visual-connection selector (R6-5)`.

## Task V4: R5-1 (vefur CSS) — alpha-list styling  ⚠️ CROSS-REPO ATOMIC with Task E5

**Files:**
- Modify: `static/styles/content.css` (add `list-style-type` rules)

- [ ] **Step 1:** Confirm efni Task E5 emits `style="list-style-type: lower-alpha"`/`upper-alpha` (or `type="a"/"A"`) on enumerated `<ol>`.
- [ ] **Step 2:** Add/adjust `content.css` so `ol[style*="lower-alpha"]`/`type="a"` render alpha (remove/scope the hard `ol{list-style-type:decimal}` so it no longer overrides).
- [ ] **Step 3:** Verify against a rendered biology lower-alpha MC list (options show `a, b, c, d` matching the letter answer key).
- [ ] **Step 4:** Commit: `fix(css): honor alpha list-style-type from pipeline (R5-1 vefur)`.
- [ ] **Step 5:** ⚠️ **Coordinate merge:** land E5 + V4 together (a half-fix still renders decimal).

## VEFUR section gate

- [ ] From the vefur repo: `npm run check && npm run test && npm run build`. Expected: green.

---

# RE-RENDER / SYNC CHECKLIST (LEAD GATE — not executed by this plan)

Code above is inert in published HTML until a re-render + sync. Hand this to the lead:

> 🛠 **Staged as a runnable script (2026-07-10):** `scripts/rerender-remediation-delivery.sh` automates the efni-side of this checklist — **dry-run by default** (`scripts/rerender-remediation-delivery.sh`, renders nothing, shows the plan + pre-checks), execute with `--run`. It bakes in the appendix-structure integrity pre-check (P1-4), checks each render's exit code (aborts instead of the naive loop's silent mid-loop deletion), hard-asserts the E3 fidelity gate flips RED→GREEN, runs the E7/E9/E5 spot-checks, and **prints (does not run) the sync + deploy steps**. Covers efnafraedi both tracks + liffraedi ch03/ch05 (27 render pairs). The manual items below remain the reference.

- [ ] **Combined chemistry re-render** (heals R4-1/2/3/4/5): `for ch in $(seq 0 21) appendices; do node tools/cnxml-render.js --book efnafraedi-2e --chapter "$ch"; done`
- [ ] **liffraedi ch03 re-render** (heals R4-6 leak): confirm the fidelity gate now reports the ch03 page RED **before** re-render, GREEN after.
- [ ] **Biology render** once R5-1 lands (alpha lists) — verify a lower-alpha MC list shows letters. ⚠️ **AMENDED 2026-07-10 (post-merge review, RV-1):** R5-3 note-label **VALUES were deferred** (translations come only from the Miðeind API, never AI), so biology note headers **render English + a console warn BY DESIGN** until the Icelandic labels are sourced into `books/liffraedi-2e/book-config.json` `noteTypeLabels`. Do NOT read English note headers as a render failure — the `unmapped note type` warn is the intended fail-loud signal. Lead call: render biology now with English+warn headers (accepted interim) or wait for the Miðeind labels.
- [ ] **Sync** to vefur (`node scripts/sync-content.js --source ../namsbokasafn-efni` from vefur) + deploy per the standard flow. ⚠️ **Sync-ordering note (RV-2):** Phase 1 ("before-next-sync" seams R6-3/R6-4/R6-6) is not yet built, and biology `index.json` + orverufraedi/lifraen `glossary.json` are still absent with no generation step scheduled (E1 unblocked `generate-index --book liffraedi-2e`; nothing runs it). Syncing now causes **no regression** (all three seams are already live-broken) — but decide explicitly: land the small Phase-1 gating fixes + generate the aggregates first, or sync now and fast-follow Phase 1. **→ RESOLVED 2026-07-10: "land small fixes first" — see `docs/superpowers/plans/2026-07-10-phase-1-before-sync.md`. efni done (R5-4/R4-12 + biology `index.json`); vefur V1/V2/V3 (R6-4/R6-6/R6-3 gating) queued for a vefur session. This ONE sync now delivers Phase-0 re-renders + biology index + vefur gating together.**
- [ ] Post-render spot-check: no literal `[[…]]` markers; table numbers match OpenStax; 7.3 reading order correct; no raw `<link>` on biology ch03.

---

## Self-review notes

- **Spec coverage:** every Phase-0 finding in the design's §3 table maps to a task — vefur R6-1/2/5 → V1/2/3; R5-1 → E5+V4 (atomic); R5-2 → E1; R5-3 → E2; R4-6 → E3; R4-8 → E4; R4-batch A → E6/E7/E8/E9. ✅
- **Grounded tasks (E1–E4) carry exact code** from reading the current source; batch-A tasks (E6–E9) and vefur tasks specify exact file:line + failing test + fix approach with a mandatory read-current-source first step (audit line numbers are diff-relative).
- **Cross-repo atomic (R5-1)** flagged on both E5 and V4.
- **No re-render inside tasks** — done boundary honored; re-render is the lead-gate checklist.
