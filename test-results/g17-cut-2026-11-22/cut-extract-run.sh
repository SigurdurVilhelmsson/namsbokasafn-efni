#!/bin/bash
# G1.7 §8 landing condition 1: extract every chemistry chapter directory in the throwaway base tree (cwd = that
# tree, so BOOKS_DIR and logBackup resolve there), never with --output-dir. Logs per chapter; a start stamp for the
# mtime control. Then cut-extract-verify.cjs compares.
set -uo pipefail
S=/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni--claude-worktrees-c46-bundle/65cf454c-c38e-4656-b54a-f1df1c1536f4/scratchpad
OUT=$S/cut-extract
LOGS=$S/cut-extract-logs
rm -rf "$LOGS"; mkdir -p "$LOGS"
date -u +%s > "$LOGS/start-epoch"
cd "$OUT" || exit 9
fail=0
for ch in 0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 appendices; do
  node tools/cnxml-extract.js --book efnafraedi-2e --chapter "$ch" > "$LOGS/ch-$ch.out" 2> "$LOGS/ch-$ch.err"
  rc=$?
  echo "chapter $ch exit $rc"
  [ "$rc" -ne 0 ] && fail=1
done
test ! -e "$OUT/pipeline-output" && echo "still no pipeline-output in the throwaway tree"
echo "EXTRACT RUN DONE fail=$fail"
