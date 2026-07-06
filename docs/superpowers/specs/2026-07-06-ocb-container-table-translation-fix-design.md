# Design — Fix OC-B container-table translation loss + IS→EN table gate

**Date:** 2026-07-06. **Type:** inject bug fix + new fail-loud gate. **One PR.**
**Blocks:** WS5 (see `docs/audit/2026-07-06-ws5-oc-b-table-translation-regression.md`).
**Branch:** `fix/chem-ocb-container-table-translation` (off main + the WS5 audit doc).
> **⚠ UPDATE 2026-07-06 (post-implementation):** The **Gate (Gate A)** in this design was **split out to a follow-up** after stress-testing showed it too brittle to hard-fail (2 proven false positives from IS-text processing). This PR ships **only the fix (Fix A)**. Robust-gate redesign + rationale: `docs/plans/2026-07-06-table-cell-translation-gate-followup.md`.


## Problem (proven)

OC-B (PR #226, commit `985e211d`) added `tablesHandledInContainers`: when a table is a **direct
child of an example/exercise/note in the CNXML DOM**, the container builder
(`buildExampleDom`/`buildExerciseDom`/`buildNoteDom`) registers its id so `buildElement`'s
`case 'table'` returns `null` (skips standalone emission), and the table rides along inside the
container's serialized DOM (`serializeCnxmlFragment(containerEl)`).

That serialized DOM carries the **source (English) `<entry>` cells**. The standalone path it replaced —
`buildTable(node, getSeg, originalCnxml)` — is what applies per-cell translations
(`getSeg(cell.segmentId)` from the table structure node's `.rows[].cells[]`). So OC-B fixed table
*position* (its order-goal, 60→4) but dropped table *cell translation*: cells revert to English and
numeric cells lose Icelandic decimal formatting (`0,10`→`0.10`).

Bisect proof (m68710, identical `02-mt-output`): pre-inject-F4 = Icelandic; post-F4/pre-OC-B =
Icelandic; post-OC-B = English. Blast radius: ~30 mt-preview modules, reaches published HTML.
Faithful track (ch01/ch03) unaffected. Every tag-counting gate is blind; only the byte-exact render
golden caught it, by luck, on 7 sampled modules.

Key structural nuance: the table is a **sibling of the example in the extracted structure** (both
children of a section) but **nested inside the example in the DOM**. So the container builder sees it
(DOM scan) but does not hold its structure node (with `.rows`/`.cells[].segmentId`) — that lives
elsewhere in `structure.content`.

## Goals / non-goals

- **Fix:** kept container tables emit their **translated** cells, preserving OC-B's in-place ordering.
- **Gate:** a producer-side fail-loud check that catches *any* table whose available cell translation
  didn't reach the output — the class no gate covers today.
- **Non-goals:** no change to OC-B's ordering behavior; no change to extraction; no re-MT; no touch to
  `01-source`. Restoring pre-OC-B cell text (byte-parity with the old standalone `buildTable`) is the
  bar — not "perfect" table modelling (row0's 2-vs-3-cell shape is pre-existing extraction behavior,
  out of scope).

## Fix — Approach A: translate-and-splice in the container builders

1. **New collector `collectTableNodes(elements, map)`** — recursively walks `structure.content`
   (mirroring `collectFigureCaptions`/`collectBlockEquationIds`), mapping every `table` node's `id`
   → the node itself (which carries `.rows[].cells[].segmentId`). Built once in `buildCnxml` and put
   on `ctx.tableNodesById`.
2. **In `buildExampleDom` / `buildExerciseDom` / `buildNoteDom`** — after `serializeCnxmlFragment`
   produces `result`, for each id in that builder's `keptTableIds`:
   - Look up the structure node in `ctx.tableNodesById`.
   - Call `buildTable(node, getSeg, originalCnxml)` → translated table CNXML.
   - Replace the source `<table ... id="${id}" ...>…</table>` block in `result` with the translated
     CNXML (id-anchored regex, same pattern family `buildTable` already uses).
   - **Fail loud** if the node is missing, `buildTable` returns `null`, or the id-anchored block
     isn't found in `result` — never silently keep the source table.
3. OC-B's registration + `buildElement` `case 'table'` null-skip stay **unchanged**; only the
   container's emitted bytes for kept tables change (source → translated).

Why A over alternatives: reuses the proven `buildTable` translation path, keeps OC-B's ordering,
restores byte-parity with pre-OC-B standalone output, minimal surface. (B: placeholder+expand — heavier,
overlaps F4's inline-table machinery. C: narrow OC-B — reintroduces the order bug it fixed.)

## Gate — Approach A: producer-side fail-loud cell-translation assertion

New `assertTableCellsTranslated(output, structure, getSeg, moduleId)`, called in `buildCnxml`
immediately after assembly (beside `assertNoMarkerResidue`, line ~1849).

For every `table` node in the structure, collect each cell's translation string(s):
- Single-segment cell → `tr = getSeg(cell.segmentId)`.
- Multi-`para` cell → one `tr` per `cell.paras[].segmentId` (`getSeg(paraInfo.segmentId)`).
- A `tr` is **checkable** only if it is non-empty after trimming (empty/missing translation → skip).
- Assert each checkable `tr` is present within that table's serialized block in `output` — scope the
  search to the `<table … id="${table.id}" …>…</table>` block so a match can't leak across tables.
- On failure, throw with module id + table id + cell index + the missing `tr` — fail loud.

The check is **source-independent** (it never needs the English cell text): it only asserts that a
translation *that exists* actually landed. Cells with no translation (chemical formulae `CCl₄`,
physical constants, the 15 hand-verified false-positive-residue cells) have empty/absent `getSeg`
and are skipped by construction — so the gate needs no allowlist and can't false-positive on
genuinely-English cells. A formula cell whose `getSeg` returns the formula unchanged still passes
trivially (that text is in the output). This is the gate that would have caught OC-B directly: a table
bypassing `buildTable` shows every checkable cell missing its `tr`.

## Testing

- **Unit (fix):** extend `cnxml-inject-container-table-order.test.js` (OC-B's own suite) — a table
  nested in an example/exercise/note with translated `<entry>` cells must emit the **translations**
  (assert IS text present, English source absent) AND stay in OC-B's in-place position (order
  unchanged). One case per container type (example/exercise/note).
- **Unit (gate):** `assertTableCellsTranslated` throws when a table's translatable cell carries source
  text; passes when translated; does **not** throw for a formula/empty-translation cell (no false
  positive).
- **Regression (real module):** m68710 re-inject → `<entry>` headers `Hvarfefni`/`Myndefni`/`Hleðsla`
  present, `Reactants`/`charge` absent; decimals comma-form. Guard against the exact bytes the bisect
  flagged.
- **Golden:** `UPDATE_GOLDEN=1` will be needed for m68710/m68789 **after** the fix — but only once the
  diff is confirmed to be *just* the IS restoration (+ the already-verified WS4 relabels). Regenerate
  in the fix PR, review the diff.
- **Full suite:** `npm test` from repo root green (the byte-golden that caught this must pass on the
  fixed output).

## Verification / rollout

- After the fix + gate land and `npm test` is green, **resume WS5 from Phase 1** (its own runbook):
  re-inject → the new gate + fidelity check must pass → re-render → regenerate
  `render-fidelity-baseline.json` **from the fixed render** → re-do the F3 fidelity-allowlist
  re-triage (the Phase-2 emphasis reconciliations from the halted attempt are table-independent and
  should re-apply, re-verify).
- Cross-book note: OC-B affects all books; the gate is book-agnostic. This PR only re-verifies
  efnafraedi-2e (the published book); other books get the gate for free at their next inject.

## Out of scope / follow-ups (log to register)

- Row0 2-vs-3-cell extraction shape for `fs-idp8525760` (pre-existing; not a translation bug).
- Whether any *other* container-nested block type (beyond tables) silently emits source — worth a
  sweep, but not this PR.
