# Experiment — translating text inside OpenStax figures

🔴 **THIS DIRECTORY IS ON THE DRIVER'S PATH AT BOTH ENDS — IT IS NOT UNREFERENCED SPIKE CODE.**
`tools/figure-run.js` spawns `figure-prepare.py`, `translate-blocks.mjs` and `figure-compose.py`
once per figure, and calls `publishFigureSvg` in-process for the last step;
`server/services/figureReviewService.js` requires `tools/lib/figure-enumerate.cjs`. Downstream of
that: `figure-prepare.py`'s summary integers are what `tools/lib/figure-classify.js` classifies on,
and `figure-compose.py`'s key-set comparison is a money gate. The single-figure commands below are
the manual/debug route and still work. **Status → [REGISTER.md](REGISTER.md).**

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

### The driven chain — what `tools/figure-run.js` runs, once per figure

```
figure-prepare.py <artwork> --basename <b> --out <dir>
        └─► <dir>/  <b>.pdf  runs.json  meta.json  blocks.json
                    artwork.{pdf,png,svg}  prepare.json
translate-blocks.mjs --book <slug> --out <dir>          ◄── the ONLY stage that spends money
        └─► <dir>/translations-api.json
  ── the driver writes the SIDECAR here, books/<slug>/figure-text/<b>.is.json, and it does so
     BEFORE composing, so a compose that fails cannot lose a translation already paid for ──
figure-compose.py --out <dir> --translations <sidecar>   ◄── reads the SIDECAR, not translations-api.json
        └─► <dir>/translated.svg  +  <dir>/compose.json   ◄── the verdict is the FILE
publishFigureSvg()          — called IN-PROCESS by the driver, not spawned
        └─► books/<slug>/media/<mapped name>
```

🔴 **A chapter-wide run MUST give every figure its own output directory, or each figure
translates from whichever was extracted last** — a correct-looking translation of the wrong
picture. Two mechanisms, deliberately: **`--out <dir>`** to the entry points above, and
**`FIGTEXT_OUT=<dir>` in the environment** to the underlying single-figure stages they spawn
(`figure-compose.py`'s own docstring says why the two differ). `_deps.py` binds `OUT` **by value
at import**, so `FIGTEXT_OUT` must be set in the parent *before* the child starts, and the
directory's parent must already exist.

⚠️ **Read each tool's usage from its own header docstring, not from here.** Neither node tool has
a `--help`: `--help` is in neither `figure-run.js`'s nor `translate-blocks.mjs`'s `KNOWN_FLAGS`, so
both print `Unknown argument: --help` and **exit 2** (verified by running them). The two Python
wrappers are argparse and do have one.

⚠️ **`figure-compose.py`'s exit code is not the verdict — `compose.json` is.** `compose.py` keeps
the English for any key it cannot match, says so only on stdout, and exits 0.

### The manual single-figure route — on the shared `out/`

Still the debugging route, and what `check.py` is for. It writes into `out/`, so it processes
one figure at a time.

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
| `readlayer.py` | 🔴 **the READ layer** — a pdfplumber/pdfminer adapter producing positioned runs; it descends into `/Form` XObjects and decodes `/Encoding /Differences` and `/ToUnicode`. **This is what `extract.py` calls.** Its interface contract is owned by `read_layer_accept.py`'s module docstring, not restated |
| `pdftext.py` | ⚠️ **the SUPERSEDED hand-written content-stream parser, not on the live path.** Kept as the **baseline arm** for `census.py`, `text-coverage-census.py`, the bake-off scripts and `read_layer_accept.py` — so a change here moves a baseline, never the reader |
| `figtext.py` | grouping into blocks/lines, alignment detection — pure geometry |
| `blockkey.py` | the ONE block-key derivation — what is bought, what keys the sidecar, what the editor sees. Four consumers import it; there is no second copy |
| `extract.py` | stage 1 — PDF → `runs.json` + font/page metadata (the CLI and on-disk seam over `readlayer.py`) |
| `strip-text.py` | stage 2 — remove `BT..ET`, drop Illustrator private data, render artwork |
| `compose.py` | stage 3 — lay text back; `--control` re-injects the English |
| `check.py` | stage 4 — diff against the published raster, write an overlay |
| `census.py` | survey a directory of figure PDFs: live text? substitutable font? prose vs verbatim? |
| `svgout.py` | emit SVG: vector artwork + real `<text>` + a woff2 **subset** of the figure's own font |
| `render-check.mjs` | rasterise a figure in Chromium **inside `<img>`** — the only rendering a reader ever sees |
| `sources.py` | resolve a figure basename to its authoritative source across the two edition trees |
| `test_sources.py` | tests that resolver, including a control that reverses the precedence |
| `emit-blocks.py` | the MT stage's input — `runs.json` → `out/blocks.json`, marking which blocks to send |
| `translate-blocks.mjs` | the **paid** MT stage — `out/blocks.json` → `out/translations-api.json`, one request per **distinct block key** (a repeated label is bought once; the multiplicity stays in `blocks.json`, per R-13) |
| `translations.json` | ⚠️ **placeholder probe text, NOT a translation** |
| `figure-prepare.py` | **driver entry point** — one artwork file → one `--out` directory, plus the summary integers `tools/lib/figure-classify.js` classifies on. A wrapper because `emit-blocks.py` has no `__main__` guard and spawns `extract.py` by a relative path |
| `figure-compose.py` | **driver entry point** — composes from a `--translations` sidecar and writes `compose.json`, a verdict comparing key **multisets**. Exists because `compose.py` keeps the English for an unmatched key and still exits 0 |
| `make_fixture.py` | regenerates `fixtures/fixture_figure.pdf`, the read-layer positive control. Imports nothing from this tree on purpose, so the fixture cannot drift with the code it tests |
| `read_layer_accept.py` | the acceptance harness that **judges** a read layer (baseline vs candidate, three-valued outcome) and owns the read-layer interface contract. It ships no reader |
| `text-coverage-census.py` | five-way census over one stated population — every `<image src>` basename a book's CNXML references, resolved through `sources.py`. `extract.py`'s view vs poppler's; a disagreement is the finding |

## Running it

`pdfplumber`, `pikepdf`, `pycairo` and `Pillow` are **not** repo dependencies — this is an
experiment. Install them wherever you like and point `FIGTEXT_PYLIBS` at it:

```bash
cd experiments/figure-text-translation
python3 -m pip install --target=./pylibs pdfplumber pikepdf pycairo pillow fonttools brotli
export FIGTEXT_PYLIBS=./pylibs
PDF=~/dev/repos/CNX_Chem_01_01_SciMethod.pdf

python3 extract.py     "$PDF"
python3 strip-text.py  "$PDF" --svg   # --svg also writes out/artwork.svg, which compose.py --svg READS
python3 compose.py --control --svg    # re-inject the English -> out/control.png + out/control.svg
python3 check.py ../../books/efnafraedi-2e/01-source/media/CNX_Chem_01_01_SciMethod.jpg --control
python3 compose.py               # then the Icelandic
python3 compose.py --svg         # SVG output (the settled format - REGISTER.md item 5)
node render-check.mjs out/control.svg out/browser.png   # render it as a reader would
```

⚠️ **`pdfplumber` is the one it is easy to leave out** — `pylibs/` already happens to contain it,
so everything works here without it ever being declared, and on a clean box `extract.py` dies at
`readlayer.py`'s `import pdfplumber` on the *first* command above. It brings `pdfminer.six`,
`pypdfium2` and the crypto stack with it. ⚠️ **No CI workflow runs any of this Python**, so a
broken install line goes red on a human's machine and nowhere else.

`pdftocairo` (poppler-utils) must be on `PATH`.

### The MT stage — it costs money, and `--book` is not optional

```bash
node translate-blocks.mjs --book efnafraedi-2e --dry-run   # blocks, chars, ISK, glossary line
node translate-blocks.mjs --book efnafraedi-2e             # then spend — into the shared out/
```

⚠️ **`--out <dir>` is optional here and mandatory under a driver.** Without it this stage reads
and writes the shared `out/`, which is fine for one figure and wrong for a chapter — see
*The driven chain* above.

```bash
node translate-blocks.mjs --book efnafraedi-2e --out /tmp/fig-042
```

🔴 **THE FIGURE MT LEG SENDS NO GLOSSARY — by default, and by [USER] ruling 2026-09-06 (§C133).**
A pre-flight invariant builds every block's wire options *before* the first paid request and
refuses the whole run (`glossary-on-the-figure-wire`, exit 2) if any of them carries one. It is an
inversion rather than a deletion, so the leg is never silently ungated. `--no-glossary` is accepted
as a **no-op**, kept only so callers that still pass it are not rejected as typos.

⚠️ **`--book` is still REQUIRED, and it selects nothing.** It names the run in `api-run.json` —
provenance — and keeping it mandatory keeps a driver's per-figure spawn self-describing.

⚠️ **The invariant proves the *absence* of a glossary; it says nothing about quality.** Figure text
is labels and captions — short, fragmentary, often a single noun — which is where a flat
context-free map does its worst work. Consistency with the body text is the editor terminology
assistant's job (`docs/plans/2026-09-06-editor-terminology-assistant.md`), not this leg's.
▶ **Do not re-derive the gate this replaced** ("send the glossary, or refuse"): REGISTER.md
measured it UNSATISFIABLE — 11 of 14 blocks would carry one, so a refuse-if-any rule refuses every
ordinary run. The account is in § *⚖️ [USER] RULINGS 2026-09-06* ② there.

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
| `unsafe-output-name` | the `image-mapping.json` entry names an `outputName` that escapes `media/`. A published figure is a flat file in the book's `media/`; nothing may be written outside it |
| `sidecar-moved` | ⚠️ **not reachable from this CLI.** The vintage check is opt-in and the CLI deliberately passes no `expectedRenderHash`, because a human running the composer by hand leaves this process no way to know which blocks it was given. `figure-run.js`, which composes and publishes in one breath, is what asks |

⚠️ **`--svg` and `--meta` also exist** and both default into this directory's shared `out/`. Pass
them when the figure was composed somewhere else — a driver's per-figure `--out` directory, say.
Read the usage line in `publish-figure-svg.js`'s own CLI block; there is no `--help`.

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

Chapter 1 measured: **31 of 36 automatable**, 4 photographs with no text, and 1 whose
Type0/CID font the **then-current** parser could not read. ⚠️ **That last bucket is
baseline-vintage: the shipped read layer decodes `/Type0` through `/ToUnicode`** — see
[READ-LAYER-ACCEPTANCE.md](READ-LAYER-ACCEPTANCE.md) § C1b for the measurement. `census.py`
still reads through `pdftext.py` on purpose, so **its verdicts describe the OLD reader** and
are never evidence about the new one ([TEXT-COVERAGE.md](TEXT-COVERAGE.md) says so in its own
banner). All Liberation fonts — nothing proprietary.
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
