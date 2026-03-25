#!/bin/bash
# deploy.sh — Pull latest code to production server
#
# Handles the common case where generated files (structure JSONs,
# translation-errors.json, publication HTML) have been modified
# locally by the editorial server and block a clean pull.
#
# Usage: ./scripts/deploy.sh

set -euo pipefail

echo "=== Deploy: namsbokasafn-efni ==="

# 1. Back up the database before anything else
if [ -f scripts/backup-db.sh ]; then
  echo "Backing up database..."
  bash scripts/backup-db.sh
fi

# 2. Stash any local changes (editorial edits, generated files)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Stashing local changes..."
  git stash push -m "deploy-$(date +%Y%m%d-%H%M%S)"
  STASHED=1
else
  STASHED=0
fi

# 3. Pull latest from origin
echo "Pulling from origin..."
git pull --rebase origin main

# 4. Re-apply local changes (if any)
if [ "$STASHED" -eq 1 ]; then
  echo "Re-applying local changes..."
  if git stash pop; then
    echo "Local changes re-applied successfully."
  else
    echo "WARNING: Merge conflict when re-applying local changes."
    echo "Your changes are still in 'git stash list'. Resolve manually."
    echo "The pull itself succeeded — new code is deployed."
  fi
fi

# 5. Install any new dependencies
echo "Installing dependencies..."
npm install --omit=dev --ignore-scripts

# 6. Restart the service
echo "Restarting ritstjorn..."
sudo systemctl restart ritstjorn

# 7. Quick health check
sleep 2
if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  echo "=== Deploy complete. Server healthy. ==="
else
  echo "=== Deploy complete. WARNING: Health check failed — check logs ==="
  echo "  journalctl -u ritstjorn -n 20 --no-pager"
fi
