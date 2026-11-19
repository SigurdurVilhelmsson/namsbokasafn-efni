# Book glossary layer, stage 1: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** chemistry gets a book-scoped glossary layer (exclusions and book entries) that the concept resolver reads,
and c19's 133 changing rulings plus §C234 ⑧ are ready to load into it on production.

**Architecture:**
- **Storage:** three new tables, from migration 058.
- **Write side:** a write API in `server/lib/bookGlossaryLayer.js` and a read side in `server/lib/conceptResolver.js`.
  `buildScope` loads the layer, and `resolveCandidates` applies it before the domain walk.
- **Export:** it inherits the layer through `resolve`, and also writes `books/<book>/glossary/book-glossary.json`,
  which the existing cron commits.
- **c19:** a committed input file, built from the private rulings, is loaded by a dry-run-by-default script.

**Tech stack:** Node 22, CommonJS under `server/`, ESM under `tools/`, better-sqlite3, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-19-book-glossary-layer-design.md` (approved 2026-11-19; read §5 and §7).

## Global constraints

**Data and naming**
- Book: `efnafraedi-2e`.
- Concept source and collection for book entries: `'book-layer'` (constant `BOOK_LAYER_SOURCE`).
- Exclusion `concept_id` sentinel `0` means the whole headword.
- **Match key** (spec §5.1): `isSymbolShaped(english)` (`server/lib/conceptMatcher.js`) keeps the exact text;
  otherwise `nocaseKey(english)` (`server/lib/conceptResolver.js`). Never `toLowerCase()`.

**Migrations**
- The migration never throws (057's shape: `up()` is only a try/catch around `migrate(db)`).
- No foreign keys; idempotent DDL.
- Add it to `server/services/migrationRunner.js`'s require list.

**Code rules from CLAUDE.md**
- Resolve paths with `__dirname` / `resolveDbPath()`, never `process.cwd()`.
- Never `process.exit()` after a stdout write; use `process.exitCode`.
- Use `grep -a` for every search.
- Test files use `import` for vitest and `createRequire(import.meta.url)` for server modules (header as in
  `server/__tests__/conceptResolverScope.test.js`).
- Use `server/__tests__/helpers/freshMigratedDb.js` for databases.

**Working rules**
- Run only the touched test files plus `npx eslint` and `npx prettier --check` on changed files.
- Stage named paths only. Never stage `.claude/settings.json`.
- Commits end with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_019eLWwZWWezCFcVGDj2AzQe`.
- The private files under `~/c19-prescreen-2026-11-18/` are read only by Task 5's join, and only its output is
  committed.

**c19 counts, from the rulings snapshot (sha256 `de83082d1381eaa4a4de0427707efeb45c2b2d959978c3365104d098b02f3ce9`)**

| Choice | Count |
|---|---|
| `remove` + `SKILYRÐI:` | 107 |
| `remove` + `AÐEINS` | 7 |
| `remove` with no prefix (`r032 ATP`) | 1 |
| `replace` | 16 |
| `phrases` (`r1104`, `r769`) | 2 |
| `keep` | 79 |

## Review focus

1. **A capitalised census string** (`Function` beside `function`) must be excluded by a word's exclusion. A symbol
   (`SI` vs `Si`) must not be. → Task 3.
2. **An excluded compound must not swallow the words inside it** in the editor. → Task 3.
3. **A book entry must never reach another book:** not in the physics book's export, not in its editor. → Task 3.
4. **A rerun of the loader** must write nothing new and must report `already`, never duplicate. → Task 6.
5. **The dry run must leave production's database byte-identical.** Writes go only to an in-memory copy.
   → Task 6.

---

### Task 1: Migration 058, the layer's tables

**Files:**
- Create: `server/migrations/058-book-glossary-layer.js`
- Modify: `server/services/migrationRunner.js` (add the require after `057-suggestion-view`)
- Test: `server/__tests__/bookGlossaryMigration.test.js`

**Interfaces:**
- Produces three tables, exactly:

```sql
CREATE TABLE IF NOT EXISTS book_glossary_exclusion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  english TEXT NOT NULL,
  match_key TEXT NOT NULL,
  concept_id INTEGER NOT NULL DEFAULT 0 CHECK (concept_id >= 0),
  idordabanki_id INTEGER,
  icelandic TEXT,
  reason TEXT NOT NULL, source TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  UNIQUE (book_id, match_key, concept_id)
);
CREATE TABLE IF NOT EXISTS book_glossary_entry (
  concept_id INTEGER PRIMARY KEY,
  book_id INTEGER NOT NULL,
  reason TEXT NOT NULL, source TEXT NOT NULL,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL,
  updated_by TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_book_glossary_entry_book ON book_glossary_entry(book_id);
CREATE TABLE IF NOT EXISTS book_glossary_change (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL,
  at TEXT NOT NULL, by TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('exclude','unexclude','entry-add','entry-change','entry-remove')),
  english TEXT NOT NULL,
  before_json TEXT, after_json TEXT,
  reason TEXT NOT NULL, source TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_book_glossary_change_book ON book_glossary_change(book_id, id);
```

- [ ] **Step 1: Write the failing tests** in `bookGlossaryMigration.test.js`:
  - `'a fresh migrated DB has the three layer tables with their columns'`: `PRAGMA table_info` column names equal the
    DDL above, for each table.
  - `'running 058 twice changes nothing and throws nothing'`: call `require('../migrations/058-book-glossary-layer').up(db)`
    on a migrated DB; the table count and `sqlite_master` sql are unchanged.
  - `'the exclusion key is unique per (book, match_key, concept_id)'`: a second identical insert throws
    `/UNIQUE/`; the same `match_key` with another `concept_id` succeeds.
  - `'a failing migrate() is caught: up() warns and does not throw'`: pass a closed DB to `up()`; expect no throw
    and one `console.warn` call (spy).
- [ ] **Step 2: Run** `npx vitest run server/__tests__/bookGlossaryMigration.test.js`. Expected: FAIL (no tables).
- [ ] **Step 3: Implement** `058-book-glossary-layer.js` exporting `{ name: '058-book-glossary-layer', up(db) }`,
  with the body in `migrate(db)` inside `db.transaction`, and `up` catching and warning
  `[058] MIGRATION COULD NOT COMPLETE — ... NOT THROWN ON PURPOSE`. Add it to the runner list.
- [ ] **Step 4: Run** the test file, plus `server/__tests__/freshMigratedDb.test.js` and
  `server/__tests__/migrationsRealTree.test.js` if present. Expected: PASS.
- [ ] **Step 5: Commit** `feat(glossary): migration 058, the book glossary layer's tables (c19)`.

### Task 2: The write API

**Files:**
- Create: `server/lib/bookGlossaryLayer.js`
- Modify:
  - `server/lib/conceptResolver.js`: add and export `matchKey(english)`.
  - `server/lib/houseStyleTerms.js`: add `BOOK_LAYER_SOURCE = 'book-layer'`.
    `countImportedConcepts` / `countImportedTerms` exclude both sources: `collection IS NULL OR collection NOT IN
    (?, ?)`, and the same for `source`.
  - `server/scripts/fetch-bin-inflections.js:~239`: its "imported" count excludes both sources.
- Test: `server/__tests__/bookGlossaryWrite.test.js`

**Interfaces:**
- **Consumes:** Task 1's tables.
- **Produces:**
  - `matchKey(english: string): string` (conceptResolver.js).
  - `addExclusion(db, {book, english, conceptId = 0, reason, source, by, at}) → {status: 'added'|'already', id}`.
  - `addEntry(db, {book, english: string[], icelandic, replaces = [], reason, source, by, at}) →
    {status: 'added'|'already', conceptId}`.
  - Both throw `Error` with `code: 'LAYER_REFUSED'` and a one-line message.
  - `at` defaults to `new Date().toISOString()`.
- **Exclusion rows record:** `match_key = matchKey(english)`. When `conceptId > 0`, also that concept's
  `idordabanki_id` and rank-1 Icelandic, at writing.
- **History rows:** every added row writes one `book_glossary_change` row in the same transaction.
  - `exclude`: `after_json = {english, conceptId, idordabankiId}`, with **no Icelandic** (spec §5.4).
  - `entry-add`: `after_json = {english, icelandic, replaces}`.
- **`addEntry`:**
  - Creates `concept(domain = the book's position-1 domain from book_domain_priority, collection =
    BOOK_LAYER_SOURCE, idordabanki_id NULL)`.
  - Then `concept_term` rows: one `lang 'en'` per form, `rank 1`; one `lang 'is'`, `rank 1`; all with
    `source = BOOK_LAYER_SOURCE`.
  - Then a `book_glossary_entry` row.
  - Then, for each `replaces` concept id and each English form that concept carries, an `addExclusion` of that
    concept (spec §5.2 "a replacement hides the word it replaces").
  - All in one transaction.

- [ ] **Step 1: Write the failing tests** in `bookGlossaryWrite.test.js`, on `freshMigratedDb()` with
  `efnafraedi-2e` registered (chain chemistry > physics > biology, as in
  `server/__tests__/findTermsC19ApplyProbe.test.js`):
  - `matchKey`:
    - `matchKey('SI') === 'SI'`
    - `matchKey('Si') === 'Si'`
    - `matchKey('Co') !== matchKey('CO')`
    - `matchKey('Function') === matchKey('function')`
  - `'addExclusion whole headword: one row, concept_id 0, one history row with action exclude'`.
  - `'addExclusion of one concept records its idordabanki_id and Icelandic in the row, not in the history'`:
    `after_json` has no `icelandic` key.
  - `'addExclusion twice returns already and writes no second history row'`.
  - `'addExclusion refuses a concept that does not carry the English'`, with code `LAYER_REFUSED`.
  - `'addExclusion whole headword refuses when a book entry claims the headword'`: `/conflict/`.
  - `'addEntry creates a chemistry-domain book-layer concept with en forms and is term, and an entry row'`, for
    `['standard cell potential','standard cell potentials'] → 'staðalíspenna'`.
  - `'addEntry with replaces also excludes the replaced concept for the headword'`: a physics concept
    `geometry → rúmfræði`; `addEntry(['geometry'], 'lögun', replaces: [physicsId])` leaves an exclusion
    `(geometry, physicsId)`.
  - `'addEntry refuses a form a whole-headword exclusion holds'` and `'addEntry refuses a form with a
    book_term_preference row'`: both `LAYER_REFUSED`, and nothing written (row counts unchanged).
  - `'addEntry identical twice returns already'`; `'addEntry with the same form and other Icelandic refuses'`.
  - `'countImportedConcepts and countImportedTerms do not count book-layer rows'`: counts are unchanged after an
    `addEntry`.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/bookGlossaryWrite.test.js`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the signatures above. To avoid a require cycle, `houseStyleTerms.js` must not require
  `bookGlossaryLayer.js`. `bookGlossaryLayer.js` requires `conceptResolver` (`matchKey`) and `houseStyleTerms`
  (`BOOK_LAYER_SOURCE`).
- [ ] **Step 4: Run** the test file, plus `server/__tests__/houseStyleTerms.test.js`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(glossary): book glossary layer write API — exclusions, book entries, history (c19)`.

### Task 3: The resolver reads the layer

**Files:**
- Modify:
  - `server/lib/conceptResolver.js` (`loadBookLayer`, `buildScope`, `resolveCandidates`).
  - `server/lib/resolvedGlossary.js` (`stats.excludedByBook`).
  - `tools/ai-review/prescreen-population.js:18` (`DECIDED_REASONS` gains `'book-entry'`).
- Test: `server/__tests__/bookGlossaryResolve.test.js`.
- Commit unchanged: `server/__tests__/findTermsC19ApplyProbe.test.js` (the untracked probe; it must still pass).

**Interfaces:**
- **Consumes:** Task 2's `addExclusion`, `addEntry`, `matchKey`.
- **Produces:**
  - `loadBookLayer(db, bookId) → {excludedHeadwords: Set<string>, excludedConcepts: Map<string, Set<number>>,
    bookOwned: Map<number, number>}`, in three queries.
  - `bookOwned` covers **every** book's entries.
  - `buildScope` sets `scope.layer`.
  - A resolution emptied by a whole-headword exclusion carries `bookExcluded: true`.
  - A book-entry winner has `reason: 'book-entry'`.
- **`resolveCandidates` order** (spec §5.2), only when `english != null` and `scope.layer`:
  1. **Whole-headword exclusion.** If `excludedHeadwords.has(key)`, return the empty resolution with
     `bookExcluded: true`. Also push `book-entry-conflict` if an entry of this book carries the headword, and the
     exclusion still wins. `applyPreference` is skipped.
  2. **Drop candidates** owned by another book, and candidates in `excludedConcepts.get(key)`, before the
     partition.
  3. **After the empty-chosen return and before step 4:** if exactly one chosen candidate is owned by this book, it
     wins with `reason 'book-entry'`, the other chosen go to `alsoInScope`, and the result goes through
     `applyPreference`.
  4. Otherwise the walk is unchanged.
- **`resolvedGlossary.js`:** add `excludedByBook: 0` to `stats`, and increment it when
  `r.bookExcluded`.
- **Dangling single-concept exclusions** are not reported per resolve; Task 4's record reports them.

- [ ] **Step 1: Write the failing tests** in `bookGlossaryResolve.test.js`, on `freshMigratedDb()` with
  `efnafraedi-2e` and `edlisfraedi-2e` registered at their `BOOK_DOMAIN_PRIORITY` chains.
  - **Resolver-level** (`buildScope` + `resolve`):
    - `'a whole-headword exclusion empties chemistry and leaves physics unchanged'`: a physics
      `function → fall`. For chemistry: `winner === null`, `outOfScope.length === 0`, `alsoInScope.length === 0`,
      `bookExcluded === true`. For `edlisfraedi-2e`: `winner.text === 'fall'`. This is the control.
    - `'nothing takes over: a biology row for the same headword is not offered'`.
    - `'a word exclusion also excludes its capitalised census string'`: a concept carrying `Function` too.
    - `'SI and Si are independent'`: exclude `SI`; `resolve(scope,'Si').winner.text === 'kísill'`.
    - `'a single-concept exclusion lets the next row take over'`: chemistry `substitution → skiptihvarf` excluded;
      the physics `innsetning` wins.
    - `'a replacement wins and hides the replaced row'`: `addEntry(['geometry'],'lögun', replaces:[physicsId])`
      gives `winner.text === 'lögun'`, `reason === 'book-entry'`, and no `alsoInScope` or `outOfScope` entry with
      text `rúmfræði`.
    - `'a book entry beats a house-style concept at position 1'`: insert a house-style concept for the same
      English.
    - `"another book's entry is invisible"`: an entry for `efnafraedi-2e` does not appear in `edlisfraedi-2e`'s
      resolution.
    - `'an unscoped book is unchanged'`: `resolve` on the `'unregistered'` scope still returns the empty
      resolution with no `bookExcluded`.
  - **Consumer-level, editor** (`terminologyService._setTestDb(db)` + `findTermsInSegments`, as in the probe
    test):
    - `'an excluded compound does not hide the head word inside it'`: exclude `standard cell` (whole headword) with
      `cell potential → kerspenna` present; the segment "the standard cell potential" yields a `cell potential`
      match. Control: before the exclusion, `standard cell` matched.
    - `'a whole-headword exclusion with a fallback-tier row yields no match'`: control, without the exclusion, the
      fallback row is offered.
    - `'a three-word book entry is matched and offered'`: `standard cell potential → staðalíspenna`, matched on
      "standard cell potentials" too (the plural form).
  - **Consumer-level, export** (`buildResolvedGlossary(db, 'efnafraedi-2e', {census})` with a stub census
    `{strings, filesRead: 1, root: 'test'}`):
    - an excluded headword is absent, and `stats.excludedByBook === 1`;
    - a one-word entry's `icelandic` equals the entry;
    - the same census for `edlisfraedi-2e` still carries the physics term (the control).
- [ ] **Step 2: Run** `npx vitest run server/__tests__/bookGlossaryResolve.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement** the Interfaces above.
- [ ] **Step 4: Run** the new file plus the resolver and consumer suites, all of which must stay green:
  - `server/__tests__/conceptResolver*.test.js`
  - `server/__tests__/findTerms*.test.js` (including the probe)
  - `server/__tests__/resolvedGlossary.test.js`
  - `server/__tests__/terminologyService.test.js`
  - `server/__tests__/houseStyleTerms*.test.js`

  Then run `server/scripts/bench-c24.js` (or `bench-resolve.js`) once if it runs locally, and record before/after
  timings in the report: §C24 made this path a known hazard.
- [ ] **Step 5: Commit** `feat(glossary): the resolver applies the book layer — exclusions first, book entry wins (c19)`.
  Stage the probe test in this commit too.

### Task 4: The committed record

**Files:**
- Modify:
  - `server/lib/bookGlossaryLayer.js`: add `buildBookGlossaryRecord`, `writeBookGlossaryRecord` and
    `createBookGlossaryRecordFn`.
  - `server/scripts/export-terminology.js`: add a `recordFn` parameter to `runGlossaryExport`, and a status field.
- Test: `server/__tests__/bookGlossaryRecord.test.js`

**Interfaces:**
- **`buildBookGlossaryRecord(db, bookSlug)`** returns `null` when the book has no row in any of the three tables.
  Otherwise it returns:
  - `{schema: 'book-glossary/1', book, generated, exclusions, entries, history, dangling}`
  - **exclusions:** sorted by `match_key`, then `concept_id`; each `{english, conceptId, idordabankiId, reason,
    source, createdBy, createdAt}`. No Icelandic.
  - **entries:** sorted by first English form; each `{conceptId, english: [...], icelandic, domain, reason, source,
    createdBy, createdAt, updatedBy, updatedAt}`.
  - **history:** all rows by `id`; each `{id, at, by, action, english, before, after, reason, source}`, with the
    JSON parsed.
  - **dangling:** single-concept exclusions whose concept is gone or carries no English term with that match key.
- **`writeBookGlossaryRecord(outDir, record) → 'written'|'unchanged'`**:
  - writes `book-glossary.json` (`JSON.stringify(record, null, 2) + '\n'`);
  - compares with the file on disk ignoring `generated`;
  - writes atomically (`.tmp` + rename).
- **`createBookGlossaryRecordFn(dbPath)`** opens a read-only DB lazily, as `createResolvedExportFn` does.
- **In `runGlossaryExport`:** a new parameter, `recordFn = createBookGlossaryRecordFn()`.
  - In the per-book loop, **before** the glossary gates, it runs whenever `!dryRun`:
    `record = recordFn(b)`, then `writeBookGlossaryRecord(outDir, record)` when not null.
  - The result per book goes to the status file under `bookGlossaryRecords[b]`, as `'written'`, `'unchanged'`,
    `'none'` or `'error: <message>'`.
  - An error is logged with `logError` and does not change the glossary outcome or the exit code.
  - A refused or unchanged `glossary-unified.json` still gets its record written.

- [ ] **Step 1: Write the failing tests** in `bookGlossaryRecord.test.js`:
  - `'no layer rows: buildBookGlossaryRecord returns null and the export writes no file'`.
  - `'the record lists exclusions without Icelandic, entries with Icelandic, and the full history'`.
  - `'history is cumulative: a second export after a new change carries both changes'`.
    This is the regression the builder check found (spec §5.4).
  - `'unchanged content is not rewritten'`: the file's mtime and bytes are unchanged on a second run with no layer
    change, even though `generated` would differ.
  - `'a dangling exclusion is listed'`: delete the excluded concept, rebuild, and it is in `dangling`.
  - `'runGlossaryExport writes the record even when glossary-unified.json is refused'`: inject an `exportFn` that
    triggers a shrink refusal, and a `recordFn` returning a record; the file is written and the status carries
    `bookGlossaryRecords`.
  - `'a recordFn that throws is logged and leaves the glossary outcome unchanged'`.
- [ ] **Step 2: Run** the file. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus `server/__tests__/glossaryExportRun.test.js` and every `server/__tests__/*xport*.test.js`
  that exists. Expected: PASS.
- [ ] **Step 5: Commit** `feat(glossary): the export writes book-glossary.json, the layer's committed record (c19)`.

### Task 5: The c19 input, joined and committed

**Files:**
- Create: `tools/ai-review/prescreen-book-layer-input.js` (ESM)
- Create, as output: `experiments/terminology-consistency/results/2026-11-18/c19-book-layer-input.json`
- Test: `tools/__tests__/prescreen-book-layer-input.test.js`

**Interfaces:**
- **CLI:** `node tools/ai-review/prescreen-book-layer-input.js --rulings <json> --census <json> --verdicts <json> --out <json>`.
- **Export:** `buildInput({rulings, census, verdicts}) → input`, throwing on any refusal.
- **Join:**
  - ruling id `rNNN` → the committed verdicts' `population` row with that `id` (`english`, `icelandic`, `group`);
  - → exactly one private census row with equal `english`, `icelandic` and `domain === group`;
  - → that row's `conceptId` and `ifRemoved`.
- **Refusals:**
  - `rulings.answers` does not hold exactly 212 docs;
  - any changing ruling has zero or more than one census row;
  - a `keep` produces an action;
  - an unknown `choice` or prefix.
- **Output:**
  - Header: `{schema: 'c19-book-layer-input/1', book: 'efnafraedi-2e', rulingsSha256, censusSha256,
    verdictsSha256, counts, actions}`. The hashes are of the input files' bytes.
  - Each action: `{kind: 'exclude-headword'|'exclude-concept'|'entry', rulingId, english, conceptId?,
    icelandicAtCensus?, domainAtCensus?, ifRemovedAtCensus?, entry?: {english: string[], icelandic, replaces:
    number[]}, choice, flagKind, comment, ruledAt}`.
- **Mapping** (spec §5.5, as corrected):

  | Ruling | Action |
  |---|---|
  | `SKILYRÐI` | `exclude-headword` |
  | `AÐEINS` and `r032` | `exclude-concept` |
  | `replace` | `entry` with `replaces: [conceptId]` and `icelandic: text` |
  | `phrases` | `exclude-concept` of the row, plus `entry` with `english: [text]` and `icelandic: phraseIcelandic ?? row icelandic` |

  - A phrase entry is omitted when the census has an in-scope row with the same English and Icelandic.
  - Plus one action: `{kind: 'entry', rulingId: 'C234-8', english: ['standard cell potential', 'standard cell
    potentials'], icelandic: 'staðalíspenna', replaces: [], comment: 'the official chemistry glossary has standard
    cell potential = staðalíspenna ([USER], 2026-11-18; register §C234 ⑧)'}`.

- [ ] **Step 1: Write the failing tests** with a synthetic mini fixture (four rulings: one per choice, plus a
  `keep`), then run against the committed output file:
  - `'maps each choice to its actions and joins the conceptId'`.
  - `'phrases: excludes the row only and adds the phrase entry with phraseIcelandic'`.
  - `'refuses a count other than 212'`, `'refuses an ambiguous census match'`, `'refuses a group/domain
    mismatch'`.
  - `'the committed input'`:
    - `counts` shows 107 `exclude-headword` and 10 `exclude-concept` (7 + 1 + 2);
    - `entry` is between 17 and 19 inclusive: 16 replace, plus 0–2 phrase entries, plus `C234-8`;
    - every action's `rulingId` is unique;
    - `rulingsSha256` equals the snapshot sha256 in Global Constraints.
- [ ] **Step 2: Run** `npx vitest run tools/__tests__/prescreen-book-layer-input.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement**, then run the CLI once against the private files and the committed verdicts
  (`experiments/terminology-consistency/results/2026-11-18/prescreen-verdicts.json`) to write the output. Print
  the counts.
- [ ] **Step 4: Run** the test. Expected: PASS, including the committed-input case.
- [ ] **Step 5: Commit** `data(c19): the rulings as book-layer actions, joined to concept ids (c19)`, with the tool,
  the test and the output.

### Task 6: The loader

**Files:**
- Create: `server/scripts/load-book-glossary.js`
- Test: `server/__tests__/loadBookGlossary.test.js`

**Interfaces:**
- **Consumes:** Task 2's `addExclusion` / `addEntry`, Task 3's `buildScope` / `resolve`, and Task 5's input schema.
- **CLI:** `node server/scripts/load-book-glossary.js --book <slug> --input <path> [--apply] [--verify]`.
  - It exports `main(argv, io, deps)` (`deps.db` for tests; the CLI opens `resolveDbPath()`).
  - It uses the stdin-safe `runDirectly` idiom and `process.exitCode`, as `server/scripts/study-freeze.js` does on
    `docs/g17-freeze-design`.
- **Checks, all before any write (any failure refuses all, exit 1):**
  - `schema` and `book` match;
  - each `conceptId` exists and still carries the English;
  - its rank-1 Icelandic equals `icelandicAtCensus`;
  - no house-style concept carries a headword under a **whole-headword** exclusion;
  - no `book_term_preference` row for an entry's English;
  - no exclusion/entry collision inside the input.
- **Dry run (default):**
  - opens the DB read-only;
  - `const copy = new Database(db.serialize())`;
  - applies every action to `copy` in one transaction;
  - prints one row per action: `rulingId | kind | english | chemistry before → after | physics book before →
    after`, where the physics book must be unchanged and any change is a refusal;
  - prints the counts (`added` / `already`);
  - closes `copy`.
- **`--apply`:** opens read-write, re-runs the checks, applies in one transaction, and prints the same counts.
  - `by` is `'c19-load ([USER] rulings 2026-11-18)'`; `source` is `'c19 pre-screen'` or `'§C234'`; `reason` is
    the ruling comment.
- **`--verify`:** reads `books/<book>/glossary/glossary-unified.json` (resolved with `__dirname`) and the layer:
  - every whole-headword exclusion's headword is absent;
  - every one- or two-word entry's `icelandic` matches;
  - three-word entries are listed as "editor only".
  - Exit 0 only if all hold.

- [ ] **Step 1: Write the failing tests** on `freshMigratedDb()`, with a small input file built from the Task 5
  schema:
  - `'dry run writes nothing to the real DB'`: the `book_glossary_*` row counts are 0 and the `concept` count is
    unchanged after `main([... no --apply])`, and the output lists every action.
  - `'dry run shows chemistry before → after and the physics book unchanged'`.
  - `'refuses all on a drifted Icelandic'`: zero rows written, exit 1, and the message names the ruling id.
  - `'refuses all on a house-style headword being excluded'`.
  - `'--apply writes every action; a second --apply reports already for all and adds no history row'`.
  - `'--verify passes after an export of the applied layer and fails when an excluded headword is present'`.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/loadBookGlossary.test.js`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the test, then run a **local dry run** against this machine's `sessions.db` with the committed
  input:
  `node server/scripts/load-book-glossary.js --book efnafraedi-2e --input experiments/terminology-consistency/results/2026-11-18/c19-book-layer-input.json`.
  Record in the report what it printed: counts and refusals. A local database may lack production's concept ids,
  so refusals there are information, not failure. Production is where it must pass.
- [ ] **Step 5: Commit** `feat(glossary): load-book-glossary.js — dry-run c19 loader with checks and verify (c19)`.

### Task 7: Records

**Files:**
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md`

**Register entry and items**
- [ ] **Step 1: A register entry** `### ⏭ 2026-11-19 (c19: the book glossary layer, stage 1 built)` above the c19
  entry. It supersedes that entry's NEXT and says:
  - the design and plan, by link;
  - the commits;
  - the counts the input printed;
  - ▶ NEXT: [USER] reviews the draft PR. After the merge and deploy:
    - [USER] runs the loader's dry run on production, then `--apply`, then `node server/scripts/export-terminology.js`,
      then `--verify`, then pulls;
    - stage 2 (the screen and the worklist) is planned next;
    - after #742 merges, `study-freeze.js` records `book-glossary.json` (spec §5.4).
- [ ] **Step 2: A new item** `§C237 (NEW, 2026-11-19) — the segment editor's free-text term lookup reads the old
  terminology tables`.
  - It covers `terminologyService.lookupTerm` (`server/services/terminologyService.js:217`), called by the lookup
    box (`server/routes/segment-editor.js:144`), so it sees neither the concept model nor the layer.
  - Owner: code. Trigger: G1.17 or stage 2.
- [ ] **Step 3: Commit** `docs(register): c19 stage 1 built — the book glossary layer; §C237 lookup box`.

**Not a task of this plan:**
- The `study-freeze.js` change. It waits for #742 to merge; the register NEXT says so.
- Any CLAUDE.md change. A durable rule ("change chemistry's glossary through the book layer, never by editing
  `concept_term`") is [USER]'s to approve and is surfaced at the finish.
