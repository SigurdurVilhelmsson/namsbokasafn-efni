# c3 — the geometry §C140 ③ T-reflow must be designed against (0 ISK, read-only)

**Date:** 2026-09-13. **Repo HEAD:** `63d392ad` (branch `docs/2026-09-13-e-handoff`, contains E).
**MT calls:** none. **Repo writes:** none (`git status --porcelain` empty; `find -newer` over
`experiments/figure-text-translation` + `books/efnafraedi-2e` empty, control fires on my own scripts dir;
no `.pyc` newer than the run in `pylibs`). Everything lives in `/home/siggi/dev/scratch-c140/c3/`.
Inputs: the 34 figures already prepared + composed with the E composer in `prep/figs/<b>/` (prep report:
0 failed figures, all inherited denominators re-measured).

**Population, stated once and used everywhere below:** the **176 LAYOUT-path drawn blocks** (= translated,
non-identity; with multiplicity — 14 twin keys, so rows are keyed on `(basename, block index)`, never on key),
in **31 figures** (basehyd, HClsoln, GreenChem have none). Arc path: 0 blocks (prep §7). Unit is **drawn block**
unless a line says otherwise.

---

## TL;DR

1. **Baseline reproduces the inherited numbers exactly — but the inherited instrument cannot see 14 of the 41
   blocks [USER] flagged.** Ink ≥10 px on dark artwork: **32/176 blocks, 13 figs**; ≥30 px: 21; Σ ink 3,664 px;
   shrunk 15; line count changed 66 (48 fewer / 18 more); new ink off page 4 blocks — all equal to
   verify-dm's figures. 1d glyph-box ≥30 px: **34/176, 13 figs**, same 32-block overlap and the same 2 extras
   (combmap `Stoichiometric|factor` ×2). Union (ink/off-page/shrunk) is **44/23 figs**; inherited 43/22. The one
   extra block is named in §1.3; the difference is consistent with E's run-exact control (not re-measured against the pre-E composer). Blindness is named in §1.4: table rules are L=142, above the
   L<128 threshold. Several blocks only touch a border (1.02 pt). Several defects are line breaks or anchor
   shifts with no collision.
2. **Containers:** **92 BOUNDED** (22 figs) / **84 OPEN** (25 figs).
   - 25 of the 92 are **table cells**. Their rules are light, so the dark-stroke region leaks and only the
     colour region closes.
   - **Raster and vector agree on 174 of 174 non-textured blocks:** 91 bounded, with bbox edges within 3 pt;
     83 open. This is after one named vector rule (R2, §2.1).
   - The 2 textured-ground blocks (brain photo, exocytosis gradient) are resolved by the vector.
   - Positive controls: every schematic box label and the `Subtotal|(amu)` cell come out BOUNDED.
   - Negative controls: argon's arrow label, rxn3, ethene and etheneBr prose come out OPEN.
3. **The budget error has a sign that depends on the container, so no constant can fix it (measured, per block).**
   - BOUNDED: `maxw` exceeds the width available from the anchor to the container edge on **59/92**.
     - Box inner widths are **42.5–229.8 pt** (median 61.5).
     - Available width from the anchor is **41.6–154.5 pt** (median 53.3).
     - BOXW 63 is too wide in every block of empform, flowchart, combmap, map8, sacch and Example2.
     - It is too wide in no block of map2, map3, map7, moleratio1 or moleratio2, whose boxes are 72–77 pt.
   - OPEN arrow labels are the opposite case. `maxw` (63–88.1 pt: BOXW or English width + 1) is **narrower**
     than the width available from their anchor (65.3–93.5 pt), so 9 of them gain a line.
   - **Measured on those 9 arrow labels: the centre anchor collides UP in 9 of 9. The arrow sits 2.25–2.5 pt
     above the source block. Top-anchoring would still collide DOWN in 6 of 9**, because these strip figures
     are 53–74 pt tall; the room below is 4.8–10.2 pt against the 11 pt needed. For those 6, only keeping the
     source line count avoids a collision.
4. **Source cues.**
   - **80 single-line blocks:** `FT.alignment` returns `center` by rule (`len(ls)<2`). That verdict is ambiguous
     by construction.
   - **96 multi-line blocks:** 57 left / 37 centre / 2 right. The 2 ambiguous ones (<0.5 pt) are combmap
     `Molar|mass` ×2, called `right` by 0.18 pt; both are ink hits. There are 0 exact ties.
   - **Premise check on [USER]'s schematic note:** the OpenStax source is itself constant-indent.
     - Multi-line in-box labels start **11.0–11.8 pt** from the box's left fill edge in 14 of the 15 figures
       that have them, whatever the box width (55.5–78.3 pt). The single-line in-box labels of moleratio1 sit
       at 11.2–11.5 pt too.
     - Right margins run 3.2–31.8 pt, so the labels are not centred.
     - combmap is the exception: 6.0–13.5 pt, near-centred.
     - "Centred in boxes" is therefore a request to depart from the source geometry. It is a [USER] choice,
       not a regression.
5. **[USER] flags:** 18 layout rows map to **41 blocks in 18 figures, 0 unmapped**.
   - Mechanism (per block; one block can carry several):
     - **WIDER only: 21**
     - **NARROWER only: 10**
     - **TABLE+WIDER: 3**
     - **SHRINK+WIDER: 3**
     - **ANCHOR+NARROWER: 3**
     - **ANCHOR only: 1**
   - Each mechanism was checked against the measured geometry: **49 of 50 agree**. The disagreement is named:
     vitC b0 has a 1.02 pt drawn margin against the 1.0 pt predicate threshold. [USER] sees it as overlap.
   - **17 instrument-positive blocks were NOT flagged by [USER]:**
     - 11 shrinks. 7 are a 0.25–0.5 pt shrink (`Efnajöfnustuðull` ×6 at 8.5 pt, `Hvarfefnamegin` at 8.75 pt):
       row 2 says "Layout and fonts are fine", row 33 "Fine". The other 4 are `Average atomic|mass` at
       7.75–8.25 pt, in rows whose text is about wording only.
     - 6 ink hits of 11–77 px.

---

## 1. STEP 1 — baseline on the current (E) composer output

### 1.1 Instruments (rebuilt — the originals are not on disk)

The instrument behind "~44/176" (verify-dm `inkov*.py`) and 1d's glyph-box `analyse.py` both lived in a tmpfs
scratchpad that no longer exists. The committed `instruments/1d/pixel.py` measures something else
(visible-source / control XOR). `1a/fidelity.py` is an IoU-vs-source scorer that carries the V3
cairo-state caveat. I rebuilt both instruments from their written definitions, in
`c3/scripts/baseline.py` (+ `c3lib.py`):

- **INK (verify-dm):**
  - Each block's own `items.json` items are re-drawn with compose.py's draw statements (`dev()`,
    `rotate(-rad)`, `move_to(dx·S,0)`, `show_text`, same family/weight/slant/size) onto an A8 surface padded
    120 px.
  - It counts ink px on dark artwork (PIL `L<128` of `artwork.png`) and ink outside the page rect.
  - It is run at alpha>0 and alpha≥128, because the definition does not say which. **alpha≥128 is the one that
    reproduces the inherited numbers** (at alpha>0: 34 hits ≥10, 29 ≥30, Σ 6,290).
- **GLYPHBOX (1d):** new ink = dark px inside the drawn glyph boxes and outside the source glyph boxes dilated by
  1 pt. A glyph box is the hmtx proportion of the run's advance, spaces excluded, spanning [−0.21, +0.73]·size.
  Rotation is rasterised, so the rotated flowchart labels are measured, not skipped.
- **SHRUNK:** drawn size < the block's first-run size. **LINES:** drawn lines vs `FT.lines`.
- **SOURCE CONTROL, per block:** the same instrument on the block's source runs drawn run-exact, which is
  compose.py's `--control` path since E.

Controls:

- **Draw control:** all items re-drawn with colour over `artwork.png` are **pixel-identical to prep's
  `translated.png` on 34 of 34** (0 px differ). My draw statements are compose's.
- **Recompose control:** my scratch compose, patched only to dump diagnostics after each block's draw loop, gives
  `items.json` == prep's on **34 of 34** and `translated.png` pixel-identical on **34 of 34**.
- **Width control:** natural width re-measured in a fresh process == compose's own `measure()` on **176 of 176**.
- **Planted overlap** (`c3/planted.json`):
  - argon b1 (clean, 0 px) shifted −15 pt onto the box's dark border: **52 px**; −20 pt: 88 px. −5 and −10 pt
    stay 0, which is correct because they are still inside the box.
  - flowchart b1, a **rotated** label at −57°, shifted −12 pt: **369 px**; −6 pt: 12 px.
  - The instrument fires on axis-aligned and rotated text alike.
- **Source English scores clean:** source-control ink ≥10 px on dark artwork is **0 of 367** blocks, and source
  ink off the page is **0 of 367**.
- **K/I control:** run-exact (kept + identity) drawn blocks with ink ≥10 px are **0 of 191**. Pre-E the only two
  were HClsoln's M2 identity blocks, at 74 px and 63 px (inherited). That drop is E's effect, now measured.

### 1.2 Numbers vs inherited (population 176 layout blocks)

| measure | inherited (verify-dm / 1d) | measured now | |
|---|---|---|---|
| ink ≥10 px on dark, blocks / figs | 32 / 13 | **32 / 13** | = |
| ink ≥30 px | 21 | **21** | = |
| Σ ink on dark (absolute) | 3,664 (inherited as "2,823 / 3,664") | **3,664** | = |
| new ink off page, blocks | 4 (copperMoles 5 px, empform 210, etheneBr 24, flowchart 215) | **4, same px** | = |
| shrunk | 15 | **15** (named §1.5) | = |
| line count changed (fewer / more) | 66 (48 / 18) | **66 (48 / 18)** | = |
| glyph-box new ink ≥30 px, blocks / figs | 34 / 13 (1d) | **34 / 13** | = |
| glyph-box ≥100 px | 23 (1d) | **19** | **≠ — my rebuild; cause not traced** |
| glyph-box ∩ ink | 32 common; 1d extras = combmap `Stoichiometric|factor` ×2 | **32 common; the same 2 extras** | = |
| union ink/off-page/shrunk, blocks / figs | 43 / 22 (verify) | **44 / 23** | see §1.3 |
| union glyph-box/overhang/shrunk | 46 / 23 (1d) | **46 / 23** | = |

### 1.3 The one union difference is E, not the instrument

The extra block is **etheneBr b2 `with an excess of Br2.`** (24 px off page).

- Verify-dm's "new off page" was relative to the **pre-E control**, which re-laid the English and overhung by the
  same 24 px (N1), so it did not count this block.
- **Since E, the control is run-exact and puts 0 px off the page.** So the overhang is now attributed to the
  translated layout, which re-derives the wrap budget from the flattened subscript line. ⚠️ This attribution is
  **consistent with** E's run-exact control; the pre-E composer was **not** re-run here — the pre-E side is
  verify-dm's N1 text, inherited.
- Removing the two N1 overhangs, copperMoles b4 and etheneBr b2, gives **43 / 22**, verify-dm's figure exactly.
  copperMoles b4 was already an ink hit, so dropping it changes nothing.

### 1.4 What the inherited instrument CANNOT see (named, with the reason)

**14 of 41 [USER]-flagged blocks score `clean` by ink/off-page/shrunk:**

| block(s) | why the instrument is blind | what does see it |
|---|---|---|
| alsulfatemass, aspirin, chloroform b3 `Subtotal|(amu)` | Table rules measure **L=142** (RGB 116,142,208), above the L<128 threshold. Planted control P3: shifting a header label ±20–35 pt across the rules gives 0 px. | spill outside the container: 296 / 284 / 313 px |
| flowchart b10, b11 `Number|of|particles|of A/B` | The text crosses the 3-px border (L=122) in the gap between `agna` and `af`, so almost no ink lands on it. | spill: 130 px each |
| vitC b0 `Mass of|vitamin C (g)` | Contact, not a crossing: the drawn right margin is 1.02 pt, against 7.25 pt in the source. | geometry margin only |
| combmap b0, b1, b4, b5 | Contact: drawn right margin 0.01 / 0.79 pt, against 12.25–13.5 pt in the source. | geometry margin only |
| sandwich b2, b5; ethene b0 | A line break with no collision (ethene b0 intrudes 0.75 pt into the neighbouring `H` **labels**, which are text, not artwork). | line count + free width |
| ethene b17 | Anchor shift only. | sibling-edge cue (§3) |

The added **container-spill** instrument counts ink px (alpha≥128) outside the label's own filled colour region,
dilated 1 px. It fires ≥10 px on **24 of 176** blocks, and **22 of those 24 are [USER]-flagged**. The 2 that
are not:

- potassium b2, 34 px: real, visible in `crops/…potassium…__b02.png`.
- exocytosis b4, 181 px: **spurious**, because the gradient fill is not a single colour.

Its source control: source ink outside its own region is 0 on 174 of 176 blocks. The 2 exceptions are the two
textured-ground blocks, brain b0 (128 px) and exocytosis b4 (130 px), and that is the instrument's named limit.

### 1.5 Per-block baseline verdicts

Every block's verdict is in `blocks.jsonl → baseline`. Verdict counts, per label, over 176:
- clean 132
- hit-artwork 32
- shrunk 15
- off-page 4

The 15 shrunk blocks: alsulfatemass/aspirin/chloroform/saltMass b2 (7.75 / 7.75 / 8.0 / 8.25 pt) · empform b8 8.75 ·
rxn2 b9 8.75 · flowchart b5 · map2 b6 · map3 b6 · moleratio1 b2 · moleratio2 b3 · map7 b6 · map8 b1 (all 8.5) ·
combmap b8 **6.75** · combmap b10 8.75.

---

## 2. STEP 2 — container census (`c3/scripts/containers.py`, `assemble.py`)

### 2.1 Method

- **Seed:** the source block's line boxes, from `figtext.merge_blocks(figtext.group(runs))` → `FT.lines`, with
  along = the runs' own `adv` and normal = [−0.21, +0.73]·size. They are rasterised in the block's rotation with
  `S = 200/72` and y flipped exactly as `compose.dev()` does.
- The text is already stripped from `artwork.png`, so seed pixels show the label's ground. Seed colour = the
  **mode** RGB of those pixels.
- **Colour region:** the 4-connected component of pixels within 24 (max channel) of the seed colour that holds
  the most seed pixels.
- **Classes:**
  - **BOUNDED** = does not touch the page edge and has area <25% of the page.
  - OPEN-edge = touches the page edge.
  - OPEN-large = enclosed but ≥25%. None occurred.
- **Dark region:** the same, with "L ≥ 128" as the connectivity rule (bounded by dark strokes only).
- **Extents, in pt, in the block's own rotation:** clearance from the source block frame outward to (a) the
  colour-region edge = the **container**, (b) dark artwork, (c) another block's source box, (d) dark-or-label,
  (e) the page edge. Each is the min over 7 samples along the normal and 11 along the baseline, so rounded
  corners and notches narrow it.
  - Derived fields per block: container width and height, source and drawn margins on all 4 sides, and
    **`avail_from_anchor`**.
  - `avail_from_anchor` is the width the value can occupy from the composer's anchor: right edge − anchor for
    `left`; 2·min(anchor−L, R−anchor) for `center`; anchor − left edge for `right`.
- **Vector cross-check (`artwork.pdf` via pdfplumber):**
  - Candidate 1: the smallest rect or curve whose bbox encloses the source bbox (+0.5 pt) and is <25% of the page.
  - Candidate 2: the smallest **line-cell** built from the nearest rule segments on all four sides. Candidates are
    `lines`, thin rects, and rect edges.
  - The smaller of the two wins.
- **R1 (textured):** if the seed's mode colour covers <50% of seed px, the raster region is not a container and the
  class comes from the vector.
- **R2 (page-edge cell):** a line-cell with a side within 0.25 pt of the page edge is OPEN. Its "rule" is the page
  background rect. This is the same definition as raster OPEN-edge. A table's own outer rule sits 0.5–0.9 pt in,
  so it is not caught.
  - ⚠️ **R2 was added after the first comparison.** Before it, 7 blocks disagreed (raster OPEN / vector
    LINE_CELL), all map2/3/7/8 and combmap arrow labels whose "cell" was page edge + arrow line.
  - My first R2 threshold, 1 pt, wrongly opened the aspirin table cells (top rule 0.5 pt below the page top).
  - **Both before-states are reported, not hidden.**

### 2.2 Distribution (176 layout blocks)

| final class | blocks | figures | notes |
|---|---|---|---|
| BOUNDED | **92** | 22 | 66 closed by dark strokes; **25 table cells** (colour-bounded, dark-open: alsulfatemass, aspirin, chloroform, glycinemass, saltMass × 5); brain b0 bounded by the vector rect (the translucent label box — the ⑩ outline) |
| OPEN | **84** | 25 | 83 OPEN-edge + exocytosis b4 (gradient ground, vector NONE) |

Raster × vector: (BOUNDED, BOUNDED) 91 with bbox |Δedge| ≤ 3 pt on all 91 · (OPEN, OPEN) 83 · textured 2.

**Controls:**

| control | expected | measured |
|---|---|---|
| map2 / map3 box labels (b0, b1, b2, b4) | BOUNDED | 8/8 BOUNDED, inner 76.8–77.0 pt, vector curve |
| map8 box labels b3–b7 | BOUNDED | 5/5, inner 56.8–57.3, vector curve bbox 58.5 wide (stroke centreline) |
| combmap b0–b10 | BOUNDED | 11/11, inner 58.5–58.8 |
| empform b0, b2, b3, b5, b6, b8 | BOUNDED | 6/6, inner 56.0–60.5 |
| flowchart boxes b6–b11, b15–b18 | BOUNDED | 10/10, inner 55.5–56.3 |
| alsulfatemass `Subtotal|(amu)` (b3) | BOUNDED table cell | BOUNDED; dark region OPEN; vector LINE_CELL [203.3, 84.8, 251.1, 114.0]; inner 47.0 × 28.0 pt |
| argon b2 `Multiply by molar|mass` (free label under an arrow) | OPEN | OPEN, free width between boxes 80.3 pt |
| rxn3 b0/b1, ethene b0/b17, etheneBr b0–b2 (free prose) | OPEN | 7/7 OPEN |

### 2.3 Container width vs source English widths vs current budget (per figure, BOUNDED)

`maxw = max(BOXW if unrotated else 999, max(widths)+1)`. "avail" = `avail_from_anchor`. "bad" = spill ≥10 px or
ink ≥10 px.

| figure | n | inner width | avail from anchor | src max line | maxw | maxw > avail | bad |
|---|---|---|---|---|---|---|---|
| alsulfatemass / aspirin / chloroform | 5 each | 42.5–201.5 | 41.6–74.2 | 34.9–67.7 | 63.0–68.7 | 3 each | 1 each |
| glycinemass | 5 | 42.8–229.8 | 42.1–154.5 | 34.9–147.6 | 63.0–148.6 | 1 | 0 |
| saltMass | 5 | 42.5–201.5 | 41.6–74.2 | 34.9–67.0 | 63.0–68.0 | 3 | 0 |
| argon / copperMoles / glycine / potassium / vitC | 2–3 | 69.3–78.3 | 58.0–67.3 | 42.1–61.9 | 63.0 | 1–2 | 0–1 |
| sacch | 3 | 62.4–62.9 | 51.4–51.9 | 44.3 | 63.0 | **3** | 1 |
| empform | 6 | 56.0–60.5 | 45.0–49.3 | 33.5–40.0 | 63.0 | **6** | 4 |
| Example2 | 3 | 63.5–71.0 | 52.5–59.8 | 32.0–52.6 | 63.0 | **3** | 2 |
| flowchart | 10 | 55.5–56.3 | 44.2–44.5 | 22.0–41.8 | 63.0 | **10** | 4 |
| combmap | 11 | 58.5–58.8 | 45.0–58.5 | 32.0–49.0 | 63.0 | **11** | 3 (+4 contact) |
| map8 | 5 | 56.8–57.3 | 45.5–45.8 | 33.8–37.1 | 63.0 | **5** | 4 |
| map2 / map3 / map7 | 4 each | 76.8–77.0 | 65.5–74.7 | 34.6–61.9 | 63.0 | **0** | 0 |
| moleratio1 / moleratio2 | 2 / 3 | 72.3–77.2 | 65.5–77.0 | 43.6–58.0 | 63.0 | **0** | 0 |

Totals:
- **BOUNDED:** maxw > avail_from_anchor on **59/92**, 22 of them bad. maxw > the whole inner width on 49/92.
  Budget source is BOXW on 81 blocks and English+1 on 11.
- **OPEN:** maxw > avail_from_anchor on 26/84, 7 bad. Budget source is BOXW 58, English+1 22, rotated-999 4.
  Free width 31.0–467.9 pt, median 82.9.

**The single-word floor.** Is the longest translated word at `sz0` wider than `avail_from_anchor`?
- **BOUNDED, 7 of 92:** alsulfatemass/aspirin b2 `Meðalatómamassi` 77.4 vs 74.2 · chloroform b2 `Meðalsætismassi`
  74.5 vs 74.2 · brain b0 `Taugafrumur` 55.1 vs 54.0 · empform b8 `Reynsluformúla` 63.4 vs 45.0 · combmap b8
  `Prósentusamsetning` 83.2 vs 52.5 · combmap b10 `Reynsluformúla` 63.4 vs 48.0.
- **OPEN, 8 of 84:** flowchart b13/b14 `Mólstyrkur` 42.1 vs 37.5/38.0 · moleratio2 b3 `Efnajöfnustuðull` 65.2 vs
  58.4 · combmap b11/b13 `Mólmassi` 29.5 vs 24.1 · combmap b12/b14 `Efnajöfnustuðull` 49.7 vs 49.2 · exocytosis b2
  `Taugungur` 43.6 vs 36.0.
- These blocks cannot fit at `sz0` by any wrap. They need shrink, overhang, or a different anchor.
- **Of the 15 shrunk blocks, 8 would fit their word at `sz0` inside their own container or free space.** Their shrink
  is caused only by `maxw` being below the available width: saltMass b2, rxn2 b9, flowchart b5, map2 b6, map3 b6,
  moleratio1 b2, map7 b6, map8 b1.

### 2.4 Vertical room for the 18 blocks that GAINED lines (lead = 1.222·sz0 = 11.0 pt)

**9 of 9 OPEN arrow labels that gained a line collide UP under the centre anchor.** The arrow is 2.25–2.5 pt
above the source top, and each extra line needs 5.5 pt on each side. Under a top anchor the down room is:

| block | down room vs 11 pt needed | top anchor |
|---|---|---|
| copperMoles b1 | 15.8 | fits |
| sacch b1 | 20.2 | fits |
| Example2 b3 | 17.8 | fits |
| argon b2 | 5.5 (page) | collides |
| copperMoles b4 | 4.8 | collides |
| glycine b1 | 7.8 | collides |
| potassium b1 | 5.8 | collides |
| vitC b1 | 10.2 | collides |
| Example2 b1 | 6.8 | collides |

**All 6 of those down-collisions end at the PAGE EDGE, not at artwork** (`clear_dark_or_labels.down.by = page`,
4.75–10.25 pt). That cross-checks the frozen evidence: verify-dm's counterfactual table (inherited) has top-anchor
raising new off-page blocks 4 → 9.

For the 6 that collide, no vertical anchor fits. Only holding the source line count does, and their
`avail_from_anchor` (68.3–93.5 pt) exceeds `maxw` (63–88.1 pt). Whether the value then fits in the source line
count is a counterfactual and was NOT composed here.

Other blocks that gained lines:
- ethene b0: 4.8 pt room each side (the `H` labels), 1→2 lines, although the value fits on one line in the free
  width (natural 217.1 vs avail 232.6).
- sandwich b5 (1→2), combustion b1 (2→3) and map7 b5 (1→2) would also fit one line in their free width.
- The BOUNDED blocks that gained a line: glycinemass b2 fits inside its cell under centre (10.2/9.5 pt room);
  glycine b0 and vitC b2 fit inside their boxes.

---

## 3. STEP 3 — source cues (every block in `blocks.jsonl → src, align, budget, natural_w_sz0_pt, longest_word`)

- **Line count:** 80 single-line, 96 multi-line.
- **How `FT.alignment` decides the single-line case:** `if len(ls)<2: return 'center'` (figtext.py). No geometry is
  consulted, so all **80** single-line verdicts are recorded `ambiguous=true` with that reason.
- **Multi-line verdicts:** 57 left, 37 centre, 2 right. A dict-order tie would pick `left`; there are **0 exact
  ties**. **Ambiguous (best-vs-second spread <0.5 pt): 2**, combmap b11 and b13 `Molar|mass`. Spreads there are
  left 0.39 / centre 0.21 / right 0.03, so they are called `right`. The stacked `Molar` over `mass` is really
  centred, and the 1-line `Mólmassi` is right-anchored into the left box's border (ink 30/32 px;
  `crops/…combmap…__b11.png`).
- **Sibling-edge cue.** This uses source geometry only: runs' `adv`, other blocks in the same figure, rotation
  within 3°, tolerance 0.5 pt. It asks whether the block's line left, centre or right edges coincide with another
  block's.
  - Over the 80 single-line blocks, as (L, C, R):
    - none 36
    - centre only 18 (table column cells, `Before reaction` over `6 H2 and 4 Cl2`)
    - **left only 13**
    - all three 8 (equal-width twins)
    - L+C 3
    - right only 2
  - The left-only 13: glycinemass b13 · etheneBr b1, b2 · ethene b0, b17 · map2 b2, b4 · map3 b2, b4 · sandwich
    b3, b4, b6 · map7 b2.
  - **These are left-flush columns the composer re-centres.** They include the in-box single lines of
    map2/map3/map7, which share the 11.2 pt indent of the 2-line label above them.
- **Source block bbox, widths (per-run-size and flattened at sz0), natural translated width at sz0, maxw and its
  source (BOXW / english+1 / rotated-999):** all per block in `blocks.jsonl`.
- **In-box indent (BOUNDED, dark-closed, left-aligned multi-line; 15 figures have such labels):** the left margin
  is 11.0–11.8 pt in 14 of them — argon, copperMoles, glycine, potassium, sacch, vitC, empform, Example2,
  flowchart, map2, map3, map7, map8 and moleratio2. Right margins vary 3.2–31.8 pt.
  - combmap: left 6.0–13.5, right 6.0–13.5, i.e. near-centred.
  - The single-line in-box labels of map2/map3/map7/moleratio1/moleratio2 also sit at a left margin of
    11.2–11.5 pt, with right margins 4.2–20.8.

---

### 3.1 N1 sub-class: the budget is below the source's OWN flattened line (a measurement defect, not a design choice)

`widths` (and so `maxw`) is measured per run at each run's own size (a subscript at 7 pt), while `wrap()` and
the shrink loop measure the flattened line at `sz0`. Layout blocks where `maxw < max(src.line_flat_widths_sz0_pt)`:
**5 of 176** — copperMoles b4 and sacch b4 `Multiply by|Avogadro’s|number (mol–1)` (flat 63.72 vs BOXW 63),
glycine b0 `Moles of|C2H5O2N (mol)` (64.44 vs 63), etheneBr b2 `with an excess of Br2.` (89.28 vs 89.2), ethene b0
`required to react with H2O to produce 9.55 g of` (188.64 vs 188.56). **Equal BY NAME to verify-dm's N1 list of 5**
(inherited). Three of the five are [USER]-flagged (rows 15, 23, 24). ▶ **Any counterfactual that derives a budget
from source widths must use the flattened widths, or it re-creates these 5.**

## 4. STEP 4 — [USER] layout flags → blocks → mechanism

- **Mapping.** Each row's text was read against `translated.png` / `source.png` and the 3-panel crops, then each
  mechanism was **tested against the measured geometry** (`c3/userflag-checks.json`).
- **The predicates:**

  | mechanism | predicate |
  |---|---|
  | WIDER | maxw > avail_from_anchor ∧ lines ≤ source lines ∧ min drawn L/R margin < 1 pt |
  | NARROWER | lines > source lines ∧ maxw < free/container width |
  | ANCHOR | alignment ambiguous |
  | SHRINK | drawn size < sz0 |
  | TABLE | colour-bounded ∧ dark-open |

- **Crops:** `c3/crops/<basename>__bNN.png` for all 176 blocks. Panels: SOURCE (top), TRANSLATED (middle),
  TRANSLATED + overlay (bottom). Overlay colours: blue = container, green = source frame, red = drawn line boxes.
- **Rows ignored as out of scope:** wording (⑪), missing sub/superscript (②), decimal comma (⑨), rows 9 and 11.

| row | block → drawn lines | mechanism (confidence) | container | geometry evidence | baseline | crop |
|---|---|---|---|---|---|---|
| 7 | alsulfatemass b3 `Subtotal|(amu)` → Samtals (amu) | TABLE + WIDER (certain) | BOUNDED/table | maxw 63.0 > avail 46.6; 2→1; drawn L/R −7.29/−6.91 (src 5.5/5.5) | clean, spill 296 | `crops/CNX_Chem_03_01_alsulfatemass_img__b03.png` |
| 8 | aspirin b3 (same key) | TABLE + WIDER (certain) | BOUNDED/table | avail 46.6; drawn −7.29/−6.91 | clean, spill 284 | `…aspirin__b03.png` |
| 10 | chloroform b3 (same key) | TABLE + WIDER (certain) | BOUNDED/table | avail 46.1; drawn −7.54/−6.91 | clean, spill 313 | `…chloroform__b03.png` |
| 14 | argon b2 `Multiply by molar|mass (g/mol)` → Margfaldaðu / með mólmassa / (g/mól) | NARROWER (certain) | OPEN | 2→3; maxw 69.76 < free 80.26; drawn up −3.25 (src 2.25) | hit 327 | `…argon_img-9025__b02.png` |
| 15 | copperMoles b1 `Divide by molar|mass (g/mol)` | NARROWER (certain) | OPEN | 2→3; 64.0 < 78.5; up −3.25 | hit 255 | `…copperMoles_img-a962__b01.png` |
| 15 | copperMoles b4 `Multiply by|Avogadro’s|number (mol–1)` | NARROWER (certain) | OPEN | 3→4; 63.0 < 78.8; up −3.25, down −0.75 | hit 331, off-page 5 | `…copperMoles_img-a962__b04.png` |
| 16 | glycine b1 `Divide by molar|mass (g/mol)` | NARROWER (certain) | OPEN | 2→3; 64.0 < 75.3; up −3.25 | hit 244 | `…glycine_img-7c96__b01.png` |
| 17 | potassium b1 `Divide by molar|mass (g/mol)` | NARROWER (certain) | OPEN | 2→3; 64.0 < 75.3; up −3.25 | hit 269 | `…potassium_img-f1d1__b01.png` |
| 18 | sacch b1 `Divide by molar|mass (g/mol)` | NARROWER (certain) | OPEN | 2→3; 64.0 < 76.0; up −3.0 | hit 272 | `…sacch_img-3278__b01.png` |
| 18 | sacch b2 `Mass of|C7H5NO3S|(g)` → Massi / C7H5NO3S (g) ("box 1") | WIDER (certain) | BOUNDED | maxw 63.0 > avail 51.9; 3→2; drawn R −8.91 (src 7.75) | hit 16, spill 163 | `…sacch_img-3278__b02.png` |
| 19 | vitC b1 `Multiply by molar|mass (g/mol)` | NARROWER (certain) | OPEN | 2→3; 69.76 < 81.0; up −3.24 | hit 388 | `…vitC_img-e537__b01.png` |
| 19 | vitC b0 `Mass of|vitamin C (g)` → Massi / C-vítamíns (g) ("box 2" = right box) | WIDER (certain) — **geometry check DISAGREES by threshold** | BOUNDED | maxw 63.0 > avail 58.3; 2→2; drawn R **+1.02** (src 7.25) — predicate wants < 1.0 | clean | `…vitC_img-e537__b00.png` |
| 20 | empform b2 `Mass of|A atoms`, b5 `Mass of|X atoms` → Massi A/X atóma | WIDER (certain) | BOUNDED | avail 45.0; 2→1; drawn R −15.5 (src 12.5/12.0) | hit 69/62, spill 232/237 | `…empform__b02.png`, `__b05.png` |
| 20 | empform b8 `Empirical|formula` → Reynsluformúla ("last box") | WIDER + SHRINK (certain) | BOUNDED | avail 45.0; 2→1; R −16.57; 8.75 pt, word 63.36 > maxw 63.0 | hit 17, off-page 210, shrunk | `…empform__b08.png` |
| 20 | empform b6 `A to X|mole ratio` → Mólhlutfall A á / móti X ("next to last box") | WIDER (certain) | BOUNDED | avail 49.3; 2→2; R −8.34 | hit 32, spill 98 | `…empform__b06.png` |
| 21 | Example2 b1 `Multiply by|mass percent as ratio|(g HCl/g solution)`, b3 `Multiply by|density (g/mL)` | NARROWER (certain) | OPEN | 3→4 (88.12 < 96.3) / 2→3 (63.0 < 68.0); up −3.0 | hit 389 / 348 | `…Example2_img__b01.png`, `__b03.png` |
| 21 | Example2 b0 `Mass of|solution (g)` (box 2), b2 `Mass of|HCl (g)` (box 3) | WIDER (certain) | BOUNDED | avail 52.5; 2→2 R −4.01 / 2→1 R −2.57 | hit 10 / 22, spill 42 / 50 | `…Example2_img__b00.png`, `__b02.png` |
| 23 | etheneBr b2 `with an excess of Br2.` → með umframmagni af / Br2. | NARROWER + ANCHOR (certain) | OPEN | 1→2; maxw 89.2 (English+1 from subscript-size widths, N1) < free 467.9; left-flush single line re-centred; down −2.25 | off-page 24 | `…etheneBr_img__b02.png` |
| 24 | ethene b17 `The number of moles and the mass of` → Fjöldi móla og massi ("first line indented") | ANCHOR (likely) | OPEN | single-line left-flush (shares left edge with b0) → `center` | clean | `…ethene_img__b17.png` |
| 24 | ethene b0 `required to react with H2O to produce 9.55 g of` ("second could be centered to avoid linebreak") | NARROWER + ANCHOR (certain) | OPEN | 1→2; maxw 188.56 < free 233.7; natural 217.1 fits; up/down −0.75 into the `H` labels | clean | `…ethene_img__b00.png` |
| 25 | flowchart b6, b9 `Volume|of pure|substance|B/A` → Rúmmál hreins / efnis B/A | WIDER (certain) | BOUNDED | avail 44.3; 4→2; R −16.9 | hit 26/31, spill 259/244; b6 off-page 215 | `…flowchart__b06.png`, `__b09.png` |
| 25 | flowchart b10, b11 `Number|of|particles|of A/B` → Fjöldi agna af / A/B | WIDER (certain) | BOUNDED | avail 44.5; 4→2; R −10.2 | clean, spill 130 each | `…flowchart__b10.png`, `__b11.png` |
| 29 | moleratio2 b3 `Stoichiometric |factor` → Efnajöfnustuðull | SHRINK + WIDER (certain) | OPEN | 8.5 pt; word 65.16 > maxw 63.0 > avail 58.4 (gap between arrow-end boxes); 2→1; R −1.05 | hit 21, shrunk | `…moleratio2_img__b03.png` |
| 31 | sandwich b2 `We can make:` → Við getum búið / til: | NARROWER + ANCHOR (certain) | OPEN | 1→2; BOXW 63 < natural 72.7; left-flush source; centre anchor halves the free width to 63.8 (free 117.1) | clean | `…sandwich__b02.png` |
| 31 | sandwich b5 `+ 6 slices bread left over` → + 6 brauðsneiðar / afgangs | NARROWER (certain) | OPEN | 1→2; English+1 100.36 < natural 103.3 ≤ avail 107.6 | clean | `…sandwich__b05.png` |
| 32 | combmap b8 `Percent|composition` → Prósentusamsetning ("tiny font") | SHRINK + WIDER (certain) | BOUNDED | 6.75 pt; word 83.16 > maxw 63 > avail 52.5; R −7.27 | hit 10, shrunk, spill 71 | `…combmap_img__b08.png` |
| 32 | combmap b9 `C to H|mole ratio`, b10 `Empirical|formula` | WIDER (certain) | BOUNDED | avail 49.3 / 48.0; R −8.7 / −13.56 (b10 also 8.75 pt) | hit 12/28, spill 99/207 | `…combmap_img__b09.png`, `__b10.png` |
| 32 | combmap b0, b1, b4, b5 `Mass/Moles of|CO2/H2O` → one line | WIDER (likely — "much overflow in boxes") | BOUNDED | avail 45.0–46.5; 2→1; drawn R 0.01 / 0.79 (src 12.5–13.5) | clean (contact) | `…combmap_img__b00.png` etc. |
| 34 | map8 b3–b6 `Mass/Moles of |BaSO4/CaSO4` → one line | WIDER (certain) | BOUNDED | avail 45.5–45.8; 2→1; R −10.3 to −11.4 | hit 20–101, spill 151–184 | `…map8_img__b03.png` … `__b06.png` |

**Unmapped rows:** none.

**Uncertain mappings, named:**
- Row 24's "first line indented": ethene b17 is **likely**, not certain. It could also mean b0's first line.
- Row 32's four contact blocks are **likely**. The alternative is that [USER] meant only b8, b9 and b10.

**General schematic note** ("text should be left aligned but centered in boxes but has constant indent"): measured
premise in §3. The source is constant-indent at 11.0–11.8 pt, so centring is a change away from the source.

**Instrument-positive blocks [USER] did not flag (17).** These are evidence about severity thresholds:
- **Shrinks nobody named (11):**
  - `Average atomic|mass` in alsulfatemass / aspirin / chloroform / saltMass (rows 7, 8, 10, 13), at 7.75 / 7.75
    / 8.0 / 8.25 pt. Those rows speak only about wording.
  - rxn2 b9 `Hvarfefnamegin` at 8.75 pt: row 2, **"Layout and fonts are fine"**.
  - `Efnajöfnustuðull` at 8.5 pt: flowchart b5 (row 25), map2 b6 (26), map3 b6 (27), moleratio1 b2 (28), map7 b6
    (33, **"Fine"**), map8 b1 (34).
- **Ink hits nobody named (6):**
  - potassium b2 `Massi K atóma` (38 px; row 17 mentions only "Additional line/overlap")
  - flowchart b13, b14 `Mólstyrkur` (77 / 56 px)
  - combmap b11, b13 `Mólmassi` (30 / 32 px; plausibly inside row 32's "much overflow")
  - exocytosis b2 `Taugungur` (11 px; row 11 "Not visible on page")

---

## 5. What the geometry says the design must be keyed on (measured facts, not a design)

1. **Budget = the container's available width from the anchor, not a constant and not the English width.**
   - On the BOUNDED population this one quantity predicts the WIDER class. It separates the figure families where
     BOXW 63 hurts (inner 55–63 pt) from those where it is harmless (72–77 pt).
   - On the 9 OPEN arrow labels that gained a line, the same quantity is **larger** than today's budget, by
     2.3–11.8 pt.
2. **The vertical anchor cannot rescue a strip figure.**
   - Arrow labels have 2.25–2.5 pt above them.
   - In 6 of 9 cases there is <11 pt below (4.8–10.2 pt, mostly to the page edge).
   - So a design that allows a line to be gained there has no collision-free placement.
   - The line count needs to be held, using the wider free width, before any anchor choice.
3. **Anchor needs a cue beyond `FT.alignment`.**
   - 80 of 176 blocks get `center` with no evidence.
   - 13 of them sit in a measurable left-flush column with a sibling.
   - 2 multi-line verdicts rest on 0.18 pt.
   - Container margins (source left vs right) and the sibling-edge cue are recorded per block.
4. **The table cell is a container the dark-stroke model misses.** 25 blocks, rules at L=142. Any container
   detector keyed on "dark" will call them open.
5. **Contact matters to [USER]**, at drawn margins of 0.01–1.02 pt against 7–13.5 pt in the source.
   Pixel-threshold instruments (≥10 px) score these clean. A clearance margin, e.g. keeping the source's own
   margin, is the measurable proxy.
6. **The single-word floor is real on 15 blocks** (§2.3), where even the correct container budget forces a
   shrink or overhang. Separately, 8 of today's 15 shrinks have a longest word that fits `avail_from_anchor` at sz0 (geometry only, not recomposed).

---

## Limits and misses (named)

- **Glyph-box ≥100 px is 19 here vs 23 in 1d.** It is my rebuild's difference; the cause was not traced. ≥30 px
  reproduces exactly.
- **Collisions with other TEXT are invisible to both inherited instruments,** which only see artwork. My label
  clearance is measured against other blocks' **source** boxes, not their drawn boxes. On that basis 6 drawn
  blocks intrude into a neighbour's source box: sacch b2, empform b2, b5, b6, ethene b0, flowchart b9.
- **Textured ground** (brain b0 photo, exocytosis b4 gradient): colour region and spill are not meaningful. The
  class comes from the vector (R1).
- **Clearance is the min over samples inside the source frame's extent.** A translated line wider than the source
  can meet obstacles outside those samples. The pixel ink/spill counts are the ground truth there.
- **Thresholds that were chosen, not measured:** colour TOL 24; bounded area <25% of page; ambiguity 0.5 pt;
  WIDER contact 1.0 pt. The one threshold-sensitive verdict is named (vitC b0).
- **`dark_region` connectivity is 4-connected on L≥128.** Antialiased 1-px gaps could leak in other corpora; on
  these 176 it agrees with the vector on every non-table BOUNDED block.

## Files (all under `/home/siggi/dev/scratch-c140/c3/`)

- `blocks.jsonl`: **176 rows**, one per layout block. Fields:
  - `basename`, `block`, `key`, `path`, `rot`
  - `container`: final / raster / dark / vector class, bboxes, inner, margins, clearances
  - `src`: lines, widths, starts, frame, bbox, sz0
  - `align`: verdict, ambiguous, margin, spreads, why, sibling_edges
  - `budget`: maxw, source, maxw − inner
  - `value`, `natural_w_sz0_pt`, `out` (lines, size, drawn widths, wrap at sz0)
  - `baseline` (verdicts + px counts + spill)
  - `geometry`: container and free space; source/drawn margins; `avail_from_anchor`
  - `drawn_frame`, `longest_word`
  - `user_flag`: row, mechanism, confidence, note, crop, evidence
- `baseline.jsonl` (367 rows, all paths, both alpha thresholds), `containers.jsonl`, `cues.json`, `words.json`,
  `userflags.json`, `userflag-checks.json`, `planted.json`, `run-check.json`, `baseline-drawcontrol.json`,
  `figtable.txt`.
- `work/<b>/diag.json`: compose's own per-layout-block locals (align, starts, widths, anchor, maxw, sz0 → sz,
  wrapped, natural width, lead, top).
- `crops/`: 176 PNGs.
- `scripts/`: `patch_diag.py`, `run.py`, `c3lib.py`, `baseline.py`, `planted.py`, `containers.py`, `cues.py`,
  `words.py`, `userflags.py`, `assemble.py`, `crops.py`.
- `tree/`: byte-identical copies of compose / figtext / blockkey / svgout / _deps / readlayer (cmp-checked), with
  compose patched.
- `pylibs-np/`: numpy + scipy, scratch-only.

## Repo state

`git -C /home/siggi/dev/repos/namsbokasafn-efni status --porcelain` → *(empty)*, checked at the end.
`find … -newer tree/compose.py` over `experiments/figure-text-translation` and `books/efnafraedi-2e` → nothing
(the same predicate lists my `scripts/` files, so it fires). `PYTHONPYCACHEPREFIX` was set on every Python run.
