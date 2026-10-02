# §C140 step 2: the single recompose pass (`COMPOSER_VERSION` '4' → '5'), what it must carry, and the rulings it needs

> **FROZEN DESIGN RECORD — banner-dated 2026-10-02.** Evidence, never status: status lives in the campaign register
> (`docs/plans/2026-07-21-post-item17-followup-campaign.md`, §C140 ㊾ and its ⏩ RESUME). If this document
> disagrees with the register, the register wins. The measurements it rests on are off-repo, in
> `~/.cache/namsbokasafn-audit/2026-10-02-step2-rederive/` (README inside).

**Date:** 2026-10-02 · **Item:** campaign register §C140 ㊾ (development-order step 2) · **Cost:** 0 ISK for every
recommended route. One alternative route costs under 1 ISK and needs [USER]'s go.
**Status of this document:** a design with a decision sheet. **No implementation plan is written yet**, because
five of its choices are [USER]'s (§ Decision sheet, group A). The plan follows the rulings.
**Method:** the audit's sub-item list (2026-09-26) predates PRs #527 and #529–#534, so each item was treated as a
hypothesis. 8 read-only measuring agents, each checked by a replicating and a skeptical verifier, then a
completeness critic: 25 agents, 0 errors, and the tree was clean after every one. Every claim below was measured
at `1fd497687`. The central correction (ibuprofen, D6) was re-run by hand.

## What the pass is

One bare `figure-run.js --stale` run per chapter (ch01–ch21 and `appendices`: 22 runs), after the
`COMPOSER_VERSION` constant (`tools/lib/figure-text-sidecar.cjs`) goes from '4' to '5'. All 461 sidecars carry
`composedVersion` '4', so the bump alone makes every one of them stale (`isStale`, `tools/figure-run.js`). Today 0
are stale. Since ㊴, `--stale` also reaches the 250 textless figures through their mapping rows, and it never buys:
a sidecar-less `translated` figure is refused as `skipped-unbought`, and the spend site throws if that refusal is
ever bypassed. **The pass is 0 ISK by construction, provided it is run with `--stale` and never through
`scripts/chemistry-autorun-chapter.sh`, which runs the driver without it.**

What it writes: `books/efnafraedi-2e/media/*_IS.svg`, plus one line in each of the 461 sidecars
(`"composedVersion": "4"` → `"5"`). `image-mapping.json`, `03-translated/` and `05-publication/` are untouched.
Readers get the new media only through step 3's re-render and [USER]'s sync.

## The reader baseline (why "worse than today" is the test)

vefur serves the **June** vintage for 682 of the 711 mapped figures (blobs from `34402e8a6`, `9269fcda8` and
`d20952748`). 27 figures have never been published, and exactly 2 equal `HEAD`: catalyst and ibuprofen, the two
[USER]-kept June copies (the instrument's positive control). **So the held chemistry sync, not the pass, is what
replaces the reader's picture**, for nearly the whole book at once. Every prepared copy that is worse than its June
copy becomes a reader-visible regression at the sync. That is the ㊽ lesson applied to the whole corpus: a June copy
that is already right is the bar.

## Measured state of each sub-item

| # | Sub-item (2026-09-26 audit) | Verdict at `1fd497687` | What the pass needs |
|---|---|---|---|
| 1 | §C168 heavy figures + ⑭ raster arm | **Built and subsumed.** `figweight.should_rasterise` (8 MiB, or 25,000 path+clipPath, or 2,000 `<image>`, or an in-document `<feImage>`) has one call site, in `compose.py`, on the stripped artwork. 20 heavy figures plus 56 feImage figures, 4 of them both, make 72. All are reached by a bare `--stale` (70 through stale sidecars, 2 through mapping rows). 8 raster shells already exist (ch17–21) | Nothing to build. The audit's per-figure `--figure X --force` route is **superseded**: the docstring forbids `--force` for a bump, and a chapter `--force` without `--stale` can buy. The `[RASTER: …]` verdict never reaches any driver output (the driver discards compose's stdout), so **a census of `media/` after the run is the only detector.** ⑭ has never run end to end through the driver: exercise it on one uninvolved figure first (Archery, not phscale) |
| 2 | HetCats: *frásogast* → aðsog-, then recompute `renderHash` | **Not built, and the root cause is new** (figure `REGISTER.md` ⑭). The driver de-hashed `-230a` to a base-tree EPS that reads "absorbed"; the 2e figure reads "adsorbed". The paid MT faithfully translated superseded English. The June copy (`34402e8a6`, 216 KB, raster artwork plus live text) reads *Etýlen aðsogað á* | A ruling (D4). The audit's "recompute `renderHash`" is still true and **not** subsumed by the pass: the publisher restamps only `composedVersion`, so a hand-edited value with the old hash recomposes on every run, forever. If edited: change the VALUE only, never the key, and hash under the sidecar's own `composerVersion` ('4') before the pass |
| 3 | §C161 `/Annots` comment icons | **Not built.** `strip-text.py` `main()` drops `/PieceInfo`, `/LastModified`, `/Metadata` and `/Thumb` but not `/Annots`. **5 figures, not 3** (+ ch20 HalAlkane, HalAlkane3). The source census is closed: 6 annotated source PDFs, 5 resolved, 0 EPS | A one-line fix in the page cleanup before `pdf.save`, red-first in `test_figure_prepare.py` (an `/AP` fill in a distinctive colour; assert it is gone from `artwork.pdf`, `.svg` and `.png`). All 5 are textless, so every `--stale` run recomposes them: land it before the pass |
| 4 | ㉑ Nitrogen | **Not built, and its own precondition was broken on 2026-09-21:** Nitrogen and `conjugate_img` were bought unfixed and draw 4 labels on 2–3 lines | Build it in the pass (D3). Under the row's merge rule: 21 blocks in 14 figures, 20 with sidecars, 4 laid out wrong, 16 identity (latent: any editor edit makes them laid out) |
| 5 | `looks_verbatim` (MattType *No*) | **Not built: no override exists** (no config key, sidecar field or parameter). Census: 7 figures, 13 labels (MattType, MolSpeed1, phscale, buffer, amide1_img, HNO2_img, OxStNonmts), plus MYdCmIn *in.* and AMFM *AM*/*FM*. FoodLabel is out: it is held by the undecoded `(cid:127)` rule | A mechanism ruling (D5). The held blocks never went to the MT, so no Icelandic for them exists anywhere in the tree |
| 6 | PerTable2 June-raster restore | **Not built, and no existing config kind can guard it** (D1) | A ruling (D2) and the new guard |

**Found outside the six:** Graphene's paid MT returned `Buckyball` unchanged, where the June copy reads *Knattkol
(buckyball)*. MYdCmIn regressed from June *1 tomma* to *1 in.* (the looks_verbatim class). So the June-better class
is **PerTable2, HetCats, MattType, MYdCmIn and Graphene**, plus the already-ruled catalyst and ibuprofen. They were
found one item at a time, and the critic's proxy census (English kept in `HEAD` but absent from June) is blind to two
of the three shapes: Icelandic → worse Icelandic (HetCats), and raster → vector (PerTable2). **Treat the class as
open: the by-eye sample after the pass must look for more.**

## Decisions (the designs; the rulings they need are in the decision sheet)

**D1. One guard for a kept copy: a `keptCopies` policy table** (`{basename: reason}` in `figure-text.config.json`),
the inverse of `retiredFigures`. The existing kinds were measured unfit:
- `supersededArtwork` states something false for PerTable2 (its source PDF is fine), and the autorun halts on
  `REFUSED — superseded` (`scripts/chemistry-autorun-chapter.sh`).
- `retiredFigures` makes the validator go red while the row and the copy exist, and the retire tool refuses a figure
  with a sidecar and would delete the copy.
- A pin cannot point at our own output (`_OWN_OUTPUT_DIRS`).

Shape: `sources.py` refuses a kept figure as `kept` before any lookup, next to `retired`; one `_POLICY_TABLES`
entry; a validator rule (must HAVE a mapping row and a translated copy, must carry no pin, not retired); a
`refusalReason` branch whose wording says the copy is kept by ruling. The generic fallback already prints *REFUSED —
kept*, and the "readers still see an earlier translated copy" line fits it. `unresolved` is NOTE-only, so a kept
figure never fails a verdict. **The refusal happens at resolution, so it blocks a buy on plain runs too**, and a kept
figure needs no sidecar as a re-buy lock.

The sidecar of a kept figure should be **deleted in the restore commit**. Its blocks describe a picture that is no
longer served, and while it exists the page keeps its `data-figure-review` badge and the review panel lists those
blocks (PerTable2: *Aðalsmaður*, …). An editor could then approve edits that can never reach the image. The paid MT
record stays in git at its buy commit, which the reason string names.

**D2. PerTable2: restore the June raster under `keptCopies`** (recommended). `d20952748` is the file live today
(sha256 matched), it embeds **no font** (so ㉗ is not touched; the earlier `9269fcda8` version draws ENGLISH labels
and embeds Liberation, so it is not a candidate), and the [USER] ruling of 2026-09-26 (2: the re-buy
option is given up) argues against the alternative: a writing-mode splitter in `readlayer._continues`, which moves
the bought block keys, then a ~1.5–3 ISK re-buy. **Ordering:** guard and restore before the pass and before step 3's
re-render; otherwise the pass overwrites `media/` through `publishFigureSvg`'s unconditional copy, or the sync ships
the September copy that `05-publication` holds today. Known quirks of the June raster, for the ruling: *Lanþaníðar*
with þ, no "1" above group 1, *Flokkur*, crowded glyphs in vertical *Halógenar*, and unsearchable text.

**D3. ㉑: build the visual line count inside the '5' pass, restricted to the block's OWN cues and alignment**
(`compose.py`'s `n_src`/`starts`/`ends`/`projs`; `figcontainers`' own-cell and open alignment), not
`figcontainers.line_frames` for every block. The register's fix direction, applied in `line_frames`, over-merges:
it merges CbcCltPckd's diagonal kept `C|B|A` and moves neighbour frames in up to 18 bought figures. Keep
`block_key` on `FT.lines`, so no sidecar key or hash moves. The threshold (0.6 lead) sits mid-plateau: hits are flat
at 21 for 0.5–0.8 and jump at 0.9. A real-geometry fixture already exists (`test_figscripts.py`'s `CONJ`). Predicted
delta: 4 laid-out blocks in 2 figures change; the 34 originally bought figures are unchanged by value (their frozen
`code1-exposure.txt` reads A 0, B 0). **Why it must ride '5':** the docstring requires a bump for a change that
alters pixels for unchanged text. Once figure review reopens at the '5' deploy, a later ㉑ would need a '6' bump,
which demotes every approval.

**D4. HetCats and Graphene: one of three routes each** (ruling). Both have sidecars, so neither can cost money.
1. **Value edit before the pass:** [USER]'s written authorisation and wording (the 2026-09-28 Greek hand-repair
   class, by analogy; `figure-text/` is not a READ-ONLY tree). Value only, never the key; `renderHash` recomputed
   under the sidecar's own `composerVersion`; a `.bak` first; never while a run is going (the publisher refuses
   `sidecar-moved`). A simulation with the real `isStale` showed that hashing under '5' with `composerVersion` left
   at '4' loops forever.
2. **Include unedited, then fix through figure review after the '5' deploy** (the ㉕ precedent: label corrections
   go through figure review), followed by one more 0-ISK `--stale` recompose and a re-render, all before the sync.
3. **Restore the June copy under `keptCopies`** (D1). HetCats' June copy is light and correct. **But it, Graphene's,
   MattType's and MYdCmIn's June copies all embed Liberation Sans 1.07.4** (measured: 5–12 references each; only
   PerTable2's raster is font-free). Each restore therefore widens the catalyst/ibuprofen exception to ㉗'s strict
   licence ruling and `LICENSE`'s font paragraph (㊻⑤).

**D5. `looks_verbatim`: one of three mechanisms** (ruling). Never lower the 3-letter threshold: *No*, *In*, *As* and
*At* are element symbols in 8+ periodic-table figures. **The API-only rule** (memory `feedback-translations-api-only`)
bears on every route: no value an agent wrote may be committed. A value [USER] supplies is a ruling, as a figure
review edit would be.
- **(a) Compose-time substitution, keyed `(basename, blockKey) → value` in config, values from [USER].** It follows
  numloc's `localise_block` precedent: the block stays `send:false`, so there is no sidecar writer, no `renderHash`
  change and no new money path, and it works for the textless HNO2_img and OxStNonmts. It changes pixels for
  unchanged sidecar text, so **it must ride '5'** (or wait for '6').
- **(b) A key-subset buy:** flip `send` for the listed keys only and buy them through the existing paid path, then
  splice them into the sidecar. Under 1 ISK, API provenance kept, and severable, because it changes `renderHash` per
  figure. **Not built**, it touches the paid path, it needs [USER]'s go, and a bare *or* or *To* can come back
  unchanged (identity), leaving an unbuyable `"or": "or"`. ⚠️ A `send` flip on the textless HNO2_img or OxStNonmts
  opens a buy on any later plain run.
- **(c) Defer.** MattType and MYdCmIn stay regressed until (a) under '6' or (b). Note that the review panel cannot
  add a key that is missing from `sidecar.blocks`, so editors cannot fix these.

**D6. Catalyst and ibuprofen: record both in `keptCopies`** (ruling; recommended). Their protection today is
incidental, and for ibuprofen it was misdescribed: catalyst is `unresolved` (the resolver returns `null`), but
**ibuprofenmass_img resolves** to a selected-art `.eps`. Only `isRecomposableTextless` requiring
`imageXObjects === 0` keeps the pass off it (it has 3). A read-layer change could make that 0 and overwrite the
June copy silently. A `keptCopies` entry is not a pin, so the standing "never pin" ruling is respected.

**D7. `test_figrings.py`'s corpus anchors move in the pass's PR.** Section 7 pins ring candidates in the committed
bytes of exocytosis-88f6 (8 candidates, `mask-491`), HeatMeas (the carrier list) and Econfig (the memoised walk).
All three are feImage figures that the raster arm rewrites into shells with no `<mask>`, so the documented
pre-flight gate goes red mid-pass. **Run the three pre-flight suites ONCE before ch01, not per chapter**, and
re-pin the anchors in the same PR. The re-pin design is [CODE]'s call in the plan. A git-history blob is vacuous on
a depth-1 clone, but this suite runs in no CI job (㊷②). After the pass, **brain-ec0b** (vector, 1 healed mask) is
the only figure whose published bytes still depend on the ring gate's browser.

**D8. One merge for the bump, the restamped sidecars, the re-pinned anchors and the media** (spec 2026-09-29 D8, the
㊱ precedent). The code fixes (D1, D3, §C161, D5a) land first, in their own reviewed PR. The 3-red count for a
bump-only commit (㊳) is from 2026-09-29 and predates ㊴/㊵/㊼: re-run it by name; do not assume it.

## Decision sheet

**(A) Rulings that gate the plan:**
1. **PerTable2:** restore the June raster under `keptCopies` (D2, recommended), or the splitter fix plus a
   ~1.5–3 ISK re-buy.
2. **The keep-copy guard (D1):** approve a new `keptCopies` table, and deleting the kept figure's sidecar.
3. **HetCats:** route 1, 2 or 3 (D4), and for route 1 the wording. The June copy and this module's caption both use
   *aðsog-*; the glossary has no adsorption row.
4. **Graphene:** route 1, 2 or 3 (D4), and the wording for route 1. The June copy reads *Knattkol (buckyball)*.
5. **`looks_verbatim`:** mechanism (a), (b) or (c) (D5). For (a), the values for each listed label, MattType and
   MYdCmIn first (the two June regressions). For MYdCmIn, AMFM and the `ft` unit labels: localise, or keep the
   English abbreviation?
6. **㉑:** build it in the pass (D3, recommended), or accept the drawings of both Nitrogen and `conjugate_img`.
7. **Catalyst and ibuprofen:** record them in `keptCopies` (D6, recommended), or keep relying on the incidental
   protection.

**(B) Operational defaults, taken unless [USER] says otherwise:**
- Ring-gate browser: re-validate brain-ec0b under Chromium 1243 with a live `--stale --figure` run first in ch03,
  rather than pin a build. Fallback: pin `chromium_headless_shell-1234` (the binary the thresholds were measured on,
  not full Chrome).
- Move the repo `.env` aside for the pass, so a would-be buy fails closed at the API client. Exporting an empty key
  does not work, because `.env` overrides it.
- Per chapter: `free -h` and `df -h /tmp` first (memory fell to 1.5 GiB during the measurement); `--stale --dry-run`
  before the live run. Run ch07, ch08, ch10, ch11, ch12 and ch20 detached with an `EXIT=` marker, and the rest in the
  foreground. Never `--force`.
- Read each run's verdict reasons, not the word *ok*: since ㊼ a ring gate that cannot run is fatal to the verdict
  while the figure still publishes, and ㊹ under-reports textless notes.
- Before the deploy that carries '5' (`figureReviewService` imports the constant): the read-only prod checks, 0 dirty
  sidecars and 0 `figure_review` rows. Figure review reopens only after that deploy (2026-09-26 ruling 5).

## Predicted delta of the pass (for attribution)

- ㉗ licence `<metadata>`: every FigIS figure. The ㉗-specific token is "FigIS is a subset of Liberation"; `<metadata`
  alone does not separate the vintages, because 113 pre-㉗ copies carry ⑥a's STIX one.
- ⑭ raster: 56 feImage figures (55 if PerTable2 is kept). §C168 raster: the 20 over 8 MiB (FissnBomb is 193 KB under
  the threshold). Predict the raster set from the run, not from committed sizes: the gate reads the stripped artwork.
- ㉑: 4 blocks in 2 figures. §C161: 5 textless figures. D5a: the ruled labels. D4: one figure each for the ruled routes.
- Unchanged: the ICE pair (byte-identical; the determinism control for vector sidecar figures only), catalyst,
  ibuprofen, and every kept copy.
- Census after the pass: shell fingerprint over `media/`; 0 files at 8 MiB or more; 0 `<feImage>` outside kept
  copies; the annotation colours at 0 in both encodings (`rgb(25%, 66.664124%, 33.331299%)`/`rgb(100%, 100%, 0%)` and
  `#40aa55`/`#ffff00`); textless convergence checked by byte identity across two runs, not by `skipped-current`
  (textless figures carry no stamp). Then `browser-sweep.mjs` over every figure in Chromium, Firefox and WebKit (the
  2026-09-29 spec's step-6 duty covers all 56), and a by-eye old/new/source sample in Chromium and Firefox.

## Known limits

- The June-better census is incomplete for two of its three shapes (above).
- No whole-pass duration has been measured. ㊱'s 2026-09-17 recompose took ≤ 90 s per 15–19 figures; ch20 alone
  selects 126.
- A stale sidecar figure is recomposed only if it still classifies `translated` and passes the drift guards. No
  read-layer file has changed since the '4' bump, which is why the keys are expected to hold. The per-chapter dry run
  is the gate.
- `test_figure_prepare.py`, `test_figrings.py` and the other composer suites run in no CI job (㊷②), so the operator
  runs them on the figure box.
