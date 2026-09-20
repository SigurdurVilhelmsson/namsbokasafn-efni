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
# Usage: scripts/chemistry-autorun-chapter.sh <chapterNumber|appendices> "<glossary-only subset>"
#   The subset is that chapter's own, curated FOR SENSE — see Section 3 of
#   docs/handoffs/2026-09-19-chemistry-pre-buy-review.md. A right word sent to the
#   wrong chapter is how a chapter gets bought twice (`cell` in ch10 is `unit cell`).
#
#   AUTORUN_RULED_TERMS="a,b"  key terms [USER] has already ruled; they do not halt step 2.
#   AUTORUN_SKIP_BUY=1         resume after a halt WITHOUT re-buying the text (see below).
#
# ═══════════════════════════════════════════════════════════════════════════════
# 🔴 v3, 2026-09-20 — REWRITTEN AFTER AN ADVERSARIAL AUDIT OF v1's FIRST LIVE RUN.
#
# v1 had never executed. Its first run (ch09) crashed in step 2 and walked into the
# paid buy; a five-lens audit then found 38 verified defects, and nearly all of them
# were ONE SHAPE: **a step that did not run, reporting a reassuring null.** Every
# `|| halt` and every `_rc` below exists because some failure mode produced the
# cleanest possible line in the log. The repo's own rule for this is CLAUDE.md's
# "an absence is not an answer — pair every null with a positive control".
#
# THE RULE THIS FILE NOW FOLLOWS: a check may only print a clean result if it can
# prove it ran. Where a tool has its own verdict line, gate on THAT, never on a
# count of lines the tool chose to print.
# ═══════════════════════════════════════════════════════════════════════════════
#
# Logs land in pipeline-output/autorun/ (gitignored).
set -uo pipefail
cd "$(dirname "$0")/.."
CH="${1:?usage: $0 <chapterNumber|appendices> \"<subset>\"}"
SUBSET="${2:?usage: $0 <chapterNumber|appendices> \"<subset>\"}"

# 🔴 `printf 'ch%02d' appendices` WRITES "invalid number" TO STDERR AND STILL PRINTS `ch00`,
# and a zero-padded `08` is read as OCTAL. Measured 2026-09-20. The BUY stays correct either
# way — `--chapter "$CH"` passes the raw string and cnxml-inject/cnxml-render/figure-run all
# handle 'appendices' via chapterDir's -1 sentinel — but CHD drives every VERIFICATION step
# (the arm glob, the SKIPPED/PROSE triage, the residue read, the roundtrip check) and PAGESUF
# drives the raw-`[[` page scan. With CHD=ch00 all of them would run against the PREFACE and
# report green on a unit nobody touched.
if [ "$CH" = "appendices" ]; then
  CHD=appendices; PAGESUF=appendices
elif printf '%s' "$CH" | grep -qE '^[0-9]{1,2}$'; then
  CH=$((10#$CH))                       # 10# defuses the octal trap on 08/09
  CHD=$(printf 'ch%02d' "$CH"); PAGESUF=$(printf '%02d' "$CH")
else
  echo "🔴 STOP: chapter '$CH' is neither a 1-2 digit number nor 'appendices'"; exit 3
fi
S=pipeline-output/autorun
mkdir -p "$S"
say() { echo "[$CHD] $*"; }
halt() { echo "[$CHD] 🔴 STOP: $*"; echo "[$CHD] DONE=stopped"; exit 3; }

# The one-paid-retry sentinels are per-RUN, not per-directory-lifetime. Leaving them
# behind means a re-run of a chapter silently forgoes the retry it is entitled to and
# goes straight to --allow-incomplete, shipping English with no line saying why.
rm -f "$S/$CHD".*.retried

say "--- 1 re-extract"
node tools/cnxml-extract.js --book efnafraedi-2e --chapter "$CH" > "$S/$CHD.extract.log" 2>&1 \
  || halt "extract exited $? (see $S/$CHD.extract.log)"
# 02-for-mt must not change: the committed English is what a price was agreed on.
# ⚠️ `git diff` cannot see a NEWLY CREATED file, so ask git for untracked ones too.
FORMT_DIFF=$(git status --porcelain "books/efnafraedi-2e/02-for-mt/$CHD" | head -3)
[ -n "$FORMT_DIFF" ] && say "⚠️ 02-for-mt changed since the price was agreed:
$FORMT_DIFF"

say "--- 2 pre-buy scan"
node tools/chapter-term-check.js --book efnafraedi-2e --chapter "$CH" --pre-buy --json \
  > "$S/$CHD.prebuy.json" 2>"$S/$CHD.prebuy.err" \
  || halt "chapter-term-check exited $? — the pre-buy scan did NOT run (see $S/$CHD.prebuy.err)"
# 🔴 `require()` ON A BARE RELATIVE PATH RESOLVES AS A MODULE NAME, NOT A FILE. That was v1's
# step 2: it threw MODULE_NOT_FOUND and, with `set -uo pipefail` but no `-e`, the run printed a
# stack trace and went on to the PAID buy with its safety scan having produced nothing.
# ⚠️ THE FIX IS `$(...) || halt`, NOT a redirect into a file. `X=$(cmd 2>&1 >f); X=$(cat f)`
# DISCARDS cmd's exit status, so a crash yields an empty X and reads as "nothing to flag" —
# the identical bug one layer down. Measured both ways 2026-09-20.
FLAGS=$(node -e '
const fs=require("fs");
const j=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
const ruled=new Set((process.env.AUTORUN_RULED_TERMS||"").split(",").map(s=>s.trim()).filter(Boolean));
const big=(j.plan||[]).filter(r=>!r.hasRow&&r.fromKeyTerm&&!r.subsumed&&r.segments>=20)
           .filter(r=>!ruled.has(r.term))
           .map(r=>`${r.term}(${r.segments})`);
console.error(`key terms with no row, 20+ segs: ${big.length?big.join(" · "):"none"}${ruled.size?`  [ruled, ignored: ${[...ruled].join(", ")}]`:""}`);
console.log(big.join(" · "));
' "$S/$CHD.prebuy.json") || halt "the pre-buy reader exited non-zero — the scan did NOT run, so its silence means nothing"
# The handoff calls an unruled key term a STOP: "ruling it after the buy is what costs a
# re-purchase". It was a stop in PROSE only — v1 merely printed and carried on.
[ -n "$FLAGS" ] && halt "unruled key term(s) with no glossary row: $FLAGS  (rule them, then re-run with AUTORUN_RULED_TERMS=\"...\")"

# ─── 3 ────────────────────────────────────────────────────────────────────────
if [ "${AUTORUN_SKIP_BUY:-}" = "1" ]; then
  # 🔴 THE BUY IS UNCONDITIONALLY `--force`, SO EVERY RESUME RE-BUYS THE WHOLE CHAPTER.
  # ch09 halted at step 5 with its text already paid for; re-running the driver would have
  # spent ~1,709 ISK again to repair one module. This flag is how you resume instead.
  say "--- 3 buy text SKIPPED (AUTORUN_SKIP_BUY=1 — resuming on the text already paid for)"
else
  say "--- 3 buy text (subset: $SUBSET)"
  node tools/api-translate.js --book efnafraedi-2e --chapter "$CH" --force \
    --glossary-only "$SUBSET" > "$S/$CHD.buy.log" 2>&1
  BUY=$?
  grep -E "Translated:|Skipped:|Failed:|Locked:|API usage|Est. cost" "$S/$CHD.buy.log" | sed "s/^/[$CHD] /"
  # 🔴 SURFACE THE DAMAGE LINES. v1's grep dropped them, so on ch09 the diagnosis that later
  # halted the run at step 5 sat in this log for 12 minutes while the FIGURE money was spent.
  grep -E "HELD BACK|WARNING:|id-reattach|Bracket-marker deltas" "$S/$CHD.buy.log" \
    | sed "s/^ *//" | sed "s/^/[$CHD] buy⚠ /"
  grep -qE "Failed: *[1-9]" "$S/$CHD.buy.log" && halt "a module FAILED in the buy"
  # 🔴 A NON-ZERO BUY IS NOT AUTOMATICALLY THE BENIGN CASE. v1 asserted "held-back module:
  # output IS written and paid" for EVERY non-zero exit — including a buy killed mid-chapter
  # (this box OOM-killed four paid runs on 2026-09-12). A killed buy leaves most modules on
  # the March MT; the PROSE triage cannot see them, because a segment ABSENT from the old MT
  # is skipped by its `is.get(k)?.trim()!==v.trim()` test, so they fall through to
  # --allow-incomplete and UNTRANSLATED ENGLISH gets injected and rendered.
  # So: a non-zero exit must PROVE it is the held-back case.
  if [ "$BUY" -ne 0 ]; then
    if grep -q "HELD BACK" "$S/$CHD.buy.log"; then
      say "⚠️ buy exit $BUY — a module was HELD BACK; its output IS written and paid (see buy⚠ above)"
    else
      halt "buy exited $BUY with no HELD BACK line — the buy did not complete (see $S/$CHD.buy.log)"
    fi
  fi
  # 🔴 THE ARM CHECK MUST BE **ALL**, NOT **ANY**. A set-union over the directory passes as
  # soon as ONE module carries the right arm, so a partial buy — the exact OOM case above —
  # reads as clean while most of the chapter is still the previous full-glossary MT.
  ARM_TOTAL=$(ls books/efnafraedi-2e/02-mt-output/"$CHD"/*-provenance.json 2>/dev/null | wc -l)
  ARM_OK=$(grep -al '"arm": *"glossary-only"' books/efnafraedi-2e/02-mt-output/"$CHD"/*-provenance.json 2>/dev/null | wc -l)
  say "arm: $ARM_OK of $ARM_TOTAL provenance files are glossary-only"
  [ "$ARM_TOTAL" -eq 0 ] && halt "no provenance files in $CHD — the buy wrote nothing"
  [ "$ARM_OK" -ne "$ARM_TOTAL" ] && halt "wrong MT arm: only $ARM_OK of $ARM_TOTAL modules are glossary-only (a partial buy)"
fi

say "--- 4 figures"
node tools/figure-run.js --book efnafraedi-2e --chapter "$CH" > "$S/$CHD.fig.log" 2>&1
FIG=$?
# 🔴 v1 captured FIG and never read it, and its bucket regex named 6 of the 11 outcomes —
# omitting failed-compose, failed-publish and failed-sidecar. A figure run that died after
# spawning the paid MT printed NOTHING through those greps and the chapter shipped with
# English figures under DONE=ok. Gate on figure-run's OWN verdict line.
grep -E "^ +[0-9]+ +(translated|copied-photo|copied-textless|unresolved|failed-mt|failed-compose|failed-publish|failed-sidecar|skipped-current|skipped|enumerated)$" \
  "$S/$CHD.fig.log" | tr -s ' ' | sed "s/^/[$CHD] fig/"
grep -E "MT spawned|published [0-9]+ figure|^VERDICT|  VERDICT" "$S/$CHD.fig.log" | sed "s/^/[$CHD] /"
grep -E "REFUSED — superseded" "$S/$CHD.fig.log" | sed "s/^/[$CHD] /"
grep -q "REFUSED — superseded" "$S/$CHD.fig.log" && halt "superseded figure artwork — confirm with [USER] before publishing over it"
if [ "$FIG" -ne 0 ]; then
  halt "figure-run exited $FIG (see $S/$CHD.fig.log)"
fi
grep -qE "VERDICT" "$S/$CHD.fig.log" || halt "figure-run printed no VERDICT — it did not finish, so its silence is not a pass"
if grep -q "failed-mt " "$S/$CHD.fig.log"; then
  say "⚠️ failed-mt present — retrying once (sporadic, [USER] 2026-09-06)"
  node tools/figure-run.js --book efnafraedi-2e --chapter "$CH" > "$S/$CHD.fig2.log" 2>&1 \
    || halt "figure-run retry exited $? (see $S/$CHD.fig2.log)"
  grep -E "MT spawned|published [0-9]+ figure|failed-mt " "$S/$CHD.fig2.log" | sed "s/^/[$CHD] retry /"
  grep -q "failed-mt " "$S/$CHD.fig2.log" && say "⚠️ still failing after one retry — logged, not fatal"
fi

# ─── 5 ────────────────────────────────────────────────────────────────────────
# 🔴 THE FIDELITY MANIFEST IS A **BOOK-LEVEL** FILE THAT INJECT ITSELF WRITES, AT THE END.
# If inject dies before `updateTranslationErrors` (cnxml-inject.js:5437), the committed file
# still holds the LAST SUCCESSFUL run's green — for a different chapter. v1 read it anyway
# and printed DONE=ok. So: stamp the time first and require the manifest to be NEWER.
MANIFEST=books/efnafraedi-2e/translation-errors.json
STAMP="$S/$CHD.inject.stamp"; : > "$STAMP"
inject_all() { node tools/cnxml-inject.js --book efnafraedi-2e --chapter "$CH" > "$1" 2>&1; }

say "--- 5 inject"
inject_all "$S/$CHD.inject.log"; INJ=$?
grep -cE "\[COMPLETE\]" "$S/$CHD.inject.log" | sed "s/^/[$CHD] modules COMPLETE: /"
grep -E "SKIPPED|FAILED" "$S/$CHD.inject.log" | sed "s/^/[$CHD] /" | head -5
if [ "$INJ" -ne 0 ] && ! grep -qE "m[0-9]+: (FAILED|SKIPPED)" "$S/$CHD.inject.log"; then
  halt "inject exited $INJ with no per-module verdict — it died wholesale (see $S/$CHD.inject.log)"
fi

# ⑰'s KNOWN modules: annotateInlineTerms corrupts a nested <term> payload, and
# --no-annotate-en is CLAUDE.md's documented remedy. Only these four; any other
# module that FAILS is a stop.
for M in $(grep -oE "m[0-9]+: FAILED" "$S/$CHD.inject.log" | cut -d: -f1 | sort -u); do
  case "$M" in
    m68700|m68733|m68747|m68844)
      say "⚠️ $M is a known ⑰ module — re-injecting with --no-annotate-en"
      node tools/cnxml-inject.js --book efnafraedi-2e --chapter "$CH" --module "$M" \
        --no-annotate-en > "$S/$CHD.inject.$M.log" 2>&1
      # ⚠️ INCOMPLETE is explicitly NOT a stop per the handoff, so accept it here and let the
      # --allow-incomplete triage below handle it; only a FAILED/refused module halts.
      if grep -qE "m[0-9]+: FAILED" "$S/$CHD.inject.$M.log"; then
        halt "$M still refused after --no-annotate-en"
      fi
      ;;
    *) halt "inject REFUSED $M (not one of ⑰'s known modules)" ;;
  esac
done

# A SKIPPED module means untranslated-EN residue. Triage it by VALUE: residue that
# is chemical formulas or table cells is correctly identical; residue that reads as
# English prose is a sporadic non-translation, which [USER] ruled is RETRIED once.
RETRIED_ANY=0
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
    console.log(n);' "$CHD" "$M") \
    || halt "the English-prose triage reader failed for $M — its silence is not 'no prose'"
  if [ "${PROSE:-0}" -gt 0 ] && [ ! -f "$S/$CHD.$M.retried" ]; then
    say "⚠️ $M has $PROSE English PROSE segment(s) — one paid retry ([USER] 2026-09-06)"
    touch "$S/$CHD.$M.retried"
    node tools/api-translate.js --book efnafraedi-2e --chapter "$CH" --module "$M" --force \
      --glossary-only "$SUBSET" > "$S/$CHD.rebuy.$M.log" 2>&1 \
      || say "⚠️ $M retry buy exited $? — see $S/$CHD.rebuy.$M.log"
    grep -E "Est. cost|HELD BACK|WARNING:" "$S/$CHD.rebuy.$M.log" | sed "s/^ *//" | sed "s/^/[$CHD] $M retry /"
    RETRIED_ANY=1
  fi
done
if [ "$RETRIED_ANY" = 1 ]; then
  # 🔴 v1 re-injected into the SAME log the FAILED sweep had already read, so a module that
  # went SKIPPED -> paid retry -> FAILED escaped the halt entirely and its PREVIOUS vintage
  # was rendered. Re-inject into a fresh log and RE-SWEEP for FAILED.
  say "re-injecting after retry"
  inject_all "$S/$CHD.inject2.log"; INJ2=$?
  grep -cE "\[COMPLETE\]" "$S/$CHD.inject2.log" | sed "s/^/[$CHD] modules COMPLETE after retry: /"
  if [ "$INJ2" -ne 0 ] && ! grep -qE "m[0-9]+: (FAILED|SKIPPED)" "$S/$CHD.inject2.log"; then
    halt "post-retry inject exited $INJ2 with no per-module verdict — it died wholesale"
  fi
  for M in $(grep -oE "m[0-9]+: FAILED" "$S/$CHD.inject2.log" | cut -d: -f1 | sort -u); do
    case "$M" in
      m68700|m68733|m68747|m68844) say "⚠️ $M is ⑰'s known set — re-injecting with --no-annotate-en"
        node tools/cnxml-inject.js --book efnafraedi-2e --chapter "$CH" --module "$M" \
          --no-annotate-en > "$S/$CHD.inject.$M.log" 2>&1
        grep -qE "m[0-9]+: FAILED" "$S/$CHD.inject.$M.log" && halt "$M still refused after --no-annotate-en" ;;
      *) halt "inject REFUSED $M after the retry (not one of ⑰'s known modules)" ;;
    esac
  done
  cp "$S/$CHD.inject2.log" "$S/$CHD.inject.log"
fi

# Whatever is still SKIPPED after triage is residue that no buy will change
# (formula answers, contributor names, a segment the MT reproducibly returns).
for M in $(grep -oE "m[0-9]+: SKIPPED" "$S/$CHD.inject.log" | cut -d: -f1 | sort -u); do
  say "⚠️ $M still incomplete after triage — writing with --allow-incomplete, residue logged"
  node tools/cnxml-inject.js --book efnafraedi-2e --chapter "$CH" --module "$M" \
    --allow-incomplete > "$S/$CHD.inject.$M.allow.log" 2>&1 \
    || halt "$M refused even with --allow-incomplete (see $S/$CHD.inject.$M.allow.log)"
  # ⚠️ v1 promised "residue logged" and printed nothing when the module was absent from the
  # report — an absence that reads as clean for a module just written with missing segments.
  node -e '
    const fs=require("fs");
    const r=JSON.parse(fs.readFileSync("books/efnafraedi-2e/residue-report.mt-preview.json","utf8"));
    const x=(r.modules||{})[process.argv[1]];
    if(x) console.log(`residue ${(x.exact||[]).length}: ${(x.exact||[]).slice(0,4).join(", ")}`);
    else console.log("⚠️ NOT IN THE RESIDUE REPORT — residue unknown, not zero");' "$M" \
    | sed "s/^/[$CHD] $M /"
done

# 🔴 The manifest must be NEWER than this run's inject, or it is a previous chapter's green.
[ "$MANIFEST" -nt "$STAMP" ] || halt "translation-errors.json was not rewritten by this inject — its green describes an EARLIER run"
node -e '
const fs=require("fs");
const j=JSON.parse(fs.readFileSync("books/efnafraedi-2e/translation-errors.json","utf8"));
const s=j.tracks["mt-preview"].summary;
console.log(`green=${s.green} unexplained=${s.unexplainedDiscrepancies} perfect=${s.perfect}`);
if(!s.green||s.unexplainedDiscrepancies) process.exitCode=9;
' | sed "s/^/[$CHD] manifest /"
[ "${PIPESTATUS[0]}" -eq 0 ] || halt "fidelity manifest is not green"

say "--- 6 render + index"
node tools/cnxml-render.js --book efnafraedi-2e --chapter "$CH" > "$S/$CHD.render.log" 2>&1 \
  || halt "render exited $? (see $S/$CHD.render.log)"
grep -E "Pruned superseded page" "$S/$CHD.render.log" | sed "s/^/[$CHD] /"
node tools/generate-index.js --book efnafraedi-2e --track mt-preview > "$S/$CHD.index.log" 2>&1 \
  || halt "generate-index exited $?"

say "--- 7 free checks"
PAGES="books/efnafraedi-2e/05-publication/mt-preview/chapters/$PAGESUF"
# ⚠️ --include='*.html' is load-bearing: a JPEG can contain the bytes "[[H:" by
# chance, and ch01 produced exactly two such false positives.
# 🔴 AND THE CONTROL MUST ACTUALLY RUN. v1 printed "(control: the MT file has them)" without
# executing anything, and an EMPTY page directory would have scored as clean.
PAGECOUNT=$(ls "$PAGES"/*.html 2>/dev/null | wc -l)
[ "$PAGECOUNT" -eq 0 ] && halt "no HTML pages in $PAGES — a zero raw-marker count there would be meaningless"
CONTROL=$(grep -claE '\[\[[A-Za-z][A-Za-z0-9_]*:' books/efnafraedi-2e/02-mt-output/"$CHD"/*-segments.is.md 2>/dev/null | head -1)
[ "${CONTROL:-0}" -eq 0 ] && halt "the raw-marker detector's POSITIVE CONTROL found no markers in the MT source — the detector is not proven to work here"
RAW=$(grep -rlaE '\[\[[A-Za-z][A-Za-z0-9_]*:' --include='*.html' "$PAGES" 2>/dev/null | wc -l)
say "raw [[ markers in $PAGECOUNT pages: $RAW (control fired: the MT source carries them)"
[ "$RAW" -gt 0 ] && halt "a raw bracket marker reached a page"

# 🔴 GATE ON THE TOOL'S OWN VERDICT, NOT ON A COUNT OF THE LINES IT CHOSE TO PRINT.
# source-roundtrip-check caps its per-module listing, so counting MISSING/ADDED lines
# UNDER-REPORTS real loss — and prints the cleanest possible line when it printed nothing
# at all. It also emits ATTR/TEXT/BUILD FAILED rows that v1 never looked at.
node tools/source-roundtrip-check.js efnafraedi-2e "$CHD" > "$S/$CHD.roundtrip.log" 2>&1
RT=$?
grep -qE "module\(s\) differ from 01-source|modules match" "$S/$CHD.roundtrip.log" \
  || halt "source-roundtrip-check printed no verdict line (exit $RT) — it did not finish"
DIFFERING=$(grep -oE "[0-9]+ module\(s\) differ" "$S/$CHD.roundtrip.log" | grep -oE "^[0-9]+" | head -1)
NONMEANING=$(grep -E "^ +(MISSING|ADDED) " "$S/$CHD.roundtrip.log" | grep -vc "meaning#")
OTHERCOLS=$(grep -cE "^ +(ATTR|TEXT) |BUILD FAILED" "$S/$CHD.roundtrip.log")
say "roundtrip: ${DIFFERING:-0} module(s) differ; non-meaning# listed=$NONMEANING; ATTR/TEXT/BUILD rows=$OTHERCOLS"
say "  (the per-module listing is CAPPED, so these are a floor, not a count — read $S/$CHD.roundtrip.log)"
[ "$NONMEANING" -gt 0 ] && say "⚠️ deltas outside the known meaning# renames — review $S/$CHD.roundtrip.log"
[ "$OTHERCOLS" -gt 0 ] && say "⚠️ ATTR/TEXT/BUILD rows present — review $S/$CHD.roundtrip.log"
say "DONE=ok"
