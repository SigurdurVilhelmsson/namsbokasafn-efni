# 2b — the TRANSLATED blocks: what their source formatting is, and whether it can be carried into the Icelandic

Agent 2b, 2026-09-13. Read-only; 0 ISK; no repo file modified (see the end).
Scripts: `scratchpad/2b/analyse.py` (census and matcher), `scratchpad/2b/aggregate.py`, `scratchpad/2b/transfer.py` (prototype).
Rows: `scratchpad/findings/2b-translated.jsonl`, **367 rows, one per drawn block, all states**. Each row has `state` ∈ {translated, identical, never-sent}. `first` = first occurrence of that key in its figure. The formatting features are there too, plus per-line masks and `tokens[]` with a `match` verdict for every sent block.
`figtext.py`, `blockkey.py` and `_deps.py` were imported from byte-identical copies (checked with `cmp`), grouped exactly as `compose.py` does it (`merge_blocks(group(runs))`, `block_key`).

## TL;DR

1. **For the 162 translated blocks, the only source formatting at risk is sub/superscript.** It appears in 34 of 162 blocks: 38 tokens, 52 script stretches.
   - **Italic: 0 of 162.**
   - **Bold: 26 of 162.** It is uniform in every one of them: 0 lines mix bold and regular, and 0 blocks change bold between lines. `compose.py`'s per-line `setfont` (`compose.py:54-57`, `:279`) already handles bold correctly.
   - **Colour: 0 blocks mix colours.**
   - **Source multi-space gaps: 0 of 162.**
2. **Carrying the formatting over is feasible, and fully so on this population.**
   - Whole tokens: **36 of 38 appear verbatim** in the IS value. **2 of 38 are modified**: `(mol–1)` → `(mól–1)`, where the base word was translated but the superscript `–1` survived intact. **0 of 38 vanished.**
   - Finer unit: **52 of 52 script stretches** can be placed.
   - A prototype that searches SOURCE-derived tokens in the value placed **52 of 52**, with 0 misses and 0 misplacements.
   - Identity control: it reproduced the source mask **character for character in 6 of 6** identity blocks that have tokens.
3. **Ambiguity is real, but it is resolved by using the right unit.**
   - Within a block there is exactly 1 embedded collision (`O2` inside `CO2`). The clean-boundary rule resolves it.
   - Bare formatted characters cannot be used as search keys. Across the 162 values, `l` occurs 213 times, `g` 66 and `2` 31.
   - `(g)` is an **italic gas state** in HClsoln but **roman grams** in `Massi C2H5O2N (g)`. That is the case for keying on the SOURCE and never on what the value looks like.
4. **Correction to the shared denominators.** "198 never sent / 162 translated" mixes two units.
   - Per drawn block: **176 translated + 7 identical + 184 never-sent = 367.**
   - Per unique (figure, key): 162 translated + 7 identical.
   - The 14-block difference is duplicate-key redraws (`Molar mass`, `Reactant`, `Neuron` and others). Both copies of each pair are `send:true` and both are drawn translated.
   - So "English re-laid for no gain" is **191 of 367** (184 + 7), not 205 of 367.
5. **Gaps:** nothing in the translated population needs a gap fix.
   - The 19 double spaces on the wire are an artifact of `emit-blocks.py:46` (`' '.join(lines)` after a line ending in `'Mass of '`). The MT collapsed all 19, which is harmless.
   - The only real source gaps are the 2 ten-space gaps in HClsoln identity blocks. The MT preserved them and `compose.py:252` `para.split()` destroyed them. That damage is on the English-kept side (M2), not here.

---

## 1. Denominators

| unit | translated | identical | never-sent | total |
|---|---|---|---|---|
| drawn blocks (multiplicity) | **176** | 7 | 184 | 367 |
| unique (figure, key) | **162** | 7 | 105 | 274 |

How these were checked:
- **Key vintage:** for all 34 of 34 figures, the recomputed key multiset equals `blocks.json`, and the sidecar key set equals the set of `send:true` keys.
- **Figures:** 31 of 34 have at least one translated block. The other 3 are the known all-identity figures: basehyd, HClsoln and GreenChem.
- **Where the shared 198 / 162 comes from:** 367 drawn minus 169 unique sent keys = 198. That subtracts a per-key count from a per-drawn-block count. The 14 extra blocks are duplicate translated keys:
  - exocytosis `Neuron`
  - empform `Divide by|molar mass`
  - rxn2 `Reactant`, `Coefficient`, `Product`
  - flowchart `Density`, `Molar mass`, `Avogadro’s|number`, `Molarity`
  - map2 and map3 `Molar mass`
  - combmap `Molar|mass`, `Stoichiometric|factor`
  - map8 `Molar mass`

  Each pair is `send:true` twice in `blocks.json`, and `translate-blocks.mjs` `dedupeSendBlocks` buys the key once.

## 2. Source formatting of the 162 translated blocks (unique)

| feature | translated (162) | identical (7) | never-sent (105) | detector control |
|---|---|---|---|---|
| sub/superscript | **34** | 4 | 13 | C4: HClsoln masks `.v.^.ii.` for `H3O+(aq)`. An independent count of smaller-than-max runs gives 34 blocks / 52 runs, equal to the detector's 34 / 52 stretches. |
| italic (font base `*Italic*`) | **0** | 3 | 3 | C4: fires on HClsoln (`(aq)`, `(l)`, `(g)`). `LiberationSans-Italic` is in the font table of **1 of 34** figures (HClsoln), which has no translated block. So 0 is a corpus fact, not a blind detector. |
| synthetic slant (shear in `tm`) | 0 | 0 | 0 | **No positive control.** No sheared run exists to plant against. Treat this as "not observed", not as "absent". |
| bold | **26** | 0 | 0 | C3: a planted bold run in a FishLemon block makes `mixed_bold_in_line` fire. |
| bold mixed within a line / varying across lines | **0 / 0** | 0 / 0 | 0 / 0 | C3 (as above) |
| fill colour mixed within a line / varying across lines | **0 / 0** | 0 / 0 | 0 / 0 | C3: a planted fill fires. |
| STIX symbol-font glyph | 3 | 1 | 13 | sandwich `+ 11 slices of cheese` (`+`), `+ 6 slices bread left over` (`+`), `1 sandwich = 2 slices of bread + 1 slice of cheese` (`=`, `+`). All are redrawn in Liberation Sans. |
| literal multi-space (≥2) in a source line | **0** | 2 | 0 | identical: HClsoln's two 10-space gaps |
| geometric gap (runs spaced apart, no space character) | 0 | 0 | 0 | **This instrument cannot fire.** `figtext.group` only joins runs with `adjacent` < 2.5 pt (`figtext.py:25`). My threshold was 0.3×size ≈ 2.7 pt, and the largest gap between consecutive runs within any line across all 367 blocks is **0.01 pt**. A wider gap starts a new block, so this count carries no information. |
| multi-line (source) | **92** | 0 | 1 | — |

**Consequence:**
- Bold, colour and italic need nothing from a transfer mechanism for these 162 blocks. Bold is block-uniform and `setfont` already applies it per line. Italic does not occur.
- The formatting that `compose.py` destroys on translated blocks is sub/superscript only, and it is destroyed in all 34 of 34 such blocks.
  - **That count comes from the code path, not from inspecting the 34 published `_IS.svg` files.** `compose.py:147` / `:252-261` join the text flat and `:233` draws at `sz0 = b[0]['size']`. One path serves both identity and translated blocks.
  - M0/M1 were measured on HClsoln, which has 0 translated blocks.

## 3. Formatted source tokens and what happened to them

**The unit used is not the task's run-sequence wording.** A formatted token here is a maximal non-whitespace stretch of a source line that contains at least one sub, sup or italic character. Edge punctuation from `,.;:!?` is trimmed off, but only where that character is itself unformatted. The trimming is needed because `O2,` would otherwise match inside `CO2,` (measured in run 1).

**No translated token crosses a source line break.** 0 of 38 do. The only formatted token anywhere that does is FishLemon `NH3|+CH2CH2CH2CH2NH2` (M3), which is a never-sent block.

The source side is unambiguous in its own block: 37 of 38 tokens occur exactly once in the EN key. The 38th (`O2`) occurs twice, but only once cleanly.

### Match verdicts, 38 tokens in 34 translated blocks

| verdict | tokens | examples |
|---|---|---|
| **exact**: the flat text occurs verbatim at a clean boundary | **36** | `C7H5NO3S` in `Fjöldi C7H5NO3S sameinda` · `Mg(ClO4)2` in `H2O-gleypir eins og Mg(ClO4)2` · `CO2` in `CO2-sameindir` (the hyphen counts as a clean boundary) · `Br2` in `með umframmagni af Br2.` · `C8H18` in `Mól af C8H18` |
| **modified**: the base changed, the script stretch survived | **2** | `(mol–1)` → `(mól–1)` in copperMoles and in sacch. The en dash is the same codepoint U+2013 on both sides; only `mol` → `mól` changed. It is placeable through the anchored stretch `l–1`, which occurs 1 time in each value. |
| modified by dash / space / unicode-script / case | 0 | — |
| **vanished** | **0** | — |

**Why 0 modified-by-normalisation and 0 vanished are real, not artifacts of the instrument:**
- **C1:** 10 of 10 identity tokens (IS == EN) come out exact.
- **C2:** planted edits classify as expected on real token shapes:
  - `–` → `−` gives modified
  - an inserted space gives modified
  - `⁻¹` gives modified
  - token removed gives vanished
  - `xH2Oy` gives exact-but-embedded

**The feasibility number at the finer unit:** 52 of 52 script stretches are placeable.
- 50 sit inside the 36 exact tokens.
- 2 are the anchored `–1` stretches.
- By kind, all 50 other stretches are subscript digits: `2` ×27, `4` ×6, `5` ×5, `3` ×4, `7` ×3, `8` ×3, `18` ×2. The remaining 2 are the superscript `–1`.

### Prototype (`transfer.py`), run on the real values

**Rules:**
- Tokens come only from the source runs.
- Longest token first.
- An exact occurrence counts only at a **clean** boundary, meaning not glued to a letter or digit.
- Each value position is consumed at most once.
- Fallback: each script stretch is anchored on its preceding base character. It must be **unique** and unconsumed, or the prototype refuses to guess.
- Anything not placed is **named** in `unformatted`. The value text is never altered.

**Results:**
- **52 of 52 stretches placed across 34 blocks, 0 unformatted.** Rendering the result with Unicode sub/sup characters, for display only, shows each one landing where expected:
  - `Mól af C₇H₅NO₃S (mól)`
  - `Margfaldaðu með tölu Avogadros (mól⁻¹)`
  - `CO₂, H₂O, O₂ og aðrar lofttegundir`
  - `H₂O-gleypir eins og Mg(ClO₄)₂`
  - `Massi C₈H₁₈`
- **Identity control:** on the 6 identity blocks that have tokens, the transferred mask **equals the source mask character for character**. That covers HClsoln ×3 (including italic `aq` / `l` / `g` and the `+` / `–` superscripts), GreenChem ×1 and FishLemon ×2.
- **Planted editor edits.** Each one must be named and never misplaced:
  - `Mól af C₇H₅NO₃S (mól)` (the editor typed Unicode subscripts): 3 stretches named. The text already renders as subscripts.
  - `Mól af sakkaríni (mól)` (formula replaced by a name): 3 named, nothing placed.
  - `CO2, H2O og aðrar lofttegundir` (`O2` dropped): `O2` named, and **`CO2` did not donate its `O2`**, because its positions were already consumed.
  - `…(mól−1)` (U+2212 typed): `–1` named. A dash normalisation could accept this one.

## 4. Ambiguity and collisions

**The question that matters for feasibility is within the token's own block.**
- Exactly **1** embedded occurrence exists: `O2` inside `CO2` in combustion `CO2, H2O, O2 og aðrar lofttegundir`.
- The value holds 1 clean and 1 embedded occurrence, and the EN side matches that: 1 clean (`en_occ_clean` = 1).
- The clean-boundary rule plus longest-token-first consumption resolves it.
- All 36 clean exact occurrences were listed and read one by one. **Every one is a genuine formula use.** None is an Icelandic word or a number.

**A cross-block census, inflated by design:** every distinct formatted token from all 34 figures (32 distinct texts, all states) was searched in all 162 translated values.
- It found 49 occurrences: 36 clean and 13 embedded.
- All 13 embedded ones are formula-inside-formula. Each host word was listed:
  - `O2` ×8: in `C2H5O2N` ×2, `CO2` ×3, `CO2,`, `CO2-sameindir` and `CO2-gleypir`
  - `H2` ×5: in `H2O` ×3, `H2O,` and `H2O-gleypir` Their local formatting is identical, a subscript digit after an element symbol, so even a wrong match would draw the same subscript. **Harmful collisions at this unit: 0 of 13.**
- 2 of 32 token texts have any embedded occurrence at all.

**Bare formatted characters are unusable as search keys.** Occurrences of the character alone across the 162 values:

| formatted characters (source token) | occurrences in the 162 values |
|---|---|
| `l` (the italic in `H2O(l)`) | 213 |
| `g` (`HCl(g)`) | 66 |
| `2` | 31 |
| `4` | 7 |
| `+` | 3 |
| `aq` | 0 |

So a stretch needs its base character as an anchor (`l–1`, not `–1`), and whole-word tokens are the primary unit.

**The `(g)` case (a same-text, different-formatting collision that exists in this corpus):**
- HClsoln `HCl(g)`: `g` is **italic**. It is the gas state, mask `....i.`.
- glycine / sacch `Mass of|C2H5O2N (g)`: `g` is **roman**. It means grams, mask `.v.v.v.....`.
- Even a parenthesis-level token `(g)` would carry italic onto the grams. Run 1's parenthesis split also showed that a `(ClO4)` / `2` split makes `2` ambiguous.
- The whole-word unit `HCl(g)` does not collide, and it is not present in any translated value.
- **Italic transfer has 0 real translated cases in this population.** So its collision risk on translated prose is known only from this census, not from real values.

## 5. Multi-space gaps inside translated blocks

- **In source lines: 0 of 162.** Control: the detector finds HClsoln's two 10-space gaps.
- **On the wire: 19 of 162** blocks were sent with a double space. The cause is `emit-blocks.py:46` `joined = key if arc else ' '.join(lines)` applied to a line that already ends in a space: `Mass of |Mg(OH)2` → wire `Mass of  Mg(OH)2`.
  - All 19 values contain **0 multi-spaces**. The MT collapsed them.
  - Examples:
    - `Volume of  solution B` → `Rúmmál lausnar B`
    - `Stoichiometric  factor` → `Efnajöfnustuðull`
    - `Concentration  of HCl` → `Styrkur HCl`
    - `Percent  CaSO4` → `Prósenta CaSO4`
  - This is harmless: the gap is an artifact of the join, not layout.
- **Control, showing the MT can preserve a real gap:** both HClsoln identity blocks came back with their **10 spaces intact**:
  - `HCl(g)          HCl(aq)`
  - `HCl(aq) + H2O(l)          H3O+(aq) + Cl–(aq)`

  So all gap damage in the 34 figures happens at `compose.py:252` (`para.split()` / `' '.join`), on blocks the MT returned unchanged. Nothing in the translated population needs a gap fix. **The gap defect (M2) belongs entirely to the English-kept / identity side.**

## 6. Does a source-keyed transfer violate "never decide inject behaviour by comparing two translated strings"?

**Not in the sense the rule forbids, but it inherits the rule's residual hazard, and the safe shape has to answer that hazard.**

- **What the rule is about.** It forbids deciding behaviour from equality between **two independently editable** strings. Example: a paragraph's segment compared against a caption's segment. An edit to either side silently changes the decision, and no test can see a future edit.
- **What the proposed transfer compares.**
  - One side is **fixed**: tokens and masks derived from `runs.json`, which prepare reads from the OpenStax artwork source file. Per `prep/bought-sources.json` those files live under `/home/siggi/dev/repos/Myndir/chemistry-2e/…`, **outside efni and not under `01-source`**. The file is not editor-editable and does not change when an editor edits a value. It does change if a different source edition is resolved, but so does the block key.
  - The other side is the **editable** sidecar value. Nothing about the formatting is *decided* from the value's content. The source says "`C7H5NO3S` has subscripts at 2, 4, 7". The value is only *searched* for where that literal formula now sits.
  - Formula tokens are exactly the text translation should not change (`looks_verbatim` / R-8 philosophy). That is why 36 of 38 survived verbatim.
- **The residual hazard is the rule's own failure mode, on one side.** An editor edit (retyping `H₂O`, `H2 O`, `−`, or replacing a formula with a name) makes the match silently stop. The label falls back to flat text while every count stays green.
- **Safe shape:**
  1. **The source is the only authority for *what* is formatted.** Never infer formatting from the value, e.g. "a digit after a capital letter is a subscript". The `(g)`-grams case above shows exactly how a value-side heuristic italicises the wrong thing. The same heuristic would also wrongly subscript `9,55 g` or `2 H2` coefficients.
  2. **Search the value only for whole source tokens**, then anchored script stretches. Clean boundaries, longest token first, each position consumed once. **Refuse to guess on a non-unique candidate.**
  3. **Best-effort, never refusing and never blanking.** An unplaced token falls back to today's flat drawing of the value, exactly as `missing` / `undecodable` degrade to English rather than deleting anything. The value text is never rewritten.
  4. **Name every miss in the machine-readable report**, alongside `missing` and `undecodable` in `compose-report.json`. For example `unformatted: [{key, token, stretch, candidates}]`. A count-based driver can then see that an editor edit stopped a subscript from applying. The miss is a visible, named state rather than a silent one.
  5. **Optional hardening:** a pin test over the corpus asserting `placed == stretches` for the committed sidecars, with the identity blocks as the positive control. It is the same shape as `alt-writeback-corpus.test.js`, which compares values rather than counts.
- **Not changed by any of this:** the MT and the sidecar format. The mechanism lives entirely in `compose.py`: the source runs are already in hand at `:147`, and the value at `:183`.
- **Not covered here:** the drawing half. Rendering per-character size and baseline shift in `measure` / `wrap` / `ITEMS` / `svgout` is a separate task. Width measurement must use the scripted sizes, or re-centring shifts again.

## 7. Translation-quality oddities seen in passing (not hunted)

These came from one cheap automated pass: the same EN key translated in more than one figure. **4 of 14 such keys got different IS values.**
- `Average atomic|mass (amu)` has three variants:
  - `Meðalatómamassi` (alsulfatemass, aspirin)
  - `Meðalatómmassi` (saltMass)
  - **`Meðalsætismassi`** (chloroform). *sæti* means seat or position, so this looks wrong.
- `Multiply by|Avogadro’s|number (mol–1)` → `Margfalda` (sacch) vs `Margfaldaðu` (copperMoles), a mood / person inconsistency. The same split appears for `Multiply by molar|mass (g/mol)` (vitC vs argon).
- `Divide by molar|mass (g/mol)` → `Deila` (copperMoles, glycine) vs `Deilið` (potassium, sacch).
- FishLemon, from the brief: `Putrescine` → `Pútresín`, but `Putrescinium ion` → `Pútreskínjón`, whose stem is inconsistent with the first.
- `Mass of X` → `Massi X` throughout. That is nominative where a label might want a genitive construction. It is a style question, flagged only.

These are not formatting defects. They are relevant to an editor pass and to why sidecars are editor-editable at all, and therefore to why §6 has to be robust to edits.

## Caveats

- The script thresholds (`SCRIPT_RATIO = 0.9`, `SHIFT_FRAC = 0.12`) were chosen, not measured. They are corroborated by the independent smaller-run count, which also gives 34 blocks and 52 runs, and by C4 on HClsoln. Run 1 showed that basing the line size on all characters mis-classifies `C8H18` (`^.^..`). Basing it on letters gives `.v.vv`, which is the version reported here.
- The population is these 34 figures only. Italic and synthetic slant have 0 translated instances, so the italic transfer path is validated only on identity blocks.
- The transfer prototype is a feasibility measurement, not a design. It does not draw anything.
