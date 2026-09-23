# Decision: the bond terms take the singular `tengi-` — `bond angle → tengihorn`, `bond length → tengilengd`

- **Date:** 2026-09-23
- **Status:** Accepted
- **Context owners:** [USER]
- **Supersedes:** the `bond angle` / `bond length` rows of `docs/decisions/2026-09-23-organic-ch01-term-rulings.md` (Q2) — every other ruling in that record stands
- **Related:** `server/lib/houseStyleTerms.js` + `server/__tests__/houseStyleTerms2026-09-23.test.js` · the active register `docs/plans/2026-07-21-post-item17-followup-campaign.md` (2026-09-23 afternoon ⏩ RESUME)

> **FROZEN EVIDENCE — banner-dated 2026-09-23.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

Earlier the same day [USER] ruled the plural genitive for the bond terms (`tengjahorn`, `tengjalengd`). Those forms appear **zero** times in any committed MT, while the model writes the singular — `tengihorn-` 34 times across 34 aligned chemistry segments (`tengishorn` 6), `tengilengd-` in 11 of 15 (`tengisfjarlægð` 2). Should the rows force the plural, or pin the singular the books already use?

## Decision

[USER], 2026-09-23: *"Change tengja- back to tengi- to maintain consistency. If a general ruling later reverts that, I'll make the change in editing."* The rows are **`bond angle → tengihorn`** and **`bond length → tengilengd`**.

## Reasoning

### Consistency across what is already bought
Chemistry's 23 units are bought and prepared with the singular. A plural row would have made every one of those occurrences a flagged inconsistency in editor QA and split the two books' usage. The singular row instead pins the model's own majority form and removes only its minority spellings (`tengishorn`, `tengisfjarlægð`).

### It turns an untested override into a tested pin
A form the model never produces carries a compliance risk: an entry is obeyed on some occurrences and not others, so the plural would likely have mixed with the singular inside ch01 itself. The singular is what the model already writes, so the row reinforces rather than fights it.

## Consequences

- ch01's `--glossary-only` subset is unchanged in its heads; only the Icelandic behind two of them changes.
- Chemistry's bought chapters already agree with the rows; editor QA flags only the minority spellings.
- **Reversal is an editing task, by [USER]'s own terms:** should a general ruling later choose the plural, the change is made in editing rather than by re-buying.

## Alternatives considered

1. **Keep the plural `tengja-`** (the morning's ruling) — reverted by [USER] for consistency with everything already bought.
