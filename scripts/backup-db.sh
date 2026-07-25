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
#   1. Checkpoints the WAL to ensure all data is in the main DB file
#   2. Copies the DB file with a timestamp
#   3. Keeps the most recent 30 backups (prunes older ones)
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

# Checkpoint WAL to flush pending writes into the main DB file
sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE);" 2>/dev/null || {
  echo "WARNING: WAL checkpoint failed (sqlite3 not installed?). Proceeding with file copy." >&2
}

# Create timestamped backup
TIMESTAMP="$(date +%Y-%m-%d-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/sessions.${TIMESTAMP}.db"
cp "$DB_PATH" "$BACKUP_FILE"

echo "Backup created: $BACKUP_FILE ($(du -h "$BACKUP_FILE" | cut -f1))"

# Prune old backups, keeping only the most recent $MAX_BACKUPS
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/sessions.*.db 2>/dev/null | wc -l)
if [ "$BACKUP_COUNT" -gt "$MAX_BACKUPS" ]; then
  PRUNE_COUNT=$((BACKUP_COUNT - MAX_BACKUPS))
  ls -1t "$BACKUP_DIR"/sessions.*.db | tail -n "$PRUNE_COUNT" | xargs rm -f
  echo "Pruned $PRUNE_COUNT old backup(s), keeping $MAX_BACKUPS"
fi

# --- Off-box upload (encrypted) -------------------------------------------
# Uploads the just-created backup to BACKUP_REMOTE via rclone. The remote is a
# client-side-encrypted (crypt) remote, so plaintext never leaves this box.
# Unset BACKUP_REMOTE => skip (local-only backup still valid; dev/CI unaffected).
REMOTE_KEEP="${BACKUP_REMOTE_KEEP:-30}"
HEARTBEAT="${BACKUP_DIR}/.last-offbox-backup"

if [ -z "${BACKUP_REMOTE:-}" ]; then
  echo "BACKUP_REMOTE not set — skipping off-box upload (local backup only)."
else
  case "$BACKUP_REMOTE" in
    *: | */) ;;  # a proper rclone remote path ends in ':' or '/'
    *) echo "ERROR: BACKUP_REMOTE must end in ':' or '/' (got '$BACKUP_REMOTE') — else the object name is munged and retention breaks" >&2; exit 5 ;;
  esac
  if ! command -v rclone >/dev/null 2>&1; then
    echo "ERROR: BACKUP_REMOTE set but rclone not installed" >&2
    exit 3
  fi
  echo "Uploading encrypted backup to ${BACKUP_REMOTE} ..."
  if ! rclone copyto "$BACKUP_FILE" "${BACKUP_REMOTE}$(basename "$BACKUP_FILE")"; then
    echo "ERROR: off-box upload failed" >&2   # loud + non-zero; heartbeat NOT written
    exit 4
  fi
  date -u +%Y-%m-%dT%H:%M:%SZ > "$HEARTBEAT"
  echo "Off-box upload OK; heartbeat: $HEARTBEAT"
  # Prune remote to the most recent $REMOTE_KEEP (best-effort; upload already succeeded).
  mapfile -t REMOTE_OLD < <(rclone lsf "$BACKUP_REMOTE" --files-only 2>/dev/null \
    | grep '^sessions\.' | sort -r | tail -n +"$((REMOTE_KEEP + 1))")
  for f in "${REMOTE_OLD[@]:-}"; do [ -n "$f" ] && rclone deletefile "${BACKUP_REMOTE}${f}" 2>/dev/null || true; done
fi
