# Backup & Restore — `sessions.db` and the research file

The research file (`research.db`) has its own job, its own remote and its own rules: see [The research file](#the-research-file-researchdb) below. Nothing described for `sessions.db` may copy it.

**What this protects.** `pipeline-output/sessions.db` holds the editorial work that lives **only** in the database: segment edits, the per-segment version history (`content_versions`), review/approval state, and the **entire terminology glossary**. It is gitignored — the 2-hourly `git-backup.sh` cron backs up rendered *content* under `books/`, but **not** the DB. If `sessions.db` is lost and there is no off-box copy, that human-verified intellectual work is gone. `sessions.db` also contains **PII** (editor emails / display names in `users`), so off-box copies are **client-side encrypted**.

There are two layers:
1. **Local** (`scripts/backup-db.sh`, always on): WAL-checkpoint → timestamped copy under `pipeline-output/backups/` → keep the most recent `MAX_BACKUPS` (set in `scripts/backup-db.sh`). Protects against accidental corruption/deletion, but **not** disk/instance loss.
2. **Off-box** (same script, when `BACKUP_REMOTE` is set): encrypt-and-upload each backup to Linode Object Storage via `rclone`. Protects against losing the box.

## Configuration (environment)

| Var | Read by | Default | Meaning |
|---|---|---|---|
| `BACKUP_REMOTE` | `backup-db.sh`, `verify-db-backup.sh` | *(unset → off-box skipped)* | An `rclone` **crypt** remote path, e.g. `secret:`. **Must end in `:` or `/`** — the script fails loud (`exit 5`) otherwise, because a missing separator munges the object name and silently breaks retention. Since the crypt remote already points at the bucket, `secret:` *is* the bucket root; a subpath form must still carry the trailing slash (`secret:sub/`). |
| `BACKUP_REMOTE_KEEP` | `backup-db.sh` | `BACKUP_REMOTE_KEEP`'s fallback in `scripts/backup-db.sh` | How many most-recent objects to keep off-box (older ones pruned). |
| `OFFBOX_BACKUP_STALE_HOURS` | the server (`/api/health`) | `DEFAULT_STALE_HOURS` in `server/lib/offboxBackupHealth.js` | Age past which `/api/health` flags the off-box backup `stale` (derived from the cron period: see the comment above `DEFAULT_STALE_HOURS`). |
| `CONTENT_BACKUP_STALE_HOURS` | the server (`/api/health`) | `DEFAULT_STALE_HOURS` in `server/lib/contentBackupHealth.js` | Age past which `/api/health` flags the **content** backup `stale` (derived from the cron period: see the comment above `DEFAULT_STALE_HOURS`). |

**The encryption passphrase is NOT an environment variable.** Encryption is the `rclone` crypt remote's job (client-side — plaintext never leaves the box). The passphrase lives in the rclone config (`rclone config`, or `RCLONE_CONFIG_<NAME>_PASSWORD`). There is deliberately no `BACKUP_ENCRYPTION_KEY` the scripts read.

🔴 **The passphrase must be escrowed in the password manager BEFORE the first upload — this is a gate, not a reminder.** rclone stores it in `rclone.conf` *obscured*, which is reversible, not encrypted. So the config on the box can decrypt the backups — and if the box is lost, the passphrase is lost with it, making every off-box copy permanently unrecoverable in exactly the disaster they exist for. An off-box backup you cannot decrypt is not a backup.

**Do not password-protect `rclone.conf` itself.** It would break unattended cron — and break it at 06:30 with nobody watching, since the interactive setup test would still pass. Protect it with file permissions (`chmod 600`) instead.

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
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# DB backup: local + encrypted off-box, every 6 hours
30 */6 * * * BACKUP_REMOTE=secret: <repo>/scripts/backup-db.sh
# Monthly restore-test: prove an off-box backup is actually recoverable
0 4 1 * *   BACKUP_REMOTE=secret: <repo>/scripts/verify-db-backup.sh
```

⚠️ **The `PATH=` line is load-bearing.** cron gives a user crontab `PATH=/usr/bin:/bin`, but rclone's official installer puts the binary in `/usr/local/bin`. Without the line, every cron run dies at `exit 3` ("rclone not installed") — while the same command run by hand succeeds, because a *login* shell does have `/usr/local/bin`. That asymmetry is what makes it dangerous: the setup test passes and the thing it tested never runs. There is no `MAILTO`, so the only signal is `/api/health` going stale.

⚠️ **`BACKUP_REMOTE` must end in `:` or `/`.** `secret:namsbokasafn-db` — the value this document and `install-cron.sh` both printed until 2026-08-04 — is rejected by `backup-db.sh` with `exit 5`. Pinned by `scripts/__tests__/backup-db.test.mjs`, which feeds `install-cron.sh`'s printed value to the real guard rather than re-checking the rule.

The crypt passphrase is **not** on the cron line — it lives in the rclone config that cron's environment inherits.

## Deploy sequencing (expected "degraded")

`/api/health` reports `checks.offbox_backup = { age_hours, stale, ok }` and flips overall `status` to `"degraded"` when the backup is stale or absent. **Immediately after a fresh deploy this is expected** — there is no heartbeat until the first successful off-box upload. Run `BACKUP_REMOTE=secret: scripts/backup-db.sh` once (or wait for the first cron cycle) and `/api/health` returns to `"ok"`. (`"degraded"` does not block deploy: `scripts/deploy.sh` keys on HTTP 200, which `/api/health` always returns while the server is up. It **prints** the status and the names of any not-ok checks rather than gating on them.)

## The other cron: content backup (`git-backup.sh`)

The sections above are about `sessions.db`. The 2-hourly `scripts/git-backup.sh` cron protects a different asset — the reviewed content under `books/` — by committing and pushing it to `main`. It is the **only** route by which reviewed translations leave the production box.

It uses the same heartbeat inversion as the DB backup: `pipeline-output/.last-content-backup` is written **only on a healthy run**. A run that found nothing to commit counts as healthy **only if nothing is unpushed** — a quiet weekend is a working cron, but a quiet run sitting on top of a rejected push is precisely the failure this detector exists to catch, and it must not clear the alarm. The backlog check is `git rev-list --count origin/main..HEAD`, which needs no network (a successful push updates the remote-tracking ref). `/api/health` reports:

```json
"content_backup": { "age_hours": 2, "stale": false, "last_status": "success", "message": "Pushed a1b2c3d", "ok": true }
```

`last_status` and `message` come from `pipeline-output/backup-status.json` and are **detail only** — `ok` is driven by heartbeat freshness alone, so one transient failure self-heals within a cycle without alarming, while a persistent one goes stale.

**Nothing polls `/api/health`.** `./scripts/deploy.sh` prints the status and the names of any not-ok checks at the end of every deploy; that is the routine surface. To check on demand: `curl -s http://localhost:3000/api/health`.

⚠️ **The cron deliberately never fetches before pushing.** The `merge.ours.driver` for the perpetually-dirty `books/*/translation-errors.json` is registered by `deploy.sh`, not by cron, so an unattended `git pull --rebase` here would turn a visible push failure into a repository wedged mid-rebase on production. A rejected push instead fails loudly, logs `git push failed (local ahead N, behind M)`, and goes stale in `/api/health`; resolve it by hand on the box.

## The research file (`research.db`)

**What it is, and why it is separate.** `pipeline-output/research.db` holds research rows only (spec §5.1): the research events, their items and the editor key map. Its copies live at most 7 days (R2, `docs/decisions/2026-11-03-research-capture-consent-and-retention-rulings.md`), so a withdrawal or the retention date is complete everywhere within 7 days, as the consent text promises. So the editorial tiers above must never copy it: `scripts/backup-db.sh` and `scripts/verify-db-backup.sh` match only `sessions.` names, pinned by `scripts/__tests__/research-backup-isolation.test.mjs`. No Linode Backups, no `tar` or `rsync` of `pipeline-output/` (`docs/deployment/linode-deployment-checklist.md` §9).

🔴 **Escrow first — a gate, as for the editorial passphrase above.** The research crypt remote takes **two** secrets: the passphrase (`password`) and the salt (`password2`, which rclone calls optional and recommends). **Both are needed to decrypt.** Both are its own, never the editorial ones, and both go into the password manager **before the first upload**: `rclone.conf` stores them obscured, not encrypted, so a lost box takes them with it and every research copy becomes unrecoverable. Generate both in the password manager first, then type them into `rclone config`, so the escrowed copy exists before rclone sees them.

**One-time setup.**

1. In the Linode console, create a **separate bucket** (for example `namsbokasafn-research`), in another region than the server. **Turn versioning off, and add no lifecycle or retention rule that keeps deleted objects:** a deleted copy that the provider keeps is a copy older than 7 days (check G-1b in the provider's console; re-check it after G1.20 lands, since G1.20 turns versioning on for the editorial bucket). Use an access key limited to that bucket where the provider offers one.
2. On the server, `rclone config`: a plain s3 remote **`linode-research`** pointing at the bucket's endpoint, and a crypt remote **`research-secret`** that wraps it, `remote = linode-research:namsbokasafn-research`, with the escrowed passphrase and salt: answer "type my own" at both the `password` and the `password2` prompt. Use the interactive `rclone config`, not `rclone config create`, which would put the access key and both secrets in the shell's history. The crypt remote's name must begin with `research`: the job refuses any other (exit 2), so the editorial `secret:` can never receive a research copy. **Only the crypt remote may begin with `research`:** that prefix is the whole guard, so a plain remote whose name began with it would let an unencrypted upload through.
3. **Prove the escrow before the first upload.** Compare what `rclone.conf` holds with the escrowed values, printing neither:

   ```bash
   CONF=$(rclone config file | tail -1)
   get() { awk -v k="$1" '/^\[research-secret\]/{f=1;next} /^\[/{f=0} f { i=index($0," = "); if (i && substr($0,1,i-1)==k) print substr($0,i+3) }' "$CONF"; }
   read -rsp 'Escrowed passphrase: ' P; echo
   [ "$(rclone reveal "$(get password)")" = "$P" ] && echo MATCH || echo DIFFERENT
   read -rsp 'Escrowed salt: ' P; echo
   [ "$(rclone reveal "$(get password2)")" = "$P" ] && echo MATCH || echo DIFFERENT
   unset P
   ```

   Both must print `MATCH`. ⚠️ **Read the values from `rclone.conf` itself, never from `rclone config show`:** on rclone 1.75 (prod, 2026-11-09) `config show` prints a placeholder in place of each password, so `rclone reveal` cannot decode its output and the comparison prints `DIFFERENT` whatever is typed. A check that cannot say `MATCH` proves nothing, and neither does one that cannot say `DIFFERENT`: type a wrong value once and expect `DIFFERENT`.

**Prime by hand, then install the cron lines, in that order.** From the repository root, as the service user: `RESEARCH_REMOTE=research-secret: scripts/research-backup.sh` (expect one `research-backup: ok` line and exit 0), then `RESEARCH_REMOTE=research-secret: scripts/verify-research-backup.sh` (expect `RESEARCH RESTORE VERIFY: PASS`). The exit codes are in each script's header. Only then install the two research lines `scripts/install-cron.sh` prints (the job, `scripts/research-backup.sh`, and its monthly restore test, `scripts/verify-research-backup.sh`; their schedules are on those lines and nowhere else), with `RESEARCH_REMOTE=research-secret:`, below the crontab's `PATH=` line.

- **Why this order:** a line installed before the remote works writes a `failed` verdict into the job's log at its first run, and that log is meant to hold only the job's real history. The job takes no lock, so once its line is installed, do not run it by hand at its scheduled minute.
- **The hand runs print to the terminal; the log file appears with the first cron run, and only that run proves cron can start the job.** A login shell has a `PATH` that cron's does not (the `PATH=` warning under [Cron](#cron) above), so a passing hand run says nothing about it. After the first scheduled run, check the log for its one `ok` line and a newer heartbeat.

**The job's log** (`pipeline-output/research-backup.log`) holds one verdict line per run — the time, `ok` or `failed`, and the failing steps' names — and nothing else (an unplanned bash abort adds bash's own one-line diagnostic before it). It never holds an interval id or a count, so it cannot say who withdrew ([USER] 2026-11-04). To see what a failing step found, re-run that step by hand (the deletion scripts without `--write` are dry runs) and read it in the terminal, never in the log.

**What the job does, in order:** prune both tiers by age (the local copies first, before anything that can stop the job); run `server/scripts/research-withdrawal.js` and `server/scripts/research-retention.js` with `--write` (a failure takes no copy); copy (better-sqlite3's online backup, compacted first); upload to `RESEARCH_REMOTE`; write the heartbeat. The prune cut-off and the health threshold are derived values in `server/lib/researchBackupPolicy.js`.

**What makes "within 7 days" true:** the job runs (its heartbeat: `/api/health`'s `checks.research_db` reads `backup-stale` otherwise, and `./scripts/deploy.sh` names `research_db` among the not-ok checks without its reason — `curl -s http://localhost:3000/api/health` shows the reason); nothing else copies the file (G-1a); the bucket keeps no deleted versions (G-1b). Expect `backup-stale` from a deploy until the job's first full run.

### Restore runbook (research file)

1. Stop the service (`research-restore.js` refuses while it runs).
2. To use an off-box copy, fetch it into `pipeline-output/research-backups/` under its own name: `rclone copyto research-secret:<name> pipeline-output/research-backups/<name>`.
3. `node server/scripts/research-restore.js --from pipeline-output/research-backups/<name>` (a dry run), then the same with `--write`. It verifies the copy, purges every withdrawn interval and the retention date from a staged copy, deletes the current file and puts the purged copy in its place.
4. Start the service.

**Never copy a backup into place by hand:** a restored file must lose its withdrawn rows before the server opens it (spec §5.15). If the file is lost and no copy exists, do not create one: the server stays `missing` until [USER] decides (spec §5.1).

## Restore runbook

To recover `sessions.db` onto a fresh box:

1. Install `rclone` + `sqlite3`.
2. `rclone config` the same `secret:` crypt remote (same underlying bucket + **the same passphrase**).
3. Confirm the off-box backup is intact: `BACKUP_REMOTE=secret: scripts/verify-db-backup.sh` → expect `RESTORE VERIFY: PASS`.
4. Restore the latest into place: `rclone lsf secret: | grep '^sessions\.' | sort -r | head -1` to find it, then `rclone copyto "secret:<that-file>" pipeline-output/sessions.db` (the crypt remote decrypts on read).
5. Restart the server; `/api/health` should return `"ok"` once the next backup writes a fresh heartbeat.

`verify-db-backup.sh` fails loud on every bad outcome — no off-box backup found, download error, `PRAGMA integrity_check` non-ok (openable-but-corrupt *and* structurally corrupt), or a missing core table — each prints a grep-able `RESTORE VERIFY: FAIL (...)` line and exits non-zero. Wire its monthly run into monitoring so a silently-rotting backup is caught before you need it.
