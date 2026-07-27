# C14 — Glossary export runner + blank-side guard: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the terminology DB's glossary actually reach the machine translator — by running the existing exporter from the existing 2h cron, delivering its output through git, and refusing to send Málstaður a glossary entry with a blank side.

**Architecture:** Four independent seams. (1) `formatGlossary` drops blank-sided entries and reports the count through a callback, never through its return value — that value *is* the outbound request body. (2) The exporter gains write-if-changed and a shrink guard so it is safe to run unattended, plus a heartbeat. (3) `scripts/git-backup.sh` invokes it, contained so a failure cannot abort the content backup, and stages `books/*/glossary/` so the output reaches git. (4) `/api/health` gains `checks.glossary_export`, mirroring the C11(b) content-backup check.

**Tech Stack:** Node 22.x (ESM in `tools/`, CommonJS in `server/`), Vitest across three workspaces (`tools`, `server`, `scripts`), better-sqlite3 12, bash.

**Spec:** [`docs/superpowers/specs/2026-07-27-c14-glossary-export-runner-design.md`](../specs/2026-07-27-c14-glossary-export-runner-design.md) — read §2 (verified findings) and §5 (expected first-run refusal) before starting.

## Global Constraints

- **Run `npm test` from the repo ROOT.** It is the authoritative gate — there is no branch protection, so a red PR can still merge and local green is the only real proof.
- **`formatGlossary`'s return object must keep exactly four keys** — `domain`, `sourceLanguage`, `targetLanguage`, `terms`. It becomes `body.glossaries` verbatim (`tools/lib/malstadur-api.js:242` via `filterGlossaryForText`'s spread at `tools/api-translate.js:756-762`). Adding a key ships data to a third party and inflates a payload whose size triggers truncation-retries.
- **`tools/` is ESM, `server/` is CommonJS.** Do not mix. `server/` test files are ESM and reach CJS via `createRequire(import.meta.url)`.
- **Resolve paths against `__dirname` / `import.meta.url`, never `process.cwd()`** — the server runs with `cwd=server/`. This has caused two production bugs (#210, #213).
- **Never add `git fetch` or a rebase to `scripts/git-backup.sh`** — `merge.ours.driver` is registered by `deploy.sh`, not cron, so an unattended rebase wedges prod mid-rebase.
- **Do not write a second exporter.** `server/scripts/export-terminology.js` is the bridge; it is being wired, not replaced.
- **Do not touch `books/*/glossary/*.json` content** in this branch. The shrink guard exists precisely so a stale-looking file is never replaced unseen.
- **Test style:** import `describe/it/expect` explicitly even though `globals: true`, matching the existing suites.
- Lint/format cover `tools/` and `scripts/` only (`eslint tools/ scripts/`, `prettier --check 'tools/**/*.js' 'scripts/**/*.js'`). `server/` is neither linted nor prettier-checked — match surrounding style by hand there.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `tools/lib/malstadur-api.js` (modify `:179`) | Drop blank-sided glossary entries; report via callback | 1 |
| `tools/__tests__/malstadur-glossary-guard.test.js` (create) | `formatGlossary` behaviour + wire-shape invariant | 1 |
| `tools/api-translate.js` (modify `:623`, `:1060-1066`) | Thread `onSkipped` through; print the count | 2 |
| `tools/__tests__/api-translate-glossary-skip.test.js` (create) | Passthrough + transitive `filterGlossaryForText` safety | 2 |
| `server/lib/glossaryExportDecision.js` (create) | **Pure** write-if-changed + shrink decisions, no DB | 3 |
| `server/__tests__/glossaryExportDecision.test.js` (create) | Decision logic | 3 |
| `server/scripts/export-terminology.js` (modify) | `runGlossaryExport` orchestration, heartbeat, exit codes, header fix | 4 |
| `server/__tests__/glossaryExportRun.test.js` (create) | Orchestration with an injected fake exporter — no DB | 4 |
| `server/lib/glossaryExportHealth.js` (create) | Heartbeat staleness → health verdict | 5 |
| `server/__tests__/glossaryExportHealth.test.js` (create) | Health lib | 5 |
| `server/index.js` (modify `:335`) | Wire `checks.glossary_export` | 5 |
| `scripts/git-backup.sh` (modify `:86-118`) | Contained export call + `books/*/glossary/` pathspec | 6 |
| `scripts/__tests__/git-backup.test.mjs` (modify) | Behavioural: containment + staging | 6 |
| `CLAUDE.md`, `docs/technical/architecture.md`, register, memory | Correct the false wiring claims | 7 |

Tasks 1→2 are ordered (2 consumes 1). Tasks 3→4→5 are ordered. Task 6 is independent of 1–5 in code but is verified last. Task 7 is last.

---

### Task 1: `formatGlossary` drops blank-sided entries

**Files:**
- Modify: `tools/lib/malstadur-api.js:168-192` (the `formatGlossary` function and its JSDoc)
- Test: `tools/__tests__/malstadur-glossary-guard.test.js` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `formatGlossary(terms, { domain?: string, approvedOnly?: boolean, onSkipped?: (dropped: Array<object>) => void })` → `{domain: string, sourceLanguage: 'en', targetLanguage: 'is', terms: Array<{sourceWord: string, targetWord: string}>}`. `onSkipped` is called **once**, with the array of dropped input entries, only when at least one was dropped. The return object has **exactly four keys**. Task 2 consumes `onSkipped`.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/malstadur-glossary-guard.test.js`:

```js
/**
 * formatGlossary must never send Málstaður a glossary entry with a blank
 * side (register C14).
 *
 * WHY: a blank `targetWord` 400s the WHOLE request, so one malformed row
 * kills an entire paid translation chunk. Dropping it costs one term of MT
 * priming; sending it costs the batch.
 *
 * Blank sides are reachable in practice, two ways:
 *   - tools/merge-glossary.js:347 writes `icelandic: ''` for needs_review
 *     terms straight into glossary-unified.json, bypassing the DB entirely.
 *   - terminologyService.js:1501 validates with `!icelandic`, and `!' '` is
 *     false — so a whitespace-only Icelandic side passes and can be approved.
 *
 * ⚠️ The returned object IS the outbound request body (malstadur-api.js:242
 * assigns it to body.glossaries, via filterGlossaryForText's spread). The
 * wire-shape test below is what stops a future "just add a count field"
 * from shipping data to a third party.
 */

import { describe, it, expect } from 'vitest';
import { formatGlossary } from '../lib/malstadur-api.js';

const ok = (english, icelandic) => ({ english, icelandic, status: 'approved' });

describe('formatGlossary blank-side guard', () => {
  it('keeps a well-formed approved term', () => {
    const g = formatGlossary([ok('water', 'vatn')]);
    expect(g.terms).toEqual([{ sourceWord: 'water', targetWord: 'vatn' }]);
  });

  it('drops a term whose Icelandic side is an empty string', () => {
    const g = formatGlossary([ok('water', 'vatn'), ok('ether', '')]);
    expect(g.terms).toEqual([{ sourceWord: 'water', targetWord: 'vatn' }]);
  });

  it('drops a term whose Icelandic side is whitespace only', () => {
    // The exact hole terminologyService's `!icelandic` check leaves open.
    const g = formatGlossary([ok('water', 'vatn'), ok('ether', '   ')]);
    expect(g.terms).toHaveLength(1);
  });

  it('drops a term whose Icelandic side is null', () => {
    const g = formatGlossary([ok('water', 'vatn'), ok('ether', null)]);
    expect(g.terms).toHaveLength(1);
  });

  it('drops a term whose English side is blank', () => {
    const g = formatGlossary([ok('water', 'vatn'), ok('  ', 'eter')]);
    expect(g.terms).toHaveLength(1);
  });

  it('drops a term whose English side is null', () => {
    const g = formatGlossary([ok('water', 'vatn'), ok(null, 'eter')]);
    expect(g.terms).toHaveLength(1);
  });

  it('drops a term whose side is a non-string, rather than coercing it', () => {
    // String({}) is '[object Object]' and String(['a']) is 'a' — both survive
    // a trim check and would be sent to Málstaður as plausible-looking words.
    // Blankness is not the only malformation; wrong type must drop too.
    const g = formatGlossary([
      ok('water', 'vatn'),
      ok('ether', {}),
      ok('acid', ['syra']),
      ok(42, 'fjörutíu og tveir'),
    ]);
    expect(g.terms).toEqual([{ sourceWord: 'water', targetWord: 'vatn' }]);
  });

  it('trims surviving entries on both sides', () => {
    const g = formatGlossary([ok('  water  ', '  vatn  ')]);
    expect(g.terms).toEqual([{ sourceWord: 'water', targetWord: 'vatn' }]);
  });

  it('calls onSkipped once with exactly the dropped entries', () => {
    const bad = ok('ether', '');
    const calls = [];
    formatGlossary([ok('water', 'vatn'), bad], { onSkipped: (d) => calls.push(d) });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual([bad]);
  });

  it('does not call onSkipped when nothing was dropped', () => {
    let called = false;
    formatGlossary([ok('water', 'vatn')], { onSkipped: () => (called = true) });
    expect(called).toBe(false);
  });

  it('works without an onSkipped callback', () => {
    expect(() => formatGlossary([ok('ether', '')])).not.toThrow();
  });

  it('still filters by approved status, and blank-drops within that', () => {
    const g = formatGlossary([
      ok('water', 'vatn'),
      { english: 'ether', icelandic: 'eter', status: 'needs_review' },
      ok('acid', ''),
    ]);
    expect(g.terms).toEqual([{ sourceWord: 'water', targetWord: 'vatn' }]);
  });

  it('honours approvedOnly:false and still drops blanks', () => {
    const g = formatGlossary(
      [
        { english: 'ether', icelandic: 'eter', status: 'needs_review' },
        { english: 'acid', icelandic: '', status: 'needs_review' },
      ],
      { approvedOnly: false }
    );
    expect(g.terms).toEqual([{ sourceWord: 'ether', targetWord: 'eter' }]);
  });

  it('WIRE SHAPE: the returned object has exactly the four API keys', () => {
    // This object is assigned verbatim to body.glossaries. Any extra key is
    // sent to Málstaður and counts against the char budget that triggers
    // truncation-retries. The skip count must ride on onSkipped instead.
    const g = formatGlossary([ok('water', 'vatn'), ok('ether', '')], { onSkipped: () => {} });
    expect(Object.keys(g).sort()).toEqual([
      'domain',
      'sourceLanguage',
      'targetLanguage',
      'terms',
    ]);
  });

  it('preserves the domain label', () => {
    const g = formatGlossary([ok('cell', 'fruma')], { domain: 'biology' });
    expect(g.domain).toBe('biology');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tools/__tests__/malstadur-glossary-guard.test.js`

Expected: FAIL. The blank-drop tests fail with received `terms` still containing the blank entries; `onSkipped` tests fail because the option is ignored.

- [ ] **Step 3: Write the implementation**

Replace `tools/lib/malstadur-api.js:168-192` (the `// ─── Glossary Helpers ───` comment through the end of `formatGlossary`) with:

```js
// ─── Glossary Helpers ───────────────────────────────────────────────

/**
 * Convert project glossary terms to API glossary format.
 *
 * Malformed entries are DROPPED rather than sent: a blank side (empty or
 * whitespace-only) or a non-string side on either `english` or `icelandic`.
 * Málstaður rejects a glossary containing a blank word with a 400 that fails
 * the WHOLE request, so one malformed row would kill an entire paid
 * translation chunk. Dropping costs one term of MT priming; sending costs the
 * batch. The count is surfaced by `options.onSkipped` so the loss is visible,
 * not silent.
 *
 * The type check is not pedantry: `String({})` is '[object Object]' and
 * `String(['a'])` is 'a', so a coercing guard would pass wrong-typed values
 * through as plausible-looking words. This is a boundary function taking
 * arbitrary arrays from two producers plus an audit harness.
 *
 * ⚠️ The returned object IS the outbound request body — filterGlossaryForText
 * spreads it and this module assigns it to `body.glossaries`. Do NOT add keys
 * to it: they would be sent to a third party and count against the character
 * budget whose overflow triggers a truncation-retry. Report out-of-band.
 *
 * @param {Array<{english: string, icelandic: string, status?: string}>} terms
 * @param {object} [options]
 * @param {string} [options.domain='chemistry'] - Domain label for the glossary
 * @param {boolean} [options.approvedOnly=true] - Only include approved terms
 * @param {(dropped: Array<object>) => void} [options.onSkipped] - Called once with
 *   the dropped entries, when any were dropped. Reporting channel only.
 * @returns {{domain: string, sourceLanguage: string, targetLanguage: string,
 *   terms: Array<{sourceWord: string, targetWord: string}>}} API-formatted glossary
 */
function formatGlossary(terms, { domain = 'chemistry', approvedOnly = true, onSkipped } = {}) {
  const filtered = approvedOnly ? terms.filter((t) => t.status === 'approved') : terms;

  const usable = [];
  const skipped = [];
  for (const t of filtered) {
    const sourceWord = typeof t.english === 'string' ? t.english.trim() : '';
    const targetWord = typeof t.icelandic === 'string' ? t.icelandic.trim() : '';
    if (!sourceWord || !targetWord) {
      skipped.push(t);
      continue;
    }
    usable.push({ sourceWord, targetWord });
  }

  if (skipped.length > 0 && typeof onSkipped === 'function') {
    onSkipped(skipped);
  }

  return {
    domain,
    sourceLanguage: 'en',
    targetLanguage: 'is',
    terms: usable,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tools/__tests__/malstadur-glossary-guard.test.js`
Expected: PASS, 15 tests.

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test` (from the repo root), then `npm run lint && npm run format:check`
Expected: all green. `tools/api-translate.test.js` exercises `loadGlossary`; confirm it still passes.

- [ ] **Step 6: Commit**

```bash
git add tools/lib/malstadur-api.js tools/__tests__/malstadur-glossary-guard.test.js
git commit -m "fix(C14): drop blank-sided glossary entries instead of 400ing the batch

A blank targetWord fails the WHOLE Malstadur request, so one malformed row
killed an entire paid translation chunk. Reachable two ways: merge-glossary
writes icelandic:'' for needs_review terms, and terminologyService's
!icelandic check admits whitespace-only values that can then be approved.

The count rides on a new onSkipped callback, NOT the return value: that
object is assigned verbatim to body.glossaries, so an extra key would be
sent to a third party and count against the truncation-retry char budget.
Pinned by a wire-shape test.

formatGlossary had zero test coverage before this."
```

---

### Task 2: Thread the skip count to the operator

**Files:**
- Modify: `tools/api-translate.js:623-635` (`loadGlossary`) and `:1059-1067` (the glossary print in `main`)
- Test: `tools/__tests__/api-translate-glossary-skip.test.js` (create)

**Interfaces:**
- Consumes: `formatGlossary`'s `options.onSkipped` from Task 1.
- Produces: `loadGlossary(glossaryDir: string, domain: string, options?: {onSkipped?: (dropped: Array<object>) => void})` — third parameter is **optional and additive**; the two existing external callers (`docs/audit/b1-glossary-probe.mjs:46`, `tools/test-glossary-comparison.js`) keep working unchanged.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/api-translate-glossary-skip.test.js`:

```js
/**
 * loadGlossary must surface how many glossary entries it dropped, and a
 * dropped entry must never reach filterGlossaryForText (register C14).
 *
 * The second half is the one that rots: filterGlossaryForText calls
 * t.sourceWord.toLowerCase() (api-translate.js:759), which TypeErrors on a
 * null English side rather than 400ing. Task 1's guard fixes that
 * transitively — "transitively" is exactly the kind of claim that stops
 * being true when someone adds a second path, so it is asserted here
 * directly instead of assumed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadGlossary, filterGlossaryForText } from '../api-translate.js';
import { formatGlossary } from '../lib/malstadur-api.js';

let dir;

function writeGlossary(terms) {
  const g = path.join(dir, 'glossary');
  mkdirSync(g, { recursive: true });
  writeFileSync(path.join(g, 'glossary-unified.json'), JSON.stringify({ terms }));
  return g;
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'c14-glossary-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('loadGlossary skip reporting', () => {
  it('reports the dropped entries through onSkipped', () => {
    const g = writeGlossary([
      { english: 'water', icelandic: 'vatn', status: 'approved' },
      { english: 'ether', icelandic: '', status: 'approved' },
    ]);
    let dropped = null;
    const glossary = loadGlossary(g, 'chemistry', { onSkipped: (d) => (dropped = d) });
    expect(glossary.terms).toHaveLength(1);
    expect(dropped).toHaveLength(1);
    expect(dropped[0].english).toBe('ether');
  });

  it('does not call onSkipped when every term is well-formed', () => {
    const g = writeGlossary([{ english: 'water', icelandic: 'vatn', status: 'approved' }]);
    let called = false;
    loadGlossary(g, 'chemistry', { onSkipped: () => (called = true) });
    expect(called).toBe(false);
  });

  it('still works when called with the old two-argument signature', () => {
    // b1-glossary-probe.mjs and test-glossary-comparison.js call it this way.
    const g = writeGlossary([{ english: 'water', icelandic: 'vatn', status: 'approved' }]);
    const glossary = loadGlossary(g, 'chemistry');
    expect(glossary.terms).toEqual([{ sourceWord: 'water', targetWord: 'vatn' }]);
  });

  it('returns null when every approved term was dropped as blank', () => {
    const g = writeGlossary([{ english: 'ether', icelandic: '   ', status: 'approved' }]);
    expect(loadGlossary(g, 'chemistry')).toBeNull();
  });
});

describe('transitive safety: filterGlossaryForText never sees a blank side', () => {
  it('does not throw on a glossary built from a null-English term', () => {
    // Before the Task 1 guard this threw TypeError: Cannot read properties
    // of null (reading 'toLowerCase') at api-translate.js:759.
    const g = formatGlossary(
      [
        { english: null, icelandic: 'vatn', status: 'approved' },
        { english: 'water', icelandic: 'vatn', status: 'approved' },
      ],
      { approvedOnly: true }
    );
    expect(() => filterGlossaryForText(g, 'water is wet')).not.toThrow();
    expect(filterGlossaryForText(g, 'water is wet').terms).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tools/__tests__/api-translate-glossary-skip.test.js`
Expected: FAIL — `onSkipped` tests fail because `loadGlossary` takes only two parameters and ignores the third.

(The transitive test may already pass from Task 1. That is fine and expected — it is a regression pin, not a driver.)

- [ ] **Step 3: Write the implementation**

Replace `tools/api-translate.js:619-635` with:

```js
/**
 * Load glossary from a book's glossary directory.
 * Returns API-formatted glossary object or null if unavailable.
 *
 * `options.onSkipped` is forwarded to formatGlossary and receives any entries
 * dropped for having a blank English or Icelandic side (register C14), so the
 * caller can report the loss instead of it being silent.
 *
 * @param {string} glossaryDir
 * @param {string} domain
 * @param {{onSkipped?: (dropped: Array<object>) => void}} [options]
 */
export function loadGlossary(glossaryDir, domain, { onSkipped } = {}) {
  const glossaryPath = path.join(glossaryDir, 'glossary-unified.json');
  if (!fs.existsSync(glossaryPath)) return null;

  let dropped = null;
  let glossary;
  try {
    const data = JSON.parse(fs.readFileSync(glossaryPath, 'utf8'));
    // An inner callback that CANNOT throw, so the caller's callback never
    // runs inside this catch-all. Handing `onSkipped` straight to
    // formatGlossary would mean a throwing caller callback is swallowed and
    // returned as `null` — indistinguishable from corrupt JSON, and a
    // fail-loud violation.
    glossary = formatGlossary(data.terms || [], {
      domain,
      approvedOnly: true,
      onSkipped: (d) => {
        dropped = d;
      },
    });
  } catch {
    return null;
  }

  // BEFORE the empty-check, deliberately. When every approved term is
  // malformed, terms.length is 0 and this function returns null — and the
  // caller then prints "none available", the same message as having no
  // glossary file at all. Reporting first is what keeps the worst case
  // (a wholly corrupt glossary) from reading as the benign one.
  if (dropped && typeof onSkipped === 'function') onSkipped(dropped);

  if (glossary.terms.length === 0) return null;
  return glossary;
}
```

Then replace `tools/api-translate.js:1059-1067` (the `// Load glossary` block in `main`) with:

```js
  // Load glossary
  let glossary = null;
  if (!args.noGlossary) {
    const domain = bookToDomain(args.book);
    let skippedCount = 0;
    glossary = loadGlossary(path.join(BOOKS_DIR, 'glossary'), domain, {
      onSkipped: (dropped) => {
        skippedCount = dropped.length;
      },
    });
    console.log(glossaryStatusLine(glossary, skippedCount));
  }
```

…where `glossaryStatusLine` is a new exported function beside `loadGlossary`:

```js
/**
 * The operator-facing glossary line. Extracted from main() so the total-drop
 * case is testable: a glossary whose every approved term was malformed loads
 * as null, and without the count this line is identical to the one printed
 * when there is no glossary file at all — the worst case rendered
 * indistinguishable from the benign one.
 *
 * Surfacing the count at the MT stage is deliberate: the same reasoning as
 * countInlineMarkers — a data defect must be visible where it happens, not
 * inferred three stages downstream from bad output.
 */
export function glossaryStatusLine(glossary, skippedCount) {
  const skipNote = skippedCount > 0 ? ` (${skippedCount} malformed skipped)` : '';
  return glossary
    ? `Glossary: ${glossary.terms.length} approved ${glossary.domain} terms${skipNote}`
    : `Glossary: none available${skipNote} (continuing without)`;
}
```

⚠️ **The extraction is not cosmetic.** `main` is not exported, so a `console.log` edit inside it cannot be unit-tested — an Important finding must not be fixed by an untestable change. Note also that a test asserting `loadGlossary` reports drops in the total-drop case **passes without any fix** (`formatGlossary` fires `onSkipped` internally before `loadGlossary` reaches its empty-check), so such a test is a *preservation* pin, not a driver. `glossaryStatusLine` is where the real defect lives and where the driving test belongs.
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tools/__tests__/api-translate-glossary-skip.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Run the full suite and lint**

Run: `npm test`, then `npm run lint && npm run format:check`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add tools/api-translate.js tools/__tests__/api-translate-glossary-skip.test.js
git commit -m "feat(C14): report dropped glossary entries at the MT stage

loadGlossary forwards an optional onSkipped to formatGlossary and
api-translate prints the count next to the term total, so a malformed
glossary row is visible where it happens rather than inferred later from
bad output. The third parameter is additive - the b1 probe and
test-glossary-comparison keep their two-argument calls.

Also pins the transitive fix: filterGlossaryForText does
t.sourceWord.toLowerCase() and TypeErrored on a null English side. The
Task 1 guard prevents that reaching it; asserted rather than assumed."
```

---

### Task 3: Pure export decision logic

**Files:**
- Create: `server/lib/glossaryExportDecision.js`
- Test: `server/__tests__/glossaryExportDecision.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (all CommonJS exports, all pure, **no DB and no filesystem**):
  - `countApproved(data: object|null) => number`
  - `sameTerms(prev: object|null, next: object) => boolean`
  - `shrinkVerdict(prev: object|null, next: object) => {refuse: boolean, prevApproved: number, nextApproved: number}`
  - `SHRINK_RATIO: number` (0.5)

  Task 4 consumes all four.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/glossaryExportDecision.test.js`:

```js
/**
 * Decision logic for the unattended glossary export (register C14).
 *
 * Two jobs, both load-bearing once the export runs from the 2h cron:
 *
 * 1. WRITE-IF-CHANGED. exportBookGlossary stamps a fresh `generated`
 *    timestamp every run (terminologyService.js:1581), so without this the
 *    file would be dirty every cycle: ~4,380 timestamp-only commits a year,
 *    and git-backup.sh's healthy "nothing to commit" path would never fire
 *    again.
 *
 * 2. SHRINK GUARD. The committed glossary-unified.json files were written by
 *    tools/merge-glossary.js, NOT by this exporter — so cron-ing it swaps
 *    producers rather than refreshing. Migration 032 dropped the table
 *    merge-glossary still writes to, and exportBookGlossary is deliberately
 *    subject-strict, so chemistry could go from 617 approved terms to near
 *    zero silently. This turns that into a loud refusal.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  countApproved,
  sameTerms,
  shrinkVerdict,
  SHRINK_RATIO,
} = require('../lib/glossaryExportDecision');

const approved = (n) =>
  Array.from({ length: n }, (_, i) => ({
    english: `t${i}`,
    icelandic: `i${i}`,
    status: 'approved',
  }));

const payload = (terms, generated = '2026-01-01T00:00:00.000Z') => ({
  generated,
  book: 'prufubok',
  stats: {},
  terms,
});

describe('countApproved', () => {
  it('counts only approved terms', () => {
    expect(
      countApproved(
        payload([
          { english: 'a', icelandic: 'a', status: 'approved' },
          { english: 'b', icelandic: 'b', status: 'needs_review' },
        ])
      )
    ).toBe(1);
  });

  it('returns 0 for null', () => {
    expect(countApproved(null)).toBe(0);
  });

  it('returns 0 when terms is missing or not an array', () => {
    expect(countApproved({ terms: 'nope' })).toBe(0);
    expect(countApproved({})).toBe(0);
  });
});

describe('sameTerms', () => {
  it('is true when only the generated stamp differs', () => {
    const terms = approved(3);
    expect(sameTerms(payload(terms, '2026-01-01T00:00:00.000Z'), payload(terms, '2026-07-27T09:00:00.000Z'))).toBe(true);
  });

  it('is false when a term changed', () => {
    const prev = payload(approved(3));
    const next = payload([...approved(2), { english: 't2', icelandic: 'BREYTT', status: 'approved' }]);
    expect(sameTerms(prev, next)).toBe(false);
  });

  it('is false when a term was added', () => {
    expect(sameTerms(payload(approved(3)), payload(approved(4)))).toBe(false);
  });

  it('is false when there is no previous payload (nothing to compare)', () => {
    expect(sameTerms(null, payload(approved(3)))).toBe(false);
  });

  it('is false when the previous payload has no terms array', () => {
    expect(sameTerms({ generated: 'x' }, payload(approved(1)))).toBe(false);
  });
});

describe('shrinkVerdict', () => {
  it('does not refuse when there is no previous file', () => {
    expect(shrinkVerdict(null, payload(approved(5))).refuse).toBe(false);
  });

  it('does not refuse when the previous file had no approved terms', () => {
    // liffraedi-2e today: 2262 terms, all needs_review.
    const prev = payload([{ english: 'a', icelandic: 'a', status: 'needs_review' }]);
    expect(shrinkVerdict(prev, payload([])).refuse).toBe(false);
  });

  it('does not refuse on growth', () => {
    expect(shrinkVerdict(payload(approved(100)), payload(approved(200))).refuse).toBe(false);
  });

  it('does not refuse on modest shrinkage (an editor un-approving terms)', () => {
    expect(shrinkVerdict(payload(approved(100)), payload(approved(80))).refuse).toBe(false);
  });

  it('REFUSES when approved terms fall below half', () => {
    const v = shrinkVerdict(payload(approved(617)), payload(approved(100)));
    expect(v.refuse).toBe(true);
    expect(v.prevApproved).toBe(617);
    expect(v.nextApproved).toBe(100);
  });

  it('REFUSES the empty-DB case outright', () => {
    // Running the exporter from a dev checkout, whose sessions.db has ~0
    // approved terms, would otherwise blank the committed export.
    expect(shrinkVerdict(payload(approved(617)), payload([])).refuse).toBe(true);
  });

  it('does not refuse exactly at the ratio boundary', () => {
    expect(shrinkVerdict(payload(approved(100)), payload(approved(50))).refuse).toBe(false);
  });

  it('refuses just below the ratio boundary', () => {
    expect(shrinkVerdict(payload(approved(100)), payload(approved(49))).refuse).toBe(true);
  });

  it('exposes the ratio as a named constant', () => {
    expect(SHRINK_RATIO).toBe(0.5);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run server/__tests__/glossaryExportDecision.test.js`
Expected: FAIL — `Cannot find module '../lib/glossaryExportDecision'`.

- [ ] **Step 3: Write the implementation**

Create `server/lib/glossaryExportDecision.js`:

```js
/**
 * Decision logic for the unattended glossary export (register C14).
 *
 * Pure by design — no DB, no filesystem — so the two rules that make the
 * export safe to run from cron can be tested without a sessions.db.
 *
 * WRITE-IF-CHANGED: exportBookGlossary stamps a fresh `generated` timestamp
 * on every call (terminologyService.js:1581). Once books/*\/glossary/ is
 * staged by scripts/git-backup.sh, that stamp alone would make the file
 * dirty every 2h — ~4,380 timestamp-only commits a year — and git-backup's
 * healthy "nothing to commit" path would never fire again.
 *
 * SHRINK GUARD: the committed glossary-unified.json files were produced by
 * tools/merge-glossary.js, not by this exporter, so cron-ing it SWAPS
 * PRODUCERS rather than refreshing. Migration 032 dropped the
 * terminology_terms table merge-glossary still writes to, and
 * exportBookGlossary is deliberately subject-strict (item 18), so the new
 * export can legitimately be far smaller than the file it replaces —
 * chemistry could go from 617 approved terms to near zero, silently
 * degrading MT for weeks. The guard makes that a loud refusal instead.
 */

/** Approved terms are what actually primes MT (api-translate loads approvedOnly). */
function countApproved(data) {
  if (!data || !Array.isArray(data.terms)) return 0;
  return data.terms.filter((t) => t && t.status === 'approved').length;
}

/**
 * True when the two payloads carry identical term content, ignoring
 * `generated`. Serialization order is stable because exportBookGlossary
 * orders by `h.english COLLATE NOCASE ASC` and builds each term from one
 * object literal; a payload written by a different producer simply compares
 * unequal, which is the correct outcome (the shrink guard then decides).
 */
function sameTerms(prev, next) {
  if (!prev || !Array.isArray(prev.terms)) return false;
  if (!next || !Array.isArray(next.terms)) return false;
  return JSON.stringify(prev.terms) === JSON.stringify(next.terms);
}

/**
 * Deliberately loose: it targets catastrophe, not drift. Legitimate
 * shrinkage happens — a head editor un-approves, or item-18 subject scoping
 * tightens — and refusing on those would train people to pass --force.
 */
const SHRINK_RATIO = 0.5;

/**
 * @returns {{refuse: boolean, prevApproved: number, nextApproved: number}}
 */
function shrinkVerdict(prev, next) {
  const prevApproved = countApproved(prev);
  const nextApproved = countApproved(next);
  // No baseline of approved terms to protect: nothing can be lost.
  if (prevApproved === 0) return { refuse: false, prevApproved, nextApproved };
  return { refuse: nextApproved < prevApproved * SHRINK_RATIO, prevApproved, nextApproved };
}

module.exports = { countApproved, sameTerms, shrinkVerdict, SHRINK_RATIO };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/__tests__/glossaryExportDecision.test.js`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add server/lib/glossaryExportDecision.js server/__tests__/glossaryExportDecision.test.js
git commit -m "feat(C14): pure write-if-changed and shrink-guard decisions

Two rules that make the glossary export safe to run unattended, kept pure
so they test without a sessions.db.

Write-if-changed: exportBookGlossary stamps a fresh `generated` every call,
so staging books/*/glossary/ would otherwise mean ~4,380 timestamp-only
commits a year and git-backup's healthy 'nothing to commit' path never
firing again.

Shrink guard: the committed exports came from merge-glossary.js, not this
exporter, so cron-ing it swaps producers. Migration 032 dropped the table
merge-glossary writes to and exportBookGlossary is subject-strict, so
chemistry could drop from 617 approved terms to near zero unseen. 50% is
deliberately loose - catastrophe, not drift."
```

---

### Task 4: Exporter orchestration, heartbeat, exit codes

**Files:**
- Modify: `server/scripts/export-terminology.js` (whole file)
- Test: `server/__tests__/glossaryExportRun.test.js` (create)

**Interfaces:**
- Consumes: `countApproved`, `sameTerms`, `shrinkVerdict` from Task 3.
- Produces: `runGlossaryExport(options) => number` (an exit code), exported from `server/scripts/export-terminology.js` alongside the existing `listBooks`. Options: `{booksDir?, projectRoot?, exportFn?, book?, force?, dryRun?, log?, logError?}`. `exportFn(bookSlug) => payload` is injected so tests need no DB. Task 6 consumes the CLI entry point only.
- **Heartbeat path produced for Task 5:** `pipeline-output/.last-glossary-export`, relative to `projectRoot`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/glossaryExportRun.test.js`:

```js
/**
 * Orchestration of the unattended glossary export (register C14).
 *
 * The real exporter is injected as `exportFn`, so none of this touches a
 * sessions.db. What is under test is the contract scripts/git-backup.sh and
 * /api/health depend on:
 *
 *   exit 0  <=> every book resolved healthily  <=> heartbeat written
 *
 * The heartbeat follows the C11(b) doctrine: written ONLY on a healthy run,
 * so absence is the alarm. A status file written on every outcome would read
 * "success" forever once the exporter stopped working.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { runGlossaryExport } = require('../scripts/export-terminology');

let root;

const approved = (n) =>
  Array.from({ length: n }, (_, i) => ({
    english: `t${i}`,
    icelandic: `i${i}`,
    status: 'approved',
  }));

const payload = (terms, generated = '2026-07-27T09:00:00.000Z') => ({
  generated,
  book: 'prufubok',
  stats: {},
  terms,
});

/** Create books/<slug>/glossary/, optionally with an existing export. */
function seedBook(slug, existing) {
  const dir = path.join(root, 'books', slug, 'glossary');
  mkdirSync(dir, { recursive: true });
  if (existing !== undefined) {
    writeFileSync(path.join(dir, 'glossary-unified.json'), existing);
  }
}

function readExport(slug) {
  return JSON.parse(
    readFileSync(path.join(root, 'books', slug, 'glossary', 'glossary-unified.json'), 'utf8')
  );
}

function heartbeatExists() {
  return existsSync(path.join(root, 'pipeline-output', '.last-glossary-export'));
}

function run(opts) {
  return runGlossaryExport({
    booksDir: path.join(root, 'books'),
    projectRoot: root,
    log: () => {},
    logError: () => {},
    ...opts,
  });
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'c14-export-'));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('runGlossaryExport — writing', () => {
  it('writes a first export when no file exists, and returns 0', () => {
    seedBook('prufubok');
    const code = run({ exportFn: () => payload(approved(5)) });
    expect(code).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(5);
  });

  it('writes when the term content changed', () => {
    seedBook('prufubok', JSON.stringify(payload(approved(5))));
    expect(run({ exportFn: () => payload(approved(6)) })).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(6);
  });

  it('does NOT rewrite when only the generated stamp differs', () => {
    const before = JSON.stringify(payload(approved(5), '2026-01-01T00:00:00.000Z'));
    seedBook('prufubok', before);
    const code = run({ exportFn: () => payload(approved(5), '2026-07-27T09:00:00.000Z') });
    expect(code).toBe(0);
    const after = readFileSync(
      path.join(root, 'books', 'prufubok', 'glossary', 'glossary-unified.json'),
      'utf8'
    );
    expect(after).toBe(before);
  });

  it('treats an unparseable existing file as no baseline and writes', () => {
    // Refusing here would wedge the exporter forever on a corrupt file it is
    // perfectly capable of replacing.
    seedBook('prufubok', 'not json {{{');
    expect(run({ exportFn: () => payload(approved(5)) })).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(5);
  });

  it('ROUND TRIP: a second identical run writes nothing and leaves the bytes alone', () => {
    // The synthetic write-if-changed test compares two in-memory payloads.
    // This exercises the real path — write, JSON.parse back off disk, compare
    // — because that is the run that must produce no commit. If the round
    // trip perturbs key order or number formatting, the file is dirty every
    // 2h and nobody finds out until prod has thousands of empty commits.
    seedBook('prufubok');
    const exportFn = () => payload(approved(5));
    expect(run({ exportFn })).toBe(0);
    const afterFirst = readFileSync(
      path.join(root, 'books', 'prufubok', 'glossary', 'glossary-unified.json'),
      'utf8'
    );

    expect(run({ exportFn })).toBe(0);
    const afterSecond = readFileSync(
      path.join(root, 'books', 'prufubok', 'glossary', 'glossary-unified.json'),
      'utf8'
    );
    expect(afterSecond).toBe(afterFirst);
  });
});

describe('runGlossaryExport — shrink guard', () => {
  it('refuses a catastrophic shrink, writes nothing, and returns 1', () => {
    const before = JSON.stringify(payload(approved(617)));
    seedBook('prufubok', before);
    const code = run({ exportFn: () => payload(approved(3)) });
    expect(code).toBe(1);
    const after = readFileSync(
      path.join(root, 'books', 'prufubok', 'glossary', 'glossary-unified.json'),
      'utf8'
    );
    expect(after).toBe(before);
  });

  it('logs both counts when it refuses', () => {
    seedBook('prufubok', JSON.stringify(payload(approved(617))));
    const errors = [];
    run({ exportFn: () => payload(approved(3)), logError: (m) => errors.push(m) });
    expect(errors.join('\n')).toMatch(/617/);
    expect(errors.join('\n')).toMatch(/3/);
  });

  it('--force overrides the refusal and writes', () => {
    seedBook('prufubok', JSON.stringify(payload(approved(617))));
    expect(run({ exportFn: () => payload(approved(3)), force: true })).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(3);
  });
});

describe('runGlossaryExport — exit code and heartbeat contract', () => {
  it('writes the heartbeat on a fully healthy run', () => {
    seedBook('prufubok');
    run({ exportFn: () => payload(approved(5)) });
    expect(heartbeatExists()).toBe(true);
  });

  it('writes the heartbeat when every book was legitimately unchanged', () => {
    // "Nothing changed" is a working exporter, not a stalled one — same
    // semantics as git-backup.sh's no_changes healthy path.
    seedBook('prufubok', JSON.stringify(payload(approved(5))));
    run({ exportFn: () => payload(approved(5)) });
    expect(heartbeatExists()).toBe(true);
  });

  it('does NOT write the heartbeat when a book was refused', () => {
    seedBook('prufubok', JSON.stringify(payload(approved(617))));
    run({ exportFn: () => payload(approved(3)) });
    expect(heartbeatExists()).toBe(false);
  });

  it('does NOT write the heartbeat when the exporter threw', () => {
    seedBook('prufubok');
    const code = run({
      exportFn: () => {
        throw new Error('DB is locked');
      },
    });
    expect(code).toBe(1);
    expect(heartbeatExists()).toBe(false);
  });

  it('processes remaining books after one is refused', () => {
    seedBook('bok-a', JSON.stringify(payload(approved(617))));
    seedBook('bok-b');
    const code = run({
      exportFn: (slug) => (slug === 'bok-a' ? payload(approved(3)) : payload(approved(9))),
    });
    expect(code).toBe(1); // bok-a failed
    expect(readExport('bok-b').terms).toHaveLength(9); // bok-b still ran
  });

  it('returns 1 and writes no heartbeat when NO books are discovered', () => {
    // An empty set means book discovery is broken, not that there is no
    // work. Reporting healthy here would hide a mis-resolved booksDir
    // forever — the exact shape of failure the health check exists to catch.
    mkdirSync(path.join(root, 'books'), { recursive: true });
    expect(run({ exportFn: () => payload(approved(5)) })).toBe(1);
    expect(heartbeatExists()).toBe(false);
  });

  it('only exports books that have a glossary directory', () => {
    seedBook('med-glossary');
    mkdirSync(path.join(root, 'books', 'an-glossary'), { recursive: true });
    const seen = [];
    run({
      exportFn: (slug) => {
        seen.push(slug);
        return payload(approved(1));
      },
    });
    expect(seen).toEqual(['med-glossary']);
  });

  it('--book targets a single book', () => {
    seedBook('bok-a');
    seedBook('bok-b');
    const seen = [];
    run({
      book: 'bok-a',
      exportFn: (slug) => {
        seen.push(slug);
        return payload(approved(1));
      },
    });
    expect(seen).toEqual(['bok-a']);
  });

  it('--book on a slug with no glossary directory fails instead of creating one', () => {
    // The write path mkdirSync's recursively, so without this check a typo'd
    // slug would CREATE books/<typo>/glossary/ and write an empty export
    // there — and the shrink guard could not stop it, because a brand new
    // path has no baseline to compare against. This is the same dev-box
    // foot-gun the shrink guard exists to prevent, arriving through the one
    // door the guard does not cover.
    mkdirSync(path.join(root, 'books'), { recursive: true });
    let called = false;
    const code = run({
      book: 'innslattarvilla',
      exportFn: () => {
        called = true;
        return payload(approved(5));
      },
    });
    expect(code).toBe(1);
    expect(called).toBe(false);
    expect(existsSync(path.join(root, 'books', 'innslattarvilla'))).toBe(false);
    expect(heartbeatExists()).toBe(false);
  });
});

describe('runGlossaryExport — dry run', () => {
  it('writes neither the export nor the heartbeat', () => {
    seedBook('prufubok');
    expect(run({ exportFn: () => payload(approved(5)), dryRun: true })).toBe(0);
    expect(existsSync(path.join(root, 'books', 'prufubok', 'glossary', 'glossary-unified.json'))).toBe(false);
    expect(heartbeatExists()).toBe(false);
  });

  it('still reports what the shrink guard would do', () => {
    seedBook('prufubok', JSON.stringify(payload(approved(617))));
    const errors = [];
    const code = run({
      exportFn: () => payload(approved(3)),
      dryRun: true,
      logError: (m) => errors.push(m),
    });
    expect(code).toBe(1);
    expect(errors.join('\n')).toMatch(/617/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run server/__tests__/glossaryExportRun.test.js`
Expected: FAIL — `runGlossaryExport is not a function`.

- [ ] **Step 3: Write the implementation**

Replace the whole of `server/scripts/export-terminology.js` with:

```js
#!/usr/bin/env node

/**
 * Export each book's glossary from the terminology DB to
 * books/<book>/glossary/glossary-unified.json — the file tools/api-translate.js
 * feeds to Málstaður as the MT glossary (Unit 6.1).
 *
 * WIRING (register C14, 2026-07-27). This script had ZERO callers, and its
 * previous header claimed "the 2h git-backup already stages books/, so the
 * refreshed export reaches git for free". That was FALSE — git-backup.sh's
 * PATHSPECS had no books/*\/glossary/ entry — so even a scheduled run would
 * have written to production's disk and never reached the dev checkout where
 * api-translate.js actually primes MT. Both halves are now fixed:
 * scripts/git-backup.sh invokes this script and stages books/*\/glossary/.
 *
 * SAFE TO RUN UNATTENDED because of two rules in lib/glossaryExportDecision.js:
 * write-if-changed (the `generated` stamp alone must not dirty the file every
 * 2h) and a shrink guard (the committed exports came from merge-glossary.js,
 * so this exporter SWAPS producers; a catastrophic drop in approved terms is
 * refused rather than committed).
 *
 * Exit code is the health contract: 0 only when every book resolved
 * healthily, which is also exactly when the heartbeat is written.
 *
 *   node server/scripts/export-terminology.js              # all glossary-bearing books
 *   node server/scripts/export-terminology.js --book efnafraedi-2e
 *   node server/scripts/export-terminology.js --dry-run
 *   node server/scripts/export-terminology.js --force      # accept a shrink
 */

const fs = require('fs');
const path = require('path');
const terminologyService = require('../services/terminologyService');
const { countApproved, sameTerms, shrinkVerdict } = require('../lib/glossaryExportDecision');

const BOOKS_DIR = path.join(__dirname, '..', '..', 'books');
const PROJECT_ROOT = path.join(__dirname, '..', '..');

/** Heartbeat consumed by GET /api/health — see server/lib/glossaryExportHealth.js. */
const HEARTBEAT_REL = path.join('pipeline-output', '.last-glossary-export');

function listBooks(booksDir = BOOKS_DIR) {
  try {
    return fs
      .readdirSync(booksDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

/** Existing export, or null when absent OR unparseable (no baseline to protect). */
function readExisting(outPath) {
  try {
    return JSON.parse(fs.readFileSync(outPath, 'utf-8'));
  } catch {
    return null;
  }
}

function writeHeartbeat(projectRoot) {
  const p = path.join(projectRoot, HEARTBEAT_REL);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, new Date().toISOString() + '\n', 'utf-8');
}

/**
 * @param {object} [options]
 * @param {string} [options.booksDir]
 * @param {string} [options.projectRoot]
 * @param {(bookSlug: string) => object} [options.exportFn] - injected in tests
 * @param {string|null} [options.book] - a single book, else all glossary-bearing ones
 * @param {boolean} [options.force] - write even when the shrink guard objects
 * @param {boolean} [options.dryRun] - write neither export nor heartbeat
 * @returns {number} exit code: 0 iff every book resolved healthily
 */
function runGlossaryExport({
  booksDir = BOOKS_DIR,
  projectRoot = PROJECT_ROOT,
  exportFn = terminologyService.exportBookGlossary,
  book = null,
  force = false,
  dryRun = false,
  log = console.log,
  logError = console.error,
} = {}) {
  // Only export books that already have a glossary directory — i.e. registered,
  // glossary-bearing books.
  //
  // The named-book path is filtered TOO, not exempted: the write path below
  // mkdirSync's recursively, so a typo'd slug would otherwise CREATE
  // books/<typo>/glossary/ and write an empty export into it, with the shrink
  // guard powerless because a brand new path has no baseline to compare
  // against.
  const hasGlossaryDir = (b) => fs.existsSync(path.join(booksDir, b, 'glossary'));
  const books = book ? [book].filter(hasGlossaryDir) : listBooks(booksDir).filter(hasGlossaryDir);

  if (book && books.length === 0) {
    logError(`${book}: no glossary directory at ${path.join(booksDir, book, 'glossary')} — refusing`);
    return 1;
  }

  if (books.length === 0) {
    // Not vacuously healthy: an empty set means book discovery is broken.
    // Reporting success here would let a mis-resolved booksDir read green
    // forever, which is precisely what the health check exists to catch.
    logError('No glossary-bearing books found — book discovery is broken, refusing to report healthy');
    return 1;
  }

  let failures = 0;

  for (const b of books) {
    const outDir = path.join(booksDir, b, 'glossary');
    const outPath = path.join(outDir, 'glossary-unified.json');

    let next;
    try {
      next = exportFn(b);
    } catch (err) {
      logError(`${b}: export failed — ${err.message}`);
      failures++;
      continue;
    }

    const prev = readExisting(outPath);

    if (sameTerms(prev, next)) {
      log(`${b}: unchanged (${countApproved(next)} approved) — not rewritten`);
      continue;
    }

    const verdict = shrinkVerdict(prev, next);
    if (verdict.refuse && !force) {
      logError(
        `${b}: REFUSING to write — approved terms would fall ${verdict.prevApproved} → ` +
          `${verdict.nextApproved}. The committed file may come from a different producer ` +
          `(tools/merge-glossary.js). Investigate, then pass --force if the shrink is intended.`
      );
      failures++;
      continue;
    }

    if (dryRun) {
      log(
        `[dry-run] ${b}: would write ${next.terms.length} terms ` +
          `(${verdict.nextApproved} approved, was ${verdict.prevApproved})`
      );
      continue;
    }

    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(next, null, 2) + '\n', 'utf-8');
    log(
      `${b}: wrote ${next.terms.length} terms (${verdict.nextApproved} approved, ` +
        `was ${verdict.prevApproved}) → ${outPath}`
    );
  }

  if (failures > 0) return 1;
  if (!dryRun) writeHeartbeat(projectRoot);
  return 0;
}

function main() {
  const argv = process.argv.slice(2);
  let book = null;
  let dryRun = false;
  let force = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--book') book = argv[++i];
    else if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--force') force = true;
    else if (argv[i] === '-h' || argv[i] === '--help') {
      console.log(
        'Usage: node server/scripts/export-terminology.js [--book <slug>] [--dry-run] [--force]'
      );
      process.exit(0);
    }
  }

  process.exit(runGlossaryExport({ book, dryRun, force }));
}

if (require.main === module) {
  main();
}

module.exports = { listBooks, runGlossaryExport };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/__tests__/glossaryExportRun.test.js`
Expected: PASS, 17 tests.

- [ ] **Step 5: Verify the CLI still works and is non-destructive**

Run: `node server/scripts/export-terminology.js --dry-run`

Expected: it prints one line per glossary-bearing book and **writes nothing**. Confirm with `git status --short books/` → no modifications. If it reports a refusal for `efnafraedi-2e`, that is the designed behaviour on this box (the dev `sessions.db` has ~0 approved terms) and confirms the guard works.

- [ ] **Step 6: Commit**

```bash
git add server/scripts/export-terminology.js server/__tests__/glossaryExportRun.test.js
git commit -m "feat(C14): make the glossary exporter safe to run unattended

Adds runGlossaryExport with the exporter injected, so orchestration tests
need no sessions.db. Exit code is the health contract: 0 only when every
book resolved healthily, which is exactly when the heartbeat is written -
the C11(b) doctrine, absence is the alarm.

Discovering zero books returns 1 rather than passing vacuously: an empty
set means book discovery broke, and reporting healthy there would hide a
mis-resolved booksDir forever. One book's refusal no longer skips the rest.

Also deletes the false claim in this file's own header that the 2h
git-backup already stages books/ - it does not, which is why a scheduled
run would have delivered nothing. Task 6 fixes that half."
```

---

### Task 5: `/api/health` check

**Files:**
- Create: `server/lib/glossaryExportHealth.js`
- Test: `server/__tests__/glossaryExportHealth.test.js`
- Modify: `server/index.js` (insert after the `content_backup` block ending at `:335`)

**Interfaces:**
- Consumes: the heartbeat path `pipeline-output/.last-glossary-export` produced by Task 4.
- Produces: `readGlossaryExportHealth({projectRoot: string, nowMs: number, staleHours?: number}) => {age_hours: number|null, stale: boolean, ok: boolean}` and `DEFAULT_STALE_HOURS: number` (6), both CommonJS exports.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/glossaryExportHealth.test.js`:

```js
/**
 * Glossary-export heartbeat health (register C14).
 *
 * server/scripts/export-terminology.js writes
 * pipeline-output/.last-glossary-export only when every book resolved
 * healthily, so staleness is the alarm.
 *
 * WHY THIS EXISTS: the export is invoked from scripts/git-backup.sh in a
 * deliberately CONTAINED way — a failure logs a WARN and lets the content
 * backup proceed, because terminology-DB health must not be able to abort
 * the backup. That containment means a persistent failure would otherwise
 * be invisible: a WARN in a gitignored log nobody reads, while the glossary
 * silently stayed frozen. Cron environments are the likely cause (no repo
 * cron script invoked `node` before this one). This check is where that
 * becomes visible — ./scripts/deploy.sh prints every not-ok check.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { readGlossaryExportHealth, DEFAULT_STALE_HOURS } = require('../lib/glossaryExportHealth');

const H = 3600 * 1000;
const NOW = 1_800_000_000_000; // fixed clock; no Date.now() in assertions

let root;

function heartbeat(ageHours) {
  const p = path.join(root, 'pipeline-output', '.last-glossary-export');
  writeFileSync(p, new Date(NOW - ageHours * H).toISOString() + '\n');
  const t = new Date(NOW - ageHours * H);
  utimesSync(p, t, t);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'glossaryexport-'));
  mkdirSync(path.join(root, 'pipeline-output'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('readGlossaryExportHealth', () => {
  it('defaults to a 6 hour threshold (2-hourly cron, two missed cycles + margin)', () => {
    expect(DEFAULT_STALE_HOURS).toBe(6);
  });

  it('is not ok when the heartbeat is missing entirely', () => {
    // The state on any box where the export has never succeeded — including
    // one where cron cannot resolve `node`.
    const r = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.stale).toBe(true);
    expect(r.age_hours).toBeNull();
  });

  it('is ok when the heartbeat is fresh', () => {
    heartbeat(2);
    const r = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(r.ok).toBe(true);
    expect(r.age_hours).toBe(2);
  });

  it('is not ok when the heartbeat is older than the threshold', () => {
    heartbeat(9);
    const r = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.age_hours).toBe(9);
  });

  it('honours an explicit staleHours override', () => {
    heartbeat(9);
    expect(readGlossaryExportHealth({ projectRoot: root, nowMs: NOW, staleHours: 24 }).ok).toBe(true);
  });

  it('does not throw when pipeline-output does not exist at all', () => {
    const bare = mkdtempSync(path.join(tmpdir(), 'glossaryexport-bare-'));
    try {
      expect(readGlossaryExportHealth({ projectRoot: bare, nowMs: NOW }).ok).toBe(false);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run server/__tests__/glossaryExportHealth.test.js`
Expected: FAIL — `Cannot find module '../lib/glossaryExportHealth'`.

- [ ] **Step 3: Write the implementation**

Create `server/lib/glossaryExportHealth.js`:

```js
/**
 * Glossary-export heartbeat health (register C14).
 *
 * server/scripts/export-terminology.js is invoked by scripts/git-backup.sh,
 * the 2-hourly cron, and writes pipeline-output/.last-glossary-export ONLY
 * when every book resolved healthily. Absence is therefore the alarm.
 *
 * This check exists because that invocation is deliberately CONTAINED: a
 * failing export logs a WARN and lets the content backup proceed, since
 * terminology-DB health must never be able to abort the backup or suppress
 * its own C11(b) heartbeat. The cost of that containment is that a
 * persistent failure would otherwise be invisible — a WARN in a gitignored
 * log nobody reads, while books/*\/glossary/ silently stayed frozen and MT
 * kept being primed from a months-old file. That is the exact failure this
 * whole register item was raised about; shipping the runner without this
 * check would repeat it.
 *
 * No status-file detail here (unlike contentBackupHealth): the exporter
 * writes no status file, so the heartbeat is the whole signal.
 *
 * All filesystem access lives here rather than in the /api/health handler,
 * because server/index.js calls app.listen() at module load and so cannot be
 * imported by a unit test.
 */

const fs = require('fs');
const path = require('path');
const { computeBackupHeartbeatHealth } = require('./backupHeartbeatHealth');

/** Two missed cycles of the 2-hourly cron, plus margin. */
const DEFAULT_STALE_HOURS = 6;

/**
 * @param {{projectRoot: string, nowMs: number, staleHours?: number}} p
 *   projectRoot — the repo root. Derive it from `__dirname`, never
 *   `process.cwd()`: the server runs with cwd=server/.
 * @returns {{age_hours: number|null, stale: boolean, ok: boolean}}
 */
function readGlossaryExportHealth({ projectRoot, nowMs, staleHours = DEFAULT_STALE_HOURS }) {
  let heartbeatMtimeMs = null;
  try {
    heartbeatMtimeMs = fs.statSync(
      path.join(projectRoot, 'pipeline-output', '.last-glossary-export')
    ).mtimeMs;
  } catch {
    /* missing heartbeat => stale, handled by the helper */
  }

  const health = computeBackupHeartbeatHealth({ heartbeatMtimeMs, nowMs, staleHours });
  return { ...health, ok: !health.stale };
}

module.exports = { readGlossaryExportHealth, DEFAULT_STALE_HOURS };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run server/__tests__/glossaryExportHealth.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Wire it into `/api/health`**

In `server/index.js`, immediately after the `content_backup` try/catch block (which ends with `checks.content_backup = { ok: false, error: err.message };` and its closing `}`), and **before** the `const allOk = ...` line, insert:

```js
  // Check glossary-export heartbeat (register C14). The export is invoked by
  // scripts/git-backup.sh in a contained way — a failure must not abort the
  // content backup — so this is the only place a persistently failing export
  // becomes visible. ./scripts/deploy.sh prints every not-ok check.
  try {
    const { readGlossaryExportHealth, DEFAULT_STALE_HOURS } = require('./lib/glossaryExportHealth');
    checks.glossary_export = readGlossaryExportHealth({
      projectRoot: path.join(__dirname, '..'),
      nowMs: Date.now(),
      staleHours: Number(process.env.GLOSSARY_EXPORT_STALE_HOURS) || DEFAULT_STALE_HOURS,
    });
  } catch (err) {
    checks.glossary_export = { ok: false, error: err.message };
  }
```

- [ ] **Step 6: Verify the endpoint by hand**

Run: `npm run server:dev` in one terminal, then in another:

```bash
curl -s http://localhost:3000/api/health | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const h=JSON.parse(d);console.log(h.status);console.log(JSON.stringify(h.checks.glossary_export))})"
```

Expected: `degraded`, and `{"age_hours":null,"stale":true,"ok":false}` — correct on a box where the export has never run. Stop the server.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add server/lib/glossaryExportHealth.js server/__tests__/glossaryExportHealth.test.js server/index.js
git commit -m "feat(C14): surface a stale glossary export in /api/health

The export is invoked from git-backup.sh in a contained way - a failure
logs a WARN and lets the content backup proceed, because terminology-DB
health must not abort the backup or suppress its C11(b) heartbeat. The
cost of that containment is invisibility: a WARN in a gitignored log while
the glossary stays frozen and MT keeps priming from a months-old file.
That is the exact failure this register item was raised about, so shipping
the runner without a check would repeat it.

Reuses the shared computeBackupHeartbeatHealth. deploy.sh needs no change -
it enumerates checks generically and gates nothing."
```

---

### Task 6: Cron wiring — invoke the export, stage its output

**Files:**
- Modify: `scripts/git-backup.sh` (insert after the git-repo check at `:93`; extend `PATHSPECS` at `:108-118`)
- Modify: `scripts/__tests__/git-backup.test.mjs` (extend `FIXTURE_FILES`; add a describe block)

**Interfaces:**
- Consumes: the CLI entry point `node server/scripts/export-terminology.js` from Task 4.
- Produces: nothing consumed by later tasks.

> **Deliberate upgrade over the spec.** Spec §6 planned a *static byte-pin* asserting `books/*/glossary/` appears in `PATHSPECS`. `vitest.workspace.js` turns out to define a third project — `scripts` (`scripts/__tests__/**/*.test.mjs`) — that drives real shell scripts as subprocesses, and `git-backup.test.mjs` already copies the real script into a temp git repo with a bare origin and runs it. So this task tests the **behaviour** instead: that a failing export genuinely does not abort the backup. A static pin proves text is present; running the script proves the `set -e` trap actually holds.

- [ ] **Step 1: Write the failing test**

In `scripts/__tests__/git-backup.test.mjs`, add one entry to the `FIXTURE_FILES` object (so the new pathspec matches and the existing tests stay WARN-free):

```js
  'books/prufubok/glossary/glossary-unified.json': '{"terms":[]}\n',
```

Then append this describe block at the end of the file:

```js
describe('git-backup.sh glossary export (register C14)', () => {
  it('stages a changed books/*/glossary/ file', () => {
    // Without this pathspec the export writes to production's disk and never
    // reaches the dev checkout where api-translate.js primes MT — which is
    // why wiring the runner alone would have delivered nothing.
    writeFileSync(
      path.join(work, 'books/prufubok/glossary/glossary-unified.json'),
      '{"terms":[{"english":"water","icelandic":"vatn","status":"approved"}]}\n'
    );
    const { status } = runBackup();
    expect(status).toBe(0);
    expect(readStatus().status).toBe('success');
    expect(git(['show', '--stat', '--name-only', 'HEAD'])).toMatch(
      /books\/prufubok\/glossary\/glossary-unified\.json/
    );
  });

  it('a FAILING export does not abort the content backup', () => {
    // The fixture has no server/scripts/export-terminology.js, so node exits
    // non-zero. git-backup.sh is `set -euo pipefail` and its heartbeat is the
    // C11(b) content-backup alarm — a terminology-DB problem must never be
    // able to take that down. Containment is asserted behaviourally here, not
    // as a text pin, because only running it proves the trap actually holds.
    writeFileSync(
      path.join(work, 'books/prufubok/chapters/ch01/status.json'),
      '{"chapter":1,"x":3}\n'
    );
    const { status } = runBackup();
    expect(status).toBe(0);
    expect(readStatus().status).toBe('success');
    expect(existsSync(heartbeatPath())).toBe(true);
    expect(readLog()).toMatch(/WARN: glossary export failed/);
  });

  it('invokes the exporter before staging, so a fresh export rides the same commit', () => {
    // Stand in a fake exporter that writes the glossary file, proving the
    // call happens BEFORE `git add` rather than after it.
    mkdirSync(path.join(work, 'server', 'scripts'), { recursive: true });
    writeFileSync(
      path.join(work, 'server', 'scripts', 'export-terminology.js'),
      [
        "const fs = require('fs');",
        "const path = require('path');",
        "const p = path.join(__dirname, '..', '..', 'books', 'prufubok', 'glossary', 'glossary-unified.json');",
        'fs.writeFileSync(p, JSON.stringify({ terms: [{ english: "acid", icelandic: "syra", status: "approved" }] }) + "\\n");',
      ].join('\n')
    );
    const { status } = runBackup();
    expect(status).toBe(0);
    expect(git(['show', '--stat', '--name-only', 'HEAD'])).toMatch(
      /books\/prufubok\/glossary\/glossary-unified\.json/
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/__tests__/git-backup.test.mjs`
Expected: FAIL — the staging tests fail because `books/*/glossary/` is not in `PATHSPECS`; the containment test fails because no `WARN: glossary export failed` is logged.

- [ ] **Step 3: Write the implementation**

In `scripts/git-backup.sh`, insert this block immediately after the git-repo check (after the `fi` that closes `if ! git rev-parse --git-dir`, at `:93`), before the `# Stage content directories` comment:

```bash
# Refresh each book's MT-priming glossary from the terminology DB before
# staging (register C14). The DB lives only on this box, and the
# books/*/glossary/ pathspec below is the ONLY channel by which it reaches
# the dev checkout where tools/api-translate.js primes Málstaður. Running
# the export here rather than from its own crontab entry means it needs no
# separate installation step on production.
#
# CONTAINED DELIBERATELY: this script is `set -euo pipefail` and its
# heartbeat is the content-backup alarm (register C11(b)). A terminology-DB
# problem must not abort the content backup or suppress that heartbeat, so a
# failure here logs a WARN and the run continues. The export has its OWN
# heartbeat and its own /api/health check (checks.glossary_export), so a
# persistent failure stays visible instead of being swallowed.
#
# PATH is pinned to /usr/bin exactly as scripts/deploy.sh does: cron has a
# minimal environment, and an nvm-shadowed `node` would load a
# better-sqlite3 built for a different NODE_MODULE_VERSION.
export PATH="/usr/bin:$PATH"
if command -v node > /dev/null 2>&1; then
  if ! node "${PROJECT_ROOT}/server/scripts/export-terminology.js" >> "$LOG_FILE" 2>&1; then
    log "WARN: glossary export failed — continuing with the content backup"
  fi
else
  log "WARN: node not found in cron PATH — glossary export skipped"
fi
```

Then add one entry to the `PATHSPECS` array (after `'books/*/chapters/'`):

```bash
  'books/*/glossary/'
```

And add one line to the "What gets backed up" header comment, after the `books/*/chapters/` line:

```bash
#   books/*/glossary/                 — MT-priming glossary export (see server/scripts/export-terminology.js)
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/__tests__/git-backup.test.mjs`
Expected: PASS — all pre-existing tests plus the 3 new ones.

- [ ] **Step 5: Mutation-check the containment**

> 🔴 **THIS EDIT IS TEMPORARY AND MUST BE REVERTED IN THIS SAME STEP.** You are deliberately breaking the script to prove the test detects it. Do not commit the mutated file; do not move on until you have reverted it and re-run the suite green. If anything interrupts you mid-step, `git checkout -- scripts/git-backup.sh` and start the step over.

The containment test must fail if the containment is removed. Temporarily change the guarded call in `scripts/git-backup.sh` to a bare invocation:

```bash
node "${PROJECT_ROOT}/server/scripts/export-terminology.js" >> "$LOG_FILE" 2>&1
```

Run: `npx vitest run scripts/__tests__/git-backup.test.mjs`
Expected: **`a FAILING export does not abort the content backup` FAILS** (the script exits non-zero under `set -e`). Confirm that is the test that goes red, then **revert the mutation** and re-run to confirm green.

- [ ] **Step 6: Check shell syntax and lint**

Run: `npx vitest run scripts/__tests__/shell-syntax.test.mjs`, then `npm run lint && npm run format:check`
Expected: green.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add scripts/git-backup.sh scripts/__tests__/git-backup.test.mjs
git commit -m "feat(C14): run the glossary export from the 2h cron and stage its output

The exporter had zero callers, and its own header wrongly claimed the 2h
git-backup already staged books/ - it did not, so even a scheduled run
would have written to prod's disk and never reached the dev checkout where
api-translate.js primes MT. Both halves are fixed here: git-backup.sh
invokes the export and stages books/*/glossary/.

Hosting it in the existing cron rather than a new crontab entry means zero
new production ops. The call is contained - a failure logs a WARN and the
backup proceeds - because this script is set -euo pipefail and its
heartbeat is the C11(b) content-backup alarm. Asserted behaviourally by
running the real script, and mutation-checked: removing the containment
turns that test red.

PATH is pinned to /usr/bin as deploy.sh does; no repo cron script invoked
node before this one, so cron's minimal environment is a real risk.

Takes the books/*/glossary/ pathspec from C3; books/*/tm/ stays there."
```

---

### Task 7: Correct every document that states the wrong premise

**Files:**
- Modify: `CLAUDE.md` (the 2026-07-26 glossary-sourcing bullet, blocker (a) and (b))
- Modify: `docs/technical/architecture.md:460` and `:473`
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (RESUME block, C3, C14)
- Modify: `~/.claude/projects/-home-siggi-dev-repos-namsbokasafn-efni/memory/MEMORY.md` (**not** a repo file — not committed)

**Interfaces:** none.

CLAUDE.md § *One source of truth* governs this task: **fix each wrong document in place; never log a correction as a to-do in a second document.** Memory must carry no repo `file:line` and no item status.

- [ ] **Step 1: Correct `CLAUDE.md`**

In the 2026-07-26 "Glossary sourcing" bullet, replace the two-blocker sentence. Blocker (a) currently says the bridge exists but nothing runs it; blocker (b) describes the missing `formatGlossary` guard. Replace both with a statement of what now happens, keeping the durable rule about `merge-glossary.js`'s three sources:

```markdown
- **⚠️ Two blockers CLEARED by register C14 (2026-07-27).** (a) The bridge (`server/scripts/export-terminology.js`) had no caller **and no delivery path** — its own header wrongly claimed the 2h git-backup staged `books/`, which it did not. `scripts/git-backup.sh` now invokes it and stages `books/*/glossary/`; a failure is contained (WARN, backup proceeds) and surfaces as `checks.glossary_export` in `GET /api/health`. **⚠️ The exporter is the SECOND producer of `glossary-unified.json`** — every committed copy was written by `tools/merge-glossary.js`, whose own `--db` upsert targets the `terminology_terms` table migration 032 dropped. A shrink guard refuses to replace a much richer file unseen, so the first prod run is *expected* to refuse; `merge-glossary.js` still has 3 sources and Íðorðabankinn is not one. (b) `formatGlossary` now drops blank-sided entries and reports the count — a blank IS side used to 400 the WHOLE Málstaður request.
```

- [ ] **Step 2: Correct `docs/technical/architecture.md`**

Replace the glossary row of the durability table at `:460`:

```markdown
| Glossary export (`books/*/glossary/glossary-unified.json`) | git | `scripts/git-backup.sh` invokes `server/scripts/export-terminology.js`, then stages `books/*/glossary/` | ~2h |
```

While here, the TM row at `:458` carries the **same** class of false claim — `books/*/tm/` is not in `PATHSPECS` either. Correct it in place (this is a documentation fix only; adding that pathspec remains C3's open work):

```markdown
| Translation memory (`books/*/tm/*.tmx`) | git | regenerated on apply (`tmService`); ⚠️ **NOT staged by git-backup** — reaches git only via a manual commit (register C3) | manual |
```

Replace the whole **Glossary freshness (6.1)** paragraph at `:470-476` with:

```markdown
**Glossary freshness (6.1):** the committed `glossary-unified.json` is the MT
glossary `api-translate.js` sends to Málstaður. `scripts/git-backup.sh` regenerates
it from the terminology DB via `server/scripts/export-terminology.js` and stages
`books/*/glossary/` in the same run, so newly approved terms reach MT without a
manual export (register C14 — before that, the script had no caller *and* no
pathspec, so its output could not have left the server). The call is contained: a
failure logs a WARN and the content backup proceeds, and staleness surfaces as
`checks.glossary_export` in `GET /api/health`. ⚠️ The exporter is the **second**
producer of that file — every committed copy was written by `tools/merge-glossary.js`
— so it refuses to replace a much richer file unless `--force` is passed. Derived
assets (`tm_segments`, the TMX) can always be rebuilt from the faithful files in
git, so only the **DB-only** rows above are truly irreplaceable.
```

- [ ] **Step 3: Close C14 and amend C3 in the register**

In `docs/plans/2026-07-21-post-item17-followup-campaign.md`, replace the **C14** entry with (filling the bracketed values from the actual PR):

```markdown
- **✅ C14 · The glossary bridge — MERGED <date> (PR #<n>, main `<sha>`)** — **[CODE]** — the corrected premise was still too kind: the bridge had **no caller AND no delivery path**. Its own header claimed the 2h git-backup staged `books/`; `git-backup.sh` had no `books/*/glossary/` pathspec, so a scheduled run would have written to prod's disk and never reached the dev checkout where `api-translate.js` primes MT. Shipped: `git-backup.sh` invokes the export (contained — a failure WARNs and the content backup proceeds, because that script is `set -euo pipefail` and owns the C11(b) heartbeat) and stages `books/*/glossary/`; a shrink guard + write-if-changed make the exporter safe unattended; `checks.glossary_export` in `GET /api/health` makes a persistent failure visible; `formatGlossary` drops blank-sided entries and reports the count instead of 400ing the whole request. Behavioural cron tests run the real script; the containment is mutation-checked.
  - **⚠️ THE FINDING THAT MATTERS: there are TWO producers of `glossary-unified.json`.** Every committed copy was written by `tools/merge-glossary.js`, not by the exporter — so cron-ing it **swaps producers**, it does not refresh. `efnafraedi-2e` holds **1117 terms / 617 approved** (605 `chemistry-society-csv`); migration 032 **dropped** the `terminology_terms` table `merge-glossary.js:533` still writes to (error swallowed at `:727`); and `exportBookGlossary` is deliberately subject-strict (item 18). So the DB export can be far smaller, and nobody can know how much smaller without querying prod. **The first prod run is EXPECTED to refuse** and hold the merge-glossary files. That is the design working.
  - **▶ [LEAD] rider:** run `node server/scripts/export-terminology.js --dry-run` on prod, read the real approved-term counts, and only then decide per book whether to `--force`. **Do not `--force` before reading the numbers.**
  - **C14 follow-ups logged (all out-of-scope, none blocking):**
    1. **🟠 `tools/merge-glossary.js:533` writes to the dropped `terminology_terms` table** — its `--db` upsert path is dead and silently so (caught at `:727`, printed as a warning, run continues). Not fixed here because the fix is a product decision, not a repair — see (2).
    2. **🟠 Two producers, one artifact** — `merge-glossary.js` (onboarding; 3 sources incl. OpenStax CNXML, Íðorðabankinn not among them) vs `export-terminology.js` (continuous; DB). The "one real code path" rule argues for resolving this, but the resolution is a lead call and needs the dry-run numbers first.
    3. **🟡 `lifraen-efnafraedi`'s `glossary-unified.json` is a byte-identical copy of `efnafraedi-2e`'s** — same 1117 terms, same `generated` stamp, same 445,395 bytes. Plausibly deliberate (both chemistry), plausibly a copy-paste artifact. Unverified.
    4. **🟡 `docs/editorial/terminology.md:220`** still calls the CSV files "the authoritative source for approved terminology", which the DB redesign superseded. Tracked in the closure audit as `ed-dim-8`; not re-homed here.
  - **⚠️ Corrected in the same pass, per one-source-of-truth:** the false wiring claim lived in **four** places, not the two the register named — CLAUDE.md, memory, `architecture.md:460`+`:473`, and the exporter's own header. All fixed in place. *[severity: correctness · blocks: MT-priming quality]*
```

Amend **C3** so it no longer claims both halves — replace its pathspec sentence with:

```markdown
`scripts/git-backup.sh` PATHSPECS stage **`books/*/tm/`** — the `books/*/glossary/` half **landed in C14 (2026-07-27)**, and `architecture.md`'s glossary row was corrected with it. What remains: `books/*/tm/` is still unstaged while `architecture.md:458` claimed it rides the cron (that row is now corrected to say so), so the TMX reaches git only by a manual commit.
```

Update the **⏩ RESUME** block: mark C14 done with its PR, note that `checks.glossary_export` reads not-ok until the first successful prod export, add the dry-run rider to the `[LEAD]` queue, and set the next `[CODE]` item to **C1d write-path publish**.

- [ ] **Step 4: Correct project memory**

In `~/.claude/projects/-home-siggi-dev-repos-namsbokasafn-efni/memory/MEMORY.md`, the Íðorðabankinn line's blocker (a)/(b) clause carries the same wrong premise. Replace that clause with:

```markdown
**⚠️ Both MT-priming blockers cleared (C14).** The glossary export now rides the 2h content-backup cron and its output is staged, so approved terms reach the translator; a failing export cannot abort the backup, and staleness shows up as a health check. **⚠️ The exporter is the SECOND producer of that file** — every committed copy came from the merge tool, whose own DB write targets a table the terminology redesign dropped — so it refuses to replace a much richer file unseen, and the first prod run is *expected* to refuse until someone reads the dry-run counts. A blank Icelandic side no longer 400s the whole request.
```

Note the deliberate absences: **no repo `file:line`, no PR number, no open/closed status** — those live in the register. Verify:

Verify the memory constraint holds:

```bash
grep -nE '[a-z0-9_-]+\.(js|sh|md|json|yml):[0-9]+' ~/.claude/projects/-home-siggi-dev-repos-namsbokasafn-efni/memory/MEMORY.md
```

Expected: no output.

- [ ] **Step 5: Verify docs generation is current**

Run: `npm run docs:check`
Expected: PASS (no diff in `docs/_generated/`). If it fails, run `npm run docs:generate` and include the result.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md docs/technical/architecture.md docs/plans/2026-07-21-post-item17-followup-campaign.md docs/_generated/
git commit -m "docs(C14): correct every document that stated the wrong premise

The register warned that C14's premise had already been corrected once and
that the wrong wording lived in CLAUDE.md and memory. It was in four places,
not two: both of those plus this repo's architecture.md durability table and
the exporter's own header (fixed in the code commit).

All of them described a bridge with no runner. The truth was worse - no
runner AND no delivery path, because git-backup.sh never staged
books/*/glossary/. Each is fixed in place rather than logged as a to-do
elsewhere, per CLAUDE.md's one-source-of-truth rule.

C3 amended: its glossary/ half landed here, tm/ remains. Four out-of-scope
findings logged, headed by merge-glossary.js writing to a table migration
032 dropped."
```

---

## Final verification

- [ ] **Run the authoritative gate**

Run: `npm test` from the repo root. Expected: green, with ~60 tests added across five new files.

⚠️ **Do not record the resulting test count in any document.** Per CLAUDE.md § *One source of truth*, no prose holds a test count — the number is whatever `npm test` just printed. Record "green" and the date.

- [ ] **Run the CI-equivalent checks**

Run: `npm run lint && npm run format:check && npm run docs:check`

Expected: all green. Note `npm run lint` ≠ the Lint job (CI also runs `format:check`) and `npm test` ≠ the Tests job (CI also runs Playwright E2E) — verify against the workflow files before claiming the branch is green.

(`npm run validate` is deliberately **not** listed: it validates chapter status files, and nothing in this branch touches `books/*/chapters/`. The check that matters here is the next one.)

- [ ] **Confirm no book content was modified**

Run: `git status --short books/` and `git diff --stat main -- books/`

Expected: **empty**. This branch wires and guards the export; it must not change any glossary payload. If `books/` is dirty, a run wrote something — investigate before proceeding.

- [ ] **Whole-branch adversarial review** before opening the PR, per the campaign's standing process. ⚠️ Read the raw findings, not the verdict — and do not fix findings while the review is still running, or the verifiers refute real defects as stale (the C13 lesson).

- [ ] **Open the PR.**

## Post-merge riders

- **[LEAD] `checks.glossary_export` will read not-ok until the first successful export.** That is correct, not a regression — same posture as `offbox_backup` today.
- **[LEAD] After deploying, run `node server/scripts/export-terminology.js --dry-run` on prod** and read the real approved-term counts per book. Only then decide whether to `--force`. **Do not `--force` before reading the numbers** — the committed chemistry glossary holds 617 approved terms from a producer whose DB table no longer exists.
- No re-render and no vefur sync: this branch changes no published content.
