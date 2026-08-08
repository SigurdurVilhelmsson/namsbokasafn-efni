# C36 Part B1 — `resolve()`, inert — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `resolve()` and `buildScope()` over the concept model Part A created, fully tested and measured against the real corpus, while touching no consumer and writing nothing to production.

**Architecture:** One new module, `server/lib/conceptResolver.js`, split into a DB-touching lookup and a **pure** resolution function. Everything per-(book, chapter) — domain priorities, preference rows — is hoisted into a `Scope` built once; the pure part then takes a literal `Scope` plus a candidate array and returns a `Resolution`. That split is why the editor (B4) can call it 47,568 times without reproducing §C24's event-loop block, and why the resolution rules are table-testable with no database at all.

**Tech Stack:** Node 22 · CommonJS (server tree) · `better-sqlite3` · Vitest.

**Spec:** [`docs/superpowers/specs/2026-08-08-terminology-concept-model-part-b1-design.md`](../specs/2026-08-08-terminology-concept-model-part-b1-design.md)
**Register:** §C36 · **Branch:** continue on `spec/c36-part-b1-resolver`, or cut a `feat/` branch from it.

## Global Constraints

- **B1 is INERT.** No consumer is modified. No table is dropped. Nothing writes to any table. `git diff --stat` must show only new files plus the two DRY edits named in Task 1.
- **Do NOT regenerate `server/__tests__/fixtures/c24-golden.json`.** Its header: re-running the capture from HEAD "would certify the new implementation against itself and destroy the oracle."
- **Do NOT modify `server/services/terminologyService.js`.** It is past 2,000 lines; B3/B4 wire it up.
- **Do NOT modify the frozen parent spec** `docs/superpowers/specs/2026-08-07-terminology-concept-model-design.md`. It is evidence; the B1 spec and register §C36 are the live correction.
- **Do NOT edit migrations 045 or 046.** Migrations are append-only. B1 adds none.
- **The server tree is CommonJS** (`require`/`module.exports`). Tests are ESM Vitest files that reach CJS via `createRequire(import.meta.url)` — copy the pattern from `server/__tests__/migrationsRealTree.test.js`.
- **Run `npm test` from the REPO ROOT**, never from `server/`. Resource paths resolve against `import.meta.url`/`__dirname`, never `process.cwd()`.
- **`vitest.config.js` sets `fileParallelism: false` globally.** Nothing runs in parallel, and a test mutating shared module state poisons every **later** file in the run. Never set `process.env.SESSIONS_DB_PATH` in a test.
- **`npm test` is `vitest run` and does NOT run Playwright.** A green `npm test` is never evidence for an E2E change. B1 touches no E2E path.
- **Domain vocabulary and per-book priorities have ONE owner:** `server/lib/domains.js` (`DOMAINS`, `DOMAIN_SET`, `BOOK_DOMAIN_PRIORITY`). Never re-declare them.
- **Exact `Resolution` shape** (spec §4), used verbatim in every task:
  ```js
  {
    winner:     { conceptId, termId, text, domain, position } | null,
    reason:     'chapter-preference' | 'book-preference' | 'head-form' | null,
    nominalTie: [conceptId, …],                    // includes the winner's own id
    tied:       [{ conceptId, text, domain }, …],
    outOfScope: [{ conceptId, text, domain }, …],
    integrity:  [],                                // 0..n of 'merge-cycle' | 'orphan-preference'
    unscoped:   false                              // else 'unregistered' | 'no-priorities'
  }
  ```
- **English matching is EXACT and binary in B1.** `WHERE lang = 'en' AND text = ?`. Normalisation is the caller's responsibility — C24's automaton already folds case and Unicode upstream (`foldChar`, `normalizeUnicode`) and yields a canonical headword. A `COLLATE NOCASE` comparison cannot use `idx_concept_term_lookup`, so it would full-scan on every one of 47,568 lookups. **Task 9 must record which normalisation its census applied**, because gate 2's numbers depend on it.

---

## File Structure

| File | Responsibility |
|---|---|
| **Create** `server/lib/conceptResolver.js` | `buildScope`, `lookupCandidates`, `resolveCandidates` (pure), `resolve`. The only new production code. |
| **Create** `server/__tests__/helpers/freshMigratedDb.js` | Build a DB by running every real migration against an empty file. Extracted from `migrationsRealTree.test.js`. |
| **Modify** `server/__tests__/migrationsRealTree.test.js` | Use the extracted helper instead of its private copy. |
| **Create** `server/__tests__/conceptResolverScope.test.js` | `buildScope` against a real-migration DB. |
| **Create** `server/__tests__/conceptResolverResolve.test.js` | `resolveCandidates` — pure, table-driven, no DB. |
| **Create** `server/__tests__/conceptResolverLookup.test.js` | `lookupCandidates` — `merged_into` following, cycles. |
| **Create** `server/__tests__/conceptResolverMutation.test.js` | Mutation controls: perturbations that MUST redden a named test. |
| **Create** `server/scripts/verify-resolve-gates.js` | Acceptance gates 1, 2, 3, 5 against a scratch corpus DB. |
| **Create** `server/scripts/bench-resolve.js` | Gate 4 — latency **and** RSS, in `bench-c24.js`'s output shape. |
| **Create** `test-results/b1-resolve-gates-2026-08.md` | The recorded measurements. Evidence, banner-dated. |

---

## Task 1: Extract the real-migration test DB helper

**Why first:** every later test needs a database whose schema came from the real migrations. `server/__tests__/helpers/terminologyTestDb.js` is explicitly a *hand-maintained copy* of migration 032 and **has none of the four concept tables** — using it would silently test nothing.

**Files:**
- Create: `server/__tests__/helpers/freshMigratedDb.js`
- Modify: `server/__tests__/migrationsRealTree.test.js` (replace its private `freshDb`)
- Test: `server/__tests__/freshMigratedDb.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `freshMigratedDb()` → `{ db, errors: string[], applied: number, path: string }`. `db` is an open `better-sqlite3` handle on a temp-file database with every migration applied. Every later task uses this.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/freshMigratedDb.test.js`:

```js
// server/__tests__/freshMigratedDb.test.js
/**
 * The helper must produce a schema built by the REAL migrations. The control is
 * terminologyTestDb: a hand-maintained copy of migration 032 that has none of the
 * concept tables. If a future edit points the helper at that copy, the control fails.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { createTestDb } = require('./helpers/terminologyTestDb');

const tableNames = (db) =>
  new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));

describe('freshMigratedDb', () => {
  it('applies every migration without error', () => {
    const { db, errors, applied } = freshMigratedDb();
    expect(errors).toEqual([]);
    expect(applied).toBeGreaterThanOrEqual(47);
    db.close();
  });

  it('creates all four concept-model tables', () => {
    const { db } = freshMigratedDb();
    const names = tableNames(db);
    for (const t of ['concept', 'concept_term', 'book_concept_preference', 'book_domain_priority']) {
      expect(names.has(t)).toBe(true);
    }
    db.close();
  });

  it('CONTROL: the hand-copied terminologyTestDb has none of them', () => {
    const names = tableNames(createTestDb());
    expect(names.has('concept')).toBe(false);
    expect(names.has('book_domain_priority')).toBe(false);
  });

  it('has foreign keys ON, so ON DELETE CASCADE is live', () => {
    const { db } = freshMigratedDb();
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/__tests__/freshMigratedDb.test.js`
Expected: FAIL — `Cannot find module './helpers/freshMigratedDb'`.

- [ ] **Step 3: Write the helper**

Create `server/__tests__/helpers/freshMigratedDb.js`:

```js
// server/__tests__/helpers/freshMigratedDb.js
/**
 * A database whose schema was built by running EVERY real migration against an
 * empty file. Extracted from migrationsRealTree.test.js (register §C36) so the
 * concept-model tests do not become a third hand-copied DDL.
 *
 * ⚠️ Deliberately does NOT call runAllMigrations(). That function takes no db
 * argument — it resolves DB_PATH at module load from resolveDbPath() — so driving
 * it means setting process.env.SESSIONS_DB_PATH before the require and never
 * restoring it. vitest runs with fileParallelism: false, so that shared-state
 * mutation would affect every LATER file in the run. Requiring the migration
 * modules directly is deterministic and touches no global.
 *
 * ⚠️ A temp FILE, not ':memory:' — some migrations inspect the database path.
 *
 * Plain CJS so ESM vitest files can load it via createRequire.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');

function freshMigratedDb() {
  const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-clone-')), 'sessions.db');
  const db = new Database(dbPath);
  const dir = path.join(__dirname, '..', '..', 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{3}-.*\.js$/.test(f))
    .sort(); // zero-padded, so lexical order IS migration order
  const errors = [];
  for (const f of files) {
    try {
      require(path.join(dir, f)).up(db);
    } catch (e) {
      errors.push(`${f}: ${e.message}`);
    }
  }
  return { db, errors, applied: files.length, path: dbPath };
}

module.exports = freshMigratedDb;
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run server/__tests__/freshMigratedDb.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Point `migrationsRealTree.test.js` at the helper**

In `server/__tests__/migrationsRealTree.test.js`, delete its private `freshDb()` function and its now-unused `fs`/`os`/`path`/`Database` requires, then add:

```js
const freshMigratedDb = require('./helpers/freshMigratedDb');
const freshDb = freshMigratedDb; // same shape: { db, errors, applied }
```

Keep the file's existing docblock — its explanation of *why* this pattern exists is the reason the helper is written this way.

- [ ] **Step 6: Verify the existing §C35 pin still passes**

Run: `npx vitest run server/__tests__/migrationsRealTree.test.js`
Expected: PASS, unchanged count. **If any assertion changes, stop** — the extraction was supposed to be behaviour-preserving.

- [ ] **Step 7: Commit**

```bash
git add server/__tests__/helpers/freshMigratedDb.js \
        server/__tests__/freshMigratedDb.test.js \
        server/__tests__/migrationsRealTree.test.js
git commit -m "test(concept): extract the real-migration test DB helper

Every B1 test needs a schema built by the real migrations.
terminologyTestDb is a hand-maintained copy of migration 032 and has NONE
of the four concept tables, so using it would silently test nothing — the
control test asserts exactly that."
```

---

## Task 2: `buildScope` — the two unscoped causes (D3)

**Files:**
- Create: `server/lib/conceptResolver.js`
- Test: `server/__tests__/conceptResolverScope.test.js`

**Interfaces:**
- Consumes: `freshMigratedDb()` from Task 1.
- Produces: `buildScope(db, bookSlug, chapter = 0)` → `{ unscoped: 'unregistered' }` | `{ unscoped: 'no-priorities' }` | `Scope`. Tasks 3–8 all call it.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/conceptResolverScope.test.js`:

```js
// server/__tests__/conceptResolverScope.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { buildScope } = require('../lib/conceptResolver');

/** A registered book with no priority rows — the 'no-priorities' case. */
function registerBare(db, slug) {
  db.prepare("INSERT INTO registered_books (slug, registered_by) VALUES (?, 'test')").run(slug);
  const { id } = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
  db.prepare('DELETE FROM book_domain_priority WHERE book_id = ?').run(id);
  return id;
}

describe('buildScope — D3, an unscoped book names WHICH fault', () => {
  it('returns unscoped:"unregistered" when the slug has no registered_books row', () => {
    const { db } = freshMigratedDb();
    expect(buildScope(db, 'no-such-book')).toEqual({ unscoped: 'unregistered' });
    db.close();
  });

  it('returns unscoped:"no-priorities" when registered with zero priority rows', () => {
    const { db } = freshMigratedDb();
    registerBare(db, 'bok-an-forgangs');
    expect(buildScope(db, 'bok-an-forgangs')).toEqual({ unscoped: 'no-priorities' });
    db.close();
  });

  it('CONTROL: the two causes are distinguishable, not one boolean', () => {
    const { db } = freshMigratedDb();
    registerBare(db, 'bok-an-forgangs');
    const a = buildScope(db, 'no-such-book').unscoped;
    const b = buildScope(db, 'bok-an-forgangs').unscoped;
    expect(a).not.toBe(b);
    db.close();
  });

  it('a book WITH priority rows is not unscoped', () => {
    const { db } = freshMigratedDb();
    // edlisfraedi-2e is one of the two books a fresh clone actually registers (§C35).
    const scope = buildScope(db, 'edlisfraedi-2e');
    expect(scope.unscoped).toBe(false);
    expect(scope.positionOf.get('physics')).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/__tests__/conceptResolverScope.test.js`
Expected: FAIL — `Cannot find module '../lib/conceptResolver'`.

- [ ] **Step 3: Write the minimal implementation**

Create `server/lib/conceptResolver.js`:

```js
// server/lib/conceptResolver.js
'use strict';
/**
 * §C36 Part B1 — the terminology resolver.
 *
 * Spec: docs/superpowers/specs/2026-08-08-terminology-concept-model-part-b1-design.md
 *
 * ⚠️ INERT. Nothing calls this yet: B3 cuts the glossary export over, B4 the
 * editor. It reads only tables Part A created, which hold 0 rows on production.
 *
 * The split is the performance design. Everything per-(book, chapter) is hoisted
 * into a Scope built ONCE; resolveCandidates is then PURE, so the editor can call
 * it 47,568 times without reproducing §C24's event-loop block.
 *
 * `db` is always passed EXPLICITLY, never taken from terminologyService's
 * singleton — that keeps this module testable and free of ambient state.
 */

/**
 * Build the per-(book, chapter) scope.
 *
 * ⚠️ Returns WHICH fault, not a boolean (spec D3). 'unregistered' and
 * 'no-priorities' have different remedies — the admin route vs a migration — and
 * collapsing them repeats one level down the very failure D3 exists to prevent.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {string} bookSlug
 * @param {number} [chapter] 0 = book default · 1..n = chapter · -1 = appendices
 * @returns {{unscoped:'unregistered'}|{unscoped:'no-priorities'}|object}
 */
function buildScope(db, bookSlug, chapter = 0) {
  const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(bookSlug);
  if (!book) return { unscoped: 'unregistered' };

  const prio = db
    .prepare('SELECT domain, position FROM book_domain_priority WHERE book_id = ? ORDER BY position')
    .all(book.id);
  if (prio.length === 0) return { unscoped: 'no-priorities' };

  return {
    bookId: book.id,
    chapter,
    positionOf: new Map(prio.map((r) => [r.domain, r.position])),
    preference: new Map(),
    unscoped: false,
  };
}

module.exports = { buildScope };
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run server/__tests__/conceptResolverScope.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add server/lib/conceptResolver.js server/__tests__/conceptResolverScope.test.js
git commit -m "feat(concept): buildScope names WHICH unscoped fault (D3)

'unregistered' (no registered_books row — §C35, fix via the admin route)
and 'no-priorities' (registered, absent from migration 046's map — fix via
a migration) have different remedies, so a single boolean would hide the
answer. On a fresh clone 4 of 6 books are unscoped."
```

---

## Task 3: `buildScope` — the preference merge, carrying `tier`

**Files:**
- Modify: `server/lib/conceptResolver.js`
- Test: `server/__tests__/conceptResolverScope.test.js` (append a describe block)

**Interfaces:**
- Consumes: `buildScope` from Task 2.
- Produces: `Scope.preference` — `Map<conceptId, {termId, tier}>` where `tier` is `'chapter'` or `'book'`. Task 5 reads it.

- [ ] **Step 1: Write the failing test**

Append to `server/__tests__/conceptResolverScope.test.js`:

```js
/** Seed one concept with one Icelandic term; return {conceptId, termId}. */
function seedConcept(db, { domain = 'physics', en = 'force', is = 'kraftur', rank = 1 } = {}) {
  const c = db
    .prepare("INSERT INTO concept (domain, collection) VALUES (?, 'TEST')")
    .run(domain);
  const conceptId = Number(c.lastInsertRowid);
  db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', ?, 1, 'test')"
  ).run(conceptId, en);
  const t = db
    .prepare(
      "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', ?, ?, 'test')"
    )
    .run(conceptId, is, rank);
  return { conceptId, termId: Number(t.lastInsertRowid) };
}

describe('buildScope — the preference merge', () => {
  it('a chapter row OVERRIDES a book-default row for the same concept', () => {
    const { db } = freshMigratedDb();
    const bookId = db.prepare("SELECT id FROM registered_books WHERE slug = 'edlisfraedi-2e'").get().id;
    const { conceptId } = seedConcept(db);
    const alt = db
      .prepare("INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', 'afl', 2, 'test')")
      .run(conceptId);
    const bookTermId = db
      .prepare("SELECT id FROM concept_term WHERE concept_id = ? AND text = 'kraftur'").get(conceptId).id;
    const chapTermId = Number(alt.lastInsertRowid);

    const ins = db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (?, ?, ?, ?)'
    );
    ins.run(bookId, 0, conceptId, bookTermId);
    ins.run(bookId, 3, conceptId, chapTermId);

    const scope = buildScope(db, 'edlisfraedi-2e', 3);
    expect(scope.preference.get(conceptId)).toEqual({ termId: chapTermId, tier: 'chapter' });
    db.close();
  });

  it('falls back to the book default when the chapter has no row', () => {
    const { db } = freshMigratedDb();
    const bookId = db.prepare("SELECT id FROM registered_books WHERE slug = 'edlisfraedi-2e'").get().id;
    const { conceptId, termId } = seedConcept(db);
    db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (?, 0, ?, ?)'
    ).run(bookId, conceptId, termId);

    const scope = buildScope(db, 'edlisfraedi-2e', 3);
    expect(scope.preference.get(conceptId)).toEqual({ termId, tier: 'book' });
    db.close();
  });

  it('ignores a DIFFERENT chapter’s override', () => {
    const { db } = freshMigratedDb();
    const bookId = db.prepare("SELECT id FROM registered_books WHERE slug = 'edlisfraedi-2e'").get().id;
    const { conceptId, termId } = seedConcept(db);
    db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (?, 7, ?, ?)'
    ).run(bookId, conceptId, termId);

    expect(buildScope(db, 'edlisfraedi-2e', 3).preference.size).toBe(0);
    db.close();
  });

  it('handles the appendices sentinel (-1) like any other chapter', () => {
    const { db } = freshMigratedDb();
    const bookId = db.prepare("SELECT id FROM registered_books WHERE slug = 'edlisfraedi-2e'").get().id;
    const { conceptId, termId } = seedConcept(db);
    db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (?, -1, ?, ?)'
    ).run(bookId, conceptId, termId);

    expect(buildScope(db, 'edlisfraedi-2e', -1).preference.get(conceptId)).toEqual({
      termId,
      tier: 'chapter',
    });
    db.close();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/__tests__/conceptResolverScope.test.js`
Expected: FAIL — 4 new tests fail; `preference` is always an empty Map.

- [ ] **Step 3: Implement the merge**

In `server/lib/conceptResolver.js`, replace `preference: new Map(),` with a call to a new helper, and add the helper above `buildScope`:

```js
/**
 * Merge a book's preference rows for one chapter: chapter rows win over the
 * chapter-0 default.
 *
 * ⚠️ `tier` is CARRIED, not discarded. Parent spec §7.2 requires the editor panel
 * to say which rule fired — "chapter override / book default / head form of
 * domain X" — and this is the only place that still knows.
 *
 * ⚠️ `chapter` is NOT NULL with 0 as the book-default sentinel: in SQLite NULLs do
 * not compare equal inside a primary key, so a nullable chapter would permit two
 * conflicting "book defaults" for one concept. -1 is the appendices sentinel.
 */
function buildPreferenceMap(db, bookId, chapter) {
  const rows = db
    .prepare(
      `SELECT concept_id, term_id, chapter
         FROM book_concept_preference
        WHERE book_id = ? AND chapter IN (0, ?)`
    )
    .all(bookId, chapter);

  const preference = new Map();
  for (const r of rows) {
    const tier = r.chapter === 0 ? 'book' : 'chapter';
    // A chapter row always wins; a book row only fills an empty slot. Order of
    // rows from SQLite is not relied on.
    if (tier === 'chapter' || !preference.has(r.concept_id)) {
      preference.set(r.concept_id, { termId: r.term_id, tier });
    }
  }
  return preference;
}
```

and in `buildScope`:

```js
    preference: buildPreferenceMap(db, book.id, chapter),
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run server/__tests__/conceptResolverScope.test.js`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add server/lib/conceptResolver.js server/__tests__/conceptResolverScope.test.js
git commit -m "feat(concept): merge preference rows at scope-build time, carrying tier

Spec §6 step 3's three-way fall-through collapses to one Map.get inside
resolve(): the chapter/book distinction is settled once per request rather
than per string. tier is carried because §7.2's panel must say which rule
fired, and buildScope is the only place that still knows."
```

---

## Task 4: `lookupCandidates` — `merged_into` following and cycle detection

**Files:**
- Modify: `server/lib/conceptResolver.js`
- Test: `server/__tests__/conceptResolverLookup.test.js`

**Interfaces:**
- Consumes: `buildScope` from Tasks 2–3.
- Produces: `lookupCandidates(db, english)` → `{ candidates: Candidate[], integrity: string[] }` where
  `Candidate = { conceptId, domain, isTerms: Array<{termId, text, rank}> }`, `isTerms` sorted by `rank` ascending. Tasks 5–7 consume this shape.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/conceptResolverLookup.test.js`:

```js
// server/__tests__/conceptResolverLookup.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const freshMigratedDb = require('./helpers/freshMigratedDb');
const { lookupCandidates } = require('../lib/conceptResolver');

function addConcept(db, domain, en, isTerms) {
  const conceptId = Number(
    db.prepare("INSERT INTO concept (domain, collection) VALUES (?, 'TEST')").run(domain)
      .lastInsertRowid
  );
  db.prepare(
    "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'en', ?, 1, 'test')"
  ).run(conceptId, en);
  for (const [text, rank] of isTerms) {
    db.prepare(
      "INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?, 'is', ?, ?, 'test')"
    ).run(conceptId, text, rank);
  }
  return conceptId;
}

describe('lookupCandidates', () => {
  it('returns one candidate per matching concept, is-terms sorted by rank', () => {
    const { db } = freshMigratedDb();
    addConcept(db, 'biology', 'cell', [['fruma', 1], ['sella', 2]]);
    const { candidates, integrity } = lookupCandidates(db, 'cell');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].domain).toBe('biology');
    expect(candidates[0].isTerms.map((t) => t.text)).toEqual(['fruma', 'sella']);
    expect(integrity).toEqual([]);
    db.close();
  });

  it('returns BOTH concepts when one English string has two senses', () => {
    const { db } = freshMigratedDb();
    addConcept(db, 'biology', 'cell', [['fruma', 1]]);
    addConcept(db, 'physics', 'cell', [['rafhlad', 1]]);
    expect(lookupCandidates(db, 'cell').candidates).toHaveLength(2);
    db.close();
  });

  it('follows merged_into to the surviving concept', () => {
    const { db } = freshMigratedDb();
    const absorbed = addConcept(db, 'biology', 'antibiotic', [['fukalyf', 1]]);
    const survivor = addConcept(db, 'biology', 'antibiotic-x', [['syklalyf', 1]]);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(survivor, absorbed);

    const { candidates } = lookupCandidates(db, 'antibiotic');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].conceptId).toBe(survivor);
    expect(candidates[0].isTerms[0].text).toBe('syklalyf');
    db.close();
  });

  it('terminates on a self-merge and reports merge-cycle', () => {
    const { db } = freshMigratedDb();
    const a = addConcept(db, 'biology', 'loopy', [['lykkja', 1]]);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(a, a);
    const { candidates, integrity } = lookupCandidates(db, 'loopy');
    expect(integrity).toContain('merge-cycle');
    expect(candidates[0].conceptId).toBe(a); // stopped at the last unvisited
    db.close();
  });

  it('terminates on an A->B->A cycle, stopping at the last unvisited concept', () => {
    const { db } = freshMigratedDb();
    const a = addConcept(db, 'biology', 'ping', [['a', 1]]);
    const b = addConcept(db, 'biology', 'pong', [['b', 1]]);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(b, a);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(a, b);
    const { candidates, integrity } = lookupCandidates(db, 'ping');
    expect(integrity).toContain('merge-cycle');
    expect(candidates[0].conceptId).toBe(b);
    db.close();
  });

  it('de-duplicates when two matching concepts merge into the same survivor', () => {
    const { db } = freshMigratedDb();
    const survivor = addConcept(db, 'biology', 'dna', [['DKS', 1]]);
    const x = addConcept(db, 'biology', 'dna', [['x', 1]]);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(survivor, x);
    expect(lookupCandidates(db, 'dna').candidates).toHaveLength(1);
    db.close();
  });

  it('returns nothing for an unknown string', () => {
    const { db } = freshMigratedDb();
    expect(lookupCandidates(db, 'nothing-here').candidates).toEqual([]);
    db.close();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/__tests__/conceptResolverLookup.test.js`
Expected: FAIL — `lookupCandidates is not a function`.

- [ ] **Step 3: Implement it**

Add to `server/lib/conceptResolver.js`, before `module.exports`:

```js
/**
 * Walk merged_into to the surviving concept.
 *
 * ⚠️ Import NEVER writes merged_into (parent spec decision 1), so a cycle means
 * editorial corruption. It must terminate and it must be visible — on a cycle we
 * stop at the LAST UNVISITED concept and report, rather than looping or throwing.
 *
 * Resolving THROUGH merged_into is what makes an editorial merge take effect with
 * no data migration: preference rows still naming the absorbed concept keep working.
 */
function followMerge(stmt, startId) {
  const seen = new Set([startId]);
  let id = startId;
  for (;;) {
    const row = stmt.get(id);
    const next = row ? row.merged_into : null;
    if (next == null) return { id, cycle: false };
    if (seen.has(next)) return { id, cycle: true };
    seen.add(next);
    id = next;
  }
}

/**
 * Find every concept having an 'en' term equal to `english`, resolved through
 * merged_into, with its Icelandic terms in rank order.
 *
 * ⚠️ Matching is EXACT and BINARY. Normalisation is the caller's job — C24's
 * automaton folds case and Unicode upstream and yields a canonical headword. A
 * COLLATE NOCASE comparison cannot use idx_concept_term_lookup and would
 * full-scan on every one of biology's 47,568 lookups.
 *
 * @returns {{candidates: Array<{conceptId:number, domain:string,
 *            isTerms: Array<{termId:number, text:string, rank:number}>}>,
 *           integrity: string[]}}
 */
function lookupCandidates(db, english) {
  const hits = db
    .prepare(
      `SELECT DISTINCT c.id AS concept_id
         FROM concept_term t
         JOIN concept c ON c.id = t.concept_id
        WHERE t.lang = 'en' AND t.text = ?`
    )
    .all(english);

  const mergeStmt = db.prepare('SELECT merged_into FROM concept WHERE id = ?');
  const conceptStmt = db.prepare('SELECT id, domain FROM concept WHERE id = ?');
  const termsStmt = db.prepare(
    `SELECT id AS term_id, text, rank
       FROM concept_term
      WHERE concept_id = ? AND lang = 'is'
      ORDER BY rank ASC, id ASC`
  );

  const integrity = [];
  const byId = new Map(); // de-duplicates two hits that merge into one survivor
  for (const h of hits) {
    const { id, cycle } = followMerge(mergeStmt, h.concept_id);
    if (cycle && !integrity.includes('merge-cycle')) integrity.push('merge-cycle');
    if (byId.has(id)) continue;
    const c = conceptStmt.get(id);
    if (!c) continue;
    byId.set(id, {
      conceptId: c.id,
      domain: c.domain,
      isTerms: termsStmt.all(id).map((r) => ({ termId: r.term_id, text: r.text, rank: r.rank })),
    });
  }
  return { candidates: [...byId.values()], integrity };
}
```

Export it: `module.exports = { buildScope, lookupCandidates };`

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run server/__tests__/conceptResolverLookup.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add server/lib/conceptResolver.js server/__tests__/conceptResolverLookup.test.js
git commit -m "feat(concept): lookupCandidates, following merged_into with cycle detection

Import never writes merged_into, so a cycle is editorial corruption: the
walk terminates at the last unvisited concept and reports 'merge-cycle'
rather than looping. Resolving THROUGH merged_into is what makes an
editorial merge take effect with no data migration."
```

---

## Task 5: `resolveCandidates` — term choice, and the term-less filter

**This task fixes a real ordering defect in the parent spec.** §6 runs *choose each candidate's term (3) → lowest position wins (4)*. A concept with an `en` term and no `is` term would win the position race and then resolve to nothing. Filtering must happen **between** the two.

**Files:**
- Modify: `server/lib/conceptResolver.js`
- Test: `server/__tests__/conceptResolverResolve.test.js`

**Interfaces:**
- Consumes: the `Candidate` shape from Task 4; `Scope` from Tasks 2–3.
- Produces: `resolveCandidates(scope, candidates, integrity = [])` → `Resolution` (Global Constraints). **Pure — no database.** Tasks 6–7 extend it.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/conceptResolverResolve.test.js`:

```js
// server/__tests__/conceptResolverResolve.test.js
/**
 * resolveCandidates is PURE: a literal Scope and a literal candidate array, no
 * database anywhere in this file. That is the point of the split.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { resolveCandidates } = require('../lib/conceptResolver');

/** chemistry(1) > physics(2) > biology(3) — efnafraedi-2e's real order. */
const chemScope = (preference = new Map()) => ({
  bookId: 1,
  chapter: 3,
  positionOf: new Map([['chemistry', 1], ['physics', 2], ['biology', 3]]),
  preference,
  unscoped: false,
});

const cand = (conceptId, domain, isTerms) => ({
  conceptId,
  domain,
  isTerms: isTerms.map(([text, rank, termId]) => ({ text, rank, termId })),
});

describe('resolveCandidates — term choice', () => {
  it('uses the rank-1 head form when there is no preference', () => {
    const r = resolveCandidates(chemScope(), [cand(10, 'chemistry', [['fruma', 1, 100], ['sella', 2, 101]])]);
    expect(r.winner).toEqual({ conceptId: 10, termId: 100, text: 'fruma', domain: 'chemistry', position: 1 });
    expect(r.reason).toBe('head-form');
  });

  it('a book preference beats the head form, and says so', () => {
    const pref = new Map([[10, { termId: 101, tier: 'book' }]]);
    const r = resolveCandidates(chemScope(pref), [cand(10, 'chemistry', [['fruma', 1, 100], ['sella', 2, 101]])]);
    expect(r.winner.text).toBe('sella');
    expect(r.reason).toBe('book-preference');
  });

  it('a chapter preference reports chapter-preference', () => {
    const pref = new Map([[10, { termId: 101, tier: 'chapter' }]]);
    const r = resolveCandidates(chemScope(pref), [cand(10, 'chemistry', [['fruma', 1, 100], ['sella', 2, 101]])]);
    expect(r.reason).toBe('chapter-preference');
  });
});

describe('resolveCandidates — D1, out-of-scope is a soft badged tier', () => {
  it('separates an out-of-domain concept instead of dropping it', () => {
    const r = resolveCandidates(chemScope(), [cand(20, 'anatomy-physiology', [['taug', 1, 200]])]);
    expect(r.winner).toBeNull();
    expect(r.outOfScope).toEqual([{ conceptId: 20, text: 'taug', domain: 'anatomy-physiology' }]);
  });

  it('an in-scope winner and an out-of-scope suggestion coexist', () => {
    const r = resolveCandidates(chemScope(), [
      cand(10, 'chemistry', [['efni', 1, 100]]),
      cand(20, 'mathematics', [['stak', 1, 200]]),
    ]);
    expect(r.winner.conceptId).toBe(10);
    expect(r.outOfScope.map((o) => o.conceptId)).toEqual([20]);
  });

  it('the fallback tier is what returns pH: biology wins when chemistry has nothing', () => {
    const r = resolveCandidates(chemScope(), [cand(30, 'biology', [['syrustig', 1, 300]])]);
    expect(r.winner).toEqual({ conceptId: 30, termId: 300, text: 'syrustig', domain: 'biology', position: 3 });
  });
});

describe('resolveCandidates — the term-less candidate (parent spec §6 ordering defect)', () => {
  it('a term-less chemistry concept does NOT beat a biology concept that has a word', () => {
    const r = resolveCandidates(chemScope(), [
      cand(10, 'chemistry', []), // en term exists, no 'is' term
      cand(30, 'biology', [['syrustig', 1, 300]]),
    ]);
    expect(r.winner).not.toBeNull();
    expect(r.winner.domain).toBe('biology');
  });

  it('CONTROL: with a chemistry term present, chemistry DOES win', () => {
    const r = resolveCandidates(chemScope(), [
      cand(10, 'chemistry', [['syrustig-chem', 1, 100]]),
      cand(30, 'biology', [['syrustig', 1, 300]]),
    ]);
    expect(r.winner.domain).toBe('chemistry');
  });

  it('a term-less out-of-scope concept is not listed as a suggestion either', () => {
    const r = resolveCandidates(chemScope(), [cand(20, 'mathematics', [])]);
    expect(r.outOfScope).toEqual([]);
  });
});

describe('resolveCandidates — the three empty states are distinguishable', () => {
  it('a genuine miss returns empty everything, integrity []', () => {
    const r = resolveCandidates(chemScope(), []);
    expect(r).toEqual({
      winner: null, reason: null, nominalTie: [], tied: [],
      outOfScope: [], integrity: [], unscoped: false,
    });
  });

  it('an unscoped scope carries its cause through, not a bare null', () => {
    const r = resolveCandidates({ unscoped: 'no-priorities' }, []);
    expect(r.unscoped).toBe('no-priorities');
    expect(r.winner).toBeNull();
  });

  it('CONTROL: a miss and a misconfiguration do not look alike', () => {
    const miss = resolveCandidates(chemScope(), []);
    const bad = resolveCandidates({ unscoped: 'unregistered' }, []);
    expect(miss.unscoped).not.toBe(bad.unscoped);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/__tests__/conceptResolverResolve.test.js`
Expected: FAIL — `resolveCandidates is not a function`.

- [ ] **Step 3: Implement it**

Add to `server/lib/conceptResolver.js`:

```js
/** The rank-1 Icelandic head form, or null. isTerms is already rank-sorted. */
function headForm(candidate) {
  return candidate.isTerms.length > 0 ? candidate.isTerms[0] : null;
}

function emptyResolution(unscoped, integrity, outOfScope) {
  return {
    winner: null,
    reason: null,
    nominalTie: [],
    tied: [],
    outOfScope,
    integrity,
    unscoped,
  };
}

/**
 * Resolve candidates against a scope. PURE — no database, no I/O, no ambient state.
 *
 * ⚠️ THE FILTER ON STEP 3 IS LOAD-BEARING AND IS NOT IN THE PARENT SPEC.
 * §6 orders it "choose each candidate's term (3) -> lowest position wins (4)",
 * which reads correctly until a chosen term is undefined. Chemistry is position 1
 * for efnafraedi-2e, so a chemistry concept with no Icelandic head form would win
 * the position race and then resolve to NOTHING, while biology's perfectly good
 * word sat at position 3 and was never consulted. Term-less candidates must be
 * dropped BETWEEN steps 3 and 4.
 *
 * @param {object} scope from buildScope
 * @param {Array} candidates from lookupCandidates
 * @param {string[]} [integrity] codes carried in from lookupCandidates
 */
function resolveCandidates(scope, candidates, integrity = []) {
  const codes = [...integrity];
  if (scope.unscoped) return emptyResolution(scope.unscoped, codes, []);

  // Step 2 — partition. D1: out-of-scope survives as a soft badged tier.
  const inScope = [];
  const outOfScope = [];
  for (const c of candidates) {
    if (scope.positionOf.has(c.domain)) {
      inScope.push(c);
    } else {
      const head = headForm(c);
      // A term-less candidate has nothing to suggest either.
      if (head) outOfScope.push({ conceptId: c.conceptId, text: head.text, domain: c.domain });
    }
  }

  // Step 3 — choose each in-scope candidate's term, then DROP the term-less ones.
  const chosen = [];
  for (const c of inScope) {
    const pref = scope.preference.get(c.conceptId);
    let term = null;
    let reason = null;
    if (pref) {
      term = c.isTerms.find((t) => t.termId === pref.termId) || null;
      if (term) reason = pref.tier === 'chapter' ? 'chapter-preference' : 'book-preference';
      else if (!codes.includes('orphan-preference')) codes.push('orphan-preference');
    }
    if (!term) {
      term = headForm(c);
      if (term) reason = 'head-form';
    }
    if (!term) continue; // ← the filter, between steps 3 and 4
    chosen.push({
      conceptId: c.conceptId,
      termId: term.termId,
      text: term.text,
      domain: c.domain,
      position: scope.positionOf.get(c.domain),
      reason,
    });
  }

  if (chosen.length === 0) return emptyResolution(false, codes, outOfScope);

  // Step 4 — lowest position wins. (Step 5 lands in Task 6.)
  let best = chosen[0].position;
  for (const c of chosen) if (c.position < best) best = c.position;
  const w = chosen.find((c) => c.position === best);
  return {
    winner: {
      conceptId: w.conceptId,
      termId: w.termId,
      text: w.text,
      domain: w.domain,
      position: w.position,
    },
    reason: w.reason,
    nominalTie: [],
    tied: [],
    outOfScope,
    integrity: codes,
    unscoped: false,
  };
}
```

Export it: `module.exports = { buildScope, lookupCandidates, resolveCandidates };`

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run server/__tests__/conceptResolverResolve.test.js`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add server/lib/conceptResolver.js server/__tests__/conceptResolverResolve.test.js
git commit -m "feat(concept): resolveCandidates — term choice, D1's badged tier, term-less filter

Fixes a real ordering defect in the parent spec: §6 chooses terms (3) then
picks the lowest position (4), so a chemistry concept with an English term
and no Icelandic head form wins the race and resolves to nothing while
biology's good word sits at position 3, never consulted. The filter belongs
BETWEEN the two steps, with a control proving chemistry still wins when it
actually has a word.

Pure: this whole test file touches no database."
```

---

## Task 6: `resolveCandidates` — ties (D2), with a deterministic winner

**Files:**
- Modify: `server/lib/conceptResolver.js`
- Test: `server/__tests__/conceptResolverResolve.test.js` (append)

**Interfaces:**
- Consumes: `resolveCandidates` from Task 5.
- Produces: `Resolution.nominalTie` and `Resolution.tied`, populated per spec D2.

- [ ] **Step 1: Write the failing test**

Append to `server/__tests__/conceptResolverResolve.test.js`:

```js
describe('resolveCandidates — D2, ties', () => {
  it('a REAL tie reports every tied candidate and returns no winner', () => {
    const r = resolveCandidates(chemScope(), [
      cand(40, 'biology', [['fukalyf', 1, 400]]),
      cand(41, 'biology', [['syklalyf', 1, 410]]),
    ]);
    expect(r.winner).toBeNull();
    // ⚠️ The tie must be REPORTED, not merely "nothing came back" — an empty
    // return is also what a lookup miss produces (spec §10).
    expect(r.tied).toHaveLength(2);
    expect(r.tied.map((t) => t.text).sort()).toEqual(['fukalyf', 'syklalyf']);
  });

  it('a NOMINAL tie resolves to the agreed form AND reports the tie', () => {
    const r = resolveCandidates(chemScope(), [
      cand(50, 'biology', [['frasog', 1, 500]]),
      cand(51, 'biology', [['frasog', 1, 510]]),
    ]);
    expect(r.winner.text).toBe('frasog');
    expect(r.nominalTie.sort()).toEqual([50, 51]);
    expect(r.tied).toEqual([]);
  });

  it('the nominal-tie winner is DETERMINISTIC — lowest conceptId, never row order', () => {
    const forward = resolveCandidates(chemScope(), [
      cand(50, 'biology', [['frasog', 1, 500]]),
      cand(51, 'biology', [['frasog', 1, 510]]),
    ]);
    const reversed = resolveCandidates(chemScope(), [
      cand(51, 'biology', [['frasog', 1, 510]]),
      cand(50, 'biology', [['frasog', 1, 500]]),
    ]);
    expect(forward.winner).toEqual(reversed.winner);
    expect(forward.winner.termId).toBe(500);
  });

  it('three tied where two agree and one differs is a REAL tie, all three reported', () => {
    const r = resolveCandidates(chemScope(), [
      cand(60, 'biology', [['a', 1, 600]]),
      cand(61, 'biology', [['a', 1, 610]]),
      cand(62, 'biology', [['b', 1, 620]]),
    ]);
    expect(r.winner).toBeNull();
    expect(r.tied).toHaveLength(3);
  });

  it('a tie at position 3 is NOT a tie when something resolved at position 1', () => {
    const r = resolveCandidates(chemScope(), [
      cand(10, 'chemistry', [['efni', 1, 100]]),
      cand(40, 'biology', [['fukalyf', 1, 400]]),
      cand(41, 'biology', [['syklalyf', 1, 410]]),
    ]);
    expect(r.winner.conceptId).toBe(10);
    expect(r.tied).toEqual([]);
  });

  it('a preference BREAKS a real tie — that is what preference is for', () => {
    const pref = new Map([[41, { termId: 410, tier: 'book' }]]);
    const r = resolveCandidates(chemScope(pref), [
      cand(40, 'biology', [['fukalyf', 1, 400]]),
      cand(41, 'biology', [['syklalyf', 1, 410]]),
    ]);
    // Both still tie on POSITION; the preference changed 41's text, not its rank.
    // They still disagree, so this stays a real tie — preference selects WITHIN a
    // concept, never BETWEEN concepts. Pinning the distinction on purpose.
    expect(r.winner).toBeNull();
    expect(r.tied).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run server/__tests__/conceptResolverResolve.test.js`
Expected: FAIL — the tie tests fail; Task 5's `chosen.find(...)` picks an arbitrary candidate and never populates `tied`/`nominalTie`.

- [ ] **Step 3: Implement step 5**

In `resolveCandidates`, replace the "Step 4" block from Task 5 with:

```js
  // Step 4 — lowest position wins.
  let best = chosen[0].position;
  for (const c of chosen) if (c.position < best) best = c.position;
  const atBest = chosen
    .filter((c) => c.position === best)
    .sort((a, b) => a.conceptId - b.conceptId);

  const asWinner = (c) => ({
    conceptId: c.conceptId,
    termId: c.termId,
    text: c.text,
    domain: c.domain,
    position: c.position,
  });

  if (atBest.length === 1) {
    return {
      winner: asWinner(atBest[0]),
      reason: atBest[0].reason,
      nominalTie: [],
      tied: [],
      outOfScope,
      integrity: codes,
      unscoped: false,
    };
  }

  // Step 5 — a position tie. Compare the CHOSEN TEXTS of ALL tied candidates.
  //
  // ⚠️ ALL-OR-NOTHING on purpose. With three tied where two agree and one differs
  // there is still a real choice to make, so every tied candidate is reported —
  // including the two that agreed. Resolving to the majority form would be
  // guessing, which parent spec §6 step 5 forbids in as many words.
  const texts = new Set(atBest.map((c) => c.text));
  if (texts.size === 1) {
    // D2: a NOMINAL tie. Both candidates answer with the identical string, so
    // nothing is guessed — but the duplicate concepts are reported so an editor
    // can merge them.
    //
    // ⚠️ atBest is sorted by conceptId, so the winner is DETERMINISTIC. Taking
    // whichever row came back first would let database row order decide the
    // recorded termId — which is §C18's defect, reproduced inside its own fix.
    return {
      winner: asWinner(atBest[0]),
      reason: atBest[0].reason,
      nominalTie: atBest.map((c) => c.conceptId),
      tied: [],
      outOfScope,
      integrity: codes,
      unscoped: false,
    };
  }

  return {
    winner: null,
    reason: null,
    nominalTie: [],
    tied: atBest.map((c) => ({ conceptId: c.conceptId, text: c.text, domain: c.domain })),
    outOfScope,
    integrity: codes,
    unscoped: false,
  };
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run server/__tests__/conceptResolverResolve.test.js`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add server/lib/conceptResolver.js server/__tests__/conceptResolverResolve.test.js
git commit -m "feat(concept): D2 — a nominal tie resolves and is still reported

§7.1's flat 'tied -> omit' conflates two populations. 126 of chemistry's
ties are concepts whose rank-1 head forms are the IDENTICAL string, where
there is nothing to guess; 310 are real disagreements like antibiotic ->
fukalyf/syklalyf.

The nominal-tie winner is pinned to the lowest conceptId. Taking whichever
row came back first would let database row order decide the recorded
termId — which is §C18's defect reproduced inside its own fix, so the test
resolves the same candidates in both orders and expects one answer."
```

---

## Task 7: `resolve()` — the public entry point, and `orphan-preference`

**Files:**
- Modify: `server/lib/conceptResolver.js`
- Test: `server/__tests__/conceptResolverResolve.test.js` (append the orphan cases) and `server/__tests__/conceptResolverLookup.test.js` (append the end-to-end case)

**Interfaces:**
- Consumes: everything above.
- Produces: `resolve(db, scope, english)` → `Resolution`. **This is what B3 and B4 call.**

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/conceptResolverResolve.test.js`:

```js
describe('resolveCandidates — integrity codes', () => {
  it('a preference naming a term of ANOTHER concept falls back to the head form and reports', () => {
    const pref = new Map([[10, { termId: 999, tier: 'book' }]]); // 999 belongs to nobody here
    const r = resolveCandidates(chemScope(pref), [cand(10, 'chemistry', [['efni', 1, 100]])]);
    expect(r.winner.text).toBe('efni');
    expect(r.reason).toBe('head-form');
    expect(r.integrity).toContain('orphan-preference');
  });

  it('integrity is an ARRAY, so a merge-cycle and an orphan-preference coexist', () => {
    const pref = new Map([[10, { termId: 999, tier: 'book' }]]);
    const r = resolveCandidates(chemScope(pref), [cand(10, 'chemistry', [['efni', 1, 100]])], [
      'merge-cycle',
    ]);
    expect(r.integrity.sort()).toEqual(['merge-cycle', 'orphan-preference']);
  });

  it('CONTROL: a clean resolution reports an EMPTY integrity array', () => {
    const r = resolveCandidates(chemScope(), [cand(10, 'chemistry', [['efni', 1, 100]])]);
    expect(r.integrity).toEqual([]);
  });
});
```

Append to `server/__tests__/conceptResolverLookup.test.js`:

```js
describe('resolve — the public entry point', () => {
  const { buildScope, resolve } = require('../lib/conceptResolver');

  it('resolves end to end against a real database', () => {
    const { db } = freshMigratedDb();
    addConcept(db, 'physics', 'force', [['kraftur', 1]]);
    const scope = buildScope(db, 'edlisfraedi-2e', 1);
    const r = resolve(db, scope, 'force');
    expect(r.winner.text).toBe('kraftur');
    expect(r.reason).toBe('head-form');
    db.close();
  });

  it('carries lookupCandidates’ integrity codes into the resolution', () => {
    const { db } = freshMigratedDb();
    const a = addConcept(db, 'physics', 'loopy', [['lykkja', 1]]);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(a, a);
    const r = resolve(db, buildScope(db, 'edlisfraedi-2e', 1), 'loopy');
    expect(r.integrity).toContain('merge-cycle');
    db.close();
  });

  it('short-circuits on an unscoped scope without querying', () => {
    const { db } = freshMigratedDb();
    const r = resolve(db, { unscoped: 'unregistered' }, 'force');
    expect(r.unscoped).toBe('unregistered');
    db.close();
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run server/__tests__/conceptResolverResolve.test.js server/__tests__/conceptResolverLookup.test.js`
Expected: FAIL — `resolve is not a function`, and the orphan tests fail if Task 5's orphan branch was mis-implemented.

- [ ] **Step 3: Implement `resolve`**

Add to `server/lib/conceptResolver.js`:

```js
/**
 * The public entry point. B3 (glossary export) and B4 (editor) call this.
 *
 * ⚠️ Build the scope ONCE per (book, chapter) and reuse it. Building it per string
 * turns every lookup into three extra queries — which is how §C24 happened: a
 * correct per-item function called in a loop over tens of thousands of items.
 *
 * @param {import('better-sqlite3').Database} db
 * @param {object} scope from buildScope
 * @param {string} english EXACT, already-normalised English string
 */
function resolve(db, scope, english) {
  if (scope.unscoped) return resolveCandidates(scope, [], []);
  const { candidates, integrity } = lookupCandidates(db, english);
  return resolveCandidates(scope, candidates, integrity);
}

module.exports = { buildScope, lookupCandidates, resolveCandidates, resolve };
```

- [ ] **Step 4: Run them to verify they pass**

Run: `npx vitest run server/__tests__/conceptResolverResolve.test.js server/__tests__/conceptResolverLookup.test.js`
Expected: PASS, 21 + 10 tests.

- [ ] **Step 5: Run the whole suite from the repo root**

Run: `npm test`
Expected: PASS, no file reddened by B1's additions.

- [ ] **Step 6: Commit**

```bash
git add server/lib/conceptResolver.js server/__tests__/conceptResolverResolve.test.js \
        server/__tests__/conceptResolverLookup.test.js
git commit -m "feat(concept): resolve() entry point, and the orphan-preference code

A preference row naming a term of a different concept must not silently
become the answer, and must not break the panel: it falls back to the head
form and reports. integrity is an array because a merge-cycle and an
orphan-preference can both occur in one resolution, and a single-valued
field would drop one silently."
```

---

## Task 8: Mutation controls

**Why:** §C20's lesson. Removing a load-bearing line there turned **nothing** red across the whole server suite, and the branch's adversarial review then found three more silent mutations. *"No check went red"* is an unanswered question until you have shown a check that **can** go red.

**Files:**
- Test: `server/__tests__/conceptResolverMutation.test.js`

**Interfaces:**
- Consumes: `resolveCandidates` from Tasks 5–6.
- Produces: nothing. This task adds only tests.

- [ ] **Step 1: Write the mutation-control test**

Create `server/__tests__/conceptResolverMutation.test.js`:

```js
// server/__tests__/conceptResolverMutation.test.js
/**
 * Each case here perturbs ONE input the resolver branches on and asserts the
 * output changes. If a perturbation leaves the result identical, that field is
 * either not load-bearing or not observed — and §C20 is the record of how
 * expensive it is to not know which.
 *
 * These are not redundant with the behaviour tests: those assert what the code
 * does, these assert that specific inputs MATTER.
 */
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { resolveCandidates } = require('../lib/conceptResolver');

const scope = (preference = new Map()) => ({
  bookId: 1,
  chapter: 3,
  positionOf: new Map([['chemistry', 1], ['physics', 2], ['biology', 3]]),
  preference,
  unscoped: false,
});
const cand = (conceptId, domain, isTerms) => ({
  conceptId,
  domain,
  isTerms: isTerms.map(([text, rank, termId]) => ({ text, rank, termId })),
});

describe('mutation controls', () => {
  it('RANK matters: swapping rank 1 and 2 changes the resolved term', () => {
    const a = resolveCandidates(scope(), [cand(10, 'chemistry', [['fyrsta', 1, 100], ['onnur', 2, 101]])]);
    const b = resolveCandidates(scope(), [cand(10, 'chemistry', [['onnur', 1, 101], ['fyrsta', 2, 100]])]);
    expect(a.winner.text).toBe('fyrsta');
    expect(b.winner.text).toBe('onnur');
    expect(a.winner.text).not.toBe(b.winner.text);
  });

  it('POSITION matters: reordering the domain priority changes the winner', () => {
    const candidates = [cand(10, 'chemistry', [['efna', 1, 100]]), cand(30, 'biology', [['lif', 1, 300]])];
    const chemFirst = resolveCandidates(scope(), candidates);
    const bioFirst = resolveCandidates(
      { ...scope(), positionOf: new Map([['biology', 1], ['chemistry', 2]]) },
      candidates
    );
    expect(chemFirst.winner.domain).toBe('chemistry');
    expect(bioFirst.winner.domain).toBe('biology');
  });

  it('PREFERENCE TIER matters: the same termId reports a different reason', () => {
    const c = [cand(10, 'chemistry', [['a', 1, 100], ['b', 2, 101]])];
    const asBook = resolveCandidates(scope(new Map([[10, { termId: 101, tier: 'book' }]])), c);
    const asChapter = resolveCandidates(scope(new Map([[10, { termId: 101, tier: 'chapter' }]])), c);
    expect(asBook.reason).toBe('book-preference');
    expect(asChapter.reason).toBe('chapter-preference');
  });

  it('THE TERM-LESS FILTER matters: removing chemistry’s term moves the winner to biology', () => {
    const withTerm = resolveCandidates(scope(), [
      cand(10, 'chemistry', [['efna', 1, 100]]),
      cand(30, 'biology', [['lif', 1, 300]]),
    ]);
    const withoutTerm = resolveCandidates(scope(), [
      cand(10, 'chemistry', []),
      cand(30, 'biology', [['lif', 1, 300]]),
    ]);
    expect(withTerm.winner.domain).toBe('chemistry');
    expect(withoutTerm.winner.domain).toBe('biology');
  });

  it('THE TIE TEXT COMPARISON matters: changing one character flips nominal to real', () => {
    const agree = resolveCandidates(scope(), [
      cand(50, 'biology', [['frasog', 1, 500]]),
      cand(51, 'biology', [['frasog', 1, 510]]),
    ]);
    const differ = resolveCandidates(scope(), [
      cand(50, 'biology', [['frasog', 1, 500]]),
      cand(51, 'biology', [['frasogn', 1, 510]]),
    ]);
    expect(agree.winner).not.toBeNull();
    expect(agree.nominalTie).toHaveLength(2);
    expect(differ.winner).toBeNull();
    expect(differ.tied).toHaveLength(2);
  });

  it('CANDIDATE ORDER does NOT matter — the one input that must not change the answer', () => {
    const a = cand(10, 'chemistry', [['efna', 1, 100]]);
    const b = cand(30, 'biology', [['lif', 1, 300]]);
    expect(resolveCandidates(scope(), [a, b])).toEqual(resolveCandidates(scope(), [b, a]));
  });
});
```

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/conceptResolverMutation.test.js`
Expected: PASS, 6 tests. **If any fails, the implementation is wrong, not the test** — each asserts a behaviour Tasks 5–6 specified.

- [ ] **Step 3: Verify the controls can actually go red**

Temporarily break each of these in `server/lib/conceptResolver.js`, one at a time, running the mutation file after each and **restoring before the next**:

| Break | Must redden |
|---|---|
| `headForm` returns `candidate.isTerms[candidate.isTerms.length - 1]` | "RANK matters" |
| the `if (!term) continue;` filter is deleted | "THE TERM-LESS FILTER matters" |
| `texts.size === 1` becomes `texts.size >= 1` | "THE TIE TEXT COMPARISON matters" |
| `.sort((a, b) => a.conceptId - b.conceptId)` is deleted | "the nominal-tie winner is DETERMINISTIC" (in `conceptResolverResolve.test.js`) |

**Record the result of all four in the commit message.** A break that reddens nothing means the guard is unobserved — stop and add the missing assertion before continuing.

- [ ] **Step 4: Confirm the file is restored**

Run: `git diff server/lib/conceptResolver.js`
Expected: **empty**. Then `npx vitest run server/__tests__/conceptResolver*.test.js` → all PASS.

- [ ] **Step 5: Commit**

```bash
git add server/__tests__/conceptResolverMutation.test.js
git commit -m "test(concept): mutation controls for rank, position, tier and the tie compare

§C20's lesson: removing a load-bearing line there turned NOTHING red across
the whole server suite. Each case perturbs one input the resolver branches
on and asserts the output changes; the last asserts the one input that must
NOT change it (candidate order).

Verified by breaking each guard in turn — all four reddened the named test,
and conceptResolver.js was restored to a clean diff afterwards."
```

---

## Task 9: Acceptance gates 1, 2, 3 and 5 — measured on the real corpus

**Files:**
- Create: `server/scripts/verify-resolve-gates.js`
- Create: `test-results/b1-resolve-gates-2026-08.md`

**Interfaces:**
- Consumes: `buildScope`, `resolve` from Task 7; `run-concept-import.js` from B0.
- Produces: a recorded measurement file. Nothing consumes it in code.

**Prerequisite — build the scratch corpus DB first (this is a data op, not a test):**

```bash
node server/scripts/run-concept-import.js \
  --dir ~/idordabanki-raw-2026-08-07/ \
  --db /tmp/claude-1000/b1-scratch.db
```
Expected: exit 0, ~70,187 concepts / 192,189 terms in ~4 s.
⚠️ **`--db <path>` — the value is the NEXT argument, never `--db=<path>`.** B0's finding 5 is the same parser shape in the *export*; this script's parser was fixed.
⚠️ **Never point `--db` at `server/pipeline-output/sessions.db`.** B1 writes nothing to a real database.

⚠️ **The scratch DB has concept tables but no `registered_books` rows** — the import creates the schema, not the books. The script registers the six books and seeds their priorities from `BOOK_DOMAIN_PRIORITY` itself, so the gate does not depend on §C35's fresh-clone registration gap.

- [ ] **Step 1: Write the gate script**

Create `server/scripts/verify-resolve-gates.js`:

```js
/**
 * B1 acceptance gates 1, 2, 3 and 5, measured against a scratch corpus DB.
 *
 * Usage:
 *   node server/scripts/verify-resolve-gates.js --db /tmp/claude-1000/b1-scratch.db
 *
 * ⚠️ READ-ONLY on the corpus tables. It DOES write registered_books and
 * book_domain_priority into the SCRATCH database, because the import creates the
 * schema but not the books. Never point --db at a real database.
 *
 * Exit: 0 all gates pass · 1 a gate failed · 2 usage or environment error.
 */
const fs = require('fs');
const Database = require('better-sqlite3');
const { BOOK_DOMAIN_PRIORITY } = require('../lib/domains');
const { buildScope, resolve } = require('../lib/conceptResolver');

function parseArgs(argv) {
  let db = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--db') {
      // ⚠️ Do not swallow the NEXT FLAG as a value (B0 finding 5).
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        return { error: '--db needs a path as the next argument' };
      }
      db = argv[++i].trim();
    } else if (a === '-h' || a === '--help') {
      return { help: true };
    } else {
      return { error: `unrecognised argument '${a}' — accepted: --db <path>` };
    }
  }
  return db ? { db } : { error: '--db is required' };
}

/** Register the six books and seed their priorities INTO THE SCRATCH DB. */
function seedBooks(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS registered_books (
    id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE NOT NULL,
    title_is TEXT, status TEXT DEFAULT 'active', registered_by TEXT)`);
  const insBook = db.prepare(
    "INSERT OR IGNORE INTO registered_books (slug, registered_by) VALUES (?, 'gate')"
  );
  const insPrio = db.prepare(
    'INSERT OR REPLACE INTO book_domain_priority (book_id, domain, position) VALUES (?, ?, ?)'
  );
  for (const [slug, domains] of Object.entries(BOOK_DOMAIN_PRIORITY)) {
    insBook.run(slug);
    const { id } = db.prepare('SELECT id FROM registered_books WHERE slug = ?').get(slug);
    domains.forEach((d, i) => insPrio.run(id, d, i + 1));
  }
}

/** Distinct English strings in scope for a book — gate 3. */
function scopedEnglish(db, slug) {
  const rows = db
    .prepare(
      `SELECT DISTINCT t.text
         FROM concept_term t JOIN concept c ON c.id = t.concept_id
         JOIN book_domain_priority p ON p.domain = c.domain
         JOIN registered_books b ON b.id = p.book_id
        WHERE t.lang = 'en' AND b.slug = ?`
    )
    .all(slug);
  return rows.map((r) => r.text);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Usage: node server/scripts/verify-resolve-gates.js --db <scratch.db>');
    return 0;
  }
  if (args.error) {
    console.error(`error: ${args.error}`);
    return 2;
  }
  if (!fs.existsSync(args.db)) {
    console.error(`error: no such database ${args.db}`);
    return 2;
  }

  const db = new Database(args.db);
  seedBooks(db);
  const failures = [];

  // ── Gate 1: chemistry's fallback returns the four named terms ────────────
  const chemScope = buildScope(db, 'efnafraedi-2e', 0);
  if (chemScope.unscoped) {
    console.error(`GATE 1 FAIL: efnafraedi-2e is ${chemScope.unscoped}`);
    return 1;
  }
  console.log('── Gate 1: chemistry fallback ──');
  for (const en of ['pH', 'bond', 'carbon dioxide', 'nitrogen']) {
    const r = resolve(db, chemScope, en);
    const via = r.winner ? `${r.winner.domain} @${r.winner.position} -> ${r.winner.text}` : 'UNRESOLVED';
    console.log(`  ${en.padEnd(16)} ${via}`);
    if (!r.winner) failures.push(`gate1: '${en}' did not resolve`);
  }

  // ── Gate 2: the tie census ───────────────────────────────────────────────
  //
  // ⚠️ METHOD MATTERS AS MUCH AS THE NUMBER. §C36 measured 2,001/126/310 for
  // efnafraedi-2e under TWO restrictions, both reproduced here:
  //   (a) restricted to English strings that appear in the book's own 01-source;
  //   (b) a tie counted only in the BEST AVAILABLE domain (a tie at position 3 is
  //       not a tie when something resolved at position 1) — which resolve()
  //       already enforces, since `tied` is only ever populated at `best`.
  // A different number is a FINDING TO EXPLAIN, not a constant to update — but
  // only if the method is the same, so the script prints it.
  console.log('\n── Gate 2: tie census (efnafraedi-2e) ──');
  console.log('  method: strings from books/efnafraedi-2e/01-source, exact binary match');
  const sourceStrings = collectSourceEnglish('efnafraedi-2e');
  let outright = 0;
  let nominal = 0;
  let real = 0;
  for (const en of sourceStrings) {
    const r = resolve(db, chemScope, en);
    if (r.tied.length) real++;
    else if (r.nominalTie.length) nominal++;
    else if (r.winner) outright++;
  }
  console.log(`  strings considered: ${sourceStrings.length}`);
  console.log(`  outright ${outright} · nominal ${nominal} · real ${real}`);
  console.log('  register recorded: outright 2001 · nominal 126 · real 310');

  // ── Gate 3: scope sizes ──────────────────────────────────────────────────
  console.log('\n── Gate 3: scoped corpus size ──');
  for (const slug of ['liffraedi-2e', 'efnafraedi-2e']) {
    const n = scopedEnglish(db, slug).length;
    console.log(`  ${slug.padEnd(18)} ${n} distinct English terms`);
  }
  console.log('  register recorded: liffraedi-2e 47568 · efnafraedi-2e 19749');

  // ── Gate 5: the term-less-candidate population ───────────────────────────
  //
  // B0's finding 4 is the model: quantify the hazard rather than assume it. If
  // this is 0 the §6 filter is a deliberate latent-case pin; if it is non-zero
  // gates 1 and 2 are NOT independent of it.
  console.log('\n── Gate 5: term-less candidates ──');
  const termless = db
    .prepare(
      `SELECT COUNT(*) AS n FROM concept c
        WHERE EXISTS (SELECT 1 FROM concept_term t WHERE t.concept_id = c.id AND t.lang = 'en')
          AND NOT EXISTS (SELECT 1 FROM concept_term t WHERE t.concept_id = c.id AND t.lang = 'is')`
    )
    .get().n;
  console.log(`  concepts with an EN term and NO IS term: ${termless}`);
  console.log(
    termless === 0
      ? '  -> the §6 filter is a LATENT-case pin. Say so in the spec.'
      : '  -> the case is LIVE. Gates 1 and 2 are not independent of the filter.'
  );

  // ── Controls ─────────────────────────────────────────────────────────────
  console.log('\n── Controls ──');
  const unreg = buildScope(db, 'engin-slik-bok', 0);
  const noPrio = (() => {
    db.prepare("INSERT OR IGNORE INTO registered_books (slug, registered_by) VALUES ('ctrl-bare','gate')").run();
    return buildScope(db, 'ctrl-bare', 0);
  })();
  console.log(`  unregistered -> ${unreg.unscoped} · registered-no-priorities -> ${noPrio.unscoped}`);
  if (unreg.unscoped === noPrio.unscoped) failures.push('control: the two unscoped causes are indistinguishable');

  const miss = resolve(db, chemScope, 'zzz-not-a-term-zzz');
  console.log(`  a genuine miss -> winner ${miss.winner} · unscoped ${miss.unscoped}`);
  if (miss.unscoped !== false) failures.push('control: a miss reported an unscoped cause');

  db.close();
  if (failures.length) {
    console.error(`\nFAIL (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    return 1;
  }
  console.log('\nALL GATES REPORTED. Record the numbers in test-results/.');
  return 0;
}

/**
 * Distinct English strings appearing in a book's extracted EN segments —
 * books/<slug>/02-for-mt/**\/*.md, the text the MT glossary is actually filtered
 * against by filterGlossaryForText.
 *
 * ⚠️ THREE TRAPS, each measured in this tree on 2026-08-08, each of which
 * silently inflates or empties the census rather than erroring:
 *
 * 1. `02-for-mt` holds ~700 `<name>.md.backup.<timestamp>` files beside its 249
 *    real `.md` files. `endsWith('.md')` correctly excludes them BECAUSE they end
 *    in the timestamp. Do NOT "improve" this to `includes('.md')` — that pulls in
 *    every stale backup and counts months-old text as current source.
 *
 * 2. Every file is dense with `<!-- SEG:mNNNNN:type:id -->` markers. A bare word
 *    regex harvests `SEG`, `title`, `abstract-item` and friends as English terms.
 *    Strip the comments first.
 *
 * 3. Segment text carries `[[i:…]]`, `[[link:…]]`, `[[xref:…]]`, `[[docref:…]]`
 *    bracket markers whose TYPE names would likewise be counted. Strip the
 *    marker syntax but KEEP the inner prose — `[[i:hydrogen]]` really does mean
 *    the word hydrogen appears in the text.
 *
 * ⚠️ §C36 did NOT record how it extracted its strings, so this is a
 * reconstruction rather than a replay. That is why the caller prints the method.
 */
function collectSourceEnglish(slug) {
  const path = require('path');
  const root = path.join(__dirname, '..', '..', 'books', slug, '02-for-mt');
  if (!fs.existsSync(root)) {
    console.error(`  ⚠️ ${root} does not exist — gate 2 cannot run for ${slug}`);
    return [];
  }
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
        .replace(/<!--[\s\S]*?-->/g, ' ') // trap 2: SEG markers
        .replace(/\[\[[a-z]+:/g, ' ') // trap 3: marker OPEN, prose kept
        .replace(/\]\]/g, ' ');
      for (const m of text.matchAll(/[A-Za-z][A-Za-z-]+(?: [a-z]+)?/g)) words.add(m[0]);
    }
  };
  walk(root);
  // ⚠️ An empty result must be LOUD. A census over 0 files reports "0 ties" and
  // looks like a clean pass — an absence is not an answer.
  if (filesRead === 0) {
    console.error(`  ⚠️ read 0 .md files under ${root} — gate 2 is meaningless`);
    return [];
  }
  console.log(`  files read: ${filesRead}`);
  return [...words];
}

if (require.main === module) process.exitCode = main();
module.exports = { main, parseArgs };
```

- [ ] **Step 2: Run it against the scratch DB**

Run: `node server/scripts/verify-resolve-gates.js --db /tmp/claude-1000/b1-scratch.db`
Expected: every gate prints numbers; exit 0.

⚠️ **If gate 2's numbers differ from 2,001 / 126 / 310, DO NOT edit the register's numbers.** Record both, state the method this run used, and investigate. The likeliest cause is a different string-extraction method, not a resolver bug — §C36 did not record its extraction, which is exactly why this script prints its own.

- [ ] **Step 3: Verify gate 2 read the right files, with a control**

The census is worthless if it read the wrong set. Check both directions:

```bash
# Expected: 249 real .md files for efnafraedi-2e (measured 2026-08-08).
find books/efnafraedi-2e/02-for-mt -name '*.md' | wc -l
# CONTROL: the backup files it must NOT read — expect a number in the hundreds.
find books/efnafraedi-2e/02-for-mt -name '*.md.backup.*' | wc -l
```

The script's own `files read:` line must match the **first** number, not the sum. If it matches the sum, the extension filter was loosened and months-old text is in the census. If it is `0`, the script says so loudly and gate 2 is void — **an absence is not an answer.**

Also confirm no marker debris survived: the printed census must not treat `SEG`, `title`, `abstract-item`, `xref` or `docref` as terms. Spot-check by adding a temporary `console.log([...words].filter(w => /^(SEG|xref|docref|abstract)/.test(w)))` and expecting `[]`, then removing it.

- [ ] **Step 4: Verify the parser refuses a swallowed flag**

Run: `node server/scripts/verify-resolve-gates.js --db --help`
Expected: `error: --db needs a path as the next argument`, exit 2. **No file named `--help` is created** — check with `ls -- --help` (expect "No such file").

- [ ] **Step 5: Record the measurements**

Create `test-results/b1-resolve-gates-2026-08.md` with a banner, the exact command run, the full output pasted verbatim, and a short paragraph per gate saying whether it matched the register and — if not — what the method difference was. **Include the four mutation-control results from Task 8 Step 3, and the `files read:` count from Step 3 above.**

- [ ] **Step 6: Commit**

```bash
git add server/scripts/verify-resolve-gates.js test-results/b1-resolve-gates-2026-08.md
git commit -m "test(concept): B1 acceptance gates 1/2/3/5 on the real corpus

Fixtures cannot evidence 'unblocks chemistry'. Measured against a scratch
DB built from the 20-collection raw fetch: pH, bond, carbon dioxide and
nitrogen each resolve via the fallback, with the domain and position they
resolved through.

Gate 2 reproduces the census METHOD, not only its numbers — strings from
the book's own 02-for-mt extraction, and a tie counted only in the best
available domain. Quoting 2001/126/310 without the method would make the
first run differ for methodology reasons.

Gate 5 COUNTS the term-less-candidate population rather than assuming it
(B0 finding 4 is the model): if it is non-zero, gates 1 and 2 are not
independent of the §6 filter.

Controls included: the two unscoped causes must differ, and a genuine miss
must not report an unscoped cause."
```

---

## Task 10: Gate 4 — the performance measurement

**Why its own script:** `bench-c24.js` takes `<book> <chapter> <moduleId>` and calls `findTermsInSegments` — the matcher, which B1 does not touch, against production book data B1 has no path to. Its **output shape** is worth copying; the script is not reusable.

**Files:**
- Create: `server/scripts/bench-resolve.js`
- Modify: `test-results/b1-resolve-gates-2026-08.md` (append the numbers)

**Interfaces:**
- Consumes: `buildScope`, `resolve` from Task 7.
- Produces: a recorded latency + RSS measurement. **B4's threshold is set from it, not before it.**

- [ ] **Step 1: Write the bench script**

Create `server/scripts/bench-resolve.js`:

```js
/**
 * B1 gate 4. Run: node server/scripts/bench-resolve.js --db <scratch.db> [--book <slug>]
 *
 * Reports latency AND RSS, in bench-c24.js's shape: ~85MB resident for C24's
 * automaton is a real cost on a small Linode, and a claim that reports only time
 * is half-measured.
 *
 * ⚠️ This does NOT set a threshold. B1 publishes the measurement; B4 sets the
 * budget from it. Asserting a guessed number here would be a number invented
 * before it was measured.
 */
const fs = require('fs');
const Database = require('better-sqlite3');
const { buildScope, resolve } = require('../lib/conceptResolver');

function parseArgs(argv) {
  let db = null;
  let book = 'liffraedi-2e';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--db' || a === '--book') {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) {
        return { error: `${a} needs a value as the next argument` };
      }
      if (a === '--db') db = argv[++i].trim();
      else book = argv[++i].trim();
    } else {
      return { error: `unrecognised argument '${a}' — accepted: --db <path>, --book <slug>` };
    }
  }
  return db ? { db, book } : { error: '--db is required' };
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.error) {
    console.error(`error: ${args.error}`);
    return 2;
  }
  if (!fs.existsSync(args.db)) {
    console.error(`error: no such database ${args.db}`);
    return 2;
  }

  const rss0 = process.memoryUsage().rss;
  const db = new Database(args.db);

  const strings = db
    .prepare(
      `SELECT DISTINCT t.text FROM concept_term t
         JOIN concept c ON c.id = t.concept_id
         JOIN book_domain_priority p ON p.domain = c.domain
         JOIN registered_books b ON b.id = p.book_id
        WHERE t.lang = 'en' AND b.slug = ?`
    )
    .all(args.book)
    .map((r) => r.text);
  console.log(`${args.book}: ${strings.length} distinct scoped English terms`);

  const t0 = process.hrtime.bigint();
  const scope = buildScope(db, args.book, 0);
  const scopeMs = Number(process.hrtime.bigint() - t0) / 1e6;
  if (scope.unscoped) {
    console.error(`error: ${args.book} is ${scope.unscoped}`);
    return 2;
  }
  console.log(`  buildScope: ${scopeMs.toFixed(1)} ms`);

  for (const label of ['cold', 'warm']) {
    const s = process.hrtime.bigint();
    let hits = 0;
    for (const en of strings) if (resolve(db, scope, en).winner) hits++;
    const ms = Number(process.hrtime.bigint() - s) / 1e6;
    console.log(
      `  ${label}: ${ms.toFixed(1)} ms for ${strings.length} resolves ` +
        `(${(ms / strings.length).toFixed(3)} ms each), ${hits} winners, ` +
        `rss ${mb(process.memoryUsage().rss)}`
    );
  }

  const s1 = process.hrtime.bigint();
  resolve(db, scope, strings[0]);
  console.log(`  single resolve: ${(Number(process.hrtime.bigint() - s1) / 1e6).toFixed(3)} ms`);
  console.log(`  rss delta: ${mb(process.memoryUsage().rss - rss0)}`);

  db.close();
  return 0;
}

if (require.main === module) process.exitCode = main();
module.exports = { main, parseArgs };
```

- [ ] **Step 2: Run it for both books**

Run:
```bash
node server/scripts/bench-resolve.js --db /tmp/claude-1000/b1-scratch.db --book liffraedi-2e
node server/scripts/bench-resolve.js --db /tmp/claude-1000/b1-scratch.db --book efnafraedi-2e
```
Expected: both print `buildScope`, cold, warm, single-resolve and RSS. Exit 0.

- [ ] **Step 3: Append both runs to the results file**

Add a `## Gate 4 — performance` section to `test-results/b1-resolve-gates-2026-08.md` with both commands and their verbatim output, plus one sentence naming **the number B4 must budget against** (the per-resolve millisecond figure for `liffraedi-2e`, the larger book).

⚠️ **State the machine.** A latency measured on a dev box is not production's; the Linode is smaller. Record what it was measured on.

- [ ] **Step 4: Full suite, from the repo root**

Run: `npm test`
Expected: PASS. Record the file/test counts in the commit message — **do not** carry a count into any prose document.

- [ ] **Step 5: Confirm B1 really is inert**

Run: `git diff --stat main...HEAD`
Expected: **only** new files, plus `server/__tests__/migrationsRealTree.test.js` (Task 1's DRY edit). **If any file under `server/routes/`, `server/services/`, `tools/`, or `server/migrations/` appears, B1's central promise is broken** — stop and remove the change.

- [ ] **Step 6: Commit**

```bash
git add server/scripts/bench-resolve.js test-results/b1-resolve-gates-2026-08.md
git commit -m "test(concept): gate 4 — resolve() latency and RSS, recorded not asserted

bench-c24.js cannot do this job: it takes <book> <chapter> <moduleId> and
calls findTermsInSegments, the matcher B1 does not touch, against
production data B1 has no path to. Its output SHAPE is what is reused —
latency and RSS together, because ~85MB resident is a real cost on a small
Linode and a claim reporting only time is half-measured.

No threshold is asserted. B1 publishes the number; B4 sets the budget from
it. Inertness re-verified: git diff --stat shows only new files plus
Task 1's DRY edit."
```

---

## Self-Review

**Spec coverage** — every section of the B1 spec maps to a task:

| Spec section | Task |
|---|---|
| §2 D1 out-of-scope soft tier | 5 (partition + `outOfScope`), 8 (mutation) |
| §2 D2 nominal vs real ties | 6 |
| §2 D3 unscoped names which fault | 2, 9 (control) |
| §3 architecture, explicit `db` | 2, 4, 5, 7 |
| §4 `Scope` incl. `tier` | 3 |
| §4 `Resolution`, five distinguishable states | 5, 6, 7 |
| §5 data flow, slug lookup first | 2, 4, 5, 6 |
| §6 `merge-cycle` | 4 |
| §6 `orphan-preference` | 7 |
| §6 term-less filter between steps 3 and 4 | 5, 8 (mutation), 9 (gate 5 counts it) |
| §7 pure table-driven tests | 5, 6 |
| §7 real-migration fixture | 1, 2, 3 |
| §7 tie must be REPORTED | 6 |
| §7 mutation controls | 8 |
| §8 gates 1, 2 (with method), 3, 5 | 9 |
| §8 gate 4 perf | 10 |
| §8 controls | 9 |
| §1 non-goals (inert, no golden, no terminologyService) | Global Constraints; verified Task 10 Step 5 |

**Placeholder scan:** no "TBD", no "add error handling", no "similar to Task N". Every code step carries the actual code.

**Type consistency:** `Candidate = {conceptId, domain, isTerms:[{termId, text, rank}]}` is produced in Task 4 and consumed unchanged in 5, 6, 8. `Scope.preference` is `Map<conceptId,{termId,tier}>` in Task 3 and read with exactly those keys in Task 5. `Resolution`'s seven fields are identical in Global Constraints and in Tasks 5, 6, 7.

**One gap I am flagging rather than silently closing:** gate 2's `collectSourceEnglish` reads `books/<slug>/02-for-mt/**/*.md` with a two-word regex. **§C36 did not record how it extracted its strings**, so this is a reconstruction, not a replay. Task 9 Step 2 says so and prints the method. If the census diverges, that is the first thing to check — and the fix is to record the method in the register, not to change either number.
