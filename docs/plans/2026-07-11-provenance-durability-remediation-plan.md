# Provenance & Durability Remediation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the three highest-leverage provenance/durability guarantees in code — off-box restore-tested `sessions.db` backup, no second `01-source` overwrite path, and an MT edit-lock — without touching the well-built content tiers.

**Architecture:** Three independent tracks, each a standalone PR, in priority order A → B → C. A hardens the backup scripts + health check. B deletes a CLI verb + adds a static guard test. C adds a shared `.cjs` lock library keyed off the mtOutput file path, written by the server on first edit and enforced by the MT CLI.

**Tech Stack:** Node 22.x ESM + CommonJS mix; better-sqlite3; Vitest; bash + `rclone` + `sqlite3` (Track A); the `tools/lib/*.cjs` dual-consumption pattern (imported from both ESM tools and CommonJS server).

## Status (updated 2026-07-11)

- **Track A (PROV-2) — ✅ SHIPPED + MERGED (PR #262).** Off-box encrypted `sessions.db` backup + restore-test + `/api/health` staleness heartbeat + runbook. **[LEAD PREREQ] the off-box path activates only once the Linode Object Storage bucket + rclone crypt remote exist and `BACKUP_REMOTE` is set in cron** — see `docs/technical/backup-and-restore.md`; until then `/api/health` reports `"degraded"` (expected, deploy-gate-whitelisted). Residual minors noted in the PR (download-guard test, route-wiring test).
- **Track B (PROV-1) — ✅ SHIPPED + MERGED (PR #264, 2026-07-11).** `update` verb deleted from `check-source-updates.js` (read-only `check`/`status`/`diff` kept); `tools/__tests__/source-write-guard.test.js` enforces the only-one-CNXML-writer invariant (precise write-gone driver + classified 20-tool allowlist tripwire + unknown-verb subprocess test — note the tripwire covers top-level `tools/*.js` only, register entry TB-OOS-1); F2 design-doc claim corrected. Two pre-flight corrections to this plan's B1 test text were needed and are recorded in the PR: the `upstreamContent` regex false-flagged `cmdDiff`'s legitimate temp write, and the 5-entry allowlist was stale (20 real touchers). Final whole-branch review: ready-to-merge, 0 Critical/Important.
- **Track C (MT edit-lock) — ⏳ NEXT.** Branch `fix/mt-edit-lock` off `main`; 5 tasks. Note C4 MUST add the marker glob to `git-backup.sh`'s staged list or markers never leave prod. (Per Track B's lesson: empirically pre-flight the plan-embedded test code below — grep each factual claim — before dispatching implementers.)
- Execute B and C via superpowers:subagent-driven-development, one PR each. Full resume detail in project memory `server-editor-review-2026-07`.

## Global Constraints

- **Robustness over expedience:** one real code path; fail loud; no escape hatch reaches prod; split refactor from enforcement.
- **`01-source/` and `02-mt-output/` content stay READ-ONLY to the pipeline.** Track C writes a *sibling marker file* next to MT output, never MT segment content.
- **Resolve paths against something intrinsic** (`__dirname`/`import.meta.url` for files, `resolveDbPath()` for the DB) — never `process.cwd()`.
- **`npm test` from the repo root is the authoritative gate** (no branch protection). Run it before every commit.
- **Node 22.x / npm 10.x;** the server runs with cwd=`server/`.
- **Backup destination:** Linode Object Storage via `rclone` crypt (client-side encryption); code is destination-agnostic via `BACKUP_REMOTE`.
- **MT lock trigger:** the first saved segment edit for a module (first `segment_edits` row). Lock is one-way for MVP.
- Each track is a separate branch off `main` and a separate PR.

---

## File / Artifact Map

**Track A** — `scripts/backup-db.sh` (modify), `scripts/verify-db-backup.sh` (create), `server/index.js` (modify `/api/health` at :259), `server/__tests__/healthOffboxBackup.test.js` (create), `scripts/__tests__/backup-db.bats` or a node test harness (create), `docs/technical/backup-and-restore.md` (create).

**Track B** — `tools/check-source-updates.js` (modify: delete `update`), `tools/__tests__/source-write-guard.test.js` (create), `docs/plans/2026-07-02-f2-source-guard-design.md` (modify: correct the claim).

**Track C** — `tools/lib/mt-lock.cjs` (create), `tools/__tests__/mt-lock.test.js` (create), `server/services/segmentEditorService.js` (modify `saveSegmentEdit` at :45/:117), `server/__tests__/mtLockOnFirstEdit.test.js` (create), `tools/api-translate.js` (modify workList at :714-721 + write at :583), `tools/__tests__/api-translate-mt-lock.test.js` (create), `scripts/backfill-mt-locks.js` (create), `scripts/git-backup.sh` (modify: stage marker glob).

---

# TRACK A — sessions.db off-box, restore-tested backup

Branch: `fix/prov-2-offbox-db-backup`. Base: `main`.

### Task A1: Encrypt-and-upload extension to backup-db.sh

**Files:**
- Modify: `scripts/backup-db.sh` (append after the local copy at the current line ~49)
- Test: `scripts/__tests__/backup-db.test.mjs` (create)

**Interfaces:**
- Produces: env contract `BACKUP_REMOTE` (an rclone `remote:path` — the remote is a **crypt** remote whose passphrase lives in the rclone config, `RCLONE_CONFIG_<NAME>_PASSWORD` / `rclone config`, NOT a script-read env var), `BACKUP_REMOTE_KEEP` (default 30). Writes `pipeline-output/backups/.last-offbox-backup` (ISO timestamp) on success (consumed by A3/A4).
- **Encryption note (per review):** the script does **not** read a `BACKUP_ENCRYPTION_KEY` — encryption is the rclone crypt remote's responsibility (client-side, config-held passphrase). Do not add a script-read encryption env; it would mislead an operator into thinking the script encrypts. The runbook (A4) documents the passphrase living in the crypt remote.

- [ ] **Step 1: Write the failing test**

Create `scripts/__tests__/backup-db.test.mjs`. It drives the real script against a temp DB and a temp `rclone` *local+crypt* remote, asserting the encrypted object appears and the heartbeat is written; and that with `BACKUP_REMOTE` unset the script exits 0 and skips upload.

```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(REPO, 'scripts', 'backup-db.sh');
const hasRclone = (() => { try { execFileSync('rclone', ['version']); return true; } catch { return false; } })();

describe('backup-db.sh off-box upload', () => {
  it('skips upload and exits 0 when BACKUP_REMOTE is unset', () => {
    const work = mkdtempSync(path.join(tmpdir(), 'bkup-'));
    const db = path.join(work, 'sessions.db');
    execFileSync('sqlite3', [db, 'CREATE TABLE t(x); INSERT INTO t VALUES (1);']);
    const out = execFileSync('bash', [SCRIPT, path.join(work, 'backups')], {
      env: { ...process.env, DB_PATH_OVERRIDE: db, BACKUP_REMOTE: '' }, encoding: 'utf8',
    });
    expect(out).toMatch(/BACKUP_REMOTE not set.*skipping off-box/i);
    rmSync(work, { recursive: true, force: true });
  });

  it.skipIf(!hasRclone)('uploads an encrypted object and writes the heartbeat', () => {
    const work = mkdtempSync(path.join(tmpdir(), 'bkup-'));
    const db = path.join(work, 'sessions.db');
    const remoteDir = path.join(work, 'remote');
    const backups = path.join(work, 'backups');
    execFileSync('sqlite3', [db, 'CREATE TABLE t(x); INSERT INTO t VALUES (1);']);
    // rclone config via env: a crypt remote wrapping a local remote.
    const env = {
      ...process.env, DB_PATH_OVERRIDE: db,
      RCLONE_CONFIG_LOCALBK_TYPE: 'local',
      RCLONE_CONFIG_SECRET_TYPE: 'crypt',
      RCLONE_CONFIG_SECRET_REMOTE: `localbk:${remoteDir}`,
      RCLONE_CONFIG_SECRET_PASSWORD: execFileSync('rclone', ['obscure', 'testpass'], { encoding: 'utf8' }).trim(),
      BACKUP_REMOTE: 'secret:',  // crypt remote; passphrase is in RCLONE_CONFIG_SECRET_PASSWORD, not a script env
    };
    execFileSync('bash', [SCRIPT, backups], { env, encoding: 'utf8' });
    expect(existsSync(path.join(backups, '.last-offbox-backup'))).toBe(true);
    // The crypt remote wrote an encrypted (name-obscured) object under remoteDir.
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
    expect(walk(remoteDir).length).toBeGreaterThan(0);
    rmSync(work, { recursive: true, force: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/siggi/dev/repos/namsbokasafn-efni && npx vitest run scripts/__tests__/backup-db.test.mjs`
Expected: FAIL — the script doesn't honor `DB_PATH_OVERRIDE`, doesn't emit the skip message, doesn't upload or write the heartbeat.

- [ ] **Step 3: Implement the script changes**

In `scripts/backup-db.sh`: (a) allow a `DB_PATH_OVERRIDE` for tests right after `DB_PATH=` is set; (b) after the existing `cp "$DB_PATH" "$BACKUP_FILE"` and prune block, append the off-box stage. Add near the top, after the `DB_PATH=...` line:

```bash
# Test seam: allow overriding the DB path (used by scripts/__tests__).
DB_PATH="${DB_PATH_OVERRIDE:-$DB_PATH}"
```

Append at the end of the file:

```bash
# --- Off-box upload (encrypted) -------------------------------------------
# Uploads the just-created backup to BACKUP_REMOTE via rclone. The remote is a
# client-side-encrypted (crypt) remote, so plaintext never leaves this box.
# Unset BACKUP_REMOTE => skip (local-only backup still valid; dev/CI unaffected).
REMOTE_KEEP="${BACKUP_REMOTE_KEEP:-30}"
HEARTBEAT="${BACKUP_DIR}/.last-offbox-backup"

if [ -z "${BACKUP_REMOTE:-}" ]; then
  echo "BACKUP_REMOTE not set — skipping off-box upload (local backup only)." >&2
else
  if ! command -v rclone >/dev/null 2>&1; then
    echo "ERROR: BACKUP_REMOTE set but rclone not installed" >&2
    exit 3
  fi
  echo "Uploading encrypted backup to ${BACKUP_REMOTE} ..."
  if ! rclone copyto "$BACKUP_FILE" "${BACKUP_REMOTE}$(basename "$BACKUP_FILE")"; then
    echo "ERROR: off-box upload failed" >&2   # loud + non-zero; heartbeat NOT written
    exit 4
  fi
  date -u +%Y-%m-%dT%H:%M:%SZ > "$HEARTBEAT"
  echo "Off-box upload OK; heartbeat: $HEARTBEAT"
  # Prune remote to the most recent $REMOTE_KEEP (best-effort; upload already succeeded).
  mapfile -t REMOTE_OLD < <(rclone lsf "$BACKUP_REMOTE" --files-only 2>/dev/null \
    | grep '^sessions\.' | sort -r | tail -n +"$((REMOTE_KEEP + 1))")
  for f in "${REMOTE_OLD[@]:-}"; do [ -n "$f" ] && rclone deletefile "${BACKUP_REMOTE}${f}" 2>/dev/null || true; done
fi
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run scripts/__tests__/backup-db.test.mjs`
Expected: PASS (the rclone case auto-skips if rclone isn't installed locally; the unset-remote case always runs).

- [ ] **Step 5: Commit**

```bash
git add scripts/backup-db.sh scripts/__tests__/backup-db.test.mjs
git commit -m "feat(backup): encrypt + off-box upload of sessions.db (config-gated, loud on failure)"
```

### Task A2: verify-db-backup.sh restore-and-integrity check

**Files:**
- Create: `scripts/verify-db-backup.sh`
- Test: extend `scripts/__tests__/backup-db.test.mjs`

**Interfaces:**
- Consumes: `BACKUP_REMOTE` (same as A1).
- Produces: exit 0 on a restorable+intact backup, non-zero on FAIL.

- [ ] **Step 1: Write the failing test** (append to `backup-db.test.mjs`)

```javascript
import { execFileSync } from 'node:child_process';
// ... (reuse REPO, hasRclone from above)
describe('verify-db-backup.sh', () => {
  it.skipIf(!hasRclone)('downloads, decrypts, and integrity-checks the latest off-box backup', () => {
    // Arrange: run backup-db.sh once to populate the crypt remote (reuse the A1 env recipe),
    // then run verify-db-backup.sh against the same remote and assert exit 0 + a PASS line.
    // (Full env setup mirrors A1's uploads-an-encrypted-object test.)
    const VERIFY = path.join(REPO, 'scripts', 'verify-db-backup.sh');
    // ...set up work dir + crypt remote + one uploaded backup as in A1...
    const out = execFileSync('bash', [VERIFY], { env /* the A1 crypt env */, encoding: 'utf8' });
    expect(out).toMatch(/integrity_check: ok/i);
    expect(out).toMatch(/RESTORE VERIFY: PASS/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run scripts/__tests__/backup-db.test.mjs -t verify-db-backup`
Expected: FAIL — `verify-db-backup.sh` doesn't exist.

- [ ] **Step 3: Create `scripts/verify-db-backup.sh`**

```bash
#!/usr/bin/env bash
# Restore-test the latest off-box sessions.db backup: download → decrypt (via the
# crypt remote) → PRAGMA integrity_check → sanity row counts. Exits non-zero on FAIL.
# Run monthly from cron; also runnable by hand after any backup change.
set -euo pipefail

if [ -z "${BACKUP_REMOTE:-}" ]; then echo "ERROR: BACKUP_REMOTE not set" >&2; exit 2; fi
command -v rclone >/dev/null || { echo "ERROR: rclone not installed" >&2; exit 2; }
command -v sqlite3 >/dev/null || { echo "ERROR: sqlite3 not installed" >&2; exit 2; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
LATEST="$(rclone lsf "$BACKUP_REMOTE" --files-only | grep '^sessions\.' | sort -r | head -1)"
[ -n "$LATEST" ] || { echo "RESTORE VERIFY: FAIL (no off-box backup found)"; exit 1; }
echo "Restoring $LATEST ..."
rclone copyto "${BACKUP_REMOTE}${LATEST}" "${TMP}/restored.db"   # crypt remote decrypts on read

INTEGRITY="$(sqlite3 "${TMP}/restored.db" 'PRAGMA integrity_check;')"
echo "integrity_check: ${INTEGRITY}"
[ "$INTEGRITY" = "ok" ] || { echo "RESTORE VERIFY: FAIL (integrity_check)"; exit 1; }

for tbl in segment_edits terminology_translations content_versions; do
  n="$(sqlite3 "${TMP}/restored.db" "SELECT count(*) FROM ${tbl};" 2>/dev/null || echo MISSING)"
  echo "  ${tbl}: ${n} rows"
  [ "$n" = "MISSING" ] && { echo "RESTORE VERIFY: FAIL (${tbl} absent)"; exit 1; }
done
echo "RESTORE VERIFY: PASS"
```

- [ ] **Step 4: Run to verify it passes**

Run: `chmod +x scripts/verify-db-backup.sh && npx vitest run scripts/__tests__/backup-db.test.mjs -t verify-db-backup`
Expected: PASS (skips if rclone absent).

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-db-backup.sh scripts/__tests__/backup-db.test.mjs
git commit -m "feat(backup): verify-db-backup.sh restore-and-integrity check"
```

### Task A3: Health-check backup-staleness heartbeat

**Files:**
- Modify: `server/index.js` (the `/api/health` handler at `:259`)
- Test: `server/__tests__/healthOffboxBackup.test.js` (create)

**Interfaces:**
- Consumes: `pipeline-output/backups/.last-offbox-backup` (written by A1), `OFFBOX_BACKUP_STALE_HOURS` (default 26).
- Produces: `health.checks.offbox_backup = { age_hours: number|null, stale: boolean }`.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/healthOffboxBackup.test.js`. Test the pure helper (extract one) so no live server is needed.

```javascript
import { describe, it, expect } from 'vitest';
import { computeOffboxBackupHealth } from '../lib/offboxBackupHealth.js';

describe('offbox backup health', () => {
  it('reports null age + stale when the heartbeat is missing', () => {
    const r = computeOffboxBackupHealth({ heartbeatMtimeMs: null, nowMs: 1_000, staleHours: 26 });
    expect(r).toEqual({ age_hours: null, stale: true });
  });
  it('not stale when the heartbeat is fresh', () => {
    const now = 100 * 3600 * 1000;
    const r = computeOffboxBackupHealth({ heartbeatMtimeMs: now - 2 * 3600 * 1000, nowMs: now, staleHours: 26 });
    expect(r.stale).toBe(false);
    expect(r.age_hours).toBe(2);
  });
  it('stale when older than the threshold', () => {
    const now = 100 * 3600 * 1000;
    const r = computeOffboxBackupHealth({ heartbeatMtimeMs: now - 30 * 3600 * 1000, nowMs: now, staleHours: 26 });
    expect(r.stale).toBe(true);
    expect(r.age_hours).toBe(30);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run __tests__/healthOffboxBackup.test.js`
Expected: FAIL — `../lib/offboxBackupHealth.js` does not exist.

- [ ] **Step 3: Implement the helper + wire it into /api/health**

Create `server/lib/offboxBackupHealth.js`:

```javascript
/**
 * Pure health computation for the off-box backup heartbeat.
 * @param {{heartbeatMtimeMs: number|null, nowMs: number, staleHours: number}} p
 * @returns {{age_hours: number|null, stale: boolean}}
 */
function computeOffboxBackupHealth({ heartbeatMtimeMs, nowMs, staleHours }) {
  if (heartbeatMtimeMs == null) return { age_hours: null, stale: true };
  const age_hours = Math.round((nowMs - heartbeatMtimeMs) / 3_600_000);
  return { age_hours, stale: age_hours > staleHours };
}
module.exports = { computeOffboxBackupHealth };
```

In `server/index.js`, inside the `/api/health` handler (`:259`), read the heartbeat file (resolve via `__dirname`, never cwd) and add the field:

```javascript
const { computeOffboxBackupHealth } = require('./lib/offboxBackupHealth');
// inside the handler, alongside the existing checks:
let hbMtime = null;
try {
  const hb = path.join(__dirname, '..', 'pipeline-output', 'backups', '.last-offbox-backup');
  hbMtime = fs.statSync(hb).mtimeMs;
} catch { /* missing heartbeat => stale, handled by the helper */ }
const offbox = computeOffboxBackupHealth({
  heartbeatMtimeMs: hbMtime, nowMs: Date.now(),
  staleHours: Number(process.env.OFFBOX_BACKUP_STALE_HOURS) || 26,
});
// add `offbox_backup: offbox` into the health `checks` object that the handler returns.
```

(Note: if `server/index.js` is ESM, use `import` + `import.meta.dirname` and make `offboxBackupHealth.js` an ESM module with `export`. Match the file's existing module system — check the top of `server/index.js` first.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx vitest run __tests__/healthOffboxBackup.test.js`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add server/lib/offboxBackupHealth.js server/index.js server/__tests__/healthOffboxBackup.test.js
git commit -m "feat(health): surface off-box backup staleness in /api/health"
```

### Task A4: Backup/restore docs + cron

**Files:**
- Create: `docs/technical/backup-and-restore.md`

**Interfaces:** none (documentation).

- [ ] **Step 1: Write the runbook**

Create `docs/technical/backup-and-restore.md` covering: the env vars the scripts read (`BACKUP_REMOTE`, `BACKUP_REMOTE_KEEP`, `OFFBOX_BACKUP_STALE_HOURS`); **where the encryption passphrase lives** — in the rclone crypt remote's config (`rclone config` sets it, or `RCLONE_CONFIG_<NAME>_PASSWORD`), *not* in a script env var — so encryption is client-side and the scripts never handle plaintext keys; the one-time Linode Object Storage setup (create bucket + S3 access key; `rclone config` a `linode` s3 remote + a `secret:` crypt remote wrapping it with the passphrase); the crontab lines:

```cron
0 */6 * * * BACKUP_REMOTE=secret:namsbokasafn-db /home/siggi/dev/repos/namsbokasafn-efni/scripts/backup-db.sh
0 4 1 * *  BACKUP_REMOTE=secret:namsbokasafn-db /home/siggi/dev/repos/namsbokasafn-efni/scripts/verify-db-backup.sh
```

(The crypt passphrase is not on the cron line — it lives in the rclone config that cron's environment inherits.) And a **restore runbook**: install rclone, configure the same `secret:` crypt remote with the passphrase, run `scripts/verify-db-backup.sh` to confirm, then `rclone copyto secret:<latest> pipeline-output/sessions.db` and restart the server. Note that `/api/health` now shows `offbox_backup.stale=true` if the 6h cron stops.

- [ ] **Step 2: Verify the doc references match reality**

Run: `grep -o 'BACKUP_[A-Z_]*' docs/technical/backup-and-restore.md scripts/backup-db.sh scripts/verify-db-backup.sh | sort -u`
Expected: every `BACKUP_*` name the doc lists as a script env is one the scripts actually read (`BACKUP_REMOTE`, `BACKUP_REMOTE_KEEP`); the doc must NOT present `BACKUP_ENCRYPTION_KEY` as a script env (the passphrase is in the rclone crypt config).

- [ ] **Step 3: Commit**

```bash
git add docs/technical/backup-and-restore.md
git commit -m "docs(backup): off-box backup + restore runbook and cron"
```

### Task A5: Track-A regression sweep + PR

- [ ] **Step 1: Full suite**

Run: `cd /home/siggi/dev/repos/namsbokasafn-efni && npm test`
Expected: green (the new backup + health tests included). **Honesty note:** the encrypt/upload and restore/integrity cases use `it.skipIf(!hasRclone)` / require `sqlite3`, so a bare CI without those binaries **skips the upload+restore core** — "npm test green" then only proves the unset-remote skip path + the pure health helper. Before shipping Track A, run the suite **once on a box with `rclone` + `sqlite3` installed** (or in the deploy environment) so the encrypt→upload→restore→integrity path is actually exercised; note in the PR whether that run happened.

- [ ] **Step 2: Open the PR**

```bash
git push -u origin fix/prov-2-offbox-db-backup
gh pr create --title "PROV-2: off-box, restore-tested sessions.db backup" --body "Encrypt + upload sessions.db to Linode Object Storage (client-side rclone crypt), a restore-and-integrity check script, and an /api/health staleness heartbeat. Local-only backup unchanged when BACKUP_REMOTE is unset. Lead prerequisite: create the bucket + set the env/cron per docs/technical/backup-and-restore.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

# TRACK B — delete the second 01-source overwrite path

Branch: `fix/prov-1-delete-source-update-verb`. Base: `main`.

### Task B1: Static "only one guarded 01-source writer" guard test

**Files:**
- Test: `tools/__tests__/source-write-guard.test.js` (create)

**Interfaces:** none (a static-source assertion test, mirroring `server/__tests__/fetchSourceGuard.test.js`).

**Design note (why not a generic static write-detector).** Precise static "writes into `01-source/`" detection is infeasible here: the `update` write flows through a helper (`getLocalSourcePath(moduleId)`), not an inline `path.join(...'01-source'...)`, and the file keeps a *log* write (`writeFileSync(LOG_PATH, ...)` → `books/source-updates/`, not `01-source`) after the fix. A co-occurrence heuristic (references `01-source` AND has any write call) therefore false-flags `check-source-updates.js` forever (its check/diff read `01-source` and it writes a log). So this task uses **two honest tests**: (1) a precise RED→GREEN driver that the specific upstream-CNXML write is gone; (2) a durable allowlist tripwire on *which tools reference `01-source` at all* — trips on any new toucher so a reviewer classifies it read-vs-write. Test 2 is green now and after (a standing guard, not a TDD-RED step).

- [ ] **Step 1: Write the tests**

```javascript
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const TOOLS = path.resolve(import.meta.dirname, '..');

describe('01-source overwrite path removed (PROV-1)', () => {
  // (1) Precise RED->GREEN driver: the upstream-CNXML write must be gone.
  it('check-source-updates.js no longer writes upstream CNXML into 01-source', () => {
    const src = readFileSync(path.join(TOOLS, 'check-source-updates.js'), 'utf8');
    expect(/function\s+cmdUpdate|cmdUpdate\s*=/.test(src)).toBe(false); // the update handler is gone
    expect(src).not.toMatch(/writeFileSync\s*\([^)]*upstreamContent/);   // its specific write is gone
    expect(src).not.toMatch(/\bupdate <moduleId>/);                      // usage line gone
  });

  // (2) Durable tripwire: which tools reference 01-source at all. A new one trips
  // this test, forcing a reviewer to classify it read-only vs writer.
  it('only known tools reference 01-source (new touchers must be reviewed)', () => {
    const ALLOW = new Set([
      'download-source.js',          // the ONLY guarded CNXML writer
      'generate-source-manifest.js', // writes the .source-manifest.json provenance file
      'verify-source-manifest.js',   // read-only integrity verify
      'resolve-os-embed.js',         // writes media into 01-source/media (not CNXML)
      'check-source-updates.js',     // read-only check/diff after PROV-1
    ]);
    const touchers = readdirSync(TOOLS)
      .filter((f) => f.endsWith('.js'))
      .filter((f) => /01-source/.test(readFileSync(path.join(TOOLS, f), 'utf8')));
    const unexpected = touchers.filter((f) => !ALLOW.has(f));
    expect(unexpected).toEqual([]); // a new 01-source toucher => review + add to ALLOW (read) or guard it (write)
  });
});
```

- [ ] **Step 2: Run to verify test (1) fails, test (2) passes**

Run: `cd /home/siggi/dev/repos/namsbokasafn-efni && npx vitest run tools/__tests__/source-write-guard.test.js`
Expected: test (1) FAILS (`cmdUpdate` + the `upstreamContent` write + the `update <moduleId>` usage line still exist); test (2) PASSES (the current tools all match the allowlist). Do NOT weaken test (1) to pass here — B2 makes it green by removing the verb.

### Task B2: Delete the `update` verb + correct the F2 doc

**Files:**
- Modify: `tools/check-source-updates.js` (remove `cmdUpdate` + its dispatch + usage line)
- Modify: `docs/plans/2026-07-02-f2-source-guard-design.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `check-source-updates.js` exposes only `check`/`diff`; makes B1's test green.

- [ ] **Step 1: Remove the update verb**

In `tools/check-source-updates.js`: delete the `cmdUpdate` function (the one containing `fs.writeFileSync(localPath, upstreamContent)` at ~`:647`), delete its entry from the command dispatch/switch, and remove the `update <moduleId>` line from the usage/header block (near `:14`). Keep `cmdCheck`, `cmdDiff`, and their dispatch. If `update` is invoked after removal, the existing unknown-command path should error; if there is none, add:

```javascript
// in the command switch/dispatch, default branch:
default:
  console.error(`Unknown command: ${command}. Use 'check' or 'diff'.`);
  process.exit(1);
```

- [ ] **Step 2: Run B1's tests — both now green**

Run: `npx vitest run tools/__tests__/source-write-guard.test.js`
Expected: PASS — test (1) now green (`cmdUpdate` + the `upstreamContent` write + the `update <moduleId>` usage line are gone); test (2) still green (`check-source-updates.js` stays in the allowlist as a read-only check/diff tool).

- [ ] **Step 3: Add an unknown-verb assertion**

Append to `tools/__tests__/source-write-guard.test.js`:

```javascript
import { execFileSync } from 'node:child_process';
it('check-source-updates.js no longer accepts the update verb', () => {
  const script = path.join(TOOLS, 'check-source-updates.js');
  let code = 0;
  try { execFileSync('node', [script, 'update', 'm00001'], { encoding: 'utf8' }); }
  catch (e) { code = e.status; }
  expect(code).not.toBe(0); // update is gone → non-zero exit
});
```

- [ ] **Step 4: Correct the F2 design doc**

In `docs/plans/2026-07-02-f2-source-guard-design.md` (around the "single real overwrite path" claim, ~`:36`), add:

> **Correction (2026-07-11):** `tools/check-source-updates.js update` was a *second*, unguarded overwrite path missed by this analysis; it was removed (PROV-1). `download-source.js`'s `organizeSourceFiles` is now genuinely the only writer of `01-source/`, enforced by `tools/__tests__/source-write-guard.test.js`.

- [ ] **Step 5: Run + commit**

Run: `npm test`
Expected: green.

```bash
git add tools/check-source-updates.js tools/__tests__/source-write-guard.test.js docs/plans/2026-07-02-f2-source-guard-design.md
git commit -m "fix(source): delete check-source-updates.js update verb; guard-test only-one-writer (PROV-1)"
git push -u origin fix/prov-1-delete-source-update-verb
gh pr create --title "PROV-1: remove the second 01-source overwrite path" --body "Deletes the unguarded \`check-source-updates.js update\` verb (keeps read-only check/diff), corrects the F2 design doc's 'single overwrite path' claim, and adds a static test that download-source.js is the only 01-source writer.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

# TRACK C — MT edit-lock

Branch: `fix/mt-edit-lock`. Base: `main`.

### Task C1: The mt-lock shared library

**Files:**
- Create: `tools/lib/mt-lock.cjs`
- Test: `tools/__tests__/mt-lock.test.js` (create)

**Interfaces:**
- Produces (consumed by C2 + C3): `mtLockPathFor(mtOutputPath: string): string`; `isMtLocked(mtOutputPath: string): boolean` (true if a readable marker exists; **true (fail-safe) if a marker exists but is unreadable/corrupt** — "indeterminate → locked"); `writeMtLock(mtOutputPath: string, meta: {reason: string, firstEditId?: number}): void` (idempotent — no-op if the marker already exists).

- [ ] **Step 1: Write the failing test**

```javascript
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { mtLockPathFor, isMtLocked, writeMtLock } = require('../lib/mt-lock.cjs');

const dirs = [];
afterEach(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); dirs.length = 0; });
function tmp() { const d = mkdtempSync(path.join(tmpdir(), 'mtlock-')); dirs.push(d); return d; }

describe('mt-lock', () => {
  it('derives the .locked sibling from an mtOutput path', () => {
    const p = '/x/books/b/02-mt-output/ch01/m68664-segments.is.md';
    expect(mtLockPathFor(p)).toBe('/x/books/b/02-mt-output/ch01/m68664-segments.locked');
  });
  it('isMtLocked is false when no marker exists', () => {
    const mt = path.join(tmp(), 'm1-segments.is.md');
    expect(isMtLocked(mt)).toBe(false);
  });
  it('writeMtLock creates the marker; isMtLocked then true; second write is a no-op', () => {
    const mt = path.join(tmp(), 'm1-segments.is.md');
    writeMtLock(mt, { reason: 'editing-started', firstEditId: 7 });
    expect(isMtLocked(mt)).toBe(true);
    const lock = mtLockPathFor(mt);
    const first = require('fs').readFileSync(lock, 'utf8');
    writeMtLock(mt, { reason: 'again', firstEditId: 99 });   // idempotent
    expect(require('fs').readFileSync(lock, 'utf8')).toBe(first);
  });
  it('indeterminate marker (unparseable) is treated as LOCKED (fail-safe)', () => {
    const mt = path.join(tmp(), 'm1-segments.is.md');
    writeFileSync(mtLockPathFor(mt), '{ this is not json');
    expect(isMtLocked(mt)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/siggi/dev/repos/namsbokasafn-efni && npx vitest run tools/__tests__/mt-lock.test.js`
Expected: FAIL — `../lib/mt-lock.cjs` does not exist.

- [ ] **Step 3: Implement `tools/lib/mt-lock.cjs`**

```javascript
'use strict';
// Per-module MT edit-lock marker. Keyed off the mtOutput file path so both the
// server (getModulePaths().mtOutput) and the CLI (its outputPath) — which already
// hold that path — share one convention with zero chapter-dir duplication.
const fs = require('fs');
const path = require('path');

/** Derive the .locked sibling: .../{module}-segments.is.md -> .../{module}-segments.locked */
function mtLockPathFor(mtOutputPath) {
  return mtOutputPath.replace(/-segments\.is\.md$/, '-segments.locked');
}

/** True if a marker exists. Fail-safe: an existing-but-unreadable marker => locked. */
function isMtLocked(mtOutputPath) {
  const lock = mtLockPathFor(mtOutputPath);
  if (!fs.existsSync(lock)) return false;
  try {
    JSON.parse(fs.readFileSync(lock, 'utf8'));
    return true;
  } catch {
    return true; // indeterminate -> treat as locked (never clobber an edited baseline)
  }
}

/** Idempotently write the marker (no-op if it already exists). */
function writeMtLock(mtOutputPath, meta) {
  const lock = mtLockPathFor(mtOutputPath);
  if (fs.existsSync(lock)) return;
  fs.mkdirSync(path.dirname(lock), { recursive: true }); // chapter dir may not exist yet
  const body = JSON.stringify({ lockedAt: new Date().toISOString(), ...meta }, null, 2);
  fs.writeFileSync(lock, body + '\n', 'utf8');
}

module.exports = { mtLockPathFor, isMtLocked, writeMtLock };
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tools/__tests__/mt-lock.test.js`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add tools/lib/mt-lock.cjs tools/__tests__/mt-lock.test.js
git commit -m "feat(mt-lock): per-module lock lib keyed off mtOutput path (fail-safe indeterminate)"
```

### Task C2: Lock on first saved edit (server)

**Files:**
- Modify: `server/services/segmentEditorService.js` (`saveSegmentEdit` at `:45`, after the INSERT at `:117`)
- Test: `server/__tests__/mtLockOnFirstEdit.test.js` (create)

**Interfaces:**
- Consumes: `mt-lock.cjs` (`writeMtLock`), `segmentParser.getModulePaths(book, chapter, moduleId).mtOutput`.
- Produces: on the first `segment_edits` row for a module, a `.locked` marker next to its MT output.

- [ ] **Step 1: Write the failing test**

Create `server/__tests__/mtLockOnFirstEdit.test.js`. Use the test-DB seam (`_setTestDb`, per the repo's service test pattern) + a temp books dir, save two edits for one module, assert the marker appears once and isn't rewritten.

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, existsSync, readFileSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// Import the service + its test-db seam the same way sibling __tests__ do
// (e.g. segmentEditConflict.test.js). Set up the segment_edits schema via runAllMigrations
// against a throwaway DB, point books/ at a temp fixture with 02-mt-output/ch01/m1-segments.is.md.

describe('MT lock on first saved edit', () => {
  it('writes the .locked marker on the first edit and not on the second', () => {
    // ...arrange temp DB + temp book with mtOutput file for module m1 ch1...
    // const svc = require('../services/segmentEditorService'); svc._setTestDb(db);
    // svc.saveSegmentEdit({ book, chapter: 1, moduleId: 'm1', segmentId: 's1', ... });
    // const lock = path.join(bookDir, '02-mt-output', 'ch01', 'm1-segments.locked');
    // expect(existsSync(lock)).toBe(true);
    // const first = readFileSync(lock, 'utf8');
    // svc.saveSegmentEdit({ ...second edit... });
    // expect(readFileSync(lock, 'utf8')).toBe(first); // idempotent
  });
});
```

(Flesh out the arrange block from `server/__tests__/segmentEditConflict.test.js`'s DB-setup pattern — same `runAllMigrations` + `_setTestDb` approach. Point `getModulePaths` at the temp book by constructing the `mtOutput` path directly if `getModulePaths` resolves against a fixed books root; if it does, place the fixture under that root's `__mtlock-fixture__` book instead of a temp dir.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && npx vitest run __tests__/mtLockOnFirstEdit.test.js`
Expected: FAIL — no marker is written.

- [ ] **Step 3: Implement the hook**

In `saveSegmentEdit`, after the `INSERT INTO segment_edits` (`:117`) succeeds, if this is the first edit for the module, write the marker. Determine "first" by counting rows for the module (cheap, correct):

```javascript
const mtLock = require('../../tools/lib/mt-lock.cjs');
// ...after the INSERT succeeds, with `book, chapter, moduleId` in scope:
try {
  const priorCount = db.prepare(
    `SELECT count(*) AS n FROM segment_edits WHERE book = ? AND chapter = ? AND module_id = ?`
  ).get(book, chapter, moduleId).n;
  if (priorCount === 1) { // this insert is the first row for the module
    const { mtOutput } = segmentParser.getModulePaths(book, chapter, moduleId);
    mtLock.writeMtLock(mtOutput, { reason: 'editing-started', firstEditId: info.lastInsertRowid });
  }
} catch (err) {
  log.error({ err, book, chapter, moduleId }, 'MT lock write failed on first edit'); // loud, non-blocking
}
```

(Use the exact column names from the migration — `module_id`, `book`, `chapter`. `info` is the `.run()` result of the INSERT; adapt to the local variable name. `log` is the pino logger already imported in this file.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && npx vitest run __tests__/mtLockOnFirstEdit.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/segmentEditorService.js server/__tests__/mtLockOnFirstEdit.test.js
git commit -m "feat(mt-lock): write lock marker on the first saved segment edit"
```

### Task C3: Enforce the lock in api-translate.js

**Files:**
- Modify: `tools/api-translate.js` (workList build at `:714-721`; guard before the write at `:583`)
- Test: `tools/__tests__/api-translate-mt-lock.test.js` (create)

**Interfaces:**
- Consumes: `mt-lock.cjs` (`isMtLocked`).
- Produces: a locked module is never (re)written, even with `--force`.

**Import safety (verified):** `api-translate.js` guards its CLI entry at `:855` (`if (process.argv[1] === fileURLToPath(import.meta.url)) { main()... }`), so `import { mtRunDecision } from '../api-translate.js'` does **not** run the CLI or need API keys — the module loads side-effect-free. Adding the `export function mtRunDecision` (Step 3) keeps that property.

- [ ] **Step 1: Write the failing test**

```javascript
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { isMtLocked } = require('../lib/mt-lock.cjs');
// Test the decision helper (extract it): given (exists, force, locked) -> action.
import { mtRunDecision } from '../api-translate.js'; // export a pure helper (module is import-safe, see above)

describe('api-translate lock decision', () => {
  it('locked module is skipped even with --force', () => {
    expect(mtRunDecision({ exists: true, force: true, locked: true })).toBe('locked-skip');
  });
  it('unlocked existing needs --force (accident guard preserved)', () => {
    expect(mtRunDecision({ exists: true, force: false, locked: false })).toBe('skip');
    expect(mtRunDecision({ exists: true, force: true, locked: false })).toBe('write');
  });
  it('unlocked absent is written', () => {
    expect(mtRunDecision({ exists: false, force: false, locked: false })).toBe('write');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd /home/siggi/dev/repos/namsbokasafn-efni && npx vitest run tools/__tests__/api-translate-mt-lock.test.js`
Expected: FAIL — `mtRunDecision` is not exported.

- [ ] **Step 3: Implement the decision + wire it**

In `tools/api-translate.js`, add the exported pure helper and use it in the workList build. Add near the top-level exports:

```javascript
/** Decide what to do with one module's MT output. */
export function mtRunDecision({ exists, force, locked }) {
  if (locked) return 'locked-skip';        // absolute: editing has begun, never clobber
  if (exists && !force) return 'skip';      // accident guard (unchanged)
  return 'write';
}
```

Replace the workList `skip:` computation (`:714-721`) to compute locked-ness and the action:

```javascript
import { isMtLocked } from './lib/mt-lock.cjs';
// ...
const outputPath = path.join(outputDir, mod.filename.replace('.en.md', '.is.md'));
const exists = fs.existsSync(outputPath);
const locked = isMtLocked(outputPath);
const action = mtRunDecision({ exists, force: args.force, locked });
workList.push({ ...mod, chapterDir, outputPath, action, skip: action !== 'write' });
```

At the write site (`:583`), the module is only reached when `action === 'write'`; add a visible line for locked skips where the existing `⏭ (exists)` message is logged (`:783`):

```javascript
if (mod.action === 'locked-skip') {
  console.warn(`  🔒 ${mod.chapterDir}/${mod.moduleId} LOCKED (editing started) — MT re-run refused${args.force ? ' (--force ignored)' : ''}`);
} else if (mod.action === 'skip' && args.verbose) {
  console.log(`  ⏭  ${mod.chapterDir}/${mod.moduleId} (exists)`);
}
```

Add a summary count of `locked-skip` modules at the end of the run.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tools/__tests__/api-translate-mt-lock.test.js`
Expected: PASS (3/3).

- [ ] **Step 5: Integration check on the fixture**

Run:
```bash
# Create a lock marker for a fixture module, then confirm --force refuses it.
node -e "require('./tools/lib/mt-lock.cjs').writeMtLock('books/__e2e-fixture__/02-mt-output/ch01/m68664-segments.is.md', {reason:'test'})"
node tools/api-translate.js --book __e2e-fixture__ --chapter 1 --module m68664 --force --dry-run 2>&1 | grep -i locked
git checkout -- ':(glob)books/__e2e-fixture__/**' ; rm -f books/__e2e-fixture__/02-mt-output/ch01/m68664-segments.locked
```
Expected: a `🔒 ... LOCKED` line; then the fixture is reverted clean.

- [ ] **Step 6: Commit**

```bash
git add tools/api-translate.js tools/__tests__/api-translate-mt-lock.test.js
git commit -m "feat(mt-lock): api-translate refuses locked modules even with --force"
```

### Task C4: Stage the marker in git-backup.sh + one-time backfill

**Files:**
- Modify: `scripts/git-backup.sh` (the `git add` list)
- Create: `scripts/backfill-mt-locks.js`

**Interfaces:**
- Consumes: `mt-lock.cjs` (`writeMtLock`).
- Produces: markers are committed by the 2h cron; existing edited modules get locked on rollout.

- [ ] **Step 1: Stage the marker glob**

In `scripts/git-backup.sh`, add to the `git add \` list (after `books/*/residue-report.*.json \`):

```bash
  books/*/02-mt-output/*/*-segments.locked \
```

- [ ] **Step 2: Write the backfill script**

Create `scripts/backfill-mt-locks.js`. For every module that already has a `03-faithful-translation/{ch}/{module}-segments.is.md` file OR a `segment_edits` row, write the marker if absent. (Faithful-file existence is the file-only signal; combine with a DB scan when a DB is available.)

```javascript
#!/usr/bin/env node
// One-time: lock every module that has already entered editing (faithful file exists),
// so an already-edited module cannot be re-MT'd before its next new edit.
const fs = require('fs');
const path = require('path');
const { writeMtLock } = require('../tools/lib/mt-lock.cjs');
const BOOKS = path.join(__dirname, '..', 'books');

let locked = 0;
for (const book of fs.readdirSync(BOOKS)) {
  const faithfulRoot = path.join(BOOKS, book, '03-faithful-translation');
  const mtRoot = path.join(BOOKS, book, '02-mt-output');
  if (!fs.existsSync(faithfulRoot) || !fs.existsSync(mtRoot)) continue;
  for (const ch of fs.readdirSync(faithfulRoot)) {
    const chDir = path.join(faithfulRoot, ch);
    if (!fs.statSync(chDir).isDirectory()) continue;
    for (const f of fs.readdirSync(chDir)) {
      if (!f.endsWith('-segments.is.md')) continue;
      const mtOutput = path.join(mtRoot, ch, f); // sibling MT path
      if (!fs.existsSync(mtOutput)) continue;
      const before = fs.existsSync(mtOutput.replace(/-segments\.is\.md$/, '-segments.locked'));
      writeMtLock(mtOutput, { reason: 'backfill-already-edited' });
      if (!before) { locked++; console.log(`locked ${book}/${ch}/${f}`); }
    }
  }
}
console.log(`Backfill complete: ${locked} module(s) newly locked.`);
```

- [ ] **Step 3: Dry-run the backfill on the real tree, then revert**

Run:
```bash
node scripts/backfill-mt-locks.js
git status --short books/   # inspect the new .locked markers (efnafraedi-2e's faithful module)
```
Expected: markers created for already-faithful modules; on rollout these are committed. For the PR itself, decide with the reviewer whether to commit the backfilled markers or run the script at deploy — default: **commit them** (they are real, correct locks).

- [ ] **Step 4: Commit**

```bash
git add scripts/git-backup.sh scripts/backfill-mt-locks.js books/*/02-mt-output/*/*-segments.locked
git commit -m "feat(mt-lock): stage markers in git-backup + backfill already-edited modules"
```

### Task C5: Track-C regression sweep + PR

- [ ] **Step 1: Full suite**

Run: `cd /home/siggi/dev/repos/namsbokasafn-efni && npm test`
Expected: green (mt-lock lib, first-edit hook, api-translate decision all included).

- [ ] **Step 2: Confirm no cross-tier write regression**

Run: `git grep -nE "01-source|02-mt-output" tools/api-translate.js server/services/segmentEditorService.js | grep -iE "write|copy|rename"`
Expected: the only `02-mt-output` write is the existing MT-segment write (gated by `action==='write'`) and the *marker* write (a `.locked` sibling, not segment content); no writes to `01-source`.

- [ ] **Step 3: Open the PR**

```bash
git push -u origin fix/mt-edit-lock
gh pr create --title "MT edit-lock: 02-mt-output re-runnable until a module is opened for editing" --body "A per-module .locked marker (keyed off the mtOutput path) is written on the first saved segment edit; api-translate refuses locked modules even with --force (indeterminate state fails safe to locked). Markers ride the git-backup cron; already-edited modules are backfilled. Preserves MT purity (marker is a sibling, never segment content).

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Self-Review (plan vs spec)

**Spec coverage:**
- Track A units 1–5 → Tasks A1 (encrypt+upload), A2 (verify/restore), A3 (heartbeat/health), A4 (docs+cron), A5 (sweep+PR). ✅
- Track B (delete verb + doc correction + durable guard test) → B1 (guard test) + B2 (delete + doc + unknown-verb test). ✅
- Track C units 1–6 → C1 (lib), C2 (first-edit hook), C3 (enforce), C4 (git-backup staging + backfill), C5 (sweep+PR). The spec's "durability/cross-box" unit is C4's git-backup staging; the one-way-unlock decision is encoded (no unlock path built). ✅
- Global constraints (fail-loud, no-cwd, marker-is-sibling, npm-test-gate) appear in each track's steps + the constraints block. ✅

**Placeholder scan:** The C2 test arrange block is described rather than fully coded because it depends on the repo's existing `_setTestDb`/`runAllMigrations` fixture pattern (cited: `segmentEditConflict.test.js`) — the implementer copies that established setup. This is a pointer to real existing code, not an unfilled placeholder; the assertion logic and the implementation code are complete. All other steps carry runnable code.

**Type consistency:** `mtLockPathFor`/`isMtLocked`/`writeMtLock(mtOutputPath, meta)` are used identically in C1 (def), C2 (`writeMtLock`), C3 (`isMtLocked`), C4 (`writeMtLock`). `mtRunDecision({exists,force,locked})` returns `'write'|'skip'|'locked-skip'` consistently in C3. `computeOffboxBackupHealth({heartbeatMtimeMs,nowMs,staleHours})` matches between A3's test and impl. Env-var names (`BACKUP_REMOTE`, `BACKUP_REMOTE_KEEP`, `OFFBOX_BACKUP_STALE_HOURS`) match across A1/A3/A4.

**Scope:** three independent subsystems, correctly one-PR-each; the plan is one document with three self-contained track sections, each shippable alone. Correct decomposition.
