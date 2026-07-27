# C11(b)+(c) — Content-backup smoke detector, and collapsing the second deploy path

**Date:** 2026-07-27 · **Register item:** [C11](../../plans/2026-07-21-post-item17-followup-campaign.md) (b) and (c) · **Baseline:** main `66540a54` (PR #335 merged)

## 1. Problem

Reviewed translations reach GitHub by exactly one route: `scripts/git-backup.sh`, on a 2-hourly cron on the production server. That route has no failure signal.

**(b) A failed content push is invisible.** The script detects failure correctly — `set -euo pipefail` at `:26`, `write_status "error" "git push failed"` at `:123` — and writes the verdict to `pipeline-output/backup-status.json`, which is gitignored and **read by nothing**. `install-cron.sh` sets no `MAILTO`. Editors keep working, prod accumulates unpushed commits, nobody learns. The cron never fetches before pushing (`:114` commit → `:121` push), so non-fast-forward rejection is already a live silent failure mode, not a hypothetical one.

**(c) `deploy.yml:50` runs `git reset --hard origin/main` on the production server.** Combined with (b), a silently-rejected cron push leaves reviewed translations only on prod's disk, and the next deploy discards them.

**Sequencing:** (b) is the prerequisite for *any* control that could reject a push to `main` — adding one to a channel with no smoke detector is the worst available ordering. C12 (branch protection) waits on this.

## 2. Two register premises corrected before designing

Both were inherited from prose and are false against the live repo. Recorded here because the register must be corrected in the same pass.

**2.1 — `deploy.yml` has never run and cannot run.** The register says to fix it "ideally before the next `deploy.yml` run". There is no next run:

| Evidence | Command | Result |
|---|---|---|
| Zero runs, ever | `gh run list --workflow=deploy.yml` | `[]` |
| Zero repository secrets | `gh secret list` | empty |
| No `production` environment | `gh api repos/:owner/:repo/environments` | `github-pages`, `opidnamsefni.is` |
| Wrong systemd unit | `deploy.yml:57` vs `deploy.sh:107` | `namsbokasafn-efni` vs live `ritstjorn`, swallowed by `\|\| true` |
| Wrong default app dir | `deploy.yml:33` | `/opt/namsbokasafn-efni` vs prod's `/home/siggi/repos/…` |

`secrets.DEPLOY_HOST`/`DEPLOY_USER`/`DEPLOY_SSH_KEY` all resolve to empty strings, so `appleboy/ssh-action` fails at connection — line 50 is unreachable. The hazard is latent-on-a-dead-path, not live. Four independent signs of abandonment.

**2.2 — nothing polls `/api/health`.** The only consumers are `scripts/deploy.sh:112` (`curl -sf … > /dev/null`, body discarded) and the dead `deploy.yml`. No UI, no monitor, no alert. A health field alone therefore does not constitute a smoke detector; §6 addresses this with one change, not a monitoring stack.

## 3. Design principle: absence is the alarm

`backup-status.json` is written on *every* outcome, success and failure alike. If the cron stops entirely — crontab wiped, box rebooted without cron, script made non-executable — the last thing written was `success`, and that file reads healthy forever.

The off-box DB backup (Track A, PR #262) already solved this by inverting the signal: `backup-db.sh` writes `pipeline-output/backups/.last-offbox-backup` **only on success**, so *staleness or absence is the alarm*. Silence cannot fail to be reported.

This design copies that pattern for the content backup, as the register prescribes.

## 4. Unit 1 — Heartbeat producer (`scripts/git-backup.sh`)

Add `HEARTBEAT="${PROJECT_ROOT}/pipeline-output/.last-content-backup"` and a `write_heartbeat()` helper (`date -u +%Y-%m-%dT%H:%M:%SZ > "$HEARTBEAT"`), called on **exactly the two healthy terminal paths**:

| Script line | Outcome | Heartbeat | Rationale |
|---|---|---|---|
| `:110` | `no_changes`, nothing unpushed | **written** | The cron ran and was healthy; there was simply nothing to commit. A quiet weekend must not read as a dead cron. |
| `:110` | `no_changes`, backlog > 0 | **not written**, status `error` | ⚠️ **Amended during implementation — see below.** |
| `:129` | `success` | written | Committed and pushed. |
| `:103` | `git add` failed | not written | |
| `:117` | `git commit` failed | not written | |
| `:124` | `git push` failed | not written | The failure mode the item exists for. |

The `no_changes` case is the single most likely way to ship a false-alarm generator, and gets a dedicated test (§8).

> **⚠️ AMENDED 2026-07-27, during the branch review.** As first designed, this table made `no_changes` unconditionally healthy — **a false-clear that would have defeated the detector's primary purpose.** After a rejected push the local `auto-backup` commit remains, so the *next* cron run finds nothing new to commit, takes the `no_changes` path, and refreshes the heartbeat. Because content changes are far sparser than the 2-hourly cron, that quiet run is the *likely* next run, and it lands ~2 h after the failure — well before the 6 h staleness threshold could fire. The non-fast-forward case, which C11(b) names as *already* a live silent failure mode, would therefore essentially never have alarmed.
>
> The fix keeps both properties apart instead of conflating them: `no_changes` is healthy **only when `git rev-list --count origin/main..HEAD` is 0**. That check needs no network — a successful `git push` updates `refs/remotes/origin/main` — so it adds no failure mode of its own. An indeterminate count (no `origin/main` ref) is treated as **unhealthy**, on the same "absence is the alarm" logic the whole design rests on: a detector must not report healthy about something it cannot see. Pinned by two tests in `scripts/__tests__/git-backup.test.mjs`, the first mutation-checked.

`pipeline-output/` is gitignored (`.gitignore:51`), matching the off-box heartbeat's location.

### 4.1 Push-failure diagnosis (informational only)

On the `git push` failure path only, run `timeout 30 git fetch origin main` (read-only; updates the remote-tracking ref, touches no working tree) and record ahead/behind counts in both the log line and the status message:

```
ERROR: git push failed (local ahead 4, behind 2)
```

This distinguishes "GitHub unreachable" from "non-fast-forward, prod has diverged" — the failure mode the register flags as already live. The `timeout` guard exists because a dead network is a plausible cause of the push failure in the first place, and the cron must not hang.

If the fetch itself fails or times out (or `origin/main` does not resolve), the counts are **omitted** and the plain `git push failed` message is kept — the diagnostic must never convert a push failure into a different failure, nor change the exit code, which stays `1`.

**Gates nothing.** Pure diagnosis, in the log and status message.

### 4.2 `write_status` JSON escaping — considered and rejected

`:44-50` interpolates `$message` into a JSON heredoc unescaped, so a message containing `"` or `\` would emit unparseable JSON. The original design escaped it. **Dropped during planning**, for two reasons:

1. **No producer path can emit one.** Every `write_status` call site passes a fixed string or a hex commit hash — `Nothing to commit`, `Pushed a1b2c3d`, `git add failed for N pathspec(s)`, and §4.1's numeric ahead/behind. Raw git output never reaches the message. The defect is latent-only and has no reachable trigger, so no end-to-end test can exercise the fix.
2. **The consumer is the right place, and it is testable.** §6 already tolerates a missing or unparseable status file in its own try/catch, and §9 tests that directly with a deliberately malformed file. That protects the health endpoint regardless of what the producer emits — including from hand-edits and partial writes, which escaping would not catch anyway.

Adding untestable defensive code to satisfy an unreachable case contradicts the project's own lesson that pins must prove behaviour, not presence. Recorded here so it is not re-raised as an oversight.

### 4.3 Explicitly not done: rebase-before-push in the cron

`merge.ours.driver` is registered by `deploy.sh:63`, **not** by the cron. An unattended `git pull --rebase` on the perpetually-dirty `books/*/translation-errors.json` would therefore convert a *visible* push failure into a *wedged mid-rebase repository* on production. Strictly worse than the status quo. The heartbeat makes the rejection visible; that is the fix.

## 5. Unit 2 — Two small modules, not one

`server/index.js` calls `app.listen()` at module load (`:384`), so importing it in a unit test starts a real server. That is why the existing `offbox_backup` wiring is untested-by-design — and it is a reason to put as little as possible inside the handler.

So the work splits in two, and the untested-by-design surface shrinks from a whole block to a single call:

- **New** `server/lib/backupHeartbeatHealth.js` — `computeBackupHeartbeatHealth({heartbeatMtimeMs, nowMs, staleHours}) → {age_hours, stale}`. Pure arithmetic; missing heartbeat (`null`) → `{age_hours: null, stale: true}`. `server/lib/offboxBackupHealth.js` already contains this exact maths, so it keeps its `computeOffboxBackupHealth` export as a thin delegating wrapper: every existing import is unchanged and `healthOffboxBackup.test.js` stays green as a behaviour pin on the shared maths.
- **New** `server/lib/contentBackupHealth.js` — `readContentBackupHealth({projectRoot, nowMs, staleHours}) → {age_hours, stale, last_status, message, ok}`. Owns the two filesystem reads, each in its own try/catch, and calls the pure helper. Fully unit-testable against a temp directory, including the malformed-status-file case that §4.2 relies on.

## 6. Unit 3 — Wire into `GET /api/health`

In `server/index.js`, alongside the existing `checks.offbox_backup` block (`:293-313`), following its shape — one call, so nothing untestable accumulates in the handler:

```js
checks.content_backup = readContentBackupHealth({
  projectRoot: path.join(__dirname, '..'),
  nowMs: Date.now(),
  staleHours: Number(process.env.CONTENT_BACKUP_STALE_HOURS) || 6,
});
```

- `last_status` is the `status` field of `pipeline-output/backup-status.json` (`success` | `no_changes` | `error`), or `null` if that file is missing or unparseable; the file's `message` rides alongside it.
- `projectRoot` derived from `__dirname`, never `process.cwd()` (project durable rule — masked prod bugs #210/#213).
- Threshold `CONTENT_BACKUP_STALE_HOURS`, **default 6** — the cron is 2-hourly, so this is two missed cycles plus margin.
- `ok` gates the endpoint's `allOk` exactly as `offbox_backup` does, so a stale content backup flips overall status to `degraded`.
- `last_status` and `message` are read from `backup-status.json` in **their own try/catch**, best-effort, and **never gate `ok`**.

**Why the gate is heartbeat freshness alone**, and not `status === 'error'`: error paths do not write the heartbeat, so a persistent failure trips staleness within 6h regardless, while a transient one self-heals within one 2h cycle without alarming. Putting a hand-built JSON file on the critical path buys nothing and risks the endpoint.

**Known consequence:** dev and CI will now report `degraded`, because neither runs the content cron and so has no heartbeat. Pre-flight check confirmed no test asserts `status === 'ok'` (`grep -rn health e2e/ server/__tests__/` → no status assertions). This matches the `offbox_backup` precedent, which already makes dev `degraded` by design.

## 7. Unit 4 — Make the signal observable (`scripts/deploy.sh`)

Per §2.2, a health field nobody reads is not a smoke detector. **One** change, no new channel: the readiness loop at `:111-117` currently does `curl -sf … > /dev/null`. It keeps the body instead and, on success, prints the `status` plus the names of any not-ok checks.

Roughly six lines, on a script the lead already runs by hand for every deploy, and it retroactively surfaces the equally-invisible `offbox_backup` check. Deploy still succeeds on `degraded` — parity with today's behaviour.

**Deliberately not built** (logged to §C11 as candidates only): a scheduled watchdog Action reading the age of the newest `auto-backup:` commit; `MAILTO` plus an MTA on the box; an admin health widget.

## 8. Unit 5 — C11(c): collapse `deploy.yml` onto `deploy.sh`

Lead decision 2026-07-27. The inline SSH script is replaced by a call to the real deploy script:

```yaml
script: |
  set -euo pipefail
  APP_DIR="${{ secrets.DEPLOY_APP_DIR || '/home/siggi/repos/namsbokasafn-efni' }}"
  cd "$APP_DIR"
  ./scripts/deploy.sh
```

This removes `git reset --hard origin/main`, the `namsbokasafn-efni` unit-name drift, the `/opt/…` app-dir drift, and the duplicated DB-backup and health-gate logic in one edit. `deploy.sh` already backs up the DB first (`:45-48`), pins Node/ABI (`:26`, `:31-42`), stashes and re-applies local editorial changes (`:51-77`), and exits non-zero if health never comes up (`:118-120`) — so the workflow's step-5 gate collapses into it cleanly.

Hardening the reset in place was rejected: it would invest in a divergent second deploy path, and two deploy scripts that disagree on unit name, app directory and backup behaviour is itself the defect.

## 9. Testing

Extends the two existing harnesses; no new test infrastructure.

**`scripts/__tests__/git-backup.test.mjs`** (fixture project root + bare origin, per the existing helper):

1. **success** → `pipeline-output/.last-content-backup` exists and is fresh.
2. **`no_changes` with an empty unpushed backlog** → heartbeat still written. *(The false-alarm guard: a healthy cron with nothing to commit must not read as dead.)* **`no_changes` with a backlog > 0 → `error`, no heartbeat** (see the amendment in §3).
3. **push failure (unreachable remote)** → **pre-create the heartbeat with an old mtime, then assert it is unchanged.** Pre-creating is essential: without it the assertion passes trivially because the file never existed. Also covers §4.1's fallback — the diagnostic fetch fails too, so the counts are omitted and the exit code stays `1`.
4. **push failure (non-fast-forward)** → a second clone pushes to the bare origin first, so the status message and log carry `local ahead 1, behind 1`.
5. **syntax** → `bash -n` on both modified shell scripts, so a quoting mistake in `deploy.sh`'s new health-printing block fails the suite rather than the next deploy.

**`server/__tests__/backupHeartbeatHealth.test.js`** — pure-helper cases for `computeBackupHeartbeatHealth` (missing → `stale: true`, fresh → `stale: false`, older than threshold → `stale: true`), mirroring `healthOffboxBackup.test.js`. That existing test is left untouched and now also pins the delegating wrapper.

**`server/__tests__/contentBackupHealth.test.js`** — `readContentBackupHealth` against a temp directory: no heartbeat → `ok: false`; fresh heartbeat → `ok: true`; old heartbeat → `ok: false`; `last_status`/`message` surfaced from a valid status file; **malformed status file → `last_status: null` and `ok` still driven by the heartbeat, no throw**.

**`tools/__tests__/`** — static pin that `.github/workflows/deploy.yml` contains no `git reset --hard` and does delegate to `scripts/deploy.sh`.

**Mutation-check every pin**, naming which test goes red: making the push-failure path write the heartbeat must fail test 3; removing the `deploy.sh` delegation must fail the workflow pin. *(Project lesson: static pins prove presence, not behaviour.)*

Authoritative gate: `npm test` from the repo root.

## 10. Documentation

Fix the wrong document, never log it as a to-do in another (CLAUDE.md § *One source of truth*):

- **Register §C11** — mark (b) and (c) closed; correct the "*before the next `deploy.yml` run*" premise per §2.1; record the not-built observability candidates from §7.
- **CLAUDE.md § Content delivery** — both "read by nothing" and "Heartbeat pattern to copy: `server/index.js:300-313`" become false with this PR.
- **`scripts/install-cron.sh`** — comment the content heartbeat and its `/api/health` surface, mirroring the DB-backup comment at `:16-19`.
- **`docs/technical/backup-and-restore.md`** — a short section on the content-backup heartbeat alongside the DB one.

**Deliberately not edited:** `docs/plans/2026-07-12-git-backup-atomic-add-design.md:68`, which deferred this work once. It is a frozen design record and correctly states what was decided then; frozen docs are cited, not synced. The register carries live status.

## 11. Out of scope

- **C11(a)** — the `Sync Content to Vefur` deploy key. **[LEAD]**, deferred 2026-07-26; manual `sync-content.js` remains the route.
- Any change to *what* is backed up (the pathspec list is untouched) or to commit/push behaviour beyond §4.1's read-only diagnostic fetch.
- New alerting channels (§7).
- Branch protection (C12) — this item is its prerequisite, not its implementation.

## 12. Success criteria

- A push failure on production leaves the heartbeat stale, and `GET /api/health` reports `status: "degraded"` with `checks.content_backup.ok === false` within 6 hours.
- A healthy cron with nothing to commit — and nothing unpushed — keeps `content_backup.ok === true` indefinitely.
- `./scripts/deploy.sh` prints the names of any not-ok health checks.
- `git reset --hard origin/main` no longer appears in any deploy path, pinned by a mutation-checked test.
- `npm test` green from the repo root.
