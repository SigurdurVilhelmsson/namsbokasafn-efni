#!/usr/bin/env bash
# Tests a HELD glossary export against the premise pins, on a throwaway worktree.
# Design: docs/superpowers/specs/2026-11-20-book-glossary-stage2-design.md §5.7.
#
# Read-only against production: it only reads status, HEAD and the held file over ssh.

set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  scripts/check-held-glossary.sh [--held-file-only] <slug>
  scripts/check-held-glossary.sh --hash-only <file>

Tests production's held glossary export for <slug> against the tests that pin
premises on glossary-unified.json, in a temporary worktree at production's HEAD.

By default it first reads production's status file and refuses unless the
book's outcome is refused-layer-change. That file is written only by an
unfiltered run (the cron), so a hold seen only by a --book run (for example
--adopt --book <slug> on a book with layer history) is not in it.

  --held-file-only  skip the status check and test the held file as it is
                    (warned on stderr). The held file is never deleted when a
                    hold resolves, so make sure it is the hold you mean.

Environment:
  PROD_SSH   required, e.g. user@host (never written into this script)
  PROD_REPO  production checkout, default ~/repos/namsbokasafn-efni
  HELD_GLOSSARY_WORKDIR
             directory under which the throwaway worktree is made (a temp
             directory inside it, removed on exit). Default: the PARENT of
             this checkout. It must be on disk, not tmpfs: the checkout is
             about 3 GB (tracked books/), and /tmp here is a RAM-backed
             tmpfs. The script refuses (exit 2) when that filesystem has
             under 5 GB available.

Exit codes:
  0  every premise pin passed
  1  a pin failed
  2  usage, refusal or setup failure (bad slug, PROD_SSH unset, nothing held
     on production, production's status file unreadable, no held file or one
     that is not valid JSON, less than 5 GB free for the worktree,
     production's HEAD not on origin, the worktree could not be prepared)
USAGE
}

die() { echo "check-held-glossary: $*" >&2; exit 2; }

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HASH_LIB="$PROJECT_ROOT/tools/lib/glossary-terms-hash.cjs"

hash_file() {
  node -e '
    const { termsSha256 } = require(process.argv[1]);
    const payload = JSON.parse(require("fs").readFileSync(process.argv[2], "utf8"));
    process.stdout.write(termsSha256(payload) + "\n");
  ' "$HASH_LIB" "$1"
}

case "${1:-}" in
  -h|--help) usage; exit 0 ;;
  --hash-only)
    [ -n "${2:-}" ] || { usage >&2; exit 2; }
    hash_file "$2" || die "could not hash $2 (not valid JSON with a terms array?)"
    exit 0
    ;;
esac

HELD_FILE_ONLY=0
SLUG=""
for arg in "$@"; do
  case "$arg" in
    --held-file-only) HELD_FILE_ONLY=1 ;;
    # Any other dash token is a mistyped flag, never a slug: refuse before it reaches ssh.
    -*) usage >&2; exit 2 ;;
    *) [ -z "$SLUG" ] || { usage >&2; exit 2; }; SLUG="$arg" ;;
  esac
done
[ -n "$SLUG" ] || { usage >&2; exit 2; }
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]] || die "slug must match [a-z0-9][a-z0-9-]*: '$SLUG'"
[ -n "${PROD_SSH:-}" ] || die "PROD_SSH is not set (e.g. PROD_SSH=user@host)"
PROD_REPO="${PROD_REPO:-~/repos/namsbokasafn-efni}"

# 1. Status first: a held file is never deleted when its hold resolves, so its
#    existence alone does not mean "held". --held-file-only skips this, loudly.
STATUS_HASH=""
if [ "$HELD_FILE_ONLY" -eq 1 ]; then
  echo "WARNING: --held-file-only: production's status file was NOT consulted. Testing the held" >&2
  echo "         file for '$SLUG' as it is; it may be left over from a hold that has resolved." >&2
else
  STATUS_JSON="$(ssh "$PROD_SSH" "cat $PROD_REPO/pipeline-output/.glossary-export-status.json")" \
    || die "could not read production's glossary export status"
  ENTRY="$(printf '%s' "$STATUS_JSON" | node -e '
    const fs = require("fs");
    let s; try { s = JSON.parse(fs.readFileSync(0, "utf8")); } catch { process.exit(3); }
    const e = s && s.books && s.books[process.argv[1]];
    if (!e || e.outcome !== "refused-layer-change") process.exit(4);
    process.stdout.write(String(e.termsSha256 || ""));
  ' "$SLUG")" && STATUS_RC=0 || STATUS_RC=$?
  case "$STATUS_RC" in
    0) STATUS_HASH="$ENTRY" ;;
    4) die "nothing held for '$SLUG': production's status outcome is not refused-layer-change. The status file is written only by an unfiltered run; for a hold seen only by a --book run, pass --held-file-only" ;;
    # 3 is a parse failure; anything else (127: node missing) means the status was never read.
    *) die "production's status file is unreadable (parse exit $STATUS_RC); nothing was tested" ;;
  esac
fi

# 2. Production's HEAD and the held file (read-only).
PROD_HEAD="$(ssh "$PROD_SSH" "git -C $PROD_REPO rev-parse HEAD")" || die "could not read production's HEAD"
[[ "$PROD_HEAD" =~ ^[0-9a-f]{40}$ ]] || die "production's HEAD is not a commit id: '$PROD_HEAD'"

TMP="$(mktemp -d)"
WORKBASE="${HELD_GLOSSARY_WORKDIR:-$(dirname "$PROJECT_ROOT")}"
WORKDIR=""
WORKTREE=""
cleanup() {
  if [ -n "$WORKTREE" ]; then
    git -C "$PROJECT_ROOT" worktree remove --force "$WORKTREE" >/dev/null 2>&1 || true
  fi
  [ -z "$WORKDIR" ] || rm -rf "$WORKDIR"
  rm -rf "$TMP"
  git -C "$PROJECT_ROOT" worktree prune >/dev/null 2>&1 || true
}
trap cleanup EXIT

# The worktree goes on disk, never tmpfs, and only if there is room for it.
[ -d "$WORKBASE" ] || die "HELD_GLOSSARY_WORKDIR is not a directory: $WORKBASE"
MIN_KB=$((5 * 1024 * 1024))
AVAIL_KB="$(df -Pk "$WORKBASE" | awk 'NR==2 {print $4}')"
[[ "$AVAIL_KB" =~ ^[0-9]+$ ]] || die "could not read free space on $WORKBASE"
[ "$AVAIL_KB" -ge "$MIN_KB" ] \
  || die "only $((AVAIL_KB / 1024)) MB free under $WORKBASE; the worktree needs 5 GB (set HELD_GLOSSARY_WORKDIR to a roomier disk directory)"
WORKDIR="$(mktemp -d -p "$WORKBASE" .held-glossary-XXXXXX)" || die "could not create a work directory under $WORKBASE"
WORKTREE="$WORKDIR/worktree"

HELD_COPY="$TMP/held.json"
ssh "$PROD_SSH" "cat $PROD_REPO/pipeline-output/glossary-held/$SLUG.json" > "$HELD_COPY" \
  || die "no held export for '$SLUG' on production"
[ -s "$HELD_COPY" ] || die "the held export for '$SLUG' is empty"

# 3. Production's HEAD must be a commit we can check out.
git -C "$PROJECT_ROOT" fetch origin >/dev/null 2>&1 || die "git fetch origin failed"
git -C "$PROJECT_ROOT" cat-file -e "$PROD_HEAD^{commit}" 2>/dev/null \
  || die "production's HEAD $PROD_HEAD is not a commit here (not on origin)"

# 4. The hash a release must carry: of the bytes tested, not of the status entry.
RELEASE_HASH="$(hash_file "$HELD_COPY")" \
  || die "the held export for '$SLUG' could not be hashed (not valid JSON with a terms array?)"
if [ -n "$STATUS_HASH" ] && [ "$STATUS_HASH" != "$RELEASE_HASH" ]; then
  echo "WARNING: the status entry's termsSha256 ($STATUS_HASH) differs from the held file's ($RELEASE_HASH)." >&2
  echo "         The status can lag after a --book run on production; the release uses the hash of the file tested." >&2
fi

# 5. Throwaway worktree at production's HEAD.
git -C "$PROJECT_ROOT" worktree add --detach "$WORKTREE" "$PROD_HEAD" >/dev/null 2>&1 \
  || die "could not create a worktree at $PROD_HEAD"
# Setup failures exit 2 (die), never 1: exit 1 means "a pin failed".
ln -s "$PROJECT_ROOT/node_modules" "$WORKTREE/node_modules" \
  || die "could not link node_modules into the worktree"
ln -s "$PROJECT_ROOT/server/node_modules" "$WORKTREE/server/node_modules" \
  || die "could not link server/node_modules into the worktree"
mkdir -p "$WORKTREE/books/$SLUG/glossary" || die "could not create books/$SLUG/glossary in the worktree"
cp "$HELD_COPY" "$WORKTREE/books/$SLUG/glossary/glossary-unified.json" \
  || die "could not copy the held export into the worktree"

# 6. The premise pins: test files that mention glossary-unified.json.
cd "$WORKTREE" || die "could not enter the worktree at $WORKTREE"
PINS=()
while IFS= read -r f; do
  case "$f" in *.test.js|*.test.mjs|*.test.cjs) PINS+=("$f") ;; esac
done < <(grep -rlaF 'glossary-unified.json' tools/__tests__ server/__tests__ scripts/__tests__ 2>/dev/null | sort)
[ "${#PINS[@]}" -gt 0 ] || die "found no premise-pin test files"

OUT="$TMP/vitest.out"
set +e
npx vitest run "${PINS[@]}" > "$OUT" 2>&1
RC=$?
set -e
cat "$OUT"

echo
if [ "$RC" -eq 0 ]; then
  echo "VERDICT: PASS (${#PINS[@]} premise-pin files) for held '$SLUG' at production HEAD $PROD_HEAD"
else
  echo "VERDICT: FAIL for held '$SLUG' at production HEAD $PROD_HEAD. Failing files:"
  # vitest prints "FAIL  <file> > ..." and "❯ <file> (n tests | m failed)"; a crash
  # may name no file at all, so an empty list must not abort before the hash lines.
  { grep -aoE '(FAIL|❯)  *[^ ]+\.test\.(js|mjs|cjs)' "$OUT" || true; } | awk '{print $2}' | sort -u | sed 's/^/  /'
fi
echo "Held terms hash: $RELEASE_HASH"
echo "Release (run on production, only after a pass):"
echo "  node server/scripts/export-terminology.js --book $SLUG --release-layer $RELEASE_HASH"
[ "$RC" -eq 0 ] && exit 0 || exit 1
