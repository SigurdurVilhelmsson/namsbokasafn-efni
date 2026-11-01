# Decision: antibonding orbital is *andtengisvigrúm*

- **Date:** 2026-11-01
- **Status:** Accepted
- **Context owners:** [USER] (the decision); [CODE] (the measurements and this record)
- **Supersedes:** none
- **Related:** `server/lib/houseStyleTerms.js` (the *antibonding orbital* entry, applied by migration 051);
  `experiments/terminology-consistency/results/2026-11-01/amendments-2026-11-01.json` (carries this into the AI
  pass's ruling set); the active register in `docs/plans/` (item (l) of its 2026-10-29 entry).

> **FROZEN EVIDENCE — banner-dated 2026-11-01.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

Once *bonding orbital* became *tengisvigrúm* (ruled 2026-10-11, kept 2026-10-29), what does *antibonding orbital*
become? The register carried it as item (l), open since 2026-10-29. The 2026-09-19 house-style entry for *bonding
orbital → bindandi svigrúm* had argued that antibonding needed no entry because the model writes *andbindandi*
unanimously; that argument ended with the reversal.

## Decision

*antibonding orbital → andtengisvigrúm*, one word, in both term sources: a house-style entry (the server's
glossary and the editors' checks) and a ruling in the AI pass's ruling set. Íðorðabankinn's chemistry row for the
adjective, *antibonding → andbindandi*, stays. [USER], 2026-11-01, choosing the recommended option of three
(the others: no antibonding row; or revisit *bindandi*/*andbindandi* against *tengjandi*/*andtengjandi* first).

## Reasoning

### It completes the 2026-10-11 ruling

The 2026-10-11 reversal wrote the bonding forms as one word throughout and kept *and-* for antibonding:
*σ-/π-tengisvigrúm*, *σ\*-/π\*-andtengisvigrúm*. The AI pass's ruling set already carries the σ\*/π\* forms
(`sigma-star-bonding-orbital`, `pi-star-bonding-orbital` in `ruling-set-2026-10-30.json`) but had no plain
*antibonding orbital*.

### The machine translation does not write it

Chemistry's committed MT (`books/efnafraedi-2e/02-mt-output/`, 177 segment files) writes *andbindandi* 39 times and
*andtengi-* 0 times (case-insensitive substring counts, 2026-11-01). Editors introduce the ruled form, as they do
*tengisvigrúm* (0 in the same MT, against *bindandi svigrúm* 51).

## Consequences

- The house-style entry is in `server/lib/houseStyleTerms.js` (PR #595); the ruling-set amendment gives the AI
  pass the same ruling, so the two term sources agree.
- The adjective *antibonding* keeps Íðorðabankinn's *andbindandi* in the glossary. Whether the adjective should
  follow is not decided here; [USER] noted on 2026-10-29 that *bindandi*/*andbindandi* may be revisited.

## Alternatives considered

1. **No antibonding row** — rejected: the model would keep writing *andbindandi svigrúm* beside the ruled
   *tengisvigrúm*.
2. **Revisit both stems first** (*tengjandi*/*andtengjandi*) — not chosen; it would have held the *bonding orbital*
   change too.
