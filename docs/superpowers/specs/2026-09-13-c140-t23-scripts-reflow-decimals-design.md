# §C140 ② ③ ⑨ + exocytosis — translated-label formulas, re-flow, decimal commas, and the blend-chain load fix — design

**Date:** 2026-09-13 · **Status:** design.
**Owner of:** the DESIGN of how `compose.py` lays out and draws TRANSLATED figure labels (formula formatting
②, wrap budget / anchor / size ③), how English-kept labels localise numbers (⑨), and the post-conversion
artwork pass that makes `pdftocairo -svg` output loadable in a browser (the exocytosis fix, USER-REVIEW
row 11). §C140 ⑩ (the brain outline) is **not** in this design — see R10.
**Status of the work lives in** the campaign register's ⏩ RESUME and §C140; figure-text status in
`experiments/figure-text-translation/REGISTER.md`. This document carries no status verbs.
**Evidence it rests on (frozen, cited, never restated):**
[`experiments/figure-text-translation/evidence/2026-09-13-t23/`](../../../experiments/figure-text-translation/evidence/2026-09-13-t23/README.md)
— thirteen reports (investigation, prototype, three adversarial verifiers, the exocytosis spike and its
verifier), their instruments, `data/c3-blocks.jsonl` and the gzipped corpus census. Built on:
`COMPOSE-FIDELITY.md`, `evidence/2026-09-13-compose-fidelity/`, E's design
`2026-09-13-c140-e-run-exact-kept-text-design.md`.

---

## Rulings this design is built on — do not re-litigate

| # | ruling | by |
|---|---|---|
| R1 | **One PR, one picture review**: one `COMPOSER_VERSION` bump, one 0-ISK recompose, one deploy | [USER] 2026-09-13 |
| R2 | **Schematic boxes: centre every line** of a translated label in its box (a departure from OpenStax's ~11 pt constant indent) | [USER] 2026-09-13 |
| R3 | **Table cells keep the source alignment** (a right-flush `Mólmassi` stays against its number); the cell width is the limit | [USER] 2026-09-13 |
| R4 | **Shrink floor 7.5 pt** — no translated label is drawn smaller | [USER] 2026-09-13 |
| R5 | **A word that does not fit at the floor overhangs and is NAMED** in the run output, never shrunk further | [USER] 2026-09-13 |
| R6 | **⑨ converts automatically** — an explicit exception to figure `REGISTER.md` ⑭ ("offered, never automatic") for every label drawn in English. Most are `send:false` and have no review card; an identity reply keeps its card's `Nota`, and accepting it no longer changes how the label is drawn (§2) | [USER] 2026-09-13 |
| R7 | **Exocytosis: fold its fix in only if small and in the same post-conversion step.** Outcome: the blend-lerp collapse qualified (§3) | [USER] 2026-09-13 |
| R8 | **Structure A: pure helpers beside `compose.py`**, each unit-tested alone; `compose.py` keeps the cairo calls (E's R3 pattern) | [USER] 2026-09-13 |
| R9 | **A 1–2 character token stays on the same line as the word after it** whenever that still fits (`Massi \| A atóma`, not `Massi A \| atóma`). **Amended 2026-09-14: symbols only** — a lowercase alphabetic word (`af`, `og`, `á`, `í`) may end a line, so `Mól af \| CO2` follows the source's `Moles of \| CO2` | [USER] 2026-09-13, amended 2026-09-14 |
| R10 | **⑩ is deferred to its own item.** The measured heal damaged real shading on exocytosis; a visibility gate must exist before any heal ships | [USER] 2026-09-13 |
| R11 | Carried from E: block keys must not move · buying stays stopped · the PR is not merged until [USER] has looked at the recomposed figures · ⑪ (MT wording) is out | [USER] 2026-09-13 |

## Amendments — 2026-09-14, measured while writing the plan

The design was built in scratch before the plan was written (five module builders, an integrator, a predictor,
three adversarial reviewers over two rounds; `experiments/figure-text-translation/evidence/2026-09-14-t23-build/`).
What the build measured changes the text below in these places. **Numbers live in that folder's `PREDICTIONS.md`,
not here**; where a paragraph below quotes a number, `PREDICTIONS.md` wins.

- **R9 scope** — [USER] ruled symbols only (see the rulings table). Versus no binding, 11 of 176 labels change.
- **§4 "What the 7.5 pt floor costs" and "Known consequences" are superseded by `PREDICTIONS.md`.** Measured with
  linear metrics and vector container geometry, `Reynsluformúla` (empform b8) now FITS at 7.5 pt by 0.11 pt instead
  of overflowing; the flowchart, combmap and ethene figures and the arrow-label split differ from the prototype's.
- **§3 numbers**: the collapsed exocytosis artwork costs 4835 = 2^12.24, not 2^12.4 (that was the rejected V1
  variant); "brain and map2: 18" is a raw cost (2^4.2). The collapse takes bytes and returns bytes
  (`collapse_blend_lerp(data: bytes)`), byte-substituting use sites after a semantic parse — it never serialises the
  tree. On a parse error or a count mismatch `strip-text.py` leaves `artwork.svg` as cairo wrote it and records the
  error in `svgfix.json`.
- **§1 body size**: the size carrying the most letters, with each run's letters attributed to its LINE'S RESOLVED
  base (the letter vote alone returned the subscript size on 13 corpus `send:true` blocks, e.g. `Patm`). The inverted
  base resolves to the largest non-symbol letter-bearing run on the line (or the largest inked non-symbol run on a
  letterless line); only inked runs count as inversion suspects. An all-styled token containing ANY letter (`ν1`,
  `sp2`, `dz2`) is placed only at a clean unique occurrence; one with no letter is `no-base`. A same-size stacked
  charge (`ammonium (NH4|+|)`, 1 corpus block) is named `no-base`, not attached.
- **§4 container detection, as built**: the source frame is per RUN (adv-based, so subscripts count); every container
  side is pulled in by `max(linewidth, 1.0)/2` (a fill-only rect by 0.5); four rules make a cell only if each SPANS
  the cell (without that, 9 arrow labels and 2 exocytosis labels became cells); the sibling-edge tolerance is
  0.2 pt, measured from the gap distribution (real columns ≤ 0.107 pt, first coincidence 0.26 pt; rxn2
  `Reactant`/`Coefficient` no cue, ethene b0/b17 cue); free-space obstacles are other blocks' per-run frames. Rotated
  labels are box/cell only within 0.5° of a multiple of 90°, else open. The census is reproduced 176/176.
- **§4 box/cell order**: every line count ≤ the source's is tried from full size down to the floor before any
  larger count — the open path's (iii)-before-(iv) order, applied to boxes and cells (plan author's reading of
  "shrink ... down to the floor"; 0 of 176 decisions move).
- **§4 overflow shape**: `{key, block, word, needPt, budgetPt, sizePt, axis}`; `axis` is `width` or `height`;
  width entries add `linePt` (the widest drawn line); a width entry whose glyph box also misses height adds
  `heightNeedPt` / `heightBudgetPt`. A box/cell label that meets its height budget at no size is shrunk to the floor
  and named on the `height` axis. A source size off the 0.25 pt grid still tries the floor itself.
- **§5 report and inputs**: the report also carries `containerErrors: [{key, block, why}]` — a container detection
  that raised is laid out as open and NAMED (a stdout NOTE and a driver NOTE). `artwork.pdf` is a required compose
  input, refused by `figure-compose.py` before compose runs (even for a figure with nothing translated).
  A legacy list-shaped value is joined into one string before transfer.
- **Known limit, not fixed**: the height budget and vertical centring use base-size ascent/descent only, so a
  subscript's drop is not counted (smallest box/cell margin on the 34: 3.97 pt).

## Amendments — 2026-09-15, after [USER] looked at the 34 recomposed figures

[USER] reviewed the acceptance page and did **not** accept: spaces were missing (`afBr₂`, `viðH₂O`), the
etheneBr double bond sat left of centre, translated text looked bolder than the source, and a box label
chased the source line count into `Fjöldi / agna / af / A`. Each symptom was root-caused before any fix, then
the fixes were built and adversarially reviewed in scratch over two rounds, the same way as the 2026-09-14 build.
Evidence, reference files and every real-figure number:
[`experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/`](../../../experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/README.md).
Where a paragraph above disagrees, this section wins.

| # | ruling | by |
|---|---|---|
| R12 | **Precise text rendering.** Every drawn `<text>` renders with `text-rendering="geometricPrecision"` — written once, on the `<g>` that holds them all (an inherited presentation attribute; pixel-identical in an `<img>` to one attribute per `<text>`). **Reverses, for `geometricPrecision` only, E's R2 scope exclusion** | [USER] 2026-09-15 |
| R13 | **No lone symbol, no useless line** — box and cell labels only (rules A and E, §4 below) | [USER] 2026-09-15 |
| R14 | **Match the source black.** DeviceCMYK text converts to RGB the way poppler does (`GfxDeviceCMYKColorSpace::getRGB`), so K=1 draws `#231f20` like the artwork's own strokes; DeviceRGB and DeviceGray text keep their exact colour | [USER] 2026-09-15 |
| R15 | **Fix the artwork shift on this branch.** `pdftocairo -svg -noshrink -nocenter`, and prepare refuses a page whose artwork would not sit under the text | [USER] 2026-09-15 |

- **Why spaces went missing (R12)** — the premise of §1 "Drawing" was wrong. Cutting plain text at the space
  next to a styled segment puts each segment at an absolute x computed from cairo's LINEAR advances, while
  Chromium's default rendering rounds advances per glyph at the display scale; the whole plain prefix's
  drift therefore lands exactly in that space, which is lost at some scales and doubled at others, and
  subscripts collide at others. E's run-exact labels had the same mechanism. Under `geometricPrecision`
  Chromium uses the linear advances, and the browser census over the 34 at seven scales (1 … 3 px/pt) went
  from 16 lost spaces, 94 collisions and 36 browser-only overhangs to 0, 0 and 0. **Known limits:** Chromium
  still applies the font's kern table and cairo does not (28 of 647 segments draw up to 0.99 pt short, which
  can only widen a gap); a thin 7 pt en dash (HClsoln) rasterises lighter; only Chromium on Linux was measured.
- **§4 "Line partition", box and cell labels (R13).** The target stays the source line count, with two rules:
  **(E)** a line that does not shorten the longest line is never kept — a count whose one-fewer partition is no
  wider is rejected, and a rejected count does not influence the size (the next count is tried from full size
  down, as in the order above); **(A)** a 1–2 character symbol (R9's notion — not a lowercase alphabetic word)
  that ends the label never stands alone on the last line: count and size are first chosen among partitions that
  keep it with the word before it, and the unconstrained choice applies only when no such partition fits at any
  size down to the floor. A may therefore draw a label a size step smaller or larger than without it; neither
  rule ever adds a line. E also applies in the floor-overflow branches, so a named height overhang describes the
  lines actually drawn. Open labels are unchanged (0 of 84 open blocks on the 34 are affected by either rule). On
  the 34, exactly 8 flowchart boxes change, all at 9 pt (`Fjöldi / agna / af A`, `Massi A`, `Rúmmál / lausnar A`,
  `Rúmmál / hreins / efnis A` and their B twins); `Mól / af A` already met both rules. **Known limits (0 on the
  34, measured on randomised labels):** E judges the partition before R9's binding, so when the drawn lines are
  the R9-bound partition, one fewer bound line can be no wider (about 1.5% of randomised box labels); and a label
  can lose an R9 binding to a larger size (1–4 in 20,000).
- **Why the text looked bolder (R14)** — `compose.py`'s `cmyk()` was the naive `(1−c)(1−k)`, so K=1 text drew
  `#000000` beside artwork that pdftocairo draws `#231f20`; the font and geometry were already identical to the
  source. The conversion lives in `figcolour.py`. `readlayer` keeps each fill's colour space tag instead of
  folding RGB and Gray into CMYK (a folded fill would now be drawn through poppler's table), so a `runs.json`
  written before this change must be re-prepared (`figure-run.js` re-prepares on every run). On the 34 every text
  fill moves and nothing else does.
- **Why the bond sat left (R15)** — without the two flags, `pdftocairo -svg` scales a page with a fractional
  dimension by `min(w/⌈w⌉, h/⌈h⌉)` and centres it, while the text is placed at true coordinates: 24 of the 34
  are affected, worst 2.66 pt, and every PNG-based check was blind to it. cairo writes no page-level transform
  that could be read back, so the guard runs the same `pdftocairo` argument list on a probe copy of the page
  and refuses when a known point is displaced; a separate test pins what prepare actually writes. It refuses a
  /Rotate, a box origin off 0,0 and a CropBox that cuts the left or top edge; over every in-scope chemistry figure
  source (537 PDF, 280 EPS) it refuses none.
- **No second version bump.** `COMPOSER_VERSION` stays `'3'`: it has never left this branch, and R1 is one bump
  per PR. The 34 are recomposed with `figure-run.js --stale --force` (`--force` suppresses only the
  skipped-current check, so it cannot make a figure spendable), and the recomposed media are verified BY VALUE
  against the scratch prediction, figure by figure.
- **§1 "Drawing"** — `svgout.py` is no longer unchanged (R12). **§5** — `strip-text.py` and `figure-prepare.py`
  change (R15), and `readlayer.py` and the new `figcolour.py` (R14).
- **Out of scope, logged:** wording fixes and splitting long words ([USER]: "much can be fixed by correcting
  translations and splitting long words") belong to the translation, not the composer.

---

## Purpose

E made `compose.py` draw every English-kept label exactly as the source drew it. What [USER]'s review of
the 34 bought figures still found wrong sits in the **translated** labels, in a number-format regression,
and in one figure no browser can open:

- **②** formulas inside translated labels lose their sub/superscripts (13 of 34 figures);
- **③** translated labels overflow boxes, cram or gain lines, collide with arrows, indent where boxes want
  centring, and fall back to tiny type (rows 7, 8, 10, 14–21, 23, 24, 25, 29, 31, 32, 34);
- **⑨** English-kept numbers are drawn `26.98` where the June figures and the chapter text have `26,98`;
- **row 11** the recomposed `CNX_Chem_03_01_exocytosis-88f6` never finishes loading in Chromium, so the next
  render + sync would replace a working June raster with a figure readers cannot see.

## Non-goals

- **⑩ the brain outline** (R10) · ④ strip-text colour operators · ⑤ page-box padding · ⑥ STIX faces / browser
  knobs · ⑦ spend gates · ⑪ MT wording.
- Bold changing **within** a translated line (8 `send:true` blocks corpus-wide, none bought).
- `sandwich`'s residual ~14 s load (not image data, unidentified) and Firefox / WebKit rendering (never
  measured) — logged, not designed here.
- Any change to `figtext.lines()` / `group()` / `merge_blocks()` / `is_arc()` / `blockkey.block_key`.
- Rendering into `05-publication/` or syncing to vefur — [USER]'s publication decision.
- The review panel's own number suggestion (`figure-consistency.cjs`) beyond a parity fixture (§2).

---

## Components

### 1. `figscripts.py` — ② formula formatting in translated labels

**What changes for a reader.** When the source draws `C₇H₅NO₃S` in a label, the Icelandic label draws it
the same way, wherever the translation put the formula.

**Which source runs are scripts — one rule, per `FT.lines` line, from source geometry only.**
- **Base size** = the size carrying the most letters. **Baseline** = the letter-weighted mode of the
  projection among base-size runs (clustered to 0.5 pt). Symbol-font runs (STIX) cast no vote.
- A run is a **script** iff `|Δproj| ≥ 0.075 · base` when `size < 0.9 · base`, or `|Δproj| ≥ 0.13 · base`
  otherwise. Both thresholds sit in empty bins of the chemistry-corpus histogram (`c2-scripts.md` Q1).
- **Arc blocks are never styled** (curvature reads as a baseline shift).
- ⚠️ Not 2b's rule: its median baseline styles `NH` in a same-size `NH₄⁺` and its flat 0.12 misses 4 real
  d-orbital runs. ⚠️ The size-conditional thresholds were **placed from a histogram, not executed**; the plan
  executes them over the corpus census before merge and names every run on which they differ from the flat
  rule.
- ⚠️ **The base must not invert** (`r2v-scripts.md` defect 2): where a subscript word carries more letters
  than its base letter (`qout`, `Patm`, `urms`, `E°cell` — 19 `send:true` corpus blocks, 0 in the 34) the
  letter vote picks the subscript as base and draws `q` at 17 pt. A line on which any styled run would be
  LARGER than the chosen base is resolved (base = the largest non-symbol letter size on the line's majority
  baseline) or, if that is ambiguous, left unstyled and named `inverted-base`. Pinned by the real
  `CNX_Chem_05_03_Systemqw` runs.
- ⚠️ **A translated label's size is its body size, not its first run's** (`r2v-scripts.md` defect 3, a
  pre-existing composer defect ② would multiply): `sz0` becomes the size carrying the most letters among
  non-symbol runs across the block, falling back to `b[0]['size']`. 47 corpus `send:true` blocks start with an
  11 pt symbol run; **0 of 176** in the 34 differ.

**Tokens — built from `runs.json` only, never from the value.**
- A token is a maximal `\S+` stretch holding a styled character, with unstyled `,.;:!?` trimmed from its
  edges; each character carries `SourceStyle = (ratio, frac, italic)` or `None`, where
  `ratio = run.size / base`, `frac = (proj(run) − baseline) / base` (signed, up is positive),
  `italic = figtext.run_face(run).italic`.
- **Stacked-split charges** (`HCO3|–`: a script-sized line starting where the previous line ended) attach to
  the previous line **for token building only**; the block key is unchanged. Without this, 15 of 19 real
  `send:true` charge lines produce no token, silently.
- Tokens are **de-duplicated by (text, styles)**: a source label repeating a formula (`3px and 3px`)
  otherwise names two false `absent` misses after formatting both occurrences correctly.

**Transfer — `transfer(tokens, value) → (fmt, unformatted)`.**
- `value` is the sidecar value as `compose.py` reads it — **possibly editor-edited**
  (`applyApprovedFigureEdits` → `figure-run --stale` → `compose.py`).
- Longest token first; an occurrence counts only at a **clean boundary** (not glued to a letter or digit);
  each value position is consumed once; **every** clean occurrence of a whole token is formatted.
- Letter-only all-styled tokens (an italic variable) are placeable at a clean, unique boundary; non-letter
  all-styled tokens (`+`, `–`, `=`) are never searched bare and are named `no-base`.
- Fallback for a token with no clean whole occurrence: each script stretch anchored on its preceding base
  character (`l–1`), requiring a **non-empty anchor and exactly one candidate**; when the raw needle occurs
  more often than it was placed, the miss is named `partial` (a glued repeat `(mól–1mól–1)` is otherwise a
  silent half-formatting).
- The value text is **never altered**. `fmt` is aligned 1:1 with the raw value.

**Drawing — in `compose.py`'s translated straight path.**
- Styles are carried **per word** (`re.finditer(r'\S+', raw)`, identical to `str.split()` on every
  codepoint), so `wrap()`'s whitespace collapse cannot misalign them.
- A wrapped line is a list of `(char, style)`; a **segment** is a maximal equal-style run. Each segment is one
  `ITEMS` entry — one `<text>` — at `size = sz · ratio` and baseline `+ sz · frac`, x advancing by the previous
  segments' widths, rotated exactly as today. `svgout.py` is unchanged.
- **Plain text next to a styled segment is cut at the adjacent space**, so browser advance rounding lands in a
  word space: in-formula error ≤ 0.57 pt instead of up to 1.56 pt (Chromium, 4 scales).
- **One width function** — `seg_width(segments, run, sz)`, the sum of per-segment advances at their own sizes
  and slant, in **linear metrics** (§4) — feeds wrap, shrink and the anchor, shared with ③.
- Italic comes for free: the style carries it and `svgout` has embedded italic faces since E.

**Report.** `compose-report.json` gains `unformatted: [{key, token, stretch, reason, candidates}]`,
`reason ∈ {absent, ambiguous, no-base, stacked, partial, arc, inverted-base}`, in draw order with
multiplicity. Passed through `figure-compose.py` into `compose.json`, printed by `figure-run` as a
**`NOTE (not a failure)`**. A named miss draws today's flat text — never a refusal, never a blank.

### 2. `numloc.py` — ⑨ decimal commas in English-kept labels

**What changes for a reader.** In labels that stay in English, `26.98` is drawn `26,98` and `1,000` is drawn
`1.000` — as the chapter text (equations, alt text, prose) and the June figures already do.

**Where.** `compose.py`'s kept branch, **on the drawn text only**, after `block_key` and after the identity
decision. Keys, `blocks.json`, sidecars and the report's `blocks`/`missing`/`translated` multisets never
change. **Not inside `figtext.run_draw_text`**: its second return value means "a `(cid:N)` token was removed"
and would mislabel every converted label as `undecodable`. **Width-neutral by measurement:** `.` and `,` both
advance 569/2048 em in all four Liberation Sans faces and no kern pair joins a digit with either.

**Unit: the line.** Numbers are found on the line's joined run text and each change is mapped back to its run:
per-run evaluation misses the 7 decimals of `CNX_Chem_03_02_moles-6296`, whose text is one glyph per run.

**The rule (R3 of `c9-decimal.md` §7):**
1. Every thousands group becomes a period, **across all groups** (`1,000,000` → `1.000.000`). ⚠️ The chapter's
   `mathml-to-latex.js` `localizeNumberFull` corrupts multi-group values (`1.000,000`) and is not reused.
2. A `.` flanked by digits becomes `,`.
3. **Left alone:** a line holding a coordinate pair (`(10.0, 19.5)`), and a leading point (`.625 g`).
4. **Converted:** a bare overprint fragment `\d+\.` (so the fragment and the label under it agree).

⚠️ **R3 is not idempotent on three-decimal values** (`r2v-numbers.md` §3): `1.008 → 1,008 → 1.008`. So `numloc`
runs **only on source run text read from `runs.json`**, never on text that may already be localised.

**Scope: every English-kept label, identity replies included — with identity widened to match.**
`figtext.is_identity` treats a value as identity when each whitespace token equals the English token **or its
localised form** (localising only the English side). An editor who accepts the panel's `Nota` suggestion on a
numeric identity reply (`373.15 K` → `373,15 K`) therefore keeps the label drawn run-exact.

**Controls.** `--control` stays a faithful OpenStax redraw and **does not localise**. The report gains
`localized: [key…]` (draw order, multiplicity). **Verification is at text level** (parse `<text>`): the pixel
instrument scored a decimal swap 0/37. Positive control: the two translated labels in which the MT already wrote
commas (`12,85`, `9,55`).

**Parity.** One fixture of real census strings with expected outputs (`data/c9-appendix.md`) is asserted by the
Python tests; its plain-decimal subset — the only shape the panel's `DECIMAL` handles — is asserted against
`tools/lib/figure-consistency.cjs` by a small vitest.

### 3. `svgfix.py` — the blend-chain load fix (exocytosis, USER-REVIEW row 11)

**Cause (measured, `exo-spike.md`; confirmed by `exo-verify.md`).** cairo's SVG surface (`pdftocairo -svg`,
poppler 26.01 / cairo 1.18) writes every non-Normal blend-mode paint as
`add( blend(S, D)·Ma , D·(1 − Ma) )`, where D is everything painted so far — referenced **twice**, and the next
paint's D contains this paint's result. exocytosis has 158 such paints (110 `/Multiply` + 48 `/Screen` in the
source PDF, matching the SVG 1:1): a reference tree of ~2^116 paint invocations. Discriminating control: keep
every arithmetic filter but remove only the second D reference → loads. Not the 628 masks, not the gradients,
not the 25 MB.

**Fix — `collapse_blend_lerp(svg_text) → (svg_text, report)`, called by `strip-text.py` directly after the
`pdftocairo -svg` call (`strip-text.py` `main()`, whose argv comes from `svgfix.pdftocairo_svg_argv`), as a read → edit → write of `artwork.svg`.**
- For each add filter: verify R (a group carrying only `filter` + `mask`, whose filter is a two-input
  `feBlend` with the same subregion SR), L (a group carrying only `mask`, using D), Ma (a plain mask whose
  content ends in an opaque white rect covering SR) and Mb (the inverted Ma over the same extents).
- Where Ma is 1 over SR and Mb is 0, the L term is exactly zero: rewrite the use site
  `filter="url(#F_add)"` → `filter="url(#F_blend)"`, the blend id **resolved, never assumed** to be
  `F_add − 1`. One byte per paint.
- **Left alone and counted:** paints whose Ma is a real clip (`clipped`) and any other shape (`unmatched`).
- Report `addOps / collapsed / useSitesRewritten / clipped / unmatched / modes`.
- Implement as an ElementTree parse that checks semantics (the verifier's shape), not a regex over cairo's text
  layout: the two independent implementations are byte-equal on 34/34, and the parser is faster (5.9 s vs 8.5 s
  on exocytosis).

**Exactness, measured.** exocytosis: every collapsed paint restored to cairo's lerp in blocks of ≤ 10 → 17
renders, **all 804,000 / 804,000 px identical** (DSF 1; two blocks also at DSF 2); a static walk shows every
collapsed paint's SR covers the whole viewBox, so the anti-aliased edge where the two forms could differ is
outside the picture. sandwich and HClsoln change **0 px**. **31 of 34** bought artwork SVGs are byte-identical
after the pass (30 have no blend paint at all; rxn3's 6 are all clipped). exocytosis `<img>` load: never (270 s
budget) → ~2.1 s load, ~1.1 s paint.

**Fail loudly — a shape-independent sentinel at prepare.** Independently of the collapse, compute the SVG's
**no-sharing reference cost** (`instruments/exo/tools/refgraph.py`: a memoised walk of `use`/`feImage`/mask
references; 0.9 s on 25 MB) and emit a named `figure-prepare.py` warning above 2^20. If cairo's output shape
changes, the collapse matches nothing while the sentinel still fires. (exocytosis: 2^116 before, 2^12.4 after;
brain and map2: 18.)

**Rollout comes for free.** `figure-run --stale` re-prepares every figure it recomposes (`tools/figure-run.js`,
the prepare spawn follows the staleness skip), so the collapse ships on the same `COMPOSER_VERSION` bump as ② ③ ⑨.

**⑩ is not here (R10).** The ⑩ heal (`instruments/c10/strip_text_heal.py`) removed brain's visible ring, but on
exocytosis it overwrote real shading on mask-491 (61 px by > 8 L, mean |Δ vs cairo| 4.5 → 14.8) where no ring
was visible — its byte-level detector cannot tell an artefact from content. The recomposed brain therefore
still carries the outline; brain's publication waits for ⑩'s own item.

### 4. `figlayout.py` — ③ wrap budget, anchor and size for translated labels

**What changes for a reader.** Translated labels stay inside their boxes and table cells, keep the source's line
count, stop landing on arrows and frames, and are never drawn below 7.5 pt.

**Evidence, prototyped under R2–R5 and verified by three adversarial lenses (`r2-build.md`, `r2v-*.md`), on the
176 layout-path blocks of the 34:** blocks with a layout problem 50 → 4; [USER]-flagged mechanisms unresolved
49 → 4; artwork hits 32 → 1; off-page 4 → 0; spill 24 → 2; text-on-text 7 → 0; more lines than the source
18 → 0; the 9 arrow labels hold their source line count 9/9 (five at 9.0 pt, four at 8.0–8.75 pt). ⚠️ Those
numbers are from the prototype **before** the corrections below, in cairo's hinted metrics, and without R9; the
plan's first task re-derives every predicted number under the final rules.

**The unit is a pure decision.** `decide(words, width, container, cues, floor, pad) → Layout(lines, size,
anchor, overflow)`, where `words` carry ②'s styles, `width` is the one width function, `container` is the
detected class and geometry, and `cues` are the source's line count, alignment and edges. It never touches cairo,
so it is unit-tested with a fake width function; `compose.py` draws the result.

**Container detection — per block, at compose time, never precomputed and never keyed on block index.**
- From the stripped `artwork.pdf` via pdfplumber (already the read layer's library; `pylibs` has no numpy):
  - **box** — a single closed path with a visible stroke encloses the source frame (+0.5 pt) and covers < 25 %
    of the page;
  - **table cell** — the frame is bounded by rule segments (lines or thin rects) on all four sides that do not
    form one closed path, or by a fill-only rect (a label patch);
  - a candidate whose side lies within 0.25 pt of the page edge is **open** (the page background, not a box).
- **Open** blocks get a **free box**: clearance from the source frame, in the block's own rotation, to the
  nearest dark artwork (sampled from `artwork.png` with Pillow), another block's source frame, and the page
  edge.
- **A block that cannot be classified is `open`, and detection never raises.** (The prototype's precomputed
  census crashed the whole figure with a `KeyError` when an identity label was edited into a translation.)
- **Acceptance:** on the 34, the production classifier reproduces the investigation's census — box 66 / cell 26
  / open 84 — block by block, or every disagreement is named and ruled before merge. The raster flood-fill
  census (`instruments/c3/`) stays a test-time cross-check.

**One width function, linear metrics.** `seg_width` measures with cairo's **`HINT_METRICS_OFF`**, which equals
the PDF's own advances (148.52 vs 148.53 measured) and a browser's unkerned shaping. Hinted 200-dpi advances
flipped two fit decisions against the browser-shaped SVG and left a right-flush `Mólmassi` 0.93 pt short of the
edge it is ruled to be flush with.

**Line partition, every class.**
- Target line count = the source's; choose the achievable count closest to it (ties → fewer lines; a value with
  fewer words than source lines uses fewer lines).
- Among partitions with that count that fit, choose the most **balanced** (minimise the longest line).
- **Short tokens stay with the next word (R9, symbols only since 2026-09-14):** a token of 1–2 characters that is not a lowercase alphabetic word binds to the following word whenever
  a partition honouring every such binding fits; otherwise balancing decides as above.

**Box (R2).** Budget: inner width − 2·PAD and inner height − 2·PAD. Every line centred on the container's
horizontal centre; the block's glyph box centred vertically in the container. If the partition does not fit in
width or height, shrink in 0.25 pt steps down to the floor.

**Table cell (R3).** Same budget. Alignment = the source's (multi-line: `FT.alignment`; single-line: the source
label's margins inside the cell). Anchor = the source anchor, measured from the PDF's advances, displaced only as
far as needed to keep the block inside the cell; vertical source centre, clamped inside.

**Open.**
- **Alignment:** multi-line → `FT.alignment` (spread < 0.5 pt → centre). Single-line → a label **flush against an
  obstacle** (tight side ≤ 4.75 pt and far/tight ≥ 20) stays flush to that side and grows away; else a
  **sibling-edge cue** (the label's left, centre or right edge coincides with another block's); else centre.
- ⚠️ **The sibling-edge tolerance is MEASURED, not chosen:** set from the census distribution of edge gaps, with
  two named controls — rxn2 `Reactant`/`Coefficient` (0.50 pt apart, coincidental; must NOT cue: at 0.5 pt it
  re-aligned `Stuðull` 7.6 pt off its brace in a figure [USER] had approved) and ethene b0/b17 (0.03 pt apart, a
  real column; MUST cue).
- **Order:** (i) the source line count at full size within the free width from the anchor − PAD; (ii) the same
  line count at full size with the anchor displaced the **least** distance inside the free box; (iii) the same
  line count shrinking toward the floor; (iv) add a line toward the side with more vertical room, only if that
  room exists; (v) the source line count at the floor, overhanging, named.

**Size and overflow (R4, R5).** Floor F = 7.5 pt; the effective floor is `min(F, source body size)` — a label the
source itself set smaller (combmap's 7 pt arrow labels) is never enlarged. PAD = 2.0 pt (2.5 fixed nothing and cost
size: `r2-build.md` §7). A word that does not fit at the floor is drawn at the floor, overhangs, and is named:
`overflow: [{key, block, word, needPt, budgetPt, sizePt}]` in the report, passed to `compose.json`, printed as a
driver NOTE. The editor's remedy is in the panel — `Prósentu- samsetning` wraps and fits at 9 pt.

**Rotated labels** follow the same rules in their own rotation frame.

**Known consequences, shown on the review page** (⚠️ superseded 2026-09-14 by `evidence/2026-09-14-t23-build/PREDICTIONS.md` — see Amendments)**:** map7 `Rúmmál lausnar` (a figure [USER] called fine) becomes 1
line at ~8.75 pt instead of 2 lines at 9 pt; ethene's second line moves ~6.8 pt left to avoid its break (as
[USER] suggested in row 24); `Prósentusamsetning` overhangs both frame strokes until an editor splits it; twin
labels can draw at different sizes (Example2 b1 9.0 / b3 8.0); a table header row can mix 8.5 and 9.0 pt where a
long MT term (`Meðalatómamassi`) does not fit its cell.

**What the 7.5 pt floor costs, measured after [USER] ruled it** (⚠️ prototype numbers, superseded 2026-09-14 by `PREDICTIONS.md`: empform b8 now fits — see Amendments) (prototype at PAD 2.0; `r2-build.md` §7,
`r2v-numbers.md` D4). Exactly four blocks differ between F 7.0 and F 7.5:
- empform b8 `Reynsluformúla`: at F 7.5 it **overflows** (52.92 > 51.99 pt) with a **1.53 pt** box margin; at F 7.0
  it fits at 7.25 pt with 2.97 pt.
- flowchart b13 / b14 `Mólstyrkur`: at F 7.5 both overflow (34.56 > 34.0 pt). b13 runs **0.55 pt into the pad** on its
  right side (margins 1.99 L / 1.45 R); b14's margins are 1.74 / 1.70. At F 7.0 both fit at 7.25 pt.
- combmap b8 `Prósentusamsetning` overflows under either floor, but the overhang grows: margin −2.8 pt at F 7.0
  against **−5.5 pt** at F 7.5 (spill 75 → 114 px).

These are the prototype's numbers and are re-derived with everything else in the plan's first task.

### 5. `compose.py`, `figure-compose.py`, the driver, the version

- `compose.py`: the translated straight path calls `figlayout` for lines / size / anchor and draws segments (§1);
  the kept branch applies `numloc` (§2); the report gains `unformatted`, `overflow`, `localized` (additive;
  nothing existing changes meaning). Any new stdout section begins with `\n` (`test_blockkey_consumers.py`
  parses the `!!` block).
- `figure-compose.py`: passes `unformatted`, `overflow` and `localized` into `compose.json` beside `outputPath`;
  its `read_report` / `verify` contract is otherwise unchanged.
- `tools/figure-run.js` / `tools/lib/figure-outcomes.js`: one `NOTE (not a failure)` per non-empty list, naming
  figures and keys (the existing mechanism: `ok` ignores reasons starting `NOTE`).
- `strip-text.py`: calls `svgfix.collapse_blend_lerp` after `pdftocairo -svg`; `figure-prepare.py` surfaces the
  reference-cost sentinel as a warning. The collapse lands as **its own commit, before** the composer changes —
  it is what makes exocytosis measurable at all.
- `tools/lib/figure-text-sidecar.cjs`: `COMPOSER_VERSION` `'2'` → `'3'`. **A server change** —
  `server/services/figureReviewService.js` requires it. Order: merge → `deploy.sh` → verify the figures route.

---

## Testing — every new assertion is run against the UNCHANGED code first and seen RED

**Baselines, by name, before any change.** Every Python `test_*.py` in the experiment passing at the branch
point (local-only; CI runs none) — the finish line is the same names plus the new files. The root JS failing set
by name (`main` is red; the sidecar-coupled tests in `tools/__tests__/figure-run-free.test.js` legitimately move
at the bump and move back at the data commit — the plan states the expected set at each commit). **A red that is
not in the expected set stops the work; a red that is in it is not "fixed".**

**Commit order is part of the test design.** (1) the artwork collapse + sentinel; (2) ② on today's measure and
today's layout; (3) ⑨; (4) ③ — linear metrics, containers, partition, anchors; (5) report pass-through and driver
NOTEs; (6) the `COMPOSER_VERSION` bump; (7) the repair data commit. ② lands before ③ so that "② changes nothing
where there is nothing to style" is checked against the unchanged layout; ③ then carries its own RED-first
assertions and the real-figure predictions.

**Goldens before implementation.** Captured from the unchanged composer and committed first: the kept population
(must stay identical with `numloc` off), the unplanted fixture's face structure, and a planted translated label
with nothing to style, which step (2) must leave byte-identical (step (4) is then free to re-lay it). Clock pinned
with `SOURCE_DATE_EPOCH`; faces compared structurally (fontTools stamps `head.modified`).

**Unit tests (plain asserts, like their siblings).**
- `figscripts`: the script rule (same-size `NH₄⁺`, size-only STIX `=`, a d-orbital `dz2` at 0.111, an arc never
  styled, the `qout` inverted base); tokens (edge trimming, stacked-split attach, de-duplication); transfer (whole
  token, repeated formula both formatted, `CO2` does not donate `O2`, anchored `l–1`, empty anchor → `no-base`,
  glued repeat → `partial`, Unicode-subscript edit → `absent`, formula replaced by a name → `absent`); body size
  vs first-run size.
- `numloc`: the census fixture (decimal, thousands incl. `1,000,000`, tuple left, `.625` left, fragment
  converted, `Br2.` untouched, locants `1,2-dichloroethane` untouched); a run-split line (one glyph per run);
  length preservation on every fixture string; `is_identity` with a localised numeric value; never applied twice.
- `svgfix`: a minimal hand-built lerp paint collapses to its blend filter with the blend id resolved; a clipped
  paint and an unmatched shape are left alone and counted; the HClsoln artwork (2 paints) collapses 2 of 2 and
  stays byte-identical elsewhere; the reference-cost sentinel fires on a synthetic doubling chain and not on a
  collapsed one.
- `figlayout` (fake width function, no cairo): box — every line centred, height budget respected, shrink stops at
  the floor; cell — right-flush stays right-flush and is displaced only to stay inside; open — steps (i)…(v) each
  reached by a constructed case, including (iv) gain-a-line, which the real corpus never exercises at F ≤ 8.0;
  flush-to-obstacle; sibling cue at the measured tolerance with the rxn2 (0.50 pt, no cue) and ethene (0.03 pt,
  cue) geometries; line-count preference incl. fewer words than source lines; balance; short-token binding and its
  fall-back when binding does not fit; effective floor `min(F, body size)`; overflow named with need/budget; an
  unclassifiable block → open, never an exception.
- container detection: a closed stroked rect → box; four rule segments → cell; a fill-only rect → cell; a
  page-edge candidate → open; an enclosing path ≥ 25 % of the page → open.

**End to end (new files — planted runs on the committed fixture, a PRECONDITION on `blocks.json` checked before
each assertion).**
- ② A `send:true` `Moles of Na3PO4` (runs `Moles of Na`@12, `3`@8 −3, `PO`@12, `4`@8 −3) translated
  `Mól af Na3PO4`: `3` and `4` are their own `<text>` at 8.000 pt, 3.000 below — **RED on the unchanged composer**
  (measured in scratch). Named-miss arm: `Mól af natríumfosfati` → `unformatted` names both stretches.
- **Text sentinel:** for every layout label, its drawn `<text>` pieces, per line in x-order, reproduce the value's
  words exactly. Positive control: a planted corrupted item makes it fail.
- ⑨ A planted `26.98` kept run draws `26,98` at the same x; `localized` names it; `--control` draws `26.98`.
- ③ A planted boxed label drawn inside its box with every line centred; a planted right-flush cell label stays
  right-flush; a planted two-line arrow label under a planted arrow keeps two lines and clears the arrow; a planted
  unbreakable word at the floor is drawn at 7.5 pt and named in `overflow`; **an identity label edited into a
  translation composes (exit 0) and is laid out** — the prototype's crash, pinned.

**Real figures, 0 ISK, recorded in the PR (not committed as tests).** Re-prepare the 34; compose each unchanged vs
changed with its committed sidecar: `blocks.json` byte-identical 34/34; report multisets equal 34/34; kept run-exact
items identical except exactly the 35 ch03 decimal runs (`.`→`,` only); 52/52 script stretches placed on the 13
scripted figures with `unformatted` empty; container classes 66 / 26 / 84 block by block against the census;
artwork SVGs byte-identical on 31/34 with exocytosis / sandwich / HClsoln changed by 155 / 52 / 2 bytes; the ③
problem, collision, spill, contact, off-page, shrink, overflow and line-count numbers measured with the frozen
instruments against predictions **re-derived under the final rules in the plan's first task**. Corpus carriers of
the blend chain, prepared at 0 ISK: `CNX_Chem_05_02_IcePack` and `CNX_Chem_08_02_HybrdOrbit` load faster and render
pixel-identically. **A miss on a predicted number stops the work until it is explained.**

---

## The repair run — 0 ISK, a separate data commit, before the PR is merged

1. **Pre-flight, after the bump commit:** `git fetch origin`; `git grep -c '"state"' origin/main --
   'books/*/figure-text/*.json'` — expect 0 (re-check again before merge: prod writes `state` on approval).
   `node tools/figure-run.js --book efnafraedi-2e --chapter 3 --stale --dry-run` (15 selected, 26 deselected,
   `15 translated`, `VERDICT ok`) and chapter 4 (19 / 11 / `19 translated`); 15 + 19 = 34.
2. **Real run:** the same without `--dry-run`, **in the foreground, in modest batches**. Expect
   `MT spawned for 0 figure(s)`, each `media/<basename>_IS.svg` rewritten, each sidecar changing **only**
   `composedVersion` → `'3'` (diff the sidecars field by field).
3. **Convergence:** an immediate second `--stale` run reports 34 `skipped-current`.
4. **Commit** media and sidecars as their own commit.

## Acceptance — [USER] looks

Every one of the 34 rendered in Chromium through an `<img>` host page, stacked **SOURCE / BEFORE (E) / AFTER**,
published as one private review page, each figure annotated with what it **should** now show (the ② formulas, the
③ blocks and mechanisms from `c3-containers.md` §4, the ⑨ decimals, exocytosis visible at all) and what is **out of
scope** (⑪ wording, ④ arrowhead colour, ⑩ brain's outline). exocytosis, which headless Chromium could not load
before, is rendered after the collapse like any other figure. **[USER] looks and says yes.** No value check saw
this defect class, so no value check can clear it.

## Documentation, in the same PR

Campaign register §C140: rows ② ③ ⑨ and a new row for the exocytosis load fix; ⑩ re-stated as its own item with the
exocytosis evidence against the heal · new register lines, logged not fixed: sandwich's residual load, Firefox /
WebKit never measured (cairo's element-referencing `feImage`), the panel's double-space decimal false positive
(harmless — identity compares tokens), `localizeNumberFull`'s multi-group bug, Liberation Sans lacking
`⁰ ⁺ ⁻ ⇌ ⇄` for editor-typed text, the earlier frozen evidence folder that cited raw data it did not hold ·
figure-text `REGISTER.md` component rows (`compose.py`, `svgout.py`, `strip-text.py`, the new helpers) ·
`compose.py` module docstring · `README.md` · project memory, pointers only.

## Hazards carried from the evidence

- **Block keys must not move.** Nothing in `lines()`/`group()`/`block_key` changes; stacked-split attach is for
  tokens only. `blocks.json` byte-identity 34/34 is the check.
- **One `<text>` per styled segment changes element counts** on the 13 scripted figures; `test_figure_compose.py`'s
  `drawn_text` substring checks and E's by-name `<text>` comparison instrument must be read and re-scoped, not
  bulk-edited.
- **The collapse and the sentinel depend on cairo's output**: the collapse on its shape, the sentinel on nothing but
  references. Keep both; never the collapse alone.
- **`--stale`, never a bare run** — a bare run buys any figure with no sidecar.
- **fontTools stamps `head.modified`** — compare `<text>` elements and face structure, never file hashes.
- **Mutation-testing restore:** copy each file to a golden before the first mutation, `cmp` after every round and at
  the end; `git status --porcelain` whenever an agent that mutates files goes quiet.
- **`PYTHONDONTWRITEBYTECODE=1`** for any agent that must not write into the repo.
- **Chromium survivor checks:** Playwright's processes are named `chrome-headless`; `pgrep -x headless_shell` and
  `pgrep -x chrome` see nothing.
