# OC-E — block children inside `<list><item>` — design

**Date:** 2026-07-04
**Branch:** `fix/chem-oce-list-item-block-children`
**Context:** Chemistry clean-slate, oracle-hardening gate item 2 (id-order hard-fail).
This is the last residual cause after OC-A (#225) + OC-B (#226) took the
element-reorder residual from 60 → 4 modules. Triage:
[`docs/audit/2026-07-04-order-tail-triage-list-item-block-children.md`](../audit/2026-07-04-order-tail-triage-list-item-block-children.md).

## Problem

Four modules still reorder under `analyze-order-causes.js` — m68739 (ch07),
m68793 (ch12), m68832 (ch18), m68852 (ch21). All four share **one** cause.

A block-level child nested inside `<list><item>` — a block `<equation>`, a block
`<media>`, or a nested `<list>` beyond the first — is hoisted out of the item to
top-level (or section-level) `structure.content` during extraction, losing its
in-item document position. At inject it is re-emitted as a standalone element
**after** the whole list instead of inside its item.

### Mechanism (verified against fresh in-memory `extractSegments`, not the stale committed `02-structure`)

`cnxml-extract.js` `processSection`/module extraction strips list content before
top-level **para** extraction (lines 802–807) precisely so paras inside list items
aren't double-extracted. But:

- **equation** extraction (`cnxml-extract.js:810`) reads `contentForSimpleElements`,
  which has containers stripped but **not** lists → list-nested block equations are
  hoisted to content.
- **media** extraction (`cnxml-extract.js:795`) reads the same → list-nested block
  media hoisted.

At inject, `collectBlockEquationIds` (`cnxml-inject.js:1468`) walks `structure.content`
(recursing sections/notes, **not** list items) and adds each `type:'equation'` id to
`blockEquationIds`. `reverseInlineMarkup` (via `getSeg`, line 1566) then suppresses the
in-item `[[MATH:N]]` placeholder (line 1105) because the id is a "block equation" →
the equation renders **only** at the hoisted top-level position. Media has no
suppression; the hoisted standalone copy plus `deduplicateMedia` leave one copy at the
wrong (post-list) position.

The asymmetry: a **single-child** item (`<para>` only) matches the `paraWrapMatch`
regex (`cnxml-extract.js:1557`) → becomes `wrapsPara`, correct. A **multi-child** item
(`<para>` + `<equation>`) fails that regex → loses the `<para>` wrapper *and* its
equation gets hoisted.

Confirmed on m68793: item-1 = `<para id=fs-idm136564352>…</para><equation id=fs-idm98497056>…</equation>`.
Fresh extract yields item-1 with `segmentId` only (no `wrapsPara`, no `children`), and
`equation fs-idm98497056` as a top-level node directly after `list fs-idm90348816`. The
item segment text is `"The rate…collisions: [[MATH:1]]"` — the equation is referenced
inline by placeholder, but suppressed at render.

## Constraints (locked — do not reopen)

- **Segment-preserving / no committed bytes / no re-MT now.** Locked by OC-A/OC-B
  precedent and F1's no-regen decision. WS5 re-inject runs against the **existing**
  `02-mt-output`. Any change to an item's segment text (e.g. `"…: [[MATH:1]]"`) forces
  a re-extract + re-MT and is therefore out of scope. The fix corrects fresh inject and
  arms the gate; WS5 re-inject/re-render delivers it to readers.
- **Fix, not allowlist** (advisor + triage): an equation rendering after the list when
  it belongs to a specific item is reader-visible semantic corruption, not cosmetic.
- **Not a candidate-D trigger.** Keeping a block child in place within `<item>` extends
  an existing builder (same move as OC-B container tables / figures-in-containers). Do
  not reopen the rewrite question.

## Design — two layers

### Layer 1 — order fix (required; clears the gate)

**Extraction:** stop hoisting list-nested block equation/media to `content`. Extract
equations (line 810) and standalone media (line 795) from list-stripped content, mirroring
the existing para treatment (802–807). Apply at **every** site that extracts
equation/media from content that may contain lists (section-level `processSection`, and
the module-level equivalent near lines 592/810 — enumerate during implementation).

**Inject:** no change needed for order. Once the equation is no longer a top-level
content node, `collectBlockEquationIds` won't see it → the in-item `[[MATH:N]]`
placeholder is no longer suppressed → it renders inline inside the item, in the correct
position. Media renders via its in-item `[[MEDIA:N]]` placeholder and no longer has a
hoisted duplicate. Nested lists already render via `buildList` recursion
(`cnxml-inject.js:3189–3193`).

**Result:** all four modules → 0 reordered ids under `analyze-order-causes.js`.

### Layer 2 — `<para>` wrapper fidelity (attempt inject-side; fall back + log)

The multi-child item also loses its leading `<para id>` wrapper, and its equation nests
directly inside `<item>` rather than as a `<para>` sibling. This is **order-invisible**
(the gate passes without it) but a real round-trip loss. Per lead decision, restore it
**only if achievable inject-side with zero segment-text change**; otherwise fall back to
Layer 1 only and log the deferral.

Approach (no segment change; relies on `[[MATH:N]]`/`[[MEDIA:N]]` indices being globally
unique per module):

- **Extraction:** for a multi-child item = a leading `<para>` followed by block
  children, record `wrapsPara` (leading para openTag/id) **and** an ordered
  `blockChildren` array (`{type:'equation'|'media', id}` in document order). Keep the
  single item segment unchanged.
- **Inject:** `collectBlockEquationIds` also collects item `blockChildren` equation ids
  (so the in-item `[[MATH:N]]` is suppressed to `''`); add the analogous suppression for
  `blockChildren` media so the in-item `[[MEDIA:N]]` doesn't duplicate. `buildList`
  emits `<item>${wrapsPara.openTag}${text}</para>` then each `blockChild` in order
  (equation from `equations`, media via `buildMedia`), then any nested-list children,
  then `</item>`.

**Fallback trigger:** if TDD shows the explicit-emit path is fragile (e.g. interleaved
inline vs block placeholders that can't be disambiguated without segment changes), ship
Layer 1 only and log the `<para>`-wrapper loss to the register as a deferred round-trip
fidelity item.

## Safety guard (advisor's key catch — must-have)

`compareElementOrder` compares only the ordering of the **common** id subsequence: an id
present in source but **absent** from translated is dropped from the comparison, not
flagged. So a buggy fix that *drops* an equation/media instead of *relocating* it would
ALSO show 4→0 green while silently losing content — the same class as the F4
silent-table-loss hole.

Mitigations:

1. **Tests assert render-in-place, not just the order count.** Pinned tests assert the
   output CNXML contains the block `<equation …/>`/`<media …/>` **inside** its `<item>`
   (or, Layer-1-only, at the in-item position), not merely that `analyze-order-causes`
   reports 0.
2. **Fail-loud extraction guard.** After stripping list content from the
   equation/media-extraction input, assert every list-nested block equation/media id is
   accounted for — either covered by an in-item placeholder (`[[MATH:N]]`/`[[MEDIA:N]]`
   in an item segment) or recorded as an item `blockChild`. If a list-nested block id
   would be neither hoisted nor in-item-rendered, **throw** (do not silently drop).

## Scope

- **In:** block `<equation>` + block `<media>` inside `<list><item>` (both required —
  m68739 has real media lifts). Nested lists already handled.
- **Out:** the warn→hard-fail gate flip (deferred to post-WS5; the order check reads
  committed `03-translated/`, stale until WS5 re-inject — matches OC-A/OC-B). Any
  regeneration of `02-*`/`03-*`/`05-*` committed bytes. Re-MT (Track B4).

## Verification / DoD

- `node tools/analyze-order-causes.js --book efnafraedi-2e` → **145 → 149 clean, 0 residual, 0 build failures**
  (was 145/4/0).
- "Only corrects, never worsens": clean count rises, no previously-clean module regresses.
- New pinned tests (in `cnxml-dom-comparison` / m68789-baseline style) assert
  render-in-place for at least m68793 (equation) and m68739 (media + deep nesting);
  fail-loud guard has a unit test proving it throws on a synthetic drop.
- `npm test` from repo root green (authoritative gate — no branch protection).
- No committed `01-`/`02-`/`03-`/`05-` bytes changed (`git status` clean of those paths;
  fix is code-only, armed for WS5).

## Test targets

| Module | ch | cause buckets |
|--------|----|--------------|
| m68793 | 12 | equation (minimal multi-child case: para + block equation) |
| m68739 | 07 | equation + media + deep nested list |
| m68832 | 18 | equation + inline `<term>` riders |
| m68852 | 21 | equation + inline `<term>` riders |

## Follow-on (not this PR)

- Gate flip warn→hard-fail (post-WS5, once `03-translated/` regenerated).
- WS5 re-inject/re-render (delivers OC-A/B/E + WS1/WS2 + #216 to readers; must pass the
  `[[TABLE:]]` and marker-residue gates).
