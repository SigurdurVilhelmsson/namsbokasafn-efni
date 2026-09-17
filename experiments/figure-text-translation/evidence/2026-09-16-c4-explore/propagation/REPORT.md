# §C140 ④ — how a strip-text.py output change propagates (read-only mapping)

Branch `feat/c140-c4-strip-keeps-gstate`. Nothing under the repo was run except a plain `git status`
at the end. `strip-text.py` was NOT edited. All facts below are file:line citations from the
working tree as of 2026-09-16.

---

## 1. Where strip-text.py is invoked, with what flags, and every consumer of its outputs

**Invocation chain (two hops, both subprocess spawns):**

- `tools/figure-run.js:1918-1932` (stage `'prepare'`) spawns
  `python3 figure-prepare.py <artwork> --basename <basename> --out <outDir>`, once per figure that
  is not `skipped-current`, into a per-run `mkdtemp` (`tools/figure-run.js:1894`,
  `1915-1917`). This happens on **every** run, dry or live (module header,
  `tools/figure-run.js:42-45`: "WHY A DRY RUN STILL RUNS PYTHON").
- `figure-prepare.py:585` — `run_child('strip-text.py', staged, out_dir, extra=('--svg',))`, i.e.
  `python3 strip-text.py <staged>.pdf --svg`. `run_child` (`figure-prepare.py:292-312`) sets
  `env['FIGTEXT_OUT'] = str(out_dir)` (the SAME `outDir` `figure-run.js` created), so
  `strip-text.py`'s `OUT` (`_deps.py:41`, `strip-text.py:24-25`) resolves to that directory. `--svg`
  is not optional — `figure-prepare.py:582-585`'s comment: a prepare that returned success with a
  null svg path would let the MT be paid for a figure composition cannot use.

**What strip-text.py writes into that `outDir`:** `artwork.pdf`, `artwork.png`
(`strip-text.py:293-301`), and with `--svg`, `artwork.svg` + `svgfix.json`
(`strip-text.py:303-314`, `:244-277`).

**Consumers, each a direct file:line read of one of those four files:**

| Consumer | Reads | Where |
|---|---|---|
| `figure-prepare.py` itself | `artwork.svg` (non-empty check) | `figure-prepare.py:592-596` |
| `figure-prepare.py` — ruling (W) coordinate guard | `artwork.pdf` (`artwork_transform_refusal`) | `figure-prepare.py:491-537`, called `:599` |
| `figure-prepare.py` — blend-chain sentinel | `artwork.svg` (`reference_cost_warnings`, via `svgfix.reference_cost`) | `figure-prepare.py:377-398`, called `:624` |
| `figure-compose.py` / `compose.py` | `runs.json`, `meta.json`, `blocks.json`, `artwork.pdf`, `artwork.png`, `artwork.svg` (its own docstring names all six) | `figure-compose.py:6-8` |
| `compose.py` — raster background | `artwork.png` via `cairo.ImageSurface.create_from_png` | `compose.py:64-68` |
| `compose.py` — container detection | `artwork.pdf` via `FC.load_page` (figcontainers) | `compose.py:451` |
| `compose.py` — final SVG | `artwork.svg`, read as raw text and spliced before `</svg>` (`svgout.write_svg`) | `compose.py:514-517`, `svgout.py:47-49` |
| Ring gate (§C140 ⑩) | `artwork.svg` — census/heal/gate, and **overwrites it in place** with the healed SVG on approval | `tools/figure-run.js:853-1023` (`applyRingGate`), spawning `figure-rings.py` (`figrings.py`) |
| `svgfix.json` | read only by `collapse_svg` itself (the writer) and by `test_figure_prepare.py`'s assertions (6c/6d, `test_figure_prepare.py:538-540,578-589`) — **no production code re-reads it** | `strip-text.py:244-277`; confirmed by grepping for `svgfix.json` across `experiments/figure-text-translation` and `tools` |

Drift guards (`applyDriftGuard` `tools/figure-run.js:1026-1041`, `applyPartialDriftGuard`
`:1073-1120`) do **not** read strip-text's output files directly — they read the classifier's
outcome (itself derived from `figure-prepare.py`'s summary integers, not artwork bytes) and
`blocks.json` (written by `emit-blocks.py`, not `strip-text.py`). Same for
`applyMappingPreflight`. So the direct-consumer set is exactly the row list above; everything
else in the driver reasons about counts, never about the artwork content strip-text.py wrote.

`render-check.mjs` is used by the ring gate to rasterise `artwork.svg`/the counterfactual heal
(`tools/figure-run.js:959-971`) — folded into the ring-gate row above, not a separate consumer.

---

## 2. Staleness

**`isStale()` does not look at strip-text.py's output at all.**

`tools/figure-run.js:282-292`:
```
export function isStale(sidecar) {
  if (!sidecar ...) return true;
  const { blocks, renderHash, composedHash, composerVersion, composedVersion } = sidecar;
  if (!renderHash || !composedHash) return true;
  if (composedHash !== renderHash) return true;
  if (composedVersion !== COMPOSER_VERSION) return true;
  if (blocks && typeof blocks === 'object') {
    if (computeRenderHash(blocks, composerVersion || COMPOSER_VERSION) !== renderHash) return true;
  }
  return false;
}
```
Every input is a sidecar field (`books/<slug>/figure-text/<basename>.is.json`,
`tools/lib/figure-text-sidecar.cjs:37-39`) or the translated blocks text
(`computeRenderHash`, `:63-72`, hashes `composerVersion` + the block strings — never anything
about the artwork). There is no hash, timestamp, or version field anywhere that describes what
`strip-text.py` produced.

**The one lever that forces a recompose is `COMPOSER_VERSION`**
(`tools/lib/figure-text-sidecar.cjs:18-30`, currently `'3'`), whose own docstring says "Bump when
a composer change alters pixels for unchanged text." `strip-text.py` is not `compose.py`, so a
strip-only fix is not obviously "a composer change" by that docstring's own wording — but since
nothing else tracks strip's output, bumping `COMPOSER_VERSION` is the only mechanical way to make
`isStale()` flip for the 34 already-bought figures. Without a bump, `--stale` alone selects them
(`tools/figure-run.js:1797`, `r.sidecar || r.sidecarUnreadable`) but `isStale()` still reads
`false` and they are filed `skipped-current` (`:1805-1809`) unless `--force` is also passed, which
suppresses the skip regardless of `isStale()`'s answer (`:1806`, comment `:1803-1804`).

**What a 0-ISK recompose writes**, confirmed by measurement (not inferred): because every run
re-creates a fresh `mkdtemp` (`tools/figure-run.js:1894`) and `prepare` always runs
(`:1918-1932`), a recompose does re-run the current `strip-text.py` — any code change is picked
up automatically on the next run of anything, no separate re-extraction step needed.

- **Media**: `books/<slug>/media/<outputName>` is always overwritten by `publishFigureSvg`
  (`fs.copyFileSync`, `tools/publish-figure-svg.js:254`).
- **Sidecar**: `books/<slug>/figure-text/<basename>.is.json` is rewritten only if
  `sidecar.composedHash !== composedHash || sidecar.composedVersion !== COMPOSER_VERSION`
  (`tools/publish-figure-svg.js:271-277`) — i.e. only on the run where `COMPOSER_VERSION` actually
  changes (or the sidecar had never been stamped). A second recompose against an unchanged
  `COMPOSER_VERSION` writes media only.
- **Mapping**: `books/<slug>/media/image-mapping.json` is untouched for an already-`mapped`
  figure (`mintMappingEntry` only runs when `rec.mapping.status === 'mintable'`,
  `tools/figure-run.js:1433-1441`).

**The exact command, and how §C140 ① did its real 0-ISK recompose run:** the command is
`node tools/figure-run.js --book efnafraedi-2e --chapter <N> --stale --force`
(`docs/plans/2026-07-21-post-item17-followup-campaign.md:209`: "The 34 bought ch03/ch04 figures
are recomposed on the branch (`figure-run.js --stale --force`, no MT spawned)"). The verified,
by-value run is Task 18 in
`experiments/figure-text-translation/evidence/2026-09-15-t23-review-fixes/VERIFICATION.md:197-380`:
dry runs first (`--stale --force --dry-run`, `:212-235`), then live per chapter
(`:237-262`, `MT spawned for 0 figure(s) — only a figure with NO sidecar is spendable`,
`published 15/19 figure(s)`), then `git status --porcelain` showing exactly the 34
`books/efnafraedi-2e/media/*_IS.svg` files changed, 0 sidecar or mapping changes
(`:264-274`, `composedVersion`/`composedHash` already matched from the prior bump earlier in that
same task sequence), then a byte-for-byte match against a scratch prediction
(`predict.py --media`, `:276-289`) and a browser/bond re-check on the committed media
(`:291-321`). `README.md:12,59-60` of that same evidence folder states the command directly:
`tools/figure-run.js --stale --force` is what "wrote the 34 `books/efnafraedi-2e/media/*_IS.svg`
files", and "COMPOSER_VERSION stays '3' ... so the spec prescribes `figure-run.js --stale --force`
for the 34" — i.e. for item ④, since strip-text.py's output would change without necessarily
changing `COMPOSER_VERSION`, whether a bump is needed is a call the eventual ④ implementation
has to make explicitly (nothing currently forces it).

---

## 3. Tests that exercise strip-text.py

**Real executions (not stubs):**

- `test_readlayer.py:530-649`, CASE 14. Loads `strip-text.py` via `importlib`
  (`:537-539`, hyphenated filename, no plain `import`) and calls the real `ST.strip_text(pdf)`
  (`:601`) on two real corpus PDFs (`CNX_Chem_02_00_Biomarkers`, `CNX_Chem_02_01_Dalton10_img`).
  Assertions:
  - `14a`/`14b` — controls (the fixture really hides all its text in forms; the OLD page-only
    strip fails to remove it).
  - `14c` — text-removal: no reachable `BT` block, `pdftotext` returns nothing (`:625-628`).
  - `14d`/`14e` — artwork survival, by NON-WHITE PIXEL COUNT (`nonwhite()`, `:577-583`,
    grayscale `< 250`): `14e` asserts `new_px == old_px` (`:646-648`). This is blind to a colour
    change: a pixel recoloured from black to blue-grey is still non-white, so the count is
    unchanged either way. Nothing in this file compares RGB/CMYK values before and after.
- `test_figure_prepare.py` — runs `figure-prepare.py` as a real subprocess end to end
  (module docstring `:9-13`: "Cases 1-3 run the real thing end to end … and assert MEASURED
  values"), which transitively re-runs the real `strip-text.py`. But its assertions are about
  `figure-prepare.py`'s own summary integers, the `--basename artwork` collision refusal
  (`:383`), and `svgfix.json`'s structure (`:538-540`, `:578-589`) — none compare artwork pixel
  colour.

**Mentioned only, not exercised (no real strip-text.py execution):**

- `test_sendable.py:26` — reads a committed `out/artwork.png` fixture that only a prior manual
  `strip-text.py` run produced; does not re-run it (and warns a manual run would clobber the
  fixture other tests depend on).
- `test_figcolour.py` — tests the composer's text-fill colour conversion against poppler
  (`:1-19`), a different question from whether strip-text preserves the ORIGINAL artwork's
  non-text colour.
- `test_blockkey_consumers.py:78`, `test_compose_t23.py:25,182`, `test_figtext_out.py:44` —
  docstring/comment references only.
- `tools/__tests__/figure-run-paid.test.js:1849-1852`, `figure-run-free.test.js:1283,1289` — JS
  driver tests. They use an injectable, stubbed `spawn` (`defaultSpawn` is never invoked in these
  suites); strip-text.py's known behaviour is quoted in comments/fixture literals (e.g. "the
  decisive control: artwork.svg holds 0 `<text>` elements") to justify an assertion about the
  driver's own JS logic, not executed.

**What would need to change or be added for "persistent graphics state inside BT survives the
strip":**

1. `test_readlayer.py` CASE 14 needs a value check, not just a count: either extend `14e`'s
   control (`nonwhite()`) with a same-pixel RGB/CMYK sample, or add a new case using the
   `combustion` figure (`CNX_Chem_04_05_combustion`, the corpus anchor named in
   `evidence/2026-09-13-compose-fidelity/reports/verify-pixel-instrument-and-prototype.md:183-192`
   and `.../reports/1d-completeness.md` row 7) with a synthetic-fixture control alongside it,
   following this repo's own ruling-R-9 pattern (a synthetic + a real-corpus anchor, never real
   corpus alone — `test_readlayer.py:14-20`).
2. No committed test currently asserts anything about operators other than text-showing ops
   surviving BT..ET — the only code that does this today are the evidence-only, uncommitted-to-
   the-permanent-suite instruments
   `evidence/2026-09-13-compose-fidelity/instruments/1d/inbt_ops.py` (census: classifies non-text
   ops inside BT into `TEXT_OPS` vs `GSTATE`, `inbt_ops.py:8-10`) and `strip_variant.py` (a
   `strip_keep_gstate` variant that keeps everything not in a narrower `TEXT_OPS` set,
   `strip_variant.py:9-23`) — scoped to the 34 bought figures only, per the task's own framing
   and confirmed by `strip_variant.py`'s CLI taking one PDF at a time with no corpus loop. Porting
   one of these into a permanent `test_*.py` (or a new CASE in `test_readlayer.py`) is what
   "settled by a corpus census, not guessed" (the RESUME block's own words,
   `docs/plans/2026-07-21-post-item17-followup-campaign.md:15`) implies still needs doing.
3. `test_figure_prepare.py` has no colour assertion either; if ④'s design wants end-to-end
   (wrapper-level) coverage it needs one added there too, not just at the `strip_text()` level.

---

## 4. The `7 Tr` clipping-mode class (8 figures)

**Keeping non-text operators inside BT would NOT change anything for these 8 figures.**

Both census/prototype scripts classify `Tr` (text rendering mode) as a text operator, not a
graphics-state operator to keep: `inbt_ops.py:8` puts `Tr` in `TEXT_OPS`; `strip_variant.py:9`'s
`TEXT_OPS` also includes `Tr`. The design description at the top of the campaign register
(`docs/plans/2026-07-21-post-item17-followup-campaign.md:15`: "drops only text operators and
keeps the operators whose effect outlives ET") is consistent with this — `Tr=7` only matters
while text is being shown (it routes the immediately-following glyph outlines into the clipping
path), and the glyph outlines themselves are produced by `Tj`/`TJ`, both squarely inside
`TEXT_OPS` in every version of this design. The defect is not a graphics-state VALUE that
persists past ET; it is that the CLIP PATH itself is built out of the (removed) glyph shapes
(`strip-text.py:154-163`'s own docstring: "Mode 7 adds the glyphs to the CLIPPING path instead of
painting them ... Removing the BT..ET removes the clip"). Keeping `gs`/`k`/`w`/etc. changes
nothing about that mechanism, because the text-showing operators that would have built the clip
are still removed by design.

**"Live exposure is 0, and nothing enforces that" is still true, and stays true after ④.** All 8
figures measure `sendable 0` with images and 0 paint ops (`strip-text.py:171-173`), so
`classifyFigure` (`tools/lib/figure-classify.js`, referenced from `figure-run.js:1971-1982`)
files them `copied-photo`, and `processFigureLive` returns at `rec.outcome !== 'translated'`
(`tools/figure-run.js:1263`) — this tool's output is never composed for them regardless of what
`strip-text.py` does internally. Nothing in the code asserts "a `7 Tr` figure must never become
sendable" — it is an accident of the current corpus (verified: the docstring itself says so,
`strip-text.py:173-175`, "and nothing enforces that. A re-extraction that made one of them
sendable would compose translations onto a blank canvas"), and ④'s change does not add such a
guard.

---

## 5. Interactions: gs/SMask/blend, and q/Q/path operators inside BT

**`gs` (ExtGState — opacity, blend mode `/BM`, or `/SMask`) is classified as GSTATE (kept) by
both prototype scripts** (`inbt_ops.py:10`'s `GSTATE` set includes `'gs'`; `strip_variant.py`'s
`TEXT_OPS` excludes it, so `strip_keep_gstate` keeps it, `strip_variant.py:9-22`). Whether this
matters downstream is answerable from the code:

- **svgfix / blend-mode lerp.** `svgfix.py:12-19` states cairo's SVG surface paints any
  non-Normal PDF blend mode (`/BM /Multiply`, `/Screen`, ...) as an exponential lerp reference
  structure, regardless of where the ExtGState that set it came from. Today, a `gs` referencing a
  blend-mode ExtGState set inside a BT..ET block is unconditionally dropped by the shipped
  `strip_text_ops` (every op at `depth > 0` is discarded, `strip-text.py:93-113`), so any figure
  whose only source of a non-Normal blend mode was such a `gs` currently shows no blend paint in
  `artwork.svg` at all. If ④ keeps that `gs`, a later paint that inherits it could introduce a new
  blend-lerp chain that `collapse_svg`/`svgfix.collapse_blend_lerp` (`strip-text.py:244-277`,
  called unconditionally after `--svg`) and `figure-prepare.py`'s reference-cost sentinel
  (`reference_cost_warnings`, `figure-prepare.py:377-398`) have to correctly handle — a genuinely
  new input shape for code that already says "any other shape … makes this pass collapse
  NOTHING" (`svgfix.py:33-35`).
- **Ring gate.** `figrings.py:1-27`'s own docstring: it locates "every image-backed mask" in
  `artwork.svg` by structure (base64 raster + `<mask>`/`<image>` patterns cairo emits for PDF soft
  masks) and gates a heal on a rendered-pixel comparison — it has no notion of where in the PDF a
  soft mask's ExtGState was set. So a `gs` referencing `/SMask` that is currently discarded
  (because it sat inside BT..ET) and would be kept under ④ is exactly the kind of new structural
  input `find_candidates` (referenced by the module docstring, `figrings.py:19`) would then have
  to census — an interaction the shipped code does not special-case either way.
- **Neither prototype script's committed census (`inbt_ops.py`) resolves an ExtGState's
  dictionary** — it counts the operator name `gs` (`inbt_ops.py:10,22-23`), not whether the named
  resource actually carries `/SMask` or `/BM`. So whether any of the 18/34 figures with
  graphics-state ops inside BT (`1d-completeness.md` row 7) actually involve an SMask/blend `gs`
  — as opposed to the measured `k` (fill colour) case in `combustion` — is not established by any
  committed evidence; it is exactly what "the census agent measures what actually occurs" is for.

**q/Q and path-construction operators inside BT.** The shipped `strip_text_ops`
(`strip-text.py:92-113`) has no operator-type distinction at all today — every instruction at
`depth > 0` is dropped, whatever it is, so a `q`/`Q`/`cm`/path op inside a text object (however
unusual — the PDF spec does not expect path or `q`/`Q` operators inside BT..ET) is currently
removed along with the text. Under the prototype's "keep everything not in `TEXT_OPS`" design
(`strip_variant.py:9-22`), such an operator would be kept, in its original relative order, with
only `BT`/`ET` themselves and the `TEXT_OPS` operators excised — since `BT`/`ET` carry no
`q`/`Q`-style balance requirement of their own, keeping a q/Q pair that was wholly inside one text
object cannot become unbalanced by this transformation alone (order is preserved; only same-depth
operators are dropped). The committed census (`inbt_ops.py`) — the operator-name counter
(`inbt_ops.py:9-10`) would show a bare `q`/`Q` if the corpus ever contains one at `depth > 0`,
since it is outside both `TEXT_OPS` and `GSTATE` but still `op not in TEXT_OPS` (`:22-23`), but no
committed run's output is on disk — the corpus census this needs is, again, outside this
read-only task's scope (hard rule: no pipeline runs).

---

## 6. Documents that state strip-text's behaviour and would become false once ④ ships

- **`experiments/figure-text-translation/REGISTER.md:53`** — the current, live (non-superseded:
  the whole file is a stack of `⏩ RESUME` blocks and only the topmost, line 11, "supersedes every
  block below") component table:
  > `strip-text.py` | ❌ drops colour/graphics-state ops inside BT..ET (campaign §C140 ④) |
  > unchanged by this branch
  Both the ❌ and "unchanged by this branch" become false the moment ④ actually edits
  `strip-text.py` on this branch.
- **`experiments/figure-text-translation/COMPOSE-FIDELITY.md:169`** — the fix-tracking table:
  > S strip | `strip-text.py` drops EVERY operator inside BT..ET, including fill colour … |
  > visible 1/34 … | keep non-text ops → 0 px differ on 18/18
  The middle clause ("drops EVERY operator") describes the pre-fix behaviour as present-tense
  fact; it becomes false once the fix lands (the last column already frames it as the pending
  fix, so this row is designed to be updated, not merely at risk of going stale).
- **`docs/plans/2026-07-21-post-item17-followup-campaign.md:1913`** — the §C140 item table row:
  > ④ | S — `strip-text.py` keeps non-text graphics-state ops inside BT..ET | combustion's 7
  > recoloured arrowheads; latent in 18/34 | variant: 0 px differ on 18/18 | open
  The `open` status must flip once ④ merges (per CLAUDE.md § One source of truth, this register is
  the ONE owner of open-work status — this is the row to edit, not a second copy).

**Would NOT need to change (already correctly frozen as historical evidence, per the
superseded-block convention `REGISTER.md` itself uses):** the earlier `⏩ RESUME` blocks at
`REGISTER.md:92` ("unchanged") and `:118` ("recolours artwork in 1/34; latent in 18/34") — both
sit under headers explicitly marked "(superseded by the block above)", so they are dated evidence
of what was true then, exactly like a frozen CLAUDE.md changelog block; nothing requires editing
them.

**Not asked for by name but load-bearing all the same:** `strip-text.py`'s own module and
function docstrings (`strip-text.py:1-21` "remove every BT..ET block"; `:154-175`'s `7 Tr`
paragraph) describe the current shipped behaviour and would need updating by whoever implements
④ — outside this task's scope (never edit `strip-text.py`), but worth naming since it is the
single most-quoted description of strip-text's behaviour by the very documents above (each of
REGISTER.md/COMPOSE-FIDELITY.md/the campaign register cites `strip-text.py`'s docstring directly
rather than restating the mechanism).

---

## Run log

No figure pipeline command was run. No `test_*.py` was run. Only `Read`, `Bash` (grep/sed/ls/cat,
no writes outside the scratchpad), and `codegraph_explore` (read-only) were used.
