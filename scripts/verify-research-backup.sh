#!/usr/bin/env bash
# Restore-test the newest off-box research.db copy (spec §5.17): download it into the research copies directory under
# its own name plus .verify (aged like its source, so a killed run leaves nothing the prune cannot age), verify it with
# server/scripts/research-backup.js (read-only: integrity_check, schema version, tables), delete it.
# Exit codes: 0 PASS; 1 FAIL; 2 RESEARCH_REMOTE not a research remote; 3 rclone or node missing.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
S="${PROJECT_ROOT}/server/scripts"
NODE="${RESEARCH_NODE:-$(PATH="/usr/bin:$PATH" command -v node || true)}"
REMOTE="${RESEARCH_REMOTE:-}"

case "$REMOTE" in
  research*: | research*/) ;;
  *) echo "RESEARCH RESTORE VERIFY: FAIL (RESEARCH_REMOTE must name the research file's own remote, got '$REMOTE')"; exit 2 ;;
esac
[ -n "$NODE" ] || { echo "RESEARCH RESTORE VERIFY: FAIL (node not found)"; exit 3; }
command -v rclone >/dev/null 2>&1 || { echo "RESEARCH RESTORE VERIFY: FAIL (rclone not installed)"; exit 3; }

DIR="$("$NODE" "$S/research-backup.js" where)" || { echo "RESEARCH RESTORE VERIFY: FAIL (no copies directory)"; exit 1; }
# `|| true`: under pipefail an empty match would otherwise abort the assignment (verify-db-backup.sh:12-18).
LATEST="$(rclone lsf "$REMOTE" --files-only | grep -E '^research\.[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{6}Z\.db$' | sort -r | head -1 || true)"
[ -n "$LATEST" ] || { echo "RESEARCH RESTORE VERIFY: FAIL (no off-box copy found)"; exit 1; }
DEST="${DIR}/${LATEST}.verify"
trap 'rm -f -- "$DEST" "$DEST-wal" "$DEST-shm" "$DEST-journal"' EXIT
mkdir -p -m 700 "$DIR"
if ! rclone copyto "${REMOTE}${LATEST}" "$DEST"; then
  echo "RESEARCH RESTORE VERIFY: FAIL (download errored)"
  exit 1
fi
"$NODE" "$S/research-backup.js" verify "$DEST"
