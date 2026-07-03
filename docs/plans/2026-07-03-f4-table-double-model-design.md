# Design — F4: fix the table double-model at extraction (+ coordinated inject expand + gate flip)

**Date:** 2026-07-03. **Status:** design — awaiting lead review.
**Scope:** the `[[TABLE:]]` residue / duplicate-table bug, fixed at its root (`cnxml-extract.js`)
plus the coordinated `cnxml-inject.js` expansion it unblocks, and the `assertNoMarkerResidue`
gate flip. **Type:** extraction correctness + injection correctness + fail-loud gate.

Part of the chemistry clean-slate arc (`docs/plans/2026-07-01-chemistry-clean-slate-design.md`),
first item of the **oracle-hardening gate** before biology onboarding. F4 was **split out** of the
F5/F6 PR (`docs/plans/2026-07-02-f456-marker-residue-design.md` § "Split outcome") when its
characterization test proved the root cause is at extraction, not inject.

## Why this exists

A `<table>` embedded inside a container's paragraph (e.g. `m68789` exercise `fs-idm32841312`,
where `<table id="fs-idm121830912">` lives **inside** `<para id="fs-idm84914160">` inside
`<problem>` — verified in source lines 405–428) is **modelled twice** by extraction, then
**mangled** by inject:

1. **Extraction double-models it** (`cnxml-extract.js`):
   - *Faithful copy:* `processExercise` (:1314) routes the problem para through
     `extractInlineText` with `inlineTablesMap`, turning the embedded `<table>` into a
     `[[TABLE:id]]` inline ref + an `inlineTables` structure entry. **Correct** — the table
     belongs in that para.
   - *Spurious copy:* `processTopLevelContent` (:740) runs
     `extractNestedElements(content, 'table')` over the **whole module**, finds that same
     table, and emits it a **second time** as a standalone `section > table` structure element
     (:813–822 push, :957 `processTable`).

2. **Inject then mangles the inline copy** (`cnxml-inject.js`):
   - `buildExerciseDom` (:2688) / `buildExampleDom` (:2448) inject the translated problem text
     **without** expanding `[[TABLE:]]` (unlike `buildPara`, which does at :1853–1861), so the
     placeholder publishes as **literal text**.
   - Both then **unconditionally strip** every `<table>` (:2726 / :2482), deleting the real
     table from the container.

Net reader-visible result: the real table vanishes from the exercise, `[[TABLE:id]]` leaks as
literal junk, and the standalone duplicate floats out as a sibling of the exercise. The
tag-count fidelity check is blind to the literal-text residue (Fable-5 finding 4) and only sees
the duplicate as inflated `table/tgroup/tbody/row/entry/colspec` counts (`m68789`: `table 14→16`).

## Decision — which way to "model once"

**Suppress the standalone; keep the inline ref.** The source settles it: the table is genuinely
inside the problem para, so the inline `[[TABLE:]]` ref is the faithful placement and the
standalone `section > table` emission is the duplicate. The alternative (kill the inline ref,
keep the standalone — no inject change, gate flips for free) was **considered and rejected**: it
renders the table as a sibling of the exercise instead of inside the problem, trading a
marker-residue bug for a placement bug that the hardened id-order oracle (gate item 2) is built
to catch. Correct placement is worth the two-file cost.

## Decisions (lead, 2026-07-03)

1. **Guard breadth → all container types that inline-reference tables.** The
   `inlineTablesMap`-membership guard is self-scoping: it suppresses the standalone copy of any
   table that a container captured as an inline `[[TABLE:]]` ref. In practice that is
   `exercise` / `example` / `note` — the processors that route their paras through
   `extractInlineText` on *untouched* container content. **`list` is excluded automatically and
   correctly:** extraction strips a list item's table markup out of `contentForSimpleElements`
   *before* `lists` is extracted (`cnxml-extract.js:771-778`), so a list-item table never reaches
   `processList`, never becomes an inline ref, and stays standalone — pre-existing behaviour,
   identical to a table embedded in a top-level para (both render as a standalone sibling). The
   membership guard leaves that untouched. **Consequence for the coupling below:** because no
   `list` `[[TABLE:]]` ref is ever produced, `buildList` needs **no** change and there is **no**
   gate landmine there. The inject expand + exempt-from-strip fix therefore covers exactly the
   three DOM builders that both receive an inline ref and strip tables: `buildExerciseDom`,
   `buildExampleDom`, `buildNoteDom`.
2. **Gate → flip `[[TABLE:]]` carve-out to hard-fail now** (armed for the batched WS5 re-inject).
   `assertNoMarkerResidue` throws on any `[[TABLE:…]]` in assembled output.

## The fix (two files + gate)

### Extraction — suppress standalone tables that were inline-referenced
`cnxml-extract.js` `processTopLevelContent`, `case 'table':` (~957). **Refined mechanism**
(safer than position-based exclusion): elements are processed in document order, and a container
always sorts before the tables nested within it, so `inlineTablesMap` is already populated by the
time a container-embedded table's `case 'table':` runs. Guard: **skip standalone emission iff the
table id is already in `inlineTablesMap`** (i.e. it was actually captured as an inline ref). This
is strictly safer than position math — a table that is a *direct* `<problem>`/`<note>` child (not
inside any `<para>`, hence never inline-referenced) is **not** in `inlineTablesMap`, so it still
emits standalone and is never lost. It covers all four container types for free, since every
container processor populates `inlineTablesMap`. Tables embedded in top-level paras remain
standalone-only (extraction strips them from para content at :771–775 before para extraction, so
no inline ref is generated → not in `inlineTablesMap` → still standalone). Unchanged.

### Inject — expand `[[TABLE:]]` in container builders, exempt from strip
`cnxml-inject.js` `buildExerciseDom` / `buildExampleDom` (+ `buildNoteDom` and the list path, per
the robustness coupling). Mirror the `keptFigureIds` pattern that already sits beside the strip:
- Before `replaceParaContentDom`, expand `[[TABLE:id]]` in the para text via
  `ctx.inlineTables.find(...) → buildTable(...)` (the exact `buildPara` :1853–1861 logic).
- Collect each expanded table's id into a `keptTableIds` set.
- Change the unconditional `removeElementsByTag(el, ['table'])` to remove tables **unless**
  their id is in `keptTableIds` (exactly how figures are removed-unless-kept at :2727–2733).

This is **expand-and-exempt** (not expand-before-strip): the figure path already proves the
exempt pattern works against the identical strip, resolving the open question the F5/F6 doc left.

### Gate — hard-fail on `[[TABLE:]]` residue
`cnxml-inject.js` `assertNoMarkerResidue`: remove `TABLE` from the carve-out so the marker-form
residue regex hard-fails on any surviving `[[TABLE:…]]`. `MATH`/`MEDIA` carve-outs unchanged.

**Precise scope of the residue gate (correction, 2026-07-03 final review):** this gate catches only
a `[[TABLE:]]` placeholder that *physically survives* into assembled output. It does **not** catch a
table that is silently *dropped* — e.g. a container para skipped via `if (!paraText) continue`
(missing translation) never emits its placeholder, so there is no residue to catch, yet
`removeTablesExceptKept` would then delete the original block-child `<table>`. Since F4 removed the
standalone fallback, that would be silent table loss. **Second guard (added in the same arc):**
`removeTablesExceptKept` now also receives the inline-referenced id set and **throws** if it is about
to strip a `<table>` whose id ∈ `ctx.inlineTables` but ∉ `keptTableIds` (inline-referenced but never
expanded). So the two guards together are the fail-loud net: the residue gate catches surviving
`[[TABLE:]]`; the strip guard catches an inline table that was never expanded. Neither preserves an
untranslated table (that would publish English silently). The broader *para-text* loss from
`if (!paraText) continue` is pre-existing and out of F4 scope (logged separately).

## Testing — fresh in-memory extract, zero fixture regeneration

**The critical constraint** (advisor-flagged): `cnxml-dom-comparison.test.js` sources structure
from **on-disk** `02-structure/…-structure.json` (:69–70, `m68789` baseline 5), which is still
double-modeled. Running the inject expand against that stale structure reproduces the standalone
+ expanded-inline duplicate that split F4 out. And per the F1 lead decision, on-disk fixtures are
**not** regenerated here (re-extract entangles Track-B4 marker modernization into `02-for-mt`).

Resolution: tests build **single-model** structure by calling the exported in-memory
`extractSegments(cnxml)` (`cnxml-extract.js:1910`) on the source CNXML — no file writes, no
committed fixture changes.

- **New characterization/regression test** (`tools/__tests__/` new file): for each of the 6
  affected modules (`m68764`, `m68770`, `m68789`, `m68791`, `m68793`, `m68829`), fresh-extract →
  assert (a) the structure models each container-embedded table **once** (no standalone
  `type: 'table'` duplicate), (b) `buildCnxml` output contains the table **inline in its
  container**, exactly once, (c) **zero** `[[TABLE:` residue, (d) no tag-count inflation vs a
  single-model baseline.
- **Extraction unit test:** a synthetic module with a table inside each container type
  (exercise/example/note/list) → `extractSegments` emits it only as an inline ref, never
  standalone; a table that is a direct section child is still standalone.
- **Inject unit test:** a container whose para segment holds `[[TABLE:t1]]` with `ctx.inlineTables`
  providing `t1` → output has the built table inline, once, no residue; the source table is not
  double-emitted.
- **Gate unit test:** assembled string with a surviving `[[TABLE:x]]` throws; clean output and a
  legit nested chemistry bracket (`[[Ag]]`-style) do not.
- **Existing `cnxml-dom-comparison.test.js`:** the affected modules' entries move to
  fresh-extract sourcing so they validate against single-model structure (their baselines should
  drop toward PERFECT as the duplicate disappears); unaffected modules keep on-disk sourcing.

## Components & isolation

| Unit | Purpose | Depends on |
|---|---|---|
| standalone-table exclusion (extract) | model container tables once, as inline refs | container `fullMatch` positions |
| `[[TABLE:]]` expand + `keptTableIds` (inject) | render the inline table in its container | `ctx.inlineTables`, `buildTable` |
| removed-unless-kept strip (inject) | drop only untranslated source tables | `keptTableIds` |
| `assertNoMarkerResidue` (gate) | fail loud on any `[[TABLE:…]]` leak | — |

## Definition of done

- Extraction models every container-embedded table exactly once (inline ref); no standalone
  duplicate — proven on fresh-extract of the 6 modules + synthetic all-container fixture.
- Inject renders the table in its container, once, with zero `[[TABLE:` residue.
- The gate hard-fails on any `[[TABLE:…]]` residue; passes on clean output and legit brackets.
- **No committed `01-source/`, `02-structure/`, `02-for-mt/`, `03-…`, `05-…` bytes change.**
- `npm test` + `npm run validate` green **from the repo root**.

## Deferred / out of scope (log to the register)

- **Actual re-extract + re-inject + re-render** of the 6 modules → the batched WS5 pass. The
  gate is *armed* for it; today's committed output still carries residue until then. The WS5
  runbook must note the re-inject has to pass the new gate.
- **Top-level-para AND list-item embedded tables** render as a standalone sibling (extraction
  :771–778 strips the table out of `contentForSimpleElements` before para/list extraction, so no
  inline ref is generated and the table survives only via the standalone `tables` array). The
  list item's own segment text loses the table (e.g. reads "Item table:" with no placeholder).
  Placement differs from source but is **pre-existing**, not introduced by F4 — separate finding
  (log to register). Confirmed during implementation (Task 1): `list.fullMatch` handed to
  `processList` never contains the table, so `inlineTablesMap` never holds a list-table id.
- **`buildList` needs no `[[TABLE:]]` support** for F4: since no list `[[TABLE:]]` ref is ever
  produced, none can leak into the gate. (Fixing the pre-existing list-table-to-standalone
  behaviour would need a coordinated extraction-reorder + `buildList` inject change — its own
  future task, out of F4 scope.)

## Workflow

brainstorming → writing-plans → subagent-driven-development; one PR off `main`; TDD /
characterization-first; robustness>expedience; `npm test` from repo root is the authoritative
gate (no branch protection). Log out-of-scope finds to
`docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`.
