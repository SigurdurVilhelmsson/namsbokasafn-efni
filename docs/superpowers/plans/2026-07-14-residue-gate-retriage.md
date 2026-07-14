# Residue-Gate Re-Triage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the untranslated-EN residue gate from marking a module `incomplete` when its only residue is language-neutral content, un-sticking the 13 non-preface incomplete efnafraedi-2e modules.

**Architecture:** Hybrid tolerance. (A) A pure `isLanguageNeutral(text)` predicate in `tools/lib/residue-check.js`, called by `detectResidue`, demotes formula/unit/pH cells (20 of 24 residues). (B) A per-book `residue-allowlist.json` + `tools/lib/residue-allowlist.js` (mirroring `fidelity-allowlist.js`) tolerates the 4 residues no safe pattern can classify (2 proper-noun titles, 2 homograph-unit segments). The allowlist is applied by callers (inject gate, scan CLI), never inside the pure detector. A non-gating `tolerated[]` manifest field keeps allowlisted residues auditable.

**Tech Stack:** Node.js 22 ESM, Vitest. Pure functions in `tools/lib/`, no new dependencies.

## Global Constraints

- **Node 22.x / npm 10.x.** Run `npm test` from the **repo root** (never `server/`).
- **Code-only PR.** Zero changes under `books/*/03-translated/` or `books/*/05-publication/`. The only `books/` file this PR creates is `books/efnafraedi-2e/residue-allowlist.json` (a config file, not content).
- **Pure detector stays pure.** `tools/lib/residue-check.js` must not do file I/O. The allowlist (I/O) is loaded by CLIs and passed in.
- **Fail-loud allowlist.** Absent file → nothing tolerated. Unlisted / drifted / invalid `class` / missing `reason` → **not** tolerated. Mirror `tools/lib/fidelity-allowlist.js` exactly.
- **Predicate is global (all books), allowlist is per-book.** The `detectResidue` change deliberately affects every book's residue scan.
- **Branch `fix/chem-residue-gate-retriage` already exists** with the committed design spec (`docs/superpowers/specs/2026-07-14-residue-gate-retriage-design.md`). Work on it; do not create a new branch.
- Commit message trailer on every commit: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

## File Structure

- `tools/lib/residue-check.js` — **modify**: add pure `isLanguageNeutral()`, call it in `detectResidue()`, add `tolerated` support to `upsertResidueModule()`.
- `tools/lib/residue-allowlist.js` — **create**: `loadResidueAllowlist()`, `classifyResidue()` (mirror of `fidelity-allowlist.js`).
- `books/efnafraedi-2e/residue-allowlist.json` — **create**: 4 entries.
- `tools/cnxml-inject.js` — **modify**: `stats.tolerated` + `isAllowlisted` option in `buildCnxml()`; `main()` loads the allowlist and threads it in + into `upsertResidueModule`.
- `tools/scan-residue.js` — **modify**: `main()` loads the allowlist, splits `exact`→`tolerated`, reports it.
- `tools/__tests__/residue-check.test.js` — **modify**: predicate + `tolerated` upsert tests.
- `tools/__tests__/residue-allowlist.test.js` — **create**: mirror `fidelity-allowlist.test.js`.

---

## Task 1: `isLanguageNeutral` predicate + `detectResidue` integration

**Files:**
- Modify: `tools/lib/residue-check.js`
- Test: `tools/__tests__/residue-check.test.js`

**Interfaces:**
- Consumes: existing module-local `stripMarkers(text)` (case-preserving; drops `[[math:n]]`/`[[media:n]]`, unwraps `[[type:content]]` and `{{type}}`).
- Produces: `export function isLanguageNeutral(text): boolean`. `detectResidue(enText, isText, opts)` now returns `{ contentWords, exact:false, languageNeutral:true, ratio:0, warn:false }` when the segment would be `exact` but is language-neutral.

- [ ] **Step 1: Write the failing tests.** Append to `tools/__tests__/residue-check.test.js` (it already imports from `../lib/residue-check.js`; add `isLanguageNeutral` to that import).

```javascript
describe('isLanguageNeutral', () => {
  // positive — pure formula / unit / quantity-symbol cells
  it.each([
    '(a) CrP; (b) HgS; (c) Mn[[sub:3]](PO[[sub:4]])[[sub:2]]',
    '(a) RbBr; (b) MgSe; (h) (NH[[sub:4]])[[sub:2]]SO[[sub:4]]',
    '(a) 123.896 amu; (b) 18.015 amu; (c) 164.086 amu',
    'rem = RBE [[MATH:9]] rad',
    '(a) pH = 3.587; pOH = 10.413; (b) pOH = 0.68; pH = 13.32',
    '8.205784 [[MATH:8]] 10[[sup:−2]] L atm mol[[sup:−1]] K[[sup:−1]] = 8.314510 J mol[[sup:−1]] K[[sup:−1]]',
    '(d) [[MATH:71]] SO[[sub:3]] = 1.00 atm, SO[[sub:2]] = 1.00 atm',
  ])('treats formula/unit/pH cell as language-neutral: %s', (t) => {
    expect(isLanguageNeutral(t)).toBe(true);
  });

  // negative — real English prose (the safety property)
  it.each([
    'Write the two half-reactions and balance them',
    'Dorothy Crowfoot Hodgkin',
    'Measure the pH of each solution carefully',   // recognized token amid English → still NOT neutral
    'Report the value in atm units',
  ])('flags real English even when it contains a recognized token: %s', (t) => {
    expect(isLanguageNeutral(t)).toBe(false);
  });

  // negative — homographs are excluded from the predicate (they go on the allowlist)
  it('excludes the English homograph "log"', () => {
    expect(isLanguageNeutral('pH = 14 + log(0.0200) = 12.30')).toBe(false);
  });
  it('excludes the English homograph "bar"', () => {
    expect(isLanguageNeutral('0.974 atm; 740 mm Hg; 98.7 kPa; 0.987 bar')).toBe(false);
  });

  it('is false for empty / marker-only input (no recognized token)', () => {
    expect(isLanguageNeutral('[[MATH:3]]')).toBe(false);
    expect(isLanguageNeutral('')).toBe(false);
  });
});

describe('detectResidue language-neutral demotion', () => {
  it('does NOT flag a language-neutral verbatim-EN segment as exact', () => {
    const t = '(a) CrP; (b) HgS';
    const r = detectResidue(t, t);
    expect(r.exact).toBe(false);
    expect(r.languageNeutral).toBe(true);
  });
  it('still flags a real English verbatim-EN segment as exact', () => {
    const t = 'Write the two half-reactions and balance them';
    const r = detectResidue(t, t);
    expect(r.exact).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail.**

Run: `npx vitest run tools/__tests__/residue-check.test.js -t "isLanguageNeutral|language-neutral"`
Expected: FAIL — `isLanguageNeutral is not a function`.

- [ ] **Step 3: Implement `isLanguageNeutral` in `tools/lib/residue-check.js`.** Add after the `normalizeForComparison` function (it must be able to call the existing module-local `stripMarkers`):

```javascript
// Recognized language-neutral units (matched case-insensitively). Deliberately
// EXCLUDES multi-letter English homographs (bar, log, ln, sin, cos, tan): a segment
// whose only non-predicate token is such a homograph belongs on the residue allowlist,
// not here — admitting them would erode the all-or-nothing safety property below.
const LN_UNITS = new Set([
  'amu', 'atm', 'torr', 'mmhg', 'kpa', 'pa', 'mol', 'l', 'ml', 'g', 'kg', 'mg',
  'k', 'j', 'kj', 'cal', 'kcal', 'v', 'n', 'w', 'ev', 'rem', 'rad', 'rbe', 'gy',
  'sv', 'bq', 'ci', 'ppm', 'nm', 'pm', 'cm', 'mm', 'm', 's', 'hz',
]);
// Unambiguous scientific quantity symbols (non-homograph). Matched case-SENSITIVELY.
const LN_QUANTITIES = new Set(['pH', 'pOH', 'pKa', 'pKb', 'pKw', 'pI']);
// Chemical-formula case shape: uppercase-initial element-symbol runs (+ optional digits).
const FORMULA_RE = /^([A-Z][a-z]?\d*)+$/;

/**
 * True when EVERY word-token of `text` is a recognized language-neutral token —
 * a curated unit, a chemical-formula-shaped token, or an unambiguous quantity
 * symbol (pH/pOH/…). Numbers and enumeration letters ((a),(b)) are ignored.
 * One unrecognized word ⇒ false. This all-or-nothing rule is the safety property:
 * genuine English prose (which always carries articles/verbs) can never pass.
 * Case-preserving on purpose — case is the formula signal, so this runs BEFORE
 * normalizeForComparison's lowercasing.
 */
export function isLanguageNeutral(text) {
  const stripped = stripMarkers(text);
  const tokens = stripped
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // operators/punctuation (= + − · : ; , ( )) → space
    .split(/\s+/)
    .filter(Boolean);
  let recognized = 0;
  for (const tok of tokens) {
    if (/^\p{N}/u.test(tok)) continue; // number-leading token (123, 896) → ignore
    if (tok.length === 1 && /\p{Ll}/u.test(tok)) continue; // enumeration: (a),(b),b.
    if (LN_UNITS.has(tok.toLowerCase())) { recognized++; continue; }
    if (LN_QUANTITIES.has(tok)) { recognized++; continue; }
    if (FORMULA_RE.test(tok)) { recognized++; continue; }
    return false; // an unrecognized word-token → not language-neutral
  }
  return recognized > 0; // require ≥1 recognized token (empty/marker-only ⇒ false)
}
```

- [ ] **Step 4: Wire it into `detectResidue`.** In `tools/lib/residue-check.js`, change the body of `detectResidue` — replace the block starting `const exact = enNorm === isNorm;`:

```javascript
  const exact = enNorm === isNorm;
  // Language-neutral verbatim-EN (formula/unit/pH cell) is not a translation
  // failure — demote it so it never gates report.complete. Runs on raw enText
  // (case-preserving); enNorm===isNorm here so either side is equivalent.
  if (exact && isLanguageNeutral(enText)) {
    return { contentWords, exact: false, languageNeutral: true, ratio: 0, warn: false };
  }
  const ratio = exact ? 1 : tokenOverlapRatio(enNorm, isNorm);
  const warn = !exact && ratio >= warnThreshold;
  return { contentWords, exact, ratio, warn };
```

- [ ] **Step 5: Run the tests to verify they pass.**

Run: `npx vitest run tools/__tests__/residue-check.test.js`
Expected: PASS (all, including the pre-existing cases).

- [ ] **Step 6: Commit.**

```bash
git add tools/lib/residue-check.js tools/__tests__/residue-check.test.js
git commit -m "$(printf 'feat(residue): language-neutral predicate demotes formula/unit/pH cells\n\ndetectResidue no longer flags a verbatim-EN segment as exact residue when\nevery token is a curated unit, chemical-formula-shaped, or an unambiguous\nquantity symbol (pH/pOH). English homographs (bar/log) excluded on purpose.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 2: `residue-allowlist.js` lib + `residue-allowlist.json`

**Files:**
- Create: `tools/lib/residue-allowlist.js`
- Create: `books/efnafraedi-2e/residue-allowlist.json`
- Test: `tools/__tests__/residue-allowlist.test.js`

**Interfaces:**
- Produces: `loadResidueAllowlist(bookDir): {entries:[]}`; `classifyResidue(moduleId, segmentId, allowlist): {tolerated:boolean, class?:string, reason?:string}`.

- [ ] **Step 1: Write the failing tests.** Create `tools/__tests__/residue-allowlist.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { classifyResidue } from '../lib/residue-allowlist.js';

const allow = {
  entries: [
    { moduleId: 'm68729', segmentId: 'm68729:note-title:x', class: 'proper-noun', reason: 'chemist name' },
    { moduleId: 'm68750', segmentId: 'm68750:para:y', class: 'homograph-unit', reason: 'bar unit' },
  ],
};

describe('classifyResidue', () => {
  it('tolerates an exact-match entry with a valid class and reason', () => {
    const r = classifyResidue('m68729', 'm68729:note-title:x', allow);
    expect(r.tolerated).toBe(true);
    expect(r.class).toBe('proper-noun');
    expect(r.reason).toBe('chemist name');
  });
  it('does NOT tolerate an unlisted segment', () => {
    expect(classifyResidue('m68729', 'm68729:note-title:OTHER', allow).tolerated).toBe(false);
  });
  it('does NOT tolerate when moduleId drifts', () => {
    expect(classifyResidue('m99999', 'm68729:note-title:x', allow).tolerated).toBe(false);
  });
  it('does NOT tolerate an invalid class', () => {
    const bad = { entries: [{ moduleId: 'm1', segmentId: 's1', class: 'benign', reason: 'r' }] };
    expect(classifyResidue('m1', 's1', bad).tolerated).toBe(false);
  });
  it('does NOT tolerate a missing reason', () => {
    const bad = { entries: [{ moduleId: 'm1', segmentId: 's1', class: 'proper-noun' }] };
    expect(classifyResidue('m1', 's1', bad).tolerated).toBe(false);
  });
  it('is safe on an empty allowlist', () => {
    expect(classifyResidue('m1', 's1', { entries: [] }).tolerated).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `npx vitest run tools/__tests__/residue-allowlist.test.js`
Expected: FAIL — cannot find module `../lib/residue-allowlist.js`.

- [ ] **Step 3: Create `tools/lib/residue-allowlist.js`** (mirror of `fidelity-allowlist.js`):

```javascript
import fs from 'fs';
import path from 'path';

/** Load a book's residue allowlist; {entries:[]} when absent (⇒ nothing tolerated). */
export function loadResidueAllowlist(bookDir) {
  const p = path.join(bookDir, 'residue-allowlist.json');
  if (!fs.existsSync(p)) return { entries: [] };
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { entries: Array.isArray(raw.entries) ? raw.entries : [] };
}

/** The only classes that may tolerate a residue. */
const VALID_CLASSES = new Set(['proper-noun', 'homograph-unit']);

/**
 * Exact-match classify one residue segment. Unlisted, drifted, an invalid `class`,
 * or a missing `reason` → not tolerated (fail-loud, mirrors fidelity classifyDiff).
 */
export function classifyResidue(moduleId, segmentId, allowlist) {
  const e = (allowlist.entries || []).find(
    (x) => x.moduleId === moduleId && x.segmentId === segmentId
  );
  if (!e || !VALID_CLASSES.has(e.class) || !e.reason) return { tolerated: false };
  return { tolerated: true, class: e.class, reason: e.reason };
}
```

- [ ] **Step 4: Run to verify it passes.**

Run: `npx vitest run tools/__tests__/residue-allowlist.test.js`
Expected: PASS.

- [ ] **Step 5: Create `books/efnafraedi-2e/residue-allowlist.json`** (the 4 verified entries):

```json
{
  "_comment": "Residue gate: language-neutral segments a pattern cannot safely classify. class: proper-noun (person/institution name) | homograph-unit (unit/expression whose only non-predicate token is an English homograph like bar/log). Exact match moduleId+segmentId; drift/invalid-class/missing-reason → still flagged. See docs/superpowers/specs/2026-07-14-residue-gate-retriage-design.md",
  "entries": [
    { "moduleId": "m68729", "segmentId": "m68729:note-title:fs-idp23436864-title", "class": "proper-noun", "reason": "chemist-portrait person-name title (Dorothy Crowfoot Hodgkin); note body is translated" },
    { "moduleId": "m68784", "segmentId": "m68784:note-title:fs-idm42784320-title", "class": "proper-noun", "reason": "chemist-portrait person-name title (Frederick Gardner Cottrell); note body is translated" },
    { "moduleId": "m68750", "segmentId": "m68750:para:fs-idp131216672", "class": "homograph-unit", "reason": "pressure values; only non-predicate token is the English homograph 'bar' (0.987 bar)" },
    { "moduleId": "m68809", "segmentId": "m68809:para:fs-idm41259968", "class": "homograph-unit", "reason": "pH/pOH calculation; only non-predicate token is the English homograph 'log' (log([OH-]))" }
  ]
}
```

- [ ] **Step 6: Commit.**

```bash
git add tools/lib/residue-allowlist.js tools/__tests__/residue-allowlist.test.js books/efnafraedi-2e/residue-allowlist.json
git commit -m "$(printf 'feat(residue): per-book residue allowlist (mirror fidelity-allowlist)\n\nloadResidueAllowlist + classifyResidue tolerate exact moduleId+segmentId\nmatches with a valid class (proper-noun|homograph-unit) and a reason; any\ndrift fails loud to not-tolerated. efnafraedi-2e ships 4 entries.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 3: `tolerated[]` support in the residue manifest

**Files:**
- Modify: `tools/lib/residue-check.js` (`upsertResidueModule`)
- Test: `tools/__tests__/residue-check.test.js`

**Interfaces:**
- Consumes: nothing new.
- Produces: `upsertResidueModule(report, moduleId, {exact, warnings, tolerated})` now records a `tolerated: [{segmentId, reason}]` array per module, keeps a module that has ONLY tolerated residues (not deleted), and adds `summary.toleratedResidues`.

- [ ] **Step 1: Write the failing tests.** Append to `tools/__tests__/residue-check.test.js`:

```javascript
describe('upsertResidueModule tolerated', () => {
  it('records a tolerated-only module and counts it in the summary', () => {
    const r = upsertResidueModule({ track: 'mt-preview' }, 'm68729', {
      exact: [],
      warnings: [],
      tolerated: [{ segmentId: 'm68729:note-title:x', reason: 'chemist name' }],
    });
    expect(r.modules.m68729.tolerated).toEqual([{ segmentId: 'm68729:note-title:x', reason: 'chemist name' }]);
    expect(r.modules.m68729.exact).toEqual([]);
    expect(r.summary.toleratedResidues).toBe(1);
    expect(r.summary.exactResidues).toBe(0);
  });
  it('deletes a module only when exact, warnings AND tolerated are all empty', () => {
    const start = upsertResidueModule({ track: 'mt-preview' }, 'm1', { exact: ['m1:s'] });
    const cleared = upsertResidueModule(start, 'm1', { exact: [], warnings: [], tolerated: [] });
    expect(cleared.modules.m1).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails.**

Run: `npx vitest run tools/__tests__/residue-check.test.js -t "tolerated"`
Expected: FAIL — `r.modules.m68729.tolerated` is undefined / module deleted.

- [ ] **Step 3: Modify `upsertResidueModule`** in `tools/lib/residue-check.js`. Replace the whole function body:

```javascript
export function upsertResidueModule(report, moduleId, entry = {}) {
  const exact = entry.exact || [];
  const warnings = entry.warnings || [];
  const tolerated = entry.tolerated || [];
  const modules = { ...((report && report.modules) || {}) };
  if (exact.length === 0 && warnings.length === 0 && tolerated.length === 0) {
    delete modules[moduleId];
  } else {
    modules[moduleId] = {
      exact: [...exact],
      warnings: warnings.map((w) => ({ segmentId: w.segmentId, ratio: w.ratio })),
      tolerated: tolerated.map((t) => ({ segmentId: t.segmentId, reason: t.reason })),
    };
  }
  const ids = Object.keys(modules);
  return {
    track: (report && report.track) || null,
    generatedBy: 'cnxml-inject.js',
    summary: {
      modulesWithResidue: ids.filter((m) => modules[m].exact.length).length,
      exactResidues: ids.reduce((s, m) => s + modules[m].exact.length, 0),
      ratioWarnings: ids.reduce((s, m) => s + modules[m].warnings.length, 0),
      toleratedResidues: ids.reduce((s, m) => s + (modules[m].tolerated || []).length, 0),
    },
    modules,
  };
}
```

- [ ] **Step 4: Run to verify it passes.**

Run: `npx vitest run tools/__tests__/residue-check.test.js`
Expected: PASS (all).

- [ ] **Step 5: Commit.**

```bash
git add tools/lib/residue-check.js tools/__tests__/residue-check.test.js
git commit -m "$(printf 'feat(residue): tolerated[] field in the residue manifest\n\nupsertResidueModule records per-module tolerated residues (segmentId+reason)\nand a summary.toleratedResidues count; a tolerated-only module is kept for\nauditability rather than deleted.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 4: Wire the allowlist into `cnxml-inject.js`

**Files:**
- Modify: `tools/cnxml-inject.js` (`buildCnxml` ~1814/1847/2044; `main` ~4036/4158/4183)

**Interfaces:**
- Consumes: `loadResidueAllowlist`, `classifyResidue` from `./lib/residue-allowlist.js`; `structure.moduleId` (already available in `buildCnxml`).
- Produces: `buildCnxml` `report.tolerated` (segmentId array); `report.complete` unchanged in logic but now excludes allowlisted residues; the persisted `residue-report.mt-preview.json` carries `tolerated` entries.

- [ ] **Step 1: Add the import.** In `tools/cnxml-inject.js`, next to the existing residue-check import (line 52):

```javascript
import { detectResidue, upsertResidueModule } from './lib/residue-check.js';
import { loadResidueAllowlist, classifyResidue } from './lib/residue-allowlist.js';
```

- [ ] **Step 2: Add the `tolerated` bucket to `stats`.** In `buildCnxml` (the `const stats = {` block ~1814), add after the `residueWarnings` line:

```javascript
    residues: [], // exact untranslated-EN (gates complete)
    residueWarnings: [], // ratio "mostly English" (non-gating)
    tolerated: [], // allowlisted language-neutral residues (non-gating)
```

- [ ] **Step 3: Route allowlisted exacts to `tolerated`.** In `buildCnxml`'s `getSeg` residue branch (~1850), replace:

```javascript
      const r = detectResidue(enText, text);
      if (r.exact) {
        stats.residues.push(segmentId);
      } else if (r.warn) {
        stats.residueWarnings.push({ segmentId, ratio: Number(r.ratio.toFixed(2)) });
      }
```

with:

```javascript
      const r = detectResidue(enText, text);
      if (r.exact) {
        if (options.isAllowlisted && options.isAllowlisted(structure.moduleId, segmentId)) {
          stats.tolerated.push(segmentId);
        } else {
          stats.residues.push(segmentId);
        }
      } else if (r.warn) {
        stats.residueWarnings.push({ segmentId, ratio: Number(r.ratio.toFixed(2)) });
      }
```

- [ ] **Step 4: Expose `tolerated` on the report.** In `buildCnxml`'s `report` object (~2051), add after the `residueWarnings` line (the `complete` computation stays exactly as-is — it already keys on `stats.residues`, which now excludes tolerated):

```javascript
    residues: stats.residues.slice().sort(),
    residueWarnings: stats.residueWarnings,
    tolerated: stats.tolerated.slice().sort(),
```

- [ ] **Step 5: Load the allowlist once in `main` and pass an `isAllowlisted` closure.** In `main()`, after `BOOKS_DIR = \`books/${args.book}\`;` (line 4036), add:

```javascript
  BOOKS_DIR = `books/${args.book}`;
  const residueAllowlist = loadResidueAllowlist(BOOKS_DIR);
  const isAllowlisted = (moduleId, segmentId) =>
    classifyResidue(moduleId, segmentId, residueAllowlist).tolerated;
```

(Confirmed by reading the code: `cnxml-inject.js` uses `BOOKS_DIR` as a **repo-root-relative** path — e.g. `residueReportPath = path.join(BOOKS_DIR, \`residue-report.${track}.json\`)` at line 4057 — and relies on cwd = repo root. Load the allowlist the same way, NOT via `REPO_ROOT` (which this file does not define). `loadResidueAllowlist` returns `{entries:[]}` if the file is absent, so this is safe for every book.)

Then in the `buildCnxml(...)` options object (~4163) add `isAllowlisted` next to `checkResidue`:

```javascript
          checkResidue: args.lang !== 'en' && !args.allowEnFallback,
          isAllowlisted,
```

- [ ] **Step 6: Thread `tolerated` into the manifest upsert.** At the `upsertResidueModule` call (~4183), map segmentIds to `{segmentId, reason}` via the allowlist:

```javascript
      residueReport = upsertResidueModule(residueReport, moduleId, {
        exact: result.report.residues,
        warnings: result.report.residueWarnings,
        tolerated: (result.report.tolerated || []).map((segmentId) => ({
          segmentId,
          reason: classifyResidue(moduleId, segmentId, residueAllowlist).reason,
        })),
      });
```

- [ ] **Step 7: Verify the gate un-sticks the 4 allowlisted + 9 predicate modules.** Run one predicate module and one allowlist module (no `--allow-incomplete`; incomplete modules skip before write, so nothing is written to `03-translated/`):

```bash
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 2 --module m68698 2>&1 | grep -E "COMPLETE|SKIPPED"
node tools/cnxml-inject.js --book efnafraedi-2e --chapter 6 --module m68729 2>&1 | grep -E "COMPLETE|SKIPPED"
```

Expected: both print `... [COMPLETE]` (m68698 via predicate, m68729 via allowlist). Neither prints `SKIPPED`.

- [ ] **Step 8: Verify no content was written and revert the derived manifests.** The two derived files (`residue-report.mt-preview.json`, `translation-errors.json`) are rewritten by any inject run; revert them (this PR ships no content/manifest data changes):

```bash
git status --short books/     # expect ONLY the two derived json files (+ the new residue-allowlist.json staged earlier); NO 03-translated/ or 05-publication/ changes
git checkout -- books/efnafraedi-2e/residue-report.mt-preview.json books/efnafraedi-2e/translation-errors.json
```

If `git status` shows anything under `03-translated/` or `05-publication/`, STOP — a complete module was written; investigate before continuing.

- [ ] **Step 9: Run the tools test suite.**

Run: `npx vitest run tools/__tests__/cnxml-inject.test.js`
Expected: PASS.

- [ ] **Step 10: Commit.**

```bash
git add tools/cnxml-inject.js
git commit -m "$(printf 'feat(residue): inject consults the residue allowlist; tolerated bucket\n\nbuildCnxml routes an allowlisted exact residue to stats.tolerated instead of\nstats.residues, so report.complete no longer trips on it; main loads the\nper-book allowlist once and threads reasons into the manifest. Un-sticks the\n13 residue-only efnafraedi-2e modules.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 5: Report `tolerated` in `scan-residue.js` + corpus net

**Files:**
- Modify: `tools/scan-residue.js` (`main`)

**Interfaces:**
- Consumes: `loadResidueAllowlist`, `classifyResidue`; the `exact[]` from `scanSegmentsForResidue` (unchanged).
- Produces: per-module `tolerated[]` in the `--json` output + a `toleratedResidues` summary count; `exact[]` now excludes allowlisted segments.

- [ ] **Step 1: Add the import** to `tools/scan-residue.js` (next to the `scanSegmentsForResidue` import):

```javascript
import { scanSegmentsForResidue } from './lib/residue-scan.js';
import { loadResidueAllowlist, classifyResidue } from './lib/residue-allowlist.js';
```

- [ ] **Step 2: Load the allowlist and split `exact`→`tolerated`.** In `main()`, after `requireBook(args);` load the allowlist, and in the per-module loop (where `const { exact, warnings } = scanSegmentsForResidue(...)` is destructured, ~line 72) split out tolerated:

```javascript
  const residueAllowlist = loadResidueAllowlist(path.join(REPO_ROOT, 'books', args.book));
```

Replace the module-record block (~72-73):

```javascript
      const { exact: exactAll, warnings } = scanSegmentsForResidue(enContent, isContent);
      const tolerated = [];
      const exact = [];
      for (const segId of exactAll) {
        const c = classifyResidue(moduleId, segId, residueAllowlist);
        if (c.tolerated) tolerated.push({ segmentId: segId, reason: c.reason });
        else exact.push(segId);
      }
      if (exact.length || warnings.length || tolerated.length)
        modules[moduleId] = { chapter: dir, exact, warnings, tolerated };
```

- [ ] **Step 3: Add `toleratedResidues` to the summary.** In the `summary` object (~78) add:

```javascript
    ratioWarnings: ids.reduce((s, m) => s + modules[m].warnings.length, 0),
    toleratedResidues: ids.reduce((s, m) => s + ((modules[m].tolerated || []).length), 0),
    modulesMissingEn,
```

- [ ] **Step 4: Corpus net — run the full-book scan and confirm the numbers.**

Run: `node tools/scan-residue.js --book efnafraedi-2e --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const r=JSON.parse(s);console.log('exact',r.summary.exactResidues,'tolerated',r.summary.toleratedResidues);const nonPreface=Object.entries(r.modules).filter(([k,v])=>k!=='m68662'&&v.exact.length);console.log('non-preface modules still exact:',nonPreface.map(([k])=>k).join(',')||'(none)');})"`

Expected: `exact 76 tolerated 4` and `non-preface modules still exact: (none)`. (All 76 remaining exacts are in the LEAD-owned m68662 preface; the 4 tolerated are m68729/m68784/m68750/m68809.)

If any non-preface module is still `exact`, STOP — the predicate under-covers or the allowlist is missing an id; reconcile against the spec's routing table before continuing.

- [ ] **Step 5: Commit.**

```bash
git add tools/scan-residue.js
git commit -m "$(printf 'feat(residue): scan-residue reports tolerated residues\n\nscan-residue splits allowlisted exacts into a per-module tolerated[] with a\ntoleratedResidues summary count, matching the inject-side classification.\nFull-book scan: exact 100→76 (all m68662 preface), tolerated 4.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

## Task 6: Full-suite gate + all-13 verification + PR

**Files:** none (verification + PR).

- [ ] **Step 1: Run the full suite from the repo root.**

Run: `npm test`
Expected: all green (Vitest workspace: tools + server).

- [ ] **Step 2: Verify all 13 modules now inject COMPLETE.** Run the sole-blocker probe across the 13 (no `--allow-incomplete`):

```bash
declare -A CH=( [m68696]=2 [m68698]=2 [m68700]=3 [m68729]=6 [m68739]=7 [m68750]=9 [m68752]=9 [m68784]=11 [m68798]=13 [m68804]=14 [m68809]=14 [m68858]=21 [m68862]=appendices )
for mod in "${!CH[@]}"; do
  node tools/cnxml-inject.js --book efnafraedi-2e --chapter "${CH[$mod]}" --module "$mod" 2>&1 | grep -qE "${mod}.*COMPLETE" && echo "$mod COMPLETE" || echo "$mod ❌ NOT COMPLETE"
done
git checkout -- books/efnafraedi-2e/residue-report.mt-preview.json books/efnafraedi-2e/translation-errors.json
```

Expected: all 13 print `COMPLETE`. Then confirm the tree is clean of content/manifest changes:

```bash
git status --short books/    # expect empty except the (already-committed) residue-allowlist.json
```

- [ ] **Step 3: Confirm scope — no content changed.**

Run: `git diff --stat main -- books/ | grep -E '03-translated|05-publication' && echo "SCOPE VIOLATION" || echo "scope clean (only residue-allowlist.json under books/)"`
Expected: `scope clean`.

- [ ] **Step 4: Push and open the PR.**

```bash
git push -u origin fix/chem-residue-gate-retriage
gh pr create --title "Residue-gate re-triage: un-stick 13 efnafraedi-2e modules (byte-perfect #3)" --body "$(cat <<'BODY'
Re-triages the untranslated-EN residue gate so language-neutral content
(chemical formulas, SI/chem units, pH/pOH, and the 14 already-localized
numbers) no longer marks a module incomplete.

**Two units (per `docs/superpowers/specs/2026-07-14-residue-gate-retriage-design.md`):**
- Pure `isLanguageNeutral` predicate in `residue-check.js` (units + formula
  case-shape + pH/pOH; English homographs excluded) — covers 20/24 residues,
  generalizes to biology.
- Per-book `residue-allowlist.json` + `residue-allowlist.js` (mirror of
  `fidelity-allowlist.js`) — 4 entries (2 proper-noun titles, 2 homograph-unit).
- Non-gating `tolerated[]` manifest field keeps allowlisted residues auditable.

**Effect:** the 13 non-preface incomplete modules now inject COMPLETE
(advisor-verified residue is their sole blocker); full-book residue drops
100→76 exact (all remaining in the LEAD-owned m68662 preface), 4 tolerated.

**Scope:** code + tests + one config file only. Zero `03-translated/` or
`05-publication/` changes — the re-inject/re-render sweep and the m68662
preface are separate follow-up ops. Unblocks the #5/#7 gate flips.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## Self-Review

**Spec coverage:**
- Predicate (units + formula-shape + pH/pOH, homographs excluded) → Task 1. ✅
- Allowlist lib + JSON (4 entries) mirroring fidelity-allowlist → Task 2. ✅
- `tolerated[]` manifest field → Task 3 (shape) + Tasks 4/5 (population). ✅
- Inject gate wiring (stats.tolerated, complete unchanged, isAllowlisted) → Task 4. ✅
- scan-residue reporting + corpus net → Task 5. ✅
- Global-scope note (predicate affects all books) → honored: predicate lives in shared `detectResidue`; corpus net only asserts efnafraedi (representative). ✅
- Negative test "recognized token amid English still flags" → Task 1 Step 1. ✅
- Verification: npm test green (Task 6.1), 13× COMPLETE (Task 6.2), exact 76 / tolerated 4 (Task 5.4). ✅
- Non-goals (no 05-publication changes; m68662 LEAD) → enforced in Task 4.8, 6.3. ✅

**Placeholder scan:** No TBD/TODO. One conditional note in Task 4 Step 5 (`REPO_ROOT` scope) is a real "read-before-edit" instruction, not a placeholder — the exact expression is given.

**Type consistency:** `classifyResidue` returns `{tolerated, class?, reason?}` — used consistently in Tasks 2/4/5. `upsertResidueModule` third arg `{exact, warnings, tolerated}` — Task 3 defines it, Task 4 Step 6 supplies it. `isAllowlisted(moduleId, segmentId)→boolean` — Task 4 Steps 3/5 agree. `report.tolerated` is a `string[]` of segmentIds; the manifest `tolerated` is `{segmentId, reason}[]` — the mapping happens in Task 4 Step 6 (documented in the interface). Consistent.
