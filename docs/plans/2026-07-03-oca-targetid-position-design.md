# Design — OC-A/OC-C: fix the `target-id` collision in the extract position-sort + `extractIdSequence`

**Date:** 2026-07-03. **Status:** design — awaiting lead review.
**Type:** extraction correctness fix (element document-order) + fidelity-check id-sequence hardening.
**Scope:** the `id="X"` / `target-id="X"` substring collision, fixed at every structural id-read in
`cnxml-extract.js` and `cnxml-fidelity-check.js`. **No** committed `02-structure`/`02-for-mt`
regeneration (armed for WS5; verified fresh in-memory).

Part of the chemistry clean-slate oracle-hardening gate
(`docs/plans/2026-07-01-chemistry-clean-slate-design.md`), gate item 2. The order-cause
characterization (PR #224, `docs/audit/2026-07-03-fresh-order-cause-breakdown.md`) root-caused the
dominant residual element reorders to this collision (finds **OC-A**, **OC-C** in the register
`docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md`).

## The bug

Several places resolve an element's document position (for an order-preserving sort) or extract the
id sequence via a bare `id="X"` text match. Because `id="X"` is a **substring** of `target-id="X"`
— the CNXML cross-reference attribute (`<link target-id="X"/>`), ubiquitous in real content — a
match can lock onto an *earlier reference* instead of the element's *definition*:

- **OC-A** — `cnxml-extract.js` position lookups: `content.indexOf('id="' + id + '"')`. An element
  cross-referenced by an earlier `<link target-id="X"/>` gets the reference's (earlier) offset →
  sorts too early → the element (figure/equation/media/note/…) is hoisted out of document order.
  This lives inside F1's own interleave-sort. Confirmed on m68710/m68674/m68795/m68830; it also
  produces the `para`/`equation` collateral in the characterization table.
- **OC-C** — `cnxml-fidelity-check.js:89` `extractIdSequence` uses `/\bid="([^"]+)"/g`. `\b` treats
  `-` as a word boundary, so it matches inside `target-id="…"` — a cross-document `target-id`
  (m68710 `CNX_Chem_04_00_Rocket`, no local element) is picked up as a phantom id in the sequence,
  surfacing as an UNRESOLVED moved id and muddying the order comparison.

Both are the **same collision class** as the bug caught in `classifyMovedIds` during PR #224, fixed
there with a `(?<![\w-])` negative-lookbehind.

## The fix — one collision-safe primitive, applied at every structural id-read

The invariant: a structural `id="X"` read must match the element **defining** `id="X"`, never the
tail of `target-id="X"` (or any `*-id="X"`). The mechanism is the negative-lookbehind `(?<![\w-])`
immediately before `id="`.

### OC-A — `elementIdPosition` helper + call-site sweep (`cnxml-extract.js`)

New exported helper:
```js
/**
 * Document offset of the element DEFINING id="<id>" (never a target-id="<id>"
 * reference). Returns the index of the opening `<tag … id="<id>">`, or -1.
 */
export function elementIdPosition(content, id) {
  const re = new RegExp(`<[\\w:-]+\\b[^>]*(?<![\\w-])id="${escapeRegExp(id)}"`);
  const m = content.match(re);
  return m ? m.index : -1;
}
```
Replace the id-based `content.indexOf('id="' + id + '"')` at every vulnerable site with
`elementIdPosition(content, id)`, preserving each site's existing shape:
- **Always-id sites** (module-level `:520`, `processSection` `:708`): call the helper directly, keep
  the `position !== -1 ? position : 0` fallback.
- **`fullMatch`-first sites** (figure `:805`, table `:816`, example `:827`, exercise `:838`, note
  `:851`, list `:889`, media `:896`, para `:798`, equation `:878`): keep `element.fullMatch ?
  content.indexOf(element.fullMatch) : …` (fullMatch is already collision-safe — it's the whole
  element string) and harden only the id-based fallback branch to `elementIdPosition(content, id)`.

Sites that use `fullMatch` exclusively (`:512`, `:690`, `:856`, `:863`) are **not** touched — no id
substring match, no collision.

### OC-C — harden `extractIdSequence` (`cnxml-fidelity-check.js:89`)

```js
const re = /(?<![\w-])id="([^"]+)"/g;   // was /\bid="([^"]+)"/g
```
So `target-id` references stop counting as element ids in the document-order sequence that
`compareElementOrder` consumes. (The paired `classifyMovedIds` already has this guard; this aligns
the *sequence extractor* with the *classifier*.)

## Data flow

Source CNXML → (extract) element structures sorted by `elementIdPosition` → structure.json order.
Source & fresh CNXML → (fidelity-check) `extractIdSequence` → `compareElementOrder` → moved ids.
Both now read the element **definition** position/id, not a `target-id` reference.

## Components & isolation

| Unit | Purpose | Depends on |
|---|---|---|
| `elementIdPosition(content, id)` (new, exported, `cnxml-extract.js`) | collision-safe element-definition offset | `escapeRegExp` |
| extract call-site sweep (~11 sites) | use the helper for id-based position | `elementIdPosition` |
| `extractIdSequence` regex (`cnxml-fidelity-check.js`) | element-definition ids in order, skipping `target-id` | — |

`elementIdPosition` is the one piece with real logic → exported and unit-tested in isolation. An
`escapeRegExp` helper already exists in `analyze-order-causes.js`; add the same small helper local to
`cnxml-extract.js` (ids are `fs-idm…`/`CNX_…`/`term-…` — no regex metachars in practice, but escape
defensively, matching the classifier).

## Testing

- **Unit — `elementIdPosition`**: (a) returns the `<figure id="X">` definition offset, NOT an earlier
  `<link target-id="X"/>` offset; (b) returns -1 for an id with no local element (a ref-only
  cross-doc `target-id`); (c) plain case (id defined, never referenced) returns its offset; (d)
  substring safety (`id="p1"` doesn't match `id="p10"`).
- **Unit — `extractIdSequence`**: a source with `<link target-id="X"/>` before `<figure id="X">`
  yields `['X']` once (the definition), NOT a phantom entry from the reference; a bare id sequence is
  unchanged.
- **Integration (the real proof) — re-run the diagnostic**: `node tools/analyze-order-causes.js
  --book efnafraedi-2e` after the fix. Assert the residual-module count **drops** from the pre-fix
  baseline (**89 clean / 60 residual** on `main` at design time), the clean count **rises**, and that
  the four confirmed OC-A modules (m68710/m68674/m68795/m68830) are cleaner (fewer moved ids; ideally
  clean). **No previously-clean module may regress to dirty** — the helper returns the *correct*
  (definition) position, which equals the old `indexOf` result whenever there was no earlier
  `target-id` reference, so the change can only correct order, never worsen it; a clean-count drop
  would signal a real regression to investigate. Record the new numbers. The remaining residual is
  expected to be OC-B (direct-child container tables, not fixed here) + the needs-deeper-look tail.
  This is a **measurement**, not a committed-artifact change.
- **No committed `02-`/`03-`/`05-` regeneration**; `npm test` + `npm run validate` green from repo root.

## Definition of done

- `elementIdPosition` exists, is unit-tested (incl. the target-id and ref-only cases), and replaces
  every id-based `indexOf('id="X"')` in `cnxml-extract.js`; `fullMatch`-only sites untouched.
- `extractIdSequence` no longer counts `target-id` references; unit-tested.
- Re-running `analyze-order-causes` shows a measured residual **drop** vs the 60 baseline, with the
  four OC-A modules improved — numbers recorded in the PR / a short note.
- No committed `books/` bytes changed; `npm test` + `npm run validate` green from repo root.

## Explicitly out of scope

- **OC-B** (direct-child container-table mispositioning) — its own item.
- The **id-order gate flip** to hard-fail — comes after OC-A + OC-B, once the residual is re-triaged.
- Re-extract / re-inject / re-render (WS5). This fix is *armed* for it.
- The needs-deeper-look tail (`list`/`solution`/`example`/`footnote`) — re-triaged after this lands.

## Workflow

brainstorming → writing-plans → subagent-driven-development; one PR off `main`; TDD for
`elementIdPosition` + `extractIdSequence`; the diagnostic re-run is the integration proof;
`npm test` from repo root is the gate. Log out-of-scope finds to the register.
