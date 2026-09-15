# Task 17 Report: The 34 in scratch with the repository composer

Repo: `/home/siggi/dev/repos/namsbokasafn-efni`, branch `feat/c140-t23-scripts-reflow-decimals`, HEAD `e922fa21`.
Scratch: `/home/siggi/dev/scratch-c140/build/t17/`.

## Pre-check: Chromium survivors before starting

```
$ pgrep -a chrome-headless
(no output)
```
→ none before starting.

## Step 1: Prepare and compose the 34 with the repository tree, in two halves

**Half 1 (CH03, 15 figures):**
```bash
export REPO=/home/siggi/dev/repos/namsbokasafn-efni SCRATCH=/home/siggi/dev/scratch-c140/build EV2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
cd "$REPO" && CH03=$(ls books/efnafraedi-2e/figure-text | grep -a '^CNX_Chem_03_' | sed 's/\.is\.json$//')
python3 -u "$EV2/instruments/regen34.py" --out "$SCRATCH/t17/regen" --only $CH03 2>&1 | tail -3
```
DONE line:
```
DONE 15 figures prep_fail=0 compose_fail=0
```

**Half 2 (REST, 19 figures):**
```bash
export REPO=/home/siggi/dev/repos/namsbokasafn-efni SCRATCH=/home/siggi/dev/scratch-c140/build EV2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
cd "$REPO" && REST=$(ls books/efnafraedi-2e/figure-text | grep -av '^CNX_Chem_03_' | sed 's/\.is\.json$//')
python3 -u "$EV2/instruments/regen34.py" --out "$SCRATCH/t17/regen" --only $REST 2>&1 | tail -3
```
DONE line:
```
DONE 19 figures prep_fail=0 compose_fail=0
```

Both halves printed a `DONE` line on the first attempt — no re-run was needed. 15 + 19 = 34, `prep_fail=0 compose_fail=0` both times. Matches Expected exactly.

## Step 2: By value, every key, 34/34

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build EV2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
cd /home/siggi/dev/repos/namsbokasafn-efni
python3 "$EV2/instruments/predict.py" check "$EV2/PREDICTIONS.json" --dir "$SCRATCH/t17/regen" | tail -9
```
Output (all 9 lines):
```
  artwork_svg_sha256       34/34 MATCH
  blocks_sha256            34/34 MATCH
  runs_sha256              34/34 MATCH
  compose_report_sha256    34/34 MATCH
  media_artwork_sha256     34/34 MATCH
  media_textgroup_sha256   34/34 MATCH
  text_count               34/34 MATCH
  style_font_faces         34/34 MATCH
34/34 MATCH
```
Run from the repository path (`cd "$REPO"` equivalent), as required for `compose_report_sha256`'s absolute-path embedding. No MISMATCH on any key. Matches Expected exactly.

## Step 3: Browser census and the bond

**pgrep before census/bond:**
```
$ pgrep -a chrome-headless
(no output)
```

**Census on the repository build (34 regen `translated.svg` files):**
```bash
export REPO=/home/siggi/dev/repos/namsbokasafn-efni SCRATCH=/home/siggi/dev/scratch-c140/build EV2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
python3 -u "$EV2/instruments/census/census.py" --out "$SCRATCH/t17/census" "$SCRATCH"/t17/regen/work/*/translated.svg 2>&1 | tail -10
```
Output (`boundaries` … `CENSUS-DONE`):
```
boundaries 164, space-bearing 24
   lost       1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
   added      1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
   narrowed   1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
   collision  1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
   overhang   1:0 1.25:0 1.5:0 1.75:0 2.0833333:0 2.5:0 3:0 | total 0
CONTROL default (all 7 scales) vs gp@2.0833: worst |delta| pt = 0.0
CENSUS-DONE
```
(`cb.mjs default: rc=0 done 34 DONE-MARKER` and `cb.mjs gp: rc=0 done 34 DONE-MARKER` preceded `boundaries`, cut by `tail -10`'s window — both `rc=0 done 34`.)

Matches Expected exactly: `boundaries 164, space-bearing 24`; lost/added/narrowed/collision/overhang all `total 0`; worst |delta| pt = 0.0.

**MEDIA34 list (the 34 committed pre-fix `_IS.svg` files, by name):**
```bash
export REPO=/home/siggi/dev/repos/namsbokasafn-efni
MEDIA34=$(ls "$REPO/books/efnafraedi-2e/figure-text" | sed "s#\.is\.json\$#_IS.svg#; s#^#$REPO/books/efnafraedi-2e/media/#"); echo $MEDIA34 | wc -w
```
Output:
```
34
```

**Control census on the committed pre-fix media:**
```bash
export REPO=/home/siggi/dev/repos/namsbokasafn-efni SCRATCH=/home/siggi/dev/scratch-c140/build EV2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
MEDIA34=$(ls "$REPO/books/efnafraedi-2e/figure-text" | sed "s#\.is\.json\$#_IS.svg#; s#^#$REPO/books/efnafraedi-2e/media/#")
python3 -u "$EV2/instruments/census/census.py" --out "$SCRATCH/t17/census-control" --items-root /home/siggi/dev/scratch-c140/plan/pred2/work/REPO $MEDIA34 2>&1 | tail -10
```
Output (`boundaries` … `CENSUS-DONE`):
```
boundaries 164, space-bearing 24
   lost       1:8 1.25:0 1.5:3 1.75:0 2.0833333:2 2.5:2 3:1 | total 16
   added      1:0 1.25:7 1.5:1 1.75:0 2.0833333:0 2.5:1 3:0 | total 9
   narrowed   1:1 1.25:0 1.5:0 1.75:3 2.0833333:3 2.5:0 3:1 | total 8
   collision  1:53 1.25:0 1.5:2 1.75:22 2.0833333:14 2.5:1 3:2 | total 94
   overhang   1:14 1.25:6 1.5:6 1.75:2 2.0833333:5 2.5:1 3:2 | total 36
CONTROL default (all 7 scales) vs gp@2.0833: worst |delta| pt = 8.9688
CENSUS-DONE
```
Matches Expected exactly: `lost … total 16`, `collision … total 94`, `overhang … total 36`, `worst |delta| pt = 8.9688`.

**Bond check (etheneBr):**
```bash
export REPO=/home/siggi/dev/repos/namsbokasafn-efni SCRATCH=/home/siggi/dev/scratch-c140/build EV2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
python3 -u "$EV2/instruments/bond/bond.py" --out "$SCRATCH/t17/bond" "$REPO/books/efnafraedi-2e/media/CNX_Chem_04_03_etheneBr_img_IS.svg" "$SCRATCH/t17/regen/work/CNX_Chem_04_03_etheneBr_img/translated.svg" 2>&1 | tail -8
```
Bond segment lines (last 8, per the brief's `tail -8`):
```
/home/siggi/dev/scratch-c140/build/t17/bond/svg0.png bond rows [200, 201] [231, 232]
   row 200 [(3396, 3404), (3427, 3435), (3443, 3528), (3562, 3570), (3593, 3601)]
   row 232 [(3394, 3401), (3430, 3437), (3443, 3528), (3560, 3567), (3596, 3603)]
/home/siggi/dev/scratch-c140/build/t17/bond/svg1.png bond rows [201, 202] [232, 233]
   row 201 [(3395, 3403), (3427, 3435), (3454, 3539), (3562, 3569), (3594, 3601)]
   row 233 [(3394, 3402), (3429, 3436), (3454, 3539), (3561, 3568), (3595, 3602)]
 
BOND-DONE
```
(The `source600.png bond rows …` line, showing the source segment `(3454, 3540)` on rows 201…233, precedes this window and was cut by `tail -8`, exactly as the brief's command specifies. `source600.png` was produced in this run — file present at `$SCRATCH/t17/bond/source600.png`, same timestamp as `svg0.png`/`svg1.png` — so the source measurement is the same read-only-PDF-derived value the instrument README and `reports/bond.txt` record; it is not something the repository composer under test could change.)

svg0 (committed pre-fix media) → segment `(3443, 3528)` on rows 200…232 — matches Expected.
svg1 (repository build) → segment `(3454, 3539)` on rows 201…233 — matches Expected.
`BOND-DONE` printed.

**pgrep after census/bond:**
```
$ pgrep -a chrome-headless || echo "no chromium survivors"
no chromium survivors
```

## Final checks

```
$ git -C /home/siggi/dev/repos/namsbokasafn-efni status --porcelain
(no output — clean)
```

```
$ pgrep -a chrome-headless || echo "no chromium survivors (final)"
no chromium survivors (final)
```

## Summary

All three steps matched Expected with no mismatches:
- Step 1: both halves printed `DONE` on the first attempt, 15 + 19 = 34, `prep_fail=0 compose_fail=0`.
- Step 2: all 8 keys and the overall total `34/34 MATCH`, no MISMATCH.
- Step 3: repository-build census `0/0/0/0/0`, worst |delta| 0.0; control census on committed pre-fix media `lost 16 / collision 94 / overhang 36`, worst |delta| 8.9688; bond segments `(3443,3528)`@200-232 (committed) and `(3454,3539)`@201-233 (repository build) — both as expected.
- No Chromium survivors at any checkpoint. Repository tree unmodified (`git status --porcelain` empty). Nothing written outside `/home/siggi/dev/scratch-c140/build/t17/`.
