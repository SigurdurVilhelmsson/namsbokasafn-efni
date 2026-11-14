# Decision: who may correct a glossary translation in place — its proposer until it is approved, a head editor while it is not approved, nobody once it is approved

- **Date:** 2026-11-14
- **Status:** Accepted
- **Context owners:** [USER] (answered 2026-11-14, "I accept your text strings and recommendation", to a question
  that stated three options and recommended the first)
- **Supersedes:** none
- **Related:**
  - the 2026-11-13 interface audit of Ritstjóri, finding TE-01 (Orðasafn's "Breyta orðhausu" showed a
    translation's fields as editable and saved none of them);
  - `docs/decisions/2026-11-14-interface-audit-answers.md` (the same day's other answers);
  - `server/services/terminologyService.js` (`correctTranslation`) and
    `server/__tests__/glossaryTranslationCorrection.test.js`, which hold the rule as built.

> **FROZEN EVIDENCE — banner-dated 2026-11-14.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

TE-01's fix was to save the dialog's translation fields through the route that already exists,
`PUT /api/terminology/translations/:id`. That route let any editor change the text of any translation, an
approved one included, with no change of status, and the dialog showed the first translation, which is the
approved one whenever there is one. Wiring the dialog to it as it was would have let an editor change an approved
term with no review. Who may correct a translation in place, and does a change to an approved one need approving
again?

## Decision

- The person who proposed a translation may correct it until it is approved.
- A head editor or an admin may correct any translation that is not approved.
- Nobody corrects an approved translation in place. A correction of an approved term is a new proposal
  ("Bæta við þýðingu"), which is approved like any other.
- The server enforces this. The page offers a correction only where the server would accept it.

## Reasoning

- A teacher can fix their own typo before it is reviewed, which is what TE-01 was about.
- An approved term reaches the glossary that feeds the machine translation and the rendered pages, so it should
  not change without someone approving the change.
- A head editor may already approve or reject any translation; correcting an unapproved one before approving it
  is within that.

## Consequences

- An approved translation can be changed only by proposing a new one and approving it. The old approved row stays
  until a head editor deals with it; this decision does not say how two approved rows for one headword are
  reconciled.
- A correction keeps the translation's status, so a rejected or disputed translation stays so after its proposer
  corrects it.
- A correction by its proposer is checked against the session's account id. The stored id is now written as text;
  a numeric id used to be stored as a float ("4242.0") and would not have matched. Microsoft account ids are
  strings, so production rows were not affected.

## Alternatives considered

1. **A head editor may also edit an approved translation in place** — rejected: an approved term would change with
   no second reader.
2. **Any editor may edit any translation** (the route's behaviour before) — rejected: anyone could change an
   approved term with no review.
