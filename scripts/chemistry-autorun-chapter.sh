#!/usr/bin/env bash
#
# chemistry-autorun-chapter.sh — ONE chemistry chapter through the per-chapter loop
# (docs/plans/2026-09-05-per-chapter-loop.md), printing ONE compact summary.
#
# 🔴 IT STOPS RATHER THAN PUSHING THROUGH. [USER]'s rule, 2026-09-20: a FUNDAMENTAL
# problem is one that would force a re-purchase later, and the run halts on it —
# an inject refusal outside ⑰'s four known modules, a red fidelity manifest, a raw
# bracket marker on a page, a failed buy, the wrong MT arm. Everything smaller is
# printed and the run continues, for the log.
#
# ⚠️ IT SPENDS MONEY. One text buy per chapter (~1,200–3,100 ISK) plus that
# chapter's figures (~30–100), plus up to one per-module retry when the MT returns
# English prose. Never run it on a chapter you have not priced with --dry-run.
#
# Usage: scripts/chemistry-autorun-chapter.sh <chapterNumber> "<glossary-only subset>"
#   The subset is that chapter's own, curated FOR SENSE — see Section 3 of
#   docs/handoffs/2026-09-19-chemistry-pre-buy-review.md. A right word sent to the
#   wrong chapter is how a chapter gets bought twice (`cell` in ch10 is `unit cell`).
#
# Logs land in pipeline-output/autorun/ (gitignored).
set -uo pipefail
cd "$(dirname "$0")/.."
CH="$1"; SUBSET="$2"
CHD=$(printf 'ch%02d' "$CH")
S=pipeline-output/autorun
mkdir -p "$S"
say() { echo "[$CHD] $*"; }
halt() { echo "[$CHD] 🔴 STOP: $*"; echo "[$CHD] DONE=stopped"; exit 3; }

say "--- 1 re-extract"
node tools/cnxml-extract.js --book efnafraedi-2e --chapter "$CH" > "$S/$CHD.extract.log" 2>&1 \
  || halt "extract exited $? (see $S/$CHD.extract.log)"
# 02-for-mt must not change: the committed English is what a price was agreed on.
FORMT_DIFF=$(git diff --stat "books/efnafraedi-2e/02-for-mt/$CHD" | tail -1)
[ -n "$FORMT_DIFF" ] && say "⚠️ 02-for-mt changed: $FORMT_DIFF"

say "--- 2 pre-buy scan"
node tools/chapter-term-check.js --book efnafraedi-2e --chapter "$CH" --pre-buy --json \
  > "$S/$CHD.prebuy.json" 2>"$S/$CHD.prebuy.err" || say "pre-buy exited $?"
node -e '
const j=require(process.argv[1]);
const p=j.plan||[];
const big=p.filter(r=>!r.hasRow&&r.fromKeyTerm&&!r.subsumed&&r.segments>=20).map(r=>`${r.term}(${r.segments})`);
console.log(`[${j.chapter}] key terms with no row, 20+ segs: ${big.length?big.join(" · "):"none"}`);
' "$S/$CHD.prebuy.json"

say "--- 3 buy text (subset: $SUBSET)"
node tools/api-translate.js --book efnafraedi-2e --chapter "$CH" --force \
  --glossary-only "$SUBSET" > "$S/$CHD.buy.log" 2>&1
BUY=$?
grep -E "Translated:|Skipped:|Failed:|API usage|Est. cost" "$S/$CHD.buy.log" | sed "s/^/[$CHD] /"
grep -qE "Failed: *[1-9]" "$S/$CHD.buy.log" && halt "a module FAILED in the buy"
[ "$BUY" -ne 0 ] && say "⚠️ buy exit $BUY (held-back module: output IS written and paid)"
ARMS=$(grep -ah -o '"arm"[^,}]*' books/efnafraedi-2e/02-mt-output/$CHD/*-provenance.json | sort -u | tr '\n' ' ')
say "arm(s): $ARMS"
echo "$ARMS" | grep -q 'glossary-only' || halt "wrong MT arm: $ARMS"

say "--- 4 figures"
node tools/figure-run.js --book efnafraedi-2e --chapter "$CH" > "$S/$CHD.fig.log" 2>&1
FIG=$?
grep -E "^ +[0-9]+ +(translated|copied-photo|copied-textless|unresolved|failed-mt|skipped-current)$" "$S/$CHD.fig.log" | tr -s ' ' | sed "s/^/[$CHD] fig/"
grep -E "MT spawned|published [0-9]+ figure" "$S/$CHD.fig.log" | sed "s/^/[$CHD] /"
if grep -q "failed-mt " "$S/$CHD.fig.log"; then
  say "⚠️ failed-mt present — retrying once (sporadic, [USER] 2026-09-06)"
  node tools/figure-run.js --book efnafraedi-2e --chapter "$CH" > "$S/$CHD.fig2.log" 2>&1
  grep -E "MT spawned|published [0-9]+ figure|failed-mt " "$S/$CHD.fig2.log" | sed "s/^/[$CHD] retry /"
  grep -q "failed-mt " "$S/$CHD.fig2.log" && say "⚠️ still failing after one retry — logged, not fatal"
fi
grep -E "REFUSED — superseded" "$S/$CHD.fig.log" | sed "s/^/[$CHD] /"

say "--- 5 inject"
node tools/cnxml-inject.js --book efnafraedi-2e --chapter "$CH" > "$S/$CHD.inject.log" 2>&1
grep -cE "\[COMPLETE\]" "$S/$CHD.inject.log" | sed "s/^/[$CHD] modules COMPLETE: /"
grep -E "SKIPPED|FAILED" "$S/$CHD.inject.log" | sed "s/^/[$CHD] /" | head -5
# ⑰'s KNOWN modules: annotateInlineTerms corrupts a nested <term> payload, and
# --no-annotate-en is CLAUDE.md's documented remedy. Only these four; any other
# module that FAILS is a stop.
for M in $(grep -oE "m[0-9]+: FAILED" "$S/$CHD.inject.log" | cut -d: -f1 | sort -u); do
  case "$M" in
    m68700|m68733|m68747|m68844)
      say "⚠️ $M is a known ⑰ module — re-injecting with --no-annotate-en"
      node tools/cnxml-inject.js --book efnafraedi-2e --chapter "$CH" --module "$M" \
        --no-annotate-en > "$S/$CHD.inject.$M.log" 2>&1
      grep -qE "\[COMPLETE\]" "$S/$CHD.inject.$M.log" || halt "$M still refused after --no-annotate-en"
      ;;
    *) halt "inject REFUSED $M (not one of ⑰'s known modules)" ;;
  esac
done
# A SKIPPED module means untranslated-EN residue. Triage it by VALUE: residue that
# is chemical formulas or table cells is correctly identical; residue that reads as
# English prose is a sporadic non-translation, which [USER] ruled is RETRIED once.
for M in $(grep -oE "m[0-9]+: SKIPPED" "$S/$CHD.inject.log" | cut -d: -f1 | sort -u); do
  PROSE=$(node -e '
    const fs=require("fs");const {parseSegmentsMap}=require("./tools/lib/seg-markers.cjs");
    const [ch,m]=process.argv.slice(1);
    const en=parseSegmentsMap(fs.readFileSync(`books/efnafraedi-2e/02-for-mt/${ch}/${m}-segments.en.md`,"utf8"));
    const is=parseSegmentsMap(fs.readFileSync(`books/efnafraedi-2e/02-mt-output/${ch}/${m}-segments.is.md`,"utf8"));
    let n=0;
    for(const [k,v] of en){ if(is.get(k)?.trim()!==v.trim()) continue;
      if(v.length>80 && (v.match(/[A-Za-z]{3,}/g)||[]).length>=10 &&
         /\b(the|and|that|with|from|which|this|are|is)\b/i.test(v)) n++; }
    console.log(n);' "$CHD" "$M")
  if [ "$PROSE" -gt 0 ] && [ ! -f "$S/$CHD.$M.retried" ]; then
    say "⚠️ $M has $PROSE English PROSE segment(s) — one paid retry ([USER] 2026-09-06)"
    touch "$S/$CHD.$M.retried"
    node tools/api-translate.js --book efnafraedi-2e --chapter "$CH" --module "$M" --force \
      --glossary-only "$SUBSET" > "$S/$CHD.rebuy.$M.log" 2>&1
    grep -E "Est. cost" "$S/$CHD.rebuy.$M.log" | sed "s/^/[$CHD] $M retry /"
    node tools/cnxml-inject.js --book efnafraedi-2e --chapter "$CH" > "$S/$CHD.inject.log" 2>&1
  fi
done
# Whatever is still SKIPPED after triage is residue that no buy will change
# (formula answers, contributor names, a segment the MT reproducibly returns).
for M in $(grep -oE "m[0-9]+: SKIPPED" "$S/$CHD.inject.log" | cut -d: -f1 | sort -u); do
  say "⚠️ $M still incomplete after triage — writing with --allow-incomplete, residue logged"
  node tools/cnxml-inject.js --book efnafraedi-2e --chapter "$CH" --module "$M" \
    --allow-incomplete > "$S/$CHD.inject.$M.allow.log" 2>&1
  node -e '
    const r=require("./books/efnafraedi-2e/residue-report.mt-preview.json");
    const x=r.modules[process.argv[1]];
    if(x) console.log(`residue ${(x.exact||[]).length}: ${(x.exact||[]).slice(0,4).join(", ")}`);' "$M" | sed "s/^/[$CHD] $M /"
done
node -e '
const j=require("./books/efnafraedi-2e/translation-errors.json");
const s=j.tracks["mt-preview"].summary;
console.log(`green=${s.green} unexplained=${s.unexplainedDiscrepancies} perfect=${s.perfect}`);
if(!s.green||s.unexplainedDiscrepancies) process.exit(9);
' | sed "s/^/[$CHD] manifest /" || halt "fidelity manifest is not green"

say "--- 6 render + index"
node tools/cnxml-render.js --book efnafraedi-2e --chapter "$CH" > "$S/$CHD.render.log" 2>&1 \
  || halt "render exited $?"
grep -E "Pruned superseded page" "$S/$CHD.render.log" | sed "s/^/[$CHD] /"
node tools/generate-index.js --book efnafraedi-2e --track mt-preview > "$S/$CHD.index.log" 2>&1 \
  || halt "generate-index exited $?"

say "--- 7 free checks"
PAGES="books/efnafraedi-2e/05-publication/mt-preview/chapters/$(printf '%02d' "$CH")"
# ⚠️ --include='*.html' is load-bearing: a JPEG can contain the bytes "[[H:" by
# chance, and ch01 produced exactly two such false positives.
RAW=$(grep -rlaE '\[\[[A-Za-z][A-Za-z0-9_]*:' --include='*.html' "$PAGES" 2>/dev/null | wc -l)
say "raw [[ markers in pages: $RAW (control: the MT file has them)"
[ "$RAW" -gt 0 ] && halt "a raw bracket marker reached a page"
node tools/source-roundtrip-check.js efnafraedi-2e "$CHD" > "$S/$CHD.roundtrip.log" 2>&1
MISS=$(grep -cE "^ +MISSING " "$S/$CHD.roundtrip.log")
ADD=$(grep -cE "^ +ADDED " "$S/$CHD.roundtrip.log")
NONMEANING=$(grep -E "^ +(MISSING|ADDED) " "$S/$CHD.roundtrip.log" | grep -vc "meaning#")
say "roundtrip: missing=$MISS added=$ADD non-meaning#=$NONMEANING"
[ "$NONMEANING" -gt 0 ] && say "⚠️ roundtrip has deltas outside the known meaning# renames — review $S/$CHD.roundtrip.log"
say "DONE=ok"
