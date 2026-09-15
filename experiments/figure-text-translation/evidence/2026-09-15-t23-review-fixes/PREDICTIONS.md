# R12–R15 on the 34 bought figures: what the recomposed media must be, by value

**Date:** 2026-09-15. **Written before the repository implementation exists.** **Cost:** 0 ISK — no MT call,
`tools/figure-run.js` never run, nothing under `books/` written. Every number below was either re-measured in
this assembly (marked **re-measured**) or is carried from the scratch rounds (marked **carried**, with its source).

`PREDICTIONS.json` holds, per figure, the hashes a repository implementation of the 16 reference patches must
reproduce. It was produced by running the final scratch build, not derived by hand:

```bash
python3 -u instruments/regen34.py --tree /home/siggi/dev/scratch-c140/fix2/final/tree \
    --out /home/siggi/dev/scratch-c140/fix3/assembler/final-regen          # DONE 34 figures prep_fail=0 compose_fail=0
python3 instruments/predict.py write /home/siggi/dev/scratch-c140/fix3/assembler/final-regen PREDICTIONS.json \
    --tree /home/siggi/dev/scratch-c140/fix2/final/tree
```

## Keys (per figure)

| key | what is hashed | produced by |
|---|---|---|
| `artwork_svg_sha256` | `prep/<b>/artwork.svg` | figure-prepare.py → strip-text.py (R15 moves it) |
| `blocks_sha256` | `prep/<b>/blocks.json` | figure-prepare.py |
| `runs_sha256` | `prep/<b>/runs.json` | figure-prepare.py → readlayer.py (R14 changes the fill tag format; 0 of the 34 carry RGB/Gray text, so the bytes do not move) |
| `compose_report_sha256` | `work/<b>/compose-report.json` | compose.py (holds the absolute sidecar path `translationsPath`) |
| `media_artwork_sha256` | the composed SVG before svgout's last `<style>` | `instruments/figparts.py` |
| `media_textgroup_sha256` | the composed SVG's `<g …>…</g>` | `instruments/figparts.py` |
| `text_count` | `<text>` elements in that group | `instruments/figparts.py` |
| `style_font_faces` | the `<style>`'s `@font-face` list (family/weight/style) — added by the controller after verification; checked by `--media` without hashing woff2 bytes | `instruments/figparts.py` |

The `<style>` is never hashed: fontTools stamps `head.modified` into every subset woff2 and a `figure-run.js`
compose does not pin `SOURCE_DATE_EPOCH`. The split relation, verified on aspirin (fractional page), brain
(integral, 4.96 MB artwork) and etheneBr, for both the final regen and the committed media against HEAD prep:

```
composed[:composed.rfind(b'<style>')] == A[:A.rfind(b'</svg>')]   with A = artwork.svg bytes .rstrip()
```

Negative control: HEAD's aspirin `artwork.svg` against the final aspirin `translated.svg` → `equal: false`
(194,542 vs 195,961 bytes), rc 1.

## Pinned inputs

| input | value |
|---|---|
| repository HEAD | `433f9a2e419441a735289bd41ec2575131151541` |
| sidecars | the 34 `books/efnafraedi-2e/figure-text/*.is.json`. `sha256sum books/efnafraedi-2e/figure-text/*.is.json \| awk '{print $1}' \| sha256sum` → `4c2dbffb…138ed6b`; `PREDICTIONS.json` `meta.sidecars_sha256` (its own formula, in `meta.note`) → `6ad2b745…4654523d` |
| figure sources | `/home/siggi/dev/scratch-c140/prep/sources.json` `[b].record.path` (under `/home/siggi/dev/repos/Myndir`) |
| build | `/home/siggi/dev/scratch-c140/fix2/final/tree`; per-file sha256 in `PREDICTIONS.json` `meta.tree_files_sha256` (compose.py `be1e283a…`, figlayout.py `17abcb6a…`, figcolour.py `dfce2900…`, svgout.py `6b919e0f…`, readlayer.py `45efa2a6…`, figure-prepare.py `20b3531a…`, strip-text.py `35c84985…`) |
| environment | `SOURCE_DATE_EPOCH=1700000000`, `PYTHONDONTWRITEBYTECODE=1`, `FIGTEXT_PYLIBS=<tree>/pylibs` (the repository's `pylibs`), exocytosis composed last |
| toolchain | Python 3.14.4, pdftocairo 26.01.0, Node v22.22.2 (Playwright Chromium from `server/node_modules`) |

## Controls — all re-measured (`reports/predictions-controls.txt` is the verbatim output)

1. **The fresh plain regen equals the round-2 build.** `predict.py check PREDICTIONS.json --dir
   /home/siggi/dev/scratch-c140/fix2/final/work` (the round-2 INSTRUMENTED compose, whose inputs are symlinks
   to `fix2/integrated/prep`): **34/34 MATCH on every key**, `media_textgroup_sha256` 34/34,
   `media_artwork_sha256` 34/34, `compose_report_sha256` 34/34. So the instrumentation did not touch the SVG or
   the report, and a new prepare reproduces round 1's.
2. **`artwork_svg_sha256` against `fix2/integrated/prep/<b>/artwork.svg` read directly: 34/34.** `blocks.json`
   and `runs.json` against the same directory: 68/68.
3. **The instrument reads committed media the way it reads a fresh compose.** The same `regen34.py` on a pristine
   `git archive HEAD` copy (`/home/siggi/dev/scratch-c140/fix3/assembler/head`, `DONE 34 figures prep_fail=0
   compose_fail=0`) gives `reports/head-predictions.json`; `predict.py check reports/head-predictions.json --media`
   against the COMMITTED `books/efnafraedi-2e/media/*_IS.svg`: **`media_textgroup_sha256` 34/34, and also
   `media_artwork_sha256` 34/34 and `text_count` 34/34** — the committed media were drawn by a `figure-run.js`
   compose, so this also shows that path and `regen34.py` agree on both parts.
4. **Positive control for check 3:** `predict.py check PREDICTIONS.json --media` against the same committed media
   (pre-recompose): textgroup **0/34**, artwork 10/34, text_count 33/34, `0/34 MATCH`, exit 1.

## HEAD → final, key by key (re-measured: `predict.py diff reports/head-predictions.json PREDICTIONS.json`)

| key | figures that differ | why |
|---|---|---|
| `media_textgroup_sha256` | **34** | R12 (`<g>` → `<g text-rendering="geometricPrecision">`) and R14 (every text fill) on all 34; R13 on the flowchart |
| `artwork_svg_sha256` | **24** | R15, the pages with a fractional MediaBox dimension |
| `media_artwork_sha256` | **24** | the same 24 (the artwork part is the prep `artwork.svg` verbatim) |
| `text_count` | 1 | `CNX_Chem_04_03_flowchart` 41 → 33 (R13); 655 → 647 over the 34 |
| `style_font_faces` | 0 | the face lists are identical HEAD vs final on all 34; controls re-run in `reports/predictions-controls.txt` (last section) |
| `compose_report_sha256` | 0 | |
| `blocks_sha256` | 0 | |
| `runs_sha256` | 0 | |

**The 24 fractional-page figures** (the set equals `fix2/integrated/compare34.json` `fractional: true`, by name):
`CNX_Chem_03_01_aspirin` · `CNX_Chem_03_01_saltMass` · `CNX_Chem_03_02_argon_img-9025` ·
`CNX_Chem_03_02_copperMoles_img-a962` · `CNX_Chem_03_02_sacch_img-3278` · `CNX_Chem_03_02_vitC_img-e537` ·
`CNX_Chem_03_03_empform` · `CNX_Chem_03_05_Example2_img` · `CNX_Chem_04_01_rxn3` · `CNX_Chem_04_02_HClsoln` ·
`CNX_Chem_04_03_etheneBr_img` · `CNX_Chem_04_03_ethene_img` · `CNX_Chem_04_03_flowchart` ·
`CNX_Chem_04_03_map2_img` · `CNX_Chem_04_03_map3_img` · `CNX_Chem_04_03_moleratio2_img` ·
`CNX_Chem_04_04_GreenChem` · `CNX_Chem_04_04_limiting` · `CNX_Chem_04_04_sandwich` ·
`CNX_Chem_04_05_combmap_img` · `CNX_Chem_04_05_combustion` · `CNX_Chem_04_05_map7_img` ·
`CNX_Chem_04_05_map8_img` · `CNX_Chem_14_03_FishLemon`.
The 10 integral pages, artwork byte-identical HEAD → final: `alsulfatemass_img`, `brain-ec0b`, `chloroform`,
`exocytosis-88f6`, `glycinemass_img`, `glycine_img-7c96`, `potassium_img-f1d1`, `basehyd_img`, `rxn2`,
`moleratio1_img`.

## Per-ruling numbers

### R12 — browser census, 34 figures × 7 scales (1, 1.25, 1.5, 1.75, 2.0833, 2.5, 3 px/pt) — re-measured

`instruments/census/census.py`; verbatim in `reports/census-head.txt` and `reports/census-final.txt`.
164 segment boundaries, 24 space-bearing, both sides.

| per scale | 1 | 1.25 | 1.5 | 1.75 | 2.083 | 2.5 | 3 | total |
|---|---|---|---|---|---|---|---|---|
| lost spaces, committed media | 8 | 0 | 3 | 0 | 2 | 2 | 1 | **16** |
| collisions, committed media | 53 | 0 | 2 | 22 | 14 | 1 | 2 | **94** |
| browser-only overhangs, committed media | 14 | 6 | 6 | 2 | 5 | 1 | 2 | **36** |
| lost / collisions / overhangs, final build | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **0 / 0 / 0** |

Also: spaces widened > 1.5× 9 → 0, narrowed 8 → 0. Controls: worst |default − geometricPrecision@2.083| 8.9688 pt
on the committed media, 0.0 on the final build; the committed-media default measurement equals round 1's
`fix2/integrated/census/cb_head_default.json` on every row (0 rows differ by > 1e-6). **Known limit (carried,
round 1):** Chromium applies Liberation's kern table and cairo does not — 28 of 647 segments draw up to 0.99 pt
short, which can only widen a gap; only Chromium on Linux was measured.

### R13 — the flowchart's 8 box labels (carried: round 1 `figures34`, round 2 byte-identical; text re-checked)

Of 176 diag rows only 8 change, all `CNX_Chem_04_03_flowchart`, all at 9.000 pt, size/step/overflow/bound unchanged:

| block | committed | final |
|---|---|---|
| b6 | Rúmmál / hreins / efnis / B | Rúmmál / hreins / efnis B |
| b7 | Massi / B | Massi B |
| b8 | Massi / A | Massi A |
| b9 | Rúmmál / hreins / efnis / A | Rúmmál / hreins / efnis A |
| b10 | Fjöldi / agna / af / A | Fjöldi / agna / af A |
| b11 | Fjöldi / agna / af / B | Fjöldi / agna / af B |
| b15 | Rúmmál / lausnar / B | Rúmmál / lausnar B |
| b18 | Rúmmál / lausnar / A | Rúmmál / lausnar A |

Re-measured on the two regens' SVG text multisets: only in HEAD `A`×4, `B`×4, `Massi`×2, `af`×2, `efnis`×2,
`lausnar`×2; only in final `Massi A`, `Massi B`, `af A`, `af B`, `efnis A`, `efnis B`, `lausnar A`, `lausnar B`.

### R14 — fill map — re-measured

Over the 614 `<text>` elements of the 33 non-flowchart figures, HEAD regen → final regen, element by element,
**the only attribute that differs is `fill`** (0 elements differ in anything else):
`#000000→#231f20` ×449 · `#141618→#211d1d` ×83 · `#141518→#211c1d` ×58 · `#131617→#201d1c` ×19 ·
`#060808→#100f0d` ×5. With the flowchart's 15 non-layout texts that is round 1's ×464 for `#231f20` over 629.
All 647 final fills: `#231f20` ×482, `#211d1d` ×83, `#211c1d` ×58, `#201d1c` ×19, `#100f0d` ×5 — no `#000000`
remains. Every run fill on the 34 is DeviceCMYK (carried, round 1).

### R15 — bond and guard

**etheneBr C=C bond at 600 dpi — re-measured** (`instruments/bond/bond.py`, `reports/bond.txt`):

| render | bond rows | bond segment (px columns) |
|---|---|---|
| source PDF (staged, pdftocairo) | 201 … 233 | **3454–3540** |
| committed media `_IS.svg` (Chromium `<img>`) | 200 … 232 | 3443–3528 (11–12 px ≈ 1.4 pt left, 1 row up) |
| final `translated.svg` (Chromium `<img>`) | 201 … 233 | **3454–3539** (1 px right-edge antialiasing) |

The source PNG is byte-identical to round 1's `fix2/integrated/bond/source600.png`.

**Guard census — carried** (round 2 `guardCensus`, `fix2/final/census/summary.txt`): the final
`artwork_transform_refusal` with the shipped flags refuses **0 of 817** in-scope chemistry sources (537 PDF,
280 EPS) and 0 of 914 resolved; worst displacement 0.003 pt against a 0.01 pt tolerance; 19 in-scope PDFs have a
CropBox larger than the MediaBox and pass. Planted controls refuse `/Rotate 90` (266.5 pt), `/Rotate 180`, a
MediaBox origin +10, a CropBox cutting the left or top edge, and the etheneBr page under the bare argv
(1.394 pt); a CropBox cutting only the bottom or right, a larger CropBox and `/UserUnit 2` pass (0.002 pt).
Not censused: organic chemistry.

## Checking the recomposed media

After `figure-run.js --stale --force` rewrites the 34 `books/efnafraedi-2e/media/*_IS.svg`:

```bash
python3 instruments/predict.py check PREDICTIONS.json --media     # expected: 34/34 MATCH, exit 0
```

Hazards, before calling a miss:
- **The sidecars must be the pinned ones** (hash above) — a changed translation moves `media_textgroup_sha256`
  legitimately.
- **The `<style>` is not compared, by design**; a recomposed media file's full bytes will not equal any
  epoch-pinned regen.
- `compose_report_sha256` holds an absolute `translationsPath`; compare it only for a `regen34.py` run from this
  repository path.
- `artwork.pdf` is regenerated on every prepare and is not a key.
- The census needs `items.json`/`diag.json` from an INSTRUMENTED compose; `--items-root` defaults to
  `fix2/final/work`, whose texts must equal the SVG's (the driver checks and stops otherwise).
