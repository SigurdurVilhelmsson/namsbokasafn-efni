#!/usr/bin/env bash
#
# Automated git backup for content files edited via the web interface.
#
# Commits and pushes changes in content directories under books/ to GitHub.
# Designed to run as a cron job every 2 hours:
#   0 */2 * * * /opt/namsbokasafn-efni/scripts/git-backup.sh
#
# What gets backed up:
#   books/*/03-faithful-translation/  — reviewed translations
#   books/*/03-translated/            — injected CNXML
#   books/*/04-localized-content/     — localized content
#   books/*/04-localization/          — localization in progress
#   books/*/05-publication/           — rendered HTML
#   books/*/chapters/                 — status files
#
# Logs to pipeline-output/backup.log (gitignored).
# Writes status to pipeline-output/backup-status.json (gitignored).
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_FILE="${PROJECT_ROOT}/pipeline-output/backup.log"
STATUS_FILE="${PROJECT_ROOT}/pipeline-output/backup-status.json"
TIMESTAMP="$(date -u +%Y-%m-%d\ %H:%M)"

# Ensure pipeline-output directory exists
mkdir -p "${PROJECT_ROOT}/pipeline-output"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG_FILE"
}

write_status() {
  local status="$1"
  local message="$2"
  cat > "$STATUS_FILE" <<EOF
{
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "status": "${status}",
  "message": "${message}"
}
EOF
}

cd "$PROJECT_ROOT"

# Verify we're in a git repo
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  log "ERROR: Not a git repository: $PROJECT_ROOT"
  write_status "error" "Not a git repository"
  exit 1
fi

# Stage content directories under books/
git add \
  "books/*/03-faithful-translation/" \
  "books/*/03-translated/" \
  "books/*/04-localized-content/" \
  "books/*/04-localization/" \
  "books/*/05-publication/" \
  "books/*/chapters/" \
  2>/dev/null || true

# Check if there's anything to commit
if git diff --cached --quiet; then
  log "No changes to back up"
  write_status "no_changes" "Nothing to commit"
  exit 0
fi

# Commit
if ! git commit -m "auto-backup: ${TIMESTAMP}"; then
  log "ERROR: git commit failed"
  write_status "error" "git commit failed"
  exit 1
fi

# Push
if ! git push origin main 2>&1 | tee -a "$LOG_FILE"; then
  log "ERROR: git push failed"
  write_status "error" "git push failed"
  exit 1
fi

COMMIT_HASH="$(git rev-parse --short HEAD)"
log "Backup complete: ${COMMIT_HASH} (auto-backup: ${TIMESTAMP})"
write_status "success" "Pushed ${COMMIT_HASH}"
