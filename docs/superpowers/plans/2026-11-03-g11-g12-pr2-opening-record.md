# G1.1 + G1.2, PR2 — the opening record: the opened time and the in-flight snapshot — Implementation Plan

> **For agentic workers:** execute this plan task by task, in order, test first. Steps use checkbox (`- [ ]`) syntax.
> No plan-execution skill is installed in this repository, so follow the steps as written. **The tree wins:** where a
> measurement disagrees with this plan, stop, say so, and re-derive; never force the plan's expectation. Read
> [the index](2026-11-03-g11-g12-served-versions-and-event-log.md) and [the PR1 plan](2026-11-03-g11-g12-pr1-served-versions-core.md)
> first: the index's decisions, its test placement and its Global Constraints, and PR1's "Handoff to PR2", bind this
> plan.

**Goal:** a chemistry unit's first serve to a user who holds an assignment row for its chapter records, once and in
one transaction, the time it opened and the set of its segments that held an in-flight edit at that moment; a serve
that meets that predicate but cannot record it answers 503 and records nothing (spec §5.4, §5.5). A committed,
read-only probe answers checks G-1c to G-1g on production before PR2 merges (spec §9).

**Architecture:** one never-throw migration (predicted `054`) adds `module_openings` and `module_opening_inflight` to
`sessions.db`. One new service, `server/services/moduleOpenings.js`, holds the predicate, the snapshot, the
one-transaction step and the 503 decision; it runs on the connection the module route already mints served versions
on. The module route calls it at the seam PR1 Task 6 left before `res.json`, maps its one failure status to
`503 OPENING_UNRECORDED`, and adds nothing to the response. `loadModule` shows a client string for that code and
returns to the module list; when the serve was a reload from an open pane, it first puts the pane's texts in the draft
and then takes the pane away, which today's catch does not do. `server/scripts/read-research-preconditions.js` is sent
to production on stdin, opens the database read-only, and prints one JSON object that names no editor.
`server/scripts/close-pending-edits.js` refuses once a unit of its book has opened (spec §5.6). No research file and no
event: PR3 emits `module-opened` at the seam this PR leaves (index decision 2).

**Tech Stack:** Node 22, Express (CommonJS under `server/`), better-sqlite3 13 (only in `server/node_modules`), browser
JS with no build step (`server/public/js/`, `sourceType: 'script'`), Vitest from the repository root, Playwright E2E
(`cd server && CI=1 npm run test:e2e`).

**Spec, and the read order:**
1. [The index](2026-11-03-g11-g12-served-versions-and-event-log.md): decisions 1–17 (for this PR 1, 2, 3, 9, 10, 14,
   15), the test placement table, the cross-PR interfaces and the Global Constraints.
2. [The PR1 plan](2026-11-03-g11-g12-pr1-served-versions-core.md): its "Interfaces produced for later PRs" and its
   "Handoff to PR2" (binding), and Tasks 2–6, 9, 18 and 19, whose code this PR builds on.
3. [The spec](../specs/2026-11-03-served-version-and-event-log-design.md), whole; for this PR §5.4 (step 4 and the 503),
   §5.5, §5.6 (its last bullet: `close-pending-edits.js`), §5.20 (`checks.schema`), §9 (G-1c…G-1g), §10 (T6, T7, T17), §11, §13 and §13a. Frozen and approved as
   written, with two dated `✏️ AMENDED` blocks: `researchScope.js` in PR1 (2026-11-03), and the twenty departures
   [USER] approved with the plans (2026-11-04), one of them this plan's (decision 4). This plan does not reopen §14.
4. [The decision record](../../decisions/2026-11-03-research-capture-consent-and-retention-rulings.md): R3 (no user
   column) and R6 (switch on, then assign) for this PR.
5. [G1.23's spec](../specs/2026-11-02-suggestion-view-design.md) §6.2, §6.3a and §8 items 2 and 4: the contract this
   PR meets.
6. [The handoff](../../plans/2026-11-03-g11-g12-implementation-plan-handoff.md) §4 PR2 (frozen; pinned to `d24681b8`,
   whose `server/` equals `ed10180c`'s).

## State of this plan (read first)

- **Written 2026-11-03 as one of the five PR plans the index lists; ✅ approved by [USER] on 2026-11-04** ("Yes for
  all", with the clarifications the index's "Answers" records). The spec's `✏️ AMENDED 2026-11-04` block records every
  departure, this plan's decision 4 among them, so **no spec commit is owed before any task**. Every other behaviour
  choice is built as written. Two questions stay open until Task 8: who runs the production probe, and the §9 choice
  if chemistry holds assignment rows. Status lives in the register, never here.
- **Pinned to `main` = `ed10180c`, plus PR1 as its plan leaves it.** Every `path:line` below was opened at
  `ed10180c`; where PR1 changes a construct, the text says "as PR1 Task N leaves it". Once PR1 has merged, match each
  edit on the quoted construct, never on the number.
- **Every `Expected:` line is a prediction, and almost none of this plan's tests was run:** they need PR1's code, which
  is not in the tree. Two exceptions, run in a scratch copy on 2026-11-03: Task 7's two cases, against `ed10180c`'s
  script with the `054` tables created by hand (red as predicted, then passing with the guard, the file's existing
  cases unchanged); and Task 4's pin logic, against `ed10180c`'s `loadModule` and the Step 3 catch (the no-discard pin
  failed on the catch's own comment until comments were stripped, which the pins now do). These premises were measured on 2026-11-03 with read-only probes in a scratch directory: under
  `node -` (the stdin route), `__dirname` is `.`, `__filename` is `[stdin]` and `require.main` is `undefined`, so a
  script guarded only by `require.main === module` does nothing there; `CREATE TABLE IF NOT EXISTS` is **satisfied by
  a VIEW of the same name** (no error, no table), while an INDEX of that name fails it with `there is already an index
  named …`; a `RAISE(ABORT)` trigger on the snapshot table rolls the opening row back with it
  (`SQLITE_CONSTRAINT_TRIGGER`); the composite foreign key with `ON DELETE CASCADE` refuses an orphan and removes the
  children; on the opening table's DDL, `INSERT OR IGNORE` drops a `CHECK` or `NOT NULL` violation silently (`changes`
  0, no error), while `INSERT … ON CONFLICT (book, chapter, module_id) DO NOTHING` ignores only the key conflict and
  still throws `SQLITE_CONSTRAINT_CHECK` and `SQLITE_CONSTRAINT_NOTNULL`; a `BEFORE INSERT` trigger that inserts the
  same key first leaves that statement's own `changes` at 0 (recursive triggers are off), which is how Task 2 plays a
  racing serve; after `vi.restoreAllMocks()` (vitest 5.0.5) a spy made in an earlier `it` reports 0 calls and is no
  longer installed, so every spy below is made in a `beforeEach` or in the `it` that reads it; a read-only open of a missing file in an existing directory throws `SQLITE_CANTOPEN` (a missing directory
  throws a `TypeError` with no code); a read-only open and query leave the file's bytes identical; `dotenv.parse`
  returns every key of the text it is given. Run each red arm before implementing; where it fails for another
  reason, stop and re-derive.
- **The merge is gated** (index § The five PRs; spec §13a): PR2 merges only after Task 8 has run the probe on
  production and [USER] has made the §9 choice if chemistry holds assignment rows.

### ✏️ AMENDED 2026-11-05 — two findings from PR1's review, taken in before Task 1

The register's 2026-11-05 entry asks that PR2's plan take the "For PR2" bullets of its 2026-11-04 entry (PR1's
whole-branch review). Both are added here; nothing above is reopened. Everything else in this plan is built as
approved on 2026-11-04.

1. **A new Task 3b, after Task 3: the serve's mint and the opening wait out another process's write lock.**
   - **Premise** (PR1 review C2, commit `e8b9832f`, measured there by a scratch probe; Task 3b's red arm re-measures
     it): `mintVersions` (`server/services/servedVersions.js`) runs one DEFERRED transaction that opens with a
     `SELECT`. When a row is missing (a changed serve), its `INSERT` asks for the write lock while the transaction
     already holds a read, and SQLite runs no busy handler for that upgrade. So while another process holds the
     write lock (`backup-db.sh`'s `wal_checkpoint(TRUNCATE)`, an operator's CLI), the mint throws `SQLITE_BUSY` at
     once and `recordServe` returns `mintOk: false`. Under PR1 that is fail-soft (200). Under PR2 it becomes a 503
     `OPENING_UNRECORDED` (cause `mint`) for an assigned editor's first serve, where waiting out the busy timeout
     would have recorded the opening.
   - **The change, in `mintVersions`:** read every row first, taking no write lock; when every row is found, return
     their ids (an unchanged re-serve stays lock-free: spec §5.4 step 3, PR1's `servedWriteLock` case (c)). When a
     row is missing, run the insert pass as an **IMMEDIATE** transaction (`.immediate()`) that re-reads each row
     before inserting it, because another serve may have inserted it between the two passes. Save, accept and
     propagation call the mint inside their own IMMEDIATE transactions; there, better-sqlite3 runs both passes as
     savepoints (measured 2026-11-05 in a scratch database: a nested `.immediate()` is a savepoint, and its rollback
     undoes only its own writes), so their behaviour does not change, which their existing tests show.
   - **`recordOpening` opens IMMEDIATE** (`conn.transaction(…).immediate()`), stated rather than left to its first
     statement being a write.
   - **Unchanged:** `recordServe`'s signature and its fail-soft rule (PR1's handoff). A mint that still fails (the
     busy timeout runs out, a damaged database) returns `mintOk: false`, and the route answers 503 only when the
     predicate holds. **The trade-off, stated:** a changed serve under a held lock now blocks the request (and, since
     better-sqlite3 is synchronous, the process) for up to the busy timeout, as save and accept already do since C2.
   - **Tests, in `server/__tests__/servedWriteLock.test.js`** (its child-process lock holder and on-disk ordering
     witness): **(e)** a changed serve started while the lock is held waits for it and mints (`mintOk: true`, its new
     rows present, `releasingWhenDone` true); red on the unchanged mint: `mintOk: false`, returned before the holder
     released. **(f)** an assigned editor's first serve of a chemistry unit through the real module handler, started
     while the lock is held, waits and records the opening (200, one `module_openings` row); red on the unchanged
     mint: 503 `OPENING_UNRECORDED`. Case (c) still passes unchanged, and a mutant that makes the whole mint
     `.immediate()` still fails (c).
2. **Task 1 also widens `scripts/deploy.sh`'s schema remedy.** It tells the operator to read "the `[053]` warning";
   once `checks.schema` can name `054`'s tables that is wrong. Task 1 rewrites it to name the migrations' warnings
   from `[053]` onward, without listing numbers, so PR3's migration needs no further edit there.
   ✏️ *Corrected 2026-11-05, after Task 1: this said no test pins that line, from a grep for the literal `[053]`.
   `scripts/__tests__/deploy-health-readout.test.mjs` does pin it, with an anchored regex whose brackets are escaped
   (`\[053\]`), which that grep cannot match. Task 1 updated the regex, test first. Grep for what a test would
   write, not only for the text it checks.*
3. **G-1c reads what journald and rsyslog actually read** (added 2026-11-05, after Task 6's review, finding F3).
   - **Premise the tree contradicted:** decision 21 and Task 6 read journald's settings only from
     `/etc/systemd/journald.conf` and `/etc/systemd/journald.conf.d/`. journald also reads drop-ins from
     `/run/systemd/journald.conf.d/` and `/usr/lib/systemd/journald.conf.d/` (a same-named file in `/etc` masks one
     in `/run`, which masks one in `/usr/lib`; the survivors apply in filename order, a later one overriding). On
     Ubuntu 24.04, the production OS, the systemd package ships `/usr/lib/systemd/journald.conf.d/syslog.conf` with
     `ForwardToSyslog=yes` (measured in this sandbox with `systemd-analyze cat-config systemd/journald.conf` and
     `dpkg -S`). The request log is journald's (`requestTiming.js`), so with forwarding on and rsyslog running its
     lines may also land in `/var/log/syslog`, whose retention `/etc/logrotate.d/rsyslog` sets. G-1c's question
     ("journald retention", which decides what the consent text says about the request log, §6 item 14) is then not
     answered by the `/etc` files alone.
   - **The change:** G-1c lists journald's settings from every file journald applies, in its order, with each file's
     path; adds `ForwardToSyslog` to the keys it reports; reports whether rsyslog is configured and active, and the
     rotation lines of `/etc/logrotate.d/rsyslog`; and adds `hourly` to the rotation directives. Still read-only,
     still directives only, still no editor and no secret. The roots are parameters of the exported function, as
     `etcRoot` and `varRoot` are.
4. **Decision 13's mechanism, as built after the whole-branch review** (added 2026-11-05; review findings U1–U6 and
   U12–U15, then R1–R3 on that fix). Decision 13's promises stand: on a reload from an open pane answered
   `OPENING_UNRECORDED` the pane goes, nothing on the module list can save, accept or discard for the unit, and no
   text is discarded. Its mechanism changed, and so did Review Focus 13's account of it:
   - **The branch is `saveDraft()`, then `leaveModule()`,** the function Back also calls (Back after `clearDraft`).
     `leaveModule` closes every pane without reverting its text; empties `dirtyEdits`, `heldDrafts` and `paneState`;
     stops the draft timer; releases the tab claim; hides the editor and the save bar; nulls `moduleData`; and resets
     what Back reset. It writes nothing to storage. **Nothing stays held in memory,** so decision 13's "`heldDrafts`
     and `paneState` stay", the return through `renderSegments`' carry-over and `reinstallHeldDrafts`, and the
     parenthetical on opening a different unit no longer describe the code: with nothing held, nothing is written
     under the other unit's key.
   - **Every text comes back through `restoreDraft`, from the draft:** a kept text unasked, with its notice; a typed
     one offered (index decision 12).
   - **With the browser's storage full,** `saveDraft` reports the failed write, and the same entries stay in memory
     for that unit only (`keepUnwritten`). `restoreDraft` merges them at that unit's next opening. Leaving the page
     tries storage again, and asks first while memory alone holds a text.
   - **What can still land after the branch, and what the client does with it.** "Retries nothing" still holds:
     nothing re-serves the unit by itself. Writes sent before the reload may land later; their texts were typed while
     the unit was open (Review Focus 8). One is a save `saveRetry` queued: a refused replay is parked for the unit's
     next load, because `onSaveParked` and `onSaveReplayed` return while `moduleData` is null. The other is a save,
     accept or review action still waiting for its answer. Such an action compares `openUnit()` after its await. If
     the unit was left, it changes nothing in memory and reloads nothing; a save refused with a kept code adds its
     text to the unit's draft in this tab (`keepLeftText`, by `mergeRestoreSources`' rule), so the next opening
     installs it unasked. A reopening of the same unit compares equal, and the action then finishes as in any open
     unit.
   - **Back also changes (PR1's handler):** it closes its panes, and an answer arriving after it is left alone.
5. **Task 8 Step 2 runs while the `ritstjorn` service is running** (added 2026-11-05; PR2 review U20, then R6 on
   that fix). A `readonly: true` open of a WAL database whose `-wal` and `-shm` files are absent creates both,
   owned by the probe's user, and leaves them after close (measured). Since `0bab69d6` the probe reads the database's
   header first and refuses that case: G-1d and G-1e then fail with `WAL_FILES_ABSENT`, and nothing is created.
   Those files are absent only when no process holds the database, so Step 2's command must run while the service
   runs: before it, `ssh <prod> systemctl is-active ritstjorn` prints `active`. Step 2's rule is unchanged and covers
   a run made while the service was stopped: a section that is not ok means stop and report, and do not merge.

## Decisions taken in this plan

Each is a §13 item, a seam the spec, the index or PR1's handoff leaves open, or a reading of the tree. **Decision
4's second half goes beyond the frozen spec's wording, and [USER] approved it on 2026-11-04** (spec `✏️ AMENDED
2026-11-04`). Every other decision was approved as written the same day. "Answers ([USER], 2026-11-04)" lists each
question and its answer.

**Server and schema**

1. **One new service, `server/services/moduleOpenings.js`, that takes the route's connection and has no connection or
   `_setTestDb` seam of its own.** The handoff and the brief suggested a `_setTestDb` seam. Not adopted: the mint
   (`servedVersions.recordServe`, PR1 Task 5) already runs on `segmentEditor.getDb()` (`segmentEditorService.js:29`,
   exported by PR1 Task 6), which `segmentEditor._setTestDb` (`:1546`) already controls, and PR1's own rule is that
   "the caller passes the connection" (PR1 Task 5). One handle then holds the served versions, the assignment lookup and
   the opening. **The predicate's `users` lookup does not:** `userService.findByProviderId` runs on `userService`'s own
   connection (`getDb()`: its `_testDb`, else its own `new Database(DB_PATH)`, `userService.js:28-38`, `:57-71`), which
   in production opens the same file; it is a read before the opening's transaction, not part of it. The
   module has `_setTestClock(fn)` instead, so a test can set `opened_at_ms` to a sentinel. The route requires only
   this module; `userService` is required by the service (the route never required it: `grep -an userService
   server/routes/segment-editor.js` prints nothing at `ed10180c`).
2. **The migration (predicted `054-module-openings.js`; spec §13 leaves names and types to the plan).**
   - `module_openings`: `book TEXT`, `chapter INTEGER`, `module_id TEXT`, `opened_at_ms INTEGER CHECK (opened_at_ms >
     0)`, `inflight_count INTEGER CHECK (inflight_count >= 0)`, every column `NOT NULL`, `PRIMARY KEY (book, chapter,
     module_id)`. **No user column** (R3, spec §5.5).
   - `module_opening_inflight`: `book`, `chapter`, `module_id`, `segment_id TEXT`, `occurrence INTEGER CHECK
     (occurrence >= -1)`, every column `NOT NULL`, `PRIMARY KEY (book, chapter, module_id, segment_id, occurrence)`,
     and `FOREIGN KEY (book, chapter, module_id) REFERENCES module_openings (book, chapter, module_id) ON DELETE
     CASCADE`. Nothing else: no origin, no editor, no time (R3).
   - **Why the foreign key, with a cascade:** a snapshot row means nothing without its opening, and foreign keys are
     ON in this build (CLAUDE.md § Tech Stack), so the reference refuses an orphan; the cascade lets a later retention
     rule (G1.15) delete an opening and its snapshot in one statement. PR2 itself deletes nothing. **✅ [USER]
     approved the foreign key with its cascade on 2026-11-04:** deleting an opening deletes its snapshot.
   - No index beyond the two primary keys' automatic ones (`sqlite_autoindex_module_openings_1`,
     `sqlite_autoindex_module_opening_inflight_1`, measured): every read is by the full key.
   - **One transaction inside one never-throw boundary** (`048`'s and PR1 Task 3's shape). A failure leaves neither
     table, warns once, and the next boot retries; `checks.schema` names a missing table (Task 1).
   - **The never-throw test's fault is a same-named INDEX, not a VIEW** (measured, State of this plan): a VIEW named
     `module_opening_inflight` makes the migration report success with no table behind the name.
   - **No `segment_edits` column,** so `server/__tests__/helpers/segmentEditsSchema.cjs` and PR1's `ALLOWED_COLUMNS`
     are untouched; Task 1 re-runs PR1's drift guard to show it.
3. **The predicate, cheapest and person-specific first** (spec §5.5): `researchScope.isStudyBook(book)` (pure) →
   `userService.findByProviderId(req.user.id)` (`userService.js:57-71`; the token carries the provider id,
   `requireAuth.js:52-53`, `requireRole.js:274`) → a **direct** lookup `SELECT 1 FROM user_chapter_assignments WHERE
   user_id = ? AND book_slug = ? AND chapter = ?` (the table of `010-chapter-assignments.js:17-26`) → the opening-row
   lookup. Not `hasChapterAccess` (`userService.js:629-679`, fail-open at `:632-635`, `:641-647`, `:664-666`, `:678`)
   and not `requireBookAccess` (`requireRole.js:257-259` admins, `:263-265` head editors); not migration 012's
   `chapter_assignments`, which nothing reads (`viewRouteContracts.test.js:185-187` pins its last reader's removal);
   not `enforce_assignments`, not the role, and not `users.is_active` (✅ approved as written by [USER] 2026-11-04: a
   deactivated account whose token is still valid opens a unit it holds an assignment row for, as the spec's predicate
   says). A falsy `findByProviderId` result is "no user": it returns `undefined` for no row and `null` when the `users`
   table is not ready (`:58`), and the predicate never creates a row (CLAUDE.md § Auth). The book check comes first, so
   a serve of any other book touches no table: Task 2 proves it on a closed handle (the route's connection) and with a
   spy on `findByProviderId` (`userService`'s, decision 1), which is not called. The opening-row lookup comes last, so a
   missing `module_openings` affects only a serve by a user who holds an assignment row.
4. **A predicate that throws, on a study-book serve, answers 503 (cause `predicate`).** For a throw in the opening-row
   lookup (reached only by a user with a users row and an assignment row) this is spec §5.4's "the opening step cannot
   run". **For a throw in the `users` or assignment lookup it is a reading of §5.4. ✅ Approved by [USER] 2026-11-04
   (spec AMENDED 2026-11-04).** The route cannot tell whether this serve is the one the record depends on, and §3's
   anti-goal ("the opened time is set by a serve that is not an assigned editor's"; "no editor works on a unit whose
   opening … was not recorded", §5.4) favours refusing. The fallback, for the record, was to treat such a throw as
   "does not meet the predicate" (200, logged at error), PR1's fail-soft. In practice both lookups throw only on a
   damaged database, which already fails every write route (`requireRole.js:276-288` maps the assignment failure to 503
   or rethrows).
5. **The snapshot** (spec §5.5 step 2; T7) is a pure function, `snapshotRows(segments, edits)`, over the route's
   every-editor rows (`routes/segment-editor.js:279`, `segmentEditorService.js:239-253`, `SELECT *` by book and
   module only, so a chapter-metadata load holds every chapter's rows). It keeps an edit when its `segment_id` is one
   of the ids served in this load **and** `isEditInFlight(edit)` (`accept-eligibility.js:41-43`, required as a UMD
   module, `:79`): any in-flight edit, not only the newest (spec §14 call 6). Its occurrence is the edit row's
   `occurrence` (PR1 Task 3's column) when it is an integer, else `-1` ("every occurrence of the id", §5.5). **A `-1`
   row subsumes that id's specific-occurrence rows**, so an id with one legacy row and one PR1-era row is one row,
   not two. Rows are sorted by (segment id, occurrence).
   - **`inflight_count` is the number of snapshot rows written.** §5.5 says "how many segments the snapshot holds";
     with subsumption that is one per id for every id until G1.12 (b) lets two occurrences of one id carry rows of
     their own. Task 2 asserts both `inflight_count === rows.length` and, on its fixture, the number of distinct ids.
   - **The warning list** is the sorted ids holding at least one kept edit whose `origin` is not `'re-attach'`;
     `NULL` counts as not re-attach (spec §5.5; the brief).
   - It does **not** filter on the edit row's `chapter`: the module response keys a segment's edits by `segment_id`
     alone (`:290-296`), so the snapshot holds exactly the in-flight rows the serve displayed. Chapter-metadata ids
     carry their chapter (`chapter:title:ch02`, measured), so ch05's rows never match a ch02 serve.
6. **The step, `recordOpening(conn, key, snapshot)`,** in one `sessions.db` transaction: `INSERT INTO
   module_openings (…, opened_at_ms, inflight_count) VALUES (…, clock(), rows.length) ON CONFLICT (book, chapter,
   module_id) DO NOTHING`; only when `changes === 1`, one plain `INSERT` per snapshot row. **Not `INSERT OR IGNORE`:**
   `OR IGNORE` also swallows a `CHECK` or `NOT NULL` violation (measured, State of this plan), which `openOnServe`
   would then read as "a racing serve won", answer 200 and record nothing: fail-open against §5.4. The `ON CONFLICT`
   target ignores only the key conflict, which is what §5.5's step 1 ("insert the opening row if none exists") means;
   this is the plan's reading. A bad value (a clock of 0, a `NULL` chapter) throws, rolls back and answers 503
   (`step`). §5.5's step 3 ("write `inflight_count`") is folded into step 1's statement: the
   count is known before the insert, because the snapshot is computed from rows already in memory, and an ignored
   insert writes nothing either way. Plain `INSERT` for the snapshot, so a duplicate (impossible after the `Set`)
   fails loud and rolls the opening back rather than recording half a snapshot. It returns `{ opened: false }` or
   `{ opened: true, inflightCount, inflight, warnSegments }`, **never the time** (spec §11; T17).
7. **The 503 decision lives in the service, `openOnServe(conn, input)`, which never throws.** Its result is
   `{ status: 'skipped', reason }` (the predicate does not hold: `not-study-book`, `no-user`, `no-assignment`,
   `already-opened`; or the insert was ignored), `{ status: 'unrecorded', cause }` (`predicate`, `mint`, `step`), or
   `{ status: 'opened', opening }`. `mint` is the predicate holding while PR1's `served.mintOk !== true` (spec §5.4:
   "if the predicate holds and step 3 failed"); the step is then not attempted. The route maps only `unrecorded`.
   Every `skipped` serve, whatever `mintOk` says, is answered exactly as PR1 answers it (PR1's handoff: "a failed mint
   on any other serve still answers 200 with `baseSha256`").
8. **The 503 body is `{ error: 'OPENING_UNRECORDED', message }`,** the shape of PR1's refusals (`{ error: err.code,
   message }`, PR1 Task 14's `sendRefusal`). The code, status and Icelandic message live in one constant,
   `moduleOpenings.OPENING_UNRECORDED`, not in `servedEdit.js`'s tables, which PR1's handoff says PR2 must not change.
   `unrecorded` logs once at error, with `{ err: { code, message }, cause, book, chapter, moduleId }`: no user id, no
   text, no time.
9. **The warning** is `log.warn({ book, chapter, moduleId, segments }, …)`, once, after the opening's commit, only when
   the warning list is non-empty (spec §5.5). Segment ids only. A later serve never warns again, because only an
   inserting serve reaches it.
10. **A failed mint is planted with a trigger on `served_text_versions`, not with PR1's read-only handle** (PR1 Task 6's
    fail-soft test). A read-only handle would also fail the opening insert, so a route that ignored `served.mintOk`
    would still answer 503 and the test could not tell it apart; with the trigger, only the mint fails, and a route
    that ignored `mintOk` would set the opening row and answer 200.
11. **PR3's seam is a tested function, not a call:** `moduleOpenedDetail(served, opening) → { servedVersionIds,
    duplicatedIds, inflightCount }`, the detail spec §5.9's `module-opened` row lists, plus a comment in the route
    marking where PR3 calls `record`. PR2 does not call it (no event before PR3, index decision 2; no unused variable
    for `no-unused-vars`, `eslint.config.js:40`).
12. **The module response is unchanged.** `openOnServe`'s result never reaches `res.json`; PR1's `MODULE_JSON_ALLOWED`
    gains nothing (PR1's handoff). T17's PR2 half adds a value check (a sentinel opened time is absent from the body
    of the very serve that recorded it), because PR1's `FORBIDDEN_KEY` matches key names only.

**Client**

13. ✏️ *Mechanism amended 2026-11-05, after the whole-branch review: "State of this plan", amendment item 4. The
    sub-bullets below state the mechanism as first planned; where they differ, item 4 is the code.*
    **`loadModule`'s error path picks a client string for the code** (spec §5.4, §13: `OPENING_UNRECORDED` "tells the
    editor to open the unit again"). `fetchJson` builds `err.message` from `data.error || data.message`
    (`htmlUtils.js:48`) and attaches `err.status` and `err.data` (`:53-54`), so with the server's body the generic
    alert would read *Villa við að hlaða einingu: OPENING_UNRECORDED*. The catch (`segment-editor.js:303-307`) shows
    `UI.segmentEditor.openingUnrecorded` when `err.status === 503 && err.data && err.data.error ===
    'OPENING_UNRECORDED'`, else today's text. It still restores the module list and retries nothing.
    - **A reload from an open pane takes the pane away** (spec §5.4, T6's "the editor cannot save in between"). The
      catch shows `#module-selector` but **never hides `#editor-container`** (`segment-editor.js:303-307`; only the Back
      handler does, `:2232`), and `loadModule` reloads from an open pane at `:1715`, `:1722`, `:1774`, `:2054` (after
      every successful save), `:2065`, `:2151`, `:2167`, `:2181`, `:2219` and `:3059`, and in PR1 Task 19's refused
      save (`keepText` → `loadModule(currentModuleId, { force: true })`). A serve that meets the predicate can be such a
      reload: a page loaded before its editor was assigned saves (the save route does not consult openings), and
      `:2054` reloads. Left alone, the 503 would show the module list **and** the old, saveable rows. So on the
      `OPENING_UNRECORDED` path, **when `#editor-container` is on screen**, the catch: calls `saveDraft()` (the write
      the draft timer makes every 5 s, so text typed since the last tick is kept); stops the draft timer; empties
      `dirtyEdits`; calls `tabGuard.release()`; and hides `#editor-container` and `#save-status-bar`, as Back does.
      The timer must stop, because `saveDraft` removes the tab's draft when nothing is dirty or held
      (`segment-editor.js:84-87`; PR1 Task 18's version, `Object.keys(entries).length === 0`, and Task 19 adds the held
      texts), so a tick after
      `dirtyEdits.clear()` would delete what was just written. `dirtyEdits` must empty for PR1's reason at Back: the
      next load would otherwise meet hidden panes still marked dirty and ask `closePanels` about panes nobody can see.
    - **It discards no draft:** no `clearDraft` (Back's discard) and no `clearDraftsByPrefix`, and `heldDrafts` and
      `paneState` stay. A text PR1 kept from a refused save is already in the draft before its reload (PR1 decision
      31, `keepText`), stays in `heldDrafts`, and comes back through `renderSegments`' carry-over and
      `reinstallHeldDrafts` when the editor opens the unit again; an ordinary dirty pane's text comes back through
      `restoreDraft`'s offer. (If the editor opens a different unit instead, PR1's carry-over holds those kept texts as
      it does after any failed reload; no row there matches them, so they never install, and they stay in this unit's
      draft.) **On a first load nothing is on screen and the branch is skipped:** `saveDraft` there,
      with nothing dirty, would remove this tab's draft key, which can hold a text Back kept (PR1 Task 19's
      `clearDraft` → `writeDraft(kept)`).
    - **Any other load error keeps today's behaviour,** a reload's 500 included, which still leaves the pane on screen
      beside the module list. That is a pre-existing defect outside PR2; Task 4's E2E control asserts it, so the new
      branch is shown to be keyed on the code. **✅ Approved as written by [USER] 2026-11-04:** only
      `OPENING_UNRECORDED` takes the pane away in this PR.
14. **E2E gains one spec whose 503s are stubbed; the seed and the logins are unchanged.** No `users` row exists in E2E:
    `server/e2e/seed-fixture.js` inserts none and no spec creates one (`grep -rnaE "INSERT (OR IGNORE )?INTO
    (users|user_chapter_assignments)" server/e2e` prints nothing; the only `users` write, `rbac.spec.js:70`'s `PUT
    /api/admin/users/1`, expects 403), and logins are injected JWTs (`helpers/auth.js:54`, `loginAs(page, role,
    userId)`), not sign-ins. The default `sub`s are `99995`–`99999` (`:18-23`) and several specs pass their own
    (`concurrent-editing.spec.js:24-25`, `review-cycle.spec.js:27-28`, `editor-workflow.spec.js:38-39`,
    `ux-phase2.spec.js:115`), so whatever `sub` a spec passes, `findByProviderId` returns `undefined`. So **in E2E the
    predicate never holds**: every chemistry serve (`a4-coverage.spec.js:169`
    and the writer specs) runs the predicate's lookups and must still answer as before, which the existing specs prove;
    the real server never answers `OPENING_UNRECORDED` there, so the client's handling is proved against a
    `route.fulfill` stub (PR1 decision 37's precedent). **E2E does not prove** that an opening is recorded through the
    HTTP and cookie layer; Task 3's route tests drive the real handler, and its full middleware chain with real JWTs
    through `requireAuth`, without HTTP. **Seeding a `users` row and an assignment row into E2E, to prove an opening
    end to end, is a later change** ([USER] 2026-11-04), recorded in the register, not built in PR2.

**The probe (spec §9; index decision 14)**

15. **One script, `server/scripts/read-research-preconditions.js`, modelled on `server/scripts/read-apply-exposure.js`**
    (read-only, ids and counts only, sent on stdin), not on `read-pending-edits.js`, which has no test (`grep -rlna
    read-pending-edits server/__tests__ scripts/__tests__ tools/__tests__` prints nothing) and prints editor names
    (its `:10`). A `SECTIONS` table maps `G-1c` … `G-1g` to one reader each; each section runs inside its own
    try/catch and reports `{ ok: false, error }` instead of stopping the others; the database is opened once, lazily,
    `{ readonly: true, fileMustExist: true }`. Exit codes: `0` every section read, `1` any section failed, `2` usage.
    It runs `main` when `require.main === module` **or** under `node -` (`module.id === '[stdin]' &&
    process.argv[1] === '-'`, `read-apply-exposure.js:164-168`), sets `process.exitCode = 1` before `main` and the
    verdict after it, and writes its output with `process.stdout.write` (CLAUDE.md § Commands).
16. **The book is an argument, not a constant the probe owns:** `node - efnafraedi-2e`. A test pins the book named in
    the header's documented command to `researchScope.STUDY_BOOKS`. The probe does **not** require
    `server/lib/researchScope.js`, because Task 8 may run while production does not yet have PR1 deployed, and a
    stdin script resolves its requires against production's tree. A test pins the probe's require list to modules
    present at `ed10180c` (`better-sqlite3`, `dotenv`, `fs`, `path`, `child_process`, `../lib/dbPath`,
    `../lib/chapterLabel`, `../../tools/lib/mt-lock.cjs`).
17. **It reads PR1's `origin` column only when `PRAGMA table_info(segment_edits)` lists it,** for the same reason.
18. **It names no editor.** `users` as `{ id, role, active }`; chemistry's assignment rows as `{ userId, chapter }` (not
    `assigned_by`, not `assigned_at`); segments by id with counts; from `server/.env`, a systemd `Environment=` line and
    any `EnvironmentFile=`, only `AUTO_CREATE_USERS`; from nginx, only `access_log` lines; from logrotate, only rotation
    directives; from journald, only the retention keys. A test plants sentinel names, an email, a username, an
    `assigned_by`, a server name and two secrets, and finds none in the output, beside a control that the database and
    the files really hold them.
19. **Paths:** the server directory is derived from `require.resolve('../lib/dbPath')` (absolute in both a file run
    and a stdin run; it anchors on the same file that locates the database, so the books root and the database cannot
    disagree). The books root's test seam is `BOOKS_ROOT_OVERRIDE` (the precedent of `scripts/backfill-mt-locks.js:57`
    and `scripts/reattach-segment-edits.js:275`: test-only, never set in production). `etcRoot`, `varRoot`, `pathEnv`
    and `exec` are parameters of the exported function only; `main` passes `/etc`, `/var`, `process.env.PATH` and a
    never-throw `execFileSync` wrapper (5 s timeout).
20. **`AUTO_CREATE_USERS` "as the server reads it"** (spec §9 G-1d): the server reads `process.env`, which systemd
    fills from `Environment=` and `EnvironmentFile=` (a file's assignment overrides `Environment=`, a later file a
    former), and which `dotenv` fills from `server/.env` only where unset (`server/index.js:24`, cwd `server/`, the
    unit's `WorkingDirectory`). The probe reports all three and the effective value with its source; what a value
    *means* is `signInPolicy` in `server/services/auth.js:180-193` (CLAUDE.md § Auth), which the probe cannot require
    (`auth.js:28-30` throws without `JWT_SECRET`) and does not restate. The unit is `ritstjorn`
    (`scripts/deploy.sh:136`).
21. **G-1c also reports nginx's logrotate rotation lines** beside its `access_log` lines (a plan addition): the access
    log's retention is set there, and §6 item 14 and G1.15 need it.
22. **G-1g enumerates units from `02-for-mt`** (what the loader serves), every chapter directory including `ch00` and
    `appendices`, files ending `-segments.en.md` whose module id is one the route can serve (`/^(m\d{5}|chapter-metadata)$/`,
    `validateModule`, `validateParams.js:43`), and checks the sibling marker through `mtLockPathFor`
    (`tools/lib/mt-lock.cjs:9-11`). The suffix test skips the legacy `-segments(b).en.md` files; the id test also skips
    `exercises-segments.en.md`, which `listChapterModules` excludes by name as "not an editable module"
    (`segmentParser.js:419-421`). Chemistry holds no such file at `ed10180c` (`find books/efnafraedi-2e/02-for-mt -name
    exercises-segments.en.md` prints nothing), so this is latent.
    It reports presence only, never a marker's body: an act marker's `lockedAt` is the time of a person's first act
    (spec §5.19).
23. **The probe is two tasks:** the database half (G-1d, G-1e, the skeleton) and the system half (G-1c, G-1f, G-1g).
24. **Task 8 runs from the PR2 branch, before the merge.** The probe is sent on stdin, so it needs no deploy.

**Order and tests**

25. **Task order:** the migration (1), the service (2), the route with T6, T7 and T17's PR2 half (3), the client (4),
    the probe (5, 6), `close-pending-edits`' refusal (7), the production run (8). T17's PR2 `describe` lands with the route, because its positive control
    (the stored opened time equals the sentinel) is the red arm until the route records an opening.
26. **A full-chain helper, `invokeChain`, joins PR1's `server/__tests__/helpers/servedFixture.js`:** the visitor's 403
    and chapter 0's 400 are answered by middleware (`requireRole`, `validateBookChapter`), which PR1's `handlerFor`
    skips (it takes `route.stack.at(-1)`). The chain at `ed10180c` is `[requireAuth, requireRole, validateBookChapter,
    validateModule, handler]` (measured).
27. **`docs:check` runs and is expected clean:** Task 3 touches `server/routes/segment-editor.js` (the `check-docs`
    path filter, `.github/workflows/docs-check.yml:6-8`) but adds no `router.<verb>(` line. **Root `LICENSE` is
    unchanged:** the probe's `require('../../tools/lib/mt-lock.cjs')` is AGPL code using MIT code, not the MIT→AGPL
    edge (E-2) that file enumerates.
28. **Icelandic strings, both ✅ approved by [USER] 2026-11-04 as proposed** (index decision 13). A change to either
    after that date goes back to [USER] before the PR is opened.

    | Where | Key | Approved text |
    |---|---|---|
    | server, `moduleOpenings.OPENING_UNRECORDED.message` | `OPENING_UNRECORDED` (503) | *Ekki tókst að skrá opnun einingarinnar og því var hún ekki opnuð. Opnið eininguna aftur.* |
    | client, `server/public/js/ui-strings.js` | `UI.segmentEditor.openingUnrecorded` | *Ekki tókst að skrá opnun einingarinnar og því var hún ekki opnuð. Veljið hana aftur úr listanum.* |

**`close-pending-edits` (spec §5.6)**

29. **`server/scripts/close-pending-edits.js` refuses once a unit of its book has opened** (Task 7). Spec §5.6: the
    script "writes raw SQL (`:176-200`). It is meant to run before the study, under the hold. This design does not log
    its writes, so it must not run once any unit has opened." **Placed in PR2 by the index (its PR2 row)**, because PR2
    is where the record that makes it checkable first exists. The script already ran its one production write
    (register, 2026-10-25), so this is a guard on a re-run, not a change to anything done. **✅ [USER] confirmed on
    2026-11-04 that it is a code guard in the script,** not only an operational rule.
    - **The plan's reading of "any unit": a unit of the book the script is run for.** The script writes only that
      book's rows (it refuses a row of another book, `close-pending-edits.js:129`), and only a study book can hold an
      opening.
    - **A database without `module_openings` (before migration 054) counts as none opened,** so the script still runs
      on production before PR2's deploy. While that table is missing after the deploy, no unit can open: the
      opening-row lookup throws and the serve answers 503 (decision 4's first half, which is spec §5.4's own text).
    - It joins the script's existing `refuse(msg)` list (`:67-68`), so like every other check it runs in a dry run
      too, writes nothing when it fires, and names itself in the report. Fail-closed: any other error from the read
      throws, as the script's other reads do.

## Where the spec or the index disagrees with the tree

Each was checked at `ed10180c` (plus PR1 as its plan leaves it). None changes what the frozen spec says; each names
how this plan resolves it.

1. **Spec §5.4: "`loadModule` shows its load error and returns to the module list (`segment-editor.js:303-307`)".**
   False for a reload from an open pane: the catch shows `#module-selector` and never hides `#editor-container`, so the
   module list and the old, saveable rows are on screen together, and T6's "the editor cannot save in between" does
   not hold on that path. Resolved by Task 4 (decision 13), which makes the spec's sentence true for
   `OPENING_UNRECORDED`; any other load error keeps today's behaviour.

## Global Constraints (PR2)

The shared constraints are the index's (§ Global Constraints): test first and one commit per task; the gate is what CI
runs; module systems; better-sqlite3 only under `server/`; paths from `__dirname` or `resolveDbPath()`; never-throw
migrations; organic never; no research field in any column the module route sends; `process.exitCode` after output;
`grep -a`; a mutation check restores from a golden `cp`; nothing committed names a grant or fund; no count, test total
or CI verdict in prose. Read them there. For this PR, in addition:

- **Branch:** cut from `main` after PR1's merge (index decision 17; the executing session's harness may name it).
  Commit messages end with the executing session's attribution trailer lines, after a blank line.
- **Migration number:** `ls server/migrations` on the branch just before Task 1's commit and again just before merging
  (index decision 9). If `054` is taken, use the next free number everywhere Task 1 names it.
- **No test this PR adds writes under `books/` or to `pipeline-output/`.** The route tests set `SESSIONS_DB_PATH` to a
  temp file before any server `require` and `segmentParser._setTestBooksDir` to a temp root; they seed edits by SQL, so
  no first-edit hook writes an MT lock. The probe's tests use `freshMigratedDb()` and temp directories, and its
  spawned runs set `SESSIONS_DB_PATH` and `BOOKS_ROOT_OVERRIDE`. **Every test file that drives the module GET handler
  must set `SESSIONS_DB_PATH` before requiring the route:** from this PR the handler reaches
  `userService.findByProviderId`, whose connection opens `resolveDbPath()` (`userService.js:16`, `:29-37`), so a test
  without it would create `pipeline-output/sessions.db`. Run `git status --porcelain` after every test run.
- **The probe never runs against production except in Task 8, on [USER]'s go.**
- **No `segment_edits` column and no response key** (PR1's handoff). The drift guard and T17 prove both.
- **No research event, no `record`** (index decision 2): T6 and T7 have no event half (handoff §3 item 2). Nothing in
  PR2 can emit one, since `record` and the research file arrive with PR3; PR3's plan carries `module-opened`'s
  assertions.
- **Format:** `npx prettier --write` on each `.js` file a task creates or edits under `server/` before its commit
  (CI's Lint job runs `format:check` as well as `eslint`). The code blocks below show content, not final layout.
- **No dependency is added:** `dotenv` is already a dependency of `server/` (`server/package.json:27`).
- **Run vitest from the repository root**, one file per command where a step says so.

## Review Focus

Input cases the spec implies but its tests do not exercise directly. Each names the task that answers it.

1. **The predicate's fail-open neighbours** (index Review Focus 6): an admin, a head editor of the book, an editor with
   no row of their own while colleagues hold rows and enforcement is off (where `hasChapterAccess` passes, `:678`), and
   a still-valid token with no `users` row: none sets the opened time; the test asserts the neighbour would have let
   the zero-row editor through, so the predicate's "no" is its own. → Task 2, Task 3
2. **The row decides, not the role** (G1.23 §6.2): a `users` row with role `viewer` or `admin` that holds an assignment
   row meets the predicate (Task 2); through the route, an admin's serve opens the unit and a viewer's is stopped
   earlier, by `requireRole`, with 403 and no opening (Task 3, the viewer through the full chain). → Task 2, Task 3
3. **A predicate that cannot be evaluated:** with `module_openings` missing, a zero-row editor's serve answers 200
   with `baseSha256` (the opening lookup is never reached) and an assigned editor's answers 503 with no row (Task 2 on
   the service, Task 3 through the route); a book off the allowlist touches no table at all, the route's connection or
   `userService`'s (Task 2). → Task 2, Task 3
4. **An in-flight edit under a newer non-in-flight one** (spec §14 call 6): kept, although the client's display rule,
   which reads only the newest edit, would leave it out. → Task 2, Task 3
5. **One id, two in-flight rows of different vintages** (a legacy row with `occurrence` NULL and a PR1-era row with
   `0`): one `-1` row, not two; and a duplicated id with a legacy row: one `(id, -1)` row, not one per copy. → Task 2
6. **`chapter-metadata` across chapters:** the route's edit rows are per (book, module) only, so a ch02 serve holds
   ch05's rows; ch05's in-flight row never enters ch02's snapshot, and ch05 opens only on its own assigned serve.
   → Task 3
7. **After opening, the snapshot never moves:** rows that are later approved and applied, rejected or withdrawn leave
   it as it was, and a new in-flight edit after opening never joins it; the control recomputes the snapshot from
   today's rows and gets something else. → Task 3
8. **A failed attempt is never recorded late** (spec §5.5): after a 503, the next serve that meets the predicate takes
   the snapshot afresh, from the rows at that serve (Task 3). The editor whose serve answered 503 has no pane to save
   from: on a first load none was shown, and on a reload from an open pane Task 4 takes it away, which today's catch
   does not (disagreement 1). A save from a page loaded **before** they were assigned is still possible up to that
   reload (the save route does not consult openings), and an edit made then is in flight at the later opening and in
   its snapshot, which is the honest record G1.23 §6.3a wants. → Task 3, Task 4
9. **Two serves racing to open one unit:** the `ON CONFLICT … DO NOTHING` insert decides; the loser takes no snapshot,
   writes nothing, logs nothing and is `skipped`, which the route answers exactly as PR1 does (200). Task 2 plays the
   winner with a planted trigger, since the predicate's own lookup would otherwise end the loser first. → Task 2
10. **A layerless study module** (no MT and no faithful file): PR1 mints nothing and reports `mintOk: true`, so an
    assigned serve opens it with its snapshot; every write to it is still refused (`NO_LAYER`). → Task 3
11. **Chapter 0:** an assignment row for chapter 0 opens nothing, because `validateBookChapter` answers 400 before the
    handler (`validateParams.js:28-31`). → Task 3
12. **A page loaded before PR2's deploy** that meets the 503 shows *Villa við að hlaða einingu: OPENING_UNRECORDED*
    (its old catch prints `err.message`, built from `data.error`) and, on a reload, keeps the old pane on screen.
    Unreachable while
    chemistry holds no assignment rows (R6), which Task 8 measures. → Task 4
13. ✏️ *Amended 2026-11-05: the catch now empties `heldDrafts` and `paneState` after `saveDraft` (`leaveModule`), and
    the kept text comes back unasked from the draft; "State of this plan", amendment item 4.*
    **A refused save whose reload answers 503:** PR1's `keepText` has already written the text to the draft and holds
    it in `heldDrafts`. Task 4's catch discards no draft (it calls `saveDraft`, never `clearDraft`, and leaves
    `heldDrafts` and `paneState`), stops the draft timer before it empties `dirtyEdits` (so no later tick removes the
    draft), and takes the pane away. The text comes back when the editor opens the unit again. Task 4's pins cover the
    kept text; its E2E reopens the unit and gets an ordinary dirty pane's text back. → Task 4
14. **The probe on a production that does not have PR1 deployed:** no `origin` column (G-1e still lists in-flight
    segments) and no `researchScope.js` (the probe never requires it). → Task 5
15. **The probe sent on stdin** runs (not a silent no-op) and a run that dies before its verdict exits non-zero. → Task 5
16. **The probe never prints a secret:** the server's `.env`, the unit's `Environment=` and an `EnvironmentFile=` hold
    secrets beside `AUTO_CREATE_USERS`; only that key's value leaves the probe. → Task 5
17. **A value the opening's checks refuse** (a clock of 0): the insert throws and the serve answers 503 (`step`), never
    200 as if a racing serve had won. → Task 2
18. **`close-pending-edits` after an opening:** it refuses, in a dry run as in a write, and writes nothing; on a
    database before migration 054 it runs as before. → Task 7

## The T-tests this PR carries (index § Test placement)

| Test | Where in this PR | The half here (when split) |
|---|---|---|
| T6 opened time | Task 2 (the predicate's truth table and the 503 decision, on the service), Task 3 (every case of T6 through the route, the two 503s, the visitor's 403 and chapter 0 through the full middleware chain), Task 4 (the client half of "the editor cannot save in between": a reload that answers 503 takes the pane away, and its text stays in the draft) | whole; T6 has no event half (handoff §3 item 2) |
| T7 the snapshot | Task 2 (the computation and the warning list), Task 3 (the `m68664`-style fixture through the route: the set, its immutability after approve, reject and withdraw, the warning once, the re-attach-only control) | whole; T7 has no event half |
| T17 nothing reaches a browser | Task 2 (the service's results carry no time), Task 3 (the opening serve's module JSON: PR1's exact key sets and no trace of the sentinel time; no file under `server/routes/` names the opening tables; the 503 body's keys) | PR2's half (index decision 15) |

## Before Task 1: the tree check

Run these and compare; a difference is a reason to stop and re-derive the named task, not to proceed.

- [ ] **PR1 is merged and this branch is cut after it:** `git log --oneline -1 main` names PR1's merge commit, and
  `git merge-base --is-ancestor main HEAD && echo ok` prints `ok`.
- [ ] **The tree:** `git diff --name-only <PR1's merge> HEAD -- server tools scripts .github LICENSE` prints nothing. If
  it prints a file, re-derive every pin a task names in that file.
- [ ] **The migrations:** `ls server/migrations | tail -1` prints `053-served-text-versions.js` (so Task 1 takes
  `054`).
- [ ] **PR1's surfaces exist:** `ls server/lib/researchScope.js server/lib/schemaHealth.js
  server/services/servedVersions.js server/__tests__/researchBoundary.test.js server/__tests__/schemaHealth.test.js
  server/__tests__/helpers/servedFixture.js server/__tests__/servedBaseClientPins.test.js` lists all seven.
- [ ] **The seam:** `grep -an "PR2's opening step, goes HERE" server/routes/segment-editor.js` prints one line, and
  `grep -an "eslint-disable-next-line no-unused-vars -- PR2" server/routes/segment-editor.js` prints the line above
  `const served` (PR1 Task 6). `grep -anE "userService|accept-eligibility|module_openings"
  server/routes/segment-editor.js` prints nothing.
- [ ] **The tests that drive the module GET handler all set `SESSIONS_DB_PATH` first:** `grep -rlna
  "'/:book/:chapter/:moduleId'" server/__tests__` (at `ed10180c`: `acceptanceRoutes.test.js`; PR1 adds
  `servedServeHook`, `servedVersionsIntegrity`, `researchBoundary`, `segmentEditBackstop` and `servedSaveRoute`), and
  for each, `grep -an "SESSIONS_DB_PATH" <file>` shows the assignment above its first server `require`. A file that
  lacks it gets it in Task 3, before the route change.
- [ ] **E2E holds no account:** `grep -rnaE "INSERT (OR IGNORE )?INTO (users|user_chapter_assignments)" server/e2e`
  prints nothing.

---

### Task 1: the opening tables, and `checks.schema` reports them

Spec §5.5 (the tables), §5.20 (`checks.schema`), §13 (names and types), R3; index decisions 3, 9, 10; decision 2.

**Files:**
- Create: `server/migrations/054-module-openings.js` — `migrate(db)`, `up(db)` (the boundary). **First run `ls
  server/migrations` on the branch: if `054` is taken, use the next free number everywhere below (index decision 9).**
- Modify: `server/services/migrationRunner.js` — append `require('../migrations/054-module-openings')` after `053`
  (the list ends at `:84` at `ed10180c`; PR1 Task 3 appends `053` at `:85`).
- Modify: `server/lib/schemaHealth.js` (PR1 Task 4) — `EXPECTED_SCHEMA.tables` gains `module_openings` and
  `module_opening_inflight`, after `served_text_versions`.
- Test: `server/__tests__/migration054.test.js` (new; model: PR1's `migration053.test.js`),
  `server/__tests__/schemaHealth.test.js` (append one `it`).

**Interfaces:**
- Consumes: `freshMigratedDb()` (`server/__tests__/helpers/freshMigratedDb.js:83`), `checkSchema(db)` (PR1 Task 4).
- Produces: the schema in decision 2; `module.exports = { name: '054-module-openings', up(db) }`, `up` never throws;
  `EXPECTED_SCHEMA.tables.module_openings = ['book', 'chapter', 'module_id', 'opened_at_ms', 'inflight_count']`,
  `EXPECTED_SCHEMA.tables.module_opening_inflight = ['book', 'chapter', 'module_id', 'segment_id', 'occurrence']`.

- [ ] **Step 1: Write the failing tests**

`server/__tests__/migration054.test.js` (header as `importConcepts.test.js:9-11`; `m054 =
require('../migrations/054-module-openings')`; `shape = (db, t) => Object.fromEntries(db.pragma(\`table_info(${t})\`)
.map((c) => [c.name, [c.type, c.notnull, c.pk]]))`):

- `it('creates module_openings with the three-part key and no user column (R3)')` — on `freshMigratedDb()`,
  `shape(db, 'module_openings')` equals `{ book: ['TEXT', 1, 1], chapter: ['INTEGER', 1, 2], module_id: ['TEXT', 1, 3],
  opened_at_ms: ['INTEGER', 1, 0], inflight_count: ['INTEGER', 1, 0] }` (an exact object, so a `user_id` or
  `opened_by` column fails it).
- `it('creates module_opening_inflight with the five-part key and nothing else')` — `shape(db,
  'module_opening_inflight')` equals `{ book: ['TEXT', 1, 1], chapter: ['INTEGER', 1, 2], module_id: ['TEXT', 1, 3],
  segment_id: ['TEXT', 1, 4], occurrence: ['INTEGER', 1, 5] }`.
- `it('the key refuses a second opening and admits another chapter of chapter-metadata')` — insert
  `('efnafraedi-2e', 2, 'chapter-metadata', 1700000000000, 0)`; the same values again throw `/UNIQUE/`; chapter 5
  inserts (control); Task 2's statement, `INSERT INTO module_openings (…) VALUES (…) ON CONFLICT (book, chapter,
  module_id) DO NOTHING`, for chapter 2 with `opened_at_ms` `1800000000000` reports `changes === 0`, and `SELECT *
  FROM module_openings WHERE chapter = 2` still equals the first row by value; the same statement for a new key
  (chapter 7) with `opened_at_ms` `0` throws `/CHECK/` (it ignores only the key conflict, decision 6).
- `it('the checks refuse what the columns cannot mean')` — an inflight row with `occurrence` `-1` inserts (under an
  existing opening); `-2` throws `/CHECK/`; an opening with `opened_at_ms` `0` throws `/CHECK/`; with `inflight_count`
  `-1` throws `/CHECK/`.
- `it('a snapshot row needs its opening, and goes with it')` — an inflight row for an opening that does not exist
  throws `/FOREIGN KEY constraint failed/`; with openings for chapters 2 and 5 and one inflight row under each, `DELETE
  FROM module_openings WHERE chapter = 2` leaves `SELECT chapter, segment_id FROM module_opening_inflight` equal to
  exactly the chapter-5 row (control: the cascade took only its own child).
- `it('is idempotent: a second start changes nothing and warns nothing')` — `vi.spyOn(console, 'warn')`; the
  `sqlite_master` `sql` column ordered by `name` is equal before and after a second `m054.up(db)`; `warn` not called.
- `it('never throws: a failing step rolls the unit back, warns once, and the next start completes it')` — on `new
  Database(':memory:')`: `CREATE TABLE decoy (a INTEGER); CREATE INDEX module_opening_inflight ON decoy (a)` (comment:
  *an INDEX of that name fails `CREATE TABLE IF NOT EXISTS`; a VIEW would not — it satisfies `IF NOT EXISTS` with no
  table behind the name, measured 2026-11-03*); `expect(() => m054.up(db)).not.toThrow()`; `warn` called once, its
  first argument matching `/^\[054\]/`; `SELECT name FROM sqlite_master WHERE name = 'module_openings'` is `[]` (the
  first table rolled back with the second). Then `DROP INDEX module_opening_inflight` and `m054.up(db)`: both tables
  exist, and `warn` was not called again (the control: the same migration completes once the fault is gone).
- `it('is registered in migrationRunner after 053')` — as `migration043.test.js:70-76`.

`server/__tests__/schemaHealth.test.js`, appended:

- `it('PR2: a missing opening table is named')` — on a fresh migrated database, `DROP TABLE module_opening_inflight`;
  `checkSchema(db)` equals `{ ok: false, missing: ['module_opening_inflight'] }`. (PR1's `it('a fresh migrated database
  is ok')` is this test's positive control and must still pass after the change.)

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/migration054.test.js server/__tests__/schemaHealth.test.js`
Expected: FAIL — `migration054.test.js`: `Cannot find module '../migrations/054-module-openings'`;
`schemaHealth.test.js`: the new case's `DROP TABLE module_opening_inflight` throws `no such table` (no migration
creates it yet). PR1's cases pass.

- [ ] **Step 3: Implement the migration and register it; see `checks.schema` miss it**

`server/migrations/054-module-openings.js`:

```js
/**
 * Migration 054: the opening record (G1.1 + G1.2 spec §5.5; PR2).
 *
 * module_openings: one row per (book, chapter, module_id), written once, at the module's first serve to a user who
 * holds a user_chapter_assignments row for that chapter (server/services/moduleOpenings.js). The chapter is in the
 * key because chapter-metadata is one module id for 21 chapters; appendices are -1. NO user column (R3): who opened
 * a unit is research data, captured only as PR3's module-opened event, for a consenting editor. opened_at_ms is read
 * on the server only (spec §11). inflight_count is how many snapshot rows the opening wrote.
 *
 * module_opening_inflight: the G1.23 §6.3a snapshot, the served segments that held an in-flight edit (pending, or
 * approved and not applied) from any editor at that serve. occurrence -1 means every occurrence of the id, because
 * rows made before G1.1 carry no occurrence. The foreign key refuses a snapshot row without its opening; foreign keys
 * are ON in this build (CLAUDE.md § Tech Stack), so ON DELETE CASCADE is live and a later retention rule (G1.15)
 * deletes an opening and its snapshot in one statement.
 *
 * Never throws (CLAUDE.md § Tech Stack, migration 048): migrationRunner calls up() on every start, and a throw would
 * stop the server booting. Both tables are created in one transaction, so a failure leaves neither, and /api/health's
 * checks.schema names the missing table (server/lib/schemaHealth.js).
 */
function migrate(db) {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS module_openings (
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        opened_at_ms INTEGER NOT NULL CHECK (opened_at_ms > 0),
        inflight_count INTEGER NOT NULL CHECK (inflight_count >= 0),
        PRIMARY KEY (book, chapter, module_id)
      );
      CREATE TABLE IF NOT EXISTS module_opening_inflight (
        book TEXT NOT NULL,
        chapter INTEGER NOT NULL,
        module_id TEXT NOT NULL,
        segment_id TEXT NOT NULL,
        occurrence INTEGER NOT NULL CHECK (occurrence >= -1),
        PRIMARY KEY (book, chapter, module_id, segment_id, occurrence),
        FOREIGN KEY (book, chapter, module_id)
          REFERENCES module_openings (book, chapter, module_id) ON DELETE CASCADE
      );
    `);
  })();
}

module.exports = {
  name: '054-module-openings',
  up(db) {
    try {
      migrate(db);
    } catch (err) {
      console.warn(
        `[054] MIGRATION COULD NOT COMPLETE — ${err.code || err.name}: ${err.message}. NOTHING WAS APPLIED: ` +
          'both tables are created in one transaction, rolled back on failure. While module_openings is missing, ' +
          'a chemistry serve by an editor who holds an assignment row answers 503 OPENING_UNRECORDED (no unit ' +
          'opens unrecorded), every other serve is answered as before, and /api/health reports checks.schema not ' +
          'ok. It re-attempts on every server start. NOT THROWN ON PURPOSE: throwing here would stop this server ' +
          'starting at all.'
      );
    }
  },
};
```

Append the `require` to `migrationRunner.js`'s list after `053`.

Run: `npx vitest run server/__tests__/migration054.test.js server/__tests__/schemaHealth.test.js`
Expected: `migration054.test.js` PASSES; `schemaHealth.test.js`'s new case FAILS — it gets `{ ok: true, missing: [] }`
with the table dropped, because `EXPECTED_SCHEMA` does not list it (the check's own red arm on the real table).

Then, in `server/lib/schemaHealth.js`, add the two entries of "Interfaces" to `EXPECTED_SCHEMA.tables` after
`served_text_versions`, each with a `// PR2 (spec §5.5)` comment; the deep freeze and `checkSchema` are unchanged
(PR1's handoff: "`server/index.js`'s `checks.schema` block needs no change").

- [ ] **Step 4: Run everything this commit touches, and the guards that must not move**

Run: `npx vitest run server/__tests__/migration054.test.js server/__tests__/schemaHealth.test.js
server/__tests__/migrationIdempotency.test.js server/__tests__/migrationRunnerCoverage.test.js
server/__tests__/startup.test.js`
Expected: PASS.

Run: `npx vitest run server/__tests__/segmentEditsSchemaDrift.test.js server/__tests__/researchBoundary.test.js`
Expected: PASS, unchanged: `054` adds no `segment_edits` or `segment_acceptances` column, so PR1's drift guard reports
`[]` and its control still names the planted column, and PR1's `ALLOWED_COLUMNS` describe is unchanged.

Then `npm test`: diff the failing set by name against `main`'s; expected no new names. `git status --porcelain`: only
this task's files.

- [ ] **Step 5: Commit**

```bash
git add server/migrations/054-module-openings.js server/services/migrationRunner.js server/lib/schemaHealth.js \
  server/__tests__/migration054.test.js server/__tests__/schemaHealth.test.js
git commit -m "feat(server): module_openings and module_opening_inflight (migration 054)"
```

---

### Task 2: the opening service: the predicate, the snapshot, the step and the 503 decision

Spec §5.4 (step 4, fail-closed opening), §5.5 (the predicate, the step, the warning, "after commit"), §5.9
(`module-opened`'s detail), §11 (no time in a response), R3; T6 (service half), T7 (service half), T17 (the service's
results carry no time); index decisions 1, 2; decisions 1, 3–9, 11.

**Files:**
- Create: `server/services/moduleOpenings.js` — `OPENING_UNRECORDED`, `openingPredicate`, `snapshotRows`,
  `recordOpening`, `openOnServe`, `moduleOpenedDetail`, `_setTestClock`; internal `unrecorded`
- Test: `server/__tests__/moduleOpenings.test.js` (new)

**Interfaces:**
- Consumes: `isStudyBook(book)` (`server/lib/researchScope.js`, PR1 Task 2); `userService.findByProviderId(providerId)`
  (`userService.js:57-71`); `isEditInFlight(edit)` (`server/public/js/accept-eligibility.js:41-43`, CommonJS export
  `:79`); `server/lib/logger` (pino: `log.warn(obj, msg)`, `log.error(obj, msg)`); a better-sqlite3 handle passed in.
- Produces (exact shapes in "Interfaces produced for later PRs"):
  - `OPENING_UNRECORDED: Readonly<{ status: 503, code: 'OPENING_UNRECORDED', message: string }>`
  - `openingPredicate(conn, { book, chapter, moduleId, providerId }) → { holds: boolean, reason: 'not-study-book' |
    'no-user' | 'no-assignment' | 'already-opened' | 'holds' }` (may throw on a damaged database)
  - `snapshotRows(segments, edits) → { rows: { segmentId, occurrence }[], warnSegments: string[] }` (pure)
  - `recordOpening(conn, { book, chapter, moduleId }, snapshot) → { opened: false } | { opened: true, inflightCount,
    inflight, warnSegments }` (one transaction; throws on failure, rolled back)
  - `openOnServe(conn, { book, chapter, moduleId, providerId, served, segments, edits }) → { status: 'skipped', reason }
    | { status: 'unrecorded', cause: 'predicate' | 'mint' | 'step' } | { status: 'opened', opening }` (never throws)
  - `moduleOpenedDetail(served, opening) → { servedVersionIds, duplicatedIds, inflightCount }` (pure; PR3's seam)
  - `_setTestClock(fn | null)`

- [ ] **Step 1: Write the failing test** (`server/__tests__/moduleOpenings.test.js`)

Header as `importConcepts.test.js:9-11`. Set `process.env.SESSIONS_DB_PATH` to a path in a `mkdtempSync` directory
**before** any server `require` (a safety net: every database call below goes through `userService._setTestDb`, and a
slip must reach a temp file, never `pipeline-output/sessions.db`). Then:

```js
const Database = require('better-sqlite3');
const freshMigratedDb = require('./helpers/freshMigratedDb');
const userService = require('../services/userService');
const log = require('../lib/logger');
const { isEditInFlight } = require('../public/js/accept-eligibility');
const mo = require('../services/moduleOpenings');

const BOOK = 'efnafraedi-2e';
const T0 = 1_700_000_000_123;
let db;
beforeEach(() => {
  ({ db } = freshMigratedDb());
  userService._setTestDb(db);
  mo._setTestClock(() => T0);
});
afterEach(() => {
  mo._setTestClock(null);
  userService._setTestDb(null);
  vi.restoreAllMocks();
  db.close();
});
/** A users row the way the admin page creates one, with assignment rows (userService's own writers). */
function member(providerId, role, chapters = [], book = BOOK) {
  const u = userService.createUser({
    providerId, providerUsername: `${providerId}@skoli.example`, email: `${providerId}@skoli.example`, role,
  });
  for (const ch of chapters) userService.assignChapter(u.id, book, ch);
  return u;
}
const key = (over = {}) => ({ book: BOOK, chapter: 1, moduleId: 'm95001', ...over });
const pred = (providerId, over) => mo.openingPredicate(db, { ...key(over), providerId });
/** A segment_edits row as getModuleEdits returns it (only the fields the snapshot reads matter). */
const edit = (segment_id, over = {}) => ({
  segment_id, status: 'pending', applied_at: null, occurrence: null, origin: null, ...over,
});
```

The database is fresh for every `it`, so each `it` creates the members it names with `member(…)` (`p-ed1` is an
editor holding chapter 1, `p-zero` an editor with no row, as in the first case) and plants any trigger it uses.

- `describe('openingPredicate (spec §5.5; T6, service half)')`:
  - `it('holds only for a users row that holds an assignment row for this book and chapter')` — `member('p-ed1',
    'editor', [1])`, `member('p-zero', 'editor')`, `member('p-admin', 'admin')`, `const head = member('p-head',
    'head-editor'); userService.assignBookAccess(head.id, BOOK, 'head-editor')`. Then
    `[pred('p-ed1'), pred('p-zero'), pred('p-admin'), pred('p-head'), pred('p-ghost'), pred('p-ed1', { chapter: 2 })]
    .map((r) => r.reason)` equals `['holds', 'no-assignment', 'no-assignment', 'no-assignment', 'no-user',
    'no-assignment']`, and only the first has `holds: true`.
  - `it("the zero-row editor's no is the predicate's own: the fail-open neighbour would have let them in")` — with
    `p-ed1` and `p-zero` as above and enforcement off: `userService.isAssignmentEnforced(BOOK) === false`,
    `userService.hasChapterAccess(zero.id, BOOK, 1) === true` (`userService.js:678`), and `pred('p-zero').holds ===
    false`.
  - `it('enforcement changes nothing')` — `userService.setAssignmentEnforced(BOOK, true)`: `pred('p-ed1').holds ===
    true` and `pred('p-zero').holds === false`; the same after `setAssignmentEnforced(BOOK, false)`.
  - `it('the row decides, not the role (G1.23 §6.2)')` — `member('p-viewer-row', 'viewer', [1])` and
    `member('p-admin-row', 'admin', [1])` both give `holds: true`.
  - `it('a token with no users row is no user, and no row is created for it')` — `pred('p-ghost')` is `{ holds: false,
    reason: 'no-user' }`; `db.prepare("SELECT provider_id FROM users WHERE provider_id = 'p-ghost'").all()` equals
    `[]`.
  - `it('the legacy chapter_assignments table (migration 012) does not count')` — `const zero = member('p-zero',
    'editor'); const admin = member('p-admin', 'admin')`; `INSERT INTO chapter_assignments (book, chapter, stage,
    assigned_to, assigned_by) VALUES ('efnafraedi-2e', 1, 'linguisticReview', zero.id, admin.id)`; `pred('p-zero')
    .reason === 'no-assignment'`. Control in the same test: `userService.assignChapter(zero.id, BOOK, 1)` →
    `pred('p-zero').reason === 'holds'`.
  - `it('appendices are chapter -1')` — `member('p-app', 'editor', [-1])`: `pred('p-app', { chapter: -1 }).holds ===
    true`; `pred('p-app', { chapter: 1 }).holds === false`.
  - `it('a book off the study allowlist never holds')` — `member('p-bio', 'editor', [1], 'liffraedi-2e')`:
    `pred('p-bio', { book: 'liffraedi-2e' })` is `{ holds: false, reason: 'not-study-book' }`.
  - `it('an existing opening ends it')` — `member('p-ed1', 'editor', [1])`; insert the opening row for `key()`;
    `pred('p-ed1').reason === 'already-opened'`.
  - `it('a book off the allowlist touches no table: a closed handle, and no users lookup')` — `const lookup =
    vi.spyOn(userService, 'findByProviderId')` (the service calls it through the module object, so the spy intercepts
    it); `const closed = new Database(':memory:'); closed.close();` `mo.openingPredicate(closed, { ...key({ book:
    'liffraedi-2e' }), providerId: 'p-ed1' }).reason === 'not-study-book'` and `lookup` was not called. The closed
    handle shows the route's connection is untouched; the spy shows `userService`'s is too (decision 1: it is not the
    handle passed in, so the closed handle alone would pass with the users lookup moved first). Control:
    `member('p-ed1', 'editor', [1])`, and the same closed handle with `BOOK` throws (`/not open/`), because the
    assignment lookup runs on it, and `lookup` was called exactly once, with `'p-ed1'`.
  - `it('the opening lookup comes last: a missing module_openings refuses only a user who holds a row')` — `member(…)`
    for `p-ed1` (`[1]`) and `p-zero`; `DROP TABLE module_opening_inflight; DROP TABLE module_openings`;
    `pred('p-zero').reason === 'no-assignment'` (no throw), and `expect(() => pred('p-ed1')).toThrow(/no such
    table/)`.

- `describe('snapshotRows (spec §5.5 step 2; T7, service half)')` — the first case's two arrays are module-level
  constants, `SEGMENTS` and `EDITS`, and `snap = mo.snapshotRows(SEGMENTS, EDITS)` is what the later describes use:
  - `it('holds every served segment with any in-flight edit, keyed by the edit row’s occurrence or -1')` — segments
    `['s1', 's2', 's3', 's4', 's5', 's6', 'd', 'd'].map((segmentId, i) => ({ segmentId, occurrence: i === 7 ? 1 : 0
    }))`; edits, in `getModuleEdits`' order (newest first):
    `edit('s1')` (pending, legacy); `edit('s2', { status: 'approved', occurrence: 0, origin: 'editor-save' })`
    (approved, not applied); `edit('s2')` (a second, legacy pending row on the same id); `edit('s3', { status:
    'rejected', occurrence: 0, origin: 'editor-save' })` then `edit('s3')` (an older in-flight edit under a newer
    rejected one); `edit('s4', { occurrence: 0, origin: 're-attach' })`; `edit('s5', { status: 'approved', applied_at:
    '2026-06-12 16:00:00' })` (applied: not in flight); `edit('d')` (a duplicated id, legacy row);
    `edit('chapter:title:ch05')` (an id not served in this load). `snapshotRows(segments, edits)` equals `{ rows: [{
    segmentId: 'd', occurrence: -1 }, { segmentId: 's1', occurrence: -1 }, { segmentId: 's2', occurrence: -1 }, {
    segmentId: 's3', occurrence: -1 }, { segmentId: 's4', occurrence: 0 }], warnSegments: ['d', 's1', 's2', 's3'] }`.
    So: `s2`'s `0` row is subsumed by its `-1` row; `d` is one row for both copies; `s5`, `s6` and the unserved id are
    absent (the spec's positive control: a sibling with no row is not in it); `s4` is kept but does not warn.
  - `it('the any-edit rule is what keeps s3: its newest edit is not in flight')` — `isEditInFlight(edits.find((e) =>
    e.segment_id === 's3'))` (the newest, rejected) is `false`, and `isEditInFlight` of its older row is `true` (the
    control that the case discriminates the two rules, spec §14 call 6).
  - `it('a re-attached in-flight row alone warns nothing; beside a NULL-origin row it does')` — `[edit('s4', {
    occurrence: 0, origin: 're-attach' })]` gives `warnSegments: []` and `rows: [{ segmentId: 's4', occurrence: 0 }]`;
    adding `edit('s4')` gives `warnSegments: ['s4']` and `rows: [{ segmentId: 's4', occurrence: -1 }]`.
  - `it('nothing in flight: an empty snapshot')` — only `s5`'s applied row and a `rejected` row: `{ rows: [],
    warnSegments: [] }`.

- `describe('recordOpening (spec §5.5 steps 1–3)')`:
  - `it('writes the opening and its snapshot in one transaction, and returns no time')` — `r = mo.recordOpening(db,
    key(), snap)`; `r` equals `{ opened: true, inflightCount: 5, inflight:
    snap.rows, warnSegments: snap.warnSegments }`; `Object.keys(r).sort()` equals `['inflight', 'inflightCount',
    'opened', 'warnSegments']` (T17: no time leaves the service); `SELECT * FROM module_openings` equals `[{ book: BOOK,
    chapter: 1, module_id: 'm95001', opened_at_ms: T0, inflight_count: 5 }]`; `SELECT segment_id, occurrence FROM
    module_opening_inflight ORDER BY segment_id, occurrence` equals `snap.rows` mapped to `{ segment_id, occurrence }`;
    `inflight_count` equals the number of distinct ids in `snap.rows` (5) as well as its length (decision 5).
  - `it('a second call writes nothing, however much later and whatever it is given')` — after the first,
    `_setTestClock(() => T0 + 60_000)` and a different snapshot: returns `{ opened: false }`; both tables' `SELECT *`
    are equal by value before and after.
  - `it('a failed snapshot insert leaves no opening row')` — `CREATE TRIGGER planted BEFORE INSERT ON
    module_opening_inflight BEGIN SELECT RAISE(ABORT, 'planted fault'); END`; `recordOpening(db, key(), snap)` throws
    with `code === 'SQLITE_CONSTRAINT_TRIGGER'`; `SELECT * FROM module_openings` equals `[]`. Control in the same test:
    `recordOpening(db, key({ moduleId: 'm95002' }), { rows: [], warnSegments: [] })` under the same trigger returns
    `opened: true` (no snapshot insert fires, so the trigger is what failed the first).

- `describe('openOnServe (spec §5.4 step 4: when to answer 503)')` — `const MINTED = { mintOk: true,
  servedVersionIds: [{ segmentId: 's1', occurrence: 0, servedVersionId: 7 }], duplicatedIds: ['d'] }`, `const FAILED =
  { mintOk: false, servedVersionIds: null, duplicatedIds: [] }`, `run = (providerId, served, over, edits = EDITS) =>
  mo.openOnServe(db, { ...key(over), providerId, served, segments: SEGMENTS, edits })`; `let errorSpy, warnSpy;` and
  `beforeEach(() => { errorSpy = vi.spyOn(log, 'error'); warnSpy = vi.spyOn(log, 'warn'); })` inside this `describe`
  (the file's `afterEach` runs `vi.restoreAllMocks()`, which detaches a spy and empties its calls, so a spy made once
  for the `describe` would be dead in every `it` after the first; measured, State of this plan):
  - `it('a serve that does not meet the predicate is skipped, whatever the mint did (PR1 fail-soft stays)')` —
    `member('p-zero', 'editor')`: `run('p-zero', FAILED)` equals `{ status: 'skipped', reason: 'no-assignment' }`; no
    opening row; `errorSpy` not called.
  - `it('a failed mint on a serve that meets the predicate is unrecorded, and the step is not attempted')` —
    `member('p-ed1', 'editor', [1])`: `run('p-ed1', FAILED)` equals `{ status: 'unrecorded', cause: 'mint' }`; no
    opening row; `errorSpy` called once, its message matching `/OPENING_UNRECORDED/`, its object's keys a subset of
    `['err', 'cause', 'book', 'chapter', 'moduleId']` (no user, no provider id) and `cause === 'mint'`.
  - `it('a failed step is unrecorded, with nothing written')` — the trigger above; `run('p-ed1', MINTED)` equals `{
    status: 'unrecorded', cause: 'step' }`; no opening row.
  - `it('a value the checks refuse is a failed step, never a racing serve (decision 6)')` — `member('p-ed1', 'editor',
    [1])`; `mo._setTestClock(() => 0)`; `run('p-ed1', MINTED)` equals `{ status: 'unrecorded', cause: 'step' }`;
    `SELECT * FROM module_openings` equals `[]`; `errorSpy` called once with `cause: 'step'` and an `err.code` of
    `'SQLITE_CONSTRAINT_CHECK'`. Control in the same test: `mo._setTestClock(() => T0)`, the same `run` is `opened`
    and the row's `opened_at_ms` is `T0`. (Under `INSERT OR IGNORE` the first call would be `{ status: 'skipped',
    reason: 'already-opened' }`, a 200 with nothing recorded.)
  - `it('a racing serve that inserted first wins: the loser is skipped, writes no snapshot and logs nothing')` (Review
    Focus 9) — `member('p-ed1', 'editor', [1])`; plant the winner, `CREATE TRIGGER planted_race BEFORE INSERT ON
    module_openings WHEN NOT EXISTS (SELECT 1 FROM module_openings WHERE book = NEW.book AND chapter = NEW.chapter AND
    module_id = NEW.module_id) BEGIN INSERT INTO module_openings VALUES (NEW.book, NEW.chapter, NEW.module_id,
    1600000000000, 0); END` (the predicate saw no row, as a loser's does; the trigger's insert lands first and the
    statement's own `changes` is 0, measured); `run('p-ed1', MINTED)` equals `{ status: 'skipped', reason:
    'already-opened' }`; `SELECT * FROM module_openings` equals `[{ book: BOOK, chapter: 1, module_id: 'm95001',
    opened_at_ms: 1600000000000, inflight_count: 0 }]` (the winner's row, not this serve's); `SELECT * FROM
    module_opening_inflight` equals `[]` (`EDITS` hold five in-flight ids, so a loser that wrote its snapshot would
    show them); `errorSpy` and `warnSpy` not called. Control in the same test: `DROP TRIGGER planted_race`, then
    `run('p-ed1', MINTED, { moduleId: 'm95003' })` is `opened` with five snapshot rows. (A mutant that returns
    `unrecorded('step')` on the ignored insert fails the first assertion.)
  - `it('a predicate that cannot be evaluated is unrecorded (decision 4)')` — drop both tables; `run('p-ed1', MINTED)`
    equals `{ status: 'unrecorded', cause: 'predicate' }` and does not throw; control in the same test: `run('p-zero',
    MINTED)` is `skipped` (`no-assignment`).
  - `it('a serve that meets it and records it is opened, and warns once for the non-re-attach rows')` — `run('p-ed1',
    MINTED)` is `{ status: 'opened', opening: { opened: true, inflightCount: 5, … } }`; `warnSpy` called exactly once,
    with `{ book: BOOK, chapter: 1, moduleId: 'm95001', segments: ['d', 's1', 's2', 's3'] }` and a message matching
    `/re-attach/`; a second `run('p-ed1', MINTED)` is `{ status: 'skipped', reason: 'already-opened' }` and `warnSpy`
    is still at one call.
  - `it('an opening whose only in-flight row is re-attached warns nothing')` — `run('p-ed1', MINTED, {}, [edit('s4',
    { occurrence: 0, origin: 're-attach' })])`: opened, `warnSpy` not called. (The case above is its positive
    control.)
  - `it('never throws')` — on a closed handle with `p-ed1`: returns `{ status: 'unrecorded', cause: 'predicate' }`.

- `describe('moduleOpenedDetail (PR3’s seam; index decision 2)')`:
  - `it('carries exactly what the module-opened event lists (spec §5.9)')` — `mo.moduleOpenedDetail(MINTED, {
    inflightCount: 5 })` equals `{ servedVersionIds: MINTED.servedVersionIds, duplicatedIds: ['d'], inflightCount: 5
    }` (an exact object: no time, no user).

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/moduleOpenings.test.js`
Expected: FAIL — `Cannot find module '../services/moduleOpenings'`.

- [ ] **Step 3: Implement** `server/services/moduleOpenings.js` (CommonJS). Header: what an opening is and why it is
  set once (G1.23 §6.2, spec §5.5); why the lookup is direct and not `hasChapterAccess` or `requireBookAccess` (cite
  the fail-open lines of decision 3); why any in-flight edit and not the newest (spec §14 call 6); why the time never
  leaves this module (spec §11); why it takes the caller's connection (decision 1); that PR3 emits `module-opened`
  from the route with `moduleOpenedDetail` (index decision 2). Every `catch` returns or carries a comment
  (`activityLogCallsiteGuard.test.js` covers `server/services/`).

```js
const { isStudyBook } = require('../lib/researchScope');
const userService = require('./userService');
const { isEditInFlight } = require('../public/js/accept-eligibility');
const log = require('../lib/logger');

// The serve that meets the predicate but cannot record its opening (spec §5.4). Icelandic: approved by [USER]
// 2026-11-04 (index decision 13). Not in servedEdit.js's refusal tables, which PR2 does not change.
const OPENING_UNRECORDED = Object.freeze({
  status: 503,
  code: 'OPENING_UNRECORDED',
  message: 'Ekki tókst að skrá opnun einingarinnar og því var hún ekki opnuð. Opnið eininguna aftur.',
});

let clock = () => Date.now();
/** @internal Test-only: the source of opened_at_ms. */
function _setTestClock(fn) {
  clock = fn || (() => Date.now());
}

/** spec §5.5's predicate, cheapest and person-specific first (decision 3). May throw on a damaged database. */
function openingPredicate(conn, { book, chapter, moduleId, providerId }) {
  if (!isStudyBook(book)) return { holds: false, reason: 'not-study-book' };
  const user = userService.findByProviderId(providerId); // undefined: no row; null: no users table
  if (!user) return { holds: false, reason: 'no-user' };
  const assigned = conn
    .prepare(
      'SELECT 1 AS hit FROM user_chapter_assignments WHERE user_id = ? AND book_slug = ? AND chapter = ?'
    )
    .get(user.id, book, chapter);
  if (!assigned) return { holds: false, reason: 'no-assignment' };
  const opened = conn
    .prepare('SELECT 1 AS hit FROM module_openings WHERE book = ? AND chapter = ? AND module_id = ?')
    .get(book, chapter, moduleId);
  if (opened) return { holds: false, reason: 'already-opened' };
  return { holds: true, reason: 'holds' };
}

/** spec §5.5 step 2: every served segment holding ANY in-flight edit, from any editor (decision 5). Pure. */
function snapshotRows(segments, edits) {
  const served = new Set(segments.map((s) => s.segmentId));
  const byId = new Map();
  for (const e of edits) {
    if (!served.has(e.segment_id) || !isEditInFlight(e)) continue;
    const entry = byId.get(e.segment_id) || { occurrences: new Set(), warn: false };
    entry.occurrences.add(Number.isInteger(e.occurrence) ? e.occurrence : -1); // -1: every occurrence
    if (e.origin !== 're-attach') entry.warn = true; // NULL is not re-attach
    byId.set(e.segment_id, entry);
  }
  const rows = [];
  for (const [segmentId, { occurrences }] of byId) {
    if (occurrences.has(-1)) rows.push({ segmentId, occurrence: -1 }); // subsumes the id's specific rows
    else for (const occurrence of occurrences) rows.push({ segmentId, occurrence });
  }
  rows.sort((a, b) =>
    a.segmentId < b.segmentId ? -1 : a.segmentId > b.segmentId ? 1 : a.occurrence - b.occurrence
  );
  const warnSegments = [...byId].filter(([, v]) => v.warn).map(([id]) => id).sort();
  return { rows, warnSegments };
}

/** spec §5.5 steps 1–3, one transaction. Returns no time (spec §11). Throws on failure, rolled back. */
function recordOpening(conn, { book, chapter, moduleId }, { rows, warnSegments }) {
  return conn.transaction(() => {
    // ON CONFLICT on the key, never OR IGNORE: OR IGNORE would also swallow a CHECK or NOT NULL failure, which the
    // caller would then read as "a racing serve won" and answer 200 with nothing recorded (decision 6).
    const inserted =
      conn
        .prepare(
          `INSERT INTO module_openings (book, chapter, module_id, opened_at_ms, inflight_count)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (book, chapter, module_id) DO NOTHING`
        )
        .run(book, chapter, moduleId, clock(), rows.length).changes === 1;
    if (!inserted) return { opened: false };
    const add = conn.prepare(
      `INSERT INTO module_opening_inflight (book, chapter, module_id, segment_id, occurrence)
       VALUES (?, ?, ?, ?, ?)`
    );
    for (const r of rows) add.run(book, chapter, moduleId, r.segmentId, r.occurrence);
    return { opened: true, inflightCount: rows.length, inflight: rows, warnSegments };
  })();
}

function unrecorded(cause, err, { book, chapter, moduleId }) {
  log.error(
    { err: err ? { code: err.code, message: err.message } : null, cause, book, chapter, moduleId },
    `Opening could not be recorded: answered 503 ${OPENING_UNRECORDED.code} (spec §5.4)`
  );
  return { status: 'unrecorded', cause };
}

/** spec §5.4 step 4 and §5.5, for one serve. Never throws (decision 7). */
function openOnServe(conn, { book, chapter, moduleId, providerId, served, segments, edits }) {
  const key = { book, chapter, moduleId };
  let predicate;
  try {
    predicate = openingPredicate(conn, { ...key, providerId });
  } catch (err) {
    return unrecorded('predicate', err, key); // decision 4
  }
  if (!predicate.holds) return { status: 'skipped', reason: predicate.reason };
  if (!served || served.mintOk !== true) return unrecorded('mint', null, key); // "and step 3 failed"
  let opening;
  try {
    opening = recordOpening(conn, key, snapshotRows(segments, edits));
  } catch (err) {
    return unrecorded('step', err, key);
  }
  if (!opening.opened) return { status: 'skipped', reason: 'already-opened' }; // a racing serve won
  if (opening.warnSegments.length > 0) {
    // After the commit (spec §5.5): an in-flight row that re-attach did not write. Segment ids only.
    log.warn(
      { book, chapter, moduleId, segments: opening.warnSegments },
      'Module opened with in-flight edits that re-attach did not write (spec §5.5)'
    );
  }
  return { status: 'opened', opening };
}

/** The detail of PR3's module-opened event (spec §5.9), from the serve's mint and its opening. Pure. */
function moduleOpenedDetail(served, opening) {
  return {
    servedVersionIds: served.servedVersionIds,
    duplicatedIds: served.duplicatedIds,
    inflightCount: opening.inflightCount,
  };
}

module.exports = {
  OPENING_UNRECORDED, openingPredicate, snapshotRows, recordOpening, openOnServe, moduleOpenedDetail,
  _setTestClock,
};
```

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/moduleOpenings.test.js`, then `npx vitest run
server/__tests__/activityLogCallsiteGuard.test.js server/__tests__/acceptEligibility.test.js`
Expected: PASS. (`acceptEligibility.test.js` is the control that requiring `accept-eligibility.js` from a second
server module leaves its behaviour unchanged.)

- [ ] **Step 5: Commit**

```bash
git add server/services/moduleOpenings.js server/__tests__/moduleOpenings.test.js
git commit -m "feat(server): moduleOpenings: the opening predicate, snapshot and one-transaction step (G1.1)"
```

---

### Task 3: the module route records the opening, answers 503 when it cannot, and sends nothing new

Spec §5.4 (step 4, the 503, "every other … serve … is untouched"), §5.5 (facts the builder must keep), §11; T6 (route
half: every case), T7 (route half), T17 (PR2 half); PR1's handoff; index decisions 2, 15; decisions 7–12, 26.

**Files:**
- Modify: `server/routes/segment-editor.js` — require `moduleOpenings` beside the requires (`:40-49` at `ed10180c`);
  the module GET handler (`:264-332` at `ed10180c`, as PR1 Task 6 leaves it): hoist `const conn =
  segmentEditor.getDb();` above PR1's `recordServe` call and pass `conn` to it; delete PR1's `eslint-disable-next-line
  no-unused-vars -- PR2's opening step reads it` line; replace PR1's seam comment (immediately before `res.json({`) with
  the step, the 503 and PR3's seam comment.
- Modify: `server/__tests__/helpers/servedFixture.js` (PR1 Task 6) — new export `invokeChain(router, method,
  routePath, req)`.
- Test: `server/__tests__/moduleOpeningRoute.test.js` (new); `server/__tests__/researchBoundary.test.js` (append one
  `describe`).

**Interfaces:**
- Consumes: `moduleOpenings.openOnServe`, `.OPENING_UNRECORDED`, `._setTestClock`, `.snapshotRows` (Task 2); the
  route-local `served` (PR1 Task 6: `{ scope, duplicatedIds, rows, mintOk, servedVersionIds }`), `data.segments` (with
  `occurrence`, PR1 Task 5) and `edits` (every editor's rows, `:279`); `servedFixture.writeModule`, `handlerFor`,
  `invoke` (PR1 Task 6); `auth.createToken(user)` (`server/services/auth.js:283-298`).
- Produces: `GET /api/segment-editor/:book/:chapter/:moduleId` answers `503 { error: 'OPENING_UNRECORDED', message }`
  for a serve whose step is `unrecorded`, and otherwise exactly PR1's response; the route-local `step` (PR3's seam);
  `invokeChain(router, method, routePath, req) → Promise<{ status, body }>`.

- [ ] **Step 1: Write the failing tests**

`servedFixture.js`, added:

```js
/** Run a route's WHOLE middleware chain (requireAuth … handler) with a fake req/res; resolves on res.json. */
function invokeChain(router, method, routePath, req) {
  const layer = router.stack.find((l) => l.route && l.route.path === routePath && l.route.methods[method]);
  const handles = layer.route.stack.map((s) => s.handle);
  return new Promise((resolve, reject) => {
    const res = {
      statusCode: 200,
      status(c) { this.statusCode = c; return this; },
      json(body) { resolve({ status: this.statusCode, body }); },
    };
    let i = 0;
    const next = (err) => {
      if (err) return reject(err);
      const h = handles[i++];
      if (!h) return reject(new Error('chain ended without a response'));
      try { h(req, res, next); } catch (e) { reject(e); }
    };
    next();
  });
}
```

`server/__tests__/moduleOpeningRoute.test.js` — env before any server `require` (`segmentEditBackstop.test.js:48-51`):
`SESSIONS_DB_PATH` in a `mkdtempSync` directory and `JWT_SECRET`. `beforeAll`: `runAllMigrations()`; `db = new
Database(process.env.SESSIONS_DB_PATH)` (assertions and seeding); a temp books root through
`segmentParser._setTestBooksDir(root)` (restored in `afterAll`); `router = require('../routes/segment-editor')`; `get =
handlerFor(router, 'get', '/:book/:chapter/:moduleId')`; `auth = require('../services/auth')`. The file's other
bindings, all through `createRequire` after the env lines: `Database` (`better-sqlite3`), `runAllMigrations`
(`../services/migrationRunner`), `log` (`../lib/logger`), `userService`, `segmentEditor`, `segmentParser`,
`moduleOpenings`, `m054` (`../migrations/054-module-openings`) and `{ writeModule, handlerFor, invoke, invokeChain }`
(`./helpers/servedFixture`). `afterEach`: `moduleOpenings._setTestClock(null)`, `vi.restoreAllMocks()`, and `DROP
TRIGGER IF EXISTS` for the two planted triggers. Every spy is made in the `it` that reads it, or in a `describe`'s
`beforeEach` (the `afterEach` restore detaches a spy made earlier). Helpers:

```js
const BOOK = 'efnafraedi-2e';
const T0 = 1_700_000_000_123;
const serve = (user, moduleId, { chapter = '1', chapterNum = 1, book = BOOK } = {}) =>
  invoke(get, { params: { book, chapter, moduleId }, chapterNum, user });
const opening = (moduleId, chapter = 1, book = BOOK) =>
  db.prepare('SELECT * FROM module_openings WHERE book = ? AND chapter = ? AND module_id = ?')
    .get(book, chapter, moduleId);
const snapshot = (moduleId, chapter = 1) =>
  db.prepare(`SELECT segment_id, occurrence FROM module_opening_inflight
               WHERE book = ? AND chapter = ? AND module_id = ? ORDER BY segment_id, occurrence`)
    .all(BOOK, chapter, moduleId);
/** Seed a segment_edits row by SQL: no MT lock is written, nothing reaches books/. */
function addEdit({ moduleId, seg, chapter = 1, status = 'pending', appliedAt = null, origin = null,
                   occurrence = null, editor = 'ed-a', createdAt = '2026-06-16 10:00:00' }) {
  return db.prepare(
    `INSERT INTO segment_edits (book, chapter, module_id, segment_id, original_content, edited_content, status,
       editor_id, editor_username, created_at, applied_at, origin, occurrence)
     VALUES (?, ?, ?, ?, 'IS', 'IS breytt', ?, ?, ?, ?, ?, ?, ?)`
  ).run(BOOK, chapter, moduleId, seg, status, editor, editor, createdAt, appliedAt, origin, occurrence)
    .lastInsertRowid;
}
/** req.user as requireAuth builds it from this member's token (requireAuth.js:52-59). */
const asUser = (u, books = []) => ({ id: u.provider_id, username: u.provider_username, role: u.role, books });
const bearer = (user) => ({ authorization: `Bearer ${auth.createToken({ ...user, name: user.username, avatar: '' })}` });
```

Members (`userService.createUser` and `assignChapter`, as Task 2's `member`): `ed1` editor, chapters `[1, 2, -1]`;
`ed1b` editor, `[1]`; `ed5` editor, `[5]`; `zero` editor, no row; `admin` admin, no row; `head` head-editor with
`assignBookAccess(head.id, BOOK, 'head-editor')`, no row; `ch00` editor, `[0]`; `adminRow` admin, `[1]`; `viewerRow`
viewer, `[1]`; and `ed1` also holds `liffraedi-2e` chapter 1. A `ghost` user `{ id: 'p-ghost', username: 'ghost',
role: 'editor', books: [] }` has no row. Modules (`writeModule`, each with EN and MT, segments `a` and `b` unless
named): `ch01/m94001`, `m94003`, `m94004`, `m94007`, `m94008`, `m94010`, `m94011`, `m94012`, `m94013`, `m94014`;
`ch01/m94005` (EN only: layerless); `ch02/chapter-metadata` (`chapter:title:ch02`);
`ch05/chapter-metadata` (`chapter:title:ch05`); `appendices/m94009`; `ch00/m94000`; `liffraedi-2e/ch01/m94006`; and
the T7 module `ch01/m94020` with segments `m94020:para:s1` … `m94020:para:s6`, and `m94021`, `m94022` (one segment
each).

`describe('T6, opened time, through the route (spec §5.5, §10)')`:

- `it('an admin, a head editor, an editor with zero rows while enforcement is off and colleagues hold rows, and a token with no users row: each leaves the record unset')`
  — `serve(asUser(admin), 'm94001')`, `serve(asUser(head, [BOOK]), 'm94001')`, `serve(asUser(zero), 'm94001')` and
  `serve(ghost, 'm94001')` each answer 200 with `baseSha256` on every segment; `opening('m94001')` is `undefined`; `db.prepare("SELECT provider_id
  FROM users WHERE provider_id = 'p-ghost'").all()` equals `[]`; and the neighbour fails open here:
  `userService.isAssignmentEnforced(BOOK) === false` and `userService.hasChapterAccess(zero.id, BOOK, 1) === true`.
  Positive control, same test: `moduleOpenings._setTestClock(() => T0)`, `serve(asUser(ed1), 'm94001')` → 200, and
  `opening('m94001')` equals `{ book: BOOK, chapter: 1, module_id: 'm94001', opened_at_ms: T0, inflight_count: 0 }`.
- `it('a visitor gets 403 from the route, and records nothing')` — `invokeChain(router, 'get',
  '/:book/:chapter/:moduleId', { params: { book: BOOK, chapter: '1', moduleId: 'm94007' }, headers: bearer({ id:
  'ms-oid-visitor', username: 'gestur@skoli.example', role: 'viewer', books: [] }), cookies: {} })` → `{ status: 403
  }` with `body.error === 'Insufficient permissions'`; `opening('m94007')` is `undefined`. Positive control: the same
  chain with `bearer(asUser(ed1))` → 200 and `opening('m94007')` is set.
- `it("ch02's chapter-metadata opens ch02 only; ch05 opens on its own assigned serve, with its own snapshot")` —
  first `addEdit({ moduleId: 'chapter-metadata', chapter: 5, seg: 'chapter:title:ch05' })`. `serve(asUser(ed1),
  'chapter-metadata', { chapter: '2', chapterNum: 2 })` → 200; `SELECT chapter FROM module_openings WHERE module_id =
  'chapter-metadata' ORDER BY chapter` equals `[{ chapter: 2 }]` and `snapshot('chapter-metadata', 2)` equals `[]`
  (ch05's row, which this serve's edit rows hold, is not in it). `serve(asUser(ed1), 'chapter-metadata', { chapter:
  '5', chapterNum: 5 })` (not assigned ch05) leaves it `[{ chapter: 2 }]`. `serve(asUser(ed5), …ch05…)` → `[{
  chapter: 2 }, { chapter: 5 }]`, `snapshot('chapter-metadata', 5)` equals `[{ segment_id: 'chapter:title:ch05',
  occurrence: -1 }]`, and ch02's row is equal by value to its first read.
- `it('appendices are recorded under -1')` — `serve(asUser(ed1), 'm94009', { chapter: 'appendices', chapterNum: -1 })`
  → 200; `SELECT chapter FROM module_openings WHERE module_id = 'm94009'` equals `[{ chapter: -1 }]`.
- `it('chapter 0 cannot be served, so an assignment row for it opens nothing')` — `invokeChain(…, { params: { book:
  BOOK, chapter: '0', moduleId: 'm94000' }, headers: bearer(asUser(ch00)), cookies: {} })` → `{ status: 400 }`,
  `body.error === 'Invalid chapter: 0'` (`validateParams.js:28-31`); `SELECT * FROM module_openings WHERE module_id =
  'm94000'` equals `[]`. Positive control: `userService.assignChapter(ch00.id, BOOK, 1)`, then the chain on `/1/m94010`
  → 200 and `opening('m94010')` is set.
- `it('after it is set, a serve by anyone leaves it byte-identical')` — `_setTestClock(() => T0)`; `addEdit({ moduleId:
  'm94008', seg: 'm94008:para:a' })`; `serve(asUser(ed1), 'm94008')`; `const first = { row: opening('m94008'), snap:
  snapshot('m94008') }`. Then `_setTestClock(() => T0 + 60_000)`, `addEdit({ moduleId: 'm94008', seg: 'm94008:para:b',
  editor: 'ed-b' })`, and serves by `admin`, `head`, `zero`, `ghost`, `ed1`, `ed1b` and `ed5`, each 200. `{ row:
  opening('m94008'), snap: snapshot('m94008') }` equals `first` (`opened_at_ms === T0`; `b` did not join). Control:
  `serve(asUser(ed1b), 'm94011')` now records `opened_at_ms === T0 + 60_000`, so a re-write would have shown.
- `it('a failure in the snapshot insert leaves no opening row and answers 503; the next serve records it afresh')` —
  `addEdit({ moduleId: 'm94003', seg: 'm94003:para:a' })`; plant `CREATE TRIGGER planted_inflight BEFORE INSERT ON
  module_opening_inflight BEGIN SELECT RAISE(ABORT, 'planted fault'); END`; `serve(asUser(ed1), 'm94003')` → `{
  status: 503, body: { error: 'OPENING_UNRECORDED', message: moduleOpenings.OPENING_UNRECORDED.message } }` (exact:
  the body carries no other key, T17); `opening('m94003')` is `undefined` and `snapshot('m94003')` is `[]`. Then
  `addEdit({ moduleId: 'm94003', seg: 'm94003:para:b', editor: 'ed-b' })` and drop the trigger; `serve(asUser(ed1),
  'm94003')` → 200; `snapshot('m94003')` equals `[{ segment_id: 'm94003:para:a', occurrence: -1 }, { segment_id:
  'm94003:para:b', occurrence: -1 }]` (taken at this serve, not carried from the failed one).
- `it('a failed mint on a serve that meets the predicate answers 503 with no opening row; on any other serve it stays fail-soft')`
  — `errorSpy = vi.spyOn(log, 'error')`; plant `CREATE TRIGGER planted_mint BEFORE INSERT ON served_text_versions BEGIN
  SELECT RAISE(ABORT, 'planted mint fault'); END` (decision 10: not a read-only handle). `serve(asUser(admin),
  'm94004')` → 200, every segment carries `baseSha256`, and `SELECT id FROM served_text_versions WHERE module_id =
  'm94004'` equals `[]` (PR1's fail-soft, untouched for a serve that does not meet the predicate). `serve(asUser(ed1),
  'm94004')` → 503 `OPENING_UNRECORDED`; `opening('m94004')` is `undefined`; among `errorSpy`'s messages one matches
  `/Served-version mint failed/` (PR1) and one `/OPENING_UNRECORDED/` with `cause: 'mint'`. Drop the trigger;
  `serve(asUser(ed1), 'm94004')` → 200, `opening('m94004')` is set, and the served-version rows exist.
- `it('a layerless study module opens like any other: nothing to mint, nothing refused at the serve')` —
  `serve(asUser(ed1), 'm94005')` → 200, no segment carries `baseSha256`, and `opening('m94005')` has `inflight_count
  0`.
- `it('a book off the study allowlist never opens')` — `serve(asUser(ed1), 'm94006', { book: 'liffraedi-2e' })` → 200;
  `SELECT * FROM module_openings WHERE book = 'liffraedi-2e'` equals `[]` (the chemistry openings above are the
  control).
- `it('the row decides, not the role: an admin who holds a row opens the unit; a viewer who holds one is stopped by requireRole first')`
  (G1.23 §6.2; Review Focus 2) — `_setTestClock(() => T0)`; `serve(asUser(adminRow), 'm94012')` → 200, and
  `opening('m94012')` equals `{ book: BOOK, chapter: 1, module_id: 'm94012', opened_at_ms: T0, inflight_count: 0 }`.
  `invokeChain(router, 'get', '/:book/:chapter/:moduleId', { params: { book: BOOK, chapter: '1', moduleId: 'm94013' },
  headers: bearer(asUser(viewerRow)), cookies: {} })` → `{ status: 403 }` with `body.error === 'Insufficient
  permissions'`, and `opening('m94013')` is `undefined`. Control in the same test: the same chain with
  `bearer(asUser(adminRow))` → 200 and `opening('m94013')` is set, so the viewer's no is `requireRole`'s, not the
  chain's.
- `it('with the opening tables missing, an assigned serve answers 503 and a zero-row serve is answered as before')`
  (Review Focus 3; migration 054's warning text) — the last case of this `describe`, because it drops the tables:
  `let assigned, other; try { db.exec('DROP TABLE module_opening_inflight; DROP TABLE module_openings'); assigned =
  await serve(asUser(ed1), 'm94014'); other = await serve(asUser(zero), 'm94014'); } finally { m054.up(db); }`.
  `assigned` equals `{ status: 503, body: { error: 'OPENING_UNRECORDED', message:
  moduleOpenings.OPENING_UNRECORDED.message } }`; `other.status === 200` and every one of `other.body.segments`
  carries `baseSha256` (the opening lookup is never reached for a zero-row editor); after the restore,
  `opening('m94014')` is `undefined` (nothing was recorded while the tables were gone). Control in the same test:
  `serve(asUser(ed1), 'm94014')` → 200 and `opening('m94014')` is set.

`describe('T7, the snapshot, through the route (spec §5.5, §10)')` — on `m94020` (an `m68664`-style module: rows
re-entered before opening, spec §5.5 "a non-empty snapshot is expected"):
`s1` pending, legacy (`occurrence` and `origin` NULL); `s2` approved and not applied (`occurrence 0`, `origin
'editor-save'`, `editor 'ed-b'`); `s3` an older pending row (`createdAt '2026-06-16 10:00:00'`) under a newer rejected
one (`'2026-06-17 10:00:00'`, `editor 'ed-b'`); `s4` pending with `origin 're-attach'`, `occurrence 0`; `s5` approved
and applied (`appliedAt '2026-06-12 16:00:00'`); `s6` no row. `let warnSpy; beforeEach(() => { warnSpy =
vi.spyOn(log, 'warn'); })` inside this `describe`, and each `it` reads only the calls of its own serves. `const
reattachWarns = () => warnSpy.mock.calls.filter(([, msg]) => /re-attach/.test(msg)).map(([o]) => o)`.

- `it('holds exactly the segments with any in-flight edit at opening, and warns once, for the non-re-attached rows only')`
  — `serve(asUser(ed1), 'm94020')` → 200; `snapshot('m94020')` equals `[{ segment_id: 'm94020:para:s1', occurrence:
  -1 }, { …s2, occurrence: 0 }, { …s3, occurrence: -1 }, { …s4, occurrence: 0 }]`; `opening('m94020').inflight_count
  === 4`; the response's segment ids include `…s5` and `…s6` (control: they were served, and left out).
  `reattachWarns()` equals `[{ book: BOOK, chapter: 1, moduleId: 'm94020', segments: ['m94020:para:s1',
  'm94020:para:s2', 'm94020:para:s3'] }]` (`s4`, re-attached, is in the snapshot and not in the warning). Then
  `serve(asUser(ed1b), 'm94020')` → 200 and `reattachWarns()` still has length 1 (a later serve never warns).
- `it('each segment stays in the snapshot after its row is approved, rejected or withdrawn')` — first
  `serve(asUser(ed1), 'm94020')` (opens it if this `it` runs alone; otherwise skipped, already opened), then `const
  before = { row: opening('m94020'), snap: snapshot('m94020') }` and the guard `expect(before.snap.map((r) =>
  r.segment_id)).toEqual(['m94020:para:s1', 'm94020:para:s2', 'm94020:para:s3', 'm94020:para:s4'])`, so the
  comparison below cannot pass on an empty record; then by SQL: `s1`'s row → `status 'approved', applied_at
  '2026-11-03 12:00:00'`; `s2`'s → `status 'rejected'`; `s3`'s older pending row → `DELETE` (withdrawn); `s4`'s →
  approved and applied. Serves by `ed1` and `admin` → 200; `{ row, snap }` equals `before`. Control: `snapshotRows`
  over the same segments and `segmentEditor.getModuleEdits(BOOK, 'm94020')` (today's rows) now gives `rows: []`, so a
  route that recomputed the snapshot would have shown it.
- `it('a module opened with only a re-attached in-flight row writes no warning')` — `addEdit({ moduleId: 'm94021',
  seg: 'm94021:para:x', origin: 're-attach', occurrence: 0 })` and `addEdit({ moduleId: 'm94022', seg:
  'm94022:para:y' })`; serve both as `ed1`, in this `it`; `reattachWarns().map((o) => o.moduleId)` equals
  `['m94022']` (the positive control, in the same `it`, that the spy is live and the warning fires) and so names
  `m94021` never; `snapshot('m94021')` equals `[{ segment_id: 'm94021:para:x', occurrence: 0 }]`.

`server/__tests__/researchBoundary.test.js`, appended. **PR1's plan does not pin this file's bindings** (its serve
`describe` calls `serve(/* … */)` and says only "as in `servedServeHook.test.js`"), and its serve `describe` may
restore the books root in its own `afterAll`. So this block relies only on what PR1 pins, the env lines at the top
(`SESSIONS_DB_PATH`, `JWT_SECRET`, before any server `require`), the file's `createRequire` `require`, `jsonDrift` and
`MODULE_JSON_ALLOWED`, and binds everything else itself, under names no earlier `describe` uses: module-level `const
nodeFs = require('fs')`, `nodePath = require('path')`, `nodeOs = require('os')`, `OpeningDb =
require('better-sqlite3')`, `{ runAllMigrations: migrateAll } = require('../services/migrationRunner')`,
`moduleOpenings = require('../services/moduleOpenings')`, `pr2Parser = require('../services/segmentParser')` and `{
writeModule: pr2WriteModule, handlerFor: pr2HandlerFor, invoke: pr2Invoke } = require('./helpers/servedFixture')`. (If
the executing session finds PR1's file already binds one of these, it reuses that binding and drops the duplicate.)
The `describe`'s `beforeAll`: `migrateAll()` (idempotent; the file is not migrated until a describe that migrates it
has run); `db = new OpeningDb(process.env.SESSIONS_DB_PATH)`; `userService = require('../services/userService')`;
`priorBooksDir = pr2Parser.BOOKS_DIR` (the parser's getter), then `booksRoot =
nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 't17-pr2-books-'))` and `pr2Parser._setTestBooksDir(booksRoot)`; `getModule = pr2HandlerFor(require('../routes/segment-editor'), 'get',
'/:book/:chapter/:moduleId')`; it writes module `efnafraedi-2e/ch01/m94030` into `booksRoot` (two segments, EN and MT),
creates the opener (`userService.createUser({ providerId: 'p-t17', … role: 'editor' })` and
`userService.assignChapter(opener.id, 'efnafraedi-2e', 1)`), and seeds by SQL on `db` one pending edit on
`m94030:para:a` and one active acceptance on `m94030:para:b` (`INSERT INTO segment_acceptances (book, chapter,
module_id, segment_id, accepted_content, accepted_by, accepted_by_username, status) VALUES (…, 'active')`), so
`jsonDrift` finds an edit row and an acceptance row; nothing is written under `books/`. Its `afterAll`: `db.close()`,
`pr2Parser._setTestBooksDir(priorBooksDir)` (the save-and-restore of `acceptanceApply.test.js:37`, `:112`) and
`nodeFs.rmSync(booksRoot, { recursive: true, force: true })`.
Helpers: `serveAs = (user) => pr2Invoke(getModule, { params: { book: 'efnafraedi-2e', chapter: '1', moduleId: 'm94030'
}, chapterNum: 1, user })` and `const OPENER = { id: 'p-t17', username: 'p-t17', role: 'editor', books: [] }`;
`openingRow(m)`, `snapshotOf(m)` and `addEdit` as Task 3's `opening`, `snapshot` and `addEdit`, on this `db`.
`afterEach` resets `moduleOpenings._setTestClock(null)`.

```js
const SENTINEL_MS = 1_777_777_777_777;
/** Every .js file under root whose text matches pattern (read as bytes, so a NUL cannot hide a match). */
function filesNaming(root, pattern) {
  const out = [];
  const walk = (dir) => {
    for (const e of nodeFs.readdirSync(dir, { withFileTypes: true })) {
      const p = nodePath.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js') && pattern.test(nodeFs.readFileSync(p, 'latin1')))
        out.push(nodePath.relative(root, p));
    }
  };
  walk(root);
  return out.sort();
}
const OPENING_NAMES = /module_openings|module_opening_inflight|opened_at_ms/;

describe('T17 (PR2): no opened time, no switch time and no snapshot in any response (spec §11)', () => {
  it('the serve that opens a unit sends exactly what any serve sends, and no trace of its time', async () => {
    moduleOpenings._setTestClock(() => SENTINEL_MS);
    const first = await serveAs(OPENER);
    expect(first.status).toBe(200);
    // positive control: this serve DID record the time and a snapshot, so their absence below means something
    expect(openingRow('m94030').opened_at_ms).toBe(SENTINEL_MS);
    expect(snapshotOf('m94030')).toEqual([{ segment_id: 'm94030:para:a', occurrence: -1 }]);
    expect(jsonDrift(first.body)).toEqual({ top: [], segment: [], editRow: [], acceptanceRow: [], forbidden: [] });
    const text = JSON.stringify(first.body);
    expect([String(SENTINEL_MS), new Date(SENTINEL_MS).toISOString()].filter((s) => text.includes(s))).toEqual([]);
    const second = await serveAs(OPENER);
    expect(second.body).toEqual(first.body); // opening added nothing a later serve lacks
  });
  it('control: the comparison sees a change', async () => {
    const a = await serveAs(OPENER);
    addEdit({ moduleId: 'm94030', seg: 'm94030:para:b', editor: 'ed-b' });
    expect((await serveAs(OPENER)).body).not.toEqual(a.body);
  });
  it('no file under server/routes/ names the opening tables or their time column', () => {
    expect(filesNaming(nodePath.join(__dirname, '..', 'routes'), OPENING_NAMES)).toEqual([]);
  });
  it('control: the scan names a planted file', () => {
    const tmp = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 't17-pr2-'));
    nodeFs.writeFileSync(nodePath.join(tmp, 'leak.js'), 'db.prepare("SELECT opened_at_ms FROM module_openings")');
    nodeFs.writeFileSync(nodePath.join(tmp, 'clean.js'), 'module.exports = {};');
    expect(filesNaming(tmp, OPENING_NAMES)).toEqual(['leak.js']);
    nodeFs.rmSync(tmp, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/moduleOpeningRoute.test.js server/__tests__/researchBoundary.test.js`
Expected: FAIL — every assigned serve answers 200 with no `module_openings` row (`opening(…)` is `undefined` where an
object is expected, the admin who holds a row included); the three 503 cases (snapshot insert, mint, missing tables)
get 200; the snapshot reads `[]`; `reattachWarns()` is `[]` where one warning is expected; the immutability case's
guard fails on an empty snapshot; T17's positive control finds no row (`TypeError` reading `opened_at_ms` of
`undefined`). The negative cases (admin and head editor with no row, zero-row editor, ghost, visitor 403, the viewer
with a row's 403, chapter 0's 400, the off-allowlist book) already hold, and their positive controls fail. The route
scan and its control pass (no route names the tables yet).

- [ ] **Step 3: Implement the route**

Require, beside the other services: `const moduleOpenings = require('../services/moduleOpenings');`. In the GET
handler, as PR1 Task 6 leaves it: replace `servedVersions.recordServe(segmentEditor.getDb(), data, …)` with `const conn
= segmentEditor.getDb();` on the line above and `servedVersions.recordServe(conn, data, …)`, and delete the
`eslint-disable-next-line no-unused-vars -- PR2's opening step reads it` line above `const served` (PR1's handoff).
Replace PR1's seam comment, immediately before `res.json({`, with:

```js
      // ── spec §5.4 step 4 and §5.5: the opening record (PR2). Only a serve that meets the predicate (a study
      //    book, no opening yet, and a users row holding a user_chapter_assignments row for this book and chapter)
      //    is affected: it records the opening and its in-flight snapshot in one transaction, or answers 503 and
      //    records nothing, a failed mint above included. Every other serve is answered exactly as before. ──
      const step = moduleOpenings.openOnServe(conn, {
        book: req.params.book,
        chapter: req.chapterNum,
        moduleId: req.params.moduleId,
        providerId: req.user.id,
        served,
        segments: data.segments,
        edits,
      });
      if (step.status === 'unrecorded') {
        const { status, code, message } = moduleOpenings.OPENING_UNRECORDED;
        return res.status(status).json({ error: code, message });
      }
      // ── PR3 (index decision 2) emits module-opened HERE, after the opening's commit and only when
      //    step.status === 'opened', with moduleOpenings.moduleOpenedDetail(served, step.opening) as its detail;
      //    nothing it does may change this response (spec §5.11). Step 5 (G1.23) runs after it and reads
      //    seg.baseSha256 and the stored opening. No field is added to the response (T17). ──
```

Before the route change, if the tree check found a test file that drives this handler without setting
`SESSIONS_DB_PATH` first, add the assignment there (Global Constraints (PR2)).

- [ ] **Step 4: Run them, and every suite that drives the handler**

Run: `npx vitest run server/__tests__/moduleOpeningRoute.test.js server/__tests__/researchBoundary.test.js`
Expected: PASS.

Run, one at a time, every file the tree check listed for `'/:book/:chapter/:moduleId'` (at least
`acceptanceRoutes.test.js`, `servedServeHook.test.js`, `servedVersionsIntegrity.test.js`, `segmentEditBackstop.test.js`,
`servedSaveRoute.test.js`), then `server/__tests__/structuralBackstopWiring.test.js`.
Expected: PASS, unchanged: their users hold no `users` row, so the predicate never holds and every serve is answered as
in PR1. `git status --porcelain` shows nothing under `books/` or `pipeline-output/`.

- [ ] **Step 5: Commit**

```bash
git add server/routes/segment-editor.js server/__tests__/helpers/servedFixture.js \
  server/__tests__/moduleOpeningRoute.test.js server/__tests__/researchBoundary.test.js
git commit -m "feat(server): the module route records the opening and answers 503 when it cannot (G1.1)"
```

---

### Task 4: a serve whose opening was not recorded tells the editor to open the unit again, and leaves no pane to save from

Spec §5.4 ("the client does not retry: `loadModule` shows its load error and returns to the module list … and the
editor opens the module again"), §13 (`OPENING_UNRECORDED`'s wording); T6 ("the editor cannot save in between", the
client half); index decision 13; decisions 13, 14, 28; disagreement 1.

**Files:**
- Modify: `server/public/js/segment-editor.js` — `loadModule`'s `catch` (`:303-307` at `ed10180c`; PR1 does not change
  it)
- Modify: `server/public/js/ui-strings.js` — `UI.segmentEditor.openingUnrecorded` (the group at `:237`)
- Test: `server/__tests__/servedBaseClientPins.test.js` (PR1 Task 9; append one `describe`), `server/e2e/opening-unrecorded.spec.js`
  (new)

**Interfaces:**
- Consumes: `fetchJson`'s error (`htmlUtils.js:34-58`: `err.message` from `data.error || data.message`, `err.status`,
  `err.data`); the server's `503 { error: 'OPENING_UNRECORDED', message }` (Task 3); PR1's `fnBody(name, next)` in
  `servedBaseClientPins.test.js`; in `segment-editor.js`, `saveDraft()` (`:84-100`, as PR1 Tasks 18 and 19 leave it),
  `draftTimer` (set by `startDraftTimer`, `:106-109`), `dirtyEdits`, `tabGuard.release()` (`tabGuard.js:181-187`: releases the claim, touches no
  draft), `#editor-container` and `#save-status-bar` (`server/views/segment-editor.html:1741`, `:1907`, both start
  `display: none`) and `window.loadModule` (`:3546`).
- Produces: `UI.segmentEditor.openingUnrecorded` (approved wording, decision 28); on the `OPENING_UNRECORDED` path
  with a pane on screen, the pane's texts in this tab's draft, the draft timer stopped, `dirtyEdits` empty, the tab
  claim released, and `#editor-container` and `#save-status-bar` hidden.

- [ ] **Step 1: Write the failing tests**

`server/__tests__/servedBaseClientPins.test.js`, appended:

```js
describe('a serve whose opening was not recorded (spec §5.4; PR2)', () => {
  // The catch's code without its comments: its comment names what it does NOT call (clearDraft), which must not
  // satisfy or trip a pin (measured on the Step 3 text: unstripped, the no-discard pin fails on that comment).
  const catchCode = () =>
    fnBody('loadModule', 'loadTermData').split('} catch (err) {')[1].replace(/\/\/[^\n]*/g, '');
  const DISCARD = /loadModule\(|fetchJson\(|clearDraft|clearDraftsByPrefix|localStorage|heldDrafts\.(clear|delete)|paneState\.(clear|delete)/;
  it("loadModule's error path names OPENING_UNRECORDED, shows its own text and returns to the module list", () => {
    const load = fnBody('loadModule', 'loadTermData');
    expect(load).toMatch(/err\.status === 503 && err\.data && err\.data\.error === 'OPENING_UNRECORDED'/);
    expect(load).toContain('UI.segmentEditor.openingUnrecorded');
    expect(load).toMatch(/getElementById\('module-selector'\)\.style\.display = 'block'/);
    // control: the generic text is still there, so the slice is loadModule's catch
    expect(load).toContain('UI.common.errorLoading + err.message');
  });
  it('a reload from an open pane: its texts go into the draft, then the pane and its save bar go away (T6)', () => {
    const c = catchCode();
    expect(c).toContain("const pane = document.getElementById('editor-container');");
    const start = c.indexOf("if (unrecorded && pane.style.display !== 'none') {");
    expect(start).toBeGreaterThan(-1);
    const branch = c.slice(start, c.indexOf('alert(', start));
    const at = (s) => branch.indexOf(s);
    const steps = ['saveDraft();', 'clearInterval(draftTimer)', 'dirtyEdits.clear();', 'tabGuard.release();',
      "pane.style.display = 'none';", "getElementById('save-status-bar').style.display = 'none';"];
    expect(steps.filter((s) => at(s) === -1)).toEqual([]);
    expect(at('saveDraft();')).toBeLessThan(at('dirtyEdits.clear();')); // saveDraft reads dirtyEdits
    // control: none of it runs outside the branch, so a first load and every other error keep today's path
    expect(c.slice(0, start)).not.toMatch(/saveDraft|dirtyEdits\.clear|tabGuard\.release|'none'/);
  });
  it('the error path retries nothing and discards no draft', () => {
    const c = catchCode();
    expect(c).toBeTruthy();
    expect(c).not.toMatch(DISCARD);
    // control: the pin fires on a planted discard (alert( is in the catch before Step 3 and after it)
    expect(c.replace('alert(', 'clearDraft(); alert(')).toMatch(DISCARD);
  });
});
```

`server/e2e/opening-unrecorded.spec.js`:

```js
// @ts-check
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { loginAs } = require('./helpers/auth');

/**
 * spec §5.4 (G1.1 + G1.2 PR2): a serve whose opening could not be recorded answers 503 OPENING_UNRECORDED; the page
 * shows its own text and returns to the module list, from which the editor opens the unit again. On a reload from an
 * open pane (after a save, a review action, or a refused save), the pane goes too, so nothing can be saved on a unit
 * whose opening was not recorded (T6), and its typed text stays in the draft.
 *
 * The 503 is STUBBED (route.fulfill): the E2E database holds no users row (seed-fixture.js) and logins are injected
 * JWTs (helpers/auth.js), so the opening predicate never holds here and the real server never answers it. The
 * real-server half is server/__tests__/moduleOpeningRoute.test.js. Writes nothing on the server: the reload tests type
 * into the first pane and never save, so they claim no segment in helpers/segments.js's table.
 */
const UI = new Function(
  `${fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'ui-strings.js'), 'utf8')}; return UI;`
)();
const MODULE_GET = '**/api/segment-editor/efnafraedi-2e/1/m68664';
const stub = (status, body) => (route) =>
  route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

/** A first load, from the URL, answered by the stub: #editor-container was never shown. */
async function openWithStub(page, status, body) {
  await loginAs(page, 'editor');
  await page.route(MODULE_GET, stub(status, body));
  const dialog = page.waitForEvent('dialog');
  await page.goto('/editor?book=efnafraedi-2e&chapter=1&module=m68664');
  const d = await dialog;
  const message = d.message();
  await d.accept();
  return message;
}

/** A real first load (the predicate never holds in E2E, so it answers 200), then a reload answered by the stub. */
async function openForReal(page) {
  await loginAs(page, 'editor');
  await page.goto('/editor?book=efnafraedi-2e&chapter=1&module=m68664');
  await expect(page.locator('.segment-row').first()).toBeVisible({ timeout: 10000 });
}
async function reloadWithStub(page, status, body) {
  await page.route(MODULE_GET, stub(status, body));
  const dialog = page.waitForEvent('dialog');
  const done = page.evaluate(() => window.loadModule('m68664', { force: true })); // the in-editor reload's call
  const d = await dialog;
  const message = d.message();
  await d.accept();
  await done;
  return message;
}
/** Whether any of this module's draft keys (seg-draft:<book>/<chapter>/<module>:<tab>) holds the text. */
const draftHolding = (page, text) =>
  page.evaluate(
    (t) =>
      Object.keys(localStorage).some(
        (k) => k.startsWith('seg-draft:efnafraedi-2e/1/m68664:') && localStorage.getItem(k).includes(t)
      ),
    text
  );

test.describe('a serve whose opening was not recorded (spec §5.4)', () => {
  test('a first load: shows the opening text and returns to the module list, with no pane to save from', async ({
    page,
  }) => {
    const message = await openWithStub(page, 503, { error: 'OPENING_UNRECORDED', message: 'netþjónn' });
    expect(message).toBe(UI.segmentEditor.openingUnrecorded);
    await expect(page.locator('#module-selector')).toBeVisible();
    await expect(page.locator('#editor-container')).toBeHidden();
    await expect(page.locator('.segment-row')).toHaveCount(0);
  });

  test("control: any other first-load error keeps today's text", async ({ page }) => {
    const message = await openWithStub(page, 500, { error: 'boom' });
    expect(message).toBe(UI.common.errorLoading + 'boom');
  });

  test('a reload from an open pane: the pane goes, the module list shows, and the typed text stays in the draft', async ({
    page,
  }) => {
    await openForReal(page);
    await page.locator('button.btn-edit').first().click();
    const textarea = page.locator('.edit-panel.active textarea').first();
    const typed = `OPNUN-503-${Date.now()}`;
    await textarea.fill(typed);
    await textarea.dispatchEvent('input');

    const message = await reloadWithStub(page, 503, { error: 'OPENING_UNRECORDED', message: 'netþjónn' });
    expect(message).toBe(UI.segmentEditor.openingUnrecorded);
    await expect(page.locator('#editor-container')).toBeHidden();
    await expect(page.locator('#save-status-bar')).toBeHidden();
    await expect(page.locator('#module-selector')).toBeVisible();

    // One draft-timer period (5 s) later the text is still there: the catch stopped the timer before it emptied
    // dirtyEdits, so no tick removed the draft (saveDraft removes it when nothing is dirty or held).
    await page.waitForTimeout(6000);
    expect(await draftHolding(page, typed)).toBe(true);

    // Opening the unit again offers exactly that text back, and asks nothing about panes nobody can see
    // (with dirtyEdits left full, the first dialog would be UI.confirm.closePanels).
    await page.unroute(MODULE_GET);
    const recovery = page.waitForEvent('dialog');
    await page.locator('.module-card[title^="m68664"]').click();
    const d = await recovery;
    expect(d.message()).toBe(UI.confirm.draftRecovery(1));
    await d.accept();
    await expect(page.locator('.edit-panel.active textarea').first()).toHaveValue(typed);
  });

  test("control: a reload that fails otherwise keeps today's text and today's pane", async ({ page }) => {
    await openForReal(page);
    const message = await reloadWithStub(page, 500, { error: 'boom' });
    expect(message).toBe(UI.common.errorLoading + 'boom');
    // Today's behaviour, kept on purpose (decision 13): only OPENING_UNRECORDED takes the pane away.
    await expect(page.locator('#editor-container')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/servedBaseClientPins.test.js server/__tests__/ui-strings.test.js`
Expected: FAIL — the first new case finds no `OPENING_UNRECORDED` in `loadModule`; the second finds no `const pane =
…` line; the third passes (no retry and no draft discard today, and none after); `ui-strings.test.js` passes (nothing
references the new key yet).

Run: `( cd server && CI=1 npx playwright test --config=e2e/playwright.config.js opening-unrecorded.spec.js )`
Expected: FAIL — the first and third tests' dialogs read `Villa við að hlaða einingu: OPENING_UNRECORDED`; both
controls pass. (Were the text alone fixed, the third test would still fail at `#editor-container` being visible.)

- [ ] **Step 3: Implement**

`loadModule`'s `catch` becomes:

```js
    } catch (err) {
      // Restore module list on error so users can retry
      document.getElementById('module-selector').style.display = 'block';
      chapterSelect.dispatchEvent(new Event('change'));
      // spec §5.4: a serve whose opening could not be recorded answers 503 OPENING_UNRECORDED. fetchJson builds
      // err.message from data.error first (htmlUtils.js), which is the bare code here, so the text comes from UI.
      // No retry: the editor opens the unit again from the list.
      const unrecorded = err.status === 503 && err.data && err.data.error === 'OPENING_UNRECORDED';
      const pane = document.getElementById('editor-container');
      if (unrecorded && pane.style.display !== 'none') {
        // A reload from an open pane (after a save, a review action, or a refused save's keepText): the old rows
        // must not stay on screen beside the module list, or the editor could save on a unit whose opening was not
        // recorded (spec §5.4; T6). First their texts go into the draft, the write the draft timer makes every 5 s;
        // then the timer stops and dirtyEdits empties, so no later tick removes that draft (saveDraft removes it
        // when nothing is dirty or held) and the next load asks nothing about panes nobody can see. Unlike Back:
        // no clearDraft, and heldDrafts and paneState stay, so a kept text comes back when the unit is opened again.
        // On a first load nothing is on screen and this is skipped: saveDraft there would remove this tab's draft,
        // which can hold a text Back kept.
        saveDraft();
        if (draftTimer) clearInterval(draftTimer);
        dirtyEdits.clear();
        tabGuard.release();
        pane.style.display = 'none';
        document.getElementById('save-status-bar').style.display = 'none';
      }
      alert(unrecorded ? UI.segmentEditor.openingUnrecorded : UI.common.errorLoading + err.message);
    } finally {
```

In `ui-strings.js`'s `segmentEditor` group: `openingUnrecorded: 'Ekki tókst að skrá opnun einingarinnar og því var
hún ekki opnuð. Veljið hana aftur úr listanum.'`, with a comment that [USER] approved the wording on 2026-11-04 (index
decision 13).

- [ ] **Step 4: Run them**

Run: `npx vitest run server/__tests__/servedBaseClientPins.test.js server/__tests__/ui-strings.test.js
server/__tests__/clientJsSyntax.test.js`, then the Playwright command of Step 2, then
`( cd server && CI=1 npx playwright test --config=e2e/playwright.config.js editor-lifecycle.spec.js )` (the draft
specs this catch sits beside).
Expected: PASS (`ui-strings.test.js` now finds `UI.segmentEditor.openingUnrecorded` referenced and defined).

- [ ] **Step 5: Commit**

```bash
git add server/public/js/segment-editor.js server/public/js/ui-strings.js \
  server/__tests__/servedBaseClientPins.test.js server/e2e/opening-unrecorded.spec.js
git commit -m "feat(editor): an unrecorded opening tells the editor to open the unit again"
```

---

### Task 5: the read-only production probe, its database half (G-1d, G-1e)

Spec §9 (G-1d, G-1e; "Production reads use a committed script sent on stdin"), §5.5 (what the snapshot will hold),
R6, §11; index decision 14; decisions 15–20, 23.

**Files:**
- Create: `server/scripts/read-research-preconditions.js` — `USAGE`, `SERVICE_UNIT`, `SECTIONS`, `runSection`,
  `execNeverThrow`, `readAutoCreateUsers`, `readG1d`, `readG1e`, `readResearchPreconditions`, `main`, the stdin-aware
  `runDirectly`
- Test: `server/__tests__/readResearchPreconditions.test.js` (new; model: `readApplyExposure.test.js`)

**Interfaces:**
- Consumes: `../lib/dbPath` (`resolveDbPath()`), `../lib/chapterLabel` (`chapterDir`, `chapterLabel.js:38-40`),
  `better-sqlite3`, `dotenv` (`parse`), Node `fs`, `path`, `child_process`.
- Produces:
  - `readResearchPreconditions({ book, openDb, serverDir, booksDir, etcRoot = '/etc', varRoot = '/var', pathEnv =
    process.env.PATH, exec = execNeverThrow }) → { book, ok: boolean, sections: Record<'G-1c'…'G-1g', { ok: true, …
    } | { ok: false, error: string, message: string }> }`
  - `readG1d(ctx) → { enforcement: { book, enforceAssignments }[], studyBookEnforced: boolean, assignments: { userId,
    chapter }[], assignedChapters: number[], users: { id, role, active }[], autoCreateUsers }` (`studyBookEnforced`:
    `isAssignmentEnforced`'s rule for the book argument, `userService.js:567-582`, so a book with no `book_settings`
    row reads `false`, not absent)
  - `readG1e(ctx) → { originColumn: boolean, inflight: { chapter, moduleId, segmentId, pending, approvedUnapplied,
    reattach? }[], appliedWithoutFaithful: { chapter, moduleId, segmentId }[] }`
  - `readAutoCreateUsers({ serverDir, exec }) → { dotEnv: { present, value }, service: { ran, value },
    environmentFiles: { path, value }[], effective: { value: string | null, source: 'EnvironmentFile' | 'Environment'
    | 'server/.env' | 'unset' } }`
  - `main(argv, env = process.env) → 0 | 1 | 2`; the CLI prints one JSON object `{ probe, readAt, book, ok, sections
    }`.

- [ ] **Step 1: Write the failing test** (`server/__tests__/readResearchPreconditions.test.js`)

Header as `readApplyExposure.test.js:7-15`; `SCRIPT = path.join(__dirname, '..', 'scripts',
'read-research-preconditions.js')`, `SCRIPTS_DIR = path.dirname(SCRIPT)`. `beforeEach`: `({ db, path: dbPath } =
freshMigratedDb())`; a temp root holding `books/` and `server/` (`fs.mkdtempSync`); `DELETE FROM book_settings`. Seed
by SQL: `book_settings` `('efnafraedi-2e', enforce_assignments 1)` and `('liffraedi-2e', 0)`; users `A` (`role
'editor'`, `display_name 'Prófari Eitt'`, `email 'profari1@skoli.example'`, `provider_username 'profari1@skoli.example'`)
and `B` (`'head-editor'`, `is_active 0`); assignment rows `(A, efnafraedi-2e, 1, assigned_by 'ASSIGNED-BY-SENTINEL')`,
`(A, …, 2)`, `(B, …, 5)` and `(A, liffraedi-2e, 3)`; edits on chemistry with `editor_username 'ED-USERNAME-SENTINEL'`:
`ch03/m94103:para:a` pending (`origin 're-attach'`), `ch03/m94103:para:a` approved and unapplied (`origin NULL`),
`ch03/m94103:para:b` rejected, `ch03/m94103:para:e` pending (`origin NULL`, its only row), `ch04/m94104:para:c`
approved and applied, `ch04/m94105:para:d` approved and applied;
and the faithful file `books/efnafraedi-2e/03-faithful-translation/ch04/m94104-segments.is.md` (present; `m94105`'s is
absent). `server/.env` holds `JWT_SECRET=SENTINEL-SECRET-1` and `AUTO_CREATE_USERS=true`. A stub
`exec(cmd, args)` answers `systemctl … --property=Environment` with `{ ran: true, code: 0, stdout: 'NODE_ENV=production
MS_CLIENT_SECRET=SENTINEL-SECRET-2 AUTO_CREATE_USERS=false\n' }`, `--property=EnvironmentFiles` with `{ ran: true,
code: 0, stdout: '' }`, and **any other command** with `{ ran: false, code: null, stdout: '', stderr: '' }` (once Task 6
adds `journalctl --disk-usage`, an `undefined` answer would make G-1c throw on `du.ran`). `ctx(over)` builds the
options: `{ book: 'efnafraedi-2e', openDb: () => new Database(dbPath, { readonly: true, fileMustExist: true }),
serverDir: <root>/server, booksDir: <root>/books, etcRoot: <root>/etc, varRoot: <root>/var, pathEnv: '', exec: stub,
…over }`, with `<root>/etc` and `<root>/var` empty directories, so no in-process run reads the host's `/etc`, `/var`
or `PATH` (the parameters' defaults are `main`'s, decision 19); the probe opens and closes its own read-only handle, as
in production, and the test's writable `db` stays open for seeding and controls. A spawned run closes `db` first and reopens it after, as `readApplyExposure.test.js:169-176` does.

- `describe('G-1d (spec §9): whether units would open the moment the step ships')`:
  - `it('reports enforcement per book, chemistry’s rows as (user id, chapter), and the users as ids and roles')` —
    `readResearchPreconditions(ctx()).sections['G-1d']` matches `{ ok: true, enforcement: [{ book: 'efnafraedi-2e',
    enforceAssignments: true }, { book: 'liffraedi-2e', enforceAssignments: false }], studyBookEnforced: true,
    assignments: [{ userId: A, chapter: 1 }, { userId: A, chapter: 2 }, { userId: B, chapter: 5 }], assignedChapters:
    [1, 2, 5], users: [{ id: A, role: 'editor', active: true }, { id: B, role: 'head-editor', active: false }] }`
    (liffraedi's row is the control: it is in the table and not in the output).
  - `it('a study book with no book_settings row reads as not enforced, not as missing')` — `DELETE FROM book_settings
    WHERE book = 'efnafraedi-2e'`: `sections['G-1d'].studyBookEnforced === false` and `enforcement` equals `[{ book:
    'liffraedi-2e', enforceAssignments: false }]`. Control: the case above, with the row present, reads `true`.
  - `it('AUTO_CREATE_USERS as the server reads it: systemd first, .env only where unset')` — `autoCreateUsers` equals
    `{ dotEnv: { present: true, value: 'true' }, service: { ran: true, value: 'false' }, environmentFiles: [],
    effective: { value: 'false', source: 'Environment' } }`. With an `EnvironmentFiles` answer naming
    `<root>/envfile` (holding `AUTO_CREATE_USERS=` and `OTHER_SECRET=SENTINEL-SECRET-3`): `effective` is `{ value: '',
    source: 'EnvironmentFile' }` and `environmentFiles` is `[{ path: <root>/envfile, value: '' }]`. With an `exec` that
    answers `{ ran: false }` (no systemd): `effective` is `{ value: 'true', source: 'server/.env' }`. With no `.env`
    either: `{ value: null, source: 'unset' }`.
- `describe('G-1e (spec §9): the size of the opening snapshots')`:
  - `it('lists chemistry’s in-flight segments with counts by state, and applied rows whose faithful file is gone')` —
    `sections['G-1e']` equals `{ ok: true, originColumn: true, inflight: [{ chapter: 3, moduleId: 'm94103', segmentId:
    'm94103:para:a', pending: 1, approvedUnapplied: 1, reattach: 1 }, { chapter: 3, moduleId: 'm94103', segmentId:
    'm94103:para:e', pending: 1, approvedUnapplied: 0, reattach: 0 }], appliedWithoutFaithful: [{ chapter: 4,
    moduleId: 'm94105', segmentId: 'm94105:para:d' }] }` (`b`, rejected, and `m94104`, whose file exists, are the
    controls; `e`'s `reattach: 0`, not `null`, is the case every pre-PR1 row on production is in, since `SUM` over
    only `NULL`s is `NULL`).
  - `it('reads a database that does not have PR1’s origin column')` — `ALTER TABLE segment_edits DROP COLUMN origin`:
    `originColumn: false`, and `inflight` equals the previous list with `reattach` removed from each entry.
- `describe('it names no editor (spec §9, index decision 14)')`:
  - `it('no name, email, username, assigned_by or secret reaches the output')` — `const text =
    JSON.stringify(readResearchPreconditions(ctx({ exec: stubWithEnvironmentFile })))`; for each of `'Prófari Eitt'`,
    `'profari1@skoli.example'`, `'ED-USERNAME-SENTINEL'`, `'ASSIGNED-BY-SENTINEL'`, `'SENTINEL-SECRET-1'`,
    `'SENTINEL-SECRET-2'`, `'SENTINEL-SECRET-3'`: `text.includes(s) === false`. Positive control in the same test: the
    database and the files really hold them (`JSON.stringify(db.prepare('SELECT * FROM users').all())` includes
    `'Prófari Eitt'`; the `.env` text includes `'SENTINEL-SECRET-1'`), and `text` includes `'m94103:para:a'`.
- `describe('the command line')` (spawned with `env = { ...process.env, SESSIONS_DB_PATH: dbPath, BOOKS_ROOT_OVERRIDE:
  <root>/books }`; `db.close()` before each spawn and `db = new Database(dbPath)` after it):
  - `it('a file run opens the database read-only, prints one JSON object and exits 0')` — sha256 of the database file
    before; `spawnSync(process.execPath, [SCRIPT, 'efnafraedi-2e'], { env, encoding: 'utf8' })`: `status 0`;
    `JSON.parse(stdout)` has `probe: 'read-research-preconditions'`, `book: 'efnafraedi-2e'`, `ok: true` and
    `sections['G-1d'].users` of length 2 (the run read the database); the sha256 after equals the one before.
  - `it('a stdin run from server/scripts (the route used on production) also runs')` — `spawnSync(process.execPath,
    ['-', 'efnafraedi-2e'], { cwd: SCRIPTS_DIR, env, input: fs.readFileSync(SCRIPT, 'utf8'), encoding: 'utf8' })`:
    `status 0`, and the same `sections['G-1d'].users` length.
  - `it('control: a stdin run with no book exits 2, so the stdin branch really executes main()')` — as
    `readApplyExposure.test.js:181-189`.
  - `it('refuses a missing book, an extra argument and a malformed book with exit 2')` — `[]`, `['efnafraedi-2e',
    '--write']`, `['Efnafraedi 2e']`: each `status 2` and nothing on stdout.
  - `it('a missing database fails its sections, not the run: exit 1, with the JSON still printed')` — `env` with
    `SESSIONS_DB_PATH` a missing file in an existing temp directory: `status 1`; `sections['G-1d']` and
    `sections['G-1e']` are `{ ok: false, error: 'SQLITE_CANTOPEN', … }`; `ok: false`. Control: the run above, with the
    database present, exited 0.
- `describe('it can run where PR1 and PR2 are not deployed')`:
  - `it('requires only modules production has at ed10180c')` — the sorted, de-duplicated `require('…')` specifiers in
    the script's source (`/require\('([^']+)'\)/g`) equal `['../lib/chapterLabel', '../lib/dbPath', 'better-sqlite3',
    'child_process', 'dotenv', 'fs', 'path']`. Task 6 widens it by `'../../tools/lib/mt-lock.cjs'`. A new specifier
    fails the case, so its author checks that production has the module before Task 8 sends the script there.
  - `it('the documented command names a study book')` — the header's `node - <book>` (first match of `/node -
    ([a-z0-9-]+)/`) is in `require('../lib/researchScope').STUDY_BOOKS`.

- [ ] **Step 2: Run it**

Run: `npx vitest run server/__tests__/readResearchPreconditions.test.js`
Expected: FAIL — `Cannot find module '../scripts/read-research-preconditions'`.

- [ ] **Step 3: Implement** `server/scripts/read-research-preconditions.js`. Header (the shape of
  `read-apply-exposure.js:1-37`): READ-ONLY; what each section answers and which §9 check it is; that the output names
  no editor and so may be pasted into the register; that it requires only modules present at `ed10180c` (decision 16)
  and reads PR1's `origin` only if present (decision 17); the usage line and the stdin command:

```js
 * Usage (prints one JSON object on stdout; exit 0 every section read, 1 a section failed, 2 usage):
 *   node server/scripts/read-research-preconditions.js efnafraedi-2e
 * On production, where this file is not deployed, send it on stdin from server/scripts, so `../lib` and
 * better-sqlite3 resolve (the route read-pending-edits.js:15-18 describes):
 *   ssh <prod> "cd <repo>/server/scripts && node - efnafraedi-2e" \
 *     < server/scripts/read-research-preconditions.js > preconditions.json
```

The body:

```js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const USAGE = 'usage: read-research-preconditions.js <book>';
const SERVICE_UNIT = 'ritstjorn'; // the unit scripts/deploy.sh restarts
const KEY = 'AUTO_CREATE_USERS'; // its meaning: signInPolicy in server/services/auth.js, never restated here

/** A command's output, or what stopped it. Never throws; a missing command is { ran: false }. */
function execNeverThrow(cmd, args) {
  try {
    const stdout = execFileSync(cmd, args, { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ran: true, code: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      ran: err.code !== 'ENOENT',
      code: typeof err.status === 'number' ? err.status : null,
      stdout: String(err.stdout || ''),
      stderr: String(err.stderr || ''),
    };
  }
}

function runSection(read) {
  try {
    return { ok: true, ...read() };
  } catch (err) {
    return { ok: false, error: err.code || err.name, message: err.message };
  }
}

/** Only AUTO_CREATE_USERS leaves this function; every other key of the text is dropped here. */
function pickKey(text) {
  const parsed = require('dotenv').parse(text);
  return Object.hasOwn(parsed, KEY) ? parsed[KEY] : null;
}

function readAutoCreateUsers({ serverDir, exec }) {
  let dotEnv;
  try {
    dotEnv = { present: true, value: pickKey(fs.readFileSync(path.join(serverDir, '.env'), 'utf8')) };
  } catch {
    dotEnv = { present: false, value: null }; // no .env: the server reads none either
  }
  const env = exec('systemctl', ['show', SERVICE_UNIT, '--property=Environment', '--value']);
  const token = env.ran && env.code === 0 ? env.stdout.split(/\s+/).find((t) => t.startsWith(`${KEY}=`)) : undefined;
  const service = { ran: env.ran && env.code === 0, value: token === undefined ? null : token.slice(KEY.length + 1) };
  const files = exec('systemctl', ['show', SERVICE_UNIT, '--property=EnvironmentFiles', '--value']);
  const environmentFiles = (files.ran && files.code === 0 ? files.stdout.split('\n') : [])
    .map((l) => l.trim().split(/\s+/)[0])
    .filter(Boolean)
    .map((p) => {
      try {
        return { path: p, value: pickKey(fs.readFileSync(p, 'utf8')) };
      } catch {
        return { path: p, value: null }; // unreadable to this user: reported as such, not guessed
      }
    });
  // systemd: an EnvironmentFile= assignment overrides Environment=, a later file a former one; dotenv
  // (server/index.js) fills a variable from server/.env only where the process environment does not set it.
  const fromFile = environmentFiles.map((f) => f.value).filter((v) => v !== null).at(-1);
  const effective =
    fromFile !== undefined ? { value: fromFile, source: 'EnvironmentFile' }
    : service.value !== null ? { value: service.value, source: 'Environment' }
    : dotEnv.value !== null ? { value: dotEnv.value, source: 'server/.env' }
    : { value: null, source: 'unset' };
  return { dotEnv, service, environmentFiles, effective };
}

function readG1d({ db, book, serverDir, exec }) {
  const conn = db();
  const enforcement = conn
    .prepare('SELECT book, enforce_assignments FROM book_settings ORDER BY book')
    .all()
    .map((r) => ({ book: r.book, enforceAssignments: r.enforce_assignments === 1 }));
  // isAssignmentEnforced's rule (userService.js:567-582): no row is not enforced, so the study book is never absent.
  const own = enforcement.find((e) => e.book === book);
  const studyBookEnforced = own ? own.enforceAssignments : false;
  const assignments = conn
    .prepare('SELECT user_id, chapter FROM user_chapter_assignments WHERE book_slug = ? ORDER BY chapter, user_id')
    .all(book)
    .map((r) => ({ userId: r.user_id, chapter: r.chapter }));
  const users = conn
    .prepare('SELECT id, role, is_active FROM users ORDER BY id')
    .all()
    .map((r) => ({ id: r.id, role: r.role, active: r.is_active === 1 }));
  return {
    enforcement,
    studyBookEnforced,
    assignments,
    assignedChapters: [...new Set(assignments.map((a) => a.chapter))].sort((a, b) => a - b),
    users,
    autoCreateUsers: readAutoCreateUsers({ serverDir, exec }),
  };
}

function readG1e({ db, book, booksDir }) {
  const conn = db();
  const { chapterDir } = require('../lib/chapterLabel');
  const originColumn = conn.pragma('table_info(segment_edits)').some((c) => c.name === 'origin');
  // In flight is isEditInFlight's rule (accept-eligibility.js), in its SQL twin's words (acceptanceService.js).
  // reattach uses CASE, not SUM(origin = 're-attach'): origin is NULL on every pre-PR1 row, and SUM over NULLs is NULL.
  const inflight = conn
    .prepare(
      `SELECT chapter, module_id, segment_id,
              SUM(status = 'pending') AS pending,
              SUM(status = 'approved' AND applied_at IS NULL) AS approvedUnapplied
              ${originColumn ? ", SUM(CASE WHEN origin = 're-attach' THEN 1 ELSE 0 END) AS reattach" : ''}
         FROM segment_edits
        WHERE book = ? AND (status = 'pending' OR (status = 'approved' AND applied_at IS NULL))
        GROUP BY chapter, module_id, segment_id
        ORDER BY chapter, module_id, segment_id`
    )
    .all(book)
    .map((r) => ({
      chapter: r.chapter, moduleId: r.module_id, segmentId: r.segment_id, pending: r.pending,
      approvedUnapplied: r.approvedUnapplied, ...(originColumn ? { reattach: r.reattach } : {}),
    }));
  const appliedWithoutFaithful = conn
    .prepare(
      `SELECT DISTINCT chapter, module_id, segment_id FROM segment_edits
        WHERE book = ? AND status = 'approved' AND applied_at IS NOT NULL
        ORDER BY chapter, module_id, segment_id`
    )
    .all(book)
    .filter((r) => !fs.existsSync(
      path.join(booksDir, book, '03-faithful-translation', chapterDir(r.chapter), `${r.module_id}-segments.is.md`)
    ))
    .map((r) => ({ chapter: r.chapter, moduleId: r.module_id, segmentId: r.segment_id }));
  return { originColumn, inflight, appliedWithoutFaithful };
}

const SECTIONS = { 'G-1d': readG1d, 'G-1e': readG1e }; // Task 6 adds G-1c, G-1f, G-1g; PR4 adds G-1a and G-1h

function readResearchPreconditions({
  book, openDb, serverDir, booksDir, etcRoot = '/etc', varRoot = '/var', pathEnv = process.env.PATH,
  exec = execNeverThrow,
}) {
  let handle = null;
  let openError = null;
  const db = () => {
    if (!handle && !openError) {
      try {
        handle = openDb();
      } catch (err) {
        openError = err;
      }
    }
    if (openError) throw openError;
    return handle;
  };
  const ctx = { book, db, serverDir, booksDir, etcRoot, varRoot, pathEnv, exec };
  const sections = {};
  try {
    for (const [name, read] of Object.entries(SECTIONS)) sections[name] = runSection(() => read(ctx));
  } finally {
    if (handle) handle.close();
  }
  return { book, ok: Object.values(sections).every((s) => s.ok), sections };
}

/** @returns {0|1|2} */
function main(argv, env = process.env) {
  const args = argv.slice(2);
  if (args.length !== 1 || !/^[a-z0-9-]+$/.test(args[0])) {
    console.error(USAGE);
    return 2;
  }
  const resolveDbPath = require('../lib/dbPath');
  // Absolute in a file run and in a stdin run alike, and anchored on the file that locates the database.
  const serverDir = path.resolve(path.dirname(require.resolve('../lib/dbPath')), '..');
  const report = readResearchPreconditions({
    book: args[0],
    openDb: () => new (require('better-sqlite3'))(resolveDbPath(), { readonly: true, fileMustExist: true }),
    serverDir,
    // Test seam, as scripts/backfill-mt-locks.js:57: never set in production.
    booksDir: env.BOOKS_ROOT_OVERRIDE || path.join(serverDir, '..', 'books'),
  });
  process.stdout.write(
    JSON.stringify({ probe: 'read-research-preconditions', readAt: new Date().toISOString(), ...report }, null, 1) +
      '\n'
  );
  return report.ok ? 0 : 1;
}

// A file run sets require.main; a stdin run (`node -`) does not, and must still execute (read-apply-exposure.js).
const runDirectly = require.main === module || (module.id === '[stdin]' && process.argv[1] === '-');
if (runDirectly) {
  process.exitCode = 1; // a failure default: a run that dies before main() returns is never 0
  process.exitCode = main(process.argv);
}

module.exports = { readResearchPreconditions, readAutoCreateUsers, readG1d, readG1e, SECTIONS };
```

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/readResearchPreconditions.test.js`
Expected: PASS. `git status --porcelain`: only this task's files (the spawned runs wrote nothing; the database file's
hash is unchanged).

- [ ] **Step 5: Commit**

```bash
git add server/scripts/read-research-preconditions.js server/__tests__/readResearchPreconditions.test.js
git commit -m "feat(server): read-research-preconditions, a read-only probe for G-1d and G-1e"
```

---

### Task 6: the probe's system half (G-1c, G-1f, G-1g)

Spec §9 (G-1c, G-1f, G-1g), §5.19 (the MT lock marker leaks a time; G-1g), §6 item 14 (the request log); index decision
14; decisions 18, 19, 21, 22.

**Files:**
- Modify: `server/scripts/read-research-preconditions.js` — new `directiveLines`, `listDir`, `readG1c`, `readG1f`,
  `readG1g`; `SECTIONS` gains them, in the order `G-1c`, `G-1d`, `G-1e`, `G-1f`, `G-1g`
- Test: `server/__tests__/readResearchPreconditions.test.js` (three `describe`s; the require-set case widened; the
  missing-database case gains its system-section control)

**Interfaces:**
- Consumes: `mtLockPathFor` (`tools/lib/mt-lock.cjs:9-11`), `chapterFromDir` (`server/lib/chapterLabel.js:61-65`).
- Produces:
  - `readG1c(ctx) → { journald: { settings: { file, line }[], persistentDir: boolean, diskUsage: { ran, output } },
    nginx: { accessLog: { file, line }[] }, logrotate: { nginx: string[] | null } }`
  - `readG1f(ctx) → { sqlite3: { onPath: boolean, path: string | null } }`
  - `readG1g(ctx) → { unitCount: number, lacking: string[], lackingMtFile: string[] }` (entries `<chapterDir>/<module>`)

- [ ] **Step 1: Write the failing tests**

- `describe('G-1c (spec §9): journald retention and nginx’s request log')` — a temp `etcRoot` holding
  `systemd/journald.conf` (`[Journal]\n#SystemMaxUse=\nSystemMaxUse=500M\nStorage=persistent\n`),
  `systemd/journald.conf.d/10-local.conf` (`[Journal]\nMaxRetentionSec=1month\n`), `nginx/nginx.conf` (`http {\n
  access_log /var/log/nginx/access.log;\n # access_log off;\n}\n`), `nginx/sites-enabled/ritstjorn` (`server {\n
  server_name SENTINEL-HOST.example;\n  access_log /var/log/nginx/ritstjorn.access.log combined;\n}\n`) and
  `logrotate.d/nginx` (`/var/log/nginx/*.log {\n  daily\n  rotate 14\n  compress\n}\n`); a temp `varRoot` with
  `log/journal/`; an `exec` answering `journalctl --disk-usage` with `'Archived and active journals take up 1.2G in the
  file system.\n'`:
  - `it('reports the retention keys, the access_log lines and the rotation, and nothing else')` — `sections['G-1c']`
    equals `{ ok: true, journald: { settings: [{ file: 'systemd/journald.conf', line: 'SystemMaxUse=500M' }, { file:
    'systemd/journald.conf', line: 'Storage=persistent' }, { file: 'systemd/journald.conf.d/10-local.conf', line:
    'MaxRetentionSec=1month' }], persistentDir: true, diskUsage: { ran: true, output: 'Archived and active journals
    take up 1.2G in the file system.' } }, nginx: { accessLog: [{ file: 'nginx/nginx.conf', line: 'access_log
    /var/log/nginx/access.log;' }, { file: 'nginx/sites-enabled/ritstjorn', line: 'access_log
    /var/log/nginx/ritstjorn.access.log combined;' }] }, logrotate: { nginx: ['daily', 'rotate 14'] } }`; the commented
    lines are absent, and `JSON.stringify` of the section does not include `'SENTINEL-HOST'` (control: the file holds
    it).
  - `it('a box with none of these files reports empty findings, not a failure')` — an empty `etcRoot` and `varRoot`,
    and an `exec` answering `{ ran: false }`: `{ ok: true, journald: { settings: [], persistentDir: false, diskUsage:
    { ran: false, output: null } }, nginx: { accessLog: [] }, logrotate: { nginx: null } }`.
- `describe('G-1f (spec §9): is the sqlite3 command on PATH')`:
  - `it('finds an executable sqlite3 and skips a non-executable one')` — two temp dirs: the first holds `sqlite3` with
    mode `0644`, the second with mode `0755`; `pathEnv` lists the first then the second: `{ ok: true, sqlite3: {
    onPath: true, path: <second>/sqlite3 } }`. Control: `pathEnv` with only the first dir gives `{ onPath: false, path:
    null }`, and an empty `pathEnv` the same.
- `describe('G-1g (spec §9, §5.19): which study units lack an MT lock marker')` — a books tree in **its own**
  `fs.mkdtempSync` root, not the shared `beforeEach` root (which Step 1 below gives a `ch03/m94103` unit of its own, so
  the counts would read 5), passed as `ctx({ booksDir: <that root>/books })`, for `efnafraedi-2e`:
  `02-for-mt/ch01/m94201-segments.en.md` with its `02-mt-output/ch01/m94201-segments.is.md` and
  `m94201-segments.locked`; `ch01/m94202` with EN and MT, no marker; `ch02/chapter-metadata` with EN and MT, no marker;
  `appendices/m94203` with EN only; `ch01/m94204-segments(b).en.md` (legacy); `ch01/exercises-segments.en.md` (not an
  editable module, decision 22); a non-chapter directory `02-for-mt/tmp/m94205-segments.en.md`:
  - `it('lists every unit without a marker, and those without an MT file')` — `sections['G-1g']` equals `{ ok: true,
    unitCount: 4, lacking: ['appendices/m94203', 'ch01/m94202', 'ch02/chapter-metadata'], lackingMtFile:
    ['appendices/m94203'] }` (sorted as strings). `ch01/m94201` (locked), the legacy file, `exercises` and the `tmp`
    directory are the controls.
  - `it('never reads a marker’s body')` — make `m94201-segments.locked` unreadable (`fs.chmodSync(…, 0o000)`; skip
    the case when `process.getuid?.() === 0`, since root reads it anyway): the result is unchanged (presence is all it
    checks).
- The shared `beforeEach` fixture gains `books/efnafraedi-2e/02-for-mt/ch03/m94103-segments.en.md` (one SEG marker, no
  space after the colon), so `G-1g` has a tree to read in the spawned runs and their `ok: true` and exit 0 still hold.
- The missing-database case gains: `sections['G-1f'].ok === true` and `sections['G-1g'].ok === true` in that same run
  (the positive control that only the database sections failed).
- The require-set case gains `'../../tools/lib/mt-lock.cjs'`.

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/readResearchPreconditions.test.js`
Expected: FAIL — `sections['G-1c']`, `['G-1f']` and `['G-1g']` are `undefined`; the require set lacks `mt-lock.cjs`.

- [ ] **Step 3: Implement**

```js
const UNIT_ID = /^(m\d{5}|chapter-metadata)$/; // what the module route serves (validateModule, validateParams.js:43)
const JOURNALD_KEY = /^(Storage|SystemMaxUse|SystemKeepFree|SystemMaxFileSize|SystemMaxFiles|MaxRetentionSec|MaxFileSec|RuntimeMaxUse)\s*=/;
const ROTATION = /^(daily|weekly|monthly|yearly|rotate\s+\d+|maxage\s+\d+)\b/;

/** The trimmed lines of a file that match re, or null when the file cannot be read. Never throws. */
function directiveLines(file, re) {
  try {
    return fs.readFileSync(file, 'utf8').split('\n').map((l) => l.trim()).filter((l) => re.test(l));
  } catch {
    return null; // absent or unreadable: reported as no lines, never guessed
  }
}

function listDir(dir, filter = () => true) {
  try {
    return fs.readdirSync(dir).filter(filter).sort().map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

function readG1c({ etcRoot, varRoot, exec }) {
  const rel = (f) => path.relative(etcRoot, f);
  const tagged = (files, re) =>
    files.flatMap((f) => (directiveLines(f, re) || []).map((line) => ({ file: rel(f), line })));
  const sd = path.join(etcRoot, 'systemd');
  const du = exec('journalctl', ['--disk-usage']);
  const firstLine = (s) => (String(s || '').split('\n').find((l) => l.trim()) || '').trim().slice(0, 200) || null;
  const ng = path.join(etcRoot, 'nginx');
  return {
    journald: {
      settings: tagged(
        [path.join(sd, 'journald.conf'), ...listDir(path.join(sd, 'journald.conf.d'), (f) => f.endsWith('.conf'))],
        JOURNALD_KEY
      ),
      persistentDir: fs.existsSync(path.join(varRoot, 'log', 'journal')),
      diskUsage: { ran: du.ran, output: du.ran ? firstLine(du.stdout || du.stderr) : null },
    },
    nginx: {
      accessLog: tagged(
        [
          path.join(ng, 'nginx.conf'),
          ...listDir(path.join(ng, 'conf.d'), (f) => f.endsWith('.conf')),
          ...listDir(path.join(ng, 'sites-enabled')),
        ],
        /^access_log\b/
      ),
    },
    logrotate: { nginx: directiveLines(path.join(etcRoot, 'logrotate.d', 'nginx'), ROTATION) },
  };
}

function readG1f({ pathEnv }) {
  for (const dir of String(pathEnv || '').split(path.delimiter).filter(Boolean)) {
    const p = path.join(dir, 'sqlite3');
    try {
      fs.accessSync(p, fs.constants.X_OK);
      if (fs.statSync(p).isFile()) return { sqlite3: { onPath: true, path: p } };
    } catch {
      // not here, or not executable: keep looking
    }
  }
  return { sqlite3: { onPath: false, path: null } };
}

function readG1g({ book, booksDir }) {
  const { mtLockPathFor } = require('../../tools/lib/mt-lock.cjs');
  const { chapterFromDir } = require('../lib/chapterLabel');
  const forMt = path.join(booksDir, book, '02-for-mt');
  const units = [];
  for (const dir of fs.readdirSync(forMt).filter((d) => chapterFromDir(d) !== null)) {
    for (const f of fs.readdirSync(path.join(forMt, dir))) {
      if (!f.endsWith('-segments.en.md')) continue; // skips the legacy -segments(b).en.md files
      const moduleId = f.slice(0, -'-segments.en.md'.length);
      if (!UNIT_ID.test(moduleId)) continue; // skips exercises-segments.en.md, as listChapterModules does
      const mtOutput = path.join(booksDir, book, '02-mt-output', dir, `${moduleId}-segments.is.md`);
      units.push({
        unit: `${dir}/${moduleId}`,
        mt: fs.existsSync(mtOutput),
        locked: fs.existsSync(mtLockPathFor(mtOutput)), // presence only: never the body (spec §5.19)
      });
    }
  }
  const sorted = (xs) => xs.map((u) => u.unit).sort();
  return {
    unitCount: units.length,
    lacking: sorted(units.filter((u) => !u.locked)),
    lackingMtFile: sorted(units.filter((u) => !u.locked && !u.mt)),
  };
}
```

`SECTIONS` becomes `{ 'G-1c': readG1c, 'G-1d': readG1d, 'G-1e': readG1e, 'G-1f': readG1f, 'G-1g': readG1g }` (comment:
PR4 adds `G-1a` (crontab) and `G-1h`); `module.exports` gains the three readers. Extend the header's section list.

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/readResearchPreconditions.test.js`
Expected: PASS. Then, read-only, on this box (`HEAD`'s G-1g): `node server/scripts/read-research-preconditions.js
efnafraedi-2e > <scratch>/local.json; echo $?` — exit 0, or 1 with only `G-1d` and `G-1e` failing when this box has no
`pipeline-output/sessions.db`; `G-1g.lacking` is HEAD's list of chemistry units without a marker (spec §9: "at HEAD and
on production"). Keep `<scratch>/local.json` for Task 8; do not commit it. `git status --porcelain`: only this task's
files.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/read-research-preconditions.js server/__tests__/readResearchPreconditions.test.js
git commit -m "feat(server): read-research-preconditions reads G-1c, G-1f and G-1g"
```

---

### Task 7: `close-pending-edits` refuses once a unit of its book has opened

Spec §5.6 (`server/scripts/close-pending-edits.js` "is meant to run before the study, under the hold. This design does
not log its writes, so it must not run once any unit has opened"); decision 29. Placed in PR2 by the index (its PR2
row).

**Files:**
- Modify: `server/scripts/close-pending-edits.js` — `closePendingEdits(db, opts)`: one check after the hold check (the
  `const hold = holdFor(book); if (!hold) { refuse(…) }` block, `:70-76` at `ed10180c`); one bullet in the header's
  "Fails closed" list (`:15-25`)
- Test: `server/__tests__/closePendingEdits.test.js` (append two `it`s to `describe('close-pending-edits: refusals')`,
  `:188`)

**Interfaces:**
- Consumes: the `module_openings` table (Task 1); the script's `refuse(msg)` (`:67-68`); the test file's `run(overrides)`,
  `statusOf(id)` and `ids` (`:60-71`, `:73`, `:81-92`).
- Produces: `closePendingEdits(db, opts).refused` gains one message beginning `` `${book}: ${n} unit(s) have opened` ``
  when `module_openings` holds `n > 0` rows for the book; signature and return shape unchanged.

- [ ] **Step 1: Write the failing tests**

`server/__tests__/closePendingEdits.test.js`, inside `describe('close-pending-edits: refusals')`:

```js
  // G1.1 + G1.2 spec §5.6: this script logs no research event, so it must not run once a unit has opened.
  it('refuses once a unit of the book has opened, in a dry run as in a write, and writes nothing', () => {
    const open = db.prepare(
      `INSERT INTO module_openings (book, chapter, module_id, opened_at_ms, inflight_count)
       VALUES (?, 3, 'm68700', 1700000000000, 0)`
    );
    open.run('liffraedi-2e');
    // control: another book's opening does not count
    expect(run({ write: false })).toMatchObject({ ok: true, refused: [] });
    open.run(BOOK);
    const opened = [expect.stringMatching(/^efnafraedi-2e: 1 unit\(s\) have opened/)];
    expect(run({ write: false }).refused).toEqual(opened);
    const r = run();
    expect(r.ok).toBe(false);
    expect(r.refused).toEqual(opened);
    expect(db.prepare(`SELECT id FROM segment_edits WHERE status != 'pending'`).all()).toEqual([]);
  });

  it('a database without module_openings (before migration 054) counts as none opened', () => {
    db.exec('DROP TABLE module_opening_inflight; DROP TABLE module_openings');
    const r = run();
    expect(r.refused).toEqual([]);
    expect(ids.clean.map(statusOf)).toEqual(['approved', 'approved']); // the write went through
  });
```

- [ ] **Step 2: Run them**

Run: `npx vitest run server/__tests__/closePendingEdits.test.js`
Expected: FAIL — the first new case: after the chemistry opening, `run({ write: false }).refused` is `[]` (nothing
reads the table yet). The second passes, today and after (the control for the missing-table reading). Every existing
case passes.

- [ ] **Step 3: Implement**

After the hold check in `closePendingEdits`:

```js
  // G1.1 + G1.2 spec §5.6: this script writes raw SQL and logs no research event, so it must not run once any unit of
  // this book has opened. A database without module_openings (before migration 054) has none: while that table is
  // missing, a serve that would open a unit answers 503 instead (server/services/moduleOpenings.js).
  const hasOpenings = db
    .prepare("SELECT 1 AS hit FROM sqlite_master WHERE type = 'table' AND name = 'module_openings'")
    .get();
  const opened = hasOpenings
    ? db.prepare('SELECT COUNT(*) AS n FROM module_openings WHERE book = ?').get(book).n
    : 0;
  if (opened > 0) {
    refuse(
      `${book}: ${opened} unit(s) have opened (module_openings), and this script's writes are not logged as ` +
        'research events; it must not run once any unit has opened (G1.1 + G1.2 spec §5.6)'
    );
  }
```

In the header's "Fails closed" list, after the hold bullet: `- no unit of the book may have opened (G1.1 + G1.2 spec
§5.6): this script logs no research event, so it runs only before the study;`.

- [ ] **Step 4: Run it**

Run: `npx vitest run server/__tests__/closePendingEdits.test.js`
Expected: PASS. `git status --porcelain`: only this task's files.

- [ ] **Step 5: Commit**

```bash
git add server/scripts/close-pending-edits.js server/__tests__/closePendingEdits.test.js
git commit -m "feat(server): close-pending-edits refuses once a unit of its book has opened (spec §5.6)"
```

---

### Task 8: run the probe on production — READ-ONLY, only on [USER]'s go, before PR2 merges

Spec §9 (G-1c…G-1g; "Each is read-only. Production reads use a committed script sent on stdin"), §13a (PR2 "merged
only after G-1d has run"), §4 item 3 of "What [USER] approved" (the choice G-1d may raise), R6; index § Production
checks. This task writes nothing on production and is not part of the code review. It may run as soon as Tasks 5 and 6
are committed (it needs no route code and no deploy); it must be complete before the merge.

**Files:**
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (a new top `⏭` entry)

- [ ] **Step 1: The checkout is this branch, clean, with Tasks 5 and 6 committed**

Run: `git status --porcelain; git branch --show-current; git log --oneline -3 -- server/scripts/read-research-preconditions.js`
Expected: no status lines; this PR's branch; Task 6's and Task 5's commits.

- [ ] **Step 2: [USER]'s go, then the production run**

Show [USER] the command and ask: [USER] runs it, or authorises it. The shape is `read-pending-edits.js:15-18`'s:

```bash
ssh <prod> "cd <repo>/server/scripts && node - efnafraedi-2e" \
  < server/scripts/read-research-preconditions.js > <scratch>/preconditions.json; echo "exit $?"
```

Expected: `exit 0`; one JSON object whose `ok` is `true` and in which every section is `ok: true`. A section that is not
ok: stop and report its `error` and `message`; do not merge.

- [ ] **Step 3: Check the output names no editor before it goes anywhere**

Run: `grep -ac '@' <scratch>/preconditions.json` (expected `0`: no address) and read the file whole. It holds user ids,
roles, chapter numbers, segment ids, counts, configuration lines and the `AUTO_CREATE_USERS` value, and nothing else
(the test of Task 5 pins this; this is the human look). Anything else: stop and report.

- [ ] **Step 4: Record it**

A new top `⏭` entry in the register: the date; the probe's commit on this branch; the output verbatim in a fenced block;
and one line per check:
- **G-1d:** `enforcement`, `studyBookEnforced`, `assignedChapters` and `users` (ids and roles), and
  `autoCreateUsers.effective` with its meaning read from `signInPolicy` (`server/services/auth.js`).
- **G-1c:** the journald retention settings and disk usage, the `access_log` lines and the rotation lines: what the
  consent text says about the request log (§6 item 14) and what G1.15's rule must cover.
- **G-1e:** the in-flight segments per module (the snapshot each will hold at opening; spec §5.5 expects them in
  approved-but-unapplied rows, §12 correction 1) and the applied rows whose faithful file is gone; and, from
  `reattach`, which of them will write the opening warning.
- **G-1f:** whether `sqlite3` is installed (only `backup-db.sh` and `verify-db-backup.sh` need it).
- **G-1g:** `lacking` on production beside Task 6's `HEAD` list: no unit opens until every study unit has a marker
  (G1.7, spec §5.19); not this PR's to fix.
Commit the entry on this branch (`git add docs/plans/2026-07-21-post-item17-followup-campaign.md`; `git commit -m
"docs(register): G-1c…G-1g read on production for PR2"`).

- [ ] **Step 5: The §9 choice, if chemistry holds assignment rows**

If `G-1d.assignments` is `[]`, record "no chemistry assignment rows: no unit can open until G1.13 assigns, after
G1.23's switch-on (R6)" and go on. Otherwise ask [USER] to choose, and record the choice in the same entry:
- **(a) remove them before the step ships.** [USER] removes the rows (the admin page's chapter assignments); then
  re-run Step 2: `G-1d.assignments` must be `[]` (the control that the removal took), and record that run's output
  too. **Tell [USER] what removing them does to editors' access before asking**, from the `studyBookEnforced` value
  G-1d reported. The save route checks `requireBookAccess` (`routes/segment-editor.js:338-343`), which passes admins
  and the book's head editors (`requireRole.js:257-265`) and asks `hasChapterAccess` for everyone else:
  - **enforcement on:** access is default-deny (`userService.js:671-675`), so the editors whose rows are removed
    **cannot save chemistry at all** until G1.13 assigns them again;
  - **enforcement off:** a book with no assignment rows is legacy full access (`:678`), so once every chemistry row is
    gone, **every editor can save in every chemistry chapter**, including editors who were limited to some chapters
    before.
  Either way viewing is unaffected: the module GET needs only `requireRole(ROLES.EDITOR)` (`:267`).
- **(b) keep them.** Record which chapters hold rows, and that each of their units opens at its first serve by an
  assigned editor after PR2's deploy, before the switch-on, and so never gets suggestions (G1.23 §6.2).
PR2 merges only after this step (spec §13a).

---

## Interfaces produced for later PRs

The server modules are CommonJS under `server/`; tests reach them through `createRequire(import.meta.url)`.

### `server/migrations/054-module-openings.js` (Task 1)

```sql
module_openings (book TEXT NOT NULL, chapter INTEGER NOT NULL, module_id TEXT NOT NULL,
                 opened_at_ms INTEGER NOT NULL CHECK (opened_at_ms > 0),
                 inflight_count INTEGER NOT NULL CHECK (inflight_count >= 0),
                 PRIMARY KEY (book, chapter, module_id))                       -- no user column (R3)
module_opening_inflight (book, chapter, module_id, segment_id TEXT NOT NULL,
                         occurrence INTEGER NOT NULL CHECK (occurrence >= -1), -- -1: every occurrence
                         PRIMARY KEY (book, chapter, module_id, segment_id, occurrence),
                         FOREIGN KEY (book, chapter, module_id) REFERENCES module_openings ON DELETE CASCADE)
```

- **PR5** (`opening-eligibility.js`) reads `module_openings.opened_at_ms` on the server only and writes a per-module
  yes/no, never the time (spec §5.22). **Research figures** may read `module_opening_inflight` (A1, spec §5.22), never
  `module_openings`' times.
- **G1.15** deletes an opening and its snapshot in one statement (the cascade).

### `server/services/moduleOpenings.js` (Task 2)

```ts
OPENING_UNRECORDED: Readonly<{ status: 503, code: 'OPENING_UNRECORDED', message: string }>   // Icelandic, approved
openingPredicate(conn, { book, chapter, moduleId, providerId }):
  { holds: boolean, reason: 'not-study-book' | 'no-user' | 'no-assignment' | 'already-opened' | 'holds' }
snapshotRows(segments: { segmentId }[], edits: SegmentEditRow[]):
  { rows: { segmentId: string, occurrence: number }[],   // sorted; -1 subsumes the id's other rows
    warnSegments: string[] }                             // ids with an in-flight row whose origin is not 're-attach'
recordOpening(conn, { book, chapter, moduleId }, snapshot):
  { opened: false } | { opened: true, inflightCount: number, inflight, warnSegments }   // never the time
openOnServe(conn, { book, chapter, moduleId, providerId, served, segments, edits }):
  { status: 'skipped', reason } | { status: 'unrecorded', cause: 'predicate' | 'mint' | 'step' }
  | { status: 'opened', opening }                                                         // never throws
moduleOpenedDetail(served, opening): { servedVersionIds, duplicatedIds, inflightCount }   // PR3's event detail
_setTestClock(fn: (() => number) | null): void
```

It reads no `process.env` (so PR3's flag-coverage scanner may list it at no cost) and exposes no reader of a stored
opening: **G1.23 adds one** (for example `readOpening(conn, key) → { opened: boolean, inflight }`, with no time) when its
step needs the stored snapshot.

### The module route (Task 3)

- `GET /api/segment-editor/:book/:chapter/:moduleId`: `503 { error: 'OPENING_UNRECORDED', message }` when
  `openOnServe` is `unrecorded`; otherwise PR1's response, key for key.
- The route-local `step` (the `openOnServe` result) and the comment marking where PR3 calls `record`.

### `server/lib/schemaHealth.js` (Task 1)

`EXPECTED_SCHEMA.tables` gains `module_openings` and `module_opening_inflight` (every column). PR3 appends
`book_switch_events`, `research_consent` and `research_capture_losses`; PR4 `research_deletions` and
`research_derived_datasets`.

### `server/__tests__/researchBoundary.test.js` (Task 3)

PR2 leaves one `describe`, `filesNaming(root, pattern)` (every `.js` file under a root whose bytes match; PR3 can reuse
it for `server/routes/` against `researchDb` and `editor_keys`), `SENTINEL_MS`, and module-level bindings under
`nodeFs`, `nodePath`, `nodeOs`, `OpeningDb`, `migrateAll` and `pr2*` names. Its `describe` sets and restores its own
books root and closes its own handle, so a later `describe` inherits nothing from it. `ALLOWED_COLUMNS` and
`MODULE_JSON_ALLOWED` are unchanged.

### `server/__tests__/helpers/servedFixture.js` (Task 3)

`invokeChain(router, method, routePath, req) → Promise<{ status, body }>`: the whole middleware chain, for cases
middleware answers (a visitor's 403, a bad chapter's 400). `req` needs `params`, `headers.authorization` (`Bearer` +
`auth.createToken(user)`) and `cookies`.

### `server/scripts/read-research-preconditions.js` (Tasks 5, 6)

```ts
SECTIONS: Record<'G-1c' | 'G-1d' | 'G-1e' | 'G-1f' | 'G-1g', (ctx) => object>   // PR4 adds 'G-1a' (crontab), 'G-1h'
readResearchPreconditions({ book, openDb, serverDir, booksDir, etcRoot?, varRoot?, pathEnv?, exec? }):
  { book, ok: boolean, sections: Record<name, { ok: true, ... } | { ok: false, error, message }> }
// ctx: { book, db: () => Database (lazy, read-only, shared), serverDir, booksDir, etcRoot, varRoot, pathEnv, exec }
// exec(cmd, args) → { ran, code, stdout, stderr }; never throws
```

- **PR4** appends its sections to `SECTIONS` and widens the test's require set only with modules production has; its
  crontab reader returns lines that name `pipeline-output/` copies, never a whole crontab (a crontab can hold secrets).

### Client (Task 4)

`UI.segmentEditor.openingUnrecorded` (approved wording, decision 28); `loadModule`'s catch keys on `err.status === 503
&& err.data.error === 'OPENING_UNRECORDED'`, and on that path, when `#editor-container` is on screen, writes the panes'
texts with `saveDraft()`, stops the draft timer, empties `dirtyEdits`, releases the tab claim and hides
`#editor-container` and `#save-status-bar`, discarding no draft. A later PR that adds a load-error code with the same
"no save in between" need reuses that branch.

### `server/scripts/close-pending-edits.js` (Task 7)

Refuses, in a dry run as in a write, once `module_openings` holds a row for its book; a database without the table
counts as none opened. Later PRs keep the refusal.

## Before the PR

1. **The gate, as CI runs it, on the branch's tip** (index § Global Constraints): `npm test` from the repository root
   (diff the failing set by name against `main`'s, never the count); `npm run lint` **and** `npm run format:check`;
   `npm run docs:check` (Task 3 touches `server/routes/**`; expected clean, decision 27); `cd server && CI=1 npm run
   test:e2e` (Tasks 3 and 4 touch a route and `server/public/js/`; every existing chemistry serve still answers as
   before, decision 14). No dependency is added, so `npm audit` is not part of this gate. `git status --porcelain`
   empty.
2. **Re-check the migration number** (`ls server/migrations`) against `main` just before merging (index decision 9).
3. **A whole-branch adversarial review: a blind pair,** Opus and Fable on the same brief, neither seeing the other's
   findings (**[USER] commissioned the Fable half on 2026-11-04**). A mutation pass restores from a golden `cp`, never
   `git checkout`, and `git status --porcelain` runs the moment any reviewing agent goes quiet. Fold confirmed
   findings in as their own commits. The Review Focus above is the brief's input-case list.
4. **Both Icelandic strings are approved as proposed** (decision 28; index decision 13). If either changed after
   2026-11-04, [USER] checks the new text before the PR is opened.
5. **Task 8 is complete:** the production run is in the register and, if chemistry held assignment rows, [USER]'s §9
   choice is recorded (spec §13a).
6. **Push, open the PR (draft), and deploy only on [USER]'s go.** Merge as a **merge commit**, never squash or rebase.
   A push to `main` from dev puts prod's content backup behind until the next deploy (CLAUDE.md § Content delivery).
   After the deploy, a chemistry unit opens at its first serve by an editor holding an assignment row for its chapter:
   under R6 none does until G1.13 assigns; under §9 choice (b), the units of the recorded chapters open then. A page
   loaded before the deploy that meets a 503 shows the bare code (Review Focus 12).
7. A new top entry in the register: what merged, what was measured, what is next.

### Answers ([USER], 2026-11-04)

[USER] answered "Yes for all" to the index's questions, with four clarifications the same day (index § Answers). For
this plan:

- **The Icelandic wording (decision 28):** approved as proposed.
- **Decision 4** (a throw in the `users` or assignment lookup, on a chemistry serve, answers 503 rather than serving
  the unit unrecorded): approved; recorded in the spec's `✏️ AMENDED 2026-11-04` block.
- **Decision 3** (a deactivated account whose sign-in token is still valid opens a unit it holds an assignment row
  for, as the spec's predicate says): as written.
- **Decision 2** (the snapshot's foreign key to its opening, with `ON DELETE CASCADE`): yes.
- **Decision 13** (Task 4 takes the pane away only for `OPENING_UNRECORDED`; other failed reloads keep today's
  behaviour, which its E2E control pins for a 500): as written.
- **Decision 29** (Task 7): the code guard in `close-pending-edits.js` is confirmed.
- **Decision 14** (seed a `users` row and an assignment row into E2E, to prove an opening end to end): a later change,
  recorded in the register, not in PR2.
- **Still open, for Task 8 at PR2's time:** whether [USER] runs the probe on production or authorises the executing
  session to run it; and, if chemistry holds assignment rows, which of the §9 choices.

## Handoff to PR3

Binding on PR3's plan ([G1.2, the event log](2026-11-03-g11-g12-pr3-event-log.md)).

**PR3 may rely on:**
- **The seam in the module route** (Task 3): `const step = moduleOpenings.openOnServe(conn, { … })` runs before
  `res.json`, and a comment marks where PR3 emits `module-opened`: after the opening's commit (it has committed when
  `openOnServe` returns), only when `step.status === 'opened'`, with actor `req.user.id`, book, chapter and module
  from the request, `servedVersionId` `NULL` (spec §5.9's source table) and detail
  `moduleOpenings.moduleOpenedDetail(served, step.opening)` = `{ servedVersionIds, duplicatedIds, inflightCount }`.
- **`schemaHealth.EXPECTED_SCHEMA`** to append PR3's tables in its migration commit, and **`researchBoundary.test.js`**
  to append PR3's `describe`, reusing `filesNaming`.
- **The next migration number in merge order** (predicted `055`).
- **`moduleOpenings.js` reads no `process.env`;** listing it in the flag-coverage scanner's files (spec §5.13) costs
  nothing and guards a future read.

**PR3 must not change:**
- the predicate, the snapshot, the one-transaction step, or the 503 decision: `record` runs after the commit and
  **never turns a serve into a 503, or a 503 into a 200**. The 503 is about `sessions.db` only; T10's "an opening
  succeeds with the research file down" depends on it;
- the module response's keys (T17, PR1's and PR2's `describe`s);
- `openOnServe`'s never-throw contract, and `OPENING_UNRECORDED`'s code and status;
- the migration Task 1 adds.
