# §C140 ⑩ local-box run — predictions, written BEFORE any run (2026-09-15)

Branch `feat/c140-c10-brain-heal-run` off `main` `aea24558`. 0 ISK: ch03 dry-run showed 0 spendable figures.

Golden copies (sha256):
- brain `_IS.svg`  e667c68b5a01642a9f4dfceca07d2a0a39e8ccfead7b9710cfea6c927d6b5640
- exo   `_IS.svg`  4470e50272b481c0df56235b266316d69e58610dcb5960f5b351614cfcf8a86d

## P1 — control dry run: `--chapter 3 --stale --force --dry-run`
- 15 figures selected (26 deselected), 0 bought, git tree clean afterwards.
- ring section names `CNX_Chem_03_01_brain-ec0b` with **1** candidate (`mask-2`), "not gated in a dry run".
- ring section names `CNX_Chem_03_01_exocytosis-88f6` with **8** candidates.
- no other ch03 figure names a candidate (corpus census: 9 masks in 2 figures).
- STOP if either figure is missing or the counts differ.

## P2 — live brain: `--figure CNX_Chem_03_01_brain-ec0b --force`
- ring section: `CNX_Chem_03_01_brain-ec0b: healed mask-2`; no ring warning.
- `git status`: brain `_IS.svg` modified. Sidecar: unchanged, or at most a `composedHash` stamp —
  `blocks` and any `state` byte-identical (a recompose must never write the sidecar's content).
- nothing else under `books/` changes.
- verdict ok, exit 0, spent 0.

## P3 — live refusal control: `--figure CNX_Chem_03_01_exocytosis-88f6 --force`
- ring section names exocytosis: **8 refused**, healed **none**, each refusal a named warning (Q4).
- `cmp` exo `_IS.svg` against golden → **identical** (recompose deterministic + no heal leaked).
- sidecar unchanged.

## P4 — the picture
- the healed brain renders with the light BBox outline gone; `crops/brain-outline-before-after.png`
  is the reference. Pixel difference confined to a thin band along the masked form's BBox edges;
  zero difference elsewhere (labels, artwork interior).

## P5 — determinism (brain, second live run)
- re-running P2 produces a byte-identical brain `_IS.svg` to P2's output.

---

# AMENDMENT 1 — after P2 FAILED (written before any re-run)

**What failed, and why (both root-caused, not worked around):**
- P2 printed `could not build the counterfactual heal (exit 1); left untouched`. Cause: `figrings.heal`
  imports numpy; `pylibs/` is gitignored and this box's had none; the experiment README install line
  omits numpy. Reproduced RED in `test_figrings.py`; after `pip install --target=./pylibs numpy`
  (cp314 wheel, 2.5.3) → ALL PASS, output byte-identical to the frozen report; corpus census
  691 figures / 9 masks, brain+exo lines identical to frozen.
- P2's SVG changed with no heal. Cause: fontTools stamps both embedded subset fonts' `head.modified`
  (+ the whole-font `checkSumAdjustment`) at compose time; `figure-run.js` does not pin
  SOURCE_DATE_EPOCH. Nothing else moved (svgdelta: remainder identical, 0 images).
- ⇒ P3 "cmp identical" and P5 as written were WRONG INSTRUMENTS. Replaced by `svgdelta.py`
  (validated: self / real recompose / planted image+text / planted font field).

## P5' — determinism, clock pinned (run FIRST)
- two brain runs with SOURCE_DATE_EPOCH=1700000000 → `cmp` byte-identical to each other.
- each prints `healed mask-2`.

## P2' — live brain, unpinned (the commit candidate, run LAST of the brain runs)
- summary: `CNX_Chem_03_01_brain-ec0b: healed mask-2`; no ring warning; spent 0; VERDICT ok.
- svgdelta golden→P2': fonts head.modified-only ×2 · images.differ == [source-29] exactly ·
  onlyA/onlyB empty · remainderIdentical TRUE.
- svgdelta P5'→P2': fonts head.modified-only ×2 · images.differ == [] · remainder identical.
- source-29 raster (90×24): interior 88×22 = 1936 px identical; changed px ⊆ the 4 cut edges
  (≤ 224); every edge px == its inner neighbour (corners = diagonal inner).
- sidecar byte-identical; `git status` shows only brain `_IS.svg`.

## P3' — live refusal control: exocytosis, unpinned
- ring section: exocytosis named, 8 refused (mask-8, -12, -39, -43, -189, -271, -409, -491), 0 healed.
- svgdelta golden→P3': fonts head.modified-only (every face) · images.differ == [] · remainder identical.
- sidecar byte-identical. Then restore exocytosis `_IS.svg` to HEAD (timestamp-only noise).
