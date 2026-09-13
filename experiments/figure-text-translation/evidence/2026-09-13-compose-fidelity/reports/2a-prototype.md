# 2a: can English-kept blocks be drawn (near-)losslessly? Run-exact prototype, scratch only

Date: 2026-09-13. Cost: 0 ISK. Scope: the 34 bought figures (ch03 + ch04 + CNX_Chem_14_03_FishLemon).
Repo untouched: `git -C <repo> status --porcelain` was **empty** at the end. Everything lives under `scratchpad/proto/`.
This is evidence for a decision, not a shipped fix.

## 0. Answer

**Yes for English-kept blocks, measured in what readers see.**

- **The damaged kept blocks are fixed.**
  - Translated mode, cairo PNG, 1a's paired/gross rule: **21 of 191** kept blocks are damaged in the published composer. The prototype leaves **2 of 191**. Both are `H` labels in CNX_Chem_04_03_ethene_img, printed over by a *translated* line.
  - Browser, scored against PDF-true source ink: the current composer is worse than the prototype+ on **61 of 189** kept blocks. The reverse happens on **0 of 189**.
  - Every sub/superscript, italic, whitespace run and stacked-script block drawn in English now matches the source **within the instrument's resolution** (about 2 px vertical and 3 px along the baseline). Residuals of 1–2 px remain; see §6.4 (FishLemon `+`, 7 pt dashes).
- **Run-exact alone is not lossless in a browser. Three cheap additions close most of the gap:**
  1. **STIX substitution.** Symbol-font glyphs (`+ = ×`) drawn in Liberation sit about 2 px high. Fix: re-embed the PDF's own STIX subset. It is OFL, and 10 of 10 figures that carry one rebuilt cleanly.
  2. **Advance rounding.** Chromium rounds text advances to whole pixels. `text-rendering:geometricPrecision` removes that.
  3. **Kerning.** Chromium kerns by default, but 6 source runs were set without kerning. A per-run `font-kerning:none`, chosen from the data, fixes those.
- **The prototype does not touch translated blocks (176 of 367).** Their items are identical 34/34 and their scores identical 176/176.
  - **34 of the 52 sub/superscript blocks are translated.** They stay flattened, as do all overlaps from the translated layout path. CNX_Chem_03_02_sacch_img-3278 and CNX_Chem_04_03_etheneBr_img look exactly as published.
- **New reader-visible defect, not the composer's:** `artwork.svg` from `pdftocairo -svg` is **misregistered against the PDF** by up to 4 px horizontally at 200 dpi (1.4 pt).
  - The offset is ≥ 2 px on 11 of 33 figures. Any text drawn at PDF coordinates (current or prototype) is off by that much relative to the artwork.
  - The data fit a **page-size rounding** mechanism: the scale appears only on non-integer-point pages, and it is exactly `min(w/ceil w, h/ceil h)`. See §6.3.

## 1. What was built

Files are copies. Nothing under the repo was edited.

- `proto/compose.py` and `proto/svgout.py` are the modified copies. `proto/figtext.py`, `blockkey.py` and `_deps.py` are unmodified copies. `proto/orig/` holds an untouched copy of all five, used as the baseline.
  - The diff of `compose.py` is 79 changed lines. `readlayer` is not needed (figtext imports it lazily, only in `sendable`).

### Kept predicate (`proto/compose.py:220-261`)

`kept := CONTROL or key ∉ TR or value empty/whitespace or identity`.

- **Identity** (`proto/compose.py:251`): `' '.join(normalise_block_value(v, arc)).split() == (key if arc else ' '.join(en_lines)).split()`.
- **Why this comparison:**
  - It compares against what actually went on the wire. `emit-blocks.py:46` sends `joined` (the key for an arc, otherwise the lines joined by ONE space), and `translate-blocks.mjs:428` `.trim()`s the reply.
  - Token equality is exactly the equivalence the translated path already applies. `wrap()` reads a value only through `para.split()` (compose.py:252), so two values with equal tokens draw identically there.
  - **1a's `sc[k] == k` (value vs key-with-pipes) is only right for single-line blocks.** A multi-line identity comes back as `Moles of C7H5NO3S (mol)`, not `Moles of|C7H5NO3S|(mol)`. All 7 identity values in the 34 are single-line, so the counts agree here (7 = 7), but my predicate is the broader one.
- **Planted checks:**

  | Planted value | Predicate result |
  |---|---|
  | multi-line `' '.join(lines)` (sacch) | identity ✓ |
  | `X ` prefix | not identity ✓ |
  | whitespace-collapsed `HCl(aq) + H2O(l) H3O+(aq) + Cl–(aq)` | identity ✓ |
  | `HCl(g) HCl(aq).` (one extra char) | not identity ✓ |

### Run-exact draw (`proto/compose.py:66-90`)

- Each run is drawn at its own origin, size, rot and fill, as one `show_text` per run. The face (Regular / Bold / Italic / BoldItalic) comes from `meta.fonts[run.font].base`, using the same predicate as 1a's `runexact_png.face_of`. Font options are left at compose.py's defaults.
- `(cid:N)` tokens are removed per run with **no `.strip()`**, and a key goes to `undecodable` only if a token was actually removed.
- **fit-adv OFF, from a census.** Of 277 kept runs in translated mode, only 4 multi-char runs have |adv − Liberation advance| > 0.05 pt. One is the STIX `+ `; the largest Liberation one is `119.37` at −0.672 pt, which is the font's own `11` kern pair (see §6.2). So the PNG path equals 1a's *no-fit* ceiling exactly, and compose.py's own draw call is unchanged.

### SVG (`proto/svgout.py:16-22, 56-67, 78`)

- The face table is keyed by (bold, italic). `@font-face` rules are emitted only for faces actually used. A figure with no italic run emits the original two rules byte-for-byte (E3).
- **One `<text>` per run, not `<tspan>`s.** Each run needs its own x, y, size, weight, style and fill anyway, and an absolutely positioned tspan starts a new text chunk, so it buys nothing. It also keeps svgout's item model (one item = one element) unchanged.
  - Consequence: a label is no longer one string in the SVG. `test_figure_compose.py:717` regexes `<text>` contents; not run.
- `xml:space="preserve"` was already on every element (svgout.py:72). The prototype now depends on it for runs like `)          H`. Tested in §2.

### Report contract

- `blocks`, `missing`, `translated` and `degenerate` are identical to the current composer's lists on 34/34 figures in both modes (E6). `Counter(blocks) == Counter(blocks.json keys)` holds 34/34.
- Additive fields: `runExact`, `identity`, `runExactEnabled`. figure-compose.py:222 only requires the three lists.
- **Identity stays in `translated`, and it must.** figure-compose.py's assertion 2 (`Counter(missing) == Counter(send:false keys)`, figure-compose.py:253) would refuse the figure if an identity key moved into `missing`. The separate `identity` list is the signal a driver needs ("bought, got nothing back").
- **`undecodable` changes, and the change is a correction.** The current composer names **19 keys across 8 figures** in `--control` as having "carried a (cid:N) placeholder", while the 34 figures contain **0** cid runs. These are edge-space lines (`Stoichiometric |factor`, `Mass of |Mg(OH)2`, …) altered by `strip_undecodable`'s `.strip()` (figtext.py:221, reached via compose.py:173-177). The prototype reports 0. In translated mode both report 0 on these 34, because those blocks are translated there.
  - Positive control: a planted `(cid:127)(b)` run is named by both, and the token is absent from both SVGs.

## 2. Controls (all passed unless stated)

| # | Control | Result | Denominator |
|---|---|---|---|
| E1 | my baseline copy's control.png is byte-identical to 1a's `fid/<b>/orig/control.png` | 34 | 34 figures |
| E2 | baseline translated.svg `<text>` list equals the published `books/efnafraedi-2e/media/<b>_IS.svg` | 34 (450 elements) | 34 |
| E2b | Chromium render of published `_IS.svg` vs regenerated baseline | 0 px differ | 6 figures rendered |
| E3 | prototype with `PROTO_RUNEXACT=0`: PNG bytes and `<text>` lists identical to baseline, both modes | 34 | 34 |
| **E4** | **prototype --control control.png vs a fresh `runexact_png` no-fit, hint-default render** | **0 px differ, 34/34** | 34 |
| E4-ctrl | same instrument, baseline control.png vs that render | >0 px on 31/34 (smallest non-zero 888 px); 0 on 3 (brain-ec0b, exocytosis, rxn3), which contain only single-run, single-line blocks, so the current composer already draws them at their origins | 34 |
| E5 | translated mode: items of translated (non-kept) blocks, prototype vs `RUNEXACT=0` | identical 34/34 (258 items) | 34 |
| E5-ctrl | kept-block items differ between the two | differ 15/15 figures that have kept blocks (19 figures have none) | 15 |
| E6/E7 | report lists equal; artwork part of SVG identical | 34/34 both modes | 34 |
| P1 | planted BoldItalic run | 700-italic `@font-face` emitted and used | 1 |
| P2 | Chromium load wait 500 ms vs 1500 ms | byte-identical PNG | 1 |
| X1 | **xml:space positive control**: strip the attribute from prototype HClsoln SVG | glyph columns in the equation band change (`258-339` → `307-339`, the arrow-gap runs move); with the attribute, all 21 glyph-column runs in the band sit within ±3 px of the source raster (most within ±1 px) | 1 figure, 53 attrs |
| B-i/ii | browser same-rasterizer scoring: ours := browser src → 1.0; ours := browser art → 0 | 360/360 and 360/360 | 360 blocks, 33 figs |
| M-i'/ii' | mixed scoring: src text ink pasted onto browser art → iou1 (356 exactly 1.0, min 0.85); browser art → nB = 0 | 360/360 nB = 0 | 360 |
| R | regshift planted (3, −2) shift recovered | (3, −2) | 1 |
| V | rebuilt items with all "plus" extras off: `<text>` list equals the prototype's | 68/68 (34 figures × 2 modes) | 68 |

**Excluded:** CNX_Chem_03_01_exocytosis-88f6 from every browser measurement. Its 24 MB artwork.svg made Chromium's screenshot time out, twice. It has 0 damaged blocks in 1a and 2 kept blocks.

## 3. Step 1: control mode, cairo PNG (the tautology, stated as one)

- `proto control.png` **is** 1a's no-fit hint-default ceiling, pixel for pixel, on 34/34 (E4). All 4 per-block metrics also match `score_ceiling_nofit` on 367/367.
- 1a's paired rule ("worse than both faithful redraws") therefore flags **0/367 by construction**, versus **56/367 paired / 55 gross** for the current composer. That zero is not evidence; the evidence is E4 plus §4 and §5.

## 4. Step 2: translated mode with each sidecar, cairo PNG

| population | current (published) paired/gross | prototype paired/gross |
|---|---|---|
| kept (184 never-sent + 7 identity = 191) | **21 / 21** | **2 / 2** |
| translated (176) | scores identical, prototype vs current: 176/176 | (same) |

- **Fixed kept blocks (21 → 0, cairo):**
  - basehyd `Na+`, `O–`
  - rxn2 `CH4`, `2O2`, `CO2`, `2H2O`
  - HClsoln: all 6 (`HCl(aq) + H2O(l) … Cl–(aq)`, `HCl(g)          HCl(aq)`, `H3O+(aq)`, `H2O(l)` ×2, `Cl–(aq)`)
  - GreenChem `(CH3CO)2O`, `H2, Raney Ni`
  - combustion `O2`
  - FishLemon `CH3COOH`, `CH3COO–`, `NH2CH2CH2CH2CH2NH2`, `NH3|+CH2CH2CH2CH2NH2`
  - Example: HClsoln `HCl(g)          HCl(aq)` run_iou1_min 0.00 → 0.81.
- **Remaining 2:** CNX_Chem_04_03_ethene_img blocks 5 and 7 (`H`). They score 0.95 in control mode and 0.51 / 0.56 in translated mode, because the *translated* line `required to react with H2O…` (compose path, re-wrapped) lands on them. The collision persists and is not in the kept path.
- Kept-block scores in translated mode equal their control-mode scores on 189/191. The 2 exceptions are those `H`s.

## 5. The browser bridge: the non-tautological measurement

Three variants were rendered in Chromium, via the `<img>` host page of render-check.mjs, at artwork.png's pixel size:

- **current**: what is published today;
- **proto**: run-exact kept blocks;
- **plus**: proto, plus the three residual fixes in §6.1 and §6.2 (`proto/plusvariant.py`).

They were scored with 1a's `fidelity.py` two ways.

**(a) Same rasterizer** (`bscore.py`): src := Chromium render of `pdftocairo -svg <source.pdf>`. It inherits artwork.svg's misregistration (§6.3), which is why 'C', 'H' and similar blocks there show about 4.5 px along-baseline "error" in every variant.

**(b) Mixed, PDF-true** (`bscore_mixed.py`), used for all verdicts below. Source ink comes from the pdftocairo pair (src.png and artwork.png). Our ink comes from the browser pair (render and Chromium render of artwork.svg). Registration is therefore judged against PDF coordinates.

Pairwise rule: 1a's thresholds (Δrun_iou1_min ≥ 0.17 or Δrun_cno_max ≥ 1.5 px).

| comparison, control mode, 360 blocks / 33 figs | count |
|---|---|
| current worse than proto | 55 |
| proto worse than current | 1 (sandwich `1 sandwich = 2 slices…`: STIX `=`, §6.1) |
| current worse than plus | 158 |
| **plus worse than current** | **0** |
| plus worse than proto | 1 (HClsoln `Cl–(aq)`: its 7 pt `–` drops 1 px under geometricPrecision; thin stroke at L<128, at the instrument's 1 px limit) |
| 1a's 55 gross (cairo) blocks, current worse than plus in the browser | 55/55 |
| script blocks (52), current worse than plus / proto | 52 / 52 |
| **translated mode, kept blocks (189): current worse than plus / plus worse than current** | **61 / 0** |

Absolute, control mode, vs PDF-true source ink (median / p5):

| group | metric | current | proto | plus |
|---|---|---|---|---|
| plain (258) | iou1 | 0.81 / 0.63 | 0.81 / 0.63 | **0.90 / 0.77** |
| plain | run_cal_max px | 0.66 | 0.66 | **0.46** |
| script (52) | run_iou1_min | 0.20 / 0.00 | 0.75 / 0.56 | **0.84** / 0.53 |
| script | run_cno_max px | 6.35 (6 blocks 999) | 0.66 | 0.83 |
| italic (7) | run_iou1_min | 0.06 | 0.78 | **0.86** |
| symfont (45) | run_cno_max px | 2.00 | 2.00 | **0.20** |
| symfont | run_iou1_min | 0.38 | 0.38 | **0.88** |
| rotated (4) | iou1 | 0.79 | 0.79 | **0.96** |
| multispace (2) | run_iou1_min | 0.00 | 0.59 | 0.70 |

The three all-identity figures in translated mode (min run_iou1_min / worst run_cno_max):

| figure | current | plus |
|---|---|---|
| HClsoln | 0.00 / 999 | 0.47 / 1.00 |
| basehyd_img | 0.00 / 9.56 | 0.75 / 0.91 |
| GreenChem | 0.24 / 6.38 | 0.74 / 1.41 |

## 6. Step 4: residuals, with numbers

### 6.1 STIX symbol font (47 runs / 45 blocks, 10 figures; 42 blocks kept in translated mode)

- **Cause.** Liberation `=` is 14 px wide against STIX's 17 px, starts at the same origin, and sits about 3 px higher. Browser rows: `=` bars at 15-16 / 22-23 against source 18-19 / 24.
- **Effect.** The sandwich line reads `sandwich= 2` and `bread+ 1`, visibly worse than the current composer's accidentally even spacing. That is the 1 "proto worse" block.
- **Fix tested** (`proto/stixface.py`): each source PDF embeds its STIXGeneral subset as FontFile3 (bare CFF), inside a Form XObject for 4 figures and with a `/Differences` encoding in 1 (aspirin).
  - fontTools rebuilds it into an OTF (T2 charstrings redrawn, advances from the PDF `/Widths`, glyph cmap by AGL name), embedded as woff2 at 600-700 bytes.
  - Chromium loads it: the glyph geometry changes to the source's (`=` 141–157 vs source 142–157; rows 18–19 / 24–25).
- **Ablation** (`nogeo` = STIX + kern only): symfont run_cno_max median 2.00 → 0.28, run_iou1_min 0.38 → 0.87.
- ⚠️ This extracts font programs from OpenStax PDFs. STIX is SIL OFL 1.1, but that licence and provenance question is the lead's call, not measured here.

### 6.2 Browser text layout

- **Whole-pixel advance rounding (Chromium, headless Linux).** Glyph columns drift about 0.2 px per glyph: `1 sandwich` ends at 132 vs source 130 in both cairo-hinted and Chromium renders.
  - Adding `text{text-rendering:geometricPrecision}` makes the columns match the source column for column (`slices` 212–221 / 224–235 identical to pdftocairo).
  - Ablation (`nokern` = STIX + geo): plain iou1 median 0.807 → 0.898; run_cal_max median 0.663 → 0.455. That is essentially all of the plain-block gain.
  - ⚠️ This also applies to translated blocks (their items are unchanged, their glyph rendering is not). Firefox and Safari are not measured.
- **Kerning.** Of 394 multi-char Liberation runs, 29 contain kern pairs.
  - **19:** the position-derived adv equals hmtx + kern within 0.05 pt, so the source kerned them (`Average atomic`, `119.37`, `Avogadro’s`, `A atoms`).
  - **6:** adv equals hmtx without kerning (rxn2 `Coefficient` ×2, flowchart `of A` ×2, moleratio2 `Avogadro’s`, exocytosis `Vesicles`).
  - The rest are flowchart Tc/Tw runs.
  - Chromium kerns by default: `font-kerning:normal` is a no-op, measured identical on all 19. Setting `none` on the 6 raises their block iou1 (rxn2 `Coefficient` 0.895 → 0.933; moleratio2 0.914 → 0.966).
  - The cairo PNG path never kerns, so the PNG instrument is 0.3–0.7 pt off on those 19 runs by construction.
- **Rasterizer appearance.** Chromium text renders heavier, with LCD colour fringes, than poppler's glyph fills. That caps plain-block iou1 at a median of about 0.90 even with registration exact. It is not a composer issue.

### 6.3 artwork.svg is misregistered against the PDF (NEW; affects current and prototype alike)

- **Measured.** For CNX_Chem_04_03_etheneBr_img, the SVG's own path math puts the double bond at px 1147.8–1176.6.
  - Chromium draws it at 1148–1175.
  - pdftocairo `-png` **and pdftoppm (Splash, an independent rasterizer)** both draw it at 1151–1179.
  - The `H` text (runs.json coordinates) lands at 1215–1228 in both renderers.
  - So `pdftocairo -svg` output is about 3.3 px (1.2 pt) off the PDF here, and our correctly placed text is misregistered against the drawing by that much.
- **Across 33 figures** (`proto/regshift.py`: best integer shift of Chromium-rendered artwork.svg vs artwork.png, per horizontal third):
  - max |dx| = 0 px on 12 figures, 1 px on 10, 2 px on 8, 3 px on 1, 4 px on 2 (vitC_img, Example2_img, etheneBr_img);
  - |dy| ≥ 2 px on 0;
  - the sign pattern is +left / 0 middle / −right, which reads as a horizontal scale of about 0.99 about the page centre.
- **Mechanism: consistent with page-size rounding in `pdftocairo -svg`** (poppler source not read).
  - Every artwork.svg carries a content transform scale equal to `min(w/ceil(w), h/ceil(h))` of its page size, or 0.1× that where the figure's own CTM is 0.1: **24 of 24** figures with a non-integer page dimension (etheneBr 468×69.5 → 69.5/70 = 0.992857).
  - The svg header keeps the true width and height.
  - Measured horizontal misregistration:
    - ≥ 1 px on 22 of those 24;
    - 0 px on the other 2, whose predicted scale is ≥ 0.9993, i.e. < 0.5 px at the edges;
    - 0 px on **9 of 9** measured integer-point pages (exocytosis is the unmeasured tenth).
  - Predicted shift for "shrink to fit the rounded-up page and centre", at the etheneBr `H` (414 pt): −(1−0.992857)(414−234) = −1.29 pt = −3.6 px; measured −3.3 px. vitC right third: predicted −4.5 px, measured −4.
  - This makes it a prepare-time artwork fix: pad the page box to whole points before `-svg`, or undo the scale. It is not a text fix.
  - The PDF boxes themselves are consistent (MediaBox = TrimBox = BleedBox 468×69.5; ArtBox smaller).
- Readers see it today (`C═C` touching its bond in the etheneBr crops). A text-side fix cannot remove it; only an artwork-side fix can.

### 6.4 Smaller residuals

| residual | exposure | number |
|---|---|---|
| strip-text recoloured arrowheads (1a §4.1, 1d row 7) contaminate source ink | combustion `O2`, `O2 and |other gases`, `H2O absorber…` | run_cal_max 26.4 px on `O2` in every variant, including 1a's ceiling |
| flowchart Tc/Tw spacing (runs.json has one origin per run) | 2 blocks (`Number|of|particles|of A/B`), translated in translated mode | run_cal_max 5.1–5.2 px |
| thin 7 pt dashes under geometricPrecision | HClsoln `Cl–(aq)`, `HCl(aq)+…` | 1 px vertical, run_iou1_min 0.78 → 0.47 at L<128 |
| FishLemon kerned-back `+` over `3` | 2 blocks | run_cno_max 1.5–1.7 px (plus) vs 999 current |
| collision with translated text | ethene_img `H` ×2 | translated-layout defect, persists |
| colour: text `#000000` vs poppler's (35,31,32) for 100% K (1d row 5) | 367/367 | invisible to the L<128 instrument; ≤ 35/255 |
| z-order | unchanged: every drawn item is still appended after the artwork | 1d found 0 hidden-text cases |
| a `(cid:N)` run keeps its origin, so the glyphs after a removed token move left by that glyph's width | 0 runs in the 34 | planted 1 |
| arcs | 0/367 in the 34 | run-exact for arc blocks is **unmeasured** |

## 7. Step 3: what the renders show

Renders are Chromium `<img>` at 2.78 px/pt, the same scale as the 200 dpi source raster. Stacks (source / published / proto / proto+) are at `proto/renders/<b>__stack.png`. Single renders are `<b>__published.png`, `__proto_tr.png` and `__plus_tr.png`.

- **CNX_Chem_04_02_HClsoln** (all 9 blocks English):
  - **Now right:**
    - italic `aq`, `g`, `l`;
    - H₂O subscripts and H₃O⁺ / Cl⁻ superscripts;
    - both 10-space arrow gaps: `HCl(g) → HCl(aq)` no longer runs through the arrow;
    - `H2O(l)` on the left is no longer clipped at x = −0.54;
    - `H3O+(aq)` no longer runs off the right edge.
  - **Still wrong:** proto draws its `+` in Liberation (slightly higher; fixed in plus). The text is heavier than the source glyphs.
- **CNX_Chem_14_03_FishLemon:**
  - **Now right:** the formula row matches the source (CH₃COOH, NH₂CH₂…NH₂, CH₃COO⁻, NH₃⁺CH₂…NH₂ with the `+` kerned over the `3`); the M3 two-line split is gone.
  - **Unchanged:** the translated name row (Ediksýra / Pútresín / Asetatjón / Pútreskínjón) is identical to published.
- **CNX_Chem_04_04_GreenChem:** `(CH₃CO)₂O` and `H₂, Raney Ni` regain their subscripts and the source's left anchoring (published had both shifted left and flat). Nothing visibly wrong remains at this scale.
- **CNX_Chem_04_01_basehyd_img:** `O⁻` and `Na⁺` superscripts restored. The `+` signs are STIX in plus and Liberation in proto; the difference is barely visible at this scale.
- **CNX_Chem_04_03_etheneBr_img** (1a's worst-ranked block): **no visible change**, because its damaged blocks are translated.
  - Still wrong: `með umframmagni af|Br2.` wrap with `Br2.` falling below the frame and a flat subscript; the centred `Fjöldi móla og massi` has lost its left alignment.
  - `C═C` sits slightly misregistered against its bonds (§6.3), in every variant.
- **CNX_Chem_03_02_sacch_img-3278** (1a's second-worst block): **identical to published in all variants**, because every block is translated. `C7H5NO3S` stays flat; `Massi C7H5NO3S (g)` and `Deilið með` still cross the arrows.
- **"Worst two" rule:** the top two rows of 1a §3.3 (worst block run_iou1_min). Both turned out to be translated-path figures, which makes them the boundary control.

## 8. Step 5: cost

| | text + `<style>` bytes (34 figs) | whole-SVG bytes | `<text>` elements | `@font-face` |
|---|---|---|---|---|
| published / current, translated mode | 363,800 | 65,284,303 | 450 | 40 |
| proto, translated mode | 379,591 (+15,791; +4.3% of the text part, +0.024% of total) | 65,300,094 | 535 | 41 (one Italic face, HClsoln: +10,613 bytes) |
| plus, translated mode | 386,788 (+22,988) | 65,307,291 | 535 | 50 (+9 STIX faces, 600-700 bytes each) |
| current / proto / plus, control mode | 369,068 / 395,792 / 404,442 | — | 491 / 661 / 661 | 40 / 41 / 51 |

- Per-figure delta for proto vs current in translated mode: median 0 bytes, max +10,613.
- **Compose time: no measurable change.** Sum over 34 figures: current 20.50 s vs proto 20.79 s in control mode; 21.65 s vs 21.11 s in translated mode. For scale, the byte-identical `RUNEXACT=0` copy ran 22.03 s in control mode, so the noise is larger than any effect. The median is about 0.61 s per figure, dominated by Python startup and font subsetting.
- Byte hashes are not comparable across runs: fontTools stamps `head.modified` (1d row 15). Sizes are compared, not hashes.

## 9. What this does not decide, and what it suggests

1. **Translated blocks remain the dominant damage.**
   - 34 of 52 script blocks are translated. The formula sits inside MT prose (`Massi C7H5NO3S (g)`), so the kept path cannot restore it.
   - The re-flow collisions (1d row 2: 46/176) are untouched.
2. **All-identity figures** (HClsoln, basehyd_img, GreenChem): run-exact makes the recompose faithful in structure but still not identical to the original (rasterizer weight, §6.3 misregistration, colour). Publishing *no* recomposed SVG when `translated == identity` remains the only lossless option. The new `identity` list is exactly the signal a driver would key that on.
3. **`identity` should stay inside `translated`** (figure-compose.py assertion 2). Adding it as its own list costs nothing.
4. **Downstream consumers not run:** `test_figure_compose.py` parses `<text>` contents (e.g. the FoodLabel `(cid:127)` case expects one empty `<text>`; run-exact skips empty runs). One element per run changes element counts and splits labels.
5. **Unmeasured:** Firefox and Safari (xml:space, geometricPrecision, font-kerning); arc blocks; the exocytosis figure; the cause of the pdftocairo -svg scale.

## 10. Files (all under scratchpad/)

- **Prototype:** `proto/compose.py`, `proto/svgout.py` (+ copies `figtext.py`, `blockkey.py`, `_deps.py`); baseline `proto/orig/`.
- **Residual experiments:** `proto/stixface.py`, `proto/plusvariant.py`, `proto/ablate.py`, `proto/regshift.py`.
- **Runners:** `proto/batch.sh`, `proto/verify.py`, `proto/score.py`, `proto/analyze2a.py`, `proto/bscore.py`, `proto/banalyze.py`, `proto/bscore_mixed.py`, `proto/manalyze.py`, `proto/bscore_ablate.py`, `proto/browser/{render-batch.mjs,mkjobs.py}`.
- **Composer outputs:** `proto/out/<b>/{orig,off,proto}-{control,tr}/`; plus SVGs in `proto/plus/<b>/`.
- **Browser renders:** `proto/brender/<b>/{cur,proto,plus,nogeo,nokern}_{ctl,tr}.png` and `published.png`. The Chromium source and artwork renders are in `proto/bfid/<b>/src.png` and `proto/bprep/<b>/artwork.png`.
- **Data:**
  - `proto/data/compose-batch.jsonl` (rc and seconds per run), `verify.jsonl` (E1–E7), `scores.jsonl` + `2a-blocks.jsonl` (cairo);
  - `bscores.jsonl` + `2a-browser-blocks.jsonl` (same-rasterizer), `bscores_mixed.jsonl` + `2a-mixed-blocks.jsonl` (PDF-true), `bscores_ablate.jsonl`;
  - `plus.jsonl`, `regshift.jsonl`.
- **Visuals:** `proto/renders/*__stack.png`, `CNX_Chem_04_04_GreenChem__crop_side.png`, `hcl_eqline_stack.png`, `sandwich_line_stack.png`, `sandwich_line_stack_stix.png`; also `proto/data/ethBr_H_stack.png`.
