#!/bin/sh
# Check the research-withdrawal model (ResearchWithdrawal.tla) with TLC. Exits 0 only when all three hold:
#   1. the rules hold without the sessions.db restore: NoSessionsRestore.cfg passes;
#   2. each known finding still fails, on its own rule, with the restore on. The model's SessionsRestore is
#      written by hand from the runbook, so a fix to the runbook or the code does NOT flip this by itself:
#      whoever fixes the restore path updates SessionsRestore to match, and then this step says so;
#   3. each mutant (one guard removed from the model) fails on the rule that guard protects, so every guard
#      the model credits to the code is shown to matter.
# Usage: server/verification/research-withdrawal/check.sh   (TLC jar from TLA2TOOLS_JAR or the cache)
set -eu
here=$(cd "$(dirname "$0")" && pwd)
jar=${TLA2TOOLS_JAR:-$HOME/.cache/tla/v1.7.4/tla2tools.jar}
want_sha=936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88   # tla2tools.jar v1.7.4

if [ ! -f "$jar" ]; then
  echo "TLC not found at $jar. Install it (see .claude/skills/verify-research-withdrawal/SKILL.md)." >&2
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
RULES='NoCaptureAfterWithdrawal DoneOnlyWhenTrue CopyAfterWithdrawalClean QuiescentClean'

# run NAME DIR CFG: TLC on DIR/ResearchWithdrawal.tla, run FROM DIR; output in $work/NAME.out.
# From DIR, because TLC resolves the module by name from its working directory: a mutant run from
# $work loads $work's unmutated copy instead, and every mutant "passes" (seen while building this).
run() {
  (cd "$work/$2" && java -XX:+UseParallelGC -cp "$jar" tlc2.TLC -workers 1 -metadir "$work/states-$1" \
     -config "$3" ResearchWithdrawal.tla > "$work/$1.out" 2>&1) || true
}
violated() { grep -aoE 'Invariant [A-Za-z]+ is violated' "$work/$1.out" | awk '{print $2}' | head -1; }
passed() { grep -aq 'Model checking completed. No error has been found.' "$work/$1.out"; }
path() { grep -aE '^State [0-9]+: <' "$work/$1.out" | sed -E 's/^State ([0-9]+): <([A-Za-z]+).*/  \1. \2/' || true; }

# cfg NAME RESTORE INVARIANTS...: write a config
# (POSIX sh has no locals: cfg's variables must not reuse mutant's `name`.)
cfg() {
  cfgname=$1; restore=$2; shift 2
  { echo 'SPECIFICATION Spec'; echo "CONSTANT SessionsRestoreOn = $restore"
    for inv in "$@"; do echo "INVARIANT $inv"; done; } > "$work/$cfgname.cfg"
}

cp "$here/ResearchWithdrawal.tla" "$work/"

# 1. the rules hold, restore off
cfg rules FALSE $RULES
run rules . rules.cfg
if passed rules; then
  echo "rules hold without the sessions.db restore: $(grep -aoE '[0-9]+ distinct states' "$work/rules.out")"
else
  echo "BROKEN: a rule fails without the sessions.db restore: $(violated rules)"; path rules; fail=1
fi

# 2. known findings, restore on: each must still fail on its own rule
for rule in QuiescentClean NoCaptureAfterWithdrawal; do
  cfg "find-$rule" TRUE "$rule"
  run "find-$rule" . "find-$rule.cfg"
  got=$(violated "find-$rule")
  if [ "$got" = "$rule" ]; then
    echo "known finding still present: $rule, shortest path:"; path "find-$rule"
  else
    echo "pinned finding no longer failing: $rule (got '${got:-pass}') — if the sessions.db restore was fixed on purpose, update SessionsRestore and remove the finding"
    fail=1
  fi
done

# 3. mutants, restore off: each must fail on the rule its guard protects
# mutant NAME RULE FROM TO: replace the exact text FROM (must occur once) with TO
mutant() {
  name=$1; rule=$2; from=$3; to=$4
  n=$(grep -cF -- "$from" "$here/ResearchWithdrawal.tla" || true)
  if [ "$n" != 1 ]; then echo "mutant $name: anchor found $n times — update check.sh"; fail=1; return; fi
  mkdir -p "$work/m-$name"
  # ENVIRON, not awk -v: -v would interpret the backslashes in TLA+'s \/ and \in
  F="$from" T="$to" awk 'BEGIN { f = ENVIRON["F"]; t = ENVIRON["T"] }
    { i = index($0, f); if (i) $0 = substr($0, 1, i-1) t substr($0, i+length(f)); print }' \
    "$here/ResearchWithdrawal.tla" > "$work/m-$name/ResearchWithdrawal.tla"
  cfg "m-$name/rules" FALSE $RULES
  run "m-$name" "m-$name" rules.cfg
  got=$(violated "m-$name")
  if [ "$got" = "$rule" ]; then echo "mutant caught: $name -> $rule"
  else
    if passed "m-$name"; then got_txt=pass; else got_txt="no verdict: TLC did not finish"; fi
    echo "MUTANT MISSED: $name (expected $rule, got '${got:-$got_txt}')"
    tail -n 4 "$work/m-$name.out" 2>/dev/null | sed 's/^/    tlc: /'
    fail=1
  fi
}
mutant due-without-key-clause QuiescentClean '(~done[i] \/ i \in k)' '(~done[i])'
mutant record-skips-research-delete DoneOnlyWhenTrue '/\ spc'"'"' = "resdel"' '/\ spc'"'"' = "record"'
mutant copy-without-recheck CopyAfterWithdrawalClean '/\ partial.has /\ Due = {}' '/\ partial.has'
mutant capture-ignores-withdrawal NoCaptureAfterWithdrawal 'Live == {i \in Intervals : consent[i] = "live"}' 'Live == {i \in Intervals : consent[i] # "none"}'

if [ "$fail" -eq 0 ]; then echo; echo "OK: rules hold, known findings pinned, every mutant caught"; else echo; echo FAIL; fi
exit "$fail"
