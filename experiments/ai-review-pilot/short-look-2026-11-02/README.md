# Short look, 2026-11-02

The pre-release check the 2026-10-28 record sets in its decision 4
(`docs/decisions/2026-10-28-ai-term-pass-as-editor-suggestions.md`): 20 accepted operations per
category from the full run's layer 2 (ch10 is not in it), judged blind by [USER]. A category is
dropped at any "wrong, meaning changed", or at 2 or more wrong. No second stage; after release, the
editors' accept and reject rates measure precision.

Cost: USD 0. No API call; [USER]'s time only. Everything here was produced locally from `main` at
`4868c83d6` (layer 2 merged, #611).

## Files

| File | What it is |
|---|---|
| `draw.mjs` | The sampler and item builder. It ran from an off-repo working folder; its two absolute paths name the checkout it read. Committed as it ran. |
| `sample.json` | The key: the category, op and segment of each item id. Kept from [USER] until all 60 verdicts were saved. |
| `items.json` | The 60 blind items. |
| `build-page.mjs`, `page.html` | The review page built from `items.json`, published as a private artifact. |
| `answers/verdicts/i01..i60.json` | [USER]'s saved verdicts and notes, read from the page's store. |
| `unblind.mjs`, `unblinded.json` | Joins the verdicts to the key and applies the drop rule. Run from this folder; it reproduces `unblinded.json` byte for byte. |
| `drop-set.mjs`, `drop-set.json` | The changes the drop removes, with the replay check (below). Usage: `node drop-set.mjs <repo> <out.json>`. |

## Method

- **Sample.** The seed `short-look-2026-11-02` was fixed before the first draw. Within each
  category, the sample takes one item per segment type present, then fills the remaining slots in
  proportion to each type's count (largest remainder). Within a type, items are ranked by
  sha256(seed|opId). This over-weights rare types on purpose: the look is a screen for a bad
  category, not an unbiased estimate of its error rate.
- **Blinding** ([USER]'s choice): the page hid the category, the ruling, the model's reason, the
  chapter and the module, and shuffled the items across categories. Spread ([USER]'s choice): one
  per type, the rest pro rata.
- **Claude's calls,** stated on the page:
  - the four verdicts (right · wrong, meaning kept · wrong, meaning changed · can't judge), since
    the 10-28 record defines neither "wrong" nor "meaning-changing";
  - an agreement item is "right when it follows that change correctly, even if you would reject
    the other change";
  - long segments windowed ±300 characters around the change, with a whole-segment button.
- **An unsaved item counts as open, never as accepted.** All 60 were saved, and the look was marked
  complete at 12:03:53Z.

## Result

| Category | Right | Wrong, meaning kept | Wrong, meaning changed | By the rule |
|---|---|---|---|---|
| term | 20 | 0 | 0 | passes |
| term-sense | 19 | 1 (i24) | 0 | passes |
| agreement | 17 | 2 (i19, i37) | 1 (i58) | dropped |

- **i37 and i58 come from one request** (ch02/m68692/002, ruling `abundance`). The term change
  gnægð → fjöldahlutfall kept the MT's adjective hlutfallsleg-, and the agreement change inflected
  it correctly. In i19 too, the inflection matches [USER]'s own wording (hækkað and aukið are both
  neuter).
- **[USER]'s rulings (2026-11-02):** (1) the three agreement verdicts stand; (2) agreement is
  dropped together with the term changes it follows, so that no editor is shown a term change with
  a broken ending.

## The drop set (`drop-set.json`)

Every agreement change fixes an ending broken by an earlier change in its segment, and records the
ruling it agrees with (`rulingId`). All 105 do; none is unlinked.

**The unit dropped is the apply gate's own.** A ruling's operations in one segment, over all its
occurrences, stand or fall together (`tools/ai-review/term-pass-apply.js`, `gateWithGroups`,
"all or nothing per ruling"; `GROUP_INCOMPLETE`). Layer 2 never holds part of a ruling's group.
So for each (segment, ruling) that holds an agreement change, every change under that ruling in
that segment is dropped, never one term change out of the group.

| | Changes |
|---|---|
| Layer 2, all chapters | 3,032 (2,791 term, 136 term-sense, 105 agreement) in 2,063 segment occurrences |
| Groups dropped | 94, in 91 segments |
| Dropped | 253: 105 agreement, 140 term, 8 term-sense |
| Kept | 2,779: 2,651 term, 128 term-sense |
| Share of term-type changes dropped | 148 of 2,927 = 5.1% |

- **Replay check.** With the dropped changes removed, every kept change in the 91 affected segments
  was applied in order to the segment's text under the apply tool's own rule (its `find` occurs
  exactly once; `chainChanges`). All apply.
- **In the sample,** the drop set holds all 20 agreement items and 2 of the 40 term-type items (i38
  term and i50 term-sense, both judged right).
- **A correction.** The first report to [USER] said the drop would take 91 term changes (3%). That
  count used each agreement change's nearest earlier term-type change, which attaches 14 segments'
  agreement to a change under another ruling (for example ch17/m68827/004, where `hverri → hverju`
  follows `afurð → myndefni`, not the electrolytic-cell change between them). Linking by ruling
  gives 94 (one per group); the gate's unit gives 148. Both narrower counts are kept in
  `drop-set.json` under `narrowerLinks`.
- **Layer 2 is unchanged.** `02-mt-revised/` and `ai-review/` are tool-written data and are never
  regenerated. The drop is a filter where suggestions are read.

## [USER]'s notes, as candidates (no ruling made)

- **i12:** "transition metals" should be hliðarmálmar, not hliðarfrumefni. No ruling exists for it.
  The four transition-series rulings already use hliðarmálm-.
- **i29:** the change is right, but the segment still has frumeind where `atom → atóm` is ruled.
  The pass missed it. The look measures the precision of the changes made, not what was missed.
- **i37, i58:** the `abundance` ruling swaps the noun and keeps the adjective. "Natural abundance"
  → náttúrulegt fjöldahlutfall may need its own ruling.
- **i10, i19, i24:** wording, at the editors' level.
