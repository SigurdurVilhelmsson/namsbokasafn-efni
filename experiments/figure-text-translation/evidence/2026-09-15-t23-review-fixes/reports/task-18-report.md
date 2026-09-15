# Task 18 Report: the repair run — recompose the 34 with `--stale --force`, verify BY VALUE, commit

Repo: `/home/siggi/dev/repos/namsbokasafn-efni`, branch `feat/c140-t23-scripts-reflow-decimals`.
Start HEAD: `e922fa21` (clean tree, confirmed before Step 1). End HEAD: `13d577ed`.

## Step 1: Pre-flight — editorial state on the remote, with a positive control

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git fetch origin
git grep -c '"state"' origin/main -- 'books/*/figure-text/*.json'; echo "state-grep exit=$?"
git grep -l '"composedVersion"' origin/main -- 'books/efnafraedi-2e/figure-text/*.json' | wc -l
```
Output:
```
(no output from state-grep)
state-grep exit=1
34
```
Matches Expected exactly. No STOP condition.

## Step 2: Pre-flight — dry runs (free)

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build TMPDIR=/home/siggi/dev/scratch-c140/build/tmp; cd /home/siggi/dev/repos/namsbokasafn-efni
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale --force --dry-run 2>&1 | tee "$SCRATCH/t18-dry-ch03.log" | tail -40
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --stale --force --dry-run 2>&1 | tee "$SCRATCH/t18-dry-ch04.log" | tail -40
```
ch03 tallies:
```
efnafraedi-2e ch03: 15 figure(s) across 5 module(s)
  --stale: 26 figure(s) in this chapter have no sidecar and were not selected. …
    15  translated
    15  = enumerated
VERDICT ok
```
ch04 tallies:
```
efnafraedi-2e ch04: 19 figure(s) across 6 module(s)
  --stale: 11 figure(s) in this chapter have no sidecar and were not selected. …
    19  translated
    19  = enumerated
VERDICT ok
```
Both chapters' `figure-prepare.py warnings` lines named only `subset font …` entries — no `artwork.svg
transform` warning. No `failed-*`, `unresolved`, `unreadable-text` or `copied-*` row on either chapter.
Matches Expected exactly. No STOP condition.

## Step 3: Live run, in the foreground, one chapter at a time

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build TMPDIR=/home/siggi/dev/scratch-c140/build/tmp; cd /home/siggi/dev/repos/namsbokasafn-efni
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale --force 2>&1 | tee "$SCRATCH/t18-live-ch03.log" | tail -40
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --stale --force 2>&1 | tee "$SCRATCH/t18-live-ch04.log" | tail -40
```
ch03 tallies, MT line, VERDICT and NOTE:
```
    15  translated
    15  = enumerated
  MT spawned for 0 figure(s) — only a figure with NO sidecar is spendable
  published 15 figure(s) into /home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/media/
VERDICT ok
  NOTE (not a failure): 5 figure(s) had English-kept numbers drawn with a decimal comma
```
ch04 tallies, MT line, VERDICT and NOTE:
```
    19  translated
    19  = enumerated
  MT spawned for 0 figure(s) — only a figure with NO sidecar is spendable
  published 19 figure(s) into /home/siggi/dev/repos/namsbokasafn-efni/books/efnafraedi-2e/media/
VERDICT ok
  NOTE (not a failure): 2 figure(s) carry label(s) drawn at the floor that overhang their space — the report names each
```
ch04's overflow NOTE named `CNX_Chem_04_03_flowchart` (2 blocks: "Molarity" block 13, block 14, both
"Mólstyrkur" 34.58pt needs vs 34.00pt budget) and `CNX_Chem_04_05_combmap_img` (5 blocks: "Percent|
composition" block 8, "Molar|mass" blocks 11 and 13, "Stoichiometric|factor" blocks 12 and 14) — flowchart
and combmap, as `PREDICTIONS.md` lists. Both chapters ran on the first attempt — no kill/timeout, no
re-run needed. No `failed-*`, `unresolved` or `unreadable-text` row; no `unformatted` / `containerErrors`
NOTE on either chapter. Matches Expected exactly. No STOP condition.

## Step 4: Exactly the 34 media changed — no sidecar, no mapping, nothing else

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git status --porcelain | awk '{print $1, $2}' | sed -E 's#(books/efnafraedi-2e/media)/.*#\1/…#' | sort | uniq -c
git status --porcelain -- books/efnafraedi-2e/figure-text books/efnafraedi-2e/media/image-mapping.json | wc -l
```
Output:
```
     34 M books/efnafraedi-2e/media/…
0
```
Matches Expected exactly (`34 M books/efnafraedi-2e/media/…`, then `0`).

## Step 5: The recomposed media equal the prediction, by value

```bash
export EV2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
python3 "$EV2/instruments/predict.py" check "$EV2/PREDICTIONS.json" --media | tail -5
```
Output (all 5 lines):
```
  media_artwork_sha256     34/34 MATCH
  media_textgroup_sha256   34/34 MATCH
  text_count               34/34 MATCH
  style_font_faces         34/34 MATCH
34/34 MATCH
```
No MISMATCH on any key. Matches Expected exactly.

## Step 6: Census and bond on the committed media

Chromium survivors before: `pgrep -a chrome-headless` → no output → "no chromium survivors before" (echoed
separately, matching the no-survivors state).

```bash
export REPO=/home/siggi/dev/repos/namsbokasafn-efni SCRATCH=/home/siggi/dev/scratch-c140/build EV2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
MEDIA34=$(ls "$REPO/books/efnafraedi-2e/figure-text" | sed "s#\.is\.json\$#_IS.svg#; s#^#$REPO/books/efnafraedi-2e/media/#"); echo $MEDIA34 | wc -w
python3 -u "$EV2/instruments/census/census.py" --out "$SCRATCH/t18/census" $MEDIA34 2>&1 | tail -10
```
Output:
```
34
cb.mjs default: rc=0 done 34 DONE-MARKER
cb.mjs gp: rc=0 done 34 DONE-MARKER
boundaries 164, space-bearing 24
   lost       1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
   added      1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
   narrowed   1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
   collision  1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
   overhang   1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
CONTROL default (all 7 scales) vs gp@2.0833: worst |delta| pt = 0.0
CENSUS-DONE
```

```bash
python3 -u "$EV2/instruments/bond/bond.py" --out "$SCRATCH/t18/bond" "$REPO/books/efnafraedi-2e/media/CNX_Chem_04_03_etheneBr_img_IS.svg" 2>&1 | tail -5
pgrep -a chrome-headless || echo "no chromium survivors"
```
Output:
```
/home/siggi/dev/scratch-c140/build/t18/bond/svg0.png bond rows [201, 202] [232, 233]
   row 201 [(3395, 3403), (3427, 3435), (3454, 3539), (3562, 3569), (3594, 3601)]
   row 233 [(3394, 3402), (3429, 3436), (3454, 3539), (3561, 3568), (3595, 3602)]

BOND-DONE
no chromium survivors
```
Census: `34`; every class `total 0`; worst |delta| pt = 0.0; `CENSUS-DONE`. Bond: segment `(3454, 3539)` on
rows 201…233; `BOND-DONE`. `no chromium survivors`. All match Expected exactly.

## Step 7: The JS failing set is the baseline

Task 7 Step 3's commands re-run with `--outputFile="$SCRATCH/t18-js.json"`, second script argument
`t18-js.json`:

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build; cd /home/siggi/dev/repos/namsbokasafn-efni
npx vitest run --reporter=json --outputFile="$SCRATCH/t18-js.json" > "$SCRATCH/t18-js.log" 2>&1; echo "exit=$?"
python3 - "$SCRATCH" t18-js.json <<'EOF'
[Task 7 Step 3's comparison snippet, verbatim]
EOF
```
Output:
```
exit=1
tests 6498
NEWLY RED: []
NEWLY GREEN: []
suites failing to LOAD: [] | baseline: []
```
`NEWLY RED: []`, `NEWLY GREEN: []` — matches Expected. `tests 6498` matches Task 7's own rehearsal count;
reported without judging it, per instruction (the "+18 tests" delta belongs to Task 7, not this task).

## Step 8: Commit the data

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add books/efnafraedi-2e/media/*_IS.svg
git status --porcelain | wc -l   # → 34, before commit
git commit -m "feat(figures): recompose the 34 ch03/ch04 figures with [USER]'s review fixes …"
```
Output: `lint-staged could not find any staged files matching configured tasks.` (info line, not a
modification or rejection — the same message Tasks 13–16 saw). Commit **`38f60765`** — "34 files changed,
3666 insertions(+), 3936 deletions(-)". `git status --porcelain` empty after.

## Step 9: Write the frozen VERIFICATION.md and commit

`experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/VERIFICATION.md` written with the
🧊 FROZEN banner, `BASE2` (`6cf8ab89`, the commit that added the plan's "Addendum — 2026-09-15: Tasks
13–19") and both HEAD shas, Tasks 13–16's RED/GREEN/mutation/compare lines (per `task-13-16-report.md`),
Task 17's two `DONE` lines / eight `34/34 MATCH` keys / census / control census / bond lines (per
`task-17-report.md`), and Task 18's own Steps 1–7 tallies verbatim as recorded above; `PREDICTIONS.md` and
`reports/` are cited by path rather than their full contents restated.

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/VERIFICATION.md
git commit -m "docs(figures): [USER]'s review fixes verified on the recomposed 34 at 0 ISK …"
```
Output: same info-only lint-staged line. Commit **`13d577ed`** — "1 file changed, 350 insertions(+)".

## Final state

```
$ git status --porcelain
(clean)
$ git log --oneline -3
13d577ed docs(figures): [USER]'s review fixes verified on the recomposed 34 at 0 ISK
38f60765 feat(figures): recompose the 34 ch03/ch04 figures with [USER]'s review fixes
e922fa21 fix(figures): no lone symbol, no useless line in box and cell labels (R13)
$ pgrep -a chrome-headless || echo "no chromium survivors (final)"
no chromium survivors (final)
$ ls -d /home/siggi/dev/scratch-c140/
/home/siggi/dev/scratch-c140/
```
`scratch-c140/` untouched/not deleted. No Chromium survivors at any checkpoint. No STOP condition fired at
any step.
