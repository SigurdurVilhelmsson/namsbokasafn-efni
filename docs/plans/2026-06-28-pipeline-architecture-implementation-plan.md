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

### A3 — Render-stage structural check + wire fidelity into CI as regression  ·  M  ·  dep: none (helps C)  ·  ✅ DONE (feat/a3-render-fidelity-check + fix/a3-render-fidelity-recovery)
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
  rollup pages legitimately inflate counts; only a net drop is honest. (c) **Baseline now committed**
  (`books/efnafraedi-2e/render-fidelity-baseline.json`), regenerated against a fresh full re-render in
  `fix/a3-render-fidelity-recovery` after the drops below were fixed; shape-drift check now enforced.
- **Acceptance:** ✅ `cnxml-render-fidelity-check.test.js` — clean passes; dropped-figure, bold↔italic
  swap, injected NUL, and dropped-equation each fail (5 tests). Wired into `validate.yml` as a
  **non-blocking** report + `npm run fidelity:render`.
- **Bonus finding (stale description corrected 2026-06-30):** initial run against committed output found
  **~30 net math + 1 image drop** (stale label: ch21=15, ch17=9). The identity-diff oracle (`identityDiffChapter`,
  Task 1 of `fix/a3-render-fidelity-recovery`) revealed these were really **22 math + 2 image drops** across
  3 render-path root causes — all fixed; whole-book oracle now reports **0 genuine-math-drop / 0 image-drop**:
  - **~17 eq + ch13 ICE-table image (`renderList`):** block equation/media children of list items were
    silently dropped (Task 2 — `renderList` now renders block children in source order via a DOM direct-child walk (`parseCnxmlFragment` + `nodeType===1`), reusing `renderEquation`/`renderMedia`).
  - **5 math (`renderGlossary` + compiled-keyterms path):** inline math inside glossary `<term>`/`<meaning>`
    was passed through as raw text instead of rendered MathJax markup (Task 3).
  - **1 appendix image = INTENTIONAL:** appendix-A periodic table `<image>` → the rendered page serves a
    custom interactive replacement; allowlisted via `computeIntentionalImageDrops` + `specialModules` in
    `book-config.json` (Task 4). Not a bug.
  - **Identity-diff gate** (`identityDiffChapter`): replaces the rollup-masking count-only check with a full
    `<math class="assistive-mathml">` skeleton diff (a11y-2 content, present only after a fresh re-render).
    Hard-gates on `genuine-math-drop`. **Reader delivery rides a separate re-render** — the oracle validates
    render *code* against a fresh local render; the committed `05-publication` does not auto-update. A
    follow-on re-render+sync is required to serve the recovered equations/images to readers on namsbokasafn.is.

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

> **→ For the consolidated, urgency-tagged, re-verified scan list, see [§ ★ Consolidated Backlog](#-consolidated-backlog--follow-ups--tech-debt-the-single-triage-list) at the end of this doc.** This register remains the detailed prose source for each find; the Consolidated Backlog is the authoritative triage view.

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
    the `{{i/b/term/fn}}` content-sniff (`cnxml-inject.js:3330`) returns false for low-marker biology modules
    → routes them through legacy web-UI marker-repair. The clean fix needs **producer provenance (B2)** —
    A1's manifest carries no `tool`/`track`. Do with/after B2.
    - **✅ DIAGNOSTIC PROBE DONE (2026-06-30):** `docs/audit/2026-06-30-b2-isapitranslated-misroute-probe.md`.
      Quantified blast radius. The sniff effectively reduces to "has `<term>`/`<footnote>`?" (extract emits
      bracket `[[i:]]`/`[[b:]]` now, so `{{i}}`/`{{b}}` clauses are dead). **Q1:** **50/259 (19%)** biology
      modules are term/footnote-free → mis-route (a floor — `{{term}}` is the lossy legacy family, so live
      count is ≥50); **49/259** are the *structural danger zone* (mis-route **and** media-bearing). **Q2:**
      corruption on **current** API content (ch05; ch03 is docx, restores intended) is **ZERO** — only
      m66372 mis-routes and its restore triggers (MEDIA/BR/sup/sub) are all 0 EN=IS, so the restores
      provably no-op; verified byte-identical re-inject + real-code run. **Verdict: mis-routing is real and
      common but incidentally inert today** (API preserves MEDIA/BR; lossy `{{term}}` happens to survive).
      That inertness is fragile, not guaranteed → B2 still ships **as producer provenance, NOT a sniff-patch**.
      Payoff: probe proves the provenance swap is **behavior-preserving on all current content**, so B2 lands
      as a clean low-risk refactor. [[feedback-robustness-over-expedience]]
    - **✅ B2 IMPLEMENTED & VERIFIED (2026-06-30, branch `feat/b2-provenance-routing`):** design
      `docs/plans/2026-06-30-b2-provenance-routing-design.md`, plan `…-b2-provenance-routing-plan.md`.
      Per-module provenance sidecar (`mNNNNN-provenance.json`) written by both producers
      (`api-translate`, `docx-import`); `tools/lib/provenance.js` maps tool→policy (`api-translate`→warn,
      `docx-import`→mutate, unknown→throw); inject resolves policy from `02-mt-output` and **fails loud**
      on missing provenance for MT-origin content; warn policy runs the 3 web-UI restores on a clone
      (no mutate) — also a mis-stamp detector. Backfilled 189 existing sidecars (only liffraedi ch03 is
      docx). **Orphan `/import-mt` route retired** (un-stamped producer, found during design). **Pure
      refactor proven** by `scripts/verify-b2-idempotent.sh` (baseline-ref vs HEAD inject in worktrees;
      16/side real injects; 0 real `.cnxml` diff). `restoreMathMarkers`/`restoreTermMarkers` untouched.
  - *Still open cluster:* **#15** duplicate-seg-ID policy convergence (the behavior-changing enforcement PR);
    **#19** [LOW] orphan `*-segments(b|c|d).en.md` legacy files cleanup.
  - *New out-of-scope finds (logged during B2 execution 2026-06-30 — NOT B2's job):*
    **(a)** ~8 **stale committed `03-translated` CNXML** produced by an older renderer (pre-#179..#183);
    both main and B2 now emit the newer placement, so the committed files lag → regenerate in a separate
    **re-render+sync PR**. **(b)** ~15 chapter/track combos **fail to inject** identically on main & B2:
    2 faithful chapters missing translation files; 13 mt-preview chapters blocked by the A2 residue gate
    (chapters MT'd before A2 existed) — pre-existing, decide whether to re-translate or grandfather.
    **(c)** the `--book` slug validator (`BOOK_OPTION`) rejects `__e2e-fixture__` (leading underscores), so
    backfill/CLI tools can't target the test fixture — pre-existing across all `--book` tools (LOW).
  - *New out-of-scope finds (surfaced by CI on PR #208 auth-cookie fix 2026-07-01 — NOT #208's job; CI
    credits came back ~2026-07-01 so these red jobs are newly visible, both pre-existing & unrelated to the
    2-line SameSite change):*
    **(d1) [HIGH] e2e mined-candidates 500 — ✅ FIXED (PR #209).** `terminology.spec.js:623,628` failed
    deterministically in CI (both PR & post-merge main runs) but NEVER reproduced locally (isolated, full
    suite, `--workers=1` all 159-pass). Root cause (found by instrumenting the swallowed catch → deterministic
    CI printed it): **`termMiningService.js` hardcoded `pipeline-output/sessions.db` instead of
    `resolveDbPath()`, so it ignored `SESSIONS_DB_PATH`.** Under E2E, migrations built the schema in
    `e2e-sessions.db` while the service queried the canonical DB → `no such table: mined_term_candidates`.
    Passed locally because the dev's canonical DB happens to have the table (a silent test-isolation
    violation — the service was reading the real dev DB during tests); 500'd in CI where no canonical DB
    exists. **Prod unaffected** (with `SESSIONS_DB_PATH` unset the two paths coincide). Fix = use
    `resolveDbPath()` (the lone service that didn't); guard `termMiningDbPath.test.js`. Same class as the
    known `analyticsService.js` eager-DB latent (see memory Test-isolation) — worth a sweep for other
    hardcoders. The migration errors (d2) were a RED HERRING here — proven not the cause.
    **(d2) [LOW] migration 004/006 non-idempotency (benign)** — on any migration RE-RUN (e2e does two: seed
    then boot), `004`'s `CREATE INDEX … terminology_discussions(term_id)` and `006`'s `… users(github_id)`
    throw `no such column` because later migrations (032 redesign, 022 provider-auth) removed those columns;
    `CREATE INDEX IF NOT EXISTS` guards the index name, not the column. **Benign** — boot continues, endpoints
    work, prod logs these 2 lines harmlessly every boot (the "fatal in production" log is a *separate*
    `config.js` missing-secret warning, not this). The scary framing in the original (d) was wrong. **Lead
    chose the run-once migration-ledger fix** (schema_migrations table + backfill for existing DBs) — its own
    PR, separate from d1.
    **(f) [MED] cwd-relative `books/…` paths in `tools/lib` → live-preview 500 risk — ✅ FIXED.** The
    `renderService.test.js` "local-fails/CI-passes" was NOT a data issue: `loadEmbedMapping` used
    `path.join('books', …)` resolved against **process.cwd()**, so it returned `{}` unless run from the repo
    root (my `cd server && vitest` invocation was the wrong cwd; CI runs from root). But the same pattern bites
    the **server**: it starts `cd server && npm start` (cwd=server/), so `loadEmbedMapping` (embed modules) AND
    `book-rendering-config.readBookConfigFile` (EVERY book — `getBookRenderConfig` throws when config missing)
    would 500 live preview. Currently masked ONLY because prod's systemd `WorkingDirectory` is the repo root —
    the code shouldn't rely on that. Fixed all three cwd-relative sites (`embed-mapping.js`,
    `book-rendering-config.js`, `parseArgs.js`) to resolve `books/` via `import.meta.url` (repo root), + a
    chdir-to-tmp regression test. efnafraedi (live) has no embeds so no live impact today; this unblocks biology
    embed live-preview. Same *class* as the #210 DB-path bug (cwd/path fragility masked by happenstance env).
    **(e) [LOW/hygiene] stale generated docs** — `npm run docs:generate` produces uncommitted diffs in
    `docs/_generated/routes.md` + `tools.md` (propagation routes, term-mining `/mine*` reorder, `import-mt`
    removal — drift from earlier PRs that never regenerated). The `docs-check` job only runs on
    `server/routes/**` touches, so it stays green until any route PR trips it (as #208 did). Fix = regenerate
    + commit; consider making `docs:generate` part of the routes-touching pre-commit hook.
- **#33 [HIGH] inject list-flattening divergence — ✅ DONE (PR #197, branch `fix/inject-list-flatten-unify`).**
  One `paraHasFlattenedList` helper now serves all three DOM builders; `buildExerciseDom`/`buildNoteDom`
  **preserve** a `<list>` flattened into a math-bearing `<para>` (was `removeChild`-deleted), matching
  `buildExampleDom` (byte-identical no-op there). Characterization tests prove preserve + example no-op;
  full suite green. **Evidence corrected the `blocks_next_book` label:** the divergence is narrow (fires
  only when a `<list>` is nested inside a `<para>` whose restored segment has `<m:math>`). Measured blast
  radius (`find`-based, 2026-06-30): **biology 0 trigger hits → NOT a biology blocker**; the real
  beneficiaries are **physics 11 / chemistry 3 / organic 1** (microbiology 0, astronomy 0). Direct-child
  lists (the common exercise-options case) were always preserved. Design/plan: `docs/plans/2026-06-30-audit33-*`.
  - With #14 + #33 done and D4/D6/D7 merged, biology onboarding's **only remaining gate is the re-scoped
    `isApiTranslated` routing/provenance fix (needs B2)**.
- **#43 [HIGH] `annotateInlineTerms` gloss desync** — `--annotate-en` attaches English glosses by ordinal
  position; desyncs on term reorder / count mismatch → **the wrong gloss reaches readers**. Real
  reader-facing correctness bug, not cosmetic.
- **#37 [LOW]** `buildExerciseDom` drops id-less exercises entirely; `buildGenericElement` recurses without
  `ctx`. **#30 [LOW]** 429 retry ignores `Retry-After` + has no jitter (A4-adjacent). **#29 [LOW]**
  control-char (NUL/°) failure aborts the module with no retry — asymmetric vs the truncation path that
  retries. **#31 ✅ DONE (PR #199)** cost-rate magic number was duplicated AND 2× wrong. Fixed: one shared `estimateIsk(chars)` + `ISK_PER_1000_CHARS = 10` in `malstadur-api.js`, consumed by all 4 sites (`malstadur-api.js` tracker, `api-translate.js:742`, `translate-chapter-titles.js:91` — a 4th site the audit missed; `:815` derives from the tracker). True price 1 ISK/100 chars = 10 ISK/1000 (lead-confirmed 2026-06-30). Unit-tested (`malstadur-api.test.js` § estimateIsk). See memory `malstadur-api-integration` § API PRICE.
  **#38 [INFO]** ~500 lines of dead legacy string builders retained + exported.
- *Already scheduled — no register entry needed:* #26→B3, #34→C4, #35→D4, #40/#42→B2, #65→D6, #79→[VEFUR],
  #56/#58/#61→D-track. *Already resolved:* #73 (id-less `<para>`-in-`<note>`)→C1; #72/#75/#76 (positioner
  inconsistency)→the C3 5-positioner/63-`indexOf` convergence already listed in the A3/C3 item notes.
- *Tracked separately (NOT this plan, do not duplicate):* accessibility findings — assistive MathML for
  equations + figure alt-text translation pipeline — live in
  `docs/plans/2026-06-25-accessibility-alt-math-handoff.md` and memory `accessibility-alt-math-pending.md`.
  **a11y-2 (assistive MathML) is now DONE** (PR #203 merged 2026-06-30). Out-of-scope issues found during a11y-2 implementation: none in efni; cross-repo vefur follow-ups (search-index strip for the new `<math>` sibling + print/bionic verify; no CSS) handed off to `namsbokasafn-vefur docs/plans/2026-06-30-cross-book-css-and-embed-handoff.md` Task 3.

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

**From chemistry WS1 (EN-residue scan, 2026-07-01 — `docs/plans/2026-07-01-chemistry-ws1-residue-scan-plan.md`):**
- **A2 `detectResidue` false-positives on chemistry answer-key / formula cells** — the content-word
  floor (`residue-check.js:48`, alphabetic tokens ≥3 letters) is defeated by **3-letter unit
  abbreviations** (`amu`, `atm`, `kPa`, `torr`, `bar`, `rem`, `rad`) and **chemical-formula letter
  clusters** (`CrP`, `HgS`): after `normalizeForComparison` strips digits/symbols, a *correctly-localized*
  numeric cell (EN `12.01 amu` → IS `12,01 amu`, decimal `.`→`,`) collapses to `amu amu…` on both sides
  and flags as exact residue. The whole-book chemistry scan produced **24 such false positives** (13
  modules) + scientist proper-name note-titles (`Dorothy Crowfoot Hodgkin`) — **0 genuine body residues**.
  Recalibration candidates: a unit/symbol stop-list, or treat a decimal `,`/`.` swap as positive evidence
  of localization. Low urgency (noise, never wrong content), but it means a residue *gate* would cry wolf
  on chemistry answer keys — relevant before wiring residue into CI or the editor save path (A2-c). Also
  bears on biology (species Latin binomials would similarly false-positive). `[fix]` detector calibration.
- **`requireBook()` resolves `books/<slug>` against `process.cwd()`** — `parseArgs.js:49`
  (`fs.existsSync(path.join('books', args.book))`) is cwd-relative while every tool's own resource paths
  are now `import.meta.url`-rooted (#213). Running a `--book` tool from a non-repo-root cwd falsely
  rejects a valid book. Shared by ~21 tools; masked in prod only by systemd `WorkingDirectory`. Same class
  as #210/#213/f. `[fix]` own PR (shared-lib change; split from any enforcement).

---

## ★ Consolidated Backlog — Follow-ups & Tech-Debt (THE single triage list)

> **Authoritative as of 2026-06-30.** This consolidates every still-open item from this plan's tracks,
> its out-of-scope register (above), and all prior plans (editorial-throughput, security-remediation,
> accessibility, deferred-fixlist, term-system audit), into one tagged list. **Every code item below was
> re-verified against `main` HEAD on 2026-06-30** (4 parallel verification passes; `file:line` evidence
> shown) — items already fixed by a later PR or made moot were dropped (e.g. audit **#19** orphan
> `*-segments[bcd].en.md` cleanup → **0 such files exist, retired**; **#31** cost estimator → done #199).
> The detailed prose for each lives in its track item / register entry above; this is the scan+triage view.
>
> **Urgency tags:** **🔴 Breaking** (ships wrong content to readers / blocks a book onboarding / corrupts
> data) · **🟠 High** (real correctness or reader-facing gap, or ops/security exposure) · **🟡 Medium**
> (robustness/maintainability that bites soon or on the next book; meaningful UX) · **🟢 Low**
> (minor/latent/cleanup) · **⚪ Info** (dead code / decision-to-make / no behavior impact).
> **Owner tags:** `[build]` scheduled track item · `[fix]` tech-debt bugfix · `[infra]`/`[process]`
> non-code · `[decision]` needs lead call · `[vefur]` sister-repo (do not fix here).

### 🔴 Breaking
| Item | Evidence | What & why | Owner |
|---|---|---|---|
| **D3** os-embed organic exercises ship English | `cnxml-render.js:146` reads `01-source/exercises/*.json` (EN); 260/342 organic files, 1 961 `os-embed`; no extract/translate path | Every organic end-of-section problem renders untranslated English | `[build]` Track D — **blocks organic onboarding** |

### 🟠 High
| Item | Evidence | What & why | Owner |
|---|---|---|---|
| **D5** organic/microbiology empty key-terms | lifraen 31 `key-terms` / 0 `<glossary>`, render fallback `cnxml-render.js:3706` emits EN term names; orverufraedi 0/0 → empty "Lykilhugtök" | Key-terms page ships English (organic) or blank (microbiology) | `[build]` Track D — blocks organic+microbiology |
| **a11y-1** figure `alt` text English | `cnxml-extract.js:202,1018,1061` never segments `alt`; ~1 572 EN `alt=` across 215 published files | Screen-reader gap across ALL published content; needs extract→MT→review + backfill | `[build]` (= deferred-fixlist B / a11y handoff Item 1) |
| ✅ DONE **a11y-2** assistive MathML missing | `tools/lib/mathjax-render.js:12` SVG-only, no `mjx-assistive-mml` sibling | Equations inaccessible to screen readers; one-file fix + re-render | `[fix]` a11y handoff Item 2 (**PR #203 merged** 2026-06-30; self-contained visually-hidden `<math>` sibling; no vefur CSS leg; delivery awaits a re-render+sync; **vefur search-index strip + verify items handed off** — vefur cross-book handoff Task 3) |
| **infra-1** content-sync Action fails silently | `.github/workflows/sync-content.yml:37` needs unset `VEFUR_DEPLOY_TOKEN`; every push to `05-publication/**` no-ops | Auto-publish to vefur is dead; sync is manual `node scripts/sync-content.js` | `[infra]` set the token or accept manual |
| **process-1** remediation manual QA §0–§5 | `docs/plans/2026-06-10-qa-checklist.md` — 👁/◐ gates unwalked since 2026-06-12 | Authz/rollback/enforcement/XSS/page-auth gates never verified on a running server | `[process]` lead — gates server deploys |

### 🟡 Medium
| Item | Evidence | What & why | Owner |
|---|---|---|---|
| **#43** annotateInlineTerms gloss desync | `cnxml-inject.js:808` `termIndex++`, no id-match | `--annotate-en` attaches glosses by ordinal → wrong gloss if order/count differ (only that flag's path) | `[fix]` |
| **#37** id-less exercises dropped | `cnxml-inject.js:2602` `if(!element.id) return null`; `buildGenericElement` calls `buildElement` w/o `ctx` (`:3051`) | `<exercise>` without id silently dropped; fallback loses figure-tracking ctx | `[fix]` |
| **A2-a** `--allow-en-fallback` disables residue run-wide | `cnxml-inject.js:3429` `checkResidue = lang!=='en' && !allowEnFallback` (run-scope) | One fallback module silences residue detection for ALL modules in the run | `[fix]` per-module signal |
| **A2-b** missing translation aborts whole chapter | `:3338` try wraps loop, `:3214` throw → `:3525` `exit(1)`; residue-report write `:3505` never reached | A partially-translated chapter fails entirely + no residue manifest written | `[fix]` per-module skip-continue + `finally` write |
| **B3** producer bracket-marker count check | `api-translate.js:263-266` `validateMarkers` counts `<!-- SEG` only, no `[[` per-type | Inline bracket-marker loss/truncation invisible at MT boundary | `[build]` Track B |
| **B4** term/footnote still lossy `{{ }}` | `cnxml-extract.js:314`(`{{term}}`)/`:381`(`{{fn}}`) | ~2.3% per-call API loss on the highest-volume inline elements; brackets = ~0% | `[build]` Track B |
| **C4** inject `buildTable` → DOM | `cnxml-inject.js:1956-2013` positional regex (render-side table bug already fixed separately) | Architecture investment; no active bug — fragile for nested/multi-para cells | `[decision]` Track C — invest? |
| **C3-a** table escapes note/example/exercise | dispatch maps `cnxml-render.js:1435/1561/1635` lack `table`; loud seam logs it (not silent) but renders nothing | 0 real nestings in efnafraedi; **re-check at biology onboarding** | `[build]` Track C (biology-gated) |
| **D2** HANDLED_INLINE/BLOCK drift | `tools/lib/preintake-checks.js:10-57` hand-maintained mirrors; no shared importable list | Probe over/under-reports when extractor/render add a tag (biology likely trigger) | `[fix]` single-source refactor |
| **#15** duplicate-seg-ID policy diverges | `seg-markers.cjs:18-37` per-site `first`/`last`; inject=first (`:177`), placeholder/section=last; 185 files have dup IDs | On a duplicated segment, inject vs other tools silently pick different text | `[fix]` converge policy (behavior-changing) |
| **infra-2** Greynir spellcheck sidecar deploy | code complete (`greynirEngine.js:77` `GREYNIR_URL`, `/spellcheck` returns `enabled:false`); `server/greynir-sidecar/` unshipped | In-editor spellcheck silently disabled until sidecar deployed + env set | `[infra]` lead — worth the Python sidecar? |
| **decision-1** `residue-report.<track>.json` disposition | written `cnxml-inject.js:3315`; not gitignored, not committed | First inject on any book leaves untracked working-tree dirt | `[decision]` gitignore vs `merge=ours` |
| **rem-2.2** localized restore parity | remediation roadmap line 69 — `content_versions` is faithful-only | Pass-2 localized content has only `.bak` restore, no UI version history | `[fix]` follow-up |
| **term-§5 / D5-dup** lifraen zero `<glossary>` | 0 `<glossary>`, 31 `key-terms` in `books/lifraen-efnafraedi/01-source` | `generate-glossary.js` aggregate is empty for organic (subset of D5) | `[build]` folds into D5 |

### 🟢 Low
| Item | Evidence | What & why | Owner |
|---|---|---|---|
| **#30** 429 retry no `Retry-After`/jitter | `malstadur-api.js:113` pure exp-backoff (A4 added backoff, not these) | Thundering-herd unlikely at this scale | `[fix]` |
| **#29** control-char no retry (asymmetric) | `api-translate.js:478` throws → `:803` per-module catch (module fails, **run continues**) vs truncation retries | Module-level only (claim of process-abort was overstated) | `[fix]` |
| **C3-b** positioner/`indexOf` convergence | `cnxml-render.js:745-860` ~9 `indexOf` section-level positioners | Optional cleanup; silent-drop class already closed by C3 loud seam | `[fix]` cleanup |
| **A2-c** server-editor residue surface | not wired in `segmentEditorService.js` (by design; A2 gate lives in inject) | Editors get no live untranslated-EN warning on save | `[fix]` future UX |
| **stale-render** ~8 stale committed CNXML + ~15 inject failures | session worktree-inject finding (baseline≡current); pre-#179..#183 renderer | Stale CNXML lag the renderer; ~15 chapters fail (A2 gate / missing translations) | `[process]` re-render+sync PR; re-translate or grandfather |
| **term-§4** inline `dfn` w/o glossary match | term-system audit §4 (e.g. §6.1 `bylgjulengd`, `tíðni`) | Source `<glossary>` never defined them → no hover lookup | `[content]` add to source/supplement |
| **fixlist-A2** fnref-N collision (latent) | deferred-fixlist — not currently occurring | Only if a compiled exercises page gains ≥2 footnote-bearing sections | `[latent]` re-number page-globally if triggered |
| **decision-2** table-as-image transcription | m68852/m68854 (efnafraedi ch21) | Tables shipped as images (alt suffices); manual expert transcription not automatable | `[decision]` lead |
| **low-cli** `--book` rejects `__e2e-fixture__` | `parseArgs.js:18` pattern rejects leading `_` | Latent — only if a CLI tool is run with `--book __e2e-fixture__` | `[fix]` low |
| **throughput** deferred enhancements | roadmap `2026-06-12` `[ ]`: 2.4b review-dedup v2, 3.3 term-cat→glossary link, 3.4 glossary-export freshness on approve, 5.2 reviewer daily digest, 5.4 feedback routing | All deliberately deferred; build after adoption proves the need | `[build]` lead sign-off |
| **rem-minor** remediation follow-ups | 2.4 unified Pass-1 dashboard; 3.3 per-chapter SLA aging; 4.1 full editor URL rewrite (`?module=`) | Deliberately deferred polish | `[fix]` follow-ups |

### ⚪ Info / deferred-by-design
| Item | Evidence | Note |
|---|---|---|
| **#38** ~500 lines dead legacy string builders | `cnxml-inject.js` `buildExample`/`buildExercise`/`buildNote` (2189/2501/2709), exported `:3552-3556` | Superseded by `*Dom`; comparison tests depend on the export → delete with the tests | 
| **B2-math** `restoreMathMarkers` upstream-move | `cnxml-inject.js:572,3403`; no `[[MATH:N]]` count in `api-translate.js` | Works correctly; deferred design move (per-segment count check upstream) |

### 🔗 Cross-repo `[vefur]` (owned by namsbokasafn-vefur — fix THERE, do not edit here)
**Handed off 2026-06-30** as a self-contained plan in the sister repo: `namsbokasafn-vefur`
`docs/plans/2026-06-30-cross-book-css-and-embed-handoff.md` (vefur PR #175) + vefur memory pointer.
Reconciled against vefur memory — only the CSS work is genuinely open:
- **[vefur] D4 embed-wrapper CSS** (🟠 `.embed-responsive`/`.embed-fallback`) — gates biology embeds; exact rules in the handoff doc.
- **[vefur] 14 cross-book CSS gap classes** (🟡, biology note-variants + `.span-all` prioritized; `.note-interactive` quick win) — coordinated with efni `KNOWN_GAPS` + `VEFUR_CONTRACT=1` css-contract; per-book **note-class vocabulary** + a shared **class manifest** fold into this.
- *Already DONE in vefur (NOT open — corrected from an earlier draft):* live-QA **I/J/H/G** fixed & merged (vefur PR #164; J's nginx side #166).
- *Reclassified efni-side (NOT vefur):* fixlist **E** "empty-glossary TOC suppression" = stale efni-built `glossary.json`/`index.json` aggregates (vefur memory `glossary-aggregates-stale`) → folds into the glossary/**D5** work above. **F** cross-repo confirmations = resolved.
- **[vefur] a11y-2 assistive-MathML follow-ups** (🟡/🟢, PR #203 merged efni-side; handed off as Task 3 in the cross-book handoff doc): NO vefur CSS needed (self-contained inline hiding — must not add a rule that fights it), but the new `<math>` sibling lands in all rendered math after re-render+sync → **(a)** add a search-index strip in `search.worker.ts` (inline `.math-inline` MathML text otherwise pollutes the index); **(b)** verify print/PDF keeps it hidden + bionic-reading skip-list; **(c)** post-deploy screen-reader validation (reader-plan § P2.5). `equations.ts` is class-based → unaffected.

### 🧭 Process / adoption (non-code — lead)
- **Adoption is the binding throughput constraint:** only ~3 faithful modules applied; concordance/TM/repetition aids stay empty until editors review Pass-1 at volume. *(Priority 1 per `2026-06-24-next-session-roadmap.md`.)*
- **Lead decisions pending:** C4 (invest in the inject DOM port?), table-as-image transcription, grandfather-vs-retranslate the ~15 inject failures, Greynir operational cost.

### Suggested sequencing (cheapest-impactful first)
1. ✅ ~~**a11y-2 assistive MathML**~~ (done — branch `feat/a11y-2-assistive-mathml`) · **decision-1 residue-report** (🟡, prevents tree dirt) · **B3** (🟡, S).
2. **A2-a/A2-b** residue robustness (🟡 `[fix]` pair) · **B4** (🟡, M) · **#15** convergence (🟡, needs a policy decision).
3. Biology content production (foundation done) → re-check **C3-a** when biology injects.
4. Organic onboarding wave: **D3** (🔴) + **D5** (🟠) together.
5. Batch the 🟢/⚪ tech-debt (`#43 #37 #30 #29 #38`, C3-b) as a cleanup PR or two.
6. Lead/infra parallel: **process-1 manual QA**, **infra-1 sync token**, **infra-2 Greynir deploy**, **adoption**.
