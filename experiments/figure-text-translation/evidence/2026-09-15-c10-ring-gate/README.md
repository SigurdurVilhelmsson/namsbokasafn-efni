# §C140 ⑩ — a visibility gate for the soft-mask ring heal

> **FROZEN 2026-09-15.** Evidence as written on that date, not a status page. Open work and
> status live in the active register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`,
> §C140 ⑩); if this document and the register disagree, **the register wins**.
> **0 ISK — nothing that calls the MT was run, and no source PDF was touched.**

## What this settles

[USER] ruled 2026-09-13 that the c10 ring heal must not ship until a **visibility gate** exists:
*one visible example against eight invisible ones is too thin.* This is that gate, built and
measured. Three candidate gates were tried; **two of them were measured to fail**, and the
numbers that killed them are below, because each looked obviously right beforehand.

| gate | rule | measured outcome |
|---|---|---|
| **byte-level** (c10's census rule) | outer ring − inner ring ≥ 50 alpha | **fails.** Approves 9 of 9 candidate masks, including the 8 where exo-spike §7 measured the heal as destroying picture content |
| **threshold on the unhealed render** | the edge-line statistic ≥ T | **fails.** Approves exocytosis `mask-271` right (33.2) and `mask-189` right (11.0), where healing changes the statistic by **0.0** — those light lines are drawing, not ring |
| **interventional** (adopted) | heal a side only if healing it *demonstrably* reduces the edge-line statistic, then two per-mask rules | **separates.** brain approved 1 of 1; exocytosis **0 of 8** |

## Environment, stated because it bounds everything below

Measured in a remote container with **no poppler and no OpenStax source PDFs**. So nothing here
re-derives artwork from a PDF, and there is **no `pdftocairo -png` reference render** — the
reference c10 and exo-spike used. Every measurement is on the **committed composed SVGs** at
`main` `0895fd7e`, rendered in Playwright Chromium build 1194 inside `<img>`, which is the path
`cnxml-render` publishes through.

That is a limitation and it is also the point: **the gate adopted here needs no external
reference**, which is what makes it runnable wherever a figure is prepared.

## Premises re-checked before building anything

The register and the frozen c10/exo-spike reports are 2 days old and PR #471 changed artwork
preparation (`-noshrink -nocenter`, the blend-lerp collapse). Each premise was re-run, not
assumed:

| premise | result on `main` `0895fd7e` |
|---|---|
| brain still carries the ring | **yes.** `mask-2` ring excess top/bottom/left/right `60.5 / 205.1 / 200.2 / 190.7` |
| the outline is still visible | **yes.** Edge-line contrast L/R/T/B **33.8 / 25.5 / 12.3 / 23.3**, against ≈1.4 on both controls — c10's numbers **to the digit**, on a different machine and a different Chromium build |
| exocytosis still carries 8 flagged masks | **yes**, and `mask-491`'s ring reads `49.8 / 222.0 / 182.0 / 133.2` — exactly `ring_vs_clip.txt` |
| ⑫ is fixed, so exocytosis loads | **yes.** 24.9 MB, renders in ~5.7 s wall including browser launch |
| the c10 heal reproduces | **yes.** On brain: edge contrast → **1.1 / 0.0 / 0.0 / 2.2**, **1,320 px changed, 921 by > 8, max 56** — c10 reported 1,320 / 921 / 56 |

## Corpus exposure — the denominator, measured

`figure-rings.py census books/efnafraedi-2e/media/*_IS.svg` over **all 691** composed SVGs
(`reports/corpus-census.txt`), 3.6 s, no browser:

- **9 candidate masks, in 2 figures**: `CNX_Chem_03_01_brain-ec0b` (1) and
  `CNX_Chem_03_01_exocytosis-88f6` (8). **No third carrier exists today.**
- The population that *can* carry this at all is the cairo-vector artwork, which is only the
  recomposed figures; the rest of the 691 are the June raster copies. So the exposure is
  **2 of the ~24–34 figures composed since 2026-09-12**, and it is unbounded going forward.

## The finding that decides the gate's shape

**A walker that does not follow `<filter><feImage>` finds 0 masks on exocytosis and reports it
clean.** cairo emulates PDF blend modes with `feImage` referencing an in-document group, so on a
blend-carrying figure the masked groups are reachable *only* through filters. The first version
of the locator returned `records 0` for exocytosis — a confident, empty, wholly wrong answer on
**the one figure in the corpus where the byte detector false-positives.** It is pinned by a
planted fixture in `test_figrings.py` whose premise (nothing outside `<defs>` references the
masked group) is itself asserted.

A second, smaller one: the statistic must be **one-sided**. A two-sided `max-|·|` rule scores
brain's *correctly healed* edge at **−25.5**, because after the heal the masked shape's own
legitimate dark boundary is the most extreme line there. It would call a repaired figure broken.

## The gate, and what it decides

Per side: `before ≥ 10` **and** `before − after ≥ 8`, where `after` is a render of the same file
with **every** candidate healed (the counterfactual). Per mask, conjunctively: **≥ 2 cut sides
pass** and **the best delta ≥ 20**.

The "≥ 2 sides" rule is a mechanism, not a fitted number: poppler fills the whole raster surface
with `/BC`, so a real ring is a property of the entire perimeter the clip cuts. One side firing
alone is better explained by picture content.

```
brain       mask-2   left 35.0 → 0.4 (Δ34.5) · right 24.7 → 0.0 (Δ24.7)
                     top  10.3 → 0.0 (Δ10.3) · bottom 20.9 → 0.7 (Δ20.2)   APPROVED 4/4
exocytosis  8 masks, 32 sides                                              approved 0 of 8
            mask-491 bottom 10.2 → 0.0 is the ONLY side that passes; the mask is refused
                     at "sides 1 < 2" — and it is precisely the side exo-spike §7 measured
                     the heal as DAMAGING (the axon's upper-edge shading band)
```

⚠️ **The per-side test alone does not separate.** brain's weakest side is **10.3**; `mask-491`'s
best is **10.2**. No per-side threshold can tell them apart — only the per-mask aggregation does.
Full tables: `reports/brain-gate.txt`, `reports/exo-gate.txt` and their `.json` verdicts.

## Pictures

- `crops/brain-outline-before-after.png` — ×4. The light box corner around the label is the
  defect [USER] reported; it is gone after the approved heal.
- `crops/exocytosis-mask491-ungated-heal.png` — ×8. What the **ungated** heal does to the axon:
  the edge shading changes and no ring is removed. This is the damage the gate prevents.

Counterfactual heal, whole figure: brain **1,320 px** changed (921 by > 8, max 56);
exocytosis **241 px** (72 by > 8, max 48). exo-spike §7 reported 232 / 61 / 39.5 for exocytosis —
it compared the **artwork-only** SVG, this compares the **composed** file, so the small
difference is expected and is not a disagreement.

## Known limits, named

1. **One positive.** The gate's separation rests on brain alone against 8 negatives. The
   thresholds are defensible (each has a mechanism or a measured spread beside it) but they are
   not calibrated on a population. **The next figure of this shape is evidence, and should be
   re-measured rather than assumed to pass.**
2. **No cairo reference.** Visibility here means "a light line that healing removes", not
   "differs from what poppler's own rasteriser draws". The two agreed on brain and on
   `mask-491`; they have not been compared anywhere else.
3. **Render-dependent.** `before`/`after` come from one browser at one size, so the numbers are
   not invariants. The **decision** is much less fragile than they are: swept over
   floor 6‥16 × drop 4‥12 × minSides 2‥3 × minDelta 14‥32, **360 of 360 settings give the same
   answer** (brain approved, all 8 exocytosis masks refused) — `reports/threshold-sweep.txt`,
   whose control at floor 0 / drop 0 / minSides 1 / minDelta 0 approves all 8, so the sweep is
   not reading a gate that ignores its arguments. Chromium only; Firefox and WebKit are §C140 ⑭
   and remain unmeasured.
4. **`sharedImage`, `noClip` and `clipUncut` fire on 0 real masks.** They are exercised by
   planted fixtures only, and they fail **closed**.
5. **Exocytosis `mask-0` left ring excess 39.6, no clip wrapper** — below the byte threshold, so
   it is not a candidate and was not examined here either. Inherited from c10, still open.
6. **Nothing was applied to `books/`.** The tool refuses to write inside `books/` at all.

## Reproducing

```bash
cd experiments/figure-text-translation
python3 -m pip install --target=./pylibs pillow numpy

# 1. detector - no browser, 3.6 s over the whole corpus
FIGTEXT_PYLIBS=./pylibs python3 -u figure-rings.py census ../../books/efnafraedi-2e/media/*_IS.svg

# 2. the counterfactual, then the two renders  (render-check.mjs, <img>, 200 dpi)
FIGTEXT_PYLIBS=./pylibs python3 figure-rings.py heal <fig>_IS.svg --out /tmp/after.svg --approve-all
node render-check.mjs <fig>_IS.svg /tmp/before.png 975 484
node render-check.mjs /tmp/after.svg /tmp/after.png 975 484

# 3. the decision
FIGTEXT_PYLIBS=./pylibs python3 figure-rings.py gate <fig>_IS.svg \
    --before /tmp/before.png --after /tmp/after.png --report /tmp/gate.json

# 4. the gated heal - writes nothing without a gate report
FIGTEXT_PYLIBS=./pylibs python3 figure-rings.py heal <fig>_IS.svg --out /tmp/healed.svg \
    --gate-report /tmp/gate.json

FIGTEXT_PYLIBS=./pylibs python3 test_figrings.py    # -> reports/test-figrings.txt
```

⚠️ `render-check.mjs` imports playwright by an **absolute path on one developer's machine**
(`/home/siggi/dev/repos/…/server/node_modules/playwright`). It does not run anywhere else without
editing. Noted here because it bit this session; not fixed, and not this item's to fix.

## Housekeeping

- Everything written outside this folder went to the session scratchpad. No file under `books/`
  was written or modified; `git status --porcelain` shows only this branch's intended additions.
- `__pycache__` under `experiments/figure-text-translation/` is gitignored; runs here used the
  interpreter's default and may have refreshed it.
- Instruments used from the frozen c10 folder unchanged: `instruments/c10/tools/edgeline.py`
  (with its unused `scipy` import stripped, which changes no value), `mask_census.py`.
