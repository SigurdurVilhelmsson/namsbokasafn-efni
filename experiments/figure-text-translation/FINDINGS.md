# FINDINGS — translating text inside OpenStax figures

Experiment conclusion, **2026-09-02**. How to run it: [README.md](README.md).
Frozen images: [`evidence/`](evidence/).

Measured against `CNX_Chem_01_01_SciMethod.pdf` — **the only figure PDF available at
the time**, so every rate below has a denominator of one figure. All numbers were
produced by execution, not inspection.

## Verdict
**Feasible, and proven end to end on this figure.** A working prototype extracts
18 text runs → 14 translatable blocks, strips the English, re-renders the artwork,
and re-injects Icelandic including four labels set on curved paths.

## What the PDF actually is
| fact | value | why it matters |
|---|---|---|
| text | live `Tj` operators, not outlines | extractable; no OCR |
| fonts | `LiberationSans` / `-Bold`, **subset** (FirstChar 32 / LastChar 121) | subset has no Icelandic glyphs — but Liberation is OFL and installed **with full Icelandic coverage** (verified via TTF cmap) |
| encoding | WinAnsi | every Icelandic letter is already in Latin-1; encoding needs no change |
| page | 468 × 275.642 pt | |
| published raster | `01-source/media/CNX_Chem_01_01_SciMethod.jpg`, 1300 × 766 | **exactly 200 DPI of this PDF** — pixel-exact. The join key is the basename. |
| file composition | 583 KB, of which ~530 KB is embedded Adobe Illustrator private data | artwork-only rebuild = **22.8 KB (−96%)** |

**The jpg carries no layout the PDF lacks.** Re-rendering the artwork from the PDF and
comparing against the published raster, with every text run's bounding box masked out:
**67 of 813 652 artwork-only pixels differ (0.008%)**, mean |diff| 1.41. So there is no
reason to composite onto the jpg — and stripping text *in the PDF*, where it is a
separate object that simply is not drawn, avoids erasing baked-in pixels from a raster.

## Text structure (parsed, not regexed)
- 79 `Tj` runs across 47 distinct text matrices.
- 27 runs share one horizontal matrix (the box labels).
- **44 runs are single glyphs on their own matrix** — text on circular arcs.
- Grouping recovers **14 semantic blocks**, incl. reassembling
  `Next ...`, `prediction`, `not consistent with`, `Results` from 44 glyph placements.
- Circle fits for the four arcs land on **concentric rings sharing a centre (95,121)**
  at r = 40.2 / 47.7 / 59.0 / 68.8 pt — independent evidence the fit is right.

## The control is the whole story
Re-injecting the **original English** through the same machinery and diffing against
the untouched OpenStax raster exposed three real defects that the Icelandic output
alone could never have shown:
1. **Alignment was assumed, not detected.** Two blocks are left-aligned, not centred.
2. **A block was split at a colour change.** `Further testing / does not support /
   hypothesis` is one sentence in three lines with the middle one red — it must be
   one MT unit, not three.
3. **Font is per line, not per block.** The red emphasis line is bold; measuring it
   with the block's first font misplaced it.
Plus a −0.0002 pt float epsilon that broke a kerning-split seam (`does not suppo`+`r`+`t`).

⚠️ **The pixel count did not find any of these.** It moved 3.00% → 2.70% across all
four fixes, because antialiasing noise between two rasterisers swamps layout error.
**The difference *map* found them; the scalar hid them.**

After the fixes, 10 of 14 blocks round-trip to near-pixel registration. The 4 arc
blocks still drift — circle-fit re-placement is **approximate, with a systematic
bias** (the span is centred on `(angs[0]+angs[-1])/2`, but `angs[-1]` is the last
glyph's *origin*, so the reconstructed span is short by about half a glyph).
Visibly acceptable for new text; **not registration-exact**. Not fixed — arc-solver
work should wait until the real PDF set says how common arc text is.

## EPS inputs work too — after three producer-portability fixes

OpenStax supplied **PDF for most figures and EPS for the rest**. EPS is the same
PostScript family, so `gs -sDEVICE=pdfwrite -dEPSCrop` converts it and the identical
pipeline applies. Verified on a **synthesised** EPS (`pdftops -eps` of this figure,
then back through ghostscript) — not on a real OpenStax EPS, which nobody has yet.

**Result: 14 blocks from the EPS-derived PDF, and the translation keys are byte-identical
to the native PDF's.** One `translations.json` serves both inputs. Output is visually
indistinguishable ([`evidence/08-icelandic-from-synthesised-eps.png`](evidence/08-icelandic-from-synthesised-eps.png)).

🔴 **But it only works because the round-trip exposed three real defects, and all three
produce plausible-looking garbage rather than an error.** They are producer differences,
not EPS differences — a differently-exported PDF would hit them too:

| defect | Illustrator | Ghostscript | symptom |
|---|---|---|---|
| **graphics CTM ignored** | folds rotation + size into `Tm`, leaves CTM identity | leaves `Tm` identity, puts rotation in `cm` | every run reports **rot = 0** at the wrong place → 72 blocks instead of 14 |
| **`TJ` kerning ignored** | never emits `TJ` | emits kerned arrays routinely | advance drifts, so grouping seams break |
| **`'` / `"` implicit line move** | never emits them | `(constant)'` for each new line | **every line of a block lands on one baseline** |

▶ **The tell was that nothing errored.** The EPS run reported 77 runs and produced a
picture; only comparing its *block keys* against the native PDF's showed it was wrong.
**Test a second producer before trusting a content-stream parser** — the first producer
teaches you its dialect, not the format.

⚠️ **The regression control is what made the fixes safe**: the native PDF stayed at
79 runs / 14 blocks / 2.70 % through all three changes, unchanged.

## ⚠️ The parser's validated vocabulary
`pdftext.py` now handles: `BT ET Tj TJ ' " Tm Td TD T* TL Tc Tw Tf k q Q cm`,
validated against **two producers** (Adobe Illustrator CS6 and Ghostscript 10).
Remaining known gaps:
- **Type0/CID fonts are not handled** — both test files are simple `TrueType`+WinAnsi.
  A CID-keyed figure will mis-read every character code.
- `Tz` (horizontal scaling) and `Ts` (rise) are ignored.
- Only page 1 is read.
- The composer assumes the figure's font is available as a system family
  (`Liberation Sans` here). A **proprietary** subset font cannot be substituted at all —
  those figures are manual regardless.

▶ **First step over the real PDF set is an operator + font census.** Grouping is
trusted only for files whose operators are inside this set. A control is only a
control for the shapes its population contains.

## Chapter 1 census — 36 real figures, measured

Source: `Images Chemistry2e/Chapter 1/Source_File` (33 PDF + 3 EPS). Raw data:
[`evidence/census-chapter01.json`](evidence/census-chapter01.json). Re-run with
`census.py`.

| verdict | figures |
|---|---|
| **AUTOMATABLE** | **31** |
| NO LIVE TEXT (photographs) | 4 |
| PARSER GAP — Type0/CID font | 1 |

**Every figure in the chapter uses Liberation fonts.** Not one proprietary face, so the
font-substitution route covers the whole chapter — this was the single biggest unknown
and it came back clean.

**Blocks are not all translatable, and the split is the headline:**

| | count |
|---|---|
| blocks total | 811 |
| — **prose, i.e. actually goes to the MT** | **285** |
| — verbatim: formulas, numbers, unit symbols | 526 |
| **words in prose blocks** | **639** |

▶ **Two thirds of the text in these figures must never reach the MT.** `H2O(g)`, `25`,
`mL`, `212 °F`, `Si`, `28.09` are identical in Icelandic and translating them corrupts
chemistry. The census reports the split so a chapter can be costed honestly; the
classifier (`figtext.looks_verbatim`) is a **triage aid, not an authority**.
⚠️ Element **names** are prose and do need translating — `hydrogen` → *vetni* — while
element **symbols** do not. `CNX_Chem_01_03_PeriodicPU` alone is 137 prose / 386
verbatim blocks, and the prior triage described it only as "tilted labels".

### Cross-check against the prior triage report

A `_triage_report.md` shipped with the images. **34 of 36 agree.** The two
disagreements run in opposite directions, which is the useful part:

| figure | prior triage | this census | who is right |
|---|---|---|---|
| `SciMethod` | ⚑ MANUAL — *"nested curves — Canva; curved: 'hitwtnn','s','oe','N','lt','itt'"* | AUTOMATABLE, 14 blocks | **census** — those scrambled fragments are the per-glyph arc placements; circle-fitting reassembles them, and the composed figure exists |
| `decomp` | ENGINE, 3 text lines | PARSER GAP (Type0/CID) | **triage** — `pdftotext` reads it fine. The file is not the problem; **this parser** lacks CMap support |

▶ **A relayed triage is a hypothesis.** One entry was pessimistic because the tool that
wrote it could not reassemble arc text; one was optimistic because it never checked the
font subtype. Neither error is visible without re-measuring.

## Defects this corpus exposed (all silent, all found by cross-checking)

Running 36 real figures instead of one found five more defects. **None raised an
error** — each produced a plausible number or a plausible picture:

| defect | symptom | how it was caught |
|---|---|---|
| `/Contents` may be an **array of streams** | **10 of 36 figures reported "unreadable"** — an absence I manufactured | they were all fine in `pdftotext` |
| **inline images** (`BI…ID…EI`) walked as text | `CylGold` reported **373 words**; the figure has 26 | word count vs `pdftotext`, per figure |
| **sub/superscripts split** | `H2O(g)` became 5 separate "translatable" blocks | same word-count cross-check |
| **WinAnsi 0x80–0x9F read as Latin-1** | `“Final” volume` → `\x93Final\x94`; `–40 °F` → `\x9640 °F` | reading the block text, not counting it |
| missing translation **blanked** the text | a formula with no entry would vanish from the figure | reasoning about the verbatim class |

⚠️ **The pixel-level regression control held at 79 runs / 14 blocks / 2.70 % through
every one of these fixes**, which is what made them safe to make.

## Tooling trap hit while writing this up (worth carrying)

**An `Edit` whose `old_string` matches only PART of a line silently relocates the rest
of that line.** Inserting a pointer into `docs/plans/…campaign.md`, the `old_string`
stopped at *"…predates the 2026-07-26 audit."* while the real line continued for another
415 characters. Those 415 characters — a parenthetical about heading drift — were
carried to the end of the INSERTED blockquote, where they read as part of a paragraph
about a different subject entirely.

▶ **It was found by asserting the edit was a PURE INSERTION, not by reading the diff.**
`git diff` showed a `-`/`+` pair whose visible prefixes were identical, and `cut -c1-200`
hid the divergence. The check that caught it:

```
removed lines that do NOT reappear identically in the added set  ->  must be 0
```

⚠️ This repo has many 1,000+ character lines, so the visible part of a diff is routinely
not the changed part. **For a documentation insert, assert 0 lines lost rather than
eyeballing it.**

## Corpus scale beyond chapter 1 (heuristic — SUPERSEDED where real sources exist)
⚠️ **This was a stopgap made before any figure PDFs were available, and the chapter-1
census above replaces it for chapter 1. Use it only to size chapters whose sources have
not arrived.** It classifies the published *rasters*, so it can only guess.
Classifier: ≥45% near-white pixels AND <20 000 distinct colours on a 300 px thumbnail.
Controls: 4/4 known text-bearing diagrams classified line-art; 3/3 known photographs
classified photo.
- chemistry: **1 120 of 1 529 jpg (73.3%)** line-art-like; 409 photo-like.
- organic: 5 257 jpg, but dominated by chemical-structure images carrying only element
  symbols, which must **not** be translated. Not yet classified.
This bounds the opportunity; it does not measure how many carry translatable text.

## Not in the spike (real design work, not defects)
- **Auto-wrap.** Málstaður returns one string per block; the composer must split it
  into lines that fit. The spike was handed pre-split lines.
- **MT unit + context.** Send block-joined text with the figure's `alt`/caption as
  context. 1–3 word fragments (`spá`, `Næst ...`) are exactly where §C73/§C116
  measured the worst glossary and model behaviour.
- **Language choice.** Python (pikepdf + cairo) was used here; `tools/` is Node ESM.
- **Provenance.** The PDFs must not land in `01-source/media/` (READ-ONLY, G4 closed
  write set). New tree; record receipt date and terms in the provenance doc.

## Files
See [README.md](README.md) for the stage-by-stage map and how to run them.
`pdftext.py` · `figtext.py` · `extract.py` · `strip-text.py` · `compose.py` · `check.py`

⚠️ `translations.json` holds **placeholder probe text, not a translation**. It was
written by hand to exercise Icelandic glyph coverage and the layout maths. Real text
comes from Málstaður and human review.
