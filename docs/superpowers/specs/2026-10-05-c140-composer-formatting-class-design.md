# §C140 — the composer formatting class: seven mechanisms, one `COMPOSER_VERSION` '6', and the rulings they need

> **FROZEN DESIGN RECORD — banner-dated 2026-10-05.** This record is evidence, not status. Status lives in the campaign register (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 and its ⏩ RESUME). If this document disagrees with the register, the register wins.
>
> This is the design, not the implementation plan, for "the composer plan for the formatting class". The register's 2026-10-04 blocks schedule it after figure review's wording class. Every number below was measured at `00bdf00da` on `content/c140-figure-review-wording`. Nothing cost money (0 ISK), and `git status --porcelain` was empty before and after every agent.
>
> **Off-repo evidence** is under `~/.cache/namsbokasafn-audit/c140-composer-design/`:
> - `finish/<M>.finish.json` (×7: `M1-row-breaks`, `M2-blank-lines-held`, `M3-height-and-ruleE`, `M4-align-pitch`, `M5-scripts-italics`, `M6-serif-symbols`, `M7-width-bound`). Each one holds that mechanism's causes and interventions, final design, patch paths, corpus blast radius, tests, rulings, risks, interactions and unfinished work.
> - `finish/integrate.finish.json` (the combination) and `finish/grades.json` (the visual grades).
> - Per-mechanism scratch trees, each with a dated log `FINISH-NOTES.md`: `m1-row-breaks/`, `m2-wsline/`, `m3/`, `m4-align-pitch/`, `m5-formula-transfer/`, `m6-symbol-font/`, `m7/`.
> - The patches. Each applies with `git apply --check` on `00bdf00da`:
>   - `m1-row-breaks/final/m1-row-breaks.diff`
>   - `m2-wsline/final/m2.diff`
>   - `m3/final/m3-height-r9.diff`
>   - `m4-align-pitch/final/m4-align-pitch.diff`
>   - `m5-formula-transfer/ftt-cand/m5-design.diff`
>   - `m6-symbol-font/fin/patch/m6-v4.diff`, plus `composer-version-6-SHARED.diff`
>   - `m7/final/figcontainers.py.diff`
> - `integrate/` holds:
>   - `tree/`: the combined tree. It is a scratch git repository with one commit per mechanism plus the conflict resolutions.
>   - `base/`: the unpatched control.
>   - `loo-M1`, `loo-M3`, `loo-M4`, `loo-M7`: the leave-one-out trees.
>   - `attribution.json`: for each figure, which mechanisms changed it and whether the combined bytes equal each mechanism's own arm.
>   - `loo.json` and `interact.json`.
>   - `changed.txt`: the 117 changed basenames.
>   - `multi.txt`: the 19 figures changed by more than one mechanism.
>   - `config.ruled.json`, `res/comb/<b>/translated.svg`, `NOTES.md`.
>   - `tri/`: the 118 triptychs.
> - `shared-prep/`: 453 chemistry figures prepared deterministically, with `shared-prep-sources.json`.
> - `salvage/`: the reconstruction made after the crash.
> - `m6-symbol-font/stix-official/`: the three new official STIX faces. They are never committed.
> - The diagnosis that started this work: `~/.cache/namsbokasafn-audit/c140-figure-review/diagnosis-checked-summary.txt`.
> - Three adversarial reviews of this record (fidelity, regression, completeness) and their crops, in `spec-review/`.
>
> **How it was produced:**
> 1. Seven investigators, one per mechanism, started at 2026-10-04 23:14Z on a shared prepared corpus.
> 2. The VM ran out of memory and **no investigator returned a report.** The salvage brief records memory pressure from 00:34, transcripts stopping at about 00:43, and the machine dying at 06:03 on 2026-10-05.
> 3. A salvage run of 14 agents rebuilt each investigation from its scratch artifacts and condensed transcripts. Each mechanism had one reconstructor and one adversarial verifier, which checked every finding the investigator had claimed.
> 4. Seven finish agents then completed the mechanisms under a memory cap: one compose process at a time, in the foreground, with free memory checked before each run. Each one produced red-first tests and a blast radius over all 451 chemistry sidecar figures.
> 5. An integration agent applied all seven patches to one tree and composed 451 of 451 figures. It attributed every changed figure in two ways: by byte comparison with each mechanism's own arm, and by leave-one-out arms. It then rendered 118 triptychs (source | published | combined).
> 6. A grading pass gave each triptych a verdict.
> 7. Three adversarial reviews checked this record against the inputs. The review record is at the end.
>
> Where the salvage and finish reports disagree, the finish report is the later measurement, and this record uses it.

**Units used throughout:**
- A *figure* is one `books/efnafraedi-2e/media/<b>_IS.svg`, judged by its bytes.
- A *key* is one sidecar block key.
- A *record* is one `figlayout.decide` call, i.e. one laid-out block.
- A *label* is one laid-out translated block as drawn.
- *Base* is the composer at `00bdf00da`. Its compose reproduces the published media byte for byte on 450 of 451 sidecar figures. The exception is `CNX_Chem_03_01_brain-ec0b`, whose published copy went through `figure-run.js`'s ring gate. It is excluded everywhere below as pre-existing.
- *Published* means the current `books/efnafraedi-2e/media/` copy, i.e. the '5' recompose. It is **not** the June copy that [USER] compared against in the 2026-10-04 verdicts. Where the June copy matters, this record names it.

---

## 1. The problem

### [USER]'s verdicts, quoted verbatim from the register

From the 2026-10-04 per-figure verdicts (review page `XDA4dwD64t7knou47KSawJ`):
- `05_01_SolTherm1` — **fix-in-review**: *"Keep the June copy as base, align left for each split term and use Útblástursgufa for Exhaust steam."*
- `05_02_FoodLabel` — **fix-in-review**: *"The June copy is better despite some layout problems. Here is the page with official instructions for labelling. A couple of images contain the correct phrases. https://www.mast.is/is/matvaelafyrirtaeki/merkingar/naeringargildi#hvad-a-ad-koma-fram-i-naeringaryfirlysingu"*
- `05_03_Systemqw` — **fix-in-review**: *"Use June as base (the font on the symbols doesn't look right, it appears OpenStax uses sans serif in the lables, but serif in symbols and formulas). qout - qút qin - qinn won - wá wby - waf"*
- `06_05_CovalradiT` — **fix-in-review**: *"Use new as base, however, the /2 numbers are in smaller font and the baseline is higher in the original."*
- `10_01_PentIso` — **fix-in-review**: *"Wrapping is fine, but n- should be italic."*
- `14_02_phscale` — **fix-in-review**: *"Fix the wrapping as suggested. Bleach should be "bleikiklór"."*
- `18_07_Nitrogen` — **fix-in-review**: *"Alignment in the current (new) image is fine, except for the superscript. […]"*

From the 2026-10-04 22:14–22:23Z answers (review page `TUtuTf1uqJ8xWEysBETJeX`):
- phscale **problem**: *"(edik) is on the wrong line - moved down one / vatn is also on the wrong line"*.
- Nitrogen **problem**: *"Ion charges are not in superscript"*.
- FoodLabel R1 **"% af RDS (RDS is ráðlagður dagskammtur)"**; FoodLabel rows **apply**; FoodLabel bullets **yes**.
- "[USER] then asked whether FoodLabel's layout can be fixed at all." §4 answers this (FoodLabel), and R-21 is the choice that follows from it.

The register also logs the class as *"flattened sub/superscripts in Systemqw, Relation, Nitrogen, Manometer; `cis-`→`sis-` italic; SolTherm1 size; MYdCmIn position; phscale/PentIso/CovalradiT wraps"*. Four items in that list are out of reach here:
- **Relation, Manometer and MYdCmIn are kept June copies with no sidecar.** The composer never draws them, so none of the mechanisms here can reach them.
- **`cis-`→`sis-`** is not addressed. No sidecar value spells *sis-* (grep, 2026-10-05). Three sidecar figures carry *cis-*: `19_02_cistrans`, `19_02_Coen2Cl2` and `20_01_geoIsomers_img`. None of them has an unformatted entry under base or under M5, and the combined SVGs draw *cis* in italic. The item is therefore either in a kept copy or already drawn correctly.

### What '6' does to each figure the verdicts name

- **Changed by '6':** SolTherm1 is **not** changed (it is byte-identical; §7.6, R-18). FoodLabel, Systemqw, CovalradiT, PentIso, phscale and Nitrogen are changed (§3, §4).
- **Nitrogen:** the five wording terms were applied in `e52bde89a`, and the published panel already shows *Nítrandi bakteríur*. '6' fixes the charges (M5 + M6). It also moves labels that [USER] called fine. They are re-centred by about +2 to +4 pt, and M1 re-breaks the Decomposers label onto the source rows. The register had logged that re-break as a defect.
- **PentIso:** '6' makes *n* italic, as [USER] asked. It also re-cuts the wrap [USER] accepted (R-20).
- **Unchanged by '6':** saltMass, ZnSStrctr, NaClStrctr, Icepack (ch11) and IcePack (ch05). None of them is in `integrate/changed.txt`. Their values were applied in `e52bde89a` / `37681bf72`.
- **Kept copies, skipped by `figure-run.js`:** MattType, MYdCmIn, Archery, TetOctHole, Butane_img, Entropies, Relation, ex1_16_img and Manometer are in `keptCopies`, so neither the sidecar pass nor the textless recompose touches them. Manometer was fix-in-review (*"review the font/size of the greek letter"*). [USER]'s later re-font answer for it was *same*, with no comment, so no ρ fix is open here.

### The defects behind the verdicts (each confirmed by an intervention)

| Defect | Figures named | Mechanism |
|---|---|---|
| A min-max width partition re-cuts the flat value and ignores where the source breaks between items | phscale *(edik)* and *vatn*, Nitrogen Decomposers, HazDiamond, FoodLabel serving size | M1 |
| A visual line that holds only U+0020 counts as a line. The ruled bullets are refused, *meira* collides with *hátt* (*erhátt*), and the validator and composer disagree | FoodLabel | M2 |
| The cell height budget (pad 2.0) refuses the source's own line count, and R9 splits *(228 / g)* | FoodLabel serving size, *Byrjaðu hér* | M3 |
| A single-line label is guessed as centred where the source is a left column. Multi-line labels are drawn at 1.222 × size instead of the source pitch | FoodLabel table, phscale *appelsínusafi*, FracDistil | M4 |
| Subscripts, superscripts and italics are not transferred. The cases are an inverted base, a phrase spanning a space, a glued charge, a leading italic prefix, an italic compound prefix and a translated script tail | Systemqw, CovalradiT, Nitrogen, PentIso *n-*, FoodLabel *Trans* | M5 |
| Kept STIX Italic/Bold/BoldItalic runs are drawn in sans (FigIS); only Regular is drawn in STIX | Systemqw formula | M6 |
| One stroked box holds several labels, so every label is drawn on the box centre and they overprint, with no report | CellPhone, CrystalSys, HazDiamond, 8 more | M7 |
| Width-bound labels set below 7.5 pt can never shrink (`size_steps(5, 7.5) = [5.0]`) | FoodLabel margin words, *Hitaeiningar* pair, periodic tables | none (wording or a ruling) |

PentIso's wrap is not in the M1 row. [USER] accepted that wrap, and it was not one of M1's truth keys. M1 changes it anyway (D-a, R-20).

---

## 2. Decisions

Each decision gives the measured cause, the design and its gate constants, the alternatives that measurement rejected, the predicted corpus delta, the tests and the risks. Gate constants are module constants read at call time.

How well "gate off = base" was shown differs by mechanism:
- M1 (`M1_ANCHORS = False`): 201 of 201 figures equal to published, on the corpus.
- M3 (V0): 0 of 2,667 `decide` calls differ, on the corpus.
- M7 (`None`): shown in unit test C2 only.
- M4: asserted in its report, not measured on the corpus.
- M5 and M6: their scratch environment gates were checked by test suites, and M6's gate also on 7 figures. Both gates must be hardwired before shipping (D-f, D-g), so they are not ship-time off switches.
- M2: no gate (D-b).

### D-a. M1: source-anchored row cuts, applied after selection

**Cause.** At the chosen count `n == n_src >= 2`, `figlayout.decide` draws the min-max balanced partition. That partition minimises the longest line and knows nothing about where the source breaks between items. The line count is right, but the cut is wrong.

The intervention was an anchored cut applied after selection:
- Base, drawn by the patched modules: 0 of 32 partition-class truth keys right (control: 201 of 201 figures have text equal to published).
- Arm A (anchored, no size change): 19 of 32 fixed.
- Arm B (anchored, may shrink): 28 of 32 fixed.

**Design (arm B).** `decide` chooses count and size exactly as it does today. Then `m1_anchor()` runs when all of the following hold:
- `n == n_src >= 2`.
- `cues['texts']` is present. These are the texts of the visual source lines, added by a one-statement `compose.py` hunk just before `layout = FL.decide(...)`.
- The source has an anchor. An anchor is a line that OPENS with `(`, a list marker, a digit or a symbol token; a line that CLOSES with `)`, `:` or `,`; or a line that is a single token.
- The anchor token occurs the same number of times in source and value. Occurrences are matched by ordinal.

`m1_anchor()` then draws the min-max partition with every anchored boundary fixed:
- R9 and (A) bind only the free cuts, in `decide`'s own mode order. R9 says a 1–2 character symbol binds to the word after it ([USER] 2026-09-13, amended 2026-09-14). (A) says a symbol that ends a box or cell label may not stand alone on the last line ([USER] 2026-09-15).
- The partition is used if it meets the step's width budget at the chosen size. If it does not, it is used at the largest smaller size, down to the floor, at which it does. If no size works, the base partition is drawn.
- The hook sits before the box `top` and the open `top`, so a shrunk box label is centred for the size actually drawn.
- The rule never changes the line count and never changes `step`. It adds a report key `m1 = {anchors, spans, bound, shrunkFrom}`.

Gates, all in `figlayout.py`:
- `M1_ANCHORS = True`.
- `M1_ANCHOR_SHRINK = True`; False gives arm A.
- `M1_ANCHOR_OVER_R9A = True`: an anchored cut is exempt from R9 and (A), at that cut only.

Where the code goes:
- `figlayout.py`:
  - the constants, after `SHORT_TOKEN`;
  - the functions `anchor_kind`, `_anchor_match`, `source_anchors`, `_anchored_cut`, `m1_anchor` and `_m1_modes`;
  - one hook in the box/cell branch after the assert, and one in the open branch before the iv-gain/top block;
  - a 2-line override after `spans = P.cut(...)`;
  - `m1` in the return dict.
- `compose.py`: `cues['texts']`.

**Rejected, by measurement:**
- **Anchors as hard constraints inside the count/size search** (`rec`/`hard`/`hard-e`). recycle Yogurt went from 2 to 3 lines and factory from 3 to 4 lines (*Hvatahólf / 400 / til / 500 °C*), and 6 figures crashed (TypeError at `figlayout.py:215`). The post-selection hook gets the same 28 fixes with 0 count changes and 0 errors.
- **A soft proportional cut** (`prop`/`anchor`/`shadow`). It fixed 15 or 21 of 32 and moved 68 keys, 41–43 of them prose, with real damage to prose (FoodLabel footnote, *Met. / fita*).
- **A per-line or cumulative soft rule for free cuts.** The investigator who died measured it under a different anchor rule, and nobody re-measured it. It reaches the HazDiamond special-hazard list, but it moves 55–65 keys (24–32 of them prose) and re-breaks the FoodLabel footnote.
- **A structural "items" classifier as the gate.** It flags 29 of 406 prose keys and misses 4 of the 35 broken ones.

**Predicted delta (M1 alone).** 36 keys in 26 figures change, with 9 size reductions, 0 count changes and 0 errors. This is over the 201 figures that have a `|` key. The other 250 sidecars have no multi-line key and are inert by construction (`n_src < 2`). heldplan's `decide` call is inert too (`n_src = 1`, no texts).

Figures, by key, before → after:
- HazDiamond: flash points onto the source rows at 9.0; reactivity ratings onto the source rows at 9.0 → 7.5.
- spin: *Snúður + , / snúður upp*.
- KMT2: *… / Fleiri gassameindum bætt við / = Aukið rúmmál*.
- refinery: Small list at 9.0; Large list at 9.0 → 8.25.
- FracDistil: Large list at 9.0; Small list at 9.0 → 8.5.
- The 12_07 tick figures: Exercise4a *0 / Framvinda efnahvarfs*; Exercise4b, 5a, 5b and Rxndiagramex *5 / 0 / Framvinda efnahvarfs*.
- phscale: *límónusafi / 1 M CH3CO2H (edik) / magasýra*, with its subscripts kept.
- CylGold and CylRebar: *„Upphafs“ rúmmál / = … ml*.
- NaCation: *Kjarni / (11 róteindir, / 12 nifteindir)*.
- glycinemass ×3: *heading / (unit)* at 8.75, 7.75 and 7.75.
- AcidpH ×3: *Veik sýra / Ka = …* at 9.0 → 8.5.
- Atmosphere, Lead and alkanes ×2.
- Nitrogen Decomposers: *Sundrendur / (loftháðar og loftfirrðar / bakteríur og sveppir)*.
- Changes beyond the truth keys:
  - Egeom *öll horn / 109,5°*.
  - PentIso *Lítill snertiflötur, / veikasti aðdráttarkrafturinn*. **This reverses a wrap [USER] accepted** (*"Wrapping is fine"*), and line 2 now runs into the isopentane header (§4). It is pending R-20.
  - SmokeAlarm.
  - potassium *Mól / K atóma (mól)*.
  - IntIonst ×3 (neutral).
  - The CellPhone battery body (unclear on its own; it resolves in combination, §3).
- Residuals, by construction:
  - phscale *hreint / vatn blóð*, the HazDiamond special-hazard list and aldket, because no verbatim token marks the boundary.
  - Example2, which is anchored but misses its 92.3 pt step-ii budget at every size down to 7.5.
- Artifacts: `m1-row-breaks/fin/blast-radius.json`, `fin/list-B.txt`.

**Tests.** The file is `m1-row-breaks/final/test_m1_final.py`, with fake widths. It is meant for `experiments/figure-text-translation/`.
- Red on base, shown:
  - T1 tick key.
  - T2 R9A gate.
  - T3 NaCation.
  - T4 shrink to 8.75.
  - T7 box top recomputed at the drawn size.
  - T8 `source_anchors` ordinal/count/token.
  - T9 an anchored override keeps R9 on the free cuts.
- Controls that pass on base and final:
  - T5: with shrink off, the base cut and size are kept.
  - C1: the FoodLabel footnote's *2,000* ending a wrapped line pins nothing.
  - C2: no texts cue gives the same result as gates off.
  - C3: factory's infeasible anchor set gives base.
  - C4: a box already on its rows is untouched.
- Mutation probe:
  - *r9-exempt-off* survived the first suite, so T9 was added; T9 now kills it.
  - C1 kills *whole-line-off*, T8 kills *count-eq-off*, T4 and T7 kill *shrink-ascending*, and T7 kills *hook-after-top*.

**Risks:**
- After a shrink, `step` still reads `i` or `fit` while `size < sz0`. figlayout's own contract defines open step (i) as "`n_t` at `sz0`" and shrinking as `iii-*`, so this value is wrong. Only `layout['m1'].shrunkFrom` and compose's `sz0->size` line record the shrink, and no report consumes them (§9.8). The implementation either sets `step` honestly or surfaces `m1.shrunkFrom` in compose-report.
- Count equality reads the whole value. An unrelated edit elsewhere in the value (a digit, a comma or a bracket) can switch an anchor on or off and re-cut a label. If the MT converts a unit (°F → °C) and so changes a pinned digit, the anchor drops silently.
- A digit that OPENS a wrapped prose line pins the cut (IntIonst ×3); a digit that closes a line does not. Prose exposure: 7 keys.
- Siblings end up at mixed sizes after a shrink (glycinemass header row 9.0/8.75/7.75/7.75; HazDiamond 7.5 beside 9.0).
- The letter of rule (E) is violated on 3 box keys (HazDiamond ×2, CellPhone); see ruling R-6.
- Text against artwork and frames was never checked. The M1 bbox census compares text with text only, so it cannot see a label running into a neighbouring open label (PentIso).

### D-b. M2: a whitespace-only visual line folds into its neighbour, and the validator agrees with the composer

**Causes:**
1. `figtext.visual_lines` treats a visual line that draws only U+0020 as a line of its own. That space is the next row's indent space, which `group()` attaches to the block above. So FoodLabel `more is| ` gets `n_src` 2, *meira* and *er* are drawn at x 385.611, and *er* lands on *hátt* (*erhátt*). The intervention (the fold) gives one element, *meira er*, at 389.611, 131.908, which equals the source x and baseline.
2. [USER]'s ruled one-line bullets cannot be applied. heldplan requires the value's line count to equal `len(visual_lines)`, which is 2, and heldvalues forbids an empty line or one with edge spaces. On base the figure is refused: EXIT 1, `heldErrors` `line-count {value 1, visual 2}` on blocks 42 and 44. After the fold the result is EXIT 0, and *• 20% eða* is drawn at 385.611, the source x.
3. The CI validator (`tools/lib/figure-config-validate.js`) bounds a value's lines by `k.split('|').length`, which counts the blank segment. So CI passes a two-line bullet that composes into a collision. It also passes a value equal to the ink text, which compose refuses.
4. The salvaged candidate (arm B) also changed `figcontainers.own_line_frames` to ink frames. Only `cell_alignment` and `open_alignment` read that function, so arm B moved 3 alignment decisions (left → right/center/center) and drew *meira er* at 388.774, off the source x.

**Design (arm C):**
- `figtext._visual` folds every U+0020-only visual line into the line before it, or into the next line when it is the first.
  - The fold is the identity when no line is blank, or when every line is.
  - NBSP and `\x1f` are not blank.
  - `is_blank_line(t)` is `t != '' and set(t) == {' '}`.
  - It exposes `visual_lines` (folded), `visual_ink` (folded, without the blank runs; used for geometry) and `visual_lines_unfolded` (base's lines; used for alignment frames only).
- `compose.py` takes the cues (`n_src`/`starts`/`ends`/`projs`) from `FT.visual_ink`. `draw_held` draws a changed line in the font and fill of `inks[li][0]`.
- `heldplan.plan_block`:
  - the unchanged test compares against the ink text, source or localised via `pos[id(r)]`;
  - layout uses the ink runs;
  - the `layout` entry carries `vfull`, so the caller's offset sum stays right.
- `figcontainers.own_line_frames` reads `visual_lines_unfolded`, so every alignment decision stays base's.
- The validator's `keyLines` counts only key segments that are not U+0020-only (all segments when every one is blank). The equals-key check also runs against the ink segments.
- There is no gate. The fold is the identity on 11,197 of 11,200 chemistry blocks by construction (`consec.py`). Block keys are untouched, because `blockkey` stays on `FT.lines`. The compose-side key multiset equals the emit-side keys on 451 of 451 figures (11,173 keys), including the 5 keys with a U+0020-only segment, so no bought key moves.
- **It amends a contract recorded in a frozen design record.** Spec 2026-10-03 D-b says "the value's line count must equal `len(FT.visual_lines(block))`", and refusal 4 enforces it. `figure-text.config.json`'s `_heldBlockValues` README says the same. The amendment is [USER]'s to make (R-17). **The 2026-10-03 spec is not edited.** It is frozen evidence, and this record supersedes it on this point. The live owners move in the same commit as the code: the `_heldBlockValues` README, the `heldplan.py` module docstring, the `figtext.visual_lines` docstring and the register.

**Rejected:**
- **Arm B** (ink frames for alignment): it moves 3 alignment decisions and draws both labels off the source x.
- **Arm A** (fold in `visual_lines` only, no ink geometry): the geometry keeps the indent space. It also accepts the English ink text as a CHANGED line, which would then be re-laid in English (red-first 8/10).
- **Widening `group()` row adjacency from 2.5 to 2.7** (the indent gap is 2.61): blocks go from 47 to 44, keys merge, and the bought keys `is low`, `more is| ` and `high` are orphaned.
- **The diagnosis's route-1 pieces**: heldplan mapping value lines onto non-blank source lines, plus a compose dispatch "OR the block has a whitespace-only visual line → draw_held". These are a competing implementation of the same fold. The fold reaches both the held path and the translated path with no change to the dispatch.
- **Values that fill the blank line** (NBSP, U+200B, or a real second line): either refused (edge-space, invisible-line), or accepted and drawn onto *er lítið*.

**Predicted delta:**
- Under the committed config, exactly 1 block in 1 figure changes pixels: FoodLabel `more is| `.
- Under [USER]'s ruled bullets, FoodLabel composes instead of being refused.
- Census over 453 of 453 prepared figures: 8 U+0020-only `FT.lines` and 3 changed blocks, all in FoodLabel. The integrated compose confirms that M2 changes no other sidecar figure.

**Tests:**
- `m2-wsline/tests/test_m2_blank_lines.py` has 17 checks. Its fixture is 11 verbatim FoodLabel runs.
  - Base: 8 of 17 (red: T1, T1c, T2, T4c, T5, T6, T6b, T7, T8). Arm B: 16 of 17 (fails T9). Final: 17 of 17.
  - Controls that pass on every arm: C1 (keys unmoved), T1b, T3 (`\x1f` is not blank), T3b (NBSP is not blank), T4, T4b and T10.
  - T9 (alignment = base) is a control that passes on base and final and fails on arm B, which is exactly what it guards.
- `tests/e2e_m2.sh` has 6 compose assertions: base 1 of 6, arm B 4 of 6, final 6 of 6.
- `js/cases.mjs` (the validator): base 4 of 6, because V2 (two-line bullet) and V3 (value == ink) both pass CI; final 6 of 6. The repo's `figure-config-validate.test.js`, re-pointed at each copy, passes 136 of 136 on both.
- Mutations:
  - a `strip()`-based blank test → T3/T3b red;
  - the heldplan unchanged test against the full line → T8 red;
  - folded frames (= arm B) → T9 red;
  - cues from `visual_lines` → E1 red.
  - Two hunks are unpinned and are equivalent on the corpus (0 instances): `draw_held`'s font run, and `vfull` in the offset sum.
- Committable split:
  - T1–T4c use the fixture only.
  - T5–T10 and the e2e test read prepared artwork and need a planted fixture (the `test_compose_t23.py` pattern).
  - V1–V5 go into `tools/__tests__/figure-config-validate.test.js`.

**Risks:**
- Only U+0020 counts as blank.
- A blank line in the middle of a block folds upward and lowers `n_src`. This affects 3 blocks in chemistry; other books were not censused.
- The JS `/^ +$/` and the Python `set(t) == {' '}` are two implementations of one predicate.

### D-c. M3: the cell height budget admits the source's own rows; a closing short token may end a line (pending R-19)

**Causes:**
1. FoodLabel's green band is 11.93 pt tall, with source margins of 1.33 and 0.39 pt. Pad 2.0 leaves a 7.93 pt budget. The source sets its 2 rows 5.5 pt apart, but the composer measures and draws them at `sz0 × 1.222` = 6.11 pt. So 2 lines need 10.81 pt and are refused. The 1-line fallback lands 18.7 pt to the left, over *Byrjaðu hér* (an overlap of 20.5 × 5.99 pt).
2. The salvaged `a_pitch` candidate tested height at the source pitch but drew at the lead: it tested 10.2 pt and drew 10.81 pt. The `nodraw` mutant reproduces this, and the final suite catches it (2 FAIL).
3. R9 (symbols bind forward) stops `g)` from ending a line, which forces *(228 / g)* in the ruled spaced value. NBSP does not help, because `figscripts.words` splits on it.
4. Rule (E) of 2026-09-15 merges FoodLabel's 4th vitamin row into *Kalk Járn*. With [USER]'s ruled *Kalsíum* and (E) unchanged, it draws 4 rows with no code.

**Design:**
- **`SOURCE_ROWS`.** It applies in a CELL where `n == n_src >= 2` and the source pitch is below the lead. Its eligibility is M4 P1v's, verbatim: the rows descend by more than 0.5 × sz0, and there is no blank line.
  - The count is then also admitted on height **at the source pitch**. The test is against the vertical clamp interval `[D + min(pad, down), U − min(pad, up)]`, which is the band inside which a cell label's vertical centre may move.
  - When only that test admits the count, the label is DRAWN on the source rows (`lead = pitch`, `top = projs[0]`). What is tested is what is drawn.
  - It is a pure relaxation. It never applies where pitch ≥ lead, to a box (R2), to a source with a blank line, or to rows that do not descend.
- **`R9_CLOSER` is proposed and pending R-19. It is not part of the default until [USER] rules.** Under it, a short token that closes a `(` opened earlier on the label may end a line, and no line may start with it. **This amends R9** ([USER] 2026-09-13, amended 2026-09-14: a 1–2 character symbol binds to the word after it). It adds an exception (`g)` may end a line) and a new backward binding (no line may start with it).
- **`CELL_CLAMP_BUDGET = False`.** It was measured but is not proposed (R-7).
- Rule (E) is unchanged.
- Where the code goes:
  - `figlayout.py`: the gates; `_Partition.cut_allowed`/`_closer`; and in `decide`, `rows_pitch`, `hb_clamp`, `on_rows` and `fits_h`, which `choose`, `first_fit`, the floor-overflow height shrink, `heightFit` and the cell top/lead use; and a new `rows` report key.
  - `compose.py`: the `blank` cue, byte-identical to M4's hunk.

**Rejected:**
- `a_pitch`: it has the measure/draw mismatch, and it is stricter than production where pitch > lead.
- `a_admit` (`hb = max(hb, glyph_h(n_src, sz0))`): it fails 11 existing `test_figlayout` tests.
- `CELL_CLAMP_BUDGET` alone: it cannot fix FoodLabel (10.81 > 10.2), and it changes 6 one-line labels, including a Solardist regression.
- A box clamp budget: it touches R2's text.
- Rule (E) off, or exempted for the source count: Eoff and Esrc are identical on 451 figures, with 1 improvement (already moot) against 10 regressions.
- "(E) exempt when W == n_src": it also fires on SciMethod, where it is a regression.
- `_items`: 0 of 2,709 committed values carry `\n`.
- *(228g)*, or dropping the brackets: `R9_CLOSER` keeps [USER]'s spacing instead.

**Predicted delta:**
- 2 records in 1 figure:
  - FoodLabel BI4 serving size: 1 line at x 269.17 → 2 lines at the source x 287.87, lead 5.5, top 206.12.
  - BI30: *Byrjaðu hér* → *Byrjaðu / hér* on the source rows. **Residual:** the arrow tail still crosses *Byrjaðu*. Base crossed it too, while also lying under the serving text. The label is also centred where the source is left-aligned.
- `R9_CLOSER` makes 0 decisions on committed values. It fires on the ruled FoodLabel value. M3 alone then gives *Skammtastærð 1 bolli (228 g) / Fjöldi skammta í pakkningu 2* at step fit, with no height overflow note. Without `R9_CLOSER`, M3 alone draws *(228 / g)*. In the combined tree M1's `)` anchor also acts on that break (§3, interaction 3), so the result under '6' with R9_CLOSER off is **unmeasured**.
- The rows-eligible population is 12 cell records in 3 figures (FoodLabel, Amontons2, recycle).
- Artifact: `m3/final/blast-radius.json`.

**Tests.** The file is `m3/final/test_m3_final.py`. Its cells are derived from the source frame in the same way `figcontainers.source_frame` derives them.
- Red on base, shown: [a1] keeps 2 lines; [a1] drawn on the source rows; [c1] *(228 g)* ends line 1; [c5] no line starts with *g)*; [ac1] the ruled serving value. With the gates off, the same set is red. Final: ALL PASS. [c1], [c5] and [ac1] pin `R9_CLOSER` and drop out if R-19 rules it off.
- Controls that pass on base and final:
  - [a2]–[a9]: n_src+1 is still refused; forced 3 lines are named on the height axis; the decision is identical to base for pitch == lead, pitch wider than the lead, a box, a blank source line, a 1-line source, and margins ≥ pad. [a9] also asserts that the test is not vacuous.
  - [b1]–[b3]: (E) still merges; *Kalk Járn* is merged; *Kalsíum* gives 4 rows.
  - [c2]–[c4].
- ⚠️ The existing `test_figlayout.py` passes but is **vacuous for `SOURCE_ROWS`**. Its `cues()` defaults the pitch to exactly `sz0 × 1.222`, and its `cell()`/`box()` hard-code margins of 5.0. Only `test_m3_final.py`'s derived fixtures exercise the rule.

**Risks:**
- The admission has zero slack. On both FoodLabel records, the clamp interval minus the source rows is exactly 0.0 (EPS 1e-9). That holds only because `source_frame` and the cues share ASC/DESC/projs. A future change to `source_frame`, for example to measured glyph bboxes, would stop admission silently.
- `heightFit` now reads True for a block drawn on the source rows even when its lead-based glyph exceeds the pad budget. Only the new `rows` key says why, and nothing consumes that key.
- The blank-line exclusion depends on the `blank` cue.

### D-d. M4 (A2v): a single-line label guessed as centred takes the side of its source column

**Causes:**
1. `cell_alignment` centres any single-line cell label whose far/tight margin ratio is below `CELL_RATIO = 20`. `open_alignment` centres one whose sibling cue is not one-sided. Neither function looks at the column the label sits in. FoodLabel block 7 *Heildarfita 12 g* was drawn centred at x0 285.17, outside the frame at 286.83.
2. A column rule that counts any same-rotation block (the dead investigator's A2) sees grid coincidences. It fired on 142 records in 22 figures, about 65 of them periodic-table element names that are centred in the source (copper: R8 against C7).

**Design (A2v).** `figcontainers.column_side` is hooked at the end of `cell_alignment` and `open_alignment`, and `container_for` passes it `index` and `blocks`.
- It counts sibling LINES whose edge coincides, within `SIBLING_TOL`, on EXACTLY ONE of left, centre and right.
- Left and right count only lines at the label's first-run size (± `COLUMN_SIZE_TOL`). Centre counts lines at any size and acts as a veto.
- It fires when a side has at least `COLUMN_MIN` blocks and more than the opposite side, and centre support is 0.
- Gates: `COLUMN_ALIGN = True`, `COLUMN_MIN = 2`, `COLUMN_SIZE_TOL = 0.05`.

**Rejected:**
- A2 as written (above). The C-1 control shows the problem.
- Same-size majority variants: they still flip samarium, plutonium, nobelium and ytterbium.
- Per-block exclusivity: drops FoodLabel's Footnote.
- Centre at 0 at any size with left/right at any size: keeps rutherfordium and Name.
- A1, exact-edge multi-line alignment (it would move FoodLabel block 30 *Start|here*): it is byte-inert on the targets, and it flips the held OX precondition from centre to right (`test_compose_held`).
- A3 (boxes keep the source's left/right): breaks `test_compose_t23` L1, which pins R2.

**Predicted delta.** 92 records in 18 figures, every one moving from centre to left: 90 laid out plus 2 from heldplan. The census prediction `a2v-predicted.json` matches the corpus arm on 90 of 90.

Figures:
- The periodic legends: 00_AA_PeriodicPU_img, 01_03_PeriodicPU, 02_05_PerTable1, 19_01_PeriodicEConfig, 18_01_PeriodicPU3. In the periodic tables, only the legends fire.
- BombCalor.
- FoodLabel blocks 7/11/19/40/43/46 (*Heildarfita* at 288.0, *Mettuð fita* at 294.08).
- HybrdOrbit.
- phscale: block 57 *hlutlaust*, block 68 *appelsínusafi*, and the 2 held *10⁰ eða 1* records.
- corresp, strong (12 names), indicators, Scenarios, AlkalineBat, alkyls, recycle, FunctGroup_img and RadonExpos.

**One regression.** phscale *hlutlaust*, now at the source x 385.61, crosses the pH arrow by about 2.5 pt. On base it only touched the arrow. No A2v predicate excludes it without also excluding FoodLabel block 7.

**Tests.** The file is `m4-align-pitch/tests/test_m4_align_pitch.py`, with 216 KB of fixtures (real runs and base decide records).
- Red on base, shown:
  - A-1 Total Fat → left.
  - A-2 Saturated Fat → left.
  - A-3 Footnote (open) → left.
  - A-4 strong *hydrochloric acid* → left.
- Controls on both trees:
  - C-1: copper stays centred. Under the ungated A2 this control FAILS (copper → right, column L3C7R8).
  - C-2: samarium stays centred. It guards only against a same-size-majority variant.

**Risks:**
- `column_side` compares the first run's size, not `FS.body_size`. The two agree on 90 of 90 records today. 47 blocks open with an 11 pt STIX symbol over a 9 pt body; a column of those would fall back to centre, which fails safe.
- Left alignment grows labels to the right by construction. 33 of 92 records overhang the source end by more than 0.5 pt, and cells do not see obstacles inside the cell.

### D-e. M4 (P1v): a label drawn on `n_src` lines takes the source pitch

**Causes:**
1. Every multi-line label is drawn at `lead = sz0 × 1.222`, centred on the source's mean baseline. Where the source pitch differs, the rows drift off the source rows even when the count is right. Examples: FoodLabel's lower table at 5.5 against 4.888 at 4 pt, and FracDistil at 9.209 against 11.0. Base clipped FracDistil's *Litlar sameindir* off the top edge.
2. A whitespace-only second line counts as a row. The ungated P1 moved FoodLabel block 45 onto block 46 *high*.

**Design (P1v).** In `decide`, after the partition, a label takes `lead = (projs[0] − projs[-1]) / (n_src − 1)` and `top = projs[0]` when all of the following hold:
- `len(lines) == n_src >= 2`;
- the label is not a box and is not at step iv-gain;
- no source line is blank (the new `cues['blank']`);
- its rows descend by more than 0.5 × sz0;
- the span would otherwise be off by more than `PITCH_SRC_MIN = 1.0` pt.

Gates: `PITCH_SRC = True`, `PITCH_SRC_MIN = 1.0`.

**Rejected:**
- P1 with no threshold: 328 records in 147 figures, 16 of them figures [USER] accepted (B34), mostly churn below 0.025 pt.
- Width-based blank detection: a lone *i* is as narrow as a space.
- P1B/P1B1 (box pitch): breaks `test_figlayout`'s box-vertical cases (R2).
- The #92 `heightFit` recompute: nothing outside figlayout reads `heightFit`.

**Predicted delta.** 26 records in 13 figures, with exactly the lead/top values in `m4-align-pitch/final/blast-radius.json`. The census matches 26 of 26 at T = 1.0.
- FoodLabel, lead and top before → after:
  - block 14 (*Less than* ×4): lead 4.888 → 5.5, top 49.6714 → 50.5894;
  - block 15 (the footnote paragraph): lead 4.888 → 4.5, top 79.6474 → 79.0654;
  - block 16 (the lower-table nutrient names): lead 4.888 → 5.5, top 49.0594 → 50.5894;
  - block 38 (*Limit|these|nutrients*): lead 6.11 → 5.5, top 162.6972 → 162.0872;
  - block 41 (*Quick|guide to|% DV*): lead 6.11 → 5.5, top 158.1722 → 157.5622.
- phscale blocks 61/65.
- Exercise25, GasDiff, refinery and the 4 12_07 tick figures.
- FracDistil: lead 9.209, with both side blocks inside the page.
- DNA, DecayS, Exposure2.

**In total, M4 changes 29 figures** (18 ∪ 13, with an overlap of 2). None of them is an accepted figure.

Threshold table (records / figures / accepted figures):

| T (pt) | Records | Figures | Accepted figures |
|---|---|---|---|
| < 0 | 328 | 147 | 16 |
| 0.05 | 97 | 49 | 2 |
| 0.25 | 40 | 21 | 1 |
| 0.5 | 34 | 17 | 0 |
| **1.0** | **26** | **13** | **0** |
| 2.0 | 7 | 6 | 0 (loses FoodLabel 14/15/38/41 and FracDistil 0) |

**Tests:**
- Red on base: P-1, the lower table at lead 5.5 and top 50.5894 (blocks 14/16); P-2, FracDistil at lead 9.209.
- Controls:
  - C-3: MassSpec, whose pitch equals the lead, keeps its lead.
  - C-4: `more is| ` with the blank cue is unchanged.
  - C-5: HazDiamond's box keeps lead 10.998.
  - C-6: FoodLabel block 8 (0.67 pt, below 1.0) is unchanged.
  - C-4+ is a positive control: with the threshold opened, the same cues move without `blank` and stay put with it.
- Under the ungated predecessors, C-1, C-4, C-5 and C-6 all FAIL, so the controls can see what they guard.
- The pinned suites pass under the M4 tree. `test_figure_compose`'s 8 FAIL are identical on base, because the scratch tree sits outside the repo.

**Risks:**
- P1v places rows on the source baselines even where the row content is wrong. Where M1 has an anchor, M1 fixes the content in combination (§3). Where it has none, P1v aligns wrong content to the source rows (HazDiamond, §3 interaction 1).
- Where the source pitch is WIDER than the lead (FoodLabel lower table, 4.89 → 5.5), P1v draws at the source pitch without re-testing height. A unified rule would test at the lead that will be drawn, i.e. M3's `fits_h` generalised.

### D-f. M5: seven narrow script-transfer rules

Each rule places a style only on a candidate it can pin to exactly one occurrence.

| Rule | Measured cause | Before → after |
|---|---|---|
| R1 | Systemqw: the base letter q/w is a STIXGeneral-Italic SYMBOL run and casts no base vote, so the line resolves as `inverted-base` (every style None, body 7 pt) | Fall back to the largest letter-bearing run, symbol runs included, as the base, if that base resolves without larger scripts |
| R7 | Systemqw: the translated tails (*qút*, *qinn*, *wá*, *waf*) no longer contain the token *qout*, so the transfer is `absent` even after R1 resolves the base | A free value word that starts with the base and continues with letters takes the base style, then the subscript style (unique only). Before: *qút* and the others, each flat at 7 pt. After: q/w at 11 pt italic, with a 7 pt tail 2 pt lower |
| R5, R5b | CovalradiT: each raised numerator *266 pm* is ONE 7 pt run that spans a space. Its tokens split into *266* (no-base) and *pm* (ambiguous, because *pm* also stands plain in *= 133 pm*). Base also styled the WRONG *pm* in some values | R5: an equal-style styled stretch that spans a space becomes a PHRASE token and suppresses its parts. R5b: a token whose text also stands unstyled in the same source line is refused. After: the numerators are raised 3.0 pt at 7 pt, and the F label no longer shrinks (8.5 → 9.0) |
| R2, R3 | Nitrogen ×3 and conjugate_img ×1: `FT.lines` splits *(NH4\|+\|)*. `token_lines` attaches only SMALL stacked lines, so *+* is a token of its own (no-base). The MT wire joins lines with one space, so the value reads *NH4 + )* | R2 attaches a glued continuation on the same visual line, for token building only (gap within the stack gap, and \|Δproj\| < `VISUAL_LEAD_FRACTION` × 1.222 × size). R3 matches the value with an optional space at each joint and styles that space `JOINT`; `compose.py` then drops the `JOINT` positions before `FS.words` |
| R4 | Italic prefixes *n-*, *sec-*, *tert-*, *o-*, *m-*: the italic stretch opens the token, so the per-stretch fallback has no left anchor (`no-base`) | Place a leading LETTER stretch by its right anchor at a clean left edge (unique only) |
| R6 | FoodLabel *Transfita 3 g*: the italic *Trans* has no word-bounded occurrence | Place an italic, non-script word of at least 3 letters, in one style, found exactly once at a clean left edge and followed by a letter |

**Design:**
- `figscripts.py`:
  - `_analyse` (R1);
  - `token_lines`, replaced by a new `_token_lines_j` (R2, plus the joint offsets);
  - `source_tokens` (R3 joints, R5 phrases, R5b `srcplain`);
  - `transfer`, rewritten, with helpers `put`, `stretch_fallback` and `tail`;
  - a new constant, `JOINT`.
- `compose.py`, around L655: after `FS.transfer`, drop the positions whose fmt is `FS.JOINT` before `FS.words`.
- The scratch ablation gates `M5_R1` to `M5_R7` are environment variables and **must not ship**. The landing hardwires every rule on, or removes any rule [USER] declines (R-9).
- Block keys are unchanged. Control C2c: `FT.lines` still splits ammonium into 3.

**Rejected:**
- R2 plus editing the 4 values, instead of R3: this gives identical formatting (measured). It stays open as R-9.
- Value edits without R2: these fix 3 of 4, and ammonium stays no-base.
- R1 without R7: this turns 4 inverted-base misses into 4 absent misses.
- R5 without R5b: this styles the wrong *pm*. The R5b arm is red on base.
- Re-preparing figures: this is unnecessary, because the M5 prep is byte-identical to shared-prep in blocks, runs, artwork, svgfix and annotations.

**Predicted delta.** Exactly 10 figures. The prediction was written before the sweep (`prediction-2026-10-05.txt`), and the sweep observed 10 of 10 with 0 unpredicted:
- FoodLabel (R6), Systemqw (R1 + R7), CovalradiT (R5 + R5b), PentIso (R4), conjugate_img (R2 + R3), indicators (R4), Nitrogen (R2 + R3), alkyls (R4), butaneIsom_img (R4), ex1_14_img (R4).
- Corpus `unformatted` entries: 40 in 17 figures → 14 in 7.
- 31 figures whose census changed stay byte-identical.
- CovalradiT residual, seen in the triptych: at the new 9.0 pt, the F label's *=* touches the start of the fraction bar, *pm* overhangs the bar's right end, and only one word space separates *= 64 pm* from *Cl radíus*, where the source has a wide gap. The combined copy is still clearly better than published, whose numerators are struck through.
- Residuals:
  - Correct refusals, because the words were translated away: Amontons2 *o*, Charles2 *o*, VapPress3 *KE*/*T* ×2, SHE *atm*.
  - CarboxEst1 *iso*, which was compounded into a single word.
  - Left for M6: Carbon *×*, and NH3Decomp *=*/*×* (same-size STIX, no-base).

**Tests.** The file is `m5-formula-transfer/tests/test_m5_transfer.py`.
- On base, all 14 rule arms FAIL (R1a–c, R2a/b, R3a/b, R4a, R5a/b, R6a, R7 *qút*, R7 *qinn*, R7c), and all 14 controls PASS (C1, C2a–c, C3a–c, C4a–b, C6a–c, C7a–b). On the candidate, ALL PASS.
- Turning off one rule at a time reddens exactly that rule's own arms. Turning off R1 also reddens R7 ×2 and R7c.
- The R2b assertion was degenerate, and it was replaced by the exact mask `............_^.`.
- **Committed tests that go red by design:**
  - `test_figscripts` S4a–d and B6, which pin Systemqw's unresolved, flat 7 pt behaviour;
  - `test_compose_visual_lines` T1, whose sentinel compares the drawn text with the value; 4 keys now have the joint space elided.
  - Re-pinning them follows from R-9 and R-14 (see R-11).

**Risks:**
- R1 changes the body size from 7 to 11 pt for inverted-base lines whose base letter is a symbol run. These are FillMo, H2MO, He2MO and O2MO (σ/π), Frequency (λ1–3), DispForces (δ+) and CFSE (Δoct). Today all of them are kept or identity blocks drawn run-exact, so the change is byte-inert. A later translated value would be drawn at the larger base, and that is untested.
- R3 makes the drawn text differ from the sidecar value.
- R2 depends on `VISUAL_LEAD_FRACTION` and the stack-gap thresholds.
- CovalradiT's inner space is drawn at 9 pt, about 0.5 pt wider than in the source.

### D-g. M6: STIX Italic, Bold and BoldItalic drawn in their own official faces, in two halves

**Causes:**
1. Composer '5' (§C140 ⑥a) draws a kept STIX run in FigSym only when its BaseFont is STIXGeneral-Regular (`figsym.eligible_base`). Italic, Bold and BoldItalic runs are skipped as `other-face` and drawn in FigIS (Liberation Sans). So Systemqw's U, q and w, which are STIX Italic in the source, come out in sans italic next to a serif Δ, = and +. That mixed look is what [USER] named.
2. The same Regular-only rule applies to styled characters inside laid-out (translated) labels, because `figscripts.SourceStyle` carries no source face.
3. Matching by name only (v1–v3) also redrew runs from 3 STIX objects that are TrueType or CID-TrueType and were never outline-compared: HeatMeas Italic, HeatTrans2 Italic, and Blackbody's Italic Type0 plus a bare STIXGeneral.
4. A "blank run selects no new face" rule (v2) moved 74 blank Regular runs (CrystalSys 72, Frequency 2) from FigSym to FigIS. That is byte churn with no ink.

**Design (v4).**

The two halves:
- **Half A, KEPT runs.** `compose.py`'s kept-run path draws each run in the official face of its own name, under the one FigSym family. This alone fixes Systemqw's formula.
- **Half B, LAID-OUT segments.** `SourceStyle` gains a 4th field, `serif = verified_face(run)`. `compose.lin_advance` measures a serif segment with `figsym.advance`, and the segment is drawn in FigSym in its source face.

Eligibility:
- The three new faces are eligible only from a Type 1 (CFF) object (`meta.fonts[run.font].subtype == '/Type1'`), which is the only kind verified to be outline-identical to the official files.
- Regular keeps ⑥a's name-only rule. No Regular TrueType object exists, so Regular is unchanged by construction.
- Blank runs use v3's condition: `face is not None and (text.strip() or face == Regular)`.

Code:
- `figsym.py`:
  - `FACES`, the four STIX 1.1.0 General faces, hash-pinned (Italic `7f6bf9ca…`, Bold `7e4dfb49…`, BoldItalic `4585fcdd…`);
  - `load_face`, `face_path`, `eligible_face`, `verified_face`, `covers_face`, `advance`, `subset_woff2_face` and `metadata_element(faces)`.
- `svgout.py`:
  - writes one FigSym `@font-face` per (weight, style), in a fixed order;
  - names every embedded face in the licence `<metadata>`. Name IDs 0 and 7 are byte-equal across the four official faces.

Ship form:
- The scratch gates `M6_KEPT` and `M6_SERIF` are environment variables read at import. They **must be hardwired**, so that pixels do not vary with the environment under one `COMPOSER_VERSION`.
- Rename the `m6Layout` report key, for example to `stix.layout`.
- Move the `import figsym` out of the `figscripts` loop.
- Give `load_face`'s refusal the same `FONT_SOURCE_URL` message that `load()` has.

Font files:
- `FIGTEXT_STIX_DIR` (default `~/.cache/namsbokasafn-figtext/stix-1.1.0/`) holds Regular only today.
- **Every box that composes the 60 affected figures needs the three new files there, hash-pinned and never committed.** If a face is missing, such a figure refuses with `FontUnavailable`. That failure is loud, not silent.

**Outline evidence. This closes ㉞ for every Type 1C object.**
- EPS, compared through gs-staged PDFs, with Regular as the positive control for the gs path:
  - Regular: 37 objects, 67/67 glyphs identical.
  - Italic: 44 objects, 84/84.
  - Bold: 3 objects, 5/5.
  - BoldItalic: 15 objects, 28/30 op-identical and 30/30 geometry-identical. The two glyphs that differ are OxStNonmts's plus and en dash: they have the same points and a different contour start, which is a gs closepath artefact.
- PDF: Regular 69 objects, 102/102; Italic 9, 21/21; Bold 5, 11/11; BoldItalic 1, 1/1.
- The wrong-glyph control read 0 in every face.

**Rejected:**
- Name-only eligibility: T4 is red on v3.
- v2's blank rule: T5 is red.
- Verifying the TrueType objects with `tt_compare.py`: it had no control, and Blackbody returned `glyphs: []`.
- Carrying `serif` outside `SourceStyle`: equal-style segmentation SHOULD split a STIX character from a Liberation one, so the 4th field is semantic.
- One combined flag: half A alone fixes Systemqw, while half B touches 7 other figures.
- M6's own copy of the M5 prototype (`M6X_SYMBASE`/`M6X_TAIL` in `tree-m6x`): that belongs to M5's class. **Keep exactly one implementation, M5's.** The integrated tree carries no `M6X`, `M5_R7MODE` or `TAILTRACE`.

**Predicted delta.**
- Exactly 60 sidecar figures change. 391 stay byte-identical, including 24 of 24 random non-STIX controls and the 3 gated TrueType/CID figures. The textless figures are measured separately in §3 (5 change, all by M6 half A).
- 0 blank-run swaps, and 0 changes to `unformatted`, `heldErrors` or `overflow`.
- Items, from `fin/cmp-b0-v4.json` (base → v4):
  - Half A, kept runs, face change only (positions unchanged): 299 FigIS italic → FigSym italic, 60 bold → FigSym bold, 48 bold-italic → FigSym bold-italic.
  - Half B, laid-out segments, in its 7 figures (Frequency, emspectrum, elecw, Egeom, Carbon, HetCats-230a and IonRadSpec): 18 characters change face (10 face only, 8 face and position), and 19 neighbouring segments move in the same face by the advance difference (`fin/cmp-v4kept-v4.json`).
  - The file's total of 309 face-only italic items is half A's 299 plus half B's 10.
- 61 sidecar figures hold a non-blank Type 1 Italic/Bold/BoldItalic STIX run, and 60 of them change. The 61st, Nitrogen, holds such runs only inside translated labels, which M5 then reaches (§3).
- Classes, judged on M6's own 4× crops in Chromium: 17 improvements (letters, Greek, °), 43 sign-only changes judged near-neutral, 0 regressions.
- Artifacts: `m6-symbol-font/fin/blast-radius-v4.json`, `fin/cmp-b0-v4.json`, `fin/cmp-v4kept-v4.json`.

**Tests.** `fin/tests/test_m6_faces.py` is a scratch harness that composes real figures:
- T1: Systemqw's U, q and w are drawn in FigSym italic.
- T2 (control): Δ and *=* stay FigSym normal, and *0* stays FigIS.
- T3: there is one FigSym italic face, and its licence names are clean (control: the official face violates them).
- T4 (gate): HeatMeas's bytes equal the published copy.
- T5: blank runs keep the published family.
- T6 (control): a figure with no STIX equals the published copy.
- Red shown: base fails T1/T3; v3 fails T4; the v2 probe fails T5; v4 passes all six.

Repo tests updated in the patch:
- `test_compose_runexact` S1–S4: a Type 1 STIX-Italic plant is drawn in FigSym italic, and a NEW TrueType plant stays FigIS with reason `unverified-object`. These are red on base and on v3.
- Arity-only updates for the 4th field: `test_figscripts` S5d/HS1-pre compare `[:3]`; `test_heldplan`'s OX_CHARGE gains `serif`; `test_compose_held` CH2e expects `skipped == []`.
- Not written: `test_figsym` counterparts for the new faces (the hash refusal, and a missing-file refusal that names `FONT_SOURCE_URL`).

**Risks:**
- One grader, Chromium only, and no planted control for the 43 sign-only figures. Each figure adds one FigSym `@font-face` per (weight, style) under a single family. Face matching and synthesis are where browser engines differ, and no Firefox or WebKit render exists (§5, §9.3).
- The gate keys on subtype `/Type1`. A future non-CFF Type 1 STIX object would be eligible without comparison. None exists among the 451.
- Systemqw's one Bold object (a blank space) was unreadable by the CFF instrument. This is harmless, because blank Bold runs stay FigIS.

### D-h. M7: a box that holds more than one label is treated as a cell

**Cause.** `figcontainers` classifies any closed stroked path around a label as a `box`, and under R2 every line is centred on the box centre, both horizontally and vertically. When one box holds several source labels (a heading over its body, a table cell, a panel frame, a circle with a nucleus label), every label is drawn on the same spot, and no overflow is reported.

On base, 52 labels in 11 figures overprint with no report. Examples:
- CrystalSys: 18 cell labels piled on their cell centres.
- CellPhone: the heading over the body in all 4 boxes.
- KDataH2O2: the column headers.
- The rest: CathodeRay, HeatMeas, ConsMatter, HazDiamond, HeatTrans2, Qnumbers, eLeveldiag and BorateAnio.

**Design (arm C).** In `figcontainers._container_for`, a `box` that also holds another block's source line goes down the CELL path. `shares_box()` decides what "holds" means: the other block has the same rotation within `SHARED_ROT = 0.5°`, and the centre of its line frame lies inside the box's inner rect.
- On the cell path each label keeps its own source vertical centre, clamped inside the box. Its lines stay centred, on the label's OWN source centre.
- `SHARED_BOX_ALIGN` is `'center'` (the default), `'source'` (arm B: R3's `cell_alignment`), or `None` (exactly today's behaviour).
- `why` gains `+shared`.
- The diff is 61 lines. figlayout, compose, heldplan and the sidecar contract are untouched.
- **The patch is gated on [USER]'s ruling on R2's scope (R-2).**

Integration fix, made by the integrator and not part of M7's design: the `'source'` branch must call M4's `cell_alignment(..., index, blocks)`. M7 called the old 3-argument form, which would silently skip A2v. The fix is inert under `'center'`.

**Rejected:**
- Arm A (keep R2's horizontal centre and move only vertically): 34 fixed, 18 still piled, 1 newly broken (CathodeRay *Hlaðnar plötur*).
- Arm B as the default: it gives the same 52/0/0 as C, but it left-aligns CellPhone's four bodies, which reverses the departure R2 ruled. It is kept as the `'source'` switch.
- Narrower fill-rect cells (`cH`): FoodLabel stays at 12 bad labels, with 1 newly broken. This only turns silent overlaps into named overflows, and it touches phscale and Nitrogen.
- Per-label sub-bands for the height budget: not built, because 0 text hits remain under C.

**Predicted delta.** Exactly 11 figures and 52 labels. Labels move in top and x only; no size or count changes.

| Figure | Labels moved |
|---|---|
| CellPhone | 8 |
| ConsMatter | 5 |
| HazDiamond | 5 |
| CathodeRay | 2 |
| HeatMeas | 6 |
| HeatTrans2 | 1 (plus 1 unmoved label whose hit clears) |
| Qnumbers | 1 |
| eLeveldiag | 1 |
| CrystalSys | 18 |
| KDataH2O2 | 4 |
| BorateAnio | 1 |

- The detector scores every label of every changed figure, before and after: FIXED 52, still-bad 0, BROKE 0.
- Labels overprinting in boxes with no report: 52 → 0. Reported overflows stay at 167.
- Chromium renders of all 11 figures match the source layout.
- Arms B and C differ on 7 labels in 4 figures (`m7/png/B-vs-C.png`).
- Artifact: `m7/runs/final-diff2.json`.

**Tests.** The file is `m7/final/test_figcontainers_sharedbox.py`, in plain Python. `FC_DIR` selects the module under test.
- Red on base, shown (6 FAIL):
  - S1: the heading and body overlap by 58.5 × 8.46 pt.
  - S1: the heading is drawn at top 97.66 against its source 120.
  - S1: neither label is marked shared.
  - S2: three side-by-side labels overlap pairwise.
  - S2: the middle label is centred at 170 against its own 185.
  - S3: a 0.3° neighbour does not share.
- Controls on both:
  - C1: a single label alone stays a centred box (R2 untouched).
  - C1: a neighbour whose line centre lies outside the box does not share it.
  - C1: a neighbour tilted 2° and inside the box does not share it (paired with S3's 0.3° positive).
  - C2 (patched only): `None` restores R2, `'source'` keeps a left column, and `'center'` centres it.
- Corpus counterfactual: 440 figures byte-identical, and the 11 changed ones equal the measured arm C.

**Risks:**
- A shared label takes the WHOLE box as its width and height budget. A longer future translation of side-by-side labels (CrystalSys row 3) could collide with no report. There are 0 hits today.
- Shared detection deliberately counts kept and arc blocks too, because a kept formula under a translated heading overprints in the same way.
- Shared boxes become reachable by every cell-only rule, P1v and SOURCE_ROWS included (§3, interaction 1).

### D-i. Width-bound labels: no composer code in this record

**Cause.** `figlayout.size_steps(sz0, floor=7.5)` returns `[sz0]` when `sz0 < 7.5`, so a label that the source set below 7.5 pt never shrinks. This implements [USER]'s R4 (*"Shrink floor 7.5 pt — no translated label is drawn smaller"*) and R5 (*"A word that does not fit at the floor overhangs and is NAMED … never shrunk further"*), both 2026-09-13. The corpus has 167 reported overflow labels in 33 figures. 120 of them have `sz0 < 7.5`. Nearly all are element names in five periodic tables, plus FoodLabel's *Athugaðu* and *Neðanmálsgrein*.

**Decision.** No composer change. FoodLabel's margin words need [USER]'s wording, or a per-key size override that does not exist (R-15). The periodic tables need a legibility ruling (R-16). Any size route reopens R4 and R5.

Measured and not chosen:
- Floor r2 (0.8 × sz0, only where sz0 < 7.5): 7 figures, 103 labels fixed, 0 broken, with element names drawn at 3.2–3.75 pt.
- Floor r1 (min(7.5, 0.8 × sz0) everywhere): 34 figures change, and about 40 labels shrink from 7.5 to 7.2 pt for only 11 more fixes. It also leaves a float artefact (recycle b26: 7.5 → 7.498).
- A per-key forced size of about 4 pt (the diagnosis's suggestion) is not enough: *Neðanmálsgrein*, *næringarefnum* and *Hitaeiningar úr fitu 110* each need 3.0 pt.

---

## 3. Combination

**Order of application.** The patches were applied with `patch -p1` to the scratch git tree `integrate/tree`, one commit each:
1. M2 `m2.diff`: clean.
2. M4 `m4-align-pitch.diff`: clean, with offsets.
3. M3 `m3-height-r9.diff`: the `figlayout` hunk 1 applies at fuzz 2, because both M3 and M4 add constants after `LEAD`. The compose `blank=` hunk is rejected as already applied, because it is byte-identical to M4's.
4. M1 `m1-row-breaks.diff`: 2 rejects, resolved by hand:
   - the `M1_*` constants go after M3's `R9_CLOSER`;
   - `'m1': m1` goes beside M3's `'rows'` in the return dict.
   The box/cell anchor hook lands after the assert and before M3's `on_rows`/top block. The result equals M1's own `comb/M2-M4-M3-M1` tree except for the order of the constants.
5. M7 `figcontainers.py.diff`: clean, at fuzz 1. Then the integrator's fix to the `'source'` branch (`index, blocks`).
6. M5 `m5-design.diff`: clean.
7. M6 `m6-v4.diff`: clean.
8. `composer-version-6-SHARED.diff`: `COMPOSER_VERSION` '5' → '6', applied once.

The integration measured the configuration below, which is each mechanism's proposal. For R9_CLOSER and for M1's behaviour on PentIso, the default is pending R-19 and R-20.
- M1: arm B with R9A.
- M3: `SOURCE_ROWS` on, `R9_CLOSER` on (pending R-19), `CELL_CLAMP_BUDGET = False`.
- M4: `COLUMN_ALIGN` and `PITCH_SRC` on, `PITCH_SRC_MIN = 1.0`.
- M5: all rules on.
- M6: both halves on.
- M7: `'center'`.

**Conflicts and resolutions:**
- `figlayout.py`'s constants block (M4, M3, M1) and the return dict (M3's `rows`, M1's `m1`): textual conflicts only. Both keys are report-only.
- `figlayout.decide`'s body: M3 sets `lead` to the source pitch, so P1v's span test reads 0 and does not re-fire, and the two stay additive. M1 changes only which words go on which row.
- `compose.py`'s cues:
  - M4's and M3's `blank=` hunks are identical.
  - M2 takes `vls` from `FT.visual_ink`, and M1's `cues['texts']` reads the same `vls`, so the anchors see what the cues see.
  - M5's JOINT elision (about L655) does not overlap M6's kept-face and serif hunks.
- `figscripts.py`: M6's 4th `SourceStyle` field sits next to M5's R1 hunk. M5's R4/R6/R7 index `st[2]`, and R5 compares by tuple equality; both stay correct with 4 fields. Measured: CovalradiT combined is byte-identical to M5's arm, and Systemqw combined is byte-identical to M6's `runs/v4x`.
- `figcontainers._container_for`: M7's `'source'` branch, fixed as described above.

**Interaction effects.** Leave-one-out found each of these:
1. **HazDiamond: M7 lets M4 P1v reach an R2 box.**
   - M7 reclassifies the special-hazard box as a shared CELL.
   - P1v was deliberately excluded from boxes because of R2, but it now reaches this one. It places the 6-line list at the source pitch, 12.15 (M7 alone gives 11.0), so each translated row sits level with a kept code (OX/ACID/ALK/COR/₩/☢).
   - **The rows are on pitch, but from ALK down the content is shifted by one row.** The value breaks *Sýra Basi* onto one line and *Notið / ekki vatn* onto two. So ACID reads *Sýra Basi*, ALK reads *Ætandi*, COR reads *Notið* and ₩ reads *ekki vatn*. *Oxunarefni* and *Geislavirkt* sit correctly. Published had the same wrong content, visibly misaligned. Combined makes the wrong pairing look deliberate on a safety chart (`spec-review/haz_zoom.png`). M1 has no anchor for this list (D-a residual, R-5).
   - SOURCE_ROWS could reach this box the same way, but leave-one-out shows it did not fire here.
   - The mechanism generalises. Through M7's gate, every shared box becomes reachable by P1v and SOURCE_ROWS, which widens both into the class R2 ruled on. It belongs to R-2.
2. **Nitrogen and Systemqw: M5 × M6.** M5 turns STIX-sourced characters (the charges, and the q/w bases) into layout segments, and M6 half B draws them in FigSym italic. Nitrogen's charges shift by at most 0.41 pt against M5 alone. Systemqw equals M6's `v4x`.
3. **FoodLabel serving size: M3 × M1.** M3 admits 2 rows, and M1's `)` anchor then moves the break: *Skammtastærð 1 bolli (228 g) / Skammtar í íláti 2*. Neither mechanism produces this alone. With the ruled sidecar, the second row is *Fjöldi skammta í pakkningu 2*.
4. **Ruled FoodLabel only:** *Kalsíum* restores the vitamin column's count, so P1v moves those 4 rows to the source pitch (y 138.81/144.92/151.03/157.14 → 138.01/144.65/151.30/157.95). M4's census predicted this.
5. **A positive interaction, CellPhone (M1 × M7):** M1 filed the battery body as unclear, because its middle line was hidden under the heading overprint. M7 removes the overprint, and the body then reads correctly.
6. **Predicted but did not occur:** P1v widening on GalvanCu, DNA, Barometer and FoodLabel 39, and SOURCE_ROWS on Amontons2 and recycle. In each case the combined output equals either the single arm or the published copy.

**Total predicted delta: 117 of 451 sidecar figures change.** The list is `integrate/changed.txt`, and the per-figure sets are in `integrate/attribution.json`.
- Combined differs from published in 118 figures. The 118th is brain-ec0b, which is pre-existing and excluded.
- 98 figures are in exactly one mechanism's set. On all 98, the combined SVG is byte-identical to that mechanism's own final arm.
- 19 figures are in two or more sets:
  - For 16 of them, leave-one-out shows pure composition at the byte level: LOO(−m) equals the other mechanism's arm byte for byte.
  - The other 3 activate a mechanism outside their set: HazDiamond (M4), Nitrogen (M6) and FoodLabel (M1).
  - At the item level, `interact.json` shows composition shifts (items in neither single arm) in 13 of the 19, which the byte-level leave-one-out explains. "Pure composition" here is a byte-level claim.
- 0 figures differ with no mechanism behind them, and 0 figures that some mechanism changed came out equal to published.
- Per-mechanism sets, excluding brain-ec0b: M1 26, M2 1, M3 1, M4 29, M5 10, M6 60, M7 11.
- Positive control, which shows that the instrument is not blind: M4 (30), M5 (11), M6 (61) and M7 (12) each have an own arm that differs from published in exactly its handoff count plus brain-ec0b. M1's arm composed only the 201 figures with a `|` key and differs in exactly its 26; brain-ec0b is not among the 201. M2 and M3 had no corpus arm in the integration, so their sets come from their handoffs.

**The checkable list.** Basenames are given without the `CNX_Chem_` prefix. Under the measured configuration, the implementation must reproduce exactly this set. For single-mechanism figures it must also reproduce exactly the bytes of that mechanism's arm.

| Set | Count | Figures |
|---|---|---|
| M1 | 14 | 01_04_CylGold, 01_04_CylRebar, 02_06_NaCation, 03_01_glycinemass_img, 03_02_potassium_img-f1d1, 06_03_spin, 09_01_Atmosphere, 09_04_KMT2, 10_06_IntIonst, 12_07_Exercise4a_img, 14_03_AcidpH, 17_05_Lead, 20_01_alkanes, 21_05_SmokeAlarm |
| M4 | 18 | 00_AA_PeriodicPU_img, 01_03_PeriodicPU, 02_05_PerTable1, 05_02_BombCalor, 08_02_HybrdOrbit, 09_02_Exercise25_img, 09_04_GasDiff, 14_03_corresp, 14_03_strong, 17_05_AlkalineBat, 18_01_PeriodicPU3, 19_01_PeriodicEConfig, 20_01_recycle, 20_02_FunctGroup_img, 20_04_DNA, 21_03_DecayS, 21_06_Exposure2, 21_06_RadonExpos |
| M5 | 4 | 06_05_CovalradiT, 14_01_conjugate_img, 20_01_butaneIsom_img, 20_01_ex1_14_img |
| M6 | 55 | 00_EE_LiqWatAbso, 02_02_AtomModels, 02_02_Millikan, 06_01_Ephoton, 06_01_Frequency, 06_01_emspectrum, 06_03_Oshapes, 06_03_elecw, 07_06_molgeom, 08_02_sp2Geom, 08_02_sp3Geom, 08_02_spGeom, 08_04_FillMo, 08_04_H2MO-a7a1, 08_04_He2MO-cf1f, 08_04_O2MO-912b, 08_04_ssigma, 09_02_Charles2, 10_01_DispForces, 10_05_Carbon, 10_06_ConDec, 10_06_XRyDiff1, 12_01_NH3Decomp, 12_04_2OrdKin, 12_04_AmDecomK, 12_04_CYL1_img, 12_04_Exercise02_img, 12_04_FrstOKin, 12_04_HPerDcmp, 12_05_COandO2, 12_05_RCooDgm, 12_05_SuccessR, 12_07_HMPShuntPa, 12_07_HetCats-230a, 13_04_ICETable2_img, 13_04_ICETable30_img, 13_04_ICETable3_img, 14_03_ICETable2_img, 14_03_ICETable3_img, 14_03_ICETable5_img, 14_04_ICETable13_img, 14_05_ICETable1_img, 14_06_ICETable16_img, 15_01_ICETable1_img, 15_01_ICETable2_img, 15_01_ICETable3_img, 15_01_ICETable7_img, 15_02_ICETable1_img, 17_03_GalvanCu, 17_07_Electroplate, 17_07_NaCl, 17_08_Daniell, 18_02_HallHerCell, 19_03_Dorbital, 21_06_IonRadSpec |
| M7 | 7 | 01_02_ConsMatter, 02_02_CathodeRay, 05_02_HeatMeas, 05_02_HeatTrans2, 06_03_Qnumbers, 06_04_eLeveldiag, 18_03_BorateAnio |
| M1+M4 | 7 | 11_04_refinery, 12_07_Exercise4b_img, 12_07_Exercise5a_img, 12_07_Exercise5b_img, 12_07_Rxndiagramex_img, 14_02_phscale, 20_01_FracDistil |
| M1+M5 | 2 | 10_01_PentIso, 18_07_Nitrogen (+M6 by interaction) |
| M1+M6 | 1 | 07_06_Egeom |
| M1+M7 | 2 | 01_02_CellPhone, 01_03_HazDiamond (+M4 by interaction) |
| M2+M3+M4+M5 | 1 | 05_02_FoodLabel (+M1 by interaction) |
| M4+M5 | 2 | 14_07_indicators, 20_01_alkyls |
| M4+M6 | 1 | 16_04_Scenarios |
| M5+M6 | 1 | 05_03_Systemqw |
| M6+M7 | 2 | 10_06_CrystalSys, 12_01_KDataH2O2 |

⚠️ **This list covers the 451 sidecar figures only.**
- The '6' pass also recomposes the textless figures. These have no sidecar, and they have been reached through their mapping rows since ㊴. They keep every block in its source text, so they draw kept runs.
- `books/efnafraedi-2e/media/image-mapping.json` has 711 rows: 451 with sidecars, 12 kept copies, and **248 textless figures** that the pass recomposes. Only 2 of the 248 are in `shared-prep` (HNO2_img, OxStNonmts).
- **M6 half A changes kept STIX Italic/Bold/BoldItalic runs**, and the textless figures draw only kept runs, so M6 half A is the only mechanism that can reach them. Measured after the reviews (2026-10-05, `finish/textless-fontcensus.json`, `integrate/res/tl-*` and `tlc-*`):
  - **Font census** of all 248 textless sources (all 248 resolved; `pdffonts` for PDF, a `/FontName` regex for EPS, the same method as M6's census): 30 carry a STIX font, and **5 carry STIX Italic, Bold or BoldItalic**: `CNX_Chem_10_06_GenUnitCll`, `12_05_ArrhPlot`, `12_06_CyclobD_img`, `18_03_Exercise2b_img` and `18_04_OxStNonmts`.
  - **Composed**, base and combined, one process at a time: base equals the published `_IS.svg` byte for byte on 5 of 5 (control). Combined differs on 5 of 5. Every difference is a FigIS → FigSym face swap on kept text items (3, 3, 1, 1 and 24 items respectively); OxStNonmts is the BoldItalic +/– instance (`test_compose_held` CH2e).
  - **Controls**, composed the same way, combined byte-identical to published on 6 of 6: `07_04_HNO2_img` (held), `07_03_dative_img` and `07_05_CH3OHLew_img` (STIX Regular only), `02_04_Question9b_img`, `03_01_Ex01_05a_img` and `08_02_methionine_img` (no STIX).
  - **The textless delta is therefore 5 figures (measured), with the other 237 predicted unchanged by the census.** The implementation's `--stale --dry-run` and full compose must reproduce exactly these 5 (§5).

**Each ruling in §8 changes this list.** Measured examples:
- M1 arm A instead of arm B drops glycinemass and AcidpH from the M1 set, and HazDiamond's reactivity rows stay merged.
- M7 set to `None` drops the 7 M7-only figures and changes the 4 multi-mechanism figures that contain M7.
- Deferring M6 half B keeps 7 figures' layout segments in sans.
- R3 off, with value edits instead, moves Nitrogen and conjugate_img into the content run.
- R-20 (a) moves PentIso from M1+M5 to M5 only.
- R-14 (a), R-18 (b) or R-21 (b) puts a figure into `keptCopies`. Its sidecar is deleted (2026-10-02 spec D1), so it leaves this list and the content run.

The implementation re-derives the list from the ruled gates before the pass.

**Tests on the combined tree** (run one file at a time):
- These scratch suites pass: M4; M7, also under `'source'` and `None`; M3; M1; M5. M2's suites (`test_m2_blank_lines.py`, `e2e_m2.sh`, `js/cases.mjs`) and M6's (`test_m6_faces.py`) were not run on the combined tree.
- These committed files pass: `test_heldplan`, `test_compose_held`, `test_compose_runexact`, `test_figsym`, `test_figcontainers`, `test_figlayout`, `test_compose_t23`, `test_svgout`, `test_figtext_runexact`. The regression review also ran `test_blockkey_consumers` (a weak check for M2, because SciMethod has no blank line), `test_heldvalues`, `test_figtext_normalise`, `test_figtext_out` and `test_sendable`, and all passed.
- Red: `test_figscripts` (S4a–d, B6) and `test_compose_visual_lines` (T1). The failure text is identical to M5's own candidate suite. These are M5's documented assertions that have not yet been re-pinned (R-11), not a merge defect.
- The logs in `integrate/tests/` named `base-test_*.log` are combined-tree runs, despite the name.
- Not run on the combined tree: `test_figrings` (required before any figure-driver run), the full Python suite, and `npm test`.

---

## 4. Visual grading

**Method.** There is one triptych per changed figure, plus one for FoodLabel under the ruled sidecar.
- Panels: the source PDF (via pdftocairo) | published | combined. For FoodLabel.ruled, the middle panel is the base tree with the ruled sidecar under the COMMITTED config (English bullets). The base tree with `config.ruled.json` refuses the figure (exit 1, line-count on blocks 42/44).
- The repo's `render-check.mjs` rendered the two SVG panels in Chromium `<img>`, at scale 3.
- An automated non-blank check passed on 118 of 118 triptychs (354 panels).
- One grading pass gave each triptych a verdict (improved / same / mixed / regressed) and said which panel is closer to the source.
- There was no second grader, no planted control, and no Firefox or WebKit render.

**Results.** There are 118 grades: 117 figures plus FoodLabel.ruled.
- Improved 80, same 33, mixed 5, **regressed 0**.
- Closer to the source: combined 85, neither 33, published 0.

| Set | Improved | Same | Mixed |
|---|---|---|---|
| M1 | 12 | 1 | 1 |
| M4 | 12 | 6 | 0 |
| M5 | 4 | 0 | 0 |
| M6 | 29 | 26 | 0 |
| M7 | 7 | 0 | 0 |
| Multi-mechanism (19 figures + FoodLabel.ruled) | 16 | 0 | 4 |

**The triptych grader and the mechanisms' own instruments disagree in both directions.**
- M6: M6's 4× crops called 17 figures improvements, and the grader saw no difference on 5 of them (LiqWatAbso, Ephoton, Frequency, elecw, XRyDiff1). In the other direction, the grader marked *improved* 20 M6-only figures that M6 classed as sign-only and near-neutral: molgeom, FillMo, H2MO-a7a1, He2MO-cf1f, O2MO-912b, Charles2, Carbon, ICETable2/30/3 (13_04), ICETable2/3/5 (14_03), ICETable13, ICETable1 (14_05), ICETable16, ICETable1/2/3/7 (15_01). So the headline *Improved 80* includes 20 face-only sign swaps that the finer instrument called near-neutral. Both instruments agree on 0 regressions.
- M4: 6 figures graded *same* (PerTable1, BombCalor, HybrdOrbit, Exercise25, GasDiff and Exposure2) have real moves. PerTable1's legend dx is up to 6.75 pt, HybrdOrbit up to 3.51, BombCalor up to 2.58, Exposure2 1.04 and GasDiff 1.0; only Exercise25's is under 1 pt (≤ 0.906). That the grader did not see a 6.75 pt legend move is evidence about the grader's sensitivity, not about the move. M4's own viewer called BombCalor and HybrdOrbit improved.
- SmokeAlarm (M1, graded *same*) is a **grader misread**. The text items prove a re-break: published *Reykur afhleður / agnirnar, rafrásin rofnar, / …* → combined *Reykur afhleður agnirnar, / rafrásin rofnar, / …*, which are the source rows. Measurement settles this one.

**The 5 mixed verdicts:**
1. **HazDiamond** (M1 + M7, plus M4 by interaction).
   - Better: the flash points have one rating per row, and the headings no longer overprint.
   - Worse: the reactivity rows are drawn at 7.5 pt, smaller than the source and the other lists, and they leave the box half empty. **The cause is M1 arm B's shrink** (9.0 → 7.5). R-3 resolves it (arm A keeps the rows merged at 9.0), as would a shorter wording or accepting the size.
   - Not fixed, and now harder to see: the special-hazard list rows are on the source pitch, but from ALK down the content is shifted by one row (ALK reads *Ætandi*, COR *Notið*, ₩ *ekki vatn*; §3 interaction 1). Only R-5 resolves it.
2. **glycinemass** (M1).
   - Better: *heading / (unit)* breaks as the source does.
   - Worse: the header row mixes 9.0/8.75/7.75/7.75 pt. The grader also said the units "appear non-bold". That impression comes from the size, not the weight: every header item is `font-weight="700"` in both panels (measured).
   - **The cause is M1 arm B.** R-3 resolves it: under arm A the figure reverts to published, all three keys.
3. **PentIso** (M1 + M5).
   - Better: *n* is italic, as [USER] asked.
   - Worse: M1 re-cuts the header from the wrap [USER] accepted (*Lítill snertiflötur, veikasti / aðdráttarkrafturinn*) to the source break (*Lítill snertiflötur, / veikasti aðdráttarkrafturinn*). Line 2 now ends about 8 px from the isopentane header (published: about 70 px). These are the grader's estimates at scale 3, about 2.7 pt against about 23 pt. The two labels now read as one run of text.
   - **The cause is M1.** M5's change is in a separate block, and this is not a shrink, so arm A keeps it. M1's budget does not see neighbouring open labels.
   - R-20 resolves it. The default is [USER]'s verdict.
4. **phscale** (M1 + M4).
   - Better: *(edik)* is on the CH3CO2H line (complaint 1); *appelsínusafi* and *10⁰ eða 1* are on the source column.
   - Not fixed: *hreint / vatn blóð* (complaint 2; R-5).
   - Worse: *hlutlaust* runs under the arrow, and its final *t* is hidden. **The cause is M4 A2v** (x 382.606 → 385.610). The grader also said "*basískt* now touches the arrow", but that is pre-existing: its text item is identical in both panels (measured).
   - R-8 resolves it.
5. **FoodLabel.ruled** (M1 + M2 + M3 + M4 + M5).
   - Better: the serving size is on the source rows with *(228 g)* whole; *Byrjaðu / hér* is on two rows; the vitamin rows are at the source pitch; circle 5 is clear of *Neðanmálsgrein*.
   - Worse: the bullet of *• 5% eða minna* sits on the table's right rule. **The cause is M2**, which makes the bullet drawable at all (base refuses the figure). **Its position belongs to the M7 width/cell class**: the 36.48 pt label does not fit the 27.42 pt between 385.611 and the cell's right edge minus padding. R-15 resolves it with a wording of at most 27.4 pt at 5 pt bold. A cell fix would also work, but M7 has not designed one.
   - Still wrong: the green arrowhead still crosses *Byrjaðu* (`spec-review/food_zoom.png`). *Hitaeiningar 250* / *Hitaeiningar úr fitu*, the margin labels and circle 6 over *Fljótleg* are unchanged.
   - FoodLabel with the committed sidecar is graded **improved**.

**FoodLabel: can its layout be fixed?** This is [USER]'s question. The answer is **partly**, measured on the combined tree with the ruled sidecar:
- Fixed by '6' code: the serving size (two source rows, with *(228 g)* whole, the latter pending R-19), the pitch of the vitamin rows, *meira er* (no more *erhátt*), the ruled bullets made drawable, and the nutrient column back inside its frame (A2v).
- Fixable by wording only (R-15): the margin labels (*Athugaðu*, *Takmarkaðu…*, *Fáðu nóg…*, *Neðanmálsgrein*), the Calories pair, and the *• 5% eða minna* bullet on the rule. Whether *Byrja hér* clears the arrow under '6' is unmeasured.
- Not fixed by any code or wording here:
  - circle 6 over *Fljótleg leiðsögn um % af RDS* (a container/alignment class);
  - whole-row bold on *Heildarfita 12 g*, *Kólesteról 30 mg*, *Natríum 470 mg*, *Prótein 5 g* and *Hitaeiningar 250*, where the source bolds only the nutrient name;
  - the left column's mixed x (287.997 / 287.872 / 289.334).
- The June copy that readers see draws shorter margin wordings: *Athugaðu | Hitaeiningar*, *Neðanmáls*, *Takmarkaðu | þessi | næringarefni*, *Fáðu | nóg | af þessum | næringarefni*, *Fljótleg | leiðsögn um*. It also draws the bullets with U+00A0 (vefur's synced `CNX_Chem_05_02_FoodLabel_IS.svg`). The choice between '6' and June is R-21.

---

## 5. `COMPOSER_VERSION` '5' → '6' and delivery

**The rule requires the bump; it is not a ruling.**
- `tools/lib/figure-text-sidecar.cjs` says: *"Bump when a composer change alters pixels for unchanged text."* Here 117 sidecar figures change pixels with no sidecar text changed.
- The rule's only exception is *"skip a bump only if no sidecar carries `state` AND prod holds no figure approval up to the deploy"*. It cannot be relied on, because figure review has been open on prod since the '5' deploy (2026-10-04 15:15Z).
- Without the bump, a bare `--stale` does not reach the 117 figures at all. Reaching them with `--force` is what the docstring forbids for a pass; that was the ④/⑥a/⑥b exception that '4' closed.
- One bump covers all seven mechanisms. The docstring gains a '6' entry that names each mechanism, placed with the '2'–'5' entries. ⚠️ `composer-version-6-SHARED.diff` as written names only M6 and puts the entry after the "THE RULE FROM HERE" paragraph, so the implementation rewrites it.

**Approval demotion is a consequence of the bump. Whether review stays open until then is R-22.**
- A bump changes the version inside every `renderHash`. Every approval stored on prod (`figure_review.render_hash`) then stops matching, and the figure returns to mt-preview until someone reviews it again. The 2026-09-26 decision (ruling 5) kept prod figure review closed until the '5' pass deployed, for exactly this reason. Review reopened at that deploy, on 2026-10-04.
- Prod held **0** `figure_review` rows and **0** `figure_block_edit` rows before the #538 merge and in the re-font check at about 16:40Z on 2026-10-04. The later wording-class block lists the read-only prod check as still owed, and no later result is recorded.
- **At the deploy that carries '6', re-check read-only:**
  - approved `figure_review` rows (count and basenames);
  - `figure_block_edit` rows;
  - dirty sidecars in prod's checkout;
  - that no prod commit has touched `figure-text/` since the branch point.
- A non-zero count does not block the deploy. It is the number of figures editors must re-approve, and [USER] is told that number before the deploy.

**Sidecar fields:**
- In the pass, the bump changes ONE field per sidecar: `composedVersion` '5' → '6'.
  - `composerVersion` stays the version under which the sidecar's `renderHash` was hashed. Today that is '1' on 33 sidecars, '4' on 411 and '5' on 7.
  - The bump does not recompute `renderHash`.
  - 0 of 451 sidecars carry `state`, and all 451 carry `composedVersion` '5'.
- A sidecar whose VALUES are edited in the content run (§7) is handled as in `e52bde89a` / `applyApprovedFigureEdits`:
  - `renderHash` is recomputed under the `COMPOSER_VERSION` in the tree at edit time, and `composerVersion` is set to match;
  - no `state` is written;
  - the stamps and MT verdicts are carried over.
  - Hashing under '6' while leaving `composerVersion` at an older value loops forever. This was simulated with the real `isStale` (2026-10-02 spec, D4).

**Preconditions before the pass and before R-12/R-13 go to [USER] (0 ISK):**
1. **Compose the 248 textless figures** on base and on the implemented tree, one process at a time, and check that exactly the 5 measured in §3 change (a prediction to reproduce, not an open measurement).
2. **Run a three-engine sweep.** The 2026-09-26 decision, ruling 4(b), says: *"check every composed figure in WebKit and Firefox against Chromium, and on a real iPad."* Run `browser-sweep.mjs` over every changed figure (sidecar and textless) in Chromium, Firefox and WebKit, with a by-eye old/new/source sample in Firefox and WebKit, as the '5' pass did (2026-10-02 spec, predicted delta). M6's per-face `@font-face` blocks are the first priority.
3. Run `test_figrings` and the committed suites on the real tree (§9.5).

**The pass (0 ISK):**
- Command: `node tools/figure-run.js --book efnafraedi-2e --chapter <N> --stale`, one chapter at a time.
- Never use `--force`, and never run it through `scripts/chemistry-autorun-chapter.sh`.
- Before each chapter, run `free -h`, `df -h /tmp` and a `--stale --dry-run`.
- Move the repo `.env` aside, so that a would-be buy fails closed.
- The three new STIX faces must be in place, hash-pinned, on the box that runs the pass (D-g).

**Convergence check:**
- Media:
  - exactly the sidecar figures of §3 (as re-derived from the rulings) change bytes, and each single-mechanism figure equals its arm's `translated.svg`;
  - plus the textless set, measured beforehand;
  - brain-ec0b reproduces its published bytes through the ring gate;
  - every other sidecar figure is byte-identical.
- Sidecars: all 451 change exactly one line (`composedVersion`), plus the edits to the figures in the content run.
- A second `--stale --dry-run` per chapter reads `skipped-current` for every sidecar figure, with `composedHash === renderHash`.
- Textless figures carry no stamp and are recomposed on every run. Check them by byte identity across two runs.
- Every live log reads `MT spawned for 0 figure(s)`. Read each verdict's reasons, not only the word *ok*.
- Run the three-engine `browser-sweep.mjs` over every changed figure, as in precondition 2, on the pass's actual output.

**Reader delivery:**
- The pass writes only to `books/efnafraedi-2e/media/`.
- Readers get the new pictures only through step 3's re-render and [USER]'s sync. The sync stays HELD under the register's ⏹ SYNC PRECONDITIONs.
- The ordering follows the '5' precedent (2026-10-02 spec, D8):
  1. The mechanism code and its tests land first, in their own reviewed PR.
  2. One merge then carries the bump, the restamped sidecars, the content-run edits and the media.
- No figure may be recomposed between those two merges, because a recompose would draw '6' pixels under a '5' stamp.
- [USER]'s t23 rulings R1 (*"One PR, one picture review"*) and R11 (*"the PR is not merged until [USER] has looked at the recomposed figures"*) carry over to '6' unless [USER] waives them. A review page of the changed figures (sidecar and textless) goes to [USER] before the bump merges.

---

## 6. Editor consequences

- **An editor cannot type a line break, and this design does not need one.**
  - The review panel's block field is `<input type="text">` (`server/public/js/segment-editor.js`, `renderFigureBlock`), which drops LF.
  - The composer does not honour `\n` in a translated value. 0 of 2,709 committed values carry one, and the per-line route for translated values is not built.
  - M1 recovers the source's own row breaks automatically wherever the MT carries a verbatim anchor: 28 of 32 measured partition-class keys.
  - The 4 residuals need a ruling (R-5). Route (a) there would need a textarea for every multi-line block (every key containing `|`), not only for values that already contain `\n`.
- **An edit can re-cut a label without the editor touching its layout.** M1 matches anchors by count. Adding or removing a digit, comma or bracket elsewhere in a value can switch an anchor and move a cut, though never the line count. The editor sees this only after the next recompose.
- **The drawn text can differ from the value the editor sees** (M5 R3). The joint space in *NH4 + )* is dropped when drawn. Any preview or check that compares drawn text with the value must apply the same elision.
- **Longer edits can collide without a report, in two places:**
  - labels that A2v made left-aligned grow to the right, and cells do not see obstacles inside the cell (the phscale arrow);
  - shared-box labels take the whole box as their budget (CrystalSys).
- **`heldBlockValues` are not in the review panel**, because those blocks are `send:false`. The FoodLabel bullets stay in config only. [USER] rules them, and editors can never edit them.
- **What figure review shows.** The panel's picture is the media file in prod's checkout, so '6' pixels appear only after the deploy that carries the restamped media. Every approval made under '5' is demoted at that deploy (§5, R-22).
- **A figure moved into `keptCopies`** (R-14 a, R-18 b, R-21 b) loses its sidecar and leaves figure review entirely.

---

## 7. The content run after the code lands (0 ISK)

These are value-only sidecar edits, shaped like `e52bde89a`:
- Make a `.bak` first.
- Never edit while a run is going.
- Recompute `renderHash` as described in §5.
- Land each edit in the same run as the `--stale` pass, so that each figure is recomposed once under '6'.
- Items 1–3 apply only if R-21 keeps FoodLabel composed. Under R-21 (b), its sidecar is deleted and they are void.

1. **FoodLabel ruled wording.** These are the 7 values [USER] ruled (R1 *"% af RDS"*, rows *apply*), equal to the review page's proposals:
   - *Fljótleg leiðsögn um % af RDS* (Quick guide to % DV)
   - *Sýnishorn af næringaryfirlýsingu fyrir makkarónur og ost*
   - *Skammtastærð 1 bolli (228 g) Fjöldi skammta í pakkningu 2*
   - *Heildarfita Mettuð fita Kólesteról Natríum Heildarkolvetni Trefjar*
   - *Trefjar 0 g Sykurtegundir 5 g*
   - *A-vítamín C-vítamín Kalsíum Járn*
   - *er lágt*

   **They are flat strings, with no `\n`.** The combined tree puts the serving size, the vitamin rows and the lower table on the source rows from the joined value (measured; `named_results` in `finish/integrate.finish.json`). The register's §C140 RESUME line saying these values would carry `\n` under the composer route is wrong by this measurement. It is corrected in the register, which owns it.
2. **FoodLabel bullets** via `heldBlockValues`: `"(cid:127) 5% or less| ": "• 5% eða minna"` and `"(cid:127) 20% or| ": "• 20% eða"`.
   - [USER] ruled *"Yes, as June had them"*. June draws them with U+00A0 between words. `integrate/config.ruled.json`, which was measured, uses U+0020. The pixels are expected to be the same, because a held line is never wrapped, but U+00A0 inside a held value has not been measured against `heldvalues`' refusals. The implementation chooses the character and measures it. It first records both rows on the value sheet (`docs/handoffs/2026-10-03-step2-value-sheet.md`), because the `_heldBlockValues` README requires values to be copied from that sheet by value.
   - This requires D-b and R-17.
   - The entry must be in the config before the pass. A `heldBlockValues` change reaches a sidecar figure's media only at a bump, or when the figure is stale for another reason.
   - *• 5% eða minna* draws with its bullet on the table rule until R-15 rules a shorter wording.
3. **FoodLabel margin labels, the Calories pair, *Start here* and *Trans*:** apply only what [USER] rules in R-15 and R-10.
4. **phscale *hreint vatn | blóð*:** no code in this record reaches it. The route is R-5.
5. **Nitrogen ×3 and `conjugate_img` ×1:** make value edits **only if R-9 rules "edit values"**, in which case M5's R3 is removed. The edits would be *ammóníum (NH4+)*, *nítrít (NO2–*, *nítrat (NO3–* and *NH4+ (samoka sýra)*. Under R3, the default, there is no edit.
6. **SolTherm1:** no composer change reaches it, and it is byte-identical in the combined tree.
   - *Útblástursgufa* is already its sidecar value.
   - The defect is the line count of the one-word values (*Varmaskipti*, *Varmaflutningsvökvi*), not the alignment. The composer already infers LEFT for both split terms.
   - The June copy (vefur's synced `CNX_Chem_05_01_SolTherm1_IS.svg`) draws *Varma‐ | skipti* and *Varma‐ | flutnings‐ | vökvi*, and its steam label is *Fráblástursgufa*, not [USER]'s *Útblástursgufa*.
   - There are two routes (R-18):
     - Use June's own break points as a wording, keeping the sidecar's *Útblástursgufa*. A scratch sidecar with *Varma‐ skipti* and *Varma‐ flutnings‐ vökvi* (U+2010 plus a space) draws left at the source x, at full size, under the CURRENT composer.
     - Keep the June copy under `keptCopies`, re-fonted by the #538 tool.
7. **Systemqw:** the wording [USER] gave (*qút*, *qinn*, *wá*, *waf*) is already the sidecar value. Recomposed under '6' with M5 and M6, it matches the source in every element. Whether that replaces "Use June as base" is R-14.

---

## 8. Rulings needed from [USER]

These are deduplicated across the seven mechanisms. Each one is a choice with measured consequences, and the recommendation is labelled and kept separate. **R-22 is time-sensitive**, because every figure approval made on prod before the '6' deploy will be demoted. All visual evidence behind these rulings comes from Chromium only (§5 precondition 2).

**R-1. `COMPOSER_VERSION` '5' → '6' is not a ruling.** The rule requires it (§5). The read-only prod check at the deploy decides only how many approvals editors must redo, and [USER] is told that number.

**R-2. R2's scope ("Schematic boxes: centre every line … in its box").**

(a) A box that holds more than one label (M7). The options:
- (0) As today: 52 labels in 11 published figures overprint with no report.
- (A) Keep R2's horizontal centre and move labels only vertically: 34 fixed, 18 still piled, 1 newly broken.
- (C) Each label at its own source position, with every line centred on that label's own source centre: 52 fixed, 0 broken.
- (B) Each label at its source position, with the source alignment (R3, *"Table cells keep the source alignment"*): 52 fixed, 0 broken. CellPhone's four bodies become left-aligned as OpenStax drew them, which is the departure R2 made.
- Both B and C depart from R2's letter, because a label is no longer centred in its box. C also departs from R3, which governs the cell path that M7 sends shared boxes down; B follows R3.
- B and C differ on 7 labels in 4 figures.
- Consequence of either B or C: shared boxes become cells, so P1v (and possibly SOURCE_ROWS) can reach them. On HazDiamond, the special-hazard list moves to the source pitch (11.0 → 12.15), and each row sits level with a kept code. But from ALK down, the content is shifted by one row (ALK reads *Ætandi*, COR *Notið*, ₩ *ekki vatn*; §3 interaction 1). The wrong pairing therefore looks deliberate until R-5 fixes the wording or the break.

*Recommendation:* C, with B available as a one-constant switch. Accept P1v reaching shared boxes only together with a fix to HazDiamond's list content (R-5). Otherwise, look at HazDiamond before ruling.

(b) Boxes that hold a single label. **Measured, not proposed.** None of the three variants has a visual verdict, and nothing named needs one. Keeping the source's left/right (A3) breaks `test_compose_t23` L1. The source pitch (P1B/P1B1) moves HazDiamond's lead 11.0 → 12.15 and breaks `test_figlayout`'s box-vertical cases. A margin height budget moves HazDiamond *Reactivity* 8.25 → 9.0. R2 stays unchanged.

**R-3. M1: may an anchored cut that does not fit at the source size SHRINK (keeping the same count), or must it fall back to the merged cut?**
- Arm A: 19 of 32 truth keys; 27 keys in 24 figures; 0 size changes.
- Arm B: 28 of 32; 36 keys in 26 figures; 9 size reductions:
  - HazDiamond reactivity ratings: 9.0 → 7.5.
  - refinery Large: 9.0 → 8.25.
  - FracDistil Small: 9.0 → 8.5.
  - glycinemass: 9.0 → 8.75/7.75/7.75.
  - AcidpH ×3: 9.0 → 8.5.
- **This shrink causes two of the five mixed grades:** HazDiamond's reactivity rows and glycinemass's header row.
- Under arm A, glycinemass and AcidpH revert to published, and HazDiamond's reactivity rows stay merged at 9.0.

*Recommendation:* B, because rows matter more than half a point. Look at HazDiamond and glycinemass first; arm A is one constant away.

**R-4. M1: may an anchored cut override R9 and (A), at the anchored position only, where the source itself breaks after the symbol?** R9 says a 1–2 character symbol stays on the line of the word after it. (A) says a symbol that ends a box label may not stand alone on the last line.
- On: 28 of 32.
- Off: 21 of 32. It loses HazDiamond's flash points (*°C*), spin (*,*) and the 5 tick keys (*5*, *0*).
- Free cuts keep R9 either way (T9).

*Recommendation:* on.

**R-5. The residuals with no anchor: phscale *hreint vatn | blóð* (named by [USER]), HazDiamond's special-hazard list (rows ALK→₩ shifted by one row), aldket, and Example2 (width-bound).**
- (a) An explicit `\n` in the value, through a per-line route for translated values, plus a textarea for every multi-line block. The route would slice `FS.transfer` per line for formula lines. phscale's residual has no formula, so it costs 0 ISK once built. Not built.
- (b) A soft per-line rule for free cuts. It reaches the HazDiamond list, but it moves 55–65 keys (24–32 of them prose) and re-broke the FoodLabel footnote (measured under a different anchor rule).
- (c) A re-buy under the 2026-09-15 ruling (send both per label and joined, keep the joined wording). It replaces values that [USER] and editors have ruled. Estimated at about 23 ISK for the M1 class; never run.
- (d) A wording edit. No wording has been measured for these four.
- Example2 also needs width or a shorter wording.

*Recommendation:* (a) for phscale, since [USER] named it, as its own small design. HazDiamond and aldket by wording. Not (b).

**R-6. Rule (E) (2026-09-15: a line that does not shorten the longest line is never kept): does its letter apply to M1's anchored cut, which can be wider than the (n−1)-line min-max?**
- As shipped, (E) governs the count only, and 3 box keys violate its letter (HazDiamond ×2, CellPhone).
- Gating on the letter reverts those 3, giving 26 of 32 and losing both HazDiamond fixes.

*Recommendation:* (E) governs the count only.

*Measured, not proposed:* keeping the source's own count even when the extra line shortens nothing (M3's Eoff/Esrc) changes 12 blocks in 5 figures. That is 1 improvement (already moot under [USER]'s *Kalsíum*), 10 regressions that put a lone word on its own line (SciMethod *að*; Radiigraph *í* ×2; Egeom *með*/*háum*/*Þrjú / svæði* ×5; steps1 ×2), and 1 unclear (FoodLabel *Get enough*). No exemption.

**R-7. M3 `CELL_CLAMP_BUDGET`: measured, not proposed.** Using a cell's vertical clamp interval as its height budget for every count changes 6 one-line labels in 4 figures. There are 3 improvements (HazDiamond *Eldhætta* 8.25 → 9.0, emspectrum *Innrautt* 7.5 → 9.0, Solardist *Innrautt* 7.5 → 8.75), 2 neutral changes, and 1 regression (Solardist *Sýnilegt* 7.5 → 9.0 overlaps *UV* by 2.6 × 10 pt). It stays off for now. Revisit it once cells see their sibling obstacles; turning it on is a one-constant flip.

**R-8. M4's choices.**
- **P1v threshold** (records / figures / accepted figures): 0.5 gives 34/17/0; **1.0 gives 26/13/0**; 2.0 gives 7/6/0 and loses FoodLabel 14/15/38/41 and FracDistil 0. *Recommendation:* 1.0.
- **A2v centre veto** (whether one centre-aligned sibling is enough to keep a label centred): at > 0 (90 records), or at ≥ 2, which adds 6: *Liquid* in 4 periodic legends, Scenarios block 10, and Lead *Dilute H2SO4*. None of the 6 was viewed. *Recommendation:* > 0, unless [USER] wants the Scenarios pair consistent; in that case view the 6 first.
- **May A2v move a label whose value [USER] ruled (a held value) without a value change?** Yes: phscale *10⁰ eða 1* ×2 moves from centre to left, onto the source column (viewed; an improvement). No: those 2 records revert. *Recommendation:* yes. It is [USER]'s call because a ruled value is redrawn.
- **phscale *hlutlaust*.** Options:
  - accept one arrow crossing (about 2.5 pt, with the final *t* hidden) in exchange for the other A2v moves (89 laid-out records, by M4's count);
  - hold A2v until cells see obstacles inside the cell, which loses all 92 records;
  - a shorter neuter wording, to match *súrt* and *basískt*. None has been measured. M4 suggested *hlutlaus*, but it was never composed, and its gender does not agree with its neighbours.

  *Recommendation:* accept the crossing, unless [USER] offers a neuter wording, which is then measured.
- **A1 (FoodLabel *Start|here*: align a multi-line label on the one source edge its lines share exactly).** Its anchor moves 265.77 → 260.29, but x0 does not change on the committed sidecar, and the held OX figure flips from centre to right. *Recommendation:* no.

**R-9. M5 R3: should the stacked charges in Nitrogen ×3 and `conjugate_img` ×1 be fixed by code, or by 4 hand edits?**
- Code (R2 + R3):
  - all 4 are fixed now, and so is every future stacked charge, with no sidecar touched; they stay fixed after a re-buy;
  - the drawn text no longer always equals the value, because the space the MT wire puts between *NH4* and *+* is not drawn. This breaks transfer's documented rule that "the value is never altered", and `test_compose_visual_lines` T1 is re-pinned to "the value minus the JOINT positions".
- Hand edits (R2 + 4 value edits):
  - identical formatting (measured), and the drawn text equals the value;
  - but the 4 hand edits need a `renderHash` recompute;
  - and any re-buy breaks them again, because the wire joins every stacked charge with one space.

*Recommendation:* code.

**R-10. M5 R6 and FoodLabel *Transfita*.**
- R6 draws *Trans* in italic inside *Transfita 3 g* with no wording change. It touches 1 block in the whole corpus.
- The wording *Trans fita 3 g* gets the italic from base, and R6 is then inert.

*Recommendation:* keep R6. The wording then stays [USER]'s call, on language grounds alone.

**R-11. Re-pinning committed tests is not a ruling.** It follows from R-9 and R-14 (M5). `test_figscripts` S4a–d and B6 move to Systemqw's resolved base (11 pt, `i___`). If R-9 rules code, `test_compose_visual_lines` T1 moves to "the value minus the JOINT positions". Keeping the old pins would block R1, R7 and R3 and leave Systemqw flat.

**R-12. Should the 2026-09-16 STIX acceptance (strict OFL, Regular, FigSym subset) extend to STIXGeneral Italic, Bold and BoldItalic 1.1.0?**
- Yes:
  - the three files are hash-pinned in `~/.cache/namsbokasafn-figtext/stix-1.1.0/` and never committed, with `SHA256SUMS`/`PROVENANCE` extended;
  - their subsets meet the same strict readings as Regular;
  - **60 sidecar figures change (17 visibly improve on M6's 4× crops, 43 near-neutral, 0 regress), plus 5 of the 248 textless figures** (`CNX_Chem_10_06_GenUnitCll`, `12_05_ArrhPlot`, `12_06_CyclobD_img`, `18_03_Exercise2b_img` and `18_04_OxStNonmts`; measured, face swaps only, §3). Systemqw's formula matches the source;
  - the font paragraph in the repo `LICENSE` (㊻⑤) is [USER]'s wording and would need to name the new faces.
- No: 0 figures change, and Systemqw keeps its mixed formula.
- The visual evidence is from Chromium only. The three-engine sweep (§5 precondition 2) comes before this ruling; the textless delta is measured (§3).

*Recommendation:* yes, once the preconditions are met.

**R-13. M6 half B (the STIX face for styled characters inside translated labels).**
- Include it:
  - 7 more figures change. 18 characters change face (10 in place, 8 also moved), and 19 neighbouring segments move by the advance difference. By eye, 6 improve and 1 is unclear;
  - it is also what draws Systemqw's q/w bases and Nitrogen's charges in serif once M5 lands.
- Defer it: those 7 figures keep sans ν/λ/π/° beside a serif source.
- The visual evidence is from Chromium only (§5 precondition 2).

*Recommendation:* include it.

**R-14. Systemqw: "Use June as base", or the recomposed figure?**
- (a) Keep the June copy (in `keptCopies`, re-fonted): consistent sans, the English subscripts *out/by/in/on*, and [USER]'s wording not applied. The sidecar is deleted when the figure enters `keptCopies` (2026-10-02 spec D1), so the figure leaves §3's list and figure review.
- (b) Recompose under '6' with M6 only: a serif formula, but the labels stay flat at 7 pt.
- (c) Recompose under '6' with M5 + M6 (measured, `runs/v4x`): a serif formula, and q/w as serif italic bases with Icelandic sans subscripts. It is close to the source in every element.
- (c) needs M5, M6 half B (R-13) and the font extension (R-12). Answering *no* to R-12 or *defer* to R-13 leaves only (a) or (b).

*Recommendation:* (c) once M5 lands, and (a) until then. (b) keeps the flat labels and is not recommended.

**R-15. FoodLabel's width-bound labels.** No composer change fits them at 5 pt, where the slot is 26.54 pt. The widths below are measured at 5 pt, on base. Each was composed for real, one change at a time ("clean" means 0 hits). For comparison, the June copy already draws *Athugaðu | Hitaeiningar*, *Neðanmáls*, *Takmarkaðu | þessi | næringarefni*, *Fáðu | nóg | af þessum | næringarefni* and *Fljótleg | leiðsögn um*.
- Check | Calories:
  - *Athugaðu hitaeiningar*: 28.34, escapes.
  - *Athugaðu orku*: clean, but reverses the accepted *Hitaeiningar*.
- The Calories pair:
  - *Úr fitu 110* (23.07) beside *Hitaeiningar 250*: both clean. This is the only option consistent with the accepted row.
  - *Orka 250* with *Orka úr fitu 110*: clean, but reverses that row.
- Limit:
  - *Takmarkaðu þessi næringarefni*: crosses by 5.63.
  - *Takmarkaðu þessi efni*: crosses by 4.53.
  - *Minnkaðu þessi efni*: clean.
  - *Forðastu þessi efni*: clean.
- Get enough:
  - *Fáðu nóg af þessum næringarefnum*: crosses by 11.99 and hits Kalsíum/C-vítamín.
  - *Fáðu nóg af þessum efnum*: clean.
  - *Fáðu nóg af þessum*: clean.
- Footnote:
  - *Neðanmálsgrein*: 38.9, escapes.
  - *Neðanmáls*: 26.68, still overflows.
  - *Neðanmál*: 23.9, clean.
  - *Skýringar*: 23.07, clean.
- Bullet: *• 5% eða minna* is 36.48 pt in a 27.42 pt space. A wording of at most 27.4 pt at 5 pt bold would sit at the source x, as *• 20% eða* does.
- *Start here*: *Byrja hér* cleared the arrow tail on base, as one line. Under '6' the label is drawn on two rows, and the arrowhead still crosses *Byrjaðu*. *Byrja / hér* under '6' is unmeasured.
- The size route keeps the wording, but it needs a per-key size override that does not exist, and it **reopens [USER]'s R4 (floor 7.5 pt) and R5 (never shrunk further)**. Clean sizes:
  - *Athugaðu* at 4.0;
  - *Takmarkaðu* at 3.5;
  - *Fáðu nóg … næringarefnum* at 3.0;
  - *Neðanmálsgrein* at 3.0;
  - *Hitaeiningar 250* at 3.5 with *Hitaeiningar úr fitu 110* at 3.0.

  For scale, the English source draws 41 runs at 4.0 pt.
- This ruling is void under R-21 (b).

*Recommendation:* rule on wording, not size. Wording needs no code and lands with the content run. These widths are offered for choosing, not as proposals.

**R-16. Periodic tables: may a label set below 7.5 pt shrink below its source size?** This **reopens [USER]'s R4 and R5** (2026-09-13). In 5 figures, 22–24 element names each overflow at their 4.0 pt source size.
- r2: 7 figures change, 103 labels fixed, 0 broken, with names at 3.2–3.75 pt. It also fixes FoodLabel *Athugaðu* at 4.0.
- No: the 120 named overflows stay.

*Recommendation:* this is a legibility call for [USER]. If yes, use r2 only, as its own change with its own measurement, not in this bump.

**R-17. Should the `heldBlockValues` contract be amended?** The contract is recorded in the frozen 2026-10-03 spec D-b and lives on in the `_heldBlockValues` README. The amendment: a source line that holds only spaces is not counted as a line, and the validator counts only key segments that are not spaces-only.
- (a) Amend:
  - [USER]'s ruled bullets compose;
  - CI and compose both refuse a two-line bullet and a value equal to the English ink text;
  - 1 block changes pixels in the whole corpus (FoodLabel *meira er*, collision removed);
  - the README, two docstrings and the register move; the 2026-10-03 spec is superseded, not edited.
- (b) Keep:
  - the ruled bullets stay impossible to apply;
  - committing them would pass CI and then fail at compose, so the figure would be refused and readers would keep the old copy;
  - *erhátt* remains.

*Recommendation:* (a).

**R-18. SolTherm1 ("Keep the June copy as base, align left for each split term and use Útblástursgufa").**
- (a) Use June's own break points as a wording (*Varma‐ skipti*, *Varma‐ flutnings‐ vökvi*), with the sidecar's *Útblástursgufa*. It draws left at the source x, at full size, under the current composer (measured), with no code. It meets all three parts of the verdict.
- (b) Keep the June copy under `keptCopies`, re-fonted by the #538 tool. A kept copy is never recomposed, so it keeps June's *Fráblástursgufa* and drops the third part of the verdict. The sidecar is deleted (2026-10-02 spec D1), and figure review can no longer reach the figure.

*Recommendation:* (a), which is June's layout with [USER]'s word.

**R-19. `R9_CLOSER`: may a short token that closes a bracket end a line?** This amends R9 ([USER] 2026-09-13, amended 2026-09-14: a 1–2 character symbol binds to the word after it).
- On: a token such as `g)` that closes a `(` opened earlier on the label may end a line, and no line may start with it. No decision changes on committed values. On the ruled FoodLabel serving value, *(228 g)* stays whole (M3 alone, and in the combined tree).
- Off: R9 as ruled. M3 alone draws *(228 / g)*. In the combined tree M1's `)` anchor also acts on that break, so the result under '6' is unmeasured.

*Recommendation:* on, because it keeps [USER]'s spacing in *(228 g)*. Until [USER] rules, `R9_CLOSER` is not part of the default, and the off result is measured before the pass.

**R-20. PentIso: keep the wrap [USER] accepted, or take the source break?** [USER] said: *"Wrapping is fine, but n- should be italic."*
- (a) Keep the accepted wrap (*Lítill snertiflötur, veikasti / aðdráttarkrafturinn*). This needs an M1 exclusion for this key or a neighbour-gap test in M1, and neither is built. PentIso moves from M1+M5 to M5 only, and *n* is still italic.
- (b) Take the source break (*Lítill snertiflötur, / veikasti aðdráttarkrafturinn*). Line 2 then ends about 2.7 pt from the isopentane header, so the two read as one run of text.

*Recommendation:* (a), [USER]'s verdict, is the default. The cheapest build is a per-key exclusion; a neighbour-gap test would be its own design.

**R-21. FoodLabel: recompose under '6', or keep the June copy?** [USER] said: *"The June copy is better despite some layout problems."* §4 (*FoodLabel: can its layout be fixed?*) lists what '6' fixes and what it does not.
- (a) Recompose under '6' with the 7 ruled values, the ruled bullets and R-15's wordings. This fixes the serving size, the vitamin pitch, *meira er* and the nutrient column. It leaves circle 6 over *Fljótleg*, the whole-row bold, the column x, and whatever R-15 does not settle. Figure review can reach the figure.
- (b) Restore the June copy under `keptCopies`, re-fonted by the #538 tool. Readers keep June's layout, with its shorter margin wordings and its own layout problems. The sidecar is deleted when the figure enters `keptCopies` (2026-10-02 spec D1). That voids the 7 ruled values (§7.1), the `heldBlockValues` bullets (§7.2) and R-15, and figure review can no longer reach the figure. FoodLabel leaves §3's list.

*Recommendation:* none from this record, because the choice is a judgement between two imperfect pictures. A side-by-side of June and '6' (ruled) belongs on [USER]'s review page.

**R-22. Figure review on prod until '6' deploys (time-sensitive).** The 2026-09-26 decision (ruling 5) closed prod figure review until the '5' pass deployed, because *"a composer change demotes every figure approval"*. Review reopened at the '5' deploy.
- (a) Close prod figure review again until the '6' deploy. No approvals are wasted, but editors cannot review figures in the meantime.
- (b) Keep it open. Every approval made before the '6' deploy is demoted and must be redone. Prod had **0** `figure_review` rows and 0 `figure_block_edit` rows on 2026-10-05 (read-only check at `2b262db4f`, control `registered_books` 6), so nothing is lost yet; the count that matters is the one at the deploy check (§5).

*Recommendation:* (a), by the same reasoning as the 2026-09-26 ruling, unless [USER] wants editors working on figures now.

---

## 9. Open questions and unfinished work

1. **The textless figures were measured by census plus 11 composes, not all composed.** 5 of 248 change (§3), with 6 of 6 controls unchanged. The other 237 are predicted unchanged because they carry no STIX Italic/Bold/BoldItalic font. The implementation's full compose of the textless set is the check of that prediction.
2. **Text against artwork and frames was never checked** for M1's 26 figures, because M1's bbox census compares text with text only. It was also not checked for M4's left-grown labels beyond the ones viewed. The 118 triptychs are the only whole-figure look.
3. **The visual verdicts rest on one grading pass in Chromium**, with no second grader, no planted control, and no Firefox or WebKit render. The 2026-09-26 decision (ruling 4(b)) requires a three-engine check (§5 precondition 2). The cross-instrument disagreements in §4 (M6 in both directions; M4's 6) are unsettled. SmokeAlarm's is settled by its text items.
4. **The integrator itself read 9 of the multi-mechanism triptychs, which cover 8 of the 19 figures**, because FoodLabel and FoodLabel.ruled are both among the 9. The other 11 (Systemqw, PentIso, CrystalSys, refinery, KDataH2O2, Exercise5a, Exercise5b, Rxndiagramex, indicators, Scenarios and alkyls) rest on leave-one-out byte composition plus the grading pass.
5. **The ship form is not built.**
   - Pixels still depend on the environment: M5's `M5_Rn`, M6's `M6_KEPT`/`M6_SERIF`, and `FIGTEXT_STIX_DIR`.
   - The `m6Layout` report key is not renamed, and `load_face`'s refusal message is not fixed.
   - The shared bump's docstring entry names only M6 (§5).
   - The scratch tests still need porting:
     - `test_m1_final.py`;
     - `test_m2_blank_lines.py`: T1–T4c as-is, and T5–T10 and the e2e test via a planted fixture;
     - validator cases V1–V5, into vitest;
     - `test_m3_final.py`;
     - `test_m4_align_pitch.py` with its fixtures;
     - the M5 arms, into `test_figscripts`;
     - `test_m6_faces.py`, with fixtures;
     - `test_figcontainers_sharedbox.py`;
     - `test_figsym` counterparts for the new faces.
   - `test_figrings`, the full Python suite and `npm test` were not run on the combined tree, and neither were M2's and M6's scratch suites.
   - `test_figure_compose`'s 8 FAIL were identical on base in every scratch tree, because the driver path lies outside the repo. They must be re-run in the real tree.
6. **Not reached by any mechanism here:**
   - phscale *hreint vatn | blóð*, HazDiamond's special-hazard list content, aldket and Example2 (R-5);
   - FoodLabel's *Fljótleg leiðsögn um % af RDS*, which fits by width but starts on circle ⑥ and hits block 35 (a container/alignment class);
   - FoodLabel's whole-row bold (the source bolds only the nutrient name) and the left column's mixed x (287.997 / 287.872 / 289.334);
   - FoodLabel *Byrjaðu* under the arrowhead;
   - CovalradiT's F label: *=* touching the fraction bar, *pm* overhanging it, and one word space before *Cl radíus*;
   - ConsMatter *For-bjór*, which is wider than its white patch;
   - the position of the M2 bullet (R-15);
   - the `cis-`/`sis-` item (§1);
   - the kept copies (Relation, Manometer, MYdCmIn).
7. **Not measured:**
   - whether SolTherm1's single-line labels (*Cooling tower* and the rest) are left-aligned in the source;
   - the 6 extra A2v records under a ≥ 2 centre veto;
   - the FoodLabel serving value with `R9_CLOSER` off in the combined tree (R-19);
   - *Byrja / hér* under '6' (R-15);
   - U+00A0 in the held bullet values (§7.2);
   - a neuter wording for phscale *hlutlaust* (R-8);
   - the other 10 SOURCE_ROWS-eligible records, once a count change reaches them;
   - any book other than chemistry.
8. **Nothing consumes the `rows` and `m1` report keys** (neither compose-report nor figure-outcomes), and an M1 shrink does not change `step`. An M1 shrink and a SOURCE_ROWS admission are therefore invisible in every report list (D-a risk).

---

## Review record

These are the blocking findings from the three adversarial reviews (fidelity F, regression B, completeness C). Each one was verified against the inputs.

| # | Finding | Disposition |
|---|---|---|
| F1 | D-e misstated FoodLabel's P1v values: only blocks 14/16 land at top 50.5894, and block 15 is at lead 4.5 | Fixed: per-block values from `m4-align-pitch/final/blast-radius.json` (D-e) |
| F2 | M6 half B was miscounted: 18 face changes (10 + 8) and 19 moved neighbours; kept-run italic is 299, not 309 | Fixed: D-g items and R-13, checked against `cmp-v4kept-v4.json` and `cmp-b0-v4.json` |
| B1 | `R9_CLOSER` amends [USER]'s R9 and was shipped on by default with no ruling | Fixed: D-c marks it pending; new R-19; §3 notes the measured configuration |
| B2 | PentIso: M1 reverses a wrap [USER] accepted and adds a run-on | Fixed: removed from §1's M1 row; D-a and §4 say so; new R-20, defaulting to the verdict |
| B3 | D-b told the implementer to edit the frozen 2026-10-03 spec, and §7.1 had a frozen record supersede the register | Fixed: the live owners move, and the 10-03 spec is superseded, not edited; §7.1 says the register line is corrected in the register |
| B4 | The three-engine check that [USER] ruled (2026-09-26 ruling 4(b)) was missing | Fixed: §5 precondition 2 and convergence check; Chromium-only caveat on R-12/R-13, D-g, §8 opener, §9.3 |
| B5 | R-12's consequence omitted the 248 textless figures | Fixed: §3 census (711 = 451 + 12 + 248), R-12 wording, §5 precondition 1, §9.1. The textless delta was then measured after the reviews: 5 of 248 by census + compose, 6 of 6 controls unchanged (§3) |
| B6 | Keeping prod figure review open until '6' was decided implicitly | Fixed: new R-22 (time-sensitive); §5 reworded |
| C1 | FoodLabel: [USER]'s question "can it be fixed?" was unanswered, and there was no keep-June option | Fixed: §4 answer (partly, with lists); new R-21; June's margin wordings cited in R-15 |
| C2 | PentIso (same as B2) | Fixed with B2 |
| C3 | HazDiamond's special-hazard list was described as aligned and improved while its content is shifted by one row | Fixed: §3 interaction 1, §4 mixed 1, R-2(a) and R-5 restated (verified on `spec-review/haz_zoom.png`) |
| C4 | R-18 missed that June draws *Fráblástursgufa* and that option (a) is June's layout | Fixed: §7.6 and R-18 |
| C5 | *Byrjaðu / hér* was listed as fixed while the arrowhead still crosses it | Fixed: D-c residual, §4 mixed 5, R-15 marks *Byrja hér* under '6' as unmeasured, §9.6 |

## Review findings not adopted

- **N12 (phscale quote).** The saved verdict reads *"…vatn is also on the wrong line -moved down one"*, and the register truncated it. This record quotes the register verbatim, as instructed. The truncation is the register's to fix, not this record's.
- **N8, in part.** R-6's second question and R-7 keep their numbers, relabelled *measured, not proposed*, rather than being removed. The reviews, register and mechanism reports cite R-1…R-18 by number. For the same reason, R-11 stays as a numbered "not a ruling", and R-2(b) stays as a numbered note.
- **The rulings-jargon finding, in part.** Plain glosses were added to R-4, R-8, R-9 and R-17, and R-9 was rephrased as code vs hand edits. R-9 and R-11 were not routed to [LEAD]. R-9's choice, whether a drawn label may differ from its stored value, is visible to readers and editors, so it stays with [USER]. Pictures of each option belong on [USER]'s review page, not in this record.