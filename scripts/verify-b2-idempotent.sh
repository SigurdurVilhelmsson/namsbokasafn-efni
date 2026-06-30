#!/usr/bin/env bash
# B2 acceptance: re-inject every committed (book, track, chapter) and assert
# the produced CNXML is byte-identical to what is committed. Reverts after.
set -uo pipefail
fail=0
shopt -s nullglob
for trackdir in books/*/03-translated/*/; do
  book=$(echo "$trackdir" | cut -d/ -f2)
  track=$(basename "$trackdir")
  case "$track" in
    mt-preview) src=02-mt-output ;;
    faithful)   src=03-faithful-translation ;;
    localized)  src=04-localized-content ;;
    *) echo "unknown track: $track"; exit 2 ;;
  esac
  for chdir in "$trackdir"ch*/ "$trackdir"appendices/; do
    [ -d "$chdir" ] || continue
    base=$(basename "$chdir")
    if [ "$base" = "appendices" ]; then ch="appendices"; else ch=$((10#${base#ch})); fi
    node tools/cnxml-inject.js --book "$book" --chapter "$ch" --source-dir "$src" --track "$track" \
      >/dev/null 2>&1 || { echo "inject FAILED: $book ch=$ch track=$track"; fail=1; }
  done
done

if git diff --quiet -- 'books/*/03-translated/**/*.cnxml'; then
  echo "BYTE-IDENTICAL ✓ — B2 is a pure refactor"
else
  echo "DIFF DETECTED ✗"
  git diff --stat -- 'books/*/03-translated/**/*.cnxml'
  fail=1
fi

# revert any tool side-effects (CNXML, error/residue manifests)
# NOTE: original brief used 'books/*/...' globs; git checkout does not expand
# double-star pathspecs in quoted args on all git versions — using books/ instead.
git checkout -- books/ 2>/dev/null || true
find books -name 'residue-report.*.json' -delete 2>/dev/null || true
exit $fail
