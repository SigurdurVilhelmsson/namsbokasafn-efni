# `fixture_figure.pdf` — the read-layer positive control

**Regenerate with `python3 ../make_fixture.py`. Verify with
`FIGTEXT_PYLIBS=../pylibs python3 ../test_make_fixture.py` (run it from the parent
directory). Do not hand-edit the PDF.**

## What it is for

Every other test in this experiment reads **real OpenStax artwork** out of the
machine-local trees named by the gitignored `sources.local.json`. That is correct for the
fidelity questions — a synthetic figure cannot tell you what OpenStax actually ships — but
it makes two things impossible:

* a **"does the whole chain run end to end?"** test on a box that has no artwork, and
* a test whose expected numbers are **stable and small enough to state**.

So this one file exists: a ~1.5 kB synthetic figure with a known, deliberately chosen
shape. The precedent is ruling **R-7** (see `test_readlayer.py` case 14), which kept the
`(cid:` detector pinned against a synthetic fixture once the real corpus stopped
exercising it.

It is **not** evidence about the corpus. Any claim of the form *"the pipeline handles X"*
still has to be measured on real artwork.

## Measured properties — re-derived by `test_make_fixture.py`, not copied from a plan

| property | value |
|---|---|
| blocks (`figtext.merge_blocks(figtext.group(runs))`) | **4** |
| sendable (`figtext.sendable`) | **3** |
| held back | **1** — `H2O (g)` |
| fonts in `meta['fonts']` | 1 — `PAGE/F1` |
| `is_subset` fires on | all 1 of them |
| `unscoped_fonts` / `fonts_unexercised` / `adv_repaired` / `color_warnings` | `{}` / `0` / `{}` / `0` |
| `read()` outcome | `reads` |
| size | 1,470 bytes |

The plan that asked for this fixture wrote `blocks == 4, sendable == 3` **before any such
file existed** — those were design targets. The fixture was iterated until it hit them;
the assertions were not relaxed to match a first draft. The first draft, lifted from
`test_readlayer.py`'s `synth()`, measured **2 blocks / 2 sendable with no subset signal at
all**.

## What each piece exercises — do not "tidy" any of it away

* **Four text blocks, and the fourth is `H2O (g)`.** `figtext.looks_verbatim` holds any
  block with no run of 3+ letters, so this one is never bought. **It is the only reason
  `sendable != blocks`**, which is what lets a downstream positive control distinguish a
  working spend gate from one that sends everything. Delete it and the assertion
  `sendable == 3` becomes unfalsifiable in the direction that matters.
* **40 pt between baselines, at 12 pt type.** `figtext.group`'s `nl` test and
  `figtext.merge_blocks` both join lines whose baselines differ by `size * 1.222`
  (14.66 pt here) ± 2.0. Anything in 12.7–16.7 pt silently merges the four blocks into
  one — `test_make_fixture.py` case 7 proves it by regenerating at 14 pt and watching the
  count collapse to 1. That case is the control that stops "4 blocks" from being
  indistinguishable from a grouping stage that returns whatever it is handed.
* **A `/FontDescriptor`.** Measured while building this: pdfminer takes
  `char['fontname']` from `/FontDescriptor/FontName` and falls back to the literal string
  `'unknown'` — **not** to `/BaseFont`. Without the descriptor every run resolves through
  `readlayer.resolve_font`'s `UNSCOPED/` fallback, the branch that exists so a malformed
  file cannot silently break the `runs.json` ↔ `meta.json` join. **The block count is 4
  either way**, so nothing but an explicit `unscoped_fonts == {}` assertion can see it.
* **`/BaseFont /ABCDEF+Helvetica` with `/FirstChar 32 /LastChar 122`.** Both of the subset
  signals `extract.is_subset` knows about, at once, because that is how real chemistry
  artwork carries them (measured: `/LWCEUZ+LiberationSans-Bold`, `last=121`). `is_subset`
  reads the **dictionary only**, so no embedded font program is needed and the fixture
  stays tiny. A subset name with no `/FontFile` is unusual in the wild; it is deliberate
  here, and it is the dictionary that is under test.
* **`/Widths`.** Load-bearing. pdfminer looks `/BaseFont` up in its built-in metrics
  database **without stripping the subset prefix**, so `ABCDEF+Helvetica` misses and the
  advances come from `/Widths` alone. `char['adv']` is what `readlayer._continues` and
  `figtext.group` decide run and block boundaries with, so wrong widths change the block
  count.
* **A filled rectangle and a stroked rule.** Vector paint operations, so the fixture has a
  non-zero paint-op count and something for `pdftocairo` to draw. A text-only PDF renders
  as a blank page once the text is stripped, which makes the composition side untestable
  against it.

## Determinism

`make_fixture.py` saves with `deterministic_id=True`, so qpdf derives `/ID` from the
file's own content rather than the clock, and nothing writes a `/Info` date. Regenerating
must be **byte-identical**; case 6 asserts exactly that.

Case 6b is the second tier: it re-measures the regenerated file. If a future
pikepdf/qpdf changes the serialisation, 6 goes red and 6b stays green — which says *"the
bytes moved, the fixture still works"* rather than leaving the two indistinguishable.

The `WIDTHS` table is a literal in `make_fixture.py` on purpose. Deriving it from
pdfminer at generation time would make the committed bytes depend on the installed
pdfminer version.
