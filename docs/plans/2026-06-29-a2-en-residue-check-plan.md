# A2 — Untranslated-EN Residue Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the injection pipeline detect segments left as untranslated English, so an untranslated module no longer reports `COMPLETE`.

**Architecture:** A pure detector lib (`tools/lib/residue-check.js`) normalizes EN and IS segment text identically and compares them. An exact-normalized match gates `buildCnxml`'s `report.complete`; a token-overlap ratio above a threshold produces a non-blocking warning. Inject's `main()` writes a per-book, track-qualified `residue-report.<track>.json` manifest. EN source (`enSegments`) is already loaded at inject time — no new file reads.

**Tech Stack:** Node 22 ESM, Vitest. No new dependencies.

**Design spec:** [docs/plans/2026-06-29-a2-en-residue-check-design.md](2026-06-29-a2-en-residue-check-design.md)

## Global Constraints

- Node 22 / ESM (`"type": "module"`): use `export function` / `export const`, import siblings with explicit `.js` extension.
- Test gate is **local**: `npm test` (= `vitest run`). CI credits may be exhausted; the local green run is authoritative.
- Translations are API-only; this task adds **no** translation calls — it only inspects existing segment text.
- 🔒 `books/*/01-source/` is READ-ONLY (this task reads `02-for-mt`, `02-mt-output`/`03-faithful-translation`, `02-structure`; writes only `books/<book>/residue-report.<track>.json` and `03-translated/`).
- Detector thresholds are named constants: `minTokens = 3`, `warnThreshold = 0.7`.
- Commit message trailer on every commit:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

## File structure

- **Create** `tools/lib/residue-check.js` — pure detector + manifest-merge helpers (no I/O). One responsibility: residue detection and its data shape.
- **Create** `tools/__tests__/residue-check.test.js` — unit tests for the pure lib.
- **Modify** `tools/cnxml-inject.js` — import the detector; accumulate residues in `buildCnxml`'s `getSeg`; extend `report`; gate `complete`; surface in `main()`'s console + write the manifest.
- **Modify** `tools/__tests__/cnxml-inject.test.js` — wiring tests through `buildCnxml`.

---

### Task 1: Pure residue detector lib (`tools/lib/residue-check.js`)

**Files:**
- Create: `tools/lib/residue-check.js`
- Test: `tools/__tests__/residue-check.test.js`

**Interfaces:**
- Consumes: nothing (pure, no imports).
- Produces:
  - `normalizeForComparison(text: string) => string`
  - `countAlphaTokens(normalized: string) => number`
  - `tokenOverlapRatio(aNorm: string, bNorm: string) => number` (0–1)
  - `detectResidue(enText: string, isText: string, opts?: {minTokens?, warnThreshold?}) => { alphaTokens: number, exact: boolean, ratio: number, warn: boolean }`
  - `upsertResidueModule(report: object, moduleId: string, entry: { exact?: string[], warnings?: {segmentId: string, ratio: number}[] }) => object`
  - `RESIDUE_DEFAULTS = { minTokens: 3, warnThreshold: 0.7 }`

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/residue-check.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  normalizeForComparison,
  countAlphaTokens,
  tokenOverlapRatio,
  detectResidue,
  upsertResidueModule,
} from '../lib/residue-check.js';

describe('normalizeForComparison', () => {
  it('strips bracket-marker delimiters but keeps inner content', () => {
    expect(normalizeForComparison('These [[i:solids]] settle'))
      .toBe('these solids settle');
  });

  it('keeps the visible text of a link/xref and drops the url/id tail', () => {
    expect(normalizeForComparison('see [[link:click here|http://x.com]] now'))
      .toBe('see click here now');
    expect(normalizeForComparison('in [[xref:Figure 5.2|CNX_Chem_05_02]] above'))
      .toBe('in figure above');
  });

  it('drops MATH/MEDIA placeholders, digits, and symbols', () => {
    expect(normalizeForComparison('value [[MATH:3]] is 42% high!'))
      .toBe('value is high');
  });

  it('strips legacy {{term}} delimiters but keeps the term', () => {
    expect(normalizeForComparison('a {{term}}colloid{{/term}} here'))
      .toBe('a colloid here');
  });

  it('preserves Icelandic letters as alphabetic', () => {
    expect(normalizeForComparison('Þétt lausn í vatni'))
      .toBe('þétt lausn í vatni');
  });
});

describe('countAlphaTokens', () => {
  it('counts space-separated word tokens', () => {
    expect(countAlphaTokens('these solids settle')).toBe(3);
  });
  it('returns 0 for empty input', () => {
    expect(countAlphaTokens('')).toBe(0);
  });
});

describe('tokenOverlapRatio', () => {
  it('is 1 when one token set is contained in the other', () => {
    expect(tokenOverlapRatio('the cat sat', 'the cat sat on mat')).toBe(1);
  });
  it('is 0 when there is no overlap', () => {
    expect(tokenOverlapRatio('alpha beta', 'gamma delta')).toBe(0);
  });
  it('is 0 when either side is empty', () => {
    expect(tokenOverlapRatio('', 'gamma delta')).toBe(0);
  });
});

describe('detectResidue', () => {
  it('flags an exactly-untranslated segment (gates)', () => {
    const en = 'Describe the composition and properties of colloidal dispersions';
    const r = detectResidue(en, en);
    expect(r.exact).toBe(true);
    expect(r.warn).toBe(false);
  });

  it('does not flag a properly translated segment', () => {
    const en = 'Describe the composition and properties of colloidal dispersions';
    const is = 'Lýstu samsetningu og eiginleikum kvoðudreifna';
    const r = detectResidue(en, is);
    expect(r.exact).toBe(false);
    expect(r.warn).toBe(false);
  });

  it('does not flag short shared-vocabulary segments below minTokens', () => {
    // "Colloids" is one alpha token -> below the floor, never flagged
    const r = detectResidue('Colloids', 'Colloids');
    expect(r.exact).toBe(false);
    expect(r.warn).toBe(false);
  });

  it('warns (non-gating) on mostly-English partial residue', () => {
    const en = 'The particles in a colloid are large enough to scatter light';
    const is = 'The particles in a colloid are large enough to dreifa ljósi';
    const r = detectResidue(en, is);
    expect(r.exact).toBe(false);
    expect(r.warn).toBe(true);
    expect(r.ratio).toBeGreaterThanOrEqual(0.7);
  });
});

describe('upsertResidueModule', () => {
  it('adds a module entry and computes the summary', () => {
    const r = upsertResidueModule({ track: 'faithful' }, 'm68784', {
      exact: ['m68784:para:p1'],
      warnings: [{ segmentId: 'm68784:caption:c1', ratio: 0.82 }],
    });
    expect(r.track).toBe('faithful');
    expect(r.modules.m68784.exact).toEqual(['m68784:para:p1']);
    expect(r.summary).toEqual({ modulesWithResidue: 1, exactResidues: 1, ratioWarnings: 1 });
  });

  it('removes a module entry when it becomes clean (preserve-on-reinject)', () => {
    const seeded = upsertResidueModule({ track: 'faithful' }, 'm1', { exact: ['m1:p1'] });
    const cleaned = upsertResidueModule(seeded, 'm1', { exact: [], warnings: [] });
    expect(cleaned.modules.m1).toBeUndefined();
    expect(cleaned.summary.modulesWithResidue).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/residue-check.test.js`
Expected: FAIL — `Failed to resolve import "../lib/residue-check.js"` (module does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `tools/lib/residue-check.js`:

```js
/**
 * Untranslated-EN residue detection (A2).
 *
 * Pure functions, no I/O. Normalizes EN source and IS translation text
 * identically, then compares: an exact-normalized match is a verbatim
 * untranslated residue (gates report.complete); a high token-overlap ratio
 * is a "mostly English" warning (non-gating).
 */

export const RESIDUE_DEFAULTS = { minTokens: 3, warnThreshold: 0.7 };

/**
 * Strip inline marker DELIMITERS while keeping their inner content, so a
 * translated marker payload differs from an untranslated one. Applied
 * identically to EN and IS, so any structural noise cancels out.
 */
function stripMarkers(text) {
  let t = String(text == null ? '' : text);
  // Positional placeholders carry no translatable text -> drop entirely.
  t = t.replace(/\[\[(?:math|media):\d+\]\]/gi, ' ');
  // Bracket markers [[type:content]] (content may have a |url or |id tail) ->
  // keep the visible text before '|'.
  t = t.replace(/\[\[[a-z]+:([^\]]*)\]\]/gi, (_m, inner) => ' ' + inner.split('|')[0] + ' ');
  // xref shorthand [#id] -> drop.
  t = t.replace(/\[#[^\]]*\]/g, ' ');
  // Legacy paired delimiters {{type}} ... {{/type}} -> drop delimiters, keep inner.
  t = t.replace(/\{\{\/?[a-z]+\}\}/gi, ' ');
  return t;
}

/** Normalize for comparison: markers stripped, no digits/symbols, lowercased. */
export function normalizeForComparison(text) {
  let t = stripMarkers(text);
  t = t.replace(/[0-9]/g, ' ');
  // Replace any non-letter, non-space (Unicode-aware) with a space. \p{L}
  // keeps Icelandic letters (þ æ ö ð á í ...).
  t = t.replace(/[^\p{L}\s]/gu, ' ');
  return t.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Count whitespace-separated tokens that contain at least one letter. */
export function countAlphaTokens(normalized) {
  if (!normalized) return 0;
  return normalized.split(' ').filter((tok) => /\p{L}/u.test(tok)).length;
}

/** Overlap coefficient |A∩B| / min(|A|,|B|) over token sets (0 if either empty). */
export function tokenOverlapRatio(aNorm, bNorm) {
  const a = new Set(aNorm ? aNorm.split(' ').filter(Boolean) : []);
  const b = new Set(bNorm ? bNorm.split(' ').filter(Boolean) : []);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const tok of a) if (b.has(tok)) inter++;
  return inter / Math.min(a.size, b.size);
}

/**
 * Detect untranslated-EN residue for one segment.
 * @returns {{alphaTokens:number, exact:boolean, ratio:number, warn:boolean}}
 */
export function detectResidue(enText, isText, opts = {}) {
  const { minTokens, warnThreshold } = { ...RESIDUE_DEFAULTS, ...opts };
  const enNorm = normalizeForComparison(enText);
  const isNorm = normalizeForComparison(isText);
  const alphaTokens = countAlphaTokens(isNorm);
  // No EN counterpart, or too short to judge -> never flag.
  if (!enNorm || alphaTokens < minTokens) {
    return { alphaTokens, exact: false, ratio: 0, warn: false };
  }
  const exact = enNorm === isNorm;
  const ratio = exact ? 1 : tokenOverlapRatio(enNorm, isNorm);
  const warn = !exact && ratio >= warnThreshold;
  return { alphaTokens, exact, ratio, warn };
}

/**
 * Immutably upsert one module's residue entry into a manifest object and
 * recompute its summary. An empty entry removes the module (so a re-inject
 * that fixed the residue clears the record). Preserves `track`.
 */
export function upsertResidueModule(report, moduleId, entry = {}) {
  const exact = entry.exact || [];
  const warnings = entry.warnings || [];
  const modules = { ...((report && report.modules) || {}) };
  if (exact.length === 0 && warnings.length === 0) {
    delete modules[moduleId];
  } else {
    modules[moduleId] = {
      exact: [...exact],
      warnings: warnings.map((w) => ({ segmentId: w.segmentId, ratio: w.ratio })),
    };
  }
  const ids = Object.keys(modules);
  return {
    track: (report && report.track) || null,
    generatedBy: 'cnxml-inject.js',
    summary: {
      modulesWithResidue: ids.length,
      exactResidues: ids.reduce((s, m) => s + modules[m].exact.length, 0),
      ratioWarnings: ids.reduce((s, m) => s + modules[m].warnings.length, 0),
    },
    modules,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/residue-check.test.js`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/residue-check.js tools/__tests__/residue-check.test.js
git commit -m "feat(inject): pure EN-residue detector lib (A2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Wire detection into `buildCnxml` and gate `report.complete`

**Files:**
- Modify: `tools/cnxml-inject.js` — import (near `:44`), `stats` init (`:1467`), `getSeg` (`:1476-1497`), `report` + `complete` (`:1670-1678`).
- Test: `tools/__tests__/cnxml-inject.test.js`

**Interfaces:**
- Consumes: `detectResidue` from Task 1; `options.enSegments` (a `Map<segmentId,string>`, already passed by `main()` at `:3374`).
- Produces: `report.residues: string[]` (exact, sorted segment IDs), `report.residueWarnings: {segmentId, ratio}[]`, and `report.complete` now also requires `residues.length === 0`.

- [ ] **Step 1: Write the failing test**

Append to `tools/__tests__/cnxml-inject.test.js`:

```js
// ─── A2: untranslated-EN residue detection ────────────────────────
describe('buildCnxml EN-residue detection (A2)', () => {
  const makeInputs = (isPara) => {
    const structure = {
      moduleId: 'test',
      title: { segmentId: 'test:title:auto-1', text: 'Test' },
      content: [{ type: 'para', id: 'p1', segmentId: 'test:para:p1' }],
    };
    const enText =
      'Describe the composition and properties of colloidal dispersions in water';
    const segments = new Map([
      ['test:title:auto-1', 'Titill'],
      ['test:para:p1', isPara],
    ]);
    const enSegments = new Map([
      ['test:title:auto-1', 'Title'],
      ['test:para:p1', enText],
    ]);
    const originalCnxml = `<document xmlns="http://cnx.rice.edu/cnxml">
<title>Test</title>
<metadata xmlns:md="http://cnx.rice.edu/mdml"><md:title>Test</md:title></metadata>
<content>
<para id="p1">${enText}</para>
</content>
</document>`;
    return { structure, segments, enSegments, originalCnxml, enText };
  };

  it('flags a verbatim-English paragraph and reports INCOMPLETE', () => {
    const { structure, segments, enSegments, originalCnxml, enText } = makeInputs(/* untranslated */ '');
    segments.set('test:para:p1', enText); // IS == EN (untranslated)
    const result = buildCnxml(structure, segments, {}, originalCnxml, { enSegments });
    expect(result.report.residues).toContain('test:para:p1');
    expect(result.report.complete).toBe(false);
  });

  it('reports COMPLETE for a properly translated paragraph', () => {
    const is =
      'Lýstu samsetningu og eiginleikum kvoðudreifna í vatni nánar tiltekið';
    const { structure, segments, enSegments, originalCnxml } = makeInputs(is);
    const result = buildCnxml(structure, segments, {}, originalCnxml, { enSegments });
    expect(result.report.residues).toEqual([]);
    expect(result.report.complete).toBe(true);
  });

  it('does not run detection when enSegments is absent (EN-fallback inject)', () => {
    const { structure, segments, originalCnxml, enText } = makeInputs('');
    segments.set('test:para:p1', enText);
    const result = buildCnxml(structure, segments, {}, originalCnxml, {});
    expect(result.report.residues).toEqual([]);
    expect(result.report.complete).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js -t "EN-residue"`
Expected: FAIL — `result.report.residues` is `undefined` (not yet produced).

- [ ] **Step 3: Add the import**

In `tools/cnxml-inject.js`, after the existing `update-translation-errors` import (`:44`):

```js
import { detectResidue } from './lib/residue-check.js';
```

- [ ] **Step 4: Initialize residue accumulators in `stats`**

In `buildCnxml`, extend the `stats` object (currently `:1467-1474`):

```js
  const stats = {
    segmentsRequested: 0,
    segmentsFound: 0,
    segmentsMissing: [],
    mathPlaceholders: 0,
    mathResolved: 0,
    mathUnresolved: [],
    residues: [],            // exact untranslated-EN (gates complete)
    residueWarnings: [],     // ratio "mostly English" (non-gating)
    _residueSeen: new Set(), // de-dupe segments referenced more than once
  };
```

- [ ] **Step 5: Detect inside `getSeg`**

In `getSeg` (`:1476-1497`), after `stats.segmentsFound++;` and before the `return reverseInlineMarkup(...)`:

```js
    stats.segmentsFound++;

    // A2: flag segments left as untranslated English. Compare the raw
    // marker-form IS text against the EN source (same marker form). Only
    // when an EN counterpart exists and we haven't already judged this id.
    const enText = options.enSegments && options.enSegments.get(segmentId);
    if (enText && !stats._residueSeen.has(segmentId)) {
      stats._residueSeen.add(segmentId);
      const r = detectResidue(enText, text);
      if (r.exact) {
        stats.residues.push(segmentId);
      } else if (r.warn) {
        stats.residueWarnings.push({ segmentId, ratio: Number(r.ratio.toFixed(2)) });
      }
    }

    return reverseInlineMarkup(
```

- [ ] **Step 6: Surface on `report` and gate `complete`**

Replace the `report` object (`:1671-1678`):

```js
  const report = {
    segmentsInFile: segments.size,
    segmentsRequested: stats.segmentsRequested,
    segmentsFound: stats.segmentsFound,
    segmentsMissing: stats.segmentsMissing,
    unresolvedMathPlaceholders: stats.mathUnresolved,
    residues: stats.residues.slice().sort(),
    residueWarnings: stats.residueWarnings,
    complete:
      stats.segmentsMissing.length === 0 &&
      stats.mathUnresolved.length === 0 &&
      stats.residues.length === 0,
  };
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js -t "EN-residue"`
Expected: PASS (3 tests).

- [ ] **Step 8: Run the full inject suite (no regressions)**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js`
Expected: PASS (all pre-existing tests still green — `complete` only tightened, and only when `enSegments` is supplied; existing `buildCnxml` calls pass no `enSegments`).

- [ ] **Step 9: Commit**

```bash
git add tools/cnxml-inject.js tools/__tests__/cnxml-inject.test.js
git commit -m "feat(inject): gate report.complete on untranslated-EN residue (A2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: CLI surfacing + per-book residue manifest

**Files:**
- Modify: `tools/cnxml-inject.js` — import `upsertResidueModule`; in `main()`, init manifest before the module loop (`~:3290`), per-module console block + manifest upsert after `writeOutput` (`~:3412`), write the manifest after the loop (`~:3422`).

**Interfaces:**
- Consumes: `upsertResidueModule` from Task 1; `result.report.residues` / `result.report.residueWarnings` from Task 2; existing `BOOKS_DIR`, `track`, `moduleId`, `args.allowIncomplete`.
- Produces: file `books/<book>/residue-report.<track>.json` (schema per design doc). No new return values.

- [ ] **Step 1: Add the import**

In `tools/cnxml-inject.js`, extend the Task-2 import line:

```js
import { detectResidue, upsertResidueModule } from './lib/residue-check.js';
```

- [ ] **Step 2: Initialize the manifest before the module loop**

In `main()`, immediately after `track` is resolved (`const track = args.track || trackFromSourceDir(sourceDir);`, `~:3279-3280`), add:

```js
  let residueReport = { track };
  const residueReportPath = path.join(BOOKS_DIR, `residue-report.${track}.json`);
  if (fs.existsSync(residueReportPath)) {
    try {
      residueReport = JSON.parse(fs.readFileSync(residueReportPath, 'utf-8'));
      residueReport.track = track; // keep authoritative
    } catch {
      residueReport = { track }; // tolerate a corrupt prior manifest
    }
  }
```

- [ ] **Step 3: Per-module console surfacing + manifest upsert**

In the module loop, right after `const outputPath = writeOutput(...)` (`~:3412`), add:

```js
      // A2: record/clear this module's residue and surface it.
      residueReport = upsertResidueModule(residueReport, moduleId, {
        exact: result.report.residues,
        warnings: result.report.residueWarnings,
      });
      if (result.report.residues.length > 0) {
        console.error(
          `  WARNING: ${result.report.residues.length} untranslated-EN residue segment(s):`
        );
        for (const id of result.report.residues.slice(0, 10)) {
          console.error(`    - ${id}`);
        }
        if (result.report.residues.length > 10) {
          console.error(`    ... and ${result.report.residues.length - 10} more`);
        }
      }
      if (result.report.residueWarnings.length > 0) {
        console.error(
          `  NOTE: ${result.report.residueWarnings.length} "mostly English" segment(s) (warn-only)`
        );
      }
```

- [ ] **Step 4: Extend the incomplete-skip reason (residue case)**

In the existing skip block (`if (!result.report.complete && !args.allowIncomplete)`, `~:3385`), add a residue line alongside the missing/math lines, before the `console.error('  Use --allow-incomplete...')`:

```js
        if (result.report.residues.length > 0) {
          console.error(`  Untranslated-EN residue: ${result.report.residues.length}`);
        }
```

- [ ] **Step 5: Write the manifest after the loop**

After the module `for` loop closes and before/near the `updateTranslationErrors(...)` call (`~:3424`), add:

```js
    // A2: persist the per-book, track-qualified residue manifest.
    fs.writeFileSync(residueReportPath, JSON.stringify(residueReport, null, 2) + '\n');
    if (residueReport.summary && residueReport.summary.modulesWithResidue > 0) {
      console.log(
        `Residue: ${residueReport.summary.exactResidues} untranslated-EN segment(s) across ` +
          `${residueReport.summary.modulesWithResidue} module(s), ` +
          `${residueReport.summary.ratioWarnings} warning(s) → ${residueReportPath}`
      );
    }
```

- [ ] **Step 6: Verify against a real translated chapter (manifest is created, no false positives)**

Run: `node tools/cnxml-inject.js --book efnafraedi-2e --chapter 11 --source-dir 03-faithful-translation`
Expected: injects without newly reporting INCOMPLETE on already-good modules; a `books/efnafraedi-2e/residue-report.faithful.json` is written. Inspect it:

Run: `node -e "const r=require('./books/efnafraedi-2e/residue-report.faithful.json'); console.log(JSON.stringify(r.summary))"`
Expected: a `summary` object prints; `exactResidues` is `0` on a fully-translated chapter (sanity: no false positives on real human-reviewed content). If `ch11` has no faithful translation, substitute a chapter that does (`ls books/efnafraedi-2e/03-faithful-translation/`).

> Note: this writes to `03-translated/` and the manifest — both permitted, generated artifacts. Do not commit book-content churn from this manual check; `git restore` any `03-translated` / manifest changes that are just from the smoke test, or run on a throwaway and discard.

- [ ] **Step 7: Run the full local gate**

Run: `npm test`
Expected: PASS (full Vitest suite green).

- [ ] **Step 8: Commit**

```bash
git add tools/cnxml-inject.js
git commit -m "feat(inject): residue manifest + CLI surfacing (A2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage:**
- Detector (exact gates / ratio warns, thresholds, marker+number+symbol stripping, Icelandic letters) → Task 1. ✅
- EN↔IS join on already-loaded `enSegments`, gate `report.complete` → Task 2. ✅
- "Untranslated module no longer reports COMPLETE" + residues listed (console) → Tasks 2 & 3. ✅
- Machine-readable, track-qualified, read-merge-preserve manifest → Tasks 1 (`upsertResidueModule`) & 3. ✅
- Reuse `--allow-incomplete`, no new flag → Task 3 Step 4. ✅
- Tests with EN-residue and clean fixtures → Tasks 1 & 2. ✅
- Out-of-scope (server surface, A1 manifest schema, B3 shared lib) → untouched. ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code; commands have expected output. ✅

**Type consistency:** `detectResidue` returns `{alphaTokens, exact, ratio, warn}` (Task 1) — consumed in Task 2 Step 5 via `r.exact`/`r.warn`/`r.ratio`. `report.residues` (string[]) / `report.residueWarnings` ({segmentId,ratio}[]) defined in Task 2 Step 6, consumed in Task 3 Steps 3-5. `upsertResidueModule(report, moduleId, {exact, warnings})` signature identical in Task 1 def and Task 3 call. Manifest field names (`track`, `generatedBy`, `summary.{modulesWithResidue,exactResidues,ratioWarnings}`, `modules`) consistent between Task 1 and Task 3. ✅
