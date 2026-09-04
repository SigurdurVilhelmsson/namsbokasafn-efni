# REGISTER — figure-text translation

**This file is the ONE owner of figure-text-translation status.** Per
[CLAUDE.md § One source of truth](../../CLAUDE.md), no other document carries a status
verb for this work: the campaign register in `docs/plans/` points here and never
restates. Design evidence lives in [FINDINGS.md](FINDINGS.md), frozen; how to run
things lives in [README.md](README.md).

---

## ⏩ RESUME — state as of 2026-09-04

**What exists:** a working extract → strip → compose → oracle-check pipeline, proven on
`CNX_Chem_01_01_SciMethod.pdf` end to end; a census of all 36 chapter-1 figures; **one real
Málstaður run** (⑯, 1.20 ISK, 8/8 blocks); the output format settled as **SVG** by
measurement (⑤); and **the review workflow merged as #435**.

**⏭️ NEXT: nothing is blocked.** Both [USER]-ruled follow-ups are MERGED (Ⓐ and Ⓒ below). Ⓨ
needed no work. The open items are the pre-existing ones under *Open* — ⑭ number localization,
⑮ label anchoring, ⑦ Type0/CID fonts — plus the one gap Ⓒ introduced and did not close,
recorded under ⑰.

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

**Two were flagged as worth acting on before merge:**
- 🔴 **Unsaved edits in sibling blocks are silently discarded on every save.** Saving one block
  re-fetches and rebuilds every card from the payload, so corrections typed into other blocks are
  lost with no warning and no draft. The segment editor already carries draft machinery for
  exactly this reason. **Silent loss of editorial input is the one thing this application exists
  to prevent.**
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


- **⑰ `composedHash` CLAIMS MORE THAN THE COMPOSER DELIVERS — the SVG it stamps for is not the
  published one.** Opened 2026-09-04 by Ⓒ itself, deliberately and with the gap named rather than
  papered over. `compose.py --svg` writes `experiments/figure-text-translation/out/translated.svg`
  and then stamps `composedHash` into the sidecar; **nothing copies that file to
  `books/<slug>/media/<basename>_IS.svg`**, which is what `cnxml-inject` swaps in and what a reader
  actually sees. So the stamp means *"a composer run produced artwork from these blocks"*, not
  *"the published image carries them"*.
  ▶ **It is still strictly better than the state it replaced** — before Ⓒ, `effectiveState`
  reduced to `sidecar.state` exactly and could not fire on an editorial event at all — and it fails
  in the SAFE direction for the failure that matters: an approval with no compose at all still
  reads `mt-preview`.
  ⚠️ **The residual hazard is narrow and worth stating precisely: compose into `out/`, never
  publish, and the badge goes green anyway.** Closing it means having the composer write through
  `image-mapping.json` — the same forward lookup `translatedImageFor` already does — so the stamp
  and the published file move together. ⚠️ **It is NOT a two-line change, and the reason is worth
  knowing before anyone scopes it: `compose.py` has no book context at all.** Its only pointer to
  the outside world is `--translations <path>`; it never learns a book slug or an English basename,
  and both are needed to resolve an `outputName` through the mapping. So the work is a `--book` /
  `--basename` pair (or deriving them from the sidecar's own path, which couples the composer to
  the `books/<slug>/figure-text/` layout) **plus** the write — not just a destination. **Not built;
  not in scope for Ⓒ, which was ruled as a sidecar-only change.**
  ⚠️ **Maintenance note: THREE test-side stand-ins now simulate the composer by hand** — the E2E
  spec's `stampComposed`, a `writeSidecar({…composedHash})` in the service test, and a
  `writeFileSync` in the routes test. They agree today because the operation is one copied field.
  **If the stamp ever grows a second field** (a `composedAt`, or a `composerVersion` the composer
  writes itself) **all three drift silently.** At that point they want one shared helper.
  ⚠️ Exposure today is **0**: there are no figure-text sidecars anywhere in `books/` and no
  composed figure has ever been published.

- **⑭ NUMBER LOCALIZATION IS NOT IMPLEMENTED — the LOCALIZE class passes through untouched.**
  Demonstrated by the first real run: `373.15 K` / `273.15 K` / `233.15 K` are correctly held
  off the MT wire and correctly kept verbatim, but Icelandic writes them `373,15 K`. Three of
  nine verbatim blocks in one figure. ⚠️ **A blind `.` → `,` is wrong — the separators invert**
  (`1,000` → `1.000`); `tools/lib/mathml-to-latex.js` already classifies `us`/`is`/`integer`
  and should be reused rather than duplicated.
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
