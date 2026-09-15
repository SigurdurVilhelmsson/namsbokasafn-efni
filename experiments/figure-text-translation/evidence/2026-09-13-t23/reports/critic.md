# critic — completeness review of the §C140 ② ③ ⑨ ⑩ design investigation

**Date:** 2026-09-13. **Cost:** 0 ISK (nothing that calls the MT was run). **Repo:** read-only; no git
checkout/stash/commit. **Scratch:** `/home/siggi/dev/scratch-c140/critic/` (`spot_prep.py`, `spot_c9.py`;
everything else was inline `python3 -B` reading existing artefacts). No compose, prepare, render or
test suite was run — every re-measurement below re-reads files other agents or the repo already hold.

**Inputs read in full:** `reports/prep.md`, `reports/c2-scripts.md`, `reports/c3-containers.md`,
`reports/c9-decimal.md` (822 lines, both pages), `reports/c10-brain.md`; register §C140 row
(`docs/plans/2026-07-21-post-item17-followup-campaign.md:1639-1662`); `evidence/2026-09-13-e-build/USER-REVIEW.md`.
**c3b's report does not exist** at `reports/c3b-counterfactuals.md` (its Write was refused). I could not
read its prose; everything I say about c3b comes from its on-disk artefacts: `c3b/tables.md`,
`analysis.json`, `hold-lines.json`, `run-V*.json`, `verify/best-rule.txt`, `planted-copy.json`,
`scripts/patch_variants.py`, `scripts/analyse.py`, `scripts/hold_lines.py`, `scripts/build_census.py`.

---

## Headline

1. **c3b's "best: V3" is a ruling on a shrink floor, not a measurement.** Its pre-registered rule
   (`verify/best-rule.txt`) cites [USER] flagging 6.75 pt as "tiny font" and then makes shrinking a
   tiebreak only. V3 newly shrinks **8** blocks, **4 of them below the flagged 6.75 pt** (combmap b11
   6.25, b12 6.0, b13 6.25, b14 6.0), and every variant V1–V3L shrinks the flagged block itself
   (combmap b8) **further**, 6.75 → 6.0. **Re-measured: counting any size below a floor anywhere from
   6.5 to 8.3 pt as a PROBLEM flips the winner from V3 to V3L** (control: floor = none reproduces c3b's
   own 50/23/23/15/17 and "best V3"). V3L's price is 5 arrow labels newly thrown **off the page by
   12–405 px**. Neither is shippable as-is.
2. **The mechanism the nine arrow-label rows need was never composed.** Rows 14–19 and 21 (9 blocks)
   stay unresolved in all five variants. c3b's own `hold-lines.json` (geometry only, labelled NOT
   COMPOSED) says holding the source line count against the whole free width costs **0 pt on 5 of those 9**
   and ≤1.0 pt on the other 4 — and the same computation holds ethene b0 (row 24) and sandwich b2
   (row 31) at 9.0 pt. V2/V3 instead prefer *gaining a line at sz0* over a 0.25 pt shrink, and V3's
   anchor+pad budget misses by as little as 0.94 pt. This is the single most decision-changing gap.
3. **[USER]'s schematic note has two readings and no report asked which.** "text should be left aligned
   but centered in boxes but has constant indent": c3 measured only the constant-indent premise
   (source indent 11.0–11.8 pt) and dropped "left aligned"; c3b's V1+ then **centres every line** of all
   92 BOUNDED blocks (`align='center'` → `compose.py:335` `a_ = anchor - w/2` per line). A left-aligned
   block centred in its box was never drawn.
4. **USER-REVIEW row 11 (exocytosis "Not visible on page") is owned by no report and no §C140 item.**
   c10 (out of scope) found the recomposed artwork never finished loading in Chromium `<img>` (300 s);
   the committed `_IS.svg` is **24,921,365 bytes with 628 `<mask>`** (re-measured), while pupils get the
   254,774-byte June copy. c3/c3b layout verdicts on exocytosis (V3 "breaks" b0, b2) concern a figure that
   may not render at all.
5. **② and ③ were measured separately and share one width function.** c2's styled measurement collapses
   map2 b0/b1 2→1; c3b's V2 line-count preference holds them at 2 (re-read) — but V2 measured flat.
   Neither composed them together.

---

## A. Spot-checks (re-measured by me, against raw files)

| # | report · claim | instrument (mine) | population · unit | result | positive control |
|---|---|---|---|---|---|
| 1 | prep: 367 blocks / 184 never-sent / 183 send:true / 7 identity / 191 runExact; 169 unique sidecar keys | `critic/spot_prep.py`: `prep/figs/*/blocks.json` `send`, `compose-report.json` `identity`/`runExact`, committed `books/efnafraedi-2e/figure-text/<b>.is.json` key count | 34 figures · drawn blocks; unique keys | **367 / 184 / 183 / 7 / 191; 169** — match | the distinct measures differ (169 ≠ 183), so equality is not a tautology. ⚠️ identity/runExact are read from prep's own compose output, so those two are not independent of prep |
| 2 | c9: E draws the 35 kept decimals as points (0 commas); June draws 35 commas (0 points) | `critic/spot_c9.py` + inline: parse `<text>` in 5 `books/efnafraedi-2e/media/*_IS.svg` and 5 `05-publication/mt-preview/chapters/03/images/media/*_IS.svg` | 5 ch03 mass figures · number tokens in the text layer | E **35 points / 0 commas**. June **0 points / 35 commas** — my first regex read **34**, because June glycinemass holds `16,00` and `32,00` contiguous in one text node (`16,0032,00`); counted correctly it is 35 | `12,85` (etheneBr) and `9,55` (ethene) detected as commas in the E SVGs |
| 2b | c9: "what the site serves was not fetched" | sha256 of `../namsbokasafn-vefur/static/content/**/<b>_IS.svg` vs efni June vs efni `media/` | 7 figures (5 mass + brain + exocytosis) · files | vefur local static **byte-identical to efni's June copies on 7 of 7**, different from `media/` on 7 of 7. ⚠️ local vefur checkout (last commit 2026-09-05), **not the live site** | the comparator distinguishes (June ≠ media on 7/7) |
| 3 | c10: exactly 2 of 34 carry untransformed soft-mask rasters (brain 1, exocytosis 12); 27 have no `<mask>` | regex for cairo's `<mask><g filter="url(#filter-remove-color)"><use href="#<image>"/>` over 34 committed `_IS.svg` | 34 figures · masks | brain **1**, exocytosis **12**, all others 0; **7** figures carry any `<mask>` (27 none) — match | brain (the known target) fires |
| 4 | c3: BOUNDED 92 / OPEN 84; `maxw > avail_from_anchor` on 59/92 BOUNDED, 26/84 OPEN | `c3/blocks.jsonl`, `geometry.container.avail_from_anchor` | 176 layout blocks · drawn block | **92 / 84; 59 / 26** — match | both True and False bins populated in both classes |
| 5 | c2: the 13 figures with scripted translated blocks are exactly the 13 [USER] flagged for sub/superscripts | `c2/all34.jsonl`: `rule_2b ∈ {sub,sup}` ∧ `state == translated` | 661 runs of the 34 · figures | **13 figures, identical by name** to USER-REVIEW rows 5, 15, 16, 18, 23, 24, 26, 27, 28, 29, 30, 32, 34; 34 (figure, key) blocks | 5 other figures carry scripts only in kept blocks (basehyd, rxn2, HClsoln, GreenChem, FishLemon), so the filter discriminates |
| 5b | c2 / row 15: copperMoles `mól–1` superscript is placed | `c2/work/CNX_Chem_03_02_copperMoles_img-a962/ts/items-c2.json` | one item | `–1` drawn at **7.0 pt, y 3.96 vs `(mól` at 0.96** (+3.0 pt) | `(mól` itself stays 9.0 pt |
| 6 | c3b: "best: V3" | recompute score from `c3b/analysis.json` with an optional shrink floor | 176 layout blocks × 5 variants | floor none → **50/23/23/15/17, best V3** (reproduces tables.md). floor 6.5 → V3 19, V3L 17; 7.0 → 20/17; 7.5–8.0 → 22/17; 8.3 → 24/18: **best V3L at every floor 6.5–8.3** | the floor-none run reproduces c3b's own numbers |
| 6b | c3b: V0 is the unchanged composer | `c3b/run-V0.json` | 34 figures | `items_equal ∧ png_identical` **34/34** (V1: 12/34, V3: 6/34 — so the comparator fires) | — |
| 6c | c10: exocytosis SVG ~24.9 MB, 628 masks | `wc -c`, `<mask` count | 1 file | **24,921,365 bytes, 628** — match | — |

---

## B. Per report

### prep

**(1) Numbers without population or control.** None material. Every total has a unit and a by-name
comparison to VERIFICATION.md with a shifted-pairing control; the arc null has a positive control
(SciMethod, 56 arc items); the SVG-vs-committed identity has planted-difference controls.

**(2) Contradictions.** None. Consistent with c10: prep composed exocytosis in 3.89 s and found its
`translated.svg` `<text>`-identical to the committed one, so c10's non-loading finding applies to the
committed file too (c10 only loaded the prepared `artwork.svg`).

**(4) Missing measurement that would change a decision.** No `_IS.svg` was loaded through the reader's
`<img>` path. A load check over all 34 (brain as the positive control, a bounded timeout) belongs with
prep's invariants. **Decision it changes:** whether the recomposed ch03 figures can be published at all
(row 11), independent of ②③⑨⑩.

### c2 (② T-scripts)

**(1) Numbers without population or control.**
- **The recommended size-conditional thresholds (0.075 / 0.13) were never executed** (c2 says so). All
  its validation numbers (661/661, 52/52, 54/54) test the flat 0.12 rule. The corpus claim "differs on
  exactly the 4 d-orbital runs" is derived from a histogram, not run. The census already exists, so this
  is cheap.
- **Browser drift envelope argument is weaker than stated.** "Within-word error ≤ 0.57 pt, inside E's
  accepted envelope (up to 2.25 pt)": the −2.25 pt E extreme is HClsoln's run carrying the **10-space
  arrow gap**, not two abutting glyphs. E's glyph-adjacent extreme is +0.76 pt. The worst unmitigated ②
  case (−1.56 pt) is at 2 and 4 px/pt. And the instrument is inline SVG, not `<img>` (disclosed). No
  report measured which display scale published figures actually get.
- **Byte-identity of `--flat` is shown on 14 figures** (13 scripted + HClsoln), not on the 20 figures
  with no scripted translated block, where C0/C1 goldens live. Low risk; unmeasured.
- "0 `<tspan>` in the 34 published SVGs (inherited, verify M1)" is true of `books/.../media/`, which is
  what *will* be published. The copies **actually served** (efni `05-publication` June = local vefur
  static, spot-check 2b) carry **16–28 `<tspan>`** each in the 5 ch03 mass figures (re-measured). This is
  terminology, not a design defect; the `<text>`-per-item argument rests on the test regexes.

**(2) Contradictions.**
- c2 Decision 1 warns styled widths collapse map2 b0/b1 2→1 (below the source). c3b's V2/V3, with flat
  widths, hold **map2 b0, b1 at 2 lines and glycine b0 at 2** (re-read from `analysis.json`). So ③'s
  line-count preference would neutralise that hazard, provided ③'s partitioner measures with ②'s
  `seg_width`. Interaction, not contradiction. c2's shrink-scaling concern stands: V3's new shrinks hit no
  scripted block (exocytosis b0/b2, flowchart b13/b14, combmap b11–b14).

**(4) Missing measurements that change decisions.**
- **Joint ②+③ compose:** c2's `seg_width` inside c3b's V2 `_choose` partitioner, on the 13 scripted
  figures. **Decision:** c2 Decision 1, "which width the budget sees".
- **`<img>`-path positioning** at the scale the reader page uses (c10's `render-check2.mjs` is already
  that path). **Decision:** c2 Decision 3, word-edge splitting.
- **Execute the recommended thresholds on the corpus census.** **Decision:** which classifier ships.

### c3 (③ containers)

**(1) Numbers without population or control.**
- Glyph-box ≥100 px: 19 vs inherited 23, cause untraced. No decision depends on it.
- Chosen, unmeasured thresholds (colour TOL 24, 25 % page, 0.5 pt ambiguity, **1.0 pt contact**) are
  disclosed. **vitC b0** (row 19, "text overlaps frame in box 2") has a 1.02 pt margin. c3b inherited the
  same predicate and scores it **✅ resolved at V0** (T5), so no instrument in the set agrees with [USER]
  on that block. It does not change the ranking: V1+ draw it with 6.01 pt each side.
- "8 of 15 shrunk blocks would fit their word at sz0" was geometry only. c3b's compositions un-shrink 7
  of the 8: saltMass b2 in V1; rxn2 b9, map2 b6, map3 b6, moleratio1 b2, map7 b6 and map8 b1 in V3.
  **flowchart b5 stays shrunk in V3** (8.75 pt; it was 8.5 pt in V0).
- Text-vs-text collision is measured against neighbours' **source** boxes (disclosed). c3b's `text_coll`
  has a null source control (0/176) and fires on 7 V0 blocks, but **no planted positive**.

**(2) Contradictions.**
- **[USER] general note, half-read.** c3: "'Centred in boxes' is a request to depart from the source
  geometry." The note says *"text should be left aligned but centered in boxes"*. Left-aligned lines in a
  block centred in the box is a third option. It is neither the source's constant indent nor per-line
  centring, and no report names it.
- **brain b0's "container" is the ⑩ artefact.** c3 classes brain b0 BOUNDED by "the translucent label
  box — the ⑩ outline". c10 shows that rectangle is a white knockout under a luminosity soft mask whose
  edge is ~0 (mask 0–9) in the source, i.e. **invisible**. It is a hard budget built on an invisible
  edge. Low consequence (`Taugafrumur` 55.1 vs 54.0 pt), but after ⑩'s heal the reader sees no box at all.
- **Row 31 evidence vs c3's own cue census.** The row-31 table says sandwich b2 is "left-flush source".
  c3's `cues.json` gives it sibling edges **L (2) + C (1)**. c3b's `build_census.py` maps any mixed
  single-line cue to `center`, and V3's centre budget `2·min(anchor−FL, FR−anchor) − pad` = **59.8 pt**
  against **113.1 pt** of free width centred. Result: row 31 is unresolved in all 5 variants.
- **§5.2 "the line count needs to be held, using the wider free width"** is stronger than c3's own
  measurement (§2.4: "whether the value then fits … was NOT composed"). c3b's `hold-lines.json` shows
  **avail > maxw does not imply the source line count fits**:
  - V3 budget (source anchor + pad 2): fits at sz0 on **0 of 9** arrow labels.
  - Whole free width, centred: fits at 9.0 on **5 of 9**; glycine b1, potassium b1 and sacch b1 need
    8.75; Example2 b3 needs 8.0.

**(4) Missing measurements that change decisions.** See c3b's composed "hold" variant below. That is
where c3's geometry has to be tested.

### c3b (③ counterfactuals; report not written)

**(1) Numbers without population or control.**
- **The report itself is missing.** Only tables and artefacts exist, so none of c3b's prose claims,
  caveats or disclosures can be checked.
- `text_coll`: no planted positive (see c3).
- **PAD = 2.0 pt** comes from a `compose.py` comment, not a measurement. V3's arrow-label outcome is
  sensitive to it: argon b2 misses the V3 budget by **0.94 pt** (71.42 vs 72.36). No PAD sensitivity was
  run.
- Controls that do hold: V0 = unchanged composer on 34/34 (spot-check 6b); planted argon ink 0/52/88
  reproduces c3's planted table.

**(2) Contradictions.**
- **The pre-registered rule contradicts its own premise** (Headline 1).
  - Severity regressions on blocks that were already shrunk are invisible to T3's binary "broken"
    column: combmap b8 6.75→6.0 (the "tiny font" block, row 32), empform b8 8.75→7.25 (row 20) and
    combmap b10 8.75→8.0 (row 32), in every variant V1–V3L.
  - Blocks V3 newly shrinks, named: exocytosis b0 8.25, exocytosis b2 6.75, flowchart b13 7.0,
    flowchart b14 7.25, combmap b11 6.25, b12 6.0, b13 6.25, b14 6.0.
  - combmap b11/b13 (`Mólmassi`) are plausibly inside row 32's "much overflow". V3 turns them into 6.25 pt
    text, and this is not counted.
- **V3's OPEN "source alignment first" conflicts with [USER] rows 24 and 31.**
  - Row 24 asks for ethene b0 centred "to avoid linebreak". V3's left cue gives a 209.2 pt budget against
    217.1 pt natural width, so 2 lines; the whole free width centred (229.7 pt) holds 1 line at 9.0.
  - Row 31: sandwich b2, as above.
- **BOUNDED per-line centring** is encoded as a rule without a ruling (Headline 3).

**(4) Missing measurements that change decisions.**
- **A composed "hold" variant.** Line-count preservation takes precedence over sz0 down to a shrink
  floor, the budget is the whole free width, and anchoring is fit-driven: fall back to the anchor that
  holds the source line count before gaining a line. Run it on the 13 OPEN gained-line blocks in
  `hold-lines.json`. Geometry predicts:
  - 9.0 pt: argon b2, copperMoles b1, copperMoles b4, vitC b1, Example2 b1, ethene b0, sandwich b2;
  - 8.75 pt: glycine b1, potassium b1, sacch b1, map7 b5;
  - 8.5 pt: combustion b4;
  - 8.0 pt: Example2 b3.

  **Unmeasured:** arrow/ink collision after re-centring in the free box. Also, **map7 b5 gains a line
  today and [USER] called map7 "Fine" (row 33)**, so "hold" cannot be absolute.
  **Decision:** ③'s precedence among line count, size and source anchor, and whether rows 14–19, 21, 24
  and 31 are fixable at all.
- **BOUNDED alignment variants:** (a) left-aligned lines, block centred in the container; (b) source
  indent kept, container budget. **Decision:** the BOUNDED anchor. It needs [USER]'s reading first.
- **Shrink-floor variants, composed** (not just rescored) for the single-word-floor blocks: shrink to the
  floor, or overhang. **Decision:** the floor, and V3 vs V3L.

### c9 (⑨ decimals)

**(1) Numbers without population or control.** Well controlled. Population B (727 kept line instances)
is **inherited** from the 1b census copied off a dead tmpfs. It has three controls, and its funnel agrees
with c2's **fresh** re-run of the same instrument (2,946 `send:true` = c9's 2,763 unbought + 183 bought).
Two independent instruments give one answer. The June 35-comma claim is re-measured (spot-check 2),
with the concatenation caveat.

**(2) Contradictions.**
- The register ⑨ row ("stays a point in figures kept in English") omits that the **served** copies are
  commas. c9's regression framing is right. I measured that the local vefur static copies equal the June
  commas (2b); the live site was not fetched.
- **c9 Surprise 4, verified by reading** `tools/lib/figure-consistency.cjs:15-21` (`split(/\s+/)` →
  `join(' ')`): the panel raises a "decimal" suggestion on any double space. On the 34 that means the two
  HClsoln identity values. `Nota` would collapse the arrow gap **and** turn an identity block into a
  translation, which draws on the layout path and undoes E on exactly the blocks E fixed. **No report or
  register item owns this.**
- **Rollout interaction no single report states.** ⑨ (`compose.py` kept branch) and ② both need a
  `COMPOSER_VERSION` bump. c10's ⑩ heal lives in `strip-text.py`, and `isStale` never keys on the
  artwork (c10, read from code), so a lone ⑩ fix needs `--force` per figure unless it rides the same
  bump.

**(4) Missing measurement that changes a decision.** None beyond the live-site check for c9 Q5
(publication hold), which is outside a read-only scratch run. The local vefur half is now done.

### c10 (⑩ brain outline)

**(1) Numbers without population or control.**
- **Heal validated visually on 1 raster of 1 figure** (brain, 4 sides). Exocytosis's 8 flagged rasters
  were healed in bytes but never rendered. Exocytosis `mask-0` left side (39.6) is unclassified.
- "Nobody is served the outline today" rests on local files (efni `05-publication` HEAD, local vefur
  static), not the live site. I confirmed brain's vefur static sha `c4aa714d…` = efni June.
- The 15 EPS-sourced figures were not in the in-BT census (disclosed; does not affect ⑩ exposure).

**(2) Contradictions.**
- With c3 on brain b0's container (above).
- **Housekeeping breach, confirmed.** c10 disclosed writing `experiments/figure-text-translation/__pycache__/blockkey.cpython-314.pyc`
  and `figtext.cpython-314.pyc` inside the repo. mtimes are 17:19:08.657 / 17:19:08.656 (re-read). The
  files are gitignored (`.gitignore:117`), so `status --porcelain` cannot show them. c2 saw the same
  write and attributed it to "another session"; it is this one, so the two reports agree. It is a
  regenerable cache, but it breaks the "no file inside the repo, tracked or untracked" rule.

**(4) Missing measurements that change decisions.**
- **`<img>` load of the committed exocytosis `_IS.svg`** (and of all 34), with brain as the positive
  control. **Decision:** publication hold for recomposed ch03 figures, and whether exocytosis needs its
  own item (mask simplification or rasterising). It is also what would let ⑩'s exocytosis exposure be
  measured at all.
- **Corpus exposure of the soft-mask-ring signature** beyond the 34. A byte census of source PDFs for
  `/SMask … /S /Luminosity` groups under a clip needs no `pdftocairo`. **Decision:** a general heal with a
  fail-closed sentinel, or a two-figure fix.

---

## C. [USER] review rows for ② ③ ⑨ ⑩ — accounting

| item | rows | accounted by | gap |
|---|---|---|---|
| ② | 5, 15, 16, 18, 23, 24, 26, 27, 28, 29, 30, 32, 34 (+ general note: schematics lack subscripts) | c2: all 13 by name (spot-check 5); row 15's superscript drawn (5b); row 5's "O2 far left OK" is a never-sent run-exact block | none by row. Italic/stacked shapes are corpus-only (0 in the 34) |
| ③ | 7, 8, 10, 14–21, 23, 24, 25, 29, 31, 32, 34 (+ general note) | c3: 18 rows → 41 blocks → 50 mechanisms; c3b T5 carries all 50 | **row 19 box 2** (vitC b0): instrument says fine at V0. **row 24** "first line indented" → ethene b17 is "likely", not certain. **row 32**: combmap b0/b1/b4/b5 "likely"; b11/b13 left unflagged and shrunk to 6.25 pt in V3. **General note "left aligned … centered in boxes"**: only the constant-indent half measured. **Unresolved in c3b's best (V3), 17 mechanisms:** 9 arrow NARROWER (rows 14–19, 21), empform b8 SHRINK (20), ethene b0 ANCHOR+NARROWER (24), moleratio2 b3 SHRINK+WIDER (29), sandwich b2 ANCHOR+NARROWER (31), combmap b8 SHRINK (32) |
| ⑨ | 7, 8, 10, 12, 13; positives 23, 24 | c9: 35 values in 5 figures; MT commas on 2 translated values | none |
| ⑩ | 9 | c10 | exocytosis exposure unrendered |
| — | **11** (exocytosis "Not visible on page") | **nobody in scope**; c10 names a likely cause, undiagnosed | **no §C140 item** |

Out of scope (⑪ wording) and not assessed: wording parts of rows 2, 7, 8, 10, 12, 13, 25, 30, 31.

---

## D. Git status

| report | its stated `status --porcelain` | gitignored-write check |
|---|---|---|
| prep | empty (before, between batches, after) | `find -newer` → nothing; control fires |
| c2 | empty (start, steps, end) | `__pycache__` checked; the 17:19:08 write attributed elsewhere (it is c10's) |
| c3 | empty (end) | `find -newer` → nothing; control fires |
| c3b | **unknown — no report** | unknown |
| c9 | empty (start, steps, end) | `find -newer` → only the `.git` directory entry |
| c10 | not stated as a porcelain line; **discloses 2 `.pyc` writes into the repo's gitignored `__pycache__`** | confirmed by mtime (above) |
| **critic (me)** | **empty** (run immediately before writing this report, and again at the end) | `find <repo> -newer critic/spot_prep.py -not -path '*/.git/*'` → **nothing** mid-session; at the end **only the `.git` directory entry itself** (its mtime moves with my own `git status` runs, the same thing c9 saw; nothing inside the working tree) (control: the same predicate lists `critic/spot_c9.py`; over the repo with an older reference file it lists entries, and it traverses 86,352 entries) |

---

## D2. Premise contradictions (for the controller)

- **The frozen evidence directory does not hold the raw data it cites.** The register's §C140 header
  sends readers to `evidence/2026-09-13-compose-fidelity/` for the raw reports. Two instruments behind
  its numbers are not there:
  - `findings/1b-census.jsonl`, cited by the frozen `reports/1b-census.md`, survived only on a dead
    tmpfs (c9 now holds the one real-disk copy);
  - the instruments behind ③'s "~44/176" (verify-dm `inkov*.py`, 1d `analyse.py`) are gone, and c3 had
    to rebuild them. ≥30 px reproduced; ≥100 px did not (19 vs 23).

  Whether `c9/inherited/1b-census.jsonl` and c3's rebuilt instruments go into the repo is the
  controller's call.
- **c3b was reviewed from artefacts only.** Check c3b's own stated caveats against Headlines 1–3 before
  treating "best: V3" as a finding.
- **Register ⑩ said "artwork-side, not the composer"**: correct. But **⑩ and ④ are different steps**
  (c10), and ⑩'s fix is not picked up by `--stale`.

## E. Questions only [USER] can answer (with the evidence that makes each a real choice)

1. **Shrink floor.** [USER] flagged 6.75 pt (row 32) and called 8.5 pt "Fine" (row 33); 7.25–8.25 pt is
   unreviewed. Any floor between 6.5 and 8.3 pt flips c3b's best from V3 (4 blocks at 6.0–6.25 pt) to V3L
   (5 arrow labels off the page, 12–405 px). And for the single-word-floor blocks (e.g.
   `Prósentusamsetning` 83.2 pt in a 52.5 pt box), is overhang ever acceptable?
2. **Schematic boxes.** Per-line centring (c3b V1+), a left-aligned block centred in the box, or the
   source's constant 11 pt indent?
3. **OPEN labels.** Should the source line count win over sz0, down to the floor? It would hold rows
   14–19, 21, 24 and 31 at 8.0–9.0 pt by geometry. Or should a gained line be allowed where there is room,
   as map7 b5 does today with [USER]'s "Fine"?
4. **⑨ vs ⑭** (from c9). Kept numeric labels have no card: an automatic rule, a card, or accept points?
5. **Publication of the recomposed ch03 figures.** Exocytosis may not load; the mass tables regress
   commas → points against what is served; brain gains the outline. Hold until ⑨/⑩ land and row 11 is
   diagnosed?
6. **Owner for the panel's double-space decimal false positive** (c9 Surprise 4), which can undo E on
   HClsoln via `Nota`.
