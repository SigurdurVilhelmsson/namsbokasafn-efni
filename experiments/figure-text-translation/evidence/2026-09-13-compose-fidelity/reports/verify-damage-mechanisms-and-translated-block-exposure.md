# Verification: damage mechanisms and exposure of translated blocks

Adversarial re-measurement, 2026-09-13. It cost 0 ISK. No file under the repo was modified: `git status --porcelain` was empty before and after. I did not write to the shared `prep/` directories; all work is in `scratchpad/verify-dm/`.

## Verdicts at a glance

| id | verdict | one line |
|---|---|---|
| M0 | confirmed | HClsoln `--control` gives the same `<text>` elements as the published file (XML parse). So do basehyd and GreenChem. Positive control: vitC and FishLemon differ. |
| M1 | confirmed | The runs match (H 9pt y=21.23 · 2 7pt y=18.23 · + 7pt y=25.23; aq/g/l are TT1 = LiberationSans-Italic). The code path matches. 0 `<tspan>` in all 34 published SVGs. |
| M2 | confirmed | The 10 spaces sit inside ONE run (`')          H'`, adv 34.5 = 3.0+10×2.5+6.5). `para.split()` at compose.py:252. Chromium shows the collision. **Precision:** both observed instances are identity blocks. No kept-English (K) block has a multi-space. |
| M3 | confirmed | '3'→'+': adjacent −1.4 (fails), \|Δproj\| 6.0 > 0.45·7 = 3.15 (script fails), arc clause holds (hypot 6.5 < 11.2), and lines() splits at 6.0 ≥ 3.5. |
| M4 | partially-true | x=−0.540 and source x=0.0 hold. **Not reproduced: "clipped".** Cairo draws 0 ink pixels outside the page. Chromium shows 0 dark px in column 0, and the ink starts at 0.36pt (source 0.72pt). Only the advance box overhangs. |
| 1d-C1 | confirmed | My own instrumented compose, compared by XML parse: 450/450 `<text>`, artwork 34/34, 0 tspan. The unmodified repo compose.py gives the same on 2 figures. **Caveat:** compose/svgout/strip/figtext have not changed since 09-08 and publication was 09-12, so a match was expected. |
| 1d-C2 | confirmed | Third count: send:false 184, send:true 183 counted with repeats, 169 unique sidecar keys, 14 duplicate extras. Identity is 7 under exact equality AND under whitespace-normalised equality. |
| 1d-C3 | confirmed | 18/34 figures have `k`/`gs` inside BT. Combustion alone differs outside text: 1,939 px (their 1,750; different mask). Chromium render of the published file shows 7 blue-grey arrowheads. A variant keeping only `k` inside BT gives 0 px differing from the source in that region. Its 1,971 px differ from the current strip, a count taken inside the difference's bounding box with no text mask, so it also includes pixels next to text. |
| 1d-C4 | partially-true | The counts reproduce. **The severity framing does not.** The 8 worst collisions are blocks that wrap to MORE lines under the vertical-centre anchor. The fixed box width is still involved: a wider budget (BOXW=80) puts 7 of those 8 back on 2 lines, 4 of them at 0 px. **No single global BOXW helps:** 0 → 10 hits but 40 shrunk; 63 → 32; 80 → 44 hits and 66 fewer-line blocks. Details below. |
| 1d-C5 | confirmed | A third detector finds the same 52-block set by name as 2b (K14 I4 T34, 87 runs, 18 figures). 1d's 53rd is sandwich (size change only). 0 markup in 169 values; the control fires. |
| 1d-C6 | confirmed | Real published SVG with the 10 spaces restored at the source x: HCl(aq) ink starts at 92.9pt in both the source and Chromium. Without `preserve` it collapses to 70.2pt. Scope: Chromium inside `<img>`. |
| 1d-C7 | partially-true | **Mechanism reproduced; population counts NOT re-derived.** One label (`Efnajöfnustuðull`, 8.5pt), ink measurement, 4 scales: 50.95 / 56.24 / 59.39 / 59.49 pt at 1 / 1.33 / 2.78 / 4 px/pt, against cairo ink width 59.76. DSF 2 at 1.33 gives 56.24, unchanged. The 8/450 and 42/450 distributions, which are the claim's content, were not re-measured. |
| 1d-C8 | partially-true | **Re-measured WITH a positive control:** glyph coverage (0/3,115; U+21CC fires), Tr≠0 (0 of 172 Tr ops; a synthetic `7 Tr` fires), mixed weight or fill within a line (0/0; planted fill and weight fire), italic base 1/34. **Re-measured WITHOUT a control:** MediaBox/CropBox/Rotate (0/34, read only) and tab/NBSP in runs and values (0, substring test). **Not re-measured:** ExtGState transparency, source text hidden behind artwork, style differing across lines. Arcs: 0/367 from my own grouping. |
| 2b-C1-denominator | confirmed | Same as 1d-C2. |
| 2b-C2-only-subsup-at-risk | partially-true | Italic 0, bold uniform (26/26 drawn bold) and colour never mixed all hold. **The word "only" is false, although 2b's own §2 table measured the exception** (STIX row: 3 translated). The 3 sandwich T blocks keep STIX `+`/`=` in the value and draw them in Liberation. 1 T block has a size-only mix (sandwich `=` at 10pt), which a baseline-shift detector cannot see. flowchart T blocks lose Tc/Tw spacing (1d row 14). |
| 2b-C3-transfer-feasible | confirmed | My own regex matcher: 34 blocks / 38 tokens / 52 stretches, 36 exact + 2 anchored (`l–1`, 1 candidate each), 52 placed. I read all 34 rendered results and every placement is chemically right. That judgement is my reading; there is no oracle. |
| 2b-C4-source-keyed | confirmed | HClsoln `g` is in TT1 = LiberationSans-Italic. The `(g)` runs in glycine (`N (g)`) and sacch (`(g)`) are in LiberationSans (regular). |
| 2b-C5-claude-md-rule | partially-true | The planted edits behave as reported, and a duplicate anchor refuses (named). **Two gaps:** (a) an editor-added repeat of a source formula comes out as `C₈H₁₈ og C8H18` with `unformatted=[]`, a silent inconsistency; (b) nothing downstream reads any other field of compose-report.json. I checked this by grep: figure-compose.py:221 shape-checks only `blocks`/`missing`/`translated`, and :242/:253 count `blocks` and `missing`. `degenerate` and `undecodable` have 0 readers in figure-compose.py (one docstring mention only) and 0 in tools/figure-run.js. A new `unformatted` field would therefore be a detector with no consumer until it is wired in. |
| 2b-C6-gaps | confirmed | Source multi-space in 0/162 T. Wire double-spaces in 19/162, all 19 from a line ending in a space (emit-blocks.py:46); 0 of those 19 values keep one. The 2 identity gaps survive the MT and are collapsed by compose. |

## 1d-C4 in detail: what causes the collisions of translated text with artwork

**Instrument.** This is different from 1d's glyph-box proportions. I rendered the composer's own drawn items per block with cairo, as an A8 ink mask. I then counted ink pixels over dark artwork (L<128 in `artwork.png`), taking each block from my instrumented translated run and from its control run.

**What reproduces:**
- **Ink-hit count.** T blocks with ≥10 px of real glyph ink on dark artwork: **32/176 blocks, 13/34 figures**. 1d: 34 blocks, 13 figures (glyph boxes, ≥30 px). 32 blocks are common to both.
  - 1d's 2 extra blocks are combmap `Stoichiometric|factor` ×2. In those, the text abuts the box border with 0 ink overlap. That is a box-metric artefact; it is still a crowding defect, just not "ink under text".
- **Union.** Ink ≥10, shrunk, or new ink off the page: mine **43 blocks / 22 figures**, 1d's 46 / 23.
- **Line count.** 66 of 176 blocks change line count: 48 fewer, 18 more. Of the 48 fewer, 46 have BOXW binding (63 > English width + 1) and 2 are rotated (maxw = 999).
- **Shrunk:** 15.
- **K/I control on this instrument.** The only K/I blocks with ink on artwork are the 2 HClsoln M2 blocks (74 and 63 px). That is the positive control; K = 0.

**Two counterfactual composes** (copies with one line changed each; all 34 figures):

| variant | T blocks ≥10 px | ≥30 px | Σ relative ink px | shrunk | new off-page |
|---|---|---|---|---|---|
| as published | 32 | 21 | 3,384 | 15 | 4 |
| BOXW = 0 (budget = English width + 1) | 10 | 9 | 2,290 | **40** | 2 |
| top-anchor (first baseline at the source's first baseline) | 24 | 9 | **701** | 15 | **9** |
| BOXW = 80 (a wider box) | **44** | 32 | 2,928 | 1 | 5 (fewer-line blocks: **66**; more-line: 4) |

**The 8 worst collisions** (244–389 px of real ink; 872–1,337 in 1d's metric) are:
- `Multiply by molar|mass (g/mol)` in vitC and argon
- `Divide by molar|mass (g/mol)` ×4
- two blocks in Example2

All 8 are **2→3 or 3→4 line** blocks. Their budget was `max(widths)+1` (the English line), not 63.
- BOXW = 0 leaves all 8 unchanged.
- Top-anchoring takes all 8 to **0 px**.
- BOXW = 80 puts 7 of the 8 back on 2 lines; 4 go to 0 px and 3 keep 26–32 px. Example2's 3→4 block stays at 389.

So the most severe class is a budget that fits the ENGLISH line exactly, combined with the centre anchor.

Blocks that gain lines carry **77% of the absolute collision ink** (2,823 / 3,664 px). In 1d's own data the figure is 73% (9,683 / 13,210).

**Verdict details:**
- C4 names two mechanisms, BOXW and the vertical-centre anchor, and both are real.
  - BOXW = 63 causes most hits by COUNT: 22 of 32 disappear under BOXW = 0.
  - The wrap budget (63, or the English line width + 1, whichever is larger) together with the centre anchor causes most ink by SEVERITY.
- The claim in 1d's Details section, *"the dominant defect is labels growing wider than their boxes, not taller"*, is **refuted by severity**.
- **No single global value is a fix.** BOXW = 0 raises shrunk blocks from 15 to 40. BOXW = 80 raises hits to 44 and fewer-line blocks to 66. Top-anchor raises off-page blocks from 4 to 9. The budget has to be per-block (the label's real box or column), not a better constant.
- **The union needs one correction (N2):** 2 of 1d's 4 T overhangs (copperMoles, etheneBr) appear identically in the English control. They are the N1 flattening defect, not translation layout, so 1d's 46/176 union is about 44 once they are removed.
- Visual checks: `verify-dm/img/cmp1.png` (vitC collision removed by top-anchor; combmap border abutment; map8 BOXW overflow) and `cmp2.png`.

## NEW problems found

- **N1. The `--control` baseline is not source-faithful on formula lines: flattening defeats the wrap budget, so the ENGLISH itself re-wraps.** This is the wrap half of the mechanism 1d row 11 saw as shrinking on 2 K blocks. It extends that row; it does not contradict it.
  - **Mechanism.** compose.py:235/241 builds `maxw = max(BOXW, max(widths)+1)` from `widths` measured per run at each run's own size (a subscript at 7pt). `wrap()` and the shrink loop (:249–268) measure the FLATTENED line at the block size (9pt). A formula line wider than 62pt therefore goes over its own budget by the subscript's size difference.
  - **In `--control` mode, 5 of 176 T blocks' own English wraps to more lines:**
    - copperMoles and sacch `Multiply by|Avogadro’s|number (mol–1)`: 3→4
    - glycine `Moles of|C2H5O2N (mol)`: 2→3
    - etheneBr `with an excess of Br2.`: 1→2
    - ethene `required to react with H2O to produce 9.55 g of`: 1→2

    The K blocks, which have no spaces, shrink instead (FishLemon ×2 = 1d row 11).
  - **Consequences:**
    - The `--control` diagnostic is NOT a source-faithful baseline for formula lines. Its English lands on artwork in copperMoles (275 px) and sacch (254 px).
    - etheneBr's `Br2.` is pushed below the page bottom in BOTH control and published (24 ink px off the page in each). 1d's row-6 "T overhang" for etheneBr is therefore a flattening defect, not a translation defect.
    - Visual: `cmp2.png`, bottom row.
  - **What survives:** 1d's zero "kept English wrapped to more lines 0/191" is still true for K/I in translated mode.
- **N2. The page-overhang count is an advance-box count.** Of 1d's 5 overhangs:
  - H2O(l) has 0 ink off the page (see M4).
  - copperMoles (5 px) and etheneBr (24 px) overhang identically in the English control (N1).
  - Only empform `Empirical|formula` (210 px) and flowchart `Volume|of pure|substance|B` (215 px) put NEW ink off the page because of the translation.
  - Separately, HClsoln `H3O+(aq)` puts 26 ink px past the right edge in both modes. The source itself ends at 351.28 > 351.0.
- **N3. Anchoring is a trade-off.** See the table above. The largest defect class (more lines + centre anchor) is fixed by top-anchoring, but that pushes more labels off the page. A per-block choice is needed, not a global switch.
- **N4. Transfer prototype, silent partial.** If an editor repeats a source formula, only the first copy is formatted and `unformatted` stays empty. The inconsistency reaches the reader with a clean report.
- **N5. `(mól–1)`, a cross-check note.** Both of 2b's "modified" tokens depend on the anchored fallback `l–1`. It is unique in the committed values, but the rule refuses (and names the miss) as soon as a second `l–1` appears; checked with a probe.

## Instruments and artifacts (scratchpad/verify-dm/)

- `lib/compose.py`: my own instrumented copy. The diff against the repo file touches only diag capture; drawing is unchanged. `lib_cf/` has BOXW = 0, `lib_cf2/` has top-anchor and `lib_cf3/` has BOXW = 80, one line changed each (diffs shown in the session).
- `work/<b>/vdiag-{control,translated}.json`, `work/<b>/cf/`: per-block and per-item dumps.
- Scripts:
  - `xmlcmp.py`: XML-parse comparison against the published SVGs.
  - `denom.py`: denominators.
  - `flat.py`: third flattening detector, with set diffs against the 1d and 2b data.
  - `inkov*.py` / `inkan.py` / `inkrows.json`: glyph-ink-over-artwork instrument.
  - `gscensus.py`, `recolor.py`, `keepk.py`: strip-text graphics state.
  - `zeros.py`: C8 zeros and their controls.
  - `xfer.py`: independent transfer matcher.
  - `bw/`: browser widths.
  - `xs/`: xml:space test.
- Images: `img/HClsoln_leftcrops.png` (M1/M2/M4), `img/combustion_cmp.png` (C3), `img/cmp1.png`, `img/cmp2.png` (C4/N1).
