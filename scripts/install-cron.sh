#!/usr/bin/env bash
#
# Prints recommended crontab entries for the Linode server.
# Run: ./scripts/install-cron.sh
#
# To install, copy the output into: crontab -e
#

DEPLOY_PATH="/opt/namsbokasafn-efni"

cat <<EOF
# === namsbokasafn backup jobs ===
# Git backup: content files every 2 hours
0 */2 * * * ${DEPLOY_PATH}/scripts/git-backup.sh

# DB backup: SQLite snapshot every 6 hours
30 */6 * * * ${DEPLOY_PATH}/scripts/backup-db.sh

# To install, run:  crontab -e  and paste the lines above.
# Both scripts log to ${DEPLOY_PATH}/pipeline-output/
EOF
