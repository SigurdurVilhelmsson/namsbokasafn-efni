#!/usr/bin/env bash
# Mutation-verify C174 strategy 3's four guards.
#
# The five REFUSE tests passed BEFORE the feature existed — the function simply
# did nothing. So a green run proves nothing about them on its own. Each guard is
# neutered in turn and the test that should catch it must go RED.
#
# 🔴 RESTORE DISCIPLINE (CLAUDE.md): golden copy taken BEFORE the first mutation,
# restore from THAT (never `git checkout`, which restores to HEAD and would discard
# uncommitted work), and `cmp` after every round — the round that dies is exactly
# the one that never restored.
set -uo pipefail
cd "$(dirname "$0")/../.."

F=tools/api-translate.js
G=pipeline-output/probes/api-translate.golden.js
cp "$F" "$G"

round() {
  local name="$1" pattern="$2" expect="$3"
  perl -0pi -e "s/\Q$pattern\E/if (false) return null;/" "$F"
  if cmp -s "$F" "$G"; then
    echo "  [$name] 🔴 MUTATION DID NOT APPLY — this round proves nothing"
    return
  fi
  local out
  out=$(npx vitest run tools/__tests__/api-translate.test.js -t 'repairSegTags' 2>&1)
  if grep -qaF "× $expect" <<<"$out"; then
    echo "  [$name] ✅ guard fires — '$expect' went RED"
  else
    echo "  [$name] 🔴 GUARD IS VACUOUS — '$expect' still passes without it"
    grep -aE 'Tests ' <<<"$out" | head -1 | sed 's/^/        /'
  fi
  cp "$G" "$F"
  cmp -s "$F" "$G" || echo "  [$name] 🔴 RESTORE FAILED"
}

echo "=== baseline: all green before any mutation ==="
npx vitest run tools/__tests__/api-translate.test.js 2>&1 | grep -aE 'Tests ' | sed 's/^/  /'
echo
echo "=== mutating each guard ==="

round "count-equality" \
  'if (inIds.length === 0 || inIds.length !== outIds.length) return null;' \
  'REFUSES when the tag counts differ — nothing can be aligned by position'

round "no-reorder" \
  'if (inputTags.has(outIds[i]) || outSet.has(inIds[i])) return null;' \
  'REFUSES the whole file when a REORDER accompanies a corruption'

round "module-id" \
  'if (inIds[i].slice(0, inMod) !== outIds[i].slice(0, outMod)) return null;' \
  'does not modify tags that cannot be matched'

round "skeleton" \
  'if (segIdSkeleton(inIds[i]) !== segIdSkeleton(outIds[i])) return null;' \
  'REFUSES an unrelated id even at an aligned position (it is not a repair, it is a guess)'

echo
echo "=== final integrity ==="
cmp -s "$F" "$G" && echo "  ✅ file restored, byte-identical to golden" || echo "  🔴 FILE DIFFERS FROM GOLDEN — a mutant is stranded"
git diff --stat "$F" | sed 's/^/  /'
rm -f "$G"
