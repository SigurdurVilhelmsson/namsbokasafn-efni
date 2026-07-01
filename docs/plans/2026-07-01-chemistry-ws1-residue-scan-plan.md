# Chemistry WS1 — EN-residue scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only tool that finds body segments the Málstaður API returned still in English, run it on efnafraedi-2e, and re-translate any genuine residue (dry-run first).

**Architecture:** A pure, fs-free comparison function (`tools/lib/residue-scan.js`) pairs EN/IS segments by ID (reusing `parseSegmentsMap` + `detectResidue`) and returns exact residues + ratio warnings. A thin CLI (`tools/scan-residue.js`) walks `02-for-mt` × `02-mt-output`, calls the pure function per module, and prints a grouped report (`--json` for machine output). It never touches `03-translated`, so there are no stale-render side effects.

**Tech Stack:** Node 22 ESM, Vitest. Reuses `tools/lib/residue-check.js` (`detectResidue`) and `tools/lib/seg-markers.cjs` (`parseSegmentsMap`) verbatim.

## Global Constraints

- Node 22 / `nvm use` before any lockfile change. **No lockfile change expected in WS1.**
- Test gate is **local `npm test` from the repo root** (no branch protection). Branch off `main`.
- 🔒 `books/*/01-source/` and `02-mt-output/` are READ-ONLY — WS1 only reads them.
- **Translations are API-only** (Miðeind/Málstaður), never AI-generated. Any re-translation runs
  `node tools/api-translate.js --dry-run` first and **pauses for lead go/no-go** on the ISK estimate.
  Price = 1 ISK / 100 chars.
- Resolve `books/` against the repo root via `import.meta.url`, **never `process.cwd()`**. Run tools from repo root.
- The scanner prints to stdout only (no tracked file written) — sidesteps the undecided
  `residue-report.<track>.json` disposition (spec decision-1).

---

## File Structure

- **Create `tools/lib/residue-scan.js`** — one export, `scanSegmentsForResidue(enContent, isContent, opts)`, pure (no fs). Responsibility: pair two SEG-marker files by segment ID and classify each IS segment as exact-residue / ratio-warning / clean.
- **Create `tools/scan-residue.js`** — CLI. Responsibility: argument parsing, fs walking of the two segment trees, calling the pure function, and formatting the report (human + `--json`).
- **Create `tools/__tests__/residue-scan.test.js`** — Vitest unit tests for the pure function.

---

## Task 1: Pure residue-scan function

**Files:**
- Create: `tools/lib/residue-scan.js`
- Test: `tools/__tests__/residue-scan.test.js`

**Interfaces:**
- Consumes: `parseSegmentsMap(content) → Map<segId,text>` from `./seg-markers.cjs`; `detectResidue(en, is, opts) → {contentWords, exact, ratio, warn}` from `./residue-check.js`.
- Produces: `scanSegmentsForResidue(enContent: string, isContent: string, opts?: object) → { exact: string[], warnings: {segmentId: string, ratio: number}[] }`. `exact` = segment IDs whose IS text is verbatim-English; `warnings` = IDs with token-overlap ≥ 0.7 (non-exact). Segments with no EN counterpart are skipped.

- [ ] **Step 1: Write the failing test**

```js
// tools/__tests__/residue-scan.test.js
import { describe, it, expect } from 'vitest';
import { scanSegmentsForResidue } from '../lib/residue-scan.js';

// Real SEG-marker syntax: <!-- SEG:<id> -->\n<text>
const seg = (id, text) => `<!-- SEG:${id} -->\n${text}\n\n`;

describe('scanSegmentsForResidue', () => {
  it('flags a verbatim-English segment as exact residue', () => {
    const en = seg('m1:para:1', 'The reaction reaches equilibrium quickly.');
    const is = seg('m1:para:1', 'The reaction reaches equilibrium quickly.');
    const out = scanSegmentsForResidue(en, is);
    expect(out.exact).toEqual(['m1:para:1']);
    expect(out.warnings).toEqual([]);
  });

  it('does not flag a properly translated segment', () => {
    const en = seg('m1:para:1', 'The reaction reaches equilibrium quickly.');
    const is = seg('m1:para:1', 'Efnahvarfið nær jafnvægi hratt.');
    const out = scanSegmentsForResidue(en, is);
    expect(out.exact).toEqual([]);
    expect(out.warnings).toEqual([]);
  });

  it('does not flag a numeric/formula cell that is identical EN==IS (content-word floor)', () => {
    const en = seg('m1:entry:1', 'neon 0.83 g/L');
    const is = seg('m1:entry:1', 'neon 0.83 g/L');
    const out = scanSegmentsForResidue(en, is);
    expect(out.exact).toEqual([]);
  });

  it('skips IS segments with no EN counterpart', () => {
    const en = seg('m1:para:1', 'Only in English file.');
    const is = seg('m1:para:2', 'Aðeins í íslensku skránni.');
    const out = scanSegmentsForResidue(en, is);
    expect(out.exact).toEqual([]);
    expect(out.warnings).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/residue-scan.test.js`
Expected: FAIL — `Failed to resolve import "../lib/residue-scan.js"`.

- [ ] **Step 3: Write minimal implementation**

```js
// tools/lib/residue-scan.js
/**
 * Pair two SEG-marker segment files by ID and classify each IS segment as
 * verbatim-English residue or a "mostly English" ratio warning. Pure, no I/O.
 *
 * @param {string} enContent  raw text of an m*-segments.en.md file
 * @param {string} isContent  raw text of the matching m*-segments.is.md file
 * @param {object} [opts]     forwarded to detectResidue (minTokens, warnThreshold, minWordLen)
 * @returns {{exact: string[], warnings: {segmentId: string, ratio: number}[]}}
 */
import { parseSegmentsMap } from './seg-markers.cjs';
import { detectResidue } from './residue-check.js';

export function scanSegmentsForResidue(enContent, isContent, opts = {}) {
  const en = parseSegmentsMap(enContent);
  const is = parseSegmentsMap(isContent);
  const exact = [];
  const warnings = [];
  for (const [segId, isText] of is) {
    const enText = en.get(segId);
    if (enText == null) continue; // no EN counterpart -> cannot judge
    const r = detectResidue(enText, isText, opts);
    if (r.exact) exact.push(segId);
    else if (r.warn) warnings.push({ segmentId: segId, ratio: Number(r.ratio.toFixed(3)) });
  }
  return { exact, warnings };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/residue-scan.test.js`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/residue-scan.js tools/__tests__/residue-scan.test.js
git commit -m "feat(residue): pure scanSegmentsForResidue pairing EN/IS segments"
```

---

## Task 2: scan-residue CLI

**Files:**
- Create: `tools/scan-residue.js`
- Modify: none.

**Interfaces:**
- Consumes: `scanSegmentsForResidue` (Task 1); `parseArgs`, `BOOK_OPTION`, `CHAPTER_OPTION`, `requireBook` from `./lib/parseArgs.js`.
- Produces: a CLI — `node tools/scan-residue.js --book <slug> [--chapter N|appendices] [--json]`. Human output = per-module residue/warning lines + a summary; `--json` = `{book, summary:{modulesWithResidue, exactResidues, ratioWarnings, modulesMissingEn}, modules:{<moduleId>:{chapter, exact:[], warnings:[]}}}`. Exit 0 always (report tool, not a gate).

- [ ] **Step 1: Write the implementation**

```js
#!/usr/bin/env node
/**
 * Read-only EN-residue scanner. Walks a book's 02-for-mt × 02-mt-output segment
 * trees, pairs each module's EN/IS files, and reports segments the API left in
 * English. Never writes 03-translated or any tracked file (prints to stdout).
 *
 * Usage: node tools/scan-residue.js --book efnafraedi-2e [--chapter 5] [--json]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, requireBook } from './lib/parseArgs.js';
import { scanSegmentsForResidue } from './lib/residue-scan.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** chapter arg (int | 'appendices' | null) -> dir name(s) to scan. */
function chapterDirs(mtOutRoot, chapter) {
  if (chapter === 'appendices') return ['appendices'];
  if (typeof chapter === 'number' && !Number.isNaN(chapter)) {
    return ['ch' + String(chapter).padStart(2, '0')];
  }
  return fs
    .readdirSync(mtOutRoot)
    .filter((d) => /^ch\d+$/.test(d) || d === 'appendices')
    .sort();
}

const JSON_OPTION = { name: 'json', flags: ['--json'], type: 'boolean', default: false };

function main() {
  const args = parseArgs(process.argv.slice(2), [BOOK_OPTION, CHAPTER_OPTION, JSON_OPTION]);
  requireBook(args);

  const forMtRoot = path.join(REPO_ROOT, 'books', args.book, '02-for-mt');
  const mtOutRoot = path.join(REPO_ROOT, 'books', args.book, '02-mt-output');
  if (!fs.existsSync(mtOutRoot)) {
    console.error(`Error: no 02-mt-output for ${args.book}`);
    process.exit(1);
  }

  const modules = {};
  let modulesMissingEn = 0;
  for (const dir of chapterDirs(mtOutRoot, args.chapter)) {
    const isDir = path.join(mtOutRoot, dir);
    if (!fs.existsSync(isDir)) continue;
    for (const file of fs.readdirSync(isDir)) {
      if (!file.endsWith('-segments.is.md')) continue; // exclude .backup.* and .json
      const moduleId = file.slice(0, -'-segments.is.md'.length);
      const enFile = path.join(forMtRoot, dir, `${moduleId}-segments.en.md`);
      if (!fs.existsSync(enFile)) {
        modulesMissingEn++;
        modules[moduleId] = { chapter: dir, exact: [], warnings: [], missingEn: true };
        continue;
      }
      const enContent = fs.readFileSync(enFile, 'utf8');
      const isContent = fs.readFileSync(path.join(isDir, file), 'utf8');
      const { exact, warnings } = scanSegmentsForResidue(enContent, isContent);
      if (exact.length || warnings.length) modules[moduleId] = { chapter: dir, exact, warnings };
    }
  }

  const ids = Object.keys(modules);
  const summary = {
    modulesWithResidue: ids.filter((m) => modules[m].exact.length).length,
    exactResidues: ids.reduce((s, m) => s + modules[m].exact.length, 0),
    ratioWarnings: ids.reduce((s, m) => s + modules[m].warnings.length, 0),
    modulesMissingEn,
  };

  if (args.json) {
    console.log(JSON.stringify({ book: args.book, summary, modules }, null, 2));
    return;
  }

  console.log(`EN-residue scan — ${args.book}\n`);
  for (const m of ids.sort()) {
    const e = modules[m];
    if (e.missingEn) { console.log(`  ${m} (${e.chapter}): ⚠ no EN sibling`); continue; }
    if (e.exact.length) console.log(`  ${m} (${e.chapter}): ${e.exact.length} verbatim-EN → ${e.exact.join(', ')}`);
    if (e.warnings.length) console.log(`  ${m} (${e.chapter}): ${e.warnings.length} mostly-EN warning(s)`);
  }
  console.log(
    `\nSummary: ${summary.exactResidues} verbatim-EN residues in ${summary.modulesWithResidue} module(s); ` +
    `${summary.ratioWarnings} ratio warning(s); ${summary.modulesMissingEn} module(s) missing an EN sibling.`
  );
}

main();
```

- [ ] **Step 2: Run it on a single chapter to confirm it executes**

Run: `node tools/scan-residue.js --book efnafraedi-2e --chapter 5`
Expected: prints a scan report + a "Summary:" line, exit 0 (residue counts may be 0 — that is a valid pass).

- [ ] **Step 3: Confirm `--json` emits valid JSON**

Run: `node tools/scan-residue.js --book efnafraedi-2e --chapter 5 --json | node -e "process.stdin.resume(); let s=''; process.stdin.on('data',d=>s+=d); process.stdin.on('end',()=>{JSON.parse(s); console.log('valid json');})"`
Expected: `valid json`.

- [ ] **Step 4: Confirm a missing `--book` fails loud**

Run: `node tools/scan-residue.js` ; Expected: stderr `Error: --book is required` and non-zero exit.

- [ ] **Step 5: Commit**

```bash
git add tools/scan-residue.js
git commit -m "feat(residue): read-only scan-residue CLI over 02-for-mt x 02-mt-output"
```

---

## Task 3: Run the full chemistry scan, triage, and (conditionally) re-translate

**Files:** none created — operational task producing a decision + optional re-translation.

- [ ] **Step 1: Run the whole-book scan and capture the report**

Run: `node tools/scan-residue.js --book efnafraedi-2e --json > /tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni/8bcae3be-cc99-4de9-8610-76dd4a379997/scratchpad/chem-residue.json ; node tools/scan-residue.js --book efnafraedi-2e`
Expected: a full report. Note `modulesMissingEn` — chemistry has 149 modules with MT output; a handful of non-`m*` metadata files may lack siblings and are ignorable.

- [ ] **Step 2: Classify the flagged segments**

For each `exact` residue, open the EN/IS pair and confirm it is genuinely untranslated English (not a proper noun, chemical name, or intentionally-identical term). Record the list of module IDs + chapters that need re-translation. If the scan is clean (0 exact residues), **skip Steps 3–5** and record "chemistry EN-residue: clean" — WS1 is done.

- [ ] **Step 3: Dry-run the re-translation and STOP for go/no-go**

For the affected chapters:
Run: `node tools/api-translate.js --book efnafraedi-2e --chapter <N> --dry-run`
Expected: a translation plan + ISK cost estimate. **Double the printed estimate is unnecessary now (the estimator was fixed in #199), but confirm the ISK total against the lead's budget-at-the-time and get explicit go-ahead before spending. Do not proceed without it.**

- [ ] **Step 4: Re-translate only after go-ahead**

Run (per approved chapter): `node tools/api-translate.js --book efnafraedi-2e --chapter <N>`
Then re-run `node tools/scan-residue.js --book efnafraedi-2e --chapter <N>` and confirm the residue is gone.

- [ ] **Step 5: Record the outcome for WS5**

Note which chapters were re-translated (their `02-mt-output` changed) so WS5's backfill re-render covers them. Commit any changed `02-mt-output` segment files:

```bash
git add books/efnafraedi-2e/02-mt-output
git commit -m "content(efnafraedi-2e): re-translate EN-residue segments (WS1)"
```

---

## Self-Review

**Spec coverage (WS1 section of the design):**
- "read-only `tools/scan-residue.js` … runs `detectResidue` over 02-for-mt × 02-mt-output … does not touch 03-translated" → Tasks 1–2. ✅
- "content-word floor already suppresses legit EN==IS cells" → Task 1 Step 1 numeric-cell test. ✅
- "genuinely-untranslated → re-translate via api-translate (dry-run + estimate first)" → Task 3 Steps 3–4 with the STOP gate. ✅
- "unit-test … known-residue segment and a known-clean EN==IS numeric/formula cell" → Task 1 Step 1. ✅

**Placeholder scan:** No TBD/TODO; all code blocks complete; the only conditional ("skip if clean") is explicit. ✅

**Type consistency:** `scanSegmentsForResidue` returns `{exact:string[], warnings:{segmentId,ratio}[]}` in Task 1 and is consumed with that exact shape in Task 2. `parseSegmentsMap` → `Map` (iterated with `for..of`), `detectResidue` → `{exact, warn, ratio}` — matches `residue-check.js`. ✅
