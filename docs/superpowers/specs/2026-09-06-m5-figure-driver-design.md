# M5 — the per-chapter figure driver: design

**Date:** 2026-09-06 · **Status:** design. **REVISED 2026-09-06** against register §C137 and a 9-agent constraint verification. Not yet implemented.
**Owner of:** the DESIGN of `tools/figure-run.js` and its two Python entry points.
**Status of the work lives in** `experiments/figure-text-translation/REGISTER.md` (figure status) and the campaign register's ⏩ RESUME. This document carries no status verbs.

> 🔴 **REVISION BANNER — 2026-09-06.** The first version of this spec failed a blind adversarial
> review (§C137: 16 confirmed, 4 partial, 0 refuted) and a follow-up verification then found **two
> more** defects the review missed. **Every correction below is marked and dated**, because the
> corrected claims were stated with exactly the confidence of the ones that survived.
> ▶ **What survives untouched: the purpose, the architecture, and rulings R1–R6.**
> ▶ **What changed: what the pipeline can actually PROCESS, the ORDER of write-vs-spend, the
> classification discriminator, and the verdict.**
> ⚠️ **The corrections are not cosmetic. Three of them invert a claim this document made in its
> "build none of this" section — the section whose whole purpose is to stop work being redone.**

---

## Purpose

Make M5's gate reachable: **one chapter's figures processed end to end, unattended**, producing an image an editor sees beside its module and a sidecar the review surface can read — with text-less figures skipped and counted rather than crashing.

🔴 **M5 IS A HARD PRECONDITION FOR EDITING** ([USER] 2026-09-06). *"The images should appear with their corresponding module, so editors can comment on them if needed, without revisiting the modules. Each module is a one-pass edit, and a one-pass approval with a batch run of images when convenient."* ▶ **The FIX may be batched; the PRESENCE may not.** Do not buy another chapter's text expecting to edit it before its figures exist.

---

## Rulings this design is built on — do not re-litigate

| # | ruling | consequence here |
|---|---|---|
| R1 | **Figures publish straight to `mt-preview`; no approval gate** | the driver builds **no** review workflow — the one that exists is sufficient **for the figures it can show** (⚠️ amended by R7) |
| R2 | **Photos move across untranslated; vectors with text paths go through MT** | classification, below — it is derived, not configured. ⚠️ **The DISCRIMINATOR was wrong — see the classification section** |
| R3 | **The glossary comes off the figure MT leg** | `translate-blocks.mjs` gate 1 **inverts**; it is not deleted |
| R4 | **Chemistry 2e only**; Organic pending an OpenStax request | driver is book-agnostic; Organic needs a `sources.local.json` entry and nothing else |
| R5 | **Approach 2** — thin Node driver, two coarse Python entry points | architecture, below. ⚠️ **"thin" is no longer accurate — the Python side needs repair first** |
| R6 | **Skip-and-count** on failure | outcome enum, below |
| **R7** | **[USER] 2026-09-06 — enumerate EVERY `<image src>`, not only those inside `<figure>`; NAME the ones the review panel cannot show** | half of a chapter's figure text sits outside `<figure>`. Readers get it translated; editors see a subset; the gap is **reported, never silent**. Widening the review surface is a tracked follow-up, not part of M5 |
| **R8** | **[USER] 2026-09-06 — a figure that HAS a sidecar is never re-bought. To force a re-buy, DELETE `books/<slug>/figure-text/<basename>.is.json`** | there is no `--retranslate` flag and no provenance field. The sidecar's existence IS the "already paid" record |
| **R9** | **[USER] 2026-09-06 — `unresolved` is counted and NAMED, but does not by itself fail the run** | 170 of 1,148 chemistry figures (14.8%) have no artwork in the delivery today, in every chapter. An always-red exit code trains an operator to ignore it |

---

## What already exists — and what does NOT

Verified against the tree 2026-09-06 by a 5-agent survey, then **re-verified by a 9-agent constraint check that overturned part of it.**

### Genuinely done — build none of this

- **Edition precedence is code with a test** — `sources.py` + `test_sources.py`, `editionPrecedence: ['updates-2e','first-edition']`. ⚠️ **But a configured tree root that is ABSENT from disk falls through silently** — see the repair list.
- **The publisher is done** — `tools/publish-figure-svg.js`, refusal order `bad-sidecar-path → no-sidecar → basename-mismatch → unmapped → no-svg → unsafe-output-name`, **all before any write**. ⚠️ `fs.copyFileSync` is unguarded and can throw past every refusal — the caller must catch.
- **The editorial correction loop is done** — `figureReviewService.js` (`saveBlockEdit`, `setState(…, flagKind, note)`, `applyApprovedFigureEdits`, `FIGURE_STATES`), routes `GET …/figures`, `POST …/figures/:basename/block`, `POST …/figures/:basename/state`, and the client's `figure-review-section`.
- **Editorial state is DERIVED from two hashes, not stored.** `editorialState === 'approved'` iff `sidecar.state === 'approved'` **and** `computeRenderHash(blocks, COMPOSER_VERSION) === sidecar.renderHash`; the image is current iff `sidecar.composedHash === sidecar.renderHash`. **An absent `composedHash` yields `mt-preview`, never `approved`.**

🔴 **CORRECTED 2026-09-06 — THIS SECTION SAID "The whole single-figure chain works", LISTING EIGHT PYTHON FILES, AND THAT IS FALSE FOR MOST OF THE CORPUS.** Measured: the chain crashes on **23 of 30** chemistry ch04 figures and **91 of 178** across ch01–ch05. It works for the *one* figure the experiment was developed against. ▶ **This is the repo's own "a plan asserting something is already built" class, committed in the section whose entire purpose is to prevent redundant work — and it is precisely why D8 and D10 existed.** The repair list is below and is a **task, not a footnote**.

🔴 **CORRECTED 2026-09-06 — THE DEADLOCK IS REAL, BUT THE MECHANISM SENTENCE SENT DEBUGGERS TO THE WRONG PLACE.** This said *"`writeSidecar` has two non-test callers and **both refuse if the file does not already exist**"*. **`writeSidecar` itself MINTS FREELY** — `fs.mkdirSync(…, {recursive: true})` then an atomic tmp+rename, no existence check at all. The refusals live in the **callers' own gates**, one of them two hops away (`segment-editor.js` → `getFigure`), not in the writer.
▶ **THE DEADLOCK STANDS AND IS STILL THE ONE FACT A RE-DESIGN WOULD DESTROY:** measured **0** sidecars across every real book, and `data-figure-review` on **0 of 133** figure-bearing published pages. **Nothing runs because nothing MINTS the sidecar** — but the fix is *"call the writer"*, not *"defeat a guard"*.

### The repair list — the Python chain cannot process real artwork until these land

Each was measured, and a throwaway-copy proof took ch04 from **6 translated + 23 crashes** to **13 translated + 16 copied + 0 crashes**, with no regression in the 6 that already worked.

| # | file | defect | consequence |
|---|---|---|---|
| P1 | `extract.py` | reads `page.Resources.Font` unguarded | a page with no font resource raises |
| P2 | `extract.py` | `/Type0` CID fonts have no `/FirstChar`/`/Widths` | `AttributeError` mid-chapter |
| P3 | `figtext.py` | `group()` / `merge_blocks()` index empty lists | a **text-less** figure CRASHES instead of returning zero blocks — which is the whole of `copied-textless` |
| P4 | `emit-blocks.py` | spawns `'extract.py'` **cwd-relative**, and `capture_output=True` swallows the child's stderr | from any cwd but its own, every figure is a loud `failed-prepare`; and the subset-font warning that flags a silently mistranslated figure is discarded |
| P5 | — | `.eps`/`.ai` are opened with `pikepdf` | the precedence-WINNING tree is EPS-only for some chapters, so the correct artwork is exactly the artwork that cannot be opened. `gs -dEPSCrop -sDEVICE=pdfwrite` converts 7 of 7 real ch04 EPS in ~0.23 s each |
| P6 | `sources.py` | a configured tree root that is absent from disk `continue`s | **sourcing a superseded illustration is invisible in the output** — a correct-looking Icelandic translation of the wrong picture |
| P7 | driver | CNXML `src` carries a `-[0-9a-f]{4}` hash suffix the delivery filenames lack | inflates `unresolved` with a naming gap rather than a delivery hole |
| P8 | `emit-blocks.py` + `compose.py` | the two derive the block key from **different** inputs — emit filters blank runs, compose does not | a `send:true` block is **paid for and then discarded as ENGLISH KEPT**. Measured **71 of 393** pipeline-readable chemistry figures (18%); worst case 9 of 11 blocks on one figure |

🔴 **P8's FIX IS DECIDED BY MEASUREMENT, NOT BY PREFERENCE — DELETE THE FILTER FROM `emit-blocks.py`; DO NOT ADD ONE TO `compose.py`.** Two independent figures, both arms, with per-glyph controls:
- **Deleting emit's filter** leaves `compose.py` **byte-identical**, the composed geometry **0 pixels** different, and strictly improves the paid wire (`"not consistent with"` instead of `"notconsistentwith"`; and it stops buying the untranslatable fragment `"addition of"` as a standalone block). Total corpus cost: **194 characters, 1.94 ISK.**
- **Adding compose's filter** moves block boundaries on **32 of 393** figures — one label splits into three, two of which flip `left` → `center` alignment, and a length-realistic Icelandic map produces **overlapping text**. It also corrupts the `--control` oracle image, destroying the published-JPG comparison.
- ⚠️ **The single-figure answer is the WRONG answer.** On `SciMethod` no boundary moves, because all 3 of its blank runs sit in **arc** blocks and the arc predicate is pure Euclidean distance that never reads the adjacency arithmetic. **188 of 243 blank-bearing blocks corpus-wide are non-arc.** A one-figure measurement would have shipped the label-splitting arm.
- ▶ **Then make it unrepeatable: the key derivation belongs in ONE shared function both scripts import.** Keeping two copies in agreement by hand is what produced P8. ⚠️ **There is a THIRD consumer — `census.py` holds the emit-side view — so a fix that touches only the two scripts leaves the census reporting numbers that match neither.**


---

## Architecture

| component | status | responsibility |
|---|---|---|
| `tools/figure-run.js` | **new** | enumerate · resolve · classify · orchestrate · summarise · write the sidecar · mint the mapping entry |
| `experiments/…/figure-prepare.py` | **new** | artwork → `blocks.json` + `artwork.svg` + manifest, into `--out` |
| `experiments/…/figure-compose.py` | **new** | blocks + translations → `translated.svg`, from `--out`, **with a machine-readable verdict** |
| `experiments/…/translate-blocks.mjs` | **modify** | gains `--out`; gate 1 inverts |
| the Python stages | **repair** | P1–P6 above |

⚠️ **CORRECTED 2026-09-06 — the Python entry points are NOT "thin wrappers adding nothing but isolation".** They are thin *after* the repair list lands; before it, the thing they wrap does not work on real artwork.

▶ **Why Node holds the middle:** the chain is Python → **paid Node stage** → Python. It is inherently interleaved, so no design can let Python own a whole figure. Given that, the driver belongs where `books/`, the sidecar writer and the publisher already are.

⚠️ **Isolation uses TWO mechanisms deliberately, and that is not an inconsistency.** Python gets `FIGTEXT_OUT=` (one line in `_deps.py` reaches all five importers). Node gets an explicit `--out` flag, because **an env var has no refusal machinery** — a misspelled `FIGTEXT_OUTT=` writes silently to the shared directory, which is the exact silent-no-op class `translate-blocks.mjs`'s own docstring exists to close, on the leg that costs money. ⚠️ **cwd-per-figure is REFUTED by execution**: `HERE` derives from `import.meta.url`, so changing cwd moves nothing.

---

## Data flow, per figure

🔴 **THE ORDER CHANGED. The old order spent money and then wrote nothing under `books/` until after composition — so every post-payment failure DISCARDED THE PURCHASE, unrecoverably.**

```
 1. enumerate   chapter CNXML <image src>              → basenames + reviewable flag
 2. resolve     sources.py <book> <basename>           → vector path | raster path | ∅
 3. prepare     figure-prepare.py --out T/<basename>   → {blocks[], artworkSvgPath, imageXObjects, paintOps, warnings[]}
 4. classify    (see below)                            → outcome intent
 5. PRE-FLIGHT  mapping entry exists OR is mintable?   → PURE CHECK, NO WRITE
 6. translate   translate-blocks.mjs --out T/… --book  → {key: [value]}          ← THE ONLY PAID STEP
 7. SIDECAR     writeSidecar(books/<book>/figure-text/<basename>.is.json)        ← RECORDS THE PURCHASE
 8. verify      compare key SETS, both directions      → decides the OUTCOME BUCKET
 9. compose     figure-compose.py --out T/<basename>   → translated.svg
10. mint+publish  mapping entry, then publish-figure-svg.js → media/<basename>_IS.svg, stamps composedHash
```

🔴 **STEP 7 MOVED AHEAD OF EVERYTHING THAT CAN FAIL AFTER PAYMENT, AND STEP 8 MUST NOT GATE IT.** The sidecar is written **the moment the paid stage returns**, and **regardless of what the verification in step 8 concludes**. The check decides which *bucket* the figure lands in; it never decides whether the purchase is *recorded*.
▶ **Why this is not fussiness:** without it, adding step 8 at all would make things WORSE. A 7-of-8 MT return would be bucketed `failed-mt`, and all 7 paid translations discarded — **a new detection converted into a new loss.** The paid Icelandic otherwise lives only in a `mkdtemp` directory nothing records and nothing re-reads.

🔴 **STEP 1 IS CNXML-DRIVEN, DELIBERATELY, AGAINST THE EASIER OPTION.** Enumerating the artwork delivery would be simpler — it is already per-chapter — but it answers *"what artwork do we have"* when the question is *"what does this chapter show a reader"*. The sets differ **in both directions**: artwork with no CNXML reference is money spent on nothing, and a CNXML figure with no artwork is the `unresolved` count that reveals a hole in the delivery. **Only the CNXML side can surface that.**

⚠️ **The `{k: [v]}` → `{k: v}` normalisation happens at the SIDECAR BOUNDARY and nowhere else.** `out/translations-api.json` is `{"key": ["value"]}`; the sidecar is `{"key": "value"}`. One conversion site, one test. ⚠️ **An ARC block's value is written as a BARE STRING, not an array** — `Array.isArray(v) ? v[0] : v` handles both shapes exactly, and a naive `v[0]` on an arc block would yield its first **character**. **Do not add arc plumbing; the discriminator is already correct.** The test for it must be *labelled* as the arc case, which it was not.
⚠️ **`normaliseTranslations` must REPORT what it dropped.** It currently returns only survivors, so its caller cannot see that a drop happened — an empty MT value then becomes English in the image AND no review row for the editor.

### The sidecar the driver mints

```jsonc
{ "version": 1, "basename": "CNX_Chem_01_01_SciMethod",
  "renderHash": "<computeRenderHash(blocks, COMPOSER_VERSION)>",
  "composerVersion": "1",
  "blocks": { "Boiling point of water": "Suðumark vatns" } }
```

🔴 **NO `state` KEY, AND THAT IS LOAD-BEARING — MEASURED, not reasoned.** `editorialState` returns `mt-preview` on `!sidecar.state` before looking at any hash, so an unreviewed machine translation reads as `mt-preview` even though its `renderHash` matches its own blocks by construction. **Adding `state: 'mt-preview'` would be harmless but redundant; storing a derived value is what this design exists not to do.**
🔴 **`renderHash` IS REQUIRED, and it is what makes D3's fix need no new field.** `publish-figure-svg.js` stamps `composedHash` **iff `sidecar.renderHash` is truthy** — `state` is irrelevant to the stamp. So:

| state on disk | means |
|---|---|
| no sidecar | never processed — **eligible to spend** |
| sidecar, no `composedHash` | **paid for, not published — retry me, free** |
| sidecar, `composedHash === renderHash` | current |
| sidecar, `composedHash !== renderHash` | approved text has moved past the image — **recompose, free** |

⚠️ **A `--stale`/`--force` pass that does not change `blocks` must NOT rewrite `state` or `renderHash`** — it recomposes and lets the publisher stamp. And it must **carry `composedHash` forward** while never carrying `state` forward: the two fields travel in opposite directions.

---

## Classification — derived, not configured

R2 is a consequence rather than a rule anyone implements. 🔴 **BUT THE DISCRIMINATOR THIS SPEC ORIGINALLY GAVE WAS WRONG, AND WRONG IN THE DIRECTION THAT LOOKS RIGHT.**

⚠️ **"A photograph simply has no vector in the delivery" IS FALSE. OpenStax delivers photographs AS PDFs.** Measured: **167 of 178** figures across ch01–ch05 resolve to a vector, so a `copied-photo` bucket keyed on *"has no vector"* fires **once in 178** — and every photograph would instead be fed to extraction as if it were line art.

| resolve result | evidence | outcome |
|---|---|---|
| vector, ≥1 sendable block | — | **translate** |
| vector, 0 sendable blocks, page has paint operations | `paintOps > 0, imageXObjects == 0` | **copied-textless** |
| vector, 0 sendable blocks, page is a wrapped bitmap | `imageXObjects > 0, paintOps ≈ 0` | **copied-photo** |
| **raster only** (`.jpg`/`.png`/`.tif`, same trees, same precedence) | — | **copied-photo** |
| **nothing in the delivery** | after de-hashing the `src` (P7) | 🔴 **unresolved** |

▶ **The content discriminator is measured cleanly separable on ch04**: 0 images / 13–31 paint ops for line art, versus 1–20 images / 0–4 paint ops for photographs. `figure-prepare.py` reports both counts; `classifyFigure` reads them.

🔴 **`copied-photo` AND `unresolved` MUST NOT BE COLLAPSED, THOUGH THEY SHARE A CODE PATH.** A photograph legitimately has no translatable text; a *missing* vector is a hole in the delivery. **`unresolved` is the number that says the artwork delivery has a hole**, and nothing else in the pipeline looks at the delivery at all. Merging them hides it permanently.
▶ The raster probe uses **`sources.py`'s trees and precedence**, extended to raster extensions — never a directory glob.

⚠️ **The classification table keys on `sendable`, NOT on `blocks`.** They disagree on 4 of 30 ch04 figures, and `sendable` is right: sending `'\x00\x0b'` to a paid MT is the failure this distinction prevents. *(The first version of this table said `blocks`; the plan's code said `sendable`. The code was right.)*

---

## Reviewability — orthogonal to the outcome, and REPORTED

**R7.** Roughly half a chapter's figure text sits outside `<figure>` — in `<example>`, `<exercise>` and inline media. Measured on chemistry ch04: **30 images, 21 text-bearing, of which the review panel can show 9.** Corpus-wide that is **522 chemistry images**. Those images are in front of readers today, served from Cowork-vintage `_IS.svg` files **that were never machine-translated**.

- **The driver enumerates all of them and translates all of them.** Readers are the point.
- **Each figure carries a `reviewable` flag** derived from whether its `<image>` has a `<figure>` ancestor.
- **The summary must NAME the unreviewable translated figures**, with a count. A test asserts the naming, because a count alone is a number nobody reads.

⚠️ **`reviewable` is deliberately NOT an outcome bucket**, though §C137's remedy sketch proposed one. It is **orthogonal**: a non-figure image can be translated, copied or unresolved exactly like any other, so making it an outcome would force a figure into two buckets and break the partition — the one property that makes the tally trustworthy. *(This is a considered deviation from the option text approved on 2026-09-06, which said "its own named outcome bucket". The intent — name the gap, never hide the spend, keep the partition summing — is met more exactly this way.)*

🔴 **WIDENING THE REVIEW SURFACE IS A TRACKED FOLLOW-UP, NOT PART OF M5 — AND IT IS THREE LEGS, NOT A FILTER.** The 12 ch04 images have **no node in `02-structure/` at all** (not a node with a different `type` — absent), so `listModuleFigures`'s `type === 'figure'` test is not the blocker: the data it reads does not contain them. It needs (i) `cnxml-extract` to emit them or the service to read `01-source`, (ii) the service filter widened, (iii) `renderMedia` to badge them, which it does not do for any image today.

⚠️ **DRIFT GUARD, answerable now:** the enumeration predicate belongs in **one** module consumed by both `tools/figure-run.js` (ESM) and `figureReviewService.js` (CJS) — the one legitimate `.cjs` reason in this repo, and that service already reaches into `tools/lib/` twice. Otherwise the driver's idea of a figure and the panel's drift apart silently.

---

## Outcomes and the verdict

Closed enum, **exactly one bucket per figure**, in two groups:

- **Classification outcomes** (what the figure IS): `translated` · `copied-photo` · `copied-textless` · `unresolved`
- **Process outcomes** (what HAPPENED to it): `failed-prepare` · `failed-mt` · `failed-compose` · `failed-publish` · `skipped-current`

A figure classified translate-able but whose run failed lands in the process bucket, **not** in `translated` — so the two groups never double-count and the partition holds.

**Skip-and-count (R6):** every failure records its bucket and the run continues. A chapter is never aborted by one figure.

🔴 **THE PARTITION MUST BE ASSERTED AT RUNTIME, IN THE DRIVER, ON EVERY RUN. THE FIRST VERSION OF THIS SPEC REQUIRED IT AND NOTHING IMPLEMENTED IT.** Measured on the plan's own `tally[record.outcome] += 1`: an out-of-vocabulary or `undefined` outcome **mints a new key holding `NaN`**, so 5 figures with 2 mis-bucketed sum to 3 — and the verdict still returned `{ok: true}`, exit 0. ▶ **The driver must (a) REFUSE an outcome outside the vocabulary at the moment it is tallied, and (b) assert `sum(tally) === figures enumerated` before printing the verdict, failing loudly if not.** A test named for the partition that only greps source for `outcome: '<literal>'` does **not** perform it — and is defeated by the idiomatic `` outcome: `failed-${stage}` `` form.

🔴 **THE VERDICT IS NOT "DID IT FINISH".** Exit non-zero when any of:
- any `failed-*`, or
- **`translated === 0` while at least one figure was classified TRANSLATE-ABLE**, or
- the partition does not sum.

⚠️ **The predicate is deliberately NOT `translated === 0 && figures > 0`.** A chapter whose figures are legitimately ALL photographs translates zero and is entirely correct; failing it would train the operator to ignore the exit code.

🔴 **CORRECTED 2026-09-06 (R9) — `unresolved` NO LONGER FAILS THE RUN.** The first version exited non-zero on any `unresolved`. Measured: **170 of 1,148 chemistry figures (14.8%) are unresolved in the delivery today, in every chapter** — so that rule made essentially every chapter run exit 1 by design, which is exactly the always-red exit code the paragraph above argues against. ▶ **It is counted, and every unresolved figure is NAMED in the summary.** The hole stays visible; the exit code stays meaningful.

⚠️ **A `--dry-run` summary must not be BYTE-IDENTICAL to a successful live run.** On the tally ch04 produces, both modes otherwise give `{ok: true}` and the same counts. Label the mode in the summary.

⚠️ **Two repo rules the driver must honour explicitly:**
- **Failure default on entry.** `process.exitCode = 1` at the top, cleared only when a verdict is genuinely reached — *a promise that never settles exits 0*, silently, with no output.
- **Never `process.exit()` with output in flight.** The summary IS the deliverable and a pipe truncates at 64 KB. Use `process.exitCode` and let the loop drain.

⚠️ **`skipped-current` must be NAMED, not merely counted.** The text side's `mtRunDecision` keys on file existence, so a bare re-run reports "already done" and does nothing — which has already cost a cycle here. "Nothing happened" must never look like "everything worked".
🔴 **`skipped-current` is `!isStale(readSidecar(…))` — NEVER sidecar existence, and NEVER published-image existence.** Keying it on existence is what turns a figure whose publish was refused into a paid-for loss the summary reports as done, on every later run, for ever.

---

## CLI contract

```bash
node tools/figure-run.js --book <slug> --chapter <N> [--module <mNNNNN>] [--figure <basename>]
                        [--dry-run] [--stale] [--force] [--json]
```

| flag | behaviour |
|---|---|
| `--book` | **required**; refuse `no-book`, matching `translate-blocks.mjs` |
| `--chapter` \| `--stale` | exactly one required. `--chapter` accepts `appendices` — parse it with `normalizeChapter()` from `server/lib/chapterLabel.js`, **never `Number()`** (`NaN` → `chapterDir` → `'chNaN'`). ⚠️ **Not `cliChapterArg`, which converts the other way** |
| `--module` | **implemented, not decorative** — scopes enumeration to one `mNNNNN.cnxml`. Refuse `exit 2` if that file does not exist |
| `--figure` | scopes to one basename. **Refuse `exit 2` if it matches nothing**, listing what was enumerated |
| `--dry-run` | run steps 1–5 and stop; price the translate-able set; **must spawn `translate-blocks.mjs` ZERO times** — not "spawn it with `--dry-run`" |
| `--stale` | only figures where `renderHash !== composedHash`, **including `composedHash` absent**. **Spends nothing** |
| `--force` | re-process regardless of sidecar state. **Spends nothing** |
| `--json` | machine-readable summary (**redirect, never pipe**) |

🔴 **NEITHER `--stale` NOR `--force` MAY SPEND. THIS IS THE SINGLE BIGGEST SPEND CHANGE.** Both recompose from the **sidecar's own `blocks`** — which after an editor's correction is exactly the corrected Icelandic. A `--stale` that re-ran the MT would **overwrite the editor's correction with a fresh machine translation and charge for it.** The only figure the driver may pay for is one with **no sidecar at all** (R8).

⚠️ **To force a re-buy, delete `books/<slug>/figure-text/<basename>.is.json`** (R8). Explicit, git-visible, and the editor's `figure_block_edit` rows survive and re-overlay because block keys are content-addressed on the unchanged English. **There is no `--retranslate`.**

⚠️ **`tools/lib/parseArgs.js` SILENTLY DROPS UNKNOWN FLAGS**, and a declared-but-unimplemented flag is indistinguishable from a working one (§C83). The driver uses the **stricter** sibling: reject an unknown flag with exit 2. **Also reject a valued flag whose value is missing or itself begins with `--`** — `--book --dry-run` must refuse, not swallow. **Every flag above must have a consumer and a test asserting it changes behaviour**, and a scoping flag narrowing to the empty set must REFUSE, never exit 0.

---

## The correction loop — no new machinery

1. driver runs → sidecar + image → **editor sees the figure in the module**
2. editor edits a block — `POST …/figures/:basename/block` *(exists)*
3. editor cannot fix it themselves → `setState(…, flagKind, note)` *(exists)*
4. head editor approves — `POST …/figures/:basename/state` → `applyApprovedFigureEdits` writes a new `renderHash` *(exists)*
5. **the figure is now stale as a CONSEQUENCE** — `renderHash !== composedHash`, nobody sets a flag
6. `figure-run.js --stale` when convenient → recompose **from the sidecar's blocks, 0 ISK** → publish stamps `composedHash`
7. `editorialState` derives to `approved`

▶ **Recomposition is deliberately NOT automatic on approval.** It costs CPU and touches `books/<slug>/media/`; batching is [USER]'s stated preference and derived staleness gives it for free.

⚠️ **The hashes prove PROVENANCE, never CORRECTNESS.** A sidecar's `renderHash` is consistent with its own blocks *by construction*, so no check in this repo can see a sidecar whose blocks are simply wrong. **The editor's eyes are the only gate on correctness** — which is exactly why M5's job is to put the image in front of them.

---

## Invariants

1. **`--out` is per-figure and temporary** — `T/<basename>/` in the scratch tree, never the shared `experiments/…/out/`. 🔴 **This is UNIMPLEMENTABLE until `translate-blocks.mjs` gains `--out`**: it has no such flag, rejects unknown ones, and reads and writes four hardcoded `HERE/out/…` paths. **The first version of this spec asserted the flag existed.** Without it, every figure in a chapter translates from whichever figure was extracted last.
2. **Nothing writes under `books/` before the sidecar step.** 🔴 **The RULE survives; its RATIONALE is superseded.** It used to read *"a mid-figure crash leaves the repo untouched"*. After the reordering, a post-payment crash **deliberately leaves a sidecar behind** — and that sidecar is the **record of a purchase**, not debris. The rule now means: the sidecar is the *first* `books/` write, and it happens as soon as money has been spent.
3. **The pre-spend mapping check WRITES NOTHING.** `unmapped` must be unreachable on any path that has already spent money, so the check runs at step 5 — but it is a **pure predicate**; the entry is minted at step 10, alongside the publish. *(Splitting the check from the write is what lets Invariant 2 and the pre-spend guarantee both hold.)*
4. **`01-source/` is never read for artwork and never written.** The artwork lives outside the repo, via gitignored `sources.local.json`.
5. **Warnings are surfaced, not swallowed.** `emit-blocks.py`'s `capture_output=True` discards extract's subset-font warning; in an unattended 30-figure run a swallowed warning is a silently mistranslated figure. ▶ **Derive the warning list from `<out>/meta.json` rather than plumbing a child's stderr** — measured to reproduce `extract.py`'s own list exactly, and it works on real chemistry artwork too.
6. **The mapping entry the driver mints restates NO enforceable value.** Import `DEFAULT_SUFFIX` from `tools/generate-image-mapping.js`; take the extension from `path.extname()` of the composer's output; gate on the basename being in the source-image index, so `unmapped`'s typo protection survives; write tmp+rename.

---

## Testing

- **Unit:** the classification table (every row, including the two content-discriminated ones); the `{k:[v]}`→`{k:v}` normalisation **with the arc case labelled as such**; staleness derivation; the exit-code verdict including the `translated === 0` case and the R9 `unresolved` case.
- 🔴 **RUNTIME partition assertion** — the outcome counts must sum exactly to the enumerated figure count, **checked by the driver on every run**, not by hand and not by a source regex. A figure that falls out of the partition is a figure nobody knows was missed.
- 🔴 **A POSITIVE CONTROL IS MANDATORY WHEREVER A TEST SUITE ASSERTS ONLY REFUSALS.** §C137's D11: every one of Task 3's cases asserted a refusal, and a 12-line stub that refuses everything passes all of them. **The prepare suite must run a real artwork fixture and assert values only real processing can produce** — exact block and sendable counts, a non-empty `artwork.svg`, the subset-font warning present.
- ⚠️ **The artwork lives outside the repo, so a real-artwork test is vacuous in CI.** Commit a small stdlib-generated PDF fixture with its generator, **and state in writing that the Python suite is not a CI gate** (no workflow runs Python), naming the hand-run command and its expected output.
- ⚠️ **A test that watches ONE filename to prove isolation proves nothing.** Compare the shared `out/`'s full inventory and mtimes.
- **`--dry-run` over a real chapter must reach the same classification as a live run** — the pre-flight is worthless if it classifies differently from the thing it previews.
- **Free acceptance criterion, costs 0 ISK:** `node tools/figure-run.js --book efnafraedi-2e --chapter 4 --dry-run` shows **`failed-prepare = 0`** and a tally summing to **30**.

---

## Out of scope

Organic (R4, blocked on assets) · any figure review UI (R1, exists) · **widening the review surface to non-figure media (R7 — tracked, three legs, not a filter)** · automatic recomposition on approval · adding Python to CI · a persisted resume state machine.

▶ **The YAGNI argument against a resume state machine is STRONGER after this revision, not weaker:** with the sidecar written at the moment of purchase and `--stale`/`--force` spending nothing, **derived resume is free and a re-run costs nothing for any figure that already has a sidecar.**

## Open items, tracked not solved

- **`books/<slug>/media/` and `figure-text/` have no permission class** in CLAUDE.md's File Permissions table, yet a durable rule says a translated figure is a file in `media/`. **The driver's entire output surface is unclassified — and this revision adds a THIRD automated writer to `media/image-mapping.json`**, which is what makes the existing gap bite now. → needs a [USER] ruling; does not block M5.
- **`01-source/media/` has no tamper-evidence.** The source manifest holds 149 entries, all `.cnxml`; **1,543 chemistry image files in the legally load-bearing tree have zero hash coverage** and `verify-source-manifest.js` returns OK regardless. → separate [CODE] item.
- **The MT-preview label is per-asset-class** — a module may be `faithful` in text while its images are `mt-preview`. **That belongs to vefur**; efni only makes the state distinguishable. → hand over before the first figure chapter syncs.
- 🔴 **A GREEK LETTER IS BEING TREATED AS WHITESPACE, AND THE PIPELINE IS BROKEN ON IT UNDER EVERY ARM.** `CNX_Chem_02_02_Rutherford.pdf`'s font declares `/Differences [31, /uni03B1]` — **character `\x1f` IS GREEK SMALL LETTER ALPHA**, the alpha of *alpha particles* — and `'\x1f'.isspace()` is `True` in Python, so it reads as a blank run and every label is split around it. Worse, `pdftext.parse` **never applies a font's `/Encoding /Differences` at all**, so the alpha reaches the wire as a raw `\x1f` and the composer draws it in a font with no glyph there. **This is CLAUDE.md's `U+0001` "the OUTPUT lies" class, in live chemistry artwork.** ▶ **It is PRE-EXISTING and arm-independent — P8 neither causes nor fixes it** (compose never filtered, so what is drawn does not change) — and it is deliberately **NOT** in M5's scope, because decoding `/Differences` is its own piece of work. **But it degrades every Greek-bearing chemistry figure M5 translates**, so it needs a [CODE] item of its own. ⚠️ **Corollary for any future blank filter: the predicate must be `text == ''`, NEVER `not text.strip()`.**
- ⚠️ **Two more pre-existing, arm-independent crashes were found while measuring P8** and are not in the repair list because they were not needed for ch04: `compose.py`'s `fit_circle` raises `ZeroDivisionError` on `CNX_Chem_02_07_ErinBmap`, and `census.py` classifies `PerTable2` as a parser gap while `extract.py` has no matching guard.
- **170 of 1,148 chemistry figures are unresolved in the artwork delivery** (14.8%), after de-hashing. R9 makes this reportable rather than fatal; it does not make it fixed. → an OpenStax delivery question.
