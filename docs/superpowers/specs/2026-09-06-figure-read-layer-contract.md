# The figure read layer: the contract

**Date:** 2026-09-06 · **Status:** design. Not yet implemented.
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
| `font` | string | 🔴 **the RESOURCE KEY (`/TT0`), NOT the BaseFont.** It is a **join key** into `meta.fonts` |
| `size` | number | **VISUAL** size in pt = the `Tf` operand × `hypot(M[0], M[1])`. Not the `Tf` operand |
| `rot` | number | degrees, `atan2(M[1], M[0])` |
| `x` | number | 🔴 **BASELINE ORIGIN** in user space = `M[4]`. **Not a bounding-box corner** |
| `y` | number | 🔴 **BASELINE ORIGIN** in user space = `M[5]`, PDF origin bottom-left, **y up** |
| `adv` | number | the run's advance **in USER SPACE** = text-space advance × scale, and it **must include** glyph widths, `TJ` kerning, `Tc` char spacing and `Tw` word spacing |
| `fill` | tuple/null | fill colour, normalised (see below) |
| `tm` | array[6] | the full text-space → user-space matrix `M` |

#### The three traps, each of which fails SILENTLY

1. 🔴 **`font` MUST be the resource key.** `compose.py` builds
   `BOLD = {k for k, v in meta['fonts'].items() if 'bold' in v['base'].lower()}` and then tests
   `run['font'] in BOLD`. **An adapter emitting the BaseFont (`CYUXQR+LiberationSans`) makes that
   test match nothing, and EVERY BOLD LABEL SILENTLY RENDERS REGULAR.** No error, no count change.
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
| `fonts` | map, **keyed by resource key**, of `{base, first, last, subtype, encoding}` |
| `page` | `[width_pt, height_pt]` |
| `runs` | count |

⚠️ **`fonts[*].last` is load-bearing beyond bookkeeping:** `last < 200` is the subset-font signal
that warns a figure has no Icelandic glyphs. A reader that does not expose per-font first/last
char must supply that signal another way, or the warning disappears.

---

## What the reader MUST HANDLE

Each row is measured on chemistry 2e, denominator **1,148** CNXML `<image src>` basenames
(**895** resolved, **779** text-bearing) → [`TEXT-COVERAGE.md`](../../../experiments/figure-text-translation/TEXT-COVERAGE.md).

| # | requirement | measured exposure |
|---|---|---|
| H1 | text inside **`/Form` XObjects**, recursively, with the form's own `/Resources/Font` and its `/Matrix` composed with the CTM at the `Do` site | **274 figures** — 35% of text-bearing |
| H2 | **CID / `/Type0`** fonts, decoded through `/ToUnicode` | **11 figures**, and see the spend note below |
| H3 | **`/Encoding /Differences`** — a font may map a control byte to a real glyph | at least 1 known (`\x1f` → GREEK SMALL LETTER ALPHA) |
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

1. **Regression control** — on the **504** figures the current reader reads, the candidate must
   lose no text. ⚠️ **Compare CHARACTER MULTISETS, never word counts**: the two readers segment
   words differently, and a naive comparison produced **155 false regressions** of which the
   measured `.pdf` set held **zero** real ones.
2. **Positive control** — on the **275** it cannot read, the candidate must return non-empty runs.
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

⚠️ **The `.eps` half of (1) is UNMEASURED**, not clean → the register owns that item.

---

## Out of scope

Block grouping and layout (`figtext.py`) · composition and SVG output (`compose.py`, `svgout.py`) ·
the MT leg · the sidecar, publish and review path · adding Python to CI.

## Open questions — the register owns whether any of these is next

- `experiments/` appears in **no licence table** in the root `LICENSE`, and this contract implies
  adding a third-party dependency there.
- Whether the reader is a library adapter or a subprocess boundary — a subprocess is the weaker
  licence coupling and the easier fallback, at the cost of per-figure spawn.
