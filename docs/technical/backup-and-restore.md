# Backup & Restore — `sessions.db` and the research file

The research file (`research.db`) has its own job, its own remote and its own rules: see [The research file](#the-research-file-researchdb) below. Nothing described for `sessions.db` may copy it.

**What this protects.** `pipeline-output/sessions.db` holds the editorial work that lives **only** in the database: segment edits, the per-segment version history (`content_versions`), review/approval state, and the **entire terminology glossary**. It is gitignored — the 2-hourly `git-backup.sh` cron backs up rendered *content* under `books/`, but **not** the DB. (`content_versions` holds no snapshots while chemistry's writes are held, register §C203, so the work in that period lives in `segment_edits`.) If `sessions.db` is lost and there is no off-box copy, that human-verified intellectual work is gone. `sessions.db` also contains **PII** (editor emails / display names in `users`), so off-box copies are **client-side encrypted**.

There are two layers (a third, long-lived and locked, is added by [The editorial bucket in Paris](#the-editorial-bucket-in-paris-g120)):
1. **Local** (`scripts/backup-db.sh`, always on): WAL-checkpoint → timestamped copy under `pipeline-output/backups/` → keep the most recent `MAX_BACKUPS` (set in `scripts/backup-db.sh`). Protects against accidental corruption/deletion, but **not** disk/instance loss.
2. **Off-box** (same script, when `BACKUP_REMOTE` is set): encrypt-and-upload each backup to Linode Object Storage via `rclone`. Protects against losing the box.

The Paris tier (`LOCKED_BACKUP_REMOTE`) adds gzipped copies that Object Lock keeps from the server's own key and that expire before 12 months: see [The editorial bucket in Paris](#the-editorial-bucket-in-paris-g120).

## Configuration (environment)

| Var | Read by | Default | Meaning |
|---|---|---|---|
| `BACKUP_REMOTE` | `backup-db.sh`, `verify-db-backup.sh` | *(unset → off-box skipped)* | An `rclone` **crypt** remote path, e.g. `secret:`. **Must end in `:` or `/`** — the script fails loud (`exit 5`) otherwise, because a missing separator munges the object name and silently breaks retention. Since the crypt remote already points at the bucket, `secret:` *is* the bucket root; a subpath form must still carry the trailing slash (`secret:sub/`). |
| `BACKUP_REMOTE_KEEP` | `backup-db.sh` | `BACKUP_REMOTE_KEEP`'s fallback in `scripts/backup-db.sh` | How many most-recent objects to keep off-box (older ones pruned). |
| `LOCKED_BACKUP_REMOTE` | `backup-db.sh`, `recover-from-backup.js` | *(unset → Paris skipped)* | The Paris **crypt** remote (`locked-secret:`). **Must begin with `locked` and end in `:` or `/`**, else `exit 5`. Uploads the gzipped copy; the bucket's settings, never a flag, lock it. London's `BACKUP_REMOTE` must **not** begin with `locked`. |
| `LOCKED_BACKUP_S3` | `backup-db.sh` | *(required when `LOCKED_BACKUP_REMOTE` is set)* | The raw S3 path under that crypt remote (`locked-s3:<bucket>/`), for version listings and deletes. **Must end in `:` or `/` and name a different remote** than `LOCKED_BACKUP_REMOTE`, else `exit 5`: the crypt value pasted here would upload unencrypted into a bucket where nothing can be removed. |
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

During the move to Paris the backup line also carries `LOCKED_BACKUP_REMOTE=locked-secret: LOCKED_BACKUP_S3=locked-s3:<bucket>/`, and a second monthly line tests `BACKUP_REMOTE=locked-secret:`. After the move `BACKUP_REMOTE` is dropped (Step 8 of the Paris section). The values printed by `install-cron.sh` are pinned against the real guards by `scripts/__tests__/backup-db.test.mjs`.

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

**What it is.** A second off-box tier for `sessions.db`, in a **new bucket in Paris with Object Lock**, so that a copy cannot be deleted by the server for its first months and is gone for good before 12 months have passed (the consent text's "up to 12 months"). Design and reasons: [the G1.20 design](../superpowers/specs/2026-11-27-g120-editorial-backups-design.md). This section holds only what you type, and the read-back that proves each command took. London (`BACKUP_REMOTE`) keeps running untouched until step 8.

**Where each command runs.**
- **Your own computer** (steps 1 to 3, and the AWS CLI parts of step 6): the AWS CLI, with the **unlimited** key you make in Cloud Manager. That key **never goes on the server.** Console-only setup cannot do this: Cloud Manager can neither enable Object Lock nor show or set versioning or lifecycle rules.
- **The server** (steps 5, 6 and 8): `rclone` only. Production has no `aws` and no `s3cmd`.

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

The read-back must show `"Mode": "COMPLIANCE"` and `"Days": 3`. Three days is longer than the probe's lifecycle window below, which the probe needs.

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

The read-back must show both rules. Note whether the second rule (`ExpiredObjectDeleteMarker`) came back: if Akamai dropped it, kept delete markers are harmless (no bytes, an encrypted name, and the job's age test skips them). If the AWS CLI call is refused outright, Akamai documents `s3cmd setlifecycle` for the same rules as the fallback.

### Step 4. The server's key

In Cloud Manager, make an access key limited to this bucket only, with **read_write**. Under COMPLIANCE such a key can add versions and cannot delete one while it is locked. Configure it on your computer as a second AWS profile, `locked-server` (`aws configure --profile locked-server`), because the probe uses it.

Read back in Cloud Manager that the key lists this bucket and no other.

### Step 5. On the server: the two rclone remotes

Run the interactive `rclone config`, not `rclone config create`, which would put the key and the passphrase in the shell's history:

- a plain **s3** remote **`locked-s3`**: provider Linode (or Other), the **limited** key from step 4, endpoint `fr-par-1.linodeobjects.com`;
- a **crypt** remote **`locked-secret`** wrapping it: `remote = locked-s3:<bucket>`. **Its name must begin with `locked`**: the job refuses any other name for this remote (exit 5), and that prefix is also what keeps London's count-based prune from ever reaching this bucket. **Only the crypt remote may begin with `locked`.**

🔴 **The passphrase goes into the password manager BEFORE any upload.** This is the same gate as for the other remotes, and sharper here: a copy nobody can decrypt is still locked, and still billed, for its whole life. Generate the passphrase (and the salt, `password2`) in the password manager first, then answer "type my own" at both prompts. Then run `chmod 600` on `rclone.conf` (`rclone config file` prints where it is).

Prove the escrow before the first upload, exactly as for the research remote (see [The research file](#the-research-file-researchdb), setup step 3), with `[locked-secret]` in place of `[research-secret]` in the `awk`. Both lines must print `MATCH`; type a wrong value once and expect `DIFFERENT`.

Read back that both remotes work:

```bash
rclone backend versioning locked-s3:<bucket>   # nothing after the bucket name: a trailing word would SET it
rclone lsf locked-secret:                      # an empty bucket: prints nothing, exits 0
```

The first must print `"Enabled"`.

### Step 6. The live probe

Local tests cannot prove a lock (rclone's local remote has none), and a real copy locked for months cannot be removed, so the lock is proved here, with throwaway objects and the 3-day lock. Run it in one sitting, early in the day, and keep a note of each time you type.

The probe's pass or fail has one decisive question, **step 6.5**. Everything before it only records what happens.

**6.1 Upload object A through the crypt remote, and read it back.** This also proves that rclone's encrypted upload is accepted by a bucket with Object Lock.

```bash
echo probe-A1 > /tmp/probe-A.txt
rclone copyto /tmp/probe-A.txt locked-secret:probe-A.txt
rclone lsf locked-secret:
rclone cryptdecode --reverse locked-secret: probe-A.txt
```

`lsf` must list `probe-A.txt`. `cryptdecode` prints A's encrypted name: call it `<A-enc>`. List its version:

```bash
rclone lsjson --s3-versions locked-s3:<bucket>/
```

Find the entry for `<A-enc>`; its name ends in a version suffix, `-v<date>-<time>-<ms>`. That whole name is `<A-enc-v1>`.

**6.2 Try to delete A's version by its versioned name. Expect a refusal.**

```bash
rclone deletefile --s3-versions locked-s3:<bucket>/<A-enc-v1>
rclone lsjson --s3-versions locked-s3:<bucket>/
```

The delete must fail (an `AccessDenied` or similar error), and the second command must still list `<A-enc-v1>`. If the delete **succeeds**, the lock does not protect against the server's key: stop here, and you decide before anything else is done.

**6.3 Upload A again under the same name.**

```bash
echo probe-A2 > /tmp/probe-A.txt
rclone copyto /tmp/probe-A.txt locked-secret:probe-A.txt
rclone lsjson --s3-versions locked-s3:<bucket>/
```

Expect two entries for `<A-enc>`: a new version, with the first still listed.

**6.4 Try to change the lock and the lifecycle with the server's key.** These use the AWS CLI with the **limited** key. They send the values already set, so a success changes nothing.

```bash
aws s3api put-object-lock-configuration --bucket <bucket> \
  --object-lock-configuration '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":3}}}' \
  --profile locked-server --endpoint-url <endpoint>
aws s3api put-bucket-lifecycle-configuration --bucket <bucket> --lifecycle-configuration file://probe-lifecycle.json --profile locked-server --endpoint-url <endpoint>
```

Write down for each whether it was refused. A refusal is the good answer. If either was **allowed**, it is a residual risk, to go in the register: the job's own delete rule and the `offbox_backup_cap` check below are its detectors.

**6.5 The go/no-go: a plain delete must not destroy a locked copy.** Upload object B, then delete it plainly, as a buggy script would. Write down the time before the delete (UTC): call it `<before-delete>`, in the form `2026-11-30T09:15:00`.

```bash
echo probe-B > /tmp/probe-B.txt
rclone copyto /tmp/probe-B.txt locked-secret:probe-B.txt
date -u +%Y-%m-%dT%H:%M:%S        # this is <before-delete>
rclone deletefile locked-secret:probe-B.txt
```

Read back at once:

```bash
rclone lsf locked-secret:                                           # B is not listed: hidden behind a delete marker
rclone lsf --s3-version-at <before-delete> locked-secret:           # B is listed: still there
```

Now wait: **more than two midnights (bucket-local time), and less than 3 days from B's upload**. Two midnights are enough for the 1-day rules to have fired twice, and 3 days is where B's lock ends. Between about 48 and 70 hours after you uploaded B is right. Then run the same command again:

```bash
rclone lsf --s3-version-at <before-delete> locked-secret:
```

🔴 **B must still be listed.** If it is, the plain delete hid B, the lifecycle did not destroy it, and the layout is sound: go on. **If B is gone, STOP.** Akamai's lifecycle ignored the lock, so this layout does not survive a bad script. Do not upload a real copy and do not go on to step 7: the decision is yours, and the next step is a new design.

**6.6 Confirm the job's own listing sees all of it.** This is the exact listing `scripts/backup-db.sh` takes; it must show hidden versions too:

```bash
rclone lsjson --s3-versions --s3-version-deleted --use-server-modtime locked-s3:<bucket>/
```

Expect both versions of A, B's version, and B's delete marker (an entry of size 0).

**6.7 After the 3-day locks have ended: delete versions, by name, with the server's key. Expect success.** The job's delete of a copy past its age can be two steps on this bucket, and both must work here: a copy that is still *current* past 356 days first gets a delete marker, and the next run deletes the now-versioned name. Prove both:

```bash
rclone deletefile locked-s3:<bucket>/<A-enc>                      # plain delete: A's current copy gets a delete marker
rclone lsjson --s3-versions locked-s3:<bucket>/                    # A's two versions are now both versioned names
rclone deletefile --s3-versions locked-s3:<bucket>/<A-enc-v1>     # delete one version by its versioned name
rclone lsjson --s3-versions locked-s3:<bucket>/
```

The last listing must no longer show `<A-enc-v1>`. (If the lifecycle rule has already removed some entries, work on whatever is left; the point is to see one plain delete followed by one versioned delete succeed.)

**6.8 Leave the rest to the lifecycle rule.** Do nothing more. About two days later:

```bash
rclone lsjson --s3-versions --s3-version-deleted locked-s3:<bucket>/
```

It must be empty, or hold only delete markers (size 0). That proves the rule deletes on this bucket. Do not upload a real copy before it is empty.

### Step 7. After the probe: the real settings

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

The read-back must show `"Days": 355` and `"NoncurrentDays": 1`. Then the **interim lock, 30 days**:

```bash
aws s3api put-object-lock-configuration --bucket <bucket> \
  --object-lock-configuration '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":30}}}' \
  --profile locked-admin --endpoint-url <endpoint>
aws s3api get-object-lock-configuration --bucket <bucket> --profile locked-admin --endpoint-url <endpoint>
```

The read-back must show `"Days": 30`. Record both read-backs in the register.

⚠️ **What the interim lock does not cover.** Until step 9, a copy is protected from the server for its first 30 days only. After that, anything holding the server's key can delete it by version. It is the price of keeping the door open for a shorter cap from the data protection officer. The full protection starts at step 9.

### Step 8. Switch the cron from London to Paris

1. **Set both remotes.** `scripts/install-cron.sh` prints the backup line with `BACKUP_REMOTE`, `LOCKED_BACKUP_REMOTE` and `LOCKED_BACKUP_S3`. Replace `BUCKET` in `LOCKED_BACKUP_S3` with `<bucket>` (the value must still end in `/`). Install it with `crontab -e` and read it back with `crontab -l`.
2. **A hand run.** From the repository root, as the service user, with the same three values:

   ```bash
   BACKUP_REMOTE=secret: LOCKED_BACKUP_REMOTE=locked-secret: LOCKED_BACKUP_S3=locked-s3:<bucket>/ scripts/backup-db.sh; echo "exit $?"
   ```

   Expect `Locked off-box upload OK; heartbeat: …` and `exit 0`. The exit codes, if not: 3 rclone missing, 4 an upload failed, 5 a setting is malformed or forbidden, 6 paused because an editorial retention step is due (nothing was sent to Paris), 7 the rate guard (8 copies in 24 hours) refused or the listing before the upload failed, 8 the status check is not ok. Then read the status file, which holds ages and counts only:

   ```bash
   cat pipeline-output/backups/.offbox-locked-status.json
   rclone lsf locked-secret:
   ```

   The new `sessions.<stamp>.db.gz` must be listed.
3. **The restore test against Paris.**

   ```bash
   BACKUP_REMOTE=locked-secret: scripts/verify-db-backup.sh
   ```

   Expect `RESTORE VERIFY: PASS` (it reads the newest `.db.gz` copy, unzips and integrity-checks it).
4. **Health reads ok.**

   ```bash
   curl -s http://localhost:3000/api/health
   ```

   `checks.offbox_backup_cap` must read `"ok":true,"state":"ok"`. ⚠️ **`"state":"not-configured"` also reads `ok:true`**; it means the status file does not exist, so it is *not* a pass here. The states are: `ok`; `stale` (the job has not written the status file within `OFFBOX_BACKUP_STALE_HOURS`); `unreadable` (the file is malformed); `listing-invalid`, `listing-empty` (the bucket's listing could not be read, or was empty); `uploaded-not-seen` (the copy just uploaded was not in the listing); `over-cap` (a copy is older than **358 days**, so both the lifecycle rule and the job's own delete failed). A failing state names what to look at: the status file above, and `pipeline-output/backup-db.log`. `checks.offbox_backup` is the heartbeat of the last successful locked upload.
5. **Drop London.** Edit the cron line to remove `BACKUP_REMOTE=…` from the backup line and the first monthly verify line (the one for `secret:`); read it back with `crontab -l`. Then delete the London editorial bucket (precondition 1), and remove the `secret` remote from `rclone config`. Its copies are at most about 7.5 days old, so nothing needs carrying over.
6. **Re-read the research bucket (G-1b).** G1.20 is what turned versioning on for the editorial bucket, so confirm the research bucket still reads unversioned:

   ```bash
   rclone backend versioning linode-research:<research-bucket>
   ```

   It must still print `"Unversioned"`.

### Step 9. When the consent text is listed: the full lock (350 days)

Do this when, and only when, a consent text is listed in `APPROVED_CONSENT_TEXTS` (`server/lib/researchConsentText.js`) on `main`. It applies to new copies only; the copies already there keep their 30-day locks.

```bash
aws s3api put-object-lock-configuration --bucket <bucket> \
  --object-lock-configuration '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":350}}}' \
  --profile locked-admin --endpoint-url <endpoint>
aws s3api get-bucket-versioning --bucket <bucket> --profile locked-admin --endpoint-url <endpoint>
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

It takes the remote from `--remote`, or from `LOCKED_BACKUP_REMOTE`. `--file <copy>` reads a local copy instead. Times without a timezone are UTC, like the copies' names. A copy a plain delete has hidden behind a delete marker is still recoverable: add `--as-of <a time before the delete>` and the bucket is read as it was then. Exit 0 means rows were printed; 1 means no copy in range or no rows; 2 means a usage error, or `--file` was the live database.

Put recovered wording back through the editor as an ordinary edit, so it is reviewed and recorded like any other.

## Restore runbook

To recover `sessions.db` onto a fresh box:

1. Install `rclone` + `sqlite3`.
2. `rclone config` the same `secret:` crypt remote (same underlying bucket + **the same passphrase**).
3. Confirm the off-box backup is intact: `BACKUP_REMOTE=secret: scripts/verify-db-backup.sh` (or `BACKUP_REMOTE=locked-secret:` for Paris) → expect `RESTORE VERIFY: PASS`.
4. Restore the **newest** copy into place: `rclone lsf secret: | grep '^sessions\.' | sort -r | head -1` to find it, then `rclone copyto "secret:<that-file>" pipeline-output/sessions.db` (the crypt remote decrypts on read). A Paris copy is gzipped (`.db.gz`): fetch it to a temporary file and `gunzip -c <file>.db.gz > pipeline-output/sessions.db`.
5. Restart the server; `/api/health` should return `"ok"` once the next backup writes a fresh heartbeat.

`verify-db-backup.sh` fails loud on every bad outcome — no off-box backup found, download error, `PRAGMA integrity_check` non-ok (openable-but-corrupt *and* structurally corrupt), or a missing core table — each prints a grep-able `RESTORE VERIFY: FAIL (...)` line and exits non-zero. Wire its monthly run into monitoring so a silently-rotting backup is caught before you need it.

**Only the newest copy ever goes in place of `sessions.db`.** `sessions.db` holds the research consent records, and an older copy could bring back a consent that was later withdrawn. Read an older copy beside the live file with `server/scripts/recover-from-backup.js`, run by you in a plain terminal ([Recovering an older copy](#recovering-an-older-copy)). **If an older whole copy ever has to go in place** (the live file is lost and the newest copy is broken, say), **stop: that is your decision, taken at the time.** Every withdrawal made since that copy must be applied again before the server opens it, and no tool does that for you. Even the newest copy can predate a withdrawal made in the last 6 hours (a known gap, not solved here).
