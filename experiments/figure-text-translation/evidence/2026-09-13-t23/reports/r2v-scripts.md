# r2v-scripts: adversarial check of the r2 prototype, lens ② (integration and text integrity)

**Date:** 2026-09-13. **Cost:** 0 ISK. Nothing that calls the MT was run. The only composes were copies of `r2/tree/compose.py`, with outputs in my scratch.
**Repo:** read-only. `PYTHONDONTWRITEBYTECODE=1` was set on every Python run, and `PYTHONPYCACHEPREFIX` pointed at my scratch for compose children.
- `find experiments/figure-text-translation (pylibs included) books/efnafraedi-2e -newer START.marker` returns nothing.
- Positive control: the same predicate over my `pyc/` lists 2 entries.

**Scratch:** `/home/siggi/dev/scratch-c140/r2v-scripts/` (scripts in `scripts/`, results in `out/`, plants in `plant/`, regenerated cells in `regen/`, SVG-checker controls in `ctrl12/`).
**I did not write into `r2/`.** My `run_regen.py` is a copy of `r2/scripts/run.py` with its output root moved to my scratch.

**Population, unless stated:**
- the 34 bought figures;
- 176 layout blocks, drawn on the V5 path (unit: block, keyed `basename#block`);
- 277 kept `<text>` / run-exact items (unit: drawn run);
- 52 script stretches in 34 token blocks in 13 figures (unit: stretch).

**What I trust from the builder's artefacts, and nothing more:**
- the `block` and `path` tags in `items.json`;
- `FT.group`/`merge_blocks`/`block_key`, used only to form blocks and keys (the bought unit).

**What I re-derived:**
- the script expectation, from `runs.json` with my own line, baseline and stretch code (not c2's);
- the drawn side, from the **SVG text layer**. The SVG is zipped 1:1 against `items.json`, with text, x, y, size, rot, italic and bold asserted.

---

## Headline

1. **The builder's value claims hold under independent instruments, and every instrument's planted control fires.**
   - Text sentinel: 176/176, from SVG geometry.
   - Script placement: 52/52 stretches, 0 per-character style mismatches on 176 blocks, in all 7 V5 cells plus the F 9.0 control.
   - Kept items: 277/277 `<text>` byte-equal to E with decimal off.
   - Decimal: exactly 35 kept runs change, `.`→`,` only, with every other attribute unchanged.
   - `unformatted`/`overflow` agree with the cairo-drawn result.
2. **An editor edit crashes the figure (P10).**
   - Editing any bought identity block into a translation raises `KeyError: 'CNX_Chem_04_02_HClsoln#1'` at `r2/tree/compose.py:372`. Compose exits rc 1 and writes no PNG, SVG or report.
   - Cause: the census holds only the 176 pre-bought layout blocks.
   - Exposure in the 34: **7 identity blocks in 4 figures** (basehyd `NaOH`; HClsoln ×3; GreenChem `H2, Raney Ni`; FishLemon `CH3COOH`, `CH3COO–`).
3. **A style can be silently placed on the wrong character on a real corpus shape.**
   - **Cause:** c2's letter-weighted base picks the *subscript* as the base whenever the subscript carries more letters than its base letter. 19 `send:true` corpus blocks have this shape (`Patm`, `qout`, `qin`, `wby`, `won`, `dxy`…, `urms`, `E°cell`, `Δoct`, `Π solution`).
   - **Composed on the real `Systemqw` runs** (planted value and census row): `qout (varmi út)` draws **`q` at 17.285 pt, raised +3.14 pt, italic**, and **`out` at 11 pt on the baseline**. The source has q at 11 pt and `out` at 7 pt, −2 pt. `unformatted = []`.
   - **Related defect:** `sz0 = b[0]['size']` is not the label's base size in **47** corpus `send:true` blocks. Frequency b3 is drawn wholly at 11 pt against a 9 pt source body.
4. **Two known silent or false report shapes are still there.**
   - **Glued anchored repeat (P5):** `(mól–1mól–1)` draws the first `–1` plain and the second superscripted, with `unformatted = []`. c2 Q5 named this; r2 carries c2's `transfer` unchanged.
   - **Duplicate source tokens:** on real AOtype runs (`3px and 3px`, `3py and 3py`, `send:true`), both occurrences are formatted correctly, yet **2 spurious `absent` misses** are named per block.
5. **`overflow` is decided in cairo's 200-dpi hinted metrics, but the published artefact is an SVG a browser shapes.**
   - Under HarfBuzz metrics (PIL raqm), 2 blocks overflow their budget **unnamed** at PAD 2.0 (every F):
     - moleratio2 b3 `Efnajöfnustuðull`: 56.93 > 56.01 pt;
     - combmap b10 `Reynsluformúla`: 55.58 > 54.75 pt.
   - At PAD 2.5 / F 7.5, one **named** block fits under HarfBuzz: moleratio2 b3, 53.37 ≤ 55.01 pt.
6. **⑨ per RUN misses 7 decimals in a ch03 figure outside the 34.** `CNX_Chem_03_02_moles-6296` draws text one glyph per run, so `32.1 g S`, `65.4 g Zn`, `28.1 g Si`, `12.0 g C`, `24.3 g`, `118.7 g Sn` and `63.5 g Cu` keep `.`. Per-line R3 converts them. Population: 12,370 kept (`send:false`) lines in c2's 910-figure census; per-run changes 730 lines, per-line 737.
7. **"Scaled by the drawn size" is never exercised by the corpus: 0 of 52 drawn stretches sit in a shrunk block, in any cell.**
   - Plant P6 exercises it and passes: the block is drawn at 7.5 pt, scripts at 5.834 pt, frac −0.3333.
   - Italic transfer is also unexercised in the 34. Plant P10b exercises it: 11/11 stretches placed, including 4 italic runs and 2 raised charges.

## Key numbers

| name | value | population | control |
|---|---|---|---|
| SVG ↔ items zip | 34/34 figures 1:1 (text, x, y, size, rot, italic, bold) | dec-on cell, 34 figures | plants altering the SVG and items alike still zip; my first planter clobbered `font-family` and the zip fired (count 33≠34) |
| r2/svg provenance | regenerated SVGs equal to `r2/svg` modulo the woff2 base64 payload, 34/34; items byte-equal 34/34 | 34 figures | woff2 payload differs on every compose (non-deterministic bytes) |
| (2) text sentinel | 176/176 in 7 V5 cells + F 9.0 control + transfer-off | 176 layout blocks | 5 plants on sacch (baseline +0.6 pt, size→base, sup→sub, deleted char, item moved a line): 5/5 fire, clean copy passes |
| (1) script stretches | 52 source stretches → 52 drawn, each its own `<text>`, ratio/frac within 0.006 of source; style mismatches 0/176 | 34 token blocks, 13 figures (named below) | transfer-off run: style mismatch fires on 34 blocks, plain formula-like scan fires on 32 |
| (1) drawn base of scripted blocks | 9.0 pt for 52/52 stretches in every cell | 52 stretches × 7 cells | P6 plant: shrunk to 7.5 pt, scripts 5.834 pt / frac −0.3333 |
| (3) kept untouched | 277/277 kept `<text>` raw strings byte-equal to E (dec off); kept items equal to E in 9 decimal-off runs; artwork prefix byte-equal 34/34 | 34 figures | swapped dec-on-as-off run: fires on 5 figures |
| (4) decimal on | 35 kept runs change: alsulfatemass 7, aspirin 7, chloroform 7, glycinemass 9, saltMass 5; 0 with any attribute other than text changed; 23 distinct values | 277 kept runs | swapped run: independent-R3-vs-drawn fires 35/35 |
| (4) independent R3 | from c9 §7 prose, per run == drawn on every kept block; per line also 35; run-split numbers 0; other kept runs with digit+separator 0; translated values with `d.d` 0 | 34 figures | prose re-implementation == `r2dec.r3_run` on 12,370 corpus lines (0 disagreements); branch hits: thousands 10, tuple 6, fragment 32, leading point 1 |
| (5) named overflow | 0 inconsistencies (word drawn, size, need == cairo width ±0.02, need > budget, budget == census) | 5/8/8/5/9/10/8 entries in the 7 cells | — |
| (5) unnamed overflow, cairo | 0 in every cell | 176 blocks × 7 | — |
| (5) unnamed overflow, HarfBuzz | PAD 2.0: 2 (moleratio2 b3, combmap b10); PAD 2.5: 0; named-but-fits: PAD 2.5/F 7.5 moleratio2 b3 | 176 blocks × 6 | fontTools unkerned widths give the same numbers |
| within-word joint drift (browser metrics) | max 0.317 pt overlap (map2 b0/b1 `Mg(OH)`→`2`); at spaces up to 1.537 pt (ethene b0); cairo 0.001 | 82 within-word + 20 at-space joints | — (inherited envelope c2: ≤0.57 pt in Chromium) |
| edge plants | P1–P9, P10b, P11 draw rc 0; P10 crashes rc 1 | 3 figures (sacch, map3, HClsoln) | unedited blocks item-identical to the committed cell in every rc-0 plant |
| corpus inverted base | 19 send:true blocks with a styled char larger than its line base | 2,925 send:true non-arc blocks (c2 census) | composed on real Systemqw/Frequency/rvosmosis runs |
| corpus sz0 ≠ letter base | 47 | 2,925 send:true non-arc blocks | 0 of 176 in the 34 |
| corpus per-run vs per-line R3 | 7 lines differ, all moles-6296 | 12,370 kept lines, 910 figures | 0 in the 34 |

## (1) Scripts, per figure: expected stretches (from runs.json) vs drawn (from the SVG)

Every row is drawn at base 9.000 pt, as its own `<text>`, with ratio 0.7778. Source frac is shown to its measured 4 dp; drawn frac is ±0.0005 of it. Full listing: `out/per-figure-dec.txt`.

| figure | block: stretch (frac) | expected | drawn |
|---|---|---|---|
| 03_02_copperMoles | b4 `–1` of `(mol–1)` (+0.333, anchored fallback on `(mól–1)`) | 1 | 1 |
| 03_02_glycine | b0 `2`,`5`,`2` of C2H5O2N; b2 same (−0.333) | 6 | 6 |
| 03_02_sacch | b0/b2/b3 `7`,`5`,`3` of C7H5NO3S (−0.334); b4 `–1` (+0.333, fallback) | 10 | 10 |
| 04_03_etheneBr | b2 `2` of Br2 (−0.333) | 1 | 1 |
| 04_03_ethene | b0 `2` of H2O (−0.333) | 1 | 1 |
| 04_03_map2 | b0, b1 `2` of Mg(OH)2 (−0.222) | 2 | 2 |
| 04_03_map3 | b0, b1 `8`,`18` of C8H18; b2, b4 `2` of O2 (−0.222) | 6 | 6 |
| 04_03_moleratio1 | b1 `2` of I2 | 1 | 1 |
| 04_03_moleratio2 | b0 `3`,`8` of C3H8; b1, b2 `2` of CO2 | 4 | 4 |
| 04_04_limiting | b2 `2` of H2, `2` of Cl2; b3 `2` of H2 (−0.333) | 3 | 3 |
| 04_05_combmap | b0, b1 `2` of CO2; b4, b5 `2` of H2O | 4 | 4 |
| 04_05_combustion | b1 CO2/H2O/O2 `2`×3; b2 H2O `2`, Mg(ClO4)2 `4`,`2`; b3 CO2 `2`; b4 O2 `2` | 8 | 8 |
| 04_05_map8 | b3, b4 `4` of BaSO4; b5, b6, b7 `4` of CaSO4 | 5 | 5 |

The expectation was re-implemented, not imported. Every clean non-overlapping exact occurrence is matched, longest token first. When a token has no exact occurrence, the design's anchored fallback applies, with a raw-needle count so a silent partial is visible.

Two tokens needed the fallback, both placed once with a raw-needle count of 1: sacch b4 and copperMoles b4, `(mol–1)` → `(mól–1)`.

Plain formula-like text drawn in layout blocks (element symbol followed by a plain digit): **0** in every transfer-on cell, **32** with transfer off.

## (6) Edge plants (sidecar copies; V5, PAD 2.0, F 7.5, decimal 0)

| plant | value(s) | rc | named | drawn (from the SVG) | verdict |
|---|---|---|---|---|---|
| P1 Unicode subscripts | sacch b0 `Mól af C₇H₅NO₃S (mól)`, b2 `Massi C₇H₅NO₃S (g)` | 0 | 6 × `absent` | `C₇H₅NO₃S` one plain `<text>`; no glyph missing from Liberation Sans | as designed |
| P2 formula replaced by name | sacch b3 `Fjöldi sakkarínsameinda` | 0 | 3 × `absent`; overflow `sakkarínsameinda` 61.56 > 58.44 | flat | as designed |
| P3 repeated formula | sacch b2 `Massi C7H5NO3S og C7H5NO3S (g)` | 0 | [] | 6 styled `<text>` in b2 (13 in figure) | as designed |
| P4 double space | sacch b0 `Mól af  C7H5NO3S  (mól)`, b4 `Margfalda  með … Avogadros  (mól–1)` | 0 | [] | items **identical** to the committed single-space drawing (whole figure) | as designed (spaces collapse) |
| P5 glued anchored repeat | sacch b4 `(mól–1mól–1)` | 0 | **[]** | `(mól–1mól` plain + `–1` sup + `)` | **DEFECT: silent partial** |
| P6 shrink with scripts | sacch b0 `Mól af C7H5NO3S-sameindum (mól)` | 0 | overflow `C7H5NO3S-sameindum` 78.48 > 58.68 @7.5 | scripts 5.834 pt, frac −0.3333 × 7.5 | as designed; the only exercise of scaled scripts |
| P7 repeated 2-digit | map3 b0 `Massi C8H18 og C8H18` | 0 | [] | 4 styled in b0 (`8`,`18` ×2) | as designed |
| P8 tab / newline / NBSP | map3 b1 `Mól af\tC8H18\n`, b2 `Mól af O2` | 0 | [] | whole figure identical to committed (NBSP collapses to a space) | as designed |
| P9 Unicode in one of two | map3 b4 `Massi O₂ (O2)` | 0 | [] | `(O2)` subscripted; `O₂` plain | as designed |
| **P10 identity block edited** | HClsoln b1 `HCl(aq) + H2O(l) gefur H3O+(aq) + Cl–(aq)` | **1** | — | **no PNG, SVG or report**: `KeyError: 'CNX_Chem_04_02_HClsoln#1'` | **DEFECT: crash** |
| P10b same + planted census rows (b1, b3, b4) | + b3 `HCl(g) verður HCl(aq)`, b4 `HCl(g) gas` | 0 | [] | 11/11 stretches: italic `aq`×3, `l`, `g`×2; subs `2`, `3`; sups `+`, `–` at +0.444 | italic + charges correct once a census row exists |
| P11 editor-typed U+207B | sacch b4 `(mól⁻¹)` | 0 | `–1` `absent` | `(mól⁻¹)` plain; **embedded woff2 subset has no U+207B** | glyph gap not named (see defects) |

## Defects (evidence; most severe first)

1. **[in the 34, reachable now] REGRESSION vs E: a crash on an editor edit of an identity block.**
   - Evidence: `r2v-scripts/out/plants.json` P10. Traceback: `r2/tree/compose.py` line 372, `R2_CENSUS[f"{R2_BASENAME}#{BI}"]` (subscript, raises).
   - The c3b variant hook at line 338 of the same file reads `C3B_CENSUS.get(...)`, which returns None and falls back. E (repo `compose.py`) needs no census and lays such a block out; r2 V5 loses the whole figure. **Fix shape:** a census miss must dispatch to a fallback, never raise.
   - The census (`r2/census.json`, 176 rows) covers only blocks that were layout blocks at build time. So does any census keyed by block index.
   - Reachable through the review panel: identity blocks are `send:true` sidecar keys (c9 surprise 4 shows `Nota` doing exactly this).
   - It takes the whole figure down, not one label.
2. **[corpus; 0 of 176 in the 34] Inverted base/script on a real corpus shape, silent.**
   - Evidence: `out/corpus-inverted-base-probe.txt` (19 blocks), and `plant/inv/CNX_Chem_05_03_Systemqw/items.json`:
     - b8 `qout (varmi út)` draws `('q', 17.285 pt, y 111.2, italic)` and `('out', 11.0, y 108.06)` against source `q` 11 pt at 108.06 and `out` 7 pt at 106.06;
     - b10 `qin inn` is the same shape.
   - `unformatted = []` for both.
   - Cause: `c2_scripts.line_char_styles` takes as base the size carrying the most letters, and the subscript `out` (3 letters) outvotes `q` (1 letter).
   - Not present in the 34.
3. **[corpus; 0 of 176 in the 34; PRE-EXISTING in the composer, inherited by ②] `sz0 = b[0]['size']` sizes the whole translated label from a symbol run.** The same statement is at repo `compose.py:287` and `r2/tree/r2v5.py:71`, so the fix is composer-wide. ② multiplies it: script size = sz0 × ratio. Defect 2 combined with this gives Systemqw's 17 pt `q`. It happens in 47 corpus `send:true` blocks: first run 11 pt Greek STIX, or a 9 pt base letter over a 7 pt letter base (`out/corpus-sz0-vs-letter-base.txt`).
   - `plant/inv/CNX_Chem_06_01_Frequency`: b3 `ν1 = 4 sveiflur á sekúndu = 4 hertz` is drawn as ONE plain 11 pt `<text>`, against a 9 pt source body.
     - The subscript `1` and the italic `ν` are lost.
     - The only name is `ν1` `no-base`; the 22 % enlargement is named nowhere.
   - `plant/inv/CNX_Chem_11_04_rvosmosis`: b10 `Π lausnar` is drawn plain at 11 pt.
     - The source's 7 pt −3 pt subscript `solution` is lost.
     - Only `Π` is named (`no-base`).
4. **[reachable now by an editor edit on the 34; plant P5] Silent partial on a glued anchored repeat** (inherited from c2 Q5; r2 did not fix it). Evidence: P5 above. The ruling D-scripts requires misses to be named.
5. **[corpus; 0 in the 34] False `unformatted` entries on duplicate source tokens.**
   - Evidence: `out/aotype-duplicate-token-probe.json`, real census runs of `CNX_Chem_08_04_AOtype_img` (`send:true`, not yet bought).
   - For `3px og 3px` the fmt mask is `.^^.....^^`, both occurrences correct, yet `unformatted` lists `p` `absent` and `x` `absent`. `3py` is the same.
   - Control: with the token list deduplicated, `unformatted = []`.
   - Cause: `transfer` iterates a duplicated token; the first copy consumes every occurrence and the second copy falls to the anchored fallback with 0 untaken candidates.
6. **[in the 34; a limitation of the `overflow` contract, not a reader-visible drawing defect] `overflow` disagrees with the browser-shaped SVG near the budget.** The overruns are 0.92 and 0.83 pt into a 2 pt pad, with no container contact. fontTools unkerned widths give the same numbers as HarfBuzz, so the cause is cairo's 200-dpi per-glyph pixel hinting, not kerning.
   - Evidence: `out/check5hb.json`, `out/check5.json`. Unnamed HarfBuzz overflows at PAD 2.0, identical at F 7.0/7.5/8.0:
     - moleratio2 b3 `Efnajöfnustuðull`: HB 56.93 / cairo 55.80 / budget 56.01;
     - combmap b10 `Reynsluformúla`: HB 55.578 / cairo 54.72 / budget 54.75.
   - Named but fitting under HB at PAD 2.5/F 7.5: moleratio2 b3, HB 53.372 / cairo 55.08 / budget 55.01.
   - Max per-word |HB − cairo| is 1.391 pt (1.708 at 2.5/7.5).
   - "One width function" is therefore cairo's hinted advance, not the renderer's.
7. **[corpus; 0 in the 34; ruling-level] ⑨ per-run misses run-split decimals.**
   - Evidence: `out/corpus-r3-run-vs-line.txt`. Seven lines of `CNX_Chem_03_02_moles-6296` keep `.`: `32.1 g S`, `65.4 g Zn`, `28.1 g Si`, `12.0 g C`, `24.3 g`, `118.7 g Sn`, `63.5 g Cu`.
   - Per-line R3, c9's own unit, converts them.
   - This follows the ruling's "per run" literally, so it is a ruling-level hazard. It is 0 in the 34.
8. **[reachable now by an editor edit; composer-wide] Glyph coverage gap, named nowhere.**
   - Liberation Sans lacks U+2070 `⁰`, U+207A `⁺`, U+207B `⁻`, U+21CC `⇌` and U+21C4 `⇄`.
   - P11: editor-typed `mól⁻¹` composes rc 0, and the SVG's embedded subset has no U+207B. A reader's browser therefore draws it from an unknown fallback font, while cairo draws it via fontconfig.
   - This is composer-wide, not ②-specific.
9. **Unexercised branches** (not failures, but claims the corpus cannot support):
   - scaled scripts in a shrunk block: 0/52 in all 7 cells (P6 passes);
   - italic transfer: 0 italic tokens in the 34 (P10b passes, with a planted census row).
   - Whole-italic words are `no-base`: named, and drawn roman. There are 12 wholly-italic `send:true` corpus blocks (`cis`, `trans`, `dxy`…), and c2's split-no-base-by-content recommendation is not implemented.
10. **Nits.**
    - The style tuple is rounded to 4 dp, so scripts draw at 7.0002 pt (source 7.0) and frac −0.3333 (source −0.3336): ≤0.003 pt.
    - sandwich b6's STIX `=` (10 pt) and `+` are drawn as 9 pt Liberation Sans. That is the same in E's layout, and size-only runs are outside ②.
    - SVG bytes are not reproducible, because the woff2 payload differs between identical composes.

11. **Measurement instrument (the builder's).**
    - `r2/scripts/sentinels.py` `group_lines` takes `base = max(it['size'] for it in its)`. That is inert in the 34, where no layout item exceeds its base.
    - It has the same fragility as defect 3, applied to the checker: on the 19 inverted-base blocks, or any label with a larger symbol run, it would mis-assign every line's styles.
    - My instrument uses the most-letters size instead.
12. **The builder's stated limitation (c), closed.** The builder's ② placement check reused c2's clean-occurrence rule, so it was not independent. My check re-derives everything from `runs.json` and the SVG with separate code. It finds 0 per-character style mismatches on 176 blocks in 8 cells, and 5/5 planted corruptions fire.

**Decimal negatives, named.**
- GreenChem `H2, Raney Ni` is an identity block drawn run-exact in the 34 (runs `H`, `2`, `, Raney Ni`). Its 16 kept `<text>` are byte-equal to E in the decimal-on cell (it is absent from the 35).
- The decimal rule runs inside `draw_run_exact`, so it is applied to identity blocks as well as `send:false` ones, as the ruling asks. My independent R3 enumeration included the 7 identity blocks and matched the drawn result.

## What I did not check

- No browser render. HarfBuzz via PIL raqm stands in for the browser shaper.
- No PNG crops.
- Not the geometry rulings (R-box, R-cell, D-open) beyond their overflow bookkeeping.
- Not the rank rule.
- The per-run decimal branch plants were run on real corpus runs through `r2dec.r3_run` directly, not through a compose. The compose wiring is shown by the 35.

## Repo state

My own sweep, covering what the brief's `find` excludes: `find …/figure-text-translation (pylibs included) …/books/efnafraedi-2e -newer r2v-scripts/START.marker` returns nothing. The positive control, the same predicate over `r2v-scripts/pyc`, lists 2 entries. `pgrep -x python3`, `headless_shell` and `chromium` are all empty at the end; no browser was started.


`git -C /home/siggi/dev/repos/namsbokasafn-efni status --porcelain` and the `find -newer critic.md` output are in the return value, verbatim, taken at the end.
