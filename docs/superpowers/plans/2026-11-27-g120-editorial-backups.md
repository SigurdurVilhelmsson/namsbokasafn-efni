# G1.20 — Editorial Long-Lived Backups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every 6-hourly copy of `sessions.db` is uploaded, compressed and encrypted, to a locked Paris bucket and kept
about 12 months. The server deletes copies whose lock has ended, a fail-closed check proves the 12-month cap, and a
read-only tool recovers a segment or a module from old copies.

**Architecture:** `scripts/backup-db.sh` keeps the order and every rclone call. The decisions move to a Node script
that can be tested, `server/scripts/editorial-backup.js`, beside `research-backup.js`:
- the `VACUUM INTO` copy;
- whether a retention step is due;
- the rate guard, the expired-copy list and the status file, all computed from an rclone listing read on stdin.

Pure listing logic lives in `server/lib/editorialBackupPolicy.js`. `/api/health` gains `checks.offbox_backup_cap`,
read from the status file. The recovery tool is `server/scripts/recover-from-backup.js`. The lock length and the
lifecycle rule are bucket settings that [USER] makes. No code sets a lock date.

**Tech Stack:** bash, rclone (prod v1.75.0), Node 22, better-sqlite3 13 (in `server/node_modules` only), vitest, gzip
and zlib.

**Spec:** `docs/superpowers/specs/2026-11-27-g120-editorial-backups-design.md` (approved 2026-11-27). Executors read
both.

## Global Constraints

- `server/` is CommonJS. Test files use `import` for vitest and node builtins, plus `createRequire(import.meta.url)`
  for server modules; copy the header from `server/__tests__/importConcepts.test.js`.
- `process.exitCode = n` only, never `process.exit()` after writing output. A CLI's exit code starts as `1` and is
  overwritten only by a verdict (the pattern at `server/scripts/research-backup.js:249-259`).
- Values from the spec, and nowhere else:

  | Value | What it is | Where it lives |
  |---|---|---|
  | **356 days** | the server's delete | `SERVER_DELETE_AFTER_DAYS` |
  | **358 days** | the check's alarm | `CAP_ALARM_AFTER_DAYS` |
  | **8** | copies per 24 hours: the rate guard | `MAX_COPIES_PER_24H` |
  | 3 days → 30 days → 350 days | the lock: probe, interim, full | **bucket settings only, never in code** |
  | 355 days + 1 day | the lifecycle rule: current, then noncurrent | **bucket settings only, never in code** |
- **No upload carries an `--s3-object-lock-*` flag.**
- **Copy names.**
  - Local: `sessions.<YYYY-MM-DD-HHMMSS>.db`, stamped in UTC.
  - Locked remote: the same name plus `.gz`.
- **Environment.**
  - `BACKUP_REMOTE`: London. Its behaviour is unchanged, prune included. It must **not** begin with `locked`.
  - `LOCKED_BACKUP_REMOTE`: the Paris crypt remote. It must begin with `locked` and end in `:` or `/`.
  - `LOCKED_BACKUP_S3`: the S3 path under that crypt remote, for version listings and deletes. It is required when
    `LOCKED_BACKUP_REMOTE` is set, and must end in `:` or `/`.
  - Both remotes may be set at once, during the move.
- `/api/health` is public. `checks.offbox_backup_cap` carries only `ok`, `state` and `oldest_age_days`: no table,
  name or row count.
- **No Claude Code session reads a production copy, a restored file or editors' text.** Tests build synthetic
  databases; the recovery tool is run by [USER] only (CLAUDE.md § Purpose).
- Run `npm test` from the repo root. CI also runs `npm run lint` and `npm run format:check` over
  `tools/ scripts/ server/` JS.
- The repository is public: name no grant or fund.

## Review Focus

1. **Two runs in the same second** (deploy.sh's local copy and the cron) must not overwrite each other. The copy
   refuses `name-taken`. Pinned in Task 2.
2. **An rclone listing that is empty, truncated or not JSON** is "cannot tell":
   - the rate guard refuses;
   - `expired` prints nothing and exits 1;
   - `status` writes `ok:false` with `listing-invalid`.

   Pinned in Task 3.
3. **A ModTime in the future** (clock skew) yields a negative age. It is never expired, it counts as recent, and it
   does not crash. Pinned in Task 1.
4. **A copy that fails midway** (missing source, an integrity failure) leaves no `.partial` file behind. Pinned in
   Task 2.
5. **The recovery tool, interrupted or failing a download,** leaves no temp copy behind and never opens the live
   database. Pinned in Task 8.

---

### Task 0: Branch

- [ ] **Step 1:** From `docs/g120-editorial-backups-design` (which holds the spec, the register entry and this plan),
  run `git switch -c feat/g120-editorial-backups`. Confirm with `git log --oneline -3`, which should show `48efc3d78`
  or later.

### Task 1: Listing policy (pure)

**Files:**
- Create: `server/lib/editorialBackupPolicy.js`
- Test: `server/__tests__/editorialBackupPolicy.test.js`

**Interfaces:**
- Produces:
  - constants `SERVER_DELETE_AFTER_DAYS` (356), `CAP_ALARM_AFTER_DAYS` (358), `MAX_COPIES_PER_24H` (8), `DAY_MS`;
  - `readListing(text: string, nowMs: number): Array<{ path: string, ageMs: number, marker: boolean }>`. It parses
    `rclone lsjson` output (an array of `{Path, Size, ModTime, IsDir}`), skips `IsDir`, and sets `marker = Size === 0`.
    It **throws** `Error('listing-invalid')` when the text is not a JSON array or an item lacks a string `Path`, a
    numeric `Size` or a parseable `ModTime`;
  - `expiredPaths(items): string[]`: the data versions (`!marker`) with `ageMs > SERVER_DELETE_AFTER_DAYS * DAY_MS`;
  - `recentCopies(items): number`: the data versions with `ageMs < DAY_MS`, negative ages included;
  - `summarize(items, { uploadedSeen: boolean }): { ok, reasons: string[], oldest_age_days, newest_age_days,
    data_versions, delete_markers, uploaded_seen }`:
    - ages are in whole days, `Math.floor`, never below 0;
    - `reasons` ⊆ `['listing-empty', 'uploaded-not-seen', 'over-cap']`;
    - `ok = reasons.length === 0`;
    - `over-cap` when any data version's `ageMs > CAP_ALARM_AFTER_DAYS * DAY_MS`;
    - markers are counted, never aged.

- [ ] **Step 1: Write the failing tests**

```js
const NOW = Date.parse('2027-12-01T00:00:00Z');
const ago = (days) => new Date(NOW - days * 86400000).toISOString();
const item = (Path, days, Size = 100) => ({ Path, Size, ModTime: ago(days), IsDir: false });
const text = (...items) => JSON.stringify(items);

it('reads an rclone lsjson listing, marking zero-size items as delete markers', () => {
  const r = readListing(text(item('a', 1), item('b-v2027', 2, 0)), NOW);
  expect(r).toEqual([
    { path: 'a', ageMs: 86400000, marker: false },
    { path: 'b-v2027', ageMs: 172800000, marker: true },
  ]);
});
it.each(['', 'not json', '{}', JSON.stringify([{ Path: 'a', Size: 1 }])])(
  'refuses a listing it cannot read: %j', (t) => expect(() => readListing(t, NOW)).toThrow('listing-invalid'));
it('expires data versions older than 356 days, never a younger one or a marker', () => {
  const items = readListing(text(item('old', 356.01), item('edge', 355.99), item('mk', 400, 0)), NOW);
  expect(expiredPaths(items)).toEqual(['old']);
});
it('a future ModTime is never expired and counts as recent', () => {
  const items = readListing(text(item('future', -0.5)), NOW);
  expect(expiredPaths(items)).toEqual([]);
  expect(recentCopies(items)).toBe(1);
});
it('counts copies from the last 24 hours, markers excluded', () => {
  const items = readListing(text(item('a', 0.1), item('b', 0.9), item('c', 1.1), item('m', 0.2, 0)), NOW);
  expect(recentCopies(items)).toBe(2);
});
it('summarize: ok with the new copy seen and nothing over 358 days', () => {
  const s = summarize(readListing(text(item('a', 0), item('b', 357.9), item('m', 500, 0)), NOW), { uploadedSeen: true });
  expect(s).toEqual({ ok: true, reasons: [], oldest_age_days: 357, newest_age_days: 0,
    data_versions: 2, delete_markers: 1, uploaded_seen: true });
});
it('summarize: fails closed on an empty listing, an unseen upload, and a copy over 358 days', () => {
  expect(summarize([], { uploadedSeen: true }).reasons).toEqual(['listing-empty']);
  const items = readListing(text(item('a', 0), item('old', 358.01)), NOW);
  expect(summarize(items, { uploadedSeen: false }).reasons).toEqual(['uploaded-not-seen', 'over-cap']);
});
it('pins the spec values', () => {
  expect([SERVER_DELETE_AFTER_DAYS, CAP_ALARM_AFTER_DAYS, MAX_COPIES_PER_24H]).toEqual([356, 358, 8]);
});
```

- [ ] **Step 2:** Run `npx vitest run server/__tests__/editorialBackupPolicy.test.js`. Expected: FAIL, module not
  found.
- [ ] **Step 3:** Implement the module per the Interfaces block. Put a JSDoc header citing spec §4.2–§4.3, and state
  that the lock length and the lifecycle rule are bucket settings, never code.
- [ ] **Step 4:** Re-run. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(backup): G1.20 listing policy — expired copies, rate count, fail-closed summary`.

### Task 2: The copy and the retention-due question

**Files:**
- Create: `server/scripts/editorial-backup.js` (with the subcommands `copy` and `retention-due`; Task 3 adds the
  others)
- Test: `server/__tests__/editorialBackupCopy.test.js`

**Interfaces:**
- Consumes: `readRetentionHealth({ db, nowMs })` from `server/lib/retentionHealth.js`, which returns `{ ok, due: string[],
  ... }` or `{ ok: false, error }`.
- Produces:
  - `takeCopy({ sessionsPath: string, dir: string, nowMs: number }): { ok: true, path: string } | { ok: false,
    reason: string }`;
  - `retentionDue({ sessionsPath: string, nowMs: number }): { due: boolean, steps: string[], error?: string }`;
  - `main(argv, { stdin, out, err }): Promise<number>`;
  - `USAGE`.
  - CLI:
    - `node server/scripts/editorial-backup.js copy <sessions-db> <backup-dir>` prints exactly the copy's absolute
      path. Exit 0, or 1 with `editorial-backup: no copy (<reason>)` on stderr.
    - `retention-due <sessions-db>`: exit 0 when nothing is due; exit 1 when a step is due (stderr
      `editorial-backup: retention due: <steps>`) or when it cannot tell (stderr `editorial-backup: retention unknown
      (<code>)`).
    - A wrong argument count exits 2 with `USAGE`.

- [ ] **Step 1: Write the failing tests** (synthetic databases only)

```js
it('a copy holds live rows only: a deleted row\'s token is gone from the copy, while the live file still holds it', () => {
  // live: CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT); insert 200 rows, one carrying TOKEN = 'zq-sentinel-7f3a91'
  // repeated to 2 KB; DELETE that row (secure_delete left at the build default)
  const r = takeCopy({ sessionsPath: live, dir, nowMs: NOW });
  expect(r.ok).toBe(true);
  expect(fs.readFileSync(live).includes(Buffer.from(TOKEN))).toBe(true);   // control: the scan can see it
  expect(fs.readFileSync(r.path).includes(Buffer.from(TOKEN))).toBe(false);
});
it('a copy equals its source by value, table by table, including a table with no integer key', () => {
  // live: t1(id INTEGER PRIMARY KEY, v) and t2(a TEXT, b TEXT) (rowid table), rows with gaps from deletes
  // compare SELECT * ORDER BY every column, for each table, live vs copy
});
it('the copy is 0600, journal_mode delete, integrity ok, named sessions.<UTC stamp>.db', () => {
  const r = takeCopy({ sessionsPath: live, dir, nowMs: Date.parse('2027-01-02T03:04:05Z') });
  expect(path.basename(r.path)).toBe('sessions.2027-01-02-030405.db');
  expect(fs.statSync(r.path).mode & 0o777).toBe(0o600);
  // open read-only: pragma journal_mode === 'delete', integrity_check === 'ok'; no -wal/-shm beside it
});
it('refuses a name already taken and leaves the existing copy untouched', () => {
  // two takeCopy calls with the same nowMs: second → { ok:false, reason:'name-taken' }; first file's sha256 unchanged
});
it('a failed copy leaves no partial file', () => {
  const r = takeCopy({ sessionsPath: path.join(dir, 'missing.db'), dir, nowMs: NOW });
  expect(r.ok).toBe(false);
  expect(fs.readdirSync(dir).filter((n) => n.includes('.partial'))).toEqual([]);
});
it('retention-due: nothing due on a migrated database before 2028', () => {
  const { path: p } = freshMigratedDb();   // server/__tests__/helpers/freshMigratedDb.js
  expect(retentionDue({ sessionsPath: p, nowMs: Date.parse('2027-06-01T00:00:00Z') })).toEqual({ due: false, steps: [] });
});
it('retention-due: the named step is due on a migrated database after its date and unrecorded', () => {
  const { path: p } = freshMigratedDb();
  const r = retentionDue({ sessionsPath: p, nowMs: Date.parse('2029-02-01T00:00:00Z') });
  expect(r.due).toBe(true);
  expect(r.steps).toContain('named');
});
it('retention-due: a database it cannot read counts as due (fail closed)', () => {
  // a db with only CREATE TABLE t(x)
  expect(retentionDue({ sessionsPath: bare, nowMs: NOW }).due).toBe(true);
});
it('main: copy prints only the path; retention-due exits 1 on a bare database; a bad argument count exits 2', async () => {});
```

- [ ] **Step 2:** Run the test file. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `takeCopy` in `server/scripts/editorial-backup.js`.
  - Create `dir` with mode 0700, then chmod.
  - Pre-create `<final>.partial` with `fs.openSync(partial, 'wx', 0o600)`; a fresh destination would be 0644.
  - Open the source with `new Database(sessionsPath, { readonly: true, fileMustExist: true, timeout:
    SCRIPT_BUSY_TIMEOUT_MS })`. The timeout comes from `server/scripts/lib/researchAdmin.js`.
  - `db.prepare('VACUUM INTO ?').run(partial)`. The partial file must be empty, which `'wx'` guarantees.
  - Open the partial file, set `journal_mode = DELETE`, require `integrity_check === 'ok'`, close it, then rename it
    to the final name.
  - Any failure removes the partial file and its `-wal`, `-shm` and `-journal` side files (the `discard()` pattern in
    `research-backup.js:107-111`).
  - If `VACUUM INTO` refuses a read-only connection, open the source read-write. The tests decide.
- [ ] **Step 4:** Implement `retentionDue`. Open the database read-only, call `readRetentionHealth`, and map the
  result:
  - `error` → `{ due: true, steps: [], error }`;
  - otherwise → `{ due: due.length > 0, steps: due }`.

  Close the handle in `finally`.
- [ ] **Step 5:** Implement `main` and the `require.main` block in the research script's shape.
- [ ] **Step 6:** Run the tests. Expected: PASS.
- [ ] **Step 7:** Commit: `feat(backup): G1.20 VACUUM INTO copy (live rows only) and the retention-due question`.

### Task 3: Listing subcommands (`rate-ok`, `expired`, `status`)

**Files:**
- Modify: `server/scripts/editorial-backup.js`
- Test: `server/__tests__/editorialBackupListing.test.js`

**Interfaces:**
- Consumes: Task 1's `readListing`, `expiredPaths`, `recentCopies`, `summarize`, `MAX_COPIES_PER_24H`.
- Produces (CLI; each reads an rclone `lsjson` listing on stdin):
  - **`rate-ok`**: exit 0 when `recentCopies < MAX_COPIES_PER_24H`. Exit 1 at 8 or more (stderr `editorial-backup:
    rate guard: <n> copies in 24 h`) or on an unreadable listing (stderr `editorial-backup: listing-invalid`).
    **An empty array `[]` is readable and passes** (the first run).
  - **`expired`**: prints each `expiredPaths` entry on its own line, exit 0. On an unreadable listing it prints
    nothing and exits 1.
  - **`status --uploaded-seen yes|no --out <file>`**:
    - writes `{ at: <ISO now>, ...summarize(...) }` to `<file>` atomically (`<file>.tmp`, then rename);
    - on an unreadable listing it writes `{ at, ok: false, reasons: ['listing-invalid'] }`;
    - prints `editorial-backup: status ok` or `editorial-backup: status not ok (<reasons joined by ,>)`;
    - exits 0 when ok, else 1.

- [ ] **Step 1:** Write the failing tests through `main(argv, { stdin, out, err })`, with a `Readable.from([...])`
  stdin:
  - `rate-ok` passes `[]` and 7 recent copies; refuses 8; refuses `''` and `'garbage'`;
  - `expired` prints exactly the >356-day path (a 355.99-day copy is the control) and exits 1 on `'garbage'` with
    empty stdout;
  - `status` writes the file with `ok:true` for a good listing; `uploaded-not-seen` with `--uploaded-seen no`;
    `listing-invalid` for `''`, with the file still written. The written JSON parses, and no `.tmp` is left;
  - `status` without `--out`, or with a `--uploaded-seen` value other than `yes`/`no`, exits 2.
- [ ] **Step 2:** Run it. Expected: FAIL, unknown subcommand.
- [ ] **Step 3:** Add the three subcommands to `main`. Read stdin with the research script's `readAll`.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(backup): G1.20 rate guard, expired list and fail-closed status from a listing`.

### Task 4: `backup-db.sh` makes its local copy through Node

**Files:**
- Modify: `scripts/backup-db.sh` (the header comment and lines 49-58: the checkpoint and `cp` go)
- Test: `scripts/__tests__/backup-db.test.mjs` (existing; add one test)

**Interfaces:**
- Consumes: `editorial-backup.js copy <db> <dir>` (Task 2).
- Produces: `$BACKUP_FILE` is the path printed by `copy`. The local prune and the side-file sweep are unchanged.
  Rename `RETENTION_NODE`'s resolved value to `NODE` and keep `RETENTION_NODE` as the test seam that sets it.

- [ ] **Step 1: Write the failing test:** `the local copy is made with VACUUM INTO: a deleted row's token is absent`.
  Build the db with a deleted sentinel row as in Task 2, run the script with `BACKUP_REMOTE: ''`, and scan the single
  `sessions.*.db` in the backup directory for the token. Control: the live file still holds it.
- [ ] **Step 2:** Run `npx vitest run scripts/__tests__/backup-db.test.mjs`. Expected: the new test FAILS, because
  `cp` copies the free page; the existing tests PASS.
- [ ] **Step 3:** Replace the checkpoint and `cp` with `BACKUP_FILE="$("$NODE" "${PROJECT_ROOT}/server/scripts/editorial-backup.js" copy "$DB_PATH" "$BACKUP_DIR")"`.
  - If node is missing, or the copy fails, print `ERROR: local copy failed` and exit 1. No `cp` fallback.
  - The editorial retention still runs first.
  - Update the header's numbered list.
- [ ] **Step 4:** The existing test `exits 3 and does not write the heartbeat when rclone is not installed` restricts
  `PATH` to a bin directory with no node. Add `RETENTION_NODE: process.execPath` to its `env`, which is what the
  seam is for, so the Node copy runs and the test still reaches the rclone check. Its expected status stays 3. Do not
  rely on `/usr/bin/node`: on a CI runner it may be absent, or built for another ABI than `server/node_modules`.
- [ ] **Step 5:** Run the file. Expected: all PASS, the existing ones included.
- [ ] **Step 6:** Commit: `fix(backup): G1.20 local copy via VACUUM INTO instead of checkpoint + cp`.

### Task 5: `backup-db.sh` uploads to the locked remote

**Files:**
- Modify: `scripts/backup-db.sh` (the off-box section)
- Create: `scripts/__tests__/backup-db-locked.test.mjs`

**Interfaces:**
- Consumes: the Task 2–3 subcommands; `$BACKUP_FILE` from Task 4.
- Produces:
  - status file `$BACKUP_DIR/.offbox-locked-status.json` (read by Task 6);
  - heartbeat `$BACKUP_DIR/.last-offbox-backup`, same path and meaning;
  - new exit codes: **6** paused, retention due; **7** rate guard refused, or the pre-upload listing failed; **8**
    the status check is not ok. Existing codes are unchanged: 3 rclone missing, 4 upload failed, 5 a malformed or
    forbidden remote.

**The order** (implement exactly this; each `rclone` call as written):
1. **Guards, before any upload.**
   - If `LOCKED_BACKUP_REMOTE` is set, it must match `locked*` and end in `:` or `/`. `LOCKED_BACKUP_S3` must then be
     set and end in `:` or `/`.
   - `BACKUP_REMOTE`, if set, must not begin with `locked` and must differ from `LOCKED_BACKUP_REMOTE`.
   - Any violation: `ERROR: ...` and exit 5, before anything is uploaded or deleted.
   - If either remote is set and rclone is missing: exit 3.
2. **London (`BACKUP_REMOTE`)**, today's block: upload, heartbeat, prune.
   - A failed upload sets `LONDON_RC=4` and no longer exits at once.
   - It writes the heartbeat only when `LOCKED_BACKUP_REMOTE` is unset.
   - With both remotes unset, the existing `BACKUP_REMOTE not set — skipping off-box upload (local backup only).`
     line stays as it is.
3. **Paris (`LOCKED_BACKUP_REMOTE`)**:
   1. `"$NODE" .../editorial-backup.js retention-due "$DB_PATH"` fails → `PAUSED: an editorial retention step is due;
      nothing uploaded to the locked remote` on stderr, `LOCKED_RC=6`, and skip the rest of Paris.
   2. `listing="$(rclone lsjson --s3-versions --s3-version-deleted --use-server-modtime "$LOCKED_BACKUP_S3")"`. If it
      fails, or `printf '%s' "$listing" | node ... rate-ok` fails → `LOCKED_RC=7`, skip.
   3. `gzip -c "$BACKUP_FILE" > "$TMP/$(basename "$BACKUP_FILE").gz"`, in a `mktemp -d` cleaned by a trap. Then
      `rclone copyto "$TMP/<name>.gz" "${LOCKED_BACKUP_REMOTE}<name>.gz"`. **No lock flags.** If it fails →
      `LOCKED_RC=4`, skip.
   4. Upload succeeded: write the heartbeat.
   5. Re-list as in step 2. Pipe it to `expired`, and for each path run `rclone deletefile --s3-versions
      "${LOCKED_BACKUP_S3}<path>"`. This is best-effort: a failure prints `WARNING: could not delete expired version`
      and continues.
   6. Re-list once more. Set `seen=yes` when `rclone lsf --files-only "$LOCKED_BACKUP_REMOTE" | grep -qxF "<name>.gz"`,
      else `no`. Pipe the listing to `status --uploaded-seen "$seen" --out "$BACKUP_DIR/.offbox-locked-status.json"`.
      If it fails → `LOCKED_RC=8`.
4. **Exit** with `LOCKED_RC` if it is non-zero, else `LONDON_RC`, else 0.

- [ ] **Step 1: Write the fake rclone used by every test in the file.** The test writes it into a temp `bin/`
  prepended to `PATH`:

```bash
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$FAKE_LOG"
[ "${FAKE_FAIL:-}" = "$1" ] && exit 1
case "$1" in
  version) echo "rclone v1.75.0" ;;
  lsjson)  cat "$FAKE_LSJSON" ;;
  lsf)     ls -1 "$FAKE_STORE" ;;
  copyto)  [ -n "${FAKE_DROP:-}" ] || cp "$2" "$FAKE_STORE/${3##*[:/]}" ;;
  deletefile) : ;;
esac
```

  Each test sets `FAKE_LOG`, `FAKE_LSJSON` (a JSON file with ModTimes relative to now), `FAKE_STORE` and, where
  needed, `FAKE_FAIL` (make that subcommand exit 1) or `FAKE_DROP` (`copyto` succeeds and stores nothing). Run the
  script with `RETENTION_NODE: process.execPath`. Build the database with `freshMigratedDb()` and copy its file to `DB_PATH_OVERRIDE`, so that
  `retention-due` answers "nothing due". The pause test uses a bare `CREATE TABLE t(x)` database, which is due (fail
  closed).

- [ ] **Step 2: Write the failing tests** (names and assertions):
  - `uploads a gzipped copy with no lock flags, writes the heartbeat and an ok status`:
    - exit 0;
    - `FAKE_STORE` holds `sessions.*.db.gz` that gunzips to a file whose SQLite header is valid;
    - the log's `copyto` line contains no `object-lock`;
    - the heartbeat exists;
    - the status file has `ok: true` and `uploaded_seen: true`.
  - `pauses the locked upload while a retention step is due`: bare db → exit 6; no `copyto` to `locked`; no
    heartbeat; the local copy still exists.
  - `refuses the upload at 8 copies in 24 hours`: listing with 8 recent data versions → exit 7, no `copyto`.
    Control: 7 copies → uploaded.
  - `refuses when the pre-upload listing fails`: `FAKE_FAIL=lsjson` → exit 7, no `copyto`.
  - `deletes only versions older than 356 days, by versioned name`: listing with `old-v2026` at 356.5 days and `young`
    at 355.5 → exactly one `deletefile --s3-versions locked-s3:bkt/old-v2026` line, none naming `young`.
  - `an unseen upload makes the status not ok and exits 8, heartbeat still written`: `FAKE_DROP=1`.
  - `rejects a locked remote not named locked*, a missing LOCKED_BACKUP_S3, and BACKUP_REMOTE naming a locked
    remote`: each → exit 5, and the fake's log holds no `copyto` and no `deletefile` line.
  - `today's count-based prune never runs against the locked remote`:
    - both remotes set (London `secret:`, Paris `locked-secret:`), with London holding 35 objects;
    - `deletefile` lines appear only for `secret:` (London's prune) and for `--s3-versions locked-s3:` paths that are
      expired;
    - no `deletefile` names `locked-secret:`.
  - `London-only behaviour is unchanged`: the existing `backup-db.test.mjs` suite passes untouched.
- [ ] **Step 3:** Run the new file. Expected: FAIL.
- [ ] **Step 4:** Implement the order above in `backup-db.sh`. Update the header comment: steps 0–4 and the exit
  codes.
- [ ] **Step 5:** Run both backup test files. Expected: PASS.
- [ ] **Step 6:** Commit: `feat(backup): G1.20 upload to the locked Paris remote — pause, rate guard, expired deletes, status`.

### Task 6: `checks.offbox_backup_cap` in `/api/health`

**Files:**
- Create: `server/lib/lockedBackupHealth.js`
- Modify: `server/index.js` (after the `checks.offbox_backup` block, ~line 293)
- Test: `server/__tests__/lockedBackupHealth.test.js`

**Interfaces:**
- Consumes: the status file written by Task 3/5; `DEFAULT_STALE_HOURS` from `server/lib/offboxBackupHealth.js` (14);
  `CAP_ALARM_AFTER_DAYS` and `DAY_MS` from Task 1.
- Produces: `readLockedBackupHealth({ statusText: string|null, statusMtimeMs: number|null, nowMs: number, staleHours:
  number }): { ok: boolean, state: string, oldest_age_days?: number }`. It never throws. States:
  - `not-configured`, when `statusText === null`: ok;
  - `unreadable`, when the text is not JSON: not ok;
  - `stale`, when the file is older than `staleHours`: not ok;
  - the first reason, when the status says `ok: false` (`listing-invalid`, `listing-empty`, `uploaded-not-seen`,
    `over-cap`): not ok;
  - `over-cap`, when `oldest_age_days` plus the status file's own age in whole days exceeds `CAP_ALARM_AFTER_DAYS`:
    not ok;
  - `ok` otherwise, with `oldest_age_days`.

- [ ] **Step 1:** Write the failing tests: one per state above, plus `carries no field besides ok, state and
  oldest_age_days`, which checks `Object.keys` of every result is a subset of those three.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement it, and wire it into `server/index.js`:
  - read `pipeline-output/backups/.offbox-locked-status.json` with `fs.readFileSync` and `statSync`, where a missing
    file gives `statusText: null`;
  - set `checks.offbox_backup_cap = readLockedBackupHealth(...)`;
  - in a `catch`, set `{ ok: false, state: 'unavailable' }`, never an error message.

  Follow the `checks.offbox_backup` block's shape.
- [ ] **Step 4:** Run it, plus `server/__tests__/healthOffboxBackup.test.js`. Expected: PASS.
- [ ] **Step 5:** Check `./scripts/deploy.sh` prints not-ok check names generically: grep its health readout. If it
  lists checks by name, add `offbox_backup_cap` there.
- [ ] **Step 6:** Commit: `feat(health): G1.20 checks.offbox_backup_cap — the locked copies' 12-month check`.

### Task 7: The restore test reads a `.gz` copy

**Files:**
- Modify: `scripts/verify-db-backup.sh:19-30`
- Test: `scripts/__tests__/backup-db.test.mjs` (add to its verify describe block)

**Interfaces:**
- Produces: if `LATEST` ends in `.gz`, download it to `restored.db.gz` and `gunzip` it to `restored.db`. A failed
  `gunzip` → `RESTORE VERIFY: FAIL (gunzip errored)`, exit 1. Everything after is unchanged.

- [ ] **Step 1:** Write the failing tests, using the existing crypt-over-local remote harness (`skipIf(!hasRclone)`)
  and also the Task 5 fake rclone, so CI covers it:
  - `verifies a gzipped copy: RESTORE VERIFY: PASS`;
  - `a corrupt .gz fails with gunzip errored`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement it.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(backup): G1.20 restore test reads gzipped copies`.

### Task 8: The recovery tool

**Files:**
- Create: `server/scripts/recover-from-backup.js`
- Test: `server/__tests__/recoverFromBackup.test.js`

**Interfaces:**
- Produces (exported for tests):
  - `COPY_RE = /^sessions\.(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})\.db(\.gz)?$/`, stamps read as UTC;
  - `pickCopies(names: string[], { fromMs, toMs, every }): string[]`:
    - only names matching `COPY_RE` with a stamp in `[fromMs, toMs + DAY_MS)`;
    - `every: false` keeps the newest copy of each UTC day;
    - sorted oldest first;
  - `pickCopyAt(names, atMs): string | null`: the newest stamp at or before `atMs`;
  - `readSegment(dbPath, { book, module, segment }): { edits: Row[], versions: Row[] }`, opened `{ readonly: true,
    fileMustExist: true }`:
    - edits: `SELECT id, status, editor_username, created_at, reviewed_at, edited_content FROM segment_edits WHERE
      book=? AND module_id=? AND segment_id=? ORDER BY id`;
    - versions: `SELECT version, track, applied_by, applied_at, content FROM content_versions WHERE book=? AND
      module_id=? AND segment_id=? ORDER BY version`;
  - `readModule(dbPath, { book, module })`: the same two queries without `segment_id`, ordered by `segment_id, id`
    and `segment_id, version`;
  - `distinctWordings(perCopy: Array<{ copy: string, edits, versions }>): Array<{ key, source, row, first, last, copies }>`:
    - key = `source|id-or-version|status|text`;
    - `first` and `last` are copy names;
    - ordered by `first`;
  - `main(argv, { out, err, env })`.
- CLI (`USAGE`):
  - `segment --book B --module M --segment S (--from YYYY-MM-DD --to YYYY-MM-DD [--every] | --file F)
    [--as-of ISO] [--remote R]`
  - `module --book B --module M (--at ISO | --file F) [--as-of ISO] [--remote R]`
  - **Copies.** `--remote` defaults to `env.LOCKED_BACKUP_REMOTE`. Copies are listed with `rclone lsf --files-only
    [--s3-version-at <as-of>] <remote>` and fetched with `rclone copyto [--s3-version-at <as-of>]
    <remote><name> <tmp>`, both through `execFileSync`.
  - **Temp files.** The temp directory is `fs.mkdtempSync(path.join(os.tmpdir(), 'recover-'))`, chmod 0700. Each
    `.gz` is gunzipped with `zlib.gunzipSync` to a 0600 `.db`, read, then both are deleted. The directory is removed
    in `finally`.
  - **Exit codes.** 0 when rows were printed; 1 when there are no copies in range or no rows; 2 on usage, and on
    `--file` resolving (`fs.realpathSync`) to `resolveDbPath()`'s real path, with the stderr line `refuses the live
    database`.

- [ ] **Step 1:** Write the failing tests, with synthetic copies holding `segment_edits` and `content_versions` rows
  (the columns above) and the Task 5 fake rclone on `PATH`:
  - `pickCopies`:
    - one per day by default, every copy with `every`;
    - the range end day is included;
    - non-matching names are ignored.
  - `pickCopyAt` picks the newest copy at or before the time, and returns null before the first copy.
  - `segment mode shows each wording once, with the first and last copy it appears in`:
    - three copies, where the wording changes in the second;
    - two entries;
    - first and last names exact.
  - `module mode prints every segment of the module from the copy at the time`.
  - `--as-of is passed to both lsf and copyto`, asserted from the fake's log.
  - `refuses a --file that is the live database` (set `SESSIONS_DB_PATH` in `env` and in the child process).
  - `leaves no temp copy behind after success, after a failed download (FAKE_FAIL=copyto), and after a corrupt gzip`:
    `os.tmpdir()` holds no new `recover-*` directory.
  - `exits 1 with "no copies in range" when the range is empty`.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement it.
  - The header comment states that **[USER] runs this, in a plain terminal on the server, never through a Claude
    Code session's `!` prefix**, because it prints editors' text and names (CLAUDE.md § Purpose; spec §4.4).
  - It never writes to any database.
- [ ] **Step 4:** Run it. Expected: PASS.
- [ ] **Step 5:** Commit: `feat(backup): G1.20 read-only recovery tool — a segment across dates, a module at a time`.

### Task 9: Cron lines, runbook, LICENSE edges

**Files:**
- Modify: `scripts/install-cron.sh`, `docs/technical/backup-and-restore.md`, `LICENSE`
- Test: `scripts/__tests__/backup-db.test.mjs` (the existing test that feeds `install-cron.sh`'s printed value to the
  guard)

**Interfaces:**
- **`install-cron.sh`** prints the backup line with `LOCKED_BACKUP_REMOTE=${LOCKED_BACKUP_REMOTE:-locked-secret:}
  LOCKED_BACKUP_S3=${LOCKED_BACKUP_S3:-locked-s3:BUCKET/}` beside `BACKUP_REMOTE`.
  - A comment says that during the move both are set, that after it `BACKUP_REMOTE` is dropped, and that `BUCKET` is
    [USER]'s Paris bucket name.
  - The monthly verify line gains a second line for `BACKUP_REMOTE=locked-secret:`.

- [ ] **Step 1:** Extend the install-cron test. The printed `LOCKED_BACKUP_REMOTE` and `LOCKED_BACKUP_S3` values,
  fed to the real guards with a fake rclone, must not exit 5. A printed value with the prefix removed must exit 5.
- [ ] **Step 2:** Run it. Expected: FAIL. Then update `install-cron.sh`, and run it again. Expected: PASS.
- [ ] **Step 3: Runbook.** Add a section `## The editorial bucket in Paris (G1.20)` before `## Restore runbook`.
  - Each command [USER] runs is followed by its read-back.
  - Endpoint `https://fr-par-1.linodeobjects.com`. The commands use the AWS CLI on [USER]'s computer with an unlimited
    key that never goes on the server.
  - The forms come from the spec §4.1 and §4.6, and from Akamai's Object Lock and lifecycle pages:
    1. **Create the bucket:** `aws s3api create-bucket --endpoint-url <ep> --bucket <b> --object-lock-enabled-for-bucket`.
       Read back with `get-bucket-versioning` → `Enabled`.
    2. **Set the probe lock:** `put-object-lock-configuration` with `{"ObjectLockEnabled":"Enabled","Rule":
       {"DefaultRetention":{"Mode":"COMPLIANCE","Days":3}}}`. Read back with `get-object-lock-configuration`.
    3. **Set the probe lifecycle:** `put-bucket-lifecycle-configuration` with two rules:
       - `{Expiration:{Days:1}, NoncurrentVersionExpiration:{NoncurrentDays:1}}`;
       - `{Expiration:{ExpiredObjectDeleteMarker:true}}`.

       Read back with `get-bucket-lifecycle-configuration`. s3cmd `setlifecycle` is the documented fallback.
    4. **The server's key:** a limited read_write key for this bucket only (Cloud Manager).
    5. **On the server:** `rclone config` for `locked-s3` (an S3 remote with that key and endpoint) and `locked-secret`
       (crypt, `remote = locked-s3:<b>`). 🔴 **The passphrase goes into the password manager before any upload.**
    6. **The live probe**, spec §4.6's nine steps, each as an exact command:
       - the old version is deleted by versioned name with `rclone deletefile --s3-versions`;
       - object B is plain-deleted with `rclone deletefile`;
       - `rclone lsf --s3-version-at <before-the-delete> locked-secret:` shows B;
       - the server key's attempts to change config use the AWS CLI with that key.

       The go/no-go at step 5 is stated plainly: if it fails, stop.
    7. **After the probe:** set the lifecycle to `Days:355` / `NoncurrentDays:1`, keeping the marker rule, and
       default retention to **30 days**. Read back each.
    8. **The cron switch:** both remotes set, then the restore test with `BACKUP_REMOTE=locked-secret:`, then
       `checks.offbox_backup_cap` ok, then `BACKUP_REMOTE` dropped. The London bucket is deleted (precondition 1).
    9. **When the consent text is listed in `APPROVED_CONSENT_TEXTS`:** set default retention to **350 days** and read
       it back.
  - Also update:
    - "What this protects": `content_versions` holds no snapshots while chemistry's writes are held (§C203);
    - the env table: `LOCKED_BACKUP_REMOTE`, `LOCKED_BACKUP_S3`;
    - the restore runbook: only the newest copy goes into place, older ones are read with
      `server/scripts/recover-from-backup.js` by [USER] in a plain terminal, and an older whole copy is a stop for
      [USER] (spec §4.4);
    - the "One-time setup" section: a note that its console-only steps do not apply to the editorial bucket.
- [ ] **Step 4: LICENSE.** In the edge list after the `research-backup.sh` entries, add:
  - `scripts/backup-db.sh` runs `server/scripts/editorial-retention.js` (an edge that exists today and was never
    listed) and `server/scripts/editorial-backup.js` (`copy`, `retention-due`, `rate-ok`, `expired`, `status`), and
    reads `editorial-backup.js`'s stdout. It cannot make a backup without `server/` present. Its paths are
    interpolated, so the fifth search shape finds it. *(Added 2026-11-27, with G1.20.)*
- [ ] **Step 5:** Commit: `docs(backup): G1.20 runbook for the locked Paris bucket; cron lines; LICENSE edges`.

### Task 10: Gates, verification, register

- [ ] **Step 1:** Run `npm test` from the repo root, `npm run lint` and `npm run format:check`. Expected: no new
  failure. Diff any failing set by name against `main`.
- [ ] **Step 2:** Run the `verify-research-withdrawal` skill. The change touches the `sessions.db` backup and its
  runbook. Expected: its checks pass.
- [ ] **Step 3:** `git status --porcelain` is clean. Then `grep -n "object-lock" scripts/backup-db.sh` returns
  nothing: no lock flag on any upload.
- [ ] **Step 4:** Add a dated register entry: G1.20 built, on branch `feat/g120-editorial-backups`. Precondition 3's
  remaining steps are [USER]'s: s04 bucket creation, the probe, the cron switch and the 350-day switch. Roll the
  dashboard's s19 in the same session (CLAUDE.md, the dashboard rule).
- [ ] **Step 5:** Push and open a PR only on [USER]'s go. On approval, request the code review before the merge.

## After the merge ([USER]'s steps, tracked in the register, not tasks for the implementer)

1. Deploy (`./scripts/deploy.sh`). With only `BACKUP_REMOTE` on the cron line, behaviour is London's, with a
   `VACUUM INTO` copy.
2. s04: create the Paris bucket and run runbook steps 1–5, then the live probe (step 6) and its go/no-go.
3. Runbook step 7, then the cron switch (step 8). Re-read G-1b on the research bucket: it must read `"Unversioned"`.
4. When the consent text is listed: the 350-day default retention (step 9). Precondition 3 is then discharged.
