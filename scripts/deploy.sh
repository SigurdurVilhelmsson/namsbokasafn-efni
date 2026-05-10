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

# 0. Pin Node runtime to the system version BEFORE any npm runs.
#
# Why: /usr/bin/npm is a shell script whose shebang is `#!/usr/bin/env node`.
# It picks up whichever `node` is first in PATH. If the interactive shell
# has nvm with a newer Node active (e.g. Node 24), `/usr/bin/npm` runs
# under that Node, and prebuild-install fetches a better-sqlite3 binary
# built for the wrong NODE_MODULE_VERSION. systemd then runs the service
# under `/usr/bin/node` (Node 20) and the binary fails to load with
# "Module did not self-register".
#
# The fix is to prepend /usr/bin to PATH so `node` resolves to the same
# binary systemd uses, regardless of nvm state in the calling shell.
export PATH="/usr/bin:$PATH"

# Sanity check: the active Node major must match .nvmrc. If a future
# upgrade lands a newer Node system-wide, .nvmrc must be updated in the
# same commit so this check catches accidental version skew.
if [ -f .nvmrc ]; then
  EXPECTED_MAJOR=$(tr -d 'v \n' < .nvmrc | cut -d. -f1)
  ACTUAL_MAJOR=$(node --version | tr -d 'v' | cut -d. -f1)
  if [ "$EXPECTED_MAJOR" != "$ACTUAL_MAJOR" ]; then
    echo "ERROR: Node version mismatch."
    echo "  .nvmrc expects:  v${EXPECTED_MAJOR}.x"
    echo "  /usr/bin/node:   v${ACTUAL_MAJOR}.x"
    echo "  Either install matching Node system-wide, or update .nvmrc"
    echo "  and the systemd ExecStart together."
    exit 1
  fi
fi

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

# 5. Install any new dependencies (root + server)
# Use /usr/bin/npm explicitly so the install uses the system npm. The PATH
# pin in step 0 above ensures npm itself runs under /usr/bin/node, which
# is also what systemd uses for the service. Both pins together close the
# binary-ABI drift that broke prod on 2026-05-10.
SYSTEM_NPM=/usr/bin/npm
if [ ! -x "$SYSTEM_NPM" ]; then
  echo "ERROR: $SYSTEM_NPM not found. Aborting deploy."
  echo "  The deploy needs to use the same Node as the systemd unit"
  echo "  (which uses /usr/bin/node). Install Node 20 system-wide, or"
  echo "  update both this path and the systemd unit to match."
  exit 1
fi

echo "Installing dependencies (root)..."
# --ignore-scripts skips the husky 'prepare' hook (husky is a dev-dep that
# isn't present in production installs). Root has no native modules, so
# skipping scripts is safe.
$SYSTEM_NPM ci --omit=dev --ignore-scripts

echo "Installing server dependencies..."
# No --ignore-scripts here: better-sqlite3's postinstall (prebuild-install)
# fetches the native .node binary for the running Node. Skipping it leaves
# node_modules without the SQLite binding and the server crashes on start.
( cd server && $SYSTEM_NPM ci --omit=dev )

# 6. Restart the service
echo "Restarting ritstjorn..."
sudo systemctl restart ritstjorn

# 7. Wait for the service to become healthy (up to 30 s)
echo "Waiting for ritstjorn to become healthy..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "=== Deploy complete. Server healthy after ${i}s. ==="
    exit 0
  fi
  sleep 1
done
echo "=== Deploy complete. WARNING: Server did not become healthy in 30s ==="
echo "  Check logs: journalctl -u ritstjorn -n 50 --no-pager"
exit 1
