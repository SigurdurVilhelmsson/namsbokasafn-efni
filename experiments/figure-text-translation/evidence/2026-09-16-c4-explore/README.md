# Evidence — what `strip-text.py` deletes inside text objects, and what keeping it would change, 2026-09-16

> 🧊 **FROZEN, 2026-09-16.** Cited, never synced. Open work and status live in the campaign register (§C140 ④,
> ⏩ RESUME); the design that rests on this is
> [`docs/superpowers/specs/2026-09-17-c140-c4-strip-keeps-gstate-design.md`](../../../../docs/superpowers/specs/2026-09-17-c140-c4-strip-keeps-gstate-design.md).
> **0 ISK** — no MT, no `figure-run.js`, nothing under `books/` written; every strip variant was made by importing
> `strip-text.py` and replacing `strip_text_ops` in a separate script.

## How it was measured

A four-agent workflow, run one heavy step at a time: a **census** of every operator inside BT..ET, a **render** of
three strip variants, a read-only **propagation** map of how a strip change reaches readers, and a **critic** that
spot-checked the other three against their raw files. Reports: `census/REPORT.md`, `render/REPORT.md`,
`propagation/REPORT.md`, `critic/REPORT.md` (the critic's own write was refused by a harness hook; the controller
wrote its returned result there verbatim). Instruments are in `instruments/` (census and render) and `critic/*.py`.
They name the scratch paths they ran in — provenance, not a dependency. `render/REPORT.md` links about 100 crops at
those scratch paths; **only the six in `render/crops/` were kept** — every number is in `render/results.jsonl.gz`.

**Re-derived by the controller from the raw files** (not from any report): the census operator totals and the
class totals; 517 rows / 18 bought with a non-text operator inside BT; the render population (533 × 3 variants, all
ok); PERSIST vs NONTEXT differing on 0 figures; 34 figures changed by value, 15 above the 40-per-channel threshold;
combustion the only bought figure changed; the serialiser control (34 rows, 0 px each); and all 5,849 `gs`
occurrences inside BT resolving to a default ExtGState. The controller also **looked** at the combustion and Egeom
crops.

## What was found

| | measured | where |
|---|---|---|
| population | 911 rows walked = 909 distinct figures + N2O5 scanned as both its `.pdf` and its `.eps`, plus rvosmosis (refused by the resolver). 0 staging, parse or unparsable-form failures. The 34 bought figures are exactly the 34 committed sidecars | `census/results.jsonl.gz`, `critic/sidecars.txt`, `critic/census_claims.txt` |
| what occurs inside BT..ET besides text | **only `k` (6,100 occurrences / 503 figures), `gs` (5,849 / 415) and `rg` (148 / 12)** — persistent graphics state. Special graphics state (`q`/`Q`/`cm`), marked content, paths, XObjects/shadings/inline images, `BX`/`EX` and anything else: **0**. The instrument's self-test detects all seven classes | `census/REPORT.md`, `census/fixture-selftest.txt` |
| where | 517 of 911 rows (516 of the 909 figures the live pipeline reads; N2O5's `.pdf` is not used). **Native `.pdf`: 517 of 611. Ghostscript-staged `.eps`: 0 of 299**, though 285 of them contain BT — staging rewrites the content (N2O5's `.pdf` has `k`+`gs` inside BT, its staged `.eps` none). Bought: 18 of 34 | `census/REPORT.md`, `critic/census_claims.txt` |
| positive control | combustion: a `k` inside BT whose colour later fills paint (the 7 arrowheads) | `census/positive-control-combustion.txt` |
| three strip variants | **ORIG** (shipped: drop everything inside BT) · **PERSIST** (keep only persistent graphics state) · **NONTEXT** (drop only text operators — the 2026-09-13 prototype) | `instruments/strip_variants.py` |
| render controls | ORIG stripped twice, and an identity parse/unparse: **0 px** (34 per-figure rows plus 2). A planted rectangle: detected (441 px) | `render/results.jsonl.gz`, `render/controls/smoke_combustion.json` |
| **PERSIST vs NONTEXT** | **identical on 533 of 533 figures** — on this corpus nothing inside BT separates them | `render/results.jsonl.gz` |
| what keeping the state changes | **34 of 533 figures change by value, 15 visibly** (>40 per channel); every changed pixel moves **onto the source's own pixels** (mean distance 0.0 on all 34) | `render/results.jsonl.gz`, `critic/spotcheck.txt` |
| bought figures | **only combustion changes** — 2,121 px >40, 7 connected components (the 7 arrowheads), black again (looked: `render/crops/CNX_Chem_04_05_combustion_stack.png`) | `render/results.jsonl.gz` |
| not yet bought — the shipped strip would damage them visibly when they are | 14 figures, including **Egeom** (the wedge and dash bonds almost vanish; looked: `render/crops/CNX_Chem_07_06_Egeom_stack.png`), IcePack/Icepack, HazDiamond, Damage1/2, OxyacTorch, ChnReact1 | `render/results.jsonl.gz` (15 above threshold minus combustion) |
| `gs` inside BT | **5,849 of 5,849 name a default ExtGState** (Normal blend, no soft mask, alpha 1). Positive control: `/BM /Multiply` ×51 and `/SMask` dictionaries ×1,929 elsewhere in the same files. 6 set overprint (`/OP true`), none bought | `critic/gs_resolve.txt`, `critic/gs_op_true.txt` |
| a kept `gs` can RESET an earlier blend or mask | reachable on 27 of 56 exposed figures; **bought: HClsoln (16 paints) and sandwich (2)**. That can be invisible in pixels and still change `artwork.svg`'s structure — the render measured PNG only | `critic/gs_reset_exposure.txt` |
| staleness | `isStale()` never looks at strip output; a strip-only change makes no bought figure stale. Routes: bump `COMPOSER_VERSION` (every approved figure back to review) or `figure-run.js --stale --force` (media only, as the 2026-09-15 recompose did) | `propagation/REPORT.md` §2 |
| tests | the one test that executes `strip_text` (`test_readlayer.py` case 14) checks a non-white pixel COUNT — blind to a colour change | `propagation/REPORT.md` §3, `critic/REPORT.md` |
| clipping-mode text (`7 Tr`) | **9 figures, not the 8 `strip-text.py` names** — CNX_Chem_18_04_Nanotube is new, same structure, its sendability unmeasured. Keeping graphics state does not touch the clip mechanism | `critic/tr7_shape.txt` |

## Corrections to `render/REPORT.md` (found by the critic, checked against the raw files)

- **C1:** its combustion description cites `[91,142,171]` vs `[102,102,103]` at a sampled pixel — neither number
  comes from this run. The run's own midpoint sample reads source = ORIG = PERSIST, because the bbox midpoint falls
  **between** two arrowheads. A test that samples the bbox midpoint passes on the broken code; sample inside an
  arrowhead component (largest: rows 150–177, cols 267–305, `render/logs/post_pass.log`).
- **C2/C3:** "ChnReact1 has the largest distance" and "IcePack is the largest region other than ChnReact1" are
  false: Egeom has the largest distance (258.7) and IcePack the largest region outright (`critic/render_claims.txt`).
- **C4:** several element descriptions are unreliable (OxyacTorch/IcePack show outlined "COLD" lettering); the
  numbers are right.

## Out of scope — logged, not built

- **The June-vintage published copies.** `books/efnafraedi-2e/media` holds 691 `_IS.svg`, only 34 from this
  pipeline. The rest came from a different tool (PyMuPDF redaction), and whether it loses graphics state the same
  way is unmeasured — the cheapest check is Egeom's committed copy against the source at the wedge.
- Nanotube's sendability; overprint lost by every renderer; ghostscript staging not being a neutral rewrite.

## Limits

- The census walks what `strip_text` walks — page 1 and every reachable `/Form` — not `/Pattern` resources,
  annotation appearances or soft-mask group streams.
- The `.eps` half describes the content **after** ghostscript staging, not the original EPS.
- The render compared `pdftocairo -png` output — the raster `compose.py` reads — not `artwork.svg`.
- The census's "a later paint depends on it" flag over-approximates (108 candidates, 34 real); renders decide.
