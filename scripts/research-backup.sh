#!/usr/bin/env bash
#
# research-backup.sh — the research file's own backup job (spec §5.17).
#
# Order, fail-closed:
#   1. prune both tiers by age (its own step: it does not depend on a copy succeeding). The LOCAL prune runs
#      first of all, before the remote is checked: a mis-set remote or a missing rclone must never stop the
#      local copies ageing out;
#   2. run research-withdrawal.js and research-retention.js with --write; either non-zero: NO copy this cycle;
#   3. take the copy (better-sqlite3's online backup, in server/scripts/research-backup.js);
#   4. upload it to RESEARCH_REMOTE, the research file's OWN rclone crypt remote over its own bucket;
#   5. write the heartbeat, only if every step above succeeded.
# The remote prune is NOT best-effort (unlike backup-db.sh): a copy older than 7 days anywhere breaks the consent text.
#
# Every file this job writes is written by the Node part, under paths derived from the research file's
# (server/lib/researchFiles.js), so this script names no path of its own. The age arithmetic lives in
# server/lib/researchBackupPolicy.js.
#
# Exit codes: 0 done; 1 the copy or the heartbeat failed; 2 RESEARCH_REMOTE unset or not a research remote;
# 3 rclone or node missing; 4 the upload failed; 5 RESEARCH_REMOTE malformed; 6 a deletion step failed (no copy taken);
# 7 a prune failed (the copy was taken and uploaded; no heartbeat). Exits 2, 3 and 5 come after the local prune.
#
# THE LOG HOLDS ONE VERDICT LINE PER RUN, AND NOTHING ELSE ([USER] 2026-11-04). The cron line appends this script's
# stdout and stderr to pipeline-output/research-backup.log: the UTC time, then "research-backup: ok" or
# "research-backup: failed: <step>[,<step>...]". Never an interval id, a count, a copy's name or a step's own output:
# the withdrawal and retention reports name the interval ids they deleted, so every child's stdout is captured or
# discarded and every child's stderr discarded. To see what a failing step found, re-run it by hand (the deletion
# scripts are dry-run without --write) and read it in a terminal.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
S="${PROJECT_ROOT}/server/scripts"
# /usr/bin first, as git-backup.sh does: better-sqlite3's binary is built for the service's /usr/bin/node.
# RESEARCH_NODE is a test seam (scripts/__tests__); cron never sets it.
NODE="${RESEARCH_NODE:-$(PATH="/usr/bin:$PATH" command -v node || true)}"
REMOTE="${RESEARCH_REMOTE:-}"

# The steps that failed, in the order they ran (a closed list: node, prune-local, remote, rclone, prune-remote,
# withdrawal, retention, copy, upload, heartbeat).
FAILED=""
fail() { FAILED="${FAILED:+${FAILED},}$1"; }
# The run's one log line, written on every exit path. $? is the status the script is exiting with.
verdict() {
  local rc=$?
  if [ "$rc" -eq 0 ]; then
    printf '%s research-backup: ok\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  else
    printf '%s research-backup: failed: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${FAILED:-unknown}"
  fi
}
trap verdict EXIT

if [ -z "$NODE" ]; then fail node; exit 3; fi

# (1a) The local prune, before anything that can stop the job.
prune_failed=0
if ! "$NODE" "$S/research-backup.js" prune-local >/dev/null 2>&1; then
  fail prune-local
  prune_failed=1
fi

# RESEARCH_REMOTE unset, malformed, or not the research file's own (never the editorial secret:).
if [ -z "$REMOTE" ]; then fail remote; exit 2; fi
case "$REMOTE" in
  *: | */) ;;
  *) fail remote; exit 5 ;;
esac
case "$REMOTE" in
  research*) ;;
  *) fail remote; exit 2 ;;
esac
if ! command -v rclone >/dev/null 2>&1; then fail rclone; exit 3; fi

# (1b) The remote prune: a listing that fails, a deletion that fails, or a name the job did not make (never deleted).
remote_prune_failed=0
if listing="$(rclone lsf "$REMOTE" --files-only 2>/dev/null)"; then
  expired="$(printf '%s\n' "$listing" | "$NODE" "$S/research-backup.js" expired-names 2>/dev/null)"
  names_rc=$?
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    rclone deletefile "${REMOTE}${name}" >/dev/null 2>&1 || remote_prune_failed=1
  done <<< "$expired"
  [ "$names_rc" -eq 0 ] || remote_prune_failed=1
else
  remote_prune_failed=1
fi
if [ "$remote_prune_failed" -ne 0 ]; then
  fail prune-remote
  prune_failed=1
fi

# (2) Deletion before every copy (spec §5.15): both scripts, every cycle. Their reports name interval ids: discarded.
withdrawal_rc=0
"$NODE" "$S/research-withdrawal.js" --write >/dev/null 2>&1 || withdrawal_rc=$?
retention_rc=0
"$NODE" "$S/research-retention.js" --write >/dev/null 2>&1 || retention_rc=$?
[ "$withdrawal_rc" -eq 0 ] || fail withdrawal
[ "$retention_rc" -eq 0 ] || fail retention
if [ "$withdrawal_rc" -ne 0 ] || [ "$retention_rc" -ne 0 ]; then exit 6; fi

# (3) The copy, and (4) the upload. The copy's path is captured, never printed.
if ! copy="$("$NODE" "$S/research-backup.js" copy 2>/dev/null)"; then fail copy; exit 1; fi
if ! rclone copyto "$copy" "${REMOTE}$(basename "$copy")" >/dev/null 2>&1; then fail upload; exit 4; fi

# (5) The heartbeat, only if every step succeeded. A prune failure was named when it happened.
if [ "$prune_failed" -ne 0 ]; then exit 7; fi
if ! "$NODE" "$S/research-backup.js" heartbeat >/dev/null 2>&1; then fail heartbeat; exit 1; fi
exit 0
