# §C36 B3 — Glossary Export Cut-Over Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the glossary export write a *resolved view* from the concept model instead of a subject-filtered dump of the old terminology tables — without adopting any book, and without moving a single committed byte.

**Architecture:** `runGlossaryExport` already takes its payload builder as an injectable `exportFn`. B3 writes a new builder (`buildResolvedGlossary`), gives it a census input lifted out of B1's gate script, stamps its output with a distinct producer so the reshape cannot pass the producer gate unnoticed, and flips the default. `terminologyService.exportBookGlossary` is left untouched for Part C to delete.

**Tech Stack:** Node 22 (`.nvmrc` is the single source of truth), CommonJS under `server/`, ESM under root/`tools/`, better-sqlite3, Vitest.

## Global Constraints

- **Spec:** [`docs/superpowers/specs/2026-08-08-terminology-concept-model-part-b3-design.md`](../specs/2026-08-08-terminology-concept-model-part-b3-design.md). Decisions D1–D7 are binding; if the code wants to disagree with one, stop and raise it rather than quietly deviating.
- **No book is adopted by this plan.** Every book must still refuse at the end of Task 5. If any committed `glossary-unified.json` changes, that is a defect, not progress.
- **Nothing under `tools/` changes except `tools/__tests__/glossaryCollisionBaseline.test.js` and `tools/validate-glossary.js` (Task 6).** The render path is reached, never edited.
- **`terminologyService.js` is not touched.** (B1 non-goal, restated in the B3 spec §1.)
- **`server/` tests are ESM vitest files that load CJS modules via `createRequire(import.meta.url)`.** `tools/` tests use plain ESM `import`. Follow the file you are editing.
- **Resolve every path against `import.meta.url`/`__dirname`, or `resolveDbPath()` for the DB — never `process.cwd()`.** CLAUDE.md durable rule; the cron runs from the repo root and systemd runs the server from `server/`.
- **Authoritative gate is root `npm test`, run from the repo root.** `npm run lint` is not the Lint job (CI also runs `format:check`) and `npm test` does not run Playwright.
- **Producer string:** `export-terminology-resolved` — exact, lowercase, hyphenated.
- **Per-term fingerprint key is `domain` (singular). Never emit `subjects`, `category`, or `chapter` on a resolved term** — the three producer fingerprints must stay disjoint.
- **`status` is `"approved"` on every emitted term** (D2). Removing that stamp must turn a test red.
- Commit after every task. Do not squash tasks together.

---

## File Structure

| File | Responsibility |
|---|---|
| `server/lib/sourceEnglish.js` | **new** — read a book's `02-for-mt` and return its candidate English strings. The single owner of the tokenisation. |
| `server/lib/resolvedGlossary.js` | **new** — `buildResolvedGlossary(db, slug, opts)` + `createResolvedExportFn(dbPath)`. All of B3's payload logic. |
| `server/lib/glossaryProducer.js` | **modify** — add `PRODUCER_RESOLVED`, recognise it. |
| `server/scripts/export-terminology.js` | **modify** — fix `parseArgs`; flip the `exportFn` default; update help text. |
| `server/scripts/verify-resolve-gates.js` | **modify** — import the lifted census instead of defining it. |
| `tools/validate-glossary.js` + `tools/__tests__/glossaryCollisionBaseline.test.js` | **modify** — D7 retirement: skip resolved payloads, strengthen the non-vacuity guard. |
| `test-results/b3-export-cutover-2026-08.md` | **new** — acceptance-gate evidence. |

---

### Task 1: Fix `parseArgs` (B0 deferred finding 5)

This is B3's precondition and it lands **alone**, because `export-terminology.js` is invoked by a 2-hourly cron on production and this function decides whether `--adopt` was passed.

**What is actually wrong:** `--book` takes `argv[i + 1]` and only rejects `undefined` and empty-after-trim. It does **not** reject a value that is itself a flag, so `--book --dry-run` sets `book = '--dry-run'` and leaves `dryRun` false.

⚠️ **Be accurate about the severity when you write the commit message.** In B0's parser the same shape created a 0-byte SQLite file named after the flag. Here the swallowed value flows to `hasGlossaryDir('--dry-run')`, which is false, so the run refuses with *"no glossary directory at books/--dry-run/glossary"* and exits 1. **The defect is a confusing failure, not a dangerous write.** Fix it because a parser that silently eats flags on a production cron script is a latent hazard, not because this instance is destructive — claiming otherwise would put a false severity in the record.

**Files:**
- Modify: `server/scripts/export-terminology.js:849-941` (`parseArgs`)
- Test: `server/__tests__/glossaryExportRun.test.js` (existing `parseArgs` coverage lives here)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `parseArgs(argv)` return shape unchanged — `{ book, dryRun, force, adopt, help, error }`. Only the set of inputs that produce a non-null `error` grows.

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/glossaryExportRun.test.js`, inside the existing `parseArgs` describe (or add this describe if the file groups differently):

```js
describe('parseArgs does not swallow the next flag as a value', () => {
  it.each([
    ['--dry-run'],
    ['--force'],
    ['--adopt'],
    ['--help'],
  ])('refuses --book followed by %s', (flag) => {
    const r = parseArgs(['--book', flag]);
    expect(r.book).toBeNull();
    expect(r.error).toMatch(/next argument is the flag/);
  });

  it('names the flag it refused, so the message is actionable', () => {
    expect(parseArgs(['--book', '--adopt']).error).toContain('"--adopt"');
  });

  it('still accepts a legitimate slug', () => {
    expect(parseArgs(['--book', 'efnafraedi-2e'])).toMatchObject({
      book: 'efnafraedi-2e',
      error: null,
    });
  });

  it('allows a real path-like value beginning with -- via the ./ escape', () => {
    expect(parseArgs(['--book', './--odd'])).toMatchObject({ book: './--odd', error: null });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/__tests__/glossaryExportRun.test.js -t 'swallow'`
Expected: FAIL — `--book --dry-run` currently returns `{ book: '--dry-run', error: null }`.

- [ ] **Step 3: Implement**

In `parseArgs`, immediately after `const raw = argv[i + 1];` and the `undefined` check, before `const value = raw.trim();`, insert:

```js
      // ⚠️ Do not swallow the NEXT FLAG as a value (B0 deferred finding 5).
      // `--book --adopt` used to set book='--adopt' and leave adopt FALSE, so
      // the run refused with a message naming a book nobody typed. Modelled on
      // run-concept-import.js's parseImportArgs, which returns an error string
      // for anything it does not recognise rather than dropping it silently.
      if (String(raw).startsWith('--')) {
        return {
          book: null,
          dryRun,
          force,
          adopt,
          help,
          error:
            `--book requires a value, but the next argument is the flag ${JSON.stringify(raw)}. ` +
            `If you really mean a slug beginning with '--', write it as './${raw}'.`,
        };
      }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/__tests__/glossaryExportRun.test.js`
Expected: PASS, including the pre-existing cases.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/export-terminology.js server/__tests__/glossaryExportRun.test.js
git commit -m "fix(export): parseArgs no longer swallows the next flag as --book's value

B0 deferred finding 5, B3's precondition. --book --adopt set book='--adopt'
and left adopt false. The run then refused with a message naming a book
nobody typed -- a confusing failure rather than a dangerous write, since
hasGlossaryDir('--adopt') is false and nothing is written.

Fixed on its own because export-terminology.js is cron-invoked on prod and
this function decides whether --adopt was passed. Modelled on
run-concept-import.js's parseImportArgs, including the './' escape for a
value that legitimately begins with --."
```

---

### Task 2: Lift the census into `server/lib/sourceEnglish.js`

**Files:**
- Create: `server/lib/sourceEnglish.js`
- Modify: `server/scripts/verify-resolve-gates.js` (delete the local `collectSourceEnglish`, import it)
- Test: `server/__tests__/sourceEnglish.test.js` (new)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `collectSourceEnglish(slug, { booksDir } = {}) → { strings: string[], filesRead: number, root: string }`.

⚠️ **The return shape changes from the original.** The version in `verify-resolve-gates.js` returns a bare array and prints its own warnings. The lib returns the count too, so the *caller* decides policy — Task 4 throws on an empty census, the gates script keeps printing and continuing. Reporting stays at the call site; the lib stays quiet.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/sourceEnglish.test.js`:

```js
// server/__tests__/sourceEnglish.test.js
/**
 * The tokenisation is part of the METHOD (B3 spec D1). B1's first census read
 * 30-46% low because a non-overlapping bigram regex made a term's visibility
 * depend on its byte offset. The overlapping case below is that defect's pin.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { collectSourceEnglish } = require('../lib/sourceEnglish');

let booksDir;

function writeSource(slug, relPath, text) {
  const p = path.join(booksDir, slug, '02-for-mt', relPath);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'utf8');
}

beforeEach(() => {
  booksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'b3-census-'));
});
afterEach(() => {
  fs.rmSync(booksDir, { recursive: true, force: true });
});

describe('collectSourceEnglish', () => {
  it('emits every unigram of 2+ characters', () => {
    writeSource('bk', 'ch01/m1.md', 'The carbon atom');
    const { strings } = collectSourceEnglish('bk', { booksDir });
    expect(strings).toEqual(expect.arrayContaining(['The', 'carbon', 'atom']));
  });

  it('emits OVERLAPPING bigrams, not offset-locked ones', () => {
    writeSource('bk', 'ch01/m1.md', 'carbon dioxide gas');
    const { strings } = collectSourceEnglish('bk', { booksDir });
    // A non-overlapping tokeniser consumes "dioxide" into the first pair and
    // can never emit the second. Both must be present.
    expect(strings).toEqual(expect.arrayContaining(['carbon dioxide', 'dioxide gas']));
  });

  it('does not join across a newline or punctuation', () => {
    writeSource('bk', 'ch01/m1.md', 'carbon\ndioxide, gas');
    const { strings } = collectSourceEnglish('bk', { booksDir });
    expect(strings).not.toContain('carbon dioxide');
    expect(strings).not.toContain('dioxide gas');
  });

  it('strips SEG comments and bracket-marker openers but keeps their prose', () => {
    writeSource('bk', 'ch01/m1.md', '<!-- SEG:m1:para:x -->[[i:vatns]] flow');
    const { strings } = collectSourceEnglish('bk', { booksDir });
    expect(strings).toContain('vatns');
    expect(strings).not.toContain('SEG');
  });

  it('excludes .md.backup.<timestamp> files', () => {
    writeSource('bk', 'ch01/m1.md', 'alpha');
    writeSource('bk', 'ch01/m1.md.backup.20260101', 'betaword');
    const { strings, filesRead } = collectSourceEnglish('bk', { booksDir });
    expect(filesRead).toBe(1);
    expect(strings).not.toContain('betaword');
  });

  it('reports an absent tree as 0 files rather than throwing', () => {
    expect(collectSourceEnglish('missing', { booksDir })).toMatchObject({
      strings: [],
      filesRead: 0,
    });
  });

  it('reports filesRead 0 for a tree containing no .md files', () => {
    writeSource('bk', 'ch01/notes.txt', 'alpha');
    expect(collectSourceEnglish('bk', { booksDir }).filesRead).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/sourceEnglish.test.js`
Expected: FAIL — `Cannot find module '../lib/sourceEnglish'`.

- [ ] **Step 3: Implement**

Create `server/lib/sourceEnglish.js`:

```js
// server/lib/sourceEnglish.js
/**
 * The candidate English strings a book actually contains, read from its
 * extracted EN segments.
 *
 * ⚠️ SOURCE IS `02-for-mt`, NOT `01-source` — ruled during B1 and recorded as an
 * amendment to that spec's §8.2. 02-for-mt holds the extracted EN segments the
 * glossary is actually filtered against; 01-source is raw CNXML.
 *
 * ⚠️ THE TOKENISATION IS PART OF THE METHOD. B1's first census came in 30-46%
 * low (1,398/67/176 against a recorded 2,001/126/310) and was written up as a
 * register discrepancy before the cause was found: a NON-OVERLAPPING two-word
 * regex, which made a term's visibility depend on its byte offset. Emit every
 * unigram AND every adjacent pair from ONE token pass. Changing this changes
 * the census, so record it alongside any number derived from it.
 *
 * Quiet by design: it reports `filesRead` and lets the CALLER decide what an
 * empty census means. buildResolvedGlossary throws; verify-resolve-gates.js
 * prints and continues.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_BOOKS_DIR = path.join(__dirname, '..', '..', 'books');

/**
 * @param {string} slug
 * @param {{booksDir?: string}} [opts]
 * @returns {{strings: string[], filesRead: number, root: string}}
 */
function collectSourceEnglish(slug, { booksDir = DEFAULT_BOOKS_DIR } = {}) {
  const root = path.join(booksDir, slug, '02-for-mt');
  if (!fs.existsSync(root)) return { strings: [], filesRead: 0, root };

  const words = new Set();
  let filesRead = 0;

  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (!e.name.endsWith('.md')) continue; // excludes .md.backup.<timestamp>
      filesRead++;
      const text = fs
        .readFileSync(p, 'utf8')
        .replace(/<!--[\s\S]*?-->/g, ' ') // SEG markers
        .replace(/\[\[[a-z]+:/g, ' ') // bracket-marker OPEN, prose kept
        .replace(/\]\]/g, ' ');
      const toks = [...text.matchAll(/[A-Za-z][A-Za-z-]*/g)];
      for (let i = 0; i < toks.length; i++) {
        const [word] = toks[i];
        if (word.length >= 2) words.add(word);
        const next = toks[i + 1];
        if (!next || word.length < 2 || !/^[a-z]+$/.test(next[0])) continue;
        // Adjacent means separated by exactly one space in the SOURCE — not
        // merely consecutive in the token list, which would join across
        // newlines and punctuation and invent terms the book does not contain.
        if (next.index === toks[i].index + word.length + 1 && text[next.index - 1] === ' ') {
          words.add(`${word} ${next[0]}`);
        }
      }
    }
  };

  walk(root);
  return { strings: [...words], filesRead, root };
}

module.exports = { collectSourceEnglish, DEFAULT_BOOKS_DIR };
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/__tests__/sourceEnglish.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Re-point the gates script**

In `server/scripts/verify-resolve-gates.js`, delete the whole local `collectSourceEnglish` function (and its long doc comment — move any part of it not already reproduced in the lib into the lib), and add near the other requires:

```js
const { collectSourceEnglish: collectSourceEnglishRaw } = require('../lib/sourceEnglish');

/** Gate-script wrapper: keeps this script's own loud reporting behaviour. */
function collectSourceEnglish(slug) {
  const { strings, filesRead, root } = collectSourceEnglishRaw(slug);
  if (filesRead === 0) {
    // ⚠️ An empty result must be LOUD. A census over 0 files reports "0 ties"
    // and looks like a clean pass — an absence is not an answer.
    console.error(`  ⚠️ read 0 .md files under ${root} — gate 2 is meaningless`);
    return [];
  }
  console.log(`  files read: ${filesRead}`);
  return strings;
}
```

- [ ] **Step 6: Verify the gates script still reproduces B1's numbers**

Run: `node server/scripts/verify-resolve-gates.js --db <a scratch copy of prod, see Task 7 Step 1>`
Expected: gate 2 reports **1,999 / 120 / 299** for chemistry, unchanged from B1's record. If it does not, the lift changed the method — stop and diff the tokenisation rather than accepting the new number.

- [ ] **Step 7: Commit**

```bash
git add server/lib/sourceEnglish.js server/__tests__/sourceEnglish.test.js server/scripts/verify-resolve-gates.js
git commit -m "refactor(B3): lift collectSourceEnglish into server/lib/sourceEnglish.js

One owner for the tokenisation, so the gates script and the export cannot
drift apart on the method -- which is the specific way B1's census first went
wrong (a non-overlapping bigram regex, 30-46% low, diagnosed as a register
discrepancy before the cause was found).

The lib returns { strings, filesRead, root } and stays quiet; the caller
decides what an empty census means. The gates script keeps its loud reporting
in a thin wrapper and still reproduces 1,999/120/299 for chemistry."
```

---

### Task 3: `PRODUCER_RESOLVED`

**Files:**
- Modify: `server/lib/glossaryProducer.js`
- Test: `server/__tests__/glossaryProducer.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `PRODUCER_RESOLVED === 'export-terminology-resolved'`, exported from `server/lib/glossaryProducer.js`; `detectProducer(payload)` now returns it.

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/glossaryProducer.test.js`:

```js
describe('the resolved export is a distinct producer', () => {
  const resolved = {
    producer: 'export-terminology-resolved',
    terms: [{ english: 'pH', icelandic: 'sýrustig', status: 'approved', domain: 'biology' }],
  };

  it('detects the stamp', () => {
    expect(detectProducer(resolved)).toBe(PRODUCER_RESOLVED);
  });

  it('is not confused with the old export', () => {
    expect(PRODUCER_RESOLVED).not.toBe(PRODUCER_EXPORT);
    expect(detectProducer({ producer: 'export-terminology', terms: [] })).toBe(PRODUCER_EXPORT);
  });

  it('an UNSTAMPED resolved payload is unknown, so it fails closed', () => {
    const { producer, ...unstamped } = resolved;
    expect(detectProducer(unstamped)).toBe(PRODUCER_UNKNOWN);
  });

  it('a resolved term carries `domain` and none of the other fingerprints', () => {
    const t = resolved.terms[0];
    expect(t).toHaveProperty('domain');
    expect(t).not.toHaveProperty('subjects');
    expect(t).not.toHaveProperty('category');
    expect(t).not.toHaveProperty('chapter');
  });
});
```

Make sure `PRODUCER_RESOLVED` is added to the file's existing import/require line.

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/__tests__/glossaryProducer.test.js -t 'distinct producer'`
Expected: FAIL — `PRODUCER_RESOLVED` is undefined.

- [ ] **Step 3: Implement**

In `server/lib/glossaryProducer.js`, add the constant beside the others:

```js
const PRODUCER_RESOLVED = 'export-terminology-resolved';
```

Add the check inside `detectProducer`, immediately after the existing `PRODUCER_EXPORT` line:

```js
  // B3: the resolved view is a DIFFERENT producer, deliberately. Its payload is
  // a subject-filtered dump's replacement, not its refresh — and detectProducer
  // short-circuits on the stamp BEFORE reading `terms`, so without its own
  // constant the reshape would pass the producer gate unnoticed. That is the
  // failure class C14 and C21 exist to prevent, arriving through the door they
  // left open.
  //
  // Shape inference below stays exhaustive: a resolved term carries `domain`,
  // never `subjects`/`category`/`chapter`, so an UNSTAMPED resolved payload
  // falls through to `unknown` and refuses. Fail-closed, per the hybrid rule.
  if (payload.producer === PRODUCER_RESOLVED) return PRODUCER_RESOLVED;
```

Extend the export list:

```js
module.exports = {
  detectProducer,
  PRODUCER_EXPORT,
  PRODUCER_MERGE,
  PRODUCER_RESOLVED,
  PRODUCER_UNKNOWN,
};
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/__tests__/glossaryProducer.test.js`
Expected: PASS, including the pre-existing real-file fingerprint measurements.

- [ ] **Step 5: Commit**

```bash
git add server/lib/glossaryProducer.js server/__tests__/glossaryProducer.test.js
git commit -m "feat(B3): PRODUCER_RESOLVED, so the reshape cannot pass the gate unnoticed

detectProducer short-circuits on the top-level stamp before it ever reads
payload.terms, and the old exporter emits that stamp unconditionally -- so a
book adopted under the old shape would silently receive a completely
different payload with no gate firing.

A resolved term carries `domain` and never subjects/category/chapter, keeping
the three fingerprints disjoint, so an unstamped resolved payload infers to
unknown and refuses."
```

---

### Task 4: `buildResolvedGlossary`

The core of B3. Pure enough to test against a scratch DB with no filesystem: the census is injectable.

**Files:**
- Create: `server/lib/resolvedGlossary.js`
- Test: `server/__tests__/resolvedGlossary.test.js` (new)

**Interfaces:**
- Consumes: `collectSourceEnglish(slug, {booksDir}) → {strings, filesRead, root}` (Task 2); `PRODUCER_RESOLVED` (Task 3); `buildScope(db, slug, chapter) → Scope|{unscoped}` and `resolve(scope, english) → Resolution` (B1, `server/lib/conceptResolver.js`, unchanged).
- Produces: `buildResolvedGlossary(db, slug, { census } = {}) → payload`; `createResolvedExportFn(dbPath) → (slug) => payload` (used by Task 5).

⚠️ **`resolve(scope, english)` takes NO `db`.** The scope carries its own connection and prepared statements. B1's spec Interfaces block was amended to say so; its code snippets were not.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/resolvedGlossary.test.js`:

```js
// server/__tests__/resolvedGlossary.test.js
/**
 * The census is injected, so this file needs no books/ tree. What it does need
 * is a real schema — the resolver reads five tables — so it builds one with the
 * real migrations via freshMigratedDb.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { freshMigratedDb } = require('./helpers/freshMigratedDb');
const { buildResolvedGlossary } = require('../lib/resolvedGlossary');

let db;

/** chemistry(1) > physics(2) > biology(3) — efnafraedi-2e's real order. */
function seed() {
  db = freshMigratedDb();
  db.prepare('INSERT INTO registered_books (id, slug) VALUES (1, ?)').run('bk');
  const prio = db.prepare(
    'INSERT INTO book_domain_priority (book_id, domain, position) VALUES (1, ?, ?)'
  );
  prio.run('chemistry', 1);
  prio.run('physics', 2);
  prio.run('biology', 3);
}

/** Returns the concept id. `is` terms are given in rank order. */
function concept(domain, english, isTerms, idordabankiId = null) {
  const cid = db
    .prepare('INSERT INTO concept (domain, idordabanki_id) VALUES (?, ?)')
    .run(domain, idordabankiId).lastInsertRowid;
  db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', ?, 1, 'test')"
  ).run(cid, english);
  isTerms.forEach((t, i) => {
    db.prepare(
      "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', ?, ?, 'test')"
    ).run(cid, t, i + 1);
  });
  return cid;
}

const build = (strings) =>
  buildResolvedGlossary(db, 'bk', { census: { strings, filesRead: 1, root: '/fake' } });

beforeEach(seed);

describe('buildResolvedGlossary', () => {
  it('emits the head form by default, with reason', () => {
    concept('chemistry', 'atom', ['frumeind', 'atóm']);
    const t = build(['atom']).terms[0];
    expect(t).toMatchObject({
      english: 'atom',
      icelandic: 'frumeind',
      status: 'approved',
      reason: 'head-form',
      domain: 'chemistry',
      position: 1,
    });
  });

  it('carries the concept\'s other Icelandic terms as alternatives, in rank order', () => {
    concept('chemistry', 'atom', ['frumeind', 'atóm', 'eind']);
    expect(build(['atom']).terms[0].alternatives).toEqual(['atóm', 'eind']);
  });

  it('carries `domain` and never the other producers\' fingerprints', () => {
    concept('chemistry', 'atom', ['frumeind']);
    const t = build(['atom']).terms[0];
    expect(t).toHaveProperty('domain');
    expect(t).not.toHaveProperty('subjects');
    expect(t).not.toHaveProperty('category');
    expect(t).not.toHaveProperty('chapter');
  });

  it('honours an editor book-preference over the head form', () => {
    const cid = concept('chemistry', 'atom', ['frumeind', 'atóm']);
    const termId = db
      .prepare("SELECT id FROM concept_term WHERE concept_id = ? AND text = 'atóm'")
      .get(cid).id;
    db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (1, 0, ?, ?)'
    ).run(cid, termId);
    expect(build(['atom']).terms[0]).toMatchObject({
      icelandic: 'atóm',
      reason: 'book-preference',
    });
  });

  it('applies the subject FALLBACK — this is what unblocks chemistry', () => {
    // No chemistry concept for pH; biology at position 3 answers.
    concept('biology', 'pH', ['sýrustig']);
    expect(build(['pH']).terms[0]).toMatchObject({ icelandic: 'sýrustig', domain: 'biology' });
  });

  it('emits a NOMINAL tie once and counts it', () => {
    concept('chemistry', 'cell', ['hola']);
    concept('chemistry', 'cell', ['hola']); // same position, identical head form
    const out = build(['cell']);
    expect(out.terms).toHaveLength(1);
    expect(out.terms[0].icelandic).toBe('hola');
    expect(out.stats.nominalTies).toBe(1);
  });

  it('does NOT emit a real tie, and counts it', () => {
    concept('chemistry', 'antibiotic', ['fúkalyf']);
    concept('chemistry', 'antibiotic', ['sýklalyf']);
    const out = build(['antibiotic']);
    expect(out.terms).toHaveLength(0);
    expect(out.stats.ties).toBe(1);
  });

  it('excludes out-of-scope concepts and counts them separately', () => {
    concept('mathematics', 'vector', ['vigur']); // absent from bk's priority list
    const out = build(['vector']);
    expect(out.terms).toHaveLength(0);
    expect(out.stats.outOfScopeOnly).toBe(1);
  });

  it('sorts terms by english', () => {
    concept('chemistry', 'zinc', ['sink']);
    concept('chemistry', 'acid', ['sýra']);
    expect(build(['zinc', 'acid']).terms.map((t) => t.english)).toEqual(['acid', 'zinc']);
  });

  it('stamps the resolved producer', () => {
    concept('chemistry', 'atom', ['frumeind']);
    expect(build(['atom']).producer).toBe('export-terminology-resolved');
  });

  it('throws on an empty census rather than returning an empty payload', () => {
    expect(() => build([])).toThrow(/census is empty/i);
  });

  it('throws, naming the fault, for an unregistered book', () => {
    expect(() =>
      buildResolvedGlossary(db, 'nope', { census: { strings: ['atom'], filesRead: 1, root: '/x' } })
    ).toThrow(/unregistered/);
  });

  it('throws, naming the OTHER fault, for a registered book with no priorities', () => {
    db.prepare('INSERT INTO registered_books (id, slug) VALUES (2, ?)').run('bare');
    expect(() =>
      buildResolvedGlossary(db, 'bare', { census: { strings: ['atom'], filesRead: 1, root: '/x' } })
    ).toThrow(/no-priorities/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/resolvedGlossary.test.js`
Expected: FAIL — `Cannot find module '../lib/resolvedGlossary'`.

- [ ] **Step 3: Implement**

Create `server/lib/resolvedGlossary.js`:

```js
// server/lib/resolvedGlossary.js
/**
 * The glossary export's payload, built as a RESOLVED VIEW of the concept model
 * (register §C36 B3; spec docs/superpowers/specs/2026-08-08-...-part-b3-design.md).
 *
 * Replaces terminologyService.exportBookGlossary, which emitted a
 * subject-filtered dump of the old terminology tables with NO fallback — the
 * reason chemistry's adoption was destructive: it discarded pH, bond, carbon
 * dioxide, nitrogen and 108 more correct terms for want of one.
 *
 * ⚠️ THIS FILE'S OUTPUT IS NOT MT-ONLY. Approved terms are substituted into
 * published CNXML by tools/lib/math-label-substitute.js. `status: 'approved'`
 * on every term is therefore load-bearing (spec D2): buildGlossaryMap drops
 * everything else, and an unstamped export silently puts English into
 * published math.
 */
const path = require('path');
const { buildScope, resolve } = require('./conceptResolver');
const { collectSourceEnglish } = require('./sourceEnglish');
const { PRODUCER_RESOLVED } = require('./glossaryProducer');

/**
 * @param {import('better-sqlite3').Database} db an OPEN connection
 * @param {string} bookSlug
 * @param {{census?: {strings: string[], filesRead: number, root: string}, booksDir?: string}} [opts]
 * @returns {{producer, generated, book, stats, terms: Array}}
 * @throws when the book is unscoped, or its census is empty
 */
function buildResolvedGlossary(db, bookSlug, { census, booksDir } = {}) {
  // ⚠️ Chapter 0 — the book default — ALWAYS. glossary-unified.json is one file
  // per book, so a chapter-scoped answer is not expressible here; consulting
  // chapter preferences would silently pick one chapter's choices for the book.
  const scope = buildScope(db, bookSlug, 0);
  if (scope.unscoped) {
    // ⚠️ Two faults with DIFFERENT remedies, never collapsed (B1 spec D3):
    // 'unregistered' -> add the book via the admin route.
    // 'no-priorities' -> the book is registered but absent from migration 046's
    // frozen map, which needs a migration.
    throw new Error(
      `${bookSlug}: cannot build a resolved glossary — the book is unscoped (${scope.unscoped}). ` +
        (scope.unscoped === 'unregistered'
          ? 'It has no registered_books row; register it through the admin route.'
          : 'It is registered but has no book_domain_priority rows; that needs a migration.')
    );
  }

  const source = census || collectSourceEnglish(bookSlug, booksDir ? { booksDir } : undefined);

  // ⚠️ THE AGGREGATE CASE FIRST. A per-string filter over an EMPTY list finds
  // nothing to complain about, so a book with no extracted source would produce
  // a valid-shaped 0-term payload and read like a legitimate export. That is
  // B0's zero-yield lesson; an unextracted book is an environment fact.
  if (!source.strings.length) {
    throw new Error(
      `${bookSlug}: census is empty (${source.filesRead} .md file(s) under ${source.root}) — ` +
        `refusing to build a glossary from no source text. Extract the book first.`
    );
  }

  const stats = {
    total: 0,
    approved: 0,
    ties: 0,
    nominalTies: 0,
    outOfScopeOnly: 0,
    censusStrings: source.strings.length,
  };
  const terms = [];

  for (const english of source.strings) {
    const r = resolve(scope, english);

    if (!r.winner) {
      if (r.tied.length) stats.ties++;
      else if (r.outOfScope.length) stats.outOfScopeOnly++;
      continue;
    }
    if (r.nominalTie.length) stats.nominalTies++;

    const alternatives = scope.stmts.terms
      .all(r.winner.conceptId)
      .filter((t) => t.term_id !== r.winner.termId)
      .map((t) => t.text);

    terms.push({
      english,
      icelandic: r.winner.text,
      // D2: load-bearing. buildGlossaryMap drops anything else.
      status: 'approved',
      // Provenance, kept SEPARATE from the selector above — §C18's lesson is
      // that one column read as both is how row order came to decide what
      // readers see.
      reason: r.reason,
      // The producer fingerprint. Never `subjects`/`category`/`chapter`.
      domain: r.winner.domain,
      position: r.winner.position,
      conceptId: r.winner.conceptId,
      alternatives,
    });
  }

  terms.sort((a, b) => (a.english < b.english ? -1 : a.english > b.english ? 1 : 0));
  stats.total = terms.length;
  stats.approved = terms.length;

  return {
    producer: PRODUCER_RESOLVED,
    generated: new Date().toISOString(),
    book: bookSlug,
    stats,
    terms,
  };
}

/**
 * The `exportFn` runGlossaryExport injects.
 *
 * ⚠️ export-terminology.js has NEVER opened a database — today's exportFn
 * reaches terminologyService's lazy module-level singleton, which is why the
 * script appears not to need one. buildResolvedGlossary takes an explicit
 * connection, so this factory is the lifetime that has to exist now.
 *
 * Used as a DEFAULT PARAMETER, so it is evaluated only when no exportFn was
 * injected — a test that supplies its own opens no database at all.
 */
function createResolvedExportFn(dbPath) {
  const Database = require('better-sqlite3');
  const resolveDbPath = require('./dbPath');
  // ⚠️ resolveDbPath(), never process.cwd() (CLAUDE.md, durable): the cron runs
  // this from the repo root and systemd runs the server from server/.
  const db = new Database(dbPath || resolveDbPath(), { readonly: true });
  return (slug) => buildResolvedGlossary(db, slug);
}

module.exports = { buildResolvedGlossary, createResolvedExportFn };
```

⚠️ **If `freshMigratedDb` does not export the name used above, read the helper and use its actual export.** Do not change the helper.

⚠️ **If `server/lib/dbPath.js` exports an object rather than a function**, adapt the `resolveDbPath` require accordingly — check before assuming. The rule that matters is that the path is not derived from `process.cwd()`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/__tests__/resolvedGlossary.test.js`
Expected: PASS, 13 tests.

- [ ] **Step 5: Force each guard red once**

An assertion never seen red is an untested assertion. Temporarily, one at a time:
1. Change `status: 'approved'` to `status: 'proposed'` → the status assertion must fail. Revert.
2. Delete the `if (!source.strings.length)` block → the empty-census test must fail. Revert.
3. Change `domain: r.winner.domain` to `subjects: [r.winner.domain]` → the fingerprint test must fail. Revert.

Record in the commit message that all three were forced.

- [ ] **Step 6: Commit**

```bash
git add server/lib/resolvedGlossary.js server/__tests__/resolvedGlossary.test.js
git commit -m "feat(B3): buildResolvedGlossary — the export as a resolved view

One entry per resolved English string over the book's census, with the
concept's other Icelandic terms as alternatives. Replaces a subject-filtered
dump that had no fallback -- the reason chemistry's adoption was destructive.

Decisions from the spec, each pinned: census-scoped (D1); status 'approved'
with reason alongside, because buildGlossaryMap drops anything else and an
unstamped export puts English into published math (D2); real ties omitted and
counted, nominal ties emitted (D4); out-of-scope excluded (D5). Chapter 0
always -- one file per book cannot express a chapter-scoped answer.

Both unscoped faults throw and name themselves rather than collapsing into an
empty payload. An empty census throws: the aggregate case is checked first,
because a filter over an empty list finds nothing to complain about.

Three guards forced red once each before committing: the status stamp, the
empty-census throw, and the domain fingerprint."
```

---

### Task 5: Flip the default, and pin that nothing moves

**Files:**
- Modify: `server/scripts/export-terminology.js` (require, `exportFn` default, help text)
- Test: `server/__tests__/glossaryExportRun.test.js`, `server/__tests__/glossaryExportBookSet.test.js`

**Interfaces:**
- Consumes: `createResolvedExportFn(dbPath)` (Task 4); `PRODUCER_RESOLVED` (Task 3).
- Produces: `runGlossaryExport`'s default `exportFn` is now the resolved builder. Signature and every other option unchanged.

- [ ] **Step 1: Write the regression pin**

This is the evidence for D6 — that B3 moves nothing — and it is the most important test in the plan. Append to `server/__tests__/glossaryExportBookSet.test.js`:

```js
describe('B3 changes no book outcome (register §C36 D6)', () => {
  it('every glossary-bearing book still refuses, for the same reason as before', () => {
    const outcomes = {};
    const code = runGlossaryExport({
      // A stub standing in for the resolved builder: what matters here is that
      // the payload is stamped RESOLVED, because that is what the producer gate
      // sees. The builder's own correctness is Task 4's business.
      exportFn: (slug) => ({
        producer: 'export-terminology-resolved',
        generated: 'x',
        book: slug,
        stats: {},
        terms: [{ english: 'atom', icelandic: 'frumeind', status: 'approved', domain: 'chemistry' }],
      }),
      subjectFn: () => 'chemistry',
      dryRun: true,
      log: () => {},
      logError: () => {},
    });

    expect(code).toBe(0); // refusals are not errors (decision D2 of C14)
    // Three merge-glossary books refuse on producer; edlisfraedi-2e has no
    // committed file and refuses on absent baseline.
    void outcomes;
  });
});
```

⚠️ **`runGlossaryExport` returns an exit code, not the outcome map** — it writes outcomes to the status file. Read the existing tests in `glossaryExportRun.test.js` to see how they observe per-book outcomes (they capture `logError` output or read the written status file) and follow that pattern instead of the `outcomes` placeholder above. **Assert the four outcomes explicitly**: `efnafraedi-2e`, `liffraedi-2e`, `lifraen-efnafraedi` → `refused-producer`; `edlisfraedi-2e` → `refused-absent-baseline`.

- [ ] **Step 2: Run to verify it fails or passes for the right reason**

Run: `npx vitest run server/__tests__/glossaryExportBookSet.test.js`
Expected: PASS. If it fails, the producer gate is not seeing the resolved stamp — go back to Task 3 rather than weakening this test.

- [ ] **Step 3: Flip the default**

In `server/scripts/export-terminology.js`, add to the requires:

```js
const { createResolvedExportFn } = require('../lib/resolvedGlossary');
```

Change the `runGlossaryExport` signature line:

```js
  exportFn = createResolvedExportFn(),
```

⚠️ Leave `const terminologyService = require('../services/terminologyService');` in place **only if `subjectFn`'s default still uses it** — it does (`subjectFn = terminologyService.getBookSubject`). Do not remove that require.

Add above the signature:

```js
/**
 * ⚠️ B3: `exportFn` now defaults to the RESOLVED builder, not
 * terminologyService.exportBookGlossary — which is dead from here and is
 * deleted by Part C along with the tables it reads.
 *
 * A default parameter is evaluated only when the argument is `undefined`, so a
 * caller that injects its own exportFn still opens NO database. That preserves
 * the posture the lazy singleton gave, without the singleton.
 */
```

- [ ] **Step 4: Update the help text**

In `main()`'s help block, add after the `--adopt` lines:

```
'  NOTE: since B3 this exporter emits a RESOLVED VIEW of the concept model\n' +
'  (producer "export-terminology-resolved"), not a subject-filtered dump.\n' +
'  A book whose committed glossary came from any other producer therefore\n' +
'  refuses until --adopt --book <slug>. That is deliberate: adoption is a\n' +
'  per-book decision with reader-visible consequences.\n' +
```

- [ ] **Step 5: Run the whole server suite**

Run: `npm test` (from the repo root)
Expected: PASS. ⚠️ Pay attention to `glossaryExportRun.test.js` — any test that asserted old-export payload *shape* through the default path needs re-pointing at an injected `exportFn`, not deleting.

- [ ] **Step 6: Commit**

```bash
git add server/scripts/export-terminology.js server/__tests__/glossaryExportBookSet.test.js server/__tests__/glossaryExportRun.test.js
git commit -m "feat(B3): the export's default payload builder is now the resolved view

One default argument. Everything around it -- the producer/shrink/absent
gates, the status file, since carry-forward, /api/health, the 2h cron -- is
untouched, because none of it was ever coupled to where the payload came
from. That seam is why this is a substitution and not a rewrite.

Pinned: all four glossary-bearing books still refuse with unchanged outcomes
(three refused-producer, edlisfraedi-2e refused-absent-baseline). B3 moves no
committed byte; chemistry is unblocked, not adopted."
```

---

### Task 6: Retire the collision baseline sweep (D7)

**Files:**
- Modify: `tools/__tests__/glossaryCollisionBaseline.test.js`
- Modify: `tools/validate-glossary.js` — **only if** the skip helper belongs there for reuse by `npm run validate:glossary`; otherwise keep the change inside the test file.

**Interfaces:**
- Consumes: the producer string `'export-terminology-resolved'` (Task 3). ⚠️ `tools/` is MIT and `server/` is AGPL — **do not import from `server/`.** Declare the string locally with a comment naming `server/lib/glossaryProducer.js` as its source of truth.

⚠️ **Read D7 before starting.** The vacuity is *per book, at adoption* — not now. At this point in the plan all four committed payloads are still merge-glossary files with real collisions, so the sweep is fully live and must stay that way.

- [ ] **Step 1: Write the failing tests**

Append to `tools/__tests__/glossaryCollisionBaseline.test.js`:

```js
describe('D7 — the sweep retires per book, at adoption', () => {
  const RESOLVED = 'export-terminology-resolved';

  it('skips a resolved payload, in which a collision is unrepresentable', () => {
    // One entry per English string: findGlossaryCollisions needs >=2 Icelandic
    // values per key, so it can never find one here. Sweeping it would be a
    // test that passes because its subject is gone.
    expect(isSweepable({ producer: RESOLVED, terms: [] })).toBe(false);
  });

  it('still sweeps a merge-glossary payload', () => {
    expect(isSweepable({ terms: [{ english: 'atom', category: 'x', chapter: 1 }] })).toBe(true);
  });

  it('still sweeps an old-export payload', () => {
    expect(isSweepable({ producer: 'export-terminology', terms: [{ subjects: [] }] })).toBe(true);
  });
});
```

- [ ] **Step 2: Strengthen the non-vacuity guard**

Replace the existing guard:

```js
  it('finds at least one book with a glossary (the sweep is not vacuous)', () => {
    expect(booksWithGlossaries.length).toBeGreaterThan(0);
  });
```

with:

```js
  // ⚠️ D7: once skipping exists, "some book has a glossary file" no longer
  // implies "some book was swept" — every book could be skipped and this would
  // still pass. Assert what actually happened, or the retirement becomes the
  // bug. This test's own header states the principle: absence of a baseline is
  // not approval (the C11(b) lesson — a shipped detector that had never run
  // went unnoticed for 13 days).
  it('actually sweeps at least one book (the sweep is not vacuous)', () => {
    expect(sweptBooks.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 3: Implement**

Near the top of the test file, after `booksWithGlossaries` is computed:

```js
/**
 * The resolved export (server/lib/glossaryProducer.js PRODUCER_RESOLVED — the
 * string is duplicated rather than imported because tools/ is MIT and server/
 * is AGPL; see root LICENSE).
 */
const PRODUCER_RESOLVED = 'export-terminology-resolved';

/** A payload worth sweeping: one in which a collision can exist at all. */
export function isSweepable(glossary) {
  return !(glossary && glossary.producer === PRODUCER_RESOLVED);
}

const sweptBooks = booksWithGlossaries.filter((slug) =>
  isSweepable(JSON.parse(fs.readFileSync(glossaryPath(path.join(BOOKS_DIR, slug)), 'utf8')))
);
```

Change the per-book sweep from `it.each(booksWithGlossaries)` to `it.each(sweptBooks)`.

⚠️ `isSweepable` is exported for the unit tests above. If the project's lint rules forbid exporting from a test file, move `isSweepable` into `tools/validate-glossary.js` beside `loadBaseline`/`buildBaseline` and import it in both places.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tools/__tests__/glossaryCollisionBaseline.test.js`
Expected: PASS. `sweptBooks` must still contain **all four** books today — none has adopted.

- [ ] **Step 5: Force the guard red**

Temporarily make `isSweepable` return `false` unconditionally. The strengthened non-vacuity test must FAIL (and the per-book sweep must vanish rather than pass empty). Revert.

- [ ] **Step 6: Commit**

```bash
git add tools/__tests__/glossaryCollisionBaseline.test.js
git commit -m "test(B3): retire the collision sweep per book, at adoption (D7)

Retired rather than re-pointed at ties: a collision is two Icelandic strings
already committed under one English key, a tie is two concepts at one priority
position. Aiming an old fence at a new field would look like continuity while
asserting something nobody designed.

B0's note that this test goes green-but-vacuous is true of one of its two
describes, and not yet. diffAgainstBaseline's unit tests build their own
fixtures and never retire. The committed-glossary sweep loses its subject per
book, at that book's adoption -- so the skip is by producer stamp, and all
four books are still swept today.

The non-vacuity guard is strengthened in the same change, because 'some book
has a glossary' would still pass when every book is skipped. It now asserts a
book was actually swept -- this test's own principle, absence of a baseline is
not approval, applied to the mechanism retiring it. Forced red once."
```

---

### Task 7: Acceptance gate on the real corpus

No production database is modified. This measures what the export *would* write.

**Files:**
- Create: `test-results/b3-export-cutover-2026-08.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the evidence the adoption decision will be argued from.

- [ ] **Step 1: Take a consistent scratch copy of production**

⚠️ **`db.backup()`, not `cp`** — a live SQLite file copied with `cp` can be torn. This is B2's method:

```bash
ssh siggi@172.236.212.190 'cd ~/repos/namsbokasafn-efni/server && node -e "
const D=require(\"better-sqlite3\");
const db=new D(\"../pipeline-output/sessions.db\",{readonly:true});
db.backup(\"/tmp/b3-scratch.db\").then(()=>process.exit(0));
"'
scp siggi@172.236.212.190:/tmp/b3-scratch.db /tmp/b3-scratch.db
```

- [ ] **Step 2: Confirm the scratch DB carries B2's population**

```bash
node -e 'const D=require("./server/node_modules/better-sqlite3");const db=new D("/tmp/b3-scratch.db",{readonly:true});
for (const t of ["concept","concept_term","book_domain_priority","terminology_translations"])
  console.log(t, db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c);'
```

Expected: `concept` 70187 · `concept_term` 192189 · `book_domain_priority` 21 · `terminology_translations` 28903. **If these differ, stop** — the gate below would measure a different corpus than the one the register records.

- [ ] **Step 3: Measure per book**

Write a throwaway script (scratchpad, not committed) that, for each of `efnafraedi-2e`, `liffraedi-2e`, `lifraen-efnafraedi`, `edlisfraedi-2e`, opens the scratch DB and calls `buildResolvedGlossary(db, slug)` with the **real** census (no injection), catching and recording throws. Record: term count · `stats` · duration.

Compare chemistry's term count against today's committed **709**.

- [ ] **Step 4: Assert the four fallback terms — the content of "unblocks chemistry"**

In chemistry's payload, these must be present with these domains:

| english | icelandic | domain |
|---|---|---|
| `pH` | (from the corpus) | `biology` |
| `bond` | (from the corpus) | `physics` |
| `carbon dioxide` | (from the corpus) | `biology` |
| `nitrogen` | (from the corpus) | `physics` |

These are the terms the old export's strict subject filter discards for want of a fallback. **If any is missing, B3 has not delivered its purpose** — investigate before writing anything up.

- [ ] **Step 5: Reproduce B1's census, method included**

Chemistry's `stats.ties` / `stats.nominalTies` against B1's recorded **299 / 120**.

⚠️ **Reproduce the METHOD, not only the numbers** — source directory (`02-for-mt`) *and* tokenisation (overlapping bigrams). B1 lost a session to quoting numbers without the method and diagnosing the difference as a register discrepancy.

- [ ] **Step 6: Run the regression pin against production's own data**

Run `runGlossaryExport` in `--dry-run` against a checkout whose `books/` is production's, with the scratch DB. All four books must still refuse, with the same outcomes.

- [ ] **Step 7: Keep the old-vs-new diff for chemistry**

Build the payload both ways (old via `terminologyService.exportBookGlossary`, new via `buildResolvedGlossary`) and record: terms only in old, terms only in new, terms whose Icelandic differs. **This is the evidence the adoption decision needs** and it cannot be reconstructed after Part C deletes the old path.

- [ ] **Step 8: Write it up and commit**

Create `test-results/b3-export-cutover-2026-08.md` following `b2-prod-population-2026-08.md`: a banner saying **evidence, not status**; the method including the snapshot technique; every measurement with its control; and an explicit section on what the run does **not** establish.

⚠️ **No count from this file belongs in the register**, and no status verb belongs in this file.

```bash
git add test-results/b3-export-cutover-2026-08.md
git commit -m "test(B3): acceptance gate measured on the real corpus

Per book, against a db.backup() snapshot of production -- never fixtures, and
never a cp of a live SQLite file.

Records the four fallback terms whose absence is what made chemistry's
adoption destructive, chemistry's old-vs-new term diff (which cannot be
reconstructed once Part C deletes the old path), and the regression pin on
production's own books/ tree: all four still refuse."
```

---

### Task 8: Whole-branch blind-pair adversarial review, before the PR

**Lead-authorised 2026-08-08.** (Project memory carries a standing *ask before using Fable — real spend*; this plan is the authorisation for this branch, not a general one.)

**Files:** none — this task produces findings and their dispositions, then the fixes they earn.

**Interfaces:**
- Consumes: the whole branch, Tasks 1–7.
- Produces: a dispositioned finding list; every accepted fix mutation-verified; the PR.

**The method, per the §C14 and B1 precedent.** Two reviewers — **Opus** and **Fable** — on **identical inputs**, **neither told the other exists**, adjudicated afterwards by you. Not one reviewer twice, and not a second pass that can see the first's output: the whole value is in the independence.

**Why a pair, measured rather than asserted.** On B1 both returned *Approved with fixes*, both found **zero Critical**, and **only ~4 of 17 findings overlapped**. The two a single reviewer would most likely have missed were the expensive ones: deleting one line from the merge-cycle walk left the entire suite green *while the resolver looped forever*, and two gates printed a target and never compared against it, so a 32% corpus collapse and a destroyed chemistry fallback both exited 0.

⚠️ **And the pair's value is not "two chances to be right" — it is that they fail differently.** On B0, **Opus certified a false comment as accurate** (it measured `foreign_keys = 1` and attributed it to migration 022's explicit pragma — right number, wrong mechanism) while **Fable found the compile flag**. A single reviewer agreeing with your conclusion is not agreement with your reasoning.

- [ ] **Step 1: Give both reviewers the same brief**

The diff `main..HEAD`, the spec, and this plan. State the goal in the reviewer's terms — *this changes what the glossary export would write, without adopting any book* — and ask specifically about: whether any committed byte can move; whether a gate can be passed unnoticed; whether any new test passes for the wrong reason; and whether `status: 'approved'` can be lost on a path no test covers.

- [ ] **Step 2: Dispatch both, blind, and do not let either see the other's output**

Use `Agent` with `subagent_type` per reviewer, in **one message** so they run concurrently and neither can be influenced by the other's result.

- [ ] **Step 3: Adjudicate every finding**

For each: confirmed / refuted / out-of-scope-and-logged-to-the-register. **Refuting a finding requires a measurement, not a rebuttal.** Record the overlap count — it is the evidence for whether the pair was worth it on this branch.

- [ ] **Step 4: Fix what the adjudication confirmed, and mutation-verify each new pin**

An assertion never seen red is an untested assertion. Every test added in response to a finding must be forced red once.

- [ ] **Step 5: Root `npm test` from the repo root**

This is the authoritative gate. ⚠️ It does **not** run Playwright, and `npm run lint` is not the Lint job — verify against the workflow files before calling the branch green.

- [ ] **Step 6: Open the PR**

Body states plainly: **no book adopted, no committed glossary byte moved**, the four books' outcomes unchanged, and a pointer to `test-results/b3-export-cutover-2026-08.md`. Link the spec. Do not restate any measurement the evidence file owns.

- [ ] **Step 7: Update the register**

§C36's Part B block: B3 done, ▶ next is B4. Record the review's overlap count and any deferred findings. **Status lives there and nowhere else** — no count from the evidence file, no status verb in the spec.

---

## Self-Review

**Spec coverage.** D1 census-scoped → Tasks 2, 4. D2 status+reason → Task 4 (with a forced-red control). D3 producer stamp → Task 3. D4 ties → Task 4. D5 out-of-scope → Task 4. D6 no adoption → Task 5's regression pin + Task 7 Step 6. D7 collision baseline → Task 6. §1 prerequisite → Task 1. §4 connection lifetime → Task 4's `createResolvedExportFn`. §5 payload shape → Task 4. §6 error handling → Task 4 (both throws). §7 testing incl. controls → Tasks 2–6. §8 acceptance gate → Task 7. §9 measurements → Task 7 Step 8. §10 risks — each mitigation is a step in Tasks 3–7. **No gaps.** Task 8 implements no spec requirement; it is the campaign's standing pre-PR process (blind-pair review, root `npm test`, register update), which the spec assumes rather than states.

**Placeholder scan.** Two deliberate under-specifications, both flagged inline with what to read instead of guessing: Task 5 Step 1's outcome-observation pattern (the existing tests' convention governs) and Task 6 Step 3's `isSweepable` placement (lint rules govern). Neither hides a design decision. No TBDs.

**Type consistency.** `collectSourceEnglish` returns `{strings, filesRead, root}` in Task 2 and is consumed with those exact names in Task 4. `PRODUCER_RESOLVED` / `'export-terminology-resolved'` is one string throughout, duplicated only in `tools/` for the licence reason, with the duplication commented. `buildResolvedGlossary(db, slug, {census})` matches between Task 4's tests and Task 7's usage. `resolve(scope, english)` takes no `db` in every reference.
