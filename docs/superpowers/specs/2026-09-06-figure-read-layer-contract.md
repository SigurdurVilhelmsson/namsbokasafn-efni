# The figure read layer: the contract

**Date:** 2026-09-06 · **Amended 2026-09-07 (M5 R5)** — the four corrections below are
marked inline; everything else stands as written.
**Owner of:** what the figure-text READ layer must PRODUCE and must HANDLE — the enforceable
interface between artwork on disk and the layout stage.
**Why this exists:** the read layer was written against one figure and never had a written
contract. Two blind reviews and three measurement rounds later, **every blocking defect was a
capability nobody had written down.** → decision: [`docs/decisions/2026-09-06-figure-read-layer-respec.md`](../../decisions/2026-09-06-figure-read-layer-respec.md)
**Status of the work is the campaign register's.** This document carries no status verbs.

---

## Scope

**In:** producing `runs.json` + `meta.json` from one artwork file.
**Out:** block grouping, wrapping, composition, MT, publishing. Those consume this contract and
are explicitly **not** being replaced — `figtext.py`, `compose.py`, `svgout.py` stay.

▶ **This is why the swap is small: the read layer's entire observable behaviour is two JSON files.**

---

## The output contract

### `runs.json` — an ARRAY of run objects, in content-stream order

🔴 **NINE fields, not eight.** *(Prose written earlier the same day said eight — it omitted `tm`.
This document is the owner of the list; where anything disagrees, this wins.)*

| field | type | meaning — and the trap |
|---|---|---|
| `text` | string | the shown string, after escape-unwrapping and WinAnsi mapping |
| `font` | string | 🔴 **a SCOPE-QUALIFIED join key into `meta.fonts` — `PAGE/TT0`, `PAGE/Fm3/T1_0` — NOT the BaseFont, and NOT a bare resource key.** *(Amended 2026-09-07, ruling R-4. This row said "the RESOURCE KEY (`/TT0`)". A form's `/Resources` is its own scope, so a flat map is unsound **in principle**: measured, **7 of 274** form-text figures have one resource key naming two different BaseFonts. The join-key PROPERTY is what this contract requires; "the resource key" was its wording, not its purpose. `compose.py` needed no change — it derives `BOLD` from `meta.fonts` and tests `run['font'] in BOLD`, so both sides move together.)* |
| `size` | number | **VISUAL** size in pt. 🔴 **NOT `hypot(M[0], M[1])`** — that is the BASELINE direction, which ghostscript leaves unit-scaled, so on `.eps` it reports **1.0** where the real size is **9.0**: measured bimodal, agreeing **283 of 283** on `.pdf` and **0 of 318** on `.eps` (ruling R-5). 🔴 **And NOT a bare `char['size']` either** — pdfminer sets that to the axis-aligned bbox HEIGHT, so on rotated text it is the glyph's WIDTH and varies per character, splitting one label into one run per glyph. **The owner of the derivation is `readlayer._visual_size`, whose docstring carries the algebra; read it there.** *(Amended 2026-09-07. This row prescribed the `hypot(M[0], M[1])` form, which was wrong for all 280 EPS figures — 36% of the corpus.)* |
| `rot` | number | degrees, `atan2(M[1], M[0])` |
| `x` | number | 🔴 **BASELINE ORIGIN** in user space = `M[4]`. **Not a bounding-box corner** |
| `y` | number | 🔴 **BASELINE ORIGIN** in user space = `M[5]`, PDF origin bottom-left, **y up** |
| `adv` | number | the run's advance **in USER SPACE** = text-space advance × scale, and it **must include** glyph widths, `TJ` kerning, `Tc` char spacing and `Tw` word spacing |
| `fill` | tuple/null | fill colour, normalised (see below) |
| `tm` | array[6] | the full text-space → user-space matrix `M` |

#### The three traps, each of which fails SILENTLY

1. 🔴 **`font` MUST be a JOIN KEY into `meta.fonts` — scope-qualified (`PAGE/TT0`, `PAGE/Fm3/T1_0`).**
   `compose.py` builds
   `BOLD = {k for k, v in meta['fonts'].items() if 'bold' in v['base'].lower()}` and then tests
   `run['font'] in BOLD`. **An adapter emitting the BaseFont (`CYUXQR+LiberationSans`) makes that
   test match nothing, and EVERY BOLD LABEL SILENTLY RENDERS REGULAR.** No error, no count change.
   ▶ **It is the join PROPERTY that this trap is about, not which string implements it.**
   🔴 *(CORRECTED 2026-09-08. This trap read "**`font` MUST be the resource key**" — the wording
   the `runs.json` row above was AMENDED away from on 2026-09-07, explicitly to "NOT a bare
   resource key", for the measured reason the amended row gives (which owns that measurement and
   is not restated here). This document declares itself the winner
   on disagreement, so leaving the stale half here made it OUTRANK the amended row: a reader
   following this trap emits a bare key and collapses exactly those figures.)*
2. 🔴 **`x`/`y` are the baseline origin, not the bbox.** A reader offering both — pdfplumber's
   `x0`/`y0` are bbox corners, its `matrix[4]`/`matrix[5]` are the origin — makes this a one-word
   choice with no visible symptom until descenders and multi-size lines drift.
3. 🔴 **`adv` feeds adjacency arithmetic, not layout directly.** `figtext.py`'s `along()` test is
   `-0.5 <= along(r) - along(p) - p['adv'] < 2.5`. **An `adv` off by a constant factor does not
   look wrong — it silently changes where blocks are CUT**, which changes what is bought and what
   is composed.

### `meta.json`

| field | meaning |
|---|---|
| `source` | 🔴 **path whose BASENAME is the figure's identity** — the publisher cross-checks it against the sidecar key. A staged/converted file named anything else is refused **after payment** |
| `fonts` | map, **keyed by the SCOPE-QUALIFIED join key** of the `runs.json` `font` row above — not a bare resource key — of `{base, first, last, subtype, encoding, decodable}`. *(Corrected 2026-09-08: this said "keyed by resource key", the third instance of that stale claim in this document and the one a reader reaches after correctly reading the amended `font` row. `decodable` is H2's signal and every entry carries it.)* |
| `page` | `[width_pt, height_pt]` |
| `runs` | count |

⚠️ **`fonts[*].last` is load-bearing beyond bookkeeping:** it feeds the subset-font signal that
warns a figure has no Icelandic glyphs. A reader that does not expose per-font first/last char
must supply that signal another way, or the warning disappears.
🔴 **CORRECTED 2026-09-08 — THE SIGNAL IS NOT `last < 200`, AND THE ONE-SIGNAL FORM CRASHES.** A
`/Type0` font carries `/W` and has **no `/LastChar` at all**, so `last` may legitimately be
`None` and the comparison raises `TypeError`. **The predicate is `is_subset` in `extract.py` —
TWO-signal: the `last` threshold when `last` is not None, otherwise the `ABCDEF+` BaseFont-prefix
test. That function owns the threshold and it is deliberately not restated here.** *(This was the
same defect the M5 plan's Task 2 carried; stated here as the contract a reader implements
against, it would have been built in twice.)*

---

## What the reader MUST HANDLE

Each row is measured on chemistry 2e, denominator **1,148** CNXML `<image src>` basenames
(**895** resolved, **779** text-bearing) → [`TEXT-COVERAGE.md`](../../../experiments/figure-text-translation/TEXT-COVERAGE.md).

| # | requirement | measured exposure |
|---|---|---|
| H1 | text inside **`/Form` XObjects**, recursively, with the form's own `/Resources/Font` and its `/Matrix` composed with the CTM at the `Do` site | **274 figures** — 35% of text-bearing |
| H2 | **CID / `/Type0`** fonts, decoded through `/ToUnicode` | **11 figures**, and see the spend note below |
| H3 | **`/Encoding /Differences`** — a font may map a control byte to a real glyph | 🔴 **96 of 280 EPS figures (34%)** — `°C` read as `¡C`, `λ` as a DEL byte, **and that wrong text reaches the PAID MT and the published image**. *(First seen as a single Greek-alpha instance; measured far larger.)* |
| H4 | `/Contents` as **an ARRAY of streams**, concatenated | already handled; must not regress |
| H5 | **`.eps` / `.ai`**, via `gs -dEPSCrop -sDEVICE=pdfwrite` before parsing | the precedence-winning tree is EPS-only for some chapters |
| H6 | **colour operators beyond `k`** — the current reader tracks CMYK (`k`) **only**, so `rg`, `g`, `sc`/`scn` fills are not recorded at all | unquantified; a known gap |
| H7 | a colour space with **2 components** — pdfplumber warns `Cannot set non-stroke color: 2 components specified` | observed on chemistry figures |
| H8 | a figure with **no text at all** returns `[]` — a success with zero runs, **never** an exception | the `copied-textless` population |

🔴 **H2 IS A SPEND REQUIREMENT, NOT A QUALITY ONE.** The current reader does not crash on a
`/Type0` font and does not return empty — **it returns plausible-looking text made of control
bytes** (`'\x00\x0b\x00D\x00\x0c'` where the figure says `(a)(b)`). Nothing downstream tells that
from English, so it can be marked `send: true` and **reach the paid MT**. ▶ **A reader that cannot
decode a font MUST say so in `meta.fonts` rather than emit bytes.**

⚠️ **H1–H3 are not a closed list.** One figure — `CNX_Chem_20_01_recycle`, 103 words — is already
outside every mechanism named here. **Do not build a check that enumerates mechanisms.**

---

## Acceptance — two-sided, free, and derived from a committed census

🔴 **Neither side alone is sufficient. A gain on the failing set means nothing without the
regression control, and the regression control alone cannot see a missing capability.**

🔴 **AMENDED 2026-09-07 — NO POPULATION IS WRITTEN DOWN HERE ANY MORE, AND THAT IS RULING R-2.**
This section carried **504** read / **275** unread. Both were the **bake-off's guarded reader's**
numbers — a third program, neither the baseline nor the candidate — and the real baseline does not
merely fail to read those figures, it **crashes** on them. ▶ **The harness re-derives every
denominator from the census partition on each run and prints the table; the measured table's owner
is [`experiments/figure-text-translation/READ-LAYER-ACCEPTANCE.md`](../../../experiments/figure-text-translation/READ-LAYER-ACCEPTANCE.md).**
Read it there — a population hard-coded in prose is how the two wrong numbers above survived.

1. **Regression control** — on the figures the current reader reads, the candidate must lose no
   text. ⚠️ **Compare CHARACTER MULTISETS, never word counts**: the two readers segment
   words differently, and a naive comparison produced **155 false regressions** of which the
   measured `.pdf` set held **zero** real ones.
   🔴 **AMENDED 2026-09-07 — AS WRITTEN, "LOSE NO TEXT" CONTRADICTED THIS DOCUMENT'S OWN H2 AND
   WOULD HAVE REJECTED THE FIX IT EXISTS TO ACCEPT.** Two independent ways:
   - **H2 REQUIRES a loss.** The baseline's `/Type0` output is control-byte garbage, and H2 says a
     reader that cannot decode a font must declare it rather than emit bytes. A candidate obeying
     H2 therefore *loses* every one of those characters. **C1b is the rule that governs the type0
     bucket**: the candidate must **either** return correctly decoded text **or** mark the font
     `decodable: false` — and *a silent reduction is a FAILURE*, which is the part a bare "lose no
     text" cannot express.
   - **A mojibake fix reads as a loss.** Where the candidate correctly reads `°C` that the baseline
     read as `¡C`, the `¡` is "missing". So the tiebreak asks poppler — but it must ask by COUNT.
     🔴 **AMENDED 2026-09-07 — THIS DOCUMENT STATED A MEMBERSHIP PREDICATE THE CODE HAD ALREADY
     REPLACED, AND THE SPEC DECLARES ITSELF THE WINNER ON DISAGREEMENT, SO THE STALE HALF OUTRANKED
     THE WORKING ONE.** It read
     `regression ⟺ (baseline_chars − candidate_chars) ∩ oracle_chars ≠ ∅`. **`∩` asks "does poppler
     see this glyph ANYWHERE?" where the question is "are we now SHORT of what poppler attests?"**
     — the same wrong unit as ruling R-13, and commit `7fab73b7` fixed the code out of it. ▶ **The
     predicate the harness implements is
     `regression ⟺ ∃ch. (baseline_chars − candidate_chars)[ch] > 0 ∧ candidate_chars[ch] < oracle_chars[ch]`.**
     Measured on `CNX_Chem_18_03_SiPurif`, the only C1 regression in the full run: the baseline
     emits 44 characters of binary garbage before three real labels and the candidate drops all
     44, one of which is a `c` (baseline 4, candidate 3, oracle 3). **Membership flags it; counts
     flag nothing, and nothing is what is true.**
     ⚠️ **HONEST CAVEAT: strictly more precise, not perfect.** Where the counts coincide it still
     cannot tell a dropped junk `c` from a dropped real one. It removes a class of FALSE
     regression; it does not prove no real character was lost.
     ⚠️ **The excused set is reported as its own non-failing column**, never silently — that column
     is where a real loss of something poppler cannot see would hide.
2. **Positive control** — on the figures it cannot read, the candidate must return non-empty runs.
   🔴 **AMENDED 2026-09-07 — AS WRITTEN THIS WAS AN EXISTENCE TEST, AND IT LEFT THE POPULATION THE
   SWAP EXISTS FOR WITH NO COMPLETENESS CHECK AT ALL.** "Non-empty runs" is
   `any(r['text'] != '')`, so ONE SPACE satisfies it. On the 287 figures the baseline crashes on,
   criterion 1 is out of scope by construction (the baseline must read a figure to be compared
   against), criterion 4 needs both readers, and only the 8 `/Type0` figures get C1b — leaving
   **279 figures graded solely on "did we emit anything"**. Measured with a realistic partial
   /Form-walk mutant: **70% of oracle-attested characters lost, every criterion clean, exit 0**,
   while the SAME mutant trips criterion 1 on 40 of 40 figures where the baseline reads.
   ▶ **The candidate must additionally hold, per character, AT LEAST what the oracle attests**
   (`C2b`: `∃ch. candidate_chars[ch] < oracle_chars[ch]` is a failure), scoped to the figures where
   the oracle has text and the candidate reads — the SILENT case. A candidate that raises or is
   empty is loud and criterion 2 already names it. **The comparison datum was collected on every
   row from the start (`oracle_chars`) and read by nothing but two print statements.**
3. **Oracle agreement** — poppler `pdftotext` is a third, independently-implemented instrument.
   Where the candidate and the oracle disagree on whether a figure has text at all, that is a
   finding.
4. **Field conformance** — for a figure both readers handle, the nine fields must agree within
   tolerance, with **`font` compared as a join key** and **`x`/`y` as baseline origins**.
5. **Round trip** — the composed `--control` image (the figure's own English re-injected) must
   still match OpenStax's published raster via `check.py`. **This is the only check that sees the
   whole chain**, and it is what catches a contract satisfied field-by-field and wrong in
   composition. With `--control` it is a **true oracle**: the tool's own docstring says *"any
   disagreement is our defect, not a translation."*
   🔴 **BUT DO NOT GATE ON ITS PERCENTAGE.** `check.py`'s own header warns: *"Read the overlay,
   not the percentage. Antialiasing between two rasterisers swamps layout error"* — **fixing four
   real placement bugs moved the scalar 3.00% → 2.70% while the overlay changed completely.** A
   numeric threshold here is a gate that cannot see the thing it is guarding. Compare overlays,
   or compare `ITEMS` (the drawn string plus its x/y/size/rot) run-for-run, which is what the
   block-key measurement used and which is exact.

✅ **The `.eps` half of (1) WAS measured the same day: 280 figures, 0 real character losses, 0 `gs` conversion failures** → `TEXT-COVERAGE.md` addendum 2. ⚠️ **What remains unmeasured is whether `gs` itself drops text before either reader sees it** — a reader-vs-reader check structurally cannot answer that; only criterion (5) can.

---

## Out of scope

Block grouping and layout (`figtext.py`) · composition and SVG output (`compose.py`, `svgout.py`) ·
the MT leg · the sidecar, publish and review path · adding Python to CI.

## The two questions this contract carried — both ANSWERED (the register owns what is next)

*(Both questions this section carried were ANSWERED and are removed here on 2026-09-08 rather than
restated — an open licence question on a public repo is the class this project treats as blocking,
so a stale one costs real investigation time, and a settled architectural decision re-opened costs
the same twice.)*

- **The licence question → root [`LICENSE`](../../../LICENSE), which owns the answer and its
  rationale.** Do not restate the table here.
- **Library adapter *or* subprocess boundary: both ends were taken.** The existing
  `emit-blocks.py` → `extract.py` subprocess seam is KEPT, and the adapter is imported as a
  library behind it — so the on-disk contract above is unchanged and the spawn count does not
  move.
