# F2: render section-order fix — design spec

- **Date:** 2026-07-07
- **Status:** Approved (brainstormed; follows the STALE-STRUCT delivery Fable review)
- **Related:** `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` (register — "STALE-STRUCT delivery outcome", F2 row), `docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md` (ranked path this belongs to), STALE-STRUCT delivery PR #248.

## Problem

The STALE-STRUCT delivery fixed reading-order scrambles in the committed `structure.json`/`03-translated` data, and a Fable reader-experience review confirmed genuine fixes on ~11 pages. But it also found that `cnxml-render.js` **independently re-scrambles** section order at render time: `renderSection` emits a section's nested `<section>`s **before** the parent section's own loose content (intro paragraphs, figures, examples). This is the *same bug class* as the original STALE-STRUCT problem (nested subsection hoisted before parent intro), but living in the renderer rather than the data.

Consequence on **10 pages** (`3-2, 4-2, 7-2, 7-6, 8-4, 11-1, 18-3, 18-9, 20-1, 21-4`): the reader still meets subsections before the parent's intro, and because figure/example **numbers are assigned in a separate source-order pass** (`cnxml-render.js:455–461`, not emission order), the now-correct numbers visibly **jump** (e.g. 7-6: 7.14, 7.17…7.25, 7.15, 7.16). The reading-order fix only fully reaches readers where the scramble was in the *data*, not where the *renderer* causes it. Physical order equals what is live today (not a regression), but the correct numbering advertises the render bug.

## Goal

Make `cnxml-render.js` emit a section's children (loose content + nested subsections) in **document order**, so the rendered reading order matches the source (and the already-correct numbering), completing "reading order fixed for readers" on the 10 pages — without changing any figure/example/table number, cross-reference, or section filename/URL.

## Key facts (verified)

- **Root cause is isolated to `renderSection`** (`tools/cnxml-render.js:946–958`): it renders all nested sections first (946–951), then loose content via `renderTopLevelContent` (955). `renderContent` (the module top level, 758–910) already renders correctly via a position-sorted document-order walk that *includes* sections.
- **Three ordering code paths exist** — `renderContent` (full, with sections), `renderTopLevelContent` (loose elements only, no sections), `renderSection` (the buggy split). The divergence is the defect.
- **Numbers/refs are decoupled from emission order.** `chapterFigureNumbers` (and example/table equivalents) are built from the source *before* rendering. So this is a **pure emission-reordering** fix: HTML blocks move; numbers, cross-references (Fable-confirmed 100% correct), and section filenames (from `buildModuleSections`/`sectionOrder`, unaffected) all stay put. Fixing emission order makes it match the numbering → the jumping resolves and refs remain correct.

## Design

### One shared ordered-walk helper

Extract `renderContent`'s collect-positions → sort-by-position → render-by-type loop (lines 758–910, excluding the trailing glossary handling) into:

```
renderChildrenInDocumentOrder(content, context, { excludeSections, sectionLevel }) → string
```

- Collects every child (sections — subject to `excludeSections` + `EXCLUDED_SECTION_CLASSES`; figures, notes, examples, exercises, tables, media, lists, equations, paras) with its source position, sorts by position, renders each by type. The `case 'section'` uses the passed `sectionLevel` instead of the hard-coded `2`.
- Container-nesting rules preserved verbatim (strip examples/exercises before notes; notes-inside-examples excluded; media/list/para stripping order).

Both callers use it:
- **`renderContent`** → `renderChildrenInDocumentOrder(content, ctx, { excludeSections: ctx.excludeSections, sectionLevel: 2 })`, then its existing glossary tail (912–917). **Output must be byte-identical to today.**
- **`renderSection`** → render title, then `renderChildrenInDocumentOrder(contentWithoutTitle, ctx, { excludeSections: false, sectionLevel: Math.min(level + 1, 6) })`, replacing the split at 946–958. `excludeSections: false` preserves the current behavior of rendering all nested subsections (order is the only change).

**`renderTopLevelContent`** (the partial third copy) is subsumed; remove it if it has no other caller, otherwise leave it and note the dead-in-this-path status.

### Two-commit split (the safety mechanism — "split refactor from enforcement")

1. **Refactor commit:** introduce `renderChildrenInDocumentOrder`; `renderContent` uses it; **`renderSection` untouched (still buggy)**. Gate: the *entire* render golden suite is byte-identical — proving the extraction changed no behavior anywhere (module-level rendering, all books).
2. **Fix commit:** switch `renderSection` to the helper. Goldens now change **only** for nested-section modules — a clean, reviewable, pure-reorder diff.

This isolates the one behavior change to commit 2 and makes commit 1 provably inert.

## Testing & verification

- **TDD unit** (before the fix): a fixture section `[title][intro para][nested <section>]` → assert rendered order is intro-para **before** the nested section (RED against current `renderSection`, GREEN after the fix).
- **Refactor gate (commit 1):** full golden suite unchanged.
- **Fix verification (commit 2):** regenerate render goldens, diff-review as **pure reorder** (no number/ref/text changes); `npm run fidelity:render` → 0; cross-references still resolve correctly; full `npm test` from repo root green; **re-render efnafraedi-2e and re-run the narrow Fable reader pass on the 10 F2 pages** to confirm intro-first order reaches the reader with no number-jumping.
- **Blast radius** measured empirically at commit 2 (golden count); expected: efnafraedi's 10 pages published + goldens for any fixture module with loose-content-before-subsection. Cross-book (biology onboarding) benefits automatically.

## Out of scope

- **F1** (table `<entry>`-leak on leading-empty-cell tables; m68710/m68733 excluded from the delivery) — a *separate* render bug (table-cell rendering), tracked in `docs/plans/2026-07-06-table-cell-translation-gate-followup.md`.
- Module-level section-exclusion semantics — preserved, not changed.
- Figure/example numbering — untouched (it is already source-correct).

## Risks / mitigations

| Risk | Mitigation |
|---|---|
| Extraction subtly changes `renderContent` output | Commit-1 gate: full golden suite byte-identical before touching `renderSection` |
| Fix changes more than order (text/number drift) | Commit-2 goldens diff-reviewed as pure reorder; numbering is source-decoupled |
| Cross-book regression (shared renderer) | Full golden suite covers the fixture set; re-render + spot-check published books |
| Render still wrong in an unforeseen nesting shape | Fable re-review of the 10 pages is the reader-level backstop the gates can't provide |
