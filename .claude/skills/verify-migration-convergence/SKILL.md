---
name: verify-migration-convergence
description: Check that the server's migrations still reach the full schema after a crash at ANY commit during a build (server/verification/migration-convergence/). Use when a change adds, edits, reorders or removes a migration in server/migrations/, touches server/services/migrationRunner.js, or changes a library a migration imports — before you trust the change.
---

# Verify migration convergence after a crash

## What this protects, in plain words

**Promise:** every server start runs every migration (`server/services/migrationRunner.js` keeps no record of
what has run), and the migrations are meant to be safe to re-run, so a start always ends at the full schema.

**Harm when it breaks:** the runner counts a migration that throws `duplicate column` or `already exists` as
**skipped**. If the server dies part-way through a migration's first application, the next start's re-run can
throw on the part that already landed, be counted as skipped, and **never finish**. Boot carries on
(`failLoudOnMigrationErrors` only sees errors, and there are none), and `server/lib/schemaHealth.js` lists only the
tables of migration 053 onward, so nothing reports it. The missing column or index surfaces later as a failing
query, swallowed or not.

**Property:** starting from an empty database, a crash just after ANY commit of the real migration run, followed by
clean restarts, reaches the same database as a crash-free build (its fixed point), with no runner errors.

## How it is checked

Bounded exhaustive enumeration over the **real** `runAllMigrations()`; no model.

- `crash-hooks.js` patches better-sqlite3's write calls in a child process. **A crash point is a SQLite COMMIT**:
  after a write that leaves the connection outside a transaction, or after an outermost `db.transaction(fn)`
  returns. A crash inside an open transaction rolls it back, which is the same state as crashing before it began.
  **Multi-statement `exec` strings are split** and get a point after each statement, because SQLite autocommits
  each one and a process can die between them.
- `child.js` is one server start: hooks, then the real runner, against `SESSIONS_DB_PATH` (a throwaway file).
- `check.js` lists every crash point of a fresh build (about 216), then for each one: a child dies by **SIGKILL**
  just after that commit, and clean children restart it until two starts in a row leave the same database.
  `snapshot.js` compares that with the reference **by structure, not SQL text**: columns, indexes, foreign keys
  via pragmas; triggers and views as normalised SQL; rows as content (an `INTEGER PRIMARY KEY` is dropped and a
  foreign key to one is replaced by the referenced row's content, because after a crash the same rows get
  different `AUTOINCREMENT` numbers; timestamps are blanked).
- Each point is **converged**, **short** (no errors, wrong database: silent), **wedge** (errors at every
  restart: the server never boots again), or **unsettled** (no fixed point in 4 starts). Only converged passes.
- **Controls**, all checked every run: the crash-point list is identical across two clean runs; the hooked build
  equals the plain runner's (the `exec` split changes nothing); a clean build has a fixed point with no errors;
  every crash child died by SIGKILL at exactly the commit recorded for its point.

## Known findings (pinned; the check expects them)

Pins are narrow: per migration (the one on the stack at the crash point), per class, with the exact list of
differences. A failure anywhere else, or with other differences, prints `FAIL`; a pin that stops failing is a
`FAIL` too, so a fix forces its pin out. Fixing any of these is a product change for [USER].

Both share one shape: **the re-run's FIRST statement throws on a crash-partial state, so the rest never runs.**
013 and 014 had it too (register §C250); each now runs in one `db.transaction`, 014 also guards each column so an
already-stranded database is repaired (`server/__tests__/migration014.test.js`), and `mutate.js`'s 014 BREAK shows
the check catches that fix being reverted.

| Migration | Crash window | Left behind for good | Harm on today's code |
|---|---|---|---|
| `024-fix-discussions-fk` | inside its one-`exec` table rebuild, before the `RENAME` | stray `terminology_discussions_new` table | cosmetic: 032 later drops the legacy table itself |
| `026-nullable-icelandic` | same, before its `RENAME` | stray `terminology_terms_new` table | cosmetic, same reason |

**A second finding, about the first boot (no crash needed):** a fresh database's first start is **not** the full
schema; the second start is. 022 rebuilds `users` (`DROP` + `RENAME`), discarding the `idx_users_role` and
`idx_users_is_active` indexes and the `update_users_timestamp` trigger that 006 created, and 006 restores them on
the next start; 049 registers books after 032 seeded `book_subject_mapping`, and 032 fills them in on the next
start. Pinned as `KNOWN_FIRST_BOOT_DIFFS`. It matters for a fresh clone, a new box, or the E2E seed, which start
once; production has restarted many times.

## Does your change touch the verified code?

```sh
git diff --stat 5ee99b0b1 -- server/services/migrationRunner.js server/migrations/ \
  server/lib/migrationSchema.js server/lib/domains.js server/lib/houseStyleTerms.js
```

Empty output: the check still describes the code. Any output, or a new file in `server/migrations/`: run the check.
A new migration is the common case. It adds crash points, so the point count changes; that is expected.

## Run the check

From the repo root (about 4 minutes; it prints its verdict only at the end, so give it a 10-minute timeout or run
it in the background):

```sh
node server/verification/migration-convergence/check.js
node server/verification/migration-convergence/check.js --only 93    # one crash point, seconds
```

A clean run ends `OK: every crash point converges or fails only as pinned; controls hold` and exits 0, after one
`known finding still present` line per pin. To check a single point by hand, `--only <n>` runs the controls and that
point; the numbers come from the listing (a new migration shifts every later number, which is why pins use names).

To prove the check can still fail, after editing it or before trusting it on a new kind of change, run in the
background (about 12 minutes):

```sh
node server/verification/migration-convergence/mutate.js
```

It applies three scratch changes to the real files, restoring each from a golden copy and comparing bytes:
- **BREAK 060**: loses `IF NOT EXISTS` on its `CREATE TABLE`; the check must report a new SHORT on 060;
- **BREAK 014**: back to three bare `ALTER`s (the §C250 fix reverted; its guards alone would still repair a
  crash, so removing only the transaction is not a break); the check must report a SHORT on 014;
- **FIX 024**: its table rebuild runs in one `db.transaction`; the check must report 024's pin as no longer
  failing, and nothing else.

Exit 0 with `targets restored byte for byte: yes` means all three were seen. If it dies part-way, run
`git status --porcelain` at once.

## Reading a failure: real bug or harness error?

- **`point N (<migration>) after "<sql>": SHORT — differs … in: …`**: a crash after that commit leaves a database
  the restarts never repair. Reproduce with `--only N`. Read the migration: the usual cause is a re-run whose first
  statement throws on what the crash left (`ALTER … ADD COLUMN` with no guard, `CREATE TABLE` without
  `IF NOT EXISTS`), or several statements with no transaction. Real, unless the diff is only a value the snapshot
  should treat as volatile (a new timestamp column not named `*_at` and without a time default): then teach
  `snapshot.js`, do not pin it.
- **`WEDGE — runner errors: …`**: every restart reports that error, so `failLoudOnMigrationErrors` exits 1 and the
  server never boots. Always real and serious.
- **`UNSETTLED`**: the database keeps changing across 4 starts: a migration that re-applies something every start.
- **`the crash run did not die at its point`**: harness error. The crash-point list moved under the run (a
  migration whose writes depend on something nondeterministic), or the label comparison broke.
- **`hooked build differs from the plain runner's`**: the `exec` splitter in `crash-hooks.js` mis-split an SQL
  string (a new construct: a trigger body, a quoted `;`). Fix `splitStatements`; the check is untrustworthy until
  this control passes.
- **`first boot is short in a NEW way`**: a migration now leaves work for the second start. Real; decide whether
  to fix or pin it in `KNOWN_FIRST_BOOT_DIFFS`.
- **`pinned finding no longer failing`**: if you fixed it on purpose, remove the pin from `KNOWN_CRASH_FINDINGS`
  and this skill's table; otherwise find out what changed.

## When your change is intended: update the check

- **A new migration** needs nothing: its commits join the enumeration. Make it converge: guard each statement
  (`IF NOT EXISTS`, a column check), or run it in one `db.transaction`. Note a migration that catches its own
  errors (the 048 never-throw shape) still has to converge: catching an `already exists` hides the same stranding.
- **A fix for a pinned finding** turns its pin into a `FAIL`; remove the pin and the table row.
- **A new snapshot rule** (a volatile column, a new object type): change `snapshot.js` and re-run the full check
  plus `mutate.js`; a rule that blanks too much hides real findings.

## Scope: what a pass covers, and what it does not

- **Covered:** every commit of a build from an EMPTY database, one crash (SIGKILL), clean restarts, the real runner
  and the real migrations.
- **Not covered:**
  - **An existing database** (production upgrading through a new migration). The empty-start crash at a
    migration's commit is the same schema state, but data-dependent branches (rows present, legacy tables present)
    are not exercised. 001's own guard, for example, only fires on a database that has the legacy `sessions` table.
  - **Two crashes**, or a crash during the restart.
  - **Power loss**: a kill keeps every committed write (SQLite's journal); torn writes and fsync are not tested.
  - **Concurrent writers** during boot.
  - `schemaHealth`, `/api/health` and the research database (`researchDb.openAtBoot`, its own schema).
- **Assumption:** surrogate ids do not matter. On a fresh build nothing outside the database refers to
  `registered_books.id`; this is what lets the snapshot ignore `AUTOINCREMENT` numbers.

## Coverage record

**Sync commit: `5ee99b0b1`.** The check was last confirmed to drive the code below at this commit.

| What | Code (open it to check) |
|---|---|
| the runner, its skip rule, its migration list | `server/services/migrationRunner.js` `runAllMigrations` |
| every migration's `up(db)` | `server/migrations/001-*.js` … `060-*.js` (all 60 at the sync commit) |
| libraries migrations import | `server/lib/migrationSchema.js`, `server/lib/domains.js`, `server/lib/houseStyleTerms.js` |
| what boot does after the runner (harm, not checked) | `server/index.js` (`failLoudOnMigrationErrors`), `server/lib/schemaHealth.js` |

Files: `server/verification/migration-convergence/check.js` (the check), `crash-hooks.js`, `child.js`,
`snapshot.js`, `mutate.js` (proves it can fail). Move the sync commit forward only after a full `check.js` run passes
at the new commit and you have confirmed the table above still names the code.
