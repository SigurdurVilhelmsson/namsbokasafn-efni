# Adversarial verification: sidecar lifecycle (claims C1–C8 from `1c-sidecar.md`)

Verifier, 2026-09-13. Read-only against the repo; `git status --porcelain` was empty before and after
every execution (checked after each stage: 0 lines). All artefacts: `scratchpad/verify-sl/`.

**Instruments, and how they differ from the producer's**
- `verify-sl/harness.mjs` drives the **real** `runFigures`, the **real** `publishFigureSvg` and the
  **real** `applyApprovedFigureEdits` (in-memory better-sqlite3, migration 050 applied, FK pragma = 1)
  against throwaway `books/` roots under the scratchpad, with a fake spawn shaped like
  `tools/__tests__/figure-run-paid.test.js`'s. The producer's C2 probe was a copied `isStale` plus an
  in-memory copy of the stamp logic. Results: `verify-sl/harness-results.json`.
- `verify-sl/recount.mjs` is a JS re-implementation of the C3 partition (the producer used Python).
  Results: `verify-sl/recount.json`.
- `figure-compose.py` was run for real, 3 arms, on copies of the FishLemon prep dir (`verify-sl/c7/`).
- `generate-image-mapping.js`'s real `generateImageMapping` was run on a scratch book, 2 arms (`verify-sl/c8.mjs`).
- Live fetch compared with **sha256** (the producer used sha1) over **3 of 3** all-identity figures plus FishLemon.
- The embedded rasters in the June SVG were decoded with PIL (`verify-sl/svgimages.py`, `june_census.py`).
  This is a structural check that needs no renderer; the producer used Chromium pixels.

---

## Verdicts

### C1: PARTIALLY TRUE. The mechanism is right. "B is only stable if `isStale` learns a new field" is REFUTED.

**Confirmed (harness S1).** Setup: a sidecar with `renderHash` and no `composedHash`, and a June-like
`media/FIG_A_IS.svg`. Run 1 gave `translated` with translate spawns 0, compose 1, publish yes. The media
file was replaced by the composed SVG. Afterwards `composedHash === renderHash` and `isStale` is false.
Run 2 gave `skipped-current` with prepare 0 and compose 0. Code path read: `figure-run.js:272`
(stale) → `:1340` (not skipped) → `:1005` (no buy) → `:1119` (compose) → `:1184` (publish).

**Refuted: "B only becomes a real, stable state if `isStale` learns a new field, which is option D".**
The producer tested a variant of B that the register did not propose. The register's option (commit
`4c0507cc`, the agenda's point ①) reads *"Write one → marked done … but it asserts a composition that
never happened, and `composedHash` is the publish-success marker"*. That is a sidecar **stamped at
mint**. Harness S2 plants `composedHash = renderHash` and `composedVersion = COMPOSER_VERSION`, with
**no compose ever run**:

| run | outcome | prepare / translate / compose | media file | verdict |
|---|---|---|---|---|
| bare #1 | skipped-current | 0 / 0 / 0 | `JUNE-COWORK` (untouched) | ok |
| bare #2 | skipped-current | 0 / 0 / 0 | untouched | ok |
| `--stale` | skipped-current | 0 / 0 / 0 | untouched | ok |

That is stable, and `isStale` needs **zero** code changes. The existing carry-forward also makes it
**hash-bound for free** (S2x, using the real service):
- Editor approves with the blocks unchanged: `state: approved`, `composedHash` is carried forward,
  `effectiveState` reads **`approved`**, `isStale` is false, and the next run is `skipped-current`
  with the never-composed June file still in place. So the lifecycle certifies an image that was never
  composed from these blocks.
- Editor edits `k0` and approves: `renderHash` moves, `composedHash` no longer equals it, `isStale` is
  true, and the next run gives `translated` with compose 1, translate 0, and `effectiveState`
  `approved` afterwards. That is the "turns non-identity → composes" behaviour the producer said D
  needed a new marker for.
- It collapses back into A on any `COMPOSER_VERSION` bump (because of the `composedVersion` check at
  `:274`) or on `--force` (`:1340`).
- ⚠️ **B′ is not free.** The DRIVER still has to produce it: detect all-identity after step 8, write
  the stamped sidecar, and return before step 9. The parts that need **zero** changes are `isStale`,
  `applyApprovedFigureEdits` and `effectiveState`.

### C2: CONFIRMED, by the real driver and publisher over the 34 real sidecars

- **The 34 real sidecars today:** `composedVersion === '1'` on 34, `composedHash === renderHash` on 34,
  re-hash under their own `composerVersion` matches on 34, `state` present on 0, `isStale` true on 0.
  `figure-run.js:274` is a plain string compare, so any bump makes 34 of 34 stale. A re-hash under
  `'2'` matches on 0 of 34, which does not matter because `:276` uses the sidecar's own
  `composerVersion`.
- **Simulated bump:** the same 34 sidecar objects with `composedVersion: '0'`. This is structurally
  identical at `:274`. It is the technique `figure-run-paid.test.js` itself uses. Fake prepare wrote
  each figure's **real** `scratchpad/prep/<b>/blocks.json`, so the drift guards ran against real keys.

| | result |
|---|---|
| run 1 `--stale` | selected 34, deselected 0, **translated 34**, failures 0 |
| translate / prepare / compose spawns | **0** / 34 / 34 |
| stale after | 0 / 34 |
| `renderHash`, `composerVersion`, `blocks` unchanged | 34 / 34 each |
| sidecar bytes after the restamp equal the committed file | 34 / 34 (the restamp is byte-neutral) |
| run 2 `--stale` | **skipped-current 34**, prepare 0, compose 0 |
| drift-guard control (one real send:true key removed from blocks.json) | `failed-compose`, compose 0 |

- **Caveats (they do not change the verdict):**
  - A real `COMPOSER_VERSION` constant change and a real compose were not exercised.
  - `--stale` still spawns `prepare` 34 times across two chapters (ch03 and ch04). FishLemon is
    `m68710`, which is in ch04.
  - `git ls-remote origin main` equals local HEAD (`4c0507cc`), so no prod-pushed sidecar `state`
    exists. Prod's unpushed tree was not inspected.

### C3: CONFIRMED, by a second implementation

- **Partition, by occurrence (JS):** **367 = 176 translated + 7 identity + 184 send:false**, with 0
  send:true blocks missing from their sidecar. Unique per figure: 162 / 7 / 105. Sidecar keys: 169.
  Key sets equal on 34 / 34.
- **The 14 duplicate translated occurrences, by name:** Neuron (exocytosis), `Divide by|molar mass`
  (empform), Reactant, Product and Coefficient (rxn2), four in flowchart (`Molar mass`,
  `Avogadro’s|number`, `Density`, `Molarity`), `Molar mass` in map2, map3 and map8, and
  `Molar|mass` / `Stoichiometric|factor` in combmap.
- **Identity:** exact `value === english` gives 7, and whitespace/pipe-normalised also gives 7. 0 of
  169 values contain `|`. No key is send:true in one occurrence and send:false in another (the
  cross-class list is empty).
- **The unit is the composer's own.** `compose.py` draws `FT.merge_blocks(FT.group(runs))`, not
  blocks.json. `len(compose-report.blocks) == len(blocks.json)` as multisets on 2 of 2 dirs that have
  a report (HClsoln 9 = 9, FishLemon 12 = 12). `figure-compose.py` `verify()` assertion 1 refuses any
  published figure where they differ, so "367 drawn" holds for every figure that published.
- **Framing caveat.** "Re-laid for no gain" is **forced**, not chosen: `strip-text.py` removes every
  BT..ET object, so every send:false label must be redrawn or it is erased. Also, 116 of the 184
  send:false occurrences are single characters (128 have ≤2 characters: C, H, +, ×, =). The
  flattening and whitespace-collapse defects (M1, M2) cannot occur inside a single glyph, so 191 is
  the count of re-laid English, not the count of damaged labels.

### C4: CONFIRMED, with a correction to its hedge

- **Live bytes, sha256 (first 16 hex):**

| figure | live | `9269fcda` (June) | `05-publication` | `media/` HEAD |
|---|---|---|---|---|
| basehyd | 37d3055badab5652 | same | same | fc7dfedf… (differs) |
| HClsoln | 8d0ec62acb197880 | same | same | 0289337f… (differs) |
| GreenChem (the producer had not fetched it) | 0f6ab8b0f71c0e13 | same | same | abf81f87… (differs) |
| FishLemon | live = `05-publication` (the `34402e8a` vintage) | | | differs |
| `NONSENSE_qq_IS.svg` (control) | **404**, 162 bytes | | | |

  The HEAD column differing is what shows the instrument can tell the two vintages apart.
- **The broken artwork is FILE-INTRINSIC, not a Chromium quirk.** Decoding the June HClsoln's embedded
  rasters:
  - **17 of 27** `<image>` elements carry a **44×42-pixel** payload (6 distinct payloads) in elements
    declared as large as **467×739, 438×721, 178×186 and 90×73**. So a single molecule sprite is
    stretched across the flasks, which matches the "large blurred red/white blobs" in
    `1c/render/…stack.png` (looked at).
  - Controls: the new composed HClsoln has **0 of 62** mismatches, and so does our own `artwork.svg`.
    June GreenChem's single photo is 1600×1416 in a 432×382 box, which is the same aspect (a legitimate
    hi-res photo).
  - Every engine that honours `width`/`height` will draw the blobs. The producer's "Chromium only,
    other browsers unverified" hedge is on the wrong axis. The defect is in the live bytes.

### C5: CONFIRMED

- **Search:** `grep -a` over 367 tracked non-test `.js`, `.cjs`, `.mjs` and `.py` files, excluding
  `books/`, `__tests__/`, `e2e/` and `test_*`.
- **Result:** 0 reads of a sidecar's `version` or `basename` (property access, subscript, `.get`, or
  destructuring from `sidecar`/`readSidecar`/`existing`). The one `['basename']` hit is
  `figure-prepare.py:483`, which reads `prepare.json`, not a sidecar. All 26 `.version` hits are
  unrelated (package.json, segment history, remt checks, source manifest).
- **Positive control:** the same shape finds 8 `renderHash` reads.
- **vefur:** 0 references to `is.json`, `figure-text`, `renderHash`, `composedHash` or
  `figure-review` in `src/`, `scripts/` or `static/styles/`. Control: the same grep finds
  `published-books` in vefur `scripts/`.
- **Nuance:** `withComposedStamp` (`publish-figure-svg.js:93-107`) iterates every key. It CARRIES
  `version` and `basename`; it does not read them.

### C6: CONFIRMED by executing the real function. Its implication for D is weakened by C1's refutation.

- **Execution:** a planted `identityKeptHash` key was run through the real `applyApprovedFigureEdits`
  (via `ensureFigureRow` → `setState` → apply, as `segment-editor.js:763-834` does). The key was
  **erased on approve and erased on flag**. Keys after:
  `version, basename, state, renderHash, composedHash, composedVersion, composerVersion, blocks`.
- **Asymmetry control:** the real publisher, given the same marker, **preserves** it
  (`markerSurvived: true`, stamp written).
- **Reading:** the literal at `figureReviewService.js:311-340` has no spread.
- **But** "D needs a hash-bound marker that this function carries forward" is already met by
  `composedHash` (`:300, :334`). See C1 (the B′ variant). A new field is only needed if the operator
  refuses to let `composedHash` assert a publish that never happened.

### C7: CONFIRMED, 3 arms executed on copies of the FishLemon prep dir

| arm | `--translations` | blocks.json | result |
|---|---|---|---|
| full (control) | committed sidecar, 6 keys | as prepared | exit 0, `compose.json.outputPath` |
| pruned | minus `CH3COOH`, `CH3COO–` | as prepared | **exit 1**, `error` names both keys, `translated.svg` removed |
| held-back (discriminator) | the same pruned sidecar | those 2 keys flipped to `send:false` | exit 0, `outputPath` |

- **What the arms show:** the refusal is keyed on "send:true with no sidecar entry" (assertion 2),
  not on a key having been dropped.
- **Why it only surfaces at compose:** `applyPartialDriftGuard` checks only `extra`
  (`figure-run.js:861-862`). The dropped keys are `missing`, so the refusal comes after a composer
  spawn.
- ⚠️ **The refusal text tells the operator** *"this file carries no `state`, so deleting it discards
  no editorial decision"*. Following that advice makes the figure buyable again, which is option C
  (re-buy and re-damage).

### C8: PARTIALLY TRUE. The re-derivation half is confirmed. The "otherwise a 404" half is false for these figures.

- **Executed** `generateImageMapping({chapter: '4', dryRun: true})` on a scratch book (ch04 CNXML
  copies plus the real mapping minus the basehyd row):
  - With the `_IS.svg` present: 1 entry, **row re-derived**, 691 merged.
  - No-file control: 0 entries, not re-derived, 690 merged.
  - The dry run wrote nothing.
  - The real mapping has 0 rows lacking `originalImage`, so the `mergeMapping` collapse hazard is not
    live for this book.
- **Nuance:** `generate-image-mapping.js` has **no automated caller** (grep over `scripts/`,
  `server/`, `tools/`, `.github/` and `package.json`). A row comes back only if a human runs it.
- **Refuted: "a row pointing at a missing file puts a 404 on the page".** That is not what happens for
  an **already-published** figure:
  - `cnxml-render.js` `copyChapterImages` (`:2229-2296`) only prints
    `Warning: Referenced image not found in source` when the file is absent.
  - The pre-render sweep (`:3497-3508`) deletes only `.html` files and `isPublicationArtifact` matches
    (`:85-87`). It never touches `images/media/`.
  - `05-publication/mt-preview/chapters/04/images/media/<b>_IS.svg` exists (June bytes) for all 4
    figures.
  - So the re-rendered HTML still references `<b>_IS.svg`, and the **stale June copy keeps being
    published silently**.
  - A 404 happens only for a figure that was never rendered before, which is the case the
    `figure-run.js:772-775` docstring describes (a freshly minted row). vefur's sync behaviour was not
    re-verified.

---

## New problems

1. **B′, the sidecar stamped at mint, is a stable realisation of the register's "write one"** with no
   `isStale` change. Three consequences:
   - It is hash-bound through the existing `composedHash` carry-forward.
   - It makes `effectiveState` report **approved** for an SVG never composed from those blocks.
   - A `COMPOSER_VERSION` bump or `--force` silently turns it back into A. The producer's option
     analysis omits it.
2. **The June HClsoln artwork corruption is in the live bytes**: raster payloads mis-assigned inside
   the file. A census of the 700 published mt-preview `_IS.svg` files found 206 with embedded rasters,
   of which **8** have an aspect-mismatched raster. They are in ch01, 04, 05, 06, 08 (×2), 09 and 10.
   Only HClsoln is visually confirmed; the other 7 are candidates. Positive control: HClsoln hits.
   Negative control: the new composed file, 0 of 62. Restoring June (D1) re-ships this.
3. **Removing a translated file without its row does not 404; it freezes the old published copy**,
   because render never sweeps `images/media/`. That is silent staleness, the opposite of what the
   driver docstring predicts for this case.
4. **The reader badge exists only in `renderFigure`** (`cnxml-render.js:1134-1169`; `figureReviewAttr`
   is used once, at `:1166`). A quote-aware ancestor walk puts basehyd's image under
   `exercise > problem > media`, not `<figure>`, so basehyd never gets `data-figure-review` even with
   a sidecar. `renderFigure` is referenced only as the `figure:` handler (`:1065, :1437, :1606,
   :1689, :1960`). `<media>` goes through `renderMedia` (`:1256`), which has no sidecar or badge code.
   Control: HClsoln and GreenChem are under `figure`. The producer's "any figure with a
   sidecar gets `data-figure-review`" over-generalises. It is inert for readers today anyway.
5. **`figure-compose.py`'s missing-key refusal advises deleting the sidecar** "discards no editorial
   decision". For a pruned identity sidecar, that advice leads to re-buying and re-damaging the figure.
6. **Selective stripping is an unconsidered option.** `strip-text.py` removes every BT..ET, which is
   what forces every untouched label to be redrawn. Keeping untouched text objects in the artwork is
   an alternative to option E's redraw from runs. Named only, not designed.
7. **Instrument note.** A non-quote-aware ancestor regex first reported HClsoln as NOT inside
   `<figure>`. The quote-aware walk corrected it. This is CLAUDE.md's raw-`>`-in-attribute trap,
   observed live on `m68710`.
