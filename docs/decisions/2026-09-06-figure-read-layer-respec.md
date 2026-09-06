# Decision: the figure-text READ layer is replaced with a ready-made MIT reader; the LAYOUT layer is kept

- **Date:** 2026-09-06
- **Status:** Accepted
- **Context owners:** [USER] + pipeline
- **Supersedes:** none
- **Related:** [`docs/superpowers/specs/2026-09-06-m5-figure-driver-design.md`](../superpowers/specs/2026-09-06-m5-figure-driver-design.md) · [`docs/superpowers/plans/2026-09-06-m5-figure-driver.md`](../superpowers/plans/2026-09-06-m5-figure-driver.md) · [`experiments/figure-text-translation/TEXT-COVERAGE.md`](../../experiments/figure-text-translation/TEXT-COVERAGE.md) · [`experiments/figure-text-translation/REGISTER.md`](../../experiments/figure-text-translation/REGISTER.md) · the campaign register's §C137/§C138

> **FROZEN EVIDENCE — banner-dated 2026-09-06.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

The figure-text pipeline extracts text from OpenStax artwork, sends it to MT, and re-lays it
out into a translated image. Its extraction stage was written by hand against **one** figure.
Two blind adversarial reviews of the driver plan built on top of it produced 24 confirmed
defects and 0 refutations, and **every blocking one was about what that extraction stage does
on real artwork rather than about the driver**.

The question: **is the right move to keep repairing the hand-written extractor, or to re-specify
what the read layer must do and adopt a ready-made one?** What was at stake is a one-off paid MT
cycle per book — money spent per figure — and, under the one-pass-edit ruling, an editor's only
sight of each module.

## Decision

**Replace the READ layer** — `extract.py` + `pdftext.py` + `strip-text.py`, ~239 lines — with a
ready-made PDF reader, evaluated MIT-first. **Keep the LAYOUT layer** — `figtext.py` +
`compose.py` + `svgout.py`, ~401 lines — untouched.

## Reasoning

### The code says it was never meant for this

`_deps.py`'s docstring: *"pikepdf / pycairo / Pillow are NOT repo dependencies — **this is an
experiment, not a pipeline tool.**"* It was built as an experiment, explicitly not as a pipeline
tool, and was then promoted by writing a plan around it — never by re-specifying it. **That, not
any individual bug, is the root cause**, and it explains why each review round found a fresh
defect of the same shape.

### The dev fixture was atypical on every axis that later bit

`CNX_Chem_01_01_SciMethod` — the figure the experiment was developed against — has page-level
text, blank runs only in *arc* blocks, no CID font, and is a `.pdf` in the base tree. Measured
across the corpus, each of those is the minority or near-minority case. **A single-figure
development fixture produced four independent unrepresentative assumptions**, and nothing ever
established a denominator for the tool.

### The failure is measured, not impressionistic

[`TEXT-COVERAGE.md`](../../experiments/figure-text-translation/TEXT-COVERAGE.md), producer
`text-coverage-census.py`, over **1,148** distinct `<image src>` basenames referenced by
chemistry's CNXML: of **895** resolved figures, **779** carry text and the extractor reads
**496**. **283 — 36.3% of text-bearing figures, 4,500 English words — are skipped**, and the
repair proposed earlier the same day would have made that skip *silent* rather than a crash.

### Its three open defects are all standard PDF features

Text inside `/Form` XObjects, CID/`Type0` fonts, and `/Encoding /Differences` are not exotic.
They are handled by every mature PDF text library. The plan as written proposed **implementing
`/Form` descent by hand**, i.e. reimplementing part of poppler. ▶ **A hand-written parser is the
wrong place to be spending review rounds when the capability is available off the shelf.**

### One figure is already outside every explanation we have

The census's `text-but-unexplained` bucket holds `CNX_Chem_20_01_recycle` — 103 words, neither a
`/Form` XObject nor `Type0`. **`/Form` XObjects were unknown on the morning of this decision.**
▶ **Naming mechanisms one at a time is losing to the corpus**, which is the strongest argument
for adopting a reader whose coverage is somebody else's maintained problem.

### The layout layer is genuinely different work, and it survived

Arc reassembly, wrap-then-shrink fitting, per-line font and colour, font subsetting. **No
off-the-shelf library provides any of it**, it was untouched by both reviews, and it is the half
that actually earns its custom code.

### The seam is narrow, which is what makes the swap small

`extract.py` writes exactly two files — `runs.json` (a flat list of runs carrying `text`, `font`,
`size`, `x`, `y`, `rot`, `adv`, `fill`) and `meta.json` (`source`, `fonts`, `page`) — and
everything downstream reads only those. **So the replacement is an adapter that produces the same
two files.** Verified against a candidate: six of the eight fields come back directly, `rot`
derives from the text matrix, and **`adv` is exact** (consecutive characters measured at a
0.0000 gap, so `x1 - x0` is the advance).

### MIT-first is a licence decision, not a technical one

This repository is public and its pre-publication audit's blocking finding was a licence
over-grant. The strongest candidate technically is AGPL-3.0; MIT candidates exist and a probe
showed one reading a `/Form`-XObject figure the current extractor reads as empty, returning
font, size, colour, position and the full text matrix. **MIT candidates are therefore evaluated
first, and the AGPL question is only reached if they fall short.**
⚠️ Noted while deciding: **`experiments/` appears in no licence table in the root `LICENSE`** —
neither MIT nor AGPL. That gap is real and is not resolved by this record.

## Consequences

- Commits the project to a **re-specified read layer with a written contract** — what it must
  produce (the eight run fields) and what it must handle (`/Form` XObjects, CID fonts,
  `/Differences`, `/Contents` arrays) — which never existed before.
- **Creates a free, two-sided acceptance test**: the new reader must reproduce the old reader's
  `runs.json` on the figures that already work *and* return non-empty runs on those it cannot
  read today. Regression control and positive control, both from the committed census.
- **Forecloses** hand-implementing `/Form` descent, CID decoding and `/Differences` in
  `pdftext.py`. Reversing costs the adapter's work; the census and the contract survive either way.
- **Adds a runtime dependency** to a component that had none by design. Vendoring into
  `pylibs/` is the established, gitignored pattern.
- **Does not discard the M5 driver work.** The architecture, spend rules, sidecar/publish/review
  analysis and every [USER] ruling are independent of which reader is used.
- Follow-up work, and whether any of it is next, blocked or done, is **the campaign register's** —
  → see CLAUDE.md § *One source of truth*.

## Alternatives considered

1. **Keep repairing the hand-written extractor (implement `/Form` descent as planned).** Rejected:
   it reimplements a solved problem, and the corpus already contains a figure outside every
   mechanism we have named — so the repair list has no established end.
2. **Replace the whole figure tool from first principles.** Rejected: it would discard the layout
   layer, which is the half that works, is genuine domain work, and is available from no library.
3. **Ship with the unreadable figures flagged and defer the reader entirely.** Rejected on the
   one-pass-edit ruling: roughly a third of each chapter's figure text would reach the editor in
   English during their only pass. Kept as the fallback if no candidate clears the census.
4. **Adopt the technically strongest reader regardless of licence.** Rejected as a *default*: the
   repo is public and has been burned by a licence over-grant. It remains available if MIT
   candidates fall short, as a deliberate ruling with a `LICENSE` update.
5. **Use poppler `pdftotext` as the parser.** Rejected: it returns words, not the per-line font,
   size, colour and rotation the composer requires. **It is retained as the independent oracle**,
   which is a different and now load-bearing role.
