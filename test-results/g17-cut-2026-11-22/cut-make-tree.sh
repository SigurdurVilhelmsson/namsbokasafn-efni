#!/bin/bash
# Build a throwaway copy of the cut's base commit for the fresh-extraction landing condition (G1.7 design §8).
# No git worktree, no pipeline-output/ (safeWrite's logBackup would otherwise INSERT into a sessions.db there).
set -euo pipefail
BASE=ae833a0d1bf042f0818867b245f0739d7178eedd
REPO=/home/siggi/dev/repos/namsbokasafn-efni/.claude/worktrees/c46-bundle
OUT=/tmp/claude-1000/-home-siggi-dev-repos-namsbokasafn-efni--claude-worktrees-c46-bundle/65cf454c-c38e-4656-b54a-f1df1c1536f4/scratchpad/cut-extract
B=books/efnafraedi-2e
paths=(package.json server/package.json tools server/lib "$B/book-config.json" "$B/01-source/collection-order.json"
       "$B/02-for-mt" "$B/02-structure" "$B/02-mt-output")
for d in appendices ch00 ch01 ch02 ch03 ch04 ch05 ch06 ch07 ch08 ch09 ch10 ch11 ch12 ch13 ch14 ch15 ch16 ch17 ch18 ch19 ch20 ch21; do
  paths+=("$B/01-source/$d")
done
rm -rf "$OUT"
mkdir -p "$OUT"
git -C "$REPO" archive --format=tar "$BASE" -- "${paths[@]}" | tar -x -C "$OUT"
ln -s "$REPO/node_modules" "$OUT/node_modules"
test ! -e "$OUT/pipeline-output" && echo "no pipeline-output in the throwaway tree (logBackup writes nothing)"
echo "files: $(find "$OUT/$B" -type f | wc -l)  size: $(du -sh "$OUT" | cut -f1)"
