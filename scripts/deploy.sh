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
# under that Node, and better-sqlite3's install step resolves a binding for
# the wrong NODE_MODULE_VERSION. systemd then runs the service under
# `/usr/bin/node` and the binary fails to load with
# "Module did not self-register".
#
# ⚠️ Corrected 2026-07-28 (better-sqlite3 12 → 13, PR #341): this used to say
# "prebuild-install fetches a binary". v12 did download one from GitHub
# releases at install time; v13 dropped prebuild-install and BUNDLES the
# prebuilt binaries in its tarball (`prebuilds/linux-x64.node`), so there is
# no install-time fetch to get wrong any more. The PATH pin still matters —
# npm auto-runs node-gyp because the package ships a binding.gyp, and the
# loaded binding must match the Node systemd will run.
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
# Register the "ours" merge driver (see .gitattributes) so the perpetually-dirty
# books/*/translation-errors.json manifest never conflicts on the rebase pull.
# Idempotent; lives in .git/config (not committed), so re-assert it every deploy.
git config merge.ours.driver true
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
# No --ignore-scripts here: npm auto-runs node-gyp for better-sqlite3 (it
# ships a binding.gyp), and that step is what leaves a loadable SQLite
# binding in node_modules. Skipping it and the server crashes on start.
#
# ⚠️ Corrected 2026-07-28 (better-sqlite3 12 → 13, PR #341): this used to say
# the postinstall "(prebuild-install) fetches the native .node binary". v13
# bundles its prebuilt binaries in the tarball instead — nothing is fetched,
# and the loaded binding is `prebuilds/linux-x64.node`, not `build/Release`.
# The install step still needs python3 + make + g++ on this box (present:
# Ubuntu 24.04, build-essential installed), so it must not be skipped.
( cd server && $SYSTEM_NPM ci --omit=dev )

# 6. Restart the service
echo "Restarting ritstjorn..."
sudo systemctl restart ritstjorn

# 7. Wait for the service to become healthy (up to 30 s)
echo "Waiting for ritstjorn to become healthy..."
for i in $(seq 1 30); do
  if HEALTH_BODY="$(curl -sf http://localhost:3000/api/health 2>/dev/null)"; then
    echo "=== Deploy complete. Server healthy after ${i}s. ==="
    # Print the verdict rather than discarding it. Nothing else polls
    # /api/health — no monitor, no UI — so this is the only routine surface
    # where a stale backup heartbeat (content, register C11(b); or off-box
    # sessions.db) becomes visible to a human — and, below, where a glossary
    # refusal (register C14) becomes visible too. It gates nothing:
    # "degraded" is a legitimate post-deploy state, e.g. before the first
    # backup cycle, and a glossary refusal must never fail a deploy.
    echo "$HEALTH_BODY" | node -e "
      let d='';process.stdin.on('data',c=>d+=c);
      process.stdin.on('end',()=>{
        try{
          const h=JSON.parse(d);
          const bad=Object.entries(h.checks||{}).filter(([,c])=>!c.ok).map(([n])=>n);
          console.log('Health: '+h.status+(bad.length?' — not ok: '+bad.join(', '):''));
          // A glossary refusal keeps checks.glossary_export.ok TRUE (register
          // C14, decision D2) — the guard working as intended, not a fault —
          // so it would never appear in the 'not ok' line above. Nothing
          // polls /api/health and this printout is the only routine surface,
          // so print every refusal here regardless of ok, and flag the ones
          // a human has not yet resolved (decision D6, stale_refusals).
          //
          // detail is deliberately UNAVAILABLE here: /api/health is
          // unauthenticated and server/lib/glossaryExportHealth.js projects
          // each book to {outcome, since} only, because detail can embed an
          // absolute server filesystem path. Read
          // pipeline-output/.glossary-export-status.json on the box for that.
          const ge=h.checks&&h.checks.glossary_export;
          const books=(ge&&typeof ge==='object'&&ge.books&&typeof ge.books==='object')?ge.books:{};
          const staleSet=new Set(ge&&Array.isArray(ge.stale_refusals)?ge.stale_refusals:[]);
          const refusals=Object.entries(books).filter(([,o])=>
            o&&typeof o.outcome==='string'&&o.outcome.indexOf('refused-')===0);
          if(refusals.length){
            // Under a day: hours (a same-day refusal must not print '0.0d',
            // which reads as a broken field rather than 'just now'). At or
            // over a day: days, so a week-old refusal stays readable.
            const ageStr=(iso)=>{
              const t=typeof iso==='string'?Date.parse(iso):NaN;
              if(!isFinite(t))return 'unknown age';
              const ms=Date.now()-t;
              return ms<86400000?(ms/3600000).toFixed(1)+'h':(ms/86400000).toFixed(1)+'d';
            };
            const ranAge=(()=>{
              const t=ge&&typeof ge.ran==='string'?Date.parse(ge.ran):NaN;
              return isFinite(t)?' (ran '+((Date.now()-t)/3600000).toFixed(1)+'h ago)':'';
            })();
            console.log('glossary export: '+(ge.ok?'ok':'not ok')+ranAge);
            for(const [slug,o] of refusals){
              const stale=staleSet.has(slug);
              const tag=stale?'⚠ STALE':'⚠';
              const advice=stale?' — unattended past the threshold; run --adopt '+slug+' to resolve':'';
              console.log('  '+tag+' '+slug+': '+o.outcome+' ('+ageStr(o.since)+')'+advice);
            }
          }
        }catch{console.log('Health: (unparseable response)')}
      })
    " || true
    exit 0
  fi
  sleep 1
done
echo "=== Deploy complete. WARNING: Server did not become healthy in 30s ==="
echo "  Check logs: journalctl -u ritstjorn -n 50 --no-pager"
exit 1
