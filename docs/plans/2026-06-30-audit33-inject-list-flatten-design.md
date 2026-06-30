# Audit #33 — inject list-flattening divergence (Design)

**Status:** approved by user 2026-06-30, ready for implementation plan.
**Roadmap item:** audit #33 in [docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md](2026-06-28-pipeline-architecture-implementation-plan.md).
**Guiding directive:** robustness & future-proofing over expedience (`feedback-robustness-over-expedience`) —
one real code path, no copy-paste re-divergence (the #14 lesson).

## Problem (corrected by evidence)

The audit said "`buildExerciseDom`/`buildNoteDom` DELETE nested lists; `buildExampleDom` preserves." The
real divergence is **narrower**: all three DOM builders preserve a list that is a *direct child* of the
container (via `replaceListItemsDom`). They diverge only on a **list nested inside a `<para>` that
extraction flattened** (detected by the para's restored segment text containing `<m:math>`):

- `buildExampleDom` (`cnxml-inject.js:2376-2400`): sets `skipParaText` → injects only the para's title,
  **preserves the list** for the list handler.
- `buildExerciseDom` (`:2621-2633`) and `buildNoteDom` (`:2879-2890`): `siblingEl.parentNode.removeChild`
  → **delete the list**, then inject the flattened para text.

## Blast radius (measured 2026-06-30, `find`-based, both globs cross-checked)

A `<list>` nested inside a `<para>` (the only shape that can trigger the divergence):
**biology 1, physics 11, chemistry 3, organic 1, microbiology 0, astronomy 0.** And the divergence only
fires when that para also carries `<m:math>`. **Biology's single case (m66590/ch29) is non-math**, so the
`removeChild` trigger fires **0× in biology** — #33 does **not** gate biology (contra its
`blocks_next_book` label). It is a genuine latent correctness bug for the books that do hit it (physics
especially) and a builder-consistency hazard. Verified separately: all `<list>` survive inject on the 11
already-injected biology modules (direct-child lists, the common case, are already preserved).

## Design — extract one shared helper, all three builders call it

The divergence is copy-paste drift of the same heuristic — exactly the class #14 fixed. Rather than only
patching exercise/note to match example (which leaves three near-identical copies free to re-diverge),
extract the detection into one helper and route all three through it.

```js
// Returns true iff `child` (a para) has a sibling <list> that extraction flattened
// into the para's segment text (para text has restored <m:math> AND a sibling list
// is a DOM descendant of the para). When true, callers inject only the title and let
// the list handler preserve the list — never removeChild it.
function paraHasFlattenedList(child, paraEl, contentArray, paraText, doc) {
  if (!paraText || !/<m:math/.test(paraText)) return false;
  for (const sibling of contentArray || []) {
    if (sibling !== child && sibling.type === 'list' && sibling.id) {
      const siblingEl = doc.getElementById(sibling.id);
      if (siblingEl && isDescendantOf(siblingEl, paraEl)) return true;
    }
  }
  return false;
}
```

- **`buildExampleDom`** already implements this inline → replace its inline block with a call to the helper.
  Its output must stay **byte-identical** (it is the reference behavior).
- **`buildExerciseDom`** + **`buildNoteDom`**: replace the `removeChild` block with
  `const skip = paraHasFlattenedList(...)` and `replaceParaContentDom(doc, paraEl, skip ? '' : paraText, '')`.
  The existing list branch (`replaceListItemsDom` when the list has no replaced-para descendant) then
  preserves the list — identical to example.

This is a **behavior-changing fix** for exercise/note in the math-gated case (list preserved instead of
dropped) and a **no-op** for example and for every non-math / direct-child case.

## Testing

- **Unit:** `paraHasFlattenedList` returns true only for math-para + DOM-descendant-list; false for
  non-math, for a direct-child list, and for a list not inside the para.
- **Characterization (the fix proof):** a synthetic fixture — an `<exercise>` and a `<note>`, each with a
  `<para>` containing `<m:math>` + a nested `<list>` — asserts the injected output **preserves the list**
  (post-fix), where the pre-fix code dropped it. Add the equivalent `<example>` fixture and assert its
  output is **unchanged** (the helper extraction is a no-op for the reference builder).
- **No-op guards:** an exercise/note with a *direct-child* list, and with a *non-math* para+list, inject
  byte-identically before/after.
- Full `npm test` green (existing inject/example/exercise/note DOM suites are the regression net).

## Scope

**In:** the `paraHasFlattenedList` helper + routing all three builders through it; tests.
**Out:** the broader render-side C-track work; C4 table-DOM; #37 (id-less exercise drop) and the other
low-severity inject findings; the `isApiTranslated` routing/provenance fix (separate, the real biology
gate). #33 does not unblock biology — state that in the PR.

## Acceptance

One `paraHasFlattenedList` helper; `buildExampleDom`/`buildExerciseDom`/`buildNoteDom` all call it;
exercise/note now preserve a flattened-in-para list (characterization proves it); example output
unchanged; `npm test` green.
