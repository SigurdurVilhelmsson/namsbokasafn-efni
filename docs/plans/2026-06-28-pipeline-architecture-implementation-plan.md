# Pipeline Architecture — Implementation Plan

**Status:** approved by lead 2026-06-28, ready to implement. **Source of truth:**
[docs/audit/2026-06-28-pipeline-architecture-audit.md](../audit/2026-06-28-pipeline-architecture-audit.md)
(+ `2026-06-28-audit-findings.json` = all 83 verified findings with `file:line` evidence;
`2026-06-28-erlendur-probe-findings.md` = live API re-characterization).

## Context

The pipeline (CNXML → Erlendur MT → inject/rebuild → render HTML) was built for chemistry and is about
to scale to 4-5 books and 10-15 editors. The audit found: render's string-based structure handling is
the root of recurring bugs (and a DOM migration is now de-risked — 1,192/1,192 modules round-trip
clean); Erlendur has been fixed so the marker-restoration machinery is largely retirable; three
cross-book content gaps will silently corrupt the next books; there is no real correctness gate and the
manifest reports false-green; onboarding a book currently needs a code change. This plan turns the
roadmap (Tracks A→D) into ordered, individually-shippable work items.

## How to use this plan (for the implementing session)

1. **Read the audit report first** (10 min) — it explains every "why" this plan only summarizes.
2. **Work top-down within a track; respect the inter-track gates.** Each item is independently
   shippable as its own PR. Item IDs (A1, C2…) match the audit roadmap.
3. **Per item:** branch from `main` (`fix/…`, `feat/…`, or `refactor/…`); write/extend tests first
   where the repo has them (`superpowers:test-driven-development`); for any behavior change to render,
   add the characterization/golden test *before* touching code; verify with the commands in the item;
   open a PR. Use `superpowers:systematic-debugging` for any bug you hit.
4. **Test gate is local** (`npm test`, `npm run validate`) — CI credits may be exhausted and there's no
   branch protection, so the local green run is the authoritative gate (see project memory).
5. **Each item lists: files (`file:line`), the change, reuse, acceptance, effort, deps.** Effort:
   S(<1d) M(1-3d) L(~1wk) XL(>1wk).

## Constraints (apply to every item)

- **Robustness & future-proofing are the deciding factors** (lead directive 2026-06-29), in both
  implementation and planning — never the easiest/cheapest option over the most durable one. When two
  designs both work, choose the one with **one real code path** (not a silent-default branch), that
  **fails loud**, whose escape hatches are **incapable of reaching production** (validate/publish refuse
  them, not just warn), that gives every book/entity a **first-class explicit** config, and that **splits
  behavior-preserving refactors from behavior-changing enforcement** into separate PRs. Project-memory:
  `feedback-robustness-over-expedience`.
- 🔒 `books/*/01-source/` is **READ-ONLY** — never re-download/overwrite from upstream (double-consent
  rule in CLAUDE.md). Reading/scanning is fine.
- Translations are **API-only** (Miðeind/Málstaður). No AI-generated translations. API test-runs cost
  ISK — dry-run + estimate first. **Price = 1 ISK / 100 chars (10 ISK / 1,000).** The code's estimator is
  2× low (`(chars*5)/1000`) until #31 is fixed — **double any printed estimate** to get true spend.
- **Cross-repo:** render's HTML class names/structure are a contract with sister repo
  `namsbokasafn-vefur` (`static/styles/content.css`). Items tagged **[VEFUR]** require coordinated
  changes there — **flag and hand off; do not edit vefur from this repo.**
- `translation-errors.json` is `merge=ours` (each clone needs `git config merge.ours.driver true` once).
- Node 22 / `nvm use` before any lockfile change. Don't deploy mid-QA.

---

## TRACK A — Correctness & trust gates (DO FIRST)

*Goal: a trustworthy queue + a safety net, before adding editors or refactoring. Cheap, high-value.*

### A1 — Fix manifest false-green  ·  S  ·  no deps  ·  ✅ DONE (branch `fix/manifest-false-green`)
- **Shipped 2026-06-28:** manifest now track-qualified (`tracks[<track>]`, read-merge-preserve so
  injects don't clobber each other), real `skippedUntranslated` + `totalSourceModules` counters,
  `green` boolean (skips count against green), producer `tool` provenance. New suite
  `tools/__tests__/update-translation-errors.test.js` (counter invariant, track-preservation,
  legacy-flat tolerance). Verified on real data: liffraedi-2e was reporting green-ish at 11/259
  injected; now shows 248 skipped, `green:false`.
- **Problem:** `skippedUntranslated` is hardcoded `0`; un-injected modules are dropped uncounted, so
  un-injected books report green (physics: "9 of 283 checked, 0 skipped").
- **Files:** `tools/lib/update-translation-errors.js:76` (the `continue` that drops un-injected),
  `:108` (literal `skippedUntranslated: 0`); also `:56-124` (full-book rescan, no prior-manifest read).
- **Change:** count real skips on the `:76` branch; write `summary.skippedUntranslated` +
  `summary.totalSourceModules`; make manifest **track-qualified** (`translation-errors.<track>.json` or
  per-track sections) so a faithful inject can't clobber the mt-preview record; record producing
  track+tool. Treat `skipped>0` as non-green/non-perfect.
- **Acceptance:** run inject on a partially-translated book → manifest shows real `skipped`/`total`;
  mt-preview and faithful injects no longer overwrite each other's records. Unit test on the counter.

### A2 — Untranslated-EN residue check  ·  M  ·  no deps  ·  ✅ DONE (PR #184, branch `feat/a2-en-residue-check`)
- **Shipped 2026-06-29:** new pure detector `tools/lib/residue-check.js`; `buildCnxml` gates
  `report.complete` on exact-normalized EN==IS residue (reuses already-loaded `enSegments`, no new I/O);
  token-overlap ratio ≥0.7 warns (non-gating); per-book track-qualified `residue-report.<track>.json`
  manifest (read-merge-preserve) + console surfacing; reuses existing `--allow-incomplete` override.
  Detection skipped when injecting EN-as-content (`--lang en`) or under `--allow-en-fallback`.
  Design/plan: `docs/plans/2026-06-29-a2-en-residue-check-{design,plan}.md`. **Key fix found in
  integration testing:** floor on **content words (alphabetic tokens len ≥3)**, not raw token count —
  else chemistry numeric/unit cells (`neon 0.83 g/L`, answer keys) false-positive (single-letter
  unit/enum tokens defeated a raw floor). Real cells regression-locked; 3 pipeline-integration tests
  pass unmodified as the guard. `npm test` 1533/0; efnafraedi ch01 = 0 false positives.
- **⚠️ DEFERRED FOLLOW-UPS (not yet done — don't forget):**
  - **(a) Server editor save/submit surface** — wire `detectResidue` into the editor service's
    save/submit path so editors see residue warnings live. Reuses `residue-check.js` verbatim. Its own
    PR (needs server tests + UX decisions). *This was in A2's original "Files" line but deliberately
    scoped out of the inject PR.*
  - **(b) CI wiring** — A2 has no CI gate yet (Actions credits out till ~Jul 1). When credits return,
    decide whether residue gates a CI check or stays advisory; the local `npm test` carries it for now.
- **Problem:** the injection gate checks segment *presence*, never *translatedness* — untranslated
  English passes as COMPLETE (the failure behind os-embed English and MTPE residue).
- **Files:** `tools/cnxml-inject.js:1481` (`getSeg`, empty-only check), `:1677` (`report.complete`);
  surface also at save/submit in the server editor service.
- **Change:** flag segments whose IS content ≈ EN source after stripping markers/numbers/symbols, above
  a min token threshold; downgrade `report.complete` / list residues; emit a machine-readable residue
  manifest. Reuse the bracket-marker regexes from the shared lib (A-prereq / B3).
- **Acceptance:** an untranslated-English module no longer reports COMPLETE; residues listed. Tests with
  EN-residue and clean fixtures. (Aligns with the editorial-throughput roadmap Unit 4.)

### A3 — Render-stage structural check + wire fidelity into CI as regression  ·  M  ·  dep: none (helps C)  ·  ✅ DONE (branch `feat/a3-render-fidelity-check`)
- **Problem:** fidelity check is character-blind (counts opening tags only; text/attrs/MathML contents
  never inspected — why the null-byte degree-sign incident passed), never runs in CI, never fails inject.
- **Shipped:** `tools/cnxml-render-fidelity-check.js` — RENDER-stage check (complements the inject-stage
  `cnxml-fidelity-check.js`), aggregated **per chapter** (the closed unit: render redistributes content
  within a chapter — exercises→exercises page, key-equations/summary re-present — but never across).
  Pure `checkChapter({cnxml,html}, baseline)` runs three checks: **(1) control-char scan** (C0, the
  null-byte class) baseline-free; **(2) cross-stage `>=` invariant** on atomic restructure-stable units
  (`m:math`→`mjx-container`, `image`→`img`) — render only ADDS (rollups/dedup-bugs), so `HTML<CNXML` is
  an unambiguous DROP, baseline-free; **(3) shape-drift** vs a committed per-book baseline histogram
  (figure/img/em/strong/table/list/example/note/exercise/equation/link), the sensitive detector.
  Regex counting (HTML isn't XML-clean — SVG + page-data `<script>`; a parser would fight it).
- **Decisions vs original spec:** (a) compare committed 05-publication vs 03-translated, NOT re-render —
  the chapter render orchestration in `main()` is heavily coupled (`moduleSections`+numbering maps); a
  re-render driver is deferred (and CI credits are out till ~Jul 1 anyway). So this validates the
  *published artifact*, not a render-code regression at PR-time. (b) Cross-stage `>=` (not `==`) because
  rollup pages legitimately inflate counts; only a net drop is honest. (c) No baseline committed yet —
  current output contains the ~30 known pre-existing math drops + C0 table-escape bug; a baseline now
  would bless them (capture via `--update-baseline` after a clean re-render).
- **Acceptance:** ✅ `cnxml-render-fidelity-check.test.js` — clean passes; dropped-figure, bold↔italic
  swap, injected NUL, and dropped-equation each fail (5 tests). Wired into `validate.yml` as a
  **non-blocking** report + `npm run fidelity:render`.
- **Bonus finding:** run against committed output, the cross-stage invariant independently rediscovered
  the documented fidelity gaps — **~30 net math drops (ch15-21; ch21=15, ch17=9) + 1 image drop
  (appendices)**. Pre-existing, not regressions. Hard-gating needs the lead to triage these first.

### A4 — `pollTask` retry + async-path tests  ·  S  ·  no deps  ·  ✅ DONE (PR #185, branch `feat/a4-polltask-retry`)
- **Shipped 2026-06-29:** poll GET wrapped in the existing `withRetry` (transient 5xx/429 retry, 4xx fails
  fast). First test suite for `malstadur-api.js` (mocked fetch + fake timers): translateAuto 10K-boundary
  routing, pollTask completed/failed/timeout, transient-5xx recovery, withRetry 5xx-vs-4xx. `npm test` 1513/0.
  **Track A (A1/A2/A3/A4) now complete.**
- **Problem:** the async (>10K, dominant) path's poll GET is a bare call — one transient blip fails a
  whole module.
- **Files:** `tools/lib/malstadur-api.js:293` (bare GET inside poll loop) vs `:233`/`:266` (wrapped).
- **Change:** wrap `:293` in the existing `withRetry`; add tests (mocked fetch) for `translateAuto`
  routing at the 10K boundary, `pollTask` completed/failed/timeout, `withRetry` 5xx-vs-4xx.
- **Acceptance:** simulated transient 5xx during poll recovers; tests green.

**Track A gate / Definition of done:** manifest tells the truth; a real correctness check exists and runs;
the queue can be trusted with more editors. *Recommended: land A before onboarding any editor cohort.*

---

## TRACK B — API simplification (AFTER the B1 validation gate)

*Goal: retire the now-redundant restoration machinery. Erlendur is fixed (probes); **B1 gate PASSED
2026-06-28** — glossary-aware re-test confirms 100% marker survival with the glossary and a safe 25 KB
chunk limit (glossary is filtered per chunk to ≤3 KB, not ~36 KB). B2/B3 cleared.*

### B1 — Glossary-aware Erlendur validation run  ·  S  ·  GATES B2/B3  ·  ✅ DONE (PASS)
- **Shipped 2026-06-28:** findings in [docs/audit/2026-06-28-b1-glossary-validation-findings.md](../audit/2026-06-28-b1-glossary-validation-findings.md);
  reusable harness `docs/audit/b1-glossary-probe.mjs`. **Result: markers 100% preserved with the
  glossary attached** (Part A all-types matrix + Part B full ch5: 729 SEG markers / 9 chunks, every
  per-type bracket count identical, 0 control chars, 0/9 glossary-truncation-retries). **Premise
  corrected:** production filters the glossary per chunk (`filterGlossaryForText`) to 1–56 terms /
  ≤3 KB — NOT the full ~36 KB — so a 25 KB chunk + glossary ≈ 28 KB, well under the clean-at-38 KB
  ceiling. **25 KB chunk limit kept (no re-tune).** B2/B3 cleared. Cost: 114,517 chars, 11 reqs, 0 fail.
- **Do first:** re-run the truncation/threshold + marker-survival probes **with the production glossary
  attached** (≈1,100 terms add to the payload). Size the chunk limit to `payload + glossary`. Then
  re-translate a **full chapter with glossary** and diff marker integrity end-to-end.
- **Files/refs:** probe harness pattern in `scratchpad/` (see audit appendix); `tools/api-translate.js`
  glossary load `:320-329`, `splitAtSegBoundaries`, chunk size 25KB.
- **Acceptance:** documented marker-integrity rate with glossary; a re-tuned chunk limit (or confirmation
  the current 25KB is right). **Do not start B2/B3 until this passes.** Note: clean-cut splitting is
  correct (overlapping-split tested, not warranted) — only the *limit* may change.

### B2 — Downgrade `restore*` heuristics to validate-and-warn  ·  M  ·  dep: B1
- **Problem:** `restoreNewlines`/`restoreMediaMarkers`/`restoreSupersubMarkers` are near-dead for API
  content (run only when `!isApiTranslated`); `restoreMathMarkers` is ~190 lines of anchor heuristics for
  ~3 fixes book-wide; `restoreMediaMarkers` blind-appends `[[MEDIA:N]]` with no alignment.
- **Files:** `tools/cnxml-inject.js:409-474` / `:489-537` / `:305-394` (the restores), `:3329-3354`
  (gating), `:558-747` (math). Math detection should move upstream to `api-translate.js` (per-segment
  `[[MATH:N]]` count check + re-translate/flag).
- **Change:** for API content, demote these to **warn-only** (compare EN/IS marker counts, log, don't
  mutate); **keep** them for the `docx-import` population, gated on explicit **producer provenance**
  (see B-prereq below). Remove dead branches.
- **Acceptance:** API-translated modules inject with restores in warn-only mode and no marker regressions
  vs the B1 baseline; docx path unchanged. Tests per population.
- **Prereq (provenance, M):** `api-translate.js:649` and `docx-import.js:795` each stamp explicit
  producer provenance into `02-mt-output` (sidecar like `import-report.json`); replace the
  `isApiTranslated` marker-sniff (`cnxml-inject.js:3307-3313`) with that signal. *This also fixes the
  biology/microbiology mis-routing (low-marker books) — do it as part of B2.*

### B3 — Per-type bracket-marker count check at producer boundary  ·  S  ·  dep: B1
- **Problem:** `validateMarkers` is count-only on `<!-- SEG -->` (no `[[` handling anywhere) — blind to
  inline bracket loss and intra-segment truncation.
- **Files:** `tools/api-translate.js:255-259`.
- **Change:** count bracket markers **by type** (content is translated; only count+type per family is
  comparable) and warn/fail on per-type input≠output, mirroring `assertNoControlChars`/`countInlineMarkers`.
- **Acceptance:** a synthetic dropped-`[[xref:]]` is caught; clean passes.

### B4 — Move `<term>`/`<footnote>` to bracket markers  ·  M  ·  dep: B1
- **Problem:** terms/footnotes still emit legacy `{{ }}` (the lossy family) on the highest-volume inline
  elements; sub/sup/emphasis/links already migrated to ~0%-loss `[[ ]]`.
- **Files:** `tools/cnxml-extract.js:303` (`{{term}}`), `:370` (`{{fn}}`); add `[[term:…]]`/`[[fn:…]]`
  (and `[[u:…]]` for underline). Injection is already backward-compatible (CLAUDE.md).
- **Acceptance:** marker-survival probe on term/fn brackets ≈100%; old `{{ }}` output still injects.

**Track B gate:** restoration complexity retired for API content; markers validated by type; one marker
family. *Keep `repairSegTags` (hyphen-in-id persists) and `assertNoControlChars` (separate content bug).*

---

## TRACK C — Render → DOM migration (incremental, leaf-seam)

*Goal: eliminate the string-position fragility class (root of all 3 render bugs). De-risked: 1,192/1,192
modules round-trip clean. **C0 safety nets are mandatory before C1.***

### C0 — Safety nets before touching render  ·  M  ·  GATES C1-C4  ·  ✅ DONE (PR #177)
> Golden (byte-exact, MathJax-normalized) + parser characterization + nesting matrix shipped. The
> matrix found a real bug: `<table>` escapes example/exercise/note (6 cells skipped → C3/C4).
- **Build a golden-HTML harness:** render all efnafraedi-2e modules with the *current* renderer, store
  outputs; the migration must produce **byte-identical HTML** against this baseline at every phase.
  Model on `tools/__tests__/cnxml-dom-comparison.test.js` (the inject precedent — old-regex vs new-DOM,
  per-module baseline budgets). **Oracle note:** render's gate is golden-HTML diff, NOT inject's
  `compareTagCounts`.
- **Add `tools/__tests__/cnxml-parser.test.js`** — the string core (`extractElements:186`,
  `extractNestedElements:228`) has zero direct tests today. Cover paired/self-closing/attr parsing,
  same-tag nesting depth 2-3, malformed/unterminated input.
- **Build the render nesting matrix** — `{figure,list,media,table} × {example,exercise,note,section} ×
  {with xref, without}`, asserting each child renders once and inside its parent (reuse the
  `figIdx < exampleCloseIdx` ordering assertion + the inline-CNXML pattern at
  `cnxml-render.test.js:204-235`). Mirror the inject nesting suites
  (`cnxml-inject.test.js:700/777/923`), sharing fixtures.
- **Acceptance:** golden baseline committed; parser + nesting suites green on current code.

### C1 — DOM traversal seam + migrate `renderNote`  ·  M  ·  dep: C0  ·  ✅ DONE (PR #179)
> Reusable `renderBlockChildrenInOrder(content, context, dispatch)` seam established (C2–C4 consume it);
> `renderNote` migrated. Golden byte-identical book-wide (blast-radius scan: 0 of 149 efnafraedi modules
> change). **Re-diagnosis:** the plan's "95 id-less notes" were actually commented-out answer paras the
> old regex rendered (`<!--<para>…-->`); the DOM walk skips comment nodes. id-less ordering also fixed
> (synthetic/general). Dropped-media was already handled (not touched).
- **Pattern (leaf-seam):** a new DOM traversal (reuse `parseCnxmlFragment`/`serializeCnxmlFragment`/
  `isBlockElement` from `tools/lib/cnxml-dom.js` **verbatim** — they're renderer-agnostic) walks
  `<content>` childNodes **in source order** (ordering falls out for free) and dispatches per
  `node.localName` to the **existing, unchanged** string renderers via `serializeCnxmlFragment`. Keep the
  regex path alive in parallel; switch the dispatcher per element type behind the golden harness.
- **First container:** `renderNote` (`cnxml-render.js:1255`) — the dropped-`<media>` bug site and the
  id-less-`<para>`-in-note ordering bug (95 notes / 77 biology modules).
- **Scope note:** `cnxml-dom.js` is a parse/manipulate helper, **not** a renderer — HTML *emission* stays
  in the string renderers; only traversal/ordering moves to DOM. Don't over-promise reuse.
- **Acceptance:** golden HTML unchanged for efnafraedi-2e; the dropped-media and id-less-para cases (add
  biology fixtures) now correct; nesting matrix green.

### C2 — Migrate `renderExample`, then `renderExercise`  ·  L  ·  dep: C1  ·  ✅ DONE (PR #180)
> Both migrated onto the seam (`hoistTags` config added). `isInsidePara` guard retired.
> renderExercise byte-identical (old-vs-new diff = 0). renderExample **changes published output**:
> de-duplicates equations + standalone media nested in example paras (rendered twice before).
> 7 equation modules + 2 media modules change, 0 in golden.
> **CORRECTION (2026-06-29, lead-reviewed live):** the first cut de-duped equations the *wrong*
> direction — it kept the cramped inline `math-inline` copy and dropped the centered display block.
> Verified on namsbokasafn.is (ch14 Dæmi 14.4/14.5): both copies render; the centered display block
> is canonical (CNXML `<equation>` is block-level). Fix: `hoistTags: ['list', 'equation']` for
> `renderExample` — the in-para `<equation>` hoists out and renders once as the display block; the
> inline artifact is gone. Media de-dup was already correct (removed true duplicate *images*, not a
> presentation copy). example-dom test assertions inverted accordingly.
> **EXERCISE follow-up (2026-06-29, lead-requested):** `renderExercise`'s section renderer had NO
> `equation` dispatcher → a direct-child `<equation>` of `<problem>`/`<solution>` was **dropped
> entirely** (silent content loss — m68670's density formula `d = m/V`), and an in-para exercise
> equation rendered inline. Fix: add `equation: renderEquation` + `hoistTags: ['list','equation']` to
> `renderSectionContent`. All 6 exercise-equation modules now render each `<equation>` once as a
> display block (m68667/68670/68744/68745/68747/68811); legit inline math untouched; new
> `cnxml-render-exercise-dom.test.js`.
- Highest-bug-density containers (`cnxml-render.js:1354`, `:1602`). Same seam, one at a time, golden-gated.
- **Acceptance:** golden unchanged; the figure-escapes-example regression (already fixed) and the
  nesting matrix stay green; the inject-vs-render coverage asymmetry closed.

### C3 — Loud seam + unify dispatch maps  ·  M  ·  dep: C2  ·  ✅ CORE DONE (branch `feat/c3-loud-seam`)
- **Problem (root of the whole drop class):** the DOM seam did `if (!dispatch[name]) return;` — any block
  element absent from a container's dispatch map was **silently discarded**. The three hand-maintained
  maps had drifted (example had `equation`; exercise + note didn't), each a silent content loss found
  only after the fact (exercise density formula, ~15 modules' note reaction-equations).
- **Shipped:** **(1) Loud seam** — `renderBlockChildrenInOrder` now records undispatched block elements
  into `context.undispatchedBlocks` (surfaced on `renderCnxmlToHtml` return) instead of dropping them
  silently; output-neutral (golden byte-identical proves it). A `LOUD_SEAM_IGNORE` set excludes
  container-meta/inline tags (title/label/newline/sub/math/…) so the diagnostic is signal not noise —
  **verified `{}` (zero undispatched) across the whole efnafraedi corpus post-fix.** **(2) `renderNote`
  gains `equation: renderEquation`** (default hoistTags picks it up → direct-child + in-para equations
  render once as display blocks). Old-vs-new sweep: **15 modules recover note equations, 0 decreases**
  (chemistry reaction equations in `<note>`s, dropped before; golden m68710 regenerated — 3 equations
  recovered). Tests: `cnxml-render-loud-seam.test.js`, note-dom direct-child-equation case.
- **Deferred (deliberately, per advisor):** (a) **table-escape** (table nested in example/exercise/note
  → add `table` to those dispatch maps + `renderedTableIds` dedup) — **0 real nestings in efnafraedi**
  (the 6 C0 KNOWN_ESCAPES are synthetic matrix cells), so it's un-skipping tests with no content impact;
  re-check when biology is onboarded. (b) The full **5-positioner / 63-`indexOf` convergence** — the
  silent-drop class is now closed by the loud seam + complete maps, so the big refactor is optional
  cleanup, not a correctness need.
- **Acceptance:** ✅ loud seam records (not drops) undispatched blocks; golden byte-identical (output
  neutral); note equations recovered; corpus diagnostic clean.

### C4 — Port `buildTable` (inject) to DOM  ·  M  ·  dep: none (can parallel C)
- **Problem:** the one complex element never moved to DOM; self-described "simplified" positional regex
  (`cnxml-inject.js:1913-1982`, comment at `:1933`).
- **Change:** port to `parseCnxmlFragment` → walk `<row>`/`<entry>` → `replaceParaContentDom` analog →
  `serializeCnxmlFragment`; removes the self-closing `<entry/>` normalization hack. *(Bonus per finding:
  parse the whole module to one DOM at top of `buildCnxml` and locate via `getElementById` instead of the
  ~6 per-element regex extractions.)*
- **Acceptance:** inject golden/tag-count unchanged on table-heavy chemistry modules; new table-nesting test.
- **NOTE (2026-06-29):** the A3 drop investigation routed here, but the actual content-loss bug was
  RENDER-side, not this inject item. **Shipped surgical fix (branch `feat/c4-table-dom`):**
  `renderTable` matched the BARE tags `/<thead>/` `/<tbody>/`, so OpenStax's attributed
  `<thead valign="middle">`/`<tbody valign="middle">` matched nothing → the table rendered as an empty
  `<table>`+caption, dropping ALL cells (text + equations). Live on namsbokasafn.is (Tafla 21.1 m68856).
  Fix = `/<thead[^>]*>/` `/<tbody[^>]*>/` (`tgroup` already had `[^>]*`; row/entry go through
  `extractElements`). Old-vs-new sweep: **4 modules recover content** (m68768/m68770/m68856/m68858 —
  cells+equations), **0 decreases**, bare-tag tables byte-identical (100 byte-diffs were MathJax-ID
  non-determinism, counts unchanged). The advisor's key call: the "cell-equation drop" was SUBSUMED by
  the empty-body drop (cells never reached `processInlineContent`); one regex fix recovered both. New
  test `cnxml-render-table-attrs.test.js`. **This inject `buildTable`→DOM item remains open** as an
  architecture investment (no active bug) — route to lead as its own decision. **The C0 table-ESCAPE bug
  (table nested in example/exercise/note renders outside it) is SEPARATE — it's the container-dispatch
  silent-discard class → C3, not table internals.**

**Track C gate:** render structure read from a parse, not string positions; the bug class is gone.

---

## TRACK D — Cross-book onboarding (sequence against the NEXT title)

*Goal: make onboarding a data + probe operation and close the content gaps. **Order D3-D5 by which book
is chosen next** (see Open Decisions).*

### D1 — Per-book config as data file + fail-loud + `--book` required  ·  L  ·  blocks all  ·  ✅ DONE (PR #187 mechanism + #188 enforcement)
> Shipped 2026-06-29. `book-config.json` per book; `getBookRenderConfig` loads+merges over `SHARED_*` (lossless loader); `bookToDomain` reads `config.domain`; `--book` required across 9 tools; fail-loud on missing config; `chapter-modules` chemistry-map removed; `validate` requires `book-config.json`. `--allow-default` dropped (YAGNI). Design/plans: `docs/plans/2026-06-29-d1-*`.
- **Problem:** config is code-resident (`book-rendering-config.js:48-341`); unknown book → silently
  incomplete default (`:350-363`); every tool defaults `--book` to chemistry (`parseArgs.js:23`);
  `chapter-modules.js:48-79` falls through to a chemistry hardcoded map.
- **Change:** move each book's render config into a co-located data file (extend the orphaned
  `books/<slug>/metadata.json`; deep-merge `SHARED_*` defaults), following the `collection-order.json`
  pattern. Promote `metadata.json` to the real per-book manifest read by `getBookRenderConfig` +
  `bookToDomain` + glossary loading. Make unknown-book **fail loud** (throw / require `--allow-default`).
  Make `--book` **required** in multi-book tools (`default: null`, error if missing or `books/<slug>`
  absent). Stop `chapter-modules.js` falling through to `CHEMISTRY_2E_MODULES`. Add `npm run validate`
  coverage asserting a new book provides its required inputs.
- **Acceptance:** a fresh fake book with a data-file config renders; a missing config errors clearly; a
  forgotten `--book` errors instead of silently using chemistry.

### D2 — Pre-intake structural probe  ·  M  ·  blocks all  ·  ✅ DONE (PR #189)
> Shipped 2026-06-29. Read-only `tools/preintake-probe.js` (+ pure `tools/lib/preintake-checks.js`): scans candidate CNXML → go/no-go checklist (os-embed BLOCK; iframe/empty-glossary/unknown-note-class/unrecognized-inline WARN); `--book`/`--source`/`--json`. Acceptance test reproduces all 5 books' known gaps. Design/plan: `docs/plans/2026-06-29-d2-*`.
- One-shot script over a candidate's raw CNXML, each check tied to a proven failure: `os-embed` present
  (no translation path), `<iframe>` present (dropped), `<glossary>==0 with <term>` present (empty
  key-terms page), unknown note classes, unrecognized inline elements (the whitelist `stripTags:374`
  drops them), missing `BOOK_CONFIGS`/metadata entry. Output = a go/no-go fitness checklist.
- **Acceptance:** running it on the 5 in-repo books reproduces their known gaps.

### D3 — os-embed exercise extraction + translation path  ·  XL  ·  blocks organic
- **Problem (CRITICAL):** organic's 1,961 `<link class="os-embed">` exercises **resolve to untranslated
  English** (`resolveOsEmbed` at `cnxml-render.js:137` reads `01-source/exercises/*.json`) — there's **no
  extraction/translation path**, so reviewed-looking English ships.
- **Change:** (a) marker producer for self-closing `<link url=…>` (e.g. `[[osembed:url]]`) so the ref
  survives into `structure.json` (`cnxml-extract.js`); (b) extraction path that reads
  `01-source/exercises/*.json` (`stem_html`/`stimulus_html`/solutions) as translatable segments into
  `02-for-mt` → MT → `03-faithful-translation`; (c) `resolveOsEmbed` prefers a translated sidecar.
- **Acceptance:** an organic exercise round-trips EN→IS and renders Icelandic; a characterization test
  pins resolved-vs-fallback behavior.

### D4 — `<iframe>` extract + render  ·  M  ·  blocks physics, biology  ·  ✅ DONE (PR #192)
> Shipped 2026-06-29. **Decisive finding:** the roadmap's "re-emit verbatim" premise was wrong — every embed src is an `openstax.org/l/<slug>` redirector that returns `X-Frame-Options: DENY`, so an iframe to it is a blank box. New offline `tools/resolve-embeds.js` (+ `tools/lib/embed-resolve.js`) resolves `/l/` → embeddable final URL (incl. YouTube `watch?v=`/`youtu.be` → `/embed/` canonicalization + framability re-check) and writes a committed per-book `embed-mapping.json`. Extract captures `embedSrc`/`width`/`height` (inline + block); inject re-emits the `/l/` iframe verbatim (faithful CNXML); render (`tools/lib/embed-mapping.js` `renderEmbedHtml`) resolves via the mapping → responsive lazy `<iframe>` + always-visible "Opna í nýjum glugga" fallback link, **fail-loud** on a mapping miss. **Caught a latent corruption bug:** `reverseInlineMarkup`'s self-closing-tag allowlist was missing `iframe`, which would have XML-escaped `<iframe>`→`&lt;iframe` and silently corrupted all ~41 inline biology embeds (a render-only test would not have caught it — only a placeholder→inject round-trip did). Biology `embed-mapping.json` = 51/51 `ok`; physics `edlisfraedi-2e` = 47/47 `ok` (shipped too — render is globally fail-loud, and physics already had an iframe in committed `03-translated`, so it needed a mapping to re-render). Title = humanized `@alt` (para-text titling deliberately out of scope). **Server live-preview fix:** `server/services/renderService.js` now `loadEmbedMapping(book)` + passes `embedMap` (the in-process preview is a separate entry point from CLI `main()` — without this every embed module 500'd on preview; found in final whole-branch review). **[VEFUR]** embed-wrapper CSS (`.embed-responsive`/`.embed-fallback`) still needs vefur selectors. Design/plan: `docs/plans/2026-06-29-d4-*`.
- **Problem:** 108 PhET/YouTube embeds dropped at extract (`cnxml-extract.js:180`/`:99`, whitelist strip)
  AND render (`renderMedia` image-only, `cnxml-render.js:1232`/`:1238`; inline path `cnxml-elements.js:788`).
- **Change:** capture `<iframe>` (+ other non-image media) child in extraction (`{embedSrc,width,height}`,
  reuse `parseAttributes`); preserve through inject (media-rebuild currently image-only at
  `cnxml-inject.js:1030`/`:2986`/`:1881` — re-emit non-image media verbatim); render a responsive
  `<iframe>` (lazy, title from `@alt`). **[VEFUR]** embed wrapper styling.
- **Acceptance:** a physics PhET module renders a working iframe; characterization test (currently-drops →
  now-renders).

### D5 — Alternative glossary extractor (key-terms / appendix glossary)  ·  M  ·  blocks organic, microbiology
- **Problem:** organic (0 per-module `<glossary>`, uses `<section class="key-terms">` ×31) and
  microbiology (0 per-module `<glossary>`) render an empty compiled "Lykilhugtök" page — *but each has a
  book-level glossary source the renderer doesn't read.*
- **Change:** per-book alternative glossary source, selected in config:
  - **Organic:** build from `<section class="key-terms">`.
  - **Microbiology (lead-confirmed 2026-06-28):** the canonical glossary is the **Appendix E glossary
    module** (one of `appendixModules` [m58946–m58950] in `books/orverufraedi/01-source/collection-order.json`;
    m58948 = "Metabolic Pathways", so the glossary is a sibling — confirm which at onboarding). Terms are
    *also* restated in each chapter's Summary text. Extract the Appendix E module as the compiled
    term-lookup source that feeds the **reader hover feature**. Note: it is **not** built from
    `<definition>` elements (microbiology has 0) — inspect its actual structure (likely a term/meaning
    section or list) before writing the extractor.
- **Acceptance:** organic + microbiology produce a populated key-terms / glossary page; microbiology's
  feeds the reader hover lookup. (Microbiology is not the next book — implement when it is scheduled.)

### D6 — Per-book characterization test + parametrized CSS-contract  ·  M  ·  blocks all  ·  ✅ DONE (PR #190)
> Shipped 2026-06-29. `render-characterization.test.js` (1 describe/book, inline CNXML); `renderCnxmlToHtml` now honors `options.bookConfig` (also fixed latent server-preview English-note-labels bug); css-contract parametrized over `books/*/05-publication` + `VEFUR_CONTRACT=1` hard-fail. Surfaced 14 cosmetic cross-book CSS gaps → efni `KNOWN_GAPS` + vefur memory `css-cross-book-gaps`. Design/plan: `docs/plans/2026-06-29-d6-*`.
- **Problem:** only e2e test is efnafraedi ch01 (`pipeline-integration.test.js:35`); CSS-contract scoped
  to efnafraedi + skips silently when vefur absent (`css-contract.test.js:20`,`:102/162/198`).
- **Change:** one render-characterization spec per book (inline-CNXML pattern → `renderCnxmlToHtml`, no
  MT input needed); parametrize CSS-contract over all `books/*/05-publication`; hard-fail (not skip) when
  `VEFUR_CONTRACT=1`.
- **Acceptance:** each book has a characterization spec; CSS-contract runs for every book.

### D7 — Species-name MT protection (biology)  ·  S/M  ·  biology  ·  ✅ DONE (PR #193 — no protection needed)
> Resolved 2026-06-29 by **probe, not build**. Paid Erlendur probe (`docs/audit/d7-species-probe.mjs`, ~172 ISK, 39 real biology paras through the production extractor, baseline vs identity-glossary) measured **46/46 real Latin binomials surviving verbatim (~100%)** inside their `[[i:]]` markers — incl. abbreviated (`G. lamblia`) and trinomial (`Homo sapiens sapiens`) forms. The API leaves Latin alone (foreign to both EN and IS). The 2 baseline "misses" were detector false positives (translatable English phrases that correctly translated). **Decision: no protection mechanism** — unneeded, and a pattern-based one would *harm* correctness by freezing non-species italic phrases in English (YAGNI + one-real-code-path). Deliverable = findings + a committed re-runnable probe (re-measure if the API drifts); zero pipeline changes. Acceptance ("documented rate") met. Design/findings: `docs/plans/2026-06-29-d7-species-mt-protection-design.md`.
- **Problem:** biology has **384 `Genus species` italic spans** (`<emphasis effect="italics">`, extracted
  as `[[i:…]]`). The API translates marker *content*, so species binomials risk being mangled/translated
  (e.g. *Homo sapiens* must stay verbatim). Not a structural gap — an MT-quality gap specific to biology.
- **Change:** first **probe** a sample of species-italic segments through Erlendur (reuse the
  `scratchpad/` probe harness) to measure actual mangling. If material, protect them — candidate
  approaches: a no-translate marker variant, or seed the glossary with binomials as identity mappings.
- **Acceptance:** a sample of species names round-trips verbatim; documented rate.

### Biology onboarding (NEXT — lead-confirmed 2026-06-28)
Biology's required set is **D1, D2, D4, D6, D7 + audit #14 + audit #33** — plus Tracks A (+ C is
independent). The two audit items (folded in 2026-06-29 from the out-of-scope register; both
`blocks_next_book=true`) are pre-onboarding correctness fixes, not optional cleanup. Notably:
- **D3 NOT needed** (no os-embed; biology uses inline `<exercise>`).
- **D5 NOT needed** — biology has formal `<glossary>` in **205 modules** (the existing glossary path works).
- **3-level hierarchy is a NON-issue** — `books/liffraedi-2e/01-source/collection-order.json` already
  holds all 259 modules in the flat `chapters → modules` shape (intake flattened the Unit level); verify
  it loads via `chapter-modules.js` but expect no special work.
- **D4 (iframe)** is the main content gap (~35 files / ~51 PhET/YouTube embeds in `<media>`).
- **0 `<example>`** in biology — confirm the example renderers simply no-op (they should); add a biology
  characterization spec (D6) to lock that in.
- **audit #14 — SEG-marker parser divergence (HIGH).** Biology is a **low-marker book**, the exact class
  the divergent `parseSegments` impls + the `isApiTranslated` marker-sniff **mis-route** (see the B2
  provenance prereq). Unify the parsers / fix routing before onboarding so biology segments parse and
  route correctly. Do this with — or before — the B2 producer-provenance prereq (they overlap).
- **audit #33 — inject list-flattening divergence (HIGH).** Biology has **0 `<example>`** but *does* use
  `<exercise>` and `<note>` — and those are exactly the two builders (`buildExerciseDom`/`buildNoteDom`,
  `cnxml-inject.js:2597`/`:2854`) that **DELETE** nested lists (while `buildExampleDom` preserves them).
  So any nested list inside a biology exercise/note would be silently dropped. Verify presence in
  liffraedi-2e source, then unify on the example (preserve) approach before onboarding.

**Track D gate (per book):** D1+D2 done once; then the book's specific items
(biology = **D4 + D7 + audit #14 + audit #33**) + D6 green → onboard.

---

## Suggested execution sequence

1. **Track A in full** (A1→A4) — trust + safety net.
2. **C0** (safety nets) and **B1** (glossary re-test) in parallel — both are prerequisites, both cheap.
3. **C1→C2** (render→DOM for note/example/exercise) in parallel with **D1→D2** (config-as-data +
   pre-intake probe). Then **C3**, **C4**.
4. **B2→B4** once B1 passes (can overlap C).
5. **D3/D4/D5 + D6** sequenced by the chosen next title.

## [VEFUR] cross-repo coordination (hand off, do not edit here)

- D4 iframe wrapper styling. Per-book **note-class vocabulary** (raw classes leak via
  `cnxml-render.js:1259`; produce a note-class report per book at intake). key-equations/exercise
  class-name mismatches are **fixable efni-side** (`renderKeyEquations:2431` → `key-equations-section`;
  compiled exercises → `.exercises-list>.exercise`). Genuinely **unstyled in vefur**: `summary`,
  `summary-section`, `periodic-table-link` (need vefur selectors). A shared, version-pinned **class
  manifest** between render output and vefur CSS (none exists).

## Decisions (resolved by lead 2026-06-28)

- **Next book = Biology.** Onboarding set = D1, D2, **D4** (iframe), D6, **D7** (species names) + Track A.
  D3/D5 not needed; 3-level hierarchy already flattened. See "Biology onboarding" above.
- **Microbiology key-terms = the Appendix E glossary module** (one of `appendixModules` m58946–m58950),
  used as the reader hover-lookup source; terms are also restated in chapter Summary text. Folded into D5
  (implement when microbiology is scheduled, after biology).

### Still open
- **CI:** Track A's CI wiring assumes credits are restored; until then the local gate carries it.

---

## Out-of-scope register — issues uncovered during implementation (triage as a batch after the plan completes)

*Standing rule (project-memory feedback `feedback-log-out-of-scope-issues`): every out-of-scope issue
found while implementing an item is logged here **immediately**, so nothing scoped-out is lost. PRs stay
tightly scoped; these are revisited together once the plan's last item ships. Per-item deferrals also live
in their item blocks — this is the consolidated scan list. Append, don't prune.*

**From A2 (untranslated-EN residue check, PR #184):**
- **Server editor save/submit residue surface** — wire `detectResidue` into the editor service
  save/submit path so editors see residue warnings live. Reuses `tools/lib/residue-check.js` verbatim;
  its own PR (needs server tests + UX). *(Also noted in the A2 item.)*
- **CI wiring for the residue gate** — decide gate-vs-advisory when Actions credits return. *(Also A2 item.)*
- **`--allow-en-fallback` disables residue detection for the whole run, not per-module** —
  `cnxml-inject.js` sets `checkResidue = args.lang !== 'en' && !args.allowEnFallback`, so a fallback run
  also skips residue-checking modules that *do* have real translations. Ideal = a per-module EN-fallback
  signal from `loadModuleInputs` so only genuinely-fallen-back modules are exempt.
- **One missing translation file aborts the entire chapter inject (pre-existing)** — `loadModuleInputs`
  throws on a missing translation (F20 refuse-untranslated) → outer `try/catch` in `main()` → `exit(1)`,
  skipping all remaining modules; A2's after-loop `residue-report.<track>.json` is then never written for
  a partially-translated chapter. Fix idea: per-module skip-and-continue + write the manifest in a
  `finally`.
- **`residue-report.<track>.json` tracking decision undecided** — prod `scripts/git-backup.sh` stages
  `books/`, so the new file auto-commits. Decide: track it (like `translation-errors.json` with
  `merge=ours`) or gitignore it.
- **Residue warn-tier not calibrated on real data** — efnafraedi ch01 emitted 5 non-gating warnings,
  never reviewed for legitimacy. Revisit the warn threshold once real faithful content exists.

**From the 2026-06-28 audit (findings NOT operationalized as plan items A1–D7).** The audit
`docs/audit/2026-06-28-audit-findings.json` (83 findings) is the source of truth; the plan scheduled a
curated subset. The findings below are acknowledged but have **no scheduled plan item** — re-triage
before biology onboarding (they were seen in the audit but aren't on any to-do list). Finding numbers =
1-based array index; titles given for stability.
- **#14 [HIGH] SEG-marker parser divergence — ✅ PARSER UNIFICATION DONE (PR #196, branch `feat/seg-markers-unification`).**
  Was **7** copies of `parseSegments` (not 2) + ad-hoc regexes. Consolidated into one `tools/lib/seg-markers.cjs`
  (CommonJS so the CJS server *and* ESM tools both consume it; interop verified). **Characterization-tested
  no-op:** lib reproduces all 3 old parser variants byte-identically across 523 corpus files. Duplicate-policy
  **preserved per-site** via a `duplicates:'first'|'last'` option (185 corpus files have dup IDs, so it's
  exercised — convergence is the separate #15 enforcement step, NOT done here). #18 whitespace absorbed (canonical
  regex is the tolerant superset). **Evidence corrected the plan's premise:** parser divergence is INERT on
  biology (0/13 files differ) — this is hygiene/drift-prevention, it does **NOT** unblock biology routing.
  - **↳ `isApiTranslated` routing mis-route is the REAL biology risk, RE-SCOPED as its own item** (NOT #14):
    the `{{i/b/term/fn}}` content-sniff (`cnxml-inject.js:3361`) returns false for low-marker biology modules
    (9/13) → routes them through legacy web-UI marker-repair. Latent today (those 9 are marker-less prose so the
    repair no-ops), but a real risk for a biology module bearing `[[sub:]]`/`[[sup:]]`/`[[i:]]` without `{{}}`.
    The clean fix needs **producer provenance (B2)** — A1's manifest carries no `tool`/`track`. Do with/after B2.
  - *Still open cluster:* **#15** duplicate-seg-ID policy convergence (the behavior-changing enforcement PR);
    **#19** [LOW] orphan `*-segments(b|c|d).en.md` legacy files cleanup.
- **#33 [HIGH, blocks_next_book] inject list-flattening divergence** — `buildExampleDom` PRESERVES nested
  lists; `buildExerciseDom`/`buildNoteDom` DELETE them (`cnxml-inject.js:2597`/`:2854`). Unify on the
  example approach. (Distinct from C4 table-DOM and the render-side C-track work.) **→ folded into the
  Biology onboarding required set (2026-06-29):** biology has exercises + notes, the two affected builders.
- **#43 [HIGH] `annotateInlineTerms` gloss desync** — `--annotate-en` attaches English glosses by ordinal
  position; desyncs on term reorder / count mismatch → **the wrong gloss reaches readers**. Real
  reader-facing correctness bug, not cosmetic.
- **#37 [LOW]** `buildExerciseDom` drops id-less exercises entirely; `buildGenericElement` recurses without
  `ctx`. **#30 [LOW]** 429 retry ignores `Retry-After` + has no jitter (A4-adjacent). **#29 [LOW]**
  control-char (NUL/°) failure aborts the module with no retry — asymmetric vs the truncation path that
  retries. **#31 [LOW — also WRONG by 2×]** cost-rate magic number duplicated AND incorrect: `malstadur-api.js:52` + `api-translate.js:742` use `(chars*5)/1000` (0.5 ISK/100), but the real price is **1 ISK/100 chars = 10 ISK/1000** (lead-confirmed 2026-06-30) → every cost estimate is HALF the true spend. Fix: one shared `ISK_PER_1000_CHARS = 10` constant. See memory `malstadur-api-integration` § API PRICE.
  **#38 [INFO]** ~500 lines of dead legacy string builders retained + exported.
- *Already scheduled — no register entry needed:* #26→B3, #34→C4, #35→D4, #40/#42→B2, #65→D6, #79→[VEFUR],
  #56/#58/#61→D-track. *Already resolved:* #73 (id-less `<para>`-in-`<note>`)→C1; #72/#75/#76 (positioner
  inconsistency)→the C3 5-positioner/63-`indexOf` convergence already listed in the A3/C3 item notes.
- *Tracked separately (NOT this plan, do not duplicate):* accessibility findings — assistive MathML for
  equations + figure alt-text translation pipeline — live in
  `docs/plans/2026-06-25-accessibility-alt-math-handoff.md` and memory `accessibility-alt-math-pending.md`.

**From D2 (pre-intake probe) design — `docs/plans/2026-06-29-d2-preintake-probe-design.md` § Out of scope:**
- **D2 check-5 `HANDLED_INLINE`/`HANDLED_BLOCK` drift risk** — the probe hand-maintains mirrors of the
  pipeline's handled inline AND block tags (the extractor/render expose no single importable list). If the
  pipeline's tag handling changes, the probe over/under-reports unrecognized inline elements until the
  constants are updated. Revisit a "single source of handled tags" refactor (pipeline exports its handled
  set; probe shares it). Low severity; latent.
- *Boundaries (owned elsewhere, not D2 — recorded so they're not re-opened against D2):* config-file
  presence → `validate` (D1); structural fidelity → A3; the gap *fixes* D2 detects → D3 (os-embed) / D4
  (iframe) / D5 (glossary), already scheduled. D2 detects only.

**From D6 (parametrized CSS-contract):**
- **[VEFUR] 14 cross-book CSS variant/section gaps** — parametrizing the css-contract over all 5 books
  surfaced classes non-chemistry books emit but vefur `content.css` doesn't style (biology/microbiology
  `note-*` variants + `span-all`; organic/physics exercise-section types; `note-interactive` SHARED).
  All render via base `.note`/plain divs — cosmetic, not broken. Tracked in efni `css-contract.test.js`
  `KNOWN_GAPS` + **vefur memory `css-cross-book-gaps`** (the actionable list lives in the vefur repo, per
  cross-repo protocol). Per-book launch polish; `note-interactive` is a quick vefur win. Remove from
  `KNOWN_GAPS` as each gets a real rule.
