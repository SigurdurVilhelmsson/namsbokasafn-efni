# Phase-1 Before-Sync Subset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the Phase-1 items that should precede the pending Phase-0 re-render+sync — the three live reader-visible dead-end seams (R6-3/R6-4/R6-6), the missing biology index aggregate, and the two small fixes that protect the imminent gate renders (R5-4 biology duplicate ids, R4-12 appendix fail-loud).

**Architecture:** efni section = two point-fixes (TDD) + one content-op (generate the biology index with the E1-fixed tool) + decision records. vefur section = three graceful-gating fixes (execute in a **vefur session**; read `../namsbokasafn-vefur/CLAUDE.md` + its memory index first). Scope decisions locked here: **R6-3 lands vefur-side** (slug fallback — zero content changes; the emit-side `data-exercise-section` attribute is deferred to physics's next re-render cycle); **R6-6's efni half is D5-gated** (orverufraedi + lifraen have **0** `<glossary>` elements in source — verified 2026-07-10 — so no real glossary.json can exist before the D5 key-terms work; vefur gating is the only before-sync fix).

**Tech Stack:** Node 22.x, Vitest (efni); SvelteKit/Svelte 5 + Vitest/Playwright (vefur).

## Global Constraints

- **Node 22.x / npm 10.x**; `npm test` from the **efni repo root** is the authoritative gate.
- **`01-source/` and `02-mt-output/` are READ ONLY.**
- **No re-render / sync / deploy in this plan** — the lead runs ONE sync after this plan + the Phase-0 checklist; the new aggregates ride that sync.
- Tools that resolve `books/` relative to cwd (`generate-index.js` `BOOKS_DIR='books'`) must run **from the efni repo root**.
- Remaining Phase-1 items **deliberately NOT in this plan** (gate the biology *inject wave*, not this sync): R5-5 (assignment cap 30), R4-7 (extract inline-table id-first), R4-10 (inject completeness blind spot), R4-11 (`$1` splice), R6-3 emit-side `data-exercise-section`.

---

# EFNI SECTION (execute in this repo)

## Task 1: R5-4 — type-suffixed compiled-exercises wrapper id (biology duplicate-id fix)

**Files:**
- Modify: `tools/cnxml-render.js` — TWO identical emit sites inside `renderCompiledExercises`'s per-type loop (currently lines **2904** and **3032**; verify by reading — both emit `id="exercises-${exercises.moduleId}"`).
- Test: `tools/__tests__/cnxml-render.compiledExercisesIds.test.js` (create)

**Interfaces:**
- Consumes: exported `renderCompiledExercises(chapter, exercisesByType, chapterExerciseNumbers, context)` + `_loadBookConfigForTest(bookSlug)` (both already exported).
- Produces: wrapper id `exercises-<moduleId>-<exerciseClass>` **only when `hasMultipleTypes`**; single-type books (chemistry `exercises`, physics per-type files) keep the legacy `exercises-<moduleId>` byte-identically.

**Why conditional:** biology declares three exercise types all with slug `exercises` (multiple-choice / critical-thinking / visual-exercise → one compiled file → three sibling `<section id="exercises-m66440">` = invalid HTML). Chemistry has exactly one exercise type, and its compiled pages are already published with the bare id — an unconditional suffix would churn every chemistry compiled page in the imminent re-render for no benefit. The audit confirmed the wrapper id has **no consumer** (cross-refs + vefur answer-linking key off inner `fs-id…`), so the biology-only shape change is safe.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { renderCompiledExercises, _loadBookConfigForTest } from '../cnxml-render.js';

const mod = (cls) => ({
  moduleId: 'm66440',
  sectionNumber: '11.1',
  sectionTitle: 'Prófkafli',
  exercisesContent:
    `<section class="${cls}" id="sec-${cls}"><title>T</title>` +
    `<exercise id="ex-${cls}"><problem id="pr-${cls}"><para id="pa-${cls}">x</para></problem></exercise></section>`,
});

describe('renderCompiledExercises wrapper ids (R5-4)', () => {
  it('multi-type module gets type-suffixed unique wrapper ids', () => {
    _loadBookConfigForTest('liffraedi-2e');
    const html = renderCompiledExercises(
      11,
      { 'multiple-choice': [mod('multiple-choice')], 'critical-thinking': [mod('critical-thinking')] },
      new Map(),
      {}
    );
    expect(html).toContain('id="exercises-m66440-multiple-choice"');
    expect(html).toContain('id="exercises-m66440-critical-thinking"');
    expect((html.match(/id="exercises-m66440"/g) || []).length).toBe(0); // no bare duplicate
  });
  it('single-type book keeps the legacy bare wrapper id (chemistry stability)', () => {
    _loadBookConfigForTest('efnafraedi-2e');
    const html = renderCompiledExercises(11, { exercises: [mod('exercises')] }, new Map(), {});
    expect((html.match(/id="exercises-m66440"/g) || []).length).toBe(1);
    expect(html).not.toContain('id="exercises-m66440-exercises"');
  });
});
```
(If `renderCompiledExercises` throws on the minimal fixture for a reason unrelated to the id — e.g. a context field its inner `renderCnxmlToHtml` needs — add only the minimal field(s) and report the adjustment.)

- [ ] **Step 2: Run to verify RED** — `npx vitest run tools/__tests__/cnxml-render.compiledExercisesIds.test.js`. Expected: first test FAILS (two bare `id="exercises-m66440"`).

- [ ] **Step 3: Implement** — at BOTH emit sites, change

```js
`<section class="exercises-section" id="exercises-${exercises.moduleId}" data-section="${exercises.sectionNumber}">`
```
to
```js
`<section class="exercises-section" id="exercises-${exercises.moduleId}${hasMultipleTypes ? `-${exerciseClass}` : ''}" data-section="${exercises.sectionNumber}">`
```
(`hasMultipleTypes` and `exerciseClass` are already in scope at both sites — verify by reading the enclosing loop.)

- [ ] **Step 4: GREEN + suite** — new test passes; `npx vitest run tools/` → 0 failures (golden suite must stay 10/10 — no compiled-exercises golden exists and chemistry ids are unchanged); eslint clean on touched files.

- [ ] **Step 5: Commit**
```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render.compiledExercisesIds.test.js
git commit -m "fix(render): type-suffix compiled-exercises wrapper id on multi-type books (R5-4)"
```

## Task 2: R4-12 — buildAppendixIdMap swallows only ENOENT, rethrows corruption

**Files:**
- Modify: `tools/cnxml-render.js` — `buildAppendixIdMap`'s try/catch (currently ~line **302**; the bare `catch {` returns empty maps).
- Test: `tools/__tests__/cnxml-render.appendixIdMapFailLoud.test.js` (create)

**Interfaces:**
- Consumes: `buildModuleSections(book, 'appendices')` — throws fs `ENOENT` (from `readdirSync(structDir)`) when the book has no appendices structure dir; throws `SyntaxError` from `JSON.parse` on a corrupt structure file.
- Produces: unchanged `{idMap, moduleLetters}` for the no-appendices case; **throws** (fail loud) on any other error, so a corrupt `*-structure.json` can no longer silently kill all 67 chapter→appendix links (#255 work) while exiting 0.

- [ ] **Step 1: Write the failing test** — mock the dependency so no fs fixtures are needed:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/module-sections.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, buildModuleSections: vi.fn(actual.buildModuleSections) };
});
import { buildModuleSections } from '../lib/module-sections.js';
import { buildAppendixIdMap } from '../cnxml-render.js';

describe('buildAppendixIdMap error handling (R4-12)', () => {
  beforeEach(() => vi.mocked(buildModuleSections).mockReset());
  it('returns empty maps when the book has no appendices (ENOENT)', () => {
    vi.mocked(buildModuleSections).mockImplementation(() => {
      throw Object.assign(new Error('no such dir'), { code: 'ENOENT' });
    });
    const { idMap, moduleLetters } = buildAppendixIdMap('no-appendix-book', 'mt-preview');
    expect(idMap.size).toBe(0);
    expect(moduleLetters.size).toBe(0);
  });
  it('rethrows a corrupt-structure error (fail loud)', () => {
    vi.mocked(buildModuleSections).mockImplementation(() => {
      throw new SyntaxError('Unexpected token in JSON');
    });
    expect(() => buildAppendixIdMap('corrupt-book', 'mt-preview')).toThrow(/Unexpected token/);
  });
});
```
(Path in `vi.mock` is relative to the TEST file: the test lives in `tools/__tests__/`, so `../lib/module-sections.js` resolves to `tools/lib/module-sections.js` — the same specifier `cnxml-render.js` imports. If the ESM mock fights the module graph, fallback: write a temp corrupt `books/__e2e-fixture__/02-structure/appendices/…-structure.json` in the test with cleanup — report which path was taken.)

- [ ] **Step 2: Run to verify RED** — the second test fails (bare catch swallows the SyntaxError, returns empty maps).

- [ ] **Step 3: Implement** — change the bare catch:

```js
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { idMap: map, moduleLetters }; // book has no appendices
    }
    throw err; // corrupt structure JSON / anything else: fail loud (R4-12)
  }
```

- [ ] **Step 4: GREEN + suite** — both tests pass; `npx vitest run tools/` → 0 failures (the e2e fixture book + books without appendices exercise the ENOENT path); eslint clean.

- [ ] **Step 5: Commit**
```bash
git add tools/cnxml-render.js tools/__tests__/cnxml-render.appendixIdMapFailLoud.test.js
git commit -m "fix(render): buildAppendixIdMap swallows only ENOENT, rethrows corruption (R4-12)"
```

## Task 3: R6-4 (efni half) — generate + commit the biology index.json (content op)

Run by the controller inline (documented tool, not manual file ops). **From the efni repo root** (BOOKS_DIR is cwd-relative).

- [ ] **Step 1:** `node tools/generate-index.js --book liffraedi-2e --track mt-preview` → writes `books/liffraedi-2e/05-publication/mt-preview/index.json` (new file — no backup needed).
- [ ] **Step 2: Sanity gates (all must hold before committing):** entries > 0; **zero** entries with `section`/`sectionSlug` null (the pre-E1 failure shape); ≥3 spot-checked entries' slugs correspond to real files under `books/liffraedi-2e/05-publication/mt-preview/chapters/**`; alphabetical grouping sane (Icelandic letters present).
- [ ] **Step 3 (optional):** same for `edlisfraedi-2e` (physics has `<glossary>` + a data file). Apply the same gates; on ANY anomaly skip + log (physics is not the named gap).
- [ ] **Step 4: Commit** the generated file(s): `git add books/*/05-publication/*/index.json && git commit -m "content(index): generate index.json for liffraedi-2e (R6-4 efni half)"`.

## Task 4: decision records + register/checklist updates (docs)

- [ ] Append to the out-of-scope register (`docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`): R6-3 fix-side DECISION (vefur slug-fallback now; emit-side `data-exercise-section` deferred to physics's next re-render — overrides the spec's "prefer emit-side alias" because no physics re-render is scheduled and the vefur fallback fixes both consumers with zero content changes); R6-6 efni half → D5-gated (0 `<glossary>` in orverufraedi/lifraen, verified); remaining Phase-1 subset (R5-5, R4-7/10/11, R6-3 emit-side) queued for the biology-inject-wave arc.
- [ ] Update the Phase-0 checklist RV-2 note: point to this plan as the "Phase-1 gating fixes" it anticipated.
- [ ] Commit: `docs(phase1): before-sync subset decisions + register updates`.

---

# VEFUR SECTION (execute in a vefur session — read `../namsbokasafn-vefur/CLAUDE.md` + its memory index FIRST)

> RUN-6 line numbers may have drifted — read each current file before editing. Vefur conventions: Svelte 5 runes, Icelandic UI, Vitest + Playwright, `npm run check && npm run test && npm run build` gate.

## Task V1: R6-4 (vefur half) — gate the Atriðisorðaskrá link + graceful route

**Files (per RUN 6; verify):** `src/lib/components/Sidebar.svelte:~427-431` (unconditional link), `src/routes/[bookSlug]/atridisordaskra/+page.svelte:~40-44` (hard red error block), `scripts/generate-toc.js:~644-651` (already sets `toc.index` when index.json exists — nothing consumes it yet).

- [ ] Failing test/check: sidebar renders the Atriðisorðaskrá link for a book whose toc lacks `index`; route shows the error block on 404.
- [ ] Fix: gate the sidebar link on `toc.index`; make the route render a friendly "ekki tiltæk ennþá" empty state on a 404 fetch (keep the error block for real failures if distinguishable, else always graceful).
- [ ] After the efni sync lands biology's index.json, `generate-toc` will set `toc.index` for biology → link appears. Chemistry unchanged.
- [ ] Gate: check/test/build green. Commit: `fix(sidebar): gate Atriðisorðaskrá on toc.index + graceful index route (R6-4)`.

## Task V2: R6-6 (vefur half) — gate Orðasafn + tooltips gracefully; add `toc.glossary`

**Files (per RUN 6; verify):** `scripts/generate-toc.js` (add `toc.glossary` exactly like `toc.index`), `Sidebar.svelte:~443` (unconditional Orðasafn link), `src/routes/[bookSlug]/ordabok/+page.svelte:~21-23` (throws into error block), `src/lib/types/book.ts` `features.glossary` (dead flag — nothing reads it).

- [ ] Failing test/check: Orðasafn link renders for orverufraedi/lifraen (no glossary.json) and the route hard-errors.
- [ ] Fix: `generate-toc.js` sets `toc.glossary` on file existence; gate the sidebar link on it; graceful empty state in the ordabok route. `features.glossary`: either wire it OUT of the path entirely (gate purely on `toc.glossary`) and delete the dead flag, or leave-and-log — decide in-session, record which.
- [ ] Note: orverufraedi/lifraen will legitimately have NO glossary until efni's D5 lands (0 `<glossary>` in source) — the gate is the durable state, not a stopgap.
- [ ] Gate green. Commit: `fix(sidebar): gate Orðasafn on toc.glossary + graceful route (R6-6)`.

## Task V3: R6-3 (vefur side, chosen fix) — resolve `{n}-exercises` to the first exercises-type section

**Files (per RUN 6; verify):** `src/lib/utils/contentLoader.ts:~290` (`findSectionBySlug`) or the `[sectionSlug]/+page.ts:~56` route; consumers `src/routes/[bookSlug]/svarlykill/[chapter]/+page.svelte:~52` + `src/lib/actions/answerLinks.ts:~302-303` both produce `{chapterNumber}-exercises`.

- [ ] Failing check (Playwright or unit): `/edlisfraedi-2e/kafli/04/4-exercises` currently 404s ("Kafli fannst ekki") while `04/4-problems-exercises` exists.
- [ ] Fix at the resolution layer (one place, both consumers): when a slug matching `^(\d+)-exercises$` finds no section, resolve to the chapter's FIRST section whose slug matches the per-type exercises pattern (from toc.json — e.g. first section of chapter *n* whose slug starts `${n}-` and is an exercises-type compiled page). Prefer `findSectionBySlug`/contentLoader so svarlykill's header button AND every answer-entry link are both healed.
- [ ] Verify on physics: svarlykill ch04 back-button + a numbered answer link both land on `4-conceptual-questions` (or the book's first type) — no 404. Chemistry/biology combined pages unaffected (their `{n}-exercises` exists for real).
- [ ] Gate green. Commit: `fix(reader): resolve {n}-exercises to first exercises-type section on split-slug books (R6-3 vefur side)`.

## VEFUR section gate

- [ ] `npm run check && npm run test && npm run build` green; browser-verify: physics svarlykill round-trip; orverufraedi + liffraedi sidebar (links gated correctly pre-sync).

---

# AFTER BOTH SECTIONS (lead)

One sync delivers everything: Phase-0 re-renders (existing checklist incl. RV-1/RV-2 notes) + biology index.json + the vefur gating. No new lead-gate items beyond the existing Phase-0 checklist.

## Self-review notes
- Spec coverage: R6-3 → T-V3 + decision record (emit-side deferred, recorded); R6-4 → Task 3 (efni) + V1 (vefur); R6-6 → V2 + D5-fold decision; R5-4 → Task 1; R4-12 → Task 2. Deliberately-excluded Phase-1 remainder listed in Global Constraints. ✅
- Both TDD tasks carry exact code + exact test files; the content op has hard sanity gates; vefur tasks carry file:line + acceptance and follow the Phase-0 handoff pattern. ✅
