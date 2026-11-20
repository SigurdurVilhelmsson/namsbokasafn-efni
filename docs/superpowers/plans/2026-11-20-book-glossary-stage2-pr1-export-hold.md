# Book glossary layer, stage 2, PR 1: the export hold — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A book-layer change never reaches the committed `glossary-unified.json` until a developer has run the
glossary premise-pin tests against exactly that export and released it, while the layer's record
(`book-glossary.json`) still reaches git on every cron run.

**Architecture:** The exporter stamps each written `glossary-unified.json` with the last layer change it reflects.
When the layer has moved past the committed stamp and the terms differ, the book's outcome is
`refused-layer-change` and the would-be export is parked in gitignored `pipeline-output/glossary-held/`. A
developer tests the parked file with a dev-side script, then releases it with `--release-layer <terms-hash>`, which
writes only if the export still hashes the same. The existing refusal framework (the `since` clock, `/api/health`,
the deploy readout) makes the hold visible.

**Tech Stack:** Node 22, CommonJS server (`server/`), ESM `tools/` and `scripts/`, better-sqlite3 (server tree
only), Vitest, bash.

**Spec:** [`docs/superpowers/specs/2026-11-20-book-glossary-stage2-design.md`](../specs/2026-11-20-book-glossary-stage2-design.md)
§5.6, §5.7, §5.8 (T4e, T4h), §5.9, §5.10 PR 1. It builds on
[`2026-11-19-book-glossary-layer-design.md`](../specs/2026-11-19-book-glossary-layer-design.md) (S1).

## Global Constraints

- `server/` is CommonJS. Server test files `import` vitest and node builtins and load server modules with
  `createRequire(import.meta.url)`; copy the header of `server/__tests__/importConcepts.test.js`.
- `tools/lib/*.cjs` exists only for modules consumed by both trees; the terms hash is one. No file under `scripts/` or
  `tools/` may require anything under `server/` (root `LICENSE`, gap E-2).
- Resolve every path from `__dirname` or the `projectRoot`/`booksDir` parameters, never `process.cwd()`.
- Outcome strings: refusals start with `refused-`; resolved outcomes do not. This PR adds `refused-layer-change`
  (refusal), `restamped` and `released` (resolved). Assert outcome strings literally.
- The stamp is a top-level key of the written payload, `bookLayer: { lastChangeId: <integer> }`, present only when
  the book has layer history.
- The terms hash is the lowercase sha256 hex of `JSON.stringify(payload.terms)`.
- The held file is `<projectRoot>/pipeline-output/glossary-held/<slug>.json`, written atomically (`.tmp` + rename),
  replaced on every held run.
- An override flag requires `--book <slug>`; the cron runs the exporter bare and can reach none.
- `/api/health` is unauthenticated: it carries book slugs and outcome names only, never `detail`, messages or paths.
- A deploy-readout block always exits 0.
- Run tests from the repo root. The full floor is `npm test`, `npm run lint` and `npm run format:check`; E2E runs in
  CI's `e2e` job. No document records a test count or a CI verdict.

## Review Focus

1. **A book with no layer history** (physics, biology, organic) must behave byte-for-byte as before: no `bookLayer`
   key, no restamp write, no hold. → Task 2, test `a book without layer history is written exactly as before`.
2. **An unreadable layer change id** (database missing, locked, or older than migration 058) must fail the book
   closed — outcome `error`, nothing written, nothing held — never read as "no layer". → Task 2, test
   `an unreadable layer change id fails the book closed`.
3. **A release does not stand down the other gates**: a held export that also shrinks past the shrink ratio still
   refuses as `refused-shrink`. → Task 3, test `release does not stand down the shrink gate`.
4. **A hand-typed hash**: uppercase, padded with spaces, 63 characters, or the next flag. → Task 3, parseArgs tests.
5. **A second held run after the layer moved again** replaces the held file and its hash, while the hold's `since`
   keeps the first run's time. → Task 2, test `a second held run replaces the held file and keeps since`.

---

### Task 1: The layer's change id, and a record write that never creates a directory (T4e)

**Files:**
- Modify: `server/lib/bookGlossaryLayer.js` (new exports beside `createBookGlossaryRecordFn`;
  `writeBookGlossaryRecord` at the `mkdirSync`)
- Create: `server/__tests__/bookGlossaryChangeId.test.js`
- Modify: `server/__tests__/bookGlossaryRecord.test.js`

**Interfaces:**
- Produces: `lastLayerChangeId(db, bookSlug: string): number | null` — the largest `book_glossary_change.id` of the
  book; `null` when it has none or the slug is not a registered book.
- Produces: `createLayerChangeIdFn(dbPath?: string): (bookSlug: string) => number | null` — opens the database
  lazily and read-only on first call (`dbPath || resolveDbPath()`), as `createBookGlossaryRecordFn` does; an
  unreadable database **throws**.
- Produces: `writeBookGlossaryRecord(outDir, record): 'written' | 'unchanged' | 'no-glossary-dir'`.

- [ ] **Step 1: Write the failing tests.** In the new file, set up a migrated temporary database with two registered
  books, as `server/__tests__/bookGlossaryRecord.test.js` does, and write layer rows with `addExclusion`.
  - `lastLayerChangeId is null for a book with no layer history` → `expect(lastLayerChangeId(db, 'bok-b')).toBeNull()`
  - `lastLayerChangeId is the largest change id of that book only`: two exclusions on `bok-a`, one later on `bok-b` →
    equals `SELECT MAX(id) FROM book_glossary_change WHERE book_id = <bok-a id>`, and differs from `bok-b`'s
  - `lastLayerChangeId is null for an unregistered slug` → `toBeNull()`
  - `createLayerChangeIdFn throws on a missing database` → with a path that does not exist,
    `expect(() => fn('bok-a')).toThrow(/unable to open database file/)`, and the file is not created

  In `bookGlossaryRecord.test.js`:
  - `writeBookGlossaryRecord does not create a missing glossary directory` → on a path whose directory does not
    exist, returns `'no-glossary-dir'`, and `existsSync(dir)` is `false`

- [ ] **Step 2: Run them; expect failures** (`lastLayerChangeId is not a function`; the record test gets `'written'`).
  Run: `npx vitest run server/__tests__/bookGlossaryChangeId.test.js server/__tests__/bookGlossaryRecord.test.js`

- [ ] **Step 3: Implement** the two functions and export them. In `writeBookGlossaryRecord`, replace the
  `mkdirSync(outDir, { recursive: true })` with an existence check that returns `'no-glossary-dir'`.

- [ ] **Step 4: Run them; expect PASS.** Same command, plus `server/__tests__/loadBookGlossary.test.js`.

- [ ] **Step 5: Commit**
  ```bash
  git add server/lib/bookGlossaryLayer.js server/__tests__/bookGlossaryChangeId.test.js server/__tests__/bookGlossaryRecord.test.js
  git commit -m "feat(book-glossary): read the layer's last change id; the record never creates glossary/ (§C239 T4e)"
  ```

### Task 2: The stamp, the hold, the held file and restamp

**Files:**
- Create: `tools/lib/glossary-terms-hash.cjs`
- Modify: `server/scripts/export-terminology.js` (`runGlossaryExport`: new option, the gate after the `sameTerms`
  check, the stamp on every write, restamp in the unchanged branch; the header comment's gate list)
- Create: `server/__tests__/glossaryExportLayerHold.test.js`
- Modify: `server/__tests__/glossaryExportRun.test.js` (`run()` helper), `server/__tests__/glossaryExportBookSet.test.js`
  (both calls), `server/__tests__/bookGlossaryRecord.test.js` (`runExport`),
  `server/__tests__/glossaryExportDefaultWiring.test.js` (new case)

**Interfaces:**
- Consumes: `createLayerChangeIdFn` (Task 1).
- Produces: `termsSha256(payload: {terms: unknown[]}): string` from `tools/lib/glossary-terms-hash.cjs`; throws a
  `TypeError` when `payload.terms` is not an array.
- Produces: `runGlossaryExport({ ..., layerChangeIdFn = createLayerChangeIdFn() })`, where
  `layerChangeIdFn: (slug) => number | null`.
- Produces: the status entry of a held book:
  `{ outcome: 'refused-layer-change', detail: 'layer moved: stamp <n|none> → <id>', termsSha256: '<hex>', held: 'pipeline-output/glossary-held/<slug>.json' }`
  (plus `integrity` when present).

**The rules** (`stamp` = the committed file's `bookLayer.lastChangeId`, `undefined` when absent; `id` = `layerChangeIdFn(slug)`):
- Read `id` once per book **after** the malformed-payload check, so the default-wiring test's
  `export failed — …` pin still comes first. A throw is `fail(b, 'book layer change id unreadable — <message>')`:
  error, nothing written, nothing held.
- **Unchanged terms:** when `id !== null && stamp !== id`, rewrite the file with the current stamp, outcome
  `restamped` (in a dry run: log it and record `dry-run`, write nothing). Otherwise `unchanged`, as today.
- **Changed terms, after the `sameTerms` check and before the shrink gate:** when `id !== null && stamp !== id`, hold:
  outcome as above, the committed file untouched; unless a dry run, write the held file with exactly the bytes the
  write would produce (the persisted payload including the stamp). Log one line naming the slug, the stamp, the id
  and the held path.
- **Every write** (`wrote`, `adopted`, `restamped`, and Task 3's `released`) carries `bookLayer: { lastChangeId: id }`
  when `id !== null`, and no `bookLayer` key otherwise.
- `book-glossary.json` is still written first in the loop, unchanged.
- The gate also applies after `--adopt` (an absent or unreadable committed file has no stamp): adopting a book that
  has layer history then needs `--release-layer` too (Task 3) — two risks, two acknowledgements, as the script's
  header requires. Pin it: `an adopted first export of a book with layer history is held`.

- [ ] **Step 1: Add `layerChangeIdFn: () => null` to the existing callers** that inject `exportFn`: the `run()` helper
  in `glossaryExportRun.test.js`, both calls in `glossaryExportBookSet.test.js`, and `runExport` in
  `bookGlossaryRecord.test.js`. Run those three files; expect PASS (the option is ignored until Step 4).

- [ ] **Step 2: Write the failing tests** in `glossaryExportLayerHold.test.js`, reusing `glossaryExportRun.test.js`'s
  harness shape (`payload`, `approved`, `seedBook`, `run`). A seeded committed file carries a stamp when the test
  says so: `{ ...payload(terms), bookLayer: { lastChangeId: n } }`.
  - `termsSha256 is the sha256 of JSON.stringify(terms)` and `termsSha256 throws on a payload without a terms array`
  - `a book without layer history is written exactly as before` (`layerChangeIdFn: () => null`, terms change) → `wrote`,
    and the written file has no `bookLayer` property
  - `a write stamps the current change id` (committed stamp 7, id 7, terms change) → `wrote`,
    `readExport(slug).bookLayer` equals `{ lastChangeId: 7 }`
  - `a layer change holds the export` (stamp 7, id 9, terms change) → status outcome `'refused-layer-change'`, the
    committed file's bytes unchanged, return code 0, heartbeat written
  - `a committed file without a stamp is held when the terms differ` (no stamp, id 9) → `'refused-layer-change'`
  - `the held file is the would-be export` → its `terms` equal the export's, its `bookLayer.lastChangeId` is 9
  - `the status carries the held export's terms hash and path` → `termsSha256` equals `termsSha256(heldFile)`,
    `held` equals `'pipeline-output/glossary-held/prufubok.json'`, `detail` equals `'layer moved: stamp 7 → 9'`
  - `the record is still written when the export is held` (`recordFn` returns a record) → `book-glossary.json` exists
  - `unchanged terms with a stale stamp are restamped` (stamp 7, id 9, same terms) → `'restamped'`, terms unchanged,
    stamp 9
  - `unchanged terms with a current stamp are not rewritten` (stamp 9, id 9) → `'unchanged'`, mtime unchanged
  - `an unreadable layer change id fails the book closed` (`layerChangeIdFn: () => { throw new Error('boom') }`) →
    outcome `'error'`, detail matches `/book layer change id unreadable — boom/`, committed file unchanged, no held file
  - `a second held run replaces the held file and keeps since` (run at `nowMs` T1 with id 9; run at T2 with id 10 and
    other terms) → held file stamp 10, `termsSha256` of the second export, `since` equals T1's ISO time
  - `a dry run reports a hold and writes no held file` → a log line names the hold; no held file; committed file unchanged

  In `glossaryExportDefaultWiring.test.js`, following its existing missing-database case:
  - `the layer change id is read from the database by default` — `exportFn` injected and succeeding,
    `layerChangeIdFn` left defaulted, the database path missing → outcome `'error'`, detail matches
    `/book layer change id unreadable — .*unable to open database file/`, nothing written

- [ ] **Step 3: Run them; expect failures** (`Cannot find module …glossary-terms-hash.cjs`, then `wrote` where a hold
  is expected).
  Run: `npx vitest run server/__tests__/glossaryExportLayerHold.test.js server/__tests__/glossaryExportDefaultWiring.test.js`

- [ ] **Step 4: Implement** `termsSha256` and the rules above in `runGlossaryExport`. Update the script's header
  comment so its gate list names the layer gate and restamp.

- [ ] **Step 5: Run the exporter's whole neighbourhood; expect PASS.**
  Run: `npx vitest run server/__tests__/glossaryExport server/__tests__/bookGlossary server/__tests__/loadBookGlossary.test.js`

- [ ] **Step 6: Commit**
  ```bash
  git add tools/lib/glossary-terms-hash.cjs server/scripts/export-terminology.js server/__tests__/glossaryExportLayerHold.test.js server/__tests__/glossaryExportRun.test.js server/__tests__/glossaryExportBookSet.test.js server/__tests__/bookGlossaryRecord.test.js server/__tests__/glossaryExportDefaultWiring.test.js
  git commit -m "feat(glossary-export): hold glossary-unified.json when the book layer moved (refused-layer-change), stamp and restamp"
  ```

### Task 3: Release

**Files:**
- Modify: `server/scripts/export-terminology.js` (`parseArgs`, `runGlossaryExport`, `main`, the `--help` text)
- Modify: `server/__tests__/glossaryExportLayerHold.test.js`

**Interfaces:**
- Consumes: `termsSha256` and the hold (Task 2).
- Produces: `parseArgs(argv)` returns `{ book, dryRun, force, adopt, releaseLayer, help, error }`, with
  `releaseLayer: string | null` on **every** return path.
- Produces: `runGlossaryExport({ ..., releaseLayer = null })`.

**The rules:**
- `--release-layer` takes the next argument; the value is trimmed and lowercased and must match `/^[0-9a-f]{64}$/`,
  else an error naming the flag. A next argument starting with `-` is an error, as for `--book`. The override-scoping
  error covers it: `--release-layer` without `--book` is refused, listed beside `--adopt`/`--force` in that message.
- In `runGlossaryExport`, at the hold: when `releaseLayer === termsSha256(next)`, continue to the shrink and growth
  gates instead of holding; a write that follows records `released` (or `adopted` when that clause applies). When
  `releaseLayer` is set and differs, hold as usual and log both hashes with the words "test again". When it is set and
  nothing is held for the book, log that it has no effect and proceed as normal.
- `main` passes `releaseLayer`; `--help` gains one line: release a held book-layer change after testing it, with
  `scripts/check-held-glossary.sh`.

- [ ] **Step 1: Write the failing tests.**
  - `release with the held hash writes the export, stamped` (hold, read `termsSha256` from the status, rerun with it)
    → outcome `'released'`, the file's terms are the export's, its stamp the current id
  - `release with a stale hash refuses and names both hashes` → `'refused-layer-change'`, file unchanged, the error
    log contains both hashes
  - `release does not stand down the shrink gate` (a held export that shrinks below `SHRINK_RATIO`, released with its
    own hash) → `'refused-shrink'`, file unchanged
  - `release with nothing held has no effect` (stamp current, terms change, a hash given) → `'wrote'`, a log line says
    so
  - `after a release the next bare run reads unchanged` → `'unchanged'`, no held state in the status
  - parseArgs: `parses --release-layer trimmed and lowercased` (`' ABC…(64)… '` → lowercase value);
    `rejects a value that is not 64 hex characters` (63 characters; `'xyz'`); `requires --book`;
    `does not swallow the next flag as its value` (`['--release-layer', '--book', 'x']`);
    `reports releaseLayer on every return path` (each early error return has a `releaseLayer` key, as the existing
    `reports adopt on EVERY return path` test does for `adopt`)

- [ ] **Step 2: Run them; expect failures.**
  Run: `npx vitest run server/__tests__/glossaryExportLayerHold.test.js`

- [ ] **Step 3: Implement** the rules.

- [ ] **Step 4: Run; expect PASS.**
  Run: `npx vitest run server/__tests__/glossaryExport scripts/__tests__/deploy-health-readout.test.mjs`
  (the readout test feeds printed commands through `parseArgs`, so it must stay green).

- [ ] **Step 5: Commit**
  ```bash
  git add server/scripts/export-terminology.js server/__tests__/glossaryExportLayerHold.test.js
  git commit -m "feat(glossary-export): --release-layer <terms-hash> releases exactly the tested export"
  ```

### Task 4: Visibility — record errors in `/api/health` (T4h) and the deploy readout

**Files:**
- Modify: `server/lib/glossaryExportHealth.js` (`readGlossaryExportHealth`)
- Modify: `scripts/deploy.sh` (the glossary block's `remedy` map, and a record-error line)
- Modify: `server/__tests__/glossaryExportHealth.test.js`, `scripts/__tests__/deploy-health-readout.test.mjs`

**Interfaces:**
- Consumes: the status file's `bookGlossaryRecords` (`{[slug]: 'written'|'unchanged'|'none'|'no-glossary-dir'|'error: …'}`)
  and the `refused-layer-change` outcome (Task 2).
- Produces: `readGlossaryExportHealth(...)` returns `record_errors: string[]` (sorted slugs) beside its existing
  fields, and `ok` is also false when it is non-empty.

**The rules:**
- A record error is a value that starts with `error` or equals `no-glossary-dir`. Only slugs leave the function.
- `remedy('refused-layer-change', slug)` says a book-layer change is held and names
  `scripts/check-held-glossary.sh <slug>`, run on a dev box, which tests the held export and prints the release
  command. It prints no exporter command.
- For each `record_errors` slug the readout prints
  `  ⚠ <slug>: book glossary record not written — read pipeline-output/.glossary-export-status.json on the box`.

- [ ] **Step 1: Write the failing tests.**
  - health: `a record write error is listed by slug and makes ok false`; `no-glossary-dir is a record error`;
    `written, unchanged and none are not record errors`; `record_errors never carries the message` (the serialised
    result does not contain the error text); `a refused-layer-change older than the threshold is a stale refusal`
  - readout: `a STALE refused-layer-change names check-held-glossary.sh and prints no exporter command` (no extracted
    command; matches `/check-held-glossary\.sh efnafraedi-2e/`); `a record error prints its slug line`; the existing
    `a mixed run round-trips EVERY printed command` stays green with a `refused-layer-change` book added to it

- [ ] **Step 2: Run them; expect failures.**
  Run: `npx vitest run server/__tests__/glossaryExportHealth.test.js scripts/__tests__/deploy-health-readout.test.mjs`

- [ ] **Step 3: Implement** the rules.

- [ ] **Step 4: Run; expect PASS.** Same command, plus `server/__tests__/glossaryExportRun.test.js` (the third file
  that reads `readGlossaryExportHealth`).

- [ ] **Step 5: Commit**
  ```bash
  git add server/lib/glossaryExportHealth.js scripts/deploy.sh server/__tests__/glossaryExportHealth.test.js scripts/__tests__/deploy-health-readout.test.mjs
  git commit -m "feat(health): record write errors reach /api/health and the deploy readout (§C239 T4h); a remedy for refused-layer-change"
  ```

### Task 5: The developer's check script

**Files:**
- Create: `scripts/check-held-glossary.sh`
- Create: `scripts/__tests__/check-held-glossary.test.mjs`

**Interfaces:**
- Consumes: `termsSha256` (Task 2), by `node -e` requiring `tools/lib/glossary-terms-hash.cjs` (no `server/` code).
- Produces: `scripts/check-held-glossary.sh <slug>` and `scripts/check-held-glossary.sh --hash-only <file>`.
  Exit codes: 0 every premise pin passed; 1 a pin failed; 2 usage or refusal (bad slug, `PROD_SSH` unset, no held
  export on production, production's HEAD not on `origin`).

**The behaviour** (design §5.7):
- `PROD_SSH` (for example `user@host`) is required; `PROD_REPO` defaults to `~/repos/namsbokasafn-efni`. The host is
  never written into the script.
- Over ssh, read-only: production's `git rev-parse HEAD`, and a copy of
  `pipeline-output/glossary-held/<slug>.json`. It never writes to production.
- `git fetch origin`; refuse when production's HEAD is not a commit here.
- A temporary detached worktree at production's HEAD, with the main checkout's `node_modules` and
  `server/node_modules` linked in; removed on exit by a `trap`, whatever the result.
- The held file copied to `books/<slug>/glossary/glossary-unified.json` in the worktree; the premise-pin files found
  there with `grep -rlaF 'glossary-unified.json' tools/__tests__ server/__tests__ scripts/__tests__`, kept to
  `*.test.{js,mjs,cjs}`; run with `npx vitest run <files>` from the worktree root, **without a pipe** (a pipe hides
  the exit code).
- Prints the verdict, the failing files by name, the terms hash computed from the copied file, and the release
  command: `node server/scripts/export-terminology.js --book <slug> --release-layer <hash>` (to run on production).

- [ ] **Step 1: Write the failing tests** (no network):
  - `exits 2 and names PROD_SSH when it is unset` (slug given, `PROD_SSH` removed from the env)
  - `exits 2 on a slug that is not [a-z0-9-]+` (`'../x'`)
  - `--hash-only prints the exporter's terms hash` (a fixture payload file → stdout trimmed equals
    `termsSha256(payload)`)

- [ ] **Step 2: Run; expect failures** (script missing).
  Run: `npx vitest run scripts/__tests__/check-held-glossary.test.mjs`

- [ ] **Step 3: Implement** the script.

- [ ] **Step 4: Run; expect PASS.** Then run `bash scripts/check-held-glossary.sh --help` and confirm it prints the
  usage, the exit codes and the `PROD_SSH` requirement.

- [ ] **Step 5: Commit**
  ```bash
  git add scripts/check-held-glossary.sh scripts/__tests__/check-held-glossary.test.mjs
  git commit -m "feat(scripts): check-held-glossary.sh tests a held glossary export against the premise pins"
  ```

### Task 6: The register, the runbook and the floor

**Files:**
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (a new dated entry at the top of the RESUME block)

- [ ] **Step 1: Write the register entry**: PR 1 built (commits listed); the release runbook in four lines (cron holds →
  `scripts/check-held-glossary.sh <slug>` on a dev box → [USER] runs the printed release on production → the next cron
  commits); and the first-run expectation to check after the deploy: chemistry's first cron run reads `restamped`
  once (its committed file has no stamp and its terms are unchanged), and every other book reads as before. Its NEXT:
  [USER] reviews the PR; deploy it before PR 2's routes can change the layer (design §5.10).

- [ ] **Step 2: Draft, do not commit, a CLAUDE.md bullet** for [USER] beside the glossary gates (the shrink, producer
  and absent-baseline gates): a book-layer change holds `glossary-unified.json` as `refused-layer-change` until a
  developer runs `scripts/check-held-glossary.sh` and releases with `--release-layer <hash> --book <slug>`; the cron
  cannot release; `--force`/`--adopt` do not substitute. Put the draft in the PR description; CLAUDE.md changes only
  with [USER]'s approval.

- [ ] **Step 3: Run the full floor.**
  Run: `npm test` then `npm run lint` then `npm run format:check`
  Expected: each exits 0. Report any red by test name, including one this PR did not cause.

- [ ] **Step 4: Commit**
  ```bash
  git add docs/plans/2026-07-21-post-item17-followup-campaign.md
  git commit -m "docs(register): book glossary stage 2 PR 1 (the export hold) built; release runbook"
  ```
