#!/bin/sh
# Check the G1.13 assign-gate model (AssignGate.tla) with TLC. Exits 0 only when all three hold:
#   1. the rules hold: AssignGate.cfg passes;
#   2. each known finding still fails, on its own rule (a finding that starts passing means the
#      code or the model changed, and someone must look);
#   3. each mutant (one guard removed: a gate check in GateAllows, or the licence-removal refusal in
#      RemoveLicence) fails on the rule that guard protects, so no guard is left unguarded by the model.
# Usage: server/verification/assign-gate/check.sh            (TLC jar from TLA2TOOLS_JAR or the cache)
set -eu
here=$(cd "$(dirname "$0")" && pwd)
jar=${TLA2TOOLS_JAR:-$HOME/.cache/tla/v1.7.4/tla2tools.jar}
want_sha=936a262061c914694dfd669a543be24573c45d5aa0ff20a8b96b23d01e050e88   # tla2tools.jar v1.7.4

if [ ! -f "$jar" ]; then
  echo "TLC not found at $jar. Install it (see .claude/skills/verify-assign-gate/SKILL.md)." >&2
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

# run NAME CFG TLAFILE: TLC on a copy in $work; output in $work/NAME.out
run() {
  (cd "$work" && java -XX:+UseParallelGC -cp "$jar" tlc2.TLC -workers 1 -metadir "$work/states-$1" \
     -config "$2" "$3" > "$work/$1.out" 2>&1) || true
}

# path NAME: the actions of TLC's shortest counterexample, one per line
path() {
  grep -aE '^State [0-9]+: <' "$work/$1.out" | sed -E 's/^State ([0-9]+): <([A-Za-z]+).*/  \1. \2/' || true
}

# violated NAME: the rule TLC reports as broken, or nothing
violated() {
  sed -nE 's/^Error: (Invariant|Action property|Temporal properties were violated)[^A-Za-z]*([A-Za-z]+).*/\2/p' \
    "$work/$1.out" | head -1
}

cp "$here/AssignGate.tla" "$here/AssignGate.cfg" "$work/"

# 1. The rules hold.
run main AssignGate.cfg AssignGate.tla
if grep -q '^Model checking completed. No error has been found.' "$work/main.out"; then
  echo "PASS rules: $(sed -nE 's/^([0-9,]+) states generated, ([0-9,]+) distinct states found.*/\2 distinct states/p' "$work/main.out"), depth $(sed -nE 's/^The depth of the complete state graph search is ([0-9]+).*/\1/p' "$work/main.out")"
else
  fail=1
  echo "FAIL rules: rule broken: $(violated main)"
  path main
  sed -n '/^Error:/,$p' "$work/main.out" | head -40
fi

# 1b. With the layer NOT fable, the real gate refuses every assignment: no row, no opening, rules hold.
mkdir -p "$work/mtlayer"
cp "$here/AssignGate.tla" "$work/mtlayer/"
sed 's/Layer = "fable"/Layer = "mt-output"/' "$here/AssignGate.cfg" > "$work/mtlayer/AssignGate.cfg"
(cd "$work/mtlayer" && java -XX:+UseParallelGC -cp "$jar" tlc2.TLC -workers 1 -metadir "$work/mtlayer/states" \
   -config AssignGate.cfg AssignGate.tla > "$work/mtlayer.out" 2>&1) || true
if grep -q '^Model checking completed. No error has been found.' "$work/mtlayer.out"; then
  echo "PASS layer not fable: the gate refuses every assignment, nothing opens"
else
  fail=1; echo "FAIL layer not fable: rule broken: $(violated mtlayer)"; path mtlayer
fi

# 2. The known findings still fail, each on its own rule.
for rule in OnlyEditorsHoldRows OnlyEditorsOpen; do
  printf 'SPECIFICATION Spec\nCONSTANTS\n  Users = {u1, u2}\n  Chapters = {0, 1}\n  Layer = "fable"\nINVARIANT %s\n' "$rule" > "$work/$rule.cfg"
  run "$rule" "$rule.cfg" AssignGate.tla
  if [ "$(violated "$rule")" = "$rule" ]; then
    echo "KNOWN FINDING still present: $rule"
    path "$rule"
  else
    fail=1
    echo "CHANGED: known finding $rule no longer fails (or TLC errored): the code or the model moved; look before trusting anything"
    tail -5 "$work/$rule.out"
  fi
done

# 3. Each mutant fails on the rule its guard protects. A pair is "<marker>|<rule>"; the marker is the
#    comment that ends the guard's line in AssignGate.tla, and the mutant is the model without that line.
for pair in "gate: chapter-not-editable|NoChapterZero" "gate: bypass-role|RowsCreatedOnlyForEditors" \
            "gate: no-consent-decision|ConsentBeforeOpening" "gate: no-licence-clause|EveryRowHolderHasLicence" \
            "gate: served-layer-not-fable|OpensOnlyWhenFableServed" \
            "removal: holds-chapter|EveryRowHolderHasLicence"; do
  marker=${pair%%|*}; rule=${pair#*|}
  reason=$(printf '%s' "${marker#*: }")
  mdir="$work/mutant-$reason"; mkdir -p "$mdir"
  grep -v "$marker\$" "$here/AssignGate.tla" > "$mdir/AssignGate.tla"
  if cmp -s "$here/AssignGate.tla" "$mdir/AssignGate.tla"; then
    fail=1; echo "MUTANT $reason: no line marked '$marker' in AssignGate.tla; the model and this script disagree"; continue
  fi
  cp "$here/AssignGate.cfg" "$mdir/"
  # The layer guard only bites when the layer is not fable, so that mutant runs with "mt-output".
  if [ "$reason" = "served-layer-not-fable" ]; then
    sed -i 's/Layer = "fable"/Layer = "mt-output"/' "$mdir/AssignGate.cfg"
  fi
  (cd "$mdir" && java -XX:+UseParallelGC -cp "$jar" tlc2.TLC -workers 1 -metadir "$mdir/states" \
     -config AssignGate.cfg AssignGate.tla > "$work/mutant-$reason.out" 2>&1) || true
  got=$(violated "mutant-$reason")
  if [ "$got" = "$rule" ]; then
    echo "MUTANT without '$reason' is caught by $rule"
  else
    fail=1
    echo "MUTANT without '$reason' NOT caught by $rule (TLC reported: ${got:-no violation})"
  fi
done

if [ "$fail" -eq 0 ]; then echo "OK: rules hold, known findings pinned, every guard covered by a rule"; fi
exit "$fail"
