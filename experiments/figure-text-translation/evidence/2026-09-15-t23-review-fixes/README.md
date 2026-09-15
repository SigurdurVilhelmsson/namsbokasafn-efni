# Evidence — §C140 R12–R15: the review fixes behind the 34 recomposed figures, 2026-09-15

> 🧊 **FROZEN, 2026-09-15.** Cited, never synced. Status lives in the campaign register (§C140, ⏩ RESUME)
> and in `../../REGISTER.md`. The design is
> `docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md` (read "Amendments — 2026-09-15");
> the build this folder extends is `../2026-09-14-t23-build/`. If this folder disagrees with the spec or the
> register, they win. **Cost of everything here: 0 ISK** — no MT call; `tools/figure-run.js` never run; nothing
> under `books/` written; the repository was read-only apart from this folder.
>
> 📝 **Dated note — 2026-09-15, final review.** The banner above describes the folder as first committed (`6cf8ab89`).
> `VERIFICATION.md` was added later (`13d577ed`) and covers Tasks 13–18, **including the 0-ISK
> `tools/figure-run.js --stale --force` repair run that wrote the 34 `books/efnafraedi-2e/media/*_IS.svg` files**
> (`38f60765`). The final review also added the rows marked *(added 2026-09-15)* in the table below.

[USER] looked at the 34 figures recomposed at `433f9a2e` and did not accept them: spaces missing (`afBr₂`,
`viðH₂O`), the etheneBr double bond left of centre, translated text bolder than the source, and a box label
chasing the source line count into `Fjöldi / agna / af / A`. Each symptom was root-caused, [USER] ruled four
fixes, and they were built and adversarially reviewed in scratch over two rounds, the way the 2026-09-14 build
was. The files under `reference/` are that verified build, byte-exact; everything else here is the means to
install it and to check the result by value.

## The rulings

From the spec's "Amendments — 2026-09-15" (the spec owns the wording):

| # | ruling | fix | by |
|---|---|---|---|
| R12 | **Precise text rendering.** Every drawn `<text>` renders with `text-rendering="geometricPrecision"` — written once, on the `<g>` that holds them all. Reverses, for `geometricPrecision` only, E's R2 scope exclusion | (S) `svgout.py` | [USER] 2026-09-15 |
| R13 | **No lone symbol, no useless line** — box and cell labels only (rules A and E) | (L) `figlayout.py` | [USER] 2026-09-15 |
| R14 | **Match the source black.** DeviceCMYK text converts to RGB the way poppler does, so K=1 draws `#231f20` like the artwork's strokes; DeviceRGB and DeviceGray keep their exact colour | (C) new `figcolour.py`, `compose.py`, `readlayer.py` keeps the colour-space tag | [USER] 2026-09-15 |
| R15 | **Fix the artwork shift on this branch.** `pdftocairo -svg -noshrink -nocenter`, and prepare refuses a page whose artwork would not sit under the text | (W) `svgfix.py`, `strip-text.py`, `figure-prepare.py` | [USER] 2026-09-15 |

## The two scratch rounds

| round | what | verdict |
|---|---|---|
| 1 (`reports/round1-result.json`) | four builders (W, C, S, L), an integrator (15 patches, 34 figures re-prepared and recomposed, browser census, bond at 600 dpi, suite by name in git-archive copies) and an adversarial reviewer | `ready-with-minors`, 0 defects, 11 minors |
| 2 (`reports/round2-result.json`) | a fixer applying the round-1 minors, then a second reviewer | `ready-with-minors`, 0 defects, 6 minors |

### Read the later round against the earlier one

- **Rule E's size.** Round 1's E stepped the line count down after the size search and kept the shrunk size
  (`'Massi af cu'` at 7.5 while `'Massi af Cu'` drew at 9.0; 38 of 1,730 randomised E-changed labels). Round 2
  moved the check inside the search — a rejected count does not influence the size — with 3 new tests seen RED
  on the round-1 code. 0 exposure on the 34: round 2's 408 output files are byte-identical to round 1's.
- **C1 / G1.** Round 1 relaxed the two golden controls (`test_compose_runexact` C1, `test_compose_t23` G1) to
  accept the old OR the new fill, which a naive colour map passed. Round 2 made them require exactly
  `figcolour.fill_rgb` of the planted fill AND a difference from the golden's naive fill; the round-1 tests stay
  green against both naive mutants, the round-2 tests go red. The round-2 reviewer's residual: a figcolour
  error that is not naive (a wrong poppler corner coefficient) passes C1/G1 and is caught by
  `test_figcolour.py` alone.
- **The guard's comment.** Round 1's `figure-prepare.py` comment said the guard refuses any CropBox ≠ MediaBox.
  Round 2 measured the whole in-scope chemistry corpus (0 of 817 refused) and planted controls, and rewrote the
  comment to what is refused: `/Rotate`, a box origin off 0,0, a CropBox cutting the left or top edge.
- **Carried into the spec's Amendments as known limits** (0 on the 34, measured on randomised labels): E judges
  the partition before R9's binding (about 1.5% of randomised box labels keep a line whose bound partition is no
  wider), and a label can lose an R9 binding to a larger size (1–4 in 20,000). The randomised property
  "E changed size/step" in round 1's harness fires by design on round 2's corrected labels.
- **`COMPOSER_VERSION` stays `'3'`** — the spec's Amendments record why (never left this branch; one bump per PR),
  so the spec prescribes `figure-run.js --stale --force` for the 34.
- Where a report quotes a module line number, it is the scratch file's and may not match `reference/`.

## What is here

| path | what |
|---|---|
| `reference/` | the 16 per-file patches against `433f9a2e`, repo-relative for `git apply` from the repository root, byte-identical to `/home/siggi/dev/scratch-c140/fix2/final/patches` — `01-strip-text` `02-svgfix` `03-figure-prepare` `04-test_figure_prepare` (W) · `05-figcolour` (new file) `06-compose` `07-readlayer` `08-test_figcolour` (new) `09-test_readlayer` `10-test_compose_runexact` `11-test_compose_t23` (C) · `12-svgout` `13-test_svgout` (new) `16-figscripts` (S, and a docstring) · `14-figlayout` `15-test_figlayout` (L) — plus the three new files as they must read after install (`figcolour.py`, `test_figcolour.py`, `test_svgout.py`, for `cmp`). **`MANIFEST.sha256`** has paths relative to `reference/`: `cd reference && sha256sum -c MANIFEST.sha256` |
| `PREDICTIONS.json` | per figure: `artwork_svg_sha256`, `blocks_sha256`, `runs_sha256`, `compose_report_sha256`, `media_artwork_sha256`, `media_textgroup_sha256`, `text_count` — produced by running the final build, with its controls |
| `PREDICTIONS.md` | what the keys mean, the controls, HEAD → final key by key, and every per-ruling number (browser census, bond, flowchart blocks, fill map, guard census, the 24 fractional figures) |
| `instruments/regen34.py` | prepare + plain compose of the 34 with a given composer tree, 0 ISK |
| `instruments/figparts.py` | split a composed SVG into artwork part, `<style>` and text group; `--prove` checks the artwork relation |
| `instruments/predict.py` | `write` / `check --dir` / `check --media` / `diff` over prediction files |
| `instruments/census/` | browser space / collision / overhang census at 7 scales (`census.py` + `cb.mjs`, `README.md`) |
| `instruments/bond/` | etheneBr bond pixel columns at 600 dpi, source PDF vs SVGs (`bond.py` + `imgr.mjs` + `segs.py`, `README.md`) |
| `instruments/rehearse.py` | the install rehearsal: the patches in task order on a fresh `git archive HEAD` copy, RED first, named mutations with golden copies |
| `reports/install-rehearsal.md` | the rehearsal's verbatim output |
| `reports/predictions-controls.txt` | the verbatim `predict.py` controls behind `PREDICTIONS.md` |
| `reports/head-predictions.json` | the same keys for the unchanged composer at `433f9a2e` (the HEAD side of the key diff) |
| `reports/census-head.txt`, `reports/census-final.txt`, `reports/bond.txt` | verbatim instrument runs on the committed media and on the final build |
| `reports/round1-result.json`, `reports/round2-result.json` | the two scratch rounds' structured results, byte-identical to `/home/siggi/dev/scratch-c140/fix2/wf-result.json` and `wf2-result.json` |
| `VERIFICATION.md` | *(added 2026-09-15, `13d577ed`)* the frozen measurement of Tasks 13–18 against `PREDICTIONS.md`, including Task 18's repair run that wrote the 34 media |
| `reports/task-13-16-report.md`, `reports/task-17-report.md`, `reports/task-18-report.md`, `reports/task-18-brief.md` | *(added 2026-09-15, final review)* the SDD task reports and the Task 18 brief `VERIFICATION.md` cites for detail, byte-exact copies of the gitignored ledger files |
| `instruments/code1_exposure.py`, `reports/code1-exposure.txt`, `reports/code1-control-nitrogen/` | *(added 2026-09-15, final review)* the exposure measurement behind campaign register §C140 ㉑ — a one-line source label with a stacked charge or same-size superscript counted as several source lines: its positive control on `CNX_Chem_18_07_Nitrogen` (the control's `runs.json` / `blocks.json` / `meta.json`, byte-exact from the verifier's scratch prepare) and 0 of 183 `send:true` blocks on the 34 |

## The install rehearsal, in short

`reports/install-rehearsal.md` is the second of two runs; it adds the FAIL-set comparisons and the post-wire
control, and is otherwise identical to the first (temp-dir names and the copy's commit sha aside). Task order T-W (04 → 01 02 03), T-S
(13 → 12 16), T-C (05 08 09 10 11 → 06 07), T-L (15 → 14). Every patch applies with `git apply` (rc 0, no
output); every RED step fails on the named new cases and every GREEN step prints `ALL PASS`; every mutation is
restored with `cmp`, and every one is killed except the pre-wire T-C probe described below; after T-L all 20 `test_*.py` print `ALL PASS` and all 16 touched files (and all
46 `*.py`) are `cmp`-identical to `/home/siggi/dev/scratch-c140/fix2/final/tree`.
**One ordering fact for a plan:** in T-C, the naive-`fill_rgb` mutation applied BEFORE `06 07` fails exactly
the 8 cases the unmutated unwired tree already fails (`FAIL-name set … == … **True**`) — the composer does not
call `figcolour` yet, so that probe cannot tell a mutant from the unwired state. The same mutation after
`06 07` (the rehearsal's added control) fails those 8 plus C1 and G1. The T-L `_ae=False` mutation fails
the same 10 cases as the RED step, which is the expected shape there (HEAD's `figlayout.py` has neither rule).
That mutation cannot tell rule A from rule E, so two finer ones were run afterwards on the fully patched copy
(controller, 2026-09-15): `useless()` returning `False` (E off, A on) fails exactly the 6 E cases — E alone,
both floor-overflow paths, the rejected count's size, the `cu`/`Cu` pair and the 8.0 CONTROL — and
`lone = False` (A off, E on) fails exactly the 4 A cases — flowchart b7, b15, b9 and the shrink-to-bind case
(b10 still passes, because E alone already joins `af A`).

## Re-running

Every instrument reads the session scratch by absolute path (`/home/siggi/dev/scratch-c140/prep/sources.json`,
`…/fix2/final/tree`, `…/fix2/final/work`, `…/fix2/integrated/prep`, `…/plan/pred2/work/REPO`); re-point before
reuse if that tree is gone. Long runs use `python3 -u` and are judged by their terminal line.

```bash
EV=/home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes
cd "$EV/reference" && sha256sum -c MANIFEST.sha256                                  # 19 OK
python3 -u "$EV/instruments/regen34.py" --tree <composer dir> --out <scratch>/regen  # last line: DONE 34 figures prep_fail=0 compose_fail=0
python3 "$EV/instruments/predict.py" check "$EV/PREDICTIONS.json" --dir <scratch>/regen   # the final build: 34/34 MATCH
python3 "$EV/instruments/predict.py" check "$EV/PREDICTIONS.json" --media                 # recomposed books media: 34/34 MATCH
python3 -u "$EV/instruments/census/census.py" --out <scratch>/census <scratch>/regen/work/*/translated.svg   # 0/0/0; CENSUS-DONE — a witness for R12 ONLY (its ideal is each SVG's own geometricPrecision measurement)
python3 -u "$EV/instruments/bond/bond.py" --out <scratch>/bond <scratch>/regen/work/CNX_Chem_04_03_etheneBr_img/translated.svg   # 3454–3539; BOND-DONE
python3 -u "$EV/instruments/rehearse.py" <new scratch dir> <scratch>/install-rehearsal.md       # last line: REHEARSAL-COMPLETE
pgrep -a chrome-headless                                                                # nothing
```

`regen34.py` without `--tree` runs the repository's own `experiments/figure-text-translation`: it writes only
under `--out`, but it runs from that directory, so keep `PYTHONDONTWRITEBYTECODE=1` (it sets it for its children).
