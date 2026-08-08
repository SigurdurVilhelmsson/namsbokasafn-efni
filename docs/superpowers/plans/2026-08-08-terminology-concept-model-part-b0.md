# Terminology Concept Model — Part B0: import hygiene — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the concept import runnable from the repo, gated on its own yield, and
non-destructive to editor preferences — so the Part B production import can be executed and
believed.

**Architecture:** Part A shipped the concept tables and the import *functions*, but no driver:
neither `run-concept-import.js` nor `verify-concept-import.js` has a `require.main === module`
block, so the numbers in `test-results/concept-import-2026-08.md` were produced by something
that is not in the repo. This plan adds the two entry points, collapses the triplicated domain
vocabulary onto one constant, gates zero-yield collections instead of merely printing them,
replaces the import's delete-then-reinsert with a keyed upsert plus an accounted prune, and
adds migration 047 to clear orphaned `book_domain_priority` rows. **Nothing here reads the
concept tables on a request path, changes any consumer, drops any table, or writes to
production.**

**Tech Stack:** Node 22 (`.nvmrc`), better-sqlite3, Vitest, CommonJS (`server/` is CJS).

**Spec:** [`docs/superpowers/specs/2026-08-07-terminology-concept-model-design.md`](../specs/2026-08-07-terminology-concept-model-design.md)
**Register item:** §C36 deferred findings 1, 2, 3, 5, 6, 8 (findings 4 and 7 are deliberately
out of scope — see *Non-goals*).

## Global Constraints

- Node **22.x** — `.nvmrc` is the single source of truth. Run `nvm use` before `npm install`.
- Run `npm test` from the **repo root**. It is `vitest run` and does **not** run Playwright.
- Resolve resource paths against `import.meta.url` / `__dirname`, **never** `process.cwd()`.
  The server runs with cwd=`server/`. For the DB path use `server/lib/dbPath.js`
  (`resolveDbPath()`), which honours `SESSIONS_DB_PATH`. Never hardcode a DB path.
- Migrations are **append-only. Never edit a shipped migration.** `045` and `046` are merged
  and deployed to production; this plan does not touch either file.
- New migrations must be registered in `server/services/migrationRunner.js` **and** the count
  pinned in `server/__tests__/startup.test.js` must be bumped. **Do not trust a list of line
  numbers here — derive it:** `grep -n '46' server/__tests__/startup.test.js` (measured
  2026-08-08: seven occurrences, at `:70 :76 :77 :79 :80 :87 :90`, including two in comments and
  two loop bounds). Missing one leaves a test asserting the old count.
- Domains are exactly these seven: `biology` `chemistry` `physics` `astronomy`
  `anatomy-physiology` `mathematics` `earth-science`.
- Chapter sentinels (item-14 `chapterLabel` contract): `0` = book default, `-1` = appendices,
  `1..n` = chapter.
- **Argument parsing must FAIL LOUD.** `tools/lib/parseArgs.js` silently drops unknown flags;
  do **not** use it. Copy the fail-loud shape from
  `server/scripts/export-terminology.js`'s own `parseArgs`, which returns
  `{..., error: '...'}` on an unrecognised argument.
- `books/*/01-source/` and `books/*/02-mt-output/` are **READ ONLY**. Nothing in this plan
  writes to `books/` at all.
- **Every test file under `server/__tests__/` is ESM** — measured 2026-08-08: 132 of 133 use
  `import { … } from 'vitest'` with `const require = createRequire(import.meta.url)` for CJS
  modules, and **zero** use `require('vitest')`. Match that; a plain-CJS test file will not run.
- `vitest.config.js` sets **`fileParallelism: false`**, so nothing runs in parallel and a test
  that mutates shared module state can affect later files. **Prefer building fixtures in-process
  over mutating `process.env`.**
- **`PRAGMA foreign_keys` is OFF on every production connection.** It is per-connection, defaults
  off, is not stored in the file, and `server/services/terminologyService.js:100` opens
  `new Database(DB_PATH)` with no pragma call. Any test whose subject is a foreign-key behaviour
  must state which configuration it exercises — see Task 2.

## Non-goals

- `resolve()`, the glossary export, the MT payload, the editor surface. Those are Part B
  proper; this plan is its precondition.
- Running the production import. That is a separate data-op, taken after this merges.
- Finding 4 (null / colliding `idordabanki_id`) — measured currently absent (0 nulls, 70,187
  distinct ids, zero collisions). Task 2's prune accounting makes a future collision *visible*;
  making it structurally impossible is a schema change and belongs with Part B's rebuild.
- Finding 7 (widening the homograph oracle) — the evidence file is explicit that widening
  requires measurement, not reasoning, and `flokkur` is the recorded near-miss. Out of scope by
  design.

## File Structure

| File | Responsibility |
|---|---|
| `server/lib/domains.js` | **NEW.** The single source of truth for the seven domains and for each book's domain fallback order. Replaces three independent copies. |
| `server/lib/conceptFromEntry.js` | MODIFY. Import `DOMAIN_SET`; validate `COLLECTION_DOMAIN`'s values at module load so a typo'd domain throws instead of silently scoping to nothing. |
| `server/scripts/import-concepts.js` | MODIFY. Keyed upsert + accounted prune, replacing `DELETE FROM concept_term WHERE concept_id = ?`. Reports `prunedTerms` and `preferencesDropped`. |
| `server/scripts/run-concept-import.js` | MODIFY. Add a fail-loud CLI entry point and a zero-yield gate. |
| `server/scripts/verify-concept-import.js` | MODIFY. Add a fail-loud CLI entry point; take `DOMAINS` from `server/lib/domains.js`. |
| `server/migrations/047-reconcile-domain-priority.js` | **NEW.** Delete-before-insert per book, so a domain removed from the map stops influencing `ORDER BY position`. |
| `server/services/migrationRunner.js` | MODIFY. Register 047. |
| `server/__tests__/startup.test.js` | MODIFY. Bump the migration-count pins 46 → 47. |
| `server/__tests__/domains.test.js` | **NEW.** Pins the triplication closed. |
| `server/__tests__/importConcepts.test.js` | MODIFY. Add preference-survival and prune-accounting cases. |
| `server/__tests__/conceptImportCli.test.js` | **NEW.** Arg parsing + the zero-yield gate. |
| `server/__tests__/migration047.test.js` | **NEW.** Orphan removal, idempotence. |
| `server/__tests__/migrationsRealTree.test.js` | **NEW.** Spec §10's real-tree assertion, built by running every migration against an empty file. |

---

### Task 1: One domain vocabulary, and a typo that throws

Register finding 5: the domain vocabulary exists in three places with no shared constant and
no test — `COLLECTION_DOMAIN`'s values (`server/lib/conceptFromEntry.js:16-37`), `DOMAINS`
(`server/scripts/verify-concept-import.js:9-17`), and `PRIORITIES`'s domains
(`server/migrations/046-seed-domain-priority.js:12-19`). Measured clean today, but nothing
keeps it clean, and a typo'd domain yields a fallback level that matches nothing, silently.

`046` is shipped and must not be edited, so the new constant becomes the owner going forward
and Task 5's migration 047 consumes it. Migrations `004` and `006` already `require('../lib/…')`,
so the import direction is established practice here.

**Files:**
- Create: `server/lib/domains.js`
- Create: `server/__tests__/domains.test.js`
- Modify: `server/lib/conceptFromEntry.js` (add the import + validation; leave the map itself alone)
- Modify: `server/scripts/verify-concept-import.js:9-17` (take `DOMAINS` from the lib)

**Interfaces:**
- Produces: `require('../lib/domains')` → `{ DOMAINS, DOMAIN_SET, BOOK_DOMAIN_PRIORITY }` where
  `DOMAINS` is a frozen `string[]` of the seven values, `DOMAIN_SET` is a `Set<string>` of the
  same, and `BOOK_DOMAIN_PRIORITY` is a frozen `Record<bookSlug, string[]>` — the ordered
  fallback per book, position 1 first.
- Consumed by: Task 5's `server/migrations/047-reconcile-domain-priority.js`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/domains.test.js`:

```js
// server/__tests__/domains.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { DOMAINS, DOMAIN_SET, BOOK_DOMAIN_PRIORITY } = require('../lib/domains');
const { COLLECTION_DOMAIN } = require('../lib/conceptFromEntry');
const { DOMAINS: VERIFY_DOMAINS } = require('../scripts/verify-concept-import');

describe('domain vocabulary has exactly one owner', () => {
  it('is the seven values the spec names', () => {
    expect([...DOMAINS].sort()).toEqual(
      [
        'anatomy-physiology',
        'astronomy',
        'biology',
        'chemistry',
        'earth-science',
        'mathematics',
        'physics',
      ].sort()
    );
  });

  it('every COLLECTION_DOMAIN value is a known domain', () => {
    const unknown = Object.entries(COLLECTION_DOMAIN)
      .filter(([, d]) => !DOMAIN_SET.has(d))
      .map(([c, d]) => `${c}→${d}`);
    expect(unknown).toEqual([]);
  });

  it('every BOOK_DOMAIN_PRIORITY domain is a known domain', () => {
    const unknown = Object.entries(BOOK_DOMAIN_PRIORITY)
      .flatMap(([slug, ds]) => ds.map((d) => [slug, d]))
      .filter(([, d]) => !DOMAIN_SET.has(d))
      .map(([slug, d]) => `${slug}→${d}`);
    expect(unknown).toEqual([]);
  });

  it("the verifier does not keep its own copy", () => {
    expect(VERIFY_DOMAINS).toBe(DOMAIN_SET);
  });

  it('a book lists each domain at most once', () => {
    for (const [slug, ds] of Object.entries(BOOK_DOMAIN_PRIORITY)) {
      expect(new Set(ds).size, `${slug} repeats a domain`).toBe(ds.length);
    }
  });
});

describe('a typo cannot enter silently', () => {
  const { conceptFromEntry } = require('../lib/conceptFromEntry');
  it('conceptFromEntry throws when asked to build with an unknown domain', () => {
    expect(() =>
      conceptFromEntry(
        { words: [{ fklanguage: 'IS', word: 'x' }] },
        { collection: 'EFNAFR', domain: 'chemsitry' }
      )
    ).toThrow(/chemsitry/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/domains.test.js`
Expected: FAIL — `Cannot find module '../lib/domains'`.

- [ ] **Step 3: Create the shared constant**

Create `server/lib/domains.js`:

```js
// server/lib/domains.js
/**
 * The domain vocabulary, and each book's ordered domain fallback.
 *
 * ⚠️ ONE OWNER. This existed in three independent copies until 2026-08-08
 * (register §C36 finding 5): COLLECTION_DOMAIN's values in lib/conceptFromEntry.js,
 * DOMAINS in scripts/verify-concept-import.js, and PRIORITIES's domains in
 * migrations/046-seed-domain-priority.js. All three were measured clean — and
 * nothing kept them clean. A typo'd domain is not a crash: it produces a
 * fallback level that matches nothing, so a book silently scopes to less than
 * it should and every check stays green.
 *
 * `domain` is OURS (spec §5), not Árnastofnun's. Their `collection` is retained
 * on the concept row as provenance and is never a precedence key.
 *
 * ⚠️ Migration 046 is SHIPPED and deliberately not edited — migrations are
 * append-only. Migration 047 is the live owner of the priority map and reads
 * BOOK_DOMAIN_PRIORITY from here.
 */
const DOMAINS = Object.freeze([
  'biology',
  'chemistry',
  'physics',
  'astronomy',
  'anatomy-physiology',
  'mathematics',
  'earth-science',
]);

const DOMAIN_SET = new Set(DOMAINS);

/**
 * Each book's domain fallback order, position 1 first.
 *
 * The FIRST FALLBACK ENTRY IS LOAD-BEARING, and it is measured, not guessed:
 * against production's 28,903 translations, efnafraedi-2e's strict chemistry
 * scope keeps 709 and discards 19,057 that carry `physics` or `biology` —
 * `pH`, `bond`, `carbon dioxide` and `nitrogen` among them. Those are what the
 * fallback returns.
 */
const BOOK_DOMAIN_PRIORITY = Object.freeze({
  'efnafraedi-2e': Object.freeze(['chemistry', 'physics', 'biology']),
  'lifraen-efnafraedi': Object.freeze(['chemistry', 'biology', 'physics']),
  'liffraedi-2e': Object.freeze(['biology', 'anatomy-physiology', 'chemistry']),
  orverufraedi: Object.freeze(['biology', 'anatomy-physiology', 'chemistry']),
  'edlisfraedi-2e': Object.freeze([
    'physics',
    'astronomy',
    'mathematics',
    'earth-science',
    'chemistry',
  ]),
  stjornufraedi: Object.freeze(['astronomy', 'physics', 'earth-science', 'mathematics']),
});

module.exports = { DOMAINS, DOMAIN_SET, BOOK_DOMAIN_PRIORITY };
```

- [ ] **Step 4: Point the two existing copies at it**

In `server/lib/conceptFromEntry.js`, add below the existing requires (the file currently has
none — put it at the top, under the docstring):

```js
const { DOMAIN_SET } = require('./domains');
```

and inside `conceptFromEntry`, as the first statement of the function body:

```js
  // Fail loud. A typo'd domain is otherwise invisible: it produces a fallback
  // level that matches nothing, so the book scopes to less than it should and
  // every check stays green. (Register §C36 finding 5.)
  if (!DOMAIN_SET.has(domain)) {
    throw new Error(
      `Unknown domain '${domain}' for collection '${collection}' — ` +
        `must be one of: ${[...DOMAIN_SET].join(', ')}`
    );
  }
```

In `server/scripts/verify-concept-import.js`, delete the local `DOMAINS` declaration at
`:9-17` and replace it with:

```js
const { DOMAIN_SET: DOMAINS } = require('../lib/domains');
```

Leave the file's `module.exports = { verifyConceptImport, DOMAINS };` line as it is — the
existing `server/__tests__/verifyConceptImport.test.js` imports `DOMAINS` from this module and
must keep working.

- [ ] **Step 5: Run the tests**

Run: `npx vitest run server/__tests__/domains.test.js server/__tests__/verifyConceptImport.test.js server/__tests__/conceptFromEntry.test.js server/__tests__/importConcepts.test.js`
Expected: PASS. If `conceptFromEntry.test.js` fails, it is calling `conceptFromEntry` with a
domain outside the seven — read the failure before changing anything; that is the guard working.

- [ ] **Step 6: Mutation control — prove the test can fail**

Temporarily change one value in `COLLECTION_DOMAIN` (e.g. `EFNAFR: 'chemsitry'`) and run
`npx vitest run server/__tests__/domains.test.js`.
Expected: FAIL on "every COLLECTION_DOMAIN value is a known domain", naming `EFNAFR→chemsitry`.
**Revert the mutation.** A test that cannot go red is not a test.

- [ ] **Step 7: Commit**

```bash
git add server/lib/domains.js server/__tests__/domains.test.js server/lib/conceptFromEntry.js server/scripts/verify-concept-import.js
git commit -m "fix(terminology): one owner for the domain vocabulary, and a typo that throws

The seven domains existed in three independent copies with no shared constant
and no test (register C36 finding 5). All three were measured clean; nothing
kept them clean. A typo'd domain is not a crash — it yields a fallback level
that matches nothing, so a book silently scopes to less than it should while
every check stays green.

Migration 046 is shipped and is deliberately not edited."
```

---

### Task 2: Re-import stops breaking editor preferences

Register finding 1: `server/scripts/import-concepts.js:32` prepares
`DELETE FROM concept_term WHERE concept_id = ?` and `:67` fires it on every re-import;
`concept_term.id` is `AUTOINCREMENT` (`045-concept-model.js:40`) and
`book_concept_preference.term_id` is `ON DELETE CASCADE` (`:58`). So an ordinary refresh gives
every surviving term a **new id**, and every editor preference for that collection breaks —
with no count and no warning in the returned stats.

**⚠️ CORRECTED 2026-08-08 — the register states the mechanism as a cascade delete, and that is
NOT what happens in production.** `PRAGMA foreign_keys` is per-connection, defaults **off**, is
not stored in the file, and `server/services/terminologyService.js:100` opens
`new Database(DB_PATH)` with no pragma call. **Measured, re-importing an identical payload:**

| `PRAGMA foreign_keys` | term id before → after | preference rows surviving | dangling |
|---|---|---|---|
| `ON` | 3 → 6 | 0 — cascaded away | 0 |
| `OFF` — **the deployed configuration** | 3 → 6 | **1** | **1** |

With foreign keys off the preference row is **not** deleted: it survives pointing at `term_id=3`,
a row that no longer exists, while the term itself now lives at id 6. That is quieter than the
cascade and worse — the preference still *looks* set in the table and silently resolves to
nothing. (`AUTOINCREMENT` never reuses an id, so it stays dangling rather than rebinding to an
unrelated term. That is the one mercy here, and it is a property of the schema, not of the code.)

The fix is the same under both configurations, and the test must exercise **both** — a harness
that enables foreign keys tests a configuration production does not run.

The fix is not "upsert instead of delete", because that alone leaks terms that vanished
upstream. It is: **upsert what is present, prune only what actually disappeared, and account
for both** — including how many preferences the prune destroyed. A preference pointing at a
term Árnastofnun has withdrawn *should* go; a preference pointing at a term that is still there
should not, and today both go.

**Files:**
- Modify: `server/scripts/import-concepts.js:32` (the `clearTerms` statement) and `:60-79` (the term loop)
- Test: `server/__tests__/importConcepts.test.js`

**Interfaces:**
- Consumes: nothing from Task 1 (independent).
- Produces: `importConcepts(db, payload)` returns the same `stats` object with **three new
  fields**: `updatedTerms` (upserts that hit an existing row), `prunedTerms` (rows deleted
  because they are absent from the payload), and `preferencesDropped` (rows removed from
  `book_concept_preference` by that prune). Task 3's report prints them.

- [ ] **Step 1: Write the failing test**

Append to `server/__tests__/importConcepts.test.js`:

The file already has, at module scope, `payload(entries, collection = 'EFNAFR')` and
`w(fklanguage, word, extra = {})` helpers and a `beforeEach` that builds `db` with
`CREATE TABLE registered_books (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE);` followed by
`migration045.up(db)`. **Reuse them — do not add a second harness.** Note `registered_books` here
has no `title` column.

```js
// ── register §C36 finding 1 ──────────────────────────────────────────────────
//
// ⚠️ Parameterised over PRAGMA foreign_keys ON *and* OFF, deliberately.
// Production runs with it OFF (per-connection, defaults off, not stored in the
// file; terminologyService.js:100 opens `new Database(DB_PATH)` with no pragma).
// Under ON the broken preference CASCADES away; under OFF it SURVIVES pointing
// at a term id that no longer exists. Testing only ON would validate a
// configuration this project does not deploy.
describe.each([['ON'], ['OFF']])(
  're-import keeps editor preferences intact (foreign_keys = %s)',
  (fk) => {
    const entry = {
      id: 991,
      words: [w('EN', 'atom'), w('IS', 'frumeind', { synonyms: 'atóm' })],
    };

    function seedPreference() {
      db.pragma(`foreign_keys = ${fk}`);
      importConcepts(db, payload([entry]));
      db.prepare('INSERT INTO registered_books (id, slug) VALUES (1, ?)').run('efnafraedi-2e');
      const conceptId = db.prepare('SELECT id FROM concept').get().id;
      const termId = db
        .prepare("SELECT id FROM concept_term WHERE lang='is' AND text='atóm'")
        .get().id;
      db.prepare(
        `INSERT INTO book_concept_preference (book_id, chapter, concept_id, term_id)
         VALUES (1, 0, ?, ?)`
      ).run(conceptId, termId);
      return { conceptId, termId };
    }

    const danglingCount = () =>
      db
        .prepare('SELECT term_id FROM book_concept_preference')
        .all()
        .filter((p) => !db.prepare('SELECT 1 FROM concept_term WHERE id = ?').get(p.term_id))
        .length;

    it('leaves the preference pointing at a term that still exists', () => {
      const { termId } = seedPreference();
      const stats = importConcepts(db, payload([entry]));

      expect(db.prepare('SELECT COUNT(*) c FROM book_concept_preference').get().c).toBe(1);
      expect(db.prepare('SELECT term_id FROM book_concept_preference').get().term_id).toBe(
        termId
      );
      expect(danglingCount()).toBe(0);
      expect(stats.preferencesDropped).toBe(0);
      expect(stats.prunedTerms).toBe(0);
    });

    it('keeps every term id stable across an identical re-import', () => {
      seedPreference();
      const before = db.prepare('SELECT id, lang, text FROM concept_term ORDER BY id').all();
      importConcepts(db, payload([entry]));
      const after = db.prepare('SELECT id, lang, text FROM concept_term ORDER BY id').all();
      expect(after).toEqual(before);
    });

    it('prunes a term WITHDRAWN upstream, and reports the preference it cost', () => {
      seedPreference();
      // Árnastofnun drops the synonym: 'atóm' is genuinely gone.
      const stats = importConcepts(
        db,
        payload([{ id: 991, words: [w('EN', 'atom'), w('IS', 'frumeind')] }])
      );

      expect(stats.prunedTerms).toBe(1);
      expect(stats.preferencesDropped).toBe(1);
      // Counted BEFORE the delete, so the number is right under either pragma;
      // under OFF the row must be removed explicitly rather than left dangling.
      expect(db.prepare('SELECT COUNT(*) c FROM book_concept_preference').get().c).toBe(0);
      expect(danglingCount()).toBe(0);
    });
  }
);
```

⚠️ The third case asserts the preference row is **gone** under both pragmas. Under `OFF` nothing
removes it for you, so `import-concepts.js` must delete it explicitly rather than relying on the
cascade. Step 3's implementation does that: it counts the affected preferences and then deletes
them, in that order.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/importConcepts.test.js`
Expected: FAIL — the first case reports `preferencesDropped` undefined and
`book_concept_preference` count `0`, because the mass delete cascaded it away.

- [ ] **Step 3: Replace the mass delete with an accounted upsert + prune**

In `server/scripts/import-concepts.js`, replace the `clearTerms` statement at `:32`:

```js
  const listTerms = db.prepare('SELECT id, lang, text FROM concept_term WHERE concept_id = ?');
  const delTerm = db.prepare('DELETE FROM concept_term WHERE id = ?');
  const countPrefs = db.prepare(
    'SELECT COUNT(*) AS c FROM book_concept_preference WHERE term_id = ?'
  );
  // ⚠️ Explicit, NOT left to ON DELETE CASCADE. foreign_keys is per-connection,
  // defaults off, and production never turns it on — so the cascade does not
  // fire there and the row would survive pointing at a deleted term.
  const delPrefs = db.prepare('DELETE FROM book_concept_preference WHERE term_id = ?');
```

replace the `insTerm` statement so it upserts on the natural key:

```js
  const insTerm = db.prepare(
    `INSERT INTO concept_term (concept_id, lang, text, rank, source) VALUES (?,?,?,?,?)
     ON CONFLICT(concept_id, lang, text)
     DO UPDATE SET rank = excluded.rank, source = excluded.source`
  );
```

add the three counters to `stats`:

```js
    updatedTerms: 0,
    prunedTerms: 0,
    preferencesDropped: 0,
```

delete the `if (existing) clearTerms.run(conceptId);` line, and replace the term loop body so
it records what it kept and then prunes only the rest:

```js
      // Captured BEFORE the upsert loop: afterwards an upsert cannot tell you
      // whether it inserted or updated — both report changes: 1.
      const priorKeys = existing
        ? new Set(listTerms.all(conceptId).map((r) => `${r.lang} ${r.text}`))
        : new Set();

      const seen = new Set();
      const keep = new Set();
      for (const t of terms) {
        const key = `${t.lang} ${t.text}`;
        if (seen.has(key)) continue; // the API can repeat a form as its own synonym
        seen.add(key);
        if (priorKeys.has(key)) stats.updatedTerms++;
        insTerm.run(conceptId, t.lang, t.text, t.rank, t.source);
        keep.add(key);
        stats.terms++;
        stats.byLang[t.lang]++;
      }

      // ⚠️ Prune ONLY what actually disappeared upstream. The previous code
      // deleted every term of the concept and re-inserted with fresh
      // AUTOINCREMENT ids, and book_concept_preference.term_id is
      // ON DELETE CASCADE — so a routine re-import silently destroyed every
      // editor preference for the collection, with no count and no warning.
      // (Register §C36 finding 1.) A preference pointing at a term Árnastofnun
      // has WITHDRAWN should still go; that is reported, not silent.
      if (existing) {
        for (const row of listTerms.all(conceptId)) {
          if (keep.has(`${row.lang} ${row.text}`)) continue;
          // Count BEFORE deleting, and delete the preference EXPLICITLY. Relying
          // on ON DELETE CASCADE would be correct only under
          // PRAGMA foreign_keys = ON, which no production connection sets — the
          // row would otherwise survive pointing at a term that no longer exists.
          stats.preferencesDropped += countPrefs.get(row.id).c;
          delPrefs.run(row.id);
          delTerm.run(row.id);
          stats.prunedTerms++;
        }
      }
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/__tests__/importConcepts.test.js server/__tests__/conceptImportReport.test.js`
Expected: PASS.

- [ ] **Step 5: Mutation control — prove the prune accounting is observed**

Temporarily change `stats.preferencesDropped += countPrefs.get(row.id).c;` to
`stats.preferencesDropped += 0;` and re-run.
Expected: FAIL on "prunes a term withdrawn upstream, and REPORTS the preference it cost".
**Revert.** Then temporarily restore the old behaviour (`DELETE FROM concept_term WHERE
concept_id = ?` before the loop) and re-run: expected FAIL on both the preference-survival and
the id-stability cases. **Revert.**

- [ ] **Step 6: Commit**

```bash
git add server/scripts/import-concepts.js server/__tests__/importConcepts.test.js
git commit -m "fix(terminology): re-import keeps editor preferences, and accounts for what it prunes

DELETE-then-INSERT gave every term a fresh AUTOINCREMENT id, and
book_concept_preference.term_id is ON DELETE CASCADE — so re-importing a
collection to pick up an Arnastofnun update silently destroyed every editor
preference for its concepts, with no count in the returned stats
(register C36 finding 1).

Now upserts on the natural key UNIQUE(concept_id, lang, text), so surviving
terms keep their ids, and prunes only terms absent from the payload. A
preference pointing at a WITHDRAWN term still goes — but it is counted and
reported, not silent."
```

---

### Task 3: The import has a driver, and it is fail-loud

Register finding 6: neither `server/scripts/run-concept-import.js` nor
`verify-concept-import.js` has a `require.main === module` block, unlike
`server/scripts/export-terminology.js:978`. The evidence file says "re-measure rather than
trusting these numbers later" — but the driver that produced them is not in the repo.

**Files:**
- Modify: `server/scripts/run-concept-import.js` (append a CLI block; do not change `runImport` or `formatImportReport`)
- Modify: `server/scripts/verify-concept-import.js` (append a CLI block)
- Test: `server/__tests__/conceptImportCli.test.js`

**Interfaces:**
- Consumes: `runImport(db, dir)` and `formatImportReport(statsList)` from
  `run-concept-import.js`; `verifyConceptImport(db)` from `verify-concept-import.js`.
- Produces: `parseImportArgs(argv)` → `{ dir, db, allowZeroYield, help, error }` and
  `parseVerifyArgs(argv)` → `{ db, help, error }`, both exported for test. Exit codes:
  **0** success · **1** a run-time failure or a refused yield · **2** a usage error.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/conceptImportCli.test.js`:

```js
// server/__tests__/conceptImportCli.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { parseImportArgs } = require('../scripts/run-concept-import');
const { parseVerifyArgs } = require('../scripts/verify-concept-import');

describe('parseImportArgs fails loud', () => {
  it('accepts the documented flags', () => {
    expect(parseImportArgs(['--dir', '/tmp/raw', '--db', '/tmp/x.db'])).toEqual({
      dir: '/tmp/raw',
      db: '/tmp/x.db',
      allowZeroYield: false,
      help: false,
      error: null,
    });
  });

  it('REJECTS an unknown flag instead of ignoring it', () => {
    const r = parseImportArgs(['--dir', '/tmp/raw', '--output-dir', '/tmp/scratch']);
    expect(r.error).toMatch(/--output-dir/);
  });

  it('rejects --dir with no value', () => {
    expect(parseImportArgs(['--dir']).error).toMatch(/--dir requires a value/);
  });

  it('rejects an empty --dir', () => {
    expect(parseImportArgs(['--dir', '   ']).error).toMatch(/non-empty/);
  });

  it('requires --dir', () => {
    expect(parseImportArgs([]).error).toMatch(/--dir is required/);
  });

  it('accepts --allow-zero-yield', () => {
    expect(parseImportArgs(['--dir', '/tmp/raw', '--allow-zero-yield']).allowZeroYield).toBe(
      true
    );
  });
});

describe('parseVerifyArgs fails loud', () => {
  it('defaults db to null so the caller resolves it', () => {
    expect(parseVerifyArgs([])).toEqual({ db: null, help: false, error: null });
  });

  it('REJECTS an unknown flag', () => {
    expect(parseVerifyArgs(['--verbose']).error).toMatch(/--verbose/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/conceptImportCli.test.js`
Expected: FAIL — `parseImportArgs is not a function`.

- [ ] **Step 3: Add the two CLI blocks**

⚠️ Do **not** use `tools/lib/parseArgs.js`: it silently drops unknown flags, which is how a
"safe rehearsal into a scratch directory" becomes a full-strength run. These parsers return an
`error` string for anything they do not recognise, following
`server/scripts/export-terminology.js`'s shape.

In `server/scripts/run-concept-import.js`, before the existing `module.exports`:

```js
function parseImportArgs(argv) {
  let dir = null;
  let db = null;
  let allowZeroYield = false;
  let help = false;
  const need = (flag, raw) => {
    if (raw === undefined) return `${flag} requires a value`;
    if (String(raw).trim() === '')
      return `${flag} requires a non-empty value — got ${JSON.stringify(raw)}`;
    return null;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir' || a === '--db') {
      const err = need(a, argv[i + 1]);
      if (err) return { dir, db, allowZeroYield, help, error: err };
      if (a === '--dir') dir = argv[i + 1].trim();
      else db = argv[i + 1].trim();
      i++;
    } else if (a === '--allow-zero-yield') {
      allowZeroYield = true;
    } else if (a === '-h' || a === '--help') {
      help = true;
    } else {
      return {
        dir,
        db,
        allowZeroYield,
        help,
        error:
          `unrecognised argument '${a}' — accepted: --dir <path>, --db <path>, ` +
          `--allow-zero-yield, -h/--help (values are the NEXT argument, not --dir=<path>)`,
      };
    }
  }
  if (!help && dir === null) {
    return { dir, db, allowZeroYield, help, error: '--dir is required (a directory of raw-<COLLECTION>.json files)' };
  }
  return { dir, db, allowZeroYield, help, error: null };
}

const USAGE = `Usage: node server/scripts/run-concept-import.js --dir <path> [--db <path>] [--allow-zero-yield]

  --dir <path>          directory of raw-<COLLECTION>.json files from
                        tools/fetch_idordabanki.py --mode fetch-raw
  --db <path>           SQLite database (default: SESSIONS_DB_PATH, else
                        pipeline-output/sessions.db)
  --allow-zero-yield    do not refuse when a collection imports 0 concepts
  -h, --help            this message

Exit codes: 0 ok  ·  1 import failed or a collection yielded nothing  ·  2 usage error`;

function main(argv = process.argv.slice(2)) {
  const args = parseImportArgs(argv);
  if (args.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.error) {
    console.error(`error: ${args.error}\n\n${USAGE}`);
    return 2;
  }
  const Database = require('better-sqlite3');
  const resolveDbPath = require('../lib/dbPath');
  const dbPath = args.db || resolveDbPath();
  const db = new Database(dbPath);
  try {
    const stats = runImport(db, args.dir);
    console.log(formatImportReport(stats));
    const zero = stats.filter((s) => s.imported === 0).map((s) => s.collection);
    if (zero.length && !args.allowZeroYield) {
      console.error(
        `\nREFUSED: ${zero.length} collection(s) imported 0 concepts — ${zero.join(', ')}.\n` +
          `A collection that contributes nothing must not silently bulk out the editor's ` +
          `search. Investigate, or pass --allow-zero-yield to accept it deliberately.`
      );
      return 1;
    }
    return 0;
  } finally {
    db.close();
  }
}

if (require.main === module) {
  process.exitCode = main();
}
```

and extend the export line to `module.exports = { formatImportReport, runImport, parseImportArgs, main };`

In `server/scripts/verify-concept-import.js`, before its `module.exports`:

```js
function parseVerifyArgs(argv) {
  let db = null;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--db') {
      const raw = argv[i + 1];
      if (raw === undefined) return { db, help, error: '--db requires a value' };
      if (String(raw).trim() === '')
        return { db, help, error: `--db requires a non-empty value — got ${JSON.stringify(raw)}` };
      db = raw.trim();
      i++;
    } else if (a === '-h' || a === '--help') {
      help = true;
    } else {
      return {
        db,
        help,
        error: `unrecognised argument '${a}' — accepted: --db <path>, -h/--help`,
      };
    }
  }
  return { db, help, error: null };
}

const VERIFY_USAGE = `Usage: node server/scripts/verify-concept-import.js [--db <path>]

Read-only. Opens no transaction and writes no row; safe against a live database.

Exit codes: 0 all checks passed  ·  1 a check failed  ·  2 usage error`;

function main(argv = process.argv.slice(2)) {
  const args = parseVerifyArgs(argv);
  if (args.help) {
    console.log(VERIFY_USAGE);
    return 0;
  }
  if (args.error) {
    console.error(`error: ${args.error}\n\n${VERIFY_USAGE}`);
    return 2;
  }
  const Database = require('better-sqlite3');
  const resolveDbPath = require('../lib/dbPath');
  const db = new Database(args.db || resolveDbPath(), { readonly: true });
  try {
    const { ok, checks } = verifyConceptImport(db);
    const concepts = db.prepare('SELECT COUNT(*) c FROM concept').get().c;
    const terms = db.prepare('SELECT COUNT(*) c FROM concept_term').get().c;
    console.log(
      `VERIFY: ${ok ? 'PASS' : 'FAIL'}   [yield: ${concepts} concepts, ${terms} terms]`
    );
    for (const c of checks) console.log(`  ${c.ok ? '✓' : '✗'} ${c.name} — ${c.detail}`);
    return ok ? 0 : 1;
  } finally {
    db.close();
  }
}

if (require.main === module) {
  process.exitCode = main();
}
```

and extend its export line to `module.exports = { verifyConceptImport, DOMAINS, parseVerifyArgs, main };`

- [ ] **Step 4: Run the tests**

Run: `npx vitest run server/__tests__/conceptImportCli.test.js server/__tests__/verifyConceptImport.test.js server/__tests__/conceptImportReport.test.js`
Expected: PASS.

- [ ] **Step 5: Prove the entry point actually runs**

```bash
node server/scripts/run-concept-import.js --help; echo "exit=$?"
node server/scripts/run-concept-import.js --output-dir /tmp/scratch; echo "exit=$?"
node server/scripts/verify-concept-import.js --help; echo "exit=$?"
```
Expected: `exit=0` for both `--help`; `exit=2` for the unknown flag, with the flag named in the
error. **The second command is the control** — under `tools/lib/parseArgs.js` it would have
exited 0 and run at full strength with its defaults.

- [ ] **Step 6: Commit**

```bash
git add server/scripts/run-concept-import.js server/scripts/verify-concept-import.js server/__tests__/conceptImportCli.test.js
git commit -m "feat(terminology): give the concept import and its verifier a fail-loud CLI

Neither script had a require.main block (register C36 finding 6), so the
driver that produced the measured yield in test-results/concept-import-2026-08.md
was not in the repo — while the file itself says to re-measure rather than
trust those numbers.

Parsers reject unknown flags rather than dropping them: tools/lib/parseArgs.js
silently ignores what it does not declare, which is how a rehearsal into a
scratch directory becomes a full-strength run over the real tree."
```

---

### Task 4: A collection that yields nothing is refused, not merely printed

Register finding 8: `model-is-non-empty` is corpus-wide, so a single collection yielding zero
still passes. Per-collection yield is computed by `runImport` and printed by
`formatImportReport`'s `ZERO YIELD` flag — never gated.

Task 3 put the gate in `main()`. This task pins it with a test that drives the gate directly,
so the refusal cannot be silently removed.

**Files:**
- Test: `server/__tests__/conceptImportCli.test.js` (extend)

**Interfaces:**
- Consumes: `main(argv)` from `run-concept-import.js` (Task 3), which returns an exit code
  rather than calling `process.exit`, precisely so it is testable.

- [ ] **Step 1: Write the failing test**

Append to `server/__tests__/conceptImportCli.test.js`:

```js
// appended to server/__tests__/conceptImportCli.test.js — the imports at the
// top of the file already provide `require`; add these beside them.
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { main: importMain } = require('../scripts/run-concept-import');
const migration045 = require('../migrations/045-concept-model');

function rawDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'concept-raw-'));
  for (const [name, body] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, name), JSON.stringify(body));
  }
  return dir;
}

function tmpDb() {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'concept-db-')), 'x.db');
  const db = new Database(p);
  db.exec('CREATE TABLE registered_books (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE);');
  migration045.up(db);
  db.close();
  return p;
}

describe('a zero-yield collection is REFUSED', () => {
  const good = {
    collection: 'EFNAFR',
    entries: [
      {
        id: 1,
        words: [
          { fklanguage: 'EN', word: 'atom' },
          { fklanguage: 'IS', word: 'frumeind' },
        ],
      },
    ],
  };
  const empty = { collection: 'GEIMVISINDI', entries: [] };

  it('exits 0 when every collection yields', () => {
    const code = importMain(['--dir', rawDir({ 'raw-EFNAFR.json': good }), '--db', tmpDb()]);
    expect(code).toBe(0);
  });

  it('exits 1 and names the collection when one yields nothing', () => {
    const code = importMain([
      '--dir',
      rawDir({ 'raw-EFNAFR.json': good, 'raw-GEIMVISINDI.json': empty }),
      '--db',
      tmpDb(),
    ]);
    expect(code).toBe(1);
  });

  it('exits 0 when the zero yield is accepted deliberately', () => {
    const code = importMain([
      '--dir',
      rawDir({ 'raw-EFNAFR.json': good, 'raw-GEIMVISINDI.json': empty }),
      '--db',
      tmpDb(),
      '--allow-zero-yield',
    ]);
    expect(code).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

If Task 3 is already committed these pass immediately — **that is not acceptable as written**.
Confirm the gate is observed by temporarily deleting the `if (zero.length && !args.allowZeroYield)`
block from `main()` and re-running.
Expected: FAIL on "exits 1 and names the collection when one yields nothing".
**Restore the block.**

- [ ] **Step 3: Run the tests**

Run: `npx vitest run server/__tests__/conceptImportCli.test.js`
Expected: PASS, all three cases.

- [ ] **Step 4: Commit**

```bash
git add server/__tests__/conceptImportCli.test.js
git commit -m "test(terminology): pin the zero-yield refusal

Per-collection yield was computed and printed but never gated
(register C36 finding 8), and the corpus-wide model-is-non-empty check
passes with a collection at zero. The refusal is now driven end to end
through main(), and the mutation that removes it turns this red."
```

---

### Task 5: Migration 047 — a removed domain stops voting

Register findings 2 and 3, which the register calls "one coin". `migrationRunner` calls every
migration's `up()` unconditionally on every start, so `046`'s `INSERT OR REPLACE` is repeated
*enforcement*, not a one-time seed. Two consequences: shortening a book's domain list never
deletes the orphaned rows, so a domain deliberately removed keeps its `position` and keeps
influencing every `ORDER BY position` consumer.

**Measured 2026-08-08: nothing writes `book_domain_priority` except migration 046 and tests** —
no route, no service, no admin control. So the every-boot re-assert is correct today, and this
task fixes only the orphan half. **Whether the table becomes user-writable is a lead decision
recorded for Part C**; if it ever does, the every-boot `up()` must be revisited, because it
would silently revert an editorial reorder.

`046` is shipped and is **not** edited. `047` is the live owner going forward and reads
`BOOK_DOMAIN_PRIORITY` from Task 1's `server/lib/domains.js`.

**Files:**
- Create: `server/migrations/047-reconcile-domain-priority.js`
- Modify: `server/services/migrationRunner.js` (register 047 after 046)
- Modify: `server/__tests__/startup.test.js:70,77,80,90` (46 → 47)
- Create: `server/__tests__/migration047.test.js`
- Create: `server/__tests__/migrationsRealTree.test.js`
- Modify: `server/__tests__/migration046.test.js` (comment only — see Step 6)

**Interfaces:**
- Consumes: `BOOK_DOMAIN_PRIORITY` from `server/lib/domains.js` (Task 1).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/migration047.test.js`:

```js
// server/__tests__/migration047.test.js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
const migration045 = require('../migrations/045-concept-model');
const migration047 = require('../migrations/047-reconcile-domain-priority');
const { BOOK_DOMAIN_PRIORITY } = require('../lib/domains');

let db;
beforeEach(() => {
  db = new Database(':memory:');
  db.exec('CREATE TABLE registered_books (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE);');
  migration045.up(db);
});
afterEach(() => db.close());

describe('migration 047 reconciles book_domain_priority', () => {
  it('seeds a registered book with its ordered domains', () => {
    db.prepare('INSERT INTO registered_books (id, slug) VALUES (1, ?)').run('efnafraedi-2e');
    migration047.up(db);
    const got = db
      .prepare('SELECT domain FROM book_domain_priority WHERE book_id=1 ORDER BY position')
      .all()
      .map((r) => r.domain);
    expect(got).toEqual([...BOOK_DOMAIN_PRIORITY['efnafraedi-2e']]);
  });

  it('DELETES an orphaned domain that is no longer in the map', () => {
    db.prepare('INSERT INTO registered_books (id, slug) VALUES (1, ?)').run('efnafraedi-2e');
    db.prepare(
      'INSERT INTO book_domain_priority (book_id, domain, position) VALUES (1, ?, ?)'
    ).run('astronomy', 99);

    migration047.up(db);

    const domains = db
      .prepare('SELECT domain FROM book_domain_priority WHERE book_id=1')
      .all()
      .map((r) => r.domain);
    expect(domains).not.toContain('astronomy');
    expect(domains.sort()).toEqual([...BOOK_DOMAIN_PRIORITY['efnafraedi-2e']].sort());
  });

  it('is idempotent across repeated boots', () => {
    db.prepare('INSERT INTO registered_books (id, slug) VALUES (1, ?)').run('efnafraedi-2e');
    migration047.up(db);
    const first = db
      .prepare('SELECT domain, position FROM book_domain_priority ORDER BY position')
      .all();
    migration047.up(db);
    migration047.up(db);
    const third = db
      .prepare('SELECT domain, position FROM book_domain_priority ORDER BY position')
      .all();
    expect(third).toEqual(first);
  });

  it('leaves a book that is not registered on this box alone', () => {
    migration047.up(db);
    expect(db.prepare('SELECT COUNT(*) c FROM book_domain_priority').get().c).toBe(0);
  });

  it('does not touch another book while reconciling one', () => {
    db.prepare('INSERT INTO registered_books (id, slug) VALUES (1, ?)').run('efnafraedi-2e');
    db.prepare('INSERT INTO registered_books (id, slug) VALUES (2, ?)').run('stjornufraedi');
    migration047.up(db);
    const n = db.prepare('SELECT COUNT(*) c FROM book_domain_priority WHERE book_id=2').get().c;
    expect(n).toBe(BOOK_DOMAIN_PRIORITY['stjornufraedi'].length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/__tests__/migration047.test.js`
Expected: FAIL — `Cannot find module '../migrations/047-reconcile-domain-priority'`.

- [ ] **Step 3: Write migration 047**

Create `server/migrations/047-reconcile-domain-priority.js`:

```js
/**
 * Migration 047: reconcile each book's domain fallback order.
 *
 * ⚠️ THIS IS ENFORCEMENT, NOT A ONE-TIME SEED — and that is deliberate.
 * `migrationRunner` calls every migration's `up()` unconditionally on every
 * server start (there is no applied-migrations gate for the modern pattern),
 * so this runs on every boot. Migration 046 exploited that with
 * INSERT OR REPLACE, which keeps existing rows correct but can never REMOVE
 * one: shortening a book's list left the dropped domain sitting at its old
 * `position`, still voting in every ORDER BY position consumer, forever.
 * (Register §C36 finding 2.)
 *
 * Deleting the book's rows before re-inserting fixes that, and stays
 * idempotent.
 *
 * ⚠️ 046 IS SHIPPED AND IS NOT EDITED — migrations are append-only. 046 still
 * runs first on every boot; 047 runs after it and wins. The priority map now
 * lives in server/lib/domains.js so it has one owner (finding 5).
 *
 * ⚠️ MEASURED 2026-08-08: nothing writes book_domain_priority except migration
 * 046 and tests — no route, no service, no admin control. The every-boot
 * re-assert is therefore correct today. **If the table is ever made
 * user-writable, this must be revisited**, because the same repeated execution
 * that removes an orphan would silently revert an editorial reorder. Whether
 * that happens is a Part C decision, recorded in the register, not here.
 *
 * ⚠️ A book absent from registered_books is skipped, not an error — and on a
 * FRESH CLONE that is most of them. Measured against a database built by
 * running every migration against an empty file: only `lifraen-efnafraedi` and
 * `edlisfraedi-2e` are registered, because `019-register-new-books.js` omits
 * the NOT NULL `registered_by` column that `003` declares and INSERT OR IGNORE
 * silently discards its two rows (§C35), while `029` supplies it and succeeds.
 * `efnafraedi-2e` and `stjornufraedi` are registered by no migration at all.
 * They pick up their rows on the next boot after the admin route registers
 * them. Fixing §C35 is a separate item; see migrationsRealTree.test.js, which
 * makes the state visible rather than asserting a fixture back to itself.
 */
const { BOOK_DOMAIN_PRIORITY } = require('../lib/domains');

module.exports = {
  name: '047-reconcile-domain-priority',

  up(db) {
    const book = db.prepare('SELECT id FROM registered_books WHERE slug = ?');
    const clear = db.prepare('DELETE FROM book_domain_priority WHERE book_id = ?');
    const ins = db.prepare(
      'INSERT INTO book_domain_priority (book_id, domain, position) VALUES (?,?,?)'
    );
    const run = db.transaction(() => {
      for (const [slug, domains] of Object.entries(BOOK_DOMAIN_PRIORITY)) {
        const row = book.get(slug);
        if (!row) continue; // a book not registered on this box is not an error
        clear.run(row.id);
        domains.forEach((domain, i) => ins.run(row.id, domain, i + 1));
      }
    });
    run();
  },
};
```

- [ ] **Step 4: Register it and bump the pins**

In `server/services/migrationRunner.js`, add immediately after the `046` entry:

```js
    require('../migrations/047-reconcile-domain-priority'),
```

In `server/__tests__/startup.test.js`, change `46` → `47` at **every** occurrence. Derive them
rather than trusting this list — `grep -n '46' server/__tests__/startup.test.js` — which as of
2026-08-08 returns seven: the test title `:70`, the comment `:76`,
`expect(files.length).toBe(46)` `:77`, the "sequential numbering" comment `:79`, the loop bound
`:80`, the second test's title `:87`, and its loop bound `:90`. Update the `:76` comment to read
`// 47 as of migration 047-reconcile-domain-priority (bumped from 46).`

Then re-run the grep and confirm it returns **nothing**. A leftover `46` in a loop bound leaves a
test that passes while checking one migration too few.

- [ ] **Step 5: Add the real-tree assertion (spec §10)**

Create `server/__tests__/migrationsRealTree.test.js`:

```js
// server/__tests__/migrationsRealTree.test.js
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { BOOK_DOMAIN_PRIORITY, DOMAIN_SET } = require('../lib/domains');

/**
 * ⚠️ Built by running EVERY migration against an EMPTY database — not by seeding
 * a fixture. migration046.test.js seeds registered_books with exactly the slugs
 * the priority map contains, so its "a book scoped to nothing is the bug"
 * assertion is self-fulfilling: the fixture IS the map (register §C36 finding 3).
 *
 * ⚠️ Deliberately does NOT call runAllMigrations(). That function takes no db
 * argument — it resolves DB_PATH at module load from resolveDbPath(), so driving
 * it requires setting process.env.SESSIONS_DB_PATH before the require and never
 * restoring it. With vitest's fileParallelism disabled, that is exactly the
 * shared-state mutation CLAUDE.md warns can affect later files. Requiring the
 * migration modules directly is deterministic and touches no global.
 */
function freshDb() {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-clone-')), 'sessions.db');
  const db = new Database(p);
  const dir = path.join(__dirname, '..', 'migrations');
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
  return { db, errors, applied: files.length };
}

describe('the migration set applies cleanly to an empty database', () => {
  it('reports no errors', () => {
    const { db, errors } = freshDb();
    expect(errors).toEqual([]);
    db.close();
  });
});

describe('a fresh clone, built by the migrations themselves', () => {
  it('gives every REGISTERED book a domain priority row', () => {
    const { db } = freshDb();
    const registered = db.prepare('SELECT id, slug FROM registered_books').all();
    const scopedToNothing = registered
      .filter(
        (b) =>
          BOOK_DOMAIN_PRIORITY[b.slug] &&
          db.prepare('SELECT COUNT(*) c FROM book_domain_priority WHERE book_id=?').get(b.id)
            .c === 0
      )
      .map((b) => b.slug);
    expect(scopedToNothing).toEqual([]);
    db.close();
  });

  it('records which mapped books a fresh clone does NOT register', () => {
    const { db } = freshDb();
    const slugs = new Set(db.prepare('SELECT slug FROM registered_books').all().map((r) => r.slug));
    const absent = Object.keys(BOOK_DOMAIN_PRIORITY).filter((s) => !slugs.has(s));
    // NOT an assertion that this is correct — it is NOT. §C35: migration 019
    // omits the NOT NULL registered_by column and INSERT OR IGNORE swallows its
    // two rows; efnafraedi-2e and stjornufraedi are registered by no migration.
    // Pinned so that FIXING §C35 turns this red and forces the list to be
    // updated deliberately, rather than the improvement passing unnoticed.
    expect(absent.sort()).toEqual(
      ['efnafraedi-2e', 'liffraedi-2e', 'orverufraedi', 'stjornufraedi'].sort()
    );
    db.close();
  });

  it('every seeded domain is one of the seven', () => {
    const { db } = freshDb();
    const bad = db
      .prepare('SELECT DISTINCT domain FROM book_domain_priority')
      .all()
      .map((r) => r.domain)
      .filter((d) => !DOMAIN_SET.has(d));
    expect(bad).toEqual([]);
    db.close();
  });

  it('positions are dense and start at 1 for every book that has any', () => {
    const { db } = freshDb();
    for (const b of db.prepare('SELECT DISTINCT book_id FROM book_domain_priority').all()) {
      const pos = db
        .prepare('SELECT position FROM book_domain_priority WHERE book_id=? ORDER BY position')
        .all(b.book_id)
        .map((r) => r.position);
      expect(pos).toEqual(pos.map((_, i) => i + 1));
    }
    db.close();
  });
});
```

⚠️ **The second test's expected list is a pin on a KNOWN-BROKEN state, not an endorsement.**
If it goes red because a fresh clone now registers more books, that is §C35 being fixed —
read the diff, confirm that is what happened, and update the list deliberately. Do not
regenerate it.

⚠️ If `freshDb()`'s `errors` array comes back non-empty on the first run, **stop and read them
before changing this test.** `runAllMigrations` catches per-migration errors and reports them;
this helper mirrors that. A migration that throws on an empty database is a finding, and
`server/__tests__/migrationIdempotency.test.js` asserts the set is clean — so a non-empty
`errors` here means the two disagree, which is itself worth reporting.

- [ ] **Step 6: Note the self-fulfilling test rather than deleting it**

In `server/__tests__/migration046.test.js`, above the "book scoped to nothing" test, add:

```js
  // ⚠️ This fixture seeds registered_books with exactly the slugs PRIORITIES
  // contains, so the fixture IS the map and this assertion cannot detect the
  // bug it names (register §C36 finding 3). It is kept because it still pins
  // 046's ordering behaviour. The real-tree assertion lives in
  // migrationsRealTree.test.js.
```

- [ ] **Step 7: Run the tests**

Run: `npx vitest run server/__tests__/migration047.test.js server/__tests__/migrationsRealTree.test.js server/__tests__/migration046.test.js server/__tests__/startup.test.js`
Expected: PASS.

- [ ] **Step 8: Mutation control**

Temporarily remove `clear.run(row.id);` from 047 and re-run `migration047.test.js`.
Expected: FAIL on "DELETES an orphaned domain that is no longer in the map". **Restore it.**

- [ ] **Step 9: Full suite, from the repo root**

Run: `npm test`
Expected: PASS. This is the authoritative gate — there is no branch protection on this repo, so
a local green root `npm test` is what decides. Note the baseline before this branch: **282 files
/ 4,076 tests**; the count must go up, not sideways.

- [ ] **Step 10: Commit**

```bash
git add server/migrations/047-reconcile-domain-priority.js server/services/migrationRunner.js server/__tests__/startup.test.js server/__tests__/migration047.test.js server/__tests__/migrationsRealTree.test.js server/__tests__/migration046.test.js
git commit -m "fix(terminology): migration 047 — a removed domain stops voting

migrationRunner runs every migration's up() on every boot, so 046's
INSERT OR REPLACE is enforcement rather than a seed — and it can never
REMOVE a row. A domain dropped from a book's list kept its position and
kept influencing every ORDER BY position consumer (register C36 finding 2).
047 deletes before re-inserting, and stays idempotent.

046 is shipped and is not edited; the priority map now has one owner in
server/lib/domains.js.

Adds the real-tree assertion spec §10 asks for. migration046.test.js's
'scoped to nothing' test seeds the fixture from the map itself, so it is
self-fulfilling and cannot see the bug it names (finding 3); the new test
builds a database by running every migration against an empty file, and
pins which books a fresh clone does NOT register — so fixing §C35 turns
it red rather than passing unnoticed."
```

---

## Self-review

**Spec coverage.** This plan covers register §C36 findings 1, 2, 3, 5, 6 and 8, and spec §10's
real-tree assertion. Findings 4 and 7 are named in *Non-goals* with the reason. Nothing in spec
§6 (`resolve()`), §7 (consumers) or §9 steps 1/3/4/5 is touched — that is Part B, deliberately.

**Type consistency.** `stats` gains exactly `updatedTerms`, `prunedTerms`, `preferencesDropped`
(Task 2) and Task 3's `main()` reads only `imported` and `collection`, which Part A already
provides. `parseImportArgs` returns `{dir, db, allowZeroYield, help, error}` in both its
definition and its tests. `BOOK_DOMAIN_PRIORITY` is the name in `domains.js`, in migration 047
and in both new test files; `PRIORITIES` remains only inside shipped migration 046, untouched.

**Known risk this plan does NOT close.** Task 2's upsert makes term ids stable across
re-import, but a **clean rebuild** — which spec §85 and §337 call the population method — drops
concepts, and `book_concept_preference.concept_id` has its own `ON DELETE CASCADE`. So
preferences still do not survive a rebuild, only a re-import. That is correct for now
(`book_concept_preference` is 0 rows on production, measured 2026-08-08) and is recorded for
Part B, where a rebuild-stable preference key is a schema question.
