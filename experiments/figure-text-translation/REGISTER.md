# REGISTER — figure-text translation

**This file is the ONE owner of figure-text-translation status.** Per
[CLAUDE.md § One source of truth](../../CLAUDE.md), no other document carries a status
verb for this work: the campaign register in `docs/plans/` points here and never
restates. Design evidence lives in [FINDINGS.md](FINDINGS.md), frozen; how to run
things lives in [README.md](README.md).

---

## ⏩ RESUME — state as of 2026-09-02

**What exists:** a working extract → strip → compose → oracle-check pipeline, proven on
`CNX_Chem_01_01_SciMethod.pdf` end to end, and a census of all 36 chapter-1 figures.
**Nothing is wired into the publication pipeline and nothing has been bought from the MT.**
All Icelandic produced so far is **placeholder probe text**, not a translation.

**Next action:** decide the output format (item ① below), then run one real figure's prose
through Málstaður.

---

## Settled

- **① Figure text is THREE classes, not two.** TRANSLATE (prose) · **LOCALIZE**
  (numbers — Icelandic uses a decimal **comma**) · VERBATIM (formulas, element symbols,
  unit symbols). The decimal-comma convention is not new: it is stated at
  `.claude/skills/editorial-pass1/SKILL.md:79`, and the MT already applies it to prose
  (`453,59 g` appears in committed chapter-1 output). Figure text is currently the only
  place it is not applied.
  - ⚠️ **A blind `.` → `,` is WRONG. The separators invert**: `1,000` (one thousand)
    becomes `1.000`. `tools/lib/mathml-to-latex.js:319-321` already classifies
    `us` / `is` / `integer` number formats — reuse it rather than writing a second one.
- **② State symbols are kept as-is** — `H₂O(g)`, `(l)`, `(s)` are universal.
  [USER] ruling 2026-09-02.
- **③ Naming and placement were ALREADY SOLVED in this repo; nothing was invented.**
  `books/<slug>/media/<original-basename>_IS.<ext>`, recorded in
  `books/<slug>/media/image-mapping.json`, swapped into `<image src>` by
  `cnxml-inject.js` (`loadImageMapping` / `resolveTranslatedImage`) and published by
  `cnxml-render.js` (`copyChapterImages`). `01-source/` is never touched and no HTML
  reference is edited by hand.
- **④ `generate-image-mapping.js`'s default suffix is fixed** — `DEFAULT_SUFFIX = '_IS'`,
  one exported constant replacing two disagreeing literals. Pinned against the committed
  corpus and mutation-verified. Was `_is` while all 691 files are `_IS`, and the match is
  case-sensitive, so a bare run matched **0** files and printed a success line.

- **⑤ OUTPUT FORMAT IS SVG — confirmed by measurement, but NOT for the reason usually given.**
  Resolved 2026-09-02 against the criteria fixed before measuring: fidelity in a real
  browser, size, selectable text, and rendering without the reader's font. Evidence:
  [`evidence/09-format-fidelity-overlay.png`](evidence/09-format-fidelity-overlay.png),
  [`evidence/10-format-sharpness-at-2x.png`](evidence/10-format-sharpness-at-2x.png).
  Both formats were rendered by **Chromium inside `<img>`** — how `cnxml-render.js`
  actually publishes a figure, and the strictest case, since an SVG loaded that way is
  sandboxed and can fetch no stylesheet and no webfont.

  | criterion | raster | SVG | winner |
  |---|---|---|---|
  | layout fidelity vs the oracle (per-block ink centroid) | **1.545 px** mean | 1.815 px mean | raster, by 0.27 px ≈ 0.1 pt |
  | whole-image pixel diff vs oracle | **2.70 %** | 3.32 % | raster — but confounded, see below |
  | file size | 108 KB jpg / 138 KB png | **38 KB** | **SVG, 2.8×** |
  | text selectable / Ctrl-F findable in `<img>` | no | **no** | **tie at ZERO** |
  | sharp at 2× (retina, zoom, print) | blurry, colour-fringed | **crisp** | **SVG, decisively** |
  | consistent with the 691 already shipped | no | **yes** | SVG |

  🔴 **The argument usually made for SVG — selectable, searchable, accessible text — IS
  FALSE HERE, and it was the reason to prefer SVG.** Measured: an SVG published through
  `<img>` contributes **0 characters** to the page DOM and its document is unreachable
  from script. It is an image. **SVG had to win on other grounds, and it did.**
  ⚠️ It wins anyway because the 0.27 px fidelity loss is invisible (≈ 0.1 pt) while the
  2× sharpness difference is obvious to any reader who zooms or prints.
  - ⚠️ **The embedded font is load-bearing and this was verified, not assumed** — the face
    is named `FigIS`, which no system carries, so a fallback cannot rescue it; stripping
    the `@font-face` changes **4.20 %** of pixels.
  - ⚠️ **A sharpness PROXY gave the opposite answer and was wrong.** Edge-energy scored the
    blurry 2× raster *higher* (2.98 % vs 2.68 %) because a blocky upscale has hard steps
    while a correct antialiased render has gradients. **Looking at the crop settled it.**
    Another instance of this session's pattern: the metric measured something adjacent to
    the claim.
  - The residual 0.27 px is probably closable: cairo measures with hinted advances while
    the browser uses the embedded font's unhinted metrics. Measuring with fontTools rather
    than cairo would likely align them. Not done.

## Open

- **⑥ Auto-wrap is not built.** Málstaður returns ONE string per block; the composer is
  currently handed pre-split lines. Real text will not wrap itself.
- **⑦ Type0/CID fonts are unreadable by this parser.** 1 of 36 chapter-1 figures
  (`CNX_Chem_01_02_decomp`). `pdftotext` reads it fine, so the file is not the problem.
- **⑧ Arc text is approximate.** The span is centred on `(angs[0]+angs[-1])/2`, but
  `angs[-1]` is the last glyph's *origin*, so the reconstructed span is short by about
  half a glyph. Visibly fine for new text; not registration-exact.
- **⑨ No real MT has been run.** Every Icelandic string produced so far is placeholder
  probe text written by hand.

- **⑬ THE COMMITTED SVG CORPUS IS 92 % FONT PAYLOAD — ~97 MB of ~105.5 MB.** Measured over
  a 40-file random sample of the 691. The committed files embed a large TTF face per file;
  subsetting to the glyphs actually used and flavouring as woff2 cut one file's payload
  **88 KB → 17 KB (5×)** and the whole file **101 KB → 38 KB**. Extrapolated, re-exporting
  the corpus this way would reclaim on the order of 75–80 MB. Relevant because `.git` is
  already 4.2 GB with a documented image-history concern. **Not attempted; this is an
  opportunity, not a defect in the figures themselves.**

## Known defects in the EXISTING translated corpus (found while surveying; not caused here)

- **⑩ `CNX_Chem_02_05_PerTable2_IS.svg` is a raster PNG in an SVG wrapper** — 0 `<text>`
  elements, 1 `<image>`, 214 KB. It is the only one of 691 without an `@font-face`,
  because it has no text to style; the Icelandic is baked into pixels. Its sibling
  `PerTable1_IS.svg` has 360 real `<text>` elements at the same file size. Unsearchable,
  unscalable, not re-editable — a candidate for redoing through this pipeline.
- **⑪ `_IS` is THE convention; biology's lowercase `_is` set is LEGACY and doomed.**
  liffraedi-2e's 36 files are **hand-translated images from a previous job and will be
  replaced** ([USER] 2026-09-02); their mapping is the legacy `docxImage`/`figureId`
  shape from the docx import, not this tool's basename shape. Biology is also one of the
  books held back from publication (CLAUDE.md § cross-repo rules), so this is not urgent.
  ▶ **`_IS` is the correct default for both books today** — it matches 0 biology files
  and therefore changes nothing, which is exactly what you want while that set awaits
  replacement. Do not "fix" it by lowercasing the comparison; the migration is to
  re-produce those figures, not to teach the tool a second convention.
- **⑫ `media/_reexport-pending/*.txt` lists are stale.** `RE-EXPORT-LIST.txt` names 48
  oversized files; measured 2026-09-02, only **1** of 691 now exceeds 500 KB.

## Provenance

- Source PDFs/EPS are supplied by OpenStax and **must not be placed in
  `books/*/01-source/`** — READ-ONLY, and inside the source-refresh policy's closed
  write set. See [CLAUDE.md § Never overwrite local OpenStax CNXML](../../CLAUDE.md).
- **⚠️ The delivery has TWO trees: 1st-edition images, and a second tree holding ONLY the
  updated/added 2nd-edition images.** The correct source for a figure is the **updated
  tree where it exists, else the 1st-edition tree**. Getting this wrong silently
  translates a superseded illustration — which is what
  `books/efnafraedi-2e/media/_reexport-pending/EDITION-CHECK.txt` was tracking by hand.
  This precedence is a **configured rule**, see `figure-text.config.json`.
