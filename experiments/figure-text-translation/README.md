# Experiment — translating text inside OpenStax figures

**Status: feasibility spike, complete. Not a pipeline tool, not wired to anything.**

| what | where |
|---|---|
| **open work, decisions, defects** | **[REGISTER.md](REGISTER.md)** — the ONE owner of this track's status |
| conclusions and measurements | [FINDINGS.md](FINDINGS.md) — frozen evidence |
| how to run it | this file |
| settings the code reads | [figure-text.config.json](figure-text.config.json) |
| machine-specific source paths | `sources.local.json` (gitignored; copy the `.example`) |

Nothing here carries a status verb except REGISTER.md. The campaign register in
`docs/plans/` points here and never restates.

OpenStax supplied figure **PDFs** for artwork whose published form in this repo is a
flattened `.jpg`. This experiment asks whether the text inside those figures can be
extracted, translated and re-injected mechanically, instead of an editor rebuilding
each image by hand.

**Answer: yes.** Proven end to end on `CNX_Chem_01_01_SciMethod.pdf` — 79 positioned
text runs → 14 translatable blocks, including reassembling four labels set on circular
arcs out of 44 individual glyph placements.

## Why the PDF and not the jpg

The published `books/efnafraedi-2e/01-source/media/CNX_Chem_01_01_SciMethod.jpg` is a
**200 dpi render of this exact PDF, pixel-exact at 1300 × 766**. So the PDF is not a
reference *for* the figure — it is the figure's source, and it carries the artwork,
the text, and the text's exact placement.

Measured: re-rendering the artwork from the PDF reproduces the published raster to
**0.008 % of artwork-only pixels** (67 of 813 652). The jpg holds no layout the PDF
lacks, and stripping text *in the PDF* — where it is a separate object that simply is
not drawn — avoids having to erase baked-in pixels from a raster.

The jpg's real job here is different and important: **it is the oracle**. See below.

## Two source trees — get the edition right

The OpenStax delivery is **two trees**: every 1st-edition image, and a second tree
holding **only** the images updated or added for the 2nd edition. A figure present in
the updates tree must be taken from there.

▶ **Sourcing a superseded illustration is invisible in the output** — it is a
correct-looking Icelandic translation of the wrong picture, and no check downstream can
see it. So the precedence is code with a test (`sources.py`, `test_sources.py`), not a
note. Configure the paths once:

```bash
cp sources.local.json.example sources.local.json   # gitignored; edit in your paths
python3 sources.py efnafraedi-2e CNX_Chem_01_01_SciMethod
```

`figure-text.config.json` holds `editionPrecedence`. It does **not** hold the filename
suffix — that is owned by `tools/generate-image-mapping.js` (`DEFAULT_SUFFIX`).

## Where the translated file goes

Nowhere in this directory. The repo already has the mechanism, and it predates this
experiment: put `<basename>_IS.<ext>` in `books/<slug>/media/`, run
`node tools/generate-image-mapping.js --book <slug>`, then re-inject and re-render.
`01-source/` is never touched and no `src` is hand-edited. See CLAUDE.md
§ *A translated figure is a file in `books/<slug>/media/`*.

## EPS inputs

OpenStax supplied PDF for most figures and **EPS for the rest**. Convert first — the
rest of the pipeline is identical, and the translation keys come out the same:

```bash
gs -q -dNOPAUSE -dBATCH -dSAFER -sDEVICE=pdfwrite -dEPSCrop \
   -sOutputFile=figure.pdf figure.eps
```

Verified on a synthesised EPS only (no real OpenStax EPS was available). Making it work
required three parser fixes for producer differences — see FINDINGS.md; all three failed
**silently**, producing a plausible picture rather than an error.

## The pipeline

```
figure.pdf ──extract.py──►  out/runs.json     positioned text runs
           ──strip-text.py─►  out/artwork.png   artwork with the text removed
translations.json ─┐
                   ├compose.py──► out/translated.png
out/runs.json ─────┘         └──► out/control.png   (--control: re-injects the ENGLISH)
                                          │
published.jpg ──check.py──────────────────┴──► out/overlay.png
```

| file | role |
|---|---|
| `pdftext.py` | content stream → positioned runs (PDF text-matrix state machine) |
| `figtext.py` | grouping into blocks/lines, alignment detection — pure geometry |
| `extract.py` | stage 1 — PDF → `runs.json` + font/page metadata |
| `strip-text.py` | stage 2 — remove `BT..ET`, drop Illustrator private data, render artwork |
| `compose.py` | stage 3 — lay text back; `--control` re-injects the English |
| `check.py` | stage 4 — diff against the published raster, write an overlay |
| `census.py` | survey a directory of figure PDFs: live text? substitutable font? prose vs verbatim? |
| `svgout.py` | emit SVG: vector artwork + real `<text>` + a woff2 **subset** of the figure's own font |
| `render-check.mjs` | rasterise a figure in Chromium **inside `<img>`** — the only rendering a reader ever sees |
| `sources.py` | resolve a figure basename to its authoritative source across the two edition trees |
| `test_sources.py` | tests that resolver, including a control that reverses the precedence |
| `emit-blocks.py` | the MT stage's input — `runs.json` → `out/blocks.json`, marking which blocks to send |
| `translate-blocks.mjs` | the **paid** MT stage — `out/blocks.json` → `out/translations-api.json`, one request per block |
| `translations.json` | ⚠️ **placeholder probe text, NOT a translation** |

## Running it

`pikepdf`, `pycairo` and `Pillow` are **not** repo dependencies — this is an
experiment. Install them wherever you like and point `FIGTEXT_PYLIBS` at it:

```bash
cd experiments/figure-text-translation
python3 -m pip install --target=./pylibs pikepdf pycairo pillow fonttools brotli
export FIGTEXT_PYLIBS=./pylibs
PDF=~/dev/repos/CNX_Chem_01_01_SciMethod.pdf

python3 extract.py     "$PDF"
python3 strip-text.py  "$PDF"
python3 compose.py --control     # re-inject the English
python3 check.py ../../books/efnafraedi-2e/01-source/media/CNX_Chem_01_01_SciMethod.jpg --control
python3 compose.py               # then the Icelandic
python3 compose.py --svg         # SVG output (the settled format - REGISTER.md item 5)
node render-check.mjs out/control.svg out/browser.png   # render it as a reader would
```

`pdftocairo` (poppler-utils) must be on `PATH`.

### The MT stage — it costs money, and `--book` is not optional

```bash
node translate-blocks.mjs --book efnafraedi-2e --dry-run   # blocks, chars, ISK, glossary line
node translate-blocks.mjs --book efnafraedi-2e             # then spend
```

🔴 **A run that cannot load a glossary REFUSES with exit 2.** This leg used to send
`glossary: null` unconditionally, so a [USER] terminology ruling reached prose and never
reached figures. `--no-glossary` is the separate acknowledgement for a deliberately bare
run — the §C73 control, which is how item ⑯ was measured.

⚠️ **The gate is necessary, not sufficient.** It proves a glossary rode the wire; it cannot
prove that glossary carries any given ruling. That is a data state, and REGISTER.md carries
the checkable predicate for it.

⚠️ **Always `--dry-run` first.** It prints the cost estimate *and* the glossary status line,
so the decision to spend is made while looking at what would actually ride the wire.

### Composing a figure that has a committed sidecar, and publishing it

`compose.py --translations <path>` accepts a book's **committed sidecar**
(`books/<slug>/figure-text/<basename>.is.json`) directly — it reads `.blocks`, so a sidecar and a
bare `translations.json` are both valid input.

```bash
SIDE=../../books/efnafraedi-2e/figure-text/CNX_Chem_01_06_TempScales.is.json
python3 compose.py --svg --translations "$SIDE"          # -> out/translated.svg
node ../../tools/publish-figure-svg.js --sidecar "$SIDE" # -> books/.../media/<mapped name>
```

**The composer stops at `out/`.** Publishing is the second command, and it is JS on purpose:
the translated filename comes from `image-mapping.json` (so `DEFAULT_SUFFIX` is never restated)
and `composedHash` is stamped there, beside `computeRenderHash`. **Nothing in this Python tree
hashes anything** — pinned by `tools/__tests__/figure-text-sidecar.test.js`.

The publisher **refuses** rather than guessing, and writes nothing when it refuses:

| refusal | meaning |
|---|---|
| `basename-mismatch` | `out/` holds a different figure than the sidecar names — re-run `extract.py`/`compose.py`, or point `--sidecar` elsewhere. **This is the guard that matters:** it stops figure A's artwork being published under figure B's translations. |
| `unmapped` | no `image-mapping.json` entry — run `generate-image-mapping.js` first |
| `no-svg` | `compose.py --svg` has not been run |
| `bad-sidecar-path` / `no-sidecar` | the path is not a `books/<slug>/figure-text/*.is.json`, or the file is malformed |

⚠️ **Publishing REPLACES a reader-visible file, and that is intended.** The figures already in
`books/<slug>/media/` came from a June test run that had no editorial surface and shipped as MT
preview; replacing them with output an editor can review is the point. They are all git-tracked,
so `git checkout -- books/<slug>/media/` is the restore — the tool writes no `.bak`.

⚠️ A sidecar nobody has approved has no `renderHash`, so nothing is stamped and the renderer
badges the figure `mt-preview`. That is the ordinary case: publish the MT, review it afterwards.

Python tests here are plain scripts, **not** run by `npm test` or CI (both are node-only):

```bash
python3 test_figtext_normalise.py
```

⚠️ **The oracle must be the 200 dpi jpg** — the one in `books/*/01-source/media/`.
OpenStax also ship a 72 dpi version of every figure; that is a different asset and
`check.py` will refuse it on a size mismatch. Nothing in this pipeline needs it.

## Census first, always

```bash
python3 census.py <dir-of-pdfs> --json census.json
```

Chapter 1 measured: **31 of 36 automatable**, 4 photographs with no text, 1 blocked by
a Type0/CID font this parser cannot read. All Liberation fonts — nothing proprietary.
Of 811 text blocks only **285 are prose**; the other 526 are formulas, numbers and unit
symbols that **must never be sent to the MT**. See FINDINGS.md.

## ⚠️ Read the overlay, never the percentage

`check.py --control` is the whole method. Re-injecting the figure's **own English**
makes the published jpg a true oracle: any disagreement is our defect.

It found four real defects that the translated output could never have shown, because
with different text you cannot tell misplacement from "that is how it lays out".
**The scalar hid every one of them** — fixing all four moved the pixel count
3.00 % → 2.70 %, because antialiasing between two rasterisers swamps layout error,
while the overlay changed completely. Compare
[`evidence/02-control-before-after-fixes.png`](evidence/02-control-before-after-fixes.png).

## evidence/

Frozen record of what was measured, committed on purpose. Everything under `out/` is
generated and gitignored.

- `01`, `04`, and the top half of `02` were produced by the **naive first
  implementation** and cannot be regenerated by the current scripts. That is the
  point — they are the before-picture.
- `08` came from a **synthesised** EPS (`pdftops -eps` of this figure, round-tripped
  through ghostscript), **not** a real OpenStax EPS. Do not cite it as proof that
  OpenStax's own EPS files work.

## Licence and attribution

`CNX_Chem_01_01_SciMethod` is from **OpenStax Chemistry 2e**, held here under
**CC BY 4.0** (`books/efnafraedi-2e/book-config.json`, obtained 2026-01-19 — see
[docs/provenance/openstax-cnxml-licence-provenance.md](../../docs/provenance/openstax-cnxml-licence-provenance.md)).
The images in `evidence/` are derivatives of that figure and carry the same licence
and attribution requirement. The scripts are MIT, like the rest of `tools/`.

⚠️ **The source PDFs must not be placed in `books/*/01-source/`** — that tree is
READ-ONLY and sits inside the source-refresh policy's closed write set. When the full
set arrives it needs its own tree and a provenance record of receipt date and terms.
