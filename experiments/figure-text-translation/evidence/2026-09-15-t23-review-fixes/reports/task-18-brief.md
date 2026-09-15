### Task 18: The repair run — recompose the 34 with `--stale --force`, verify the media BY VALUE, commit data and evidence

**Files:**
- Data: `books/efnafraedi-2e/media/<basename>_IS.svg` ×34, written by `tools/figure-run.js` only
- Create (committed): `EV2/VERIFICATION.md`

**Interfaces:**
- Consumes: Tasks 13–16's composer; `EV2/PREDICTIONS.json`; Task 17's outputs; Task 1's JS baseline (`$SCRATCH/baseline/js-failing-by-name.txt`, `js-loadfail.txt`).
- Produces: the recomposed media for Task 19.

- [ ] **Step 1: Pre-flight — editorial state on the remote, with a positive control**

Run Task 10 Step 1's commands verbatim. Expected: no output with `state-grep exit=1`, then `34`. **A non-zero `state` count: STOP and report** — a recompose would send an approved figure back to `mt-preview`.

- [ ] **Step 2: Pre-flight — dry runs (free)**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build TMPDIR=/home/siggi/dev/scratch-c140/build/tmp; cd /home/siggi/dev/repos/namsbokasafn-efni
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale --force --dry-run 2>&1 | tee "$SCRATCH/t18-dry-ch03.log" | tail -40
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --stale --force --dry-run 2>&1 | tee "$SCRATCH/t18-dry-ch04.log" | tail -40
```
Expected (measured 2026-09-15 at `433f9a2e`; the tallies do not depend on the composer):
- ch03 opens with `DRY RUN — nothing bought, nothing written under books/`, then:
  - `efnafraedi-2e ch03: 15 figure(s) across 5 module(s)`
  - `--stale: 26 figure(s) in this chapter have no sidecar and were not selected. …`
  - `15  translated`
  - `15  = enumerated`
  - `VERDICT ok`
- ch04 reads `19 figure(s) across 6 module(s)` / `11 figure(s) … not selected` / `19  translated` / `19  = enumerated` / `VERDICT ok`.
- Both chapters list `figure-prepare.py warnings` of the `subset font` kind only, as before.

`translated` is the driver's name for a recomposed figure; with `--force` no figure reads `skipped-current`. **Any `failed-*`, `unresolved`, `unreadable-text` or `copied-*` row, or a prepare warning naming the artwork guard (`artwork.svg transform …`): STOP and report.**

- [ ] **Step 3: Live run, in the foreground, one chapter at a time**

```bash
export SCRATCH=/home/siggi/dev/scratch-c140/build TMPDIR=/home/siggi/dev/scratch-c140/build/tmp; cd /home/siggi/dev/repos/namsbokasafn-efni
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale --force 2>&1 | tee "$SCRATCH/t18-live-ch03.log" | tail -40
node tools/figure-run.js --book efnafraedi-2e --chapter 4 --stale --force 2>&1 | tee "$SCRATCH/t18-live-ch04.log" | tail -40
```
(tool timeout 600000 each.)

Expected per chapter:
- `MT spawned for 0 figure(s)`, or no MT line;
- the same outcome tallies as that chapter's dry run in Step 2;
- `VERDICT ok`;
- ch03 carries the `localized` NOTE and ch04 the `overflow` NOTE, as in Task 10.

**Any `failed-*`, `unresolved` or `unreadable-text` row, an `MT spawned` count above 0, or an `unformatted` / `containerErrors` NOTE: STOP.** If a run is killed or times out, re-run the same chapter: `--force` recomposes every figure again, which is idempotent at 0 ISK.

- [ ] **Step 4: Exactly the 34 media changed — no sidecar, no mapping, nothing else**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git status --porcelain | awk '{print $1, $2}' | sed -E 's#(books/efnafraedi-2e/media)/.*#\1/…#' | sort | uniq -c
git status --porcelain -- books/efnafraedi-2e/figure-text books/efnafraedi-2e/media/image-mapping.json | wc -l
```
Expected: `34 M books/efnafraedi-2e/media/…` and nothing else, then `0`. The sidecars are rewritten only when `composedVersion` or `composedHash` differs, and neither does.

- [ ] **Step 5: The recomposed media equal the prediction, by value**

```bash
export EV2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
python3 "$EV2/instruments/predict.py" check "$EV2/PREDICTIONS.json" --media | tail -5
```
Expected: `media_artwork_sha256 34/34 MATCH`, `media_textgroup_sha256 34/34 MATCH`, `text_count 34/34 MATCH`, `style_font_faces 34/34 MATCH`, `34/34 MATCH`.

This is the check a version stamp could not make: every figure's artwork and every label, byte for byte, as the verified build drew them. The `<style>` bytes differ, because the woff2 `head.modified` is not pinned in a `figure-run.js` compose.

- [ ] **Step 6: Census and bond on the committed media**

```bash
export REPO=/home/siggi/dev/repos/namsbokasafn-efni SCRATCH=/home/siggi/dev/scratch-c140/build EV2=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
MEDIA34=$(ls "$REPO/books/efnafraedi-2e/figure-text" | sed "s#\.is\.json\$#_IS.svg#; s#^#$REPO/books/efnafraedi-2e/media/#"); echo $MEDIA34 | wc -w
python3 -u "$EV2/instruments/census/census.py" --out "$SCRATCH/t18/census" $MEDIA34 2>&1 | tail -10
python3 -u "$EV2/instruments/bond/bond.py" --out "$SCRATCH/t18/bond" "$REPO/books/efnafraedi-2e/media/CNX_Chem_04_03_etheneBr_img_IS.svg" 2>&1 | tail -5
pgrep -a chrome-headless || echo "no chromium survivors"
```
Expected:
- `34`;
- census: every class `total 0`, `worst |delta| pt = 0.0`, `CENSUS-DONE`;
- bond: `(3454, 3539)` on rows 201…233, `BOND-DONE`;
- `no chromium survivors`.

- [ ] **Step 7: The JS failing set is the baseline**

Re-run Task 7 Step 3's commands with `--outputFile="$SCRATCH/t18-js.json"` and the snippet's second argument `t18-js.json` (tool timeout 600000). Expected: `NEWLY RED: []`, `NEWLY GREEN: []`. **Anything else: STOP and report.**

- [ ] **Step 8: Commit the data**

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add books/efnafraedi-2e/media/*_IS.svg
git commit -m "feat(figures): recompose the 34 ch03/ch04 figures with [USER]'s review fixes

figure-run --stale --force (COMPOSER_VERSION stays 3, which never left this
branch): 34 media recomposed, 0 MT calls, 0 sidecars changed. Every figure's
artwork part and text group equal the verified build byte for byte
(predict.py --media 34/34); browser census 0 lost spaces, 0 collisions, 0
overhangs at 7 scales; etheneBr's bond back at the source's pixel columns.
Not rendered or synced - publication is [USER]'s call.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

- [ ] **Step 9: Write the frozen VERIFICATION.md and commit**

Create `EV2/VERIFICATION.md` with:
- a 🧊 FROZEN banner (cited, never synced; status lives in the campaign register and `REGISTER.md`);
- the `BASE2` and HEAD shas;
- Tasks 13–16: each RED line, GREEN line and mutation result, and each `compare` output;
- Task 17: the two `DONE` lines, the eight `34/34 MATCH` lines, and the census, control census and bond lines;
- Task 18: the dry-run and live tallies, Step 4's two outputs, Step 5's five lines, Step 6's census and bond lines, and Step 7's JS result;
- the commands used.

Cite `PREDICTIONS.md` and `reports/` rather than restating their numbers.

```bash
cd /home/siggi/dev/repos/namsbokasafn-efni
git add experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/VERIFICATION.md
git commit -m "docs(figures): [USER]'s review fixes verified on the recomposed 34 at 0 ISK

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01W11kXYeK3JsWvW7Fv4QP4X"
```

---

