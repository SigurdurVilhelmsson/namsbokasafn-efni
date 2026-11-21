# G1.15(b) Retention Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the editing tool's four retention dates automatically, and first make the public glossary record show a role instead of a name.

**Architecture:** One owner of the dates (`server/lib/retentionDates.js`); one classification of every person column (`server/lib/editorialRetentionScope.js`) pinned by a schema-anchored test; a pure core (`server/lib/editorialRetention.js`) that plans and applies each step against a clock argument; a thin CLI (`server/scripts/editorial-retention.js`) the backup cron calls before its copy; a health check. Task 1 is independent and ships on its own PR first.

**Tech Stack:** Node 22, CommonJS `server/`, better-sqlite3 (resolved from `server/`), Vitest, bash cron scripts.

**Spec:** `docs/superpowers/specs/2026-11-21-g115b-retention-dates-design.md` (approved 2026-11-21). Dates: `docs/decisions/2026-11-21-retention-dates-2028-2029-2030.md`.

## Global Constraints

- Dates: `NAMED_EDITING_RECORDS = '2028-12-31'`, `UNNAMED_RECORDS = '2029-12-31'`, `RESEARCH_RAW_ROWS = '2029-12-31'`, `CONSENT_RECORDS = '2030-12-31'`. A date takes effect at 00:00 UTC on the day after.
- Editing ends with 2028: a record dated after a step's date is never acted on; the step refuses where acting would be unsafe, and the refusal is visible on `/api/health`.
- A committed file never carries an editor's display name, email or account id.
- Server tests import vitest and node builtins, and `createRequire(import.meta.url)` for server modules (header of `server/__tests__/importConcepts.test.js`). Run `npm test` from the repo root.
- A migration never throws (CLAUDE.md, boot wedge); foreign keys are ON in every connection.
- A CLI sets `process.exitCode`; it never calls `process.exit()` after writing output.
- No grant or fund is named anywhere.

## Review Focus

1. **A role change or a deleted account must not rewrite a past row of the glossary record**: the label is the authority the write required, so it is the same before and after. Task 1 pins it.
2. **Two editors' pending edits on one segment must both strip** without violating `idx_segment_edits_one_pending` / `idx_loc_pending_one_per_editor`. Task 5 pins it.
3. **A record dated after a date is untouched and raises the refusal**, including a two-actor row whose reviewer acted after the date. Tasks 5 and 6 pin it.
4. **A failure mid-step leaves nothing half-stripped and records no run**: each step is one transaction, and a failed verification records nothing. Tasks 5 and 7 pin it.
5. **Before 2029 the cron changes nothing and the health check is ok**, so shipping early is inert. Task 8 pins it.

---

### Task 1: The committed glossary record shows the role, and dates (spec §4.5)

Ships first, on its own branch and PR: each head-editor decision recorded before it commits a display name to public git history for good.

**Files:**
- Modify: `server/lib/bookGlossaryLayer.js` (`buildBookGlossaryRecordBody`; new `recordLabelFor`, `recordDay`; export `recordLabelFor`)
- Test: `server/__tests__/bookGlossaryRecord.test.js` (the describe `the record shows names, never emails or inflections` becomes `the record shows the role, never a name`; `displayNameFor`'s own cases move to a describe for the head editor's screen, unchanged)
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (register: G1.15(b) Task 1 built)

**Interfaces:**
- Produces: `recordLabelFor(by) → string`. **Changed at the final review (2026-11-21, Important 3): it fails closed.** A known tool label passes through (`isToolLabel(by)`, true only for a member of `TOOL_LABELS`, which today holds `C19_LOAD_LABEL`, the c19 loader's label, imported by `server/scripts/load-book-glossary.js`); anything else, whether an account id of any shape, a retention placeholder or an unlisted label, is `'aðalritstjóri'`. The first build listed account shapes (a `users` row, a GUID, an `@`) and let everything else through, which would have published a numeric id whose row was gone. Later tasks use `isToolLabel` and `C19_LOAD_LABEL` from `bookGlossaryLayer.js`. `displayNameFor` is unchanged: the head editor's screen (`server/routes/book-glossary.js`) keeps showing names.
- Produces: `recordDay(t) → string|null`. The `YYYY-MM-DD` an ISO-shaped time starts with; `null` stays `null`.
- **Ruling (plan):** every write route is behind `requireHeadEditor('book')`, so the label names the authority the act required, not the account's current role. A later role change or account deletion therefore cannot rewrite a past row of the cumulative record.
- The first export after deploy rewrites every time in the committed record to its date: one diff, expected.
- **Final review (2026-11-21):** the terms page's notice (`UI.bookGlossary.publicNotice`) said the head editor's name is published; it now says the record shows `aðalritstjóri`, not their name, and still says the reason and source are public (`server/__tests__/ui-strings.test.js`). The label cases in Step 1 below are the first build's; the built tests are the fail-closed ones.

- [ ] **Step 1: Write the failing tests** (in the renamed describe; reuse `addUser`, `GUID`, `historyBys`, `base`)

```js
it("an account's decision is written as aðalritstjóri, never its display name", () => {
  addUser(GUID, 'Jóna Jónsdóttir', 'head-editor');
  addExclusion(db, { ...base, by: GUID, english: 'Function' });
  const rec = buildBookGlossaryRecord(db, BOOK);
  expect(rec.history.map((h) => h.by)).toEqual(['aðalritstjóri']);
  expect(rec.exclusions[0].createdBy).toBe('aðalritstjóri');
  expect(JSON.stringify(rec)).not.toContain('Jóna');
});
it('the label does not follow a later role change or a deleted account', () => {
  addUser(GUID, 'Jóna Jónsdóttir', 'head-editor');
  addExclusion(db, { ...base, by: GUID, english: 'Function' });
  db.prepare("UPDATE users SET role = 'editor' WHERE provider_id = ?").run(GUID);
  expect(historyBys()).toEqual(['aðalritstjóri']);
  db.prepare('DELETE FROM users WHERE provider_id = ?').run(GUID);
  expect(historyBys()).toEqual(['aðalritstjóri']);
});
it('an account id with no users row, GUID- or email-shaped, is written as aðalritstjóri', () => {
  expect(recordLabelFor(db, GUID)).toBe('aðalritstjóri');
  expect(recordLabelFor(db, 'someone@skoli.example')).toBe('aðalritstjóri');
});
it('the c19 label and a free label pass through', () => {
  const c19 = 'c19-load ([USER] rulings 2026-11-18)';
  expect(recordLabelFor(db, c19)).toBe(c19);
  expect(recordLabelFor(db, 'tester')).toBe('tester');
});
it('every time a person acted is a date; generated stays a full time', () => {
  const e = addEntry(db, { ...base, english: ['unit cell'], icelandic: 'grindareining' });
  changeEntry(db, { ...base, conceptId: e.conceptId, icelandic: 'grindareiningar' });
  addExclusion(db, { ...base, english: 'Function' });
  const rec = buildBookGlossaryRecord(db, BOOK);
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  const times = [
    ...rec.history.map((h) => h.at),
    ...rec.exclusions.map((x) => x.createdAt),
    ...rec.entries.flatMap((x) => [x.createdAt, x.updatedAt]),
  ];
  expect(times.length).toBe(6); // control: 3 history rows + the exclusion's time + the entry's two
  for (const t of times) expect(t).toMatch(DAY);
  expect(rec.generated).toMatch(/T\d{2}:\d{2}/); // control: the export time is not cut
});
```

Adapt the existing `no email and no account id anywhere in the record` case: its expected `'lesandi'` becomes `'aðalritstjóri'`, and it also asserts the display name is absent. Replace the fixed-point case's `displayNameFor` with `recordLabelFor` (the committed record's c19 labels pass through). Count the controls against the real calls before relying on them: adjust `times.length` to what the fixture actually writes, and say so in the test.

- [ ] **Step 2: Run to watch them fail**

Run: `npx vitest run server/__tests__/bookGlossaryRecord.test.js`
Expected: FAIL. The name cases receive `'Jóna Jónsdóttir'`/`'lesandi'`, the time case receives full ISO times, and `recordLabelFor` is not a function.

- [ ] **Step 3: Implement** `recordLabelFor` and `recordDay` beside `displayNameFor` (reuse `GUID_SHAPE`), and use them for every `createdBy`/`updatedBy`/`by` and `createdAt`/`updatedAt`/`at` in `buildBookGlossaryRecordBody`. `updatedBy` stays `null` when `updated_by` is null. JSDoc on both, citing spec §4.5 and the glossary layer spec's ✏️ note.

- [ ] **Step 4: Run the record, export and freeze tests**

Run: `npx vitest run server/__tests__/bookGlossaryRecord.test.js server/__tests__/glossaryExportLayerHold.test.js server/__tests__/studyFreezeManifest.test.js`
Expected: PASS

- [ ] **Step 5: Gates, register, commit.** `npm test`, `npm run lint`, `npm run format:check` from the root, all exit 0. Register line under the c46 entry's G1.15(b): Task 1 built on `feat/g115b-glossary-record-role`; the first export after deploy rewrites the record's times to dates. Commit `fix(privacy): G1.15(b) — the glossary record shows the head editor's role, not a name`.

### Task 2: One owner of the dates (spec §4.1)

**Files:** Create `server/lib/retentionDates.js`; Modify `server/lib/researchRetention.js`; Test `server/__tests__/retentionDates.test.js`, `server/__tests__/researchRetention.test.js`.

**Interfaces:** Produces `{ NAMED_EDITING_RECORDS, UNNAMED_RECORDS, RESEARCH_RAW_ROWS, CONSENT_RECORDS, effectiveMs(date) }`, where `effectiveMs('2028-12-31') === Date.UTC(2029, 0, 1)`. `researchRetention.js`'s `RETENTION_DATE` becomes `RESEARCH_RAW_ROWS`, and its docstring cites the decision record as SD6's record.

- [ ] Tests first: the four values; `effectiveMs` for each; `RETENTION_DATE === '2029-12-31'`; `research-retention.js`'s `isDue` is false at `effectiveMs(RESEARCH_RAW_ROWS) - 1` and true at `effectiveMs(RESEARCH_RAW_ROWS)` on a fresh research DB. Watch them fail, implement, run, commit.

### Task 3: `retention_runs` (migration 059)

**Files:** Create `server/migrations/059-retention-runs.js`; Test `server/__tests__/retentionRunsMigration.test.js`.

**Interfaces:** Table `retention_runs(kind TEXT NOT NULL CHECK (kind IN ('named','unnamed','consent')) UNIQUE, done_at_ms INTEGER NOT NULL CHECK (done_at_ms > 0), rows_changed INTEGER NOT NULL)`. `up()` is only the never-throw boundary (048's shape).

- [ ] Tests first: the table exists after `runAllMigrations`; a second `up()` is a no-op; a planted failure inside `up()` warns and does not throw. Commit.

### Task 4: Every person column, classified once (spec §4.2)

**Files:** Create `server/lib/editorialRetentionScope.js`; Test `server/__tests__/editorialRetentionScope.test.js`.

**Interfaces:** Produces `SCOPE`, keyed by table: `{ action: 'strip'|'delete'|'keep'|'consent', person: [{ col, timeCol, type: 'text'|'integer' }], times: [col], jsonTimes?: [col] }`. `timeCol` is the actor's own time (§4.3), or the row's creation time when the actor has none. `localization_logs` has `jsonTimes: ['entries']`.

- [ ] Tests first, against a schema built by `runAllMigrations` in a temp dir:
  - every column matching the census pattern (`~/.cache/namsbokasafn-audit/2026-11-21-c46/g115b-schema-census.cjs`, pattern copied into the test) plus the explicit list (`assigned_to`, `by`, `localizer`, `responder_id`, `responder_name`, `user_email`, `user_name`) is classified, failing by name otherwise;
  - control: the table count found equals 34;
  - every `timeCol` exists in its table;
  - a list of every unique index that contains a strip column, asserted equal to `['idx_loc_pending_one_per_editor', 'idx_segment_edits_one_pending']` (re-derive it; add any others found).

  Watch red, implement the table from spec §4.2, commit.

### Task 5: Step 1, `named` (spec §4.3, §4.4 step 1)

**Files:** Create `server/lib/editorialRetention.js`; Test `server/__tests__/editorialRetention.test.js` (+ a planting helper in `server/__tests__/helpers/`).

**Interfaces:** Produces `planStep(db, kind, nowMs) → { due: boolean, refusal: null|{reason, rows}, counts }` and `applyStep(db, kind, nowMs) → { changed, refusal }`. The `named` step, in one transaction: placeholders `fjarlægt-<rowid>` (text) and `-<rowid>` (integer), set on each person column whose `timeCol` is on or before the date; times in those rows cut to the day (text `YYYY-MM-DD`, `*_ms` to that day's 00:00 UTC, `jsonTimes` inside the JSON); `delete` tables lose their date-covered rows. Rows dated after the date are untouched and reported as `refusal: { reason: 'later-records' }` (step 1 still applies).
- **Ruling (final review of Task 1, Important 1): the strip must leave the public glossary record unchanged.** Two consequences:
  - The `book_glossary_exclusion`, `book_glossary_entry` and `book_glossary_change` person columns (`created_by`, `updated_by`, `by`) are stripped **through the layer's write API**, never by SQL from `editorialRetention.js` (CLAUDE.md: the book layer is written only through `server/lib/bookGlossaryLayer.js`). Add `stripLayerPersons(db, { throughDay })` there; `applyStep('named')` calls it inside its own transaction. It skips every value for which `isToolLabel` is true, so the c19 loader's 152 rows keep their label.
  - A stripped account value becomes `fjarlægt-<rowid>`, which `recordLabelFor` writes as `aðalritstjóri` (it fails closed), and the layer's times are already days in the record. So the committed record is the same before and after.
- **As built (2026-11-21):**
  - The SQL lives in `server/lib/retentionStrip.js`, which requires nothing. The layer calls it from `stripLayerPersons` and `surveyLayerPersons`, so the require goes one way: core → layer → strip.
  - `planStep`/`applyStep` return `refusals: [{ reason, table, rows }]`, not one `refusal`. The reasons are `later-records`, `unreadable-time`, `undated-name` and `unreadable-json`. Each is left as it is and reported, and the step still applies to everything else (fail closed).
  - Every trigger on a strip table is dropped and recreated from `sqlite_master` inside the step's IMMEDIATE transaction. Four tables' triggers stamp `updated_at` with the current time.
  - Times are cut only where they are covered. A time after the date is never touched, even in a stripped row.
- **Task 6 as built (2026-11-21):** an outright refusal is a `refusals` entry with `blocking: true`, and applyStep then writes nothing. Step 2 judges a reference by whether every present time in its row is readable and on or before 2028; a reference that cannot be shown to be is treated as later. Step 3 refuses outright on a record dated after 2030 ([USER], 2026-11-21).
- **Task 7 as built (2026-11-21):**
  - The run record is written only when verification passes **and** no refusal stands ([USER]). Usage errors exit 2, like `research-retention.js` ([USER]).
  - **The plan's "a mutant that skips VACUUM leaves the step unrecorded" was measured false.** The step was recorded with 12 names left in the file. The script therefore also sets `secure_delete = ON` on its write connection, and a test with free pages keeps `VACUUM` detectable.
  - Every due step is compacted before it is recorded, even when it changed nothing this run, because a previous run's bytes may remain.
- **Task 8 as built (2026-11-21):**
  - The order test lives in `scripts/__tests__/backup-db-retention.test.mjs`, beside `backup-db.test.mjs`, not in `tools/__tests__`.
  - `checks.retention` carries no row count: `/api/health` is public (the rule of `schemaHealth.js`).
  - The threshold reuses `offboxBackupHealth.js`'s `DEFAULT_STALE_HOURS`, since it is the same cron, and `RETENTION_STALE_HOURS` overrides it.

- [ ] Tests first, with a planting helper that writes one row per `SCOPE` table using names absent from `users`:
  - nothing changes before `effectiveMs`;
  - after it, every planted name is absent from every column (by value);
  - two pending edits by two editors on one segment both strip;
  - a two-actor row reviewed after the date keeps the reviewer and strips the author;
  - times are days, including inside `localization_logs.entries`;
  - a second `applyStep` changes nothing;
  - a later row raises the refusal;
  - a control `users` row is unchanged;
  - a thrown error mid-step leaves every row as it was;
  - `buildBookGlossaryRecord(db, book)` is deep-equal before and after `applyStep('named')`, with an account-made row and a c19-labelled row both planted (control: the account row's `by` in the database did change, and the c19 row's did not).

  Watch red, implement, commit.

### Task 6: Steps 2 and 3 (spec §4.4)

**Files:** Modify `server/lib/editorialRetention.js`; Test `server/__tests__/editorialRetention.test.js`.

**Interfaces:**
- `unnamed`: clears `served_version_id` in `segment_edits` and `segment_acceptances`, then deletes `served_text_versions` and `module_openings` (inflight rows cascade). It refuses before `named` is recorded, and refuses outright while a row dated after 2028 references a served version or an opening is dated after 2028.
- `consent`: deletes `research_consent` and `research_capture_losses`, and refuses before `research-retention.js` has recorded its retention deletion.
- **Ruling (plan), confirmed by [USER] on 2026-11-21:** `research_deletions` holds no person column (migration 056: kind, interval id, time, verified flag), so by spec §4.4 step 3 none of its rows is deleted. That keeps `research-retention.js` from becoming due again. The decision record's table lists deletion records as deleted after 2030; [USER] ruled they are kept (register, G1.15(b)), and the register wins over that frozen table.

- [ ] Tests first:
  - step 2 succeeds with references present, and a mutant that skips the clearing fails on the foreign key;
  - the ordering refusals;
  - the later-record refusal;
  - after step 3, `isDue` from `research-retention.js` is false.

  Watch red, implement, commit.

### Task 7: Compaction, verification, recording, the CLI (spec §4.4)

**Files:** Modify `server/lib/editorialRetention.js`; Create `server/scripts/editorial-retention.js`; Test `server/__tests__/editorialRetention.test.js`, `server/__tests__/editorialRetentionCli.test.js`.

**Interfaces:**
- After a step that changed rows: `wal_checkpoint(TRUNCATE)`, `VACUUM`, checkpoint again, each requiring `busy = 0` (copy `research-retention.js`'s sequence).
- Verification: strip columns in date-covered rows hold only placeholders; deleted tables hold no date-covered row; `freelist_count === 0`; the WAL is 0 bytes.
- A `retention_runs` row is inserted only when verification passes.
- CLI: dry run by default, `--write`, unknown flags refused, `process.exitCode` (0 nothing due or done; 1 refusal or failure).

- [ ] Tests first:
  - a byte scan of the file and WAL finds no planted name after a run (planted names are absent from `users`);
  - a mutant that skips `VACUUM` leaves the step unrecorded and due;
  - the CLI's dry run writes nothing;
  - an unknown flag exits 1.

  Watch red, implement, commit.

### Task 8: Cron and health (spec §4.6)

**Files:** Modify `scripts/backup-db.sh`, `server/index.js`; Create `server/lib/retentionHealth.js`; Test `server/__tests__/retentionHealth.test.js`, `tools/__tests__/backupDbRetentionOrder.test.js`.

**Interfaces:**
- `backup-db.sh` runs `node server/scripts/editorial-retention.js --write` before the `wal_checkpoint` + `cp`. A failure is logged and does not stop the copy.
- `readRetentionHealth({ db, nowMs }) → { ok, due: [kind], refusals: [...] }`, mounted as `checks.retention`. It is not ok when a step has been due and unrecorded for longer than `2 × 6 h + 2 h`, or when a refusal stands. The threshold is derived from `install-cron.sh`'s backup period, as `healthOffboxBackup.test.js` does.

- [ ] Tests first:
  - before 2029, `ok: true` with nothing due (Review Focus 5);
  - due longer than the threshold → not ok;
  - a refusal → not ok;
  - the script line precedes the copy (parsed from the file);
  - the threshold is derived from `install-cron.sh`.

  Watch red, implement, commit.

### Task 9: Register and docs

- [ ] Register (c46 entry, G1.15(b)): built, with the deploy steps (the first export rewrites record times; nothing acts before 2029-01-01) and the dependencies left outside (G1.20, the production log limits, consent item 14). Update the dashboard in the same session (CLAUDE.md).
