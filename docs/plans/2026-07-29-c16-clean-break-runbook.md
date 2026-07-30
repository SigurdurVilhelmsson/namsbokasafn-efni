# C16 clean break — migration runbook

**Date:** 2026-07-29 · **For:** whoever executes the clean break, on the night it runs.
**Spec:** [`docs/superpowers/specs/2026-07-29-segment-edit-reattach-design.md`](../superpowers/specs/2026-07-29-segment-edit-reattach-design.md)
**Register item:** C16, in [`2026-07-21-post-item17-followup-campaign.md`](2026-07-21-post-item17-followup-campaign.md)
**Scripts:** `scripts/export-segment-edits.js` · `scripts/reattach-segment-edits.js` · `scripts/backfill-mt-locks.js`

⚠️ Steps are ordered. Do not reorder. Each gate is verifiable — verify it, do not assume it.

⚠️ **Run every command from the repo root.** Several use repo-relative paths, and one
(`sqlite3`) will *create* a file rather than fail if the path is wrong.

⚠️ **Every destructive step is scoped to `books/efnafraedi-2e/`.** Never glob a module id
across `books/` — `books/__e2e-fixture__/` contains a file at the *same relative path* with the
*same module id*. See the warning in Step 3.

---

## Gate 0 — preconditions (all four, before anything else)

**First, resolve the DB path.** Do this before any other command, and use `"$DB"` everywhere
below. Never type a relative path at `sqlite3`: it **creates** a database rather than failing,
so a wrong or empty path silently operates on something that is not prod's DB. Measured on an
empty path, `sqlite3 "" "VACUUM INTO '/tmp/probe.db'"` **exits 0 and writes a 4096-byte file** —
a backup-shaped artefact containing none of your data. That is the worst possible failure at
item 4 below.

```bash
DB=$(node -e "console.log(require('./server/lib/dbPath.js')())")
ls -l "$DB"      # must ALREADY exist and be non-trivial in size.
                 # If this fails, STOP — you are in the wrong place or on the wrong box.
```

- [ ] `$DB` resolved and confirmed to exist: ______________________
- [ ] **Off-box DB backup (A2) exists AND a restore has been tested.** After the re-MT the
      snapshot is the only representation of the editorial work outside a gitignored SQLite
      file on one host. This is a hard gate, not a recommendation.
- [ ] **Editorial server stopped.** No concurrent `segment_edits` writes; no reader can see a
      half-written `02-mt-output`. Confirm the process is down, not merely idle.
- [ ] **`git-backup.sh` cron paused on prod.** It commits `books/` every 2h while the file work
      happens on dev; left running it commits a half-migrated tree.
- [ ] **Fresh `sessions.db` copy taken with the server stopped.** Use
      `sqlite3 "$DB" "VACUUM INTO '<dest>'"` — the DB is in WAL mode and a plain `cp` can
      omit committed data. **Then `ls -l` the destination and sanity-check its size against
      `$DB`.** A 4096-byte result means `$DB` was empty and you have backed up nothing.

## Step 1 — snapshot the editorial state (prod, read-only)

Uses the `$DB` resolved in Gate 0. If this is a new shell, re-run that block first.

```bash
node scripts/export-segment-edits.js \
  --book efnafraedi-2e \
  --modules m68663,m68664,m68699,m68700 \
  --out /path/off-box/c16-snapshot.json
```

- [ ] Row count recorded here: ______
- [ ] ⚠️ **If it is much larger than 62, stop and re-size the review pass.** 62 counts only
      *applied* edits visible on disk; the DB may additionally hold `pending`, `discuss` and
      `rejected` rows that never reached a faithful file. **The export is the authority and 62 is
      a floor, not a total.**
- [ ] Snapshot copied off-box, and the copy opened to confirm it is not empty or truncated.
- [ ] ⚠️ **More than one restorable row can share one editor+segment key** — an `approved` row and
      a later `pending` row by the same editor coexist legitimately, and only one of them can be
      restored. You do not need to look for these by hand: Step 4b's dry run exits **4** and names
      each colliding key. This is the concrete form the "62 is a floor" warning takes.

⚠️ **The snapshot is the only complete record.** It holds the `rejected` and `superseded` rows
that are deliberately never restored (spec §7). Step 4a mutates row statuses in prod; it must
not run until this snapshot exists and has been verified off-box.

## Step 2 — capture the slug map (dev, BEFORE clearing anything)

- [ ] **First: confirm dev is at prod's latest content commit.** Prod renders into its own
      `05-publication/` on "Vista + Birta", and `git-backup.sh` — which Gate 0 just paused — is
      what pushes those files. So if prod rendered anything not yet pushed, or dev is behind
      prod's last content commit, this list is **missing filenames and the slug map is silently
      incomplete**. Either bring dev level with prod's content commit, or capture the list on
      prod instead.

```bash
find books/*/05-publication -name '*.html' | sort > /path/off-box/published-before.txt
```

- [ ] ⚠️ **This is the only moment the old filenames exist.** After the regeneration they are
      gone, and vefur needs the old→new map for redirects — since its PR #200 ours is the only
      side that still knows them. Do not skip this.

## Step 3 — the clean break (dev)

- [ ] Delete the 4 faithful files. They hold old-extraction content under old ids; left in
      place, `loadModuleForEditing` reads them as the baseline and shows the editor old text
      against new English (spec §5.1). **Four literal paths — no globs, no brace expansion:**

      books/efnafraedi-2e/03-faithful-translation/ch01/m68663-segments.is.md
      books/efnafraedi-2e/03-faithful-translation/ch01/m68664-segments.is.md
      books/efnafraedi-2e/03-faithful-translation/ch03/m68699-segments.is.md
      books/efnafraedi-2e/03-faithful-translation/ch03/m68700-segments.is.md

  > ⚠️ **DO NOT reach for `find books -name 'm68663-*'`.** There is a fifth file at
  > `books/__e2e-fixture__/03-faithful-translation/ch01/m68663-segments.is.md` — the same
  > module id, the same relative path, a different book. It is E2E fixture state and deleting
  > it breaks the test suite. Everything you touch here lives under
  > `books/efnafraedi-2e/`.
  >
  > Leave the `.bak` siblings in `ch01/` alone — nothing reads them, and they are your local
  > safety net on top of git history and the snapshot.

- [ ] Clear the `.locked` markers for those 4 modules — **the irreversible step**, and only
      after Gate 0 and Step 1 are both verified. Again, four literal paths:

      books/efnafraedi-2e/02-mt-output/ch01/m68663-segments.locked
      books/efnafraedi-2e/02-mt-output/ch01/m68664-segments.locked
      books/efnafraedi-2e/02-mt-output/ch03/m68699-segments.locked
      books/efnafraedi-2e/02-mt-output/ch03/m68700-segments.locked

- [ ] Delete the `05-publication/<track>/` tree of **each book you are re-rendering**, before
      re-rendering it (spec §12.1). Do **not** render on top — that is what leaves stale files
      like the chemistry ch10 duplicate (`10-5-fast-astand-efnis.html` *and*
      `10-5-fastur-efnishamur.html` for one module). Name each book's path explicitly; do not
      `rm -rf books/*/05-publication`.
- [ ] Re-extract → re-MT → re-inject → re-render.
- [ ] Commit and push.

## Step 4 — re-attach (prod)

- [ ] `git pull` on prod. **No restart, no deploy** — content is read from disk per request, and
      a real deploy is A4-gated.

### Step 4a — mark the pre-break rows superseded (BEFORE the apply)

⚠️ **Run Step 4b's DRY RUN before this step.** The dry run opens no database — it reads only the
snapshot and `books/efnafraedi-2e/02-mt-output/` — so it is safe to run first, and it is the only
thing that can tell you whether the migration is going to abort. Three of its exit codes are
fatal, and **4a is the one step in this runbook that is hard to undo** (see the warning at the end
of this step). Clear the fatal codes first, then come back here.

- [ ] Dry run completed, exit code recorded, and it was 0 or 1: ______

*(4a is ordered before the apply, not before the dry run: what it fixes is which branch
`saveSegmentEdit` takes when writing, and the dry run does not write.)*

Prod still holds the pre-break `segment_edits` rows for these 4 modules. For any snapshot row
whose status is `pending`, that pending row is still there, so `saveSegmentEdit` takes its
**UPDATE** branch — which sets `edited_content`, `category` and `editor_note` but **never
`original_content`**. The restored row would keep a stale baseline, the editor's diff view would
compare against a draft that no longer exists, and nothing would report it: UPDATE returns
`{updated: true}` with no `reverted` flag, so the re-attach counts it as written and the
reconciliation still balances.

Superseding first removes the pending row from the lookup, so `saveSegmentEdit` takes the
**INSERT** branch and `original_content` becomes the new MT text, as spec §7 requires.

This is semantically exact, not a workaround: spec §7 defines `superseded` as "history, already
replaced by a later row", and the restored `pending` row **is** that later row.

Record the before state — this step needs its own gate, because the apply's counters cannot
supply one:

```bash
sqlite3 "$DB" "SELECT status, count(*) FROM segment_edits
  WHERE book='efnafraedi-2e'
    AND module_id IN ('m68663','m68664','m68699','m68700')
  GROUP BY status;"
sqlite3 "$DB" "SELECT count(*) FROM segment_edits
  WHERE book='efnafraedi-2e'
    AND module_id IN ('m68663','m68664','m68699','m68700');"
```

- [ ] Total rows before: ______

```bash
sqlite3 "$DB" "UPDATE segment_edits SET status='superseded'
  WHERE book='efnafraedi-2e'
    AND module_id IN ('m68663','m68664','m68699','m68700')
    AND status != 'superseded';"
```

- [ ] Re-run **both** queries above. Gate: every row is now `superseded`, **and the total is
      unchanged**. An unchanged total proves the statement superseded rows rather than deleting
      them, and that it did not reach another book. If the total moved, STOP.

⚠️ **Run 4a exactly once, and never after 4b.** Re-run afterwards it would supersede the
freshly-restored `pending` rows and empty the editor's queue. If you abort the migration between
4a and 4b, prod's queue is already empty for these 4 modules — recover from the Gate 0
`VACUUM INTO` copy, which is why that gate is mandatory.

### Step 4b — dry run, then apply

Save the report, do not just read it. The script prints to stdout and writes no report file, so
a redirect is the only record of which segments were flagged and which were unmatched — and you
will want it during the review pass, after the terminal is gone.

```bash
node scripts/reattach-segment-edits.js --snapshot <path> \
  2>&1 | tee /path/off-box/c16-dryrun-report.txt
```

⚠️ **`tee` returns the exit code of `tee`, not of the script.** Read the code explicitly:

```bash
echo "${PIPESTATUS[0]}"     # bash: the script's exit code, not tee's
```

- [ ] Read the report. Unmatched count: ______ (expect ≤ 6)
- [ ] Exit code recorded: ______

**Exit codes are a gate, not information. Three of them mean stop and one does not:**

| Exit | Meaning | Action |
|---|---|---|
| 0 | Everything matched and reconciled | Proceed. |
| 1 | Unmatched rows exist | **Expected** — *but see the warning below this table before you accept it.* Proceed; you place those by hand. |
| 5 | The `--db` apply died part-way | **STOP.** The DB is in a mixed state. Read the `ABORTED after inserted=… updated=… withdrawn=…` line above the stack trace — that is how far it got. Re-running is safe (it converges on rows it already wrote), but diagnose the cause first. |
| 2 | A module is absent from the new extraction | **STOP.** Re-extraction failed. Do not continue. ⚠️ **Exit 2 can hide an exit 4** — a missing module's rows go to `unmatched`, never to the restore list where collisions are counted, so once you fix the extraction the next dry run may surface a *new* fatal code. Expect to run it twice. |
| 3 | The buckets did not reconcile | **STOP.** Rows are unaccounted for. |
| 4 | One editor+segment key carries more than one restorable row | **STOP.** See below. |

⚠️ **Exit 1 is NOT exclusively "unmatched rows".** It is also Node's code for any
failure the table does not enumerate — a usage error, a missing or malformed snapshot file, an
unreadable path. **Do not read 1 as "proceed" on the strength of the number alone: read the
report.** A clean exit 1 prints the reconciliation line and an `--- UNMATCHED ---` block whose row
count matches. Anything else — a stack trace, a usage message, no report at all — is a failure
wearing the proceed code. *(The one case that used to be genuinely dangerous, a `--db` apply
crashing part-way, now exits **5** instead; the row above.)*

**Exit 4 — what it means and what to do.** Two rows in the snapshot resolve to the same
`(book, module_id, segment_id, editor_id)`, which is the key `saveSegmentEdit` resolves a save
against. Production can legitimately hold both (the pending-uniqueness index is partial, and an
`approved` row is never superseded by a later save), and both are restorable — but only one can be
written: the second would UPDATE the first and one editor's text would be lost. **The apply
refuses rather than pick**, because which revision supersedes which is an editorial judgement, not
a mechanical one.

The report names each colliding key. Decide which row wins, remove the other from the snapshot
**copy** (never the off-box original), and re-run the dry run.

**Where you return to depends on whether 4a has already run — and either way you do NOT re-run 4a:**

| You are | Do this |
|---|---|
| **Before 4a** (the normal case — you ran the dry run first, as Step 4a instructs) | Resolve the snapshot copy, re-run the dry run until it exits 0 or 1, then go to Step 4a. |
| **After 4a** (you hit exit 4 on a later dry run, e.g. after fixing an exit 2) | Resolve the snapshot copy and re-run the dry run only. **4a is still valid and must not be repeated** — it superseded the pre-break rows once, which is all it needs to do, and it is idempotent in effect but *not* safe to repeat after the apply. The dry run writes nothing, so re-running it as often as you like costs nothing. |

⚠️ **Editing the snapshot copy does not invalidate 4a.** 4a operates on prod's rows; the snapshot
is a separate file. Nothing about resolving a collision changes what 4a did.

- [ ] Exit 4 not seen, or resolved and re-run clean: ______

⚠️ **Do not chain these commands with `&&`.** Exit 1 is the normal outcome, and **both** the
dry run and the `--db` apply return it whenever anything is unmatched. Chained, the apply — or
worse, the lock step in Step 5a — would silently never run.

```bash
node scripts/reattach-segment-edits.js --snapshot <path> --db \
  2>&1 | tee /path/off-box/c16-apply-report.txt
```

- [ ] `Inserted` count from the report: ______ (this is the restored work)
- [ ] `updated` count from the report: ______ — **expect 0 on a first run.** A non-zero
      `updated` means a pending row for that key was already present, so Step 4a did not cover it
      and `original_content` kept its old baseline for those rows. Not silent loss. **The script
      prints the affected keys under the ⚠️ block beneath the totals — you do not need to query
      the DB.** Copy them here and tell the editor their diff view is against a stale draft:

      ______________________________________________
- [ ] Place any unmatched edits by hand, using the EN text in the report.

*If the apply dies part-way it prints `ABORTED after inserted=… updated=… withdrawn=…` before the
stack trace. Record that line: it is how far the run got. Re-running is safe — a second pass finds
the rows it already wrote and converges on them.*

## Step 5 — finish

### Step 5a — re-establish the MT edit-locks (AFTER the apply)

**This step, and only this step, restores the 4 `.locked` markers.** The re-attach cannot:
`saveSegmentEdit`'s lock hook fires only when its own INSERT is the module's first-ever
`segment_edits` row (`priorCount === 1`), and these modules still hold their pre-break rows, so
the count can never be 1. `scripts/backfill-mt-locks.js`'s own header documents that
impossibility for exactly this row shape. Step 4a does not change it either — `priorCount`
counts rows of every status.

`--db` is **mandatory here, not optional.** Step 3 deleted the 4 faithful files, so the
script's file signal finds nothing for chemistry; only the DB signal can see these modules.

**Run this on prod** — the box whose `sessions.db` is authoritative. A dev box's local DB is not
prod state, so running it there locks nothing that matters and must not be mistaken for having
done this. The script is idempotent and safe to re-run in either mode.

```bash
node scripts/backfill-mt-locks.js --db
find books -name '*.locked'
```

- [ ] Gate: the four chemistry paths are present in the output —
      `books/efnafraedi-2e/02-mt-output/ch01/m68663-segments.locked`, `…ch01/m68664…`,
      `…ch03/m68699…`, `…ch03/m68700…`. **Fewer than four is the failure that matters**: an
      unlocked module can be silently overwritten by a later `api-translate` run, destroying MT
      output that now carries restored edits. A count above four is **not** an error — it means
      prod's DB holds edits for a module that has no faithful file, which is the gap this
      script exists to close, and those locks are correct. Check the names, not the number.

### Step 5b — hand off and reopen

- [ ] After the regeneration:
      `find books/*/05-publication -name '*.html' | sort > published-after.txt`
- [ ] Diff before/after — **that pair is the slug map**; hand it to the vefur redirect work.
- [ ] Restart the editorial server.
- [ ] Resume the `git-backup.sh` cron.
- [ ] Tell the editor: their work is back as **pending** and needs re-confirmation against the
      new machine draft; segments flagged in `editor_note` also need a marker fix.
- [ ] Reader delivery is separate and manual — vefur sync, then verify by fetching
      `/content/<book>/chapters/<NN>/<file>.html`, **never** a page URL.

## Afterwards

Verify the corpus is clean, then the deletion PR (spec §13): remove the Markdown-era converters
and the `hasApiMarkers` guard from `cnxml-inject.js`, **shipping a corpus tripwire with them** so
clean stays clean.
