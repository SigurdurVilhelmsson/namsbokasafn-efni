# §C140 ⑩ — the brain heal, run on the local box

> **FROZEN 2026-09-15.** Evidence as written on that date, not a status page. Open work and
> status live in the active register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`,
> §C140 ⑩); if this document and the register disagree, **the register wins**.
> **0 ISK — the MT was spawned for 0 figures in every run below.** Branch
> `feat/c140-c10-brain-heal-run` off `main` `aea24558` (PR #472 merged).

## What this settles

PR #472 built the ring gate and left one run that only a box with poppler and the OpenStax source
PDFs could make (`docs/plans/2026-09-15-c140-c10-local-box-handoff.md`). This is that run.
**Brain is healed and the refusal side protected exocytosis** — but the first live attempt did
neither, and **reported `VERDICT ok`**. What went wrong is the more durable half of this folder.

| | predicted | measured |
|---|---|---|
| census sees both carriers before any write (P1, dry run) | brain 1 (`mask-2`), exocytosis 8, nobody else | ✅ exactly that |
| live brain (P2, first attempt) | `healed mask-2` | ❌ **`could not build the counterfactual heal (exit 1); left untouched`** — and `VERDICT ok` |
| determinism, clock pinned (P5′) | two runs `cmp`-identical | ✅ identical, `healed mask-2` both times (`reports/P5-pinned-determinism.txt`) |
| live brain (P2′) | 2 font timestamps + `source-29` payload, nothing else | ✅ exactly that; remainder identical |
| live exocytosis (P3′) | 8 refused, named; SVG changes by font timestamp only | ✅ 37 of 37 images untouched, remainder identical |
| `source-29` raster (90×24) | interior 1,936 px unchanged; only the 4 cut edges move | ✅ 0 interior, 224 edge px; **equals `figrings.heal(golden)` exactly** |
| reader's renderer (Chromium, 200 dpi) | change confined to the mask rect's edges | ✅ 1,320 px changed, **0 outside a ±4 px band** |
| the picture | outline gone, nothing else | ✅ `crops/brain-source-before-after.png` — the faint soft edge that remains is **in the source PDF too** |
| sidecars | byte-identical | ✅ both |

Predictions were written before each run and amended — not overwritten — after P2 failed:
[`PREDICTIONS.md`](PREDICTIONS.md).

## The two things P2 found

### 1. numpy — the gate failed closed, and the only trace was one warning line

`figrings.py`'s `heal` and `gate` import numpy lazily; `census` does not. The `pylibs/` that built
the gate had numpy; `pylibs/` is gitignored, so it did not travel, and the experiment README's
install line did not list it. So on this box the census found the candidate (P1 looked healthy),
the counterfactual heal died on `ModuleNotFoundError`, and the step stood down exactly as designed:
artwork untouched, run continues, **exit 0**. The warning said `exit 1` and discarded the child's
stderr, so the cause took a hand reproduction to find.

- reproduced RED: `reports/test-figrings-BEFORE-numpy.txt` (dies at the first heal)
- `python3 -m pip install --target=./pylibs --only-binary=:all: numpy` → numpy 2.5.3, cp314 wheel
- then ALL PASS, **output byte-identical to the frozen `evidence/2026-09-15-c10-ring-gate/reports/test-figrings.txt`**:
  `reports/test-figrings-AFTER-numpy.txt`; corpus census 691 / 9, brain and exocytosis lines identical
  to frozen: `reports/corpus-census-before-heal.txt`

This branch also makes every ring-gate failure warning carry the failing child's cause — on ONE
line, keeping both the head (where Node prints an uncaught error's message) and the tail (where
Python prints its exception), and naming the signal when a child is killed — and adds `numpy` to
the README install line with a note on why its absence is quiet.

### 2. A recompose is not byte-deterministic, and `cmp` was the wrong instrument

P2's SVG changed although nothing was healed. The whole difference is the `head` table of the two
embedded subset fonts: fontTools stamps `head.modified` (and so the whole-font `checkSumAdjustment`)
at compose time, and `figure-run.js` does not pin `SOURCE_DATE_EPOCH`. It was already known — the
T23 instruments pin the clock themselves — but it meant predictions P3 and P5 as first written would
have "failed" on noise. `instruments/svgdelta.py` replaces `cmp`: it compares font tables field by
field (accepting only `modified` + `checkSumAdjustment`), every `<image>` payload by id, and the
remainder with all data URIs blanked. **Validated on four controls before use** — self, a real
unhealed recompose, a planted image+text edit, a planted font field (`reports/svgdelta-*-control.json`).
The first version of it wrongly flagged the checksum; the unhealed-recompose control caught that.

## Environment, stated because it differs from the gate's own evidence

This box: poppler `pdftocairo` 26.01.0 · Python 3.14.4 · Playwright 1.62.1, **Chromium build 1234**
(151.0.7922.34) · artwork **re-derived from the source PDF** by `figure-prepare.py`. The gate's
frozen measurements were taken on the committed SVGs in a remote container with **Chromium build
1194** and no poppler. **The decision came out the same on both** — brain approved, all 8 exocytosis
masks refused — which is a second, independent reading of the gate, not a re-run of the first.

## What changed in the tree

- `books/efnafraedi-2e/media/CNX_Chem_03_01_brain-ec0b_IS.svg` — the healed figure (P2′, unpinned
  clock, like every other committed figure). Exocytosis's recompose was **restored to `HEAD`**: its
  only difference was the font timestamp.
- `test_figrings.py` corpus anchor — it asserted brain carries **one** candidate, a countdown that
  went red the moment the heal it gates was used (`reports/test-figrings-HEALED-TREE.txt`). It now
  asserts the healed state, **with a witness** (at an unbounded threshold the walker still reaches
  `mask-2`, ring excess now −1.0…−0.3). Verified both ways: ALL PASS on the healed tree
  (`reports/tf-A-healed.txt`); with the unhealed bytes swapped in, FAIL on the two heal-state
  assertions while the witness still passes, as designed (`reports/tf-B-unhealed.txt`).
- Driver tests: `figure-run-ring-gate.test.js` 17/17 (5 new cause tests were RED before the
  stderr change, plus the previously unexercised gated-heal failure branch); `figure-run-paid`
  all pass; `figure-run-free`'s 9 failures are **the committed baseline, by name, both directions**,
  with a planted-name control (`reports/free-failing-by-name.txt`).
- **Full root `npm test` on this tree: 36 failed in 13 files — the committed 36-name baseline,
  identical by name in both directions**, planted-name control included; no timeouts
  (`reports/full-suite-failing-by-name.txt`). This is the first full-suite run of the ⑩ code on a box
  that has `server/node_modules`.

## Limits

- **One figure, one browser.** Firefox and WebKit are §C140 ⑭, still unmeasured.
- **Post-heal corpus exposure is 691 figures / 8 candidate masks, all in exocytosis**
  (`reports/corpus-census-after-heal.txt` — whose `refused=` column counts STRUCTURAL refusals
  and reads 0), **and the gate refused all 8** (`reports/P3prime-exo.txt`). A future `--force` recompose of brain
  re-derives the unhealed artwork from the PDF and the gate heals it again (P5′ shows that is
  deterministic).
- **Nothing is rendered, synced or deployed.** Publication of ch03/ch04 is [USER]'s call.

## Reproducing

```bash
cd experiments/figure-text-translation
FIGTEXT_PYLIBS=./pylibs python3 test_figrings.py                      # must print ALL PASS first
cd ../..
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale --force --dry-run   # P1
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --figure CNX_Chem_03_01_brain-ec0b --force
node tools/figure-run.js --book efnafraedi-2e --chapter 3 --figure CNX_Chem_03_01_exocytosis-88f6 --force
FIGTEXT_PYLIBS=experiments/figure-text-translation/pylibs \
  python3 experiments/figure-text-translation/evidence/2026-09-15-c10-local-run/instruments/svgdelta.py A.svg B.svg
```
