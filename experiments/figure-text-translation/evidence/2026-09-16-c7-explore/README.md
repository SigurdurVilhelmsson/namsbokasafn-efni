# Evidence — what §C140 ⑦'s two spend hazards actually are, measured before designing the gate, 2026-09-16

> 🧊 **FROZEN, 2026-09-16.** Cited, never synced. Open work and status live in the campaign register (§C140 ⑦,
> ⏩ RESUME); the design that rests on this is
> [`docs/superpowers/specs/2026-09-16-c140-c7-spend-gates-design.md`](../../../../docs/superpowers/specs/2026-09-16-c140-c7-spend-gates-design.md).
> **0 ISK** — no MT was spawned; `figure-run.js` ran only with `--dry-run`; nothing under `books/` was written.

## How it was measured

Three read-only explorers (a workflow). **The controller re-derived only the rows marked "re-derived by the
controller"** (from the raw data here), plus three live checks: a free prepare of PentIso, the redraw path in
`compose.py`, and the two live SVGs. Every other row is an explorer's measurement, with its instrument and raw
output kept here so it can be re-run.
Their full findings, with `file:line` for every code fact, are `reports/explore-findings.txt`. The instruments
are copied here byte-exact from the session's scratch space; the raw outputs are `data/*.gz`. Instruments may
name the scratch paths they ran in — that is provenance, not a dependency. Source art comes from the gitignored
`sources.local.json` trees (`first-edition` = the main Chemistry 2e delivery; `updates-2e` = selected art).

## Hazard 1 — fonts whose glyphs every reader misreads

| | measured | where |
|---|---|---|
| the defect | MathematicalPi fonts carry a `/Differences` encoding with **Mathematical Pi's own glyph names** (`H11034`, `H11002`, `H9261`) and **no ToUnicode map**. pdfminer cannot map those names, silently keeps the base WinAnsi character for the code, and so reads `°` as `8`, `−` as `2`, `λ` as `l`. poppler and PDFium read the same | `reports/explore-findings.txt` (mathpi Q2) |
| where it comes from | EPS sources only, after ghostscript staging: ghostscript wrote a ToUnicode map for 1,308 of 1,312 fonts, and the 4 without one are exactly the affected fonts. Where ghostscript did write a map, it agrees with the glyph name for **13,563 of 13,563** codes; a planted shift disagrees 12,613 times (control) | `instruments/fonts/tu_check*.py` |
| the detector | **no ToUnicode AND at least one `/Differences` glyph name that pdfminer cannot map.** Over `data/struct.jsonl.gz` (10,233 font records, 1,317 files) it fires on exactly **4 font records in 3 files**: MathematicalPi-One in PentIso (`[56, H11034]`), Amontons2 (`[50, H11002]`) and the Color Contrast Modified Blackbody (`[108, H9261]`), and MathematicalPi-Four in that same Blackbody | re-derived by the controller from `data/struct.jsonl.gz` |
| control | `CNX_Chem_10_05_Carbon`'s MathematicalPi-One has a ToUnicode map and no unmapped names (its glyph is a correct space) — **the detector skips it; a detector keyed on the font NAME would hold its block** | same |
| the true characters | from 200-dpi rasters: PentIso `36 °C` / `27 °C` / `9.5 °C`; Amontons2 `−100` / `−50`; Blackbody `Wavelength λ (nm)`, `λ maximum` | `crops/mpi_crops.png` |
| figures the driver uses | 2: **PentIso** (ch10) — 3 blocks, all `send:true` (`boiling point: 36 8C` …); **Amontons2** (ch09) — 2 blocks, `send:false` (`2100`, `250`). The Blackbody revision is not reachable (its file is prefixed `CNX_Chem2e_`, which basename lookup never matches) | `reports/explore-findings.txt`; `reports/PentIso-blocks-before.json` (a free prepare) |
| already bought | **none** — none of the 34 bought ch03/ch04 figures uses an affected font | `reports/explore-findings.txt` (mathpi Q4) |
| why a spend hold is not enough | a `send:false` block is **kept** and redrawn from its read text (`compose.py` `draw_run_exact` → `figtext.run_draw_text`, which strips only `(cid:N)`), so `2100` and `36 8C` reach readers whether or not they are bought | `reports/explore-findings.txt` |

## Hazard 2 — production pages resolved as figures

| | measured | where |
|---|---|---|
| census | 1,148 figures enumerated → **910 resolved** (612 `.pdf`, 298 `.eps`) | `instruments/pages/{enum.cjs,resolve.py,pagecensus.py}`, `data/pagecensus.jsonl.gz` |
| the signal | page box at a **standard paper size** (Letter, A4, Legal, Tabloid, A3; either orientation; ±2 pt): **exactly 2 of 910** — `CNX_Chem_11_04_rvosmosis` and `CNX_Chem_18_07_N2O5`, both Letter PDFs. Still 2 at ±10 pt. The next largest artwork is 468×576 pt (`CNX_Chem_06_03_Oshapes`, a real figure) | re-derived by the controller from `data/pagecensus.jsonl.gz` |
| signals rejected | aspect ratio vs the published raster misses rvosmosis (\|log\| 0.010) and flags 41; `Creator` = InDesign misses rvosmosis; "embeds a raster the size of the published figure" is 24 false positives in 25; the chrome-text regex was written after seeing both pages and each page fires on a different term | `instruments/pages/analyse.py`, `reports/explore-findings.txt` |
| N2O5 | the folder holds `CNX_Chem_18_07_N2O5.pdf` (an InDesign Letter page: one placed raster + a filename caption) **and** `CNX_Chem_18_07_N2O5.eps`, the real vector figure (Illustrator, 288×91 pt). The PDF wins on format order. The EPS prepares to 7 blocks, all verbatim element symbols → `copied-photo`, nothing to buy | `crops/n2o5_page.png` |
| rvosmosis | the only vector is the Illustrator **Art Dialogue Sheet** (Letter): 14 blocks, 13 sendable, 8 of them sheet chrome. The published JPEG is a pixel-exact crop of a 234×306 pt region of it (MAE 2.16 grey levels; a 40 px-shifted control 14.77) | `crops/rvos_page.png`, `crops/rvos_diff.png` |
| live today | both whole-sheet June SVGs (viewBox `0 0 612 792`) are served on namsbokasafn.is, rvosmosis with "Art Dialogue", "Art Pass", "Pick up from" visible in English; a nonsense-URL control returns 404 | `crops/rvos_june.png`, `crops/n2o5_june.png` (Chromium, `instruments/pages/shot.mjs`) |
| what a refusal does | nothing is composed or published for a non-`translated` outcome; the reader keeps whatever `_IS.svg` + mapping row already exist, so a refused figure **does not** "ship in English" while a June copy is mapped (BlastFurn, already on the superseded list, shows it) | `reports/explore-findings.txt` (prodpages Q4) |

## The driver, as found

`tools/figure-run.js` buys a figure only when its outcome is `translated` **and** it has no sidecar (R8). A dry
run lists **no** would-buy figures, **no** billable characters and **no** ISK; the spend line is printed only on
a live run although the comment above it says otherwise. Billable characters are
`dedupeSendBlocks(send:true).english` lengths (`translate-blocks.mjs`), not `prepare.json`'s `chars`. Full map,
with `file:line`: `reports/explore-findings.txt` (driver).

## Limits

- The font detector's census covers the `first-edition` Source_File PDFs, all EPS/AI in both trees, and 3
  `_preptest` PDFs; native TrueType fonts cannot be checked by glyph name (1,088 of 1,092 use `post` format 3).
- The page census uses each artwork's CropBox (PDF) or HiResBoundingBox (EPS) as the resolver found it today.
- Only 3 Mathematical Pi glyph names are confirmed from rasters; what other H-numbers stand for is not known.
