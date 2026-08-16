# §C82 Plan A — loop prerequisites (instruments and the run record)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the six foundations the §C82 gated re-MT loop depends on — the per-module MT run record, the widened per-segment marker delta, the alt-coverage check, the source-anchored bracket-body check, honest `--module` handling, and a committed extract→inject round-trip check — so that the check battery (Plan B) and the driver (Plan C) have real instruments to assemble rather than ceremony.

**Architecture:** Every deliverable here is a **pure function in a `tools/lib/*.js` module plus a thin call site**. Nothing in this plan runs the loop, spends ISK, writes a ledger, or touches `books/*/01-source/`. The one behavioural change to a paid path is that `api-translate.js` now persists what it already computed and threw away.

**Tech Stack:** Node 22 (`.nvmrc`), ESM (root `package.json` is `"type": "module"`), Vitest, `@xmldom/xmldom` for CNXML parsing.

**Spec:** [`docs/superpowers/specs/2026-08-13-gated-per-module-remt-loop-design.md`](../specs/2026-08-13-gated-per-module-remt-loop-design.md) (§8 prerequisites) + [`docs/superpowers/specs/2026-08-13-remt-check-battery.md`](../specs/2026-08-13-remt-check-battery.md) (§5 "must be built before the loop runs"). Read both before starting.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Root is ESM, `server/` is CommonJS.** A `tools/*.js` file using `require`/`module.exports` **cannot load**. Everything in this plan is `tools/`, so everything is `import`/`export`.
- **Test files are a third shape.** Vitest cannot be `require`d. Copy the header idiom from `tools/__tests__/extraction-coverage.test.js`: `import { describe, it, expect } from 'vitest';`.
- **Run the suite from the repo root**: `npm test`. It is `vitest run` and does **not** run Playwright. `fileParallelism` is `false` globally, so a test that mutates shared module state poisons every later file.
- **Never resolve a resource path against `process.cwd()`.** Use `import.meta.dirname` / `import.meta.url`.
- **`tools/lib/parseArgs.js` silently drops unknown flags.** A misremembered flag is a no-op, not an error. Confirm every flag against the tool's own `parseArgs` spec — and note that being present in `--help` is **not** sufficient either (§C83: `cnxml-extract.js --output-dir` is documented, accepted and ignored).
- **`books/*/01-source/` is READ-ONLY.** No task here writes to it. `books/*/02-mt-output/` is read-only *to hands* — only `api-translate` writes there.
- **Use `grep -a` for any census.** Committed source and doc files in this repo contain raw NUL bytes; plain `grep` reports nothing for strings they demonstrably contain.
- **Lint/format scope:** CI runs `eslint tools/ scripts/` and `prettier --check 'tools/**/*.js' 'scripts/**/*.js'`. Everything in this plan is in scope for both. Run `npm run lint && npm run format:check` before each commit.
- **A regression test is not verified until it has been run against the broken code.** Every task below has an explicit "run it and watch it fail" step. Do not skip it, and do not accept "confirmed to discriminate by reasoning" — that exact phrase preceded a non-discriminating test in §C81.
- **Commit a data file in the same step that writes it.** `lint-staged`'s pre-commit hook stashes unstaged tracked changes and can silently drop them.

## What this plan deliberately does NOT contain

Stated so nobody reads a gap as an oversight:

- **The check battery itself** (Tier 0 glossary gates G1–G5, the `--self-test` harness, the whole-corpus dry sweep, base rates) → **Plan B**.
- **The driver, `remt-ledger.json`, the extraction fingerprint, E9 pre-flight, the abort thresholds** → **Plan C**.
- **Re-deriving `residue-allowlist.json` and `fidelity-allowlist.json`** (battery spec §5 item 3). These are voided by the §C81 re-extract, which has **not happened yet** — measured 2026-08-15: zero `alt` segments exist anywhere in `books/*/02-for-mt/`. Re-deriving before the re-extract would produce an allowlist for the wrong vintage. This is a **data operation** that belongs immediately after the re-extract, not a code task.
- **Closing §C81's ~82% shortfall** (the 197 + 32 structurally-unreachable alt attributes). The register records this as undecided. Task 5 **measures and pins** it; extending the extractor to those four positions is a separate item.

---

## Task 1: `--chapter 0` is a real chapter

Chapter 0 is falsy. `if (args.module && !args.chapter)` rejects `--chapter 0`, and `args.chapter ? [one] : discoverChapters()` silently widens a chapter-0 run to the whole book — measured at 149 chemistry modules where `--chapter 1` scanned 7. Chemistry's ch00 holds `m68662`, the battery's only A5 fixture, so every per-module check is unreachable there today.

Both sites are byte-identical, so the fix is one shared helper used twice.

**Files:**
- Modify: `tools/lib/parseArgs.js` (add `chapterProvided`, near `CHAPTER_OPTION` at :60)
- Modify: `tools/cnxml-linguistic-check.js:240-249`
- Modify: `tools/cnxml-fidelity-check.js:297-306`
- Test: `tools/__tests__/parseArgs.test.js` (existing file — append)
- Test: `tools/__tests__/chapter-zero-cli.test.js` (create)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `chapterProvided(args: {chapter?: number|string|null}) => boolean`, exported from `tools/lib/parseArgs.js`. Tasks 8 and 9 use it; so does Plan C's driver.

- [ ] **Step 1: Write the failing unit test**

Append to `tools/__tests__/parseArgs.test.js`. Add `chapterProvided` to the existing import from `../lib/parseArgs.js`.

```javascript
describe('chapterProvided — chapter 0 is a real chapter, not a missing argument', () => {
  it('returns true for chapter 0', () => {
    expect(chapterProvided({ chapter: 0 })).toBe(true);
  });

  it('returns false when no chapter was supplied', () => {
    expect(chapterProvided({ chapter: null })).toBe(false);
  });

  it('returns true for appendices', () => {
    expect(chapterProvided({ chapter: 'appendices' })).toBe(true);
  });

  it('returns false for an unparseable chapter', () => {
    // parseArgs' CHAPTER_OPTION.parse runs parseInt, so `--chapter abc` is NaN.
    expect(chapterProvided({ chapter: NaN })).toBe(false);
  });

  it('returns true for an ordinary chapter', () => {
    expect(chapterProvided({ chapter: 7 })).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/parseArgs.test.js`
Expected: FAIL — `chapterProvided is not a function`.

- [ ] **Step 3: Implement the helper**

In `tools/lib/parseArgs.js`, immediately after the `CHAPTER_OPTION` export (which ends at line 66):

```javascript
/**
 * True when the caller actually supplied `--chapter`.
 *
 * `--chapter 0` parses to the NUMBER 0, which is falsy — so the idiomatic
 * `if (args.chapter)` treats a real chapter 0 as "no chapter given" and
 * silently widens the run to the whole book (measured: 149 chemistry modules
 * where `--chapter 1` scanned 7). Chemistry's ch00 is a real chapter; it holds
 * m68662. NaN, from an unparseable `--chapter abc`, is not a chapter.
 *
 * @param {{chapter?: number|string|null}} args parsed args
 * @returns {boolean}
 */
export function chapterProvided(args) {
  const c = args?.chapter;
  if (c === null || c === undefined) return false;
  return !(typeof c === 'number' && Number.isNaN(c));
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run tools/__tests__/parseArgs.test.js`
Expected: PASS.

- [ ] **Step 5: Write the failing CLI test**

Create `tools/__tests__/chapter-zero-cli.test.js`. This is the test that proves the *call sites* were fixed, not just the helper.

```javascript
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Run a tool and capture stdout+stderr regardless of exit code. */
function run(tool, args) {
  try {
    return execFileSync('node', [path.join('tools', tool), ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    return `${err.stdout || ''}${err.stderr || ''}`;
  }
}

const TOOLS = ['cnxml-linguistic-check.js', 'cnxml-fidelity-check.js'];

describe('chapter 0 is accepted with --module (§C82 prerequisite 5)', () => {
  for (const tool of TOOLS) {
    it(`${tool} does not reject --chapter 0 --module`, () => {
      const out = run(tool, ['--book', 'efnafraedi-2e', '--chapter', '0', '--module', 'm68662']);
      expect(out).not.toContain('--module requires --chapter');
    });

    it(`${tool} still rejects --module with no --chapter`, () => {
      const out = run(tool, ['--book', 'efnafraedi-2e', '--module', 'm68662']);
      expect(out).toContain('--module requires --chapter');
    });

    it(`${tool} scopes to ch00 rather than the whole book`, () => {
      // The whole-book run names chapters other than ch00; the scoped run must not.
      const out = run(tool, ['--book', 'efnafraedi-2e', '--chapter', '0']);
      expect(out).not.toMatch(/\bch(0[1-9]|1\d|2\d)\b/);
    });
  }
});
```

- [ ] **Step 6: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/chapter-zero-cli.test.js`
Expected: FAIL — the first assertion in each pair fails with the output containing `Error: --module requires --chapter`; the third fails because the unscoped run enumerates ch01+.

- [ ] **Step 7: Fix both call sites**

In `tools/cnxml-linguistic-check.js`, add `chapterProvided` to the existing import from `./lib/parseArgs.js`, then replace lines 240-246:

```javascript
  if (args.module && !chapterProvided(args)) {
    console.error('Error: --module requires --chapter');
    process.exit(1);
  }

  BOOKS_DIR = `books/${args.book}`;
  const chapters = chapterProvided(args)
    ? [formatChapter(args.chapter)]
    : discoverChapters(BOOKS_DIR);
```

Apply the identical change to `tools/cnxml-fidelity-check.js` at lines 297-303. The two blocks are byte-identical today and must stay so.

- [ ] **Step 8: Run both tests to verify they pass**

Run: `npx vitest run tools/__tests__/parseArgs.test.js tools/__tests__/chapter-zero-cli.test.js`
Expected: PASS, all cases.

- [ ] **Step 9: Run the full suite, lint, format**

Run: `npm test && npm run lint && npm run format:check`
Expected: all green. If `npm test` shows failures in unrelated files, they were already there — check with `git stash`.

- [ ] **Step 10: Commit**

```bash
git add tools/lib/parseArgs.js tools/cnxml-linguistic-check.js tools/cnxml-fidelity-check.js \
        tools/__tests__/parseArgs.test.js tools/__tests__/chapter-zero-cli.test.js
git commit -m "fix(C82): chapter 0 is a real chapter, not a missing --chapter

\`--chapter 0\` parses to the number 0, which is falsy, so both check tools
rejected it with --module and silently widened an unmodularized run to the
whole book. Chemistry ch00 holds m68662, the battery's only A5 fixture.

Adds chapterProvided() to parseArgs and uses it at both byte-identical sites.
Battery spec §5 item 5; design spec §8 item 5."
```

---

## Task 2: the run-record module

`writeProvenance` records **who** produced a module's MT output. Nothing records **what happened during** that production. `repairSegTags`, `normalizeSegMarkers` and `unwrapInventedMarkers` each fix their finding and proceed, so a post-hoc scan of `02-mt-output` cannot distinguish a clean run from a heavily-repaired one — which is why the battery calls checks A2(a), A4 and A8 "ceremony" without this.

This task builds the pure shape. Task 4 wires it in.

**Files:**
- Create: `tools/lib/run-record.js`
- Test: `tools/__tests__/run-record.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `RUN_RECORD_VERSION: number`
  - `glossaryContentHash(glossary: {terms?: Array<{sourceWord: string, targetWord: string}>}|null) => string|null`
  - `buildRunRecord(p: {chars, usage, estimatedIsk, markersNormalized, mismatches, bracketDelta, unwrapped, glossaryArm, glossaryHash, glossaryTermCount}) => object`

  Task 4 imports all three. Plan B reads the emitted object's `bracketDelta`, `unwrappedCount`, `markersNormalized` and `glossary.arm`.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/run-record.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import {
  RUN_RECORD_VERSION,
  glossaryContentHash,
  buildRunRecord,
} from '../lib/run-record.js';

describe('glossaryContentHash', () => {
  it('returns null when no glossary was sent', () => {
    expect(glossaryContentHash(null)).toBeNull();
    expect(glossaryContentHash({})).toBeNull();
    expect(glossaryContentHash({ terms: [] })).toBeNull();
  });

  it('is independent of term order', () => {
    const a = { terms: [{ sourceWord: 'atom', targetWord: 'frumeind' }, { sourceWord: 'bond', targetWord: 'efnatengi' }] };
    const b = { terms: [{ sourceWord: 'bond', targetWord: 'efnatengi' }, { sourceWord: 'atom', targetWord: 'frumeind' }] };
    expect(glossaryContentHash(a)).toBe(glossaryContentHash(b));
  });

  it('changes when a target word changes', () => {
    const good = { terms: [{ sourceWord: 'magnesium', targetWord: 'magnesíum' }] };
    const bad = { terms: [{ sourceWord: 'magnesium', targetWord: 'magnesín' }] };
    expect(glossaryContentHash(good)).not.toBe(glossaryContentHash(bad));
  });

  it('changes when a term is added', () => {
    const one = { terms: [{ sourceWord: 'atom', targetWord: 'frumeind' }] };
    const two = { terms: [...one.terms, { sourceWord: 'bond', targetWord: 'efnatengi' }] };
    expect(glossaryContentHash(one)).not.toBe(glossaryContentHash(two));
  });
});

describe('buildRunRecord', () => {
  const base = {
    chars: 1200,
    usage: 1200,
    estimatedIsk: 12,
    markersNormalized: 2,
    mismatches: [{ segId: 'a' }],
    bracketDelta: { i: -1 },
    unwrapped: [{ type: 'i' }, { type: 'i' }, { type: 'sub' }],
    glossaryArm: 'glossary',
    glossaryHash: 'deadbeef',
    glossaryTermCount: 2097,
  };

  it('stamps its own version', () => {
    expect(buildRunRecord(base).runRecordVersion).toBe(RUN_RECORD_VERSION);
  });

  it('records counts, never the raw arrays', () => {
    const r = buildRunRecord(base);
    expect(r.mismatchCount).toBe(1);
    expect(r.unwrappedCount).toBe(3);
    expect(r.mismatches).toBeUndefined();
    expect(r.unwrapped).toBeUndefined();
  });

  it('tallies unwrapped markers by type', () => {
    expect(buildRunRecord(base).unwrappedByType).toEqual({ i: 2, sub: 1 });
  });

  it('carries the bracket delta through unchanged', () => {
    expect(buildRunRecord(base).bracketDelta).toEqual({ i: -1 });
  });

  it('records the glossary arm and hash together', () => {
    expect(buildRunRecord(base).glossary).toEqual({
      arm: 'glossary',
      contentHash: 'deadbeef',
      termCount: 2097,
    });
  });

  it('is stable when the optional arrays are absent', () => {
    const r = buildRunRecord({ ...base, mismatches: undefined, unwrapped: undefined, bracketDelta: undefined });
    expect(r.mismatchCount).toBe(0);
    expect(r.unwrappedCount).toBe(0);
    expect(r.unwrappedByType).toEqual({});
    expect(r.bracketDelta).toEqual({});
  });

  it('is JSON round-trippable', () => {
    const r = buildRunRecord(base);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/run-record.test.js`
Expected: FAIL — `Cannot find module '../lib/run-record.js'`.

- [ ] **Step 3: Implement the module**

Create `tools/lib/run-record.js`:

```javascript
/**
 * run-record.js — the per-module MT run record (§C82 prerequisite 2).
 *
 * `writeProvenance` (tools/lib/provenance.js) records WHO produced a module's
 * MT output. This module records WHAT HAPPENED while producing it.
 *
 * Why it has to exist: the in-pipeline repairs erase their own evidence before
 * the file is written. `repairSegTags`, `normalizeSegMarkers` and
 * `unwrapInventedMarkers` all fix their finding and proceed, so a post-hoc scan
 * of 02-mt-output reads identically for a clean run and a heavily-repaired one.
 * Battery checks A2(a), A4 and A8, and the §C82 ③ glossary-arm decision, read
 * these counters; without them those checks are ceremony.
 *
 * Everything here is a bounded scalar or a small tally — never a raw text
 * array — so the sidecar cannot grow with module size.
 *
 * Design: docs/superpowers/specs/2026-08-13-remt-check-battery.md §5 item 2.
 */
import crypto from 'node:crypto';

export const RUN_RECORD_VERSION = 1;

/**
 * Stable content hash of the glossary actually handed to the MT step.
 *
 * Sorted by the source\ttarget pair so payload key order cannot change the
 * hash. The §C82 ③ arm decision is only valid for the glossary it was measured
 * on — a later glossary change must invalidate it, and this is how the ledger
 * notices.
 *
 * @param {{terms?: Array<{sourceWord: string, targetWord: string}>}|null} glossary
 * @returns {string|null} sha256 hex, or null when no glossary was sent
 */
export function glossaryContentHash(glossary) {
  const terms = glossary?.terms;
  if (!Array.isArray(terms) || terms.length === 0) return null;
  const canonical = terms
    .map((t) => `${t.sourceWord}\t${t.targetWord}`)
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Tally `{type}`-bearing findings into `{type: count}`.
 * @param {Array<{type?: string}>|undefined} items
 * @returns {Record<string, number>}
 */
function tallyByType(items) {
  const out = {};
  for (const it of items || []) {
    const t = it?.type ?? 'unknown';
    out[t] = (out[t] || 0) + 1;
  }
  return out;
}

/**
 * Build the run record from translateModule's return value plus its inputs.
 *
 * @param {object} p
 * @param {number} p.chars input characters sent to the API
 * @param {number} p.usage API-reported usage units
 * @param {number} p.estimatedIsk estimateIsk(chars) — an estimate, never the invoice
 * @param {number} p.markersNormalized SEG markers un-glued by normalizeSegMarkers
 * @param {Array<object>} [p.mismatches] per-segment id-reattachment mismatches
 * @param {Record<string, number>} [p.bracketDelta] module-level bracket delta
 * @param {Array<{type: string}>} [p.unwrapped] invented glossary markers removed
 * @param {'glossary'|'no-glossary'} p.glossaryArm which arm this run used
 * @param {string|null} p.glossaryHash glossaryContentHash of the glossary sent
 * @param {number|null} p.glossaryTermCount terms in the unfiltered glossary
 * @returns {object} the run record, JSON-serializable
 */
export function buildRunRecord({
  chars,
  usage,
  estimatedIsk,
  markersNormalized,
  mismatches,
  bracketDelta,
  unwrapped,
  glossaryArm,
  glossaryHash,
  glossaryTermCount,
}) {
  return {
    runRecordVersion: RUN_RECORD_VERSION,
    chars,
    usage,
    estimatedIsk,
    markersNormalized,
    mismatchCount: (mismatches || []).length,
    bracketDelta: bracketDelta || {},
    unwrappedCount: (unwrapped || []).length,
    unwrappedByType: tallyByType(unwrapped),
    glossary: {
      arm: glossaryArm,
      contentHash: glossaryHash,
      termCount: glossaryTermCount,
    },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tools/__tests__/run-record.test.js`
Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add tools/lib/run-record.js tools/__tests__/run-record.test.js
git commit -m "feat(C82): the per-module MT run record shape

The in-pipeline repairs erase their own evidence before the file is written,
so a post-hoc scan of 02-mt-output reads identically for a clean run and a
heavily-repaired one. buildRunRecord captures the counters api-translate
already computes and discards; glossaryContentHash keys the §C82 arm decision
to the glossary it was measured on.

Pure module, no call site yet. Battery spec §5 item 2."
```

---

## Task 3: the provenance sidecar carries the run record

**Files:**
- Modify: `tools/lib/provenance.js:4` (`SCHEMA_VERSION`), `:28-41` (`writeProvenance`)
- Test: `tools/__tests__/provenance.test.js` (existing — append)

**Interfaces:**
- Consumes: Task 2's run-record object shape (as an opaque value — `provenance.js` does not import `run-record.js`; it stores whatever it is handed).
- Produces: `writeProvenance(dir, moduleId, {tool, generatedAt, run})` — `run` is optional and additive. `readProvenance` returns it as `parsed.run`, `undefined` on a v1 sidecar.

**Why `provenance.js` does not import `run-record.js`:** the sidecar owns *storage*, the run-record module owns *shape*. Keeping them apart means Plan C's driver can add `extractionFingerprint` and `gateVersions` to the same `run` object without touching this file.

- [ ] **Step 1: Write the failing test**

Append to `tools/__tests__/provenance.test.js`:

```javascript
describe('the run record rides in the provenance sidecar (§C82 prerequisite 2)', () => {
  it('persists a run record and reads it back intact', () => {
    const run = {
      runRecordVersion: 1,
      chars: 1200,
      markersNormalized: 2,
      bracketDelta: { i: -1 },
      unwrappedCount: 3,
      glossary: { arm: 'glossary', contentHash: 'deadbeef', termCount: 2097 },
    };
    writeProvenance(dir, 'm12345', { tool: 'api-translate', run });
    expect(readProvenance(dir, 'm12345').run).toEqual(run);
  });

  it('omits the key entirely when no run record is supplied', () => {
    writeProvenance(dir, 'm12346', { tool: 'api-translate' });
    const parsed = readProvenance(dir, 'm12346');
    expect('run' in parsed).toBe(false);
  });

  it('still reads a v1 sidecar written before the run record existed', () => {
    fs.writeFileSync(
      path.join(dir, 'm12347-provenance.json'),
      JSON.stringify({ schemaVersion: 1, tool: 'api-translate', generatedAt: '2026-01-01T00:00:00Z' })
    );
    const parsed = readProvenance(dir, 'm12347');
    expect(parsed.tool).toBe('api-translate');
    expect(parsed.run).toBeUndefined();
  });

  it('validates the tool before writing, run record or not', () => {
    expect(() => writeProvenance(dir, 'm12348', { tool: 'nope', run: {} })).toThrow(/Unknown provenance tool/);
  });
});
```

> **Note for the implementer:** `dir`, `fs` and `path` are already in scope in this file — it has a `beforeEach` creating a temp dir. Read the top of the file before adding imports; do not add duplicates.

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/provenance.test.js`
Expected: FAIL — the first case fails with `expected undefined to deeply equal { … }`, because `writeProvenance` ignores the `run` key.

- [ ] **Step 3: Implement**

In `tools/lib/provenance.js`, bump the version at line 4:

```javascript
// v2 (§C82): an optional `run` key carrying the per-module MT run record.
// Purely additive — a v1 sidecar reads fine and simply has no `run`.
export const SCHEMA_VERSION = 2;
```

and replace `writeProvenance` (lines 28-41):

```javascript
/**
 * Stamp producer provenance next to a module's MT output.
 *
 * @param {string} mtOutputChapterDir
 * @param {string} moduleId
 * @param {object} opts
 * @param {string} opts.tool must be a KNOWN_TOOLS key
 * @param {string} [opts.generatedAt] ISO timestamp; defaults to now
 * @param {object} [opts.run] the per-module run record (tools/lib/run-record.js).
 *   Stored opaquely: this module owns storage, run-record.js owns shape, so
 *   Plan C can add fields without touching this file. Omitted when absent, so a
 *   sidecar written without one is byte-identical to a v1 sidecar bar the version.
 * @returns {object} the payload written
 */
export function writeProvenance(mtOutputChapterDir, moduleId, { tool, generatedAt, run } = {}) {
  restorePolicyFor(tool); // validate before writing
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    tool,
    generatedAt: generatedAt || new Date().toISOString(),
  };
  if (run !== undefined && run !== null) payload.run = run;
  fs.writeFileSync(
    provenancePath(mtOutputChapterDir, moduleId),
    JSON.stringify(payload, null, 2) + '\n',
    'utf8'
  );
  return payload;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tools/__tests__/provenance.test.js`
Expected: PASS. The pre-existing cases must stay green — `provenance.test.js:41` compares against the `SCHEMA_VERSION` *constant*, not a literal `1`, so the bump does not break it. If any pre-existing case fails, stop and report rather than editing the assertion.

- [ ] **Step 5: Run the suite**

Run: `npm test && npm run lint && npm run format:check`
Expected: green. Pay attention to `tools/__tests__/backfill-provenance.test.js` and `tools/__tests__/docx-import-provenance.test.js` — both write sidecars.

- [ ] **Step 6: Commit**

```bash
git add tools/lib/provenance.js tools/__tests__/provenance.test.js
git commit -m "feat(C82): provenance sidecar v2 carries an optional run record

Additive: \`run\` is written only when supplied, and readProvenance returns
undefined for it on a v1 sidecar. Storage lives here, shape lives in
run-record.js, so Plan C can add extractionFingerprint/gateVersions without
touching this file."
```

---

## Task 4: `api-translate` persists what it already computed

Today `translateModule` returns six counters at `tools/api-translate.js:1195-1202` and **they go nowhere** — two are `console.error` notes, the rest are summed into a run total and dropped. `writeProvenance` is called at `:1167`, *before* `bracketDelta` is computed at `:1181`.

**The fix moves the computation up, never the write down.** Moving the write later would put more code between "output file written" and "provenance written", and `resolveRestorePolicy` **throws** when a segment file exists with no sidecar — a wider window there is a real hazard, not a stylistic one.

**Files:**
- Modify: `tools/api-translate.js` — import line ~40; the block at `:1159-1202`
- Test: `tools/__tests__/api-translate-provenance.test.js` (existing — append)

**Interfaces:**
- Consumes: `buildRunRecord`, `glossaryContentHash` from Task 2; `writeProvenance`'s `run` option from Task 3.
- Produces: every `books/*/02-mt-output/**/mNNNNN-provenance.json` written from now on carries `.run`. Plan B's A2(a)/A4/A8 and Plan C's ledger read it.

- [ ] **Step 1: Write the failing test**

Append to `tools/__tests__/api-translate-provenance.test.js`. Extend the existing import from `../api-translate.js` to include `translateModule`, and add `import { readProvenance } from '../lib/provenance.js';` only if not already imported (it is — line 5).

```javascript
describe('translateModule persists the run record (§C82 prerequisite 2)', () => {
  /** A stub Málstaður client: echoes the wire text back, so every SEG marker survives. */
  const echoClient = {
    translateAuto: async (text) => ({ text, usage: text.length }),
  };

  const SEGMENTS = [
    '<!-- SEG:m66372:para:p1 -->',
    'The [[i:atom]] is the unit of an element.',
    '',
    '<!-- SEG:m66372:para:p2 -->',
    'A [[sub:2]] subscript rides through unchanged.',
    '',
  ].join('\n');

  it('writes a run record beside the output', async () => {
    const inputPath = path.join(dir, 'm66372-segments.en.md');
    const outputPath = path.join(dir, 'm66372-segments.is.md');
    fs.writeFileSync(inputPath, SEGMENTS);

    await translateModule(echoClient, inputPath, outputPath, null, false);

    const run = readProvenance(dir, 'm66372').run;
    expect(run).toBeDefined();
    expect(run.runRecordVersion).toBe(1);
    expect(run.chars).toBe(SEGMENTS.length);
    expect(run.markersNormalized).toBe(0);
    expect(run.bracketDelta).toEqual({});
    expect(run.unwrappedCount).toBe(0);
  });

  it('records the no-glossary arm when no glossary was sent', async () => {
    const inputPath = path.join(dir, 'm66373-segments.en.md');
    const outputPath = path.join(dir, 'm66373-segments.is.md');
    fs.writeFileSync(inputPath, SEGMENTS.replace(/m66372/g, 'm66373'));

    await translateModule(echoClient, inputPath, outputPath, null, false);

    expect(readProvenance(dir, 'm66373').run.glossary).toEqual({
      arm: 'no-glossary',
      contentHash: null,
      termCount: null,
    });
  });

  it('records the glossary arm, its hash and its size', async () => {
    const inputPath = path.join(dir, 'm66374-segments.en.md');
    const outputPath = path.join(dir, 'm66374-segments.is.md');
    fs.writeFileSync(inputPath, SEGMENTS.replace(/m66372/g, 'm66374'));
    const glossary = {
      terms: [
        { sourceWord: 'atom', targetWord: 'frumeind' },
        { sourceWord: 'element', targetWord: 'frumefni' },
      ],
    };

    await translateModule(echoClient, inputPath, outputPath, glossary, false);

    const g = readProvenance(dir, 'm66374').run.glossary;
    expect(g.arm).toBe('glossary');
    expect(g.termCount).toBe(2);
    expect(g.contentHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/api-translate-provenance.test.js`
Expected: FAIL — `expected undefined not to be undefined` on `run`, because the sidecar is written without one.

- [ ] **Step 3: Add the imports**

In `tools/api-translate.js`, beside the existing `import { createClient, formatGlossary, estimateIsk } from './lib/malstadur-api.js';` at line 40, add:

```javascript
import { buildRunRecord, glossaryContentHash } from './lib/run-record.js';
```

- [ ] **Step 4: Reorder the block and pass the run record**

Replace `tools/api-translate.js` lines 1159-1202 (from `// Write output` through the closing `}` of the `return`) with:

```javascript
  // Write output
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, output, 'utf8');

  // B3: surface any inline bracket-marker loss/add at the producer, per module. This
  // is a module-level aggregate: a drop in one segment and a spurious add of the same
  // type in another cancel to zero and won't be reported — acceptable for a non-gating
  // diagnostic (any non-cancelling loss still surfaces here and in the run summary).
  // §C82: the per-segment, all-types instrument that DOES catch the cancelling case
  // is bracketMarkerDeltaBySegment; the loop's A3 gate uses that one, not this.
  //
  // MOVED ABOVE the provenance write (§C82) so the run record can carry it. The
  // write must stay as close to fs.writeFileSync as possible: resolveRestorePolicy
  // THROWS when a segment file exists with no sidecar, so every line between the
  // two widens a real failure window.
  const bracketDelta = bracketMarkerDelta(input, output);
  const bracketNote = formatBracketDelta(moduleId, bracketDelta);
  if (bracketNote) console.error(`  Note: ${bracketNote}`);

  // §C67 class 3: markers the MT invented around glossary target words and we
  // removed. Reported, never silent — the rate is the input to deciding whether
  // a glossary is safe to send at its current size.
  if (unwrapped.length) {
    const types = [...new Set(unwrapped.map((u) => u.type))].join(', ');
    console.error(
      `  Note: ${moduleId}: removed ${unwrapped.length} invented glossary marker(s) — ${types}`
    );
  }

  // B2: stamp producer provenance next to the segment file.
  // §C82 prerequisite 2: it now also carries the run record. Without this the
  // in-pipeline repairs erase their own evidence — the counters below exist
  // nowhere else once this function returns.
  writeProvenance(outputDir, moduleIdFromOutputPath(outputPath), {
    tool: 'api-translate',
    run: buildRunRecord({
      chars: input.length,
      usage: totalUsage,
      estimatedIsk: estimateIsk(input.length),
      markersNormalized,
      mismatches,
      bracketDelta,
      unwrapped,
      glossaryArm: glossary ? 'glossary' : 'no-glossary',
      glossaryHash: glossaryContentHash(glossary),
      glossaryTermCount: glossary?.terms?.length ?? null,
    }),
  });

  // Copy -links.json if it exists
  const linksFilename = path.basename(inputPath).replace('-segments.en.md', '-segments-links.json');
  const linksSource = path.join(path.dirname(inputPath), linksFilename);
  if (fs.existsSync(linksSource)) {
    const linksDest = path.join(outputDir, linksFilename);
    fs.copyFileSync(linksSource, linksDest);
  }

  return {
    chars: input.length,
    usage: totalUsage,
    markersNormalized,
    mismatches,
    bracketDelta,
    unwrapped,
  };
}
```

> **Do not change the returned object.** `main()` sums `markersNormalized` and merges `bracketDelta` at `:1442-1456`; altering the return breaks the run summary.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tools/__tests__/api-translate-provenance.test.js`
Expected: PASS, all six cases (three pre-existing, three new).

- [ ] **Step 6: Verify no paid path changed behaviour**

Run: `npx vitest run tools/__tests__/api-translate.test.js tools/__tests__/api-translate-bracket-count.test.js tools/__tests__/api-translate-invented-markers.test.js`
Expected: PASS. These pin the marker functions the reorder moved past.

- [ ] **Step 7: Full suite, lint, format**

Run: `npm test && npm run lint && npm run format:check`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add tools/api-translate.js tools/__tests__/api-translate-provenance.test.js
git commit -m "feat(C82): api-translate persists the run record

The six counters at :1195-1202 went nowhere — two console.error notes, the
rest summed and dropped. The provenance sidecar now carries them.

The bracket-delta COMPUTATION moves above the provenance write rather than the
write moving down: resolveRestorePolicy throws when a segment file exists with
no sidecar, so every line between fs.writeFileSync and writeProvenance widens a
real failure window. Net effect, the write is now EARLIER than before (ahead of
the links copy).

Return value unchanged — main() sums it for the run summary."
```

---

## Task 5: E5 — alt coverage, honest about what the extractor cannot reach

**The check the battery specifies would be a guaranteed false halt.** It asserts *"count of non-empty `alt=` in `01-source` == count of alt segments emitted"*. §C81 shipped at ~82%, so measured post-merge:

| book | source alts | emitted | gap |
|---|---|---|---|
| `efnafraedi-2e` (149 modules) | 1,149 | 951 | **198** |
| `lifraen-efnafraedi` (17-module preview) | 132 | 100 | **32** |

By the battery's own rule — *"any check whose base rate exceeds ~5% cannot be blocking"* — plain equality disqualifies itself. So E5 emits **three** numbers and gates on the middle one.

The gap reconciles **exactly**, which is what makes this specifiable rather than a fudge:

```
chemistry: 1149 − 197 structurally unreachable − 1 real defect (m68727) = 951 ✓
organic:    132 −  32 structurally unreachable − 0                      = 100 ✓
```

The 197 + 32 are four positions `cnxml-extract` never visits for **any** content type. The `−1` is `m68727`: a genuine regex-truncation defect in `processFigure`'s media-matching regex. **So E5 has a live SHOULD-TRIP fixture in the working tree — exactly one chemistry module — and 148 MUST-NOT-TRIP controls.** That is the strongest fixture position of any check in the battery.

**Files:**
- Modify: `tools/lib/extraction-coverage.js` (add `altReachability` + `checkAltCoverage`; extend `analyzeModule`)
- Test: `tools/__tests__/extraction-coverage.test.js` (existing — append unit cases)
- Test: `tools/__tests__/alt-coverage-corpus.test.js` (create — the corpus pin)

**Interfaces:**
- Consumes: `parseModuleDoc` (existing, `extraction-coverage.js:22`).
- Produces:
  - `altReachability(content) => {reachable: number, unreachable: number, unreachableByReason: Record<string, number>}`
  - `checkAltCoverage(content, segText) => {reached, expected, unreached, unreachableByReason, ok}`
  - `analyzeModule(cnxmlText, segText)` gains an `altFindings` key. **`hasFindings` is NOT widened** — see Step 5.

- [ ] **Step 1: Write the failing unit test**

Append to `tools/__tests__/extraction-coverage.test.js`. Add `altReachability` and `checkAltCoverage` to the existing import from `../lib/extraction-coverage.js`.

```javascript
describe('altReachability — the four positions cnxml-extract never visits (§C81 shortfall)', () => {
  const wrap = (inner) => `<document><content>${inner}</content></document>`;
  const reach = (inner) => altReachability(parseModuleDoc(wrap(inner)).content);

  it('counts a figure-wrapped media as reachable', () => {
    const r = reach('<figure id="f1"><media alt="mynd"><image src="a.png"/></media></figure>');
    expect(r).toMatchObject({ reachable: 1, unreachable: 0 });
  });

  it('counts a media in a table entry, outside a figure, as unreachable', () => {
    const r = reach('<table><row><entry><media alt="mynd"><image src="a.png"/></media></entry></row></table>');
    expect(r.unreachable).toBe(1);
    expect(r.unreachableByReason['entry-not-in-figure']).toBe(1);
  });

  it('counts a figure-wrapped media INSIDE a table entry as reachable', () => {
    // The predicate is "in an entry AND not in a figure" — the figure wrapper rescues it.
    const r = reach('<table><row><entry><figure id="f1"><media alt="mynd"><image src="a.png"/></media></figure></entry></row></table>');
    expect(r).toMatchObject({ reachable: 1, unreachable: 0 });
  });

  for (const parent of ['example', 'problem', 'solution', 'note']) {
    it(`counts a bare media directly in <${parent}> as unreachable`, () => {
      const r = reach(`<${parent} id="x"><media alt="mynd"><image src="a.png"/></media></${parent}>`);
      expect(r.unreachable).toBe(1);
      expect(r.unreachableByReason[`bare-media-in-${parent}`]).toBe(1);
    });

    it(`counts a FIGURE-wrapped media in <${parent}> as reachable`, () => {
      const r = reach(`<${parent} id="x"><figure id="f1"><media alt="mynd"><image src="a.png"/></media></figure></${parent}>`);
      expect(r).toMatchObject({ reachable: 1, unreachable: 0 });
    });
  }

  it('ignores media with no alt and media with an empty alt', () => {
    const r = reach('<figure id="f1"><media><image src="a.png"/></media></figure><figure id="f2"><media alt=""><image src="b.png"/></media></figure>');
    expect(r).toMatchObject({ reachable: 0, unreachable: 0 });
  });

  it('reads alt from a child <image> when the <media> carries none', () => {
    const r = reach('<figure id="f1"><media><image src="a.png" alt="mynd"/></media></figure>');
    expect(r.reachable).toBe(1);
  });

  it('is not fooled by an INDIRECT example parent', () => {
    // Only a DIRECT <media> child of these containers is unreachable; one wrapped
    // in a <para> reaches the extractor through the para's inline-media flatten.
    const r = reach('<example id="e1"><para id="p1"><media alt="mynd"><image src="a.png"/></media></para></example>');
    expect(r).toMatchObject({ reachable: 1, unreachable: 0 });
  });
});

describe('checkAltCoverage — three numbers, gates on one', () => {
  const wrap = (inner) => `<document><content>${inner}</content></document>`;
  const SRC = wrap(
    '<figure id="f1"><media alt="fyrsta"><image src="a.png"/></media></figure>' +
      '<figure id="f2"><media alt="önnur"><image src="b.png"/></media></figure>' +
      '<example id="e1"><media alt="ónáanleg"><image src="c.png"/></media></example>'
  );

  it('passes when every reachable alt was emitted, and reports the unreached', () => {
    const seg = '<!-- SEG:m1:alt:f1-alt -->\nfyrsta\n\n<!-- SEG:m1:alt:f2-alt -->\nönnur\n';
    const r = checkAltCoverage(parseModuleDoc(SRC).content, seg);
    expect(r).toMatchObject({ reached: 2, expected: 2, unreached: 1, ok: true });
  });

  it('fails when a reachable alt was dropped', () => {
    const seg = '<!-- SEG:m1:alt:f1-alt -->\nfyrsta\n';
    const r = checkAltCoverage(parseModuleDoc(SRC).content, seg);
    expect(r).toMatchObject({ reached: 1, expected: 2, ok: false });
  });

  it('fails when MORE alt segments were emitted than the source has reachable alts', () => {
    // The duplicate-emission direction §C81 Task 10 closed. Equality, not >=.
    const seg =
      '<!-- SEG:m1:alt:f1-alt -->\nfyrsta\n\n<!-- SEG:m1:alt:f2-alt -->\nönnur\n\n<!-- SEG:m1:alt:media-0-alt -->\nafrit\n';
    const r = checkAltCoverage(parseModuleDoc(SRC).content, seg);
    expect(r).toMatchObject({ reached: 3, expected: 2, ok: false });
  });

  it('reports the examined count even on a figure-less module, so a pass is not vacuous', () => {
    const r = checkAltCoverage(parseModuleDoc(wrap('<para id="p1">engar myndir</para>')).content, '');
    expect(r).toMatchObject({ reached: 0, expected: 0, unreached: 0, ok: true });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/extraction-coverage.test.js`
Expected: FAIL — `altReachability is not a function`.

- [ ] **Step 3: Implement**

Append to `tools/lib/extraction-coverage.js`, after `checkDuplicateSegIds` (which ends at line 160) and before `analyzeModule`:

```javascript
/**
 * Containers whose DIRECT <media> child the extractor never visits.
 *
 * Measured on the post-§C81 tree (test-results/c81-alt-extraction-2026-08-15.json):
 * a bare <media> — no <figure> wrapper — that is a direct child of one of these
 * has no emitter on any walk. A <media> one level down, inside a <para>, DOES
 * reach the extractor through the para's inline-media flatten, which is why the
 * predicate is DIRECT parent and not ancestor.
 */
const ALT_BLIND_DIRECT_PARENTS = new Set(['example', 'problem', 'solution', 'note']);

/** True if `el` has an ancestor of the given localName, up to <content>. */
function hasAncestor(el, localName) {
  let n = el.parentNode;
  while (n && n.nodeType === 1 && n.localName !== 'content') {
    if (n.localName === localName) return true;
    n = n.parentNode;
  }
  return false;
}

/** The non-empty alt a <media> carries, on itself or on its child <image>/<iframe>. */
function mediaAlt(media) {
  const own = media.getAttribute('alt');
  if (own && own.trim()) return own;
  for (let i = 0; i < media.childNodes.length; i++) {
    const c = media.childNodes[i];
    if (c.nodeType !== 1) continue;
    if (c.localName !== 'image' && c.localName !== 'iframe') continue;
    const a = c.getAttribute('alt');
    if (a && a.trim()) return a;
  }
  return null;
}

/**
 * Split a module's alt-bearing <media> elements into the set `cnxml-extract` is
 * designed to reach and the set it structurally cannot.
 *
 * ⚠️ WHY THIS SPLIT EXISTS AT ALL. §C81 put figure alt into the pipeline but
 * reaches ~82% of the corpus's alt attributes: 197 of chemistry's 1,149 and 32 of
 * organic's 132 sit in four positions no walk visits, for any content type. That
 * is a PRE-EXISTING extraction-coverage defect, not a §C81 regression. Asserting
 * plain source==emitted equality would fail on ~17–24% of attributes, which by the
 * battery's own "base rate over ~5% cannot be blocking" rule disqualifies the check.
 * So the gate is on `reachable`, and `unreachable` is REPORTED — pinned by
 * tools/__tests__/alt-coverage-corpus.test.js so any change in it is visible.
 *
 * Whether to extend extraction to those four positions is undecided and tracked in
 * the register (§C81), not here.
 *
 * @param {Element|null} content the module's <content> element
 * @returns {{reachable: number, unreachable: number, unreachableByReason: Record<string, number>}}
 */
export function altReachability(content) {
  const out = { reachable: 0, unreachable: 0, unreachableByReason: {} };
  if (!content) return out;
  const media = content.getElementsByTagName('media');
  for (let i = 0; i < media.length; i++) {
    const el = media[i];
    if (!mediaAlt(el)) continue;

    const inFigure = hasAncestor(el, 'figure');
    let reason = null;
    if (!inFigure && hasAncestor(el, 'entry')) {
      reason = 'entry-not-in-figure';
    } else if (!inFigure) {
      const parent = el.parentNode;
      const pName = parent && parent.nodeType === 1 ? parent.localName : null;
      if (pName && ALT_BLIND_DIRECT_PARENTS.has(pName)) reason = `bare-media-in-${pName}`;
    }

    if (reason) {
      out.unreachable++;
      out.unreachableByReason[reason] = (out.unreachableByReason[reason] || 0) + 1;
    } else {
      out.reachable++;
    }
  }
  return out;
}

/**
 * E5 — alt coverage. Emits three numbers, always, and gates on one.
 *
 *   reached   how many alt segments the extractor actually emitted
 *   expected  how many alt attributes sit in positions it is designed to reach
 *   unreached how many sit in the four blind positions (reported, never a halt)
 *
 * Equality, not >=: the over-emission direction is the duplicate-alt defect
 * §C81 Task 10 closed, and it must not be allowed to reopen silently.
 *
 * `unreached` is reported even on a figure-less module so a pass can be told
 * apart from a vacuous one (§C60: a check reported `Total findings: 0` while
 * reading zero files).
 *
 * @param {Element|null} content
 * @param {string} segText the module's 02-for-mt segment file text
 * @returns {{reached: number, expected: number, unreached: number, unreachableByReason: Record<string, number>, ok: boolean}}
 */
export function checkAltCoverage(content, segText) {
  const { reachable, unreachable, unreachableByReason } = altReachability(content);
  let reached = 0;
  for (const id of parseSegmentsMap(String(segText || '')).keys()) {
    if (String(id).split(':')[1] === 'alt') reached++;
  }
  return {
    reached,
    expected: reachable,
    unreached: unreachable,
    unreachableByReason,
    ok: reached === reachable,
  };
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run tools/__tests__/extraction-coverage.test.js`
Expected: PASS, all cases including the pre-existing ones.

- [ ] **Step 5: Wire it into `analyzeModule` WITHOUT widening `hasFindings`**

Replace `analyzeModule` at `tools/lib/extraction-coverage.js:163-171`:

```javascript
/** Run all v1 checks on one module's source CNXML + segment file text. */
export function analyzeModule(cnxmlText, segText) {
  const { content } = parseModuleDoc(cnxmlText);
  const listFindings = checkLists(content, emittedElementIds(segText));
  const dupFindings = checkDuplicateSegIds(content, segText);
  const altFindings = checkAltCoverage(content, segText);
  const realDups = dupFindings.rawDup.filter((d) => d.kind === 'real');
  const hasFindings =
    listFindings.length > 0 || dupFindings.sourceDup.length > 0 || realDups.length > 0;
  // ⚠️ altFindings is REPORTED, not folded into hasFindings. verify-extraction-coverage.js
  // exits on hasFindings, and every module in the tree is pre-re-extract today — zero alt
  // segments exist corpus-wide — so folding it in turns the existing gate red for all 1,192
  // modules the moment this lands. Plan C's driver reads altFindings.ok directly as its own
  // E5 gate, after the §C81 re-extract. Do not widen this without re-extracting first.
  return { listFindings, dupFindings, altFindings, hasFindings };
}
```

- [ ] **Step 6: Write the corpus pin, and run it against today's tree**

Create `tools/__tests__/alt-coverage-corpus.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseModuleDoc, altReachability } from '../lib/extraction-coverage.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Every .cnxml under a book's 01-source, recursively. */
function sourceModules(book) {
  const root = path.join(REPO_ROOT, 'books', book, '01-source');
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.cnxml')) out.push(p);
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

function census(files) {
  const total = { reachable: 0, unreachable: 0, unreachableByReason: {} };
  for (const f of files) {
    const { content } = parseModuleDoc(fs.readFileSync(f, 'utf8'));
    const r = altReachability(content);
    total.reachable += r.reachable;
    total.unreachable += r.unreachable;
    for (const [k, n] of Object.entries(r.unreachableByReason)) {
      total.unreachableByReason[k] = (total.unreachableByReason[k] || 0) + n;
    }
  }
  return total;
}

describe('§C81 alt shortfall is pinned, so a change in it is visible', () => {
  it('chemistry: 149 modules is the control', () => {
    expect(sourceModules('efnafraedi-2e').length).toBe(149);
  });

  it('chemistry: 197 alt attributes sit in the four blind positions', () => {
    const t = census(sourceModules('efnafraedi-2e'));
    expect(t.unreachable).toBe(197);
    expect(t.reachable + t.unreachable).toBe(1149);
  });

  it('chemistry: the blind positions break down exactly as measured 2026-08-15', () => {
    expect(census(sourceModules('efnafraedi-2e')).unreachableByReason).toEqual({
      'entry-not-in-figure': 29,
      'bare-media-in-example': 105,
      'bare-media-in-problem': 40,
      'bare-media-in-solution': 13,
      'bare-media-in-note': 10,
    });
  });
});
```

> **⚠️ Do not add an organic assertion to this file.** `test-results/c81-alt-extraction-2026-08-15.json` measured the organic **preview** — 17 named modules — while `sourceModules('lifraen-efnafraedi')` returns all **342**. Measured 2026-08-15 for the whole book: **245 unreachable, every one of them `entry-not-in-figure`, out of 2,163 total.** The preview's 32 is a subset of that 245, and there is no way to recover the subset without the preview module list — which Plan C's driver owns. Pinning 245 here would silently change what the check is about.

- [ ] **Step 7: Run the corpus pin**

Run: `npx vitest run tools/__tests__/alt-coverage-corpus.test.js`

**✅ These expectations were pre-validated 2026-08-15**, before this plan was handed over: the predicate above was run over all 149 chemistry modules and reproduced the §C81 artifact **exactly** — `unreachable` 197, `reachable + unreachable` 1,149, and every one of the five reason buckets (105 / 29 / 40 / 13 / 10). So a failure here means the *implementation* drifted from the predicate as written, not that the numbers are guesses.

Two results from that pre-validation worth carrying:

- **`reachable` is 952 against 951 emitted.** That one-module delta is `m68727`'s regex-truncation defect — so once the re-extract lands, E5 is expected to fire on **exactly one** chemistry module. A different count is a finding.
- **The non-global-`processFigure` worry is empirically dead for this scope.** A figure holding two alt-bearing media would make `reachable` overcount, since `processFigure`'s media regex reaches only the first. Measured: **0 such figures in chemistry, 0 in organic.** (`m66449`, the known instance, is biology — out of §C80's scope.)

**If the breakdown differs anyway, STOP and report the actual numbers** — do not edit the expectation to match. A mismatch means either the predicate is wrong or `01-source` changed, and both are findings, not test maintenance.

- [ ] **Step 8: Verify E5 discriminates on live corpus data**

This is the step that proves E5 is a check and not ceremony. Run it as a one-off script (scratch, not committed):

```bash
node --input-type=module -e "
import fs from 'node:fs';
import path from 'node:path';
import { parseModuleDoc, checkAltCoverage } from './tools/lib/extraction-coverage.js';
const src = 'books/efnafraedi-2e/01-source';
let firing = [];
for (const ch of fs.readdirSync(src)) {
  const d = path.join(src, ch);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.cnxml'))) {
    const id = f.replace('.cnxml', '');
    const seg = path.join('books/efnafraedi-2e/02-for-mt', ch, id + '-segments.en.md');
    const segText = fs.existsSync(seg) ? fs.readFileSync(seg, 'utf8') : '';
    const r = checkAltCoverage(parseModuleDoc(fs.readFileSync(path.join(d, f), 'utf8')).content, segText);
    if (!r.ok) firing.push([id, r.reached, r.expected]);
  }
}
console.log('modules where E5 fires:', firing.length);
console.log(firing.slice(0, 5));
"
```

Expected **today, pre-re-extract**: E5 fires on every module that has any reachable alt, because zero alt segments exist in `02-for-mt` corpus-wide. That is the battery's documented SHOULD-TRIP (*"today's tree: chem 1,149 alt attrs → 0 alt segments"*) — **so a non-zero count here is the check working, not a bug.** Record the number in the commit message.

The `m68727` single-module true positive only becomes visible **after** the re-extract, which is out of this plan's scope. Note that in the commit message too, so nobody later reads "E5 fires on 149 modules" as a defect.

- [ ] **Step 9: Full suite, lint, format**

Run: `npm test && npm run lint && npm run format:check`
Expected: green. Confirm `tools/__tests__/dup-segid-gate.test.js` is still green — it consumes `analyzeModule`.

- [ ] **Step 10: Commit**

```bash
git add tools/lib/extraction-coverage.js tools/__tests__/extraction-coverage.test.js \
        tools/__tests__/alt-coverage-corpus.test.js
git commit -m "feat(C82): E5 alt coverage, gating on the reachable set

The battery specifies source==emitted equality. §C81 ships at ~82%, so that
would fail on 198 of chemistry's 1,149 and 32 of organic preview's 132 — a base
rate the battery's own '>5% cannot be blocking' rule disqualifies.

E5 emits three numbers instead: reached, expected (alts in positions
cnxml-extract is designed to reach), unreached (the four blind positions,
reported not halted). The gap reconciles exactly — 1149 − 197 − 1 = 951 — where
the −1 is m68727's real regex-truncation defect, E5's eventual single-module
true positive.

analyzeModule reports altFindings but does NOT fold it into hasFindings: zero
alt segments exist corpus-wide pre-re-extract, so folding it in would turn the
existing extraction-coverage gate red for all 1,192 modules.

alt-coverage-corpus.test.js pins the 197 and its per-reason breakdown, so
closing the §C81 shortfall becomes a visible, deliberate change."
```

---

## Task 6: A3 — the per-segment, all-types marker delta

The flagship gate. `bracketMarkerDelta` (`tools/api-translate.js:467`) is a **module-level aggregate over 14 of the 20 known types**, so it has two proven blind spots:

1. **Cancellation.** A drop in one segment and an invention of the same type in another sum to zero.
2. **Missing types.** `MATH`, `TABLE`, `SPACE`, `BR`, `math`, `EQ` are in `KNOWN_BRACKET_TYPES` but not `BRACKET_MARKER_TYPES`, so they are never counted. Measured: **`m68823` returns `{}` while its MATH markers went 56 → 54.** Three more chemistry modules do the same — `m68819` 120→119, `m68832` 9→8, `m68852` 52→50 — 4 in 227 pairs, ~1.8%.

**Do not modify `BRACKET_MARKER_TYPES` or `bracketMarkerDelta`.** They are consumed by `countBracketMarkers`, `unwrapInventedMarkers` and the run summary, and pinned by `api-translate-bracket-count.test.js`. Widening them in place changes the meaning of the producer's existing note. Add a new function; the loop's A3 gate uses that one.

**§C69 comparability, recorded here because it is a [LEAD] decision, not a silent fix:** this instrument is deliberately **stricter than the pilot's**. The pilot's marker results and the full run's are **not directly comparable**. Say so wherever the two are put side by side.

**Files:**
- Modify: `tools/api-translate.js` (add `countBracketMarkersAll`, `bracketMarkerDeltaBySegment` beside the existing pair at :449-482)
- Test: `tools/__tests__/api-translate-bracket-count.test.js` (existing — append)
- Test: `tools/__tests__/bracket-delta-corpus.test.js` (create — the live acceptance trio)

**Interfaces:**
- Consumes: `BRACKET_MARKER_TYPES`, `KNOWN_BRACKET_TYPES` (existing exports, unmodified); `parseSegmentsMap` from `tools/lib/seg-markers.cjs`.
- Produces:
  - `countBracketMarkersAll(text) => Record<string, number>` — over `KNOWN_BRACKET_TYPES`
  - `bracketMarkerDeltaBySegment(input, output) => {bySegment: Record<string, Record<string, number>>, total: Record<string, number>, segmentsExamined: number, segmentsWithDelta: number, unpairedSegIds: string[]}`

  Plan C's driver gates on `segmentsWithDelta > 0 || unpairedSegIds.length > 0`.

- [ ] **Step 1: Write the failing unit test**

Append to `tools/__tests__/api-translate-bracket-count.test.js`. Add `countBracketMarkersAll` and `bracketMarkerDeltaBySegment` to the existing import from `../api-translate.js`.

```javascript
describe('countBracketMarkersAll — the six types the 14-type set omits', () => {
  it('counts MATH, TABLE, SPACE, BR, math and EQ', () => {
    const c = countBracketMarkersAll('[[MATH:1]] [[TABLE:2]] [[SPACE:3]] [[BR:4]] [[math:5]] [[EQ:6]]');
    expect(c.MATH).toBe(1);
    expect(c.TABLE).toBe(1);
    expect(c.SPACE).toBe(1);
    expect(c.BR).toBe(1);
    expect(c.math).toBe(1);
    expect(c.EQ).toBe(1);
  });

  it('still counts the original 14', () => {
    expect(countBracketMarkersAll('[[i:x]] [[sub:2]]')).toMatchObject({ i: 1, sub: 1 });
  });
});

describe('bracketMarkerDeltaBySegment — per segment, so losses cannot cancel', () => {
  const EN = [
    '<!-- SEG:m1:para:p1 -->',
    'A [[i:first]] and a [[i:second]].',
    '',
    '<!-- SEG:m1:para:p2 -->',
    'Plain text.',
    '',
  ].join('\n');

  it('reports {} when nothing changed', () => {
    const r = bracketMarkerDeltaBySegment(EN, EN);
    expect(r.total).toEqual({});
    expect(r.segmentsWithDelta).toBe(0);
    expect(r.segmentsExamined).toBe(2);
  });

  it('catches a loss and an invention that cancel at module level', () => {
    // p1 loses one [[i:]], p2 gains one. The MODULE-level delta is zero.
    const IS = [
      '<!-- SEG:m1:para:p1 -->',
      'Eitt [[i:fyrsta]] og annað.',
      '',
      '<!-- SEG:m1:para:p2 -->',
      'Venjulegur [[i:texti]].',
      '',
    ].join('\n');
    const r = bracketMarkerDeltaBySegment(EN, IS);
    expect(r.total).toEqual({});
    expect(r.segmentsWithDelta).toBe(2);
    expect(r.bySegment['m1:para:p1']).toEqual({ i: -1 });
    expect(r.bySegment['m1:para:p2']).toEqual({ i: 1 });
  });

  it('catches a MATH loss the 14-type instrument cannot see', () => {
    const en = '<!-- SEG:m1:para:p1 -->\n[[MATH:1]] and [[MATH:2]].\n';
    const is = '<!-- SEG:m1:para:p1 -->\n[[MATH:1]] og.\n';
    expect(bracketMarkerDeltaBySegment(en, is).bySegment['m1:para:p1']).toEqual({ MATH: -1 });
  });

  it('reports a segment present in one side and not the other', () => {
    const is = '<!-- SEG:m1:para:p1 -->\nEitt [[i:fyrsta]] og [[i:annað]].\n';
    const r = bracketMarkerDeltaBySegment(EN, is);
    expect(r.unpairedSegIds).toEqual(['m1:para:p2']);
  });

  it('reports the number of units it examined even when clean', () => {
    // §C60: a check reported `Total findings: 0` while reading zero files.
    const r = bracketMarkerDeltaBySegment('', '');
    expect(r.segmentsExamined).toBe(0);
    expect(r.segmentsWithDelta).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/api-translate-bracket-count.test.js`
Expected: FAIL — `countBracketMarkersAll is not a function`.

- [ ] **Step 3: Implement**

In `tools/api-translate.js`, add after `formatBracketDelta` (which ends at line 482). The file already imports `seg-markers.cjs`; confirm with `grep -an "seg-markers" tools/api-translate.js` and add the import if it does not — `import segMarkers from './lib/seg-markers.cjs'; const { parseSegmentsMap } = segMarkers;`.

```javascript
/**
 * Tally inline bracket markers over EVERY type our pipeline can emit —
 * KNOWN_BRACKET_TYPES, not the 14-type BRACKET_MARKER_TYPES.
 *
 * The six extra (MATH, TABLE, SPACE, BR, math, EQ) are exactly the ones
 * `bracketMarkerDelta` is blind to: measured, m68823 returns `{}` while its MATH
 * markers went 56 → 54, and m68819/m68832/m68852 do the same.
 *
 * @param {string} text
 * @returns {Record<string, number>}
 */
export function countBracketMarkersAll(text) {
  const counts = {};
  const s = String(text || '');
  for (const type of KNOWN_BRACKET_TYPES) {
    counts[type] = (s.match(new RegExp(`\\[\\[${type}:`, 'g')) || []).length;
  }
  return counts;
}

/**
 * A3 — per-SEGMENT, all-types bracket-marker delta, output minus input.
 *
 * Two things this fixes about `bracketMarkerDelta`, which stays as-is for the
 * producer's own note:
 *   1. CANCELLATION. A module-level sum hides a drop in one segment against an
 *      invention of the same type in another.
 *   2. MISSING TYPES. The 14-type set omits MATH/TABLE/SPACE/BR/math/EQ.
 *
 * ⚠️ §C69 comparability call, ruled by the [LEAD] 2026-08-13: this is
 * DELIBERATELY stricter than the pilot's instrument. The full run's marker
 * results are NOT directly comparable to the pilot's headline. Say so wherever
 * the two appear side by side.
 *
 * A segment present on one side only is never silently skipped — it lands in
 * `unpairedSegIds`, because a missing segment is a worse defect than a marker
 * delta and a comparison that quietly drops it reads as clean.
 *
 * @param {string} input pre-translation text (whole module, SEG-marked)
 * @param {string} output post-translation text
 * @returns {{bySegment: Record<string, Record<string, number>>, total: Record<string, number>, segmentsExamined: number, segmentsWithDelta: number, unpairedSegIds: string[]}}
 */
export function bracketMarkerDeltaBySegment(input, output) {
  const a = parseSegmentsMap(String(input || ''));
  const b = parseSegmentsMap(String(output || ''));

  const bySegment = {};
  const total = {};
  const unpairedSegIds = [];
  let segmentsWithDelta = 0;

  for (const [segId, enText] of a) {
    if (!b.has(segId)) {
      unpairedSegIds.push(segId);
      continue;
    }
    const ca = countBracketMarkersAll(enText);
    const cb = countBracketMarkersAll(b.get(segId));
    const delta = {};
    for (const type of KNOWN_BRACKET_TYPES) {
      if (ca[type] !== cb[type]) {
        const d = cb[type] - ca[type];
        delta[type] = d;
        total[type] = (total[type] || 0) + d;
      }
    }
    if (Object.keys(delta).length > 0) {
      bySegment[segId] = delta;
      segmentsWithDelta++;
    }
  }
  for (const segId of b.keys()) {
    if (!a.has(segId)) unpairedSegIds.push(segId);
  }

  // Drop types whose per-segment deltas summed back to zero — they are noise in
  // `total` but their segments are already counted in segmentsWithDelta.
  for (const [t, n] of Object.entries(total)) if (n === 0) delete total[t];

  return {
    bySegment,
    total,
    segmentsExamined: a.size,
    segmentsWithDelta,
    unpairedSegIds,
  };
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run tools/__tests__/api-translate-bracket-count.test.js`
Expected: PASS, including every pre-existing case (they pin the unmodified `bracketMarkerDelta`).

- [ ] **Step 5: Write the live acceptance trio**

This is the battery's own named acceptance test, run against committed corpus bytes. Create `tools/__tests__/bracket-delta-corpus.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { bracketMarkerDelta, bracketMarkerDeltaBySegment } from '../api-translate.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Read a committed EN/IS pair, or null when either side is absent. */
function pair(book, chapter, moduleId) {
  const en = path.join(REPO_ROOT, 'books', book, '02-for-mt', chapter, `${moduleId}-segments.en.md`);
  const is = path.join(REPO_ROOT, 'books', book, '02-mt-output', chapter, `${moduleId}-segments.is.md`);
  if (!fs.existsSync(en) || !fs.existsSync(is)) return null;
  return { en: fs.readFileSync(en, 'utf8'), is: fs.readFileSync(is, 'utf8') };
}

describe('A3 acceptance — the widening catches what the 14-type module aggregate misses', () => {
  it('m68823: the old instrument returns {} while MATH markers were lost', () => {
    const p = pair('efnafraedi-2e', 'ch20', 'm68823');
    expect(p, 'm68823 EN/IS pair must exist — it is the acceptance fixture').not.toBeNull();

    // The proven false negative: module-level, 14 types, sees nothing.
    expect(bracketMarkerDelta(p.en, p.is)).toEqual({});

    // The new instrument sees the MATH loss.
    const r = bracketMarkerDeltaBySegment(p.en, p.is);
    expect(r.segmentsExamined).toBeGreaterThan(0);
    expect(r.total.MATH).toBeLessThan(0);
  });

  it('m68791: a clean module stays clean — this is what makes the above mean anything', () => {
    const p = pair('efnafraedi-2e', 'ch20', 'm68791');
    expect(p, 'm68791 EN/IS pair must exist — it is the MUST-NOT-TRIP control').not.toBeNull();

    const r = bracketMarkerDeltaBySegment(p.en, p.is);
    expect(r.segmentsExamined).toBeGreaterThan(0);
    expect(r.segmentsWithDelta).toBe(0);
    expect(r.unpairedSegIds).toEqual([]);
  });
});
```

> **⚠️ Chapter directories:** `02-for-mt` and `02-mt-output` use the `ch`-prefixed convention (`ch20`), **not** the bare publication-track form. If a path does not resolve, confirm with `ls books/efnafraedi-2e/02-for-mt/` before changing the test.
>
> **⚠️ If either fixture is missing from the tree, STOP.** Do not delete the test or weaken it to a skip. Report which file is absent — the battery names these three modules as its acceptance trio, and a missing fixture is a finding about the corpus.

- [ ] **Step 6: Run the corpus acceptance test**

Run: `npx vitest run tools/__tests__/bracket-delta-corpus.test.js`
Expected: PASS both. **The first case is the whole point** — it asserts the old instrument is blind *and* the new one is not, in one test, so it cannot pass for the wrong reason.

- [ ] **Step 7: Sweep the three remaining known-bad modules**

Confirm the instrument generalises beyond the one fixture. Scratch, not committed:

```bash
node --input-type=module -e "
import fs from 'node:fs';
import { bracketMarkerDelta, bracketMarkerDeltaBySegment } from './tools/api-translate.js';
for (const [ch, id] of [['ch20','m68823'],['ch20','m68819'],['ch20','m68832'],['ch20','m68852'],['ch20','m68791']]) {
  const en = 'books/efnafraedi-2e/02-for-mt/' + ch + '/' + id + '-segments.en.md';
  const is = 'books/efnafraedi-2e/02-mt-output/' + ch + '/' + id + '-segments.is.md';
  if (!fs.existsSync(en) || !fs.existsSync(is)) { console.log(id, 'MISSING'); continue; }
  const a = fs.readFileSync(en,'utf8'), b = fs.readFileSync(is,'utf8');
  const r = bracketMarkerDeltaBySegment(a,b);
  console.log(id, 'old:', JSON.stringify(bracketMarkerDelta(a,b)), '| new total:', JSON.stringify(r.total), '| segs w/ delta:', r.segmentsWithDelta, '/', r.segmentsExamined);
}
"
```

Expected: `m68819`, `m68832`, `m68852` each show a negative MATH in the new instrument. Their chapter may not be `ch20` — if a module reports `MISSING`, find it with `ls books/efnafraedi-2e/02-for-mt/*/m68819-segments.en.md` and rerun. Record the output in the commit message; it is the evidence that ~1.8% figure is real.

- [ ] **Step 8: Full suite, lint, format**

Run: `npm test && npm run lint && npm run format:check`
Expected: green.

- [ ] **Step 9: Commit**

```bash
git add tools/api-translate.js tools/__tests__/api-translate-bracket-count.test.js \
        tools/__tests__/bracket-delta-corpus.test.js
git commit -m "feat(C82): A3 — per-segment, all-types bracket-marker delta

bracketMarkerDelta is a module-level aggregate over 14 of 20 known types, so it
is blind twice over: a loss in one segment cancels an invention in another, and
MATH/TABLE/SPACE/BR/math/EQ are never counted at all. Measured: m68823 returns
{} while its MATH markers went 56 -> 54.

Adds countBracketMarkersAll + bracketMarkerDeltaBySegment alongside, leaving the
existing pair untouched — they feed the producer's note and the run summary, and
widening them in place would change what that note means.

The corpus test asserts the OLD instrument is blind and the NEW one is not, on
the same committed bytes, so it cannot pass for the wrong reason.

§C69 comparability call (LEAD-ruled 2026-08-13): this is deliberately stricter
than the pilot's instrument. The two sets of marker results are NOT comparable."
```

---

## Task 7: E2 — source-anchored bracket bodies

E2 asserts every bracket-marker body corresponds to real source element content. **The byte pattern `[[type: ` is the wrong instrument in both directions**, measured:

- **89% false positives by occurrence** — 8 of 9 live hits are correct extractions of source-legitimate leading spaces (`[[sub: fusion]]`, `[[i: molecules]]`, `[[i: argentum]]`, …).
- **It misses the defect class entirely when the swallowed text has no leading space** — `m68710:716,722` `[[i:is the reductant, HCl(g]]` is invisible to it.

The spec says *replace, don't tune*. The right instrument is **source-anchored**: a marker body must match the text of some source element of the corresponding kind. A body that matches nothing was swallowed.

**Files:**
- Create: `tools/lib/bracket-body-check.js`
- Test: `tools/__tests__/bracket-body-check.test.js`
- Test: `tools/__tests__/bracket-body-corpus.test.js` (create — live fixtures)

**Interfaces:**
- Consumes: `parseModuleDoc` from `tools/lib/extraction-coverage.js`; `parseSegmentsMap` from `tools/lib/seg-markers.cjs`.
- Produces: `checkBracketBodies(cnxmlText, segText) => {examined: number, findings: Array<{segId, type, body}>, ok: boolean}`

- [ ] **Step 1: Write the failing unit test**

Create `tools/__tests__/bracket-body-check.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { checkBracketBodies, BODY_SOURCE_ELEMENTS } from '../lib/bracket-body-check.js';

const doc = (inner) => `<document><content>${inner}</content></document>`;

describe('checkBracketBodies — anchored to source, not to a byte pattern', () => {
  it('accepts a body that matches its source element', () => {
    const src = doc('<para id="p1">The <emphasis effect="italics">atom</emphasis> is small.</para>');
    const seg = '<!-- SEG:m1:para:p1 -->\nThe [[i:atom]] is small.\n';
    expect(checkBracketBodies(src, seg)).toMatchObject({ examined: 1, ok: true });
  });

  it('accepts a source-legitimate LEADING SPACE the byte pattern flags (8 of 9 live hits)', () => {
    const src = doc('<para id="p1">Heat of<emphasis effect="italics"> fusion</emphasis>.</para>');
    const seg = '<!-- SEG:m1:para:p1 -->\nHeat of[[i: fusion]].\n';
    const r = checkBracketBodies(src, seg);
    expect(r.ok).toBe(true);
    expect(r.findings).toEqual([]);
  });

  it('catches a swallow with NO leading space, which the byte pattern cannot see', () => {
    // The m68710 shape: the body ran past </emphasis> and took following prose.
    const src = doc('<para id="p1"><emphasis effect="italics">is</emphasis> the reductant, HCl(g)</para>');
    const seg = '<!-- SEG:m1:para:p1 -->\n[[i:is the reductant, HCl(g]]\n';
    const r = checkBracketBodies(src, seg);
    expect(r.ok).toBe(false);
    expect(r.findings[0]).toMatchObject({ segId: 'm1:para:p1', type: 'i', body: 'is the reductant, HCl(g' });
  });

  it('catches a self-closing-element swallow (the m68733 [[i: 3d;]] shape)', () => {
    const src = doc('<para id="p1">Config <emphasis effect="italics"/> 3d;</para>');
    const seg = '<!-- SEG:m1:para:p1 -->\nConfig [[i: 3d;]]\n';
    expect(checkBracketBodies(src, seg).ok).toBe(false);
  });

  it('maps sub, sup and term to their own source elements', () => {
    const src = doc('<para id="p1">H<sub>2</sub>O<sup>+</sup> is a <term>cation</term>.</para>');
    const seg = '<!-- SEG:m1:para:p1 -->\nH[[sub:2]]O[[sup:+]] is a [[term:cation|t1]].\n';
    expect(checkBracketBodies(src, seg).ok).toBe(true);
  });

  it('ignores opaque markers that have no source text (MATH, TABLE, MEDIA, xref, link)', () => {
    const src = doc('<para id="p1">See <link document="m1">it</link>.</para>');
    const seg = '<!-- SEG:m1:para:p1 -->\n[[MATH:1]] [[TABLE:2]] [[MEDIA:3]] [[xref:x|1]] See [[link:it|m1]].\n';
    expect(checkBracketBodies(src, seg)).toMatchObject({ ok: true });
  });

  it('reports the examined count even when clean, so a pass is not vacuous', () => {
    expect(checkBracketBodies(doc('<para id="p1">plain</para>'), '')).toMatchObject({ examined: 0, ok: true });
  });

  it('exports the type -> source element map so drift is visible', () => {
    expect(BODY_SOURCE_ELEMENTS.i).toContain('emphasis');
    expect(BODY_SOURCE_ELEMENTS.sub).toContain('sub');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/bracket-body-check.test.js`
Expected: FAIL — `Cannot find module '../lib/bracket-body-check.js'`.

- [ ] **Step 3: Implement**

Create `tools/lib/bracket-body-check.js`:

```javascript
/**
 * bracket-body-check.js — E2: every bracket-marker body is real source content.
 *
 * ⚠️ THE INSTRUMENT THIS REPLACES WAS WRONG IN BOTH DIRECTIONS. Scanning the
 * segment file for the byte pattern `[[type: ` (marker, colon, space) produced
 * 89% false positives by occurrence — 8 of 9 live hits are correct extractions
 * of source-legitimate leading spaces (`[[sub: fusion]]`, `[[i: molecules]]`) —
 * and it is blind to the defect whenever the swallowed text has no leading
 * space, which is m68710's shape. It could not be tuned; it had to be replaced.
 *
 * The predicate here is SOURCE-ANCHORED: a body must equal the normalized text
 * of some element of the corresponding kind in the module's own 01-source. A
 * body matching nothing was swallowed by the extractor's regex.
 *
 * Why equality against a SET and not positional matching: segment ids do not map
 * 1:1 onto source elements (a para's inline elements are flattened), and the
 * check must not depend on extraction order — which is exactly the fragile
 * coupling that makes an instrument rot. Set membership is weaker but honest.
 *
 * Design: docs/superpowers/specs/2026-08-13-remt-check-battery.md §5 item 10.
 */
import { parseModuleDoc } from './extraction-coverage.js';
import segMarkers from './seg-markers.cjs';

const { parseSegmentsMap } = segMarkers;

/**
 * Bracket type -> the source element localNames whose text can legitimately
 * become that body. Types NOT listed here carry no comparable source text —
 * opaque placeholders (MATH/TABLE/MEDIA/SPACE/BR/EQ/math), id references
 * (xref/docref), and payload-bearing markers whose visible text is checked
 * elsewhere (link/fn/lb/rb) — and are skipped rather than guessed at.
 */
export const BODY_SOURCE_ELEMENTS = Object.freeze({
  i: ['emphasis'],
  b: ['emphasis'],
  u: ['emphasis'],
  em: ['emphasis'],
  sub: ['sub'],
  sup: ['sup'],
  term: ['term'],
});

/** Collapse whitespace for comparison; leading/trailing space is preserved as a single space. */
function norm(s) {
  return String(s || '').replace(/\s+/g, ' ');
}

/** Every normalized text value the given source elements hold, plus their trimmed forms. */
function sourceTexts(content, localNames) {
  const out = new Set();
  if (!content) return out;
  for (const name of localNames) {
    const els = content.getElementsByTagName(name);
    for (let i = 0; i < els.length; i++) {
      const t = norm(els[i].textContent);
      out.add(t);
      out.add(t.trim());
    }
  }
  return out;
}

/**
 * E2 — check every bracket-marker body against source element content.
 *
 * @param {string} cnxmlText the module's 01-source CNXML
 * @param {string} segText the module's 02-for-mt segment file text
 * @returns {{examined: number, findings: Array<{segId: string, type: string, body: string}>, ok: boolean}}
 */
export function checkBracketBodies(cnxmlText, segText) {
  const { content } = parseModuleDoc(cnxmlText);

  // Cache one text set per bracket type; a module can hold hundreds of markers.
  const cache = new Map();
  const textsFor = (type) => {
    if (!cache.has(type)) cache.set(type, sourceTexts(content, BODY_SOURCE_ELEMENTS[type]));
    return cache.get(type);
  };

  const findings = [];
  let examined = 0;

  for (const [segId, text] of parseSegmentsMap(String(segText || ''))) {
    // Innermost-first: `[^\[\]|]` refuses to span a nested marker or a |payload,
    // so `[[i:e[[sub:g]]]]` yields the sub body, never a body containing brackets.
    for (const m of String(text).matchAll(/\[\[([A-Za-z]+):([^\[\]|]*)\]\]/g)) {
      const [, type, body] = m;
      if (!BODY_SOURCE_ELEMENTS[type]) continue; // opaque or payload-bearing — nothing to compare
      examined++;
      const candidates = textsFor(type);
      const b = norm(body);
      if (!candidates.has(b) && !candidates.has(b.trim())) {
        findings.push({ segId, type, body });
      }
    }
  }

  return { examined, findings, ok: findings.length === 0 };
}
```

- [ ] **Step 4: Run the unit test to verify it passes**

Run: `npx vitest run tools/__tests__/bracket-body-check.test.js`
Expected: PASS, all cases.

- [ ] **Step 5: Write the live-fixture test**

Create `tools/__tests__/bracket-body-corpus.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { checkBracketBodies } from '../lib/bracket-body-check.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

/** Locate a chemistry module's 01-source CNXML and 02-for-mt segments, by id. */
function module_(moduleId) {
  const book = path.join(REPO_ROOT, 'books', 'efnafraedi-2e');
  for (const ch of fs.readdirSync(path.join(book, '01-source'))) {
    const cnxml = path.join(book, '01-source', ch, `${moduleId}.cnxml`);
    const seg = path.join(book, '02-for-mt', ch, `${moduleId}-segments.en.md`);
    if (fs.existsSync(cnxml) && fs.existsSync(seg)) {
      return { cnxml: fs.readFileSync(cnxml, 'utf8'), seg: fs.readFileSync(seg, 'utf8') };
    }
  }
  return null;
}

describe('E2 on live corpus fixtures', () => {
  it('m68710: catches the no-leading-space swallow the byte pattern is blind to', () => {
    const m = module_('m68710');
    expect(m, 'm68710 must exist — it is the battery SHOULD-TRIP fixture').not.toBeNull();
    const r = checkBracketBodies(m.cnxml, m.seg);
    expect(r.examined).toBeGreaterThan(0);
    expect(r.findings.some((f) => f.body.includes('is the reductant'))).toBe(true);
  });

  it('m68768: does NOT fire on the three source-legitimate leading spaces', () => {
    const m = module_('m68768');
    expect(m, 'm68768 must exist — it is the battery MUST-NOT-TRIP fixture').not.toBeNull();
    const r = checkBracketBodies(m.cnxml, m.seg);
    expect(r.examined).toBeGreaterThan(0);
    expect(r.findings).toEqual([]);
  });
});
```

- [ ] **Step 6: Run it, and measure the real base rate**

Run: `npx vitest run tools/__tests__/bracket-body-corpus.test.js`

**This test may fail, and that is informative rather than a blocker.** The battery's fixture claims are `[M]`-marked but were measured with the *old* instrument's classification. Before adjusting anything, measure the new instrument's actual base rate across chemistry:

```bash
node --input-type=module -e "
import fs from 'node:fs';
import path from 'node:path';
import { checkBracketBodies } from './tools/lib/bracket-body-check.js';
const book='books/efnafraedi-2e';
let mods=0, firing=0, totalFindings=0, examined=0; const sample=[];
for (const ch of fs.readdirSync(path.join(book,'01-source'))) {
  const d=path.join(book,'01-source',ch);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d).filter(x=>x.endsWith('.cnxml'))) {
    const id=f.replace('.cnxml','');
    const seg=path.join(book,'02-for-mt',ch,id+'-segments.en.md');
    if (!fs.existsSync(seg)) continue;
    mods++;
    const r=checkBracketBodies(fs.readFileSync(path.join(d,f),'utf8'), fs.readFileSync(seg,'utf8'));
    examined+=r.examined;
    if (!r.ok){ firing++; totalFindings+=r.findings.length; if(sample.length<8) sample.push([id, r.findings[0]]); }
  }
}
console.log({mods, firing, rate:(firing/mods*100).toFixed(1)+'%', totalFindings, examined});
console.log(sample);
"
```

Read the result against the battery's blocking rule: **over ~5% of modules firing means E2 cannot be blocking** and must be recorded as advisory in Plan B. Record the measured rate in the commit message either way — this number is Plan B's input, and inventing it later is exactly the drift this project keeps logging.

If the two named fixtures do not behave as the battery claims, **report the discrepancy and leave the test asserting what you actually measured**, with a comment naming the battery line it contradicts. A frozen spec is evidence, not status.

- [ ] **Step 7: Full suite, lint, format**

Run: `npm test && npm run lint && npm run format:check`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add tools/lib/bracket-body-check.js tools/__tests__/bracket-body-check.test.js \
        tools/__tests__/bracket-body-corpus.test.js
git commit -m "feat(C82): E2 — source-anchored bracket-body check

The byte pattern '[[type: ' was wrong in both directions: 89% false positives by
occurrence (8 of 9 live hits are correct extractions of source-legitimate
leading spaces) and structurally blind whenever the swallowed text has no
leading space, which is m68710's shape. Replaced, not tuned.

A body must now equal the normalized text of some source element of the
corresponding kind. Set membership rather than positional matching, deliberately
— segment ids do not map 1:1 onto source elements, and coupling the check to
extraction order is how an instrument rots.

Measured base rate across chemistry: REPLACE THIS with the modules/rate/examined
figures printed by Step 6. Do not commit the line as written — the number cannot
be known before the sweep runs, and Plan B's blocking/advisory call reads it."
```

---

## Task 8: honest `--module` handling

`parseArgs` silently drops unknown flags, so passing `--module` to a tool that does not declare it is a **no-op that runs the whole book** — at full strength, reporting success. Three of the battery's tools are affected, and they need three *different* answers:

| tool | today | answer |
|---|---|---|
| `tools/scan-residue.js` | no `--module` | **add it** |
| `tools/validate-chapter.js` | positional `<book> <chapter>` | **add `--module`** |
| `tools/cnxml-render-fidelity-check.js` | chapter-aggregated **by design** | **reject `--module` loudly** |
| `tools/verify-extraction-coverage.js` | no `--module` | **no flag** — consumers import `analyzeModule` |

The third is the valuable one. A tool that cannot honour a flag must say so, not ignore it — that is §C83's lesson, and `cnxml-render-fidelity-check`'s own header says the chapter is the closed reconciliation unit.

**Files:**
- Modify: `tools/scan-residue.js` (arg parsing + the module filter)
- Modify: `tools/validate-chapter.js` (arg parsing + the module filter)
- Modify: `tools/cnxml-render-fidelity-check.js` (reject `--module`)
- Test: `tools/__tests__/module-flag-honesty.test.js` (create)

**Interfaces:**
- Consumes: `chapterProvided` from Task 1 where a `--chapter 0 --module X` combination is possible.
- Produces: no new exports. The contract is CLI behaviour, pinned by the test.

- [ ] **Step 1: Read the three tools before editing**

Run:
```bash
grep -an 'parseArgs\|MODULE_OPTION\|CHAPTER_OPTION\|printHelp' \
  tools/scan-residue.js tools/validate-chapter.js tools/cnxml-render-fidelity-check.js
```

Each tool's option list is the authority for what it accepts. Do not infer a flag's existence from a sibling tool.

- [ ] **Step 2: Write the failing test**

Create `tools/__tests__/module-flag-honesty.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

function run(tool, args) {
  try {
    const stdout = execFileSync('node', [path.join('tools', tool), ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { out: stdout, code: 0 };
  } catch (err) {
    return { out: `${err.stdout || ''}${err.stderr || ''}`, code: err.status ?? 1 };
  }
}

describe('a tool that cannot honour --module says so (§C83)', () => {
  it('cnxml-render-fidelity-check REJECTS --module rather than ignoring it', () => {
    const r = run('cnxml-render-fidelity-check.js', [
      '--book', 'efnafraedi-2e', '--chapter', '20', '--module', 'm68823',
    ]);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/--module/);
    expect(r.out).toMatch(/chapter/i);
  });

  it('cnxml-render-fidelity-check still runs without --module', () => {
    const r = run('cnxml-render-fidelity-check.js', ['--book', 'efnafraedi-2e', '--chapter', '20']);
    expect(r.out).not.toMatch(/not supported/i);
  });
});

describe('a tool that CAN honour --module narrows its scope', () => {
  it('scan-residue --module examines fewer units than the whole chapter', () => {
    const whole = run('scan-residue.js', ['--book', 'efnafraedi-2e', '--chapter', '20', '--json']);
    const one = run('scan-residue.js', ['--book', 'efnafraedi-2e', '--chapter', '20', '--module', 'm68823', '--json']);
    const wj = JSON.parse(whole.out);
    const oj = JSON.parse(one.out);
    // The scoped run must read strictly fewer modules — an equal count means the
    // flag was dropped and the whole chapter ran, which is the failure this pins.
    expect(oj.modulesExamined).toBeLessThan(wj.modulesExamined);
    expect(oj.modulesExamined).toBe(1);
  });

  it('scan-residue rejects a --module that does not exist rather than scanning everything', () => {
    const r = run('scan-residue.js', ['--book', 'efnafraedi-2e', '--chapter', '20', '--module', 'mZZZZZ', '--json']);
    expect(r.code).not.toBe(0);
  });

  it('validate-chapter --module narrows to one module', () => {
    const one = run('validate-chapter.js', ['efnafraedi-2e', '20', '--module', 'm68823']);
    expect(one.out).not.toMatch(/m68791/);
  });
});
```

> **⚠️ `modulesExamined` is almost certainly NOT in `scan-residue.js`'s JSON today** — the battery spec describes the tool's JSON without it. Adding it is **Step 3a below**, a separate change of a different kind from adding a filter flag: it widens a tool's output contract, so existing consumers must be checked first. Do not fold it into the flag work.

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/module-flag-honesty.test.js`
Expected: FAIL on every case — the render-fidelity tool exits 0 having silently ignored `--module`, and both scoped runs read the whole chapter.

- [ ] **Step 3a: Widen `scan-residue.js`'s JSON contract — separately, and check consumers first**

This is a **contract change**, not a flag addition, so it gets its own step and its own commit.

Find every consumer before touching the shape:

```bash
grep -rna 'scan-residue' --include='*.js' --include='*.json' --include='*.sh' --include='*.md' \
  tools/ scripts/ server/ docs/ .github/ | grep -v node_modules
```

`grep -a` is load-bearing here — files in this repo hold NUL bytes and plain `grep` reports nothing for strings they contain.

Then read the current JSON shape and add the field **additively**, never renaming or reordering:

```bash
node tools/scan-residue.js --book efnafraedi-2e --chapter 20 --json | head -20
```

Add `modulesExamined` to the emitted object. The design spec's rule is that **every check emits the number of units it examined** — §C60 is the precedent, where a check reported `Total findings: 0` while reading zero files. Without this field the scoping assertion in Step 2 is unfalsifiable: a scoped run and a dropped flag produce the same finding count whenever the chapter happens to be clean.

Commit this on its own:

```bash
git add tools/scan-residue.js
git commit -m "feat(C82): scan-residue --json reports modulesExamined

Additive. Every check must emit the number of units it examined (design spec §7;
§C60, where a check reported 'Total findings: 0' having read zero files).
Without it, a scoped run and a silently-dropped --module are indistinguishable
on a clean chapter."
```

- [ ] **Step 4: Implement the flag handling**

**`tools/cnxml-render-fidelity-check.js`** — reject, in `main()`, immediately after `requireBook(args)`. `parseArgs` will not populate `args.module` unless `MODULE_OPTION` is declared, so declare it *in order to reject it*:

```javascript
  // §C82/§C83: this tool is chapter-aggregated BY DESIGN — the chapter is the
  // closed reconciliation unit (see this file's header). It cannot narrow to a
  // module. parseArgs silently drops flags a tool does not declare, so without
  // this it would accept --module, ignore it, scan the whole chapter and exit 0
  // — a wrong answer that looks like an answer.
  if (args.module) {
    console.error(
      'Error: --module is not supported by cnxml-render-fidelity-check — this check is ' +
        'chapter-aggregated by design (the chapter is the closed reconciliation unit). ' +
        'Run it per chapter, or use cnxml-fidelity-check --module for a per-module check.'
    );
    process.exit(2);
  }
```

Add `MODULE_OPTION` to this tool's `parseArgs` option list so `args.module` is populated, and add a line to its `printHelp()` saying `--module` is deliberately unsupported.

**`tools/scan-residue.js`** — add `MODULE_OPTION` to the option list, filter the module set after discovery, fail on an unknown id, and add `modulesExamined` to the JSON output:

```javascript
  // §C82: per-module scoping. A missing module is an ERROR, never a silent
  // empty scan — an empty result set and a clean result set look identical.
  if (args.module) {
    const before = modules.length;
    modules = modules.filter((m) => m.moduleId === args.module);
    if (modules.length === 0) {
      console.error(
        `Error: --module ${args.module} matched none of the ${before} module(s) in scope.`
      );
      process.exit(2);
    }
  }
```

> Adapt the variable names to the tool's own — `modules`/`moduleId` are illustrative. Read the discovery code first and keep its shape.

**`tools/validate-chapter.js`** — same pattern. It takes `<book> <chapter>` positionally, so `--module` is a new declared option alongside them; keep the positional contract unchanged.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run tools/__tests__/module-flag-honesty.test.js`
Expected: PASS, all cases.

- [ ] **Step 6: Verify the fourth tool needs no flag**

`verify-extraction-coverage.js` gets no `--module`: its per-module logic is already the pure `analyzeModule(cnxmlText, segText)` (`tools/lib/extraction-coverage.js:163`), which Plan C's driver imports directly rather than shelling out. Confirm it is importable and pure:

```bash
node --input-type=module -e "
import { analyzeModule } from './tools/lib/extraction-coverage.js';
console.log(typeof analyzeModule, Object.keys(analyzeModule('<document><content/></document>','')));
"
```
Expected: `function [ 'listFindings', 'dupFindings', 'altFindings', 'hasFindings' ]` — `altFindings` present, from Task 5.

- [ ] **Step 7: Full suite, lint, format**

Run: `npm test && npm run lint && npm run format:check`
Expected: green.

- [ ] **Step 8: Commit**

```bash
git add tools/scan-residue.js tools/validate-chapter.js tools/cnxml-render-fidelity-check.js \
        tools/__tests__/module-flag-honesty.test.js
git commit -m "feat(C82): honest --module handling across the battery's tools

parseArgs silently drops undeclared flags, so --module on a tool that does not
support it is a no-op that runs the whole book at full strength and exits 0.

scan-residue and validate-chapter now honour --module (and error on an id that
matches nothing — an empty scan and a clean scan look identical).
cnxml-render-fidelity-check now REJECTS it: that tool is chapter-aggregated by
design, and a tool that cannot honour a flag must say so rather than ignore it.
verify-extraction-coverage gets no flag; consumers import analyzeModule.

scan-residue's JSON now reports modulesExamined, per the design spec's rule that
every check emits the number of units it examined."
```

---

## Task 9: commit the extract→inject round-trip check

The register's §C81 entry names this **the follow-up most worth building next**, and §C81's own frozen spec §7 leaves it open. It is what caught §C81's single shipped Critical: a fix that stripped `alt` outright from 14 media elements across 5 modules, while every extraction-side count stayed clean and 4,600+ tests stayed green.

**Why extraction-side checks cannot see this class:** `structure.inlineMedia` entries carried no `alt` key at all, `readAlt(undefined)` is falsy, and `buildMediaElement` therefore never wrote the attribute — regardless of what the segment map held. The segments were right; the rendered CNXML was wrong. `tools/__tests__/cnxml-extract-alt-corpus.test.js` counts `alt="` from raw source and **never calls `buildCnxml`**.

§C82 runs module-by-module for weeks with both `02-structure` shapes live, which is precisely the condition that produced the regression. The check was run ad-hoc during §C81's review round 2 and was never committed.

**Files:**
- Create: `tools/lib/inject-roundtrip.js`
- Test: `tools/__tests__/inject-roundtrip.test.js`
- Test: `tools/__tests__/inject-roundtrip-corpus.test.js`

**Interfaces:**
- Consumes: `extractSegments`, `formatSegmentsMarkdown` from `tools/cnxml-extract.js`; `buildCnxml`, `parseSegments` from `tools/cnxml-inject.js`. All four are exported (via each file's trailing `export { … }` block — `cnxml-extract.js:2442`, `cnxml-inject.js:4575`), **verified 2026-08-15**.
- Produces: `roundTripAltCount(cnxmlText) => {rawAlt: number, outAlt: number, ok: boolean}`

**The round-trip idiom already exists in the tree — copy it, do not invent one.** `tools/__tests__/cnxml-extract-example-title.test.js:28-32`:

```javascript
function roundTrip(cnxml) {
  const { segments, structure, equations, inlineAttrs } = extractSegments(cnxml);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  return buildCnxml(structure, parsed, equations, cnxml, {}, inlineAttrs).cnxml;
}
```

Note the real signatures, which are not guessable: `extractSegments(cnxml, options = {})` returns `{segments, structure, equations, inlineAttrs}`; `buildCnxml(structure, segments, equations, originalCnxml, options = {}, inlineAttrs = {})` returns an **object** whose `.cnxml` is the string. Going through `formatSegmentsMarkdown` → `parseSegments` rather than building a Map by hand is deliberate: it exercises the same serialize/parse pair the real pipeline uses, so a marker-level regression is in scope too.

- [ ] **Step 1: Confirm the idiom still holds**

Run: `sed -n '1,35p' tools/__tests__/cnxml-extract-example-title.test.js`
Expected: the `roundTrip` helper above, unchanged. If it has drifted, follow the file, not this plan.

- [ ] **Step 2: Write the failing unit test**

Create `tools/__tests__/inject-roundtrip.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { roundTripAltCount } from '../lib/inject-roundtrip.js';

const doc = (inner) => `<document xmlns="http://cnx.rice.edu/cnxml" id="m1"><title>T</title><content>${inner}</content></document>`;

describe('roundTripAltCount — alt survives extract -> inject', () => {
  it('a figure-wrapped media keeps its alt through the round trip', () => {
    const r = roundTripAltCount(doc('<figure id="f1"><media alt="mynd af frumeind"><image src="a.png" mime-type="image/png"/></media></figure>'));
    expect(r.rawAlt).toBe(1);
    expect(r.outAlt).toBe(1);
    expect(r.ok).toBe(true);
  });

  it('counts several alts across several figures', () => {
    const r = roundTripAltCount(doc(
      '<figure id="f1"><media alt="ein"><image src="a.png" mime-type="image/png"/></media></figure>' +
        '<figure id="f2"><media alt="tvö"><image src="b.png" mime-type="image/png"/></media></figure>'
    ));
    expect(r.rawAlt).toBe(2);
    expect(r.outAlt).toBe(2);
  });

  it('a module with no alt round-trips as 0 == 0, and says so', () => {
    const r = roundTripAltCount(doc('<para id="p1">engar myndir</para>'));
    expect(r).toEqual({ rawAlt: 0, outAlt: 0, ok: true });
  });

  it('the m66449 shape — two subfigures — keeps BOTH alts', () => {
    // The §C81 review-round-2 finding: processFigure's media regex is non-global
    // and only reaches the first <media>. Both must survive.
    const r = roundTripAltCount(doc(
      '<note id="n1"><para id="p1"><figure id="f1">' +
        '<subfigure id="sf1"><media alt="fyrri"><image src="a.png" mime-type="image/png"/></media></subfigure>' +
        '<subfigure id="sf2"><media alt="seinni"><image src="b.png" mime-type="image/png"/></media></subfigure>' +
        '</figure></para></note>'
    ));
    expect(r.rawAlt).toBe(2);
    expect(r.outAlt).toBe(2);
    expect(r.ok).toBe(true);
  });

  it('the m42296 shape — figure in a list item in an exercise problem — keeps its alt', () => {
    // This is the exact corpus shape whose alt was stripped by §C81's first
    // Part 2, invisibly to every extraction-side test.
    const r = roundTripAltCount(doc(
      '<exercise id="e1"><problem id="pr1"><list id="l1"><item id="i1">' +
        '<figure id="f1"><media alt="mynd"><image src="a.png" mime-type="image/png"/></media></figure>' +
        '</item></list></problem></exercise>'
    ));
    expect(r.rawAlt).toBe(1);
    expect(r.outAlt).toBe(1);
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `npx vitest run tools/__tests__/inject-roundtrip.test.js`
Expected: FAIL — `Cannot find module '../lib/inject-roundtrip.js'`.

- [ ] **Step 4: Implement**

Create `tools/lib/inject-roundtrip.js`.

```javascript
/**
 * inject-roundtrip.js — the extract -> inject round-trip check (§C81 follow-up).
 *
 * ⚠️ WHY EXTRACTION-SIDE COUNTS CANNOT REPLACE THIS. §C81 shipped a fix that
 * stripped `alt` outright from 14 media elements across 5 modules while every
 * extraction-side count stayed clean and 4,600+ tests stayed green. The
 * mechanism: `structure.inlineMedia` entries carried no `alt` key at all, so
 * `readAlt(undefined)` was falsy and `buildMediaElement` never wrote the
 * attribute — regardless of what the segment map held. The SEGMENTS were right;
 * the rendered CNXML was wrong. tools/__tests__/cnxml-extract-alt-corpus.test.js
 * counts alt=" from raw source and never calls buildCnxml, so it is structurally
 * blind to this.
 *
 * §C82 runs module-by-module for weeks with both 02-structure shapes live —
 * exactly the condition that produced the regression. That is why this is
 * committed rather than run ad-hoc.
 *
 * Counting, not byte-diffing, deliberately: a byte diff over the corpus reports
 * whitespace-only changes as findings (17 physics modules did, in §C81 round 3),
 * which buries the one that matters.
 */
import { extractSegments, formatSegmentsMarkdown } from '../cnxml-extract.js';
import { buildCnxml, parseSegments } from '../cnxml-inject.js';

/** Non-empty alt attributes in a CNXML string. */
function countAlt(cnxml) {
  return (String(cnxml || '').match(/\balt="[^"]+"/g) || []).length;
}

/**
 * Extract a module, inject its own English straight back, and compare alt counts.
 *
 * Injecting the ENGLISH back is what makes this a pure structural check: no
 * translation is involved, so any difference is the pipeline losing an
 * attribute, never a content decision.
 *
 * Round-tripping through formatSegmentsMarkdown -> parseSegments rather than
 * building a Map by hand is deliberate — it exercises the same serialize/parse
 * pair the real pipeline uses, so a marker-level regression is in scope too.
 * This mirrors the existing helper at
 * tools/__tests__/cnxml-extract-example-title.test.js:28-32.
 *
 * @param {string} cnxmlText a module's 01-source CNXML
 * @returns {{rawAlt: number, outAlt: number, ok: boolean}}
 */
export function roundTripAltCount(cnxmlText) {
  const rawAlt = countAlt(cnxmlText);
  const { segments, structure, equations, inlineAttrs } = extractSegments(cnxmlText);
  const parsed = parseSegments(formatSegmentsMarkdown(segments));
  const outAlt = countAlt(buildCnxml(structure, parsed, equations, cnxmlText, {}, inlineAttrs).cnxml);
  return { rawAlt, outAlt, ok: rawAlt === outAlt };
}
```

- [ ] **Step 5: Run the unit test to verify it passes**

Run: `npx vitest run tools/__tests__/inject-roundtrip.test.js`
Expected: PASS. If a shape fails, that is a **real finding** about the pipeline — report it before adjusting the test.

- [ ] **Step 6: Verify the check discriminates against the broken code**

**This step is mandatory and is the point of the task.** A round-trip check that has never gone red is not a check.

```bash
# 07167ac7 is the §C81 commit whose Part 2 stripped alt from the m42296 shape.
git stash
git log --oneline --all | grep -i '07167ac7' || echo "commit not found — find the pre-rework tip on feat/c81-figure-alt"
git checkout 07167ac7 -- tools/cnxml-extract.js
npx vitest run tools/__tests__/inject-roundtrip.test.js
# EXPECT: the m42296-shape case goes RED (outAlt 0, rawAlt 1).
git checkout HEAD -- tools/cnxml-extract.js
git stash pop
```

If the m42296 case stays green against the reverted extractor, **the test does not discriminate** — that exact failure happened once already in §C81 round 3, where a fixture placed the `<media>` before the `<list>` and the assertion passed against the broken code. Fix the fixture until it goes red, then re-verify it goes green at HEAD.

- [ ] **Step 7: Write the corpus sweep**

Create `tools/__tests__/inject-roundtrip-corpus.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { roundTripAltCount } from '../lib/inject-roundtrip.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..', '..');

function sourceModules(book) {
  const root = path.join(REPO_ROOT, 'books', book, '01-source');
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.cnxml')) out.push(p);
    }
  };
  if (fs.existsSync(root)) walk(root);
  return out;
}

describe('alt survives the round trip across chemistry', () => {
  it('no module loses an alt attribute between source and injected output', () => {
    const files = sourceModules('efnafraedi-2e');
    expect(files.length).toBe(149); // control: the sweep read what it claims to have read

    const losses = [];
    for (const f of files) {
      const r = roundTripAltCount(fs.readFileSync(f, 'utf8'));
      if (r.outAlt < r.rawAlt) losses.push({ module: path.basename(f, '.cnxml'), ...r });
    }
    expect(losses).toEqual([]);
  });
});
```

> **⚠️ The assertion is `outAlt < rawAlt`, not equality.** The unreachable positions from Task 5 mean `rawAlt` exceeds what the pipeline can carry for *some* modules; this check is about **loss relative to what the round trip already produced**, so it must not re-litigate §C81's shortfall. If the sweep reports losses, record them and report — the four §C81 Part 1 removals (`m00018`, `m00078`, `m00230`, `m00330`) are organic, not chemistry, so chemistry should be clean.

- [ ] **Step 8: Run the corpus sweep**

Run: `npx vitest run tools/__tests__/inject-roundtrip-corpus.test.js`
Expected: PASS. Note the runtime — 149 modules through extract+inject may be slow. If it exceeds ~30s, add `{ timeout: 120_000 }` as the third argument to `it(...)` rather than trimming the corpus.

- [ ] **Step 9: Full suite, lint, format**

Run: `npm test && npm run lint && npm run format:check`
Expected: green.

- [ ] **Step 10: Commit**

```bash
git add tools/lib/inject-roundtrip.js tools/__tests__/inject-roundtrip.test.js \
        tools/__tests__/inject-roundtrip-corpus.test.js
git commit -m "feat(C82): commit the extract->inject round-trip check

This is what caught §C81's one shipped Critical — a fix that stripped alt from
14 media elements across 5 modules while every extraction-side count stayed
clean and 4,600+ tests stayed green. structure.inlineMedia carried no alt key,
readAlt(undefined) is falsy, buildMediaElement never wrote the attribute. The
segments were right and the rendered CNXML was wrong.

It was run ad-hoc during §C81 review round 2 and never committed. §C82 runs
module-by-module for weeks with both 02-structure shapes live, which is exactly
the condition that produced the regression.

Verified against the broken code: the m42296-shape case goes red at 07167ac7 and
green at HEAD. Counting rather than byte-diffing, deliberately — a byte diff
reports whitespace-only changes (17 physics modules in §C81 round 3) and buries
the one that matters.

Register §C81 follow-up ④; §C81 design spec §7 item 2."
```

---

## Closing the branch

- [ ] **Run the authoritative gate**

Run from the repo root: `npm test`
This is the authoritative gate for this project — **not** the GitHub checks, because there is no branch protection here and PRs can merge red.

- [ ] **Run what CI runs, which `npm test` does not cover**

```bash
npm run lint          # eslint tools/ scripts/
npm run format:check  # prettier --check 'tools/**/*.js' 'scripts/**/*.js'
```
`npm run lint` is **not** the Lint job on its own, and `npm test` does **not** run Playwright. Nothing in this plan touches `server/` or the E2E surface, so a green root suite plus these two is sufficient here — but say that explicitly rather than claiming "CI is green".

- [ ] **Whole-branch adversarial review before the PR**

Per the campaign's own process. Give the reviewer both frozen specs, this plan, and the register's §C81/§C82 entries. Point them at the two claims most worth attacking:
1. **Task 5's reachability predicate.** It was derived from a measurement artifact, not from reading `cnxml-extract.js`'s walks. Does the predicate match what the code actually does, or only what the artifact counted?
2. **Task 9's discriminating step.** Was the m42296 fixture *run* against the broken extractor and seen to go red, or only reasoned about? §C81 got that wrong once.

- [ ] **Update the register**

Add a §C82 progress entry naming what shipped and what Plans B and C still owe. Per CLAUDE.md § *One source of truth*, the register is the only owner of that status — do not restate it in the specs, in memory, or in this plan.

- [ ] **Batch the docs commit with this branch**

Do not push a docs-only commit to `main` separately: a dev push strands prod's content backup until the next deploy, and the register entry can ride along with this branch's PR.

---

## Self-review notes

**Spec coverage.** Battery spec §5 items mapped to tasks: item 2 → Tasks 2–4 · item 4 (A3) → Task 6 · item 5 (chapter 0) → Task 1 · item 7 (per-module wrappers) → Task 8 · item 10 (E2) → Task 7 · item 11 (E5) → Task 5. Item 1 (§C81) is merged. Item 3 (allowlists) and items 6, 8, 9 are deferred with stated reasons in "What this plan deliberately does NOT contain". Design spec §8 items 1–7 and 9 map identically; item 8 is resolved-as-void in the spec itself.

**What was pre-validated before handoff, and what was not.** Two of this plan's load-bearing assumptions were checked against the tree on 2026-08-15 rather than left for the executor to discover:

- **Task 9's entry points exist and the signatures are real.** `extractSegments`, `formatSegmentsMarkdown`, `buildCnxml` and `parseSegments` are all exported. An earlier draft of this plan guessed `buildCnxml(cnxmlText, structure, translations)` — **that was wrong in argument order, arity and return type**, and the working idiom was already in the tree at `tools/__tests__/cnxml-extract-example-title.test.js:28-32`. Task 9 now copies it.
- **Task 5's reachability predicate reproduces the §C81 artifact exactly** over all 149 chemistry modules — 197 unreachable, 1,149 total, all five reason buckets. The specific risk that motivated the check (a figure holding two alt-bearing media would make `reachable` overcount, since `processFigure`'s media regex is non-global) was measured and is **0 in both in-scope books**.

**Still unverified, and flagged in place.** Task 7's two named E2 fixtures (`m68710` SHOULD-TRIP, `m68768` MUST-NOT-TRIP) carry the battery's `[M]` marks but were measured with the *old* instrument's classification. Task 7 Step 6 instructs measuring the real base rate and reporting a discrepancy rather than adjusting the test. Task 8's `modulesExamined` field is presumed absent; Step 3a treats adding it as a contract change with its own consumer check and its own commit.

**Numbers in this plan and where they came from.** 1,149 / 951 / 952 / 198 / 197, 132 / 100 / 32, 2,163 / 245, and the five-way breakdown: `test-results/c81-alt-extraction-2026-08-15.json`, **re-derived independently at plan time and in agreement**. 4 modules in 227 pairs (~1.8%) for the MATH false negatives, 89% E2 false positives, 8 of 9 live hits: the battery spec's own `[M]` measurements, **not re-derived** — Tasks 6 and 7 re-measure them, and the executor records what they actually get rather than restating these.
