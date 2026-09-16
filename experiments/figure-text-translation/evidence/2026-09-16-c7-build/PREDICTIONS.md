# Predictions — written 2026-09-16 before any ⑦ code change

> Amend, never overwrite. Each prediction is checked in VERIFICATION.md.

| # | prediction |
|---|---|
| P1 | All 34 bought figures: `blocks.json` sha256 identical before and after; glyphRepairs empty for all 34 |
| P2 | PentIso after: 3 blocks read `boiling point: 36 °C` / `27 °C` / `9.5 °C`, still `send:true`; glyphRepairs `[{glyph: H11034, to: °, count: 3}]` |
| P3 | Amontons2 after: blocks `−100` and `−50`, `send:false`; glyphRepairs `[{glyph: H11002, to: −, count: 2}]` |
| P4 | rvosmosis after: refused `production-page` (Letter 612×792); not prepared |
| P5 | N2O5 after: resolves to `CNX_Chem_18_07_N2O5.eps`; prepares to 7 verbatim blocks, 0 sendable |
| P6 | dry ch11 after: rvosmosis under `REFUSED — production page` and a still-mapped line naming `CNX_Chem_11_04_rvosmosis_IS.svg`; not in the "hole" list |
| P7 | dry ch18 after: N2O5 `copied-photo`; no refusal |
| P8 | dry ch10 after: `glyphs repaired by the read layer` names PentIso 3× H11034 → °; the would-buy list includes PentIso |
| P9 | dry ch05 (control) after: no refusal, no glyph section; would-buy figures = its `translated` figures with no sidecar |
| P10 | Full `npm test`: the failing names equal the 36 before-names, both directions |

## Amendment — fix wave, 2026-09-16 (written before the fix-wave code and runs)

> Added after the final whole-branch review, before any fix-wave code or run. Nothing above this heading
> is edited. Checked in `VERIFICATION.md` § Fix wave, against files in `reports/after-fix/`.

| # | prediction |
|---|---|
| P11 | dry ch18: the run names `CNX_Chem_18_07_N2O5_IS.svg` as a live translated copy that is a whole Letter sheet (612×792) |
| P12 | dry ch11: the run names `CNX_Chem_11_04_rvosmosis_IS.svg` the same way, and still prints its `REFUSED — production page` line and its still-mapped line |
| P13 | dry ch05, ch09, ch10 (controls): no sheet line |
| P14 | the resolver/prepare change moves nothing: `prepare_corpus.py --label after-fix` writes a `summary.tsv` byte-identical to `reports/after/summary.tsv` |
| P15 | full `npm test`: failing names identical to `reports/before/npm-failing-by-name.txt`, both directions, with a planted control, and no file that died without a failing test |
