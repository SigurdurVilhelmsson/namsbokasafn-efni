#!/bin/bash
# run1.sh <src> <dst.png> <w> <h> <budgetMs> : one bounded Chromium load + RSS sampling (descendants of my node only) + survivor kill
SRC=$1; DST=$2; W=$3; H=$4; B=$5
AV=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
if [ "$AV" -lt 2560 ]; then echo "{\"abort\":\"MemAvailable ${AV} MiB < 2560\"}"; exit 3; fi
PRE=$(pgrep -x headless_shell; pgrep -x chrome; pgrep -x chrome-headless)
HARD=$(( B/1000 + 40 ))
timeout -k 5 ${HARD}s node /home/siggi/dev/scratch-c140/exo/tools/render-exo.mjs "$SRC" "$DST" "$W" "$H" "$B" > "$DST.json" 2> "$DST.err" &
NPID=$!
PEAK=0; MINAV=$AV; SEEN=""
desc() { local k; for k in $(pgrep -P $1); do echo $k; desc $k; done; }
while kill -0 $NPID 2>/dev/null; do
  S=0; D=$(desc $NPID)
  for p in $D; do SEEN="$SEEN $p"; r=$(awk '/VmRSS/{print $2}' /proc/$p/status 2>/dev/null); S=$((S + ${r:-0})); done
  [ $S -gt $PEAK ] && PEAK=$S
  A=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo); [ $A -lt $MINAV ] && MINAV=$A
  if [ $A -lt 1800 ]; then echo "MEM EMERGENCY avail ${A}MiB: killing" >> "$DST.err"; kill -9 $D $NPID 2>/dev/null; fi
  sleep 0.5
done
wait $NPID; RC=$?
SURV=""; for p in $(echo $SEEN | tr ' ' '\n' | sort -u); do [ -d /proc/$p ] && SURV="$SURV $p"; done
[ -n "$SURV" ] && kill -9 $SURV 2>/dev/null && sleep 1
POST=$(pgrep -x headless_shell; pgrep -x chrome; pgrep -x chrome-headless)
echo "$(cat "$DST.json" 2>/dev/null | tr -d '\n') rc=$RC peakRssSumMiB=$((PEAK/1024)) minAvailMiB=$MINAV availBeforeMiB=$AV mySurvivorsKilled=[$SURV] browserPidsBefore=[$(echo $PRE)] browserPidsAfter=[$(echo $POST)]"
