# prep — the 34 bought figures, re-prepared and recomposed with the current composer (0 ISK)

**Date:** 2026-09-13. **Repo HEAD:** `63d392ade77befec7de9d792ca71148897950d18` (branch
`docs/2026-09-13-e-handoff`, contains E). **MT calls:** none — only `sources.py`,
`figure-prepare.py` (which spawns `emit-blocks.py` → `extract.py`, `strip-text.py`, `gs`,
`pdftocairo`), `compose.py`, and `pdftocairo` for `source.png` were run.
**Repo writes:** none (see *Repo state* at the end).

## TL;DR

- All **34** figures prepared and composed; every output kept under
  `/home/siggi/dev/scratch-c140/prep/figs/<basename>/`. Machine-readable index:
  `/home/siggi/dev/scratch-c140/prep/manifest.json`.
- **Every inherited total re-measured and matched** (unit = drawn blocks, with multiplicity,
  summed over 34 figures): blocks **367**, missing (never-sent) **184**, translated-minus-identity
  **176**, identity **7**, runExact **191**. Per figure, `(identity, runExact, population)` also
  matches VERIFICATION.md's 34-row table **by name, 34 of 34** (control: the same comparator on a
  shifted pairing reports 31 mismatches).
- **`blocks.json` send:true key SET == sidecar key SET on 34 of 34** (control: against the
  *neighbouring* figure's sidecar it is unequal on 33 of 34; the one coincidence is named below).
- **`source.png` and `artwork.png` have identical pixel dimensions on 34 of 34.** No figure differs.
- **Draw paths (unit = drawn items):** 277 `run-exact`, 258 `layout`, **0 `arc`** — the arc null
  is explained, not blind: **0 of 367 blocks are `FT.is_arc`** in these 34 (so the arc path
  cannot be reached here), and the instrument **does** record `arc` on a control figure outside
  the 34 (56 arc items over 4 arc blocks).
- **The recomposed `translated.svg` reproduces the committed `media/<b>_IS.svg` in everything
  drawn, on 34 of 34** — artwork part identical, all 535 `<text>` elements identical in order;
  the only byte difference is the embedded woff2 font subsets, whose decoded tables are identical
  except `head.modified` (the fontTools save timestamp) on 41 of 41 faces.

---

## 1. Instrumented tree copy

`/home/siggi/dev/scratch-c140/prep/tree`:

- every `*.py` and `*.mjs` from `experiments/figure-text-translation/` copied (35 files;
  `sha256sum` of copies == originals before patching, recorded in `prep/tree-copy.sha256`);
- **plus `figure-text.config.json` copied** — a deviation from "`*.py` and `*.mjs` only", forced:
  `sources.py:load_config()` reads `HERE / 'figure-text.config.json'` (t3_verify.py copied every
  `*.json` for the same reason);
- `pylibs` and `sources.local.json` are symlinks into the repo.

`compose.py` patched by `prep/patch_compose.py` (each anchor asserted to occur exactly once;
also asserts there are exactly 3 `ITEMS.append(dict(` sites and all 3 are tagged):

| anchor | replacement | purpose |
|---|---|---|
| `\nITEMS = []` | `_TagList` class + `ITEMS = _TagList()` | every item gets `block` = index of the block being drawn (t3_verify.py's TAG, verbatim) |
| `\nfor b in blocks:\n` | `for BI, b in enumerate(blocks):` | sets that index |
| `ITEMS.append(dict(text=text, x=px / S` (in `draw_run_exact`) | `…dict(path='run-exact', …` | draw path stamped **at the draw site** |
| `ITEMS.append(dict(text=ch, x=px / S` (arc loop) | `…dict(path='arc', …` | ″ |
| `ITEMS.append(dict(text=t, x=px / S` (wrap/anchor/shrink) | `…dict(path='layout', …` | ″ |
| end of file | `(OUT / 'items.json').write_text(json.dumps(ITEMS, …))` | writes items.json |

`svgout.write_svg` reads only `text x y dx size bold italic rgb rot`, so the two extra keys cannot
alter `translated.svg` — and §6 confirms the drawn SVG content matches the committed one.

All runs used `PYTHONPYCACHEPREFIX=/home/siggi/dev/scratch-c140/prep/pycache` so no `.pyc` could be
written into the repo (the `pylibs` symlink points into it).

## 2. Source resolution

`python3 sources.py --json efnafraedi-2e <34 names>` in the tree copy, then the LOOKUP-ONLY de-hash
fallback (`-[0-9a-f]{4}$` stripped) for the unresolved; `--basename` always the unstripped name.
Record: `prep/sources.json` (+ raw stdout in `prep/logs/`).

- **26** resolved directly; **8** needed the de-hash fallback, all then resolved (0 unresolved):
  `CNX_Chem_03_01_brain-ec0b`, `CNX_Chem_03_02_argon_img-9025`,
  `CNX_Chem_03_02_copperMoles_img-a962`, `CNX_Chem_03_02_glycine_img-7c96`,
  `CNX_Chem_03_02_potassium_img-f1d1`, `CNX_Chem_03_02_sacch_img-3278`,
  `CNX_Chem_03_02_vitC_img-e537`, `CNX_Chem_03_01_exocytosis-88f6`.
- Measured source formats: **19 `.pdf` + 15 `.eps`**. This reconciles with t3_verify.py's inline
  comment `# 17 .pdf + 9 .eps + 8 de-hashed` (*inherited*): the 8 de-hashed are 2 pdf (brain,
  exocytosis) + 6 eps, so 17+2 = 19 and 9+6 = 15. Not a discrepancy.
- Edition split: 15 from `selected-art` (`updates-2e`), 19 from `base` (`first-edition`) — see
  `sources.json` per figure.

## 3. Run

Sequential, foreground, `python3 -u prep/prep_driver.py run N` in three calls (1 pilot, 32, then
exocytosis alone, last). `free -h` checked before every figure (logged in `prep/logs/run.log`);
**available never fell below 6.5 GiB**. No straggler processes after each call
(`pgrep -x python3/pdftocairo/gs` empty). Total wall time **104.2 s** (sum of per-figure seconds).

- Slowest: **`CNX_Chem_04_04_sandwich` 48.6 s** (prepare 37.45 s, source.png 10.57 s; its staged
  PDF is 1.05 MB). Next: limiting 4.25 s, rxn3 4.23 s, **exocytosis-88f6 3.89 s** (its
  `artwork.svg` is 24.9 MB but it was not slow). Everything else ≤ 2.6 s.
- Per figure step: `figure-prepare.py <src> --basename <b> --out figs/<b>` →
  `FIGTEXT_OUT=figs/<b> compose.py --translations books/efnafraedi-2e/figure-text/<b>.is.json --svg`
  → `pdftocairo -png -r 200 -singlefile figs/<b>/<b>.pdf figs/<b>/source`.
- **The staged source PDF is `figs/<b>/<b>.pdf`** (figure-prepare.py `stage_artwork`: `.eps`/`.ai`
  through ghostscript, anything else copied). `source.png` is rendered from it exactly as
  `strip-text.py` renders `artwork.png` from `artwork.pdf` (same flags, 200 dpi).

### Files in every `figs/<b>/` (verified present and non-empty, 34 of 34)

`<b>.pdf` (staged source) · `source.png` · `artwork.pdf` · `artwork.png` · `artwork.svg` ·
`runs.json` · `meta.json` · `blocks.json` · `prepare.json` · `translated.png` · `translated.svg` ·
`items.json` · `compose-report.json` · `prep-row.json` (this run's per-figure record) ·
`prepare.stdout.txt` / `prepare.stderr.txt` / `compose.stdout.txt` / `compose.stderr.txt`.
Total 217 MB. Nothing was deleted afterwards.

### `items.json` fields (for later investigators)

One entry per drawn string: `path` (`run-exact` / `arc` / `layout` — which append site drew it),
`block` (index into `compose-report.json`'s `blocks` list; that list equals `blocks.json`'s key
order on 34 of 34), `text`, `x`, `y` (PDF pt, y-up), `rot`, `size`, `bold`, `italic`, `rgb`, `dx`.
Unit differs by path: **run-exact = one item per run with non-empty draw text; layout = one item
per wrapped line; arc = one item per glyph.** `itemsWithNoBlockIndex` = 0.

## 4. Totals vs inherited denominators

| measure (unit: drawn blocks, with multiplicity) | inherited | measured | match |
|---|---|---|---|
| blocks | 367 | **367** | ✅ |
| missing / never-sent (send:false) | 184 | **184** | ✅ |
| translated (incl. identity) | — | 183 | — |
| identity | 7 | **7** | ✅ |
| translated − identity | 176 | **176** | ✅ |
| population blocks (t3 definition: key ∈ translated ∖ identity) | 176 | **176** | ✅ |
| runExact | 191 | **191** | ✅ |
| degenerate (is_arc, no usable circle) | — | 0 | — |
| undecodable (`(cid:N)` removed) | — | 0 | — |

No total differed, so there was nothing to localise. Additionally, per figure,
`(identity, runExact, population_blocks)` equals VERIFICATION.md's table **34 of 34 by name**
(inherited table, parsed from the file; control: pairing each figure with the next figure's
inherited row yields 31 mismatches, so the comparator fires).

Per-figure invariants (each a check in `prep-row.json`, failures listed in `manifest.json` →
`checkFailures`; **all empty except the SVG byte check, §6**):

- `compose-report.blocks` == `blocks.json` key order — 34/34.
- `Counter(report.translated)` == `Counter(send:true keys)` — 34/34 (every sent block has a
  non-empty sidecar value; no send:true block fell back to English).
- `Counter(report.missing)` == `Counter(send:false keys)` — 34/34.
- `Counter(runExact)` == `Counter(missing) + Counter(identity)` — 34/34.
- Path consistency: every item of a population block was drawn by `arc`/`layout`, every item of a
  kept block by `run-exact` — **0 violations** over 535 items.
- Blocks that drew **zero** items (would be a reader-visible blank) — **none** (0 of 367).

### Identity blocks (7, named)

- `CNX_Chem_04_01_basehyd_img`: `NaOH`
- `CNX_Chem_04_02_HClsoln`: `HCl(aq) + H2O(l)          H3O+(aq) + Cl–(aq)`, `HCl(g)          HCl(aq)`, `HCl(g)`
- `CNX_Chem_04_04_GreenChem`: `H2, Raney Ni`
- `CNX_Chem_14_03_FishLemon`: `CH3COOH`, `CH3COO–`

## 5. Sidecar key check

For each figure: set of `blocks.json` keys with `send: true` vs the set of keys in
`books/efnafraedi-2e/figure-text/<b>.is.json` → **equal on 34 of 34**; no key on either side only.
Control: each figure's send:true set vs the **next** figure's sidecar → unequal 33 of 34; the one
coincidence is `CNX_Chem_03_01_alsulfatemass_img` → `CNX_Chem_03_01_aspirin`, which carry the same
5 label keys (a real coincidence, not an instrument failure).

**Multiset note (R-13 twins).** Unique sidecar keys total **169**; send:true drawn blocks total
**183**; the difference is **14 extra drawn copies** of duplicated keys, in 8 figures:

| figure | duplicated send:true key (× drawn) |
|---|---|
| CNX_Chem_03_03_empform | `Divide by\|molar mass` ×2 |
| CNX_Chem_04_01_rxn2 | `Reactant` ×2, `Coefficient` ×2, `Product` ×2 |
| CNX_Chem_04_03_flowchart | `Density` ×2, `Molar mass` ×2, `Avogadro’s\|number` ×2, `Molarity` ×2 |
| CNX_Chem_04_03_map2_img | `Molar mass` ×2 |
| CNX_Chem_04_03_map3_img | `Molar mass` ×2 |
| CNX_Chem_04_05_combmap_img | `Molar\|mass` ×2, `Stoichiometric\|factor` ×2 |
| CNX_Chem_04_05_map8_img | `Molar mass` ×2 |
| CNX_Chem_03_01_exocytosis-88f6 | `Neuron` ×2 |

(183 − 7 identity = 176 population; 169 unique keys is the purchased unit, 183 the drawn unit.)

## 6. Recomposed SVG vs the committed `media/<b>_IS.svg` (informational positive control)

`publish-figure-svg.js` publishes by `fs.copyFileSync`, so the committed SVG is a byte copy of the
composer's output at recompose time (commit `b28dbe22`). One pipeline-file commit lands after it on
HEAD: `7e764d11` (described as docstrings/dead code).

- **sha256 differs on 34 of 34.** Structural diff (`prep/svgdiff.py`, log
  `prep/logs/svg-vs-committed.log`): **artwork part identical 34/34; `<text>` elements identical in
  order 34/34 (535 elements total, = the 535 items); font-face count equal 34/34, face bytes differ
  34/34.**
- Decoding every embedded woff2 subset (`prep/fontdiff.py`): **all tables identical, excluding
  `head.modified`/`checkSumAdjustment`, on 41 of 41 faces; `head.modified` differs on 41 of 41.**
  So the byte difference is the fontTools save timestamp, not the composer.
- Controls: svgdiff reports `<text>` inequality for map2's SVG vs map3's committed SVG (9 vs 7
  elements), and for map2's SVG vs a copy with one character inserted into one `<text>`;
  fontdiff reports the `head.modified` difference itself, so it fires.
- **This ordered 34/34 `<text>`-element identity (plus identical artwork parts) is the measurement
  that `7e764d11` changed no drawn output on this population** — not merely its commit message.
- Implication: `translated.svg` is **not byte-reproducible** across recomposes (fontTools stamps
  `head.modified` at save), so a sha256 comparison is useless as a regression signal here; compare
  structurally (the shape of `svgdiff.py` + `fontdiff.py`).

## 7. Draw-path instrument and the arc null

Measured over the 34: items `run-exact` **277**, `layout` **258**, `arc` **0**; population blocks by
path: `layout` **176**, `arc` 0.

The zero is explained: `blocks.json` `arc: true` (= `FT.is_arc`) on **0 of 367** blocks, so
`compose.py`'s arc branch is unreachable in this population; `degenerate` = 0 agrees. This is
consistent with the frozen `COMPOSE-FIDELITY.md:236` (*"0 arcs in the 34"*, inherited) — now
re-measured.
**Positive control** (scratch `prep/controls/arc-SciMethod/`, figure `CNX_Chem_01_01_SciMethod`,
not one of the 34, prepared with the same tree; synthetic translations file with a non-identity
value for every arc key and every other send:true key — no MT): items `arc` **56**, `layout` 33;
arc-drawn blocks `Next ...`, `prediction`, `not consistent with`, `Results`; degenerate `[]`.
The `arc` tag fires when the arc branch runs.

**Consequence for ② ③ ⑨ ⑩ investigators:** every one of the 176 translated (non-identity) blocks
in the bought figures goes through the **wrap/anchor/shrink (`layout`) path**; none through the
arc path. Arc behaviour cannot be studied on these 34.

## 8. PNG dimensions

`source.png` dims == `artwork.png` dims on **34 of 34** (== `translated.png` too). No figure named.
(The comparator distinguishes: 32 distinct dimension pairs across the 34.)

Side observation, measured: `CNX_Chem_04_03_map2_img` and `CNX_Chem_04_03_map3_img` have
**byte-identical** stripped `artwork.svg` and `artwork.png` while their `source.png` differ — the two
figures differ only in their text layer. `map7`/`map8` artwork differ from them and each other.

## 9. Per-figure table (from `manifest.json`; T−I = translated − identity; twins = extra drawn copies)

| # | basename | src | de-hash | page pt | png (src = art) | blocks | missing | transl | ident | runExact | T−I | items run-exact/layout | twins | s |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | CNX_Chem_03_01_alsulfatemass_img | pdf |  | 432×115 | 1200×320 | 24 | 19 | 5 | 0 | 19 | 5 | 19/6 | 0 | 2.23 |
| 2 | CNX_Chem_03_01_aspirin | eps |  | 422.64×114.2 | 1175×318 | 24 | 19 | 5 | 0 | 19 | 5 | 19/6 | 0 | 1.32 |
| 3 | CNX_Chem_03_01_brain-ec0b | pdf | yes | 351×174 | 975×484 | 3 | 2 | 1 | 0 | 2 | 1 | 2/1 | 0 | 2.53 |
| 4 | CNX_Chem_03_01_chloroform | pdf |  | 468×115 | 1300×320 | 24 | 19 | 5 | 0 | 19 | 5 | 19/6 | 0 | 1.58 |
| 5 | CNX_Chem_03_01_glycinemass_img | pdf |  | 432×148 | 1200×412 | 30 | 25 | 5 | 0 | 25 | 5 | 25/10 | 0 | 1.57 |
| 6 | CNX_Chem_03_01_saltMass | pdf |  | 468×94.334 | 1300×263 | 18 | 13 | 5 | 0 | 13 | 5 | 13/6 | 0 | 1.22 |
| 7 | CNX_Chem_03_02_argon_img-9025 | eps | yes | 432×54.96 | 1200×153 | 3 | 0 | 3 | 0 | 0 | 3 | 0/7 | 0 | 1.13 |
| 8 | CNX_Chem_03_02_copperMoles_img-a962 | eps | yes | 432×65.61 | 1200×183 | 5 | 0 | 5 | 0 | 0 | 5 | 0/13 | 0 | 1.15 |
| 9 | CNX_Chem_03_02_glycine_img-7c96 | eps | yes | 432×58 | 1200×162 | 3 | 0 | 3 | 0 | 0 | 3 | 0/8 | 0 | 1.08 |
| 10 | CNX_Chem_03_02_potassium_img-f1d1 | eps | yes | 432×53 | 1200×148 | 3 | 0 | 3 | 0 | 0 | 3 | 0/7 | 0 | 1.1 |
| 11 | CNX_Chem_03_02_sacch_img-3278 | eps | yes | 440.34×73.67 | 1224×205 | 5 | 0 | 5 | 0 | 0 | 5 | 0/14 | 0 | 1.15 |
| 12 | CNX_Chem_03_02_vitC_img-e537 | eps | yes | 438.74×62.3 | 1219×174 | 3 | 0 | 3 | 0 | 0 | 3 | 0/8 | 0 | 1.1 |
| 13 | CNX_Chem_03_03_empform | pdf |  | 468×107.536 | 1300×299 | 10 | 0 | 10 | 0 | 0 | 10 | 0/19 | 1 | 1.01 |
| 14 | CNX_Chem_03_05_Example2_img | eps |  | 443×68.5 | 1231×191 | 5 | 0 | 5 | 0 | 0 | 5 | 0/12 | 0 | 1.13 |
| 15 | CNX_Chem_04_01_basehyd_img | pdf |  | 468×51 | 1300×142 | 26 | 25 | 1 | 1 | 26 | 0 | 28/0 | 0 | 0.94 |
| 16 | CNX_Chem_04_01_rxn2 | pdf |  | 351×160 | 975×445 | 16 | 8 | 8 | 0 | 8 | 8 | 13/8 | 3 | 1.99 |
| 17 | CNX_Chem_04_01_rxn3 | pdf |  | 468×181.333 | 1300×504 | 2 | 0 | 2 | 0 | 0 | 2 | 0/2 | 0 | 4.23 |
| 18 | CNX_Chem_04_02_HClsoln | pdf |  | 351×199.333 | 975×554 | 9 | 6 | 3 | 3 | 9 | 0 | 53/0 | 0 | 2.59 |
| 19 | CNX_Chem_04_03_etheneBr_img | pdf |  | 468×69.5 | 1300×194 | 17 | 14 | 3 | 0 | 14 | 3 | 14/4 | 0 | 1.61 |
| 20 | CNX_Chem_04_03_ethene_img | pdf |  | 234×126.5 | 650×352 | 18 | 16 | 2 | 0 | 16 | 2 | 16/3 | 0 | 1.32 |
| 21 | CNX_Chem_04_03_flowchart | pdf |  | 468×286.522 | 1300×796 | 19 | 0 | 19 | 0 | 0 | 19 | 0/25 | 4 | 1.09 |
| 22 | CNX_Chem_04_03_map2_img | eps |  | 369.67×173.14 | 1027×481 | 7 | 0 | 7 | 0 | 0 | 7 | 0/9 | 1 | 1.15 |
| 23 | CNX_Chem_04_03_map3_img | eps |  | 369.67×173.14 | 1027×481 | 7 | 0 | 7 | 0 | 0 | 7 | 0/7 | 1 | 1.1 |
| 24 | CNX_Chem_04_03_moleratio1_img | eps |  | 234×72 | 650×200 | 3 | 0 | 3 | 0 | 0 | 3 | 0/3 | 0 | 1.06 |
| 25 | CNX_Chem_04_03_moleratio2_img | eps |  | 396×167.89 | 1100×467 | 5 | 0 | 5 | 0 | 0 | 5 | 0/6 | 0 | 1.12 |
| 26 | CNX_Chem_04_04_GreenChem | pdf |  | 432×382.167 | 1200×1062 | 10 | 9 | 1 | 1 | 10 | 0 | 16/0 | 0 | 2.3 |
| 27 | CNX_Chem_04_04_limiting | pdf |  | 432×196.167 | 1200×545 | 4 | 0 | 4 | 0 | 0 | 4 | 0/4 | 0 | 4.25 |
| 28 | CNX_Chem_04_04_sandwich | pdf |  | 468×258.665 | 1300×719 | 7 | 0 | 7 | 0 | 0 | 7 | 0/9 | 0 | 48.6 |
| 29 | CNX_Chem_04_05_combmap_img | eps |  | 380×286.06 | 1056×795 | 15 | 0 | 15 | 0 | 0 | 15 | 0/16 | 2 | 1.85 |
| 30 | CNX_Chem_04_05_combustion | pdf |  | 468×115.5 | 1300×321 | 7 | 1 | 6 | 0 | 1 | 6 | 2/12 | 0 | 1.82 |
| 31 | CNX_Chem_04_05_map7_img | eps |  | 369.67×173.14 | 1027×481 | 7 | 0 | 7 | 0 | 0 | 7 | 0/8 | 0 | 1.09 |
| 32 | CNX_Chem_04_05_map8_img | eps |  | 369.67×193.23 | 1027×537 | 9 | 0 | 9 | 0 | 0 | 9 | 0/10 | 1 | 1.17 |
| 33 | CNX_Chem_14_03_FishLemon | pdf |  | 432×281.334 | 1200×782 | 12 | 6 | 6 | 2 | 8 | 4 | 36/4 | 0 | 1.75 |
| 34 | CNX_Chem_03_01_exocytosis-88f6 | pdf | yes | 432×241 | 1200×670 | 7 | 2 | 5 | 0 | 2 | 5 | 2/5 | 1 | 3.89 |
| | **TOTAL** | 19 pdf / 15 eps | 8 | | | **367** | **184** | **183** | **7** | **191** | **176** | **277/258** | **14** | **104.2** |

Totals computed by `prep_driver.py manifest` from the per-figure `prep-row.json`, not hand-summed.

## 10. Reuse

- `manifest.json` → `totals`, `inheritedComparison`, `checkFailures`, and `figures[]` (each:
  `dir`, `source`, `stagedPdf`, `sourceResolution`, `pageSizePt`, `pngDims`, `counts` incl.
  `itemsByPath`/`populationBlocksByPath`/`arcBlocks*`, `prepare` hold counts + warnings, `checks`,
  `names` (identity/degenerate/undecodable keys), `seconds`, `memAvailKiBBefore`).
- Re-running is resumable: `prep_driver.py run` skips any figure with `prep-row.json`; a figure dir
  without it is wiped and redone.
- Scripts: `prep/patch_compose.py`, `prep/prep_driver.py`, `prep/svgdiff.py`, `prep/fontdiff.py`.

## Repo state

`git -C /home/siggi/dev/repos/namsbokasafn-efni status --porcelain` → empty, before, between batches
and after. Because `status` is blind to gitignored writes, also: `find` for anything newer than
`prep/tree-copy.sha256` (written before the first run) under `experiments/figure-text-translation`
(incl. `pylibs/`) and `books/efnafraedi-2e` → **nothing**; control: the same predicate over `prep/`
finds the patched `tree/compose.py`. No `.pyc` newer than the marker in `pylibs/` (0).
