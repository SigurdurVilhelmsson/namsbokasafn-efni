# 1c — The sidecar question, from the code

Agent 1c, 2026-09-13. Read-only against the repo. Everything below is either a file:line citation or a
measurement with its denominator and control. Scratch artefacts: `scratchpad/1c/` (renders in `1c/render/`,
the staleness probe in `1c/bump/probe.mjs`).

## 0. Headline

1. **The register's option B ("write a sidecar but don't compose → marked done") does not exist in the
   code.** A sidecar with `renderHash` and no `composedHash` is STALE (`tools/figure-run.js:272`), so the next
   run re-prepares it, skips the purchase (`:1005`) and composes + publishes it (`:1118-1203`). B turns into A
   (status quo) on the very next run. B only becomes a real, stable state if `isStale` learns a new field,
   which is option D.
2. **The 7 identity blocks are a small part of the damage. The 184 `send:false` blocks are most of it.**
   Re-measured by occurrence (the unit the composer draws), over the 34 bought figures: **367 drawn = 176
   translated + 7 sent-and-identical + 184 `send:false`**. So 191 of 367 (52.0%) of drawn blocks are English
   re-laid for no gain, not 205. The brief's "198 never sent / 162 translated" mixes two units: 162 is
   *unique* translated keys, and 367 − 162 − 7 = 198 counts the 14 duplicate occurrences of translated keys as
   "never sent". By unique key per figure: 162 / 7 / 105 = 274. Key sets: prepared `send:true` keys == sidecar
   keys on 34 of 34 figures.
   ▶ Every translated figure has the same defect (the re-laying of `send:false` English), so "should an
   all-identity figure be composed?" matters much less once the composer draws untouched blocks exactly as
   the source does (option E).
3. **A composer version bump is the free repair route, and I ran it (option E's rollout).** Real `isStale`
   says 0 of 34 sidecars are stale. With `COMPOSER_VERSION` bumped to `'2'` (a scratch copy of the module),
   34 of 34 are stale. After the publisher's stamp logic runs, 0 of 34 are stale, and `renderHash` and
   `composerVersion` are unchanged on 34 of 34. `--stale` can never spawn the MT. **0 of 34 sidecars carry a
   `state`, so no editorial ruling is at risk.**
4. **The "original image" is not one thing, and one candidate is already broken on the live site.** For the
   3 all-identity figures, readers are served the **June Cowork `_IS.svg`**. I fetched it live: bytes match
   `9269fcda`, and a nonsense URL returns 404 as the control. The OpenStax JPG is not what they get. The June
   `CNX_Chem_04_02_HClsoln_IS.svg` has intact text but **broken artwork**: large blurred red and white
   molecule blobs across both flasks, and the green Cl spheres are missing. The new composed SVG has intact
   artwork but damaged text. Only the OpenStax JPG is both correct and complete for that figure. The broken
   artwork is seen in Chromium, the only engine installed here, so it is unverified in other browsers.

---

## 1. What a sidecar asserts, field by field, and who reads each field

Real shape, identical on 34 of 34 files: `{version, basename, renderHash, composedHash, composedVersion,
composerVersion, blocks}`. **No `state` on any of the 34** (checked by parsing all 34).

| Field | Asserts | Writers | Readers (non-test) |
|---|---|---|---|
| **the FILE existing** | "this figure has been bought, never spend on it again" (R8) and "this is a translated figure" | `writeSidecar` `figure-text-sidecar.cjs:50-56`, called at `figure-run.js:1069` and `figureReviewService.js:341` | spend gate `figure-run.js:1005`; `applySidecarGuard` `:963-976` (an unreadable file is not treated as absent); `--stale` selection `:1331`; review list skips figures with no sidecar `segment-editor.js:612`, `resolveFigure` `figureReviewService.js:235-236`; render badge only when a sidecar exists `cnxml-render.js:1165` |
| `version` | sidecar schema 1 | `figure-run.js:1058`, `figureReviewService.js:312` | **none**. A grep for `.version` reads across every sidecar consumer finds only segment-history code. Control: the same grep pattern on `renderHash` does hit |
| `basename` | figure identity | `figure-run.js:1059`, `figureReviewService.js:313` | **none**. Identity always comes from the PATH (`parseSidecarPath` `publish-figure-svg.js:45-53`, `sidecarPath` `sidecar.cjs:32-34`) |
| `blocks` | EN block key → IS value (MT output, overlaid with editor edits after an approve or flag) | mint `figure-run.js:1062`; approve/flag `figureReviewService.js:339` | composer via `--translations` = the sidecar file (`figure-run.js:1126-1127` → `compose.py:39`); `figure-compose.py:167`; `isStale` re-hash `figure-run.js:276`; `editorialState` `sidecar.cjs:83`; render badge `cnxml-render.js:1167`; `resolveBlocks` `figureReviewService.js:123-137`; block-edit key whitelist `segment-editor.js:738`; drift guards `figure-run.js:803, 861`; empty-sidecar guard `:1095` |
| `renderHash` | sha256(composerVersion + sorted blocks), truncated to 16 hex (`sidecar.cjs:58-68`): "these exact blocks, under composer version X" | mint `figure-run.js:1060`; approve/flag `figureReviewService.js:328` (re-computed under CURRENT version) | `isStale` `figure-run.js:272-276`; `editorialState` `sidecar.cjs:84`; `effectiveState` `:114`; publisher copies it into `composedHash` `publish-figure-svg.js:271` and checks the compose vintage `:194`; driver passes `expectedRenderHash` `figure-run.js:1190` |
| `composerVersion` | which composer version `renderHash` was computed under | mint `:1061`; approve `figureReviewService.js:338` | **only** `isStale`'s block re-hash `figure-run.js:276`. `editorialState` deliberately uses the CURRENT version instead |
| `composedHash` | **"`media/<outputName>` was copied from an SVG composed from the blocks with this renderHash."** It is the publish-success marker (`figure-run.js:239-242`) | **only** the publisher, on a successful copy (`publish-figure-svg.js:253-277`). `applyApprovedFigureEdits` carries it forward and never invents it (`figureReviewService.js:300, 334`) | `isStale` `figure-run.js:272-273`; `effectiveState` `sidecar.cjs:114` (the reader/editor "approved" state requires it); `getFigure` via `resolveFigure` `figureReviewService.js:238`; publisher write guard `publish-figure-svg.js:274` |
| `composedVersion` | which composer version drew the published SVG | publisher only, `publish-figure-svg.js:276`; carried forward by approve `figureReviewService.js:307, 337` | `isStale` `figure-run.js:274`; publisher write guard `publish-figure-svg.js:274` |
| `state` (absent ×34) | an editor ruled (`approved`/`flagged`) | `applyApprovedFigureEdits` writes `editorialState` on approve **and** flag (`figureReviewService.js:327`; route `segment-editor.js:763-834`) | `editorialState` `sidecar.cjs:80-82`; `figure-compose.py:176-178` (only changes the wording of the "delete the sidecar" advice) |

**What a sidecar does NOT assert: which image a reader gets.** That is decided by `media/image-mapping.json`
(`applyImageBasenameSwaps` `cnxml-inject.js:1178-1202`, reading `loadImageBasenameMap`
`image-basename-map.cjs:34-42`) plus whichever file is sitting in `media/`. The swap never checks that the
target file exists (`figure-run.js:772-775`). Nothing anywhere hashes the media file against `composedHash`
(grep over all `composedHash` readers above). So `composedHash` is a claim about the past that nothing
re-verifies.

**No mapping row is needed from this run.** Commit `f6069bb9` touched 66 files (33 sidecars + 33 SVGs; the
flowchart sidecar came from an earlier commit) and **did not touch `image-mapping.json`**, which has 691 rows
from June. All 34 figures were `mapped`, not `mintable`.

---

## 2. The option space for an all-identity figure

Shared facts behind every row:
- **Identity is only knowable AFTER purchase.** `looks_verbatim` (`figtext.py:84-93`) treats any run of 3+
  letters as prose, so `NaOH`, `HCl`, `COOH` and `Raney` all pass `sendable` (`:166-169`) and get bought.
- **The MT is sent `b.english`** (`translate-blocks.mjs:431`) and stored under `b.key` (`:443`). 0 of 169 IS
  values contain `|`, while 92 of 169 keys do. I counted identity three ways: exact `value==key`,
  `value==key with | → space`, and `value==english` whitespace-normalised against `blocks.json`. **All three
  give 7.** No multi-line identity block is hidden.
- **Re-buy cost ≈ 0.01 ISK/char** (`translate-blocks.mjs:16`: 238 chars = 2.38 ISK). Sent chars:
  basehyd 4 (≈0.04 ISK), GreenChem 12 (≈0.12), HClsoln 73 (≈0.73, including 20 billed spaces). Whether there
  is a per-request minimum charge is **unverified**.
- **Reader badge:** any figure with a sidecar gets `data-figure-review="mt-preview"` until it is approved AND
  composed (`cnxml-render.js:1148-1169`, `figureReviewAttr` `:403-405`). **vefur does not style it:**
  `static/styles/content.css` has 0 matches for `figure-review`, while the control class `scaled-down` (seen
  in the published HTML) has 1. A grep of vefur `src/` also returns 0, but that null is uncontrolled: the
  control class matched 0 files there too. So the badge is very probably inert for readers today.
- **Every card claim below depends on the figure being reviewable.** It is, for all 4: `listStructureFigures`
  over `02-structure/ch04/*.json` (current files, not backups) carries basehyd (`m68709`, via `media`),
  HClsoln and FishLemon (`m68710`, via `figure`) and GreenChem (`m68714`, via `figure`). Control: `flowchart`
  is found too (`m68713`, `figure`), and 30 basenames are found chapter-wide.
- **What the editor sees for an identity block:** `<code>key</code>` next to an input whose value equals the
  key (`public/js/segment-editor.js:588-603`). Nothing marks it as identity. The badge reads `MT-PREVIEW`
  (`:684`). The image is whatever file the mapping row points at, if it exists (`translatedImageFor`
  `figureReviewService.js:101-107`). The block is **editable** (its key is in `mtBlocks`, so the save
  succeeds, `segment-editor.js:738`) and the figure can be approved. **Blocks that were never sent are not on
  the card at all**, because the card lists only sidecar keys, so an editor cannot correct them.

### A — Status quo: sidecar + compose + publish
- **Code changes:** none.
- **Invariants:** all hold. `composedHash == renderHash`, `skipped-current` from then on.
- **Editor sees:** a card with identity blocks and the **damaged new SVG**. Approving is immediately
  `approved`, because the blocks are unchanged and `composedHash` matches. **So an approval certifies damaged
  artwork**, and the approval flow cannot see formatting damage any more than the value checks could.
- **Reader** (after re-inject + render + sync): the damaged SVG. §5 has what is wrong with each.
- **ISK:** paid once (done). **Risk:** reader-visible regression versus June for basehyd and GreenChem.

### B — Sidecar written, no compose, no publish
- **As the register framed it, B is not a stable state.** The sidecar would have `renderHash` and no
  `composedHash`, so `isStale` returns true (`figure-run.js:272`). The next run does not skip it (`:1340`);
  it prepares, classifies `translated`, and in `processFigureLive` finds `rec.sidecar`, so it does not buy
  (`:1005`) but does compose (`:1119`) and publish (`:1184`). **After one run you are in A.** It does not loop;
  it converges on A.
- While in B for that one run: the editor card shows the June `_IS.svg`, which was never composed from this
  sidecar, and the badge is MT-PREVIEW. **Approving can never reach `approved`**: `effectiveState` requires
  `composedHash` (`sidecar.cjs:114`), and no publish will ever stamp it until the driver composes, which puts
  you back in A.
- `--stale` selects it and recomposes it. The `verdict` never reports it, because it simply becomes
  `translated` again next run.

### C — No sidecar (discard the identity purchase)
- **Code changes:** after step 8 (`figure-run.js:1073-1087`), detect "all values == english", skip
  `writeSidecar`, and give it a **new outcome**. `tallyOutcome` throws on anything outside the closed
  vocabulary (`figure-outcomes.js:90-108`), and the vocabulary is pinned by
  `tools/__tests__/figure-outcomes.test.js` (`:47` asserts the tally keys equal `ALL_OUTCOMES`).
- **Invariants that break:** step 7, "record the purchase ahead of everything that can fail"
  (`figure-run.js:20-33, 1056-1071`), is deliberately abandoned for this case. **It re-buys on every
  chapter-wide run**, because the spend gate is "no sidecar file". The report's "MT spawned for N figure(s)"
  line (`:1813`) grows each run. The MT is not deterministic, so a later purchase could come back
  non-identity and silently become a translated figure.
- **Editor sees:** nothing. No sidecar means no card (`segment-editor.js:612`), so nobody can choose to
  localise `H2, Raney Ni`.
- **Reader sees:** the current `media/<b>_IS.svg`. Today that is the damaged new file unless it is
  git-restored; if restored, the June file. The OpenStax JPG only if the mapping row AND the file are removed
  (see D2). No badge.
- **ISK:** ≈0.04–0.73 per figure per run, indefinitely. **Risk:** low money, but the code is permanently
  shaped around an "unrecorded purchase", which is the class this driver was built to close.

### D — Sidecar recorded with a distinct disposition; the reader keeps an "original"
First say WHICH original, because the options differ:
- **D1, June `_IS.svg`:** `git checkout 9269fcda -- books/efnafraedi-2e/media/<b>_IS.svg`
  (`publish-figure-svg.js:22-27` names git as the restore). The mapping row stays. **Bad for HClsoln** (§5).
- **D2, OpenStax JPG:** remove the mapping row **and** delete the `_IS.svg`. Two traps if only one is done:
  a row pointing at a missing file is a 404 on the page (`figure-run.js:772-775`), and `generate-image-mapping.js`
  **rebuilds rows from whatever `_IS` files are in `media/`** (`generate-image-mapping.js:188-203`), so a
  leftover file brings the swap back. Also, once the row is gone the driver's pre-flight reads `mintable` and
  would re-mint the row if it ever composed again (`figure-run.js:1166-1168`).
  **Order matters.** Neither change reaches readers until re-inject + render + sync. Until then
  `05-publication/…/images/media/` and vefur keep the June bytes (hashed in §5). So make the row removal and
  the file deletion together, in one change, followed by that cycle. Deleting the file alone in a tree that
  is then rendered would leave a row pointing at nothing: a 404.

What has to change for D:
- a new outcome, e.g. `identity-kept`, in `PROCESS_OUTCOMES` as a NOTE, not in `FAILED`
  (`figure-outcomes.js:36-63`), plus its tests;
- `processFigureLive` returns after step 8 with a disposition marker;
- **`isStale` must treat that marker as current** (otherwise → B → A);
- the marker must be **hash-bound** (e.g. `keptHash === renderHash`), so that an editor turning a block
  non-identity makes the figure stale and it composes;
- **`applyApprovedFigureEdits` must carry the marker forward.** It rebuilds the sidecar from an explicit
  literal (`figureReviewService.js:311-340`) that carries only `composedHash`/`composedVersion`. Without that,
  the first flag or approve **erases the marker**, and the next run composes and publishes the figure
  (A, silently). This is the same trap already recorded for `composedVersion` (`:301-307`);
- `effectiveState` must accept the marker as the "published" leg, or an approved identity figure stays
  MT-PREVIEW for ever (`sidecar.cjs:111-117`);
- `--force` has to decide whether it overrides the disposition (today it only suppresses the skip,
  `figure-run.js:1337-1344`).

Pinning suites to update: `figure-outcomes.test.js`, `figure-run-free.test.js`, `figure-run-paid.test.js`,
`figure-text-sidecar.test.js`, `publish-figure-svg.test.js`, `server/__tests__/figureReviewService.test.js`,
`figureReviewRoutes.test.js`, `figure-review-render.test.js`. These are the files grep found for
`ALL_OUTCOMES`, `skipped-current`, `isStale`, `composedHash`, `effectiveState` or `composedVersion`.

- **Editor sees:** the card, MT-PREVIEW; under D1 the June image, under D2 no image.
- **Reader sees:** June (D1) or the JPG (D2), badged mt-preview (inert).
- **ISK:** 0 more. **Risk:** the most code and the most cross-file invariants of any option. Each clause
  above is a place the marker can be dropped silently.

### E — Status quo lifecycle, with a faithful composer
- **Code changes:** `compose.py` draws **untouched** blocks from their source runs instead of re-laying
  them. Untouched means `send:false` (not in `TR`) plus blocks whose value equals `english`. That means each
  run's own x, y, size and font, italics included. Today `setfont` never sets a slant (`compose.py:54-58`),
  the line is flattened at `:147`, whitespace is collapsed at `:252`, and `svgout.py` embeds only Regular and
  Bold (M1). Then bump `COMPOSER_VERSION` (`sidecar.cjs:25`).
- **Invariants that must hold:**
  - `figure-compose.py`'s two multiset assertions (`:242-255`) still need every block in `report.blocks`,
    with `send:false` blocks in `missing` and identity blocks in `translated`. A run-exact draw path must
    keep appending to those lists exactly as it does today.
  - **Block keys must not move.** `block_key` is built from `FT.lines` (`blockkey.py`, `block_lines`). A fix
    to `lines()`/`group()` (M3) changes keys, and a changed key trips the drift guards
    (`figure-run.js:849-922`) and forces a re-buy. Before shipping, re-prepare the 34 with the new code and
    diff key sets against the sidecars (free).
  - The `value == english` predicate is **not** the forbidden "compare two translated strings"
    (CLAUDE.md, inject rule): it compares an editable IS value against English read from source artwork.
    Its failure mode is harmless: an editor edit makes a block non-identity, and it is then drawn as a
    translation, which is correct.
- **Editor sees:** the same card, with an image identical to the source for identity blocks. They can still
  localise a label.
- **Reader sees:** the artwork with source-exact English/formula labels.
- **ISK:** 0. The bump plus `figure-run --stale` recomposes all 34 without spending (§4).
- **Risk:** it is unbuilt, so "identity output ≈ source" is a claim until measured. The instrument exists:
  `compose.py --control` + `pdftocairo -r 200` + a pixel diff. Also the `lines()` key-movement hazard above.
- **E also fixes the 184 `send:false` occurrences in ALL 34 figures**, which no figure-level option touches.

### (Side lever) F — hold formulas back before purchase
Tighten `looks_verbatim`. It saves ≈1 ISK across the corpus but risks holding real prose (a false negative
in the spend gate). **On the 34 existing sidecars it changes `send` flags, and the guards refuse:**
- the 3 all-identity figures go to `copied-*`, `applyDriftGuard` fires, and they become `failed-compose`
  (`figure-run.js:802-817`);
- FishLemon's two keys become held back, and `applyPartialDriftGuard` refuses them. The documented remedy
  (prune the keys) leaves `renderHash` stale, so the figure recomposes on every run until an editor
  re-approves (`:875-887`).

Useful for future chapters, disruptive for bought ones.

---

## 3. Partial identity (CNX_Chem_14_03_FishLemon: 2 of 6 sent identical, `CH3COOH`, `CH3COO–`)

- **B, C and D do not apply.** They are figure-level, and 4 real translations (`Ediksýra`, `Asetatjón`,
  `Pútresín`, `Pútreskínjón`) have to be composed.
- **Block-level "drop identity keys from the sidecar" is not viable as the code stands.** The dropped keys
  are `send:true`, so `compose.py` would put them in `missing`, and `figure-compose.py` assertion 2
  (`:253-255`, `missing` must equal the `send:false` keys) refuses the figure. The partial-drift guard only
  checks `extra` (`figure-run.js:861-862`), so the failure lands after a composer spawn.
- **A (status quo):** identity blocks are re-laid like any translation, losing the ⁻ superscript and
  subscripts. Its 6 `send:false` blocks are re-laid too, and one of them is M3's `NH3|+CH2CH2CH2CH2NH2`
  split.
- **E is the only option that fixes FishLemon.** At draw time, identity and never-sent blocks become the same
  thing: untouched, drawn from source runs.
- **F** makes it a held-back refusal (see above).

---

## 4. Composer version bump → 34 stale → `--stale` recompose at 0 ISK: VERIFIED BY EXECUTION

Probe `scratchpad/1c/bump/probe.mjs`. It imports the real `isStale`, a verbatim copy of `isStale` bound to a
scratch copy of `figure-text-sidecar.cjs` with `COMPOSER_VERSION = '2'`, and an in-memory copy of the
publisher's stamp logic. It reads the 34 committed sidecars and writes nothing.

| Measure | Result /34 |
|---|---|
| stale now (real module) | **0** |
| stale after bump | **34** |
| stale after the publisher's stamp (`composedVersion → '2'`) | **0**: it settles after one recompose |
| `renderHash` and `composerVersion` unchanged by the stamp | **34** |
| sidecars with a `state` key | **0** |
| `editorialState` now / after bump | mt-preview ×34 / mt-preview ×34 |

Controls:
- A synthetic `state:'approved'` copy of a real sidecar reads `approved` under v1 and **`mt-preview` under
  v2**, so the demotion the docstring promises is real and the probe can see it.
- A sidecar with one extra block reads stale.

From the code:
- **No spend path.** `--stale` selects only figures with a sidecar file (`figure-run.js:1331`). An unreadable
  one is already `failed-sidecar` (`:963-976`, `:1319`) and never reaches the loop. The ONLY translate spawn
  is inside `if (!rec.sidecar)` (`:1005-1030`).
- **Settling.** The publisher writes the stamp because `composedVersion !== COMPOSER_VERSION`
  (`publish-figure-svg.js:271-277`). `isStale` re-hashes blocks under the sidecar's OWN `composerVersion`
  (`figure-run.js:276`), so it does not loop.
- **Approvals.** None exist in any sidecar. The local dev `pipeline-output/sessions.db` **has no
  `figure_review` or `figure_block_edit` table at all**: migration `050-figure-review.js` has not been
  applied there. The control query `registered_books` returns 5 rows, so the connection works. **Prod DB not
  inspected.** A prod `figure_block_edit` row would not be in any sidecar yet; if an approval existed,
  `getFigure` re-hashes under the new version too (`figureReviewService.js:172-173`), so both layers demote
  and one re-approval clears it.
- **Operator caveat.** Run **`--stale`**, not a bare run. A bare run also recomposes the 34, but would BUY
  any figure in the chapter that has no sidecar (for example after a read-layer change moved one into
  `translated`). The prepare-time drift guards still run under `--stale`, so a composer fix that moved keys
  is refused there rather than drawn wrong.

---

## 5. June vs new vs source: rendered and looked at (nothing reached a reader from this run)

**Instruments:**
- Source: `pdftocairo -png -r 200 -singlefile` on the staged PDF.
- SVGs: `render-check.mjs` (Chromium, inside `<img>`), each at the pixel size of the 200-dpi source raster.
  Every SVG's viewBox has the same aspect as its source except June basehyd, whose viewBox is 468×53.83
  against the source's 468×51, so it was rendered at its own 1300×150.
- A timing control: June HClsoln re-rendered with a 4000 ms wait instead of 500 ms, mean abs diff **0.000**.
- **No second SVG renderer exists on this box** (no rsvg-convert, inkscape or ImageMagick), so the June
  HClsoln artwork defect is measured in Chromium only. That is the readers' engine, but not all of them.

**Where readers are:**
- The committed `05-publication/mt-preview/chapters/04/images/media/<b>_IS.svg` has the June sha for all 4
  (basehyd `a349654c76`, HClsoln `9838e86860`, GreenChem `42a12463b1`; FishLemon `7ceac222ca` from
  `34402e8a`).
- vefur's local synced tree has the same shas.
- **Live `namsbokasafn.is`** serves HClsoln 299,657 bytes sha `9838e86860` and basehyd 97,072 bytes sha
  `a349654c76`. The control, `NONSENSE_zz_IS.svg`, returns **404**, 162 bytes. So pupils see June today, and
  the new SVGs are only in `media/`.

| Figure | Source raster | June `_IS.svg` (live) | New composed `_IS.svg` (`f6069bb9`) | Closest to source |
|---|---|---|---|---|
| **CNX_Chem_04_01_basehyd_img** | `O⁻`, `Na⁺` superscript | superscripts correct. The file has 28 `<text>`, with `Na`/`+` and `O`/`–` as separate elements (run-exact). The viewBox is 2.8 pt taller than the source; not visible | **`O–` and `Na+` flattened onto the baseline at full size.** `Na+` now reads like one more reaction "+". 26 `<text>`, one per block | **June** |
| **CNX_Chem_04_04_GreenChem** | `(CH₃CO)₂O`, `H₂, Raney Ni` | subscripts correct. Photo re-encoded (mean abs 3.5 against source at best offset 0,0; not visible) | **`(CH3CO)2O` and `H2, Raney Ni` flattened.** Of those, only `H2, Raney Ni` was ever sent; `(CH3CO)2O` is a `send:false` block re-laid. Photo about 1 px offset (best dx,dy = 1,−1); not visible | **June** |
| **CNX_Chem_04_02_HClsoln** (extra; the most damaged) | italic `g`/`l`/`aq`, `H₂O`, `H₃O⁺`, `Cl⁻` | **text perfect (italics, sub/superscripts), ARTWORK BROKEN: large blurred red/white molecule blobs across both flasks, the (a) gas-phase HCl molecules and the (b) green Cl⁻ spheres missing.** Whole-image mean abs diff against source **15.96** | artwork intact, **text damaged:** `HCl(g)→HCl(aq)` and `H2O(l)→H3O+…` are drawn over the arrows (M2); every sub/superscript flattened; italics lost; right-edge `H3O+(aq` clipped. Whole-image mean abs **5.33** | **Neither.** Only the OpenStax JPG is both correct and complete |

Evidence images:
- `scratchpad/1c/render/CNX_Chem_04_01_basehyd_img.stack-right.png` (source / June / new, 2× crop)
- `…/CNX_Chem_04_04_GreenChem.stack-text.png` and `.stack-photo.png`
- `…/CNX_Chem_04_02_HClsoln.stack.png`

⚠️ The HClsoln row changes the D1 analysis: **restoring June re-ships a figure whose artwork is visibly
broken, and it is already live.**

---

## 6. Recommendation, as options for [USER] (not a decision)

**The question mostly dissolves, as suspected, but not fully, and it moves.** Composing an identity figure
damages it only because the composer re-lays English it could draw exactly. The same mechanism re-lays
184 of 367 drawn blocks in every bought figure. So the decision that governs damage is **whether to build E**,
not what to do about sidecars.

1. **E, then recompose (recommended to evaluate first).**
   - Keeps the one lifecycle invariant the whole driver and review UI are built on: file present means
     bought, and `composedHash` means published from these blocks.
   - Costs 0 ISK to repair all 34, via the bump plus `--stale` (verified §4).
   - Fixes FishLemon and every `send:false` block, and would also replace the live broken June HClsoln
     artwork with an intact one.
   - Before it ships: prove identity output ≈ source with `--control` + pixel diff against the 200-dpi
     source raster, and prove block keys don't move (prepare + key diff over the 34; free).
   - Trade-off: engineering time, and figure buying stays stopped until it is done.
2. **Interim, if E will take a while: don't sync ch04 figures.** Readers already have June, and nothing from
   this run has reached them. The damaged new files sit in `media/` and only reach readers through
   re-inject + render + sync. The sidecars can stay as they are: they will go stale and recompose for free
   when E lands.
   - Trade-off: HClsoln stays live in its June version, which **renders with broken artwork in Chromium**.
     Chromium is the only engine tested; Playwright here has no Firefox or WebKit, so other browsers are
     unverified.
   - If that is not acceptable, the only correct image for it now is the OpenStax JPG. That means D2 for one
     figure: remove the row **and** the file, or `generate-image-mapping.js` brings it back. It is a hand
     edit outside the pipeline tools, so it needs [USER]'s explicit go-ahead under CLAUDE.md's
     documented-tools rule.
3. **D (identity disposition, keep an original)** only if [USER] wants identity figures never composed even
   with a faithful composer.
   - Real cost: a new outcome, a hash-bound marker in `isStale`, `applyApprovedFigureEdits` carrying it,
     `effectiveState` accepting it, a `--force` policy, and a mapping/file policy. Each is a place the marker
     can be dropped silently, and most tests in §2-D need updating.
   - It gains little over E, where identity output already looks like the source.
4. **Not recommended:**
   - **B** is not a state; it becomes A in one run.
   - **C** re-buys on every run, abandons "record every purchase", hides the figure from editors, and still
     needs a new outcome.
   - **F** alone does not repair the 34, and on them it turns 4 figures into refusals.
5. **Separately worth [USER]'s attention, whatever is chosen:**
   - The review card gives an editor no way to see or correct the 184 `send:false` labels, which are
     reader-visible text that nobody reviews.
   - An editor approving the current identity cards would certify damaged artwork: `effectiveState` goes
     straight to `approved`.

## Denominators / instruments used
- Draw occurrences 367 (34 figures, prepared `blocks.json` × committed sidecars, same vintage: keysets equal
  on 34 of 34).
- Identity 7 under 3 normalisations. The whitespace-normalised `value==english` predicate would catch
  multi-line identity; it found none beyond the 7 exact ones.
- `isStale` probe over 34, with 2 positive controls.
- Field-reader greps with a `renderHash` positive control.
- Live fetch with a 404 control.
- Render timing control (0.000).
- vefur badge-consumer grep with a `data-figure-number` control.
- `bfs` returned 0 files under vefur `static/content/efnafraedi-2e` while `ls` shows files there, so that
  `bfs` null was discarded and direct `ls`/`sha1sum` used instead.
