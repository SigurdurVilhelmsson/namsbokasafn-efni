#!/usr/bin/env bash
# Re-derive every number in pred2/PREDICTIONS.md, 0 ISK (compose.py + the frozen r2 instruments only; no MT, no figure-run.js).
# Writes only under /home/siggi/dev/scratch-c140/plan/pred2. Figures are composed and measured ONE AT A TIME.
#
#   bash /home/siggi/dev/scratch-c140/plan/pred2/reproduce.sh [TREE [TAG]]
#
# TREE/TAG default to the FIXED scratch build (plan/tree-fix, tag FINAL). The previous prediction round
# (plan/pred, built from tree-int stage C) is read, never written: compare_prev.py, isolate.py and
# `fragility.py <prev>` use its work/out directories as the "previous build" column.
# To hold the REPOSITORY implementation to the predictions: copy the repo's experiments/figure-text-translation into
# scratch (never run inside the repo), pass that copy as TREE and a new TAG, then compare
# out/analysis-final-<TAG>.json / out/sentinels-<TAG>.json with the FINAL ones.
set -euo pipefail
export PYTHONDONTWRITEBYTECODE=1
P=/home/siggi/dev/scratch-c140/plan/pred2
PREV=/home/siggi/dev/scratch-c140/plan/pred
R2=/home/siggi/dev/scratch-c140/r2
TREE=${1:-/home/siggi/dev/scratch-c140/plan/tree-fix}
TAG=${2:-FINAL}
export TMPDIR=$P/tmp
cd "$P"
mkdir -p out logs tmp

echo "== controls: the adapted instruments reproduce the frozen r2 outputs"
for T in V0 V5_p2.0_f7.5; do
  env -u PRED_WORK_ROOT python3 -u instruments/measure.py "$T" > "logs/measure-$T.log" 2>&1
  cmp "out/measure-$T.jsonl" "$R2/measure-$T.jsonl" && echo "   measure-$T.jsonl byte-identical to frozen"
done
env -u PRED_WORK_ROOT python3 -u instruments/sentinels.py V5_p2.0_f7.5 > logs/sentinels-V5_p2.0_f7.5.log 2>&1
cmp out/sentinels-V5_p2.0_f7.5.json "$R2/sentinels-V5_p2.0_f7.5.json" && echo "   sentinels-V5_p2.0_f7.5.json byte-identical to frozen"
env -u PRED_WORK_ROOT python3 -u instruments/sentinels.py V5_p2.0_f7.5 --control > logs/sentinels-control-V5.log 2>&1
echo "   sentinels --control on V5: fires $(grep -c '"fires": true' logs/sentinels-control-V5.log) of 3; clean fires: $(grep -A1 '"clean"' logs/sentinels-control-V5.log | grep -c '"fires": true')"
python3 -u instruments/analyse.py control > logs/analyse-control.log 2>&1
cmp out/analysis-control.json "$R2/analysis.json" && echo "   analysis.json byte-identical to frozen"
cmp out/tables-control.md "$R2/tables.md" && echo "   tables.md byte-identical to frozen"

echo "== compose the 34 with $TREE as $TAG"
python3 -u instruments/run_final.py "$TREE" "$TAG" > "logs/run-$TAG.log" 2>&1; tail -1 "logs/run-$TAG.log"

echo "== measure / sentinels / analyse $TAG"
export PRED_WORK_ROOT=$P/work
python3 -u instruments/measure.py "$TAG" > "logs/measure-$TAG.log" 2>&1
python3 -u instruments/sentinels.py "$TAG" > "logs/sentinels-$TAG.log" 2>&1; head -1 "logs/sentinels-$TAG.log"
python3 -u instruments/sentinels.py "$TAG" --control > "logs/sentinels-control-$TAG.log" 2>&1
echo "   sentinels --control on $TAG: fires $(grep -c '"fires": true' "logs/sentinels-control-$TAG.log") of 3"
python3 -u instruments/analyse.py final "$TAG" > "logs/analyse-final-$TAG.log" 2>&1; tail -2 "logs/analyse-final-$TAG.log"

if [ "$TAG" = FINAL ]; then
  echo "== previous build vs fixed build, and per-fix isolation"
  python3 -u instruments/compare_prev.py > logs/compare_prev.log 2>&1; head -2 logs/compare_prev.log | cut -c1-160
  python3 -u instruments/isolate.py > logs/isolate.log 2>&1; grep -E '^CONTROL|^F[0-9]:|^ALL:' logs/isolate.log
  python3 -u instruments/r9_variants.py > logs/r9_variants.log 2>&1; grep -E '^\{|^symbols_vs_off|^literal_vs_symbols|^bound' logs/r9_variants.log | cut -c1-160
  echo "== supplementary (labelled, not frozen verdicts)"
  python3 -u instruments/attribute.py > logs/attribute.log 2>&1; grep CONTROL logs/attribute.log
  python3 -u instruments/fragility.py > logs/fragility.log 2>&1; head -3 logs/fragility.log
  python3 -u instruments/fragility.py "$PREV/inst-C" "$PREV/work/FINAL" fragility-prev.json > logs/fragility-prev.log 2>&1; head -3 logs/fragility-prev.log
  python3 -u instruments/supplementary.py > logs/supplementary.log 2>&1
  python3 -u instruments/supp_render.py FINAL hinted > logs/supp-FINAL-hinted.log 2>&1
  cmp out/measure-FINAL.SUPP-hinted.jsonl out/measure-FINAL.jsonl && echo "   supp_render control: hinted runner byte-identical to measure-FINAL.jsonl"
  python3 -u instruments/supp_render.py FINAL linear > logs/supp-FINAL-linear.log 2>&1
  env -u PRED_WORK_ROOT python3 -u instruments/supp_render.py V5_p2.0_f7.5 linear > logs/supp-V5-linear.log 2>&1
  python3 -u instruments/pred_numbers.py > out/numbers.txt 2>&1; echo "   numbers -> out/numbers.txt"
fi
