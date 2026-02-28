#!/usr/bin/env bash
#
# SQLite database backup script for pipeline-output/sessions.db
#
# Usage:
#   ./scripts/backup-db.sh                    # backup to default location
#   ./scripts/backup-db.sh /path/to/backups   # backup to custom directory
#
# Designed to run as a cron job, e.g.:
#   0 */6 * * * /home/siggi/dev/repos/namsbokasafn-efni/scripts/backup-db.sh
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
