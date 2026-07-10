#!/usr/bin/env bash
#
# rerender-remediation-delivery.sh — LEAD-GATE re-render for the Fable RUN 4–6
# remediation + Phase-1 + GI-1 delivery. Renders the merged renderer fixes
# (E3 R4-6 link-leak, E5 R5-1 alpha lists, E6 R4-1 reading order, E7 R4-2/3
# table/appendix numbering, E8 R4-4 emphasis, E9 R4-5 exercise-figure dedup) into
# books/*/05-publication/, PROVES the E3 fidelity gate flips RED→GREEN, runs
# spot-checks, then PRINTS the sync/deploy steps. It does NOT sync to vefur and
# does NOT deploy (those are cross-repo / prod and stay a manual lead step).
#
# SAFE BY DEFAULT — dry-run unless you pass --run:
#   scripts/rerender-remediation-delivery.sh          # dry-run: pre-checks + plan, renders NOTHING
#   scripts/rerender-remediation-delivery.sh --run     # execute the re-render + verification
#
# Design notes (why this exists rather than the one-line loop in the plan):
#   * fail-loud: `set -euo pipefail`; every render's exit code is checked, so a
#     mid-loop failure ABORTS instead of silently deleting-then-not-rewriting HTML
#     across later chapters (register P1-4).
#   * appendix-structure integrity is validated BEFORE any render (a corrupt
#     appendices *-structure.json would make R4-12's fail-loud abort mid-loop).
#   * only (track,chapter) pairs whose 03-translated input exists are rendered.
set -euo pipefail

# ── args / mode ──────────────────────────────────────────────────────────────
RUN=0
[[ "${1:-}" == "--run" ]] && RUN=1
mode=$([[ $RUN == 1 ]] && echo "RUN (will write 05-publication)" || echo "DRY-RUN (renders nothing)")

# ── 0. environment ──────────────────────────────────────────────────────────
cd "$(dirname "$0")/.."                      # repo root
[[ -f tools/cnxml-render.js ]] || { echo "ERROR: run from the efni repo (tools/cnxml-render.js not found)"; exit 1; }
node_major=$(node -v | sed 's/v\([0-9]*\).*/\1/')
[[ "$node_major" == "22" ]] || echo "WARN: Node $(node -v) — project pins Node 22.x (.nvmrc). Consider 'nvm use'."
echo "=== Remediation-delivery re-render — $mode ==="
echo "repo: $(pwd)   node: $(node -v)"
echo ""

# ── 1. appendix-structure integrity pre-check (P1-4) ────────────────────────
echo "── 1. Appendix-structure integrity (must pass before any render) ──"
node --input-type=module -e '
import { buildAppendixIdMap } from "./tools/cnxml-render.js";
let ok = true;
for (const track of ["mt-preview", "faithful"]) {
  try {
    const { moduleLetters } = buildAppendixIdMap("efnafraedi-2e", track);
    console.log(`  efnafraedi-2e/${track}: OK — ${moduleLetters.size} appendix letters`);
  } catch (e) { console.error(`  ❌ efnafraedi-2e/${track}: ${e.message}`); ok = false; }
}
process.exit(ok ? 0 : 1);
' || { echo "ABORT: corrupt appendix structure — fix before re-rendering (register P1-4)."; exit 1; }
echo ""

# ── 2. E3 gate BEFORE (expect RED: raw <link> leak on liffraedi ch03) ───────
gate_scan() {  # $1 = label; scans liffraedi ch03 3-1..3-5 for raw-<link> leaks
  node --input-type=module -e '
    import { findRawCnxmlLeaks } from "./tools/cnxml-render-fidelity-check.js";
    import fs from "fs";
    const dir = "books/liffraedi-2e/05-publication/mt-preview/chapters/03";
    let leaks = 0;
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      if (!/^3-[1-5]-/.test(f)) continue;
      const L = findRawCnxmlLeaks(fs.readFileSync(`${dir}/${f}`, "utf8"));
      if (L.some((x) => x.pattern === "link")) { console.log(`     LEAK ${f}`); leaks++; }
    }
    console.log(`  '"$1"': ${leaks} leaking page(s)`);
    process.exit(leaks);   // exit code = leak count (0 = GREEN)
  '
}
echo "── 2. E3 fidelity gate BEFORE re-render (expect RED / leaks present) ──"
set +e; gate_scan "before"; before_leaks=$?; set -e
echo ""

# ── 3. build the render plan (only pairs with 03-translated input) ──────────
chapdir() { [[ "$1" == "appendices" ]] && echo appendices || printf 'ch%02d' "$1"; }
declare -a PLAN
add_if_exists() {  # $1 book, $2 track, $3 chapter
  local d="books/$1/03-translated/$2/$(chapdir "$3")"
  [[ -d "$d" ]] && PLAN+=("$1|$2|$3")
  return 0   # absence is not a failure (don't trip `set -e` in the build loop)
}
for ch in $(seq 0 21) appendices; do add_if_exists efnafraedi-2e mt-preview "$ch"; done
for ch in $(seq 0 21) appendices; do add_if_exists efnafraedi-2e faithful   "$ch"; done
for ch in 3 5;                     do add_if_exists liffraedi-2e mt-preview "$ch"; done

echo "── 3. Render plan: ${#PLAN[@]} (book,track,chapter) pairs with translated input ──"
printf '   %s\n' "${PLAN[@]}" | sed 's/|/  /g'
echo ""

# ── dry-run stops here ──────────────────────────────────────────────────────
if [[ $RUN == 0 ]]; then
  echo "DRY-RUN complete. Pre-checks passed; E3 gate is currently ${before_leaks} leak(s) (expected >0 before re-render)."
  echo "Re-run with --run to execute the ${#PLAN[@]}-render delivery."
  exit 0
fi

# ── 4. RENDER (exit code checked per iteration) ─────────────────────────────
echo "── 4. Rendering (${#PLAN[@]} pairs; aborts on the first failure) ──"
i=0
for entry in "${PLAN[@]}"; do
  IFS='|' read -r book track ch <<< "$entry"
  i=$((i+1))
  printf '   [%2d/%2d] %s %s ch=%s ... ' "$i" "${#PLAN[@]}" "$book" "$track" "$ch"
  if node tools/cnxml-render.js --book "$book" --chapter "$ch" --track "$track" >/tmp/rr-$$.log 2>&1; then
    echo "ok"
  else
    echo "FAILED"; echo "----- render output -----"; tail -30 /tmp/rr-$$.log
    echo "ABORT at $book/$track/ch$ch (exit non-zero). 05-publication may be partially updated;"
    echo "inspect, fix, and re-run — the render tool backs up each file before writing."
    rm -f /tmp/rr-$$.log; exit 1
  fi
done
rm -f /tmp/rr-$$.log
echo ""

# ── 5. verification ─────────────────────────────────────────────────────────
echo "── 5. Verification ──"
echo "E3 gate AFTER (hard-assert 0 leaks):"
set +e; gate_scan "after"; after_leaks=$?; set -e
[[ $after_leaks -eq 0 ]] || { echo "❌ E3 gate STILL RED after re-render ($after_leaks) — investigate before syncing."; exit 1; }
echo "  ✅ E3 gate GREEN (was $before_leaks, now 0)"

echo "Spot-checks (diagnostic — review, non-fatal):"
# E7 — appendix labels: 'Tafla appendices.N' gone, per-letter 'Tafla B…' present
ap="books/efnafraedi-2e/05-publication/mt-preview/chapters/appendices"
echo "  E7 'Tafla appendices.' residual: $(grep -rho 'Tafla appendices\.[0-9]*' "$ap" 2>/dev/null | wc -l) (want 0)"
echo "  E7 per-letter 'Tafla [A-M]' labels: $(grep -rhoE 'Tafla [A-M][0-9]+' "$ap" 2>/dev/null | sort -u | tr '\n' ' ')"
# E9 — para-nested exercise figure once per page
for f in books/efnafraedi-2e/05-publication/*/chapters/10/10-exercises.html; do
  [[ -f "$f" ]] && echo "  E9 CNX_Chem_10_02_Needlefloa in ${f#books/*/05-publication/}: $(grep -c 'CNX_Chem_10_02_Needlefloa' "$f") (want 1)"
done
# E5 — ch04 alpha list
echo "  E5 lower-alpha lists in efnafraedi ch04: $(grep -rho 'list-style-type: lower-alpha' books/efnafraedi-2e/05-publication/*/chapters/04/ 2>/dev/null | wc -l) (want ≥1)"
# global — no literal bracket markers survived
echo "  literal [[…]] markers across efnafraedi HTML: $(grep -rhoE '\[\[[a-z]+:' books/efnafraedi-2e/05-publication/ 2>/dev/null | wc -l) (want 0)"
echo ""

# ── 6. next steps (manual — NOT run here) ───────────────────────────────────
cat <<'NEXT'
── 6. NEXT (manual, not run by this script) ──
  a. Fidelity baselines (P0-7): after this re-render the liffraedi ch03 +
     lifraen-efnafraedi shape-histograms shift (raw <link> → real <a>). Re-run
     the fidelity baseline update — that diff is EXPECTED, not a revert.
  b. Reader indexes are already committed + current (biology + physics + chemistry
     index.json); the sync picks them up. (Only regenerate with an ABSOLUTE --toc
     if content changed — register P1-2.)
  c. Commit the re-rendered 05-publication (the 2h git-backup cron also stages it):
       git add books/*/05-publication && git commit -m "content: re-render remediation delivery (Fable RUN 4-6 + Phase-1 + GI-1)"
  d. SYNC to vefur (from the vefur repo) — this also re-runs generate-toc, which
     sets toc.index / toc.glossary and activates biology+physics Atriðisorðaskrá,
     Orðasafn gating, and vefur PR #188 (V1/V2/V3):
       (cd ../namsbokasafn-vefur && node scripts/sync-content.js --source ../namsbokasafn-efni)
  e. DEPLOY per the standard flow.
  Post-deploy spot-check: no literal [[…]] markers; table numbers match OpenStax;
  7.3 reading order correct; no raw <link> on biology ch03; ch04 MC options a/b/c.
NEXT
echo "Done."
