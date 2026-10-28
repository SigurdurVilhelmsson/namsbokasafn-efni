#!/usr/bin/env bash
# D11: prepare ONE run's scratch tree. Free: it buys nothing and never passes --update-status.
#
#   bash experiments/d11-glossary-test/prepare-run.sh <tree-dir> <M|S|none>
#
# Builds a fresh tree (refuses an existing directory), checks the March glossary and the
# re-extracted English against their pinned hashes, dry-runs both modules with the arm's
# flags, and checks every line that says which glossary and wire the buy would use. It
# writes ARM and ARM_FLAGS into the tree; the buy lines in RUNBOOK.md read ARM_FLAGS, so
# the flags come only from the case statement below and a mistyped flag cannot happen
# (tools/lib/parseArgs.js drops an unknown flag silently).
#
# The CNXML goes under cnxml/, not 01-source/: the repo's 01-source guard hook refuses a
# copy into any 01-source/ path, a scratch one included. Extraction uses --input, whose
# segment output is the same as --chapter --module's.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DIR=${1:?usage: prepare-run.sh <tree-dir> <M|S|none>}
ARM=${2:?usage: prepare-run.sh <tree-dir> <M|S|none>}
DIR=$(realpath -m "$DIR") # absolute: the script cds into the tree below

# Pinned in results/2026-10-26/free-checks.md.
GLOSSARY_SHA=72442b487af6e1950501c00910fcca818f3566a74bad6833db78fad0024c9d0d
M68667_EN_SHA=11290fe6d76997fa4b4b29e80ac286fd902fa64675fac62417fe8b0ea0a3bdd3
M68781_EN_SHA=d7cd4c29078ac5d70cfd3b5e26fafbba7302a73ac70078f4861a0513b3329f2d

case "$ARM" in
  M)
    FLAGS="--full-glossary --june-wire"
    GLOSSARY_LINE="Glossary: 617 approved chemistry terms"
    WIRE_PREFIX="Glossary wire: june "
    ARM_LINE="  Glossary arm: glossary"
    ;;
  S)
    FLAGS="--full-glossary"
    GLOSSARY_LINE="Glossary: 590 approved chemistry terms (27 omitted — contested or comma-list)"
    WIRE_PREFIX="Glossary wire: today"
    ARM_LINE="  Glossary arm: glossary"
    ;;
  none)
    FLAGS="--no-glossary"
    GLOSSARY_LINE=""
    WIRE_PREFIX=""
    ARM_LINE="  Glossary arm: no-glossary"
    ;;
  *)
    echo "REFUSED: the arm must be M, S or none (got '$ARM')" >&2
    exit 2
    ;;
esac

if [ -e "$DIR" ]; then
  echo "REFUSED: $DIR exists. Every run needs a fresh tree: a module whose MT file exists is skipped." >&2
  exit 1
fi

fail() {
  echo "REFUSED: $*" >&2
  echo "Nothing was bought. Delete $DIR (it holds nothing paid for) once you have read the logs." >&2
  exit 1
}

want_sha() {
  local got
  got=$(sha256sum "$1" | cut -d' ' -f1)
  [ "$got" = "$2" ] || fail "$1 has sha256 $got, expected $2. Do not buy: the measured payloads do not apply."
}

B="$DIR/books/efnafraedi-2e"
mkdir -p "$DIR/cnxml/ch01" "$DIR/cnxml/ch11" "$B/glossary" "$DIR/logs"
cp "$REPO/books/efnafraedi-2e/01-source/ch01/m68667.cnxml" "$DIR/cnxml/ch01/"
cp "$REPO/books/efnafraedi-2e/01-source/ch11/m68781.cnxml" "$DIR/cnxml/ch11/"
git -C "$REPO" show 5db701c92:books/efnafraedi-2e/glossary/glossary-unified.json \
  > "$B/glossary/glossary-unified.json"
want_sha "$B/glossary/glossary-unified.json" "$GLOSSARY_SHA"

cd "$DIR"
node "$REPO/tools/cnxml-extract.js" --book efnafraedi-2e --input cnxml/ch01/m68667.cnxml \
  > logs/extract-m68667.log 2>&1 || fail "extraction of m68667 failed (logs/extract-m68667.log)"
node "$REPO/tools/cnxml-extract.js" --book efnafraedi-2e --input cnxml/ch11/m68781.cnxml \
  > logs/extract-m68781.log 2>&1 || fail "extraction of m68781 failed (logs/extract-m68781.log)"
want_sha "$B/02-for-mt/ch01/m68667-segments.en.md" "$M68667_EN_SHA"
want_sha "$B/02-for-mt/ch11/m68781-segments.en.md" "$M68781_EN_SHA"

printf '%s\n' "$ARM" > ARM
printf '%s\n' "$FLAGS" > ARM_FLAGS

# The dry runs get a fake key so the repository's .env key is never loaded; a dry run
# exits before it creates an API client in any case.
dry_check() { # <chapter> <module> <estimated-characters line>
  local log="logs/dry-$2.log"
  # shellcheck disable=SC2086  # FLAGS must split into separate arguments
  MALSTADUR_API_KEY=d11-dry-run-no-key node "$REPO/tools/api-translate.js" --book efnafraedi-2e \
    --chapter "$1" --module "$2" $FLAGS --dry-run > "$log" 2>&1 || fail "the dry run of $2 failed ($log)"
  grep -Fxq "  To translate: 1" "$log" || fail "$2: the dry run does not say 'To translate: 1' ($log)"
  grep -Fxq "  Already done:  0 (use --force to re-translate)" "$log" || fail "$2: the dry run does not say 'Already done: 0' ($log)"
  grep -Fxq "$3" "$log" || fail "$2: expected '$3' ($log)"
  grep -Fxq "$ARM_LINE" "$log" || fail "$2: expected '$ARM_LINE' ($log)"
  if [ -n "$GLOSSARY_LINE" ]; then
    grep -Fxq "$GLOSSARY_LINE" "$log" || fail "$2: expected '$GLOSSARY_LINE' ($log)"
    grep -q "^${WIRE_PREFIX}" "$log" || fail "$2: expected a line starting '$WIRE_PREFIX' ($log)"
  else
    if grep -q "^Glossary" "$log"; then fail "$2: the no-glossary arm loaded a glossary ($log)"; fi
  fi
}
dry_check 11 m68781 "  Estimated characters: 15,357"
dry_check 1 m68667 "  Estimated characters: 45,279"

echo "READY: $DIR, arm $ARM (flags: $FLAGS). Hashes match; both dry runs say what this arm sends."
