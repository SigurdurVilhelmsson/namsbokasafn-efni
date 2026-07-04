# Design — OC-B: keep direct-child container tables in place (`tablesHandledInContainers`)

**Date:** 2026-07-04. **Status:** design — awaiting lead review.
**Type:** injection correctness fix (element document-order). **Inject-only; extraction untouched.**
**Scope:** a `<table>` that is a direct child of `<example>`/`<exercise>`/`<note>` is mis-positioned.
No committed `02-`/`03-`/`05-` regeneration (armed for WS5; verified fresh in-memory + diagnostic re-run).

Part of the chemistry clean-slate oracle-hardening gate; the last extract/inject reorder cause before
the id-order gate flip. Find **OC-B** in the register (`docs/plans/2026-06-28-…-plan.md`).

## The bug (confirmed against m68789)

A `<table>` that is a **direct child** of an `<example>`/`<exercise>`/`<note>` (NOT referenced inline
via `[[TABLE:]]`) is extracted as a **standalone top-level `type:'table'`** element in
`structure.content` — pulled out of its container (verified: `fs-idm205685856` in m68789 appears only
as a top-level `table`, not in the example subtree, not in `inlineTables`). At inject,
`buildExampleDom`/`buildExerciseDom`/`buildNoteDom` re-parse the container CNXML (which *physically*
contains the table) and **strip** it via `removeTablesExceptKept` (its id is not in `keptTableIds`).
So the table renders only from the standalone copy — positioned by its raw offset, which lands it
**after the whole container block** instead of inside it → a document-order reorder. The cascade in
the diagnostic is one table leapfrogging the elements between its source and standalone positions
(m68789: one table = 72 "moved"; **16 of the 19 residual modules have a `table` cause**).

## Why inject-only — F4 already solved this for figures

F4 fixed the identical positional bug for **figures**, purely in inject: each container builder
collects direct-child `<figure>` ids into `keptFigureIds` (Step 4a), registers them in
`ctx.figuresHandledInContainers` (`cnxml-inject.js:2588`), and `buildFigure` returns `null` for a
registered id (`:1910`) — so the figure renders once, in-container, in position. **Direct-child
tables have no analog** (`keptTableIds` is populated only by inline `[[TABLE:]]` expansion). That
asymmetry *is* OC-B. The fix is the table analog of the figure pattern, in the same functions.

## The fix — `tablesHandledInContainers`, mirroring `figuresHandledInContainers`

1. **ctx init** (`cnxml-inject.js` ~1648, beside `figuresHandledInContainers`): add
   `const tablesHandledInContainers = new Set();` and include it in the `ctx` object (~1652).
2. **Each of the 3 container builders** (`buildExampleDom`, `buildExerciseDom`, `buildNoteDom`),
   before the `removeTablesExceptKept(...)` strip: collect the ids of `<table>` elements that are
   direct children of the container (using the **same node scope** each builder already uses to
   collect direct-child *figures* — e.g. `exampleEl.childNodes` for the example; the
   problem/solution children for the exercise) into `keptTableIds` (so the strip keeps them). Then
   register every id in `keptTableIds` into `ctx.tablesHandledInContainers` (mirroring the figure
   registration at `:2588-2591`).
3. **Standalone table build** (`buildElement`'s `case 'table':` / the `buildTable` dispatch, ~`:1814`):
   return `null` (skip) when `ctx.tablesHandledInContainers.has(element.id)` — mirroring the
   `buildFigure` skip at `:1910`.

Extraction is **not** changed. The direct-child table stays where it physically is in the re-parsed
container DOM (correct position); the mispositioned standalone copy is suppressed at build time.

### Ordering (mirrored assumption, already relied on by figures)
`buildCnxml` iterates `structure.content` in sorted order; a container sorts before the standalone
element nested within it (container start-offset < nested element offset), so the container is built —
and registers the id — before the standalone `case 'table':` runs. This is the exact ordering the
figure pattern already depends on in production.

## Why it cannot reintroduce F4's duplication

- The **stale inline-expanded original** is removed by `removeStaleExpandedTables` (runs in
  `processContent`, *before* Step 4a), so the direct-child tables collected in Step 4a are genuine
  container-owned tables, not leftover inline originals.
- The **fail-loud throw** in `removeTablesExceptKept` (id ∈ `inlineTableIds` but ∉ `keptTableIds`)
  never fires for a direct-child table (it is not inline-referenced) and is left intact.
- **Inline** tables' standalone copies were already suppressed by F4's extraction `inlineTablesMap`
  guard, so registering their ids in `tablesHandledInContainers` too is harmless (the standalone
  `case 'table':` never encounters them).

## Components & isolation

| Unit | Purpose | Depends on |
|---|---|---|
| `ctx.tablesHandledInContainers` (new Set) | ids of tables rendered inside a container | — |
| direct-child table collection + registration (3 builders) | keep them in-container, mark handled | container DOM, `keptTableIds` |
| standalone `case 'table':` skip | suppress the mispositioned standalone copy | `ctx.tablesHandledInContainers` |

## Testing

- **Behavioral unit test** (new, `tools/__tests__/`): a synthetic module with a `<table>` as a direct
  child of an `<example>`, plus a `<para>` after it inside the example and a top-level element after
  the example. Build via `extractSegments → buildCnxml`; assert the table renders **inside** the
  example (before the example's closing tag / before the following top-level element), exactly once —
  fails pre-fix (table appears after the example block), passes post-fix.
- **Regression — m68789 exercises BOTH paths**: assert the built output contains the inline exercise
  table `fs-idm121830912` (F4 path) exactly once **and** the direct-child example table
  `fs-idm205685856` (OC-B path) exactly once, each in its correct container — proving OC-B doesn't
  regress F4 and vice-versa.
- **Integration proof — re-run the diagnostic**: `node tools/analyze-order-causes.js --book
  efnafraedi-2e`. Assert residual **drops** from 19 toward ~3 (the 16 `table`-cause modules clean;
  the 3 non-table — m68739/m68832/m68852 — remain), clean count **rises**, **no previously-clean
  module regresses**. Record the numbers.
- **No committed `02-`/`03-`/`05-` regeneration**; `npm test` + `npm run validate` green from repo root.

## Definition of done

- `ctx.tablesHandledInContainers` added; the 3 container builders keep + register direct-child tables;
  the standalone `case 'table':` skips registered ids.
- Behavioral test (table stays in-container) + the m68789 both-paths regression test pass.
- Diagnostic residual measurably drops (19 → recorded N ≈ 3); no clean-module regression; the F4
  inline-table + fail-loud-throw behavior is unchanged (existing inject/table tests still green).
- No committed `books/` bytes changed; `npm test` + `npm run validate` green from repo root.

## Explicitly out of scope

- The 3 non-`table` residual modules (m68739/m68832/m68852 = equation/term/media) — the
  needs-deeper-look tail, re-triaged after OC-B.
- The **id-order gate flip** to hard-fail — after OC-B + tail re-triage.
- Re-extract / re-inject / re-render (WS5). This fix is *armed* for it.

## Workflow

brainstorming → writing-plans → subagent-driven-development; one PR off `main`; TDD; the diagnostic
re-run is the integration proof; `npm test` from repo root is the gate. Log out-of-scope finds to the
register.
