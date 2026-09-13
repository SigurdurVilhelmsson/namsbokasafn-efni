# COMPOSE-FIDELITY — why the bought figures look damaged when every check passes

> 🧊 **FROZEN EVIDENCE, 2026-09-13.** Cited, never synced. Status lives in [REGISTER.md](REGISTER.md);
> the campaign's next action lives in the campaign register's ⏩ RESUME. If this file disagrees with
> either, they win. Cost of everything below: **0 ISK** (no MT call, no `figure-run.js` without a
> harness, nothing under `books/` modified).
>
> Raw reports, instruments, the prototype diff and renders:
> [`evidence/2026-09-13-compose-fidelity/`](evidence/2026-09-13-compose-fidelity/README.md).
> Numbers here were re-measured by an adversarial verifier unless marked otherwise.

## The question

34 figures were bought (ch03 15, ch04 19 — `CNX_Chem_14_03_FishLemon` lives in a ch04 module). Every
automated check passed. [USER] looked at two pictures and found them mangled: sub/superscripts
flattened, equation text on top of arrows, and three figures whose every sent block came back
identical recomposed anyway. **A value check cannot see formatting that was destroyed.**

## Denominators — the unit is the DRAWN block

| 34 figures | drawn blocks | unique (figure, key) |
|---|---|---|
| never sent (`send:false`) | **184** | 105 |
| sent, translated | **176** | 162 |
| sent, came back identical | **7** | 7 |
| **total** | **367** | 274 |

**191 of 367 drawn blocks are English that the composer re-lays.** ⚠️ An earlier count of *205*
(and "198 never sent") subtracted a per-key number from a per-block number: 14 translated keys are
drawn twice. Five independent recounts agree on 184/176/7.

Identity is 7 under exact `value == key`, under `|`→space, and under whitespace-normalised
`value == english`. Prepared keys equal sidecar keys on 34 of 34, so the prep is the bought vintage.

## 🔴 The root cause: the composer turns POSITIONED RUNS into STRINGS and lays them out again

The read layer keeps everything. `runs.json` for HClsoln: `'H'` 9pt y=21.23 · `'2'` **7pt y=18.23** ·
`'+'` **7pt y=25.23** · `aq`/`g`/`l` in a font whose `meta.fonts` base is **LiberationSans-Italic**.
The composer discards it:

| # | mechanism | where | exposure (34 figs) |
|---|---|---|---|
| M1 | each line is `''.join`ed and drawn at ONE size on ONE baseline → sub/superscript flattened | `compose.py:147`, `:264-291` | **52/367 blocks, all 52 damaged** (K 14 · I 4 · T 34), 18 figs — a category |
| M1b | italic never drawn: `setfont` has no slant; `svgout.py` embeds Regular + Bold only | `compose.py:54-58`, `svgout.py:16-19` | 7 blocks, 1 fig here; **901 redrawn blocks corpus-wide** |
| M2 | `wrap()` does `para.split()` + `' '.join` → an arrow gap of 10 typed spaces becomes 1; the shorter line is re-centred **onto the arrow** | `compose.py:252,258` | 2 blocks (both identity, HClsoln); Chromium DOES honour `xml:space="preserve"` — the collapse is ours |
| M3 | a superscript kerned back over a subscript (`NH₃⁺`) is admitted by `group()`'s arc clause and split by `lines()` (0.5·max size) → one baseline drawn as two lines | `figtext.py:61-66` vs `:31-37` | 1 block here; **59 blocks / 25 composed figs corpus-wide** |
| M4 | the flattened line is wider and centre-anchored → overhangs the page edge (`H2O(l)` at x=−0.54; the source is at 0.0) | `compose.py:236-238,281` | advance box only; 0 ink px off-page for that label |
| P3 | the arc clause joins two single glyphs up to 1.6·size apart; `''.join` erases the gap with no whitespace involved (`+ ⁰₁n` → `+n⁰₁`) | `figtext.py:35-37` + `compose.py:147` | 0 here; **18 blocks / 6 composed figs** (nuclide notation) |
| P2 | multi-line blocks re-led at `size × 1.222` whatever the source pitch | `compose.py:274-277` | mild where looked; 61 corpus blocks outside every other class |

**M0 — THE DAMAGE IS OURS AND MT-INDEPENDENT.** `compose.py --control` re-injects the figure's own
English and never calls the MT; its `<text>` elements are **identical** to the published `_IS.svg`
for HClsoln, basehyd and GreenChem (XML parse; positive control: vitC and FishLemon differ).

⚠️ **CORRECTED PREMISES** (the 2026-09-13 morning agenda carried them):
- *"Sub/superscript is lost at EXTRACTION, so the composer cannot restore what it never received"* —
  **false.** It is present in `runs.json` and discarded at compose.
- *"Text re-laid-out at different metrics lands on the arrow"* — for the named case the mechanism is
  **whitespace collapse** (M2). The source font IS Liberation Sans; the metrics were identical.
- ⚠️ **`--control` is not a source-faithful baseline for formula lines (N1).** The wrap budget is
  measured per run at each run's own size, then the FLATTENED line is re-measured at 9pt, so the
  English itself re-wraps on 5 of 176 T blocks (e.g. `Multiply by|Avogadro’s|number (mol–1)` 3→4 lines).

## The measurements

### The pixel instrument (layout only — read its limits)

Per-block, text-isolated: `ink = dark(render) & ~dark(artwork.png)` against a 200 dpi `pdftocairo`
render of the source, scored per block and per run (dilated IoU, centroid offsets).

| control | result |
|---|---|
| ours := source | 367/367 perfect |
| ours := artwork (no text) | 367/367 zero |
| source ink of ONE block removed | that block 0.0, every other block still 1.0 (attribution does not bleed) |
| independent re-implementation (no shared code) | agrees within 0.02 on 299/301 isolated blocks |
| planted flatten | 52/52 detected |
| planted 2 px down shift, in compose.py's REAL cairo state | **193/313 (61.7%)** |
| planted 1 px shift | 4/313 |
| **red or blue text · `l`→`I` · decimal point→comma** | **0/313 · 0/103 · 0/37** |

🔴 **IT IS A LAYOUT INSTRUMENT, NOT A CONTENT OR COLOUR INSTRUMENT.** A "faithful" score says nothing
about which characters or which colour. ⚠️ The first calibration was rendered in a cairo font-cache
state compose.py never enters (a hint-none measurement context created first changes later
hint-default renders by 6–13k px per figure); its "2 px detected 313/313" overstated sensitivity. The
**damage flags stand** (they sit far beyond both references); the **nulls are weak**.

**Current composer, control mode:** **56/367 blocks worse than a faithful redraw, 55 grossly**,
18/34 figures. Plain blocks flagged: 2/258, both a real collision (ethene `H`) — a weak null.

### Prototype E — draw English-kept blocks RUN-EXACT (scratch only, measured)

*Kept* := `--control`, or key not in the translations, or empty value, or identity (token-equal to
what went on the wire). Each run drawn at its own x, y, size, rot, fill, face chosen from
`meta.fonts[run.font].base` (Regular/Italic/Bold/BoldItalic); one `<text>` per run. Translated blocks
untouched. Diff: [`instruments/2a/compose.run-exact.diff`](evidence/2026-09-13-compose-fidelity/instruments/2a/compose.run-exact.diff).

| measure | current | prototype |
|---|---|---|
| kept blocks damaged, translated mode (cairo) | **21/191** | **2/191** (both ethene `H`, hit by a *translated* line) |
| kept blocks, browser, "worse than the other" (plus variant) | worse on **61/189** | worse on **0/189** |
| translated-block draw items vs current | — | identical 258/258, 34/34 figures |
| `compose-report` `blocks`/`missing`/`translated` multisets | — | equal 34/34, both modes |
| SVG bytes (34 figs) | — | +15.8 KB (one italic face) |
| compose time | 21.65 s | 21.11 s (noise) |

"Plus" = prototype + the PDF's own STIX subset re-embedded + `text-rendering:geometricPrecision` +
`font-kerning:none` on the 6 runs the source set unkerned. ⚠️ "Current worse than plus" has no measured
false-positive rate; "plus worse than current = 0" stands on its own (also 0 at half thresholds).
Chromium only — no Firefox/WebKit on this box.

Visual: [`HClsoln stack`](evidence/2026-09-13-compose-fidelity/images/HClsoln__stack_source-published-proto-plus.png)
(source / published / prototype / plus) and [`FishLemon`](evidence/2026-09-13-compose-fidelity/images/FishLemon__stack_source-published-proto-plus.png).

**What E does NOT fix — the translated blocks (176/367):**
1. **34 of the 52 script blocks are translated** — the formula sits inside MT prose
   (`Massi C7H5NO3S (g)`). A **source-keyed formatting transfer is feasible**: 36/38 formula tokens
   verbatim in the Icelandic, 2 modified but anchor-placeable, **0 vanished**; a prototype placed
   **52/52 script stretches, 0 misplaced**; it reproduced the source mask character-for-character on
   6/6 identity blocks. Italic 0/162, bold block-uniform, colour never mixed, source gaps 0/162.
   ⚠️ Key on the SOURCE only: `(g)` is an italic gas state in HClsoln and roman *grams* in
   `Massi C2H5O2N (g)`. ⚠️ An editor-repeated formula is formatted once and the second copy silently
   stays flat (N4) — every miss must be NAMED in the report, and today nothing reads extra report fields.
2. **Re-flow collisions: ~44 of 176 translated blocks (22–23/34 figs)** land ink on artwork, overhang or
   shrink — 46 by glyph boxes, 43 by an independent ink instrument; 2 of the 46 overhang identically in
   `--control`, so they are flattening (M1), not translation layout. Causes: `BOXW = 63` (one figure's box applied to every label),
   a wrap budget of exactly the English width, and a **vertical-centre anchor**. **Labels that GAIN
   lines carry 77% of the collision ink.** 🔴 **No global constant fixes it** — BOXW=0 raises shrunk
   blocks 15→40; BOXW=80 raises hits 32→44; top-anchoring cuts ink 3,384→701 px but raises off-page
   4→9. **The budget and anchor must be per block.**

## ① The sidecar question — measured against the real driver

Harness: the REAL `runFigures`, `publishFigureSvg` and `applyApprovedFigureEdits` against throwaway
`books/` roots ([`instruments/verify/harness.mjs`](evidence/2026-09-13-compose-fidelity/instruments/verify/harness.mjs)).

| option | what happens | verdict |
|---|---|---|
| **A** status quo | composes, publishes, damaged | an editor approving the card **certifies damaged artwork** (`effectiveState` → `approved`) |
| **B** sidecar written, not stamped | stale (`figure-run.js:272`) → next run composes and publishes → **becomes A in one run** | not a state |
| **B′** sidecar **stamped at mint** (`composedHash = renderHash`, no compose) | **stable**, zero `isStale` change, hash-bound for free (an editor edit makes it stale and it composes) | but `effectiveState` reports **approved** for an image never composed from those blocks; silently reverts to A on any `COMPOSER_VERSION` bump or `--force`; the driver must still produce it |
| **C** no sidecar | re-bought every chapter-wide run; no editor card; abandons "record every purchase" | not recommended |
| **D** distinct disposition + keep "the original" | a new outcome, `isStale`/`effectiveState`/`applyApprovedFigureEdits` must all carry a marker (the last **erases** unknown keys — measured) | most code; and *which* original? June `_IS.svg` is broken for HClsoln; the OpenStax JPG needs the mapping row AND the file removed together |
| **E** faithful composer, lifecycle unchanged | identity figures compose to the source in structure; fixes the 184 `send:false` blocks in EVERY figure | **0 ISK** repair via `COMPOSER_VERSION` bump + `figure-run --stale`; prototyped and measured (above) |
| **E′** selective strip — leave the BT..ET text objects of never-sent and identity blocks IN the artwork; strip and redraw only translated blocks | kept text is the source's own glyphs: pixel-identical by construction, no italic/STIX faces, no browser advance rounding, no provenance call | **named by a verifier, NOT designed or measured.** Own hazards: mapping a run back to its content-stream operators; a text object holding both a kept and a translated block; the `7 Tr` clip-mode class already recorded in REGISTER.md |

**E's repair route — what was and was not exercised.** A harness drove the REAL `runFigures`, publisher
and staleness logic over the 34 committed sidecars with a **simulated** version bump and **faked
prepare/compose spawns** (fake prepare wrote each figure's real `blocks.json`, so the drift guards saw
real keys): 34 selected → 34 `translated` with **0 translate spawns** → second run 34
`skipped-current`; `renderHash`, `composerVersion`, `blocks` unchanged 34/34; restamped sidecar bytes
equal the committed files 34/34; a drift-guard control refused. ⚠️ **A real `COMPOSER_VERSION` change
and a real compose were NOT run** — so "0 ISK, no re-buy, converges" is measured; "the recompose
output is right" is the prototype's claim, not this harness's. No sidecar carries a `state`, so no
editorial ruling is demoted. ⚠️ Run `--stale`, never a bare run (a bare run buys any figure that has
no sidecar).

⚠️ **Under E an all-identity figure is faithful in structure, not pixel-identical** (rasterizer weight,
the artwork misregistration below). Publishing nothing is the only lossless choice for those — and
"nothing" is not the June file for HClsoln.

⚠️ **Removing an `_IS.svg` without its mapping row does not 404 an already-published figure — it
FREEZES the old published copy silently** (`cnxml-render.js` never sweeps `images/media/`).

## Defects outside the composer — reader-visible, every figure

| class | finding | exposure | fix, measured |
|---|---|---|---|
| **S** strip | `strip-text.py` drops EVERY operator inside BT..ET, including fill colour, which PDF graphics state carries past ET → later artwork recoloured | **visible 1/34** (combustion: 7 arrowheads blue-grey); colour ops inside BT in **18/34** | keep non-text ops → **0 px differ on 18/18** |
| artwork | `pdftocairo -svg` scales content by `min(w/⌈w⌉, h/⌈h⌉)` on non-integer page sizes → artwork misregistered against correctly placed text | scale present **24/24** non-integer pages; ≥1 px on 22/24; up to 4 px at 200 dpi; 0 px on 9/9 integer pages | pad the page box to whole points → dx −3/0/+3 → **0/0/0** on 2/2. ⚠️ `-origpagesizes` does **not** remove the scale |
| font | STIXGeneral glyphs (`+ = ×`) drawn in Liberation, ~2 px high | 45 blocks / 10 figs here; 883 corpus blocks | re-embed the PDF's own STIX subset (OFL; **extracting font programs from OpenStax PDFs is the lead's provenance call**) |
| browser | Chromium rounds advances to whole px; kerns 6 runs the source set unkerned | plain-block IoU median 0.81 | `geometricPrecision` → 0.90; per-run `font-kerning:none` |
| glyph | `⏞` U+23DE absent from Liberation → notdef box | 1 block corpus-wide (Carbon) | — |
| colour | `#000000` drawn vs poppler's (35,31,32) for 100% K | 367/367 | negligible |

## Spend hazards the driver cannot see — found by the census, before the next chapter

- 🔴 **MathematicalPi-One (custom encoding, no ToUnicode) decodes `°`→`8` and `−`→`2`.** Three readers
  agree (pdfminer, poppler, PDFium), so no reader swap fixes it. `CNX_Chem_10_01_PentIso`
  `boiling point: 36 8C` ×3 is **`send:true` and would be bought as "8C"**; `Amontons2` −100 reads `2100`.
- 🔴 **Two resolved artworks are production pages, not figures** (a page-size census over 910):
  `CNX_Chem_11_04_rvosmosis` is an "Art Dialogue Sheet" (13 sendable blocks, 8 of them sheet chrome);
  `CNX_Chem_18_07_N2O5` is an InDesign placement page whose only sendable block is the **filename**.

## Live production today — not caused by this run

🔴 **The June `CNX_Chem_04_02_HClsoln_IS.svg` that pupils are served is broken IN ITS BYTES**: 17 of 27
`<image>` elements carry a 44×42 px payload stretched to up to 467×739 (large blurred molecule blobs,
Cl⁻ spheres missing). File-intrinsic, not a browser quirk. **8 of 700** published mt-preview `_IS.svg`
files carry the same aspect-mismatch signature (ch01, 04, 05, 06, 08 ×2, 09, 10); only HClsoln is
visually confirmed. ▶ **So "nothing reached a reader" is true of the NEW files and a hold shields no
one from HClsoln.** Do not `git checkout` the June copies back — E recomposes them for free.

## Corpus exposure (whole population, no sample)

Funnel: 1,148 enumerated → 910 resolved → 910 read OK → 829 text-bearing → **463 composed**;
**11,312 redrawn blocks** (2,946 `send:true`, 8,366 `send:false`).

| | blocks | composed figures |
|---|---|---|
| any of script · italic · multispace · stacked split | **1,749 (15.5%)** — **1,380 of them `send:false` (79%)** | 249 / 463 |
| the same, **excluding italic-only** | 1,172 (258 `send:true`) | 218 |
| sub/superscript | 1,166 | 217 |
| italic | 901 | 129 |

⚠️ 37% of sampled italic blocks are italic only on `×`, `–` or `+`. The census is an UNDERCOUNT: P2
and P3 sit outside it.

| chapter | any | excluding italic-only |
|---|---|---|
| ch13 | 90/201 redrawn (9/9 figs) | **37/201 (8 figs)** |
| ch16 | 8/62 | **3 (1 fig)** |
| ch08 | 57% | 70% of that is italic-only |

## Smaller findings worth carrying

- `compose-report` `undecodable` names **19 keys / 8 figures in `--control` that carry no `(cid:)`** —
  `strip_undecodable`'s `.strip()` fires on lines that merely end in a space (`figtext.py:221`).
- `figure-compose.py`'s missing-key refusal tells the operator deleting the sidecar "discards no
  editorial decision" — for a pruned identity sidecar that advice re-buys and re-damages the figure.
- The review card lists only sidecar keys, so **184 reader-visible `send:false` labels are unreviewable**.
- fontTools stamps `head.modified`, so every recompose is byte-different: a hash cannot detect a no-op recompose.
- MT consistency across figures (not formatting): `Average atomic|mass` → `Meðalatómamassi` /
  `Meðalatómmassi` / **`Meðalsætismassi`** (*sæti* = seat); `Margfalda`/`Margfaldaðu`;
  `Deila`/`Deilið`; `Pútresín` vs `Pútreskínjón`.

## Hazards for whoever builds E

- **Block keys must not move.** `block_key` is built from `FT.lines`; fixing M3 in `lines()`/`group()`
  changes bought keys → drift guard → re-buy. Draw kept blocks run-exact instead; re-prepare the 34 and
  diff key sets (free) before shipping.
- An identity key **must stay in `translated`** — `figure-compose.py` assertion 2 requires
  `missing == send:false keys`. Add `identity` as its own list.
- `test_figure_compose.py:717` regexes `<text>` contents; one element per run changes element counts,
  and its FoodLabel case expects one empty `<text>`.
- Arc blocks drawn run-exact are unmeasured (0 arcs in the 34).
