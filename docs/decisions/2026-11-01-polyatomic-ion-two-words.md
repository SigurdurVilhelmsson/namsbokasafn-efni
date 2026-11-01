# Decision: polyatomic ion is *fjölatóma jón*, two words

- **Date:** 2026-11-01
- **Status:** Accepted
- **Context owners:** [USER] (the decision); [CODE] (the measurements and this record)
- **Supersedes:** the *polyatomic ion* row of `docs/decisions/2026-10-29-glossary-ruling-conflicts-resolved.md` (it
  ruled *fjölatómajón*, one word). Nothing else in that record changes.
- **Related:** `experiments/terminology-consistency/results/2026-11-01/amendments-2026-11-01.json` (carries this
  into the AI pass's ruling set); `server/scripts/set-book-term-preferences.js` (carries it into chemistry's term
  preferences); the active register in `docs/plans/`.

> **FROZEN EVIDENCE — banner-dated 2026-11-01.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

Which Icelandic does the chemistry book use for *polyatomic ion*? On 2026-10-29 [USER] kept the ruling
*fjölatómajón*, one word, against the glossary's *fjölfrumeinda jón*. Applying it to the server's term sources
needed a choice between minting the one-word form as a house-style concept and selecting a term the concept model
already holds, and that choice brought the ruling back to [USER].

## Decision

*polyatomic ion → fjölatóma jón*, two words. [USER], 2026-11-01: "My ruling on polyatomic ion was wrong. The correct
form is the two-word version."

## Reasoning

[USER] gave the correction without further reasons. The facts on the table when it was made, measured the same
morning:

### The two-word form is already in the official data

Íðorðabankinn's chemistry concept for *polyatomic ion* (production concept 4725, Íðorðabankinn id 931564) carries
*fjölfrumeinda jón* at rank 1 and *fjölatóma jón* at rank 2 (production term 11921). The one-word form is on no
concept. Read-only query on production's `sessions.db`, 2026-11-01.

### The machine translation already writes it

Chemistry's committed MT (`books/efnafraedi-2e/02-mt-output/`, 177 segment files) writes *fjölatóma jón* 24 times,
*fjölfrumeinda jón* once and *fjölatómajón* never (case-insensitive substring counts).

## Consequences

- In chemistry's term preferences, *polyatomic ion* selects the existing term *fjölatóma jón* (a
  `book_term_preference` row), not a new house-style concept.
- The AI pass's ruling set retargets *fjölatómajón* → *fjölatóma jón*, through a dated amendments file and a newly
  compiled set; the old target survives there as a competitor.
- The 2026-10-29 record's reasoning cites *fjölatómajón* as an example of carrying *atóm* into compounds (its entry
  rule 2). This record changes only *polyatomic ion*; *atomic orbital → atómsvigrúm* and the rest of that rule stand.
- Older artifacts that carry *fjölatómajón* (the 2026-10-10 verdicts, the 2026-10-11 to 2026-10-30 ruling sets, the
  2026-10-29 conflict answers) are evidence of what was ruled then and are not edited.

## Alternatives considered

1. **Keep *fjölatómajón* as a house-style entry** — the 2026-10-29 ruling as written. Withdrawn by [USER].
2. **Point a preference at *fjölatóma jón* while the ruling stayed one word** — rejected: the term sources and the
   AI pass's ruling set would then disagree about one headword.
