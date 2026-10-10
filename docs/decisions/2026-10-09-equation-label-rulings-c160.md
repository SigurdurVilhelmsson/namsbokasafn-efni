# Decision: English phrases inside chemistry equations get [USER]-ruled whole-phrase Icelandic values, with three word families settled for equations

- **Date:** 2026-10-09
- **Status:** Accepted
- **Context owners:** [USER] (every value), [CODE] (census, proposals, application)
- **Supersedes:** none
- **Related:** `docs/plans/2026-07-21-post-item17-followup-campaign.md` (§C160 and the 2026-09-26 block's ② batch) · `docs/decisions/2026-09-21-chemistry-terminology-rulings.md` · `docs/decisions/2026-09-27-chemistry-terms-and-titles-ruling-sheet.md` · `books/efnafraedi-2e/math-label-map.json` · `books/efnafraedi-2e/glossary/equation-text.json`

> **FROZEN EVIDENCE — banner-dated 2026-10-09.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

What Icelandic should readers see for the English phrases written *inside* chemistry equations
(`<m:mtext>` leaves such as `mol solute`, `rate of effusion`, `anode (oxidation):`)? Neither
existing mechanism could translate them. The single-word label map matches whole leaves only,
and the render-time phrase dictionary (`equation-text.json`) translates individual words inside a
longer leaf. Before this decision, 42 of these labels were therefore **half-translated**
(`tími for Ne`, `anode half-hvarf:`), which reads worse than English. What was at stake was every
worked example that carries a labelled calculation.

## Decision

[USER] ruled every one of the 250 labels on a review page (2026-10-09; the answers are saved in
the page's database at https://claude.ai/artifact/2FbttsdJLJ5nQDNUxAuthA). Each value is stored
as an exact whole-leaf key in `math-label-map.json` and applied at inject. Three word families
were settled once for every equation that uses them:

| family | ruled form in equations | the other option |
|---|---|---|
| solute | **leysts efnis** (`mól leysts efnis`) | *uppleysts efnis*, the page prose in 3.3 and 11.4 |
| oxidizing / reducing agent | **oxari / afoxari** | *oxunarefni / afoxunarefni*, the approved glossary row and the 18.7 prose |
| significant figures | **markverðir stafir** | *markverðir tölustafir*, which chapter 1's equations showed |

[USER] accepted 231 proposals and wrote 19 values in their own wording. The own wordings that
carry terminology are:

- **útsveimshraði** (with an *s*) for *rate of effusion* / *effusion rate*: all 14 labels on 9.4 and 9.5. The proposal was *útsveimhraði*.
- **hvarf til hægri / hvarf til vinstri í skrefi 1** for *forward / reverse reaction of step 1* (12.6). The proposals were *framhvarf* and *afturábakhvarf*.
- **markv. stafir** as the abbreviation for *sig. figs.* (13.4).

A note on one label was taken as its answer: `(average) mileage` → *(meðal) eldsneytiseyðsla*, with a space.

## Reasoning

### Whole-leaf keys, not more phrase-dictionary entries
The phrase dictionary replaces words independently, so a word it knows inside a phrase it does
not know produces a mixed-language label. That is the mechanism behind the 42 half-translations.
A whole-leaf overlay key replaces the entire label before any word logic runs: `resolveLabel`
checks `overlay[label]` first. The application step also checked that the render-time phrase
pass rewrites no stored Icelandic value. The check's positive control is `unit of time` →
`unit of tími`, which it caught.

### Proposals were anchored on the page's own prose
Every proposal cited its source: the module's bought Icelandic MT, an approved glossary row, or
an earlier ruling. That way an equation agrees with the sentences around it. Where sources
disagreed across pages, the question went to [USER] once, as a family, instead of once per label.

### Two choices differ from approved glossary rows, deliberately
`reducing agent → afoxunarefni` is the approved glossary row, and [USER] chose *afoxari* (the
row's listed alternative) and *oxari* for equations, matching ch04's key terms.
`significant figures → markverðir stafir` *is* the approved row, so chapter 1's equation phrases
moved to it. Measured consequence: 11 chapter-1 leaves changed, and no other leaf did.

### Checked against the tree
On every chemistry equation leaf, through inject substitution, the render phrase pass and
decimal localization, comparing the data before and after the change: 370 ruled leaves reach
their ruled value, decimal commas included, and nothing outside the ruled set moved beyond the
named follow-ons. Applied in `5c5dc6d95`. The evidence (census, batches, answers, apply and
reach scripts) is off-repo in `~/.cache/namsbokasafn-audit/2026-10-09-c2-batch/label-rulings/`.

## Consequences

- Equation labels and running prose can now **differ** where the prose MT used another word:
  *katóða/anóða* against MT *bakskaut/forskaut*, *útsveimshraði* against MT *útstreymishraði*,
  *oxari* against 18.7's *oxunarefni*. Editors align the prose. This record does not change prose.
- The glossary still carries `reducing agent → afoxunarefni` as approved. **Equations follow
  this record; the glossary row is not changed by it.** Whether the glossary and house-style rows
  should follow is a separate terminology question, tracked in the register, not decided here.
- *útsveimshraði* is a [USER] coinage with no glossary row yet. The same applies to the bare
  *útsveim* form ruled on 2026-09-27.
- Reversing a value means editing its key in `math-label-map.json` and re-injecting. Keys must
  stay byte-identical to the source leaf, and five carry a non-breaking space.
- Readers see none of this until the whole-book re-inject and re-render. The register owns that timing.

## Alternatives considered

1. **More `equation-text.json` phrase entries** — rejected. The dictionary works word by word
   inside a leaf, which is the mechanism that produced the half-translations, and longest-first
   matching cannot protect a phrase from a shorter entry that matches part of it.
2. **Leave the labels English until editors reach them** — rejected. 42 were already
   half-translated, and the whole-book re-inject would otherwise run twice.
3. **The other option of each word family** (*uppleysts efnis*, *oxunarefni/afoxunarefni*,
   *markverðir tölustafir*) — presented with their consequences; [USER] chose as above.
