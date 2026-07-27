# C11(b)+(c) — Content-backup smoke detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a failed content backup on the production server visible, and remove the second, divergent deploy path that could destroy the work a failed backup strands.

**Architecture:** `scripts/git-backup.sh` writes a heartbeat file only on healthy runs, so *absence is the alarm* — the same inversion the off-box DB backup already uses. `GET /api/health` reads it through two new small server libs and flips to `degraded` when it goes stale. `scripts/deploy.sh` prints the health verdict it currently discards, which is the only routine surface where that alarm gets seen. Separately, `.github/workflows/deploy.yml` stops duplicating (and diverging from) `scripts/deploy.sh` and just calls it, which deletes its `git reset --hard origin/main`.

**Tech Stack:** Bash (production cron + deploy scripts), Node 22 CommonJS (`server/`), Vitest workspace with three projects — `tools` (`tools/__tests__/**/*.test.js`), `server` (`server/__tests__/**/*.test.js`, sequential), `scripts` (`scripts/__tests__/**/*.test.mjs`).

**Design doc:** [`docs/superpowers/specs/2026-07-27-c11-content-backup-smoke-detector-design.md`](../specs/2026-07-27-c11-content-backup-smoke-detector-design.md)

## Global Constraints

- **Authoritative gate:** `npm test` from the **repo root**. Not `server/`, not `tools/`.
- **Never resolve resource paths against `process.cwd()`.** The server runs with `cwd=server/`. Use `__dirname` / `import.meta.url`. (Masked prod bugs #210, #213.)
- **Heartbeat file:** `pipeline-output/.last-content-backup`. `pipeline-output/` is gitignored (`.gitignore:51`).
- **Status file:** `pipeline-output/backup-status.json`, statuses `success` | `no_changes` | `error`.
- **Stale threshold:** `CONTENT_BACKUP_STALE_HOURS`, **default 6** (2-hourly cron → two missed cycles + margin).
- **`scripts/git-backup.sh` runs under `set -euo pipefail`** (`:26`). Every new command must be `-e`-safe: guard with `if ! cmd; then`, `cmd || true`, or `$( ... || true )`. A bare failing command aborts the cron mid-run.
- **Do not change what is backed up.** The `PATHSPECS` array (`:75-85`) is untouched.
- **Do not add `git pull`/`git fetch --rebase` to the commit/push path.** `merge.ours.driver` is registered by `deploy.sh:63`, not by the cron; an unattended rebase over the perpetually-dirty `books/*/translation-errors.json` would wedge production mid-rebase. Only the read-only diagnostic fetch in Task 5 is permitted, and only on the already-failed path.
- **Commit style:** conventional commits, and every commit message ends with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- **Branch:** `fix/c11-content-backup-smoke-detector` (already created; the design doc is committed at `0f124d81`).

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `server/lib/backupHeartbeatHealth.js` | create | Pure staleness arithmetic, shared by both backup heartbeats. No I/O. |
| `server/lib/offboxBackupHealth.js` | modify | Becomes a thin delegating wrapper; its public export is unchanged. |
| `server/lib/contentBackupHealth.js` | create | Reads the two content-backup files (each in its own try/catch) and returns the health-check object. All the I/O the handler would otherwise do. |
| `server/index.js` | modify | One call, inside the `/api/health` handler. |
| `scripts/git-backup.sh` | modify | Writes the heartbeat on healthy terminal paths; diagnoses push failures. |
| `scripts/deploy.sh` | modify | Prints the health verdict it currently discards. |
| `.github/workflows/deploy.yml` | modify | Delegates to `scripts/deploy.sh`; loses its destructive reset. |
| `server/__tests__/backupHeartbeatHealth.test.js` | create | Pure-maths cases. |
| `server/__tests__/contentBackupHealth.test.js` | create | Filesystem cases, incl. the malformed-status-file tolerance. |
| `scripts/__tests__/git-backup.test.mjs` | modify | Heartbeat + push-diagnosis cases, appended to the existing harness. |
| `scripts/__tests__/shell-syntax.test.mjs` | create | `bash -n` on the two modified shell scripts. |
| `tools/__tests__/deployPathSingleSource.test.js` | create | Pins that only one deploy path exists and it does not hard-reset. |

---

### Task 1: Extract the shared heartbeat arithmetic

`server/lib/offboxBackupHealth.js` already holds exactly the staleness maths the content backup needs. Extract it once rather than shipping a second copy that can drift.

**Files:**
- Create: `server/lib/backupHeartbeatHealth.js`
- Modify: `server/lib/offboxBackupHealth.js`
- Test: `server/__tests__/backupHeartbeatHealth.test.js` (create)
- Leave untouched: `server/__tests__/healthOffboxBackup.test.js` — it becomes the behaviour pin proving the wrapper still works.

**Interfaces:**
- Consumes: nothing.
- Produces: `computeBackupHeartbeatHealth({ heartbeatMtimeMs: number|null, nowMs: number, staleHours: number }) → { age_hours: number|null, stale: boolean }`, exported from `server/lib/backupHeartbeatHealth.js` via CommonJS `module.exports`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/backupHeartbeatHealth.test.js`:

```js
/**
 * Shared staleness arithmetic for both backup heartbeats.
 *
 * Two crons write a heartbeat file only on success: backup-db.sh (off-box
 * sessions.db, 6-hourly) and git-backup.sh (content push, 2-hourly). Both
 * ask the same question of it — "is this older than my threshold?" — so the
 * maths lives here once. offboxBackupHealth.js delegates to it.
 */

import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { computeBackupHeartbeatHealth } = require('../lib/backupHeartbeatHealth');

const H = 3600 * 1000;

describe('computeBackupHeartbeatHealth', () => {
  it('reports null age + stale when the heartbeat is missing', () => {
    const r = computeBackupHeartbeatHealth({ heartbeatMtimeMs: null, nowMs: 1_000, staleHours: 6 });
    expect(r).toEqual({ age_hours: null, stale: true });
  });

  it('is not stale when the heartbeat is fresh', () => {
    const now = 100 * H;
    const r = computeBackupHeartbeatHealth({ heartbeatMtimeMs: now - 2 * H, nowMs: now, staleHours: 6 });
    expect(r).toEqual({ age_hours: 2, stale: false });
  });

  it('is stale when older than the threshold', () => {
    const now = 100 * H;
    const r = computeBackupHeartbeatHealth({ heartbeatMtimeMs: now - 9 * H, nowMs: now, staleHours: 6 });
    expect(r).toEqual({ age_hours: 9, stale: true });
  });

  it('treats exactly-at-threshold as not stale', () => {
    const now = 100 * H;
    const r = computeBackupHeartbeatHealth({ heartbeatMtimeMs: now - 6 * H, nowMs: now, staleHours: 6 });
    expect(r.stale).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project server server/__tests__/backupHeartbeatHealth.test.js`
Expected: FAIL — `Cannot find module '../lib/backupHeartbeatHealth'`

- [ ] **Step 3: Write minimal implementation**

Create `server/lib/backupHeartbeatHealth.js`:

```js
/**
 * Staleness arithmetic shared by the project's two backup heartbeats.
 *
 * Both backup crons write a heartbeat file ONLY on a healthy run, so that
 * absence or staleness is the alarm — a status file written on every
 * outcome would read "success" forever once the cron stopped. This turns
 * such a file's mtime into a verdict.
 *
 *   - scripts/backup-db.sh   → pipeline-output/backups/.last-offbox-backup
 *   - scripts/git-backup.sh  → pipeline-output/.last-content-backup
 *
 * @param {{heartbeatMtimeMs: number|null, nowMs: number, staleHours: number}} p
 * @returns {{age_hours: number|null, stale: boolean}}
 */
function computeBackupHeartbeatHealth({ heartbeatMtimeMs, nowMs, staleHours }) {
  if (heartbeatMtimeMs == null) return { age_hours: null, stale: true };
  const age_hours = Math.round((nowMs - heartbeatMtimeMs) / 3_600_000);
  return { age_hours, stale: age_hours > staleHours };
}

module.exports = { computeBackupHeartbeatHealth };
```

Replace the body of `server/lib/offboxBackupHealth.js` with a delegating wrapper (keep the file — `server/index.js` and `healthOffboxBackup.test.js` both import it by name):

```js
/**
 * Off-box backup heartbeat health (Track A, Task A3).
 *
 * scripts/backup-db.sh writes pipeline-output/backups/.last-offbox-backup
 * after each successful encrypted off-box upload. server/index.js's
 * /api/health handler reads that file's mtime and calls this, so a silently
 * stopped backup cron becomes visible in health checks instead of
 * discovered in a disaster.
 *
 * The arithmetic is shared with the content-backup heartbeat — see
 * server/lib/backupHeartbeatHealth.js. This wrapper exists so the off-box
 * call site keeps its domain-specific name and its existing test.
 *
 * @param {{heartbeatMtimeMs: number|null, nowMs: number, staleHours: number}} p
 * @returns {{age_hours: number|null, stale: boolean}}
 */
const { computeBackupHeartbeatHealth } = require('./backupHeartbeatHealth');

function computeOffboxBackupHealth(params) {
  return computeBackupHeartbeatHealth(params);
}

module.exports = { computeOffboxBackupHealth };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project server server/__tests__/backupHeartbeatHealth.test.js server/__tests__/healthOffboxBackup.test.js`
Expected: PASS — 4 new + 3 pre-existing. The pre-existing three passing is the point: the wrapper is behaviour-identical.

- [ ] **Step 5: Mutation-check that the wrapper really delegates**

Temporarily change the missing-heartbeat line in `backupHeartbeatHealth.js` from `stale: true` to `stale: false`. Re-run the command from Step 4.

Expected: **two** tests go RED — the new `reports null age + stale when the heartbeat is missing`, *and* the pre-existing `healthOffboxBackup.test.js` case of the same name. The second one is the whole point: it can only fail if `computeOffboxBackupHealth` is genuinely routing through the extracted function. If only the new test reds, the wrapper is a copy, not a delegation. **Revert the mutation.**

(A `>` → `>=` mutation is *not* sufficient here: it reds only the new at-threshold test, because the off-box fixtures are 2 h and 30 h against a 26 h threshold and neither sits on the boundary.)

- [ ] **Step 6: Commit**

```bash
git add server/lib/backupHeartbeatHealth.js server/lib/offboxBackupHealth.js server/__tests__/backupHeartbeatHealth.test.js
git commit -m "$(cat <<'EOF'
refactor(health): extract shared backup-heartbeat staleness maths

The content backup (C11(b)) needs the same "is this heartbeat older than
my threshold" computation the off-box DB backup already has. Extract it
once instead of shipping a second copy that can drift.

offboxBackupHealth.js keeps its export as a delegating wrapper, so every
call site is unchanged and healthOffboxBackup.test.js becomes the pin
proving the delegation is behaviour-identical.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The content-backup health reader

All the filesystem work lives here, not in the `/api/health` handler — `server/index.js` calls `app.listen()` at module load (`:384`), so anything inside the handler is untested-by-design. Keeping this in a lib makes the malformed-file tolerance a real, tested behaviour.

**Files:**
- Create: `server/lib/contentBackupHealth.js`
- Test: `server/__tests__/contentBackupHealth.test.js` (create)

**Interfaces:**
- Consumes: `computeBackupHeartbeatHealth` from Task 1.
- Produces: `readContentBackupHealth({ projectRoot: string, nowMs: number, staleHours?: number }) → { age_hours: number|null, stale: boolean, last_status: string|null, message: string|null, ok: boolean }` and `DEFAULT_STALE_HOURS = 6`, both from `server/lib/contentBackupHealth.js`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/contentBackupHealth.test.js`:

```js
/**
 * Content-backup heartbeat health (register C11(b)).
 *
 * scripts/git-backup.sh writes pipeline-output/.last-content-backup on every
 * HEALTHY run — including "nothing to commit" — and never on a failure. So a
 * stale or absent heartbeat means reviewed translations have stopped
 * reaching GitHub, which was previously invisible: backup-status.json is
 * written on every outcome and was read by nothing.
 *
 * `ok` is driven by the heartbeat ALONE. backup-status.json is hand-built
 * JSON from a shell heredoc and is surfaced as detail only, so a malformed
 * one can never gate the health endpoint or throw inside it.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { readContentBackupHealth, DEFAULT_STALE_HOURS } = require('../lib/contentBackupHealth');

const H = 3600 * 1000;
const NOW = 1_800_000_000_000; // fixed clock; no Date.now() in assertions

let root;

/** Write the heartbeat with an mtime `ageHours` in the past. */
function heartbeat(ageHours) {
  const p = path.join(root, 'pipeline-output', '.last-content-backup');
  writeFileSync(p, new Date(NOW - ageHours * H).toISOString() + '\n');
  const t = new Date(NOW - ageHours * H);
  utimesSync(p, t, t);
}

function statusFile(contents) {
  writeFileSync(path.join(root, 'pipeline-output', 'backup-status.json'), contents);
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'contentbackup-'));
  mkdirSync(path.join(root, 'pipeline-output'), { recursive: true });
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('readContentBackupHealth', () => {
  it('defaults to a 6 hour threshold (2-hourly cron, two missed cycles + margin)', () => {
    expect(DEFAULT_STALE_HOURS).toBe(6);
  });

  it('is not ok when the heartbeat is missing entirely', () => {
    const r = readContentBackupHealth({ projectRoot: root, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.stale).toBe(true);
    expect(r.age_hours).toBeNull();
  });

  it('is ok when the heartbeat is fresh', () => {
    heartbeat(2);
    const r = readContentBackupHealth({ projectRoot: root, nowMs: NOW });
    expect(r.ok).toBe(true);
    expect(r.age_hours).toBe(2);
  });

  it('is not ok when the heartbeat is older than the threshold', () => {
    heartbeat(9);
    const r = readContentBackupHealth({ projectRoot: root, nowMs: NOW });
    expect(r.ok).toBe(false);
    expect(r.age_hours).toBe(9);
  });

  it('honours an explicit staleHours override', () => {
    heartbeat(9);
    const r = readContentBackupHealth({ projectRoot: root, nowMs: NOW, staleHours: 24 });
    expect(r.ok).toBe(true);
  });

  it('surfaces last_status and message from a valid status file', () => {
    heartbeat(1);
    statusFile('{"timestamp":"x","status":"success","message":"Pushed a1b2c3d"}');
    const r = readContentBackupHealth({ projectRoot: root, nowMs: NOW });
    expect(r.last_status).toBe('success');
    expect(r.message).toBe('Pushed a1b2c3d');
  });

  it('reports last_status null when the status file is absent', () => {
    heartbeat(1);
    const r = readContentBackupHealth({ projectRoot: root, nowMs: NOW });
    expect(r.last_status).toBeNull();
    expect(r.ok).toBe(true);
  });

  it('tolerates a MALFORMED status file: no throw, ok still driven by the heartbeat', () => {
    // git-backup.sh builds this JSON by hand in a heredoc. A partial write or
    // a hand-edit must degrade the detail, never the verdict and never the
    // health endpoint.
    heartbeat(1);
    statusFile('{"status": "error", "message": "he said "hi" and broke it"}');
    const r = readContentBackupHealth({ projectRoot: root, nowMs: NOW });
    expect(r.last_status).toBeNull();
    expect(r.ok).toBe(true);
  });

  it('does not let an error status override a fresh heartbeat', () => {
    // A transient failure self-heals within one 2h cycle. Staleness is the
    // gate; a single failed run must not page anyone.
    heartbeat(1);
    statusFile('{"status":"error","message":"git push failed (local ahead 1, behind 1)"}');
    const r = readContentBackupHealth({ projectRoot: root, nowMs: NOW });
    expect(r.last_status).toBe('error');
    expect(r.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project server server/__tests__/contentBackupHealth.test.js`
Expected: FAIL — `Cannot find module '../lib/contentBackupHealth'`

- [ ] **Step 3: Write minimal implementation**

Create `server/lib/contentBackupHealth.js`:

```js
/**
 * Content-backup heartbeat health (register C11(b)).
 *
 * scripts/git-backup.sh — the 2-hourly cron that is the ONLY route by which
 * reviewed translations reach GitHub — writes
 * pipeline-output/.last-content-backup on every healthy run and never on a
 * failure. Absence is therefore the alarm: a status file written on every
 * outcome (backup-status.json) would still read "success" long after the
 * cron died.
 *
 * All filesystem access lives here rather than in the /api/health handler,
 * because server/index.js calls app.listen() at module load and so cannot be
 * imported by a unit test.
 */

const fs = require('fs');
const path = require('path');
const { computeBackupHeartbeatHealth } = require('./backupHeartbeatHealth');

/** Two missed cycles of the 2-hourly cron, plus margin. */
const DEFAULT_STALE_HOURS = 6;

/**
 * @param {{projectRoot: string, nowMs: number, staleHours?: number}} p
 *   projectRoot — the repo root. Derive it from `__dirname`, never
 *   `process.cwd()`: the server runs with cwd=server/.
 * @returns {{age_hours: number|null, stale: boolean, last_status: string|null,
 *            message: string|null, ok: boolean}}
 */
function readContentBackupHealth({ projectRoot, nowMs, staleHours = DEFAULT_STALE_HOURS }) {
  let heartbeatMtimeMs = null;
  try {
    heartbeatMtimeMs = fs.statSync(
      path.join(projectRoot, 'pipeline-output', '.last-content-backup')
    ).mtimeMs;
  } catch {
    /* missing heartbeat => stale, handled by the helper */
  }

  const health = computeBackupHeartbeatHealth({ heartbeatMtimeMs, nowMs, staleHours });

  // Detail only, and deliberately not part of the verdict. The heartbeat is
  // the gate: error paths never write it, so a persistent failure goes stale
  // on its own, while a transient one self-heals inside one cron cycle.
  let last_status = null;
  let message = null;
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'pipeline-output', 'backup-status.json'), 'utf8')
    );
    last_status = typeof parsed.status === 'string' ? parsed.status : null;
    message = typeof parsed.message === 'string' ? parsed.message : null;
  } catch {
    /* absent or malformed => no detail; never affects `ok` */
  }

  return { ...health, last_status, message, ok: !health.stale };
}

module.exports = { readContentBackupHealth, DEFAULT_STALE_HOURS };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project server server/__tests__/contentBackupHealth.test.js`
Expected: PASS — 9 tests.

- [ ] **Step 5: Mutation-check the malformed-file tolerance**

Temporarily remove the `try`/`catch` around the `JSON.parse` block (leave the parse). Re-run Step 4.
Expected: `tolerates a MALFORMED status file` goes RED with a `SyntaxError`. **Revert the mutation.**

- [ ] **Step 6: Commit**

```bash
git add server/lib/contentBackupHealth.js server/__tests__/contentBackupHealth.test.js
git commit -m "$(cat <<'EOF'
feat(health): content-backup heartbeat reader

Reads pipeline-output/.last-content-backup and turns its age into a
verdict, with backup-status.json surfaced as detail only. The gate is
heartbeat freshness alone: error paths never write the heartbeat, so a
persistent failure goes stale by itself while a transient one self-heals
within one 2h cron cycle, and hand-built JSON never reaches the critical
path.

Register C11(b).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Wire `content_backup` into `GET /api/health`

**Files:**
- Modify: `server/index.js` (the `/api/health` handler; the `offbox_backup` block sits at `:293-313`, insert immediately after it, before `const allOk = ...`)

**Interfaces:**
- Consumes: `readContentBackupHealth` from Task 2.
- Produces: `checks.content_backup` on the `/api/health` response body; gates the endpoint's existing `allOk`.

**Why there is no unit test here:** `server/index.js:384` calls `app.listen()` at module load, so importing it in Vitest starts a real server. This matches the existing, deliberately untested `offbox_backup` wiring — which is exactly why Task 2 pushed all the logic into a lib. Step 3 below verifies the wiring against a live server instead.

- [ ] **Step 1: Add the check**

In `server/index.js`, directly after the `checks.offbox_backup` try/catch block and before `const allOk = ...`:

```js
  // Check content-backup heartbeat (register C11(b)). scripts/git-backup.sh
  // is the ONLY route by which reviewed translations reach GitHub, and its
  // failures were previously invisible: it wrote `error` into a gitignored
  // backup-status.json that nothing read, with no MAILTO on the cron. The
  // heartbeat is written only on healthy runs, so staleness is the alarm.
  try {
    const { readContentBackupHealth } = require('./lib/contentBackupHealth');
    checks.content_backup = readContentBackupHealth({
      projectRoot: path.join(__dirname, '..'),
      nowMs: Date.now(),
      staleHours: Number(process.env.CONTENT_BACKUP_STALE_HOURS) || 6,
    });
  } catch (err) {
    checks.content_backup = { ok: false, error: err.message };
  }
```

`checks.content_backup.ok` gates `allOk` automatically — the existing line is `Object.values(checks).every((c) => c.ok)`. No change needed there.

- [ ] **Step 2: Confirm nothing asserts a hard-`ok` health status**

Run: `grep -rniE "health" e2e/ server/__tests__/ | grep -iE "'ok'|\"ok\"|status"`
Expected: no output. (Verified 2026-07-27; re-check because this change makes dev, CI and any fresh deploy report `degraded` until a heartbeat exists — the same, accepted behaviour `offbox_backup` already has.)

- [ ] **Step 3: Verify against a live server**

```bash
SESSIONS_DB_PATH=/tmp/c11-health-check.db PORT=3457 JWT_SECRET=$(head -c 48 /dev/urandom | base64) \
  node server/index.js &
SERVER_PID=$!
sleep 4
curl -s http://localhost:3457/api/health | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const h=JSON.parse(d);console.log(JSON.stringify({status:h.status,content_backup:h.checks.content_backup},null,2))})"
kill $SERVER_PID
rm -f /tmp/c11-health-check.db*
```

Expected: `status` is `"degraded"` and `content_backup` is `{"age_hours":null,"stale":true,"last_status":null,"message":null,"ok":false}` — there is no content cron on a dev box, so a missing heartbeat is the correct verdict. Seeing `age_hours: null` (rather than an `error` field) proves the lib was reached.

- [ ] **Step 4: Run the full server suite**

Run: `npx vitest run --project server`
Expected: PASS, no regressions.

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "$(cat <<'EOF'
feat(health): surface content-backup staleness in /api/health

checks.content_backup gates allOk the same way checks.offbox_backup does,
so a content cron that has stopped pushing flips the endpoint to
"degraded" instead of failing silently. Threshold
CONTENT_BACKUP_STALE_HOURS, default 6h.

Dev, CI and a fresh deploy will now report "degraded" until the first
healthy backup run writes a heartbeat — the accepted behaviour the
off-box check already has.

Register C11(b).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Write the heartbeat from `git-backup.sh`

The producer. Getting the `no_changes` path wrong is the single most likely way to ship a false-alarm generator, so it gets its own test.

**Files:**
- Modify: `scripts/git-backup.sh`
- Test: `scripts/__tests__/git-backup.test.mjs` (append a new `describe` block; the existing harness and its four cases are untouched)

**Interfaces:**
- Consumes: nothing.
- Produces: `pipeline-output/.last-content-backup` — an ISO-8601 UTC timestamp, one line. Read by `readContentBackupHealth` (Task 2) via its mtime.

- [ ] **Step 1: Write the failing tests**

In `scripts/__tests__/git-backup.test.mjs`, extend the `node:fs` import to add `statSync` and `utimesSync`:

```js
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  rmSync,
  existsSync,
  statSync,
  utimesSync,
} from 'node:fs';
```

Add this helper next to `readStatus()`:

```js
function heartbeatPath() {
  return path.join(work, 'pipeline-output', '.last-content-backup');
}
```

Append a new `describe` block at the end of the file:

```js
describe('git-backup.sh content-backup heartbeat (register C11(b))', () => {
  it('writes the heartbeat after a successful push', () => {
    writeFileSync(path.join(work, 'books/prufubok/chapters/ch01/status.json'), '{"chapter":1,"x":3}\n');

    runBackup();

    expect(readStatus().status).toBe('success');
    expect(existsSync(heartbeatPath())).toBe(true);
    expect(readFileSync(heartbeatPath(), 'utf8')).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/m);
  });

  it('writes the heartbeat when there was nothing to commit', () => {
    // THE FALSE-ALARM GUARD. A quiet weekend is a HEALTHY cron, not a dead
    // one. If the heartbeat tracked commits rather than healthy runs,
    // /api/health would declare the content backup broken every time the
    // editors took two days off — and the alarm would be ignored thereafter.
    runBackup();

    expect(readStatus().status).toBe('no_changes');
    expect(existsSync(heartbeatPath())).toBe(true);
  });

  it('leaves an existing heartbeat UNTOUCHED when the push fails', () => {
    // Pre-create with an old mtime. Without this the assertion would pass
    // trivially, because on a failing run the file never existed at all.
    mkdirSync(path.join(work, 'pipeline-output'), { recursive: true });
    writeFileSync(heartbeatPath(), '2020-01-01T00:00:00Z\n');
    const old = new Date('2020-01-01T00:00:00Z');
    utimesSync(heartbeatPath(), old, old);
    const beforeMs = statSync(heartbeatPath()).mtimeMs;

    // Unreachable remote: the push fails, and so does the diagnostic fetch,
    // which also exercises the "counts omitted" fallback.
    git(['remote', 'set-url', 'origin', path.join(work, 'no-such-remote')]);
    writeFileSync(path.join(work, 'books/prufubok/chapters/ch01/status.json'), '{"chapter":1,"x":4}\n');

    const result = runBackup(true);

    expect(result.status).toBe(1);
    expect(readStatus().status).toBe('error');
    expect(statSync(heartbeatPath()).mtimeMs).toBe(beforeMs);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run --project scripts scripts/__tests__/git-backup.test.mjs`
Expected: the two "writes the heartbeat" tests FAIL (`existsSync(...)` is `false`). The third passes already — it is a *preservation* pin, so it is expected to be green before and after; its value is proven by the mutation check in Step 5.

- [ ] **Step 3: Write minimal implementation**

In `scripts/git-backup.sh`:

(a) After the `STATUS_FILE=` line (`:31`), add:

```bash
HEARTBEAT_FILE="${PROJECT_ROOT}/pipeline-output/.last-content-backup"
```

(b) After the `write_status()` function (`:51`), add:

```bash
# Heartbeat: written ONLY on a healthy terminal path — a successful push, or
# a run that found nothing to commit. A run that failed to stage, commit or
# push must leave it untouched.
#
# Why not just read backup-status.json? That file is written on EVERY
# outcome, so once the cron stops entirely it keeps reading "success"
# forever. Inverting the signal makes absence the alarm. `no_changes` counts
# as healthy on purpose: a quiet weekend is a working cron, and an alarm that
# cries wolf every weekend is not an alarm.
#
# Consumed by GET /api/health — see server/lib/contentBackupHealth.js.
write_heartbeat() {
  date -u +%Y-%m-%dT%H:%M:%SZ > "$HEARTBEAT_FILE"
}
```

(c) In the "nothing to commit" branch (`:107-111`), add `write_heartbeat` before the `exit 0`:

```bash
if git diff --cached --quiet; then
  log "No changes to back up"
  write_status "no_changes" "Nothing to commit"
  write_heartbeat
  exit 0
fi
```

(d) At the end of the file (`:127-129`), add `write_heartbeat` as the last line:

```bash
COMMIT_HASH="$(git rev-parse --short HEAD)"
log "Backup complete: ${COMMIT_HASH} (auto-backup: ${TIMESTAMP})"
write_status "success" "Pushed ${COMMIT_HASH}"
write_heartbeat
```

Do **not** add `write_heartbeat` to the three error paths (`:100-104` add failure, `:114-118` commit failure, `:121-125` push failure).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project scripts scripts/__tests__/git-backup.test.mjs`
Expected: PASS — 4 pre-existing + 3 new.

- [ ] **Step 5: Mutation-check the preservation pin**

Temporarily add `write_heartbeat` to the push-failure branch, immediately before its `exit 1`. Re-run Step 4.
Expected: `leaves an existing heartbeat UNTOUCHED when the push fails` goes RED. **Revert the mutation.** If it stays green the test is not actually observing the failure path.

- [ ] **Step 6: Commit**

```bash
git add scripts/git-backup.sh scripts/__tests__/git-backup.test.mjs
git commit -m "$(cat <<'EOF'
feat(backup): write a content-backup heartbeat on healthy runs

The 2-hourly content cron is the only route by which reviewed
translations reach GitHub, and a failed push was invisible: `error` went
into a gitignored backup-status.json that nothing read, with no MAILTO on
the cron. Editors kept working, prod accumulated unpushed commits, nobody
learned.

Write pipeline-output/.last-content-backup on the two healthy terminal
paths — successful push, and nothing-to-commit — and never on a failure,
so staleness is the alarm. Writing it on no_changes is deliberate: a
quiet weekend is a healthy cron, and a smoke detector that cries wolf
every weekend gets ignored.

Register C11(b).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Diagnose push failures with ahead/behind counts

The cron never fetches before pushing, so non-fast-forward rejection is already a live failure mode. This makes the log say which failure it was, without changing the push behaviour.

**Files:**
- Modify: `scripts/git-backup.sh` (the push branch, `:121-125`)
- Test: `scripts/__tests__/git-backup.test.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: on push failure, the log line and `backup-status.json`'s `message` read `git push failed (local ahead N, behind M)` when the counts are obtainable, and plain `git push failed` otherwise. Exit code is `1` either way.

- [ ] **Step 1: Write the failing test**

Append to the `describe` block from Task 4:

```js
  it('reports ahead/behind when the push is rejected as non-fast-forward', () => {
    // Diverge the remote behind this checkout's back, exactly as a dev
    // pushing to main would. The cron never fetches before pushing (see the
    // script's comment for why a rebase there would be worse), so this is a
    // live failure mode, not a hypothetical one.
    const other = mkdtempSync(path.join(tmpdir(), 'gitbackup-other-'));
    execFileSync('git', ['clone', '--quiet', bare, other]);
    execFileSync('git', ['config', 'user.email', 'annar@example.is'], { cwd: other });
    execFileSync('git', ['config', 'user.name', 'Annar'], { cwd: other });
    writeFileSync(path.join(other, 'other.txt'), 'from elsewhere\n');
    execFileSync('git', ['add', '-A'], { cwd: other });
    execFileSync('git', ['commit', '--quiet', '-m', 'other side'], { cwd: other });
    execFileSync('git', ['push', '--quiet', 'origin', 'main'], { cwd: other });
    rmSync(other, { recursive: true, force: true });

    writeFileSync(path.join(work, 'books/prufubok/chapters/ch01/status.json'), '{"chapter":1,"x":5}\n');

    const result = runBackup(true);

    expect(result.status).toBe(1);
    expect(readStatus().message).toMatch(/local ahead 1, behind 1/);
    expect(readLog()).toMatch(/ERROR: git push failed \(local ahead 1, behind 1\)/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project scripts scripts/__tests__/git-backup.test.mjs -t "ahead/behind"`
Expected: FAIL — the message is the bare `git push failed`.

- [ ] **Step 3: Write minimal implementation**

Replace the push branch in `scripts/git-backup.sh` (`:120-125`) with:

```bash
# Push
if ! git push origin main 2>&1 | tee -a "$LOG_FILE"; then
  PUSH_MSG="git push failed"
  # Read-only diagnosis, on the already-failed path only. It distinguishes
  # "GitHub unreachable" from "non-fast-forward — production has diverged",
  # which matters because this script deliberately never fetches before
  # pushing: `merge.ours.driver` for the perpetually-dirty
  # books/*/translation-errors.json is registered by deploy.sh, not by cron,
  # so an unattended rebase here would turn a visible push failure into a
  # repo wedged mid-rebase on production.
  #
  # `timeout` guards the likely case that the network is what failed. If the
  # fetch fails for any reason the counts are simply omitted — a diagnostic
  # must never turn one failure into a different one.
  if timeout 30 git fetch --quiet origin main 2>/dev/null; then
    AHEAD="$(git rev-list --count FETCH_HEAD..HEAD 2>/dev/null || true)"
    BEHIND="$(git rev-list --count HEAD..FETCH_HEAD 2>/dev/null || true)"
    if [ -n "$AHEAD" ] && [ -n "$BEHIND" ]; then
      PUSH_MSG="git push failed (local ahead ${AHEAD}, behind ${BEHIND})"
    fi
  fi
  log "ERROR: ${PUSH_MSG}"
  write_status "error" "${PUSH_MSG}"
  exit 1
fi
```

Notes for the implementer:
- `FETCH_HEAD`, not `origin/main`: `git fetch <remote> <branch>` reliably sets `FETCH_HEAD`, whereas whether it also updates the remote-tracking ref varies.
- Every new command is `-e`-safe: `timeout ... ` sits inside an `if`, and both `rev-list` calls are inside `$( ... || true )`. If `timeout` is not installed the `if` is simply false and the counts are omitted.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project scripts scripts/__tests__/git-backup.test.mjs`
Expected: PASS — 8 tests. In particular the Task 4 test `leaves an existing heartbeat UNTOUCHED when the push fails` must still pass: its remote is unreachable, so the fetch fails and the plain message is used.

- [ ] **Step 5: Mutation-check the fallback**

Temporarily drop the `if [ -n "$AHEAD" ] && [ -n "$BEHIND" ]` guard so `PUSH_MSG` is always rewritten with the counts. Re-run Step 4.
Expected: `leaves an existing heartbeat UNTOUCHED when the push fails` still passes (it asserts only status + mtime), but the script now emits `local ahead , behind ` for an unreachable remote. Confirm by reading the log in that scenario, then **revert the mutation**. This documents that the guard is what keeps the fallback clean.

- [ ] **Step 6: Commit**

```bash
git add scripts/git-backup.sh scripts/__tests__/git-backup.test.mjs
git commit -m "$(cat <<'EOF'
feat(backup): name the push failure — ahead/behind on rejection

The cron never fetches before pushing, so non-fast-forward rejection is
already a live silent failure mode. On the failed path only, do a
read-only timeout-guarded fetch and record how far production has
diverged, which separates "GitHub unreachable" from "someone else pushed
to main".

Diagnosis only: it gates nothing, and if the fetch fails the counts are
omitted and the exit code stays 1. Deliberately NOT adding a rebase to
the cron — merge.ours.driver is registered by deploy.sh, not by cron, so
an unattended rebase over translation-errors.json would wedge prod
mid-rebase.

Register C11(b).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Make the alarm visible from `deploy.sh`

Nothing polls `/api/health` — the only callers are `deploy.sh` (which discards the body) and the dead `deploy.yml`. Without this task the new check is correct and unseen.

**Files:**
- Modify: `scripts/deploy.sh` (`:109-120`)
- Test: `scripts/__tests__/shell-syntax.test.mjs` (create)

**Interfaces:**
- Consumes: `checks.*.ok` from Task 3's `/api/health` response.
- Produces: a `Health: <status> — not ok: <names>` line on stdout during deploy. Gates nothing; the exit-code behaviour of the readiness loop is unchanged.

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/shell-syntax.test.mjs`:

```mjs
/**
 * Syntax-check the shell scripts that run unattended on production.
 *
 * git-backup.sh runs from cron every 2 hours and deploy.sh is run by hand
 * for every release; neither is exercised by any other automated check, so a
 * quoting mistake in an embedded `node -e` block would otherwise surface as
 * a broken deploy rather than a red suite.
 *
 * `bash -n` parses without executing — safe for scripts that touch git,
 * systemd and the network.
 */

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');

const SCRIPTS = ['scripts/git-backup.sh', 'scripts/deploy.sh'];

describe('production shell scripts parse', () => {
  it.each(SCRIPTS)('%s has no syntax errors', (rel) => {
    expect(() =>
      execFileSync('bash', ['-n', path.join(REPO, rel)], { encoding: 'utf8' })
    ).not.toThrow();
  });

  it('deploy.sh prints the health verdict instead of discarding it', () => {
    // The regression this guards: `curl -sf ... > /dev/null` made every
    // health check invisible, including the off-box backup one that had
    // shipped months earlier. Nothing else polls /api/health.
    const src = readFileSync(path.join(REPO, 'scripts', 'deploy.sh'), 'utf8');
    expect(src).toMatch(/api\/health/);
    expect(src).not.toMatch(/curl -sf http:\/\/localhost:3000\/api\/health > \/dev\/null/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project scripts scripts/__tests__/shell-syntax.test.mjs`
Expected: the two `bash -n` cases PASS (both scripts are currently valid); `deploy.sh prints the health verdict` FAILS, because the `> /dev/null` form is still there.

- [ ] **Step 3: Write minimal implementation**

Replace `scripts/deploy.sh:109-120` with:

```bash
# 7. Wait for the service to become healthy (up to 30 s)
echo "Waiting for ritstjorn to become healthy..."
for i in $(seq 1 30); do
  if HEALTH_BODY="$(curl -sf http://localhost:3000/api/health 2>/dev/null)"; then
    echo "=== Deploy complete. Server healthy after ${i}s. ==="
    # Print the verdict rather than discarding it. Nothing else polls
    # /api/health — no monitor, no UI — so this is the only routine surface
    # where a stale backup heartbeat (content, register C11(b); or off-box
    # sessions.db) becomes visible to a human. It gates nothing: "degraded"
    # is a legitimate post-deploy state, e.g. before the first backup cycle.
    echo "$HEALTH_BODY" | node -e "
      let d='';process.stdin.on('data',c=>d+=c);
      process.stdin.on('end',()=>{
        try{
          const h=JSON.parse(d);
          const bad=Object.entries(h.checks||{}).filter(([,c])=>!c.ok).map(([n])=>n);
          console.log('Health: '+h.status+(bad.length?' — not ok: '+bad.join(', '):''));
        }catch{console.log('Health: (unparseable response)')}
      })
    " || true
    exit 0
  fi
  sleep 1
done
echo "=== Deploy complete. WARNING: Server did not become healthy in 30s ==="
echo "  Check logs: journalctl -u ritstjorn -n 50 --no-pager"
exit 1
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project scripts`
Expected: PASS — the whole scripts project, including the Task 4/5 cases.

- [ ] **Step 5: Verify the output shape by hand**

```bash
echo '{"status":"degraded","checks":{"db":{"ok":true},"content_backup":{"ok":false},"offbox_backup":{"ok":false}}}' | node -e "
      let d='';process.stdin.on('data',c=>d+=c);
      process.stdin.on('end',()=>{
        try{
          const h=JSON.parse(d);
          const bad=Object.entries(h.checks||{}).filter(([,c])=>!c.ok).map(([n])=>n);
          console.log('Health: '+h.status+(bad.length?' — not ok: '+bad.join(', '):''));
        }catch{console.log('Health: (unparseable response)')}
      })
    "
```

Expected: `Health: degraded — not ok: content_backup, offbox_backup`

- [ ] **Step 6: Commit**

```bash
git add scripts/deploy.sh scripts/__tests__/shell-syntax.test.mjs
git commit -m "$(cat <<'EOF'
feat(deploy): print the health verdict instead of discarding it

Nothing polls /api/health: the only callers were deploy.sh, which piped
the body to /dev/null, and deploy.yml, which has never run. A health
check nobody reads is not a smoke detector, so the new content_backup
check — and the off-box one that shipped months ago — would both have
stayed invisible.

Print the status plus the names of any not-ok checks on the one surface a
human already watches. Gates nothing: "degraded" remains a legitimate
post-deploy state.

Register C11(b).

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: C11(c) — collapse `deploy.yml` onto `deploy.sh`

`deploy.yml` has never run and cannot: 0 runs, 0 repository secrets, no `production` environment, it restarts `namsbokasafn-efni` while the live unit is `ritstjorn`, and it defaults to `/opt/...` while production lives under `/home/siggi/repos/...`. Its `git reset --hard origin/main` is the C11(c) hazard. Lead decision 2026-07-27: collapse rather than harden — two deploy scripts that disagree is itself the defect.

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Test: `tools/__tests__/deployPathSingleSource.test.js` (create)

**Interfaces:**
- Consumes: `scripts/deploy.sh` (unchanged public behaviour: exits 0 when healthy, 1 otherwise).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the failing test**

Create `tools/__tests__/deployPathSingleSource.test.js`:

```js
/**
 * There is ONE deploy path, and it never hard-resets production.
 *
 * WHY THIS EXISTS (register C11(c)): deploy.yml carried its own inline SSH
 * script that ran `git reset --hard origin/main` on the production server.
 * Combined with a content-backup cron whose push failures were silent, that
 * could discard reviewed translations that existed only on prod's disk.
 *
 * It had also drifted from the script people actually run: it restarted
 * `namsbokasafn-efni` (the live unit is `ritstjorn`), defaulted to
 * /opt/namsbokasafn-efni (prod is under /home/siggi/repos), and duplicated
 * the DB-backup and health-gate steps. It had never run — 0 runs, 0 repo
 * secrets, no `production` environment — so the divergence was invisible.
 *
 * The fix was to delegate to scripts/deploy.sh, which backs up the DB,
 * pins Node to the systemd runtime's ABI, and stashes and re-applies local
 * editorial changes instead of discarding them. This pins that shape.
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..', '..');
const DEPLOY_YML = path.join(REPO_ROOT, '.github', 'workflows', 'deploy.yml');

describe('deploy.yml delegates to the one deploy script (C11(c))', () => {
  const yml = fs.readFileSync(DEPLOY_YML, 'utf8');

  it('reads a non-empty deploy.yml (guard against a vacuous pass)', () => {
    // Without this, a renamed or deleted workflow would make every
    // `not.toMatch` below pass by asserting nothing.
    expect(yml.length).toBeGreaterThan(200);
    expect(yml).toMatch(/appleboy\/ssh-action/);
  });

  it('never hard-resets the production working tree', () => {
    expect(yml).not.toMatch(/git\s+reset\s+--hard/);
  });

  it('calls scripts/deploy.sh instead of duplicating its steps', () => {
    expect(yml).toMatch(/\.\/scripts\/deploy\.sh/);
  });

  it('does not name a systemd unit — deploy.sh owns that', () => {
    expect(yml).not.toMatch(/systemctl/);
  });

  it('does not duplicate the DB backup — deploy.sh does it first', () => {
    expect(yml).not.toMatch(/sessions-\$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --project tools tools/__tests__/deployPathSingleSource.test.js`
Expected: FAIL — four of the five cases fail (`git reset --hard`, no `deploy.sh` call, `systemctl` present, DB-backup duplication).

- [ ] **Step 3: Write minimal implementation**

Replace `.github/workflows/deploy.yml` in full:

```yaml
name: Deploy to Production

on:
  # Manual trigger with environment confirmation
  workflow_dispatch:
    inputs:
      confirm:
        description: 'Type "deploy" to confirm'
        required: true
        type: string

jobs:
  deploy:
    runs-on: ubuntu-latest
    if: github.event.inputs.confirm == 'deploy'
    environment: production

    steps:
      - name: Validate trigger
        run: |
          echo "Deploying commit ${{ github.sha }} to production"
          echo "Triggered by: ${{ github.actor }}"

      # This workflow deliberately owns NO deploy logic of its own.
      # scripts/deploy.sh is the single deploy path (register C11(c)): it
      # backs up sessions.db first, pins Node to the same binary systemd
      # uses (guarding the better-sqlite3 ABI break of 2026-05-10), stashes
      # and RE-APPLIES local editorial changes rather than discarding them,
      # restarts the real unit, and exits non-zero if the server never
      # becomes healthy. An inline copy here previously drifted from all
      # four of those and ran `git reset --hard origin/main` on production.
      #
      # NOTE: this workflow has never run. It needs DEPLOY_HOST, DEPLOY_USER
      # and DEPLOY_SSH_KEY, and the repository currently has no secrets and
      # no `production` environment. Deploys are run by hand:
      #   ./scripts/deploy.sh
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script_stop: true
          script: |
            set -euo pipefail
            APP_DIR="${{ secrets.DEPLOY_APP_DIR || '/home/siggi/repos/namsbokasafn-efni' }}"
            cd "$APP_DIR"
            ./scripts/deploy.sh

      - name: Report status
        if: always()
        run: |
          if [ "${{ job.status }}" = "success" ]; then
            echo "✅ Deploy succeeded"
          else
            echo "❌ Deploy failed — check logs above"
          fi
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run --project tools tools/__tests__/deployPathSingleSource.test.js`
Expected: PASS — 5 tests.

Also confirm the YAML still parses:

Run: `node -e "const y=require('js-yaml');y.load(require('fs').readFileSync('.github/workflows/deploy.yml','utf8'));console.log('yaml ok')"`
Expected: `yaml ok`. (If `js-yaml` is not resolvable from the repo root, skip this check — Step 4's regex pins plus GitHub's own workflow parser cover it.)

- [ ] **Step 5: Mutation-check the pin**

Temporarily re-add a line `            git reset --hard origin/main` inside the SSH `script:` block. Re-run Step 4.
Expected: `never hard-resets the production working tree` goes RED. **Revert the mutation.**

- [ ] **Step 6: Commit**

```bash
git add .github/workflows/deploy.yml tools/__tests__/deployPathSingleSource.test.js
git commit -m "$(cat <<'EOF'
fix(deploy): one deploy path — deploy.yml calls scripts/deploy.sh

deploy.yml ran `git reset --hard origin/main` on production. With a
content cron whose push failures are silent, that could discard reviewed
translations existing only on prod's disk (register C11(c)).

It had also drifted from the script people actually run: wrong systemd
unit (namsbokasafn-efni vs ritstjorn, swallowed by `|| true`), wrong
default app dir (/opt vs /home/siggi/repos), and its own copies of the DB
backup and health gate. It had never run and could not — 0 runs, 0 repo
secrets, no `production` environment — so none of that drift was visible.

Collapse it onto scripts/deploy.sh rather than hardening the reset in
place: two deploy scripts that disagree is itself the defect. The reset
is gone, and the DB backup, Node/ABI pin, stash-and-reapply and health
gate are inherited.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Documentation — fix the wrong document, don't log it in another

Per CLAUDE.md § *One source of truth*: each fact has one owner. Three documents currently assert things this branch makes false.

**Files:**
- Modify: `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C11 and the ⏩ RESUME block)
- Modify: `CLAUDE.md` (§ *Content delivery to readers is MANUAL…*)
- Modify: `scripts/install-cron.sh`
- Modify: `docs/technical/backup-and-restore.md`
- Do **not** modify: `docs/plans/2026-07-12-git-backup-atomic-add-design.md` — frozen evidence; it correctly records a deferral made at the time. Frozen docs are cited, not synced.

**Interfaces:** none.

- [ ] **Step 1: Update the register (the only live status home)**

In `docs/plans/2026-07-21-post-item17-followup-campaign.md`:

(a) In the ⏩ RESUME block, replace the `▶ NEXT [CODE]` line with:

```markdown
- **✅ C11(b) + C11(c) FIXED 2026-07-27** on `fix/c11-content-backup-smoke-detector` — content-backup heartbeat + `/api/health` `content_backup` check + `deploy.sh` prints the verdict; `deploy.yml` collapsed onto `scripts/deploy.sh`, deleting its `git reset --hard`. Detail in §C11. **C11's remaining row is (a), which is [LEAD] and deferred** — so C11 is closed as a [CODE] item, and the C12 prerequisite is discharged.
- **▶ NEXT [CODE], in order:** **C13** (`<figure>`-in-`<note>` inject bug, 3 orphaned images live on biology ch05) → **C14** (glossary bridge has no runner + `formatGlossary` empty-`targetWord` guard) → then C1d write-path publish, then P2 batches.
```

(b) In §C11, mark (b) and (c) closed and correct the dead-path premise. Replace the `(b)` and `(c)` bullets' leading text with:

```markdown
  - **(b) ✅ FIXED 2026-07-27 — a failed content push is now visible.** `scripts/git-backup.sh` writes `pipeline-output/.last-content-backup` on its two healthy terminal paths (successful push, and nothing-to-commit) and never on a failure, so **staleness is the alarm** — the inversion the off-box DB backup already used. `GET /api/health` gained `checks.content_backup` (`server/lib/contentBackupHealth.js`, threshold `CONTENT_BACKUP_STALE_HOURS`, default 6h) which gates `allOk`, and `scripts/deploy.sh` now **prints** the health verdict it used to pipe to `/dev/null` — nothing else polls that endpoint, so this is where a human sees it. Push failures also log ahead/behind counts, separating "GitHub unreachable" from "prod has diverged". **A rebase was deliberately NOT added to the cron:** `merge.ours.driver` is registered by `deploy.sh`, not by cron, so an unattended rebase over `translation-errors.json` would convert a visible push failure into a repo wedged mid-rebase on production. *Original finding: the script detected failure correctly and wrote `error` to a gitignored `backup-status.json` that nothing read, with no `MAILTO` in `install-cron.sh`.*
  - **(c) ✅ FIXED 2026-07-27 — `deploy.yml` no longer owns any deploy logic.** ⚠️ **Premise corrected:** the earlier note said to fix this "before the next `deploy.yml` run". **There has never been a run and there cannot be one** — `gh run list --workflow=deploy.yml` → `[]`, `gh secret list` → empty, and the `production` environment does not exist, so the SSH action's credentials are empty strings and `:50` was unreachable. Two further signs of abandonment: it restarted `namsbokasafn-efni` (live unit is `ritstjorn`, swallowed by `|| true`) and defaulted `DEPLOY_APP_DIR` to `/opt/...` (prod is `/home/siggi/repos/...`). **Lead decision 2026-07-27: collapse, not harden** — the workflow now just calls `scripts/deploy.sh`, which deletes `git reset --hard origin/main` and inherits the DB backup, the Node/ABI pin, stash-and-reapply, and the health gate. Hardening in place would have invested in a divergent second deploy path, and *two deploy scripts that disagree* was itself the defect. Pinned by `tools/__tests__/deployPathSingleSource.test.js`.
```

(c) Append to §C11, after the `⚠️ Sequencing` bullet:

```markdown
  - **Considered and NOT built (logged so they are not re-raised as oversights):** a scheduled watchdog Action reading the age of the newest `auto-backup:` commit on `main` (out-of-band, but false-alarms whenever there is genuinely nothing to commit); `MAILTO` on the cron (needs a working MTA on the box — **[LEAD]**); an admin health widget in the editorial UI. The heartbeat plus the `deploy.sh` readout is the whole detector. Also considered and rejected: escaping `$message` in `write_status` — no call site can emit a quote, and the *consumer* tolerates malformed JSON and is tested for it.
```

- [ ] **Step 2: Update CLAUDE.md**

In CLAUDE.md § *Content delivery to readers is MANUAL…*, replace the second bullet (the one beginning `**⚠️ A failed content push is INVISIBLE.**`) with:

```markdown
- **✅ A failed content push is now VISIBLE (register C11(b), 2026-07-27).** `scripts/git-backup.sh` writes `pipeline-output/.last-content-backup` **only on healthy runs** — successful push, or nothing-to-commit — so **staleness is the alarm**; `GET /api/health` reports `checks.content_backup` (default stale after 6h, `CONTENT_BACKUP_STALE_HOURS`) and flips to `degraded`, and `./scripts/deploy.sh` **prints** the verdict. **Nothing else polls `/api/health`** — no monitor, no UI — so the deploy readout is where you see it. Push failures log ahead/behind counts. ⚠️ **Do not add a rebase to the cron:** `merge.ours.driver` is registered by `deploy.sh`, not by cron, so an unattended rebase over `translation-errors.json` wedges prod mid-rebase — the cron still never fetches before pushing, by design.
```

Then replace the `deploy.yml:50` bullet (beginning `**⚠️ `deploy.yml:50` runs `git reset --hard origin/main` ON PROD.**`) with:

```markdown
- **✅ `deploy.yml` no longer hard-resets prod (C11(c), 2026-07-27).** It had never run and could not (0 runs, 0 repo secrets, no `production` environment; it also restarted the wrong systemd unit and pointed at the wrong app dir). It now simply calls `./scripts/deploy.sh` — **the single deploy path** — which backs up the DB, pins Node to the systemd runtime, and **stashes and re-applies** local editorial changes instead of discarding them. Pinned by `tools/__tests__/deployPathSingleSource.test.js`.
```

- [ ] **Step 3: Update `scripts/install-cron.sh`**

Replace the git-backup cron comment block (`:13-14`) with:

```bash
# Git backup: content files every 2 hours.
# Writes pipeline-output/.last-content-backup on every healthy run (including
# "nothing to commit"); /api/health reports checks.content_backup stale after
# CONTENT_BACKUP_STALE_HOURS (default 6) and ./scripts/deploy.sh prints it.
# See docs/technical/backup-and-restore.md.
0 */2 * * * ${DEPLOY_PATH}/scripts/git-backup.sh
```

- [ ] **Step 4: Update `docs/technical/backup-and-restore.md`**

Add a row to the Configuration table (after the `OFFBOX_BACKUP_STALE_HOURS` row):

```markdown
| `CONTENT_BACKUP_STALE_HOURS` | the server (`/api/health`) | `6` | Age past which `/api/health` flags the **content** backup `stale` (two missed 2 h cycles + margin). |
```

Then add this section immediately before `## Restore runbook`:

```markdown
## The other cron: content backup (`git-backup.sh`)

This document is about `sessions.db`. The 2-hourly `scripts/git-backup.sh` cron protects a different asset — the reviewed content under `books/` — by committing and pushing it to `main`. It is the **only** route by which reviewed translations leave the production box.

It uses the same heartbeat inversion as the DB backup: `pipeline-output/.last-content-backup` is written **only on a healthy run**, and a run that found nothing to commit counts as healthy (a quiet weekend is a working cron). `/api/health` reports:

```json
"content_backup": { "age_hours": 2, "stale": false, "last_status": "success", "message": "Pushed a1b2c3d", "ok": true }
```

`last_status` and `message` come from `pipeline-output/backup-status.json` and are **detail only** — `ok` is driven by heartbeat freshness alone, so one transient failure self-heals within a cycle without alarming, while a persistent one goes stale.

**Nothing polls `/api/health`.** `./scripts/deploy.sh` prints the status and the names of any not-ok checks at the end of every deploy; that is the routine surface. To check on demand: `curl -s http://localhost:3000/api/health`.

⚠️ **The cron deliberately never fetches before pushing.** The `merge.ours.driver` for the perpetually-dirty `books/*/translation-errors.json` is registered by `deploy.sh`, not by cron, so an unattended `git pull --rebase` here would turn a visible push failure into a repository wedged mid-rebase on production. A rejected push instead fails loudly, logs `git push failed (local ahead N, behind M)`, and goes stale in `/api/health`; resolve it by hand on the box.
```

- [ ] **Step 5: Verify the docs gate**

Run: `npm run validate && npx vitest run --project tools`
Expected: PASS. (`docs-check` in CI regenerates `docs/_generated/`; if it reports drift, run the generator it names and include the result in this commit.)

- [ ] **Step 6: Commit**

```bash
git add docs/plans/2026-07-21-post-item17-followup-campaign.md CLAUDE.md scripts/install-cron.sh docs/technical/backup-and-restore.md
git commit -m "$(cat <<'EOF'
docs(C11): close (b)+(c) in the register; correct three stale assertions

Per CLAUDE.md § One source of truth, fix the wrong document rather than
logging it elsewhere:

- register §C11: (b) and (c) closed, and the "fix before the next
  deploy.yml run" premise corrected — it has never run and cannot.
- CLAUDE.md § Content delivery: "read by nothing" and "heartbeat pattern
  to copy" are both false as of this branch, as is the deploy.yml
  reset --hard warning.
- install-cron.sh + backup-and-restore.md: document the content
  heartbeat, its threshold, where the alarm actually surfaces, and why
  the cron must not fetch before pushing.

Left frozen on purpose: 2026-07-12-git-backup-atomic-add-design.md:68
deferred this once and correctly records what was decided then.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Full-suite verification and branch review

- [ ] **Step 1: Run the authoritative gate**

Run: `npm test` **from the repo root**
Expected: PASS, all three projects. Record the total count in the PR body — no document asserts a test count.

- [ ] **Step 2: Run the lint gate CI actually runs**

Run: `npm run lint && npm run format:check`
Expected: PASS both. (`npm run lint` alone is **not** the Lint job — CI also runs prettier.)

- [ ] **Step 3: Whole-branch adversarial review**

Review the entire branch diff (`git diff main...HEAD`), not just the original problem. Most upheld findings in this project have been defects in the *fix*, not pre-existing ones. Read the raw findings; a summary verdict is not authoritative.

- [ ] **Step 4: Open the PR**

```bash
git fetch origin   # required after any earlier `gh pr merge --delete-branch`, else a 2GiB remote-reject
git push -u origin fix/c11-content-backup-smoke-detector
gh pr create --title "C11(b)+(c): content-backup smoke detector; one deploy path" --body "$(cat <<'EOF'
Closes register C11(b) and C11(c). Design:
docs/superpowers/specs/2026-07-27-c11-content-backup-smoke-detector-design.md

## What

- `git-backup.sh` writes `pipeline-output/.last-content-backup` on its two
  healthy terminal paths and never on a failure, so staleness is the alarm.
- `GET /api/health` gains `checks.content_backup`, gating `allOk`
  (`CONTENT_BACKUP_STALE_HOURS`, default 6).
- `deploy.sh` prints the health verdict it used to discard — nothing else
  polls that endpoint, so this is where a human sees it.
- Push failures log ahead/behind counts.
- `deploy.yml` calls `scripts/deploy.sh`, deleting its
  `git reset --hard origin/main` on production.

## Premises corrected

`deploy.yml` has never run and cannot: 0 runs, 0 repo secrets, no
`production` environment; it also restarted the wrong systemd unit and
pointed at the wrong app dir. The register said to fix it "before the next
run" — there is no next run.

## Gate

Local `npm test` from the repo root: <N> passed. That is the authoritative
gate — there is no branch protection, so a red PR can still merge.
`npm run lint` + `npm run format:check` both green.

## Expected behaviour change

Dev, CI and production immediately after deploy will report
`status: "degraded"` until the first healthy backup run writes a heartbeat
(up to 2h on prod). This is correct, and matches the off-box backup check
that shipped in #262.

## Deploy / data ops

Server change — reaches ritstjorn only via `./scripts/deploy.sh`. No data
op, no re-render, no vefur sync.
EOF
)"
```

Replace `<N>` with the actual count from Step 1. Do not assert a count anywhere else — no document in this repo holds a test count.

## Post-merge riders (state in the PR body; do not do them here)

- The `content_backup` check reads `degraded` on production until the **first `git-backup.sh` run after the deploy** writes a heartbeat — up to 2 hours. This is correct, and matches the documented off-box behaviour.
- **[LEAD]** C11(a) (the `Sync Content to Vefur` deploy key) remains deferred; manual `node scripts/sync-content.js` is still the route to readers.
- **[LEAD]** C12 (branch protection: force-push + deletion blocking only) had C11(b) as its stated prerequisite. That prerequisite is now discharged.
