# C14 ② step 4 — Glossary Export Provenance Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the unattended glossary export refuse a producer swap instead of measuring size, and stop one book's legitimate refusal from suppressing the health signal for every book.

**Architecture:** A new pure detector (`server/lib/glossaryProducer.js`) identifies which program wrote a glossary payload — exactly via a `producer` stamp the exporter now emits, and for legacy files via a measured field-shape fingerprint. `runGlossaryExport` replaces its single `failures` counter with a per-book outcome, so refusals exit 0 and keep the heartbeat while only genuine errors exit 1. A status file carries the per-book breakdown to `/api/health`, and `deploy.sh` prints refusals so they cannot be silent.

**Tech Stack:** Node.js 22.x (CJS under `server/`, ESM `.test.js` under `server/__tests__/` via `createRequire`), Vitest, better-sqlite3, bash.

**Spec:** [`docs/superpowers/specs/2026-08-04-c14-glossary-export-provenance-guard-design.md`](../specs/2026-08-04-c14-glossary-export-provenance-guard-design.md) — read §2 (decisions D1–D5) before starting.

## Global Constraints

- **`npm test` from the REPO ROOT is the authoritative gate.** There is no branch protection; a red PR can still merge, so local green is the only real proof. Never claim a task passes without pasting the run.
- **Resolve paths against `import.meta.url` / `__dirname`, never `process.cwd()`.** The server runs with cwd=`server/`.
- **Never edit anything under `books/*/01-source/`.** No task here touches `books/` except to READ committed glossary files in tests.
- **Existing behaviour that must survive unchanged:** `sameTerms`, `shrinkVerdict`, `countApproved`, `countTerms`, `SHRINK_RATIO = 0.5`; the `book === null` (not truthiness) selector; the `hasGlossaryDir` filter on the named-book path; the two whole-run error returns (`books.length === 0`).
- **Producer string constants, verbatim:** `'export-terminology'` and `'merge-glossary'`.
- **Outcome names, verbatim:** `wrote`, `adopted`, `unchanged`, `refused-producer`, `refused-shrink`, `refused-no-mapping`, `error`.
- **Status file path, verbatim:** `pipeline-output/.glossary-export-status.json`. Heartbeat path is unchanged: `pipeline-output/.last-glossary-export`.
- **New CLI flag, verbatim:** `--adopt`. It does NOT imply `--force`.
- **Commit style:** `<type>(<scope>): <subject>`, one logical change per commit, ending with the project's `Co-Authored-By` trailer.

---

## ⚠️ Read this before Task 1 — the trap this plan exists to avoid

The existing fixtures in `server/__tests__/glossaryExportRun.test.js` build terms as
`{english, icelandic, status}` — carrying **neither** `subjects` **nor** `category`/`chapter`.
Once the producer gate lands, `detectProducer(prev)` and `detectProducer(next)` both return
`'unknown'` for those fixtures, `'unknown' === 'unknown'`, and **the gate never fires**. Every
existing test stays green while proving nothing.

That is the exact failure mode this register has recorded three times ("the dangerous check is
the one that PASSES for the wrong reason"). Task 5 therefore **requires** realistic fixture
shapes plus a test that proves the gate fires, and Task 8 mutation-verifies it.

---

## File Structure

| File | Responsibility |
|---|---|
| `server/lib/glossaryProducer.js` **(new)** | Pure: given a payload, say who wrote it. No I/O. |
| `server/__tests__/glossaryProducer.test.js` **(new)** | Detection table + assertions against the REAL committed files and REAL exporter output. |
| `server/lib/glossaryExportDecision.js` | Adds `producerVerdict`. Existing exports byte-unchanged. |
| `server/services/terminologyService.js` | `exportBookGlossary` emits `producer`. |
| `server/scripts/export-terminology.js` | `readExisting` discriminated result; per-book outcomes; `--adopt`; status file; exit/heartbeat semantics. |
| `server/lib/glossaryExportHealth.js` | Reads the status file; `ok = !stale && errors === 0`. |
| `scripts/git-backup.sh` | WARN text now means "a book errored". |
| `scripts/deploy.sh` | Prints refusals even when the check is `ok`. |

---

### Task 1: The pure producer detector

**Files:**
- Create: `server/lib/glossaryProducer.js`
- Test: `server/__tests__/glossaryProducer.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `PRODUCER_EXPORT: 'export-terminology'`, `PRODUCER_MERGE: 'merge-glossary'`, `PRODUCER_UNKNOWN: 'unknown'`, `detectProducer(payload) => string`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/glossaryProducer.test.js`:

```javascript
/**
 * Producer detection for the unattended glossary export (register C14 ② step 4).
 *
 * The legacy fingerprint is asserted against the REAL committed glossaries and
 * the export fingerprint against REAL exportBookGlossary output shape — not
 * hand-authored fixtures. A fixture written from prose is how ten
 * `<!-- SEG: -->` fixtures acquired a shape the real parser returns [] for; a
 * hand-written "merge-glossary-shaped" object would pass while proving nothing
 * about the 4,496 rows actually on disk.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const {
  detectProducer,
  PRODUCER_EXPORT,
  PRODUCER_MERGE,
  PRODUCER_UNKNOWN,
} = require('../lib/glossaryProducer');

// Resolve against import.meta.url, never cwd (CLAUDE.md durable rule).
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const BOOKS_DIR = path.join(REPO_ROOT, 'books');

function committedGlossaries() {
  if (!existsSync(BOOKS_DIR)) return [];
  return readdirSync(BOOKS_DIR)
    .map((slug) => ({
      slug,
      file: path.join(BOOKS_DIR, slug, 'glossary', 'glossary-unified.json'),
    }))
    .filter((b) => existsSync(b.file));
}

describe('detectProducer — stamp', () => {
  it('returns export-terminology for a stamped payload, whatever the term shape', () => {
    const p = { producer: PRODUCER_EXPORT, terms: [{ english: 'a', category: 'other' }] };
    expect(detectProducer(p)).toBe(PRODUCER_EXPORT);
  });
});

describe('detectProducer — legacy fingerprint, against the REAL committed files', () => {
  const files = committedGlossaries();

  it('found at least one committed glossary to assert against', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files.map((f) => [f.slug, f.file]))(
    '%s: the committed file is detected as merge-glossary',
    (_slug, file) => {
      const payload = JSON.parse(readFileSync(file, 'utf8'));
      expect(detectProducer(payload)).toBe(PRODUCER_MERGE);
    }
  );

  it.each(files.map((f) => [f.slug, f.file]))(
    '%s: the partition holds — every term has category+chapter, none has subjects',
    (_slug, file) => {
      const terms = JSON.parse(readFileSync(file, 'utf8')).terms;
      const withCategory = terms.filter((t) => 'category' in t && 'chapter' in t).length;
      const withSubjects = terms.filter((t) => 'subjects' in t).length;
      expect(withCategory).toBe(terms.length);
      expect(withSubjects).toBe(0);
    }
  );
});

describe('detectProducer — export fingerprint on a pre-stamp payload', () => {
  it('detects an unstamped export by its subjects field', () => {
    const p = { terms: [{ english: 'atom', icelandic: 'frumeind', subjects: ['chemistry'] }] };
    expect(detectProducer(p)).toBe(PRODUCER_EXPORT);
  });

  it('an empty subjects array still counts — presence, not truthiness', () => {
    const p = { terms: [{ english: 'atom', icelandic: 'frumeind', subjects: [] }] };
    expect(detectProducer(p)).toBe(PRODUCER_EXPORT);
  });
});

describe('detectProducer — unknown', () => {
  it('a hybrid carrying BOTH fingerprints is unknown, not a guess', () => {
    const p = { terms: [{ english: 'a', category: 'other', chapter: 1, subjects: ['chemistry'] }] };
    expect(detectProducer(p)).toBe(PRODUCER_UNKNOWN);
  });

  it.each([
    ['null', null],
    ['a non-object', 'nope'],
    ['an array', []],
    ['no terms property', { book: 'x' }],
    ['terms not an array', { terms: {} }],
    ['empty terms', { terms: [] }],
    ['terms with neither fingerprint', { terms: [{ english: 'a', icelandic: 'b' }] }],
  ])('%s is unknown', (_label, value) => {
    expect(detectProducer(value)).toBe(PRODUCER_UNKNOWN);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/glossaryProducer.test.js`
Expected: FAIL — `Cannot find module '../lib/glossaryProducer'`

- [ ] **Step 3: Write minimal implementation**

Create `server/lib/glossaryProducer.js`:

```javascript
/**
 * Which program wrote a glossary-unified.json payload (register C14 ② step 4).
 *
 * Pure by design — no filesystem, no DB — so the producer question can be
 * asked of any payload, including one a test built.
 *
 * WHY THIS EXISTS. The shrink guard in glossaryExportDecision.js names the
 * real threat correctly ("this exporter SWAPS producers rather than
 * refreshing") and then measures term COUNTS, which is the one dimension on
 * which the two producers are indistinguishable. On 2026-08-03 that let a
 * wholesale producer swap through unattended: chemistry -36.5% passed under
 * the 0.5 halving threshold, and biology GREW, which a shrink ratio is
 * structurally blind to.
 *
 * THE FINGERPRINT IS MEASURED, NOT ASSUMED. Across all 4,496 terms in the
 * three committed glossaries (2026-08-04): 4,496 carry `category` + `chapter`
 * and 0 carry `subjects`. exportBookGlossary emits the exact complement —
 * `subjects` always (possibly []), never `category`/`chapter`. Two disjoint
 * shapes, no counter-example. glossaryProducer.test.js re-measures this
 * against the real files rather than trusting this comment.
 *
 * ⚠️ A HYBRID IS `unknown`, DELIBERATELY. A payload carrying both fingerprints
 * is a shape neither producer emits today, so it means something has changed
 * that this detector does not model. `unknown` differs from the stamped
 * `next`, so the call site refuses and waits for --adopt: when we cannot tell
 * what we would destroy, a human decides. The cost of being wrong is one book
 * skipped and reported; the cost of guessing is a silent overwrite.
 */

const PRODUCER_EXPORT = 'export-terminology';
const PRODUCER_MERGE = 'merge-glossary';
const PRODUCER_UNKNOWN = 'unknown';

/** Presence, not truthiness: exportBookGlossary emits `subjects: []` for an untagged term. */
const hasKey = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

/**
 * @param {unknown} payload - a parsed glossary-unified.json, or an exportBookGlossary return
 * @returns {'export-terminology'|'merge-glossary'|'unknown'}
 */
function detectProducer(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return PRODUCER_UNKNOWN;
  }
  if (payload.producer === PRODUCER_EXPORT) return PRODUCER_EXPORT;

  const terms = payload.terms;
  if (!Array.isArray(terms) || terms.length === 0) return PRODUCER_UNKNOWN;

  const isTerm = (t) => t !== null && typeof t === 'object';
  const subjects = terms.filter((t) => isTerm(t) && hasKey(t, 'subjects')).length;
  const legacy = terms.filter(
    (t) => isTerm(t) && (hasKey(t, 'category') || hasKey(t, 'chapter'))
  ).length;

  // Exclusive on purpose — see the hybrid note in the header.
  if (subjects > 0 && legacy === 0) return PRODUCER_EXPORT;
  if (legacy > 0 && subjects === 0) return PRODUCER_MERGE;
  return PRODUCER_UNKNOWN;
}

module.exports = { detectProducer, PRODUCER_EXPORT, PRODUCER_MERGE, PRODUCER_UNKNOWN };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/glossaryProducer.test.js`
Expected: PASS, including the three real committed books.

- [ ] **Step 5: Commit**

```bash
git add server/lib/glossaryProducer.js server/__tests__/glossaryProducer.test.js
git commit -m "feat(c14): pure producer detector for glossary payloads

Keys on a measured partition: all 4,496 committed terms carry
category+chapter and none carry subjects, while exportBookGlossary emits
the exact complement. Asserted against the real committed files, not
fixtures.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `producerVerdict` in the decision module

**Files:**
- Modify: `server/lib/glossaryExportDecision.js` (append; existing exports untouched)
- Test: `server/__tests__/glossaryExportDecision.test.js` (append a describe block)

**Interfaces:**
- Consumes: `detectProducer`, `PRODUCER_EXPORT`, `PRODUCER_MERGE`, `PRODUCER_UNKNOWN` from Task 1.
- Produces: `producerVerdict(prev, next) => { refuse: boolean, prevProducer: string, nextProducer: string }`.

- [ ] **Step 1: Write the failing test**

Append to `server/__tests__/glossaryExportDecision.test.js`:

```javascript
describe('producerVerdict', () => {
  const legacy = { terms: [{ english: 'a', category: 'other', chapter: 1 }] };
  const exported = { producer: 'export-terminology', terms: [{ english: 'a', subjects: [] }] };

  it('refuses when the existing file was written by merge-glossary', () => {
    const v = producerVerdict(legacy, exported);
    expect(v.refuse).toBe(true);
    expect(v.prevProducer).toBe('merge-glossary');
    expect(v.nextProducer).toBe('export-terminology');
  });

  it('permits when both sides are the exporter', () => {
    expect(producerVerdict(exported, exported).refuse).toBe(false);
  });

  it('permits when there is no existing file — nothing to protect', () => {
    expect(producerVerdict(null, exported).refuse).toBe(false);
  });

  it('refuses an unknown existing shape rather than guessing', () => {
    const v = producerVerdict({ terms: [{ english: 'a' }] }, exported);
    expect(v.refuse).toBe(true);
    expect(v.prevProducer).toBe('unknown');
  });

  it('refuses the REVERSE swap too — an adopted file about to be clobbered by merge output', () => {
    const v = producerVerdict(exported, legacy);
    expect(v.refuse).toBe(true);
  });
});
```

Add `producerVerdict` to that file's existing `require` of `../lib/glossaryExportDecision`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/glossaryExportDecision.test.js`
Expected: FAIL — `producerVerdict is not a function`

- [ ] **Step 3: Write minimal implementation**

Append to `server/lib/glossaryExportDecision.js`, above `module.exports`:

```javascript
const { detectProducer } = require('./glossaryProducer');

/**
 * Categorical companion to shrinkVerdict (register C14 ② step 4).
 *
 * Evaluated BEFORE the shrink gate at the call site. Reporting "1117 → 709, a
 * 36.5% shrink" about a file another program wrote invites the operator to
 * reason about two numbers that count different things.
 *
 * A corrupt existing file never reaches here — readExisting reports it as its
 * own kind and the call site maps it straight to a refusal. "Is this
 * parseable" and "who wrote it" stay separate questions, answered in separate
 * places.
 *
 * @returns {{refuse: boolean, prevProducer: string, nextProducer: string}}
 */
function producerVerdict(prev, next) {
  const nextProducer = detectProducer(next);
  if (prev === null || prev === undefined) {
    return { refuse: false, prevProducer: null, nextProducer };
  }
  const prevProducer = detectProducer(prev);
  return { refuse: prevProducer !== nextProducer, prevProducer, nextProducer };
}
```

Extend the export list to `{ countApproved, countTerms, sameTerms, shrinkVerdict, producerVerdict, SHRINK_RATIO }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/__tests__/glossaryExportDecision.test.js`
Expected: PASS, and every pre-existing `shrinkVerdict` / `sameTerms` case still passes **unmodified**.

- [ ] **Step 5: Commit**

```bash
git add server/lib/glossaryExportDecision.js server/__tests__/glossaryExportDecision.test.js
git commit -m "feat(c14): producerVerdict alongside the unchanged shrink guard

Keeps SHRINK_RATIO at 0.5 (D3): the ratio cannot see a producer swap, and
the producer check cannot see a same-producer collapse, which stays live
forever after every book is adopted.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Stamp the exporter's output

**Files:**
- Modify: `server/services/terminologyService.js:1581`
- Test: `server/__tests__/terminologyService.test.js` (append to the existing `exportBookGlossary()` describe)

**Interfaces:**
- Consumes: `PRODUCER_EXPORT` from Task 1.
- Produces: `exportBookGlossary(slug)` return gains `producer: 'export-terminology'`.

- [ ] **Step 1: Pre-flight — confirm no object-shape pin exists**

Run: `grep -n "exportBookGlossary" server/__tests__/terminologyService.test.js`
then read each hit and confirm none asserts the **whole payload** with `toEqual`/`toMatchObject`/`Object.keys`.

Expected: assertions are all of the form `data.terms`, `out.terms.map(...)`, `bond.alternatives`.
**If a whole-payload pin exists, update it in this task** — CLAUDE.md's `NON_RENDER_KEYS` warning is exactly this class: a new key riding a lossless passthrough into a golden oracle. Checking "rendered output unchanged" would not catch it; checking the object shape does.

- [ ] **Step 2: Write the failing test**

Append inside the existing `describe('exportBookGlossary()', ...)`:

```javascript
it('stamps its own output with the producer name', () => {
  const data = terminologyService.exportBookGlossary('efnafraedi-2e');
  expect(data.producer).toBe('export-terminology');
});

it('the stamp is top-level, so it cannot dirty the write-if-changed comparison', () => {
  const { sameTerms } = require('../lib/glossaryExportDecision');
  const a = terminologyService.exportBookGlossary('efnafraedi-2e');
  const b = terminologyService.exportBookGlossary('efnafraedi-2e');
  expect(sameTerms(a, b)).toBe(true);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run server/__tests__/terminologyService.test.js -t 'stamps its own output'`
Expected: FAIL — `expected undefined to be 'export-terminology'`

- [ ] **Step 4: Write minimal implementation**

In `server/services/terminologyService.js`, add the require near the top with the other lib requires:

```javascript
const { PRODUCER_EXPORT } = require('../lib/glossaryProducer');
```

and change the return at `:1581` from:

```javascript
  return { generated: new Date().toISOString(), book: bookSlug, stats, terms };
```

to:

```javascript
  // `producer` is TOP-LEVEL on purpose: sameTerms compares only `.terms`
  // (glossaryExportDecision.js), so the stamp cannot trigger a spurious
  // rewrite every 2h. It makes producer detection exact for every book after
  // its first adoption, and catches the REVERSE swap — re-running
  // merge-glossary.js over an adopted book removes the stamp.
  return { producer: PRODUCER_EXPORT, generated: new Date().toISOString(), book: bookSlug, stats, terms };
```

Update the function's JSDoc `@returns` from `{{ generated, book, stats, terms: Array }}` to `{{ producer, generated, book, stats, terms: Array }}`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run server/__tests__/terminologyService.test.js`
Expected: PASS — all cases, including every pre-existing one.

- [ ] **Step 6: Commit**

```bash
git add server/services/terminologyService.js server/__tests__/terminologyService.test.js
git commit -m "feat(c14): stamp exportBookGlossary output with its producer

Top-level, so sameTerms (which compares only .terms) cannot see it and
write-if-changed is unaffected.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: `readExisting` stops conflating "no file" with "bad file"

**Files:**
- Modify: `server/scripts/export-terminology.js:88-101` (`readExisting`) and its one call site at `:284-291`
- Test: `server/__tests__/glossaryExportRun.test.js:156` (**revise**, do not delete)

**Interfaces:**
- Consumes: nothing new.
- Produces: `readExisting(outPath) => {kind:'absent'} | {kind:'corrupt'} | {kind:'ok', payload: object}`. Non-ENOENT read errors still throw.

- [ ] **Step 1: Revise the existing corrupt-file test**

In `server/__tests__/glossaryExportRun.test.js`, replace the test at `:156`:

```javascript
  it('treats an unparseable existing file as no baseline and writes', () => {
```

with:

```javascript
  // REVISED 2026-08-04 (C14 ② step 4, decision D5). This asserted the
  // opposite: a corrupt file was replaced, on the reasoning that a corrupt
  // file has no value so overwriting it is an improvement. That reasoning
  // holds for the CONTENT and fails for the PRODUCER — an unreadable
  // merge-glossary file was the one remaining path by which a producer swap
  // could happen with no gate at all. We cannot tell what we would destroy,
  // which is exactly when a human decides. Kept rather than deleted so the
  // change is visible to the next reader.
  it('refuses an unparseable existing file rather than replacing it (needs --adopt)', () => {
    seedBook('prufubok', '{ not json');
    const errors = [];
    const code = run({
      exportFn: () => payload(approved(10)),
      logError: (m) => errors.push(m),
    });
    expect(code).toBe(0); // a refusal is not an error (D2)
    expect(readFileSync(
      path.join(root, 'books', 'prufubok', 'glossary', 'glossary-unified.json'),
      'utf8'
    )).toBe('{ not json'); // untouched
    expect(errors.join('\n')).toMatch(/cannot read the existing file/i);
  });

  it('--adopt replaces an unparseable existing file', () => {
    seedBook('prufubok', '{ not json');
    const code = run({ exportFn: () => payload(approved(10)), adopt: true });
    expect(code).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(10);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/glossaryExportRun.test.js -t 'unparseable'`
Expected: FAIL — the file is overwritten, and `adopt` is not an option yet.

- [ ] **Step 3: Write minimal implementation**

Replace `readExisting`'s body (`server/scripts/export-terminology.js:88-101`), keeping the existing header comment above it and appending the note below:

```javascript
/**
 * ... (KEEP the existing header comment verbatim — the EACCES reasoning is
 * still load-bearing) ...
 *
 * ⚠️ RETURNS A DISCRIMINATED RESULT since C14 ② step 4. It used to return
 * `null` for BOTH "no file" and "corrupt file", which made those two
 * indistinguishable to the caller — and a corrupt merge-glossary file was
 * therefore silently replaced by an export, the one remaining ungated path to
 * a producer swap (decision D5). "Absent" still means writing is correct;
 * "corrupt" now means refuse and wait for --adopt.
 */
function readExisting(outPath) {
  let raw;
  try {
    raw = fs.readFileSync(outPath, 'utf-8');
  } catch (err) {
    if (err.code === 'ENOENT') return { kind: 'absent' };
    throw err; // caught per-book by the caller, counted as an error
  }
  try {
    return { kind: 'ok', payload: JSON.parse(raw) };
  } catch {
    return { kind: 'corrupt' };
  }
}
```

At the call site (`:284-291`), change:

```javascript
    let prev;
    try {
      prev = readExisting(outPath);
    } catch (err) {
```

to:

```javascript
    let existing;
    try {
      existing = readExisting(outPath);
    } catch (err) {
```

and immediately after that `catch` block, add:

```javascript
    // D5: unreadable means we cannot tell what we would destroy.
    if (existing.kind === 'corrupt' && !adopt) {
      logError(
        `${b}: REFUSING to write — cannot read the existing file at ${outPath} ` +
          `(unparseable JSON), so its producer cannot be established. ` +
          `Investigate, then pass --adopt to replace it.`
      );
      outcomes[b] = { outcome: 'refused-producer', detail: 'cannot read existing file' };
      continue;
    }
    const prev = existing.kind === 'ok' ? existing.payload : null;
```

(`adopt` and `outcomes` arrive in Task 5; until then this step will not compile —
that is expected and Task 5 completes it. Implement Tasks 4 and 5 back to back.)

- [ ] **Step 4: Proceed directly to Task 5**

Do not run the suite between Tasks 4 and 5 — Task 4 deliberately leaves `adopt`/`outcomes`
undefined. Run and commit at the end of Task 5.

---

### Task 5: Per-book outcome model, `--adopt`, and the producer gate

**Files:**
- Modify: `server/scripts/export-terminology.js` — `runGlossaryExport` signature, main loop, tail; `parseArgs`; the file header docblock
- Test: `server/__tests__/glossaryExportRun.test.js` — new describes; **revise** `:188`, `:446`, `:513`

**Interfaces:**
- Consumes: `producerVerdict` (Task 2), `readExisting`'s discriminated result (Task 4).
- Produces: `runGlossaryExport({..., adopt = false})` returns `0` unless a book hit `error`; an internal `outcomes` map `{[slug]: {outcome: string, detail?: string}}` consumed by Task 6's status file. `parseArgs` returns `{book, dryRun, force, adopt, help, error}`.

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/glossaryExportRun.test.js`. **Note the fixture helpers** — the
existing `payload()`/`approved()` carry neither fingerprint, so both sides detect as
`unknown` and the gate would never fire. These two helpers make the shapes real:

```javascript
/**
 * ⚠️ THE EXISTING FIXTURES CANNOT EXERCISE THE PRODUCER GATE. payload()/approved()
 * build terms as {english, icelandic, status} — no `subjects`, no
 * `category`/`chapter` — so detectProducer returns 'unknown' for BOTH prev and
 * next, they compare equal, and the gate silently never fires. Any test that
 * means to exercise the gate MUST use these.
 */
const legacyTerms = (n) =>
  Array.from({ length: n }, (_, i) => ({
    english: `t${i}`,
    icelandic: `i${i}`,
    status: 'approved',
    category: 'other',
    chapter: 1,
  }));

const exportPayload = (terms, generated = '2026-07-27T09:00:00.000Z') => ({
  producer: 'export-terminology',
  generated,
  book: 'prufubok',
  stats: {},
  terms: terms.map((t) => ({ ...t, subjects: ['chemistry'] })),
});

describe('runGlossaryExport — producer gate (C14 ② step 4)', () => {
  const legacyFile = () =>
    JSON.stringify({ generated: 'x', book: 'prufubok', stats: {}, terms: legacyTerms(1117) });

  it('refuses to overwrite a merge-glossary file, writes nothing, and returns 0', () => {
    seedBook('prufubok', legacyFile());
    const errors = [];
    const code = run({
      exportFn: () => exportPayload(approved(709)),
      logError: (m) => errors.push(m),
    });
    expect(code).toBe(0); // a refusal is correct, not an error (D2)
    expect(readExport('prufubok').terms).toHaveLength(1117); // untouched
    expect(errors.join('\n')).toMatch(/merge-glossary/);
  });

  it('the refusal message does NOT lead with a shrink ratio — the counts measure different things', () => {
    seedBook('prufubok', legacyFile());
    const errors = [];
    run({ exportFn: () => exportPayload(approved(709)), logError: (m) => errors.push(m) });
    expect(errors.join('\n')).toMatch(/producer/i);
  });

  it('--adopt migrates the book and writes', () => {
    seedBook('prufubok', legacyFile());
    const code = run({ exportFn: () => exportPayload(approved(709)), adopt: true });
    expect(code).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(709);
    expect(readExport('prufubok').producer).toBe('export-terminology');
  });

  it('--adopt does NOT bypass the shrink gate — two risks, two acknowledgements', () => {
    // Same producer on both sides, so only the shrink gate can fire.
    seedBook('prufubok', JSON.stringify(exportPayload(approved(1000))));
    const code = run({ exportFn: () => exportPayload(approved(10)), adopt: true });
    expect(code).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(1000); // refused, untouched
  });

  it('--force does NOT bypass the producer gate either', () => {
    seedBook('prufubok', legacyFile());
    const code = run({ exportFn: () => exportPayload(approved(709)), force: true });
    expect(code).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(1117); // refused, untouched
  });

  it('an already-adopted book exports normally with no flags', () => {
    seedBook('prufubok', JSON.stringify(exportPayload(approved(10))));
    const code = run({ exportFn: () => exportPayload(approved(12)) });
    expect(code).toBe(0);
    expect(readExport('prufubok').terms).toHaveLength(12);
  });
});

describe('runGlossaryExport — refusals are not errors (D2)', () => {
  it('writes the heartbeat across a run where every book refused', () => {
    seedBook('prufubok', JSON.stringify({ terms: legacyTerms(100) }));
    const code = run({ exportFn: () => exportPayload(approved(50)) });
    expect(code).toBe(0);
    expect(heartbeatExists()).toBe(true);
  });

  it('still withholds the heartbeat when a book ERRORED', () => {
    seedBook('prufubok');
    const code = run({
      exportFn: () => {
        throw new Error('db is on fire');
      },
    });
    expect(code).toBe(1);
    expect(heartbeatExists()).toBe(false);
  });
});

describe('parseArgs — --adopt', () => {
  it('parses --adopt', () => {
    expect(parseArgs(['--adopt']).adopt).toBe(true);
  });

  it('defaults adopt to false', () => {
    expect(parseArgs([]).adopt).toBe(false);
  });

  it('--adopt does not swallow --book’s value and silently widen to every book', () => {
    // The round-4 trap: a boolean flag positioned before --book must not leave
    // book at its null default ("every book").
    const r = parseArgs(['--adopt', '--book', 'efnafraedi-2e']);
    expect(r.adopt).toBe(true);
    expect(r.book).toBe('efnafraedi-2e');
  });

  it('--book with --adopt in the other order still binds the slug', () => {
    const r = parseArgs(['--book', 'efnafraedi-2e', '--adopt']);
    expect(r.book).toBe('efnafraedi-2e');
    expect(r.adopt).toBe(true);
  });
});
```

Then **revise three existing tests** whose contract changed:

| Line | Was | Becomes |
|---|---|---|
| `:188` `'refuses a catastrophic shrink, writes nothing, and returns 1'` | `expect(code).toBe(1)` | `expect(code).toBe(0)` — rename to `…and returns 0 (a refusal is not an error, D2)`; keep the "writes nothing" assertion |
| `:446` `'skips a book with no book_subject_mapping row, counts it as a failure, and writes nothing'` | `expect(code).toBe(1)` | `expect(code).toBe(0)` — rename `counts it as a failure` → `records it as refused-no-mapping`; keep "writes nothing" |
| `:513` `'does NOT write the heartbeat when a book was refused'` | asserts absence | **invert**: `it('DOES write the heartbeat when a book was refused — a refusal is a correct outcome (D2)')`, `expect(heartbeatExists()).toBe(true)`; add a comment recording that this reversed and why |

Also update the file's top docblock: the line *"A status file written on every outcome would read 'success' forever once the exporter stopped working"* argued against a status file. Task 6 adds one — so amend it to record that **the heartbeat is still the alarm and the status file carries detail only**; it is never consulted for liveness.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/glossaryExportRun.test.js`
Expected: FAIL — `adopt is not defined`, plus the revised expectations.

- [ ] **Step 3: Write the implementation**

In `server/scripts/export-terminology.js`:

**(a)** extend the destructured require:

```javascript
const {
  countApproved,
  countTerms,
  sameTerms,
  shrinkVerdict,
  producerVerdict,
} = require('../lib/glossaryExportDecision');
```

**(b)** add `adopt = false,` to `runGlossaryExport`'s options, after `force = false,`.

**(c)** replace `let failures = 0;` with:

```javascript
  // Per-book outcome, not one counter. A book that refuses for a CORRECT
  // reason (producer swap not yet adopted, no subject mapping, catastrophic
  // shrink) must not suppress the health signal for every other book: on
  // 2026-08-03 that is exactly why /api/health read glossary_export:
  // ok=false across the run that wrote and pushed reader-visible content,
  // and why nobody learned the first prod export had happened.
  const outcomes = {};
  let errors = 0;
  const fail = (b, detail) => {
    outcomes[b] = { outcome: 'error', detail };
    errors++;
  };
```

**(d)** replace each of the four `failures++;` sites with the outcome it deserves:

| Site | Replace `failures++;` with |
|---|---|
| `:236` subjectFn threw | `fail(b, \`could not resolve book subject — ${err.message}\`);` |
| `:245` no subject row | `outcomes[b] = { outcome: 'refused-no-mapping' };` |
| `:257` exportFn threw | `fail(b, \`export failed — ${err.message}\`);` |
| `:280` malformed payload | `fail(b, 'exportFn returned a malformed payload');` |

**(e)** insert the producer gate immediately after Task 4's corrupt-file block and **before** `sameTerms`:

```javascript
    // Producer first, shrink second. A producer swap is categorical; a shrink
    // is quantitative. Reporting "1117 → 709, a 36.5% shrink" about a file
    // another program wrote invites the operator to reason about two numbers
    // that count different things.
    const pv = producerVerdict(prev, next);
    if (pv.refuse && !adopt) {
      logError(
        `${b}: REFUSING to write — the committed file was written by ` +
          `${pv.prevProducer}, not by this exporter (${pv.nextProducer}). Writing would ` +
          `SWAP PRODUCERS, not refresh. Review what this book's glossary should be, ` +
          `then pass --adopt to migrate it.`
      );
      outcomes[b] = {
        outcome: 'refused-producer',
        detail: `committed file written by ${pv.prevProducer}`,
      };
      continue;
    }
```

**(f)** record the remaining outcomes:

- after the `sameTerms` log: `outcomes[b] = { outcome: 'unchanged' };`
- in the shrink refusal branch, replace `failures++;` with
  `outcomes[b] = { outcome: 'refused-shrink', detail: \`${verdict.prevTotal} → ${verdict.nextTotal}\` };`
- in the dry-run branch: `outcomes[b] = { outcome: 'dry-run' };`
- after the successful write: `outcomes[b] = { outcome: pv.refuse ? 'adopted' : 'wrote' };`

**(g)** replace the tail:

```javascript
  if (failures > 0) return 1;
```

with:

```javascript
  if (errors > 0) return 1;
```

leaving the heartbeat block and its comment exactly as they are.

**(h)** in `parseArgs`, add alongside the existing `--force` branch:

```javascript
    } else if (argv[i] === '--adopt') {
      adopt = true;
```

declare `let adopt = false;` with the other flag defaults, and add `adopt` to **every** return object in the function (there are four — the early-error returns included; omitting one is how a flag silently reads `undefined`).

**(i)** update the file header docblock: document `--adopt` in the usage block, and rewrite the "SAFE TO RUN UNATTENDED" paragraph to name **four** rules (write-if-changed, producer gate, shrink guard, book/subject guard) and to state that the cron passes **no flags**, so neither override is reachable unattended.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/__tests__/glossaryExportRun.test.js`
Expected: PASS — new cases and revised ones.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: PASS. Investigate any failure outside these files before continuing — a distant break means an assumption in Tasks 1–4 was wrong.

- [ ] **Step 6: Commit**

```bash
git add server/scripts/export-terminology.js server/__tests__/glossaryExportRun.test.js
git commit -m "feat(c14): per-book outcomes, producer gate, and --adopt

Refusals now exit 0 and keep the heartbeat; only a genuine error exits 1.
The cron passes no flags, so neither --adopt nor --force is reachable
unattended — the structural answer to 'a guard that only gates the manual
path is not a gate'.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Status file and health semantics

**Files:**
- Modify: `server/scripts/export-terminology.js` (add `writeStatus`, call it before the heartbeat)
- Modify: `server/lib/glossaryExportHealth.js`
- Test: `server/__tests__/glossaryExportHealth.test.js`; add status-file cases to `glossaryExportRun.test.js`

**Interfaces:**
- Consumes: `outcomes` / `errors` from Task 5.
- Produces: `pipeline-output/.glossary-export-status.json` = `{ran, filtered, errors, books}`; `readGlossaryExportHealth` returns `{age_hours, stale, ok, errors, books}`.

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/glossaryExportRun.test.js`:

```javascript
describe('runGlossaryExport — status file', () => {
  const statusPath = () => path.join(root, 'pipeline-output', '.glossary-export-status.json');
  const readStatus = () => JSON.parse(readFileSync(statusPath(), 'utf8'));

  it('records a per-book outcome', () => {
    seedBook('prufubok');
    run({ exportFn: () => payload(approved(10)) });
    expect(readStatus().books.prufubok.outcome).toBe('wrote');
    expect(readStatus().errors).toBe(0);
  });

  it('is written even when a book errored — the breakdown matters most then', () => {
    seedBook('prufubok');
    run({
      exportFn: () => {
        throw new Error('boom');
      },
    });
    expect(readStatus().books.prufubok.outcome).toBe('error');
    expect(readStatus().errors).toBe(1);
  });

  it('marks a --book run as filtered, so health cannot read it as whole-corpus', () => {
    seedBook('prufubok');
    run({ book: 'prufubok', exportFn: () => payload(approved(10)) });
    expect(readStatus().filtered).toBe(true);
  });

  it('is NOT written on a dry run', () => {
    seedBook('prufubok');
    run({ dryRun: true, exportFn: () => payload(approved(10)) });
    expect(existsSync(statusPath())).toBe(false);
  });
});
```

Append to `server/__tests__/glossaryExportHealth.test.js`:

First add a `status(obj)` helper beside the file's existing `heartbeat(ageHours)` helper —
**match that file's conventions exactly**: the helper closes over `root`, takes no root
argument, and every assertion uses the fixed clock `NOW`, never `Date.now()` (the file says
so at `:29`).

```javascript
function status(obj) {
  writeFileSync(
    path.join(root, 'pipeline-output', '.glossary-export-status.json'),
    JSON.stringify(obj, null, 2) + '\n'
  );
}
```

```javascript
describe('readGlossaryExportHealth — refusals vs errors (D2)', () => {
  it('is ok when the heartbeat is fresh and books merely refused', () => {
    heartbeat(1);
    status({
      ran: 'x',
      filtered: false,
      errors: 0,
      books: { 'efnafraedi-2e': { outcome: 'refused-producer' } },
    });
    const h = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(h.ok).toBe(true);
    expect(h.books['efnafraedi-2e'].outcome).toBe('refused-producer');
  });

  it('is NOT ok when a book errored, even with a fresh heartbeat', () => {
    heartbeat(1);
    status({
      ran: 'x',
      filtered: false,
      errors: 1,
      books: { 'efnafraedi-2e': { outcome: 'error', detail: 'boom' } },
    });
    expect(readGlossaryExportHealth({ projectRoot: root, nowMs: NOW }).ok).toBe(false);
  });

  it('is NOT ok when stale, whatever the status file says', () => {
    heartbeat(40);
    status({ ran: 'x', filtered: false, errors: 0, books: {} });
    expect(readGlossaryExportHealth({ projectRoot: root, nowMs: NOW }).ok).toBe(false);
  });

  it('a missing status file does not throw — the heartbeat alone still answers liveness', () => {
    heartbeat(1);
    const h = readGlossaryExportHealth({ projectRoot: root, nowMs: NOW });
    expect(h.ok).toBe(true);
    expect(h.books).toEqual({});
  });

  it('an UNPARSEABLE status file does not throw either', () => {
    heartbeat(1);
    writeFileSync(
      path.join(root, 'pipeline-output', '.glossary-export-status.json'),
      '{ not json'
    );
    expect(readGlossaryExportHealth({ projectRoot: root, nowMs: NOW }).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run server/__tests__/glossaryExportHealth.test.js server/__tests__/glossaryExportRun.test.js`
Expected: FAIL — no status file is written; `h.books` undefined.

- [ ] **Step 3: Write the implementation**

In `server/scripts/export-terminology.js`, add beside `HEARTBEAT_REL`:

```javascript
/** Per-book breakdown consumed by GET /api/health and printed by scripts/deploy.sh. */
const STATUS_REL = path.join('pipeline-output', '.glossary-export-status.json');
```

and beside `writeHeartbeat`:

```javascript
/**
 * ⚠️ NOT a liveness signal. The heartbeat remains the alarm — absence is the
 * alarm, per the C11(b) doctrine — precisely because a status file written on
 * every outcome would read "success" forever once the exporter stopped
 * running. This file carries DETAIL ONLY: which book got which outcome. It is
 * written even on a run that ended in an error, because the breakdown is most
 * valuable exactly then.
 */
function writeStatus(projectRoot, status) {
  const p = path.join(projectRoot, STATUS_REL);
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(status, null, 2) + '\n', 'utf-8');
  } catch {
    // Reporting must never take down the signal it reports on.
  }
}
```

Immediately before the `if (errors > 0) return 1;` line, insert:

```javascript
  if (!dryRun) {
    writeStatus(projectRoot, {
      ran: new Date().toISOString(),
      filtered: book !== null,
      errors,
      books: outcomes,
    });
  }
```

In `server/lib/glossaryExportHealth.js`, replace the `return` at `:50` and update the docblock:

```javascript
  let detail = { errors: 0, books: {} };
  try {
    const raw = fs.readFileSync(
      path.join(projectRoot, 'pipeline-output', '.glossary-export-status.json'),
      'utf-8'
    );
    const parsed = JSON.parse(raw);
    detail = {
      errors: Number(parsed.errors) || 0,
      books: parsed.books && typeof parsed.books === 'object' ? parsed.books : {},
    };
  } catch {
    // No status file (or an unreadable one) — the heartbeat alone still
    // answers liveness, which is the question `ok` is about.
  }

  const health = computeBackupHeartbeatHealth({ heartbeatMtimeMs, nowMs, staleHours });
  // D2: a refusal is a CORRECT outcome and must not flip ok. A check that is
  // permanently red for expected reasons gets tuned out — which is how a live
  // incident hid inside a steady ok=false on 2026-08-03.
  return { ...health, ...detail, ok: !health.stale && detail.errors === 0 };
```

Also amend the docblock at `:18` — it currently states the exporter writes no status file, which this task falsifies.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run server/__tests__/glossaryExportHealth.test.js server/__tests__/glossaryExportRun.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/scripts/export-terminology.js server/lib/glossaryExportHealth.js server/__tests__/glossaryExportHealth.test.js server/__tests__/glossaryExportRun.test.js
git commit -m "feat(c14): per-book status file and refusal-tolerant health

ok = !stale && errors === 0. The heartbeat stays the liveness alarm; the
status file carries detail only and is never consulted for liveness.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Make refusals visible where a human actually looks

**Files:**
- Modify: `scripts/deploy.sh:134-145`
- Modify: `scripts/git-backup.sh:141`

**Interfaces:**
- Consumes: `checks.glossary_export.books` from Task 6.
- Produces: no code interface — operator-visible output.

- [ ] **Step 1: Understand why this is not optional**

D5 makes an unreadable file a refusal; D2 says refusals stay `ok`. Composed, a corrupt
glossary yields exit 0, heartbeat written, `ok: true`, and the only trace is a string in a
JSON file that **nothing polls** — CLAUDE.md is explicit that nothing polls `/api/health`.
That is the §C11(b) shape: a detector reporting into a channel nobody reads, unnoticed for 13
days. **Without this task, D5 converts a corrupt file from "silently overwritten" to "silently
skipped", which is not an improvement.**

- [ ] **Step 2: Modify `scripts/deploy.sh`**

Replace the node one-liner's body (`:134-145`) so it prints refusals as well as not-ok checks:

```bash
    echo "$HEALTH_BODY" | node -e "
      let d='';process.stdin.on('data',c=>d+=c);
      process.stdin.on('end',()=>{
        try{
          const h=JSON.parse(d);
          const bad=Object.entries(h.checks||{}).filter(([,c])=>!c.ok).map(([n])=>n);
          console.log('Health: '+h.status+(bad.length?' — not ok: '+bad.join(', '):''));
          // A glossary refusal keeps the check ok (register C14 ② step 4, D2),
          // so it would otherwise be invisible: nothing polls /api/health, and
          // this is the only routine surface. Print refusals regardless of ok.
          const books=(h.checks&&h.checks.glossary_export&&h.checks.glossary_export.books)||{};
          for(const [b,o] of Object.entries(books)){
            if(o&&typeof o.outcome==='string'&&o.outcome.startsWith('refused')){
              console.log('  ⚠ glossary '+b+': '+o.outcome+(o.detail?' — '+o.detail:''));
            }
          }
        }catch{console.log('Health: (unparseable response)')}
      })
    " || true
```

- [ ] **Step 3: Verify the deploy readout by hand**

Run:

```bash
printf '%s' '{"status":"ok","checks":{"glossary_export":{"ok":true,"books":{"efnafraedi-2e":{"outcome":"refused-producer","detail":"committed file written by merge-glossary"},"liffraedi-2e":{"outcome":"wrote"}}}}}' \
  | node -e "$(sed -n '/^      let d=/,/^      })$/p' scripts/deploy.sh)"
```

Expected output:

```
Health: ok
  ⚠ glossary efnafraedi-2e: refused-producer — committed file written by merge-glossary
```

`liffraedi-2e` must NOT appear — only refusals are printed.

- [ ] **Step 4: Modify `scripts/git-backup.sh`**

Change the WARN text at `:141` to match the new exit semantics:

```bash
    log "WARN: glossary export ERRORED or timed out — continuing with the content backup (a per-book refusal is NOT an error and does not reach here; see checks.glossary_export)"
```

- [ ] **Step 5: Syntax-check both scripts**

Run: `bash -n scripts/deploy.sh && bash -n scripts/git-backup.sh && echo OK`
Expected: `OK`

- [ ] **Step 6: Commit**

```bash
git add scripts/deploy.sh scripts/git-backup.sh
git commit -m "feat(c14): print glossary refusals in the deploy health readout

D2 keeps a refusal ok, and nothing polls /api/health, so a refusal would
otherwise be silent — the C11(b) shape that went unnoticed for 13 days.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Mutation verification, docs, and the gate

**Files:**
- Modify: `server/scripts/export-terminology.js` (`describeMalformedPayload` docblock only)
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C14 ② status + follow-ups)

- [ ] **Step 1: Mutation-verify the producer gate**

Temporarily make `detectProducer` always return `PRODUCER_EXPORT`, then run:

`npx vitest run server/__tests__/glossaryProducer.test.js server/__tests__/glossaryExportRun.test.js`

Expected: **FAIL** — the real-committed-file cases and the producer-gate cases.
Then revert the mutation and confirm green. **A guard nothing fails on is not a guard**; this
register records three checks in one branch that passed for the wrong reason.

- [ ] **Step 2: Mutation-verify the gate is actually wired**

Temporarily delete the `if (pv.refuse && !adopt)` block from `runGlossaryExport`, run the same
two files, confirm FAIL, and revert. Step 1 proves the detector works; only this proves the
call site uses it.

- [ ] **Step 3: Add the distinguishing sentence to `describeMalformedPayload`**

Append to its docblock:

```javascript
 * ⚠️ THIS GUARD IS ABOUT A MALFORMED **EXPORT** (exportFn's return). A
 * malformed **existing file** is a different path with a different outcome:
 * readExisting reports `{kind:'corrupt'}` and the caller REFUSES, waiting for
 * --adopt (register C14 ② step 4, decision D5), rather than erroring. The two
 * guards look redundant and are not — one protects what we are about to
 * write, the other protects what we are about to destroy.
```

- [ ] **Step 4: Run the authoritative gate**

Run: `npm test` **from the repo root**
Expected: PASS. Record the file/test counts in the PR body — do not copy the numbers from
any document, including the spec.

- [ ] **Step 5: Run lint and format exactly as CI does**

Run: `npm run lint && npm run format:check`
Expected: both clean. `npm run lint` alone is **not** the Lint job — CI also runs prettier.

- [ ] **Step 6: Update the register**

In `docs/plans/2026-07-21-post-item17-followup-campaign.md`:
- §C14 ② step 4 → shipped, with the PR number and merge commit.
- The RESUME block's **▶ SINGLE NEXT ACTION** line → the next action (C16 pending a [LEAD] greenlight, or the P2 batches).
- Add the two §9 follow-ups from the spec: `merge-glossary.js` refusing to clobber an adopted file, and the unused `stats.disputed` corroborating signal.
- ⚠️ Record explicitly that **this does not make the export safe to switch back on** — prod still carries the uncommitted `#CONTAINED-2026-08-03#` edit, and adoption is per book and still `[LEAD]`.

- [ ] **Step 7: Whole-branch adversarial review**

Use `superpowers:requesting-code-review` over the whole branch diff before opening the PR —
the item-17/-21 pattern this campaign mandates.

- [ ] **Step 8: Commit**

```bash
git add server/scripts/export-terminology.js docs/plans/2026-07-21-post-item17-followup-campaign.md
git commit -m "docs(c14): distinguish the two malformed-input guards; update the register

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Out of scope — do not do these in this branch

| Excluded | Why / owner |
|---|---|
| Lifting `#CONTAINED-2026-08-03#` on prod | **[LEAD]**, after merge. This branch touches no prod state. |
| Running `--adopt` on any real book | **[LEAD]**, per book. §C14 ②'s standing positions still hold. |
| Per-book `approved` flips (§C14 ② steps 2/3) | Editorial; chemistry = 124 decisions |
| `hasGlossaryDir`'s silent skip; empty `books/orverufraedi/glossary/` | Register §C14 ②, line 269 |
| C19 — `archiver@8` ESM break | Register §C19 |
| Teaching `merge-glossary.js` to refuse clobbering an adopted file | Spec §9 follow-up |
