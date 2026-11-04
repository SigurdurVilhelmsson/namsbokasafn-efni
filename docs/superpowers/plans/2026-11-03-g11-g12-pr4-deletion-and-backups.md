# G1.1 + G1.2, PR4 — deletion and backups: withdrawal, retention and the research file's own 7-day backups — Implementation Plan

> **For agentic workers:** execute this plan task by task, in order, test first. Steps use checkbox (`- [ ]`) syntax.
> No plan-execution skill is installed in this repository, so follow the steps as written. **The tree wins:** where a
> measurement disagrees with this plan, stop, say so, and re-derive; never force the plan's expectation. Read
> [the index](2026-11-03-g11-g12-served-versions-and-event-log.md), [the PR1 plan](2026-11-03-g11-g12-pr1-served-versions-core.md),
> [the PR2 plan](2026-11-03-g11-g12-pr2-opening-record.md) and [the PR3 plan](2026-11-03-g11-g12-pr3-event-log.md)
> first: the index's decisions, its test placement and its Global Constraints, and PR3's "Handoff to PR4", bind this plan.

**Goal:** a withdrawal deletes the withdrawn interval's research rows at once and completes, verified, within one
backup cycle; the retention date (empty until SD6) deletes every research row and never the only copy; and the
research file has its own backup job, its own encrypted remote over its own bucket, and copies that never live longer
than 7 days and never hold a withdrawn editor's rows once the withdrawal is recorded — so the consent text's deletion
promise is true before the first consent is collected (G1.4's data side, G1.20's research file; spec §5.14–§5.17,
§5.20, §5.22, §9, §12 item 10).

**Architecture:** one never-throw `sessions.db` migration (predicted `056`) adds `research_deletions` and
`research_derived_datasets`. Every research-side path (copies, exports, heartbeat) derives from the research file's
own (`server/lib/researchFiles.js`), and every backup value from one policy module pinned against
`scripts/install-cron.sh` (`server/lib/researchBackupPolicy.js`). The withdraw route, and a declined consent during a
live interval, call one write-only service (`server/services/researchDeletion.js`) that deletes the interval's
events, items and loss rows after the route's own commit and never fails the request. Two admin scripts complete
deletions (`research-withdrawal.js`, `research-retention.js`): they read through the admin reader module
(`server/scripts/lib/researchAdmin.js`, which nothing outside `server/scripts/` may require), delete in one transaction,
then compact, byte-scan and empty `research-exports/` through shared steps (`server/scripts/lib/researchPurge.js`), and
record a content-free `research_deletions` row only when all of that passed. The backup is a shell orchestrator
(`scripts/research-backup.sh`: order, rclone, exit codes) over a Node part (`server/scripts/research-backup.js`: every
file write — prune, online-backup copy, heartbeat), on its own cron line; a monthly restore test, a restore script that
purges a restored file before it goes live, a paper-consent script, `checks.research_db`'s `backup-stale` reason and the
read-only probe's G-1a (crontab) and G-1h sections complete it.

**Tech Stack:** Node 22, Express (CommonJS under `server/`), better-sqlite3 13 (only in `server/node_modules`; its
online `backup()`; `defaultSafeIntegers` on every research handle), bash for the two `scripts/` shell parts, rclone (a
fake stand-in in tests), Vitest from the repository root, Playwright E2E (`cd server && CI=1 npm run test:e2e`).

**Spec, and the read order:**
1. [The index](2026-11-03-g11-g12-served-versions-and-event-log.md): decisions 1–17 (for this PR 3, 5, 6, 9, 10, 14,
   15), the PR4 row, the test placement table (T9, T17's PR4 part, T19), the Global Constraints and Review Focus 8.
2. [The PR3 plan](2026-11-03-g11-g12-pr3-event-log.md): its "Handoff to PR4" (binding), "Interfaces produced for later
   PRs", decisions 4, 19, 22, 23, 29, 37, 40, 41, and Tasks 1–7, 11–14 and 31, whose code this PR builds on.
3. [The PR2 plan](2026-11-03-g11-g12-pr2-opening-record.md): Tasks 5 and 6 (the probe this PR extends) and its
   "Interfaces produced" entry for `read-research-preconditions.js`.
4. [The PR1 plan](2026-11-03-g11-g12-pr1-served-versions-core.md): Tasks 3 and 4 (the migration and `checks.schema`
   shapes this PR's migration follows).
5. [The spec](../specs/2026-11-03-served-version-and-event-log-design.md), whole; for this PR §5.1 (Missing file),
   §5.14 (routes, paper decisions, declining while consented), §5.15, §5.16, §5.17, §5.20, §5.22, §6 items 6 and 19,
   §9 (G-1a, G-1b, G-1h, G-2), §10 (T9, T17, T19), §11, §12 item 10, §13 and §13a. Frozen and approved as written,
   with two dated `✏️ AMENDED` blocks: `researchScope.js` in PR1 (2026-11-03), and the twenty departures [USER]
   approved with the plans (2026-11-04), seven of them this plan's (decisions 9, 10, 11, 12, 18, 19 and 20). This plan
   does not reopen §14.
6. [The decision record](../../decisions/2026-11-03-research-capture-consent-and-retention-rulings.md): R2 (the 7-day
   rotation and its precondition) and A3 (loss notes outlive it).
7. [The handoff](../../plans/2026-11-03-g11-g12-implementation-plan-handoff.md) §2, §4 PR4, §5, §6 (frozen; pinned to
   `d24681b8`, whose `server/` and `scripts/` equal `ed10180c`'s).

## State of this plan (read first)

- **Written 2026-11-03 as one of the five PR plans the index lists; ✅ approved by [USER] on 2026-11-04** ("Yes for
  all", with the clarifications the index's "Answers" records). The spec's `✏️ AMENDED 2026-11-04` block records every
  departure this plan takes (decisions 9, 10, 11, 12, 18, 19, 20), so **no spec commit is owed before any task**. One
  clarification changed the plan: the research backup job's log carries a verdict only per run (decision 27, Task 11).
  Every other behaviour choice is built as written. Status lives in the register, never here.
- **Pinned to `main` = `ed10180c`, with PR1, PR2 and PR3 assumed merged.** Every `path:line` below was opened at that
  tree (its `server/`, `tools/`, `scripts/`, `.github/` and `LICENSE` are byte-identical to `d24681b8` and
  `3a1db909`). Where an earlier PR creates or changes a file, the cite says "as PRn Task N leaves it", and each edit is
  matched on the named construct, not a number. Once an earlier task here has shifted a file, do the same.
- **Every `Expected:` line is a prediction; none of this plan's own tests was run** (they do not exist yet). Measured
  while drafting, by read-only probes on better-sqlite3 13 (`server/node_modules`) in a scratch directory:
  - **the online backup copies deleted bytes:** a `db.backup()` taken after a `DELETE` and before any `VACUUM` held the
    deleted sentinel; after `wal_checkpoint(TRUNCATE)`, `VACUUM`, `wal_checkpoint(TRUNCATE)` neither the file, its
    `-wal` (left at 0 bytes) nor a fresh backup held it. **No page count reveals them** (re-measured 2026-11-04): with
    two small rows deleted from a page still in use (seven event-shaped rows, random 63-bit ids), `freelist_count`
    read `0` while the backup held the sentinel, so the bytes need not be in a free page at all (decision 25);
  - a backup destination inherits the source's WAL header (bytes 18–19 = 2, 2), so a read-only open of the copy
    creates `-wal` and `-shm` beside it; `PRAGMA journal_mode = DELETE` on the copy makes it one self-contained file
    (bytes 1, 1) whose read-only open creates nothing; `integrity_check` reads `ok`;
  - a pre-created `0600` destination keeps its mode through `db.backup()`; a fresh destination is `0644` under umask
    `022`; `fs.copyFileSync` keeps `0600`;
  - with a second connection holding a read transaction, `wal_checkpoint(TRUNCATE)` reports `busy 1` after the busy
    timeout (101 ms at 100) while `VACUUM` still succeeds; an idle second connection, in the same process, does not
    make it busy; on a rollback-journal file the checkpoint reports `busy 0, log -1`. **But a reader that began while
    the WAL was empty** (the writer closed first, so read-lock 0) is invisible to it (re-measured 2026-11-04): the
    checkpoint reported `busy 0` in 1 ms, and the same reader made the checkpoint after a `DELETE` report `busy 1`.
    With one frame written first (`PRAGMA user_version` set to its own value, in an immediate transaction) it reported
    `busy 1` against that reader and `busy 0` once the reader ended; with no reader, or an idle one, `busy 0` and a
    0-byte `-wal` (decision 5);
  - `scripts/research-backup.sh` as drafted below (extracted from this file and run), with stub Node parts and the
    fake rclone of Task 11, exited 0, 2 (`RESEARCH_REMOTE` unset, or the editorial remote: the local prune ran, no
    rclone call), 5 (malformed: likewise), 3 (no rclone on `PATH`: likewise), 4 (upload failed, both tiers already
    pruned), 6 (the withdrawal or the retention step failed, no copy), 7 (a remote deletion, a listing or the local prune
    failed; a name the job did not make left in place) as decision 27 predicts (re-run 2026-11-04 with the local prune
    moved first, and again the same day with the verdict-only log: every exit path, node missing and rclone missing
    included, wrote exactly one verdict line and kept its exit code, and with `date` left off a restricted `PATH` the
    line's time was lost, which is why Task 11's restricted `PATH` holds `date`); `scripts/verify-research-backup.sh`
    likewise printed PASS for the newest copy by name (its `.verify` download removed afterwards), FAIL for a corrupt or
    an absent one, and exited 2 on the editorial remote; both pass `bash -n`;
  - the name arithmetic (decision 23) and the crontab classifier (decision 34, with its 2026-11-04 changes: a copying
    tool named by an absolute path, a redaction that leaves an `--exclude` value readable, the excluded-copy test)
    behaved on sample inputs as their tests predict;
  - migration `056`'s never-throw case needs an object that really collides: a pre-existing `research_deletions (x
    TEXT)` makes `CREATE TABLE IF NOT EXISTS` a silent no-op (nothing threw, and `research_derived_datasets` was
    created), while an index named `research_derived_datasets` made the unit throw and roll back (Task 1);
  - on `freshMigratedDb()`, `segment_edits.category` carries a `CHECK` and `editor_note` none (Task 16's control).
- **Neither `rclone` nor `sqlite3` is installed in the drafting sandbox, and no workflow installs either**
  (`.github/workflows/test.yml:12-33`): this is why every shell test here uses fake binaries (decision 37).
- **PR3's names** (`researchConsent.withdraw`, `recordDecision`, `researchDb.getHandle`, `researchDbHealth`,
  `RESEARCH_SCRIPT_EXCEPTIONS`, `DELETE_ALLOWED`, `filesNaming`, PR2's `SECTIONS`) were read from those plans' text; if
  they merged with other names, follow the tree and record the difference.
- **Commit lines below carry no trailer.** The executing session ends each commit message with its attribution trailer
  lines after a blank line (index § Global Constraints).

## Decisions taken in this plan

Each is a §13 item, a seam PR3's handoff or the index leaves to PR4, a reading of the tree, or a mechanism the spec's
stated invariant needs. **Seven change what the frozen spec says, and [USER] approved all seven on 2026-11-04**
(spec `✏️ AMENDED 2026-11-04`): decision 9 (only a withdrawal sets `deletion_done_at_ms`), decision 10 (an export that
cannot be deleted keeps the interval due), decision 11 (retention stays due until its deletion is recorded), decision
12 (the retention script refuses `--write` for want of a derived dataset only when something is due), decision 18 (the
paper-consent script is research-named but not an exception), decision 19 (a paper decision names the current approved
version) and decision 20 (a paper decision's time is the time it is recorded). Three of them (9, 12 and 19) resolve a
conflict inside the spec, which PR3's decision 9 treats as an amendment too. Decision 27's log rule was rewritten by
[USER]'s answer (a verdict only per run). "Answers ([USER], 2026-11-04)" lists each answer.

**Files, seams and order**

1. **One concern per file; the pure parts in `server/lib/`, tested directly.** New: `server/lib/researchFiles.js`
   (every research-side path), `server/lib/researchBackupPolicy.js` (the cron period, the cut-off, the threshold, copy
   names), `server/lib/researchRetention.js` (the date), `server/services/researchDeletion.js` (the immediate
   deletion), `server/scripts/lib/researchAdmin.js` (the admin openers and readers), `server/scripts/lib/researchPurge.js`
   (compact, scan, empty the exports), `server/scripts/research-withdrawal.js`, `research-retention.js`,
   `research-paper-consent.js`, `research-backup.js` (the backup's Node part), `research-restore.js`,
   `scripts/research-backup.sh`, `scripts/verify-research-backup.sh`, migration `056`. Reason: each has its own failure
   mode and its own test, and three of them are shared by several callers.

2. **Every research-side path derives from the research file's directory:** `researchFilesFor(researchPath)` gives
   the copies directory (`research-backups/`), the exports directory (`research-exports/`), the end-of-editing exports
   directory (`served-version-exports/`), the heartbeat (`.last-research-backup`) and a restore's staging file
   (`<research file>.restoring`), beside the file. On production that directory is `pipeline-output/` (PR3's
   `resolveResearchDbPath()`). Reason: one variable (`SESSIONS_DB_PATH`) then moves every file this PR writes, so no
   test touches `pipeline-output/`, the server and the cron cannot disagree (§5.1's "no second environment variable",
   extended to these paths), the restore and the prune name the staging file from one derivation (decision 23), and
   the staging file gets its own `-wal` path while keeping the live exports directory.

3. **Task order: schema and values, then the readers and shared steps, then the deleters, then the backup, then the
   pins, the probe and the docs.** Migration `056` comes first (both scripts write `research_deletions`). The policy
   module (Task 2) lands with its arithmetic; its pin against `install-cron.sh` lands in Task 11, with the cron line it
   pins, so no commit prints a cron line for a script that does not exist. `researchDeletion` (Task 8) comes after the
   withdrawal script (Task 6), which adds `DELETE_ALLOWED`'s first entry and the cases on its real list that Task 8's
   entry joins. The Node part of the backup (Task 10) needs the withdrawal and retention scripts' exported predicates
   (its post-copy checks). The end-to-end T9 test (Task 16) needs Tasks 6, 8 and 10.

**The deletion (spec §5.15)**

4. **What is due.** Withdrawal: every interval's starting row (`decision = 'consented' AND interval_id = id`) with
   `withdrawn_at_ms` set and either `deletion_done_at_ms IS NULL` or an `editor_keys` row for the interval in the
   research file (a restore). Retention: the retention date is set and has passed, and either any research row exists
   (an event, an item or a key) or decision 11's rule holds. Nothing due: the run changes nothing (no compaction, no
   export removal, no row) and exits 0.

5. **A pre-flight checkpoint before the delete, after writing one frame.** A write run first writes one WAL frame
   (`PRAGMA user_version` set to the value it already holds, in an immediate transaction) and then runs
   `wal_checkpoint(TRUNCATE)`; if it reports busy, the run stops before deleting anything (exit 1, still due). Reason:
   §5.15 step 3 says the scan needs the key, "so only the run that deleted it can do it"; detecting a held reader
   before the key is deleted keeps the scan possible on the next run. **The frame is load-bearing (measured, "State"):**
   a reader that began while the WAL was empty or fully backfilled holds read-lock 0, which a checkpoint of an empty
   WAL cannot see, and that is exactly the state every `TRUNCATE` leaves, so the state the job's own runs leave. With a
   frame written first the checkpoint must reach it, and a reader on either lock makes it busy. Writing the version it
   already holds changes nothing (PR3's schema gate reads it; `researchAppendOnly.test.js` scans only the research
   tables). The race that remains (a reader arriving after the pre-flight) is decision 8's.

6. **The delete is explicit and ordered, in the spec's order:** the interval's loss rows first, in one `sessions.db`
   transaction; then, in one `BEGIN IMMEDIATE` transaction on the research file, its items (`event_id IN (SELECT id FROM
   research_events WHERE editor_key = ?)`), its events and, last, its key row (two files, no `ATTACH`, spec §5.1).
   Reasons: §5.15's table orders "its loss rows in `sessions.db`, then its `editor_keys` row"; a loss-row delete that
   fails (a `sessions.db` write busy past the script's wait) then throws before the key is touched, so the next run
   still holds the key to scan for, which is what decision 5 protects, while a research delete that fails after the
   loss rows went leaves the interval due and the next run deletes again (the loss rows are already gone). The
   foreign keys PR3 declared (items cascade from events; events reference the key, PR3 decision 23) are live in this
   build, but the script does not depend on a cascade it can see only by reading the schema, and the key row must go
   last (§5.16).

7. **Steps 2–4 are shared, in `server/scripts/lib/researchPurge.js`:** `compact(db)` (checkpoint, `VACUUM`,
   checkpoint, each checkpoint the frame-first one of decision 5 and required to report busy 0, stopping at the first
   failure), `scanForKeys(paths, keys)` (the research file and its `-wal`, ASCII hex), `emptyExports(dir)` (every entry
   inside `research-exports/`, the directory kept, never following a link). Both scripts and the copy step (decision
   25) use them.

8. **`verified` is 1 when the byte scan ran for that interval's key and found nothing, 0 when the run held no key**
   (a later run after a compaction that failed once the key was deleted, or an interval whose key was never minted).
   A row is written only when compaction passed, the scan found nothing and the exports were emptied (with decision
   10), so `verified` records whether the scan had something to look for. Reason: §5.15 lists the column without
   values, and its own parenthesis ("a later run repeats step 2") is the case where the scan cannot run.

9. **Only withdrawals set `deletion_done_at_ms`. ✅ Approved by [USER] 2026-11-04 (spec AMENDED 2026-11-04).** It
   resolves a conflict inside the frozen spec (PR3 decision 9's precedent). §5.15 step 5 says both scripts set it "the
   first time", but §5.22's test forbids every `research-*` script except `research-withdrawal.js` (and the paper
   script) from naming `research_consent`, and the column is defined per interval (§5.14). So a retention run writes its
   `research_deletions` row (`kind 'retention'`, interval NULL) and touches no consent row; a test pins that
   `research_consent` is unchanged by value. The fallback, for the record, was a third §5.22 exception for
   `research-retention.js`, allowed to set that column only. Recorded under the disagreements.

10. **An export directory that cannot be emptied keeps the interval due. ✅ Approved by [USER] 2026-11-04 (spec
    AMENDED 2026-11-04):** it adds a condition to §5.15 step 5, which names only steps 2 and 3. Reason: step 4 exists
    "so no copy made from the file survives a deletion"; recording the deletion as done while a copy survives would make
    the record false. The fallback, for the record, was to write the row when steps 2 and 3 pass and exit non-zero.

11. **Retention stays due until its deletion is recorded. ✅ Approved by [USER] 2026-11-04 (spec AMENDED
    2026-11-04):** it widens §5.15's "Due when" ("the retention date has passed and any research row exists"). A run
    that deleted every row and then met a busy checkpoint leaves the deleted bytes in the file and the WAL, and with no
    row left the literal rule never selects the file again, so the compaction and the record never happen. The rule
    built: due when the date has passed and either a research row exists or no `research_deletions` row of kind
    `retention` has `done_at_ms` at or after the date. The fallback, for the record, was the literal rule (the copies
    stay clean under it, decision 25; only the `research_deletions` record would never be written).

12. **The retention date is a parameter of the pure functions; only `main` reads the constant.** `isDue` and
    `runRetention` take `retentionDate`, tests pass one, and no seam or flag can set it (there is no `--retention-date`;
    an unknown flag is refused). Reason: a writable switch on an enforceable value that deletes everything is the
    danger PR3 decision 2 names for its approved-texts seam. **`--write` is refused for want of a derived dataset only
    when something is due. ✅ Approved by [USER] 2026-11-04 (spec AMENDED 2026-11-04):** §5.15 says the script
    "refuses `--write` while no such row exists", and §5.17 runs it with `--write` every cycle and takes no copy when it
    exits non-zero, so the literal rule would fail every cycle from the first, long before SD6 sets a date. The
    fallback, for the record, was the literal refusal, with the job passing `--write` only when a read-only
    `retention-due` subcommand said so. **A dataset row counts only when its `path` is absolute and lies outside
    `research-exports/`, the copies directory and the research file** (`--no-derived-dataset` overrides): §5.15 says the
    dataset "never lives in `research.db` or `research-exports/`", and a row naming a file the same run deletes would
    let the date destroy the only copy, which is what the guard exists to stop. An absolute path, because resolving a
    relative one would need a working directory (CLAUDE.md § Tech Stack).

13. **The scripts wait, the server does not.** Scripts open the research file with `SCRIPT_BUSY_TIMEOUT_MS = 5000`
    (better-sqlite3's default; a constant in `researchAdmin.js`), so a deletion waits out an in-flight server write; the
    server's 100 ms (PR3 decision 22) makes a server write that meets the script's `VACUUM` a counted `busy` loss
    (§5.15 Concurrency). Each script **refuses an unknown argument with exit 2** (CLAUDE.md § Commands: a misremembered
    flag must not be a silent no-op), sets `process.exitCode = 1` on entry, and prints one JSON report that carries
    interval ids and step outcomes, **never a key and never a row count** (§5.15: "how many rows an editor had is a
    measure of their volume"; the checkpoint pragma's frame counts are not printed either). That report is for a hand
    run: when the backup job runs the scripts it discards their output, and its log holds only its verdict (decision
    27).

14. **The immediate deletion is its own write-only service, `researchDeletion.deleteIntervalRowsNow(intervalId)`,**
    called after `researchConsent.withdraw` returns `withdrawn: true` (the withdraw route), after
    `recordDecision` returns `outcome: 'withdrew'` (a declined `POST /api/research/consent` during a live interval: §5.14
    "declining while consented is a withdrawal", T9 "posting declined while consented withdraws"), and by the paper
    script on both paths. It deletes the interval's items and events by its key, and its loss rows; the key row stays
    for the script (§5.15 "When they run"). It never throws, logs only `{ errorCode }`, returns statuses and no count,
    and its result never reaches a response. Reason: PR3 pins `researchLog`'s surface exactly (its decision 40), and the
    declined path withdraws too (PR3's handoff names both paths).

15. **`DELETE_ALLOWED` is per file and per table, as PR3 Task 11 defines it:** an entry `{ tables, reason }` allows a
    finding only when its statement is `DELETE FROM <t>` for a listed `t` (PR3's `isAllowed`), so an `UPDATE` or an
    upsert in an allowed file, or a `DELETE` from an unlisted table, is still a finding. This PR adds entries and
    changes neither the shape nor the rule. Entries: `scripts/research-withdrawal.js` and
    `scripts/research-retention.js` (items, events, keys), `services/researchDeletion.js` (items, events; never the
    key).

**The admin reader and the boundary (spec §5.16, §5.22, T17)**

16. **`server/scripts/lib/researchAdmin.js` holds the openers and the reads, and writes nothing:** `openResearch`
    (`fileMustExist`, `defaultSafeIntegers(true)`, read-only unless `write`; it never sets the journal mode, which the
    server owns), `keyForInterval`, `allKeys`, `anyResearchRow`, `iterateEvents`, `itemsForEvent`. The deletion scripts
    use the key readers; PR5's raw research export uses the event readers and **never the key readers** (§5.16: no
    export joins the key map). **No file outside `server/scripts/` and `server/__tests__/` may require it** — wider than
    §5.16's "routes or services", because `server/lib/` and `server/middleware/` are reached from routes too; T17's
    PR4 test walks every top-level entry of `server/` except `node_modules`, `.venv`, `scripts` and `__tests__`.

17. **T17's script scan also reads `server/scripts/lib/research*.js`, with no exception there,** and its
    `research-withdrawal.js` exception (already listed by PR3 Task 31) is exercised: the real file names
    `research_consent`, the scan reports nothing for it, and a copy of it with `segment_edits` appended is a finding
    (spec T17's own control). Headers of `research-*` scripts and `lib/research*` modules spell no forbidden table
    (their bytes are scanned, comments included).

18. **The paper-consent script is named `server/scripts/research-paper-consent.js` and is not a §5.22 exception: it
    names no forbidden table, because it records through `researchConsent.recordDecision` / `withdraw`, which own the
    interval rule. ✅ Approved by [USER] 2026-11-04 (spec AMENDED 2026-11-04):** §5.22 and T17 describe two
    exceptions, the second being the paper script "if it is given a research- name". The rule built is stricter (one
    exception, and a test that the paper script names nothing forbidden). The fallback, for the record, was to list it
    in `RESEARCH_SCRIPT_EXCEPTIONS` with the same single allowance.

**The paper-consent script (spec §5.14; index decision 6)**

19. **`research-paper-consent.js --user <users.id> (--decision consented|declined --text-version <v> | --withdraw)
    [--write]`,** dry-run unless `--write`. **`--text-version` must be the current approved version
    (`currentConsentText()`). ✅ Approved by [USER] 2026-11-04 (spec AMENDED 2026-11-04):** §5.14 says only that "a
    paper decision must name an approved version too", and this narrows it to the current one. Reason: one rule with the
    route, which records only against the current text (PR3 decision 26), so a paper consent cannot start an interval
    on a text the tool no longer serves. The fallback, for the record, was any listed approved version. A `started`
    outcome mints the key (`researchLog.ensureKey`); a `withdrew` outcome and `--withdraw` call the immediate deletion
    (decision 14). No `activity_log` row and no log line carries the decision (PR3 decision 30). It prints the user's id
    and display name so the database administrator can confirm whom the paper names.

20. **A paper decision's `given_at_ms` (and a paper withdrawal's `withdrawn_at_ms`) is the time it is recorded. ✅
    Approved by [USER] 2026-11-04 (spec AMENDED 2026-11-04):** §5.14 defines `given_at_ms` as "when the decision was
    made", which for paper is earlier. Reason: §6 item 18 says capture stops when a withdrawal is recorded, and the
    capture gate measures an interval from its start (PR3 decision 16); a back-dated start would admit replayed acts
    from before the recording. The paper itself is the record of when it was signed. The fallback, for the record, was
    a `--decided-at <YYYY-MM-DD>` option.

21. **While the research file is absent, the paper script refuses a consent and still records a withdrawal or a
    decline, then exits 1.** A consent is refused before any write (`RESEARCH_FILE_MISSING`, nothing written): its row
    would commit and its key could not be minted, so a box that has never booted would become a `missing` one. A
    withdrawal, or a decline during a live interval, is recorded through `researchConsent` as usual, the immediate
    deletion is skipped (`deletion: 'research-file-missing'`), and the script exits 1. Reasons: §6 item 18 promises that
    a withdrawal told to [USER] is recorded the same day and that capture stops when it is recorded, and §5.14 gives the
    admin script that job; the withdrawal lives in `sessions.db`, so it can be recorded whatever state the research file
    is in, and refusing it would keep capturing a person who has withdrawn exactly while the file is down. The
    interval stays due (`deletion_done_at_ms` empty), and `research-withdrawal.js` deletes its rows, loss rows included,
    once a file is back. ✅ Approved as written by [USER] 2026-11-04. §5.1's "exits non-zero when it is absent" still
    holds. (PR3's `getHandle()` could not have created the file here anyway: its create path runs only while no
    *consented* row exists, and every call the paper script makes through it follows one. The skip keeps that argument
    out of the script's correctness.)

**Backups (spec §5.17; §13's two choices)**

22. **The shell/Node split (§13): the shell orchestrates, the Node part writes every file.** `scripts/research-backup.sh`
    holds the order, the exit codes and every rclone call; `server/scripts/research-backup.js` holds every file write
    (the local prune, the online-backup copy, the heartbeat) and the name arithmetic. Reasons: rclone is a program the
    shell drives naturally and `backup-db.sh` is the operators' existing shape; every path comes from one derivation
    (decision 2), so the shell names no path under `pipeline-output/` (a test pins it) and runs in tests against a temp
    directory; the arithmetic the 7-day promise rests on is in one tested Node module, not split between `date` and
    JavaScript.

23. **Copies are named by a UTC stamp and pruned by it, on both tiers.** `research.<YYYY-MM-DDTHHMMSSZ>.db` (no colon in
    a file name; UTC, so a time-zone change cannot shift an age). The Node part owns exactly the names
    `research.<stamp>.db` with an optional `.partial` (a copy in progress) or `.verify` (the monthly test's download)
    suffix and an optional `-wal`, `-shm` or `-journal`. A name it does not own, **or one stamped more than one cron
    period in the future** (a clock step would otherwise keep it past 7 days), is never deleted and never ignored: the
    prune reports it and fails, so the heartbeat stops and `backup-stale` fires. **So is a restore's staging file**
    (`stagingPath` and its `-wal`, `-shm`, `-journal`, beside the research file): a restore killed between its copy and
    its purge leaves a pre-withdrawal copy there, and only the next restore removes it. Reason: the promise is about
    every copy, and the job cannot age a file it did not name.

24. **The cut-off is 7 days minus one cron period; the health threshold is two missed cycles plus margin; both are
    derived and neither has an environment override.** `RESEARCH_BACKUP_CRON_HOURS` (the research cron line's period,
    pinned against `install-cron.sh` in Task 11), `MAX_COPY_AGE_HOURS = 7 * 24` (R2), `PRUNE_CUTOFF_HOURS =
    MAX_COPY_AGE_HOURS - RESEARCH_BACKUP_CRON_HOURS` (§5.17), `RESEARCH_BACKUP_STALE_HOURS = 2 *
    RESEARCH_BACKUP_CRON_HOURS + 2` (§5.20; the formula of `server/lib/offboxBackupHealth.js:34` and
    `contentBackupHealth.js:21`). A copy is pruned when its age reaches the cut-off. No override, unlike the editorial
    checks: widening either value silently would hide a dead job behind a deletion promise.

25. **The copy step compacts before every copy, and discards a copy a withdrawal overtook.** Measured: the online
    backup copies deleted bytes, both in free pages and inside pages still in use, where `freelist_count` reads 0
    ("State"), so no page count can tell whether a deletion has happened since the last compaction. `takeCopy`
    therefore: compacts the live file first, **every time** (busy → no copy); backs up into a pre-created `0600`
    `research.<stamp>.db.partial` in the `0700` copies directory; converts the copy to `journal_mode = DELETE` (one
    self-contained file, measured) and requires `integrity_check` `ok`; then, **after** the copy, requires **no
    withdrawal and no retention to be due**, re-read from the files (and, as a backstop that is not evidence of a clean
    copy, the copy's `freelist_count` to be 0); only then renames it to `research.<stamp>.db` and prints its path.
    Reasons: §5.17's order runs the deletions before the copy, but a deletion since the last compaction (the route's,
    or a schema step's) leaves bytes the backup would carry, and a withdrawal recorded between step 2 and step 3 would
    otherwise be copied (its route deletion leaves such bytes, or fails and leaves the rows); the post-copy re-read
    makes "no backup taken after a withdrawal holds that editor's rows" exact, because a withdrawal committed after the
    re-read is after the copy. Cost: one `VACUUM` of the research file per cycle; a server write that meets it is a
    counted `busy` loss (§5.15 Concurrency), as with the scripts' own compaction.

26. **The research remote is required and must be the research file's own.** `RESEARCH_REMOTE` unset is exit 2 (no
    local-only mode: R2 says locally and off-box, and a heartbeat for a local-only copy would read healthy); it must end
    in `:` or `/` (exit 5, `backup-db.sh:87-90`'s rule) and **begin with `research`** (exit 2, before any rclone call),
    so `secret:` can never receive a research copy. **The guard is a name prefix, so only the crypt remote may carry
    that prefix:** the plain s3 remote under it is named `linode-research`, never `research-…` (Task 19's setup says
    so), or `RESEARCH_REMOTE=research-linode:…` would pass the guard and upload unencrypted copies. The variable is
    **`RESEARCH_REMOTE`, not `RESEARCH_BACKUP_REMOTE`:** `scripts/__tests__/backup-db.test.mjs:280-285` collects
    `/BACKUP_REMOTE=(\S+)/g` from every printed cron line, which would also match a variable ending in `BACKUP_REMOTE`
    and feed the research remote to the editorial script.

27. **Exit codes; the local prune runs first; a prune failure does not stop the cycle; the log holds a verdict only.** 0
    done; 1 the copy or the heartbeat failed; 2 `RESEARCH_REMOTE` unset or not a research remote; 3 `rclone` or `node`
    missing; 4 the upload failed; 5 `RESEARCH_REMOTE` malformed; 6 a deletion step failed (no copy taken); 7 a prune
    failed (the copy was still taken and uploaded; no heartbeat). **The local prune runs before the remote is checked:**
    it needs only Node, and §5.17's step 1 "does not depend on a copy succeeding", so a mis-set remote or an rclone
    missing from cron's `PATH` (a real, repeating failure, `scripts/install-cron.sh:13-19`) exits 2, 3 or 5 only after
    the local copies have aged out; with Node missing nothing can run (exit 3). Both deletion scripts run every cycle
    even if the first fails. Reason: a fresh copy holds no deleted rows and is worth having; the exit code and the
    missing heartbeat still raise the alarm (§5.17: "If step 1 or 4 fails, the job exits non-zero").
    - **The log (`pipeline-output/research-backup.log`, where the cron line sends the job's stdout and stderr) holds one
      verdict line per run, and nothing else** ([USER] 2026-11-04): the UTC time, then `research-backup: ok`, or
      `research-backup: failed: <step>[,<step>…]` naming the steps that failed in the order they ran, from a closed
      list: `node`, `prune-local`, `remote`, `rclone`, `prune-remote`, `withdrawal`, `retention`, `copy`, `upload`,
      `heartbeat`. **Never an interval id, a count, a copy's name or a step's own output:** every child's stdout is
      captured into a variable (the copy's path, the expired names) or discarded, and every child's stderr is
      discarded; an `EXIT` trap writes the line, so every exit path writes exactly one. Reason: the deletion scripts'
      reports name the interval ids they deleted (decision 13), and a log that kept them would be a second record of
      who withdrew and when, beside `research_deletions`, outside every deletion rule. The exit code still says which
      branch ended the run (it is not logged; cron discards it). **Diagnosis is by hand:** an operator re-runs the step
      the verdict names (the deletion scripts are dry-run without `--write`; `research-backup.js expired-names` names
      an unknown remote object on stderr), and reads that output in a terminal, never in the log. A bash abort the
      script did not plan (an unset variable) writes bash's own one-line diagnostic on stderr, which names the variable
      and its line, then the verdict line (`failed: unknown` when no step had failed yet; otherwise the steps that had,
      for example `failed: prune-local`).

28. **The Node binary is `/usr/bin`-first, as `scripts/git-backup.sh:128-141` does**, because better-sqlite3's binary
    is built for the service's `/usr/bin/node` (`scripts/deploy.sh`'s Node pin). `RESEARCH_NODE` is a test seam the
    shell tests set to `process.execPath`; cron never sets it.

29. **A monthly restore test: yes (§13).** `scripts/verify-research-backup.sh` downloads the newest off-box copy into
    the copies directory as `research.<its stamp>.db.verify` (so a killed run leaves a file the prune ages with its
    source), runs `research-backup.js verify` on it (read-only; `integrity_check`, schema version, tables), prints
    `RESEARCH RESTORE VERIFY: PASS` or `FAIL (…)`, and deletes it. Reasons: the research copies have their own crypt
    passphrase and bucket, so their round trip is at risk independently of the editorial one; "a backup that uploads
    but cannot be restored is worth nothing" (`scripts/install-cron.sh:40-42`); the cost is one small script. ✅
    Approved as written by [USER] 2026-11-04, including the decrypted copy it holds in `research-backups/` for the
    minutes it runs. Its own log (`verify-research-backup.log`) is not the job's log decision 27 rules on: it holds its
    `PASS` or `FAIL (<reason>)` line and, after a failed rclone call, rclone's error text; neither names an interval id
    or a count, because the restore test runs no deletion script.

30. **The heartbeat is written by the Node part, and `backup-stale` is not gated on consent.** Missing heartbeat →
    stale, the house rule (`server/lib/backupHeartbeatHealth.js:15-19`). So `checks.research_db` reads `backup-stale`
    from PR4's deploy until the job's first full run; that is the alarm working (G-1h checks it before the first
    consent), and the deploy readout prints `research_db` among the not-ok checks (`scripts/deploy.sh:150-157`).

31. **Root `LICENSE` gains the new MIT→AGPL edges in the commits that add them, and a fifth search shape.** Both shell
    scripts run `server/scripts/*` as separate Node processes and read their stdout: class 5 (`LICENSE:194-204`). Found
    while measuring: `scripts/git-backup.sh:141` already runs `server/scripts/export-terminology.js` and is not listed;
    it is added in Task 11's commit (CLAUDE.md § One source of truth: fix the document that is wrong), **with its
    difference from class 5 said on the entry**: it sends the script's output to its log rather than reading it, and its
    failure is contained (a warning, `:143`), so the content backup runs without `server/`. **None of `LICENSE`'s four
    search shapes (`:213-224`) matches a shell path built from a variable** (`"${PROJECT_ROOT}/server/…"`), which is why
    `:141` was never found, and why the two new scripts' edges would be invisible to the next re-derivation CLAUDE.md
    § E-2 asks for. Task 11 adds a fifth shape (a shell variable followed by `/server/`) and changes "Four" to "Five"
    with a dated note, in the shape of the 2026-09-07 one (`LICENSE:207-211`). Measured: over every tracked file under
    `tools/`, `scripts/` and `experiments/`, that shape matches `scripts/git-backup.sh:141` and nothing else today.

**Restore (spec §5.15 "A restore")**

32. **`research-restore.js --from <copy> [--write]` restores only from a local copy, and only into a stopped
    service.** `--from` must name a `research.<stamp>.db` inside the copies directory (an off-box copy is first fetched
    there under its own name). It refuses while `systemctl is-active ritstjorn` reports an active state (the unit
    `scripts/deploy.sh` restarts), verifies the copy, copies it to the staging file (`stagingPath`, decision 2), runs the
    withdrawal and the retention purge on that staged file (the scripts' exported run functions, with the staged path),
    and only if both pass **deletes** the current file and its `-wal`/`-shm` and renames the staged file into place. A
    failed purge deletes the staged file (it may hold withdrawn rows) and leaves the live file as it was. Reasons: §5.15
    requires both scripts to run on the restored file "before the server opens it"; staging makes that true even if the
    operator starts the server after a failure. **The current file is deleted, never kept aside:** the purge has just
    written a `research_deletions` row and set `deletion_done_at_ms` for every interval due at restore time, and the
    usual reason for a restore (a corrupt live file, during which the route's deletion and the job's step 2 both
    failed) is exactly when that file still holds a due interval's rows or their bytes. Kept aside, it would hold them
    past 7 days from the withdrawal while the record says the deletion is done (decision 10's false record), and no
    deletion run would reach it (`dueIntervals` reads the live path only). The copy restored from stays in the copies
    directory, so the restore can be repeated; a corrupt file worth inspecting is inspected before the restore. The
    delete comes before the rename: a run killed between them leaves no live file (`missing`, §5.1), and the next
    restore starts again from the staged copy's source. ✅ Approved as written by [USER] 2026-11-04.

33. **No path creates a fresh research file while a consent exists.** If the file is lost and no copy exists, the
    server stays `missing` (§5.1) and nothing in PR4 re-creates it (a fresh file re-keys every editor, §5.16). [USER]
    asked on 2026-11-04 for a deliberate admin path **later**: it is recorded in the register, not built in PR4.

**The probe (spec §9; index decision 14)**

34. **G-1a's crontab half reads every cron source the box holds, one level into the scripts they run, and returns
    only the lines that matter, redacted.** Sources: `crontab -l` (the running user), every file in
    `/var/spool/cron/crontabs/` (root only), `/etc/crontab`, `/etc/anacrontab`, `/etc/cron.d/*` and the scripts in
    `/etc/cron.{hourly,daily,weekly,monthly}/`. A line is a **copy** when it holds a copying tool (`tar`, `rsync`, `cp`,
    `scp`, `rclone`, `restic`, `borg`, `duplicity`, `zip`, `cpio`, `dd`, bare or named by an absolute path such as
    `/usr/bin/rsync`) and names `pipeline-output` or an ancestor of the research directory (an absolute path above it,
    `/`, `~` or `$HOME`); an **excluded copy** when such a line also carries an `--exclude` naming `research` (returned
    apart, for [USER]'s judgment: §9 lets consent proceed once the file is excluded, and Task 19's checklist prescribes
    exactly such a line, so counting it as a copy would make the documented remedy fail the gate for ever, while passing
    it unread would trust a pattern nobody checked); **known** when it runs one of the five repository jobs (reported by
    job name, never the line); **unclassified** when it names `pipeline-output` otherwise. A crontab line that runs an
    unknown script file is classified by that script's lines too, and one whose command word is an absolute path to a
    file the probe cannot read as text (unreadable, or binary) is **unclassified** with that reason, never dropped. Every
    returned line has its assignment words (`NAME=value`) and option values (`--opt=value`) redacted, except an
    `--exclude`/`--include` value, which a reader needs in order to judge the exclusion (a matching line can itself
    hold a secret; PR2's handoff forbids whole crontabs). `complete` is true only when the spool was listed (or is
    absent) and every source was read.

35. **`--sections <list>` lets the probe run without opening a database,** for the root run G-1a's spool needs:
    `sudo "$(command -v node)" - efnafraedi-2e --sections G-1a,G-1h`. Reason: a root process that opens a WAL database
    can leave root-owned `-wal`/`-shm` files the service user cannot write; with `--sections` naming only file and cron
    sections, the lazy handle (PR2 Task 5) is never opened (a test pins it). `--write` and other flags still exit 2.

36. **G-1h reads the crontab and the heartbeat, never `research_deletions`.** It reports whether a research-job line is
    installed, whether its schedule equals the template's, whether its remote is a research remote (a boolean; the value
    is never printed), and the heartbeat's presence and age. §9 allows "by its heartbeat or research_deletions"; the
    probe's output is pasted into the public register (index decision 14), where a deletion record would announce a
    withdrawal, and before the first consent the table is empty by construction.

**Tests**

37. **A fake `rclone` (and, for the editorial pin, a fake `sqlite3`) on a temp `PATH` directory,** in
    `scripts/__tests__/helpers/fakeBins.mjs`: it logs each call, serves `lsf` from a directory standing in for the
    bucket, and fails a named operation on request. Reason: the handoff and the PR4 brief call `backup-db.test.mjs`
    "the idiom for a fake rclone", but it runs the **real** rclone (a crypt remote over a local one) under
    `it.skipIf(!hasRclone)` (`:11`, `:71`) and simulates a missing rclone with a restricted `PATH` (`:123-157`); no
    workflow installs rclone, so its upload cases never run in CI. A fake runs everywhere and can fail on cue.

38. **T19's editorial half is behavioural first, textual second.** `backup-db.sh` is run with a research copy among its
    own (local prune) and with a research object in the fake remote (remote prune), and `verify-db-backup.sh` with a
    research object that sorts after the editorial one; a text pin of the exact patterns (`backup-db.sh:23`, `:45`,
    `:53`, `:56`, `:66`, `:104`; `verify-db-backup.sh:19`) backs them up. No editorial script changes.

39. **T9's "every editing table … equal by value" is a direct table comparison,** every `sessions.db` table except
    `research_consent`, `research_capture_losses` and `research_deletions` (which a withdrawal changes by design), rows
    ordered by rowid, plus the module JSON from the real route. PR3's handoff suggests its event rebuild; after a
    withdrawal the events are gone, so a rebuild cannot speak to the editing record.

40. **PR3's env scanner learns PR4's server modules** (`featureFlags.ENV_SCAN_FILES` gains `lib/researchFiles.js`,
    `lib/researchBackupPolicy.js`, `lib/researchRetention.js`, `services/researchDeletion.js`, each in the commit that
    creates it), for the reason PR3 decision 33 gives: no second environment variable on a research path.

**Docs (spec §12 item 10; index PR4 row)**

41. **`docs/deployment/linode-deployment-checklist.md` §9 is rewritten:** Linode Backups off (a whole-disk image cannot
    exclude one file), no `tar`/`rsync`/copy of `pipeline-output/` or anything above it, the two cron jobs as the only
    backups, and G-1a as the check. **`docs/technical/backup-and-restore.md` gains the research file's section**
    (passphrase escrow first, its own bucket with versioning off, its own crypt remote, the cron lines, the promise and
    what makes it true, the restore runbook through `research-restore.js` only) and its two stale or restated defaults
    become pointers (`OFFBOX_BACKUP_STALE_HOURS` is documented as `26` with a wrong derivation, "one missed 6 h cycle";
    the code says otherwise, `offboxBackupHealth.js:19-21`, `:34`), in their Default **and** Meaning cells.

**The backup's Node part and the index**

42. **`research-backup.js` takes no `--write`, and prints names and paths, not a JSON report.** The index's Global
    Constraints say new admin scripts are dry-run unless `--write`. This script is the Node half of a cron job: its
    writing subcommands (`prune-local`, `copy`, `heartbeat`) are run only by `scripts/research-backup.sh` and
    `scripts/verify-research-backup.sh`, which read what they print (a path, the expired names, a verify line), so a
    flag would be passed on every call and protect nothing. Its other subcommands (`where`, `expired-names`, `verify`)
    are read-only. A hand run of a writing subcommand does what the job does, which is safe by construction (the prune
    ages only names it owns, a copy is one more owned name). Recorded as an index issue.

### Where the tree, the spec, the index and the earlier plans disagree (recorded; the tree wins)

None of these changes what the frozen spec says beyond the seven decisions above, which [USER] approved on 2026-11-04
(spec `✏️ AMENDED 2026-11-04`).

- **Spec §5.15 step 5 says both scripts set `deletion_done_at_ms` "the first time"; §5.22's test forbids
  `research-retention.js` from naming `research_consent`** → decision 9 (only withdrawals set it; approved).
- **Spec §5.15: the retention script "refuses `--write` while no such row exists"; §5.17 runs it with `--write` every
  cycle and takes no copy when it exits non-zero** → decision 12 (refused only when something is due;
  approved). §5.15 also says the dataset never lives in `research-exports/`, which the same run empties → decision 12
  counts only a row whose path lies outside it.
- **Spec §5.14: "a paper decision must name an approved version too"; the route records only against the current
  one (PR3 decision 26)** → decision 19 (the current one; approved).
- **Spec §5.15's retention "Due when" cannot select a file whose rows were deleted but not compacted** → decision 11.
- **Spec §5.15 step 5 conditions only on steps 2 and 3** → decision 10.
- **Spec §5.17's order does not cover a withdrawal recorded between the deletion step and the copy, and the online
  backup copies deleted bytes, in free pages and inside pages still in use, which no page count reveals (measured)**
  → decision 25 (compact before every copy; re-read what is due after it).
- **Spec §5.17: step 1 "does not depend on a copy succeeding"; a job that validates its remote first would skip it** →
  decision 27 (the local prune runs before anything that can stop the job).
- **Spec §5.22 and T17 describe two `research_consent` exceptions; the paper script needs none** → decision 18.
- **Spec §5.14 defines `given_at_ms` as when the decision was made; a paper decision is recorded later** → decision 20.
- **Spec §9 G-1h: "by its heartbeat or research_deletions"** → the heartbeat only (decision 36); "or" permits it.
- **Spec §9 G-1a reads "every user's crontab", which needs root, and a root run of PR2's database sections risks
  root-owned WAL files** → decision 35.
- **Spec §5.1: every research script "exits non-zero when it is absent"; §5.14 gives the admin script paper
  withdrawals, and §6 item 18 promises a withdrawal is recorded the same day and capture stops when it is** → decision
  21 (a consent is refused while the file is absent; a withdrawal or a decline is recorded in `sessions.db`, its
  immediate deletion skipped, and the script exits 1).
- **Index decision 14** places G-1a's crontab half and G-1h in PR4 but does not say the crontab half needs root, nor a
  database-free mode → decision 35.
- **Index test placement and the PR4 brief: "extend PR3's boundary test exception list with `research-withdrawal.js`'s
  reason"** — PR3 Task 31 already lists that entry with its reason; PR4 exercises it (decision 17).
- **Handoff §2 and the PR4 brief call `scripts/__tests__/backup-db.test.mjs` "the idiom for a fake rclone"; it runs the
  real rclone, skipped where none is installed, and no workflow installs one** → decision 37.
- **PR3's `forbiddenTableUses` reads only `server/scripts/research-*`; the admin reader lives in `server/scripts/lib/`**
  → decision 17.
- **PR2's `filesNaming(root, pattern)` walks every directory under its root,** `node_modules` and `.venv` included when
  the root is `server/` → Task 4's walker skips them by name.
- **PR3's `readResearchDbHealth({ editorialPath, researchPath, consentLookupFailing })` takes no time** → Task 13 adds
  `nowMs = Date.now()` as an optional parameter, so `server/index.js`'s call (PR3 Task 13) is unchanged.
- **Index § Global Constraints: "New admin scripts are dry-run unless `--write`"; the backup's Node part is the cron
  job's own half** → decision 42 (no `--write`; an index issue).
- **`docs/technical/backup-and-restore.md:15` documents `OFFBOX_BACKUP_STALE_HOURS`'s default as `26` with the
  derivation "one missed 6 h cycle + margin"; `server/lib/offboxBackupHealth.js:19-21` says two missed cycles and `:34`
  is `14`; `:16` restates the content check's derivation** → both cells of both rows become pointers in Task 19.
- **`scripts/git-backup.sh:141` runs `server/scripts/export-terminology.js` and root `LICENSE` does not list it; it
  does not read the script's stdout, which class 5's wording (`LICENSE:194-196`) assumes** → added in Task 11 with that
  difference said on its entry (decision 31).
- **Root `LICENSE:207-208` says four search shapes are enough; none of them matches a shell path built from a variable
  (`:213-224`)** → Task 11 adds a fifth (decision 31).
- Spec citations checked at the tree and correct: `scripts/install-cron.sh:38` (the 6-hourly editorial line), `:45`
  ("paste the lines above"); `scripts/backup-db.sh:23`, `:45-46`, `:53-55`, `:103-105`; `scripts/verify-db-backup.sh:19`;
  `docs/deployment/linode-deployment-checklist.md:236`, `:243`; `docs/technical/backup-and-restore.md:13`, `:30`;
  `server/lib/offboxBackupHealth.js:34`; `server/index.js:245` (the unauthenticated handler) and `:353` (`degraded`).

## Global Constraints (PR4)

The index's Global Constraints bind this PR: test first, one commit per task; the gate is what CI runs (`npm test` from
the repository root, the failing set diffed by name against `main`'s; `npm run lint` **and** `npm run format:check`;
`npm run docs:check`, which applies (Task 8 edits `server/routes/research.js`; it adds no route line, so the generated
file is expected unchanged); `cd server && CI=1 npm run test:e2e`, which applies (a route changes)); no dependency is
added, so `npm audit` is not part of this gate; module systems; better-sqlite3 only under `server/`; paths from
`__dirname` or `resolveDbPath()`; never-throw schema steps; organic never; no research field in a response;
`process.exitCode` in every new script; `grep -a`; a mutation check restores from a golden `cp`; nothing names a grant
or fund; no count, test total or CI verdict in prose. In addition:

- **No test writes under `books/` or to `pipeline-output/`.** Every server test sets `SESSIONS_DB_PATH` in a
  `mkdtempSync` directory before its first server `require`, so the research file, its copies, its exports and its
  heartbeat all derive into it (decision 2). Every shell test passes `SESSIONS_DB_PATH` and `RESEARCH_NODE`, and
  records the state of the real `pipeline-output/.last-research-backup` and `pipeline-output/research-backups/`
  before and after. Run `git status --porcelain` after every test run.
- **No test runs a real rclone or touches a real remote.** The shell tests put `fakeBins.mjs`'s directory first on
  `PATH`; none sets an `RCLONE_CONFIG_*` variable.
- **No test runs git on the real tree:** every test in which `record` can reach its build sets
  `serverCommit._setTestServerCommit(…)` (PR3 § Global Constraints).
- **Research ids are `BigInt`:** every handle on a research file is opened with `defaultSafeIntegers(true)` (through
  `openResearch`); `sessions.db` ids bound as parameters are plain numbers.
- **`researchDeletion.deleteIntervalRowsNow` is called bare** (never inside a `try`; Task 8 adds the guard), after the
  consent write committed and before the response, and its result is never read by a route.
- **Headers name no forbidden table** in `server/scripts/research-*` and `server/scripts/lib/research*` (only
  `research-withdrawal.js` may name `research_consent`), and `server/routes/research.js` still spells neither
  `researchDb` nor `editor_keys` (PR3 Task 31's scan reads bytes, comments included).
- **No value of the backup policy is restated in prose or comments outside `researchBackupPolicy.js` and its test;**
  `install-cron.sh`'s comment points to the module.
- **Format:** `npx prettier --write` on each `.js` file a task creates or edits under `server/` or `scripts/` before its
  commit. Shell scripts are parsed by `scripts/__tests__/shell-syntax.test.mjs` (`bash -n`), which each new script
  joins in its own commit.
- **The two shell scripts are committed executable** (`chmod +x`, then `git add --chmod=+x`), as every existing
  `scripts/*.sh` is (`git ls-files -s` shows `100755`). Cron runs them by path, while every test runs them through
  `bash <script>`, so only `shell-syntax.test.mjs`'s mode pin sees a lost bit.
- **The research job's tests that hold a reader wait the scripts' busy timeout** (decision 13); give each such case an
  explicit `{ timeout: 30_000 }`.

## Review Focus

Input cases the spec implies but its tests do not exercise directly. Each names the task that answers it.

1. **A withdrawal recorded between the job's deletion step and its copy** must not ride into the copy: the post-copy
   re-read discards it. → Task 10
2. **A deletion since the last compaction** (the route's immediate deletion, a schema step that rebuilt a table) leaves
   deleted bytes in free pages or inside pages still in use, which the online backup copies and no page count reveals
   (measured): the copy step compacts before every copy. → Task 10
3. **A reader holding the research file at the pre-flight** stops the run before anything is deleted, so the next run
   still holds the key to scan for, **including a reader that began while the WAL was empty** (read-lock 0, the state
   the job's own runs leave), which only a frame written first lets the checkpoint see. → Task 5, Task 6, Task 11
4. **A reader that arrives after the pre-flight** makes compaction fail once the key is gone: the interval stays due,
   and the next run verifies by compaction alone (`verified 0`). → Task 6
5. **A restored file whose interval is already marked done** is due again because its key row is back. → Task 6, Task 14
6. **A retention run that deleted every row but could not compact** stays due by its missing record (decision 11). →
   Task 7
7. **The backup job's every-cycle `research-retention.js --write`** must never fail while the date is unset, and must
   refuse once the date passes without a derived-dataset row. → Task 7, Task 11
8. **A name in the research bucket or the copies directory the job did not make, or stamped in the future,** is never
   deleted and never ignored: the prune fails and the heartbeat stops. → Task 10, Task 11
9. **A partial copy left by a dead run** carries an owned name and is aged out; the copy step deletes its own partial on
   any failure. → Task 10
10. **`RESEARCH_REMOTE=secret:`** (the editorial remote) is refused before any rclone call. → Task 11
11. **The editorial template test's `/BACKUP_REMOTE=(\S+)/` regex** must never see the research line (hence
    `RESEARCH_REMOTE`). → Task 11
12. **The editorial tier picking up a research copy,** locally, remotely or in its monthly verify. → Task 15
13. **A root run of the probe's database sections** could leave root-owned WAL files: `--sections` opens no database.
    → Task 17
14. **A crontab line that runs a script which tars `~/repos`,** a copying tool named by an absolute path
    (`/usr/bin/rsync`), a command word that is a binary the probe cannot read, a copy that excludes the research file
    (Task 19's own remedy), or a line whose own text holds a secret in an assignment or an option value. → Task 17
15. **The probe's pasted output announcing a withdrawal:** G-1h reads no deletion record. → Task 18
16. **The withdraw route's deletion failing** (the research file busy, down or missing) never changes the response; the
    script completes the deletion. → Task 8
17. **A declined consent during a live interval** deletes at once, like the withdraw route; a declined decision with
    nothing live deletes nothing. → Task 8
18. **A paper withdrawal or a paper decline** does what the route does, including the immediate deletion. → Task 9
19. **A paper decision while the research file is absent:** a consent is refused before any write; a withdrawal is
    still recorded, so capture stops the day it is told (§6 item 18), and the script exits 1 with the deletion left due.
    → Task 9
20. **A restore while the service runs** would swap the file under an open handle: refused. → Task 14
21. **A restored file's purge failing** must not leave a staged copy holding withdrawn rows; a restore killed before its
    purge leaves a staging file the prune refuses to ignore. → Task 10, Task 14
22. **`research-exports/` is emptied by every deletion run, `served-version-exports/` never;** a symlink inside the
    exports directory is removed, its target kept. → Task 5, Task 6
23. **The deletion reports** carry interval ids and step outcomes, never a key, a row count or a checkpoint frame
    count; **the job's log** carries one verdict line per run (the time, `ok` or `failed` and the failing steps' names)
    and never an interval id, a count or a child's output, on every exit path (decision 27). → Task 6, Task 7, Task 11
24. **A copy opened read-only** (the monthly test, a restore's check) must create no side file beside it: copies are
    rollback-journal files. → Task 10
25. **The copies directory's mode** is re-asserted on every run, and every copy is `0600` from its first byte (a fresh
    backup destination is `0644` under umask `022`, measured). → Task 10
26. **`-shm` is not scanned:** it holds the WAL index, no row content; §5.15 names the file and its `-wal`. Recorded,
    not changed. → Task 5
27. **The deploy readout names `research_db` but not its reason;** an operator reads the reason with `curl` (the docs
    say so). → Task 13, Task 19
28. **A copy taken in the same second as another** would collide on its name: the copy step refuses rather than
    overwrite. → Task 10
29. **The editing record after a withdrawal,** including the module JSON every browser receives, is byte-identical. →
    Task 16
30. **A mis-set `RESEARCH_REMOTE` or an rclone missing from cron's `PATH`** must not stop local copies ageing out: the
    local prune runs first. → Task 11
31. **A restore whose live file still holds a due interval's rows** (the route's deletion and the job both failed
    while it was corrupt) must not keep that file: it is deleted, not set aside. → Task 14
32. **A `research_derived_datasets` row naming a file inside `research-exports/`** must not satisfy the guard the same
    run would then empty. → Task 7
33. **A loss-row delete that fails** must stop the run before the key is deleted. → Task 6

## The T-tests this PR carries (index § Test placement)

| Test | Task | The part here |
|---|---|---|
| T9 withdrawal | 6 (the script: events, items, loss rows and key gone; the sentinel and the key's hex absent from the file and its `-wal`; `research-exports/` empty and `served-version-exports/` unchanged; nothing due leaves exports and `research_deletions` untouched; a held reader keeps the interval due; the controls: another editor's events, items and loss rows unchanged by value, a re-consented editor's new interval (its events, items, loss row and key) kept, the sentinel present before), 8 (posting *declined* while consented withdraws; after a renewal the withdrawal marks the starting row; the immediate deletion; a later act writes nothing), 10 (the next copy lacks the sentinel), 11 (a held reader: no copy is taken), 14 (restoring a pre-withdrawal copy removes the sentinel again; a live file holding a due interval's rows is not kept), 16 (every editing table and the module JSON equal by value, end to end) | whole |
| T17 nothing reaches a browser or a route | 4 (the admin reader is required by nothing outside `server/scripts/`), 6 (`research-withdrawal.js`'s exception exercised; `lib/research*` scanned), 8 (the deletion service's write-only surface), 9 (the paper script names no forbidden table) | PR4's parts |
| T19 backups | 2 and 11 (the cut-off derived from `install-cron.sh`), 10 (its own directory under `research.`, mode `0600`; a copy older than the cut-off is pruned), 11 (its own remote, never the editorial one; a failing upload still prunes; a failing deletion step takes no copy; a failing remote prune exits non-zero with no heartbeat), 13 (the health threshold derived), 15 (`backup-db.sh`'s local glob and remote and verify prefixes match only `sessions.`) | whole |

The probe's sections (spec §9 G-1a's crontab half, G-1h) are Tasks 17 and 18.

## Before Task 1: the tree check

- [ ] `git diff --name-only ed10180c HEAD -- server tools scripts .github LICENSE` lists only PR1's, PR2's and PR3's
  files; re-derive any pin below in a file it lists.
- [ ] `ls server/migrations | tail -1` shows PR3's migration (predicted `055-research-consent-and-switches.js`), so Task
  1 takes `056` (index decision 9).
- [ ] `ls server/lib/research* server/services/research* server/scripts/research* server/scripts/lib/research* 2>&1`
  finds only PR1's and PR3's files (no `researchFiles`, `researchDeletion`, `researchAdmin` or `research-withdrawal`).
- [ ] `grep -anr "deletion_done_at_ms" server --include='*.js' | grep -v __tests__` finds only migration `055` and
  `server/lib/schemaHealth.js` (nothing writes it yet).
- [ ] Read `recordDecision` in `server/services/researchConsent.js`: on `outcome: 'withdrew'` it returns the withdrawn
  interval's id as `intervalId` (PR3 Task 5 pins it; Task 8's deletion reads it). If it does not, stop: PR3 did not
  merge as planned.
- [ ] `grep -an "researchConsent.withdraw(\|recordDecision(\|ensureKey(" server/routes/research.js` shows PR3 Task 7's
  call sites (Task 8 edits them).
- [ ] `grep -an "DELETE_ALLOWED\|isAllowed\|function mutations" server/__tests__/researchAppendOnly.test.js` shows the
  empty frozen object and PR3 Task 11's `isAllowed` (per file, per table); Task 6 adds the first entry.
- [ ] `grep -an "RESEARCH_SCRIPT_EXCEPTIONS\|function forbiddenTableUses\|function filesNaming\|FORBIDDEN_TABLES"
  server/__tests__/researchBoundary.test.js` shows PR3's single exception and the file selector (Tasks 4, 6, 9).
- [ ] `grep -an "SECTIONS = \|function readResearchPreconditions\|function main" server/scripts/read-research-preconditions.js`
  shows PR2's five sections and `main`'s one-argument rule (Tasks 17, 18).
- [ ] `grep -an "ENV_SCAN_FILES" server/lib/featureFlags.js` (decision 40).
- [ ] `grep -an "BACKUP_REMOTE=(" scripts/__tests__/backup-db.test.mjs` shows the template regex decision 26 avoids.

---

### Task 1: migration 056 — `research_deletions` and `research_derived_datasets`, and `checks.schema` reports them

Spec §5.15 (the deletion row and its columns, "no row count"; the derived dataset's record), §5.20 (`checks.schema`
names `research_derived_datasets`); index decisions 3, 9, 10.

**Files:**
- Create: `server/migrations/056-research-deletions.js` — `migrate(db)`, `up(db)` (the boundary). **First run
  `ls server/migrations` on the branch: if `056` is taken, use the next free number everywhere below** (index decision 9).
- Modify: `server/services/migrationRunner.js` — append the `require` after PR3's (the list ended at `:84` at
  `ed10180c`; PR1, PR2 and PR3 each appended one).
- Modify: `server/lib/schemaHealth.js` (as PR3 Task 3 leaves it) — `EXPECTED_SCHEMA.tables` gains both tables.
- Test: `server/__tests__/migration056.test.js` (new); `server/__tests__/schemaHealth.test.js` (one case).

**Interfaces:**
- Consumes: `freshMigratedDb()` (`server/__tests__/helpers/freshMigratedDb.js:83`).
- Produces: `module.exports = { name: '056-research-deletions', up(db) }`, `up` never throws; the schema below.

- [ ] **Step 1: Write the failing tests**

`server/__tests__/migration056.test.js` (the model is PR3's `migration055.test.js`; `cols(t)` as there):
- `it('creates both tables, column by column, and research_deletions holds no count and no person')` — on
  `freshMigratedDb()`: `cols('research_deletions')` equals `{ kind: ['TEXT', 1], interval_id: ['INTEGER', 0],
  done_at_ms: ['INTEGER', 1], verified: ['INTEGER', 1] }` (exactly these four: a `rows`, `count` or `user_id` column
  fails here, which is the point, spec §5.15); `cols('research_derived_datasets')` equals `{ path: ['TEXT', 1], sha256:
  ['TEXT', 1], created_day: ['TEXT', 1] }`.
- `it('the CHECKs refuse what the spec rules out, and admit what it allows')` — each refused insert throws `/CHECK/`,
  each paired valid insert succeeds: `kind 'purge'` / `'withdrawal'`; a `withdrawal` row with `interval_id NULL` / with
  `7`; a `retention` row with `interval_id 7` / with `NULL`; `verified 2` / `1`; `done_at_ms 0` / `1`; a dataset
  `sha256` of 63 characters / 64 lowercase hex; 64 upper-case hex / lowercase; `created_day '2026-1-3'` /
  `'2026-11-03'`; `path ''` / `'x'`.
- `it('no foreign key on research_deletions.interval_id, while foreign keys are live')` —
  `db.pragma('foreign_keys', { simple: true }) === 1`; `db.pragma('foreign_key_list(research_deletions)')` equals `[]`;
  a `withdrawal` row with `interval_id 999999` inserts. Control: `INSERT INTO user_chapter_assignments (user_id,
  book_slug, chapter) VALUES (999999, 'efnafraedi-2e', 1)` throws `/FOREIGN KEY constraint failed/`.
- `it('is idempotent')` — `vi.spyOn(console, 'warn')`; `sqlite_master` `sql` ordered by `name` equal before and after
  a second `up(db)`; `warn` not called.
- `it('never throws: a colliding object rolls the whole unit back, warns once, and the next start completes it')` — on
  `new Database(':memory:')` run `CREATE TABLE z (a); CREATE INDEX research_derived_datasets ON z (a)` (an index holding
  the second table's name, so its `CREATE TABLE` throws inside the unit; a pre-existing `research_deletions (x TEXT)`
  would not do: `CREATE TABLE IF NOT EXISTS` skips it silently, measured); `expect(() => m056.up(db)).not.toThrow()`;
  `warn` called once with `/^\[056\]/`; `research_deletions` absent from `sqlite_master` (it was created first and
  rolled back: one transaction). `DROP INDEX research_derived_datasets`, run `up` again: both tables present with the
  columns above; `warn` not called again (control).
- `it('is registered in migrationRunner after 055')` — as `migration043.test.js:70-76`.

`server/__tests__/schemaHealth.test.js`, one case:
- `it('PR4: a missing deletion or dataset table is named')` — fresh db, `DROP TABLE IF EXISTS research_deletions;
  DROP TABLE IF EXISTS research_derived_datasets;` → `missing.filter((m) => ['research_deletions',
  'research_derived_datasets', 'research_consent'].includes(m))` equals `['research_deletions',
  'research_derived_datasets']` (`research_consent`, untouched, is the control). PR1's "a fresh database is ok" case
  now covers the new entries.

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/migration056.test.js server/__tests__/schemaHealth.test.js`
Expected: FAIL — `Cannot find module '../migrations/056-research-deletions'`; the `schemaHealth` filter reads `[]`
(the `DROP … IF EXISTS` drops nothing, and the tables are not in `EXPECTED_SCHEMA`).

- [ ] **Step 3: Implement**

`server/migrations/056-research-deletions.js`. Header: what each table is (§5.15); why `research_deletions` holds no
row count (how many rows an editor had measures their volume) and no person (the interval id is the proof's link to
`research_consent`, which outlives it, §5.14); why no foreign key (the records are deleted together a stated period
after the retention date, G1.15, and the consent table carries no foreign key either, PR3 migration `055`); why
`research_derived_datasets` lives in `sessions.db` (it must survive the deletion it guards, §5.15) and has no writer here
(G1.5's step writes it); why it never throws (CLAUDE.md § Tech Stack, `048`'s boundary at
`server/migrations/048-book-term-preference.js:373-392`); that `checks.schema` reports a failure.

```js
function migrate(db) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS research_deletions (
        kind TEXT NOT NULL CHECK (kind IN ('withdrawal', 'retention')),
        interval_id INTEGER,                              -- the consent interval; plain integer, no FOREIGN KEY
        done_at_ms INTEGER NOT NULL CHECK (done_at_ms > 0),
        verified INTEGER NOT NULL CHECK (verified IN (0, 1)),
        CHECK ((kind = 'withdrawal') = (interval_id IS NOT NULL))
      );
      CREATE TABLE IF NOT EXISTS research_derived_datasets (
        path TEXT NOT NULL CHECK (length(path) > 0),
        sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
        created_day TEXT NOT NULL CHECK (created_day GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
      );
    `);
  })();
}
```

`up(db)`: the `053` boundary, prefix `[056]`, saying what fails while it is incomplete (both deletion scripts exit
non-zero, so every withdrawn interval stays due and the research backup takes no copy; `checks.schema` reports it),
that it retries on every start, and that it is not thrown on purpose. Append the `require`. In
`server/lib/schemaHealth.js`, add both tables with every column above, in that order, and a header line: "PR4 (spec
§5.20): tables only, no index".

- [ ] **Step 4: Run them**

Run: `npx vitest run server/__tests__/migration056.test.js server/__tests__/schemaHealth.test.js server/__tests__/migrationIdempotency.test.js server/__tests__/migrationRunnerCoverage.test.js server/__tests__/startup.test.js server/__tests__/researchSchema.test.js`
Expected: PASS (`startup.test.js:80-89` sees `056` follow `055` densely; PR3's "lives outside server/migrations" case
finds no research-file table named here). Then `npm test`; diff the failing set by name against `main`'s.

- [ ] **Step 5: Commit**

```bash
git add server/migrations/056-research-deletions.js server/services/migrationRunner.js server/lib/schemaHealth.js \
  server/__tests__/migration056.test.js server/__tests__/schemaHealth.test.js
git commit -m "feat(server): research_deletions and research_derived_datasets (migration 056)"
```

---

### Task 2: every research-side path, and the backup policy's values

Spec §5.15 step 4 (`research-exports/`, never `served-version-exports/`), §5.17 (local copies, pruning by age, the
heartbeat), §5.20 (the threshold's formula); T19 (the arithmetic half; its pin against `install-cron.sh` is Task 11's);
decisions 2, 23, 24, 40.

**Files:**
- Create: `server/lib/researchFiles.js` — `researchFilesFor(researchPath)`
- Create: `server/lib/researchBackupPolicy.js` — `RESEARCH_BACKUP_CRON_HOURS`, `MAX_COPY_AGE_HOURS`,
  `PRUNE_CUTOFF_HOURS`, `RESEARCH_BACKUP_STALE_HOURS`, `COPY_NAME`, `stamp`, `copyName`, `stampMs`, `expiredNames`
- Modify: `server/lib/featureFlags.js` (as PR3 Task 8 leaves it) — `ENV_SCAN_FILES` gains `lib/researchFiles.js`,
  `lib/researchBackupPolicy.js`
- Test: `server/__tests__/researchFiles.test.js` (new), `server/__tests__/researchBackupPolicy.test.js` (new)

**Interfaces:**
- Consumes: `resolveResearchDbPath()` (PR3 Task 1), in the test only.
- Produces:
  - `researchFilesFor(researchPath) → Readonly<{ dir, researchPath, walPath, shmPath, backupsDir, exportsDir,
    servedVersionExportsDir, heartbeatPath, stagingPath }>`
  - the four constants (decision 24); `COPY_NAME` (a final copy's name); `stamp(ms) → 'YYYY-MM-DDTHHMMSSZ'`;
    `copyName(ms) → 'research.<stamp>.db'`; `stampMs(name) → number | null` (any owned name, decision 23);
    `expiredNames(names: string[], nowMs) → { expired: string[], unknown: string[] }` (both sorted; empty names ignored)

- [ ] **Step 1: Write the failing tests**

`server/__tests__/researchFiles.test.js` (`SESSIONS_DB_PATH` saved and restored around each case):
- `it('maps production\'s default and a redirected test path')` — unset: `researchFilesFor(resolveResearchDbPath()
  .researchPath)` equals, with `d = path.join(<repo root>, 'pipeline-output')`, `{ dir: d, researchPath:
  path.join(d, 'research.db'), walPath: path.join(d, 'research.db-wal'), shmPath: path.join(d, 'research.db-shm'),
  backupsDir: path.join(d, 'research-backups'), exportsDir: path.join(d, 'research-exports'),
  servedVersionExportsDir: path.join(d, 'served-version-exports'), heartbeatPath: path.join(d,
  '.last-research-backup'), stagingPath: path.join(d, 'research.db.restoring') }`; with `SESSIONS_DB_PATH =
  '/tmp/x/acc-test-1.db'` the same under `/tmp/x` with `researchPath '/tmp/x/acc-test-1.research.db'` and
  `stagingPath '/tmp/x/acc-test-1.research.db.restoring'`.
- `it('a staging path keeps the directory and gets its own -wal')` — `researchFilesFor('/w/research.db.restoring')`
  has `walPath '/w/research.db.restoring-wal'` and `exportsDir '/w/research-exports'`.
- `it('the exports the deletion empties are never the end-of-editing exports, nor the copies')` — `new
  Set([exportsDir, servedVersionExportsDir, backupsDir]).size === 3`; `path.basename(exportsDir) ===
  'research-exports'` (spec §5.15 step 4); the object is frozen.

`server/__tests__/researchBackupPolicy.test.js` (`H = 3_600_000`; `T = Date.UTC(2026, 10, 3, 6, 45, 7)`):
- `it('the cut-off is 7 days minus one cron period; the threshold two missed cycles plus margin (spec §5.17, §5.20)')`
  — `RESEARCH_BACKUP_CRON_HOURS === 6`; `MAX_COPY_AGE_HOURS === 7 * 24`; `PRUNE_CUTOFF_HOURS === MAX_COPY_AGE_HOURS -
  RESEARCH_BACKUP_CRON_HOURS`; `RESEARCH_BACKUP_STALE_HOURS === 2 * RESEARCH_BACKUP_CRON_HOURS + 2`. Control: the same
  formula on the content cron's period reproduces `contentBackupHealth.DEFAULT_STALE_HOURS` (`2 * 2 + 2`), and on the
  editorial backup's `offboxBackupHealth.DEFAULT_STALE_HOURS` (`2 * 6 + 2`). (The cron period itself is pinned against
  `install-cron.sh` in Task 11.)
- `it('names copies by a UTC stamp, and reads back only the names it owns')` — `stamp(T) === '2026-11-03T064507Z'`;
  `copyName(T) === 'research.2026-11-03T064507Z.db'`; `stampMs(n) === T` for `n` in `[copyName(T), `${copyName(T)}.partial`,
  `${copyName(T)}.partial-wal`, `${copyName(T)}.verify`, `${copyName(T)}-journal`]`; `stampMs(n) === null` for
  `['sessions.2026-11-03-064507.db', 'research.db', 'research.db.restoring', 'research.2026-13-03T064507Z.db',
  'research.2026-02-30T000000Z.db', 'research.2026-11-03T246000Z.db', `${copyName(T)}.bak`, `${copyName(T)}.replaced`,
  'notes.txt']`; `COPY_NAME.test(copyName(T))` and not
  `COPY_NAME.test(`${copyName(T)}.partial`)`.
- `it('expires what has reached the cut-off, keeps what has not, and reports what it did not make')` — `C =
  PRUNE_CUTOFF_HOURS * H`; `expiredNames([copyName(T - C), copyName(T - C + 60_000), `${copyName(T - C + 60_000)}-wal`,
  `${copyName(T - 170 * H)}.partial`, `${copyName(T - 200 * H)}-shm`, 'notes.txt', copyName(T + 7 * H),
  copyName(T + 60_000), ''], T)` equals `{ expired: [`${copyName(T - 200 * H)}-shm`, `${copyName(T - 170 * H)}.partial`,
  copyName(T - C)].sort(), unknown: ['notes.txt', copyName(T + 7 * H)].sort() }` (a copy exactly at the cut-off goes;
  one a minute younger and its side file stay; a stamp more than one period ahead is unknown; one a minute ahead is a
  clock nudge and stays).

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/researchFiles.test.js server/__tests__/researchBackupPolicy.test.js`
Expected: FAIL — `Cannot find module '../lib/researchFiles'` and `Cannot find module '../lib/researchBackupPolicy'`.

- [ ] **Step 3: Implement**

`server/lib/researchFiles.js` (header: decision 2; spec §5.15 step 4 and §5.17's directories; that every research-side
file is beside the research file, so `SESSIONS_DB_PATH` moves them all):

```js
const path = require('path');

function researchFilesFor(researchPath) {
  const dir = path.dirname(researchPath);
  return Object.freeze({
    dir,
    researchPath,
    walPath: `${researchPath}-wal`,
    shmPath: `${researchPath}-shm`,
    backupsDir: path.join(dir, 'research-backups'),
    exportsDir: path.join(dir, 'research-exports'),
    servedVersionExportsDir: path.join(dir, 'served-version-exports'),
    heartbeatPath: path.join(dir, '.last-research-backup'),
    stagingPath: `${researchPath}.restoring`, // a restore's staged copy (decision 32); the prune refuses to ignore it
  });
}

module.exports = { researchFilesFor };
```

`server/lib/researchBackupPolicy.js` (header: enforceable values changed with their test (CLAUDE.md § One source of
truth); the cron period is the research line of `scripts/install-cron.sh`, pinned in that test; R2's 7 days; why the
cut-off subtracts one period (§5.17: no copy older than 7 days at any moment, and a copy is next looked at one period
later); why there is no environment override (decision 24); decision 23's owned names):

```js
const H = 3_600_000;
const RESEARCH_BACKUP_CRON_HOURS = 6;
const MAX_COPY_AGE_HOURS = 7 * 24;
const PRUNE_CUTOFF_HOURS = MAX_COPY_AGE_HOURS - RESEARCH_BACKUP_CRON_HOURS;
const RESEARCH_BACKUP_STALE_HOURS = 2 * RESEARCH_BACKUP_CRON_HOURS + 2;
const COPY_NAME = /^research\.\d{4}-\d{2}-\d{2}T\d{6}Z\.db$/;
const OWNED_NAME =
  /^research\.(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})Z\.db(?:\.partial|\.verify)?(?:-wal|-shm|-journal)?$/;

function stamp(ms) {
  const s = new Date(ms).toISOString();
  return `${s.slice(0, 10)}T${s.slice(11, 13)}${s.slice(14, 16)}${s.slice(17, 19)}Z`;
}
const copyName = (ms) => `research.${stamp(ms)}.db`;

function stampMs(name) {
  const m = OWNED_NAME.exec(name);
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const ms = Date.UTC(y, mo - 1, d, h, mi, s);
  // A real instant only: 2026-02-30 would roll over to March and silently age the wrong way.
  return stamp(ms) === `${m[1]}-${m[2]}-${m[3]}T${m[4]}${m[5]}${m[6]}Z` ? ms : null;
}

function expiredNames(names, nowMs) {
  const expired = [];
  const unknown = [];
  for (const name of names) {
    if (!name) continue;
    const t = stampMs(name);
    if (t === null || t - nowMs > RESEARCH_BACKUP_CRON_HOURS * H) unknown.push(name);
    else if (nowMs - t >= PRUNE_CUTOFF_HOURS * H) expired.push(name);
  }
  return { expired: expired.sort(), unknown: unknown.sort() };
}

module.exports = {
  RESEARCH_BACKUP_CRON_HOURS, MAX_COPY_AGE_HOURS, PRUNE_CUTOFF_HOURS, RESEARCH_BACKUP_STALE_HOURS,
  COPY_NAME, stamp, copyName, stampMs, expiredNames,
};
```

Add both files to `ENV_SCAN_FILES`.

- [ ] **Step 4: Run them**

Run: `npx vitest run server/__tests__/researchFiles.test.js server/__tests__/researchBackupPolicy.test.js server/__tests__/featureFlags.test.js`
Expected: PASS (the env scanner finds no `process.env` read in either file).

- [ ] **Step 5: Commit**

```bash
git add server/lib/researchFiles.js server/lib/researchBackupPolicy.js server/lib/featureFlags.js \
  server/__tests__/researchFiles.test.js server/__tests__/researchBackupPolicy.test.js
git commit -m "feat(server): the research file's paths and its backup policy values, derived and pinned (spec §5.17)"
```

---

### Task 3: the retention date — empty until SD6, pinned

Spec §5.15 ("The retention date is an enforceable value … empty until SD6 sets it, and the script deletes nothing by
date until then"), §15 (SD6); decisions 12, 40.

**Files:**
- Create: `server/lib/researchRetention.js` — `RETENTION_DATE`, `retentionDateMs(date)`
- Modify: `server/lib/featureFlags.js` — `ENV_SCAN_FILES` gains `lib/researchRetention.js`
- Test: `server/__tests__/researchRetention.test.js` (new)

**Interfaces:**
- Produces: `RETENTION_DATE: string | null` (**`null`**); `retentionDateMs(date: string | null) → number | null` (UTC
  midnight of a real `YYYY-MM-DD`; throws `TypeError` on anything else).

- [ ] **Step 1: Write the failing test**

- `it('is empty until SD6 sets it (spec §5.15)')` — `expect(RETENTION_DATE).toBeNull()`. Comment above it: the commit
  that sets the date changes this line, cites SD6's record, and is reviewed like the approved-texts list.
- `it('the constant is always well formed')` — `expect(() => retentionDateMs(RETENTION_DATE)).not.toThrow()`.
- `it('reads a real date as its UTC midnight and refuses anything else')` — `retentionDateMs(null) === null`;
  `retentionDateMs('2030-06-30') === Date.UTC(2030, 5, 30)`; each of `'2030-6-30'`, `'2030-02-30'`, `''`,
  `'30.6.2030'`, `20300630` throws `TypeError`.

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/researchRetention.test.js`
Expected: FAIL — `Cannot find module '../lib/researchRetention'`.

- [ ] **Step 3: Implement** `server/lib/researchRetention.js` (header: an enforceable value changed with its test; SD6
  sets it; while `null`, `research-retention.js` finds nothing due and the backup job's every-cycle call changes
  nothing; no seam and no flag set it (decision 12)):

```js
const RETENTION_DATE = null;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function retentionDateMs(date) {
  if (date === null) return null;
  const m = typeof date === 'string' ? DATE.exec(date) : null;
  const ms = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : NaN;
  if (!m || new Date(ms).toISOString().slice(0, 10) !== date) {
    throw new TypeError(`the retention date must be YYYY-MM-DD or null, got ${JSON.stringify(date)}`);
  }
  return ms;
}

module.exports = { RETENTION_DATE, retentionDateMs };
```

Add the file to `ENV_SCAN_FILES`.

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/researchRetention.test.js server/__tests__/featureFlags.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/lib/researchRetention.js server/lib/featureFlags.js server/__tests__/researchRetention.test.js
git commit -m "feat(server): the research retention date, empty until SD6 (spec §5.15)"
```

---

### Task 4: the admin reader module, which nothing outside `server/scripts/` may require

Spec §5.16 ("admin readers live in a module under `server/scripts/`, which no file in `server/routes/` or
`server/services/` may require"), §5.1 (`fileMustExist`); T17 (PR4 part: the admin reader); index decision 6;
decisions 13, 16.

**Files:**
- Create: `server/scripts/lib/researchAdmin.js` — `SCRIPT_BUSY_TIMEOUT_MS`, `openResearch`, `keyForInterval`,
  `allKeys`, `anyResearchRow`, `iterateEvents`, `itemsForEvent`
- Modify: `server/__tests__/researchBoundary.test.js` — one `describe`, `nonScriptFilesNaming`
- Test: `server/__tests__/researchAdmin.test.js` (new)

**Interfaces:**
- Consumes: `better-sqlite3`; `ensureResearchSchema` (PR3 Task 2), in the test.
- Produces:
  - `SCRIPT_BUSY_TIMEOUT_MS = 5000`
  - `openResearch({ researchPath, write = false, busyTimeoutMs = SCRIPT_BUSY_TIMEOUT_MS }) → Database` — `{ readonly:
    !write, fileMustExist: true, timeout: busyTimeoutMs }`, `defaultSafeIntegers(true)`; never sets the journal mode;
    throws `SQLITE_CANTOPEN` when the file is absent
  - `keyForInterval(db, intervalId) → string | null`; `allKeys(db) → { intervalId: bigint, editorKey: string }[]`
    (by `interval_id`); `anyResearchRow(db) → boolean` (an event, an item or a key)
  - `iterateEvents(db) → IterableIterator<object>` (`ORDER BY editor_key, key_seq`); `itemsForEvent(db, eventId:
    bigint) → object[]` (`ORDER BY ordinal`)

- [ ] **Step 1: Write the failing tests**

`server/__tests__/researchAdmin.test.js` — a research file built by `ensureResearchSchema` on a temp path, put in WAL
mode, seeded by SQL: keys `K1` (interval 1) and `K2` (interval 2), two events under `K1` (one with id
`9007199254740993n`, `key_seq` 1 and 2) with one item each, one event under `K2`.
- `it('opens only an existing file')` — `openResearch({ researchPath: <missing> })` throws an error whose `code` is
  `'SQLITE_CANTOPEN'`, and the path still does not exist (control: the seeded path opens).
- `it('is read-only unless asked to write')` — a `DELETE` through `openResearch({ researchPath })` throws
  `/readonly/i`; through `openResearch({ researchPath, write: true })` it succeeds (control, on a copy of the file).
- `it('reads ids above 2^53 exactly (PR3 decision 4)')` — `[...iterateEvents(db)].map((e) => e.id)` contains
  `9007199254740993n`.
- `it('the readers')` — `keyForInterval(db, 1) === K1`, `keyForInterval(db, 3) === null`; `allKeys(db)` equals `[{
  intervalId: 1n, editorKey: K1 }, { intervalId: 2n, editorKey: K2 }]`; `anyResearchRow(db)` true, and false on a file
  whose rows were all deleted through a write handle; `iterateEvents` yields `[K1's seq 1, K1's seq 2, K2's seq 1]` in
  that order (by `editor_key`, then `key_seq`, with `K1 < K2` chosen so); `itemsForEvent(db, <id>)` equals that event's
  item rows.
- `it('holds no write statement')` — `src = fs.readFileSync(<module>, 'latin1')`;
  `/\b(?:INSERT|UPDATE|DELETE|REPLACE|VACUUM|ATTACH|DROP|ALTER|CREATE)\s/.test(src)` is `false`. Control: the same
  pattern matches `server/services/researchLog.js` (`INSERT INTO research_events`). (Upper-case SQL keywords only:
  prose in comments is lower case.)

`server/__tests__/researchBoundary.test.js`, one `describe`:

```js
const ADMIN_READER = /\bresearchAdmin\b/;
// Every top-level entry of server/ except these. filesNaming (PR2) walks everything under its root,
// node_modules and .venv included, so this walker skips them by name at any depth.
const SKIP_DIRS = new Set(['node_modules', '.venv']);
const SCRIPT_SIDE = new Set(['scripts', '__tests__']);
function nonScriptFilesNaming(root, pattern) {
  const found = [];
  const visited = [];
  const walk = (dir, top) => {
    for (const e of nodeFs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name) || (top && SCRIPT_SIDE.has(e.name))) continue;
      const p = nodePath.join(dir, e.name);
      if (e.isDirectory()) walk(p, false);
      else if (/\.(?:c|m)?js$/.test(e.name)) {
        visited.push(nodePath.relative(root, p));
        if (pattern.test(nodeFs.readFileSync(p, 'latin1'))) found.push(nodePath.relative(root, p));
      }
    }
  };
  walk(root, true);
  return { found: found.sort(), visited };
}
```

- `it('no file outside server/scripts/ and server/__tests__/ requires the admin reader (spec §5.16)')` —
  `nonScriptFilesNaming(SERVER_ROOT, ADMIN_READER).found` equals `[]`, and its `visited` contains
  `'routes/research.js'`, `'services/researchLog.js'` and `'lib/researchFiles.js'` (an empty result is not an empty read).
- `it('control: a planted require is named wherever it is not allowed')` — a temp root with `routes/x.js`,
  `services/y.js` and `lib/z.js` each holding `require('../scripts/lib/researchAdmin')`, plus `scripts/research-a.js` and
  `__tests__/b.test.js` holding the same → `found` equals `['lib/z.js', 'routes/x.js', 'services/y.js']`.

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/researchAdmin.test.js server/__tests__/researchBoundary.test.js`
Expected: FAIL — `researchAdmin.test.js`: `Cannot find module '../scripts/lib/researchAdmin'`. The new boundary
`describe` PASSES on its first run: nothing requires a module that does not exist yet, so it is a pin, and its red arm is
the planted control in the same `describe` (PR3 decision 63's shape).

- [ ] **Step 3: Implement** `server/scripts/lib/researchAdmin.js` (header: spec §5.16 — admin only, no route; the
  openers and the reads, never a write; that the deletion scripts use the key readers and an export must not (no
  export joins the key map); `fileMustExist` (§5.1); safe integers (PR3 decision 4); `SCRIPT_BUSY_TIMEOUT_MS` and why it
  is longer than the server's (decision 13); "nothing outside `server/scripts/` and `server/__tests__/` may require this
  file: `researchBoundary.test.js` walks the rest of `server/`"):

```js
const Database = require('better-sqlite3');

const SCRIPT_BUSY_TIMEOUT_MS = 5000;

function openResearch({ researchPath, write = false, busyTimeoutMs = SCRIPT_BUSY_TIMEOUT_MS }) {
  const db = new Database(researchPath, { readonly: !write, fileMustExist: true, timeout: busyTimeoutMs });
  db.defaultSafeIntegers(true);
  return db;
}
const keyForInterval = (db, intervalId) =>
  db.prepare('SELECT editor_key FROM editor_keys WHERE interval_id = ?').get(intervalId)?.editor_key ?? null;
const allKeys = (db) =>
  db
    .prepare('SELECT interval_id, editor_key FROM editor_keys ORDER BY interval_id')
    .all()
    .map((r) => ({ intervalId: r.interval_id, editorKey: r.editor_key }));
const anyResearchRow = (db) =>
  Boolean(
    db
      .prepare(
        'SELECT 1 FROM editor_keys UNION ALL SELECT 1 FROM research_events UNION ALL SELECT 1 FROM research_event_items LIMIT 1'
      )
      .get()
  );
const iterateEvents = (db) => db.prepare('SELECT * FROM research_events ORDER BY editor_key, key_seq').iterate();
const itemsForEvent = (db, eventId) =>
  db.prepare('SELECT * FROM research_event_items WHERE event_id = ? ORDER BY ordinal').all(eventId);

module.exports = {
  SCRIPT_BUSY_TIMEOUT_MS, openResearch, keyForInterval, allKeys, anyResearchRow, iterateEvents, itemsForEvent,
};
```

- [ ] **Step 4: Run them**

Run: `npx vitest run server/__tests__/researchAdmin.test.js server/__tests__/researchBoundary.test.js`
Expected: PASS, every `describe` in `researchBoundary.test.js` including PR1–PR3's.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/lib/researchAdmin.js server/__tests__/researchAdmin.test.js server/__tests__/researchBoundary.test.js
git commit -m "feat(server): the research admin reader, reachable only from server/scripts (spec §5.16; T17)"
```

---

### Task 5: the shared purge steps — compact, scan, empty the exports

Spec §5.15 steps 2–4, G-2 (no `SQLITE_SECURE_DELETE`; physical deletion relies on `VACUUM` and the checkpoint);
decisions 5, 7; Review Focus 22, 26.

**Files:**
- Create: `server/scripts/lib/researchPurge.js` — `checkpointBusy(db)`, `compact(db)`, `scanForKeys(paths, keys)`,
  `emptyExports(exportsDir)`
- Test: `server/__tests__/researchPurge.test.js` (new)

**Interfaces:**
- Produces:
  - `checkpointBusy(db) → boolean` — on a write handle: writes one frame (`PRAGMA user_version` set to the value it
    holds, in an immediate transaction; an `SQLITE_BUSY` there is busy), then `PRAGMA wal_checkpoint(TRUNCATE)`'s
    `busy` is not 0 (decision 5)
  - `compact(db) → { ok: true } | { ok: false, step: 'checkpoint-1' | 'vacuum' | 'checkpoint-2', errorCode? }` —
    never throws; stops at the first failure
  - `scanForKeys(paths: string[], keys: string[]) → string[]` — the keys whose ASCII bytes occur in any existing file
    (sorted, each once); an absent path is skipped; another read error throws
  - `emptyExports(exportsDir) → 'absent' | 'emptied'` — removes every entry inside, keeps the directory, never follows
    a link; throws on a removal failure

- [ ] **Step 1: Write the failing test** — each case on its own temp directory; a WAL research-shaped file made with
  better-sqlite3 (`CREATE TABLE t (k TEXT, x TEXT)`), `bytesHave(p, s)` reading `p` and `${p}-wal` when present.

- `it('compaction removes deleted bytes from the file and its WAL; a DELETE alone does not (G-2; measured)')` — insert
  `('a1b2…' (a 32-hex key), 'SENTINEL-PURGE ' + 'x'.repeat(200))` × 50; delete them; `bytesHave(p, 'SENTINEL-PURGE')`
  is `true` (the control: deleted, still on disk); `compact(db)` equals `{ ok: true }`; then `bytesHave(p,
  'SENTINEL-PURGE')` and `bytesHave(p, <key>)` are `false`, and `fs.statSync(`${p}-wal`).size === 0`.
- `it('a reader holding a transaction makes the first checkpoint busy, and compaction stops before VACUUM')` — the
  handle opened with `{ timeout: 100 }`; a second connection runs `BEGIN` and a `SELECT`; `compact(db)` equals `{ ok:
  false, step: 'checkpoint-1' }`; after the reader commits, `compact(db)` equals `{ ok: true }` (control).
- `it('a reader that began while the WAL was empty is still seen (read-lock 0; decision 5)')` — write the file through
  a handle and **close it** (no `-wal` left); a second connection runs `BEGIN` and a `SELECT`; open the handle under test
  with `{ timeout: 100 }`. The premise, in this fixture: a bare `db.pragma('wal_checkpoint(TRUNCATE)')[0].busy` reads
  `0` (measured: the checkpoint of an empty WAL cannot see a lock-0 reader). Then `checkpointBusy(db)` is `true`, and
  `user_version` reads what it read before (the frame changed nothing). The reader commits; `checkpointBusy(db)` is
  `false` and `fs.statSync(`${p}-wal`).size === 0` (control).
- `it('an idle second connection does not make it busy')` — a second connection that ran one `SELECT` and holds no
  transaction; `checkpointBusy(db)` is `false` (measured; the control that the cases above test the transaction, not
  the connection).
- `it('a writer holding the lock makes it busy, without throwing')` — a second connection holds `BEGIN IMMEDIATE`;
  `checkpointBusy(db)` (timeout 100) is `true`; after its `COMMIT`, `false` (measured).
- `it('a rollback-journal file compacts')` — a file never put in WAL mode: `compact(db)` equals `{ ok: true }`.
- `it('scanForKeys finds a key wherever SQLite put it, and only those given')` — files `a` (holds `K1`), `b` (holds
  `K2`), `c` absent: `scanForKeys([a, b, c], [K2, K1, K3, K1])` equals `[K1, K2].sort()`; `scanForKeys([c], [K1])`
  equals `[]`.
- `it('emptyExports empties the directory, keeps it, and never follows a link')` — absent dir → `'absent'` and still
  absent; a dir holding `a.jsonl`, `sub/b.jsonl` and `link` → a symlink to a file `outside/keep.txt` → `'emptied'`, the
  dir exists and `fs.readdirSync` is `[]`, `outside/keep.txt`'s bytes unchanged; a sibling
  `served-version-exports/y.jsonl` unchanged (the control at this level: only the named directory is touched).

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/researchPurge.test.js`
Expected: FAIL — `Cannot find module '../scripts/lib/researchPurge'`.

- [ ] **Step 3: Implement** `server/scripts/lib/researchPurge.js` (header: spec §5.15 steps 2–4 and G-2; the measured
  facts in this plan's "State" (a `DELETE` leaves bytes in free pages, inside pages still in use and in the WAL; the
  online backup copies them); why each checkpoint must report busy 0, and why it writes one frame first (decision 5's
  measurement); that `-shm` is not scanned (the WAL index, no row content; §5.15 names the file and its `-wal`); that
  `served-version-exports/` is never touched):

```js
const fs = require('fs');
const path = require('path');

function checkpointBusy(db) {
  // One frame first (decision 5): a reader that began while the WAL was empty holds read-lock 0, which a checkpoint
  // of an empty WAL cannot see (measured). Writing the version the file already holds changes nothing else.
  try {
    const v = Number(db.pragma('user_version', { simple: true }));
    db.transaction(() => db.pragma(`user_version = ${v}`)).immediate();
  } catch (err) {
    if (err.code === 'SQLITE_BUSY') return true; // a writer holds the lock past the wait
    throw err;
  }
  const [row] = db.pragma('wal_checkpoint(TRUNCATE)');
  return Number(row.busy) !== 0;
}

function compact(db) {
  const step = (name, fn) => {
    try {
      return fn() ? null : { ok: false, step: name };
    } catch (err) {
      return { ok: false, step: name, errorCode: err.code || err.name };
    }
  };
  return (
    step('checkpoint-1', () => !checkpointBusy(db)) ||
    step('vacuum', () => (db.exec('VACUUM'), true)) ||
    step('checkpoint-2', () => !checkpointBusy(db)) || { ok: true }
  );
}

function scanForKeys(paths, keys) {
  const found = new Set();
  for (const p of paths) {
    let bytes;
    try {
      bytes = fs.readFileSync(p);
    } catch (err) {
      if (err.code === 'ENOENT') continue; // no -wal yet, or a staged file's
      throw err;
    }
    for (const k of keys) if (bytes.includes(Buffer.from(k, 'ascii'))) found.add(k);
  }
  return [...found].sort();
}

function emptyExports(exportsDir) {
  let entries;
  try {
    entries = fs.readdirSync(exportsDir);
  } catch (err) {
    if (err.code === 'ENOENT') return 'absent';
    throw err;
  }
  // rmSync removes a symlink itself, never its target.
  for (const e of entries) fs.rmSync(path.join(exportsDir, e), { recursive: true, force: true });
  return 'emptied';
}

module.exports = { checkpointBusy, compact, scanForKeys, emptyExports };
```

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/researchPurge.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/lib/researchPurge.js server/__tests__/researchPurge.test.js
git commit -m "feat(server): the research purge steps — compact, byte scan, empty the exports (spec §5.15)"
```

---

### Task 6: `research-withdrawal.js` — due intervals deleted, compacted, verified and recorded

Spec §5.15 (the withdrawal row, "Each run", steps 1–5, "A restore"), §5.1 (`fileMustExist`), §5.16 (the key last),
§5.22 (the first `research_consent` exception); T9 (the script's parts), T17 (the exception exercised; `lib/research*`
scanned); decisions 4–10, 13, 15, 17; Review Focus 3, 4, 5, 22, 23.

**Files:**
- Create: `server/scripts/research-withdrawal.js` — `USAGE`, `dueIntervals(sessions, research)`, `runWithdrawal(opts)`,
  `main(argv)`
- Modify: `server/__tests__/researchAppendOnly.test.js` (as PR3 Task 11 leaves it) — `DELETE_ALLOWED`'s first entry
  (decision 15; PR3 defined the shape and the rule) and two cases on the real list
- Modify: `server/__tests__/researchBoundary.test.js` — `forbiddenTableUses` also reads `scripts/lib/research*.js`; the
  exception exercised; the admin reader's positive control
- Test: `server/__tests__/researchWithdrawal.test.js` (new)

**Interfaces:**
- Consumes: `resolveResearchDbPath` (PR3 Task 1), `researchFilesFor` (Task 2), `openResearch`, `keyForInterval`,
  `SCRIPT_BUSY_TIMEOUT_MS` (Task 4), `researchPurge` (Task 5); in the test PR3's `researchFixture.cjs` (`APPROVED`,
  `makeUser`, `consent`, `saveEvent`, `readResearch`, `losses`), `researchConsent.withdraw`, `recordLoss`,
  `researchLog.record`.
- Produces:
  - `dueIntervals(sessions, research) → number[]` (decision 4)
  - `runWithdrawal({ researchPath, sessionsPath, write, nowMs?, busyTimeoutMs?, steps? }) → report`, where `steps`
    defaults to `researchPurge` (a test may replace one step) and `report` is `{ script: 'research-withdrawal', write,
    due: number[], ok }` plus, after a pre-flight refusal, `failed: 'checkpoint-preflight'`, or, after a delete, `compact:
    'ok' | <step>`, `scan: 'clean' | 'found' | 'no-key' | 'not-run'`, `exports: 'emptied' | 'absent' | 'failed'`,
    `verified: number[]`; throws `SQLITE_CANTOPEN` when the research file is absent, and throws when the loss-row
    delete fails (before the research delete, decision 6)
  - `main(argv) → 0 | 1 | 2` (0 done or nothing due or a clean dry run; 1 a step failed or a file is absent; 2 usage)

- [ ] **Step 1: Write the failing tests**

`server/__tests__/researchWithdrawal.test.js` — env before requires (`SESSIONS_DB_PATH` in a `mkdtempSync` dir,
`JWT_SECRET`); `runAllMigrations()`; `researchDb.openAtBoot()`; `researchConsentText._setTestApprovedTexts(APPROVED)`;
`serverCommit._setTestServerCommit({ serverCommit: 'c'.repeat(40), commitSource: 'deploy-file', codeDirty: 0 })`.
`files = researchFilesFor(researchPath)`; `bytes()` = the research file and its `-wal` concatenated; `keyOf(i)` reads
`editor_keys` through `readResearch()`; `run(write, over)` = `runWithdrawal({ researchPath, sessionsPath: editorialPath,
write, busyTimeoutMs: 100, ...over })`; `byId = (a, b) => a - b` (interval ids are numbers: `[9, 11].sort()` is
`[11, 9]`); `itemsOf(key)` = `SELECT * FROM research_event_items WHERE event_id IN (SELECT id FROM research_events
WHERE editor_key = ?) ORDER BY event_id, ordinal` through `readResearch()`. `beforeEach` builds (every event with one
item, every interval with a loss row, so an unscoped `DELETE` of either is visible):
- `p-wd` consents (interval `A`) and records three events with `content: { text: 'SENTINEL-WD-<n>', note: null,
  category: null }` and one item each, plus two loss rows (`recordLoss`, `clientActionId 'l-1'`, `'l-2'`);
- `p-keep` consents (interval `K`) and records two events `'SENTINEL-KEEP-<n>'`, one item each, plus one loss row
  (`'k-1'`);
- `p-re` consents (interval `R`), records `'SENTINEL-OLD'` (one item) and one loss row (`'r-1'`), withdraws
  (`researchConsent.withdraw`), consents again (interval `B`), records `'SENTINEL-NEW'` (one item) and one loss row
  (`'b-1'`);
- `files.exportsDir/x.jsonl` and `files.servedVersionExportsDir/y.jsonl`.

Cases:
- `it('nothing due changes nothing and exits 0 (T9)')` — before `p-wd` withdraws and with `p-re`'s `R` marked done by
  SQL (`UPDATE research_consent SET deletion_done_at_ms = 1 WHERE id = R`; then, through a write handle on the research
  file, `R`'s events deleted (their items cascade) and only then its key row: an event still naming the key would make
  that delete throw `FOREIGN KEY constraint failed`, PR3 Task 2's own pin): `run(true)` equals `{ script:
  'research-withdrawal', write: true, due: [], ok: true }`; `SELECT * FROM research_deletions` is `[]`; `x.jsonl` still
  exists; `bytes()` still holds `'SENTINEL-KEEP-1'` (control).
- `it('a dry run lists what is due and changes nothing')` — `p-wd` withdraws; `run(false)` has `due` equal `[A,
  R].sort(byId)` and `ok: true`; the research tables' rows (`SELECT *` from each, through `readResearch()`), `losses()`,
  `research_deletions` and the export files are equal by value before and after.
- `it('T9: a write run deletes the interval\'s events, items, loss rows and key, compacts, verifies and records')` —
  `p-wd` withdraws. First the control: `bytes()` holds `'SENTINEL-WD-1'` and `keyOf(A)`. `report = run(true)`: `report`
  equals `{ script: 'research-withdrawal', write: true, due: [A, R].sort(byId), compact: 'ok', scan: 'clean', exports:
  'emptied', verified: [A, R].sort(byId), ok: true }`. Then: no `research_events` row has `editor_key` `keyOf(A)` (read
  before the run); no item has an `event_id` from `A`'s event ids; `editor_keys` has no row for `A` or `R`;
  `losses().filter((l) => [A, R].includes(l.interval_id))` is `[]`; `bytes()` holds neither `'SENTINEL-WD'` nor `'SENTINEL-OLD'`
  nor either key; `research_deletions` ordered by `interval_id` equals `[{ kind: 'withdrawal', interval_id: <min>,
  done_at_ms: <number>, verified: 1 }, { …<max>…, verified: 1 }]`; `A`'s and `R`'s starting rows have a numeric
  `deletion_done_at_ms`, `p-keep`'s and `B`'s are `null`; `fs.readdirSync(files.exportsDir)` is `[]`;
  `y.jsonl`'s bytes are unchanged. Positive controls in the same test, each read before and after and equal by value:
  `p-keep`'s and `B`'s events (`id`, `content_json`), their items (`itemsOf(keyOf(K))`, `itemsOf(keyOf(B))`), their loss
  rows (`losses().filter((l) => [K, B].includes(l.interval_id))`, which holds `'k-1'` and `'b-1'`), and `B`'s key row;
  `bytes()` still holds `'SENTINEL-NEW'`.
- `it('a second run has nothing due')` — after the run above, `run(true).due` is `[]` and `research_deletions` unchanged.
- `it('a restored key row makes a done interval due again (spec §5.15 "A restore")')` — after the T9 run, insert `A`'s
  key row back through a write handle; `run(false).due` contains `A`; `run(true)` is `ok`; `A`'s
  `deletion_done_at_ms` equals its value from the first run (set once); `research_deletions` has a second row for `A`.
- `it('T9: a reader holding the file keeps the interval due and deletes nothing')` — `p-keep` withdraws; a second
  connection on the research file runs `BEGIN` and a `SELECT`; `run(true)` equals `{ script: 'research-withdrawal',
  write: true, due: [K, R].sort(byId), ok: false, failed: 'checkpoint-preflight' }` (`R` is due from `beforeEach`);
  `p-keep`'s events, items, loss row and key row are still present (decision 5); `K`'s and `R`'s
  `deletion_done_at_ms` are `null`; `research_deletions` is `[]`. The reader commits; `run(true)` is `ok` with
  `verified` equal `[K, R].sort(byId)` and `scan: 'clean'` (the scan held both keys).
- `it('a loss-row delete that fails stops the run before the key is touched (decision 6)')` — `p-wd` withdraws; through
  a write handle on `sessions.db`, `ALTER TABLE research_capture_losses RENAME TO rcl_hidden`; `run(true)` throws
  (`/no such table/`); `keyOf(A)` and `A`'s events are still present and `research_deletions` is `[]`. Rename it back
  (control): `run(true)` is `ok`, `scan: 'clean'`, and `A`'s `research_deletions` row has `verified: 1` (the scan still
  held the key).
- `it('a compaction that fails after the delete leaves the interval due, and the next run verifies by compaction alone
  (decision 8)')` — `p-keep` withdraws; `run(true, { steps: { ...researchPurge, compact: () => ({ ok: false, step:
  'checkpoint-1' }) } })` has `ok: false`, `compact: 'checkpoint-1'`, `scan: 'not-run'`; the key row is gone (deleted);
  `deletion_done_at_ms` `null`; no `research_deletions` row. `run(true)` then has `scan: 'no-key'` and `ok: true`, and
  the `research_deletions` row for it has `verified: 0`.
- `it('an export that cannot be removed keeps the interval due (decision 10)')` — `run(true, {
  steps: { ...researchPurge, emptyExports: () => { throw new Error('EACCES'); } } })` → `ok: false`, `exports:
  'failed'`, no `research_deletions` row, `deletion_done_at_ms` `null`; `run(true)` then `ok`.
- `it('the report carries no key and no count (spec §5.15; decision 13)')` — for the T9 report: `/[0-9a-f]{32}/.test(
  JSON.stringify(report))` is `false`, and every number in it is an interval id (`JSON.stringify(report)`'s numbers
  are a subset of `[A, R]`).
- `describe('the command line')` (spawned with `env = { ...process.env, SESSIONS_DB_PATH: editorialPath }`):
  - `it('a dry run prints one JSON report and exits 0')` — `[]` → `status 0`, `JSON.parse(stdout).write === false`.
  - `it('refuses an unknown argument with exit 2, writing nothing')` — `['--force']` and `['--write', 'x']` → `status 2`,
    `stdout ''`.
  - `it('exits 1 when the research file is absent, and does not create it (spec §5.1)')` — `env.SESSIONS_DB_PATH` a
    migrated database in a directory with no research file → `status 1`, stderr matches `/SQLITE_CANTOPEN/`, and
    `deriveResearchPath(<that path>)` still does not exist.

`server/__tests__/researchAppendOnly.test.js` (PR3 Task 11's): `DELETE_ALLOWED`'s frozen object gains its first entry
(PR3's comment above it, its `isAllowed` and `mutations` stay as they are):

```js
  'scripts/research-withdrawal.js': {
    tables: ['research_event_items', 'research_events', 'editor_keys'],
    reason: "a withdrawn interval's rows, its key last (spec §5.15, §5.16)",
  },
  // Task 7: scripts/research-retention.js. Task 8: services/researchDeletion.js.
```

Cases (on the real list, `mutations(root)` with its default):
- `it('no code changes a research row; only the listed files delete, from the listed tables')` — `mutations(SERVER_ROOT)`
  equals `[]`, and `server/scripts/research-withdrawal.js`'s source matches `/DELETE FROM editor_keys/` (aimed right).
- `it('control: an allowed file may delete, and nothing else')` — a temp root with `scripts/research-withdrawal.js`
  holding `DELETE FROM research_events`, `UPDATE research_events SET event_type = ?` and an `editor_keys` upsert, and
  `scripts/research-backup.js` holding `DELETE FROM research_events` → the findings' `${file} ${statement}`, sorted,
  equal `['scripts/research-backup.js DELETE FROM research_events', 'scripts/research-withdrawal.js UPDATE
  research_events', 'scripts/research-withdrawal.js UPSERT editor_keys']`.

`server/__tests__/researchBoundary.test.js` (PR3 Task 31's `describe`s):
- `forbiddenTableUses(root)` reads `scripts/research-*.js` **and** `scripts/lib/research*.js`; its case `it('no
  server/scripts/research-* file names a forbidden table …')` now also asserts the scanned list contains
  `'scripts/research-withdrawal.js'`, `'scripts/research-status.js'`, `'scripts/lib/researchAdmin.js'` and
  `'scripts/lib/researchPurge.js'`.
- `it('T17: research-withdrawal.js uses its exception, and only it (spec §5.22)')` — its bytes match
  `tableRe('research_consent')`, and `forbiddenTableUses(SERVER_ROOT)` reports nothing for it; `Object.keys(
  RESEARCH_SCRIPT_EXCEPTIONS)` equals `['research-withdrawal.js']` (PR3's entry, its reason unchanged).
- `it('control (spec T17): research-withdrawal.js naming segment_edits, or a lib file naming research_consent, is
  found')` — a temp root holding a copy of the real `research-withdrawal.js` with `// segment_edits` appended, and a copy
  of `researchAdmin.js` under `scripts/lib/` with `// research_consent` appended → `[{ file: 'scripts/lib/researchAdmin.js',
  table: 'research_consent' }, { file: 'scripts/research-withdrawal.js', table: 'segment_edits' }]` (sorted by file).
- `it('positive control: the deletion script requires the admin reader')` — `filesNaming(nodePath.join(SERVER_ROOT,
  'scripts'), ADMIN_READER)` contains `'research-withdrawal.js'`.

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/researchWithdrawal.test.js server/__tests__/researchAppendOnly.test.js server/__tests__/researchBoundary.test.js`
Expected: FAIL — `Cannot find module '../scripts/research-withdrawal'`; the append-only "aimed right" case fails (no such
file); the boundary scan list lacks `'scripts/research-withdrawal.js'` and the `lib/` files, and its exception case finds
no file to exercise.

- [ ] **Step 3: Implement** `server/scripts/research-withdrawal.js`. Header (load-bearing): spec §5.15 — dry run unless
  `--write`; what is due (decision 4); the order (pre-flight, loss rows, delete in one transaction with the key last,
  compact, scan, exports, record), why the loss rows go first (decision 6), and that the record is written only if
  all of them passed; that it is §5.22's one
  exception — it names the consent table to find withdrawn intervals and to set `deletion_done_at_ms`, and computes no
  figure; it prints interval ids and step outcomes, never a key or a row count; usage, exit codes; `process.exitCode`,
  never `process.exit()`. **The header names no other forbidden table** (say "the editing record").

```js
const Database = require('better-sqlite3');
const { resolveResearchDbPath } = require('../lib/researchDbPath');
const { researchFilesFor } = require('../lib/researchFiles');
const { openResearch, keyForInterval, SCRIPT_BUSY_TIMEOUT_MS } = require('./lib/researchAdmin');
const researchPurge = require('./lib/researchPurge');

const SCRIPT = 'research-withdrawal';
const USAGE = 'usage: research-withdrawal.js [--write]';

/** Withdrawn intervals still due (spec §5.15): deletion not done yet, or the key row back after a restore. */
function dueIntervals(sessions, research) {
  const hasKey = research.prepare('SELECT 1 FROM editor_keys WHERE interval_id = ?');
  return sessions
    .prepare(
      `SELECT id, deletion_done_at_ms FROM research_consent
        WHERE decision = 'consented' AND interval_id = id AND withdrawn_at_ms IS NOT NULL
        ORDER BY id`
    )
    .all()
    .filter((r) => r.deletion_done_at_ms === null || Boolean(hasKey.get(r.id)))
    .map((r) => r.id);
}

function runWithdrawal({
  researchPath, sessionsPath, write, nowMs = Date.now(), busyTimeoutMs = SCRIPT_BUSY_TIMEOUT_MS,
  steps = researchPurge,
}) {
  const files = researchFilesFor(researchPath);
  const research = openResearch({ researchPath, write, busyTimeoutMs }); // throws when absent (spec §5.1)
  let sessions = null;
  try {
    sessions = new Database(sessionsPath, { readonly: !write, fileMustExist: true, timeout: busyTimeoutMs });
    const due = dueIntervals(sessions, research);
    const report = { script: SCRIPT, write, due, ok: true };
    if (due.length === 0 || !write) return report;
    // Stop before deleting anything while a reader holds the file: the next run then still holds the key to scan for.
    if (steps.checkpointBusy(research)) return { ...report, ok: false, failed: 'checkpoint-preflight' };
    const keys = new Map(due.map((id) => [id, keyForInterval(research, id)]));
    // Loss rows first (spec §5.15's order, decision 6): if this throws, the key is still there for the next run's scan.
    sessions.transaction(() => {
      for (const id of due) sessions.prepare('DELETE FROM research_capture_losses WHERE interval_id = ?').run(id);
    })();
    research
      .transaction(() => {
        for (const key of keys.values()) {
          if (!key) continue;
          research
            .prepare('DELETE FROM research_event_items WHERE event_id IN (SELECT id FROM research_events WHERE editor_key = ?)')
            .run(key);
          research.prepare('DELETE FROM research_events WHERE editor_key = ?').run(key);
          research.prepare('DELETE FROM editor_keys WHERE editor_key = ?').run(key); // last: events reference it
        }
      })
      .immediate();
    const compacted = steps.compact(research);
    const known = [...keys.values()].filter(Boolean);
    const found = compacted.ok ? steps.scanForKeys([files.researchPath, files.walPath], known) : null;
    let exportsState;
    try {
      exportsState = steps.emptyExports(files.exportsDir);
    } catch {
      exportsState = 'failed';
    }
    const passed = compacted.ok && found.length === 0 && exportsState !== 'failed';
    if (passed) {
      sessions.transaction(() => {
        for (const id of due) {
          sessions
            .prepare("INSERT INTO research_deletions (kind, interval_id, done_at_ms, verified) VALUES ('withdrawal', ?, ?, ?)")
            .run(id, nowMs, keys.get(id) ? 1 : 0);
          sessions
            .prepare('UPDATE research_consent SET deletion_done_at_ms = ? WHERE id = ? AND deletion_done_at_ms IS NULL')
            .run(nowMs, id);
        }
      })();
    }
    return {
      ...report,
      compact: compacted.ok ? 'ok' : compacted.step,
      scan: found === null ? 'not-run' : known.length === 0 ? 'no-key' : found.length ? 'found' : 'clean',
      exports: exportsState,
      verified: passed ? due : [],
      ok: passed,
    };
  } finally {
    research.close();
    if (sessions) sessions.close();
  }
}

function main(argv) {
  const args = argv.slice(2);
  if (args.some((a) => a !== '--write')) {
    console.error(USAGE);
    return 2;
  }
  const { researchPath, editorialPath } = resolveResearchDbPath();
  let report;
  try {
    report = runWithdrawal({ researchPath, sessionsPath: editorialPath, write: args.includes('--write') });
  } catch (err) {
    console.error(`${SCRIPT}: ${err.code || err.name}: ${err.message}`);
    return 1;
  }
  process.stdout.write(`${JSON.stringify(report, null, 1)}\n`);
  return report.ok ? 0 : 1;
}

if (require.main === module) {
  process.exitCode = 1; // a run that dies before a verdict is never 0
  process.exitCode = main(process.argv);
}

module.exports = { dueIntervals, runWithdrawal, main };
```

Then the two test-file edits above (`DELETE_ALLOWED`; `forbiddenTableUses` reading `scripts/lib/research*.js`).

- [ ] **Step 4: Run them**

Run: `npx vitest run server/__tests__/researchWithdrawal.test.js server/__tests__/researchAppendOnly.test.js server/__tests__/researchBoundary.test.js server/__tests__/researchLog.test.js`
Expected: PASS. `git status --porcelain`: only this task's files.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/research-withdrawal.js server/__tests__/researchWithdrawal.test.js \
  server/__tests__/researchAppendOnly.test.js server/__tests__/researchBoundary.test.js
git commit -m "feat(server): research-withdrawal.js — delete, compact, verify and record a withdrawn interval (spec §5.15; T9)"
```

---

### Task 7: `research-retention.js` — nothing by date until SD6; never without a derived dataset

Spec §5.15 (the retention row; the date; the derived dataset guard; `--no-derived-dataset`), A3 (loss notes outlive
the retention date); T9's shape for retention; decisions 9, 11, 12, 13, 15; Review Focus 6, 7.

**Files:**
- Create: `server/scripts/research-retention.js` — `USAGE`, `isDue(opts)`, `runRetention(opts)`, `main(argv)`
- Modify: `server/__tests__/researchAppendOnly.test.js` — `DELETE_ALLOWED` gains `scripts/research-retention.js`
- Test: `server/__tests__/researchRetentionScript.test.js` (new)

**Interfaces:**
- Consumes: `RETENTION_DATE`, `retentionDateMs` (Task 3), `openResearch`, `allKeys`, `anyResearchRow` (Task 4),
  `researchPurge` (Task 5), `researchFilesFor` (Task 2).
- Produces:
  - `isDue({ research, sessions, retentionDate, nowMs }) → boolean` (decisions 4, 11)
  - `runRetention({ researchPath, sessionsPath, write, retentionDate, noDerivedDataset = false, nowMs?, busyTimeoutMs?,
    steps? }) → { script: 'research-retention', write, due: boolean, ok }` plus `derivedDataset` (a dry run),
    `refused: 'no-derived-dataset'`, `failed: 'checkpoint-preflight'`, or `compact`, `scan`, `exports`, `verified:
    boolean` after a delete
  - `main(argv) → 0 | 1 | 2`; accepts only `--write` and `--no-derived-dataset`; reads `RETENTION_DATE`

- [ ] **Step 1: Write the failing test** (the fixture of Task 6's test: two consenting editors' events and items, a loss
  row, export files; `run(over)` = `runRetention({ researchPath, sessionsPath: editorialPath, busyTimeoutMs: 100,
  ...over })`; `PAST = '2026-01-01'`, `NOW = Date.UTC(2026, 10, 3)`)

- `it('the real date is empty, so nothing is ever due, even with rows (spec §5.15)')` — `run({ write: true,
  retentionDate: RETENTION_DATE, nowMs: NOW })` equals `{ script: 'research-retention', write: true, due: false, ok:
  true }`; every research row unchanged by value; the CLI (`['--write']`, env as Task 6) exits 0 with
  `JSON.parse(stdout).due === false`. Control: `isDue({ …, retentionDate: PAST, nowMs: NOW })` is `true`.
- `it('a date that has not passed is not due')` — `retentionDate: '2099-01-01'` → `due: false`.
- `it('--write refuses while no derived dataset is recorded, and only when something is due (decision 12)')` — date
  passed, no `research_derived_datasets` row: `run({ write: true, retentionDate: PAST, nowMs: NOW })` equals `{ script:
  'research-retention', write: true, due: true, ok: false, refused: 'no-derived-dataset' }` and every research row is
  unchanged; a dry run equals `{ …, write: false, due: true, ok: true, derivedDataset: false }`; with `noDerivedDataset:
  true` the write run is `ok`. Separately, with a dataset row inserted (`('/x/derived.parquet', 'a'.repeat(64),
  '2026-11-01')`), the write run is `ok` without the flag. Control: with the empty date and no dataset row, the write run
  is `{ …, due: false, ok: true }` (the backup job's every-cycle call).
- `it('a dataset row naming what this run deletes, or a relative path, does not count (decision 12)')` — date passed;
  for each of `path.join(files.exportsDir, 'derived.parquet')`, `path.join(files.backupsDir, 'd.parquet')`,
  `files.researchPath` and `'derived.parquet'` as the only dataset row: the write run equals `{ …, due: true, ok:
  false, refused: 'no-derived-dataset' }`, every research row is unchanged by value, and the dry run reports
  `derivedDataset: false`. Control in the same fixture: with `/x/derived.parquet` added beside it, the dry run reports
  `derivedDataset: true` and the write run is `ok`.
- `it('a write run deletes every research row, the key map included, compacts, verifies and records — and touches no
  consent row and no loss row')` — `report` has `due: true, compact: 'ok', scan: 'clean', exports: 'emptied', verified:
  true, ok: true`; `anyResearchRow` is `false`; `bytes()` holds no event sentinel and no key; `research_deletions` equals
  `[{ kind: 'retention', interval_id: null, done_at_ms: NOW, verified: 1 }]`; `SELECT * FROM research_consent ORDER BY
  id` and `losses()` are equal by value before and after (decision 9; A3); `served-version-exports/` unchanged.
- `it('a run that deleted but could not compact stays due by its missing record (decision 11)')` —
  `run({ write: true, retentionDate: PAST, noDerivedDataset: true, nowMs: NOW, steps: { ...researchPurge, compact: () =>
  ({ ok: false, step: 'vacuum' }) } })` → `ok: false`, no row left, no `research_deletions` row; `isDue(…)` is still
  `true`; the next real run is `ok` with `verified: false` and writes one `retention` row; then `isDue(…)` is `false`
  (control).
- `it('the command line takes no date and refuses unknown arguments')` — `['--retention-date', '2020-01-01']` → exit 2,
  stdout `''`; `['--write', '--no-derived-dataset']` → exit 0 with the real (empty) date and `due: false`.

Append to `DELETE_ALLOWED`: `'scripts/research-retention.js': { tables: ['research_event_items', 'research_events',
'editor_keys'], reason: 'every research row, the key map included, once the retention date has passed (spec §5.15)' }`.

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/researchRetentionScript.test.js server/__tests__/researchAppendOnly.test.js`
Expected: FAIL — `Cannot find module '../scripts/research-retention'`.

- [ ] **Step 3: Implement** `server/scripts/research-retention.js` (header: spec §5.15; the date is SD6's, held in
  `server/lib/researchRetention.js`, and while empty nothing is ever due; decision 11's rule and decision 12's refusal
  (why it waits for something to be due, and which dataset rows count), each citing the spec's `✏️ AMENDED 2026-11-04`
  block; that loss rows and consent rows are not research rows here (A3; §5.14: kept a stated period longer);
  **that it names no consent table** (§5.22; decision 9, also in that block); no key and no count printed). The
  shape of Task 6's, with:

```js
function isDue({ research, sessions, retentionDate, nowMs }) {
  const at = retentionDateMs(retentionDate);
  if (at === null || nowMs < at) return false;
  if (anyResearchRow(research)) return true;
  // Decision 11: deleted but not yet compacted and recorded — the bytes may still be in free pages and the WAL.
  return !sessions
    .prepare("SELECT 1 FROM research_deletions WHERE kind = 'retention' AND done_at_ms >= ? LIMIT 1")
    .get(at);
}
```

and, for decision 12's guard:

```js
// Decision 12: a dataset row counts only when it names an absolute path outside everything this run deletes
// (spec §5.15: the dataset "never lives in research.db or research-exports/").
function hasDerivedDatasetOutside(sessions, files) {
  const within = (p, dir) => p === dir || p.startsWith(`${dir}${path.sep}`);
  const deleted = [files.researchPath, files.walPath, files.shmPath, files.stagingPath];
  return sessions
    .prepare('SELECT path FROM research_derived_datasets')
    .all()
    .some(({ path: raw }) => {
      if (!path.isAbsolute(raw)) return false; // resolving it would need a working directory
      const p = path.normalize(raw);
      return !within(p, files.exportsDir) && !within(p, files.backupsDir) && !deleted.includes(p);
    });
}
```

`runRetention` opens both files as Task 6 does; returns `{ …, due: false, ok: true }` when not due; a dry run reports
`derivedDataset: hasDerivedDatasetOutside(sessions, files)`; a write run refuses as decision 12 says;
then the pre-flight checkpoint, `keys = allKeys(research).map((k) => k.editorKey)`, one `.immediate()` transaction
running `DELETE FROM research_event_items`, `DELETE FROM research_events`, `DELETE FROM editor_keys` (in that order),
`steps.compact`, `steps.scanForKeys([files.researchPath, files.walPath], keys)`, `steps.emptyExports`, and, only if all
passed, `INSERT INTO research_deletions (kind, interval_id, done_at_ms, verified) VALUES ('retention', NULL, ?, ?)` with
`verified = keys.length > 0 ? 1 : 0`. `main` accepts only `--write` and `--no-derived-dataset` (anything else exit 2)
and passes `retentionDate: RETENTION_DATE`.

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/researchRetentionScript.test.js server/__tests__/researchAppendOnly.test.js server/__tests__/researchBoundary.test.js`
Expected: PASS (the boundary scan visits `research-retention.js` and finds no forbidden table in it).

- [ ] **Step 5: Commit**

```bash
git add server/scripts/research-retention.js server/__tests__/researchRetentionScript.test.js \
  server/__tests__/researchAppendOnly.test.js
git commit -m "feat(server): research-retention.js — nothing by date until SD6, never without a derived dataset (spec §5.15)"
```

---

### Task 8: a withdrawal deletes at once — the withdraw route, a declined consent, and the service they share

Spec §5.15 ("When they run": the route deletes events, items and loss rows after its own commit; the key row stays),
§5.14 (declining while consented is a withdrawal; the routes), §5.16 (research services expose only write functions to
routes), §11 (no read route); T9 (the route's parts), T17 (the service's write-only surface); index decision 5; PR3's
Handoff to PR4; decisions 14, 15, 40; Review Focus 16, 17.

**Files:**
- Create: `server/services/researchDeletion.js` — `deleteIntervalRowsNow(intervalId)`
- Modify: `server/routes/research.js` (as PR3 Task 7 leaves it) — `POST /consent` (on `withdrew`) and `POST
  /consent/withdraw` (on `withdrawn`)
- Modify: `server/__tests__/researchAppendOnly.test.js` — `DELETE_ALLOWED` gains `services/researchDeletion.js`
- Modify: `server/__tests__/activityLogCallsiteGuard.test.js` — `TRY_WRAPPED_DELETION` and its control
- Modify: `server/lib/featureFlags.js` — `ENV_SCAN_FILES` gains `services/researchDeletion.js`
- Modify: `server/__tests__/researchBoundary.test.js` — the service's surface
- Test: `server/__tests__/researchDeletion.test.js` (new); `server/__tests__/researchConsentRoutes.test.js` (PR3 Task
  7's; T9 cases); `server/__tests__/researchConsent.test.js` (PR3 Task 5's; one case)

**Interfaces:**
- Consumes: `researchDb.getHandle`, `researchDb.noteFailure` (PR3 Task 6), `researchConsent.getSessionsDb` (PR3 Task 5).
- Produces: `deleteIntervalRowsNow(intervalId: number) → { research: 'deleted' | 'no-key' | 'failed', losses: 'deleted'
  | 'failed' }`; never throws; `Object.keys(module)` is exactly `['deleteIntervalRowsNow']`. The routes' responses are
  PR3's, key for key.

- [ ] **Step 1: Write the failing tests**

`server/__tests__/researchDeletion.test.js` — env before requires; `runAllMigrations()`; `researchDb.openAtBoot()`;
approved texts and server commit as Task 6; `p-a` consents (interval `A`) and records two events with items and one loss
row; `p-b` consents (interval `B`) and records one event and one loss row.
- `it('deletes the interval\'s events, items and loss rows, and leaves its key for the script (spec §5.15)')` —
  `deleteIntervalRowsNow(A)` equals `{ research: 'deleted', losses: 'deleted' }`; `A`'s events and their items are
  gone; `losses()` holds no row for `A`; `A`'s `editor_keys` row is still there; `B`'s events, items and loss row are
  equal by value before and after (control).
- `it('an interval with no key still loses its loss rows')` — an interval id with no key row and one loss row →
  `{ research: 'no-key', losses: 'deleted' }`.
- `it('never throws: the research file missing, locked, or a bad id')` — `researchDb._setTestPaths({ researchPath:
  '/nonexistent/dir/r.db', editorialPath })` → `{ research: 'failed', losses: 'deleted' }` with no throw (then
  `_setTestPaths(null)` in `finally`); a second connection holding `BEGIN EXCLUSIVE` on the research file → `research:
  'failed'` returned within `researchDb.BUSY_TIMEOUT_MS + 900` ms and `A`'s events still present; `deleteIntervalRowsNow('x')`
  and `(-1)` → `{ research: 'failed', losses: 'failed' }`.
- `it('logs an error code and nothing else')` — `vi.spyOn(logger, 'error')` around the missing-file case: every call's
  first argument has keys exactly `['errorCode']`.
- `it('is write-only to routes (spec §5.16)')` — `Object.keys(require('../services/researchDeletion'))` equals
  `['deleteIntervalRowsNow']`.

`server/__tests__/researchConsentRoutes.test.js` (PR3 Task 7's harness; `record` through `researchFixture.cjs`):
- `it('T9: withdrawing deletes the interval\'s research rows at once; the response is PR3\'s')` — `p-w1` consents
  through `POST /consent`, records two events and a loss row; `POST /consent/withdraw` → 200 with
  `Object.keys(body).sort()` equal `['currentTextVersion', 'decidedTextVersion', 'state']` and `body.state ===
  'withdrawn'`; the interval's events, items and loss row are gone; its key row is present.
- `it('T9: posting declined while consented withdraws, and deletes at once')` — `p-w2` consents and records an event;
  `POST /consent { decision: 'declined', textVersion: 'prufa-1' }` → 200 `state 'declined'`; the starting row's
  `withdrawn_at_ms` is a number; the event is gone; the key row is present.
- `it('T9: after a renewal, the withdrawal marks the starting row and deletes both texts\' events by the one key')` —
  `_setTestApprovedTexts([V1])`; `p-w3` consents and records an event; `_setTestApprovedTexts([V1, V2])`; consents on
  `prufa-2` (renewed) and records an event; `POST /consent/withdraw` → the rows' `withdrawn_at_ms` by id read `[<number>,
  null]`; both events are gone (one interval, one key).
- `it('the deletion never changes the response')` — `p-w4` withdraws with the research file up, `p-w5` (same state)
  with `researchDb._setTestPaths({ researchPath: '/nonexistent/dir/r.db', editorialPath })`: the two response bodies are
  deep-equal, both status 200.
- `it('T9: a later act writes no research row and no loss row')` — after `p-w1`'s withdrawal, `record(saveEvent({
  actorProviderId: 'p-w1', clientActionId: 'after-1' }))` equals `{ status: 'skipped', reason: 'not-consenting' }`; the
  `research_events` id set and `losses()` are equal before and after.
- `it('a decline with nothing live, and a withdraw with nothing live, delete nothing')` —
  `vi.spyOn(researchDeletion, 'deleteIntervalRowsNow')`; an undecided `p-w6` declines (outcome `declined`) and withdraws
  (nothing live): the spy was not called. Control: in the T9 decline case above it was called once with that interval.

`server/__tests__/researchConsent.test.js`, one case:
- `it('declining during a live interval returns the withdrawn interval\'s id')` — consent (`intervalId: I`), then
  `recordDecision({ …, decision: 'declined', … })` equals `{ outcome: 'withdrew', intervalId: I }`.

`server/__tests__/activityLogCallsiteGuard.test.js`: `const TRY_WRAPPED_DELETION =
/try\s*\{\s*researchDeletion\.deleteIntervalRowsNow\(/;`, a per-file case beside `TRY_WRAPPED_RECORD`'s, and a control:
`expect('try {\n  researchDeletion.deleteIntervalRowsNow(7);\n} finally {\n  x();\n}').toMatch(TRY_WRAPPED_DELETION)`
and `expect('researchDeletion.deleteIntervalRowsNow(7);').not.toMatch(TRY_WRAPPED_DELETION)`.

`server/__tests__/researchAppendOnly.test.js`: `'services/researchDeletion.js': { tables: ['research_event_items',
'research_events'], reason: "the withdraw route's immediate deletion; the key row stays for research-withdrawal.js
(spec §5.15)" }`, and the control from Task 6 gains `services/researchDeletion.js` holding `DELETE FROM editor_keys` →
a finding.

`server/__tests__/researchBoundary.test.js`: `it('T17 (PR4): the deletion service is write-only, and no route names the
research handle')` — `Object.keys(require('../services/researchDeletion'))` equals `['deleteIntervalRowsNow']`, and PR3's
`filesNaming(<routes>, ROUTE_FORBIDDEN)` still equals `[]` with `routes/research.js` now requiring the service.

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/researchDeletion.test.js server/__tests__/researchConsentRoutes.test.js server/__tests__/researchConsent.test.js server/__tests__/activityLogCallsiteGuard.test.js server/__tests__/researchAppendOnly.test.js server/__tests__/researchBoundary.test.js`
Expected: FAIL — `Cannot find module '../services/researchDeletion'`; the T9 route cases find the events still present;
the `researchConsent` case passes already (PR3 Task 5 returns and pins the same id; this case is Task 8's own pin of the
value its deletion reads).

- [ ] **Step 3: Implement**

`server/services/researchDeletion.js` (header: spec §5.15 "When they run"; write-only to routes (§5.16) — it reads the
key only to delete by it, and returns statuses, never a key or a count; why the key row stays (the script completes the
deletion: compaction, byte scan, key row); never throws, logs only an error code; "call it bare: a test bans a
try-wrapped call"; that routes reach research data only through this and `researchLog`):

```js
const log = require('../lib/logger');
const researchDb = require('./researchDb');
const researchConsent = require('./researchConsent');

function deleteIntervalRowsNow(intervalId) {
  const result = { research: 'failed', losses: 'failed' };
  if (!Number.isSafeInteger(intervalId) || intervalId < 1) return result;
  try {
    const db = researchDb.getHandle();
    result.research = db
      .transaction(() => {
        const row = db.prepare('SELECT editor_key FROM editor_keys WHERE interval_id = ?').get(intervalId);
        if (!row) return 'no-key';
        db.prepare(
          'DELETE FROM research_event_items WHERE event_id IN (SELECT id FROM research_events WHERE editor_key = ?)'
        ).run(row.editor_key);
        db.prepare('DELETE FROM research_events WHERE editor_key = ?').run(row.editor_key);
        return 'deleted';
      })
      .immediate();
  } catch (err) {
    // research-withdrawal.js completes the deletion; the interval stays due until it does (spec §5.15).
    log.error({ errorCode: err.code || err.name }, 'research rows not deleted at withdrawal (spec §5.15)');
    researchDb.noteFailure(err);
  }
  try {
    researchConsent.getSessionsDb().prepare('DELETE FROM research_capture_losses WHERE interval_id = ?').run(intervalId);
    result.losses = 'deleted';
  } catch (err) {
    log.error({ errorCode: err.code || err.name }, 'loss rows not deleted at withdrawal (spec §5.15)');
  }
  return result;
}

module.exports = { deleteIntervalRowsNow };
```

`server/routes/research.js` — `const researchDeletion = require('../services/researchDeletion');` and, in `POST
/consent` after the `started` → `ensureKey` line:

```js
// Declining during a live interval is a withdrawal (spec §5.14), so it deletes at once, as the withdraw route does
// (spec §5.15). It never throws, and nothing it returns reaches the response.
if (result.outcome === 'withdrew') researchDeletion.deleteIntervalRowsNow(result.intervalId);
```

and in `POST /consent/withdraw`:

```js
const withdrawal = researchConsent.withdraw({ userId: user.id, nowMs: Date.now() });
if (withdrawal.withdrawn) researchDeletion.deleteIntervalRowsNow(withdrawal.intervalId); // after the commit (spec §5.15)
```

(The route header gains one line naming the deletion service; it still spells neither the research handle module's name
nor the key table's.) Then the test-file edits above, and
`ENV_SCAN_FILES` gains `services/researchDeletion.js`. Run `npm run docs:generate`: `docs/_generated/routes.md` is
unchanged (no route line was added).

- [ ] **Step 4: Run them**

Run: the Step 2 command plus `server/__tests__/featureFlags.test.js`, then `npm run docs:check`, then
`grep -acE '\bresearchDb\b|\beditor_keys\b' server/routes/research.js`
Expected: PASS; `docs:check` clean; the grep prints `0`.

- [ ] **Step 5: Commit**

```bash
git add server/services/researchDeletion.js server/routes/research.js server/lib/featureFlags.js \
  server/__tests__/researchDeletion.test.js server/__tests__/researchConsentRoutes.test.js \
  server/__tests__/researchConsent.test.js server/__tests__/activityLogCallsiteGuard.test.js \
  server/__tests__/researchAppendOnly.test.js server/__tests__/researchBoundary.test.js
git commit -m "feat(server): a withdrawal or a decline during a live interval deletes its research rows at once (spec §5.15; T9)"
```

---

### Task 9: `research-paper-consent.js` — a decision or a withdrawal made on paper

Spec §5.14 ("An admin script records a decision or a withdrawal made on paper, dry-run by default"; "A paper decision
must name an approved version too"; declining while consented is a withdrawal), §5.22 (decision 18), §5.1 (decision
21), §6 item 18; T17 (the paper script names no forbidden table); index decision 6; decisions 18–21; Review Focus 18, 19.

**Files:**
- Create: `server/scripts/research-paper-consent.js` — `USAGE`, `parseArgs(argv)`, `recordPaperDecision(opts)`,
  `main(argv)`
- Modify: `server/__tests__/researchBoundary.test.js` — the paper script names no forbidden table; one exception only
- Test: `server/__tests__/researchPaperConsent.test.js` (new)

**Interfaces:**
- Consumes: `userService.findById` (`server/services/userService.js:133`), `currentConsentText` (PR3 Task 4),
  `researchConsent.decisionStateFor`, `recordDecision`, `withdraw` (PR3 Task 5), `researchLog.ensureKey` (PR3 Task 7),
  `researchDeletion.deleteIntervalRowsNow` (Task 8), `resolveResearchDbPath` (PR3 Task 1).
- Produces:
  - `parseArgs(argv) → { userId, decision?, withdraw?, textVersion?, write } | { error }` — exactly one of `--decision
    consented|declined` (with `--text-version`) or `--withdraw` (without it); anything else is an error
  - `recordPaperDecision({ userId, decision?, withdraw?, textVersion?, write, nowMs?, researchPath }) → { ok: false,
    refused: 'NO_USER' | 'RESEARCH_FILE_MISSING' | 'NO_APPROVED_TEXT' | 'TEXT_VERSION_NOT_CURRENT' } | { ok, user: { id,
    displayName }, state, action, textVersion, write, researchFile?: 'missing', outcome?, key?, deletion? }` — `ok` is
    `false` whenever the research file is absent (decision 21); `RESEARCH_FILE_MISSING` refuses only a consent; a
    withdrawal or a decline is recorded with `deletion: 'research-file-missing'`
  - `main(argv) → 0 | 1 | 2`

- [ ] **Step 1: Write the failing tests** (env before requires; migrations; `researchDb.openAtBoot()`; server commit;
  `researchPath` from `resolveResearchDbPath()`; `p-pc` a member; `NOW = Date.UTC(2026, 10, 3, 10)`)

- `it('refuses while no text is approved, and a version that is not the current one')` — the real (empty) list:
  `recordPaperDecision({ userId, decision: 'consented', textVersion: 'prufa-1', write: true, researchPath })` equals `{
  ok: false, refused: 'NO_APPROVED_TEXT' }`; with `[V1, V2]` listed and `textVersion: 'prufa-1'` → `{ ok: false,
  refused: 'TEXT_VERSION_NOT_CURRENT' }`; `research_consent` has no row for the user either way.
- `it('refuses a user with no users row')` — `userId: 999999` → `refused: 'NO_USER'`.
- `it('refuses a consent while the research file is absent, and does not create it (decision 21)')` — `decision:
  'consented'`, `researchPath: path.join(<tmp>, 'absent.research.db')` → `{ ok: false, refused: 'RESEARCH_FILE_MISSING'
  }`, the path still does not exist, and `research_consent` has no row for the user. Control: the real path → `ok: true`.
- `it('a withdrawal or a decline while the file is absent is still recorded, capture stops, and the deletion is left
  due (decision 21; §6 item 18)')` — `p-pc3` and `p-pc5` each consent on the real path and record one event and one
  loss row; `spy = vi.spyOn(researchDeletion, 'deleteIntervalRowsNow')`. `recordPaperDecision({ userId: <p-pc3>,
  withdraw: true, write: true, nowMs: NOW + 1, researchPath: <absent> })` equals `{ ok: false, user: { … }, state:
  'consented', action: 'withdraw', textVersion: null, write: true, researchFile: 'missing', outcome: 'withdrew',
  deletion: 'research-file-missing' }`; its starting row's `withdrawn_at_ms === NOW + 1` and `deletion_done_at_ms` is
  `null` (still due); `captureStateFor(<p-pc3>)` is `{ capturing: false }`; `p-pc5` declining on paper with the same
  absent path gives `outcome: 'withdrew'`, `deletion: 'research-file-missing'`, `ok: false`; `spy` was not called; the
  absent path still does not exist. Controls in the same fixture: both users' events and loss rows are still present
  (nothing was deleted), and `p-pc6` withdrawing on the real path calls `spy` once with its interval.
- `it('a dry run reports and writes nothing')` — `write: false` → `{ ok: true, user: { id, displayName: <its
  display_name> }, state: 'undecided', action: 'consented', textVersion: 'prufa-1', write: false }`; `research_consent`
  and `editor_keys` unchanged.
- `it('a consent on paper starts an interval, mints its key, at the time it is recorded (decision 20)')` — `write: true,
  nowMs: NOW` → `outcome: 'started'`, `key: 'minted'`; the starting row's `given_at_ms === NOW`; `editor_keys` has one
  row for the interval; `activity_log` is equal by value before and after.
- `it('declining on paper during a live interval is a withdrawal, and deletes at once')` — after the consent above and
  one recorded event, `decision: 'declined'` → `outcome: 'withdrew'`, `deletion: { research: 'deleted', losses:
  'deleted' }`; the starting row's `withdrawn_at_ms` is set; the event is gone; the key row is present.
- `it('--withdraw on paper does what the route does')` — a consented, live `p-pc2` with one event and one loss row:
  `withdraw: true` → `outcome: 'withdrew'`, the starting row marked, the event and the loss row gone, the key present; a
  second `withdraw: true` → `outcome: 'nothing-live'`, `deletion: null`.
- `describe('the command line')` — `parseArgs` errors for `[]`, `['--user', '7']`, `['--user', '7', '--decision',
  'maybe', '--text-version', 'v']`, `['--user', '7', '--withdraw', '--decision', 'declined']`, `['--user', '7',
  '--withdraw', '--force']`; spawned: a usage error exits 2 with nothing on stdout; a dry run exits 0; a refusal under
  `--write` exits 1; with `SESSIONS_DB_PATH` a migrated database beside no research file and a live interval for the
  user (inserted by SQL), `--withdraw --write` exits 1, prints a report with `outcome: 'withdrew'`, and the starting
  row's `withdrawn_at_ms` is set.

`server/__tests__/researchBoundary.test.js`: `it('T17 (PR4): the paper-consent script names no forbidden table, and is
not an exception (decision 18)')` — the scanned list contains `'scripts/research-paper-consent.js'`,
`forbiddenTableUses(SERVER_ROOT)` is `[]`, and `Object.keys(RESEARCH_SCRIPT_EXCEPTIONS)` equals
`['research-withdrawal.js']`; PR3's comment in `RESEARCH_SCRIPT_EXCEPTIONS` about the paper script is replaced by one
line: "The paper-consent script records through researchConsent's functions and names no forbidden table (PR4
decision 18)."

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/researchPaperConsent.test.js server/__tests__/researchBoundary.test.js`
Expected: FAIL — `Cannot find module '../scripts/research-paper-consent'`; the boundary scan list lacks the file.

- [ ] **Step 3: Implement** `server/scripts/research-paper-consent.js` (header: spec §5.14; dry run unless `--write`;
  the current approved text only (decision 19); the recording time (decision 20, citing the spec's `✏️ AMENDED
  2026-11-04` block); while the file is absent a consent is refused and a withdrawal or a decline is recorded with its
  deletion left due, exit 1 (decision 21); a withdrawal or a decline during a live interval deletes at once
  (decision 14); no activity row and no log line carries the decision; it prints the user's id and display name for the
  administrator's confirmation; **it names no forbidden table — it records through the consent service** (decision 18);
  usage, exit codes 0 / 1 refused or the research file absent / 2 usage):

```js
function recordPaperDecision({ userId, decision, withdraw, textVersion, write, nowMs = Date.now(), researchPath }) {
  const user = userService.findById(userId);
  if (!user) return { ok: false, refused: 'NO_USER' };
  // Decision 21: a consent's key could not be minted, so refuse it; a withdrawal lives in sessions.db and is recorded.
  const missing = !fs.existsSync(researchPath);
  if (missing && !withdraw && decision === 'consented') return { ok: false, refused: 'RESEARCH_FILE_MISSING' };
  let text = null;
  if (!withdraw) {
    text = currentConsentText();
    if (!text) return { ok: false, refused: 'NO_APPROVED_TEXT' };
    if (text.version !== textVersion) return { ok: false, refused: 'TEXT_VERSION_NOT_CURRENT' };
  }
  const report = {
    ok: !missing, user: { id: user.id, displayName: user.display_name },
    state: researchConsent.decisionStateFor(user.id).state,
    action: withdraw ? 'withdraw' : decision, textVersion: text ? text.version : null, write,
    ...(missing ? { researchFile: 'missing' } : {}),
  };
  if (!write) return report;
  // While the file is absent the interval stays due and research-withdrawal.js deletes it once a file is back.
  const deleteNow = (withdrew, intervalId) =>
    !withdrew ? null : missing ? 'research-file-missing' : researchDeletion.deleteIntervalRowsNow(intervalId);
  if (withdraw) {
    const w = researchConsent.withdraw({ userId: user.id, nowMs });
    const deletion = deleteNow(w.withdrawn, w.intervalId);
    return { ...report, outcome: w.withdrawn ? 'withdrew' : 'nothing-live', deletion };
  }
  const r = researchConsent.recordDecision({ userId: user.id, decision, text, nowMs });
  const key = r.outcome === 'started' ? researchLog.ensureKey(r.intervalId).status : null;
  return { ...report, outcome: r.outcome, key, deletion: deleteNow(r.outcome === 'withdrew', r.intervalId) };
}
```

`main` parses strictly, passes `researchPath: resolveResearchDbPath().researchPath`, prints the report as JSON and
returns `report.ok ? 0 : 1`; `process.exitCode = 1` on entry under `require.main === module`.

- [ ] **Step 4: Run them**

Run: `npx vitest run server/__tests__/researchPaperConsent.test.js server/__tests__/researchBoundary.test.js server/__tests__/researchConsentRoutes.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/research-paper-consent.js server/__tests__/researchPaperConsent.test.js \
  server/__tests__/researchBoundary.test.js
git commit -m "feat(server): research-paper-consent.js — paper decisions and withdrawals, through the consent service (spec §5.14)"
```

---

### Task 10: the backup's Node part — prune, copy, heartbeat, verify

Spec §5.17 ("a `server/scripts` part that uses better-sqlite3's online backup"; local copies in their own `0700`
directory, `research.<timestamp>.db`, each `0600`; pruning by age; the heartbeat, written only on success), §5.15 ("no
backup taken after a withdrawal holds that editor's rows"); T19 (its own directory under `research.`, mode `0600`; a
copy older than the cut-off is pruned), T9 (the next backup copy lacks the sentinel); decisions 22–25, 29, 30, 42;
Review Focus 1, 2, 8, 9, 21, 24, 25, 28.

**Files:**
- Create: `server/scripts/research-backup.js` — `pruneLocal`, `takeCopy`, `writeHeartbeat`, `verifyCopy`, `main`
  (subcommands `prune-local`, `expired-names`, `copy`, `heartbeat`, `where`, `verify <file>`)
- Test: `server/__tests__/researchBackupNode.test.js` (new)

**Interfaces:**
- Consumes: `researchFilesFor` (Task 2), the policy (Task 2), `openResearch` (Task 4), `compact` (Task 5),
  `dueIntervals` (Task 6), `isDue` (Task 7), `RETENTION_DATE` (Task 3), `RESEARCH_SCHEMA_VERSION` (PR3 Task 2),
  `resolveResearchDbPath` (PR3 Task 1).
- Produces:
  - `pruneLocal({ files, nowMs }) → { ok, removed: string[], unknown: string[] }` — re-asserts the directory's `0700`;
    `unknown` also names a restore's staging file (`files.stagingPath` and its side files, by base name) when one
    exists beside the research file (decision 23), which is never removed here
  - `takeCopy({ files, sessionsPath, nowMs, retentionDate?, busyTimeoutMs? }) → Promise<{ ok: true, path } | { ok:
    false, reason: 'name-taken' | 'compact-busy' | 'integrity' | 'free-pages' | 'withdrawal-due' | 'retention-due' |
    <error code> }>` — leaves no partial behind on any failure
  - `writeHeartbeat(files)`; `verifyCopy(file) → { ok: true } | { ok: false, reason }` (read-only)
  - CLI: `prune-local` (prints its result; exit 1 on an unknown name), `expired-names` (names on stdin; prints the
    expired ones, one per line; exit 1 and the unknown ones on stderr when any), `copy` (prints exactly the copy's
    absolute path; exit 1 otherwise), `heartbeat`, `where` (prints the copies directory), `verify <file>` (prints
    `RESEARCH RESTORE VERIFY: PASS` or `FAIL (<reason>)`); anything else exit 2. No `--write` and no JSON report
    (decision 42)

- [ ] **Step 1: Write the failing tests** (the `p-wd` and `p-keep` parts of Task 6's fixture, with nobody withdrawn and
  no `p-re`, so nothing is due until a case withdraws; `files`; `H = 3_600_000`; `mode(p) = fs.statSync(p).mode &
  0o777`; `run(cmd, input)` spawns the CLI with `SESSIONS_DB_PATH`)

`describe('prune-local (T19: a copy older than the cut-off is pruned)')`:
- `it('removes what has reached the cut-off on its stamp, keeps the rest, and re-asserts the directory mode')` — in
  `files.backupsDir` (made `0755` on purpose), with `now = Date.now()`: `copyName(now - 170 * H)` and its `-wal`,
  `${copyName(now - 200 * H)}.partial`, `${copyName(now - 180 * H)}.verify`, `copyName(now - 100 * H)`,
  `${copyName(now - 10 * H)}.verify` → `pruneLocal({ files, nowMs: now })` equals `{ ok: true, removed: [the four expired
  names].sort(), unknown: [] }`; the directory holds exactly the two kept names; `mode(files.backupsDir) === 0o700`.
- `it('a name it did not make fails the prune and is left in place')` — plus `notes.txt` and `${copyName(now - 200 *
  H)}.replaced` (a suffix no code makes) → `ok: false`, `unknown` equal to both, sorted; the expired names still removed;
  both still there.
- `it('a staging file a killed restore left beside the research file fails the prune and is left in place (decision
  23)')` — write `files.stagingPath` and `${files.stagingPath}-wal` → `ok: false`, `unknown` equals
  `[path.basename(files.stagingPath), `${path.basename(files.stagingPath)}-wal`]`, both files still there, and the
  expired copies in `files.backupsDir` still removed. Control: with the two files removed, the same prune is `ok: true`.
- `it('no directory yet is a clean prune')` — `{ ok: true, removed: [], unknown: [] }`, and the directory is not created.
- `it('expired-names on the command line')` — `run(['expired-names'], [copyName(now - 170 * H), copyName(now - H),
  ''].join('\n'))` → `status 0`, `stdout === `${copyName(now - 170 * H)}\n``; with `notes.txt` added → `status 1`, the
  same stdout, stderr names `notes.txt`.

`describe('copy')`:
- `it('T19: a 0600 copy in a 0700 directory, named research.<stamp>.db, one self-contained file')` — `r = await
  takeCopy({ files, sessionsPath: editorialPath, nowMs: Date.now() })`: `r.ok`; `path.dirname(r.path) ===
  files.backupsDir`; `COPY_NAME.test(path.basename(r.path))`; `mode(r.path) === 0o600`; `mode(files.backupsDir) ===
  0o700`; `[...fs.readFileSync(r.path).subarray(18, 20)]` equals `[1, 1]` (rollback journal); `fs.readdirSync(
  files.backupsDir)` equals `[path.basename(r.path)]` (no `.partial`, `-wal`, `-shm`, `-journal`); a read-only open
  creates no file beside it and reads `integrity_check` `ok`; its bytes hold `'SENTINEL-KEEP-1'` (positive control).
- `it('T9: a copy taken after the withdrawal script lacks the withdrawn editor\'s text and key')` — `p-wd` withdraws;
  `runWithdrawal({ … write: true })` is `ok`; `takeCopy` → the copy's bytes hold neither `'SENTINEL-WD'` nor `p-wd`'s
  key (read before the run) and do hold `'SENTINEL-KEEP-1'`.
- `it('never copies deleted bytes: it compacts before every copy (decision 25)')` — delete `p-keep`'s two events
  through a write handle (bypassing the scripts; their items cascade). The premise, asserted in this fixture: a plain
  `db.backup(<scratch>)` from that state holds `'SENTINEL-KEEP-1'`. **No `freelist_count` assertion**: whether the
  deleted bytes sit in a free page or inside a page still in use depends on the rows' sizes (two small rows left it at
  `0`, measured), which is exactly why no page count gates the compaction. Then `takeCopy` → `ok`; its copy, and the
  live file with its `-wal`, hold no `'SENTINEL-KEEP-1'`; they still hold `'SENTINEL-WD-1'` (positive control).
- `it('a withdrawal due after the copy discards the copy (decision 25)')` — `p-wd` withdraws through
  `researchConsent.withdraw` and **no** script runs: `takeCopy` → `{ ok: false, reason: 'withdrawal-due' }`;
  `fs.readdirSync(files.backupsDir)` is `[]`. Control: after `runWithdrawal(write)`, `takeCopy` is `ok`.
- `it('a retention due after the copy discards it')` — `takeCopy({ …, retentionDate: '2026-01-01', nowMs:
  Date.UTC(2026, 10, 3) })` with research rows present → `{ ok: false, reason: 'retention-due' }`, nothing left.
- `it('a busy compaction takes no copy')` — a reader holding a transaction (nothing deleted: the compaction runs
  every time), `busyTimeoutMs: 100` → `{ ok: false, reason: 'compact-busy' }`, nothing left in the directory; after the
  reader commits, `takeCopy` is `ok` (control).
- `it('refuses a name already taken')` — a file at `copyName(nowMs)` → `{ ok: false, reason: 'name-taken' }`, its bytes
  unchanged.
- `it('the command line prints exactly the path, or fails with nothing written')` — `run(['copy'])` → `status 0`,
  `stdout` is one absolute path ending in `.db` plus `\n`; with the research file removed → `status 1`, `stdout ''`,
  and no file in the copies directory.

`describe('heartbeat, where, verify')`:
- `it('heartbeat writes the file, and a second call moves it')` — `writeHeartbeat(files)`; the file exists; set its
  mtime back an hour (`utimesSync`); a second call → mtime within a few seconds of now.
- `it('where prints the copies directory')` — `run(['where'])` → `stdout === `${files.backupsDir}\n``.
- `it('verify passes a copy and creates no side file, and fails a corrupt, foreign or missing one')` — on a copy from
  `takeCopy`: `verifyCopy` `{ ok: true }` and `fs.readdirSync` unchanged; on that copy with its page-type byte at the
  start of page 2 flipped (the `corruptDb` of `scripts/__tests__/backup-db.test.mjs:50-57`): `ok: false`; on an empty
  SQLite file (`user_version` 0): `{ ok: false, reason: 'schema' }`; on a missing path: `ok: false`. CLI: `['verify',
  <copy>]` → `status 0`, `stdout === 'RESEARCH RESTORE VERIFY: PASS\n'`; on the corrupt one → `status 1`, stdout matches
  `/^RESEARCH RESTORE VERIFY: FAIL \(/`.
- `it('an unknown subcommand is a usage error')` — `run(['backup'])` → `status 2`.

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/researchBackupNode.test.js`
Expected: FAIL — `Cannot find module '../scripts/research-backup'`.

- [ ] **Step 3: Implement** `server/scripts/research-backup.js` (header: spec §5.17 — the Node half of the research
  backup job; `scripts/research-backup.sh` runs it and holds the order; every file this job writes is written here,
  under paths derived from the research file's (decision 2); the measured facts behind `takeCopy` (decision 25); the
  owned names (decision 23); it prints names and paths, never research content; **no forbidden table is named here**;
  exit codes):

```js
async function takeCopy({ files, sessionsPath, nowMs, retentionDate = RETENTION_DATE, busyTimeoutMs }) {
  fs.mkdirSync(files.backupsDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(files.backupsDir, 0o700); // mkdir's mode is masked by the umask
  const final = path.join(files.backupsDir, copyName(nowMs));
  const partial = `${final}.partial`;
  if (fs.existsSync(final) || fs.existsSync(partial)) return { ok: false, reason: 'name-taken' };
  const research = openResearch({ researchPath: files.researchPath, write: true, busyTimeoutMs });
  const sessions = new Database(sessionsPath, { readonly: true, fileMustExist: true });
  const discard = () => {
    for (const p of [partial, `${partial}-wal`, `${partial}-shm`, `${partial}-journal`]) fs.rmSync(p, { force: true });
  };
  try {
    // The online backup copies deleted bytes, in free pages AND inside pages still in use, and no page count sees the
    // latter (measured): compact before EVERY copy (decision 25).
    const compacted = compact(research);
    if (!compacted.ok) return { ok: false, reason: compacted.errorCode || 'compact-busy' };
    fs.closeSync(fs.openSync(partial, 'wx', 0o600)); // a fresh backup destination would be 0644 (measured)
    await research.backup(partial);
    const copy = new Database(partial, { fileMustExist: true });
    let integrity;
    let freePages;
    try {
      copy.pragma('journal_mode = DELETE'); // one self-contained file: a read-only open then creates nothing
      integrity = copy.pragma('integrity_check', { simple: true });
      freePages = Number(copy.pragma('freelist_count', { simple: true }));
    } finally {
      copy.close();
    }
    // Re-read AFTER the copy: a withdrawal recorded after this point is after the copy (spec §5.15, decision 25).
    // freePages is a backstop, not evidence: it cannot see deleted bytes inside a page still in use. The compaction
    // above and this due re-read are what keep the copy clean.
    const reason =
      integrity !== 'ok' ? 'integrity'
      : freePages > 0 ? 'free-pages'
      : dueIntervals(sessions, research).length > 0 ? 'withdrawal-due'
      : isDue({ research, sessions, retentionDate, nowMs }) ? 'retention-due'
      : null;
    if (reason) {
      discard();
      return { ok: false, reason };
    }
    fs.chmodSync(partial, 0o600);
    fs.renameSync(partial, final);
    return { ok: true, path: final };
  } catch (err) {
    discard();
    return { ok: false, reason: err.code || err.name };
  } finally {
    research.close();
    sessions.close();
  }
}
```

`pruneLocal` lists the directory (absent → a clean result), re-asserts `0700`, runs `expiredNames`, removes each
expired name, adds to `unknown` the base name of each of `files.stagingPath` and its `-wal`, `-shm`, `-journal` that
exists (never removing one: only the next restore does, decision 23), and returns `{ ok: unknown.length === 0, removed,
unknown }`. `writeHeartbeat` writes the ISO time to
`${heartbeatPath}.tmp` and renames it over `heartbeatPath`. `verifyCopy` opens the file `{ readonly: true,
fileMustExist: true }` and requires `integrity_check === 'ok'`, `user_version === RESEARCH_SCHEMA_VERSION` and the
three research tables in `sqlite_master`; any throw is `{ ok: false, reason: err.code || err.name }`. `main` is
`async function main(argv, { stdin = process.stdin, out = process.stdout, err = process.stderr } = {})` (the defaults
are load-bearing: the entry below passes one argument, and destructuring `undefined` would reject every run), dispatches
the subcommands as **Interfaces** says, and under `require.main === module` runs:

```js
if (require.main === module) {
  process.exitCode = 1; // a run that never reaches a verdict — a promise that never settles — is never 0
  main(process.argv).then(
    (code) => {
      process.exitCode = code;
    },
    (e) => {
      console.error(`research-backup: ${e.code || e.name}: ${e.message}`);
      process.exitCode = 1;
    }
  );
}
```

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/researchBackupNode.test.js server/__tests__/researchBoundary.test.js server/__tests__/researchAppendOnly.test.js`
Expected: PASS (the boundary scan visits `research-backup.js`; the append-only scanner finds no mutation in it).

- [ ] **Step 5: Commit**

```bash
git add server/scripts/research-backup.js server/__tests__/researchBackupNode.test.js
git commit -m "feat(server): the research backup's Node part — prune by stamp, a compacted 0600 copy, heartbeat, verify (spec §5.17)"
```

---

### Task 11: the job — `scripts/research-backup.sh`, its cron line and its own remote

Spec §5.17 (its own job on its own cron line beside the editorial one; the cadence an enforceable value; the order and
fail-closed rules; the remote prune not best-effort; its own crypt remote; `install-cron.sh` only prints, so G-1h
confirms the line); T19 (its own remote, never the editorial one; a failing upload still prunes; a failing deletion step
takes no copy; a failing remote prune exits non-zero with no heartbeat; the cut-off derived from `install-cron.sh`), T9
(a held reader: no copy is taken); decisions 13, 22, 24, 26–28, 31, 37; Review Focus 7, 8, 10, 11, 23; [USER]'s
answer of 2026-11-04 on the job's log (decision 27).

**Files:**
- Create: `scripts/research-backup.sh` (executable, mode `100755` in the index)
- Create: `scripts/__tests__/helpers/fakeBins.mjs` — `makeFakeBins({ sqlite3 })`
- Modify: `scripts/install-cron.sh` — the research job's line after the monthly editorial verify (`:43`), and the
  LOGGING note (`:47-55`)
- Modify: `scripts/__tests__/shell-syntax.test.mjs` — `SCRIPTS` (`:20`, as PR3 Task 9 leaves it) gains the script; the
  executable-mode pin and its control; the text pin
- Modify: `server/__tests__/researchBackupPolicy.test.js` — the cron-period pin
- Modify: `LICENSE` — class 5 (`:194-204`) gains this script's edge and `scripts/git-backup.sh:141`'s; the search
  shapes (`:206-224`) gain a fifth (decision 31)
- Test: `scripts/__tests__/research-backup.test.mjs` (new)

**Interfaces:**
- Consumes: the Node part (Task 10), `research-withdrawal.js` (Task 6), `research-retention.js` (Task 7).
- Produces: `scripts/research-backup.sh` (environment `RESEARCH_REMOTE`; test seam `RESEARCH_NODE`; exit codes of
  decision 27; one verdict line per run on stdout, nothing else on stdout or stderr except bash's own one-line
  diagnostic on an unplanned abort, decision 27);
  `makeFakeBins({ sqlite3 = false }) → { binDir, remoteDir, env(over?), calls(): string[] }` — a fake `rclone` (`lsf`
  lists `remoteDir`; `copyto` uploads a local `/…` source into `remoteDir` or downloads a remote one; `deletefile`
  removes; `FAKE_FAIL_LSF`, `FAKE_FAIL_COPYTO`, `FAKE_FAIL_DELETE` make one fail) and optionally a fake `sqlite3`
  (prints `ok` for `integrity_check`, `0` for a count); every call is logged.

- [ ] **Step 1: Write the failing tests**

`scripts/__tests__/helpers/fakeBins.mjs` (not a test file; vitest collects only `*.test.*`):

```js
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const RCLONE = `#!/usr/bin/env bash
# A stand-in for rclone in tests: logs each call; the "remote" is the directory $FAKE_REMOTE.
echo "$*" >> "$FAKE_LOG"
case "$1" in
  lsf) [ -n "\${FAKE_FAIL_LSF:-}" ] && exit 1; ls -1 "$FAKE_REMOTE" ;;
  copyto) [ -n "\${FAKE_FAIL_COPYTO:-}" ] && exit 1
    case "$2" in /*) cp -- "$2" "$FAKE_REMOTE/\${3#*:}" ;; *) cp -- "$FAKE_REMOTE/\${2#*:}" "$3" ;; esac ;;
  deletefile) [ -n "\${FAKE_FAIL_DELETE:-}" ] && exit 1; rm -f -- "$FAKE_REMOTE/\${2#*:}" ;;
  *) exit 9 ;;
esac
`;
const SQLITE3 = `#!/usr/bin/env bash
echo "sqlite3 $*" >> "$FAKE_LOG"
case "$2" in *integrity_check*) echo ok ;; *count*) echo 0 ;; *) exit 0 ;; esac
`;

export function makeFakeBins({ sqlite3 = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'fake-bins-'));
  const binDir = path.join(root, 'bin');
  const remoteDir = path.join(root, 'remote');
  const log = path.join(root, 'calls.log');
  mkdirSync(binDir);
  mkdirSync(remoteDir);
  const put = (name, body) => {
    writeFileSync(path.join(binDir, name), body);
    chmodSync(path.join(binDir, name), 0o755);
  };
  put('rclone', RCLONE);
  if (sqlite3) put('sqlite3', SQLITE3);
  return {
    root, binDir, remoteDir,
    env: (over = {}) => ({ FAKE_LOG: log, FAKE_REMOTE: remoteDir, ...over }),
    calls: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []),
  };
}
```

`scripts/__tests__/research-backup.test.mjs` — `setup()`: a temp dir; `freshMigratedDb()` (through `createRequire`,
`server/__tests__/helpers/freshMigratedDb.js`) gives `sessionsPath` (its handle closed before any spawn, as
`readApplyExposure.test.js` does); the research file at `deriveResearchPath(sessionsPath)` built by
`ensureResearchSchema`, put in WAL mode, seeded by SQL with key `K` (interval 1) and one event whose `content_json` holds
`'SENTINEL-JOB'` (every NOT NULL column given); `fake = makeFakeBins()`; `env = { ...process.env, ...fake.env(), PATH:
`${fake.binDir}:${process.env.PATH}`, SESSIONS_DB_PATH: sessionsPath, RESEARCH_NODE: process.execPath, RESEARCH_REMOTE:
'research-secret:' }`; `run(over)` = `spawnSync('bash', [SCRIPT], { env: { ...env, ...over }, encoding: 'utf8' })`;
`files = researchFilesFor(deriveResearchPath(sessionsPath))`; `realState()` = `existsSync` and `mtimeMs` of
`<repo>/pipeline-output/.last-research-backup` and `<repo>/pipeline-output/research-backups`, captured before and
asserted equal after every case. `now = Date.now()`; planted: local `copyName(now - 170 * H)` and `copyName(now - 10 *
H)`; remote `copyName(now - 170 * H)` and `copyName(now - 10 * H)` (files in `fake.remoteDir`).

- `it('a full cycle: prunes both tiers, deletes, copies, uploads to its own remote, and writes the heartbeat')` —
  `status 0`; the expired names are gone from both tiers and the young ones kept (T19's positive control); the copies
  directory holds the young plant and exactly one new `research.<stamp>.db` (`0600`, directory `0700`), and the fake
  remote holds the same new name; `files.heartbeatPath` exists; every logged rclone call's remote argument starts with
  `research-secret:` (`fake.calls()` are `lsf research-secret: --files-only`, `deletefile research-secret:<expired>`,
  `copyto <abs path> research-secret:<new name>`, in that order); `realState()` unchanged.
- `it('T19: a remote that is not the research file\'s own is refused before any rclone call, after the local prune')` —
  `RESEARCH_REMOTE: 'secret:'` → `status 2`; `RESEARCH_REMOTE: ''` → `2`; `'research-secret'` (no separator) → `5`;
  each time (on a fresh `setup()`) `fake.calls()` is `[]`, no copy was made and no heartbeat written, **and** the
  expired local plant is gone while the young one is kept (the local prune ran first, decision 27); both remote plants
  are still in `fake.remoteDir`.
- `it('T19: a failing upload still prunes')` — `FAKE_FAIL_COPYTO: '1'` → `status 4`; the expired local and remote
  copies are gone (the prune ran first); a new local copy exists; no heartbeat.
- `it('T19: a failing deletion step takes no copy')` — the research file removed → `status 6`; no `copyto` call; no new
  local copy; no heartbeat; the expired copies are still pruned (step 1 does not depend on a copy); `stdout + stderr` is
  one line matching `/ research-backup: failed: [a-z-]+(,[a-z-]+)*\n$/` whose list contains `withdrawal` (the research
  file's absence is a stderr error in each deletion script, which the job discards).
- `it('T19: a failing remote prune exits non-zero with no heartbeat')` — `FAKE_FAIL_DELETE: '1'` → `status 7`; the
  `copyto` call happened (the copy was still uploaded); no heartbeat. `FAKE_FAIL_LSF: '1'` → `status 7`, no heartbeat.
- `it('a name in the remote the job did not make is left in place and fails the prune')` — `notes.txt` in
  `fake.remoteDir` → `status 7`; `notes.txt` still there; no `deletefile` call names it.
- `it('T9: a reader holding the research file fails the deletion step, and no copy is taken', { timeout: 30_000 })` —
  seed a withdrawn interval due for deletion (a `research_consent` starting row with `withdrawn_at_ms` set, by SQL, and
  its key row `K` present); a reader in this process runs `BEGIN` and a `SELECT` on the research file → `status 6`; no
  `copyto`; no new copy; `K` still present (decision 5). The reader commits; `run()` → `status 0`, and the new copy's
  bytes hold neither `K` nor `'SENTINEL-JOB'`.
- `it('rclone missing is exit 3, after the local prune (decision 27)')` — `PATH` set to a directory of symlinks to
  `bash`, `dirname`, `basename` and `date` only (the restricted-PATH idiom of `backup-db.test.mjs:129-145`, whose list
  holds `date` too; the verdict line's time needs it), `RESEARCH_NODE` set → `status 3`; the expired local copy is gone
  and the young one kept; both remote plants are untouched; no copy and no heartbeat exist; `stdout + stderr` is one
  line ending `research-backup: failed: rclone\n`.
- `it('the log is one verdict line per run: never an interval id or a count, and a failing step is named (decision 27)')`
  — `SENTINEL_INTERVAL = 7340021` (an id no other row of the fixture can take). Seed a withdrawn interval due for
  deletion as the T9 case does, with its `research_consent` starting row's `id` and `interval_id` both
  `SENTINEL_INTERVAL` and its `editor_keys` row for that interval. **The premise first, so the absence below is not
  manufactured:** a dry run of the withdrawal script, `spawnSync(process.execPath, [<repo>/server/scripts/
  research-withdrawal.js], { env, encoding: 'utf8' })`, prints a report whose `due` contains `SENTINEL_INTERVAL`: the
  report the job ran with its output flowing into the log before [USER]'s answer. Then `r = run()` → `status 0`, and
  `out = r.stdout + r.stderr` (the cron line sends both to the log): `out` does not contain `'7340021'` (asserted
  first, so a leak fails on the id); `out` matches `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z research-backup: ok\n$/`
  (exactly one line); and with its leading time removed (`out.replace(/^\S+ /, '')`) it holds no digit at all (no id,
  no count, no copy's stamp). Positive control that the interval was in this run: `research_deletions` now holds a
  `withdrawal` row whose `interval_id` is `SENTINEL_INTERVAL`. The failing-step control, on a fresh `setup()` (a second
  run in the same second would collide on the copy's name, decision 23): `run({ FAKE_FAIL_COPYTO: '1' })` → `status 4`,
  and its `stdout + stderr` is exactly one line matching `/^\S+Z research-backup: failed: upload\n$/`.
- `it('the template prints the research job as its own line, with its own remote (decision 26)')` — `printed =
  execFileSync('bash', [<install-cron.sh>], { env: { ...process.env, DEPLOY_PATH: '/srv/x' }, encoding: 'utf8' })`; the
  one uncommented line matching `/\/scripts\/research-backup\.sh(\s|$)/` carries `RESEARCH_REMOTE=research-secret:`; no
  uncommented line matching `/BACKUP_REMOTE=/` names a research script (so `backup-db.test.mjs`'s template regex never
  sees it); the editorial line's remote (`secret:`) differs from the research one.

`scripts/__tests__/shell-syntax.test.mjs`: `SCRIPTS` gains `'scripts/research-backup.sh'`; `statSync` joins the
`node:fs` import; and

```js
  // Cron runs these by path; every other test runs them through `bash <script>`, so only this sees a lost bit.
  const CRON_RUN = ['scripts/research-backup.sh'];
  it.each(CRON_RUN)('%s is executable', (rel) => {
    expect(statSync(path.join(REPO, rel)).mode & 0o111).not.toBe(0);
  });
  it('control: the mode check can fail', () => {
    expect(statSync(path.join(REPO, 'scripts', '__tests__', 'shell-syntax.test.mjs')).mode & 0o111).toBe(0);
  });

  it('research-backup.sh writes no file itself and never names the editorial remote (decisions 2, 26)', () => {
    const src = readFileSync(path.join(REPO, 'scripts', 'research-backup.sh'), 'utf8');
    const code = src.split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
    expect(code).not.toMatch(/pipeline-output/);
    expect(code).not.toMatch(/\bBACKUP_REMOTE\b/);
    expect(code).toMatch(/RESEARCH_REMOTE/); // control: the script is read
  });
```

`server/__tests__/researchBackupPolicy.test.js`, one case (the shape of `healthOffboxBackup.test.js:41-49`):
- `it('T19: the research cron line is every RESEARCH_BACKUP_CRON_HOURS hours, so the cut-off and the threshold are still
  right')` — `cron = readFileSync(new URL('../../scripts/install-cron.sh', import.meta.url), 'utf8')`; `line` = the
  first line not starting with `#` matching `/\/scripts\/research-backup\.sh(\s|$)/` (truthy); `line.trim().split(/\s+/)
  .slice(1, 5)` equals `[`*/${RESEARCH_BACKUP_CRON_HOURS}`, '*', '*', '*']`. Control: the editorial `backup-db.sh` line
  read the same way is `*/6`, the period `offboxBackupHealth.DEFAULT_STALE_HOURS` is derived from.

- [ ] **Step 2: Run them**

Run: `npx vitest run scripts/__tests__/research-backup.test.mjs scripts/__tests__/shell-syntax.test.mjs server/__tests__/researchBackupPolicy.test.js`
Expected: FAIL — the script does not exist (`bash` exits 127 for every spawn, so each `status` assertion fails; the
log case passes its premise, since Task 6's report names the sentinel interval, and fails on `status`);
`shell-syntax`'s new entry, its mode pin (`ENOENT`) and its text pin fail on the missing file, while its mode control
passes; the policy pin finds no research line.

- [ ] **Step 3: Implement**

`scripts/research-backup.sh` (then `chmod +x scripts/research-backup.sh`: cron runs it by path):

```bash
#!/usr/bin/env bash
#
# research-backup.sh — the research file's own backup job (spec §5.17).
#
# Order, fail-closed:
#   1. prune both tiers by age (its own step: it does not depend on a copy succeeding). The LOCAL prune runs
#      first of all, before the remote is checked: a mis-set remote or a missing rclone must never stop the
#      local copies ageing out;
#   2. run research-withdrawal.js and research-retention.js with --write; either non-zero: NO copy this cycle;
#   3. take the copy (better-sqlite3's online backup, in server/scripts/research-backup.js);
#   4. upload it to RESEARCH_REMOTE, the research file's OWN rclone crypt remote over its own bucket;
#   5. write the heartbeat, only if every step above succeeded.
# The remote prune is NOT best-effort (unlike backup-db.sh): a copy older than 7 days anywhere breaks the consent text.
#
# Every file this job writes is written by the Node part, under paths derived from the research file's
# (server/lib/researchFiles.js), so this script names no path of its own. The age arithmetic lives in
# server/lib/researchBackupPolicy.js.
#
# Exit codes: 0 done; 1 the copy or the heartbeat failed; 2 RESEARCH_REMOTE unset or not a research remote;
# 3 rclone or node missing; 4 the upload failed; 5 RESEARCH_REMOTE malformed; 6 a deletion step failed (no copy taken);
# 7 a prune failed (the copy was taken and uploaded; no heartbeat). Exits 2, 3 and 5 come after the local prune.
#
# THE LOG HOLDS ONE VERDICT LINE PER RUN, AND NOTHING ELSE ([USER] 2026-11-04). The cron line appends this script's
# stdout and stderr to pipeline-output/research-backup.log: the UTC time, then "research-backup: ok" or
# "research-backup: failed: <step>[,<step>...]". Never an interval id, a count, a copy's name or a step's own output:
# the withdrawal and retention reports name the interval ids they deleted, so every child's stdout is captured or
# discarded and every child's stderr discarded. To see what a failing step found, re-run it by hand (the deletion
# scripts are dry-run without --write) and read it in a terminal.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
S="${PROJECT_ROOT}/server/scripts"
# /usr/bin first, as git-backup.sh does: better-sqlite3's binary is built for the service's /usr/bin/node.
# RESEARCH_NODE is a test seam (scripts/__tests__); cron never sets it.
NODE="${RESEARCH_NODE:-$(PATH="/usr/bin:$PATH" command -v node || true)}"
REMOTE="${RESEARCH_REMOTE:-}"

# The steps that failed, in the order they ran (a closed list: node, prune-local, remote, rclone, prune-remote,
# withdrawal, retention, copy, upload, heartbeat).
FAILED=""
fail() { FAILED="${FAILED:+${FAILED},}$1"; }
# The run's one log line, written on every exit path. $? is the status the script is exiting with.
verdict() {
  local rc=$?
  if [ "$rc" -eq 0 ]; then
    printf '%s research-backup: ok\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  else
    printf '%s research-backup: failed: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${FAILED:-unknown}"
  fi
}
trap verdict EXIT

if [ -z "$NODE" ]; then fail node; exit 3; fi

# (1a) The local prune, before anything that can stop the job.
prune_failed=0
if ! "$NODE" "$S/research-backup.js" prune-local >/dev/null 2>&1; then
  fail prune-local
  prune_failed=1
fi

# RESEARCH_REMOTE unset, malformed, or not the research file's own (never the editorial secret:).
if [ -z "$REMOTE" ]; then fail remote; exit 2; fi
case "$REMOTE" in
  *: | */) ;;
  *) fail remote; exit 5 ;;
esac
case "$REMOTE" in
  research*) ;;
  *) fail remote; exit 2 ;;
esac
if ! command -v rclone >/dev/null 2>&1; then fail rclone; exit 3; fi

# (1b) The remote prune: a listing that fails, a deletion that fails, or a name the job did not make (never deleted).
remote_prune_failed=0
if listing="$(rclone lsf "$REMOTE" --files-only 2>/dev/null)"; then
  expired="$(printf '%s\n' "$listing" | "$NODE" "$S/research-backup.js" expired-names 2>/dev/null)"
  names_rc=$?
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    rclone deletefile "${REMOTE}${name}" >/dev/null 2>&1 || remote_prune_failed=1
  done <<< "$expired"
  [ "$names_rc" -eq 0 ] || remote_prune_failed=1
else
  remote_prune_failed=1
fi
if [ "$remote_prune_failed" -ne 0 ]; then
  fail prune-remote
  prune_failed=1
fi

# (2) Deletion before every copy (spec §5.15): both scripts, every cycle. Their reports name interval ids: discarded.
withdrawal_rc=0
"$NODE" "$S/research-withdrawal.js" --write >/dev/null 2>&1 || withdrawal_rc=$?
retention_rc=0
"$NODE" "$S/research-retention.js" --write >/dev/null 2>&1 || retention_rc=$?
[ "$withdrawal_rc" -eq 0 ] || fail withdrawal
[ "$retention_rc" -eq 0 ] || fail retention
if [ "$withdrawal_rc" -ne 0 ] || [ "$retention_rc" -ne 0 ]; then exit 6; fi

# (3) The copy, and (4) the upload. The copy's path is captured, never printed.
if ! copy="$("$NODE" "$S/research-backup.js" copy 2>/dev/null)"; then fail copy; exit 1; fi
if ! rclone copyto "$copy" "${REMOTE}$(basename "$copy")" >/dev/null 2>&1; then fail upload; exit 4; fi

# (5) The heartbeat, only if every step succeeded. A prune failure was named when it happened.
if [ "$prune_failed" -ne 0 ]; then exit 7; fi
if ! "$NODE" "$S/research-backup.js" heartbeat >/dev/null 2>&1; then fail heartbeat; exit 1; fi
exit 0
```

`scripts/install-cron.sh`, after the monthly editorial verify line (`:43`) and before `# To install` (`:45`):

```
# Research file backup (spec §5.17): its OWN job, with its own rclone crypt remote over its own bucket
# (versioning off). Order: prune both tiers by age, run the withdrawal and retention deletions with --write
# (a failure takes no copy), copy, upload, heartbeat (/api/health: checks.research_db reason backup-stale).
# Its period is pinned: the prune cut-off and the health threshold are derived from it in
# server/lib/researchBackupPolicy.js. RESEARCH_REMOTE must begin "research" (the job refuses any other: exit 2).
# Its log holds one verdict line per run (the time, ok or failed, and the failing steps' names), never an interval
# id or a count. See docs/technical/backup-and-restore.md.
45 */6 * * * RESEARCH_REMOTE=${RESEARCH_REMOTE:-research-secret:} ${DEPLOY_PATH}/scripts/research-backup.sh >> ${DEPLOY_PATH}/pipeline-output/research-backup.log 2>&1
```

and the LOGGING note gains `research-backup.sh  does NOT log` (its cron line redirects; what reaches the log is one
verdict line per run, decision 27).

`LICENSE`, class 5 (`:194-204`), after the existing entries:

```
>    - `scripts/research-backup.sh` runs `server/scripts/research-backup.js`,
>      `research-withdrawal.js` and `research-retention.js`, each as its own
>      Node process (the research file's backup job, spec §5.17), and reads
>      `research-backup.js`'s stdout (the copy's path, the expired names). It
>      cannot back the research file up without `server/` present.
>    - `scripts/git-backup.sh:141` runs `server/scripts/export-terminology.js`
>      (the glossary export). It differs from the entries above: it sends the
>      script's output to its log instead of reading it, and its failure is
>      contained (a warning, `:143`), so the content backup still runs without
>      `server/`. *(Found 2026-11-03 while adding the entry above; it predates
>      the class and was never written down.)*
```

and, in the search-shape paragraph (`:206-224`), "**Four** search shapes" becomes "**Five**", the dated note gains
"*(…and four until 2026-11-04, when the research backup's shell scripts showed that none of the four matches a shell
path built from a variable; `scripts/git-backup.sh:141` was reachable only that way.)*", and a fifth bullet follows the
fourth:

```
> - a **shell variable followed by `/server/`** (`"${PROJECT_ROOT}/server/…"`)
>   in a shell script: no literal `server/` at the start of a string, no
>   `../`, no absolute path, so the first four shapes are all blind to it.
>   `git ls-files -z tools scripts experiments | xargs -0 grep -anE
>   '\$\{?[A-Za-z_]+\}?/server/'` finds them.
```

- [ ] **Step 4: Run them**

Run: `npx vitest run scripts/__tests__/research-backup.test.mjs scripts/__tests__/shell-syntax.test.mjs scripts/__tests__/backup-db.test.mjs server/__tests__/researchBackupPolicy.test.js server/__tests__/healthOffboxBackup.test.js`
Expected: PASS (`backup-db.test.mjs`'s template cases still see only the editorial remotes; `healthOffboxBackup.test.js`
still finds the `backup-db.sh` line first). `git status --porcelain`: only this task's files.

Then the log rule's red arm, by mutation (CLAUDE.md § Commands: restore from a golden `cp`, never `git checkout`):
`cp scripts/research-backup.sh <scratch>/research-backup.sh.golden`; in `scripts/research-backup.sh` delete
` >/dev/null 2>&1` from the `research-withdrawal.js --write` line, which is how the job ran it before [USER]'s answer;
`npx vitest run scripts/__tests__/research-backup.test.mjs -t "verdict line"`.
Expected: FAIL on `not.toContain('7340021')`: the output holds the withdrawal report, `due` naming the sentinel
interval, above the `ok` line (measured on the draft with stub Node parts, 2026-11-04). Then `cp
<scratch>/research-backup.sh.golden scripts/research-backup.sh`; `cmp <scratch>/research-backup.sh.golden
scripts/research-backup.sh` prints nothing; the same command → PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/research-backup.sh scripts/__tests__/helpers/fakeBins.mjs scripts/__tests__/research-backup.test.mjs \
  scripts/install-cron.sh scripts/__tests__/shell-syntax.test.mjs server/__tests__/researchBackupPolicy.test.js LICENSE
git add --chmod=+x scripts/research-backup.sh
git commit -m "feat(scripts): research-backup.sh — the research file's own job and remote (spec §5.17; T19)"
```

Then `git ls-files -s scripts/research-backup.sh` shows `100755`.

---

### Task 12: the monthly restore test — `scripts/verify-research-backup.sh`

Spec §5.17 ("A monthly restore test of the newest research copy is the builder's choice, after the shape of
`verify-db-backup.sh`"), §13; decisions 29, 31.

**Files:**
- Create: `scripts/verify-research-backup.sh` (executable, mode `100755` in the index)
- Modify: `scripts/install-cron.sh` — its monthly line after the research job's; the LOGGING note
- Modify: `scripts/__tests__/shell-syntax.test.mjs` — `SCRIPTS` and `CRON_RUN` (Task 11) gain it
- Modify: `LICENSE` — class 5 gains its edge
- Test: `scripts/__tests__/research-backup.test.mjs` — one `describe`

**Interfaces:**
- Consumes: `research-backup.js where` and `verify` (Task 10); the fake bins (Task 11).
- Produces: `scripts/verify-research-backup.sh` — exit 0 PASS; 1 FAIL (no copy, download error, verification);
  2 `RESEARCH_REMOTE` not a research remote; 3 `rclone` or `node` missing. Its last stdout line is `RESEARCH RESTORE
  VERIFY: PASS` or `RESEARCH RESTORE VERIFY: FAIL (<reason>)`.

- [ ] **Step 1: Write the failing tests** (`describe('verify-research-backup.sh')`, Task 11's `setup()`; one full job
  run first, so the fake remote holds a real copy `N`; an older valid copy placed beside it by copying `N`'s bytes to
  `research.2026-01-01T000000Z.db`)

- `it('downloads the newest copy into the copies directory under its own stamp, verifies it, and removes it')` —
  `status 0`, last stdout line `RESEARCH RESTORE VERIFY: PASS`; `fake.calls()` contains `copyto research-secret:${N}
  ${files.backupsDir}/${N}.verify`; afterwards no `.verify` file is in the copies directory.
- `it('fails loudly when the remote holds no copy')` — an emptied remote → `status 1`, `FAIL (no off-box copy found)`.
- `it('fails loudly on a corrupt newest copy, and removes the download')` — `N` corrupted in `fake.remoteDir` →
  `status 1`, a `FAIL (` line, no `.verify` file left.
- `it('refuses a remote that is not the research file\'s own')` — `RESEARCH_REMOTE: 'secret:'` → `status 2`,
  `fake.calls()` `[]`.
- `it('the template prints it monthly, with the research remote')` — the uncommented line matching
  `/\/scripts\/verify-research-backup\.sh(\s|$)/` has fields 3–5 `['1', '*', '*']` and carries
  `RESEARCH_REMOTE=research-secret:`.

- [ ] **Step 2: Run them**

Run: `npx vitest run scripts/__tests__/research-backup.test.mjs -t "verify-research-backup" scripts/__tests__/shell-syntax.test.mjs`
Expected: FAIL — the script does not exist (exit 127); the template has no such line; `shell-syntax`'s new entries
(`bash -n`, and the mode pin's `ENOENT`) fail on the missing file.

- [ ] **Step 3: Implement** `scripts/verify-research-backup.sh` (then `chmod +x scripts/verify-research-backup.sh`):

```bash
#!/usr/bin/env bash
# Restore-test the newest off-box research.db copy (spec §5.17): download it into the research copies directory under
# its own name plus .verify (aged like its source, so a killed run leaves nothing the prune cannot age), verify it with
# server/scripts/research-backup.js (read-only: integrity_check, schema version, tables), delete it.
# Exit codes: 0 PASS; 1 FAIL; 2 RESEARCH_REMOTE not a research remote; 3 rclone or node missing.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
S="${PROJECT_ROOT}/server/scripts"
NODE="${RESEARCH_NODE:-$(PATH="/usr/bin:$PATH" command -v node || true)}"
REMOTE="${RESEARCH_REMOTE:-}"

case "$REMOTE" in
  research*: | research*/) ;;
  *) echo "RESEARCH RESTORE VERIFY: FAIL (RESEARCH_REMOTE must name the research file's own remote, got '$REMOTE')"; exit 2 ;;
esac
[ -n "$NODE" ] || { echo "RESEARCH RESTORE VERIFY: FAIL (node not found)"; exit 3; }
command -v rclone >/dev/null 2>&1 || { echo "RESEARCH RESTORE VERIFY: FAIL (rclone not installed)"; exit 3; }

DIR="$("$NODE" "$S/research-backup.js" where)" || { echo "RESEARCH RESTORE VERIFY: FAIL (no copies directory)"; exit 1; }
# `|| true`: under pipefail an empty match would otherwise abort the assignment (verify-db-backup.sh:12-18).
LATEST="$(rclone lsf "$REMOTE" --files-only | grep -E '^research\.[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z\.db$' | sort -r | head -1 || true)"
[ -n "$LATEST" ] || { echo "RESEARCH RESTORE VERIFY: FAIL (no off-box copy found)"; exit 1; }
DEST="${DIR}/${LATEST}.verify"
trap 'rm -f -- "$DEST" "$DEST-wal" "$DEST-shm" "$DEST-journal"' EXIT
mkdir -p -m 700 "$DIR"
if ! rclone copyto "${REMOTE}${LATEST}" "$DEST"; then
  echo "RESEARCH RESTORE VERIFY: FAIL (download errored)"
  exit 1
fi
"$NODE" "$S/research-backup.js" verify "$DEST"
```

`install-cron.sh`, after the research job's line:

```
# Monthly restore-test of the newest research copy (RESEARCH RESTORE VERIFY: PASS).
30 4 1 * * RESEARCH_REMOTE=${RESEARCH_REMOTE:-research-secret:} ${DEPLOY_PATH}/scripts/verify-research-backup.sh >> ${DEPLOY_PATH}/pipeline-output/verify-research-backup.log 2>&1
```

`LICENSE`, class 5: `scripts/verify-research-backup.sh` runs `server/scripts/research-backup.js` (`where`, `verify`) as
its own Node process and reads its stdout.

- [ ] **Step 4: Run them**

Run: `npx vitest run scripts/__tests__/research-backup.test.mjs scripts/__tests__/shell-syntax.test.mjs scripts/__tests__/backup-db.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-research-backup.sh scripts/install-cron.sh scripts/__tests__/shell-syntax.test.mjs \
  scripts/__tests__/research-backup.test.mjs LICENSE
git add --chmod=+x scripts/verify-research-backup.sh
git commit -m "feat(scripts): verify-research-backup.sh — a monthly restore test of the newest research copy (spec §5.17)"
```

Then `git ls-files -s scripts/verify-research-backup.sh` shows `100755`.

---

### Task 13: `checks.research_db` reports `backup-stale`

Spec §5.20 (`backup-stale`; the threshold derived, "two missed backup cycles plus margin", pinned by a test that parses
`install-cron.sh`; nothing sensitive), §5.17 (the heartbeat feeds `/api/health`); T19 (the health threshold derived);
PR3 decision 37 and its Handoff ("PR4 adds `backup-stale` after them"); decisions 24, 30; Review Focus 27.

**Files:**
- Modify: `server/lib/researchDbHealth.js` (as PR3 Task 13 leaves it) — `nowMs = Date.now()` parameter; the heartbeat
  after every other reason
- Test: `server/__tests__/researchDbHealth.test.js` (PR3 Task 13's; three new cases, and PR3's first case edited)

**Interfaces:**
- Consumes: `researchFilesFor` (Task 2), `RESEARCH_BACKUP_STALE_HOURS` (Task 2), `computeBackupHeartbeatHealth`
  (`server/lib/backupHeartbeatHealth.js:15-19`).
- Produces: `readResearchDbHealth({ editorialPath, researchPath, consentLookupFailing, nowMs = Date.now() }) → { ok,
  reason: null | 'consent-unavailable' | 'missing' | 'unavailable' | 'backup-stale' }`, still exactly two keys. The call
  in `server/index.js` (PR3 Task 13) is unchanged.

- [ ] **Step 1: Write the failing tests** (PR3's fixture plus a heartbeat at `researchFilesFor(researchPath)
  .heartbeatPath`; `H = 3_600_000`)

- **PR3's `it('ok: schema current, consent readable, no flag')` is edited, not left:** its fixture plants a fresh
  heartbeat (mtime `now - H`, `fs.utimesSync`) before the call, and its name gains "and a fresh research backup". Once
  a missing heartbeat is stale (decision 30), that case's fixture, which has none, would read `backup-stale`. The
  no-heartbeat arm is the first new case below, so the red arm stays.
- `it('a fresh heartbeat is ok; a missing or stale one is backup-stale (spec §5.20)')` — heartbeat mtime `now - H` →
  `{ ok: true, reason: null }`; mtime `now - (RESEARCH_BACKUP_STALE_HOURS + 1) * H` → `{ ok: false, reason:
  'backup-stale' }`; no heartbeat → `backup-stale`; in each case `Object.keys(result)` equals `['ok', 'reason']`.
- `it('backup-stale comes after every other reason (PR3 decision 37)')` — stale heartbeat plus `consentLookupFailing:
  true` → `consent-unavailable`; plus a garbage research file → `unavailable`; plus the research file removed and a
  `consented` row → `missing`.
- `it('T19: the threshold is two missed research cycles plus margin, and the cycle is install-cron.sh\'s')` —
  `RESEARCH_BACKUP_STALE_HOURS === 2 * 6 + 2`; the research line of `install-cron.sh` (Task 11's finder) has hour field
  `'*/6'`. Control (the house arithmetic, `backupHeartbeatHealth.js:15-19`, rounds the age): mtime `now -
  RESEARCH_BACKUP_STALE_HOURS * H` → ok; `now - (RESEARCH_BACKUP_STALE_HOURS + 1) * H` → stale.

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/researchDbHealth.test.js`
Expected: FAIL — the missing and stale heartbeat cases read `{ ok: true, reason: null }` (no heartbeat is read yet);
the fresh-heartbeat arms and PR3's edited ok case pass already.

- [ ] **Step 3: Implement** — in `readResearchDbHealth`, after the schema-version check and inside its outer try:

```js
  // The research backup's heartbeat (spec §5.17, §5.20): written only by a full, successful job run. Missing is stale.
  let heartbeatMtimeMs = null;
  try {
    heartbeatMtimeMs = fs.statSync(researchFilesFor(researchPath).heartbeatPath).mtimeMs;
  } catch {
    /* missing heartbeat => stale, handled by the helper */
  }
  if (computeBackupHeartbeatHealth({ heartbeatMtimeMs, nowMs, staleHours: RESEARCH_BACKUP_STALE_HOURS }).stale) {
    return { ok: false, reason: 'backup-stale' };
  }
```

The header gains: `backup-stale` and its derivation (pointing to `researchBackupPolicy.js`, no number); no override.

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/researchDbHealth.test.js server/__tests__/startup.test.js server/__tests__/healthOffboxBackup.test.js`
Expected: PASS (PR3's wiring pin in `researchDbHealth.test.js` still holds: `server/index.js` is unchanged; PR3's ok
case passes with its planted heartbeat). Then `grep -anE "ok: true, reason: null" server/__tests__/*.test.js` and
re-check that every hit plants a heartbeat or is the edited case.

- [ ] **Step 5: Commit**

```bash
git add server/lib/researchDbHealth.js server/__tests__/researchDbHealth.test.js
git commit -m "feat(server): checks.research_db reports backup-stale, its threshold derived from the research cron (spec §5.20)"
```

---

### Task 14: `research-restore.js` — a restored file loses its withdrawn rows before the server opens it

Spec §5.15 ("A restore": only through an admin script that runs both scripts with `--write` against the restored file
before the server opens it), §5.1 (only an admin script restores the file), §5.17 (local copies); T9 ("Restoring a
pre-withdrawal copy and running the script removes the sentinel again"); decisions 32, 33; Review Focus 5, 20, 21, 31.

**Files:**
- Create: `server/scripts/research-restore.js` — `SERVICE_UNIT`, `execNeverThrow`, `restoreResearch(opts)`, `main`
- Test: `server/__tests__/researchRestore.test.js` (new)

**Interfaces:**
- Consumes: `runWithdrawal` (Task 6), `runRetention` (Task 7), `verifyCopy`, `takeCopy` (Task 10, the latter in the
  test), `researchFilesFor` (its `stagingPath`), `COPY_NAME` (Task 2), `RETENTION_DATE` (Task 3).
- Produces: `restoreResearch({ from, files, sessionsPath, write, nowMs?, retentionDate?, exec?, busyTimeoutMs?, deps?
  }) → { ok: false, refused: 'SERVICE_ACTIVE' | 'NOT_A_COPY' | 'COPY_INVALID' | 'PURGE_FAILED', … } | { ok: true, from,
  staging, write, current: 'present' | 'absent' | 'deleted', withdrawal?, retention? }` (`'present'` only on a dry
  run); `main(argv) → 0 | 1 | 2` (`--from <path>` required,
  `--write` optional, anything else 2).

- [ ] **Step 1: Write the failing test** (Task 10's fixture; `inactive = () => ({ ran: true, code: 3, stdout:
  'inactive\n', stderr: '' })`, `active` likewise with `'active\n'` and code 0; `researchDb._reset()` before each
  restore, standing for the stopped server)

- `it('T9: restoring a pre-withdrawal copy removes the withdrawn rows again, before the file goes live')` — `p-r`
  consents and records `'SENTINEL-RESTORE'`; `C = (await takeCopy(…)).path` and its bytes hold the sentinel (control:
  the copy predates the withdrawal); `p-r` withdraws; `runWithdrawal(write)` is `ok` and the live file lacks the
  sentinel. `restoreResearch({ from: C, files, sessionsPath, write: true, exec: inactive })` → `ok: true`; the live
  research file holds neither `'SENTINEL-RESTORE'` nor `p-r`'s key, and does hold `'SENTINEL-KEEP-1'` (control);
  `current` is `'deleted'`; `fs.readdirSync(files.backupsDir)` equals `[path.basename(C)]` (nothing set aside);
  neither `files.stagingPath` nor any of its side files, nor `files.walPath`, remains; `research_deletions` gained a
  `withdrawal` row for `p-r`'s interval (the purge ran on the restored file, its key row being back).
- `it('a live file still holding a due interval\'s rows is deleted, not kept (decision 32)')` — `p-s` consents and
  records `'SENTINEL-DUE'`; `C = (await takeCopy(…)).path`; `p-s` withdraws through `researchConsent.withdraw` and **no**
  deletion runs (as when the route's deletion and the job's step 2 both failed while the file was bad), so the live
  file still holds `'SENTINEL-DUE'` (control, asserted). `restoreResearch({ from: C, files, sessionsPath, write: true,
  exec: inactive })` → `ok: true`, `current: 'deleted'`; `p-s`'s starting row has a numeric `deletion_done_at_ms` and
  `research_deletions` has its row. Then every file under `files.dir`, recursively, except `C` holds neither
  `'SENTINEL-DUE'` nor `p-s`'s key; `C` still holds the sentinel (positive control: it predates the withdrawal and ages
  out by its stamp, spec §5.17).
- `it('refuses while the service is active')` — `exec: active` → `{ ok: false, refused: 'SERVICE_ACTIVE' }`; the live
  file's bytes are unchanged and no staging file exists.
- `it('restores only from one of its copies')` — `from` set to the live research file, to a file outside the copies
  directory, and to a `.partial` → each `refused: 'NOT_A_COPY'`.
- `it('refuses a copy that fails verification')` — a corrupted copy → `refused: 'COPY_INVALID'`, live file unchanged.
- `it('a purge that fails leaves the live file untouched and removes the staged copy (decision 32)')` — `deps: {
  runWithdrawal: () => ({ ok: false }), runRetention }` → `refused: 'PURGE_FAILED'`; the live file's bytes unchanged; no
  `files.stagingPath` (it may hold withdrawn rows).
- `it('a dry run writes nothing')` — `write: false` → `ok: true`, `staging` named, `current: 'present'`; no file created.
- `it('the command line')` — `[]` and `['--from', C, '--force']` → exit 2; a dry run → exit 0 (the test's
  `systemctl`, if present, reports the unit inactive or unknown).

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/researchRestore.test.js`
Expected: FAIL — `Cannot find module '../scripts/research-restore'`.

- [ ] **Step 3: Implement** `server/scripts/research-restore.js` (header: spec §5.15 "A restore" and §5.1; the runbook
  in `docs/technical/backup-and-restore.md`; stop the service first (it refuses while `ritstjorn`, the unit
  `scripts/deploy.sh` restarts, is active); from a local copy only (fetch an off-box copy into the copies directory
  under its own name first); staging, purge, delete the current file, rename (decision 32, and why the current file is
  never kept); never re-creates a lost file without a copy (decision 33); `execNeverThrow` is a local copy of PR2's
  (`read-research-preconditions.js`), because that probe must require only modules production had at `ed10180c`):

```js
const ACTIVE = new Set(['active', 'activating', 'reloading', 'deactivating']);

function restoreResearch({
  from, files, sessionsPath, write, nowMs = Date.now(), retentionDate = RETENTION_DATE, exec = execNeverThrow,
  busyTimeoutMs, deps = { runWithdrawal, runRetention },
}) {
  if (ACTIVE.has(String(exec('systemctl', ['is-active', SERVICE_UNIT]).stdout).trim())) {
    return { ok: false, refused: 'SERVICE_ACTIVE' };
  }
  const abs = path.resolve(from);
  if (path.dirname(abs) !== files.backupsDir || !COPY_NAME.test(path.basename(abs)) || !fs.existsSync(abs)) {
    return { ok: false, refused: 'NOT_A_COPY' };
  }
  const check = verifyCopy(abs);
  if (!check.ok) return { ok: false, refused: 'COPY_INVALID', reason: check.reason };
  const staging = files.stagingPath; // pruneLocal refuses to ignore one a killed run left (decision 23)
  const removeStaging = () => {
    for (const p of [staging, `${staging}-wal`, `${staging}-shm`, `${staging}-journal`]) fs.rmSync(p, { force: true });
  };
  const report = { from: abs, staging, write };
  if (!write) return { ...report, ok: true, current: fs.existsSync(files.researchPath) ? 'present' : 'absent' };
  removeStaging();
  fs.copyFileSync(abs, staging);
  fs.chmodSync(staging, 0o600);
  let withdrawal = null;
  let retention = null;
  try {
    withdrawal = deps.runWithdrawal({ researchPath: staging, sessionsPath, write: true, nowMs, busyTimeoutMs });
    retention = deps.runRetention({ researchPath: staging, sessionsPath, write: true, nowMs, retentionDate, busyTimeoutMs });
  } catch (err) {
    withdrawal = withdrawal || { ok: false, error: err.code || err.name };
  }
  if (!withdrawal?.ok || !retention?.ok) {
    removeStaging(); // it may hold withdrawn rows
    return { ...report, ok: false, refused: 'PURGE_FAILED', withdrawal, retention };
  }
  // Decision 32: delete the current file, never set it aside. The purge above has just recorded every interval due at
  // restore time as deleted, and the current file may still hold such an interval's rows (a bad file is when the
  // route's deletion and the job both failed). Delete before rename: a run killed between them leaves no live file.
  const current = fs.existsSync(files.researchPath) ? 'deleted' : 'absent';
  for (const p of [files.researchPath, files.walPath, files.shmPath]) fs.rmSync(p, { force: true });
  fs.renameSync(staging, files.researchPath);
  return { ...report, ok: true, current, withdrawal, retention };
}
```

`main` parses `--from` and `--write` strictly, builds `files` from `resolveResearchDbPath()`, prints the report as JSON,
returns `report.ok ? 0 : 1`; `process.exitCode = 1` on entry.

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/researchRestore.test.js server/__tests__/researchBoundary.test.js`
Expected: PASS (the boundary scan visits `research-restore.js` and finds no forbidden table).

- [ ] **Step 5: Commit**

```bash
git add server/scripts/research-restore.js server/__tests__/researchRestore.test.js
git commit -m "feat(server): research-restore.js — a restored research file is purged before it goes live (spec §5.15; T9)"
```

---

### Task 15: T19 — the editorial tier never picks the research file up

Spec §5.17 ("The editorial tier must never pick it up … A test pins those patterns, so a widened pattern fails before it
ships"), §8 (G1.20's row: the long-lived tier must never pick up `research.db`); T19 (`backup-db.sh`'s local glob and
remote and verify prefixes match only `sessions.`); decision 38; Review Focus 12. **No script changes: these are pins.**

**Files:**
- Test: `scripts/__tests__/research-backup-isolation.test.mjs` (new)

**Interfaces:**
- Consumes: `makeFakeBins` (Task 11); `scripts/backup-db.sh`, `scripts/verify-db-backup.sh` as they are.

- [ ] **Step 1: Write the tests** (a `makeTestDb` as `backup-db.test.mjs:16-21`; `DB_PATH_OVERRIDE` as `backup-db.sh:25`;
  **every `backup-db.sh` run passes a temp backups directory as its argument**, because with none it writes a copy and
  `.last-offbox-backup` into the real `pipeline-output/backups/` and prunes there (`backup-db.sh:26`, `:53-58`, `:100`);
  `realBackups()` = `existsSync` and the sorted listing of `<repo>/pipeline-output/backups`, captured before and
  asserted equal after every case)

- `it('backup-db.sh\'s local prune never touches a research copy beside its own')` — a backups dir with 31 `sessions.*.db`
  copies with increasing mtimes (the fixture of `backup-db.test.mjs:200-226`) plus `research.2020-01-01T000000Z.db` and
  its `-wal`, both with the oldest mtime; run `backup-db.sh <dir>` with `BACKUP_REMOTE: ''` → the research file and its
  `-wal` exist with their bytes unchanged. Positive control: the two oldest `sessions.*` copies are gone.
- `it('backup-db.sh\'s remote prune deletes only sessions.* objects')` — `fake = makeFakeBins()`; `fake.remoteDir` holds
  `sessions.2020-01-01-000000.db`, `sessions.2020-01-02-000000.db` and `research.2099-01-01T000000Z.db`; run
  `backup-db.sh <temp dir>` with `PATH` fake-first, `BACKUP_REMOTE: 'secret:'`, `BACKUP_REMOTE_KEEP: '1'` → the
  heartbeat is in `<temp dir>`, and the `deletefile` calls, sorted, equal
  `['deletefile secret:sessions.2020-01-01-000000.db', 'deletefile secret:sessions.2020-01-02-000000.db']`; the research
  object is still in `fake.remoteDir`.
- `it('verify-db-backup.sh never restores a research object')` — `makeFakeBins({ sqlite3: true })`. A remote holding
  only `research.2099-01-01T000000Z.db` → `status 1`, stdout matches `/RESTORE VERIFY: FAIL \(no off-box backup
  found\)/`, and `fake.calls()` holds no `copyto` (the red arm: without the `grep '^sessions\.'` at `:19` this object
  would be restored, and the fake `sqlite3` would pass it). Control, in the same case: with
  `sessions.2020-01-02-000000.db` added, stdout matches `/RESTORE VERIFY: PASS/` and the one `copyto` names
  `secret:sessions.2020-01-02-000000.db`. (A remote holding both cannot be the red arm: `sort -r` already puts `s…`
  before `r…`, measured, so dropping the `grep` would still pick the sessions object.)
- `it('the patterns themselves (spec §5.17\'s citations), as a second line behind the behaviour above')` — `backup-db.sh`
  contains `pipeline-output/sessions.db` (`:23`), `sessions.${TIMESTAMP}.db` (`:45`), `"$BACKUP_DIR"/sessions.*.db`
  (`:53`, `:56`), `sessions.*.db-shm` and `sessions.*.db-wal` (`:66`) and `grep '^sessions\.'` (`:104`);
  `verify-db-backup.sh` contains `grep '^sessions\.'` (`:19`); neither file contains `research`. Control: both
  research scripts do contain `research.`.

- [ ] **Step 2: Run them**

Run: `npx vitest run scripts/__tests__/research-backup-isolation.test.mjs`
Expected: PASS on the first run: these pin today's behaviour (`backup-db.sh` was never widened). Their red arm is each
case's control, and two mutation runs, each from a golden `cp` of its file: change `scripts/backup-db.sh:104`'s
`'^sessions\.'` to `'\.db$'` (the remote-prune case fails naming the research object), and remove the
`| grep '^sessions\.'` at `scripts/verify-db-backup.sh:19` (the verify case fails: the research-only remote restores
and PASSes). Restore each from its golden copy and `cmp` it (CLAUDE.md § Commands; never `git checkout`).

- [ ] **Step 3: Implement** — nothing beyond the tests.

- [ ] **Step 4: Run them**

Run: `npx vitest run scripts/__tests__/research-backup-isolation.test.mjs scripts/__tests__/backup-db.test.mjs`
Expected: PASS; `cmp scripts/backup-db.sh <golden>` and `cmp scripts/verify-db-backup.sh <golden>` print nothing;
`git status --porcelain` lists only the new test file.

- [ ] **Step 5: Commit**

```bash
git add scripts/__tests__/research-backup-isolation.test.mjs
git commit -m "test(scripts): T19 — the editorial backup's globs and prefixes never reach a research copy"
```

---

### Task 16: T9 end to end — the editing record is untouched, by value

Spec §10 T9 ("every editing table and the module JSON are equal by value before and after"; "a later act writes no
research row and no loss row"; "the next backup copy lacks the sentinel"), §3 anti-goal (a withdrawal never changes
what an editor sees or can do); decision 39; Review Focus 29. **A pin over Tasks 6, 8 and 10, so its first run passes**
(PR3 decision 63's shape); its red arm is in the same file.

**Files:**
- Test: `server/__tests__/researchWithdrawalT9.test.js` (new)

**Interfaces:**
- Consumes: PR1's `servedFixture.js` (`handlerFor`, `invoke`, `writeModule`), PR3's routes and fixtures, Tasks 6, 8, 10.

- [ ] **Step 1: Write the test** — a temp books root with one chemistry fixture module (`writeModule`, as PR3 Task 27
  serves it), both `_setTestBooksDir` seams set; approved texts; server commit; users `p-t9` and `p-other` (editors,
  consenting through `POST /consent`) and `a-admin` (an admin with no assignment row, so a serve opens nothing).
  `editingSnapshot(db)`: every table in `sqlite_master` except `research_consent`, `research_capture_losses` and
  `research_deletions`, each as `SELECT * FROM <t> ORDER BY rowid` (a `WITHOUT ROWID` table, if any, by its primary key).

- `it('a withdrawal changes no editing row and no byte of the module JSON, and its rows leave the research file and the
  next copy')` — `p-t9` saves an edit whose text is `'SENTINEL-T9-EDIT'` and accepts MT on another segment; `p-other`
  saves `'SENTINEL-T9-OTHER'`, all through the real routes with their echoed hashes. `a-admin` serves the module once
  (minting). Then: `before = { json: JSON.stringify((await serve()).body), rows: editingSnapshot(db) }`; the research
  file's bytes hold `'SENTINEL-T9-EDIT'` and `p-t9`'s key (control). `POST /consent/withdraw` as `p-t9`;
  `runWithdrawal({ … write: true })` is `ok`; `copy = await takeCopy(…)`. Assert: `editingSnapshot(db)` deep-equals
  `before.rows`; `JSON.stringify((await serve()).body) === before.json`; the research file's bytes and `copy.path`'s
  bytes hold neither `'SENTINEL-T9-EDIT'` nor `p-t9`'s key, and both hold `'SENTINEL-T9-OTHER'` (positive control).
  Then `p-t9` saves again: the response is 200, the `research_events` id set and `losses()` are equal before and after.
- `it('control: the comparison sees a changed editing row')` — the same snapshot after an `UPDATE segment_edits SET
  editor_note = 'MUTATED' WHERE id = <p-other's edit>` differs from `before.rows` (so the equality above is not
  vacuous). `editor_note` has no `CHECK`; `category` does (`server/migrations/039-segment-edit-exit-path.js:68-70`), so
  `category = 'x'` would throw instead of differing.

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/researchWithdrawalT9.test.js`
Expected: PASS on the first run (a pin). Verify it bites once, from a golden `cp` of `server/services/researchDeletion.js`:
add `researchConsent.getSessionsDb().prepare("UPDATE segment_edits SET editor_note = 'MUTATED'").run();` after the
losses delete (every fixture edit is then changed, whatever its `category`); the first case FAILS on the editing
snapshot; restore from the golden copy and `cmp` it.

- [ ] **Step 3: Implement** — nothing beyond the test.

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/researchWithdrawalT9.test.js`
Expected: PASS; `cmp` against the golden copy prints nothing.

- [ ] **Step 5: Commit**

```bash
git add server/__tests__/researchWithdrawalT9.test.js
git commit -m "test(server): T9 end to end — a withdrawal leaves the editing record and the module JSON byte-identical"
```

---

### Task 17: the probe reads every crontab for a copy of `pipeline-output/` (G-1a's crontab half), and can run without a database

Spec §9 (G-1a: "the committed script for every user's crontab … Does any crontab `tar`, `rsync` or copy
`pipeline-output/`?"; production reads are read-only, sent on stdin), §12 item 10, R2's precondition; index decision 14;
PR2's Interfaces entry for the probe (PR4 appends sections; a crontab reader returns lines that name copies, never a
whole crontab); decisions 34, 35; Review Focus 13, 14.

**Files:**
- Modify: `server/scripts/read-research-preconditions.js` (as PR2 Task 6 leaves it) — `KNOWN_JOBS`, `COPY_TOOL`,
  `ASSIGNMENT_ONLY`, `EXCLUDES_RESEARCH`, `redactAssignments`, `namesAncestor`, `classifyCronLine`, `cronSources`,
  `readG1a`; `SECTIONS`
  gains `'G-1a'` first; `readResearchPreconditions` gains `only` and `researchDir`; `main` accepts `--sections`; the
  header's usage gains the root command
- Test: `server/__tests__/readResearchPreconditions.test.js` (PR2's; two `describe`s, the require set, the CLI cases)

**Interfaces:**
- Consumes: PR2's `listDir`, `runSection`, `execNeverThrow`; `researchFilesFor` and `resolveResearchDbPath`, required
  lazily inside the `researchDir` default (they exist on production once PR4 is deployed; G-1a and G-1h run after that).
- Produces:
  - `readG1a(ctx) → { spool: 'read' | 'absent' | 'unreadable', sources: { source, state: 'read' | 'absent' |
    'unreadable' | 'none' }[], complete: boolean, copies: { source, line }[], excludedCopies: { source, line }[],
    unclassified: { source, line }[], known: string[] }` (each list sorted by source, then line)
  - `readResearchPreconditions({ …PR2's options, only?: string[], researchDir?: () => string })`
  - `main`: `<book>` or `<book> --sections <name,…>`; an unknown section name, an empty list or any other argument →
    exit 2

- [ ] **Step 1: Write the failing tests**

`describe('G-1a, crontab half (spec §9): every cron source, for a copy of pipeline-output/')` — its own temp root `R`
with `repo/pipeline-output` (`researchDir: () => <R>/repo/pipeline-output`), `etc/`, `var/`; `ctx({ etcRoot, varRoot,
researchDir, exec })`; the `exec` stub answers `crontab -l` with `{ ran: true, code: 1, stdout: '', stderr: 'no crontab
for root' }` and anything else `{ ran: false, … }`. Files:
- `etc/crontab`: `SHELL=/bin/sh` and `17 * * * * root cd / && run-parts --report /etc/cron.hourly`;
- `etc/cron.d/po-tar`: `0 2 * * * siggi tar -czf /backups/po.tgz <R>/repo/pipeline-output/`;
- `etc/cron.d/po-tar-excluded`: `0 4 * * * siggi tar --exclude='*research*' -czf /backups/po-x.tgz
  <R>/repo/pipeline-output/` (Task 19's own remedy);
- `etc/cron.d/home-rsync`: `0 3 * * * root AWS_SECRET_ACCESS_KEY=SENTINEL-SECRET-4 rsync -a
  --password-file=SENTINEL-SECRET-5 <R> /mnt/backup`;
- `etc/cron.daily/local-backup` (a script): `#!/bin/sh` and `cp -a <R>/repo/pipeline-output /mnt/po`;
- `bin/blob`: a binary file (a NUL byte in its first 4 KiB);
- `var/spool/cron/crontabs/siggi`: the lines `install-cron.sh` prints with `DEPLOY_PATH=<R>/repo` (run it), plus `0 1 * *
  * <R>/bin/nightly.sh` (a script holding `tar czf /tmp/n.tgz ~/repos`), `0 2 * * * /usr/bin/rsync -a <R>/ /mnt/backup/`
  and `0 3 * * * /bin/tar -czf /b/h.tgz <R>` (copying tools named by absolute path), `0 4 * * * <R>/bin/blob --run`,
  `5 5 * * * cp /etc/hosts /tmp/h` and `0 6 * * * /usr/local/bin/rotate <R>/repo/pipeline-output/x.log`.

Cases:
- `it('finds every copy, names the known jobs, and lists what it cannot classify')` — `sections['G-1a']` equals `{ ok:
  true, spool: 'read', sources: [{ source: 'spool:siggi', state: 'read' }, { source: 'crontab -l', state: 'none' }, {
  source: '/etc/crontab', state: 'read' }, { source: '/etc/anacrontab', state: 'absent' }, { source:
  '/etc/cron.d/home-rsync', state: 'read' }, { source: '/etc/cron.d/po-tar', state: 'read' }, { source:
  '/etc/cron.d/po-tar-excluded', state: 'read' }, { source: '/etc/cron.daily/local-backup', state: 'read' }], complete:
  true, copies: [{ source: '/etc/cron.d/home-rsync', line: '0 3 * * * root AWS_SECRET_ACCESS_KEY=<redacted> rsync -a
  --password-file=<redacted> <R> /mnt/backup' }, { source: '/etc/cron.d/po-tar', line: <its line> }, { source:
  '/etc/cron.daily/local-backup', line: 'cp -a <R>/repo/pipeline-output /mnt/po' }, { source: 'spool:siggi', line: '0 2
  * * * /usr/bin/rsync -a <R>/ /mnt/backup/' }, { source: 'spool:siggi', line: '0 3 * * * /bin/tar -czf /b/h.tgz <R>' },
  { source: 'spool:siggi → <R>/bin/nightly.sh', line: 'tar czf /tmp/n.tgz ~/repos' }], excludedCopies: [{ source:
  '/etc/cron.d/po-tar-excluded', line: <its line, byte for byte: the `--exclude` value is not redacted> }],
  unclassified: [{ source: 'spool:siggi', line: '0 6 * * * /usr/local/bin/rotate <R>/repo/pipeline-output/x.log' }, {
  source: 'spool:siggi → <R>/bin/blob (not a text file)', line: '0 4 * * * <R>/bin/blob --run' }], known:
  ['backup-db.sh', 'git-backup.sh', 'research-backup.sh', 'verify-db-backup.sh', 'verify-research-backup.sh'] }`
  (each list sorted by source, then line). The `cp /etc/hosts` line, the comments, `SHELL=` and `PATH=` lines, and
  `run-parts` are the controls (absent). The two absolute-path tools are the cases a bare-name regex misses (measured:
  both classified as nothing before this change).
- `it('returns no whole crontab and no secret')` — `text = JSON.stringify(sections['G-1a'])` contains none of
  `'SENTINEL-SECRET-4'`, `'SENTINEL-SECRET-5'`, `'secret:'`, `'research-secret:'` and `'BACKUP_REMOTE'`; positive
  control: the fixture files do contain them, and `text` does contain `--exclude='*research*'` (the one value left
  readable).
- `it('an unreadable spool is reported, not read as clean')` — `var/spool/cron/crontabs` a **file**, not a directory (so
  the case holds when the tests run as root) → `spool: 'unreadable'`, `complete: false`, and the `/etc` copies are still
  found.
- `it('a box with no user crontab at all is complete')` — no `var/spool/cron/crontabs` → `spool: 'absent'`, `complete:
  true`.

`describe('--sections: a run that opens no database (decision 35)')`:
- `it('reads only the named sections, and never opens the database')` — `openDb = vi.fn()`;
  `readResearchPreconditions(ctx({ openDb, only: ['G-1a'] }))` → `Object.keys(result.sections)` equals `['G-1a']` and
  `openDb` was not called. Control: without `only`, `openDb` is called once (the database sections ran).
- `it('the command line accepts --sections and still refuses everything else')` — spawned: `['efnafraedi-2e',
  '--sections', 'G-1a']` → `status 0` (or 1 when a section fails on this box), and the JSON's `sections` keys are
  `['G-1a']`; `['efnafraedi-2e', '--sections', 'G-1z']`, `['efnafraedi-2e', '--sections', '']` and PR2's
  `['efnafraedi-2e', '--write']` → `status 2`, nothing on stdout.
- PR2's require-set case widens by `'../lib/researchDbPath'` and `'../lib/researchFiles'` (required lazily, inside the
  `researchDir` default; the comment says G-1a and G-1h are read after PR4's deploy, and a run on an older tree reports
  those sections as failed while the others read).

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/readResearchPreconditions.test.js`
Expected: FAIL — `sections['G-1a']` is `undefined`; `only` is ignored (`openDb` is called); `--sections` exits 2; the
require set lacks the two specifiers.

- [ ] **Step 3: Implement**

```js
// G-1a, crontab half (spec §9; PR4 decision 34). A line is a COPY when it holds a copying tool and names pipeline-output
// or anything above the research directory. Lines are returned redacted; a whole crontab never leaves this function.
const KNOWN_JOBS = Object.freeze([
  'git-backup.sh', 'backup-db.sh', 'verify-db-backup.sh', 'research-backup.sh', 'verify-research-backup.sh',
]);
// The tool bare or by an absolute path: /usr/bin/rsync is a copy too (a bare-name test misses it, measured).
const COPY_TOOL =
  /(?:^|[\s;|&(`])(?:\/[^\s;|&()`]*\/)?(?:tar|rsync|cp|scp|rclone|restic|borg|duplicity|zip|cpio|dd)(?=\s)/;
const ASSIGNMENT_ONLY = /^[A-Za-z_][A-Za-z0-9_]*=\S*$/;
// A copy that leaves the research file out: returned apart, for [USER]'s judgment (spec §9: "excluded the file").
const EXCLUDES_RESEARCH = /--exclude(?:-from)?[= ]['"]?[^\s'"]*research/;
// Redact a NAME=value or --opt=value word at a token start; keep an --exclude/--include value, which a reader needs
// in order to judge the exclusion. (A \b anchor here redacted `--exclude='*research*'` too, measured.)
const KEEP_VALUE = /^--(?:exclude|include)(?:-from)?$/;
const redactAssignments = (line) =>
  line.replace(/(^|\s)(--?[A-Za-z][\w-]*|[A-Za-z_]\w*)=("[^"]*"|'[^']*'|\S+)/g, (m, pre, name) =>
    KEEP_VALUE.test(name) ? m : `${pre}${name}=<redacted>`
  );

function namesAncestor(line, dir) {
  for (const raw of line.split(/\s+/)) {
    const p = raw.replace(/^["'(]+|["');]+$/g, '');
    if (/^(?:~|\$HOME|\$\{HOME\})(?:\/|$)/.test(p)) return true;
    if (p.startsWith('/')) {
      const q = p.replace(/\/+$/, '') || '/';
      if (q === '/' || dir === q || dir.startsWith(`${q}/`)) return true;
    }
  }
  return false;
}

function classifyCronLine(line, dir) {
  const t = line.trim();
  if (!t || t.startsWith('#') || ASSIGNMENT_ONLY.test(t)) return null;
  const mentions = t.includes('pipeline-output');
  if (COPY_TOOL.test(t) && (mentions || namesAncestor(t, dir))) {
    return { kind: EXCLUDES_RESEARCH.test(t) ? 'excluded-copy' : 'copy', line: redactAssignments(t) };
  }
  const job = KNOWN_JOBS.find((j) => new RegExp(`/scripts/${j.replace(/\./g, '\\.')}(?:\\s|$)`).test(t));
  if (job) return { kind: 'known', job };
  if (mentions) return { kind: 'unclassified', line: redactAssignments(t) };
  return null;
}
```

`cronSources({ etcRoot, varRoot, exec })` returns `{ spool, sources: [{ source, state, text, crontab: boolean }] }` in
this order: each `var/spool/cron/crontabs/<user>` (`spool:<user>`), `crontab -l` (`state 'none'` when it exits 1 with
`/no crontab/` on stderr, `'unreadable'` when it did not run), `/etc/crontab`, `/etc/anacrontab`, each `/etc/cron.d/*`
(those are crontabs) and each file in `/etc/cron.{hourly,daily,weekly,monthly}/` (scripts). `readG1a` classifies every
line; for a crontab line that classifies as nothing on its own, its **command word** (the first token after the five
schedule fields or an `@` keyword, the user field in `/etc/crontab` and `/etc/cron.d/*`, and any `NAME=value` words) is
read when it is an absolute path to a regular text file (no NUL in its first 4 KiB, at most 1 MiB), and that file's lines
are classified with the source `<source> → <path>`; a command word that is an absolute path the probe cannot read gives
one `unclassified` entry (the redacted crontab line, source `<source> → <path> (unreadable)`), and one that is a binary
or larger than 1 MiB gives one with `(not a text file)`: a program the probe cannot read may copy anything, so it is
never dropped silently. One level only. `excluded-copy` lines go to `excludedCopies`, `copy` lines to `copies`.
`complete =
spool !== 'unreadable' && sources.every((s) => s.state !== 'unreadable')`. `SECTIONS` becomes `{ 'G-1a': readG1a,
'G-1c': …, 'G-1d': …, 'G-1e': …, 'G-1f': …, 'G-1g': … }`; `readResearchPreconditions` filters `SECTIONS` by `only` when
given and passes `researchDir` (default: the lazy thunk above) in `ctx`. `main` accepts `args.length === 1`, or
`args.length === 3 && args[1] === '--sections'` with every name in `SECTIONS`. Header, under the stdin command:

```js
 * G-1a's spool (every user's crontab) is readable only by root. Run that half as root, opening no database (a root
 * process can leave root-owned -wal/-shm files the service cannot write):
 *   ssh <prod> "cd <repo>/server/scripts && sudo \"\$(command -v node)\" - efnafraedi-2e --sections G-1a,G-1h" \
 *     < server/scripts/read-research-preconditions.js > g1a-g1h.json
```

- [ ] **Step 4: Run them**

Run: `npx vitest run server/__tests__/readResearchPreconditions.test.js`
Expected: PASS, PR2's cases included. `git status --porcelain`: only this task's files.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/read-research-preconditions.js server/__tests__/readResearchPreconditions.test.js
git commit -m "feat(server): the probe reads every crontab for a copy of pipeline-output (G-1a), and runs without a database"
```

---

### Task 18: the probe confirms the research job runs (G-1h)

Spec §9 (G-1h: "The research cron line is in the production crontab (`crontab -l`), and one `--write` run of the job
has completed"; before the first consented row), §5.17 ("`install-cron.sh` only prints lines for an operator to
paste"); decision 36; Review Focus 15.

**Files:**
- Modify: `server/scripts/read-research-preconditions.js` — `readG1h`; `SECTIONS` gains `'G-1h'` last
- Test: `server/__tests__/readResearchPreconditions.test.js` — one `describe`; the require set

**Interfaces:**
- Consumes: Task 17's `cronSources`; `researchFilesFor` (Task 2) and `RESEARCH_BACKUP_STALE_HOURS` (Task 2), both lazily;
  `serverDir` (PR2) for `<repo>/scripts/install-cron.sh`.
- Produces: `readG1h(ctx) → { cron: { installed: boolean, sources: string[], scheduleMatchesTemplate: boolean,
  researchRemote: boolean }, heartbeat: { present: boolean, ageHours: number | null, fresh: boolean }, ready: boolean }`
  — `ready` when installed, matching, research-remoted, present and fresh. It reads no database.

- [ ] **Step 1: Write the failing tests** (Task 17's root `R`; `serverDir: <repo>/server`, so the template is the real
  `scripts/install-cron.sh`; a `siggi` spool file holding the research line `install-cron.sh` prints; a heartbeat at
  `<R>/repo/pipeline-output/.last-research-backup` with mtime `now - H`)

- `it('ready: the line is installed as printed, its remote is a research remote, and a run completed recently')` —
  `sections['G-1h']` equals `{ ok: true, cron: { installed: true, sources: ['spool:siggi'], scheduleMatchesTemplate:
  true, researchRemote: true }, heartbeat: { present: true, ageHours: 1, fresh: true }, ready: true }`.
- `it('each condition can fail on its own')` — no research line → `installed: false`, `ready: false`; the line's schedule
  changed to `0 */12 * * *` → `scheduleMatchesTemplate: false`; `RESEARCH_REMOTE=secret:` on it → `researchRemote:
  false`; the heartbeat removed → `present: false, ageHours: null`; its mtime older than `RESEARCH_BACKUP_STALE_HOURS` →
  `fresh: false`; each time `ready: false`.
- `it('prints no remote value and reads no database (decision 36)')` — `JSON.stringify(sections['G-1h'])` contains
  neither `'research-secret:'` nor `'secret:'` (control: the spool file does); with `only: ['G-1h']` and `openDb =
  vi.fn()`, `openDb` is not called.
- The require-set case widens by `'../lib/researchBackupPolicy'`.

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/readResearchPreconditions.test.js`
Expected: FAIL — `sections['G-1h']` is `undefined`; the require set lacks the specifier.

- [ ] **Step 3: Implement** `readG1h`: find, in every crontab source, the non-comment lines matching
  `/\/scripts\/research-backup\.sh(\s|$)/`; `scheduleMatchesTemplate` compares each found line's first five fields with
  those of the template's research line (read from `path.join(serverDir, '..', 'scripts', 'install-cron.sh')`, same
  finder); `researchRemote` is true when the found line's `RESEARCH_REMOTE=` value begins with `research` and ends in
  `:` or `/` (computed before any redaction; the value is never returned); the heartbeat's age is
  `Math.round((Date.now() - mtimeMs) / 3_600_000)` and `fresh` is `ageHours <= RESEARCH_BACKUP_STALE_HOURS`. The header's
  section list gains G-1a and G-1h, with the root command of Task 17.

- [ ] **Step 4: Run them**

Run: `npx vitest run server/__tests__/readResearchPreconditions.test.js`
Expected: PASS. Then, read-only, on this box: `node server/scripts/read-research-preconditions.js efnafraedi-2e
--sections G-1a,G-1h > <scratch>/local.json; echo $?` — exit 0 or 1; `G-1h.ready` is `false` here (no research cron line
on a dev box). Keep it out of the repository.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/read-research-preconditions.js server/__tests__/readResearchPreconditions.test.js
git commit -m "feat(server): the probe confirms the research backup job is installed and has run (G-1h)"
```

---

### Task 19: the docs — the research file is excluded from every other copy, and has its own remote

Spec §12 item 10 (the checklist recommends Linode Backups and a nightly `tar` of `pipeline-output/`; either would copy
`research.db` and break R2; "once this ships it must say the research file is excluded"), §5.17 (the remote "set up as
`docs/technical/backup-and-restore.md` describes for the editorial one (passphrase escrowed first)"), §9 G-1a, G-1b;
index PR4 row; decision 41; Review Focus 27.

**Files:**
- Modify: `docs/deployment/linode-deployment-checklist.md` — §9 (`:228-248`), rewritten
- Modify: `docs/technical/backup-and-restore.md` — the title line (`:1`), the table's two editorial defaults (`:15-16`)
  and the keep counts (`:6`, `:14`) as pointers, and a new section "The research file (`research.db`)" before
  "Restore runbook" (`:72`)
- Test: `scripts/__tests__/research-backup-isolation.test.mjs` — one `describe`

- [ ] **Step 1: Write the failing test** (`describe('the deployment docs no longer invite a copy of the research file')`)

- `it('the checklist\'s §9 recommends no whole-disk backup and no unexcluded copy of pipeline-output (spec §12 item 10)')`
  — `s9` = the text from `## 9.` up to `## 10.`; its **commands** are every line inside a fenced block plus every inline
  backtick span outside one, kept when they match `/(?:^|[\s;|&])(?:tar|rsync)\s/` (a command, not the bare word: the
  prose bullet naming `` `tar` `` and `` `rsync` `` is not one):

  ```js
  const fenced = [...s9.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].flatMap((m) => m[1].split('\n'));
  const inline = [...s9.replace(/```[\s\S]*?```/g, '').matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
  const commands = [...fenced, ...inline].filter((c) => /(?:^|[\s;|&])(?:tar|rsync)\s/.test(c));
  ```

  `s9` does not match `/Enable automatic Linode backups/i` nor `/Rsync to external/i`; `commands.filter((c) =>
  !/--exclude='\*research\*'/.test(c))` equals `[]`; it names `research.db` and `scripts/research-backup.sh`. Controls:
  `s9` is non-empty and starts with `## 9. Backup Strategy`, and `commands` is non-empty (the extraction sees the one
  command the new text keeps). Before the change `commands` is the fenced `tar -czf …` line at `:243`, which has no
  exclude.
- `it('backup-and-restore.md describes the research remote and restates no editorial default')` — the file names
  `research-secret:`, `linode-research`, `scripts/research-backup.sh`, `server/scripts/research-restore.js`, `G-1b` and
  `pipeline-output/research-backup.log`, and matches `/one verdict line per run/`;
  it has no line matching `/OFFBOX_BACKUP_STALE_HOURS.*\|\s*`?\d+`?\s*\|/` (a default digit in the table) and no line
  matching `/\d+\s*h cycles?/` (a derivation restated in a Meaning cell); and it does not match ``/s3 remote `research/``
  (an s3 remote carrying the guard's prefix, decision 26). Control: the file names
  `OFFBOX_BACKUP_STALE_HOURS` (the row is still there, pointing to `server/lib/offboxBackupHealth.js`).

- [ ] **Step 2: Run it**

Run: `npx vitest run scripts/__tests__/research-backup-isolation.test.mjs -t "deployment docs"`
Expected: FAIL — §9 matches `Enable automatic Linode backups` and its fenced `tar` line has no exclude; the backup
document names no research remote and no research log, its table carries `` `26` ``, and its Meaning cells say "6 h
cycle" and "2 h cycles".

- [ ] **Step 3: Implement**

`docs/deployment/linode-deployment-checklist.md`, §9 replaced by:

```markdown
## 9. Backup Strategy

`pipeline-output/` holds two databases with different backup rules, and nothing else may copy either:

- `sessions.db`, the editorial database: backed up by `scripts/backup-db.sh` (local and encrypted off-box).
- `research.db`, the research file (with its `-wal` and `-shm`, `research-backups/` and `research-exports/`): backed up
  only by its own job, `scripts/research-backup.sh`, whose copies never live longer than 7 days. The consent text promises
  that (R2, `docs/decisions/2026-11-03-research-capture-consent-and-retention-rulings.md`); any other copy breaks it.

So:

- **Do not enable Linode Backups for this Linode.** A whole-disk image cannot leave one file out, so it would copy
  `research.db`. If they are on, no consent is collected until they are off (check G-1a).
- **No `tar`, `rsync` or other copy of `pipeline-output/`, of the repository, or of a home directory that holds it.** The
  jobs `scripts/install-cron.sh` prints are the backups. If some other runtime file needs a copy, leave the research file
  out: `tar --exclude='*research*' -czf <target> <source>`. G-1a reports such a line apart, under `excludedCopies`, for
  [USER] to judge that it really leaves out `research.db`, its `-wal` and `-shm`, `research-backups/` and
  `research-exports/`.
- Set both off-box remotes up as `docs/technical/backup-and-restore.md` says (the research one has its own bucket and its
  own passphrase, escrowed first), then install every line `scripts/install-cron.sh` prints.

- [ ] Linode Backups are off (Linode console, the Linode's Backups tab)
- [ ] Every cron line from `scripts/install-cron.sh` is installed (`crontab -l`)
- [ ] G-1a's crontab half reports no copy and every excluded copy is judged, run as root:
  `server/scripts/read-research-preconditions.js … --sections G-1a`
```

`docs/technical/backup-and-restore.md`:
- `:1` becomes `# Backup & Restore — \`sessions.db\` and the research file`, with one sentence under it pointing to the
  new section.
- `:6` ("keep the most recent 30") and `:14` (`BACKUP_REMOTE_KEEP`'s default) point to `MAX_BACKUPS` and
  `BACKUP_REMOTE_KEEP` in `scripts/backup-db.sh`; `:15` and `:16`'s "Default" cells point to `DEFAULT_STALE_HOURS` in
  `server/lib/offboxBackupHealth.js` and `server/lib/contentBackupHealth.js`, and their "Meaning" cells drop the
  parenthesised derivation for "(derived from the cron period: see the comment above `DEFAULT_STALE_HOURS`)"
  (CLAUDE.md § Server Features: those defaults are enforceable values, never restated; `:15`'s `26` is stale and its
  "one missed 6 h cycle" is wrong, `offboxBackupHealth.js:19-21` saying two).
- A new section "## The research file (`research.db`)", covering, in this order and restating no policy value:
  1. **What and why it is separate:** research rows only (§5.1); its copies live at most 7 days (R2), so a withdrawal or
     the retention date is complete everywhere within 7 days; the editorial tiers must never copy it (pinned by
     `scripts/__tests__/research-backup-isolation.test.mjs`).
  2. **🔴 Escrow first, a gate:** the research crypt passphrase is its own (not the editorial one) and goes into the
     password manager before the first upload, for the reason the editorial section gives (`:20`).
  3. **One-time setup:** a separate bucket (for example `namsbokasafn-research`), in another region than the server;
     **versioning off and no lifecycle or retention rule that keeps deleted objects** (check G-1b in the provider's
     console; re-check it after G1.20 lands, since G1.20 turns versioning on for the editorial bucket); an access key
     limited to that bucket where the provider offers one; `rclone config`: an s3 remote `linode-research` and a crypt
     remote `research-secret` with `remote = linode-research:namsbokasafn-research`. The crypt remote's name must begin
     with `research`: the job refuses any other (exit 2), so the editorial `secret:` can never receive a research copy.
     **Only the crypt remote may begin with `research`:** that prefix is the whole guard, so an s3 remote named
     `research-…` would let an unencrypted upload through it.
  4. **Cron:** the two research lines `scripts/install-cron.sh` prints (the research job and its restore test; their
     schedules are on those lines, and nowhere else), with `RESEARCH_REMOTE=research-secret:`; prime by hand with
     `RESEARCH_REMOTE=research-secret: scripts/research-backup.sh`, then `RESEARCH_REMOTE=research-secret: scripts/verify-research-backup.sh` (expect
     `RESEARCH RESTORE VERIFY: PASS`). The exit codes are in each script's header. **The job's log**
     (`pipeline-output/research-backup.log`) holds one verdict line per run (the time, `ok` or `failed`, and the
     failing steps' names) and nothing else (an unplanned bash abort adds bash's own one-line diagnostic before it):
     never an interval id or a count, so it cannot say who withdrew ([USER] 2026-11-04). To see what a failing step
     found, re-run that step by hand (the deletion scripts without `--write` are dry runs) and read it in the terminal.
  5. **What the job does, in order:** prune both tiers by age; run `research-withdrawal.js` and `research-retention.js`
     with `--write` (a failure takes no copy); copy; upload; heartbeat. The cut-off and the health threshold are derived
     values in `server/lib/researchBackupPolicy.js`.
  6. **What makes "within 7 days" true:** the job runs (its heartbeat; `/api/health`'s `checks.research_db` reads
     `backup-stale` otherwise, and `./scripts/deploy.sh` names `research_db` among the not-ok checks; `curl -s
     http://localhost:3000/api/health` shows the reason); nothing else copies the file (G-1a); the bucket keeps no
     deleted versions (G-1b). Expect `backup-stale` from a deploy until the job's first full run.
  7. **Restore runbook (research file):** stop the service; to use an off-box copy, fetch it into
     `pipeline-output/research-backups/` under its own name (`rclone copyto research-secret:<name>
     pipeline-output/research-backups/<name>`); `node server/scripts/research-restore.js --from <that path>` (a dry
     run), then with `--write`; start the service. **Never copy a backup into place by hand:** a restored file must lose
     its withdrawn rows before the server opens it (spec §5.15). If the file is lost and no copy exists, do not create one;
     the server stays `missing` until [USER] decides (spec §5.1).

- [ ] **Step 4: Run it**

Run: `npx vitest run scripts/__tests__/research-backup-isolation.test.mjs`
Expected: PASS. Read both documents through once: no count, no test total, no grant or fund named, and no policy value
restated (CLAUDE.md § One source of truth).

- [ ] **Step 5: Commit**

```bash
git add docs/deployment/linode-deployment-checklist.md docs/technical/backup-and-restore.md \
  scripts/__tests__/research-backup-isolation.test.mjs
git commit -m "docs: the research file is excluded from every other copy, and has its own remote (spec §12 item 10)"
```

---

## Interfaces produced

CommonJS under `server/`; tests reach them through `createRequire(import.meta.url)`; the two shell scripts and the fake
bins under `scripts/`.

### `server/lib/researchFiles.js` (Task 2)

`researchFilesFor(researchPath) → Readonly<{ dir, researchPath, walPath, shmPath, backupsDir, exportsDir,
servedVersionExportsDir, heartbeatPath, stagingPath }>` — every research-side path, beside the research file. **PR5
writes its raw research export and `opening-eligibility.js`'s output under `exportsDir`, and the end-of-editing export under
`servedVersionExportsDir`, both from this function** (never a second derivation, never under `books/`).

### `server/lib/researchBackupPolicy.js` (Tasks 2, 11)

`RESEARCH_BACKUP_CRON_HOURS` (pinned against `install-cron.sh`), `MAX_COPY_AGE_HOURS`, `PRUNE_CUTOFF_HOURS`,
`RESEARCH_BACKUP_STALE_HOURS`, `COPY_NAME`, `stamp(ms)`, `copyName(ms)`, `stampMs(name)`, `expiredNames(names, nowMs)`.
A change of the research cron's period changes the constant and its test in one commit.

### `server/lib/researchRetention.js` (Task 3)

`RETENTION_DATE = null` until SD6 (a commit that sets it changes its test); `retentionDateMs(date)`.

### `server/services/researchDeletion.js` (Task 8)

`deleteIntervalRowsNow(intervalId) → { research: 'deleted' | 'no-key' | 'failed', losses: 'deleted' | 'failed' }` — never
throws; called bare; its result never reaches a response. Called by `POST /api/research/consent/withdraw`, by `POST
/api/research/consent` on `outcome: 'withdrew'`, and by `research-paper-consent.js`. **G1.4's consent page calls the
routes, never this.**

### `server/scripts/lib/researchAdmin.js` (Task 4)

`SCRIPT_BUSY_TIMEOUT_MS`, `openResearch({ researchPath, write?, busyTimeoutMs? })`, `keyForInterval`, `allKeys`,
`anyResearchRow`, `iterateEvents(db)`, `itemsForEvent(db, eventId)`. Required only from `server/scripts/` and tests
(`researchBoundary.test.js` walks the rest of `server/`). **An export reads events and items, never the key readers.**

### `server/scripts/lib/researchPurge.js` (Task 5)

`checkpointBusy(db)` (a write handle; one frame first, decision 5), `compact(db)`, `scanForKeys(paths, keys)`,
`emptyExports(exportsDir)`.

### The scripts (Tasks 6, 7, 9, 10, 14)

| Script | Exports | CLI |
|---|---|---|
| `research-withdrawal.js` | `dueIntervals(sessions, research)`, `runWithdrawal(opts)`, `main` | `[--write]` |
| `research-retention.js` | `isDue(opts)`, `runRetention(opts)`, `main` | `[--write] [--no-derived-dataset]` |
| `research-paper-consent.js` | `parseArgs`, `recordPaperDecision(opts)`, `main` | `--user <id> (--decision consented\|declined --text-version <v> \| --withdraw) [--write]` |
| `research-backup.js` | `pruneLocal`, `takeCopy`, `writeHeartbeat`, `verifyCopy`, `main` | `prune-local \| expired-names \| copy \| heartbeat \| where \| verify <file>` |
| `research-restore.js` | `restoreResearch(opts)`, `main` | `--from <copy> [--write]` |

Every one: `process.exitCode = 1` on entry, and an unknown argument is exit 2. Every one but `research-backup.js` is
dry-run unless `--write` and prints one JSON report with no key and no row count; `research-backup.js` takes no
`--write` and prints a path, names or a verify line for the shell that runs it (decision 42).

### `scripts/research-backup.sh`, `scripts/verify-research-backup.sh` (Tasks 11, 12)

Environment `RESEARCH_REMOTE` (must begin `research`, end in `:` or `/`); test seam `RESEARCH_NODE`. Exit codes in
decision 27 and Task 12. Their cron lines are in `scripts/install-cron.sh`. `research-backup.sh` writes one verdict
line per run and nothing else, except bash's own one-line diagnostic on an unplanned abort (decision 27; pinned by Task
11's log case): a later change to the job keeps every child's output out of it.

### `scripts/__tests__/helpers/fakeBins.mjs` (Task 11)

`makeFakeBins({ sqlite3? }) → { root, binDir, remoteDir, env(over?), calls() }` — for any later test of a script that
calls rclone or sqlite3.

### `server/lib/researchDbHealth.js` (Task 13)

`readResearchDbHealth({ editorialPath, researchPath, consentLookupFailing, nowMs? }) → { ok, reason }`; reasons in
precedence `consent-unavailable`, `missing`, `unavailable`, `backup-stale`.

### `server/scripts/read-research-preconditions.js` (Tasks 17, 18)

`SECTIONS` now `G-1a`, `G-1c`, `G-1d`, `G-1e`, `G-1f`, `G-1g`, `G-1h`; `readResearchPreconditions({ …, only?,
researchDir? })`; `main`: `<book> [--sections <names>]`. G-1a returns `copies`, `excludedCopies` and `unclassified`
separately; only `copies: []` with every other list judged clears it.

### The guards

- `researchBoundary.test.js`: the admin reader's `describe` (`nonScriptFilesNaming`); `forbiddenTableUses` reads
  `scripts/research-*.js` and `scripts/lib/research*.js`; `RESEARCH_SCRIPT_EXCEPTIONS` still has one entry.
- `researchAppendOnly.test.js`: `DELETE_ALLOWED` per file and per table (three entries); **PR5 adds none.**
- `activityLogCallsiteGuard.test.js`: `TRY_WRAPPED_DELETION`.
- `schemaHealth.EXPECTED_SCHEMA`: `research_deletions`, `research_derived_datasets`.
- `featureFlags.ENV_SCAN_FILES`: PR4's four server modules.

## Before the PR

1. **The gate, as CI runs it, on the branch's tip** (index § Global Constraints): `npm test` from the repository root
   (diff the failing set by name against `main`'s, never the count); `npm run lint` **and** `npm run format:check`;
   `npm run docs:check` (Task 8 touches `server/routes/**` and adds no route line; expected clean); `cd server && CI=1
   npm run test:e2e` (a route changes; the E2E database lists no approved text, so no consent exists there and nothing
   is deleted). No dependency is added. `git status --porcelain` empty.
2. **Re-check the migration number** (`ls server/migrations`) against `main` just before merging (index decision 9).
3. **A whole-branch adversarial review: a blind pair,** Opus and Fable on the same brief, neither seeing the other's
   findings (**[USER] commissioned the Fable half on 2026-11-04**). A mutation pass restores from a golden `cp`, never
   `git checkout`, and `git status --porcelain` runs the moment any reviewing agent goes quiet. Fold confirmed findings
   in as their own commits. The Review Focus above is the brief's input-case list.
4. **PR4 adds no Icelandic string** (index, "Wording to check"), so no wording check is owed before the PR opens.
5. **Push, open the PR (draft), and deploy only on [USER]'s go.** Merge as a **merge commit**, never squash or rebase. A
   push to `main` from dev puts prod's content backup behind until the next deploy (CLAUDE.md § Content delivery). After
   the deploy, `/api/health` reads `degraded` with `research_db` not ok (`backup-stale`) until the research job's first
   full run (decision 30); that needs the research remote set up first (Task 19's runbook), and is the first item below.
6. A new top entry in the register: what merged, what was measured, what is next. **Consent collection still waits for
   the section below; G1.23 does not.**

### Answers ([USER], 2026-11-04)

[USER] answered "Yes for all" to the index's questions, with four clarifications the same day (index § Answers). For
this plan:

- **Decisions 9, 10, 11, 12, 18, 19 and 20** (each a departure from the spec's wording): approved; recorded in the
  spec's `✏️ AMENDED 2026-11-04` block. Their fallbacks are not built.
- **Decision 21** (with the research file absent, the paper script refuses a consent but records a withdrawal or a
  decline, leaves its deletion due and exits 1): as written.
- **Decision 29** (the monthly restore test holds a decrypted research copy in `research-backups/` for the minutes it
  runs, aged out with its source if a run dies): as written.
- **Decision 32** (a restore deletes the live file it replaces rather than keeping it aside): as written.
- **Decision 33** (a lost research file with no copy stays `missing`): a deliberate admin path is wanted **later**,
  recorded in the register, not built in PR4.
- **The job's log** (`pipeline-output/research-backup.log`): **a verdict only per run** (the time, `ok` or `failed`,
  and the failing step's name), never interval ids, counts or step outcomes beyond that. Built as decision 27's last
  bullet and Task 11; the earlier draft, which passed each deletion report into the log, is Task 11's mutation red arm.
- **Linode Backups stay off** while the research file lives on this Linode's disk (decision 41), as written; a
  whole-disk backup would need the research file housed elsewhere first, which is not in this plan.
- **The research bucket** (another region than the server, an access key limited to it where the provider offers one;
  Task 19), as written. Where the research passphrase is escrowed is [USER]'s, and it is never written in the
  repository; escrowing it is item 1 below.
- **G-1a's root run** (`--sections G-1a`, decision 35) is a production step, item 2 below: [USER] runs it, or
  authorises a read-only run, when that step comes.

## Before the first consented row (not code)

PR4 gates **consent collection**, not G1.23 (index, spec §13a). Until every step below is done, in order, no consent text
is listed and the consent `POST` answers `NO_APPROVED_TEXT` (PR3). Each production step is read-only or an
administrator's setup, and each result is recorded in the register by its output.

1. **PR4 is deployed, and the research job is running.** The research passphrase is escrowed; the research bucket
   exists with versioning off; the `research-secret` crypt remote is configured; every line `scripts/install-cron.sh`
   prints is installed; one hand run of `scripts/research-backup.sh` exited 0 with its one `research-backup: ok` line,
   and `scripts/verify-research-backup.sh` printed `RESEARCH RESTORE VERIFY: PASS`; `/api/health`'s `checks.research_db`
   reads `{ ok: true, reason: null }`.
2. **G-1a.** [USER] in Linode's web console: the Linode's Backups are not enabled. The probe's crontab half, run as root
   (`--sections G-1a`): `complete: true`, `copies: []`, every `excludedCopies` line judged (its exclude leaves out
   `research.db`, its `-wal` and `-shm`, `research-backups/` and `research-exports/`), and every `unclassified` line
   read and judged. If either finds a copy, consent waits until [USER] has excluded the file or stopped the job (spec
   §9); an excluded copy judged sound is that exclusion.
3. **G-1b.** [USER] or the builder, in the backup provider's console: the research bucket's versioning is off and no
   lifecycle or retention rule keeps deleted objects. **Re-run after G1.20 lands** (it adds versioning for the editorial
   bucket).
4. **G-1h.** After the cron line is installed and one job run has completed: the probe (`--sections G-1h`) reads
   `ready: true`.
5. **The data protection officer reviews G1.4's consent text** (G1.4). The text must say what §6 lists, including items
   6 and 19 (the loss notes outlive the 7 days; the research file's copies live 7 days), which PR4 has now made true.
6. **[USER] lists the reviewed text** in `server/lib/researchConsentText.js` (and its test's `EVER_LISTED`) by a reviewed
   commit (PR3 decision 31). Only then can a *consented* row exist.

## Handoff to PR5

Binding on PR5's plan ([the end-of-editing export](2026-11-03-g11-g12-pr5-end-of-editing-export.md)).

**PR5 may rely on:**
- **The admin reader** (`server/scripts/lib/researchAdmin.js`, Task 4) for the raw research export (§5.19's last
  bullet): `openResearch({ researchPath })` (read-only, `fileMustExist`, safe integers: every id a `BigInt`),
  `iterateEvents(db)` (by `editor_key`, then `key_seq`) and `itemsForEvent(db, eventId)`. **It must not call
  `keyForInterval` or `allKeys`** (no export joins the key map, §5.16); PR5's test can pin that its source names neither.
- **`researchFilesFor`** (Task 2): the raw research export and `opening-eligibility.js` write under `exportsDir`
  (`research-exports/`), the end-of-editing export under `servedVersionExportsDir` (`served-version-exports/`).
- **Every deletion run empties `research-exports/`** and never touches `served-version-exports/` (Tasks 5–7): a raw
  export or an eligibility file made before a withdrawal or the retention date is gone after it, by design, and is
  re-made from the file as it then stands.
- **T17's scan reads `server/scripts/research-*.js` and `server/scripts/lib/research*.js`.** `opening-eligibility.js`
  and `export-served-versions.js` are not research-named, which matters: `opening-eligibility.js` reads
  `module_openings` and `book_switch_events`, both forbidden to research figures (§5.22). A raw research export named
  `research-*` is scanned and must name no forbidden table (it reads the research file through the admin reader and
  `served_text_versions` by value, both allowed). PR5 adds its eligibility-output assertion to `researchBoundary.test.js`
  (index decision 15).
- **No migration in PR5** (index): `056` is the last of this project's.

**PR5 must not change:**
- the deletion scripts, their order, their due rules, or `DELETE_ALLOWED` (PR5 deletes no research row and adds no
  entry);
- `researchFilesFor`'s directories, or the rule that the deletion empties `research-exports/` and never
  `served-version-exports/`;
- `researchBackupPolicy.js`'s values, the research cron line, or the backup job's order;
- the admin reader's write-free rule (its "holds no write statement" pin) or the rule that nothing outside
  `server/scripts/` requires it.
