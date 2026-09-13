# r2 — combined scratch prototype of §C140 ② T-scripts + ③ T-reflow (+ ⑨ toggle), built and measured

**Date:** 2026-09-13. **Cost:** 0 ISK (only `compose.py` copies were run; nothing that calls the MT).
**Repo:** read-only. Every Python run had `PYTHONDONTWRITEBYTECODE=1` (and `PYTHONPYCACHEPREFIX` into scratch
for the compose children). No npm/vitest/`test_*.py`. No Chromium was started (`pgrep -x` for python3 empty after
every step; no headless_shell/chromium process was ever launched by this run).
**Scratch:** `/home/siggi/dev/scratch-c140/r2/` (266 MB). Generated tables: `r2/tables.md`; machine-readable:
`r2/analysis.json`, `r2/sentinels-<tag>.json`, `r2/sentinel-b-c.json`, `r2/measure-<tag>.jsonl`, `r2/run-<tag>.json`.

Population everywhere unless stated: the **176 layout-path drawn blocks** of the 34 bought figures (unit: drawn
block, keyed `basename#block`, never on key) = **66 dark-closed boxes + 26 colour-bounded/dark-open "cells"
(25 ch03 mass-table cells + brain b0) + 84 OPEN**.

---

## Headline

1. **The combined prototype implements every ruling and passes every value sentinel on all 7 composed cells.**
   Text sentinel 176/176 (planted controls fire 3/3); kept run-exact items identical to V0 on 34/34 figures
   (decimal off, 8 runs); decimal on changes exactly the **35** ch03 kept runs, only `.`→`,`, same figures and
   values as c9; ② places **52/52** stretches, `unformatted` empty, drawn styled multiset correct on all 34 token
   blocks; the 21 figures with no token block are items-identical with transfer off; box centring 66/66 within
   0.5 pt; cell source alignment 26/26 (4 named minimal displacements at PAD 2.0).
2. **PROBLEM blocks 50 → 4 and unresolved [USER] mechanisms 49 → 4 (of 50) in every PAD × F cell with F ≤ 7.5**
   (F 8.0: 5). For comparison, inherited from c3b: its best variant V3 left 15 problem blocks / 17 unresolved.
   Hit-artwork 32 → 1, off-page 4 → 0, spill 24 → 2, contact 26 → 1–2, text-on-text 7 → 0, blocks with more lines
   than the source 18 → 0. **All 9 arrow labels (rows 14–19, 21), ethene b0 (row 24) and sandwich b2/b5 (row 31)
   now hold the source line count** — 5 arrow labels at 9.0 pt, 3 at 8.75, Example2 b3 at 8.0.
3. **The 4 residual problem blocks are the same in all 6 cells:** combmap b8 `Prósentusamsetning` (one word 64–72 pt
   in a 54.5 pt budget: overhangs the box, hit/spill/contact), empform b8 and moleratio2 b3 (SHRINK post-condition,
   single words), and exocytosis b4 (c3's known spurious gradient spill). **No layout rule can fix a single word
   wider than its box at the floor** — that is now a named `overflow` list, not a silent shrink.
4. **Recommendation: PAD 2.0, F 7.0** — the pre-registered rule (written before any V5 compose) selects it. It is a
   near-tie with the brief's PAD 2.0 / F 7.5: the two differ in **exactly 4 named blocks** (empform b8, flowchart
   b13, b14, combmap b8). PAD 2.5 fixes nothing extra and adds 2 sub-8.5 pt blocks and 1 more shrink. F 8.0 adds a
   contact verdict (empform b8, 0.63 pt) and a 5th unresolved mechanism. Details in §7. **The rule's F verdict is decided by
   its own ordering** (overflow ranked above size, and overflow can only fall as F falls), so the floor is really [USER]'s
   call on 4 named blocks. **Crops, contact sheets and SVGs are on the brief's cell (PAD 2.0, F 7.5, decimal on)** as
   instructed; the 4 F-sensitive crops carry an extra F 7.0 panel.
5. **Two results the totals above flatter.** combmap b8 (the [USER] "tiny font" block) gets *worse*: a larger word
   (7.0–8.0 pt, was 6.75) now overhangs its box on all three collision instruments in every cell (hit 10 → 21–29 px,
   spill 71 → 75–189 px), which is the floor ruling doing exactly what it says. Separately, no instrument scores a broken column edge: ethene b0 counts as ANCHOR-resolved only through c3b's special-case post-condition
   (`lines <= src_lines`), while it now starts 6.76 pt left of the column edge it shares with b17.

## Key numbers

| name | value | population | control |
|---|---|---|---|
| V0 control gate | items.json equal 34/34, translated.png pixel-identical 34/34, compose-report.json full-equal 34/34, diag.json byte-equal to c3b 34/34, **measure-V0.jsonl byte-identical to c3b's** (176 rows) | 34 figures / 176 blocks | re-checked after the measure.py figure-filter edit: still byte-identical |
| PROBLEM blocks (c3b extended verdict ∪ unresolved flag) | V0 50 → 4 in all 6 V5 cells | 176 blocks | same instrument, same definitions (analyse.py functions copied verbatim) |
| unresolved [USER] mechanisms | V0 49 → 4 (F 7.0, 7.5; both PADs) / 5 (F 8.0) | 50 checks on 41 blocks | c3b post-conditions unchanged |
| hit / off-page / spill / contact / text-coll | V0 32/4/24/26/7 → 1/0/2/1/0 (F 7.0, 7.5) and 1/0/2/2/0 (F 8.0) | 176 blocks | planted shift of a styled 3-line V5 box (sacch b2) by −15/−20 pt: ink 0→21→12 px, spill 0→83→124, left margin 9.33→−5.67→−10.67 pt |
| lines ≠ source | V0 66 (18 more / 48 fewer) → 18 (0 more / 18 fewer) | 176 blocks | drawn lines == min(source lines, words) on 176/176 in all 6 cells: the 18 are 16 one-word values + flowchart b15/b18 (3 words, 4 source lines) |
| overflow (named overhang at the floor) | 5 (2.0/7.0), 8 (2.0/7.5), 8 (2.0/8.0), 5 (2.5/7.0), 9 (2.5/7.5), 10 (2.5/8.0) | 176 blocks | all named in §5 |
| blocks below 8.5 pt, source ≥ 8.5 pt | V0 5 → 7 (PAD 2.0) / 9 (PAD 2.5); plus 4 combmap arrow labels whose source is 7.0 pt | 176 blocks | named in §5 |
| TEXT sentinel | 176/176 pass in all 7 V5 runs (and the 2 control runs) | 176 blocks | 3 plants on ethene b0 (delete a char, swap 2 item positions, duplicate an item): fires 3/3 |
| kept untouched (decimal off) | run-exact items == V0 on 34/34 in V0 + 6 sweep + transfer-off | 34 figures | planted text change on one saltMass kept item: detected (1 figure) |
| decimal on | exactly 35 kept items differ, only `text`, only `.`→`,`; by figure 7/7/7/9/5 == c9; value multiset == c9's 35; report multisets unchanged 34/34; layout items identical to the decimal-off run 34/34 | 34 figures | the 35 are also 35 `decimal` report entries |
| ② placement | 52/52 stretches, 34 token blocks, 13 figures (== c2's population by name); `unformatted` [] on 34 | 13 figures | transfer-off run: drawn-styled mismatch fires on 34/34 token blocks |
| ② does nothing without tokens | 21/21 token-free figures items-identical transfer on vs off; 0 non-token blocks differ; 0 token blocks identical | 176 blocks | the 13 token figures all differ |
| ② × ③ (styled vs flat width) | 1 of 34 token blocks changes layout: combustion b4 flat 2 L @8.5 (iii) vs styled 2 L @9.0 (i). map2 b0/b1 and glycine b0 hold the source 2 lines in both | 34 token blocks | c2 alone had map2 b0/b1 2→1 (inherited); the line-count preference neutralises it |
| rulings geometry | box lines centred on container 66/66 (≤0.5 pt); cells at source anchor 26/26, displaced 4 (PAD 2.0) / 7 (PAD 2.5), all inside [L+PAD, R−PAD] | 92 BOUNDED | planted +1 pt shift on map2 b0 (box) and alsulfatemass b13 (right cell): both fire |
| OPEN steps @2.0/7.0 | i 65 · ii 6 · iii-displaced 7 · iii-anchor 2 · iv-gain 0 · iv-overflow 4 | 84 OPEN | F 9.0 control run: iv-gain fires on sacch b1 and Example2 b3 (V3L pin, room 20.25/17.75 pt); glycine b1, potassium b1, map7 b5 fall back and are named in `openFallback` |
| healed-artwork SVGs | brain healed 1 raster / 4 sides (4,964,452 → 4,964,388 B); exocytosis healed 8 / 32 sides, noClip mask-0/-22/-53/-187 | 2 figures | equals c10's own heal report exactly; `<text>` identical to the unhealed SVG (3 and 7 elements) |

---

## 1. Tree and patches (step 1)

- `r2/tree` = `cp -a c3b/tree`; `cmp tree/compose.py c3b/tree/compose.py` → equal. figtext/blockkey/svgout/_deps/readlayer
  cmp-equal to c3b **and** to the repo. Repo `compose.py` sha256 == `c3b/verify/compose.repo.py` (c4fc0ff1…).
  `tree/c2_scripts.py` cmp-equal to `c2/proto/scripts.py`. Hashes: `r2/verify/tree-copy.sha256`.
- `r2/scripts/patch_r2.py` — 4 anchors, each asserted exactly once, plus placement assertions (dispatch after the c3b
  variant block and before the wrap; decimal inside `draw_run_exact`):
  - header: `R2_VARIANT` (V0|V5), `R2_DECIMAL` (0|1), `R2_PAD`/`R2_FLOOR` (**required** for V5, no silent default),
    `R2_TRANSFER` (1|0), `R2_CENSUS`, `R2_BASENAME`. r2 modules are imported only when a switch is on.
  - dispatch: `if R2_VARIANT == 'V5': r2v5.layout_block(...); continue` (after `_vinfo.update(...)`, so the c3b
    variants stay dead with `C3B_VARIANT` unset and V0 is untouched by construction).
  - `draw_run_exact`: after `removed = removed or gone`, R3 on the run text when `R2_DECIMAL` (drawn text only; the
    change is recorded in a `decimal` report list).
  - compose-report: `unformatted`, `overflow`, `openFallback`, `decimal`, `r2` keys added **only when a switch is on**
    (V0 report full-equal to prep's, 34/34).
- `r2/tree/r2v5.py` — the V5 layout (docstring states every rule). `r2/tree/r2dec.py` — R3 regexes verbatim from
  `c9/rules_eval.py` (checked by string presence; the `⠀` placeholder made explicit as `chr(0x2800)`).
- `r2/census.json` (`scripts/build_census.py`) — c3b's census **verbatim** (every field asserted equal) + r2 fields:
  `r2cls`, `cell_align(_why)`, `open_align_r2(_why)`, source margins inside the container, free-box clearances.

## 2. How each ruling was read (these readings change numbers; stated before the sweep)

| ruling | implementation | named consequence |
|---|---|---|
| **R-box** | r2cls `box` = BOUNDED ∧ dark region BOUNDED ∧ not textured (**66**). Every line centred on (L+R)/2; budget = inner − 2·PAD; vertical = c3b V1's glyph-box centre on the container centre. | 8 schematic labels move 5.6–10.3 pt (inherited c3b; the ruled change) |
| **R-cell** | r2cls `cell` = BOUNDED ∧ dark-open (**26** = 25 mass-table cells + **brain b0**, which matches the parenthetical class "colour-bounded but dark-open" — a classification choice, named). Alignment: multi-line → FT verdict (ambiguous → centre; 0 ambiguous); **single-line → source margins inside the cell, far/tight ≥ 20 → flush to the tight side, else centre**. The sibling cue is *not* used: glycinemass b13 carries a left sibling cue (coincident with `1`, `2`, `5`) while its source is visibly right-flush (ml 78.75 / mr 2.5 pt; `r2/logs/src_*.png`). Result: 5 right-flush (alsulfatemass/aspirin/chloroform b13 ratio 52.6, glycinemass b13 31.5, saltMass b10 27.1), 21 centre (all others ≤ 3.97). Budget = inner − 2·PAD; anchor = the source anchor; horizontal clamp into [L+PAD, R−PAD]; vertical clamp into [D+min(PAD, src down margin), U−min(PAD, src up margin)] so an unchanged layout never moves. | displaced @PAD 2.0: alsulfatemass b2 −1.42, aspirin b2 −1.43, chloroform b2 −0.17, saltMass b2 −1.07 pt (`Meðalatóma/sætismassi` fills the budget). @PAD 2.5 also the 3 right-flush b13 cells −0.15 pt; saltMass b2 −1.57, chloroform b2 −0.67, alsulfatemass/aspirin b2 −1.02/−1.03. 0 vertical displacements. |
| **D-lines** | min-max partition over all line counts; choose closest to source (tie → fewer) among those that fit; shrink 0.25 pt only when none fits (boxes and cells). | box/cell lines == min(source lines, words) on 92/92 |
| **D-open** | alignment: multi → FT verdict (ambiguous → centre); single → **flush first** (tight free-box side ≤ 4.75 pt ∧ far/tight ≥ 20 → tight side), then sibling cue left-only/right-only, else centre. Flush fires on 9 (etheneBr b1, b2; sandwich b0, b2 left; **sandwich b5 right** (tight 4.75, ratio 39.7); exocytosis b0, b1 left, **b2 right**; sandwich b6 left); **0 flush/cue conflicts** (asserted). n_t = min(source lines, words). (i) n_t at sz0 within c3b V3's from-anchor budget (left: FR−anchor−PAD; right: anchor−FL−PAD; centre: 2·(min(anchor−FL, FR−anchor)−PAD)); (ii) n_t at sz0 within (FR−FL)−2·PAD with the smallest clamp of the block extent into [FL+PAD, FR−PAD]; (iii) each 0.25 pt step down to floor_eff, retrying (i) then (ii); (iv) for n = n_t+1…: only while room on the roomier side − (n − n_src)·lead ≥ PAD (lead = 1.222·sz0; ties grow down, c3b V3L), sizes sz0→floor_eff with (i)/(ii), V3L edge pin; else n_t at floor_eff with the clamp, named in `overflow` (widest word > (FR−FL)−2·PAD) or `openFallback`. | (iv)-gain is never reached in the 6 sweep cells; exercised only by the F 9.0 control. The "≥ PAD" reading differs from "≥ 0" only for map7 b5 in that control (0.75 pt left), not in the sweep. |
| **D-floor** | floor_eff = **min(F, sz0)** — never enlarge text. A box/cell with no fit at floor_eff is partitioned with budget′ = max(budget, widest word) and named in `overflow` {key, block, word, need_pt, budget_pt, size, cls}. | combmap b11–b14 have sz0 7.0 < every F: they cannot shrink and overflow the free box by 0.27 pt (b12, b14) / into the pad (b11, b13). flowchart b4 has sz0 9.0001 (steps land 0.0001 above F). |
| **D-scripts** | c2's `source_tokens`/`transfer` (all_occurrences=True)/`words`/`segments`/`split_at_word_edges` unchanged; **one width function** `lw()` = Σ stretch advances over the *drawn* segmentation, used by partition, shrink, anchor, clamp and overflow check; one ITEMS entry per segment (size sz·ratio, baseline + sz·frac, italic from the style). Arcs: 0 in the 34 (the layout path never sees one). | styled chars are carried per word, so the partition never splits a formula |
| **D-decimal** | per kept run, R3 (tuple guard → thousands groups → digit-flanked `.`; bare `\d+\.` run → `,`; leading point left). Applied to every kept block (identity included; 0 numeric identity blocks in the 34). The fragment test uses the RUN text (c9 used the block key; identical for single-run fragments, 0 in the 34). | — |
| **bold/colour per line** | partition measures with line 0's run (`ref`), drawing with each line's run, as the composer does | 0 of 176 blocks mix bold or fill across lines (measured), so the two cannot disagree here |

Pre-registered selection rule: `r2/verify/best-rule.txt`, written 19:24:17Z, before the first V5 compose
(`run-V5_p2.0_f7.5.json` is later). Gates G1–G3, then rank (problem blocks, unresolved mechanisms, overflow blocks,
new sub-8.5 pt blocks, Σ(8.5 − size), off-page).

## 3. Control gate (step 2)

`run.py V0` through the **patched** tree: rc 0 34/34; bought keys equal 34/34; items.json equal 34/34;
translated.png pixel-identical 34/34; compose-report.json full-equal to prep 34/34; diag.json byte-equal to
`c3b/work/V0` 34/34. `measure.py V0` (r2's copy of c3b's measure.py, changed only where c3b assumed one item per line;
a V0 row runs the unchanged code path) → `measure-V0.jsonl` **byte-identical** to `c3b/measure-V0.jsonl`, 176/176
full rows. The gate passed, so everything below counts.

Measure adaptation (named): lines/text/right edge grouped by the composer's `r2line` tag; size = the block's drawn base
size (asserted == max item size; a 7 pt subscript is not a shrink); normal extent per item. Planted control on V5-shaped
items: see Key numbers (sacch b2 shifted −15/−20 pt fires; the unshifted copy reproduces the full-run rows).

## 4. Sweep (step 3) — all runs sequential, foreground; `free -h` available ≥ 6.1 GiB before every step

| tag | PAD | F | decimal | transfer | compose (34 figs) | extra |
|---|---|---|---|---|---|---|
| V5_p2.0_f7.0 | 2.0 | 7.0 | 0 | 1 | 16.1 s | |
| V5_p2.0_f7.5 | 2.0 | 7.5 | 0 | 1 | 18.3 s | |
| V5_p2.0_f8.0 | 2.0 | 8.0 | 0 | 1 | 9.4 s | |
| V5_p2.5_f7.0 | 2.5 | 7.0 | 0 | 1 | 15.5 s | |
| V5_p2.5_f7.5 | 2.5 | 7.5 | 0 | 1 | 13.6 s | |
| V5_p2.5_f8.0 | 2.5 | 8.0 | 0 | 1 | 9.0 s | |
| V5_p2.0_f7.5_dec | 2.0 | 7.5 | **1** | 1 | 39.2 s | `--svg` |
| V5_p2.0_f7.5_notr | 2.0 | 7.5 | 0 | **0** | 9.1 s | sentinel (c) control |
| CTRL_V5_p2.0_f9.0 | 2.0 | 9.0 | 0 | 1 | 9.0 s | exercises step (iv) |

Every run: rc 0 34/34, bought keys equal 34/34.

## 5. Measurements (step 4)

### 5.1 Totals (176 blocks; full tables with every name: `r2/tables.md` T1–T10)

| measure | V0 | 2.0/7.0 | 2.0/7.5 | 2.0/8.0 | 2.5/7.0 | 2.5/7.5 | 2.5/8.0 | 2.0/7.5 dec |
|---|---|---|---|---|---|---|---|---|
| hit-artwork | 32 | 1 | 1 | 1 | 1 | 1 | 1 | 1 |
| off-page | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| spill ≥10 px | 24 | 2 | 2 | 2 | 2 | 2 | 2 | 2 |
| contact (BOUNDED <1 pt) | 26 | 1 | 1 | 2 | 1 | 1 | 2 | 1 |
| text-on-text ≥10 px | 7 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| shrunk | 15 | 15 | 15 | 15 | 16 | 16 | 16 | 15 |
| lines ≠ source (more/fewer) | 66 (18/48) | 18 (0/18) | 18 (0/18) | 18 (0/18) | 18 (0/18) | 18 (0/18) | 18 (0/18) | 18 (0/18) |
| Σ ink on dark, px | 3664 | 30 | 22 | 29 | 32 | 24 | 31 | 22 |
| PROBLEM blocks | 50 | 4 | 4 | 4 | 4 | 4 | 4 | 4 |
| unresolved mechanisms /50 | 49 | 4 | 4 | 5 | 4 | 4 | 5 | 4 |
| overflow blocks | 0 | 5 | 8 | 8 | 5 | 9 | 10 | 8 |
| below 8.5 pt (source ≥ 8.5) | 5 | 7 | 7 | 7 | 9 | 9 | 9 | 7 |
| Σ (8.5 − size) of those | 4.0 | 6.75 | 5.5 | 3.5 | 9.0 | 7.0 | 4.0 | 5.5 |
| drawn differently from V0 | 0 | 123 | 123 | 123 | 122 | 122 | 122 | 123 |

Per class (2.0/7.0): box 66 — hit 1, spill 1, contact 1, shrunk 3, fewer lines 6; cell 26 — all 0 except shrunk 3;
OPEN 84 — spill 1 (exocytosis b4), shrunk 9, fewer lines 12, more lines 0. (V0: box 17/19/23 hit/spill/contact,
cell 3 spill + 3 contact, OPEN 15 hit + 15 more-lines.)

### 5.2 Transitions vs V0 — every broken and worsened block NAMED (same in all cells unless noted)

- **Broken (clean in V0, bad now): only `shrunk`**, 7 blocks at PAD 2.0 — glycine b1 8.75, potassium b1 8.75,
  sacch b1 8.75, Example2 b3 8.0, flowchart b13 and b14 (7.25 @F7.0 / 7.5 @F7.5 / 8.0 @F8.0), map7 b5 8.75.
  PAD 2.5 adds **Example2 b1 8.75** (8 broken). These are the price of holding the source line count (D-open iii).
  0 blocks broken on hit, off-page, spill, contact, text-coll, lines, or the extended problem union, in any cell.
- **Worsened (bad in both, worse now):**
  - combmap b8 `Prósentusamsetning`: hit 10 → 29 px (F7.0) / 21 (F7.5) / 28 (F8.0); spill 71 → 114 (F7.5) / 189 (F8.0)
    (F7.0: 75, below the +10 threshold). Its size goes **up** (6.75 → 7.0/7.5/8.0) — the floor turns a tiny word into
    a named overhang.
  - shrink deeper: empform b8 8.75 → 7.25/7.5/8.0; moleratio2 b3 8.5 → 8.0 (PAD 2.0) / 7.25 (2.5/7.0) / 7.5 (2.5/7.5) /
    8.0 (2.5/8.0); combmap b10 8.75 → 8.0 (PAD 2.0) / 7.5 (PAD 2.5, F ≤ 7.5).
- **Fixed** (2.0/7.5): hit 31, off-page 4, spill 22, contact 25, text-coll 7, shrunk 7, lines 48, problem 46.

### 5.3 [USER] mechanisms (50 checks on 41 flagged blocks)

Resolved 46/50 at F 7.0 and 7.5 (both PADs), 45/50 at F 8.0. ⚠️ ethene b0's ANCHOR check (row 24) counts as resolved
only through c3b's special-case post-condition `lines <= src_lines`. Geometrically the block starts 6.76 pt left of the
left edge it shares with b17, and no instrument scores that. **Unresolved, named** (F ≤ 7.5): row 20 empform b8
SHRINK; row 29 moleratio2 b3 SHRINK; row 32 combmap b8 SHRINK and WIDER. F 8.0 adds row 20 empform b8 WIDER (contact
0.63 pt). Every NARROWER (13), TABLE (3) and ANCHOR (4) check resolves in every cell; WIDER 26 of 27 (F ≤ 7.5) / 25 of 27 (F 8.0); SHRINK 0 of 3. vitC b0 (the 1.02 pt
threshold case) is drawn 6.01 pt from both sides of its box (2.0/7.0). Full ✅/❌ matrix: `tables.md` T4.

### 5.4 `overflow` (D-floor), named

- 2.0/7.0 (5) and 2.5/7.0 (5): combmap b8 box `Prósentusamsetning` 64.08 > 54.49 (53.49) @7.0; combmap b11, b13 open
  `Mólmassi` 29.52 > 27.0 (26.0) @7.0; combmap b12, b14 open `Efnajöfnustuðull` 49.68 > 45.21 (44.21) @7.0.
- 2.0/7.5 (8): the 5 above (b8 at 69.48 @7.5) + empform b8 box `Reynsluformúla` 52.92 > 51.99; flowchart b13, b14 open
  `Mólstyrkur` 34.56 > 34.0.
- 2.0/8.0 (8): same 8 at 8.0 pt (empform b8 54.72; flowchart 36.36; combmap b8 71.64).
- 2.5/7.5 (9): the 2.0/7.5 set + moleratio2 b3 open `Efnajöfnustuðull` 55.08 > 55.01.
- 2.5/8.0 (10): + combmap b10 box `Reynsluformúla` 54.72 > 53.75.
- `openFallback` (line-count overflow with every word fitting): **0** in all 6 cells.

### 5.5 Blocks below 8.5 pt, named with size

- 2.0/7.0: empform b8 7.25, Example2 b3 8.0, flowchart b13 7.25, b14 7.25, moleratio2 b3 8.0, combmap b8 7.0, combmap b10 8.0.
- 2.0/7.5: same blocks — empform b8 7.5, Example2 b3 8.0, flowchart b13/b14 7.5, moleratio2 b3 8.0, combmap b8 7.5, b10 8.0.
- 2.0/8.0: all seven at 8.0.
- 2.5/7.0: + alsulfatemass b2 8.25, aspirin b2 8.25; flowchart b13/b14 7.0, moleratio2 b3 7.25, combmap b10 7.5.
- 2.5/7.5: alsulfatemass/aspirin b2 8.25, empform b8 7.5, Example2 b3 8.0, flowchart b13/b14 7.5, moleratio2 b3 7.5, combmap b8 7.5, b10 7.5.
- 2.5/8.0: alsulfatemass/aspirin b2 8.25, the other seven at 8.0.
- Every cell additionally: combmap b11, b12, b13, b14 at **7.0 because their source is 7.0 pt** (not a shrink).

### 5.6 Sentinels (value level)

- **(a) TEXT** (`scripts/sentinels.py`): lines are grouped by geometry — base-size items clustered on the text normal,
  every item assigned to the nearest line — not by the composer's line tag; segments concatenated without separator.
  176/176 in all 7 V5 runs and both control runs; adjacency (consecutive items abut within 0.02 pt) 0 failures.
  Positive control (`--control`, ethene b0, 5 items `sem þarf til að hvarfast við ` `H` `2` `O` ` til að mynda 9,55 g af`):
  deleted character → fires; swapped item positions → fires; duplicated item → fires (3/3); clean copy passes.
- **(b) KEPT UNTOUCHED** (`scripts/sentinel_b_c.py`): decimal off — run-exact items == V0 on 34/34 for V0, all 6 cells
  and the transfer-off run. Decimal on — 35 differing kept items, each differing only in `text` and only by `.`→`,`;
  alsulfatemass 7, aspirin 7, chloroform 7, glycinemass 9, saltMass 5 (== c9); value multiset == c9's 35 values;
  compose-report blocks/missing/translated/identity/runExact unchanged 34/34; layout items identical to the same cell
  with decimal off 34/34. The r2 SVGs of that cell carry the commas in their text layer: 35 kept `<text>` with digit,digit.
- **(c) ② PLACEMENT**: 52/52 stretches in 34 token blocks of 13 figures (combustion, copperMoles, glycine, sacch,
  etheneBr, ethene, map2, map3, moleratio1, moleratio2, limiting, combmap, map8 — the 13 [USER] flagged for missing
  scripts); `unformatted` [] on 34/34. Drawn check: the multiset of drawn styled items (size ratio ≠ 1, italic, or
  baseline offset from its geometric line) equals, per block, the source stretches × clean occurrences (anchored
  fallback placing a stretch once when no exact occurrence exists, e.g. `(mól–1)` against source `(mol–1)`):
  0 mismatches on 176. Transfer off: mismatch fires on 34/34 token blocks (positive control); 0 non-token blocks
  differ; the 21 token-free figures are items-identical. *(The "52/52" figure printed for the transfer-off run is
  computed from its empty `unformatted` and is meaningless there; the drawn check is what counts.)* Italic: 0 italic
  tokens exist in the 34 translated blocks, so italic transfer is carried by the style tuple but **unexercised**.
- **(d) RULINGS GEOMETRY**: box — every line's extent centre within 0.5 pt of (L+R)/2 on 66/66; cell — every line's alignment edge within 0.5 pt of the source anchor on 22/26, and exactly anchor+displacement
  on the 4 displaced (named in §2), all inside [L+PAD, R−PAD]; OPEN step counts — 2.0/7.0: i 65, ii 6 (argon b2,
  copperMoles b1, b4, vitC b1, Example2 b1, ethene b0), iii-displaced 7 (glycine b1, potassium b1, sacch b1, Example2 b3,
  flowchart b13, moleratio2 b3, map7 b5), iii-anchor 2 (flowchart b5, b14), iv-overflow 4 (combmap b11–b14).
  2.0/7.5 and 2.0/8.0: flowchart b13, b14 move to iv-overflow. PAD 2.5: ii gains map2 b6, map3 b6, map7 b6 and loses
  Example2 b1 (→ iii-displaced, 8.75); map7 b5 moves to iii-anchor (8.5); at 2.5/7.0 flowchart b13, b14 and moleratio2 b3 are
  iii-anchor (7.0, 7.0, 7.25); at 2.5/7.5 and 2.5/8.0 those three are iv-overflow.

## 6. Crops, sheets, SVGs (step 5)

- `r2/crops/` — 52 PNGs + `INDEX.json` (reason per crop): all 41 flagged blocks, every broken/worsened block, every
  overflow block, every block below 8.5 pt, the 4 displaced cells. Panels SOURCE | V0 | V5 (PAD 2.0, F 7.5, decimal on),
  with overlay row (green source frame, red drawn item boxes, blue container/free box). **The 4 blocks that differ
  between F 7.0 and F 7.5 carry a 4th ALT panel (PAD 2.0, F 7.0)**: empform b8, flowchart b13, b14, combmap b8.
- `r2/contact/` — 34 sheets, SOURCE / V0 / V5 (2.0, 7.5, decimal on). I looked at combmap, alsulfatemass, sandwich,
  glycine, flowchart, exocytosis, and the copperMoles b4 and ethene b0 crops; what they show agrees with the numbers. This is a self-check, not a review: **the 52 crops and 34 sheets are the next
  human check** ([USER] has seen only V0
  (subscripts and `mól⁻¹` placed; `Samtals / (amu)` two lines; `Mólmassi` right-flush against 342,14; arrow labels on
  2 lines under the arrow; sandwich prose on one line; exocytosis flush labels grow away from their leader lines;
  `Prósentusamsetning` visibly overhangs its box).
- `r2/svg/<b>.svg` — 34 SVGs from the decimal-on cell (`--svg`); `<text>` sequence == items text sequence on 34/34.
- `r2/svg/CNX_Chem_03_01_brain-ec0b.healed.svg`, `r2/svg/CNX_Chem_03_01_exocytosis-88f6.healed.svg` — c10's
  `heal_soft_mask_rings` lifted verbatim into `r2/scripts/heal_c10.py` (46 lines, string-presence checked; lifted so the
  module's `pikepdf`/`_deps` imports are not needed), run on a **copy** of prep's `artwork.svg` (`r2/svg/heal/<b>/`),
  then `svgout.write_svg` with the V5 decimal-on items. Heal reports equal c10's. **Not rendered** (no Chromium run);
  c10's finding that exocytosis does not load in `<img>` is untouched.

## 7. Recommendation (step 6)

**PAD 2.0 pt, F 7.0 pt.** Why, from the numbers:

- **Gates:** all 6 cells pass G1–G3. **Rank item 1 (problem blocks) ties at 4 everywhere, with the same 4 blocks.**
- **PAD 2.5 vs 2.0:** fixes nothing (same problem set, same unresolved set) and costs: 2 more sub-8.5 pt blocks
  (alsulfatemass b2, aspirin b2 at 8.25), 1 more shrink (Example2 b1 8.75), deeper shrinks (moleratio2 b3 to 7.25,
  combmap b10 to 7.5), 1 more overflow at F 7.5/8.0 (moleratio2 b3), and 0.15 pt displacement of the 3 right-flush
  `Mólmassi` cells. What it buys is clearance: BOUNDED blocks with drawn margin < 2.5 pt drop from 9–10 to 1–3 (the
  overflow blocks). **No instrument can say whether that is worth it:** [USER] flagged 1.02 pt and accepted 3.46 pt;
  2.0–2.5 is unreviewed; the source's own tightest box clearance is 2.5 pt (inherited, c3b).
- **F 8.0 vs 7.5 at PAD 2.0:** same 4 blocks change; F 8.0 turns empform b8 into a contact verdict (margin 0.63 pt,
  below the 1.02 pt [USER] called overlap) and adds an unresolved mechanism; combmap b8 spill 114 → 189 px. Rejected.
- **F 7.0 vs 7.5 at PAD 2.0 — the real choice, 4 named blocks:**
  - empform b8 `Reynsluformúla`: 7.25 pt, fits, box margin 2.97 pt (F 7.0) vs 7.5 pt, overflow, margin **1.53 pt** (F 7.5).
  - flowchart b13, b14 `Mólstyrkur`: 7.25 pt, fits (F 7.0) vs 7.5 pt, 0.28 pt per side into the 2 pt clearance (F 7.5).
  - combmap b8 `Prósentusamsetning`: overflows either way — 7.0 pt, margin −2.8 pt, ink 29 / spill 75 px (F 7.0) vs
    7.5 pt, margin −5.5 pt, ink 21 / spill 114 px (F 7.5).
  - The pre-registered rule ranks overflow above sub-8.5 pt size, so it picks F 7.0 (overflow 5 vs 8). **That ordering
    decides the outcome and is structurally biased toward the lowest F:** overflow can only stay level or fall as F falls,
    and problem/unresolved/sub-8.5 count tie (4/4/7) for F 7.0 and 7.5. Ranking Σ(8.5 − size) above the overflow count
    would pick F 7.5 (5.5 vs 6.75 pt). The rule therefore says nothing independent about the floor. The case for
    F 7.5 is 0.25–0.5 pt larger text in those 4 labels. The case for F 7.0 is that empform b8's 1.53 pt margin at
    F 7.5 is closer to the 1.02 pt [USER] flagged than to the 3.46 pt [USER] accepted. The crops for these 4 blocks have
    both floors side by side, so [USER] can decide by eye.

**What the prototype still does not solve (plainly):**
1. **A single word wider than its box at the floor.** combmap b8 `Prósentusamsetning` overhangs its box in every cell
   (hit + spill + contact); empform b8, moleratio2 b3 and combmap b10 can only shrink. The four 7 pt combmap arrow labels
   cannot shrink at all: b12, b14 `Efnajöfnustuðull` end 0.26–0.27 pt past the free box, b11, b13 `Mólmassi` 0.73 pt inside it. These need a non-layout answer: a compound-boundary hyphen, a
   shorter term, or an editor decision. The prototype names them in `overflow`; it does not fix them.
2. **Minimal displacement can break a shared edge.** ethene b0 (row 24) holds one line at 9 pt but moves 6.76 pt left
   of the left edge it shares with b17. Row 24 asked for centring; the ruling says "minimal displacement, not
   re-centring". No verdict sees it (see the ethene b0 crop).
3. **Holding the line count costs size on 7 arrow/OPEN labels** (8.75 pt ×4, 8.0 pt Example2 b3, and the flowchart
   pair at the floor). They are clean on every collision instrument, but [USER] has only reviewed 8.5 pt and 6.75 pt,
   not 8.0–8.75.
4. **Step (iv) gain-a-line never fires in the sweep.** It is exercised only by the F 9.0 control, so its real-corpus
   behaviour is unmeasured.
5. **brain b0 is ruled as a cell on an invisible container** (the ⑩ artefact). exocytosis row 11 (does not load) is
   out of scope and untouched; exocytosis b4's spill is spurious in every cell.
6. **② beyond the 34 is unmeasured:** italic transfer, stacked-split charges (c2: 15 of 19 produce no token), c2's
   recommended size-conditional thresholds (the prototype still runs the flat 0.12 rule), the `<img>` browser drift,
   and editor-edit shapes were not re-probed here.
7. **Box vertical fit is not budgeted** (the 4-line flowchart boxes pass on the instrument, not by construction). The
   OPEN free box is sampled only across the source frame, so displaced or gained lines rely on the pixel instrument.
8. **Not integrated:** no `COMPOSER_VERSION` bump or `isStale` handling, no driver NOTE for `unformatted`/`overflow`, no
   repo tests. The decimal rule is a second implementation of `figure-consistency.cjs` with no cross-language fixture.

## 8. Limitations of the measurement itself

- The ② drawn-placement expectation reuses c2's clean-occurrence rule, so it is not fully independent of the composer;
  the text sentinel and the transfer-off control are.
- The text-on-text instrument (c3b's supplementary one) still has no planted positive control (inherited gap).
- The measure adapter groups lines by the composer's `r2line` tag. That is the same trust c3b placed in its diag
  widths, and the V0 byte-identity plus the planted shift are the controls.
- Readings of the rulings that change numbers are listed in §2: the brain b0 class; single-line cell alignment from
  margins; flush before sibling cue; room ≥ extra + PAD; the vertical clamp for cells; floor_eff = min(F, sz0).

## Repo state

`git -C /home/siggi/dev/repos/namsbokasafn-efni status --porcelain` (run at the end):
```
?? docs/superpowers/specs/2026-09-13-c140-t23-scripts-reflow-decimals-design.md
```
**This untracked file was not written by this run.** Its mtime is 19:44:22Z. No tool call of mine wrote inside the
repo; every write went under `/home/siggi/dev/scratch-c140/r2` or this report path. At 19:44–19:45 my commands were
writing `r2/svg/`. It is presumably the controller's design spec, and I did not open or touch it.

`find /home/siggi/dev/repos/namsbokasafn-efni/experiments/figure-text-translation -newer /home/siggi/dev/scratch-c140/reports/critic.md -not -path '*/pylibs/*' | head`:
```
(no output)
```
Extra checks:
- `find …/figure-text-translation/pylibs …/books/efnafraedi-2e -newer r2/verify/best-rule.txt` → no output.
- Positive control for `find -newer`: the same predicate over `r2/scripts` lists `r2/scripts` and `r2/scripts/heal_c10.py`.
