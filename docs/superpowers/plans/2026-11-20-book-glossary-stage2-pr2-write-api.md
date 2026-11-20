# Book glossary layer, stage 2, PR 2: the write API and the routes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A head editor (or an admin) can change their book's glossary layer through authenticated POST routes —
exclude, undo an exclusion, add, change and remove an entry — with every change traced to an account, a date and a
reason, the two rulings made elsewhere enforced, and a new entry's inflections fetched from BÍN in the background.

**Architecture:** The write API in `server/lib/bookGlossaryLayer.js` gains three operations and new refusals, each
refusal carrying a machine code (`err.refusal`) that the routes map to an Icelandic message. A new rules module holds
the predicates the write API and the lookup route must share. The routes (`/api/book-glossary/:book/…`) validate every
input and take `by` from the session. A small service queues one BÍN lookup at a time by spawning
`fetch-bin-inflections.js` with a new `--concept-term-ids` flag. Separately, the resolved-glossary build runs inside one
read transaction, closing §C241 F3 before head editors can write layers.

**Tech Stack:** Node 22, CommonJS server (`server/`), Express, better-sqlite3 (server tree only), Vitest.

**Spec:** [`docs/superpowers/specs/2026-11-20-book-glossary-stage2-design.md`](../specs/2026-11-20-book-glossary-stage2-design.md)
§5.1, §5.2 (all routes except `GET /worklist`, which is PR 3's with §5.5), §5.4, §5.8 (T2a, T2b, T2c, T3f, T4c), §5.9,
§5.10 PR 2; and register §C241 F3 (ruling R19 in
[`2026-11-20-book-glossary-stage2-pr1-build-rulings.md`](../specs/2026-11-20-book-glossary-stage2-pr1-build-rulings.md)),
whose trigger is "before PR 2 deploys". It builds on stage 1
([`2026-11-19-book-glossary-layer-design.md`](../specs/2026-11-19-book-glossary-layer-design.md), S1) and on PR 1 (#747).

**Branch and deploy order.** Cut `feat/book-glossary-stage2-write-api` from `docs/book-glossary-stage2-pr2-plan`
(PR 1's branch plus this plan), so the PR carries its plan as PR 1 did. After #747 merges, rebase onto `main` and retarget the PR to `main` *before* merging anything stacked (memory
note `github-pr-tooling-traps`). **This PR must not deploy before PR 1 has** (design §5.10): its routes are what let a
head editor move the layer, and PR 1's hold is what keeps such a move off `main`.

## Global Constraints

- `server/` is CommonJS. Server test files `import` vitest and node builtins and load server modules with
  `createRequire(import.meta.url)`; copy the header of `server/__tests__/importConcepts.test.js`. Write-API tests use
  `freshMigratedDb()` (`server/__tests__/helpers/freshMigratedDb.js`); route tests set `SESSIONS_DB_PATH` before any
  server `require`, run `migrationRunner.runAllMigrations()`, and sign in with `createToken`, as
  `server/__tests__/localizationHeadEditorsOnly.test.js` does.
- Mutations are POST only (CLAUDE.md § Auth). No `PUT`/`DELETE` routes.
- The write API trusts its callers; **the routes are the boundary** and validate every input (design §3, T2b).
- Every write-API refusal throws `Error` with `code: 'LAYER_REFUSED'` and `refusal: <one of REFUSALS>`; the message
  stays English (logs). User-facing strings are Icelandic and live in the route file.
- `by`, `created_by` and `updated_by` are `req.user.id` (the account's provider id), never from the request body.
- `source` is `NOT NULL` in all three layer tables (migration 058): an omitted source is written as `''`.
- The committed record (`book-glossary.json`) never carries an email address and never carries an inflection list.
- History rows: `before_json`/`after_json` are filled for every new action. The database keeps an old word's
  inflections in `before_json` (call 12); only the committed record strips them.
- New refusals are checked **after** the existing `already` returns, so re-running the c19 loader stays idempotent.
  Measured 2026-11-20: 0 of the loader input's 136 actions touch one of the 65 house-style headwords.
- Tests never read the licensed BÍN file (`tools/data/SHsnid.csv`); they use invented rows like
  `server/__tests__/binInflectionsCli.test.js`'s `CSV_ROWS` (§C41: no BÍN bytes in the repository).
- Resolve paths from `__dirname` or an injected root, never `process.cwd()`. The books root is
  `segmentParser.BOOKS_DIR` (test seam `_setTestBooksDir`).
- All new code is under `server/` (AGPL). Nothing under `tools/` or `scripts/` may require it (root `LICENSE`, E-2).
- Run tests from the repo root: `npx vitest run <file>`. The full floor is `npm test`, `npm run lint` and
  `npm run format:check`; E2E runs in CI's `e2e` job. No document records a test count or a CI verdict.

## Plan rulings (choices this plan makes on [USER]'s behalf)

✅ **Confirmed by [USER] on 2026-11-20, P1–P10 as written.** Each extends the frozen design where it is silent.
Freeze them, with the build's own rulings, in a build-rulings file at the end.

- **P1 — a `display_name` that holds an email is treated as absent.** `server/services/auth.js` sets `display_name` to
  `msUser.displayName || email` on every login, so an account with no Graph display name has its email there. The
  record then writes the role. *Cost if wrong:* a head editor appears as *aðalritstjóri* instead of by name.
- **P2 — a `by` with no `users` row is written as it is, unless it is GUID-shaped or contains `@`;** those become
  `óþekktur notandi`. `userService.deleteUser` exists, so a deleted head editor's past rows would otherwise publish their
  provider id (a Graph GUID; measured on production 2026-11-20: 7 accounts, 4 GUID-shaped, 2 never signed in, 1
  legacy). The c19 label and test labels such as `tester` pass through. *Cost if wrong:* a deleted person's past changes
  read as "unknown user" in the public record.
- **P3 — `removeEntry`, and a `changeEntry` that changes the Icelandic, refuse when any `book_term_preference` row
  points at the entry's terms.** `term_id` cascades from `concept_term` (migration 048), so a removal would delete the
  preference silently and a change would silently change what it selects — the design's anti-goal "a layer change that
  silently disables a book preference". Same Icelandic "ask a developer" message as the design's preference refusal.
  ✏️ *Amended by [USER] 2026-11-20 ([design §AMENDED block](../specs/2026-11-20-book-glossary-stage2-design.md)): P3 also refuses a `changeEntry` that **removes a form** while a preference points at the entry's terms; a change that only adds forms stays allowed.*
- **P4 — `removeEntry` refuses when another concept is merged into the entry's concept** (`concept.merged_into` has no
  cascade, so the `DELETE` would otherwise throw a raw foreign-key error).
- **P5 — `changeEntry` re-checks house style on every form of the resulting entry whenever it writes**, so a confirmed
  override is confirmed again on a later change, and each history row names what it overrode.
- **P6 — the BÍN script's write is guarded on the text it looked up** (`AND text = ?`), and a row that changed or
  vanished meanwhile is counted in a new `rows.superseded` bucket instead of breaking the partition check. Without it,
  a second change during a running lookup writes the old word's forms onto the new word.
- **P7 — two activity types**, `book_glossary_changed` (*Orðasafni bókar breytt*) and `book_glossary_inflections`
  (*Beygingar orðasafns sóttar*).
- **P8 — validation limits:** a headword, form or Icelandic term ≤ 200 characters; at most 20 forms; `reason` ≤ 2,000;
  `source` ≤ 500. No control characters (`/[\u0000-\u001f\u007f]/`).
  ✏️ *Amended by [USER] 2026-11-20 ([design §AMENDED block](../specs/2026-11-20-book-glossary-stage2-design.md)): `reason` and `source` have every whitespace run (`\r`, `\n`, `\t` included) collapsed to one space and are trimmed before the control-character rule applies; an `english` headword, every form and the Icelandic term are also refused for zero-width characters, a byte-order mark and bidi controls.*
- **P9 — a BÍN lookup child is killed after 10 minutes** and recorded as `timeout`; the queue moves on.
- **P10 — `GET /history?english=` matches a headword against a row's `english` and against every form in its
  `before`/`after`**, because an entry's history row names only its first form.

## Review Focus

1. **A second change while a lookup runs** must never leave the old word's forms on the new word. → Task 5, test
   `a row whose text changed during the lookup is superseded, not written`; Task 6, test `superseded maps to its own
   result`.
2. **A `display_name` that is an email** must not reach the record. → Task 4, test `an email-shaped display_name is
   written as the role`.
3. **A preference pointing at an entry's Icelandic term** must survive a removal or a change. → Task 3, tests
   `removeEntry refuses when a preference points at the entry's term` and `changeEntry refuses a new Icelandic when a
   preference points at it`, each asserting the preference row is still there.
4. **A lookup child that never exits** must not block later lookups. → Task 6, test `a timed-out lookup is recorded
   and the next one runs`.
5. **`undoExclusions` naming an exclusion that is not one of the entry's own single-concept exclusions** (another
   headword, a whole-headword exclusion, another book's) must refuse and remove nothing. → Task 3, test `removeEntry
   refuses an undo id that is not the entry's own exclusion and writes nothing`.

---

### Task 1: The resolved-glossary build runs in one read transaction (§C241 F3)

**Files:**
- Modify: `server/lib/resolvedGlossary.js` (`buildResolvedGlossary`)
- Create: `server/__tests__/resolvedGlossarySnapshot.test.js`

**Interfaces:**
- Produces: `buildResolvedGlossary(db, bookSlug, { census, booksDir } = {})` — unchanged signature and return; the body
  runs inside `db.transaction(...)()`, so every read sees one snapshot. Thrown errors keep their `code`
  (`UNSCOPED`, `EMPTY_CENSUS`) and `unscoped` fields.

Measured 2026-11-20 on a `freshMigratedDb` file: `db.transaction()` works on a `readonly: true` connection; after
`journal_mode = WAL`, a commit from another connection is invisible inside the transaction and visible after it.

- [ ] **Step 1: Write the failing test** `a commit by another book during the build does not reach this book's export`.
  - Writer: `freshMigratedDb()`; `writer.pragma('journal_mode = WAL')`. Assert precondition: `edlisfraedi-2e` and
    `efnafraedi-2e` are both in `registered_books`.
  - Seed one biology concept carrying `en 'zcell'` / `is 'zlif'` (biology is position 3 in chemistry's chain).
  - Reader: `new Database(path, { readonly: true })`.
  - Census: `const strings = ['zcell']; strings[Symbol.iterator] = function* () { addEntry(writer, { book:
    'edlisfraedi-2e', english: ['zcell'], icelandic: 'zphys', reason: 'r', source: '', by: 't' }); yield*
    Array.prototype.values.call(this); };` and pass `{ census: { strings, filesRead: 1, root: 'x' } }`. The iterator
    runs after `buildScope`, which is when the race happens (physics is position 2, so a torn build picks `zphys`).
  - Assert `terms.find((t) => t.english === 'zcell').icelandic === 'zlif'`.
  - Control in the same test: `writer` holds one `book_glossary_entry` row for `edlisfraedi-2e` (the race happened).
- [ ] **Step 2: Run it against the unfixed code.** `npx vitest run server/__tests__/resolvedGlossarySnapshot.test.js`
  — expected FAIL: `icelandic` is `'zphys'`.
- [ ] **Step 3: Add** `UNSCOPED and EMPTY_CENSUS still throw with their codes through the transaction` (an unregistered
  slug → `code: 'UNSCOPED', unscoped: 'unregistered'`; `census: { strings: [], filesRead: 0, root: 'x' }` →
  `code: 'EMPTY_CENSUS'`).
- [ ] **Step 4: Wrap the body** of `buildResolvedGlossary` in `db.transaction(() => …)()`; update its JSDoc to say why
  (F3: `buildScope` loads `bookOwned` once while candidate lookups run live).
- [ ] **Step 5: Run** the new file plus `server/__tests__/glossaryExportLayerHold.test.js` and
  `server/__tests__/glossaryExportDefaultWiring.test.js` — expected PASS.
- [ ] **Step 6: Commit** `fix(glossary-export): build the resolved glossary in one read transaction (§C241 F3)`.

### Task 2: Refusal codes, shared predicates, and the new refusals on `addExclusion`/`addEntry`

**Files:**
- Create: `server/lib/bookGlossaryRules.js`
- Modify: `server/lib/bookGlossaryLayer.js` (`refuse`, `addExclusion`, `addEntry`; move `conceptCarries` out)
- Create: `server/__tests__/bookGlossaryRules.test.js`
- Unchanged, must still pass: `server/__tests__/bookGlossaryWrite.test.js` (refusal messages are kept verbatim)

**Interfaces:**
- Produces (`bookGlossaryRules.js`, requires `conceptResolver` and `houseStyleTerms` only):
  - `conceptCarries(db, conceptId: number, english: string): boolean` — moved verbatim from the layer module.
  - `dedupeForms(forms: string[]): string[]` — keeps the first spelling of each `matchKey`, in order (T2a).
  - `houseStyleInScope(db, bookId: number, english: string): Array<{conceptId: number, english: string, icelandic:
    string|null}>` — concepts with `collection = HOUSE_STYLE_SOURCE` whose `domain` is in the book's
    `book_domain_priority` and that carry `english` by `matchKey`; `icelandic` is the rank-1 `is` term. **The one
    predicate** for "a house-style concept is in scope": the write refusal and `GET /lookup` both call it.
  - `preferenceBlocksExclusion(db, bookId: number, english: string, conceptId: number): boolean` — a
    `book_term_preference` row of the book (any chapter) with `english = ?` (the column is `COLLATE NOCASE`) and either
    `conceptId === 0` or the preference's `term_id` belongs to `conceptId`.
  - `preferencesOnTermsOf(db, conceptId: number): number` — `book_term_preference` rows (any book) whose `term_id` is a
    term of the concept.
- Produces (`bookGlossaryLayer.js`): `REFUSALS` (frozen array): `invalid`, `unknown-book`, `concept-missing`,
  `not-carried`, `entry-conflict`, `excluded-headword`, `preference`, `own-entry`, `replaced-not-carried`, `no-scope`,
  `needs-confirm`, `not-found`, `merged-into`. `refuse(message, refusal, extra = {})` sets `code`, `refusal` and copies
  `extra` onto the error. Every existing `refuse(...)` call gets the code its message describes; messages are unchanged.
- Produces: `addExclusion(db, a)` and `addEntry(db, a)` accept `a.confirmHouseStyle?: boolean` and return
  `changeId` (the new `book_glossary_change.id`) beside `status` when `status === 'added'`.
- Produces: `needs-confirm` errors carry `houseStyle: Array<{conceptId, english, icelandic}>`. A confirmed write's
  history `after_json` gains `houseStyleOverride` with that array.

- [ ] **Step 1: Write the failing tests** in `bookGlossaryRules.test.js` (fresh migrated DB, `addPair` and the `base`
  object copied from `bookGlossaryWrite.test.js`. ⚠️ That file's `beforeEach` deletes every `concept` row, 051's
  house-style rows included, so these tests seed their own: one `chemistry` concept with `collection = 'house-style'`
  carrying `en 'zhouse'` / `is 'zhus'`, inserted after the cleanup):
  - `dedupeForms keeps the first spelling per match key` → `dedupeForms(['Geometry', 'geometry', 'SI', 'Si'])` equals
    `['Geometry', 'SI', 'Si']`.
  - `houseStyleInScope finds a house-style concept for chemistry and nothing for a book whose chain lacks its domain`
    → one hit for `efnafraedi-2e`/`'zhouse'`; `[]` for `stjornufraedi`. ✏️ *Corrected 2026-11-20 during the build: this
    line first named `edlisfraedi-2e`, whose chain in `server/lib/domains.js` ends in `chemistry`.*
  - `addEntry dedupes forms: ['zgeo', 'ZGEO'] writes one en term, and a re-run returns already` (T2a).
  - `addEntry with an exact duplicate form does not reach SQLite` → `['zgeo', 'zgeo']` succeeds with one en term.
  - `addExclusion refuses the book's own entry concept` → `refusal: 'own-entry'`, exclusion count unchanged (T2c).
  - `addExclusion refuses a whole-headword exclusion on a preferred headword` → `refusal: 'preference'`; the
    `book_term_preference` row is still there. Same for a single-concept exclusion of the preferred concept, with the
    preference stored on a different chapter (any chapter counts) and the headword in other case (`'ZCell'`).
  - `addExclusion allows excluding a non-preferred concept on a preferred headword` → `status: 'added'`.
  - `an entry on a house-style headword is refused with needs-confirm and names the term` → `refusal:
    'needs-confirm'`, `houseStyle[0].english === 'zhouse'`, nothing written (entry, concept and history counts).
  - `with confirmHouseStyle the entry is written and its history names the overridden term` →
    `JSON.parse(after_json).houseStyleOverride[0].conceptId` equals the 051 concept's id.
  - `excluding a house-style concept needs confirmation; excluding its headword whole does too`.
  - `the lookup and the write agree on house style` → for `'zhouse'` and for `'zcell'`, `houseStyleInScope(...)
    .length > 0` exactly when `addEntry` without the flag refuses `needs-confirm`.
  - `an already-identical exclusion returns already before any new refusal` → with a preference added after the first
    write, the second identical `addExclusion` returns `already` (loader idempotence).
- [ ] **Step 2: Run** `npx vitest run server/__tests__/bookGlossaryRules.test.js` — expected FAIL (module missing).
- [ ] **Step 3: Implement** the rules module and the layer changes. Order inside `addExclusion` after the `already`
  return: `own-entry` → `preference` → `needs-confirm`. Inside `addEntry`, dedupe first, then the existing loop, then
  `needs-confirm` after every existing refusal. `writeHistory` returns the change id.
- [ ] **Step 4: Run** the new file and `server/__tests__/bookGlossaryWrite.test.js`,
  `server/__tests__/loadBookGlossary.test.js`, `server/__tests__/bookGlossaryResolve.test.js` — expected PASS.
- [ ] **Step 5: Commit** `feat(glossary-layer): refusal codes; T2a, T2c; preference and house-style rulings`.

### Task 3: `removeExclusion`, `changeEntry`, `removeEntry`

**Files:**
- Modify: `server/lib/bookGlossaryLayer.js`
- Create: `server/__tests__/bookGlossaryOperations.test.js`

**Interfaces:**
- Consumes: Task 2's rules module, `refuse`, `REFUSALS`.
- Produces:
  - `removeExclusion(db, {book, exclusionId, reason, source, by, at?}) → {status: 'removed', changeId}`. History
    `unexclude`, `english` = the exclusion's; `before_json` `{english, conceptId, idordabankiId}` (no Icelandic, S1
    §5.4); `after_json` `{english, conceptId, excluded: false}`. An id that is not this book's → `not-found`.
  - `changeEntry(db, {book, conceptId, icelandic?, forms?, reason, source, by, at?, confirmHouseStyle?}) → {status:
    'changed'|'unchanged', conceptId, icelandicChanged: boolean, changeId: number|null}`. Not this book's entry →
    `not-found`. New Icelandic replaces the rank-1 `is` term's `text` and sets its `inflections` to `NULL`. `forms`
    (deduped) replaces the en set: new forms keep every stage-1 refusal plus another entry of the book claiming the
    form (`entry-conflict`, T3f); removed forms' en rows are deleted. History `entry-change`, `english` = the resulting
    first form, `before_json` `{english: oldForms, icelandic: old, inflections: oldList|null}`, `after_json`
    `{english: newForms, icelandic: new}` (+ `houseStyleOverride`). Sets `updated_by`/`updated_at`. Nothing differs →
    `unchanged`, no history row.
  - `removeEntry(db, {book, conceptId, reason, source, by, at?, undoExclusions?: number[]}) → {status: 'removed',
    changeId, undone: number[]}`. One transaction: P3 and P4 refusals; `before_json` `{english, icelandic,
    inflections}`; delete the `book_glossary_entry` row and the `concept` (its terms cascade); history `entry-remove`
    with `after_json` `{removed: true}`; then one `removeExclusion` per undo id, each its own history row. An undo id
    must be this book's single-concept exclusion whose `match_key` is one of the entry's forms' keys, else
    `not-found` and nothing is written.
  - `historyFor(db, book, english) → Array<{id, at, by, action, english, before, after, reason, source}>` newest
    first, matching P10.

- [ ] **Step 1: Write the failing tests:**
  - `removeExclusion writes unexclude with before and after, and the concept is visible again` → `resolve(buildScope(db,
    BOOK), 'zcell').winner.conceptId` is the formerly excluded concept.
  - `removeExclusion of a replacement's exclusion leaves the entry (the entry becomes an add)`.
  - `removeExclusion refuses another book's exclusion id` → `not-found`, row still there.
  - `changeEntry with a new Icelandic clears inflections and keeps the old list in before_json` → seed the `is` row's
    `inflections` as `'["zbeyging1"]'`; after: `inflections` is `null`, `before.inflections` equals `['zbeyging1']`.
  - `changeEntry adds and removes forms` → en set equals the new set; a removed form no longer resolves to the entry.
  - `changeEntry refuses a form another entry of the book claims (T3f)` → `entry-conflict`, nothing changed.
  - `changeEntry refuses a new Icelandic when a preference points at it` (P3) → `preference`; preference row intact.
  - `changeEntry with nothing different returns unchanged and writes no history row`.
  - `removeEntry deletes the entry, its concept and terms, and keeps Icelandic and inflections in before_json`.
  - `removeEntry refuses when a preference points at the entry's term and writes nothing` (P3) → preference intact.
  - `removeEntry refuses when another concept is merged into the entry` (P4) → `merged-into`.
  - `removeEntry undoes the listed exclusions, each as its own history row` → actions `entry-remove`, `unexclude`.
  - `removeEntry refuses an undo id that is not the entry's own exclusion and writes nothing` — three cases: another
    headword's exclusion, a whole-headword exclusion, another book's exclusion id (Review Focus 5).
  - `historyFor finds an entry's change by its second form` (P10).
- [ ] **Step 2: Run** `npx vitest run server/__tests__/bookGlossaryOperations.test.js` — expected FAIL.
- [ ] **Step 3: Implement** the four functions; extend `writeHistory` with a `beforeObj` argument.
- [ ] **Step 4: Run** the new file and Task 2's files — expected PASS.
- [ ] **Step 5: Commit** `feat(glossary-layer): removeExclusion, changeEntry, removeEntry`.

### Task 4: The record shows names, never emails or inflections (T4c)

**Files:**
- Modify: `server/lib/bookGlossaryLayer.js` (`buildBookGlossaryRecord`)
- Modify: `server/__tests__/bookGlossaryRecord.test.js`

**Interfaces:**
- Produces: `displayNameFor(db, by: string): string` —
  1. a `users` row with `provider_id = by` and a trimmed `display_name` without `@` → that name;
  2. such a row with no usable name → role label: `admin` → `stjórnandi`, `head-editor` → `aðalritstjóri`, `editor` →
     `yfirlesari`, `viewer` → `lesandi`, else `notandi` (P1);
  3. no row and `by` GUID-shaped (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`) or containing
     `@` → `óþekktur notandi` (P2);
  4. otherwise `by` as it is.
- `buildBookGlossaryRecord` maps `history[].by`, `exclusions[].createdBy`, `entries[].createdBy` and
  `entries[].updatedBy` (when not null) through it; removes every `inflections` key at any depth of `history[].before`
  and `history[].after`; and its entry query gains `ORDER BY concept_id` (T4c; no test — entries are sorted afterwards,
  so only the dangling list's order depends on it).

- [ ] **Step 1: Write the failing tests:**
  - `an account id is written as its display name` (insert a `users` row with `provider_id` and `display_name`).
  - `an email-shaped display_name is written as the role` (Review Focus 2) → `aðalritstjóri`.
  - `the c19 label and a by with no account pass through` → `'c19-load ([USER] rulings 2026-11-18)'` and `'tester'`.
  - `a GUID-shaped by with no account is written as óþekktur notandi`.
  - `no email anywhere in the record` → a user with `email = 'nafn@skoli.example'` and `display_name =
    'nafn@skoli.example'` made a change; `JSON.stringify(record)` contains no `@`.
  - `no inflection list anywhere in the record` → after a `changeEntry` and a `removeEntry` of an entry whose `is` row
    held `'["zbeyging1"]'`, the serialised record contains neither `zbeyging1` nor `"inflections"`.
  - `the committed chemistry record is a fixed point of this task` → read `books/efnafraedi-2e/glossary/
    book-glossary.json` (resolve it from `__dirname`); on a fresh migrated database (no `users` rows), every
    `history[].by`, `exclusions[].createdBy`, `entries[].createdBy` and non-null `entries[].updatedBy` satisfies
    `displayNameFor(db, v) === v`, and the file contains no `"inflections"` key. This is why the first cron run after
    the deploy makes no record commit.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/bookGlossaryRecord.test.js` — expected FAIL on the new tests.
- [ ] **Step 3: Implement** `displayNameFor`, the stripping and the `ORDER BY`.
- [ ] **Step 4: Run** the file plus `server/__tests__/glossaryExportLayerHold.test.js` — expected PASS.
- [ ] **Step 5: Commit** `feat(glossary-layer): the record shows display names, never emails or inflections (T4c)`.

### Task 5: `fetch-bin-inflections.js --concept-term-ids`, and a write guarded on the looked-up text

**Files:**
- Modify: `server/scripts/fetch-bin-inflections.js` (`parseArgs`, `candidateSql`, `main`, `USAGE`)
- Modify: `server/__tests__/binInflectionsCli.test.js`

**Interfaces:**
- Produces: `parseArgs` accepts `--concept-term-ids <list>` (also `=` form); the value matches
  `/^[1-9]\d*(,[1-9]\d*)*$/`, else it throws `--concept-term-ids expects a comma-separated list of positive integers`.
  Result field `conceptTermIds: number[] | null` (deduplicated; default `null`).
- Produces: `candidateSql({ force, conceptTermIds })` adds `ct.id IN (<ids>)` when given.
- In restricted mode `main` skips the whole-corpus emptiness refusal (no candidate → return the empty report), and
  counts `multiWordSkipped` within the ids only.
- Every run (P6): the update adds `AND text = ?` with the text it looked up; a row it no longer matches (text changed,
  row deleted) is counted in `rows.superseded`; the partition check becomes `written + superseded === resolved`. The
  report (`--report`) carries `rows.superseded`.

- [ ] **Step 1: Write the failing tests:**
  - `parseArgs reads --concept-term-ids as a list` and `refuses a non-integer, zero or empty list`.
  - `candidateSql restricts to the given ids`.
  - `a restricted run writes only the named rows` → two seeded terms, only the named one gets forms.
  - `a restricted run on a database holding only book-layer rows does not refuse as empty` → seed the term with
    `collection`/`source` `'book-layer'`; `main([... '--execute', '--concept-term-ids', id])` resolves and writes.
  - `a restricted run whose only row is multi-word reports it skipped` → `rows.multiWordSkipped === 1`, nothing thrown.
  - `a row whose text changed during the lookup is superseded, not written` (Review Focus 1): `const p = run(['--execute',
    '--concept-term-ids', String(id)])`, then synchronously `UPDATE concept_term SET text = 'zflat' WHERE id = ?` (the
    candidate query runs before `main`'s first `await`), then `await p` → `rows.superseded === 1`, `rows.written ===
    0`, and the row's `inflections` is `null`.
  - `a row deleted during the lookup is superseded` (same shape, `DELETE`).
- [ ] **Step 2: Run** `npx vitest run server/__tests__/binInflectionsCli.test.js` — expected FAIL on the new tests.
- [ ] **Step 3: Implement.** Carry `{id, text}` per row in the write plan; document the new flag and bucket in `USAGE`.
- [ ] **Step 4: Run** the file plus `server/__tests__/binInflections.test.js` — expected PASS (the golden test needs the
  licensed file and skips without it).
- [ ] **Step 5: Commit** `feat(bin): --concept-term-ids; guard the write on the looked-up text (rows.superseded)`.

### Task 6: The background inflection lookup

**Files:**
- Create: `server/services/bookGlossaryDb.js`
- Create: `server/services/bookGlossaryInflections.js`
- Modify: `server/services/activityLog.js` (`ACTIVITY_TYPES`), `server/routes/status.js` (`formatActivityType`)
- Create: `server/__tests__/bookGlossaryInflections.test.js`

**Interfaces:**
- Produces (`bookGlossaryDb.js`): `getDb()` (lazy, `resolveDbPath()`, WAL), `_setTestDb(db)` — the same shape as
  `pipelineStatusService`'s. Required by this task's service and by Task 7's, so neither requires the other.
- Produces (`ACTIVITY_TYPES`): `BOOK_GLOSSARY_CHANGED: 'book_glossary_changed'`, `BOOK_GLOSSARY_INFLECTIONS:
  'book_glossary_inflections'`; labels in `formatActivityType`: *Orðasafni bókar breytt*, *Beygingar orðasafns sóttar*.
- Produces (`bookGlossaryInflections.js`):
  - `schedule(conceptId: number, ctx: {book: string, userId: string, username: string}): void` — enqueues and starts
    the drain. One lookup runs at a time. A schedule for a concept that is **queued and not yet started** is dropped
    (that lookup will read the current text when it starts). A schedule for a concept whose lookup is **running** is
    kept and runs after it, so a change made mid-lookup always ends with a lookup of the new text.
  - `status(conceptId: number): {state: 'pending'} | {state: 'done', result: string} | null` — in memory.
  - `RESULTS`: `forms`, `not-in-bin`, `ambiguous`, `base-form-only`, `several-words`, `file-absent`, `already`,
    `superseded`, `no-term`, `timeout`, `error`.
  - `_setRunner(fn | undefined)`, `_setBinDataPath(p | undefined)`, `_idle(): Promise<void>`, `_defaultRunner` (test
    seams; a test spies on the real runner by passing a wrapper around `_defaultRunner` to `_setRunner`).
  - A runner is `({conceptTermIds: number[], binDataPath: string, dbPath: string}) => Promise<{code: number|null,
    signal: string|null, report: object|null, stderr: string}>`.
  - Default runner: `spawn('node', [SCRIPT, '--db', dbPath, '--bin-data', binDataPath, '--execute',
    '--concept-term-ids', conceptTermIds.join(','), '--report', tmpFile], { cwd: PROJECT_ROOT, timeout: 600000 })`; the
    temp report is read, then deleted (it carries BÍN ids). **`dbPath` is `getDb().name`**, the file the service's own
    connection has open — never `resolveDbPath()`, which in a test without `SESSIONS_DB_PATH` is the developer's real
    `sessions.db`.
- One lookup: read the concept's `is` rows → none: `no-term`; BÍN file absent: `file-absent` (no spawn); every text
  multi-word: `several-words` (no spawn); else run. Map: `signal` set → `timeout`; `code !== 0` → `error`;
  `report.rows.superseded > 0` → `superseded`; `report.rows.written > 0` → `forms`; else the one non-zero string
  bucket (`notInBin` → `not-in-bin`; `refusedAmbiguous`/`refusedNoNoun` → `ambiguous`; `baseFormOnly` →
  `base-form-only`); `strings.total === 0` → `already`. Each result is logged as a `BOOK_GLOSSARY_INFLECTIONS` activity
  (`metadata: {conceptId, result}`) and never throws.

- [ ] **Step 1: Write the failing tests** (fresh migrated DB via `_setTestDb`; injected runner unless named):
  - `one lookup at a time: a second schedule waits until the first finishes` (runner records overlap; max concurrency 1).
  - `a repeat schedule while queued is dropped` → with a first concept's lookup running, schedule a second concept
    twice; the runner is called once for the second concept.
  - `a change during a running lookup ends with the new word's forms` (Review Focus 1) → hold the first runner call
    open, `schedule` the same concept again, release the first with a `superseded` report; the runner is called a
    second time and `status(conceptId)` ends as `{state: 'done', result: 'forms'}`.
  - `file absent: recorded without spawning` → `_setBinDataPath('/nonexistent')`, runner never called.
  - `a multi-word Icelandic is several-words without spawning`.
  - `each report maps to its result` (`it.each` over the buckets above).
  - `superseded maps to its own result` (Review Focus 1).
  - `a timed-out lookup is recorded and the next one runs` (Review Focus 4) → runner resolves `{signal: 'SIGTERM'}`
    for the first, ok for the second; results `timeout`, `forms`.
  - `the real script with a fixture CSV writes forms` → default runner, `_setTestDb(<freshMigratedDb().db>)`,
    `_setBinDataPath(<invented CSV with zsolo's two rows from binInflectionsCli.test.js>)`, an entry whose `is` term is
    `zsolo` (a `book-layer` row, so Task 5's restricted mode is what lets it run); after `_idle()` the row's
    `inflections` parses to `['zsolu']`.
  - `the child writes to the service's own database, never resolveDbPath()'s` → at the top of the file, before any
    server `require`, point `SESSIONS_DB_PATH` at a **decoy** path in a temp directory that does not exist. After the
    real-script run: the decoy path still does not exist, the runner received `dbPath === db.name`, and the fresh
    database's row changed. (A decoy, not an unset variable: unset, a regressed runner would write to the developer's
    real `sessions.db` before any assertion could fail.)
  - `every result writes one activity row` (read `activity_log`).
- [ ] **Step 2: Run** `npx vitest run server/__tests__/bookGlossaryInflections.test.js` — expected FAIL.
- [ ] **Step 3: Implement**, following `server/services/tmService.js`'s injectable-runner pattern.
- [ ] **Step 4: Run** the file — expected PASS.
- [ ] **Step 5: Commit** `feat(glossary-layer): background BÍN lookup for an entry, one at a time`.

### Task 7: The read routes and the guard

**Files:**
- Create: `server/services/bookGlossaryService.js`
- Create: `server/routes/book-glossary.js` (GET routes in this task)
- Modify: `server/index.js` (mount beside `/api/terminology`)
- Create: `server/__tests__/bookGlossaryRoutes.test.js`

**Interfaces:**
- Consumes: `getDb` (Task 6), `inflections.status` (Task 6), `houseStyleInScope` (Task 2), `historyFor` and
  `displayNameFor` (Tasks 3–4), `buildScope`/`resolve`, `readGlossaryExportHealth`.
- Produces (`bookGlossaryService.js`):
  - `isRegisteredBook(db, slug): boolean`; `hasGlossaryDir(slug): boolean` (`segmentParser.BOOKS_DIR/<slug>/glossary`,
    the exporter's own predicate).
  - `listLayer(db, slug) → {exclusions: [{id, english, conceptId, idordabankiId, icelandic, reason, source,
    createdBy, createdAt}], entries: [{conceptId, english: string[], icelandic, reason, source, createdBy, createdAt,
    updatedBy, updatedAt, inflections: {state: 'forms', count} | {state: 'pending'} | {state: 'exact-only', reason:
    string|null}}]}` — names through `displayNameFor`.
  - `lookup(db, slug, english) → {resolution, layer: {exclusions, entries}, houseStyle, preferences: [{chapter,
    icelandic, conceptId}]}` — `resolution` is `resolve(buildScope(db, slug, 0), english)` as returned.
  - `exportState(slug) → {held: boolean, since: string|null, recordError: boolean}` from `readGlossaryExportHealth`
    (`held` ⇔ the book's outcome is `refused-layer-change`); test seam `_setProjectRoot(dir)`.
- Produces (routes, all `requireAuth, requireHeadEditor('book')`, under `/api/book-glossary/:book`):
  `GET /` → `{book, exclusions, entries, hold}`; `GET /lookup?english=`; `GET /history?english=`. An unregistered
  book → 400 `{error: 'Ógilt gildi: book'}`; a bad `english` → 400 `{error: 'Ógilt gildi: english'}`.

- [ ] **Step 1: Write the failing tests** (temp books root via `segmentParser._setTestBooksDir`, with
  `efnafraedi-2e/glossary/` present and `liffraedi-2e/` without one; `_setProjectRoot` to a temp root holding a
  status file):
  - `the guard: an editor, a head editor of another book and no session are refused; a head editor of the book and an
    admin get through` → 403, 403, 401, 200, 200 on `GET /`.
  - `GET / lists exclusions and entries with display names and inflection state` → for an entry written with `by` = a
    `users` row's `provider_id`, `entries[0].createdBy` is that row's `display_name`, and `entries[0].inflections`
    equals `{state: 'exact-only', reason: null}` (nothing scheduled, no forms).
  - `GET / reports the hold from the status file` → outcome `refused-layer-change` with `since` → `hold.held === true`.
  - `GET /lookup reports house style through the same predicate as the write refusal` → `houseStyle` for
    `'zhouse'` (seeded as in Task 2) equals `houseStyleInScope(db, bookId, 'zhouse')`.
  - `GET /lookup lists the book's preferences on the headword by chapter`.
  - `GET /history returns rows newest first` → after an exclusion and its undo on one headword, the ids are descending
    and the actions are `['unexclude', 'exclude']`.
  - `an unregistered book and a control character in english are 400`.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/bookGlossaryRoutes.test.js` — expected FAIL.
- [ ] **Step 3: Implement** the service, the GET routes and the mount.
- [ ] **Step 4: Run** the file — expected PASS.
- [ ] **Step 5: Commit** `feat(glossary-layer): read routes for the book glossary page`.

### Task 8: The write routes

**Files:**
- Modify: `server/routes/book-glossary.js`
- Modify: `server/__tests__/bookGlossaryRoutes.test.js`

**Interfaces:**
- Consumes: Tasks 2–3's write API, Task 6's `schedule`, Task 7's service.
- Produces (all POST, same guard): `/exclusions` `{english, conceptId, reason, source?, confirmHouseStyle?}`;
  `/exclusions/:id/undo` `{reason, source?}`; `/entries` `{forms, icelandic, mode: 'replace'|'add', replaces?,
  reason, source?, confirmHouseStyle?}` (`replace` needs a non-empty `replaces`; `add` takes none);
  `/entries/:conceptId/change` `{icelandic?, forms?, reason, source?, confirmHouseStyle?}` (at least one of
  `icelandic`, `forms`); `/entries/:conceptId/remove` `{reason, source?, undoExclusions?}`;
  `/entries/:conceptId/inflections` `{}` → 202.
- Validation (P8) → 400 `{error: 'Ógilt gildi: <field>'}`. Strings are trimmed before use. `by` is `req.user.id`; a
  `by` in the body is ignored.
- A book with no `glossary/` directory → 409 `{error: NO_GLOSSARY_DIR_MESSAGE}` before any write (call 3).
- A `LAYER_REFUSED` error → 409 `{error: MESSAGES[err.refusal], refusal}`; `needs-confirm` adds `houseStyle`. Any
  other error → 500 `{error: 'Villa á þjóni'}`, logged.
- Success: `added` → 201, otherwise 200, body the write API's return. Each successful write logs one
  `BOOK_GLOSSARY_CHANGED` activity (`metadata: {action, changeId}`). `entries` with `status: 'added'`, and `change`
  with `icelandicChanged`, call `schedule(conceptId, {book, userId, username})`.
- `MESSAGES` (Icelandic; [USER] may reword at review):
  - `concept-missing`: *Hugtakið er ekki til.*
  - `not-carried`: *Hugtakið ber ekki þetta enska orð.*
  - `entry-conflict`: *Bókin hefur þegar færslu fyrir þetta orð.*
  - `excluded-headword`: *Orðið er útilokað í heild í þessari bók. Afturkallaðu útilokunina fyrst.*
  - `preference`: *Bókin hefur valið þýðingu fyrir þetta orð. Síðan getur ekki breytt því vali; biddu forritara um að
    gera það.*
  - `own-entry`: *Þetta er færsla bókarinnar sjálfrar. Breyttu henni eða fjarlægðu hana frekar en að útiloka hana.*
  - `replaced-not-carried`: *Hugtakið sem á að víkja ber ekkert af ensku orðum færslunnar.*
  - `not-found`: *Fannst ekki í orðasafni bókarinnar.*
  - `merged-into`: *Öðru hugtaki hefur verið steypt saman við þessa færslu. Biddu forritara um að skoða það.*
  - `no-scope`: *Bókin hefur enga sviðsröð. Biddu forritara um að skoða það.*
  - `needs-confirm`: *Þessi breyting víkur til hliðar ákvörðun um orðanotkun verksins. Staðfestu til að halda áfram.*
  - `invalid` / `unknown-book`: *Ógild beiðni.*
  - `NO_GLOSSARY_DIR_MESSAGE`: *Bókin hefur enga glossary-möppu, svo breytingar á orðasafni hennar kæmust aldrei í git.
    Biddu forritara um að stofna hana.*

- [ ] **Step 1: Write the failing tests:**
  - `each route writes as the session's account, ignoring a by in the body` → the history row's `by` is the token's
    `id`.
  - `each validation failure is 400 and writes nothing` (`it.each`: empty `english`, whitespace-only `reason`, `conceptId`
    `-1` and `1.5`, `forms` `[]`, 21 forms, a 201-character form, `mode` `'both'`, `replace` without `replaces`,
    `confirmHouseStyle` `'yes'`, a change with neither field).
  - `a refusal is 409 with its Icelandic message and code` (one per refusal reachable from a route).
  - `needs-confirm is 409 with the house-style term; resending with confirmHouseStyle writes`.
  - `a book with no glossary directory is 409 and nothing is written`.
  - `an added entry and a changed Icelandic schedule one lookup with the entry's is term id` (injected runner; after
    `_idle()` the runner saw `conceptTermIds` equal to that row's id).
  - `the retry route schedules a lookup and answers 202`.
  - `every successful write logs one book_glossary_changed activity`.
- [ ] **Step 2: Run** `npx vitest run server/__tests__/bookGlossaryRoutes.test.js` — expected FAIL on the new tests.
- [ ] **Step 3: Implement** the POST routes, the validators and `MESSAGES`.
- [ ] **Step 4: Run** the file, then the full floor: `npm test`, `npm run lint`, `npm run format:check` — expected all
  pass.
- [ ] **Step 5: Commit** `feat(glossary-layer): write routes for the book glossary page`.

---

## After the build

- **Register and dashboard:** add the PR's entry to the register's ⏩ RESUME block, park any review minors in a new
  §C item, freeze the confirmed plan rulings (P1–P10) in a build-rulings file beside the design, and roll dashboard row
  s21 in the same session (CLAUDE.md § One source of truth).
- **First cron run after the deploy** (PR 1 already deployed): chemistry's export outcome reads `unchanged` (or
  `restamped`, if PR 1's one restamp has not happened yet), and `book-glossary.json` gets no commit — this PR changes
  no value in a record of loader-written rows (Task 4's last test). Anything else is a stop for [USER].
- **Runbook — fill the 19 c19 entries' inflections once** ([USER], on production, design §5.4). From
  `~/repos/namsbokasafn-efni/server`:
  1. `node -e "const D=require('better-sqlite3');const db=new D(require('./lib/dbPath')(),{readonly:true});console.log(db.prepare(\"SELECT group_concat(t.id) ids FROM concept_term t JOIN book_glossary_entry e ON e.concept_id = t.concept_id WHERE t.lang = 'is'\").get().ids)"`
  2. `node scripts/fetch-bin-inflections.js --concept-term-ids <ids>` (dry run; read the summary).
  3. The same with `--execute`. Multi-word entries are reported as skipped; that is expected.
