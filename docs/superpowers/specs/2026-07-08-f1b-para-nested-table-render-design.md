# F1b — para-nested `<table>` render leak in container renderers (design)

**Date:** 2026-07-08 · **Roadmap item:** #2b (Tier 1, the headline of #2) in
`docs/plans/2026-07-07-byte-perfect-efnafraedi-roadmap.md`.
**Follows:** F1-part-1 (PR #251, merged `f73b76ae`). This is the render-path fix F1-part-1 deferred.

## Problem

Published efnafraedi-2e pages leak raw CNXML table markup into reader HTML: e.g. `12-4-heildud-hradalogmal.html`
contains literal `<entry align="left">Tími (s)</entry>`, `<row>…`, `<colspec…/>` text (18 fragments), and
the exercises pages for ch10/ch12/ch18 leak similarly. This is the live `<entry>`-leak roadmap item #2 is
named after.

## Root cause (proven via systematic-debugging)

Container renderers — `renderExample`, `renderExercise` (its inner `renderSectionContent`), and
`renderNote` — emit their block children via `renderBlockChildrenInOrder(content, ctx, dispatch, { hoistTags })`.
For a `<para>`, that helper detaches only the children whose tag is in `hoistTags` (currently
`['list', 'equation']`), renders the para *without* them via `renderPara`, then renders the detached
children after the para. A `<table>` nested inside a `<para>` is **not** in `hoistTags`, so it stays inside
the para and is rendered by `renderPara` → `processInlineContent`. `processInlineContent` handles inline
markers (`<sub>`, `<em>`, math) but has **no concept of table structure**, so it emits `<table>`, `<tgroup>`,
`<row>`, `<entry>`, `<colspec>` as **raw literal text** while still processing the inline content inside the
cells (hence the leaked-tags-with-processed-content signature).

Direct-child tables of an example render correctly (PR #238 added `table: renderTable` to `renderExample`'s
dispatch), which is why the bug hid: the leaking tables are **para-nested**, not direct children.

### Confirmation

Temporarily adding `'table'` to `renderExample`'s `hoistTags` and re-rendering ch12 dropped the raw
`<entry>`/`<row>` count in `12-4` from **18 → 0** and produced a proper `<table id="fs-idm140502592">`.
Reverted.

### Blast radius (efnafraedi-2e)

13 para-nested `<table>` instances across **6 modules**: **12 in exercises, 1 in an example**, **0 at
section level, 0 nested in a cell** (`<entry>`). The 6 modules are `m68764` (ch10), `m68770` (ch10),
`m68789` (ch12), `m68791` (ch12, 6 tables), `m68793` (ch12), `m68829` (ch18). These are exactly the 6 B4
re-MT modules — but F1b is **render-only** and does not touch their segments (see Non-goals). `renderNote`
has the identical latent gap with **0 live instances** today.

## Fix — uniform table handling across the three container renderers

The pattern is identical everywhere `renderBlockChildrenInOrder` is used for a container: a `<table>` must
be both **dispatchable** (`table: renderTable` in the dispatch map) and **hoistable** (`'table'` in
`hoistTags`), so a table renders via `renderTable` whether it is a direct child or nested in a `<para>`.

- **`renderExample`** (`cnxml-render.js` ~L1379–1400): dispatch already has `table: renderTable`; **add
  `'table'` to `hoistTags`** (`['list', 'equation', 'table']`).
- **`renderExercise`** → `renderSectionContent` (~L1463–1479): **add `table: renderTable` to the dispatch
  AND `'table'` to `hoistTags`.**
- **`renderNote`** (~L1247–1255): **add `table: renderTable` to the dispatch AND pass
  `{ hoistTags: [...Object.keys(dispatch)] }` or an explicit list including `'table'`.** (renderNote
  currently passes no `hoistTags`, so it defaults to `Object.keys(dispatch)`; once `table` is a dispatch
  key it is hoisted automatically — but make the intent explicit and covered by a test.)

`renderTable` already registers its id in `context.renderedTableIds`, so a later section-level pass skips
the duplicate — no double-render when a table is hoisted.

## Verification

- **TDD unit tests** (one per container renderer): feed a container whose `<para>` contains a `<table>`;
  assert the output contains a proper `<table>`/`<tr>`/`<td>` (or `<th>`) structure, contains **zero** raw
  `<entry`/`<row`/`<colspec` substrings, and preserves inline cell markup (e.g. `<sub>`/`<em>`). Follow TDD:
  write the failing test, confirm the raw-leak assertion fails, then apply the fix.
- **Whole-book re-render diff** (acceptance gate): re-render all chapters (mt-preview) + faithful ch01/ch03;
  every changed page must be one of the 6 affected modules' pages (12-4, 10/12/18-exercises, and any
  content page for m68764/m68770/m68793/m68829); assert **zero raw `<entry`/`<row` in every published
  page book-wide** after the fix; **zero URL renames**; `translation-errors.json` unstaged.
- **Goldens:** regenerate `render-golden/ch12/m68789.html` (already a golden; has 1 para-nested table) and
  **add `render-golden/ch12/m68791.html`** (richest case, 6 para-nested tables) to lock the fix byte-exact.
- **Full suite green** from repo root (`npm test`).
- **Reader spot-check** (guards the reordering risk below): confirm each fixed table renders in its correct
  position within the worked example / exercise solution (not moved above trailing prose).

## Non-goals

- **No re-MT / no segment changes.** F1b edits only `cnxml-render.js` and re-renders from the existing
  committed `03-translated`. The 6 modules' B4 re-MT stays a separate future item; F1b delivers the render
  fix now without touching segments.
- **Not section-level** rendering (`renderContent`) — 0 para-nested tables there in efnafraedi-2e.
- **Not in-cell nested tables** (`<table>` inside `<entry>`) — 0 instances in efnafraedi-2e.
- No change to `renderTable`/`renderTableCells` themselves (they render tables correctly; the bug is only
  that para-nested tables never reach them).

## Risks

- **Reordering:** hoisting detaches the table and renders it *after* its `<para>`. If a para had prose
  *after* the table, that prose now precedes the table. OpenStax authoring places the table at the end of
  the para (verified for m68791's case, which rendered correctly), and this is the same hoist mechanism
  already used for `list`/`equation`. The whole-book re-render diff + reader spot-check confirm no bad
  reordering; if a real after-table-prose case exists, it surfaces in the diff.
- **Shared helper, three call sites:** the change is localized to three dispatch/hoist configs; `renderTable`
  and `renderBlockChildrenInOrder` are unchanged. Unit tests cover each site; the golden + whole-book diff
  cover integration.

## Delivery outcome (2026-07-08)

Delivered on branch `fix/chem-f1b-para-nested-table-render` (3-task SDD; suite 1976 green). Two things
ran beyond the plan's prediction, both correct:
- **The `renderNote` fix also corrected direct-child note tables**, not just para-nested ones: a
  direct-child `<table>` in a note was previously undispatched → picked up by the section-level pass and
  rendered *after* the note's `</aside>` (escaped). It now renders inside the aside. This closed a pinned
  known-gap in `cnxml-render-nesting.test.js` (`table-in-exercise`/`table-in-note` were `it.skip`-ped
  escape assertions; now un-skipped and asserting in-place). Affected 4 extra pages (ch02 2-7/2-exercises,
  ch07 7-exercises, ch12 12-7) — all correct.
- **MathJax-id churn:** the `MJX-NNN` id counter is shared across a `--chapter` render, so m68791's fix
  shifted ids on 4 later ch12 pages (12-5/12-6/12-answer-key/12-key-equations) with **zero content change**
  (verified 0 non-MJX changed lines). Committed as the canonical post-fix render state; logged as roadmap
  tech-debt #14 (reset the counter per page).
- The `m68789` golden came out **byte-identical** (its para-nested table is in an excluded `exercises`
  section stripped from the module-page render); `m68791` is the real golden witness. The `<solution>`
  render path is gated off (`includeSolutions` always false), so the exercise unit test uses `<problem>`.

Whole-book gate held: **zero raw `<entry>`/`<row>`/`<colspec>` in any published page; zero URL renames.**

**Two whole-branch-review follow-ups (non-blocking, logged):** (1) section-level para-nested tables remain
unguarded — `renderBlockChildrenInOrder` has no `renderContent` caller, so a `<table>` in a top-level
`<para>` would still leak; 0 instances in efnafraedi-2e, tracked as roadmap tech-debt #15 for biology
characterization. (2) The `m68791` golden intentionally locks a **partially-untranslated B4 module**
(English residue: `Answer:`, English figcaptions, a duplicated `Second-Order` header) — render faithfully
reproduces current content; Pass-1/B4 own the translation. The golden will change when m68791 is
translated; that is expected, not a regression.

## Delivery to readers

Render changes reach namsbokasafn.is only via the lead's Phase-6 sync/deploy. F1b lands corrected bytes in
`05-publication/`; the deploy is a separate lead step.
