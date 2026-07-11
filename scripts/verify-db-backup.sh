#!/usr/bin/env bash
# Restore-test the latest off-box sessions.db backup: download → decrypt (via the
# crypt remote) → PRAGMA integrity_check → sanity row counts. Exits non-zero on FAIL.
# Run monthly from cron; also runnable by hand after any backup change.
set -euo pipefail

if [ -z "${BACKUP_REMOTE:-}" ]; then echo "ERROR: BACKUP_REMOTE not set" >&2; exit 2; fi
command -v rclone >/dev/null || { echo "ERROR: rclone not installed" >&2; exit 2; }
command -v sqlite3 >/dev/null || { echo "ERROR: sqlite3 not installed" >&2; exit 2; }

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
# `|| true` is required here: under `set -e`+`pipefail`, if grep matches nothing
# (e.g. an empty or unreachable remote), the pipeline's exit status is grep's
# non-zero status even though `head -1` (the last command) succeeds — and because
# this pipeline is the right-hand side of a `VAR="$(...)"` assignment, `set -e`
# treats that as the assignment failing and aborts the script immediately, on this
# line, with no message — never reaching the graceful FAIL check below. Verified
# empirically. `|| true` makes an empty match set fall through to that check instead.
LATEST="$(rclone lsf "$BACKUP_REMOTE" --files-only | grep '^sessions\.' | sort -r | head -1 || true)"
[ -n "$LATEST" ] || { echo "RESTORE VERIFY: FAIL (no off-box backup found)"; exit 1; }
echo "Restoring $LATEST ..."
rclone copyto "${BACKUP_REMOTE}${LATEST}" "${TMP}/restored.db"   # crypt remote decrypts on read

INTEGRITY="$(sqlite3 "${TMP}/restored.db" 'PRAGMA integrity_check;')"
echo "integrity_check: ${INTEGRITY}"
[ "$INTEGRITY" = "ok" ] || { echo "RESTORE VERIFY: FAIL (integrity_check)"; exit 1; }

for tbl in segment_edits terminology_translations content_versions; do
  n="$(sqlite3 "${TMP}/restored.db" "SELECT count(*) FROM ${tbl};" 2>/dev/null || echo MISSING)"
  echo "  ${tbl}: ${n} rows"
  [ "$n" = "MISSING" ] && { echo "RESTORE VERIFY: FAIL (${tbl} absent)"; exit 1; }
done
echo "RESTORE VERIFY: PASS"
