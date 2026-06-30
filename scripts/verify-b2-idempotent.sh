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

# A git worktree does NOT contain node_modules (gitignored, never checked out), so
# `node tools/cnxml-inject.js` there would ERR_MODULE_NOT_FOUND and — with failures
# tolerated below — every inject would silently no-op, yielding a VACUOUS "0 diff".
# Link the real repo's node_modules into each worktree (deps are identical across
# the two refs; inject only reads from node_modules).
ln -s "$(realpath node_modules)" "$WT_BASE/node_modules"
ln -s "$(realpath node_modules)" "$WT_CURR/node_modules"

# Re-inject every committed (book, track, chapter) combo inside a worktree.
# Returns via globals: INJECT_OK / INJECT_FAIL counts (a run that injects NOTHING
# must not be mistaken for a clean refactor — the caller asserts INJECT_OK > 0).
inject_all() {
  local W="$1"
  local trackdir book track src chdir base ch
  INJECT_OK=0; INJECT_FAIL=0
  shopt -s nullglob
  for trackdir in "$W"/books/*/03-translated/*/; do
    book=$(echo "$trackdir" | sed -E 's#.*/books/([^/]+)/03-translated/.*#\1#')
    track=$(basename "$trackdir")
    case "$track" in
      mt-preview) src=02-mt-output ;;
      faithful)   src=03-faithful-translation ;;
      localized)  src=04-localized-content ;;
      *) echo "unknown track: $track"; continue ;;
    esac
    for chdir in "$trackdir"ch*/ "$trackdir"appendices/; do
      [ -d "$chdir" ] || continue
      base=$(basename "$chdir")
      if [ "$base" = "appendices" ]; then ch="appendices"; else ch=$((10#${base#ch})); fi
      if ( cd "$W" && node tools/cnxml-inject.js --book "$book" --chapter "$ch" \
            --source-dir "$src" --track "$track" >/dev/null 2>&1 ); then
        INJECT_OK=$((INJECT_OK + 1))
      else
        INJECT_FAIL=$((INJECT_FAIL + 1))
      fi
    done
  done
}

echo "Injecting in baseline worktree..."; inject_all "$WT_BASE"
base_ok=$INJECT_OK; base_fail=$INJECT_FAIL
echo "  baseline: $base_ok injected, $base_fail failed/skipped"
echo "Injecting in current worktree...";  inject_all "$WT_CURR"
curr_ok=$INJECT_OK; curr_fail=$INJECT_FAIL
echo "  current:  $curr_ok injected, $curr_fail failed/skipped"

# Anti-vacuous guard: if nothing actually injected, a 0-diff is meaningless.
if [ "$base_ok" -eq 0 ] || [ "$curr_ok" -eq 0 ]; then
  echo "ABORT: zero successful injects (baseline=$base_ok current=$curr_ok) — gate would be vacuous."
  exit 3
fi

# A pure refactor must not change WHICH modules inject. If the success/failure
# split diverges, one side produced a fresh .cnxml where the other kept the stale
# committed copy — a "diff -rq" reports that as an uncounted "Only in:" line, so
# assert the counts match rather than rely on the content-diff alone.
if [ "$base_ok" -ne "$curr_ok" ] || [ "$base_fail" -ne "$curr_fail" ]; then
  echo "ABORT: inject success/failure split diverges (baseline $base_ok/$base_fail vs current $curr_ok/$curr_fail) — B2 changed which modules inject; investigate."
  exit 4
fi

echo "Diffing CNXML output (baseline vs current)..."
diffs=0
for b in "$WT_CURR"/books/*/; do
  book=$(basename "$b")
  [ -d "$WT_BASE/books/$book/03-translated" ] || continue
  # Exclude inject's timestamped *.backup.* files: safeWrite writes a per-run
  # backup whose name carries the wall-clock time, so it always "differs" — that
  # is run noise, not output. Count only real content differences ("X and Y differ").
  out=$(diff -rq --exclude='*.backup.*' \
          "$WT_BASE/books/$book/03-translated" "$WT_CURR/books/$book/03-translated" 2>/dev/null \
        | grep 'differ$')
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
