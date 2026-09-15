#!/bin/bash
# one.sh <src> <dst.png> <w> <h> <budgetMs> : one bounded load, mem gate, RSS peak of my tree, survivor check + kill
SRC=$1; DST=$2; W=$3; H=$4; B=$5
AVK=$(awk '/MemAvailable/{print $2}' /proc/meminfo); AV=$((AVK/1024))
if [ $AV -lt 2560 ]; then echo "{\"abort\":\"MemAvailable ${AV}MiB<2560\"}"; exit 3; fi
HARD=$(( B/1000*2 + 30 )); [ $HARD -gt 300 ] && HARD=300
setsid timeout -k 5 ${HARD}s node /home/siggi/dev/scratch-c140/exo-v/tools/rend.mjs "$SRC" "$DST" "$W" "$H" "$B" > "$DST.json" 2> "$DST.err" &
NP=$!
PEAK=0; MINAV=$AV; SEEN=""
kids() { local k; for k in $(pgrep -P $1); do echo $k; kids $k; done; }
while kill -0 $NP 2>/dev/null; do
  S=0; for p in $(kids $NP); do SEEN="$SEEN $p"; r=$(awk '/VmRSS/{print $2}' /proc/$p/status 2>/dev/null); S=$((S+${r:-0})); done
  [ $S -gt $PEAK ] && PEAK=$S
  A=$(( $(awk '/MemAvailable/{print $2}' /proc/meminfo)/1024 )); [ $A -lt $MINAV ] && MINAV=$A
  if [ $A -lt 1800 ]; then echo "MEMKILL avail=${A}" >> "$DST.err"; kill -9 $(kids $NP) $NP 2>/dev/null; fi
  sleep 0.5
done
wait $NP; RC=$?
SURV=""; for p in $(echo $SEEN | tr ' ' '\n' | sort -u); do [ -d /proc/$p ] && SURV="$SURV $p($(cat /proc/$p/comm 2>/dev/null))"; done
if [ -n "$SURV" ]; then kill -9 $(echo $SURV | sed 's/([^)]*)//g') 2>/dev/null; sleep 1; fi
POST="$(pgrep -x headless_shell) $(pgrep -x chrome) $(pgrep -x chrome-headless)"
echo "$(tr -d '\n' < "$DST.json") rc=$RC peakTreeRssMiB=$((PEAK/1024)) minAvailMiB=$MINAV availBefore=$AV survivorsKilled=[$SURV] browserPidsAfter=[$(echo $POST)]"
