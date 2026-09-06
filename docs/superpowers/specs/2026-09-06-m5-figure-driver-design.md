# M5 — the per-chapter figure driver: design

**Date:** 2026-09-06 · **Status:** design, approved in brainstorm; not yet implemented.
**Owner of:** the DESIGN of `tools/figure-run.js` and its two Python entry points.
**Status of the work lives in** `experiments/figure-text-translation/REGISTER.md` (figure status) and the campaign register's ⏩ RESUME. This document carries no status verbs.

---

## Purpose

Make M5's gate reachable: **one chapter's figures processed end to end, unattended**, producing an image an editor sees beside its module and a sidecar the review surface can read — with text-less figures skipped and counted rather than crashing.

🔴 **M5 IS A HARD PRECONDITION FOR EDITING** ([USER] 2026-09-06). *"The images should appear with their corresponding module, so editors can comment on them if needed, without revisiting the modules. Each module is a one-pass edit, and a one-pass approval with a batch run of images when convenient."* ▶ **The FIX may be batched; the PRESENCE may not.** Do not buy another chapter's text expecting to edit it before its figures exist.

---

## Rulings this design is built on — do not re-litigate

| # | ruling | consequence here |
|---|---|---|
| R1 | **Figures publish straight to `mt-preview`; no approval gate** | the driver builds **no** review workflow — the one that exists is sufficient |
| R2 | **Photos move across untranslated; vectors with text paths go through MT** | classification, below — it is derived, not configured |
| R3 | **The glossary comes off the figure MT leg** | `translate-blocks.mjs` gate 1 **inverts**; it is not deleted |
| R4 | **Chemistry 2e only**; Organic pending an OpenStax request | driver is book-agnostic; Organic needs a `sources.local.json` entry and nothing else |
| R5 | **Approach 2** — thin Node driver, two coarse Python entry points | architecture, below |
| R6 | **Skip-and-count** on failure | outcome enum, below |

---

## What already exists — build none of this

Verified against the tree 2026-09-06 by a 5-agent survey, not inherited from prose.

- **The whole single-figure chain works.** PDF text-matrix parsing, arc reassembly (44 glyph placements → 4 arc labels), wrap-then-shrink layout, font subsetting, the published-jpg oracle. `extract.py`, `strip-text.py`, `emit-blocks.py`, `compose.py`, `svgout.py`, `check.py`, `figtext.py`, `pdftext.py`.
- **Edition precedence is code with a test** — `sources.py` + `test_sources.py`, `editionPrecedence: ['updates-2e','first-edition']`.
- **The paid stage is already Node with the right CLI shape** — `translate-blocks.mjs`, verified at 0 ISK: `--book … --dry-run` → *8 blocks, 120 chars, est 1.20 ISK*; `--bok` rejected; missing `--book` → `REFUSED (no-book)`.
- **The publisher is done** — `tools/publish-figure-svg.js`, refusal order `bad-sidecar-path → no-sidecar → basename-mismatch → unmapped → no-svg → unsafe-output-name`, **all before any write**.
- **The editorial correction loop is done** — `figureReviewService.js` (`saveBlockEdit`, `setState(…, flagKind, note)`, `applyApprovedFigureEdits`, `FIGURE_STATES`), routes `GET …/figures`, `POST …/figures/:basename/block`, `POST …/figures/:basename/state`, and the client's `figure-review-section`.
- **Editorial state is DERIVED from two hashes, not stored.** `editorialState === 'approved'` iff `computeRenderHash(blocks, COMPOSER_VERSION) === sidecar.renderHash`; the image is current iff `sidecar.composedHash === sidecar.renderHash`. **An absent `composedHash` yields `mt-preview`, never `approved`.**

🔴 **THE ONLY REASON NONE OF IT RUNS IS A BOOTSTRAP DEADLOCK: nothing mints the sidecar.** `writeSidecar` has two non-test callers and **both refuse if the file does not already exist** (`publish-figure-svg.js:103` → `no-sidecar`; `figureReviewService.js:263` → null → route 404). Measured: `books/*/figure-text/*.is.json` → **0 files** for every real book; `data-figure-review` appears on **0 of 133** figure-bearing published pages.

---

## Architecture

| component | status | responsibility |
|---|---|---|
| `tools/figure-run.js` | **new** | enumerate · resolve · classify · orchestrate · summarise · write the sidecar |
| `experiments/…/figure-prepare.py` | **new, thin** | artwork → `blocks.json` + `artwork.svg` + manifest, into `--out` |
| `experiments/…/figure-compose.py` | **new, thin** | blocks + translations → `translated.svg`, from `--out` |
| everything in *What already exists* | reuse | — |

The two Python entry points are **wrappers over existing stages**, not new logic. `figure-prepare.py` does what `extract.py` + `strip-text.py` + `emit-blocks.py` already do, threading `--out` through `_deps.py`, and adds the missing `pdftocairo -svg` beside the existing `-png`.

▶ **Why Node holds the middle:** the chain is Python → **paid Node stage** → Python. It is inherently interleaved, so no design can let Python own a whole figure. Given that, the driver belongs where `books/`, the sidecar writer and the publisher already are.

---

## Data flow, per figure

```
1. enumerate   chapter CNXML <image src>            → basenames
2. resolve     sources.py <book> <basename>         → vector path | raster path | ∅
3. prepare     figure-prepare.py --out T/<basename> → {blocks[], artworkSvgPath, warnings[]}   (artworkSvgPath is a PATH inside --out, never inline content)
4. classify    (see below)
5. translate   translate-blocks.mjs --out T/…       → {key: [value]}
6. compose     figure-compose.py --out T/<basename> → translated.svg
7. sidecar     writeSidecar(books/<book>/figure-text/<basename>.is.json)
8. publish     publish-figure-svg.js                → books/<book>/media/<basename>_IS.svg
```

🔴 **STEP 1 IS CNXML-DRIVEN, DELIBERATELY, AGAINST THE EASIER OPTION.** Enumerating the artwork delivery would be simpler — it is already per-chapter — but it answers *"what artwork do we have"* when the question is *"what does this chapter show a reader"*. The sets differ **in both directions**: artwork with no CNXML reference is money spent on nothing, and a CNXML figure with no artwork is the `unresolved` count that reveals a hole in the delivery. **Only the CNXML side can surface that.**

⚠️ **The `{k: [v]}` → `{k: v}` normalisation happens at the SIDECAR BOUNDARY and nowhere else.** `out/translations-api.json` is `{"key": ["value"]}`; the sidecar is `{"key": "value"}`. One conversion site, one test — not two formats leaking along the chain.

---

## Classification — derived, not configured

R2 is a consequence rather than a rule anyone implements:

| resolve result | blocks | outcome |
|---|---|---|
| vector (`.pdf`/`.eps`/`.ai`) | > 0 | **translate** |
| vector | 0 | **copied-textless** |
| **raster only** (`.jpg`/`.png`/`.tif` in the same trees, same precedence) | — | **copied-photo** |
| **nothing in the delivery** | — | 🔴 **unresolved** |

🔴 **`copied-photo` AND `unresolved` MUST NOT BE COLLAPSED, THOUGH THEY SHARE A CODE PATH.** A photograph legitimately has no PDF; a *missing* vector also has none. **`unresolved` is the number that says the artwork delivery has a hole**, and nothing else in the pipeline looks at the delivery at all. Merging them hides it permanently.
▶ The raster probe uses **`sources.py`'s trees and precedence**, extended to raster extensions — never a directory glob. **Sourcing a superseded illustration is invisible in the output: a correct-looking Icelandic translation of the wrong picture, which no downstream check can see.**

---

## Outcomes and the verdict

Closed enum, **exactly one bucket per figure**, in two groups:

- **Classification outcomes** (what the figure IS): `translated` · `copied-photo` · `copied-textless` · `unresolved`
- **Process outcomes** (what HAPPENED to it): `failed-prepare` · `failed-mt` · `failed-compose` · `failed-publish` · `skipped-current`

A figure classified translate-able but whose run failed lands in the process bucket, **not** in `translated` — so the two groups never double-count and the partition holds.

**Skip-and-count (R6):** every failure records its bucket and the run continues. A chapter is never aborted by one figure.

🔴 **THE VERDICT IS NOT "DID IT FINISH".** Exit non-zero when any of:
- any `failed-*`, or
- any `unresolved`, or
- **`translated === 0` while at least one figure was classified TRANSLATE-ABLE** — because a chapter where every translate-able figure failed produces a tidy summary and would otherwise be indistinguishable from success.

⚠️ **The predicate is deliberately NOT `translated === 0 && figures > 0`, which self-review caught as spurious.** A chapter whose figures are legitimately ALL photographs translates zero and is entirely correct; failing it would train the operator to ignore the exit code, which is worse than not having one.

⚠️ **Two repo rules the driver must honour explicitly:**
- **Failure default on entry.** `process.exitCode = 1` at the top, cleared only when a verdict is genuinely reached — *a promise that never settles exits 0*, silently, with no output.
- **Never `process.exit()` with output in flight.** The summary IS the deliverable and a pipe truncates at 64 KB. Use `process.exitCode` and let the loop drain.

⚠️ **`skipped-current` must be NAMED, not merely counted.** The text side's `mtRunDecision` keys on file existence, so a bare re-run reports "already done" and does nothing — which has already cost a cycle here. "Nothing happened" must never look like "everything worked".

---

## CLI contract

```bash
node tools/figure-run.js --book <slug> --chapter <N> [--module <mNNNNN>] [--figure <basename>]
                        [--dry-run] [--stale] [--force] [--json]
```

| flag | behaviour |
|---|---|
| `--book` | **required**; refuse `no-book`, matching `translate-blocks.mjs` |
| `--chapter` \| `--stale` | exactly one required |
| `--dry-run` | run steps 1–4 (enumerate, resolve, prepare, classify) and stop; price the translate-able set; **must not construct an API client**. Steps 1–4 are free, so the preview classifies from the same evidence a live run does rather than guessing |
| `--stale` | only figures where `renderHash !== composedHash` |
| `--force` | re-process regardless of sidecar state |
| `--json` | machine-readable summary (**redirect, never pipe**) |

⚠️ **`tools/lib/parseArgs.js` SILENTLY DROPS UNKNOWN FLAGS**, and a declared-but-unimplemented flag is indistinguishable from a working one. Every flag above must have a consumer and a test asserting it changes behaviour.

---

## The correction loop — no new machinery

1. driver runs → sidecar + image → **editor sees the figure in the module**
2. editor edits a block — `POST …/figures/:basename/block` *(exists)*
3. editor cannot fix it themselves → `setState(…, flagKind, note)` *(exists)*
4. head editor approves — `POST …/figures/:basename/state` → `applyApprovedFigureEdits` writes a new `renderHash` *(exists)*
5. **the figure is now stale as a CONSEQUENCE** — `renderHash !== composedHash`, nobody sets a flag
6. `figure-run.js --stale` when convenient → recompose → publish stamps `composedHash`
7. `editorialState` derives to `approved`

▶ **Recomposition is deliberately NOT automatic on approval.** It costs CPU and touches `books/<slug>/media/`; batching is [USER]'s stated preference and derived staleness gives it for free.

⚠️ **The hashes prove PROVENANCE, never CORRECTNESS.** A sidecar's `renderHash` is consistent with its own blocks *by construction*, so no check in this repo can see a sidecar whose blocks are simply wrong. **The editor's eyes are the only gate on correctness** — which is exactly why M5's job is to put the image in front of them.

---

## Invariants

1. **`--out` is per-figure and temporary** — `T/<basename>/` in the scratch tree, never the shared `experiments/…/out/`. This dissolves the "whichever figure was extracted last" collision rather than working around it.
2. **Nothing writes under `books/` before step 7.** A mid-figure crash leaves the repo untouched — which matters because `books/<slug>/media/` has **no permission class** in CLAUDE.md's table and two existing tools rewrite it in place with no backup.
3. **`01-source/` is never read for artwork and never written.** The artwork lives outside the repo, via gitignored `sources.local.json`.
4. **`emit-blocks.py:17`'s `capture_output=True` swallows extract's subset-font warning.** In an unattended 30-figure run a swallowed warning is a silently mistranslated figure. `figure-prepare.py` surfaces warnings in its JSON.

---

## Testing

- **Unit:** the classification table (all four rows); the `{k:[v]}`→`{k:v}` normalisation; staleness derivation; the exit-code verdict including the `translated === 0` case.
- **Fixture:** `books/__e2e-fixture__/figure-text/` already holds 3 sidecars.
- 🔴 **Corpus-anchored partition check:** the outcome counts **must sum exactly to the enumerated figure count**. A figure that falls out of the partition is a figure nobody knows was missed.
- **`--dry-run` over a real chapter must reach the same classification as a live run** — the pre-flight is worthless if it classifies differently from the thing it previews.

---

## Out of scope

Organic (R4, blocked on assets) · any figure review UI (R1, exists) · automatic recomposition on approval · a persisted resume state machine (**YAGNI, measured**: a chapter is ~30 figures at 1.20 ISK, so a full re-run costs ~36 ISK — cheaper than the state machine that would avoid it, and `--stale` already gives derived resume).

## Open items, tracked not solved

- **`books/<slug>/media/` and `figure-text/` have no permission class** in CLAUDE.md's File Permissions table, yet a durable rule says a translated figure is a file in `media/`. **The driver's entire output surface is unclassified.** → needs a [USER] ruling; does not block M5.
- **`01-source/media/` has no tamper-evidence.** The source manifest holds 149 entries, all `.cnxml`; **1,543 chemistry image files in the legally load-bearing tree have zero hash coverage** and `verify-source-manifest.js` returns OK regardless. The only detector is `git status`, which works for chemistry *because it is tracked* and would not for Biology or Physics. → separate [CODE] item.
- **The MT-preview label is per-asset-class** — a module may be `faithful` in text while its images are `mt-preview`. **That belongs to vefur**; efni only makes the state distinguishable. → hand over before the first figure chapter syncs.
