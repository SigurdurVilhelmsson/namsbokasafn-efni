# git-backup.sh Atomic-Add Hardening — Design (Campaign Item 4b)

**Date:** 2026-07-12 · **Status:** approved by lead (Approach A, per-pattern staging loop) · **Branch:** `fix/git-backup-atomic-add`, one PR off `main` (@ `d7f3e39f`, post-#272)
**Campaign item:** `docs/plans/2026-07-11-pre-semester-coding-campaign.md` Phase 1 item 4b (Track C final-review recommendation)

## 1. Problem

`scripts/git-backup.sh` (the 2-hourly content-backup cron — the only path editor work takes from the production disk to git) stages nine pathspecs in ONE `git add` invocation with `2>/dev/null || true` (lines 80-90). With `nullglob` off, an unmatched glob reaches git as a literal string; git exits 128 for the **whole command**; the suppression hides it. One legitimately-empty glob (fresh deploy without residue reports; a revert removing every committed `.locked` marker) therefore silently stops the ENTIRE content backup on every run — including the MT edit-lock markers Track C's durability now depends on. The script's own comment (lines 68-79) documents the invariant instead of removing it.

## 2. Decisions (locked)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Per-pattern staging loop** over a bash array of the nine pathspecs: `compgen -G "$pathspec"` decides matched vs unmatched. | One bad glob can no longer take the other eight down; per-glob observability names the culprit. Approach B (drop `\|\| true` on the shared add) would make a legitimately-empty glob KILL the backup — worse than today. |
| D2 | **Unmatched glob → `WARN … (skipped)` log line, continue.** Not an error: an empty glob is a legitimate state (no residue reports yet; `.locked` markers reverted; a book without `04-localization/`... the glob spans all books, so unmatched = zero books have it). | Availability: the backup must keep working through expected emptiness — loudly, not silently. |
| D3 | **Real `git add` failure (matched glob, add still fails — index lock, permissions) → `ERROR` log + count it; after the loop any count>0 → `write_status "error"` + exit 1.** Stderr suppression removed entirely. | Fail loud on genuine failures (repo values); the status file + cron log carry the signal. |
| D4 | No other behavior changes: the no-changes short-circuit, commit, push, and status writes stay byte-identical. The lines-68-79 invariant comment is REPLACED by a short description of the per-pattern behavior (the invariant no longer exists). | Surgical scope; the comment documenting a hazard must not outlive the hazard. |
| D5 | **Tests in `scripts/__tests__/git-backup.test.mjs`** (vitest `scripts` project, `backup-db.test.mjs` harness precedent): temp git repo with bare `origin` remote and `main` branch, committed `books/` fixture shaped like production. | The scripts project already tests bash via spawned processes; same idiom. |

## 3. The loop (target shape)

```bash
PATHSPECS=(
  'books/*/03-faithful-translation/'
  'books/*/03-translated/'
  'books/*/04-localized-content/'
  'books/*/04-localization/'
  'books/*/05-publication/'
  'books/*/chapters/'
  'books/*/translation-errors.json'
  'books/*/residue-report.*.json'
  'books/*/02-mt-output/*/*-segments.locked'
)

ADD_FAILURES=0
for pathspec in "${PATHSPECS[@]}"; do
  if compgen -G "$pathspec" > /dev/null; then
    # shellcheck disable=SC2086 — the glob must expand
    if ! git add -- $pathspec; then
      log "ERROR: git add failed for pathspec: $pathspec"
      ADD_FAILURES=$((ADD_FAILURES + 1))
    fi
  else
    log "WARN: pathspec matched nothing (skipped): $pathspec"
  fi
done

if [ "$ADD_FAILURES" -gt 0 ]; then
  log "ERROR: ${ADD_FAILURES} pathspec(s) failed to stage — aborting backup run"
  write_status "error" "git add failed for ${ADD_FAILURES} pathspec(s)"
  exit 1
fi
```

(Note `set -euo pipefail` is active: the `if ! git add` form is required so a failure doesn't abort mid-loop; `compgen -G` in an `if` is likewise `-e`-safe. Implementation may adjust quoting/shellcheck details but keeps D1-D3 semantics.)

## 4. Test plan

`scripts/__tests__/git-backup.test.mjs` — helper builds: temp dir → `git init -b main`, config user, `git init --bare` sibling as `origin`, committed fixture (`books/prufubok/` with one file per pathspec family incl. a `.locked` marker; initial commit pushed). Each case dirties files, runs the script with `HOME`/env as the harness precedent does, then asserts on git state, `pipeline-output/backup.log`, and `backup-status.json`:

1. **Happy path:** dirty files across several pathspecs → staged, committed (`auto-backup:` subject), pushed to the bare remote, status `success`.
2. **The regression pin (the whole item):** delete every `.locked` marker (commit that), then dirty files in OTHER pathspecs → they still stage/commit/push; log contains `WARN: pathspec matched nothing (skipped): books/*/02-mt-output/*/*-segments.locked`; status `success`.
3. **Nothing dirty:** status `no_changes`, exit 0.
4. **Real add failure:** create `.git/index.lock` + dirty file → `ERROR` log line, status `error`, exit 1, nothing committed.

## 5. Out of scope

- Surfacing `backup-status.json` in `/api/health` (the off-box DB backup has its own heartbeat; content-backup health wiring is a separate item if ever wanted — register note only if the lead asks).
- Any change to what is backed up (pathspec list unchanged) or to commit/push behavior.
