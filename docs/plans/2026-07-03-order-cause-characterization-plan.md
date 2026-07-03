# Order-Cause Characterization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a reusable read-only tool + a committed report that break down, per cause (source element type), the residual element reorders in *fresh* (post-F1/F4) inject output for efnafraedi-2e — the grounded input for deciding filter-vs-fix per cause before any id-order gate change.

**Architecture:** One new CLI `tools/analyze-order-causes.js` exporting two testable functions: `classifyMovedIds` (pure: moved-id list → element-type histogram) and `analyzeModuleOrder` (one module: in-memory `extractSegments → buildCnxml → compareElementOrder`, then classify). The CLI loops modules and aggregates. A committed markdown report captures the run's findings + per-cause triage. No pipeline/gate change.

**Tech Stack:** Node 22 ESM, Vitest. Reuses `cnxml-extract.js` (`extractSegments`, `formatSegmentsMarkdown`), `cnxml-inject.js` (`buildCnxml`, `parseSegments`), `cnxml-fidelity-check.js` (`compareElementOrder`).

## Global Constraints

- **Read-only / in-memory.** Writes nothing under `books/`. No committed pipeline artifact changes.
- The tool is a **diagnostic, not a gate**: exit 0 regardless of how many reorders are found. A single module that fails to build is recorded (a `buildFailures` bucket) and the run continues; exit non-zero (`2`) is reserved for the total-failure case where **no** module could be analyzed at all.
- Resolve `books/` against `import.meta.url`, **never** `process.cwd()` (project rule; server runs cwd=`server/`).
- `npm test` from the repo root is the authoritative gate. Also `npm run validate`.
- One PR off `feat/chem-f4-table-double-model` (rebase to main when #223 merges).
- In-memory fresh-build harness (identical to F4 Task 5):
  ```js
  const { segments, structure, equations, inlineAttrs } = extractSegments(source);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  const { cnxml: fresh } = buildCnxml(structure, parsed, equations, source, {}, inlineAttrs);
  ```
- `buildCnxml` returns `{ cnxml, report }` — destructure `.cnxml`.

---

### Task 1: `classifyMovedIds` — pure moved-id → element-type histogram

**Files:**
- Create: `tools/analyze-order-causes.js` (this task adds only the exported pure fn + a tiny regex-escape helper; the CLI comes in Task 2)
- Test: `tools/__tests__/analyze-order-causes.test.js` (create)

**Interfaces:**
- Produces: `classifyMovedIds(sourceCnxml: string, movedIds: string[]) → { counts: Record<string, number>, unresolved: string[] }`. For each moved id, finds the element tag that carries `id="<id>"` in `sourceCnxml` and increments `counts[tag]`; an id whose tag cannot be found in source goes to `unresolved` (never silently dropped).

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/analyze-order-causes.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { classifyMovedIds } from '../analyze-order-causes.js';

const SRC = `<document>
<para id="p1">text</para>
<equation id="e1" class="unnumbered"><m:math/></equation>
<term id="t1">Term</term>
<media id="m1" alt="x"/>
<figure id="fig1"><media id="m2"/></figure>
</document>`;

describe('classifyMovedIds', () => {
  it('counts each moved id by its source element tag', () => {
    const { counts } = classifyMovedIds(SRC, ['e1', 't1', 'm1']);
    expect(counts).toEqual({ equation: 1, term: 1, media: 1 });
  });

  it('aggregates repeated tags', () => {
    const { counts } = classifyMovedIds(SRC, ['m1', 'm2']);
    expect(counts).toEqual({ media: 2 });
  });

  it('routes an id absent from source to unresolved, not into counts', () => {
    const { counts, unresolved } = classifyMovedIds(SRC, ['e1', 'ghost-id']);
    expect(counts).toEqual({ equation: 1 });
    expect(unresolved).toEqual(['ghost-id']);
  });

  it('is not fooled by an id substring of another id', () => {
    // 'p1' must not match 'p10'; require exact quoted id
    const src = `<para id="p10">a</para><note id="p1">b</note>`;
    const { counts } = classifyMovedIds(src, ['p1']);
    expect(counts).toEqual({ note: 1 });
  });

  it('attributes to the real element, not an earlier target-id reference to it', () => {
    // `id` must not match inside `target-id="..."` (the CNXML xref attribute).
    const src = `<link target-id="fig1">see</link><figure id="fig1"><media id="m1"/></figure>`;
    const { counts } = classifyMovedIds(src, ['fig1']);
    expect(counts).toEqual({ figure: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tools/__tests__/analyze-order-causes.test.js`
Expected: FAIL — `classifyMovedIds` not exported / module missing.

- [ ] **Step 3: Implement the pure function**

Create `tools/analyze-order-causes.js`:

```js
#!/usr/bin/env node

/**
 * analyze-order-causes.js — Diagnostic (NOT a gate).
 *
 * For each module, build fresh inject output in memory and compare element
 * document-order to source (compareElementOrder). Classify every out-of-order
 * ("moved") id by its SOURCE element tag, so the residual reorders are bucketed
 * by cause (equation / term / media / note / table / figure / para / …).
 *
 * Read-only, in-memory. Writes nothing under books/.
 */

/** Escape a string for safe use inside a RegExp. */
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Map each moved id to the source element tag carrying it.
 * @param {string} sourceCnxml
 * @param {string[]} movedIds
 * @returns {{ counts: Record<string, number>, unresolved: string[] }}
 */
export function classifyMovedIds(sourceCnxml, movedIds) {
  const counts = {};
  const unresolved = [];
  for (const id of movedIds) {
    // Match the opening tag whose `id` attribute is exactly this id.
    // (?<![\w-]) ensures `id="` is a real attribute, NOT the tail of
    // `target-id="` (the CNXML xref attribute) — a plain \b would match there
    // because `-` is a non-word char, misattributing xref'd elements to `link`.
    const re = new RegExp(`<([\\w:-]+)\\b[^>]*(?<![\\w-])id="${escapeRegExp(id)}"`);
    const m = sourceCnxml.match(re);
    if (m) {
      const tag = m[1];
      counts[tag] = (counts[tag] || 0) + 1;
    } else {
      unresolved.push(id);
    }
  }
  return { counts, unresolved };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tools/__tests__/analyze-order-causes.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/analyze-order-causes.js tools/__tests__/analyze-order-causes.test.js
git commit -m "feat(tools): classifyMovedIds — moved-id → source element-type histogram [order-char]"
```

---

### Task 2: `analyzeModuleOrder` + the CLI (fresh build, aggregate, print)

**Files:**
- Modify: `tools/analyze-order-causes.js` (add `analyzeModuleOrder`, the aggregate/print logic, and the CLI entry)
- Test: `tools/__tests__/analyze-order-causes.test.js` (extend)

**Interfaces:**
- Consumes: `classifyMovedIds` (Task 1); `extractSegments`, `formatSegmentsMarkdown` (`../cnxml-extract.js` → note: extract file is `tools/cnxml-extract.js`, import as `./cnxml-extract.js`); `buildCnxml`, `parseSegments` (`./cnxml-inject.js`); `compareElementOrder` (`./cnxml-fidelity-check.js`).
- Produces: `analyzeModuleOrder(sourceCnxml: string) → { moved: string[], counts: Record<string,number>, unresolved: string[] }` — fresh-builds one module in memory, compares element order to source, returns the moved ids and their classification. `moved` is `[]` for a fully clean module.

- [ ] **Step 1: Write the failing integration test**

Append to `tools/__tests__/analyze-order-causes.test.js`:

```js
import { readFileSync } from 'fs';
import { join } from 'path';
import { analyzeModuleOrder } from '../analyze-order-causes.js';

const SRCDIR = join(import.meta.dirname, '..', '..', 'books', 'efnafraedi-2e', '01-source');

describe('analyzeModuleOrder (real modules, in-memory fresh build)', () => {
  it('reports a fully clean module as moved=[] (m68702, section-bug fixed by F1)', () => {
    const src = readFileSync(join(SRCDIR, 'ch03', 'm68702.cnxml'), 'utf8');
    const { moved } = analyzeModuleOrder(src);
    expect(moved).toEqual([]);
  });

  it('classifies a residual module\'s moved ids by element tag (m68814 → equation + media)', () => {
    const src = readFileSync(join(SRCDIR, 'ch15', 'm68814.cnxml'), 'utf8');
    const { moved, counts, unresolved } = analyzeModuleOrder(src);
    expect(moved.length).toBeGreaterThan(0);
    expect(unresolved).toEqual([]);
    // residual causes for this module are block-equation + inline-media positioning
    expect(Object.keys(counts).sort()).toEqual(['equation', 'media']);
  });
});
```

> If m68702/m68814's exact fresh behavior has shifted by implementation time, run `analyzeModuleOrder` on them first and set the assertions to the observed values — but the point of each (one clean, one residual-with-known-tags) must hold; if m68702 is no longer clean, pick another module the tool reports as moved=[] and note it.

Also add this `aggregateBook` resilience unit test (uses an injected fake analyzer — no real module needed — so the "one bad module doesn't abort the run" behavior is directly asserted):

```js
import { aggregateBook } from '../analyze-order-causes.js';

describe('aggregateBook resilience + aggregation', () => {
  const fake = (source) => {
    if (source === 'THROW') throw new Error('boom');
    if (source === 'CLEAN') return { moved: [], counts: {}, unresolved: [] };
    return { moved: ['e1'], counts: { equation: 1 }, unresolved: [] };
  };
  const out = aggregateBook(
    [
      { moduleId: 'mA', source: 'CLEAN' },
      { moduleId: 'mB', source: 'RESIDUAL' },
      { moduleId: 'mC', source: 'THROW' },
    ],
    fake
  );

  it('records a throwing module in buildFailures and continues (does not abort)', () => {
    expect(out.buildFailures).toEqual([{ moduleId: 'mC', error: 'boom' }]);
  });
  it('still aggregates the modules that built', () => {
    expect(out.cleanModules).toEqual(['mA']);
    expect(out.perModule.map((m) => m.moduleId)).toEqual(['mB']);
    expect(out.perCause.equation.movedIds).toBe(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tools/__tests__/analyze-order-causes.test.js`
Expected: FAIL — `analyzeModuleOrder` not exported.

- [ ] **Step 3: Add `analyzeModuleOrder` + imports**

At the top of `tools/analyze-order-causes.js` add imports and the function (below `classifyMovedIds`):

```js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSegments, formatSegmentsMarkdown } from './cnxml-extract.js';
import { buildCnxml, parseSegments } from './cnxml-inject.js';
import { compareElementOrder } from './cnxml-fidelity-check.js';
import { parseArgs, BOOK_OPTION, CHAPTER_OPTION, MODULE_OPTION, requireBook } from './lib/parseArgs.js';
```

```js
/**
 * Fresh-build one module in memory and classify its element-order drift vs source.
 * @param {string} sourceCnxml
 * @returns {{ moved: string[], counts: Record<string, number>, unresolved: string[] }}
 */
export function analyzeModuleOrder(sourceCnxml) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(sourceCnxml);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  const { cnxml: fresh } = buildCnxml(structure, parsed, equations, sourceCnxml, {}, inlineAttrs);
  const order = compareElementOrder(sourceCnxml, fresh);
  const { counts, unresolved } = classifyMovedIds(sourceCnxml, order.moved);
  return { moved: order.moved, counts, unresolved };
}
```

- [ ] **Step 4: Run to verify the integration test passes**

Run: `npx vitest run tools/__tests__/analyze-order-causes.test.js`
Expected: PASS (all).

- [ ] **Step 5: Add the CLI entry (aggregate + print)**

Append to `tools/analyze-order-causes.js`:

```js
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function discoverChapters(bookDir) {
  const srcRoot = path.join(bookDir, '01-source');
  if (!fs.existsSync(srcRoot)) return [];
  return fs
    .readdirSync(srcRoot)
    .filter((d) => /^ch\d+$/.test(d) || d === 'appendices')
    .sort((a, b) =>
      a === 'appendices' ? 1 : b === 'appendices' ? -1 : a.localeCompare(b, undefined, { numeric: true })
    );
}

function discoverModules(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^m\d+\.cnxml$/.test(f))
    .sort()
    .map((f) => ({ moduleId: f.replace('.cnxml', ''), filename: f }));
}

/**
 * Aggregate per-module order analysis across a book's modules. A module whose
 * `analyze` throws is recorded in `buildFailures` and the loop continues — one
 * unbuildable module must NOT discard the whole-book breakdown. `analyze` is
 * injectable so the resilience/aggregation logic is unit-testable without a
 * real throwing module.
 * @param {{ moduleId: string, source: string }[]} moduleEntries
 * @param {(source: string) => { moved: string[], counts: Record<string, number>, unresolved: string[] }} [analyze]
 * @returns {{ cleanModules: string[], perModule: object[], perCause: object, unresolvedAll: object[], buildFailures: object[] }}
 */
export function aggregateBook(moduleEntries, analyze = analyzeModuleOrder) {
  const perCause = {};        // tag -> { modules: Set, movedIds: number }
  const perModule = [];       // { moduleId, moved, counts, unresolved }
  const cleanModules = [];
  const unresolvedAll = [];
  const buildFailures = [];   // { moduleId, error } — a module that can't build is DATA, not a run-abort

  for (const { moduleId, source } of moduleEntries) {
    let res;
    try {
      res = analyze(source);
    } catch (err) {
      buildFailures.push({ moduleId, error: err.message });
      continue;
    }
    if (res.moved.length === 0) {
      cleanModules.push(moduleId);
      continue;
    }
    perModule.push({ moduleId, moved: res.moved.length, counts: res.counts, unresolved: res.unresolved });
    for (const [tag, n] of Object.entries(res.counts)) {
      perCause[tag] = perCause[tag] || { modules: new Set(), movedIds: 0 };
      perCause[tag].modules.add(moduleId);
      perCause[tag].movedIds += n;
    }
    if (res.unresolved.length) unresolvedAll.push({ moduleId, ids: res.unresolved });
  }
  return { cleanModules, perModule, perCause, unresolvedAll, buildFailures };
}

function main() {
  const args = parseArgs(process.argv.slice(2), [BOOK_OPTION, CHAPTER_OPTION, MODULE_OPTION, { name: 'json', flags: ['--json'], type: 'boolean', default: false }]);
  requireBook(args);
  const bookDir = path.join(REPO_ROOT, 'books', args.book);

  const fmtCh = (c) => (c === 'appendices' ? 'appendices' : `ch${String(c).padStart(2, '0')}`);
  const chapters = args.chapter ? [fmtCh(args.chapter)] : discoverChapters(bookDir);

  // Collect (moduleId, source) entries, then aggregate (resilient) in one place.
  const moduleEntries = [];
  for (const ch of chapters) {
    const srcDir = path.join(bookDir, '01-source', ch);
    let modules = discoverModules(srcDir);
    if (args.module) modules = modules.filter((m) => m.moduleId === args.module);
    for (const mod of modules) {
      moduleEntries.push({ moduleId: mod.moduleId, source: fs.readFileSync(path.join(srcDir, mod.filename), 'utf8') });
    }
  }

  const { cleanModules, perModule, perCause, unresolvedAll, buildFailures } = aggregateBook(moduleEntries);

  const causeRows = Object.entries(perCause)
    .map(([tag, v]) => ({ tag, modules: v.modules.size, movedIds: v.movedIds }))
    .sort((a, b) => b.movedIds - a.movedIds);

  if (args.json) {
    console.log(JSON.stringify({ book: args.book, cleanModuleCount: cleanModules.length, causeRows, perModule, unresolved: unresolvedAll, buildFailures }, null, 2));
    if (cleanModules.length + perModule.length === 0) process.exit(2);
    return;
  }

  console.log(`\nOrder-cause breakdown — ${args.book} (fresh in-memory build)\n${'═'.repeat(56)}`);
  console.log(`Clean modules (moved=0): ${cleanModules.length}`);
  console.log(`Modules with residual reorder: ${perModule.length}`);
  console.log(`Modules that FAILED to build: ${buildFailures.length}\n`);
  console.log(`Cause (element tag)      | modules | moved ids`);
  console.log(`-------------------------|---------|----------`);
  for (const r of causeRows) {
    console.log(`${r.tag.padEnd(24)} | ${String(r.modules).padStart(7)} | ${String(r.movedIds).padStart(8)}`);
  }
  if (unresolvedAll.length) {
    console.log(`\nUNRESOLVED ids (tag not found in source) — investigate:`);
    for (const u of unresolvedAll) console.log(`  ${u.moduleId}: ${u.ids.join(', ')}`);
  }
  console.log(`\nPer-module (residual only):`);
  for (const m of perModule.sort((a, b) => b.moved - a.moved)) {
    const by = Object.entries(m.counts).map(([t, n]) => `${t}:${n}`).join(' ');
    console.log(`  ${m.moduleId.padEnd(8)} moved=${String(m.moved).padStart(3)}  ${by}`);
  }

  if (buildFailures.length) {
    console.log(`\nFAILED TO BUILD (recorded, run continued):`);
    for (const f of buildFailures) console.log(`  ${f.moduleId}: ${f.error}`);
  }

  // Non-zero exit ONLY when nothing at all could be analyzed (a real, total
  // failure) — never on reorders or on some-but-not-all modules failing.
  if (cleanModules.length + perModule.length === 0) process.exit(2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
```

- [ ] **Step 6: Smoke-test the CLI on one chapter**

Run: `node tools/analyze-order-causes.js --book efnafraedi-2e --chapter 15`
Expected: prints the cause table + per-module lines; m68814 appears with `equation` + `media`; exits 0. No files written under `books/` (verify `git status` clean).

- [ ] **Step 7: Run the full analyze test + confirm no book writes**

Run: `npx vitest run tools/__tests__/analyze-order-causes.test.js && git status --porcelain books/`
Expected: tests PASS; `git status` prints nothing (no `books/` changes).

- [ ] **Step 8: Commit**

```bash
git add tools/analyze-order-causes.js tools/__tests__/analyze-order-causes.test.js
git commit -m "feat(tools): analyze-order-causes CLI — fresh-output order-cause breakdown [order-char]"
```

---

### Task 3: Run the analyzer on efnafraedi-2e, write the committed report

**Files:**
- Create: `docs/audit/2026-07-03-fresh-order-cause-breakdown.md`

**Interfaces:**
- Consumes: `node tools/analyze-order-causes.js --book efnafraedi-2e` (and `--json`).

- [ ] **Step 1: Generate the data**

Run: `node tools/analyze-order-causes.js --book efnafraedi-2e | tee /tmp/order-causes.txt`
and: `node tools/analyze-order-causes.js --book efnafraedi-2e --json > /tmp/order-causes.json`
Read both. Note the clean-module count, the per-cause table, any UNRESOLVED ids, and the per-module residuals.

- [ ] **Step 2: Write the report**

Create `docs/audit/2026-07-03-fresh-order-cause-breakdown.md` with these sections (fill every number from the Step-1 run — no placeholders):

1. **Context** — one paragraph: this measures *fresh* (in-memory, post-F1/F4) inject output, not the committed `03-translated`; measured on branch `feat/chem-order-cause-characterization` off F4's #223; the tool is `tools/analyze-order-causes.js`.
2. **Headline split** — clean-module count (transient/section-bug wins, F1 confirmed) vs residual-module count, out of the total analyzed. Contrast with the 51 the warn-only check flags on stale committed output.
3. **Per-cause table** — element tag → # modules, # moved ids (verbatim from the run), sorted by moved ids.
4. **UNRESOLVED ids** — list any (should be none); if present, flag for investigation (they mean the classifier or a synthetic/derived id needs handling).
4b. **FAILED-TO-BUILD modules** — list any modules the tool recorded as unbuildable on fresh build (should be none for efnafraedi, since the full run exits 0 today; if any appear, they are themselves a finding — a module the pipeline can't rebuild cleanly — worth a register note).
5. **Per-cause triage** — for EACH cause in the table, a recommendation: **benign→filter candidate** (e.g. a glossary/term block that legitimately relocates as a unit; a terminal block whose absolute position is not reader-order-meaningful) vs **real-bug→fix candidate** (element genuinely lands in the wrong reading position). Base each call on inspecting 1-2 representative modules' source vs fresh placement for that cause (cite module + id). Where uncertain, say so and mark "needs deeper look" — do not overclaim.
6. **Recommended next step** — given the triage, which of {filter benign in `compareElementOrder`, fix cause X as its own item, small real-deferred allowlist} the evidence points to, as input to the lead's gate decision. This is a recommendation, not a commitment.

- [ ] **Step 3: Sanity-check the report against the data**

Re-read the report beside `/tmp/order-causes.txt`: every number matches the run; every cause in the table has a triage row; no "TBD". Fix inline.

- [ ] **Step 4: Commit**

```bash
git add docs/audit/2026-07-03-fresh-order-cause-breakdown.md
git commit -m "docs(audit): fresh-output order-cause breakdown for efnafraedi-2e [order-char]"
```

---

### Task 4: Verify + log follow-ups

**Files:**
- Modify: `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (register — only if the run surfaced out-of-scope finds, e.g. UNRESOLVED ids or a surprising cause)

- [ ] **Step 1: Full suite from repo root**

Run: `npm test`
Expected: all green (the new tool adds unit + integration tests; nothing else changes).

- [ ] **Step 2: Status validation**

Run: `npm run validate`
Expected: 24/24 (or current known-good).

- [ ] **Step 3: Log follow-ups (only if any)**

If the run surfaced anything out of scope (UNRESOLVED ids, a cause that's clearly a real bug worth its own item), append a dated bullet to the register in `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`. If nothing, skip.

- [ ] **Step 4: Commit (only if Step 3 wrote anything)**

```bash
git add docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md
git commit -m "docs(register): order-cause characterization follow-ups [order-char]"
```

- [ ] **Step 5: Push + open PR**

```bash
git push -u origin feat/chem-order-cause-characterization
gh pr create --base main --title "Order-cause characterization: fresh-output reorder breakdown (oracle-gate item 2 prep)" \
  --body "Read-only diagnostic tool + report. See docs/plans/2026-07-03-order-cause-characterization-{design,plan}.md. Branched off #223 (F4); rebase when it merges. No pipeline/gate change."
```

---

## Self-Review Notes

- **Spec coverage:** tool + `classifyMovedIds` unit tests → Task 1; `analyzeModuleOrder` + CLI + integration test + read-only guarantee → Task 2; committed report with per-cause triage → Task 3; verify + register → Task 4. All spec sections mapped.
- **Diagnostic-not-a-gate** (spec constraint): CLI `main()` never exits non-zero on reorder count; only `process.exit(2)` on a build throw. Matches spec.
- **The one substring-safety subtlety** (an id that is a prefix of another) is covered by Task 1's fourth test — the classify regex requires the exact quoted id (`id="<id>"`), not a bare substring.
- **The report's numbers are measured, not guessed** (Task 3 Step 1 generates them first) — same pattern the F4 plan used for baselines.
