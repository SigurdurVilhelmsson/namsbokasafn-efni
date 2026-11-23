#!/bin/sh
# Check the MT lock / study-freeze model (MtLock.tla) with TLC, then replay its findings on the real code.
# Exits 0 only when all four hold:
#   1. the rules hold when the writers never overlap (Sequential, one tree, every actor);
#   2. each known finding still fails, on its own rule, in its own configuration (narrow pins: a finding
#      configuration failing on a DIFFERENT rule is an error too);
#   3. each model mutant (one guard the model credits to the code removed) fails on the rule it protects;
#   4. replay.mjs: every finding still reproduces on the real functions and every real guard holds.
# Usage: sh server/verification/mt-lock/check.sh   (TLC jar from TLA2TOOLS_JAR or the cache; well under a minute)
set -eu
here=$(cd "$(dirname "$0")" && pwd)
jar=${TLA2TOOLS_JAR:-$HOME/.cache/tla/v1.7.4/tla2tools.jar}
want_sha=936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88   # tla2tools.jar v1.7.4

if [ ! -f "$jar" ]; then
  echo "TLC not found at $jar. Install it (see .claude/skills/verify-mt-lock/SKILL.md)." >&2
  exit 2
fi
got_sha=$(sha256sum "$jar" | cut -d' ' -f1)
if [ "$got_sha" != "$want_sha" ]; then
  echo "TLC jar hash $got_sha is not v1.7.4's ($want_sha); refusing to trust its verdicts." >&2
  exit 2
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
fail=0
ALL='{"at", "srv", "fz", "e2e"}'

# cfg FILE ACTORS TWOTREES SEQUENTIAL: write a config checking every rule
cfg() {
  { echo 'SPECIFICATION Spec'; echo "CONSTANT Actors = $2"; echo "CONSTANT TwoTrees = $3"
    echo "CONSTANT Sequential = $4"
    for inv in TypeOK BaseFixedWhileLocked FreezeKept LockedOnceEdited; do echo "INVARIANT $inv"; done
  } > "$1"
}
# run NAME DIR: TLC on DIR/MtLock.tla with DIR/NAME.cfg, run FROM DIR (TLC resolves the module from its
# working directory, so a mutant run from elsewhere would load the unmutated copy and "pass").
# -deadlock: every actor finishing is a normal end, not an error.
run() {
  (cd "$work/$2" && java -XX:+UseParallelGC -cp "$jar" tlc2.TLC -deadlock -workers 1 \
     -metadir "$work/states-$1" -config "$1.cfg" MtLock.tla > "$work/$1.out" 2>&1) || true
}
violated() { grep -aoE 'Invariant [A-Za-z]+ is violated' "$work/$1.out" | awk '{print $2}' | head -1; }
passed() { grep -aq 'Model checking completed. No error has been found.' "$work/$1.out"; }
path() { grep -aE '^State [0-9]+: <' "$work/$1.out" | sed -E 's/^State ([0-9]+): <([A-Za-z0-9]+).*/  \1. \2/' || true; }

mkdir -p "$work/base"
cp "$here/MtLock.tla" "$work/base/"

# 1. the rules hold when no two writers overlap
cfg "$work/base/rules.cfg" "$ALL" FALSE TRUE
run rules base
if passed rules; then
  echo "rules hold when the writers never overlap: $(grep -aoE '[0-9]+ distinct states' "$work/rules.out")"
else
  echo "BROKEN: a rule fails even with no overlap: $(violated rules)"; path rules; fail=1
fi

# 2. known findings: NAME RULE ACTORS TWOTREES SEQUENTIAL
finding() {
  cfg "$work/base/$1.cfg" "$3" "$4" "$5"
  run "$1" base
  got=$(violated "$1")
  if [ "$got" = "$2" ]; then
    echo "known finding still present: $1 -> $2, shortest path:"; path "$1"
  else
    echo "PINNED FINDING CHANGED: $1 (expected $2, got '${got:-pass}') — if fixed on purpose, update the model and the skill, then this pin"
    fail=1
  fi
}
finding F1-editing-lock-mid-run BaseFixedWhileLocked '{"at", "srv"}' FALSE FALSE
finding F1-freeze-mid-run       BaseFixedWhileLocked '{"at", "fz"}'  FALSE FALSE
finding F2-freeze-replaced      FreezeKept           '{"srv", "fz"}' FALSE FALSE
finding F3-sweep-deletes-freeze FreezeKept           '{"fz", "e2e"}' FALSE FALSE
# the same with study-freeze on prod: a git pull between the e2e snapshot and the sweep brings the marker
finding F3-via-git-pull         FreezeKept           '{"fz", "e2e"}' TRUE  FALSE
finding F4-other-tree-lock      BaseFixedWhileLocked '{"at", "srv"}' TRUE  TRUE

# 3. model mutants, in the passing configuration: NAME RULE FROM TO (FROM must occur on exactly one line)
mutant() {
  name=$1; rule=$2; from=$3; to=$4
  n=$(grep -cF -- "$from" "$here/MtLock.tla" || true)
  if [ "$n" != 1 ]; then echo "mutant $name: anchor found on $n lines — update check.sh"; fail=1; return; fi
  mkdir -p "$work/m-$name"
  # ENVIRON, not awk -v: -v would interpret the backslashes in TLA+'s /\ and \/
  F="$from" T="$to" awk 'BEGIN { f = ENVIRON["F"]; t = ENVIRON["T"] }
    { i = index($0, f); if (i) $0 = substr($0, 1, i-1) t substr($0, i+length(f)); print }' \
    "$here/MtLock.tla" > "$work/m-$name/MtLock.tla"
  cfg "$work/m-$name/m-$name.cfg" "$ALL" FALSE TRUE
  run "m-$name" "m-$name"
  got=$(violated "m-$name")
  if [ "$got" = "$rule" ]; then echo "mutant caught: $name -> $rule"
  else
    if passed "m-$name"; then got_txt=pass; else got_txt="no verdict: TLC did not finish"; fi
    echo "MUTANT MISSED: $name (expected $rule, got '${got:-$got_txt}')"
    tail -n 4 "$work/m-$name.out" 2>/dev/null | sed 's/^/    tlc: /'
    fail=1
  fi
}
mutant at-ignores-lock          BaseFixedWhileLocked 'IF IsMtLocked("dev")' 'IF FALSE'
mutant writemtlock-no-exists    FreezeKept           'IF marker[t] # "none"' 'IF FALSE'
# (it breaks FreezeKept too; TLC's breadth-first search reports the shorter path, a person's lock deleted)
mutant sweep-ignores-snapshot   LockedOnceEdited     'marker["dev"] # "none" /\ ~snap' 'marker["dev"] # "none"'

# 4. the real code
echo
if node "$here/replay.mjs"; then :; else fail=1; fi

if [ "$fail" -eq 0 ]; then echo; echo "OK: rules hold without overlap, known findings pinned, every mutant caught, replay agrees"
else echo; echo FAIL; fi
exit "$fail"
