# G1.15(b) — the retention dates: design (APPROVED 2026-11-21)

> ✅ **DESIGN, APPROVED BY [USER] 2026-11-21, as written**, after the builder check's two questions were answered (§0).
> **Banner-frozen from approval: amended only by dated notes.** Not status: open work and its state live in the active register.

**Status:** DESIGN, approved 2026-11-21. The four dates are recorded in [`docs/decisions/2026-11-21-retention-dates-2028-2029-2030.md`](../../decisions/2026-11-21-retention-dates-2028-2029-2030.md).
**Register:** the c46 entry (G1.15) and the 2026-11-08 PR4 entry's G1.4 preconditions (precondition 5). **The register owns status; this document owns the design.**
**Rulings it implements:** [USER]'s consent rulings of 2026-11-09 (the dates) and the G1.15 answers of 2026-11-21: the split, recorded in [`docs/decisions/2026-11-21-g115-editor-privacy-split-and-sd7-scope.md`](../../decisions/2026-11-21-g115-editor-privacy-split-and-sd7-scope.md), and the three answers below (§3).

**Provenance.** Measured 2026-11-21 at `main` `241435790` by the scripts in `~/.cache/namsbokasafn-audit/2026-11-21-c46/` (`g115b-*`): the schema is built from the migrations in a throwaway directory; git history is searched with a glob pathspec whose control finds a known file. A builder check read the first draft; its five questions are answered in §4, two of them by [USER] (§0). Nothing is relayed.

## 0. [USER]'s answers to the builder check (2026-11-21)

1. **Editing ends with 2028.** Each step acts on the whole editorial database on its date, and the script **refuses and raises the health alarm** if it finds a record dated after a date (continued use, which the consent text does not cover), so a person decides then (§4.4). *Not chosen:* acting only on records from the consented period while live work goes on; that needs per-record survival rules and its own consent wording, and would be designed when a later end of editing is known. The dates are one file and one decision record, so moving them is cheap.
2. **The committed glossary record shows the role, not a name** (§4.5).

## 1. Intent

The consent text (version 1 draft, item 14 and its table) promises editors that the editing tool keeps:

| Records | Kept until |
|---|---|
| editing records that name a person (edits, acceptances, reviews, comments, suggestion decisions, the activity log) | **31 December 2028** |
| records with no name (the opening time of a unit and its snapshot; the served text versions) | **31 December 2029** |
| raw research rows (research database) | **31 December 2029** (deleted; a de-identified derived dataset is kept) |
| consent, deletion and loss records | **31 December 2030** |

and that copies in the editorial database's backups live at most 12 months longer. Only the raw research rows have a mechanism today (`server/scripts/research-retention.js`), and its date is unset (`server/lib/researchRetention.js`: `RETENTION_DATE = null`). G1.4's precondition 5 is that G1.15 implements the dates before the text is listed. This design does that.

**A consequence for the consent text:** [USER] chose to strip names rather than delete the records (§3), so item 14 must say that after 2028 names are removed and the records are kept without them, not that the records are deleted. A record without a name still carries its book, chapter and module, so someone who knows who edited a chapter can still tell whose it was: the text should say *names removed*, not *anonymous*. That is a wording change in [USER]'s private draft (G1.4), not built here.

## 2. Measured facts

- **34 of `sessions.db`'s 58 tables name a person** (a user id, a username, a display name, an email or a free label of who acted). §4.2 classifies every one.
- **23 of the 44 person columns to strip are `NOT NULL`** (`g115b-notnull.out`), so they cannot be cleared to NULL without rebuilding live tables. **None has a foreign key to `users`.** Two partial unique indexes key pending rows on their editor (migration 039 for `segment_edits`; `idx_loc_pending_one_per_editor`, migration 041).
- **Only one committed file, in all of git history, can carry an editor's name:** `books/<book>/glossary/book-glossary.json`, whose `entries[].createdBy/updatedBy`, `exclusions[].createdBy` and `history[].by` show an account's display name (never an email; the layer's `displayNameFor`), with times. Today every value is the c19 loader's label. Searched across history: every committed `books/**/*.json` that ever changed a person-shaped key (three commits: this record, and twice the `[FÁ Teacher]` role placeholder in a `status.json`); every committed `.jsonl` (340 files, 17,596 records: the `by` keys hold tool labels); no review-status sidecar was ever committed; the TMX files carry no `creationid`/`changeid`. Git history cannot be stripped.
- **The published credits** (`books/*/metadata.json` `ritstjorn`/`yfirlestur`, `templates/frontmatter.yaml`) name people on purpose: the book's attribution (CLAUDE.md, credit follows the method), not an editing record.
- `segment_edits.served_version_id` and `segment_acceptances.served_version_id` reference `served_text_versions(id)` with **no `ON DELETE` clause** (migration 053), and foreign keys are on here, so a referenced served version cannot be deleted until its references are cleared. **`served_text_versions` has no time column** (053: "no person and no time"). Live code reads it (`suggestionView.js`, `researchLog.js`), and `module_openings` decides suggestion eligibility (`suggestionView.js`), so deleting either changes live behaviour.
- `module_opening_inflight` references `module_openings` `ON DELETE CASCADE` (migration 054).
- `chapter_assignments.assigned_to`/`assigned_by` are `INTEGER NOT NULL REFERENCES users(id)` (migration 012).
- `localization_logs` is the Pass 2 record of each adaptation (`server/services/localizationLog.js`: type, original, changed to, reason); its `entries` JSON carries times a column-level cut does not reach.
- `research-retention.js` is due again whenever no retention deletion is recorded in `research_deletions` at or after its date.
- **G1.20's 12-month cap on editorial backups is not built.** The production log limits (nginx 14 days, journald 90 days) are production configuration, read by `server/scripts/read-research-preconditions.js`.

## 3. Approaches (chosen by [USER], 2026-11-21)

1. **On 31 December 2028, strip names in editing records and delete pure logs** — chosen. Editing records keep their content and status with every name and account id replaced and times cut to the date, so the editorial history stays usable for the translation memory and the report; logs with no lasting value are deleted. *Not chosen:* deleting every named record (the per-segment history is lost; only the files remain); stripping everything and deleting nothing (logs kept for no use).
2. **Scope: every table that names an editor, except the accounts table** — chosen, matching the consent text's broad wording ("gögn með nafni"). Accounts stay because people may still sign in; they are governed by account removal. *Not chosen:* only the consent text's six kinds.
3. **Automatic, on the backup cron** — chosen. A script runs every backup cycle, does nothing until a date has passed, then acts once and records it. *Not chosen:* a by-hand run with a reminder.

## 4. Design

### 4.1 One owner of the dates: `server/lib/retentionDates.js`

```
NAMED_EDITING_RECORDS = '2028-12-31'   // step 1
UNNAMED_RECORDS       = '2029-12-31'   // step 2
RESEARCH_RAW_ROWS     = '2029-12-31'   // research-retention.js (researchRetention.js reads it from here)
CONSENT_RECORDS       = '2030-12-31'   // step 3
```

An enforceable value with its test, per CLAUDE.md § One source of truth. A date takes effect at **00:00 UTC on the day after** (kept *until* 31 December means removed from 1 January). `researchRetention.js`'s `RETENTION_DATE` stops being a literal and reads `RESEARCH_RAW_ROWS`; its docstring requires the change to cite the record that sets the date, so the approval commit wrote a **public decision record of the four dates**, [`docs/decisions/2026-11-21-retention-dates-2028-2029-2030.md`](../../decisions/2026-11-21-retention-dates-2028-2029-2030.md), which is also SD6's record for the research date.

### 4.2 Every person column, classified once

| Action on 2028-12-31 | Tables (person columns) |
|---|---|
| **strip** (§4.3) | `segment_edits` (editor_id, editor_username, reviewer_id, reviewer_username) · `segment_acceptances` (accepted_by, accepted_by_username) · `segment_discussions` (user_id, username) · `module_reviews` (submitted_by, submitted_by_username, reviewed_by, reviewed_by_username) · `localization_edits` (editor_id, editor_username) · `localization_pending_edits` (editor_id, editor_username, reviewer_id, reviewer_username) · `localization_suggestions` (reviewed_by, reviewed_by_name) · `suggestion_rejections` (rejected_by) · `suggestion_left_open` (closed_by) · `content_versions` (applied_by) · `figure_block_edit` (edited_by) · `figure_review` (reviewed_by) · `book_sections` (linguistic_reviewer, linguistic_reviewer_name, linguistic_approved_by, linguistic_approved_by_name, localization_approved_by, localization_approved_by_name) · `chapter_pipeline_status` (completed_by) · `terminology_translations` (proposed_by, proposed_by_name, approved_by, approved_by_name) · `terminology_discussions` (user_id, username) · `book_glossary_entry` (created_by, updated_by) · `book_glossary_exclusion` (created_by) · `book_glossary_change` (by) · `registered_books` (registered_by) · `feedback` (user_email, user_name, resolved_by, resolved_by_name) · `feedback_responses` (responder_id, responder_name) · `localization_logs` (localizer, and the times inside `entries`) |
| **delete the rows** | the pure logs: `activity_log` · `notifications` · `chapter_locks` · `analytics_events` · `chapter_generation_log`; and the rows that are nothing but a link from a person to work: `user_book_access` · `user_chapter_assignments` · `chapter_assignments` · `notification_preferences` |
| **kept** | `users` (accounts; [USER]'s scope answer) |
| **2030, not 2028** | `research_consent` (user_id): the proof of a decision and its withdrawal (step 3) |

- **The access and assignment rows are deleted, not kept** (the first draft kept them, against the scope answer). Kept, they would re-attach a stripped edit, which keeps its book, chapter and module, to the chapter's assigned editor. With editing over, deleting them takes nobody's live access.
- **Free-text notes stay** (`segment_edits.editor_note`/`reviewer_note`, comment and feedback texts): they are the editorial content, and cannot be stripped mechanically. The promise is about names held as data. Claude's call.
- **A schema-anchored test** builds the schema from the migrations, finds every column that names a person (the census pattern plus an explicit list for the shapes it misses, e.g. `assigned_to`, `by`, `localizer`, `responder_*`), and fails, by name, on any column this table does not classify. It also lists every unique index containing a strip column. A table added later cannot escape the rule silently.

### 4.3 How a record is stripped (Claude's calls)

- **A placeholder, not NULL, and never shared.** 23 of the columns are `NOT NULL`, so clearing them would mean rebuilding live tables under the never-throw migration rule. Instead each person column gets a value derived from **the row's own id**: `fjarlægt-<id>` in a text column, `-<id>` in an integer one. It names no one, no two records share it, and no unique index can collide (the two pending-row indexes would, with one shared value). Columns that are already nullable get the same placeholder, so readers meet one shape. A reader that shows a name shows the placeholder's prefix as *fjarlægt* (builder's wording).
- **Each name is dated by its own action.** A row with two actors (an edit made by A in 2028 and reviewed by B in 2029) strips each actor's columns against that actor's time column (`created_at` for the author, `reviewed_at` for the reviewer, `accepted_at`, and so on); an actor with no time column of its own is dated by the row's creation time.
- **Times in stripped rows are cut to the date** (`'YYYY-MM-DD'` for text times; that day's 00:00 UTC for `*_ms`; the same inside `localization_logs.entries`), so a record cannot be tied to a person's working hours. Ties in `ORDER BY created_at` reads break by id. Times in other tables are untouched.
- **Pending rows are stripped like any other.** With editing over, a pending edit on the date is abandoned work; it stays decidable by a head editor.

### 4.4 The script: `server/scripts/editorial-retention.js`

Dry-run by default, `--write`, `process.exitCode`; better-sqlite3 resolves from `server/` (CLAUDE.md). Three steps, each **due** when its date has passed and no `retention_runs` row of its kind records it:

1. **`named` (2028):** apply §4.2 and §4.3 to every row whose dated actors fall on or before 2028-12-31, in one transaction.
2. **`unnamed` (2029):** clear `served_version_id` in `segment_edits` and `segment_acceptances`, then delete `served_text_versions` and `module_openings` (inflight rows go by cascade). Refuses before step 1 is recorded.
3. **`consent` (2030):** delete `research_consent`, `research_capture_losses`, and the `research_deletions` rows that name a person. Rows that name no one stay, so `research-retention.js` does not become due again and write a fresh row (builder confirms the shape; a test pins "no re-fire"). Refuses before `research-retention.js` has recorded its 2029 deletion. `research_derived_datasets` stays: it names no one and records the de-identified dataset that is kept.

**Continued use is a refusal, not a guess** ([USER]'s answer, §0). If any record is dated after a step's date, the step leaves those records untouched, still does its date-covered work only where that is safe (step 1), refuses outright where it is not (step 2 refuses while a later record references a served version or a unit opened after 2028), and reports them. The health check then shows the condition until a person decides.

After a step that changed rows: `PRAGMA wal_checkpoint(TRUNCATE)`, `VACUUM`, the checkpoint again, each requiring `busy = 0`, as `research-retention.js` does (a `DELETE` or `UPDATE` leaves old bytes in free pages and the WAL; this build has no `SQLITE_SECURE_DELETE`). Then a `retention_runs` row (`kind`, `done_at_ms`, `rows_changed`), from a new migration that never throws (CLAUDE.md, the boot-wedge rule).

**Verification, and when a step counts as done.** A byte scan for editors' names cannot work while `users` keeps every name, so the proof is structural: after the step, (1) re-selecting every strip column in date-covered rows returns only placeholders, and every deleted table holds no date-covered row; (2) `PRAGMA freelist_count` is 0 and the WAL is 0 bytes after the final checkpoint, which together mean no page of the file holds removed bytes. **A step is recorded only when both pass**; otherwise it stays due, runs again next cycle, and the health check reports it. (The tests can byte-scan, because their planted names are absent from `users`; §6.)

### 4.5 The committed glossary record shows a role, not a name ([USER]'s answer, §0)

`book-glossary.json` was built (book glossary layer spec §5.4, the committed record; `displayNameFor`) to show the deciding account's display name and the time on every entry and history row, and the cron commits it to the public repository. A name committed there would outlive 2028, because git history cannot be stripped.
- **From now on the record shows the deciding account's role label** (`aðalritstjóri` for a head editor; `displayNameFor` already holds the labels), never a display name, with times cut to the date. The c19 loader's label passes through as today. The database keeps the account id until 2028 like every other record (§4.2 strips `book_glossary_*`). This amends the glossary layer spec §5.4; that spec carries a dated note saying so.
- **This part ships first, ahead of the dates.** It is small, independent of the retention script, and it is the only part whose delay is irreversible: every decision a head editor records on the terms page before it ships commits their display name to public history. Today every committed value is the c19 loader's label (§2), and so is every one of production's 152 glossary change rows (read 2026-11-21), so nothing needs undoing.
- *Not chosen:* names in the record, with the consent text saying glossary decisions are published under the decider's name.

### 4.6 Running it

`scripts/backup-db.sh` (the 6-hourly editorial cron) calls the script with `--write` **before** taking its copy, so no new backup holds what was just removed. A failure is logged and does not stop the backup. `/api/health` gains `checks.retention`: not ok when a step is due and unrecorded for longer than two backup cycles plus margin (the derivation `contentBackupHealth.js` and `offboxBackupHealth.js` use), or when a refusal for continued use stands. Until 2029 the check is ok and the script changes nothing.

### 4.7 Backups and production logs (dependencies, not built here)

- **Backups:** the live strip and deletions do not reach existing backup copies. The promise that copies end within 12 months is kept by **G1.20's 12-month cap**, which must be built before the consent text is listed (G1.4's precondition 3 already).
- **Production logs:** G1.4's precondition 2 (the editor site's nginx access log rotated at 14 days; journald `MaxRetentionSec=90day`) is a production configuration change for [USER], with `sudo`. `read-research-preconditions.js` already reads both, so the change is verifiable read-only afterwards.

## 5. Goals, non-goals, anti-goals

- **Goals:** each promised date is enforced without anyone remembering it; a table added later cannot escape the rule; the editorial history stays usable after names are gone; a failure is visible.
- **Non-goals:** G1.20's backup cap; the production log configuration; account removal; the de-identified derived dataset (G1.5/G1.6); the published credits (§2).
- **Anti-goals:** deleting the faithful text, the translation memory or the published pages (none carries a name); acting before a date; acting on records the consent does not cover; a step that fails silently.

## 6. Testing

- `retentionDates.test.js`: the four values; `researchRetention.js` reads `RESEARCH_RAW_ROWS`.
- The schema-anchored classification test (§4.2), with the control that it finds the census's 34 tables, and the unique-index listing.
- `editorialRetention.test.js`, against a database planted with one row per classified table, names that appear in no `users` row, and a clock argument (the pure core takes `nowMs`):
  - before each date nothing changes;
  - after it, by value: every planted name is absent from every column of every table, and a byte scan of the file and WAL finds none; placeholders are per row (two pending edits by two editors on one segment both strip, so the unique index holds); times are cut to the date, inside `localization_logs.entries` too; a two-actor row strips each actor by its own time;
  - a second run changes nothing; step 2 refuses before step 1; step 3 refuses before the research deletion, and `research-retention.js` is not due after step 3;
  - a record dated after the date is untouched and raises the refusal; step 2 refuses while such a record references a served version;
  - a control `users` row survives unchanged.
- The foreign-key case: step 2 succeeds with references present (cleared first) and fails loudly under a mutant that skips the clearing.
- A step whose verification fails is not recorded (a mutant that skips `VACUUM` leaves free pages: the step stays due).
- `backup-db.sh`'s call order (retention before copy), pinned as the deploy tests pin that script today.
- §4.5: a record built from a database whose glossary rows were decided by an account with a display name shows the role label and no part of the name, by value; the c19 label passes through; times are dates.

## 7. Risks

- **A strip that misses a column** keeps a name past the date: the schema-anchored test is the guard, and the planted-row byte scan is the end-to-end check.
- **A step that runs early** destroys live editing history: dates are enforceable values with tests, and steps are ordered and recorded.
- **Editing that continues past 2028 without a decision**: the refusal holds the steps and the health check shows it, so nothing is destroyed by surprise; the promise then waits on a person.
- **A head editor's decision recorded before §4.5 ships** commits a display name to public history for good: §4.5 ships first.
- **The cron is a single host**: if production is down on 1 January 2029, the step runs on the next cycle; the health check reports the delay.

## 8. Left to the builder

The migration number for `retention_runs`; the exact census pattern beside its explicit list; each actor's time column (§4.3's rule); the placeholder's display wording; `research_deletions`' row shapes for step 3; message wording in the script's output; the plan's task order.

## 9. Claude's calls

From the builder check: placeholders derived from the row's id rather than NULL or a table rebuild (§4.3); each name dated by its own action (§4.3); pending rows stripped (§4.3); verification structural, and a step recorded only when verified (§4.4); step 3 keeps the `research_deletions` rows that name no one (§4.4); refusal on continued use (§4.4). From the first draft: free-text notes stay (§4.2); times cut to the date (§4.3); the script runs before the backup copy (§4.6). **Withdrawn after the builder check:** keeping the access and assignment rows and `notification_preferences`, which contradicted the scope answer (§4.2).

## ✏️ Dated note, 2026-11-22: [USER]'s answers to the final review's I-1 (who trips the continued-use refusal)

The final whole-branch review found that §4.4's refusal could be raised by writes nobody would call editing. As built, the pure logs counted any row dated after a date, and the strip tables counted such a row only when it named someone. [USER] answered on 2026-11-22:

- **The public analytics write is retired.** `POST /api/analytics/event` needed no sign-in and wrote `analytics_events`, a delete table under §4.3, so one anonymous request after 2028 would have held step 2. The route and the service's write helpers are removed. The rows already stored stay until step 1 deletes them.
- **Every tool's write after a date counts as continued use** (§0, answer 1: a person decides then). [USER] added during the build that this covers the c19 loader's label (§4.5) too. The label is kept from the strip so the committed record is unchanged, but that keep-list does not hide its later writes.
- **A report from the public feedback form counts too**, as the tools' writes do. `POST /api/feedback` needs no sign-in.
- **A later record is any row with a time after the date, named or not**, as §4.4 words it: "a record dated after a date". [USER] chose this when a nameless report turned out to raise nothing. It also covers a tool write that stores no person.
- **`checks.retention` (§4.6) keeps an answer with a due step for five minutes**, because each survey costs about 0.15 s on a public endpoint. It can therefore show a change up to five minutes late. Before 2029 nothing is kept.
