# c9 — §C140 ⑨: decimal separators in KEPT figure labels (evidence for a rule)

**Date:** 2026-09-13. **Cost:** 0 ISK — nothing that calls the MT was run. **Repo:** read-only
(`git status --porcelain` empty at start, between steps and at the end — verbatim at the bottom).
**Scratch:** `/home/siggi/dev/scratch-c140/c9/` (scripts, `out/`, `inherited/`).

## Headline

1. **The 35 kept decimals in the five ch03 mass-table figures are a REGRESSION of the new
   pipeline, not an original defect.** The June-vintage copies committed in efni's
   `05-publication/mt-preview/chapters/03/images/media/` (`9269fcda`, "localize chapter 1-9
   figures") draw all **35 of 35** as commas (`26,98`). The new compose pipeline draws **35 of
   35** as points, measured in `books/efnafraedi-2e/media/*_IS.svg` at `b28dbe22`. The points
   are **not E's doing**: USER-REVIEW rows 7, 8, 10, 12 and 13 say "same as BEFORE", and E's
   `kept_changed` is 0 on those figures, so the 2026-09-12 composition already drew `26.98`. This
   is the same shape as the ⑭ TempScales correction. If the new composition of those five
   figures is published before ⑨ lands, it replaces comma copies with point copies. That
   comparison is against the committed June files; what the site serves was not fetched.
2. **The ⑭ ruling cannot reach this population.** [USER] ruled on 2026-09-04 (figure
   `REGISTER.md` ⑭) that number localization is *"OFFERED, never applied automatically"*, through
   the review card's `Nota` button. But **a `send:false` label has no card**. The sidecar carries
   only `send:true` keys (alsulfatemass: 5 blocks, none numeric), and an edit to any other key is
   *orphaned* (`figureReviewService.resolveBlocks`). Spec §5 said *"Verbatim blocks are shown and
   are editable"*. The built surface does not do that. So ⑨ needs a ruling, not only a regex:
   either an automatic rule for kept numbers or a card for them.
3. **The swap is mechanically safe.** In all four Liberation Sans faces, `.` and `,` both advance
   569/2048 em, and neither is kerned against a digit. The swap is one character for one
   character. On the composed population no number is split across runs. A rule can therefore
   run per run, inside `compose.py`'s kept branch after `block_key`, and neither keys nor glyph
   positions move.
4. **The "what counts as a decimal" rule is decided by about a dozen strings, and they are listed
   below.** Over **727** kept line instances corpus-wide, the three candidate rules differ on
   **exactly 32 distinct line texts**: tuples, thousands, the minus sign in the same run, a
   degree sign attached, parentheses, overprint fragments. On the 34 bought figures all three
   change the same 35 lines and nothing else.

## Instruments, provenance, controls

| dataset | what | provenance | control I ran |
|---|---|---|---|
| `evidence/2026-09-13-compose-fidelity/data/2b-translated.jsonl` | 367 drawn blocks of the 34: key, state, value | frozen, in repo | — |
| `inherited/1b-census.jsonl` | 1,148 figure rows + 14,962 block rows, each with `key`, `send`, `figure_composed` and per-run `[text,size,along,proj,adv,rot,font]` | **INHERITED**: copied from a dead session's tmpfs scratchpad (`/tmp/claude-1000/…/d293cd29-…/scratchpad/findings/1b-census.jsonl`), sha256 `46039abc…c5a6`, identical before and after copy | (a) the 34 figures' ordered `(key, send)` from 1b equals `(key, state≠never-sent)` from 2b on **34/34 figures, 367/367 blocks**. (b) A fresh `readlayer.read` of 3 figures (alsulfatemass .pdf, aspirin .eps, HClsoln .pdf) gives runs **identical** to the census: 24/24/9 blocks, 26/26/53 runs. (c) Rebuilding each block's key from the stored runs via `FT.lines` matches the stored key on **14,962/14,962** blocks (0 mismatches). |
| `books/efnafraedi-2e/media/<b>_IS.svg` (E) and `05-publication/mt-preview/chapters/03/images/media/<b>_IS.svg` (June) | what is drawn | committed bytes | For the 35 values: E has 35 points and 0 commas. June has 35 commas and 0 points. The E SVGs' 2 translated decimals are commas, which is a positive control for the `<text>` parser. |

The 1b funnel is inherited and was re-derived by my census: **463 composed figures → 11,312
redrawn blocks = 8,366 `send:false` + 2,763 `send:true` unbought + 176 translated + 7
identity**, plus 3,650 blocks in non-composed figures. My counts match 1b's published funnel
exactly. "Composed" means `sendable > 0`, per `tools/lib/figure-classify.js:143`, which I
re-read.

**Units used below.** A *block* is a `blocks.json` entry. A *line instance* is one
`FT.lines` line of one block. A *token match* is one number with a separator. A *figure* is a
basename. Every number below says which unit it counts.

---

## 1. The project's convention (from the repo)

| file:line | text |
|---|---|
| `.claude/skills/editorial-pass1/SKILL.md:76-80` | `### Punctuation Conventions` … `- Decimal separator: comma (3,14 not 3.14)` · `- Thousands separator: period or space (1.000 or 1 000)` |
| `docs/editorial/pass1-linguistic.md:146-152` | `### Icelandic Style` … `- Use Icelandic number formatting (comma as decimal separator)` |
| `docs/editorial/pass2-localization.md:215-221` | the same `### Icelandic Style` block under `## General Guidelines`, word for word |
| `experiments/figure-text-translation/REGISTER.md` ⑭ / ① | *"TRANSLATE (prose) · **LOCALIZE** (numbers — Icelandic uses a decimal comma) · VERBATIM"*; *"The decimal-comma convention is not new: it is stated at `.claude/skills/editorial-pass1/SKILL.md:79`"* |
| `docs/superpowers/specs/2026-09-02-figure-text-review-workflow-design.md:132-135` | *"`373.15 K` must never go on the wire (it is not a translation problem) and must still be correctable to `373,15 K` (it is a localization problem)"* |

No number-formatting rule was found (grep, with `-a`) in `docs/editorial/terminology.md`,
`.claude/skills/localization/SKILL.md`, any of `docs/workflow/*.md`, or
`~/.claude/skills/icelandic-context/SKILL.md` (50 lines; that skill lives in the user's global
skills, not in the repo). As a positive control, the same grep did fire on the pass-1 lines
above.

**Pass 1 or Pass 2?** The editorial documents put it under **Pass 1**: it is in the Pass-1
skill's *Punctuation Conventions*, and in the shared *Icelandic Style* boilerplate that both
pass documents carry. Pass 2's *What to Change* section (units, cultural references, local
context) says nothing about number format. Pass 1's *DO NOT* list ("Convert units …") does not
exclude it either. The figure track calls it "localization", but it means a class of figure
text, not the Pass-2 stage. The code agrees with Pass 1 (§2): `localizeNumbersInMathML` runs
unconditionally on every track, **mt-preview included**.

⚠️ **The thousands convention is two-valued in the skill ("period or space").** The repo's
practice is the period: the MT wrote period groups 3/3 in ch03/ch04, and the render code turned
11/11 book-wide MathML thousands into period groups (§2).

## 2. What the chapter text does today

**Code.** Exactly one transform exists: `tools/lib/mathml-to-latex.js` `localizeNumbersInMathML`.
It is called by `cnxml-render.js` (`renderEquation` :2064, table equations :2535) and by
`tools/lib/cnxml-elements.js` (`renderEquation` :518, `processInlineContent` :746, i.e. inline
math). For `<m:mn>` it runs `localizeNumberFull`, which converts decimals to commas and US
thousands to period groups. For `<m:mtext>` it converts decimals only. The only other code is
`figure-consistency.cjs` `decimalSeparatorWarnings`, which is advisory: it produces a
suggestion string that an editor applies with one click. `qaCheckService` only *tolerates*
comma decimals. Nothing in `compose.py`, `figtext.py`, `svgout.py`, `figure-run.js` or
`translate-blocks.mjs` touches separators (grep).

**Published mt-preview HTML, ch03 and ch04.** Measured by decoding every MathJax
`data-mml-node="mn"` glyph run (its `data-c` codes), plus prose with `<svg>` stripped:

| measure | ch03 | ch04 |
|---|---|---|
| rendered `<mn>` containing digit`,`digit | **170**, all `data-localized="is"` | **38**, all localized |
| rendered `<mn>` containing digit`.`digit | **0** | **0** |
| control: `01-source` `<m:mn>` containing digit`.`digit | 170 | 38 |
| `data-latex` digit`.`digit / digit`,`digit | 0 / 173 | 0 / 60 |
| `<img alt>` digit`.`digit / digit`,`digit | 0 / 49 | 0 / 2 |
| prose digit`,`digit | 691 | 248 |
| prose digit`.`digit | 100 | 98 |

Every prose point-decimal was classified, and all are named:

- **190** are figure, example, table, section or exercise numbers (`Mynd 3.3`, `Dæmi 4.8`,
  `3.2 Ákvörðun…`, `æfingu 4.42`). A point is correct for these.
- 1 is a doi (`10.1038/srep01447`).
- 3 are thousands in period groups: `30.000`, `64.456 g/mól`, `1.000.000.000.000`.
- **Exactly 1** is a genuine decimal left with a point: `Fe<sub>1</sub>O<sub>1.5</sub>` in
  `3-2-…html`. The display equation directly below it renders the same number as `{1,5}`.

Segment level, `02-for-mt` against `02-mt-output`, ch03+ch04 (unit: EN number token): US
decimals became comma in **758**, kept a point in **2** (the doi and "section 4.1"), and were
not found in **0**. US thousands became a period **3/3**.

Book-wide, `01-source` `<m:mn>` carries **11** thousands-comma values (e.g. `101,325`) and
1,610 point decimals. All 11 are rendered as localized period groups (`101.325`, `96.485`, …).

**Which side is which.** The chapter is **comma** in equations, alt text and prose. The E
figures are the outlier. A concrete case: the ch03 page's alt text for the aspirin table reads
*„108,09“, „8,064“, „64,00“ og „180,15“*, and the prose says *"180,15 amu (Mynd 3.3)"*, while
`CNX_Chem_03_01_aspirin_IS.svg` (E) draws `180.15`.

## 3. The census

A number matches if it is `\d*[.,]\d+([.,]\d+)*`, taken over each LINE's joined run text, with
the run offsets kept so that a run-boundary split can be seen. Trailing separators
(`\d[.,]` with no digit after) were collected separately.

### Population A — the 34 bought figures (367 drawn blocks)

- **Kept blocks with a separator number: 35 blocks / 35 lines / 35 tokens, all `never-sent`,
  all in 5 ch03 figures**:
  - alsulfatemass 7
  - aspirin 7
  - chloroform 7
  - glycinemass 9
  - saltMass 5
- **All 35 are plain decimals and each is a whole run** (`runs=['26.98']`). **0 straddle a run
  boundary.**
- Identity blocks with a separator number: **0 of 7**. The only identity string with a
  separator next to a digit is `H2, Raney Ni` (GreenChem), and that comma is list punctuation.
- Translated blocks with a separator number: 2 (`12.85`, `9.55`). See §4.
- The 35 distinct values:
  - `1.008`×4, `12.01`×4, `16.00`×3, `35.45`×3, `14.007`×2, `22.99`×2
  - `26.98`, `32.06`, `53.96`, `96.18`, `192.00`, `342.14`
  - `108.09`, `8.064`, `64.00`, `180.15`
  - `106.35`, `119.37`
  - `24.02`, `5.040`, `32.00`, `75.07`
  - `58.44`
- Inherited cross-check, not re-measured: the pixel instrument's "decimal comma 0/37" in the
  register equals these 35 + 2.

### Population B — corpus-wide composed figures (463 figures, 8,373 kept blocks = 8,366 `send:false` + 7 identity)

- **727 kept line instances** carry a separator next to a digit:
  - **693** carry a number with a separator (699 token matches; the 6 tuple lines hold 2 each);
  - **34** carry only a trailing separator.
- That is **688 blocks in 55 figures, across 19 chapter directories.**
- **5 periodic tables account for 424 of the 699 token matches.** They are all plain decimals
  and all single-run.
- Class counts, in token matches:

| class | kept `send:false` | named instances |
|---|---|---|
| plain decimal `26.98` | **688** | incl. 43 scientific mantissas (`1.6 × 10–19 C`, exponent in its own smaller run), 22 with an en-dash minus (`–2.303`, `ΔH = –282.5 kJ`) |
| thousands `1,000` | **10** | `2,000` · `2,500` · `2,400mg`×2 (FoodLabel) · `10,744 mm` (Barometer) · `10,000` · `100,000` · **`1,000,000`** (CO2PhasDi) · `1,000` · `5,000` (Exposure2) |
| leading point `.5` | **1** | `.625 g` (HalfLife). Real source text; the other values on that axis are `10 g`, `5 g`, `2.5 g`, `1.25 g` |
| decimal and thousands together `1,234.5` | 0 | — |
| ranges, ratios, times (`1:2`, `0.5–1.0`, `to`) | 0 | — |
| figure/section/equation reference | 0 | — |
| multi-dot / version-like | 0 | — |
| space-grouped thousands (U+0020/00A0/2009/202F) | 0 | — |
| letter-attached formula (`CuSO4.5H2O`, `Fe0.95O`) | 0 | — |
| **split across runs within a line** | **0** | see the control below |

- **Controls for the zeros.** Each classifier fires on a synthetic string:
  - `Figure 3.2` → ref-number
  - `CuSO4.5H2O` → attached-left and attached-right letter
  - `0.5–1.0 M` → range
  - `1,2-dichloroethane` → locant
  - `1:2` → colon
  - `10 000 g` → space-group
- **Control for the run-split zero.** The same instrument finds **7 run-straddling numbers
  outside this population**, all in `CNX_Chem_03_02_moles-6296` (`32.1 g S`, `118.7 g Sn`, …).
  That figure is non-composed, and its blocks are degenerate "arcs" with one glyph per run.
- **Other hazard shapes in the kept population, found by listing and named here:**
  - coordinate tuples `(5.0, 39.0)`, `(10.0, 19.5)`, `(15.0, 13.0)`, `(20.0, 9.8)`,
    `(25.0, 7.8)`, `(30.0, 6.5)` — BoylesLaw1, 6 lines;
  - degree attached: `109.5°` ×2, `106.8°`;
  - parenthesised with a unit: `(2.49 ft)`, `(33.9 ft)`;
  - a list comma after a unit: `–1.36 × 10–19 J, 4` (Hlevels; the `, 4` is a level index);
  - `1 in. = 2.54 cm` (abbreviation dot);
  - **32 overprint fragment blocks** in `CNX_Chem_12_04_HPerDcmp` (`0.`×16, `2.`, `4.`, `6.`,
    `8.` ×4 each). Each sits at the same origin as a full label (`0.500 M`, `2.16 × 104`);
  - list commas after subscripts: `N2, H2` (factory) and the identity `H2, Raney Ni`.
- **Outside the kept population, listed because they bound any scope wider than "kept":**
  - `send:true`, not yet bought: 51 token matches in 45 blocks / 24 figures, including **7 IUPAC
    locants** (`1,2-dichloroethane`, `2,2,4-trimethylpentane`, `1,1,2,2-tetrabromoethane`,
    `1,2,3-propanetriol`, `1,2-ethanediol`, `2,4-difluorohexane`, `2,4-Dinitrophenol`) and
    `…based on a 2,000`. The MathematicalPi mis-decode `boiling point: 9.5 8C` (§C140 ⑦) is
    also here.
  - Non-composed figures: 19 token matches in 5 figures. **No compose-time rule can reach
    them.**
- **Identity blocks corpus-wide cannot be known without buying.** Only the 34 have replies.

**Full distinct lists, with counts, figures and every rule's output, are in the Appendix.**
B1+B2 is the kept population. C is `send:true` unbought, D is non-composed, E is translated,
and F lists trailing separators.

## 4. Translated values — the MT as a free control

34 sidecars hold **169** unique block values; 44 contain a digit. **2** contain a separator
number, and **both are converted**: `12.85 g` → `myndað við hvarf 12,85 g af`, and `9.55 g` →
`…til að mynda 9,55 g af`. There are 0 thousands and 0 point decimals left over. Trailing
separators appear only as punctuation: `með umframmagni af Br2.`,
`CO2, H2O, O2 og aðrar lofttegundir`. In the chapter prose (§2) the MT's thousands form is the
period, 3/3.

## 5. Metrics (fontTools 4.64 from `pylibs`; the exact files `svgout.FACES` embeds — `fc-match` resolves cairo's "Liberation Sans" to the same files)

Advance widths in font units, 2048 per em (Liberation Sans 2.1.5):

| glyph | Regular | Bold | Italic | BoldItalic |
|---|---|---|---|---|
| `.` period | 569 | 569 | 569 | 569 |
| `,` comma | 569 | 569 | 569 | 569 |
| U+0020 space | 569 | 569 | 569 | 569 |
| U+00A0 NBSP | 569 | 569 | 569 | 569 |
| U+202F narrow NBSP | **410** | 410 | 410 | 410 |
| U+2009 thin space | 410 | 410 | 410 | 410 |
| digits `0 1 7` | 1139 | 1139 | 1139 | 1139 |

- **Kerning.** Every pair in the legacy `kern` table and every GPOS pair adjustment was
  enumerated. All GPOS pair subtables are Format 1; there are no class-based pairs. **No pair
  joins a digit with `.` or `,` in any face.** Where a pair does involve `.`/`,`, the two
  separators are kerned identically, with these exceptions: Cyrillic capitals before them in
  Bold, and `r` before them in Italic (−113 before a comma against −76 before a period).
  Neither can occur in a digit context. Positive control: `(T, period)` is kerned −227 (Regular)
  in both the table and GPOS.
- **Verdict.** `.`→`,` and `,`→`.` are width- and kern-neutral between digits in all four faces,
  both for cairo's toy `show_text` (no kerning) and for a browser applying GPOS `kern` to the
  subset. Within a run, later glyphs do not move. A thousands form using U+0020 or U+00A0 is
  also width-neutral. **U+202F would pull later glyphs left by 159/2048 em (~0.7 pt at 9 pt).**
- **Glyph boxes.** The period's bbox sits inside the comma's in all four faces (Regular: period
  187,0–382,219; comma 184,−262–385,219).
- **Overprint probe (cairo, 200 dpi, as `compose.py` draws).** Leaving an HPerDcmp-style `0.`
  fragment unconverted on top of a converted `0,500 M` differs from converting it too by at most
  60–73/255 per pixel, with 0–2 pixels over 64. By contrast, the `.`→`,` swap on its own changes
  7–12 pixels by more than 64 (max ~250). **Visually the fragment disappears inside the comma's
  head.** Only the SVG `<text>` would still read `0.`.

## 6. Where a rule could live

1. **`compose.py`, inside the `if kept:` branch.** This is where `draw_run_exact(b)` is called,
   after `key = block_key(b)` and after the identity decision.
   - Keys, `blocks.json`, `compose-report.json` and the multiset assertions are untouched,
     because only the drawn text changes.
   - `svgout.write_svg` builds each font subset from the drawn text, so `,` is added
     automatically.
   - **Per run is enough for this population.** Rule R2 applied per run gives the same result as
     per line on **100% of composed lines**. It differs on 7 lines, all in the non-composed
     moles-6296.
   - It needs `COMPOSER_VERSION` `'2'` → `'3'` (`tools/lib/figure-text-sidecar.cjs:27`). Its own
     docstring says a bump *"sends every approved figure back to mt-preview until re-reviewed"*.
     Recomposing is 0 ISK (`figure-run --stale`).
2. **Not inside `figtext.run_draw_text` as written.** It returns
   `(text, text != run['text'])`, and the caller reads the second value as *"a `(cid:N)` token
   was removed"*, which names the block in `undecodable`. A decimal swap there would falsely
   report every converted block as undecodable, unless the return contract changes.
3. **Not by adding numeric `send:false` keys to the sidecar.** That breaks `figure-compose.py`
   assertion 2 (`missing` must equal the `send:false` keys; its docstring anticipates exactly
   this). It changes `renderHash`. And it turns the value into a *translation*, so the block
   leaves run-exact for the wrap/anchor/shrink path and E's fix is undone for that block.
4. **`--control` now means "a faithful redraw of the source"** (compose.py docstring). A decision
   is needed on whether the control applies the rule.

**Scope — `send:false` only, or all kept (including identity)?**
- On the 34 there are 0 numeric identity blocks, so the choice changes nothing today.
  Corpus-wide it cannot be known until bought.
- **All-kept scope creates a visible disagreement.** An identity block's sidecar value (what the
  card shows) would read `26.98` while the figure draws `26,98`. The card's
  `decimalSeparatorWarnings` would still suggest `26,98`, and **clicking `Nota` would make the
  value token-different from the English, so `is_identity` is false and the block is re-laid on
  the layout path**. The editor's "fix" would bring back E's damage for that block.
- **`send:false` scope leaves identity blocks with a point** in both the card and the figure:
  consistent, but not localized.
- **`send:false` labels have no review card at all** (see Headline 2). Whatever an automatic rule
  does to them — right or wrong — **no editor sees it.**

**The rule already has one owner** — `tools/lib/figure-consistency.cjs`, pinned by
`server/__tests__/figureCardClientPins.test.js`. A Python rule in `compose.py` would be a second
implementation. Keeping them from drifting needs either a shared fixture of the census strings
with expected outputs, asserted by both a vitest and a Python test, or a single rule both call.

## 7. Hazards and candidate rules

### Real census strings where a naive `(\d)\.(\d)` → `\1,\2` goes wrong or is not enough

| string (figure) | naive result | why it matters |
|---|---|---|
| `(10.0, 19.5)` ×6 (BoylesLaw1) | `(10,0, 19,5)` | a comma decimal inside a comma-separated pair is ambiguous; the Icelandic form would need `;` |
| `1,000,000` (CO2PhasDi) | unchanged | an Icelandic reader reads `1,000,000` as a decimal; it stays misreadable |
| `10,744 mm`, `2,400mg`×2, `2,000`, `2,500`, `10,000`, `100,000`, `1,000`, `5,000` | unchanged | same: **these 10 are misreadable as decimals TODAY**, with or without a decimal rule |
| `0.`/`2.`/`4.`/`6.`/`8.` ×32 fragments (HPerDcmp) | unchanged | a point overprints the new comma. Measured as visually negligible (§5); the text layer is inconsistent |
| `.625 g` (HalfLife) | unchanged | `,625 g` or `0,625 g` is an editorial choice; `0,625` changes the string's length |

### Real census strings where a naive thousands rule goes wrong

| string | naive `,`→`.` | naive `(\d),(\d{3})(?!\d)` (the chapter's `localizeNumberFull`) |
|---|---|---|
| `1,000,000` (kept, CO2PhasDi) | `1.000.000` ✓ | **`1.000,000` ✗** (reads as 1000.000). Executed with node against `mathml-to-latex.js`; also `1,234,567.8` → `1.234,567,8` |
| `1,2-dichloroethane`, `2,2,4-trimethylpentane`, `1,1,2,2-tetrabromoethane`, `1,2,3-propanetriol`, `1,2-ethanediol`, `2,4-difluorohexane`, `2,4-Dinitrophenol` (`send:true`) | **`1.2-dichloroethane` ✗** | unchanged ✓ (needs 3 digits) |
| `N2, H2`, `H2, Raney Ni` (identity), `CO2, H2O, O2,` | **`N2. H2` ✗** if the rule does not require a following digit | unchanged ✓ |
| `with an excess of Br2.` (translated) | — | a trailing-point rule `\d\.(?!\d)` would give **`Br2,` ✗** |
| `1.000 M`, `1.008`, `14.007` (3 digits after the point) | — | a detector that treats `\d\.\d{3}` as Icelandic thousands (`detectNumberFormat` calls it *ambiguous*) would wrongly leave these. The source is always US, so they are decimals |

### Three candidate rules, run over all 727 kept line instances

- **R1 — panel parity.** `figure-consistency.cjs`'s `DECIMAL` (`^\d+\.\d+$` per whitespace
  token), applied per **RUN**, whitespace preserved. Decimals only.
- **R2 — chapter parity, corrected.** Per line:
  - every thousands group `\d{1,3}(,\d{3})+` → `.` (all groups);
  - every digit-flanked `.` → `,`.

  This matches `localizeNumberFull` except that it does not corrupt multi-group numbers.
- **R3 — R2 with guards:**
  - leave any line that holds a decimal followed by `, <number>` (a coordinate tuple);
  - convert a block that is exactly `\d+\.` (an overprint fragment);
  - leave the leading point.

| | line instances changed | left | blocks changed | figures changed | on the 34 |
|---|---|---|---|---|---|
| R1 | 662 | 65 | 660 | 47 | 35 changed, 1 left (`H2, Raney Ni`) |
| R2 | 692 | 35 | 687 | 55 | same 35 / 1 |
| R3 | 718 | 9 | 713 | 55 | same 35 / 1 |

Every rule is length-preserving; this is asserted on all 727 lines.

**The complete list of line texts where the rules disagree.** Everything else is changed
identically by all three (`.`→`,`) or left by all three.

| line text (figure) | R1 | R2 | R3 |
|---|---|---|---|
| `(5.0, 39.0)` `(10.0, 19.5)` `(15.0, 13.0)` `(20.0, 9.8)` `(25.0, 7.8)` `(30.0, 6.5)` (BoylesLaw1) | = | `(5,0, 39,0)` … | = |
| `(2.49 ft)`, `(33.9 ft)` (Barometer) | = | `(2,49 ft)`, `(33,9 ft)` | same as R2 |
| `109.5°` ×2 (Egeom, HybrdOrbit), `106.8°` (NH3) | = | `109,5°`, `106,8°` | same as R2 |
| `ΔH = –282.5 kJ`, `ΔH = –393.5 kJ` (HessCO2) | = | `–282,5`, `–393,5` | same as R2 |
| `–1.36 × 10–19 J, 4`, `–2.18 x 10–18 J, 1`, `–2.42 × 10–19 J, 3`, `–5.45 × 10–19 J, 2`, `–8.72 × 10–20 J, 5` (Hlevels), `–7.24 × 10–19 J` ×2 (Morse, Morse-3a8e) | **=** (the minus is in the SAME run) | converted | same as R2 |
| `2,000`, `2,500`, `2,400mg`×2 (FoodLabel), `10,744 mm` (Barometer), `10,000`, `100,000`, `1,000,000` (CO2PhasDi), `1,000`, `5,000` (Exposure2) | = | `2.000` … `1.000.000` | same as R2 |
| `0.`×16, `2.`×4, `4.`×4, `6.`×4, `8.`×4 (HPerDcmp fragments) | = | = | `0,` `2,` … |

**Left by all three:** `.625 g` (HalfLife), `N2, H2` (factory), and `H2, Raney Ni` (GreenChem,
identity). R1 and R2 also leave the fragments. R1 and R3 also leave the tuples.

⚠️ **R1's handling of negative numbers depends on how the PDF split its runs, not on the
number.** `–0.062` … `–0.500` (KDataH2O2) and `–2.303` … `–3.182` (Exercise02) keep the en-dash
in a **separate** run, so R1 converts them. The Hlevels/Morse/HessCO2 values keep it in the
**same** run, so R1 leaves them. Two instances of one label shape get opposite results.

**What the rules leave to [USER]:**
- thousands: period, space, or leave as is;
- tuples: convert, convert and change the `,` to `;`, or leave;
- leading point: `,625`, `0,625`, or leave;
- whether to touch overprint fragments;
- scope: `send:false` only, or all kept.

---

## Surprises (contradicting a premise)

1. **The ⑨ entry reads as though the kept decimals were always points.** The committed
   June-vintage copies in efni's `05-publication/mt-preview/chapters/03/images/media/`
   (`9269fcda`) draw **35/35 commas**. The new compose pipeline draws **35/35 points** — both the
   2026-09-12 BEFORE composition and E's AFTER; E did not change these blocks. ⑨ is a regression of the new pipeline against the June vintage. This is the
   ⑭ pattern again: REGISTER already corrected the TempScales example once for the same reason.
2. **Spec §5 says *"Verbatim blocks are shown and are editable"*.** The built surface shows only
   the sidecar's `send:true` keys and orphans edits to any other key. ⑭'s one-click `Nota`
   cannot reach any of the 35 ch03 kept decimals, or any of the 727 corpus-wide lines.
3. **REGISTER ⑭ says to reuse `mathml-to-latex.js` for thousands.** Its `localizeNumberFull`
   corrupts multi-group thousands: `1,000,000` → `1.000,000` (executed). Chemistry's `<m:mn>`
   source has 0 multi-group values (the 11 thousands are all single-group), so the chapter
   render has never exposed it. The kept figure population has 1 (CO2PhasDi).
4. **Live review-panel defect, found while checking scope — not fixed (read-only).**
   `decimalSeparatorWarnings` splits on `/\s+/` and joins with one space. It therefore raises a
   "decimal" suggestion for **any value with a double space, even one with no number**.
   - On the 34 committed sidecars it emits **2 warnings, both false**: the two HClsoln
     **identity** values `HCl(aq) + H2O(l)          H3O+(aq) + Cl–(aq)` and
     `HCl(g)          HCl(aq)`.
   - The suggestion collapses the 10-space arrow gap.
   - Clicking `Nota` would destroy that gap **and** turn the identity block into a translation,
     which draws on the layout path. That would undo E's fix for exactly the blocks E fixed.
   - Controls: `373.15 K` → `373,15 K` fires; `a  b` → `a b` also fires.
   - Whether #440 is deployed was not checked.
5. **The obvious home, `run_draw_text`, has a return contract that would mislabel every
   converted block as `undecodable`** (§6).
6. **The frozen `reports/1b-census.md` cites `findings/1b-census.jsonl` as its raw data, but that
   file is not in the repo's evidence directory** (`data/` holds only `1a-blocks.jsonl` and
   `2b-translated.jsonl`). It survived only on a dead session's tmpfs scratchpad. The only
   real-disk copy is now `/home/siggi/dev/scratch-c140/c9/inherited/1b-census.jsonl` (sha256
   `46039abc3937c1d3d1071624b0472ec4a3b81001a3acd9cc4f6fff9e4901c5a6`, 20,746,281 bytes). Whether
   it belongs in the repo is the controller's or [USER]'s call.
7. **"Panel parity" is not one rule on this corpus.** Applied per RUN, R1 converts 11 negatives —
   `–0.062`, `–0.125`, `–0.250`, `–0.500` (KDataH2O2) and `–2.303` … `–3.182` (Exercise02) —
   because the PDF put the en-dash in a separate run. The panel applies the same regex to the
   whole label value, so its `–0.062` token would not match and those 11 would be left.
   Meanwhile the Hlevels/Morse/HessCO2 negatives keep the dash in the same run and are left
   either way.

## Design implications (short)

- **Verify any ⑨ implementation at TEXT level** — `<text>` values in the composed SVG. The pixel
  instrument scores a decimal swap 0/37 (inherited, register). The parser used here is the shape
  to reuse; its positive control is the 2 translated commas in the same files.
- The substitution is length-, width- and kern-neutral, and on the composed population a number
  never spans runs. It can therefore sit in `compose.py`'s kept branch after `block_key`: keys,
  `blocks.json` and the report multisets are untouched. Do not put it in `run_draw_text` without
  changing that function's return contract.
- Do not reuse `localizeNumberFull` as is (multi-group bug). Fix it at its one owner first, or
  write the thousands step so it covers every group.
- A Python rule is a second implementation of `figure-consistency.cjs`'s `DECIMAL`. It needs a
  cross-language agreement fixture built from the census strings in the Appendix.
- `COMPOSER_VERSION` → `'3'` sends every approved figure back to mt-preview. Recomposing costs
  0 ISK.
- No compose-time rule reaches the 5 non-composed figures (19 token matches, including ch03
  `moles-6296`).

## Questions only [USER] can answer

1. **⑭ against ⑨.** ⑭ ruled "offered, never applied automatically" on the premise that a card
   exists. For `send:false` labels no card exists: 35 in ch03, 727 line instances corpus-wide.
   The options:
   - (a) an automatic compose-time rule for kept numbers, an explicit carve-out from ⑭;
   - (b) build the spec-§5 cards for numeric kept blocks, so ⑭ applies as ruled;
   - (c) accept points.
2. **Thousands form for the 10 kept instances.** They are misreadable as decimals today. The
   skill allows "period or space". The MT (3/3) and the chapter MathML (11/11) use the period.
   U+0020 and U+00A0 are width-neutral; U+202F is not.
3. **BoylesLaw1 coordinate pairs** `(10.0, 19.5)` ×6: `(10,0, 19,5)`, `(10,0; 19,5)` (`;` would
   need its own width check), or leave?
4. **`.625 g`** (HalfLife): `,625 g`, `0,625 g`, or leave?
5. **Publication of the five ch03 mass figures.** The E composition regresses them from comma to
   point relative to the June copy. Hold them until ⑨ lands, or accept the regression?

## Scratch files

All under `/home/siggi/dev/scratch-c140/c9/`:

- `control34.py` — the 1b ↔ 2b sequence control
- `runs_control.py` — fresh read against census runs
- `census_sep.py` → `out/matches.jsonl`, `out/census_meta.json`, `out/aux_hits.json`
- `html_numbers.py`, `html_prose_classify.py` → `out/html_numbers.txt`,
  `out/html_prose_classify.txt`
- `seg_numbers.py` → `out/seg_numbers.txt`
- `font_metrics.py`, `kern_symmetry.py`, `overlay_probe.py`
- `mnprobe.mjs` — `localizeNumbersInMathML` executed; `fcprobe.cjs` — the panel check over the
  34 sidecars
- `rules_eval.py` → `out/rules_changed.json`, `out/rules_left.json`
- `appendix.py` → `out/appendix.md`
- `inherited/` — the 1b census, `resolved.json`, `summary.json`

## Repo state

`git -C /home/siggi/dev/repos/namsbokasafn-efni status --porcelain` → (empty output), checked
at start, after the fresh reads, after the node probes, and at the end.

A gitignored write (e.g. `__pycache__`) is invisible to `git status`, so the tree was also
checked with `find /home/siggi/dev/repos/namsbokasafn-efni -newer
/home/siggi/dev/scratch-c140/c9/control34.py -not -path '*/.git/*'` (`control34.py` was this
session's first scratch write). Result: **only the `.git` directory entry itself**. No file or
directory inside the working tree is newer. `find .git -maxdepth 1 -newer …` lists nothing
inside `.git`, and `.git/index` is older (17:02:04 against 17:26:02), so the entry's mtime
comes from a transient lock during a `git status` run — this session's or a concurrent
agent's. Positive control: the same `find -newer` does list `c9/appendix.py` in scratch. Every
Python import of a repo module ran with `-B` or `sys.dont_write_bytecode`.

---

# Appendix — full census lists

### B1. KEPT lines (`send:false` + identity) in composed figures that carry a separator next to a digit — every distinct line

`n` = drawn LINE instances. Periodic-table-only values are collapsed into B2. R1 is applied per RUN (the draw unit); R2/R3 per line (identical to per run on this population — measured). `=` means unchanged. `[34]` = occurs in a bought figure.

| n | line text (runs joined) | class | context | figures | R1 | R2 | R3 |
|---|---|---|---|---|---|---|---|
| 13 | `1.008` [34] | plain-decimal | — | 00_AA_PeriodicPU_img, 01_03_PeriodicPU, 02_05_PerTable1, 03_01_aspirin, 03_01_chloroform, 03_01_glycinemass_img, 18_01_PeriodicPU3, 19_01_PeriodicEConfig | `1,008` | `1,008` | `1,008` |
| 9 | `12.01` [34] | plain-decimal | — | 00_AA_PeriodicPU_img, 01_03_PeriodicPU, 02_05_PerTable1, 03_01_aspirin, 03_01_chloroform, 03_01_glycinemass_img, 18_01_PeriodicPU3, 19_01_PeriodicEConfig | `12,01` | `12,01` | `12,01` |
| 8 | `16.00` [34] | plain-decimal | — | 00_AA_PeriodicPU_img, 01_03_PeriodicPU, 02_05_PerTable1, 03_01_alsulfatemass_img, 03_01_aspirin, 03_01_glycinemass_img, 18_01_PeriodicPU3, 19_01_PeriodicEConfig | `16,00` | `16,00` | `16,00` |
| 7 | `22.99` [34] | plain-decimal | — | 00_AA_PeriodicPU_img, 01_03_PeriodicPU, 02_05_PerTable1, 03_01_saltMass, 18_01_PeriodicPU3, 19_01_PeriodicEConfig | `22,99` | `22,99` | `22,99` |
| 6 | `26.98` [34] | plain-decimal | — | 00_AA_PeriodicPU_img, 01_03_PeriodicPU, 02_05_PerTable1, 03_01_alsulfatemass_img, 18_01_PeriodicPU3, 19_01_PeriodicEConfig | `26,98` | `26,98` | `26,98` |
| 6 | `32.06` [34] | plain-decimal | — | 00_AA_PeriodicPU_img, 01_03_PeriodicPU, 02_05_PerTable1, 03_01_alsulfatemass_img, 18_01_PeriodicPU3, 19_01_PeriodicEConfig | `32,06` | `32,06` | `32,06` |
| 8 | `35.45` [34] | plain-decimal | — | 00_AA_PeriodicPU_img, 01_03_PeriodicPU, 02_05_PerTable1, 03_01_chloroform, 03_01_saltMass, 18_01_PeriodicPU3, 19_01_PeriodicEConfig | `35,45` | `35,45` | `35,45` |
| 1 | `0.5` | plain-decimal | — | 00_BB_Dependence_img | `0,5` | `0,5` | `0,5` |
| 1 | `1.5` | plain-decimal | — | 00_BB_Dependence_img | `1,5` | `1,5` | `1,5` |
| 2 | `2.5` | plain-decimal | — | 00_BB_Dependence_img, 21_06_Exposure2 | `2,5` | `2,5` | `2,5` |
| 1 | `3.5` | plain-decimal | — | 00_BB_Dependence_img | `3,5` | `3,5` | `3,5` |
| 1 | `4.5` | plain-decimal | — | 00_BB_Dependence_img | `4,5` | `4,5` | `4,5` |
| 1 | `1 in. = 2.54 cm` | plain-decimal | — | 01_04_MYdCmIn | `1 in. = 2,54 cm` | `1 in. = 2,54 cm` | `1 in. = 2,54 cm` |
| 1 | `55.0 g` | plain-decimal | — | 01_05_SigDigits1_img | `55,0 g` | `55,0 g` | `55,0 g` |
| 1 | `0.00832407 mL` | plain-decimal | — | 01_05_SigDigits2_img | `0,00832407 mL` | `0,00832407 mL` | `0,00832407 mL` |
| 1 | `70.607 mL` | plain-decimal | — | 01_05_SigDigits2_img | `70,607 mL` | `70,607 mL` | `70,607 mL` |
| 1 | `1.0023` | plain-decimal | — | 01_05_SigDigits4_img | `1,0023` | `1,0023` | `1,0023` |
| 1 | `4.383` | plain-decimal | — | 01_05_SigDigits4_img | `4,383` | `4,383` | `4,383` |
| 1 | `421.23` | plain-decimal | — | 01_05_SigDigits4_img | `421,23` | `421,23` | `421,23` |
| 1 | `5.3853` | plain-decimal | — | 01_05_SigDigits4_img | `5,3853` | `5,3853` | `5,3853` |
| 1 | `64.77` | plain-decimal | — | 01_05_SigDigits4_img | `64,77` | `64,77` | `64,77` |
| 1 | `0.008020` | plain-decimal | — | 01_05_SigDigits5_img | `0,008020` | `0,008020` | `0,008020` |
| 1 | `233.15 K` | plain-decimal | — | 01_06_TempScales | `233,15 K` | `233,15 K` | `233,15 K` |
| 1 | `273.15 K` | plain-decimal | — | 01_06_TempScales | `273,15 K` | `273,15 K` | `273,15 K` |
| 1 | `373.15 K` | plain-decimal | — | 01_06_TempScales | `373,15 K` | `373,15 K` | `373,15 K` |
| 1 | `1.6 × 10–19 C` | plain-decimal | scientific | 02_02_Millikan | `1,6 × 10–19 C` | `1,6 × 10–19 C` | `1,6 × 10–19 C` |
| 1 | `3.2 × 10–19 C` | plain-decimal | scientific | 02_02_Millikan | `3,2 × 10–19 C` | `3,2 × 10–19 C` | `3,2 × 10–19 C` |
| 2 | `4.8 × 10–19 C` | plain-decimal | scientific | 02_02_Millikan | `4,8 × 10–19 C` | `4,8 × 10–19 C` | `4,8 × 10–19 C` |
| 1 | `6.4 × 10–19 C` | plain-decimal | scientific | 02_02_Millikan | `6,4 × 10–19 C` | `6,4 × 10–19 C` | `6,4 × 10–19 C` |
| 1 | `192.00` [34] | plain-decimal | — | 03_01_alsulfatemass_img | `192,00` | `192,00` | `192,00` |
| 1 | `342.14` [34] | plain-decimal | — | 03_01_alsulfatemass_img | `342,14` | `342,14` | `342,14` |
| 1 | `53.96` [34] | plain-decimal | — | 03_01_alsulfatemass_img | `53,96` | `53,96` | `53,96` |
| 1 | `96.18` [34] | plain-decimal | — | 03_01_alsulfatemass_img | `96,18` | `96,18` | `96,18` |
| 1 | `108.09` [34] | plain-decimal | — | 03_01_aspirin | `108,09` | `108,09` | `108,09` |
| 1 | `180.15` [34] | plain-decimal | — | 03_01_aspirin | `180,15` | `180,15` | `180,15` |
| 1 | `64.00` [34] | plain-decimal | — | 03_01_aspirin | `64,00` | `64,00` | `64,00` |
| 1 | `8.064` [34] | plain-decimal | — | 03_01_aspirin | `8,064` | `8,064` | `8,064` |
| 1 | `106.35` [34] | plain-decimal | — | 03_01_chloroform | `106,35` | `106,35` | `106,35` |
| 1 | `119.37` [34] | plain-decimal | — | 03_01_chloroform | `119,37` | `119,37` | `119,37` |
| 2 | `14.007` [34] | plain-decimal | — | 03_01_glycinemass_img | `14,007` | `14,007` | `14,007` |
| 1 | `24.02` [34] | plain-decimal | — | 03_01_glycinemass_img | `24,02` | `24,02` | `24,02` |
| 1 | `32.00` [34] | plain-decimal | — | 03_01_glycinemass_img | `32,00` | `32,00` | `32,00` |
| 1 | `5.040` [34] | plain-decimal | — | 03_01_glycinemass_img | `5,040` | `5,040` | `5,040` |
| 1 | `75.07` [34] | plain-decimal | — | 03_01_glycinemass_img | `75,07` | `75,07` | `75,07` |
| 1 | `58.44` [34] | plain-decimal | — | 03_01_saltMass | `58,44` | `58,44` | `58,44` |
| 1 | `H2, Raney Ni` [34] | trailing-separator | — | 04_04_GreenChem | = | = | = |
| 1 | `2,000` | thousands | — | 05_02_FoodLabel | = | `2.000` | `2.000` |
| 2 | `2,400mg` | thousands | attached-right-letter | 05_02_FoodLabel | = | `2.400mg` | `2.400mg` |
| 1 | `2,500` | thousands | — | 05_02_FoodLabel | = | `2.500` | `2.500` |
| 1 | `ΔH = –282.5 kJ` | plain-decimal | negative | 05_03_HessCO2 | = | `ΔH = –282,5 kJ` | `ΔH = –282,5 kJ` |
| 1 | `ΔH = –393.5 kJ` | plain-decimal | negative | 05_03_HessCO2 | = | `ΔH = –393,5 kJ` | `ΔH = –393,5 kJ` |
| 4 | `1.0` | plain-decimal | — | 06_01_Blackbody, 11_03_gasdissolv, 14_03_strengths | `1,0` | `1,0` | `1,0` |
| 2 | `2.0` | plain-decimal | — | 06_01_Blackbody, 11_03_gasdissolv | `2,0` | `2,0` | `2,0` |
| 1 | `3.0` | plain-decimal | — | 06_01_Blackbody | `3,0` | `3,0` | `3,0` |
| 1 | `0.00 ` | plain-decimal | — | 06_01_Solardist | `0,00 ` | `0,00 ` | `0,00 ` |
| 1 | `0.25 ` | plain-decimal | — | 06_01_Solardist | `0,25 ` | `0,25 ` | `0,25 ` |
| 1 | `0.50 ` | plain-decimal | — | 06_01_Solardist | `0,50 ` | `0,50 ` | `0,50 ` |
| 1 | `0.75 ` | plain-decimal | — | 06_01_Solardist | `0,75 ` | `0,75 ` | `0,75 ` |
| 1 | `1.00 ` | plain-decimal | — | 06_01_Solardist | `1,00 ` | `1,00 ` | `1,00 ` |
| 1 | `1.25 ` | plain-decimal | — | 06_01_Solardist | `1,25 ` | `1,25 ` | `1,25 ` |
| 1 | `1.50 ` | plain-decimal | — | 06_01_Solardist | `1,50 ` | `1,50 ` | `1,50 ` |
| 1 | `1.75 ` | plain-decimal | — | 06_01_Solardist | `1,75 ` | `1,75 ` | `1,75 ` |
| 1 | `2.00 ` | plain-decimal | — | 06_01_Solardist | `2,00 ` | `2,00 ` | `2,00 ` |
| 1 | `0.0 J, ∞` | plain-decimal | — | 06_02_Hlevels | `0,0 J, ∞` | `0,0 J, ∞` | `0,0 J, ∞` |
| 1 | `–1.36 × 10–19 J, 4` | plain-decimal | negative, scientific | 06_02_Hlevels | = | `–1,36 × 10–19 J, 4` | `–1,36 × 10–19 J, 4` |
| 1 | `–2.18 x 10–18 J, 1` | plain-decimal | negative, scientific | 06_02_Hlevels | = | `–2,18 x 10–18 J, 1` | `–2,18 x 10–18 J, 1` |
| 1 | `–2.42 × 10–19 J, 3` | plain-decimal | negative, scientific | 06_02_Hlevels | = | `–2,42 × 10–19 J, 3` | `–2,42 × 10–19 J, 3` |
| 1 | `–5.45 × 10–19 J, 2` | plain-decimal | negative, scientific | 06_02_Hlevels | = | `–5,45 × 10–19 J, 2` | `–5,45 × 10–19 J, 2` |
| 1 | `–8.72 × 10–20 J, 5` | plain-decimal | negative, scientific | 06_02_Hlevels | = | `–8,72 × 10–20 J, 5` | `–8,72 × 10–20 J, 5` |
| 1 | `0.74` | plain-decimal | — | 07_02_Morse | `0,74` | `0,74` | `0,74` |
| 2 | `–7.24 × 10–19 J` | plain-decimal | negative, scientific | 07_02_Morse, 08_01_Morse-3a8e | = | `–7,24 × 10–19 J` | `–7,24 × 10–19 J` |
| 2 | `109.5°` | plain-decimal | — | 07_06_Egeom, 08_02_HybrdOrbit | = | `109,5°` | `109,5°` |
| 1 | `106.8°` | plain-decimal | — | 07_06_NH3 | = | `106,8°` | `106,8°` |
| 1 | `(2.49 ft)` | plain-decimal | — | 09_01_Barometer | = | `(2,49 ft)` | `(2,49 ft)` |
| 1 | `(33.9 ft)` | plain-decimal | — | 09_01_Barometer | = | `(33,9 ft)` | `(33,9 ft)` |
| 1 | `10,744 mm` | thousands | — | 09_01_Barometer | = | `10.744 mm` | `10.744 mm` |
| 1 | `36.0` | plain-decimal | — | 09_02_Amontons2 | `36,0` | `36,0` | `36,0` |
| 1 | `46.4` | plain-decimal | — | 09_02_Amontons2 | `46,4` | `46,4` | `46,4` |
| 1 | `56.7` | plain-decimal | — | 09_02_Amontons2 | `56,7` | `56,7` | `56,7` |
| 1 | `67.1` | plain-decimal | — | 09_02_Amontons2 | `67,1` | `67,1` | `67,1` |
| 1 | `77.5` | plain-decimal | — | 09_02_Amontons2 | `77,5` | `77,5` | `77,5` |
| 1 | `88.0` | plain-decimal | — | 09_02_Amontons2 | `88,0` | `88,0` | `88,0` |
| 1 | `(10.0, 19.5)` | plain-decimal | — | 09_03_BoylesLaw1 | = | `(10,0, 19,5)` | = |
| 1 | `(15.0, 13.0)` | plain-decimal | — | 09_03_BoylesLaw1 | = | `(15,0, 13,0)` | = |
| 1 | `(20.0, 9.8)` | plain-decimal | — | 09_03_BoylesLaw1 | = | `(20,0, 9,8)` | = |
| 1 | `(25.0, 7.8)` | plain-decimal | — | 09_03_BoylesLaw1 | = | `(25,0, 7,8)` | = |
| 1 | `(30.0, 6.5)` | plain-decimal | — | 09_03_BoylesLaw1 | = | `(30,0, 6,5)` | = |
| 1 | `(5.0, 39.0)` | plain-decimal | — | 09_03_BoylesLaw1 | = | `(5,0, 39,0)` | = |
| 3 | `0.02` | plain-decimal | — | 09_03_BoylesLaw1, 13_02_mixtures | `0,02` | `0,02` | `0,02` |
| 3 | `0.04` | plain-decimal | — | 09_03_BoylesLaw1, 13_02_mixtures | `0,04` | `0,04` | `0,04` |
| 3 | `0.06` | plain-decimal | — | 09_03_BoylesLaw1, 13_02_mixtures | `0,06` | `0,06` | `0,06` |
| 3 | `0.08` | plain-decimal | — | 09_03_BoylesLaw1, 13_02_mixtures | `0,08` | `0,08` | `0,08` |
| 1 | `0.1` | plain-decimal | — | 09_03_BoylesLaw1 | `0,1` | `0,1` | `0,1` |
| 1 | `0.12` | plain-decimal | — | 09_03_BoylesLaw1 | `0,12` | `0,12` | `0,12` |
| 1 | `0.14` | plain-decimal | — | 09_03_BoylesLaw1 | `0,14` | `0,14` | `0,14` |
| 1 | `0.16` | plain-decimal | — | 09_03_BoylesLaw1 | `0,16` | `0,16` | `0,16` |
| 1 | `0.18` | plain-decimal | — | 09_03_BoylesLaw1 | `0,18` | `0,18` | `0,18` |
| 1 | `0.22` | plain-decimal | — | 10_02_Question4_img | `0,22` | `0,22` | `0,22` |
| 1 | `0.31` | plain-decimal | — | 10_02_Question4_img | `0,31` | `0,31` | `0,31` |
| 1 | `1.07` | plain-decimal | — | 10_02_Question4_img | `1,07` | `1,07` | `1,07` |
| 1 | `16.1` | plain-decimal | — | 10_02_Question4_img | `16,1` | `16,1` | `16,1` |
| 1 | `1,000,000` | thousands | — | 10_04_CO2PhasDi | = | `1.000.000` (R2 as coded in mathml-to-latex.js: `1.000,000`) | `1.000.000` |
| 1 | `10,000` | thousands | — | 10_04_CO2PhasDi | = | `10.000` | `10.000` |
| 1 | `100,000` | thousands | — | 10_04_CO2PhasDi | = | `100.000` | `100.000` |
| 4 | `0.00` | plain-decimal | — | 12_01_KDataH2O2, 12_01_RRateIll, 13_02_mixtures | `0,00` | `0,00` | `0,00` |
| 2 | `0.010` | plain-decimal | — | 12_01_KDataH2O2, 15_01_ICETable3_img | `0,010` | `0,010` | `0,010` |
| 3 | `0.0208` | plain-decimal | — | 12_01_KDataH2O2, 13_02_mixtures | `0,0208` | `0,0208` | `0,0208` |
| 1 | `0.0417` | plain-decimal | — | 12_01_KDataH2O2 | `0,0417` | `0,0417` | `0,0417` |
| 1 | `0.0625` | plain-decimal | — | 12_01_KDataH2O2 | `0,0625` | `0,0625` | `0,0625` |
| 1 | `0.0833` | plain-decimal | — | 12_01_KDataH2O2 | `0,0833` | `0,0833` | `0,0833` |
| 1 | `0.125` | plain-decimal | — | 12_01_KDataH2O2 | `0,125` | `0,125` | `0,125` |
| 1 | `0.250` | plain-decimal | — | 12_01_KDataH2O2 | `0,250` | `0,250` | `0,250` |
| 1 | `0.500` | plain-decimal | — | 12_01_KDataH2O2 | `0,500` | `0,500` | `0,500` |
| 2 | `1.000` | plain-decimal | — | 12_01_KDataH2O2, 12_01_RRateIll | `1,000` | `1,000` | `1,000` |
| 2 | `12.00` | plain-decimal | — | 12_01_KDataH2O2, 12_01_RRateIll | `12,00` | `12,00` | `12,00` |
| 2 | `18.00` | plain-decimal | — | 12_01_KDataH2O2, 12_01_RRateIll | `18,00` | `18,00` | `18,00` |
| 2 | `24.00` | plain-decimal | — | 12_01_KDataH2O2, 12_01_RRateIll | `24,00` | `24,00` | `24,00` |
| 6 | `6.00` | plain-decimal | — | 12_01_KDataH2O2, 12_01_RRateIll | `6,00` | `6,00` | `6,00` |
| 1 | `–0.062` | plain-decimal | negative | 12_01_KDataH2O2 | `–0,062` | `–0,062` | `–0,062` |
| 1 | `–0.125` | plain-decimal | negative | 12_01_KDataH2O2 | `–0,125` | `–0,125` | `–0,125` |
| 1 | `–0.250` | plain-decimal | negative | 12_01_KDataH2O2 | `–0,250` | `–0,250` | `–0,250` |
| 1 | `–0.500` | plain-decimal | negative | 12_01_KDataH2O2 | `–0,500` | `–0,500` | `–0,500` |
| 1 | `1.0 × 10` | plain-decimal | scientific | 12_01_NH3Decomp | `1,0 × 10` | `1,0 × 10` | `1,0 × 10` |
| 1 | `2.0 × 10` | plain-decimal | scientific | 12_01_NH3Decomp | `2,0 × 10` | `2,0 × 10` | `2,0 × 10` |
| 1 | `3.0 × 10` | plain-decimal | scientific | 12_01_NH3Decomp | `3,0 × 10` | `3,0 × 10` | `3,0 × 10` |
| 1 | `4.0 × 10` | plain-decimal | scientific | 12_01_NH3Decomp | `4,0 × 10` | `4,0 × 10` | `4,0 × 10` |
| 1 | `0.000` | plain-decimal | — | 12_01_RRateIll | `0,000` | `0,000` | `0,000` |
| 1 | `0.200` | plain-decimal | — | 12_01_RRateIll | `0,200` | `0,200` | `0,200` |
| 1 | `0.400` | plain-decimal | — | 12_01_RRateIll | `0,400` | `0,400` | `0,400` |
| 1 | `0.600` | plain-decimal | — | 12_01_RRateIll | `0,600` | `0,600` | `0,600` |
| 1 | `1.0 × 10–3` | plain-decimal | scientific | 12_04_AmDecomK | `1,0 × 10–3` | `1,0 × 10–3` | `1,0 × 10–3` |
| 1 | `2.0 × 10–3` | plain-decimal | scientific | 12_04_AmDecomK | `2,0 × 10–3` | `2,0 × 10–3` | `2,0 × 10–3` |
| 1 | `3.0 × 10–3` | plain-decimal | scientific | 12_04_AmDecomK | `3,0 × 10–3` | `3,0 × 10–3` | `3,0 × 10–3` |
| 1 | `1.00 × 104` | plain-decimal | scientific | 12_04_Exercise02_img | `1,00 × 104` | `1,00 × 104` | `1,00 × 104` |
| 1 | `1.50 × 104` | plain-decimal | scientific | 12_04_Exercise02_img | `1,50 × 104` | `1,50 × 104` | `1,50 × 104` |
| 1 | `2.00 × 104` | plain-decimal | scientific | 12_04_Exercise02_img | `2,00 × 104` | `2,00 × 104` | `2,00 × 104` |
| 1 | `2.50 × 104` | plain-decimal | scientific | 12_04_Exercise02_img | `2,50 × 104` | `2,50 × 104` | `2,50 × 104` |
| 1 | `3.00 × 104` | plain-decimal | scientific | 12_04_Exercise02_img | `3,00 × 104` | `3,00 × 104` | `3,00 × 104` |
| 1 | `3.50 × 104` | plain-decimal | scientific | 12_04_Exercise02_img | `3,50 × 104` | `3,50 × 104` | `3,50 × 104` |
| 1 | `4.00 × 104` | plain-decimal | scientific | 12_04_Exercise02_img | `4,00 × 104` | `4,00 × 104` | `4,00 × 104` |
| 1 | `5.00 × 103` | plain-decimal | scientific | 12_04_Exercise02_img | `5,00 × 103` | `5,00 × 103` | `5,00 × 103` |
| 1 | `–2.303` | plain-decimal | negative | 12_04_Exercise02_img | `–2,303` | `–2,303` | `–2,303` |
| 1 | `–2.412` | plain-decimal | negative | 12_04_Exercise02_img | `–2,412` | `–2,412` | `–2,412` |
| 1 | `–2.523` | plain-decimal | negative | 12_04_Exercise02_img | `–2,523` | `–2,523` | `–2,523` |
| 1 | `–2.632` | plain-decimal | negative | 12_04_Exercise02_img | `–2,632` | `–2,632` | `–2,632` |
| 1 | `–2.852` | plain-decimal | negative | 12_04_Exercise02_img | `–2,852` | `–2,852` | `–2,852` |
| 1 | `–2.962` | plain-decimal | negative | 12_04_Exercise02_img | `–2,962` | `–2,962` | `–2,962` |
| 1 | `–3.182` | plain-decimal | negative | 12_04_Exercise02_img | `–3,182` | `–3,182` | `–3,182` |
| 16 | `0.` | trailing-separator | — | 12_04_HPerDcmp | = | = | `0,` |
| 2 | `0.0625 M` | plain-decimal | — | 12_04_HPerDcmp | `0,0625 M` | `0,0625 M` | `0,0625 M` |
| 2 | `0.125 M` | plain-decimal | — | 12_04_HPerDcmp | `0,125 M` | `0,125 M` | `0,125 M` |
| 2 | `0.250 M` | plain-decimal | — | 12_04_HPerDcmp | `0,250 M` | `0,250 M` | `0,250 M` |
| 2 | `0.500 M` | plain-decimal | — | 12_04_HPerDcmp | `0,500 M` | `0,500 M` | `0,500 M` |
| 2 | `1.000 M` | plain-decimal | — | 12_04_HPerDcmp | `1,000 M` | `1,000 M` | `1,000 M` |
| 4 | `2.` | trailing-separator | — | 12_04_HPerDcmp | = | = | `2,` |
| 1 | `2.16 × 104` | plain-decimal | scientific | 12_04_HPerDcmp | `2,16 × 104` | `2,16 × 104` | `2,16 × 104` |
| 1 | `2.16 × 104 s` | plain-decimal | scientific | 12_04_HPerDcmp | `2,16 × 104 s` | `2,16 × 104 s` | `2,16 × 104 s` |
| 4 | `4.` | trailing-separator | — | 12_04_HPerDcmp | = | = | `4,` |
| 1 | `4.32 × 104` | plain-decimal | scientific | 12_04_HPerDcmp | `4,32 × 104` | `4,32 × 104` | `4,32 × 104` |
| 1 | `4.32 × 104 s` | plain-decimal | scientific | 12_04_HPerDcmp | `4,32 × 104 s` | `4,32 × 104 s` | `4,32 × 104 s` |
| 4 | `6.` | trailing-separator | — | 12_04_HPerDcmp | = | = | `6,` |
| 1 | `6.48 × 104` | plain-decimal | scientific | 12_04_HPerDcmp | `6,48 × 104` | `6,48 × 104` | `6,48 × 104` |
| 1 | `6.48 × 104 s` | plain-decimal | scientific | 12_04_HPerDcmp | `6,48 × 104 s` | `6,48 × 104 s` | `6,48 × 104 s` |
| 4 | `8.` | trailing-separator | — | 12_04_HPerDcmp | = | = | `8,` |
| 2 | `8.64 × 104 s` | plain-decimal | scientific | 12_04_HPerDcmp | `8,64 × 104 s` | `8,64 × 104 s` | `8,64 × 104 s` |
| 1 | ` 0.000` | plain-decimal | — | 13_02_mixtures | ` 0,000` | ` 0,000` | ` 0,000` |
| 1 | ` 0.00446` | plain-decimal | — | 13_02_mixtures | ` 0,00446` | ` 0,00446` | ` 0,00446` |
| 1 | `0.00160` | plain-decimal | — | 13_02_mixtures | `0,00160` | `0,00160` | `0,00160` |
| 1 | `0.00175` | plain-decimal | — | 13_02_mixtures | `0,00175` | `0,00175` | `0,00175` |
| 1 | `0.00909` | plain-decimal | — | 13_02_mixtures | `0,00909` | `0,00909` | `0,00909` |
| 2 | `0.0108` | plain-decimal | — | 13_02_mixtures | `0,0108` | `0,0108` | `0,0108` |
| 1 | `0.0115` | plain-decimal | — | 13_02_mixtures | `0,0115` | `0,0115` | `0,0115` |
| 1 | `0.0117` | plain-decimal | — | 13_02_mixtures | `0,0117` | `0,0117` | `0,0117` |
| 2 | `0.0135` | plain-decimal | — | 13_02_mixtures | `0,0135` | `0,0135` | `0,0135` |
| 1 | `0.0190` | plain-decimal | — | 13_02_mixtures | `0,0190` | `0,0190` | `0,0190` |
| 1 | `0.0231` | plain-decimal | — | 13_02_mixtures | `0,0231` | `0,0231` | `0,0231` |
| 2 | `0.0243` | plain-decimal | — | 13_02_mixtures | `0,0243` | `0,0243` | `0,0243` |
| 2 | `0.0260` | plain-decimal | — | 13_02_mixtures | `0,0260` | `0,0260` | `0,0260` |
| 1 | `0.0330` | plain-decimal | — | 13_02_mixtures | `0,0330` | `0,0330` | `0,0330` |
| 2 | `0.0468` | plain-decimal | — | 13_02_mixtures | `0,0468` | `0,0468` | `0,0468` |
| 5 | `0.10` | plain-decimal | — | 13_02_mixtures, 14_06_ICETable16_img, 15_02_ICETable1_img | `0,10` | `0,10` | `0,10` |
| 3 | `0.640` | plain-decimal | — | 13_02_mixtures | `0,640` | `0,640` | `0,640` |
| 1 | `N2, H2` | trailing-separator | — | 13_03_factory | = | = | = |
| 1 | `+3.39 × 10` | plain-decimal | scientific | 13_04_ICETable2_img | `+3,39 × 10` | `+3,39 × 10` | `+3,39 × 10` |
| 2 | `1.000 × 10` | plain-decimal | scientific | 13_04_ICETable2_img | `1,000 × 10` | `1,000 × 10` | `1,000 × 10` |
| 1 | `3.39 × 10` | plain-decimal | scientific | 13_04_ICETable2_img | `3,39 × 10` | `3,39 × 10` | `3,39 × 10` |
| 1 | `6.61 × 10` | plain-decimal | scientific | 13_04_ICETable2_img | `6,61 × 10` | `6,61 × 10` | `6,61 × 10` |
| 1 | `6.61 × 10–4` | plain-decimal | scientific | 13_04_ICETable2_img | `6,61 × 10–4` | `6,61 × 10–4` | `6,61 × 10–4` |
| 2 | `–3.39 × 10` | plain-decimal | negative, scientific | 13_04_ICETable2_img | `–3,39 × 10` | `–3,39 × 10` | `–3,39 × 10` |
| 1 | `0.15` | plain-decimal | — | 13_04_ICETable30_img | `0,15` | `0,15` | `0,15` |
| 1 | `0.15 – x` | plain-decimal | — | 13_04_ICETable30_img | `0,15 – x` | `0,15 – x` | `0,15 – x` |
| 1 | `1.00` | plain-decimal | — | 13_04_ICETable3_img | `1,00` | `1,00` | `1,00` |
| 1 | `1.00 – x` | plain-decimal | — | 13_04_ICETable3_img | `1,00 – x` | `1,00 – x` | `1,00 – x` |
| 1 | `0.534` | plain-decimal | — | 14_03_ICETable3_img | `0,534` | `0,534` | `0,534` |
| 1 | `0.534 + (–x)` | plain-decimal | — | 14_03_ICETable3_img | `0,534 + (–x)` | `0,534 + (–x)` | `0,534 + (–x)` |
| 1 | `0.50` | plain-decimal | — | 14_03_ICETable5_img | `0,50` | `0,50` | `0,50` |
| 1 | `0.50 + (–x) =` | plain-decimal | — | 14_03_ICETable5_img | `0,50 + (–x) =` | `0,50 + (–x) =` | `0,50 + (–x) =` |
| 1 | `0.50 – x` | plain-decimal | — | 14_03_ICETable5_img | `0,50 – x` | `0,50 – x` | `0,50 – x` |
| 1 | `0.033` | plain-decimal | — | 14_05_ICETable1_img | `0,033` | `0,033` | `0,033` |
| 1 | `0.033 – x` | plain-decimal | — | 14_05_ICETable1_img | `0,033 – x` | `0,033 – x` | `0,033 – x` |
| 1 | `0.10 + x` | plain-decimal | — | 14_06_ICETable16_img | `0,10 + x` | `0,10 + x` | `0,10 + x` |
| 2 | `0.10 – x` | plain-decimal | — | 14_06_ICETable16_img, 15_02_ICETable1_img | `0,10 – x` | `0,10 – x` | `0,10 – x` |
| 1 | `0.010 + x ` | plain-decimal | — | 15_01_ICETable3_img | `0,010 + x ` | `0,010 + x ` | `0,010 + x ` |
| 2 | `+ 0.337 V` | plain-decimal | — | 17_03_GalvanCu | `+ 0,337 V` | `+ 0,337 V` | `+ 0,337 V` |
| 1 | `.625 g` | leading-point | — | 21_03_HalfLife | = | = | = |
| 1 | `1.25 g` | plain-decimal | — | 21_03_HalfLife | `1,25 g` | `1,25 g` | `1,25 g` |
| 1 | `12.5` | plain-decimal | — | 21_03_HalfLife | `12,5` | `12,5` | `12,5` |
| 1 | `2.5 g` | plain-decimal | — | 21_03_HalfLife | `2,5 g` | `2,5 g` | `2,5 g` |
| 1 | `5.272 a` | plain-decimal | — | 21_05_Co60Decay | `5,272 a` | `5,272 a` | `5,272 a` |
| 1 | `1,000` | thousands | — | 21_06_Exposure2 | = | `1.000` | `1.000` |
| 1 | `5,000` | thousands | — | 21_06_Exposure2 | = | `5.000` | `5.000` |

B1 line instances: 342. Figure lists name each figure once; the per-figure multiplicity is in `n`.

### B2. Values that occur ONLY in the 5 periodic tables — all plain-decimal, single-run, and changed identically by R1, R2 and R3 (`.`→`,`)

figures: 00_AA_PeriodicPU_img, 01_03_PeriodicPU, 02_05_PerTable1, 18_01_PeriodicPU3, 19_01_PeriodicEConfig; line instances: 385; distinct values: 77

value ×instances: `4.003`×5 · `6.94`×5 · `9.012`×5 · `10.81`×5 · `14.01`×5 · `19.00`×5 · `20.18`×5 · `24.31`×5 · `28.09`×5 · `30.97`×5 · `39.10`×5 · `39.95`×5 · `40.08`×5 · `44.96`×5 · `47.87`×5 · `50.94`×5 · `52.00`×5 · `54.94`×5 · `55.85`×5 · `58.69`×5 · `58.93`×5 · `63.55`×5 · `65.38`×5 · `69.72`×5 · `72.63`×5 · `74.92`×5 · `78.97`×5 · `79.90`×5 · `83.80`×5 · `85.47`×5 · `87.62`×5 · `88.91`×5 · `91.22`×5 · `92.91`×5 · `95.95`×5 · `101.1`×5 · `102.9`×5 · `106.4`×5 · `107.9`×5 · `112.4`×5 · `114.8`×5 · `118.7`×5 · `121.8`×5 · `126.9`×5 · `127.6`×5 · `131.3`×5 · `132.9`×5 · `137.3`×5 · `138.9`×5 · `140.1`×5 · `140.9`×5 · `144.2`×5 · `150.4`×5 · `152.0`×5 · `157.3`×5 · `158.9`×5 · `162.5`×5 · `164.9`×5 · `167.3`×5 · `168.9`×5 · `173.1`×5 · `175.0`×5 · `178.5`×5 · `180.9`×5 · `183.8`×5 · `186.2`×5 · `190.2`×5 · `192.2`×5 · `195.1`×5 · `197.0`×5 · `200.6`×5 · `204.4`×5 · `207.2`×5 · `209.0`×5 · `231.0`×5 · `232.0`×5 · `238.0`×5

B1 + B2 line instances: 727

### C. `send:true` lines in composed figures NOT yet bought (MT decides; kept only if the reply is identity)

| n | line text | class | context | runs straddled | figures |
|---|---|---|---|---|---|
| 1 | `= 17.1 mL` | plain-decimal | — | 0 | 01_04_CylGold |
| 1 | `= 19.8 mL` | plain-decimal | — | 0 | 01_04_CylGold |
| 1 | `= 51.842 g` | plain-decimal | — | 0 | 01_04_CylGold |
| 1 | `= 13.5 mL` | plain-decimal | — | 0 | 01_04_CylRebar |
| 1 | `= 22.4 mL` | plain-decimal | — | 0 | 01_04_CylRebar |
| 1 | `= 69.658 g` | plain-decimal | — | 0 | 01_04_CylRebar |
| 1 | `1 m = 1.094 yd = 39.36 inches` | plain-decimal | — | 0 | 01_04_MYdCmIn |
| 1 | `1.8 cm` | plain-decimal | — | 0 | 01_04_Volume |
| 1 | `*Percent Daily Values are based on a 2,000` | thousands | — | 0 | 05_02_FoodLabel |
| 1 | `vmax = 2.96 × 105 m/s` | plain-decimal | scientific | 0 | 06_01_Ephoton |
| 1 | `vmax = 6.22 × 105 m/s` | plain-decimal | scientific | 0 | 06_01_Ephoton |
| 1 | `109.5°` | plain-decimal | — | 0 | 07_06_Egeom |
| 1 | `boiling point: 9.5 8C` | plain-decimal | — | 0 | 10_01_PentIso |
| 1 | `1.4 × 10–10 m` | plain-decimal | scientific | 0 | 10_05_Carbon |
| 1 | `41.4% of the anion radius` | plain-decimal | — | 0 | 10_06_IntIonst |
| 1 | `73.2% of the anion radius` | plain-decimal | — | 0 | 10_06_IntIonst |
| 1 | `Cation radius is about 22.5 to` | plain-decimal | — | 0 | 10_06_IntIonst |
| 1 | `Cation radius is about 41.4 to` | plain-decimal | — | 0 | 10_06_IntIonst |
| 1 | `Cation radius is about 73.2 to` | plain-decimal | — | 0 | 10_06_IntIonst |
| 1 | `= slope = 2.91 × 10` | plain-decimal | scientific | 0 | 12_01_NH3Decomp |
| 1 | `= slope = 9.70 × 10` | plain-decimal | scientific | 0 | 12_01_NH3Decomp |
| 1 | `= –slope = 1.94 × 10` | plain-decimal | scientific | 0 | 12_01_NH3Decomp |
| 1 | `Ka = 6.8 × 10–4` | plain-decimal | scientific | 0 | 14_03_AcidpH |
| 1 | `Ka = 9.5 × 10–8` | plain-decimal | scientific | 0 | 14_03_AcidpH |
| 1 | `Kb = 1.8 × 10–5` | plain-decimal | scientific | 0 | 14_03_AcidpH |
| 1 | `Added mL of 0.10 M NaOH` | plain-decimal | — | 0 | 14_06_buffer |
| 1 | `2,4-Dinitrophenol` | locant | — | 0 | 14_07_indicators |
| 3 | `Volume of 0.100 M NaOH added (mL)` | plain-decimal | — | 0 | 14_07_titration×2, 14_07_titration2 |
| 2 | `point pH, 7.00` | plain-decimal | — | 0 | 14_07_titration, 14_07_titration2 |
| 2 | `point pH, 8.72` | plain-decimal | — | 0 | 14_07_titration, 14_07_titration2 |
| 1 | `0.1 M MgCl2` | plain-decimal | — | 0 | 17_02_Oxidareduc |
| 1 | `0.2 M FeCl3 and 0.3 M FeCl2` | plain-decimal | — | 0 | 17_02_Oxidareduc |
| 1 | `1,1,2,2-tetrabromoethane` | locant | — | 0 | 20_01_acetylene_img |
| 1 | `2,2,4-trimethylpentane` | locant | — | 0 | 20_01_alklnm_img |
| 1 | `1,2-dichloroethane` | locant | — | 0 | 20_01_halogen_img |
| 1 | `2,4-difluorohexane` | locant | — | 0 | 20_01_substitu_img |
| 1 | `1,2,3-propanetriol` | locant | — | 0 | 20_02_polyols_img |
| 1 | `1,2-ethanediol` | locant | — | 0 | 20_02_polyols_img |
| 1 | `(1 half-life = 5.27y)` | plain-decimal | attached-right-letter | 0 | 21_03_HalfLife |
| 1 | `0.12%` | plain-decimal | — | 0 | 21_05_Co60Decay |
| 1 | `0.31 MeV β` | plain-decimal | — | 0 | 21_05_Co60Decay |
| 1 | `1.1732 MeV γ` | plain-decimal | — | 0 | 21_05_Co60Decay |
| 1 | `1.3325 MeV  γ` | plain-decimal | — | 0 | 21_05_Co60Decay |
| 1 | `1.48 MeV β` | plain-decimal | — | 0 | 21_05_Co60Decay |
| 1 | `99.88%` | plain-decimal | — | 0 | 21_05_Co60Decay |

### D. Lines in NON-composed figures (never redrawn; no compose-time rule can reach them)

| n | line text | class | context | runs straddled | figures |
|---|---|---|---|---|---|
| 1 | `0.5` | plain-decimal | — | 0 | 00_BB_Function_img |
| 1 | `1.5` | plain-decimal | — | 0 | 00_BB_Function_img |
| 1 | `2.5` | plain-decimal | — | 0 | 00_BB_Function_img |
| 1 | `3.5` | plain-decimal | — | 0 | 00_BB_Function_img |
| 1 | `4.5` | plain-decimal | — | 0 | 00_BB_Function_img |
| 1 | `118.7 g Sn` | plain-decimal | — | 1 | 03_02_moles-6296 |
| 1 | `12.0 g C ` | plain-decimal | — | 1 | 03_02_moles-6296 |
| 1 | `24.3 g ` | plain-decimal | — | 1 | 03_02_moles-6296 |
| 1 | `28.1 g Si` | plain-decimal | — | 1 | 03_02_moles-6296 |
| 1 | `32.1 g S       ` | plain-decimal | — | 1 | 03_02_moles-6296 |
| 1 | `63.5 g Cu` | plain-decimal | — | 1 | 03_02_moles-6296 |
| 1 | `65.4 g Zn     ` | plain-decimal | — | 1 | 03_02_moles-6296 |
| 2 | `104.5°` | plain-decimal | — | 0 | 08_02_H2Otet, 08_02_hybrid_img |
| 1 | `109.5°` | plain-decimal | — | 0 | 08_02_H2Otet |
| 1 | `92.1°` | plain-decimal | — | 0 | 08_02_hybrid_img |
| 1 | `1.4 × 10‒3` | plain-decimal | scientific | 0 | 12_05_ArrhPlot |
| 1 | `1.6 × 10‒3` | plain-decimal | scientific | 0 | 12_05_ArrhPlot |
| 1 | `1.8 × 10‒3` | plain-decimal | scientific | 0 | 12_05_ArrhPlot |

### E. Translated blocks in the 34 (MT output is in the sidecar; listed for the EN side)

| n | line text | class | context | runs straddled | figures |
|---|---|---|---|---|---|
| 1 | `formed by the reaction of 12.85 g of` | plain-decimal | — | 0 | 04_03_etheneBr_img |
| 1 | `required to react with H2O to produce 9.55 g of` | plain-decimal | — | 0 | 04_03_ethene_img |

### F. Digit followed by a separator with NO digit after it (kept + identity populations) — hazard for any rule that does not require a following digit

| n | population | figure | line text |
|---|---|---|---|
| 1 | kept-identity | 04_04_GreenChem | `H2, Raney Ni` |
| 1 | kept-sendfalse | 09_03_BoylesLaw1 | `(10.0, 19.5)` |
| 1 | kept-sendfalse | 09_03_BoylesLaw1 | `(15.0, 13.0)` |
| 1 | kept-sendfalse | 09_03_BoylesLaw1 | `(20.0, 9.8)` |
| 1 | kept-sendfalse | 09_03_BoylesLaw1 | `(25.0, 7.8)` |
| 1 | kept-sendfalse | 09_03_BoylesLaw1 | `(30.0, 6.5)` |
| 1 | kept-sendfalse | 09_03_BoylesLaw1 | `(5.0, 39.0)` |
| 16 | kept-sendfalse | 12_04_HPerDcmp | `0.` |
| 4 | kept-sendfalse | 12_04_HPerDcmp | `2.` |
| 4 | kept-sendfalse | 12_04_HPerDcmp | `4.` |
| 4 | kept-sendfalse | 12_04_HPerDcmp | `6.` |
| 4 | kept-sendfalse | 12_04_HPerDcmp | `8.` |
| 1 | kept-sendfalse | 13_03_factory | `N2, H2` |
| 1 | send-translated | 04_03_etheneBr_img | `with an excess of Br2.` |
| 2 | send-translated | 04_05_combustion | `CO2, H2O, O2,` |
| 1 | send-true-unbought | 07_06_Ques23ans_img | `CO2, linear` |
| 1 | send-true-unbought | 07_06_Ques23ans_img | `SO2, bent with an approximately 120° angle` |
| 3 | send-true-unbought | 13_03_factory | `N2, H2` |
| 1 | send-true-unbought | 17_05_DryCell | `Paste of MnO2, NH4Cl,` |
| 1 | send-true-unbought | 17_05_DryCell | `ZnCl2, water (cathode)` |
| 1 | send-true-unbought | 18_02_HallHerCell | `Bubbles of O2, CO,` |
| 1 | send-true-unbought | 18_07_N2O5 | `CNX_Chem_18_07_N2O5.jpg` |
