#!/usr/bin/env bash
#
# SQLite database backup script for pipeline-output/sessions.db
#
# Usage:
#   ./scripts/backup-db.sh                    # backup to default location
#   ./scripts/backup-db.sh /path/to/backups   # backup to custom directory
#
# Designed to run as a cron job, e.g.:
#   0 */6 * * * /path/to/namsbokasafn-efni/scripts/backup-db.sh
#
# The script:
#   0. Runs the editorial retention (server/scripts/editorial-retention.js --write) before anything is copied
#   1. Makes a timestamped copy with VACUUM INTO (server/scripts/editorial-backup.js copy): a consistent snapshot
#      of live rows only, so the bytes of deleted rows are not carried into a copy that is kept for months
#   2. Keeps the most recent 30 backups (prunes older ones, with their
#      -shm/-wal side files, and sweeps side files whose backup is gone)
#   3. Uploads to the off-box remotes (see "Off-box upload" below: London BACKUP_REMOTE, locked Paris
#      LOCKED_BACKUP_REMOTE) and exits 3-8 on the failures documented there
#   4. Exits with Paris's code if non-zero, else London's, else 0
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DB_PATH="${PROJECT_ROOT}/pipeline-output/sessions.db"
# Test seam: allow overriding the DB path (used by scripts/__tests__).
DB_PATH="${DB_PATH_OVERRIDE:-$DB_PATH}"
BACKUP_DIR="${1:-${PROJECT_ROOT}/pipeline-output/backups}"
MAX_BACKUPS=30

# Verify source DB exists
if [ ! -f "$DB_PATH" ]; then
  echo "ERROR: Database not found at $DB_PATH" >&2
  exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Enforce the editing tool's retention dates BEFORE the copy, so no new backup holds what a step just removed
# (G1.15(b) spec §4.6; server/scripts/editorial-retention.js). Until 2029 nothing is due and it changes nothing. A
# failure is logged and does not stop the backup: an unrecorded step stays due, runs again next cycle, and
# /api/health's checks.retention reports it. Its report (stdout) holds counts and is discarded here; its stderr, a
# failure's reason (an error code and message, never a row's value), stays in this log, so a retention that cannot
# run is diagnosable before the health check would show it (final review I-3).
# /usr/bin first: better-sqlite3's binary is built for the service's /usr/bin/node.
# Two test seams (scripts/__tests__); cron sets neither. RETENTION_NODE is the node for the editorial-retention call
# only; BACKUP_NODE is the node for every server/scripts/editorial-backup.js call (today the copy). Both default to
# the same /usr/bin-first node.
DEFAULT_NODE="$(PATH="/usr/bin:$PATH" command -v node || true)"
RETENTION_NODE="${RETENTION_NODE:-$DEFAULT_NODE}"
BACKUP_NODE="${BACKUP_NODE:-$DEFAULT_NODE}"
if [ -z "$RETENTION_NODE" ]; then
  echo "WARNING: editorial retention did not complete: node not found" >&2
elif ! SESSIONS_DB_PATH="$DB_PATH" "$RETENTION_NODE" "${PROJECT_ROOT}/server/scripts/editorial-retention.js" --write >/dev/null; then
  echo "WARNING: editorial retention did not complete; see checks.retention in /api/health" >&2
fi

# Local copy through Node (VACUUM INTO, mode 0600). It prints the copy's path and leaves no partial file on failure.
# No cp fallback: a plain copy would carry deleted rows' bytes into a long-kept backup.
if [ -z "$BACKUP_NODE" ]; then
  echo "ERROR: local copy failed: node not found" >&2
  exit 1
fi
BACKUP_FILE="$("$BACKUP_NODE" "${PROJECT_ROOT}/server/scripts/editorial-backup.js" copy "$DB_PATH" "$BACKUP_DIR")" || {
  echo "ERROR: local copy failed" >&2
  exit 1
}

echo "Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Prune old backups, keeping only the most recent $MAX_BACKUPS. A backup that
# anything has opened in WAL mode (an inspection, a restore test) has -shm/-wal
# side files beside it; they go with it.
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/sessions.*.db 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
  PRUNE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
  ls -1t "$BACKUP_DIR"/sessions.*.db | tail -n "$PRUNE_COUNT" | while IFS= read -r old; do
    rm -f -- "$old" "$old-shm" "$old-wal"
  done
  echo "Pruned $PRUNE_COUNT old backup(s), keeping $MAX_BACKUPS"
fi

# Sweep side files whose backup is already gone (pruning before 2026-10-31 left
# them behind). Only an orphan goes: a kept backup's side files mean something
# opened it and may still hold it open. A side file without its .db is unusable.
ORPHANS=0
for side in "$BACKUP_DIR"/sessions.*.db-shm "$BACKUP_DIR"/sessions.*.db-wal; do
  [ -e "$side" ] || continue          # an unmatched glob stays literal
  if [ ! -e "${side%-*}" ]; then
    rm -f -- "$side"
    ORPHANS=$((ORPHANS + 1))
  fi
done
if [ "$ORPHANS" -gt 0 ]; then
  echo "Removed $ORPHANS orphaned side file(s)"
fi

# --- Off-box upload (encrypted) -------------------------------------------
# Two remotes, both client-side-encrypted (crypt) so plaintext never leaves this box. Both unset => skip (the local
# backup is still valid; dev/CI unaffected). Both may be set at once, during the move.
#   BACKUP_REMOTE         London. Uploads the plain copy; keeps the newest BACKUP_REMOTE_KEEP by count. Unchanged.
#   LOCKED_BACKUP_REMOTE  Paris, a crypt remote named locked*. Uploads the gzipped copy; the BUCKET sets the
#                         Object Lock, so NO upload here carries a lock flag. LOCKED_BACKUP_S3 is the S3 path under
#                         that crypt remote, for version listings and deletes. G1.20 spec §4.2, §4.3, §4.7.
# Exit codes: 3 rclone missing, 4 an upload failed, 5 a malformed or forbidden remote setting, 6 paused (an editorial
# retention step is due, nothing sent to Paris), 7 rate guard refused or the pre-upload listing failed, 8 the status
# check is not ok. Paris's codes outrank London's.
REMOTE_KEEP="${BACKUP_REMOTE_KEEP:-30}"
HEARTBEAT="${BACKUP_DIR}/.last-offbox-backup"
LOCKED_STATUS="${BACKUP_DIR}/.offbox-locked-status.json"
LONDON_RC=0
LOCKED_RC=0

# 1. Guards, before anything is uploaded or deleted.
if [ -n "${LOCKED_BACKUP_REMOTE:-}" ]; then
  case "$LOCKED_BACKUP_REMOTE" in
    locked*:  | locked*/) ;;
    *) echo "ERROR: LOCKED_BACKUP_REMOTE must begin with 'locked' and end in ':' or '/' (got '$LOCKED_BACKUP_REMOTE')" >&2; exit 5 ;;
  esac
  case "${LOCKED_BACKUP_S3:-}" in
    *: | */) ;;
    *) echo "ERROR: LOCKED_BACKUP_S3 must be set and end in ':' or '/' when LOCKED_BACKUP_REMOTE is set (got '${LOCKED_BACKUP_S3:-}')" >&2; exit 5 ;;
  esac
fi
if [ -n "${BACKUP_REMOTE:-}" ]; then
  case "$BACKUP_REMOTE" in
    locked*) echo "ERROR: BACKUP_REMOTE must not begin with 'locked' (got '$BACKUP_REMOTE'): the count-based prune must never reach the locked remote" >&2; exit 5 ;;
  esac
  if [ -n "${LOCKED_BACKUP_REMOTE:-}" ] && [ "$BACKUP_REMOTE" = "$LOCKED_BACKUP_REMOTE" ]; then
    echo "ERROR: BACKUP_REMOTE and LOCKED_BACKUP_REMOTE must differ" >&2; exit 5
  fi
  case "$BACKUP_REMOTE" in
    *: | */) ;;  # a proper rclone remote path ends in ':' or '/'
    *) echo "ERROR: BACKUP_REMOTE must end in ':' or '/' (got '$BACKUP_REMOTE') — else the object name is munged and retention breaks" >&2; exit 5 ;;
  esac
fi
if [ -z "${BACKUP_REMOTE:-}" ] && [ -z "${LOCKED_BACKUP_REMOTE:-}" ]; then
  echo "BACKUP_REMOTE not set — skipping off-box upload (local backup only)."
  exit 0
fi
if ! command -v rclone >/dev/null 2>&1; then
  echo "ERROR: a backup remote is set but rclone not installed" >&2
  exit 3
fi

# 2. London: upload, heartbeat, count-based prune. A failed upload no longer stops the run: Paris still goes.
if [ -n "${BACKUP_REMOTE:-}" ]; then
  echo "Uploading encrypted backup to ${BACKUP_REMOTE} ..."
  if ! rclone copyto "$BACKUP_FILE" "${BACKUP_REMOTE}$(basename "$BACKUP_FILE")"; then
    echo "ERROR: off-box upload failed" >&2   # loud + non-zero; heartbeat NOT written
    LONDON_RC=4
  else
    # With Paris set, the heartbeat is Paris's: London's success must not mask a Paris failure.
    if [ -z "${LOCKED_BACKUP_REMOTE:-}" ]; then
      date -u +%Y-%m-%dT%H:%M:%SZ > "$HEARTBEAT"
      echo "Off-box upload OK; heartbeat: $HEARTBEAT"
    else
      echo "Off-box upload OK (London)"
    fi
    # Prune remote to the most recent $REMOTE_KEEP (best-effort; upload already succeeded).
    mapfile -t REMOTE_OLD < <(rclone lsf "$BACKUP_REMOTE" --files-only 2>/dev/null \
      | grep '^sessions\.' | sort -r | tail -n +"$((REMOTE_KEEP + 1))")
    for f in "${REMOTE_OLD[@]:-}"; do [ -n "$f" ] && rclone deletefile "${BACKUP_REMOTE}${f}" 2>/dev/null || true; done
  fi
fi

# 3. Paris: the locked remote.
if [ -n "${LOCKED_BACKUP_REMOTE:-}" ]; then
  EB="${PROJECT_ROOT}/server/scripts/editorial-backup.js"
  LIST_ARGS=(lsjson --s3-versions --s3-version-deleted --use-server-modtime "$LOCKED_BACKUP_S3")
  LOCKED_NAME="$(basename "$BACKUP_FILE").gz"
  while :; do  # runs once; `break` skips the rest of Paris
    # 3.1 Pause while an editorial retention step is due: a copy made now would hold what the step must remove,
    # and a locked copy cannot be deleted. Fails closed: "cannot tell" is "due".
    if ! "$BACKUP_NODE" "$EB" retention-due "$DB_PATH"; then
      echo "PAUSED: an editorial retention step is due; nothing uploaded to the locked remote" >&2
      LOCKED_RC=6; break
    fi
    # 3.2 Rate guard from a listing taken before the upload. A listing that cannot be read refuses too.
    if ! listing="$(rclone "${LIST_ARGS[@]}")" || ! printf '%s' "$listing" | "$BACKUP_NODE" "$EB" rate-ok; then
      echo "ERROR: locked upload refused: rate guard, or the pre-upload listing failed" >&2
      LOCKED_RC=7; break
    fi
    # 3.3 Gzip into a private temp directory and upload. NO lock flags: the bucket's settings lock each copy.
    LOCKED_TMP="$(mktemp -d)" || { echo "ERROR: could not create a temp directory" >&2; LOCKED_RC=4; break; }
    trap 'rm -rf -- "$LOCKED_TMP"' EXIT
    if ! gzip -c "$BACKUP_FILE" > "$LOCKED_TMP/$LOCKED_NAME"; then
      echo "ERROR: gzip of the backup failed" >&2
      LOCKED_RC=4; break
    fi
    echo "Uploading encrypted backup to ${LOCKED_BACKUP_REMOTE} ..."
    if ! rclone copyto "$LOCKED_TMP/$LOCKED_NAME" "${LOCKED_BACKUP_REMOTE}${LOCKED_NAME}"; then
      echo "ERROR: locked off-box upload failed" >&2   # heartbeat NOT written
      LOCKED_RC=4; break
    fi
    # 3.4 The upload succeeded: heartbeat.
    date -u +%Y-%m-%dT%H:%M:%SZ > "$HEARTBEAT"
    echo "Locked off-box upload OK; heartbeat: $HEARTBEAT"
    # 3.5 Delete data versions past the server's delete age, by versioned name. Best-effort. Only the S3 path is
    # ever addressed here: the crypt remote is never given to deletefile.
    if listing="$(rclone "${LIST_ARGS[@]}")" && expired="$(printf '%s' "$listing" | "$BACKUP_NODE" "$EB" expired)"; then
      while IFS= read -r vpath; do
        [ -n "$vpath" ] || continue
        rclone deletefile --s3-versions "${LOCKED_BACKUP_S3}${vpath}" \
          || echo "WARNING: could not delete expired version" >&2
      done <<< "$expired"
    else
      echo "WARNING: could not list expired versions" >&2
    fi
    # 3.6 Status from a fresh listing, and whether this upload is visible through the crypt remote. Fails closed.
    seen=no
    if rclone lsf --files-only "$LOCKED_BACKUP_REMOTE" | grep -qxF "$LOCKED_NAME"; then seen=yes; fi
    if ! listing="$(rclone "${LIST_ARGS[@]}")"; then listing=""; fi
    if ! printf '%s' "$listing" | "$BACKUP_NODE" "$EB" status --uploaded-seen "$seen" --out "$LOCKED_STATUS"; then
      echo "ERROR: locked backup status is not ok (see $LOCKED_STATUS)" >&2
      LOCKED_RC=8
    fi
    break
  done
fi

# 4. Exit: Paris's verdict first, then London's.
if [ "$LOCKED_RC" -ne 0 ]; then exit "$LOCKED_RC"; fi
exit "$LONDON_RC"
