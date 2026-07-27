#!/usr/bin/env bash
#
# Prints recommended crontab entries for the Linode server.
# Run: ./scripts/install-cron.sh
#
# To install, copy the output into: crontab -e
#

DEPLOY_PATH="${DEPLOY_PATH:-/home/siggi/repos/namsbokasafn-efni}"

cat <<EOF
# === namsbokasafn backup jobs ===
# Git backup: content files every 2 hours.
# Writes pipeline-output/.last-content-backup on every healthy run (including
# "nothing to commit"); /api/health reports checks.content_backup stale after
# CONTENT_BACKUP_STALE_HOURS (default 6) and ./scripts/deploy.sh prints it.
# See docs/technical/backup-and-restore.md.
0 */2 * * * ${DEPLOY_PATH}/scripts/git-backup.sh

# DB backup: local snapshot + encrypted off-box upload, every 6 hours.
# BACKUP_REMOTE must be set or off-box upload is SKIPPED (and /api/health reports
# the backup stale). It is an rclone crypt remote (passphrase lives in rclone config).
# See docs/technical/backup-and-restore.md.
30 */6 * * * BACKUP_REMOTE=${BACKUP_REMOTE:-secret:namsbokasafn-db} ${DEPLOY_PATH}/scripts/backup-db.sh

# Monthly restore-test: prove an off-box backup actually round-trips (RESTORE VERIFY: PASS).
0 4 1 * * BACKUP_REMOTE=${BACKUP_REMOTE:-secret:namsbokasafn-db} ${DEPLOY_PATH}/scripts/verify-db-backup.sh

# To install, run:  crontab -e  and paste the lines above.
# All scripts log to ${DEPLOY_PATH}/pipeline-output/
EOF
