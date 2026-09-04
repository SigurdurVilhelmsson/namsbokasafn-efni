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
#
# --no-audit: `npm ci`'s audit report is ADVISORY OUTPUT ONLY — it never
# changes what is installed and never affects the exit code — but it makes
# every deploy POST to registry.npmjs.org/-/npm/v1/security/audits/quick and
# BLOCK on the answer. Measured on prod 2026-09-04: that one call was 41 s of a
# 41 s install, and an A/B on the same box, same lockfile, same minute gave
# 59,479 ms -> 1,911 ms with an IDENTICAL installed tree (md5 over every
# installed package.json matched exactly). The same endpoint 503'd the CI audit
# job that morning and hung this very deploy. The audit GATE is not lost: it
# lives in .github/workflows/security.yml, which runs `npm audit
# --audit-level=high` in both trees. --no-fund suppresses the funding notice.
$SYSTEM_NPM ci --omit=dev --ignore-scripts --no-audit --no-fund

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
#
# --no-audit --no-fund: see the root install above. This is where it was
# measured, and where it hurt.
( cd server && $SYSTEM_NPM ci --omit=dev --no-audit --no-fund )

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
          // A book that ERRORED (not merely refused) is the quieter, worse
          // case: it always flips ge.ok false (errors>0), but with zero
          // refusals the block below used to print NOTHING at all — no ran,
          // no slug — which is exactly the state 'ran' exists to make
          // legible (fix round 1, finding 1). Gate on ge.ok===false too, not
          // refusals.length alone, and list errored books explicitly.
          const errored=Object.entries(books).filter(([,o])=>
            o&&typeof o.outcome==='string'&&o.outcome==='error');
          if(refusals.length||(ge&&ge.ok===false)){
            // <1m: 'just now' (a same-run refusal/error must not print
            // '0.0h', which reads as a broken field). <1h: minutes.
            // <1d: hours. >=1d: days, so a week-old refusal stays readable.
            const ageStr=(iso)=>{
              const t=typeof iso==='string'?Date.parse(iso):NaN;
              if(!isFinite(t))return 'unknown age';
              const ms=Date.now()-t;
              if(ms<60000)return 'just now';
              if(ms<3600000)return Math.round(ms/60000)+'m';
              if(ms<86400000)return (ms/3600000).toFixed(1)+'h';
              return (ms/86400000).toFixed(1)+'d';
            };
            const ranLabel=(()=>{
              const t=ge&&typeof ge.ran==='string'?Date.parse(ge.ran):NaN;
              if(!isFinite(t))return '';
              const a=ageStr(ge.ran);
              return ' (ran '+(a==='just now'?a:a+' ago')+')';
            })();
            console.log('glossary export: '+(ge&&ge.ok?'ok':'not ok')+ranLabel);
            for(const [slug,o] of refusals){
              const stale=staleSet.has(slug);
              const tag=stale?'⚠ STALE':'⚠';
              // OUTCOME-SPECIFIC, and the command it prints must be one
            // parseArgs actually ACCEPTS. The string this replaces was
            // wrong three ways at once (whole-branch adversarial review,
            // 2026-08-05): it fired for every refused-* outcome though
            // --adopt resolves only refused-producer; refused-shrink
            // needs --force and refused-no-mapping is fixed by NO FLAG
            // AT ALL (a book_subject_mapping row); and the form it
            // printed, 'run --adopt <slug>', exits 1 with 'unrecognised
            // argument' — --adopt takes no value. The live instance is
            // stjornufraedi, which sits at refused-no-mapping, so the
            // only surface a human routinely reads would have sent them
            // in a circle. Pinned by
            // scripts/__tests__/deploy-health-readout.test.mjs, which
            // round-trips the printed command through parseArgs itself
            // so this can never drift from the parser again.
            const EXPORTER='node server/scripts/export-terminology.js';
            const remedy=(outcome,slug)=>{
              if(outcome==='refused-producer')
                return 'the committed file was written by another producer, so writing would SWAP producers; --adopt migrates it (--force may ALSO be needed if the adoption then trips the shrink gate) — run: '+EXPORTER+' --book '+slug+' --adopt';
              if(outcome==='refused-shrink')
                return 'this needs --force, NOT --adopt; read both term counts in the status file before deciding — run: '+EXPORTER+' --book '+slug+' --force';
              if(outcome==='refused-absent-baseline')
                return 'this book has no committed glossary, so there is nothing to compare against and BOTH gates are inert — a first export is unreviewed by construction. --force does NOT substitute here (it answers whether a shrink is intended). Decide what this book’s glossary should be, then run: '+EXPORTER+' --book '+slug+' --adopt';
              if(outcome==='refused-no-mapping')
                // ⚠ The tail used to promise '…after which it exports on the
                // next tick'. Since §C21 that is FALSE, and the false half was
                // the dangerous half: adding the row was the step that armed
                // an ungated write. It now lands on refused-absent-baseline
                // instead, which is correct and is a separate decision.
                return 'NO flag fixes this: add a book_subject_mapping row for '+slug+' (see migration 032). That alone does NOT make it export — a book with no committed glossary then refuses as refused-absent-baseline, which is correct: its first export is a separate, deliberate decision';
              return 'unrecognised refusal — read the status file on the box';
            };
            const advice=stale?' — unattended past the threshold; '+remedy(o.outcome,slug):'';
              console.log('  '+tag+' '+slug+': '+o.outcome+' ('+ageStr(o.since)+')'+advice);
            }
            for(const [slug,o] of errored){
              // An ERROR, not a refusal — --adopt does not fix this. detail
              // stays unavailable here (see above); read the status file.
              console.log('  ✗ '+slug+': error ('+ageStr(o.since)+') — NOT fixed by --adopt; see the status file on the box');
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
