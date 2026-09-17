# Predictions — §C140 ⑥a, written before the code change (2026-09-17)

Expectations from the frozen exploration (`evidence/2026-09-17-c6-explore/critic.md`) and the spec; the measured
recount (`reports/before/stix-recount.json`) is stated beside each where it exists.

- **P1 — recount.** On the 34: kept STIX-Regular blocks 42, translated 3 (all in CNX_Chem_04_04_sandwich), other STIX
  faces 0, characters outside the official cmap 0; prep keys identical to ④'s. (Measured before the change: kept
  STIX-Regular blocks 42, translated 3 (all in CNX_Chem_04_04_sandwich), other STIX faces 0, characters outside the
  official cmap 0 (of 4 unique STIX-Regular characters drawn across the 34: `' '`, `'+'`, `'='`, `'×'`); all 34 prep
  `blocks.json` byte-identical to ④'s `reports/after/blocks/` — `reports/before/stix-recount.json`,
  `reports/before/keys-vs-c4.txt`. 0 concerns.)
- **P2 — text lists (compose-only, after vs before).** For every figure: the same number of `<text>` elements with the same
  text, x, y, size, weight, style and fill. `font-family` changes from `FigIS` to `FigSym` exactly on the run-exact items drawn
  from an eligible run, and nowhere else. Figures with no eligible run: identical text lists, no FigSym face, no metadata.
- **P3 — faces.** A figure with an eligible run gains exactly one `@font-face` for `FigSym` (400/normal) after its FigIS rules;
  FigIS rules keep their order; a FigIS face whose only characters moved to FigSym disappears.
- **P4 — XML and metadata.** All 34 after-SVGs parse as XML; every figure with an eligible run carries one `<metadata>` holding
  the copyright notice, the trademark notice and the pinned licence text; no other figure carries one.
- **P5 — names.** The FigSym subset embedded in every such figure has no forbidden word in name IDs 1–6/16/17/21/22 or the CFF
  names, and keeps name IDs 0 and 7 and the CFF Notice verbatim.
- **P6 — Chromium.** On the figures with an eligible run, the kept STIX glyphs render closer to the source raster after than
  before; removing the FigSym `@font-face` rule changes the after render (the family is really used).
- **P7 — recompose.** Only the figures P2 names change under `books/`; for each, the artwork part is byte-identical and the text
  group differs; `MT spawned for 0 figure(s)`; no sidecar or mapping change.
- **P8 — suites.** Every Python suite prints `ALL PASS`; root vitest failing names equal the baseline by name.
