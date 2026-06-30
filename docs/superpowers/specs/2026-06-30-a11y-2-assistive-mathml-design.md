# Design — a11y-2: assistive MathML for screen readers

**Date:** 2026-06-30
**Backlog item:** a11y-2 (🟠 High) in `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` § Consolidated Backlog.
**Origin/diagnosis:** `docs/plans/2026-06-25-accessibility-alt-math-handoff.md` Item 2.
**Approach chosen:** A — self-contained, inline-styled hidden MathML sibling (lead-approved 2026-06-30).
**Status:** design approved; ready for implementation plan.

## Problem

Rendered math on namsbokasafn.is is MathJax **SVG** with `role="img" focusable="false"` and
**no accessible name** — no `aria-label`, no `<title>`, no assistive MathML (verified in the
handoff: 0 `mjx-assistive-mml`, 0 `<math>` in published output). Screen readers (VoiceOver,
NVDA, JAWS, Orca) announce nothing for any equation. This affects **all currently-published
content** (chemistry is live) and is independent of any book onboarding.

## Goal

Give every rendered expression — **block and inline** — a screen-reader-navigable accessible
representation, without changing its visual appearance and **without** a cross-repo (vefur) CSS
dependency.

## Non-goals (out of scope — logged, not done)

- **Figure alt-text translation** (a11y-1): a separate, larger pipeline + ISK-costing MT +
  review effort, gated on a lead decision. Not part of this item.
- **Interactive expression explorer / SRE speech text** (`a11y/explorer`, `a11y/speech`):
  heavier extensions; not required for an accessible name.
- **Any vefur CSS:** Approach A is self-contained, so the previously-noted `[VEFUR]`
  assistive-MathML hiding rule is **withdrawn, not deferred** (record this in the plan's
  out-of-scope register per `feedback-log-out-of-scope-issues`).

## Why Approach A (not the MathJax `a11y/assistive-mml` extension)

MathJax's assistive-MathML extension is built for a **live browser document**, where MathJax
also injects a global stylesheet that visually hides the `mjx-assistive-mml` element. Our
pipeline pre-renders to **self-contained static strings** on the server via `doc.convert()` +
`adaptor.outerHTML(node)` — that stylesheet never travels with the output. Using the extension
would therefore require re-supplying the hiding CSS in the **consuming repo (vefur)**, creating
a hard, **fail-unsafe** coupling: ship the render change before vefur's CSS lands and every
*sighted* reader sees raw duplicated MathML.

Approach A instead emits the hidden MathML with an **inline** visually-hidden style, so the
output is correct on its own:
- One repo, one PR, one uniform code path (no `displayMode` branching for a11y).
- **Fail-safe:** if vefur never adds any rule, sighted readers still see only the SVG and AT
  still reads the MathML. There is no emit-without-hide failure mode.
- Exploits a fact we already have: the renderer's **input is MathML**, so the accessible
  representation is free to emit — we are not generating anything, just declining to discard it.

This matches the lead's robustness-over-expedience directive (`feedback-robustness-over-expedience`):
one real code path, fail loud/soft in the safe direction, no escape hatch that can reach prod.

## Architecture — single change point

All accessibility logic lives in **`tools/lib/mathjax-render.js` → `renderMathML(mml, displayMode)`**.

All four production call sites already funnel through this function, so no call-site edits and no
per-site branching are needed:

| Call site | Mode | Downstream wrapper |
|---|---|---|
| `tools/cnxml-render.js:1929` | block (`true`) | `<div class="equation">` (after a render-failure check) |
| `tools/cnxml-render.js:2417` | block (`true`) | joined into `renderedMath` parts |
| `tools/lib/cnxml-elements.js:416` | block (`true`) | `<span class="mathjax-display" data-latex>` |
| `tools/lib/cnxml-elements.js:682` | inline (`false`) | `<span class="math-inline" data-latex>` |

`renderLatex` is archived-only (per its header comment) and is **left untouched**.

## Output shape

`doc.convert()` already returns an `<mjx-container …><svg…></svg></mjx-container>` root.
Per expression, the new returned string is:

```html
<mjx-container … aria-hidden="true"><svg …></svg></mjx-container><math xmlns="http://www.w3.org/1998/Math/MathML" style="<visually-hidden>">…source MathML…</math>
```

- **`aria-hidden="true"`** is added to the visual SVG subtree (the `mjx-container` root) so AT
  does not announce a nameless "image".
- The **accessible representation** is the source MathML we already hold inside `renderMathML`
  (`cleanMml`, the `m:`-prefix-stripped input), emitted as a sibling `<math>` carrying an
  **inline** visually-hidden style (the `position:absolute; clip…` / `sr-only` technique).
  Inline style ⇒ self-contained ⇒ no vefur dependency.
- Exact attribute placement (e.g. `aria-hidden` on `mjx-container` vs inner `svg`) and the exact
  visually-hidden style string are settled during TDD; the contract is: visual subtree hidden
  from AT, MathML present and visually hidden, both for block and inline.

## Error handling

- The existing render-failure heuristic at `cnxml-render.js:1929` scans the returned string for
  `merror` / `data-mjx-error`. The appended `<math>` is the **source** MathML, which contains
  those tokens only if the input genuinely errored — so the heuristic stays valid (no false
  negatives introduced).
- If `cleanMml` is empty or not a parseable `<math>…</math>`, **emit SVG only** (no broken empty
  `<math>` sibling). Degrade, don't crash: the a11y sibling fails soft; the visual output never
  fails because of this feature.

## Testing (TDD — write first, watch fail against current output)

Unit tests for `renderMathML` (new `tools/lib/__tests__/mathjax-render.test.js` and/or the math
assertions in `cnxml-render.test.js`):

1. Output contains exactly **one** `<math>` sibling per expression.
2. The SVG/visual subtree is **`aria-hidden="true"`**.
3. The hidden `<math>` carries the **visually-hidden inline style**.
4. Both **inline (`display=false`)** and **block (`display=true`)** get the sibling.
5. **Malformed/empty MathML → SVG-only**, no empty `<math>` emitted.

## This is a behavior-changing render PR — expected diffs

- **C0 golden-HTML baseline changes by design.** Regenerating it *is* the evidence; review the
  diff to confirm it is **only** the added `aria-hidden` + `<math>` sibling and that nothing else
  moved.
- **A3 render-fidelity check is expected unaffected** — its cross-stage invariant counts
  `m:math`→`mjx-container` (still 1:1; the new `<math>` is not an `mjx-container`) and its shape
  histogram does not track `math`. Confirm empirically when running the suite.
- **Scope is code + tests only** (lead decision 2026-06-30). No re-render/sync in this PR; the
  delivery re-render rides the **pending stale-render re-render+sync PR**. Note there the known
  MathJax `MJX-NN` id renumbering across re-rendered files (cosmetically noisy diffs even where
  visuals are unchanged — see `objectives-page-data-pending`).

## Acceptance

- `renderMathML` output, for block and inline, contains a visually-hidden source-MathML sibling
  and an `aria-hidden` visual subtree; malformed input degrades to SVG-only.
- New unit tests green; full `npm test` green (local gate is authoritative — CI credits out
  until ~Jul 1).
- Golden baseline regenerated, diff reviewed to be additive-only.
- No vefur change required or produced.

## Files

- `tools/lib/mathjax-render.js` — the change.
- `tools/lib/__tests__/mathjax-render.test.js` (new) and/or `cnxml-render.test.js` math assertions.
- C0 golden baseline fixture(s) — regenerated.
- `docs/plans/2026-06-28-pipeline-architecture-implementation-plan.md` — mark a11y-2 done; withdraw
  the `[VEFUR]` assistive-MathML CSS note; log any out-of-scope finds.
