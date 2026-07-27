# Backup & Restore — `sessions.db`

**What this protects.** `pipeline-output/sessions.db` holds the editorial work that lives **only** in the database: segment edits, the per-segment version history (`content_versions`), review/approval state, and the **entire terminology glossary**. It is gitignored — the 2-hourly `git-backup.sh` cron backs up rendered *content* under `books/`, but **not** the DB. If `sessions.db` is lost and there is no off-box copy, that human-verified intellectual work is gone. `sessions.db` also contains **PII** (editor emails / display names in `users`), so off-box copies are **client-side encrypted**.

There are two layers:
1. **Local** (`scripts/backup-db.sh`, always on): WAL-checkpoint → timestamped copy under `pipeline-output/backups/` → keep the most recent 30. Protects against accidental corruption/deletion, but **not** disk/instance loss.
2. **Off-box** (same script, when `BACKUP_REMOTE` is set): encrypt-and-upload each backup to Linode Object Storage via `rclone`. Protects against losing the box.

## Configuration (environment)

| Var | Read by | Default | Meaning |
|---|---|---|---|
| `BACKUP_REMOTE` | `backup-db.sh`, `verify-db-backup.sh` | *(unset → off-box skipped)* | An `rclone` **crypt** remote path, e.g. `secret:namsbokasafn-db`. **Must end in `:` or `/`** — the script fails loud (`exit 5`) otherwise, because a missing separator munges the object name and silently breaks retention. |
| `BACKUP_REMOTE_KEEP` | `backup-db.sh` | `30` | How many most-recent objects to keep off-box (older ones pruned). |
| `OFFBOX_BACKUP_STALE_HOURS` | the server (`/api/health`) | `26` | Age past which `/api/health` flags the off-box backup `stale` (one missed 6 h cycle + margin). |
| `CONTENT_BACKUP_STALE_HOURS` | the server (`/api/health`) | `6` | Age past which `/api/health` flags the **content** backup `stale` (two missed 2 h cycles + margin). |

**The encryption passphrase is NOT an environment variable.** Encryption is the `rclone` crypt remote's job (client-side — plaintext never leaves the box). The passphrase lives in the rclone config (`rclone config`, or `RCLONE_CONFIG_<NAME>_PASSWORD`). There is deliberately no `BACKUP_ENCRYPTION_KEY` the scripts read.

## One-time setup (Linode Object Storage)

1. In the Linode console, create an **Object Storage bucket** (e.g. `namsbokasafn-db`) and an **S3 access key** (access key + secret).
   **Pick a different region than the Linode hosting the server** (e.g. server in Frankfurt → bucket in Amsterdam/London): the off-box copy then also survives a datacenter-level event, at no extra cost — the backup object is a few MB every 6h, so cross-region transfer and latency are irrelevant. (Residual risk both share: the single Linode *account*; the crypt design makes adding a second remote at another provider a config-only change later.)
2. On the server, `rclone config`:
   - a plain **s3** remote (`linode`) pointing at the bucket's endpoint with the access key/secret;
   - a **crypt** remote (`secret`) that wraps it: `remote = linode:namsbokasafn-db`, with a strong passphrase (store the passphrase in your password manager — losing it makes the backups unrecoverable).
3. Set `BACKUP_REMOTE=secret:` (or `secret:subpath/`) in the cron environment.
4. Run one backup by hand to prime it: `BACKUP_REMOTE=secret: scripts/backup-db.sh`, then `BACKUP_REMOTE=secret: scripts/verify-db-backup.sh` to confirm it round-trips.

## Cron

`scripts/install-cron.sh` prints the recommended crontab. The backup line must carry `BACKUP_REMOTE` (else off-box upload is skipped and `/api/health` will — correctly — report the backup stale):

```cron
# DB backup: local + encrypted off-box, every 6 hours
30 */6 * * * BACKUP_REMOTE=secret:namsbokasafn-db <repo>/scripts/backup-db.sh
# Monthly restore-test: prove an off-box backup is actually recoverable
0 4 1 * *   BACKUP_REMOTE=secret:namsbokasafn-db <repo>/scripts/verify-db-backup.sh
```

The crypt passphrase is **not** on the cron line — it lives in the rclone config that cron's environment inherits.

## Deploy sequencing (expected "degraded")

`/api/health` reports `checks.offbox_backup = { age_hours, stale, ok }` and flips overall `status` to `"degraded"` when the backup is stale or absent. **Immediately after a fresh deploy this is expected** — there is no heartbeat until the first successful off-box upload. Run `BACKUP_REMOTE=secret: scripts/backup-db.sh` once (or wait for the first cron cycle) and `/api/health` returns to `"ok"`. (`"degraded"` does not block deploy: `scripts/deploy.sh` keys on HTTP 200, which `/api/health` always returns while the server is up. It **prints** the status and the names of any not-ok checks rather than gating on them.)

## The other cron: content backup (`git-backup.sh`)

This document is about `sessions.db`. The 2-hourly `scripts/git-backup.sh` cron protects a different asset — the reviewed content under `books/` — by committing and pushing it to `main`. It is the **only** route by which reviewed translations leave the production box.

It uses the same heartbeat inversion as the DB backup: `pipeline-output/.last-content-backup` is written **only on a healthy run**, and a run that found nothing to commit counts as healthy (a quiet weekend is a working cron). `/api/health` reports:

```json
"content_backup": { "age_hours": 2, "stale": false, "last_status": "success", "message": "Pushed a1b2c3d", "ok": true }
```

`last_status` and `message` come from `pipeline-output/backup-status.json` and are **detail only** — `ok` is driven by heartbeat freshness alone, so one transient failure self-heals within a cycle without alarming, while a persistent one goes stale.

**Nothing polls `/api/health`.** `./scripts/deploy.sh` prints the status and the names of any not-ok checks at the end of every deploy; that is the routine surface. To check on demand: `curl -s http://localhost:3000/api/health`.

⚠️ **The cron deliberately never fetches before pushing.** The `merge.ours.driver` for the perpetually-dirty `books/*/translation-errors.json` is registered by `deploy.sh`, not by cron, so an unattended `git pull --rebase` here would turn a visible push failure into a repository wedged mid-rebase on production. A rejected push instead fails loudly, logs `git push failed (local ahead N, behind M)`, and goes stale in `/api/health`; resolve it by hand on the box.

## Restore runbook

To recover `sessions.db` onto a fresh box:

1. Install `rclone` + `sqlite3`.
2. `rclone config` the same `secret:` crypt remote (same underlying bucket + **the same passphrase**).
3. Confirm the off-box backup is intact: `BACKUP_REMOTE=secret: scripts/verify-db-backup.sh` → expect `RESTORE VERIFY: PASS`.
4. Restore the latest into place: `rclone lsf secret: | grep '^sessions\.' | sort -r | head -1` to find it, then `rclone copyto "secret:<that-file>" pipeline-output/sessions.db` (the crypt remote decrypts on read).
5. Restart the server; `/api/health` should return `"ok"` once the next backup writes a fresh heartbeat.

`verify-db-backup.sh` fails loud on every bad outcome — no off-box backup found, download error, `PRAGMA integrity_check` non-ok (openable-but-corrupt *and* structurally corrupt), or a missing core table — each prints a grep-able `RESTORE VERIFY: FAIL (...)` line and exits non-zero. Wire its monthly run into monitoring so a silently-rotting backup is caught before you need it.
