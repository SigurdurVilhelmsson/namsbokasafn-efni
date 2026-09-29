# Evidence — §C140 ㉗ (the FigIS font licence) and ⑭ (Firefox/WebKit), measured 2026-09-29

> 🧊 **FROZEN, 2026-09-29.** Cited, never synced. Status lives in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ㉗ ⑭ ㊴ ㊵ and its ⏩ RESUME). **If this folder
> disagrees with the register, the register wins** (CLAUDE.md § One source of truth).
> **Cost of everything here: 0 ISK.** Nothing ran `tools/figure-run.js` live, `translate-blocks.mjs` or any paid
> tool. Composes ran the composer's own Python CLIs (`figure-prepare.py`, `figure-compose.py`) into scratch
> directories; nothing was written under `books/`.

Rulings: `docs/decisions/2026-09-26-pre-editor-pivot-translation-rulings.md`, ruling 4 — (a) ㉗ the strict licence
reading, like STIX; (b) ⑭ check every composed figure in WebKit and Firefox against Chromium, and on a real iPad.
Design record: [`docs/superpowers/specs/2026-09-29-c140-c27-c14-composer-design.md`](../../../../docs/superpowers/specs/2026-09-29-c140-c27-c14-composer-design.md).
Branch `feat/c140-c27-c14-composer`, stacked on `43f61a1c1`.

## 1. Census of the fonts embedded in translated figures (09:13Z, `43f61a1c1`)

Instrument: [`instruments/font_census.py`](instruments/font_census.py) → [`reports/font-census.tsv`](reports/font-census.tsv).
Every `books/*/media/*_IS.svg`, each `@font-face` decoded with fontTools:

| population | files | sidecar | font |
|---|---|---|---|
| FigIS only | 589 | 459 of the 702 FigIS-bearing files have one | Liberation Sans **2.1.5**, woff2, IDs 0–6 only |
| FigIS + FigSym | 113 | (in the 702 above) | 2.1.5 + STIX 1.1.0 (FigSym, already renamed by ⑥a) |
| June figures | 10 | none | Liberation Sans **1.07.4**, TrueType, family `LiberationSans` |
| no font | 5 (+1 E2E fixture) | none | — |

- 712 files carry "Liberation" in name IDs 1/3/4/6; none of the 1,069 FigIS faces carries ID 7 (the trademark
  notice) — fontTools' default subset keeps IDs 0–6. 56 files hold an in-document `<feImage>`.
- The 2026-09-16 record counted 656 June files; buying the rest of chemistry recomposed all but these 10.

## 2. Liberation Sans 2.1.5 provenance

- Release: <https://github.com/liberationfonts/liberation-fonts/releases/tag/2.1.5> (published 2021-09-30); its notes
  link asset `files/7261482/liberation-fonts-ttf-2.1.5.tar.gz`, sha256
  `7191c669bf38899f73a2094ed00f7b800553364f90e2637010a69c0e268f25d0`. Its `LICENSE` (4,414 bytes, ASCII, no `--`, no
  XML-illegal character) is committed as `fonts/Liberation-2.1.5-LICENSE.txt`, sha256
  `93fed46019c38bbe566b479d22148e2e8a1e85ada614accb0211c37b2c61c19b`. It names two Reserved Font Name sets:
  "Arimo, Tinos and Cousine" (Google) and "Liberation" (Red Hat).
- This box's faces are Ubuntu 26.04 `fonts-liberation 1:2.1.5-3build1` (built by Debian from the release's sources).
  **They are not byte-identical to the upstream TTFs**, table by table: `FFTM`, `cmap` (subtable layout; the best
  cmap is identical), `head`, and in Regular and Italic `glyf`/`loca` — **one outline, U+25D5 ◕**. The name tables
  are identical (every notice), and so are `hmtx` and the glyph set. So the licence and notices are upstream's; the
  pin (`figis.FACES`) is on the files the box actually has.
- fontconfig resolves cairo's four requests (`Liberation Sans:weight=100|200:slant=0|100`) to exactly those four files —
  the files `compose.lin_advance` measures with. `figis.py` refuses any face that is not both the pinned bytes and
  what fontconfig resolves to.

## 3. ⑭ — the cross-engine sweep

Instruments (committed, permanent): `browser-sweep.mjs`, `browser-score.py` (their tests: `test_browser_score.py`,
`tools/__tests__/browser-sweep.test.js`). Browsers: Chromium 153.0.8010.12 and Firefox 155.0 (Playwright 1.63,
installed 2026-09-29 under ruling 4b). Every figure is served as `image/svg+xml` over HTTP and loaded through `<img>`,
at its intrinsic CSS size capped at 800 px, DSF 1. Raw PNGs: `~/.cache/namsbokasafn-figtext/c14-sweep-2026-09-29/`
(not committed). Every run below ended with its terminal `{"done":true}` row.

### 3.1 Controls ([`sheets/controls-and-first-look.png`](sheets/controls-and-first-look.png))

| control | Chromium vs Firefox |
|---|---|
| `ctl-plain` (shapes) — negative | 0 hot tiles |
| `ctl-mix-blend` (CSS `mix-blend-mode`) — remedy candidate | 0 hot tiles: Firefox honours it inside `<img>` |
| `ctl-feimage` (content only via `<feImage href="#id">`) — positive | 116 hot tiles; Firefox ink **0.000** |
| `ctl-blend-chain` (cairo's feImage S + D + feBlend) — positive | 112 hot tiles; Firefox ink **0.000** |

### 3.2 The metric had to be rebuilt twice, and each failure is the reason for the next

1. **Whole-image shares and an ink ratio** (first scoring of the full renders): 164 flagged, 111 of them non-feImage,
   all by ink ratio alone. Cause, established by zoom ([`sheets/font-control-sigma-pi.png`](sheets/font-control-sigma-pi.png)
   and the text in `sheets/controls-and-first-look.png`): Chromium draws text with colour-fringed subpixel antialiasing,
   Firefox with grayscale, so every text pixel differs in some channel. The same pass **missed a real defect**:
   `Electrnin`'s interference pattern is drawn solid black in Firefox, but it is 0.7 % of the pixels and black replaced
   black-and-yellow, so neither the share nor the ink moved.
2. **Plain 12 px tiles**: `Dipolfield` scored 28 hot tiles with identical content — a sub-pixel placement offset between
   the engines makes whole tiles differ along every long edge.
3. **Shift-tolerant tiles** (a pixel differs only if no pixel within 1 px of the other render matches it within 64/255;
   a tile is hot above 25 %) **on artwork-only renders** (`--variant notext`: the composer's text layer removed at
   `figparts`' framing). This is the rule the score now uses.

### 3.3 The font is used in both engines

At 44 px, the embedded FigIS subset draws identical sans glyphs (including σ, π) in Chromium and Firefox; with the
`@font-face` rules stripped, both fall back to a serif ([`instruments/font_control_render.cjs`](instruments/font_control_render.cjs),
[`sheets/font-control-sigma-pi.png`](sheets/font-control-sigma-pi.png)). The σ/π difference seen at ~9 px is hinting.

### 3.4 The Firefox verdict (artwork only; [`reports/sweep-notext-summary.json`](reports/sweep-notext-summary.json), [`reports/sweep-notext-per-figure.tsv`](reports/sweep-notext-per-figure.tsv))

- 707 composed figures + 4 controls, all `rendered` in both engines. The 10 June figures have no composer framing and
  are listed as `no-framing` (their full renders are in `reports/sweep-full-per-figure.tsv`).
- Non-feImage noise: tolerant tile share p50 **0.0**, p99 0.167, max 0.5.
- **All 56 in-document-feImage figures are flagged**, including the three the full-render metric had missed
  (`phasediag` 35 hot tiles, `Electrnin` 16, `Hydrogen` 9).
- **3 non-feImage figures are flagged and are noise**, inspected
  ([`sheets/non-feimage-flags-are-noise.png`](sheets/non-feimage-flags-are-noise.png)): `GlobalWarming-b740`,
  `Dipolfield`, `propionate_img` — identical content, edge/offset differences, `tol_strong` ≤ 0.006.
- **So the Firefox defect set is exactly the 56**: cairo's emulation of non-OVER blends references in-document
  elements from `<feImage>`, and Firefox paints those transparent (Mozilla bug 455986) — the whole artwork of the
  figure, since every later paint nests in the filter tree.

### 3.5 The raster arm repairs it ([`reports/raster-arm-4.tsv`](reports/raster-arm-4.tsv), [`instruments/raster_arm_ab.py`](instruments/raster_arm_ab.py))

`PerTable2` (multiply), `Electrnin` (DEST_OUT/ADD), `phasediag` (SOURCE lerp) and `RaoultLaw` (clipped multiply) were
prepared and composed into scratch with the ⑭ gate; all four took the raster arm. Scored against Chromium's render of
TODAY's vector media, artwork only:

| figure | Firefox today | raster arm, Chromium | raster arm, Firefox |
|---|---|---|---|
| PerTable2 | 68 hot tiles | 0 (tol_strong 0.0000) | 0 (0.0000) |
| Electrnin | 16 | 0 (0.0009) | 0 (0.0000) |
| phasediag | 35 | 0 (0.0001) | 0 (0.0000) |
| RaoultLaw | 493 — a blank white rectangle | 0 (0.0000) | 0 (0.0000) |

Display sizes are unchanged. With the text layer included the raster-arm residue is 0–3 hot tiles, the text-AA floor.
Sizes (with ㉗'s licence): PerTable2 38,734 → 52,050 bytes, phasediag 87,912 → 114,049, Electrnin 463,167 → 418,075,
RaoultLaw 988,309 → 429,140. `artwork.png` is **opaque RGB** (white page) where the vector artwork has no background;
vefur's dark theme gives figure images no background, so these figures would sit on a white card.

### 3.6 WebKit: not measured

`webkit-2359` (WebKit 26.6) is installed but will not launch: 34 shared libraries are missing (GTK 4, GStreamer,
libsoup 3, flite …), which `npx playwright install-deps --dry-run webkit` maps to 148 apt packages. Installing them
needs sudo. A private test page for the real-iPad look ([USER]'s) was published 2026-09-29: the four controls with
Chromium references, the four feImage figures today vs after ⑭, two ordinary figures after ㉗, and a copyable result
summary — <https://claude.ai/artifact/K6ttycf2mP4FqNyo8EM5Yq>.

## 4. The June figures (live defects confirmed in both engines)

The 10 June files are all live on namsbokasafn.is (a read-only fetch with a 404 control, done by a mapping agent;
per-figure analysis in the register). Re-measured here from the sweep's own renders
([`sheets/june-figures-live-defects.png`](sheets/june-figures-live-defects.png)): `molecreso` and `Cl2OClO2` draw their
models as near-invisible shapes on **black** panels, and `N2O5` is a whole letter-size production sheet with the
file name drawn as a caption — in Chromium and Firefox alike.

## 5. ㉗ — the A/B (pre-㉗ vs ㉗ composer, identical inputs)

A workflow agent built a re-runnable harness (not committed; kept on this box at `~/.cache/namsbokasafn-figtext/c27-ab-2026-09-29/`, with the raster-arm composes beside it in `c14-raster-arm-2026-09-29/`): two sparse worktrees at
`43f61a1c1` (BEFORE) and `ade93a3c2` (AFTER, ㉗ only — the ⑭ gate deliberately excluded, since it changes pixels on
purpose), the composer's own CLIs, and 27 figures stratified by face mix (Regular/Bold/Italic/BoldItalic), FigIS +
FigSym, §C159 textless, in-document feImage and no-font. Each was resolved and prepared ONCE (prepare is unchanged
between the commits, checked with `git diff`) and composed three times (BEFORE, AFTER, BEFORE again).

| check | result |
|---|---|
| artwork part (figparts split) byte-identical | **27 / 27** |
| `<text>` elements byte-identical | **27 / 27** (757 elements, same order) |
| FigIS faces: every table but `name` identical | **48 / 48** — `cmap`, `glyf`, `loca`, `hmtx`, `hhea`, `GPOS`, `GSUB`, `GDEF` and the glyph order; `head` differs only in bytes 8–11 (`checkSumAdjustment`, which the woff2 writer recomputes) |
| FigSym faces byte-identical | **6 / 6** — the fontsubset refactor is a pure move |
| AFTER faces name no `liberation\|arimo\|tinos\|cousine`; IDs 0/7/13/14 equal the system file's (Mac and Windows platforms) | **48 / 48** |
| AFTER text group = BEFORE's + one FigIS `<metadata>` as first child; FigSym's unchanged and second | **25 / 25** FigIS figures; the 2 no-font figures are byte-identical files |
| pixels, BEFORE vs AFTER, Chromium 153 and Firefox 155 | **identical, 27 / 27, both engines** (strong 0, anyd 0) |

Controls: stripping the `@font-face` rules changes all 25 font-bearing figures in both engines (the fonts are in use);
a one-glyph mutant is detected 3 / 3 in both engines (114–826 px); a second BEFORE sweep is PNG-byte-identical.
Size: +5,310 to +7,663 bytes per FigIS figure (median +5,426); the licence `<metadata>` is 85 % of it (4,888–5,723
bytes by faces listed), the renamed name records the rest (+412 to +1,940). Committed media vs BEFORE: 23 / 27
byte-identical; the other 4 differ only in the fonts' `head.modified`/checksum, relics of composes made before the
§C159 timestamp pin — so step 6's recompose changes exactly the ㉗ delta. WebKit: not launchable (34 missing
libraries; §3.6).

**An adversarial second agent, told to refute the claim, did not** (`refuted: false`). It worked by different
means throughout: `git archive` trees instead of worktrees; its own composes of all 27 figures, byte-identical to the
first agent's; a whole-file text diff with the base64 payloads replaced by placeholders (every FigIS figure is exactly
one replaced `<style>` line plus one inserted `<metadata>` block); every face decoded twice, once with its own WOFF2
container parser; all 108 faces loaded through `new FontFace(…)` in both engines, where a truncated control is
rejected; renders at DPR 2 in three modes, pixel-identical 27/27 in all six engine × mode cells; and lxml and expat
parses of all 27 files. One untested hypothesis it raised, recorded for the WebKit leg: fontconfig resolves the family
name `FigIS` to DejaVu Sans, whose `20-unhint-small-dejavu-sans` rule turns hinting off below 7.5 px. Chromium and
Firefox measurably do not take that path at 5–7.4 px. A **Linux** WebKit port that built fontconfig patterns from the
web font's family name might; iPadOS WebKit uses CoreText, not fontconfig.
