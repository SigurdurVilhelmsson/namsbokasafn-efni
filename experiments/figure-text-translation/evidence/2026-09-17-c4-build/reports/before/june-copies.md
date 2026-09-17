# June-vintage copies — looked at, §C140 ④ S6

Crops: `june-CNX_Chem_07_06_Egeom.png`, `june-CNX_Chem_05_02_IcePack.png` (left = source at 200 dpi via
`pdftocairo`; right = the committed `_IS.svg` rendered in Chromium via `render-check.mjs`). Produced by
`instruments/june_copies.py`; both halves were also inspected as separate crops (kept in the scratch dir named
in the task report) to rule out an artifact of the side-by-side composite.

- **CNX_Chem_07_06_Egeom** — the June copy shows the wedge/dash bonds on CH4, PF5 and (partially visible) SF6
  fully drawn and dark, matching the source. It does **not** show the fading the exploration found in the
  shipped `strip-text.py` (ORIG) render. A pixel diff over the crop region is non-zero (6,258 of 305,108 px
  above 40/channel) but reads as rasteriser/anti-aliasing difference between `pdftocairo` and Chromium — the
  wedge/dash ink itself is present and dark on both sides, not faint on one.
- **CNX_Chem_05_02_IcePack** — the June copy shows the "INSTANT COLD PACK" lettering fully filled in blue with
  its snow-cap highlight, matching the source. It does **not** show the lettering loss the exploration found in
  the shipped strip's render. The crop's pixel diff (1,482 of 51,072 px above 40/channel) again reads as ordinary
  rendering-engine anti-aliasing, not missing content.

**Read as found, not built on:** on this 2-figure read-only check, the June-vintage (PyMuPDF redaction) copies do
not appear to carry the same defect as `strip-text.py`'s BT..ET deletion — consistent with the two tools working
by different mechanisms. This is exactly the S6 out-of-scope finding to log in the register; it is not evidence
about any other June-vintage figure (691 exist; only these two were checked).
