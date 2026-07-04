# Order-gate residual tail (4 modules) — triage findings

**Date:** 2026-07-04
**Context:** Chemistry clean-slate, oracle-hardening gate item 2 (id-order hard-fail).
After OC-A (#225) + OC-B (#226), `analyze-order-causes.js --book efnafraedi-2e`
reports **145 clean / 4 residual / 0 build failures**. This note root-causes the 4
residual modules so the id-order check can be flipped warn-only → hard-fail.

## The 4 residual modules

| Module | ch | moved (raw) | cause buckets |
|--------|----|-----|--------------|
| m68739 | 07 | 13 | equation:4, media:6, list:3 |
| m68793 | 12 | 3  | equation:1, para:2 |
| m68832 | 18 | 4  | equation:3, term:1 |
| m68852 | 21 | 7  | equation:3, term:4 |

Raw `moved` **over-counts**: `compareElementOrder` flags the first index where the
two id-sequences diverge and every id after it until they re-sync, so one displaced
element cascades. The bucket labels (`term`/`para`/`media`/`list`) are mostly
**cascade riders**, not independent causes.

## Root cause — ONE cause, shared by all four

**Block-level children nested inside `<list><item>` (a block `<equation>`, `<media>`,
or a nested `<list>` beyond the first) are lifted out of the item to top-level
`structure.content` during extraction, losing their in-item document position.**
`buildList` only re-emits nested `list` children (`cnxml-inject.js:3189-3193`); the
lifted `equation`/`media` blocks are re-emitted as standalone top-level elements,
landing **after** the whole list instead of inside their item.

### Confirming trace — m68793 (minimal case)

Source: an enumerated `<list>` whose **item 1 is multi-child** — a `<para>` followed
by a block `<equation>`:

```
<list id="fs-idm90348816">
  <item><para id="fs-idm136564352">The rate of a reaction is proportional…:</para>
        <equation id="fs-idm98497056">…</equation></item>   ← multi-child item 1
  <item><para id="fs-idm124479808">…</para></item>          ← item 2
  <item><para id="fs-idm122867808">…</para></item>          ← item 3
</list>
```

Fresh inject output:

```
<list id="fs-idm90348816">
  <item>The rate of a reaction is proportional…: </item>    ← item 1: text kept, <para> wrapper + equation stripped
  <item><para id="fs-idm124479808">…</para></item>
  <item><para id="fs-idm122867808">…</para></item>
</list>
<equation id="fs-idm98497056">…</equation>                  ← item 1's equation, hoisted after the list
```

- Extract records item 1 with only a `segmentId` (no `wrapsPara`, no `children`),
  while items 2/3 get `wrapsPara`. The block equation is recorded separately as a
  **top-level** `structure.content` node positioned right after the `list` node
  (verified: content order is `… list fs-idm90348816, equation fs-idm98497056, …`).
- The item-1 segment text carries `[[MATH:N]]`, but the `blockEquationIds` guard
  (`cnxml-inject.js:1105`) suppresses it inside the item (correct — avoids a
  duplicate), so the equation only appears via the top-level node → after the list.

### m68832 / m68852 — same, with inline `<term>` riders

Both are `<list>`s whose items mix inline text + `<term>` + a block `<equation>`.
Fresh output emits all inline content (incl. the item-tail `<term>`s) first, then all
the hoisted block equations → the `term:N` buckets are cascade artifacts of the same
equation lift.

### m68739 — same, deeper nesting

`list fs-idm8107808 > item > list fs-idp47568320 > item > (equation|media|nested list)`.
All the deep block children are lifted to top-level `structure.content` (dump shows
them as siblings after `list fs-idm8107808`). The `media`/`list` buckets are the same
lift, not a distinct cause.

## Secondary fidelity loss (order-invisible)

In m68793 the multi-child item 1 also **loses its `<para id="fs-idm136564352">`
wrapper** — the item is emitted as bare text. This is add/drop (the para id is only
in source), so the order check ignores it, but it is a real round-trip loss. A correct
fix should restore `<item><para id="…">text</para><equation …/></item>`, not just
re-order the equation. (Same class as the multi-child item handling.)

## Decisions (advisor-confirmed)

- **Fix, not allowlist.** An equation rendering after the list when it belongs to a
  specific item is reader-visible semantic corruption, not cosmetic. A fix clears all
  4 with little/no allowlist, matching the gate's "little/no allowlist" goal.
- **Not a candidate-D trigger.** Keeping a block child in place within `<item>` is the
  same move OC-B did for container tables and the figures-in-containers fix did for
  figures — extending an existing builder, not "a new per-container builder." Do not
  reopen the migration question.
- **Changes no committed bytes.** Like OC-A/OC-B, the fix corrects fresh inject +
  arms the gate; WS5 re-inject/re-render delivers it.

## Fix center of gravity

The wrong position **originates in extraction** (block children lifted out of the item
to top-level content), so the primary fix is likely in `cnxml-extract.js` list-item
handling (keep block children as item `children`, preserving order + the item's
`<para>` wrapper), with `buildList` extended to emit `equation`/`media` item children
in place (it already recurses nested `list`). Pin with a failing test in the
`cnxml-dom-comparison` / m68789-baseline style before touching builders.

## Reproduce

```
node tools/analyze-order-causes.js --book efnafraedi-2e            # 145/4/0
node tools/analyze-order-causes.js --book efnafraedi-2e --module m68793 --chapter 12
```
