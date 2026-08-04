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
# PATH is load-bearing, not cosmetic. cron gives a user crontab
# PATH=/usr/bin:/bin, but rclone's official installer puts the binary in
# /usr/local/bin — so without this line the off-box upload dies with
# "rclone not installed" (backup-db.sh exit 3) on every cron run, while an
# interactive test by hand still passes because a login shell DOES have
# /usr/local/bin. There is no MAILTO here, so that failure is silent; the
# only signal is /api/health going stale. Keep this line above the jobs.
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Git backup: content files every 2 hours.
# Writes pipeline-output/.last-content-backup on every healthy run ("nothing
# to commit" counts, unless a prior push left commits unpushed — that fails
# loud); /api/health reports checks.content_backup stale after
# CONTENT_BACKUP_STALE_HOURS (default 6) and ./scripts/deploy.sh prints it.
# See docs/technical/backup-and-restore.md.
0 */2 * * * ${DEPLOY_PATH}/scripts/git-backup.sh

# DB backup: local snapshot + encrypted off-box upload, every 6 hours.
# BACKUP_REMOTE must be set or off-box upload is SKIPPED (and /api/health reports
# the backup stale). It is an rclone crypt remote (passphrase lives in rclone config).
# It MUST end in ':' or '/' — backup-db.sh exits 5 otherwise, because a missing
# separator munges the object name and silently breaks retention. The crypt remote
# already points at the bucket, so 'secret:' IS the bucket root; a subpath would
# only nest an encrypted-name directory inside it for no reason.
# See docs/technical/backup-and-restore.md.
30 */6 * * * BACKUP_REMOTE=${BACKUP_REMOTE:-secret:} ${DEPLOY_PATH}/scripts/backup-db.sh

# Monthly restore-test: prove an off-box backup actually round-trips (RESTORE VERIFY: PASS).
# A backup that uploads but cannot be restored is worth nothing; this is the check
# that distinguishes the two.
0 4 1 * * BACKUP_REMOTE=${BACKUP_REMOTE:-secret:} ${DEPLOY_PATH}/scripts/verify-db-backup.sh

# To install, run:  crontab -e  and paste the lines above.
# All scripts log to ${DEPLOY_PATH}/pipeline-output/
EOF
