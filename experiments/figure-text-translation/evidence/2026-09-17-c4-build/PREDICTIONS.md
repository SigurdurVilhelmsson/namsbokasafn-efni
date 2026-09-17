# Predictions — §C140 ④, written before the code change (2026-09-17)

Numbers from the frozen exploration (`evidence/2026-09-16-c4-explore/`, copied here as expectations, not as
measurements of this build).

- **P1 — corpus renders.** Over the 533 figures (the 34 bought + every figure the census found with a non-text
  operator inside BT), BEFORE (`instruments/strip_text_before.py`) vs AFTER (the fixed `strip-text.py`): exactly
  **34** figures differ by value (count_gt0 > 0), **15** above 40 per channel, the changed set **equal by name** to the
  exploration's; every changed pixel at distance 0.0 from the source; the serialiser control 0 px; the planted control
  detected.
- **P2 — bought.** Among the 34 bought figures only `CNX_Chem_04_05_combustion` differs.
- **P3 — refusals.** The fixed strip, run over every figure the census scanned (909 distinct), refuses **0**.
- **P4 — keys.** `reports/after/summary.tsv` equals `reports/before/summary.tsv` byte for byte, and all 38
  `blocks.json` are identical.
- **P5 — SVG arms.** combustion's `artwork.svg` differs before/after. For exocytosis-88f6, empform, HClsoln,
  flowchart and sandwich: **undetermined** (the render saw 0 px); for every figure, no `<mask`/`<image` count and no
  `svgfix.json` collapsed/addOps count rises.
- **P6 — recompose.** Only the recompose set's `_IS.svg` files change under `books/`; for each, `textgroup_sha256`
  is identical and `artwork_sha256` differs; `MT spawned for 0 figure(s)`; no sidecar or mapping change;
  combustion's recomposed copy, rendered in Chromium, shows 7 black arrowheads.
- **P7 — tests.** Every existing Python suite still prints `ALL PASS`; `test_strip_text.py` prints `ALL PASS` and its
  negative arms fail against the shipped rule; the root vitest failing names equal `reports/before/npm-failing-by-name.txt`.
- **P8 — June copies.** Unpredicted: recorded as found (`reports/before/june-copies.md`).
