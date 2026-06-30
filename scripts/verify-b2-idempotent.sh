#!/usr/bin/env bash
#
# B2 pure-refactor verification gate.
#
# Proves that the producer-provenance routing change (B2) does NOT alter inject's
# output: it re-injects every committed (book, track, chapter) combo using BOTH the
# baseline code and the current branch, in isolated worktrees, and asserts the
# produced CNXML is byte-identical between the two.
#
# Why baseline-vs-current (not current-vs-committed): the committed 03-translated
# files are partly STALE (some were injected by an older renderer pre-#179..#183),
# and a handful of chapters fail to inject for pre-existing reasons (missing
# translations; A2 residue gate). Both conditions are identical on each side, so
# comparing the two FRESH inject runs cancels them out and isolates B2's effect.
# Comparing against the committed files would red-flag for those pre-existing
# reasons and tell us nothing about B2.
#
# Usage: scripts/verify-b2-idempotent.sh [BASELINE_REF]
#   BASELINE_REF defaults to the merge-base with main (the commit B2 branched from).
#
# Exit 0 => byte-identical (pure refactor). Exit 1 => a real divergence to investigate.

set -uo pipefail

BASELINE_REF="${1:-$(git merge-base main HEAD)}"
CURRENT_REF="$(git rev-parse HEAD)"

TMP="$(mktemp -d)"
WT_BASE="$TMP/baseline"
WT_CURR="$TMP/current"

cleanup() {
  git worktree remove --force "$WT_BASE" 2>/dev/null || true
  git worktree remove --force "$WT_CURR" 2>/dev/null || true
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "Baseline: $BASELINE_REF"
echo "Current:  $CURRENT_REF"
git worktree add --quiet --detach "$WT_BASE" "$BASELINE_REF"
git worktree add --quiet --detach "$WT_CURR" "$CURRENT_REF"

# Re-inject every committed (book, track, chapter) combo inside a worktree.
inject_all() {
  local W="$1"
  local trackdir book track src chdir base ch
  shopt -s nullglob
  for trackdir in "$W"/books/*/03-translated/*/; do
    book=$(echo "$trackdir" | sed -E 's#.*/books/([^/]+)/03-translated/.*#\1#')
    track=$(basename "$trackdir")
    case "$track" in
      mt-preview) src=02-mt-output ;;
      faithful)   src=03-faithful-translation ;;
      localized)  src=04-localized-content ;;
      *) echo "unknown track: $track"; return 2 ;;
    esac
    for chdir in "$trackdir"ch*/ "$trackdir"appendices/; do
      [ -d "$chdir" ] || continue
      base=$(basename "$chdir")
      if [ "$base" = "appendices" ]; then ch="appendices"; else ch=$((10#${base#ch})); fi
      ( cd "$W" && node tools/cnxml-inject.js --book "$book" --chapter "$ch" \
          --source-dir "$src" --track "$track" >/dev/null 2>&1 ) || true
    done
  done
}

echo "Injecting in baseline worktree..."; inject_all "$WT_BASE"
echo "Injecting in current worktree...";  inject_all "$WT_CURR"

echo "Diffing CNXML output (baseline vs current)..."
diffs=0
for b in "$WT_CURR"/books/*/; do
  book=$(basename "$b")
  [ -d "$WT_BASE/books/$book/03-translated" ] || continue
  out=$(diff -rq "$WT_BASE/books/$book/03-translated" "$WT_CURR/books/$book/03-translated" 2>/dev/null \
        | grep '\.cnxml')
  if [ -n "$out" ]; then
    echo "$out"
    diffs=$((diffs + $(echo "$out" | wc -l)))
  fi
done

if [ "$diffs" -eq 0 ]; then
  echo "BYTE-IDENTICAL ✓ — B2 is a pure refactor (baseline $BASELINE_REF == current $CURRENT_REF)"
  exit 0
else
  echo "DIFF DETECTED ✗ — $diffs CNXML file(s) differ between baseline and current. Investigate B2."
  exit 1
fi
