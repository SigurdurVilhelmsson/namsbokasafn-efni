# Decision: heat is ruled as a noun with four compounds of its own, and entry rule 1 is applied to five more rulings

- **Date:** 2026-10-29
- **Status:** Accepted
- **Context owners:** [USER] (every decision); [CODE] (the measurements and this record)
- **Supersedes:** none. It adds to `docs/decisions/2026-10-29-glossary-ruling-conflicts-resolved.md`, written earlier the same day.
- **Related:** `experiments/terminology-consistency/results/2026-10-29/amendments-2026-10-29.json` and `scope-exceptions-2026-10-29.json` (the inputs that carry it out); `experiments/terminology-consistency/results/2026-10-29/offer-diff-2026-10-29.{mjs,json}` (the measurement); the active register.

> **FROZEN EVIDENCE — banner-dated 2026-10-29.** This record is *evidence*, never status.
> It describes what was decided on that date and why. **If it disagrees with the active
> register in `docs/plans/`, the register wins** — this file is dated, the register is live.
> Do not sync it, do not update it, do not edit it. Supersede it instead.

## Question

Carrying out the conflict record retargeted *heat* from *varmi (q)* to *varmi*. That made the ruling matchable for
the first time, and a free measurement (the AI pass's own work list over every chapter) found it offered in 168
segments. Most are the noun, but about 15 are the verb (*heat the house*, *heat 1 kg*, where Icelandic uses *hita*),
and about 20 sit in compounds no ruling covered (*heat capacity*, *heat of combustion*, *heat transfer*, *heat
exchanger*). Separately, five rulings outside the 35 still carried a symbol or abbreviation in their target, which
the conflict record's entry rule 1 says does not belong in an entry. The questions: how to keep *heat* from being
suggested where *varmi* is wrong, and whether entry rule 1 applies beyond the 35.

## Decision

[USER], in the session on 2026-10-29:

1. ***heat* is restricted to the noun** (thermal energy), as *becquerel* was restricted to the unit the same day.
2. **Four heat compounds are ruled:** heat capacity *varmarýmd*; heat of combustion ***brunavarmi***; heat transfer
   *varmaflutningur*; heat exchanger *varmaskiptir*.
3. **Entry rule 1 is applied to five more rulings:** body-centered cubic solid *miðlægt teningslaga fast efni*;
   face-centered cubic solid *hliðlægt teningslaga fast efni*; gamma emission *gammaútgeislun*; half-life of a
   reaction *helmingunartími efnahvarfs*; standard hydrogen electrode *staðalvetnisraftroð*.

## Reasoning

### The glossaries (production's concept model, read-only, 2026-10-29)

- heat capacity: chemistry *varmarýmd* (EFNAFR 931396), and physics agrees. The MT already writes it with no
  competing form, so the ruling adds no suggestions of its own; it is there to shield *heat* inside the compound
  (the work list skips a shorter ruling inside a longer ruling's phrase).
- heat of combustion: no chemistry entry; physics *brennsluvarmi* (EDLISFR 323072). Chemistry has *combustion →
  bruni*, and the MT never writes *brennslu-*. In its 8 segments the MT split *brunavarmi*, *brunahiti* and
  *brunavermi*, and *brunavermi* is enthalpy of combustion (chemistry *enthalpy → vermi*): it confuses heat with
  enthalpy. [USER] chose *brunavarmi*: entry rule 2's consistency exception (the book's *bruni*) over the physics
  glossary.
- heat transfer *varmaflutningur* and heat exchanger *varmaskiptir*: physics, as entry rule 2 prescribes where
  chemistry has no entry.
- gamma emission: no chemistry entry; physics *gammaútgeislun* first, *gammageislun* second (EDLISFR 324535). The
  one-word form matches *alfasundrun* and *betasundrun*.

### Why the trims are worth five lines

The five targets were unmatchable only because of the parenthetical. They occur about 14 times in the English;
*standard hydrogen electrode* alone has 7 uses, and the MT never writes *staðalvetnisraftroð*. A set that trims six
symbols and leaves five others would also be inconsistent with its own rule. *Secondary quantum number*'s
*(hverfiþungi)* is an alternative term, not a symbol, and stays.

### Entry rule 3 needs no change

The gate's matcher accepts any ending on a target word (*lotukerfið* counts as present in *lotukerfi* and
*lotukerfinu*), so a definite or lemma target changes no offer, only the wording the model is shown. The remaining
definite targets (named laws, theories and series) follow the reasoning [USER] gave for *lotukerfið*.

## Consequences

- The ruling set takes these through the same amendments input as the conflict record; each amendment cites this
  record.
- *heat*'s sense restriction means an edit is admitted only where the model declares the noun sense.
- The same targets belong in the server's term sources where those hold them; that work is tracked in the register.
- Reversing a single ruling means a new record that supersedes this one for that term.

## Alternatives considered

1. **heat of combustion → *brennsluvarmi*** (the physics glossary). Rejected by [USER] for consistency with
   *bruni*, which the MT also uses throughout.
2. **Leave *heat* unrestricted.** Rejected: the verb uses would receive *varmi* suggestions that editors must
   reject one by one.
3. **Apply entry rule 1 only to the 35.** Rejected: the cost is five lines and the rule would hold for part of the
   set only.
