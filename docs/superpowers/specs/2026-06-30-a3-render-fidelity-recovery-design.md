# Design — A3 render-fidelity recovery (recover dropped equations + images)

**Date:** 2026-06-30
**Backlog item:** A3 (the deferred render-fidelity drops) in
`docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (Track A item A3 + § Consolidated
Backlog "A3 ~30 math drops"). Lead-chosen as the next coding task (2026-06-30).
**Nature:** bug fix (systematic-debugging + TDD), not greenfield. **Status:** design approved-in-discussion;
ready to write the spec into a plan.

## Why this exists / what changed from the plan's description

The plan recorded A3's deferred drops as "~30 net math drops (ch15–21; ch21=15, ch17=9) + 1 image drop
(appendices)", flagged non-blocking pending lead triage. **That characterization is stale.** A fresh
investigation (2026-06-30) re-measured against current `main` (which now includes a11y-2):

- The drops **reproduce in current render code** (a fresh re-render still drops) → genuine render bugs,
  not stale committed output.
- The A3 fidelity check's **chapter-aggregate count masks the true loss**: rollup pages
  (`*-exercises.html`, `*-answer-key.html`, `*-key-equations.html`) *re-present* equations, inflating the
  HTML side, so per-module section-page shortfalls (e.g. m68798 140→76) look alarming but are mostly
  legitimate **redistribution**, while genuine losses can hide under the inflation.
- An **equation-identity diff** — keyed on the MathML that a11y-2 now stamps into every rendered
  expression, deduped against rollup re-presentation — gives the honest per-equation answer. For the
  affected chapters it returned exactly the chapter-aggregate number, so the true count is **firm, not a
  floor**.

## Verified diagnosis (efnafraedi-2e)

**22 lost equations + 2 lost images**, across ch12/13/16/17/21/appendices, in **three root-cause
contexts**:

| # | Context | Count | Where | Note |
|---|---------|-------|-------|------|
| **A** | display `<equation class="unnumbered">` in calculation-heavy section/solution bodies | ~17 | ch12 ×1, ch13 ×16 | render in *neither* section page nor rollups — genuinely gone. Exact ancestor (top-level section body vs deep inside an `<example>`) to be pinned by the characterization RED step. |
| **B** | inline math inside glossary `<definition>`/`<term>` | 5 | ch16 ×1, ch17 ×2, ch21 ×2 | term names embedding math symbols (ΔG°f, E°kerfis, ₊₁⁰β); the definition/key-terms render path doesn't run inline content through math rendering. |
| **C** | images | 2 | ch13 (`CNX_Chem_13_04_ICETable3_img_IS.svg`), appendices (1, to localize) | image referenced in CNXML, absent from all HTML. |

These sit in render paths the C2/C3/C4 arc never migrated (that arc fixed note/example/exercise/table
equation dispatch; plain section-body equations and glossary definitions were untouched).

## Approach

**Per-root-cause TDD, mirroring the C2/C3 precedent** (`cnxml-render-example-dom.test.js`,
`cnxml-render-exercise-dom.test.js`, `cnxml-render-note-dom.test.js`):

1. For each context, write a **failing characterization test** with minimal inline CNXML that reproduces
   the drop. The RED step localizes the exact render-path gap (dispatch map / inline-content processing /
   media path).
2. Fix the gap. GREEN. One commit per root cause.
3. Where the fix touches the DOM seam, extend the **loud seam** (C3) so the now-handled context fails loud
   on a future un-dispatched child rather than dropping silently.

**Likely loci** (to be confirmed in RED, not edited speculatively):
- A → section-body / solution equation dispatch in `tools/cnxml-render.js` (the `renderSectionContent` /
  content-walk path and its `hoistTags`/equation dispatch).
- B → the `<definition>`/key-terms renderer in `tools/cnxml-render.js` (inline content not run through the
  math path).
- C → the media/image render path (`renderMedia` / image emission) for the dropped SVG's container.

## Verification oracle — identity diff, folded into the check tool

Per lead decision (2026-06-30): **harden `tools/cnxml-render-fidelity-check.js`** to use the
MathML-identity diff (CNXML `<m:math>` skeleton multiset vs all-chapter-HTML assistive-`<math>` multiset,
so rollup re-presentation cancels) instead of / in addition to the masking chapter-aggregate count. This
lets the tool hard-gate at **0 genuine losses** and stops it under-reporting the way it did here.

- **Acceptance:** the identity-diff lost-count for efnafraedi-2e goes **22 → 0** (math) and the 2 image
  drops → 0; the hardened check reports 0 and can gate.
- The diff is computed against a **scratch render** (render → measure → revert), so the PR changes render
  *code* + tests only — no committed `05-publication` churn.
- A characterization test per root cause is the durable regression lock (the throwaway script proved the
  concept; the committed tests + hardened check tool are the deliverable).

## Scope

- **efnafraedi-2e only** — the only re-rendered/published book; other books are out of scope (they rely on
  the same code, so the fixes benefit them when they are onboarded/re-rendered, but they are not measured
  or gated here).
- **Delivery to readers is the separate re-render+sync** — NOT this PR. This PR fixes render code + tests,
  verified via the identity diff against a scratch render. The reader-facing recovery rides the pending
  stale-render re-render+sync wave (which should be re-run after this lands, since these fixes change
  published output).
- Out of scope: other books; the re-render itself; non-equation/image fidelity; the C3-b positioner
  convergence refactor (optional cleanup, not needed for correctness).

## Files

- `tools/cnxml-render.js` — the three render-path fixes (A section/solution equation dispatch, B
  definition inline-math, C image path). Exact lines pinned in each RED step.
- `tools/__tests__/cnxml-render-*-dom.test.js` (new or extended) — one characterization test per root
  cause; reuse the inline-CNXML pattern from the C2/C3 suites.
- `tools/cnxml-render-fidelity-check.js` — fold in the identity-diff measure; hard-gate at 0.
- `tools/__tests__/cnxml-render-fidelity-check.test.js` — extend for the identity-diff path.
- `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` — mark A3 done; record the
  stale-description correction + the detector hardening; log any out-of-scope finds.

## Acceptance

- Identity diff: efnafraedi-2e genuine math losses 22 → 0; image losses 2 → 0.
- New characterization test per root cause (A/B/C) green; each fails before its fix (RED evidence).
- Hardened `cnxml-render-fidelity-check.js` reports 0 genuine losses and gates on them; its test suite green.
- Full `npm test` green; `npm run validate` 24/24. Golden suite: any change additive/intended and reviewed
  (these fixes legitimately *add* recovered equations/images to render output — regenerate goldens and
  confirm the diff is only the recovered content).
- No committed `05-publication` churn in this PR (scratch-render verification only).
