# G1.20 — the editorial database's long-lived backups: design (DRAFT 2026-11-27)

> 📝 **DRAFT, awaiting [USER]'s approval.** Banner-frozen from approval: amended only by dated notes.
> Not status: open work and its state live in the active register.

**Register:** the Skerfur plan's G1.20 row (`docs/plans/2026-10-23-skerfur-development-plan.md`, §3.1), the register's
2026-11-19 census entry (G1.20 "partly built": the research half shipped with PR4, #651), and G1.4's five consent
preconditions in the 2026-11-08 PR4 entry, of which this is **precondition 3**. **The register owns status; this
document owns the design.**

**Provenance.** Measured 2026-11-27 at `main` `33f7b662a`:
- production, read-only over ssh: database size, two bare row counts, the rclone version and its S3 flags, and the
  compressed size of one local copy;
- the code paths named below;
- Akamai's Object Storage documentation, read the same day: pricing, Object Lock, lifecycle policies, versioning and
  endpoint types.

No row, name or editing text was read.

## 1. Intent

[USER], 2026-11-27: the backups should save the editors' work from **accidental changes and deletions**. While many
chapters are being worked on, it should be possible to get back **a particular segment as it stood a while back**.
And the copies must **survive server incidents**: a bad script, or someone breaking into the server.

**Why backups carry this today.** For chemistry, the only book in scope, the editors' work lives only in
`sessions.db`:

- **No snapshots, no rollback, nothing in git.** Writes into the faithful files are held (`server/lib/applyHold.js`,
  register §C203). So `content_versions` takes no snapshots, the head editor's rollback is refused, and nothing
  reaches git.
- **Pending edits are overwritten in place.** Re-saving a pending edit updates its row
  (`segmentEditorService.saveSegmentEdit`), so only the latest wording of a pending edit survives.
- **Reviewed edits stay**, but only until the retention dates (G1.15(b)).

Measured on production: 163 `segment_edits` rows, 83 `content_versions` rows (all older than the hold), and a 54.6 MB
file.

So a backup is the only way back to an earlier wording. The spacing and the age of the copies decide what can be
recovered.

**The consent cap.** G1.4's draft consent text promises that copies of the editorial database are kept for **up to 12
months**, encrypted, in Paris. The draft is private (`docs/grants/`); its items on backups are not quoted here.
Today's copies live about 7.5 days (30 copies, one every 6 hours, local and off-box), so the cap holds only by
accident. Precondition 3 asks for a design that fits it on purpose.

## 2. Goals, non-goals, anti-goals

**Goals**
- Every 6-hourly copy is kept off-box for about 12 months. Any segment can then be recovered as it stood at any
  6-hour point in the last year.
- No one can delete or overwrite an off-box copy before it expires. That includes anything running on the server and
  the server's own key.
- The 12-month cap holds even if the server is dead, and a check on the server proves it.
- A copy holds live rows only.
- One segment can be recovered from an old copy without replacing the live database.

**Non-goals**
- Keeping every save of a pending edit as its own version inside the tool. That would serve the "segment from a
  while back" case better than any backup. It is a separate change, logged in the register (§8).
- The research file's backups: their own bucket, 7 days, unversioned. Untouched, except that G-1b is re-read (§7).
- Creating the Paris buckets and retiring London. That is precondition 1, board item s04, done by [USER]. This design
  says which settings the editorial bucket must have (§4.1).
- The gap between a withdrawal and a whole-file restore. It exists today and is logged in the register (§4.5, §8).

**Anti-goals** (each would make this a failure even if it ran)
- A copy that outlives the consent's cap.
- A lock date computed by the script. Under compliance mode a wrong date is permanent.
- A whole-file restore of an old copy.
- A check that reads an empty or failed listing as healthy.

## 3. Approaches

Locking makes copies survive the server. Each copy is locked as it is uploaded, and until its date nothing can delete
or overwrite it, including the server's own key. Two layouts were weighed:

- **A. Thinned copies, each locked for as long as it is kept.** 6-hourly copies kept 7 days, the first copy of each
  day 30 days, and the first of each month 12 months: about 70 copies, ~1.2 GB.
  - Costs: logic to sort copies into tiers, a clean-up that works with locked versions, and coarse old restore
    points. A pending wording overwritten three months back is recoverable only if it existed on the 1st of that
    month.
- **B. Every copy kept and locked for about 12 months** (**chosen by [USER], 2026-11-27**). Each copy gets the same
  lock from the bucket's default. The server does no thinning and no clean-up. A bucket lifecycle rule deletes each
  copy at the end of its life. That is about 1,460 copies a year, ~24 GB at today's size.
  - Why chosen: it gives the finest restore points (every 6 hours, back a year), which is what [USER] wants the
    backups for. And it is the least code, so it has the fewest ways to fail without anyone noticing.

**Dropped**
- **Versioning without a lock.** The server's key can still delete old versions. It survives a bad script, not a
  break-in.
- **A second machine that pulls the copies.** Another server to run and secure, and it changes where the consent text
  says the copies are kept.

**Cost (asked by [USER], answered 2026-11-27).** Object Storage is $5 a month with 250 GB included, and the account
already pays it for today's off-box backups. Above 250 GB it costs $0.02/GB-month, and Akamai says that rate can vary
by data centre. There are no request charges. Every stored version counts toward the bill.

At today's size B uses ~24 GB once full (1,460 copies × ~17 MB compressed). It passes 250 GB only if a compressed copy
reaches ~170 MB, about ten times today's database. Restores draw on the account's 1 TB of free transfer a month.

## 4. The design

### 4.1 The bucket (the settings s04 must use)

- **A new editorial bucket in Paris, created with Object Lock enabled.**
  - Object Lock can only be enabled when a bucket is created, and enabling it turns versioning on.
  - Akamai's Cloud Manager cannot do it. It is done through the S3 API (`aws s3api create-bucket
    --object-lock-enabled-for-bucket`) from [USER]'s computer.
  - It is a **different bucket from the research one**. That bucket must stay unversioned, with no Object Lock, so
    that a deleted research copy really disappears within 7 days (`docs/technical/backup-and-restore.md`, the
    research setup; G-1b).
- **Endpoint:** `fr-par` (E1).
  - *(Claude's call.)* It is generally available, and Akamai documents Object Lock on every endpoint type, E0–E3.
  - `fr-par-2` (E3) is "limited availability", reached by a support ticket. Either fits the consent text's
    "Paris".
- **Default retention: COMPLIANCE mode.** Akamai: until the retention period expires, no one, including Akamai, can
  delete a locked version, overwrite it or shorten its retention.
  - **The lock length is a bucket setting, never a date the script computes.** The upload carries no lock flags, so a
    date bug in code cannot lock a copy past the cap.
  - A changed default applies to new copies only. Locks already set can never be shortened.
- **The lock length moves through three phases.** [USER] sets each with one command from their computer:

  | Phase | Default retention | Until |
  |---|---|---|
  | Probe | 1 day | the live probe (§4.6) passes |
  | Interim | 30 days | the consent text is listed in `APPROVED_CONSENT_TEXTS` (`server/lib/researchConsentText.js`) |
  | Full | 350 days | for good |

  The interim lock keeps one door open. If the data protection officer settles on a cap shorter than 12 months,
  copies already uploaded can still be removed in time, by shortening the lifecycle rule.
- **The lifecycle rule** is set once, before the first copy:
  - current versions expire at **355 days**;
  - noncurrent versions are deleted after **1 day**.

  Akamai runs lifecycle rules at midnight, bucket-local time, and says a first run may not finish a large bucket. So
  a copy is gone by about day 358, inside the 12-month cap.
  - Akamai documents s3cmd for lifecycle. The AWS CLI's `put-bucket-lifecycle-configuration` is the same S3 call.
  - Each setting is read back with its `get-` command and recorded in the register.
  - *(Claude's call: the three numbers 350 / 355 / 361, the last in §4.3. The lock always ends before the lifecycle
    acts, and every margin stays inside 365 days.)*
- **Keys.**
  - The server gets a **limited read_write key for this bucket only.** Akamai's permission table: under compliance
    such a key can add versions and cannot delete one during its retention.
  - Bucket creation, retention and lifecycle use an unlimited key that never sits on the server.
  - **Unknown:** whether a limited key can change the bucket's lock configuration or lifecycle rule. The live probe
    tests it (§4.6).
- **Encryption.** A new rclone crypt remote wraps the new bucket. **Its passphrase is escrowed in the password manager
  before the first locked upload** (the existing gate). A copy that cannot be decrypted is still locked, and billed,
  for its whole life.

### 4.2 The copy (`scripts/backup-db.sh`)

- **Order unchanged:** the editorial retention runs first, then the copy.
- **The copy is made with `VACUUM INTO`, not `cp` and not the online backup API.**
  - `VACUUM INTO` writes the live rows only. So a deleted row's bytes never ride forward into later copies.
  - The research half measured that better-sqlite3's online backup carries deleted bytes, both in free pages and
    inside pages still in use (`server/scripts/research-backup.js`, its header, decision 25).
  - Without this, a withdrawn editor's loss note could live on in every new copy, long past "up to 12 months" after
    its deletion.
  - **Proven by a sentinel test:**
    - write a row holding a token nothing else can contain, delete it, take a copy, and scan the copy's bytes for the
      token;
    - the control: the same token is found in the live file's bytes after the delete, so the scan can see it.
- **Kept only if sound.** The copy is `0600`, passes `PRAGMA integrity_check` before it is kept, and the local tier
  keeps the newest 30, as today.
- **Upload.**
  - The copy is gzipped (one copy measured 54.6 MB → 16.6 MB) and uploaded as `sessions.<stamp>.db.gz` with
    `rclone copyto` to the new crypt remote.
  - No lock flags: the bucket's default does that.
  - **No remote prune** on this remote. The lifecycle rule owns deletion, and a delete would only add a delete marker.
- **Rate guard.** The upload refuses when the bucket already holds **8 or more copies from the last 24 hours** (twice
  the cron's 4).
  - The refusal is loud and writes no heartbeat.
  - Why: a runaway job's copies cannot be removed for a year.
- **The heartbeat** keeps its meaning: written only after a successful upload.

### 4.3 The oldest-copy check

- **What the job records.** After each upload it lists **every version** in the bucket, noncurrent versions and
  delete markers included. It writes a status file holding:
  - the oldest version's age;
  - the newest version's age;
  - the number of versions;
  - whether the copy it just uploaded is in the listing.
- **Fail closed.** The check is not ok when:
  - the listing failed or is empty;
  - the listing lacks the copy just uploaded;
  - any version is **older than 361 days**.

  The threshold is an enforceable value: a constant in a `server/lib/` file, pinned by a test.
- **Where it shows.** `/api/health` reads the status file and turns `degraded`, and `./scripts/deploy.sh` prints it.
- **Why it matters.** Production cannot read a lifecycle rule (rclone has no command for it). So this check is the
  **only detector of a missing, changed or failed lifecycle rule**.

### 4.4 Restore

- **Rule** *(Claude's call)*: **only the newest copy is ever put in place of `sessions.db`**, for a lost or corrupt
  file. An older copy is only ever read beside the live file.
  - Why: `sessions.db` holds the research consent records (`research_consent`, `research_deletions`,
    `research_capture_losses`). Putting an older copy in place could bring back a consent that was later withdrawn.
  - Today's copies are at most ~7.5 days old. 12-month copies would widen that window from days to a year.
- **One segment from an old copy: a new script in `server/scripts/`.**
  - Given a copy (gzipped or not), a book, a module and a segment id, it decompresses into a `0700` temp directory and
    opens the copy read-only.
  - It prints that segment's rows from `segment_edits` (status, times, editor, text) and `content_versions`, then
    deletes the temp copy.
  - It never opens the live database.
- **[USER] runs it.** It prints editors' text and names, which no Claude Code session may read (CLAUDE.md § Purpose).
  The recovered wording goes back through the editor as an ordinary edit, so it is reviewed and recorded like any
  other.
- **The monthly restore test** (`scripts/verify-db-backup.sh`) learns the `.gz` name and the new remote. It still
  runs monthly.

### 4.5 The withdrawal-versus-restore gap (not solved here)

Even the newest copy can predate a withdrawal made within the last 6 hours. Restoring it would put that consent back.
This gap exists today and is no wider under this design, given the rule in §4.4. It is logged in the register (§8).

### 4.6 The live probe (before the first real copy)

Local tests cannot prove a lock, because rclone's local remote has none. And a test copy locked for months cannot be
removed. So, with default retention at **1 day**, run as [USER] or on their instruction:

1. Upload one test object with the server's key.
2. **Try to delete that version with the server's key. Expect a refusal.**
3. Upload it again under the same name. Expect a new version, with the first still listed.
4. With the server's key, try to change the lock configuration and the lifecycle rule. Record whether each is
   refused. If either is allowed, the register records it as a residual risk, and §4.3's check is its only detector.
5. Confirm §4.3's listing sees all of the above.
6. Raise default retention to 30 days. Then run the first real copy and the restore test.

### 4.7 Moving from London

1. The new remote goes live.
2. A hand run, then the restore test.
3. Health reads ok.
4. The cron line switches to the new remote.
5. The London editorial bucket is deleted (precondition 1). Its copies are at most ~7.5 days old, so nothing needs
   carrying over.

### 4.8 The runbook

`docs/technical/backup-and-restore.md` gains every command [USER] runs, each followed by the read-back that proves it:

- creating the bucket with Object Lock;
- the three retention phases;
- the lifecycle rule;
- the limited key and the crypt remote;
- the escrow gate;
- the live probe;
- the move from London;
- the restore rule and the one-segment script.

The old "One-time setup" section's console-only instructions no longer apply to the editorial bucket.

## 5. Constraints

- **Public repository:** this file names no grant or fund, and quotes no private draft.
- **No Claude Code session reads a copy,** a restored file or the editing rows in one. Tests use synthetic databases;
  production checks are bare counts, sizes and versions.
- **Production has rclone v1.75.0 only,** with no `aws` and no `s3cmd`. Cloud Manager cannot show or set versioning,
  Object Lock or lifecycle. So every bucket setting is made from [USER]'s computer.
- **The research file is never copied by this job.** `backup-db.sh` copies `sessions.db` only.
- **The 12-month cap:**
  - lock 350 days, lifecycle 355 days (current) + 1 day (noncurrent), check at 361 days, all inside 365;
  - a copy taken before a retention step holds what that step removes until the copy expires. That fits the consent
    text's "last copies gone by" date for named data (31 December 2031 = the 2030 step + 12 months).

## 6. Left to the builder

- Whether the copy and the check live in shell or in a Node script beside `research-backup.js`.
- The exact health-check shape, and whether it extends `checks.offbox_backup` or adds a check.
- How versions are listed: through the crypt remote, or on the underlying S3 remote by modification time if crypt
  hides version suffixes.
- Names, the gzip level and the test harness. The existing tests use a crypt remote over a local one; a fake rclone on
  `PATH` can record the arguments.
- How the rate guard counts: a remote listing or a local record.

## 7. Verification

- **Unit and script tests:**
  - the sentinel (§4.2) with its control;
  - the rate guard refusing at 8;
  - the check failing on an empty listing, a failed listing, a missing new copy and a too-old version, with a passing
    control;
  - the upload carrying no lock flags;
  - the one-segment script never opening the live path.
- **The `verify-research-withdrawal` skill**, because the change touches the `sessions.db` backup and its runbook.
- **The live probe (§4.6)**, the restore test, and **G-1b re-read on the research bucket**: it must still read
  `"Unversioned"`. The register asks for this once G1.20 turns versioning on for the editorial bucket.
- **Precondition 3 is discharged when all of these hold:**
  - the code is merged and deployed;
  - the bucket is set up as in §4.1;
  - the check reads ok on the full 350-day lock, or on the interim lock with the switch recorded as the last step
    before the consent text is listed.

## 8. Logged out of scope (in the register when this design is approved)

- **Every save of a pending edit kept as its own version in the tool**, with a page that shows a segment's earlier
  versions. It serves "a segment from a while back" without any backup.
- **The withdrawal-versus-restore gap** (§4.5).
