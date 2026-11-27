# Backup & Restore — `sessions.db` and the research file

The research file (`research.db`) has its own job, its own remote and its own rules: see [The research file](#the-research-file-researchdb) below. Nothing described for `sessions.db` may copy it.

**What this protects.** `pipeline-output/sessions.db` holds the editorial work that lives **only** in the database: segment edits, the per-segment version history (`content_versions`), review/approval state, and the **entire terminology glossary**. It is gitignored — the 2-hourly `git-backup.sh` cron backs up rendered *content* under `books/`, but **not** the DB. (`content_versions` holds no snapshots while chemistry's writes are held, register §C203, so the work in that period lives in `segment_edits`.) If `sessions.db` is lost and there is no off-box copy, that human-verified intellectual work is gone. `sessions.db` also contains **PII** (editor emails / display names in `users`), so off-box copies are **client-side encrypted**.

There are two layers (a third, long-lived and locked, is added by [The editorial bucket in Paris](#the-editorial-bucket-in-paris-g120)):
1. **Local** (`scripts/backup-db.sh`, always on): a timestamped copy under `pipeline-output/backups/`, made with `VACUUM INTO` (live rows only, so deleted rows' bytes are not carried forward; mode `0600`; kept only if `PRAGMA integrity_check` passes) → keep the most recent `MAX_BACKUPS` (set in `scripts/backup-db.sh`). Protects against accidental corruption/deletion, but **not** disk/instance loss.
2. **Off-box** (same script, when `BACKUP_REMOTE` is set): encrypt-and-upload each backup to Linode Object Storage via `rclone`. Protects against losing the box.

The Paris tier (`LOCKED_BACKUP_REMOTE`) adds gzipped copies that Object Lock keeps from the server's own key and that expire before 12 months: see [The editorial bucket in Paris](#the-editorial-bucket-in-paris-g120).

## Configuration (environment)

| Var | Read by | Default | Meaning |
|---|---|---|---|
| `BACKUP_REMOTE` | `backup-db.sh`, `verify-db-backup.sh` | *(unset → off-box skipped)* | An `rclone` **crypt** remote path, e.g. `secret:`. **Must end in `:` or `/`** — the script fails loud (`exit 5`) otherwise, because a missing separator munges the object name and silently breaks retention. Since the crypt remote already points at the bucket, `secret:` *is* the bucket root; a subpath form must still carry the trailing slash (`secret:sub/`). |
| `BACKUP_REMOTE_KEEP` | `backup-db.sh` | `BACKUP_REMOTE_KEEP`'s fallback in `scripts/backup-db.sh` | How many most-recent objects to keep off-box (older ones pruned). |
| `LOCKED_BACKUP_REMOTE` | `backup-db.sh`, `recover-from-backup.js` | *(unset → Paris skipped)* | The Paris **crypt** remote (`locked-secret:`). **Must begin with `locked`, end in `:` or `/`, and be an rclone remote of type `crypt`** (checked against rclone's config). Otherwise Paris is skipped (nothing is uploaded to it or deleted from it) and the run exits 5, while London, if set, still runs. The type check is what stops the S3 remote being pasted here, which would upload unencrypted into a bucket where nothing can be removed. Uploads the gzipped copy; the bucket's settings, never a flag, lock it. London's `BACKUP_REMOTE` must **not** begin with `locked` nor equal this value: either stops the whole run with `exit 5` before anything is sent. |
| `LOCKED_BACKUP_S3` | `backup-db.sh` | *(required when `LOCKED_BACKUP_REMOTE` is set)* | The raw S3 path under that crypt remote (`locked-s3:<bucket>/`), for version listings and deletes. **Must begin with `locked`, end in `:` or `/` and be an rclone remote of type `s3`**, different from `LOCKED_BACKUP_REMOTE`. Otherwise Paris is skipped with `exit 5`, as above. |
| `OFFBOX_BACKUP_STALE_HOURS` | the server (`/api/health`) | `DEFAULT_STALE_HOURS` in `server/lib/offboxBackupHealth.js` | Age past which `/api/health` flags the off-box backup `stale` (derived from the cron period: see the comment above `DEFAULT_STALE_HOURS`); it also bounds how old the Paris status file may be (`checks.offbox_backup_cap`). |
| `CONTENT_BACKUP_STALE_HOURS` | the server (`/api/health`) | `DEFAULT_STALE_HOURS` in `server/lib/contentBackupHealth.js` | Age past which `/api/health` flags the **content** backup `stale` (derived from the cron period: see the comment above `DEFAULT_STALE_HOURS`). |

**The encryption passphrase is NOT an environment variable.** Encryption is the `rclone` crypt remote's job (client-side — plaintext never leaves the box). The passphrase lives in the rclone config (`rclone config`, or `RCLONE_CONFIG_<NAME>_PASSWORD`). There is deliberately no `BACKUP_ENCRYPTION_KEY` the scripts read.

🔴 **The passphrase must be escrowed in the password manager BEFORE the first upload — this is a gate, not a reminder.** rclone stores it in `rclone.conf` *obscured*, which is reversible, not encrypted. So the config on the box can decrypt the backups — and if the box is lost, the passphrase is lost with it, making every off-box copy permanently unrecoverable in exactly the disaster they exist for. An off-box backup you cannot decrypt is not a backup.

**Do not password-protect `rclone.conf` itself.** It would break unattended cron — and break it at 06:30 with nobody watching, since the interactive setup test would still pass. Protect it with file permissions (`chmod 600`) instead.

## One-time setup (Linode Object Storage)

> **This section is for the London `secret:` bucket only.** Its console-only steps do not apply to the editorial bucket in Paris: Cloud Manager cannot enable Object Lock or set lifecycle rules, so that bucket is set up from your computer with the AWS CLI, under [The editorial bucket in Paris](#the-editorial-bucket-in-paris-g120).

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

During the move to Paris the backup line also carries `LOCKED_BACKUP_REMOTE=locked-secret: LOCKED_BACKUP_S3=locked-s3:<bucket>/`, and a second monthly line tests `BACKUP_REMOTE=locked-secret:`. After the move `BACKUP_REMOTE` is dropped (Step 8 of the Paris section). ⚠️ **Do not install the newly printed backup line before Step 8.4** (after the hand run, the restore test and the health read): with `LOCKED_BACKUP_REMOTE` set, London stops writing the heartbeat, so an installed line whose Paris half is not yet working leaves `/api/health` reporting the backup stale. A Paris setting the job refuses (a name, separator or rclone type) skips Paris with exit 5 while London still uploads, and shows the same way: `checks.offbox_backup` goes stale. The values printed by `install-cron.sh` are pinned against the real guards by `scripts/__tests__/backup-db.test.mjs`.

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

1. In the Linode console, create a **separate bucket** (for example `namsbokasafn-research`), in another region than the server. **Leave versioning off, and add no Object Lock or lifecycle rule:** a deleted copy that the provider keeps is a copy older than 7 days. A new bucket starts unversioned. Linode's console can neither show nor change versioning or Object Lock, so only an S3 tool could turn them on: never do so for this bucket. Step 4 checks it (G-1b). Use an access key limited to that bucket where the provider offers one.
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
4. **Check that the bucket is unversioned (G-1b).** Linode's console cannot show it ([Akamai's docs](https://techdocs.akamai.com/cloud-computing/docs/versioning-retain-object-version-history)), so read it through the s3 remote, putting **nothing after the bucket name**: a trailing `Enabled` or `Suspended` sets the status instead of reading it, and a bucket once versioned can never return to unversioned.

   ```bash
   rclone backend versioning linode-research:<bucket>
   ```

   It must print `"Unversioned"`. That one answer settles G-1b. A delete is final on an unversioned bucket. Object Lock can be enabled only when a bucket is created and turns versioning on, so an unversioned bucket has none. A lifecycle rule can only expire or move objects, so it cannot keep a deleted copy. `"Suspended"` or `"Enabled"` means no consent is collected: a versioned bucket cannot be returned to unversioned, so the fix is a new bucket. **Re-check after G1.20 lands**, since G1.20 turns versioning on for the editorial bucket.

**Prime by hand, then install the cron lines, in that order.** From the repository root, as the service user: `RESEARCH_REMOTE=research-secret: scripts/research-backup.sh` (expect one `research-backup: ok` line and exit 0), then `RESEARCH_REMOTE=research-secret: scripts/verify-research-backup.sh` (expect `RESEARCH RESTORE VERIFY: PASS`). The exit codes are in each script's header. Only then install the two research lines `scripts/install-cron.sh` prints (the job, `scripts/research-backup.sh`, and its monthly restore test, `scripts/verify-research-backup.sh`; their schedules are on those lines and nowhere else), with `RESEARCH_REMOTE=research-secret:`, below the crontab's `PATH=` line.

- **Why this order:** a line installed before the remote works writes a `failed` verdict into the job's log at its first run, and that log is meant to hold only the job's real history. The job takes no lock, so once its line is installed, do not run it by hand at its scheduled minute.
- **The hand runs print to the terminal; the log file appears with the first cron run, and only that run proves cron can start the job.** A login shell has a `PATH` that cron's does not (the `PATH=` warning under [Cron](#cron) above), so a passing hand run says nothing about it. After the first scheduled run, check the log for its one `ok` line and a newer heartbeat.

**The job's log** (`pipeline-output/research-backup.log`) holds one verdict line per run — the time, `ok` or `failed`, and the failing steps' names — and nothing else (an unplanned bash abort adds bash's own one-line diagnostic before it). It never holds an interval id or a count, so it cannot say who withdrew ([USER] 2026-11-04). To see what a failing step found, re-run that step by hand (the deletion scripts without `--write` are dry runs) and read it in the terminal, never in the log.

**What the job does, in order:** prune both tiers by age (the local copies first, before anything that can stop the job); run `server/scripts/research-withdrawal.js` and `server/scripts/research-retention.js` with `--write` (a failure takes no copy); copy (better-sqlite3's online backup, compacted first); upload to `RESEARCH_REMOTE`; write the heartbeat. The prune cut-off and the health threshold are derived values in `server/lib/researchBackupPolicy.js`.

**What makes "within 7 days" true:** the job runs (its heartbeat: `/api/health`'s `checks.research_db` reads `backup-stale` otherwise, and `./scripts/deploy.sh` names `research_db` among the not-ok checks without its reason — `curl -s http://localhost:3000/api/health` shows the reason); nothing else copies the file (G-1a); the bucket keeps no deleted versions (G-1b). Expect `backup-stale` from a deploy until the job's first full run.

**Who may read it.** Once a consent text is approved, no Claude Code session reads `research.db`, the `research_*` tables, named editing rows, or the access logs and service journal, and that includes a restored or downloaded copy. The rule and what it covers → CLAUDE.md § Purpose, *"No Claude Code session reads the research database, named editing rows or logs that name editors"*. A human operator runs those reads and passes on counts only.

### Restore runbook (research file)

1. Stop the service (`research-restore.js` refuses while it runs).
2. To use an off-box copy, fetch it into `pipeline-output/research-backups/` under its own name: `rclone copyto research-secret:<name> pipeline-output/research-backups/<name>`.
3. `node server/scripts/research-restore.js --from pipeline-output/research-backups/<name>` (a dry run), then the same with `--write`. It verifies the copy, purges every withdrawn interval and the retention date from a staged copy, deletes the current file and puts the purged copy in its place.
4. Start the service.

**Never copy a backup into place by hand:** a restored file must lose its withdrawn rows before the server opens it (spec §5.15). If the file is lost and no copy exists, do not create one: the server stays `missing` until [USER] decides (spec §5.1).


## The editorial bucket in Paris (G1.20)

**What it is.** A second off-box tier for `sessions.db`, in a **new bucket in Paris with Object Lock**, so that a copy cannot be deleted by the server for its first months and is gone for good before 12 months have passed (the consent text's up to 12 months). Design and reasons: [the G1.20 design](../superpowers/specs/2026-11-27-g120-editorial-backups-design.md). This section holds only what you type, and the read-back that proves each command took. London (`BACKUP_REMOTE`) keeps running untouched until step 8.

**Where each command runs.**
- **Your own computer** (steps 1, 2, 3, 7 and 9, and the AWS CLI parts of step 6): the AWS CLI with `--profile locked-admin`, the **unlimited** key you make in Cloud Manager. **Never install `aws` or the unlimited key on the server.** Console-only setup cannot do this: Cloud Manager can neither enable Object Lock nor show or set versioning or lifecycle rules.
- **Cloud Manager** (step 4): making the server's limited key.
- **The server, as the service user** (steps 5, 6 and 8): `rclone` only. Production has no `aws` and no `s3cmd`.

Throughout, `<bucket>` is the new bucket's name and `<endpoint>` is `https://fr-par-1.linodeobjects.com`. Set up the AWS CLI once with `aws configure` (a profile `locked-admin` for the unlimited key; the region may be left at its default) and add `--profile locked-admin --endpoint-url <endpoint>` to each `aws` command below. Where a command says `--profile locked-server`, it uses the **limited key from step 4** instead.

🔴 **A lock cannot be shortened, by anyone.** A copy locked for 350 days stays for 350 days. So each lock length below is set only in its own phase, and every setting is read back before you go on.

### Step 1. Create the bucket

```bash
aws s3api create-bucket --bucket <bucket> --object-lock-enabled-for-bucket --profile locked-admin --endpoint-url <endpoint>
```

Read back:

```bash
aws s3api get-bucket-versioning --bucket <bucket> --profile locked-admin --endpoint-url <endpoint>
```

It must print `"Status": "Enabled"`. Object Lock can be turned on only when a bucket is created, and it turns versioning on. **Use a new bucket, not the research one.** The research bucket must stay unversioned.

### Step 2. The probe lock (3 days)

```bash
aws s3api put-object-lock-configuration --bucket <bucket> \
  --object-lock-configuration '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":3}}}' \
  --profile locked-admin --endpoint-url <endpoint>
aws s3api get-object-lock-configuration --bucket <bucket> --profile locked-admin --endpoint-url <endpoint>
```

The read-back must show `"Mode": "COMPLIANCE"` and `"Days": 3`. Three days is longer than the probe's lifecycle window below, which the probe needs. Record the read-back in the register.

If this or any `aws` command here is refused with an error about a checksum, the AWS CLI's newer default checksums may be the cause: retry it with `AWS_REQUEST_CHECKSUM_CALCULATION=when_required` in front of the command. (Not verified against Akamai: a hint, not a known fix.)

### Step 3. The probe lifecycle (1 day)

Save this as `probe-lifecycle.json` on your computer. It has two rules: one expires current copies after 1 day and noncurrent versions 1 day after that, and one removes delete markers once nothing lies behind them (an object cannot take both clauses in one rule).

```json
{"Rules":[
  {"ID":"expire","Status":"Enabled","Filter":{"Prefix":""},
   "Expiration":{"Days":1},"NoncurrentVersionExpiration":{"NoncurrentDays":1}},
  {"ID":"markers","Status":"Enabled","Filter":{"Prefix":""},
   "Expiration":{"ExpiredObjectDeleteMarker":true}}
]}
```

```bash
aws s3api put-bucket-lifecycle-configuration --bucket <bucket> --lifecycle-configuration file://probe-lifecycle.json --profile locked-admin --endpoint-url <endpoint>
aws s3api get-bucket-lifecycle-configuration --bucket <bucket> --profile locked-admin --endpoint-url <endpoint>
```

The read-back must show both rules; record it in the register. Note whether the second rule (`ExpiredObjectDeleteMarker`) came back: if Akamai dropped it, kept delete markers are harmless (no bytes, an encrypted name, and the job's age test skips them). If the AWS CLI call is refused outright, Akamai documents `s3cmd setlifecycle` for the same rules as the fallback.

### Step 4. The server's key

In Cloud Manager, make an access key limited to this bucket only, with **read_write**. Under COMPLIANCE such a key can add versions and cannot delete one while it is locked. Configure it on your computer as a second AWS profile, `locked-server` (`aws configure --profile locked-server`), because the probe uses it.

Read back in Cloud Manager that the key lists this bucket and no other.

### Step 5. On the server: the two rclone remotes

As the **service user** (so the remotes land in the `rclone.conf` the cron reads), run the interactive `rclone config`, not `rclone config create`, which would put the key and the passphrase in the shell's history:

- a plain **s3** remote **`locked-s3`**: provider Linode (or Other), the **limited** key from step 4, endpoint `fr-par-1.linodeobjects.com`;
- a **crypt** remote **`locked-secret`** wrapping it: `remote = locked-s3:<bucket>`.

**Both Paris remotes begin with `locked`**, and London's `BACKUP_REMOTE` must **not** (the job refuses it and stops the whole run, exit 5: that is what keeps London's count-based prune away from this bucket). The job also checks each remote's **type** against rclone's config, so a swapped pair (the S3 remote in the crypt variable would upload unencrypted into a bucket where nothing can be removed) or a wrongly typed remote is refused before anything is uploaded to Paris or deleted there. A refused Paris setting skips Paris only, with exit 5: London, while it is still set, runs as usual, and `checks.offbox_backup` goes stale because the heartbeat is Paris's.

🔴 **The passphrase goes into the password manager BEFORE any upload.** This is the same gate as for the other remotes, and sharper here: a copy nobody can decrypt is still locked, and still billed, for its whole life. The crypt remote takes **two** secrets, the passphrase (`password`) and the salt (`password2`): **both are needed to decrypt.** Generate both in the password manager first, then answer "type my own" at both prompts. Then run `chmod 600` on `rclone.conf` (`rclone config file` prints where it is).

**Prove the escrow before the first upload.** Compare what `rclone.conf` holds with the escrowed values, printing neither:

```bash
CONF=$(rclone config file | tail -1)
get() { awk -v k="$1" '/^\[locked-secret\]/{f=1;next} /^\[/{f=0} f { i=index($0," = "); if (i && substr($0,1,i-1)==k) print substr($0,i+3) }' "$CONF"; }
read -rsp 'Escrowed passphrase: ' P; echo
[ "$(rclone reveal "$(get password)")" = "$P" ] && echo MATCH || echo DIFFERENT
read -rsp 'Escrowed salt: ' P; echo
[ "$(rclone reveal "$(get password2)")" = "$P" ] && echo MATCH || echo DIFFERENT
unset P
```

Both must print `MATCH`. Read the values from `rclone.conf` itself, never from `rclone config show` (it prints a placeholder, so the comparison can only say `DIFFERENT`). A check that cannot say `MATCH` proves nothing, and neither does one that cannot say `DIFFERENT`: type a wrong value once and expect `DIFFERENT`.

Read back that both remotes work and have the right types:

```bash
rclone listremotes --long                      # locked-s3: s3 and locked-secret: crypt
rclone backend versioning locked-s3:<bucket>   # nothing after the bucket name: a trailing word would SET it
rclone lsf locked-secret:                      # an empty bucket: prints nothing, exits 0
```

The `versioning` command must print `"Enabled"`.

### Step 6. The live probe

Local tests cannot prove a lock (rclone's local remote has none), and a real copy locked for months cannot be removed, so the lock is proved here, with throwaway objects and the 3-day lock.

**Timing.** Do 6.1 to 6.5 in the **morning** of day 1, in one sitting, and keep a note of each time you type (UTC). The lifecycle runs at midnight, bucket-local time. Three things then happen on fixed days: the go/no-go is read in the early hours of day 4 (6.5), the versioned delete is tried in the afternoon of day 4 (6.7), and the bucket is checked empty about two days later (6.8).

The probe's pass or fail has one decisive question, **step 6.5**. The steps before it only record what happens.

**6.1 Upload object A through the crypt remote, and read it back.** This also proves that rclone's encrypted upload is accepted by a bucket with Object Lock.

```bash
echo probe-A1 > /tmp/probe-A.txt
rclone copyto /tmp/probe-A.txt locked-secret:probe-A.txt
rclone lsf locked-secret:
rclone cryptdecode --reverse locked-secret: probe-A.txt
rclone lsjson --s3-versions locked-s3:<bucket>/
```

`lsf` must list `probe-A.txt`. `cryptdecode` prints A's encrypted name: call it `<A-enc>`. In the `--s3-versions` listing the **current** version of an object shows under its plain name, `<A-enc>`; only **older** versions carry a suffix, `-v<date>-<time>-<ms>`. So there is exactly one entry for A now, and no versioned name yet.

**6.2 Upload A again under the same name.**

```bash
echo probe-A2 > /tmp/probe-A.txt
rclone copyto /tmp/probe-A.txt locked-secret:probe-A.txt
rclone lsjson --s3-versions locked-s3:<bucket>/
```

Expect two entries: `<A-enc>` (the new current version) and the first upload, now suffixed. Call the suffixed name `<A-enc-v1>`. It is still locked.

**6.3 Try to delete the first upload by its versioned name. Expect a refusal.**

```bash
rclone deletefile --s3-versions locked-s3:<bucket>/<A-enc-v1>
rclone lsjson --s3-versions locked-s3:<bucket>/
```

The delete must fail (an `AccessDenied` or similar error), and the listing must still show `<A-enc-v1>`. Do not use the plain name `<A-enc>` here: a plain delete only adds a delete marker and "succeeds", which proves nothing. If the delete of `<A-enc-v1>` **succeeds**, the lock does not protect against the server's key: stop here, and you decide before anything else is done.

**6.4 Try to change the lock and the lifecycle with the server's key.** These use the AWS CLI with the **limited** key. They send the values already set, so a success changes nothing.

```bash
aws s3api put-object-lock-configuration --bucket <bucket> \
  --object-lock-configuration '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":3}}}' \
  --profile locked-server --endpoint-url <endpoint>
aws s3api put-bucket-lifecycle-configuration --bucket <bucket> --lifecycle-configuration file://probe-lifecycle.json --profile locked-server --endpoint-url <endpoint>
```

Write down for each whether it was refused. A refusal is the good answer. If either was **allowed**, it is a residual risk, to go in the register: the job's own delete rule and the `offbox_backup_cap` check are its detectors.

**6.5 The go/no-go: a plain delete must not destroy a locked copy.** Upload object B, then delete it plainly, as a buggy script would. Note the time between the two (UTC): call it `<before-delete>`.

```bash
echo probe-B > /tmp/probe-B.txt
rclone copyto /tmp/probe-B.txt locked-secret:probe-B.txt
date -u +%Y-%m-%dT%H:%M:%SZ        # this is <before-delete>
rclone deletefile locked-secret:probe-B.txt
```

Read back at once:

```bash
rclone lsf locked-secret:                                           # B is not listed: hidden behind a delete marker
rclone lsf --s3-version-at <before-delete> locked-secret:           # B is listed: still there
rclone cat --s3-version-at <before-delete> locked-secret:probe-B.txt   # prints probe-B: the hidden copy can be READ
```

The last command is the download proof: the recovery tool's `--as-of` needs to read a hidden copy, not only list it. If the second command does **not** list B, or the third does not print `probe-B`, that is a problem with the instrument, not a verdict: check that `<before-delete>` is after B's upload and before the delete, retry with a time a few seconds after the upload, and look at `rclone lsjson --s3-versions --s3-version-deleted locked-s3:<bucket>/` for B's version and its marker. Do not go on until B can be listed at that time.

Now wait. B's noncurrent version (it became noncurrent at the delete) is first eligible for the 1-day lifecycle rule at the **second** midnight after the upload, so read it **after the THIRD midnight**: by then the rule has had two runs at it. The lock ends 72 hours after B's upload, so read **before that**. With a morning upload the third midnight falls about 63 hours after it, so the early hours of day 4 fit (an upload at 09:00 on day 1: read between about 00:30 and 08:30 on day 4). Then:

```bash
rclone lsf --s3-version-at <before-delete> locked-secret:
rclone cat --s3-version-at <before-delete> locked-secret:probe-B.txt
```

🔴 **B must still be listed, and the `cat` must still print `probe-B`.** If it is, the plain delete hid B, the lifecycle did not destroy it, and the layout is sound: go on. **If B is gone, STOP.** Akamai's lifecycle ignored the lock, so this layout does not survive a bad script. Do not upload a real copy and do not go on to step 7: the decision is yours, and the next step is a new design.

**6.6 Confirm the job's own listing sees all of it.** This is the exact listing `scripts/backup-db.sh` takes; it must show hidden versions too. Run it right after the 6.5 read, still before the locks end:

```bash
rclone lsjson --s3-versions --s3-version-deleted --use-server-modtime locked-s3:<bucket>/
```

By now the probe's 1-day rule has put its own delete marker on A's current copy, so expect: A's two versions (both suffixed now, since a marker sits on top of A's current copy), B's version, and **delete markers** (entries of size 0): B's, and one for A.

**6.7 After the 3-day locks have ended: delete a version by name with the server's key. Expect success.** This proves the job's own delete can work. It has a window: it opens 72 hours after A's first upload and closes at the next midnight, because the noncurrent rule removes A's versions at the first midnight run after their locks end. With a morning start, do it in the afternoon of day 4. First read back that `<A-enc-v1>` still exists:

```bash
rclone lsjson --s3-versions locked-s3:<bucket>/       # <A-enc-v1> must be listed
rclone deletefile --s3-versions locked-s3:<bucket>/<A-enc-v1>
rclone lsjson --s3-versions locked-s3:<bucket>/       # <A-enc-v1> must be gone
```

The delete must succeed and the last listing must no longer show `<A-enc-v1>`. (If the window was missed and the lifecycle rule already removed everything, repeat 6.1 to 6.3 and 6.7 with a fresh object C: the probe lock is still 3 days.)

**6.8 Leave the rest to the lifecycle rule.** Do nothing more. About two days later:

```bash
rclone lsjson --s3-versions --s3-version-deleted locked-s3:<bucket>/
```

It must be empty, or hold only delete markers (size 0). That proves the rule deletes on this bucket. Do not upload a real copy before it is empty.

### Step 7. After the probe: the real settings

⚠️ **Timing, here and in step 9 (and for any later change to the default lock):** type these well away from the backup cron's `:30` slots (00:30, 06:30, 12:30 and 18:30 UTC), so that no cron upload lands under a mistyped lock before you have read it back. A copy takes the lock in force when it is uploaded, and that lock cannot be shortened.

Set the lifecycle to the real rule (current copies at **355** days, noncurrent versions after **1** day, expired delete markers removed). Save it as `lifecycle.json`:

```json
{"Rules":[
  {"ID":"expire","Status":"Enabled","Filter":{"Prefix":""},
   "Expiration":{"Days":355},"NoncurrentVersionExpiration":{"NoncurrentDays":1}},
  {"ID":"markers","Status":"Enabled","Filter":{"Prefix":""},
   "Expiration":{"ExpiredObjectDeleteMarker":true}}
]}
```

```bash
aws s3api put-bucket-lifecycle-configuration --bucket <bucket> --lifecycle-configuration file://lifecycle.json --profile locked-admin --endpoint-url <endpoint>
aws s3api get-bucket-lifecycle-configuration --bucket <bucket> --profile locked-admin --endpoint-url <endpoint>
```

The read-back must show `"Days": 355` and `"NoncurrentDays": 1`; record it in the register. Then the **interim lock, 30 days**:

```bash
aws s3api put-object-lock-configuration --bucket <bucket> \
  --object-lock-configuration '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":30}}}' \
  --profile locked-admin --endpoint-url <endpoint>
aws s3api get-object-lock-configuration --bucket <bucket> --profile locked-admin --endpoint-url <endpoint>
```

The read-back must show `"Days": 30`. Record both read-backs in the register.

⚠️ **What the interim lock does not cover.** Until step 9, a copy is protected from the server for its first 30 days only. After that, anything holding the server's key can delete it by version. It is the price of keeping the door open for a shorter cap from the data protection officer. The full protection starts at step 9.

### Step 8. Switch the cron from London to Paris

The order is the design's (§4.7): a watched hand run, the restore test, health reading ok, and only then the crontab. Until 8.4 the crontab keeps its London-only line, which keeps writing the heartbeat.

1. **A watched hand run, with both remotes set.** From the repository root, as the service user:

   ```bash
   BACKUP_REMOTE=secret: LOCKED_BACKUP_REMOTE=locked-secret: LOCKED_BACKUP_S3=locked-s3:<bucket>/ scripts/backup-db.sh; echo "exit $?"
   ```

   Expect `Locked off-box upload OK; heartbeat: …` and `exit 0`. The exit codes, if not: 3 rclone missing; 4 an upload failed; 5 a setting is malformed or forbidden, in one of two ways: a London setting that could reach the locked bucket stops the whole run before anything is sent, while a Paris setting the job refuses (a name, separator or rclone type) skips Paris only, so London still uploads and `checks.offbox_backup` goes stale; 6 paused because an editorial retention step is due (nothing was sent to Paris); 7 the rate guard (`MAX_COPIES_PER_24H` copies in 24 hours, in `server/lib/editorialBackupPolicy.js`) refused or the listing before the upload failed; 8 the status check is not ok. Then read the status file, which holds ages and counts only:

   ```bash
   cat pipeline-output/backups/.offbox-locked-status.json
   rclone lsf locked-secret:
   ```

   The new `sessions.<stamp>.db.gz` must be listed.
2. **The restore test against Paris.**

   ```bash
   BACKUP_REMOTE=locked-secret: scripts/verify-db-backup.sh
   ```

   Expect `RESTORE VERIFY: PASS` (it reads the newest `.db.gz` copy, unzips and integrity-checks it).
3. **Health reads ok.**

   ```bash
   curl -s http://localhost:3000/api/health
   ```

   `checks.offbox_backup_cap` must read `"ok":true,"state":"ok"`. ⚠️ **`"state":"not-configured"` also reads `ok:true`**; it means the status file does not exist, so it is *not* a pass here. The states are:
   - `ok`;
   - `stale`: the job has not written the status file within `OFFBOX_BACKUP_STALE_HOURS`;
   - `unreadable`: the file is malformed, or it exists and the server cannot read it (its permissions, say);
   - `unavailable`: the check itself could not run;
   - `listing-invalid`: the bucket's listing could not be read;
   - `listing-empty`: the listing holds no copy (delete markers alone count as empty);
   - `uploaded-not-seen`: the copy just uploaded is not listed through the crypt remote;
   - `no-fresh-copy`: no copy in the S3 listing is within `FRESH_WINDOW_MS` of now, so either `LOCKED_BACKUP_S3` lists a different bucket from the one the copy went to, or the server's clock is wrong. The job's own delete refuses to run while this holds;
   - `over-cap`: a copy is older than `CAP_ALARM_AFTER_DAYS`, so both the lifecycle rule and the job's own delete (`SERVER_DELETE_AFTER_DAYS`) failed.

   The values named here are constants in `server/lib/editorialBackupPolicy.js`. A failing state names what to look at: the status file above, and `pipeline-output/backup-db.log`. `checks.offbox_backup` is the heartbeat of the last successful locked upload.
4. **Only now, install the crontab line with both remotes.** `scripts/install-cron.sh` prints the backup line with `BACKUP_REMOTE`, `LOCKED_BACKUP_REMOTE` and `LOCKED_BACKUP_S3`, and a monthly verify line for `BACKUP_REMOTE=locked-secret:`. Replace `BUCKET` in `LOCKED_BACKUP_S3` with `<bucket>` (the value must still end in `/`). Install both with `crontab -e` and read them back with `crontab -l`. (With `LOCKED_BACKUP_REMOTE` set, London no longer writes the heartbeat: it is Paris's. If a later Paris run is refused or fails, London keeps uploading and `checks.offbox_backup` goes stale.)
5. **Drop London.** Edit the crontab so that the backup line is exactly the Paris one, and the London monthly verify line (the one with `BACKUP_REMOTE=secret:`) is **removed whole**:

   ```cron
   30 */6 * * * LOCKED_BACKUP_REMOTE=locked-secret: LOCKED_BACKUP_S3=locked-s3:<bucket>/ <repo>/scripts/backup-db.sh >> <repo>/pipeline-output/backup-db.log 2>&1
   15 4 1 * * BACKUP_REMOTE=locked-secret: <repo>/scripts/verify-db-backup.sh >> <repo>/pipeline-output/verify-db-backup.log 2>&1
   ```

   Read it back with `crontab -l`: no line may still carry `BACKUP_REMOTE=secret:` (the `LOCKED_BACKUP_REMOTE=locked-secret:` and `BACKUP_REMOTE=locked-secret:` forms are the Paris ones and stay). The `RESEARCH_REMOTE=research-secret:` lines for the research job and its restore test are a different job and **stay untouched**. Then delete the London editorial bucket (precondition 1), and remove the `secret` remote from `rclone config`. Its copies are at most about 7.5 days old, so nothing needs carrying over.
6. **Re-read the research bucket (G-1b).** G1.20 is what turned versioning on for the editorial bucket, so confirm the research bucket still reads unversioned:

   ```bash
   rclone backend versioning linode-research:<research-bucket>
   ```

   It must still print `"Unversioned"`.

### Step 9. When the consent text is listed: the full lock (350 days)

Do this when, and only when, a consent text is listed in `APPROVED_CONSENT_TEXTS` (`server/lib/researchConsentText.js`) on `main`. It applies to new copies only; the copies already there keep their 30-day locks. It runs on your computer, with `--profile locked-admin`, well away from the cron's `:30` slots (00:30, 06:30, 12:30 and 18:30 UTC): see the timing note in step 7.

First read that the lifecycle is still the real one (355 and 1), because the lock must stay shorter than it:

```bash
aws s3api get-bucket-lifecycle-configuration --bucket <bucket> --profile locked-admin --endpoint-url <endpoint>
```

It must show `"Days": 355` and `"NoncurrentDays": 1`. Then set the lock and read it back:

```bash
aws s3api put-object-lock-configuration --bucket <bucket> \
  --object-lock-configuration '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":350}}}' \
  --profile locked-admin --endpoint-url <endpoint>
aws s3api get-object-lock-configuration --bucket <bucket> --profile locked-admin --endpoint-url <endpoint>
```

The read-back must show `"Days": 350`. Record it in the register.

### Recovering an older copy

Only the **newest** copy is ever put in place of `sessions.db` (see the [Restore runbook](#restore-runbook)). To read what a segment said, or what a module held, at an earlier time, use the recovery tool. It is read-only: it opens copies read-only from a private temporary directory, deletes them afterwards, and refuses the live database.

🔴 **Run it yourself, in a plain terminal on the server. Never through a Claude Code session's `!` prefix**: it prints editors' text and names, and everything a session reads goes to Anthropic (CLAUDE.md § Purpose).

```bash
# one segment across a range of dates (the newest copy of each day; add --every for every copy)
node server/scripts/recover-from-backup.js segment --book <book> --module <module> --segment <segment-id> --from 2026-11-01 --to 2026-11-30

# a whole module as it stood at a chosen time
node server/scripts/recover-from-backup.js module --book <book> --module <module> --at 2026-11-15T12:00:00
```

It takes the remote from `--remote`, or from `LOCKED_BACKUP_REMOTE`. `--file <copy>` reads a local copy instead, plain or gzipped (`.db.gz`, unzipped into the private directory first). Times without a timezone are UTC, like the copies' names. A copy a plain delete has hidden behind a delete marker is still recoverable: add `--as-of <a time before the delete>` and the bucket is read as it was then. Exit 0 means rows were printed; 1 means no copy in range or no rows; 2 means a usage error, or `--file` was the live database. Ctrl-C (or SIGTERM) stops it: it kills the download, removes its temporary directory, prints nothing more and exits 130 (143). It prints that directory's path to stderr when it starts, so if the run is killed in a way no program can catch (`kill -9`, a lost machine), delete that directory by hand.

Put recovered wording back through the editor as an ordinary edit, so it is reviewed and recorded like any other.

## Restore runbook

To recover `sessions.db` onto a fresh box (the Paris remote; London's `secret:` works the same way, minus the unzip, until it is retired in Step 8 of the Paris section):

1. Install `rclone` + `sqlite3`.
2. As the service user, `rclone config` the same two remotes, over the same bucket, with a limited key for this bucket (the `locked-server` credentials you kept on your computer from step 4, or a new limited key made in Cloud Manager): a plain s3 remote `locked-s3` (endpoint `fr-par-1.linodeobjects.com`) and a crypt remote `locked-secret` with `remote = locked-s3:<bucket>`. **The crypt remote needs BOTH escrowed secrets from the password manager**, the passphrase (`password`) and the salt (`password2`): answer "type my own" at both prompts. Without both, nothing decrypts. Leave the crypt remote's filename-encryption options at the defaults step 5 used: they must match the original, or the listing shows nothing decodable.
3. Confirm the off-box backup is intact: `BACKUP_REMOTE=locked-secret: scripts/verify-db-backup.sh` → expect `RESTORE VERIFY: PASS`.
4. Stop the service. Restore the **newest** copy into place:

   ```bash
   T="$(mktemp -d -p pipeline-output)"            # on the same filesystem as the live file (/tmp may be a small RAM disk)
   S="$(date -u +%Y%m%dT%H%M%SZ)"                 # the UTC stamp the broken file is set aside under
   NAME=$(rclone lsf --files-only locked-secret: | grep '^sessions\.' | sort -r | head -1)
   echo "$NAME"                                   # check it is the copy you expect, then run the next command
   rclone copyto "locked-secret:$NAME" "$T/$NAME" \
     && gunzip -c "$T/$NAME" > "$T/sessions.db" \
     && chmod 600 "$T/sessions.db" \
     && { [ ! -e pipeline-output/sessions.db ] || mv pipeline-output/sessions.db "pipeline-output/sessions.db.broken-$S"; } \
     && { [ ! -e pipeline-output/sessions.db-wal ] || mv pipeline-output/sessions.db-wal "pipeline-output/sessions.db.broken-$S-wal"; } \
     && { [ ! -e pipeline-output/sessions.db-shm ] || mv pipeline-output/sessions.db-shm "pipeline-output/sessions.db.broken-$S-shm"; } \
     && mv "$T/sessions.db" pipeline-output/sessions.db \
     && echo "RESTORED" \
     || echo "FAILED: stop. If the download or unzip failed, the live file is untouched; otherwise look for pipeline-output/sessions.db.broken-$S*."
   rm -rf "$T"
   ```

   Run the block from the repository root. The chain is mechanical: the broken live file and its side files are set aside (renamed, never deleted, under the names SQLite pairs together) and the restored file moved in only if the download **and** the unzip both succeeded (the crypt remote decrypts on read). On a fresh box with no live file there is nothing to set aside. Read the last line: `RESTORED`, or `FAILED`. The restored file is `0600`. Once the restored server is confirmed, delete the `sessions.db.broken-*` files: they hold the same editors' data as the live file.

   `lsf` lists current copies only. If the newest copy you expect is not there (a delete marker may hide it), or the block prints `FAILED`, **stop**: reading an older or hidden copy is for the recovery tool, and putting an older whole copy in place is the owner's decision (below).
5. Restart the server; `/api/health` should return `"ok"` once the next backup writes a fresh heartbeat.

`verify-db-backup.sh` fails loud on every bad outcome — no off-box backup found, download error, `PRAGMA integrity_check` non-ok (openable-but-corrupt *and* structurally corrupt), or a missing core table — each prints a grep-able `RESTORE VERIFY: FAIL (...)` line and exits non-zero. Wire its monthly run into monitoring so a silently-rotting backup is caught before you need it.

**Only the newest copy ever goes in place of `sessions.db`.** `sessions.db` holds the research consent records, and an older copy could bring back a consent that was later withdrawn. Read an older copy beside the live file with `server/scripts/recover-from-backup.js`, run by you in a plain terminal ([Recovering an older copy](#recovering-an-older-copy)). **If an older whole copy ever has to go in place** (the live file is lost and the newest copy is broken, say), **stop: that is your decision, taken at the time.** Every withdrawal made since that copy must be applied again before the server opens it, and no tool does that for you. Even the newest copy can predate a withdrawal made in the last 6 hours (a known gap, not solved here).
