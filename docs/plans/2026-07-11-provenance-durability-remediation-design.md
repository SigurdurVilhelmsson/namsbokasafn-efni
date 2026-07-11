# Provenance & Durability Remediation — Design

**Date:** 2026-07-11
**Status:** Design approved in-session; execution plan to follow (writing-plans)
**Source findings:** [`docs/audit/2026-07-11-product-provenance-durability-audit.md`](../audit/2026-07-11-product-provenance-durability-audit.md) — the top three by irreversibility × likelihood.
**Register tickets:** PROV-2, PROV-1 in [`docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`](2026-06-28-pipeline-architecture-implementation-plan.md).

## Objective

Turn the three highest-leverage provenance/durability gaps into enforced-in-code guarantees, without disturbing the well-built content tiers. Three independent tracks, one PR each (per the project's one-PR-per-item convention), executable in priority order A → B → C.

## Decisions locked in-session (2026-07-11)

| Decision | Choice |
|---|---|
| Off-box backup destination | **Linode Object Storage** (S3-compatible, same provider), client-side encrypted, via `rclone`. Code stays destination-agnostic via config. |
| MT edit-lock trigger | **First saved segment edit** (first `segment_edits` row for the module). `loadModuleForEditing` is overloaded (concordance/propagation/dashboard) and read-only, so it is *not* the trigger. |
| `check-source-updates.js` remediation | **Delete the `update` verb** (keep read-only `check`/`diff`). |

## Global constraints (bind every track)

- **Robustness over expedience** ([[feedback-robustness-over-expedience]]): one real code path; fail loud; no escape hatch reaches prod; split refactor from enforcement.
- **Read/write boundaries** (CLAUDE.md): `01-source/` and `02-mt-output/` stay READ-ONLY to the editorial pipeline; this work *adds guards*, it does not add new writers to them (Track C writes a *sibling marker file*, never the MT segment content).
- **Path resolution:** resolve resource paths against something intrinsic (`import.meta.url`/`__dirname` for files, `resolveDbPath()` for the DB) — never `process.cwd()`.
- **Tests authoritative locally:** `npm test` from repo root is the gate (no branch protection).
- **Node 22.x / npm 10.x**; server runs cwd=`server/`.

---

## Track A — `sessions.db` off-box, restore-tested backup (PROV-2)

**Problem.** Edit history, `content_versions`, TM relationships, and the entire glossary live in `sessions.db` (gitignored). `scripts/backup-db.sh` copies it locally (WAL checkpoint → timestamped → keep-30) and `deploy.sh` runs it, but copies land on the **same disk/instance**, never leave the box, the 6h cron is unverifiable from the repo, and nothing restore-tests a backup. `sessions.db` contains **PII** (`users.email`, `display_name`, provider IDs — migration 006/022), so an off-box copy must be encrypted.

**Design.** Five units, all additive to the existing script family.

1. **Encrypt-then-upload** (extend `scripts/backup-db.sh`). After the local timestamped copy, if `BACKUP_REMOTE` is set, upload the backup to it via `rclone` using a **crypt remote** (client-side encryption — plaintext never leaves the box; the encryption passphrase lives in the rclone crypt config (not a script env)). If `BACKUP_REMOTE` is unset, **log a clear warning and skip the upload** (local-only still works; dev/CI unaffected). Upload failure is **loud**: `log.error`-equivalent to stderr and a **non-zero exit**, and the heartbeat (unit 4) is *not* written.
2. **Remote retention.** Prune the remote to the N most-recent copies (mirror local keep-30), via `rclone`. Failure to prune is a warning, not fatal (the upload already succeeded).
3. **`scripts/verify-db-backup.sh`** (new). Downloads the latest off-box backup, decrypts it to a temp file, opens it with `sqlite3`, runs `PRAGMA integrity_check` **and** a sanity query (non-zero row counts on `segment_edits`, `terminology_translations`, `content_versions`), and prints PASS/FAIL with a non-zero exit on FAIL. This is the "restore-tested" guarantee — proves the encrypted off-box copy is actually recoverable.
4. **Staleness heartbeat.** On each successful off-box upload, write `pipeline-output/backups/.last-offbox-backup` (ISO timestamp). Extend `GET /api/health` to report `offbox_backup_age_hours` (from that file's mtime/content) and flag `stale` when older than a threshold (default 26h — one missed 6h cycle + margin). This makes a silently-stopped cron observable instead of discovered in a disaster.
5. **Docs & ops** (`docs/technical/` + script headers). The crontab lines (backup 6-hourly, `verify-db-backup.sh` monthly), the env vars, one-time Linode Object Storage bucket + rclone-crypt setup, and a **restore runbook** (how to recover `sessions.db` from an off-box copy onto a fresh box).

**Interfaces.**
- Config (env): `BACKUP_REMOTE` (rclone `remote:bucket/path` crypt remote; passphrase in rclone config), optional `BACKUP_REMOTE_KEEP` (default 30), `OFFBOX_BACKUP_STALE_HOURS` (default 26).
- New file: `pipeline-output/backups/.last-offbox-backup` (gitignored).
- Health field: `health.checks.offbox_backup = { age_hours, stale: bool }`.

**Testing.** `verify-db-backup.sh` is itself the restore integration test. The bash upload/prune/heartbeat logic gets a focused test that runs the script against a temp DB and a **local `rclone` remote** (a temp dir configured as an rclone `local`+`crypt` remote), asserting: encrypted object appears, decrypts+opens clean, heartbeat written, unset-`BACKUP_REMOTE` skips with warning + zero exit, upload failure → non-zero exit + no heartbeat. The health-field addition gets a Vitest server test (stale vs fresh vs missing heartbeat).

**Prerequisite the lead supplies (documented, not code):** create the Linode Object Storage bucket, an access key, and set `BACKUP_REMOTE` (+ the rclone crypt config) in the prod environment + crontab. The plan delivers everything up to that boundary and a runbook for it.

---

## Track B — delete the second `01-source/` overwrite path (PROV-1)

**Problem.** `tools/check-source-updates.js update <moduleId>` writes upstream CNXML over `01-source/` (`:647`) with only a `.bak` — no guard, no confirmation, no manifest check, no test. It is a second, independent overwrite path the F2 remediation (PR #218) never considered; the F2 design doc wrongly calls `download-source.js` *"the single real overwrite path."* On the legally load-bearing CC-BY source.

**Design.**
1. **Remove the `update` verb.** Delete `cmdUpdate` and its command dispatch from `tools/check-source-updates.js`; keep read-only `check`/`diff`. Update the file header/usage text so `update` no longer appears. (Rationale: the project's CC-BY-freeze policy means pulling upstream over local source is never desired; removing the capability is safer than guarding it.)
2. **Correct the record.** Add a note to `docs/plans/2026-07-02-f2-source-guard-design.md` that `check-source-updates.js update` was a second overwrite path, now removed — retiring the "single real overwrite path" claim.
3. **Durable guard test** (`tools/__tests__/`). Mirror `server/__tests__/fetchSourceGuard.test.js`: statically assert that **no file under `tools/` contains a filesystem-write call whose destination resolves into `01-source/`, except `download-source.js`'s guarded `organizeSourceFiles` path**. This catches a *third* future writer, not just this one — it makes "only one, guarded, writer of `01-source`" a tested invariant.

**Interfaces.** No runtime API change. Removes a CLI verb; adds a test.

**Testing.** The guard test above (fails if any unguarded `01-source` writer is introduced). A small test asserting `check-source-updates.js` still exposes `check`/`diff` and that invoking `update` errors as unknown.

---

## Track C — MT edit-lock (#2)

**Problem.** `02-mt-output` must stay pure MT and be re-runnable **only until a module is opened for editing**, then lock. The producer `api-translate.js` is state-blind (guard = `skip: exists && !--force`, zero references to editing state), so `--force` can overwrite the baseline even after editing — destroying the MT text the study compares against — while the default skip over-blocks legitimate pre-edit re-runs.

**Design.** A per-module marker file bridges the DB world (server) and the file world (CLI).

1. **Marker.** `books/{book}/02-mt-output/{chNN}/{moduleId}-segments.locked` — a small JSON (`{ lockedAt, reason: 'editing-started', firstEditId }`). **Per-module + additive** so it rides the existing `git-backup.sh` cron with no shared-file merge conflict (a per-book JSON would need `merge=ours` like `translation-errors.json`). It is a *sibling* of the MT segment file, never the segment content itself — the READ-ONLY-to-pipeline rule for `02-mt-output` content is preserved.
2. **Set (server).** In `segmentEditorService.saveSegmentEdit`, when the **first** `segment_edits` row for a `(book, chapter, module)` is created, write the marker if absent — idempotent (write-once; never rewritten on subsequent edits). Marker write failure is logged loud but does **not** block the edit save (the edit is the user's work; the lock is a guard around a separate asset — but a failure to lock is surfaced, not swallowed).
3. **Enforce (producer).** In `tools/api-translate.js`, before writing a module's `02-mt-output`, check for the marker:
   - **Locked → refuse, even with `--force`** (the absolute invariant), with a clear per-module message and a summary count.
   - **Unlocked → current behavior** (`--force` remains the accident-guard for re-running an existing file; default still skips existing without `--force`).
   - **Indeterminate** (marker present but unreadable/corrupt) → **refuse** (a needless skip is cheap; clobbering an edited baseline is not).
4. **Backfill (one-time).** A script (or a documented `api-translate` pre-step) that writes markers for every module already having `segment_edits` rows or a `03-faithful-translation/` faithful file, so already-edited modules are locked on rollout before any new edit.
5. **Durability + cross-box visibility (integration point — do not skip).** The marker is written on prod when an editor saves an edit, but `scripts/git-backup.sh`'s staged list does **not** include `02-mt-output/` (verified: it stages 03-/04-/05-/chapters/ + `translation-errors.json`/`residue-report.*`, and `02-mt-output` is tracked-but-static). So a marker written there would never be committed/pushed → invisible to a CLI on any other box and not backed up. **Add the marker glob `books/*/02-mt-output/*/*-segments.locked` to `git-backup.sh`'s `git add` list** (same pattern as `translation-errors.json` in #95), so markers ride the 2h content-backup commit. Use the targeted `*-segments.locked` glob, **not** the whole `02-mt-output/` dir, to avoid changing the backup policy for MT *content*. (The CLI still sees the marker immediately on-disk when MT is run on prod; the git path covers dev boxes + durability.)
6. **Unlock is one-way** for MVP (the frozen baseline *is* the study's comparison point). A manual `--unlock-mt <module>` with a warning is noted as future work, not built (YAGNI).

**Interfaces.**
- New file per edited module: `…/{moduleId}-segments.locked` (git-tracked, rides the content backup).
- `segmentEditorService`: first-edit path writes the marker (new internal helper, e.g. `writeMtLockMarker(book, chapter, moduleId, firstEditId)`).
- `api-translate.js`: new pre-write check (e.g. `isMtLocked(book, chapter, moduleId)` in a shared lib both the server and CLI can import — resolve paths via `import.meta.url`, never cwd).
- Shared lib: `tools/lib/mt-lock.cjs` (or similar) with `mtLockPath()`, `isMtLocked()`, `writeMtLock()` — one implementation, imported by both server and CLI (no duplicated path logic).

**Testing (Vitest).**
- `mt-lock` lib: path resolution; `isMtLocked` true/false/indeterminate.
- `saveSegmentEdit`: first edit writes marker once; second edit does not rewrite; marker-write failure surfaces but edit still saves.
- `api-translate` guard: locked → refused even with `--force`; unlocked+exists → still needs `--force`; unlocked+absent → proceeds; indeterminate → refused.
- Integration on `books/__e2e-fixture__`: save an edit → marker appears → `api-translate --force` on that module refuses; a sibling un-edited module still re-runs.

---

## Sequencing & structure

- **Three PRs, priority order A → B → C.** Each is independently shippable and independently valuable.
- **One plan document** (writing-plans) with three task groups; A first.
- **Track A** has a lead-supplied infra prerequisite (bucket + credentials); the code + runbook land regardless, and the off-box path activates when the env is set.
- Out of scope (deliberately): the other audit gaps (per-product licence metadata, aligned research-corpus export, TM/Árnastofnun export, subject fallback-on-miss, glossary review-queue) — catalogued in the audit with their own remediation order; a later effort.

## Success criteria

- **A:** off-box encrypted backup runs on a schedule; `verify-db-backup.sh` restores + integrity-checks a real off-box copy; `/api/health` flags a stale backup; runbook exists. Local-only still works with no remote configured.
- **B:** `check-source-updates.js` has no `update` verb; the guard test proves `download-source.js` is the only (guarded) `01-source` writer; F2 doc corrected.
- **C:** a first saved edit locks a module's MT output; `api-translate --force` refuses a locked module and proceeds on an unlocked one; already-edited modules are backfilled; markers ride the content backup with no merge conflict.
- All: `npm test` green from repo root; no new writer to `01-source`/`02-mt-output` *content*; robustness posture upheld (loud failures, no prod escape hatch).
