# REGISTER — figure-text translation

**This file is the ONE owner of figure-text-translation status.** Per
[CLAUDE.md § One source of truth](../../CLAUDE.md), no other document carries a status
verb for this work: the campaign register in `docs/plans/` points here and never
restates. Design evidence lives in [FINDINGS.md](FINDINGS.md), frozen; how to run
things lives in [README.md](README.md).

---

## ⏩ RESUME — state as of 2026-09-08 (supersedes every block below)

🔴 **THE DRIVER EXISTS. THE BOOTSTRAP DEADLOCK IS BROKEN.** For weeks the editorial correction loop
— `figureReviewService.js`, the `…/figures…` routes, the client's `figure-review-section` — was
fully built and never ran, because **nothing minted the sidecar**. `tools/figure-run.js` now does:
it enumerates a chapter's figures from CNXML, resolves each through `sources.py`, classifies it,
sends only vectors with sendable text to the paid stage, writes the sidecar, composes and publishes.
**Merged 2026-09-08 as `633f60a9` (PR #457).**

**The pieces, so nobody rebuilds one:** `tools/lib/figure-outcomes.js` (closed outcome vocabulary,
a tally that throws rather than lose a figure, the run verdict) · `tools/lib/figure-classify.js` ·
`tools/lib/figure-enumerate.cjs` (the ONE enumeration predicate, now required by
`figureReviewService.js` too) · `figure-prepare.py` · `figure-compose.py` · a committed PDF fixture
+ `make_fixture.py` · `FIGTEXT_OUT` isolation in `_deps.py` · a `--svg` branch on `strip-text.py` ·
`--out` and an injectable client seam on `translate-blocks.mjs`.

🔴 **GATE 1 IS INVERTED AND SHIPPED: the figure MT leg now sends NO glossary by default**, with a
pre-flight invariant that refuses if one ever appears on the wire. The ② bullet below records why
the prescription it replaced was unsatisfiable — read that before re-deriving it.

🔴 **THE `unreadable-text` DISCRIMINATOR IS NOT WHAT THE M5 PLAN SPECIFIED, AND THE PLAN'S VERSION
MUST NOT BE RESTORED.** The plan keyed it on `formTextXObjects > 0` — correct for the OLD reader,
which could not see text inside `/Form` XObjects. **The pdfplumber adapter descends into forms**, so
measured over the 817-figure read population that rule fires on **216 figures, is wrong on 216 of
216, and has ZERO true positives.** It is now keyed on `undecodedBlocks > 0`, with
`chars === 0 && formTextXObjects > 0` kept ONLY as a read-layer regression sentinel that has no
corpus exerciser today and says so in the code.

⚠️ **KNOWN AND UNFIXED, recorded here because live exposure is 0 and NOTHING ENFORCES THAT:**
`strip-text.py` blanks 8 figures whose text is drawn in clipping mode (`7 Tr`) — the producer paints
an image *through* the letterforms, so removing the text removes the clip and the image floods the
page. Measured on `CNX_Chem_04_02_Citrus`: 152,693 non-white pixels → 1,404. **Every text-based
check passes on the wreckage** (pdftotext returns 0 words, no `BT` survives); only pixels see it.
All 8 classify `copied-photo`, so this tool's output is never read for them — a re-extraction that
made one of them sendable would compose onto a blank canvas. Full account in `strip-text.py`'s own
docstring.

⚠️ **Campaign status — what is next — is the campaign register's (§C137/§C138/§C139), not this
file's.** This file owns figure-text status; it does not own the campaign's.

---

## ⏩ RESUME — state as of 2026-09-07 (superseded by the block above)

**The read-layer swap has been MEASURED, and its evidence has an owner:**
[`READ-LAYER-ACCEPTANCE.md`](READ-LAYER-ACCEPTANCE.md) — C1, C1b, C2, C3, C4, C4b with denominators,
both readers per census bucket, criterion 5 on two measured-not-named figures, H7 named rather than
counted as zero, and every figure still empty after the swap named. **Read the numbers there; none
is restated here or anywhere else.**

**The hazards that remain open are recorded below** under *Known hazards of the shipped read layer*
— the `\x1f`/`_looks_undecoded` spend hazard, the census's deliberate baseline vintage, and R3's
form walk being a no-op on EPS. They are **recorded, not fixed**, each with the reason.

⚠️ **Campaign status — whether M5 is done, and what is next — is the campaign register's
(§C137/§C138), not this file's.** This file owns figure-text status; it does not own the campaign's.

🔴 **The block below is retained as dated evidence and its numbers are SUPERSEDED.** In particular
its *"779 of 779 against our 504"* uses the bake-off's guarded reader — a third program, neither the
baseline nor the candidate — which is exactly the figure ruling R-2 forbids inheriting. The
acceptance harness re-derives every denominator on each run.

---

## ⏩ RESUME — state as of 2026-09-06 (superseded by the block above)

🔴 **THE READ LAYER IS BEING REPLACED, NOT REPAIRED.** [USER] decision, frozen at
[`docs/decisions/2026-09-06-figure-read-layer-respec.md`](../../docs/decisions/2026-09-06-figure-read-layer-respec.md);
its requirements have their own owner at
[`docs/superpowers/specs/2026-09-06-figure-read-layer-contract.md`](../../docs/superpowers/specs/2026-09-06-figure-read-layer-contract.md).
**`extract.py` + `pdftext.py` + `strip-text.py` (~239 lines) go. `figtext.py` + `compose.py` +
`svgout.py` (~401 lines) STAY** — arc reassembly, wrap-then-shrink, per-line font/colour and font
subsetting are real domain work no library provides, and two blind reviews left them untouched.

▶ **The reason, in one line the code wrote itself:** `_deps.py`'s docstring says *"pikepdf /
pycairo / Pillow are NOT repo dependencies — **this is an experiment, not a pipeline tool**."* It
was promoted by writing a plan around it, never by re-specifying it.

### The measured defect surface — [`TEXT-COVERAGE.md`](TEXT-COVERAGE.md) owns the numbers, re-run rather than quote

Denominator **1,148** CNXML `<image src>` basenames · **895** resolved · **779** text-bearing.

| defect | exposure | reader-visible? |
|---|---|---|
| text inside `/Form` XObjects — read as **zero** | **274 figures** | yes: English shipped |
| **`/Encoding /Differences` ignored** — `°C` → `¡C`, `λ` → `\x7f` | **96 of 280 EPS (34%)** | 🔴 **yes, AND it reaches the PAID MT** |
| **CID/`/Type0`** → plausible-looking control-byte garbage | **11 figures** | 🔴 **spend: can be marked `send:true`** |
| a mechanism **not yet named** (`CNX_Chem_20_01_recycle`, 103 words) | 1 | unknown |
| colour: only the `k` (CMYK) operator is tracked — `rg`/`g`/`sc`/`scn` are not | unquantified | wrong `fill` |

🔴 **THE DEV FIXTURE WAS ATYPICAL ON EVERY AXIS THAT LATER BIT.** `CNX_Chem_01_01_SciMethod` has
page-level text, blank runs only in *arc* blocks, no CID font, and is a `.pdf` in the base tree.
**Each is the minority case.** One fixture produced four independent wrong assumptions, and nothing
ever established a denominator for the tool.

### The candidate, and what its controls proved

**pdfplumber (MIT)** reads **779 of 779** against our **504**; **0 real character losses** anywhere
measured; it **corrects our output on 107 figures** (96 `/Differences` + 11 CID). All nine
`runs.json` fields are obtainable — six direct, `rot` from the text matrix, and **`adv` exact**
(consecutive chars measured at a 0.0000 gap).

⚠️ **Both regression signals were FALSE at first reading and had to be re-measured:** 155 apparent
regressions were a word-vs-character unit mismatch (0 real), and a 280/280 "gs loses everything"
was a regex matching Illustrator colour names. **→ [`TEXT-COVERAGE.md`](TEXT-COVERAGE.md) addenda 1 and 2.**

⚠️ **What is NOT established:** whether `gs` loses *some* EPS text. It produced readable text for
all 280 (7,884 words, 0 failures), and **it is the converter the pipeline already uses**, so it is
not a differentiator — but the only honest instrument is `check.py` against OpenStax's published
raster, and **no second EPS→PDF converter exists on this box** to cross-check with.

**Campaign status is the campaign register's (§C137/§C138), not this file's.**

---

## ⏩ RESUME — state as of 2026-09-05

**✅ THE EDITORIAL PIPELINE IS COMPLETE END TO END.** An editor opens a module, sees each
translated figure WITH ITS PICTURE, corrects the text, applies the decimal suggestion in one
click, approves — and the badge stays amber until the artwork is actually re-composed and
published. Merged: #435 (review surface) · #438 (Ⓐ card image, Ⓒ approved-means-published) ·
#440 (⑭ decimal) · #441 (⑰ publish where readers load it). ⚠️ **#440 and #441 are NOT DEPLOYED.**

🔴 **THERE IS NO "BULK RUN" ANY MORE — [USER] RULING 2026-09-05. FIGURES ARE STEP 3 OF THE
PER-CHAPTER LOOP.** The procedure's one owner is
[`docs/plans/2026-09-05-per-chapter-loop.md`](../../docs/plans/2026-09-05-per-chapter-loop.md);
status is the campaign register's. **This file keeps figure DESIGN evidence and defects. It no
longer owns a sequencing decision.**

⚠️ **GATE 2 BELOW IS WITHDRAWN — it inverted the loop.** It read *"let the re-MT land"* before any
images, which makes every figure wait on a book-wide text re-MT. The user's order is
**chapter → that chapter's figures → next chapter**, and that is precisely what removes the second
editor visit gate 2 existed to avoid. It is kept, struck through, because the reasoning is the
evidence for why per-chapter is right.

▶ **The remaining numbered items are no longer gates on a run. They are the WORK ITEMS for building
the chapter figure step**, and the loop document lists them in that form. *(This line said "THREE
THINGS" until 2026-09-05, when doing gate 1 turned up a fourth. A count written into prose beside
the list it counts drifts the first time that list grows.)*
1. **✅ THE WIRE HALF IS DONE (2026-09-05); THE DATA HALF IS NOT — AND THE GATE IS NECESSARY,
   NOT SUFFICIENT.** `translate-blocks.mjs` now requires `--book <slug>` and filters the
   glossary per block through the same three calls `api-translate.js` makes, so §C116's
   short-headword rule applies for free and the `glossaries` field is omitted rather than sent
   empty. **A run that cannot load a glossary REFUSES with exit 2** — a warning in a bulk run's
   scroll is a detector firing into a log, not a gate — with `--no-glossary` as the separate
   acknowledgement, the `--force`/`--adopt` idiom already on `main`, which item ⑯ legitimately
   used. The two refusal codes are distinct on purpose: `loadGlossary` returns `null` both for
   *file absent* and for *zero usable terms*, and those are a setup error and a data defect.
   ▶ **THE RULING STILL DOES NOT REACH FIGURES, AND THE PREDICATE IS CHECKABLE RATHER THAN A
   STATUS VERB:** `grep -c Celsíus books/efnafraedi-2e/glossary/glossary-unified.json` must be
   non-zero. Measured 2026-09-05 it is **0** against 2,006 terms. **A present, pre-051 glossary
   passes the wire gate while the ruling is still absent**, so do not read a green gate as a
   closed one. The remaining chain is **deploy** (051 asserts the ruling at server start) → **one
   2-hourly export-cron tick** (which rewrites `glossary-unified.json`) → **pull that commit**.
   The house-style ruling itself is merged; nothing is waiting on review.
   ⚠️ **Re-derive that last sentence rather than trusting it** — it was written the same hour the
   PR merged, and this file's neighbours record how fast such a line rots. `gh pr list --state all`
   and the `grep -c` above are the two instruments; neither is a sentence in a document.
   🔴 **AND THE MEASUREMENT THAT PAID FOR ITSELF: IMPORTING `translate-blocks.mjs` SPENT MONEY.**
   Every top-level statement ran at import — the paid translate loop included — so the first run
   of the new test made **8 live requests, 120 chars, 1.20 ISK, 0 failed**, from a test that had
   not yet asserted anything. The CLI body is now behind `api-translate.js`'s own
   `process.argv[1] === fileURLToPath(...)` guard, and `.env` is read inside it. **Independent
   confirmation, not reasoning: the test file's import time fell 50.49s → 195ms — those 50
   seconds WERE the API loop.** ▶ The shape is worth carrying past this file: **a module that
   does its work at import cannot be tested without doing its work**, and when the work is
   billable the test is a purchase. The cost here was trivial; a driver importing this across
   463 figures would not have been.
2. ~~**Let the re-MT land.** Figure ALT text is **19 of 627** translated (~3%) against ~99.7% of
   captions. Running figure text now makes an editor visit every figure twice, on two surfaces.~~
   🔴 **WITHDRAWN 2026-09-05 — this is the inversion.** The double-visit it worries about is real,
   and the per-chapter loop is what *solves* it: a chapter's text and its figures are re-MT'd in
   one pass, so the editor sees each figure once, with its chapter. Deferring images until a
   book-wide re-MT completes is what *guarantees* the second visit for every chapter after the
   first. **The measurement stands; the conclusion drawn from it was backwards.**
3. **Resolve the ~14 hash-suffixed figures deliberately.** The suffix marks a 2e-updated figure;
   string-stripping it sources the SUPERSEDED illustration, which `sources.py` warns is invisible
   in the output.
4. 🔴 **THERE IS NO DRIVER — AN UNLISTED FOURTH PREREQUISITE, FOUND 2026-09-05 AND NOT BUILT.**
   Measured, not assumed: `grep -ran translate-blocks` over the repo returns this register, the
   README, the file's own usage line and its test — **nothing invokes the MT stage**. Every
   stage here is single-figure by construction and they all communicate through `out/`, which
   holds whichever figure was extracted LAST: `extract.py` → `out/runs.json` + `out/meta.json`
   → `translate-blocks.mjs` → `out/translations-api.json` → `compose.py` → `out/translated.svg`
   → `publish-figure-svg.js`. ▶ **So "the bulk run" is not a flag on an existing tool; it is a
   stage that does not exist** — the 463 vector figures cannot be processed by repeating a
   command, because each would overwrite the previous one's `out/`.
   ⚠️ **`publish-figure-svg.js`'s basename cross-check is what makes that shared directory safe
   today** (it refuses when `out/meta.json`'s stem disagrees with the sidecar's figure), and it
   is the shape a driver must preserve rather than route around. **Do not build it unasked** —
   per-figure isolation is a design question, not a script.

**✅ SOURCE COVERAGE IS SOLVED — measured 2026-09-05, and it is no longer 4.5%.** The book
references **627** distinct figures; **463 resolve** through the real precedence tool and the
remaining **164 are PHOTOGRAPHS** (all `.jpg` in `01-source/media` — no vector text to translate).
The vector collection is effectively complete. `Myndir/` was reorganised, 7.9 GB of verified
duplicates deleted, and **[USER] ruled `selected-art` SUPERSEDES `base`**; precedence is wired in
the gitignored `sources.local.json` and `Myndir/README.md` records what each tree is.
⚠️ **`1. útgáfa` reads as "1st edition" but means "first download" and holds the 2e originals** —
that ambiguity produced a wrong conclusion once already; the trees are renamed for it.

**✅ Ⓐ AND Ⓒ ARE MERGED — 2026-09-04, PR #438 (`d9cd0998`), a merge commit so the three
individual SHAs survive.** Full suite on the branch was `19 failed | 5973 passed`, diffed BY NAME
against a baseline in both directions: **19 of 19 identical, 0 newly red, 0 cleared** — `main`'s
documented floor. **CI agreed independently: 19 failures across 9 files, name-identical.** E2E
6/6 (was 5). ⚠️ **This merge touched `books/`** (two `__e2e-fixture__/media/` files), so it arms
the content-backup stranding rule — deploy, or expect the next content tick to be rejected.
- **Ⓐ the card shows the figure.** `GET …/figures/:basename/image` reuses `resolveFigureRequest`
  (so no new traversal surface) and `translatedImageFor` resolves the English basename **forward**
  through `image-mapping.json` — no `_IS` anywhere in server or browser code, pinned by a test that
  greps the client for it. `loadImageBasenameMap` moved to `tools/lib/image-basename-map.cjs`
  because it became dual-consumer; `cnxml-inject` re-exports it, and an import-identity test pins
  that there is one implementation and not two.
- **Ⓒ approved now means the PUBLISHED IMAGE carries approved text.** 🔴 **The brief's own
  prescription — "`effectiveState` gains the `composedHash` condition" — DEADLOCKS THE FEATURE IF
  TAKEN LITERALLY, and every test that asks only "does approving write approved?" still passes.**
  `applyApprovedFigureEdits` writes the DERIVED state into the sidecar, so gating that one function
  makes it write `mt-preview` on every approval; `effectiveState` then short-circuits on
  `state !== 'approved'` and the composer's later stamp can never flip it. **`approved` becomes
  unreachable, permanently.** ▶ **The shape that works is TWO layers:** `editorialState` (did an
  editor approve these exact blocks — what gets WRITTEN) and `effectiveState` (…and was the SVG
  composed from them — what every reader-facing surface SHOWS). Pinned by a test asserting the two
  DISAGREE on a real state, so nobody can quietly alias them.
  ⚠️ **And `applyApprovedFigureEdits` must READ the sidecar first and carry `composedHash`
  forward** — it rebuilds the whole file, and `composedHash` is written by `compose.py` and by
  nothing on the server side, so dropping it would un-compose every figure on the next approval
  with no error and no failing count.

**✅ THE REVIEW WORKFLOW IS BUILT AND REVIEWED — merged as #435 (`f90b335e`), 8 SDD tasks.** Unit suite matches `main`'s own red baseline exactly (19 failing
assertions across 9 files + `findTermsGolden` as a 10th zero-assertion red — all inherited, none
added); E2E 5/5. 🔴 **A seven-lens adversarial whole-branch review found a CRITICAL that eight
task reviews had missed:** the renderer keyed the figure sidecar on the POST-inject `_IS`
basename while every writer keys on the English one, so `data-figure-review` fired on **zero**
production figures. Fixed by inverting `cnxml-inject`'s own image mapping — **no `_IS` literal in
code**, since that suffix is an enforceable value owned by `generate-image-mapping.js`. ▶ **It
survived every earlier gate because the committed render test's fixture used a PRE-INJECT `src`
shape production never produces for a translated figure, so both its directions passed for the
wrong reason.** ✅ **THE THREE OPEN QUESTIONS ARE RULED — [USER], 2026-09-04.**
**Ⓨ Flagging writes the editor's current blocks into the committed sidecar: KEPT AS IS.** The
renderer's only channel IS the sidecar — `cnxml-render.js` has no DB access, deliberately, because
that is what keeps MIT `tools/` from importing AGPL `server/` — so a flag that did not write the
sidecar would be invisible to the renderer and the badge is the whole feature. `applyApprovedFigureEdits`
writes a DERIVED state, never the raw column, so nothing can be stamped `approved` unreviewed.
*(That derived value was `effectiveState` when this was ruled and is `editorialState` since Ⓒ
landed — see the two-layer note above. The ruling is unaffected; the function name is not.)* The
alternative — write the state but keep the previous blocks — trades a visible, correctly-labelled
record for a silent divergence between the card and the sidecar.
**Ⓐ The card must show the figure: DO IT, via a SERVER-SUPPLIED image URL in the `/figures`
payload.** Measured: this app serves no `/content` route at all — that path is vefur's — so the
plan's `<img>` URL would 404 on every card for every book, and it would hardcode `_IS`, an
enforceable value owned by `generate-image-mapping.js`. Putting the URL in the payload keeps the
suffix on the server, where the mapping already lives, instead of duplicating it into browser JS.
**Ⓒ "Approved" must mean the PUBLISHED IMAGE carries approved text: close it by comparing two
hashes already in the sidecar.** Today `applyApprovedFigureEdits` writes `state` and `renderHash`
in the same call, so `effectiveState` reduces to `sidecar.state` exactly and the hash can only fire
on a `COMPOSER_VERSION` bump — never on an editorial event. Nothing in the server invokes the
composer (grepped: a constant and a comment, nothing more), so an editor can approve and the
published SVG still carries the old text with every surface reporting approved.
▶ **The fix keeps staleness DERIVED, which is this feature's whole design:** the composer stamps
`composedHash` into the sidecar when it writes the SVG, and `effectiveState` reports `approved`
only when `composedHash === renderHash`. **No extra file read** — both values are already in the
sidecar — and it inverts the flow correctly: approve → still `mt-preview` → run the composer →
`approved`. ⚠️ Exposure is **0 today**: there are no figure-text sidecars anywhere in `books/`. It
becomes real on the first genuine approval.

⚠️ **Superseded framing, kept because the reasoning is still the evidence:**
(1) approving does not re-run the composer, so `approved` can describe text that is not in the
published SVG — the spec's own flow is "approve, then run the composer CLI"; (2) flagging is the
only path by which unapproved editor text reaches a committed sidecar, because the renderer's
only channel IS the sidecar (it has no DB access, by the MIT→AGPL design). **18 Minor findings
are triaged in the branch's `deferred-minors.md`.**

**Formerly in flight:** the *review* workflow that wires a translated figure into the editorial
pipeline — a committed sidecar for the Icelandic text, DB rows for review state, an
`effectiveState` that is **derived** rather than stored, a render-side badge, advisory
consistency checks, and an editor surface. Branch **`feat/figure-text-review`**, plan
[`docs/superpowers/plans/2026-09-02-figure-text-review-workflow.md`](../../docs/superpowers/plans/2026-09-02-figure-text-review-workflow.md).
▶ **Per-task state lives in that plan's SDD ledger and in `git log`, never here** — a task
count written into prose is stale by the next commit.

✅ **DONE — the two follow-ups this block used to point at.** Both merged 2026-09-04 as PR #438;
see the Ⓐ/Ⓒ note at the top of this RESUME for what landed and for the one trap the brief itself
walked into. The brief remains at
`docs/superpowers/plans/2026-09-04-figure-text-followups.md` as **evidence, never status** — per
CLAUDE.md § One source of truth, this file is the owner and it wins on any disagreement.

⚠️ **One prescription in that brief is WRONG AS WRITTEN and the file has not been edited to say
so** (it is a plan, and plans are frozen once executed): *"`effectiveState` gains the
`composedHash` condition"*. Taken literally it makes `approved` permanently unreachable — see Ⓒ
above. Anyone re-reading that brief should read it alongside this entry.

**Superseded — the earlier next action:** ⑭ (number localization — the LOCALIZE class still
passes through untouched) is the largest open correctness gap, and it now has a consumer: the
advisory decimal-separator check flags it for an editor, but nothing yet transforms it.

🔴 **THIS BLOCK WAS WRONG UNTIL 2026-09-03 AND THE ERROR IS WORTH KEEPING.** It read
*"Nothing is wired into the publication pipeline and nothing has been bought from the MT …
All Icelandic produced so far is placeholder probe text"* and *"Next action: decide the output
format (item ① below)"*. Both were already false when written down here: `efd97384` had added
⑯ (a real, paid, evidenced MT run) and `3e446f6d` had settled the format as SVG — as item **⑤**,
not ①, so even the cross-reference pointed at the wrong item. **The commit that falsified a
claim did not delete the claim**, which is precisely CLAUDE.md's stale-premise rule: a premise
does not acquire a date from the block that carries it. Verified by opening
`evidence/api-run-tempscales.json` (8 blocks, `when` 2026-09-02T19:23:21Z), not by re-reading
the prose.

---

## ⚠️ Known hazards of the shipped read layer — recorded 2026-09-07 (M5 R5)

**These are RECORDED, not fixed.** Evidence and denominators live in
[`READ-LAYER-ACCEPTANCE.md`](READ-LAYER-ACCEPTANCE.md); this section owns their status.

### ① A PRICED HAZARD: `_looks_undecoded` can condemn a correctly-read glyph, and since R4b that means a real label is never bought

`readlayer._looks_undecoded` treats **every** character below `0x20` as evidence the font could not
be decoded. But under an `/Encoding /Differences` font **`\x1f` is a REAL GREEK ALPHA** — `'\x1f
bond'` is a genuine block key in this corpus — so that is a correct read being called garbage.
⚠️ **That block key is BASELINE-VINTAGE**: it is what the OLD reader produced. The shipped reader
decodes `/Differences` correctly and emits no such key, which is why the hazard is latent rather
than firing.

🔴 **THE CONSEQUENCE CHANGED WITH R4b AND GOT MORE EXPENSIVE.** The predicate now also decides
**spend**, through `figtext.sendable`. Before R4b the effect was *"a font is flagged"*; now it is
**"a real label is never sent to the MT, and therefore never translated"** — a silent omission from
a purchased chapter, invisible to any count, because the block simply is not in the payload.

⚠️ **It is LATENT, not firing: measured 2026-09-07 over the FULL 817-figure in-scope population,
the candidate emits `\x1f` on 0 figures and ANY sub-`0x20` control byte on 0 figures.** *(The code
comment records 0 across 120 figures; this is the wider re-measurement.)* The zero is worth
something only because the same pass proves the reader emits no control bytes at all — an absence
paired with the positive fact that would have to be false for it to be vacuous. **It was left alone deliberately:** the fix must change the judge's
`classify_type0` in the same breath. The two predicates are *deliberately identical*, and a reader
whose `decodable` flag disagreed with the judge would declare a font readable and then be marked
`FAIL-silent` for its own correct output. That is a larger change than R4b's decision-unit
correction, and doing half of it is worse than doing none.

▶ **If this is ever picked up, the unit of work is BOTH predicates plus a fixture that exercises a
`/Differences` font mapping a sub-`0x20` byte to a real glyph** — the corpus does not currently
supply one, which is exactly why it went unnoticed.

### ② The census is BASELINE-VINTAGE by design — never quote it as a description of the new reader

`census.py` and `text-coverage-census.py` still read through `pdftext.py`, so they report **NO LIVE
TEXT** on the form-text figures. 🔴 **That is CORRECT and deliberate, not a stale tool.** The census
describes the corpus **as the OLD reader saw it**, which is precisely what makes it the partition —
and the baseline — that the acceptance result is stated *against*. Re-pointing it at the new reader
would destroy the comparison it exists to enable.

▶ **The consequence you must honour: label every census-derived number baseline-vintage, and never
present one as evidence about the shipped read layer.** [`TEXT-COVERAGE.md`](TEXT-COVERAGE.md)
carries that warning in its own header as of 2026-09-07.

⚠️ **`ours-crashes` is a census bucket name that describes the CENSUS.** `text-coverage-census.py:59`
calls `pg.Contents.read_bytes()`, which raises when `/Contents` is an **array** — the *baseline
reader* reads almost all of that bucket perfectly well. Counting it as a reader failure inflates the
defect surface.

### ③ R3's `/Form` walk is a NO-OP on every EPS-sourced figure — and the reason is the converter

Ghostscript's `pdfwrite` emits **no `/Form` XObjects**, so the walk R3 exists for cannot execute on
an EPS source at all. Text removal itself is clean on EPS. ▶ **Consequences:**

- **R-9's failure mode is unreachable on EPS**, so the two-armed artwork-survival control has an
  **empty population** there. That is a null with a denominator, not a pass.
- ⚠️ **State it as a property of `gs`, not of EPS.** The measurement is *"gs's output carries no
  forms"*, **not** *"EPS files contain no form-like structure"* — the original PostScript may well,
  and `gs` flattens it. It holds operationally because the pipeline always routes EPS through `gs`.
- ⚠️ **The census and the probe both sit downstream of that same `gs` invocation**, so their
  agreement corroborates the converter's behaviour rather than giving two independent views.

🔴 **AND THE R-9 CHECK MUST NEVER BE "no reachable stream contains `BT`" ALONE.** Measured over 25
real `.pdf` figures carrying forms: the `make_stream` mutant leaves **0 of 25** with any `BT`
remaining — identical to the correct implementation — while destroying artwork on 8 of them, worst
case down to **2.5%** of the ink the shipped code preserves. **The BT assertion passes on the
wreckage.** Only the non-white pixel count sees it, and on 17 of 25 figures the two arms are
pixel-identical, so **a regression is invisible on two thirds of the figures you might sample.**

### ④ OPEN — a large minority of shared-scope figures move a block's GEOMETRY by >1pt, and it is not all re-segmentation

Raised by the R5 implementer and handed to the controller; priced here 2026-09-07.

**What was measured.** 🔴 **THE COUNTS ARE `READ-LAYER-ACCEPTANCE.md`'s (C4) AND ARE NOT RESTATED
HERE** — this file's own ⏩ RESUME says so ninety lines above, and until 2026-09-07 this section
restated them anyway, which is exactly the drift that rule exists to stop. Read the C4 table there
for the in-scope denominator and the geometry-differs figure count; the JSON rows behind it carry
the per-figure detail. **What is this section's to own is the SHAPE of the finding, which no other
document holds:** a minority of the moved figures also change block keys — expected, since the two
readers segment differently by design (ruling R-10) — but a residue have an IDENTICAL key multiset,
and most of those carry no duplicate keys at all, so the pairing is unambiguous and the block
genuinely moved.

**Controller pricing.** The moved BLOCK count across those figures is likewise C4's to report.
⚠️ **The obvious story — "it is only axis tick labels" — was tested and does NOT hold.**
Numeric keys are **44%** of the moved set against a **33%** baseline among ordinary block keys:
real enrichment, not domination. 66% are ≤4 characters, but long multi-line labels moved too
(`'Large molecules:|- High boiling point|- Not very volatile|…'`). **The control is what killed
the tidy explanation; without it this would have been filed as a non-finding.**

**Why it is OPEN rather than a defect.** The prior favours *correction*: R2 measured the old
reader's advance as **64.517 where the real distance to the next glyph is 67.019**, and its
`size` as a per-glyph *width* on rotated text — both of which misplace a block. A more accurate
reader SHOULD move things. But "should move" is not "moved correctly", and nothing here
establishes which.

🔴 **The right instrument is a COMPOSED-IMAGE diff, not a coordinate delta** — the question is
whether a reader sees the label in the right place, and only the composition answers that. That
belongs with the driver work, which is what first composes figures at scale.

✅ **Live exposure today is ZERO**: the only block-keyed sidecars in the repo are 3, all under
`books/__e2e-fixture__/`. Nothing has been bought against either segmentation.

### ⑤ OPEN — two glyph-advance classes survive the R5 fix round, and one of them BUYS the wrong thing

Recorded 2026-09-07, because `readlayer._prepare`'s docstring points here and a pointer to no
record is worse than no pointer. **Both are bounded, both are named, neither is fixed**, and the
reason is the same in both cases: the repair is a **writing-mode branch in the run splitter**, which
changes the layout layer the [USER] ruled is KEPT *and* changes `blockkey.block_key` — the unit that
is BOUGHT. **That is a scope decision, not an implementation detail.**

**(a) `/Type0 /Identity-V` vertical text is still one run per glyph.** What WAS fixed is only the
advance's SIGN: pdfminer reports a correctly NEGATIVE advance for downward text, `_prepare` used to
project it onto a horizontal model unchanged, and it now substitutes the glyph's own axis-aligned
extent and counts the substitution into `meta['adv_repaired']`. **That does not re-merge the
glyphs**, because `_continues` splits on the PROJECTION — which does not move at all for vertical
text — and not on the advance. So the periodic-table group labels on `CNX_Chem_02_05_PerTable2` are
still emitted as one-word blocks, and `figtext.sendable` returns True for them: **`'earth'` and
`'metals'` are bought as standalone Icelandic translation keys, out of the context that makes them
translatable, and `'metals'` is one key covering two different labels.** Live exposure is the same
as ④'s and for the same reason — nothing has been bought against this segmentation — but this one
is a *wrong* key rather than a *moved* one.

**(b) The no-`/W`/`/DW` constant-advance class is untouched, deliberately.** A `/Type0 /Identity-H
CIDFontType2` whose descendant declares neither `/W` nor `/DW` makes pdfminer fall back to the spec
default of 1.0 em, so every glyph reports the same advance whatever its shape. **No bound can
distinguish that from a real advance** — it is positive and plausible — without reading the font's
width tables, which is the same design change as (a). `CNX_Chem_03_02_moles-6296` is the measured
instance, and `test_readlayer.py` CASE 6d carries it as an explicit CONTROL: it must report NO
repairs, so a future fix that "repaired" everything indiscriminately goes red.

**(c) `figtext.is_arc` misclassifies straight text, and is now NAMED rather than fixed.**
`len(b) > 3 and all(len(r['text'].strip()) <= 1 ...)` calls any block of four-plus single-character
runs an arc, curved or not — which is exactly what (a) and (b) produce. `compose.fit_circle` used to
divide by zero on the collinear result, or return a centre ~1e15 pt away and draw cancellation
noise. **It now returns None for a block with no usable circle and the caller draws it straight and
PRINTS the key**, under `!! N block(s) is_arc says are arcs but have no usable circle`. ▶ **That is
a crash guard, not a classification fix**: the block is still the wrong unit, and the printed keys
are the evidence for whoever revisits `is_arc`. The guard is deliberately NOT in `is_arc` itself,
because `is_arc` feeds `block_key` and changing it would move purchased keys corpus-wide to fix a
drawing crash.

⚠️ **The counts and the per-figure detail are the review findings' and the fix report's; they are
not restated here** — this file's own ⏩ RESUME says no number is restated in it.

### ⑥ Not exercised, stated rather than left silent

The census's **`unresolved` rows have no file to stage** (nothing is measurable on them), and no
**second EPS→PDF converter** exists on this box, so whether `gs` itself drops text before either
reader sees it is unanswerable by any reader-vs-reader check.

---

## Settled

- **⑯ THE PIPELINE IS PROVEN ON REAL MT — one figure, end to end, 2026-09-02.**
  `CNX_Chem_01_06_TempScales`, 8 prose blocks, 120 chars, **1.20 ISK**, 8/8 succeeded, 0 failed.
  Sent **without a glossary** deliberately, per §C73: the unprompted rendering is the control.
  Quality was good unprompted — `Boiling point of water` → **Suðumark vatns**,
  `Freezing point of water` → **Frostmark vatns**, `180 Fahrenheit degrees` →
  **180 gráður á Fahrenheit**, `Celsius` → **Selsíus**, `100 Celsius degrees` →
  **100 Selsíusgráður**, `100 kelvins` → **100 kelvin**; `Fahrenheit` and `Kelvin` correctly
  unchanged. Criteria were fixed before the run in `CRITERIA-run1.md`. Evidence:
  [`evidence/11-first-real-malstadur-run.png`](evidence/11-first-real-malstadur-run.png),
  [`evidence/api-run-tempscales.json`](evidence/api-run-tempscales.json).
  ⚠️ **These are NOT approved translations and are not in `books/`** — human approval gates
  content, and nothing here goes near the publication tree.
- **⑨ CORRECTED 2026-09-03 — this said "No real MT has been run" and sat under *Open* while
  ⑯ sat under *Settled* recording one.** ⑯ is the measured claim: `efd97384` added it with
  evidence on disk (`evidence/api-run-tempscales.json`, 8 blocks, `when`
  2026-09-02T19:23:21Z) and left ⑨ standing. **Real MT text exists for exactly one figure**
  (`CNX_Chem_01_06_TempScales`); everything else in this experiment is still placeholder probe
  text, so the *scope* half of the old claim survives and the *existence* half does not.
  ▶ The two halves are worth separating, because they license different things: placeholder
  text is free to regenerate, and the one real run is the only evidence the wire behaves.

- **⑥ AUTO-WRAP IS BUILT — and the real run is what forced it.** The MT returns ONE string per
  block, so a 3-line English label came back as one long line and the only lever left was font
  size: `180 gráður á Fahrenheit` fell to **5.75 pt** beside 9 pt neighbours. The composer now
  **wraps to the block's width budget first and shrinks only as a fallback** for a single
  unbreakable word. After: every block on that figure renders at the full 9 pt with **no shrink
  at all**. ▶ **A placeholder translation could never have found this** — I had been feeding the
  composer pre-split lines, which is exactly what the MT does not return.

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

### From the review-workflow branch (`feat/figure-text-review`) — 18 triaged findings

A seven-lens adversarial whole-branch review plus eight task reviews produced 18 Minor findings
that were deliberately NOT fixed (the SDD rule: Minors never enter a fix loop, because that is how
loops stop converging). **They are recorded here because the branch's `deferred-minors.md` lives in
a gitignored workspace and would otherwise die with it** — a correct record in an unreachable
location is no record.

**Two were flagged as worth acting on before merge — the first is now fixed, the second is still
open:**
- ✅ **FIXED 2026-09-05 — unsaved edits in sibling blocks are no longer discarded on every save.**
  *(As found: saving one block re-fetched and rebuilt every card from the payload, so corrections
  typed into other blocks were lost with no warning and no draft. The note input went the same
  way. Silent loss of editorial input is the one thing this application exists to prevent.)*
  Both layers landed, per [USER]: the rebuild carries unsaved text forward and MARKS it, and a
  `fig-draft:` localStorage draft survives a reload or a crash. The decision — which values are
  genuinely unsaved — is a pure, dual-loadable module (`server/public/js/figure-drafts.js`)
  precisely because **E2E is a separate CI job that `npm test` does not run**, so a rule gated
  only in the browser is gated by nothing the authoritative suite sees.
  🔴 **THREE TRAPS, EACH OF WHICH WOULD HAVE SHIPPED SILENTLY.**
  ① `loadModule` sets `currentModuleId` FIRST and calls `loadFigures` LAST without awaiting it,
  so there is a window where the variable names the new module while the DOM still holds the
  previous one's cards — capturing there files one module's text under another's id. The fix is a
  separate `figuresModuleId`, checked by every DOM read and by the draft timer.
  ② The draft restore **cannot** live in `loadModule`: the inputs it writes into are created by
  `renderFigureCards`, inside the un-awaited `loadFigures`.
  ③ `tabGuard.cleanupStaleDrafts` sweeps a **hardcoded prefix list**, so a third draft namespace
  would never have been cleaned — accumulating in the editor's browser forever with nothing
  failing anywhere. **Found by a test that ran the REAL sweep and asserted the consequence**, not
  by one asserting the array contains a literal (two sides from one token, the shape CLAUDE.md
  calls blind to damage); it carries a control — a FRESH key must survive — so a sweep that wiped
  everything could not pass.
  ⚠️ **The E2E assertion synchronises on the RE-FETCH, not the save.** Every added assertion is
  already true the instant before the click — the text is in the input, the marker set by typing —
  so asserting after the click would pass against a card that never rebuilt, i.e. against the bug.
  ⚠️ **No fourth fixture, deliberately:** m68664 references `CNX_Chem_01_01_WaterDom` with **no
  sidecar**, and that absence is load-bearing — the first test binds "four figures, three cards"
  as its proof that a sidecar-less figure is skipped. Giving it a sidecar would strip a check of
  its proof. The sibling block is typed into and **never saved**, so it writes no row and leaves
  the sidecar pristine.
- **The `beforeAll` pristine gate fires on exactly the crashed-run state `beforeEach` exists to
  repair**, so a hard-killed E2E run leaves the recovery path sequenced behind its own alarm.

**The rest, by theme:**
- *Untested surfaces* — the caption-warning render branch has zero coverage (fixtures deliberately
  emit none, and it reads different fields from the decimal branch, so a misspelled field ships
  green); migration 050's idempotency assertions pass by construction; the figure write routes'
  `isText`/`note` guards are bound by no test; the APPROVED→no-badge render direction is never
  rendered.
- *Absences that look like success* — a failed `/figures` fetch renders identically to "no
  reviewable figures", and empty **is** the ordinary case for ~1,500 untranslated figures; a
  malformed sidecar is indistinguishable from an absent one and silently hides its figure.
- *Not wired up* — `orphans` is computed at three points and consumed by nothing.
- *Known-unguarded* — the two `sendFile` dot-segment fixes are untested in CI, because CI checks
  out to a dot-free path and any naive test would pass with or without them; a real one must
  construct a dot-bearing temp directory.
- *Path hygiene* — `cnxml-render.js`'s `BOOKS_DIR` is a bare relative literal hardcoded to one
  book, and the in-process preview never sets it, so **the editor preview shows no badge for any
  book while the CLI publish path is correct**. Found independently three times. Latent hazard:
  run the server from the repo root and a preview of one book would read another's sidecars.
- *Smaller* — a duplicated `CONTROL:` test; `nearVariant`'s case-folding widens a pre-existing
  false-positive surface; per-figure `readFileSync` on every render; two fixtures hardcode
  `version: 1` instead of importing `SIDECAR_VERSION`; `referenceText` assembly sits in the router
  against the plan's "thin router" constraint; the state transition is not atomic across DB and
  sidecar.


- **✅ ⑰ CLOSED 2026-09-04 — the composed figure now reaches the tree readers load, and
  `composedHash` means what it says.** `tools/publish-figure-svg.js` copies `out/translated.svg`
  to `books/<slug>/media/<mapped name>` and stamps the sidecar there.
  🔴 **IT IS JS, AND THAT RETIRED A RULE RATHER THAN GUARDING IT.** The stamp had briefly lived in
  `compose.py`, which put a *copy-don't-compute* obligation in Python that a pin had to police.
  Moving it beside `computeRenderHash` means **there is no hashing in the Python tree at all** —
  an absence is cheaper to keep true than a discipline. `figtext.stamp_composed_hash` and its
  Python test were **deleted** in the same change; the mapping lookup likewise keeps its one owner,
  so `DEFAULT_SUFFIX` is never restated.
  🔴 **THE GUARD THAT MATTERS IS THE BASENAME CROSS-CHECK.** `out/` holds whatever figure was
  extracted LAST; the sidecar says which figure the TEXT is for. The publisher compares
  `out/meta.json`'s source-PDF stem against the sidecar's filename and **refuses if they differ**.
  Without it, publishing puts figure A's artwork under figure B's translations — a correct-looking
  translation of the wrong picture, the same class of silent error `sources.py`'s edition
  precedence prevents one stage earlier. **Neither side can catch it alone.**
  ⚠️ **Publishing REPLACES a reader-visible file, deliberately.** [USER], 2026-09-04: the June
  Cowork figures were a **test run** — freestyle translation, a few manual corrections, **no
  editorial surface at all** — published as MT preview. Replacing them with pipeline output an
  editor can review, and which the renderer badges `mt-preview` until approved, is the entire
  point. All 691 are git-tracked, so `git checkout` is the restore; the tool writes no `.bak`.
  ⚠️ **An unapproved sidecar has no `renderHash`, so nothing is stamped** — and that is the
  ORDINARY case under the plan (publish the MT, review afterwards), not an error.
  ⏭️ **What ⑰ does NOT do: the bulk run.** This publishes ONE figure. Running all of them through
  extract → MT → compose → publish is the next piece, it is where Málstaður money is spent, and it
  needs its own approval. ⚠️ **Expect the review queue to have real work in it:** ⑯'s paid run
  produced `Selsíus` where the book says `Celsíus` **24:5** in committed MT output and **31:13** in
  published HTML — the minority variant, and exactly what `captionDivergence` flags. That is the
  editorial surface earning its place, but it may also be a glossary question.

- **⑭ NUMBER LOCALIZATION IS AN EDITORIAL ACTION, NOT A TRANSFORM — [USER]-ruled 2026-09-04,
  and the one-click path is BUILT.** The gap: `373.15 K` / `273.15 K` / `233.15 K` are correctly
  held off the MT wire and correctly kept verbatim, but Icelandic writes them `373,15 K`. Three
  of nine verbatim blocks in one figure.
  ✅ **What shipped:** the advisory decimal check already computed the corrected string; the
  editor card now offers a **`Nota`** control that applies it as an ordinary block edit. Because
  it is an ordinary edit, `renderHash` moves and the figure correctly returns to `mt-preview`
  pending re-approval and re-compose — Ⓒ's machinery, reused rather than duplicated.
  🔴 **RULED: it is OFFERED, never applied automatically.** A wrong conversion silently changes
  a number in a chemistry textbook, which this project calls the worst available failure, and
  CLAUDE.md's own clean-break rule says that when an editor can do it in the UX you do not build
  black magic. The sidecar therefore keeps recording exactly what a human approved.
  🔴 **THE RULE HAS ONE OWNER — `tools/lib/figure-consistency.cjs`.** The browser posts the
  server's `suggested` string verbatim and computes nothing; a pin asserts the client contains no
  digit character class at all, because a second implementation would drift silently and the
  first is the one that knows Icelandic **inverts both separators** (a blind `.` → `,` turns
  `1,000` into `1.000`).
  ⚠️ **The guard that is easy to get wrong:** the suggestion is derived from the **saved** text,
  so the control is DISABLED while the input differs from it. Applying a stale suggestion over
  unsaved typing would discard it silently; recomputing client-side to cope is the wrong fix, and
  is what the no-digit-class pin forbids. Both directions are E2E-tested and both were
  mutation-verified (posting `input.value`, and removing the guard, each kill the test).
  ⚠️ **CORRECTED 2026-09-04 — THE MOTIVATING EXAMPLE IS ALREADY CORRECT FOR READERS.** This
  entry reads as though `373.15 K` reaches a reader unlocalized. It does not: the PUBLISHED
  `CNX_Chem_01_06_TempScales_IS.svg` already says `373,15 K` (see ⑰ — the corpus was translated
  by an external process in June). What carries `373.15` is **this pipeline's own re-composition**
  of that figure, which no reader has seen. ▶ **⑭ is therefore a gap in the NEW pipeline, not a
  live defect on the site** — still worth closing, since anything this pipeline composes in future
  goes out with it, but it is not a reader-facing bug and should not be prioritised as one.
  ⏭️ **STILL OPEN, deliberately:** a verbatim block reaches the composer untouched unless an
  editor clicks, so every figure carries editorial cost. Also NOT built, for want of a single
  measured instance: US thousands (`1,000` → `1.000`) and numbers with adjacent punctuation.
  **The whole measured corpus is `180`, `100`, `37.5` and the three temperatures above — zero
  thousands separators** — and each widening changes the base rate of a check on the rule above.
  `tools/lib/mathml-to-latex.js` already classifies `us`/`is`/`integer` and is what to reuse if
  that day comes.
- **⑮ Label-to-artwork anchoring is unsolved when the line count changes.** The composer now
  preserves a block's vertical CENTRE (top-anchoring was clearly wrong — a 3-line English
  label replaced by 1 Icelandic line floated above the thing it labelled). But TempScales
  shows centring is not universally right either: `Boiling point of water` relates to its
  rule via its LAST line, so a 3→2 line change still shifts it. **Nothing in the extracted
  data says what a label points at**, so no anchoring rule can be universally correct — this
  needs either a proximity heuristic against the artwork or an editor's eye.

- **⑦ Type0/CID fonts are unreadable by this parser.** 1 of 36 chapter-1 figures
  (`CNX_Chem_01_02_decomp`). `pdftotext` reads it fine, so the file is not the problem.
- **⑧ Arc text is approximate.** The span is centred on `(angs[0]+angs[-1])/2`, but
  `angs[-1]` is the last glyph's *origin*, so the reconstructed span is short by about
  half a glyph. Visibly fine for new text; not registration-exact.
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

## ⚖️ [USER] RULINGS 2026-09-06 — M5's design constraints, taken before any code

**① FIGURES PUBLISH STRAIGHT TO `mt-preview`. THERE IS NO APPROVAL GATE, AND M5 MUST NOT BUILD ONE.**
> *"MT figures go straight to mt-preview. That is the pipeline working. Editors work on MT-preview content. When that has been edited and approved, it moves to faithful."*

▶ **The editor's role on a figure is to NOTE that it needs fixing, not to approve it.** Noted images are re-run through the **CLI, periodically and in batches**.
🔴 **AND THE TWO TRACKS ARE DECOUPLED PER ASSET CLASS: a module may reach `faithful` while still carrying `mt-preview` IMAGES.** *"Re-running images through CLI does not gate faithful text."*
⚠️ **CONSEQUENCE THAT IS NOT OURS TO IMPLEMENT: the MT-preview LABEL is per-asset-class, not per-module** — text can be faithful beside machine-translated pictures, and both are labelled on the website. **The label lives in vefur**; efni only has to make the state distinguishable. → hand it over before the first figure chapter is synced.
🔴 **CORRECTED WITHIN THE HOUR BY [USER] — M5 IS A HARD PRECONDITION FOR EDITING, AND THE SENTENCE THIS REPLACES SAID THE OPPOSITE.** It read: *"This retires the ordering argument that M5 must land before the first editorial pass … M5's deadline is softer than the loop plan's M5/M6 wording implies."* **That inference was wrong and it was mine, not [USER]'s.**
> *"M5 is necessary before we start editing, as the images should appear with their corresponding module, so editors can comment on them if needed, without revisiting the modules. Each module is a one-pass edit, and a one-pass approval with a batch run of images when convenient."*

▶ **THE DISTINCTION THE ERROR MISSED: the FIX may be batched; the PRESENCE may not.** *"Re-running images does not gate faithful text"* licenses deferring the **re-run**, never the **arrival**. **One-pass edit + one-pass approval means the editor sees a module exactly once** — an image absent during that pass is either never commented on, or forces the second visit the whole design exists to avoid.
⚠️ **So the loop plan's M5/M6 ordering stands as written, and figures remain a step INSIDE the loop.** ▶ **Do not buy another chapter's TEXT expecting to edit it before its figures exist** — that is the same inversion the withdrawn gate 2 made, arrived at from the opposite direction.

**② THE GLOSSARY COMES OFF THE FIGURE MT LEG TOO.** [USER] 2026-09-06, on top of §C133.
✅ **DONE 2026-09-07 (M5 Task 5, commit `153858a3`) — AND THE PRESCRIPTION THIS REPLACES WAS REFUTED BY MEASUREMENT, SO DO NOT RE-DERIVE IT.** The sentence here read: *"`2e69a637` … IS NOW INVERTED AND MUST BE REWRITTEN, NOT DELETED — a gate that refuses without the glossary becomes a gate that refuses WITH it."* **The second half is unsatisfiable.** Measured on the committed `out/blocks.json`: **11 of 14 blocks would carry `opts.glossaries`** under chemistry's glossary, so "refuse if any block would carry one" makes the tool refuse every ordinary `--book` run — and the plan's own acceptance step demanded `--book efnafraedi-2e --dry-run → exit 0` from the same design. It also makes `--book` a self-destruct flag, which the plan forbids one level up.
▶ **What shipped instead: the DEFAULT moved to bare.** `main()` never loads a glossary, and the gate became a **pre-flight invariant** asserting no block's `opts` carries one before the first paid request. That is still an inversion rather than a deletion — **the leg is not silently ungated**, which was the real point — and it breaks **0** of the 12 existing tests, where gutting `resolveGlossaryOrRefuse` breaks 4.
⚠️ **Three sites had to move with it and none was in the plan:** the status print, `glossaryRecord` and `_source` all keyed on the `--no-glossary` FLAG rather than on what actually rode the wire, so a default `--book efnafraedi-2e` run would have stamped `glossary efnafraedi-2e (N terms)` provenance on a run that sent nothing. **Key a provenance field on the OUTCOME, never on the flag that was supposed to cause it.**
⚠️ `--no-glossary` survives in `KNOWN_FLAGS` as an accepted no-op — removing it would make it an unknown flag (exit 2) and break a caller. The three `resolveGlossaryOrRefuse` refusal codes are now unreachable from the CLI and alive only in tests; that is stated in the commit and in a banner on the function rather than papered over.
▶ **The argument is stronger for figures than for prose:** figure text is labels and captions — short, fragmentary, often a single noun — which is exactly where a flat context-free map does its worst work, because there is no sentence to disambiguate against. §C116's short-headword hazard bites hardest here. **And a wrong figure label is worse than wrong prose: a reader cannot infer around it, and it is baked into an image rather than editable in the segment editor.**
⚠️ **The counter-argument, recorded because it is real and will return:** labels are precisely where consistency WITH THE BODY TEXT matters most. That argues for the editor's terminology assistant eventually reaching figures (→ `docs/plans/2026-09-06-editor-terminology-assistant.md`), **not** for a flat map on the wire.

**③ SCOPE IS CHEMISTRY 2e ONLY, AND ORGANIC IS BLOCKED ON AN ASSET WE DO NOT HAVE.**
🔴 **`01-source/media/` IS NOT THE ARTWORK AND IS NOT A SUBSTITUTE — FOR EITHER BOOK.** It holds published RASTERS (chemistry 1,529 jpg; organic 5,257 jpg). Text baked into pixels cannot be extracted or replaced. ▶ **The translatable asset is the OpenStax artwork delivery (PDF/EPS with live text objects), which lives OUTSIDE the repo** at a machine-local path in the **gitignored** `sources.local.json`. **That file has exactly one book key: `efnafraedi-2e`.**
▶ Chemistry's artwork, measured across both trees: **2,238 pdf · 1,312 svg · 516 eps** (+1,494 jpg, 71 psd, 67 png).
⏳ **[USER] will request Organic's artwork from OpenStax 2026-09-07; previous responses took a couple of days.** ▶ **So design the driver book-agnostic and run it on chemistry — Organic must need a `sources.local.json` entry and nothing else.**
⚠️ **The two-tree precedence is load-bearing and already has code + a test (`sources.py`, `test_sources.py`): `selected-art` (updates-2e) WINS over `base`.** Measured while planning: `selected-art` carries Ch02, Ch03, Ch06–Ch18 and AppA — **no Ch04 or Ch05**, so those fall through to `base`. **Sourcing a superseded illustration is invisible in the output and NO downstream check can see it**, so the driver resolves through `sources.py`, never by globbing a directory.
