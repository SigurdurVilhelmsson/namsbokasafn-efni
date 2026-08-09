# §C36 B4a — Term Preference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make an editor's answer for one English string expressible and authoritative — `resolve()` honours a `book_term_preference` row regardless of which domain the term's concept sits in — closing register §C38.

**Architecture:** Migration 048 replaces the empty `book_concept_preference` with `book_term_preference (book_id, chapter, english, term_id)`. `buildPreferenceMap` re-keys on the English string; `resolveCandidates` drops its per-candidate preference lookup and gains a single **override applied after the position walk**, so every existing report (`tied`, `nominalTie`, `outOfScope`) survives. `resolve()` reports in-scope losers via a new `alsoInScope` field, and three distinct integrity codes replace one.

**Tech Stack:** Node 22.x · better-sqlite3 (compiled `SQLITE_DEFAULT_FOREIGN_KEYS=1`) · Vitest · CommonJS under `server/`, ESM in `server/__tests__/` via `createRequire`.

**Spec:** [`docs/superpowers/specs/2026-08-09-terminology-concept-model-part-b4a-design.md`](../specs/2026-08-09-terminology-concept-model-part-b4a-design.md) — read §3 (decisions) and §12 (what the first draft got wrong) before starting.

## Global Constraints

- **Run `npm test` from the repo ROOT**, never from `server/`. Resource paths resolve against `import.meta.url`/`__dirname`, never `process.cwd()`.
- **Root `npm test` is the authoritative gate.** There is no branch protection; a red PR can still merge. `npm test` is `vitest run` and does **not** run Playwright — E2E is a separate CI job.
- **`vitest.config.js` sets `fileParallelism: false` globally.** Nothing runs in parallel, so a test mutating shared module state poisons every *later* file in the run.
- **Never `npm audit fix`.** Two dependency trees; `server/` is audited separately.
- **Do not push to `main` from this branch.** A push from dev strands production's content backup until someone deploys.
- **Branch:** `spec/c36-b4a-term-preference` (already exists, carries the spec + register commits).
- **Migrations are append-only.** 045/046/047 are shipped and are **not edited**. `migrationRunner` calls every migration's `up()` unconditionally on every server start, so 048 must be idempotent.
- **Commit messages are documentation.** End each with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Every new pin must be mutation-verified** — break the line it pins, confirm the test goes red, restore.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `server/migrations/048-book-term-preference.js` | Create `book_term_preference`, expand-and-log any `book_concept_preference` rows, drop the old table | **Create** |
| `server/lib/conceptResolver.js` | `buildPreferenceMap` re-key · `prepareLookupStatements` gains `termById` · `resolveCandidates` override + `alsoInScope` · docstring correction | **Modify** |
| `server/scripts/export-terminology.js` | Carry integrity counts into the per-book log line and `outcomes[b]` | **Modify** |
| `server/__tests__/migration048.test.js` | Migration shape, collation, expansion accounting, idempotence | **Create** |
| `server/scripts/import-concepts.js` | Re-point the preference COUNT + prune at the new table (Task 2b) | **Modify** |
| `server/__tests__/importConcepts.test.js` · `migration045.test.js` · `resolvedGlossary.test.js` · `freshMigratedDb.test.js` | Consumers of the dropped table (Task 2b) | **Modify** |
| `server/__tests__/conceptResolverScope.test.js` | Preference-map tests re-keyed on English; collation contract | **Modify** |
| `server/__tests__/conceptResolverResolve.test.js` | Override behaviour, `alsoInScope`, three codes, §2.2 leak control | **Modify** |
| `server/__tests__/conceptResolverIntegrity.test.js` | Four whole-object `toEqual` shape pins | **Modify** |
| `server/__tests__/conceptResolverMutation.test.js` | New mutation pins | **Modify** |
| `server/scripts/verify-b4a-gates.js` | The corpus acceptance gate (§9 of the spec) | **Create** |
| `test-results/b4a-term-preference-2026-08.md` | Measured evidence from the gate run | **Create** |

---

## Task 1: Correct the falsified docstring, and pin the bug it hid (§C39)

Standalone and owed now: `conceptResolver.js:139-140` states the **opposite** of what the code does. CLAUDE.md's rule is *if document B is wrong, fix B* — do not carry it as a to-do.

**Files:**
- Modify: `server/lib/conceptResolver.js:136-141`
- Test: `server/__tests__/conceptResolverScope.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. Comment + one characterization test.

- [ ] **Step 1: Write the failing test**

Append to `server/__tests__/conceptResolverScope.test.js`. It uses the same `freshMigratedDb` / registration helpers already at the top of that file — read them first and match the existing style rather than inventing new setup.

```js
  // §C39 — CHARACTERIZATION, not an endorsement. buildPreferenceMap keys on the
  // RAW book_concept_preference.concept_id while lookupCandidates reports the
  // post-followMerge SURVIVOR id, so a preference on a concept that was later
  // merged away is silently ignored: no promotion, and NO integrity code.
  // conceptResolver.js said the reverse until 2026-08-09.
  //
  // ⚠️ Task 6 changes this outcome to `preference-not-a-candidate`. When it does,
  // UPDATE this test — do not delete it. The point is that the skew is visible.
  it('§C39: a preference naming a merged-away concept is not found by the scope', () => {
    const { db, bookId } = registerChemistryWithConcepts();
    const absorbed = insertConcept(db, 'biology', 'accuracy', ['hittni']);
    const survivor = insertConcept(db, 'physics', 'accuracy', ['nákvæmni']);
    const termId = db
      .prepare("SELECT id FROM concept_term WHERE concept_id = ? AND text = 'hittni'")
      .get(absorbed).id;
    db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (?, 0, ?, ?)'
    ).run(bookId, absorbed, termId);
    db.prepare('UPDATE concept SET merged_into = ? WHERE id = ?').run(survivor, absorbed);

    const scope = buildScope(db, 'efnafraedi-2e', 0);
    // The map holds the ABSORBED id; every candidate reports the SURVIVOR's.
    expect(scope.preference.has(absorbed)).toBe(true);
    expect(scope.preference.has(survivor)).toBe(false);
  });
```

- [ ] **Step 2: Run it to confirm it passes as a characterization**

Run: `npx vitest run server/__tests__/conceptResolverScope.test.js -t '§C39'`
Expected: **PASS**. This one documents current behaviour rather than driving a change — the test is the evidence that the docstring is false.

- [ ] **Step 3: Correct the docstring**

Replace lines 139-140 of `server/lib/conceptResolver.js`:

```js
 * ⚠️ CORRECTED 2026-08-09 (register §C39). This comment used to claim: "Resolving
 * THROUGH merged_into is what makes an editorial merge take effect with no data
 * migration: preference rows still naming the absorbed concept keep working."
 * THEY DO NOT. buildPreferenceMap keys its map on the RAW preference row's
 * concept_id; lookupCandidates reports the post-followMerge SURVIVOR id. The
 * lookup therefore misses, the `if (pref)` branch never runs, and NO integrity
 * code fires — a silent swallow. Pinned by conceptResolverScope.test.js's §C39
 * case. B4a's re-key onto the English string defuses this (it surfaces as
 * `preference-not-a-candidate`); Part C's merge tooling still has to face it.
```

- [ ] **Step 4: Run the resolver suite**

Run: `npx vitest run server/__tests__/conceptResolver*.test.js`
Expected: all PASS — a comment change alters no behaviour, which is the point.

- [ ] **Step 5: Commit**

```bash
git add server/lib/conceptResolver.js server/__tests__/conceptResolverScope.test.js
git commit -m "fix(C39): correct a docstring that claimed the opposite of the code

buildPreferenceMap keys on the raw concept_id while lookupCandidates reports
the post-followMerge survivor, so a preference on a merged-away concept is
silently ignored — no promotion and no integrity code. The comment said such
rows 'keep working'. Pinned as a characterization test, which Task 6 updates
rather than deletes.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Migration 048 — `book_term_preference`

**Files:**
- Create: `server/migrations/048-book-term-preference.js`
- Test: `server/__tests__/migration048.test.js`

**Interfaces:**
- Consumes: `concept_term(id, concept_id, lang, text)`, `registered_books(id)` from migration 045.
- Produces: table `book_term_preference(book_id INTEGER, chapter INTEGER, english TEXT COLLATE NOCASE, term_id INTEGER)`, `PRIMARY KEY (book_id, chapter, english)`. Table `book_concept_preference` no longer exists.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/migration048.test.js`. Match `migration045.test.js`'s helper imports and DB construction exactly — read it first.

```js
// server/__tests__/migration048.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { freshMigratedDb } = require('./helpers/freshMigratedDb');

describe('migration 048 — book_term_preference', () => {
  it('creates the table keyed on (book_id, chapter, english)', () => {
    const db = freshMigratedDb();
    const cols = db.prepare('PRAGMA table_info(book_term_preference)').all();
    expect(cols.map((c) => c.name)).toEqual(['book_id', 'chapter', 'english', 'term_id']);
    const pk = cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name);
    expect(pk).toEqual(['book_id', 'chapter', 'english']);
    db.close();
  });

  it('english is COLLATE NOCASE, so one row covers every capitalisation', () => {
    const db = freshMigratedDb();
    const sql = db
      .prepare("SELECT sql FROM sqlite_master WHERE name = 'book_term_preference'")
      .get().sql;
    expect(sql).toMatch(/english\s+TEXT\s+NOT NULL\s+COLLATE NOCASE/i);
    db.close();
  });

  // ⚠️ THE CONTROL. The collation claim above is about DDL text; this one is
  // about behaviour. A COLLATE in the column definition that failed to reach the
  // primary key index would pass the test above and fail this one.
  it('CONTROL: inserting two case variants of one string collides', () => {
    const db = freshMigratedDb();
    seedBookAndTerm(db); // book_id 1, term_id 1 — see helper below
    const ins = db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (1, 0, ?, 1)'
    );
    ins.run('accuracy');
    expect(() => ins.run('Accuracy')).toThrow(/UNIQUE|PRIMARY KEY/i);
    db.close();
  });

  it('drops book_concept_preference', () => {
    const db = freshMigratedDb();
    const t = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='book_concept_preference'")
      .get();
    expect(t).toBeUndefined();
    db.close();
  });

  it('reports ZERO expanded rows on a fresh database — the production case', () => {
    const db = freshMigratedDb();
    expect(db.prepare('SELECT COUNT(*) AS c FROM book_term_preference').get().c).toBe(0);
    db.close();
  });
});
```

Write `seedBookAndTerm(db)` in the same file: insert one `registered_books` row and one `concept` + `concept_term` row so the foreign keys hold. **Foreign keys are ON** (better-sqlite3 is compiled `SQLITE_DEFAULT_FOREIGN_KEYS=1`), so a bogus `term_id` throws `SQLITE_CONSTRAINT_FOREIGNKEY` — do not use a literal fake id.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/migration048.test.js`
Expected: FAIL — `PRAGMA table_info` on a missing table returns `[]`.

- [ ] **Step 3: Write the migration**

Create `server/migrations/048-book-term-preference.js`:

```js
/**
 * Migration 048: replace book_concept_preference with book_term_preference.
 *
 * WHY (register §C36 B4a, §C38): a preference keyed on `concept_id` cannot say
 * what an editor means. An editor acts on an ENGLISH STRING and one concept
 * carries many, so a row set while looking at "accuracy" silently moved every
 * other English string on that concept. Keyed on the string, a row means exactly
 * one thing and its blast radius is exactly the string named in it.
 *
 * ⚠️ This is the table §C36 decision 6 ruled for before 045 shipped the concept
 * key — "two questions, two columns, neither overloaded". Restoring, not inventing.
 *
 * ⚠️ english is COLLATE NOCASE. collectSourceEnglish does NO lowercasing, so the
 * census carries atom/Atom/ATOM as three strings; one editor row must cover all
 * of them. Candidate lookup (concept_term.text) stays CASE-SENSITIVE and is
 * deliberately untouched — folding case there would change which candidates every
 * resolution in the corpus finds.
 *
 * ⚠️ EXPANSION IS DELIBERATE AND IS LOGGED. One old concept row becomes one row
 * per English term on that concept — which MATERIALISES the very blast radius
 * this migration removes, as rows a reviewer can read and delete. On production
 * it is a no-op: 0 rows, measured 2026-08-09, and no production code INSERTs.
 * A non-zero count anywhere is a finding to look at, not a success.
 *
 * ⚠️ Idempotent: migrationRunner calls up() on every server start.
 */
module.exports = {
  name: '048-book-term-preference',

  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS book_term_preference (
        book_id  INTEGER NOT NULL REFERENCES registered_books(id) ON DELETE CASCADE,
        chapter  INTEGER NOT NULL,
        english  TEXT    NOT NULL COLLATE NOCASE,
        term_id  INTEGER NOT NULL REFERENCES concept_term(id) ON DELETE CASCADE,
        PRIMARY KEY (book_id, chapter, english)
      );
    `);

    const old = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='book_concept_preference'")
      .get();
    if (!old) return; // already migrated on a previous boot

    // INSERT OR IGNORE: two English terms on one concept differing only in case
    // collide under NOCASE. Losing the duplicate is correct — they are the same
    // editor answer — and `changes` still counts what landed.
    const expand = db.prepare(`
      INSERT OR IGNORE INTO book_term_preference (book_id, chapter, english, term_id)
      SELECT p.book_id, p.chapter, t.text, p.term_id
        FROM book_concept_preference p
        JOIN concept_term t ON t.concept_id = p.concept_id AND t.lang = 'en'
    `);

    const run = db.transaction(() => {
      const before = db.prepare('SELECT COUNT(*) AS c FROM book_concept_preference').get().c;
      const res = expand.run();
      db.exec('DROP TABLE book_concept_preference');
      return { before, expanded: res.changes };
    });
    const { before, expanded } = run();

    if (before > 0) {
      // Not a console.log guard: this is the only record that an implicit
      // multi-string reach existed on this box.
      console.warn(
        `[048] expanded ${before} book_concept_preference row(s) into ${expanded} ` +
          `book_term_preference row(s) — review them: a concept row silently covered ` +
          `every English string on its concept.`
      );
    }
  },
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/__tests__/migration048.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the idempotence + expansion-accounting tests**

Append to `server/__tests__/migration048.test.js`:

```js
  it('is idempotent — running up() twice is safe', () => {
    const db = freshMigratedDb();
    const m048 = require('../migrations/048-book-term-preference');
    expect(() => m048.up(db)).not.toThrow();
    expect(() => m048.up(db)).not.toThrow();
    db.close();
  });

  it('expands one concept row into one row per English term, and drops the old table', () => {
    // Build the PRE-048 state by hand: 045's table plus a concept carrying TWO
    // English strings — the exact shape whose blast radius B4a removes.
    const db = freshMigratedDb();
    db.exec(`
      CREATE TABLE book_concept_preference (
        book_id INTEGER NOT NULL, chapter INTEGER NOT NULL,
        concept_id INTEGER NOT NULL, term_id INTEGER NOT NULL,
        PRIMARY KEY (book_id, chapter, concept_id));
    `);
    const { conceptId, termId } = seedConceptWithTwoEnglish(db); // 'accuracy' + 'exactness'
    db.prepare(
      'INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id) VALUES (1,0,?,?)'
    ).run(conceptId, termId);

    require('../migrations/048-book-term-preference').up(db);

    const rows = db
      .prepare('SELECT english FROM book_term_preference ORDER BY english')
      .all()
      .map((r) => r.english);
    expect(rows).toEqual(['accuracy', 'exactness']);
    db.close();
  });
```

Write `seedConceptWithTwoEnglish(db)` alongside `seedBookAndTerm`. **⚠️ The second test needs `freshMigratedDb` to have already run 048** (which drops the table), so it re-creates the old table by hand — that is why the DDL is inline rather than imported.

- [ ] **Step 6: Run, then commit**

Run: `npx vitest run server/__tests__/migration048.test.js` → PASS (7 tests).
Run: `npm test` from the repo root → confirm nothing else broke. **Expect FIVE files to fail here** — every consumer of the dropped table: `importConcepts`, `migration045`, `resolvedGlossary`, `freshMigratedDb` (all owned by **Task 2b**) and `conceptResolverScope` (owned by **Task 3**). ⚠️ **`server/scripts/import-concepts.js` is also broken at this commit** — production code, red for exactly one task. Record the failing file list; Task 2b step 5 checks it shrinks to one.

```bash
git add server/migrations/048-book-term-preference.js server/__tests__/migration048.test.js
git commit -m "feat(B4a): migration 048 — book_term_preference, keyed on the English string

A preference keyed on concept_id cannot say what an editor means: an editor
acts on an English string and one concept carries many, so a row set while
looking at 'accuracy' silently moved every other English string on that
concept. Keyed on the string, its blast radius is exactly the string named.

english is COLLATE NOCASE because collectSourceEnglish does no lowercasing —
the census carries atom/Atom/ATOM as three strings. concept_term.text is
deliberately left case-sensitive.

The expansion of any pre-existing rows is logged, not silent: one concept row
becoming N English rows materialises the reach being removed, as rows a
reviewer can delete. 0 rows on production.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2b: Follow the drop through every consumer

**⚠️ ADDED 2026-08-09 by the pre-flight scan, after the plan was written.** Task 2 drops
`book_concept_preference`, and the original plan named only `conceptResolverScope.test.js` as
collateral. **It missed production code.** `db.prepare()` against a missing table throws
immediately, so the concept importer — the tool that populates production — would crash on
`require`. Traced by grepping the table's *droppers*, not its readers.

**Files:**
- Modify: `server/scripts/import-concepts.js:35`, `:50`
- Modify: `server/__tests__/importConcepts.test.js`, `migration045.test.js`, `resolvedGlossary.test.js`, `freshMigratedDb.test.js`

**Interfaces:**
- Consumes: `book_term_preference` (Task 2).
- Produces: no signature changes. The importer's `preferencesDropped` count keeps its meaning.

- [ ] **Step 1: Confirm the breakage before fixing it**

Run: `npx vitest run server/__tests__/importConcepts.test.js`
Expected: **FAIL** with `no such table: book_concept_preference`. **If it passes, stop** — Task 2's
migration did not run in this test's DB path, and the whole premise of this task is wrong.

- [ ] **Step 2: Re-point the importer**

Two statements in `server/scripts/import-concepts.js`. The prune keys on `term_id`, and
`book_term_preference` keeps that column and its `ON DELETE CASCADE`, so this is a table rename
and nothing more:

```js
    'SELECT COUNT(*) AS c FROM book_term_preference WHERE term_id = ?'
```
```js
  const delPrefs = db.prepare('DELETE FROM book_term_preference WHERE term_id = ?');
```

⚠️ **Keep the explicit DELETE. Do not lean on the cascade.** The comment above it says why, and
it is a B0 decision: a cascade yields no count for `preferencesDropped`, and the behaviour must
not depend on `PRAGMA foreign_keys`, which is per-connection and not stored in the file.

- [ ] **Step 3: Re-point the four test files**

- **`importConcepts.test.js`** — ⚠️ **its "re-import keeps editor preferences intact" case is a
  B0 pin, parameterised over `foreign_keys` default / ON / OFF.** Change the table name and the
  insert's columns (`concept_id` → `english`); **keep the parameterisation and the test name.**
  It is the pin proving preferences survive a re-import, and B4a must not weaken it.
- **`migration045.test.js`** — 045 is shipped and unedited, but the table it created is now
  dropped by 048 on the same `freshMigratedDb`. Assert 045's *other* tables as before, and change
  any `book_concept_preference` assertion to state the post-048 truth: **045 creates it, 048
  replaces it.** Do not delete the coverage.
- **`resolvedGlossary.test.js`** — its preference cases insert on `concept_id`. Re-point them to
  `book_term_preference` with the English string. ⚠️ **The case at `:103` — "resolves the
  BOOK-DEFAULT (chapter 0) preference, never a chapter-level one" — is what pins the hardcoded
  `0` in `buildScope(db, bookSlug, 0)`, which spec §6.3 relies on. Keep it.**
- **`freshMigratedDb.test.js:35,52`** — expected-table lists. Replace
  `'book_concept_preference'` with `'book_term_preference'`.

- [ ] **Step 4: Run the affected suites**

Run: `npx vitest run server/__tests__/importConcepts.test.js server/__tests__/migration045.test.js server/__tests__/resolvedGlossary.test.js server/__tests__/freshMigratedDb.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite and confirm the failure set shrank to one file**

Run: `npm test` from the repo root.
Expected: the only remaining failures are in `conceptResolverScope.test.js`, which Task 3 owns.
**Any other red file is a consumer this task still missed** — find it before moving on.

- [ ] **Step 6: Commit**

```bash
git add server/scripts/import-concepts.js server/__tests__/
git commit -m "fix(B4a): follow the table drop through every consumer

Migration 048 drops book_concept_preference, and import-concepts.js prepares
two statements against it — a COUNT and the explicit prune. db.prepare() on a
missing table throws on require, so the tool that populates production would
have crashed. The plan named only conceptResolverScope.test.js as collateral;
this was found by grepping the table's droppers rather than its readers.

The prune keys on term_id, which book_term_preference keeps, so the importer
change is a rename. The explicit DELETE stays — a cascade yields no count for
preferencesDropped and must not depend on PRAGMA foreign_keys (B0).

importConcepts.test.js's 're-import keeps editor preferences intact' keeps its
name and its foreign_keys default/ON/OFF parameterisation.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Re-key `buildPreferenceMap` onto the English string

**Files:**
- Modify: `server/lib/conceptResolver.js:19-50`
- Test: `server/__tests__/conceptResolverScope.test.js`

**Interfaces:**
- Consumes: `book_term_preference` (Task 2).
- Produces: `scope.preference` is now `Map<lowercased english, {termId: number, tier: 'book'|'chapter'}>`. **Task 6 reads it by lowercased English string, never by concept id.**

- [ ] **Step 1: Rewrite the existing preference tests onto the new key**

Every test in `conceptResolverScope.test.js` that inserts into `book_concept_preference` must insert into `book_term_preference` instead, and every `scope.preference.get(conceptId)` becomes `scope.preference.get('some english')`. The chapter-over-book, wrong-chapter, appendices-sentinel and cross-book-leak cases all keep their meaning — only the key changes. **Preserve each test's name and its comment**; they document decisions, not mechanics.

Then add the collation contract test:

```js
  it('a preference written in any case is found in any case — COLLATE NOCASE + toLowerCase', () => {
    const { db, bookId, termId } = registerChemistryWithConcepts();
    db.prepare(
      'INSERT INTO book_term_preference (book_id, chapter, english, term_id) VALUES (?, 0, ?, ?)'
    ).run(bookId, 'Accuracy', termId);
    const scope = buildScope(db, 'efnafraedi-2e', 0);
    expect(scope.preference.get('accuracy')).toEqual({ termId, tier: 'book' });
  });

  // ⚠️ THE CONTROL. If someone "helpfully" folds case in concept_term lookup too,
  // the test above still passes while every resolution in the corpus changes
  // which candidates it finds.
  it('CONTROL: candidate lookup stays CASE-SENSITIVE — concept_term is untouched', () => {
    const { db } = registerChemistryWithConcepts(); // seeds English term 'accuracy'
    const scope = buildScope(db, 'efnafraedi-2e', 0);
    expect(lookupCandidates(scope.db, 'accuracy', scope.stmts).candidates.length).toBeGreaterThan(0);
    expect(lookupCandidates(scope.db, 'Accuracy', scope.stmts).candidates).toEqual([]);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/__tests__/conceptResolverScope.test.js`
Expected: FAIL — `no such table: book_concept_preference` is gone, but `buildPreferenceMap` still queries it.

- [ ] **Step 3: Rewrite `buildPreferenceMap`**

Replace the function body and its docstring in `server/lib/conceptResolver.js`:

```js
/**
 * Merge a book's preference rows for one chapter: chapter rows win over the
 * chapter-0 default.
 *
 * ⚠️ KEYED ON THE ENGLISH STRING, LOWERCASED (B4a, register §C38). It was keyed
 * on concept_id until 2026-08-09, which could not express what an editor means:
 * one concept carries many English strings, so a row set while looking at one
 * string silently moved all the others.
 *
 * ⚠️ THE LOWERCASING IS NOT OPTIONAL AND MUST MATCH THE LOOKUP. The column is
 * COLLATE NOCASE so SQLite folds case, but a JS Map does not — key it with the
 * raw text and `preference.get('accuracy')` misses a row stored as 'Accuracy'.
 * The row would be stored and never found: silent, and the exact failure class
 * this slice exists to end. resolveCandidates lowercases its lookup to match.
 *
 * ⚠️ `tier` is CARRIED, not discarded. Parent spec §7.2 requires the editor panel
 * to say which rule fired, and this is the only place that still knows.
 *
 * ⚠️ `chapter` is NOT NULL with 0 as the book-default sentinel: in SQLite NULLs do
 * not compare equal inside a primary key, so a nullable chapter would permit two
 * conflicting "book defaults" for one string. -1 is the appendices sentinel.
 */
function buildPreferenceMap(db, bookId, chapter) {
  const rows = db
    .prepare(
      `SELECT english, term_id, chapter
         FROM book_term_preference
        WHERE book_id = ? AND chapter IN (0, ?)`
    )
    .all(bookId, chapter);

  const preference = new Map();
  for (const r of rows) {
    const tier = r.chapter === 0 ? 'book' : 'chapter';
    const key = r.english.toLowerCase();
    // A chapter row always wins; a book row only fills an empty slot. Order of
    // rows from SQLite is not relied on.
    if (tier === 'chapter' || !preference.has(key)) {
      preference.set(key, { termId: r.term_id, tier });
    }
  }
  return preference;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run server/__tests__/conceptResolverScope.test.js`
Expected: PASS. **`conceptResolverResolve.test.js` still fails** — its scopes key on concept id and `resolveCandidates` still reads them that way. Task 6 fixes it.

⚠️ **CORRECTED 2026-08-09 — THIS TASK OWNS FOUR RED FILES, NOT ONE.** The plan originally named
only `conceptResolverScope.test.js`. Measured after Tasks 2/2b: `buildScope` calls
`buildPreferenceMap` **unconditionally**, so every consumer of `buildScope` fails while that
function still queries the dropped table — including tests that touch no preference at all
(12 of 14 in `resolvedGlossary.test.js`, e.g. *"emits the head form by default"* and *"sorts
terms by english"*).

**Task 3 is complete only when all four go green:**
`conceptResolverLookup.test.js` · `conceptResolverScope.test.js` ·
`conceptResolverStatements.test.js` · `resolvedGlossary.test.js`

Task 2b already re-pointed `resolvedGlossary.test.js`'s own `INSERT`s to `book_term_preference`,
so it should need no further edit — but **verify that rather than assume it**, and if it needs
one, it is yours.

- [ ] **Step 5: Mutation-verify the lowercasing**

Delete `.toLowerCase()` from the `key` assignment. Run the scope suite: the collation test **must** go red. Restore it.

- [ ] **Step 6: Commit**

```bash
git add server/lib/conceptResolver.js server/__tests__/conceptResolverScope.test.js
git commit -m "feat(B4a): key the preference map on the English string, lowercased

The column is COLLATE NOCASE but a JS Map is not, so both sides lowercase or
the row is stored and never found. A control test pins that candidate lookup
stays case-sensitive — folding case in concept_term would change which
candidates every resolution in the corpus finds.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Add the `termById` statement

Needed to tell `preference-term-missing` (the term row is gone) from `preference-not-a-candidate` (it exists but is not on any candidate for this string).

**Files:**
- Modify: `server/lib/conceptResolver.js:68-92`
- Test: `server/__tests__/conceptResolverStatements.test.js`

**Interfaces:**
- Produces: `scope.stmts.termById` — `.get(termId)` → `{term_id, concept_id}` or `undefined`.

- [ ] **Step 1: Write the failing test**

Append to `server/__tests__/conceptResolverStatements.test.js`, matching its existing style:

```js
  it('termById finds an existing term and returns undefined for a deleted one', () => {
    const { db, termId } = seedOneConcept();
    const { termById } = prepareLookupStatements(db);
    expect(termById.get(termId)).toMatchObject({ term_id: termId });
    expect(termById.get(termId + 99999)).toBeUndefined();
    db.close();
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/conceptResolverStatements.test.js -t termById`
Expected: FAIL — `Cannot read properties of undefined (reading 'get')`.

- [ ] **Step 3: Add the statement**

In `prepareLookupStatements`, after the `terms` statement:

```js
    // B4a: distinguishes `preference-term-missing` (this returns undefined) from
    // `preference-not-a-candidate` (it returns a row, but no candidate for this
    // English string carries it). One code for both would name two faults with
    // different remedies — the gap D4 exists to close.
    termById: db.prepare('SELECT id AS term_id, concept_id FROM concept_term WHERE id = ?'),
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run server/__tests__/conceptResolverStatements.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/conceptResolver.js server/__tests__/conceptResolverStatements.test.js
git commit -m "feat(B4a): add termById, so two preference faults get two codes

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: `alsoInScope` — report the in-scope concepts that lost

Shape change only. Do it **before** the override so the five `toEqual` pins update once.

**Files:**
- Modify: `server/lib/conceptResolver.js:223-233` (`emptyResolution`) and `250-357` (`resolveCandidates`)
- Test: `server/__tests__/conceptResolverResolve.test.js`, `server/__tests__/conceptResolverIntegrity.test.js`

**Interfaces:**
- Produces: `alsoInScope: Array<{conceptId, termId, text, domain, position}>` on **every** return path, `[]` where there is nothing to report.

- [ ] **Step 1: Write the failing tests**

Append to `server/__tests__/conceptResolverResolve.test.js`:

```js
describe('resolveCandidates — alsoInScope', () => {
  it('reports an in-scope concept that lost the position race', () => {
    const r = resolveCandidates(chemScope(), [
      cand(1, 'physics', [['nákvæmni', 1, 10]]),
      cand(2, 'biology', [['hittni', 1, 20]]),
    ]);
    expect(r.winner.text).toBe('nákvæmni');
    expect(r.alsoInScope).toEqual([
      { conceptId: 2, termId: 20, text: 'hittni', domain: 'biology', position: 3 },
    ]);
  });

  // ⚠️ termId is here because B4c CANNOT WRITE A PREFERENCE WITHOUT IT. Dropping
  // it would force the panel to re-derive term ids from display text.
  it('carries termId, which is what a write path needs', () => {
    const r = resolveCandidates(chemScope(), [
      cand(1, 'chemistry', [['a', 1, 10]]),
      cand(2, 'physics', [['b', 1, 20]]),
    ]);
    expect(r.alsoInScope[0].termId).toBe(20);
  });

  it('excludes tied members — they are already reported in `tied`', () => {
    const r = resolveCandidates(chemScope(), [
      cand(1, 'physics', [['ein', 1, 10]]),
      cand(2, 'physics', [['tvo', 1, 20]]),
      cand(3, 'biology', [['thrju', 1, 30]]),
    ]);
    expect(r.tied.map((t) => t.conceptId).sort()).toEqual([1, 2]);
    expect(r.alsoInScope.map((a) => a.conceptId)).toEqual([3]);
  });

  it('excludes nominalTie members — identical text is noise, not an alternative', () => {
    const r = resolveCandidates(chemScope(), [
      cand(1, 'physics', [['sama', 1, 10]]),
      cand(2, 'physics', [['sama', 1, 20]]),
    ]);
    expect(r.nominalTie.sort()).toEqual([1, 2]);
    expect(r.alsoInScope).toEqual([]);
  });

  it('is ordered by position then conceptId — deterministic', () => {
    const r = resolveCandidates(chemScope(), [
      cand(1, 'chemistry', [['w', 1, 10]]),
      cand(9, 'biology', [['x', 1, 20]]),
      cand(3, 'biology', [['y', 1, 30]]),
      cand(2, 'physics', [['z', 1, 40]]),
    ]);
    expect(r.alsoInScope.map((a) => a.conceptId)).toEqual([2, 3, 9]);
  });

  it('is [] when there is nothing to report — the shape is TOTAL', () => {
    expect(resolveCandidates(chemScope(), []).alsoInScope).toEqual([]);
    expect(resolveCandidates({ unscoped: 'unregistered' }, []).alsoInScope).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run server/__tests__/conceptResolverResolve.test.js -t alsoInScope`
Expected: FAIL — `expected undefined to deeply equal [...]`.

- [ ] **Step 3: Implement**

In `emptyResolution`, add `alsoInScope: []` to the returned object.

In `resolveCandidates`, after `atBest` is computed and before the three returns, build the list once and include it in each:

```js
  // B4a/D3 — the in-scope answers that LOST. §C38's hiding-factor ②: resolve()
  // reported outOfScope but a lower-position IN-SCOPE concept that lost the race
  // vanished, so `hittni [biology @3]` was invisible behind `nákvæmni [physics @2]`.
  //
  // Built from `chosen` — after term selection and after the term-less filter —
  // so every entry is a real, offerable answer. Excludes anything already
  // reported as winner, in `tied`, or in `nominalTie`.
  const alsoFrom = (reportedIds) =>
    chosen
      .filter((c) => !reportedIds.has(c.conceptId))
      .sort((a, b) => a.position - b.position || a.conceptId - b.conceptId)
      .map((c) => ({
        conceptId: c.conceptId,
        termId: c.termId,
        text: c.text,
        domain: c.domain,
        position: c.position,
      }));
```

Then at each return: single-winner → `alsoInScope: alsoFrom(new Set([atBest[0].conceptId]))`; nominal-tie → `alsoInScope: alsoFrom(new Set(atBest.map((c) => c.conceptId)))`; real-tie → the same, since `tied` is `atBest`.

- [ ] **Step 4: Run to verify they pass**

Run: `npx vitest run server/__tests__/conceptResolverResolve.test.js -t alsoInScope`
Expected: PASS (6 tests).

- [ ] **Step 5: Update the five whole-object shape pins**

Run: `npm test` from the repo root. **Exactly five `toEqual` assertions go red**, in two files:

| File | Lines |
|---|---|
| `server/__tests__/conceptResolverIntegrity.test.js` | 135, 154, 166, 178 |
| `server/__tests__/conceptResolverResolve.test.js` | 127 |

Add `alsoInScope:` to each expectation with the value that path produces. Line 166 (an out-of-scope candidate alone) and line 127 (no candidates) both take `[]`.

⚠️ **Do NOT switch them to `toMatchObject`, drop the field, or make it conditional.** `toEqual` is a shape pin — retiring five of them is a real loss, and CLAUDE.md's `NON_RENDER_KEYS` rule exists because a new key leaking through a lossless passthrough is exactly how a golden goes quietly wrong.

- [ ] **Step 6: Confirm the export payload did NOT change**

Run: `npx vitest run server/__tests__/resolvedGlossary.test.js`
Expected: PASS with **no edits**. `buildResolvedGlossary` reads five named fields and never spreads the resolution, so an additive field cannot reach the payload. **If this file needs editing, stop — something spreads the object and §9's gate is invalid.**

- [ ] **Step 7: Commit**

```bash
git add server/lib/conceptResolver.js server/__tests__/
git commit -m "feat(B4a): report the in-scope concepts that lost (alsoInScope)

§C38's hiding-factor ②: resolve() surfaced outOfScope, but a lower-position
IN-SCOPE concept that lost the race vanished — which is why hittni [biology @3]
was invisible behind nákvæmni [physics @2]. Carries termId because B4c cannot
write a preference without it.

Five whole-object toEqual pins went red across two files, as measured in
advance. They are updated, not retired.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: The override — a preference wins, after the position walk

The core of the slice.

**Files:**
- Modify: `server/lib/conceptResolver.js:250-381`
- Test: `server/__tests__/conceptResolverResolve.test.js`, `server/__tests__/conceptResolverScope.test.js`

**Interfaces:**
- Consumes: `scope.preference` (Task 3), `scope.stmts.termById` (Task 4), `alsoInScope` (Task 5).
- Produces: `resolveCandidates(scope, candidates, integrity = [], english = null)`. `resolve(scope, english)` passes `english` through. New integrity codes: `preference-term-missing`, `preference-out-of-scope`, `preference-not-a-candidate`. `orphan-preference` is **retired**.

> ### ⚠️ ADDED 2026-08-09 AFTER TASK 3 — two things this task inherits, both measured
>
> **① `conceptResolverResolve.test.js` is currently GREEN FOR THE WRONG REASON, and this task
> owns it.** Every `preference` fixture in that file is a literal `new Map([[10, {...}]])` keyed
> on the same **numeric** `conceptId` used in its `cand(10, …)` helper — so the file never passes
> through `buildScope`/`buildPreferenceMap` and **never exercises Task 3's re-key at all**. It
> passes today only because `resolveCandidates` still reads by concept id. **Seven tests carry
> such fixtures — lines 48-58, 60-69, 187-204, 249-273, 277-283, 285-293, 300-313.**
>
> ⚠️ **It is NOT a mechanical key rename.** Under the re-key, a preference is no longer
> *per-candidate*: **all candidates in one resolution share the same English string**, so the
> per-candidate `.get(c.conceptId)` loop must become **one lookup keyed on the English string,
> checked against each candidate's `isTerms`** — which is exactly the `english` parameter and the
> step-6 override this task's Step 4 introduces. Budget for a structural rewrite of those seven
> fixtures, not an edit.
>
> **② Two tests in `resolvedGlossary.test.js` are RED going into this task, and this task is what
> turns them green** — *"honours an editor book-preference over the head form"* and *"resolves the
> BOOK-DEFAULT (chapter 0) preference…"*. They are red because of the key-type mismatch above,
> which Task 3 correctly did not reach into. **They are this task's completion criteria**: when
> Step 5 runs, the root suite must return to fully green.

- [ ] **Step 1: Rewrite the tests whose premise B4a inverts**

⚠️ **`conceptResolverResolve.test.js:249` is named *"a preference does NOT break a real tie — it selects within a concept, never between"*, and its comment records that it was renamed on 2026-08-08 from "a preference BREAKS a real tie". B4a inverts it again.** Rewrite it deliberately and keep the history in the comment — a second silent rename erases the record of why the first happened:

```js
  it('a preference DOES break a real tie — B4a, and this is the third name of this test', () => {
    // ⚠️ HISTORY, kept on purpose. Written as "a preference BREAKS a real tie";
    // renamed 2026-08-08 to "does NOT ... it selects within a concept, never
    // between", which was correct for the concept-keyed model; inverted again by
    // B4a, where a preference names one term on one concept and IS the answer.
    // The tied members are not lost — they move to alsoInScope (asserted below).
    const pref = new Map([['bond', { termId: 410, tier: 'book' }]]);
    const r = resolveCandidates(
      chemScope(pref),
      [cand(41, 'physics', [['tengi', 1, 410]]), cand(42, 'physics', [['bindi', 1, 420]])],
      [],
      'bond'
    );
    expect(r.winner.text).toBe('tengi');
    expect(r.reason).toBe('book-preference');
    expect(r.tied).toEqual([]);
    expect(r.alsoInScope.map((a) => a.conceptId)).toEqual([42]);
  });
```

Re-key the other preference tests (`:48`, `:60`, `:187`) onto English keys and pass the `english` argument.

- [ ] **Step 2: Write the new failing tests**

```js
describe('resolveCandidates — the preference override (§C38)', () => {
  const acc = (pref) =>
    resolveCandidates(
      chemScope(pref),
      [cand(1, 'physics', [['nákvæmni', 1, 10]]), cand(2, 'biology', [['hittni', 1, 20]])],
      [],
      'accuracy'
    );

  it('THE ANCHOR — a preferred term on a losing in-scope concept wins', () => {
    const r = acc(new Map([['accuracy', { termId: 20, tier: 'book' }]]));
    expect(r.winner).toMatchObject({ text: 'hittni', domain: 'biology', position: 3 });
    expect(r.reason).toBe('book-preference');
  });

  it('THE CONTROL — position still decides when there is no preference', () => {
    const r = acc(new Map());
    expect(r.winner).toMatchObject({ text: 'nákvæmni', domain: 'physics', position: 2 });
    expect(r.reason).toBe('head-form');
  });

  it('the displaced position-winner moves to alsoInScope, not out of sight', () => {
    const r = acc(new Map([['accuracy', { termId: 20, tier: 'book' }]]));
    expect(r.alsoInScope.map((a) => a.conceptId)).toEqual([1]);
  });

  // ⚠️ THE REGRESSION TEST FOR THE DEFECT THAT CAUSED THE REWRITE. Under the
  // concept key, preferring a term for 'accuracy' moved every other English
  // string on that concept. No other test in the suite would catch its return.
  it('THE LEAK CONTROL — a preference for one English string does not move another', () => {
    const pref = new Map([['accuracy', { termId: 20, tier: 'book' }]]);
    const other = resolveCandidates(
      chemScope(pref),
      [cand(1, 'physics', [['nákvæmni', 1, 10]]), cand(2, 'biology', [['hittni', 1, 20]])],
      [],
      'exactness'
    );
    expect(other.winner).toMatchObject({ text: 'nákvæmni', domain: 'physics' });
    expect(other.reason).toBe('head-form');
  });

  it('a nominalTie is PRESERVED when the override fires — it reports concepts to merge', () => {
    const r = resolveCandidates(
      chemScope(new Map([['x', { termId: 30, tier: 'book' }]])),
      [
        cand(1, 'physics', [['sama', 1, 10]]),
        cand(2, 'physics', [['sama', 1, 20]]),
        cand(3, 'biology', [['annad', 1, 30]]),
      ],
      [],
      'x'
    );
    expect(r.winner.text).toBe('annad');
    expect(r.nominalTie.sort()).toEqual([1, 2]);
  });
});

describe('resolveCandidates — the three preference faults (D4)', () => {
  const two = [cand(1, 'physics', [['nákvæmni', 1, 10]]), cand(2, 'biology', [['hittni', 1, 20]])];
  const unpreferred = { text: 'nákvæmni', domain: 'physics' };

  it('preference-not-a-candidate: the term is real but not on any candidate here', () => {
    const scope = chemScope(new Map([['accuracy', { termId: 999, tier: 'book' }]]));
    scope.stmts = { termById: { get: () => ({ term_id: 999, concept_id: 77 }) } };
    const r = resolveCandidates(scope, two, [], 'accuracy');
    expect(r.integrity).toContain('preference-not-a-candidate');
    expect(r.winner).toMatchObject(unpreferred);
  });

  it('preference-term-missing: the term row is gone', () => {
    const scope = chemScope(new Map([['accuracy', { termId: 999, tier: 'book' }]]));
    scope.stmts = { termById: { get: () => undefined } };
    const r = resolveCandidates(scope, two, [], 'accuracy');
    expect(r.integrity).toContain('preference-term-missing');
    expect(r.winner).toMatchObject(unpreferred);
  });

  it('preference-out-of-scope: the term is on a concept outside the domain chain', () => {
    const withMath = [...two, cand(3, 'mathematics', [['stæ', 1, 30]])];
    const r = resolveCandidates(
      chemScope(new Map([['accuracy', { termId: 30, tier: 'book' }]])),
      withMath,
      [],
      'accuracy'
    );
    expect(r.integrity).toContain('preference-out-of-scope');
    expect(r.winner).toMatchObject(unpreferred);
  });

  // ⚠️ THE ONE A NAIVE IMPLEMENTATION MISSES. Step 2 DROPS term-less out-of-scope
  // candidates before recording them (pinned at :118), so a check written against
  // the `outOfScope` OUTPUT is silent for exactly the concepts most likely broken.
  it('preference-out-of-scope fires even when the concept is TERM-LESS in outOfScope', () => {
    const withEmpty = [...two, cand(3, 'mathematics', [['stæ', 1, 30]])];
    withEmpty[2].isTerms = [{ text: 'stæ', rank: 1, termId: 30 }];
    const r = resolveCandidates(
      chemScope(new Map([['accuracy', { termId: 30, tier: 'book' }]])),
      withEmpty,
      [],
      'accuracy'
    );
    expect(r.outOfScope.length).toBe(1);
    expect(r.integrity).toContain('preference-out-of-scope');
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npx vitest run server/__tests__/conceptResolverResolve.test.js`
Expected: FAIL on every override and fault test.

- [ ] **Step 4: Implement**

**(a) Delete the per-candidate preference lookup** in step 3 — lines 270-281 collapse to:

```js
  for (const c of inScope) {
    const term = headForm(c);
    if (!term) continue; // the filter, between steps 3 and 4
    chosen.push({
      conceptId: c.conceptId,
      termId: term.termId,
      text: term.text,
      domain: c.domain,
      position: scope.positionOf.get(c.domain),
      reason: 'head-form',
    });
  }
```

**(b) Add step 6**, after steps 4-5 have produced `result` and before returning it:

```js
  // B4a/D3 — THE OVERRIDE, applied AFTER the position walk, never instead of it.
  //
  // ⚠️ AFTER, on purpose. A short-circuit that returned the preferred term
  // immediately skips step 5, and that was MEASURED to destroy the nominal-tie
  // merge hint when tie members straddle the preference: [1,2] became []. Every
  // existing report survives here; only the answer changes.
  //
  // Determinism needs no sort: the primary key permits one preference per
  // (book, chapter, english), and a term_id belongs to exactly one concept, so
  // at most one candidate can carry it.
  const applyPreference = (result) => {
    if (english == null) return result;
    const pref = scope.preference.get(english.toLowerCase());
    if (!pref) return result;

    // ⚠️ Search ALL candidates, in-scope AND out. D4's out-of-scope code is
    // undetectable from the `outOfScope` OUTPUT, which drops term-less concepts
    // (step 2, pinned by conceptResolverResolve.test.js:118) — so a check written
    // against it stays silent for exactly the concepts most likely to be broken.
    const owner = candidates.find((c) => c.isTerms.some((t) => t.termId === pref.termId));

    if (!owner) {
      // Two faults, two remedies: delete a stale row vs. fix a misfiled one.
      const exists = scope.stmts && scope.stmts.termById && scope.stmts.termById.get(pref.termId);
      codes.push(exists ? 'preference-not-a-candidate' : 'preference-term-missing');
      return result;
    }
    if (!scope.positionOf.has(owner.domain)) {
      // D1: in-scope only. Ignoring it is CORRECT; ignoring it silently is not.
      codes.push('preference-out-of-scope');
      return result;
    }

    const term = owner.isTerms.find((t) => t.termId === pref.termId);
    const winner = {
      conceptId: owner.conceptId,
      termId: term.termId,
      text: term.text,
      domain: owner.domain,
      position: scope.positionOf.get(owner.domain),
    };
    return {
      ...result,
      winner,
      reason: pref.tier === 'chapter' ? 'chapter-preference' : 'book-preference',
      // ⚠️ A real tie the editor has ANSWERED is no longer a tie — but its members
      // are still real, offerable, in-scope answers and MUST stay visible.
      // Clearing `tied` without re-homing them makes them vanish from both lists:
      // D3's own invisibility, re-created inside D3.
      tied: [],
      nominalTie: result.nominalTie, // duplicates to merge — true either way
      alsoInScope: alsoFrom(new Set([winner.conceptId])),
    };
  };
```

Wrap each of the three returns in `applyPreference(...)`, and change the signature to
`resolveCandidates(scope, candidates, integrity = [], english = null)`.

**(c) Pass `english` through** in `resolve()`:

```js
  return resolveCandidates(scope, candidates, integrity, english);
```

⚠️ **`scope.unscoped` returns early at `:378` with `resolveCandidates(scope, [], [])`** — leave it three-argument. An unscoped book has no preference map to consult.

- [ ] **Step 5: Run to verify they pass**

Run: `npx vitest run server/__tests__/conceptResolver*.test.js`
Expected: PASS.

- [ ] **Step 6: Update the §C39 characterization test**

Task 1's test asserted the concept-keyed skew. `book_concept_preference` no longer exists, so rewrite it to assert the **new** outcome — a preference naming a term on a merged-away concept now surfaces as `preference-not-a-candidate` — and keep the comment explaining what it used to pin. **Update, do not delete.**

- [ ] **Step 7: Retire `orphan-preference`**

Run: `grep -rn "orphan-preference" server/ docs/ --include=*.js --include=*.md`
Every code-path reference must be gone. Spec and register references stay — they are the record.

- [ ] **Step 8: Mutation-verify**

Add to `conceptResolverMutation.test.js`, then break each line and confirm a red:

| Mutation | Must turn red |
|---|---|
| Drop the `preference-out-of-scope` branch | the out-of-scope fault tests |
| Search only `inScope` for the owner | the term-less out-of-scope test |
| Clear `nominalTie` along with `tied` | the nominalTie-preserved test |
| Clear `tied` without `alsoInScope: alsoFrom(...)` | the displaced-member test |
| Drop `.toLowerCase()` in the lookup | the collation test |
| Return `result` unchanged when `pref` is found | the anchor |

- [ ] **Step 9: Full suite, then commit**

Run: `npm test` from the repo root. Expected: green.

```bash
git add server/lib/conceptResolver.js server/__tests__/
git commit -m "feat(B4a): a term preference wins, and it closes §C38

resolve() now honours a book_term_preference row regardless of which domain
the term's concept sits in, so chemistry's `accuracy` can be `hittni` while
`precision` stays `nákvæmni`.

The override is applied AFTER the position walk, never instead of it: a
short-circuit was measured to destroy the nominal-tie merge hint when tie
members straddle the preference ([1,2] -> []). Every existing report survives;
only the answer changes. Tied members move to alsoInScope rather than
vanishing.

orphan-preference is retired in favour of three codes with three remedies:
preference-term-missing, preference-out-of-scope, preference-not-a-candidate.
The out-of-scope check searches ALL candidates, because step 2 drops term-less
out-of-scope concepts before recording them — a check against the outOfScope
output is silent for exactly the concepts most likely broken.

The leak control is the regression test for the defect that caused the spec
rewrite: a preference for one English string must not move another.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Route the integrity counts to a channel that reaches an operator (D5)

**Files:**
- Modify: `server/lib/resolvedGlossary.js`, `server/scripts/export-terminology.js`
- Test: `server/__tests__/resolvedGlossary.test.js`

**Interfaces:**
- Produces: `buildResolvedGlossary` returns `integrity: {[code]: count}` **as a sibling of `stats`, not inside the payload's persisted shape**. `export-terminology.js` prints it and stores it in `outcomes[b]`.

⚠️ **The obvious design does not work, and this is the finding that most changes the code.** `glossaryExportDecision.sameTerms` is `JSON.stringify(prev.terms) === JSON.stringify(next.terms)` and reads nothing else; `export-terminology.js:765` `continue`s on a match, before the write at `:801`. A payload differing only in a new `stats.integrity` key is classified `unchanged` and **never written** — and an unhonourable preference leaves `terms` byte-identical **by construction**. The report would be absent exactly when needed.

- [ ] **Step 1: Write the failing tests**

```js
  it('counts integrity codes per census string, and does NOT put them in the payload', () => {
    const out = buildWithABrokenPreference(); // helper: seeds a dangling term_id
    expect(out.integrity).toEqual({ 'preference-term-missing': 1 });
    // ⚠️ The payload must NOT gain a key: sameTerms ignores everything but
    // `terms`, so a payload-borne report is skipped by write-if-changed exactly
    // when it matters. It also keeps B4a's export byte-comparison meaningful.
    expect(out.stats).not.toHaveProperty('integrity');
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run server/__tests__/resolvedGlossary.test.js -t integrity`
Expected: FAIL — `expected undefined to deeply equal {...}`.

- [ ] **Step 3: Implement**

In `buildResolvedGlossary`, accumulate a local `const integrity = {}` inside the census loop
(`for (const code of r.integrity) integrity[code] = (integrity[code] || 0) + 1;`) and return it
as a **top-level sibling** of `stats`. Do **not** add it to `stats`.

In `export-terminology.js`, where a book's outcome is recorded, append to the log line and to
`outcomes[b]` when the object is non-empty:

```js
    // ⚠️ THE UNIT IS CENSUS STRINGS, NOT ROWS. resolveCandidates de-duplicates
    // each code per resolution, so one broken row hit by twelve English strings
    // counts twelve, and twelve broken rows on one string count one. Say so, or
    // the number reads as a row count and misleads.
    const integrityNote = Object.keys(next.integrity || {}).length
      ? ` · preference faults (census strings): ${JSON.stringify(next.integrity)}`
      : '';
```

- [ ] **Step 4: Run to verify it passes, and that the payload is untouched**

Run: `npx vitest run server/__tests__/resolvedGlossary.test.js`
Expected: PASS, including the existing payload-shape tests **with no edits**.

- [ ] **Step 5: Commit**

```bash
git add server/lib/resolvedGlossary.js server/scripts/export-terminology.js server/__tests__/resolvedGlossary.test.js
git commit -m "feat(B4a): report preference faults where an operator will see them

Not in stats: sameTerms compares only \`terms\`, and an unhonourable preference
leaves \`terms\` byte-identical by construction — so a payload-borne report is
classified 'unchanged' and never written, absent exactly when needed. The
counts go to the per-book log line and outcomes[b] instead, and the log says
the unit is census strings, not rows.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: The corpus acceptance gate

**Files:**
- Create: `server/scripts/verify-b4a-gates.js`
- Create: `test-results/b4a-term-preference-2026-08.md`

Implements spec §9. ⚠️ **Two traps the first draft's gate fell into:** `createResolvedExportFn` opens the DB `{ readonly: true }`, so the gate needs **its own writable connection** to a copy; and **`scope.preference` is a snapshot taken at `buildScope` time**, so a row seeded afterwards is invisible until you **rebuild the scope**.

- [ ] **Step 1: Write the gate script**

Five gates, each printing `PASS`/`FAIL` and a measured number, exiting non-zero on any failure:

1. **Export unchanged** — `JSON.stringify(prev.terms) === JSON.stringify(next.terms)` against a pre-change capture, plus `stats` gains no key. ⚠️ **Do not assert literal byte-identity**: `generated: new Date().toISOString()` differs on every build. ⚠️ **A term count alone is not the gate** — two payloads can agree on 2,119 and differ in which 2,119.
2. **Zero-preference control** — `SELECT COUNT(*) FROM book_term_preference` = 0, and migration 048's expansion count = 0.
3. **§C38 closes** — insert the `accuracy` preference, **rebuild the scope**, assert `hittni`; delete, rebuild, assert `nákvæmni` returns. The second half is the control.
4. **The leak is closed** — find a production concept carrying ≥2 English strings both in chemistry's census, prefer one, assert the other does not move. ⚠️ **If no such concept exists, print `NOT RUN` and say why — never report a vacuous pass.**
5. **No performance regression** — `server/scripts/bench-resolve.js` against B1's 0.044 ms/resolve **on the same box**. A dev-box figure: a regression check against itself, never a production budget.

- [ ] **Step 2: Run it against a writable copy of production's database**

```bash
cp <prod-sessions.db-copy> /tmp/claude-*/scratchpad/b4a-gate.db
SESSIONS_DB_PATH=/tmp/claude-*/scratchpad/b4a-gate.db node server/scripts/verify-b4a-gates.js
```

- [ ] **Step 3: Record the measurements**

Write `test-results/b4a-term-preference-2026-08.md` with the actual numbers, the method, and the exact commands. **Record what did NOT run and why** — a gate marked `NOT RUN` is information; a gate silently skipped is not.

- [ ] **Step 4: Commit**

```bash
git add server/scripts/verify-b4a-gates.js test-results/b4a-term-preference-2026-08.md
git commit -m "test(B4a): the acceptance gate, measured on the real corpus

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Whole-branch adversarial review, then the PR

- [ ] **Step 1: Confirm the authoritative gate**

Run `npm test` from the repo root. Record the file/test counts in the PR body. A green root run is the real proof — there is no branch protection.

- [ ] **Step 2: Run the whole-branch review as a BLIND PAIR**

The B1 and B3 precedent: two reviewers, identical inputs, neither told the other exists, verdicts adjudicated. **Each found a real defect the other missed on both branches; overlap was ~4 of 17.**

⚠️ **ASK THE LEAD BEFORE USING FABLE** — real spend, and the standing preference is to ask. Its proven use here is blind adversarial *review*, not implementation.

- [ ] **Step 3: Update the register**

Add B4a's outcome to §C36's Part B block: what merged, what was measured, what was deferred, and every finding the review raised — including the ones not fixed. Log out-of-scope issues to the register, all of them.

- [ ] **Step 4: Open the PR**

Base `main`, head `spec/c36-b4a-term-preference`. Body: what changed, the migration, the §C38 closure with its measurement, the gate results, and the deferred list.

⚠️ **Merging strands production's content backup** until someone deploys — the cron commits and pushes without fetching. Say so in the PR body, and expect the next tick that carries content to be rejected until a deploy re-bases it.

---

## Self-Review

**Spec coverage.** §3 D1 → Task 6 (`preference-out-of-scope`) · D2 → Tasks 2, 3 · D3 → Task 6 · D4 → Tasks 4, 6 · D5 → Task 7 · D6 → scope of the whole plan (no route, no UI, no matcher change). §5/5.1 → Task 2. §6.1 → Task 3 · §6.2 → Task 6 · §6.3 → no task, deliberately: the chapter tier is unreachable in B4a and is exercised only by the unit scopes in Task 3. §6.4 → Task 5. §7 → Task 5 step 5. §8 → Tasks 5, 6. §9 → Task 8. §10 R3/§C39 → Tasks 1, 6.

**Placeholders.** None: every code step carries real code, every run step carries the command and its expected result.

**Type consistency.** `scope.preference` is `Map<lowercased english, {termId, tier}>` in Tasks 3 and 6. `alsoInScope` entries are `{conceptId, termId, text, domain, position}` in Tasks 5 and 6. `resolveCandidates(scope, candidates, integrity, english)` is used consistently from Task 6 onward; earlier tasks call it with two or three arguments, which the default parameter permits. `scope.stmts.termById.get(id)` returns `{term_id, concept_id} | undefined` in Tasks 4 and 6.

**One gap, stated rather than hidden.** Task 6's three fault tests stub `scope.stmts.termById` on a literal scope object, because `resolveCandidates` is pure and the existing test file imports no database. That is faithful to how the function is called — but it is a **test double standing in for a prepared statement**, and §C20's lesson is that a double can be faithful except on the property the code branches on. Task 8's gate 3 is what exercises the real statement against the real corpus; **do not treat the unit tests alone as proof of the fault paths.**
